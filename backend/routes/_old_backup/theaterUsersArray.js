const express = require('express');
const router = express.Router();
const TheaterUserArray = require('../models/TheaterUserArray');
const bcrypt = require('bcryptjs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { body, validationResult, param, query } = require('express-validator');
/**
 * @route   GET /api/theater-users-array
 * @desc    Get theater users for a theater (array-based structure)
 * @access  Private
 */
router.get('/', [
  authenticateToken,
  query('theaterId').optional().isMongoId().withMessage('Invalid theater ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  query('search').optional().isString().withMessage('Search must be string')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { theaterId, limit = 10, page = 1, isActive, search } = req.query;
    
    if (!theaterId) {
      return res.status(400).json({
        success: false,
        message: 'Theater ID is required'
      });
    }

    // Get users for theater using static method
    const result = await TheaterUserArray.getByTheater(theaterId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined
    });
    if (result.users.length > 0) {

    }

    res.json({
      success: true,
      data: {
        users: result.users,
        pagination: result.pagination,
        summary: result.summary,
        theater: result.theater
      }
    });

  } catch (error) {
    console.error('❌ Error fetching theater users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch theater users',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/theater-users-array
 * @desc    Create a new theater user (theaterId in body)
 * @access  Private (Admin/Theater Admin)
 */
router.post('/', [
  authenticateToken,
  body('theaterId').optional().isMongoId().withMessage('Valid theater ID is required'),
  body('theater').optional().isMongoId().withMessage('Valid theater ID is required'), // Accept both fields
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phoneNumber').trim().notEmpty().withMessage('Phone number is required'),
  body('pin').optional().isLength({ min: 4, max: 4 }).isNumeric().withMessage('PIN must be 4 digits if provided'),
  body('role').optional().isMongoId().withMessage('Valid role ID required if provided'),
  body('permissions').optional().isObject().withMessage('Permissions must be an object'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('isEmailVerified').optional().isBoolean().withMessage('isEmailVerified must be boolean')
], async (req, res) => {
  try {

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }


    // Accept both 'theater' and 'theaterId' fields for compatibility
    const theaterId = req.body.theaterId || req.body.theater;
    
    
    if (!theaterId) {
      return res.status(400).json({
        success: false,
        message: 'Theater ID is required (theater or theaterId field)'
      });
    }

    const { 
      username, 
      email, 
      password, 
      fullName, 
      phoneNumber,
      pin, // Optional - will be auto-generated if not provided
      role, 
      permissions = {}, 
      isActive = true,
      isEmailVerified = false,
      profileImage = null
    } = req.body;


    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Find or create users document for theater
    let usersDoc = await TheaterUserArray.findOrCreateByTheater(theaterId);
    
    // Add new user
    const newUser = await usersDoc.addUser({
      username: username.trim(),
      email: email.trim(),
      password: hashedPassword,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      pin: pin || undefined, // Pass undefined to trigger auto-generation
      role: role || null,
      permissions,
      isActive,
      isEmailVerified,
      profileImage,
      createdBy: req.user?.userId || null
    });
    
    // Populate theater info (field is theaterId, not theater)
    await usersDoc.populate('theaterId', 'name location');
    
    res.status(201).json({
      success: true,
      message: 'Theater user created successfully',
      data: {
        user: newUser,
        theater: usersDoc.theaterId,
        metadata: usersDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error creating theater user:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    
    // Handle specific errors
    if (error.message.includes('already exists')) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: 'Username already exists in this theater'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create theater user',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/theater-users-array/:userId
 * @desc    Update a theater user
 * @access  Private (Admin/Theater Admin)
 */
router.put('/:userId', [
  authenticateToken,
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('username').optional().trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('phoneNumber').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('role').optional().isMongoId().withMessage('Valid role ID required'),
  body('permissions').optional().isObject().withMessage('Permissions must be an object'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('isEmailVerified').optional().isBoolean().withMessage('isEmailVerified must be boolean')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { theaterId, password, ...updateData } = req.body;

    // Find users document for theater
    const usersDoc = await TheaterUserArray.findOne({ theaterId: theaterId });
    if (!usersDoc) {
      return res.status(404).json({
        success: false,
        message: 'Theater users document not found'
      });
    }

    // Hash password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await usersDoc.updateUser(userId, updateData);

    // Populate theater info
    await usersDoc.populate('theaterId', 'name location');
    res.json({
      success: true,
      message: 'Theater user updated successfully',
      data: {
        user: updatedUser,
        theater: usersDoc.theaterId,
        metadata: usersDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error updating theater user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update theater user',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/theater-users-array/:userId
 * @desc    Delete a theater user (soft delete by default, permanent with ?permanent=true)
 * @access  Private (Admin/Theater Admin)
 */
router.delete('/:userId', [
  authenticateToken,
  param('userId').isMongoId().withMessage('Invalid user ID'),
  query('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  query('permanent').optional().isBoolean().withMessage('Permanent must be boolean')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { theaterId, permanent } = req.query;

    // Find users document for theater
    const usersDoc = await TheaterUserArray.findOne({ theaterId: theaterId });
    if (!usersDoc) {
      return res.status(404).json({
        success: false,
        message: 'Theater users document not found'
      });
    }

    // ✅ FIX: Permanently delete by default (remove from array)
    // Use soft delete (deactivate) only if permanent=false
    let result;
    if (permanent === 'false') {
      // Soft deletion (deactivate) - only if explicitly requested
      result = await usersDoc.deleteUser(userId);

    } else {
      // Permanent deletion (default) - remove from array
      result = await usersDoc.permanentDeleteUser(userId);
    }

    // Populate theater info
    await usersDoc.populate('theaterId', 'name location');

    res.json({
      success: true,
      message: permanent === 'false' ? 'Theater user deactivated' : 'Theater user permanently deleted',
      data: {
        theater: usersDoc.theaterId,
        metadata: usersDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error deleting theater user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete theater user',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/theater-users-array/:userId
 * @desc    Get a specific theater user
 * @access  Private
 */
router.get('/:userId', [
  authenticateToken,
  param('userId').isMongoId().withMessage('Invalid user ID'),
  query('theaterId').isMongoId().withMessage('Valid theater ID is required')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { theaterId } = req.query;

    // Find users document for theater
    const usersDoc = await TheaterUserArray.findOne({ theaterId: theaterId }).populate('theaterId', 'name location');
    if (!usersDoc) {
      return res.status(404).json({
        success: false,
        message: 'Theater users document not found'
      });
    }

    // Find specific user
    const user = usersDoc.users.id(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    res.json({
      success: true,
      data: {
        user,
        theater: usersDoc.theaterId,
        metadata: usersDoc.metadata
      }
    });

  } catch (error) {
    console.error('❌ Error fetching theater user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch theater user',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/theater-users-array/:userId/login
 * @desc    Update user last login time
 * @access  Private
 */
router.post('/:userId/login', [
  authenticateToken,
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('theaterId').isMongoId().withMessage('Valid theater ID is required')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { theaterId } = req.body;

    // Find users document for theater
    const usersDoc = await TheaterUserArray.findOne({ theaterId: theaterId });
    if (!usersDoc) {
      return res.status(404).json({
        success: false,
        message: 'Theater users document not found'
      });
    }

    // Update last login
    const updatedUser = await usersDoc.updateLastLogin(userId);
    res.json({
      success: true,
      message: 'Last login updated successfully',
      data: {
        user: updatedUser
      }
    });

  } catch (error) {
    console.error('❌ Error updating last login:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update last login',
      error: error.message
    });
  }
});

module.exports = router;