/**
 * Offline Status Badge Component
 * Visual indicator for offline POS connection status
 * Shows: Online/Offline/Syncing status, pending orders count, last sync time
 */

import React from 'react';
import '../styles/components/OfflineStatusBadge.css'; // Extracted inline styles

const OfflineStatusBadge = ({
  connectionStatus = 'online',
  pendingCount = 0,
  isSyncing = false,
  lastSyncTime = null,
  syncProgress = { current: 0, total: 0 },
  syncError = null,
  onManualSync = null,
  onRetryFailed = null,
  compact = false
}) => {
  /**
   * Get status color and icon
   */
  const getStatusConfig = () => {
    if (isSyncing) {
      return {
        color: 'bg-yellow-500',
        icon: '🔄',
        text: 'SYNCING',
        textColor: 'text-yellow-700',
        borderColor: 'border-yellow-300',
        bgColor: 'bg-yellow-50'
      };
    }

    if (connectionStatus === 'offline' || !navigator.onLine) {
      return {
        color: 'bg-red-500',
        icon: '📡',
        text: 'OFFLINE',
        textColor: 'text-red-700',
        borderColor: 'border-red-300',
        bgColor: 'bg-red-50'
      };
    }

    if (syncError) {
      return {
        color: 'bg-orange-500',
        icon: '⚠️',
        text: 'ERROR',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-300',
        bgColor: 'bg-orange-50'
      };
    }

    if (pendingCount > 0) {
      return {
        color: 'bg-yellow-500',
        icon: '⏱️',
        text: 'PENDING',
        textColor: 'text-yellow-700',
        borderColor: 'border-yellow-300',
        bgColor: 'bg-yellow-50'
      };
    }

    return {
      color: 'bg-green-500',
      icon: '✅',
      text: 'ONLINE',
      textColor: 'text-green-700',
      borderColor: 'border-green-300',
      bgColor: 'bg-green-50'
    };
  };

  const config = getStatusConfig();

  /**
   * Format last sync time
   */
  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    
    const now = Date.now();
    const diff = now - lastSyncTime;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(lastSyncTime).toLocaleString();
  };

  /**
   * Compact version (just icon + count)
   */
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${config.color}`}
          style={{ animation: isSyncing ? 'pulse 1s infinite' : 'none' }}
        />
        {pendingCount > 0 && (
          <span className="text-sm font-medium text-gray-700">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  /**
   * Full version with details
   */
  return (
    <div className={`border-2 ${config.borderColor} ${config.bgColor} rounded-lg p-4 shadow-sm`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div
            className={`w-3 h-3 rounded-full ${config.color}`}
            style={{ animation: isSyncing ? 'pulse 1s infinite' : 'none' }}
          />
          
          {/* Status Icon */}
          <div className={`${config.textColor} offline-status-icon-large`}>
            {config.icon}
          </div>
          
          {/* Status Text */}
          <span className={`font-bold text-sm ${config.textColor}`}>
            {config.text}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Manual Sync Button */}
          {onManualSync && connectionStatus === 'online' && !isSyncing && (
            <button
              onClick={onManualSync}
              className="p-2 hover:bg-white rounded-lg transition-colors offline-status-clickable"
              title="Sync Now"
            >
              <span className="offline-status-icon-medium">🔄</span>
            </button>
          )}

          {/* Retry Failed Button */}
          {onRetryFailed && syncError && !isSyncing && (
            <button
              onClick={onRetryFailed}
              className="p-2 hover:bg-white rounded-lg transition-colors offline-status-clickable"
              title="Retry Failed Orders"
            >
              <span className="offline-status-icon-medium">⚠️</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Progress */}
      {isSyncing && syncProgress.total > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Syncing orders...</span>
            <span>{syncProgress.current} / {syncProgress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Pending Orders */}
        <div>
          <div className="text-gray-500 text-xs mb-1">Pending Orders</div>
          <div className={`font-bold ${pendingCount > 0 ? 'text-orange-600' : 'text-gray-700'}`}>
            {pendingCount}
          </div>
        </div>

        {/* Last Sync */}
        <div>
          <div className="text-gray-500 text-xs mb-1">Last Sync</div>
          <div className="font-medium text-gray-700">
            {formatLastSync()}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {syncError && (
        <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
          <div className="flex items-start gap-2">
            <span className="offline-status-icon-small">⚠️</span>
            <div>
              <div className="font-bold mb-1">Sync Error</div>
              <div>{syncError}</div>
            </div>
          </div>
        </div>
      )}

      {/* Offline Notice */}
      {(connectionStatus === 'offline' || !navigator.onLine) && (
        <div className="mt-3 p-2 bg-blue-50 border border-blue-300 rounded text-xs text-blue-700">
          <div className="flex items-start gap-2">
            <span className="offline-status-icon-small">📡</span>
            <div>
              <div className="font-bold mb-1">Working Offline</div>
              <div>Orders will sync automatically when connection is restored.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineStatusBadge;
