import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import config from '@config';
import '@styles/customer/CustomerOTPVerification.css';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { loadRazorpayScript } from '@utils/razorpayLoader';
import { calculateOrderTotals } from '@utils/orderCalculation';
import { useCart } from '@contexts/CartContext';


const CustomerOTPVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();
  const [otp, setOtp] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [isPaymentSuccessful, setIsPaymentSuccessful] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const inputRefs = useRef([]);
  const paymentProcessingRef = useRef(false); // ✅ Prevent multiple payment handler calls

  const phoneNumber = location.state?.phoneNumber || '';
  const checkoutData = location.state?.checkoutData;
  const fromLogin = location.state?.fromLogin;
  const returnUrl = location.state?.returnUrl;
  const skipOtpVerification = location.state?.skipOtpVerification || false; // ✅ New flag for already logged-in users

  // ✅ FIX: If user is already logged in (skipOtpVerification), directly initiate payment gateway
  useEffect(() => {
    if (skipOtpVerification && phoneNumber) {
      // User is already verified, directly initiate payment gateway

      // Store customer phone in localStorage
      localStorage.setItem('customerPhone', phoneNumber);

      // Directly call payment gateway after a short delay
      const timer = setTimeout(() => {
        initiatePaymentGateway();
      }, 500); // Small delay to ensure state is ready

      return () => clearTimeout(timer);
    }
  }, [skipOtpVerification, phoneNumber]);

  useEffect(() => {
    // Redirect back if no phone number
    if (!phoneNumber) {
      navigate('/customer/phone-entry');
      return;
    }

    // Auto-focus first OTP input
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }

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

    return () => clearInterval(timer);
  }, [phoneNumber, navigate]);

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return; // Prevent multiple characters
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify if all 4 digits entered
    if (value && newOtp.every(digit => digit !== '')) {
      setTimeout(() => handleVerifyOtp(newOtp), 500);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    const newOtp = [...otp];

    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }

    setOtp(newOtp);

    // Focus last filled input or next empty input
    const lastIndex = Math.min(pastedData.length - 1, 3);
    inputRefs.current[lastIndex]?.focus();

    // Auto-verify if 4 digits pasted
    if (pastedData.length === 4) {
      setTimeout(() => handleVerifyOtp(newOtp), 500);
    }
  };

  const handleVerifyOtp = async (otpToVerify = otp) => {
    const otpString = otpToVerify.join('');

    if (otpString.length !== 4) {
      setError('Please enter complete 4-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {

      // Call actual API to verify OTP - Use dynamic API URL
      const apiUrl = `${config.api.baseUrl}/sms/verify-otp`;

      const response = await unifiedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          otp: otpString,
          purpose: 'order_verification'
        })
      }, {
        forceRefresh: true, // Don't cache OTP verification
        cacheTTL: 0
      });

      const result = await response.json();

      if (result.success) {

        // Save phone number to localStorage
        localStorage.setItem('customerPhone', phoneNumber);

        // If from login, redirect to return URL
        if (fromLogin && returnUrl) {
          navigate(returnUrl);
        } else {
          // Directly initiate payment gateway after OTP verification
          await initiatePaymentGateway();
        }
      } else {
        setError(result.error || 'Invalid OTP. Please try again.');
        setOtp(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {

      setError('Failed to verify OTP. Please try again.');
      setOtp(['', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;

    setLoading(true);
    setError('');

    try {

      // Call API to resend OTP - Use dynamic API URL
      const apiUrl = `${config.api.baseUrl}/sms/send-otp`;

      const response = await unifiedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          purpose: 'order_verification'
        })
      }, {
        forceRefresh: true, // Don't cache OTP resend
        cacheTTL: 0
      });

      const result = await response.json();

      if (result.success) {

        // Reset timer
        setResendTimer(30);
        setCanResend(false);

        // Clear OTP inputs
        setOtp(['', '', '', '']);
        inputRefs.current[0]?.focus();

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

        setError(result.message || 'Failed to resend OTP. Please try again.');
      }
    } catch (err) {

      setError('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/customer/phone-entry');
  };

  // Initiate payment gateway directly after OTP verification
  const initiatePaymentGateway = async () => {
    try {
      setLoading(true);
      setError('');

      // Get checkout data
      const storedCheckoutData = checkoutData || JSON.parse(localStorage.getItem('checkoutData') || '{}');

      if (!storedCheckoutData || !storedCheckoutData.theaterId) {
        setError('Unable to process order. Please scan QR code and add items to cart first.');
        setLoading(false);
        setTimeout(() => {
          navigate('/customer/home');
        }, 3000);
        return;
      }

      const cartItems = storedCheckoutData.cartItems || [];
      if (cartItems.length === 0) {
        setError('Your cart is empty');
        setLoading(false);
        return;
      }

      // Calculate order totals
      // ✅ FIX: Map cart items to ensure consistent price field handling (especially for combo offers)
      const orderItems = cartItems.map(item => {
        // For combo offers, check offerPrice first, then other price fields
        const sellingPrice = Number(
          item.offerPrice ||
          (typeof item.price === 'number' ? item.price : parseFloat(item.price)) ||
          item.sellingPrice ||
          item.pricing?.basePrice ||
          item.pricing?.salePrice ||
          item.basePrice ||
          0
        );
        
        return {
          ...item,
          sellingPrice: sellingPrice,
          quantity: item.quantity,
          taxRate: parseFloat(item.taxRate || item.pricing?.taxRate || item.gstPercentage) || 0,
          gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
          discountPercentage: parseFloat(item.discountPercentage || item.pricing?.discountPercentage) || 0,
          pricing: item.pricing || {
            basePrice: sellingPrice,
            salePrice: sellingPrice
          }
        };
      });

      const orderSummary = calculateOrderTotals(orderItems);

      // Fetch payment gateway configuration
      const theaterId = storedCheckoutData.theaterId;
      const gatewayResponse = await unifiedFetch(`${config.api.baseUrl}/payments/config/${theaterId}/online?_t=${Date.now()}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      }, {
        forceRefresh: true, // Always get latest payment config
        cacheTTL: 0
      });

      // ✅ FIX: Check if response exists and has ok property
      if (!gatewayResponse || (gatewayResponse.ok !== undefined && !gatewayResponse.ok)) {
        const status = gatewayResponse?.status || 'unknown';
        throw new Error(`Failed to load payment gateway configuration (status: ${status})`);
      }

      // ✅ FIX: Ensure response exists and has json method
      if (!gatewayResponse || typeof gatewayResponse.json !== 'function') {
        throw new Error('Invalid response: payment gateway configuration response is missing or does not have a json method');
      }

      const gatewayData = await gatewayResponse.json();
      const gatewayConfig = gatewayData.success && gatewayData.data && gatewayData.data.config ? gatewayData.data.config : null;

      if (!gatewayConfig || !gatewayConfig.isEnabled || gatewayConfig.provider !== 'razorpay') {
        setError('Payment gateway not available. Please try again later.');
        setLoading(false);
        return;
      }

      // Load Razorpay script
      const razorpayLoaded = await loadRazorpayScript();
      if (!razorpayLoaded) {
        setError('Failed to load payment gateway. Please refresh the page.');
        setLoading(false);
        return;
      }

      // Prepare order items for backend
      const orderItemsForBackend = cartItems.map(item => ({
        productId: item._id,
        quantity: item.quantity,
        unitPrice: parseFloat(item.price || item.sellingPrice) || 0,
        taxRate: item.taxRate || 0,
        gstType: item.gstType || 'EXCLUDE',
        discountPercentage: item.discountPercentage || 0,
        originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option ||
          (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
        size: item.size || null,
        productSize: item.productSize || null,
        sizeLabel: item.sizeLabel || null,
        variant: item.variant || null
      }));

      // Create order in backend
      const orderPayload = {
        theaterId: theaterId,
        customerName: phoneNumber,
        customerInfo: {
          name: 'Customer',
          phoneNumber: phoneNumber
        },
        tableNumber: storedCheckoutData.seat || 'Online Order',
        qrName: storedCheckoutData.qrName,
        seat: storedCheckoutData.seat,
        items: orderItemsForBackend,
        paymentMethod: 'upi', // Default to UPI
        orderType: 'qr_order',
        subtotal: orderSummary.subtotal || 0,
        tax: orderSummary.tax || 0,
        total: orderSummary.total || 0,
        totalDiscount: orderSummary.totalDiscount || 0
      };

      const createOrderResponse = await unifiedFetch(`${config.api.baseUrl}/orders/theater`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderPayload)
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      // ✅ FIX: Check if response exists and has ok property
      if (!createOrderResponse || (createOrderResponse.ok !== undefined && !createOrderResponse.ok)) {
        let errorMessage = 'Failed to create order';
        try {
          if (createOrderResponse && typeof createOrderResponse.json === 'function') {
            const errorData = await createOrderResponse.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } catch (e) {
          console.warn('Could not parse error response:', e);
        }
        throw new Error(errorMessage);
      }

      // ✅ FIX: Ensure response exists and has json method
      if (!createOrderResponse || typeof createOrderResponse.json !== 'function') {
        throw new Error('Invalid response: create order response is missing or does not have a json method');
      }

      const backendResponse = await createOrderResponse.json();
      const backendOrder = backendResponse.order;

      // Create Razorpay order
      const createRazorpayOrderResponse = await unifiedFetch(`${config.api.baseUrl}/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: backendOrder._id,
          paymentMethod: 'upi'
        })
      }, {
        forceRefresh: true, // Don't cache payment creation
        cacheTTL: 0
      });

      // ✅ FIX: Check if response exists and has ok property
      if (!createRazorpayOrderResponse || (createRazorpayOrderResponse.ok !== undefined && !createRazorpayOrderResponse.ok)) {
        const status = createRazorpayOrderResponse?.status || 'unknown';
        throw new Error(`Failed to create Razorpay order (status: ${status})`);
      }

      // ✅ FIX: Ensure response exists and has json method
      if (!createRazorpayOrderResponse || typeof createRazorpayOrderResponse.json !== 'function') {
        throw new Error('Invalid response: Razorpay order creation response is missing or does not have a json method');
      }

      const razorpayOrderData = await createRazorpayOrderResponse.json();

      if (!razorpayOrderData.success) {
        throw new Error(razorpayOrderData.message || 'Failed to create payment order');
      }

      const paymentOrder = razorpayOrderData.data;
      const razorpayKeyId = gatewayConfig.razorpay?.keyId;

      if (!razorpayKeyId) {
        throw new Error('Razorpay key not found in gateway configuration');
      }

      // Open Razorpay payment gateway
      const options = {
        key: razorpayKeyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        order_id: paymentOrder.orderId,
        name: 'YQPayNow',
        description: `Order #${backendOrder.orderNumber || backendOrder._id}`,
        handler: async (response) => {
          // ✅ Prevent multiple handler calls
          if (paymentProcessingRef.current) {
            console.warn('⚠️ [CustomerOTP] Payment handler already processing, ignoring duplicate call');
            return;
          }

          paymentProcessingRef.current = true;

          // ✅ Use setTimeout to ensure Razorpay modal is closed before verification
          // This prevents race conditions with Razorpay's redirect
          setTimeout(async () => {
            try {
              await verifyRazorpayPayment(response, backendOrder, paymentOrder, cartItems, orderSummary, storedCheckoutData);
            } catch (err) {
              console.error('❌ [CustomerOTP] Error in payment handler:', err);
              paymentProcessingRef.current = false; // Reset on error
            }
          }, 100);
        },
        prefill: {
          contact: phoneNumber,
          ...(backendOrder.customerInfo?.email && { email: backendOrder.customerInfo.email })
        },
        theme: {
          color: '#3399cc'
        },
        retry: {
          enabled: true
        },
        modal: {
          ondismiss: () => {
            setError('Payment cancelled by user');
            setLoading(false);
            // ✅ FIX: Redirect to customer home after payment cancellation
            setTimeout(() => {
              const storedCheckoutData = checkoutData || JSON.parse(localStorage.getItem('checkoutData') || '{}');
              if (storedCheckoutData?.theaterId) {
                const params = new URLSearchParams({
                  theaterid: storedCheckoutData.theaterId,
                  ...(storedCheckoutData.qrName && { qrname: storedCheckoutData.qrName }),
                  ...(storedCheckoutData.seat && { seat: storedCheckoutData.seat })
                });
                navigate(`/customer/home?${params.toString()}`);
              } else {
                navigate('/customer/home');
              }
            }, 2000); // Give user time to see the error message
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
      setLoading(false);
    } catch (err) {
      console.error('Payment gateway error:', err);
      setError(err.message || 'Failed to initiate payment. Please try again.');
      setLoading(false);
      // ✅ FIX: Redirect to customer home after payment gateway error
      setTimeout(() => {
        const storedCheckoutData = checkoutData || JSON.parse(localStorage.getItem('checkoutData') || '{}');
        if (storedCheckoutData?.theaterId) {
          const params = new URLSearchParams({
            theaterid: storedCheckoutData.theaterId,
            ...(storedCheckoutData.qrName && { qrname: storedCheckoutData.qrName }),
            ...(storedCheckoutData.seat && { seat: storedCheckoutData.seat })
          });
          navigate(`/customer/home?${params.toString()}`);
        } else {
          navigate('/customer/home');
        }
      }, 2000); // Give user time to see the error message
    }
  };

  // Verify Razorpay Payment
  const verifyRazorpayPayment = async (razorpayResponse, backendOrder, paymentOrder, cartItems, orderSummary, checkoutData) => {
    try {
      setLoading(true);
      setIsVerifyingPayment(true); // ✅ Show processing screen immediately
      console.log('🔄 [CustomerOTP] Verifying payment...', {
        orderId: backendOrder._id,
        paymentId: razorpayResponse.razorpay_payment_id
      });

      const response = await unifiedFetch(`${config.api.baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: razorpayResponse.razorpay_order_id,
          paymentId: razorpayResponse.razorpay_payment_id,
          signature: razorpayResponse.razorpay_signature,
          orderId: backendOrder._id,
          transactionId: paymentOrder.transactionId
        })
      }, {
        forceRefresh: true, // Don't cache payment verification
        cacheTTL: 0
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Payment verification failed (HTTP ${response.status})`);
      }

      const data = await response.json();

      if (data.success) {
        // ✅ Immediately call handlePaymentSuccess to prevent any redirect delays
        handlePaymentSuccess(backendOrder, razorpayResponse, cartItems, orderSummary, checkoutData);
      } else {
        console.error('❌ [CustomerOTP] Payment verification failed:', data);
        setError(data.message || 'Payment verification failed');
        setLoading(false);
        // ✅ FIX: Use hard redirect to prevent staying on OTP page
        setTimeout(() => {
          const storedCheckoutData = checkoutData || JSON.parse(localStorage.getItem('checkoutData') || '{}');
          if (storedCheckoutData?.theaterId) {
            const params = new URLSearchParams({
              theaterid: storedCheckoutData.theaterId,
              ...(storedCheckoutData.qrName && { qrname: storedCheckoutData.qrName }),
              ...(storedCheckoutData.seat && { seat: storedCheckoutData.seat })
            });
            window.location.href = `/customer/home?${params.toString()}`;
          } else {
            window.location.href = '/customer/home';
          }
        }, 2000);
      }
    } catch (error) {
      console.error('❌ [CustomerOTP] Payment verification error:', error);
      setError(error.message || 'Payment verification failed');
      setLoading(false);
      setIsVerifyingPayment(false); // ✅ Show form again on error
      // ✅ FIX: Use hard redirect to prevent staying on OTP page
      setTimeout(() => {
        const storedCheckoutData = checkoutData || JSON.parse(localStorage.getItem('checkoutData') || '{}');
        if (storedCheckoutData?.theaterId) {
          const params = new URLSearchParams({
            theaterid: storedCheckoutData.theaterId,
            ...(storedCheckoutData.qrName && { qrname: storedCheckoutData.qrName }),
            ...(storedCheckoutData.seat && { seat: storedCheckoutData.seat })
          });
          window.location.href = `/customer/home?${params.toString()}`;
        } else {
          window.location.href = '/customer/home';
        }
      }, 2000);
    }
  };

  // Handle Payment Success
  const handlePaymentSuccess = (backendOrder, razorpayResponse, cartItems, orderSummary, checkoutData) => {
    // ✅ Prevent multiple success handler calls
    if (paymentProcessingRef.current === false) {
      console.warn('⚠️ [CustomerOTP] Payment success handler called but payment not processing');
      return;
    }

    setIsPaymentSuccessful(true); // Show success state immediately

    // ✅ FIX: Clear cart and checkout data BEFORE navigation to prevent redirect loops
    localStorage.removeItem('cart');
    localStorage.removeItem('checkoutData');
    localStorage.removeItem('yqpay_cart');
    clearCart();

    // ✅ FIX: Redirect directly to customer home with success flag

    setTimeout(() => {
      const storedCheckoutData = checkoutData || JSON.parse(localStorage.getItem('checkoutData') || '{}');
      if (storedCheckoutData?.theaterId) {
        const params = new URLSearchParams({
          theaterid: storedCheckoutData.theaterId,
          ...(storedCheckoutData.qrName && { qrname: storedCheckoutData.qrName }),
          ...(storedCheckoutData.seat && { seat: storedCheckoutData.seat }),
          orderSuccess: 'true',
          orderId: backendOrder.orderNumber || backendOrder._id
        });
        window.location.replace(`/customer/home?${params.toString()}`);
      } else {
        window.location.replace('/customer/home?orderSuccess=true');
      }
    }, 100);
  };

  const formatPhoneNumber = (phone) => {
    if (phone.startsWith('+91')) {
      const number = phone.slice(3);
      return `+91 ${number.slice(0, 5)} ${number.slice(5)}`;
    }
    return phone;
  };

  // ✅ Show processing payment screen when verifying payment
  if (isVerifyingPayment) {
    return (
      <div className="otp-verification-page">
        <div className="otp-header">
          <h1 className="otp-title">Processing Payment</h1>
        </div>
        <div className="otp-content">
          <div className="otp-card">
            <h2>Verifying Payment</h2>
            <p>Please wait while we confirm your payment...</p>
            <div className="otp-loading-container" style={{
              margin: '2rem auto',
              textAlign: 'center',
              fontSize: '1rem',
              color: '#666'
            }}>
              <div style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #3399cc',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isPaymentSuccessful) {
    return (
      <div className="otp-verification-page">
        <div className="otp-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="otp-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              background: '#10b981',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: 'white',
              fontSize: '40px'
            }}>
              ✓
            </div>
            <h2 style={{ color: '#10b981', marginBottom: '10px' }}>Payment Successful!</h2>
            <p style={{ color: '#666' }}>Redirecting to order confirmation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="otp-verification-page">
      <div className="otp-header">
        <button
          className="back-button"
          onClick={handleBack}
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="otp-title">{skipOtpVerification ? 'Processing Your Order' : 'Verify OTP'}</h1>
      </div>

      <div className="otp-content">
        <div className="otp-card">
          {/* ✅ Show different content when skipping OTP verification */}
          {skipOtpVerification ? (
            <>
              <h2>Processing Your Order</h2>
              <p>
                Welcome back!
                <br />
                <span className="phone-number-display">{formatPhoneNumber(phoneNumber)}</span>
              </p>

              <div className="otp-loading-container" style={{
                margin: '2rem auto',
                textAlign: 'center',
                fontSize: '1rem',
                color: '#666'
              }}>
                <div style={{
                  display: 'inline-block',
                  width: '40px',
                  height: '40px',
                  border: '4px solid #f3f3f3',
                  borderTop: '4px solid #3399cc',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <p style={{ marginTop: '1rem' }}>Preparing payment gateway...</p>
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              <h2>Enter Verification Code</h2>
              <p>
                We've sent a 4-digit code to
                <br />
                <span className="phone-number-display">{formatPhoneNumber(phoneNumber)}</span>
              </p>

              <div className="otp-input-container">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    className={`otp-input ${digit ? 'filled' : ''}`}
                    maxLength="1"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <button
                className="verify-button"
                onClick={() => handleVerifyOtp()}
                disabled={loading || !otp.every(digit => digit !== '')}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>

              <div className="resend-section">
                {!canResend ? (
                  <p className="resend-text">
                    Resend OTP in <span className="timer">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    className="resend-button"
                    onClick={handleResendOtp}
                    disabled={loading}
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </>
          )}

          <div className="change-number-section">
            <span className="change-number-text">Wrong number?</span>
            <button
              className="change-number-button"
              onClick={handleBack}
              type="button"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerOTPVerification;