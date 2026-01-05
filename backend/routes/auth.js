const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Theater = require('../models/Theater');
const User = require('../models/User');
const agentManager = require('../services/agent-manager');
const { ensureDatabaseReady } = require('../utils/mongodbQueryHelper');

const router = express.Router();

// Generate JWT token
const generateToken = (user) => {
  // ✅ FIX: Ensure theaterId is converted to string for consistent comparison
  let theaterId = null;
  if (user.theaterId) {
    // Handle ObjectId objects (from MongoDB) - convert to string
    if (user.theaterId.toString && typeof user.theaterId.toString === 'function') {
      theaterId = String(user.theaterId.toString());
    } else if (user.theaterId._id) {
      // Handle populated theaterId objects
      theaterId = String(user.theaterId._id.toString());
    } else {
      theaterId = String(user.theaterId);
    }
  }
  
  const tokenPayload = {
    userId: user._id,
    username: user.username,
    role: user.role,
    userType: user.userType, // ✅ ADD: Include userType for proper role checking
    theaterId: theaterId // ✅ FIX: Always store as string
  };
  const { getJWTSecret } = require('../utils/jwtHelper');
  return jwt.sign(
    tokenPayload,
    getJWTSecret(),
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
 * Authenticate user - supports both email (admins) and username (users)
 */
router.post('/login', [
  body('email').optional(),
  body('username').optional(),
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

    const { email, username, password } = req.body;
    const loginIdentifier = email || username;
    let authenticatedUser = null;


    if (!loginIdentifier) {
      return res.status(400).json({
        error: 'Username or email is required',
        code: 'MISSING_IDENTIFIER'
      });
    }

    // Ensure database connection is ready before accessing collections
    let db;
    try {
      db = await ensureDatabaseReady(40000);
    } catch (error) {
      console.error(`❌ [Login] Database not ready:`, error.message);
      return res.status(503).json({
        success: false,
        error: 'Database connection not available. Please try again in a moment.',
        code: 'DATABASE_NOT_READY'
      });
    }

    // Step 1: Check ADMINS collection by email
    if (loginIdentifier.includes('@')) {
      try {
        const admin = await db.collection('admins')
          .findOne({ email: loginIdentifier, isActive: true });
        
        if (admin) {
          const passwordMatch = await bcrypt.compare(password, admin.password);
          
          if (passwordMatch) {
            // ✅ FIX: Normalize role to lowercase for consistent checks
            const normalizedRole = admin.role ? admin.role.toLowerCase() : 'super_admin';
            authenticatedUser = {
              _id: admin._id,
              username: admin.email,
              name: admin.name,
              role: normalizedRole,
              email: admin.email,
              phone: admin.phone,
              theaterId: null,
              userType: normalizedRole // Use normalized role for consistent auth checks
            };
            
            // Update last login
            await db.collection('admins')
              .updateOne({ _id: admin._id }, { 
                $set: { lastLogin: new Date() }
              });
          } else {
          }
        } else {
        }
      } catch (error) {
        console.error(`❌ [Login] Error checking ADMINS collection:`, error.message);
        console.error(`❌ [Login] Error stack:`, error.stack);
      }
    }

    // Step 2: Check THEATERUSERS collection by username if no admin found (ARRAY-BASED STRUCTURE)
    if (!authenticatedUser) {
      try {
        // Find the theater document that contains this user in its users array
        const theaterUsersDoc = await db.collection('theaterusers')
          .findOne({ 
            'users.username': loginIdentifier, 
            'users.isActive': true 
          });
        
        if (theaterUsersDoc && theaterUsersDoc.users) {
          // Find the specific user within the users array
          const theaterUser = theaterUsersDoc.users.find(
            u => u.username === loginIdentifier && u.isActive === true
          );
          
          if (theaterUser) {
            const passwordMatch = await bcrypt.compare(password, theaterUser.password);
            
            if (passwordMatch) {
              // ✅ Return pending status - PIN is required before completing login
              return res.json({
                success: true,
                isPinRequired: true,
                message: 'Password validated. Please enter your PIN.',
                pendingAuth: {
                  userId: theaterUser._id.toString(),
                  username: theaterUser.username,
                  loginUsername: loginIdentifier,  // ✅ Store what user actually typed
                  theaterId: theaterUsersDoc.theaterId.toString(),
                  // ⚠️ SECURITY: Store password temporarily for agent start
                  // This is encrypted in transit (HTTPS) and only kept in memory briefly
                  _tempPassword: password  // Only used for agent authentication
                }
              });
            } else {
            }
          } else {
          }
        } else {
        }
      } catch (error) {
        console.error(`❌ [Login] Error checking THEATERUSERS collection:`, error.message);
        console.error(`❌ [Login] Error stack:`, error.stack);
      }
    }

    // Step 3: Check legacy USERS collection by username if no theater user found
    if (!authenticatedUser) {
      try {
        const user = await User.findOne({ 
          username: loginIdentifier, 
          isActive: true 
        }).populate('theaterId');
        
        if (user) {
          const passwordMatch = await bcrypt.compare(password, user.password);
          
          if (passwordMatch) {
            // ✅ CHECK: Validate theater is active for theater users
            if (user.theaterId) {
              if (!user.theaterId.isActive) {
                return res.status(403).json({
                  success: false,
                  error: 'Theater access has been disabled. Please contact administration.',
                  code: 'THEATER_INACTIVE'
                });
              }
            }
            
            // ✅ FIX: Convert theaterId to string for consistent comparison
            let theaterIdStr = null;
            if (user.theaterId) {
              // Handle ObjectId objects or populated theaterId objects
              if (user.theaterId.toString && typeof user.theaterId.toString === 'function') {
                theaterIdStr = String(user.theaterId.toString());
              } else if (user.theaterId._id) {
                // Handle populated theaterId objects
                theaterIdStr = String(user.theaterId._id.toString());
              } else {
                theaterIdStr = String(user.theaterId);
              }
            }
            
            authenticatedUser = {
              _id: user._id,
              username: user.username,
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
              role: user.role,
              email: user.email,
              phone: user.phone,
              theaterId: theaterIdStr, // ✅ FIX: Store as string for consistent comparison
              theaterName: user.theaterId ? (user.theaterId.name || (user.theaterId.toString ? null : user.theaterId)) : null,
              userType: 'user'
            };
            
            // Update last login
            user.lastLogin = new Date();
            await user.save();
          } else {
          }
        } else {
        }
      } catch (error) {
        console.error(`❌ [Login] Error checking USERS collection:`, error.message);
        console.error(`❌ [Login] Error stack:`, error.stack);
      }
    }

    // Step 4: Authentication failed
    if (!authenticatedUser) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // ✅ SINGLE SESSION: Invalidate all previous sessions for this user
    const userId = authenticatedUser._id.toString();
    try {
      await db.collection('usersessions').deleteMany({
        userId: userId,
        isActive: true
      });
    } catch (sessionError) {
      console.error('⚠️ Error invalidating previous sessions:', sessionError);
      // Continue with login even if session cleanup fails
    }

    // Step 5: Generate tokens and respond
    const token = generateToken(authenticatedUser);
    const refreshToken = generateRefreshToken(authenticatedUser);

    // ✅ SINGLE SESSION: Store new session in database
    const sessionId = new mongoose.Types.ObjectId();
    try {
      // Clean token before storing (same format as middleware expects)
      const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
      
      await db.collection('usersessions').insertOne({
        _id: sessionId,
        userId: userId,
        token: cleanToken, // Store cleaned token for comparison
        refreshToken: refreshToken,
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        userAgent: req.headers['user-agent'] || 'unknown',
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });
    } catch (sessionError) {
      console.error('⚠️ Error creating session:', sessionError);
      // Continue with login even if session storage fails
    }

    // ✅ INCLUDE ROLE PERMISSIONS in response (theater users only)
    const response = {
      success: true,
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        id: authenticatedUser._id,
        username: authenticatedUser.username,
        name: authenticatedUser.name,
        role: authenticatedUser.role,
        email: authenticatedUser.email,
        phone: authenticatedUser.phone,
        theaterId: authenticatedUser.theaterId ? String(authenticatedUser.theaterId) : null, // ✅ Convert to string
        theaterName: authenticatedUser.theaterName,
        userType: authenticatedUser.userType
      }
    };

    // Add rolePermissions for theater users only (not super admin)
    if (authenticatedUser.rolePermissions && authenticatedUser.rolePermissions.length > 0) {
      response.rolePermissions = authenticatedUser.rolePermissions;
    }

    // 🚀 AUTO-START POS AGENT when theater user logs in
    if (authenticatedUser.theaterId && authenticatedUser.username) {
      try {
        const theaterIdStr = authenticatedUser.theaterId ? String(authenticatedUser.theaterId._id || authenticatedUser.theaterId) : null;
        const theaterName = authenticatedUser.theaterName || 'Theater';
        
        if (theaterIdStr) {
          // Check if agent is already running
          if (!agentManager.isAgentRunning(theaterIdStr)) {
            
            // Use the user's credentials (they just logged in successfully)
            agentManager.startAgent(
              authenticatedUser.username,  // Use logged-in user's username
              password,                    // Use the plaintext password from login
              theaterIdStr,
              theaterName
            ).catch(err => {
              console.error(`Failed to auto-start agent for ${theaterName}:`, err.message);
            });
            
            response.agentStatus = 'starting';
          } else {
            response.agentStatus = 'running';
          }
        }
      } catch (agentErr) {
        console.error('Error auto-starting agent:', agentErr.message);
        // Don't fail the login if agent start fails
        response.agentStatus = 'error';
      }
    }

    res.json(response);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/validate-pin
 * Validate PIN for theater users (second step of authentication)
 */
router.post('/validate-pin', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('pin').isLength({ min: 4, max: 4 }).withMessage('PIN must be 4 digits'),
  body('theaterId').notEmpty().withMessage('Theater ID is required'),
  body('_tempPassword').optional(),  // Accept temporary password for agent start
  body('loginUsername').optional()   // Accept login username for agent start
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId, pin, theaterId, _tempPassword, loginUsername } = req.body;

    // Ensure database connection is ready
    let db;
    try {
      db = await ensureDatabaseReady(40000);
    } catch (error) {
      console.error('❌ [Validate PIN] Database not ready:', error.message);
      return res.status(503).json({
        success: false,
        error: 'Database connection not available. Please try again in a moment.',
        code: 'DATABASE_NOT_READY'
      });
    }

    // Find the theater users document
    const theaterUsersDoc = await db.collection('theaterusers')
      .findOne({ 
        theaterId: new mongoose.Types.ObjectId(theaterId),
        'users._id': new mongoose.Types.ObjectId(userId)
      });
    if (!theaterUsersDoc) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    // Find the specific user in the array
    const theaterUser = theaterUsersDoc.users.find(
      u => u._id.toString() === userId && u.isActive === true
    );

    if (!theaterUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    // Validate PIN - ensure both are strings and trimmed
    const storedPin = String(theaterUser.pin || '').trim();
    const providedPin = String(pin || '').trim();
    
    if (storedPin !== providedPin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN. Please check your PIN and try again.',
        code: 'INVALID_PIN'
      });
    }
    // Get theater details and validate theater is active
    let theaterInfo = null;
    if (theaterUsersDoc.theaterId) {
      theaterInfo = await db.collection('theaters')
        .findOne({ _id: theaterUsersDoc.theaterId });
      
      // ✅ CHECK: Prevent login if theater is inactive
      if (!theaterInfo) {
        return res.status(404).json({
          success: false,
          error: 'Theater not found',
          code: 'THEATER_NOT_FOUND'
        });
      }
      
      if (theaterInfo.isActive === false) {
        return res.status(403).json({
          success: false,
          error: 'Theater access has been disabled. Please contact administration.',
          code: 'THEATER_INACTIVE'
        });
      }
    }

    // Get role details if role is ObjectId
    let roleInfo = null;
    let userType = 'theater_user';
    let rolePermissions = [];

    if (theaterUser.role) {
      try {
        if (typeof theaterUser.role === 'string' && theaterUser.role.includes('admin')) {
          userType = 'theater_admin';
        } else if (mongoose.Types.ObjectId.isValid(theaterUser.role)) {
          const rolesDoc = await db.collection('roles')
            .findOne({
              theater: theaterUsersDoc.theaterId,
              'roleList._id': new mongoose.Types.ObjectId(theaterUser.role)
            });

          if (rolesDoc && rolesDoc.roleList) {
            roleInfo = rolesDoc.roleList.find(
              r => r._id.toString() === theaterUser.role.toString() && r.isActive
            );

            if (roleInfo) {
              if (roleInfo.name && roleInfo.name.toLowerCase().includes('admin')) {
                userType = 'theater_admin';
              }

              if (roleInfo.permissions && Array.isArray(roleInfo.permissions)) {
                const accessiblePermissions = roleInfo.permissions.filter(p => p.hasAccess === true);
                rolePermissions = [{
                  role: {
                    _id: roleInfo._id,
                    name: roleInfo.name,
                    description: roleInfo.description || ''
                  },
                  permissions: accessiblePermissions
                }];
              }
            }
          }
        }
      } catch (roleError) {
      }
    }

    // ✅ FIX: Convert theaterId to string for consistent comparison
    let theaterIdStr = null;
    if (theaterUsersDoc.theaterId) {
      // Handle ObjectId objects - convert to string
      if (theaterUsersDoc.theaterId.toString && typeof theaterUsersDoc.theaterId.toString === 'function') {
        theaterIdStr = String(theaterUsersDoc.theaterId.toString());
      } else {
        theaterIdStr = String(theaterUsersDoc.theaterId);
      }
    }
    
    authenticatedUser = {
      _id: theaterUser._id,
      username: theaterUser.username,
      name: theaterUser.fullName || `${theaterUser.firstName || ''} ${theaterUser.lastName || ''}`.trim(),
      role: roleInfo ? roleInfo.name : (theaterUser.role || 'theater_user'),
      email: theaterUser.email,
      phone: theaterUser.phoneNumber,
      theaterId: theaterIdStr, // ✅ FIX: Store as string for consistent comparison
      theaterName: theaterInfo ? theaterInfo.name : null,
      userType: userType,
      rolePermissions: rolePermissions
    };

    // Update last login
    await db.collection('theaterusers')
      .updateOne(
        {
          theaterId: theaterUsersDoc.theaterId,
          'users._id': theaterUser._id
        },
        {
          $set: {
            'users.$.lastLogin': new Date(),
            'users.$.updatedAt': new Date()
          }
        }
      );

    // ✅ SINGLE SESSION: Invalidate all previous sessions for this user
    const sessionUserId = authenticatedUser._id.toString();
    try {
      await db.collection('usersessions').deleteMany({
        userId: sessionUserId,
        isActive: true
      });
    } catch (sessionError) {
      console.error('⚠️ Error invalidating previous sessions:', sessionError);
      // Continue with login even if session cleanup fails
    }

    // Generate tokens
    const token = generateToken(authenticatedUser);
    const refreshToken = generateRefreshToken(authenticatedUser);

    // ✅ SINGLE SESSION: Store new session in database
    const sessionId = new mongoose.Types.ObjectId();
    try {
      // Clean token before storing (same format as middleware expects)
      const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
      
      await db.collection('usersessions').insertOne({
        _id: sessionId,
        userId: sessionUserId,
        token: cleanToken, // Store cleaned token for comparison
        refreshToken: refreshToken,
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        userAgent: req.headers['user-agent'] || 'unknown',
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });
    } catch (sessionError) {
      console.error('⚠️ Error creating session:', sessionError);
      // Continue with login even if session storage fails
    }

    const response = {
      success: true,
      message: 'PIN validated successfully',
      token,
      refreshToken,
      user: {
        id: authenticatedUser._id,
        username: authenticatedUser.username,
        name: authenticatedUser.name,
        role: authenticatedUser.role,
        email: authenticatedUser.email,
        phone: authenticatedUser.phone,
        theaterId: authenticatedUser.theaterId ? String(authenticatedUser.theaterId) : null,
        theaterName: authenticatedUser.theaterName,
        userType: authenticatedUser.userType
      }
    };

    if (authenticatedUser.rolePermissions && authenticatedUser.rolePermissions.length > 0) {
      response.rolePermissions = authenticatedUser.rolePermissions;
    }

    // 🚀 AUTO-START POS AGENT when theater user logs in
    // ✅ FIX: Make agent start completely non-blocking - don't let it delay or crash the response
    if (authenticatedUser.theaterId && authenticatedUser.username) {
      // Set agent status optimistically before starting
      const theaterIdStr = String(authenticatedUser.theaterId);
      if (agentManager.isAgentRunning(theaterIdStr)) {
        response.agentStatus = 'running';
      } else {
        response.agentStatus = 'starting';
      }
      
      // Use setImmediate to defer agent start until after response is sent
      // Wrap in process.nextTick to ensure it happens in next event loop cycle
      process.nextTick(() => {
        // Use setTimeout with 0 delay to ensure response is fully sent first
        setTimeout(async () => {
          try {
            const theaterName = authenticatedUser.theaterName || 'Theater';
            
            // Double-check if agent is already running (in case it started between checks)
            if (!agentManager.isAgentRunning(theaterIdStr)) {
              
              // Use the login username (what user actually typed) for agent authentication
              const agentUsername = loginUsername || theaterUser.username;
              
              if (_tempPassword && agentUsername) {
                // Wrap in try-catch to prevent any errors from crashing
                // Use async/await to properly handle any promise rejections
                try {
                  await agentManager.startAgent(
                    agentUsername,         // ✅ Use login username
                    _tempPassword,         // Use the plaintext password from step 1
                    theaterIdStr,
                    theaterName,
                    pin                    // ✅ Pass user's PIN for authentication
                  ).catch(agentError => {
                    // Catch any promise rejections from startAgent
                    console.error(`❌ Failed to auto-start agent for ${theaterName}:`, agentError.message);
                    console.error(`❌ Agent start error stack:`, agentError.stack);
                    // Don't throw - agent start failure shouldn't affect login
                  });
                } catch (startErr) {
                  console.error(`❌ Failed to auto-start agent for ${theaterName}:`, startErr.message);
                  console.error(`❌ Agent start error stack:`, startErr.stack);
                  // Don't throw - agent start failure shouldn't affect login
                }
              } else {
                console.warn(`⚠️ Cannot start agent - missing credentials`);
              }
            } else {
            }
          } catch (agentErr) {
            console.error('❌ Error in agent start handler:', agentErr.message);
            console.error('❌ Agent start handler error stack:', agentErr.stack);
            // Don't fail the login if agent start fails
            // Make sure errors don't crash the process
            process.nextTick(() => {
              // Silently handle any unhandled errors
            });
          }
        }, 100); // Small delay to ensure response is sent
      });
    }
    
    // ✅ FIX: Send response immediately, don't wait for agent to start
    // Ensure response is sent before any async operations
    try {
      res.json(response);
    } catch (sendError) {
      console.error('❌ Error sending response:', sendError);
      // If response was already sent, ignore the error
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to send response',
          message: 'Internal server error'
        });
      }
    }

  } catch (error) {
    console.error('❌ PIN validation error:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request body:', req.body);
    
    // Don't expose internal error details to client in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Only send error response if headers haven't been sent
    // This prevents "Cannot set headers after they are sent" errors
    if (!res.headersSent) {
      try {
        res.status(500).json({
          success: false,
          error: 'PIN validation failed',
          message: isDevelopment ? error.message : 'Internal server error',
          ...(isDevelopment && { stack: error.stack })
        });
      } catch (sendError) {
        console.error('❌ Error sending error response:', sendError);
        // Connection might have been closed, ignore
      }
    } else {
      console.error('❌ Cannot send error response - headers already sent');
      // Log error but don't try to send response
    }
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
 * Logout user and invalidate session
 */
router.post('/logout', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId?.toString();
    let token = req.headers['authorization']?.split(' ')[1];

    // Ensure database connection is ready
    let db;
    try {
      db = await ensureDatabaseReady(40000);
    } catch (error) {
      // If database is not ready, still allow logout (graceful degradation)
      console.warn('⚠️ [Logout] Database not ready, proceeding without session invalidation');
    }

    // ✅ SINGLE SESSION: Invalidate session in database
    if (userId && token && db) {
      try {
        // Clean token for comparison
        token = String(token).trim().replace(/^["']|["']$/g, '');
        
        await db.collection('usersessions').updateMany(
          {
            userId: userId,
            token: token,
            isActive: true
          },
          {
            $set: {
              isActive: false,
              loggedOutAt: new Date()
            }
          }
        );
      } catch (sessionError) {
        console.error('⚠️ Error invalidating session:', sessionError);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
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

/**
 * GET /api/auth/check-session
 * Check if current session is still valid (for frontend polling)
 */
router.get('/check-session', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId?.toString();
    let token = req.headers['authorization']?.split(' ')[1];

    if (!userId || !token) {
      return res.status(401).json({
        valid: false,
        error: 'Missing session information'
      });
    }

    // Ensure database connection is ready before accessing collections
    let db;
    try {
      db = await ensureDatabaseReady(40000);
    } catch (error) {
      console.error('❌ [Check Session] Database not ready:', error.message);
      return res.status(503).json({
        valid: false,
        error: 'Database connection not available. Please try again in a moment.',
        code: 'DATABASE_NOT_READY'
      });
    }

    // Clean token for comparison
    token = String(token).trim().replace(/^["']|["']$/g, '');

    // Check if session is active
    const activeSession = await db.collection('usersessions')
      .findOne({
        userId: userId,
        token: token,
        isActive: true
      });

    if (!activeSession) {
      return res.status(401).json({
        valid: false,
        error: 'Session invalidated',
        code: 'SESSION_INVALIDATED',
        message: 'You have been logged out because you logged in from another device/browser.'
      });
    }

    // Update last activity
    await db.collection('usersessions')
      .updateOne(
        { _id: activeSession._id },
        { $set: { lastActivity: new Date() } }
      );

    res.json({
      valid: true,
      message: 'Session is active'
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({
      valid: false,
      error: 'Failed to check session'
    });
  }
});

/**
 * GET /api/auth/validate
 * Validate JWT token and return user info if valid
 * Supports both admin users (from admins collection) and theater users (from theaterusers collection)
 */
router.get('/validate', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userType = req.user.userType || req.user.role;
    let userData = null;

    // Ensure database connection is ready
    let db;
    try {
      db = await ensureDatabaseReady(40000);
    } catch (error) {
      console.error('❌ [Validate] Database not ready:', error.message);
      return res.status(503).json({
        error: 'Database connection not available. Please try again in a moment.',
        code: 'DATABASE_NOT_READY'
      });
    }

    // Check if userId is a valid ObjectId (for MongoDB ObjectIds)
    // Handle string IDs for default admin
    if (userId === 'admin_default') {
      // Default admin user
      userData = {
        _id: 'admin_default',
        username: 'admin111',
        email: 'admin@example.com',
        role: 'super_admin',
        userType: 'super_admin',
        theaterId: null,
        name: 'Admin',
        isActive: true
      };
    } else if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        error: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
    } else {
      // Check admins collection first (for super_admin)
      if (userType === 'super_admin' || !userType) {
        try {
          const admin = await db.collection('admins')
            .findOne({ _id: new mongoose.Types.ObjectId(userId), isActive: true });
          
          if (admin) {
            // ✅ FIX: Normalize role to lowercase for consistent checks
            const normalizedRole = admin.role ? admin.role.toLowerCase() : 'super_admin';
            userData = {
              _id: admin._id,
              username: admin.email,
              email: admin.email,
              name: admin.name,
              role: normalizedRole,
              userType: normalizedRole, // Use normalized role
              theaterId: null,
              phone: admin.phone,
              isActive: admin.isActive,
              createdAt: admin.createdAt,
              lastLogin: admin.lastLogin
            };
          }
        } catch (error) {
          console.error('Error fetching admin:', error);
        }
      }

      // If not found in admins, check theaterusers collection
      if (!userData) {
        try {
          // Try direct query first (more efficient)
          let theaterUsersDoc = await db.collection('theaterusers')
            .findOne({ 
              'users._id': new mongoose.Types.ObjectId(userId),
              'users.isActive': true
            });

          let theaterUser = null;

          // If direct query found a document, extract the user from the array
          if (theaterUsersDoc && theaterUsersDoc.users) {
            theaterUser = theaterUsersDoc.users.find(
              u => u._id && u._id.toString() === userId.toString() && u.isActive === true
            );
          }

          // If direct query didn't work, try iterating through all documents
          // (fallback for edge cases where _id format might differ)
          if (!theaterUser) {
            const theaterUsersDocs = await db.collection('theaterusers')
              .find({ 'users.isActive': true })
              .toArray();

            for (const doc of theaterUsersDocs) {
              if (doc.users && Array.isArray(doc.users)) {
                theaterUser = doc.users.find(u => {
                  const userIdStr = userId.toString();
                  const userObjIdStr = u._id ? u._id.toString() : null;
                  return userObjIdStr === userIdStr && u.isActive === true;
                });
                
                if (theaterUser) {
                  theaterUsersDoc = doc;
                  break;
                }
              }
            }
          }

          if (theaterUser) {
            // Get theater info
            let theaterInfo = null;
            if (theaterUsersDoc.theaterId) {
              try {
                const theater = await db.collection('theaters')
                  .findOne({ _id: theaterUsersDoc.theaterId });
                if (theater) {
                  theaterInfo = {
                    _id: theater._id,
                    name: theater.name,
                    location: theater.location
                  };
                }
              } catch (error) {
                console.error('Error fetching theater:', error);
              }
            }

            userData = {
              _id: theaterUser._id,
              username: theaterUser.username,
              email: theaterUser.email,
              name: theaterUser.name || `${theaterUser.firstName || ''} ${theaterUser.lastName || ''}`.trim(),
              firstName: theaterUser.firstName,
              lastName: theaterUser.lastName,
              role: theaterUser.role,
              userType: userType || 'theater_user',
              theaterId: theaterUsersDoc.theaterId,
              theaterName: theaterInfo?.name || null,
              phone: theaterUser.phone,
              isActive: theaterUser.isActive,
              createdAt: theaterUser.createdAt,
              lastLogin: theaterUser.lastLogin
            };
          }
        } catch (error) {
          console.error('Error fetching theater user:', error);
        }
      }
    }

    if (!userData) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      valid: true,
      user: {
        id: userData._id,
        username: userData.username,
        email: userData.email,
        name: userData.name,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        userType: userData.userType,
        theaterId: userData.theaterId,
        theaterName: userData.theaterName,
        phone: userData.phone,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin
      }
    });

  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      error: 'Failed to validate token',
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;