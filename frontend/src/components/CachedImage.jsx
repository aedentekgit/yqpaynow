import React, { useState, useEffect, useRef } from 'react';
import { fetchAndCacheImage, getCachedImage } from '../utils/globalImageCache'; // Use global cache with sync check

/**
 * CachedImage Component - INSTANT IMAGE LOADING (LIKE OFFLINE POS)
 * Loads images with automatic caching across ALL pages
 * Works for: Super Admin, Theater Admin, Kiosk, Customer pages, Offline POS
 * 
 * Features:
 * - INSTANT load from cache (checks synchronously first) ⚡
 * - 24-hour cache persistence (matches offlineStorage.js)
 * - Automatic base64 conversion
 * - CORS bypass via image proxy
 * - Lazy loading support
 * - Automatic retry on failure
 * - Responsive image sizing
 */
const CachedImage = ({
  src,
  alt = '',
  className = '',
  style = {},
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%23999" font-size="18"%3ELoading...%3C/text%3E%3C/svg%3E',
  lazy = true,
  onLoad = null,
  onError = null,
  maxRetries = 3,
  showLoadingSpinner = true,
  fallbackSrc = null
}) => {
  // 🚀 CHECK CACHE SYNCHRONOUSLY FIRST (INSTANT LOADING)
  const initialImage = src ? getCachedImage(src) : null;
  const [imageSrc, setImageSrc] = useState(initialImage || placeholder);
  const [isLoading, setIsLoading] = useState(!initialImage); // If cached, not loading!
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      return;
    }

    // If already cached, we're done! No need to fetch
    const cached = getCachedImage(src);
    if (cached) {
      setImageSrc(cached);
      setIsLoading(false);
      if (onLoad) onLoad();
      return; // ⚡ INSTANT RETURN - No async operations needed!
    }

    let isMounted = true;

    const loadImage = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        // Fetch and cache image (only if not cached)
        const cachedBase64 = await fetchAndCacheImage(src);

        if (isMounted && cachedBase64) {
          setImageSrc(cachedBase64);
          setIsLoading(false);
          if (onLoad) onLoad();
        } else if (isMounted) {
          throw new Error('Failed to load image');
        }
      } catch (error) {
        console.error('[CachedImage] Load error:', error);
        
        if (isMounted) {
          if (retryCount < maxRetries) {
            setRetryCount(prev => prev + 1);
            setTimeout(loadImage, 1000 * (retryCount + 1)); // Exponential backoff
          } else {
            setHasError(true);
            setIsLoading(false);
            if (fallbackSrc) {
              setImageSrc(fallbackSrc);
            }
            if (onError) onError(error);
          }
        }
      }
    };

    // Lazy loading with Intersection Observer
    if (lazy && 'IntersectionObserver' in window) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadImage();
              if (observerRef.current && imgRef.current) {
                observerRef.current.unobserve(imgRef.current);
              }
            }
          });
        },
        {
          rootMargin: '50px' // Start loading 50px before image enters viewport
        }
      );

      if (imgRef.current) {
        observerRef.current.observe(imgRef.current);
      }

      return () => {
        if (observerRef.current) {
          observerRef.current.disconnect();
        }
      };
    } else {
      // No lazy loading, load immediately
      loadImage();
    }

    return () => {
      isMounted = false;
    };
  }, [src, lazy, retryCount, maxRetries, fallbackSrc]);

  const containerStyle = {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    ...style
  };

  const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.3s ease-in-out, filter 0.3s ease-in-out',
    opacity: isLoading ? 0.5 : 1,
    filter: isLoading ? 'blur(5px)' : 'none'
  };

  const spinnerStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '40px',
    height: '40px',
    border: '4px solid rgba(0, 0, 0, 0.1)',
    borderTop: '4px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    zIndex: 1
  };

  const errorStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    color: '#999',
    fontSize: '14px',
    padding: '10px'
  };

  return (
    <div ref={imgRef} style={containerStyle} className={className}>
      <style>
        {`
          @keyframes spin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
          }
        `}
      </style>
      
      <img
        src={imageSrc}
        alt={alt}
        style={imageStyle}
        loading={lazy ? 'lazy' : 'eager'}
      />

      {isLoading && showLoadingSpinner && !hasError && (
        <div style={spinnerStyle} />
      )}

      {hasError && (
        <div style={errorStyle}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
          <div>Image failed to load</div>
          {retryCount >= maxRetries && (
            <button
              onClick={() => setRetryCount(0)}
              style={{
                marginTop: '10px',
                padding: '5px 15px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Background Image Component with Caching
 */
export const CachedBackgroundImage = ({
  src,
  children,
  className = '',
  style = {},
  ...props
}) => {
  const [backgroundImage, setBackgroundImage] = useState('none');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadBackground = async () => {
      try {
        const cachedBase64 = await fetchAndCacheImage(src);
        if (isMounted && cachedBase64) {
          setBackgroundImage(`url(${cachedBase64})`);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[CachedBackgroundImage] Load error:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadBackground();

    return () => {
      isMounted = false;
    };
  }, [src]);

  const containerStyle = {
    backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transition: 'opacity 0.3s ease-in-out',
    opacity: isLoading ? 0.5 : 1,
    ...style
  };

  return (
    <div className={className} style={containerStyle} {...props}>
      {children}
    </div>
  );
};

export default CachedImage;
