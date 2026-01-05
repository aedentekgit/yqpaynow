/**
 * Centralized API Service for YQPayNow Theater Canteen
 * Handles all API requests with consistent error handling, authentication, and retries
 * Updated to handle MVC response format from backend
 */

import config from '../config';
import { 
  handleMVCResponse, 
  handlePaginatedResponse, 
  handleListResponse, 
  handleItemResponse,
  handleErrorResponse 
} from '../utils/mvcResponseHandler';

class ApiService {
  constructor() {
    this.baseURL = config.api.baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  // Get auth token from localStorage
  // ✅ FIXED: Check multiple keys for backward compatibility and clean token format
  getAuthToken() {
    // Primary key: 'authToken'
    let token = localStorage.getItem('authToken');
    // Fallback: Check other possible keys
    if (!token) {
      token = localStorage.getItem('yqpaynow_token') || localStorage.getItem('token');
      // If found in fallback, migrate to primary key
      if (token) {
        localStorage.setItem('authToken', token);
      }
    }
    
    // ✅ FIX: Clean token to remove any formatting issues
    if (token) {
      // Remove quotes, trim whitespace, ensure it's a valid string
      token = String(token).trim().replace(/^["']|["']$/g, '');
      
      // Validate token format (should have 3 parts separated by dots)
      if (token.split('.').length !== 3) {
        console.warn('⚠️ [apiService] Invalid token format detected');
        return null;
      }
    }
    
    return token;
  }

  // Get auth headers
  getAuthHeaders() {
    const token = this.getAuthToken();
    return {
      ...this.defaultHeaders,
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  // Generic request method with error handling, caching, and deduplication
  async request(endpoint, options = {}, cacheKey = null, cacheTTL = 120000) {
    const url = `${this.baseURL}${endpoint}`;
    const requestConfig = {
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers
        // Note: We don't add X-Skip-Auto-Cache header to avoid CORS issues
        // Instead, we use _skipAutoCache property which withCaching.js checks
      },
      ...options,
      _skipAutoCache: true // Flag for withCaching.js to skip auto-cache (not sent to server)
    };

    // 🚀 PERFORMANCE: Use optimized fetch with caching and deduplication
    try {
      const { optimizedFetch } = await import('../utils/apiOptimizer');
      const cacheKeyFinal = cacheKey || `api_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const response = await optimizedFetch(url, requestConfig, cacheKeyFinal, cacheTTL);
      
      // Handle MVC response format
      return handleMVCResponse(response, { extractData: false });
    } catch (error) {
      // Fallback to regular fetch if optimizer fails
      console.warn('⚠️ [ApiService] Optimizer failed, using regular fetch:', error);
      
      try {
        const response = await fetch(url, requestConfig);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            success: false,
            error: 'Network error', 
            message: response.statusText 
          }));
          
          throw handleErrorResponse(errorData);
        }

        const data = await response.json();
        return handleMVCResponse(data, { extractData: false });
      } catch (fetchError) {
        throw handleErrorResponse(fetchError);
      }
    }
  }

  // GET request - returns full MVC response
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(fullEndpoint, { method: 'GET' });
  }

  // GET request that returns just the data
  async getData(endpoint, params = {}) {
    const response = await this.get(endpoint, params);
    return handleMVCResponse(response, { extractData: true });
  }

  // GET request for paginated data
  async getPaginated(endpoint, params = {}) {
    const response = await this.get(endpoint, params);
    return handlePaginatedResponse(response);
  }

  // GET request for list data (returns array)
  async getList(endpoint, params = {}) {
    const response = await this.get(endpoint, params);
    return handleListResponse(response);
  }

  // GET request for single item
  async getItem(endpoint, params = {}) {
    const response = await this.get(endpoint, params);
    return handleItemResponse(response);
  }

  // POST request
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // POST request that returns just the data
  async postData(endpoint, data = {}) {
    const response = await this.post(endpoint, data);
    return handleMVCResponse(response, { extractData: true });
  }

  // PUT request
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // PUT request that returns just the data
  async putData(endpoint, data = {}) {
    const response = await this.put(endpoint, data);
    return handleMVCResponse(response, { extractData: true });
  }

  // DELETE request
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // DELETE request that returns just the data
  async deleteData(endpoint) {
    const response = await this.delete(endpoint);
    return handleMVCResponse(response, { extractData: true });
  }

  // Upload file
  async upload(endpoint, formData) {
    const token = this.getAuthToken();
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    return this.request(endpoint, {
      method: 'POST',
      body: formData,
      headers // Don't include Content-Type for FormData
    });
  }

  // THEATER ENDPOINTS
  async getTheaters(params = {}) {
    return this.getPaginated('/theaters', params);
  }

  async getTheater(theaterId) {
    return this.getItem(`/theaters/${theaterId}`);
  }

  async createTheater(theaterData) {
    return this.postData('/theaters', theaterData);
  }

  async updateTheater(theaterId, theaterData) {
    return this.putData(`/theaters/${theaterId}`, theaterData);
  }

  async deleteTheater(theaterId) {
    return this.deleteData(`/theaters/${theaterId}`);
  }

  // THEATER DASHBOARD
  async getTheaterDashboard(theaterId) {
    return this.getItem(`/theater-dashboard/${theaterId}`);
  }

  // ROLES ENDPOINTS
  async getRoles(theaterId, params = {}) {
    return this.getPaginated('/roles', { theaterId, ...params });
  }

  async getRole(roleId) {
    return this.getItem(`/roles/${roleId}`);
  }

  async createRole(roleData) {
    return this.postData('/roles', roleData);
  }

  async updateRole(roleId, roleData) {
    return this.putData(`/roles/${roleId}`, roleData);
  }

  async deleteRole(roleId) {
    return this.deleteData(`/roles/${roleId}`);
  }

  // PRODUCTS ENDPOINTS
  async getProducts(theaterId, params = {}) {
    return this.getPaginated(`/theater-products/${theaterId}`, params);
  }

  async getProduct(theaterId, productId) {
    return this.getItem(`/theater-products/${theaterId}/${productId}`);
  }

  async createProduct(theaterId, productData) {
    return this.postData(`/theater-products/${theaterId}`, productData);
  }

  async updateProduct(theaterId, productId, productData) {
    return this.putData(`/theater-products/${theaterId}/${productId}`, productData);
  }

  async deleteProduct(theaterId, productId) {
    return this.deleteData(`/theater-products/${theaterId}/${productId}`);
  }

  // ORDERS ENDPOINTS
  async getOrders(params = {}) {
    return this.getPaginated('/orders', params);
  }

  async getOrdersByTheater(theaterId, params = {}) {
    return this.getPaginated(`/orders/theater/${theaterId}`, params);
  }

  async getOrder(theaterId, orderId) {
    return this.getItem(`/orders/theater/${theaterId}/${orderId}`);
  }

  async createOrder(orderData) {
    return this.postData('/orders/theater', orderData);
  }

  async updateOrderStatus(theaterId, orderId, status) {
    return this.putData(`/orders/theater/${theaterId}/${orderId}/status`, { status });
  }

  // STOCK ENDPOINTS
  async getStock(theaterId, params = {}) {
    // Stock endpoint can be /theater-stock/:theaterId or /theater-stock/:theaterId/:productId
    const { productId, ...otherParams } = params;
    const endpoint = productId 
      ? `/theater-stock/${theaterId}/${productId}`
      : `/theater-stock/${theaterId}`;
    // 🔥 FIX: Use getData instead of getPaginated - stock returns single document, not array
    return this.getData(endpoint, otherParams);
  }

  async createStock(theaterId, stockData) {
    return this.postData(`/theater-stock/${theaterId}`, stockData);
  }

  async updateStock(theaterId, stockId, stockData) {
    return this.putData(`/theater-stock/${theaterId}/${stockId}`, stockData);
  }

  // AUTHENTICATION
  async login(credentials) {
    return this.post('/auth/login', credentials);
  }

  async validateToken() {
    return this.get('/auth/validate');
  }

  // SETTINGS
  async getSettings() {
    return this.get('/settings/general');
  }

  async saveSettings(settings) {
    return this.post('/settings/general', settings);
  }

  // PAGE ACCESS
  async getPageAccess(params = {}) {
    return this.get('/page-access', params);
  }

  async createPageAccess(data) {
    return this.post('/page-access', data);
  }

  // UPLOAD
  async uploadImage(formData) {
    return this.upload('/upload/image', formData);
  }

  async uploadDocument(formData) {
    return this.upload('/upload/theater-document', formData);
  }
}

// Export singleton instance
export default new ApiService();

// Also export the class for testing
export { ApiService };