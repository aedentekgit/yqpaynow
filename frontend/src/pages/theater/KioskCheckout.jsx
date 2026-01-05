import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import config from '@config';
import '@styles/TheaterList.css';
import '@styles/KioskPages.css';
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';


const KioskCheckout = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [cartData, setCartData] = useState(location.state || {});
  const [customerName, setCustomerName] = useState(cartData.customerName || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [seatNumber, setSeatNumber] = useState(cartData.seatNumber || '');
  const [orderNotes, setOrderNotes] = useState('');
  const [deliveryOption, setDeliveryOption] = useState('pickup'); // pickup or delivery
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Load cart from localStorage if not in state
  useEffect(() => {
    if (!cartData.items || cartData.items.length === 0) {
      const savedCart = localStorage.getItem(`kiosk-cart-${theaterId}`);
      if (savedCart) {
        try {
          const parsed = JSON.parse(savedCart);
          setCartData(parsed);
          setCustomerName(parsed.customerName || '');
          setSeatNumber(parsed.seatNumber || '');
        } catch (e) {

          navigate(`/kiosk-view-cart/${theaterId}`);
        }
      } else {
        navigate(`/kiosk-view-cart/${theaterId}`);
      }
    }
  }, [theaterId, cartData, navigate]);

  const formatPrice = useCallback((price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price || 0);
  }, []);

  const validateForm = useCallback(() => {
    const newErrors = {};
    
    if (!customerName.trim()) {
      newErrors.customerName = 'Customer name is required';
    }
    
    if (!customerPhone.trim()) {
      newErrors.customerPhone = 'Phone number is required';
    } else if (!/^[0-9]{10}$/.test(customerPhone.replace(/\s/g, ''))) {
      newErrors.customerPhone = 'Please enter a valid 10-digit phone number';
    }
    
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      newErrors.customerEmail = 'Please enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [customerName, customerPhone, customerEmail]);

  const handleBackToCart = useCallback(() => {
    navigate(`/kiosk-view-cart/${theaterId}`, {
      state: cartData
    });
  }, [navigate, theaterId, cartData]);

  const handleProceedToPayment = useCallback(() => {
    if (!validateForm()) {
      return;
    }
    
    // Navigate to payment with all data
    navigate(`/kiosk-payment/${theaterId}`, {
      state: {
        ...cartData,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        seatNumber: seatNumber.trim(),
        orderNotes: orderNotes.trim(),
        deliveryOption
      }
    });
  }, [validateForm, navigate, theaterId, cartData, customerName, customerPhone, customerEmail, seatNumber, orderNotes, deliveryOption]);

  const { items = [], subtotal = 0, tax = 0, total = 0, totalDiscount = 0 } = cartData;

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Checkout" currentPage="checkout">
        <div className="kiosk-page-container">
          {/* Header */}
          <div className="kiosk-page-header">
            <div className="header-content">
              <button className="back-button" onClick={handleBackToCart}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
              </button>
              <div className="title-group">
                <h1>Checkout</h1>
                <p className="header-subtitle">Review your order and enter details</p>
              </div>
            </div>
          </div>

          <div className="checkout-content">
            {/* Left Column - Customer Details */}
            <div className="checkout-left">
              {/* Customer Information */}
              <div className="checkout-section">
                <h3>Customer Information</h3>
                <div className="form-group">
                  <label>Full Name <span className="required">*</span></label>
                  <input
                    type="text"
                    placeholder="Enter customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={`form-input ${errors.customerName ? 'error' : ''}`}
                  />
                  {errors.customerName && <span className="error-text">{errors.customerName}</span>}
                </div>

                <div className="form-group">
                  <label>Phone Number <span className="required">*</span></label>
                  <input
                    type="tel"
                    placeholder="Enter 10-digit phone number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={`form-input ${errors.customerPhone ? 'error' : ''}`}
                    maxLength="10"
                  />
                  {errors.customerPhone && <span className="error-text">{errors.customerPhone}</span>}
                </div>

                <div className="form-group">
                  <label>Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className={`form-input ${errors.customerEmail ? 'error' : ''}`}
                  />
                  {errors.customerEmail && <span className="error-text">{errors.customerEmail}</span>}
                </div>

                <div className="form-group">
                  <label>Seat Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="Enter seat number"
                    value={seatNumber}
                    onChange={(e) => setSeatNumber(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Delivery Options */}
              <div className="checkout-section">
                <h3>Delivery Option</h3>
                <div className="delivery-options">
                  <label className={`delivery-option ${deliveryOption === 'pickup' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="delivery"
                      value="pickup"
                      checked={deliveryOption === 'pickup'}
                      onChange={(e) => setDeliveryOption(e.target.value)}
                    />
                    <div className="option-content">
                      <div className="option-icon">🏪</div>
                      <div>
                        <strong>Pick Up at Counter</strong>
                        <p>Collect your order from the counter</p>
                      </div>
                    </div>
                  </label>
                  
                  <label className={`delivery-option ${deliveryOption === 'seat-delivery' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="delivery"
                      value="seat-delivery"
                      checked={deliveryOption === 'seat-delivery'}
                      onChange={(e) => setDeliveryOption(e.target.value)}
                    />
                    <div className="option-content">
                      <div className="option-icon">🎬</div>
                      <div>
                        <strong>Deliver to Seat</strong>
                        <p>We'll deliver to your seat</p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Order Notes */}
              <div className="checkout-section">
                <h3>Additional Notes (Optional)</h3>
                <textarea
                  placeholder="Any special instructions for your order?"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="form-textarea"
                  rows="4"
                />
              </div>
            </div>

            {/* Right Column - Order Summary */}
            <div className="checkout-right">
              <div className="order-summary-card">
                <h3>Order Summary</h3>
                
                {/* Items List */}
                <div className="summary-items">
                  {items.map((item, index) => {
                    const itemPrice = parseFloat(item.sellingPrice || item.pricing?.basePrice) || 0;
                    const discountPercentage = parseFloat(item.discountPercentage || item.pricing?.discountPercentage) || 0;
                    const finalPrice = discountPercentage > 0 
                      ? itemPrice * (1 - discountPercentage / 100)
                      : itemPrice;
                    
                    return (
                      <div key={item._id || index} className="summary-item">
                        <div className="item-info">
                          <span className="item-name">{item.name}</span>
                          <span className="item-qty">x {item.quantity}</span>
                        </div>
                        <span className="item-price">{formatPrice(finalPrice * item.quantity)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Price Breakdown */}
                <div className="summary-breakdown">
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="summary-row discount">
                      <span>Discount</span>
                      <span>- {formatPrice(totalDiscount)}</span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span>GST/Tax</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
                  <div className="summary-divider"></div>
                  <div className="summary-row total">
                    <span>Total Amount</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="checkout-actions">
                  <button className="btn-secondary" onClick={handleBackToCart}>
                    Back to Cart
                  </button>
                  <button 
                    className="btn-primary" 
                    onClick={handleProceedToPayment}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Proceed to Payment'}
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default KioskCheckout;
