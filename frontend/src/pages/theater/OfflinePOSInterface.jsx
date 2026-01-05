/**
 * Offline POS Interface
 * Identical to TheaterOrderInterface but with offline capabilities
 * - Works without internet connection
 * - Caches products/categories locally
 * - Queues orders offline
 * - Auto-syncs every 1 second when connection restored
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import OfflineStatusBadge from '@components/OfflineStatusBadge';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { useOfflineQueue } from '@hooks/useOfflineQueue';
import { getAuthToken, autoLogin } from '@utils/authHelper';
import { calculateOrderTotals } from '@utils/orderCalculation'; // 📊 Centralized calculation
import {
  cacheProducts,
  getCachedProducts,
  cacheCategories,
  getCachedCategories,
  cacheProductImages,
  getCachedImage
} from '@utils/offlineStorage';
import { clearCache, clearCachePattern } from '@utils/cacheUtils';
import { getImageSrc, cacheProductImages as cacheProductImagesGlobal } from '@utils/globalImageCache'; // 🚀 Instant image loading
import ImageUpload from '@components/ImageUpload';
import config from '@config';
import '@styles/TheaterList.css';
import '@styles/Dashboard.css';
import '@styles/ImageUpload.css';
import '@styles/TheaterOrderInterface.css';
import '@styles/TheaterGlobalModals.css'; // Global modal styles
import '@styles/pages/theater/OfflinePOSInterface.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { calculateConsumption, getAvailableStock, isProductOutOfStock } from '@utils/stockCalculation';
import { validateComboStockAvailability as validateComboStockAvailabilityShared } from '@utils/comboStockValidation';

// ✅ Extract unit from quantity string (e.g., "150 ML" → "ML")
const extractUnitFromQuantity = (quantity) => {
  if (!quantity) return null;

  const quantityStr = String(quantity).trim();
  if (!quantityStr) return null;

  // Convert to lowercase for easier matching
  const quantityLower = quantityStr.toLowerCase();

  // Check for units at the end (order matters: check longer units first)
  if (quantityLower.endsWith('ml') || quantityLower.endsWith(' ml')) {
    return 'ML';
  }
  if (quantityLower.endsWith('kg') || quantityLower.endsWith(' kg')) {
    return 'kg';
  }
  if ((quantityLower.endsWith('g') || quantityLower.endsWith(' g')) && !quantityLower.endsWith('kg')) {
    return 'g';
  }
  if (quantityLower.endsWith('l') || quantityLower.endsWith(' l')) {
    return 'L';
  }
  if (quantityLower.endsWith('nos') || quantityLower.endsWith(' nos') || quantityLower.endsWith('no')) {
    return 'Nos';
  }

  // Fallback: Try regex matching
  const unitRegex = /(?:\s+)?(ML|ml|kg|Kg|KG|g|G|L|l|Nos|nos|NOS)(?:\s*)$/i;
  const match = quantityStr.match(unitRegex);
  if (match && match[1]) {
    const matchedUnit = match[1].toLowerCase();
    if (matchedUnit === 'ml') return 'ML';
    if (matchedUnit === 'kg') return 'kg';
    if (matchedUnit === 'g') return 'g';
    if (matchedUnit === 'l') return 'L';
    if (matchedUnit === 'nos') return 'Nos';
    return match[1];
  }

  return null;
};

// ✅ Unit detection utilities
const getProductUnitBase = (product) => {
  if (!product) return null;

  if (product.unit) return product.unit;
  if (product.inventory?.unit) {
    const unit = String(product.inventory.unit).trim();
    if (unit) return unit;
  }
  if (product.quantityUnit) {
    const unit = String(product.quantityUnit).trim();
    if (unit) return unit;
  }
  if (product.quantity) {
    const extractedUnit = extractUnitFromQuantity(product.quantity);
    if (extractedUnit) return extractedUnit;
  }
  if (product.unitOfMeasure) {
    const unit = String(product.unitOfMeasure).trim();
    if (unit) return unit;
  }

  return null;
};

// ✅ Get standardized unit for display
const getStandardizedUnit = (productUnit) => {
  if (!productUnit) return null;

  const unit = String(productUnit).trim();
  const unitLower = unit.toLowerCase();

  if (unitLower === 'l' || unitLower === 'liter' || unitLower === 'liters') {
    return 'L';
  }
  if (unitLower === 'kg' || unitLower === 'ml' || unitLower === 'g') {
    return 'kg';
  }
  if (unitLower === 'nos' || unitLower === 'no' || unitLower === 'piece' || unitLower === 'pieces') {
    return 'Nos';
  }

  return unit;
};

// Modern POS Product Card Component - Click to Add
const StaffProductCard = React.memo(({ product, onAddToCart, currentOrder, onViewComboProducts, isComboOutOfStock }) => {
  const formatPrice = (price) => {
    if (price === 0) {
      return '';
    }
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
    // Remove .00 if price is a whole number
    return formatted.replace(/\.00$/, '');
  };

  const getQuantityInCart = () => {
    const orderItem = currentOrder.find(item => item._id === product._id);
    return orderItem ? orderItem.quantity : 0;
  };

  const quantityInCart = getQuantityInCart();

  const handleCardClick = () => {
    if (!isOutOfStock) {
      onAddToCart(product, quantityInCart + 1);
    }
  };

  const handleComboIconClick = (e) => {
    e.stopPropagation(); // Prevent card click
    if (onViewComboProducts && product.isCombo) {
      onViewComboProducts(product);
    }
  };

  // ✅ FIX: Use ONLY balanceStock from cafe-stock API (cafe stock) - DO NOT fallback to theater stock
  // When stockSource='cafe' is passed, backend returns balanceStock from CafeMonthlyStock
  // If cafe stock is not available, show 0 (not theater stock)
  const currentStock = product.balanceStock ?? product.closingBalance ?? 0;

  // ✅ REAL-TIME STOCK: Calculate consumption from cart items
  const cartConsumption = useMemo(() => {
    if (quantityInCart === 0) return 0;

    // Get target unit (stock unit)
    const stockUnit = product.stockUnit ||
      getProductUnitBase(product) ||
      'Nos';

    // Calculate consumption for this product's quantity in cart
    return calculateConsumption(product, quantityInCart, stockUnit);
  }, [product, quantityInCart]);

  // Get stock unit for validation
  const stockUnit = useMemo(() => {
    return product.stockUnit || getProductUnitBase(product) || 'Nos';
  }, [product]);

  // Available stock = current stock - cart consumption
  const availableStock = getAvailableStock(currentStock, cartConsumption);

  // ✅ FIX: Check if available stock is enough for at least 1 unit of the product
  // Example: Product requires 150ML, but only 100ML in stock = OUT OF STOCK
  // For combo offers, use the passed validation function; for regular products, use standard validation
  const isOutOfStock = product.isCombo
    ? (isComboOutOfStock ? isComboOutOfStock(product) : false)
    : isProductOutOfStock(availableStock, product, stockUnit);

  // ✅ Get display unit
  const displayUnit = useMemo(() => {
    // 1. Check stockUnit from backend
    if (product.stockUnit && String(product.stockUnit).trim() !== '') {
      return getStandardizedUnit(String(product.stockUnit).trim());
    }
    // 2. Check product definition
    const productUnitValue = getProductUnitBase(product);
    if (productUnitValue) {
      const standardized = getStandardizedUnit(productUnitValue);
      if (standardized) return standardized;
    }
    // 3. Default
    return 'Nos';
  }, [product.stockUnit, product.unit, product.inventory, product.quantityUnit, product.quantity, product.unitOfMeasure]);

  // ✅ Format stock value based on unit
  const formatStockValue = (val, unit) => {
    const num = parseFloat(val) || 0;
    if (unit === 'Nos') return Math.floor(num);
    // For Kg/L, show up to 3 decimals if needed settings
    // User requested "14.250Kg", so we keep precision for decimals
    if (Number.isInteger(num)) return num;
    return num.toFixed(3).replace(/\.?0+$/, ''); // Remove trailing zeros for clean display, or keep .toFixed(3) if strict
  };

  const originalPrice = product.pricing?.basePrice ?? product.sellingPrice ?? 0;
  const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
  const productPrice = discountPercentage > 0
    ? originalPrice * (1 - discountPercentage / 100)
    : originalPrice;
  const hasDiscount = discountPercentage > 0;

  const getProductImage = () => {
    let imageUrlRaw = null;

    // ✅ FIX: Check all possible image fields returned by backend (comprehensive extraction)
    // STEP 1: Check imageData field (normalized first image from backend)
    if (product.imageData) {
      imageUrlRaw = typeof product.imageData === 'string'
        ? product.imageData
        : (product.imageData.url || product.imageData.path || product.imageData.src || product.imageData);
    }
    // STEP 2: Check images array (backend normalizes this)
    else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      if (typeof firstImage === 'string') {
        imageUrlRaw = firstImage;
      } else if (firstImage && typeof firstImage === 'object') {
        imageUrlRaw = firstImage.url || firstImage.path || firstImage.src || firstImage;
      }
    }
    // STEP 3: Check other possible fields (fallback for compatibility)
    else {
      imageUrlRaw =
        product.image ||                      // image field
        product.imageUrl ||                   // imageUrl field
        (typeof product.productImage === 'string' ? product.productImage : null) || // productImage string
        product.productImage?.url ||          // productImage object with url
        product.productImage?.path ||         // productImage object with path
        null;
    }

    if (!imageUrlRaw) {
      return null;
    }

    // Process image URL - ensure it's a full URL
    let fullImageUrl = String(imageUrlRaw).trim();

    // Skip if empty
    if (!fullImageUrl) {
      return null;
    }

    // If it's already a full URL (http/https) or data URL, use it as is
    if (fullImageUrl.startsWith('http://') || fullImageUrl.startsWith('https://') || fullImageUrl.startsWith('data:')) {
      // Use getImageSrc which checks cache first, then returns original URL if not cached
      return getImageSrc(fullImageUrl);
    }

    // If it's a relative path, prepend base URL
    if (fullImageUrl.startsWith('/')) {
      const baseUrl = config.api.baseUrl.endsWith('/')
        ? config.api.baseUrl.slice(0, -1)
        : config.api.baseUrl;
      fullImageUrl = `${baseUrl}${fullImageUrl}`;
    }
    // If it doesn't start with /, it might be a relative path without leading slash
    else {
      const baseUrl = config.api.baseUrl.endsWith('/')
        ? config.api.baseUrl
        : `${config.api.baseUrl}/`;
      fullImageUrl = `${baseUrl}${fullImageUrl}`;
    }

    // Use getImageSrc which checks cache first, then returns original URL if not cached
    return getImageSrc(fullImageUrl);
  };

  const imageUrl = getProductImage();

  return (
    <div className="modern-product-card-wrapper">
      <div
        className={`modern-product-card ${isOutOfStock ? 'out-of-stock' : ''}`}
        onClick={handleCardClick}
      >
        {/* Product Image */}
        <div className="modern-product-image">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name || 'Product'}
              loading="eager"
              decoding="async"
              className="product-image-auto"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : (
            <div className="modern-product-placeholder">
              <span className="placeholder-icon">🍽️</span>
            </div>
          )}
          <div className={`modern-product-placeholder ${imageUrl ? 'modern-product-placeholder-hidden' : ''}`}>
            <span className="placeholder-icon">🍽️</span>
          </div>
        </div>

        {/* Product Info Overlay */}
        <div className="modern-product-overlay">
          <div className="modern-product-details">
            <div className="modern-product-detail-item">
              {hasDiscount ? (
                <div className="price-with-discount">
                  <span className="detail-value original-price">{formatPrice(originalPrice)}</span>
                  <span className="detail-value discounted-price">{formatPrice(productPrice)}</span>
                </div>
              ) : (
                <span className="detail-value">{formatPrice(productPrice)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Discount Badge - Top Right */}
        {hasDiscount && !isOutOfStock && (
          <div className="modern-discount-badge">
            {discountPercentage}% OFF
          </div>
        )}

        {/* Combo Products Icon - Top Right */}
        {product.isCombo && product.products && product.products.length > 0 && (
          <button
            className="combo-products-icon-btn"
            onClick={handleComboIconClick}
            title="View combo products"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
        )}

        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="modern-out-of-stock-overlay">
            <span className="out-of-stock-text">OUT OF STOCK</span>
          </div>
        )}

        {/* Quantity Badge */}
        {quantityInCart > 0 && !isOutOfStock && (
          <div className="modern-quantity-badge">
            {quantityInCart}
          </div>
        )}
      </div>

      {/* Product Name - Outside Card */}
      <div className="modern-product-name-section">
        <h3 className="modern-product-name">
          {product.name || 'Unknown Product'}
          {(product.quantity || product.sizeLabel) && (
            <span className="modern-product-size"> {product.quantity || product.sizeLabel}</span>
          )}
        </h3>
        {/* Stock Quantity Display - Shows available stock (current - cart) */}
        {/* ✅ Hide stock display for combo offers */}
        {!product.isCombo && currentStock > 0 && (
          <div className="modern-product-stock">
            {cartConsumption > 0 ? (
              <>
                <span style={{ textDecoration: 'line-through', opacity: 0.6, marginRight: '8px' }}>
                  {formatStockValue(currentStock, displayUnit)} {displayUnit}
                </span>
                <span style={{ color: availableStock <= 0 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                  {formatStockValue(availableStock, displayUnit)} {displayUnit}
                </span>
              </>
            ) : (
              <span>Stock: {formatStockValue(currentStock, displayUnit)} {displayUnit}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

StaffProductCard.displayName = 'StaffProductCard';

// Staff Order Item Component - Professional order management
const StaffOrderItem = React.memo(({ item, onUpdateQuantity, onRemove }) => {
  const formatPrice = (price) => {
    // Don't show any price in demo mode (when price is 0)
    if (price === 0) {
      return '';
    }
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
    // Remove .00 if price is a whole number
    return formatted.replace(/\.00$/, '');
  };

  const sellingPrice = parseFloat(item.sellingPrice) || 0;
  const quantity = parseInt(item.quantity) || 0;
  const itemTotal = sellingPrice * quantity;

  return (
    <div className="pos-order-item">
      <div className="pos-item-content">
        <div className="pos-item-name">{item.name || 'Unknown Item'}</div>
        <div className="pos-item-price">₹{sellingPrice % 1 === 0 ? sellingPrice : sellingPrice.toFixed(2).replace(/\.00$/, '')}</div>

        <div className="pos-quantity-controls">
          <button
            className="pos-qty-btn pos-qty-minus"
            onClick={() => onUpdateQuantity(item._id, Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            −
          </button>
          <span className="pos-qty-display">{quantity}</span>
          <button
            className="pos-qty-btn pos-qty-plus"
            onClick={() => onUpdateQuantity(item._id, quantity + 1)}
            disabled={item.maxReached}
            style={item.maxReached ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            +
          </button>
        </div>

        <div className="pos-item-total">₹{itemTotal % 1 === 0 ? itemTotal : itemTotal.toFixed(2).replace(/\.00$/, '')}</div>
        <button
          className="pos-remove-btn"
          onClick={() => onRemove(item._id)}
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
});

StaffOrderItem.displayName = 'StaffOrderItem';

// Main Offline POS Interface
const OfflinePOSInterface = () => {
  const { theaterId: routeTheaterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const urlMatch = window.location.pathname.match(/\/offline-pos\/([^/]+)/);
  const theaterId = routeTheaterId || (urlMatch ? urlMatch[1] : null);

  // ✅ FIX: Set body class immediately on render (synchronous) to ensure styles apply
  // Also inject a style tag to override ViewCart.css immediately
  if (typeof document !== 'undefined') {
    document.body.classList.add('offline-pos-page');
    document.body.classList.remove('view-cart-page', 'view-cart-active', 'cart-page', 'view-cart');
    
    // ✅ FIX: Inject style tag immediately to override ViewCart.css
    const styleId = 'offline-pos-override-styles';
    let overrideStyle = document.getElementById(styleId);
    if (!overrideStyle) {
      overrideStyle = document.createElement('style');
      overrideStyle.id = styleId;
      document.head.appendChild(overrideStyle);
    }
    overrideStyle.textContent = `
      /* ✅ FIX: Override ViewCart.css and TheaterOrderInterface.css - ensure POS layout is correct */
      body.offline-pos-page .professional-pos-content .pos-main-container,
      body.offline-pos-page .offline-pos-content .pos-main-container {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
        height: calc(100vh - 80px) !important;
        max-height: calc(100vh - 80px) !important;
        gap: 0 !important;
        overflow: hidden !important;
        background: #f8f9fa !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      body.offline-pos-page .professional-pos-content .pos-menu-section,
      body.offline-pos-page .offline-pos-content .pos-menu-section {
        flex: 2 0 auto !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        background: white !important;
        margin: 10px !important;
        border-radius: 15px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
        padding: 0 !important;
      }
      body.offline-pos-page .professional-pos-content .pos-order-section,
      body.offline-pos-page .offline-pos-content .pos-order-section {
        flex: 0 0 400px !important;
        max-width: 400px !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        background: white !important;
        margin: 10px 10px 10px 0 !important;
        border-radius: 15px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
        padding: 0 !important;
      }
      /* ✅ FIX: Override any external CSS - Use 8-column layout (100px minmax) as default */
      body.offline-pos-page .professional-pos-content .pos-products-grid,
      body.offline-pos-page .offline-pos-content .pos-products-grid {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important;
        gap: 10px !important;
        padding: 16px !important;
        overflow-y: auto !important;
        max-height: calc(100vh - 200px) !important;
        min-height: 500px !important;
        flex: 1 !important;
      }
    `;
  }

  // Get auth token for offline queue
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    const getToken = async () => {
      let token = getAuthToken();
      if (!token) {
        token = await autoLogin();
      }
      setAuthToken(token);
    };
    getToken();
  }, []);

  // Initialize offline queue hook
  const {
    pendingCount,
    lastSyncTime,
    isSyncing,
    syncError,
    syncProgress,
    connectionStatus,
    addOrder: queueOrder,
    manualSync,
    retryFailed
  } = useOfflineQueue(theaterId, authToken);

  // ✅ FIX: Add body class to identify POS page and ensure styles override ViewCart
  // Run on mount AND on every navigation to ensure it's set when returning from View Cart
  useEffect(() => {
    // Always ensure we have the correct body class when on POS page
    if (location.pathname.includes('/offline-pos/')) {
      document.body.classList.add('offline-pos-page');
      document.body.classList.remove('view-cart-page', 'view-cart-active', 'cart-page', 'view-cart');
    }
    
    return () => {
      // Only remove if we're actually navigating away from POS
      if (!location.pathname.includes('/offline-pos/')) {
        document.body.classList.remove('offline-pos-page');
      }
    };
  }, [location.pathname, location.key]); // ✅ FIX: Run on every navigation

  // UI cleanup - Run on mount AND route re-entry to ensure clean state
  useEffect(() => {
    const cleanup = () => {
      const statsContainers = document.querySelectorAll('.qr-stats, .theater-stats, .product-stats, .stat-card');
      statsContainers.forEach(container => {
        if (container && container.parentNode) {
          container.style.display = 'none';
          container.remove();
        }
      });

      const floatingElements = document.querySelectorAll('[style*="position: fixed"], [style*="position: absolute"][style*="z-index"]');
      floatingElements.forEach(element => {
        if (element.className.includes('stat') || element.className.includes('count')) {
          element.style.display = 'none';
        }
      });
    };

    cleanup();
    setTimeout(cleanup, 100);

    return cleanup;
  }, [location.key]); // ✅ FIX: Re-run on route re-entry (location.key changes on every navigation)

  // State
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryMapping, setCategoryMapping] = useState({});
  const [comboOffers, setComboOffers] = useState([]); // New state for combo offers
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remountKey, setRemountKey] = useState(0); // ✅ FIX: Force remount on navigation

  const [currentOrder, setCurrentOrder] = useState(() => {
    try {
      const savedCart = localStorage.getItem(`offline_pos_cart_${theaterId}`);
      if (savedCart) {
        const cartItems = JSON.parse(savedCart);
        return Array.isArray(cartItems) ? cartItems : [];
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }
    return [];
  });

  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderImages, setOrderImages] = useState([]);
  const [showComboProductsModal, setShowComboProductsModal] = useState(false);
  const [selectedComboOffer, setSelectedComboOffer] = useState(null);
  const isMountedRef = useRef(true);
  const prevLocationKeyRef = useRef(location.key); // Track previous location key

  usePerformanceMonitoring('OfflinePOSInterface');

  // ✅ FIX: Force remount on navigation to ensure clean UI state
  useEffect(() => {
    // Check if we've navigated (location.key changed)
    const hasNavigated = prevLocationKeyRef.current !== location.key;
    prevLocationKeyRef.current = location.key;

    // If we've navigated to this route, increment remount key to force React to recreate the DOM
    if (hasNavigated && location.pathname.includes('/offline-pos/')) {
      // Reset UI state immediately
      setSelectedCategory('all');
      setSearchTerm('');
      
      // Force remount by changing key
      setRemountKey(prev => prev + 1);
      
      // ✅ FIX: Ensure body class is set immediately when returning from View Cart
      document.body.classList.add('offline-pos-page');
      document.body.classList.remove('view-cart-page', 'view-cart-active', 'cart-page', 'view-cart', 'kiosk-page');
      
      // Force complete DOM recalculation and layout reset
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Get all POS containers
          const containers = [
            document.querySelector('.professional-pos-content'),
            document.querySelector('.pos-main-container'),
            document.querySelector('.pos-menu-section'),
            document.querySelector('.pos-order-section'),
            document.querySelector('.pos-products-grid'),
            document.querySelector('.pos-category-tabs')
          ];
          
          containers.forEach(container => {
            if (container) {
              // Force reflow by toggling display
              const originalDisplay = window.getComputedStyle(container).display;
              container.style.display = 'none';
              // Force reflow
              void container.offsetHeight;
              container.style.display = originalDisplay || '';
              
              // Remove any inline styles that might interfere
              container.style.transform = '';
              container.style.opacity = '';
              container.style.visibility = '';
            }
          });
          
          // Also reset any View Cart specific elements that might be lingering
          const viewCartElements = document.querySelectorAll('.view-cart-container, .cart-content, .cart-items-section');
          viewCartElements.forEach(el => {
            if (el && el.parentNode) {
              el.style.display = 'none';
            }
          });
        });
      });
    }
  }, [location.key, location.pathname]);

  // Cleanup - Run on mount AND route re-entry to reset body styles
  useEffect(() => {
    const existingOverlays = document.querySelectorAll('.qr-stats, .theater-stats, .product-stats');
    existingOverlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });

    document.body.style.position = '';
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open', 'no-scroll');

    return () => {
      isMountedRef.current = false;
    };
  }, [location.key]); // ✅ FIX: Re-run on route re-entry (location.key changes on every navigation)

  // Save cart to localStorage
  useEffect(() => {
    if (theaterId && currentOrder.length >= 0) {
      try {
        localStorage.setItem(`offline_pos_cart_${theaterId}`, JSON.stringify(currentOrder));
      } catch (error) {
        console.error('Error saving cart:', error);
      }
    }
  }, [currentOrder, theaterId]);

  // Restore cart from navigation state AND reset UI state when returning from View Cart
  useEffect(() => {
    if (location.state) {
      if (location.state.orderSuccess) {
        setCurrentOrder([]);
        setCustomerName('');
        setOrderNotes('');
        setOrderImages([]);
        setLoading(true);
        setTimeout(() => setLoading(false), 100);
      }
      else if (location.state.cartItems) {
        // Coming back from View Cart - restore cart AND reset UI state
        setCurrentOrder(location.state.cartItems || []);
        setCustomerName(location.state.customerName || '');
        
        // ✅ FIX: Reset UI state to ensure clean layout
        setSelectedCategory('all');
        setSearchTerm('');
        
        // ✅ FIX: Force layout recalculation after state updates
        requestAnimationFrame(() => {
          // Trigger a reflow to ensure layout is recalculated
          const container = document.querySelector('.professional-pos-content');
          if (container) {
            container.style.display = 'none';
            // Force reflow
            void container.offsetHeight;
            container.style.display = '';
          }
          
          // Also force recalculation of main container
          const mainContainer = document.querySelector('.pos-main-container');
          if (mainContainer) {
            mainContainer.style.display = 'none';
            void mainContainer.offsetHeight;
            mainContainer.style.display = '';
          }
        });
      }

      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location.state, location.key]); // ✅ FIX: Also depend on location.key to detect navigation

  // Helper: Validate stock availability
  const validateStockAvailability = useCallback((productId, currentQty, incrementQty = 0, silent = false) => {
    // Find product in latest product list (to get fresh stock info)
    const product = products.find(p => p._id === productId);
    // If not found in product list, try finding in currentOrder (though stock might be stale)
    const productData = product || currentOrder.find(item => item._id === productId);

    if (!productData) return true; // Can't validate, assume ok

    const currentStock = productData.balanceStock ?? productData.closingBalance ?? 0;
    const stockUnit = productData.stockUnit || getProductUnitBase(productData) || 'Nos';

    // New total quantity desired
    const newTotalQty = currentQty + incrementQty;

    // Calculate required stock for the NEW total quantity
    const neededStock = calculateConsumption(productData, newTotalQty, stockUnit);

    // Check if available stock is sufficient
    // We compare neededStock (for TOTAL cart quantity) against TOTAL current stock
    if (neededStock > currentStock) {
      // Silent mode used for UI checks (disabling buttons), non-silent for actions
      if (!silent) {
        // User explicitly requested to remove notification
        // const displayUnit = getStandardizedUnit(stockUnit);
        // alert(`Out of Stock! Available: ${currentStock.toFixed(3)} ${displayUnit}, Required: ${neededStock.toFixed(3)} ${displayUnit}`);
      }
      return false;
    }
    return true;
  }, [products, currentOrder]);

  // ✅ Helper: Validate stock availability for combo offers
  const validateComboStockAvailability = useCallback((comboOffer, comboQuantity = 1, silent = false) => {
    if (!comboOffer || !comboOffer.products || !Array.isArray(comboOffer.products) || comboOffer.products.length === 0) {
      return { valid: false, message: 'Combo offer has no products' };
    }

    // Calculate total cart consumption for each product in the combo
    const cartConsumptionMap = new Map();
    currentOrder.forEach(item => {
      // For combo items, we need to calculate consumption from combo products
      if (item.isCombo && item.products) {
        item.products.forEach(comboProduct => {
          const productId = comboProduct.productId?.toString() || comboProduct._id?.toString();
          if (productId) {
            const existingProduct = products.find(p => {
              const pId = p._id?.toString();
              return pId === productId;
            });
            if (existingProduct) {
              const productQtyInCombo = Number(comboProduct.quantity) || 1;
              const actualQtyNeeded = (item.quantity || 1) * productQtyInCombo;
              const stockUnit = existingProduct.stockUnit || getProductUnitBase(existingProduct) || 'Nos';
              const consumption = calculateConsumption(existingProduct, actualQtyNeeded, stockUnit);
              cartConsumptionMap.set(productId, (cartConsumptionMap.get(productId) || 0) + consumption);
            }
          }
        });
      } else if (!item.isCombo) {
        // Regular product
        const productId = item._id?.toString();
        if (productId) {
          const stockUnit = item.stockUnit || getProductUnitBase(item) || 'Nos';
          const consumption = calculateConsumption(item, item.quantity || 1, stockUnit);
          cartConsumptionMap.set(productId, (cartConsumptionMap.get(productId) || 0) + consumption);
        }
      }
    });

    // Check each product in the combo
    for (const comboProduct of comboOffer.products) {
      const productId = comboProduct.productId?.toString() || comboProduct._id?.toString();
      if (!productId) continue;

      // Find the full product details
      const fullProduct = products.find(p => {
        const pId = p._id?.toString();
        return pId === productId;
      });

      if (!fullProduct) {
        if (!silent) {
          console.warn(`Product ${comboProduct.productName || productId} in combo not found in products list`);
        }
        return { valid: false, message: `Product ${comboProduct.productName || productId} not found` };
      }

      // Get current stock
      const currentStock = fullProduct.balanceStock ?? fullProduct.closingBalance ?? 0;
      const stockUnit = fullProduct.stockUnit || getProductUnitBase(fullProduct) || 'Nos';

      // Get quantity of this product in the combo
      const productQuantityInCombo = Number(comboProduct.quantity) || Number(comboProduct.productQuantity) || 1;

      // Calculate total quantity needed: comboQuantity × productQuantityInCombo
      const totalQuantityNeeded = comboQuantity * productQuantityInCombo;

      // Calculate stock consumption for this product considering combo quantity
      const neededStock = calculateConsumption(fullProduct, totalQuantityNeeded, stockUnit);

      // Get cart consumption for this product (from other items in cart)
      const cartConsumption = cartConsumptionMap.get(productId) || 0;

      // Available stock = current stock - cart consumption
      const availableStock = Math.max(0, currentStock - cartConsumption);

      // Check if available stock is sufficient
      if (neededStock > availableStock) {
        if (!silent) {
          const displayUnit = getStandardizedUnit(stockUnit) || stockUnit;
          const formatStock = (val) => {
            const num = parseFloat(val) || 0;
            if (displayUnit === 'Nos') return Math.floor(num);
            if (Number.isInteger(num)) return num;
            return num.toFixed(3).replace(/\.?0+$/, '');
          };
          console.warn(`Insufficient stock for ${comboProduct.productName || fullProduct.name} in combo "${comboOffer.name}". Available: ${formatStock(availableStock)} ${displayUnit}, Required: ${formatStock(neededStock)} ${displayUnit} (${comboQuantity} combo × ${productQuantityInCombo} per combo)`);
        }
        return {
          valid: false,
          message: `Insufficient stock for ${comboProduct.productName || fullProduct.name}. Available: ${availableStock.toFixed(3)}, Required: ${neededStock.toFixed(3)}`,
          productName: comboProduct.productName || fullProduct.name,
          availableStock,
          neededStock
        };
      }
    }

    return { valid: true };
  }, [products, currentOrder]);

  // Order management functions
  const addToOrder = useCallback((product, quantity = 1) => {
    // ✅ Validate combo stock if it's a combo offer
    if (product.isCombo) {
      const existingItem = currentOrder.find(item => item._id === product._id);
      const currentQty = existingItem ? existingItem.quantity : 0;
      const newTotalQty = currentQty + 1; // Adding 1 more combo

      const comboValidation = validateComboStockAvailability(product, newTotalQty, false);
      if (!comboValidation.valid) {
        // Stock insufficient - don't add to cart
        return;
      }
    } else {
      // Validate the new total quantity for regular products (quantity passed here IS the target total quantity)
      if (!validateStockAvailability(product._id, quantity)) {
        return;
      }
    }

    setCurrentOrder(prevOrder => {
      const existingItem = prevOrder.find(item => item._id === product._id);

      if (quantity <= 0) {
        return prevOrder.filter(item => item._id !== product._id);
      }

      if (existingItem) {
        return prevOrder.map(item =>
          item._id === product._id
            ? { ...item, quantity: quantity }
            : item
        );
      } else {
        const originalPrice = product.pricing?.basePrice ?? product.sellingPrice ?? 0;
        const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;

        // Store ORIGINAL price in sellingPrice (discount will be calculated by utility)
        const sellingPrice = originalPrice;

        const taxRate = product.taxRate !== undefined ? parseFloat(product.taxRate) : (parseFloat(product.pricing?.taxRate) || 0);

        // Check pricing object first for gstType if not at top level
        // For combo offers, we mapped it to top level, so check top level first or fallback
        const gstTypeRaw = product.gstType || product.pricing?.gstType || 'EXCLUDE';
        // Handle both 'Inclusive' (from backend) and 'INCLUDE' (internal logic)
        // Also handle lowercase 'inclusive' just in case
        const isInclusive = gstTypeRaw.toString().toUpperCase().includes('INCLUDE') ||
          gstTypeRaw.toString().toUpperCase() === 'INCLUSIVE';

        const gstType = isInclusive ? 'INCLUDE' : 'EXCLUDE';

        // Preserve product size/variant before overwriting quantity with count
        const productSize = product.size || product.productSize || product.quantity || product.sizeLabel;

        return [...prevOrder, {
          ...product,
          quantity: quantity, // This is the count (1, 2, etc.)
          size: product.size || productSize, // Preserve the size/variant
          productSize: product.productSize || productSize, // Preserve the size/variant
          sizeLabel: product.sizeLabel || productSize, // Preserve the size/variant
          sellingPrice: sellingPrice,
          originalPrice: originalPrice,
          discountPercentage: discountPercentage,
          taxRate: taxRate,
          gstType: gstType,
          pricing: product.pricing // Keep pricing object for GST Type detection
        }];
      }
    });
  }, [validateStockAvailability, validateComboStockAvailability, currentOrder]);

  const updateQuantity = useCallback((productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromOrder(productId);
      return;
    }

    // Find the product in current order to check if it's a combo
    const orderItem = currentOrder.find(item => item._id === productId);

    if (orderItem && orderItem.isCombo) {
      // Validate combo stock
      const comboValidation = validateComboStockAvailability(orderItem, newQuantity, false);
      if (!comboValidation.valid) {
        return;
      }
    } else {
      // Validate the new total quantity for regular products
      if (!validateStockAvailability(productId, newQuantity)) {
        return;
      }
    }

    setCurrentOrder(prevOrder =>
      prevOrder.map(item =>
        item._id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  }, [validateStockAvailability, validateComboStockAvailability, currentOrder]);

  const removeFromOrder = useCallback((productId) => {
    setCurrentOrder(prevOrder =>
      prevOrder.filter(item => item._id !== productId)
    );
  }, []);

  const clearOrder = useCallback(() => {
    setCurrentOrder([]);
    setCustomerName('');
    setOrderNotes('');
    setOrderImages([]);

    if (theaterId) {
      try {
        localStorage.removeItem(`offline_pos_cart_${theaterId}`);
      } catch (error) {
        console.error('Error clearing cart:', error);
      }
    }
  }, [theaterId]);

  // Image handling
  const handleImageUpload = useCallback((imageData) => {
    setOrderImages(prev => [...prev, imageData]);
  }, []);

  const handleImageRemove = useCallback((index, imageData) => {
    setOrderImages(prev => prev.filter((_, i) => i !== index));

    if (imageData.previewUrl && imageData.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageData.previewUrl);
    }
  }, []);

  // Handle viewing combo products
  const handleViewComboProducts = useCallback((comboOffer) => {
    setSelectedComboOffer(comboOffer);
    setShowComboProductsModal(true);
  }, []);

  const handleCloseComboProductsModal = useCallback(() => {
    setShowComboProductsModal(false);
    setSelectedComboOffer(null);
  }, []);

  // Load categories (offline-first)
  const loadCategories = useCallback(async () => {
    try {
      // Try cached first
      const cachedCats = getCachedCategories(theaterId);
      if (cachedCats) {
        const activeCategories = cachedCats.filter(cat => cat.isActive);
        const categoryNames = activeCategories.map(cat => cat.categoryName || cat.name);
        const mapping = activeCategories.reduce((map, cat) => {
          const catName = cat.categoryName || cat.name;
          map[catName] = cat._id;
          return map;
        }, {});
        setCategories(categoryNames);
        setCategoryMapping(mapping);
      }

      // Try network if online
      if (navigator.onLine) {
        let token = getAuthToken();
        if (!token) {
          token = await autoLogin();
          if (!token) return;
        }

        const categoriesResponse = await unifiedFetch(`${config.api.baseUrl}/theater-categories/${theaterId}`, {
          headers: {
            'Accept': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: `theater_categories_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });

        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();

          if (categoriesData.success && categoriesData.data) {
            const categoryList = categoriesData.data.categories || categoriesData.data;

            // Cache for offline use
            cacheCategories(theaterId, categoryList);

            const activeCategories = categoryList.filter(cat => cat.isActive);
            const categoryNames = activeCategories.map(cat => cat.categoryName || cat.name);
            const mapping = activeCategories.reduce((map, cat) => {
              const catName = cat.categoryName || cat.name;
              map[catName] = cat._id?.toString() || cat._id; // Ensure string for comparison
              return map;
            }, {});

            // ✅ FIX: Log category mapping for debugging

            setCategories(categoryNames);
            setCategoryMapping(mapping);
          }
        }
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }, [theaterId]);

  // Fetch products (offline-first)
  const fetchProducts = useCallback(async (retryCount = 0, forceRefresh = false) => {
    if (!theaterId) {
      setError('Theater ID not available');
      setLoading(false);
      return;
    }

    // ✅ FIX: Clear all product caches when force refreshing to ensure fresh sales data
    if (forceRefresh && theaterId) {
      try {
        // Clear unifiedFetch cache patterns
        clearCachePattern(`theater_products_${theaterId}`);
        clearCachePattern(`theater-products/${theaterId}`);

        // Clear cafe-stock cache patterns
        clearCachePattern(`cafe_stock_${theaterId}`);
        clearCachePattern(`cafe-stock/${theaterId}`);

        // Clear unifiedFetch cache by pattern
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.includes(`theater_products_${theaterId}`) ||
            key.includes(`theater-products/${theaterId}`) ||
            key.includes(`cafe_stock_${theaterId}`) ||
            key.includes(`cafe-stock/${theaterId}`) ||
            (key.includes('fetch_') && (key.includes('theater-products') || key.includes('cafe-stock')))) {
            sessionStorage.removeItem(key);
          }
        });

      } catch (e) {
        console.warn('Failed to clear cache in fetchProducts:', e);
      }
    }

    try {
      setLoading(true);
      setError('');

      // Try cached first (skip if force refresh)
      const cachedProds = forceRefresh ? null : getCachedProducts(theaterId);

      if (cachedProds && cachedProds.length > 0) {
        // Show cached products immediately, then fetch stock in background
        setProducts(cachedProds);
        setLoading(false);

        // ✅ FIX: Fetch stock for cached products in background (non-blocking)
        // This ensures cafe stock values are updated even when using cached products
        if (navigator.onLine && theaterId) {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;

          const balanceStockPromises = cachedProds.map(async (product) => {
            try {
              const stockUrl = `${config.api.baseUrl}/cafe-stock/${theaterId}/${product._id}?year=${currentYear}&month=${currentMonth}`;
              const stockFetch = unifiedFetch(stockUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              }, {
                forceRefresh: forceRefresh, // Use forceRefresh parameter
                cacheTTL: forceRefresh ? 0 : 60000
              });

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 2000)
              );

              const stockResponse = await Promise.race([stockFetch, timeoutPromise]);

              if (stockResponse && stockResponse.ok) {
                const stockData = await stockResponse.json();
                if (stockData.success && stockData.data) {
                  const closingBalance = stockData.data.closingBalance ??
                    stockData.data.currentStock ??
                    0;
                  return { productId: product._id, balanceStock: closingBalance };
                }
              }
            } catch (error) {
              // Silently fail - use cafe stock from product data only (not theater stock)
            }
            // ✅ FIX: Only use cafe stock (balanceStock/closingBalance), NOT theater stock (inventory.currentStock/stockQuantity)
            const fallbackStock = product.balanceStock ?? product.closingBalance ?? 0;
            return { productId: product._id, balanceStock: fallbackStock };
          });

          Promise.allSettled(balanceStockPromises).then((results) => {
            const balanceStockMap = new Map();
            results.forEach((result) => {
              if (result.status === 'fulfilled') {
                const { productId, balanceStock } = result.value;
                if (balanceStock !== null && balanceStock !== undefined) {
                  balanceStockMap.set(productId, balanceStock);
                }
              }
            });

            // Update products with cafe stock values
            // ✅ FIX: Only use cafe stock, remove theater stock values
            const updatedProducts = cachedProds.map(product => {
              const balanceStock = balanceStockMap.get(product._id);
              if (balanceStock !== undefined && balanceStock !== null) {
                return {
                  ...product,
                  balanceStock: balanceStock,
                  // ✅ FIX: Update inventory and stockQuantity to match cafe stock (not theater stock)
                  inventory: product.inventory ? { ...product.inventory, currentStock: balanceStock } : { currentStock: balanceStock },
                  stockQuantity: balanceStock
                };
              }
              // If no cafe stock from API, use balanceStock from product (should be cafe stock from backend)
              const cafeStock = product.balanceStock ?? product.closingBalance ?? 0;
              return {
                ...product,
                balanceStock: cafeStock,
                // ✅ FIX: Use cafe stock only, not theater stock
                inventory: product.inventory ? { ...product.inventory, currentStock: cafeStock } : { currentStock: cafeStock },
                stockQuantity: cafeStock
              };
            });

            // Only update if we got new stock values
            if (balanceStockMap.size > 0) {
              setProducts(updatedProducts);
            }
          }).catch(() => {
            // Silently fail - keep cached products
          });
        }
      }

      // Try network if online
      if (navigator.onLine) {
        let token = getAuthToken();
        if (!token) {
          token = await autoLogin();
          if (!token) {
            if (!cachedProds) {
              throw new Error('Authentication failed - unable to login');
            }
            return;
          }
        }

        const params = new URLSearchParams({
          page: 1,
          limit: 100,
          stockSource: 'cafe', // ✅ FIX: Use cafe stock (CafeMonthlyStock) instead of theater stock
          _cacheBuster: Date.now(),
          _random: Math.random()
        });

        const baseUrl = `${config.api.baseUrl}/theater-products/${theaterId}?${params.toString()}`;

        const response = await unifiedFetch(baseUrl, {
          headers: {
            'Accept': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: forceRefresh ? null : `theater_products_${theaterId}_${params.toString()}`,
          cacheTTL: forceRefresh ? 0 : 300000, // No cache if force refresh
          forceRefresh: forceRefresh
        });

        // ✅ FIX: Parse JSON and check response (same logic as OnlinePOSInterface.jsx)
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ [OfflinePOS] Failed to parse response JSON:', parseError);
          if (response.ok === false || (response.status && response.status >= 400)) {
            try {
              const errorText = await response.text();
              const errorMessage = `HTTP ${response.status}: ${errorText}`;

              // ✅ FIX: Auto-retry once for database connection errors (500 status)
              if (response.status === 500 && retryCount < 1 && (
                errorText.includes('Database connection') ||
                errorText.includes('Cannot read properties of undefined') ||
                errorText.includes('collection')
              )) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return fetchProducts(retryCount + 1);
              }

              throw new Error(errorMessage);
            } catch (textError) {
              throw new Error(`HTTP ${response.status}: Failed to load products`);
            }
          }
          throw parseError;
        }

        // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
        if (data && data.success === true) {
          let productList = [];

          if (data.data && Array.isArray(data.data.products)) {
            productList = data.data.products;
          } else if (Array.isArray(data.data)) {
            productList = data.data;
          } else if (Array.isArray(data.products)) {
            productList = data.products;
          }

          // Cache for offline use
          cacheProducts(theaterId, productList);

          // Cache product images in background (non-blocking) - use both offline and global cache
          cacheProductImages(productList).catch(err => {
            console.warn('⚠️ [OfflinePOS] Some images failed to cache in offline storage:', err);
          });
          // Also cache using global image cache for instant loading and better field extraction
          cacheProductImagesGlobal(productList).catch(err => {
            console.warn('⚠️ [OfflinePOS] Some images failed to cache in global cache:', err);
          });

          // ✅ FIX: Fetch balance stock from cafe-stock API for each product BEFORE setting state
          // This ensures stock is displayed correctly from the cafe-stock API (same as OnlinePOSInterface)
          if (productList.length > 0) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;

            // Fetch balance stock for all products in parallel with timeout protection
            const balanceStockPromises = productList.map(async (product) => {
              try {
                const stockUrl = `${config.api.baseUrl}/cafe-stock/${theaterId}/${product._id}?year=${currentYear}&month=${currentMonth}`;

                // Use Promise.race to add timeout (5 seconds max per product)
                const stockFetch = unifiedFetch(stockUrl, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json'
                    // Token is automatically added by unifiedFetch
                  }
                }, {
                  forceRefresh: forceRefresh, // Use forceRefresh parameter
                  cacheTTL: forceRefresh ? 0 : 60000 // No cache if force refresh
                });

                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Timeout')), 5000)
                );

                const stockResponse = await Promise.race([stockFetch, timeoutPromise]);

                if (stockResponse && stockResponse.ok) {
                  const stockData = await stockResponse.json();
                  if (stockData.success && stockData.data) {
                    // Extract closingBalance (Current Balance) from cafe stock data
                    const closingBalance = stockData.data.closingBalance ??
                      stockData.data.currentStock ??
                      0;
                    return { productId: product._id, balanceStock: closingBalance };
                  }
                }
              } catch (error) {
                // Silently fail for individual products - don't block the whole list
                // ✅ FIX: Only use cafe stock from product data (balanceStock/closingBalance), NOT theater stock
                const fallbackStock = product.balanceStock ?? product.closingBalance ?? 0;
                return { productId: product._id, balanceStock: fallbackStock };
              }
              // If fetch fails completely, use cafe stock from product data only (not theater stock)
              // ✅ FIX: Only use cafe stock (balanceStock/closingBalance), NOT theater stock (inventory.currentStock/stockQuantity)
              const fallbackStock = product.balanceStock ?? product.closingBalance ?? 0;
              return { productId: product._id, balanceStock: fallbackStock };
            });

            // Wait for all balance stock fetches to complete (with allSettled to handle failures gracefully)
            const balanceStocksResults = await Promise.allSettled(balanceStockPromises);

            // Create a map for quick lookup - extract values from settled promises
            const balanceStockMap = new Map();
            balanceStocksResults.forEach((result) => {
              if (result.status === 'fulfilled') {
                const { productId, balanceStock } = result.value;
                if (balanceStock !== null && balanceStock !== undefined) {
                  balanceStockMap.set(productId, balanceStock);
                }
              }
            });

            // ✅ CRITICAL: Merge balance stock into products BEFORE setting state
            // This ensures products are displayed with correct stock values from the start
            productList = productList.map(product => {
              const balanceStock = balanceStockMap.get(product._id);
              if (balanceStock !== undefined && balanceStock !== null) {
                return {
                  ...product,
                  balanceStock: balanceStock, // Use balanceStock from cafe-stock API
                  // ✅ FIX: Remove theater stock values to prevent accidental use
                  inventory: product.inventory ? { ...product.inventory, currentStock: balanceStock } : { currentStock: balanceStock },
                  stockQuantity: balanceStock // Update stockQuantity to match cafe stock
                };
              }
              // If balance stock fetch failed, use balanceStock from backend response (already cafe stock when stockSource='cafe')
              // ✅ FIX: Ensure we use cafe stock (balanceStock/closingBalance) from backend, NOT theater stock
              const cafeStock = product.balanceStock ?? product.closingBalance ?? 0;
              return {
                ...product,
                balanceStock: cafeStock,
                // ✅ FIX: Remove theater stock values - use cafe stock only
                inventory: product.inventory ? { ...product.inventory, currentStock: cafeStock } : { currentStock: cafeStock },
                stockQuantity: cafeStock
              };
            });
          }

          // Set products (even if empty - this is not an error, just an empty state)
          setProducts(productList);
          // Clear any previous errors if we got a successful response
          if (productList.length === 0) {
            setError(null); // Clear error - empty products is not an error
          }
        } else if (data && data.success === false) {
          // Backend explicitly returned success: false
          console.error('❌ [OfflinePOS] Backend returned success: false:', data);
          throw new Error(data.message || data.error || 'Failed to load products');
        } else if (response.ok === false || (response.status && response.status >= 400)) {
          // HTTP error status
          console.error('❌ [OfflinePOS] API response not OK:', response.status, data);
          throw new Error(data?.message || data?.error || `HTTP ${response.status}: Failed to load products`);
        } else {
          // Unknown error
          console.error('❌ [OfflinePOS] Unknown error:', { response, data });
          throw new Error(data?.message || 'An unexpected error occurred while loading products');
        }
      } else {
        // Offline - use only cached data
        if (!cachedProds || cachedProds.length === 0) {
          setError('No cached products available. Please connect to internet to load products first.');
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError(error.message || 'Failed to load products');
      setLoading(false);
    }
  }, [theaterId]);

  // Fetch Combo Offers
  const fetchComboOffers = useCallback(async () => {
    if (!theaterId) return;

    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/combo-offers/${theaterId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // ✅ FIX: data.data is an object containing comboOffers array, not the array itself
          const offersList = Array.isArray(data.data) ? data.data : (data.data.comboOffers || []);
          const activeCombos = offersList.filter(combo => combo.isActive);

          console.log('📦 [OfflinePOS] Fetched combo offers:', activeCombos.map(c => ({
            name: c.name,
            gstType: c.gstType,
            gstTaxRate: c.gstTaxRate,
            offerPrice: c.offerPrice
          })));

          // Transform for POS compatibility
          const formattedCombos = activeCombos.map(combo => {
            const offerPrice = parseFloat(combo.offerPrice || combo.price || 0);
            const discountPercentage = parseFloat(combo.discountPercentage || 0);

            return {
              ...combo,
              // Map common fields to match product structure
              sellingPrice: offerPrice,
              originalPrice: offerPrice, // Store original price for discount calculation
              discountPercentage: discountPercentage, // ✅ FIX: Include discountPercentage from combo offer
              // Map GST fields explicitly to top-level for easier access
              taxRate: combo.gstTaxRate !== undefined && combo.gstTaxRate !== null ? parseFloat(combo.gstTaxRate) : 0,
              gstType: combo.gstType || 'Inclusive',
              pricing: {
                basePrice: offerPrice,
                sellingPrice: offerPrice,
                discountPercentage: discountPercentage, // ✅ FIX: Include discountPercentage in pricing object
                taxRate: combo.gstTaxRate !== undefined && combo.gstTaxRate !== null ? parseFloat(combo.gstTaxRate) : 0,
                gstType: combo.gstType || 'Inclusive'
              },
              // Set high stock for combos or implement stock calculation logic
              // For now, setting high stock to ensure visibility and add-ability
              balanceStock: 9999,
              closingBalance: 9999,
              stockQuantity: 9999,
              stockUnit: 'Nos',
              // Flag to identify as combo
              isCombo: true,
              // Use image if available
              imageUrl: combo.imageUrl || combo.image
            };
          });

          setComboOffers(formattedCombos);
        }
      }
    } catch (error) {
      console.error('Error fetching combo offers:', error);
    }
  }, [theaterId]);

  // Initial load - Run on mount AND route re-entry to ensure UI is properly initialized
  // Note: fetchProducts uses cache first, so re-running is safe and ensures fresh UI state
  useEffect(() => {
    if (theaterId) {
      fetchProducts();
      loadCategories();
      fetchComboOffers();
    }
  }, [theaterId, location.key, fetchProducts, loadCategories, fetchComboOffers]); // ✅ FIX: Add location.key to re-initialize on route re-entry (changes on every navigation)

  // 🚀 PERIODIC REFRESH FOR SALES UPDATES: Refresh product stock data every 15 seconds when page is visible
  // This ensures sales values are reflected immediately after orders are placed
  useEffect(() => {
    if (!theaterId || !fetchProducts) {
      return;
    }

    let refreshInterval = null;

    // Function to start periodic refresh
    const startPeriodicRefresh = () => {
      // Clear any existing interval
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }

      // Only start if page is visible
      if (document.visibilityState === 'visible') {
        // Set up periodic refresh every 15 seconds
        refreshInterval = setInterval(() => {
          // Only refresh if page is still visible
          if (document.visibilityState === 'visible' && fetchProducts) {
            // Clear cache before periodic refresh to ensure fresh sales data
            try {
              clearCachePattern(`theater_products_${theaterId}`);
              clearCachePattern(`cafe_stock_${theaterId}`);
              const keys = Object.keys(sessionStorage);
              keys.forEach(key => {
                if (key.includes(`theater_products_${theaterId}`) ||
                  key.includes(`cafe_stock_${theaterId}`) ||
                  key.includes(`theater-products/${theaterId}`) ||
                  key.includes(`cafe-stock/${theaterId}`)) {
                  sessionStorage.removeItem(key);
                }
              });
            } catch (e) {
              console.warn('Failed to clear cache during periodic refresh:', e);
            }
            fetchProducts(0, true); // Force refresh
          }
        }, 15000); // 15 seconds - faster updates for sales data
      }
    };

    // Start periodic refresh immediately if page is visible
    startPeriodicRefresh();

    // Handle visibility changes - restart interval when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startPeriodicRefresh();
      } else {
        // Stop interval when page is hidden to save resources
        if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup interval and event listener on unmount or when dependencies change
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [theaterId, fetchProducts]);

  // 🚀 SALES UPDATE LISTENER: Listen for sales_updated flag to refresh immediately when orders are placed
  useEffect(() => {
    if (!theaterId || !fetchProducts) {
      return;
    }

    const clearProductCache = () => {
      // Clear all product-related caches to ensure fresh data
      try {
        clearCachePattern(`theater_products_${theaterId}`);
        clearCachePattern(`cafe_stock_${theaterId}`);

        // Clear any sessionStorage caches related to products and stock
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.includes(`theater_products_${theaterId}`) ||
            key.includes(`cafe_stock_${theaterId}`) ||
            key.includes(`theater-products/${theaterId}`) ||
            key.includes(`cafe-stock/${theaterId}`) ||
            (key.includes('fetch_') && (key.includes('theater-products') || key.includes('cafe-stock')))) {
            sessionStorage.removeItem(key);
          }
        });

      } catch (e) {
        console.warn('Failed to clear cache:', e);
      }
    };

    const handleSalesUpdate = (e) => {
      // Listen for both stock_updated and sales_updated flags
      const isStockUpdate = e.key === `stock_updated_${theaterId}`;
      const isSalesUpdate = e.key === `sales_updated_${theaterId}`;

      if ((isStockUpdate || isSalesUpdate) && e.newValue && theaterId) {
        const now = Date.now();
        const flagTime = parseInt(e.newValue);
        const timeSinceFlag = now - flagTime;

        // Only refresh if flag was set more than 1 second ago (likely from another tab/page)
        if (timeSinceFlag > 1000) {
          localStorage.removeItem(e.key);
          // Clear cache before refreshing to ensure fresh data
          clearProductCache();
          if (fetchProducts) {
            fetchProducts(0, true); // Force refresh
          }
        } else {
          // Flag was just set, likely from same tab - skip refresh to prevent white screen
        }
      }
    };

    // Check for sales_updated flag on mount
    const salesUpdatedFlag = localStorage.getItem(`sales_updated_${theaterId}`);
    if (salesUpdatedFlag && theaterId) {
      const now = Date.now();
      const flagTime = parseInt(salesUpdatedFlag);
      const timeSinceFlag = now - flagTime;

      // Only refresh if flag was set more than 1 second ago
      if (timeSinceFlag > 1000) {
        localStorage.removeItem(`sales_updated_${theaterId}`);
        // Clear cache before refreshing
        clearProductCache();
        setTimeout(() => {
          if (fetchProducts) {
            fetchProducts(0, true); // Force refresh
          }
        }, 100);
      }
    }

    window.addEventListener('storage', handleSalesUpdate);

    return () => {
      window.removeEventListener('storage', handleSalesUpdate);
    };
  }, [theaterId, fetchProducts]);

  // ✅ Check for pending stock updates from localStorage (for instant updates even if event missed)
  useEffect(() => {
    if (!theaterId) return;

    const checkPendingStockUpdate = () => {
      try {
        const updateKey = `pending_stock_update_${theaterId}`;
        const updateData = localStorage.getItem(updateKey);

        if (updateData) {
          const { orderItems, timestamp } = JSON.parse(updateData);

          // Only process if update is recent (within last 5 seconds)
          if (Date.now() - timestamp < 5000) {

            // Use direct function call if available (fastest)
            const directFn = window[`updateStock_${theaterId}`];
            if (directFn && typeof directFn === 'function') {
              directFn(orderItems);
            } else if (updateStockInstantlyRef.current) {
              updateStockInstantlyRef.current(orderItems);
            } else {
              // Fallback to flushSync
              flushSync(() => {
                setProducts(prevProducts => {
                  return prevProducts.map(product => {
                    const orderItem = orderItems.find(item => {
                      const itemId = item.productId?.toString() || item.productId || item._id?.toString() || item._id;
                      const prodId = product._id?.toString() || product._id;
                      return itemId === prodId;
                    });

                    if (orderItem) {
                      const stockUnit = product.stockUnit || getProductUnitBase(product) || 'Nos';
                      const consumption = calculateConsumption(product, orderItem.quantity, stockUnit);
                      const currentStock = product.balanceStock ?? product.closingBalance ?? 0;
                      const newStock = Math.max(0, currentStock - consumption);

                      return {
                        ...product,
                        balanceStock: newStock,
                        closingBalance: newStock,
                        stockQuantity: newStock,
                        inventory: product.inventory ? { ...product.inventory, currentStock: newStock } : { currentStock: newStock }
                      };
                    }

                    return product;
                  });
                });
              });
            }

            // Clear the update after processing
            localStorage.removeItem(updateKey);
          } else {
            // Stale update, remove it
            localStorage.removeItem(updateKey);
          }
        }
      } catch (error) {
        console.warn('Error checking pending stock update:', error);
      }
    };

    // Listen for custom event (works in same tab) and storage events (other tabs)
    const handleStockUpdatePending = () => {
      checkPendingStockUpdate();
    };

    const handleStorageEvent = (e) => {
      if (e.key === `pending_stock_update_${theaterId}` && e.newValue) {
        checkPendingStockUpdate();
      }
    };

    window.addEventListener('stockUpdatePending', handleStockUpdatePending);
    window.addEventListener('storage', handleStorageEvent);

    // Check immediately on mount
    checkPendingStockUpdate();

    // Also check very frequently using requestAnimationFrame for near-instant updates
    let rafId;
    const checkWithRAF = () => {
      checkPendingStockUpdate();
      rafId = requestAnimationFrame(checkWithRAF);
    };
    rafId = requestAnimationFrame(checkWithRAF);

    return () => {
      window.removeEventListener('stockUpdatePending', handleStockUpdatePending);
      window.removeEventListener('storage', handleStorageEvent);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [theaterId]);

  // ✅ INSTANT STOCK UPDATE FUNCTION: Direct function call for 0.01ms updates
  const updateStockInstantlyRef = useRef(null);

  // Create the instant update function
  const updateStockInstantly = useCallback((orderItems) => {
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) return;


    // Use requestAnimationFrame for absolute fastest update (next frame, ~16ms max, usually <1ms)
    requestAnimationFrame(() => {
      flushSync(() => {
        setProducts(prevProducts => {
          const updated = prevProducts.map(product => {
            const orderItem = orderItems.find(item => {
              const itemId = item.productId?.toString() || item.productId || item._id?.toString() || item._id;
              const prodId = product._id?.toString() || product._id;
              return itemId === prodId;
            });

            if (orderItem) {
              const stockUnit = product.stockUnit || getProductUnitBase(product) || 'Nos';
              const consumption = calculateConsumption(product, orderItem.quantity, stockUnit);
              const currentStock = product.balanceStock ?? product.closingBalance ?? 0;
              const newStock = Math.max(0, currentStock - consumption);


              return {
                ...product,
                balanceStock: newStock,
                closingBalance: newStock,
                stockQuantity: newStock,
                inventory: product.inventory ? { ...product.inventory, currentStock: newStock } : { currentStock: newStock }
              };
            }

            return product;
          });
          return updated;
        });
      });
    });
  }, []);

  // Store function in ref and expose globally
  useEffect(() => {
    if (!theaterId) return;

    updateStockInstantlyRef.current = updateStockInstantly;

    // Expose globally for direct calls
    const globalKey = `updateStock_${theaterId}`;
    window[globalKey] = updateStockInstantly;

    return () => {
      delete window[globalKey];
      updateStockInstantlyRef.current = null;
    };
  }, [theaterId, updateStockInstantly]);

  // ✅ OPTIMISTIC STOCK UPDATES: Listen for order placement events (backup)
  useEffect(() => {
    if (!theaterId) return;

    const handleOrderPlaced = (event) => {
      const { orderItems, theaterId: orderTheaterId } = event.detail || {};

      // Only process if this order is for the current theater
      if (!orderItems || !orderTheaterId || orderTheaterId !== theaterId) {
        return;
      }


      // Call the instant update function directly
      if (updateStockInstantlyRef.current) {
        updateStockInstantlyRef.current(orderItems);
      }

      // Step 2: Fetch real stock values in background (non-blocking, async)
      // This runs after the optimistic update, doesn't block UI
      if (navigator.onLine && theaterId) {
        // Use setTimeout(0) to ensure this runs after the state update
        setTimeout(() => {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;

          // Get product IDs from order items
          const productIds = orderItems.map(item =>
            item.productId?.toString() || item.productId || item._id?.toString() || item._id
          ).filter(Boolean);

          if (productIds.length > 0) {

            // Fetch stock for all ordered products in parallel
            const stockPromises = productIds.map(async (productId) => {
              try {
                const stockUrl = `${config.api.baseUrl}/cafe-stock/${theaterId}/${productId}?year=${currentYear}&month=${currentMonth}`;
                const stockResponse = await unifiedFetch(stockUrl, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }, {
                  forceRefresh: true, // Force refresh to get latest stock
                  cacheTTL: 0 // Don't cache this refresh
                });

                if (stockResponse && stockResponse.ok) {
                  const stockData = await stockResponse.json();
                  if (stockData.success && stockData.data) {
                    const closingBalance = stockData.data.closingBalance ?? stockData.data.currentStock ?? 0;
                    return { productId, balanceStock: closingBalance };
                  }
                }
              } catch (error) {
                console.warn(`⚠️ [OfflinePOS] Failed to refresh stock for product ${productId}:`, error);
              }
              return null;
            });

            Promise.allSettled(stockPromises).then((results) => {
              const stockMap = new Map();
              results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value) {
                  const { productId, balanceStock } = result.value;
                  stockMap.set(productId, balanceStock);
                }
              });

              if (stockMap.size > 0) {
                // Step 3: Replace optimistic values with real server data
                setProducts(prevProducts => {
                  return prevProducts.map(product => {
                    const prodId = product._id?.toString() || product._id;
                    const realStock = stockMap.get(prodId);

                    if (realStock !== undefined && realStock !== null) {
                      return {
                        ...product,
                        balanceStock: realStock,
                        closingBalance: realStock,
                        stockQuantity: realStock,
                        inventory: product.inventory ? { ...product.inventory, currentStock: realStock } : { currentStock: realStock }
                      };
                    }

                    return product;
                  });
                });
              }
            }).catch((error) => {
              console.error('❌ [OfflinePOS] Error fetching real stock values:', error);
              // On error, keep optimistic values (they're better than stale data)
            });
          }
        }, 0);
      }
    };

    // Listen for order placement events
    window.addEventListener('orderPlaced', handleOrderPlaced);

    return () => {
      window.removeEventListener('orderPlaced', handleOrderPlaced);
    };
  }, [theaterId]); // Don't include products in deps to avoid re-creating listener

  // Filter products
  const filteredProducts = useMemo(() => {
    // Special handling for Combo Offers category
    if (selectedCategory === 'Combo Offers') {
      let filtered = comboOffers || [];

      // Apply search term filtering to combo offers as well
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(combo =>
          combo.name?.toLowerCase().includes(search) ||
          combo.description?.toLowerCase().includes(search)
        );
      }

      return filtered;
    }

    let filtered = products;

    if (selectedCategory !== 'all') {
      const categoryId = categoryMapping[selectedCategory];

      // ✅ FIX: Log filtering details for debugging
      if (categoryId) {
        console.log('🔍 [OfflinePOS] Filtering by category:', {
          selectedCategory,
          categoryId: categoryId?.toString(),
          totalProducts: products.length
        });
      }

      filtered = filtered.filter(product => {
        // ✅ FIX: Check multiple possible category field formats
        // Backend returns categoryData, but also check category and categoryId for compatibility
        const prodCatId = product.categoryData?._id ||
          product.category?._id ||
          product.category ||
          product.categoryId;

        // Convert both to strings for comparison (handles ObjectId vs string)
        const prodCatIdStr = prodCatId?.toString();
        const categoryIdStr = categoryId?.toString();

        const matches = prodCatIdStr === categoryIdStr;

        // ✅ FIX: Log first few products for debugging
        if (products.indexOf(product) < 3) {
          console.log('🔍 [OfflinePOS] Product category check:', {
            productName: product.name,
            categoryData: product.categoryData,
            category: product.category,
            categoryId: product.categoryId,
            prodCatIdStr,
            categoryIdStr,
            matches
          });
        }

        return matches;
      });

    }

    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        product.name?.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [products, categories, selectedCategory, categoryMapping, searchTerm, comboOffers]);

  // Calculate order totals using centralized utility
  // ✅ FIX: Map currentOrder to ensure consistent price field handling (especially for combo offers)
  const orderTotals = useMemo(() => {
    const mappedOrderItems = currentOrder.map(item => {
      // For combo offers, check offerPrice first, then other price fields
      const sellingPrice = Number(
        item.offerPrice ||
        item.sellingPrice ||
        item.pricing?.basePrice ||
        item.pricing?.salePrice ||
        item.basePrice ||
        item.price ||
        0
      );

      return {
        ...item,
        sellingPrice: sellingPrice,
        quantity: item.quantity,
        taxRate: parseFloat(item.taxRate || item.pricing?.taxRate) || 5,
        gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
        discountPercentage: Number(item.discountPercentage || item.pricing?.discountPercentage) || 0,
        pricing: item.pricing || {
          basePrice: sellingPrice,
          salePrice: sellingPrice
        }
      };
    });

    return calculateOrderTotals(mappedOrderItems);
  }, [currentOrder]);

  // Process order (offline-capable)
  const handleProcessOrder = useCallback(() => {
    if (currentOrder.length === 0) {
      alert('Please add items to order');
      return;
    }

    // ✅ FIX: Optimize cart data to reduce size - only include essential fields
    const optimizedItems = currentOrder.map(item => ({
      _id: item._id,
      name: item.name,
      quantity: item.quantity,
      // ✅ Include size/variant information for display in cart
      originalQuantity: item.originalQuantity || item.size || item.productSize || item.sizeLabel || item.variant?.option ||
        (item.variants && item.variants.length > 0 ? item.variants[0].option : null) || null,
      size: item.size || item.productSize || item.sizeLabel || null,
      productSize: item.productSize || item.size || item.sizeLabel || null,
      sizeLabel: item.sizeLabel || item.size || item.productSize || null,
      variant: item.variant || null,
      variants: item.variants || null,
      sellingPrice: item.sellingPrice || item.pricing?.basePrice || item.pricing?.salePrice || 0,
      discountPercentage: item.discountPercentage || item.pricing?.discountPercentage || 0,
      taxRate: item.taxRate !== undefined ? item.taxRate : (item.pricing?.taxRate !== undefined ? item.pricing.taxRate : 5),
      gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
      // ✅ Include product image for display in cart (check imageUrl first for combo items)
      image: item.imageUrl || item.image || item.images?.[0] || item.productImage || item.thumbnail || null,
      productImage: item.imageUrl || item.productImage || item.image || item.images?.[0] || null,
      imageUrl: item.imageUrl || item.image || item.images?.[0] || item.productImage || null,
      images: item.images || (item.imageUrl ? [item.imageUrl] : (item.image ? [item.image] : [])),
    }));

    // Prepare optimized cart data (with product images for display)
    const cartData = {
      items: optimizedItems,
      customerName: customerName.trim() || 'POS', // Default customer name
      notes: orderNotes.trim(),
      subtotal: orderTotals.subtotal,
      tax: orderTotals.tax,
      total: orderTotals.total,
      totalDiscount: orderTotals.totalDiscount,
      theaterId,
      source: 'offline-pos' // ✅ FIX: Use 'offline-pos' as source for proper redirect
    };

    try {
      // ✅ FIX: Use React Router navigate with state (preferred - doesn't use sessionStorage)
      // This avoids sessionStorage quota issues
      navigate(`/view-cart/${theaterId}?source=offline-pos`, {
        state: cartData
      });
    } catch (error) {
      console.error('❌ Navigation error:', error);

      // Fallback: try sessionStorage (without images already)
      try {
        // Clear old cart data first to free up space
        sessionStorage.removeItem('cartData');
        sessionStorage.setItem('cartData', JSON.stringify(cartData));
        window.location.href = `/view-cart/${theaterId}?source=offline-pos`;
      } catch (storageError) {
        console.error('❌ SessionStorage failed:', storageError);
        // Last resort: navigate without state, ViewCart will show empty cart
        alert('Unable to save cart data. Please try again or reduce order size.');
        window.location.href = `/view-cart/${theaterId}?source=offline-pos`;
      }
    }
  }, [currentOrder, theaterId, customerName, orderNotes, orderImages, orderTotals, navigate]);

  // ✅ KEYBOARD SHORTCUT: Enter key to process order
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only trigger if Enter is pressed
      if (event.key === 'Enter' || event.keyCode === 13) {
        // Don't trigger if user is typing in an input field, textarea, or contenteditable element
        const activeElement = document.activeElement;
        const isInputField = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable ||
          activeElement.closest('input, textarea, [contenteditable="true"]')
        );

        // Only process if:
        // 1. Not typing in an input field
        // 2. Order has items
        // 3. Not already processing
        if (!isInputField && currentOrder.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          handleProcessOrder();
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentOrder.length, handleProcessOrder]);

  // Render professional loading state
  if (loading && products.length === 0) {
    return (
      <TheaterLayout pageTitle="POS System">
        <div className="pos-container">
          <div className="pos-loading-professional">
            <div className="pos-loading-content">
              <div className="pos-loading-spinner-modern">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <h3 className="pos-loading-title">Initializing POS System</h3>
              <p className="pos-loading-subtitle">Loading products and categories...</p>
              <div className="pos-loading-progress">
                <div className="pos-loading-progress-bar"></div>
              </div>
            </div>
          </div>
        </div>
      </TheaterLayout>
    );
  }

  // Only show error if we have an actual error (not just empty products)
  // Empty products should show empty state, not error
  if (error && error !== 'No products available' && products.length === 0) {
    const handleManualTokenSet = () => {
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZDkzNTdiYWE4YmMyYjYxMDFlMjk3YyIsInVzZXJUeXBlIjoidGhlYXRlcl91c2VyIiwidGhlYXRlciI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInRoZWF0ZXJJZCI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInBlcm1pc3Npb25zIjpbXSwiaWF0IjoxNzU5MTE4MzM0LCJleHAiOjE3NTkyMDQ3MzR9.gvOS5xxIlcOlgSx6D_xDH3Z_alrqdp5uMtMLOVWIEJs";
      localStorage.setItem('authToken', token);
      window.location.reload();
    };

    return (
      <TheaterLayout pageTitle="POS">
        <ErrorBoundary>
          <div className="pos-error-container">
            <div className="pos-error-card">
              <div className="pos-error-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h3 className="pos-error-title">Unable to Load Menu</h3>
              <p className="pos-error-message">{error}</p>
              <div className="pos-error-actions">
                <button
                  className="pos-error-btn pos-error-btn-secondary"
                  onClick={() => {
                    setError('');
                    fetchProducts();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                    <path d="M21 3v5h-5"></path>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                    <path d="M3 21v-5h5"></path>
                  </svg>
                  Retry
                </button>
                <button
                  className="pos-error-btn pos-error-btn-primary"
                  onClick={handleManualTokenSet}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    <path d="M12 8v4"></path>
                    <path d="M12 16h.01"></path>
                  </svg>
                  Set Demo Token
                </button>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </TheaterLayout>
    );
  }

  // ✅ FIX: Use location.key to force complete remount of content area
  const contentKey = `pos-${theaterId}-${location.key || remountKey}`;

  return (
    <TheaterLayout
      pageTitle="POS"
      posStatusData={{
        connectionStatus,
        pendingCount,
        lastSyncTime
      }}
      key={`layout-${location.key}`} // ✅ FIX: Force layout remount on navigation
    >
      <div className="professional-pos-content offline-pos-content" key={contentKey}>
        {/* CSS Reset and Isolation */}
        <style jsx>{`
          .professional-pos-content *,
          .offline-pos-content * {
            box-sizing: border-box;
          }
          .professional-pos-content .qr-stats,
          .professional-pos-content .theater-stats,
          .professional-pos-content .product-stats {
            display: none !important;
          }
          .professional-pos-content,
          .offline-pos-content {
            isolation: isolate;
            /* ✅ FIX: Force layout recalculation and reset ViewCart styles */
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            height: 100% !important;
            position: relative !important;
            overflow: visible !important;
          }
          /* ✅ FIX: Disable ALL ViewCart styles when on POS page - highest priority */
          body.offline-pos-page .view-cart-wrapper,
          body.offline-pos-page .view-cart-container {
            display: none !important;
          }
          /* ✅ FIX: Override ViewCart.css global styles - ensure POS styles take precedence */
          body.offline-pos-page .professional-pos-content .pos-main-container,
          body.offline-pos-page .offline-pos-content .pos-main-container {
            /* Reset any ViewCart flex properties */
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: stretch !important;
            justify-content: flex-start !important;
          }
          body.offline-pos-page .professional-pos-content .pos-menu-section,
          body.offline-pos-page .offline-pos-content .pos-menu-section {
            flex: 2 0 auto !important;
            flex-basis: auto !important;
            flex-grow: 2 !important;
            flex-shrink: 0 !important;
          }
          body.offline-pos-page .professional-pos-content .pos-order-section,
          body.offline-pos-page .offline-pos-content .pos-order-section {
            flex: 0 0 400px !important;
            flex-basis: 400px !important;
            flex-grow: 0 !important;
            flex-shrink: 0 !important;
          }
          /* ✅ FIX: Override ViewCart.css styles that might conflict - Use body class for higher specificity */
          body.offline-pos-page .professional-pos-content .pos-main-container,
          .offline-pos-page .professional-pos-content .pos-main-container,
          .professional-pos-content .pos-main-container {
            display: flex !important;
            flex-direction: row !important;
            width: 100% !important;
            height: calc(100vh - 80px) !important;
            max-height: calc(100vh - 80px) !important;
            gap: 0 !important;
            overflow: hidden !important;
            background: #f8f9fa !important;
            flex: 1 !important;
            /* Override any ViewCart styles */
            margin: 0 !important;
            padding: 0 !important;
          }
          /* ✅ FIX: Ensure menu section has correct layout (override ViewCart) - Use body class for higher specificity */
          body.offline-pos-page .professional-pos-content .pos-menu-section,
          body.offline-pos-page .offline-pos-content .pos-menu-section,
          .offline-pos-page .professional-pos-content .pos-menu-section,
          .offline-pos-page .offline-pos-content .pos-menu-section,
          .professional-pos-content .pos-menu-section,
          .offline-pos-content .pos-menu-section {
            flex: 2 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            background: white !important;
            margin: 10px !important;
            border-radius: 15px !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
            /* Override ViewCart styles */
            min-width: 0 !important;
            padding: 0 !important;
            /* ✅ FIX: Reset any ViewCart layout styles */
            flex-shrink: 0 !important;
            flex-grow: 2 !important;
          }
          /* ✅ FIX: Ensure order section has correct layout (override ViewCart) - Use body class for higher specificity */
          body.offline-pos-page .professional-pos-content .pos-order-section,
          body.offline-pos-page .offline-pos-content .pos-order-section,
          .offline-pos-page .professional-pos-content .pos-order-section,
          .offline-pos-page .offline-pos-content .pos-order-section,
          .professional-pos-content .pos-order-section,
          .offline-pos-content .pos-order-section {
            flex: 0 0 400px !important;
            max-width: 400px !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            background: white !important;
            margin: 10px 10px 10px 0 !important;
            border-radius: 15px !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
            /* Override ViewCart styles */
            padding: 0 !important;
            /* ✅ FIX: Reset any ViewCart layout styles */
            flex-shrink: 0 !important;
            flex-grow: 0 !important;
          }
          /* ✅ FIX: Remove any ViewCart specific classes that might interfere */
          .professional-pos-content .cart-content,
          .professional-pos-content .cart-items-section,
          .professional-pos-content .view-cart-container {
            display: none !important;
          }
          /* ✅ FIX: Ensure product grid uses 8-column layout (100px) - override ALL external CSS */
          body.offline-pos-page .professional-pos-content .pos-products-grid,
          body.offline-pos-page .offline-pos-content .pos-products-grid,
          .offline-pos-page .professional-pos-content .pos-products-grid,
          .offline-pos-page .offline-pos-content .pos-products-grid,
          .professional-pos-content .pos-products-grid,
          .offline-pos-content .pos-products-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important;
            gap: 10px !important;
            padding: 16px !important;
            overflow-y: auto !important;
            max-height: calc(100vh - 200px) !important;
            min-height: 500px !important;
            flex: 1 !important;
            /* ✅ FIX: Override ProfessionalPOS.css (200px) and any other external CSS */
            grid-auto-flow: row !important;
            grid-auto-rows: auto !important;
            align-items: start !important;
            justify-items: stretch !important;
          }
          .discount-line .discount-amount {
            color: #10B981;
            font-weight: 600;
          }
          .discount-line {
            color: #10B981;
          }
          
          /* Modern Combo Modal Styles */
          .modern-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            z-index: 2000; /* Higher z-index to ensure it's on top */
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.2s ease-out;
          }

          .modern-modal-content {
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            width: 95%;
            max-width: 700px; /* Further reduced from 850px */
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          .modern-modal-header {
            padding: 16px 24px;
            /* Global Purple Header Design */
            background: #662d91; /* Global Theme Purple */
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            color: white;
            border-top-left-radius: 18px; /* Match content radius */
            border-top-right-radius: 18px;
          }
          
          .modern-modal-header::after {
            display: none; /* Remove separator line */
          }

          .modern-modal-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: white;
            margin: 0;
            letter-spacing: 0.02em;
            /* Removed gradient and icon to match global design */
          }
          
          .modern-modal-title::before {
            content: none;
          }

          .modern-close-btn {
            background: rgba(255, 255, 255, 0.15);
            border: none;
            cursor: pointer;
            width: 32px;
            height: 32px;
            border-radius: 8px; /* Slightly sharper styling like Kiosk */
            color: white;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .modern-close-btn:hover {
            background-color: rgba(255, 255, 255, 0.3);
            color: white;
            transform: none; /* Removed rotation */
          }

          .modern-modal-body {
            padding: 0;
            overflow-y: auto;
            flex: 1;
            background: #fcfcfc;
          }

          .modern-table-container {
            padding: 16px 24px;
            display: flex;
            justify-content: center; /* Center the table if it's smaller than the container */
          }

          .modern-table {
            width: auto; /* Shrink to fit content */
            min-width: 600px; /* Ensure it's not too small */
            border-collapse: separate;
            border-spacing: 0;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.05);
            border: 1px solid #f3f4f6;
          }

          .modern-table th {
            background: #f8fafc;
            color: #64748b;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 0.7rem; /* Smaller font */
            letter-spacing: 0.05em;
            padding: 12px 16px; /* Significantly reduced padding */
            text-align: center; /* Center align all headers */
            border-bottom: 1px solid #e2e8f0;
            white-space: nowrap; /* Prevent wrapping in headers */
          }

          .modern-table td {
            padding: 10px 16px; /* Reduced padding */
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
            color: #334155;
            font-size: 0.9rem;
            transition: background 0.15s;
          }

          .modern-table tr:hover td {
            background-color: #f8fafc;
          }

          .modern-table tr:last-child td {
            border-bottom: none;
          }

          .prod-cell {
            display: flex;
            align-items: center;
            gap: 12px; /* Reduced gap */
          }

          .prod-img {
            width: 40px; /* Smaller image */
            height: 40px;
            border-radius: 8px;
            object-fit: cover;
            border: 1px solid #e5e7eb;
            background: #fff;
            padding: 2px;
          }

          .prod-placeholder {
            width: 40px; /* Smaller placeholder */
            height: 40px;
            border-radius: 8px;
            background: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            border: 1px dashed #cbd5e1;
          }

          .prod-info {
            display: flex;
            flex-direction: column;
            gap: 1px;
          }

          .prod-name {
            font-weight: 600;
            color: #1e293b;
            font-size: 0.95rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 160px; /* Reduced max-width for product name */
          }

          .prod-meta {
            font-size: 0.75rem;
            color: #64748b;
          }

          .qty-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 28px; /* Smaller badge */
            height: 28px;
            padding: 0 6px;
            background: #f1f5f9;
            border-radius: 6px;
            font-weight: 600;
            color: #475569;
            font-size: 0.85rem;
            font-feature-settings: "tnum";
          }
          
          .highlight-qty {
            background: #e0e7ff;
            color: #4338ca;
          }

          .stock-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-weight: 600;
            padding: 4px 10px; /* Compact status */
            border-radius: 9999px;
            font-size: 0.75rem;
            white-space: nowrap;
          }

          .stock-ok {
            background: #ecfdf5;
            color: #059669;
            border: 1px solid #d1fae5;
          }

          .stock-low {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fee2e2;
          }
          
          .empty-visual {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 20px;
            text-align: center;
            color: #94a3b8;
          }
          
          .empty-icon {
            font-size: 3rem;
            margin-bottom: 12px;
            opacity: 0.5;
          }
        `}</style>

        {/* Main POS Layout */}
        <div className="pos-main-container" key={`pos-container-${remountKey}-${location.key || location.pathname}`}>
          {/* Left Side - Product Menu */}
          <div className="pos-menu-section">{/* Category Tabs - POS Style */}
            <div className="pos-category-tabs">
              <button
                className={`pos-tab ${selectedCategory === 'all' ? 'active pos-tab-active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                ALL ITEMS ({products.length})
              </button>

              {/* Combo Offers Tab */}
              <button
                className={`pos-tab ${selectedCategory === 'Combo Offers' ? 'active pos-tab-active' : ''}`}
                onClick={() => setSelectedCategory('Combo Offers')}
              >
                COMBO OFFERS ({comboOffers.length || 0})
              </button>

              {categories.length > 0 ? (
                categories.map((category, index) => (
                  <button
                    key={category || `category-${index}`}
                    className={`pos-tab ${selectedCategory === category ? 'active pos-tab-active' : ''}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {(category || 'CATEGORY').toUpperCase()}
                  </button>
                ))
              ) : null}
            </div>

            {/* Products Grid */}
            <div className="pos-products-grid">
              {selectedCategory === 'Combo Offers' ? (
                // Handle combo offers empty state separately
                filteredProducts.length === 0 ? (
                  <div className="pos-no-products">
                    <div className="no-products-icon">🍽️</div>
                    <h3>No Items Available</h3>
                    <p>No combo offers found{searchTerm.trim() ? ' matching your search.' : ' in this category.'}</p>
                  </div>
                ) : (
                  filteredProducts.map((product, index) => {
                    // Check if combo is out of stock (for combo offers only)
                    const checkComboStock = (combo) => {
                      if (!combo.isCombo) return false;
                      const existingItem = currentOrder.find(item => item._id === combo._id);
                      const currentQty = existingItem ? existingItem.quantity : 0;
                      const newTotalQty = currentQty + 1; // Check if adding 1 more would work
                      const validation = validateComboStockAvailability(combo, newTotalQty, true);
                      return !validation.valid;
                    };

                    return (
                      <StaffProductCard
                        key={product._id || `product-${index}`}
                        product={product}
                        onAddToCart={addToOrder}
                        currentOrder={currentOrder}
                        onViewComboProducts={handleViewComboProducts}
                        isComboOutOfStock={checkComboStock}
                      />
                    );
                  })
                )
              ) : products.length === 0 ? (
                <div className="pos-empty-state">
                  <div className="pos-empty-icon">
                    <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                      <line x1="3" y1="6" x2="21" y2="6"></line>
                      <path d="M16 10a4 4 0 0 1-8 0"></path>
                    </svg>
                  </div>
                  <h3 className="pos-empty-title">No Products Available</h3>
                  <p className="pos-empty-message">
                    There are no products in your menu yet.
                  </p>
                  <p className="pos-empty-hint">
                    Add products from the Product Management section to get started.
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="pos-no-products">
                  <div className="no-products-icon">🍽️</div>
                  <h3>No Items Available</h3>
                  <p>No items found in this category.</p>
                </div>
              ) : (
                filteredProducts.map((product, index) => {
                  // Check if combo is out of stock (for combo offers only)
                  const checkComboStock = (combo) => {
                    if (!combo.isCombo) return false;
                    const existingItem = currentOrder.find(item => item._id === combo._id);
                    const currentQty = existingItem ? existingItem.quantity : 0;
                    const newTotalQty = currentQty + 1; // Check if adding 1 more would work
                    const validation = validateComboStockAvailability(combo, newTotalQty, true);
                    return !validation.valid;
                  };

                  return (
                    <StaffProductCard
                      key={product._id || `product-${index}`}
                      product={product}
                      onAddToCart={addToOrder}
                      currentOrder={currentOrder}
                      onViewComboProducts={handleViewComboProducts}
                      isComboOutOfStock={product.isCombo ? checkComboStock : undefined}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Right Side - Order Panel - POS Style */}
          <div className="pos-order-section">
            <div className="pos-order-header">
              <h2 className="pos-order-title pos-order-title-white">
                Current Order ({currentOrder.length})
              </h2>
              {currentOrder.length > 0 && (
                <button
                  className="pos-clear-btn"
                  onClick={clearOrder}
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="pos-order-content">
              {currentOrder.length === 0 ? (
                <div className="pos-empty-order">
                  <div className="empty-order-icon">🛒</div>
                  <h3>No Items</h3>
                  <p>Select items from the menu to add to order.</p>
                </div>
              ) : (
                <>
                  {/* Order Items - POS Style */}
                  <div className="pos-order-items">
                    {currentOrder.map((item, index) => {
                      // Check if adding one more would exceed stock
                      // We check validation for (currentQty + 1) silently
                      const canAddMore = validateStockAvailability(item._id, item.quantity, 1, true);

                      return (
                        <StaffOrderItem
                          key={item._id || `order-item-${index}`}
                          item={{ ...item, maxReached: !canAddMore }}
                          onUpdateQuantity={updateQuantity}
                          onRemove={removeFromOrder}
                        />
                      )
                    })}
                  </div>

                  {/* Order Summary - POS Style */}
                  <div className="pos-order-summary">
                    <div className="pos-summary-line">
                      <span>Subtotal:</span>
                      <span>₹{orderTotals.subtotal % 1 === 0 ? orderTotals.subtotal : orderTotals.subtotal.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                    {orderTotals.tax > 0 && (
                      <>
                        <div className="pos-summary-line">
                          <span>CGST:</span>
                          <span>₹{(() => { const val = orderTotals.cgst || orderTotals.tax / 2; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}</span>
                        </div>
                        <div className="pos-summary-line">
                          <span>SGST:</span>
                          <span>₹{(() => { const val = orderTotals.sgst || orderTotals.tax / 2; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}</span>
                        </div>
                      </>
                    )}
                    {orderTotals.totalDiscount > 0 && (
                      <div className="pos-summary-line discount-line">
                        <span>Discount:</span>
                        <span className="discount-amount">-₹{orderTotals.totalDiscount % 1 === 0 ? orderTotals.totalDiscount : orderTotals.totalDiscount.toFixed(2).replace(/\.00$/, '')}</span>
                      </div>
                    )}
                    <div className="pos-summary-total">
                      <span>TOTAL:</span>
                      <span>₹{orderTotals.total % 1 === 0 ? orderTotals.total : orderTotals.total.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                  </div>

                  {/* Action Buttons - POS Style */}
                  <div className="pos-actions">
                    <button
                      className="pos-process-btn"
                      onClick={handleProcessOrder}
                      disabled={currentOrder.length === 0}
                      style={{
                        backgroundColor: currentOrder.length === 0 ? '#9ca3af' : '#6B0E9B',
                        background: currentOrder.length === 0 ? '#9ca3af' : '#6B0E9B',
                        color: 'white',
                        border: 'none'
                      }}
                    >
                      PROCESS ORDER
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Redesigned Modern Combo Products Modal */}
        {showComboProductsModal && selectedComboOffer && (
          <div className="modern-modal-overlay" onClick={handleCloseComboProductsModal}>
            <div className="modern-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modern-modal-header">
                <h2 className="modern-modal-title">
                  {selectedComboOffer.name || 'Combo Offer Review'}
                </h2>
                <button className="modern-close-btn" onClick={handleCloseComboProductsModal} aria-label="Close">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="modern-modal-body">
                <div className="modern-table-container">
                  {selectedComboOffer.products && selectedComboOffer.products.length > 0 ? (
                    <div className="modern-table-wrapper">
                      <table className="modern-table">
                        <thead>
                          <tr>
                            <th style={{ width: '50px', textAlign: 'center' }}>#</th>
                            <th style={{ textAlign: 'left', paddingLeft: '24px' }}>Product</th>
                            <th style={{ textAlign: 'center', width: '80px' }}>Size</th>
                            <th style={{ textAlign: 'center', width: '60px' }}>Qty</th>
                            <th style={{ textAlign: 'center', width: '80px' }}>No.Qty</th>
                            <th style={{ textAlign: 'center', width: '110px' }}>Stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedComboOffer.products.map((comboProduct, index) => {
                            // Find the full product details from products list
                            const productIdToMatch = comboProduct.productId || comboProduct._id;
                            const fullProduct = products.find(p => {
                              if (!p || !p._id) return false;
                              const productId = p._id?.toString() || String(p._id);
                              const matchId = productIdToMatch?.toString() || String(productIdToMatch);
                              if (productId === matchId) return true;
                              if (productId.length === 24 && matchId.length === 24) {
                                return productId.toLowerCase() === matchId.toLowerCase();
                              }
                              return false;
                            });

                            // Get product image
                            const getProductImage = () => {
                              const productToCheck = fullProduct || comboProduct;
                              if (!productToCheck) return null;

                              let imageUrlRaw = null;
                              if (productToCheck.imageData) {
                                imageUrlRaw = typeof productToCheck.imageData === 'string'
                                  ? productToCheck.imageData
                                  : (productToCheck.imageData.url || productToCheck.imageData.path || productToCheck.imageData.src || productToCheck.imageData);
                              } else if (productToCheck.images && Array.isArray(productToCheck.images) && productToCheck.images.length > 0) {
                                const firstImage = productToCheck.images[0];
                                imageUrlRaw = typeof firstImage === 'string'
                                  ? firstImage
                                  : (firstImage.url || firstImage.path || firstImage.src || firstImage);
                              } else {
                                imageUrlRaw = productToCheck.image || productToCheck.imageUrl ||
                                  (typeof productToCheck.productImage === 'string' ? productToCheck.productImage : null) ||
                                  productToCheck.productImage?.url || productToCheck.productImage?.path || null;
                              }

                              if (!imageUrlRaw) return null;

                              let fullImageUrl = String(imageUrlRaw).trim();
                              if (!fullImageUrl) return null;

                              if (fullImageUrl.startsWith('http://') || fullImageUrl.startsWith('https://') || fullImageUrl.startsWith('data:')) {
                                return getImageSrc(fullImageUrl);
                              }

                              if (fullImageUrl.startsWith('/')) {
                                const baseUrl = config.api.baseUrl.endsWith('/')
                                  ? config.api.baseUrl.slice(0, -1)
                                  : config.api.baseUrl;
                                fullImageUrl = `${baseUrl}${fullImageUrl}`;
                              } else {
                                const baseUrl = config.api.baseUrl.endsWith('/')
                                  ? config.api.baseUrl
                                  : `${config.api.baseUrl}/`;
                                fullImageUrl = `${baseUrl}${fullImageUrl}`;
                              }

                              return getImageSrc(fullImageUrl);
                            };

                            const productImage = getProductImage();

                            // Stock Info
                            const currentStock = fullProduct?.balanceStock ?? fullProduct?.closingBalance ??
                              comboProduct?.balanceStock ?? comboProduct?.closingBalance ?? 0;
                            const stockUnit = fullProduct?.stockUnit || getProductUnitBase(fullProduct) ||
                              comboProduct?.stockUnit || getProductUnitBase(comboProduct) || 'Nos';
                            const displayUnit = getStandardizedUnit(stockUnit) || stockUnit || 'Nos';

                            const formatStockValue = (val, unit) => {
                              const num = parseFloat(val) || 0;
                              if (unit === 'Nos') return Math.floor(num);
                              if (Number.isInteger(num)) return num;
                              return num.toFixed(3).replace(/\.?0+$/, '');
                            };

                            // Variant/Size string
                            const productSize = comboProduct.productQuantity ||
                              fullProduct?.quantity ||
                              fullProduct?.sizeLabel ||
                              comboProduct?.quantity ||
                              '—';

                            const productQuantityInCombo = Number(comboProduct.quantity) || 1;

                            // No.Qty
                            let noQty = 1;
                            const productForNoQty = fullProduct || comboProduct;
                            if (productForNoQty) {
                              const rawNoQty = productForNoQty.noQty;
                              if (rawNoQty !== undefined && rawNoQty !== null && rawNoQty !== '') {
                                const parsed = Number(rawNoQty);
                                if (!isNaN(parsed) && parsed >= 0) {
                                  noQty = parsed;
                                }
                              }
                            }

                            // Calculate available stock
                            let calculatedAvailableStock = currentStock;
                            if (fullProduct && productQuantityInCombo > 0) {
                              try {
                                const stockConsumptionPerCombo = calculateConsumption(
                                  fullProduct,
                                  productQuantityInCombo,
                                  stockUnit
                                );
                                if (stockConsumptionPerCombo > 0) {
                                  calculatedAvailableStock = currentStock;
                                }
                              } catch (error) {
                                calculatedAvailableStock = currentStock;
                              }
                            }

                            const isStockLow = calculatedAvailableStock <= 0;

                            return (
                              <tr key={index}>
                                <td style={{ color: '#94a3b8', fontWeight: 500, textAlign: 'center' }}>
                                  {(index + 1).toString().padStart(2, '0')}
                                </td>
                                <td>
                                  <div className="prod-cell">
                                    {productImage ? (
                                      <img
                                        src={productImage}
                                        alt={comboProduct.productName || 'Item'}
                                        className="prod-img"
                                        onError={(e) => {
                                          e.target.style.display = 'none';
                                          if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex';
                                        }}
                                      />
                                    ) : (
                                      <div className="prod-placeholder">
                                        <span>🍽️</span>
                                      </div>
                                    )}
                                    <div className="prod-placeholder" style={{ display: 'none' }}>
                                      <span>🍽️</span>
                                    </div>
                                    <div className="prod-info">
                                      <span className="prod-name">
                                        {comboProduct.productName || fullProduct?.name || comboProduct.name || 'Unknown Item'}
                                      </span>
                                      {fullProduct?.categoryData?.name && (
                                        <span className="prod-meta">{fullProduct.categoryData.name}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="qty-badge">{productSize}</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="qty-badge highlight-qty">x{productQuantityInCombo}</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="qty-badge">{noQty}</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div className={`stock-status ${isStockLow ? 'stock-low' : 'stock-ok'}`} style={{ margin: '0 auto' }}>
                                    {isStockLow && (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="8" x2="12" y2="12"></line>
                                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                      </svg>
                                    )}
                                    {currentStock !== undefined && currentStock !== null
                                      ? `${formatStockValue(calculatedAvailableStock, displayUnit)} ${displayUnit}`
                                      : 'N/A'}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-visual">
                      <div className="empty-icon">📦</div>
                      <p>This combo offer does not contain any products yet.</p>
                      <button className="modern-close-btn" style={{ width: 'auto', padding: '0 16px', marginTop: '16px', height: '40px', borderRadius: '8px' }} onClick={handleCloseComboProductsModal}>
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TheaterLayout>
  );
};
export default OfflinePOSInterface;
