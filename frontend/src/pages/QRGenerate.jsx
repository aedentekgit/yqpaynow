import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import { useToast } from '../contexts/ToastContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData, clearCachePattern } from '../utils/cacheUtils';
import { unifiedFetch } from '../utils/unifiedFetch';
import { useTheaterStore } from '../stores/optimizedStores';
import { clearImageCachePattern } from '../utils/imageCacheUtils';
import config from '../config';
import { 
  TextField, 
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Button
} from '@mui/material';
import '../styles/QRGenerate.css';
import '../styles/TheaterList.css';
import '../styles/AddProductMUI.css';
import '../styles/pages/QRGenerate.css'; // Extracted inline styles
import '../styles/action-buttons.css'; // Global action button styles
import QRCode from 'qrcode';

// ==================== COMPONENTS ====================
const TheaterSelectSkeleton = React.memo(() => (
  <div className="loading-select">
    Loading theaters...
  </div>
));

// Simplified image component to reduce duplication
const PreviewImage = React.memo(({ 
  src, 
  alt, 
  imageRef, 
  isVisible, 
  onLoad, 
  onError,
  currentIndex,
  totalAlternatives,
  onNextAlternative
}) => {
  const handleError = () => {
    if (currentIndex < totalAlternatives - 1) {
      onNextAlternative(currentIndex + 1);
    } else {
      onError();
    }
  };

  return (
    <img
      ref={imageRef}
      key={`${alt}-${currentIndex}`}
      src={src}
      alt={alt}
      className={`preview-image ${isVisible ? 'preview-image-visible' : 'preview-image-hidden'}`}
      onError={handleError}
      onLoad={onLoad}
      loading="eager"
      decoding="async"
      fetchPriority="high"
    />
  );
});

PreviewImage.displayName = 'PreviewImage';



// ==================== MAIN COMPONENT ====================
const QRGenerate = React.memo(() => {
  const navigate = useNavigate();
  const toast = useToast();
  const performanceMetrics = usePerformanceMonitoring('QRGenerate');
  const abortControllerRef = useRef(null);
  
  // ==================== CACHE KEYS ====================
  const THEATERS_CACHE_KEY = 'qr_generate_theaters_active';
  const LOGO_CACHE_KEY = 'qr_generate_settings_general';
  
  // ==================== FORM STATE ====================
  const [formData, setFormData] = useState({
    theaterId: '',
    qrType: '',
    name: '',
    seatStart: '',
    seatEnd: '',
    selectedSeats: [],
    logoType: '', // 'default' or 'theater'
    logoUrl: '',
    seatClass: '', // Will be auto-populated from QR name selection
    orientation: 'portrait' // 'landscape' or 'portrait'
  });
  
  // ==================== DATA STATE ====================
  // Load initial cache for instant display
  const [theaters, setTheaters] = useState(() => {
    if (typeof window === 'undefined') return [];
    const cached = getCachedData(THEATERS_CACHE_KEY, 120000);
    if (cached && cached.success) {
      return cached.data || cached.theaters || [];
    }
    return [];
  });
  
  const [theatersLoading, setTheatersLoading] = useState(() => {
    // Only show loading if no cache exists
    if (typeof window === 'undefined') return true;
    const cached = getCachedData(THEATERS_CACHE_KEY, 120000);
    return !(cached && cached.success && (cached.data || cached.theaters || []).length > 0);
  });
  
  const [defaultLogoUrl, setDefaultLogoUrl] = useState(() => {
    if (typeof window === 'undefined') return '';
    const cached = getCachedData(LOGO_CACHE_KEY, 300000);
    if (cached && cached.success && cached.data) {
      // STRICT: ONLY use qrCodeUrl. Do NOT fallback to logoUrl.
      return cached.data.qrCodeUrl || '';
    }
    return '';
  });
  
  const [qrNames, setQrNames] = useState([]);
  const [qrNamesLoading, setQrNamesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ current: 0, total: 0, message: '' });
  const [showSeatMap, setShowSeatMap] = useState(false);
  const [allAvailableSeats, setAllAvailableSeats] = useState([]);
  const [hoveredSeat, setHoveredSeat] = useState(null);

  // ==================== QR PREVIEW STATE ====================
  const [qrPreviewUrl, setQrPreviewUrl] = useState(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [portraitImageLoaded, setPortraitImageLoaded] = useState(false);
  const [landscapeImageLoaded, setLandscapeImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // ==================== REFS ====================
  const qrCanvasRef = useRef(null);
  const portraitImageRef = useRef(null);
  const landscapeImageRef = useRef(null);
  const generationTimeoutRef = useRef(null);
  const preloadedImagesRef = useRef(new Map());

  // ==================== CONSTANTS ====================
  const imageAlternatives = [
    '/images/scan/scan-order-pay.webp',
    '/images/scan/scan-order-pay.png',
    '/images/scan/scan-order-pay.jpg',
    '/images/scan/scan.webp',
    '/images/scan/scan.png',
    '/images/scan/scan.jpg',
    '/images/scan/order-pay.png',
    '/images/scan.webp',
    '/images/scan.png'
  ];

  // ==================== COMPUTED VALUES ====================
  const selectedTheater = useMemo(() => 
    theaters.find(t => t._id === formData.theaterId),
    [theaters, formData.theaterId]
  );

  const qrCodeCount = useMemo(() => {
    if (formData.qrType === 'single') return 1;
    return formData.selectedSeats.length;
  }, [formData.qrType, formData.selectedSeats.length]);

  // ==================== EFFECTS ====================
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (generating) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [generating]);

  // Load active theaters on component mount - OPTIMIZED: Load in parallel
  useEffect(() => {
    // 🚀 PERFORMANCE: Load data in parallel
    // Show cached data instantly, then fetch fresh data in background
    let isMounted = true;
    
    const loadData = async () => {
      // First, show cached data instantly (already done in initial state)
      // Then fetch fresh data in background to ensure we have latest
      await Promise.allSettled([
        loadTheaters(false), // Use cache first for instant display
        loadDefaultLogo(false) // Use cache first for instant display
      ]);
      
      // After initial load, refresh in background to ensure freshness
      // Small delay to not interfere with instant display
      setTimeout(() => {
        if (isMounted) {
          loadTheaters(true); // Force refresh in background
          loadDefaultLogo(true); // Force refresh in background
        }
      }, 500); // Refresh after 500ms in background
    };
    
    loadData();
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - functions are stable

  // Auto-set default logo when defaultLogoUrl is loaded
  useEffect(() => {
    // Initial setup if nothing selected
    if (defaultLogoUrl && !formData.logoType && !formData.logoUrl) {
      setFormData(prev => ({
        ...prev,
        logoType: 'default',
        logoUrl: defaultLogoUrl
      }));
    }
    // Force update if default is selected but URL doesn't match new default
    else if (formData.logoType === 'default' && formData.logoUrl !== defaultLogoUrl && defaultLogoUrl) {
      setFormData(prev => ({
        ...prev,
        logoUrl: defaultLogoUrl,
        _logoUpdateKey: Date.now() // Force preview regeneration
      }));
    }
  }, [defaultLogoUrl, formData.logoType, formData.logoUrl]);

  const loadTheaters = useCallback(async (forceRefresh = false) => {
    try {
      // Create abort controller for this request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      // Build URL with cache-busting if force refresh
      let apiUrl = `${config.api.baseUrl}/theaters?status=active&limit=100`;
      if (forceRefresh) {
        apiUrl += `&_t=${Date.now()}`;
      }
      
      // Build headers
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };
      
      // Add no-cache headers if force refresh
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // 🚀 PERFORMANCE: Use optimizedFetch - it handles cache automatically
      // If cache exists and not force refresh, this returns instantly (< 50ms)
      // If force refresh, bypass cache by passing null as cache key
      const data = await optimizedFetch(
        apiUrl,
        {
          signal,
          headers
        },
        forceRefresh ? null : THEATERS_CACHE_KEY, // Skip cache if force refresh
        forceRefresh ? 0 : 120000 // No cache TTL if force refresh
      );
      
      if (data && data.success) {
        // Handle both paginated and direct response formats
        const theaterList = data.data || data.theaters || [];
        // ✅ FIX: Always update state even if data seems the same (ensures fresh data)
        setTheaters(prev => {
          // Force update by creating new array reference
          if (JSON.stringify(prev) !== JSON.stringify(theaterList)) {
            return theaterList;
          }
          return theaterList; // Still return new data to ensure freshness
        });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error loading theaters:', error);
    } finally {
      // Always set loading to false when done
      setTheatersLoading(false);
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, []); // Empty deps - stable function

  // Listen for theater updates to refresh theater list and logo cache
  useEffect(() => {
    try {
      const { onTheaterUpdate, onTheatersUpdate } = useTheaterStore.getState();
      
      const handleTheaterUpdate = async (event) => {
        // Clear theater cache to force refresh
        clearCachePattern('qr_generate_theaters');
        clearCachePattern('qr_generate_theaters_active');
        
        // Clear image cache for the updated theater's logo
        if (event.theater) {
          const logoUrls = [
            event.theater.branding?.logoUrl,
            event.theater.branding?.logo,
            event.theater.documents?.logo,
            event.theater.media?.logo,
            event.theater.logo,
            event.theater.logoUrl
          ].filter(Boolean);
          
          logoUrls.forEach(url => {
            if (typeof url === 'string') {
              clearImageCachePattern(url);
            }
          });
          
          // If the updated theater is currently selected, refresh logo URL and force QR preview regeneration
          if (formData.theaterId === event.theaterId && formData.logoType === 'theater') {
            const updatedLogoUrl = event.theater.branding?.logoUrl 
              || event.theater.branding?.logo 
              || event.theater.documents?.logo 
              || event.theater.media?.logo 
              || event.theater.logo 
              || event.theater.logoUrl 
              || '';
            
            // Clear QR preview to force regeneration with new logo
            setQrPreviewUrl(null);
            
            setFormData(prev => ({
              ...prev,
              logoUrl: updatedLogoUrl,
              // Force QR preview regeneration by adding a unique key
              _logoUpdateKey: Date.now()
            }));
            
            // Also update theaters list to ensure we have the latest theater data
            setTheaters(prev => prev.map(theater => 
              theater._id === event.theaterId ? event.theater : theater
            ));
          }
        }
        
        // Refresh theaters list after a short delay to ensure cache is cleared
        setTimeout(() => {
          loadTheaters(true);
        }, 100);
      };
      
      const handleTheatersUpdate = async () => {
        // Clear theater cache and refresh
        clearCachePattern('qr_generate_theaters');
        clearCachePattern('qr_generate_theaters_active');
        
        setTimeout(() => {
          loadTheaters(true);
        }, 100);
      };
      
      // Subscribe to theater update events
      const unsubscribeTheater = onTheaterUpdate(handleTheaterUpdate);
      const unsubscribeTheaters = onTheatersUpdate(handleTheatersUpdate);
      
      // Cleanup subscriptions on unmount
      return () => {
        unsubscribeTheater();
        unsubscribeTheaters();
      };
    } catch (error) {
      console.error('Error setting up theater update listener:', error);
    }
  }, [formData.theaterId, formData.logoType, loadTheaters]);

  const loadDefaultLogo = useCallback(async (forceRefresh = false) => {
    try {
      // Always add timestamp to ensure fresh data (like theater version)
      const apiUrl = `${config.api.baseUrl}/settings/general?_t=${Date.now()}`;
      
      // Build headers
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };
      
      // Use unifiedFetch with no cache to ensure fresh data
      const response = await unifiedFetch(apiUrl, {
          headers
      }, {
        cacheKey: forceRefresh ? null : `settings_general_${Date.now()}`, // Unique cache key
        cacheTTL: 0 // No caching to ensure fresh data
      });

      let data;
      if (response.ok) {
        data = await response.json();
      } else {
        console.error('❌ [QRGenerate] Failed to load default logo:', response.status);
        return;
      }

      if (data && data.success && data.data) {
        // STRICT: ONLY use qrCodeUrl. Do NOT fallback to logoUrl.
        let finalLogoUrl = '';
        if (data.data.qrCodeUrl && data.data.qrCodeUrl.trim() !== '') {
          finalLogoUrl = data.data.qrCodeUrl;
        } else {
          console.warn('⚠️ [QRGenerate] QR Code Image (qrCodeUrl) is not set in Settings > Image Configuration. Default logo will be empty.');
        }
        
        // ✅ FIX: Always update state to ensure fresh data
        setDefaultLogoUrl(prev => {
          if (prev !== finalLogoUrl) {
            return finalLogoUrl;
          }
          return finalLogoUrl; // Still return new value to ensure freshness
        });
      } else {
      }
    } catch (error) {
      // Silently handle AbortError (expected in React StrictMode)
      if (error.name === 'AbortError') {
        return;
      }
      console.error('❌ Error loading default logo:', error);
    }
  }, []);

  const loadQRNames = useCallback(async (theaterId, forceRefresh = false) => {
    if (!theaterId) {
      setQrNames([]);
      setQrNamesLoading(false);
      return;
    }
    
    try {
      setQrNamesLoading(true);
      
      // Build URL with cache-busting if force refresh
      let apiUrl = `${config.api.baseUrl}/qrcodenames?theaterId=${theaterId}&limit=100`;
      if (forceRefresh) {
        apiUrl += `&_t=${Date.now()}`;
      }
      
      // Build headers
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };
      
      // Add no-cache headers if force refresh
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      // Skip cache if force refresh
      const cacheKey = forceRefresh ? null : `qr_generate_qrcodenames_theater_${theaterId}_limit_100`;
      const cacheTTL = forceRefresh ? 0 : 120000; // No cache if force refresh
      
      const data = await optimizedFetch(
        apiUrl,
        {
          headers
        },
        cacheKey,
        cacheTTL
      );

      if (data && data.success && data.data && data.data.qrCodeNames) {

        // Try to fetch already generated QR codes from singleqrcodes database for this theater (to filter duplicates)
        let existingQRNames = [];

        try {
          const token = config.helpers.getAuthToken();

          if (!token) {

            existingQRNames = [];
          } else {
            // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
            // Skip cache when force refreshing QR names to get latest existing QRs
            let existingQRsUrl = `${config.api.baseUrl}/single-qrcodes/theater/${theaterId}`;
            if (forceRefresh) {
              existingQRsUrl += `?_t=${Date.now()}`;
            }
            
            const existingQRsHeaders = {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            };
            
            if (forceRefresh) {
              existingQRsHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
              existingQRsHeaders['Pragma'] = 'no-cache';
              existingQRsHeaders['Expires'] = '0';
            }
            
            const existingQRsData = await optimizedFetch(
              existingQRsUrl,
              {
                headers: existingQRsHeaders
              },
              forceRefresh ? null : `qr_generate_existing_qrcodes_theater_${theaterId}`, // Skip cache if force refresh
              forceRefresh ? 0 : 120000 // No cache if force refresh
            ).catch(() => ({ success: false, data: [] }));

            if (existingQRsData && existingQRsData.success && existingQRsData.data && existingQRsData.data.qrCodes) {
              // Extract unique QR names that already have generated QR codes in singleqrcodes
              // This checks both single and screen type QR codes in the unified collection
              existingQRNames = [...new Set(existingQRsData.data.qrCodes.map(qr => qr.name))]; // Using 'name' field from transformed response
            } else {
              existingQRNames = [];
            }
          }
        } catch (fetchError) {
          // Silently handle error - if we can't fetch existing QRs, just show all QR names

          // In case of error, set existingQRNames to empty array (showing all QR names)
          existingQRNames = [];
        }
        
        // Filter out QR names that already have generated QR codes
        const availableQRNames = data.data.qrCodeNames.filter(
          qrName => {
            const isAlreadyGenerated = existingQRNames.includes(qrName.qrName);

            return !isAlreadyGenerated;
          }
        );
        

        // ✅ FIX: Always update state to ensure fresh data is displayed
        setQrNames(prev => {
          // Force update by checking if data changed
          if (JSON.stringify(prev) !== JSON.stringify(availableQRNames)) {
            return availableQRNames;
          }
          return availableQRNames; // Still return new data to ensure freshness
        });

        if (availableQRNames.length === 0 && data.data.qrCodeNames.length > 0) {
          // All QR names have been generated
        } else if (existingQRNames.length === 0) {
          // No existing QR names found
        }
      } else {
        setQrNames([]);
      }
    } catch (error) {
      console.error('Error loading QR names:', error);
      setQrNames([]);
    } finally {
      setQrNamesLoading(false);
    }
  }, []);

  // Removed useEffect that was causing race condition
  // QR names are loaded directly in handleInputChange when theater is selected

  // ✅ FIX: Validate formData.name against available qrNames to prevent MUI warning
  useEffect(() => {
    if (formData.name && qrNames.length > 0) {
      // Check if the current name value exists in the available qrNames
      const nameExists = qrNames.some(qr => qr.qrName === formData.name);
      
      // If the name doesn't exist in available options, reset it
      if (!nameExists) {
        setFormData(prev => ({
          ...prev,
          name: '',
          seatClass: '' // Also reset seatClass when name is invalid
        }));
      }
    } else if (formData.name && qrNames.length === 0 && !qrNamesLoading) {
      // If qrNames is empty and not loading, reset the name
      setFormData(prev => ({
        ...prev,
        name: '',
        seatClass: ''
      }));
    }
  }, [qrNames, qrNamesLoading, formData.name]);

  const handleInputChange = useCallback((e) => {
    const { name, value, type } = e.target;
    
    // Handle theater selection with logo update and QR names loading
    if (name === 'theaterId') {
      const selectedTheater = theaters.find(t => t._id === value);
      let logoUrl = formData.logoUrl;
      let logoType = formData.logoType;
      
      // If no logo type is set yet, auto-set to default
      if (!logoType && defaultLogoUrl) {
        logoType = 'default';
        logoUrl = defaultLogoUrl;
      }
      // Update logo URL if theater logo is selected
      else if (logoType === 'theater' && selectedTheater) {
        logoUrl = selectedTheater.media?.logo || selectedTheater.logo || selectedTheater.logoUrl || '';
      }
      
      // Load QR names for the selected theater (use cache first for instant display)
      loadQRNames(value, false);
      
      // Then refresh in background to ensure latest data
      setTimeout(() => {
        loadQRNames(value, true);
      }, 300);
      
      setFormData(prev => ({
        ...prev,
        theaterId: value,
        logoUrl,
        logoType,
        name: '', // Reset QR name when theater changes
        seatClass: '' // Reset seat class when theater changes
      }));
    } 
    // Handle QR name selection with automatic seat class update
    else if (name === 'name') {
      const selectedQRName = qrNames.find(qr => qr.qrName === value);
      
      setFormData(prev => ({
        ...prev,
        name: value,
        seatClass: selectedQRName ? selectedQRName.seatClass : ''
      }));
    } 
    else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseInt(value) || 0 : value
      }));
    }
  }, [theaters, formData.logoUrl, formData.logoType, loadQRNames, qrNames]);

  const handleLogoTypeChange = useCallback((logoType) => {
    const selectedTheater = theaters.find(t => t._id === formData.theaterId);
    let logoUrl = '';
    
    if (logoType === 'default') {
      logoUrl = defaultLogoUrl || '';
    } else if (logoType === 'theater' && selectedTheater) {
      // Check multiple possible logo locations in theater object
      logoUrl = selectedTheater.branding?.logoUrl 
        || selectedTheater.branding?.logo 
        || selectedTheater.documents?.logo 
        || selectedTheater.media?.logo 
        || selectedTheater.logo 
        || selectedTheater.logoUrl 
        || '';
    }
    
    
    setFormData(prev => ({
      ...prev,
      logoType,
      logoUrl
    }));
  }, [theaters, formData.theaterId, defaultLogoUrl]);

  const handleQRTypeChange = useCallback((type) => {
    setFormData(prev => ({
      ...prev,
      qrType: type,
      name: '',
      seatStart: '',
      seatEnd: '',
      selectedSeats: []
    }));
    setShowSeatMap(false); // Hide seat map when changing type
    setAllAvailableSeats([]); // Clear all stored seat ranges when changing type
  }, []);


  // Preload images on component mount for instant loading
  useEffect(() => {
    const preloadImages = async () => {
      const imagePromises = imageAlternatives.map((src) => {
        return new Promise((resolve) => {
          // Check if already cached
          if (preloadedImagesRef.current.has(src)) {
            resolve(true);
            return;
          }

          const img = new Image();
          img.onload = () => {
            preloadedImagesRef.current.set(src, img);
            resolve(true);
          };
          img.onerror = () => {
            resolve(false);
          };
          img.src = src;
        });
      });

      // Preload all images in parallel (browser will handle caching)
      await Promise.allSettled(imagePromises);
    };

    // Start preloading immediately
    preloadImages();
  }, []); // Only run once on mount

  // Reset image state when orientation changes
  useEffect(() => {
    setImageError(false);
    setCurrentImageIndex(0);
    // Reset QR preview URL to trigger regeneration
    setQrPreviewUrl(null);
  }, [formData.orientation]);

  // Check if images are already loaded when component mounts or image changes
  useEffect(() => {
    const currentSrc = imageAlternatives[currentImageIndex];
    
    // Check preloaded cache first
    if (preloadedImagesRef.current.has(currentSrc)) {
      const cachedImg = preloadedImagesRef.current.get(currentSrc);
      if (cachedImg.complete && cachedImg.naturalHeight !== 0) {
        setPortraitImageLoaded(true);
        setLandscapeImageLoaded(true);
        return;
      }
    }

    // Check DOM images after a brief delay
    const checkImages = () => {
      if (portraitImageRef.current && portraitImageRef.current.complete && portraitImageRef.current.naturalHeight !== 0) {
        setPortraitImageLoaded(true);
      }
      if (landscapeImageRef.current && landscapeImageRef.current.complete && landscapeImageRef.current.naturalHeight !== 0) {
        setLandscapeImageLoaded(true);
      }
    };

    // Check immediately and after delay
    checkImages();
    const timeout = setTimeout(checkImages, 100);
    
    return () => clearTimeout(timeout);
  }, [currentImageIndex, imageAlternatives]);

  // Helper function to load logo image with fallback strategies
  const loadLogoImage = async (logoUrl, isDefaultLogo = false, isTheaterLogo = false) => {
    return new Promise((resolve, reject) => {
      // Set timeout to prevent hanging (10 seconds)
      const timeout = setTimeout(() => {
        reject(new Error('Image load timeout'));
      }, 10000);
      
      const clearTimeoutAndResolve = (img) => {
        clearTimeout(timeout);
        resolve(img);
      };
      
      const clearTimeoutAndReject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      
      // For default logos, use the proxy endpoint to avoid CORS issues
      // For theater logos from external URLs (GCS), use the image proxy endpoint
      // Add cache busting to ensure we get the latest logo
      let imageUrl = logoUrl;
      const cacheBuster = `?t=${Date.now()}`;
      
      if (isDefaultLogo && logoUrl && !logoUrl.startsWith('data:') && !logoUrl.startsWith('blob:')) {
        // IMPORTANT: For default logos, we use the qrCodeUrl directly, NOT the proxy endpoint
        // The proxy endpoint /api/settings/image/logo returns logoUrl (Application Logo), not qrCodeUrl (QR Code Image)
        // So we use the logoUrl directly which already contains the qrCodeUrl from defaultLogoUrl
        if (!logoUrl.includes('?') && !logoUrl.includes('&')) {
          imageUrl = `${logoUrl}${cacheBuster}`;
        } else {
          imageUrl = `${logoUrl}${logoUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        }
      } else if (isTheaterLogo && logoUrl && logoUrl.startsWith('http') && !logoUrl.startsWith(window.location.origin) && !logoUrl.startsWith('data:') && !logoUrl.startsWith('blob:')) {
        // For theater logos from external URLs (like GCS), use the image proxy endpoint with cache busting
        imageUrl = `${window.location.origin}/api/proxy-image?url=${encodeURIComponent(logoUrl)}&t=${Date.now()}`;
      } else if (isTheaterLogo && logoUrl && !logoUrl.startsWith('data:') && !logoUrl.startsWith('blob:')) {
        // For same-origin theater logos, add cache busting
        imageUrl = logoUrl.includes('?') ? `${logoUrl}&t=${Date.now()}` : `${logoUrl}${cacheBuster}`;
      }
      
      // Check if URL is from same origin (no CORS needed)
      // Proxy endpoints are treated as same-origin
      const isSameOrigin = imageUrl.startsWith(window.location.origin) || 
                          imageUrl.startsWith('/') || 
                          imageUrl.startsWith('data:') || 
                          imageUrl.startsWith('blob:') ||
                          imageUrl.includes('/api/proxy-image') ||
                          imageUrl.includes('/api/settings/image/logo');
      
      // Try loading with crossOrigin for same-origin requests (prevents tainted canvas)
      const tryWithCrossOrigin = () => {
        const img = new Image();
        
        // Set crossOrigin for same-origin requests to prevent canvas tainting
        if (isSameOrigin && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
          img.crossOrigin = 'anonymous';
        }
        
        img.onload = () => {
          clearTimeoutAndResolve(img);
        };
        
        img.onerror = (error) => {
          console.warn('⚠️ Image load with crossOrigin failed, trying without:', error);
          // Fallback: try without crossOrigin
          tryWithoutCrossOrigin();
        };
        
        img.src = imageUrl;
      };
      
      // Fallback: try without crossOrigin (for external URLs that don't support CORS)
      const tryWithoutCrossOrigin = () => {
        const img = new Image();
        
        img.onload = () => {
          clearTimeoutAndResolve(img);
        };
        
        img.onerror = () => {
          console.warn('⚠️ All logo loading methods failed for URL:', imageUrl);
          clearTimeoutAndReject(new Error('All logo loading methods failed'));
        };
        
        img.src = imageUrl;
      };
      
      // Try blob method first for external URLs (GCS, etc.)
      const tryBlobMethod = async () => {
        // Skip blob method for same-origin URLs (use direct load instead)
        if (isSameOrigin) {
          tryWithCrossOrigin();
          return;
        }
        
        try {
          const token = localStorage.getItem('token') || localStorage.getItem('authToken');
          const response = await fetch(imageUrl, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            mode: 'cors',
            credentials: 'omit'
          });
          
          if (!response.ok) {
            throw new Error(`Fetch failed with status: ${response.status}`);
          }
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          
          const blobImg = new Image();
          blobImg.onload = () => {
            URL.revokeObjectURL(blobUrl); // Clean up
            clearTimeoutAndResolve(blobImg);
          };
          blobImg.onerror = () => {
            URL.revokeObjectURL(blobUrl); // Clean up
            console.warn('⚠️ Blob image load failed, trying direct load');
            // Fallback to direct method
            tryWithCrossOrigin();
          };
          blobImg.src = blobUrl;
        } catch (fetchError) {
          console.warn('⚠️ Blob fetch method failed, trying direct load:', fetchError.message);
          // Fallback to direct method
          tryWithCrossOrigin();
        }
      };
      
      // Start with appropriate method based on URL type
      if (isSameOrigin) {
        tryWithCrossOrigin();
      } else {
        tryBlobMethod();
      }
    });
  };

  // Generate QR code preview
  useEffect(() => {
    let isMounted = true;
    let rafId = null;
    let timeoutId = null;
    
    // Clear any pending generation
    if (generationTimeoutRef.current) {
      clearTimeout(generationTimeoutRef.current);
      generationTimeoutRef.current = null;
    }
    
    const generateQRPreview = async () => {
      // Set generating state to prevent flickering
      if (isMounted) {
        setQrGenerating(true);
      }
      
      // Use requestAnimationFrame for better timing and smoother rendering
      const waitForCanvas = () => {
        return new Promise((resolve) => {
          const checkCanvas = () => {
            if (qrCanvasRef.current && isMounted) {
              resolve(qrCanvasRef.current);
            } else if (isMounted) {
              rafId = requestAnimationFrame(checkCanvas);
            } else {
              resolve(null);
            }
          };
          rafId = requestAnimationFrame(checkCanvas);
        });
      };

      const canvas = await waitForCanvas();
      if (!canvas || !isMounted) {
        if (isMounted) {
          setQrGenerating(false);
        }
        return;
      }

      try {
        const size = formData.orientation === 'landscape' ? 150 : 150;
        
        // Set canvas dimensions immediately to prevent layout shifts
        if (canvas.width !== size || canvas.height !== size) {
          canvas.width = size;
          canvas.height = size;
        }
        
        const ctx = canvas.getContext('2d');
        
        // Fill with white background immediately to prevent flickering
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Generate QR code data URL - use default if form not filled
        let qrCodeData;
        if (formData.theaterId && formData.name) {
          // Use actual form data
          const baseUrl = config.api.baseUrl?.replace('/api', '') || window.location.origin;
          qrCodeData = formData.qrType === 'screen' && formData.selectedSeats.length > 0
            ? `${baseUrl}/menu/${formData.theaterId}?qrName=${encodeURIComponent(formData.name)}&seat=${encodeURIComponent(formData.selectedSeats[0])}&type=screen`
            : `${baseUrl}/menu/${formData.theaterId}?qrName=${encodeURIComponent(formData.name)}&type=single`;
        } else {
          // Use default QR code data
          const baseUrl = window.location.origin;
          qrCodeData = `${baseUrl}/menu/preview`;
        }
        
        // Generate QR code
        await QRCode.toCanvas(canvas, qrCodeData, {
          width: size,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'H'
        });

        // Determine which logo URL to use
        let logoToUse = '';
        let isDefaultLogo = false;
        let isTheaterLogo = false;
        if (formData.logoType === 'default') {
          // Use default logo if default logo type is selected
          // STRICT: Only use defaultLogoUrl (qrCodeUrl), do NOT fallback to formData.logoUrl
          logoToUse = defaultLogoUrl || '';
          isDefaultLogo = true;
        } else if (formData.logoType === 'theater') {
          // Use theater logo if theater logo type is selected
          logoToUse = formData.logoUrl || '';
          isTheaterLogo = true;
        } else if (formData.logoUrl) {
          // Fallback to any logoUrl if set
          logoToUse = formData.logoUrl;
        }


        // Overlay logo if available (show instantly when logo type is selected)
        if (logoToUse && isMounted) {
          try {
            // Construct full URL if it's a relative path
            let fullLogoUrl = logoToUse;
            if (logoToUse && !logoToUse.startsWith('http') && !logoToUse.startsWith('data:') && !logoToUse.startsWith('blob:')) {
              const apiBase = config.api.baseUrl || '';
              fullLogoUrl = `${apiBase}${logoToUse.startsWith('/') ? '' : '/'}${logoToUse}`;
            }

            // Add cache busting to logo URL to ensure fresh logo is loaded
            // This is critical to show the updated logo when logo changes
            if (fullLogoUrl && !fullLogoUrl.startsWith('data:') && !fullLogoUrl.startsWith('blob:')) {
              // Add timestamp cache buster to force fresh image load
              const cacheBuster = fullLogoUrl.includes('?') ? `&_cb=${Date.now()}` : `?_cb=${Date.now()}`;
              // Only add cache buster if not already using proxy endpoint (proxy handles cache busting)
              if (!fullLogoUrl.includes('/api/proxy-image') && !fullLogoUrl.includes('/api/settings/image/logo')) {
                fullLogoUrl = `${fullLogoUrl}${cacheBuster}`;
              }
            }

            // For default logos (qrCodeUrl), use the URL directly - it's already the correct QR Code Image
            // For theater logos from external URLs (GCS), use proxy endpoint to avoid CORS
            // Pass flags to loadLogoImage to determine which proxy to use
            // IMPORTANT: For default logos, we use the qrCodeUrl directly, NOT the proxy endpoint
            const logoImg = await loadLogoImage(fullLogoUrl, isDefaultLogo, isTheaterLogo);
            
            if (logoImg && isMounted) {
              try {
                // Calculate logo size (22% of QR code size for consistency with backend)
                const logoSize = size * 0.22;
                const logoX = (size - logoSize) / 2;
                const logoY = (size - logoSize) / 2;
                const centerX = size / 2;
                const centerY = size / 2;
                
                // Draw white background circle for logo (same as backend)
                const backgroundRadius = logoSize * 0.72;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(centerX, centerY, backgroundRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Save context state
                ctx.save();
                
                // Create circular clipping path for logo - use 0.5 for perfect circle
                const clipRadius = logoSize * 0.5;
                ctx.beginPath();
                ctx.arc(centerX, centerY, clipRadius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                
                // Draw logo as square - the clipping path creates the perfect circle
                ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
                
                // Restore context
                ctx.restore();
                
              } catch (err) {
                console.error('❌ Error drawing logo on QR:', err);
                // Draw placeholder indicator
                drawLogoPlaceholder(ctx, size);
              }
            }
          } catch (error) {
            console.warn('⚠️ Error loading logo, continuing without logo:', error.message || error);
            // Don't draw placeholder - just continue without logo
            // The QR code will be generated without the logo overlay
          }
        } else if (isMounted) {
        }
        
        // Helper function to draw logo placeholder
        function drawLogoPlaceholder(ctx, size) {
          const centerX = size / 2;
          const centerY = size / 2;
          const radius = size * 0.15;
          
          // Draw white circle
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw border
          ctx.strokeStyle = '#8B5CF6';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw text
          ctx.fillStyle = '#8B5CF6';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('LOGO', centerX, centerY - 5);
          ctx.font = '9px Arial';
          ctx.fillText('INCLUDED', centerX, centerY + 7);
          
        }

        // Convert canvas to data URL only if still mounted
        if (isMounted) {
          try {
            // Try to export canvas - may fail if canvas is tainted (CORS issue)
            const dataUrl = canvas.toDataURL('image/png');
            setQrPreviewUrl(dataUrl);
            setQrGenerating(false);
          } catch (canvasError) {
            // Canvas is tainted (CORS issue) - try to regenerate without logo or show error
            console.error('❌ Canvas export failed (tainted canvas):', canvasError);
            
            // If logo was used, try regenerating without logo
            if (logoToUse) {
              console.warn('⚠️ Retrying QR generation without logo due to CORS issue');
              // Clear canvas and regenerate without logo
              ctx.clearRect(0, 0, size, size);
              
              // Redraw QR code without logo (use qrCodeData which was defined earlier)
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, size, size);
              await QRCode.toCanvas(canvas, qrCodeData, {
                width: size,
                margin: 2,
                color: {
                  dark: '#000000',
                  light: '#FFFFFF'
                },
                errorCorrectionLevel: 'H'
              });
              
              // Try exporting again
              try {
                const dataUrl = canvas.toDataURL('image/png');
                setQrPreviewUrl(dataUrl);
                setQrGenerating(false);
              } catch (retryError) {
                console.error('❌ Canvas export failed even without logo:', retryError);
                setQrPreviewUrl(null);
                setQrGenerating(false);
              }
            } else {
              // No logo was used, so this is a different error
              setQrPreviewUrl(null);
              setQrGenerating(false);
            }
          }
        }
      } catch (error) {
        console.error('Error generating QR preview:', error);
        if (isMounted) {
          setQrPreviewUrl(null);
          setQrGenerating(false);
        }
      }
    };

    // Use requestAnimationFrame for initial render to prevent glitches
    rafId = requestAnimationFrame(() => {
      if (isMounted) {
        // Small delay to ensure DOM is fully ready and debounce rapid changes
        generationTimeoutRef.current = setTimeout(() => {
          if (isMounted) {
            generateQRPreview();
            generationTimeoutRef.current = null;
          }
        }, 50);
      }
    });
    
    return () => {
      isMounted = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
    };
  }, [formData.theaterId, formData.name, formData.qrType, formData.selectedSeats, formData.orientation, formData.logoUrl, formData.logoType, formData._logoUpdateKey, defaultLogoUrl]);

  // ==================== SEAT MAP DATA ====================
  const seatMapData = useMemo(() => {
    if (allAvailableSeats.length === 0) return [];
    
    const seatMap = [];
    const rowSeatsMap = new Map();
    
    allAvailableSeats.forEach(range => {
      const { startRowCode, endRowCode, startNumber, endNumber } = range;
      
      for (let rowCode = 65; rowCode <= endRowCode; rowCode++) {
        const currentRow = String.fromCharCode(rowCode);
        
        let rowStart, rowEnd;
        
        if (startRowCode === endRowCode) {
          if (rowCode === startRowCode) {
            rowStart = startNumber;
            rowEnd = endNumber;
          } else {
            continue;
          }
        } else {
          if (rowCode === startRowCode) {
            rowStart = startNumber;
            rowEnd = endNumber;
          } else if (rowCode === endRowCode) {
            rowStart = 1;
            rowEnd = endNumber;
          } else {
            rowStart = 1;
            rowEnd = endNumber;
          }
        }
        
        if (!rowSeatsMap.has(currentRow)) {
          rowSeatsMap.set(currentRow, new Set());
        }
        
        const seatSet = rowSeatsMap.get(currentRow);
        for (let i = rowStart; i <= rowEnd; i++) {
          seatSet.add(i);
        }
      }
    });
    
    Array.from(rowSeatsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([row, seatSet]) => {
        const seats = Array.from(seatSet)
          .sort((a, b) => a - b)
          .map(num => `${row}${num}`);
        seatMap.push({ row, seats });
      });
    
    return seatMap;
  }, [allAvailableSeats]);

  // Function to calculate QR codes from seat range
  const calculateQRCodes = useCallback((startSeat, endSeat) => {
    if (!startSeat || !endSeat) return { count: 0, seats: [] };
    
    try {
      // Extract row letter and number from seat IDs
      const startMatch = startSeat.match(/^([A-Z]+)(\d+)$/);
      const endMatch = endSeat.match(/^([A-Z]+)(\d+)$/);
      
      if (!startMatch || !endMatch) return { count: 0, seats: [] };
      
      const [, startRow, startNum] = startMatch;
      const [, endRow, endNum] = endMatch;
      
      // If same row, calculate seats in that row
      if (startRow === endRow) {
        const start = parseInt(startNum);
        const end = parseInt(endNum);
        const count = Math.max(0, end - start + 1);
        const seats = [];
        
        for (let i = start; i <= end; i++) {
          seats.push(`${startRow}${i}`);
        }
        
        return { count, seats };
      }
      
      // If different rows (A1 to B20), calculate across rows
      const startRowCode = startRow.charCodeAt(0);
      const endRowCode = endRow.charCodeAt(0);
      const startNumber = parseInt(startNum);
      const endNumber = parseInt(endNum);
      
      let totalSeats = [];
      
      for (let rowCode = startRowCode; rowCode <= endRowCode; rowCode++) {
        const currentRow = String.fromCharCode(rowCode);
        const start = rowCode === startRowCode ? startNumber : 1;
        const end = rowCode === endRowCode ? endNumber : endNumber;
        
        for (let seatNum = start; seatNum <= end; seatNum++) {
          totalSeats.push(`${currentRow}${seatNum}`);
        }
      }
      
      return { count: totalSeats.length, seats: totalSeats };
    } catch (error) {
      return { count: 0, seats: [] };
    }
  }, []);

  // Generate theater seat map based on all stored ranges - now memoized above as seatMapData
  const generateSeatMap = useCallback(() => seatMapData, [seatMapData]);

  // Handle seat selection
  const handleSeatClick = useCallback((seatId) => {
    setFormData(prev => {
      const isSelected = prev.selectedSeats.includes(seatId);
      const newSelectedSeats = isSelected
        ? prev.selectedSeats.filter(seat => seat !== seatId)
        : [...prev.selectedSeats, seatId];
      
      return {
        ...prev,
        selectedSeats: newSelectedSeats
      };
    });
  }, []);

  // Auto-populate seat range based on selection
  const updateSeatRangeFromSelection = () => {
    const { selectedSeats } = formData;
    if (selectedSeats.length === 0) return;
    
    // Sort seats to find range
    const sortedSeats = [...selectedSeats].sort((a, b) => {
      const [rowA, numA] = [a.match(/[A-Z]+/)[0], parseInt(a.match(/\d+/)[0])];
      const [rowB, numB] = [b.match(/[A-Z]+/)[0], parseInt(b.match(/\d+/)[0])];
      
      if (rowA !== rowB) return rowA.localeCompare(rowB);
      return numA - numB;
    });
    
    setFormData(prev => ({
      ...prev,
      seatStart: sortedSeats[0],
      seatEnd: sortedSeats[sortedSeats.length - 1]
    }));
  };

  const validateForm = useCallback(() => {
    const { theaterId, qrType, name, seatStart, seatEnd, seatClass, logoType } = formData;
    
    if (!theaterId) {
      toast.error('Please select a theater');
      return false;
    }
    
    if (!logoType) {
      toast.error('Please select a logo type');
      return false;
    }
    
    if (!qrType) {
      toast.error('Please select a QR Code Type');
      return false;
    }
    
    if (!name.trim()) {
      toast.error('Please select a QR Code Name');
      return false;
    }
    
    if (qrType === 'screen') {
      if (!seatClass) {
        toast.error('Seat class is required for screen QR codes');
        return false;
      }
      
      // Check if seats are selected
      if (!formData.selectedSeats || formData.selectedSeats.length === 0) {
        toast.error('Please select at least one seat for screen QR codes');
        return false;
      }
      
      if (formData.selectedSeats.length > 100) {
        toast.error('Maximum 100 seats allowed per generation. Please select fewer seats.');
        return false;
      }
    }
    
    return true;
  }, [formData, toast]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setGenerating(true);
      
      // Set initial progress
      const totalSeats = formData.qrType === 'single' ? 1 : (formData.selectedSeats?.length || 1);
      setGeneratingProgress({ 
        current: 0, 
        total: totalSeats, 
        message: formData.qrType === 'single' ? 'Generating single QR code...' : `Preparing to generate ${totalSeats} QR codes...`
      });
      
      // Get authentication token
      const token = config.helpers.getAuthToken();
      
      if (!token) {
        toast.error('Authentication required. Please login again.');
        setGenerating(false);
        return;
      }
      

      // Use unified endpoint for both single and screen QR codes
      const endpoint = '/single-qrcodes';
      
      // ✅ FIX: Ensure logoUrl is set properly - match theater version logic
      const selectedTheater = theaters.find(t => t._id === formData.theaterId);
      const theaterLogoUrl = selectedTheater?.branding?.logoUrl 
        || selectedTheater?.branding?.logo 
        || selectedTheater?.documents?.logo 
        || selectedTheater?.media?.logo 
        || selectedTheater?.logo 
        || selectedTheater?.logoUrl 
        || '';
      
      const finalLogoType = formData.logoType || 'default';
      const finalLogoUrl = formData.logoUrl || (finalLogoType === 'theater' ? theaterLogoUrl : defaultLogoUrl);
      
      // Prepare request body based on QR type
      let requestBody;
      if (formData.qrType === 'single') {
        // For single QR codes
        requestBody = {
          theaterId: formData.theaterId,
          qrType: 'single',
          qrName: formData.name,
          seatClass: formData.seatClass,
          logoUrl: finalLogoUrl,
          logoType: finalLogoType,
          orientation: formData.orientation || 'portrait'
        };
      } else {
        // For screen QR codes
        requestBody = {
          theaterId: formData.theaterId,
          qrType: 'screen',
          qrName: formData.name,
          seatClass: formData.seatClass,
          seats: formData.selectedSeats, // Array of seats (A1, A2, B1, etc.)
          logoUrl: finalLogoUrl,
          logoType: finalLogoType,
          orientation: formData.orientation || 'portrait'
        };
      }
      
      

      // Update progress for API call
      setGeneratingProgress(prev => ({ 
        ...prev, 
        message: 'Sending request to server...' 
      }));
      
      // unifiedFetch throws errors for non-OK responses, so if we get here, it succeeded
      await unifiedFetch(config.helpers.getApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(requestBody)
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });
      
      // If unifiedFetch didn't throw, the request was successful
      
      // Directly set progress to completion since QR codes are already created
      setGeneratingProgress({
        current: totalSeats,
        total: totalSeats,
        message: 'QR codes generated successfully!'
      });
      
      // Keep the completion visible for 1 second before showing success modal
      setTimeout(() => {
        setGenerating(false);
        
        const message = formData.qrType === 'single' 
          ? 'Single QR code generated and saved successfully!'
          : `${totalSeats} screen QR codes generated successfully!`;
        
        // Show success message
        toast.success(message);
        
        // Reload QR names to update the dropdown (with delay to ensure DB update)
        if (formData.theaterId) {
          setTimeout(() => {
            loadQRNames(formData.theaterId, true); // Force refresh after generation
          }, 500); // 500ms delay to ensure database is updated
        }
        
        // Auto-navigate to QR Management page after 2 seconds
        setTimeout(() => {
          navigate('/qr-management');
        }, 2000);
      }, 1000);
    } catch (error) {
      // ✅ FIX: Show error message to user
      console.error('❌ QR generation error:', error);
      toast.error(`Failed to generate QR codes: ${error.message || 'Network error'}`);
      setGenerating(false);
    }
  }, [formData, validateForm, navigate, loadQRNames, defaultLogoUrl, toast]);

  // Add button click handler to generate seat map
  const handleGenerateSeatMap = useCallback(() => {
    // For now, allow generating seat map without specific start/end requirements
    // Users can interact with the visual seat map directly
    
    // Generate a default seat map if no specific range is provided
    if (!formData.seatStart && !formData.seatEnd) {
      // Generate default range A1-A20 if no input provided
      setFormData(prev => ({
        ...prev,
        seatStart: 'A1',
        seatEnd: 'A20'
      }));
      // Use setTimeout to wait for state update and call the function again
      setTimeout(() => {
        // Re-read formData from state after update
        const updatedSeatStart = 'A1';
        const updatedSeatEnd = 'A20';
        
        // Validate format
        const startMatch = updatedSeatStart.match(/^([A-Z]+)(\d+)$/);
        const endMatch = updatedSeatEnd.match(/^([A-Z]+)(\d+)$/);
        
        if (!startMatch || !endMatch) {
          return;
        }
        
        const [, startRow, startNum] = startMatch;
        const [, endRow, endNum] = endMatch;
        const startRowCode = startRow.charCodeAt(0);
        const endRowCode = endRow.charCodeAt(0);
        const startNumber = parseInt(startNum);
        const endNumber = parseInt(endNum);
        
        // Add current range to available seats list
        const currentRange = {
          startRow,
          endRow,
          startNumber,
          endNumber,
          startRowCode,
          endRowCode
        };
        
        setAllAvailableSeats(prev => {
          const exists = prev.some(range => 
            range.startRow === startRow && 
            range.endRow === endRow && 
            range.startNumber === startNumber && 
            range.endNumber === endNumber
          );
          
          if (!exists) {
            return [...prev, currentRange];
          }
          return prev;
        });
        
        // Show seat map
        setShowSeatMap(true);
        
        // Auto-select all newly generated seats
        const currentRangeSeats = [];
        for (let rowCode = 65; rowCode <= endRowCode; rowCode++) {
          const currentRow = String.fromCharCode(rowCode);
          
          let rowStart, rowEnd;
          if (startRowCode === endRowCode) {
            if (rowCode === startRowCode) {
              rowStart = startNumber;
              rowEnd = endNumber;
            } else {
              continue;
            }
          } else {
            if (rowCode === startRowCode) {
              rowStart = startNumber;
              rowEnd = endNumber;
            } else if (rowCode === endRowCode) {
              rowStart = 1;
              rowEnd = endNumber;
            } else {
              rowStart = 1;
              rowEnd = endNumber;
            }
          }
          
          for (let i = rowStart; i <= rowEnd; i++) {
            currentRangeSeats.push(`${currentRow}${i}`);
          }
        }
        
        // Add new seats to selected seats (avoid duplicates)
        setFormData(prev => ({
          ...prev,
          seatStart: '',
          seatEnd: '',
          selectedSeats: [...new Set([...prev.selectedSeats, ...currentRangeSeats])]
        }));
      }, 100);
      return;
    }
    
    // Validate format if values are provided
    const startMatch = formData.seatStart.match(/^([A-Z]+)(\d+)$/);
    const endMatch = formData.seatEnd.match(/^([A-Z]+)(\d+)$/);
    
    if (!startMatch || !endMatch) {
      // Removed error modal - validation errors silently fail
      return;
    }
    
    const [, startRow, startNum] = startMatch;
    const [, endRow, endNum] = endMatch;
    const startRowCode = startRow.charCodeAt(0);
    const endRowCode = endRow.charCodeAt(0);
    const startNumber = parseInt(startNum);
    const endNumber = parseInt(endNum);
    
    // Validate that start comes before or equals end
    if (startRowCode > endRowCode || (startRowCode === endRowCode && startNumber > endNumber)) {
      alert('Start seat must come before or equal to end seat');
      return;
    }
    
    // Add current range to available seats list
    const currentRange = {
      startRow,
      endRow,
      startNumber,
      endNumber,
      startRowCode,
      endRowCode
    };
    
    setAllAvailableSeats(prev => {
      // Check if this range already exists
      const exists = prev.some(range => 
        range.startRow === startRow && 
        range.endRow === endRow && 
        range.startNumber === startNumber && 
        range.endNumber === endNumber
      );
      
      if (!exists) {
        return [...prev, currentRange];
      }
      return prev;
    });
    
    // Show seat map
    setShowSeatMap(true);
    
    // Auto-select all newly generated seats
    const currentRangeSeats = [];
    for (let rowCode = 65; rowCode <= endRowCode; rowCode++) { // 65 = 'A'
      const currentRow = String.fromCharCode(rowCode);
      
      let rowStart, rowEnd;
      if (startRowCode === endRowCode) {
        if (rowCode === startRowCode) {
          rowStart = startNumber;
          rowEnd = endNumber;
        } else {
          continue;
        }
      } else {
        if (rowCode === startRowCode) {
          rowStart = startNumber;
          rowEnd = endNumber;
        } else if (rowCode === endRowCode) {
          rowStart = 1;
          rowEnd = endNumber;
        } else {
          rowStart = 1;
          rowEnd = endNumber;
        }
      }
      
      for (let i = rowStart; i <= rowEnd; i++) {
        currentRangeSeats.push(`${currentRow}${i}`);
      }
    }
    
    // Add new seats to selected seats (avoid duplicates)
    setFormData(prev => ({
      ...prev,
      seatStart: '',
      seatEnd: '',
      selectedSeats: [...new Set([...prev.selectedSeats, ...currentRangeSeats])]
    }));
  }, [formData.seatStart, formData.seatEnd]);

  // Delete specific row from seat map
  const handleDeleteRow = useCallback((rowToDelete) => {
    // Remove ranges that contain this row
    setAllAvailableSeats(prev => {
      return prev.filter(range => {
        const { startRowCode, endRowCode } = range;
        const deleteRowCode = rowToDelete.charCodeAt(0);
        // Keep ranges that don't include the row to delete
        return !(deleteRowCode >= startRowCode && deleteRowCode <= endRowCode);
      });
    });
    
    // Remove selected seats from this row
    setFormData(prev => ({
      ...prev,
      selectedSeats: prev.selectedSeats.filter(seat => !seat.startsWith(rowToDelete))
    }));
  }, []);

  const handleReset = useCallback(() => {
    setFormData({
      theaterId: '',
      qrType: '',
      name: '',
      seatStart: '',
      seatEnd: '',
      selectedSeats: [],
      logoType: 'default',
      logoUrl: defaultLogoUrl,
      seatClass: ''
    });
    setShowSeatMap(false); // Hide seat map when resetting
    setAllAvailableSeats([]); // Clear all stored seat ranges
    setQrNames([]); // Clear QR names when resetting
  }, [defaultLogoUrl]);

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Generate QR" currentPage="qr-generate">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Generate QR Codes"
              showBackButton={false}
            />
            
            <div className="qr-generate-container">
              {/* Left Column - Form */}
              <div className="qr-generate-form-wrapper">
                <form onSubmit={handleSubmit} className="qr-generate-form">
                  <div className="form-section mui-form-section form-section-mui">
                    <h2>Basic Information</h2>
                    <div className="form-grid mui-form-grid">
                  {/* Theater Selection */}
                  <Box className="mui-form-group">
                    {theatersLoading ? (
                      <TheaterSelectSkeleton />
                    ) : (
                      <FormControl fullWidth required error={false}>
                        <InputLabel id="theaterId-label">Select Theater *</InputLabel>
                        <Select
                          id="theaterId"
                          name="theaterId"
                          labelId="theaterId-label"
                          label="Select Theater *"
                          value={formData.theaterId || ''}
                          onChange={handleInputChange}
                          displayEmpty
                        >
                          <MenuItem value="" disabled>
                            {/* <em>{theaters.length === 0 ? 'No active theaters found' : 'Select a theater'}</em> */}
                          </MenuItem>
                          {theaters.map(theater => (
                            <MenuItem key={theater._id} value={theater._id}>
                              {theater.name}
                              {theater.location?.city && theater.location?.state && 
                                ` - ${theater.location.city}, ${theater.location.state}`
                              }
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Box>

                  {/* Logo Selection */}
                  <Box className="mui-form-group">
                    <FormControl fullWidth required disabled={!formData.theaterId} error={false}>
                      <InputLabel id="logoType-label">Logo Selection *</InputLabel>
                      <Select
                        id="logoType"
                        name="logoType"
                        labelId="logoType-label"
                        label="Logo Selection *"
                        value={formData.logoType || ''}
                        onChange={(e) => handleLogoTypeChange(e.target.value)}
                        displayEmpty
                      >
                        <MenuItem value="" disabled>
                        </MenuItem>
                        <MenuItem value="default">Default Logo</MenuItem>
                        <MenuItem value="theater">Theater Logo</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  {/* QR Type Selection */}
                  <Box className="mui-form-group">
                    <FormControl fullWidth required disabled={!formData.theaterId || !formData.logoType} error={false}>
                      <InputLabel id="qrType-label">QR Code Type *</InputLabel>
                      <Select
                        id="qrType"
                        name="qrType"
                        labelId="qrType-label"
                        label="QR Code Type *"
                        value={formData.qrType || ''}
                        onChange={(e) => handleQRTypeChange(e.target.value)}
                        displayEmpty
                      >
                        <MenuItem value="" disabled>
                        </MenuItem>
                        <MenuItem value="single">SINGLE QR CODE</MenuItem>
                        <MenuItem value="screen">Screen</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  {/* QR Code Name */}
                  <Box className="mui-form-group">
                    <FormControl 
                      fullWidth 
                      required 
                      disabled={!formData.theaterId || qrNamesLoading || qrNames.length === 0}
                      error={qrNames.length === 0 && formData.theaterId && !qrNamesLoading}
                    >
                      <InputLabel id="name-label">QR Code Name *</InputLabel>
                      <Select
                        id="name"
                        name="name"
                        labelId="name-label"
                        label="QR Code Name *"
                        value={(() => {
                          // ✅ FIX: Ensure value is always valid - check if it exists in qrNames
                          const validValue = formData.name && qrNames.some(qr => qr.qrName === formData.name)
                            ? formData.name
                            : '';
                          return validValue;
                        })()}
                        onChange={handleInputChange}
                        displayEmpty
                      >
                        <MenuItem value="" disabled>
                          {/* <em>
                            {qrNamesLoading
                              ? 'Loading QR names...'
                              : qrNames.length === 0
                              
                              ? 'No QR names available'
                              : 'Select QR Code Name'}
                          </em> */}
                        </MenuItem>
                        {qrNames.map(qrName => (
                          <MenuItem key={qrName._id} value={qrName.qrName}>
                            {qrName.qrName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  {/* Seat Class - Show for both canteen and screen types */}
                  <Box className="mui-form-group seat-class-container full-width" sx={{ gridColumn: '1 / -1' }}>
                    <TextField
                      id="seatClass"
                      name="seatClass"
                      label="Seat Class *"
                      value={formData.seatClass}
                      InputProps={{
                        readOnly: true
                      }}
                      inputProps={{
                        style: { textAlign: 'center' }
                      }}
                      helperText={formData.name ? `Auto-populated from QR name: ${formData.name}` : "Seat class will be auto-populated when you select a QR name"}
                      placeholder={formData.name ? "Auto-populated from QR name" : ""}
                      fullWidth
                      className="seat-class-field"
                    />
                  </Box>

                  {/* Screen-specific fields */}
                  {formData.qrType === 'screen' && (
                    <>

                      {/* Seat Range and Generate Button - Always visible for multiple ranges */}
                      <Box className="seat-range-container full-width" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 2, alignItems: 'start', gridColumn: '1 / -1' }}>
                        <Box className="mui-form-group">
                          <TextField
                            id="seatStart"
                            name="seatStart"
                            label={(!formData.selectedSeats || formData.selectedSeats.length === 0) ? "Seat Start ID *" : "Seat Start ID"}
                            value={formData.seatStart}
                            onChange={handleInputChange}
                            placeholder="e.g., A1, B1, C1"
                            fullWidth
                            required={!formData.selectedSeats || formData.selectedSeats.length === 0}
                          />
                        </Box>

                        <Box className="mui-form-group">
                          <TextField
                            id="seatEnd"
                            name="seatEnd"
                            label={(!formData.selectedSeats || formData.selectedSeats.length === 0) ? "Seat End ID *" : "Seat End ID"}
                            value={formData.seatEnd}
                            onChange={handleInputChange}
                            placeholder="e.g., A20, B20, C20"
                            fullWidth
                            required={!formData.selectedSeats || formData.selectedSeats.length === 0}
                          />
                        </Box>
                        
                        {/* Generate Seat Map Button */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', height: '56px' }}>
                          <Button
                            type="button"
                            variant="contained"
                            onClick={handleGenerateSeatMap}
                            sx={{
                              backgroundColor: '#8B5CF6',
                              '&:hover': { backgroundColor: '#7C3AED' },
                              textTransform: 'none',
                              padding: '10px 20px',
                              whiteSpace: 'nowrap',
                              height: '40px'
                            }}
                          >
                            {formData.selectedSeats && formData.selectedSeats.length > 0 ? 'Add More Seats' : 'Generate Seat Map'}
                          </Button>
                        </Box>
                      </Box>

                      {/* Inline Seat Selection - Appears right after Generate Seat Map */}
                      {showSeatMap && allAvailableSeats.length > 0 && (
                        <Box 
                          sx={{ 
                            gridColumn: '1 / -1',
                            marginTop: '24px',
                            padding: '24px',
                            background: '#fff',
                            borderRadius: '12px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                            border: '1px solid #e5e7eb',
                            animation: 'fadeIn 0.3s ease-in'
                          }}
                        >
                          <style>{`
                            @keyframes fadeIn {
                              from { opacity: 0; transform: translateY(-10px); }
                              to { opacity: 1; transform: translateY(0); }
                            }
                          `}</style>
                          <div className="seat-map-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>Select Seats</h4>
                            <div className="seat-controls" style={{ display: 'flex', gap: '10px' }}>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setShowSeatMap(false)}
                                style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '14px', color: '#374151' }}
                              >
                                Hide Map ({formData.selectedSeats.length})
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setFormData(prev => ({ ...prev, selectedSeats: [] }))}
                                style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #ef4444', background: '#fff', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }}
                              >
                                Clear All
                              </button>
                            </div>
                          </div>

                          <div className="theater-screen-container" style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
                            <div className="theater-screen" style={{
                              width: '80%',
                              height: '40px',
                              background: 'linear-gradient(180deg, #8B5CF6 0%, rgba(139, 92, 246, 0.1) 100%)',
                              borderRadius: '100% 100% 0 0 / 20px 20px 0 0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              letterSpacing: '2px',
                              boxShadow: '0 10px 20px -10px rgba(139, 92, 246, 0.5)',
                              transform: 'perspective(500px) rotateX(-5deg)'
                            }}>
                              🎬 SCREEN
                            </div>
                          </div>

                          <div className="seat-map" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                            {(() => {
                              const rowMap = new Map();
                              allAvailableSeats.forEach((range, rangeIndex) => {
                                Array.from({ length: range.endRowCode - range.startRowCode + 1 }, (_, i) => {
                                  const rowCode = range.startRowCode + i;
                                  const currentRow = String.fromCharCode(rowCode);
                                  let rowStart = rowCode === range.startRowCode ? range.startNumber : 1;
                                  let rowEnd = rowCode === range.endRowCode ? range.endNumber : range.endNumber;

                                  const seats = Array.from({ length: rowEnd - rowStart + 1 }, (_, j) => {
                                    const seatNumber = rowStart + j;
                                    return `${currentRow}${seatNumber}`;
                                  });

                                  if (!rowMap.has(currentRow)) {
                                    rowMap.set(currentRow, { seats: [], rangeIndices: new Set() });
                                  }
                                  const rowData = rowMap.get(currentRow);
                                  rowData.seats.push(...seats);
                                  rowData.rangeIndices.add(rangeIndex);
                                });
                              });

                              return Array.from(rowMap.entries()).map(([row, { seats }]) => (
                                <div key={row} className="seat-row" style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '800px' }}>
                                  <div className="row-label" style={{ width: '24px', textAlign: 'center', fontWeight: 'bold', color: '#6b7280' }}>{row}</div>
                                  <div className="seats" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                                    {seats.map(seatId => (
                                      <button
                                        key={seatId}
                                        type="button"
                                        className={`seat ${formData.selectedSeats.includes(seatId) ? 'selected' : 'available'}`}
                                        onClick={() => handleSeatClick(seatId)}
                                        title={seatId}
                                        onMouseEnter={() => setHoveredSeat(seatId)}
                                        onMouseLeave={() => setHoveredSeat(null)}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '6px',
                                          border: formData.selectedSeats.includes(seatId) 
                                            ? 'none' 
                                            : hoveredSeat === seatId 
                                              ? '2px solid #8B5CF6' 
                                              : '1px solid #e5e7eb',
                                          background: formData.selectedSeats.includes(seatId) 
                                            ? '#8B5CF6' 
                                            : hoveredSeat === seatId 
                                              ? '#f3f4f6' 
                                              : '#fff',
                                          color: formData.selectedSeats.includes(seatId) ? '#fff' : '#4b5563',
                                          fontSize: '11px',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          transition: 'all 0.2s ease',
                                          transform: hoveredSeat === seatId && !formData.selectedSeats.includes(seatId) ? 'scale(1.1)' : 'scale(1)',
                                          boxShadow: formData.selectedSeats.includes(seatId) 
                                            ? '0 2px 4px rgba(139, 92, 246, 0.3)' 
                                            : hoveredSeat === seatId 
                                              ? '0 2px 8px rgba(139, 92, 246, 0.2)' 
                                              : 'none'
                                        }}
                                      >
                                        {seatId.replace(/[A-Z]/g, '')}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    className="action-btn delete-btn"
                                    onClick={() => handleDeleteRow(row)}
                                    title={`Delete Row ${row}`}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '50%',
                                      border: 'none',
                                      background: '#fee2e2',
                                      color: '#ef4444',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'background 0.2s',
                                      opacity: 0.8
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = 1}
                                    onMouseLeave={(e) => e.target.style.opacity = 0.8}
                                  >
                                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '16px', height: '16px', pointerEvents: 'none' }}>
                                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                    </svg>
                                  </button>
                                </div>
                              ));
                            })()}
                          </div>

                          {formData.selectedSeats.length > 0 && (
                            <div className="selection-info" style={{
                              marginTop: '24px',
                              padding: '16px 20px',
                              background: '#f9fafb',
                              borderRadius: '12px',
                              border: '1px solid #e5e7eb',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{formData.selectedSeats.length} seats selected</span>
                                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                  {formData.selectedSeats.slice(0, 10).join(', ')}
                                  {formData.selectedSeats.length > 10 && `... and ${formData.selectedSeats.length - 10} more`}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <Button
                                  type="button"
                                  variant="outlined"
                                  onClick={() => navigate('/qr-management')}
                                  disabled={generating}
                                  sx={{
                                    borderColor: '#6b7280',
                                    color: '#6b7280',
                                    '&:hover': {
                                      borderColor: '#4b5563',
                                      backgroundColor: '#f3f4f6'
                                    },
                                    textTransform: 'none',
                                    padding: '8px 20px',
                                    minWidth: '100px'
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  variant="contained"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleSubmit(e);
                                  }}
                                  disabled={generating}
                                  sx={{
                                    backgroundColor: generating ? '#9ca3af' : '#8B5CF6',
                                    '&:hover': {
                                      backgroundColor: generating ? '#9ca3af' : '#7C3AED'
                                    },
                                    textTransform: 'none',
                                    padding: '8px 20px',
                                    minWidth: '160px',
                                    fontWeight: 600
                                  }}
                                >
                                  {generating ? (
                                    <>
                                      <span className="loading-spinner loading-spinner-inline"></span>
                                      Generating...
                                    </>
                                  ) : (
                                    `Generate QR Codes`
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </Box>
                      )}
                    </>
                  )}
                    </div>
                  </div>

              {/* Action Buttons - Hide when screen type (moved to seat selection section) */}
              {formData.qrType !== 'screen' && (
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', marginTop: 4, paddingTop: 3, borderTop: '1px solid #e5e7eb' }}>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => navigate('/qr-management')}
                  disabled={generating}
                  sx={{
                    borderColor: '#6b7280',
                    color: '#6b7280',
                    '&:hover': {
                      borderColor: '#4b5563',
                      backgroundColor: '#f3f4f6'
                    },
                    textTransform: 'none',
                    padding: '10px 24px',
                    minWidth: '120px'
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={generating || theatersLoading}
                  sx={{
                    backgroundColor: generating ? '#9ca3af' : '#8B5CF6',
                    '&:hover': {
                      backgroundColor: generating ? '#9ca3af' : '#7C3AED'
                    },
                    textTransform: 'none',
                    padding: '10px 24px',
                    minWidth: '180px',
                    fontWeight: 600
                  }}
                >
                  {generating ? (
                    <>
                      <span className="loading-spinner loading-spinner-inline"></span>
                      Generating...
                    </>
                  ) : (
                    `Generate QR ${formData.qrType === 'screen' ? 'Codes' : 'Code'}`
                  )}
                </Button>
              </Box>
              )}
            </form>
                </div>

                {/* Right Column - QR Preview */}
                <div className="qr-preview-wrapper">
                  <div className={`qr-preview-container ${formData.orientation === 'portrait' ? 'qr-preview-container-portrait' : ''}`}>
                    <h3 className="qr-preview-title">
                      QR Code Preview
                    </h3>
                    
                    {/* Orientation Toggle */}
                    <div className="qr-orientation-toggle">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, orientation: 'portrait' }))}
                        className={`orientation-btn ${formData.orientation === 'portrait' ? 'active' : ''}`}
                      >
                        Portrait
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, orientation: 'landscape' }))}
                        className={`orientation-btn ${formData.orientation === 'landscape' ? 'active' : ''}`}
                      >
                        Landscape
                      </button>
                    </div>

                    {/* QR Code Preview Card */}
                    <div className={`qr-preview-card ${formData.orientation}`}>
                      {/* Portrait Layout: QR Code - Text - Icons - Theater Name */}
                      {formData.orientation === 'portrait' ? (
                        <>
                          {/* 1. QR Code at Top */}
                          <div className="qr-code-container">
                            <div className="qr-code-box">
                              {qrGenerating && !qrPreviewUrl && (
                                <div className="qr-code-loading-overlay">
                                  <div className="qr-code-loading-spinner"></div>
                                </div>
                              )}
                              <canvas
                                ref={qrCanvasRef}
                                className={`qr-canvas ${qrGenerating && !qrPreviewUrl ? 'qr-canvas-hidden' : ''}`}
                              />
                            </div>
                          </div>

                          {/* 2. Food Icons Image */}
                          <div className="food-icons-container">
                            {/* Portrait Image - Visible in portrait mode */}
                            <img 
                              ref={portraitImageRef}
                              key={`portrait-${currentImageIndex}`}
                              src={imageAlternatives[currentImageIndex]} 
                              alt="Scan Order Pay"
                              data-loaded={portraitImageLoaded}
                              className={`food-icon-image ${(imageError && currentImageIndex >= imageAlternatives.length - 1) || !portraitImageLoaded ? 'food-icon-image-hidden' : 'food-icon-image-visible'}`}
                              style={{ opacity: portraitImageLoaded ? 1 : 0 }}
                              onError={() => {
                                if (currentImageIndex < imageAlternatives.length - 1) {
                                  const nextIndex = currentImageIndex + 1;
                                  setCurrentImageIndex(nextIndex);
                                  setImageError(false);
                                  setPortraitImageLoaded(false);
                                } else {
                                  console.error('All image alternatives failed. Image not found.');
                                  setImageError(true);
                                  setPortraitImageLoaded(false);
                                }
                              }}
                              onLoad={() => {
                                setPortraitImageLoaded(true);
                                setImageError(false);
                                // Cache the loaded image
                                const currentSrc = imageAlternatives[currentImageIndex];
                                if (!preloadedImagesRef.current.has(currentSrc)) {
                                  preloadedImagesRef.current.set(currentSrc, portraitImageRef.current);
                                }
                              }}
                              loading="eager"
                              decoding="async"
                              fetchPriority="high"
                            />
                            {/* Landscape Image - Always loading but hidden in portrait mode */}
                            <img 
                              ref={landscapeImageRef}
                              key={`landscape-${currentImageIndex}`}
                              src={imageAlternatives[currentImageIndex]} 
                              alt="Scan Order Pay"
                              data-loaded={landscapeImageLoaded}
                              className="food-icon-image food-icon-image-hidden"
                              style={{ opacity: landscapeImageLoaded ? 1 : 0 }}
                              onError={() => {
                                if (currentImageIndex < imageAlternatives.length - 1) {
                                  const nextIndex = currentImageIndex + 1;
                                  setCurrentImageIndex(nextIndex);
                                  setImageError(false);
                                  setLandscapeImageLoaded(false);
                                } else {
                                  console.error('All image alternatives failed. Image not found.');
                                  setImageError(true);
                                  setLandscapeImageLoaded(false);
                                }
                              }}
                              onLoad={() => {
                                setLandscapeImageLoaded(true);
                                setImageError(false);
                                // Cache the loaded image
                                const currentSrc = imageAlternatives[currentImageIndex];
                                if (!preloadedImagesRef.current.has(currentSrc)) {
                                  preloadedImagesRef.current.set(currentSrc, landscapeImageRef.current);
                                }
                              }}
                              loading="eager"
                              decoding="async"
                              fetchPriority="high"
                            />
                          </div>

                          {/* 3. Theater Name at Bottom */}
                          {selectedTheater && (
                            <div className="theater-name-container">
                              <p className="theater-name-text">
                                {selectedTheater.name}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Landscape Layout */}
                          {/* Main Content Row */}
                          <div className="landscape-layout-row">
                            {/* Left Section - QR Code */}
                            <div className="qr-preview-qr">
                              {/* QR Code Display */}
                              <div className="qr-code-box">
                              {qrGenerating && !qrPreviewUrl && (
                                <div className="qr-code-loading-overlay">
                                  <div className="qr-code-loading-spinner-small"></div>
                                </div>
                              )}
                              <canvas
                                ref={qrCanvasRef}
                                className={`qr-canvas ${qrGenerating && !qrPreviewUrl ? 'qr-canvas-hidden' : ''}`}
                                style={{ borderRadius: '8px' }}
                              />
                              </div>
                            </div>

                            {/* Right Section - Food Ordering Info */}
                            <div className="qr-preview-content">
                              {/* Food Icons Image */}
                              <div className="qr-food-icons food-icons-container-landscape">
                              {/* Landscape Image - Visible in landscape mode */}
                              <img 
                                ref={landscapeImageRef}
                                key={`landscape-${currentImageIndex}`}
                                src={imageAlternatives[currentImageIndex]} 
                                alt="Scan Order Pay"
                                data-loaded={landscapeImageLoaded}
                                className={`food-icon-image ${imageError && currentImageIndex >= imageAlternatives.length - 1 ? 'food-icon-image-hidden' : 'food-icon-image-visible'}`}
                                style={{ opacity: landscapeImageLoaded ? 1 : (portraitImageLoaded ? 1 : 0) }}
                                onError={() => {
                                  if (currentImageIndex < imageAlternatives.length - 1) {
                                    const nextIndex = currentImageIndex + 1;
                                    setCurrentImageIndex(nextIndex);
                                    setImageError(false);
                                    setLandscapeImageLoaded(false);
                                  } else {
                                    console.error('All image alternatives failed. Image not found.');
                                    setImageError(true);
                                    setLandscapeImageLoaded(false);
                                  }
                                }}
                                onLoad={() => {
                                  setLandscapeImageLoaded(true);
                                  setImageError(false);
                                  // Cache the loaded image
                                  const currentSrc = imageAlternatives[currentImageIndex];
                                  if (!preloadedImagesRef.current.has(currentSrc)) {
                                    preloadedImagesRef.current.set(currentSrc, landscapeImageRef.current);
                                  }
                                }}
                                loading="eager"
                                decoding="async"
                                fetchPriority="high"
                              />
                              {/* Portrait Image - Always loading but hidden in landscape mode */}
                              <img 
                                ref={portraitImageRef}
                                key={`portrait-${currentImageIndex}`}
                                src={imageAlternatives[currentImageIndex]} 
                                alt="Scan Order Pay"
                                data-loaded={portraitImageLoaded}
                                className="food-icon-image food-icon-image-hidden"
                                style={{ opacity: portraitImageLoaded ? 1 : 0 }}
                                onError={() => {
                                  if (currentImageIndex < imageAlternatives.length - 1) {
                                    const nextIndex = currentImageIndex + 1;
                                    setCurrentImageIndex(nextIndex);
                                    setImageError(false);
                                    setPortraitImageLoaded(false);
                                  } else {
                                    console.error('All image alternatives failed. Image not found.');
                                    setImageError(true);
                                    setPortraitImageLoaded(false);
                                  }
                                }}
                                onLoad={() => {
                                  setPortraitImageLoaded(true);
                                  setImageError(false);
                                  // Cache the loaded image
                                  const currentSrc = imageAlternatives[currentImageIndex];
                                  if (!preloadedImagesRef.current.has(currentSrc)) {
                                    preloadedImagesRef.current.set(currentSrc, portraitImageRef.current);
                                  }
                                }}
                                loading="eager"
                                decoding="async"
                                fetchPriority="high"
                              />
                              </div>
                            </div>

                            {/* Theater Name - Centered between both images */}
                            {selectedTheater && (
                              <div className="theater-name-container theater-name-container-landscape">
                                <p className="theater-name-text theater-name-text-landscape">
                                  {selectedTheater.name}
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

            </div>
            
            {/* QR Generation Loading Overlay - Rendered via Portal */}
            {generating && ReactDOM.createPortal(
              <div className="qr-generation-overlay">
                <div className="qr-generation-modal">
                  <div className="qr-generation-header">
                    <h3>Generating QR Codes</h3>
                    <div className="qr-generation-spinner">
                      <div className="spinner-circle"></div>
                    </div>
                  </div>
                  
                  <div className="qr-generation-content">
                    <div className="progress-info">
                      <div className="progress-message">{generatingProgress.message}</div>
                      {generatingProgress.total > 1 && (
                        <div className="progress-counter">
                          {generatingProgress.current} of {generatingProgress.total} completed
                        </div>
                      )}
                    </div>
                    
                    {generatingProgress.total > 1 ? (
                      <div className="progress-bar-container">
                        <div className="progress-bar-wrapper">
                          <div className="progress-bar">
                            <div 
                              className="progress-bar-fill"
                              style={{ 
                                width: `${(generatingProgress.current / generatingProgress.total) * 100}%` 
                              }}
                            >
                              <div className="progress-bar-shine"></div>
                            </div>
                          </div>
                          <div className="progress-percentage-overlay">
                            {Math.round((generatingProgress.current / generatingProgress.total) * 100)}%
                          </div>
                        </div>
                        <div className="progress-stats">
                          <span className="progress-current">{generatingProgress.current}/{generatingProgress.total} QR Codes</span>
                          <span className="progress-speed">Generating...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="simple-loading">
                        <div className="simple-progress-bar">
                          <div className="simple-progress-fill"></div>
                        </div>
                        <div className="loading-text">Creating QR code...</div>
                      </div>
                    )}
                    
                    <div className="generating-details">
                      {formData.qrType === 'screen' && formData.selectedSeats && (
                        <div className="seats-info">
                          <strong>Selected Seats:</strong> {formData.selectedSeats.join(', ')}
                        </div>
                      )}
                      <div className="theater-info">
                        <strong>Theater:</strong> {theaters.find(t => t._id === formData.theaterId)?.name || 'Unknown'}
                      </div>
                      <div className="class-info">
                        <strong>Seat Class:</strong> {formData.seatClass}
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}
            
            {/* Performance Monitoring Display */}
            {(import.meta.env.DEV || import.meta.env.MODE === 'development') && performanceMetrics && (
              <div className="performance-monitor">
                QR Generate: {qrCodeCount} codes | 
                Theaters: {theaters.length} | 
                Memory: {performanceMetrics.memoryUsage}MB
              </div>
            )}
          </PageContainer>
        </div>
      </AdminLayout>
    </ErrorBoundary>
  );
});

export default QRGenerate;
