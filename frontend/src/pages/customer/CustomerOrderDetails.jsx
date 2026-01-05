import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useCustomerAutoLogout from '@hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import config from '@config';
import '@styles/customer/CustomerOrderDetails.css';
import '@styles/pages/customer/CustomerOrderDetails.css'; // Extracted inline styles
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { getImageSrc } from '@utils/globalImageCache'; // 🚀 Import image cache


const CustomerOrderDetails = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(location.search);
      const theaterId = params.get('theaterid');
      const phoneNumber = params.get('phone');

      if (!theaterId || !phoneNumber) {
        throw new Error('Missing required parameters');
      }


      const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater/${theaterId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      }, {
        cacheKey: `orders_theater_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });
      if (!response.ok) throw new Error('Failed to fetch orders');

      const data = await response.json();

      // Find the specific order by orderId and phone number - check multiple phone field variations
      const foundOrder = data.orders.find(order => {
        const orderPhone = order.customerInfo?.phoneNumber ||
          order.customerInfo?.phone ||
          order.customerPhone ||
          order.phone;

        const matches = order._id === orderId && orderPhone === phoneNumber;

        if (order._id === orderId) {
        }

        return matches;
      });


      if (!foundOrder) throw new Error('Order not found');
      setOrder(foundOrder);
    } catch (err) {
      console.error('❌ Error fetching order details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => navigate(-1);

  if (loading) {
    return (
      <div className="cart-page">
        <div className="cart-header">
          <button className="back-button" onClick={handleBack}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="cart-title">Order Details</h1>
          <div className="cart-header-spacer"></div>
        </div>
        <div className="loading-container"><div className="loading-spinner"></div></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="cart-page">
        <div className="cart-header">
          <button className="back-button" onClick={handleBack}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="cart-title">Order Details</h1>
          <div className="cart-header-spacer"></div>
        </div>
        <div className="empty-cart">
          <div className="empty-cart-icon">⚠️</div>
          <h2 className="empty-cart-title">Error Loading Order</h2>
          <p className="empty-cart-text">{error || 'Order not found'}</p>
        </div>
      </div>
    );
  }

  const items = order.items || [];
  // ✅ Check pricing object first, then root level fields
  const subtotal = parseFloat(order.pricing?.subtotal || order.subtotal || 0);
  const tax = parseFloat(order.pricing?.tax || order.tax || 0);
  const cgst = parseFloat(order.pricing?.cgst || order.cgst || tax / 2);
  const sgst = parseFloat(order.pricing?.sgst || order.sgst || tax / 2);
  const total = parseFloat(order.pricing?.total || order.pricing?.grandTotal || order.total || order.totalAmount || 0);
  const totalDiscount = parseFloat(order.pricing?.totalDiscount || order.totalDiscount || 0);

  // Format date and time from order
  const formatDateTime = (timestamp) => {
    if (!timestamp) return { date: 'N/A', time: 'N/A' };
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return { date: 'N/A', time: 'N/A' };
      
      return {
        date: date.toLocaleDateString('en-IN', { 
          day: '2-digit', 
          month: 'short', 
          year: 'numeric' 
        }),
        time: date.toLocaleTimeString('en-IN', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        })
      };
    } catch (error) {
      console.error('Error formatting date:', error);
      return { date: 'N/A', time: 'N/A' };
    }
  };

  // Get order date/time from multiple possible fields
  const orderTimestamp = order.timestamps?.placedAt || 
                         order.createdAt || 
                         order.orderDate || 
                         order.timestamp ||
                         order.date;
  
  const orderDateTime = formatDateTime(orderTimestamp);

  return (
    <div className="cart-page">
      {/* Header */}
      <div className="cart-header">
        <button className="back-button" onClick={handleBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="cart-title">Order Details</h1>
        <div className="cart-header-spacer"></div>
      </div>

      {/* Theater & QR Info */}
      {(order.qrName || order.seat) && (
        <div className="cart-info-section">
          {order.qrName && (
            <div className="cart-info-item">
              <span className="info-icon">📱</span>
              <span className="info-text">{order.qrName}</span>
            </div>
          )}
          {order.seat && (
            <div className="cart-info-item">
              <span className="info-icon">💺</span>
              <span className="info-text">Seat {order.seat}</span>
            </div>
          )}
        </div>
      )}

      {/* Cart Items */}
      <div className="cart-items-container">
        <div className="cart-items-header">
          <h2 className="items-count">{items.length} {items.length === 1 ? 'Item' : 'Items'}</h2>
        </div>

        <div className="cart-items-list">
          {items.map((item, index) => {
            // Map backend fields to frontend fields
            const itemPrice = parseFloat(item.unitPrice || item.price || 0);
            // ✅ Use item.total instead of item.totalPrice
            const itemTotalPrice = parseFloat(item.total || item.totalPrice || (item.unitPrice * item.quantity) || 0);
            const discountPercentage = parseFloat(item.discountPercentage || 0);
            const hasDiscount = discountPercentage > 0;

            // Calculate discounted price if discount exists
            const discountedPrice = hasDiscount
              ? itemPrice * (1 - discountPercentage / 100)
              : itemPrice;

            // ✅ Get image from multiple possible locations (prioritize in order)
            let imageUrl = null;

            // Check direct image fields first
            if (item.image) {
              imageUrl = item.image;
            } else if (item.productImage) {
              imageUrl = item.productImage;
            }
            // Check images array
            else if (item.images && Array.isArray(item.images) && item.images.length > 0) {
              const firstImage = item.images[0];
              imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
            }
            // Check nested product object
            else if (item.product) {
              if (item.product.images && Array.isArray(item.product.images) && item.product.images.length > 0) {
                const firstImage = item.product.images[0];
                imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.imageUrl || null;
              } else if (item.product.image) {
                imageUrl = item.product.image;
              } else if (item.product.imageUrl) {
                imageUrl = item.product.imageUrl;
              }
            }

            // 🚀 Use cached image or original URL
            const displayImageUrl = imageUrl ? getImageSrc(imageUrl) : null;


            return (
              <div key={item._id || index} className="cart-item">
                <div className="cart-item-image-container">
                  {displayImageUrl ? (
                    <img
                      src={displayImageUrl}
                      alt={item.name}
                      className="cart-item-image"
                      loading="eager"
                      onError={(e) => {
                        console.error('❌ Image failed to load:', displayImageUrl);
                        e.target.style.display = 'none';
                        const parent = e.target.parentElement;
                        if (parent && !parent.querySelector('.fallback-icon')) {
                          const fallback = document.createElement('div');
                          fallback.className = 'fallback-icon';
                          fallback.style.cssText = 'width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold; border-radius: 12px;';
                          const itemName = item.name || item.productName || 'Item';
                          fallback.textContent = itemName.charAt(0).toUpperCase();
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div className="fallback-icon fallback-icon-gradient">
                      {(item.name || item.productName || 'Item')?.charAt(0).toUpperCase() || '🍽️'}
                    </div>
                  )}
                  {hasDiscount && (
                    <div className="discount-badge">{discountPercentage}% OFF</div>
                  )}
                </div>

                <div className="cart-item-details">
                  <h3 className="cart-item-name">{item.name || item.productName || 'Item'}</h3>
                  <div className="cart-item-price-container">
                    {hasDiscount ? (
                      <>
                        <p className="cart-item-price">₹{discountedPrice.toFixed(2)}</p>
                        <p className="cart-item-original-price">₹{itemPrice.toFixed(2)}</p>
                      </>
                    ) : (
                      <p className="cart-item-price">₹{itemPrice.toFixed(2)}</p>
                    )}
                  </div>
                </div>

                <div className="cart-item-actions">
                  <div className="quantity-display-readonly">
                    <span className="quantity-text">Qty: {item.quantity}</span>
                  </div>
                  <p className="cart-item-total">₹{itemTotalPrice.toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Section */}
      <div className="cart-summary">
        <div className="summary-divider"></div>

        <div className="summary-row">
          <span className="summary-label">Subtotal</span>
          <span className="summary-value">₹{subtotal.toFixed(2)}</span>
        </div>

        <div className="summary-row">
          <span className="summary-label">CGST</span>
          <span className="summary-value">₹{cgst.toFixed(2)}</span>
        </div>

        <div className="summary-row">
          <span className="summary-label">SGST</span>
          <span className="summary-value">₹{sgst.toFixed(2)}</span>
        </div>

        {totalDiscount > 0 && (
          <div className="summary-row discount-row">
            <span className="summary-label">Discount</span>
            <span className="summary-value discount-value">-₹{totalDiscount.toFixed(2)}</span>
          </div>
        )}

        <div className="summary-divider"></div>

        <div className="summary-row summary-total">
          <span className="summary-label">Total</span>
          <span className="summary-value">₹{total.toFixed(2)}</span>
        </div>

        {/* Order Date & Time */}
        <div className="summary-row order-datetime-row">
          <span className="summary-label">Date:</span>
          <span className="summary-value">{orderDateTime.date}</span>
        </div>
        <div className="summary-row order-datetime-row">
          <span className="summary-label">Time:</span>
          <span className="summary-value">{orderDateTime.time}</span>
        </div>

        {/* Order Info */}
        <div className="order-info-footer">
          <div className="order-info-row">
            <span className="order-info-label">Order ID:</span>
            <span className="order-info-value">{order.orderNumber || orderId}</span>
          </div>
          <div className="order-info-row">
            <span className="order-info-label">Date:</span>
            <span className="order-info-value">{orderDateTime.date}</span>
          </div>
          <div className="order-info-row">
            <span className="order-info-label">Time:</span>
            <span className="order-info-value">{orderDateTime.time}</span>
          </div>
          <div className="order-info-row">
            <span className="order-info-label">Status:</span>
            <span className="order-info-value">{order.status || 'Pending'}</span>
          </div>
          <div className="order-info-row">
            <span className="order-info-label">Payment:</span>
            <span className="order-info-value">
              {(order.payment?.method || order.paymentMethod || order.paymentMode || 'UPI').toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerOrderDetails;
