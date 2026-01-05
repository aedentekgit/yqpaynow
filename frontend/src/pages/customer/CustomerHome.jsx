import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '@contexts/CartContext';
import ProductCollectionModal from '@components/customer/ProductCollectionModal';
import ComboCollectionModal from '@components/customer/ComboCollectionModal';
import BannerCarousel from '@components/customer/BannerCarousel';
import OffersPopup from '@components/customer/OffersPopup';
import OfflineNotice from '@components/OfflineNotice';
import InstantImage from '@components/InstantImage'; // 🚀 INSTANT image loading (like Offline POS)
import useNetworkStatus from '@hooks/useNetworkStatus';
import useCustomerAutoLogout from '@hooks/useCustomerAutoLogout'; // 🔒 Auto-logout for customer sessions
import {
  groupProductsIntoCollections,
  filterCollections,
  getDefaultVariant
} from '@utils/productCollections';
import { formatCustomerUnitLabel } from '@utils/customerUnitLabel';
import { getCachedData, setCachedData } from '@utils/cacheUtils';
import { preCacheImages, cacheProductImages, getImageSrc } from '@utils/globalImageCache'; // 🎨 Pre-cache product images
import config from '@config';
import '@styles/customer/CustomerHome.css';
import '@styles/pages/customer/CustomerHome.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { clearCachePattern } from '@utils/cacheUtils';
import useStockValidation from '@hooks/useStockValidation';
import { validateComboStockAvailability } from '@utils/comboStockValidation';
import jsQR from 'jsqr';



const CustomerHome = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const cart = useCart();
  const { items, addItem, updateQuantity, removeItem, getTotalItems, getItemQuantity, clearCart } = cart;

  // 🔒 Auto-logout: Handles tab close and 30-minute inactivity
  useCustomerAutoLogout();

  // Network status for offline handling
  const { shouldShowOfflineUI, isNetworkError } = useNetworkStatus();
  const [theaterId, setTheaterId] = useState(null);
  const [theater, setTheater] = useState(null);
  const [products, setProducts] = useState([]);
  const [productCollections, setProductCollections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [qrName, setQrName] = useState(null);
  const [seat, setSeat] = useState(null);
  const [screenName, setScreenName] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const [isVeg, setIsVeg] = useState(false);
  const [isNonVeg, setIsNonVeg] = useState(false);
  const [selectedPriceRange, setSelectedPriceRange] = useState('all');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedQRData, setScannedQRData] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationIntervalRef = useRef(null);

  // Favorites state - normalize IDs to strings for consistent comparison
  const [favoriteProducts, setFavoriteProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('customerFavorites');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Normalize all IDs to strings for consistent comparison
        const normalized = Array.isArray(parsed)
          ? parsed.map(id => String(id).trim()).filter(id => id)
          : [];
        return normalized;
      }
      return [];
    } catch (error) {
      console.error('❌ Error loading favorites from localStorage:', error);
      return [];
    }
  });

  // Reload favorites from localStorage on mount and when storage changes
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const saved = localStorage.getItem('customerFavorites');
        if (saved) {
          const parsed = JSON.parse(saved);
          const normalized = Array.isArray(parsed)
            ? parsed.map(id => String(id).trim()).filter(id => id)
            : [];

          setFavoriteProducts(prev => {
            // Only update if different (avoid unnecessary re-renders)
            const prevNormalized = prev.map(id => String(id).trim()).filter(id => id);
            const prevStr = JSON.stringify(prevNormalized.sort());
            const newStr = JSON.stringify(normalized.sort());

            if (prevStr !== newStr) {
              return normalized;
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('❌ Error reloading favorites from localStorage:', error);
      }
    };

    // Load on mount
    loadFavorites();

    // Listen for storage changes (cross-tab updates)
    const handleStorageChange = (e) => {
      if (e.key === 'customerFavorites') {
        loadFavorites();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Stock validation hook
  const { validateStockAvailability, isOutOfStock } = useStockValidation(items, products);

  // Offers popup state
  const [offers, setOffers] = useState([]);
  const [showOffersPopup, setShowOffersPopup] = useState(false);

  // Combo offers state
  const [comboOffers, setComboOffers] = useState([]);

  // Category images state (from Settings > Images)
  const [categoryImages, setCategoryImages] = useState({
    all: null,
    offers: null,
    combo: null
  });

  // Order Success Notification
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [lastOrderId, setLastOrderId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('orderSuccess') === 'true') {
      setShowOrderSuccess(true);
      setLastOrderId(params.get('orderId'));

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowOrderSuccess(false);
        // Remove param from URL without reloading
        const newParams = new URLSearchParams(location.search);
        newParams.delete('orderSuccess');
        newParams.delete('orderId');
        navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [location.search, navigate]);

  // Initialize state from localStorage if URL params are missing
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('theaterid') || params.get('theaterId') || params.get('THEATERID');

    // If no theaterId in URL, try to restore from localStorage and redirect
    if (!id) {
      const savedId = localStorage.getItem('customerTheaterId');
      if (savedId) {
        const savedQr = localStorage.getItem('customerQrName');
        const savedScreen = localStorage.getItem('customerScreenName');
        const savedSeat = localStorage.getItem('customerSeat');

        const newParams = new URLSearchParams();
        newParams.set('theaterid', savedId);
        if (savedQr) newParams.set('qrName', savedQr);
        if (savedScreen) newParams.set('screen', savedScreen);
        if (savedSeat) newParams.set('seat', savedSeat);

        // Redirect with saved parameters
        navigate(`/customer/home?${newParams.toString()}`, { replace: true });
        return;
      }
    }
  }, [location.search, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Support multiple parameter name variations for backwards compatibility
    const id = params.get('theaterid') || params.get('theaterId') || params.get('THEATERID');
    const qr = params.get('qrName') || params.get('qrname') || params.get('QRNAME');
    const seatNum = params.get('seat') || params.get('SEAT');
    const screen = params.get('screen') || params.get('SCREEN') || params.get('screenName');
    const category = params.get('category'); // Get saved category from URL


    // Save to localStorage for persistence on refresh
    if (id) {
      setTheaterId(id);
      localStorage.setItem('customerTheaterId', id);
    } else {
      console.warn('⚠️ [CustomerHome] No theaterId found in URL parameters');
    }

    if (qr) {

      setQrName(qr);
      localStorage.setItem('customerQrName', qr);
      // If no screen name is provided, use qrName as screen name
      if (!screen) {

        setScreenName(qr);
        localStorage.setItem('customerScreenName', qr);
      }
    }

    if (seatNum) {
      setSeat(seatNum);
      localStorage.setItem('customerSeat', seatNum);
    }

    if (screen) {
      setScreenName(screen);
      localStorage.setItem('customerScreenName', screen);
    }

    if (category) setSelectedCategory(category); // Restore selected category
  }, [location.search, navigate]);

  // ✅ REAL-TIME VALIDATION: Continuously check QR status while user is on the page
  // This ensures immediate redirect if QR is turned OFF while customer is using the page
  /* 
  // 🛑 DISABLED: Real-time QR status monitoring was causing 429 errors
  useEffect(() => {
    if (!qrName || !theaterId) return;

    // Check QR status every 30 seconds instead of 5
    const checkInterval = setInterval(async () => {
      // ... 
    }, 30000); 

    return () => clearInterval(checkInterval);
  }, [qrName, theaterId, navigate]);
  */

  // Main data loading with cache-first strategy - INSTANT LOADING (NO DELAYS)
  useEffect(() => {
    if (!theaterId) return;

    const cacheKey = `customerHome_${theaterId}`;

    // ⚡ INSTANT: Check cache synchronously - NO ASYNC OPERATIONS
    const cached = getCachedData(cacheKey);

    // ✅ FIX: Validate cached products have quantity data - if not, clear cache and force refresh
    const validateCachedProducts = (products) => {
      if (!products || !Array.isArray(products) || products.length === 0) return false;

      // Check if at least some products have quantity field (not all products may have it, but most should)
      // Sample first 5 products to check if quantity data exists
      const sampleSize = Math.min(5, products.length);
      const hasQuantityData = products.slice(0, sampleSize).some(product => {
        const qty = product?.quantity || product?.originalProduct?.quantity;
        return qty !== null && qty !== undefined && String(qty).trim() !== '';
      });

      return hasQuantityData;
    };

    if (cached) {
      // ✅ FIX: Validate cached products have quantity data
      const hasValidQuantityData = validateCachedProducts(cached.products);

      if (!hasValidQuantityData) {
        // Clear cache if products don't have quantity data (stale cache from before fix)
        try {
          clearCachePattern(`customerHome_${theaterId}`);
          clearCachePattern(`theater_products_${theaterId}_cafe`);
        } catch (err) {
          console.warn('Error clearing cache:', err);
        }
        // Continue to fetch fresh data below
      } else {
        // ⚡ INSTANT: Set data immediately (synchronous)
        if (cached.theater) setTheater(cached.theater);
        if (cached.products && cached.products.length > 0) {
          setProducts(cached.products);
          // ⚡ FIX: Process collections synchronously to ensure quantity data is available on initial render
          const collections = groupProductsIntoCollections(cached.products);
          setProductCollections(collections);
        }
        if (cached.categories && cached.categories.length > 0) {
          setCategories(cached.categories);
        }
        // ⚡ INSTANT: Show content immediately
        setLoading(false);

        // Pre-cache images in background (completely non-blocking)
        setTimeout(() => {
          if (cached.products && cached.products.length > 0) {
            const imageUrls = [];
            cached.products.forEach(product => {
              let imageUrl = null;
              if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                const firstImage = product.images[0];
                imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
              } else if (product.productImage) {
                imageUrl = product.productImage;
              } else if (product.image) {
                imageUrl = product.image;
              }
              if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = `${config.api.baseUrl}${imageUrl}`;
              }
              if (imageUrl) imageUrls.push(imageUrl);
            });
            if (imageUrls.length > 0) {
              preCacheImages(imageUrls.slice(0, 20)).catch(() => { });
              if (imageUrls.length > 20) {
                preCacheImages(imageUrls.slice(20)).catch(() => { });
              }
            }
          }
        }, 0);
        return; // Exit early - don't fetch fresh data if cache exists and is valid
      }
    }

    // ⚡ INSTANT: Check individual caches (synchronous)
    const theaterCache = getCachedData(`theater_${theaterId}`);
    const productsCache = getCachedData(`theater_products_${theaterId}_cafe`);
    const categoriesCache = getCachedData(`theater_categories_${theaterId}`);

    if (theaterCache) setTheater(theaterCache);
    if (productsCache && Array.isArray(productsCache) && productsCache.length > 0) {
      // ✅ FIX: Validate individual products cache has quantity data
      const hasValidQuantityData = validateCachedProducts(productsCache);

      if (!hasValidQuantityData) {
        // Clear stale cache
        try {
          clearCachePattern(`theater_products_${theaterId}_cafe`);
        } catch (err) {
          console.warn('Error clearing products cache:', err);
        }
        // Continue to fetch fresh data below
      } else {
        setProducts(productsCache);
        // ⚡ FIX: Process collections synchronously to ensure quantity data is available on initial render
        const collections = groupProductsIntoCollections(productsCache);
        setProductCollections(collections);
        setLoading(false); // ⚡ INSTANT: Show products immediately
      }
    }
    if (categoriesCache && Array.isArray(categoriesCache) && categoriesCache.length > 0) {
      setCategories(categoriesCache);
    }

    // Fetch fresh data in parallel (background refresh) - ONLY if no cache exists or cache is invalid
    // If valid cache exists, skip fetching to avoid blocking
    // Note: If we cleared cache above due to missing quantity data, we need to fetch fresh data
    const hasValidMainCache = cached && validateCachedProducts(cached.products);
    const hasValidProductsCache = productsCache && Array.isArray(productsCache) && productsCache.length > 0 && validateCachedProducts(productsCache);
    const shouldFetchFreshData = !hasValidMainCache && !hasValidProductsCache;

    if (shouldFetchFreshData) {
      const fetchFreshData = async () => {
        try {
          const [theaterRes, productsRes, categoriesRes] = await Promise.all([
            unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {}, {
              cacheKey: `theater_${theaterId}`,
              cacheTTL: 300000 // 5 minutes
            }),
            unifiedFetch(`${config.api.baseUrl}/theater-products/${theaterId}?stockSource=cafe`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              mode: 'cors'
            }, {
              cacheKey: `theater_products_${theaterId}_cafe`,
              cacheTTL: 300000 // 5 minutes
            }),
            unifiedFetch(`${config.api.baseUrl}/theater-categories/${theaterId}`, {}, {
              cacheKey: `theater_categories_${theaterId}`,
              cacheTTL: 300000 // 5 minutes
            })
          ]);

          // Check if products response is OK
          if (!productsRes.ok) {
            console.error('❌ [DEBUG] Products API HTTP Error:', {
              status: productsRes.status,
              statusText: productsRes.statusText,
              url: productsRes.url
            });
          }

          const [theaterData, productsData, categoriesData] = await Promise.all([
            theaterRes.json(),
            productsRes.json().catch(err => {
              console.error('❌ [DEBUG] Failed to parse products JSON:', err);
              return { success: false, error: 'Failed to parse response', message: err.message };
            }),
            categoriesRes.json()
          ]);

          // Process theater data
          let freshTheater = null;
          if (theaterData.success && theaterData.data) {
            freshTheater = theaterData.data;
            setTheater(freshTheater);
          }

          // Process products data
          let freshProducts = [];

          // Handle different response structures
          let productsArray = [];
          if (productsData.success) {
            if (Array.isArray(productsData.data)) {
              productsArray = productsData.data;
            } else if (productsData.data && Array.isArray(productsData.data.products)) {
              productsArray = productsData.data.products;
            } else if (productsData.data && Array.isArray(productsData.data.data)) {
              productsArray = productsData.data.data;
            } else if (Array.isArray(productsData.products)) {
              productsArray = productsData.products;
            }
          }

          if (productsArray.length > 0) {
            freshProducts = productsArray.map(p => {
              // Use existing inventory stock directly - no need for unauthorized API calls
              const balanceStock = p.balanceStock ?? p.inventory?.currentStock ?? 0;

              let imageUrl = null;
              if (p.images && Array.isArray(p.images) && p.images.length > 0) {
                if (typeof p.images[0] === 'object' && p.images[0].url) {
                  imageUrl = p.images[0].url;
                } else if (typeof p.images[0] === 'string') {
                  imageUrl = p.images[0];
                }
              } else if (p.productImage) {
                imageUrl = p.productImage;
              } else if (p.image) {
                imageUrl = p.image;
              }

              const isActive = p.isActive === true;
              const trackStock = p.inventory?.trackStock !== false;
              // ✅ FIX: Use balanceStock from cafe-stock API (cafe stock) - fallback to inventory.currentStock
              const currentStock = balanceStock;
              const hasStock = !trackStock || currentStock > 0;
              const isAvailable = isActive && hasStock;

              return {
                _id: p._id,
                name: p.name || p.productName,
                price: p.pricing?.basePrice || p.price || p.sellingPrice || 0,
                description: p.description || '',
                image: imageUrl,
                categoryId: p.categoryId || (typeof p.category === 'object' ? p.category?._id : p.category),
                category: typeof p.category === 'object' ? (p.category?.categoryName || p.category?.name) : p.category,
                // ✅ Preserve dietary flag fields for UI (Veg/Non-Veg badges)
                // Backend may store this at root `isVeg`, or inside `dietary.isVeg`, or inside `specifications.isVeg`
                isVeg: p.isVeg ?? p.dietary?.isVeg ?? p.specifications?.isVeg,
                dietary: p.dietary,
                specifications: p.specifications,
                tags: p.tags,
                quantity: p.quantity !== undefined && p.quantity !== null ? p.quantity : null,
                size: p.size || null,
                pricing: p.pricing,
                taxRate: p.pricing?.taxRate || p.taxRate || 0,
                gstType: p.pricing?.gstType || p.gstType || 'EXCLUDE',
                discountPercentage: p.pricing?.discountPercentage || p.discountPercentage || 0,
                isActive: p.isActive,
                status: p.status,
                inventory: p.inventory,
                currentStock: currentStock,
                balanceStock: p.balanceStock, // Preserve balanceStock for validation
                closingBalance: p.closingBalance, // Preserve closingBalance as fallback
                stockUnit: p.stockUnit, // ✅ FIX: Preserve stockUnit from API (critical for unit display)
                unit: p.unit, // Preserve unit field
                quantityUnit: p.quantityUnit, // Preserve quantityUnit field
                noQty: p.noQty, // Preserve noQty for consumption calculation
                trackStock: trackStock,
                isAvailable: isAvailable,
                sku: p.sku || p.productCode || '', // ✅ Add product code/SKU
                productCode: p.sku || p.productCode || '', // ✅ Add product code/SKU (alias)
              };
            });


            setProducts(freshProducts);
            const collections = groupProductsIntoCollections(freshProducts);
            setProductCollections(collections);
          } else {
            console.error('❌ [DEBUG] Products data invalid or empty:', {
              success: productsData.success,
              data: productsData.data,
              productsArrayLength: productsArray.length,
              error: productsData.error || productsData.message,
              fullResponse: productsData
            });
            // Set empty products array to show "No products found" message
            setProducts([]);
            setProductCollections([]);
          }

          // Process categories data
          let freshCategories = [];
          if (categoriesData.success && categoriesData.data.categories) {

            freshCategories = categoriesData.data.categories
              .filter(cat => cat.isActive)
              .slice(0, 6)
              .map(cat => {
                // ✅ FIX: Check multiple possible image field names from backend
                const categoryImage = cat.imageUrl || cat.image || cat.categoryImage || cat.iconUrl || cat.iconImage || null;

                console.log('📦 [Category] Processing category:', {
                  id: cat._id,
                  name: cat.categoryName || cat.name,
                  imageUrl: cat.imageUrl,
                  image: cat.image,
                  categoryImage: cat.categoryImage,
                  iconUrl: cat.iconUrl,
                  iconImage: cat.iconImage,
                  finalImage: categoryImage
                });

                return {
                  _id: cat._id,
                  name: cat.categoryName || cat.name,
                  image: categoryImage, // ✅ FIX: Use the found image
                  imageUrl: categoryImage, // ✅ FIX: Also set imageUrl for compatibility
                  categoryImage: categoryImage, // ✅ FIX: Also set categoryImage
                  icon: cat.icon || '📦',
                  isActive: cat.isActive
                };
              });

            setCategories(freshCategories);
          } else {
            console.warn('⚠️ [Category] Categories data structure:', {
              success: categoriesData?.success,
              hasData: !!categoriesData?.data,
              hasCategories: !!categoriesData?.data?.categories,
              dataKeys: categoriesData?.data ? Object.keys(categoriesData.data) : [],
              fullResponse: categoriesData
            });
          }

          // Cache the fresh data
          setCachedData(cacheKey, {
            theater: freshTheater,
            products: freshProducts,
            categories: freshCategories
          });

          // 🎨 AUTO-CACHE ALL PRODUCT IMAGES (LIKE OFFLINE POS) - PRIORITY CACHING
          if (freshProducts.length > 0) {
            // Cache images immediately and in parallel for faster loading
            const imageUrls = [];
            freshProducts.forEach(product => {
              let imageUrl = null;
              if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                const firstImage = product.images[0];
                imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
              } else if (product.productImage) {
                imageUrl = product.productImage;
              } else if (product.image) {
                imageUrl = product.image;
              }
              if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = `${config.api.baseUrl}${imageUrl}`;
              }
              if (imageUrl) {
                imageUrls.push(imageUrl);
              }
            });

            // Pre-cache ALL images immediately for instant display
            // Cache first 50 images immediately (above the fold + buffer)
            const priorityImages = imageUrls.slice(0, 50);
            if (priorityImages.length > 0) {
              preCacheImages(priorityImages).catch(err => {
                console.error('Error pre-caching priority images:', err);
              });
            }

            // Cache remaining images immediately (don't wait)
            if (imageUrls.length > 50) {
              const remainingImages = imageUrls.slice(50);
              preCacheImages(remainingImages).catch(err => {
                console.error('Error pre-caching remaining images:', err);
              });
            }

            // Also cache using cacheProductImages utility for comprehensive caching
            cacheProductImages(freshProducts).catch(err => {
              console.error('Error caching product images:', err);
            });
          }

          setLoading(false);
        } catch (err) {
          console.error('💥 [CustomerHome] Error loading data:', err);
          setLoading(false);
        }
      };

      fetchFreshData();
    }
  }, [theaterId]);

  // Fetch category images from Settings > Images
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
            offers: null,
            combo: null
          };

          images.forEach((img) => {
            if (img.name === 'All Category' && img.imageUrl) {
              imageMap.all = img.imageUrl;
            } else if (img.name === 'Offer Category' && img.imageUrl) {
              imageMap.offers = img.imageUrl;
            } else if (img.name === 'Combo Category' && img.imageUrl) {
              imageMap.combo = img.imageUrl;
            }
          });

          setCategoryImages(imageMap);
        } else {
          console.warn('⚠️ [Category Images] Failed to load, using static images');
        }
      } catch (error) {
        console.error('❌ [Category Images] Error loading:', error);
        // Fallback to static images on error
      }
    };

    loadCategoryImages();
  }, []);

  // Fetch offers for popup - NON-BLOCKING (runs in background)
  useEffect(() => {
    if (!theaterId) {
      return;
    }

    // Defer offers fetching to not block initial page load
    const fetchOffers = async () => {
      try {
        // Use localStorage instead of sessionStorage to persist across page refreshes
        const popupKey = `offers_popup_shown_${theaterId}`;
        const offersCacheKey = `theater_offers_${theaterId}`;

        // Check if popup has been shown before (persists across page refreshes)
        const hasShownPopupBefore = localStorage.getItem(popupKey) === 'true';

        // If popup has already been shown, don't fetch offers or show popup again
        if (hasShownPopupBefore) {
          setOffers([]);
          return;
        }

        const url = `${config.api.baseUrl}/theater-offers/${theaterId}?limit=10`;

        const response = await unifiedFetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          cacheKey: offersCacheKey,
          cacheTTL: 300000, // 5 minutes
          forceRefresh: false // Allow cache
        });

        console.log('📥 [OffersPopup] Response received:', {
          ok: response?.ok,
          status: response?.status,
          hasResponse: !!response,
          fromCache: response?.fromCache
        });

        if (!response || !response.ok) {
          console.error('❌ [OffersPopup] Response not OK:', {
            ok: response?.ok,
            status: response?.status
          });
          setOffers([]);
          return;
        }

        // unifiedFetch returns a response object with json() method
        const data = await response.json();

        console.log('📦 [OffersPopup] Data received:', {
          success: data?.success,
          hasData: !!data?.data,
          hasOffers: !!data?.data?.offers,
          offersCount: data?.data?.offers?.length || 0
        });

        // API returns: { success: true, data: { offers: [...], ... } }
        if (data && data.success && data.data && Array.isArray(data.data.offers)) {
          // Filter only active offers
          const activeOffers = data.data.offers.filter(offer => offer.isActive === true);

          if (activeOffers.length > 0) {
            setOffers(activeOffers);

            // Show popup (we already checked earlier that it hasn't been shown)


            // Preload all offer images before showing popup
            const preloadImages = async () => {
              const imagePromises = activeOffers.map(offer => {
                return new Promise((resolve) => {
                  if (!offer.imageUrl) {
                    resolve();
                    return;
                  }

                  let imageUrl = offer.imageUrl;
                  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
                    if (imageUrl.startsWith('/')) {
                      imageUrl = `${config.api.baseUrl}${imageUrl}`;
                    } else {
                      imageUrl = `${config.api.baseUrl}/${imageUrl}`;
                    }
                  }

                  const img = new Image();
                  img.onload = () => resolve();
                  img.onerror = () => resolve(); // Continue even if image fails
                  img.src = imageUrl;
                });
              });

              // Wait for all images to load (or timeout after 5 seconds)
              await Promise.race([
                Promise.all(imagePromises),
                new Promise(resolve => setTimeout(resolve, 5000))
              ]);
            };

            // Preload images, then show popup
            preloadImages().then(() => {
              setShowOffersPopup(true);
              // Mark as shown in localStorage (persists across page refreshes)
              // This ensures popup only shows once, even after page refreshes
              localStorage.setItem(popupKey, 'true');
            }).catch((err) => {
              console.warn('⚠️ [OffersPopup] Error preloading images, showing popup anyway:', err);
              setShowOffersPopup(true);
              localStorage.setItem(popupKey, 'true');
            });
          } else {
            setOffers([]);
          }
        } else {
          setOffers([]);
        }
      } catch (error) {
        console.error('💥 [OffersPopup] Error fetching offers:', error);
        console.error('💥 [OffersPopup] Error details:', {
          message: error?.message,
          stack: error?.stack
        });
        setOffers([]);
      }
    };

    // Defer offers fetching to not block initial render
    setTimeout(() => {
      fetchOffers();
    }, 100);
  }, [theaterId, location.state]);

  // Fetch combo offers - NON-BLOCKING (runs in background)
  useEffect(() => {
    if (!theaterId) return;

    // Defer combo offers fetching to not block initial page load
    const fetchComboOffers = async () => {
      try {
        const response = await unifiedFetch(`${config.api.baseUrl}/combo-offers/${theaterId}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }, {
          cacheKey: `combo_offers_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const offersList = Array.isArray(data.data) ? data.data : (data.data.comboOffers || []);
            const activeCombos = offersList.filter(combo => combo.isActive);

            // Format combo offers for display
            const formattedCombos = activeCombos.map(combo => ({
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

            setComboOffers(formattedCombos);
          }
        }
      } catch (error) {
        console.error('Error fetching combo offers:', error);
        setComboOffers([]);
      }
    };

    // Defer combo offers fetching to not block initial render
    setTimeout(() => {
      fetchComboOffers();
    }, 150);
  }, [theaterId]);

  // Handle offers popup close
  const handleOffersPopupClose = useCallback(() => {
    setShowOffersPopup(false);
  }, []);

  // Debug: Log popup state changes
  useEffect(() => {
    console.log('🔄 [OffersPopup] State changed:', {
      showOffersPopup,
      offersCount: offers.length,
      theaterId
    });
  }, [showOffersPopup, offers.length, theaterId]);

  // Debug: Log popup state changes
  useEffect(() => {
    console.log('🔄 [OffersPopup] State changed:', {
      showOffersPopup,
      offersCount: offers.length,
      theaterId
    });
  }, [showOffersPopup, offers.length, theaterId]);

  // Memoize filtered collections based on search query and selected category
  const filteredCollections = useMemo(() => {
    // For "All" category: show combo first, then category-wise items
    if (selectedCategory === 'all') {
      // 1. Get combo collections first
      let comboProducts = comboOffers || [];

      // Apply search filter to combos
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        comboProducts = comboProducts.filter(p =>
          p.name?.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );
      }

      // Group combo offers
      const comboGroupedMap = comboProducts.reduce((acc, combo) => {
        const name = combo.name?.trim();
        if (!name) return acc;
        if (!acc[name]) {
          acc[name] = {
            name,
            baseImage: combo.imageUrl,
            category: 'Combo',
            isCombo: true,
            isCollection: false,
            variants: []
          };
        }
        acc[name].variants.push({
          _id: combo._id,
          size: combo.quantity || 'Combo',
          sizeLabel: combo.quantity || null,
          price: parseFloat(combo.offerPrice || 0),
          description: combo.description,
          image: combo.imageUrl,
          originalProduct: {
            ...combo,
            isCombo: true,
            isAvailable: combo.isAvailable !== undefined ? combo.isAvailable : (combo.isActive === true),
            products: combo.products || []
          }
        });
        return acc;
      }, {});

      const comboCollections = Object.values(comboGroupedMap).map(c => {
        const prices = c.variants.map(v => parseFloat(v.price) || 0);
        c.basePrice = Math.min(...prices);
        c.discountPercentage = parseFloat(c.variants[0]?.originalProduct?.discountPercentage || 0);
        c.isCollection = c.variants.length > 1;
        c.variants.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
        c.singleVariant = c.variants[0];
        return c;
      });

      // 2. Get regular product collections
      const regularCollections = filterCollections(productCollections, searchQuery, selectedCategory);

      // 3. Group regular collections by category
      const collectionsByCategory = regularCollections.reduce((acc, collection) => {
        const categoryName = collection.category || 'Other';
        if (!acc[categoryName]) {
          acc[categoryName] = [];
        }
        acc[categoryName].push(collection);
        return acc;
      }, {});

      // 4. Sort categories and flatten: Combo first, then category-wise
      const categoryNames = Object.keys(collectionsByCategory).sort();
      const categoryWiseCollections = categoryNames.flatMap(categoryName => collectionsByCategory[categoryName]);

      // 5. Combine: Combo first, then category-wise items
      return [...comboCollections, ...categoryWiseCollections];
    } else if (selectedCategory === 'offers') {
      // For "Offers" category: show only products with discounts

      let offerProducts = products.filter(p => {
        const discountPercentage = parseFloat(p.discountPercentage || p.pricing?.discountPercentage) || 0;
        return discountPercentage > 0; // Only products with discount
      });


      // Apply search filter
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        offerProducts = offerProducts.filter(p =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );
      }

      // Apply veg/non-veg filter for offers
      if (isVeg && !isNonVeg) {
        // Show only veg items
        offerProducts = offerProducts.filter(p => p.isVeg === true);
      } else if (isNonVeg && !isVeg) {
        // Show only non-veg items
        offerProducts = offerProducts.filter(p => p.isVeg === false);
      }
      // If both are selected or both are false, show all items

      // Apply price range filter
      if (selectedPriceRange !== 'all') {
        offerProducts = offerProducts.filter(p => {
          const price = parseFloat(p.price) || 0;
          switch (selectedPriceRange) {
            case 'under100':
              return price < 100;
            case '100-200':
              return price >= 100 && price <= 200;
            case '200-300':
              return price > 200 && price <= 300;
            case 'above300':
              return price > 300;
            default:
              return true;
          }
        });
      }

      // Convert to collection format for consistent rendering
      const offerItems = offerProducts.map(p => ({
        name: p.name,
        baseImage: p.image,
        category: p.category,
        isCollection: false,
        basePrice: parseFloat(p.price) || 0,
        discountPercentage: parseFloat(p.discountPercentage || p.pricing?.discountPercentage) || 0,
        singleVariant: {
          _id: p._id,
          size: p.size || 'Regular',
          sizeLabel: p.quantity !== undefined && p.quantity !== null && p.quantity !== '' ? p.quantity : null,
          price: parseFloat(p.price) || 0,
          description: p.description,
          image: p.image,
          originalProduct: p
        },
        variants: [{
          _id: p._id,
          size: p.size || 'Regular',
          sizeLabel: p.quantity !== undefined && p.quantity !== null && p.quantity !== '' ? p.quantity : null,
          price: parseFloat(p.price) || 0,
          description: p.description,
          image: p.image,
          originalProduct: p
        }]
      }));

      return offerItems;
    } else if (selectedCategory === 'combo') {
      // For "Combo" category: show only combo offers

      let comboProducts = comboOffers || [];

      // Apply search filter
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        comboProducts = comboProducts.filter(p =>
          p.name?.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );
      }

      // Apply price range filter
      if (selectedPriceRange !== 'all') {
        comboProducts = comboProducts.filter(p => {
          const price = parseFloat(p.offerPrice || 0);
          switch (selectedPriceRange) {
            case 'under100':
              return price < 100;
            case '100-200':
              return price >= 100 && price <= 200;
            case '200-300':
              return price > 200 && price <= 300;
            case 'above300':
              return price > 300;
            default:
              return true;
          }
        });
      }

      // Group combo offers by name (duplicates become a collection modal)
      const groupedMap = comboProducts.reduce((acc, combo) => {
        const name = combo.name?.trim();
        if (!name) return acc;
        if (!acc[name]) {
          acc[name] = {
            name,
            baseImage: combo.imageUrl,
            category: 'Combo',
            isCombo: true,
            isCollection: false,
            variants: []
          };
        }

        acc[name].variants.push({
          _id: combo._id,
          size: combo.quantity || 'Combo',
          sizeLabel: combo.quantity || null,
          price: parseFloat(combo.offerPrice || 0),
          description: combo.description,
          image: combo.imageUrl,
          originalProduct: {
            ...combo,
            isCombo: true,
            // Ensure availability is present for UI and stock checks
            isAvailable: combo.isAvailable !== undefined ? combo.isAvailable : (combo.isActive === true),
            products: combo.products || []
          }
        });

        return acc;
      }, {});

      const comboCollections = Object.values(groupedMap).map(c => {
        const prices = c.variants.map(v => parseFloat(v.price) || 0);
        c.basePrice = Math.min(...prices);
        c.discountPercentage = parseFloat(c.variants[0]?.originalProduct?.discountPercentage || 0);
        c.isCollection = c.variants.length > 1;
        // Sort variants by price
        c.variants.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
        // Provide singleVariant for consistent rendering (when not a collection)
        c.singleVariant = c.variants[0];
        return c;
      });

      return comboCollections;
    } else {
      // For specific categories: show individual products
      // Filter by category ID (not name)

      let individualProducts = products.filter(p => {
        const matches = p.categoryId === selectedCategory;
        if (!matches) {
        }
        return matches;
      });



      // Apply search filter
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        individualProducts = individualProducts.filter(p =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );
      }

      // Apply veg/non-veg filter (only for category view, not "all")
      if (isVeg && !isNonVeg) {
        // Show only veg items
        individualProducts = individualProducts.filter(p => p.isVeg === true);
      } else if (isNonVeg && !isVeg) {
        // Show only non-veg items
        individualProducts = individualProducts.filter(p => p.isVeg === false);
      } else if (isVeg && isNonVeg) {
        // Both selected - show all items (no filter)
        // individualProducts remains unchanged
      }
      // If both are false, show all items (no filter)

      // Apply price range filter (only for category view, not "all")
      if (selectedPriceRange !== 'all') {
        individualProducts = individualProducts.filter(p => {
          const price = parseFloat(p.price) || 0;
          switch (selectedPriceRange) {
            case 'under100':
              return price < 100;
            case '100-200':
              return price >= 100 && price <= 200;
            case '200-300':
              return price > 200 && price <= 300;
            case 'above300':
              return price > 300;
            default:
              return true;
          }
        });
      }

      // Group by product name within the selected category:
      // - duplicates -> isCollection=true -> opens ProductCollectionModal
      // - singles -> isCollection=false -> inline +/- controls
      const grouped = groupProductsIntoCollections(individualProducts);

      // Apply search filter on grouped names (already applied on individualProducts too, but harmless)
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        return grouped.filter(c => c.name?.toLowerCase().includes(query));
      }

      return grouped;
    }
  }, [productCollections, products, selectedCategory, searchQuery, isVeg, isNonVeg, selectedPriceRange, comboOffers]);

  // Check if there are any products with discounts to show "Offers" category
  const hasProductsWithDiscounts = useMemo(() => {
    return products.some(p => {
      const discountPercentage = parseFloat(p.discountPercentage || p.pricing?.discountPercentage) || 0;
      return discountPercentage > 0;
    });
  }, [products]);

  // Check if there are any combo offers to show "Combo" category
  const hasComboOffers = useMemo(() => {
    return comboOffers.length > 0;
  }, [comboOffers]);

  // Fetch notifications for logged-in customers
  const fetchNotifications = useCallback(async () => {
    const phoneNumber = localStorage.getItem('customerPhone');
    if (!phoneNumber) return;

    try {
      const response = await unifiedFetch(
        `${config.api.baseUrl}/notifications/customer/${phoneNumber}?limit=20`,
        {},
        {
          cacheKey: `notifications_${phoneNumber}`,
          cacheTTL: 60000, // 1 minute - notifications change frequently
          forceRefresh: false
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
    }
  }, []);

  // Poll for notifications every 5 seconds if user is logged in
  useEffect(() => {
    const phoneNumber = localStorage.getItem('customerPhone');
    if (phoneNumber) {
      // Fetch immediately
      fetchNotifications();

      // Then poll every 5 seconds
      notificationIntervalRef.current = setInterval(fetchNotifications, 5000);

      return () => {
        if (notificationIntervalRef.current) {
          clearInterval(notificationIntervalRef.current);
        }
      };
    }
  }, [fetchNotifications]);

  // Handle notification click
  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    setShowProfileDropdown(false); // Close profile dropdown if open
  };

  // Mark all notifications as read
  const markAllNotificationsAsRead = async () => {
    const phoneNumber = localStorage.getItem('customerPhone');
    if (!phoneNumber) return;

    try {
      // Optimistically update UI immediately for better UX
      setUnreadCount(0);
      setNotifications(notifications.map(n => ({ ...n, read: true })));

      const response = await unifiedFetch(
        `${config.api.baseUrl}/notifications/customer/${phoneNumber}/read-all`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          }
        },
        {
          forceRefresh: true, // Don't cache PUT requests
          cacheTTL: 0
        }
      );

      // Check if response is ok
      if (!response.ok) {
        console.error('Failed to mark notifications as read:', response.status);
        // Revert optimistic update on error
        fetchNotifications();
        return;
      }

      // Parse response to verify success
      const data = await response.json();
      if (data.success) {
        // Clear notification cache to ensure fresh data on next fetch
        try {
          clearCachePattern(`notifications_${phoneNumber}`);
        } catch (err) {
          console.error('Error clearing notification cache:', err);
        }
      } else {
        // Revert optimistic update if operation failed
        console.error('Mark all as read failed:', data.message);
        fetchNotifications();
      }
    } catch (error) {
      console.error('❌ Error marking notifications as read:', error);
      // Revert optimistic update on error
      fetchNotifications();
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Handle QR Scanner
  const handleQRScan = async () => {
    setShowQRScanner(true);

    // Wait for modal to render, then start camera
    setTimeout(async () => {
      try {
        const video = document.getElementById('qr-video');
        if (video) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // Use back camera on mobile
          });
          video.srcObject = stream;
          video.play();

          // Start scanning with BarcodeDetector if available
          if ('BarcodeDetector' in window) {
            try {
              const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
              startBarcodeScanning(video, barcodeDetector);
            } catch (e) {
              console.warn('BarcodeDetector failed, falling back to jsQR', e);
              startJsQRScanning(video);
            }
          } else {
            // Fallback to jsQR
            startJsQRScanning(video);
          }
        }
      } catch (error) {

        alert('❌ Unable to access camera. Please allow camera access or enter QR code data manually.');
        handleCloseQRScanner();
      }
    }, 100);
  };

  const startBarcodeScanning = (video, detector) => {
    scanIntervalRef.current = setInterval(async () => {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const qrCode = barcodes[0].rawValue;
          handleQRScanSuccess(qrCode);
          clearInterval(scanIntervalRef.current);
        }
      } catch (error) {
        // Silently handle detection errors
      }
    }, 500); // Scan every 500ms
  };

  const startJsQRScanning = (video) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    scanIntervalRef.current = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          handleQRScanSuccess(code.data);
          clearInterval(scanIntervalRef.current);
        }
      }
    }, 500); // Scan every 500ms
  };

  const handleQRScanSuccess = async (decodedText) => {

    // Stop the camera
    stopCamera();

    try {
      // Parse QR code URL to extract screen and seat info
      const url = new URL(decodedText);
      const params = new URLSearchParams(url.search);

      const scannedScreen = params.get('screen') || params.get('SCREEN');
      const scannedSeat = params.get('seat') || params.get('SEAT');
      const scannedQrName = params.get('qrName') || params.get('qrname') || params.get('QRNAME');

      if (scannedQrName) {
        // ✅ FIX: Verify QR code status with backend - use cache-busting for fresh status
        try {
          const encodedQrName = encodeURIComponent(scannedQrName);
          const verifyResponse = await unifiedFetch(
            `${config.api.baseUrl}/single-qrcodes/verify-qr/${encodedQrName}?theaterId=${theaterId}&_t=${Date.now()}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            },
            {
              forceRefresh: true, // Always get latest QR status
              cacheTTL: 0
            }
          );

          // ✅ FIX: Check for 403 status (inactive QR)
          if (verifyResponse.status === 403) {
            setShowQRScanner(false);
            const qrNameParam = scannedQrName ? `&qrName=${encodeURIComponent(scannedQrName)}` : '';
            navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
            return;
          }

          const verifyData = await verifyResponse.json();

          // ✅ FIX: Check if QR is inactive - redirect immediately
          if (!verifyResponse.ok || !verifyData.success || verifyData.isActive === false) {
            // QR code is deactivated or not found
            setShowQRScanner(false);
            const qrNameParam = scannedQrName ? `&qrName=${encodeURIComponent(scannedQrName)}` : '';
            navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
            return;
          }

        } catch (verifyError) {
          // ✅ FIX: If it's a 403 error, redirect to offline page
          if (verifyError.response?.status === 403 || verifyError.message?.includes('403')) {
            setShowQRScanner(false);
            const qrNameParam = scannedQrName ? `&qrName=${encodeURIComponent(scannedQrName)}` : '';
            navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
            return;
          }
          // If verification fails (network error), allow to continue (don't block on network errors)
          console.warn('⚠️ QR verification error, allowing access:', verifyError);
        }
      }

      if (scannedScreen || scannedSeat || scannedQrName) {
        // Update the state with scanned info
        if (scannedScreen) {
          setScreenName(scannedScreen);
          localStorage.setItem('customerScreenName', scannedScreen);
        }
        if (scannedSeat) {
          setSeat(scannedSeat);
          localStorage.setItem('customerSeat', scannedSeat);
        }
        if (scannedQrName) {
          setQrName(scannedQrName);
          localStorage.setItem('customerQrName', scannedQrName);
        }

        setScannedQRData({ screen: scannedScreen, seat: scannedSeat, qrName: scannedQrName });
        setShowQRScanner(false);

        // Show success message
        alert(`✅ QR Code Scanned Successfully!\nScreen: ${scannedScreen || 'N/A'}\nSeat: ${scannedSeat || 'N/A'}`);
      } else {
        alert('❌ Invalid QR Code. No screen or seat information found.');
        setShowQRScanner(false);
      }
    } catch (error) {

      alert('❌ Invalid QR Code format.');
      setShowQRScanner(false);
    }
  };

  const stopCamera = () => {
    const video = document.getElementById('qr-video');
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
  };

  const handleQRScanError = (error) => {
  };

  const handleCloseQRScanner = () => {
    stopCamera();
    setShowQRScanner(false);
  };

  const handleCategoryChange = (categoryId) => {

    // Store the category ID (not the name) for filtering, except for 'all'

    setSelectedCategory(categoryId === 'all' ? 'all' : categoryId);

    // Update URL to persist category selection on refresh
    const params = new URLSearchParams(location.search);
    if (categoryId === 'all') {
      params.delete('category'); // Remove category param for 'all'
    } else {
      params.set('category', categoryId);
    }
    // Replace URL without reloading the page
    window.history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
  };

  // Handle adding product to cart
  const handleAddToCart = (product) => {
    // Check if product is available
    if (product.isAvailable === false) {
      return; // Don't add to cart if not available
    }

    // For combo offers, use shared combo stock validation
    if (product.isCombo) {
      const currentQty = getItemQuantity(product._id);
      const newQty = currentQty + 1; // Adding 1 more combo

      // Get the full combo offer data with products array
      const comboOffer = product.products ? product : (product.originalProduct || product);

      // Use shared combo stock validation utility
      const comboValidation = validateComboStockAvailability(
        comboOffer,
        newQty,
        items, // cart items
        products, // all products list
        { silent: true, excludeComboId: product._id } // exclude current combo from cart consumption
      );

      if (!comboValidation.valid) {
        // Stock insufficient - don't add to cart
        return;
      }
    } else {
      // Regular product validation
      // Check if out of stock (POS-style: silent check, no alert)
      if (isOutOfStock(product)) {
        return; // Don't add if out of stock - button should be disabled
      }

      // Get current quantity in cart (if item already exists)
      const currentQty = getItemQuantity(product._id);
      const newQty = currentQty + 1;

      // Validate stock availability for new total quantity (silent check)
      const validation = validateStockAvailability(product, newQty, { silent: true });
      if (!validation.valid) {
        return; // Don't add if insufficient stock - button should be disabled
      }
    }

    // Get the full combo offer data with products array for cart
    const comboOfferData = product.isCombo && product.products
      ? { ...product, products: product.products }
      : product;

    addItem({
      _id: product._id,
      name: product.name,
      price: product.price || product.offerPrice || 0,
      image: product.image || product.imageUrl,
      quantity: 1,
      taxRate: product.pricing?.taxRate || product.taxRate || 0,
      gstType: product.pricing?.gstType || product.gstType || 'EXCLUDE',
      discountPercentage: product.pricing?.discountPercentage || product.discountPercentage || 0,
      theaterId: theaterId, // Add theater ID to cart item
      isCombo: product.isCombo || false, // Flag for combo offers
      products: comboOfferData.products || product.products || product.originalProduct?.products // ✅ Preserve products array for combos
    });
  };

  // Handle increasing quantity
  const handleIncreaseQuantity = (product) => {
    // Check if product is available
    if (product.isAvailable === false) {
      return; // Don't allow adding if not available
    }

    const currentQty = getItemQuantity(product._id);
    const newQty = currentQty + 1;

    // For combo offers, use shared combo stock validation
    if (product.isCombo) {
      // Get the full combo offer data with products array
      const comboOffer = product.products ? product : (product.originalProduct || product);

      // Use shared combo stock validation utility
      const comboValidation = validateComboStockAvailability(
        comboOffer,
        newQty,
        items, // cart items
        products, // all products list
        { silent: true, excludeComboId: product._id } // exclude current combo from cart consumption
      );

      if (!comboValidation.valid) {
        return; // Don't increase if insufficient stock - button should be disabled
      }
    } else {
      // Regular product validation
      // Validate stock availability for new quantity (silent check - POS-style)
      const validation = validateStockAvailability(product, newQty, { silent: true });
      if (!validation.valid) {
        return; // Don't increase if insufficient stock - button should be disabled
      }
    }

    if (currentQty > 0) {
      updateQuantity(product._id, newQty);
    } else {
      handleAddToCart(product);
    }
  };

  // Handle decreasing quantity
  const handleDecreaseQuantity = (product) => {
    const currentQty = getItemQuantity(product._id);
    if (currentQty > 1) {
      updateQuantity(product._id, currentQty - 1);
    } else if (currentQty === 1) {
      removeItem({ _id: product._id });
    }
  };

  // Handle collection click
  const handleCollectionClick = (collection) => {
    // Check if it's a combo offer
    if (collection.isCombo) {
      setSelectedCombo(collection);
      setIsComboModalOpen(true);
    } else if (collection.isCollection) {
      setSelectedCollection(collection);
      setIsCollectionModalOpen(true);
    }
  };

  // Handle favorite toggle
  const handleToggleFavorite = (productId) => {
    // Validate product ID
    if (!productId) {
      console.error('❌ Invalid product ID for favorite toggle:', productId);
      return;
    }

    // Normalize ID to string for consistent comparison
    const normalizedId = String(productId).trim();

    setFavoriteProducts(prev => {
      // Normalize all IDs in the previous list for comparison
      const normalizedPrev = prev.map(id => String(id).trim()).filter(id => id);
      const isFavorite = normalizedPrev.includes(normalizedId);

      // Create new favorites list
      let newFavorites;
      if (isFavorite) {
        // Remove favorite
        newFavorites = prev.filter(id => String(id).trim() !== normalizedId);
      } else {
        // Add favorite (remove duplicates first)
        newFavorites = [
          ...prev.filter(id => String(id).trim() !== normalizedId && String(id).trim() !== ''),
          normalizedId
        ];
      }


      // Save to localStorage
      try {
        localStorage.setItem('customerFavorites', JSON.stringify(newFavorites));
      } catch (error) {
        console.error('❌ Error saving favorites to localStorage:', error);
      }

      return newFavorites;
    });
  };

  // Handle profile dropdown toggle
  const handleProfileClick = () => {
    setShowProfileDropdown(!showProfileDropdown);
    setShowNotifications(false); // Close notification dropdown if open
  };

  // Handle order history navigation
  const handleOrderHistory = () => {
    setShowProfileDropdown(false);


    // Navigate to order history page with theater info in URL params
    // The order history page will handle login if needed
    const params = new URLSearchParams();
    params.set('theaterid', theaterId);
    if (theater?.name) {
      params.set('theaterName', theater.name);
    }

    navigate(`/customer/order-history?${params.toString()}`);
  };

  // Handle logout
  const handleLogout = () => {
    setShowProfileDropdown(false);

    // Clear cart items from context
    clearCart();

    // Clear customer data from localStorage
    // NOTE: customerFavorites is NOT cleared - favorites should persist across sessions
    localStorage.removeItem('customerPhone');
    localStorage.removeItem('cart');
    localStorage.removeItem('yqpay_cart');
    localStorage.removeItem('checkoutData');
    // localStorage.removeItem('customerFavorites'); // Removed - favorites should persist

    // Redirect to customer landing page with theater ID preserved
    if (theaterId) {
      let landingUrl = `/menu/${theaterId}`;
      const params = new URLSearchParams();

      // Preserve screen and seat info if available
      if (screenName) params.set('screen', screenName);
      if (seat) params.set('seat', seat);
      if (qrName) params.set('qrName', qrName);

      if (params.toString()) {
        landingUrl += `?${params.toString()}`;
      }

      navigate(landingUrl);
    } else {
      // Fallback to generic customer page
      navigate('/customer');
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileDropdown && !event.target.closest('.profile-dropdown-container')) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdown]);

  // Check if coming from landing page
  const isFromLandingPage = location.state?.fromLandingPage === true;

  // Only show loading if we have no cached data and no products/categories yet
  // ⚡ INSTANT: Don't block UI with loading screen - show content immediately
  // Only show loading if we truly have nothing (no cache, no data, no theater)
  // This ensures instant navigation feels instant
  if (loading && products.length === 0 && categories.length === 0 && !theater && !theaterId) {
    return (
      <div className="customer-loading">
        <div className="loading-content">
          <div className="spinner"></div>
          <p className="loading-text">{isFromLandingPage ? 'Loading menu...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Show skeleton loader if we have theaterId but data is still loading (coming from landing page)
  const showSkeletonLoader = loading && isFromLandingPage && theaterId && (products.length === 0 || categories.length === 0);

  // If we have theaterId but no data yet, show UI immediately (data will load in background)

  const totalItems = getTotalItems();
  const defaultEmojis = ['🍔', '🥤', '🥤', '🍿'];

  // Debug: Log header values and filtered collections

  return (
    <div className={`customer-home ${showSkeletonLoader ? 'skeleton-loading' : ''}`}>
      {/* Show offline notice if in offline mode */}
      {shouldShowOfflineUI && <OfflineNotice />}

      {/* Skeleton Loader Overlay (when coming from landing page) */}
      {showSkeletonLoader && (
        <div className="skeleton-loader-overlay">
          <div className="skeleton-loader-content">
            <div className="skeleton-spinner"></div>
            <p className="skeleton-loading-text">Loading menu...</p>
          </div>
        </div>
      )}

      <header className="customer-header">
        {/* Theater Name - First Line */}
        <div className="theater-name-row">
          <h1 className="theater-name">{theater?.name || 'Theater Name'}</h1>
        </div>

        {/* Balance Icons - Second Line */}
        <div className="balance-row">
          <div className="balance-info">
            {screenName && (
              <div className="balance-item">
                <svg className="balance-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
                </svg>
                <span className="balance-text">{screenName}</span>
              </div>
            )}
            {qrName && qrName !== screenName && (
              <div className="balance-item">
                <svg className="balance-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v3h-3v2h5v-5zm0 7h2v-2h-2v2zm-2-2h-2v2h2v-2z" />
                </svg>
                <span className="balance-text">QR: {qrName}</span>
              </div>
            )}
            {seat && (
              <div className="balance-item">
                <svg className="balance-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 18v3h3v-3h10v3h3v-6H4zm15-8h3v3h-3zM2 10h3v3H2zm15 3H7V5c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v8z" />
                </svg>
                <span className="balance-text">Seat {seat}</span>
              </div>
            )}
          </div>
          <div className="header-actions">

            <div className="profile-dropdown-container">
              <button
                className={`profile-btn ${localStorage.getItem('customerPhone') ? 'logged-in' : ''}`}
                aria-label="User profile"
                onClick={handleProfileClick}
              >
                <svg className="profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {localStorage.getItem('customerPhone') && (
                  <span className="login-indicator"></span>
                )}
              </button>

              {showProfileDropdown && (
                <div className="profile-dropdown modern-dropdown">
                  {/* Show Login option if user is NOT logged in */}
                  {!localStorage.getItem('customerPhone') && (
                    <button
                      className="dropdown-card login-card"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        // Build return URL with all current parameters
                        const params = new URLSearchParams();
                        if (theaterId) params.set('theaterid', theaterId);
                        if (theater?.name) params.set('theaterName', theater.name);
                        if (qrName) params.set('qr', qrName);
                        if (seat) params.set('seat', seat);
                        if (screenName) params.set('screen', screenName);

                        navigate('/customer/phone-entry', {
                          state: {
                            returnUrl: `/customer/home?${params.toString()}`,
                            fromLogin: true
                          }
                        });
                      }}
                    >
                      <div className="card-icon login-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                        </svg>
                      </div>
                      <div className="card-content">
                        <h3 className="card-title">Login</h3>
                        <p className="card-subtitle">Sign in to your account</p>
                      </div>
                      <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  )}

                  <button
                    className="dropdown-card"
                    onClick={handleOrderHistory}
                  >
                    <div className="card-icon recent-contacts">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">Order History</h3>
                      <p className="card-subtitle">View your past orders</p>
                    </div>
                    <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  <button
                    className="dropdown-card"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      const params = new URLSearchParams();
                      params.set('theaterid', theaterId);
                      if (theater?.name) {
                        params.set('theaterName', theater.name);
                      }
                      navigate(`/customer/favorites?${params.toString()}`);
                    }}
                  >
                    <div className="card-icon favourites">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">Favourites</h3>
                      <p className="card-subtitle">Your favorite items</p>
                    </div>
                    <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  <button
                    className="dropdown-card"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      const params = new URLSearchParams();
                      params.set('theaterid', theaterId);
                      if (theater?.name) params.set('theaterName', theater.name);
                      navigate(`/customer/help-support?${params.toString()}`);
                    }}
                  >
                    <div className="card-icon schedules">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">Help & Support</h3>
                      <p className="card-subtitle">Get assistance</p>
                    </div>
                    <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  {/* Only show logout if user is logged in */}
                  {localStorage.getItem('customerPhone') && (
                    <button
                      className="dropdown-card logout-card"
                      onClick={handleLogout}
                    >
                      <div className="card-icon logout-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                        </svg>
                      </div>
                      <div className="card-content">
                        <h3 className="card-title">Logout</h3>
                        <p className="card-subtitle">Sign out from your account</p>
                      </div>
                      <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="search-notification-wrapper">
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search for products..."
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Search products"
            />
          </div>

          {/* Bell Icon - Notifications */}
          <div className="notification-dropdown-container">
            <button
              className="notification-btn"
              aria-label="Notifications"
              onClick={handleNotificationClick}
            >
              <svg className="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-dropdown modern-dropdown">
                <div className="notification-header">
                  <h3>Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      className="mark-all-read-btn"
                      onClick={markAllNotificationsAsRead}
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="no-notifications">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      <p>No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification._id}
                        className={`notification-item ${!notification.read ? 'unread' : ''} ${notification.type}`}
                      >
                        <div className="notification-icon">
                          {notification.type === 'preparing' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                          )}
                          {notification.type === 'delivered' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                              <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                          )}
                          {notification.type === 'ready' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                          )}
                          {notification.type === 'cancelled' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="15" y1="9" x2="9" y2="15"></line>
                              <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                          )}
                        </div>
                        <div className="notification-content">
                          <h4>{notification.title}</h4>
                          <p>{notification.message}</p>
                          <span className="notification-time">
                            {new Date(notification.timestamp).toLocaleString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        {!notification.read && <span className="unread-dot"></span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Categories Section */}
        <div className="categories-section">
          <button
            className={`category-chip ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('all')}
            aria-label="All categories"
          >
            <div className="category-content">
              <div className="category-icon-large">
                <img
                  src={categoryImages.all || "/images/All.png"}
                  alt="All Categories"
                  className="category-img image-cover"
                  loading="eager"
                  onError={(e) => {
                    console.error('❌ [Category] Failed to load All category image');
                    // Fallback to static image if dynamic image fails
                    if (e.target.src !== "/images/All.png") {
                      e.target.src = "/images/All.png";
                    } else {
                      // Final fallback to SVG placeholder
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23e5e7eb" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%236b7280" font-size="80"%3E🍿%3C/text%3E%3C/svg%3E';
                      e.target.onerror = null; // Prevent infinite loop
                    }
                  }}
                  onLoad={() => {
                  }}
                />
              </div>
              <span className="category-name">All</span>
            </div>
          </button>

          {/* Offer Category - Shows products with discounts - Only show if there are products with discounts */}
          {hasProductsWithDiscounts && (
            <button
              className={`category-chip ${selectedCategory === 'offers' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('offers')}
              aria-label="Offers and Discounts"
            >
              <div className="category-content">
                <div className="category-icon-large">
                  <img
                    src={categoryImages.offers || "/images/Offer.png"}
                    alt="Offers"
                    className="category-img image-cover"
                    loading="eager"
                    onError={(e) => {
                      console.error('❌ [Category] Failed to load Offers category image');
                      // Fallback to static image if dynamic image fails
                      if (e.target.src !== "/images/Offer.png") {
                        e.target.src = "/images/Offer.png";
                      } else {
                        // Final fallback to SVG placeholder
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23fee2e2" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23dc2626" font-size="80"%3E🎁%3C/text%3E%3C/svg%3E';
                        e.target.onerror = null; // Prevent infinite loop
                      }
                    }}
                    onLoad={() => {
                    }}
                  />
                </div>
                <span className="category-name">Offers</span>
              </div>
            </button>
          )}

          {/* Combo Category - Shows combo offers - Only show if there are combo offers */}
          {hasComboOffers && (
            <button
              className={`category-chip ${selectedCategory === 'combo' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('combo')}
              aria-label="Combo Offers"
            >
              <div className="category-content">
                <div className="category-icon-large">
                  <img
                    src={categoryImages.combo || "/images/combo.png"}
                    alt="Combo Offers"
                    className="category-img image-cover"
                    loading="eager"
                    onError={(e) => {
                      console.error('❌ [Category] Failed to load Combo category image');
                      // Fallback to static image if dynamic image fails
                      if (e.target.src !== "/images/combo.png") {
                        e.target.src = "/images/combo.png";
                      } else {
                        // Final fallback to SVG placeholder
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23fef3c7" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23f59e0b" font-size="80"%3E🍱%3C/text%3E%3C/svg%3E';
                        e.target.onerror = null; // Prevent infinite loop
                      }
                    }}
                    onLoad={() => {
                    }}
                  />
                </div>
                <span className="category-name">Combo</span>
              </div>
            </button>
          )}

          {categories.map((category) => {
            // ✅ FIX: Use actual category image with proper URL handling
            let categoryImgUrl = null;

            // Check multiple possible image field names (in order of priority)
            const categoryImage = category.image || category.imageUrl || category.categoryImage || category.iconUrl || category.iconImage || null;

            console.log('🖼️ [Category] Rendering category image:', {
              categoryName: category.name,
              categoryId: category._id,
              hasImage: !!categoryImage,
              imageValue: categoryImage,
              imageType: typeof categoryImage
            });

            if (categoryImage && typeof categoryImage === 'string' && categoryImage.trim().length > 0) {
              const trimmedImage = categoryImage.trim();

              // Handle different URL types
              if (trimmedImage.startsWith('http://') || trimmedImage.startsWith('https://')) {
                // Absolute URL - use directly
                categoryImgUrl = trimmedImage;
              } else if (trimmedImage.startsWith('data:') || trimmedImage.startsWith('blob:')) {
                // Base64 or blob URL - use directly
                categoryImgUrl = trimmedImage;
              } else if (trimmedImage.startsWith('/')) {
                // Relative URL - prepend API base URL
                categoryImgUrl = `${config.api.baseUrl}${trimmedImage}`;
              } else if (trimmedImage.includes('storage.googleapis.com') || trimmedImage.includes('googleapis.com')) {
                // GCS URL - use directly
                categoryImgUrl = trimmedImage;
              } else {
                // Assume relative path - prepend API base URL
                categoryImgUrl = `${config.api.baseUrl}/${trimmedImage}`;
              }

              console.log('✅ [Category] Constructed image URL:', {
                original: trimmedImage,
                final: categoryImgUrl
              });
            } else {
              console.warn('⚠️ [Category] No valid image found for category:', category.name);
            }

            // Fallback to high-quality default images based on category type/name
            if (!categoryImgUrl) {
              const categoryLower = (category.name || '').toLowerCase();
              if (categoryLower.includes('pop') || categoryLower.includes('corn')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1585647347384-2593bc35786b?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('burger') || categoryLower.includes('sandwich')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('french') || categoryLower.includes('fries')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('ice') || categoryLower.includes('cream')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('pizza')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('drink') || categoryLower.includes('beverage') || categoryLower.includes('cola') || categoryLower.includes('soda')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('coffee')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('snack') || categoryLower.includes('chips')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('sweet') || categoryLower.includes('dessert') || categoryLower.includes('candy')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('hot') || categoryLower.includes('dog')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1612392062798-2ba2c6bb84e0?w=200&h=200&fit=crop&q=80';
              } else if (categoryLower.includes('nachos')) {
                categoryImgUrl = 'https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=200&h=200&fit=crop&q=80';
              } else {
                // Default food image
                categoryImgUrl = 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=200&h=200&fit=crop&q=80';
              }
            }

            // ✅ FIX: Use getImageSrc to get cached/optimized image URL
            // Ensure we always have a valid URL (use fallback if categoryImgUrl is null)
            let displayImageUrl = categoryImgUrl;
            if (categoryImgUrl) {
              // Try to get cached version first
              const cachedUrl = getImageSrc(categoryImgUrl);
              displayImageUrl = cachedUrl || categoryImgUrl;
            }

            // ✅ FIX: If no image URL, use emoji fallback immediately
            const categoryLower = (category.name || '').toLowerCase();
            const emoji = categoryLower.includes('burger') ? '🍔' :
              categoryLower.includes('fries') ? '🍟' :
                categoryLower.includes('ice') ? '🍦' :
                  categoryLower.includes('pizza') ? '🍕' :
                    categoryLower.includes('pop') ? '🍿' :
                      categoryLower.includes('drink') || categoryLower.includes('beverage') ? '🥤' :
                        categoryLower.includes('coffee') ? '☕' : '🍽️';

            const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23e5e7eb" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%236b7280" font-size="80"%3E${emoji}%3C/text%3E%3C/svg%3E`;

            // ✅ FIX: Always use a valid image URL (fallback if needed)
            let finalImageUrl = displayImageUrl || fallbackSvg;

            // ✅ FIX: Handle different URL types properly
            let imageSrc = finalImageUrl;
            if (finalImageUrl && !finalImageUrl.startsWith('data:') && !finalImageUrl.startsWith('blob:')) {
              // Handle GCS URLs - try direct first, fallback to proxy if needed
              if (finalImageUrl.includes('storage.googleapis.com') || finalImageUrl.includes('googleapis.com')) {
                // Try direct GCS URL first (might work with CORS)
                imageSrc = finalImageUrl;
                // Note: If CORS fails, the onError handler will catch it and use fallback
              } else if (!finalImageUrl.startsWith('http://') && !finalImageUrl.startsWith('https://')) {
                // Relative path - construct full URL
                if (finalImageUrl.startsWith('/')) {
                  imageSrc = `${config.api.baseUrl}${finalImageUrl}`;
                } else {
                  imageSrc = `${config.api.baseUrl}/${finalImageUrl}`;
                }
              }
            }

            console.log('🎨 [Category] Final image URL for rendering:', {
              categoryName: category.name,
              displayImageUrl: displayImageUrl,
              finalImageUrl: finalImageUrl,
              imageSrc: imageSrc,
              hasImage: !!displayImageUrl
            });

            return (
              <button
                key={category._id}
                className={`category-chip ${selectedCategory === category._id ? 'active' : ''}`}
                onClick={() => handleCategoryChange(category._id)}
                aria-label={`Filter by ${category.name}`}
              >
                <div className="category-content">
                  <div className="category-icon-large">
                    <img
                      src={imageSrc}
                      alt={category.name || 'Category'}
                      className="category-img image-cover"
                      loading="eager"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        borderRadius: '50%'
                      }}
                      onError={(e) => {
                        console.error('❌ [Category] Image failed to load:', {
                          categoryName: category.name,
                          imageUrl: imageSrc,
                          originalUrl: categoryImgUrl,
                          displayUrl: displayImageUrl
                        });
                        // Use emoji fallback on error - only if not already fallback
                        if (!e.target.src.includes('data:image/svg+xml')) {
                          e.target.src = fallbackSvg;
                          e.target.onerror = null; // Prevent infinite loop
                        }
                      }}
                      onLoad={() => {
                        console.log('✅ [Category] Image loaded successfully:', {
                          categoryName: category.name,
                          imageUrl: imageSrc
                        });
                      }}
                    />
                  </div>
                  <span className="category-name">{category.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </header>
      <main className="customer-main">

        {/* Banner Carousel - Theater-specific scrolling banners - Only show in "All" category */}
        {theaterId && selectedCategory === 'all' ? (
          <BannerCarousel
            theaterId={theaterId}
            autoScrollInterval={4000}
          />
        ) : theaterId ? null : (
          <div className="theater-id-warning">
            ⚠️ Theater ID not found. Please scan a valid QR code.
          </div>
        )}

        {/* Filter Section - Only show when not in "All" category */}
        {selectedCategory !== 'all' && (
          <div className="filter-section">
            <div className="filter-chips-container">
              {/* Veg Toggle Switch */}
              <div className="veg-toggle-container">
                <span className="veg-toggle-label">Veg</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={isVeg}
                    onChange={() => setIsVeg(!isVeg)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Non Veg Toggle Switch */}
              <div className="veg-toggle-container">
                <span className="veg-toggle-label">Non Veg</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={isNonVeg}
                    onChange={() => setIsNonVeg(!isNonVeg)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* All Button - Clear all filters */}
              <button
                className={`filter-chip ${!isVeg && !isNonVeg && selectedPriceRange === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setIsVeg(false);
                  setIsNonVeg(false);
                  setSelectedPriceRange('all');
                }}
              >
                <span>All</span>
              </button>

              {/* Price Range Filters */}
              <button
                className={`filter-chip ${selectedPriceRange === 'under100' ? 'active' : ''}`}
                onClick={() => setSelectedPriceRange(selectedPriceRange === 'under100' ? 'all' : 'under100')}
              >
                <span>Under ₹100</span>
              </button>

              <button
                className={`filter-chip ${selectedPriceRange === '100-200' ? 'active' : ''}`}
                onClick={() => setSelectedPriceRange(selectedPriceRange === '100-200' ? 'all' : '100-200')}
              >
                <span>₹100-200</span>
              </button>

              <button
                className={`filter-chip ${selectedPriceRange === '200-300' ? 'active' : ''}`}
                onClick={() => setSelectedPriceRange(selectedPriceRange === '200-300' ? 'all' : '200-300')}
              >
                <span>₹200-300</span>
              </button>

              <button
                className={`filter-chip ${selectedPriceRange === 'above300' ? 'active' : ''}`}
                onClick={() => setSelectedPriceRange(selectedPriceRange === 'above300' ? 'all' : 'above300')}
              >
                <span>Above ₹300</span>
              </button>

              {/* Clear Filters - Show only when filters are active */}
              {(isVeg || isNonVeg || selectedPriceRange !== 'all') && (
                <button
                  className="filter-chip clear-filter"
                  onClick={() => {
                    setIsVeg(false);
                    setIsNonVeg(false);
                    setSelectedPriceRange('all');
                  }}
                >
                  <span>✕ Clear</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Products List - Collection Design */}
        <section className="products-section">
          <div className="products-list">
            {(() => {

              if (filteredCollections.length > 0) {
                return filteredCollections.map((collection, index) => {
                  const defaultVariant = getDefaultVariant(collection);
                  let imgUrl = defaultVariant?.image || collection.baseImage;

                  // 🎨 Use cached image URL if available for instant display
                  if (imgUrl && typeof imgUrl === 'string') {
                    // Normalize URL first
                    if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:') && !imgUrl.startsWith('blob:')) {
                      imgUrl = imgUrl.startsWith('/')
                        ? `${config.api.baseUrl}${imgUrl}`
                        : `${config.api.baseUrl}/${imgUrl}`;
                    }
                    // Try to get cached version for instant display
                    const cachedImageUrl = getImageSrc(imgUrl);
                    if (cachedImageUrl) {
                      imgUrl = cachedImageUrl;
                    }
                  }

                  const product = defaultVariant?.originalProduct || defaultVariant;
                  // Ensure combo flag and products array are preserved from collection to product
                  if (collection.isCombo && product) {
                    product.isCombo = true;
                    // Preserve products array for combo stock validation
                    if (collection.products && !product.products) {
                      product.products = collection.products;
                    }
                  }
                  const productQty = product ? getItemQuantity(product._id) : 0;

                  // Check if ANY variant in the collection is available
                  const hasAvailableVariant = collection.variants?.some(variant =>
                    variant.originalProduct?.isAvailable === true
                  );
                  const isProductAvailable = collection.isCollection
                    ? hasAvailableVariant
                    : (product?.isAvailable === true);

                  // Debug logging
                  if (!isProductAvailable) {
                  }

                  return (
                    <div
                      key={collection.isCollection ? `collection-${collection.name}` : defaultVariant?._id}
                      className={`product-card ${collection.isCollection ? 'collection-card' : 'single-product-card'} ${!isProductAvailable ? 'out-of-stock' : ''} ${(collection.isCollection && isProductAvailable) ? 'collection-card-clickable' : 'collection-card-default'}`}
                      onClick={
                        isProductAvailable && (collection.isCollection || collection.isCombo)
                          ? () => handleCollectionClick(collection)
                          : undefined
                      }
                    >
                      {/* Image Container */}
                      <div className="product-image-container">
                        {imgUrl ? (
                          <InstantImage
                            src={imgUrl}
                            alt={collection.name}
                            className="product-img image-cover"
                            loading="eager"
                            decoding="async"
                            lazy={false}
                            fetchPriority="high"
                            onError={(e) => {
                              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-size="40"%3E🍽️%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        ) : (
                          <div className="product-placeholder">
                            <span>🍽️</span>
                          </div>
                        )}
                        {/* Discount Badge */}
                        {product?.discountPercentage > 0 && isProductAvailable && (
                          <div className="product-discount-badge">
                            {product.discountPercentage}% OFF
                          </div>
                        )}

                        {/* Favorite Heart Icon - Show for single products only (not collections/combo) */}
                        {!collection.isCollection && !collection.isCombo && (
                          <button
                            className="favorite-heart-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const productId = product?._id || defaultVariant?._id;
                              handleToggleFavorite(productId);
                            }}
                            aria-label="Toggle favorite"
                          >
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill={(() => {
                                const productId = product?._id || defaultVariant?._id;
                                const normalizedId = productId ? String(productId).trim() : null;
                                const normalizedFavorites = favoriteProducts.map(id => String(id).trim());
                                return normalizedFavorites.includes(normalizedId) ? "#e74c3c" : "none";
                              })()}
                              stroke={(() => {
                                const productId = product?._id || defaultVariant?._id;
                                const normalizedId = productId ? String(productId).trim() : null;
                                const normalizedFavorites = favoriteProducts.map(id => String(id).trim());
                                return normalizedFavorites.includes(normalizedId) ? "#e74c3c" : "#fff";
                              })()}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="product-details">
                        <h3 className="product-name">{collection.name}</h3>
                        {collection.isCollection ? (
                          <>
                            <p className="product-collection-info">
                              {collection.variants.length > 1 ? `${collection.variants.length} sizes available` : '1 size available'}
                            </p>
                            <p className="product-price-range">
                              {collection.variants.length > 1 ? `Starts From ₹${parseFloat(collection.basePrice || 0).toFixed(2)}` : `₹${parseFloat(collection.basePrice || 0).toFixed(2)}`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="product-quantity">
                              {(() => {
                                // Get the product object (from variant or directly)
                                const product = defaultVariant?.originalProduct || defaultVariant;

                                // Check all possible unit locations
                                const unit = product?.unit
                                  || product?.quantityUnit
                                  || product?.inventory?.unit
                                  || product?.stockUnit
                                  || null;

                                // Priority 1: Check sizeLabel from variant (set from product.quantity in productCollections.js)
                                const rawSizeLabel = defaultVariant?.sizeLabel;
                                if (rawSizeLabel !== null && rawSizeLabel !== undefined && rawSizeLabel !== '') {
                                  const sizeLabel = String(rawSizeLabel).trim();

                                  // Skip if sizeLabel is empty or just whitespace after trimming
                                  if (sizeLabel && sizeLabel !== 'null' && sizeLabel !== 'undefined') {
                                    // Check if sizeLabel is just a number (needs unit appended)
                                    // If it's already a formatted string like "150 ML" or "1 Pic", use it as-is
                                    const isJustNumber = /^\d+(\.\d+)?$/.test(sizeLabel);

                                    if (isJustNumber && unit) {
                                      // sizeLabel is just a number, combine with unit
                                      const combinedLabel = `${sizeLabel} ${unit}`;
                                      return formatCustomerUnitLabel(combinedLabel);
                                    } else if (sizeLabel) {
                                      // sizeLabel already contains unit or is formatted, use as-is
                                      return formatCustomerUnitLabel(sizeLabel);
                                    }
                                  }
                                }

                                // Priority 2: Get quantity directly from originalProduct (most reliable source)
                                // Check multiple possible locations for quantity
                                const quantity = defaultVariant?.originalProduct?.quantity
                                  || product?.quantity
                                  || defaultVariant?.quantity
                                  || null;

                                // Check if quantity is valid (not null, undefined, empty string, or 'null')
                                const quantityStr = quantity !== null && quantity !== undefined ? String(quantity).trim() : '';
                                const hasValidQuantity = quantityStr !== ''
                                  && quantityStr !== 'null'
                                  && quantityStr.toLowerCase() !== 'null'
                                  && quantityStr !== 'undefined'
                                  && quantityStr.length > 0;

                                // If we have a valid quantity string
                                if (hasValidQuantity) {
                                  // Check if quantity already contains unit (e.g., "150 ML", "1 Nos", "6 Nos")
                                  const hasUnitInQuantity = !/^\d+(\.\d+)?$/.test(quantityStr);

                                  if (hasUnitInQuantity) {
                                    // Quantity already contains unit (e.g., "150 ML", "1 Nos"), use as-is
                                    return formatCustomerUnitLabel(quantityStr);
                                  } else if (unit) {
                                    // Quantity is just a number, combine with unit
                                    const combinedLabel = `${quantityStr} ${unit}`;
                                    return formatCustomerUnitLabel(combinedLabel);
                                  } else {
                                    // Quantity is just a number but no unit available
                                    return formatCustomerUnitLabel(quantityStr);
                                  }
                                }

                                // Priority 3: If no quantity but we have a unit, use default quantity of "1" with unit
                                // This handles cases where products don't have quantity set but have a unit
                                if (unit) {
                                  const defaultQuantity = '1';
                                  const combinedLabel = `${defaultQuantity} ${unit}`;
                                  return formatCustomerUnitLabel(combinedLabel);
                                }

                                // Fallback to 'Regular' only if no quantity AND no unit data is available
                                return 'Regular';
                              })()}
                            </p>
                            {product?.discountPercentage > 0 ? (
                              <div className="product-price-container">
                                <span className="product-discounted-price">
                                  ₹{(parseFloat(defaultVariant?.price || 0) * (1 - product.discountPercentage / 100)).toFixed(2)}
                                </span>
                                <span className="product-original-price">
                                  ₹{parseFloat(defaultVariant?.price || 0).toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <p className="product-regular-price">
                                ₹{parseFloat(defaultVariant?.price || 0).toFixed(2)}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Actions Section - Only for single NON-combo products */}
                      {!collection.isCollection && !collection.isCombo && product && (
                        <div className="product-item-actions" onClick={(e) => e.stopPropagation()}>
                          {isProductAvailable ? (() => {
                            // Check if can add more (for plus button state)
                            const currentQty = getItemQuantity(product._id);
                            // For combo offers, use shared combo stock validation
                            const canAddMore = product.isCombo
                              ? (() => {
                                // Get the full combo offer data with products array
                                const comboOffer = product.products ? product : (product.originalProduct || collection);
                                // Use shared combo stock validation utility
                                const comboValidation = validateComboStockAvailability(
                                  comboOffer,
                                  currentQty + 1,
                                  items,
                                  products,
                                  { silent: true, excludeComboId: product._id }
                                );
                                return comboValidation.valid;
                              })()
                              : (currentQty === 0
                                ? !isOutOfStock(product)
                                : validateStockAvailability(product, currentQty + 1, { silent: true }).valid);

                            return (
                              <>
                                <div className="product-actions">
                                  <button
                                    className="quantity-btn minus"
                                    onClick={() => handleDecreaseQuantity(product)}
                                    disabled={productQty === 0}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                  </button>

                                  <span className="quantity-display">{productQty}</span>

                                  <button
                                    className={`quantity-btn plus ${!canAddMore ? 'disabled' : ''}`}
                                    onClick={() => handleIncreaseQuantity(product)}
                                    disabled={!canAddMore}
                                    title={!canAddMore ? 'Insufficient stock' : ''}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                </div>
                              </>
                            );
                          })() : (
                            <div className="out-of-stock-message">
                              <span>Out Of Stock</span>
                            </div>
                          )}
                          {/* Veg/Non-Veg Indicator intentionally hidden on product list cards (customer UI) */}
                        </div>
                      )}
                    </div>
                  );
                });
              } else {
                console.warn('⚠️ [CustomerHome] No filtered collections to display');
                return (
                  <div className="empty-products">
                    <p>No products found {searchQuery ? `for "${searchQuery}"` : 'in this category'}</p>
                  </div>
                );
              }
            })()}
          </div>
        </section>
      </main>

      {/* Footer - Image Disclaimer */}
      <footer className="customer-home-footer">
        <div className="footer-disclaimer-container">
          <div className="footer-disclaimer-content">
            <h3 className="footer-disclaimer-title">Image Disclaimer</h3>
            <ul className="footer-disclaimer-list">
              <li>Images displayed in this menu are AI-generated and are for illustration purposes only.</li>
              <li>Actual food items may differ in appearance, color, size, and presentation.</li>
              <li>These images should not be considered an exact representation of the real food served.</li>
            </ul>
          </div>
        </div>
      </footer>

      {/* Floating Cart Icon */}
      {cart.items && cart.items.length > 0 && (
        <button
          className="floating-cart-icon"
          onClick={() => {
            const params = new URLSearchParams({
              ...(theaterId && { theaterid: theaterId }),
              ...(theater?.name && { theatername: theater.name }),
              ...(qrName && { qrname: qrName }),
              ...(seat && { seat: seat }),
              ...(selectedCategory && selectedCategory !== 'all' && { category: selectedCategory })
            });
            navigate(`/customer/cart?${params.toString()}`);
          }}
          aria-label={`View Cart (${cart.items.length} items)`}
        >
          <span className="cart-icon">PAY</span>
          <span className="cart-count">{cart.items.length}</span>
        </button>
      )}

      {/* Product Collection Modal */}
      <ProductCollectionModal
        collection={selectedCollection}
        isOpen={isCollectionModalOpen}
        onClose={() => setIsCollectionModalOpen(false)}
        products={products}
      />

      {/* Combo Collection Modal (same structure as ProductCollectionModal, separate UI) */}
      <ComboCollectionModal
        collection={selectedCombo}
        isOpen={isComboModalOpen}
        onClose={() => setIsComboModalOpen(false)}
        products={products}
      />

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="qr-scanner-modal">
          <div className="qr-scanner-overlay" onClick={handleCloseQRScanner}></div>
          <div className="qr-scanner-container">
            <div className="qr-scanner-header">
              <h2>Scan QR Code</h2>
              <button className="qr-close-btn" onClick={handleCloseQRScanner}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="qr-scanner-content">
              <div className="qr-scanner-instructions">
                <p>📱 Point your camera at a QR code</p>
                <p>The screen and seat info will be updated automatically</p>
              </div>
              <div className="qr-scanner-video-container">
                <video
                  id="qr-video"
                  className="qr-scanner-video"
                  autoPlay
                  playsInline
                ></video>
                <div className="qr-scanner-frame"></div>
              </div>
              <button className="qr-cancel-btn" onClick={handleCloseQRScanner}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offers Popup - Show on first visit */}
      {showOffersPopup && offers.length > 0 && (
        <OffersPopup
          offers={offers}
          onClose={handleOffersPopupClose}
        />
      )}

      {/* Order Success Toast */}
      {showOrderSuccess && (
        <div className="order-success-toast" style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideDown 0.5s ease-out',
          minWidth: '300px',
          maxWidth: '90%'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            fontWeight: 'bold'
          }}>✓</div>
          <div>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Order Placed Successfully!</h4>
            {lastOrderId && <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>Order #{lastOrderId}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerHome;
