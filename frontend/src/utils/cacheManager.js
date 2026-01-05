// Theater Cache Management Utility

import config from '../config';

export const clearTheaterCache = () => {

  // Clear localStorage
  if (window.localStorage) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.includes('theater') || 
        key.includes('cache_') || 
        key.includes('Theater') ||
        key.includes('/api/theaters') ||
        key.includes('api_get_theaters') ||
        key.includes('fetch_/api/theaters') ||
        key.includes('theaters_list_page_')
      )) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
  });
  }
  
  // Clear sessionStorage (where optimizedFetch stores cache)
  if (window.sessionStorage) {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.includes('theater') || 
        key.includes('cache_') || 
        key.includes('Theater') ||
        key.includes('/api/theaters') ||
        key.includes('api_get_theaters') ||
        key.includes('api_get_/theaters') ||
        key.includes('fetch_/api/theaters') ||
        key.includes('theaters_list_page_')
      )) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
  });
  }
  
  // Clear browser cache for theater-related requests
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.includes('theater') || cacheName.includes('api')) {

            return caches.delete(cacheName);
          }
        })
      );
    }).catch(error => {
  });
  }
  
  };

/**
 * Clear all application caches on logout
 * This function clears all types of caches including:
 * - Theater cache
 * - Data cache store
 * - Session storage caches
 * - Image caches
 * - Browser caches
 * - API response caches
 */
export const clearAllCaches = async () => {
  try {
    // Clear theater cache
    clearTheaterCache();

    // Clear data cache store and theater store (if available)
    try {
      const { useDataCacheStore, useTheaterStore } = await import('../stores/optimizedStores');
      useDataCacheStore.getState().clearCache();
      useTheaterStore.getState().clearTheaters();
    } catch (error) {
      // Store might not be available, ignore
    }

    // Clear all sessionStorage caches (API responses, etc.)
    if (window.sessionStorage) {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        // Keep only logout-event, remove everything else
        if (key && key !== 'logout-event') {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        sessionStorage.removeItem(key);
      });
    }

    // Clear image caches
    try {
      const { clearAllImageCache } = await import('./globalImageCache');
      clearAllImageCache();
    } catch (error) {
      // Image cache utility might not be available, try alternative
      try {
        const { clearImageCache } = await import('./imageCacheUtils');
        clearImageCache();
      } catch (e) {
        // Both image cache utilities unavailable, clear manually
        if (window.localStorage) {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('image_cache_') ||
              key.startsWith('img_cache_') ||
              key.includes('_image_')
            )) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => {
            localStorage.removeItem(key);
          });
        }
      }
    }

    // Clear browser caches (Cache API)
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      } catch (error) {
        // Ignore cache API errors
      }
    }

    // Clear localStorage caches (except auth-related items which are handled separately)
    if (window.localStorage) {
      const keysToRemove = [];
      const authKeys = ['authToken', 'user', 'userType', 'theaterId', 'rolePermissions', 'logout-event'];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !authKeys.includes(key)) {
          // Remove cache-related keys
          if (
            key.includes('cache_') ||
            key.includes('_cache') ||
            key.startsWith('api_') ||
            key.startsWith('fetch_') ||
            key.includes('yqpay-') ||
            key.includes('theater') ||
            key.includes('product') ||
            key.includes('stock') ||
            key.includes('order') ||
            key.includes('payment')
          ) {
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
    }

  } catch (error) {
    console.error('⚠️ Error clearing caches on logout:', error);
    // Don't throw - cache clearing should not block logout
  }
};

export const addCacheBuster = (url) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_cacheBuster=${Date.now()}&_random=${Math.random()}`;
};

export default {
  clearTheaterCache,
  clearAllCaches,
  addCacheBuster
};