import { useRef, useCallback } from 'react';

/**
 * Creates a stable callback that doesn't change on re-renders
 * Useful for preventing unnecessary useEffect triggers
 */
export const useStableCallback = (callback) => {
  const callbackRef = useRef(callback);
  
  // Update ref when callback changes
  callbackRef.current = callback;
  
  // Return stable function
  return useCallback((...args) => {
    return callbackRef.current(...args);
  }, []);
};

/**
 * Prevents unnecessary re-renders by only updating when values actually change
 */
export const useStableValue = (value, compareFn = (a, b) => a === b) => {
  const ref = useRef(value);
  const stableRef = useRef(value);
  
  if (!compareFn(ref.current, value)) {
    ref.current = value;
    stableRef.current = value;
  }
  
  return stableRef.current;
};

/**
 * Prevents API calls from being triggered multiple times
 */
export const useApiCallGuard = () => {
  const pendingCallsRef = useRef(new Set());
  const lastCallTimeRef = useRef({});
  
  return useCallback((key, fn, minInterval = 100) => {
    const now = Date.now();
    const lastCall = lastCallTimeRef.current[key] || 0;
    
    // If already pending, skip
    if (pendingCallsRef.current.has(key)) {
      return Promise.resolve(null);
    }
    
    // If called too recently, skip
    if (now - lastCall < minInterval) {
      return Promise.resolve(null);
    }
    
    // Mark as pending
    pendingCallsRef.current.add(key);
    lastCallTimeRef.current[key] = now;
    
    // Execute and clean up
    return Promise.resolve(fn())
      .finally(() => {
        pendingCallsRef.current.delete(key);
      });
  }, []);
};

