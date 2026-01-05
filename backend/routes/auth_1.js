const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Theater = require('../models/Theater');
const User = require('../models/User');

const router = express.Router();

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      username: user.username,
      role: user.role,
      theaterId: user.theaterId
    },
    require('../utils/jwtHelper').getJWTSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user._id },
    process.env.JWT_REFRESH_SECRET || 'yqpaynow-super-secret-refresh-key-development-only',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, password } = req.body;

    // Check for default admin credentials
    if (username === 'admin111' && password === 'admin111') {
      const adminUser = {
        _id: 'admin_default',
        username: 'admin111',
        role: 'super_admin',
        theaterId: null
      };

      const token = generateToken(adminUser);
      const refreshToken = generateRefreshToken(adminUser);

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        refreshToken,
        user: {
          id: adminUser._id,
          username: adminUser.username,
          role: adminUser.role,
          theaterId: adminUser.theaterId
        }
      });
    }

    // Check MongoDB connection first
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({
        error: 'Database connection error',
        message: 'MongoDB is not connected. Please check your database connection.',
        code: 'DATABASE_CONNECTION_ERROR'
      });
    }

    // Find user in database with timeout
    let user;
    let dbError = null;
    try {
      user = await User.findOne({ username }).populate('theaterId').maxTimeMS(2000);
    } catch (error) {
      console.error('❌ [Login] Database error finding user:', error.message);
      dbError = error;
      // Check if it's a connection/timeout error
      if (error.message && (
        error.message.includes('connection') ||
        error.message.includes('timeout') ||
        error.message.includes('not connected') ||
        error.name === 'MongoServerError' ||
        error.name === 'MongoNetworkError'
      )) {
        return res.status(503).json({
          error: 'Database connection error',
          message: `MongoDB connection failed: ${error.message}`,
          code: 'DATABASE_CONNECTION_ERROR'
        });
      }
    }
    
    // If no user found, check if it's a theater login
    if (!user) {
      try {
        const theater = await Theater.findOne({ username }).maxTimeMS(2000);
        if (theater && await bcrypt.compare(password, theater.password)) {
          user = {
            _id: theater._id,
            username: theater.username,
            role: 'theater_admin',
            theaterId: theater._id,
            theaterName: theater.name
          };
        }
      } catch (error) {
        console.error('❌ [Login] Database error finding theater:', error.message);
        // Check if it's a connection/timeout error
        if (error.message && (
          error.message.includes('connection') ||
          error.message.includes('timeout') ||
          error.message.includes('not connected') ||
          error.name === 'MongoServerError' ||
          error.name === 'MongoNetworkError'
        )) {
          return res.status(503).json({
            error: 'Database connection error',
            message: `MongoDB connection failed: ${error.message}`,
            code: 'DATABASE_CONNECTION_ERROR'
          });
        }
      }
    }

    if (!user) {
      // If we had a database error but still no user, it might be a connection issue
      if (dbError && (
        dbError.message.includes('connection') ||
        dbError.message.includes('timeout') ||
        dbError.message.includes('not connected')
      )) {
        return res.status(503).json({
          error: 'Database connection error',
          message: `MongoDB connection failed: ${dbError.message}`,
          code: 'DATABASE_CONNECTION_ERROR'
        });
      }
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password for regular users
    if (user.password && !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update last login
    if (user.updateOne) {
      await user.updateOne({ lastLogin: new Date() });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        theaterId: user.theaterId,
        theaterName: user.theaterName || (user.theaterId && user.theaterId.name)
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token using refresh token
 */
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || 'yqpaynow-super-secret-refresh-key-development-only'
    );

    // Find user
    const user = await User.findById(decoded.userId).populate('theaterId');
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // In production, you might want to maintain a blacklist of tokens
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('theaterId').select('-password');
    
    if (!user) {
      // Handle default admin case
      if (req.user.userId === 'admin_default') {
        return res.json({
          success: true,
          user: {
            id: 'admin_default',
            username: 'admin111',
            role: 'super_admin',
            theaterId: null
          }
        });
      }
      
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        theaterId: user.theaterId,
        theaterName: user.theaterId ? user.theaterId.name : null,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      error: 'Failed to get user information',
      message: 'Internal server error'
    });
  }
});

module.exports = router;