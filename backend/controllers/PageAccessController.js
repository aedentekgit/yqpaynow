const BaseController = require('./BaseController');
const pageAccessService = require('../services/PageAccessService');

/**
 * Page Access Controller
 */
class PageAccessController extends BaseController {
  /**
   * GET /api/page-access
   */
  static async getAll(req, res) {
    try {
      // ✅ FIX: Check database connection first
      if (!BaseController.checkDatabaseConnection()) {
        console.error('❌ [PageAccessController] Database not connected');
        return BaseController.error(res, 'Database connection not available', 503);
      }

      const { theaterId } = req.query;
      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400);
      }

      const result = await pageAccessService.getPageAccess(theaterId);
      return BaseController.success(res, result);
    } catch (error) {
      console.error('Get page access error:', error);
      return BaseController.error(res, 'Failed to fetch page access', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/page-access
   */
  static async create(req, res) {
    try {
      // ✅ FIX: Check database connection first
      if (!BaseController.checkDatabaseConnection()) {
        console.error('❌ [PageAccessController] Database not connected');
        return BaseController.error(res, 'Database connection not available', 503);
      }

      const { theaterId, ...pageData } = req.body;

      if (!theaterId) {
        console.error('❌ [PageAccessController] Theater ID is missing');
        return BaseController.error(res, 'Theater ID is required', 400);
      }

      // ✅ FIX: Validate theaterId format before processing
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(theaterId)) {
        console.error('❌ [PageAccessController] Invalid theater ID format:', theaterId);
        return BaseController.error(res, `Invalid theater ID format: ${theaterId}`, 400);
      }

      const result = await pageAccessService.createPageAccess(theaterId, pageData);

      return res.status(201).json({
        success: true,
        message: 'Page access created successfully',
        data: result
      });
    } catch (error) {
      console.error('❌ [PageAccessController] Create page access error:', error);
      console.error('❌ [PageAccessController] Error name:', error.name);
      console.error('❌ [PageAccessController] Error stack:', error.stack);
      console.error('❌ [PageAccessController] Error message:', error.message);
      console.error('❌ [PageAccessController] Request body:', req.body);

      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors || {}).map(err => ({
          field: err.path,
          message: err.message
        }));
        console.error('❌ [PageAccessController] Validation errors:', validationErrors);
        return BaseController.error(res, 'Validation failed', 400, {
          message: 'Validation failed',
          errors: validationErrors,
          details: validationErrors.map(e => e.message).join(', ')
        });
      }

      // Handle duplicate key errors
      if (error.code === 11000) {
        console.error('❌ [PageAccessController] Duplicate key error code:', error.code);
        console.error('❌ [PageAccessController] Duplicate key details:', error.keyPattern, error.keyValue);
        return BaseController.error(res, 'Duplicate entry', 409, {
          message: `A page with identifier "${pageData.page || 'unknown'}" already exists for this theater`,
          theaterId: theaterId,
          page: pageData.page
        });
      }

      // Handle CastError (invalid ObjectId)
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid ID format', 400, {
          message: `Invalid ${error.path} format: ${error.value}`
        });
      }

      // Return more specific error messages
      const statusCode = error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('Validation') ? 400 : 500;

      return BaseController.error(res, error.message || 'Failed to create page access', statusCode, {
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          name: error.name,
          code: error.code
        })
      });
    }
  }

  /**
   * PUT /api/page-access/:theaterId/:pageId
   */
  static async update(req, res) {
    try {
      const { theaterId, pageId } = req.params;
      const updated = await pageAccessService.updatePageAccess(theaterId, pageId, req.body);
      return BaseController.success(res, updated, 'Page access updated successfully');
    } catch (error) {
      console.error('Update page access error:', error);
      if (error.message.includes('not found')) {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update page access', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/page-access/:theaterId/:pageId
   */
  static async delete(req, res) {
    try {
      const { theaterId, pageId } = req.params;
      await pageAccessService.deletePageAccess(theaterId, pageId);
      return BaseController.success(res, null, 'Page access deleted successfully');
    } catch (error) {
      console.error('Delete page access error:', error);
      if (error.message.includes('not found')) {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete page access', 500, {
        message: error.message
      });
    }
  }
}

module.exports = PageAccessController;

