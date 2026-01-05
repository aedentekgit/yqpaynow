const { body, query, validationResult } = require('express-validator');

const pageAccessValidator = {
  getAll: [
    query('theaterId').notEmpty().withMessage('Theater ID is required')
  ],
  create: [
    body('theaterId')
      .notEmpty()
      .withMessage('Theater ID is required')
      .custom((value) => {
        // More flexible validation - check if it's a valid MongoDB ObjectId format
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(value)) {
          return true;
        }
        throw new Error('Theater ID must be a valid MongoDB ObjectId');
      }),
    body('page').notEmpty().trim().withMessage('Page identifier is required'),
    body('pageName').notEmpty().trim().withMessage('Page name is required'),
    body('route').notEmpty().trim().withMessage('Route is required')
  ]
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

module.exports = { pageAccessValidator, validate };

