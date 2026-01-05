import React from 'react';
import ReactDOM from 'react-dom';
import '../styles/GlobalToast.css'; // Import toast styles

/**
 * Custom Alert Dialog - Exact Mirror of Delete Confirmation Modal
 * Uses same structure as TheaterList delete modal with violet header
 * Now supports TOAST MODE for right-top notifications
 */
const AlertDialog = ({
  isOpen,
  onClose,
  title = 'Alert',
  message = 'This is an alert message.',
  buttonText = 'OK',
  type = 'info', // 'info', 'success', 'warning', 'error'
  icon = null,
  autoClose = false,
  autoCloseDelay = 3000,
  position = 'center' // 'center' or 'toast' (right-top)
}) => {
  // Auto close functionality - works for both modal and toast modes
  React.useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, autoCloseDelay, onClose]);

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleClose = () => {
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getIconForType = (forToast = false) => {
    if (icon) return icon;

    const iconSVG = {
      success: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20,6 9,17 4,12"></polyline>
        </svg>
      ),
      warning: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      ),
      error: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      ),
      info: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      )
    };

    // For toast mode, return just the SVG
    if (forToast) {
      return iconSVG[type] || iconSVG.info;
    }

    // For modal mode, wrap in div with class
    const svg = iconSVG[type] || iconSVG.info;
    return (
      <div className={`alert-icon ${type}`}>
        {svg}
      </div>
    );
  };

  const getButtonClass = () => {
    switch (type) {
      case 'success': return 'btn-success';
      case 'warning': return 'btn-warning';
      case 'error': return 'btn-danger';
      default: return 'btn-primary';
    }
  };

  if (!isOpen) return null;

  // TOAST MODE - Right-top notification
  if (position === 'toast') {
    // ✅ CRITICAL FIX: Force success type if message contains success keywords
    // Check message first before normalizing type
    let normalizedType = type;
    
    // ✅ CRITICAL FIX: If message contains success keywords, ALWAYS force type to 'success'
    // This overrides ANY type prop, even if it's explicitly set to 'error'
    if (typeof message === 'string') {
      const successKeywords = ['successfully', 'success', 'saved', 'updated', 'created', 'completed', 'marked as'];
      const messageLower = message.toLowerCase();
      if (successKeywords.some(keyword => messageLower.includes(keyword))) {
        normalizedType = 'success'; // Force to success regardless of type prop - OVERRIDE ANYTHING
      }
    }
    
    // ✅ ADDITIONAL CHECK: Also check title for success keywords
    if (typeof title === 'string' && normalizedType !== 'success') {
      const successKeywords = ['success', 'successfully'];
      const titleLower = title.toLowerCase();
      if (successKeywords.some(keyword => titleLower.includes(keyword))) {
        normalizedType = 'success';
      }
    }
    
    // Normalize type if not already set to success
    if (normalizedType !== 'success') {
      normalizedType = normalizedType === 'error' ? 'error' : 
                       normalizedType === 'warning' ? 'warning' : 
                       'info';
    }

    // Get icon for the normalized type
    const getToastIcon = (toastType) => {
      if (icon) return icon;
      const iconSVG = {
        success: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20,6 9,17 4,12"></polyline>
          </svg>
        ),
        warning: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        ),
        error: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ),
        info: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        )
      };
      return iconSVG[toastType] || iconSVG.info;
    };

    // Get style for toast based on type - ensure success is always green
    // ✅ CRITICAL: Force success styling if message contains success keywords
    const getToastStyle = () => {
      // Double-check: if message has success keywords, force success styling
      let finalType = normalizedType;
      if (typeof message === 'string') {
        const successKeywords = ['successfully', 'success', 'saved', 'updated', 'created', 'completed'];
        const messageLower = message.toLowerCase();
        if (successKeywords.some(keyword => messageLower.includes(keyword))) {
          finalType = 'success';
        }
      }
      
      if (finalType === 'success') {
        return {
          background: '#10b981',
          backgroundColor: '#10b981',
          color: 'white'
        };
      } else if (finalType === 'error') {
        return {
          background: '#ef4444',
          backgroundColor: '#ef4444',
          color: 'white'
        };
      } else if (finalType === 'warning') {
        return {
          background: '#f59e0b',
          backgroundColor: '#f59e0b',
          color: 'white'
        };
      } else {
        return {
          background: '#3b82f6',
          backgroundColor: '#3b82f6',
          color: 'white'
        };
      }
    };

    const getIconColor = () => {
      return 'white';
    };

    const getMessageColor = () => {
      return 'white';
    };

    const getCloseButtonColor = () => {
      return 'white';
    };

    const toastContent = (
      <>
        {/* ✅ CRITICAL FIX: Inline style tag to force success color with maximum specificity */}
        {normalizedType === 'success' && (
          <style>{`
            .global-toast.global-toast-success,
            .global-toast[class*="global-toast-success"] {
              background: #10b981 !important;
              background-color: #10b981 !important;
              color: white !important;
            }
            .global-toast.global-toast-success .global-toast-icon,
            .global-toast[class*="global-toast-success"] .global-toast-icon {
              color: white !important;
            }
            .global-toast.global-toast-success .global-toast-message,
            .global-toast[class*="global-toast-success"] .global-toast-message {
              color: white !important;
            }
            .global-toast.global-toast-success .global-toast-close svg,
            .global-toast[class*="global-toast-success"] .global-toast-close svg {
              stroke: white !important;
            }
          `}</style>
        )}
        <div className="toast-container">
          <div 
            className={`global-toast global-toast-${normalizedType}`}
            style={getToastStyle()}
          >
            <div className="global-toast-icon" style={{ color: getIconColor() }}>
              {getToastIcon(normalizedType)}
            </div>
            <div className="global-toast-message" style={{ color: getMessageColor() }}>
              {typeof message === 'string' ? message : message}
            </div>
            <button 
              className="global-toast-close" 
              onClick={handleClose}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke={getCloseButtonColor()} strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      </>
    );

    return ReactDOM.createPortal(toastContent, document.body);
  }

  // MODAL MODE - Center dialog (default)
  const modalContent = (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="alert-modal">
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <div className="alert-content">
            {getIconForType()}
            <p>{typeof message === 'string' ? message : message}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button 
            className={`${getButtonClass()}`}
            onClick={handleClose}
            autoFocus
          >
            {buttonText}
          </button>
        </div>

        {autoClose && (
          <div className="auto-close-indicator">
            <div className="auto-close-progress" style={{ animationDuration: `${autoCloseDelay}ms` }}></div>
          </div>
        )}
      </div>

      <style>{`
        .modal-overlay {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(124, 58, 237, 0.25) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 1001 !important;
          backdrop-filter: blur(4px) !important;
          padding: 20px !important;
        }

        .alert-modal {
          background: white !important;
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
          max-width: 400px !important;
          width: 90% !important;
          overflow: hidden !important;
          position: relative !important;
        }

        .alert-modal .modal-header {
          padding: 16px 20px !important;
          background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)) !important;
          color: var(--white) !important;
        }

        .alert-modal .modal-header h3 {
          margin: 0 !important;
          font-size: 1.1rem !important;
          font-weight: 700 !important;
        }

        .alert-modal .modal-body {
          padding: 16px 20px !important;
        }

        .alert-modal .alert-content {
          text-align: center !important;
        }

        .alert-modal .alert-icon {
          margin: 0 auto 12px !important;
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        .alert-modal .alert-icon.success {
          background: #f0fdf4 !important;
          color: #10b981 !important;
        }

        .alert-modal .alert-icon.error {
          background: #fef2f2 !important;
          color: #ef4444 !important;
        }

        .alert-modal .alert-icon.warning {
          background: #fffbeb !important;
          color: #f59e0b !important;
        }

        .alert-modal .alert-icon.info {
          background: var(--primary-ultra-light) !important;
          color: var(--primary-color) !important;
        }

        .alert-modal .modal-body p {
          margin: 0 !important;
          color: #475569 !important;
          line-height: 1.4 !important;
          font-size: 15px !important;
        }

        .alert-modal .modal-actions {
          padding: 12px 20px !important;
          background: #f8fafc !important;
          display: flex !important;
          gap: 12px !important;
          border-top: 1px solid #e2e8f0 !important;
          justify-content: center !important;
        }

        .alert-modal .btn-primary, 
        .alert-modal .btn-danger, 
        .alert-modal .btn-warning, 
        .alert-modal .btn-success {
          padding: 10px 20px !important;
          border: none !important;
          border-radius: 8px !important;
          font-weight: 500 !important;
          font-size: 14px !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
          min-width: 90px !important;
        }

        .alert-modal .btn-primary {
          background: var(--primary-color) !important;
          color: var(--white) !important;
        }

        .alert-modal .btn-primary:hover {
          background: var(--primary-dark) !important;
        }

        .alert-modal .btn-danger {
          background: #ef4444 !important;
          color: white !important;
        }

        .alert-modal .btn-danger:hover {
          background: #dc2626 !important;
        }

        .alert-modal .btn-warning {
          background: #f59e0b !important;
          color: white !important;
        }

        .alert-modal .btn-warning:hover {
          background: #d97706 !important;
        }

        .alert-modal .btn-success {
          background: #10b981 !important;
          color: white !important;
        }

        .alert-modal .btn-success:hover {
          background: #059669 !important;
        }

        /* Auto-close indicator */
        .alert-modal .auto-close-indicator {
          position: absolute !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 3px !important;
          background: rgba(0, 0, 0, 0.1) !important;
          overflow: hidden !important;
        }

        .alert-modal .auto-close-progress {
          height: 100% !important;
          background: var(--primary-color) !important;
          animation: progress-animation linear forwards !important;
          width: 0 !important;
        }

        @keyframes progress-animation {
          from { width: 0; }
          to { width: 100%; }
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .alert-modal {
            max-width: 90% !important;
          }
          
          .alert-modal .modal-header {
            padding: 14px 18px !important;
          }
          
          .alert-modal .modal-body {
            padding: 14px 18px !important;
          }
          
          .alert-modal .modal-actions {
            padding: 10px 18px !important;
          }
        }
      `}</style>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default AlertDialog;