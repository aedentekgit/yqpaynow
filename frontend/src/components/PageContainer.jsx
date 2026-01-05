import React from 'react';
import config from '../config';
import '../styles/PageContainer.css'; // Extracted inline styles

const PageContainer = ({ 
  children, 
  className = '', 
  hasHeader = true,
  headerContent = null,
  headerButton = null,
  backButton = null,
  title = '',
  subtitle = '',
  verticalHeader = false  // New prop for vertical layout
}) => {
  return (
    <div className={`page-container ${className}`}>
      <div className="page-main-container">
        {hasHeader && (
          <div 
            className={`page-header ${verticalHeader ? 'vertical-header' : ''} page-header-gradient`}
          >
            {headerContent ? (
              headerContent
            ) : (
              <>
                {verticalHeader ? (
                  /* Vertical Layout Structure */
                  <>
                    <div className="header-content">
                      {backButton && backButton.show && (
                        <div className="back-button-container">
                          <button 
                            className="back-btn"
                            onClick={backButton.onClick}
                            title={backButton.text || 'Go Back'}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-back">
                              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                            {backButton.text || 'Back'}
                          </button>
                        </div>
                      )}
                      <h1>{title}</h1>
                      {subtitle && <p>{subtitle}</p>}
                    </div>
                    {headerButton && (
                      <div className="header-button">
                        {headerButton}
                      </div>
                    )}
                  </>
                ) : (
                  /* Horizontal Layout Structure (Default) */
                  <>
                    <div className="header-content">
                      {backButton && backButton.show && (
                        <div className="back-button-container">
                          <button 
                            className="back-btn"
                            onClick={backButton.onClick}
                            title={backButton.text || 'Go Back'}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-back">
                              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                            {backButton.text || 'Back'}
                          </button>
                        </div>
                      )}
                      <h1>{title}</h1>
                      {subtitle && <p>{subtitle}</p>}
                    </div>
                    {headerButton && (
                      <div className="header-button">
                        {headerButton}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageContainer;