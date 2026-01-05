/**
 * 🚀 FAST FETCH - Global Optimized Fetch Utility
 * Provides instant cache checks and optimized API calls for ALL pages
 * 
 * This utility ensures:
 * - Instant cache loading (< 50ms)
 * - Request deduplication
 * - Automatic timeout handling
 * - Background refresh pattern
 */

import { getCachedData, setCachedData } from './cacheUtils';

// Request deduplication map
const pendingRequests = new Map();

// Default timeout: 10 seconds
const DEFAULT_TIMEOUT = 10000;

/**
 * Fast fetch with instant cache check
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {string} cacheKey - Cache key (optional, auto-generated if not provided)
 * @param {number} cacheTTL - Cache TTL in milliseconds (default: 2 minutes)
 * @param {number} timeout - Request timeout in milliseconds (default: 10 seconds)
 * @returns {Promise} - Fetch promise with instant cache support
 */
export const fastFetch = async (url, options = {}, cacheKey = null, cacheTTL = 120000, timeout = DEFAULT_TIMEOUT) => {
  if (!url) {
    throw new Error('URL is required');
  }

  // Generate cache key if not provided
  const key = cacheKey || `fast_fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - MUST happen before any async operations
  try {
    const cached = getCachedData(key, cacheTTL);
    if (cached) {
      // Return cached data immediately as a Response-like object
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => cached,
        text: async () => JSON.stringify(cached),
        clone: function() { return this; },
        fromCache: true
      };
    }
  } catch (e) {
    // Cache check failed, continue with API call
  }

  // Check for duplicate pending request
  const requestKey = `${url}_${JSON.stringify(options)}`;
  if (pendingRequests.has(requestKey)) {
    try {
      const result = await pendingRequests.get(requestKey);
      return result;
    } catch (err) {
      // If pending request failed, continue with new request
    }
  }

  // Create abort controller for timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeout);

  // ✅ FIX: Ensure Authorization header is included for API requests
  let headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  // Add token if missing and this is an API request
  if (url.includes('/api/') && !headers['Authorization'] && !headers['authorization']) {
    // Use centralized token getter for consistency
    let token = localStorage.getItem('authToken');
    // Fallback: Check other possible keys
    if (!token) {
      token = localStorage.getItem('yqpaynow_token') || localStorage.getItem('token');
      // If found in fallback, migrate to primary key
      if (token) {
        localStorage.setItem('authToken', token);
      }
    }
    if (token) {
      // ✅ FIX: Clean token to remove any formatting issues
      const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
      
      // Validate token format (should have 3 parts separated by dots)
      if (cleanToken && cleanToken.split('.').length === 3) {
        headers['Authorization'] = `Bearer ${cleanToken}`;
      } else {
        console.warn('⚠️ [fastFetch] Invalid token format, skipping Authorization header');
      }
    }
  }
  
  // Create fetch promise
  const fetchPromise = fetch(url, {
    ...options,
    signal: abortController.signal,
    headers
  })
  .then(async (response) => {
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Cache successful responses (only GET requests)
    if ((options.method || 'GET').toUpperCase() === 'GET') {
      setCachedData(key, data);
    }
    
    // Remove from pending requests
    pendingRequests.delete(requestKey);
    
    return {
      ...response,
      json: async () => data,
      fromCache: false
    };
  })
  .catch((err) => {
    clearTimeout(timeoutId);
    // Remove from pending requests on error
    pendingRequests.delete(requestKey);
    throw err;
  });

  // Store promise for deduplication
  pendingRequests.set(requestKey, fetchPromise);

  return fetchPromise;
};

/**
 * Fast fetch with instant cache check and state updates
 * This is the recommended way to use fastFetch in React components
 * 
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {string} cacheKey - Cache key
 * @param {number} cacheTTL - Cache TTL
 * @param {function} setData - State setter for data
 * @param {function} setLoading - State setter for loading
 * @param {function} setError - State setter for error
 * @returns {Promise} - Fetch promise
 */
export const fastFetchWithState = async (
  url,
  options = {},
  cacheKey = null,
  cacheTTL = 120000,
  setData = null,
  setLoading = null,
  setError = null
) => {
  const key = cacheKey || `fast_fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // 🚀 INSTANT SYNCHRONOUS CACHE CHECK
  try {
    const cached = getCachedData(key, cacheTTL);
    if (cached) {
      // Load instantly from cache
      if (setData) setData(cached);
      if (setLoading) setLoading(false);
      if (setError) setError(null);
      
      // Fetch fresh data in background (non-blocking)
      requestAnimationFrame(() => {
        fastFetch(url, options, key, cacheTTL)
          .then(async (response) => {
            const data = await response.json();
            if (setData && !response.fromCache) {
              setData(data);
            }
          })
          .catch(() => {
            // Silent fail - keep cached data
          });
      });
      
      return { ok: true, json: async () => cached, fromCache: true };
    }
  } catch (e) {
    // Cache check failed, continue with API call
  }

  // No cache - fetch from API
  if (setLoading) setLoading(true);
  if (setError) setError(null);

  try {
    const response = await fastFetch(url, options, key, cacheTTL);
    const data = await response.json();
    
    if (setData) setData(data);
    if (setLoading) setLoading(false);
    if (setError) setError(null);
    
    return response;
  } catch (error) {
    if (setLoading) setLoading(false);
    if (setError) setError(error.message || 'Failed to fetch data');
    throw error;
  }
};

/**
 * Clear pending requests
 */
export const clearPendingRequests = () => {
  pendingRequests.clear();
};

/**
 * Get pending requests count
 */
export const getPendingRequestsCount = () => {
  return pendingRequests.size;
};

export default fastFetch;

