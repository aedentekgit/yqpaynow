const jwt = require('jsonwebtoken');
const { getJWTSecret } = require('../utils/jwtHelper');

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_MISSING'
    });
  }

  jwt.verify(token, getJWTSecret(), (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
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

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Theater ownership middleware (ensure user can only access their theater data)
const requireTheaterAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const requestedTheaterId = req.params.theaterId || req.body.theaterId;
  
  // Super admin can access all theaters
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Theater admin can only access their own theater
  if (req.user.role === 'theater_admin' && req.user.theaterId === requestedTheaterId) {
    return next();
  }

  // Theater staff can only access their own theater
  if (req.user.role === 'theater_staff' && req.user.theaterId === requestedTheaterId) {
    return next();
  }

  return res.status(403).json({
    error: 'Access denied to this theater',
    code: 'THEATER_ACCESS_DENIED'
  });
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireTheaterAccess
};