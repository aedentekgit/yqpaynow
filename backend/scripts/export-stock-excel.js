/**
 * Export Stock Data to Excel
 * 
 * Usage: node scripts/export-stock-excel.js <date> [theaterId]
 * Example: node scripts/export-stock-excel.js 2025-11-02
 */

const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aedentekuiuxdesigner:Aedentek%40123%23@cluster0.vrj9qje.mongodb.net/yqpay';

async function exportStockToExcel() {
  try {
    // Get arguments
    const dateArg = process.argv[2];
    const theaterIdArg = process.argv[3] || '68f8837a541316c6ad54b79f';

    if (!dateArg) {
      process.exit(1);
    }

    // Parse date
    const selectedDate = new Date(dateArg);
    const dateString = selectedDate.toISOString().split('T')[0];
    const selectedMonth = selectedDate.getMonth() + 1;
    const selectedYear = selectedDate.getFullYear();
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[selectedMonth];
    

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const theaterId = new mongoose.Types.ObjectId(theaterIdArg);

    // Get products for this theater
    const productDoc = await db.collection('productlist').findOne({
      theater: theaterId
    });

    if (!productDoc || !productDoc.productList || productDoc.productList.length === 0) {
      process.exit(0);
    }

    const products = productDoc.productList.sort((a, b) => 
      (a.productName || '').localeCompare(b.productName || '')
    );

    // Get monthly stock data
    const monthlyStocks = await db.collection('monthlystocks').find({
      theaterId: theaterId,
      year: selectedYear,
      monthNumber: selectedMonth
    }).toArray();

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock Report');

    // Set column widths
    worksheet.columns = [
      { key: 'sno', width: 8 },
      { key: 'productName', width: 30 },
      { key: 'date', width: 15 },
      { key: 'stockAdded', width: 12 },
      { key: 'expiredOld', width: 15 },
      { key: 'carryForward', width: 15 },
      { key: 'usedStock', width: 12 },
      { key: 'expiredStock', width: 15 },
      { key: 'damageStock', width: 15 },
      { key: 'balance', width: 12 }
    ];

    // Add title
    worksheet.mergeCells('A1:J1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Stock Report - ${dateString}`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7c3aed' }
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Add subtitle
    worksheet.mergeCells('A2:J2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `${monthName} ${selectedYear}`;
    subtitleCell.font = { size: 12, bold: true };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 25;

    // Add headers
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      'S.NO',
      'PRODUCT NAME',
      'DATE',
      'STOCK ADDED',
      'EXPIRED OLD STOCK',
      'CARRY FORWARD',
      'USED STOCK',
      'EXPIRED STOCK',
      'DAMAGE STOCK',
      'BALANCE'
    ];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7c3aed' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Add data rows
    let rowIndex = 4;
    let sno = 1;
    let totalStockAdded = 0;
    let totalExpiredOld = 0;
    let totalCarryForward = 0;
    let totalUsed = 0;
    let totalExpired = 0;
    let totalDamage = 0;
    let totalBalance = 0;

    for (const product of products) {
      const productId = product._id.toString();
      const productName = product.productName || product.name || 'Unknown';

      // Find stock record for this product
      const stockDoc = monthlyStocks.find(s => 
        s.productId && s.productId.toString() === productId
      );

      let stockAdded = 0;
      let expiredOld = 0;
      let carryForward = 0;
      let usedStock = 0;
      let expiredStock = 0;
      let damageStock = 0;
      let balance = 0;

      if (stockDoc && stockDoc.stockDetails) {
        const stockDetail = stockDoc.stockDetails.find(detail => {
          const detailDate = new Date(detail.date).toISOString().split('T')[0];
          return detailDate === dateString;
        });

        if (stockDetail) {
          stockAdded = stockDetail.stockAdded || 0;
          expiredOld = stockDetail.expiredOldStock || 0;
          carryForward = stockDetail.carryForward || 0;
          usedStock = stockDetail.usedStock || 0;
          expiredStock = stockDetail.expiredStock || 0;
          damageStock = stockDetail.damageStock || 0;
          balance = stockDetail.balance || 0;

          totalStockAdded += stockAdded;
          totalExpiredOld += expiredOld;
          totalCarryForward += carryForward;
          totalUsed += usedStock;
          totalExpired += expiredStock;
          totalDamage += damageStock;
          totalBalance += balance;
        }
      }

      const dataRow = worksheet.getRow(rowIndex);
      dataRow.values = [
        sno,
        productName,
        dateString,
        stockAdded,
        expiredOld,
        carryForward,
        usedStock,
        expiredStock,
        damageStock,
        balance
      ];

      // Alternate row colors
      if (rowIndex % 2 === 0) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' }
        };
      }

      dataRow.alignment = { vertical: 'middle' };
      dataRow.getCell(1).alignment = { horizontal: 'center' };
      dataRow.getCell(3).alignment = { horizontal: 'center' };
      dataRow.getCell(4).alignment = { horizontal: 'right' };
      dataRow.getCell(5).alignment = { horizontal: 'right' };
      dataRow.getCell(6).alignment = { horizontal: 'right' };
      dataRow.getCell(7).alignment = { horizontal: 'right' };
      dataRow.getCell(8).alignment = { horizontal: 'right' };
      dataRow.getCell(9).alignment = { horizontal: 'right' };
      dataRow.getCell(10).alignment = { horizontal: 'right' };

      rowIndex++;
      sno++;
    }

    // Add total row
    const totalRow = worksheet.getRow(rowIndex);
    totalRow.values = [
      '',
      'TOTAL',
      '',
      totalStockAdded,
      totalExpiredOld,
      totalCarryForward,
      totalUsed,
      totalExpired,
      totalDamage,
      totalBalance
    ];
    totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7c3aed' }
    };
    totalRow.alignment = { vertical: 'middle' };
    totalRow.getCell(2).alignment = { horizontal: 'center' };
    totalRow.getCell(4).alignment = { horizontal: 'right' };
    totalRow.getCell(5).alignment = { horizontal: 'right' };
    totalRow.getCell(6).alignment = { horizontal: 'right' };
    totalRow.getCell(7).alignment = { horizontal: 'right' };
    totalRow.getCell(8).alignment = { horizontal: 'right' };
    totalRow.getCell(9).alignment = { horizontal: 'right' };
    totalRow.getCell(10).alignment = { horizontal: 'right' };

    // Add borders to all cells
    for (let i = 3; i <= rowIndex; i++) {
      const row = worksheet.getRow(i);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // Save file
    const fileName = `Stock_Report_${dateString}.xlsx`;
    const filePath = path.join(__dirname, '..', fileName);
    
    await workbook.xlsx.writeFile(filePath);


    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
exportStockToExcel();
