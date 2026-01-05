import { useState, useCallback } from 'react';

/**
 * Custom React Hook for Data Synchronization
 * Use this in any component to access sync functionality
 */
export const useSyncUtility = () => {
  const [syncStatus, setSyncStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  /**
   * Get overall sync status
   */
  const getSyncStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/status`);
      const data = await response.json();
      
      if (data.success) {
        setSyncStatus(data.data);
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  /**
   * Verify data consistency
   */
  const verifyConsistency = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });
      
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  /**
   * Auto-fix all inconsistencies
   */
  const autoFixAll = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/fix-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh sync status after fix
        await getSyncStatus();
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, getSyncStatus]);

  /**
   * Force sync a specific ProductType
   */
  const syncProductType = useCallback(async (productTypeId) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/product-type/${productTypeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh sync status after sync
        await getSyncStatus();
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, getSyncStatus]);

  /**
   * Sync products with their ProductTypes
   */
  const syncProducts = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh sync status after sync
        await getSyncStatus();
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, getSyncStatus]);

  /**
   * Force sync a specific Category
   */
  const syncCategory = useCallback(async (categoryId) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/category/${categoryId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh sync status after sync
        await getSyncStatus();
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, getSyncStatus]);

  /**
   * Sync products with their Categories
   */
  const syncCategories = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh sync status after sync
        await getSyncStatus();
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, getSyncStatus]);

  /**
   * Verify Category consistency
   */
  const verifyCategoryConsistency = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/sync/verify-categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });
      
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  /**
   * Preview what changes would be made without actually changing anything
   */
  const previewSync = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const report = await verifyConsistency(options);
      
      return {
        totalProducts: report.totalChecked,
        alreadySynced: report.summary.consistent,
        needsUpdate: report.summary.inconsistent,
        orphaned: report.summary.orphaned,
        changes: report.inconsistencies.map(issue => ({
          productId: issue.productId,
          changes: [
            !issue.differences.name.match && {
              field: 'name',
              current: issue.differences.name.product,
              newValue: issue.differences.name.productType
            },
            !issue.differences.quantity.match && {
              field: 'quantity',
              current: issue.differences.quantity.product, 
              newValue: issue.differences.quantity.productType
            },
            !issue.differences.image.match && {
              field: 'image',
              current: issue.differences.image.product ? 'Has image' : 'No image',
              newValue: issue.differences.image.productType ? 'New image' : 'No image'
            }
          ].filter(Boolean)
        })).filter(item => item.changes.length > 0)
      };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [verifyConsistency]);

  /**
   * Quick sync - verify and fix if needed
   */
  const quickSync = useCallback(async (options = {}) => {
    try {
      const report = await verifyConsistency(options);
      
      if (report.inconsistencies.length > 0 || report.orphanedProducts.length > 0) {
        const fixResult = await autoFixAll(options);
        return {
          hadIssues: true,
          issuesFound: report.inconsistencies.length + report.orphanedProducts.length,
          issuesFixed: fixResult.fixesApplied,
          message: fixResult.message
        };
      } else {
        return {
          hadIssues: false,
          message: 'All data is already in sync'
        };
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [verifyConsistency, autoFixAll]);

  return {
    // State
    syncStatus,
    isLoading,
    error,
    
    // Actions
    getSyncStatus,
    verifyConsistency,
    previewSync,
    autoFixAll,
    syncProductType,
    syncProducts,
    syncCategory,
    syncCategories,
    verifyCategoryConsistency,
    quickSync,
    
    // Utility
    clearError: () => setError(null)
  };
};