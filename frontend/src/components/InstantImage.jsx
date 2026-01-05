/**
 * InstantImage Component - ZERO-DELAY IMAGE LOADING with GCS Support
 * Works EXACTLY like Offline POS - checks cache synchronously
 * 
 * Usage:
 * <InstantImage src={imageUrl} alt="Product" className="product-img" />
 * <InstantImage src={imageUrl} alt="Product" lazy={true} /> // Lazy loading
 * 
 * Features:
 * - INSTANT loading from cache (no async delays)
 * - Synchronous cache check
 * - Optional lazy loading with Intersection Observer
 * - Auto-fetches GCS images through proxy if not cached
 * - Falls back to proxy URL for GCS images
 * - Retry on error
 * - Loading spinner support
 */

import { useState, useEffect, useRef } from 'react';
import { getCachedImage, fetchAndCacheImage } from '../utils/globalImageCache';
import config from '../config';
import '../styles/InstantImage.css'; // Extracted inline styles

const InstantImage = ({ 
  src, 
  alt = '', 
  className = '', 
  style = {},
  onError = null,
  loading = 'eager',
  decoding = 'async',
  lazy = false, // Optional lazy loading
  showLoadingSpinner = false, // Optional loading spinner
  maxRetries = 3, // Retry on error
  fallbackSrc = null, // Fallback image
  fetchPriority = 'high' // Image fetch priority
}) => {
  const [imageSrc, setImageSrc] = useState(() => {
    // 🚀 SYNCHRONOUS cache check - INSTANT!
    if (!src) return null;
    
    // 🚀 FIX: If blob URL (from file upload preview), use directly
    if (src.startsWith('blob:')) return src;
    
    const cachedBase64 = getCachedImage(src);
    if (cachedBase64) return cachedBase64;
    
    // 🚀 GCS FIX: If GCS URL and not cached, return null (will be handled in useEffect with POST)
    // Using POST instead of GET to avoid 431 header size errors with long URLs
    if (src.includes('storage.googleapis.com') || src.includes('googleapis.com')) {
      return null; // Will be set in useEffect with proper POST request
    }
    
    return src; // Use original URL
  });
  
  const hasFetchedRef = useRef(new Map()); // Track fetched URLs per src
  const imgRef = useRef(null);
  const previousSrcRef = useRef(src); // Track previous src to detect changes
  const observerRef = useRef(null); // Intersection Observer for lazy loading
  const [isInView, setIsInView] = useState(!lazy); // Start visible if not lazy
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  // Lazy loading with Intersection Observer
  useEffect(() => {
    if (!lazy || !src || !imgRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            if (observerRef.current && imgRef.current) {
              observerRef.current.unobserve(imgRef.current);
            }
          }
        });
      },
      { rootMargin: '50px' } // Start loading 50px before entering viewport
    );

    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [lazy, src]);

  // ✅ FIX: Update imageSrc when src prop changes - with proper reset
  useEffect(() => {
    // Don't load if lazy loading and not in view
    if (lazy && !isInView) return;

    // ✅ CRITICAL: Reset if src changed completely (different URL)
    const srcChanged = previousSrcRef.current !== src;
    previousSrcRef.current = src;
    
    if (!src) {
      setImageSrc(null);
      hasFetchedRef.current.clear(); // Clear fetch tracking when src is null
      setIsLoading(false);
      setHasError(false);
      return;
    }
    
    // 🚀 FIX: If blob URL (from file upload preview), use directly - no caching
    if (src.startsWith('blob:')) {
      setImageSrc(src);
      setIsLoading(false);
      setHasError(false);
      return;
    }
    
    // ✅ CRITICAL: If src changed, reset fetch tracking for this new URL
    if (srcChanged && hasFetchedRef.current.has(src)) {
      // Keep the fetch tracking, but ensure we re-check cache
    }
    
    // 🚀 SYNCHRONOUS cache check - INSTANT!
    const cachedBase64 = getCachedImage(src);
    if (cachedBase64) {
      setImageSrc(cachedBase64);
      setIsLoading(false);
      setHasError(false);
      return;
    }
    
    // ✅ FIX: Only set loading state if spinner is enabled (prevents dimmed images on first load)
    // If not cached, show loading state only if spinner is requested
    if (showLoadingSpinner) {
      setIsLoading(true);
    } else {
      // Don't set loading state if spinner is disabled - images will appear normally
      setIsLoading(false);
    }
    
    // 🚀 GCS FIX: If GCS URL and not cached, ALWAYS use POST proxy (avoids QUIC errors and 431 errors)
    if (src.includes('storage.googleapis.com') || src.includes('googleapis.com')) {
      // Use POST to avoid header size limits with long URLs and QUIC protocol errors
      if (!hasFetchedRef.current.has(src)) {
        hasFetchedRef.current.set(src, true);
        // ✅ FIX: Only set loading state if spinner is enabled
        if (showLoadingSpinner) {
          setIsLoading(true);
        } else {
          setIsLoading(false);
        }
        
        // First, try to get from cache via fetchAndCacheImage (uses POST internally)
        fetchAndCacheImage(src).then((base64) => {
          if (base64 && base64 !== src && base64.startsWith('data:')) {
            setImageSrc(base64); // Update to cached base64
            setIsLoading(false);
            setHasError(false);
          } else {
            // If fetchAndCacheImage doesn't return base64, use proxy URL via POST
            // This prevents QUIC protocol errors and header size issues
            // baseUrl already includes /api, so just append /proxy-image
            const proxyUrl = `${config.api.baseUrl}/proxy-image`;
            fetch(proxyUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
              },
              body: JSON.stringify({ url: src })
            })
            .then(response => {
              if (!response.ok) {
                throw new Error(`Proxy request failed: ${response.status}`);
              }
              return response.blob();
            })
            .then(blob => {
              const blobUrl = URL.createObjectURL(blob);
              setImageSrc(blobUrl);
              setIsLoading(false);
              setHasError(false);
            })
            .catch((error) => {
              // Only log non-404 errors (404 means backend/proxy not available, which is expected in some cases)
              if (error.message && !error.message.includes('404')) {
                console.warn('Image proxy fetch failed, will retry:', error);
              }
              setIsLoading(false);
              
              // If proxy fails (404 or other error), try using the original URL directly
              if (retryCount >= maxRetries || (error.message && error.message.includes('404'))) {
                // Fallback: Try using the original GCS URL directly
                if (src && (src.includes('storage.googleapis.com') || src.includes('googleapis.com'))) {
                  setImageSrc(src); // Use original URL directly
                  setHasError(false);
                } else if (fallbackSrc) {
                  setImageSrc(fallbackSrc);
                  setHasError(false);
                } else {
                  setHasError(true);
                }
              } else if (retryCount < maxRetries) {
                setRetryCount(prev => prev + 1);
                setTimeout(() => {
                  hasFetchedRef.current.delete(src);
                }, 1000 * (retryCount + 1));
              }
            });
          }
        }).catch((error) => {
          console.warn('Image cache fetch failed, using proxy:', error);
          // ✅ FIX: Only set loading state if spinner is enabled
          if (showLoadingSpinner) {
            setIsLoading(true);
          } else {
            setIsLoading(false);
          }
          // Fallback to proxy if cache fetch fails
          // baseUrl already includes /api, so just append /proxy-image
          const proxyUrl = `${config.api.baseUrl}/proxy-image`;
          fetch(proxyUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
            },
            body: JSON.stringify({ url: src })
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Proxy request failed: ${response.status}`);
            }
            return response.blob();
          })
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            setImageSrc(blobUrl);
            setIsLoading(false);
            setHasError(false);
          })
          .catch((proxyError) => {
            // Only log non-404 errors (404 means backend/proxy not available)
            if (proxyError.message && !proxyError.message.includes('404')) {
              console.error('Image proxy fetch failed:', proxyError);
            }
            setIsLoading(false);
            
            // If proxy fails, try using the original URL directly
            if (retryCount >= maxRetries || (proxyError.message && proxyError.message.includes('404'))) {
              // Fallback: Try using the original GCS URL directly
              if (src && (src.includes('storage.googleapis.com') || src.includes('googleapis.com'))) {
                setImageSrc(src); // Use original URL directly
                setHasError(false);
              } else if (fallbackSrc) {
                setImageSrc(fallbackSrc);
                setHasError(false);
              } else {
                setHasError(true);
              }
            } else if (retryCount < maxRetries) {
              setRetryCount(prev => prev + 1);
              setTimeout(() => {
                hasFetchedRef.current.delete(src);
              }, 1000 * (retryCount + 1));
            }
          });
        });
      } else {
        // Already fetching, show loading state only if spinner is enabled
        if (showLoadingSpinner) {
          setIsLoading(true);
        } else {
          setIsLoading(false);
        }
      }
      return; // Don't set imageSrc to GCS URL directly - always use proxy
    }
    
    // For non-GCS URLs, use directly
    setImageSrc(src);
    setIsLoading(false);
  }, [src, lazy, isInView, retryCount, maxRetries, fallbackSrc, showLoadingSpinner]);
  
  const handleError = (e) => {
    // Retry logic
    if (retryCount < maxRetries && src) {
      setRetryCount(prev => prev + 1);
      hasFetchedRef.current.delete(src);
      // Retry after delay
      setTimeout(() => {
        const cachedBase64 = getCachedImage(src);
        if (cachedBase64) {
          setImageSrc(cachedBase64);
          setIsLoading(false);
          return;
        }
        // Try proxy if GCS URL (use POST via blob URL)
        if (src.includes('storage.googleapis.com') || src.includes('googleapis.com')) {
          // baseUrl already includes /api, so just append /proxy-image
          const proxyUrl = `${config.api.baseUrl}/proxy-image`;
          fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: src })
          })
          .then(response => response.blob())
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            e.target.src = blobUrl;
          })
          .catch(() => {
            // If POST fails, try fallback
            if (fallbackSrc) {
              e.target.src = fallbackSrc;
            }
          });
          return;
        }
      }, 1000 * retryCount);
      return;
    }

    // 🚀 GCS FIX: Try proxy if direct URL fails (use POST via blob URL)
    if (src && !imageSrc.includes('blob:') && !imageSrc.startsWith('data:') && 
        (src.includes('storage.googleapis.com') || src.includes('googleapis.com'))) {
      // baseUrl already includes /api, so just append /proxy-image
      const proxyUrl = `${config.api.baseUrl}/proxy-image`;
      fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: src })
      })
      .then(response => response.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        e.target.src = blobUrl;
      })
      .catch((error) => {
        // If POST fails, try using the original URL directly
        if (src && (src.includes('storage.googleapis.com') || src.includes('googleapis.com'))) {
          e.target.src = src; // Use original URL directly
        } else if (fallbackSrc) {
          e.target.src = fallbackSrc;
        }
      });
      return; // Retry with proxy
    }
    
    // Use fallback if provided
    if (fallbackSrc) {
      setImageSrc(fallbackSrc);
      setHasError(false);
      return;
    }
    
    setHasError(true);
    setIsLoading(false);
    
    if (onError) {
      onError(e);
    } else {
      // Default fallback
      e.target.style.display = 'none';
      if (e.target.nextSibling) {
        e.target.nextSibling.style.display = 'flex';
      }
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };
  
  // Don't render if lazy loading and not in view
  if (lazy && !isInView) {
    return (
      <div 
        ref={imgRef} 
        className={`instant-image-placeholder instant-image-placeholder-base ${className}`}
        style={style}
      >
        {showLoadingSpinner && (
          <div className="instant-image-spinner" />
        )}
      </div>
    );
  }
  
  return (
    <div className="instant-image-container">
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`instant-image-base ${className}`}
        style={{
          opacity: (isLoading && showLoadingSpinner) ? 0.5 : 1, // ✅ FIX: Only reduce opacity if spinner is shown
          ...style
        }}
        loading={lazy ? 'lazy' : loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onError={handleError}
        onLoad={handleLoad}
      />
      {isLoading && showLoadingSpinner && !hasError && (
        <div className="instant-image-spinner-overlay" />
      )}
      {hasError && !fallbackSrc && (
        <div className="instant-image-error-container">
          <div className="instant-image-error-icon">⚠️</div>
          <div>Image failed to load</div>
        </div>
      )}
      <style>{`
        @keyframes spin {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default InstantImage;
