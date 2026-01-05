const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const OrderController = require('../controllers/OrderController');
const { authenticateToken, optionalAuth, requireTheaterAccess } = require('../middleware/auth');
const { orderValidator, validate } = require('../validators/orderValidator');

/**
 * Order Routes (MVC Pattern)
 */

// IMPORTANT: These routes MUST be before /theater/:theaterId to avoid route conflicts

// GET /api/orders/theater-nested
router.get('/theater-nested',
  authenticateToken,
  orderValidator.getTheaterNested,
  validate,
  BaseController.asyncHandler(OrderController.getTheaterNested)
);

// GET /api/orders/theater-stats
router.get('/theater-stats',
  authenticateToken,
  orderValidator.getTheaterStats,
  validate,
  BaseController.asyncHandler(OrderController.getTheaterStats)
);

// GET /api/orders/all-theaters-stats
router.get('/all-theaters-stats',
  authenticateToken,
  BaseController.asyncHandler(OrderController.getAllTheatersStats)
);

// GET /api/orders/theater/:theaterId
router.get('/theater/:theaterId',
  optionalAuth,
  orderValidator.getByTheater,
  validate,
  BaseController.asyncHandler(OrderController.getByTheater)
);

// GET /api/orders/theater/:theaterId/:orderId
router.get('/theater/:theaterId/:orderId',
  optionalAuth,
  BaseController.asyncHandler(OrderController.getById)
);

// POST /api/orders/theater
router.post('/theater',
  optionalAuth,
  orderValidator.create,
  validate,
  BaseController.asyncHandler(OrderController.create)
);

// PUT /api/orders/theater/:theaterId/:orderId/status
router.put('/theater/:theaterId/:orderId/status',
  authenticateToken,
  requireTheaterAccess,
  orderValidator.updateStatus,
  validate,
  BaseController.asyncHandler(OrderController.updateStatus)
);

// PUT /api/orders/customer/cancel/:theaterId/:orderId
// Customer cancels their own order (no auth required, validates by phone number)
router.put('/customer/cancel/:theaterId/:orderId',
  BaseController.asyncHandler(OrderController.customerCancelOrder)
);

// DELETE /api/orders/theater/:theaterId/:orderId/products/:itemId
// Cancel a product/item from an order
router.delete('/theater/:theaterId/:orderId/products/:itemId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(OrderController.cancelProduct)
);

// GET /api/orders/excel/:theaterId
router.get('/excel/:theaterId',
  authenticateToken,
  BaseController.asyncHandler(OrderController.exportExcel)
);

// GET /api/orders/sales-report-excel/:theaterId
router.get('/sales-report-excel/:theaterId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(OrderController.exportSalesReportExcel)
);

module.exports = router;

