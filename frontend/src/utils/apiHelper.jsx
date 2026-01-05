/**
 * API Helper Utility
 * Centralized API calling functions using config
 * 🚀 OPTIMIZED: Now uses optimizedFetch for instant cache loading
 */

import config from '../config';
import { optimizedFetch } from './apiOptimizer';

/**
 * Makes a GET request to the API with instant cache
 * @param {string} endpoint - API endpoint (e.g., '/theaters')
 * @param {Object} options - Additional fetch options
 * @param {string} cacheKey - Cache key (optional)
 * @param {number} cacheTTL - Cache TTL in ms (default: 2 minutes)
 * @returns {Promise<Response>} - Fetch response with instant cache support
 */
export const apiGet = async (endpoint, options = {}, cacheKey = null, cacheTTL = 120000) => {
  const url = `${config.api.baseUrl}${endpoint}`;
  const key = cacheKey || `api_get_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return optimizedFetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers
    },
    ...options
  }, key, cacheTTL);
};

/**
 * Makes a POST request to the API
 * @param {string} endpoint - API endpoint (e.g., '/theaters')
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const apiPost = async (endpoint, data = {}, options = {}) => {
  const url = `${config.api.baseUrl}${endpoint}`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers
    },
    body: JSON.stringify(data),
    ...options
  });
};

/**
 * Makes a PUT request to the API
 * @param {string} endpoint - API endpoint (e.g., '/theaters/123')
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const apiPut = async (endpoint, data = {}, options = {}) => {
  const url = `${config.api.baseUrl}${endpoint}`;

  return fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers
    },
    body: JSON.stringify(data),
    ...options
  });
};

/**
 * Makes a DELETE request to the API
 * @param {string} endpoint - API endpoint (e.g., '/theaters/123')
 * @param {Object} data - Request body data (optional)
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const apiDelete = async (endpoint, data = null, options = {}) => {
  const url = `${config.api.baseUrl}${endpoint}`;

  const fetchOptions = {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers
    },
    ...options
  };

  // Add body if data is provided
  if (data) {
    fetchOptions.body = JSON.stringify(data);
  }

  return fetch(url, fetchOptions);
};

/**
 * Upload file to API
 * @param {string} endpoint - Upload endpoint (e.g., '/upload/image')
 * @param {FormData} formData - File data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const apiUpload = async (endpoint, formData, options = {}) => {
  const url = `${config.api.baseUrl}${endpoint}`;
  const authHeaders = getAuthHeaders();

  // For large file uploads, use a longer timeout (default: 10 minutes for 200MB files)
  const timeout = options.timeout || 600000; // 10 minutes default
  
  // Create AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...options.headers
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData,
      signal: controller.signal,
      ...options
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle timeout errors
    if (error.name === 'AbortError') {
      throw new Error(`Upload timeout after ${timeout / 1000} seconds. The file may be too large or the connection is slow.`);
    }
    
    // Re-throw other errors
    throw error;
  }
};

/**
 * Get full API URL for an endpoint
 * @param {string} endpoint - API endpoint
 * @returns {string} - Full API URL
 */
export const getApiUrl = (endpoint) => {
  return `${config.api.baseUrl}${endpoint}`;
};

/**
 * Get authentication headers with token
 * ✅ FIXED: Uses centralized token getter for consistency
 * @returns {Object} - Headers object with authorization
 */
export const getAuthHeaders = () => {
  // Use centralized getter which handles multiple key fallbacks
  const token = config.helpers.getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Handle API response and check for authentication errors
 * @param {Response} response - Fetch response
 * @returns {Response} - Same response if OK, or throws error
 */
const handleAuthResponse = async (response) => {
  // Handle 401 Unauthorized - token expired or invalid
  if (response.status === 401) {
    // Try to get error details
    let errorData = {};
    try {
      const text = await response.clone().text();
      if (text) {
        errorData = JSON.parse(text);
      }
    } catch (e) {
      // Ignore parse errors
    }

    // ✅ SINGLE SESSION: Check if session was invalidated
    if (errorData.code === 'SESSION_INVALIDATED') {
      console.warn('⚠️ Session invalidated - user logged in from another device/browser');
    }

    // Clear all authentication data
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    localStorage.removeItem('theaterId');
    localStorage.removeItem('rolePermissions');
    localStorage.removeItem('yqpaynow_token');
    localStorage.removeItem('yqpaynow_user');
    localStorage.removeItem('token');

    // Trigger logout event for other tabs
    localStorage.setItem('logout-event', Date.now().toString());

    // Redirect to login page
    window.location.href = '/login';

    throw new Error(errorData.message || 'Session expired. Please login again.');
  }

  return response;
};

/**
 * Makes an authenticated API request
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body data (for POST/PUT)
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const apiAuthRequest = async (method, endpoint, data = null, options = {}) => {
  const url = `${config.api.baseUrl}${endpoint}`;

  const requestOptions = {
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers
    },
    ...options
  };

  if (data && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put')) {
    requestOptions.body = JSON.stringify(data);
  }

  const response = await fetch(url, requestOptions);
  return handleAuthResponse(response);
};