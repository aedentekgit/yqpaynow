const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const QRCodeNameController = require('../controllers/QRCodeNameController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { qrCodeNameValidator, validate } = require('../validators/qrCodeNameValidator');

/**
 * QR Code Name Routes (MVC Pattern)
 */

// GET /api/qrcodenames
router.get('/',
  qrCodeNameValidator.getAll,
  validate,
  BaseController.asyncHandler(QRCodeNameController.getAll)
);

// POST /api/qrcodenames
router.post('/',
  authenticateToken,
  qrCodeNameValidator.create,
  validate,
  BaseController.asyncHandler(QRCodeNameController.create)
);

// PUT /api/qrcodenames/:id (supports both /:id and /:theaterId/:qrNameId)
router.put('/:id',
  authenticateToken,
  qrCodeNameValidator.update,
  validate,
  BaseController.asyncHandler(QRCodeNameController.update)
);

// PUT /api/qrcodenames/:theaterId/:qrNameId (legacy support)
router.put('/:theaterId/:qrNameId',
  authenticateToken,
  qrCodeNameValidator.update,
  validate,
  BaseController.asyncHandler(QRCodeNameController.update)
);

// DELETE /api/qrcodenames/:id (supports both /:id and /:theaterId/:qrNameId)
router.delete('/:id',
  authenticateToken,
  BaseController.asyncHandler(QRCodeNameController.delete)
);

// DELETE /api/qrcodenames/:theaterId/:qrNameId (legacy support)
router.delete('/:theaterId/:qrNameId',
  authenticateToken,
  BaseController.asyncHandler(QRCodeNameController.delete)
);

module.exports = router;

