import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '@config';
import { getCachedData, setCachedData } from '@utils/cacheUtils';
import InstantImage from '@components/InstantImage'; // 🚀 INSTANT image loading
import { cacheProductImages, getImageSrc } from '@utils/globalImageCache'; // 🎨 Batch product image caching
import '@styles/pages/theater/SimpleProductList.css'; // Extracted inline styles
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import useStockValidation from '@hooks/useStockValidation';
import { validateComboStockAvailability } from '@utils/comboStockValidation';
import { calculateConsumption } from '@utils/stockCalculation';

// ✅ Extract unit from quantity string (e.g., "150 ML" → "ML")
const extractUnitFromQuantity = (quantity) => {
  if (!quantity) return null;
  const quantityStr = String(quantity).trim();
  if (!quantityStr) return null;
  const quantityLower = quantityStr.toLowerCase();

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

const SimpleProductList = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [productsForValidation, setProductsForValidation] = useState([]); // Products with stock data for validation
  const [kioskTypes, setKioskTypes] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theaterName, setTheaterName] = useState('');
  const [theaterLogo, setTheaterLogo] = useState('');
  const [bannerImage, setBannerImage] = useState(''); // Keep for backward compatibility
  const [banners, setBanners] = useState([]); // Array of banners for carousel
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [comboOffers, setComboOffers] = useState([]);

  // Category images state (from Settings > Images)
  const [categoryImages, setCategoryImages] = useState({
    all: null,
    combo: null
  });

  // Kiosk banner from settings (fallback if theater has no banner)
  const [kioskBannerFromSettings, setKioskBannerFromSettings] = useState(null);

  // Combo products modal state
  const [showComboProductsModal, setShowComboProductsModal] = useState(false);
  const [selectedComboOffer, setSelectedComboOffer] = useState(null);

  // Initialize stock validation hook
  const { validateStockAvailability, isOutOfStock } = useStockValidation(cart, productsForValidation);

  // Set browser title
  useEffect(() => {
    document.title = 'Menu - YQPayNow';
  }, []);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem(`kioskCart_${theaterId}`);
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        localStorage.removeItem(`kioskCart_${theaterId}`);
      }
    }
  }, [theaterId]);

  // Fetch theater name, kiosk types, and products
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          setError('No authentication token found');
          setLoading(false);
          return;
        }

        // Try to load from cache first for instant display
        const cacheKey = `kioskData_${theaterId}`;
        const cached = getCachedData(cacheKey);
        if (cached) {
          setTheaterName(cached.theaterName);
          setTheaterLogo(cached.theaterLogo);
          setBannerImage(cached.bannerImage);
          setBanners(cached.banners || []); // Load cached banners
          setKioskTypes(cached.kioskTypes);
          setProducts(cached.products);
          setComboOffers(cached.comboOffers || []);
          setProductsForValidation(cached.products || []);
          setLoading(false);
          document.title = `Menu - ${cached.theaterName}`;

          // Fetch fresh data in background to update cache
          fetchFreshData(token, theaterId, cacheKey);
          return;
        }

        // No valid cache, fetch fresh data
        await fetchFreshData(token, theaterId, cacheKey);

      } catch (err) {
        setError(`Failed to load: ${err.message}`);
        setLoading(false);
      }
    };

    const fetchFreshData = async (token, theaterId, cacheKey) => {
      // Set timeout for the entire fetch operation
      // Set timeout for the entire fetch operation
      const timeoutId = setTimeout(() => {
        setError('Request timeout - please refresh');
        setLoading(false);
      }, 30000); // 30 seconds timeout

        // ✅ FIX: Fetch all data in parallel with proper error handling
        // Each fetch has its own catch to prevent one failure from breaking others
        const [theaterResponse, bannerResponse, kioskTypesResponse, productsResponse, comboOffersResponse] = await Promise.all([
        unifiedFetch(`${config.api.baseUrl}/theater-dashboard/${theaterId}`, {
          headers: { 'Content-Type': 'application/json' }
        }, {
          cacheKey: `theater_dashboard_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        }).catch((err) => {
          console.warn('Failed to fetch theater dashboard:', err);
          return null;
        }),
        unifiedFetch(`${config.api.baseUrl}/theater-banners/${theaterId}`, {
          headers: { 'Content-Type': 'application/json' }
        }, {
          cacheKey: `theater_banners_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        }).catch((err) => {
          console.warn('Failed to fetch banners:', err);
          return null;
        }),
        unifiedFetch(`${config.api.baseUrl}/theater-kiosk-types/${theaterId}`, {
          headers: { 'Content-Type': 'application/json' }
        }, {
          cacheKey: `theater_kiosk_types_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        }).catch((err) => {
          console.warn('Failed to fetch kiosk types:', err);
          return null;
        }),
        unifiedFetch(config.helpers.getApiUrl(`/theater-products/${theaterId}?stockSource=cafe`), {
          headers: { 'Content-Type': 'application/json' }
        }, {
          cacheKey: `theater_products_${theaterId}_cafe`,
          cacheTTL: 300000 // 5 minutes
        }).catch((err) => {
          console.error('Failed to fetch products:', err);
          // ✅ FIX: Return a response-like object to prevent "body stream already read" error
          return { ok: false, status: 0, statusText: err.message || 'Network error' };
        }),
        unifiedFetch(`${config.api.baseUrl}/combo-offers/${theaterId}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }, {
          cacheKey: `combo_offers_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        }).catch((err) => {
          console.warn('Failed to fetch combo offers:', err);
          return null;
        })
      ]);

      clearTimeout(timeoutId);

      let theaterNameValue = 'Menu';
      let theaterLogoValue = '';
      let bannerImageValue = '';
      let kioskTypesValue = [];
      let productsValue = [];
      let comboOffersValue = [];

      // ✅ FIX: Process theater info with try-catch to prevent body stream errors
      if (theaterResponse && theaterResponse.ok) {
        try {
          const theaterData = await theaterResponse.json();
          if (theaterData.success && theaterData.theater) {
            theaterNameValue = theaterData.theater.name || 'Menu';
            theaterLogoValue = theaterData.theater.logo || '';
          }
        } catch (err) {
          console.warn('Error parsing theater response:', err);
        }
      }

      // ✅ FIX: Process banner images with try-catch - Get all active banners for carousel
      let bannersArray = [];
      if (bannerResponse && bannerResponse.ok) {
        try {
          const bannerData = await bannerResponse.json();
          if (bannerData.success && bannerData.data && bannerData.data.banners && bannerData.data.banners.length > 0) {
            // Filter active banners and sort by sortOrder
            bannersArray = bannerData.data.banners
              .filter(b => b.isActive)
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            
            // Set first banner for backward compatibility
            if (bannersArray.length > 0) {
              bannerImageValue = bannersArray[0].imageUrl || '';
            }
          }
        } catch (err) {
          console.warn('Error parsing banner response:', err);
        }
      }

      // ✅ FIX: Process kiosk types with try-catch
      if (kioskTypesResponse && kioskTypesResponse.ok) {
        try {
          const kioskTypesData = await kioskTypesResponse.json();
          if (kioskTypesData.success && kioskTypesData.data && kioskTypesData.data.kioskTypes) {
            kioskTypesValue = kioskTypesData.data.kioskTypes.filter(kt => kt.isActive);
          }
        } catch (err) {
          console.warn('Error parsing kiosk types response:', err);
        }
      }

      // ✅ FIX: Process products with proper error handling
      if (!productsResponse || !productsResponse.ok) {
        // Don't read response body if it's an error - just throw with status
        const statusText = productsResponse?.statusText || 'Unknown error';
        const status = productsResponse?.status || 0;
        throw new Error(`HTTP ${status}: ${statusText}`);
      }

      // ✅ FIX: unifiedFetch already handles response body consumption safely
      // Just use .json() directly - unifiedFetch provides a safe json() method
      // that works even when body is already consumed (from cache)
      try {
        const data = await productsResponse.json();

        if (data.success && data.data && data.data.products) {
          // Filter only active products
          productsValue = data.data.products.filter(p => p.isActive);
        } else if (data.success && Array.isArray(data.data)) {
          // ✅ FIX: Handle case where products are directly in data array
          productsValue = data.data.filter(p => p.isActive);
        } else if (Array.isArray(data)) {
          // ✅ FIX: Handle case where response is directly an array
          productsValue = data.filter(p => p.isActive);
        } else {
          setError('No products found in response');
        }
      } catch (jsonError) {
        // ✅ FIX: If JSON parsing fails, provide helpful error message
        console.error('Error parsing products response:', jsonError);
        throw new Error(`Failed to load products: ${jsonError.message}`);
      }

      // ✅ FIX: Process combo offers with try-catch
      if (comboOffersResponse && comboOffersResponse.ok) {
        try {
          const comboData = await comboOffersResponse.json();
          if (comboData.success && comboData.data) {
            const offersList = Array.isArray(comboData.data) ? comboData.data : (comboData.data.comboOffers || []);
            const activeCombos = offersList.filter(combo => combo.isActive);

            // Format combo offers for display
            comboOffersValue = activeCombos.map(combo => ({
              ...combo,
              _id: combo._id,
              name: combo.name,
              description: combo.description || '',
              offerPrice: parseFloat(combo.offerPrice || combo.price || 0),
              discountPercentage: parseFloat(combo.discountPercentage || 0),
              imageUrl: combo.imageUrl || combo.image || null,
              taxRate: combo.gstTaxRate !== undefined && combo.gstTaxRate !== null ? parseFloat(combo.gstTaxRate) : 0,
              gstType: combo.gstType || 'Inclusive',
              isCombo: true, // Flag to identify as combo
              isAvailable: combo.isActive === true,
              products: combo.products || [] // ✅ Preserve products array for stock validation
            }));
          }
        } catch (err) {
          console.warn('Error parsing combo offers response:', err);
        }
      }

      // Process products to preserve stock data for validation
      const processedProducts = productsValue.map(p => ({
        ...p,
        balanceStock: p.balanceStock,
        closingBalance: p.closingBalance,
        stockUnit: p.stockUnit,
        unit: p.unit,
        quantityUnit: p.quantityUnit,
        noQty: p.noQty,
        inventory: p.inventory
      }));

      // Update state
      setTheaterName(theaterNameValue);
      setTheaterLogo(theaterLogoValue);
      setBannerImage(bannerImageValue); // Keep for backward compatibility
      setBanners(bannersArray); // Set banners array for carousel
      setKioskTypes(kioskTypesValue);
      setProducts(processedProducts);
      setProductsForValidation(processedProducts); // Set products for validation
      setComboOffers(comboOffersValue);
      setLoading(false);
      document.title = `Menu - ${theaterNameValue}`;

      // Cache the data using utility
      setCachedData(cacheKey, {
        theaterName: theaterNameValue,
        theaterLogo: theaterLogoValue,
        bannerImage: bannerImageValue,
        banners: bannersArray, // Cache banners array
        kioskTypes: kioskTypesValue,
        products: processedProducts,
        comboOffers: comboOffersValue
      });

      // 🎨 AUTO-CACHE ALL PRODUCT IMAGES (LIKE OFFLINE POS)
      if (processedProducts.length > 0) {
        cacheProductImages(processedProducts).catch(err => {
          console.error('Error caching product images:', err);
        });
      }
    };

    fetchData();
  }, [theaterId]);

  // Fetch category images and kiosk banner from Settings > Images
  useEffect(() => {
    const loadCategoryImages = async () => {
      try {
        const response = await unifiedFetch(`${config.api.baseUrl}/settings/image-config`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          cacheKey: 'category_images',
          cacheTTL: 300000 // 5 minutes cache
        });

        if (response.ok) {
          const result = await response.json();
          const images = Array.isArray(result.data) ? result.data : (result.data?.imageConfig || []);
          
          // Map image config names to category keys
          const imageMap = {
            all: null,
            combo: null
          };

          let kioskBanner = null;

          images.forEach((img) => {
            if (img.name === 'All Category' && img.imageUrl) {
              imageMap.all = img.imageUrl;
            } else if (img.name === 'Combo Category' && img.imageUrl) {
              imageMap.combo = img.imageUrl;
            } else if (img.name === 'Kiosk Banner' && img.imageUrl) {
              kioskBanner = img.imageUrl;
            }
          });

          setCategoryImages(imageMap);
          setKioskBannerFromSettings(kioskBanner);
        } else {
          console.warn('⚠️ [Kiosk Category Images] Failed to load, using static images');
        }
      } catch (error) {
        console.error('❌ [Kiosk Category Images] Error loading:', error);
        // Fallback to static images on error
      }
    };

    loadCategoryImages();
  }, []);

  // Auto-scroll banner carousel
  useEffect(() => {
    if (banners.length > 1) {
      const interval = setInterval(() => {
        setCurrentBannerIndex((prevIndex) =>
          prevIndex === banners.length - 1 ? 0 : prevIndex + 1
        );
      }, 4000); // Change banner every 4 seconds

      return () => clearInterval(interval);
    }
  }, [banners.length]);

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') {
      return products;
    } else if (selectedCategory === 'combo') {
      // For combo category, return combo offers formatted as products
      return comboOffers.map(combo => ({
        ...combo,
        _id: combo._id,
        name: combo.name,
        price: combo.offerPrice,
        sellingPrice: combo.offerPrice,
        originalPrice: combo.offerPrice,
        image: combo.imageUrl,
        images: combo.imageUrl ? [{ url: combo.imageUrl }] : [],
        description: combo.description,
        discountPercentage: combo.discountPercentage,
        taxRate: combo.taxRate,
        gstType: combo.gstType,
        isCombo: true,
        isAvailable: combo.isAvailable !== false,
        isActive: combo.isActive !== false, // Ensure isActive is set
        products: combo.products || [], // ✅ Preserve products array for validation
        kioskType: 'combo' // For filtering
      }));
    } else {
      return products.filter(p => p.kioskType === selectedCategory);
    }
  }, [selectedCategory, products, comboOffers]);

  // Filter to show only products with available stock
  // ✅ FIX: Use cafe stock (balanceStock/closingBalance) instead of theater stock
  // For combo offers, skip stock check (they validate stock differently)
  const availableProducts = filteredProducts.filter(product => {
    // For combo offers, check only isAvailable flag (stock is validated per product in combo)
    if (product.isCombo) {
      return product.isAvailable !== false && product.isActive !== false;
    }
    
    // For regular products, check stock
    const currentStock = product.balanceStock ??
      product.closingBalance ??
      product.inventory?.currentStock ??
      product.stockQuantity ??
      0;
    const isAvailable = currentStock > 0 && product.isActive !== false && product.isAvailable !== false;
    return isAvailable;
  });

  // Add to cart with stock validation
  const addToCart = (product) => {
    const existingItem = cart.find(item => item._id === product._id);
    const newQuantity = existingItem ? existingItem.quantity + 1 : 1;
    
    // For combo offers, use shared combo stock validation
    if (product.isCombo) {
      // Get the full combo offer data with products array
      const comboOffer = product.products ? product : comboOffers.find(c => c._id === product._id);
      
      if (!comboOffer) return;
      
      // Use shared combo stock validation utility
      const comboValidation = validateComboStockAvailability(
        comboOffer, 
        newQuantity, 
        cart, // cart items
        productsForValidation, // all products list
        { silent: true, excludeComboId: product._id } // exclude current combo from cart consumption
      );
      
      if (!comboValidation.valid) {
        // Stock insufficient - don't add to cart
        return;
      }
    } else {
      // Regular product validation
      // Validate stock availability
      const validation = validateStockAvailability(product, newQuantity, { silent: true });
      if (!validation.valid) {
        // Stock insufficient - don't add to cart
        return;
      }
    }

    let updatedCart;
    if (existingItem) {
      updatedCart = cart.map(item =>
        item._id === product._id
          ? { ...item, quantity: newQuantity }
          : item
      );
    } else {
      // Preserve product size/variant before overwriting quantity with count
      const productSize = product.size || product.quantity; // quantity here is size like "LARGE"
      
      // Ensure price fields are preserved correctly for combos
      const comboPrice = product.isCombo 
        ? (product.offerPrice || product.price || product.sellingPrice || 0)
        : (product.price || product.sellingPrice || product.basePrice || 0);
      
      updatedCart = [...cart, {
        ...product,
        quantity: 1, // This is now the count
        productSize: productSize, // Preserve the size/variant
        size: product.size || productSize, // Ensure size field exists
        // Ensure price fields are set correctly
        price: comboPrice,
        sellingPrice: comboPrice,
        basePrice: comboPrice,
        offerPrice: product.isCombo ? comboPrice : product.offerPrice,
        // Preserve pricing object if it exists
        pricing: product.pricing || {
          basePrice: comboPrice,
          salePrice: comboPrice,
          sellingPrice: comboPrice
        },
        products: product.isCombo ? (product.products || comboOffers.find(c => c._id === product._id)?.products || []) : undefined // Preserve products array for combos
      }];
    }
    setCart(updatedCart);
    localStorage.setItem(`kioskCart_${theaterId}`, JSON.stringify(updatedCart));
  };

  // Get cart total
  const getCartTotal = () => {
    return cart.reduce((sum, item) => {
      const basePrice = item.sellingPrice || item.price || 0;
      return sum + (basePrice * item.quantity);
    }, 0);
  };

  // Get cart items count
  const getCartCount = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  // View cart
  const viewCart = () => {
    navigate(`/kiosk-cart/${theaterId}`, { state: { cart, theaterName } });
  };

  // Handle viewing combo products
  const handleViewComboProducts = (comboOffer) => {
    setSelectedComboOffer(comboOffer);
    setShowComboProductsModal(true);
  };

  // Handle closing combo products modal
  const handleCloseComboProductsModal = () => {
    setShowComboProductsModal(false);
    setSelectedComboOffer(null);
  };

  if (loading) {
    return (
      <div className="kiosk-screen">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kiosk-screen">
        <div className="error-container">
          <p>❌ {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-screen-modern">
      {/* Left Sidebar - Categories */}
      <div className="category-sidebar">
        {/* Theater Logo */}
        <div className="sidebar-logo">
          {theaterLogo ? (
            <InstantImage src={theaterLogo} alt={theaterName} />
          ) : (
            <h1 className="sidebar-logo-text">{theaterName || 'Menu'}</h1>
          )}
        </div>

        {/* Scrollable Category List Wrapper with Arrows */}
        <div className="category-list-wrapper">
          {/* Scroll Up Arrow */}
          <div
            className="scroll-arrow-kebab scroll-arrow-up"
            onClick={() => {
              const wrapper = document.querySelector('.category-list-wrapper');
              if (wrapper) wrapper.scrollBy({ top: -200, behavior: 'smooth' });
            }}
          ></div>

          {/* Category List */}
          <div className="category-list">
            {/* All Items Category */}
            <div
              className={`category-item ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              <div className="category-item-image">
                <InstantImage 
                  src={categoryImages.all || "/images/All.png"} 
                  alt="All Items"
                  onError={(e) => {
                    console.error('❌ [Kiosk Category] Failed to load All category image');
                    // Fallback to static image
                    if (e.target.src !== "/images/All.png") {
                      e.target.src = "/images/All.png";
                    }
                  }}
                  onLoad={() => {
                  }}
                />
              </div>
              <div className="category-item-name">All Items</div>
            </div>

            {/* Combo Category - Only show if there are combo offers */}
            {comboOffers.length > 0 && (
              <div
                className={`category-item ${selectedCategory === 'combo' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('combo')}
              >
                <div className="category-item-image">
                  <InstantImage 
                    src={categoryImages.combo || "/images/combo.png"} 
                    alt="Combo Offers"
                    onError={(e) => {
                      console.error('❌ [Kiosk Category] Failed to load Combo category image');
                      // Fallback to static image
                      if (e.target.src !== "/images/combo.png") {
                        e.target.src = "/images/combo.png";
                      }
                    }}
                    onLoad={() => {
                    }}
                  />
                </div>
                <div className="category-item-name">Combo</div>
              </div>
            )}

            {/* Dynamic Categories from Kiosk Types */}
            {Array.isArray(kioskTypes) && kioskTypes.map((type) => {
              const iconUrl = type.imageUrl || type.icon;
              return (
                <div
                  key={type._id}
                  className={`category-item ${selectedCategory === type._id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(type._id)}
                >
                  <div className="category-item-image">
                    {iconUrl ? (
                      <InstantImage src={iconUrl} alt={type.name} />
                    ) : (
                      <span className="category-item-icon">📦</span>
                    )}
                  </div>
                  <div className="category-item-name">{type.name}</div>
                </div>
              );
            })}
          </div>

          {/* Scroll Down Arrow */}
          <div
            className="scroll-arrow-kebab scroll-arrow-down"
            onClick={() => {
              const wrapper = document.querySelector('.category-list-wrapper');
              if (wrapper) wrapper.scrollBy({ top: 200, behavior: 'smooth' });
            }}
          ></div>
        </div>

        {/* Cart Button - Shows when cart has items */}
        {cart.length > 0 && (
          <div className="sidebar-cart-button" onClick={viewCart}>
            <div className="cart-icon-wrapper">
              <span className="cart-icon">🛒</span>
              <span className="cart-badge">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
            </div>
            <span className="cart-button-text">View Cart</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="main-content-area">
        {/* Hero Banner - Only show on "All Items" category */}
        {selectedCategory === 'all' && (() => {
          // Build banners array with priority: 1) Theater banners, 2) Settings kiosk banner, 3) Static fallback
          // Always ensure at least one banner is available
          let displayBanners = [];
          
          if (banners && banners.length > 0) {
            // Use theater banners if available
            displayBanners = banners.map(b => b.imageUrl).filter(url => url); // Filter out empty URLs
          } else if (bannerImage) {
            // Use single banner image if available
            displayBanners = [bannerImage];
          } else if (kioskBannerFromSettings) {
            // Fallback to settings kiosk banner
            displayBanners = [kioskBannerFromSettings];
          }
          
          // Always have at least one fallback
          if (displayBanners.length === 0) {
            displayBanners = ['/images/kiosk.jpg'];
          }

          // If only one banner, show single image; otherwise show carousel
          if (displayBanners.length === 1) {
            return (
              <div className="hero-banner">
                <img
                  src={displayBanners[0]}
                  alt="Kiosk Header"
                  onError={(e) => {
                    console.error('Kiosk header image failed to load:', displayBanners[0]);
                    // Try fallback chain
                    if (displayBanners[0] !== '/images/kiosk.jpg') {
                      e.target.src = '/images/kiosk.jpg';
                    } else {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div class="hero-banner-placeholder">🍽️</div>';
                    }
                  }}
                  onLoad={() => {
                  }}
                />
              </div>
            );
          } else {
            // Multiple banners - show carousel
            return (
              <div className="hero-banner hero-banner-carousel">
                <div 
                  className="hero-banner-track"
                  style={{
                    transform: `translateX(-${currentBannerIndex * 100}%)`,
                    transition: 'transform 0.5s ease-in-out',
                    height: '100%'
                  }}
                >
                  {displayBanners.map((bannerUrl, index) => (
                    <div key={index} className="hero-banner-slide">
                      <img
                        src={bannerUrl}
                        alt={`Banner ${index + 1}`}
                        onError={(e) => {
                          console.error('Banner image failed to load:', bannerUrl);
                          // If not the last banner, try next one; otherwise hide
                          if (index < displayBanners.length - 1) {
                            e.target.style.display = 'none';
                          } else {
                            e.target.src = '/images/kiosk.jpg';
                          }
                        }}
                        onLoad={() => {
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }
        })()}

        {/* Product Content */}
        <div className="product-content">
          <div className="product-header">
            <h1 className="product-title">
              {selectedCategory === 'all' ? 'All Items' 
                : selectedCategory === 'combo' ? 'Combo Offers'
                : kioskTypes.find(t => t._id === selectedCategory)?.name || 'Menu'}
            </h1>
          </div>

          {/* Products Grid */}
          {availableProducts.length === 0 ? (
            <div className="no-products-box">
              <p>No products available in this category</p>
            </div>
          ) : (
            <div className="products-grid-kebab">
              {availableProducts.map((product) => {
                // Handle nested pricing structure - ensure numbers
                // For combo offers, check offerPrice first
                const basePrice = Number(
                  product.offerPrice ||
                  product.pricing?.basePrice ||
                  product.pricing?.salePrice ||
                  product.basePrice ||
                  product.salePrice ||
                  product.price ||
                  product.sellingPrice ||
                  0
                );

                const discountPercent = Number(product.pricing?.discountPercentage || product.discountPercentage || 0);

                let finalPrice = basePrice;

                if (discountPercent > 0) {
                  finalPrice = basePrice * (1 - discountPercent / 100);
                } else if (product.pricing?.salePrice && Number(product.pricing.salePrice) < basePrice) {
                  finalPrice = Number(product.pricing.salePrice);
                }

                const cartItem = cart.find(item => item._id === product._id);
                const quantity = cartItem ? cartItem.quantity : 0;

                // For combo offers, check combo stock validation; for regular products, use isOutOfStock
                let isProductAvailableForOverlay = false;
                if (product.isCombo) {
                  const comboOffer = product.products ? product : comboOffers.find(c => c._id === product._id);
                  if (comboOffer) {
                    const comboValidation = validateComboStockAvailability(
                      comboOffer, 
                      quantity + 1, 
                      cart, 
                      productsForValidation, 
                      { silent: true, excludeComboId: product._id }
                    );
                    isProductAvailableForOverlay = comboValidation.valid;
                  }
                } else {
                  isProductAvailableForOverlay = !isOutOfStock(product);
                }
                
                return (
                  <div
                    key={product._id}
                    className="product-card-kebab"
                  >
                    <div className="product-card-image" onClick={() => isProductAvailableForOverlay && addToCart(product)}>
                      {product.images && product.images.length > 0 ? (
                        <InstantImage
                          src={product.images[0].url || product.images[0]}
                          alt={product.name}
                        />
                      ) : (
                        <div className="product-card-placeholder">🍽️</div>
                      )}
                      {!isProductAvailableForOverlay && (
                        <div className="out-of-stock-overlay">
                          <span>OUT OF STOCK</span>
                        </div>
                      )}
                      {/* Combo Products Icon - Top Right */}
                      {product.isCombo && product.products && product.products.length > 0 && (
                        <button
                          className="combo-products-icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const comboOffer = product.products ? product : comboOffers.find(c => c._id === product._id);
                            if (comboOffer) {
                              handleViewComboProducts(comboOffer);
                            }
                          }}
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
                    </div>
                    <div className="product-card-info">
                      <div className="product-card-name-row">
                        <h3 className="product-card-name">{product.name}</h3>
                        {(product.quantity || product.size) && (
                          <p className="product-card-size">{product.quantity || product.size}</p>
                        )}
                      </div>
                      <div className="product-card-footer">
                        <div className="product-price-section">
                          <p className="product-card-price">
                            ₹{Number(finalPrice || 0).toFixed(2)}
                          </p>
                        </div>
                          {(() => {
                          // For combo offers, use combo stock validation
                          const isProductAvailable = product.isCombo 
                            ? product.isAvailable !== false 
                            : !isOutOfStock(product);
                          const canAddMore = product.isCombo
                            ? (() => {
                                // Get the full combo offer data with products array
                                const comboOffer = product.products ? product : comboOffers.find(c => c._id === product._id);
                                if (!comboOffer) return false;
                                // Use shared combo stock validation utility
                                const comboValidation = validateComboStockAvailability(
                                  comboOffer, 
                                  quantity + 1, 
                                  cart, 
                                  productsForValidation, 
                                  { silent: true, excludeComboId: product._id }
                                );
                                return comboValidation.valid;
                              })()
                            : (quantity === 0 
                                ? isProductAvailable
                                : validateStockAvailability(product, quantity + 1, { silent: true }).valid);

                          if (quantity > 0) {
                            return (
                              <div className="product-actions">
                                <button
                                  className="quantity-btn minus"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const index = cart.findIndex(item => item._id === product._id);
                                    let updatedCart;
                                    if (quantity === 1) {
                                      updatedCart = cart.filter((_, i) => i !== index);
                                    } else {
                                      updatedCart = cart.map((cartItem, i) =>
                                        i === index ? { ...cartItem, quantity: cartItem.quantity - 1 } : cartItem
                                      );
                                    }
                                    setCart(updatedCart);
                                    localStorage.setItem(`kioskCart_${theaterId}`, JSON.stringify(updatedCart));
                                  }}
                                  disabled={quantity <= 0}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  </svg>
                                </button>
                                <span className="quantity-display">{quantity}</span>
                                <button
                                  className={`quantity-btn plus ${!canAddMore ? 'disabled' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newQty = quantity + 1;
                                    
                                    // For combo offers, use combo stock validation
                                    if (product.isCombo) {
                                      const comboOffer = product.products ? product : comboOffers.find(c => c._id === product._id);
                                      if (!comboOffer) return;
                                      const comboValidation = validateComboStockAvailability(
                                        comboOffer, 
                                        newQty, 
                                        cart, 
                                        productsForValidation, 
                                        { silent: true, excludeComboId: product._id }
                                      );
                                      if (!comboValidation.valid) {
                                        return;
                                      }
                                    } else {
                                      const validation = validateStockAvailability(product, newQty, { silent: true });
                                      if (!validation.valid) {
                                        return;
                                      }
                                    }
                                    
                                    const index = cart.findIndex(item => item._id === product._id);
                                    const updatedCart = cart.map((cartItem, i) =>
                                      i === index ? { ...cartItem, quantity: newQty } : cartItem
                                    );
                                    setCart(updatedCart);
                                    localStorage.setItem(`kioskCart_${theaterId}`, JSON.stringify(updatedCart));
                                  }}
                                  disabled={!canAddMore}
                                  title={!canAddMore ? 'Insufficient stock' : ''}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                            );
                          } else {
                            return isProductAvailable ? (
                              <button
                                className="product-add-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCart(product);
                                }}
                              >
                                Add
                              </button>
                            ) : (
                              <div className="out-of-stock-message">
                                <span>OUT OF STOCK</span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Combo Products Modal */}
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
                          <th style={{ textAlign: 'left', paddingLeft: '24px' }}>PRODUCT</th>
                          <th style={{ textAlign: 'center', width: '80px' }}>SIZE</th>
                          <th style={{ textAlign: 'center', width: '60px' }}>QTY</th>
                          <th style={{ textAlign: 'center', width: '80px' }}>NO.QTY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedComboOffer.products.map((comboProduct, index) => {
                          // Find the full product details from products list
                          const productIdToMatch = comboProduct.productId || comboProduct._id;
                          const fullProduct = productsForValidation.find(p => {
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
  );
};

export default SimpleProductList;