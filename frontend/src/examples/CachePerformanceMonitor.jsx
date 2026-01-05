import React, { useState, useEffect } from 'react';
import { getPerformanceStats } from '../utils/withCaching';

/**
 * Global Cache Performance Monitor Component
 * Displays real-time caching performance metrics across ALL pages
 * Features:
 * - Auto-minimized by default to avoid clutter
 * - LocalStorage persistence for user preferences
 * - Keyboard shortcut: Ctrl+Shift+P to toggle visibility
 * - Shows cache hits, network calls, speed improvements, time saved
 */
const CachePerformanceMonitor = ({ position = 'bottom-right', minimized = true }) => {
  const [stats, setStats] = useState(null);
  const [isMinimized, setIsMinimized] = useState(() => {
    // Load minimized state from localStorage
    const saved = localStorage.getItem('cacheMonitor_minimized');
    return saved !== null ? saved === 'true' : minimized;
  });
  const [isVisible, setIsVisible] = useState(() => {
    // Load visibility state from localStorage
    const saved = localStorage.getItem('cacheMonitor_visible');
    return saved !== null ? saved === 'true' : true;
  });

  // Update stats every second
  useEffect(() => {
    const interval = setInterval(() => {
      const perfStats = getPerformanceStats();
      if (perfStats.cacheHits > 0 || perfStats.cacheMisses > 0) {
        setStats(perfStats);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut: Ctrl+Shift+P to toggle visibility
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsVisible(prev => {
          const newValue = !prev;
          localStorage.setItem('cacheMonitor_visible', newValue.toString());
          return newValue;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Persist minimized state
  useEffect(() => {
    localStorage.setItem('cacheMonitor_minimized', isMinimized.toString());
  }, [isMinimized]);

  // Persist visibility state
  useEffect(() => {
    localStorage.setItem('cacheMonitor_visible', isVisible.toString());
  }, [isVisible]);

  if (!isVisible || !stats) return null;

  const totalRequests = stats.cacheHits + stats.cacheMisses;
  const hitRate = totalRequests > 0 ? (stats.cacheHits / totalRequests * 100) : 0;
  const speedImprovement = stats.avgNetworkTime > 0 
    ? ((stats.avgNetworkTime - stats.avgCacheTime) / stats.avgNetworkTime * 100)
    : 0;

  const positionStyles = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
  };

  const containerStyle = {
    position: 'fixed',
    ...positionStyles[position],
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    color: '#fff',
    padding: isMinimized ? '10px 15px' : '15px 20px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    fontFamily: 'monospace',
    fontSize: '12px',
    zIndex: 10000,
    minWidth: isMinimized ? 'auto' : '280px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    transition: 'all 0.3s ease'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isMinimized ? '0' : '12px',
    paddingBottom: isMinimized ? '0' : '10px',
    borderBottom: isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.2)'
  };

  const titleStyle = {
    fontSize: '14px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  const statRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    padding: '4px 0'
  };

  const labelStyle = {
    color: '#999',
    fontSize: '11px'
  };

  const valueStyle = {
    color: '#0f0',
    fontWeight: 'bold',
    fontSize: '13px'
  };

  const buttonStyle = {
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 5px',
    opacity: 0.7,
    transition: 'opacity 0.2s'
  };

  const progressBarStyle = {
    width: '100%',
    height: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '4px'
  };

  const progressFillStyle = {
    height: '100%',
    backgroundColor: hitRate > 80 ? '#0f0' : hitRate > 50 ? '#ff0' : '#f80',
    width: `${hitRate}%`,
    transition: 'width 0.3s ease'
  };

  return (
    <div>
 {/* <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>
          <span>⚡</span>
          {!isMinimized && <span>Cache Performance</span>}
        </div>
        <div>
          <button 
            style={buttonStyle}
            onClick={() => setIsMinimized(!isMinimized)}
            onMouseEnter={(e) => e.target.style.opacity = '1'}
            onMouseLeave={(e) => e.target.style.opacity = '0.7'}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '⬜' : '➖'}
          </button>
          <button 
            style={buttonStyle}
            onClick={() => setIsVisible(false)}
            onMouseEnter={(e) => e.target.style.opacity = '1'}
            onMouseLeave={(e) => e.target.style.opacity = '0.7'}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div style={statRowStyle}>
            <span style={labelStyle}>Cache Hits:</span>
            <span style={valueStyle}>{stats.cacheHits}</span>
          </div>
          <div style={statRowStyle}>
            <span style={labelStyle}>Network Calls:</span>
            <span style={{ ...valueStyle, color: '#ff0' }}>{stats.cacheMisses}</span>
          </div>
          <div style={statRowStyle}>
            <span style={labelStyle}>Hit Rate:</span>
            <span style={valueStyle}>{hitRate.toFixed(1)}%</span>
          </div>
          <div style={progressBarStyle}>
            <div style={progressFillStyle}></div>
          </div>
          
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
            <div style={statRowStyle}>
              <span style={labelStyle}>Cache Speed:</span>
              <span style={valueStyle}>{stats.avgCacheTime.toFixed(1)}ms</span>
            </div>
            <div style={statRowStyle}>
              <span style={labelStyle}>Network Speed:</span>
              <span style={{ ...valueStyle, color: '#ff0' }}>{stats.avgNetworkTime.toFixed(1)}ms</span>
            </div>
            <div style={statRowStyle}>
              <span style={labelStyle}>Speed Boost:</span>
              <span style={{ ...valueStyle, color: '#0ff' }}>🚀 {speedImprovement.toFixed(1)}%</span>
            </div>
            <div style={statRowStyle}>
              <span style={labelStyle}>Time Saved:</span>
              <span style={{ ...valueStyle, color: '#0ff' }}>{(stats.totalSavedTime / 1000).toFixed(2)}s</span>
            </div>
          </div>
        </>
      )}

      {isMinimized && (
        <span style={{ ...valueStyle, marginLeft: '10px' }}>
          {stats.cacheHits} hits | {speedImprovement.toFixed(0)}% faster
        </span>
      )}
    </div> */}

    </div>
   
  );
};

export default CachePerformanceMonitor;
