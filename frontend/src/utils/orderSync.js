/**
 * Order Sync Utility
 * Handles automatic syncing of offline orders to server
 * - Connectivity checking every 1 second
 * - Automatic upload when online
 * - Retry logic with exponential backoff
 * - Batch order processing
 */

import config from '../config/index';
import {
  getOrderQueue,
  removeFromOrderQueue,
  updateOrderStatus,
  updateLastSyncTime
} from './offlineStorage';

// Storage key constant (matches offlineStorage)
const STORAGE_KEYS = {
  ORDERS_QUEUE: 'offline_orders_queue_'
};

// Helper to get cache key (matches offlineStorage pattern)
const getCacheKey = (baseKey, theaterId) => {
  return `${baseKey}${theaterId}`;
};

const SYNC_INTERVAL = 1000; // 1 second (1000ms) - syncs every second when online
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // Exponential backoff: 2s, 4s, 8s

/**
 * Check if browser is online
 */
export const isOnline = () => {
  return navigator.onLine;
};

/**
 * Test actual network connectivity (not just browser status)
 */
export const testConnectivity = async () => {
  try {
    // Try to reach the API server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(`${config.api.baseUrl}/health`, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache'
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
};

/**
 * Transform queued order format to backend API format
 */
const transformOrderForBackend = (queuedOrder) => {
  // Transform items: convert 'product' to 'productId' and 'price' to 'unitPrice'
  const transformedItems = (queuedOrder.items || []).map(item => ({
    productId: item.productId || item.product, // Support both formats
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice || item.price || item.sellingPrice || 0, // Support multiple formats
    taxRate: item.taxRate || 0,
    gstType: item.gstType || 'EXCLUDE',
    discountPercentage: item.discountPercentage || 0,
    specialInstructions: item.specialInstructions || item.notes || '',
    // Include optional fields
    ...(item.originalQuantity && { originalQuantity: item.originalQuantity }),
    ...(item.size && { size: item.size }),
    ...(item.productSize && { productSize: item.productSize }),
    ...(item.sizeLabel && { sizeLabel: item.sizeLabel }),
    ...(item.variant && { variant: item.variant })
  }));

  // Build the order payload in the format expected by backend
  const orderPayload = {
    theaterId: queuedOrder.theaterId,
    customerName: queuedOrder.customerName || 'POS Customer',
    items: transformedItems,
    paymentMethod: queuedOrder.paymentMethod || 'cash',
    orderType: queuedOrder.orderType || 'pos',
    source: queuedOrder.source || 'offline-pos',
    subtotal: queuedOrder.subtotal || 0,
    tax: queuedOrder.tax || 0,
    total: queuedOrder.total || 0,
    totalDiscount: queuedOrder.totalDiscount || 0,
    orderNotes: queuedOrder.notes || queuedOrder.orderNotes || ''
  };

  // Include optional fields if present
  if (queuedOrder.qrName) orderPayload.qrName = queuedOrder.qrName;
  if (queuedOrder.seat) orderPayload.seat = queuedOrder.seat;

  return orderPayload;
};

/**
 * Upload single order to server
 */
export const uploadOrder = async (order, token) => {
  try {
    // ✅ FIX: Check if token is available
    if (!token) {
      const errorMsg = 'Authentication token is missing. Please login again.';
      console.error(`❌ [OrderSync] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // ✅ FIX: Transform queued order format to backend API format
    const transformedOrder = transformOrderForBackend(order);
    
    console.log(`🔄 [OrderSync] Uploading order ${order.queueId}...`, {
      originalItems: order.items?.length || 0,
      transformedItems: transformedOrder.items?.length || 0,
      theaterId: transformedOrder.theaterId,
      hasToken: !!token
    });
    
    // ✅ FIX: Log the transformed order for debugging (first 500 chars)
    const orderPreview = JSON.stringify(transformedOrder).substring(0, 500);
    
    const response = await fetch(`${config.api.baseUrl}/orders/theater`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transformedOrder)
    });

    // ✅ FIX: Get response text first to handle both JSON and non-JSON errors
    const responseText = await response.text();
    let errorData = {};
    
    try {
      errorData = JSON.parse(responseText);
    } catch (e) {
      // If response is not JSON, use the text as error message
      errorData = { message: responseText || `HTTP ${response.status}` };
    }

    if (!response.ok) {
      const errorMessage = errorData.message || errorData.error || errorData.details?.[0]?.msg || `HTTP ${response.status}`;
      
      // ✅ FIX: Check if it's a database connection error (500 with connection message)
      const isDatabaseError = 
        response.status === 500 && (
          errorMessage.includes('Database connection') ||
          errorMessage.includes('not available') ||
          errorMessage.includes('Connection was force closed') ||
          errorMessage.includes('MongoNotConnectedError') ||
          errorMessage.includes('MongooseError')
        );
      
      if (isDatabaseError) {
        // Don't log as error - it's a temporary DB issue
        console.warn(`⚠️ [OrderSync] Database connection error for order ${order.queueId}, will retry when connection is restored`);
        throw new Error('Database connection error - will retry when connection is restored');
      }
      
      console.error(`❌ [OrderSync] Upload failed for order ${order.queueId}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        details: errorData.details || errorData,
        responsePreview: responseText.substring(0, 200)
      });
      throw new Error(errorMessage);
    }

    const data = JSON.parse(responseText);
    
    if (data.success) {
      console.log(`✅ [OrderSync] Order ${order.queueId} uploaded successfully`, {
        orderId: data.order?._id || data.order?.orderNumber || 'unknown'
      });
      return { success: true, data: data.order };
    } else {
      const errorMsg = data.message || 'Order upload failed';
      console.error(`❌ [OrderSync] Order ${order.queueId} upload returned success=false:`, errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error(`❌ [OrderSync] Upload failed for order ${order.queueId}:`, {
      error: error.message,
      stack: error.stack,
      orderQueueId: order.queueId
    });
    return { success: false, error: error.message };
  }
};

/**
 * Sync all pending orders for a theater
 */
export const syncPendingOrders = async (theaterId, token, onProgress) => {
  try {
    // ✅ FIX: Check token first
    if (!token) {
      console.error('❌ [OrderSync] Cannot sync: Authentication token is missing');
      return { success: false, message: 'Authentication token is missing. Please login again.' };
    }

    // Check connectivity first
    const online = await testConnectivity();
    if (!online) {
      console.warn('⚠️ [OrderSync] Cannot sync: No internet connection');
      return { success: false, message: 'No internet connection' };
    }

    
    const queue = getOrderQueue(theaterId);
    const pendingOrders = queue.filter(
      order => order.syncStatus === 'pending' || order.syncStatus === 'failed'
    );


    if (pendingOrders.length === 0) {
      return { success: true, synced: 0 };
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < pendingOrders.length; i++) {
      const order = pendingOrders[i];

      // ✅ FIX: Reset retry count if it's unreasonably high (likely a bug)
      // This allows orders that got stuck with high retry counts to be synced again
      if (order.retryCount > MAX_RETRIES) {
        const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
        const currentQueue = getOrderQueue(theaterId);
        const orderIndex = currentQueue.findIndex(o => o.queueId === order.queueId);
        if (orderIndex !== -1) {
          currentQueue[orderIndex].retryCount = 0;
          currentQueue[orderIndex].syncStatus = 'pending';
          currentQueue[orderIndex].syncError = null;
          localStorage.setItem(key, JSON.stringify(currentQueue));
          // Update the order object for this iteration
          order.retryCount = 0;
          order.syncStatus = 'pending';
        }
      }

      // Check if order has exceeded max retries (after reset check)
      if (order.retryCount >= MAX_RETRIES) {
        console.warn(`⚠️ [OrderSync] Order ${order.queueId} exceeded max retries (${order.retryCount}), will retry after reset`);
        // Don't skip - reset and try again
        const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
        const currentQueue = getOrderQueue(theaterId);
        const orderIndex = currentQueue.findIndex(o => o.queueId === order.queueId);
        if (orderIndex !== -1) {
          currentQueue[orderIndex].retryCount = 0;
          currentQueue[orderIndex].syncStatus = 'pending';
          currentQueue[orderIndex].syncError = null;
          localStorage.setItem(key, JSON.stringify(currentQueue));
          order.retryCount = 0;
          order.syncStatus = 'pending';
        }
      }

      // Update UI with progress
      if (onProgress) {
        onProgress(i + 1, pendingOrders.length, order);
      }

      // Update status to syncing
      updateOrderStatus(theaterId, order.queueId, 'syncing');

      // Attempt upload
      const result = await uploadOrder(order, token);

      if (result.success) {
        // Remove from queue on success
        removeFromOrderQueue(theaterId, order.queueId);
        successCount++;
      } else {
        // Mark as failed, will retry next sync
        const errorMsg = result.error || 'Unknown error';
        
        // ✅ FIX: Check if it's a database connection error
        const isDatabaseError = errorMsg.includes('Database connection') || 
                                errorMsg.includes('not available') ||
                                errorMsg.includes('Connection was force closed') ||
                                errorMsg.includes('will retry when connection is restored');
        
        // ✅ FIX: Get current retry count before updating
        const currentRetryCount = order.retryCount || 0;
        
        // ✅ FIX: For database errors, don't increment retry count - will retry when DB is ready
        // For other errors, only increment if less than MAX_RETRIES
        if (isDatabaseError) {
          // Database error - don't increment retry count, just mark as pending for retry
          const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
          const currentQueue = getOrderQueue(theaterId);
          const orderIndex = currentQueue.findIndex(o => o.queueId === order.queueId);
          if (orderIndex !== -1) {
            currentQueue[orderIndex].syncStatus = 'pending'; // Keep as pending for retry
            currentQueue[orderIndex].syncError = errorMsg;
            currentQueue[orderIndex].lastSyncAttempt = Date.now();
            // Don't increment retryCount for DB errors
            localStorage.setItem(key, JSON.stringify(currentQueue));
          }
          console.warn(`⚠️ [OrderSync] Database connection error for order ${order.queueId}, will retry when DB is ready`);
        } else if (currentRetryCount < MAX_RETRIES) {
          // Other errors - increment retry count normally
          updateOrderStatus(theaterId, order.queueId, 'failed', errorMsg);
        } else {
          // Don't increment retry count if already at max, just update status
          const key = getCacheKey(STORAGE_KEYS.ORDERS_QUEUE, theaterId);
          const currentQueue = getOrderQueue(theaterId);
          const orderIndex = currentQueue.findIndex(o => o.queueId === order.queueId);
          if (orderIndex !== -1) {
            currentQueue[orderIndex].syncStatus = 'failed';
            currentQueue[orderIndex].syncError = errorMsg;
            currentQueue[orderIndex].lastSyncAttempt = Date.now();
            // Don't increment retryCount if already at max
            localStorage.setItem(key, JSON.stringify(currentQueue));
          }
        }
        
        failCount++;
        errors.push(`Order ${order.queueId}: ${errorMsg}`);
        console.error(`❌ [OrderSync] Failed to sync order ${order.queueId}: ${errorMsg} (retry count: ${currentRetryCount})`);

        // Wait before next retry (exponential backoff) - only for non-DB errors
        if (!isDatabaseError && currentRetryCount < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[currentRetryCount];
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (isDatabaseError) {
          // For DB errors, wait a bit longer before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    // Update last sync time
    updateLastSyncTime(theaterId);

    const result = {
      success: failCount === 0,
      synced: successCount,
      failed: failCount,
      message: `${successCount} orders synced successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
      errors: errors.length > 0 ? errors : undefined
    };

    return result;
  } catch (error) {
    console.error('❌ [OrderSync] Sync process error:', {
      error: error.message,
      stack: error.stack,
      theaterId
    });
    return { success: false, error: error.message };
  }
};

/**
 * Start automatic sync timer
 */
export const startAutoSync = (theaterId, token, onSyncComplete, onProgress) => {

  const syncInterval = setInterval(async () => {
    try {
      // Only sync if online
      if (!isOnline()) {
        return;
      }

      const queue = getOrderQueue(theaterId);
      const pendingCount = queue.filter(
        order => order.syncStatus === 'pending' || order.syncStatus === 'failed'
      ).length;

      if (pendingCount > 0) {
        const result = await syncPendingOrders(theaterId, token, onProgress);
        
        if (onSyncComplete) {
          onSyncComplete(result);
        }
      }
    } catch (error) {
      console.error('[OrderSync] Auto-sync error:', error);
    }
  }, SYNC_INTERVAL);

  return syncInterval;
};

/**
 * Stop automatic sync timer
 */
export const stopAutoSync = (syncInterval) => {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
};

/**
 * Manual sync trigger
 */
export const triggerManualSync = async (theaterId, token, onProgress) => {
  return await syncPendingOrders(theaterId, token, onProgress);
};

/**
 * Retry failed orders
 */
export const retryFailedOrders = async (theaterId, token, onProgress) => {
  try {
    const queue = getOrderQueue(theaterId);
    const failedOrders = queue.filter(order => order.syncStatus === 'failed');

    if (failedOrders.length === 0) {
      return { success: true, retried: 0 };
    }

    // ✅ FIX: Reset retry count and status for failed orders
    failedOrders.forEach(order => {
      // Reset retry count by updating the order directly
      const key = getCacheKey('offline_orders_queue_', theaterId);
      const currentQueue = getOrderQueue(theaterId);
      const orderIndex = currentQueue.findIndex(o => o.queueId === order.queueId);
      if (orderIndex !== -1) {
        currentQueue[orderIndex].syncStatus = 'pending';
        currentQueue[orderIndex].retryCount = 0; // Reset retry count
        currentQueue[orderIndex].syncError = null; // Clear error
        localStorage.setItem(key, JSON.stringify(currentQueue));
      }
    });

    // Attempt sync again
    return await syncPendingOrders(theaterId, token, onProgress);
  } catch (error) {
    console.error('[OrderSync] Retry failed orders error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get sync status summary
 */
export const getSyncStatus = (theaterId) => {
  const queue = getOrderQueue(theaterId);
  
  return {
    total: queue.length,
    pending: queue.filter(o => o.syncStatus === 'pending').length,
    syncing: queue.filter(o => o.syncStatus === 'syncing').length,
    failed: queue.filter(o => o.syncStatus === 'failed').length,
    isOnline: isOnline()
  };
};

export default {
  isOnline,
  testConnectivity,
  uploadOrder,
  syncPendingOrders,
  startAutoSync,
  stopAutoSync,
  triggerManualSync,
  retryFailedOrders,
  getSyncStatus
};
