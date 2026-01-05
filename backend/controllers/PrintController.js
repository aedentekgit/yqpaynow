// controllers/PrintController.js
const BaseController = require('./BaseController');
// const printer = require('pdf-to-printer'); // Lazy loaded to prevent crash on Linux/Cloud Run
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { loadPrinterFormatConfig } = require('../utils/printerFormatConfig');

/**
 * Print Controller
 * Handles direct printing to printers (regular/silent printing via WebSocket)
 */
class PrintController extends BaseController {
  /**
   * Generate HTML content for receipt
   */
  static generateBillHTML(billData = {}, theaterInfo = null) {
    // Load printer format configuration
    const format = loadPrinterFormatConfig();

    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const formatTheaterAddress = () => {
      if (!theaterInfo || !theaterInfo.address) return 'N/A';
      const addr = theaterInfo.address || {};
      const parts = [
        addr.street,
        addr.city,
        addr.state,
        addr.zipCode,
        addr.country
      ].filter(Boolean);
      return parts.join(', ') || 'N/A';
    };

    const items = billData.items || billData.products || [];
    const tax = Number(billData.tax ?? billData.pricing?.tax ?? billData.pricing?.gst ?? billData.gst ?? 0);
    const discount = Number(billData.discount ?? billData.pricing?.totalDiscount ?? billData.pricing?.discount ?? billData.pricing?.discountAmount ?? billData.totalDiscount ?? 0);
    const grandTotal = Number(billData.grandTotal ?? billData.total ?? billData.pricing?.total ?? billData.totalAmount ?? 0);

    // Calculate subtotal as Grand Total - GST (without GST)
    const subtotal = grandTotal - tax;
    // Split GST into CGST and SGST (50/50)
    const cgst = tax / 2;
    const sgst = tax / 2;

    // Build items rows HTML safely (simple approach)
    const itemsHtml = items.map(item => {
      const qty = Number(item.quantity ?? 1);
      const rate = Number(item.unitPrice ?? item.price ?? item.rate ?? 0);
      const total = Number(item.totalPrice ?? item.total ?? (qty * rate));
      let name = item.productName ?? item.menuItem?.name ?? item.name ?? 'Item';
      const size = item.size ?? item.productSize ?? item.variant?.option ?? (item.variants && item.variants[0]?.option) ?? null;
      if (size) name = `${name} (${size})`;
      // Escape basic characters (minimal)
      const safeName = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return `
        <tr>
          <td style="padding:4px 0; vertical-align:top;">${safeName}</td>
          <td style="text-align:${format.table.qtyAlign}; padding:4px 0;">${qty}</td>
          <td style="text-align:${format.table.rateAlign}; padding:4px 0;">₹${rate.toFixed(2)}</td>
          <td style="text-align:${format.table.totalAlign}; padding:4px 0;">₹${total.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt - ${String(billData.billNumber || billData.orderNumber || 'N/A')}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @media print { @page { margin: ${format.page.margin}; size: ${format.page.width} auto; } }
          body { 
            font-family: ${format.fonts.family}; 
            max-width: ${format.page.maxWidth}; 
            margin: 0 auto; 
            padding: ${format.page.padding === '8px' ? '6px' : format.page.padding}; 
            font-size: ${format.fonts.bodySize}; 
            line-height: ${format.fonts.lineHeight}; 
            background: ${format.colors.background}; 
            color: ${format.colors.text}; 
          }
          .center { text-align: ${format.header.textAlign}; }
          .header { 
            border-bottom: ${format.header.borderBottom}; 
            padding-bottom: ${format.header.paddingBottom}; 
            margin-bottom: ${format.header.marginBottom}; 
          }
          .title { 
            font-size: ${format.fonts.headerTitleSize}; 
            font-weight: 700; 
            color: ${format.colors.headerTitle}; 
            margin-bottom: ${format.header.titleMarginBottom};
          }
          .subtitle { 
            font-size: ${format.fonts.headerSubtitleSize}; 
            color: ${format.colors.headerSubtitle}; 
            margin-top: 4px; 
            line-height: ${format.fonts.lineHeight}; 
          }
          .info { 
            border-bottom: ${format.info.borderBottom}; 
            padding: ${format.info.padding}; 
            margin-bottom: ${format.info.marginBottom}; 
            font-size: ${format.fonts.infoSize}; 
          }
          .info-row { 
            display: flex; 
            justify-content: space-between; 
            margin-bottom: ${format.info.rowMarginBottom}; 
          }
          table { 
            width: ${format.table.width}; 
            border-collapse: collapse; 
            font-size: ${format.fonts.bodySize}; 
          }
          th, td { padding: ${format.table.cellPadding}; }
          thead th { 
            text-align: ${format.table.itemAlign}; 
            border-bottom: ${format.table.headerBorderBottom}; 
            font-weight: ${format.table.headerFontWeight}; 
            font-size: ${format.fonts.tableHeaderSize}; 
          }
          .right { text-align: ${format.table.rateAlign}; }
          .center-col { text-align: ${format.table.qtyAlign}; }
          .summary { 
            border-top: ${format.summary.borderTop}; 
            padding-top: ${format.summary.paddingTop}; 
            margin-top: ${format.summary.marginTop}; 
            font-size: ${format.fonts.summarySize}; 
          }
          .summary-row { 
            display: flex; 
            justify-content: space-between; 
            margin-bottom: ${format.summary.rowMarginBottom}; 
          }
          .total { 
            display: flex; 
            justify-content: space-between; 
            font-weight: ${format.summary.totalFontWeight}; 
            font-size: ${format.fonts.totalSize}; 
            border-top: ${format.summary.totalBorderTop}; 
            padding-top: ${format.summary.totalPaddingTop}; 
            margin-top: ${format.summary.totalMarginTop}; 
            color: ${format.colors.total}; 
          }
          .footer { 
            text-align: ${format.footer.textAlign}; 
            margin-top: ${format.footer.marginTop}; 
            border-top: ${format.footer.borderTop}; 
            padding-top: ${format.footer.paddingTop}; 
            font-size: ${format.fonts.footerSize}; 
            color: ${format.colors.footer}; 
          }
        </style>
      </head>
      <body>
        <div class="header center">
          <div class="title">${theaterInfo?.name ?? 'Theater Name'}</div>
          <div class="subtitle">
            ${theaterInfo?.address ? formatTheaterAddress() + '<br>' : ''}
            ${theaterInfo?.phone ? 'Phone: ' + theaterInfo.phone + '<br>' : ''}
            ${theaterInfo?.email ? 'Email: ' + theaterInfo.email + '<br>' : ''}
            ${theaterInfo?.gstNumber ? 'GST: ' + theaterInfo.gstNumber + '<br>' : ''}
          </div>
        </div>

        <div class="info">
          <div class="info-row"><div><strong>Invoice:</strong></div><div>${billData.billNumber || billData.orderNumber || 'N/A'}</div></div>
          <div class="info-row"><div><strong>Date:</strong></div><div>${formatDate(billData.date || billData.createdAt)}</div></div>
          <div class="info-row"><div><strong>Customer:</strong></div><div>${billData.customerName || billData.customerInfo?.name || 'Walk-in'}</div></div>
          ${billData.paymentMethod ? `<div class="info-row"><div><strong>Payment:</strong></div><div>${String(billData.paymentMethod).toUpperCase()}</div></div>` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:${format.table.itemColumnWidth};">Item</th>
              <th style="width:${format.table.qtyColumnWidth};" class="center-col">Qty</th>
              <th style="width:${format.table.rateColumnWidth};" class="right">Rate</th>
              <th style="width:${format.table.totalColumnWidth};" class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || `<tr><td colspan="4" style="padding:6px 0;">No items</td></tr>`}
          </tbody>
        </table>

        <div class="summary">
          ${subtotal > 0 ? `<div class="summary-row"><div>Subtotal</div><div>₹${subtotal.toFixed(2)}</div></div>` : ''}
          ${tax > 0 ? `<div class="summary-row"><div>CGST</div><div>₹${cgst.toFixed(2)}</div></div><div class="summary-row"><div>SGST</div><div>₹${sgst.toFixed(2)}</div></div>` : ''}
          ${discount > 0 ? `<div class="summary-row"><div>Discount</div><div>-₹${discount.toFixed(2)}</div></div>` : ''}
          <div class="total"><div>Grand Total</div><div>₹${grandTotal.toFixed(2)}</div></div>
        </div>

        <div class="footer">
          <div>Thank you for your order!</div>
          <div>By YQPayNow</div>
          <div style="margin-top:${format.spacing.sectionMargin};">Generated on ${new Date().toLocaleString('en-IN')}</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate PDF from HTML using puppeteer or fallback method
   */
  static async generatePDF(htmlContent) {
    try {
      // Try to use puppeteer if available
      try {
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });
        await browser.close();

        // Save to temp file
        const tempDir = path.join(__dirname, '../temp');
        await fs.mkdir(tempDir, { recursive: true });
        const pdfPath = path.join(tempDir, `receipt-${Date.now()}.pdf`);
        await fs.writeFile(pdfPath, pdfBuffer);
        return pdfPath;
      } catch (puppeteerError) {
        console.warn('⚠️  Puppeteer not available:', puppeteerError?.message || puppeteerError);
        // Fallback: On Windows attempt to open HTML (best-effort); otherwise instruct install
        if (process.platform === 'win32') {
          const tempDir = path.join(__dirname, '../temp');
          await fs.mkdir(tempDir, { recursive: true });
          const htmlPath = path.join(tempDir, `receipt-${Date.now()}.html`);
          await fs.writeFile(htmlPath, htmlContent);

          try {
            // Open the HTML file (this will open in default browser). This is a best-effort fallback.
            await execAsync(`start /min "" "${htmlPath}"`);
            // Schedule cleanup
            setTimeout(async () => {
              await fs.unlink(htmlPath).catch(() => { });
            }, 5000);
            throw new Error('Puppeteer is required for proper PDF generation/printing. Install with: npm install puppeteer');
          } catch (execError) {
            // Clean up and rethrow a clearer error
            await fs.unlink(htmlPath).catch(() => { });
            throw new Error('PDF generation requires puppeteer. Install with: npm install puppeteer');
          }
        } else {
          throw new Error('PDF generation requires puppeteer. Install with: npm install puppeteer');
        }
      }
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      throw error;
    }
  }

  /**
   * POST /api/print/bill
   * Print bill to regular printer (PDF)
   */
  static async printBill(req, res) {
    try {
      // Lazy load printer to prevent crash on non-Windows systems during startup
      let printer;
      try {
        printer = require('pdf-to-printer');
      } catch (e) {
        console.warn('⚠️ pdf-to-printer not available:', e.message);
      }

      const { billData, theaterInfo, printerName } = req.body;

      if (!billData) {
        return BaseController.error(res, 'Bill data is required', 400);
      }

      // Generate HTML content
      const htmlContent = PrintController.generateBillHTML(billData, theaterInfo);

      // Generate PDF
      const pdfPath = await PrintController.generatePDF(htmlContent);

      try {
        // Print to default printer or specified printer
        // Print to default printer or specified printer
        const printOptions = printerName ? { printer: printerName } : {}; // Guessing logic here

        if (!printer) {
          throw new Error('Local printing not supported on this server (requires Windows/pdf-to-printer). Use Cloud Print.');
        }

        await printer.print(pdfPath, printOptions);

        // Clean up temp file
        await fs.unlink(pdfPath).catch(() => { });

        return BaseController.success(res, { printed: true }, 'Bill printed successfully');
      } catch (printError) {
        // Clean up temp file even on error
        await fs.unlink(pdfPath).catch(() => { });
        console.error('❌ Print error:', printError);
        throw printError;
      }
    } catch (error) {
      console.error('❌ Print bill error:', error);
      return BaseController.error(res, `Failed to print bill: ${error.message}`, 500);
    }
  }

  /**
   * POST /api/print/receipt
   * Auto-detect printer type and print (smart print)
   */
  static async printReceipt(req, res) {
    try {
      const { billData, theaterInfo, printerType, printerConfig, theaterId, printerName, orderType } = req.body;

      const targetPrinterName = printerName || printerConfig?.printerName || null;

      console.log(`🖨️ [PrintReceipt] Received print request:`, {
        hasBillData: !!billData,
        theaterId: theaterId || theaterInfo?._id || theaterInfo?.id,
        printerType: printerType || 'regular',
        printerName: targetPrinterName || 'default',
        orderType: orderType || 'unknown'
      });

      if (!billData) {
        console.error('❌ [PrintReceipt] Missing billData');
        return BaseController.error(res, 'Bill data is required', 400);
      }

      // Try Cloud Print first if theaterId is provided
      const cloudPrintService = require('../services/cloud-print-service');
      const targetTheaterId = theaterId || theaterInfo?._id || theaterInfo?.id;

      if (targetTheaterId) {
        const theaterIdStr = String(targetTheaterId);
        try {
          const isConnected = cloudPrintService.isClientConnected(theaterIdStr);

          if (isConnected) {
            // Prepare orderData
            const orderData = {
              _id: billData.orderNumber || billData.billNumber,
              orderNumber: billData.orderNumber || billData.billNumber,
              createdAt: billData.date || billData.createdAt || new Date(),
              customerInfo: {
                name: billData.customerName || billData.customerInfo?.name,
                phone: billData.customerInfo?.phone
              },
              items: (billData.items || billData.products || []).map(item => ({
                name: item.name || item.productName,
                productName: item.productName || item.name,
                quantity: item.quantity || 1,
                price: item.price || item.unitPrice || 0,
                unitPrice: item.unitPrice || item.price || 0,
                originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option || (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
                size: item.size || null,
                productSize: item.productSize || null,
                sizeLabel: item.sizeLabel || null,
                variant: item.variant || null
              })),
              total: billData.grandTotal || billData.total || 0,
              pricing: billData.pricing || {
                total: billData.grandTotal || billData.total || 0,
                subtotal: billData.subtotal || 0,
                tax: billData.tax || 0,
                discount: billData.discount || 0
              },
              paymentMethod: billData.paymentMethod,
              theaterName: theaterInfo?.name || 'Theater'
            };

            console.log(`📤 [PrintReceipt] Sending print job to Cloud Print:`, {
              orderNumber: orderData.orderNumber,
              itemsCount: orderData.items.length,
              total: orderData.total,
              printerName: targetPrinterName || 'default'
            });

            const result = await cloudPrintService.queuePrint(theaterIdStr, orderData, targetPrinterName, theaterInfo);


            if (result?.success) {
              return BaseController.success(res, {
                printed: true,
                method: 'cloud-print',
                message: 'Print job sent to Cloud Print client'
              }, 'Receipt sent to Cloud Print successfully');
            } else if (result?.queued) {
              return BaseController.success(res, {
                queued: true,
                method: 'cloud-print',
                message: 'Print job queued (client will receive when connected)'
              }, 'Print job queued for Cloud Print');
            } else {
              console.warn('⚠️ [PrintReceipt] Cloud Print returned failure or no response, falling back to local printing');
            }
          } else {
          }
        } catch (cloudPrintError) {
          console.error('❌ [PrintReceipt] Cloud Print error:', cloudPrintError?.message || cloudPrintError);
          // Continue to fallback printing
        }
      } else {
      }

      // Fallback to regular printing (silent printer via WebSocket)

      // Ensure puppeteer is available for regular printing
      try {
        require.resolve('puppeteer');
      } catch (puppeteerError) {
        console.error('❌ [PrintReceipt] Puppeteer not installed, cannot use regular printing');
        return BaseController.error(res,
          'Cloud Print client is not connected and puppeteer is not installed. Please either: 1) Open Cloud Print Client page with your Theater ID, or 2) Install puppeteer: npm install puppeteer',
          503
        );
      }

      // Use regular printing (silent printer)
      return await PrintController.printBill(req, res);
    } catch (error) {
      console.error('❌ [PrintReceipt] Print receipt error:', error);
      return BaseController.error(res, `Failed to print receipt: ${error?.message || error}`, 500);
    }
  }
}

module.exports = PrintController;
