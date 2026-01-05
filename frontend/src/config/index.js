/**
 * Frontend Global Configuration
 * Centralizes all frontend environment variables
 * Any new component automatically uses these settings
 */

// Smart API URL detection - uses current hostname DYNAMICALLY
const getApiBaseUrl = () => {
  // Vite uses import.meta.env instead of process.env
  // Environment variables must start with VITE_
  const env = import.meta.env;

  // If environment variable is set and not empty, use it
  if (env.VITE_API_URL && env.VITE_API_URL.trim() !== '') {
    return env.VITE_API_URL;
  }

  // In development, use relative path to leverage Vite proxy
  // Vite proxy is configured to forward /api requests to http://localhost:8080
  if (env.MODE === 'development' || env.DEV) {
    return '/api';
  }

  // In production, detect based on current window location at runtime
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // Use the same hostname as the frontend for the API
  const dynamicUrl = `${protocol}//${hostname}/api`;

  return dynamicUrl;
};

// Vite environment variables must start with VITE_
const config = {
  // ==============================================
  // API CONFIGURATION
  // ==============================================
  api: {
    // Use getter to make baseUrl dynamic - evaluated on each access
    get baseUrl() {
      return getApiBaseUrl();
    },
    timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
    retryAttempts: parseInt(import.meta.env.VITE_API_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(import.meta.env.VITE_API_RETRY_DELAY) || 1000
  },

  // ==============================================
  // APP CONFIGURATION
  // ==============================================
  app: {
    name: import.meta.env.VITE_APP_NAME || 'YQPayNow',
    version: import.meta.env.VITE_APP_VERSION || '1.0.0',
    environment: import.meta.env.MODE || 'development',
    isDevelopment: import.meta.env.DEV || import.meta.env.MODE === 'development',
    isProduction: import.meta.env.PROD || import.meta.env.MODE === 'production',
    publicUrl: import.meta.env.VITE_APP_BASE_URL || import.meta.env.BASE_URL || ''
  },

  // ==============================================
  // BRANDING & THEME
  // ==============================================
  branding: {
    primaryColor: import.meta.env.VITE_PRIMARY_COLOR || '#6B0E9B',
    secondaryColor: import.meta.env.VITE_SECONDARY_COLOR || '#F3F4F6',
    logoUrl: import.meta.env.VITE_LOGO_URL || '/logo.png',
    faviconUrl: import.meta.env.VITE_FAVICON_URL || '/favicon.ico',
    companyName: import.meta.env.VITE_COMPANY_NAME || 'YQPayNow'
  },

  // ==============================================
  // AUTHENTICATION
  // ==============================================
  auth: {
    tokenKey: import.meta.env.VITE_TOKEN_KEY || 'yqpaynow_token',
    refreshTokenKey: import.meta.env.VITE_REFRESH_TOKEN_KEY || 'yqpaynow_refresh_token',
    userKey: import.meta.env.VITE_USER_KEY || 'yqpaynow_user',
    sessionTimeout: parseInt(import.meta.env.VITE_SESSION_TIMEOUT) || 3600000, // 1 hour
    autoLogoutWarning: parseInt(import.meta.env.VITE_AUTO_LOGOUT_WARNING) || 300000 // 5 minutes
  },

  // ==============================================
  // PAYMENT GATEWAYS
  // ==============================================
  payment: {
    stripe: {
      publicKey: import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_...',
      elements: {
        appearance: {
          theme: 'stripe'
        }
      }
    },
    paypal: {
      clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || '',
      currency: import.meta.env.VITE_PAYPAL_CURRENCY || 'USD'
    },
    razorpay: {
      keyId: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
      currency: import.meta.env.VITE_RAZORPAY_CURRENCY || 'INR'
    }
  },

  // ==============================================
  // EXTERNAL SERVICES
  // ==============================================
  external: {
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    googleAnalyticsId: import.meta.env.VITE_GOOGLE_ANALYTICS_ID || '',
    facebookAppId: import.meta.env.VITE_FACEBOOK_APP_ID || '',
    twitterHandle: import.meta.env.VITE_TWITTER_HANDLE || '@yqpaynow'
  },

  // ==============================================
  // PRINTING CONFIGURATION
  // ==============================================
  printing: {
    // WebSocket URL for silent printing
    // In development: ws://localhost:17388/
    // In production: Use VITE_PRINT_WS_URL or auto-detect from current hostname
    get wsUrl() {
      const env = import.meta.env;

      // If explicitly set via environment variable, use it
      if (env.VITE_PRINT_WS_URL && env.VITE_PRINT_WS_URL.trim() !== '') {
        return env.VITE_PRINT_WS_URL.trim();
      }

      // ALWAYS use localhost for print server
      // The .exe middleware runs on the user's local machine,
      // even when accessing the website from the cloud
      return 'ws://localhost:17388/';
    },
    // Enable silent printing (falls back to browser print if WebSocket unavailable)
    enabled: import.meta.env.VITE_ENABLE_SILENT_PRINT !== 'false',
    // Connection timeout in milliseconds
    connectionTimeout: parseInt(import.meta.env.VITE_PRINT_CONNECTION_TIMEOUT) || 5000,
    // Reconnect delay in milliseconds
    reconnectDelay: parseInt(import.meta.env.VITE_PRINT_RECONNECT_DELAY) || 2000,
    // Max reconnect attempts
    maxReconnectAttempts: parseInt(import.meta.env.VITE_PRINT_MAX_RECONNECT) || 3
  },

  // ==============================================
  // PERFORMANCE SETTINGS
  // ==============================================
  performance: {
    enableServiceWorker: import.meta.env.VITE_ENABLE_SERVICE_WORKER !== 'false',
    enableLazyLoading: import.meta.env.VITE_ENABLE_LAZY_LOADING !== 'false',
    imageOptimization: import.meta.env.VITE_ENABLE_IMAGE_OPTIMIZATION !== 'false',
    cacheTimeout: parseInt(import.meta.env.VITE_CACHE_TIMEOUT) || 300000, // 5 minutes
    maxCacheSize: parseInt(import.meta.env.VITE_MAX_CACHE_SIZE) || 50, // MB
    enableVirtualScrolling: import.meta.env.VITE_ENABLE_VIRTUAL_SCROLLING === 'true'
  },

  // ==============================================
  // UI/UX SETTINGS
  // ==============================================
  ui: {
    defaultLanguage: import.meta.env.VITE_DEFAULT_LANGUAGE || 'en',
    supportedLanguages: import.meta.env.VITE_SUPPORTED_LANGUAGES ?
      import.meta.env.VITE_SUPPORTED_LANGUAGES.split(',') : ['en', 'es', 'hi'],
    defaultTimezone: import.meta.env.VITE_DEFAULT_TIMEZONE || 'UTC',
    dateFormat: import.meta.env.VITE_DATE_FORMAT || 'MM/DD/YYYY',
    timeFormat: import.meta.env.VITE_TIME_FORMAT || '12', // 12 or 24 hour
    currency: import.meta.env.VITE_CURRENCY || 'USD',
    currencySymbol: import.meta.env.VITE_CURRENCY_SYMBOL || '$'
  },

  // ==============================================
  // FEATURE FLAGS
  // ==============================================
  features: {
    enableQROrdering: import.meta.env.VITE_ENABLE_QR_ORDERING !== 'false',
    enableMultiplePayments: import.meta.env.VITE_ENABLE_MULTIPLE_PAYMENTS !== 'false',
    enableRealtimeUpdates: import.meta.env.VITE_ENABLE_REALTIME_UPDATES === 'true',
    enablePushNotifications: import.meta.env.VITE_ENABLE_PUSH_NOTIFICATIONS === 'true',
    enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS !== 'false',
    enableFeedback: import.meta.env.VITE_ENABLE_FEEDBACK !== 'false',
    enableChat: import.meta.env.VITE_ENABLE_CHAT === 'true',
    enableMaintenance: import.meta.env.VITE_MAINTENANCE_MODE === 'true'
  },

  // ==============================================
  // DEVELOPMENT SETTINGS
  // ==============================================
  development: {
    enableDebugMode: import.meta.env.VITE_DEBUG_MODE === 'true',
    enableConsoleLogging: import.meta.env.VITE_CONSOLE_LOGGING !== 'false',
    enablePerformanceLogging: import.meta.env.VITE_PERFORMANCE_LOGGING === 'true',
    enableErrorReporting: import.meta.env.VITE_ERROR_REPORTING !== 'false',
    mockApiDelay: parseInt(import.meta.env.VITE_MOCK_API_DELAY) || 0
  },

  // ==============================================
  // SECURITY SETTINGS
  // ==============================================
  security: {
    enableCSP: import.meta.env.VITE_ENABLE_CSP !== 'false',
    enableHTTPS: import.meta.env.VITE_ENABLE_HTTPS === 'true',
    enableSameSiteCookies: import.meta.env.VITE_ENABLE_SAMESITE_COOKIES !== 'false',
    sessionStoragePrefix: import.meta.env.VITE_SESSION_PREFIX || 'yqpaynow_',
    encryptLocalStorage: import.meta.env.VITE_ENCRYPT_LOCAL_STORAGE === 'true'
  }
};

/**
 * Helper functions for configuration access
 */
config.helpers = {
  // Get full API URL
  getApiUrl: (endpoint = '') => `${config.api.baseUrl}${endpoint}`,

  // Check if environment is development
  isDev: () => config.app.isDevelopment,

  // Check if environment is production
  isProd: () => config.app.isProduction,

  // Check if feature is enabled
  isFeatureEnabled: (feature) => config.features[feature] || false,

  // Get authentication token from storage
  // ✅ FIXED: Standardized on 'authToken' key for consistency
  // Checks multiple keys for backward compatibility, but 'authToken' is primary
  getAuthToken: () => {
    // Primary key: 'authToken' (used by AuthContext, apiService, withCaching)
    let primaryToken = localStorage.getItem('authToken');
    if (primaryToken) {
      // ✅ FIX: Clean token format
      primaryToken = String(primaryToken).trim().replace(/^["']|["']$/g, '');
      // Validate format (should have 3 parts)
      if (primaryToken.split('.').length === 3) {
        return primaryToken;
      }
    }

    // Fallback: Check other possible keys for migration
    let fallbackToken = localStorage.getItem(config.auth.tokenKey) || localStorage.getItem('token');
    if (fallbackToken) {
      // ✅ FIX: Clean token format
      fallbackToken = String(fallbackToken).trim().replace(/^["']|["']$/g, '');
      // Validate format before migrating
      if (fallbackToken.split('.').length === 3) {
        // Migrate to primary key for consistency
        localStorage.setItem('authToken', fallbackToken);
        return fallbackToken;
      }
    }

    return null;
  },

  // Set authentication token in storage
  // ✅ FIXED: Always use 'authToken' as primary key for consistency
  setAuthToken: (token) => {
    // ✅ FIX: Clean token before storing (remove quotes, trim whitespace)
    const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');

    // Validate token format (should have 3 parts separated by dots)
    if (cleanToken.split('.').length !== 3) {
      console.error('❌ [config] Invalid token format, not storing');
      return;
    }

    // Store in primary key
    localStorage.setItem('authToken', cleanToken);
    // Also store in config key for backward compatibility (if different)
    if (config.auth.tokenKey !== 'authToken') {
      localStorage.setItem(config.auth.tokenKey, cleanToken);
    }
  },

  // Remove authentication token from storage
  // ✅ FIXED: Remove from all possible token keys
  removeAuthToken: () => {
    // Remove from primary key
    localStorage.removeItem('authToken');
    // Remove from config key (if different)
    if (config.auth.tokenKey !== 'authToken') {
      localStorage.removeItem(config.auth.tokenKey);
    }
    // Remove from legacy keys
    localStorage.removeItem('token');
    localStorage.removeItem(config.auth.refreshTokenKey);
    localStorage.removeItem(config.auth.userKey);
  },

  // Get user data from storage
  getUserData: () => {
    const userData = localStorage.getItem(config.auth.userKey);
    return userData ? JSON.parse(userData) : null;
  },

  // Set user data in storage
  setUserData: (user) => localStorage.setItem(config.auth.userKey, JSON.stringify(user)),

  // Format currency
  formatCurrency: (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: config.ui.currency
    }).format(amount);
  },

  // Format date
  formatDate: (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(date));
  }
};

// Log configuration in development
if (config.app.isDevelopment && config.development.enableConsoleLogging) {
}

export default config;
