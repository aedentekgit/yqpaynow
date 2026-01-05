const BaseController = require('./BaseController');
const qrCodeService = require('../services/QRCodeService');

/**
 * QR Code Controller
 */
class QRCodeController extends BaseController {
  /**
   * POST /api/qrcodes/generate
   */
  static async generate(req, res) {
    try {
      const result = await qrCodeService.generateQRCodes({
        theaterId: req.body.theaterId,
        qrType: req.body.qrType,
        name: req.body.name,
        seatClass: req.body.seatClass,
        selectedSeats: req.body.selectedSeats,
        logoUrl: req.body.logoUrl,
        logoType: req.body.logoType,
        userId: req.user?.userId
      });

      const message = req.body.qrType === 'single'
        ? 'QR code generated successfully!'
        : `${result.count} QR codes generated successfully!`;

      return BaseController.success(res, result, message);
    } catch (error) {
      console.error('Generate QR code error:', error);
      if (error.message.includes('required') || error.message.includes('Cannot generate')) {
        return BaseController.error(res, error.message, 400);
      }
      return BaseController.error(res, 'Failed to generate QR codes', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/qrcodes/generate/legacy
   */
  static async generateLegacy(req, res) {
    try {
      const defaultBaseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const { theaterId, tableNumber, baseUrl = defaultBaseUrl } = req.body;

      const result = await qrCodeService.generateLegacyQRCode(theaterId, tableNumber, baseUrl);

      return BaseController.success(res, result, 'QR code generated successfully');
    } catch (error) {
      console.error('Generate legacy QR code error:', error);
      if (error.message === 'Theater not found') {
        return BaseController.error(res, error.message, 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }
      return BaseController.error(res, 'Failed to generate QR code', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/qrcodes/:theaterId
   */
  static async getByTheater(req, res) {
    try {
      const qrCodes = await qrCodeService.getQRCodesByTheater(req.params.theaterId);
      return BaseController.success(res, qrCodes);
    } catch (error) {
      console.error('Get QR codes error:', error);
      if (error.message === 'Theater not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to fetch QR codes', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/qrcodes/:theaterId/:qrCode
   */
  static async delete(req, res) {
    try {
      await qrCodeService.deleteQRCode(req.params.theaterId, req.params.qrCode);
      return BaseController.success(res, null, 'QR code deleted successfully');
    } catch (error) {
      console.error('Delete QR code error:', error);
      if (error.message === 'Theater not found') {
        return BaseController.error(res, error.message, 404);
      }
      return BaseController.error(res, 'Failed to delete QR code', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/qrcodes/verify/:qrCode
   */
  static async verify(req, res) {
    try {
      const result = await qrCodeService.verifyQRCode(req.params.qrCode);
      if (!result) {
        return BaseController.error(res, 'Invalid QR code', 404);
      }
      return BaseController.success(res, result);
    } catch (error) {
      console.error('Verify QR code error:', error);
      return BaseController.error(res, 'Failed to verify QR code', 500, {
        message: error.message
      });
    }
  }
}

module.exports = QRCodeController;

