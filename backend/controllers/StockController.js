const BaseController = require('./BaseController');
const stockService = require('../services/StockService');
const MonthlyStock = require('../models/MonthlyStock');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

/**
 * Stock Controller
 */
class StockController extends BaseController {
  /**
   * GET /api/theater-stock/:theaterId/:productId
   */
  static async getMonthlyStock(req, res) {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const { theaterId, productId } = req.params;
      const { year, month } = req.query;

      // Fetch monthly stock document
      const monthlyDoc = await stockService.getMonthlyStock(
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
          console.warn(`⚠️ [StockController] Product not found: ${productId}`);
        }
      } catch (productError) {
        console.error('Error fetching product:', productError);
        // Continue without product data - don't fail the request
      }

      // Return response with both stock data and product information
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
      console.error('Get monthly stock error:', error);
      return BaseController.error(res, 'Failed to fetch stock', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/theater-stock/:theaterId/:productId
   */
  static async addStockEntry(req, res) {
    try {
      const { theaterId, productId } = req.params;

      const monthlyDoc = await stockService.addStockEntry(
        theaterId,
        productId,
        req.body
      );

      return BaseController.success(res, monthlyDoc, 'Stock entry added successfully');
    } catch (error) {
      console.error('Add stock entry error:', error);
      return BaseController.error(res, 'Failed to add stock entry', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/theater-stock/:theaterId/:productId/:entryId
   */
  static async updateStockEntry(req, res) {
    try {
      const { theaterId, productId, entryId } = req.params;

      const monthlyDoc = await stockService.updateStockEntry(
        theaterId,
        productId,
        entryId,
        req.body
      );

      return BaseController.success(res, monthlyDoc, 'Stock entry updated successfully');
    } catch (error) {
      console.error('Update stock entry error:', error);
      if (error.message === 'Monthly document not found' || error.message === 'Stock entry not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update stock entry', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/theater-stock/:theaterId/:productId/:entryId
   */
  static async deleteStockEntry(req, res) {
    try {
      const { theaterId, productId, entryId } = req.params;

      const monthlyDoc = await stockService.deleteStockEntry(
        theaterId,
        productId,
        entryId
      );

      return BaseController.success(res, monthlyDoc, 'Stock entry deleted successfully');
    } catch (error) {
      console.error('Delete stock entry error:', error);
      if (error.message === 'Monthly document not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete stock entry', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theater-stock/excel/:theaterId/:productId
   * Export stock data for a specific product to Excel
   */
  static async exportExcel(req, res) {
    try {
      const { theaterId, productId } = req.params;
      const { year, month } = req.query;

      const currentDate = new Date();
      const targetYear = year ? parseInt(year) : currentDate.getFullYear();
      const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;

      // Get monthly stock document
      const monthlyDoc = await MonthlyStock.findOne({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        productId: new mongoose.Types.ObjectId(productId),
        year: targetYear,
        monthNumber: targetMonth
      }).lean(); // Use lean() to get plain JavaScript object

      if (!monthlyDoc || !monthlyDoc.stockDetails || monthlyDoc.stockDetails.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No stock data found for the selected month (${targetYear}-${targetMonth})`
        });
      }


      // Get product information
      const productContainer = await mongoose.connection.db.collection('productlist').findOne({
        theater: new mongoose.Types.ObjectId(theaterId),
        'productList._id': new mongoose.Types.ObjectId(productId)
      });

      let productName = 'Product';
      if (productContainer && productContainer.productList) {
        const product = productContainer.productList.find(
          p => p._id.toString() === productId
        );
        if (product) {
          productName = product.name || 'Product';
        }
      }

      // ✅ Extract stock unit from MonthlyStock entries (same logic as ProductService)
      // This is the actual unit used in Stock Management, matching frontend display
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
      if (!stockUnit && productContainer && productContainer.productList) {
        const product = productContainer.productList.find(
          p => p._id.toString() === productId
        );
        if (product) {
          stockUnit = product.inventory?.unit || product.quantityUnit || product.unit || 'Nos';
        }
      }

      // Final fallback
      if (!stockUnit || stockUnit.trim() === '') {
        stockUnit = 'Nos';
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Stock Report');

      // Month names
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Title row (merged A1:F1)
      worksheet.mergeCells('A1:F1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `Stock Report - ${productName}`;
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

      // Subtitle row (merged A2:F2)
      worksheet.mergeCells('A2:F2');
      const subtitleCell = worksheet.getCell('A2');
      subtitleCell.value = `${monthNames[targetMonth - 1]} ${targetYear}`;
      subtitleCell.font = { bold: true, size: 12 };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      subtitleCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      worksheet.getRow(2).height = 25;

      // Headers (row 3) - Updated to include Unit column
      const headers = ['S.No', 'Date', 'Invord Stock', 'Transfer', 'Stock Adjustment', 'Balance', 'Unit'];
      const headerRow = worksheet.getRow(3);
      headerRow.values = headers;
      headerRow.height = 20;
      
      // Apply styling only to columns 1-7 (the actual header columns)
      for (let col = 1; col <= 7; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
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

      // Set column widths
      worksheet.columns = [
        { width: 8 },   // S.No
        { width: 15 },  // Date
        { width: 15 },  // Invord Stock
        { width: 12 },  // Transfer
        { width: 18 },  // Stock Adjustment
        { width: 12 },  // Balance
        { width: 10 }   // Unit
      ];

      // Add data rows - Use array format for reliable column mapping
      monthlyDoc.stockDetails.forEach((entry, index) => {
        // Get unit for this entry (prefer entry unit, fallback to stockUnit)
        const entryUnit = entry.unit && String(entry.unit).trim() !== '' 
          ? String(entry.unit).trim() 
          : stockUnit;

        const row = worksheet.addRow([
          index + 1,  // S.No
          new Date(entry.date).toLocaleDateString('en-IN'),  // Date
          `${entry.invordStock || 0} ${entryUnit}`,  // Invord Stock with unit
          `${entry.transfer || 0} ${entryUnit}`,  // Transfer with unit
          `${entry.stockAdjustment || 0} ${entryUnit}`,  // Stock Adjustment with unit
          `${entry.balance || 0} ${entryUnit}`,  // Balance with unit
          entryUnit  // Unit column
        ]);

        // Style the row
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          if (colNumber === 1 || colNumber === 2 || colNumber === 7) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });

        row.height = 18;
      });

      // Add summary row - Updated to match current structure with units
      const summaryRow = worksheet.addRow([
        '',
        'TOTAL',
        `${monthlyDoc.totalInvordStock || 0} ${stockUnit}`,
        `${monthlyDoc.totalTransfer || 0} ${stockUnit}`,
        `${monthlyDoc.totalStockAdjustment || 0} ${stockUnit}`,
        `${monthlyDoc.closingBalance || 0} ${stockUnit}`,
        stockUnit  // Unit column
      ]);

      summaryRow.height = 25;
      
      // Apply styling only to columns 1-7 (the actual table columns)
      for (let col = 1; col <= 7; col++) {
        const cell = summaryRow.getCell(col);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        if (col === 1 || col === 2 || col === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      }

      // Set response headers
      const filename = `Stock_${productName}_${monthNames[targetMonth - 1]}_${targetYear}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('❌ Export stock Excel error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export stock data',
        message: error.message
      });
    }
  }
}

module.exports = StockController;

