// Global Design System - React Components
// Reusable React components based on Theater List UX

import React from 'react';
import config from '../config';
import '../styles/components/GlobalDesignSystem.css'; // Extracted inline styles

// Page Header Component
export const PageHeader = ({ 
  title, 
  subtitle, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`page-header ${className}`}>
      <div className="page-header-content">
        <div>
          <h1 className="page-header-title">{title}</h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
        {children && (
          <div className="page-header-actions">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

// Filter Controls Component
export const FilterControls = ({ 
  title = "Filters", 
  children, 
  className = '' 
}) => {
  return (
    <div className={`filter-controls ${className}`}>
      <div className="filter-controls-header">
        <h3 className="filter-controls-title">{title}</h3>
      </div>
      <div className="filter-controls-grid">
        {children}
      </div>
    </div>
  );
};

// Filter Group Component
export const FilterGroup = ({ 
  label, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`filter-group ${className}`}>
      {label && <label className="filter-label">{label}</label>}
      {children}
    </div>
  );
};

// Filter Input Component
export const FilterInput = ({ 
  type = "text", 
  placeholder, 
  value, 
  onChange, 
  className = '' 
}) => {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`filter-input ${className}`}
    />
  );
};

// Filter Select Component
export const FilterSelect = ({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Select...", 
  className = '' 
}) => {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`filter-input ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option, index) => (
        <option key={index} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// Data Table Component
export const DataTable = ({ 
  columns = [], 
  data = [], 
  className = '' 
}) => {
  return (
    <div className={`data-table-container ${className}`}>
      <table className="data-table">
        <thead className="data-table-header">
          <tr>
            {columns.map((column, index) => (
              <th key={index} style={{ width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? (
            data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column, colIndex) => (
                  <td key={colIndex}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">No data found</div>
                <div className="empty-state-description">
                  There are no records to display at this time.
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// Button Component
export const Button = ({ 
  variant = 'primary', 
  size = 'base', 
  children, 
  onClick, 
  disabled = false, 
  loading = false, 
  className = '',
  type = 'button',
  ...props 
}) => {
  const buttonClass = `btn btn-${variant} btn-${size} ${className}`;
  
  return (
    <button
      type={type}
      className={buttonClass}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="spinner" />
          Loading...
        </>
      ) : (
        children
      )}
    </button>
  );
};

// Card Component
export const Card = ({ 
  title, 
  children, 
  footer, 
  className = '' 
}) => {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
        </div>
      )}
      <div className="card-body">
        {children}
      </div>
      {footer && (
        <div className="card-footer">
          {footer}
        </div>
      )}
    </div>
  );
};

// Status Badge Component
export const StatusBadge = ({ 
  status, 
  children, 
  className = '' 
}) => {
  return (
    <span className={`status-badge ${status} ${className}`}>
      {children}
    </span>
  );
};

// Action Button Component
export const ActionButton = ({ 
  action, 
  onClick, 
  children, 
  className = '' 
}) => {
  return (
    <button
      className={`action-btn ${action} ${className}`}
      onClick={onClick}
      title={children}
    >
      {children}
    </button>
  );
};

// Action Buttons Group Component
export const ActionButtons = ({ 
  children, 
  className = '' 
}) => {
  return (
    <div className={`action-buttons ${className}`}>
      {children}
    </div>
  );
};

// Modal Component
export const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer, 
  size = 'md',
  className = '' 
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className={`modal modal-${size} ${className}`}>
        {title && (
          <div className="card-header">
            <h3 className="card-title">{title}</h3>
            <button 
              className="action-btn delete global-design-margin-left-auto"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        )}
        <div className="card-body">
          {children}
        </div>
        {footer && (
          <div className="card-footer">
            {footer}
          </div>
        )}
      </div>
    </>
  );
};

// Form Group Component
export const FormGroup = ({ 
  label, 
  error, 
  help, 
  children, 
  className = '',
  required = false
}) => {
  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label className={`form-label ${required ? 'required' : ''}`}>
          {label}
        </label>
      )}
      {children}
      {error && <div className="form-error">{error}</div>}
      {help && <div className="form-help">{help}</div>}
    </div>
  );
};

// Form Input Component
export const FormInput = ({ 
  type = 'text', 
  placeholder, 
  value, 
  onChange, 
  error, 
  className = '',
  ...props 
}) => {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`form-input ${error ? 'error' : ''} ${className}`}
      {...props}
    />
  );
};

// Form Textarea Component
export const FormTextarea = ({ 
  placeholder, 
  value, 
  onChange, 
  error, 
  rows = 4,
  className = '',
  ...props 
}) => {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      className={`form-textarea ${error ? 'error' : ''} ${className}`}
      {...props}
    />
  );
};

// Form Select Component
export const FormSelect = ({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Select...", 
  error,
  className = '',
  ...props 
}) => {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`form-select ${error ? 'error' : ''} ${className}`}
      {...props}
    >
      <option value="">{placeholder}</option>
      {options.map((option, index) => (
        <option key={index} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// Form Section Component
export const FormSection = ({ 
  title, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`form-section ${className}`}>
      {title && <h2 className="form-section-title">{title}</h2>}
      <div className="form-grid">
        {children}
      </div>
    </div>
  );
};

// Form Container Component
export const FormContainer = ({ 
  children, 
  className = '' 
}) => {
  return (
    <div className={`form-container ${className}`}>
      {children}
    </div>
  );
};

// Form Actions Component
export const FormActions = ({ 
  children, 
  align = 'end', 
  className = '' 
}) => {
  return (
    <div className={`form-actions ${align} ${className}`}>
      {children}
    </div>
  );
};

// File Upload Component
export const FileUpload = ({ 
  onFileSelect, 
  accept = "*", 
  multiple = false, 
  className = '',
  children,
  icon = "📁",
  text = "Click to upload or drag and drop",
  subtext = "Upload your files here"
}) => {
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (onFileSelect) {
      onFileSelect(multiple ? files : files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (onFileSelect) {
      onFileSelect(multiple ? files : files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div 
      className={`file-upload ${className}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        id={`file-upload-${Math.random()}`}
      />
      <label htmlFor={`file-upload-${Math.random()}`} className="file-upload-content">
        {children || (
          <>
            <div className="file-upload-icon">{icon}</div>
            <div className="file-upload-text">{text}</div>
            <div className="file-upload-subtext">{subtext}</div>
          </>
        )}
      </label>
    </div>
  );
};

// Toast Component
export const Toast = ({ 
  type = 'info', 
  message, 
  isVisible, 
  onClose, 
  duration = 3000 
}) => {
  React.useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className={`toast ${type}`}>
      <div className="flex justify-between items-start">
        <div>{message}</div>
        <button 
          className="action-btn delete ml-4"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// Loading Spinner Component
export const Spinner = ({ 
  size = 'base', 
  className = '' 
}) => {
  return (
    <div className={`spinner ${size === 'lg' ? 'spinner-lg' : ''} ${className}`} />
  );
};

// Empty State Component
export const EmptyState = ({ 
  icon = '📋', 
  title = 'No data found', 
  description = 'There are no records to display at this time.', 
  action, 
  className = '' 
}) => {
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-description">{description}</div>
      {action && <div>{action}</div>}
    </div>
  );
};

// Container Component
export const Container = ({ 
  fluid = false, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`${fluid ? 'container-fluid' : 'container'} ${className}`}>
      {children}
    </div>
  );
};

// Grid Component
export const Grid = ({ 
  cols = 'auto', 
  gap = '4', 
  children, 
  className = '' 
}) => {
  return (
    <div className={`grid grid-cols-${cols} gap-${gap} ${className}`}>
      {children}
    </div>
  );
};

// Flex Component
export const Flex = ({ 
  direction = 'row', 
  justify = 'start', 
  align = 'start', 
  gap = '0', 
  wrap = false, 
  children, 
  className = '' 
}) => {
  const flexClass = [
    'flex',
    `flex-${direction}`,
    `justify-${justify}`,
    `items-${align}`,
    gap && `gap-${gap}`,
    wrap && 'flex-wrap',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={flexClass}>
      {children}
    </div>
  );
};