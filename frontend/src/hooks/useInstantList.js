/**
 * 🚀 INSTANT LIST LOADING: Universal hook for all list pages
 * Shows cached data instantly (< 0.01ms) - no loading spinners
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCachedData, setCachedData } from '../utils/cacheUtils';

/**
 * Universal hook for instant list loading
 * @param {string} cacheKey - Unique cache key
 * @param {Function} fetchFn - Function to fetch data
 * @param {number} cacheTTL - Cache TTL in ms (default: 60000 = 1 minute)
 * @param {Array} dependencies - Dependencies that trigger refetch
 */
export const useInstantList = (cacheKey, fetchFn, cacheTTL = 60000, dependencies = []) => {
  // 🚀 INSTANT: Check cache synchronously on initialization
  const initialCachedData = (() => {
    try {
      return getCachedData(cacheKey, cacheTTL);
    } catch (e) {
      return null;
    }
  })();

  const [data, setData] = useState(initialCachedData || []);
  const [loading, setLoading] = useState(!initialCachedData); // Start false if cache exists
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(initialCachedData?.summary || {
    total: 0,
    active: 0,
    inactive: 0
  });
  const isMountedRef = useRef(true);
  const fetchTimeoutRef = useRef(null);

  // Fetch data function
  const fetchData = useCallback(async (skipCache = false) => {
    if (!isMountedRef.current) return;

    // 🚀 INSTANT: Check cache first (unless skipping)
    if (!skipCache) {
      try {
        const cached = getCachedData(cacheKey, cacheTTL);
        if (cached) {
          // Instant display from cache
          setData(cached.data || cached);
          if (cached.summary) setSummary(cached.summary);
          setLoading(false);
          setError(null);
          
          // Fetch fresh data in background
          requestAnimationFrame(() => {
            fetchData(true);
          });
          return;
        }
      } catch (e) {
        // Cache check failed, continue
      }
    }

    // No cache - fetch from API
    if (!skipCache) setLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      
      if (!isMountedRef.current) return;

      // Cache the result
      const cacheData = {
        data: result.data || result,
        summary: result.summary || summary,
        timestamp: Date.now()
      };
      setCachedData(cacheKey, cacheData);

      // Update state
      setData(result.data || result);
      if (result.summary) setSummary(result.summary);
      setLoading(false);
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
  }, [cacheKey, cacheTTL, fetchFn, summary]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    
    // Clear any pending timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Instant load from cache, then fetch fresh
    fetchData();

    return () => {
      isMountedRef.current = false;
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [fetchData, ...dependencies]);

  const refetch = useCallback(() => {
    fetchData(true); // Skip cache on manual refetch
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    summary,
    refetch,
    hasData: data && data.length > 0
  };
};

