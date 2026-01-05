import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ErrorBoundary from '@components/ErrorBoundary';
import OfflineNotice from '@components/OfflineNotice';
import useNetworkStatus from '@hooks/useNetworkStatus';
import { getCachedData, setCachedData } from '@utils/cacheUtils';
import { preCacheImages, cacheProductImages } from '@utils/globalImageCache'; // 🎨 Pre-cache product images
import config from '@config';
import '@styles/customer/CustomerLanding.css';
import '@styles/pages/customer/CustomerLanding.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import LandingPageImage from '../../home/images/LandingPage.png';



// Exact cinema combo image - purple popcorn bucket with gold designs and black drink cup
const CINEMA_COMBO_IMAGE = "/images/cinema-combo.jpg.png"; // Local branded cinema combo image

// Lazy loading image component
const LazyFoodImage = React.memo(({ src, alt, className }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (src) {
      const img = new Image();
      img.onload = () => {
        setImageSrc(src);
        setIsLoading(false);
      };
      img.onerror = () => {
        setHasError(true);
        setIsLoading(false);
      };
      img.src = src;
    }
  }, [src]);

  if (isLoading) {
    return (
      <div className={`${className} loading-placeholder`}>
        <div className="loading-shimmer"></div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className={`${className} error-placeholder`}>
        <span>🍿</span>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
});

LazyFoodImage.displayName = 'LazyFoodImage';

const CustomerLanding = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams(); // Get route parameters (for /menu/:theaterId)

  // Network status for offline handling
  const { shouldShowOfflineUI, isNetworkError } = useNetworkStatus();

  // State management
  const [theater, setTheater] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theaterId, setTheaterId] = useState(null);
  const [screenName, setScreenName] = useState(null);
  const [seatId, setSeatId] = useState(null);
  const [qrName, setQrName] = useState(null); // QR name from scanned code
  const [qrVerified, setQrVerified] = useState(false); // Track if QR verification is complete
  const [isVerifying, setIsVerifying] = useState(false); // Track if verification is in progress
  const [isNavigating, setIsNavigating] = useState(false); // Navigation loading state

  // Extract parameters from URL (theater ID, screen name, seat ID, QR name)
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);

    // Theater ID can come from route parameter (/menu/:theaterId) or query string (?theaterid=...)
    const routeTheaterId = params.theaterId; // From /menu/:theaterId
    const queryTheaterId = urlParams.get('theaterid') || urlParams.get('theaterId') || urlParams.get('THEATERID');
    const id = routeTheaterId || queryTheaterId;

    // Support both lowercase and uppercase parameter names for backwards compatibility
    const screen = urlParams.get('screen') || urlParams.get('SCREEN');
    const seat = urlParams.get('seat') || urlParams.get('SEAT');
    const qr = urlParams.get('qrName') || urlParams.get('qrname') || urlParams.get('QRNAME');

    if (!id) {
      setError('Theater ID is required');
      setLoading(false);
      return;
    }


    setTheaterId(id);
    setScreenName(screen);
    setSeatId(seat);
    setQrName(qr);
    
    // ⚡ INSTANT PREFETCH: Start prefetching IMMEDIATELY when theaterId is available
    // This ensures data is ready when user clicks "Food Order" button
    const customerHomeCacheKey = `customerHome_${id}`;
    const existingCache = getCachedData(customerHomeCacheKey);
    
    // Only prefetch if cache doesn't exist or is empty
    if (!existingCache || !existingCache.products || existingCache.products.length === 0) {
      // Start prefetch immediately in background (non-blocking)
      Promise.all([
        unifiedFetch(`${config.api.baseUrl}/theater-products/${id}?stockSource=cafe`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          mode: 'cors'
        }, {
          cacheKey: `theater_products_${id}_cafe`,
          cacheTTL: 300000 // 5 minutes
        }),
        unifiedFetch(`${config.api.baseUrl}/theater-categories/${id}`, {}, {
          cacheKey: `theater_categories_${id}`,
          cacheTTL: 300000 // 5 minutes
        })
      ]).catch(() => {}); // Silent fail - don't block UI
    }

    // ✅ CRITICAL: Verify QR code IMMEDIATELY if qrName is present
    // This must happen before page renders to block inactive QR codes
    if (qr && id) {
      setIsVerifying(true);
      setQrVerified(false); // Reset to false to block rendering until verified
      verifyQRCode(qr, id).then(() => {
        // Only set verified to true if verification succeeded (no redirect happened)
        setQrVerified(true);
      }).catch((error) => {
        // If redirect happened, verification will be handled in verifyQRCode
        // Don't set verified to true if there was an error
        console.error('QR verification failed:', error);
      }).finally(() => {
        setIsVerifying(false);
      });
    } else {
      // No QR name, allow access immediately
      setQrVerified(true);
    }
  }, [location.search, params.theaterId]);

  // Verify QR code status - CRITICAL: Must check immediately and block if inactive
  const verifyQRCode = async (qrName, theaterId) => {
    try {

      // ✅ FIX: Use cache-busting to ensure we get fresh status
      // URL encode the qrName to handle special characters
      const encodedQrName = encodeURIComponent(qrName);
      const apiUrl = `${config.api.baseUrl}/single-qrcodes/verify-qr/${encodedQrName}?theaterId=${theaterId}&_t=${Date.now()}`;


      // ✅ FIX: Fetch without cache to get latest status
      // unifiedFetch handles cache-busting with forceRefresh
      const response = await unifiedFetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }, {
        forceRefresh: true, // Bypass cache to get latest QR status
        cacheTTL: 0
      });

      // ✅ FIX: unifiedFetch throws errors for non-OK responses (including 403)
      // So if we get here, response should be OK
      // But check status code first before parsing
      const status = response?.status;
      if (status === 403) {
        // 403 means QR is inactive - redirect immediately
        console.warn('❌ QR code is deactivated (403 status) - redirecting to offline page');
        const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
        navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
        // Throw error to prevent setting qrVerified to true
        throw new Error('QR code is inactive (403)');
      }

      // ✅ FIX: Ensure response exists and has json method
      if (!response || typeof response.json !== 'function') {
        console.warn('⚠️ Verification endpoint error: Invalid response object');
        // Don't set verified if we can't parse response
        throw new Error('Invalid response from verification endpoint');
      }

      const data = await response.json();

      // ✅ CRITICAL: Check if QR code is inactive - redirect IMMEDIATELY
      // Check multiple possible values for isActive
      if (data.isActive === false || data.isActive === 'false' || data.isActive === 0) {
        console.warn('❌ QR code is deactivated (isActive=false) - redirecting to offline page');
        const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
        // Use replace: true to prevent back navigation
        navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
        // Throw error to prevent setting qrVerified to true
        throw new Error('QR code is inactive');
      }

      // ✅ CRITICAL: Also check if success is false and isActive is explicitly false
      if (data.success === false && (data.isActive === false || data.isActive === 'false')) {
        console.warn('❌ QR code verification failed (success=false, isActive=false) - redirecting');
        const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
        navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
        throw new Error('QR code is inactive');
      }

      // If QR not found but not explicitly inactive, allow to continue (might be a new QR)
      if (data.success === false && data.isActive !== false) {
        return;
      }

      if (data.success === true && data.isActive === true) {
        return;
      }

      // Default: allow access if verification is unclear
    } catch (error) {
      console.error('❌ QR verification error:', error);
      // ✅ FIX: If it's a 403 error (inactive), redirect
      if (error.response?.status === 403 || error.message?.includes('403') || error.status === 403) {
        console.warn('❌ QR code is deactivated (403 error) - redirecting to offline page');
        const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
        navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
        // Re-throw to prevent setting qrVerified to true
        throw error;
      }

      // ✅ FIX: Check if unifiedFetch threw an error with status 403
      if (error.status === 403) {
        console.warn('❌ QR code is deactivated (unifiedFetch 403) - redirecting to offline page');
        const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
        navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
        throw error;
      }
      // Don't redirect on other network errors - allow user to continue browsing
    }
  };

  // ✅ REAL-TIME VALIDATION: Continuously check QR status while user is on the page
  // This ensures immediate redirect if QR is turned OFF while customer is using the page
  useEffect(() => {
    if (!qrName || !theaterId || !qrVerified) {
      // Only poll if QR name exists, theater ID exists, and QR was initially verified
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
          console.warn('🚨 [Real-time] QR code was turned OFF - redirecting immediately');
          const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
          navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
          return;
        }

        // Parse response if available
        if (response && typeof response.json === 'function') {
          const data = await response.json();

          // Check if QR became inactive
          if (data.isActive === false || data.isActive === 'false' || data.isActive === 0) {
            console.warn('🚨 [Real-time] QR code is now inactive - redirecting immediately');
            const qrNameParam = qrName ? `&qrName=${encodeURIComponent(qrName)}` : '';
            navigate(`/qr-unavailable?theaterid=${theaterId}${qrNameParam}`, { replace: true });
            return;
          }
        }
      } catch (error) {
        // Handle errors silently - don't interrupt user experience for network errors
        // But redirect if it's a 403 error (QR is inactive)
        if (error.status === 403 || error.message?.includes('403')) {
          console.warn('🚨 [Real-time] QR code is inactive (403) - redirecting immediately');
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
  }, [qrName, theaterId, qrVerified, navigate]);

  // Load data when theater ID is available with cache-first strategy
  useEffect(() => {
    if (theaterId) {
      const cacheKey = `customerLanding_${theaterId}`;

      // Check cache first for instant loading
      const cached = getCachedData(cacheKey);
      if (cached) {
        if (cached.theater) setTheater(cached.theater);
        if (cached.settings) setSettings(cached.settings);
        setLoading(false);
      }

      // Fetch fresh data in parallel (background refresh)
      const fetchFreshData = async () => {
        try {
          // Only fetch theater and settings, removed products fetch as it's not used
          const [theaterRes, settingsRes] = await Promise.all([
            fetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              mode: 'cors'
            }),
            fetch(`${config.api.baseUrl}/settings/general`)
          ]);

          const [theaterData, settingsData] = await Promise.all([
            theaterRes.json(),
            settingsRes.json()
          ]);

          // Process theater data
          let freshTheater = null;
          if (theaterRes.ok && theaterData.success && theaterData.data) {
            freshTheater = theaterData.data;
            setTheater(freshTheater);
          } else {
            throw new Error(theaterData.error || theaterData.message || 'Theater not found');
          }

          // Process settings data
          let freshSettings = null;
          if (settingsData.success && settingsData.data.config) {
            freshSettings = settingsData.data.config;
            setSettings(freshSettings);
          }

          // Cache the fresh data
          setCachedData(cacheKey, {
            theater: freshTheater,
            settings: freshSettings
          });

          setLoading(false);
        } catch (error) {
          console.error('💥 [CustomerLanding] Error loading data:', error);
          setError(`Theater not found: Load failed\n${error.message || 'Unknown error'}`);
          setLoading(false);
        }
      };

      fetchFreshData();
    }
  }, [theaterId]);

  // Set Open Graph meta tags for social media sharing (WhatsApp, Facebook, etc.)
  useEffect(() => {
    // Get current URL for og:url
    const currentUrl = window.location.href;
    const baseUrl = window.location.origin;
    const logoUrl = `${baseUrl}/images/logo.jpg`;
    
    // Theater name for title and description
    const theaterTitle = theater?.name || 'Theater Canteen QR Order System';
    const description = `Order food at ${theaterTitle} - Modern online ordering solution for theater canteens`;
    
    // Function to update or create meta tag
    const setMetaTag = (property, content, useName = false) => {
      // Remove existing meta tag if it exists
      const existingTag = document.querySelector(`meta[property="${property}"]`) || 
                         document.querySelector(`meta[name="${property}"]`);
      if (existingTag) {
        existingTag.remove();
      }
      
      // Create new meta tag
      const metaTag = document.createElement('meta');
      if (useName) {
        metaTag.setAttribute('name', property);
      } else {
        metaTag.setAttribute('property', property);
      }
      metaTag.setAttribute('content', content);
      document.head.appendChild(metaTag);
    };
    
    // Set Open Graph tags
    setMetaTag('og:title', theaterTitle);
    setMetaTag('og:description', description);
    setMetaTag('og:image', logoUrl);
    setMetaTag('og:url', currentUrl);
    setMetaTag('og:type', 'website');
    setMetaTag('og:site_name', 'Theater Canteen QR Order System');
    
    // Set Twitter Card tags for better Twitter/WhatsApp support (use name attribute)
    setMetaTag('twitter:card', 'summary_large_image', true);
    setMetaTag('twitter:title', theaterTitle, true);
    setMetaTag('twitter:description', description, true);
    setMetaTag('twitter:image', logoUrl, true);
    
    // Cleanup function to remove meta tags when component unmounts
    return () => {
      const ogTags = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]');
      ogTags.forEach(tag => tag.remove());
    };
  }, [theater, location.pathname, location.search]);

  // Pre-fetch CustomerHome data IMMEDIATELY when landing page loads for instant navigation
  useEffect(() => {
    if (theaterId) {
      // Start prefetch immediately, don't wait for loading to complete
      const prefetchCustomerHomeData = async () => {
        try {
          const customerHomeCacheKey = `customerHome_${theaterId}`;
          
          // Check if data is already cached
          const existingCache = getCachedData(customerHomeCacheKey);
          if (existingCache && existingCache.products && existingCache.products.length > 0) {
            // Data already cached, no need to prefetch
            return;
          }

          // Pre-fetch products and categories IMMEDIATELY (high priority)
          Promise.all([
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
          ]).then(async ([productsRes, categoriesRes]) => {
            try {
              const [productsData, categoriesData] = await Promise.all([
                productsRes.json().catch(() => ({ success: false, data: [] })),
                categoriesRes.json()
              ]);

              // Process products
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

              // Process categories
              let categoriesArray = [];
              if (categoriesData.success && categoriesData.data.categories) {
                categoriesArray = categoriesData.data.categories
                  .filter(cat => cat.isActive)
                  .slice(0, 6)
                  .map(cat => ({
                    _id: cat._id,
                    name: cat.categoryName || cat.name,
                    image: cat.imageUrl || cat.image || cat.categoryImage || cat.iconUrl || cat.iconImage || null,
                    icon: cat.icon || '📦',
                    isActive: cat.isActive
                  }));
              }

              // Process and cache products with proper structure
              const processedProducts = productsArray.map(p => {
                let imageUrl = null;
                if (p.images && Array.isArray(p.images) && p.images.length > 0) {
                  const firstImage = p.images[0];
                  imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
                } else if (p.productImage) {
                  imageUrl = p.productImage;
                } else if (p.image) {
                  imageUrl = p.image;
                }
                
                // Normalize image URL
                if (imageUrl && !imageUrl.startsWith('http')) {
                  imageUrl = `${config.api.baseUrl}${imageUrl}`;
                }

                return {
                  _id: p._id,
                  name: p.name || p.productName,
                  price: p.pricing?.basePrice || p.price || p.sellingPrice || 0,
                  description: p.description || '',
                  image: imageUrl,
                  images: p.images, // Preserve full images array
                  productImage: p.productImage,
                  categoryId: p.categoryId || (typeof p.category === 'object' ? p.category?._id : p.category),
                  category: typeof p.category === 'object' ? (p.category?.categoryName || p.category?.name) : p.category,
                  isVeg: p.isVeg ?? p.dietary?.isVeg ?? p.specifications?.isVeg,
                  pricing: p.pricing,
                  inventory: p.inventory,
                  currentStock: p.balanceStock ?? p.inventory?.currentStock ?? 0,
                  balanceStock: p.balanceStock,
                  stockUnit: p.stockUnit,
                  unit: p.unit,
                  quantityUnit: p.quantityUnit,
                  isActive: p.isActive,
                  isAvailable: p.isActive && (!p.inventory?.trackStock || (p.balanceStock ?? p.inventory?.currentStock ?? 0) > 0)
                };
              });

              // Cache the prefetched data for CustomerHome
              const theater = getCachedData(`theater_${theaterId}`) || getCachedData(`customerLanding_${theaterId}`)?.theater;
              setCachedData(customerHomeCacheKey, {
                theater: theater,
                products: processedProducts,
                categories: categoriesArray
              });

              // 🎨 PRE-CACHE PRODUCT IMAGES FOR INSTANT DISPLAY
              if (processedProducts.length > 0) {
                // Extract and normalize image URLs
                const imageUrls = [];
                processedProducts.forEach(product => {
                  let imageUrl = null;
                  
                  // Check images array first
                  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                    const firstImage = product.images[0];
                    imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
                  } else if (product.productImage) {
                    imageUrl = product.productImage;
                  } else if (product.image) {
                    imageUrl = product.image;
                  }
                  
                  // Normalize URL
                  if (imageUrl) {
                    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
                      imageUrl = imageUrl.startsWith('/') 
                        ? `${config.api.baseUrl}${imageUrl}` 
                        : `${config.api.baseUrl}/${imageUrl}`;
                    }
                    if (!imageUrls.includes(imageUrl)) {
                      imageUrls.push(imageUrl);
                    }
                  }
                });

                // Pre-cache ALL images immediately (no delay for instant display)
                if (imageUrls.length > 0) {
                  // Cache first 50 images immediately (above the fold + buffer)
                  const priorityImages = imageUrls.slice(0, 50);
                  if (priorityImages.length > 0) {
                    preCacheImages(priorityImages).catch(err => {
                      console.warn('⚠️ [CustomerLanding] Pre-cache priority images error (non-critical):', err);
                    });
                  }
                  
                  // Cache remaining images immediately (don't wait)
                  if (imageUrls.length > 50) {
                    const remainingImages = imageUrls.slice(50);
                    preCacheImages(remainingImages).catch(err => {
                      console.warn('⚠️ [CustomerLanding] Pre-cache remaining images error (non-critical):', err);
                    });
                  }

                  // Also cache using cacheProductImages utility for comprehensive caching
                  cacheProductImages(processedProducts).catch(err => {
                    console.warn('⚠️ [CustomerLanding] Cache product images error (non-critical):', err);
                  });
                }
              }

            } catch (err) {
              console.warn('⚠️ [CustomerLanding] Pre-fetch processing error (non-critical):', err);
            }
          }).catch(err => {
            console.warn('⚠️ [CustomerLanding] Pre-fetch error (non-critical):', err);
          });
        } catch (error) {
          console.warn('⚠️ [CustomerLanding] Pre-fetch setup error (non-critical):', error);
        }
      };

      // Pre-fetch after a short delay to not interfere with landing page load
      const prefetchTimer = setTimeout(prefetchCustomerHomeData, 500);
      return () => clearTimeout(prefetchTimer);
    }
  }, [theaterId, loading]);

  // Navigation handlers
  const handleOrderFood = async () => {
    // Show loading state immediately
    setIsNavigating(true);
    
    // Pre-fetch critical data in parallel before navigation
    const prefetchPromises = [];
    
    // Pre-fetch products if not cached
    const productsCacheKey = `theater_products_${theaterId}_cafe`;
    const customerHomeCacheKey = `customerHome_${theaterId}`;
    const existingCache = getCachedData(customerHomeCacheKey);
    
    if (!existingCache || !existingCache.products || existingCache.products.length === 0) {
      prefetchPromises.push(
        unifiedFetch(`${config.api.baseUrl}/theater-products/${theaterId}?stockSource=cafe`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          mode: 'cors'
        }, {
          cacheKey: productsCacheKey,
          cacheTTL: 300000
        }).catch(() => {})
      );
    }
    
    // Pre-fetch categories if not cached
    const categoriesCacheKey = `theater_categories_${theaterId}`;
    const categoriesCache = getCachedData(categoriesCacheKey);
    if (!categoriesCache) {
      prefetchPromises.push(
        unifiedFetch(`${config.api.baseUrl}/theater-categories/${theaterId}`, {}, {
          cacheKey: categoriesCacheKey,
          cacheTTL: 300000
        }).catch(() => {})
      );
    }
    
    // Pre-fetch theater info if not cached
    const theaterCacheKey = `theater_${theaterId}`;
    const theaterCache = getCachedData(theaterCacheKey);
    if (!theaterCache) {
      prefetchPromises.push(
        unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {}, {
          cacheKey: theaterCacheKey,
          cacheTTL: 300000
        }).catch(() => {})
      );
    }
    
    // Wait for critical data (with timeout to not block too long)
    try {
      await Promise.race([
        Promise.all(prefetchPromises),
        new Promise(resolve => setTimeout(resolve, 500)) // Max 500ms wait
      ]);
    } catch (err) {
      // Continue navigation even if prefetch fails
      console.warn('Prefetch warning:', err);
    }
    
    // Build navigation URL
    let url = `/customer/order?theaterid=${theaterId}`;
    if (qrName) url += `&qrName=${encodeURIComponent(qrName)}`;
    if (screenName) url += `&screen=${encodeURIComponent(screenName)}`;
    if (seatId) url += `&seat=${encodeURIComponent(seatId)}`;
    // Try to extract seatClass from qrName or use a default
    const sClass = qrName || 'General';
    url += `&seatClass=${encodeURIComponent(sClass)}`;
    
    // Navigate with state
    navigate(url, { state: { fromLandingPage: true } });
    
    // Keep loading state for smooth transition (will be cleared on unmount)
  };

  const handleOrderHistory = () => {
    const params = new URLSearchParams();
    params.set('theaterid', theaterId);
    if (theater?.name) {
      params.set('theaterName', theater.name);
    }
    if (screenName) {
      params.set('screen', encodeURIComponent(screenName));
    }
    if (seatId) {
      params.set('seat', encodeURIComponent(seatId));
    }

    navigate(`/customer/order-history?${params.toString()}`);
  };

  // Loading state
  // ✅ CRITICAL: Block rendering if QR verification is in progress or not verified
  // This prevents showing content when QR code is inactive
  if (loading || isVerifying || (qrName && !qrVerified)) {
    return (
      <div className="customer-landing loading">
        <div className="welcome-section fade-in">
          <div className="loading-text">Loading...</div>
          <div className="loading-shimmer-bar"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="customer-landing error">
        <div className="error-section fade-in">
          <div className="error-icon">⚠️</div>
          <h2>Theater Not Found</h2>
          <p>{error}</p>
          <p className="error-hint">Please check the QR code and try again.</p>
          <div className="qr-code-helper-text">
            <p>Debug Info:</p>
            <p>Theater ID: {theaterId || 'Not set'}</p>
            <p>API URL: {config.api.baseUrl}</p>
            <p>Current URL: {window.location.href}</p>
          </div>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              if (theaterId) {
                // Clear cache and reload
                const cacheKey = `customerLanding_${theaterId}`;
                sessionStorage.removeItem(cacheKey);
                window.location.reload();
              }
            }}
            className="retry-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="customer-landing">
        {/* Show offline notice if in offline mode */}
        {shouldShowOfflineUI && <OfflineNotice />}

        {/* Header Section - Clean welcome without seat info */}
        <div className="welcome-section fade-in">
          <h1 className="welcome-title">WELCOME TO</h1>
          <h2 className="theater-name">{theater?.name || 'THEATER NAME'}</h2>
          {/* <p className="theater-location">
            {theater?.location?.city || theater?.location?.address || 'LOCATION'}
          </p> */}
        </div>

        {/* Static Landing Image (replaces dynamic theater logo) */}
        <img
          src={LandingPageImage}
          alt="Landing"
          className="landing-static-image fade-in-delay"
          loading="eager"
        />

        {/* Action Buttons Section */}
        <div className="action-section fade-in-delay">
          <button
            className={`order-button primary-button ${isNavigating ? 'loading' : ''}`}
            onClick={handleOrderFood}
            disabled={isNavigating}
          >
            {isNavigating ? (
              <>
                <div className="button-spinner"></div>
                <span>LOADING...</span>
              </>
            ) : (
              <>
                <span className="button-arrows">»</span>
                FOOD ORDER
                <span className="button-arrows">«</span>
              </>
            )}
          </button>

          <button
            className="history-link"
            onClick={handleOrderHistory}
            disabled={isNavigating}
          >
            ORDER HISTORY
          </button>
        </div>

        {/* Navigation Loading Overlay */}
        {isNavigating && (
          <div className="navigation-loading-overlay">
            <div className="navigation-loading-content">
              <div className="navigation-spinner"></div>
              <p className="navigation-loading-text">Loading your menu...</p>
            </div>
          </div>
        )}

        {/* Footer Section */}
        <div className="footer-section fade-in-delay">
          <p className="powered-by">Powered By</p>
          <div className="logo-container">
            {settings?.logoUrl ? (
              <img
                src="/api/settings/image/logo"
                alt={settings?.applicationName || 'YQPayNow'}
                className="logo-image"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
            ) : null}
            <div className="logo-text" style={{ display: settings?.logoUrl ? 'none' : 'block' }}>
              {settings?.applicationName || 'YQPayNow'}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default CustomerLanding;