import React, { useState, useEffect, useCallback, useRef } from 'react';
import config from '../../config';
import { getImageSrc } from '../../utils/globalImageCache'; // 🚀 Import image cache
import { getCachedData, setCachedData } from '../../utils/cacheUtils'; // 🚀 Import cache utils
import './BannerCarousel.css'; // Extracted inline styles
import '@styles/customer/OffersPopup.css'; // Import offers popup styles for indicators

const BannerCarousel = ({ theaterId, autoScrollInterval = 4000 }) => {
  // 🚀 Check cache first for instant loading
  const cacheKey = `banner_carousel_${theaterId}`;
  const cachedBanners = getCachedData(cacheKey, 300000); // 5-minute cache
  
  const [banners, setBanners] = useState(cachedBanners || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // ⚡ FIX: Only show loading if we truly have no cached data
  // Check if cachedBanners exists and has items - if so, don't show loading
  const [loading, setLoading] = useState(
    !cachedBanners || 
    !Array.isArray(cachedBanners) || 
    cachedBanners.length === 0
  );
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const autoScrollTimerRef = useRef(null);
  const minSwipeDistance = 50;

  // Fetch banners from API
  const fetchBanners = useCallback(async () => {
    if (!theaterId) {
      setLoading(false);
      return;
    }

    // 🚀 Check cache first - if we have cached banners, use them immediately
    const cached = getCachedData(cacheKey, 300000);
    const hasValidCache = cached && Array.isArray(cached) && cached.length > 0;
    
    if (hasValidCache) {
      // ⚡ FIX: Set banners immediately and ensure loading is false
      // This prevents showing loading state when switching back to "All" category
      setBanners(cached);
      setLoading(false);
      // Continue to fetch fresh data in background (silent update)
    } else {
      // Only set loading if we truly have no cached data
      setLoading(true);
    }

    try {
      // Don't set loading here - it's already set above based on cache
      const url = `${config.api.baseUrl}/theater-banners/${theaterId}?page=1&limit=10`;

      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      // Check if response is ok before attempting to read body
      if (!response.ok) {
        setBanners([]);
        setLoading(false);
        return;
      }

      // Clone response IMMEDIATELY after receiving it to avoid "body stream already read" error
      // This ensures we can safely read the response even if it's consumed elsewhere
      let responseToRead = response;
      try {
        // Try to clone the response before reading
        // If cloning fails, use original response
        responseToRead = response.clone();
      } catch (cloneError) {
        // If clone fails (response already consumed), use original
        // This shouldn't happen, but handle gracefully
        responseToRead = response;
      }

      let data;
      try {
        data = await responseToRead.json();
      } catch (jsonError) {
        // If JSON parsing fails, try reading as text then parsing
        if (jsonError.message && jsonError.message.includes('already read')) {
          try {
            // If response body is already consumed, we can't read it again
            // This means something else consumed it before we could
            console.warn('💥 BannerCarousel: Response body was already consumed by another process');
            setBanners([]);
            setLoading(false);
            return;
          } catch (textError) {
            console.error('💥 BannerCarousel: Error reading response:', textError);
            setBanners([]);
            setLoading(false);
            return;
          }
        } else {
          // Other JSON parsing error (invalid JSON, etc.)
          console.error('💥 BannerCarousel: Error parsing JSON:', jsonError);
          setBanners([]);
          setLoading(false);
          return;
        }
      }

      if (data && data.success && data.data && data.data.banners) {
        // Filter only active banners and sort by sortOrder
        const activeBanners = data.data.banners
          .filter(banner => banner.isActive)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        // ⚡ FIX: Update banners - use functional update to avoid stale closure
        setBanners(prevBanners => {
          // Only update if banners actually changed (to avoid unnecessary re-renders)
          if (JSON.stringify(prevBanners) !== JSON.stringify(activeBanners)) {
            return activeBanners;
          }
          return prevBanners;
        });
        // 🚀 Cache banners for instant loading on return
        setCachedData(cacheKey, activeBanners);
      } else {
        // Only clear banners if we didn't have cached data
        if (!hasValidCache) {
          setBanners([]);
        }
        // Cache empty array to prevent repeated fetches
        setCachedData(cacheKey, []);
      }
    } catch (error) {
      console.error('💥 BannerCarousel: Error fetching banners:', error);
      // Only clear banners if we didn't have cached data
      if (!hasValidCache) {
        setBanners([]);
      }
    } finally {
      // ⚡ FIX: Only set loading to false if we were actually loading
      // If we had cached data, loading was already false
      if (!hasValidCache) {
        setLoading(false);
      }
    }
  }, [theaterId, cacheKey]);

  // Fetch banners on mount and when theaterId changes
  // ⚡ FIX: If we have valid cache, use it immediately and skip initial fetch
  // Only fetch in background after a delay to refresh data silently
  useEffect(() => {
    const cached = getCachedData(cacheKey, 300000);
    const hasValidCache = cached && Array.isArray(cached) && cached.length > 0;
    
    if (hasValidCache) {
      // We already have cached data set in initial state
      // Refresh in background after a short delay (silent update, no loading state)
      const refreshTimer = setTimeout(() => {
        fetchBanners();
      }, 1000); // Wait 1 second before refreshing in background
      
      return () => clearTimeout(refreshTimer);
    } else {
      // No cache - fetch immediately
      fetchBanners();
    }
  }, [theaterId, fetchBanners]); // Include fetchBanners but it's memoized

  // Auto-scroll functionality
  useEffect(() => {
    if (!isPaused && banners.length > 1) {
      autoScrollTimerRef.current = setInterval(() => {
        setCurrentIndex((prevIndex) =>
          prevIndex === banners.length - 1 ? 0 : prevIndex + 1
        );
      }, autoScrollInterval);

      return () => {
        if (autoScrollTimerRef.current) {
          clearInterval(autoScrollTimerRef.current);
        }
      };
    }
  }, [isPaused, banners.length, autoScrollInterval]);

  // Handle touch start
  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setIsPaused(true);
  };

  // Handle touch move
  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      setIsPaused(false);
      return;
    }

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      // Swipe left - next banner
      setCurrentIndex((prevIndex) =>
        prevIndex === banners.length - 1 ? 0 : prevIndex + 1
      );
    } else if (isRightSwipe) {
      // Swipe right - previous banner
      setCurrentIndex((prevIndex) =>
        prevIndex === 0 ? banners.length - 1 : prevIndex - 1
      );
    }

    setTimeout(() => setIsPaused(false), 300);
  };

  // Handle indicator dot click
  const handleDotClick = (index) => {
    setCurrentIndex(index);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 2000);
  };

  // Handle mouse enter/leave for desktop
  const handleMouseEnter = () => {
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  // ⚡ FIX: Only show skeleton if we're loading AND have no banners
  // If we have cached banners, show them immediately (don't show loading)
  // This ensures instant display when switching back to "All" category
  if (loading && (!banners || banners.length === 0)) {
    return (
      <div className="banner-carousel">
        <div className="banner-skeleton">
          <div className="skeleton-shimmer"></div>
        </div>
      </div>
    );
  }

  // ⚡ FIX: If we have banners (even if loading in background), show them
  // Don't hide the banner section if we have cached banners
  if (!banners || banners.length === 0) {
    // Only return null if we're not loading (meaning we confirmed no banners)
    if (!loading) {
      return null;
    }
    // If loading, show skeleton (already handled above)
    return (
      <div className="banner-carousel">
        <div className="banner-skeleton">
          <div className="skeleton-shimmer"></div>
        </div>
      </div>
    );
  }


  return (
    <div
      className="banner-carousel"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="banner-carousel__track"
        style={{
          transform: `translate3d(-${currentIndex * 100}%, 0, 0)`,
          transition: 'transform 300ms ease-out'
        }}
      >
        {banners.map((banner, index) => {
          // 🚀 Use cached image for instant loading
          const cachedImageUrl = getImageSrc(banner.imageUrl);

          return (
            <div
              key={banner._id}
              className="banner-carousel__slide"
            >
              <img
                src={cachedImageUrl}
                alt={`Banner ${index + 1}`}
                className="banner-carousel__image"
                loading="eager"
                decoding="async"
                fetchPriority={index === 0 ? 'high' : 'low'}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Indicator dots - using offers-popup-indicators style */}
      {banners.length > 1 && (
        <div className="offers-popup-indicators">
          {banners.map((_, index) => (
            <button
              key={index}
              className={`offers-popup-dot ${index === currentIndex ? 'offers-popup-dot--active' : ''}`}
              onClick={() => handleDotClick(index)}
              aria-label={`Go to banner ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BannerCarousel;
