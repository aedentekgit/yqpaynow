/**
 * Base Controller Class
 * Provides common functionality for all controllers
 */
class BaseController {
  /**
   * Send success response
   */
  static success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  /**
   * Send error response
   */
  static error(res, message = 'An error occurred', statusCode = 500, details = null) {
    const response = {
      success: false,
      error: message,
      message
    };

    if (details && process.env.NODE_ENV === 'development') {
      response.details = details;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   */
  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination
    });
  }

  /**
   * Handle async errors
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Check database connection
   * Returns true if connected (1) or connecting (2)
   * Only returns false if disconnected (0) or disconnecting (3)
   * Mongoose will buffer commands while connecting, so we allow connecting state
   */
  static checkDatabaseConnection() {
    const mongoose = require('mongoose');
    const readyState = mongoose.connection.readyState;
    
    // Log connection state for debugging (only in development)
    if (process.env.NODE_ENV === 'development' && readyState !== 1) {
      const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    }
    
    // Allow requests if connected (1) or connecting (2)
    // Only block if disconnected (0) or disconnecting (3)
    // Mongoose buffers commands while connecting, so this is safe
    return readyState === 1 || readyState === 2;
  }

  /**
   * Get database connection error response
   */
  static getDatabaseErrorResponse(req) {
    return {
      success: false,
      error: 'Database connection not available',
      data: [],
      pagination: {
        current: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
        total: 0,
        totalItems: 0,
        pages: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }
}

module.exports = BaseController;

