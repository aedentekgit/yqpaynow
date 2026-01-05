import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import config from '../config';
import { apiGet, getApiUrl } from '../utils/apiHelper';

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// 🚀 OPTIMIZED: Memoized provider
export const SettingsProvider = React.memo(({ children }) => {
  const [generalSettings, setGeneralSettings] = useState({
    applicationName: config.app.name,
    environment: config.app.environment,
    defaultCurrency: config.ui.currency,
    timezone: config.ui.defaultTimezone,
    browserTabTitle: config.app.name,
    dateFormat: config.ui.dateFormat,
    timeFormat: '12hour',
    languageRegion: 'en-IN'
  });

  const [loading, setLoading] = useState(true);

  // ✅ FIX: Standalone favicon update function (doesn't depend on useCallback)
  const setFaviconImmediate = (logoUrl) => {
    try {
      if (!logoUrl || logoUrl === 'undefined' || logoUrl === 'null' || logoUrl.includes('undefined') || logoUrl.includes('null')) {
        return;
      }

      // Remove all existing favicon links first
      const faviconSelectors = [
        'link[rel="icon"]',
        'link[rel="shortcut icon"]', 
        'link[rel="apple-touch-icon"]',
        'link[rel="apple-touch-icon-precomposed"]',
        'link[type="image/x-icon"]'
      ];
      
      faviconSelectors.forEach(selector => {
        const links = document.querySelectorAll(selector);
        links.forEach(link => link.remove());
      });

      // Create cache-busted URL for force refresh
      const cacheBustUrl = `${logoUrl}?t=${Date.now()}&cb=${Math.random()}`;

      // Add multiple favicon link types for maximum browser compatibility
      const faviconTypes = [
        { rel: 'shortcut icon', type: 'image/x-icon', sizes: null },
        { rel: 'icon', type: 'image/png', sizes: '16x16' },
        { rel: 'icon', type: 'image/png', sizes: '32x32' },
        { rel: 'icon', type: 'image/png', sizes: '48x48' },
        { rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180' }
      ];

      faviconTypes.forEach(({ rel, type, sizes }) => {
        const link = document.createElement('link');
        link.rel = rel;
        link.type = type;
        link.href = cacheBustUrl;
        if (sizes) link.sizes = sizes;
        document.head.appendChild(link);
      });
    } catch (e) {
      console.warn('Failed to set favicon:', e);
    }
  };

  // ✅ FIX: Load favicon IMMEDIATELY on mount (synchronously, before async API call)
  useEffect(() => {
    // Set favicon immediately from localStorage if available (synchronous, instant)
    try {
      const savedSettings = localStorage.getItem('generalSettings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        document.title = parsedSettings.browserTabTitle || parsedSettings.applicationName || 'YQPayNow Theater Canteen';
        
        // ✅ FIX: Update favicon IMMEDIATELY from localStorage (synchronous, no async delay)
        if (parsedSettings.logoUrl && parsedSettings.logoUrl !== 'undefined' && parsedSettings.logoUrl !== 'null' && !parsedSettings.logoUrl.startsWith('data:')) {
          const logoApiUrl = getApiUrl('/settings/image/logo');
          if (logoApiUrl && !logoApiUrl.includes('undefined') && !logoApiUrl.includes('null')) {
            // Call setFaviconImmediate immediately (synchronously, no dependency on updateFavicon)
            setFaviconImmediate(logoApiUrl);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load favicon from localStorage:', e);
    }
  }, []); // Run once on mount

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Try localStorage first for immediate loading
        const savedSettings = localStorage.getItem('generalSettings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          setGeneralSettings(parsedSettings);
          document.title = parsedSettings.browserTabTitle || parsedSettings.applicationName || 'YQPayNow Theater Canteen';
          
          // ✅ FIX: Update favicon immediately from localStorage if logo exists and is valid
          if (parsedSettings.logoUrl && parsedSettings.logoUrl !== 'undefined' && parsedSettings.logoUrl !== 'null' && !parsedSettings.logoUrl.startsWith('data:')) {
            const logoApiUrl = getApiUrl('/settings/image/logo');
            if (logoApiUrl && !logoApiUrl.includes('undefined') && !logoApiUrl.includes('null')) {
              updateFavicon(logoApiUrl);
            }
          }
        }

        // Then try to load from API
        const response = await apiGet('/settings/general');
        if (response.ok) {
          const result = await response.json();

          // ✅ FIX: Handle the updated response format - data directly (no nested config)
          const config = result.data || {};

          if (config && Object.keys(config).length > 0) {
            setGeneralSettings(config);
            document.title = config.browserTabTitle || config.applicationName || config.companyName || 'YQPayNow Theater Canteen';
            localStorage.setItem('generalSettings', JSON.stringify(config));
            
            // Update favicon if logo is set and valid
            if (config.logoUrl && config.logoUrl !== 'undefined' && config.logoUrl !== 'null') {
              const logoApiUrl = getApiUrl('/settings/image/logo');
              if (logoApiUrl && !logoApiUrl.includes('undefined') && !logoApiUrl.includes('null')) {
                updateFavicon(logoApiUrl);
              }
            }
          }
        }
      } catch (error) {
  } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // 🚀 OPTIMIZED: Memoized update favicon function (defined first for use in updateSettings)
  // 🔄 IMPROVED: More reliable favicon update that works across all pages
  const updateFavicon = useCallback((logoUrl) => {
    try {
      // ✅ FIX: Check if logoUrl is valid before proceeding
      if (!logoUrl || logoUrl === 'undefined' || logoUrl === 'null' || logoUrl.includes('undefined') || logoUrl.includes('null')) {
        return;
      }

      // ✅ FIX: Prevent duplicate favicon updates
      const lastFaviconUrl = window.__lastFaviconUrl;
      if (lastFaviconUrl === logoUrl) {
        // Same URL, skip update to prevent duplicate requests
        return;
      }
      window.__lastFaviconUrl = logoUrl;

      // Remove all existing favicon links first
      const faviconSelectors = [
        'link[rel="icon"]',
        'link[rel="shortcut icon"]', 
        'link[rel="apple-touch-icon"]',
        'link[rel="apple-touch-icon-precomposed"]',
        'link[type="image/x-icon"]'
      ];
      
      faviconSelectors.forEach(selector => {
        const links = document.querySelectorAll(selector);
        links.forEach(link => link.remove());
      });

      // Create cache-busted URL for force refresh
      const cacheBustUrl = `${logoUrl}?t=${Date.now()}&cb=${Math.random()}`;

      // ✅ FIX: Add error handler to favicon links to suppress connection errors
      const createFaviconLink = (rel, type, sizes) => {
        const link = document.createElement('link');
        link.rel = rel;
        link.type = type;
        link.href = cacheBustUrl;
        if (sizes) link.sizes = sizes;
        
        // ✅ FIX: Suppress error events to prevent console spam when backend is down
        link.addEventListener('error', (e) => {
          // Silently handle favicon load errors - don't spam console
          e.preventDefault();
          e.stopPropagation();
        }, { once: true, passive: true });
        
        document.head.appendChild(link);
        return link;
      };

      // Add multiple favicon link types for maximum browser compatibility
      const faviconTypes = [
        { rel: 'shortcut icon', type: 'image/x-icon', sizes: null },
        { rel: 'icon', type: 'image/png', sizes: '16x16' },
        { rel: 'icon', type: 'image/png', sizes: '32x32' },
        { rel: 'icon', type: 'image/png', sizes: '48x48' },
        { rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180' }
      ];

      faviconTypes.forEach(({ rel, type, sizes }) => {
        createFaviconLink(rel, type, sizes);
      });

      // Force browser to reload favicon by briefly setting a transparent pixel
      // This tricks browsers into refreshing the favicon cache
      setTimeout(() => {
        const tempLink = document.createElement('link');
        tempLink.rel = 'icon';
        tempLink.href = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
        document.head.appendChild(tempLink);
        
        setTimeout(() => {
          tempLink.remove();
          // Re-add the final favicon link
          const finalLink = document.createElement('link');
          finalLink.rel = 'icon';
          finalLink.type = 'image/png';
          finalLink.href = cacheBustUrl;
          document.head.appendChild(finalLink);
        }, 50);
      }, 50);

      // Also update manifest.json icon if present
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        // Manifest icons are updated separately, but we ensure favicon is set
      }
    } catch (error) {
      // Silent fail - don't break app if favicon update fails
      console.warn('⚠️ [SettingsContext] Favicon update error:', error.message);
    }
  }, []);

  // 🚀 OPTIMIZED: Memoized update settings function
  const updateSettings = useCallback((newSettings) => {
    setGeneralSettings(prev => {
      const updatedSettings = { ...prev, ...newSettings };
      localStorage.setItem('generalSettings', JSON.stringify(updatedSettings));
      
      if (newSettings.browserTabTitle) {
        document.title = newSettings.browserTabTitle;
      }
      
      if (newSettings.logoUrl) {
        updateFavicon(getApiUrl('/settings/image/logo'));
      }
      
      return updatedSettings;
    });
  }, [updateFavicon]);


  // 🚀 OPTIMIZED: Memoized format date function
  const formatDate = useCallback((date, customFormat = null) => {
    if (!date) return '';
    
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    
    const format = customFormat || generalSettings.dateFormat;
    
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesLong = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
    
    switch (format) {
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'DD MMM YYYY':
        return `${day} ${monthNames[dateObj.getMonth()]} ${year}`;
      case 'MMM DD, YYYY':
        return `${monthNames[dateObj.getMonth()]} ${day}, ${year}`;
      default:
        return `${day}/${month}/${year}`;
    }
  }, [generalSettings.dateFormat]);

  // 🚀 OPTIMIZED: Memoized format time function
  const formatTime = useCallback((date, customFormat = null) => {
    if (!date) return '';
    
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid Time';
    
    const format = customFormat || generalSettings.timeFormat;
    
    if (format === '24hour') {
      return dateObj.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else {
      return dateObj.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    }
  }, [generalSettings.timeFormat]);

  // 🚀 OPTIMIZED: Memoized format currency function
  const formatCurrency = useCallback((amount, customCurrency = null) => {
    if (amount === null || amount === undefined) return '';
    
    const currency = customCurrency || generalSettings.defaultCurrency;
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount)) return 'Invalid Amount';
    
    const currencySymbols = {
      'INR': '₹',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };
    
    const symbol = currencySymbols[currency] || currency;
    
    // Format with locale-specific number formatting
    const formattedNumber = numAmount.toLocaleString(generalSettings.languageRegion, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return `${symbol}${formattedNumber}`;
  }, [generalSettings.defaultCurrency, generalSettings.languageRegion]);

  // 🚀 OPTIMIZED: Memoized helper functions
  const getCurrencySymbol = useCallback((currency = null) => {
    const curr = currency || generalSettings.defaultCurrency;
    const symbols = { 'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£' };
    return symbols[curr] || curr;
  }, [generalSettings.defaultCurrency]);

  const getDateFormatExample = useCallback((format = null) => {
    const fmt = format || generalSettings.dateFormat;
    const exampleDate = new Date(2024, 11, 31);
    return formatDate(exampleDate, fmt);
  }, [generalSettings.dateFormat, formatDate]);

  // 🚀 OPTIMIZED: Memoized context value
  const contextValue = useMemo(() => ({
    generalSettings,
    updateSettings,
    updateFavicon,
    loading,
    formatDate,
    formatTime,
    formatCurrency,
    getCurrencySymbol,
    getDateFormatExample,
  }), [generalSettings, updateSettings, updateFavicon, loading, formatDate, formatTime, formatCurrency, getCurrencySymbol, getDateFormatExample]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
});

SettingsProvider.displayName = 'SettingsProvider';

export default SettingsContext;
