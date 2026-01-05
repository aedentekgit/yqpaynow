const { body, query, param, validationResult } = require('express-validator');

const qrCodeNameValidator = {
  getAll: [
    query('theaterId').optional().isMongoId().withMessage('Invalid theater ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('isActive').optional().isBoolean().withMessage('isActive must be boolean')
  ],
  create: [
    body('theaterId')
      .notEmpty()
      .withMessage('Theater ID is required')
      .isMongoId()
      .withMessage('Valid theater ID is required'),
    body('qrName')
      .notEmpty()
      .withMessage('QR name is required')
      .trim(),
    body('seatClass')
      .notEmpty()
      .withMessage('Seat class is required')
      .trim(),
    body('description')
      .optional()
      .trim(),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be boolean')
  ],
  update: [
    body('qrName').optional().notEmpty().trim().withMessage('QR name cannot be empty'),
    body('seatClass').optional().notEmpty().trim().withMessage('Seat class cannot be empty'),
    body('description').optional().trim(),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
  ]
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

module.exports = { qrCodeNameValidator, validate };

