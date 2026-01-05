const BaseController = require('./BaseController');
const qrCodeNameService = require('../services/QRCodeNameService');

/**
 * QR Code Name Controller
 */
class QRCodeNameController extends BaseController {
  /**
   * GET /api/qrcodenames
   */
  static async getAll(req, res) {
    try {
      const { theaterId } = req.query;
      if (!theaterId) {
        return BaseController.error(res, 'Theater ID is required', 400);
      }

      const result = await qrCodeNameService.getQRCodeNames(theaterId, req.query);
      return BaseController.success(res, result);
    } catch (error) {
      console.error('Get QR code names error:', error);
      return BaseController.error(res, 'Failed to fetch QR code names', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/qrcodenames
   */
  static async create(req, res) {
    try {
      const { theaterId, qrName, seatClass, description } = req.body;

      // CRITICAL: Validate theaterId is present and valid
      // This is the most important check - without theaterId, we can't know which theater to check
      if (!theaterId) {
        console.error('❌ [QRCodeNameController] Theater ID is MISSING from request body!');
        console.error('   Request body:', req.body);
        console.error('   This means the frontend did not send theaterId');
        return BaseController.error(res, 'Theater ID is required in request body. Please ensure you are creating QR names from a theater-specific page.', 400);
      }

      // Validate theaterId format
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(theaterId)) {
        console.error('❌ [QRCodeNameController] Invalid theater ID format:', theaterId);
        return BaseController.error(res, 'Invalid theater ID format', 400);
      }
      if (!qrName || !qrName.trim()) {
        return BaseController.error(res, 'QR name is required', 400);
      }
      if (!seatClass || !seatClass.trim()) {
        return BaseController.error(res, 'Seat class is required', 400);
      }

      const result = await qrCodeNameService.createQRCodeName(theaterId, {
        qrName,
        seatClass,
        description
      });

      return res.status(201).json({
        success: true,
        message: 'QR name created successfully',
        data: result
      });
    } catch (error) {
      console.error('❌ [QRCodeNameController] Create QR code name error:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      
      // Handle specific error types
      if (error.message && (
          error.message === 'QR name already exists in this theater' || 
          error.message.includes('Duplicate QR name') ||
          error.message.includes('unique constraint violation') ||
          error.message.includes('QR name already exists') ||
          error.message.includes('already exists in this theater'))) {
        // ✅ FIX: Always use the detailed error message from service/model which includes existing values
        // If the message includes "Existing entry:", it has the detailed info, otherwise use generic
        let errorMessage = error.message;
        if (!errorMessage.includes('Existing entry:')) {
          errorMessage = 'A QR code name with this name and seat class already exists in this theater. Please use a different name or seat class.';
        }
        return BaseController.error(res, errorMessage, 400);
      }
      if (error.message === 'QR name is required' || 
          error.message === 'Seat class is required' ||
          error.message === 'Theater ID is required') {
        return BaseController.error(res, error.message, 400);
      }
      if (error.name === 'ValidationError') {
        return BaseController.error(res, 'Validation error: ' + error.message, 400);
      }
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid theater ID format', 400);
      }

      return BaseController.error(res, 'Failed to create QR name', 500, {
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * PUT /api/qrcodenames/:id OR /api/qrcodenames/:theaterId/:qrNameId
   */
  static async update(req, res) {
    try {
      // Support both /:id and /:theaterId/:qrNameId patterns
      let theaterId, qrNameId;
      
      if (req.params.qrNameId) {
        // Pattern: /:theaterId/:qrNameId
        theaterId = req.params.theaterId;
        qrNameId = req.params.qrNameId;
      } else {
        // Pattern: /:id - theaterId should be in body
        qrNameId = req.params.id;
        theaterId = req.body.theaterId;
        
        if (!theaterId) {
          return BaseController.error(res, 'Theater ID is required in request body', 400);
        }
      }
      
      const updated = await qrCodeNameService.updateQRCodeName(theaterId, qrNameId, req.body);
      return BaseController.success(res, updated, 'QR code name updated successfully');
    } catch (error) {
      console.error('❌ [QRCodeNameController] Update QR code name error:', error);
      if (error.message.includes('not found')) {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to update QR code name', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/qrcodenames/:id OR /api/qrcodenames/:theaterId/:qrNameId
   */
  static async delete(req, res) {
    try {
      // Support both /:id and /:theaterId/:qrNameId patterns
      let theaterId, qrNameId;
      
      if (req.params.qrNameId) {
        // Pattern: /:theaterId/:qrNameId
        theaterId = req.params.theaterId;
        qrNameId = req.params.qrNameId;
      } else {
        // Pattern: /:id - theaterId should be in query
        qrNameId = req.params.id;
        theaterId = req.query.theaterId;
        
        if (!theaterId) {
          return BaseController.error(res, 'Theater ID is required in query string', 400);
        }
      }
      
      await qrCodeNameService.deleteQRCodeName(theaterId, qrNameId);
      return BaseController.success(res, null, 'QR code name deleted successfully');
    } catch (error) {
      console.error('❌ [QRCodeNameController] Delete QR code name error:', error);
      if (error.message.includes('not found')) {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete QR code name', 500, {
        message: error.message
      });
    }
  }
}

module.exports = QRCodeNameController;

