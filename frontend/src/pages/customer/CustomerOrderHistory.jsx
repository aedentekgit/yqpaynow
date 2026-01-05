import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useCustomerAutoLogout from '@hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import config from '@config';
import '@styles/customer/CustomerOrderHistory.css';
import '@styles/customer/CustomerPhoneEntry.css';
import '@styles/customer/CustomerOTPVerification.css';
import '@styles/pages/customer/CustomerOrderHistory.css'; // Extracted inline styles
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { useModal } from '@contexts/ModalContext';
import { clearCachePattern } from '@utils/cacheUtils';

const CustomerOrderHistory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm, alert, showSuccess, showError } = useModal();

  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState(null);

  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginStep, setLoginStep] = useState('phone'); // 'phone' or 'otp'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const otpInputRefs = useRef([]);

  // Extract theater info from URL params
  const urlParams = new URLSearchParams(location.search);
  const theaterId = urlParams.get('theaterid') || urlParams.get('theaterId');
  const theaterName = urlParams.get('theaterName');

  useEffect(() => {
    // Check if user is logged in
    const savedPhone = localStorage.getItem('customerPhone');

    if (!theaterId) {

      setError('Theater information is missing');
      setLoading(false);
      return;
    }

    if (savedPhone) {
      // User is logged in
      setIsLoggedIn(true);
      setPhoneNumber(savedPhone);
      fetchOrderHistory(savedPhone);
    } else {
      // User is not logged in - show login form
      setShowLoginForm(true);
      setLoading(false);
    }
  }, [theaterId]);

  const fetchOrderHistory = async (phone) => {
    try {
      setLoading(true);


      const data = await ultraFetch(
        `${config.api.baseUrl}/orders/theater/${theaterId}`
        , {}, { cacheTTL: 60000 }).catch(error => { throw new Error('Request failed'); });


      // Filter orders by phone number - check multiple field variations
      const customerOrders = data.orders.filter(order => {
        const orderPhone = order.customerInfo?.phoneNumber ||
          order.customerInfo?.phone ||
          order.customerPhone ||
          order.phone;


        return orderPhone === phone;
      });

      // Sort by date (newest first)
      const sortedOrders = customerOrders.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      );

      setOrders(sortedOrders);
    } catch (err) {
      console.error('❌ Error fetching order history:', err);
      setError('Failed to load order history');
    } finally {
      setLoading(false);
    }
  };

  // Handle phone number input
  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 10) {
      setPhoneNumber(value);
      setLoginError('');
    }
  };

  const validatePhoneNumber = (phone) => {
    const phoneRegex = /^[0-9]\d{9}$/; // 10-digit number format
    return phoneRegex.test(phone);
  };

  // Handle phone submit (send OTP)
  const handlePhoneSubmit = async (e) => {
    e.preventDefault();

    if (!phoneNumber) {
      setLoginError('Please enter your phone number');
      return;
    }

    const isValid = validatePhoneNumber(phoneNumber);
    if (!isValid) {
      setLoginError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoginLoading(true);
    setLoginError('');

    try {
      // Call real API to send OTP
      const fullPhone = '+91' + phoneNumber;
      const apiUrl = `${config.api.baseUrl}/sms/send-otp`;


      const response = await unifiedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: fullPhone,
          purpose: 'order_history'
        })
      }, {
        forceRefresh: true, // Don't cache OTP requests
        cacheTTL: 0
      });

      const result = await response.json();

      if (result.success) {

        // Move to OTP step
        setLoginStep('otp');
        setResendTimer(30);
        setCanResend(false);

        // Start countdown timer
        const timer = setInterval(() => {
          setResendTimer((prev) => {
            if (prev <= 1) {
              setCanResend(true);
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // Auto-focus first OTP input
        setTimeout(() => {
          if (otpInputRefs.current[0]) {
            otpInputRefs.current[0].focus();
          }
        }, 100);
      } else {
        setLoginError(result.error || 'Failed to send OTP. Please try again.');
      }

    } catch (err) {

      setLoginError('Failed to send OTP. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index, value) => {
    if (value.length > 1) return; // Prevent multiple characters
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setLoginError('');

    // Auto-focus next input
    if (value && index < 3) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-verify if all 4 digits entered
    if (value && newOtp.every(digit => digit !== '')) {
      setTimeout(() => handleOtpVerify(newOtp), 500);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    const newOtp = [...otp];

    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }

    setOtp(newOtp);

    // Focus last filled input or next empty input
    const lastIndex = Math.min(pastedData.length - 1, 3);
    otpInputRefs.current[lastIndex]?.focus();

    // Auto-verify if 4 digits pasted
    if (pastedData.length === 4) {
      setTimeout(() => handleOtpVerify(newOtp), 500);
    }
  };

  // Handle OTP verification
  const handleOtpVerify = async (otpToVerify = otp) => {
    const otpString = otpToVerify.join('');

    if (otpString.length !== 4) {
      setLoginError('Please enter complete 4-digit OTP');
      return;
    }

    setLoginLoading(true);
    setLoginError('');

    try {
      const fullPhone = '+91' + phoneNumber;
      const apiUrl = `${config.api.baseUrl}/sms/verify-otp`;


      const response = await unifiedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: fullPhone,
          otp: otpString,
          purpose: 'order_history'
        })
      }, {
        forceRefresh: true, // Don't cache OTP verification
        cacheTTL: 0
      });

      const result = await response.json();

      if (result.success) {

        // Save phone number to localStorage
        localStorage.setItem('customerPhone', fullPhone);

        // Mark as logged in
        setIsLoggedIn(true);
        setShowLoginForm(false);

        // Fetch order history
        fetchOrderHistory(fullPhone);
      } else {
        setLoginError(result.error || 'Invalid OTP. Please try again.');
        setOtp(['', '', '', '']);
        otpInputRefs.current[0]?.focus();
      }

    } catch (err) {

      setLoginError('Failed to verify OTP. Please try again.');
      setOtp(['', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle resend OTP
  const handleResendOtp = async () => {
    if (!canResend) return;

    setLoginLoading(true);
    setLoginError('');

    try {
      const fullPhone = '+91' + phoneNumber;
      const apiUrl = `${config.api.baseUrl}/sms/send-otp`;


      const response = await unifiedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: fullPhone,
          purpose: 'order_history'
        })
      }, {
        forceRefresh: true, // Don't cache OTP requests
        cacheTTL: 0
      });

      const result = await response.json();

      if (result.success) {

        // Reset timer
        setResendTimer(30);
        setCanResend(false);

        // Clear OTP inputs
        setOtp(['', '', '', '']);
        otpInputRefs.current[0]?.focus();

        // Start new countdown
        const timer = setInterval(() => {
          setResendTimer((prev) => {
            if (prev <= 1) {
              setCanResend(true);
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setLoginError(result.error || 'Failed to resend OTP. Please try again.');
      }
    } catch (err) {

      setLoginError('Failed to resend OTP. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle back to phone step
  const handleBackToPhone = () => {
    setLoginStep('phone');
    setOtp(['', '', '', '']);
    setLoginError('');
  };

  const handleBack = () => {
    // Redirect to customer home (menu) page with all saved parameters
    if (theaterId) {
      const params = new URLSearchParams();
      params.set('theaterid', theaterId);

      // Get saved values from localStorage to restore state
      const savedQr = localStorage.getItem('customerQrName');
      const savedScreen = localStorage.getItem('customerScreenName');
      const savedSeat = localStorage.getItem('customerSeat');

      if (savedQr) params.set('qrName', savedQr);
      if (savedScreen) params.set('screen', savedScreen);
      if (savedSeat) params.set('seat', savedSeat);


      navigate(`/customer/home?${params.toString()}`);
    } else {
      navigate(-1);
    }
  };

  const formatPrice = (amount) => {
    return `₹${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('en-IN', options);
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#ff9800',
      preparing: '#2196f3',
      ready: '#4caf50',
      completed: '#4caf50',
      cancelled: '#f44336',
      confirmed: '#6B0E9B'
    };
    return colors[status] || '#666';
  };

  const getStatusText = (status) => {
    const texts = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      completed: 'Completed',
      cancelled: 'Cancelled',
      confirmed: 'Confirmed'
    };
    return texts[status] || status;
  };

  // Get status badge class - matching theater order history
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return 'status-badge confirmed';
      case 'completed': return 'status-badge completed';
      case 'cancelled': return 'status-badge cancelled';
      case 'pending': return 'status-badge pending';
      case 'preparing': return 'status-badge preparing';
      case 'ready': return 'status-badge ready';
      default: return 'status-badge';
    }
  };

  // Check if order can be cancelled (only confirmed or preparing)
  const canCancelOrder = (status) => {
    const statusLower = status?.toLowerCase();
    return statusLower === 'confirmed' || statusLower === 'preparing';
  };

  // Handle order cancellation
  const handleCancelOrder = async (order) => {
    if (!order || !theaterId) return;

    // Show informational alert
    await alert({
      title: 'Cancel Order',
      message: 'If you want to cancel the order, visit the cafe cashier.',
      type: 'info',
      buttonText: 'OK'
    });
  };

  if (loading) {
    return (
      <div className="order-history-page">
        <div className="loading-container">
          <div className="loading-image-wrapper">
            <div className="loading-circle"></div>
            <img
              src="/images/delivery-animation.png"
              alt="Loading"
              className="loading-image"
              onError={(e) => {
                // Fallback to emoji if image doesn't exist
                e.target.style.display = 'none';
                e.target.nextElementSibling.style.display = 'block';
              }}
            />
            <div className="loading-emoji loading-emoji-hidden">🍕</div>
          </div>
          <h3 className="loading-title">Loading your orders...</h3>
          <p className="loading-subtitle">Food you 🧡, on time.</p>
        </div>
      </div>
    );
  }

  // Show login form if not logged in
  if (showLoginForm) {
    return (
      <div className="phone-entry-page">
        {loginStep === 'phone' ? (
          // Phone Number Entry
          <>
            <div className="phone-entry-header">
              <button
                className="back-button"
                onClick={handleBack}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h1 className="phone-entry-title">Phone Verification</h1>
            </div>

            <div className="phone-entry-content">
              <div className="phone-entry-card">
                <h2>Enter Your Mobile Number</h2>
                <p>We'll send you a 4-digit verification code to view your order history</p>

                <div className="phone-input-container">
                  <div className="country-code-display">
                    <span>🇮🇳</span>
                    <span>+91</span>
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
                      autoFocus
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="error-message">
                    {loginError}
                  </div>
                )}

                <button
                  className="continue-button"
                  onClick={handlePhoneSubmit}
                  disabled={loginLoading || phoneNumber.length !== 10}
                >
                  {loginLoading ? 'Sending OTP...' : 'Continue'}
                </button>

                <p className="security-text">
                  Your phone number is safe and secure with us
                </p>
              </div>
            </div>
          </>
        ) : (
          // OTP Verification
          <>
            <div className="otp-header">
              <button
                className="back-button"
                onClick={handleBackToPhone}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h1 className="otp-title">Verify OTP</h1>
            </div>

            <div className="otp-content">
              <div className="otp-card">
                <h2>Enter Verification Code</h2>
                <p>
                  We've sent a 4-digit code to
                  <br />
                  <span className="phone-number-display">+91 {phoneNumber}</span>
                </p>

                <div className="otp-input-container">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpInputRefs.current[index] = el)}
                      type="tel"
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={handleOtpPaste}
                      maxLength="1"
                      className="otp-input"
                    />
                  ))}
                </div>

                {loginError && (
                  <div className="error-message">
                    {loginError}
                  </div>
                )}

                <button
                  className="verify-button"
                  onClick={() => handleOtpVerify()}
                  disabled={loginLoading || otp.some(digit => digit === '')}
                >
                  {loginLoading ? 'Verifying...' : 'Verify & Continue'}
                </button>

                <div className="resend-section">
                  {canResend ? (
                    <button
                      className="resend-link"
                      onClick={handleResendOtp}
                      disabled={loginLoading}
                    >
                      Resend OTP
                    </button>
                  ) : (
                    <p className="resend-timer">
                      Resend OTP in <span className="timer-highlight">{resendTimer}s</span>
                    </p>
                  )}
                </div>

                <p className="change-number">
                  Wrong number?{' '}
                  <button
                    className="change-number-link"
                    onClick={handleBackToPhone}
                    disabled={loginLoading}
                  >
                    Change
                  </button>
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="order-history-page">
      <div className="order-history-header">
        <button
          className="back-button"
          onClick={handleBack}
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="page-title">Order History</h1>
      </div>

      <div className="order-history-content">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!error && orders.length === 0 && (
          <div className="empty-state">
            <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3>No Orders Yet</h3>
            <p>Your order history will appear here</p>
          </div>
        )}

        {!error && orders.length > 0 && (
          <div className="orders-list">
            {orders.map((order, index) => (
              <div key={index} className="order-card">
                <div className="order-header">
                  <div className="order-header-left">
                  <div
                    className="order-number clickable"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set('phone', phoneNumber);
                      params.set('theaterid', theaterId);
                      navigate(`/customer/order-details/${order._id}?${params.toString()}`);
                    }}
                  >
                      <span className="order-number-value">#{order.orderNumber}</span>
                    </div>
                    {order.createdAt && (
                      <div className="order-date-time">
                        <span className="order-date">
                          {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="order-time">
                          {new Date(order.createdAt).toLocaleTimeString('en-IN', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: true 
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className={getStatusBadgeClass(order.status)}>
                    {getStatusText(order.status)}
                  </span>
                </div>

                <div className="order-footer">
                  <div className="payment-method">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    <span>{(order.payment?.method || 'Cash').toUpperCase()}</span>
                  </div>
                  <div className="order-total">
                    <span className="total-label">Total:</span>
                    <span className="total-amount">{formatPrice(order.pricing?.total)}</span>
                  </div>
                </div>

                {/* Cancel Button - Only show for confirmed or preparing orders */}
                {canCancelOrder(order.status) && (
                  <div className="order-cancel-section">
                    <button
                      className="cancel-order-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelOrder(order);
                      }}
                      disabled={cancellingOrderId === order._id}
                    >
                      {cancellingOrderId === order._id ? (
                        <>
                          <span className="cancel-btn-spinner">⟳</span>
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                          </svg>
                          Cancel
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerOrderHistory;