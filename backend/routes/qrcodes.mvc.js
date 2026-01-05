const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const QRCodeController = require('../controllers/QRCodeController');
const { authenticateToken, requireTheaterAccess } = require('../middleware/auth');
const { qrCodeValidator, validate } = require('../validators/qrCodeValidator');

/**
 * QR Code Routes (MVC Pattern)
 */

// POST /api/qrcodes/generate
router.post('/generate',
  authenticateToken,
  qrCodeValidator.generate,
  validate,
  BaseController.asyncHandler(QRCodeController.generate)
);

// POST /api/qrcodes/generate/legacy
router.post('/generate/legacy',
  authenticateToken,
  requireTheaterAccess,
  qrCodeValidator.generateLegacy,
  validate,
  BaseController.asyncHandler(QRCodeController.generateLegacy)
);

// GET /api/qrcodes/verify/:qrCode (must be before /:theaterId)
router.get('/verify/:qrCode',
  BaseController.asyncHandler(QRCodeController.verify)
);

// GET /api/qrcodes/:theaterId
router.get('/:theaterId',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(QRCodeController.getByTheater)
);

// DELETE /api/qrcodes/:theaterId/:qrCode
router.delete('/:theaterId/:qrCode',
  authenticateToken,
  requireTheaterAccess,
  BaseController.asyncHandler(QRCodeController.delete)
);

module.exports = router;

