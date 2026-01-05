import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useCustomerAutoLogout from '../../hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import '../../styles/customer/CustomerOrderSuccess.css';

const CustomerOrderSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();
  
  const [showAnimation, setShowAnimation] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    // ✅ FIX: Check both location.state (for React Router navigation) and sessionStorage (for hard redirects)
    let order = location.state?.order;
    let fromPayment = location.state?.fromPayment;

    // If not in location.state, check sessionStorage (for hard redirects from payment success)
    if (!order || !fromPayment) {
      try {
        const storedData = sessionStorage.getItem('paymentSuccessData');
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          order = parsedData.order;
          fromPayment = parsedData.fromPayment;
          // Clear sessionStorage after reading
          sessionStorage.removeItem('paymentSuccessData');
        }
      } catch (e) {
        console.warn('Could not read payment success data from sessionStorage:', e);
      }
    }

    // ✅ FIX: Redirect if accessed directly without order data (use replace to prevent back navigation)
    // Use setTimeout to ensure navigation happens after render, not during it
    if (!order || !fromPayment) {
      setTimeout(() => {
        navigate('/customer/home', { replace: true });
      }, 0);
      return;
    }

    setOrderData(order);

    // Trigger success animation
    setTimeout(() => {
      setShowAnimation(true);
    }, 500);

    // Auto-redirect countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          
          // ✅ FIX: Move navigation outside state setter to avoid "Cannot update component during render" error
          // Use setTimeout to ensure navigation happens after state update
          setTimeout(() => {
            // Use theater info from order data and replace history to prevent back navigation
            if (order?.theaterInfo?.theaterId) {
              const { theaterId, qrName, seat } = order.theaterInfo;
              const params = new URLSearchParams({
                theaterid: theaterId,
                ...(qrName && { qrname: qrName }),
                ...(seat && { seat: seat })
              });
              navigate(`/customer/home?${params.toString()}`, { replace: true });
            } else {
              // Fallback to localStorage
              try {
                const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
                if (checkoutData.theaterId) {
                  const params = new URLSearchParams({
                    theaterid: checkoutData.theaterId,
                    ...(checkoutData.qrName && { qrname: checkoutData.qrName }),
                    ...(checkoutData.seat && { seat: checkoutData.seat })
                  });
                  navigate(`/customer/home?${params.toString()}`, { replace: true });
                } else {
                  navigate('/customer/home', { replace: true });
                }
              } catch (err) {
                navigate('/customer/home', { replace: true });
              }
            }
          }, 0);
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [location.state, navigate]);

  const handleBackToMenu = () => {

    // Get theater info from order data (passed from payment page)
    if (orderData?.theaterInfo?.theaterId) {
      const { theaterId, qrName, seat } = orderData.theaterInfo;
      
      // Build URL with theater params
      const params = new URLSearchParams({
        theaterid: theaterId,
        ...(qrName && { qrname: qrName }),
        ...(seat && { seat: seat })
      });
      
      const homeUrl = `/customer/home?${params.toString()}`;

      navigate(homeUrl, { replace: true });
    } else {

      // Fallback: try localStorage
      try {
        const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
        if (checkoutData.theaterId) {
          const params = new URLSearchParams({
            theaterid: checkoutData.theaterId,
            ...(checkoutData.qrName && { qrname: checkoutData.qrName }),
            ...(checkoutData.seat && { seat: checkoutData.seat })
          });
          navigate(`/customer/home?${params.toString()}`, { replace: true });
        } else {

          navigate('/customer/home', { replace: true });
        }
      } catch (err) {

        navigate('/customer/home', { replace: true });
      }
    }
  };

  const handleViewOrderDetails = () => {
    // In a real app, this would navigate to order history/details page

    alert('Order details logged to console. In a real app, this would show detailed order information.');
  };

  const formatPrice = (price) => {
    return `₹${price.toFixed(2)}`;
  };

  const formatPhoneNumber = (phone) => {
    if (phone.startsWith('+91')) {
      const number = phone.slice(3);
      return `+91 ${number.slice(0, 5)} ${number.slice(5)}`;
    }
    return phone;
  };

  const getPaymentMethodName = (methodId) => {
    const methods = {
      'upi': 'UPI Payment',
      'card': 'Credit/Debit Card',
      'netbanking': 'Net Banking',
      'wallet': 'Digital Wallet',
      'cash': 'Cash on Delivery'
    };
    return methods[methodId] || 'Unknown';
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-IN'),
      time: date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  if (!orderData) {
    return (
      <div className="success-page loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const dateTime = formatDateTime(orderData.timestamp);

  return (
    <div className="success-page">
      {/* Header with Success Icon */}
      <div className="success-header">
        <div className={`success-icon-wrapper ${showAnimation ? 'show' : ''}`}>
          <span className="success-icon">✓</span>
        </div>
        <h1 className="success-title">Order Successful!</h1>
        <p className="success-subtitle">
          Thank you for your order. Your payment has been processed successfully. By YQPayNow
        </p>
      </div>

      <div className="success-content">
        {/* Order Details Card */}
        <div className="order-details-card">
          <div className="order-header">
            <div className="order-number">
              Order ID
              <div className="order-number-value">{orderData.orderId}</div>
            </div>
            <div className="status-badge">Confirmed</div>
          </div>

          {/* Order Items */}
          <div className="order-items">
            {orderData.items.map((item, index) => (
              <div key={index} className="order-item">
                <span className="item-name">{item.name} × {item.quantity}</span>
                <span className="item-price">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="order-summary">
            <div className="summary-row">
              <span className="summary-label">Subtotal</span>
              <span className="summary-value">{formatPrice(orderData.summary.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Tax</span>
              <span className="summary-value">{formatPrice(orderData.summary.tax)}</span>
            </div>
            <div className="summary-row total-row">
              <span className="summary-label">Total</span>
              <span className="summary-value">{formatPrice(orderData.summary.total)}</span>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="info-cards">
          <div className="info-card">
            <div className="info-card-title">📅 Order Details</div>
            <div className="info-card-content">
              <strong>Date:</strong> {dateTime.date} at {dateTime.time}
              <br />
              <strong>Payment:</strong> {getPaymentMethodName(orderData.paymentMethod)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="success-actions">
          <button 
            className="continue-shopping-button"
            onClick={handleBackToMenu}
          >
            Continue Shopping
          </button>
        </div>

        {/* Auto-redirect Notice */}
        <div className="auto-redirect-message">
          Redirecting to menu in {countdown} seconds
        </div>
      </div>
    </div>
  );
};

export default CustomerOrderSuccess;