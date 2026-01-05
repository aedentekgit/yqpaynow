import React from 'react';
import useNetworkStatus from '../hooks/useNetworkStatus';
import '../styles/components/OfflineNotice.css';

/**
 * Component that displays an offline notice banner when network is unavailable
 * Shows at the top of the page to inform users they're in offline mode
 */
const OfflineNotice = ({ className = '' }) => {
  const { shouldShowOfflineUI, isOnline, isApiAvailable, checkApiAvailability } = useNetworkStatus();

  if (!shouldShowOfflineUI) {
    return null;
  }

  const handleRetry = async () => {
    await checkApiAvailability();
    if (isOnline && isApiAvailable) {
      window.location.reload();
    }
  };

  return (
    <div className={`offline-notice ${className}`}>
      <div className="offline-notice-content">
        <div className="offline-icon">📡</div>
        <div className="offline-text">
          <strong>Demo Mode</strong>
          {!isOnline ? (
            <span>No internet connection. Showing demo menu.</span>
          ) : (
            <span>Server unavailable. Showing demo menu.</span>
          )}
        </div>
        <button 
          className="offline-retry-btn" 
          onClick={handleRetry}
          title="Check connection and reload"
        >
          🔄 Retry
        </button>
      </div>
    </div>
  );
};

export default OfflineNotice;