/**
 * Higher-Order Component for Automatic API Caching
 * Wraps fetch calls globally with automatic caching
 */

import { getCachedData, setCachedData } from './cacheUtils';

/**
 * Global fetch wrapper with automatic caching
 * Intercepts all fetch calls and adds caching automatically
 */
const originalFetch = window.fetch;

let isCachingEnabled = true;

// Performance tracking
const performanceStats = {
  cacheHits: 0,
  cacheMisses: 0,
  totalSavedTime: 0,
  avgCacheTime: 0,
  avgNetworkTime: 0
};

export const getPerformanceStats = () => ({ ...performanceStats });

export const resetPerformanceStats = () => {
  performanceStats.cacheHits = 0;
  performanceStats.cacheMisses = 0;
  performanceStats.totalSavedTime = 0;
  performanceStats.avgCacheTime = 0;
  performanceStats.avgNetworkTime = 0;
};

export const enableCaching = () => {
  isCachingEnabled = true;
};

export const disableCaching = () => {
  isCachingEnabled = false;
};

// Request deduplication map to prevent duplicate requests
const pendingAutoCacheRequests = new Map();

/**
 * Enhanced fetch with automatic caching
 * Automatically caches GET requests
 * 🚀 OPTIMIZED: Added request deduplication to prevent duplicate requests
 * 
 * NOTE: This wrapper intercepts ALL fetch calls, including those from apiService/optimizedFetch.
 * To avoid double-caching, we skip requests that are already being handled by optimizedFetch.
 */
window.fetch = async function (...args) {
  const [url, options = {}] = args;
  const method = (options.method || 'GET').toUpperCase();

  // Skip caching for requests that are already being handled by optimizedFetch/apiService
  // These requests have their own caching mechanism and don't need double-caching
  const urlString = url.toString();

  // Skip SSE endpoints (Server-Sent Events) - they use streaming responses
  const isSSEEndpoint = urlString.includes('/stream') ||
    urlString.includes('/notifications/stream') ||
    urlString.includes('/pos-stream');

  const isApiServiceRequest =
    options._skipAutoCache || // Property flag to skip auto-cache (not sent as header to avoid CORS)
    isSSEEndpoint || // Skip SSE endpoints
    // Skip if it's a known API endpoint that uses optimizedFetch
    (urlString.includes('/api/') && urlString.match(/\/api\/(theaters|roles|products|orders|theater-products|theater-stock|settings)/));

  // 🚀 FIX: Intercept direct GCS fetches and route through proxy to prevent 403 errors
  // This handles expired signed URLs by letting the backend proxy handle/retry them
  if (typeof url === 'string' && (urlString.includes('storage.googleapis.com') || urlString.includes('googleapis.com'))) {
    const proxyUrl = '/api/proxy-image';
    const proxyOptions = {
      ...options,
      method: 'POST',
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        // Add auth token if available (reusing logic below would be cleaner but this is safe/isolated)
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
      },
      body: JSON.stringify({ url: urlString })
    };
    return originalFetch(proxyUrl, proxyOptions).catch((error) => {
      // If proxy fails (404 - backend not running), fallback to original URL
      if (error.message && error.message.includes('404')) {
        // Silently fallback to original URL - don't log 404 errors for proxy
        return originalFetch(urlString, options);
      }
      throw error; // Re-throw other errors
    });
  }

  // ✅ FIX: Always inject token for API requests, even if skipping auto-cache
  if (urlString.includes('/api/') && !options.headers?.['Authorization'] && !options.headers?.['authorization']) {
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
      // Remove quotes, trim whitespace, ensure it's a valid string
      const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');

      // Validate token format (should have 3 parts separated by dots)
      if (cleanToken && cleanToken.split('.').length === 3) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${cleanToken}`
        };
      } else {
        console.warn('⚠️ [withCaching] Invalid token format, skipping Authorization header');
      }
    }
  }

  // Only cache GET requests that aren't already being handled by apiService
  if (!isCachingEnabled || method !== 'GET' || isApiServiceRequest) {
    return originalFetch.apply(this, args);
  }

  // Generate cache key from URL
  const cacheKey = `auto_${url.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;

  // 🚀 DEDUPLICATION: Check if same request is already pending
  const requestId = `${url}_${JSON.stringify(options)}`;
  if (pendingAutoCacheRequests.has(requestId)) {
    try {
      return await pendingAutoCacheRequests.get(requestId);
    } catch (err) {
      // If pending request failed, continue with new request
      pendingAutoCacheRequests.delete(requestId);
    }
  }

  // Check cache first
  const startTime = performance.now();
  const cached = getCachedData(cacheKey, 120000); // 2-minute default TTL

  if (cached) {
    const cacheTime = performance.now() - startTime;
    performanceStats.cacheHits++;
    performanceStats.avgCacheTime =
      (performanceStats.avgCacheTime * (performanceStats.cacheHits - 1) + cacheTime) / performanceStats.cacheHits;

    // Return cached data as a Response-like object
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => cached,
      text: async () => JSON.stringify(cached),
      clone: function () { return this; }
    });
  }

  // Create fetch promise and store it for deduplication
  const fetchPromise = (async () => {
    try {
      // ✅ FIX: Ensure Authorization header is included for API requests
      const urlString = url.toString();
      if (urlString.includes('/api/') && !options.headers?.['Authorization'] && !options.headers?.['authorization']) {
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
          // Remove quotes, trim whitespace, ensure it's a valid string
          const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');

          // Validate token format (should have 3 parts separated by dots)
          if (cleanToken && cleanToken.split('.').length === 3) {
            options.headers = {
              ...options.headers,
              'Authorization': `Bearer ${cleanToken}`
            };
          } else {
            console.warn('⚠️ [withCaching] Invalid token format, skipping Authorization header');
          }
        }
      }

      // Fetch fresh data
      const fetchStart = performance.now();
      const response = await originalFetch.apply(this, args);
      const networkTime = performance.now() - fetchStart;

      performanceStats.cacheMisses++;
      performanceStats.avgNetworkTime =
        (performanceStats.avgNetworkTime * (performanceStats.cacheMisses - 1) + networkTime) / performanceStats.cacheMisses;

      // Calculate time savings
      if (performanceStats.avgCacheTime > 0) {
        const savedTime = networkTime - performanceStats.avgCacheTime;
        performanceStats.totalSavedTime += savedTime;
      }

      // Clone response BEFORE reading to avoid "body stream already read" errors
      // The clone allows us to read the body for caching while returning the original response
      let clonedResponse = null;

      // Cache successful GET responses (skip streaming responses)
      const contentType = response.headers.get('content-type');
      const isStreamingResponse = contentType?.includes('text/event-stream') ||
        contentType?.includes('application/octet-stream');

      if (response.ok && !isStreamingResponse) {
        try {
          // Clone the response before reading
          clonedResponse = response.clone();
          const data = await clonedResponse.json();
          setCachedData(cacheKey, data);
        } catch (e) {
          // Not JSON or clone failed, skip caching but still return response
          // Don't log AbortError (normal during navigation)
          if (e.name !== 'AbortError') {
            console.warn('⚠️ [AutoCache] Failed to cache response:', e.message);
          }
        }
      }

      // Return the original response (body not consumed if we cloned properly)
      return response;
    } finally {
      // Remove from pending requests
      pendingAutoCacheRequests.delete(requestId);
    }
  })();

  // Store promise for deduplication
  pendingAutoCacheRequests.set(requestId, fetchPromise);

  return fetchPromise;
};

// Restore original fetch if needed
export const restoreFetch = () => {
  window.fetch = originalFetch;
};

// Display performance summary in console
export const showPerformanceReport = () => {
  if (performanceStats.cacheHits === 0) {
    return;
  }

  const speedImprovement = performanceStats.avgNetworkTime > 0
    ? ((performanceStats.avgNetworkTime - performanceStats.avgCacheTime) / performanceStats.avgNetworkTime * 100)
    : 0;


};

// Auto-report every 30 seconds
setInterval(() => {
  if (performanceStats.cacheHits > 0) {
    showPerformanceReport();
  }
}, 30000);

export default {
  enableCaching,
  disableCaching,
  restoreFetch,
  getPerformanceStats,
  resetPerformanceStats,
  showPerformanceReport
};
