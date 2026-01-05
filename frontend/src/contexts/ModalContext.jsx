import React, { createContext, useContext, useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import AlertDialog from '../components/AlertDialog';
import InputDialog from '../components/InputDialog';
import config from '../config';

/**
 * Modal Context
 * Provides global access to custom dialogs
 */
const ModalContext = createContext();

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export const ModalProvider = ({ children }) => {
  // State for different modal types
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'default',
    onConfirm: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isLoading: false
  });

  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    buttonText: 'OK',
    autoClose: false,
    autoCloseDelay: 3000,
    position: 'center' // 'center' or 'toast'
  });

  const [inputState, setInputState] = useState({
    isOpen: false,
    title: '',
    message: '',
    placeholder: '',
    defaultValue: '',
    inputType: 'text',
    required: false,
    onConfirm: null,
    confirmText: 'OK',
    cancelText: 'Cancel',
    isLoading: false,
    validation: null
  });

  // Confirm dialog methods
  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title: options.title || 'Confirm Action',
        message: options.message || 'Are you sure you want to proceed?',
        type: options.type || 'default',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        isLoading: false,
        onConfirm: () => {
          if (options.onConfirm) {
            // If onConfirm is async, handle loading state
            if (options.onConfirm.constructor.name === 'AsyncFunction') {
              setConfirmState(prev => ({ ...prev, isLoading: true }));
              options.onConfirm()
                .then(() => {
                  setConfirmState(prev => ({ ...prev, isOpen: false, isLoading: false }));
                  resolve(true);
                })
                .catch(() => {
                  setConfirmState(prev => ({ ...prev, isLoading: false }));
                  resolve(false);
                });
            } else {
              try {
                options.onConfirm();
                setConfirmState(prev => ({ ...prev, isOpen: false }));
                resolve(true);
              } catch (error) {
                resolve(false);
              }
            }
          } else {
            setConfirmState(prev => ({ ...prev, isOpen: false }));
            resolve(true);
          }
        }
      });
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false, isLoading: false }));
  }, []);

  // Alert dialog methods
  const alert = useCallback((options) => {
    return new Promise((resolve) => {
      setAlertState({
        isOpen: true,
        title: options.title || 'Alert',
        message: options.message || 'This is an alert message.',
        type: options.type || 'info',
        buttonText: options.buttonText || 'OK',
        autoClose: options.autoClose || false,
        autoCloseDelay: options.autoCloseDelay || 3000,
        position: options.position || 'center', // Support toast position
        onClose: () => {
          setAlertState(prev => ({ ...prev, isOpen: false }));
          resolve();
        }
      });
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Input dialog methods
  const prompt = useCallback((options) => {
    return new Promise((resolve) => {
      setInputState({
        isOpen: true,
        title: options.title || 'Input Required',
        message: options.message || 'Please enter a value:',
        placeholder: options.placeholder || 'Enter value...',
        defaultValue: options.defaultValue || '',
        inputType: options.inputType || 'text',
        required: options.required || false,
        confirmText: options.confirmText || 'OK',
        cancelText: options.cancelText || 'Cancel',
        isLoading: false,
        validation: options.validation || null,
        onConfirm: (value) => {
          if (options.onConfirm) {
            // If onConfirm is async, handle loading state
            if (options.onConfirm.constructor.name === 'AsyncFunction') {
              setInputState(prev => ({ ...prev, isLoading: true }));
              options.onConfirm(value)
                .then(() => {
                  setInputState(prev => ({ ...prev, isOpen: false, isLoading: false }));
                  resolve(value);
                })
                .catch(() => {
                  setInputState(prev => ({ ...prev, isLoading: false }));
                  resolve(null);
                });
            } else {
              try {
                options.onConfirm(value);
                setInputState(prev => ({ ...prev, isOpen: false }));
                resolve(value);
              } catch (error) {
                resolve(null);
              }
            }
          } else {
            setInputState(prev => ({ ...prev, isOpen: false }));
            resolve(value);
          }
        }
      });
    });
  }, []);

  const closePrompt = useCallback(() => {
    setInputState(prev => ({ ...prev, isOpen: false, isLoading: false }));
  }, []);

  // Convenience methods for common dialogs
  const showSuccess = useCallback((message, title = 'Success') => {
    // Ensure type is explicitly 'success' to prevent it from being shown as error
    return alert({
      title,
      message,
      type: 'success', // Explicitly set to 'success' to ensure green color
      autoClose: true,
      autoCloseDelay: 3000,
      position: 'toast' // Use toast position for success messages
    });
  }, [alert]);

  const showError = useCallback((message, title = 'Error') => {
    // DISABLED: Error modals removed for demo/presentation purposes
    // Errors are logged to console only

    return Promise.resolve(); // Return resolved promise to maintain compatibility
  }, []);

  const showWarning = useCallback((message, title = 'Warning') => {
    return alert({
      title,
      message,
      type: 'warning'
    });
  }, [alert]);

  const showInfo = useCallback((message, title = 'Information') => {
    return alert({
      title,
      message,
      type: 'info'
    });
  }, [alert]);

  const confirmDelete = useCallback((itemName = 'this item') => {
    return confirm({
      title: 'Delete Confirmation',
      message: `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
  }, [confirm]);

  const showConfirm = useCallback((title, message, type = 'default', confirmText = 'Confirm', cancelText = 'Cancel') => {
    return confirm({ title, message, type, confirmText, cancelText });
  }, [confirm]);

  const showAlert = useCallback((title, message, type = 'info', buttonText = 'OK') => {
    return alert({ title, message, type, buttonText });
  }, [alert]);

  const showPrompt = useCallback((title, message, placeholder = '', defaultValue = '', inputType = 'text', required = false) => {
    return prompt({ title, message, placeholder, defaultValue, inputType, required });
  }, [prompt]);

  const confirmAction = useCallback((action = 'this action') => {
    return confirm({
      title: 'Confirm Action',
      message: `Are you sure you want to ${action}?`,
      type: 'warning',
      confirmText: 'Proceed',
      cancelText: 'Cancel'
    });
  }, [confirm]);

  const promptText = useCallback((message, defaultValue = '', placeholder = 'Enter text...') => {
    return prompt({
      title: 'Input Required',
      message,
      defaultValue,
      placeholder,
      inputType: 'text',
      required: true
    });
  }, [prompt]);

  const promptEmail = useCallback((message = 'Please enter your email address:') => {
    return prompt({
      title: 'Email Required',
      message,
      placeholder: 'Enter email address...',
      inputType: 'email',
      required: true
    });
  }, [prompt]);

  const promptPhone = useCallback((message = 'Please enter your phone number:') => {
    return prompt({
      title: 'Phone Number Required',
      message,
      placeholder: 'Enter phone number...',
      inputType: 'tel',
      required: true
    });
  }, [prompt]);

  const value = {
    // Core methods
    confirm,
    alert,
    prompt,

    // Convenience methods
    showConfirm,
    showAlert,
    showPrompt,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    confirmDelete,
    confirmAction,
    promptText,
    promptEmail,
    promptPhone,

    // Close methods
    closeConfirm,
    closeAlert,
    closePrompt
  };

  return (
    <ModalContext.Provider value={value}>
      {children}

      {/* Render active modals */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        isLoading={confirmState.isLoading}
      />

      <AlertDialog
        isOpen={alertState.isOpen}
        onClose={alertState.onClose || closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttonText={alertState.buttonText}
        autoClose={alertState.autoClose}
        autoCloseDelay={alertState.autoCloseDelay}
        position={alertState.position}
      />

      <InputDialog
        isOpen={inputState.isOpen}
        onClose={closePrompt}
        onConfirm={inputState.onConfirm}
        title={inputState.title}
        message={inputState.message}
        placeholder={inputState.placeholder}
        defaultValue={inputState.defaultValue}
        inputType={inputState.inputType}
        required={inputState.required}
        confirmText={inputState.confirmText}
        cancelText={inputState.cancelText}
        isLoading={inputState.isLoading}
        validation={inputState.validation}
      />
    </ModalContext.Provider>
  );
};

export default ModalProvider;