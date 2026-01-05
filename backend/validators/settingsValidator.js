const { body, query, validationResult } = require('express-validator');

const settingsValidator = {
  updateGeneral: [
    body('applicationName').optional().isString().isLength({ max: 100 }),
    body('defaultCurrency').optional().isString().isLength({ max: 10 }),
    body('taxRate').optional().isFloat({ min: 0, max: 100 }),
    body('serviceChargeRate').optional().isFloat({ min: 0, max: 100 })
  ]
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

module.exports = { settingsValidator, validate };

