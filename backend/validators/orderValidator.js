const { body, query, validationResult } = require('express-validator');

/**
 * Order Validators
 */
const orderValidator = {
  getByTheater: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 10000 }),
    query('status').optional().isIn(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
    query('source').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],

  create: [
    body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
    body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
    body('items.*.productId').isMongoId().withMessage('Valid product ID is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
  ],

  updateStatus: [
    body('status').isIn(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'])
      .withMessage('Invalid order status')
  ],

  getTheaterNested: [
    query('theaterId').optional().isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().trim(),
    query('status').optional().isIn(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
    query('date').optional().isISO8601(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2020, max: 2030 })
  ],

  getTheaterStats: [
    query('theaterId').optional().isMongoId()
  ]
};

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

module.exports = { orderValidator, validate };

