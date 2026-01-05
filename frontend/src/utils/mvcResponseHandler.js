/**
 * MVC Response Handler Utility
 * Handles consistent response format from MVC backend controllers
 * 
 * Backend MVC Response Format:
 * - Success: { success: true, message: '...', data: {...}, pagination: {...} }
 * - Error: { success: false, error: '...', message: '...' }
 */

/**
 * Handle MVC API response and extract data
 * @param {Object} response - The API response object
 * @param {Object} options - Options for handling the response
 * @returns {Object} - Extracted data with standardized format
 */
export const handleMVCResponse = (response, options = {}) => {
  const {
    extractData = true, // Whether to extract just the data or return full response
    defaultData = null, // Default value if data is missing
    throwOnError = true, // Whether to throw on error response
    logErrors = true // Whether to log errors
  } = options;

  // Check if response is null or undefined
  if (!response) {
    if (logErrors) {
      console.error('❌ [MVC Response Handler] Response is null or undefined');
    }
    if (throwOnError) {
      throw new Error('No response received from server');
    }
    return extractData ? defaultData : { success: false, data: defaultData };
  }

  // Handle error responses
  if (response.success === false || !response.success) {
    const errorMessage = response.error || response.message || 'An error occurred';
    
    if (logErrors) {
      console.error('❌ [MVC Response Handler] Error response:', errorMessage, response);
    }
    
    if (throwOnError) {
      throw new Error(errorMessage);
    }
    
    return extractData ? defaultData : {
      success: false,
      error: errorMessage,
      message: response.message,
      data: defaultData
    };
  }

  // Handle success responses
  if (response.success === true) {
    const data = response.data !== undefined ? response.data : response;
    const pagination = response.pagination || null;
    const message = response.message || 'Success';

    if (extractData) {
      // Return just the data, or data with pagination if it exists
      if (pagination) {
        return { data, pagination, message };
      }
      return data;
    }

    // Return full response structure
    return {
      success: true,
      message,
      data,
      pagination
    };
  }

  // Handle unexpected response format (legacy support)
  if (logErrors) {
    console.warn('⚠️ [MVC Response Handler] Unexpected response format:', response);
  }

  // Try to extract data from various possible structures
  if (response.data !== undefined) {
    return extractData ? response.data : response;
  }

  // Return response as-is if no data field
  return extractData ? (response || defaultData) : response;
};

/**
 * Handle paginated MVC response
 * @param {Object} response - The API response object
 * @returns {Object} - { items: [], pagination: {}, message: '' }
 */
export const handlePaginatedResponse = (response) => {
  const result = handleMVCResponse(response, { extractData: false, throwOnError: false });
  
  if (!result.success) {
    return {
      items: [],
      pagination: {
        current: 1,
        limit: 10,
        total: 0,
        totalItems: 0,
        pages: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      },
      message: result.error || 'Failed to fetch data'
    };
  }

  // Extract items from various possible structures
  let items = [];
  if (Array.isArray(result.data)) {
    items = result.data;
  } else if (result.data && Array.isArray(result.data.items)) {
    items = result.data.items;
  } else if (result.data && Array.isArray(result.data.data)) {
    items = result.data.data;
  } else if (result.data && result.data.roles) {
    items = result.data.roles; // For roles endpoint
  } else if (result.data && result.data.theaters) {
    items = result.data.theaters; // For theaters endpoint
  } else if (result.data && result.data.products) {
    items = result.data.products; // For products endpoint
  } else if (result.data && result.data.orders) {
    items = result.data.orders; // For orders endpoint
  } else if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    // If data is an object but not an array, try to find array values
    const dataKeys = Object.keys(result.data);
    const arrayKey = dataKeys.find(key => Array.isArray(result.data[key]));
    if (arrayKey) {
      items = result.data[arrayKey];
    } else {
      // If no array found, log warning and return empty array
      console.warn('⚠️ [MVC Response Handler] No array found in paginated response data:', result.data);
    }
  } else if (!result.data) {
    // If data is missing, log warning
    console.warn('⚠️ [MVC Response Handler] No data field in paginated response:', result);
  }

  // Normalize pagination to ensure both field name variations exist
  const pagination = result.pagination || result.data?.pagination || {};
  const normalizedPagination = {
    current: pagination.current || pagination.page || 1,
    limit: pagination.limit || pagination.perPage || 10,
    total: pagination.total || pagination.totalItems || items.length,
    totalItems: pagination.totalItems || pagination.total || items.length,
    pages: pagination.pages || pagination.totalPages || Math.ceil((pagination.total || pagination.totalItems || items.length) / (pagination.limit || 10)),
    totalPages: pagination.totalPages || pagination.pages || Math.ceil((pagination.total || pagination.totalItems || items.length) / (pagination.limit || 10)),
    hasNext: pagination.hasNext !== undefined ? pagination.hasNext : false,
    hasPrev: pagination.hasPrev !== undefined ? pagination.hasPrev : false
  };

  return {
    items,
    pagination: normalizedPagination,
    message: result.message || 'Success'
  };
};

/**
 * Handle list response (for endpoints that return arrays)
 * @param {Object} response - The API response object
 * @returns {Array} - Array of items
 */
export const handleListResponse = (response) => {
  const data = handleMVCResponse(response, { extractData: true, defaultData: [] });
  
  if (Array.isArray(data)) {
    return data;
  }
  
  // Try to extract array from nested structures
  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  
  if (data && Array.isArray(data.data)) {
    return data.data;
  }
  
  if (data && Array.isArray(data.roles)) {
    return data.roles;
  }
  
  if (data && Array.isArray(data.theaters)) {
    return data.theaters;
  }
  
  console.warn('⚠️ [MVC Response Handler] Expected array but got:', data);
  return [];
};

/**
 * Handle single item response
 * @param {Object} response - The API response object
 * @returns {Object|null} - Single item or null
 */
export const handleItemResponse = (response) => {
  const data = handleMVCResponse(response, { extractData: true, defaultData: null });
  return data;
};

/**
 * Handle error response
 * @param {Error|Object} error - Error object or response
 * @returns {Object} - Standardized error object
 */
export const handleErrorResponse = (error) => {
  if (error instanceof Error) {
    return {
      success: false,
      error: error.message,
      message: error.message
    };
  }
  
  if (error && typeof error === 'object') {
    return {
      success: false,
      error: error.error || error.message || 'An error occurred',
      message: error.message || error.error || 'An error occurred',
      details: error.details || null
    };
  }
  
  return {
    success: false,
    error: 'An unknown error occurred',
    message: 'An unknown error occurred'
  };
};

/**
 * Check if response is successful
 * @param {Object} response - The API response object
 * @returns {Boolean} - True if response is successful
 */
export const isSuccessResponse = (response) => {
  return response && response.success === true;
};

/**
 * Check if response has pagination
 * @param {Object} response - The API response object
 * @returns {Boolean} - True if response has pagination
 */
export const hasPagination = (response) => {
  return response && response.pagination && typeof response.pagination === 'object';
};

