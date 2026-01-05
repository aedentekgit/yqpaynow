const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Theater = require('../models/Theater');
const Settings = require('../models/Settings');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/theaters
 * Get all theaters with pagination and filtering
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
  query('search').optional().isLength({ min: 1 }).withMessage('Search term must not be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search, isActive } = req.query;

    // Build query
    const query = {};
    if (status) query.status = status;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query
    const theaters = await Theater.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Theater.countDocuments(query);

    res.json({
      success: true,
      data: theaters,
      pagination: {
        current: page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get theaters error:', error);
    res.status(500).json({
      error: 'Failed to fetch theaters',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/theaters/:id
 * Get a specific theater by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id).select('-password');
    
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: theater
    });

  } catch (error) {
    console.error('Get theater error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to fetch theater',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/theaters
 * Create a new theater
 */
router.post('/', [
  authenticateToken,
  requireRole(['super_admin']),
  body('name').notEmpty().trim().withMessage('Theater name is required'),
  body('username').notEmpty().trim().toLowerCase().withMessage('Username is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      name,
      username,
      password,
      email,
      phone,
      address,
      location,
      settings,
      branding
    } = req.body;

    // Check if username already exists
    const existingTheater = await Theater.findOne({ username });
    if (existingTheater) {
      return res.status(409).json({
        error: 'Username already exists',
        code: 'USERNAME_EXISTS'
      });
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await Theater.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({
          error: 'Email already exists',
          code: 'EMAIL_EXISTS'
        });
      }
    }

    // Create theater
    const theater = new Theater({
      name,
      username,
      password,
      email,
      phone,
      address,
      location,
      settings: {
        ...settings,
        currency: settings?.currency || 'INR',
        timezone: settings?.timezone || 'Asia/Kolkata',
        language: settings?.language || 'en'
      },
      branding: {
        ...branding,
        primaryColor: branding?.primaryColor || '#6B0E9B',
        secondaryColor: branding?.secondaryColor || '#F3F4F6'
      }
    });

    const savedTheater = await theater.save();

    // Initialize default settings for the theater
    await Settings.initializeDefaults(savedTheater._id);

    res.status(201).json({
      success: true,
      message: 'Theater created successfully',
      data: {
        id: savedTheater._id,
        name: savedTheater.name,
        username: savedTheater.username,
        email: savedTheater.email,
        phone: savedTheater.phone,
        status: savedTheater.status,
        createdAt: savedTheater.createdAt
      }
    });

  } catch (error) {
    console.error('Create theater error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate entry',
        message: 'Username or email already exists'
      });
    }
    res.status(500).json({
      error: 'Failed to create theater',
      message: 'Internal server error'
    });
  }
});

/**
 * PUT /api/theaters/:id
 * Update a theater
 */
router.put('/:id', [
  authenticateToken,
  body('name').optional().notEmpty().trim().withMessage('Theater name cannot be empty'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Check authorization (super_admin or theater owner)
    if (req.user.role !== 'super_admin' && req.user.theaterId !== req.params.id) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const updateData = { ...req.body };
    
    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updateData.password;
    delete updateData.username;

    // Update theater
    const updatedTheater = await Theater.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Theater updated successfully',
      data: updatedTheater
    });

  } catch (error) {
    console.error('Update theater error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to update theater',
      message: 'Internal server error'
    });
  }
});

/**
 * PUT /api/theaters/:id/password
 * Update theater password
 */
router.put('/:id/password', [
  authenticateToken,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.theaterId !== req.params.id) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password (only if not super admin)
    if (req.user.role !== 'super_admin') {
      const isCurrentPasswordValid = await theater.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: 'Current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD'
        });
      }
    }

    // Update password
    theater.password = newPassword;
    await theater.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to update password',
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/theaters/:id
 * Delete a theater (soft delete)
 */
router.delete('/:id', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Soft delete
    theater.isActive = false;
    theater.status = 'inactive';
    await theater.save();

    res.json({
      success: true,
      message: 'Theater deleted successfully'
    });

  } catch (error) {
    console.error('Delete theater error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to delete theater',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/theaters/:id/dashboard
 * Get theater dashboard data
 */
router.get('/:id/dashboard', [authenticateToken], async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id).select('-password');
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.theaterId !== req.params.id) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Get dashboard statistics
    const Product = require('../models/Product');
    const Order = require('../models/Order');
    
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      todayOrders,
      todayRevenue
    ] = await Promise.all([
      Product.countDocuments({ theaterId: req.params.id }),
      Product.countDocuments({ theaterId: req.params.id, isActive: true, status: 'active' }),
      Order.countDocuments({ theaterId: req.params.id }),
      Order.countDocuments({ 
        theaterId: req.params.id,
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
      }),
      Order.aggregate([
        {
          $match: {
            theaterId: new require('mongoose').Types.ObjectId(req.params.id),
            createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
            'payment.status': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.total' }
          }
        }
      ])
    ]);

    const dashboardData = {
      theater: {
        id: theater._id,
        name: theater.name,
        status: theater.status,
        isActive: theater.isActive
      },
      stats: {
        products: {
          total: totalProducts,
          active: activeProducts
        },
        orders: {
          total: totalOrders,
          today: todayOrders
        },
        revenue: {
          today: todayRevenue.length > 0 ? todayRevenue[0].total : 0,
          currency: theater.settings?.currency || 'INR'
        }
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: 'Internal server error'
    });
  }
});

module.exports = router;