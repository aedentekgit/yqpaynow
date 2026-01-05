import React, { useState, useEffect } from 'react';
import { useSyncUtility } from '../hooks/useSyncUtility';
import '../styles/components/SyncPanel.css';

/**
 * Reusable Sync Panel Component
 * Drop this into any page to add sync functionality
 */
export const SyncPanel = ({ 
  theaterId = null, 
  productTypeId = null, 
  autoLoad = true,
  showDetails = true,
  compact = false 
}) => {
  const {
    syncStatus,
    isLoading,
    error,
    getSyncStatus,
    verifyConsistency,
    autoFixAll,
    syncProductType,
    quickSync,
    clearError
  } = useSyncUtility();

  const [showReport, setShowReport] = useState(false);
  const [lastReport, setLastReport] = useState(null);

  useEffect(() => {
    if (autoLoad) {
      getSyncStatus();
    }
  }, [autoLoad, getSyncStatus]);

  const handleQuickSync = async () => {
    try {
      const result = await quickSync({ theaterId, productTypeId });
      alert(result.message);
    } catch (error) {
  }
  };

  const handleVerify = async () => {
    try {
      const report = await verifyConsistency({ theaterId, productTypeId });
      setLastReport(report);
      setShowReport(true);
    } catch (error) {
  }
  };

  const handleAutoFix = async () => {
    try {
      const result = await autoFixAll({ theaterId, productTypeId });
      alert(`Fixed ${result.fixesApplied} inconsistencies`);
    } catch (error) {
  }
  };

  const handleSyncProductType = async () => {
    if (!productTypeId) {
      alert('ProductType ID is required for this operation');
      return;
    }
    
    try {
      const result = await syncProductType(productTypeId);
      alert(`Synced ${result.productsUpdated} products for ${result.productTypeName}`);
    } catch (error) {
  }
  };

  if (compact) {
    return (
      <div className="sync-panel compact">
        <div className="sync-actions">
          <button 
            onClick={handleQuickSync} 
            disabled={isLoading}
            className="quick-sync-btn"
          >
            {isLoading ? '⏳' : '🔄'} Quick Sync
          </button>
          
          {syncStatus && (
            <div className="sync-indicator">
              {syncStatus.overall.syncPercentage === 100 ? (
                <span className="status-good">✅ In Sync</span>
              ) : (
                <span className="status-warning">⚠️ {syncStatus.overall.syncPercentage}% Synced</span>
              )}
            </div>
          )}
        </div>
        
        {error && (
          <div className="error-message">
            ❌ {error}
            <button onClick={clearError}>×</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sync-panel">
      <div className="sync-header">
        <h3>🔄 Data Synchronization</h3>
        <button onClick={getSyncStatus} disabled={isLoading}>
          {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
          <button onClick={clearError}>×</button>
        </div>
      )}

      {syncStatus && showDetails && (
        <div className="sync-status">
          <div className="status-overview">
            <div className="stat-card">
              <div className="stat-value">{syncStatus.overall.totalProducts}</div>
              <div className="stat-label">Total Products</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{syncStatus.overall.consistent}</div>
              <div className="stat-label">In Sync</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{syncStatus.overall.inconsistent}</div>
              <div className="stat-label">Out of Sync</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{syncStatus.overall.syncPercentage}%</div>
              <div className="stat-label">Sync Rate</div>
            </div>
          </div>
        </div>
      )}

      <div className="sync-actions">
        <button 
          onClick={handleQuickSync} 
          disabled={isLoading}
          className="primary-btn"
        >
          🚀 Quick Sync (Verify + Fix)
        </button>
        
        <button 
          onClick={handleVerify} 
          disabled={isLoading}
          className="secondary-btn"
        >
          🔍 Verify Only
        </button>
        
        <button 
          onClick={handleAutoFix} 
          disabled={isLoading}
          className="secondary-btn"
        >
          🔧 Fix All Issues
        </button>
        
        {productTypeId && (
          <button 
            onClick={handleSyncProductType} 
            disabled={isLoading}
            className="secondary-btn"
          >
            🎯 Sync This ProductType
          </button>
        )}
      </div>

      {showReport && lastReport && (
        <div className="sync-report">
          <div className="report-header">
            <h4>📊 Verification Report</h4>
            <button onClick={() => setShowReport(false)}>×</button>
          </div>
          
          <div className="report-summary">
            <p>✅ Consistent: {lastReport.summary.consistent}</p>
            <p>⚠️ Inconsistent: {lastReport.summary.inconsistent}</p>
            <p>🔗 Orphaned: {lastReport.summary.orphaned}</p>
          </div>

          {lastReport.inconsistencies.length > 0 && (
            <div className="inconsistencies">
              <h5>Inconsistencies Found:</h5>
              <ul>
                {lastReport.inconsistencies.slice(0, 5).map((item, index) => (
                  <li key={index}>
                    Product {item.productId}: 
                    {!item.differences.name.match && ` Name mismatch`}
                    {!item.differences.quantity.match && ` Quantity mismatch`}
                    {!item.differences.image.match && ` Image mismatch`}
                  </li>
                ))}
                {lastReport.inconsistencies.length > 5 && (
                  <li>... and {lastReport.inconsistencies.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SyncPanel;