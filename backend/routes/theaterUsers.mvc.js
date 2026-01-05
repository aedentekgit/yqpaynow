const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const TheaterUserController = require('../controllers/TheaterUserController');
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
 * Theater User Routes (MVC Pattern)
 */

// GET /api/theater-users
router.get('/',
  authenticateToken,
  query('theaterId').optional().isMongoId().withMessage('Invalid theater ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  validate,
  BaseController.asyncHandler(TheaterUserController.getAll)
);

// POST /api/theater-users
router.post('/',
  authenticateToken,
  body('theaterId').optional().isMongoId().withMessage('Valid theater ID is required'),
  body('theater').optional().isMongoId().withMessage('Valid theater ID is required'),
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phoneNumber').trim().notEmpty().withMessage('Phone number is required'),
  validate,
  BaseController.asyncHandler(TheaterUserController.create)
);

// PUT /api/theater-users/:userId
router.put('/:userId',
  authenticateToken,
  BaseController.asyncHandler(TheaterUserController.update)
);

// DELETE /api/theater-users/:userId
router.delete('/:userId',
  authenticateToken,
  BaseController.asyncHandler(TheaterUserController.delete)
);

module.exports = router;

