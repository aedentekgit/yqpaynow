import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import config from '@config';
import '@styles/customer/CustomerPhoneEntry.css';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';


const CustomerPhoneEntry = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Get data from navigation state
  const checkoutData = location.state?.checkoutData;
  const fromLogin = location.state?.fromLogin;
  const returnUrl = location.state?.returnUrl;

  // Country code is fixed to India (+91)
  const countryCode = '+91';

  // Check if user is already logged in
  useEffect(() => {
    const customerPhone = localStorage.getItem('customerPhone');
    
    if (customerPhone) {
      // User is already logged in
      
      // If coming from login flow, redirect back to returnUrl
      if (fromLogin && returnUrl) {
        navigate(returnUrl, { replace: true });
        return;
      }
      
      // If there's checkout data in localStorage, directly initiate payment gateway
      // by navigating to OTP verification (which triggers payment gateway automatically)
      const savedCheckoutData = localStorage.getItem('checkoutData');
      if (savedCheckoutData) {
        const checkoutInfo = JSON.parse(savedCheckoutData);
        
        // ✅ FIX: Navigate to OTP verification page with verified flag
        // This will trigger the payment gateway directly, just like first-time login
        navigate('/customer/otp-verification', {
          state: {
            phoneNumber: customerPhone,
            verified: true,  // Skip OTP verification since already logged in
            otpLength: 4,
            expiresIn: 300,
            checkoutData: checkoutInfo,
            fromLogin: false,
            returnUrl: null,
            skipOtpVerification: true  // Flag to skip OTP input and go straight to payment gateway
          },
          replace: true
        });
        return;
      }
      
      // Otherwise, redirect back to home or returnUrl
      if (returnUrl) {
        navigate(returnUrl, { replace: true });
      } else {
        navigate('/customer/home', { replace: true });
      }
    }
  }, [navigate, fromLogin, returnUrl]);

  useEffect(() => {
    // Auto-focus on phone input when page loads
    const phoneInput = document.getElementById('phone-input');
    if (phoneInput) {
      phoneInput.focus();
    }
  }, []);

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 10) {
      setPhoneNumber(value);
      setError('');
    }
  };

  const validatePhoneNumber = (phone) => {
    const phoneRegex = /^[0-9]\d{9}$/; // 10-digit number format
    return phoneRegex.test(phone);
  };

  const handleContinue = async () => {

    if (!phoneNumber) {
      setError('Please enter your phone number');
      return;
    }

    const isValid = validatePhoneNumber(phoneNumber);

    if (!isValid) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const fullPhoneNumber = countryCode + phoneNumber;

      // Call actual API to send OTP - Use dynamic API URL
      const apiUrl = `${config.api.baseUrl}/sms/send-otp`;

      const response = await unifiedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: fullPhoneNumber,
          purpose: 'order_verification'
        })
      }, {
        forceRefresh: true, // Don't cache OTP requests
        cacheTTL: 0
      });

      const result = await response.json();

      if (result.success) {

        // Navigate to OTP verification page with phone number
        navigate('/customer/otp-verification', { 
          state: { 
            phoneNumber: fullPhoneNumber,
            otpLength: result.data?.otpLength || 4,
            expiresIn: result.data?.expiresIn || 300,
            checkoutData: checkoutData,
            fromLogin: fromLogin,
            returnUrl: returnUrl
          }
        });
      } else {
        setError(result.error || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {

      setError('Failed to send OTP. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToMenu = () => {
    // Navigate back to cart with checkout data
    navigate(-1); // Go back to previous page (cart)
  };

  const formatPhoneDisplay = (phone) => {
    if (phone.length >= 5) {
      return `${phone.slice(0, 5)} ${phone.slice(5)}`;
    }
    return phone;
  };

  return (
    <div className="phone-entry-page">
      <div className="phone-entry-header">
        <button 
          className="back-button"
          onClick={handleBackToMenu}
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="phone-entry-title">Phone Verification</h1>
      </div>

      <div className="phone-entry-content">
        <div className="phone-entry-card">
          <h2>Enter Your Mobile Number</h2>
          <p>
            {fromLogin 
              ? "We'll send you a 4-digit verification code to sign in"
              : "We'll send you a 4-digit verification code to complete your order"
            }
          </p>

          <div className="phone-input-container">
            <div className="country-code-display">
              <span>🇮🇳</span>
              <span>{countryCode}</span>
            </div>
            
            <div className="phone-input-wrapper">
              <input
                id="phone-input"
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="Enter 10-digit number"
                className="phone-input"
                maxLength="10"
                autoComplete="tel"
              />
            </div>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button 
            className="continue-button"
            onClick={handleContinue}
            disabled={loading || phoneNumber.length !== 10}
          >
            <span>{loading ? 'Sending OTP...' : 'Continue'}</span>
            {!loading && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          <p className="security-text">
            Your phone number is safe and secure with us
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerPhoneEntry;