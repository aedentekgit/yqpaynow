const { body, query, validationResult } = require('express-validator');

/**
 * Product Validators
 */
const productValidator = {
  getByTheater: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('categoryId').optional().isMongoId(),
    query('search').optional().isLength({ min: 1 }),
    query('status').optional().isIn(['active', 'inactive', 'out_of_stock', 'discontinued']),
    query('sortBy').optional().isIn(['name', 'price', 'createdAt', 'updatedAt', 'rating']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],

  create: [
    body('name').notEmpty().trim().withMessage('Product name is required'),
    body('categoryId').isMongoId().withMessage('Valid category ID is required'),
    body('pricing.basePrice').optional().isFloat({ min: 0 }).withMessage('Base price must be a positive number')
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

module.exports = { productValidator, validate };

