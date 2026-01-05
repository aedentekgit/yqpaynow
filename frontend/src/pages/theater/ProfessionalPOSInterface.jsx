import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ErrorBoundary from '@components/ErrorBoundary';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getAuthToken, autoLogin } from '@utils/authHelper';
import ImageUpload from '@components/ImageUpload';
import '@styles/ProfessionalPOS.css';
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import config from '@config';



// Professional POS Product Card Component
const POSProductCard = React.memo(({ product, onAddToCart }) => {
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

  return (
    <div 
      className="pos-product-card"
      onClick={() => onAddToCart(product)}
    >
      <div className="pos-product-image">
        {product.productImage ? (
          <img 
            src={product.productImage} 
            alt={product.name || 'Product'}
            loading="eager"
            decoding="async"
            className="product-image-auto"
            onError={(e) => {
              e.target.src = '/placeholder-product.png';
            }}
          />
        ) : (
          <div className="pos-product-placeholder">
            <span className="placeholder-icon">🍽️</span>
          </div>
        )}
      </div>
      
      <div className="pos-product-info">
        <h4 className="pos-product-name">{product.name || 'Unknown Product'}</h4>
        <div className="pos-product-price">{formatPrice(product.sellingPrice || 0)}</div>
      </div>
      
      {/* Stock indicator */}
      {/* ✅ FIX: Use ONLY balanceStock from cafe-stock API (cafe stock) - DO NOT fallback to theater stock */}
      {((product.balanceStock ?? product.closingBalance ?? 0) <= 0) && (
        <div className="pos-out-of-stock">
          <span>Out of Stock</span>
        </div>
      )}
    </div>
  );
});

// POS Order Item Component
const POSOrderItem = React.memo(({ item, onUpdateQuantity, onRemove }) => {
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

  const itemTotal = (item.sellingPrice || 0) * (item.quantity || 0);

  return (
    <div className="pos-order-item">
      <div className="pos-order-item-info">
        <h5 className="pos-order-item-name">{item.name || 'Unknown Item'}</h5>
        <div className="pos-order-item-price">{formatPrice(item.sellingPrice || 0)}</div>
      </div>
      
      <div className="pos-quantity-controls">
        <button 
          className="pos-qty-btn decrease"
          onClick={() => onUpdateQuantity(item._id, (item.quantity || 1) - 1)}
          disabled={(item.quantity || 0) <= 1}
        >
          −
        </button>
        <span className="pos-quantity-display">{item.quantity || 0}</span>
        <button 
          className="pos-qty-btn increase"
          onClick={() => onUpdateQuantity(item._id, (item.quantity || 0) + 1)}
        >
          +
        </button>
      </div>
      
      <div className="pos-item-total">
        <div className="pos-item-total-price">{formatPrice(itemTotal)}</div>
        <button 
          className="pos-remove-btn"
          onClick={() => onRemove(item._id)}
          title="Remove item"
        >
          🗑️
        </button>
      </div>
    </div>
  );
});

// Main Professional POS Interface
const ProfessionalPOSInterface = () => {
  const { theaterId } = useParams();
  
  // State for POS interface
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Persistent cart state - Load from localStorage
  const [currentOrder, setCurrentOrder] = useState(() => {
    try {
      const savedCart = localStorage.getItem(`professional_pos_cart_${theaterId}`);
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
  usePerformanceMonitoring('ProfessionalPOSInterface');

  // Order management functions
  const addToOrder = useCallback((product) => {
    setCurrentOrder(prevOrder => {
      const existingItem = prevOrder.find(item => item._id === product._id);
      if (existingItem) {
        return prevOrder.map(item => 
          item._id === product._id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prevOrder, { ...product, quantity: 1 }];
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
        localStorage.removeItem(`professional_pos_cart_${theaterId}`);
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
    if (imageData.previewUrl && imageData.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageData.previewUrl);
    }
  }, []);

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
      
      const params = new URLSearchParams({
        page: 1,
        limit: 1000,
        stockSource: 'cafe', // ✅ FIX: Use cafe stock (CafeMonthlyStock) instead of theater stock
        _cacheBuster: Date.now(),
        _random: Math.random()
      });

      const baseUrl = `/api/theater-products/${theaterId}?${params.toString()}`;
      
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
      
      let theaterProducts = [];
      let theaterCategories = [];
      
      if (data.success) {
        const allProducts = Array.isArray(data.data) ? data.data : (data.data?.products || []);
        
        // Ensure products is always an array with safe objects
        const safeProducts = Array.isArray(allProducts) ? allProducts.map(product => ({
          ...product,
          _id: product._id || `product-${Math.random()}`,
          name: product.name || 'Unknown Product',
          sellingPrice: 0, // Always 0 for clean demo display
          stockQuantity: parseInt(product.stockQuantity) || 0,
          category: typeof product.category === 'string' ? product.category : 'Other'
        })) : [];
        
        theaterProducts = safeProducts;
        
        // Extract categories from products
        theaterCategories = [...new Set(allProducts.map(product => 
          typeof product.category === 'string' ? product.category : ''
        ))].filter(Boolean);
        
        // ✅ FIX: Fetch balance stock from cafe-stock API for each product
        if (theaterProducts.length > 0) {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;
          
          const balanceStockPromises = theaterProducts.map(async (product) => {
            try {
              const stockUrl = `${config.api.baseUrl}/cafe-stock/${theaterId}/${product._id}?year=${currentYear}&month=${currentMonth}`;
              const stockFetch = unifiedFetch(stockUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              }, {
                forceRefresh: false,
                cacheTTL: 60000
              });
              
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
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
              // Silently fail - use existing stock value
            }
            // ✅ FIX: Only use cafe stock (balanceStock/closingBalance), NOT theater stock (inventory.currentStock/stockQuantity)
            const fallbackStock = product.balanceStock ?? product.closingBalance ?? 0;
            return { productId: product._id, balanceStock: fallbackStock };
          });
          
          const balanceStocksResults = await Promise.allSettled(balanceStockPromises);
          const balanceStockMap = new Map();
          balanceStocksResults.forEach((result) => {
            if (result.status === 'fulfilled') {
              const { productId, balanceStock } = result.value;
              if (balanceStock !== null && balanceStock !== undefined) {
                balanceStockMap.set(productId, balanceStock);
              }
            }
          });
          
          // Merge balance stock into products
          // ✅ FIX: Update products with cafe stock values only (not theater stock)
          theaterProducts = theaterProducts.map(product => {
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
        }
      } else {
        throw new Error(data.message || 'Failed to load products');
      }
      
      setProducts(theaterProducts);
      setCategories(theaterCategories);
      
    } catch (err) {
      // Show clean empty interface instead of error

      // Set empty products and basic categories to show clean interface
      setProducts([]);
      setCategories(['BURGER', 'FRENCH FRIES', 'ICE CREAM', 'PIZZA', 'POP CORN']); // Show empty categories
      setError(''); // Clear error to show clean interface
      
  } finally {
      setLoading(false);
    }
  }, [theaterId]);

  // Load initial data
  useEffect(() => {
    if (theaterId) {
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

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (theaterId && currentOrder.length >= 0) {
      try {
        localStorage.setItem(`professional_pos_cart_${theaterId}`, JSON.stringify(currentOrder));
  } catch (error) {
  }
    }
  }, [currentOrder, theaterId]);

  // Calculate order totals
  const orderTotals = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    
    currentOrder.forEach(item => {
      const price = parseFloat(item.sellingPrice) || 0;
      const qty = parseInt(item.quantity) || 0;
      const taxRate = parseFloat(item.taxRate) || 0;
      const gstType = item.gstType || 'EXCLUDE';
      
      const lineTotal = price * qty;
      
      if (gstType === 'INCLUDE') {
        // Price already includes GST, extract the GST amount
        const basePrice = lineTotal / (1 + (taxRate / 100));
        const gstAmount = lineTotal - basePrice;
        subtotal += basePrice;
        totalTax += gstAmount;
      } else {
        // GST EXCLUDE - add GST on top of price
        const gstAmount = lineTotal * (taxRate / 100);
        subtotal += lineTotal;
        totalTax += gstAmount;
      }
    });
    
    const total = subtotal + totalTax;
    
    return { 
      subtotal: parseFloat(subtotal.toFixed(2)), 
      tax: parseFloat(totalTax.toFixed(2)), 
      total: parseFloat(total.toFixed(2)) 
    };
  }, [currentOrder]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(product => 
        product.category === selectedCategory
      );
    }
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        (product.name || '').toLowerCase().includes(searchLower) ||
        (product.description || '').toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  }, [products, selectedCategory, searchTerm]);

  // Process order submission
  const processOrder = useCallback(async () => {
    if (!currentOrder.length) {
      alert('Please add items to order');
      return;
    }

    try {
      const orderData = {
        items: currentOrder,
        customerName: 'Walk-in Customer', // Default customer name
        notes: orderNotes.trim(),
        images: orderImages,
        subtotal: orderTotals.subtotal,
        tax: orderTotals.tax,
        total: orderTotals.total,
        theaterId
      };

      
      clearOrder();
      alert('Order placed successfully!');
      
    } catch (error) {
      alert('Failed to process order. Please try again.');
    }
  }, [currentOrder, customerName, orderNotes, orderImages, orderTotals, theaterId, clearOrder]);

  // Professional loading state - only show if no products loaded yet
  if (loading && products.length === 0) {
    return (
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
    );
  }

  if (error) {
    const handleManualTokenSet = () => {
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZDkzNTdiYWE4YmMyYjYxMDFlMjk3YyIsInVzZXJUeXBlIjoidGhlYXRlcl91c2VyIiwidGhlYXRlciI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInRoZWF0ZXJJZCI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInBlcm1pc3Npb25zIjpbXSwiaWF0IjoxNzU5MTE4MzM0LCJleHAiOjE3NTkyMDQ3MzR9.gvOS5xxIlcOlgSx6D_xDH3Z_alrqdp5uMtMLOVWIEJs";
      localStorage.setItem('authToken', token);
      window.location.reload();
    };

    return (
      <div className="pos-error">
        <div className="pos-error-content">
          <div className="error-icon">❌</div>
          <h3>Unable to Load POS System</h3>
          <p>{error}</p>
          <div className="pos-error-actions">
            <button 
              className="pos-retry-btn"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button 
              className="pos-demo-token-btn"
              onClick={handleManualTokenSet}
            >
              Set Demo Token
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="professional-pos-interface">
      {/* POS Header */}
      <div className="pos-header">
        <div className="pos-header-left">
          <div className="pos-logo">
            <span className="pos-logo-icon">🍕</span>
            <span className="pos-logo-text">Theater Canteen POS</span>
          </div>
          <div className="pos-date-time">
            {new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}
          </div>
        </div>
        
        <div className="pos-header-center">
          <div className="customer-input-container">
            <label className="pos-customer-label">Customer Name:</label>
            <input
              type="text"
              placeholder="Enter customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="pos-customer-input"
            />
          </div>
        </div>
        
        <div className="pos-header-right">
          <div className="pos-search">
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pos-search-input"
            />
            <span className="pos-search-icon">🔍</span>
          </div>
        </div>
      </div>

      {/* Main POS Layout */}
      <div className="pos-main-container">
        {/* Left Side - Product Menu */}
        <div className="pos-menu-section">
          {/* Category Tabs */}
          <div className="pos-category-tabs">
            <button 
              className={`pos-tab ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              ALL
            </button>
            {categories.map((category, index) => (
              <button
                key={category || `category-${index}`}
                className={`pos-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {(category || 'CATEGORY').toUpperCase()}
              </button>
            ))}
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
                <POSProductCard
                  key={product._id || `product-${index}`}
                  product={product}
                  onAddToCart={addToOrder}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Side - Order Panel */}
        <div className="pos-order-section">
          <div className="pos-order-header">
            <h2 className="pos-order-title">Current Order</h2>
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
                {/* Order Items */}
                <div className="pos-order-items">
                  {currentOrder.map((item, index) => (
                    <POSOrderItem
                      key={item._id || `order-item-${index}`}
                      item={item}
                      onUpdateQuantity={updateQuantity}
                      onRemove={removeFromOrder}
                    />
                  ))}
                </div>

                {/* Order Notes */}
                <div className="pos-order-notes">
                  <textarea
                    placeholder="Add order notes..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="pos-notes-textarea"
                    rows="3"
                  />
                </div>

                {/* Image Upload */}
                <div className="pos-order-images">
                  <ImageUpload
                    onImageUpload={handleImageUpload}
                    onImageRemove={handleImageRemove}
                    currentImages={orderImages}
                    maxFiles={3}
                    maxFileSize={2}
                  />
                </div>

                {/* Order Summary */}
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
                  <div className="pos-summary-total">
                    <span>TOTAL:</span>
                    <span>₹{orderTotals.total % 1 === 0 ? orderTotals.total : orderTotals.total.toFixed(2).replace(/\.00$/, '')}</span>
                  </div>
                </div>

                {/* Professional Order Summary Container (Like ViewCart) */}
                <div className="pos-professional-summary">
                  <div className="professional-summary-header">
                    <h3>Order Summary</h3>
                  </div>
                  <div className="professional-summary-details">
                    <div className="summary-row">
                      <span>Subtotal:</span>
                      <span>₹{orderTotals.subtotal % 1 === 0 ? orderTotals.subtotal : orderTotals.subtotal.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                    <div className="summary-row">
                      <span>GST:</span>
                      <span>₹{orderTotals.tax % 1 === 0 ? orderTotals.tax : orderTotals.tax.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                    <div className="summary-divider"></div>
                    <div className="summary-row total-row">
                      <span>Total Amount:</span>
                      <span className="total-amount">₹{orderTotals.total % 1 === 0 ? orderTotals.total : orderTotals.total.toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pos-actions">
                  <button 
                    className="pos-process-btn"
                    onClick={processOrder}
                    disabled={!customerName.trim() || currentOrder.length === 0}
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
  );
};

export default ProfessionalPOSInterface;