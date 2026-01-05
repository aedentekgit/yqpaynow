import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '@contexts/CartContext';
import useCustomerAutoLogout from '@hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import useStockValidation from '@hooks/useStockValidation';
import { getImageSrc } from '@utils/globalImageCache'; // 🚀 Instant image loading
import { calculateOrderTotals, calculateLineItemTotal } from '@utils/orderCalculation'; // 📊 Centralized calculation
import { validateComboStockAvailability } from '@utils/comboStockValidation';
import { unifiedFetch } from '@utils/unifiedFetch';
import config from '@config';
import '@styles/customer/CustomerCart.css';
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';

// Cart Item Component with Swipe-to-Delete
const CartItemWrapper = ({ 
  item, 
  onRemove, 
  itemPrice, 
  pricePerUnit, 
  hasDiscount, 
  lineItemTotals,
  products,
  comboOffers,
  items,
  validateStockAvailability,
  updateQuantity
}) => {
  const [isSliding, setIsSliding] = useState(false);
  const [slideDistance, setSlideDistance] = useState(0);
  const itemRef = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const hasMovedRef = useRef(false);
  const slideDistanceRef = useRef(0);

  // Update ref when state changes
  useEffect(() => {
    slideDistanceRef.current = slideDistance;
  }, [slideDistance]);

  // Use useEffect to attach non-passive event listeners
  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;

    const handleTouchStart = (e) => {
      // Only start tracking if it's a single finger touch
      if (e.touches.length !== 1) return;
      
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      setIsSliding(false);
      setSlideDistance(0);
      slideDistanceRef.current = 0;
      hasMovedRef.current = false;
    };

    const handleTouchMove = (e) => {
      if (!startXRef.current || !startYRef.current) return;
      
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = startXRef.current - currentX;
      const diffY = Math.abs(currentY - startYRef.current);
      
      // If vertical movement is significant, allow scrolling and don't interfere
      if (diffY > 10 && diffY > Math.abs(diffX)) {
        return; // Let browser handle scrolling
      }
      
      // Only prevent default for horizontal swipes > 15px (swipe right to delete)
      if (diffX < -15 && Math.abs(diffX) > diffY) {
        hasMovedRef.current = true;
        e.preventDefault(); // Now works because listener is non-passive
        e.stopPropagation();
        
        // Only allow sliding to the right (swipe right)
        // Limit max slide to 120px
        const slideAmount = Math.min(Math.abs(diffX), 120);
        setSlideDistance(slideAmount);
        slideDistanceRef.current = slideAmount;
        setIsSliding(true);
      }
    };

    const handleTouchEnd = (e) => {
      if (hasMovedRef.current) {
        e.preventDefault(); // Now works because listener is non-passive
        e.stopPropagation();
        
        // If slid more than 80px to the right, delete the item
        if (slideDistanceRef.current > 80) {
          onRemove(item);
        } else {
          // Reset position
          setSlideDistance(0);
          slideDistanceRef.current = 0;
          setIsSliding(false);
        }
      }
      
      startXRef.current = 0;
      startYRef.current = 0;
      hasMovedRef.current = false;
    };

    // Add event listeners with { passive: false } to allow preventDefault
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Cleanup
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [item, onRemove]);

  // Check if can add more (for plus button)
  const currentQty = item.quantity;
  const newQty = currentQty + 1;
  const product = products.find(p => p._id === item._id) || item;
  
  // Use combo validation for combo items
  let canAddMore = false;
  if (item.isCombo || product.isCombo) {
    const comboOffer = item.products ? item : comboOffers?.find(c => c._id === item._id);
    if (comboOffer) {
      const comboValidation = validateComboStockAvailability(
        comboOffer,
        newQty,
        items, // cart items
        products, // all products
        { silent: true, excludeComboId: item._id }
      );
      canAddMore = comboValidation.valid;
    }
  } else {
    canAddMore = validateStockAvailability(product, newQty, { silent: true }).valid;
  }

  return (
    <div className="cart-item-wrapper">
      {/* Delete indicator shown when sliding */}
      <div 
        className="cart-delete-indicator"
        style={{
          opacity: slideDistance > 20 ? Math.min(slideDistance / 120, 1) : 0
        }}
      >
        <svg className="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
        </svg>
        <span className="delete-text">Delete</span>
      </div>

      <div 
        ref={itemRef}
        className={`cart-item ${isSliding ? 'sliding' : ''}`}
        style={{
          transform: `translateX(${slideDistance}px)`,
          transition: isSliding ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        <div className="cart-item-image-container">
          <img 
            src={getImageSrc(item.image || '/placeholder-product.png')} 
            alt={item.name}
            className="cart-item-image"
            loading="eager"
            onError={(e) => {
              e.target.src = '/placeholder-product.png';
            }}
          />
          {hasDiscount && (
            <div className="discount-badge">{item.discountPercentage || item.pricing?.discountPercentage || 0}% OFF</div>
          )}
        </div>
        
        <div className="cart-item-details">
          <h3 className="cart-item-name">{item.name}</h3>
          <div className="cart-item-price-container">
            {hasDiscount ? (
              <>
                <p className="cart-item-price">₹{pricePerUnit.toFixed(2)}</p>
                <p className="cart-item-original-price">₹{itemPrice.toFixed(2)}</p>
              </>
            ) : (
              <p className="cart-item-price">₹{itemPrice.toFixed(2)}</p>
            )}
          </div>
        </div>

        <div className="cart-item-actions">
          <div className="product-actions">
            <button 
              className="quantity-btn minus"
              onClick={() => {
                if (item.quantity > 1) {
                  updateQuantity(item._id, item.quantity - 1);
                } else {
                  onRemove(item);
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            
            <span className="quantity-display">{item.quantity}</span>
            
            <button 
              className={`quantity-btn plus ${!canAddMore ? 'disabled' : ''}`}
              onClick={() => {
                // Use combo validation for combo items
                if (item.isCombo || product.isCombo) {
                  const comboOffer = item.products ? item : comboOffers?.find(c => c._id === item._id);
                  if (comboOffer) {
                    const comboValidation = validateComboStockAvailability(
                      comboOffer,
                      newQty,
                      items, // cart items
                      products, // all products
                      { silent: true, excludeComboId: item._id }
                    );
                    if (!comboValidation.valid) {
                      return;
                    }
                  }
                } else {
                  const validation = validateStockAvailability(product, newQty, { silent: true });
                  if (!validation.valid) {
                    return;
                  }
                }
                updateQuantity(item._id, newQty);
              }}
              disabled={!canAddMore}
              title={!canAddMore ? 'Insufficient stock' : ''}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          
          <p className="cart-item-total">₹{lineItemTotals.finalTotal.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};


const CustomerCart = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { items, addItem, removeItem, updateQuantity, getTotalItems, clearCart } = useCart();
  
  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();
  const [qrName, setQrName] = useState(null);
  const [seat, setSeat] = useState(null);
  const [theaterId, setTheaterId] = useState(null);
  const [theaterName, setTheaterName] = useState(null);
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [comboOffers, setComboOffers] = useState([]); // Combo offers for validation

  // Scroll to top when cart page loads (after render)
  useEffect(() => {
    // Use setTimeout to ensure DOM is ready
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      // Also try scrolling the document element
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body) {
        document.body.scrollTop = 0;
      }
    };
    
    scrollToTop();
    // Also scroll after a small delay to handle async rendering
    const timeoutId = setTimeout(scrollToTop, 100);
    
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qr = params.get('qrname') || params.get('qrName') || params.get('QRNAME');
    const seatNum = params.get('seat');
    const id = params.get('theaterid');
    const name = params.get('theatername');
    const cat = params.get('category');
    if (qr) setQrName(qr);
    if (seatNum) setSeat(seatNum);
    if (id) setTheaterId(id);
    if (name) setTheaterName(name);
    if (cat) setCategory(cat);
  }, [location.search]);

  // Fetch products for stock validation
  useEffect(() => {
    if (theaterId) {
      const fetchProducts = async () => {
        try {
          const response = await unifiedFetch(
            `${config.api.baseUrl}/theater-products/${theaterId}?stockSource=cafe`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              mode: 'cors'
            },
            {
              cacheKey: `theater_products_${theaterId}_cafe`,
              cacheTTL: 300000 // 5 minutes
            }
          );

          if (response.ok) {
            const data = await response.json();
            let productsArray = [];
            if (data.success) {
              if (Array.isArray(data.data)) {
                productsArray = data.data;
              } else if (data.data && Array.isArray(data.data.products)) {
                productsArray = data.data.products;
              } else if (data.data && Array.isArray(data.data.data)) {
                productsArray = data.data.data;
              } else if (Array.isArray(data.products)) {
                productsArray = data.products;
              }
            }

            // Process products to include stock data
            const processedProducts = productsArray.map(p => ({
              _id: p._id,
              name: p.name || p.productName,
              currentStock: p.currentStock,
              balanceStock: p.balanceStock,
              closingBalance: p.closingBalance,
              stockUnit: p.stockUnit,
              unit: p.unit,
              quantityUnit: p.quantityUnit,
              quantity: p.quantity,
              noQty: p.noQty,
              inventory: p.inventory,
              isActive: p.isActive,
              isAvailable: p.isAvailable
            }));

            setProducts(processedProducts);
          }
        } catch (error) {
          console.error('Error fetching products for cart validation:', error);
        }
      };

      fetchProducts();
    }
  }, [theaterId]);

  // Fetch combo offers for validation
  useEffect(() => {
    if (theaterId) {
      const fetchComboOffers = async () => {
        try {
          const response = await unifiedFetch(`${config.api.baseUrl}/combo-offers/${theaterId}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              const offersList = Array.isArray(data.data) ? data.data : (data.data.comboOffers || []);
              setComboOffers(offersList.filter(combo => combo.isActive));
            }
          }
        } catch (error) {
          console.error('Error fetching combo offers:', error);
        }
      };

      fetchComboOffers();
    }
  }, [theaterId]);

  // Stock validation hook
  const { validateStockAvailability } = useStockValidation(items, products);

  // ✅ REAL-TIME VALIDATION: Continuously check QR status while user is on the cart page
  // This ensures immediate redirect if QR is turned OFF while customer is using the page
  useEffect(() => {
    if (!qrName || !theaterId) {
      // Only poll if QR name and theater ID exist
      return;
    }


    // Check QR status every 5 seconds
    const checkInterval = setInterval(async () => {
      try {
        const encodedQrName = encodeURIComponent(qrName);
        const apiUrl = `${config.api.baseUrl}/single-qrcodes/verify-qr/${encodedQrName}?theaterId=${theaterId}&_t=${Date.now()}`;

        const response = await unifiedFetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          forceRefresh: true, // Always get latest status
          cacheTTL: 0
        });

        // Check status code
        const status = response?.status;
        if (status === 403) {
          console.warn('🚨 [CustomerCart Real-time] QR code was turned OFF - redirecting immediately');
          const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
          navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
          return;
        }

        // Parse response if available
        if (response && typeof response.json === 'function') {
          const data = await response.json();
          
          // Check if QR became inactive
          if (data.isActive === false || data.isActive === 'false' || data.isActive === 0) {
            console.warn('🚨 [CustomerCart Real-time] QR code is now inactive - redirecting immediately');
            const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
            navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
            return;
          }
        }
      } catch (error) {
        // Handle errors silently - don't interrupt user experience for network errors
        // But redirect if it's a 403 error (QR is inactive)
        if (error.status === 403 || error.message?.includes('403')) {
          console.warn('🚨 [CustomerCart Real-time] QR code is inactive (403) - redirecting immediately');
          const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
          navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
          return;
        }
        // For other errors, just log and continue (don't interrupt user)
      }
    }, 5000); // Check every 5 seconds

    // Cleanup interval on unmount or when dependencies change
    return () => {
      clearInterval(checkInterval);
    };
  }, [qrName, theaterId, navigate]);

  // Calculate totals using centralized utility
  // ✅ FIX: Map cart items to ensure consistent price field handling (especially for combo offers)
  const { subtotal, tax, cgst, sgst, total, totalDiscount } = useMemo(() => {
    // Map cart items to match the expected format for the utility
    const orderItems = items.map(item => {
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
    
    return calculateOrderTotals(orderItems);
  }, [items]);

  // Determine GST types for display label
  const gstTypes = useMemo(() => {
    const types = items.map(item => item.gstType || item.pricing?.gstType || 'EXCLUDE');
    return [...new Set(types)]; // Unique types
  }, [items]);

  // Determine display label for GST based on mixed types
  const gstDisplayLabel = gstTypes.length > 1 
    ? "Tax (GST) - Mixed" 
    : gstTypes.includes('INCLUDE') 
      ? "Tax (GST) - Included" 
      : "Tax (GST) - Excluded";

  const handleCheckout = () => {
    // Navigate to phone entry to start checkout flow
    if (items.length === 0) {
      alert('Your cart is empty');
      return;
    }
    
    // Check if customer is already logged in
    const customerPhone = localStorage.getItem('customerPhone');
    
    // Store cart data and navigation info for checkout flow
    const checkoutInfo = {
      theaterId,
      theaterName,
      qrName,
      seat,
      cartItems: items,
      totals: { subtotal, tax, total, totalDiscount }
    };
    
    localStorage.setItem('checkoutData', JSON.stringify(checkoutInfo));
    
    // ✅ FIX: If already logged in, go directly to payment gateway (not payment selection page)
    // Navigate to OTP verification with skipOtpVerification flag to trigger payment gateway directly
    if (customerPhone) {
      navigate('/customer/otp-verification', {
        state: {
          phoneNumber: customerPhone,
          verified: true,
          otpLength: 4,
          expiresIn: 300,
          checkoutData: checkoutInfo,
          fromLogin: false,
          returnUrl: null,
          skipOtpVerification: true  // ✅ Skip OTP input and go straight to payment gateway
        }
      });
    } else {
      navigate('/customer/phone-entry');
    }
  };

  const handleBackToMenu = () => {
    const params = new URLSearchParams({
      ...(theaterId && { theaterid: theaterId }),
      ...(qrName && { qrname: qrName }),
      ...(seat && { seat: seat }),
      ...(category && { category: category })
    });
    navigate(`/customer/home?${params.toString()}`);
  };

  if (items.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-header">
          <button className="back-button" onClick={handleBackToMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 className="cart-title">Your Cart</h1>
          <div className="cart-header-spacer"></div>
        </div>

        {/* Theater & QR Info */}
        {(theaterName || qrName || seat) && (
          <div className="cart-info-section">
            {theaterName && (
              <div className="cart-info-item">
                <span className="info-icon">🎭</span>
                <span className="info-text">{theaterName}</span>
              </div>
            )}
            {qrName && (
              <div className="cart-info-item">
                <span className="info-icon">📱</span>
                <span className="info-text">{qrName}</span>
              </div>
            )}
            {seat && (
              <div className="cart-info-item">
                <span className="info-icon">💺</span>
                <span className="info-text">Seat {seat}</span>
              </div>
            )}
          </div>
        )}

        <div className="empty-cart">
          <div className="empty-cart-icon">🛒</div>
          <h2 className="empty-cart-title">Your cart is empty</h2>
          <p className="empty-cart-text">Add some delicious items to get started</p>
          <button className="continue-shopping-btn" onClick={handleBackToMenu}>
            <span>Browse Menu</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      {/* Header */}
      <div className="cart-header">
        <button className="back-button" onClick={handleBackToMenu}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="cart-title">Your Cart</h1>
        <button className="clear-cart-button" onClick={clearCart}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Theater & QR Info */}
      {(qrName || seat) && (
        <div className="cart-info-section">
          {qrName && (
            <div className="cart-info-item">
              <span className="info-icon">📱</span>
              <span className="info-text">{qrName}</span>
            </div>
          )}
          {seat && (
            <div className="cart-info-item">
              <span className="info-icon">💺</span>
              <span className="info-text">Seat {seat}</span>
            </div>
          )}
        </div>
      )}

      {/* Cart Items */}
      <div className="cart-items-container">
        <div className="cart-items-header">
          <h2 className="items-count">{getTotalItems()} {getTotalItems() === 1 ? 'Item' : 'Items'}</h2>
        </div>

        <div className="cart-items-list">
          {items.map((item, index) => {
            // ✅ Use global orderCalculation utility for line item totals
            const itemPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
            const discountPercentage = parseFloat(item.discountPercentage || item.pricing?.discountPercentage) || 0;
            const hasDiscount = discountPercentage > 0;
            
            // Prepare item data for calculation utility
            const itemForCalculation = {
              ...item,
              sellingPrice: itemPrice,
              quantity: item.quantity,
              taxRate: parseFloat(item.taxRate || item.pricing?.taxRate || item.gstPercentage) || 0,
              gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
              discountPercentage: discountPercentage,
              pricing: item.pricing
            };
            
            // Calculate line item totals using utility
            const lineItemTotals = calculateLineItemTotal(itemForCalculation);
            
            // For display: show discounted price per unit
            // For GST INCLUDE: price already includes tax, so show discounted price
            // For GST EXCLUDE: price doesn't include tax, so show discounted base price
            const gstType = itemForCalculation.gstType.toUpperCase();
            let pricePerUnit;
            
            if (hasDiscount) {
              if (gstType === 'INCLUDE') {
                // GST INCLUDE: finalTotal includes tax, so divide by quantity
                pricePerUnit = lineItemTotals.finalTotal / item.quantity;
              } else {
                // GST EXCLUDE: basePrice is after discount, before tax
                pricePerUnit = lineItemTotals.basePrice / item.quantity;
              }
            } else {
              // No discount: show original price
              pricePerUnit = itemPrice;
            }
            
            return (
              <CartItemWrapper
                key={item._id || index}
                item={item}
                onRemove={removeItem}
                itemPrice={itemPrice}
                pricePerUnit={pricePerUnit}
                hasDiscount={hasDiscount}
                lineItemTotals={lineItemTotals}
                products={products}
                comboOffers={comboOffers}
                items={items}
                validateStockAvailability={validateStockAvailability}
                updateQuantity={updateQuantity}
              />
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

        <button className="checkout-button" onClick={handleCheckout}>
          <span className="checkout-text">Proceed to Checkout</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default CustomerCart;
