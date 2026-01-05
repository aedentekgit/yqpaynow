const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const AdminController = require('../controllers/AdminController');
const { authenticateToken } = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');

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

/**
 * Admin Routes (MVC Pattern)
 * Only super_admin can access these routes
 */

// GET /api/admins
router.get('/',
  authenticateToken,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('isActive').optional().isIn(['true', 'false', '1', '0']).withMessage('isActive must be true or false'),
  validate,
  BaseController.asyncHandler(AdminController.getAll)
);

// GET /api/admins/:id
router.get('/:id',
  authenticateToken,
  BaseController.asyncHandler(AdminController.getById)
);

// POST /api/admins
router.post('/',
  authenticateToken,
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('role').optional().isString().withMessage('Role must be a string'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
  BaseController.asyncHandler(AdminController.create)
);

// PUT /api/admins/:id
router.put('/:id',
  authenticateToken,
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('role').optional().isString().withMessage('Role must be a string'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
  BaseController.asyncHandler(AdminController.update)
);

// DELETE /api/admins/:id
router.delete('/:id',
  authenticateToken,
  query('permanent').optional().isBoolean().withMessage('permanent must be a boolean'),
  validate,
  BaseController.asyncHandler(AdminController.delete)
);

module.exports = router;

