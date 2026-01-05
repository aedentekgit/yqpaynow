import React, { useState, useEffect, useRef } from 'react';
import config from '../config';
import Modal from './Modal';
import '../styles/components/InputDialog.css'; // Extracted inline styles

/**
 * Custom Input Dialog
 * Replaces browser default prompt() with styled modal
 */
const InputDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Input Required',
  message = 'Please enter a value:',
  placeholder = 'Enter value...',
  defaultValue = '',
  inputType = 'text', // 'text', 'email', 'tel', 'number', 'password', 'textarea'
  required = false,
  maxLength = null,
  minLength = null,
  pattern = null,
  confirmText = 'OK',
  cancelText = 'Cancel',
  isLoading = false,
  validation = null // Function to validate input
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Reset value when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError('');
      // Focus input after modal animation
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, defaultValue]);

  const validateInput = (inputValue) => {
    // Required validation
    if (required && !inputValue.trim()) {
      return 'This field is required';
    }

    // Length validations
    if (minLength && inputValue.length < minLength) {
      return `Minimum ${minLength} characters required`;
    }

    if (maxLength && inputValue.length > maxLength) {
      return `Maximum ${maxLength} characters allowed`;
    }

    // Pattern validation
    if (pattern && !new RegExp(pattern).test(inputValue)) {
      return 'Invalid format';
    }

    // Email validation for email type
    if (inputType === 'email' && inputValue) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputValue)) {
        return 'Please enter a valid email address';
      }
    }

    // Phone validation for tel type
    if (inputType === 'tel' && inputValue) {
      const phoneRegex = /^[+]?[\d\s\-\(\)]+$/;
      if (!phoneRegex.test(inputValue)) {
        return 'Please enter a valid phone number';
      }
    }

    // Custom validation function
    if (validation) {
      return validation(inputValue);
    }

    return '';
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setValue(newValue);
    
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };

  const handleConfirm = () => {
    const validationError = validateInput(value);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    onConfirm(value);
  };

  const handleCancel = () => {
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const renderInput = () => {
    const commonProps = {
      ref: inputRef,
      value,
      onChange: handleInputChange,
      onKeyPress: handleKeyPress,
      placeholder,
      maxLength,
      disabled: isLoading,
      className: `input-field ${error ? 'input-error' : ''}`
    };

    if (inputType === 'textarea') {
      return (
        <textarea
          {...commonProps}
          rows={4}
          className="input-dialog-textarea"
        />
      );
    }

    return (
      <input
        {...commonProps}
        type={inputType}
        min={inputType === 'number' ? minLength : undefined}
        max={inputType === 'number' ? maxLength : undefined}
      />
    );
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      title={title}
      size="small"
      closeOnOverlayClick={!isLoading}
      closeOnEscape={!isLoading}
    >
      <div className="input-dialog">
        <div className="input-content">
          {message && (
            <div className="input-message">
              <p>{message}</p>
            </div>
          )}

          <div className="input-wrapper">
            {renderInput()}
            {error && (
              <div className="input-error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                {error}
              </div>
            )}
            {maxLength && (
              <div className="character-count">
                {value.length}/{maxLength}
              </div>
            )}
          </div>
        </div>

        <div className="input-actions">
          <button 
            className="cancel-btn" 
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                Processing...
              </>
            ) : confirmText}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input-dialog {
          text-align: left;
        }

        .input-content {
          margin-bottom: 32px;
        }

        .input-message {
          margin-bottom: 20px;
          color: #475569;
        }

        .input-message p {
          margin: 0;
          font-size: 16px;
          line-height: 1.5;
        }

        .input-wrapper {
          position: relative;
        }

        .input-field {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.2s;
          background: white;
          font-family: inherit;
        }

        .input-field:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .input-field.input-error {
          border-color: #ef4444;
        }

        .input-field.input-error:focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }

        .input-field:disabled {
          background: #f8fafc;
          color: #94a3b8;
          cursor: not-allowed;
        }

        .input-error-message {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ef4444;
          font-size: 14px;
          margin-top: 8px;
        }

        .character-count {
          text-align: right;
          font-size: 12px;
          color: #64748b;
          margin-top: 6px;
        }

        .input-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .btn-secondary, .btn-primary {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 100px;
          justify-content: center;
        }

        .btn-secondary {
          background: #f8fafc;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f1f5f9;
        }

        .btn-primary {
          background: #8b5cf6;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #7c3aed;
        }

        .btn-secondary:disabled,
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .input-actions {
            flex-direction: column;
          }

          .btn-secondary, .btn-primary {
            width: 100%;
          }
        }
      `}</style>
    </Modal>
  );
};

export default InputDialog;