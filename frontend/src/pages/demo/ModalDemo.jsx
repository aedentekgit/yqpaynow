import React from 'react';
import config from '../../config';
import AdminLayout from '../../components/AdminLayout';
import { useModal } from '../../contexts/ModalContext';

/**
 * Modal Demo Page
 * Demonstrates all custom modal/popup components
 */
const ModalDemo = () => {
  const {
    confirm,
    alert,
    prompt,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    confirmDelete,
    confirmAction,
    promptText,
    promptEmail,
    promptPhone
  } = useModal();

  // Demo handlers
  const handleBasicConfirm = async () => {
    const result = await confirm({
      title: 'Basic Confirmation',
      message: 'Do you want to proceed with this action?',
      confirmText: 'Yes, Proceed',
      cancelText: 'No, Cancel'
    });
    
    if (result) {
      showSuccess('Action confirmed successfully!');
    }
  };

  const handleDangerConfirm = async () => {
    const result = await confirm({
      title: 'Danger Zone',
      message: 'This action is irreversible and will permanently delete all data. Are you absolutely sure?',
      type: 'danger',
      confirmText: 'Delete Forever',
      cancelText: 'Keep Safe'
    });
    
    if (result) {
      showError('Data would be deleted! (This is just a demo)');
    }
  };

  const handleAsyncConfirm = async () => {
    const result = await confirm({
      title: 'Async Operation',
      message: 'This will perform a background operation. Continue?',
      type: 'warning',
      confirmText: 'Start Operation',
      onConfirm: async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 3000));
        showSuccess('Async operation completed!');
      }
    });
  };

  const handleDeleteConfirm = async () => {
    const result = await confirmDelete('the selected user account');
    if (result) {
      showSuccess('User account deleted successfully!');
    }
  };

  const handleBasicAlert = () => {
    alert({
      title: 'Information',
      message: 'This is a basic alert message to inform you about something important.',
      type: 'info'
    });
  };

  const handleAutoCloseAlert = () => {
    alert({
      title: 'Auto Close Alert',
      message: 'This alert will automatically close in 5 seconds.',
      type: 'warning',
      autoClose: true,
      autoCloseDelay: 5000
    });
  };

  const handleBasicPrompt = async () => {
    const result = await promptText('What is your name?', '', 'Enter your full name...');
    if (result) {
      showSuccess(`Hello, ${result}! Nice to meet you.`);
    }
  };

  const handleEmailPrompt = async () => {
    const email = await promptEmail('Please enter your email for newsletter subscription:');
    if (email) {
      showSuccess(`Thank you! We'll send updates to ${email}`);
    }
  };

  const handlePhonePrompt = async () => {
    const phone = await promptPhone('Enter your phone number for SMS notifications:');
    if (phone) {
      showSuccess(`Phone number ${phone} has been registered for SMS alerts.`);
    }
  };

  const handleAdvancedPrompt = async () => {
    const result = await prompt({
      title: 'Create New Item',
      message: 'Enter the item name (minimum 3 characters):',
      placeholder: 'Enter item name...',
      inputType: 'text',
      required: true,
      validation: (value) => {
        if (value.length < 3) return 'Item name must be at least 3 characters';
        if (value.length > 50) return 'Item name cannot exceed 50 characters';
        return '';
      },
      confirmText: 'Create Item',
      onConfirm: async (value) => {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));
        showSuccess(`Item "${value}" created successfully!`);
      }
    });
  };

  const handleTextareaPrompt = async () => {
    const result = await prompt({
      title: 'Feedback Form',
      message: 'Please share your feedback or suggestions:',
      placeholder: 'Enter your feedback here...',
      inputType: 'textarea',
      required: true,
      maxLength: 500,
      confirmText: 'Submit Feedback'
    });
    
    if (result) {
      showSuccess('Thank you for your feedback!');
    }
  };

  return (
    <AdminLayout pageTitle="Modal Demo" currentPage="modal-demo">
      <div className="modal-demo">
        <div className="demo-header">
          <h2>Custom Modal Components Demo</h2>
          <p>Test all custom popup dialogs that replace browser defaults</p>
        </div>

        {/* Confirmation Dialogs */}
        <div className="demo-section">
          <h3>🔔 Confirmation Dialogs</h3>
          <div className="demo-grid">
            <button className="demo-btn demo-btn-primary" onClick={handleBasicConfirm}>
              Basic Confirmation
            </button>
            <button className="demo-btn demo-btn-danger" onClick={handleDangerConfirm}>
              Danger Confirmation
            </button>
            <button className="demo-btn demo-btn-warning" onClick={handleAsyncConfirm}>
              Async Confirmation
            </button>
            <button className="demo-btn demo-btn-delete" onClick={handleDeleteConfirm}>
              Delete Confirmation
            </button>
          </div>
        </div>

        {/* Alert Dialogs */}
        <div className="demo-section">
          <h3>📢 Alert Dialogs</h3>
          <div className="demo-grid">
            <button className="demo-btn demo-btn-info" onClick={handleBasicAlert}>
              Basic Alert
            </button>
            <button className="demo-btn demo-btn-success" onClick={() => showSuccess('Operation completed successfully!')}>
              Success Alert
            </button>
            <button className="demo-btn demo-btn-error" onClick={() => showError('Something went wrong!')}>
              Error Alert
            </button>
            <button className="demo-btn demo-btn-warning" onClick={() => showWarning('Please check your input!')}>
              Warning Alert
            </button>
            <button className="demo-btn demo-btn-auto" onClick={handleAutoCloseAlert}>
              Auto-Close Alert
            </button>
          </div>
        </div>

        {/* Input Dialogs */}
        <div className="demo-section">
          <h3>✏️ Input Dialogs</h3>
          <div className="demo-grid">
            <button className="demo-btn demo-btn-input" onClick={handleBasicPrompt}>
              Basic Text Input
            </button>
            <button className="demo-btn demo-btn-input" onClick={handleEmailPrompt}>
              Email Input
            </button>
            <button className="demo-btn demo-btn-input" onClick={handlePhonePrompt}>
              Phone Input
            </button>
            <button className="demo-btn demo-btn-input" onClick={handleAdvancedPrompt}>
              Advanced Validation
            </button>
            <button className="demo-btn demo-btn-input" onClick={handleTextareaPrompt}>
              Textarea Input
            </button>
          </div>
        </div>

        {/* Usage Information */}
        <div className="demo-section">
          <h3>📖 How to Use</h3>
          <div className="usage-info">
            <div className="usage-card">
              <h4>Import the Hook</h4>
              <pre><code>{`import { useModal } from '../contexts/ModalContext';`}</code></pre>
            </div>
            <div className="usage-card">
              <h4>Use in Component</h4>
              <pre><code>{`const { confirm, alert, prompt } = useModal();

// Confirmation
const result = await confirm({
  title: 'Delete Item',
  message: 'Are you sure?',
  type: 'danger'
});

// Alert
await alert({
  title: 'Success',
  message: 'Operation completed!',
  type: 'success'
});

// Prompt
const value = await prompt({
  title: 'Enter Name',
  message: 'What is your name?',
  required: true
});`}</code></pre>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-demo {
          max-width: 1000px;
          margin: 0 auto;
          padding: 24px;
        }

        .demo-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .demo-header h2 {
          margin: 0 0 12px 0;
          color: #1e293b;
          font-size: 28px;
          font-weight: 600;
        }

        .demo-header p {
          margin: 0;
          color: #64748b;
          font-size: 16px;
        }

        .demo-section {
          margin-bottom: 48px;
        }

        .demo-section h3 {
          margin: 0 0 24px 0;
          color: #1e293b;
          font-size: 20px;
          font-weight: 600;
          padding-bottom: 12px;
          border-bottom: 2px solid #f1f5f9;
        }

        .demo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .demo-btn {
          padding: 16px 20px;
          border: none;
          border-radius: 12px;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
          border: 2px solid #e2e8f0;
          color: #475569;
        }

        .demo-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .demo-btn-primary {
          background: #8b5cf6;
          color: white;
          border-color: #8b5cf6;
        }

        .demo-btn-primary:hover {
          background: #7c3aed;
          border-color: #7c3aed;
        }

        .demo-btn-danger {
          background: #ef4444;
          color: white;
          border-color: #ef4444;
        }

        .demo-btn-danger:hover {
          background: #dc2626;
          border-color: #dc2626;
        }

        .demo-btn-warning {
          background: #f59e0b;
          color: white;
          border-color: #f59e0b;
        }

        .demo-btn-warning:hover {
          background: #d97706;
          border-color: #d97706;
        }

        .demo-btn-success {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }

        .demo-btn-success:hover {
          background: #059669;
          border-color: #059669;
        }

        .demo-btn-info {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .demo-btn-info:hover {
          background: #2563eb;
          border-color: #2563eb;
        }

        .demo-btn-error {
          background: #ef4444;
          color: white;
          border-color: #ef4444;
        }

        .demo-btn-error:hover {
          background: #dc2626;
          border-color: #dc2626;
        }

        .demo-btn-delete {
          background: #991b1b;
          color: white;
          border-color: #991b1b;
        }

        .demo-btn-delete:hover {
          background: #7f1d1d;
          border-color: #7f1d1d;
        }

        .demo-btn-auto {
          background: linear-gradient(45deg, #8b5cf6, #a855f7);
          color: white;
          border-color: #8b5cf6;
        }

        .demo-btn-input {
          background: #f8fafc;
          color: #475569;
          border-color: #cbd5e1;
        }

        .demo-btn-input:hover {
          background: #f1f5f9;
          border-color: #8b5cf6;
          color: #8b5cf6;
        }

        .usage-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
        }

        .usage-card {
          background: white;
          border: 2px solid #f1f5f9;
          border-radius: 12px;
          padding: 24px;
        }

        .usage-card h4 {
          margin: 0 0 16px 0;
          color: #1e293b;
          font-size: 16px;
          font-weight: 600;
        }

        .usage-card pre {
          background: #1e293b;
          color: #e2e8f0;
          padding: 16px;
          border-radius: 8px;
          overflow-x: auto;
          font-size: 12px;
          line-height: 1.5;
          margin: 0;
        }

        .usage-card code {
          font-family: 'Monaco', 'Consolas', monospace;
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .modal-demo {
            padding: 16px;
          }

          .demo-grid {
            grid-template-columns: 1fr;
          }

          .usage-info {
            grid-template-columns: 1fr;
          }

          .demo-header h2 {
            font-size: 24px;
          }
        }
      `}</style>
    </AdminLayout>
  );
};

export default ModalDemo;
