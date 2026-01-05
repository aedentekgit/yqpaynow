/**
 * 🚀 PARALLEL DATA LOADER HOOK
 * 
 * Optimized hook for loading multiple API endpoints in parallel
 * with intelligent caching and instant cache loading
 * 
 * Usage:
 * const { data, loading, error } = useParallelDataLoader({
 *   endpoints: [
 *     { key: 'stats', url: '/api/stats', cacheKey: 'stats_cache' },
 *     { key: 'users', url: '/api/users', cacheKey: 'users_cache' }
 *   ],
 *   cacheTTL: 300000 // 5 minutes
 * });
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData, setCachedData } from '../utils/cacheUtils';
import config from '../config';

export const useParallelDataLoader = ({
  endpoints = [],
  cacheTTL = 300000, // 5 minutes default
  combinedCacheKey = null, // Optional: single cache key for all data
  enabled = true,
  onSuccess = null,
  onError = null
}) => {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!enabled || endpoints.length === 0) {
      setLoading(false);
      return;
    }

    // 🚀 DEDUPLICATION: Prevent duplicate requests
    if (isFetchingRef.current && !forceRefresh) {
      return;
    }

    try {
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      // 🚀 STEP 1: Check combined cache first (instant load)
      if (combinedCacheKey && !forceRefresh) {
        const cachedData = getCachedData(combinedCacheKey, cacheTTL);
        if (cachedData) {
          setData(cachedData);
          setLoading(false);
          isFetchingRef.current = false;
          if (onSuccess) onSuccess(cachedData);
          return;
        }
      }

      // 🚀 STEP 2: Check individual caches
      const cachedResults = {};
      let hasAllCached = true;

      if (!forceRefresh) {
        endpoints.forEach(endpoint => {
          const cached = getCachedData(endpoint.cacheKey || endpoint.key, cacheTTL);
          if (cached) {
            cachedResults[endpoint.key] = cached;
          } else {
            hasAllCached = false;
          }
        });

        // If all data is cached, use it
        if (hasAllCached && Object.keys(cachedResults).length === endpoints.length) {
          setData(cachedResults);
          setLoading(false);
          isFetchingRef.current = false;
          
          // Save combined cache for future instant loads
          if (combinedCacheKey) {
            setCachedData(combinedCacheKey, cachedResults);
          }
          
          if (onSuccess) onSuccess(cachedResults);
          return;
        }
      }

      // 🚀 STEP 3: Load missing data in PARALLEL
      const authToken = config.helpers.getAuthToken();
      const commonHeaders = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      };

      // Build parallel fetch promises
      const fetchPromises = endpoints.map(async (endpoint) => {
        // Use cached data if available
        if (cachedResults[endpoint.key] && !forceRefresh) {
          return { key: endpoint.key, data: cachedResults[endpoint.key] };
        }

        // Fetch from API
        const url = endpoint.url.startsWith('http') 
          ? endpoint.url 
          : `${config.api.baseUrl}${endpoint.url}`;
        
        const result = await optimizedFetch(
          url,
          {
            headers: { ...commonHeaders, ...endpoint.headers },
            method: endpoint.method || 'GET',
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
            signal: abortControllerRef.current?.signal
          },
          endpoint.cacheKey || endpoint.key,
          cacheTTL
        );

        return { 
          key: endpoint.key, 
          data: endpoint.transform ? endpoint.transform(result) : result 
        };
      });

      // 🚀 PARALLEL EXECUTION: All requests fire simultaneously
      const results = await Promise.all(fetchPromises);

      // Process results
      const loadedData = {};
      results.forEach(({ key, data: resultData }) => {
        // Extract data from API response format
        const extractedData = resultData?.data || resultData?.result || resultData;
        loadedData[key] = extractedData;
        
        // Save individual cache
        const endpoint = endpoints.find(e => e.key === key);
        if (endpoint?.cacheKey || key) {
          setCachedData(endpoint?.cacheKey || key, extractedData);
        }
      });

      // Merge with cached data
      const mergedData = { ...cachedResults, ...loadedData };
      
      setData(mergedData);
      
      // Save combined cache for instant future loads
      if (combinedCacheKey) {
        setCachedData(combinedCacheKey, mergedData);
      }

      setLoading(false);
      isFetchingRef.current = false;

      if (onSuccess) onSuccess(mergedData);

    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled
      }

      setError(err.message || 'Failed to load data');
      setLoading(false);
      isFetchingRef.current = false;

      if (onError) onError(err);
    }
  }, [endpoints, cacheTTL, combinedCacheKey, enabled, onSuccess, onError]);

  // Initial load
  useEffect(() => {
    loadData(false);
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []); // Only run on mount

  // Refetch function
  const refetch = useCallback(() => {
    loadData(true);
  }, [loadData]);

  return {
    data,
    loading,
    error,
    refetch
  };
};

export default useParallelDataLoader;

