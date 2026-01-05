import React, { useEffect, useRef } from 'react';
import config from '../config';
import ReactDOM from 'react-dom';

/**
 * Base Modal Component
 * Provides the foundation for all popup/modal dialogs
 */
const Modal = ({ 
  isOpen, 
  onClose, 
  children, 
  title,
  size = 'medium',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = ''
}) => {
  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  };

  const getSizeClass = () => {
    switch (size) {
      case 'small': return 'modal-small';
      case 'large': return 'modal-large';
      case 'extra-large': return 'modal-extra-large';
      default: return 'modal-medium';
    }
  };

  const modalContent = (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className={`modal-container ${getSizeClass()} ${className}`}>
        {/* Modal Header */}
        {(title || showCloseButton) && (
          <div className="modal-header">
            {title && <h3 className="modal-title">{title}</h3>}
            {showCloseButton && (
              <button 
                className="modal-close-button"
                onClick={onClose}
                aria-label="Close modal"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Modal Content */}
        <div className="modal-content" style={{ overflow: size === 'small' ? 'visible' : 'auto', maxHeight: size === 'small' ? 'none' : 'calc(90vh - 100px)' }}>
          {children}
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(139, 92, 246, 0.25);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1001 !important;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease-out;
        }

        .modal-container.modal-small {
          overflow: visible;
        }

        .modal-small {
          width: 100%;
          max-width: 400px;
        }

        .modal-medium {
          width: 100%;
          max-width: 500px;
        }

        .modal-large {
          width: 100%;
          max-width: 700px;
        }

        .modal-extra-large {
          width: 100%;
          max-width: 900px;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 24px 0 24px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 24px;
        }

        .modal-title {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #1e293b;
        }

        .modal-close-button {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .modal-close-button:hover {
          background: #f1f5f9;
          color: #475569;
        }

        .modal-content {
          padding: 0 24px 24px 24px;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .modal-overlay {
            padding: 16px;
          }

          .modal-container {
            max-height: 95vh;
          }

          .modal-header {
            padding: 20px 20px 0 20px;
            margin-bottom: 20px;
          }

          .modal-content {
            padding: 0 20px 20px 20px;
          }

          .modal-title {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );

  // Render modal in portal to avoid z-index issues
  return ReactDOM.createPortal(modalContent, document.body);
};

export default Modal;