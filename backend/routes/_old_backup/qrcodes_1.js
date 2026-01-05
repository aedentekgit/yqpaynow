const express = require('express');
const QRCode = require('qrcode');
const Theater = require('../models/Theater');
const { authenticateToken, requireTheaterAccess } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * POST /api/qrcodes/generate
 * Generate QR codes for a theater
 */
router.post('/generate', [
  authenticateToken,
  requireTheaterAccess,
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('tableNumber').notEmpty().withMessage('Table number is required'),
  body('baseUrl').optional().isURL().withMessage('Base URL must be valid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const defaultBaseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const { theaterId, tableNumber, baseUrl = defaultBaseUrl } = req.body;

    // Find theater
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Generate QR code data
    const qrCode = theater.generateQRCode(tableNumber);
    await theater.save();

    // Create the URL that the QR code will point to
    const qrUrl = `${baseUrl}/menu/${qrCode.code}?theaterId=${theaterId}&tableNumber=${tableNumber}`;

    // Generate QR code image
    const qrCodeImage = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      message: 'QR code generated successfully',
      data: {
        qrCode: qrCode.code,
        tableNumber,
        url: qrUrl,
        image: qrCodeImage,
        theaterId,
        theaterName: theater.name,
        createdAt: qrCode.createdAt
      }
    });

  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({
      error: 'Failed to generate QR code',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/qrcodes/:theaterId
 * Get all QR codes for a theater
 */
router.get('/:theaterId', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId } = req.params;

    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    const qrCodes = theater.getActiveQRCodes();

    res.json({
      success: true,
      data: {
        theaterId,
        theaterName: theater.name,
        qrCodes,
        total: qrCodes.length
      }
    });

  } catch (error) {
    console.error('Get QR codes error:', error);
    res.status(500).json({
      error: 'Failed to fetch QR codes',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/qrcodes/verify/:qrCode
 * Verify a QR code and get theater/table information
 */
router.get('/verify/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;

    // Find theater with this QR code
    const theater = await Theater.findOne({
      'qrCodes.code': qrCode,
      'qrCodes.isActive': true
    });

    if (!theater) {
      return res.status(404).json({
        error: 'Invalid or expired QR code',
        code: 'INVALID_QR_CODE'
      });
    }

    const qrCodeData = theater.qrCodes.find(qr => qr.code === qrCode && qr.isActive);

    res.json({
      success: true,
      data: {
        theaterId: theater._id,
        theaterName: theater.name,
        tableNumber: qrCodeData.tableNumber,
        qrCode: qrCodeData.code,
        isValid: true,
        theaterInfo: {
          address: theater.fullAddress,
          phone: theater.phone,
          branding: theater.branding
        }
      }
    });

  } catch (error) {
    console.error('Verify QR code error:', error);
    res.status(500).json({
      error: 'Failed to verify QR code',
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/qrcodes/:theaterId/:qrCode
 * Deactivate a QR code
 */
router.delete('/:theaterId/:qrCode', [
  authenticateToken,
  requireTheaterAccess
], async (req, res) => {
  try {
    const { theaterId, qrCode } = req.params;

    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    const qrCodeIndex = theater.qrCodes.findIndex(qr => qr.code === qrCode);
    if (qrCodeIndex === -1) {
      return res.status(404).json({
        error: 'QR code not found',
        code: 'QR_CODE_NOT_FOUND'
      });
    }

    // Deactivate QR code
    theater.qrCodes[qrCodeIndex].isActive = false;
    await theater.save();

    res.json({
      success: true,
      message: 'QR code deactivated successfully'
    });

  } catch (error) {
    console.error('Delete QR code error:', error);
    res.status(500).json({
      error: 'Failed to deactivate QR code',
      message: 'Internal server error'
    });
  }
});

module.exports = router;