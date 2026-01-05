/**
 * Offline Storage Utilities
 * Manages localStorage for offline POS functionality
 * - Product caching
 * - Category caching
 * - Order queue management
 * - Data persistence across page reloads
 */

const STORAGE_KEYS = {
  ORDERS_QUEUE: 'offline_orders_queue_',
  PRODUCTS_CACHE: 'offline_products_cache_',
  CATEGORIES_CACHE: 'offline_categories_cache_',
  SYNC_FAILURES: 'offline_sync_failures_',
  LAST_SYNC_TIME: 'offline_last_sync_time_',
  CACHE_TIMESTAMP: 'offline_cache_timestamp_'
};

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_QUEUE_SIZE = 100;

/**
 * Get cache key with theater ID
 */
const getCacheKey = (baseKey, theaterId) => {
  return `${baseKey}${theaterId}`;
};

/**
 * Check if cached data is still valid
 */
const isCacheValid = (timestamp) => {
  if (!timestamp) return false;
  const now = Date.now();
  return (now - timestamp) < CACHE_TTL;
};

// ==================== PRODUCTS CACHING ====================

/**
 * Cache products for a theater
 */
export const cacheProducts = (theaterId, products) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.PRODUCTS_CACHE, theaterId);
    const timestampKey = getCacheKey(STORAGE_KEYS.CACHE_TIMESTAMP, theaterId) + '_products';
    
    localStorage.setItem(key, JSON.stringify(products));
    localStorage.setItem(timestampKey, Date.now().toString());
    
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error caching products:', error);
    return false;
  }
};

/**
 * Get cached products for a theater
 */
export const getCachedProducts = (theaterId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.PRODUCTS_CACHE, theaterId);
    const timestampKey = getCacheKey(STORAGE_KEYS.CACHE_TIMESTAMP, theaterId) + '_products';
    
    const timestamp = parseInt(localStorage.getItem(timestampKey) || '0');
    
    if (!isCacheValid(timestamp)) {
      return null;
    }
    
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const products = JSON.parse(cached);
    return products;
  } catch (error) {
    console.error('[OfflineStorage] Error reading cached products:', error);
    return null;
  }
};

// ==================== IMAGE CACHING ====================

/**
 * Convert image URL to base64 and cache it
 */
export const cacheImageAsBase64 = async (imageUrl) => {
  try {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    
    // Check if already cached
    const cacheKey = `offline_image_${btoa(imageUrl).substring(0, 50)}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return cached;
    }
    
    // If imageUrl is already a data URL (base64), return it directly
    // Don't send large base64 data URLs through proxy as query params (causes 431 error)
    if (imageUrl.startsWith('data:')) {
      try {
        localStorage.setItem(cacheKey, imageUrl);
        return imageUrl;
      } catch (storageError) {
        console.warn('⚠️ [OfflineStorage] Storage quota exceeded:', storageError.message);
        return imageUrl; // Return original URL
      }
    }
    
    
    // For regular URLs, use POST instead of GET to avoid header size limits
    // Use fetch with POST to send URL in body instead of query string
    return fetch('/api/proxy-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: imageUrl }),
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Proxy request failed: ${response.status}`);
      }
      return response.blob();
    })
    .then(blob => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            try {
              // Create canvas to convert to base64
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              // Convert to base64 with compression
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              
              try {
                localStorage.setItem(cacheKey, base64);
                resolve(base64);
              } catch (storageError) {
                console.warn('⚠️ [OfflineStorage] Storage quota exceeded:', storageError.message);
                resolve(imageUrl); // Return original URL
              }
            } catch (canvasError) {
              console.error('❌ [OfflineStorage] Canvas error:', canvasError.message);
              resolve(imageUrl); // Return original URL
            }
          };
          img.onerror = () => {
            console.error(`❌ [OfflineStorage] Failed to load image: ${imageUrl.substring(0, 50)}...`);
            resolve(imageUrl); // Return original URL on error
          };
          img.src = e.target.result;
        };
        reader.onerror = () => {
          console.error(`❌ [OfflineStorage] Failed to read blob: ${imageUrl.substring(0, 50)}...`);
          resolve(imageUrl); // Return original URL on error
        };
        reader.readAsDataURL(blob);
      });
    })
    .catch(error => {
      console.error(`❌ [OfflineStorage] Proxy error: ${error.message}`);
      return imageUrl; // Return original URL on error
    });
  } catch (error) {
    console.error('[OfflineStorage] Error caching image:', error.message);
    return imageUrl; // Return original URL on error
  }
};

/**
 * Get cached image base64
 */
export const getCachedImage = (imageUrl) => {
  try {
    if (!imageUrl) return null;
    const cacheKey = `offline_image_${btoa(imageUrl).substring(0, 50)}`;
    return localStorage.getItem(cacheKey);
  } catch (error) {
    return null;
  }
};

/**
 * Cache all product images
 */
export const cacheProductImages = async (products) => {
  const imagePromises = [];
  let imageCount = 0;
  
  for (const product of products) {
    let imageUrl = null;
    
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
    } else if (product.productImage) {
      imageUrl = product.productImage;
    }
    
    if (imageUrl) {
      imageCount++;
      imagePromises.push(cacheImageAsBase64(imageUrl));
    }
  }
  
  
  try {
    const results = await Promise.allSettled(imagePromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
  } catch (error) {
    console.error('[OfflineStorage] Error caching product images:', error);
  }
};

// ==================== CATEGORIES CACHING ====================

/**
 * Cache categories for a theater
 */
export const cacheCategories = (theaterId, categories) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.CATEGORIES_CACHE, theaterId);
    const timestampKey = getCacheKey(STORAGE_KEYS.CACHE_TIMESTAMP, theaterId) + '_categories';
    
    localStorage.setItem(key, JSON.stringify(categories));
    localStorage.setItem(timestampKey, Date.now().toString());
    
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error caching categories:', error);
    return false;
  }
};

/**
 * Get cached categories for a theater
 */
export const getCachedCategories = (theaterId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.CATEGORIES_CACHE, theaterId);
    const timestampKey = getCacheKey(STORAGE_KEYS.CACHE_TIMESTAMP, theaterId) + '_categories';
    
    const timestamp = parseInt(localStorage.getItem(timestampKey) || '0');
    
    if (!isCacheValid(timestamp)) {
      return null;
    }
    
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const categories = JSON.parse(cached);
    return categories;
  } catch (error) {
    console.error('[OfflineStorage] Error reading cached categories:', error);
    return null;
  }
};

// ==================== ORDER QUEUE MANAGEMENT ====================

/**
 * Add order to offline queue
 */
export const addToOrderQueue = (theaterId, order) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
    const queue = getOrderQueue(theaterId);
    
    // Check queue size limit
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn('⚠️ [OfflineStorage] Order queue full, removing oldest order');
      queue.shift(); // Remove oldest order
    }
    
    // Add timestamp and unique ID
    const queuedOrder = {
      ...order,
      queuedAt: Date.now(),
      queueId: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      syncStatus: 'pending', // pending, syncing, failed, synced
      retryCount: 0
    };
    
    queue.push(queuedOrder);
    localStorage.setItem(key, JSON.stringify(queue));
    
    return queuedOrder;
  } catch (error) {
    console.error('[OfflineStorage] Error adding to order queue:', error);
    return null;
  }
};

/**
 * Get all queued orders for a theater
 */
export const getOrderQueue = (theaterId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
    const cached = localStorage.getItem(key);
    
    if (!cached) return [];
    
    const queue = JSON.parse(cached);
    return Array.isArray(queue) ? queue : [];
  } catch (error) {
    console.error('[OfflineStorage] Error reading order queue:', error);
    return [];
  }
};

/**
 * Remove order from queue (after successful sync)
 */
export const removeFromOrderQueue = (theaterId, queueId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
    let queue = getOrderQueue(theaterId);
    
    queue = queue.filter(order => order.queueId !== queueId);
    localStorage.setItem(key, JSON.stringify(queue));
    
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error removing from queue:', error);
    return false;
  }
};

/**
 * Update order status in queue
 */
export const updateOrderStatus = (theaterId, queueId, status, error = null) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
    const queue = getOrderQueue(theaterId);
    
    const orderIndex = queue.findIndex(order => order.queueId === queueId);
    if (orderIndex === -1) {
      console.warn(`⚠️ [OfflineStorage] Order ${queueId} not found in queue`);
      return false;
    }
    
    queue[orderIndex].syncStatus = status;
    queue[orderIndex].lastSyncAttempt = Date.now();
    if (error) {
      queue[orderIndex].syncError = error;
      // ✅ FIX: Cap retry count at MAX_RETRIES (3) to prevent unbounded growth
      const MAX_RETRIES = 3;
      const currentRetryCount = queue[orderIndex].retryCount || 0;
      if (currentRetryCount < MAX_RETRIES) {
        queue[orderIndex].retryCount = currentRetryCount + 1;
      }
      // If already at max, don't increment further
    }
    
    localStorage.setItem(key, JSON.stringify(queue));
    
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error updating order status:', error);
    return false;
  }
};

/**
 * Get count of pending orders
 */
export const getPendingOrderCount = (theaterId) => {
  const queue = getOrderQueue(theaterId);
  return queue.filter(order => order.syncStatus === 'pending' || order.syncStatus === 'failed').length;
};

/**
 * Clear all queued orders (use with caution!)
 */
export const clearOrderQueue = (theaterId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error clearing queue:', error);
    return false;
  }
};

// ==================== SYNC TRACKING ====================

/**
 * Update last sync time
 */
export const updateLastSyncTime = (theaterId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.LAST_SYNC_TIME, theaterId);
    localStorage.setItem(key, Date.now().toString());
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error updating sync time:', error);
    return false;
  }
};

/**
 * Get last sync time
 */
export const getLastSyncTime = (theaterId) => {
  try {
    const key = getCacheKey(STORAGE_KEYS.LAST_SYNC_TIME, theaterId);
    const timestamp = localStorage.getItem(key);
    return timestamp ? parseInt(timestamp) : null;
  } catch (error) {
    console.error('[OfflineStorage] Error reading sync time:', error);
    return null;
  }
};

// ==================== CACHE CLEANUP ====================

/**
 * Clear all offline data for a theater
 */
export const clearOfflineData = (theaterId) => {
  try {
    Object.values(STORAGE_KEYS).forEach(baseKey => {
      const key = getCacheKey(baseKey, theaterId);
      localStorage.removeItem(key);
      localStorage.removeItem(key + '_products');
      localStorage.removeItem(key + '_categories');
    });
    return true;
  } catch (error) {
    console.error('[OfflineStorage] Error clearing offline data:', error);
    return false;
  }
};

/**
 * Get storage usage statistics
 */
export const getStorageStats = (theaterId) => {
  try {
    const queue = getOrderQueue(theaterId);
    const products = getCachedProducts(theaterId);
    const categories = getCachedCategories(theaterId);
    
    return {
      pendingOrders: queue.length,
      cachedProducts: products ? products.length : 0,
      cachedCategories: categories ? categories.length : 0,
      lastSyncTime: getLastSyncTime(theaterId)
    };
  } catch (error) {
    console.error('[OfflineStorage] Error getting stats:', error);
    return null;
  }
};

export default {
  cacheProducts,
  getCachedProducts,
  cacheCategories,
  getCachedCategories,
  addToOrderQueue,
  getOrderQueue,
  removeFromOrderQueue,
  updateOrderStatus,
  getPendingOrderCount,
  clearOrderQueue,
  updateLastSyncTime,
  getLastSyncTime,
  clearOfflineData,
  getStorageStats
};
