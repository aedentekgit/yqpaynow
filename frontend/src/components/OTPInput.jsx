import React, { useState, useEffect, useRef } from 'react';
import config from '../config';

const OTPInput = ({ 
  length = 6, 
  onComplete, 
  onResend, 
  phoneNumber,
  autoFocus = true,
  isLoading = false,
  resendCooldown = 60
}) => {
  const [otp, setOtp] = useState(new Array(length).fill(''));
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  // Initialize input refs
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Auto focus first input
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Start resend timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Handle input change
  const handleChange = (element, index) => {
    if (isNaN(element.value)) return;

    const newOtp = [...otp.map((d, idx) => (idx === index ? element.value : d))];
    setOtp(newOtp);
    setError('');

    // Focus next input
    if (element.value && index < length - 1) {
      inputRefs.current[index + 1].focus();
    }

    // Call onComplete when all inputs are filled
    if (newOtp.every(digit => digit !== '') && onComplete) {
      onComplete(newOtp.join(''));
    }
  };

  // Handle key down events
  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Move to previous input if current is empty
        inputRefs.current[index - 1].focus();
      } else {
        // Clear current input
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1].focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1].focus();
    }
  };

  // Handle paste
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').slice(0, length);
    
    if (pastedData && /^\d+$/.test(pastedData)) {
      const newOtp = [...otp];
      [...pastedData].forEach((digit, index) => {
        if (index < length) {
          newOtp[index] = digit;
        }
      });
      setOtp(newOtp);
      
      // Focus the last filled input or next empty one
      const lastFilledIndex = Math.min(pastedData.length - 1, length - 1);
      inputRefs.current[lastFilledIndex].focus();
      
      // Call onComplete if all inputs are filled
      if (newOtp.every(digit => digit !== '') && onComplete) {
        onComplete(newOtp.join(''));
      }
    }
  };

  // Clear OTP
  const clearOtp = () => {
    setOtp(new Array(length).fill(''));
    setError('');
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  };

  // Handle resend
  const handleResend = () => {
    if (resendTimer === 0 && onResend) {
      onResend();
      setResendTimer(resendCooldown);
      clearOtp();
      setError('');
    }
  };

  // Set error from parent
  const setErrorMessage = (message) => {
    setError(message);
  };

  // Expose methods to parent
  React.useImperativeHandle(ref => ({
    clearOtp,
    setError: setErrorMessage,
    getValue: () => otp.join(''),
    focus: () => inputRefs.current[0]?.focus()
  }));

  return (
    <div className="otp-input-container">
      <div className="otp-inputs">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={el => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength="1"
            value={digit}
            onChange={e => handleChange(e.target, index)}
            onKeyDown={e => handleKeyDown(e, index)}
            onPaste={handlePaste}
            className={`otp-input ${error ? 'error' : ''} ${digit ? 'filled' : ''}`}
            disabled={isLoading}
          />
        ))}
      </div>

      {error && (
        <div className="otp-error">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      <div className="otp-actions">
        {phoneNumber && (
          <p className="phone-display">
            OTP sent to <strong>{phoneNumber}</strong>
          </p>
        )}
        
        <div className="resend-section">
          {resendTimer > 0 ? (
            <p className="resend-timer">
              Resend OTP in <strong>{resendTimer}s</strong>
            </p>
          ) : (
            <button
              type="button"
              className="resend-btn"
              onClick={handleResend}
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Resend OTP'}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .otp-input-container {
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
        }

        .otp-inputs {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-bottom: 16px;
        }

        .otp-input {
          width: 50px;
          height: 50px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          text-align: center;
          font-size: 20px;
          font-weight: 600;
          color: #1e293b;
          background: white;
          transition: all 0.2s;
          outline: none;
        }

        .otp-input:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .otp-input.filled {
          border-color: #22c55e;
          background: #f0fdf4;
        }

        .otp-input.error {
          border-color: #ef4444;
          background: #fef2f2;
        }

        .otp-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .otp-error {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ef4444;
          font-size: 14px;
          margin-bottom: 16px;
          padding: 8px 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
        }

        .error-icon {
          font-size: 16px;
        }

        .otp-actions {
          text-align: center;
        }

        .phone-display {
          margin: 0 0 12px 0;
          color: #64748b;
          font-size: 14px;
        }

        .resend-section {
          margin-top: 8px;
        }

        .resend-timer {
          margin: 0;
          color: #64748b;
          font-size: 14px;
        }

        .resend-btn {
          background: none;
          border: none;
          color: #8b5cf6;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          padding: 8px 16px;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .resend-btn:hover:not(:disabled) {
          background: #f3f4f6;
          color: #7c3aed;
        }

        .resend-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 480px) {
          .otp-inputs {
            gap: 8px;
          }

          .otp-input {
            width: 40px;
            height: 40px;
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
};

export default React.forwardRef(OTPInput);