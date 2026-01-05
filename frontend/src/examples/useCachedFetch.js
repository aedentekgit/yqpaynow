/**
 * Universal Cached Fetch Hook
 * Automatically caches all API responses with configurable TTL
 * Use this hook across ALL pages for instant performance optimization
 */

import { useState, useEffect, useCallback } from 'react';
import { getCachedData, setCachedData } from '../utils/cacheUtils';

/**
 * Custom hook for fetching data with automatic caching
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options (headers, method, etc.)
 * @param {string} cacheKey - Unique cache key for this data
 * @param {number} cacheTTL - Cache time-to-live in milliseconds (default: 2 minutes)
 * @param {Array} dependencies - Dependencies that trigger refetch (like React useEffect)
 * @returns {Object} { data, loading, error, refetch }
 */
export const useCachedFetch = (url, options = {}, cacheKey = null, cacheTTL = 120000, dependencies = []) => {
  // Generate cache key from URL if not provided
  const finalCacheKey = cacheKey || `fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // 🚀 INSTANT: Check cache synchronously on initialization
  const initialCachedData = (() => {
    if (!url) return null;
    try {
      return getCachedData(finalCacheKey, cacheTTL);
    } catch (e) {
      return null;
    }
  })();
  
  const [data, setData] = useState(initialCachedData);
  const [loading, setLoading] = useState(!initialCachedData); // 🚀 Start with false if cache exists
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (skipCache = false) => {
    try {
      // Check cache first (unless explicitly skipping)
      if (!skipCache) {
        const cached = getCachedData(finalCacheKey, cacheTTL);
        if (cached) {
          setData(cached);
          setLoading(false);
          
          // Fetch fresh data in background
          setTimeout(() => fetchData(true), 100);
          return;
        }
      }

      // Fetch fresh data
      if (!skipCache) setLoading(true);
      
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
            console.warn('⚠️ [useCachedFetch] Invalid token format, skipping Authorization header');
          }
        }
      }
      
      // Skip withCaching.js auto-cache since we handle caching ourselves
      const response = await fetch(url, {
        ...options,
        _skipAutoCache: true, // Skip withCaching.js auto-cache (we handle caching)
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Store in cache
      setCachedData(finalCacheKey, result);
      setData(result);
      setError(null);
      setLoading(false);
      
    } catch (err) {
      console.error(`❌ [useCachedFetch] Error for ${finalCacheKey}:`, err);
      setError(err.message);
      setLoading(false);
    }
  }, [url, finalCacheKey, cacheTTL, options]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    if (url) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...dependencies]);

  // Manual refetch function
  const refetch = useCallback(() => {
    fetchData(true); // Skip cache on manual refetch
  }, [fetchData]);

  return { data, loading, error, refetch };
};

/**
 * Hook for parallel fetching multiple endpoints with caching
 * @param {Array} requests - Array of {url, cacheKey, cacheTTL} objects
 * @param {Array} dependencies - Dependencies that trigger refetch
 * @returns {Object} { data, loading, error, refetch }
 */
export const useCachedFetchAll = (requests = [], dependencies = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async (skipCache = false) => {
    try {
      const results = [];
      
      // Check caches first
      if (!skipCache) {
        const cachePromises = requests.map(req => {
          const key = req.cacheKey || `fetch_${req.url.replace(/[^a-zA-Z0-9]/g, '_')}`;
          return getCachedData(key, req.cacheTTL || 120000);
        });
        
        const cachedResults = cachePromises;
        const allCached = cachedResults.every(r => r !== null);
        
        if (allCached) {
          setData(cachedResults);
          setLoading(false);
          
          // Fetch fresh in background
          setTimeout(() => fetchAll(true), 100);
          return;
        }
      }

      // Fetch all in parallel
      if (!skipCache) setLoading(true);
      
      const fetchPromises = requests.map(async (req) => {
        // Skip withCaching.js auto-cache since we handle caching ourselves
        const response = await fetch(req.url, {
          ...req.options,
          _skipAutoCache: true, // Skip withCaching.js auto-cache (we handle caching)
          headers: {
            'Content-Type': 'application/json',
            ...req.options?.headers
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.json();
      });

      const fetchResults = await Promise.all(fetchPromises);
      
      // Cache all results
      fetchResults.forEach((result, index) => {
        const req = requests[index];
        const key = req.cacheKey || `fetch_${req.url.replace(/[^a-zA-Z0-9]/g, '_')}`;
        setCachedData(key, result);
      });

      setData(fetchResults);
      setError(null);
      setLoading(false);
      
    } catch (err) {
      console.error('❌ [useCachedFetchAll] Error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [requests]);

  useEffect(() => {
    if (requests.length > 0) {
      fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies]);

  const refetch = useCallback(() => {
    fetchAll(true);
  }, [fetchAll]);

  return { data, loading, error, refetch };
};

export default useCachedFetch;
