/**
 * 🚀 ULTRA PERFORMANCE OPTIMIZER
 * Target: <1ms load time for all pages
 * 
 * This module provides aggressive optimization strategies including:
 * - Advanced memoization with automatic dependency tracking
 * - Render-time optimization with automatic batching
 * - Memory-efficient state management
 * - Intelligent caching with predictive pre-fetching
 * - Virtual DOM optimization
 */

import { useRef, useMemo, useCallback, useEffect } from 'react';

// ============================================================================
// MEMORY CACHE - Lightning Fast In-Memory Storage
// ============================================================================

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
    this.accessCount = new Map();
    this.maxSize = 1000; // Maximum number of cached items
    this.ttl = 300000; // 5 minutes default TTL
  }

  set(key, value, ttl = this.ttl) {
    // If cache is full, remove least recently used items
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, value);
    this.timestamps.set(key, Date.now() + ttl);
    this.accessCount.set(key, 0);
    return value;
  }

  get(key) {
    // Check if key exists and is not expired
    const timestamp = this.timestamps.get(key);
    if (!timestamp || Date.now() > timestamp) {
      this.delete(key);
      return null;
    }

    // Increment access count
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    return this.cache.get(key);
  }

  has(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp || Date.now() > timestamp) {
      this.delete(key);
      return false;
    }
    return this.cache.has(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
    this.accessCount.delete(key);
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
    this.accessCount.clear();
  }

  evictLRU() {
    // Find and remove least recently used item
    let lruKey = null;
    let minAccessCount = Infinity;

    for (const [key, count] of this.accessCount.entries()) {
      if (count < minAccessCount) {
        minAccessCount = count;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
    }
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate(),
      keys: Array.from(this.cache.keys())
    };
  }

  calculateHitRate() {
    const totalAccess = Array.from(this.accessCount.values()).reduce((a, b) => a + b, 0);
    return this.cache.size > 0 ? (totalAccess / this.cache.size).toFixed(2) : 0;
  }
}

// Global memory cache instance
export const memoryCache = new MemoryCache();

// ============================================================================
// MEMOIZATION UTILITIES
// ============================================================================

/**
 * Ultra-fast memoization with automatic cache invalidation
 * @param {Function} fn - Function to memoize
 * @param {number} maxAge - Maximum age in milliseconds (default: 60000ms = 1 min)
 */
export const ultraMemoize = (fn, maxAge = 60000) => {
  const cache = new Map();
  const timestamps = new Map();

  return (...args) => {
    const key = JSON.stringify(args);
    const now = Date.now();
    
    // Check if cached and not expired
    if (cache.has(key)) {
      const timestamp = timestamps.get(key);
      if (now - timestamp < maxAge) {
        return cache.get(key);
      }
    }

    // Compute and cache
    const result = fn(...args);
    cache.set(key, result);
    timestamps.set(key, now);
    
    // Auto-cleanup old entries
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
      timestamps.delete(oldestKey);
    }

    return result;
  };
};

/**
 * Deep memoization hook with automatic dependency tracking
 */
export const useDeepMemo = (factory, deps) => {
  const ref = useRef();
  const depsRef = useRef(deps);

  // Deep comparison of dependencies
  const depsChanged = useMemo(() => {
    if (!depsRef.current) return true;
    if (deps.length !== depsRef.current.length) return true;
    
    return deps.some((dep, i) => {
      const prevDep = depsRef.current[i];
      if (typeof dep === 'object' && dep !== null) {
        return JSON.stringify(dep) !== JSON.stringify(prevDep);
      }
      return dep !== prevDep;
    });
  }, deps);

  if (depsChanged) {
    ref.current = factory();
    depsRef.current = deps;
  }

  return ref.current;
};

/**
 * Ultra-fast callback memoization with minimal re-renders
 */
export const useStableCallback = (callback) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args) => {
    return callbackRef.current(...args);
  }, []);
};

// ============================================================================
// RENDER OPTIMIZATION
// ============================================================================

/**
 * Batched state updates to minimize re-renders
 */
export class BatchedUpdates {
  constructor() {
    this.updates = [];
    this.scheduled = false;
  }

  schedule(updateFn) {
    this.updates.push(updateFn);
    
    if (!this.scheduled) {
      this.scheduled = true;
      Promise.resolve().then(() => {
        this.flush();
      });
    }
  }

  flush() {
    const updates = this.updates.slice();
    this.updates = [];
    this.scheduled = false;

    // Execute all updates in a single batch
    updates.forEach(update => update());
  }
}

export const batchedUpdates = new BatchedUpdates();

/**
 * Hook to batch multiple state updates
 */
export const useBatchedState = (initialState) => {
  const [state, setState] = React.useState(initialState);
  const pendingUpdates = useRef([]);
  const scheduled = useRef(false);

  const batchedSetState = useCallback((update) => {
    pendingUpdates.current.push(update);

    if (!scheduled.current) {
      scheduled.current = true;
      queueMicrotask(() => {
        const updates = pendingUpdates.current;
        pendingUpdates.current = [];
        scheduled.current = false;

        setState(prevState => {
          let newState = prevState;
          updates.forEach(update => {
            newState = typeof update === 'function' ? update(newState) : update;
          });
          return newState;
        });
      });
    }
  }, []);

  return [state, batchedSetState];
};

// ============================================================================
// COMPUTED VALUES WITH AUTOMATIC CACHING
// ============================================================================

/**
 * Create a computed value that automatically caches and invalidates
 */
export const createComputed = (computeFn, dependencies = []) => {
  let cachedValue = null;
  let cachedDeps = null;

  return () => {
    // Check if dependencies changed
    const depsChanged = !cachedDeps || 
      dependencies.some((dep, i) => dep !== cachedDeps[i]);

    if (depsChanged) {
      cachedValue = computeFn();
      cachedDeps = [...dependencies];
    }

    return cachedValue;
  };
};

/**
 * Hook for computed values with minimal re-computation
 */
export const useComputed = (computeFn, deps) => {
  return useMemo(() => {
    const start = performance.now();
    const result = computeFn();
    const duration = performance.now() - start;
    
    // Log slow computations (>5ms)
    if (duration > 5 && process.env.NODE_ENV === 'development') {
      console.warn(`[Performance] Slow computation: ${duration.toFixed(2)}ms`);
    }

    return result;
  }, deps);
};

// ============================================================================
// VIRTUAL SCROLLING UTILITIES
// ============================================================================

/**
 * Calculate visible items for virtual scrolling
 */
export const calculateVisibleRange = (scrollTop, itemHeight, containerHeight, itemCount) => {
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    itemCount - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight)
  );

  // Add buffer for smooth scrolling
  const buffer = 5;
  return {
    startIndex: Math.max(0, startIndex - buffer),
    endIndex: Math.min(itemCount - 1, endIndex + buffer),
    visibleCount: endIndex - startIndex + 1
  };
};

/**
 * Hook for virtual scrolling with automatic optimization
 */
export const useVirtualScroll = (items, itemHeight, containerHeight) => {
  const [scrollTop, setScrollTop] = React.useState(0);
  
  const visibleRange = useMemo(() => {
    return calculateVisibleRange(scrollTop, itemHeight, containerHeight, items.length);
  }, [scrollTop, itemHeight, containerHeight, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange.startIndex, visibleRange.endIndex]);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  return {
    visibleItems,
    visibleRange,
    totalHeight: items.length * itemHeight,
    offsetY: visibleRange.startIndex * itemHeight,
    handleScroll
  };
};

// ============================================================================
// PREDICTIVE PRE-FETCHING
// ============================================================================

class PredictiveFetcher {
  constructor() {
    this.patterns = new Map();
    this.fetchQueue = [];
    this.fetching = false;
  }

  recordNavigation(from, to) {
    const key = from;
    if (!this.patterns.has(key)) {
      this.patterns.set(key, new Map());
    }
    
    const destinations = this.patterns.get(key);
    destinations.set(to, (destinations.get(to) || 0) + 1);
  }

  predictNext(current) {
    const destinations = this.patterns.get(current);
    if (!destinations) return null;

    // Find most likely next destination
    let maxCount = 0;
    let predicted = null;

    for (const [dest, count] of destinations.entries()) {
      if (count > maxCount) {
        maxCount = count;
        predicted = dest;
      }
    }

    return predicted;
  }

  prefetch(url, fetchFn) {
    if (!this.fetchQueue.includes(url)) {
      this.fetchQueue.push(url);
      this.processFetchQueue(fetchFn);
    }
  }

  async processFetchQueue(fetchFn) {
    if (this.fetching || this.fetchQueue.length === 0) return;

    this.fetching = true;
    const url = this.fetchQueue.shift();

    try {
      await fetchFn(url);
    } catch (error) {
      console.warn('[PredictiveFetcher] Prefetch failed:', error);
    }

    this.fetching = false;
    if (this.fetchQueue.length > 0) {
      setTimeout(() => this.processFetchQueue(fetchFn), 100);
    }
  }
}

export const predictiveFetcher = new PredictiveFetcher();

// ============================================================================
// DEBOUNCE & THROTTLE
// ============================================================================

/**
 * Ultra-fast debounce with leading edge support
 */
export const ultraDebounce = (func, wait, options = {}) => {
  let timeout;
  let lastArgs;
  let lastThis;
  let result;
  const { leading = false, trailing = true, maxWait } = options;
  let lastCallTime = 0;

  const invokeFunc = (time) => {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastCallTime = time;
    result = func.apply(thisArg, args);
    return result;
  };

  const leadingEdge = (time) => {
    lastCallTime = time;
    timeout = setTimeout(timerExpired, wait);
    return leading ? invokeFunc(time) : result;
  };

  const timerExpired = () => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timeout = setTimeout(timerExpired, remainingWait(time));
  };

  const trailingEdge = (time) => {
    timeout = undefined;
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  };

  const remainingWait = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    const timeWaiting = wait - timeSinceLastCall;
    return maxWait !== undefined
      ? Math.min(timeWaiting, maxWait - timeSinceLastCall)
      : timeWaiting;
  };

  const shouldInvoke = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    return (
      lastCallTime === 0 ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastCall >= maxWait)
    );
  };

  const debounced = function(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;

    if (isInvoking) {
      if (timeout === undefined) {
        return leadingEdge(time);
      }
      if (maxWait) {
        timeout = setTimeout(timerExpired, wait);
        return invokeFunc(time);
      }
    }
    if (timeout === undefined) {
      timeout = setTimeout(timerExpired, wait);
    }
    return result;
  };

  debounced.cancel = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    lastCallTime = 0;
    lastArgs = lastThis = timeout = undefined;
  };

  debounced.flush = () => {
    return timeout === undefined ? result : trailingEdge(Date.now());
  };

  return debounced;
};

/**
 * Ultra-fast throttle implementation
 */
export const ultraThrottle = (func, wait, options = {}) => {
  let timeout;
  let previous = 0;
  const { leading = true, trailing = true } = options;

  const throttled = function(...args) {
    const now = Date.now();
    if (!previous && !leading) previous = now;
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        previous = leading ? Date.now() : 0;
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };

  throttled.cancel = () => {
    clearTimeout(timeout);
    previous = 0;
    timeout = null;
  };

  return throttled;
};

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      render: 16, // 60fps = 16ms per frame
      api: 100,
      computation: 5
    };
  }

  measure(name, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    this.record(name, duration);

    return result;
  }

  async measureAsync(name, fn) {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    this.record(name, duration);

    return result;
  }

  record(name, duration) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const measurements = this.metrics.get(name);
    measurements.push({
      duration,
      timestamp: Date.now()
    });

    // Keep only last 100 measurements
    if (measurements.length > 100) {
      measurements.shift();
    }

    // Warn if threshold exceeded
    const threshold = this.thresholds[name] || 50;
    if (duration > threshold && process.env.NODE_ENV === 'development') {
      console.warn(
        `[Performance] ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
      );
    }
  }

  getStats(name) {
    const measurements = this.metrics.get(name) || [];
    if (measurements.length === 0) return null;

    const durations = measurements.map(m => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    return {
      count: measurements.length,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      recent: durations.slice(-10).map(d => d.toFixed(2))
    };
  }

  getAllStats() {
    const stats = {};
    for (const [name, _] of this.metrics) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }

  clear() {
    this.metrics.clear();
  }
}

export const performanceTracker = new PerformanceTracker();

// Export for global access
if (typeof window !== 'undefined') {
  window.performanceTracker = performanceTracker;
  window.memoryCache = memoryCache;
  window.showPerformanceStats = () => console.table(performanceTracker.getAllStats());
  window.showCacheStats = () => {
    if (typeof window !== 'undefined' && window.log) {
      window.log.debug('Cache Stats:', memoryCache.getStats());
    } else {
      // Fallback for environments without logger
      if (import.meta.env.DEV) {
      }
    }
  };
}

export default {
  memoryCache,
  ultraMemoize,
  useDeepMemo,
  useStableCallback,
  useBatchedState,
  useComputed,
  useVirtualScroll,
  ultraDebounce,
  ultraThrottle,
  performanceTracker,
  predictiveFetcher
};
