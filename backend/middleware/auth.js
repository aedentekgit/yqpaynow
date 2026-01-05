const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { getJWTSecret } = require('../utils/jwtHelper');

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  // Check multiple possible header formats (Express normalizes to lowercase)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  // ✅ FIX: Clean token to handle malformed tokens (remove quotes, trim whitespace)
  if (token) {
    token = String(token).trim().replace(/^["']|["']$/g, '');
    
    // Validate token format (should have 3 parts separated by dots)
    if (token.split('.').length !== 3) {
      return res.status(401).json({ 
        error: 'Invalid token format',
        code: 'TOKEN_MALFORMED',
        message: 'Token format is invalid. Please login again.'
      });
    }
  }

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_MISSING',
      message: 'Please login to access this resource'
    });
  }

  jwt.verify(token, getJWTSecret(), async (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
    }

    // ✅ SINGLE SESSION: Check if session is still active in database
    try {
      // ✅ FIX: Check if database connection is available
      if (!mongoose.connection.db) {
        console.warn('⚠️ Database not connected, skipping session validation');
        // Allow request to proceed if database is not connected (for development)
        // In production, you might want to return an error here
        req.user = decoded;
        return next();
      }
      
      const userId = decoded.userId?.toString();
      if (userId && userId !== 'admin_default') {
        // Clean token for comparison (same as stored)
        const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
        
        const activeSession = await mongoose.connection.db.collection('usersessions')
          .findOne({
            userId: userId,
            token: cleanToken,
            isActive: true
          });

        if (!activeSession) {
          // Session was invalidated (user logged in elsewhere)
          return res.status(401).json({
            error: 'Session expired',
            code: 'SESSION_INVALIDATED',
            message: 'You have been logged out because you logged in from another device/browser. Please login again.'
          });
        }

        // Update last activity
        await mongoose.connection.db.collection('usersessions')
          .updateOne(
            { _id: activeSession._id },
            { $set: { lastActivity: new Date() } }
          );
      }
    } catch (sessionError) {
      // If session check fails, allow request to continue (don't block on DB errors)
      console.error('⚠️ Session validation error:', sessionError);
    }
    
    // ✅ FIX: Check if user's theater is active (for theater users only, skip for super_admin)
    // Super admin should not be blocked by theater status
    // ✅ FIX: Case-insensitive role check
    const normalizedUserType = decoded.userType ? decoded.userType.toLowerCase() : '';
    const normalizedRole = decoded.role ? decoded.role.toLowerCase() : '';
    if ((normalizedUserType === 'theater_user' || normalizedUserType === 'theater_admin') && 
        normalizedUserType !== 'super_admin' && normalizedRole !== 'super_admin') {
      try {
        const Theater = require('../models/Theater');
        const theaterId = decoded.theaterId || decoded.theater;
        
        if (!theaterId) {
          // Don't block - let the request continue, other middleware will handle it
        } else {
          const theater = await Theater.findById(theaterId).lean();
          
          if (!theater) {
            return res.status(403).json({
              error: 'Theater not found',
              code: 'THEATER_NOT_FOUND',
              message: 'Your theater account could not be found. Please contact support.'
            });
          }
          
          if (!theater.isActive) {
            return res.status(403).json({
              error: 'Your theater account has been deactivated',
              code: 'THEATER_DEACTIVATED',
              message: 'Your theater account has been deactivated. Please contact support to reactivate.'
            });
          }
        }
      } catch (error) {
        // Continue with auth - don't block on database errors (connection issues, etc.)
        // This allows the request to proceed even if we can't verify theater status
      }
    }
    
    req.user = decoded;
    next();
  });
};

// Optional Authentication (for endpoints that work with or without auth)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, getJWTSecret(), (err, decoded) => {
      if (!err) {
        req.user = decoded;
      }
    });
  }
  
  next();
};

// Role-based authorization middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // ✅ FIX: Check both 'role' and 'userType' fields with case-insensitive comparison
    const userRole = req.user.role || req.user.userType;
    const normalizedUserRole = userRole ? userRole.toLowerCase() : '';
    const normalizedRoles = roles.map(r => r.toLowerCase());
    if (!normalizedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: roles,
        userRole: userRole,
        tokenRole: req.user.role,
        tokenUserType: req.user.userType
      });
    }

    next();
  };
};

// Theater ownership middleware (ensure user can only access their theater data)
const requireTheaterAccess = async (req, res, next) => {
  if (!req.user) {
    console.error('❌ [requireTheaterAccess] No user in request');
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const requestedTheaterId = req.params.theaterId || req.body.theaterId;
  
  if (!requestedTheaterId) {
    console.error('❌ [requireTheaterAccess] No theaterId in request params or body');
    return res.status(400).json({
      error: 'Theater ID is required',
      code: 'THEATER_ID_REQUIRED'
    });
  }

  // ✅ FIX: Normalize theaterId to string for comparison
  const requestedTheaterIdStr = String(requestedTheaterId).trim();
  
  // Super admin or admin can access all theaters
  // ✅ FIX: Case-insensitive role check
  const normalizedRole = req.user.role ? String(req.user.role).toLowerCase() : '';
  const normalizedUserType = req.user.userType ? String(req.user.userType).toLowerCase() : '';
  
  if (normalizedRole === 'super_admin' || normalizedRole === 'admin' || normalizedUserType === 'admin' || normalizedUserType === 'super_admin') {
    return next();
  }

  // ✅ FIX: Normalize user's theaterId to string for comparison
  // Handle both ObjectId objects and strings
  let userTheaterId = null;
  if (req.user.theaterId) {
    // Handle ObjectId objects (from MongoDB)
    if (req.user.theaterId.toString) {
      userTheaterId = String(req.user.theaterId.toString());
    } else {
      userTheaterId = String(req.user.theaterId);
    }
  } else if (req.user.theater) {
    // Fallback to theater field
    if (req.user.theater.toString) {
      userTheaterId = String(req.user.theater.toString());
    } else {
      userTheaterId = String(req.user.theater);
    }
  }

  // ✅ NEW: Check if theater is active before granting access
  const Theater = require('../models/Theater');
  try {
    const theater = await Theater.findById(requestedTheaterIdStr);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }
    if (!theater.isActive) {
      return res.status(403).json({
        error: 'Theater is currently inactive',
        code: 'THEATER_INACTIVE'
      });
    }
  } catch (error) {
    console.error('❌ [requireTheaterAccess] Error checking theater:', error.message);
    return res.status(500).json({
      error: 'Unable to verify theater status',
      code: 'THEATER_CHECK_ERROR',
      details: error.message
    });
  }

  // ✅ FIX: Compare theater IDs (both normalized to strings)
  if (userTheaterId && userTheaterId.trim() === requestedTheaterIdStr) {
    return next();
  }

  // ✅ FIX: Check role-based access (case-insensitive)
  const roleLower = normalizedRole;
  const userTypeLower = normalizedUserType;
  
  // Manager role can access their own theater
  if (roleLower === 'manager' && userTheaterId && userTheaterId.trim() === requestedTheaterIdStr) {
    return next();
  }

  // Theater admin can only access their own theater
  if ((roleLower === 'theater_admin' || userTypeLower === 'theater_admin') && userTheaterId && userTheaterId.trim() === requestedTheaterIdStr) {
    return next();
  }

  // Theater staff can only access their own theater
  if ((roleLower === 'theater_staff' || roleLower === 'staff') && userTheaterId && userTheaterId.trim() === requestedTheaterIdStr) {
    return next();
  }

  // ✅ FIX: Theater user (new format) - check theater or theaterId field
  // Check both userType and role for theater users
  if (userTypeLower === 'theater_user' || roleLower.includes('theater') || userTypeLower === 'theater_admin') {
    if (userTheaterId && userTheaterId.trim() === requestedTheaterIdStr) {
      return next();
    }
  }
  
  // ✅ DEBUG: Log the mismatch for troubleshooting
  console.error('❌ [requireTheaterAccess] Access denied - theater ID mismatch');
  console.error('   Requested theaterId:', requestedTheaterIdStr);
  console.error('   User theaterId:', userTheaterId || 'null');
  console.error('   User role:', req.user.role || 'null');
  console.error('   User userType:', req.user.userType || 'null');
  console.error('   User object:', JSON.stringify(req.user, null, 2));
  
  return res.status(403).json({
    error: 'Access denied to this theater',
    code: 'THEATER_ACCESS_DENIED',
    details: {
      requestedTheaterId: requestedTheaterIdStr,
      userTheaterId: userTheaterId || null,
      userRole: req.user.role || null,
      userType: req.user.userType || null
    }
  });
};

// ✅ NEW: Role-based page access middleware
// Checks if user has permission to access a specific page based on their role
const requirePageAccess = (pageName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Super admin has access to everything
    // ✅ FIX: Case-insensitive role check
    const normalizedRole = req.user.role ? req.user.role.toLowerCase() : '';
    const normalizedUserType = req.user.userType ? req.user.userType.toLowerCase() : '';
    if (normalizedRole === 'super_admin' || normalizedUserType === 'super_admin') {
      return next();
    }

    // Theater users must have role-based permissions
    if (req.user.userType === 'theater_admin' || req.user.userType === 'theater_user') {
      try {
        // ✅ FIX: Check if database connection is available
        if (!mongoose.connection.db) {
          console.warn('⚠️ Database not connected, allowing request to proceed');
          return next(); // Allow request if DB not connected
        }
        
        // Get user's role from theaterusers collection
        const theaterUser = await mongoose.connection.db.collection('theaterusers')
          .findOne({ _id: new mongoose.Types.ObjectId(req.user.userId) });

        if (!theaterUser || !theaterUser.role) {
          return res.status(403).json({
            error: 'No role assigned',
            code: 'NO_ROLE_ASSIGNED'
          });
        }

        // Get role permissions
        if (mongoose.Types.ObjectId.isValid(theaterUser.role)) {
          const role = await mongoose.connection.db.collection('roles')
            .findOne({ 
              _id: new mongoose.Types.ObjectId(theaterUser.role),
              isActive: true 
            });

          if (!role) {
            return res.status(403).json({
              error: 'Role not found',
              code: 'ROLE_NOT_FOUND'
            });
          }

          // Check if role has permission for this page
          const hasAccess = role.permissions && role.permissions.some(p => 
            p.page === pageName && p.hasAccess === true
          );

          if (hasAccess) {
            return next();
          } else {
            return res.status(403).json({
              error: 'Access denied to this page',
              code: 'PAGE_ACCESS_DENIED',
              page: pageName,
              role: role.name
            });
          }
        }
      } catch (error) {
        console.error('❌ Error checking page access:', error);
        return res.status(500).json({
          error: 'Failed to verify page access',
          code: 'PAGE_ACCESS_CHECK_FAILED'
        });
      }
    }

    // Default deny
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  };
};

// ✅ NEW: Check if user is Theater Admin
const requireTheaterAdminRole = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Super admin has full access
  // ✅ FIX: Case-insensitive role check
  const normalizedRole = req.user.role ? req.user.role.toLowerCase() : '';
  const normalizedUserType = req.user.userType ? req.user.userType.toLowerCase() : '';
  if (normalizedRole === 'super_admin' || normalizedUserType === 'super_admin') {
    return next();
  }

  try {
    // ✅ FIX: Check if database connection is available
    if (!mongoose.connection.db) {
      console.warn('⚠️ Database not connected, allowing request to proceed');
      return next(); // Allow request if DB not connected
    }
    
    const theaterUser = await mongoose.connection.db.collection('theaterusers')
      .findOne({ _id: new mongoose.Types.ObjectId(req.user.userId) });

    if (!theaterUser || !theaterUser.role) {
      return res.status(403).json({
        error: 'No role assigned',
        code: 'NO_ROLE_ASSIGNED'
      });
    }

    const role = await mongoose.connection.db.collection('roles')
      .findOne({ 
        _id: new mongoose.Types.ObjectId(theaterUser.role),
        isActive: true 
      });

    if (!role) {
      return res.status(403).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // Check if it's Theater Admin role (default role or named "Theater Admin")
    if (role.isDefault === true || role.name === 'Theater Admin') {
      return next();
    } else {
      return res.status(403).json({
        error: 'Only Theater Admin can access this resource',
        code: 'THEATER_ADMIN_REQUIRED',
        role: role.name
      });
    }
  } catch (error) {
    console.error('❌ Error checking Theater Admin role:', error);
    return res.status(500).json({
      error: 'Failed to verify Theater Admin access',
      code: 'ADMIN_CHECK_FAILED'
    });
  }
};

// ✅ NEW: Get user-specific data access scope
const getUserDataScope = async (userId) => {
  try {
    // ✅ FIX: Check if database connection is available
    if (!mongoose.connection.db) {
      console.warn('⚠️ Database not connected, returning no access');
      return { hasAccess: false, scope: {}, userId: null };
    }
    
    const theaterUser = await mongoose.connection.db.collection('theaterusers')
      .findOne({ _id: new mongoose.Types.ObjectId(userId) });

    if (!theaterUser) {
      return { hasAccess: false, scope: {}, userId: null };
    }

    const role = await mongoose.connection.db.collection('roles')
      .findOne({ _id: new mongoose.Types.ObjectId(theaterUser.role) });

    // Theater Admin = full access
    if (role && (role.name === 'Theater Admin' || role.isDefault === true)) {
      return {
        hasAccess: true,
        scope: { 
          type: 'full',
          description: 'Full access to all data',
          userId: userId
        }
      };
    }

    // ✅ Other roles = USER-SPECIFIC filtered access
    return {
      hasAccess: true,
      scope: {
        type: 'user_specific',
        description: 'User-specific access to assigned data only',
        userId: userId,
        userName: theaterUser.username,
        userEmail: theaterUser.email,
        userFullName: theaterUser.fullName,
        filters: theaterUser.dataAccess || {}
      }
    };

  } catch (error) {
    console.error('❌ Error getting data scope:', error);
    return { hasAccess: false, scope: {}, userId: null };
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireTheaterAccess,
  requirePageAccess,
  requireTheaterAdminRole, // ✅ New
  getUserDataScope // ✅ New
};