import React from 'react';
import '../../styles/components/Pagination/Pagination.css';

const Pagination = ({ 
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  itemsPerPage = 10,
  onPageChange,
  itemType = 'items' // e.g., 'orders', 'products', 'users'
}) => {
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const getShowingText = () => {
    if (totalItems === 0) {
      return `Showing 0 to 0 of 0 ${itemType}`;
    }
    
    const startItem = ((currentPage - 1) * itemsPerPage) + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
    return `Showing ${startItem} to ${endItem} of ${totalItems} ${itemType}`;
  };

  return (
    <div className="professional-pagination-container">
      <div className="pagination-info-section">
        <div className="pagination-summary">
          <span className="summary-text">
            {getShowingText()}
          </span>
        </div>
      </div>
      
      <div className="pagination-controls-section">
        <button
          className={`pagination-nav-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}`}
          disabled={currentPage === 1}
          onClick={handlePrevious}
        >
          <span className="nav-icon">←</span>
          <span className="nav-text">Previous</span>
        </button>
        
        <div className="pagination-numbers">
          <span className="page-indicator">
            Page <strong>{currentPage}</strong> of <strong>{Math.max(totalPages, 1)}</strong>
          </span>
        </div>
        
        <button
          className={`pagination-nav-btn next-btn ${currentPage === totalPages || totalPages <= 1 ? 'disabled' : ''}`}
          disabled={currentPage === totalPages || totalPages <= 1}
          onClick={handleNext}
        >
          <span className="nav-text">Next</span>
          <span className="nav-icon">→</span>
        </button>
      </div>
    </div>
  );
};

export default Pagination;