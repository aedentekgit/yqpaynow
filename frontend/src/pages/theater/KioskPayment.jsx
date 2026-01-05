import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import config from '@config';
import { loadRazorpayScript } from '@utils/razorpayLoader';
import '@styles/TheaterList.css';
import '@styles/KioskPages.css';
import '@styles/pages/theater/KioskPayment.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { printReceiptSilently, printService } from '@utils/silentPrintService'; // 🖨️ Silent printer for kiosk orders



const KioskPayment = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [orderData, setOrderData] = useState(location.state || {});
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [theaterInfo, setTheaterInfo] = useState(null); // Theater information
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  
  // Card payment fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  
  // UPI fields
  const [upiId, setUpiId] = useState('');
  
  const [errors, setErrors] = useState({});

  // Redirect if no order data
  useEffect(() => {
    if (!orderData.items || orderData.items.length === 0) {
      navigate(`/kiosk-view-cart/${theaterId}`);
    }
  }, [orderData, theaterId, navigate]);

  // Fetch theater information
  useEffect(() => {
    const fetchTheaterInfo = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
          headers: {
            'Accept': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: `theater_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setTheaterInfo(data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching theater info:', error);
      }
    };

    if (theaterId) {
      fetchTheaterInfo();
    }
  }, [theaterId]);

  // Fetch payment gateway configuration and load Razorpay
  useEffect(() => {
    const initializePayment = async () => {
      try {
        // Fetch gateway config
        const response = await unifiedFetch(`${config.api.baseUrl}/payments/config/${theaterId}/kiosk`, {
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          cacheKey: `payment_config_kiosk_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });
        const data = await response.json();

        if (data.success && data.config) {
          setGatewayConfig(data.config);
        } else {
          console.warn('⚠️ No payment gateway configured for kiosk');
        }

        // Load Razorpay script
        const loaded = await loadRazorpayScript();
        setRazorpayLoaded(loaded);
        if (!loaded) {
          console.error('Failed to load Razorpay SDK');
        }
      } catch (error) {
        console.error('Error initializing payment:', error);
      }
    };

    if (theaterId) {
      initializePayment();
    }
  }, [theaterId]);

  const formatPrice = useCallback((price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price || 0);
  }, []);

  const validatePayment = useCallback(() => {
    const newErrors = {};
    
    if (paymentMethod === 'card') {
      if (!cardNumber || cardNumber.replace(/\s/g, '').length !== 16) {
        newErrors.cardNumber = 'Please enter a valid 16-digit card number';
      }
      if (!cardName.trim()) {
        newErrors.cardName = 'Cardholder name is required';
      }
      if (!cardExpiry || !/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        newErrors.cardExpiry = 'Please enter expiry in MM/YY format';
      }
      if (!cardCVV || !/^\d{3,4}$/.test(cardCVV)) {
        newErrors.cardCVV = 'Please enter a valid CVV';
      }
    } else if (paymentMethod === 'upi') {
      if (!upiId.trim() || !upiId.includes('@')) {
        newErrors.upiId = 'Please enter a valid UPI ID';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [paymentMethod, cardNumber, cardName, cardExpiry, cardCVV, upiId]);

  const handleBackToCheckout = useCallback(() => {
    navigate(`/kiosk-checkout/${theaterId}`, {
      state: orderData
    });
  }, [navigate, theaterId, orderData]);

  const handleConfirmPayment = async () => {
    // For card, upi, online - check gateway availability
    if (['card', 'upi', 'online'].includes(paymentMethod)) {
      if (!razorpayLoaded) {
        alert('Payment gateway not ready. Please refresh the page.');
        return;
      }
      if (!gatewayConfig) {
        alert('Payment gateway not configured for this theater.');
        return;
      }
    }

    if (paymentMethod === 'cash' && !validatePayment()) {
      return;
    }
    
    try {
      setProcessing(true);
      
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('Authentication required');
      }

      // Prepare order payload
      const orderPayload = {
        theaterId: theaterId,
        customerName: orderData.customerName,
        customerPhone: orderData.customerPhone,
        customerEmail: orderData.customerEmail || '',
        seatNumber: orderData.seatNumber || '',
        items: orderData.items.map(item => ({
          productId: item._id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: parseFloat(item.sellingPrice || item.pricing?.basePrice) || 0,
          price: parseFloat(item.sellingPrice || item.pricing?.basePrice) || 0,
          taxRate: item.taxRate || 0,
          gstType: item.gstType || 'EXCLUDE',
          discountPercentage: item.discountPercentage || 0,
          specialInstructions: item.notes || '',
          originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option || 
                           (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
          size: item.size || null,
          productSize: item.productSize || null,
          sizeLabel: item.sizeLabel || null,
          variant: item.variant || null
        })),
        paymentMethod: paymentMethod,
        deliveryOption: orderData.deliveryOption || 'pickup',
        orderNotes: orderData.orderNotes || '',
        orderType: 'counter', // Important: This determines 'kiosk' channel
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        totalAmount: orderData.total,
        total: orderData.total,
        totalDiscount: orderData.totalDiscount || 0,
        discount: orderData.totalDiscount || 0,
        paymentDetails: {
          method: paymentMethod,
          ...(paymentMethod === 'card' && {
            last4Digits: cardNumber.slice(-4),
            cardHolder: cardName
          }),
          ...(paymentMethod === 'upi' && {
            upiId: upiId
          })
        }
      };

      // Submit order to backend
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(orderPayload)
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create order');
      }

      if (data.success) {
        const createdOrder = data.order;

        // If using Razorpay (card, UPI, online), initiate payment
        if (['card', 'upi', 'online'].includes(paymentMethod) && gatewayConfig) {
          await initiateRazorpayPayment(createdOrder, orderData.total);
        } else {
          // For cash, proceed directly to success
          handleOrderSuccess(createdOrder);
        }
      } else {
        throw new Error(data.message || 'Order creation failed');
      }
    } catch (error) {

      alert(`Error: ${error.message}`);
      setProcessing(false);
    }
  };

  // Initiate Razorpay Payment for Kiosk
  const initiateRazorpayPayment = async (createdOrder, amount) => {
    try {
      // Create Razorpay order
      const token = localStorage.getItem('authToken');
      const createOrderResponse = await unifiedFetch(`${config.api.baseUrl}/payments/create-order`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({
          orderId: createdOrder._id,
          paymentMethod: paymentMethod
        })
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      const razorpayOrderData = await createOrderResponse.json();

      if (!razorpayOrderData.success) {
        throw new Error(razorpayOrderData.message || 'Failed to create payment order');
      }

      // Extract payment order data (backend returns it in 'data' property)
      const paymentOrder = razorpayOrderData.data;

      // ✅ FIX: Get Razorpay key from nested razorpay object
      const razorpayKeyId = gatewayConfig.razorpay?.keyId || gatewayConfig.keyId;
      
      if (!razorpayKeyId) {
        throw new Error('Razorpay key not found in gateway configuration');
      }

      // Razorpay options
      const options = {
        key: razorpayKeyId,  // ✅ Use the extracted keyId
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        order_id: paymentOrder.orderId,  // Razorpay order ID from backend
        name: 'YQPayNow - Kiosk',
        description: `Order #${createdOrder.orderNumber || createdOrder._id}`,
        handler: async (response) => {
          // Payment success - verify signature
          await verifyRazorpayPayment(response, createdOrder);
        },
        prefill: {
          name: orderData.customerName,
          contact: orderData.customerPhone,
          email: orderData.customerEmail || ''
        },
        theme: {
          color: '#3399cc'
        },
        modal: {
          ondismiss: () => {
            alert('Payment cancelled by user');
            setProcessing(false);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error('Razorpay payment error:', error);
      alert(error.message || 'Failed to initiate payment');
      setProcessing(false);
    }
  };

  // Verify Razorpay Payment
  const verifyRazorpayPayment = async (razorpayResponse, createdOrder) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await unifiedFetch(`${config.api.baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({
          razorpay_order_id: razorpayResponse.razorpay_order_id,
          razorpay_payment_id: razorpayResponse.razorpay_payment_id,
          razorpay_signature: razorpayResponse.razorpay_signature,
          orderId: createdOrder._id
        })
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      const data = await response.json();

      if (data.success) {
        handleOrderSuccess(createdOrder, razorpayResponse);
      } else {
        alert(data.message || 'Payment verification failed');
        setProcessing(false);
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      alert('Payment verification failed');
      setProcessing(false);
    }
  };

  // ✅ Print receipt for kiosk order using default silent printer
  const printKioskOrderReceipt = async (orderId, orderNumber) => {
    try {
      
      // 🔄 Auto-connect to printer if not connected
      if (!printService.isConnected || !printService.ws || printService.ws.readyState !== WebSocket.OPEN) {
        try {
          await printService.connect();
        } catch (connectError) {
          console.warn('⚠️ [KioskPayment] Failed to connect to printer:', connectError.message);
          // Continue anyway - will fail gracefully in printReceiptSilently
        }
      }
      
      // Fetch full order details from backend
      const orderResponse = await unifiedFetch(`${config.api.baseUrl}/orders/theater/${theaterId}/${orderId}`, {
        headers: {
          'Accept': 'application/json'
        }
      }, {
        forceRefresh: true,
        cacheTTL: 0
      });

      if (!orderResponse.ok) {
        console.warn('⚠️ [KioskPayment] Failed to fetch order for printing');
        return;
      }

      const orderData = await orderResponse.json();
      const order = orderData.data || orderData.order || orderData;

      if (!order) {
        console.warn('⚠️ [KioskPayment] Order data not found for printing');
        return;
      }

      // Prepare theater info for printing
      const theaterInfoForPrint = theaterInfo ? {
        name: theaterInfo.name,
        address: theaterInfo.address,
        phone: theaterInfo.phone,
        email: theaterInfo.email,
        gstNumber: theaterInfo.gstNumber,
        fssaiNumber: theaterInfo.fssaiNumber
      } : {};

      // Print using silent printer (default printer)
      const printResult = await printReceiptSilently(order, theaterInfoForPrint);

      if (printResult && printResult.success) {
      } else {
        console.warn('⚠️ [KioskPayment] Print result:', printResult?.error || 'Unknown error');
        // Don't show error to user - printing is non-critical
      }
    } catch (error) {
      console.error('❌ [KioskPayment] Error printing kiosk order receipt:', error);
      // Silent fail - don't interrupt order flow
    }
  };

  // Handle Order Success
  const handleOrderSuccess = (createdOrder, razorpayResponse = null) => {
    // Clear cart from localStorage
    localStorage.removeItem(`kiosk-cart-${theaterId}`);
    
    // Show success modal
    setOrderDetails({
      orderNumber: createdOrder.orderNumber || createdOrder._id,
      orderId: createdOrder._id,
      total: orderData.total,
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      totalDiscount: orderData.totalDiscount || 0,
      paymentMethod: paymentMethod,
      razorpayPaymentId: razorpayResponse?.razorpay_payment_id,
      customerName: orderData.customerName,
      items: orderData.items
    });
    setShowSuccessModal(true);
    setProcessing(false);

    // 🖨️ AUTO-PRINT: Print receipt for kiosk order using default silent printer
    const orderId = createdOrder._id;
    const orderNumber = createdOrder.orderNumber || createdOrder._id;
    printKioskOrderReceipt(orderId, orderNumber).catch(err => {
      console.error('❌ [KioskPayment] Error printing receipt (non-critical):', err);
    });
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    navigate(`/kiosk-products/${theaterId}`);
  };

  const handlePrintReceipt = () => {
    // Disabled browser print dialog. Receipt printing is now handled
    // automatically by the backend POS agent and local printer.
    return;
  };

  const formatCardNumber = (value) => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(' ');
  };

  const handleCardNumberChange = (e) => {
    const value = e.target.value.replace(/\s/g, '');
    if (/^\d*$/.test(value) && value.length <= 16) {
      setCardNumber(formatCardNumber(value));
    }
  };

  const handleExpiryChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    setCardExpiry(value);
  };

  const { items = [], total = 0 } = orderData;

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Payment" currentPage="payment">
        <div className="kiosk-page-container">
          {/* Header */}
          <div className="kiosk-page-header">
            <div className="header-content">
              <button className="back-button" onClick={handleBackToCheckout} disabled={processing}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
              </button>
              <div className="title-group">
                <h1>Payment</h1>
                <p className="header-subtitle">Choose your payment method</p>
              </div>
            </div>
          </div>

          <div className="payment-content">
            {/* Left Column - Payment Methods */}
            <div className="payment-left">
              <div className="payment-section">
                <h3>Select Payment Method</h3>
                
                {/* Payment Method Options */}
                <div className="payment-methods">
                  <label className={`payment-method ${paymentMethod === 'cash' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="cash"
                      checked={paymentMethod === 'cash'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="method-content">
                      <div className="method-icon">💵</div>
                      <div>
                        <strong>Cash</strong>
                        <p>Pay with cash at counter</p>
                      </div>
                    </div>
                  </label>

                  <label className={`payment-method ${paymentMethod === 'card' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="method-content">
                      <div className="method-icon">💳</div>
                      <div>
                        <strong>Credit/Debit Card</strong>
                        <p>Pay securely with your card</p>
                      </div>
                    </div>
                  </label>

                  <label className={`payment-method ${paymentMethod === 'upi' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="upi"
                      checked={paymentMethod === 'upi'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="method-content">
                      <div className="method-icon">📱</div>
                      <div>
                        <strong>UPI</strong>
                        <p>Pay using UPI apps</p>
                      </div>
                    </div>
                  </label>

                  <label className={`payment-method ${paymentMethod === 'online' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="online"
                      checked={paymentMethod === 'online'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="method-content">
                      <div className="method-icon">🌐</div>
                      <div>
                        <strong>Online Payment</strong>
                        <p>Net banking & wallets</p>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Card Payment Form */}
                {paymentMethod === 'card' && (
                  <div className="payment-form">
                    <h4>Card Details</h4>
                    <div className="form-group">
                      <label>Card Number <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="1234 5678 9012 3456"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        className={`form-input ${errors.cardNumber ? 'error' : ''}`}
                        maxLength="19"
                      />
                      {errors.cardNumber && <span className="error-text">{errors.cardNumber}</span>}
                    </div>

                    <div className="form-group">
                      <label>Cardholder Name <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="Name on card"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value.toUpperCase())}
                        className={`form-input ${errors.cardName ? 'error' : ''}`}
                      />
                      {errors.cardName && <span className="error-text">{errors.cardName}</span>}
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Expiry Date <span className="required">*</span></label>
                        <input
                          type="text"
                          placeholder="MM/YY"
                          value={cardExpiry}
                          onChange={handleExpiryChange}
                          className={`form-input ${errors.cardExpiry ? 'error' : ''}`}
                          maxLength="5"
                        />
                        {errors.cardExpiry && <span className="error-text">{errors.cardExpiry}</span>}
                      </div>

                      <div className="form-group">
                        <label>CVV <span className="required">*</span></label>
                        <input
                          type="password"
                          placeholder="123"
                          value={cardCVV}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^\d*$/.test(value) && value.length <= 4) {
                              setCardCVV(value);
                            }
                          }}
                          className={`form-input ${errors.cardCVV ? 'error' : ''}`}
                          maxLength="4"
                        />
                        {errors.cardCVV && <span className="error-text">{errors.cardCVV}</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* UPI Payment Form */}
                {paymentMethod === 'upi' && (
                  <div className="payment-form">
                    <h4>UPI Details</h4>
                    <div className="form-group">
                      <label>UPI ID <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="yourname@upi"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className={`form-input ${errors.upiId ? 'error' : ''}`}
                      />
                      {errors.upiId && <span className="error-text">{errors.upiId}</span>}
                    </div>
                    <div className="upi-apps">
                      <p>Supported UPI Apps:</p>
                      <div className="upi-icons">
                        <span>Google Pay</span>
                        <span>PhonePe</span>
                        <span>Paytm</span>
                        <span>BHIM</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Online Payment Info */}
                {paymentMethod === 'online' && (
                  <div className="payment-info">
                    <p>You will be redirected to a secure payment gateway to complete your payment.</p>
                  </div>
                )}

                {/* Cash Payment Info */}
                {paymentMethod === 'cash' && (
                  <div className="payment-info">
                    <p>Please have the exact amount ready. You can pay at the counter when collecting your order.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Order Summary */}
            <div className="payment-right">
              <div className="order-summary-card">
                <h3>Order Summary</h3>
                
                <div className="summary-items">
                  {items.map((item, index) => (
                    <div key={item._id || index} className="summary-item">
                      <span className="item-name">{item.name} x {item.quantity}</span>
                    </div>
                  ))}
                </div>

                <div className="summary-breakdown">
                  <div className="summary-divider"></div>
                  <div className="summary-row total">
                    <span>Total Amount</span>
                    <span className="total-amount">{formatPrice(total)}</span>
                  </div>
                </div>

                <div className="payment-actions">
                  <button 
                    className="btn-secondary" 
                    onClick={handleBackToCheckout}
                    disabled={processing}
                  >
                    Back
                  </button>
                  <button 
                    className="btn-primary btn-pay" 
                    onClick={handleConfirmPayment}
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <span className="spinner-small"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        Pay {formatPrice(total)}
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                          <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                        </svg>
                      </>
                    )}
                  </button>
                </div>

                <div className="security-badge">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                  </svg>
                  <span>Secure Payment</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Success Modal */}
        {showSuccessModal && orderDetails && (
          <div className="modal-overlay active" onClick={handleModalClose}>
            <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
              {theaterInfo && (
                <div className="theater-info-header">
                  <h2 className="success-modal-header">
                    {theaterInfo.name}
                  </h2>
                  <div className="success-modal-subtitle">
                    {theaterInfo.address && (
                      <div>{[
                        theaterInfo.address.street,
                        theaterInfo.address.city,
                        theaterInfo.address.state,
                        theaterInfo.address.zipCode
                      ].filter(Boolean).join(', ')}</div>
                    )}
                    {theaterInfo.phone && (<div>Phone: {theaterInfo.phone}</div>)}
                    {theaterInfo.email && (<div>Email: {theaterInfo.email}</div>)}
                    {theaterInfo.gstNumber && (<div>GST: {theaterInfo.gstNumber}</div>)}
                    {theaterInfo.fssaiNumber && (<div>FSSAI: {theaterInfo.fssaiNumber}</div>)}
                  </div>
                </div>
              )}
              
              <div className="success-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64">
                  <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
              </div>
              <h2>Payment Successful!</h2>
              
              <div className="order-details-section">
                <p className="order-details-item"><strong>Invoice ID:</strong> {orderDetails.orderNumber}</p>
                <p className="order-details-item"><strong>Date:</strong> {new Date().toLocaleString('en-IN')}</p>
                <p className="order-details-item"><strong>Bill To:</strong> {orderDetails.customerName}</p>
              </div>
              
              {/* Order Items */}
              {orderDetails.items && orderDetails.items.length > 0 && (
                <div className="invoice-section">
                  <div className="invoice-header">
                    <div className="invoice-header-item">Item Name</div>
                    <div className="invoice-header-qty">Qty</div>
                    <div className="invoice-header-rate">Rate</div>
                    <div className="invoice-header-total">Total</div>
                  </div>
                  {orderDetails.items.map((item, index) => (
                    <div key={index} className="invoice-row">
                      <div className="invoice-row-item">{item.name}</div>
                      <div className="invoice-row-qty">{item.quantity}</div>
                      <div className="invoice-row-rate">
                        {(item.sellingPrice || item.price).toFixed(2)}
                      </div>
                      <div className="invoice-row-total">
                        {((item.sellingPrice || item.price) * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="summary-section">
                {orderDetails.subtotal && (
                  <p className="summary-row">
                    <span>Subtotal:</span>
                    <strong>₹{orderDetails.subtotal.toFixed(2)}</strong>
                  </p>
                )}
                {orderDetails.tax && (
                  <p className="summary-row">
                    <span>GST/Tax:</span>
                    <strong>₹{orderDetails.tax.toFixed(2)}</strong>
                  </p>
                )}
                {orderDetails.totalDiscount > 0 && (
                  <p className="summary-row">
                    <span>Discount:</span>
                    <strong>-₹{orderDetails.totalDiscount.toFixed(2)}</strong>
                  </p>
                )}
                <p className="summary-total">
                  <span>Grand Total:</span>
                  <span>₹{orderDetails.total.toFixed(2)}</span>
                </p>
                <p className="payment-info-text">
                  <strong>Payment Method:</strong> {orderDetails.paymentMethod.toUpperCase()}
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handlePrintReceipt}>
                  Print Receipt
                </button>
                <button className="btn-primary" onClick={handleModalClose}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default KioskPayment;
