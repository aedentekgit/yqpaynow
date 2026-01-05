/**
 * 🎯 THEATER UPDATES HOOK
 * 
 * Provides a simple way for components to listen to theater updates
 * and automatically refresh when theaters are changed elsewhere in the app
 */

import { useEffect, useRef, useMemo } from 'react';
import { useTheaterStore } from '../stores/optimizedStores';

/**
 * Hook to listen to theater updates and trigger a callback
 * 
 * @param {Function} onUpdate - Callback function when theaters are updated
 * @param {Object} options - Options
 * @param {boolean} options.immediate - Call onUpdate immediately on mount (default: false)
 * @param {string} options.eventType - Event type to listen to: 'theater-updated', 'theaters-updated', 'theater-deleted', 'theater-added' (default: 'theaters-updated')
 */
export const useTheaterUpdates = (onUpdate, options = {}) => {
  const { immediate = false, eventType = 'theaters-updated' } = options;
  const callbackRef = useRef(onUpdate);
  const store = useTheaterStore();

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    // Get the appropriate event listener method
    const onMethodMap = {
      'theater-updated': store.onTheaterUpdate,
      'theaters-updated': store.onTheatersUpdate,
      'theater-deleted': store.onTheaterDelete,
      'theater-added': store.onTheaterAdd
    };

    const offMethodMap = {
      'theater-updated': store.offTheaterUpdate,
      'theaters-updated': store.offTheatersUpdate,
      'theater-deleted': store.offTheaterDelete,
      'theater-added': store.offTheaterAdd
    };

    const onMethod = onMethodMap[eventType];
    const offMethod = offMethodMap[eventType];

    if (!onMethod || !offMethod) {
      console.warn(`[useTheaterUpdates] Invalid event type: ${eventType}`);
      return;
    }

    // Wrapper callback to use ref
    const callback = (data) => {
      if (callbackRef.current) {
        callbackRef.current(data);
      }
    };

    // Register listener
    onMethod(callback);

    // Call immediately if requested
    if (immediate && onUpdate) {
      const theaters = store.theaters;
      onUpdate({ theaters, timestamp: Date.now() });
    }

    // Cleanup
    return () => {
      offMethod(callback);
    };
  }, [eventType, immediate, store, onUpdate]);
};

/**
 * Hook to get theaters and automatically update when they change
 * 
 * @param {Object} options - Options
 * @param {Function} options.filter - Filter function to filter theaters
 * @param {boolean} options.activeOnly - Only return active theaters (default: false)
 * @returns {Array} - Array of theaters
 */
export const useTheaters = (options = {}) => {
  const { filter, activeOnly = false } = options;
  const theaters = useTheaterStore(state => state.theaters);
  const updateCount = useTheaterStore(state => state.updateCount); // Subscribe to updates

  return useMemo(() => {
    let result = theaters;

    if (activeOnly) {
      result = result.filter(theater => theater.isActive !== false);
    }

    if (filter) {
      result = result.filter(filter);
    }

    return result;
  }, [theaters, updateCount, activeOnly, filter]);
};

/**
 * Hook to get a single theater by ID and automatically update when it changes
 * 
 * @param {string} theaterId - Theater ID
 * @returns {Object|null} - Theater object or null
 */
export const useTheater = (theaterId) => {
  const theater = useTheaterStore(state => state.theaterMap[theaterId] || null);
  const updateCount = useTheaterStore(state => state.updateCount); // Subscribe to updates
  
  return theater;
};

export default {
  useTheaterUpdates,
  useTheaters,
  useTheater
};
