const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const StockController = require('../controllers/StockController');
const { authenticateToken, requireTheaterAccess } = require('../middleware/auth');
const { stockValidator, validate } = require('../validators/stockValidator');

/**
 * Stock Routes (MVC Pattern)
 */

// GET /api/theater-stock/excel/:theaterId/:productId
// Export endpoints MUST be before /:theaterId/:productId route to avoid matching conflicts
router.get('/excel/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(StockController.exportExcel)
);

// GET /api/theater-stock/:theaterId/:productId
router.get('/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(StockController.getMonthlyStock)
);

// POST /api/theater-stock/:theaterId/:productId
router.post('/:theaterId/:productId',
  authenticateToken,
  requireTheaterAccess,
  stockValidator.addEntry,
  validate,
  BaseController.asyncHandler(StockController.addStockEntry)
);

// PUT /api/theater-stock/:theaterId/:productId/:entryId
router.put('/:theaterId/:productId/:entryId',
  authenticateToken,
  requireTheaterAccess,
  stockValidator.updateEntry,
  validate,
  BaseController.asyncHandler(StockController.updateStockEntry)
);

// DELETE /api/theater-stock/:theaterId/:productId/:entryId
router.delete('/:theaterId/:productId/:entryId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(StockController.deleteStockEntry)
);

module.exports = router;

