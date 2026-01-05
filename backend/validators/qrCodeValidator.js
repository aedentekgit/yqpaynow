const { body, query, param, validationResult } = require('express-validator');

const qrCodeValidator = {
  generate: [
    body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
    body('qrType').isIn(['single', 'screen']).withMessage('QR type must be single or screen'),
    body('name').notEmpty().trim().withMessage('QR code name is required'),
    body('seatClass').optional().trim(),
    body('selectedSeats').optional().isArray(),
    body('logoUrl').optional().trim(),
    body('logoType').optional().trim()
  ],
  generateLegacy: [
    body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
    body('tableNumber').notEmpty().withMessage('Table number is required'),
    body('baseUrl').optional().isURL().withMessage('Base URL must be valid')
  ]
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: errors.array().map(e => e.msg).join(', '),
      details: errors.array()
    });
  }
  next();
};

module.exports = { qrCodeValidator, validate };

