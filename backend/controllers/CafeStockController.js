const BaseController = require('./BaseController');
const cafeStockService = require('../services/CafeStockService');
const CafeMonthlyStock = require('../models/CafeMonthlyStock');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

/**
 * Cafe Stock Controller
 */
class CafeStockController extends BaseController {
  /**
   * GET /api/cafe-stock/sales-report/:theaterId
   * Get sales report data as JSON (for PDF generation)
   */
  static async getSalesReportData(req, res) {
    try {
      const { theaterId } = req.params;
      let { startDate, endDate, year, month } = req.query;

      // Determine date range for cafe stock data
      const currentDate = new Date();
      let targetYear, targetMonth;

      if (year && month) {
        targetYear = parseInt(year);
        targetMonth = parseInt(month);
      } else if (startDate && endDate) {
        const start = new Date(startDate);
        targetYear = start.getFullYear();
        targetMonth = start.getMonth() + 1;
      } else {
        targetYear = currentDate.getFullYear();
        targetMonth = currentDate.getMonth() + 1;
      }

      // Parse date range for filtering
      let filterStartDate = null;
      let filterEndDate = null;

      if (startDate && endDate) {
        filterStartDate = new Date(startDate);
        filterStartDate.setHours(0, 0, 0, 0);
        filterEndDate = new Date(endDate);
        filterEndDate.setHours(23, 59, 59, 999);
      }

      // Get all products for the theater
      const productContainer = await mongoose.connection.db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        productList: { $exists: true }
      });

      if (!productContainer || !productContainer.productList || productContainer.productList.length === 0) {
        return BaseController.error(res, 'No products found for this theater', 404);
      }

      const products = productContainer.productList || [];

      // Get cafe monthly stock documents for all products
      const monthlyStockDocs = await CafeMonthlyStock.find({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        year: targetYear,
        monthNumber: targetMonth
      }).lean();

      // Create a map of productId to product info
      const productMap = {};
      products.forEach(product => {
        if (product._id) {
          productMap[product._id.toString()] = product;
        }
      });

      // Aggregate sales by product with date filtering
      const salesData = [];

      monthlyStockDocs.forEach((monthlyDoc) => {
        const productId = monthlyDoc.productId?.toString();
        const product = productMap[productId];

        if (!product) return;

        const productName = product.name || 'Unknown Product';
        const productPrice = product.pricing?.basePrice || product.sellingPrice || 0;

        let totalSales = 0;

        // Filter by date range if provided
        if (filterStartDate && filterEndDate && monthlyDoc.stockDetails) {
          monthlyDoc.stockDetails.forEach(entry => {
            const entryDate = new Date(entry.date);
            entryDate.setHours(0, 0, 0, 0);

            if (entryDate >= filterStartDate && entryDate <= filterEndDate) {
              totalSales += (entry.sales || 0);
            }
          });
        } else {
          totalSales = monthlyDoc.totalSales || 0;
        }

        if (totalSales > 0) {
          salesData.push({
            productName,
            quantity: totalSales,
            unitPrice: productPrice,
            totalPrice: totalSales * productPrice,
            productId: product._id
          });
        }
      });

      return BaseController.success(res, {
        salesData,
        targetYear,
        targetMonth,
        filterStartDate: filterStartDate ? filterStartDate.toISOString() : null,
        filterEndDate: filterEndDate ? filterEndDate.toISOString() : null
      });

    } catch (error) {
      console.error('❌ Error in sales report data:', error);
      return BaseController.error(res, 'Failed to generate sales report data', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/cafe-stock/:theaterId/:productId
   */
  static async getMonthlyStock(req, res) {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const { theaterId, productId } = req.params;
      const { year, month } = req.query;

      // Fetch monthly cafe stock document
      const monthlyDoc = await cafeStockService.getMonthlyStock(
        theaterId,
        productId,
        year,
        month
      );

      // 🔥 FIX: Fetch product information to include in response
      let product = null;
      try {
        // Try to get product from array structure (new)
        const productContainer = await mongoose.connection.db.collection('productlist').findOne({
          theater: new mongoose.Types.ObjectId(theaterId),
          'productList._id': new mongoose.Types.ObjectId(productId)
        });

        if (productContainer && productContainer.productList) {
          product = productContainer.productList.find(
            p => p._id.toString() === productId
          );
        }

        // Fallback: Try individual product document (old structure)
        if (!product) {
          const Product = require('../models/Product');
          product = await Product.findOne({
            _id: new mongoose.Types.ObjectId(productId),
            theater: new mongoose.Types.ObjectId(theaterId)
          }).lean();
        }

        if (product) {
        } else {
          console.warn(`⚠️ [CafeStockController] Product not found: ${productId}`);
        }
      } catch (productError) {
        console.error('Error fetching product for cafe stock:', productError);
        // Continue without product data - don't fail the request
      }

      // Return response with both cafe stock data and product information
      const response = {
        ...monthlyDoc,
        product: product ? {
          _id: product._id,
          name: product.name,
          stockQuantity: product.inventory?.currentStock || product.stockQuantity || 0,
          unitOfMeasure: product.inventory?.unit || product.unitOfMeasure || 'Piece'
        } : null
      };

      return BaseController.success(res, response);
    } catch (error) {
      console.error('Get cafe monthly stock error:', error);
      return BaseController.error(res, 'Failed to fetch cafe stock', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/cafe-stock/:theaterId/:productId
   */
  static async addStockEntry(req, res) {
    try {
      const { theaterId, productId } = req.params;

      const monthlyDoc = await cafeStockService.addStockEntry(
        theaterId,
        productId,
        req.body
      );

      return BaseController.success(res, monthlyDoc, 'Cafe stock entry added successfully');
    } catch (error) {
      console.error('Add cafe stock entry error:', error);
      return BaseController.error(res, 'Failed to add cafe stock entry', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/cafe-stock/:theaterId/:productId/:entryId
   */
  static async updateStockEntry(req, res) {
    try {
      const { theaterId, productId, entryId } = req.params;

      const monthlyDoc = await cafeStockService.updateStockEntry(
        theaterId,
        productId,
        entryId,
        req.body
      );

      return BaseController.success(res, monthlyDoc, 'Cafe stock entry updated successfully');
    } catch (error) {
      console.error('Update cafe stock entry error:', error);
      if (error.message === 'Monthly document not found' || error.message === 'Stock entry not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update cafe stock entry', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/cafe-stock/:theaterId/:productId/:entryId
   */
  static async deleteStockEntry(req, res) {
    try {
      const { theaterId, productId, entryId } = req.params;

      const monthlyDoc = await cafeStockService.deleteStockEntry(
        theaterId,
        productId,
        entryId
      );

      return BaseController.success(res, monthlyDoc, 'Cafe stock entry deleted successfully');
    } catch (error) {
      console.error('Delete cafe stock entry error:', error);
      if (error.message === 'Monthly document not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete cafe stock entry', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/cafe-stock/excel-all/:theaterId
   * Export all cafe stock management data for all products in a theater to Excel
   */
  static async exportAllExcel(req, res) {
    try {
      const { theaterId } = req.params;
      const { year, month, date } = req.query; // Add date parameter for specific date filtering

      const currentDate = new Date();
      const targetYear = year ? parseInt(year) : currentDate.getFullYear();
      const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;

      // Parse specific date if provided (format: YYYY-MM-DD)
      let targetDate = null;
      if (date) {
        targetDate = new Date(date);
        // Validate date
        if (isNaN(targetDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid date format. Expected YYYY-MM-DD'
          });
        }
        // Set time to start of day for accurate comparison
        targetDate.setHours(0, 0, 0, 0);
      }

      // Get all products for the theater
      const productContainer = await mongoose.connection.db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        productList: { $exists: true }
      });

      let products = [];
      if (productContainer && productContainer.productList) {
        products = productContainer.productList || [];
      }

      if (!products || products.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No products found for this theater'
        });
      }

      // Get categories to create category map
      const Category = require('../models/Category');
      const categoryContainer = await Category.findOne({
        theater: new mongoose.Types.ObjectId(theaterId)
      }).lean();

      const categoryMap = {};
      if (categoryContainer && categoryContainer.categoryList) {
        categoryContainer.categoryList.forEach(cat => {
          if (cat._id) {
            categoryMap[cat._id.toString()] = {
              name: cat.categoryName || cat.name || 'Uncategorized',
              sortOrder: cat.sortOrder || 0
            };
          }
        });
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Cafe Stock Management');

      // Month names
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Title row - 15 columns: S.No, Product Name, Date, Old Stock, Invord Stock, Direct Stock, Sales, Addon, Stock Adjustment, Cancel Stock, Expired Stock, Damage Stock, Balance, Type, Unit
      worksheet.mergeCells('A1:O1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Cafe Stock Management Report';
      titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(1).height = 30;

      // Subtitle row
      worksheet.mergeCells('A2:O2');
      const subtitleCell = worksheet.getCell('A2');
      // ✅ FIX: Show specific date when filtering by date, otherwise show month
      if (targetDate) {
        const dateDay = String(targetDate.getDate()).padStart(2, '0');
        const dateMonth = monthNames[targetDate.getMonth()];
        subtitleCell.value = `${dateDay} ${dateMonth} ${targetDate.getFullYear()}`;
      } else {
        subtitleCell.value = `${monthNames[targetMonth - 1]} ${targetYear}`;
      }
      subtitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      subtitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }
      };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      subtitleCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(2).height = 25;

      // Generation Date & Time row - Match Excel image format exactly
      const generationDate = new Date();
      const genDay = String(generationDate.getDate()).padStart(2, '0');
      const genMonth = generationDate.toLocaleString('en-US', { month: 'short' });
      const genYear = generationDate.getFullYear();
      const genHour = generationDate.getHours();
      const genMinute = String(generationDate.getMinutes()).padStart(2, '0');
      const genAmPm = genHour >= 12 ? 'pm' : 'am';
      const genHour12 = genHour % 12 || 12;

      worksheet.mergeCells('A3:O3');
      const generationCell = worksheet.getCell('A3');
      generationCell.value = `Generated On: ${genDay} ${genMonth} ${genYear}, ${String(genHour12).padStart(2, '0')}:${genMinute} ${genAmPm}`;
      generationCell.font = { size: 11, italic: true };
      generationCell.alignment = { horizontal: 'left', vertical: 'middle' };
      generationCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(3).height = 20;

      // Report Period row - Match Excel image format exactly
      worksheet.mergeCells('A4:O4');
      const periodCell = worksheet.getCell('A4');

      let periodText;
      if (targetDate) {
        // ✅ FIX: Show specific date when filtering by date
        const dateDay = String(targetDate.getDate()).padStart(2, '0');
        const dateMonth = targetDate.toLocaleString('en-US', { month: 'short' });
        const dateYear = targetDate.getFullYear();
        periodText = `Report Period: ${dateDay} ${dateMonth} ${dateYear} (${dateDay} ${dateMonth} ${dateYear})`;
      } else {
        // Show month range when filtering by month
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0); // Last day of the month

        const startDay = String(startDate.getDate()).padStart(2, '0');
        const startMonth = startDate.toLocaleString('en-US', { month: 'short' });
        const endDay = String(endDate.getDate()).padStart(2, '0');
        const endMonth = endDate.toLocaleString('en-US', { month: 'short' });

        periodText = `Report Period: ${startDay} ${startMonth} ${targetYear} to ${endDay} ${endMonth} ${targetYear} (${monthNames[targetMonth - 1]} ${targetYear})`;
      }

      periodCell.value = periodText;
      periodCell.font = { size: 11, italic: true };
      periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
      periodCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(4).height = 20;

      // Headers - Include all columns from web table: S.No, Product Name, Date, Old Stock, Invord Stock, Direct Stock, Sales, Addon, Stock Adjustment, Cancel Stock, Expired Stock, Damage Stock, Balance, Type, Unit
      const headers = ['S.No', 'Product Name', 'Date', 'Old Stock', 'Invord Stock', 'Direct Stock', 'Sales', 'Addon', 'Stock Adjustment', 'Cancel Stock', 'Expired Stock', 'Damage Stock', 'Balance', 'Type', 'Unit'];
      const headerRow = worksheet.getRow(5);
      headerRow.height = 20;

      // Set header values and style only columns 1-15 (A-O) - prevent background from extending beyond table
      for (let col = 1; col <= 15; col++) {
        const cell = headerRow.getCell(col);
        cell.value = headers[col - 1] || ''; // Headers array is 0-indexed
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }

      // Set column widths - 15 columns (with Unit)
      worksheet.columns = [
        { width: 8 },   // S.No
        { width: 25 },  // Product Name
        { width: 15 },  // Date
        { width: 12 },  // Old Stock
        { width: 15 },  // Invord Stock
        { width: 15 },  // Direct Stock - ✅ ADDED
        { width: 12 },  // Sales
        { width: 12 },  // Addon
        { width: 18 },  // Stock Adjustment
        { width: 15 },  // Cancel Stock
        { width: 15 },  // Expired Stock
        { width: 15 },  // Damage Stock
        { width: 12 },  // Balance
        { width: 15 },  // Type
        { width: 10 }   // Unit
      ];

      // Group products by category
      const productsByCategory = {};
      const uncategorizedProducts = [];

      for (const product of products) {
        const categoryId = product.categoryId?.toString() || product.category?.toString();
        const categoryName = categoryId && categoryMap[categoryId]
          ? categoryMap[categoryId].name
          : 'Uncategorized';

        if (categoryName === 'Uncategorized') {
          uncategorizedProducts.push(product);
        } else {
          if (!productsByCategory[categoryName]) {
            productsByCategory[categoryName] = {
              sortOrder: categoryId && categoryMap[categoryId] ? categoryMap[categoryId].sortOrder : 999,
              products: []
            };
          }
          productsByCategory[categoryName].products.push(product);
        }
      }

      // Sort categories by sortOrder
      const sortedCategories = Object.keys(productsByCategory).sort((a, b) => {
        return productsByCategory[a].sortOrder - productsByCategory[b].sortOrder;
      });

      // Add uncategorized at the end if any
      if (uncategorizedProducts.length > 0) {
        sortedCategories.push('Uncategorized');
        productsByCategory['Uncategorized'] = {
          sortOrder: 999,
          products: uncategorizedProducts
        };
      }

      let rowNumber = 0;
      let hasData = false;

      // Process each category
      for (const categoryName of sortedCategories) {
        const categoryProducts = productsByCategory[categoryName].products;
        let categoryHasData = false;

        // Process products in this category first to check if there's data
        for (const product of categoryProducts) {
          // ✅ FIX: Properly handle productId (could be ObjectId or string)
          let productId;
          try {
            if (!product._id) {
              console.warn(`⚠️ Skipping product with no ID: ${product.name || 'Unknown'}`);
              continue;
            }
            // Convert to string first, then to ObjectId to ensure proper format
            productId = product._id.toString();
            // Validate it's a valid ObjectId format
            if (!mongoose.Types.ObjectId.isValid(productId)) {
              console.warn(`⚠️ Skipping product with invalid ID format: ${product.name || 'Unknown'}, ID: ${productId}`);
              continue;
            }
          } catch (idError) {
            console.error(`❌ Error processing product ID for ${product.name || 'Unknown'}:`, idError);
            continue;
          }

          const productName = product.name || 'Unknown Product';

          // Get monthly stock document for this product
          let monthlyDoc;
          try {
            monthlyDoc = await CafeMonthlyStock.findOne({
              theaterId: new mongoose.Types.ObjectId(theaterId),
              productId: new mongoose.Types.ObjectId(productId),
              year: targetYear,
              monthNumber: targetMonth
            }).lean();
          } catch (dbError) {
            console.error(`❌ Error fetching stock for product ${productId}:`, dbError);
            continue; // Skip this product and continue with next
          }

          // ✅ Extract stock unit from CafeMonthlyStock entries (same logic as ProductService)
          let stockUnit = null;
          if (monthlyDoc && monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
            // Try to find any entry with a unit (prefer most recent, but check all)
            const sortedEntries = [...monthlyDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

            // First, try to find the most recent entry with a unit
            let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && String(entry.unit).trim() !== '');

            // If not found, try any entry with a unit
            if (!entryWithUnit) {
              entryWithUnit = sortedEntries.find(entry => entry.unit && String(entry.unit).trim() !== '');
            }

            // If still not found, use the most recent entry (even if unit is Nos or missing)
            if (!entryWithUnit && sortedEntries.length > 0) {
              entryWithUnit = sortedEntries[0];
            }

            if (entryWithUnit && entryWithUnit.unit) {
              stockUnit = String(entryWithUnit.unit).trim();
            }
          }

          // Fallback: If no unit found in stock entries, try product definition
          if (!stockUnit) {
            stockUnit = product.inventory?.unit || product.quantityUnit || product.unit || 'Nos';
          }

          // Final fallback
          if (!stockUnit || stockUnit.trim() === '') {
            stockUnit = 'Nos';
          }

          if (monthlyDoc && monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
            // Add category header row only when we find first data
            if (!categoryHasData) {
              hasData = true;
              categoryHasData = true;

              // Add category header row - this will be added at the current row count
              const categoryHeaderRow = worksheet.addRow([]);
              categoryHeaderRow.height = 25;

              // Get the actual row number from the worksheet
              const currentRow = worksheet.rowCount;

              // Merge cells for category header (A to O - 15 columns)
              worksheet.mergeCells(currentRow, 1, currentRow, 15);
              const categoryCell = worksheet.getCell(currentRow, 1);
              categoryCell.value = categoryName.toUpperCase();
              categoryCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
              categoryCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF8B5CF6' }
              };
              categoryCell.alignment = { horizontal: 'left', vertical: 'middle' }; // Left-aligned
              categoryCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            }

            // Sort stock details by date to ensure chronological order with error handling
            let sortedStockDetails = [...monthlyDoc.stockDetails].sort((a, b) => {
              try {
                const dateA = a.date ? new Date(a.date) : new Date(0);
                const dateB = b.date ? new Date(b.date) : new Date(0);
                if (isNaN(dateA.getTime())) return 1; // Invalid dates go to end
                if (isNaN(dateB.getTime())) return -1;
                return dateA - dateB;
              } catch (sortError) {
                console.warn(`⚠️ Error sorting dates:`, sortError);
                return 0; // Keep original order if sorting fails
              }
            });

            // ✅ FILTER: If specific date is provided, filter entries to only that date
            if (targetDate) {
              sortedStockDetails = sortedStockDetails.filter((entry) => {
                try {
                  if (!entry.date) return false;
                  const entryDate = new Date(entry.date);
                  if (isNaN(entryDate.getTime())) return false;
                  entryDate.setHours(0, 0, 0, 0);
                  return entryDate.getTime() === targetDate.getTime();
                } catch (filterError) {
                  console.warn(`⚠️ Error filtering date for entry:`, filterError);
                  return false;
                }
              });
            }

            // Skip if no stock details after filtering
            if (!sortedStockDetails || sortedStockDetails.length === 0) {
              continue; // Skip to next product
            }

            // Add data rows for this product - Include all columns from web table
            sortedStockDetails.forEach((entry) => {
              try {
                rowNumber++;

                // Format date as DD/MM/YYYY with error handling
                let formattedDate = 'N/A';
                try {
                  const entryDate = entry.date ? new Date(entry.date) : null;
                  if (entryDate && !isNaN(entryDate.getTime())) {
                    formattedDate = `${String(entryDate.getDate()).padStart(2, '0')}/${String(entryDate.getMonth() + 1).padStart(2, '0')}/${entryDate.getFullYear()}`;
                  }
                } catch (dateError) {
                  console.warn(`⚠️ Error formatting date for entry:`, dateError);
                  formattedDate = 'N/A';
                }

                // Get addon, stockAdjustment, and cancelStock values with proper null handling
                const addon = (entry.addon !== null && entry.addon !== undefined) ? (Number(entry.addon) || 0) : 0;
                const stockAdjustment = (entry.stockAdjustment !== null && entry.stockAdjustment !== undefined) ? (Number(entry.stockAdjustment) || 0) : 0;
                const cancelStock = (entry.cancelStock !== null && entry.cancelStock !== undefined) ? (Number(entry.cancelStock) || 0) : 0;
                const directStock = (entry.directStock !== null && entry.directStock !== undefined) ? (Number(entry.directStock) || 0) : 0; // ✅ ADDED

                // Get unit for this entry (prefer entry unit, fallback to stockUnit)
                const entryUnit = (entry.unit && String(entry.unit).trim() !== '')
                  ? String(entry.unit).trim()
                  : (stockUnit || 'Nos');

                // Safely get all numeric values with proper null handling
                const oldStock = (entry.oldStock !== null && entry.oldStock !== undefined) ? (Number(entry.oldStock) || 0) : 0;
                const invordStock = (entry.invordStock !== null && entry.invordStock !== undefined) ? (Number(entry.invordStock) || 0) : 0;
                const sales = (entry.sales !== null && entry.sales !== undefined) ? (Number(entry.sales) || 0) : 0;
                const expiredStock = (entry.expiredStock !== null && entry.expiredStock !== undefined) ? (Number(entry.expiredStock) || 0) : 0;
                const damageStock = (entry.damageStock !== null && entry.damageStock !== undefined) ? (Number(entry.damageStock) || 0) : 0;
                const balance = (entry.balance !== null && entry.balance !== undefined) ? (Number(entry.balance) || 0) : 0;
                const type = entry.type || 'N/A';

                // Ensure all values are strings or numbers (no undefined/null in array)
                const rowData = [
                  rowNumber,  // S.No (column 1)
                  String(productName || 'Unknown'),  // Product Name (column 2)
                  String(formattedDate),  // Date (column 3) - DD/MM/YYYY format
                  `${oldStock} ${entryUnit}`,  // Old Stock with unit (column 4)
                  `${invordStock} ${entryUnit}`,  // Invord Stock with unit (column 5)
                  `${directStock} ${entryUnit}`,  // Direct Stock with unit (column 6) - ✅ ADDED
                  `${sales} ${entryUnit}`,  // Sales with unit (column 7)
                  `${addon} ${entryUnit}`,  // Addon with unit (column 8)
                  `${stockAdjustment} ${entryUnit}`,  // Stock Adjustment with unit (column 9)
                  `${cancelStock} ${entryUnit}`,  // Cancel Stock with unit (column 10)
                  `${expiredStock} ${entryUnit}`,  // Expired Stock with unit (column 11)
                  `${damageStock} ${entryUnit}`,  // Damage Stock with unit (column 12)
                  `${balance} ${entryUnit}`,  // Balance with unit (column 13)
                  String(type),  // Type (column 14)
                  String(entryUnit)  // Unit (column 15)
                ];

                // Validate row data before adding
                if (rowData.length !== 15) {
                  throw new Error(`Invalid row data length: expected 15, got ${rowData.length}`);
                }

                const row = worksheet.addRow(rowData);

                // Style the row - Style only columns 1-15 (A-O)
                for (let col = 1; col <= 15; col++) {
                  try {
                    const cell = row.getCell(col);
                    cell.border = {
                      top: { style: 'thin', color: { argb: 'FF000000' } },
                      left: { style: 'thin', color: { argb: 'FF000000' } },
                      bottom: { style: 'thin', color: { argb: 'FF000000' } },
                      right: { style: 'thin', color: { argb: 'FF000000' } }
                    };

                    // Center align: S.No (1), Date (3), Type (14), Unit (15)
                    if (col === 1 || col === 3 || col === 14 || col === 15) {
                      cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else if (col === 2) {
                      // Left align: Product Name (2)
                      cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    } else {
                      // Right align numeric columns (Old Stock, Invord Stock, Sales, Addon, Stock Adjustment, Cancel Stock, Expired Stock, Damage Stock, Balance)
                      cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    }
                  } catch (cellError) {
                    console.warn(`⚠️ Error styling cell ${col} for row ${rowNumber}:`, cellError);
                    // Continue with next cell
                  }
                }

                row.height = 18;
              } catch (rowError) {
                console.error(`❌ Error processing row for product ${productName}, entry date: ${entry.date}:`, rowError);
                // Continue with next entry instead of failing entire export
                rowNumber--; // Decrement since we're skipping this row
              }
            });
          }
        }
      }

      if (!hasData) {
        return res.status(404).json({
          success: false,
          error: `No cafe stock data found for the selected month (${targetYear}-${targetMonth})`
        });
      }

      // Validate workbook before writing
      if (!workbook || !worksheet) {
        throw new Error('Workbook or worksheet is invalid');
      }

      // Validate that we have at least the header row
      if (worksheet.rowCount < 5) {
        throw new Error('Worksheet has insufficient data');
      }

      // Set response headers
      const filename = `Cafe_Stock_Management_${monthNames[targetMonth - 1]}_${targetYear}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      try {
        await workbook.xlsx.write(res);
        res.end();
      } catch (writeError) {
        console.error('❌ Error writing Excel file:', writeError);
        console.error('Write error stack:', writeError.stack);
        // If headers haven't been sent yet, send error response
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to generate Excel file',
            message: writeError.message
          });
        } else {
          // If headers were sent, try to end the response
          try {
            res.end();
          } catch (endError) {
            console.error('❌ Error ending response after write error:', endError);
          }
        }
      }

    } catch (error) {
      console.error('❌ Export all cafe stock Excel error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        theaterId: req.params?.theaterId,
        year: req.query?.year,
        month: req.query?.month,
        date: req.query?.date
      });
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to export cafe stock data',
          message: error.message || 'An unexpected error occurred',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      } else {
        // If headers were sent, try to end the response
        try {
          res.end();
        } catch (endError) {
          console.error('❌ Error ending response:', endError);
        }
      }
    }
  }

  /**
   * GET /api/cafe-stock/excel/:theaterId/:productId
   * Export cafe stock data for a specific product to Excel
   */
  static async exportExcel(req, res) {
    try {
      const { theaterId, productId } = req.params;
      const { year, month, date } = req.query; // ✅ FIX: Extract date from query

      const currentDate = new Date();
      const targetYear = year ? parseInt(year) : currentDate.getFullYear();
      const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;

      // ✅ FIX: Parse specific date if provided (format: YYYY-MM-DD)
      let targetDate = null;
      if (date) {
        targetDate = new Date(date);
        // Validate date
        if (isNaN(targetDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid date format. Expected YYYY-MM-DD'
          });
        }
        // Set time to start of day for accurate comparison
        targetDate.setHours(0, 0, 0, 0);
      }

      // Get monthly stock document
      const monthlyDoc = await CafeMonthlyStock.findOne({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        productId: new mongoose.Types.ObjectId(productId),
        year: targetYear,
        monthNumber: targetMonth
      }).lean(); // Use lean() to get plain JavaScript object

      if (!monthlyDoc || !monthlyDoc.stockDetails || monthlyDoc.stockDetails.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No cafe stock data found for the selected month (${targetYear}-${targetMonth})`
        });
      }

      // Get product information
      const productContainer = await mongoose.connection.db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        'productList._id': new mongoose.Types.ObjectId(productId)
      });

      let productName = 'Product';
      let product = null;
      if (productContainer && productContainer.productList) {
        product = productContainer.productList.find(
          p => p._id.toString() === productId
        );
        if (product) {
          productName = product.name || 'Product';
        }
      }

      // ✅ Extract stock unit from CafeMonthlyStock entries (same logic as ProductService)
      // This is the actual unit used in Cafe Stock Management, matching frontend display
      let stockUnit = null;
      if (monthlyDoc && monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
        // Try to find any entry with a unit (prefer most recent, but check all)
        const sortedEntries = [...monthlyDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));

        // First, try to find the most recent entry with a unit
        let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && String(entry.unit).trim() !== '');

        // If not found, try any entry with a unit
        if (!entryWithUnit) {
          entryWithUnit = sortedEntries.find(entry => entry.unit && String(entry.unit).trim() !== '');
        }

        // If still not found, use the most recent entry (even if unit is Nos or missing)
        if (!entryWithUnit && sortedEntries.length > 0) {
          entryWithUnit = sortedEntries[0];
        }

        if (entryWithUnit && entryWithUnit.unit) {
          stockUnit = String(entryWithUnit.unit).trim();
        }
      }

      // Fallback: If no unit found in stock entries, try product definition
      if (!stockUnit && product) {
        stockUnit = product.inventory?.unit || product.quantityUnit || product.unit || 'Nos';
      }

      // Final fallback
      if (!stockUnit || stockUnit.trim() === '') {
        stockUnit = 'Nos';
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Cafe Stock Report');

      // Month names
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Title row (merged A1:M1) - 13 columns: S.No, Date, Old Stock, Inword Stock, Direct Stock, Sales, Addon, Stock Adjustment, Cancel Stock, Balance, Expired Stock, Type, Unit
      worksheet.mergeCells('A1:M1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `Cafe Stock Report - ${productName}`;
      titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(1).height = 30;

      // Subtitle row (merged A2:M2)
      worksheet.mergeCells('A2:M2');
      const subtitleCell = worksheet.getCell('A2');
      // ✅ FIX: Show specific date when filtering by date, otherwise show month
      if (targetDate) {
        const dateDay = String(targetDate.getDate()).padStart(2, '0');
        const dateMonth = monthNames[targetDate.getMonth()];
        subtitleCell.value = `${dateDay} ${dateMonth} ${targetDate.getFullYear()}`;
      } else {
        subtitleCell.value = `${monthNames[targetMonth - 1]} ${targetYear}`;
      }
      subtitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      subtitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' }
      };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      subtitleCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(2).height = 25;

      // Generation Date & Time row - Match Excel image format exactly
      const generationDate = new Date();
      const genDay = String(generationDate.getDate()).padStart(2, '0');
      const genMonth = generationDate.toLocaleString('en-US', { month: 'short' });
      const genYear = generationDate.getFullYear();
      const genHour = generationDate.getHours();
      const genMinute = String(generationDate.getMinutes()).padStart(2, '0');
      const genAmPm = genHour >= 12 ? 'pm' : 'am';
      const genHour12 = genHour % 12 || 12;

      worksheet.mergeCells('A3:M3');
      const generationCell = worksheet.getCell('A3');
      generationCell.value = `Generated On: ${genDay} ${genMonth} ${genYear}, ${String(genHour12).padStart(2, '0')}:${genMinute} ${genAmPm}`;
      generationCell.font = { size: 11, italic: true };
      generationCell.alignment = { horizontal: 'left', vertical: 'middle' };
      generationCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(3).height = 20;

      // Report Period row - Match Excel image format exactly
      worksheet.mergeCells('A4:M4');
      const periodCell = worksheet.getCell('A4');
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0); // Last day of the month

      const startDay = String(startDate.getDate()).padStart(2, '0');
      const startMonth = startDate.toLocaleString('en-US', { month: 'short' });
      const endDay = String(endDate.getDate()).padStart(2, '0');
      const endMonth = endDate.toLocaleString('en-US', { month: 'short' });

      periodCell.value = `Report Period: ${startDay} ${startMonth} ${targetYear} to ${endDay} ${endMonth} ${targetYear} (${monthNames[targetMonth - 1]} ${targetYear})`;
      periodCell.font = { size: 11, italic: true };
      periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
      periodCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(4).height = 20;

      // Headers (row 5) - Match first image exactly: S.NO, DATE, OLD STOCK, INVORD STOCK, DIRECT STOCK, SALES, ADDON, STOCK ADJUSTMENT, CANCEL STOCK, BALANCE, EXPIRED STOCK, TYPE, UNIT
      const headers = ['S.No', 'Date', 'Old Stock', 'Inword Stock', 'Direct Stock', 'Sales', 'Addon', 'Stock Adjustment', 'Cancel Stock', 'Balance', 'Expired Stock', 'Type', 'Unit'];
      const headerRow = worksheet.getRow(5);
      headerRow.height = 20;

      // Set header values and style each cell individually
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1); // Columns start at 1
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Explicitly verify Addon header is set (column 7)
      const addonHeaderCell = headerRow.getCell(7);
      if (addonHeaderCell.value !== 'Addon') {
        console.warn(`⚠️ Addon header not set correctly. Expected 'Addon', got '${addonHeaderCell.value}'. Fixing...`);
        addonHeaderCell.value = 'Addon';
        addonHeaderCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        addonHeaderCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        addonHeaderCell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Set column widths - optimized for readability (13 columns with Unit)
      worksheet.columns = [
        { width: 8 },   // S.No
        { width: 15 },  // Date
        { width: 12 },  // Old Stock
        { width: 15 },  // Inword Stock
        { width: 15 },  // Direct Stock - ✅ ADDED
        { width: 12 },  // Sales
        { width: 12 },  // Addon
        { width: 18 },  // Stock Adjustment
        { width: 15 },  // Cancel Stock
        { width: 12 },  // Balance
        { width: 15 },  // Expired Stock
        { width: 15 },  // Type
        { width: 10 }   // Unit
      ];

      // Sort stock details by date to ensure chronological order
      const sortedStockDetails = [...monthlyDoc.stockDetails].sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
      });

      // Add data rows - Match first image: S.No, Date, Old Stock, Inword Stock, Sales, Addon, Stock Adjustment, Cancel Stock, Balance, Expired Stock, Type
      sortedStockDetails.forEach((entry, index) => {
        // Format date as DD/MM/YYYY to match Excel image
        const entryDate = new Date(entry.date);
        const formattedDate = `${String(entryDate.getDate()).padStart(2, '0')}/${String(entryDate.getMonth() + 1).padStart(2, '0')}/${entryDate.getFullYear()}`;

        // Get addon, stockAdjustment, and cancelStock values - ensure they are numbers
        const addon = Number(entry.addon) || 0;
        const stockAdjustment = Number(entry.stockAdjustment) || 0;
        const cancelStock = Number(entry.cancelStock) || 0;

        const directStock = Number(entry.directStock) || 0; // ✅ ADDED

        // Get unit for this entry (prefer entry unit, fallback to stockUnit)
        const entryUnit = entry.unit && String(entry.unit).trim() !== ''
          ? String(entry.unit).trim()
          : stockUnit;

        const row = worksheet.addRow([
          index + 1,  // S.No (column 1)
          formattedDate,  // Date (column 2)
          `${entry.oldStock || 0} ${entryUnit}`,  // Old Stock with unit (column 3)
          `${entry.invordStock || 0} ${entryUnit}`,  // Inword Stock with unit (column 4)
          `${directStock} ${entryUnit}`,  // Direct Stock with unit (column 5) - ✅ ADDED
          `${entry.sales || 0} ${entryUnit}`,  // Sales with unit (column 6)
          `${addon} ${entryUnit}`,  // Addon with unit (column 7) - MUST BE INCLUDED
          `${stockAdjustment} ${entryUnit}`,  // Stock Adjustment with unit (column 8)
          `${cancelStock} ${entryUnit}`,  // Cancel Stock with unit (column 9)
          `${entry.balance || 0} ${entryUnit}`,  // Balance with unit (column 10)
          `${entry.expiredStock || 0} ${entryUnit}`,  // Expired Stock with unit (column 11)
          entry.type || 'N/A',  // Type (column 12)
          entryUnit  // Unit (column 13)
        ]);

        // Verify Addon column (column 7) is populated
        const addonCell = row.getCell(7);
        if (addonCell.value !== addon) {
          console.warn(`⚠️ Addon value mismatch at row ${index + 1}: expected ${addon}, got ${addonCell.value}`);
          addonCell.value = addon; // Force set the value
        }

        // Style the row - apply borders and alignment to all cells
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          // Center align: S.No (1), Date (2), Type (12), Unit (13)
          if (colNumber === 1 || colNumber === 2 || colNumber === 12 || colNumber === 13) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            // Right align numeric columns (Old Stock, Inword Stock, Sales, Addon, Stock Adjustment, Cancel Stock, Balance, Expired Stock)
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });

        row.height = 18;
      });

      // Add summary row (TOTAL) - Match first image format with 12 columns (including Unit)
      // Calculate totals from monthly document
      const totalOldStock = monthlyDoc.oldStock || 0;
      const totalInvordStock = monthlyDoc.totalInvordStock || 0;
      const totalDirectStock = monthlyDoc.totalDirectStock || 0; // ✅ ADDED
      const totalSales = monthlyDoc.totalSales || 0;
      const totalAddon = Number(monthlyDoc.totalAddon) || 0;
      const totalStockAdjustment = Number(monthlyDoc.totalStockAdjustment) || 0;
      const totalCancelStock = Number(monthlyDoc.totalCancelStock) || 0;
      const totalExpiredStock = monthlyDoc.totalExpiredStock || 0;
      const totalBalance = monthlyDoc.closingBalance || 0;

      const summaryRow = worksheet.addRow([
        '',  // S.No - empty (column 1)
        'TOTAL',  // Date - "TOTAL" (column 2)
        `${totalOldStock} ${stockUnit}`,  // Old Stock - opening balance for month with unit (column 3)
        `${totalInvordStock} ${stockUnit}`,  // Inword Stock - total added with unit (column 4)
        `${totalDirectStock} ${stockUnit}`,  // Direct Stock - total direct with unit (column 5) - ✅ ADDED
        `${totalSales} ${stockUnit}`,  // Sales - total used with unit (column 6)
        `${totalAddon} ${stockUnit}`,  // Addon - total addon stock with unit (column 7) - MUST BE INCLUDED
        `${totalStockAdjustment} ${stockUnit}`,  // Stock Adjustment - total adjustments with unit (column 8)
        `${totalCancelStock} ${stockUnit}`,  // Cancel Stock - total cancelled stock with unit (column 9)
        `${totalBalance} ${stockUnit}`,  // Balance - closing balance with unit (column 10)
        `${totalExpiredStock} ${stockUnit}`,  // Expired Stock - total expired with unit (column 11)
        '',   // Type - empty (column 12)
        stockUnit  // Unit (column 13)
      ]);

      // Verify Addon column (column 7) in TOTAL row is populated
      const totalAddonCell = summaryRow.getCell(7);
      if (totalAddonCell.value !== totalAddon) {
        console.warn(`⚠️ Total Addon value mismatch: expected ${totalAddon}, got ${totalAddonCell.value}`);
        totalAddonCell.value = totalAddon; // Force set the value
      }

      // Style the TOTAL row with purple background
      summaryRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Center align: S.No (1), Date/TOTAL (2), Type (12), Unit (13)
        if (colNumber === 1 || colNumber === 2 || colNumber === 12 || colNumber === 13) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          // Right align numeric columns
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });

      summaryRow.height = 25;

      // Set response headers
      const filename = `Cafe_Stock_${productName}_${monthNames[targetMonth - 1]}_${targetYear}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('❌ Export cafe stock Excel error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export cafe stock data',
        message: error.message
      });
    }
  }
}

module.exports = CafeStockController;

