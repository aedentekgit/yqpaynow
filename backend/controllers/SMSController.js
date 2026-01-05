const BaseController = require('./BaseController');
const OTP = require('../models/OTP');
const settingsService = require('../services/SettingsService');

/**
 * SMS Controller
 * Handles OTP sending and verification for customers
 */
class SMSController extends BaseController {
  /**
   * POST /api/sms/send-otp
   * Send OTP to customer phone number
   */
  static async sendOTP(req, res) {
    try {
      const { phoneNumber, purpose = 'verification' } = req.body;

      if (!phoneNumber) {
        return BaseController.error(res, 'Phone number is required', 400);
      }

      // Validate phone number format (basic validation)
      const phoneRegex = /^[0-9]{10}$/;
      const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);
      
      if (!phoneRegex.test(cleanPhone)) {
        return BaseController.error(res, 'Invalid phone number format', 400);
      }

      // Get SMS configuration from settings service
      const smsConfig = await settingsService.getSmsSettings();
      
      // Check if SMS is enabled
      if (!smsConfig.enabled) {
        console.warn('⚠️ SMS is disabled, using demo OTP: 123456');
        // For demo/development: always return success with a fixed OTP
        const demoOtp = '123456';
        const expiresAt = new Date(Date.now() + (smsConfig.otpExpiry || 300) * 1000);
        
        // Save OTP to database
        await OTP.findOneAndUpdate(
          { phoneNumber: cleanPhone, purpose },
          {
            otp: demoOtp,
            expiresAt,
            attempts: 0,
            verified: false
          },
          { upsert: true, new: true }
        );

        return BaseController.success(res, {
          message: 'OTP sent successfully (Demo Mode - SMS Disabled)',
          phoneNumber: cleanPhone,
          expiresIn: smsConfig.otpExpiry || 300,
          demo: true,
          demoOtp: demoOtp // Only in development
        });
      }

      // Generate OTP
      const otpLength = smsConfig.otpLength || 6;
      const otp = Math.floor(Math.random() * Math.pow(10, otpLength))
        .toString()
        .padStart(otpLength, '0');

      // Calculate expiry
      const otpExpiry = smsConfig.otpExpiry || 300; // 5 minutes default
      const expiresAt = new Date(Date.now() + otpExpiry * 1000);

      // Save OTP to database BEFORE sending SMS
      await OTP.findOneAndUpdate(
        { phoneNumber: cleanPhone, purpose },
        {
          otp,
          expiresAt,
          attempts: 0,
          verified: false
        },
        { upsert: true, new: true }
      );

      // Send SMS using the integrated gateway (MSG91/Twilio)
      const fullPhoneNumber = `+91${cleanPhone}`; // Add country code for India
      const result = await settingsService.sendTestOtp(fullPhoneNumber, otp, smsConfig);

      if (result.success) {
        return BaseController.success(res, {
          message: `OTP sent successfully via ${smsConfig.provider}`,
          phoneNumber: cleanPhone,
          expiresIn: otpExpiry,
          provider: smsConfig.provider,
          // Only include OTP in development
          ...(process.env.NODE_ENV === 'development' && { otp })
        });
      } else {
        // SMS sending failed, but OTP is saved in DB for fallback
        console.error(`❌ Failed to send OTP via ${smsConfig.provider}:`, result.message);
        return BaseController.error(res, result.message || 'Failed to send OTP', 500, {
          details: result.details,
          // In development, still include OTP for testing
          ...(process.env.NODE_ENV === 'development' && { otp })
        });
      }

    } catch (error) {
      console.error('❌ Error sending OTP:', error);
      return BaseController.error(res, error.message || 'Failed to send OTP', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/sms/verify-otp
   * Verify OTP for customer phone number
   */
  static async verifyOTP(req, res) {
    try {
      const { phoneNumber, otp, purpose = 'verification' } = req.body;

      if (!phoneNumber || !otp) {
        return BaseController.error(res, 'Phone number and OTP are required', 400);
      }

      // Clean phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);

      // Find OTP record
      const otpRecord = await OTP.findOne({
        phoneNumber: cleanPhone,
        purpose,
        verified: false
      }).sort({ createdAt: -1 });

      if (!otpRecord) {
        return BaseController.error(res, 'OTP not found or already verified', 400);
      }

      // Check if OTP is expired
      if (new Date() > otpRecord.expiresAt) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return BaseController.error(res, 'OTP has expired', 400);
      }

      // Get SMS config for max attempts from settings service
      const smsConfig = await settingsService.getSmsSettings();
      const maxRetries = smsConfig?.maxRetries || 3;

      // Check max attempts
      if (otpRecord.attempts >= maxRetries) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return BaseController.error(res, 'Maximum verification attempts exceeded', 400);
      }

      // Verify OTP
      if (otpRecord.otp !== otp) {
        // Increment attempts
        otpRecord.attempts += 1;
        await otpRecord.save();

        return BaseController.error(res, `Invalid OTP. ${maxRetries - otpRecord.attempts} attempts remaining`, 400);
      }

      // Mark as verified
      otpRecord.verified = true;
      await otpRecord.save();

      // Clean up old OTPs for this phone number
      await OTP.deleteMany({
        phoneNumber: cleanPhone,
        _id: { $ne: otpRecord._id }
      });

      return BaseController.success(res, {
        message: 'OTP verified successfully',
        phoneNumber: cleanPhone,
        verified: true
      });

    } catch (error) {
      console.error('❌ Error verifying OTP:', error);
      return BaseController.error(res, error.message || 'Failed to verify OTP', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/sms/resend-otp
   * Resend OTP to customer phone number
   */
  static async resendOTP(req, res) {
    try {
      const { phoneNumber, purpose = 'verification' } = req.body;

      if (!phoneNumber) {
        return BaseController.error(res, 'Phone number is required', 400);
      }

      // Clean phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);

      // Delete old OTP
      await OTP.deleteMany({ phoneNumber: cleanPhone, purpose });

      // Send new OTP using the sendOTP method
      req.body.phoneNumber = cleanPhone;
      return SMSController.sendOTP(req, res);

    } catch (error) {
      console.error('❌ Error resending OTP:', error);
      return BaseController.error(res, error.message || 'Failed to resend OTP', 500, {
        message: error.message
      });
    }
  }
}

module.exports = SMSController;
