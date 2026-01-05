/**
 * 🚀 CRUD OPTIMIZER - Instant UI Updates & Smart Cache Management
 * 
 * This utility provides:
 * - Optimistic UI updates for instant feedback
 * - Smart cache invalidation after mutations
 * - Automatic rollback on errors
 * - Request deduplication
 * - Real-time performance tracking
 */

import { clearCachePattern, setCachedData, getCachedData } from './cacheUtils';

/**
 * Performance tracker for CRUD operations
 */
class CRUDPerformanceTracker {
  constructor() {
    this.metrics = {
      create: [],
      update: [],
      delete: [],
      read: []
    };
  }

  track(operation, startTime) {
    const duration = Date.now() - startTime;
    this.metrics[operation].push(duration);
    
    // Keep only last 50 measurements
    if (this.metrics[operation].length > 50) {
      this.metrics[operation].shift();
    }
    
    return duration;
  }

  getAverages() {
    const averages = {};
    Object.keys(this.metrics).forEach(key => {
      const metrics = this.metrics[key];
      if (metrics.length > 0) {
        averages[key] = Math.round(metrics.reduce((a, b) => a + b, 0) / metrics.length);
      } else {
        averages[key] = 0;
      }
    });
    return averages;
  }

  getReport() {
    const averages = this.getAverages();
    return {
      averages,
      totalOperations: Object.values(this.metrics).flat().length,
      operationCounts: {
        create: this.metrics.create.length,
        update: this.metrics.update.length,
        delete: this.metrics.delete.length,
        read: this.metrics.read.length
      }
    };
  }
}

export const performanceTracker = new CRUDPerformanceTracker();

/**
 * Optimistic Create - Add item to UI immediately, then sync with server
 * 
 * @param {Function} apiCall - API function that performs the create
 * @param {Object} tempItem - Temporary item to show in UI
 * @param {Function} onOptimisticUpdate - Callback to update UI immediately
 * @param {Function} onSuccess - Callback after successful API call
 * @param {Function} onError - Callback if API call fails (for rollback)
 * @param {Array<string>} cachePatterns - Cache patterns to invalidate
 * @returns {Promise<Object>} - Created item from server
 */
export const optimisticCreate = async ({
  apiCall,
  tempItem,
  onOptimisticUpdate,
  onSuccess,
  onError,
  cachePatterns = []
}) => {
  const startTime = Date.now();
  
  try {
    // 1. Immediate UI update with temporary ID
    const optimisticItem = {
      ...tempItem,
      _id: `temp_${Date.now()}_${Math.random()}`,
      _optimistic: true,
      _createdAt: new Date().toISOString()
    };
    
    if (onOptimisticUpdate) {
      onOptimisticUpdate(optimisticItem);
    }
    
    // 2. Make API call in background
    const response = await apiCall();
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Create failed');
    }
    
    // 3. Invalidate relevant caches
    cachePatterns.forEach(pattern => {
      clearCachePattern(pattern);
    });
    
    // 4. Replace optimistic item with real data
    const realItem = data.data || data.banner || data.product || data.theater || data;
    if (onSuccess) {
      onSuccess(realItem, optimisticItem._id);
    }
    
    const duration = performanceTracker.track('create', startTime);
    
    return realItem;
    
  } catch (error) {
    console.error('❌ Optimistic Create - Failed, rolling back:', error);
    
    // Rollback optimistic update
    if (onError) {
      onError(error);
    }
    
    throw error;
  }
};

/**
 * Optimistic Update - Update item in UI immediately, then sync with server
 */
export const optimisticUpdate = async ({
  apiCall,
  itemId,
  updates,
  onOptimisticUpdate,
  onSuccess,
  onError,
  cachePatterns = []
}) => {
  const startTime = Date.now();
  let previousState = null;
  
  try {
    // 1. Store previous state for rollback
    if (onOptimisticUpdate) {
      previousState = onOptimisticUpdate(itemId, updates);
    }
    
    // 2. Make API call in background
    const response = await apiCall();
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Update failed');
    }
    
    // 3. Invalidate relevant caches
    cachePatterns.forEach(pattern => {
      clearCachePattern(pattern);
    });
    
    // 4. Confirm with real data from server
    const realItem = data.data || data.banner || data.product || data.theater || data;
    if (onSuccess) {
      onSuccess(realItem);
    }
    
    const duration = performanceTracker.track('update', startTime);
    
    return realItem;
    
  } catch (error) {
    console.error('❌ Optimistic Update - Failed, rolling back:', error);
    
    // Rollback to previous state
    if (onError && previousState) {
      onError(error, previousState);
    }
    
    throw error;
  }
};

/**
 * Optimistic Delete - Remove item from UI immediately, then sync with server
 */
export const optimisticDelete = async ({
  apiCall,
  itemId,
  onOptimisticUpdate,
  onSuccess,
  onError,
  cachePatterns = []
}) => {
  const startTime = Date.now();
  let removedItem = null;
  
  try {
    // 1. Store removed item for potential rollback
    if (onOptimisticUpdate) {
      removedItem = onOptimisticUpdate(itemId);
    }
    
    // 2. Make API call in background
    const response = await apiCall();
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Delete failed');
    }
    
    // 3. Invalidate relevant caches
    cachePatterns.forEach(pattern => {
      clearCachePattern(pattern);
    });
    
    // 4. Confirm deletion
    if (onSuccess) {
      onSuccess();
    }
    
    const duration = performanceTracker.track('delete', startTime);
    
    return true;
    
  } catch (error) {
    console.error('❌ Optimistic Delete - Failed, rolling back:', error);
    
    // Rollback - restore deleted item
    if (onError && removedItem) {
      onError(error, removedItem);
    }
    
    throw error;
  }
};

/**
 * Smart cache invalidation - Invalidates only related caches
 */
export const invalidateRelatedCaches = (entity, theaterId) => {
  const patterns = {
    banner: [
      `theaterBanners_${theaterId}`,
      `api_get_theater-banners_${theaterId}`,
      `fast_fetch_`,
    ],
    product: [
      `theaterProducts_${theaterId}`,
      `api_get_theater-products_${theaterId}`,
      `fast_fetch_`,
    ],
    category: [
      `theaterCategories_${theaterId}`,
      `api_get_categories_${theaterId}`,
      `fast_fetch_`,
    ],
    kioskType: [
      `theaterKioskTypes_${theaterId}`,
      `api_get_kioskTypes_${theaterId}`,
      `fast_fetch_`,
    ],
    productType: [
      `theaterProductTypes_${theaterId}`,
      `api_get_productTypes_${theaterId}`,
      `fast_fetch_`,
    ],
    theater: [
      `theater_${theaterId}`,
      `api_get_theaters`,
      `fast_fetch_`,
    ]
  };
  
  const patternsToInvalidate = patterns[entity] || [];
  
  patternsToInvalidate.forEach(pattern => {
    clearCachePattern(pattern);
  });
};

/**
 * Batch operations - Process multiple CRUD operations efficiently
 */
export const batchOperations = async (operations) => {
  const startTime = Date.now();
  const results = [];
  
  
  // Process all operations in parallel
  const promises = operations.map(async (op) => {
    try {
      let result;
      switch (op.type) {
        case 'create':
          result = await optimisticCreate(op);
          break;
        case 'update':
          result = await optimisticUpdate(op);
          break;
        case 'delete':
          result = await optimisticDelete(op);
          break;
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  const batchResults = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  
  return batchResults;
};

/**
 * Get performance metrics
 */
export const getPerformanceMetrics = () => {
  return performanceTracker.getReport();
};

/**
 * Reset performance tracking
 */
export const resetPerformanceMetrics = () => {
  performanceTracker.metrics = {
    create: [],
    update: [],
    delete: [],
    read: []
  };
};

export default {
  optimisticCreate,
  optimisticUpdate,
  optimisticDelete,
  invalidateRelatedCaches,
  batchOperations,
  getPerformanceMetrics,
  resetPerformanceMetrics,
  performanceTracker
};
