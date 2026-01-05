import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/components/VerticalPageHeader.css'; // Extracted inline styles

const VerticalPageHeader = ({
  title,
  subtitle,
  backButtonText = "← Back",
  backButtonPath,
  actionButton,
  showBackButton = true,
  customBackAction,
  className = ""
}) => {
  const navigate = useNavigate();

  const handleBackClick = () => {
    if (customBackAction) {
      customBackAction();
    } else if (backButtonPath) {
      navigate(backButtonPath);
    } else {
      navigate(-1); // Go back to previous page
    }
  };

  return (
    <div className={`vertical-page-header ${className}`}>
      {showBackButton && (
        <div className="back-button-row">
          <button 
            className="back-btn"
            onClick={handleBackClick}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-back">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            {backButtonText}
          </button>
        </div>
      )}
      
      <div className="title-and-action-row">
        <div className="title-container">
          <h1>{title}</h1>
          {subtitle && <p className="header-subtitle">{subtitle}</p>}
        </div>
        {actionButton && (
          <div className="action-button-container">
            {actionButton}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerticalPageHeader;