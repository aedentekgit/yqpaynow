import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import config from '@config';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Button
} from '@mui/material';
import '@styles/TheaterGenerateQR.css';
import '@styles/TheaterList.css';
import '@styles/QRGenerate.css';
import '@styles/AddProductMUI.css';
import '@styles/pages/QRGenerate.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import QRCode from 'qrcode';



// QR Code Preview Component with Logo Overlay
const QRCodePreview = React.memo(({ data, logoUrl, size = 200 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let mounted = true;

    const generateQRWithLogo = async () => {
      try {
        // Clear canvas
        ctx.clearRect(0, 0, size, size);

        // Import QRCode library
        const QRCode = await import('qrcode');

        // Generate base QR code
        await QRCode.toCanvas(canvas, data, {
          width: size,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'H'
        });

        if (!mounted) return;

        // Add logo if provided
        if (logoUrl) {

          // Try to load the logo
          try {
            const logoImage = await loadImageWithFallback(logoUrl);

            if (!mounted || !logoImage) return;

            // Calculate logo size (24% of QR code size - increased for better visibility)
            const logoSize = size * 0.24;
            const x = (size - logoSize) / 2;
            const y = (size - logoSize) / 2;
            const centerX = size / 2;
            const centerY = size / 2;

            // Draw white background circle for logo - reduced border
            const backgroundRadius = logoSize * 0.65;
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
            ctx.drawImage(logoImage, x, y, logoSize, logoSize);

            // Restore context
            ctx.restore();

          } catch (logoError) {
            console.error('❌ Failed to load logo:', logoError);
          }
        }
      } catch (error) {
        console.error('❌ QR Generation error:', error);
      }
    };

    generateQRWithLogo();

    return () => {
      mounted = false;
    };
  }, [data, logoUrl, size]);

  // Helper function to load image with multiple fallback strategies
  const loadImageWithFallback = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      // Construct full URL if needed
      let imageUrl = url;
      if (url && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        imageUrl = `${config.api.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      }


      img.onload = () => {
        resolve(img);
      };

      img.onerror = async () => {
        console.warn('⚠️ Direct image load failed, trying fetch method...');

        // Fallback: Try fetching as blob
        try {
          const token = localStorage.getItem('token') || localStorage.getItem('authToken');
          const response = await fetch(imageUrl, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });

          if (!response.ok) throw new Error('Fetch failed');

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          const blobImg = new Image();
          blobImg.onload = () => {
            resolve(blobImg);
          };
          blobImg.onerror = () => reject(new Error('Blob image load failed'));
          blobImg.src = blobUrl;
        } catch (fetchError) {
          console.error('❌ All image load methods failed:', fetchError);
          reject(fetchError);
        }
      };

      // Try with crossOrigin
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
    });
  };

  if (!data) {
    return (
      <div className="error-container-center qr-preview-no-data" style={{ width: size, height: size }}>
        No QR data
      </div>
    );
  }

  return <canvas ref={canvasRef} className="canvas-rounded" />;
});

QRCodePreview.displayName = 'QRCodePreview';

const TheaterGenerateQR = () => {
  
  const navigate = useNavigate();
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError, showSuccess, alert } = useModal();


  // PERFORMANCE MONITORING
  usePerformanceMonitoring('TheaterGenerateQR');

  const abortControllerRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    qrType: '',
    name: '',
    seatStart: '',
    seatEnd: '',
    selectedSeats: [],
    logoType: '',
    logoUrl: '',
    seatClass: '',
    orientation: 'portrait' // Default to portrait for styled preview
  });

  // UI state
  const [generating, setGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ current: 0, total: 0, message: '' });
  const [showSeatMap, setShowSeatMap] = useState(false);
  const [allAvailableSeats, setAllAvailableSeats] = useState([]);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [defaultLogoUrl, setDefaultLogoUrl] = useState('');
  const [theaterLogoUrl, setTheaterLogoUrl] = useState('');
  const [theaterName, setTheaterName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // Force initial render after a short delay to ensure hooks are ready
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading && !theaterId) {
        console.warn('TheaterGenerateQR - No theaterId, setting error state');
        setHasError(true);
        setIsLoading(false);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // QR Names state
  const [qrNames, setQrNames] = useState([]);
  const [qrNamesLoading, setQrNamesLoading] = useState(false);

  // QR Code Preview State
  const [qrPreviewUrl, setQrPreviewUrl] = useState(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [portraitImageLoaded, setPortraitImageLoaded] = useState(false);
  const [landscapeImageLoaded, setLandscapeImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const qrCanvasRef = useRef(null);
  const portraitImageRef = useRef(null);
  const landscapeImageRef = useRef(null);
  const generationTimeoutRef = useRef(null);
  const preloadedImagesRef = useRef(new Map());
  const imageLoadingTimeoutRef = useRef(null);

  // Image alternatives list
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

  // Helper function to load logo image with fallback strategies
  const loadLogoImage = useCallback(async (logoUrl) => {
    return new Promise((resolve, reject) => {
      const tryBlobMethod = async () => {
        try {
          const token = localStorage.getItem('token') || localStorage.getItem('authToken');
          const response = await fetch(logoUrl, {
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
            resolve(blobImg);
          };
          blobImg.onerror = () => {
            reject(new Error('Blob image load failed'));
          };
          blobImg.src = blobUrl;
        } catch (fetchError) {
          tryDirectMethod();
        }
      };

      const tryDirectMethod = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('All logo loading methods failed'));
        img.src = logoUrl;
      };

      tryBlobMethod();
    });
  }, []);

  // Preload images on component mount
  useEffect(() => {
    const preloadImages = async () => {
      const imagePromises = imageAlternatives.map((src) => {
        return new Promise((resolve) => {
          if (preloadedImagesRef.current.has(src)) {
            resolve(true);
            return;
          }
          const img = new Image();
          img.onload = () => {
            preloadedImagesRef.current.set(src, img);
            resolve(true);
          };
          img.onerror = () => resolve(false);
          img.src = src;
        });
      });
      await Promise.allSettled(imagePromises);
    };
    preloadImages();
  }, []);

  // Reset image state when orientation changes
  useEffect(() => {
    setImageError(false);
    setCurrentImageIndex(0);
    setQrPreviewUrl(null);
  }, [formData.orientation]);

  // Generate QR code preview
  useEffect(() => {
    let isMounted = true;
    let rafId = null;

    if (generationTimeoutRef.current) {
      clearTimeout(generationTimeoutRef.current);
      generationTimeoutRef.current = null;
    }

    const generateQRPreview = async () => {
      if (isMounted) {
        setQrGenerating(true);
      }

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
        const size = 150;

        if (canvas.width !== size || canvas.height !== size) {
          canvas.width = size;
          canvas.height = size;
        }

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let qrCodeData;
        if (theaterId && formData.name) {
          const baseUrl = config.api.baseUrl?.replace('/api', '') || window.location.origin;
          qrCodeData = formData.qrType === 'screen' && formData.selectedSeats.length > 0
            ? `${baseUrl}/menu/${theaterId}?qrName=${encodeURIComponent(formData.name)}&seat=${encodeURIComponent(formData.selectedSeats[0])}&type=screen`
            : `${baseUrl}/menu/${theaterId}?qrName=${encodeURIComponent(formData.name)}&type=single`;
        } else {
          const baseUrl = window.location.origin;
          qrCodeData = `${baseUrl}/menu/preview`;
        }

        await QRCode.toCanvas(canvas, qrCodeData, {
          width: size,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'H'
        });

        let logoToUse = '';
        if (formData.logoType === 'default') {
          logoToUse = defaultLogoUrl || formData.logoUrl || '';
        } else if (formData.logoType === 'theater') {
          logoToUse = formData.logoUrl || '';
        } else if (formData.logoUrl) {
          logoToUse = formData.logoUrl;
        }

        if (logoToUse && isMounted) {
          try {
            let fullLogoUrl = logoToUse;
            if (logoToUse && !logoToUse.startsWith('http') && !logoToUse.startsWith('data:') && !logoToUse.startsWith('blob:')) {
              const apiBase = config.api.baseUrl || '';
              fullLogoUrl = `${apiBase}${logoToUse.startsWith('/') ? '' : '/'}${logoToUse}`;
            }

            const logoImg = await loadLogoImage(fullLogoUrl);

            if (logoImg && isMounted) {
              // Calculate logo size (24% of QR code size - increased for better visibility)
              const logoSize = size * 0.24;
              const logoX = (size - logoSize) / 2;
              const logoY = (size - logoSize) / 2;
              const centerX = size / 2;
              const centerY = size / 2;

              // Draw white background circle for logo - reduced border
              const backgroundRadius = logoSize * 0.65;
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
            }
          } catch (err) {
            console.error('Error loading logo:', err);
          }
        }

        if (isMounted) {
          setQrPreviewUrl(canvas.toDataURL());
          setQrGenerating(false);
        }
      } catch (error) {
        console.error('Error generating QR preview:', error);
        if (isMounted) {
          setQrGenerating(false);
        }
      }
    };

    // ✅ FIX: Generate QR preview by default (like super admin page) - show QR code even when form is not fully filled
    if (formData.logoUrl) {
      generationTimeoutRef.current = setTimeout(() => {
        generateQRPreview();
        generationTimeoutRef.current = null;
      }, 50);
    }

    return () => {
      isMounted = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
      }
    };
  }, [formData.logoUrl, formData.name, formData.logoType, formData.qrType, formData.selectedSeats, formData.orientation, theaterId, defaultLogoUrl, loadLogoImage]);

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {
      showError('You do not have access to this theater');
      navigate(-1);
      return;
    }
    
    // Validate theaterId exists
    if (!theaterId) {
      showError('Theater ID is required');
      navigate('/dashboard');
      return;
    }
  }, [theaterId, userTheaterId, userType, navigate, showError]);

  // Load default logo with cache busting to ensure we get the latest configuration
  const loadDefaultLogo = useCallback(async () => {
    try {
      // Add timestamp to ensure fresh data
      const response = await unifiedFetch(`${config.api.baseUrl}/settings/general?_t=${Date.now()}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      }, {
        cacheKey: `settings_general_${Date.now()}`, // Unique cache key to force fresh fetch
        cacheTTL: 0 // No caching
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const serverData = data.data;
          let finalLogoUrl = '';

          // STRICT: ONLY use qrCodeUrl. Do NOT fallback to logoUrl.
          if (serverData.qrCodeUrl && serverData.qrCodeUrl.trim() !== '') {
            finalLogoUrl = serverData.qrCodeUrl;
          } else {
            console.warn('⚠️ [QR] QR Code Image (qrCodeUrl) is not set in Settings > Image Configuration. Default logo will be empty.');
          }

          setDefaultLogoUrl(finalLogoUrl);
        }
      }
    } catch (error) {
      console.error('❌ Error loading default logo:', error);
    }
  }, []);

  const loadTheaterLogo = useCallback(async () => {
    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      }, {
        cacheKey: `theater_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const theater = data.data;

          // Check multiple possible logo locations (matching Admin page)
          const logoUrl = theater.branding?.logoUrl
            || theater.branding?.logo
            || theater.documents?.logo
            || theater.media?.logo
            || theater.logo
            || theater.logoUrl
            || '';

          setTheaterLogoUrl(logoUrl);
          setTheaterName(theater.name || '');
        }
      }
    } catch (error) {
      console.error('❌ Error loading theater logo:', error);
    }
  }, [theaterId]);

  // Load QR Names
  const loadQRNames = useCallback(async (forceRefresh = false) => {
    if (!theaterId) {
      setQrNames([]);
      setQrNamesLoading(false);
      return;
    }
    
    try {
      setQrNamesLoading(true);
      
      let apiUrl = `${config.api.baseUrl}/qrcodenames?theaterId=${theaterId}&limit=100`;
      if (forceRefresh) {
        apiUrl += `&_t=${Date.now()}`;
      }

      const response = await unifiedFetch(apiUrl, {
        headers: {
          'Content-Type': 'application/json'
        }
      }, {
        cacheKey: forceRefresh ? null : `qrcodenames_${theaterId}`,
        cacheTTL: forceRefresh ? 0 : 300000 // 5 minutes
      });
      
      if (!response.ok) {
        const status = response.status;
        if (status >= 500) {
          // Server error - don't clear existing data
          return;
        }
        console.warn('⚠️ QR names API returned error:', status);
        setQrNames([]);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.data && data.data.qrCodeNames) {
        const allQRNames = Array.isArray(data.data.qrCodeNames) ? data.data.qrCodeNames : [];
        
        // Fetch already generated QR codes to filter out used QR names
        let existingQRNames = [];
        try {
          const token = localStorage.getItem('token') || localStorage.getItem('authToken');
          if (token) {
            let existingQRsUrl = `${config.api.baseUrl}/single-qrcodes/theater/${theaterId}`;
            if (forceRefresh) {
              existingQRsUrl += `?_t=${Date.now()}`;
            }
            
            const existingQRsResponse = await unifiedFetch(existingQRsUrl, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            }, {
              cacheKey: forceRefresh ? null : `existing_qrcodes_${theaterId}`,
              cacheTTL: forceRefresh ? 0 : 300000 // 5 minutes
            });
            
            if (existingQRsResponse.ok) {
              const existingQRsData = await existingQRsResponse.json();
              if (existingQRsData && existingQRsData.success && existingQRsData.data && existingQRsData.data.qrCodes) {
                // Extract unique QR names that already have generated QR codes
                existingQRNames = [...new Set(existingQRsData.data.qrCodes.map(qr => qr.name || qr.qrName).filter(Boolean))];
              }
            }
          }
        } catch (fetchError) {
          // Silently handle error - if we can't fetch existing QRs, just show all QR names
          console.warn('⚠️ Could not fetch existing QR codes:', fetchError);
          existingQRNames = [];
        }
        
        // Filter out QR names that already have generated QR codes
        const availableQRNames = allQRNames.filter(qrName => {
          const qrNameValue = qrName.qrName || qrName.name;
          const isAlreadyGenerated = existingQRNames.includes(qrNameValue);
          
          if (isAlreadyGenerated) {
          }
          
          return !isAlreadyGenerated;
        });
        
        
        setQrNames(availableQRNames);
        
        // Note: Validation of selected QR name is handled by the useEffect that watches qrNames
      } else {
        setQrNames([]);
      }
    } catch (error) {
      if (error.message && !error.message.includes('Failed to fetch') && !error.message.includes('NetworkError')) {
        console.error('Failed to load QR names:', error);
      }
      setQrNames([]);
    } finally {
      setQrNamesLoading(false);
    }
  }, [theaterId]);

  // Load default logo and theater data
  useEffect(() => {
    if (!theaterId) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    const loadData = async () => {
      try {
        await Promise.all([
          loadDefaultLogo().catch(err => {
            console.error('Error loading default logo:', err);
            return null; // Don't fail the whole load
          }),
          loadTheaterLogo().catch(err => {
            console.error('Error loading theater logo:', err);
            return null; // Don't fail the whole load
          }),
          loadQRNames(true).catch(err => {
            console.error('Error loading QR names:', err);
            return null; // Don't fail the whole load
          })
        ]);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading initial data:', error);
        setHasError(true);
        setIsLoading(false);
      }
    };

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('TheaterGenerateQR - Loading timeout, showing content anyway');
      setIsLoading(false);
    }, 10000); // 10 second timeout

    loadData();

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [theaterId, loadDefaultLogo, loadTheaterLogo, loadQRNames]);

  // Auto-set default logo when loaded (or changed)
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
    else if (formData.logoType === 'default' && formData.logoUrl !== defaultLogoUrl) {
      setFormData(prev => ({
        ...prev,
        logoUrl: defaultLogoUrl
      }));
    }
  }, [defaultLogoUrl, formData.logoType, formData.logoUrl]);

  // Auto-update logoUrl when theaterLogoUrl changes
  useEffect(() => {
    if (formData.logoType === 'theater' && formData.logoUrl !== theaterLogoUrl) {
      setFormData(prev => ({
        ...prev,
        logoUrl: theaterLogoUrl
      }));
    }
  }, [theaterLogoUrl, formData.logoType, formData.logoUrl]);

  // ✅ FIX: Validate selected QR name when QR names list updates (to catch if it was generated by another user)
  useEffect(() => {
    if (formData.name && qrNames.length > 0) {
      const isStillAvailable = qrNames.some(qr => (qr.qrName || qr.name) === formData.name);
      if (!isStillAvailable) {
        // Selected QR name is no longer available
        console.warn(`⚠️ Selected QR name "${formData.name}" is no longer available`);
        setFormData(prev => ({
          ...prev,
          name: '',
          seatClass: ''
        }));
      }
    }
  }, [qrNames, formData.name]);

  // Handle input changes
  const handleInputChange = useCallback((e) => {
    const { name, value, type } = e.target;
    
    // Handle QR name selection with automatic seat class update
    if (name === 'name') {
      const selectedQRName = qrNames.find(qr => (qr.qrName || qr.name) === value);
      
      setFormData(prev => ({
        ...prev,
        name: value,
        seatClass: selectedQRName ? (selectedQRName.seatClass || '') : ''
      }));
    } 
    else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseInt(value) || 0 : value
      }));
    }
  }, [qrNames]);

  // Handle logo type change
  const handleLogoTypeChange = useCallback((logoType) => {
    let logoUrl = '';
    
    if (logoType === 'default') {
      logoUrl = defaultLogoUrl || '';
    } else if (logoType === 'theater') {
      logoUrl = theaterLogoUrl || '';
    }
    
    setFormData(prev => ({
      ...prev,
      logoType,
      logoUrl
    }));
  }, [defaultLogoUrl, theaterLogoUrl]);

  const handleQRTypeChange = useCallback((qrType) => {
    setFormData(prev => ({
      ...prev,
      qrType,
      seatStart: '',
      seatEnd: '',
      selectedSeats: []
    }));
    setShowSeatMap(false);
    setAllAvailableSeats([]);
  }, []);

  const handleGenerateSeatMap = useCallback(() => {
    if (!formData.seatStart && !formData.seatEnd) {
      setFormData(prev => ({
        ...prev,
        seatStart: 'A1',
        seatEnd: 'A20'
      }));
      setTimeout(() => {
        handleGenerateSeatMap();
      }, 100);
      return;
    }

    const startMatch = formData.seatStart.match(/^([A-Z]+)(\d+)$/);
    const endMatch = formData.seatEnd.match(/^([A-Z]+)(\d+)$/);

    if (!startMatch || !endMatch) {
      showError('Invalid seat format. Use format like A1, B20, etc.');
      return;
    }

    const [, startRow, startNum] = startMatch;
    const [, endRow, endNum] = endMatch;
    const startRowCode = startRow.charCodeAt(0);
    const endRowCode = endRow.charCodeAt(0);
    const startNumber = parseInt(startNum);
    const endNumber = parseInt(endNum);

    if (startRowCode > endRowCode || (startRowCode === endRowCode && startNumber > endNumber)) {
      showError('Start seat must come before or equal to end seat');
      return;
    }

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

    setShowSeatMap(true);

    // Auto-select newly generated seats
    const currentRangeSeats = [];
    for (let rowCode = startRowCode; rowCode <= endRowCode; rowCode++) {
      const currentRow = String.fromCharCode(rowCode);
      let rowStart = rowCode === startRowCode ? startNumber : 1;
      let rowEnd = rowCode === endRowCode ? endNumber : endNumber;

      for (let i = rowStart; i <= rowEnd; i++) {
        currentRangeSeats.push(`${currentRow}${i}`);
      }
    }

    setFormData(prev => ({
      ...prev,
      selectedSeats: [...new Set([...prev.selectedSeats, ...currentRangeSeats])],
      seatStart: '', // Clear Seat Start ID after generating
      seatEnd: ''   // Clear Seat End ID after generating
    }));
  }, [formData.seatStart, formData.seatEnd, showError]);

  const toggleSeatSelection = useCallback((seatId) => {
    setFormData(prev => ({
      ...prev,
      selectedSeats: prev.selectedSeats.includes(seatId)
        ? prev.selectedSeats.filter(s => s !== seatId)
        : [...prev.selectedSeats, seatId]
    }));
  }, []);

  const validateForm = useCallback(() => {

    if (!formData.logoType) {
      showError('Please select a logo type');
      return false;
    }

    if (!formData.qrType) {
      showError('Please select QR code type');
      return false;
    }

    if (!formData.name) {
      showError('Please select QR code name');
      return false;
    }

    // ✅ FIX: Validate that selected QR name is still available (not already generated)
    const selectedQRName = qrNames.find(qr => (qr.qrName || qr.name) === formData.name);
    if (!selectedQRName) {
      showError('Selected QR code name is no longer available. Please refresh and select another.');
      // Reload QR names to get updated list
      loadQRNames(true);
      return false;
    }

    if (!formData.seatClass) {
      showError('Seat class is required');
      return false;
    }

    if (formData.qrType === 'screen' && (!formData.selectedSeats || formData.selectedSeats.length === 0)) {
      showError('Please select at least one seat for screen type QR codes');
      return false;
    }

    return true;
  }, [formData, qrNames, showError, loadQRNames]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();


    if (!validateForm()) {
      return;
    }


    try {
      setGenerating(true);

      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      // Prepare request body based on QR type
      let requestBody;

      // Ensure logoUrl is properly set based on logoType
      const finalLogoType = formData.logoType || 'default';
      const finalLogoUrl = formData.logoUrl || (finalLogoType === 'theater' ? theaterLogoUrl : defaultLogoUrl);


      // DEBUG: Alert to verify logo URL
      if (!finalLogoUrl) {
        alert('⚠️ WARNING: Logo URL is EMPTY!\n\n' +
          'logoType: ' + finalLogoType + '\n' +
          'defaultLogoUrl: ' + defaultLogoUrl + '\n' +
          'theaterLogoUrl: ' + theaterLogoUrl + '\n' +
          'formData.logoUrl: ' + formData.logoUrl);
      } else {
      }

      if (formData.qrType === 'single') {
        // For single QR codes
        requestBody = {
          theaterId: theaterId,
          qrType: 'single',
          qrName: formData.name,
          seatClass: formData.seatClass,
          logoUrl: finalLogoUrl,
          logoType: finalLogoType,
          orientation: formData.orientation || 'portrait' // Send orientation to backend
        };
      } else {
        // For screen QR codes
        requestBody = {
          theaterId: theaterId,
          qrType: 'screen',
          qrName: formData.name,
          seatClass: formData.seatClass,
          seats: formData.selectedSeats,
          logoUrl: finalLogoUrl,
          logoType: finalLogoType,
          orientation: formData.orientation || 'portrait' // Send orientation to backend
        };
      }

      const totalSeats = formData.qrType === 'single' ? 1 : (formData.selectedSeats?.length || 0);

      setGeneratingProgress({
        current: 0,
        total: totalSeats,
        message: 'Starting QR code generation...'
      });

      const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes`, {
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

      if (!response.ok) {
        throw new Error('Failed to generate QR codes');
      }

      const data = await response.json();

      if (data.success) {
        const count = data.count || (data.data && data.data.count) || totalSeats;
        const message = formData.qrType === 'single'
          ? 'Single QR code generated and saved successfully!'
          : `${count} screen QR codes generated successfully!`;

        setGeneratingProgress({
          current: totalSeats,
          total: totalSeats,
          message: 'QR codes generated successfully!'
        });

        setTimeout(() => {
          setGenerating(false);

          // Reload QR names
          setTimeout(() => {
            loadQRNames(true);
          }, 500);

          showSuccess(message);

          // Reset form
          setFormData({
            qrType: '',
            name: '',
            seatStart: '',
            seatEnd: '',
            selectedSeats: [],
            logoType: '',
            logoUrl: '',
            seatClass: ''
          });
          setShowSeatMap(false);
          setAllAvailableSeats([]);

          // Redirect to QR Management page after successful generation
          setTimeout(() => {
            navigate(`/theater-qr-management/${theaterId}`, { state: { reload: true } });
          }, 1500); // Wait 1.5 seconds to show success message
        }, 1000);
      } else {
        throw new Error(data.message || 'Failed to generate QR codes');
      }
    } catch (error) {

      showError(error.message || 'Failed to generate QR codes');
      setGenerating(false);
    }
  }, [formData, theaterId, validateForm, loadQRNames, showSuccess, showError, defaultLogoUrl, theaterLogoUrl, navigate, setGeneratingProgress]);

  // Debug logging
  useEffect(() => {
  }, [theaterId, isLoading, hasError]);

  // Show loading state
  if (isLoading) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Generate QR Codes" currentPage="generate-qr">
          <PageContainer title="Generate QR Codes" className="qr-generate-page">
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ 
                margin: '0 auto 20px', 
                width: '40px', 
                height: '40px', 
                border: '4px solid #f3f4f6', 
                borderTop: '4px solid #8b5cf6', 
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
              <p>Loading QR generation form...</p>
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  // Show error state
  if (hasError || !theaterId) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Generate QR Codes" currentPage="generate-qr">
          <PageContainer title="Generate QR Codes" className="qr-generate-page">
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
              <h2>Unable to Load Page</h2>
              <p style={{ color: '#6b7280', marginBottom: '20px' }}>
                {!theaterId ? 'Theater ID is missing.' : 'Failed to load QR generation form. Please try again.'}
              </p>
              <button
                onClick={() => navigate(-1)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Go Back
              </button>
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }


  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Generate QR Codes" currentPage="generate-qr">
        <PageContainer title="Generate QR Codes" className="qr-generate-page">
          <div className="qr-generate-container">
            {/* Left Column - Form */}
            <div className="qr-generate-form-wrapper">
              <form onSubmit={handleSubmit} className="qr-generate-form">
                <div className="form-section mui-form-section form-section-mui">
                  <h2>Basic Information</h2>
                  <div className="form-grid mui-form-grid">
                    {/* Logo Selection */}
                    <Box className="mui-form-group">
                      <FormControl fullWidth required error={false}>
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
                      <FormControl fullWidth required disabled={!formData.logoType} error={false}>
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
                        disabled={qrNamesLoading || qrNames.length === 0}
                        error={qrNames.length === 0 && !qrNamesLoading}
                      >
                        <InputLabel id="name-label">QR Code Name *</InputLabel>
                        <Select
                          id="name"
                          name="name"
                          labelId="name-label"
                          label="QR Code Name *"
                          value={(() => {
                            // ✅ FIX: Ensure value is always valid - check if it exists in qrNames (available QR names)
                            const validValue = formData.name && qrNames.some(qr => (qr.qrName || qr.name) === formData.name)
                              ? formData.name
                              : '';
                            return validValue;
                          })()}
                          onChange={handleInputChange}
                          displayEmpty
                        >
                          <MenuItem value="" disabled>
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
                                          onClick={() => toggleSeatSelection(seatId)}
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
                                      onClick={() => {
                                        const rowCode = row.charCodeAt(0);
                                        const newRanges = allAvailableSeats.filter((range, idx) => {
                                          return !(rowCode >= range.startRowCode && rowCode <= range.endRowCode);
                                        });
                                        setAllAvailableSeats(newRanges);
                                        if (newRanges.length === 0) {
                                          setShowSeatMap(false);
                                        }
                                      }}
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
                                    onClick={() => navigate(`/theater-qr-management/${theaterId}`)}
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
                    onClick={() => navigate(`/theater-qr-management/${theaterId}`)}
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
                    disabled={generating}
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
                <p style={{
                  textAlign: 'center',
                  fontSize: '13px',
                  color: '#6B7280',
                  marginBottom: '12px',
                  marginTop: '-8px',
                  fontStyle: 'italic'
                }}>
                  ℹ️ This preview shows how your QR code will look
                </p>

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
                  {/* Portrait Layout: Theater Name - QR Code - Text - Icons - Scan Text */}
                  {formData.orientation === 'portrait' ? (
                    <>
                      {/* 1. Theater Name at Top */}
                      {theaterName && (
                        <div className="theater-name-container-top">
                          <p className="theater-name-text-top">
                            {theaterName}
                          </p>
                        </div>
                      )}

                      {/* 2. QR Code in Center */}
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

                      {/* 3. "ORDER YOUR FOOD HERE" Text - Between QR and Icons */}
                      <div className="qr-order-text-container">
                        <p className="qr-order-text">ORDER YOUR FOOD HERE</p>
                      </div>

                      {/* 4. Food Icons Image */}
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

                      {/* 5. "Scan | Order | Pay" Text - Below Icons */}
                      <div className="qr-scan-text-container">
                        <p className="qr-scan-text">Scan | Order | Pay</p>
                      </div>

                      {/* 6. Screen/Seat Info at Bottom - For screen QR codes */}
                      {formData.qrType === 'screen' && formData.name && (
                        <div className="theater-name-container">
                          <p className="theater-name-text">
                            {formData.name}
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
                        {theaterName && (
                          <div className="theater-name-container theater-name-container-landscape">
                            <p className="theater-name-text theater-name-text-landscape">
                              {theaterName}
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
                    <div className="progress-message">{generatingProgress.message || 'Sending request to server...'}</div>
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
                    {formData.selectedSeats && formData.selectedSeats.length > 0 && (
                      <div className="seats-info">
                        <strong>Selected Seats:</strong> {formData.selectedSeats.join(', ')}
                      </div>
                    )}
                    <div className="theater-info">
                      <strong>Theater:</strong> YQ PAY NOW
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
        </PageContainer>
      </TheaterLayout >
    </ErrorBoundary >
  );
};

// Wrapper component to catch any initialization errors
const TheaterGenerateQRWrapper = () => {
  try {
    return <TheaterGenerateQR />;
  } catch (error) {
    console.error('TheaterGenerateQR - Fatal error:', error);
    return (
      <div style={{ padding: '40px', textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <h2 style={{ color: '#ef4444' }}>Error Loading Page</h2>
        <p style={{ color: '#6b7280', marginTop: '10px' }}>{error.message || 'An unexpected error occurred'}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Reload Page
        </button>
      </div>
    );
  }
};

export default TheaterGenerateQRWrapper;
