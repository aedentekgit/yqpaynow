import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getAuthToken, autoLogin } from '@utils/authHelper';
import { cacheProductImages, getImageSrc } from '@utils/globalImageCache'; // 🎨 Batch product image caching + instant image loading
import { calculateOrderTotals } from '@utils/orderCalculation'; // 🧮 Centralized order calculation
import ImageUpload from '@components/ImageUpload';
import config from '@config';
import '@styles/TheaterList.css';
import '@styles/Dashboard.css';
import '@styles/ImageUpload.css';
import '@styles/TheaterOrderInterface.css';
import '@styles/pages/theater/TheaterOrderInterface.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



// Modern POS Product Card Component - Click to Add
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
  const isOutOfStock = currentStock <= 0 || !product.isActive || !product.isAvailable;

  // Get price from array structure and calculate discount
  const originalPrice = product.pricing?.basePrice ?? product.sellingPrice ?? 0;
  const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
  const productPrice = discountPercentage > 0 
    ? originalPrice * (1 - discountPercentage / 100)
    : originalPrice;
  const hasDiscount = discountPercentage > 0;

  // Get product image WITH INSTANT CACHE CHECK
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
    
    // 🚀 INSTANT: Return cached base64 if available, otherwise original URL
    return imageUrl ? getImageSrc(imageUrl) : null;
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
  const discountPercentage = parseFloat(item.discountPercentage) || 0;
  const itemTotal = sellingPrice * quantity;

  return (
    <div className="pos-order-item">
      <div className="pos-item-content">
        <div className="pos-item-info">
          <div className="pos-item-name">{item.name || 'Unknown Item'}</div>
          {discountPercentage > 0 && (
            <div className="pos-item-discount">
              🎉 {discountPercentage}% OFF
            </div>
          )}
        </div>
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

// Main Theater Staff Ordering Interface - Canteen Staff Use Only
// 🚀 OPTIMIZED: Memoized component to prevent unnecessary re-renders
const TheaterOrderInterface = React.memo(() => {
  const { theaterId: routeTheaterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Reliable theaterId extraction
  const urlMatch = window.location.pathname.match(/\/theater-order\/([^/]+)/);
  const theaterId = routeTheaterId || (urlMatch ? urlMatch[1] : null);
  
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
      const savedCart = localStorage.getItem(`theater_pos_cart_${theaterId}`);
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
  const isMountedRef = useRef(true);
  
  // Performance monitoring
  usePerformanceMonitoring('TheaterOrderInterface');

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
        localStorage.setItem(`theater_pos_cart_${theaterId}`, JSON.stringify(currentOrder));
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
        const originalPrice = product.pricing?.basePrice ?? product.sellingPrice ?? 0;
        const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
        
        // ✅ FIX: Store ORIGINAL price, not discounted price
        // The discount will be applied during calculation
        const sellingPrice = originalPrice;
        
        // Extract tax information
        const taxRate = parseFloat(product.pricing?.taxRate ?? product.taxRate) || 0;
        
        // Normalize GST Type - check both root level and pricing object
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
          sellingPrice: sellingPrice, // Store ORIGINAL price
          originalPrice: originalPrice, // Keep original for reference
          discountPercentage: discountPercentage, // Discount % will be applied in calculation
          taxRate: taxRate, // Ensure tax rate is available
          gstType: gstType // Normalized GST type (INCLUDE or EXCLUDE)
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
        localStorage.removeItem(`theater_pos_cart_${theaterId}`);
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

  // Load categories from theater-categories API
  const loadCategories = useCallback(async () => {
    try {
      let authToken = getAuthToken();
      if (!authToken) {
        authToken = await autoLogin();
        if (!authToken) {
          return;
        }
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
          // The API returns data.categories array, not data directly
          const categoryList = categoriesData.data.categories || categoriesData.data;
          const activeCategories = categoryList.filter(cat => cat.isActive);
          
          // Store both category names for display and full category objects for filtering
          // API returns categoryName field, not name
          const categoryNames = activeCategories.map(cat => cat.categoryName || cat.name);
          

          const mapping = activeCategories.reduce((map, cat) => {
            const catName = cat.categoryName || cat.name;
            map[catName] = cat._id;
            return map;
          }, {});
          
          
          setCategories(categoryNames);
          setCategoryMapping(mapping);
          
          // Debug: Check products after categories are loaded
          setTimeout(() => {

            if (products.length > 0) {

              products.forEach(product => {
  });
            }
          }, 1000);
        }
      } else {
  }
    } catch (error) {
  }
  }, [theaterId]);

  const fetchProducts = useCallback(async () => {
    
    if (!theaterId) {
      setError('Theater ID not available');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      // Check for auth token, auto-login if needed
      let authToken = getAuthToken();
      if (!authToken) {
        authToken = await autoLogin();
        if (!authToken) {
          throw new Error('Authentication failed - unable to login');
        }
      }
      
      // ✅ FIX: POS interfaces should use cafe stock, not theater stock
      const params = new URLSearchParams({
        page: 1,
        limit: 100, // API max limit is 100
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
        cacheKey: `theater_products_${theaterId}_${params.toString()}`,
        cacheTTL: 300000 // 5 minutes
      });

           
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Process response data - mirror the working components' logic
      let theaterProducts = [];
      
      if (data.success) {
        // Handle both API response formats (same as Product Management page)
        const allProducts = Array.isArray(data.data) ? data.data : (data.data?.products || []);
        theaterProducts = allProducts; // Show all products, but inactive ones will appear as "Out of Stock"
        
  } else {

        throw new Error(data.message || 'Failed to load products');
      }
      

      // Ensure products is always an array with safe objects
      const safeProducts = Array.isArray(theaterProducts) ? theaterProducts.map((product, index) => {
        let assignedCategory = product.category;
        
        // If no category assigned, assign based on product name as a temporary fix
        if (!assignedCategory || assignedCategory === 'Other' || assignedCategory === '') {
          // Simple category assignment logic based on product name
          const name = (product.name || '').toLowerCase();
          if (name.includes('grain') || name.includes('cereal') || name.includes('snack')) {
            assignedCategory = 'Snacks'; // Will be converted to ObjectId later
          } else if (name.includes('test') && name.includes('product')) {
            assignedCategory = 'Beverages1'; // Will be converted to ObjectId later  
          } else if (name.includes('test911')) {
            assignedCategory = 'Drinks'; // Will be converted to ObjectId later
          } else {
            // Distribute evenly if we can't determine from name
            const categories = ['Snacks', 'Drinks', 'Beverages1'];
            assignedCategory = categories[index % categories.length];
          }
  }
        
        return {
          ...product,
          _id: product._id || `product-${Math.random()}`,
          name: product.name || 'Unknown Product',
          sellingPrice: 0, // Always 0 for clean demo display
          stockQuantity: parseInt(product.stockQuantity) || 0,
          category: assignedCategory
        };
      }) : [];
      
      setProducts(safeProducts);

      // 🎨 AUTO-CACHE ALL PRODUCT IMAGES (LIKE OFFLINE POS)
      if (safeProducts.length > 0) {
        cacheProductImages(safeProducts).catch(err => {
          console.error('Error caching product images:', err);
        });
      }

      // Check if products have null/undefined categories
      const productsWithoutCategory = safeProducts.filter(p => !p.category || p.category === 'Other');
      
      // Load categories separately
      await loadCategories();

      // Cache the data
      try {
        const cacheKey = `orderInterfaceData_${theaterId}`;
        sessionStorage.setItem(cacheKey, JSON.stringify({
          products: safeProducts,
          categories: categories,
          categoryMapping: categoryMapping,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.error('Failed to cache data:', e);
      }
      
    } catch (err) {
      // Show clean empty interface instead of error

      // Set empty products and basic categories to show clean interface
      setProducts([]);
      setCategories(['Snacks', 'Beverages', 'Combo Deals', 'Desserts']); // Show empty categories
      setError(''); // Clear error to show clean interface
      
  } finally {

      setLoading(false);
  }
  }, [theaterId]);

  // Load initial data - simplified without abort controller
  useEffect(() => {

    // FORCE STATE CLEANUP on component mount
    setProducts([]);
    setCategories([]);
    setCategoryMapping({});
    setSelectedCategory('all');
    setSearchTerm('');
    setError('');
    
    if (theaterId) {
      // Try to load from cache first for instant display
      const cacheKey = `orderInterfaceData_${theaterId}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const cacheAge = Date.now() - cachedData.timestamp;
          // Use cache if less than 2 minutes old
          if (cacheAge < 120000) {
            setProducts(cachedData.products || []);
            setCategories(cachedData.categories || []);
            setCategoryMapping(cachedData.categoryMapping || {});
            setLoading(false);
            
            // Fetch fresh data in background to update cache
            setTimeout(() => fetchProducts(), 100);
            return;
          }
        } catch (e) {
          console.error('Cache parse error:', e);
        }
      }

      // No valid cache, add delay and fetch
      const timer = setTimeout(() => {
        fetchProducts();
      }, 100);
      
      return () => {
        clearTimeout(timer);
        isMountedRef.current = false;
      };
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [theaterId, fetchProducts]);

  // Calculate order totals using centralized calculation utility
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

  // Navigate to View Cart page with order data
  const processOrder = useCallback(() => {
    if (!currentOrder.length) {
      alert('Please add items to order');
      return;
    }

    // Prepare cart data to pass to ViewCart page
    const cartData = {
      items: currentOrder,
      customerName: 'POS', // Default customer name
      notes: orderNotes.trim(),
      images: orderImages,
      subtotal: orderTotals.subtotal,
      tax: orderTotals.tax,
      total: orderTotals.total,
      totalDiscount: orderTotals.totalDiscount,
      theaterId
    };

    try {
      // Try to store cart data in sessionStorage, but don't fail if quota exceeded
      try {
        // Optimize cart data to reduce size - remove unnecessary fields
        const optimizedCartData = {
          items: currentOrder.map(item => ({
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
            sellingPrice: item.sellingPrice,
            discountPercentage: item.discountPercentage,
            taxRate: item.taxRate,
            gstType: item.gstType
          })),
          customerName: cartData.customerName,
          notes: cartData.notes,
          images: cartData.images,
          subtotal: cartData.subtotal,
          tax: cartData.tax,
          total: cartData.total,
          totalDiscount: cartData.totalDiscount,
          theaterId: cartData.theaterId
        };
        sessionStorage.setItem('cartData', JSON.stringify(optimizedCartData));
      } catch (storageError) {
        // If storage fails (quota exceeded), log but continue with navigation
        console.warn('Failed to save cart data to sessionStorage:', storageError);
        // Try to clear old data and retry once
        try {
          sessionStorage.removeItem('cartData');
          const optimizedCartData = {
            items: currentOrder.map(item => ({
              _id: item._id,
              name: item.name,
              quantity: item.quantity,
              // ✅ Include size/variant information for display in cart
              size: item.size || item.productSize || item.quantity || item.sizeLabel || null,
              productSize: item.productSize || item.size || item.quantity || item.sizeLabel || null,
              sizeLabel: item.sizeLabel || item.size || item.productSize || item.quantity || null,
              variant: item.variant || null,
              variants: item.variants || null,
              sellingPrice: item.sellingPrice,
              discountPercentage: item.discountPercentage,
              taxRate: item.taxRate,
              gstType: item.gstType
            })),
            customerName: cartData.customerName,
            notes: cartData.notes,
            images: cartData.images,
            subtotal: cartData.subtotal,
            tax: cartData.tax,
            total: cartData.total,
            totalDiscount: cartData.totalDiscount,
            theaterId: cartData.theaterId
          };
          sessionStorage.setItem('cartData', JSON.stringify(optimizedCartData));
        } catch (retryError) {
          console.warn('Retry also failed, continuing without storage:', retryError);
        }
      }
      
      // Try React Router navigation first
      if (navigate && typeof navigate === 'function') {
        navigate(`/view-cart/${theaterId}`, { 
          state: { ...cartData, source: 'order-interface' }
        });
      } else {
        // Fallback to window.location
        window.location.href = `/view-cart/${theaterId}?source=order-interface`;
      }
    } catch (error) {
      console.error('Navigation error:', error);
      // Final fallback - always navigate even if everything else fails
      window.location.href = `/view-cart/${theaterId}?source=order-interface`;
    }
  }, [currentOrder, orderNotes, orderImages, orderTotals, theaterId, navigate]);

  // Loading and error states
  
  // Skip loading screen - show clean UI immediately
  // if (loading) { ... }

  if (error) {
    const handleManualTokenSet = () => {
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZDkzNTdiYWE4YmMyYjYxMDFlMjk3YyIsInVzZXJUeXBlIjoidGhlYXRlcl91c2VyIiwidGhlYXRlciI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInRoZWF0ZXJJZCI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInBlcm1pc3Npb25zIjpbXSwiaWF0IjoxNzU5MTE4MzM0LCJleHAiOjE3NTkyMDQ3MzR9.gvOS5xxIlcOlgSx6D_xDH3Z_alrqdp5uMtMLOVWIEJs";
      localStorage.setItem('authToken', token);
      window.location.reload();
    };

    return (
      <TheaterLayout pageTitle="Staff Order Interface">
        <ErrorBoundary>
          <div className="staff-error-container">
            <div className="error-icon">❌</div>
            <h3>Unable to Load Menu</h3>
            <p>{error}</p>
            <div className="action-buttons-container">
              <button 
                className="retry-button action-button-spacing"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
              <button 
                className="retry-button action-button-primary"
                onClick={handleManualTokenSet}
              >
                Set Demo Token
              </button>
            </div>
          </div>
        </ErrorBoundary>
      </TheaterLayout>
    );
  }

  return (
    <TheaterLayout pageTitle="Professional POS System">
      <div className="professional-pos-content">
        {/* CSS Reset and Isolation */}
        <style jsx>{`
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
          {/* Left Side - Product Menu */}
          <div className="pos-menu-section">
            {/* Category Tabs - POS Style */}
            <div className="pos-category-tabs">
              <button 
                className={`pos-tab ${selectedCategory === 'all' ? 'active pos-tab-active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                ALL ITEMS ({products.length})
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
              ) : (
                <button className="pos-tab pos-tab-disabled" disabled>
                  Loading Categories...
                </button>
              )}
            </div>

            {/* Products Grid - Professional POS Style */}
            <div className="pos-products-grid">
              {filteredProducts.length === 0 ? (
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
                    <div className="pos-summary-line">
                      <span>Tax (GST):</span>
                      <span>₹{orderTotals.tax % 1 === 0 ? orderTotals.tax : orderTotals.tax.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
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
                      onClick={processOrder}
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
      </div>
    </TheaterLayout>
  );
});

TheaterOrderInterface.displayName = 'TheaterOrderInterface';

export default TheaterOrderInterface;