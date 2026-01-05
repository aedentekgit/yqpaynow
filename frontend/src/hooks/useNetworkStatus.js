import { useState, useEffect } from 'react';
import config from '../config';

/**
 * Custom hook to detect network connectivity and API availability
 * Returns network status, API availability, and utility functions
 */
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isApiAvailable, setIsApiAvailable] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  // Check if the browser reports being online
  useEffect(() => {
    const handleOnline = () => {

      setIsOnline(true);
      checkApiAvailability(); // Verify API when coming back online
    };

    const handleOffline = () => {

      setIsOnline(false);
      setIsApiAvailable(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Function to check if API is actually reachable
  const checkApiAvailability = async () => {
    if (!isOnline) {
      setIsApiAvailable(false);
      return false;
    }

    try {
      // Try to ping the API with a simple request - use dynamic config URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      // Use the dynamic config.api.baseUrl which auto-detects the hostname
      const apiUrl = `${config.api.baseUrl}/settings/general`;

      const response = await fetch(apiUrl, {
        method: 'HEAD', // Use HEAD to minimize data transfer
        signal: controller.signal,
        cache: 'no-cache'
      });

      clearTimeout(timeoutId);
      
      const available = response.ok;
      setIsApiAvailable(available);
      setLastChecked(new Date());
      

      return available;
    } catch (error) {

      setIsApiAvailable(false);
      setLastChecked(new Date());
      return false;
    }
  };

  // Check API availability on mount
  useEffect(() => {
    checkApiAvailability();
  }, [isOnline]);

  // Helper function to determine if we should show offline UI
  const shouldShowOfflineUI = () => {
    return !isOnline || !isApiAvailable;
  };

  // Helper function to handle fetch errors and determine if they're network-related
  const isNetworkError = (error) => {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const networkErrorPatterns = [
      'fetch',
      'network',
      'connection',
      'timeout',
      'abort',
      'cors',
      'failed to fetch',
      'networkerror',
      'type error'
    ];

    return networkErrorPatterns.some(pattern => errorMessage.includes(pattern));
  };

  // Helper function to handle HTTP errors and determine if they should trigger offline mode
  const isServerError = (status) => {
    // Consider 5xx errors as server issues that should show offline UI
    // 4xx errors are client errors (like authentication) and should show normal error
    return status >= 500;
  };

  return {
    isOnline,
    isApiAvailable,
    lastChecked,
    shouldShowOfflineUI: shouldShowOfflineUI(),
    checkApiAvailability,
    isNetworkError,
    isServerError
  };
};

export default useNetworkStatus;