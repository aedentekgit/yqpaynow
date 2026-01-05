import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getAuthToken, autoLogin } from '@utils/authHelper';
import { getImageSrc, cacheProductImages } from '@utils/globalImageCache'; // 🚀 Instant image loading
import { calculateOrderTotals } from '@utils/orderCalculation'; // 📊 Centralized calculation
import {
  cacheProducts,
  getCachedProducts,
  cacheCategories,
  getCachedCategories,
  cacheProductImages as cacheProductImagesOffline,
  getCachedImage
} from '@utils/offlineStorage'; // 📦 Offline-first caching
import ImageUpload from '@components/ImageUpload';
import { useSettings } from '@contexts/SettingsContext'; // For notification audio
import config from '@config';
import '@styles/TheaterList.css';
import '@styles/Dashboard.css';
import '@styles/ImageUpload.css';
import '@styles/TheaterOrderInterface.css';
import '@styles/pages/theater/OnlinePOSInterface.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { subscribeToPosNotifications } from '@utils/posFirebaseNotifications';
import { calculateConsumption, getAvailableStock, isProductOutOfStock } from '@utils/stockCalculation';
import { clearCache, clearCachePattern } from '@utils/cacheUtils';

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

// Modern POS Product Card Component - Click to Add (Same as Professional POS)
const StaffProductCard = React.memo(({ product, onAddToCart, currentOrder }) => {
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

  // Get current quantity in cart using memoized quantity map
  const quantityInCart = product.quantityInCart || 0;

  // Handle card click - add one item to cart
  const handleCardClick = () => {
    if (!isOutOfStock) {
      onAddToCart(product, quantityInCart + 1);
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
  const isOutOfStock = isProductOutOfStock(availableStock, product, stockUnit);

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

  // Get price from array structure and calculate discount
  const originalPrice = product.pricing?.basePrice ?? product.sellingPrice ?? 0;
  const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
  const productPrice = discountPercentage > 0
    ? originalPrice * (1 - discountPercentage / 100)
    : originalPrice;
  const hasDiscount = discountPercentage > 0;

  // Get product image WITH INSTANT CACHE CHECK (offline-first)
  const getProductImage = () => {
    let imageUrl = null;

    // New format: images array (array structure)
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
    }
    // Old format: productImage string
    else if (product.productImage) {
      imageUrl = product.productImage;
    }

    // 🚀 INSTANT: Try offline cache first, then global cache
    if (imageUrl) {
      const cachedBase64 = getCachedImage(imageUrl);
      if (cachedBase64) {
        return cachedBase64; // Return base64 image from offline cache
      }
      // Fallback to global image cache
      return getImageSrc(imageUrl);
    }

    return null;
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
              className="img-auto-rendering"
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
          <div className={`modern-product-placeholder ${imageUrl ? 'placeholder-hidden' : 'placeholder-visible'}`}>
            <span className="placeholder-icon">🍽️</span>
          </div>
        </div>

        {/* Product Info Overlay */}
        <div className="modern-product-overlay">
          <div className="modern-product-details">
            <div className="modern-product-detail-item">
              {/* <span className="detail-label">Price</span> */}
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
        {currentStock > 0 && (
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
    // Don't show any price in offline mode (when price is 0 or product is mock)
    if (price === 0) {
      return '';
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(price);
  };

  const itemTotal = (parseFloat(item.sellingPrice) || 0) * (parseInt(item.quantity) || 0);

  return (
    <div className="pos-order-item">
      <div className="pos-item-content">
        <div className="pos-item-name">{item.name || 'Unknown Item'}</div>
        <div className="pos-item-price">₹{(() => { const val = parseFloat(item.sellingPrice) || 0; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}</div>

        <div className="pos-quantity-controls">
          <button
            className="pos-qty-btn pos-qty-minus"
            onClick={() => onUpdateQuantity(item._id, (item.quantity || 1) - 1)}
            disabled={(item.quantity || 0) <= 1}
          >
            −
          </button>
          <span className="pos-qty-display">{item.quantity || 0}</span>
          <button
            className="pos-qty-btn pos-qty-plus"
            onClick={() => onUpdateQuantity(item._id, (item.quantity || 0) + 1)}
          >
            +
          </button>
        </div>

        <div className="pos-item-total">₹{(() => { const val = parseFloat(itemTotal) || 0; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}</div>
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

// POS Interface - Modern Design with Customer Orders Management
const OnlinePOSInterface = () => {
  const { theaterId: routeTheaterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { generalSettings } = useSettings(); // Get settings for notification audio

  // Reliable theaterId extraction - Updated for POS URLs
  const urlMatch = window.location.pathname.match(/\/pos\/([^/]+)/);
  const theaterId = routeTheaterId || (urlMatch ? urlMatch[1] : null);

  // Debug theater ID extraction

  // IMMEDIATE CLEANUP - Remove any lingering UI elements from other pages
  useEffect(() => {
    const cleanup = () => {
      // Remove any stat containers that might be lingering
      const statsContainers = document.querySelectorAll('.qr-stats, .theater-stats, .product-stats, .stat-card');
      statsContainers.forEach(container => {
        if (container && container.parentNode) {
          container.style.display = 'none';
          container.remove();
        }
      });

      // Remove any floating/positioned elements
      const floatingElements = document.querySelectorAll('[style*="position: fixed"], [style*="position: absolute"][style*="z-index"]');
      floatingElements.forEach(element => {
        if (element.className.includes('stat') || element.className.includes('count')) {
          element.style.display = 'none';
        }
      });
    };

    cleanup();
    // Run cleanup again after a short delay to catch any delayed renders
    setTimeout(cleanup, 100);

    return cleanup;
  }, []);



  // State for staff ordering interface
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryMapping, setCategoryMapping] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Persistent cart state - Load from localStorage
  const [currentOrder, setCurrentOrder] = useState(() => {
    try {
      // Check both old and new localStorage keys for backward compatibility
      const savedCart = localStorage.getItem(`pos_cart_${theaterId}`) || localStorage.getItem(`online_pos_cart_${theaterId}`);
      if (savedCart) {
        const cartItems = JSON.parse(savedCart);

        return Array.isArray(cartItems) ? cartItems : [];
      }
    } catch (error) {
    }
    return [];
  });

  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderImages, setOrderImages] = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]); // Customer orders from QR code
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState([]); // Track new orders for flashing
  const isMountedRef = useRef(true);
  const isInitialLoadRef = useRef(true); // Track if this is the first load
  const hasLoadedOrdersRef = useRef(false); // Track if we've ever loaded orders

  // Performance monitoring
  usePerformanceMonitoring('TheaterOrderInterface');

  // MOUNT EFFECT - Clear flash animation state on component mount
  useEffect(() => {

    setNewOrderIds([]); // Clear any flash animations
    isInitialLoadRef.current = true; // Reset initial load flag
    hasLoadedOrdersRef.current = false; // Reset loaded flag

    return () => {

      setNewOrderIds([]); // Clear on unmount too
      hasLoadedOrdersRef.current = false;
    };
  }, []); // Empty dependency - run only on mount/unmount

  // CLEANUP FUNCTION - Clear any persistent state/CSS issues
  useEffect(() => {
    // Clear any existing overlays or persistent elements
    const existingOverlays = document.querySelectorAll('.qr-stats, .theater-stats, .product-stats');
    existingOverlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });

    // Clear any sticky positioning issues
    document.body.style.position = '';
    document.body.style.overflow = '';

    // Reset any global CSS classes that might interfere
    document.body.classList.remove('modal-open', 'no-scroll');

    return () => {
      // Cleanup on unmount
      isMountedRef.current = false;
    };
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (theaterId && currentOrder.length >= 0) {
      try {
        localStorage.setItem(`pos_cart_${theaterId}`, JSON.stringify(currentOrder));
        // Remove old key for cleanup
        localStorage.removeItem(`online_pos_cart_${theaterId}`);
      } catch (error) {
      }
    }
  }, [currentOrder, theaterId]);

  // Restore cart data when coming back from ViewCart (Edit Order functionality)
  useEffect(() => {
    if (location.state) {

      // Handle order success (clear cart and show message)
      if (location.state.orderSuccess) {
        setCurrentOrder([]);
        setCustomerName('');
        setOrderNotes('');
        setOrderImages([]);

        if (location.state.orderNumber) {
        }

        // Trigger product refresh by updating a refresh flag
        setLoading(true);
        setTimeout(() => setLoading(false), 100);
      }
      // Handle cart restoration (Edit Order functionality)
      else if (location.state.cartItems) {
        setCurrentOrder(location.state.cartItems || []);
        setCustomerName(location.state.customerName || '');
      }

      // Clear the location state to prevent re-processing on re-renders
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location.state]);

  // Refs for performance and cleanup
  // Removed abortController as it was causing "signal aborted" errors

  // Staff order management functions
  const addToOrder = useCallback((product, quantity = 1) => {
    setCurrentOrder(prevOrder => {
      const existingItem = prevOrder.find(item => item._id === product._id);

      if (quantity <= 0) {
        // Remove item if quantity is 0 or less
        return prevOrder.filter(item => item._id !== product._id);
      }

      if (existingItem) {
        // Update existing item with new quantity
        return prevOrder.map(item =>
          item._id === product._id
            ? { ...item, quantity: quantity }
            : item
        );
      } else {
        // Add new item with specified quantity
        // Extract price from array structure (pricing.basePrice) or old structure (sellingPrice)
        const originalPrice = parseFloat(product.pricing?.basePrice ?? product.sellingPrice ?? 0) || 0;
        const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;

        // Store ORIGINAL price in sellingPrice (discount will be calculated by utility)
        const sellingPrice = originalPrice;

        // Extract tax information
        const taxRate = parseFloat(product.pricing?.taxRate ?? product.taxRate) || 0;

        // Check pricing object first for gstType
        const gstTypeRaw = product.pricing?.gstType || product.gstType || 'EXCLUDE';
        const gstType = gstTypeRaw.toUpperCase().includes('INCLUDE') ? 'INCLUDE' : 'EXCLUDE';

        // Preserve product size/variant before overwriting quantity with count
        const productSize = product.size || product.productSize || product.quantity || product.sizeLabel;

        return [...prevOrder, {
          ...product,
          quantity: quantity, // This is the count (1, 2, etc.)
          size: product.size || productSize, // Preserve the size/variant
          productSize: product.productSize || productSize, // Preserve the size/variant
          sizeLabel: product.sizeLabel || productSize, // Preserve the size/variant
          sellingPrice: parseFloat(sellingPrice) || 0,
          originalPrice: parseFloat(originalPrice) || 0,
          discountPercentage: discountPercentage,
          taxRate: taxRate, // Ensure tax rate is available
          gstType: gstType, // Ensure GST type is available
          pricing: product.pricing // Keep pricing object for GST Type detection
        }];
      }
    });
  }, []);

  const updateQuantity = useCallback((productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromOrder(productId);
      return;
    }
    setCurrentOrder(prevOrder =>
      prevOrder.map(item =>
        item._id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  }, []);

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

    // Also clear from localStorage
    if (theaterId) {
      try {
        localStorage.removeItem(`pos_cart_${theaterId}`);
        localStorage.removeItem(`online_pos_cart_${theaterId}`); // Remove old key
      } catch (error) {
      }
    }
  }, [theaterId]);

  // Image handling functions
  const handleImageUpload = useCallback((imageData) => {
    setOrderImages(prev => [...prev, imageData]);
  }, []);

  const handleImageRemove = useCallback((index, imageData) => {
    setOrderImages(prev => prev.filter((_, i) => i !== index));

    // Clean up blob URL if it exists
    if (imageData.previewUrl && imageData.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageData.previewUrl);
    }
  }, []);

  // Load categories (offline-first)
  const loadCategories = useCallback(async () => {
    try {
      // Try cached first
      const cachedCats = getCachedCategories(theaterId);
      if (cachedCats) {
        // Debug: using cached categories (disabled in production to reduce noise)
        if (import.meta.env.MODE === 'development') {
        }
        const activeCategories = cachedCats.filter(cat => cat.isActive);
        const categoryNames = activeCategories.map(cat => cat.categoryName || cat.name);
        const mapping = activeCategories.reduce((map, cat) => {
          const catName = cat.categoryName || cat.name;
          map[catName] = cat._id;
          return map;
        }, {});
        setCategories(categoryNames);
        setCategoryMapping(mapping);
      } else {
        // Fallback categories if no cache
        setCategories(['SNACKS', 'BEVERAGES', 'COMBO DEALS', 'DESSERTS']);
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
              map[catName] = cat._id;
              return map;
            }, {});

            setCategories(categoryNames);
            setCategoryMapping(mapping);
          }
        }
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      // Set fallback categories on error only if we don't have any categories
      setCategories(prev => {
        if (prev.length === 0) {
          return ['SNACKS', 'BEVERAGES', 'COMBO DEALS', 'DESSERTS'];
        }
        return prev;
      });
    }
  }, [theaterId]);

  // Fetch products (offline-first)
  const fetchProducts = useCallback(async (forceRefresh = false) => {
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
      if (import.meta.env.MODE === 'development') {
      }

      if (cachedProds && cachedProds.length > 0) {
        if (import.meta.env.MODE === 'development') {
        }
        // Show cached products immediately, then fetch stock in background
        setProducts(cachedProds);
        setLoading(false);

        // Fetch stock for cached products in background (non-blocking)
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

            // Update products with stock data
            const updatedProducts = cachedProds.map(product => {
              const balanceStock = balanceStockMap.get(product._id);
              if (balanceStock !== undefined && balanceStock !== null) {
                return { ...product, balanceStock };
              }
              return product;
            });

            setProducts(updatedProducts);
          }).catch(() => {
            // Ignore errors in background stock fetch
          });
        }
      }

      // Try network if online
      if (navigator.onLine) {
        if (import.meta.env.MODE === 'development') {
        }
        let token = getAuthToken();
        if (!token) {
          token = await autoLogin();
          if (!token) {
            if (!cachedProds) {
              throw new Error('Authentication failed - unable to login');
            }
            if (import.meta.env.MODE === 'development') {
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

        // ✅ FIX: Parse JSON and check response (same logic as TheaterList.jsx)
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ [OnlinePOS] Failed to parse response JSON:', parseError);
          if (response.ok === false || (response.status && response.status >= 400)) {
            try {
              const errorText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errorText}`);
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

          // Cache product images in background (non-blocking) - use offline storage
          cacheProductImagesOffline(productList).catch(err => {
            console.warn('⚠️ [POS] Some images failed to cache:', err);
          });

          // Also cache using global image cache for compatibility
          cacheProductImages(productList).catch(err => {
            console.warn('⚠️ [POS] Some images failed to cache in global cache:', err);
          });

          // ✅ FIX: Fetch balance stock from cafe-stock API for each product BEFORE setting state
          // This ensures stock is displayed correctly from the cafe-stock API
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
          console.error('❌ [OnlinePOS] Backend returned success: false:', data);
          throw new Error(data.message || data.error || 'Failed to load products');
        } else if (response.ok === false || (response.status && response.status >= 400)) {
          // HTTP error status
          console.error('❌ [OnlinePOS] API response not OK:', response.status, data);
          throw new Error(data?.message || data?.error || `HTTP ${response.status}: Failed to load products`);
        } else {
          // Unknown error
          console.error('❌ [OnlinePOS] Unknown error:', { response, data });
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

  // Load initial data - Load categories and products (offline-first)
  useEffect(() => {
    if (theaterId) {
      // Load categories and products in parallel (both use offline-first caching)
      loadCategories();
      fetchProducts();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [theaterId, fetchProducts, loadCategories]);

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
            fetchProducts(true); // Force refresh
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
            fetchProducts(true); // Force refresh
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
            fetchProducts(true); // Force refresh
          }
        }, 100);
      }
    }

    window.addEventListener('storage', handleSalesUpdate);

    return () => {
      window.removeEventListener('storage', handleSalesUpdate);
    };
  }, [theaterId, fetchProducts]);

  // Audio context for beep sound
  const [audioContext, setAudioContext] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Initialize audio context on user interaction
  const initializeAudio = useCallback(() => {
    if (!audioContext) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);
        setAudioEnabled(true);

        return ctx;
      } catch (error) {

        return null;
      }
    }
    return audioContext;
  }, [audioContext]);

  // Function to play notification sound (MP3 from settings or fallback beep)
  const playBeepSound = useCallback(async () => {
    try {
      // Try to play custom notification audio from settings first
      if (generalSettings?.notificationAudioUrl) {
        try {
          const audio = new Audio(generalSettings.notificationAudioUrl);
          audio.volume = 0.5; // 50% volume
          await audio.play();
          return; // Success, exit early
        } catch (audioError) {
          console.warn('Custom notification audio failed, falling back to beep:', audioError);
        }
      }

      // Fallback 1: Generate beep sound using Web Audio API
      let ctx = audioContext;

      // Initialize audio context if not already done
      if (!ctx) {
        ctx = initializeAudio();
        if (!ctx) throw new Error('Audio context not available');
      }

      // Resume audio context if suspended (required by browser policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create and play beep sound
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(800, ctx.currentTime); // 800Hz beep
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);

    } catch (error) {

      // Fallback 2: Try HTML5 Audio with data URL
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBjiR1+zGeiwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQlBg==');
        audio.volume = 0.3;
        audio.play();
      } catch (fallbackError) {

        // Fallback 3: Visual notification as final fallback
        document.title = '🔔 NEW ORDER! - ' + (document.title.replace('🔔 NEW ORDER! - ', ''));
        setTimeout(() => {
          document.title = document.title.replace('🔔 NEW ORDER! - ', '');
        }, 3000);
      }
    }
  }, [audioContext, initializeAudio, generalSettings?.notificationAudioUrl]);

  // Fetch online/customer orders from theaterorders collection
  const fetchOnlineOrders = useCallback(async () => {
    if (!theaterId) return;

    try {
      setLoadingOrders(true);

      // ✅ Get today's date range (start of day to end of day)
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      // ✅ Fetch orders with today's date filter
      const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater/${theaterId}?source=qr_code&startDate=${startOfDay}&endDate=${endOfDay}&limit=100`, {
        headers: {
          'Accept': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `orders_theater_${theaterId}_today`,
        cacheTTL: 60000 // 1 minute (orders change frequently)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.orders) {

          // Filter to show ONLY online orders (customer orders with qrName or seat)
          // Exclude kiosk orders (which don't have qrName or seat)
          const onlineOnlyOrders = data.orders.filter(order =>
            (order.qrName && order.qrName.trim() !== '') ||
            (order.seat && order.seat.trim() !== '')
          );

          // Debug: Log filtered order count
          if (import.meta.env.MODE === 'development') {
          }

          // Check for new orders
          setOnlineOrders(prevOrders => {

            // Skip notifications if this is the first time loading orders
            // This covers: page refresh, initial navigation, and component mount
            if (!hasLoadedOrdersRef.current) {

              hasLoadedOrdersRef.current = true;
              isInitialLoadRef.current = false;
              return onlineOnlyOrders;
            }

            // For subsequent loads, check for genuinely new orders
            const prevOrderIds = prevOrders.map(order => order._id);
            const newOrders = onlineOnlyOrders.filter(order => !prevOrderIds.includes(order._id));


            if (newOrders.length > 0) {

              // Play beep sound for new orders
              playBeepSound();

              // Mark new orders for flashing
              const newIds = newOrders.map(order => order._id);

              setNewOrderIds(newIds);

              // Remove flashing after 5 seconds
              setTimeout(() => {

                setNewOrderIds([]);
              }, 5000);
            }

            return onlineOnlyOrders;
          });
        }
      }
    } catch (error) {
    } finally {
      setLoadingOrders(false);
    }
  }, [theaterId, playBeepSound]);

  // Track previous theaterId to detect actual theater changes vs initial mount
  const prevTheaterIdRef = useRef(null);

  // Subscribe to POS Firebase notifications for this theater (real-time updates)
  // We only use this to refresh the online order list and play a beep.
  // Printing remains a manual action to avoid auto-opening the browser print dialog.
  useEffect(() => {
    let unsubscribe = null;

    if (!theaterId) return;

    (async () => {
      unsubscribe = await subscribeToPosNotifications(theaterId, async (data) => {
        // Only handle orders that belong to this theater (defensive check)
        if (!data || !data.orderId) return;

        if (import.meta.env.MODE === 'development') {
        }

        try {
          // Play beep for the new/updated order
          await playBeepSound();
        } catch (e) {
          // ignore audio errors
        }

        // Refresh online orders immediately so POS list updates without delay
        fetchOnlineOrders();
      });
    })();

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
    // We only depend on theaterId here; fetchOnlineOrders and playBeepSound are stable useCallbacks.
  }, [theaterId]);

  // Poll for new online orders as a backup (in case Firebase/SSE misses an event)
  useEffect(() => {
    if (!theaterId) return;

    // Only reset flags if theater actually changed (not on first mount)
    if (prevTheaterIdRef.current !== null && prevTheaterIdRef.current !== theaterId) {

      isInitialLoadRef.current = true;
      hasLoadedOrdersRef.current = false;
    }

    prevTheaterIdRef.current = theaterId;

    fetchOnlineOrders(); // Initial fetch

    // Reduce polling frequency to avoid excessive network traffic.
    //  - 5000 ms = 5 seconds between requests.
    const interval = setInterval(() => {
      fetchOnlineOrders();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [theaterId, fetchOnlineOrders]);

  // Calculate order totals using centralized utility
  const orderTotals = useMemo(() => {
    return calculateOrderTotals(currentOrder);
  }, [currentOrder]);

  // Memoize quantity map for O(1) lookups
  const quantityMap = useMemo(() => {
    const map = new Map();
    currentOrder.forEach(item => {
      const id = item._id?.toString();
      if (id) {
        map.set(id, item.quantity || 0);
      }
    });
    return map;
  }, [currentOrder]);

  // Filter products by category and search, and add quantity info
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Filter by category
    if (selectedCategory && selectedCategory !== 'all') {
      const categoryId = categoryMapping[selectedCategory];

      filtered = filtered.filter(product => {
        // Products use categoryId field (ObjectId) - need to match with category _id
        const productCategoryId = product.categoryId || product.category || '';

        // Convert to string for comparison
        const categoryIdStr = String(productCategoryId);
        const selectedCategoryIdStr = String(categoryId);

        // Match by category ID
        const match = categoryIdStr === selectedCategoryIdStr;


        return match;
      });
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        (product.name || '').toLowerCase().includes(searchLower) ||
        (product.description || '').toLowerCase().includes(searchLower)
      );
    }

    // Add quantity info to each product for O(1) lookup in product cards
    return filtered.map(product => ({
      ...product,
      quantityInCart: quantityMap.get(product._id?.toString()) || 0
    }));
  }, [products, selectedCategory, searchTerm, categories, categoryMapping, quantityMap]);

  // Navigate to view-cart page with order data
  const processOrder = useCallback(() => {
    if (!currentOrder.length) {
      alert('Please add items to order');
      return;
    }

    // ✅ FIX: Optimize cart data to reduce size - only include essential fields
    const optimizedItems = currentOrder.map(item => {
      // Get image URL from product (check imageUrl first for combo items)
      let imageUrl = null;
      if (item.imageUrl) {
        imageUrl = item.imageUrl;
      } else if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const firstImage = item.images[0];
        imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
      } else if (item.productImage) {
        imageUrl = item.productImage;
      } else if (item.image) {
        imageUrl = item.image;
      } else if (item.thumbnail) {
        imageUrl = item.thumbnail;
      }

      return {
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
        taxRate: item.taxRate || item.pricing?.taxRate || 5,
        gstType: item.gstType || item.pricing?.gstType || 'EXCLUDE',
        // Include image URL for display (not full base64 to save space)
        image: imageUrl,
        productImage: imageUrl,
        imageUrl: imageUrl,
        images: imageUrl ? [imageUrl] : []
      };
    });

    // Prepare optimized cart data (without images to reduce size)
    const cartData = {
      items: optimizedItems,
      customerName: customerName.trim() || 'POS',
      notes: orderNotes.trim(),
      images: [], // Remove images to prevent storage quota issues
      subtotal: orderTotals.subtotal,
      tax: orderTotals.tax,
      total: orderTotals.total,
      totalDiscount: orderTotals.totalDiscount,
      theaterId,
      source: 'pos'
    };

    try {
      // ✅ FIX: Use React Router navigate with state (preferred - doesn't use sessionStorage)
      // This avoids sessionStorage quota issues
      navigate(`/view-cart/${theaterId}?source=pos`, {
        state: cartData
      });
      if (import.meta.env.MODE === 'development') {
      }
    } catch (error) {
      console.error('❌ Navigation error:', error);
      // Fallback: try sessionStorage (without images already)
      try {
        // Clear old cart data first to free up space
        sessionStorage.removeItem('cartData');
        sessionStorage.setItem('cartData', JSON.stringify(cartData));
        if (import.meta.env.MODE === 'development') {
        }
        window.location.href = `/view-cart/${theaterId}?source=pos`;
      } catch (storageError) {
        console.error('❌ SessionStorage failed:', storageError);
        // Last resort: navigate without state, ViewCart will show empty cart
        alert('Unable to save cart data. Please try again or reduce order size.');
        window.location.href = `/view-cart/${theaterId}?source=pos`;
      }
    }
  }, [currentOrder, customerName, orderNotes, orderImages, orderTotals, theaterId, navigate]);

  // Loading and error states - REMOVED loading screen to show UI immediately

  // Skip loading screen - show clean UI immediately
  // if (loading) { ... }

  // Only show error if we have an actual error (not just empty products)
  // Empty products should show empty state, not error
  if (error && error !== 'No products available' && products.length === 0) {
    const handleManualTokenSet = () => {
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZDkzNTdiYWE4YmMyYjYxMDFlMjk3YyIsInVzZXJUeXBlIjoidGhlYXRlcl91c2VyIiwidGhlYXRlciI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInRoZWF0ZXJJZCI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInBlcm1pc3Npb25zIjpbXSwiaWF0IjoxNzU5MTE4MzM0LCJleHAiOjE3NTkyMDQ3MzR9.gvOS5xxIlcOlgSx6D_xDH3Z_alrqdp5uMtMLOVWIEJs";
      localStorage.setItem('authToken', token);
      window.location.reload();
    };

    return (
      <TheaterLayout pageTitle="POS System">
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
                  onClick={() => window.location.reload()}
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

  return (
    <TheaterLayout pageTitle="Online POS System">
      <div className="professional-pos-content">
        {/* CSS Reset and Isolation */}
        <style>{`
          .professional-pos-content * {
            box-sizing: border-box;
          }
          .professional-pos-content .qr-stats,
          .professional-pos-content .theater-stats,
          .professional-pos-content .product-stats {
            display: none !important;
          }
          .professional-pos-content {
            isolation: isolate;
          }
          .discount-line .discount-amount {
            color: #10B981;
            font-weight: 600;
          }
          .discount-line {
            color: #10B981;
          }
        `}</style>

        {/* Main POS Layout */}
        <div className="pos-main-container">
          {/* Left Order Panel - Order Queue */}
          <div className="pos-order-section">
            <div className="pos-order-header pos-order-header-primary">
              <div>
                <h2 className="pos-order-title pos-order-title-white">
                  Online Orders ({onlineOrders.length})
                </h2>

              </div>
              <div className="flex-container">
                {!audioEnabled && (
                  <button
                    onClick={initializeAudio}
                    className="btn-enable-sound"
                    title="Click to enable new order beep sounds"
                  >
                    🔊 Enable Sound
                  </button>
                )}
              </div>
            </div>

            <div className="pos-order-content pos-order-content-scroll">
              {onlineOrders.length === 0 ? (
                <div className="pos-empty-order">
                  <div className="empty-order-icon">📱</div>
                  <h3>No Online Orders</h3>
                  <p>Customer orders from QR codes will appear here.</p>
                  <p className="text-small-gray">
                    (Kiosk orders are excluded)
                  </p>
                </div>
              ) : (
                <div className="flex-column">
                  {onlineOrders.map((order, index) => {
                    const shouldFlash = newOrderIds.includes(order._id);
                    if (index === 0) {
                    }

                    return (
                      <div
                        key={order._id || index}
                        className={`order-card ${shouldFlash ? 'new-order-flash' : ''}`}>
                        {/* 1. Order Number with Total Amount in Same Line */}
                        <div className="order-header-inner">
                          <span className="order-number">
                            {order.orderNumber || `Order #${index + 1}`}
                          </span>
                          <span className="order-total">
                            ₹{(() => { const val = order.pricing?.total || order.total || 0; return val % 1 === 0 ? val : val.toFixed(2).replace(/\.00$/, ''); })()}
                          </span>
                        </div>

                        {/* 2. Screen & Seat (Same Line) */}
                        <div className="screen-seat-container">
                          <span className="screen-seat-label">Screen & Seat:</span>
                          <span className="screen-seat-value">
                            {order.qrName || order.screenName || order.tableNumber || 'N/A'} |  {order.seat || order.seatNumber || order.customerInfo?.seat || 'N/A'}
                          </span>
                        </div>

                        {/* 3. Phone Number */}
                        {(order.customerInfo?.phoneNumber || order.customerInfo?.phone || order.customerInfo?.name) && (
                          <div className="phone-container">
                            <span className="phone-label">Phone:</span>
                            <span className="phone-value">
                              {order.customerInfo.phoneNumber || order.customerInfo.phone || order.customerInfo.name || 'N/A'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Center - Product Menu */}
          <div className="pos-menu-section">
            {/* Category Tabs - POS Style */}
            <div className="pos-category-tabs pos-category-tabs-primary">
              <button
                className={`pos-tab ${selectedCategory === 'all' ? 'active pos-tab-active' : 'pos-tab-inactive'}`}
                onClick={() => setSelectedCategory('all')}
              >
                ALL ITEMS ({products.length})
              </button>
              {categories.length > 0 ? (
                categories.map((category, index) => (
                  <button
                    key={category || `category-${index}`}
                    className={`pos-tab ${selectedCategory === category ? 'active pos-tab-active' : 'pos-tab-inactive'}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {(category || 'CATEGORY').toUpperCase()}
                  </button>
                ))
              ) : (
                <button className="pos-tab pos-tab-disabled" disabled>
                  Loading Categories...
                </button>
              )}
            </div>

            {/* Products Grid - Professional POS Style */}
            <div className="pos-products-grid">
              {products.length === 0 ? (
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
                filteredProducts.map((product, index) => (
                  <StaffProductCard
                    key={product._id || `product-${index}`}
                    product={product}
                    onAddToCart={addToOrder}
                    currentOrder={currentOrder}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right Side - Order Panel - POS Style */}
          <div className="pos-order-section">
            <div className="pos-order-header pos-order-header-primary">
              <h2 className="pos-order-title pos-order-title-white">
                Current Order ({currentOrder.length})
              </h2>
              {currentOrder.length > 0 && (
                <button
                  className="pos-clear-btn btn-clear-order"
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
                    {currentOrder.map((item, index) => (
                      <StaffOrderItem
                        key={item._id || `order-item-${index}`}
                        item={item}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeFromOrder}
                      />
                    ))}
                  </div>

                  {/* Order Notes - POS Style */}
                  <div className="pos-order-notes">
                    <textarea
                      placeholder="Add order notes..."
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      className="pos-notes-textarea"
                      rows="3"
                    />
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
                      className="pos-process-btn btn-process-order"
                      onClick={processOrder}
                      disabled={currentOrder.length === 0}
                    >
                      PROCESS ORDER
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </TheaterLayout>
  );
};

export default OnlinePOSInterface;
