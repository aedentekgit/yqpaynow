import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import CustomerFooter from '@components/customer/CustomerFooter';
import { useCart } from '@contexts/CartContext';
import useCustomerAutoLogout from '@hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import config from '@config';
import '@styles/customer/CustomerCheckout.css';
import '@styles/pages/customer/CustomerCheckout.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';



// Cart Item Component with swipe-to-delete
const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
  const [quantity, setQuantity] = useState(item.quantity || 1);
  const [isSliding, setIsSliding] = useState(false);
  const [slideDistance, setSlideDistance] = useState(0);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

  const handleQuantityChange = (newQuantity) => {
    if (newQuantity < 1) {
      onRemove(item._id);
      return;
    }
    setQuantity(newQuantity);
    onUpdateQuantity(item._id, newQuantity);
  };

  const handleTouchStart = (e) => {
    // Only start tracking if it's a single finger touch
    if (e.touches.length !== 1) return;

    setStartX(e.touches[0].clientX);
    setStartY(e.touches[0].clientY);
    setIsSliding(false);
    setSlideDistance(0);
    setHasMoved(false);
  };

  const handleTouchMove = (e) => {
    if (!startX || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = startX - currentX;
    const diffY = currentY - startY;

    // If vertical movement is significant, allow scrolling and don't interfere
    if (Math.abs(diffY) > 10 && Math.abs(diffY) > Math.abs(diffX)) {
      return; // Let browser handle scrolling
    }

    // Only prevent default for horizontal swipes > 15px
    if (Math.abs(diffX) > 15 && Math.abs(diffX) > Math.abs(diffY)) {
      setHasMoved(true);
      e.preventDefault(); // Only prevent when horizontal swipe is detected
      e.stopPropagation();

      if (diffX > 0 && diffX < 150) { // Only allow sliding to the left, max 150px
        setSlideDistance(diffX);
        setIsSliding(true);
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();

      if (slideDistance > 100) { // If slid more than 100px, delete the item
        onRemove(item._id);
      } else {
        // Reset position
        setSlideDistance(0);
        setIsSliding(false);
      }
    }

    setStartX(0);
    setStartY(0);
    setHasMoved(false);
  };

  const handleClick = (e) => {
    // Simple and compatible event prevention
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  const handleMouseDown = (e) => {
    // Prevent mouse-based expansion
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  const handleContextMenu = (e) => {
    // Prevent context menu
    e.preventDefault();
    return false;
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
  };

  const itemTotal = (item.price || 0) * quantity;

  return (
    <div
      className="cart-item-wrapper"
    >
      <div
        className={`cart-item ${isSliding ? 'sliding' : ''}`}
        style={{
          transform: `translateX(-${slideDistance}px)`,
          transition: 'none'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* Image on the left */}
        <div className="cart-item-image">
          <img
            src={item.image || '/placeholder-food.png'}
            alt={item.name}
            onError={(e) => {
              e.target.src = '/placeholder-food.png';
            }}
          />
        </div>

        {/* Middle section - Product info in vertical lines */}
        <div className="cart-item-info">
          <div className="product-details">
            <h3 className="cart-item-name">{item.name}</h3>
            <p className="cart-item-description">{item.description || 'Double Beef'}</p>
            <div className="cart-item-price">
              {formatPrice(itemTotal)}
            </div>
          </div>
        </div>

        {/* Right section - Vertical quantity controls */}
        <div className="cart-item-right">
          <button
            className="quantity-btn plus"
            onClick={() => handleQuantityChange(quantity + 1)}
          >
            +
          </button>
          <span className="quantity-display">{quantity}</span>
          <button
            className="quantity-btn minus"
            onClick={() => handleQuantityChange(quantity - 1)}
          >
            −
          </button>
        </div>
      </div>

      {/* Delete indicator shown when sliding */}
      <div className="delete-indicator" style={{
        opacity: slideDistance > 50 ? 1 : slideDistance / 50
      }}>
        <svg className="delete-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
        <span className="delete-text">Release to Delete</span>
      </div>
    </div>
  );
};

// Pricing Summary Component
const PricingSummary = ({ subtotal, deliveryCharge, tax, total }) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
  };

  return (
    <div className="pricing-summary">
      <div className="pricing-row">
        <span className="pricing-label">Subtotal:</span>
        <span className="pricing-value">{formatPrice(subtotal)}</span>
      </div>

      <div className="pricing-row">
        <span className="pricing-label">Delivery charge:</span>
        <span className="pricing-value">{formatPrice(deliveryCharge)}</span>
      </div>

      <div className="pricing-row">
        <span className="pricing-label">Tax:</span>
        <span className="pricing-value">{formatPrice(tax)}</span>
      </div>

      <div className="pricing-row total-row">
        <span className="pricing-label">Total</span>
        <span className="pricing-value total-value">{formatPrice(total)}</span>
      </div>
    </div>
  );
};

// Footer Component
const CustomerCheckoutFooter = ({ total, onCheckout, isLoading }) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
  };

  return (
    <div className="checkout-footer">
      <button
        className="checkout-btn"
        onClick={onCheckout}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="loading-spinner"></span>
        ) : (
          <>
            <span className="order-icon">🍽️</span>
            Place Food Order
          </>
        )}
      </button>
    </div>
  );
};

const CustomerCheckout = () => {
  const navigate = useNavigate();

  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();
  const location = useLocation();
  const { items: cartItems, updateQuantity, removeItem, subtotal, deliveryCharge, tax, total, totalDiscount, formatPrice, isEmpty } = useCart();
  const [isLoading, setIsLoading] = useState(false);
  const [theater, setTheater] = useState(null);

  // Extract URL parameters for navigation
  const urlParams = new URLSearchParams(location.search);
  const theaterId = urlParams.get('theaterid');
  const screenName = urlParams.get('screen');
  const seatId = urlParams.get('seat');

  // Load theater data like CustomerHome
  useEffect(() => {
    const loadTheater = async () => {
      if (theaterId) {
        try {
          const data = await ultraFetch(`/api/theaters/${theaterId}`, {}, { cacheTTL: 60000 });
          if (data.success && data.theater) {
            setTheater(data.theater);
          }
        } catch (error) {
        }
      }
    };
    loadTheater();
  }, [theaterId]);

  // Custom home navigation handler
  const handleHomeNavigation = () => {
    const params = new URLSearchParams();
    if (theaterId) params.set('theaterid', theaterId);
    if (screenName) params.set('screen', screenName);
    if (seatId) params.set('seat', seatId);

    const queryString = params.toString();
    navigate(`/customer/order${queryString ? `?${queryString}` : ''}`);
  };

  const handleUpdateQuantity = (itemId, newQuantity) => {
    updateQuantity(itemId, newQuantity);
  };

  const handleRemoveItem = (itemId) => {
    // Create a product object for the removeItem function
    const item = cartItems.find(item => item._id === itemId);
    if (item) {
      // Remove all quantities of this item
      updateQuantity(itemId, 0);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleCheckout = async () => {
    setIsLoading(true);

    try {
      // Simulate checkout process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Navigate to payment or confirmation page
      navigate('/customer/payment', {
        state: {
          cartItems,
          subtotal,
          deliveryCharge,
          tax,
          total,
          totalDiscount: totalDiscount || 0  // Use actual discount from cart
        }
      });
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="customer-checkout">
      {/* Header - Same as CustomerHome */}
      <div className="order-header">
        <div className="header-content">
          {/* Top Row - QR Code Name and Seat Number */}
          <div className="header-top-row">
            <div className="header-left">
              {screenName && (
                <div className="qr-code-name">
                  {screenName}
                </div>
              )}
            </div>
            <div className="header-right">
              {seatId && (
                <div className="seat-number">
                  SEAT: {seatId}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row - Theater Name */}
          <div className="header-bottom-row">
            <h1 className="page-title">
              {theater ? theater.name : 'My Cart'}
            </h1>
          </div>
        </div>
      </div>

      <div className="checkout-container">
        {/* Cart Items */}
        <div className="checkout-content">
          <div className="cart-items-container">
            {cartItems.length > 0 ? (
              cartItems.map(item => (
                <CartItem
                  key={item._id}
                  item={item}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                />
              ))
            ) : (
              <div className="empty-cart">
                <div className="empty-cart-icon">🛒</div>
                <h3>Your cart is empty</h3>
                <p>Add some delicious items to get started!</p>
              </div>
            )}
          </div>

          {/* Pricing Summary */}
          {cartItems.length > 0 && (
            <PricingSummary
              subtotal={subtotal}
              deliveryCharge={deliveryCharge}
              tax={tax}
              total={total}
            />
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <CustomerCheckoutFooter
            total={total}
            onCheckout={handleCheckout}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Footer Navigation */}
      <CustomerFooter
        activeTab="order"
        theaterid={theaterId}
        screen={screenName}
        seat={seatId}
      />
    </div>
  );
};

export default CustomerCheckout;