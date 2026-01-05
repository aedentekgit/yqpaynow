import { getCachedData, setCachedData } from './cacheUtils';
import { log } from './logger';

// ============================================================================
// REQUEST DEDUPLICATION
// ============================================================================

class RequestDeduplicator {
  constructor() {
    this.pending = new Map();
  }

  async deduplicate(key, fetchFn) {
    // If request is already pending, return the existing promise
    if (this.pending.has(key)) {
      log.debug(`[unifiedFetch] Deduplicating request: ${key}`);
      return this.pending.get(key);
    }

    // Create new request
    const promise = fetchFn()
      .finally(() => {
        // Remove from pending after completion
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }

  clear() {
    this.pending.clear();
  }
}

const requestDeduplicator = new RequestDeduplicator();

// ============================================================================
// UNIFIED FETCH FUNCTION
// ============================================================================

/**
 * Unified fetch with all optimization features
 * 
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options (headers, method, body, etc.)
 * @param {Object} config - Configuration object
 * @param {string} config.cacheKey - Cache key (optional, auto-generated if not provided)
 * @param {number} config.cacheTTL - Cache TTL in milliseconds (default: 120000 = 2 minutes)
 * @param {number} config.timeout - Request timeout in milliseconds (default: 30000 = 30 seconds)
 * @param {boolean} config.forceRefresh - Force refresh, bypass cache (default: false)
 * @param {boolean} config.retry - Enable automatic retry on failure (default: true)
 * @param {number} config.maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise} - Fetch promise with instant cache support
 */
export const unifiedFetch = async (
  url,
  options = {},
  config = {}
) => {
  if (!url) {
    log.error('[unifiedFetch] No URL provided');
    throw new Error('URL is required');
  }

  const {
    cacheKey = null,
    cacheTTL = 120000,
    timeout = 30000,
    forceRefresh = false,
    retry = true,
    maxRetries = 3
  } = config;

  // Generate cache key if not provided
  const key = cacheKey || `fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - MUST happen before any async operations
  if (!forceRefresh) {
    try {
      const cached = getCachedData(key, cacheTTL);
      if (cached) {
        log.debug(`[unifiedFetch] Cache hit: ${key}`);
        // Return cached data immediately
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => cached,
          text: async () => JSON.stringify(cached),
          clone: function () { return this; },
          fromCache: true
        };
      }
    } catch (e) {
      // Cache check failed, continue with API call
      log.debug(`[unifiedFetch] Cache check failed, continuing with API call`);
    }
  }

  // Check for duplicate pending request
  const requestKey = `${url}_${JSON.stringify(options)}`;

  if (requestDeduplicator.pending.has(requestKey)) {
    log.debug(`[unifiedFetch] Deduplicating request: ${requestKey}`);
    try {
      const result = await requestDeduplicator.pending.get(requestKey);
      return result;
    } catch (err) {
      // If pending request failed, continue with new request
      log.warn(`[unifiedFetch] Pending request failed, retrying:`, err);
    }
  }

  // ✅ AUTOMATIC TOKEN MANAGEMENT
  // For FormData, don't set Content-Type - let browser set it with boundary
  const isFormData = options.body instanceof FormData;
  let headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }), // Only set Content-Type if not FormData
    ...options.headers
  };

  // Add token if missing and this is an API request
  if (url.includes('/api/') && !headers['Authorization'] && !headers['authorization']) {
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
      // Clean token to remove any formatting issues
      const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');

      // Validate token format (should have 3 parts separated by dots)
      if (cleanToken && cleanToken.split('.').length === 3) {
        headers['Authorization'] = `Bearer ${cleanToken}`;
      } else {
        log.warn('[unifiedFetch] Invalid token format, skipping Authorization header');
      }
    }
  }

  // Create abort controller for timeout
  const abortController = new AbortController();
  const timeoutId = timeout > 0 ? setTimeout(() => {
    abortController.abort();
  }, timeout) : null;

  // Retry logic
  let lastError;
  for (let attempt = 0; attempt <= (retry ? maxRetries : 0); attempt++) {
    try {
      // Create fetch promise with deduplication
      const fetchPromise = requestDeduplicator.deduplicate(requestKey, async () => {
        const res = await fetch(url, {
          ...options,
          signal: abortController.signal,
          headers,
          _skipAutoCache: true // Skip withCaching.js auto-cache (we handle caching ourselves)
        });

        // ✅ FIX: Read body immediately to allow safe deduplication
        const textData = await res.text();

        // ✅ SINGLE SESSION: Handle 401 errors (session invalidated)
        if (res.status === 401) {
          let errorData = {};
          try {
            if (textData) {
              errorData = JSON.parse(textData);
            }
          } catch (e) {
            // Ignore parse errors
          }

          // Check if session was invalidated
          if (errorData.code === 'SESSION_INVALIDATED') {
            log.warn('[unifiedFetch] Session invalidated - user logged in from another device/browser');

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

          // Other 401 errors - try to extract error message from response
          const statusCode = res.status || 401;
          const statusText = res.statusText || 'Unauthorized';
          let errorMessage = `HTTP ${statusCode}: ${statusText}`;

          try {
            if (textData) {
              try {
                const errorData = JSON.parse(textData);
                // Prioritize message, error, or details from response
                errorMessage = errorData.message || errorData.error || (errorData.details && errorData.details.message) || errorMessage;
              } catch (parseError) {
                if (textData.length > 0 && textData.length < 500) {
                  errorMessage = textData;
                }
              }
            }
          } catch (e) {
            console.warn('[unifiedFetch] Failed to parse 401 error response:', e);
          }

          const error = new Error(errorMessage);
          error.status = statusCode;
          throw error;
        }

        if (!res.ok) {
          // Try to extract error message from response body
          const statusCode = res.status || 'Unknown';
          const statusText = res.statusText || 'Error';
          let errorMessage = `HTTP ${statusCode}: ${statusText}`;

          let errorData = null;
          try {
            if (textData) {
              try {
                errorData = JSON.parse(textData);
                // Prioritize message, error, or details from response
                if (errorData.details && Array.isArray(errorData.details) && errorData.details.length > 0) {
                  // Extract validation error messages from details array
                  const validationMessages = errorData.details
                    .map(d => d.msg || d.message)
                    .filter(msg => msg)
                    .join(', ');
                  errorMessage = validationMessages || errorData.message || errorData.error || errorMessage;
                } else {
                  errorMessage = errorData.message || errorData.error || (errorData.details && errorData.details.message) || errorMessage;
                }
              } catch (parseError) {
                if (textData.length > 0 && textData.length < 500) {
                  errorMessage = textData;
                }
              }
            }
          } catch (e) {
            console.warn('[unifiedFetch] Failed to parse error response:', e);
          }

          const error = new Error(errorMessage);
          error.status = statusCode;
          // Attach full error data for detailed error handling
          if (errorData) {
            error.response = { data: errorData };
          }
          throw error;
        }

        // Parse JSON from the text data we already read
        const data = textData ? JSON.parse(textData) : {};

        // Cache successful responses (only GET requests)
        if ((options.method || 'GET').toUpperCase() === 'GET') {
          setCachedData(key, data, cacheTTL);
          log.debug(`[unifiedFetch] Cached response: ${key}`);
        }

        // Return safe response object
        return {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
          url: res.url,
          redirected: res.redirected,
          type: res.type,
          textData,
          json: async () => data,
          text: async () => textData,
          blob: async () => new Blob([textData], { type: 'application/json' }),
          arrayBuffer: async () => new TextEncoder().encode(textData).buffer,
          clone: function () { return { ...this }; },
          bodyUsed: true,
          fromCache: false
        };
      });

      const response = await fetchPromise;

      // Clear timeout on success
      if (timeoutId) clearTimeout(timeoutId);

      return response;

    } catch (error) {
      lastError = error;

      // Don't retry on abort or session invalidation
      if (error.name === 'AbortError' || error.code === 'SESSION_INVALIDATED') {
        throw error;
      }

      // Don't retry on client errors (4xx)
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Retry with exponential backoff
      if (attempt < maxRetries && retry) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        log.debug(`[unifiedFetch] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  // If we get here, all retries failed
  if (timeoutId) clearTimeout(timeoutId);
  throw lastError || new Error('Request failed after all retries');
};

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Unified fetch with instant cache and background refresh
 * Perfect for React components that need instant UI updates
 */
export const unifiedFetchWithRefresh = async (
  url,
  options = {},
  config = {}
) => {
  const {
    cacheKey = null,
    cacheTTL = 120000,
    onCacheHit = null,
    onFreshData = null
  } = config;

  const key = cacheKey || `fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // 🚀 INSTANT SYNCHRONOUS CACHE CHECK
  try {
    const cached = getCachedData(key, cacheTTL);
    if (cached) {
      // Callback for instant cache hit
      if (onCacheHit) {
        onCacheHit(cached);
      }

      // Fetch fresh data in background (non-blocking)
      requestAnimationFrame(() => {
        unifiedFetch(url, options, { ...config, forceRefresh: true })
          .then(async (response) => {
            const data = await response.json();
            if (onFreshData && !response.fromCache) {
              onFreshData(data);
            }
          })
          .catch(() => {
            // Silent fail - keep cached data
          });
      });

      return {
        ok: true,
        json: async () => cached,
        fromCache: true
      };
    }
  } catch (e) {
    // Cache check failed, continue with API call
  }

  // No cache - fetch from API
  const response = await unifiedFetch(url, options, config);
  const data = await response.json();

  if (onFreshData) {
    onFreshData(data);
  }

  return response;
};

/**
 * Clear pending requests
 */
export const clearPendingRequests = () => {
  requestDeduplicator.clear();
};

/**
 * Get pending requests count
 */
export const getPendingRequestsCount = () => {
  return requestDeduplicator.pending.size;
};

export default unifiedFetch;

