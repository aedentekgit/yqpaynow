/**
 * Image Caching Utilities
 * Caches images in localStorage as base64 for instant loading
 */

const IMAGE_CACHE_PREFIX = 'img_cache_';
const IMAGE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB limit
const COMPRESSION_QUALITY = 0.8; // 80% quality for cached images

/**
 * Generate cache key for image URL
 */
const getImageCacheKey = (url) => {
  return `${IMAGE_CACHE_PREFIX}${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
};

/**
 * Get current cache size
 */
export const getCacheSize = () => {
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX)) {
      const item = localStorage.getItem(key);
      totalSize += item ? item.length : 0;
    }
  }
  return totalSize;
};

/**
 * Clear old cache entries if storage is full
 */
const clearOldCache = () => {
  const entries = [];
  
  // Collect all cache entries with timestamps
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX)) {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          const data = JSON.parse(item);
          entries.push({ key, timestamp: data.timestamp || 0 });
        }
      } catch (e) {
        // Invalid entry, remove it
        localStorage.removeItem(key);
      }
    }
  }
  
  // Sort by timestamp (oldest first)
  entries.sort((a, b) => a.timestamp - b.timestamp);
  
  // Remove oldest 20% of entries
  const removeCount = Math.ceil(entries.length * 0.2);
  for (let i = 0; i < removeCount; i++) {
    localStorage.removeItem(entries[i].key);
  }
  
};

/**
 * Convert image to base64 with compression
 */
const imageToBase64 = (blob, maxWidth = 1200) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for compression
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Resize if too large
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression
        const base64 = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Get cached image
 */
export const getCachedImage = (url) => {
  if (!url) return null;
  
  try {
    const cacheKey = getImageCacheKey(url);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
    // Check if expired
    if (now - data.timestamp > IMAGE_CACHE_TTL) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return data.base64;
    
  } catch (error) {
    console.error('[ImageCache] Error getting cached image:', error);
    return null;
  }
};

/**
 * Cache image
 */
export const cacheImage = async (url, blob) => {
  if (!url || !blob) return false;
  
  try {
    // Check cache size
    if (getCacheSize() > MAX_CACHE_SIZE) {
      clearOldCache();
    }
    
    const base64 = await imageToBase64(blob);
    const cacheKey = getImageCacheKey(url);
    
    const data = {
      base64,
      timestamp: Date.now(),
      url
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    
    return true;
  } catch (error) {
    console.error('[ImageCache] Error caching image:', error);
    
    // If storage quota exceeded, clear some cache
    if (error.name === 'QuotaExceededError') {
      clearOldCache();
      // Try again
      try {
        const base64 = await imageToBase64(blob);
        const cacheKey = getImageCacheKey(url);
        const data = { base64, timestamp: Date.now(), url };
        localStorage.setItem(cacheKey, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('[ImageCache] Still failed after clearing cache:', e);
      }
    }
    
    return false;
  }
};

/**
 * Fetch and cache image
 */
export const fetchAndCacheImage = async (url, forceRefresh = false) => {
  if (!url) return null;
  
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedImage(url);
    if (cached) return cached;
  }
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // Cache in background
    cacheImage(url, blob);
    
    // Return base64 immediately
    const base64 = await imageToBase64(blob);
    return base64;
    
  } catch (error) {
    console.error('[ImageCache] Error fetching image:', error);
    return null;
  }
};

/**
 * Clear all image cache
 */
export const clearImageCache = () => {
  let count = 0;
  const keysToRemove = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    count++;
  });
  
  return count;
};

/**
 * Clear cache for specific URL pattern
 */
export const clearImageCachePattern = (pattern) => {
  let count = 0;
  const keysToRemove = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX) && key.includes(pattern)) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    count++;
  });
  
  return count;
};

/**
 * Get cache statistics
 */
export const getImageCacheStats = () => {
  let totalImages = 0;
  let totalSize = 0;
  let oldestTimestamp = Date.now();
  let newestTimestamp = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX)) {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          totalImages++;
          totalSize += item.length;
          
          const data = JSON.parse(item);
          if (data.timestamp < oldestTimestamp) oldestTimestamp = data.timestamp;
          if (data.timestamp > newestTimestamp) newestTimestamp = data.timestamp;
        }
      } catch (e) {
        // Skip invalid entries
      }
    }
  }
  
  return {
    totalImages,
    totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    oldestAge: totalImages > 0 ? Math.floor((Date.now() - oldestTimestamp) / 1000 / 60) : 0,
    newestAge: totalImages > 0 ? Math.floor((Date.now() - newestTimestamp) / 1000 / 60) : 0
  };
};

/**
 * Preload images in background
 */
export const preloadImages = async (urls) => {
  if (!urls || urls.length === 0) return;
  
  
  const promises = urls.map(url => 
    fetchAndCacheImage(url).catch(err => {
      console.error(`Failed to preload ${url}:`, err);
      return null;
    })
  );
  
  await Promise.all(promises);
};

export default {
  getCachedImage,
  cacheImage,
  fetchAndCacheImage,
  clearImageCache,
  clearImageCachePattern,
  getImageCacheStats,
  getCacheSize,
  preloadImages
};
