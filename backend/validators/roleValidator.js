const { body, query, param, validationResult } = require('express-validator');

const roleValidator = {
  getAll: [
    query('theaterId').optional().isMongoId().withMessage('Invalid theater ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
    query('search').optional().isString().withMessage('Search must be string')
  ],
  create: [
    body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
    body('name').notEmpty().trim().withMessage('Role name is required'),
    body('description').optional().trim(),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
    body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
    body('isGlobal').optional().isBoolean().withMessage('isGlobal must be boolean'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be boolean')
  ],
  update: [
    body('name').optional().notEmpty().trim().withMessage('Role name cannot be empty'),
    body('description').optional().trim(),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
    body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
    body('isGlobal').optional().isBoolean().withMessage('isGlobal must be boolean'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
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

module.exports = { roleValidator, validate };

