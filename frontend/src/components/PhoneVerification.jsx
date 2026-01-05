import React, { useState, useRef } from 'react';
import OTPInput from './OTPInput';
import smsApiService from '../services/smsApiService';

const PhoneVerification = ({ 
  onVerificationComplete, 
  onCancel,
  purpose = 'verification',
  title = 'Phone Verification',
  subtitle = 'Please verify your phone number to continue',
  autoSendOTP = false,
  initialPhoneNumber = ''
}) => {
  const [step, setStep] = useState(autoSendOTP && initialPhoneNumber ? 'otp' : 'phone');
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const otpRef = useRef();

  // Send OTP
  const sendOTP = async (phone = phoneNumber) => {
    if (!phone) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!isValidPhoneNumber(phone)) {
      setError('Please enter a valid phone number with country code (e.g., +911234567890)');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Use demo API for testing if purpose is 'demo'
      const result = purpose === 'demo' 
        ? await smsApiService.sendDemoOTP(phone, purpose)
        : await smsApiService.sendOTP(phone, purpose);

      if (result.success) {
        setOtpSent(true);
        setStep('otp');
        setPhoneNumber(phone);
        
        // Show OTP in development mode
        if (result.data && result.data.otpId && process.env.NODE_ENV !== 'production') {
  }
      } else {
        setError(result.message || 'Failed to send OTP');
      }
    } catch (error) {

      setError(error.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP
  const verifyOTP = async (otp) => {
    setIsLoading(true);
    setError('');

    try {
      const result = await smsApiService.verifyOTP(phoneNumber, otp, purpose);

      if (result.success) {
        if (onVerificationComplete) {
          onVerificationComplete({
            phoneNumber,
            purpose,
            verifiedAt: result.data?.verifiedAt || new Date().toISOString()
          });
        }
      } else {
        setError(result.message || 'Invalid OTP');
        if (otpRef.current) {
          otpRef.current.setError(result.message || 'Invalid OTP');
        }
      }
    } catch (error) {

      const errorMessage = error.message || 'Failed to verify OTP. Please try again.';
      setError(errorMessage);
      if (otpRef.current) {
        otpRef.current.setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const resendOTP = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await smsApiService.resendOTP(phoneNumber, purpose);

      if (result.success) {
        if (otpRef.current) {
          otpRef.current.clearOtp();
        }
        
        // Show OTP in development mode
        if (result.data && process.env.NODE_ENV !== 'production') {
  }
      } else {
        setError(result.message || 'Failed to resend OTP');
      }
    } catch (error) {

      setError(error.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Validate phone number
  const isValidPhoneNumber = (phone) => {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  };

  // Handle phone number submission
  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    sendOTP();
  };

  // Handle back to phone step
  const handleBackToPhone = () => {
    setStep('phone');
    setOtpSent(false);
    setError('');
  };

  // Auto-send OTP on mount if needed
  React.useEffect(() => {
    if (autoSendOTP && initialPhoneNumber && !otpSent) {
      sendOTP(initialPhoneNumber);
    }
  }, [autoSendOTP, initialPhoneNumber]);

  return (
    <div className="phone-verification">
      <div className="verification-header">
        {/* <h3>{title}</h3>
        <p>{subtitle}</p> */}
      </div>

      {step === 'phone' && (
        <div className="phone-step">
          <form onSubmit={handlePhoneSubmit}>
            <div className="form-group">
              <label htmlFor="phoneNumber">Phone Number</label>
              <div className="phone-input-container">
                <input
                  id="phoneNumber"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={`phone-input ${error ? 'error' : ''}`}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <small className="input-help">
                Enter your phone number with country code (e.g., +91 for India)
              </small>
            </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            <div className="action-buttons">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !phoneNumber}
              >
                {isLoading ? 'Sending OTP...' : 'Send OTP'}
              </button>
              {onCancel && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {step === 'otp' && (
        <div className="otp-step">
          <OTPInput
            ref={otpRef}
            length={6}
            phoneNumber={phoneNumber}
            onComplete={verifyOTP}
            onResend={resendOTP}
            isLoading={isLoading}
            autoFocus
          />

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="action-buttons">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBackToPhone}
              disabled={isLoading}
            >
              Change Number
            </button>
            {onCancel && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .phone-verification {
          max-width: 500px;
          margin: 0 auto;
          padding: 32px 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .verification-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .verification-header h3 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #1e293b;
        }

        .verification-header p {
          margin: 0;
          color: #64748b;
          font-size: 16px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #374151;
        }

        .phone-input-container {
          position: relative;
        }

        .phone-input {
          width: 100%;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.2s;
          outline: none;
        }

        .phone-input:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .phone-input.error {
          border-color: #ef4444;
          background: #fef2f2;
        }

        .phone-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .input-help {
          display: block;
          margin-top: 6px;
          color: #64748b;
          font-size: 14px;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ef4444;
          font-size: 14px;
          margin: 16px 0;
          padding: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
        }

        .error-icon {
          font-size: 16px;
        }

        .action-buttons {
          display: flex;
          gap: 12px;
          margin-top: 32px;
        }

        .btn {
          flex: 1;
          padding: 16px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          outline: none;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #8b5cf6;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #7c3aed;
        }

        .btn-secondary {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e2e8f0;
          color: #334155;
        }

        @media (max-width: 480px) {
          .phone-verification {
            padding: 24px 16px;
          }

          .action-buttons {
            flex-direction: column;
          }

          .verification-header h3 {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default PhoneVerification;