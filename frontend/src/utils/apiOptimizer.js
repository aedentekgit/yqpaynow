/**
 * API Optimizer Utility
 * Provides request deduplication, batching, and intelligent caching
 * 🚀 OPTIMIZED: Now uses synchronous cache checks for instant loading
 */

import { getCachedData, setCachedData } from './cacheUtils'; // 🚀 SYNC IMPORT - No delay!

// Request deduplication: prevents duplicate simultaneous requests
const pendingRequests = new Map();

// Helper function to check if an error is an AbortError
const isAbortError = (err) => {
  if (!err) return false;
  
  // Check if it's a string with abort-related content
  if (typeof err === 'string') {
    return err.toLowerCase().includes('abort') || 
           err.includes('Component unmounted') || 
           err.includes('New request initiated') || 
           err.includes('Component cleanup');
  }
  
  // Check error name (most reliable)
  if (err.name === 'AbortError') return true;
  
  // Check constructor name
  if (err.constructor?.name === 'AbortError') return true;
  
  // Check if it's a DOMException with AbortError name
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  
  // Check error message for abort-related strings
  if (err.message && typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    return msg.includes('abort') || 
           err.message.includes('Component unmounted') || 
           err.message.includes('New request initiated') || 
           err.message.includes('Component cleanup');
  }
  
  // Check if error string representation contains abort
  const errString = String(err).toLowerCase();
  if (errString.includes('abort')) return true;
  
  return false;
};

// Request queue for batching
const requestQueue = [];
let queueTimer = null;
const BATCH_DELAY = 50; // Batch requests within 50ms

/**
 * Optimized fetch with deduplication and caching
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options
 * @param {string} cacheKey - Cache key (optional)
 * @param {number} cacheTTL - Cache TTL in ms (default: 2 minutes)
 * @returns {Promise} - Fetch promise
 */
export const optimizedFetch = async (url, options = {}, cacheKey = null, cacheTTL = 120000) => {
  if (!url) {
    console.error('❌ [optimizedFetch] No URL provided');
    return null;
  }

  // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - No async import delay!
  const key = cacheKey || `fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const cached = getCachedData(key, cacheTTL);
  if (cached) {
    return cached;
  }


  // Check if signal is already aborted - if so, throw immediately without creating request
  if (options.signal && options.signal.aborted) {
    const abortErr = new DOMException(
      options.signal.reason || 'Request aborted',
      'AbortError'
    );
    throw abortErr;
  }

  // Check for duplicate pending request
  const requestKey = `${url}_${JSON.stringify(options)}`;
  if (pendingRequests.has(requestKey)) {
    try {
      const result = await pendingRequests.get(requestKey);
      return result;
    } catch (err) {
      // If it's an AbortError, it's an intentional cancellation - don't warn or log
      // If signal is aborted, don't create a new request - just throw
      if (isAbortError(err)) {
        // If signal is aborted, don't retry
        if (options.signal && options.signal.aborted) {
          throw err;
        }
        // Signal not aborted yet, continue with new request (will be aborted if signal becomes aborted)
        // Silently continue - no warning needed for intentional cancellations
      } else {
        // Only log warning for non-abort errors
        console.warn(`⚠️ [optimizedFetch] Pending request failed, retrying:`, err);
      }
      // Continue with new request below (silently for abort errors)
    }
  }

  
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
        console.warn('⚠️ [apiOptimizer] Invalid token format, skipping Authorization header');
      }
    }
  }
  
  // Create fetch promise
  // Add flag to skip withCaching.js auto-cache (we handle caching ourselves)
  // Note: _skipAutoCache is a property, not a header, so it won't cause CORS issues
  const fetchPromise = fetch(url, {
    ...options,
    _skipAutoCache: true, // Skip withCaching.js auto-cache (property, not header)
    headers
  })
  .then(async (response) => {
    
    // ✅ SINGLE SESSION: Handle 401 errors (session invalidated)
    if (response.status === 401) {
      let errorData = {};
      try {
        const text = await response.clone().text();
        if (text) {
          errorData = JSON.parse(text);
        }
      } catch (e) {
        // Ignore parse errors
      }

      // Check if session was invalidated
      if (errorData.code === 'SESSION_INVALIDATED') {
        console.warn('⚠️ [optimizedFetch] Session invalidated - user logged in from another device/browser');
        
        // Clear all authentication data
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        localStorage.removeItem('theaterId');
        localStorage.removeItem('rolePermissions');
        localStorage.removeItem('yqpaynow_token');
        localStorage.removeItem('yqpaynow_user');
        localStorage.removeItem('token');
        
        // Trigger logout event for other tabs
        localStorage.setItem('logout-event', Date.now().toString());
        
        // Redirect to login page
        window.location.href = '/login';
        
        // Throw error with session invalidation flag
        const error = new Error(errorData.message || 'Session expired. Please login again.');
        error.code = 'SESSION_INVALIDATED';
        error.status = 401;
        throw error;
      }
      
      // Other 401 errors
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = 401;
      throw error;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  })
  .then((result) => {
    // Cache the result
    setCachedData(key, result);
    // Remove from pending requests
    pendingRequests.delete(requestKey);
    return result;
  })
  .catch((err) => {
    // Remove from pending requests on error
    pendingRequests.delete(requestKey);
    // Preserve AbortError for proper handling by calling code
    if (isAbortError(err)) {
      throw err;
    }
    // For other errors, check cache one more time as fallback
    const fallbackCache = getCachedData(key, cacheTTL * 2); // Use longer TTL for fallback
    if (fallbackCache) {
      return fallbackCache;
    }
    throw err;
  });

  // Store promise for deduplication
  pendingRequests.set(requestKey, fetchPromise);

  return fetchPromise;
};

/**
 * Batch multiple requests together
 * @param {Array} requests - Array of {url, options, cacheKey, cacheTTL}
 * @returns {Promise<Array>} - Array of results
 */
export const batchFetch = async (requests = []) => {
  if (requests.length === 0) return [];

  // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - No async import delay!
  // Check caches first
  const cachedResults = requests.map(req => {
    const key = req.cacheKey || `fetch_${req.url.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return getCachedData(key, req.cacheTTL || 120000);
  });

  // If all cached, return immediately
  if (cachedResults.every(r => r !== null)) {
    return cachedResults;
  }

  // Fetch missing data in parallel
  const fetchPromises = requests.map(async (req, index) => {
    // Return cached if available
    if (cachedResults[index]) {
      return cachedResults[index];
    }

    const key = req.cacheKey || `fetch_${req.url.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const requestKey = `${req.url}_${JSON.stringify(req.options || {})}`;
    
    // Check for duplicate pending request
    if (pendingRequests.has(requestKey)) {
      return pendingRequests.get(requestKey);
    }

    const fetchPromise = fetch(req.url, {
      ...req.options,
      headers: {
        'Content-Type': 'application/json',
        ...req.options?.headers
      }
    })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then((result) => {
      setCachedData(key, result);
      pendingRequests.delete(requestKey);
      return result;
    })
    .catch((err) => {
      pendingRequests.delete(requestKey);
      throw err;
    });

    pendingRequests.set(requestKey, fetchPromise);
    return fetchPromise;
  });

  return Promise.all(fetchPromises);
};

/**
 * Clear all pending requests (useful for cleanup)
 */
export const clearPendingRequests = () => {
  pendingRequests.clear();
};

/**
 * Get pending requests count (for debugging)
 */
export const getPendingRequestsCount = () => {
  return pendingRequests.size;
};

export default {
  optimizedFetch,
  batchFetch,
  clearPendingRequests,
  getPendingRequestsCount
};

