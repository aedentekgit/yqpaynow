/* @refresh reset */
import React, { createContext, useContext, useState, useCallback } from 'react';
import '../styles/GlobalToast.css';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    // ✅ CRITICAL FIX: Normalize type to ensure success messages always show correctly
    // Check if message contains success keywords and force type to 'success' if needed
    let normalizedType = type || 'info';
    const successKeywords = ['successfully', 'success', 'saved', 'updated', 'created', 'deleted', 'activated', 'deactivated'];
    const messageStr = String(message || '').toLowerCase();
    const containsSuccessKeyword = successKeywords.some(keyword => messageStr.includes(keyword));
    
    // If message contains success keywords but type is error, fix it to success
    if (containsSuccessKeyword && normalizedType === 'error') {
      console.warn('⚠️ [Toast] Detected success message with error type, correcting to success:', message);
      normalizedType = 'success';
    }
    
    // ✅ FIX: Removed verbose logging (toast creation doesn't need console logs)
    const id = Date.now() + Math.random();
    const newToast = { id, message, type: normalizedType, duration };
    
    setToasts(prev => [...prev, newToast]);

    // ✅ REMOVED: Auto-close is now handled at component level in Toast component
    // This prevents duplicate timers and ensures proper cleanup

    return id;
  }, [removeToast]);

  const success = useCallback((message, duration) => {
    // Force type to be 'success' explicitly - ensure it can't be overridden
    return showToast(message, 'success', duration || 3000);
  }, [showToast]);

  const error = useCallback((message, duration) => {
    return showToast(message, 'error', duration);
  }, [showToast]);

  const warning = useCallback((message, duration) => {
    return showToast(message, 'warning', duration);
  }, [showToast]);

  const info = useCallback((message, duration) => {
    return showToast(message, 'info', duration);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ success, error, warning, info, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const Toast = ({ message, type, onClose, duration = 3000 }) => {
  // ✅ CRITICAL FIX: Store onClose in a ref to prevent useEffect from re-running
  const onCloseRef = React.useRef(onClose);
  
  // Update ref when onClose changes
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ✅ CRITICAL FIX: Normalize type to ensure success messages always show as success
  // Check if message contains success keywords and force type to 'success'
  const normalizeType = (originalType, msg) => {
    // If type is already success, keep it
    if (originalType === 'success') return 'success';
    
    // If message contains success keywords, force type to success
    const successKeywords = ['successfully', 'success', 'saved', 'updated', 'created', 'deleted', 'activated', 'deactivated'];
    const messageStr = String(msg || '').toLowerCase();
    const containsSuccessKeyword = successKeywords.some(keyword => messageStr.includes(keyword));
    
    // If message contains success keywords but type is error, fix it to success
    if (containsSuccessKeyword && originalType === 'error') {
      console.warn('⚠️ [Toast] Detected success message with error type, correcting to success:', msg);
      return 'success';
    }
    
    // Otherwise, return the original type
    return originalType || 'info';
  };

  // Normalize the type
  const normalizedType = normalizeType(type, message);

  // ✅ CRITICAL FIX: Add useEffect to handle auto-close at component level
  // Only run once on mount - use ref to avoid re-creating timer
  React.useEffect(() => {
    // Auto-close after duration (default 3000ms = 3 seconds)
    const closeDuration = duration && duration > 0 ? duration : 3000;
    // ✅ FIX: Removed verbose logging for toast cleanup (not needed in production)
    
    const timer = setTimeout(() => {
      // ✅ FIX: Removed verbose logging
      if (onCloseRef.current) {
        onCloseRef.current();
      }
    }, closeDuration);

    // Cleanup timer on unmount
    return () => {
      // ✅ FIX: Removed verbose logging
      clearTimeout(timer);
    };
    // Only depend on duration - onClose is accessed via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const getIcon = () => {
    switch (normalizedType) {
      case 'success':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        );
      case 'error':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
      case 'warning':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
      case 'info':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // ✅ FIX: Get background color based on normalized type with inline style fallback
  const getBackgroundColor = () => {
    switch (normalizedType) {
      case 'success':
        return '#10b981'; // Solid green for success
      case 'error':
        return '#ef4444'; // Solid red for error
      case 'warning':
        return '#f59e0b'; // Solid orange for warning
      case 'info':
        return '#3b82f6'; // Solid blue for info
      default:
        return 'white';
    }
  };

  return (
    <div 
      className={`global-toast global-toast-${normalizedType}`}
      style={{
        backgroundColor: getBackgroundColor(),
        color: 'white',
        border: 'none'
      }}
    >
      <div className="global-toast-icon" style={{ color: 'white' }}>
        {getIcon()}
      </div>
      <div className="global-toast-message" style={{ color: 'white' }}>
        {message}
      </div>
      <button className="global-toast-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
};

export default ToastProvider;
