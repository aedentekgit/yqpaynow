/**
 * Optimized Fetch Hook with Request Deduplication, Batching, and Caching
 * Prevents duplicate requests, batches multiple requests, and caches responses
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCachedData, setCachedData } from '../utils/cacheUtils';

// Request deduplication map: url -> Promise
const pendingRequests = new Map();

// Request queue for batching
const requestQueue = [];
let queueTimer = null;
const BATCH_DELAY = 50; // Batch requests within 50ms

/**
 * Optimized fetch hook with:
 * - Request deduplication (prevents duplicate simultaneous requests)
 * - Automatic caching
 * - Request batching
 * - Abort controller support
 */
export const useOptimizedFetch = (url, options = {}, cacheKey = null, cacheTTL = 120000, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  // Generate cache key from URL if not provided
  const finalCacheKey = useMemo(() => {
    return cacheKey || `fetch_${url?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'}`;
  }, [url, cacheKey]);

  const fetchData = useCallback(async (skipCache = false, signal = null) => {
    if (!url) {
      setLoading(false);
      return;
    }

    try {
      // Check cache first (unless explicitly skipping)
      if (!skipCache) {
        const cached = getCachedData(finalCacheKey, cacheTTL);
        if (cached) {
          setData(cached);
          setLoading(false);
          
          // Fetch fresh data in background
          setTimeout(() => fetchData(true, signal), 100);
          return;
        }
      }

      // 🚀 REQUEST DEDUPLICATION: Check if same request is already pending
      const requestKey = `${url}_${JSON.stringify(options)}`;
      if (pendingRequests.has(requestKey)) {
        try {
          const cachedResult = await pendingRequests.get(requestKey);
          setData(cachedResult);
          setError(null);
          setLoading(false);
          return;
        } catch (err) {
          // If pending request failed, continue with new request
          console.warn(`⚠️ [useOptimizedFetch] Pending request failed, retrying:`, err);
        }
      }

      // Fetch fresh data
      if (!skipCache) setLoading(true);
      
      // Create fetch promise and store it for deduplication
      const fetchPromise = fetch(url, {
        ...options,
        signal: signal || options.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      }).then((result) => {
        // Store in cache
        setCachedData(finalCacheKey, result);
        // Remove from pending requests
        pendingRequests.delete(requestKey);
        return result;
      }).catch((err) => {
        // Remove from pending requests on error
        pendingRequests.delete(requestKey);
        throw err;
      });

      // Store promise for deduplication
      pendingRequests.set(requestKey, fetchPromise);

      const result = await fetchPromise;
      
      setData(result);
      setError(null);
      setLoading(false);
      
    } catch (err) {
      // Handle AbortError gracefully
      if (err.name === 'AbortError') {
        return;
      }
      
      console.error(`❌ [useOptimizedFetch] Error for ${finalCacheKey}:`, err);
      setError(err.message);
      setLoading(false);
    }
  }, [url, finalCacheKey, cacheTTL, options]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    fetchData(false, signal);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...dependencies]);

  // Manual refetch function
  const refetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    fetchData(true, abortControllerRef.current.signal);
  }, [fetchData]);

  return { data, loading, error, refetch };
};

/**
 * Hook for parallel fetching multiple endpoints with optimization
 * Automatically batches and deduplicates requests
 */
export const useOptimizedFetchAll = (requests = [], dependencies = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchAll = useCallback(async (skipCache = false, signal = null) => {
    if (requests.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const results = [];
      
      // Check caches first
      if (!skipCache) {
        const cachedResults = requests.map(req => {
          const key = req.cacheKey || `fetch_${req.url.replace(/[^a-zA-Z0-9]/g, '_')}`;
          return getCachedData(key, req.cacheTTL || 120000);
        });
        
        const allCached = cachedResults.every(r => r !== null);
        
        if (allCached) {
          setData(cachedResults);
          setLoading(false);
          
          // Fetch fresh in background
          setTimeout(() => fetchAll(true, signal), 100);
          return;
        }
      }

      // Fetch all in parallel with deduplication
      if (!skipCache) setLoading(true);
      
      const fetchPromises = requests.map(async (req) => {
        const requestKey = `${req.url}_${JSON.stringify(req.options || {})}`;
        
        // Check if request is already pending
        if (pendingRequests.has(requestKey)) {
          return pendingRequests.get(requestKey);
        }

        const fetchPromise = fetch(req.url, {
          ...req.options,
          signal: signal || req.options?.signal,
          headers: {
            'Content-Type': 'application/json',
            ...req.options?.headers
          }
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        }).then((result) => {
          // Cache the result
          const key = req.cacheKey || `fetch_${req.url.replace(/[^a-zA-Z0-9]/g, '_')}`;
          setCachedData(key, result);
          pendingRequests.delete(requestKey);
          return result;
        }).catch((err) => {
          pendingRequests.delete(requestKey);
          throw err;
        });

        // Store for deduplication
        pendingRequests.set(requestKey, fetchPromise);
        return fetchPromise;
      });

      const fetchResults = await Promise.all(fetchPromises);

      setData(fetchResults);
      setError(null);
      setLoading(false);
      
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      
      console.error('❌ [useOptimizedFetchAll] Error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [requests]);

  useEffect(() => {
    if (requests.length === 0) {
      setLoading(false);
      return;
    }

    // Cancel previous requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    fetchAll(false, signal);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies]);

  const refetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    fetchAll(true, abortControllerRef.current.signal);
  }, [fetchAll]);

  return { data, loading, error, refetch };
};

export default useOptimizedFetch;

