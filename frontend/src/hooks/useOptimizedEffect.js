import { useEffect, useRef } from 'react';

/**
 * Optimized useEffect that only triggers when dependencies actually change
 * Prevents unnecessary re-renders and API calls
 */
export const useOptimizedEffect = (callback, dependencies, options = {}) => {
  const {
    compareFn = (prev, curr) => {
      // Deep comparison for objects/arrays
      if (typeof prev !== typeof curr) return false;
      if (typeof prev !== 'object' || prev === null || curr === null) {
        return prev === curr;
      }
      if (Array.isArray(prev) !== Array.isArray(curr)) return false;
      if (Array.isArray(prev)) {
        if (prev.length !== curr.length) return false;
        return prev.every((val, idx) => val === curr[idx]);
      }
      const prevKeys = Object.keys(prev).sort();
      const currKeys = Object.keys(curr).sort();
      if (prevKeys.length !== currKeys.length) return false;
      return prevKeys.every(key => prev[key] === curr[key]);
    },
    skipInitial = false
  } = options;

  const prevDepsRef = useRef(dependencies);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip first render if requested
    if (skipInitial && isFirstRender.current) {
      isFirstRender.current = false;
      prevDepsRef.current = dependencies;
      return;
    }

    // Check if dependencies actually changed
    const hasChanged = dependencies.some((dep, index) => {
      const prevDep = prevDepsRef.current[index];
      return !compareFn(prevDep, dep);
    });

    if (hasChanged || isFirstRender.current) {
      isFirstRender.current = false;
      prevDepsRef.current = dependencies;
      callback();
    }
  }, dependencies);
};

/**
 * Prevents API calls from being triggered multiple times in quick succession
 */
export const useThrottledEffect = (callback, delay, dependencies) => {
  const timeoutRef = useRef(null);
  const lastCallRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallRef.current;

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, call immediately
      lastCallRef.current = now;
      callback();
    } else {
      // Schedule call for later
      const remainingTime = delay - timeSinceLastCall;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        callback();
      }, remainingTime);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, dependencies);
};

/**
 * Tracks previous values and only triggers callback when specific values change
 */
export const useValueChangeEffect = (callback, values, watchKeys = null) => {
  const prevValuesRef = useRef({});

  useEffect(() => {
    const keysToWatch = watchKeys || Object.keys(values);
    let hasChanged = false;

    for (const key of keysToWatch) {
      const prevValue = prevValuesRef.current[key];
      const currentValue = values[key];

      if (prevValue !== currentValue) {
        hasChanged = true;
        break;
      }
    }

    if (hasChanged || Object.keys(prevValuesRef.current).length === 0) {
      prevValuesRef.current = { ...values };
      callback();
    }
  }, Object.values(values));
};

