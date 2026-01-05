const { body, query, validationResult } = require('express-validator');

const stockValidator = {
  addEntry: [
    body('date').notEmpty().withMessage('Date is required'),
    body('type').isIn(['ADDED', 'SOLD', 'DAMAGE', 'EXPIRED']).withMessage('Invalid type'),
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a positive number')
  ],
  updateEntry: [
    body('date').optional().notEmpty().withMessage('Date cannot be empty'),
    body('type').optional().isIn(['ADDED', 'SOLD', 'DAMAGE', 'EXPIRED']).withMessage('Invalid type'),
    body('quantity').optional().isFloat({ min: 0 }).withMessage('Quantity must be a positive number')
  ]
};

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

module.exports = { stockValidator, validate };

