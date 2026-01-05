/**
 * Cache Utilities for YQPay
 * Provides fast, efficient caching for API responses across the application
 */

// Default cache TTL (Time To Live) - 2 minutes
const DEFAULT_CACHE_TTL = 2 * 60 * 1000;

/**
 * Get cached data from sessionStorage
 * @param {string} key - Cache key
 * @param {number} maxAge - Maximum age in milliseconds (default: 2 minutes)
 * @returns {Object|null} - Cached data or null if not found/expired
 */
export const getCachedData = (key, maxAge = DEFAULT_CACHE_TTL) => {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age < maxAge) {
      // Cache hit - return immediately (no console log for performance)
      return data;
    }

    // Cache expired - remove and return null
    sessionStorage.removeItem(key);
    return null;
  } catch (error) {
    // Silent fail - return null on error
    return null;
  }
};

/**
 * Set cached data in sessionStorage
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @returns {boolean} - Success status
 */
export const setCachedData = (key, data) => {
  try {
    const cacheEntry = {
      data,
      timestamp: Date.now()
    };
    sessionStorage.setItem(key, JSON.stringify(cacheEntry));
    return true;
  } catch (error) {
    // If quota exceeded, clear old entries
    if (error.name === 'QuotaExceededError') {
      clearOldCache();
      try {
        sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        return true;
      } catch (retryError) {
        // Silent fail
      }
    }
    return false;
  }
};

/**
 * Clear cache for specific key
 * @param {string} key - Cache key to clear
 */
export const clearCache = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error('Cache clear error:', error);
  }
};

/**
 * Clear all caches matching a pattern
 * @param {string} pattern - Pattern to match (e.g., 'theater_')
 */
export const clearCachePattern = (pattern) => {
  try {
    const keys = Object.keys(sessionStorage);
    let cleared = 0;
    
    keys.forEach(key => {
      if (key.includes(pattern)) {
        sessionStorage.removeItem(key);
        cleared++;
      }
    });
    
  } catch (error) {
    console.error('Cache pattern clear error:', error);
  }
};

/**
 * Clear old cache entries (older than 5 minutes)
 */
const clearOldCache = () => {
  try {
    const keys = Object.keys(sessionStorage);
    const maxAge = 5 * 60 * 1000; // 5 minutes
    let cleared = 0;

    keys.forEach(key => {
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const { timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp > maxAge) {
            sessionStorage.removeItem(key);
            cleared++;
          }
        }
      } catch (e) {
        // Invalid cache entry, remove it
        sessionStorage.removeItem(key);
        cleared++;
      }
    });

  } catch (error) {
    console.error('Old cache cleanup error:', error);
  }
};

/**
 * Generate cache key for API endpoints
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {string} - Generated cache key
 */
export const generateCacheKey = (endpoint, params = {}) => {
  const paramStr = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  return `api_${endpoint}_${paramStr}`;
};

/**
 * Fetch with cache - wrapper for fetch that handles caching
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {string} cacheKey - Cache key (optional, auto-generated if not provided)
 * @param {number} cacheTTL - Cache TTL in milliseconds (default: 2 minutes)
 * @returns {Promise} - Fetch promise
 */
export const fetchWithCache = async (url, options = {}, cacheKey = null, cacheTTL = DEFAULT_CACHE_TTL) => {
  // Generate cache key if not provided
  const key = cacheKey || `fetch_${url}`;
  
  // Try to get from cache first
  const cached = getCachedData(key, cacheTTL);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // Fetch fresh data
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  
  // Cache the response
  setCachedData(key, data);
  
  return { ...data, fromCache: false };
};

/**
 * Cache stats - get information about current cache
 * @returns {Object} - Cache statistics
 */
export const getCacheStats = () => {
  try {
    const keys = Object.keys(sessionStorage);
    const cacheEntries = keys.filter(key => {
      try {
        const item = sessionStorage.getItem(key);
        const parsed = JSON.parse(item);
        return parsed && parsed.timestamp;
      } catch {
        return false;
      }
    });

    const totalSize = keys.reduce((size, key) => {
      const item = sessionStorage.getItem(key);
      return size + (item ? item.length : 0);
    }, 0);

    return {
      totalEntries: cacheEntries.length,
      totalKeys: keys.length,
      estimatedSize: `${(totalSize / 1024).toFixed(2)} KB`,
      entries: cacheEntries
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return null;
  }
};

// Export default object with all utilities
export default {
  getCachedData,
  setCachedData,
  clearCache,
  clearCachePattern,
  generateCacheKey,
  fetchWithCache,
  getCacheStats,
  DEFAULT_CACHE_TTL
};
