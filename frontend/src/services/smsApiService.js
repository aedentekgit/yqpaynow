/**
 * SMS API Service
 * Handles OTP and phone verification API calls
 */

import config from '../config';

const API_BASE = config.api.baseUrl;

class SMSApiService {
  constructor() {
    this.baseUrl = `${API_BASE}/sms`;
    this.demoUrl = `${API_BASE}/sms-demo`;
  }

  /**
   * Send OTP to phone number
   */
  async sendOTP(phoneNumber, purpose = 'verification') {
    try {
      const response = await fetch(`${this.baseUrl}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          purpose,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send OTP');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Verify OTP
   */
  async verifyOTP(phoneNumber, otp, purpose = 'verification') {
    try {
      const response = await fetch(`${this.baseUrl}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          otp,
          purpose,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to verify OTP');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Send demo OTP (for testing)
   */
  async sendDemoOTP(phoneNumber, purpose = 'demo') {
    try {
      const response = await fetch(`${this.demoUrl}/demo/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          purpose,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send demo OTP');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Get OTP status and remaining time
   */
  async getOTPStatus(phoneNumber, purpose = 'verification') {
    try {
      const response = await fetch(`${this.baseUrl}/otp-status?phoneNumber=${encodeURIComponent(phoneNumber)}&purpose=${purpose}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get OTP status');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }

  /**
   * Resend OTP
   */
  async resendOTP(phoneNumber, purpose = 'verification') {
    try {
      const response = await fetch(`${this.baseUrl}/resend-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          purpose,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resend OTP');
      }

      return await response.json();
    } catch (error) {

      throw error;
    }
  }
}

// Create singleton instance
const smsApiService = new SMSApiService();

export default smsApiService;