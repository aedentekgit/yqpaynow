const express = require('express');
const router = express.Router();
const BaseController = require('../controllers/BaseController');
const SettingsController = require('../controllers/SettingsController');
const SMSController = require('../controllers/SMSController');
const { authenticateToken } = require('../middleware/auth');

/**
 * SMS Routes (MVC Pattern)
 */

// POST /api/sms/send-otp
// Send OTP to customer (no auth required)
router.post('/send-otp',
  BaseController.asyncHandler(SMSController.sendOTP)
);

// POST /api/sms/verify-otp
// Verify OTP for customer (no auth required)
router.post('/verify-otp',
  BaseController.asyncHandler(SMSController.verifyOTP)
);

// POST /api/sms/resend-otp
// Resend OTP to customer (no auth required)
router.post('/resend-otp',
  BaseController.asyncHandler(SMSController.resendOTP)
);

// POST /api/sms/send-test-otp
// Send test OTP via SMS (admin only)
router.post('/send-test-otp',
  authenticateToken,
  BaseController.asyncHandler(SettingsController.sendTestOtp)
);

module.exports = router;

