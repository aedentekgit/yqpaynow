const express = require('express');
const QRCode = require('qrcode');
const Theater = require('../models/Theater');
const { authenticateToken, requireTheaterAccess } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { generateQRCodes } = require('../utils/qrCodeGenerator');

const router = express.Router();

/**
 * POST /api/qrcodes/generate
 * Generate QR codes for a theater (NEW VERSION - supports single and screen types)
 */
router.post('/generate', [
  authenticateToken,
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('qrType').isIn(['single', 'screen']).withMessage('QR type must be single or screen'),
  body('name').notEmpty().trim().withMessage('QR code name is required'),
  body('seatClass').optional().trim(),
  body('selectedSeats').optional().isArray(),
  body('logoUrl').optional().trim(),
  body('logoType').optional().trim()
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: errors.array().map(e => e.msg).join(', '),
        details: errors.array()
      });
    }

    const { 
      theaterId, 
      qrType, 
      name, 
      seatClass, 
      selectedSeats, 
      logoUrl, 
      logoType 
    } = req.body;
    // Additional validation for screen type
    if (qrType === 'screen') {
      if (!selectedSeats || selectedSeats.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: 'Selected seats are required for screen type QR codes'
        });
      }

      if (selectedSeats.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: 'Cannot generate more than 100 QR codes at once'
        });
      }
    }

    // Generate QR codes
    const result = await generateQRCodes({
      theaterId,
      qrType,
      name,
      seatClass,
      selectedSeats,
      logoUrl,
      logoType,
      userId: req.user?.userId
    });
    res.json({
      success: true,
      message: qrType === 'single' 
        ? 'QR code generated successfully!' 
        : `${result.count} QR codes generated successfully!`,
      data: {
        count: result.count,
        qrType: qrType,
        batchId: result.batchId,
        failedSeats: result.failedSeats || 0
      }
    });

  } catch (error) {
    console.error('❌ Generate QR code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate QR codes',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/qrcodes/generate/legacy
 * OLD ENDPOINT - Generate QR codes for a theater (table-based - kept for backward compatibility)
 */
router.post('/generate/legacy', [
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
 * GET /api/qrcodes/:qrCodeId/download
 * Proxy download for QR code image (handles CORS)
 * NOTE: Must be before /:theaterId route to avoid conflicts
 */
router.get('/:qrCodeId/download', authenticateToken, async (req, res) => {
  try {
    const { qrCodeId } = req.params;
    // Find the theater containing this QR code
    const theater = await Theater.findOne({ 'qrCodes._id': qrCodeId });
    
    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'QR code not found'
      });
    }

    // Find the specific QR code
    const qrCode = theater.qrCodes.id(qrCodeId);
    
    if (!qrCode || !qrCode.qrImageUrl) {
      return res.status(404).json({
        success: false,
        error: 'QR code image not found'
      });
    }

    // Fetch image from GCS
    const https = require('https');
    const http = require('http');
    const url = require('url');
    
    const imageUrl = qrCode.qrImageUrl;
    const parsedUrl = url.parse(imageUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    protocol.get(imageUrl, (imageResponse) => {
      if (imageResponse.statusCode !== 200) {
        return res.status(imageResponse.statusCode).json({
          success: false,
          error: 'Failed to fetch image'
        });
      }

      // Set headers for download
      const filename = `${qrCode.name.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}_QR.png`;
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Pipe the image to response
      imageResponse.pipe(res);
    }).on('error', (error) => {
      console.error('Error fetching image:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download image'
      });
    });

  } catch (error) {
    console.error('Download QR code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download QR code',
      message: error.message
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
        success: false,
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Query ScreenQRCode collection instead of theater.qrCodes array
    const ScreenQRCode = require('../models/ScreenQRCode');
    const qrCodes = await ScreenQRCode.find({ 
      theater: theaterId,
      isActive: true 
    }).select('qrName qrType seat seatClass qrCodeUrl logoUrl logoType createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: qrCodes,
      total: qrCodes.length
    });

  } catch (error) {
    console.error('Get QR codes error:', error);
    res.status(500).json({
      success: false,
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