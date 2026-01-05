/**
 * useOfflineQueue Hook
 * React hook for managing offline order queue with auto-sync
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  addToOrderQueue,
  getOrderQueue,
  getPendingOrderCount,
  getLastSyncTime
} from '../utils/offlineStorage';
import {
  startAutoSync,
  stopAutoSync,
  triggerManualSync,
  retryFailedOrders,
  getSyncStatus,
  isOnline,
  testConnectivity
} from '../utils/orderSync';

export const useOfflineQueue = (theaterId, token) => {
  const [queue, setQueue] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  
  const syncIntervalRef = useRef(null);
  const previousConnectionStatusRef = useRef(connectionStatus);

  /**
   * Load queue from localStorage
   */
  const loadQueue = useCallback(() => {
    try {
      if (!theaterId) {
        console.warn('[useOfflineQueue] Cannot load queue: theaterId is missing');
        return;
      }
      
      const currentQueue = getOrderQueue(theaterId);
      setQueue(Array.isArray(currentQueue) ? currentQueue : []);
      setPendingCount(getPendingOrderCount(theaterId));
      
      const lastSync = getLastSyncTime(theaterId);
      setLastSyncTime(lastSync);
      
      const status = getSyncStatus(theaterId);
      setConnectionStatus(status?.isOnline ? 'online' : 'offline');
    } catch (error) {
      console.error('[useOfflineQueue] Error loading queue:', error);
      // Set safe defaults on error
      setQueue([]);
      setPendingCount(0);
    }
  }, [theaterId]);

  /**
   * Add order to queue
   */
  const addOrder = useCallback((order) => {
    try {
      const queuedOrder = addToOrderQueue(theaterId, order);
      loadQueue(); // Reload queue after adding
      return queuedOrder;
    } catch (error) {
      console.error('[useOfflineQueue] Error adding order:', error);
      throw error;
    }
  }, [theaterId, loadQueue]);

  /**
   * Handle sync completion
   */
  const handleSyncComplete = useCallback((result) => {
    setIsSyncing(false);
    setSyncProgress({ current: 0, total: 0 });
    
    if (result.success) {
      setSyncError(null);
      loadQueue(); // Reload queue after successful sync
    } else {
      setSyncError(result.error || result.message);
    }
  }, [loadQueue]);

  /**
   * Handle sync progress updates
   */
  const handleSyncProgress = useCallback((current, total, order) => {
    setSyncProgress({ current, total, order });
  }, []);

  /**
   * Manual sync trigger
   */
  const manualSync = useCallback(async () => {
    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    
    try {
      const result = await triggerManualSync(theaterId, token, handleSyncProgress);
      handleSyncComplete(result);
      return result;
    } catch (error) {
      handleSyncComplete({ success: false, error: error.message });
      throw error;
    }
  }, [theaterId, token, isSyncing, handleSyncProgress, handleSyncComplete]);

  /**
   * Retry failed orders
   */
  const retryFailed = useCallback(async () => {
    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    
    try {
      const result = await retryFailedOrders(theaterId, token, handleSyncProgress);
      handleSyncComplete(result);
      return result;
    } catch (error) {
      handleSyncComplete({ success: false, error: error.message });
      throw error;
    }
  }, [theaterId, token, isSyncing, handleSyncProgress, handleSyncComplete]);

  /**
   * Get current sync status
   */
  const getStatus = useCallback(() => {
    return getSyncStatus(theaterId);
  }, [theaterId]);

  /**
   * Initialize auto-sync on mount
   */
  useEffect(() => {
    // Initial load
    loadQueue();

    // ✅ FIX: Start auto-sync only if we have both theaterId and token
    if (token && theaterId) {
      syncIntervalRef.current = startAutoSync(
        theaterId,
        token,
        handleSyncComplete,
        handleSyncProgress
      );
    } else {
      console.warn('⚠️ [useOfflineQueue] Cannot start auto-sync:', {
        hasToken: !!token,
        hasTheaterId: !!theaterId
      });
    }

    // Cleanup on unmount
    return () => {
      if (syncIntervalRef.current) {
        stopAutoSync(syncIntervalRef.current);
      }
    };
  }, [theaterId, token, loadQueue, handleSyncComplete, handleSyncProgress]);

  /**
   * Monitor online/offline status and trigger immediate sync when connection is restored
   */
  useEffect(() => {
    const updateOnlineStatus = async () => {
      const previousStatus = previousConnectionStatusRef.current;
      const browserOnline = isOnline();
      const currentStatus = browserOnline ? 'online' : 'offline';
      
      // If connection was restored (transitioned from offline to online)
      const wasOffline = previousStatus === 'offline';
      const isNowOnline = currentStatus === 'online';
      
      console.log(`📡 [useOfflineQueue] Connection status update:`, {
        previous: previousStatus,
        current: currentStatus,
        browserOnline,
        wasOffline,
        isNowOnline,
        hasToken: !!token,
        hasTheaterId: !!theaterId
      });
      
      // Update ref and state to track current status
      previousConnectionStatusRef.current = currentStatus;
      setConnectionStatus(currentStatus);
      
      // Trigger immediate sync when connection is restored
      if (wasOffline && isNowOnline && token && theaterId) {
        
        // ✅ FIX: Add small delay to ensure network is fully restored
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify actual connectivity (not just browser status)
        try {
          const isActuallyOnline = await testConnectivity();
          
          if (isActuallyOnline) {
            
            // Check if there are pending orders
            const queue = getOrderQueue(theaterId);
            const pendingOrders = queue.filter(
              order => order.syncStatus === 'pending' || order.syncStatus === 'failed'
            );
            const pendingCount = pendingOrders.length;
            
            
            if (pendingCount > 0) {
              // Trigger immediate sync
              setIsSyncing(true);
              setSyncError(null);
              
              try {
                const result = await triggerManualSync(theaterId, token, handleSyncProgress);
                handleSyncComplete(result);
                console.log(`✅ [useOfflineQueue] Immediate sync completed:`, {
                  synced: result.synced || 0,
                  failed: result.failed || 0,
                  success: result.success,
                  message: result.message,
                  errors: result.errors
                });
                
                // ✅ FIX: Reload queue after sync to update UI
                loadQueue();
              } catch (error) {
                console.error('❌ [useOfflineQueue] Immediate sync failed:', {
                  error: error.message,
                  stack: error.stack
                });
                handleSyncComplete({ success: false, error: error.message });
              }
            } else {
            }
          } else {
            setConnectionStatus('offline'); // Update status to reflect actual connectivity
          }
        } catch (error) {
          console.error('❌ [useOfflineQueue] Error verifying connectivity:', {
            error: error.message,
            stack: error.stack
          });
        }
      }
    };

    // Initial status check
    previousConnectionStatusRef.current = connectionStatus;
    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [theaterId, token, handleSyncProgress, handleSyncComplete, connectionStatus, loadQueue]);

  /**
   * Refresh queue periodically
   */
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      loadQueue();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(refreshInterval);
  }, [loadQueue]);

  return {
    // Queue data
    queue,
    pendingCount,
    lastSyncTime,
    
    // Sync state
    isSyncing,
    syncError,
    syncProgress,
    connectionStatus,
    
    // Actions
    addOrder,
    manualSync,
    retryFailed,
    getStatus,
    refresh: loadQueue
  };
};

export default useOfflineQueue;
