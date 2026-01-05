/**
 * 🚀 ULTRA-FAST API CLIENT
 * Target: <50ms API response time with aggressive caching
 * 
 * Features:
 * - Automatic request deduplication
 * - Aggressive memory caching
 * - Predictive prefetching
 * - Automatic retry with exponential backoff
 * - Request batching
 * - Parallel request optimization
 */

import { memoryCache, ultraDebounce, predictiveFetcher, performanceTracker } from './ultraPerformance';
import { useDataCacheStore, usePerformanceStore } from '../stores/optimizedStores';
import config from '../config';

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
// REQUEST BATCHING
// ============================================================================

class RequestBatcher {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.batchDelay = 50; // 50ms window for batching
  }

  add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.scheduleBatch();
    });
  }

  scheduleBatch() {
    if (this.processing) return;

    this.processing = true;
    setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }

  async processBatch() {
    const batch = this.queue.splice(0);
    this.processing = false;

    if (batch.length === 0) return;

    // Group requests by endpoint
    const grouped = batch.reduce((acc, item) => {
      const { endpoint } = item.request;
      if (!acc[endpoint]) acc[endpoint] = [];
      acc[endpoint].push(item);
      return {};
    }, {});

    // Process each group in parallel
    await Promise.all(
      Object.entries(grouped).map(([endpoint, requests]) => 
        this.processBatchGroup(endpoint, requests)
      )
    );
  }

  async processBatchGroup(endpoint, requests) {
    try {
      // For now, process individually (can be optimized with batch API endpoints)
      await Promise.all(
        requests.map(async ({ request, resolve, reject }) => {
          try {
            const result = await fetch(request.url, request.options);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
      );
    } catch (error) {
      requests.forEach(({ reject }) => reject(error));
    }
  }
}

const requestBatcher = new RequestBatcher();

// ============================================================================
// ULTRA-FAST FETCH WITH MULTI-LAYER CACHING
// ============================================================================

/**
 * Ultra-optimized fetch with aggressive caching
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {object} cacheOptions - Caching configuration
 */
export const ultraFetch = async (url, options = {}, cacheOptions = {}) => {
  const {
    cacheKey = url,
    cacheTTL = 300000, // 5 minutes default
    forceRefresh = false,
    staleWhileRevalidate = true,
    prefetch = false
  } = cacheOptions;

  const start = performance.now();

  try {
    // 1. Check memory cache first (fastest - <1ms)
    if (!forceRefresh) {
      const memCached = memoryCache.get(cacheKey);
      if (memCached !== null) {
        const duration = performance.now() - start;
        usePerformanceStore.getState().recordAPI(url, duration, true);
        return memCached;
      }

      // 2. Check Zustand store cache (very fast - <5ms)
      const storeCached = useDataCacheStore.getState().getCache(cacheKey);
      if (storeCached) {
        // Also store in memory cache for even faster next access
        memoryCache.set(cacheKey, storeCached, cacheTTL);
        const duration = performance.now() - start;
        usePerformanceStore.getState().recordAPI(url, duration, true);
        
        // Revalidate in background if stale-while-revalidate
        if (staleWhileRevalidate) {
          setTimeout(() => {
            ultraFetch(url, options, { ...cacheOptions, forceRefresh: true });
          }, 0);
        }
        
        return storeCached;
      }
    }

    // 3. Deduplicate concurrent requests
    const fetchFn = async () => {
      // ✅ FIXED: Use centralized token getter for consistency
      // Add auth token if available
      let authToken = localStorage.getItem('authToken');
      // Fallback: Check other possible keys
      if (!authToken) {
        authToken = localStorage.getItem('yqpaynow_token') || localStorage.getItem('token');
        // If found in fallback, migrate to primary key
        if (authToken) {
          localStorage.setItem('authToken', authToken);
        }
      }
      
      // ✅ FIX: Clean token to remove any formatting issues
      if (authToken) {
        authToken = String(authToken).trim().replace(/^["']|["']$/g, '');
        // Validate token format (should have 3 parts separated by dots)
        if (authToken.split('.').length !== 3) {
          console.warn('⚠️ [ultraFetch] Invalid token format, skipping Authorization header');
          authToken = null;
        }
      }
      
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const fetchOptions = {
        ...options,
        headers
      };

      // Make the actual request
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    };

    const data = await requestDeduplicator.deduplicate(cacheKey, fetchFn);

    // 4. Cache the result in multiple layers
    if (!prefetch) {
      // Memory cache for ultra-fast access
      memoryCache.set(cacheKey, data, cacheTTL);
      
      // Store cache for persistence
      useDataCacheStore.getState().setCache(cacheKey, data, cacheTTL);
    }

    const duration = performance.now() - start;
    usePerformanceStore.getState().recordAPI(url, duration, true);
    
    
    return data;

  } catch (error) {
    const duration = performance.now() - start;
    usePerformanceStore.getState().recordAPI(url, duration, false);
    console.error(`[ultraFetch] Error fetching ${url}:`, error);
    throw error;
  }
};

// ============================================================================
// PARALLEL FETCH WITH AUTOMATIC OPTIMIZATION
// ============================================================================

/**
 * Fetch multiple endpoints in parallel with automatic optimization
 * @param {Array} requests - Array of {url, options, cacheOptions}
 */
export const ultraFetchParallel = async (requests) => {
  const start = performance.now();

  try {
    const results = await Promise.all(
      requests.map(({ url, options, cacheOptions }) => 
        ultraFetch(url, options, cacheOptions)
      )
    );

    const duration = performance.now() - start;
    
    return results;
  } catch (error) {
    console.error('[ultraFetchParallel] Error:', error);
    throw error;
  }
};

// ============================================================================
// PREDICTIVE PREFETCHING
// ============================================================================

/**
 * Prefetch data that user is likely to need next
 * @param {string} url - URL to prefetch
 * @param {object} options - Fetch options
 * @param {object} cacheOptions - Cache options
 */
export const prefetchData = (url, options = {}, cacheOptions = {}) => {
  // Don't prefetch if user prefers reduced data
  if (navigator.connection?.saveData) {
    return;
  }

  // Only prefetch during idle time
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      ultraFetch(url, options, { ...cacheOptions, prefetch: true });
    });
  } else {
    setTimeout(() => {
      ultraFetch(url, options, { ...cacheOptions, prefetch: true });
    }, 100);
  }
};

// ============================================================================
// AUTOMATIC RETRY WITH EXPONENTIAL BACKOFF
// ============================================================================

/**
 * Fetch with automatic retry on failure
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 */
export const ultraFetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ultraFetch(url, options);
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.message.includes('HTTP 4')) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

// ============================================================================
// OPTIMIZED API HOOKS
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Ultra-optimized hook for data fetching
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @param {object} hookOptions - Hook configuration
 */
export const useUltraFetch = (url, options = {}, hookOptions = {}) => {
  const {
    enabled = true,
    cacheTTL = 300000,
    staleWhileRevalidate = true,
    refetchOnMount = false,
    refetchInterval = null
  } = hookOptions;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);
  const cacheKey = url;

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const result = await ultraFetch(url, options, {
        cacheKey,
        cacheTTL,
        forceRefresh,
        staleWhileRevalidate
      });

      if (isMounted.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [url, enabled, cacheTTL, staleWhileRevalidate]);

  // Initial fetch
  useEffect(() => {
    fetchData(refetchOnMount);
    
    // Setup refetch interval if specified
    let interval;
    if (refetchInterval) {
      interval = setInterval(() => {
        fetchData(true);
      }, refetchInterval);
    }

    return () => {
      isMounted.current = false;
      if (interval) clearInterval(interval);
    };
  }, [fetchData, refetchInterval, refetchOnMount]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch };
};

/**
 * Hook for mutations with optimistic updates
 */
export const useUltraMutation = (url, options = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(async (data, mutationOptions = {}) => {
    const {
      optimisticData = null,
      onSuccess = null,
      onError = null,
      invalidateCache = []
    } = mutationOptions;

    try {
      setLoading(true);
      setError(null);

      // Return optimistic data immediately if provided
      if (optimisticData && onSuccess) {
        onSuccess(optimisticData);
      }

      const result = await ultraFetch(url, {
        ...options,
        method: options.method || 'POST',
        body: JSON.stringify(data)
      }, { forceRefresh: true });

      // Invalidate related caches
      invalidateCache.forEach(pattern => {
        useDataCacheStore.getState().invalidateCache(pattern);
        memoryCache.clear();
      });

      if (onSuccess) {
        onSuccess(result);
      }

      setLoading(false);
      return result;
    } catch (err) {
      setError(err);
      setLoading(false);
      if (onError) {
        onError(err);
      }
      throw err;
    }
  }, [url, options]);

  return { mutate, loading, error };
};

// ============================================================================
// GLOBAL API CLIENT UTILITIES
// ============================================================================

/**
 * Invalidate all caches
 */
export const invalidateAllCaches = () => {
  memoryCache.clear();
  useDataCacheStore.getState().clearCache();
  requestDeduplicator.clear();
};

/**
 * Warm up cache with frequently accessed endpoints
 */
export const warmupCache = async (endpoints) => {
  
  await Promise.all(
    endpoints.map(({ url, options, cacheOptions }) => 
      prefetchData(url, options, cacheOptions)
    )
  );
  
};

/**
 * Get API statistics
 */
export const getAPIStats = () => {
  return {
    performance: usePerformanceStore.getState().getAllStats().apis,
    cache: useDataCacheStore.getState().getCacheStats(),
    memory: memoryCache.getStats()
  };
};

// ============================================================================
// GLOBAL ACCESS FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
  window.ultraFetch = ultraFetch;
  window.invalidateAllCaches = invalidateAllCaches;
  window.warmupCache = warmupCache;
  window.getAPIStats = getAPIStats;
  window.showAPIStats = () => console.table(getAPIStats());
}

export default {
  ultraFetch,
  ultraFetchParallel,
  ultraFetchWithRetry,
  prefetchData,
  useUltraFetch,
  useUltraMutation,
  invalidateAllCaches,
  warmupCache,
  getAPIStats
};
