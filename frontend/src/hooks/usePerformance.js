import { useState, useEffect, useCallback, useMemo } from 'react';

// Global performance optimization hook
export const usePerformance = () => {
  const [performanceMetrics, setPerformanceMetrics] = useState({});

  useEffect(() => {
    // Measure page load performance
    const measurePerformance = () => {
      if (performance.getEntriesByType) {
        const navigation = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        
        setPerformanceMetrics({
          pageLoadTime: navigation?.loadEventEnd - navigation?.navigationStart,
          domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.navigationStart,
          firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
          firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
          memoryUsage: performance.memory ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
          } : null
        });
      }
    };

    measurePerformance();
    
    // Log performance to console in development
    if (process.env.NODE_ENV === 'development') {
  }
  }, []);

  return performanceMetrics;
};

// Global debounce hook for performance
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Global throttle hook for performance
export const useThrottle = (callback, delay) => {
  const [lastCall, setLastCall] = useState(0);

  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      setLastCall(now);
      return callback(...args);
    }
  }, [callback, delay, lastCall]);
};

// Global memoization hook with cache size limit
export const useMemoWithLimit = (factory, deps, limit = 100) => {
  const cache = useMemo(() => new Map(), []);
  
  return useMemo(() => {
    const key = JSON.stringify(deps);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    // Limit cache size
    if (cache.size >= limit) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    const result = factory();
    cache.set(key, result);
    return result;
  }, deps);
};

// Global virtual scrolling hook for large lists
export const useVirtualScroll = (items, itemHeight, containerHeight) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );
  
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalHeight = items.length * itemHeight;
  const offsetY = visibleStart * itemHeight;
  
  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: (e) => setScrollTop(e.target.scrollTop)
  };
};

// Global intersection observer hook
export const useIntersectionObserver = (options = {}) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [ref, setRef] = useState(null);

  useEffect(() => {
    if (!ref) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, {
      threshold: 0.1,
      ...options
    });

    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref, options]);

  return [setRef, isIntersecting];
};

// Global prefetch hook for routes
export const usePrefetch = () => {
  const prefetchRoute = useCallback((routePath) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = routePath;
    document.head.appendChild(link);
    
    setTimeout(() => {
      document.head.removeChild(link);
    }, 1000);
  }, []);

  return { prefetchRoute };
};

// Global resource hints
export const useResourceHints = () => {
  useEffect(() => {
    // DNS prefetch for external domains
    const dnsPrefetch = (domain) => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = domain;
      document.head.appendChild(link);
    };

    // Preconnect to critical domains
    const preconnect = (domain) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = domain;
      document.head.appendChild(link);
    };

    // Add critical resource hints
    dnsPrefetch('//images.unsplash.com');
    dnsPrefetch('//api.yqpaynow.com');
    preconnect('//fonts.googleapis.com');
    preconnect('//fonts.gstatic.com');
  }, []);
};

export default {
  usePerformance,
  useDebounce,
  useThrottle,
  useMemoWithLimit,
  useVirtualScroll,
  useIntersectionObserver,
  usePrefetch,
  useResourceHints
};
