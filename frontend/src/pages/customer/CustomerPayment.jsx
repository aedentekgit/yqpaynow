import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '@contexts/CartContext';
import useCustomerAutoLogout from '@hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import config from '@config';
import { loadRazorpayScript } from '@utils/razorpayLoader';
import { calculateOrderTotals } from '@utils/orderCalculation'; // 📊 Centralized calculation
import '@styles/customer/CustomerPayment.css';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';


const CustomerPayment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();

  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [orderSummary, setOrderSummary] = useState({
    subtotal: 0,
    tax: 0,
    total: 0,
    totalDiscount: 0
  });
  const [theaterInfo, setTheaterInfo] = useState({
    theaterName: '',
    seat: '',
    qrName: ''
  });
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const paymentProcessingRef = useRef(false); // ✅ Prevent multiple payment handler calls

  const phoneNumber = location.state?.phoneNumber || '';
  const verified = location.state?.verified || false;

  useEffect(() => {
    // Redirect if not verified
    if (!phoneNumber || !verified) {

      navigate('/customer/phone-entry');
      return;
    }

    // Get cart items from localStorage or context
    loadCartData();

    // Check if we have theater info and cart items
    const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || 'null');
    if (!checkoutData || !checkoutData.theaterId) {

      // Don't redirect - allow user to proceed but show warning
      const urlParams = new URLSearchParams(window.location.search);
      const theaterIdFromUrl = urlParams.get('theaterid');
      if (theaterIdFromUrl) {

        // Store minimal checkout data
        localStorage.setItem('checkoutData', JSON.stringify({
          theaterId: theaterIdFromUrl,
          cartItems: JSON.parse(localStorage.getItem('cart') || '[]'),
          totals: { subtotal: 0, tax: 0, total: 0 }
        }));
        loadCartData(); // Reload with new data
      }
    }
  }, [phoneNumber, verified, navigate]);

  const loadCartData = () => {
    try {

      // Try to get checkout data first (from new flow)
      const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || 'null');

      if (checkoutData && checkoutData.cartItems) {

        // Use data from checkout flow
        setCartItems(checkoutData.cartItems);
        setOrderSummary({
          subtotal: checkoutData.totals.subtotal,
          tax: checkoutData.totals.tax,
          total: checkoutData.totals.total,
          totalDiscount: checkoutData.totals.totalDiscount || 0
        });
        // Set theater info
        setTheaterInfo({
          theaterName: checkoutData.theaterName || '',
          seat: checkoutData.seat || '',
          qrName: checkoutData.qrName || ''
        });
      } else {

        // Fallback to cart data (old flow)
        const savedCart = JSON.parse(localStorage.getItem('cart') || '[]');
        setCartItems(savedCart);

        // ✅ Use global orderCalculation utility instead of manual calculation
        const orderItems = savedCart.map(item => ({
          ...item,
          sellingPrice: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
          quantity: item.quantity,
          taxRate: parseFloat(item.taxRate || item.pricing?.taxRate || item.gstPercentage) || 0,
          gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
          discountPercentage: parseFloat(item.discountPercentage || item.pricing?.discountPercentage) || 0,
          pricing: item.pricing
        }));

        const totals = calculateOrderTotals(orderItems);

        setOrderSummary({
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          totalDiscount: totals.totalDiscount || 0
        });
      }
    } catch (err) {

      setError('Error loading order details');
    }
  };

  // Fetch payment gateway configuration
  useEffect(() => {
    const fetchGatewayConfig = async () => {
      try {
        const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
        const theaterId = checkoutData.theaterId;

        if (!theaterId) {
          console.warn('⚠️ [CustomerPayment] No theaterId found');
          return;
        }


        // Use unifiedFetch with cache bypass for latest payment config
        const response = await unifiedFetch(`${config.api.baseUrl}/payments/config/${theaterId}/online?_t=${Date.now()}`, {
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          forceRefresh: true, // Always get latest payment config
          cacheTTL: 0
        });

        if (!response.ok) {
          console.error(`❌ [CustomerPayment] Gateway config fetch failed: ${response.status}`);
          return;
        }

        const data = await response.json();

        // ✅ FIX: PaymentController wraps config in { config: {...} } then BaseController wraps in { data: {...} }
        // So the path is: data.data.config
        if (data.success && data.data && data.data.config) {
          const config = data.data.config;
          setGatewayConfig(config);

          // Load Razorpay script only if gateway is enabled and provider is razorpay
          if (config.isEnabled && config.provider === 'razorpay') {
            const loaded = await loadRazorpayScript();
            setRazorpayLoaded(loaded);
            if (!loaded) {
              setError('Failed to load payment gateway. Please refresh the page.');
            } else {
            }
          }
        } else {
          console.warn('⚠️ [CustomerPayment] No payment gateway configured for this theater');
        }
      } catch (error) {
        console.error('❌ [CustomerPayment] Error fetching gateway config:', error);
      }
    };

    fetchGatewayConfig();
  }, []);

  // ✅ Recalculate totals when cartItems change (using global utility)
  // This ensures totals are always up-to-date if cart items change
  useEffect(() => {
    if (cartItems.length > 0) {
      const orderItems = cartItems.map(item => ({
        ...item,
        sellingPrice: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
        quantity: item.quantity,
        taxRate: parseFloat(item.taxRate || item.pricing?.taxRate || item.gstPercentage) || 0,
        gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
        discountPercentage: parseFloat(item.discountPercentage || item.pricing?.discountPercentage) || 0,
        pricing: item.pricing
      }));

      const totals = calculateOrderTotals(orderItems);

      // Update order summary with calculated totals
      setOrderSummary(prev => {
        // Only update if values actually changed to avoid unnecessary re-renders
        if (prev.subtotal !== totals.subtotal || prev.tax !== totals.tax || prev.total !== totals.total) {
          return {
            subtotal: totals.subtotal,
            tax: totals.tax,
            total: totals.total,
            totalDiscount: totals.totalDiscount || 0
          };
        }
        return prev;
      });
    }
  }, [cartItems]);

  const paymentMethods = [
    {
      id: 'upi',
      name: 'UPI Payment',
      icon: 'fas fa-mobile-alt',
      description: 'Pay using PhonePe, GPay, Paytm, etc.',
      popular: true
    },
    {
      id: 'card',
      name: 'Credit/Debit Card',
      icon: 'fas fa-credit-card',
      description: 'Visa, Mastercard, RuPay, etc.'
    },
    {
      id: 'netbanking',
      name: 'Net Banking',
      icon: 'fas fa-university',
      description: 'All major banks supported'
    }
  ];

  const handlePaymentMethodSelect = (methodId) => {
    setSelectedPaymentMethod(methodId);
    setError('');
  };

  const handlePayNow = async () => {

    if (!selectedPaymentMethod) {

      setError('Please select a payment method');
      return;
    }

    if (cartItems.length === 0) {

      setError('Your cart is empty');
      return;
    }

    // Check if Razorpay is required and loaded
    if (['upi', 'card', 'netbanking'].includes(selectedPaymentMethod)) {
      if (!razorpayLoaded) {
        setError('Payment gateway not ready. Please refresh the page.');
        return;
      }

      if (!gatewayConfig) {
        setError('Payment gateway not configured for this theater.');
        return;
      }
    }


    setLoading(true);
    setError('');

    try {
      // Get checkout data for theater info
      const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');

      let theaterId = checkoutData.theaterId;

      // If no theater ID, try to get from URL or cart
      if (!theaterId) {

        const urlParams = new URLSearchParams(window.location.search);
        theaterId = urlParams.get('theaterid');

        if (!theaterId) {
          // Try to get from stored cart data
          const cart = JSON.parse(localStorage.getItem('cart') || '[]');
          if (cart.length > 0 && cart[0].theaterId) {
            theaterId = cart[0].theaterId;
          }
        }
      }

      if (!theaterId) {

        setError('Unable to process order. Please scan QR code and add items to cart first.');
        setLoading(false);

        // Redirect to home after 3 seconds
        setTimeout(() => {
          window.location.href = '/customer/home';
        }, 3000);
        return;
      }


      // Prepare order items for backend
      const orderItems = cartItems.map(item => ({
        productId: item._id, // Product ID from cart
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
        customerName: phoneNumber, // Using phone as customer identifier
        customerInfo: {
          name: 'Customer',
          phoneNumber: phoneNumber  // ✅ Include phone number in customerInfo
        },
        tableNumber: checkoutData.seat || 'Online Order',
        qrName: checkoutData.qrName,    // ✅ Include QR Name
        seat: checkoutData.seat,        // ✅ Include Seat
        items: orderItems,
        paymentMethod: selectedPaymentMethod,
        orderType: 'qr_order', // Important: This determines 'online' channel
        subtotal: orderSummary.subtotal || 0,
        tax: orderSummary.tax || 0,
        total: orderSummary.total || 0,
        totalDiscount: orderSummary.totalDiscount || 0
      };


      // Call backend API to create order
      const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderPayload)
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create order');
      }

      const backendResponse = await response.json();
      const backendOrder = backendResponse.order; // Extract the order from response

      // If using Razorpay (UPI, Card, Net Banking)
      if (['upi', 'card', 'netbanking'].includes(selectedPaymentMethod) && gatewayConfig) {
        await initiateRazorpayPayment(backendOrder, orderSummary.total, theaterId);
      } else {
        // For cash or other methods, proceed directly to success
        handlePaymentSuccess(backendOrder, null);
      }
    } catch (err) {

      setError(err.message || 'Payment failed. Please try again.');
      setLoading(false);
    }
  };

  // Initiate Razorpay Payment
  const initiateRazorpayPayment = async (backendOrder, amount, theaterId) => {
    try {
      // Create Razorpay order
      const createOrderResponse = await unifiedFetch(`${config.api.baseUrl}/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: backendOrder._id,
          paymentMethod: selectedPaymentMethod
        })
      }, {
        forceRefresh: true, // Don't cache payment creation
        cacheTTL: 0
      });

      const razorpayOrderData = await createOrderResponse.json();

      if (!razorpayOrderData.success) {
        throw new Error(razorpayOrderData.message || 'Failed to create payment order');
      }

      // Extract payment order data (backend returns it in 'data' property)
      const paymentOrder = razorpayOrderData.data;

      // ✅ FIX: Get Razorpay key from nested razorpay object
      const razorpayKeyId = gatewayConfig.razorpay?.keyId;

      if (!razorpayKeyId) {
        throw new Error('Razorpay key not found in gateway configuration');
      }


      // Razorpay options
      const options = {
        key: razorpayKeyId,  // ✅ Use the extracted keyId
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        order_id: paymentOrder.orderId,  // Razorpay order ID from backend
        name: theaterInfo.theaterName || 'YQPayNow',
        description: `Order #${backendOrder.orderNumber || backendOrder._id}`,
        handler: async (response) => {
          // ✅ Prevent multiple handler calls
          if (paymentProcessingRef.current) {
            console.warn('⚠️ [CustomerPayment] Payment handler already processing, ignoring duplicate call');
            return;
          }

          paymentProcessingRef.current = true;

          // ✅ Pass payment order data including transactionId
          // Use setTimeout to ensure Razorpay modal is closed before verification
          setTimeout(async () => {
            try {
              await verifyRazorpayPayment(response, backendOrder, paymentOrder);
            } catch (err) {
              console.error('❌ [CustomerPayment] Error in payment handler:', err);
              paymentProcessingRef.current = false; // Reset on error
            }
          }, 100);
        },
        prefill: {
          contact: phoneNumber,
          // Only include email if available to avoid validation errors
          ...(backendOrder.customerInfo?.email && { email: backendOrder.customerInfo.email })
        },
        theme: {
          color: '#3399cc'
        },
        // Enable retry for better UX
        retry: {
          enabled: true
        },
        modal: {
          ondismiss: () => {
            setError('Payment cancelled by user');
            setLoading(false);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error('Razorpay payment error:', error);
      setError(error.message || 'Failed to initiate payment');
      setLoading(false);
    }
  };

  // Verify Razorpay Payment
  const verifyRazorpayPayment = async (razorpayResponse, backendOrder, paymentOrder) => {
    try {
      setLoading(true);
      console.log('🔄 [CustomerPayment] Verifying payment...', {
        orderId: backendOrder._id,
        paymentId: razorpayResponse.razorpay_payment_id
      });

      const response = await unifiedFetch(`${config.api.baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ✅ Map Razorpay's snake_case to our camelCase
          razorpayOrderId: razorpayResponse.razorpay_order_id,
          paymentId: razorpayResponse.razorpay_payment_id,
          signature: razorpayResponse.razorpay_signature,
          orderId: backendOrder._id,
          transactionId: paymentOrder.transactionId  // ✅ Include transaction ID
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
        handlePaymentSuccess(backendOrder, razorpayResponse);
      } else {
        console.error('❌ [CustomerPayment] Payment verification failed:', data);
        setError(data.message || 'Payment verification failed');
        setLoading(false);
        // ✅ FIX: Redirect to customer home after payment failure
        setTimeout(() => {
          const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
          if (checkoutData?.theaterId) {
            const params = new URLSearchParams({
              theaterid: checkoutData.theaterId,
              ...(checkoutData.qrName && { qrname: checkoutData.qrName }),
              ...(checkoutData.seat && { seat: checkoutData.seat })
            });
            window.location.href = `/customer/home?${params.toString()}`;
          } else {
            window.location.href = '/customer/home';
          }
        }, 2000);
      }
    } catch (error) {
      console.error('❌ [CustomerPayment] Payment verification error:', error);
      setError(error.message || 'Payment verification failed');
      setLoading(false);
      // ✅ FIX: Redirect to customer home after payment error
      setTimeout(() => {
        const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
        if (checkoutData?.theaterId) {
          const params = new URLSearchParams({
            theaterid: checkoutData.theaterId,
            ...(checkoutData.qrName && { qrname: checkoutData.qrName }),
            ...(checkoutData.seat && { seat: checkoutData.seat })
          });
          window.location.href = `/customer/home?${params.toString()}`;
        } else {
          window.location.href = '/customer/home';
        }
      }, 2000);
    }
  };

  // Handle Payment Success
  const handlePaymentSuccess = (backendOrder, razorpayResponse) => {
    // ✅ Prevent multiple success handler calls
    if (paymentProcessingRef.current === false) {
      console.warn('⚠️ [CustomerPayment] Payment success handler called but payment not processing');
      return;
    }


    // Save theater info before clearing (for success page navigation)
    const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
    const theaterInfo = {
      theaterId: checkoutData.theaterId,
      theaterName: checkoutData.theaterName,
      qrName: checkoutData.qrName,
      seat: checkoutData.seat
    };

    // Clear cart and checkout data
    localStorage.removeItem('cart');
    localStorage.removeItem('checkoutData');
    localStorage.removeItem('yqpay_cart');
    clearCart();

    // ✅ FIX: Redirect directly to customer home with success flag

    setTimeout(() => {
      if (theaterInfo.theaterId) {
        const params = new URLSearchParams({
          theaterid: theaterInfo.theaterId,
          ...(theaterInfo.qrName && { qrname: theaterInfo.qrName }),
          ...(theaterInfo.seat && { seat: theaterInfo.seat }),
          orderSuccess: 'true',
          orderId: backendOrder.orderNumber || backendOrder._id
        });
        window.location.replace(`/customer/home?${params.toString()}`);
      } else {
        window.location.replace('/customer/home?orderSuccess=true');
      }
    }, 100);
  };

  const handleBack = () => {
    navigate('/customer/otp-verification', { state: { phoneNumber } });
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

  return (
    <div className="payment-page">
      <div className="payment-header">
        <button
          className="back-button"
          onClick={handleBack}
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="payment-title">Payment</h1>
      </div>

      <div className="payment-content">
        {/* Order Summary Section */}
        <div className="order-summary-section">
          <h3 className="section-title">Order Summary</h3>

          {/* Theater Details */}
          {theaterInfo.theaterName && (
            <div className="theater-details-box">
              <div className="theater-detail-item">
                <span className="detail-label">Theater:</span>
                <span className="detail-value">{theaterInfo.theaterName}</span>
              </div>
              {theaterInfo.qrName && (
                <div className="theater-detail-item">
                  <span className="detail-label">Screen:</span>
                  <span className="detail-value">{theaterInfo.qrName}</span>
                </div>
              )}
              {theaterInfo.seat && (
                <div className="theater-detail-item">
                  <span className="detail-label">Seat:</span>
                  <span className="detail-value">{theaterInfo.seat}</span>
                </div>
              )}
            </div>
          )}

          <div className="summary-row total-row">
            <span className="summary-label">Total Amount</span>
            <span className="summary-value">{formatPrice(orderSummary.total)}</span>
          </div>
        </div>

        {/* Payment Methods Section */}
        <div className="payment-methods-section">
          <h3 className="section-title">Choose Payment Method</h3>

          <div className="payment-methods">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`payment-method ${selectedPaymentMethod === method.id ? 'selected' : ''}`}
                onClick={() => handlePaymentMethodSelect(method.id)}
              >
                <div className="payment-icon">
                  {method.id === 'upi' && '📱'}
                  {method.id === 'card' && '💳'}
                  {method.id === 'netbanking' && '🏦'}
                  {method.id === 'wallet' && '👛'}
                  {method.id === 'cash' && '💵'}
                </div>
                <div className="payment-info">
                  <div className="payment-name">{method.name}</div>
                  <div className="payment-description">{method.description}</div>
                </div>
                <div className="payment-radio"></div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Pay Now Button */}
        <button
          className="pay-now-button"
          onClick={handlePayNow}
          disabled={loading || !selectedPaymentMethod || cartItems.length === 0}
        >
          {loading ? 'Processing Payment...' : `Pay ${formatPrice(orderSummary.total)}`}
        </button>

        <div className="security-badge">
          Your payment information is secure and encrypted
        </div>
      </div>
    </div>
  );
};

export default CustomerPayment;