const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const CafeStockController = require('../controllers/CafeStockController');
const { authenticateToken, requireTheaterAccess } = require('../middleware/auth');
const { stockValidator, validate } = require('../validators/stockValidator');

/**
 * Cafe Stock Routes (MVC Pattern)
 */


// GET /api/cafe-stock/sales-report/:theaterId
// Get sales report data as JSON (for PDF generation)
router.get('/sales-report/:theaterId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(CafeStockController.getSalesReportData)
);

// GET /api/cafe-stock/excel-all/:theaterId
// Export all cafe stock management data for all products
router.get('/excel-all/:theaterId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(CafeStockController.exportAllExcel)
);

// GET /api/cafe-stock/excel/:theaterId/:productId
// Export endpoints MUST be before /:theaterId/:productId route to avoid matching conflicts
router.get('/excel/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(CafeStockController.exportExcel)
);

// GET /api/cafe-stock/:theaterId/:productId
router.get('/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(CafeStockController.getMonthlyStock)
);

// POST /api/cafe-stock/:theaterId/:productId
router.post('/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  stockValidator.addEntry,
  validate,
  BaseController.asyncHandler(CafeStockController.addStockEntry)
);

// PUT /api/cafe-stock/:theaterId/:productId/:entryId
router.put('/:theaterId/:productId/:entryId',
  authenticateToken,
  requireTheaterAccess,
  stockValidator.updateEntry,
  validate,
  BaseController.asyncHandler(CafeStockController.updateStockEntry)
);

// DELETE /api/cafe-stock/:theaterId/:productId/:entryId
router.delete('/:theaterId/:productId/:entryId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(CafeStockController.deleteStockEntry)
);

module.exports = router;

