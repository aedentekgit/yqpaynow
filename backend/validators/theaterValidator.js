const { body, query, validationResult } = require('express-validator');

/**
 * Theater Validators
 * Centralized validation rules for theater endpoints
 */
const theaterValidator = {
  /**
   * Validation rules for GET /api/theaters
   */
  getAll: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('q').optional().isLength({ min: 1 }).withMessage('Search term must not be empty')
  ],

  /**
   * Validation rules for POST /api/theaters
   */
  create: [
    body('name').trim().notEmpty().withMessage('Theater name is required'),
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('email').optional().isEmail().withMessage('Invalid email format')
  ],

  /**
   * Validation rules for PUT /api/theaters/:id/password
   */
  updatePassword: [
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    })
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

module.exports = { theaterValidator, validate };

