import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import config from '../config';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import InstantImage from '../components/InstantImage';
import { useModal } from '../contexts/ModalContext';
import JSZip from 'jszip';
import { optimizedFetch } from '../utils/apiOptimizer';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/TheaterUserDetails.css'; // Primary styles for vertical layout and table design
import { clearTheaterCache, addCacheBuster } from '../utils/cacheManager';
import { clearCachePattern } from '../utils/cacheUtils'; // For clearing QR code caches
import { usePerformanceMonitoring, preventLayoutShift } from '../hooks/usePerformanceMonitoring';
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';

// Helper function to get authenticated headers
const getAuthHeaders = () => {
  const authToken = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Accept': 'application/json',
    ...(authToken && { 'Authorization': `Bearer ${authToken}` })
  };
};

// Enhanced Lazy Loading QR Image Component with Intersection Observer (matching QRManagement)
const LazyQRImage = React.memo(({ src, alt, className, style }) => {
  const [imageSrc, setImageSrc] = useState('/placeholder-qr.png');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && src && src !== '/placeholder-qr.png') {
          const img = new Image();
          img.onload = () => {
            setImageSrc(src);
            setIsLoading(false);
            setHasError(false);
          };
          img.onerror = () => {
            setHasError(true);
            setIsLoading(false);
          };
          img.src = src;
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  return (
    <div className="lazy-qr-container">
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
      />
      {isLoading && (
        <div className="qr-loading-placeholder">
          <div className="qr-skeleton"></div>
        </div>
      )}
    </div>
  );
});

LazyQRImage.displayName = 'LazyQRImage';

// QR Card Component
const QRCard = React.memo(({ qrCode, onView, onDownload, onToggleStatus, onDelete, actionLoading }) => (
  <div className="qr-detail-card">
    <div className="qr-image">
      <LazyQRImage 
        src={qrCode.qrImageUrl} 
        alt={qrCode.name}
        className="qr-img"
      />
      <div className="qr-type-badge">
        {qrCode.qrType === 'canteen' ? '🍕' : '🎬'}
      </div>
      <div className={`qr-status-indicator ${qrCode.isActive ? 'active' : 'inactive'}`}></div>
    </div>
    
    <div className="qr-info">
      <h3 className="qr-name">{qrCode.name}</h3>
      {qrCode.qrType === 'screen' && (
        <p className="qr-seat">
          {qrCode.screenName} - Seat {qrCode.seatNumber}
        </p>
      )}
      <div className="qr-stats">
        <span>Orders: {qrCode.orderCount || 0}</span>
        <span>Revenue: ₹{qrCode.totalRevenue || 0}</span>
      </div>
      <div className="qr-status">
        <span className={`status ${qrCode.isActive ? 'active' : 'inactive'}`}>
          {qrCode.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
    
    <div className="qr-actions">
      <ActionButtons>
        <ActionButton
          type="view"
          onClick={() => onView(qrCode)}
          title="View QR Details"
        />
        <ActionButton
          type="download"
          onClick={() => onDownload(qrCode)}
          title="Download QR"
        />
        <ActionButton
          type="delete"
          onClick={() => onDelete(qrCode._id, qrCode.name)}
          disabled={actionLoading[qrCode._id]}
          title="Delete QR Code"
        />
      </ActionButtons>
    </div>
  </div>
));

QRCard.displayName = 'QRCard';

// New QR Code View Modal Component - Simplified Design
const QRCodeViewModal = React.memo(({ isOpen, qrCode, mode, theater, onClose, onSave, onDelete, onModeChange, actionLoading, displayImageUrl, onSeatEdit, onToggleStatus, qrNames = [], existingQRNames = [] }) => {
  const [formData, setFormData] = useState({
    name: '',
    qrType: 'single',
    screenName: '',
    seatNumber: '',
    location: '',
    isActive: true,
    ...qrCode
  });

  // Track when modal was just opened to prevent immediate close
  const justOpenedRef = useRef(false);
  const openTimeRef = useRef(0);

  useEffect(() => {
    if (qrCode && isOpen) {
      // Only update formData when modal is open and qrCode exists
      setFormData({ ...qrCode });
      // Mark that modal was just opened
      justOpenedRef.current = true;
      openTimeRef.current = Date.now();
      // Reset the flag after a longer delay to allow all click events to settle
      setTimeout(() => {
        justOpenedRef.current = false;
      }, 1000); // Increased to 1 second to match parent component
    }
  }, [qrCode, isOpen]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) {
    e.preventDefault();
    }
    onSave(formData);
  };

  const handleDelete = () => {
    // Call onDelete which will open the global delete modal
    onDelete(formData._id, formData.name);
    // Close the CRUD modal
    onClose();
  };

  const isReadOnly = mode === 'view';
  const isEditing = mode === 'edit';

  const getModalTitle = () => {
    switch (mode) {
      case 'view': return 'View QR Code';
      case 'edit': return 'Edit QR Code';
      case 'create': return 'Create QR Code';
      default: return 'QR Code Details';
    }
  };

  // Early return if modal is not open
  if (!isOpen) return null;

  // Simple overlay click handler - only close on direct overlay click
  const handleOverlayClick = (e) => {
    // Only close if clicking directly on the overlay, not on child elements
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleModalContentClick = (e) => {
    // Prevent any clicks inside modal from closing it
    e.stopPropagation();
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Render modal using React Portal to avoid event propagation issues
  const modalContent = (
    <div 
      className="qr-modal-overlay-new" 
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
    >
      <div 
        className="qr-modal-content-new theater-edit-modal-content" 
        onClick={handleModalContentClick}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '900px',
          width: '85%',
          maxHeight: '95vh',
          minHeight: '600px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        <div className="modal-header">
          <div className="modal-nav-left">
          </div>
          
          <div className="modal-title-section">
            <h2>{getModalTitle()}</h2>
          </div>
          
          <div className="modal-nav-right">
            <button 
              className="close-btn"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="modal-body">
          <div className="edit-form">
            <div className="form-group">
              <label>QR Code Name *</label>
              <select
                name="name"
                className="form-control"
                value={formData.name || ''}
                onChange={(e) => {
                  // Find the selected QR name to get its seatClass
                  const selectedQRName = qrNames.find(qr => qr.qrName === e.target.value);
                  
                  // Update both name and seatClass
                  setFormData(prev => ({
                    ...prev,
                    name: e.target.value,
                    screenName: selectedQRName?.seatClass || prev.screenName,
                    seatClass: selectedQRName?.seatClass || prev.seatClass
                  }));
                }}
                disabled={isReadOnly}
                required
              >
                <option value="">Select QR Code Name</option>
                {qrNames
                  .filter(qr => {
                    // Show only unused QR names OR the current QR name being edited
                    return !existingQRNames.includes(qr.qrName) || qr.qrName === qrCode?.name;
                  })
                  .map((qr, index) => (
                  <option key={index} value={qr.qrName}>
                    {qr.qrName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>QR Type</label>
              <select
                name="qrType"
                className="form-control"
                value={formData.qrType || 'single'}
                onChange={handleInputChange}
                disabled={isReadOnly}
              >
                <option value="single">Single QR</option>
                <option value="screen">Screen QR</option>
              </select>
            </div>

            {/* Show Screen Name and Seat Number if they exist in the data */}
            {(formData.qrType === 'screen' || formData.screenName || formData.seatClass) && (
              <>
                <div className="form-group">
                  <label>Screen Name</label>
                  <input
                    type="text"
                    name="screenName"
                    className="form-control input-disabled"
                    value={formData.screenName || formData.seatClass || ''}
                    onChange={handleInputChange}
                    disabled={true}
                    readOnly
                    placeholder="Auto-filled from QR Code Name"
                  />
                </div>

                {formData.seatNumber && (
                  <div className="form-group">
                    <label>Seat Number</label>
                    <input
                      type="text"
                      name="seatNumber"
                      className="form-control"
                      value={formData.seatNumber || ''}
                      onChange={handleInputChange}
                      disabled={isReadOnly}
                      placeholder="Enter seat number"
                    />
                  </div>
                )}
              </>
            )}

            {/* PHASE 2 FIX: Hide QR Preview for screen-type QR codes (seat rows) */}
            {(() => {
              const shouldShowQRPreview = formData.qrType !== 'screen' && !formData.isSeatRow;

              return shouldShowQRPreview;
            })() && (
              <div className="form-group full-width">
                <label>QR Code Preview</label>
                <div className="qr-preview">
                {displayImageUrl ? (
                  <div className="qr-preview-styled-container">
                    {/* Styled QR Preview Card - Match Single Screen QR Style Perfectly */}
                    {/* The displayImageUrl already contains the full rendered QR code with all elements */}
                    <div className="qr-preview-card-portrait">
                      <InstantImage 
                        src={displayImageUrl} 
                        alt="QR Code Preview"
                        className="qr-preview-full-image"
                        onLoad={(e) => {
                          if (e.target.nextElementSibling && e.target.nextElementSibling.style) {
                            e.target.nextElementSibling.style.display = 'none';
                          }
                        }}
                        onError={(e) => {
                          // Hide the broken image silently
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="qr-preview-placeholder">
                    <span>🔍</span>
                    <h4>No QR Code Available</h4>
                    <p>No QR code image URL found for this item.</p>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Display seat information for screen-type QR codes instead of QR preview */}
            {(() => {
              // Show individual seat info only if it's a seat row
              const shouldShowSeatInfo = formData.isSeatRow;

              return shouldShowSeatInfo;
            })() && (
              <div className="form-group full-width qr-seat-info-container">
                <label>Seat Information</label>
                <div className="qr-seat-info-display">
                  <div className="qr-seat-info-item">
                    <div className="qr-seat-info-label">QR Code Name</div>
                    <div className="qr-seat-info-value">{formData.name || formData.parentQRName}</div>
                  </div>
                  <div className="qr-seat-info-item">
                    <div className="qr-seat-info-label">Seat Number</div>
                    <div className="qr-seat-info-value highlight">{formData.seatNumber || 'N/A'}</div>
                  </div>
                  <div className="qr-seat-info-item">
                    <div className="qr-seat-info-label">Seat Class</div>
                    <div className="qr-seat-info-value">{formData.seatClass || 'N/A'}</div>
                  </div>
                  
                  {/* Show QR Code Image for individual seat in view/edit mode */}
                  {formData.isSeatRow && formData.qrImageUrl && (
                    <div className="qr-seat-image-section">
                      <div className="qr-seat-image-label">QR Code Image</div>
                      <div className="qr-seat-image-container">
                        <InstantImage 
                          src={formData.qrImageUrl} 
                          alt={`QR Code for ${formData.seatNumber}`}
                          className="qr-seat-image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'block';
                          }}
                        />

                        <div className="qr-seat-image-error">
                          QR code image not available
                        </div>
                      </div>
                      
                      {/* Download Button for Seat QR Code */}
                      <div className="qr-seat-download-container">
                        <button
                          type="button"
                          className="qr-seat-download-btn"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = formData.qrImageUrl;
                            link.download = `${formData.seatClass || formData.name}_${formData.seatNumber}_QR.png`;
                            link.target = '_blank';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                        >
                          <span>📥</span>
                          <span>Download QR Code</span>
                        </button>
                      </div>
                      
                      {/* QR Image Update in Edit Mode */}
                      {mode === 'edit' && (
                        <div className="qr-seat-update-section">
                          <label className="qr-seat-update-label">
                            Update QR Code Image URL:
                          </label>
                          <p className="qr-seat-update-note">
                            Paste the new Google Cloud Storage URL for this seat's QR code
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Visual Seat Grid Display for Screen QR Codes (parent view) */}
            {(() => {
              // Show seat grid only if it's a screen-type QR with seats (not an individual seat row)
              const shouldShowSeatGrid = formData.qrType === 'screen' && !formData.isSeatRow && formData.seats && formData.seats.length > 0;

              return shouldShowSeatGrid;
            })() && (
              <div className="form-group full-width qr-seat-layout-container">
                <label className="form-label-large">
                  Seat Layout ({formData.seats.length} seats)
                </label>
                <div className="qr-seat-layout-wrapper">
                  {/* Screen Header with Download All Button */}
                  <div className="qr-seat-screen-header">
                    <div className="qr-seat-screen-title">
                      <span>🎬</span>
                      <span>SCREEN - {formData.seatClass || formData.name}</span>
                    </div>
                    
                    <div className="qr-seat-screen-actions">
                      {mode === 'view' && (
                        <button
                          type="button"
                          className="qr-seat-action-btn"
                          onClick={() => {
                            const currentMaxSeat = Math.max(...formData.seats.map(s => {
                              const match = s.seat.match(/\d+/);
                              return match ? parseInt(match[0]) : 0;
                            }));
                            const nextSeatNumber = currentMaxSeat + 1;
                            const newSeatName = `A${nextSeatNumber}`;
                            
                            // Create new seat data
                            const newSeatData = {
                              ...formData,
                              isSeatRow: true,
                              seatNumber: newSeatName,
                              qrImageUrl: null,
                              isActive: true,
                              scanCount: 0,
                              seatId: `new_${Date.now()}`,
                              parentQRDetailId: formData._id,
                              parentDocId: formData.parentDocId || formData._id,
                              _id: `${formData._id}_new_${Date.now()}`,
                              parentQRName: formData.name,
                              seatClass: formData.seatClass,
                              seats: formData.seats,
                              isNewSeat: true
                            };
                            

                            // Switch to edit mode for the new seat
                            if (onSeatEdit) {
                              onSeatEdit(newSeatData);
                            }
                          }}
                        >
                          <span>➕</span>
                          <span>Add Seat</span>
                        </button>
                      )}
                      
                      {mode === 'view' && formData.seats.filter(s => s.qrCodeUrl).length > 0 && (
                        <button
                          type="button"
                          className="qr-seat-action-btn"
                          onClick={async () => {
                            const seatsWithQR = formData.seats.filter(s => s.qrCodeUrl);

                            try {
                              const zip = new JSZip();
                              const folder = zip.folder(`${formData.seatClass || formData.name}_QR_Codes`);
                              
                              // Fetch all QR code images
                              const fetchPromises = seatsWithQR.map(async (seat) => {
                                try {
                                  const response = await fetch(seat.qrCodeUrl);
                                  const blob = await response.blob();
                                  const filename = `${seat.seat}_QR.png`;
                                  folder.file(filename, blob);
  } catch (error) {
                                  // Silent fail for individual seat
  }
                              });
                              
                              await Promise.all(fetchPromises);
                              
                              // Generate ZIP file
                              const zipBlob = await zip.generateAsync({ type: 'blob' });
                              
                              // Download ZIP
                              const link = document.createElement('a');
                              link.href = URL.createObjectURL(zipBlob);
                              link.download = `${formData.seatClass || formData.name}_QR_Codes.zip`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(link.href);
                              
                              alert(`✅ Downloaded ${seatsWithQR.length} QR codes as ZIP file!`);
                            } catch (error) {
                              alert('❌ Failed to create ZIP file. Please try again.');
                            }
                          }}
                        >
                          <span>📦</span>
                          <span>Download All ({formData.seats.filter(s => s.qrCodeUrl).length})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Seat Grid - Grouped by Row Letter */}
                  <div className="qr-seat-grid-container">
                    {(() => {
                      // Group seats by their letter prefix
                      const seatsByRow = {};
                      formData.seats.forEach(seat => {
                        const rowLetter = seat.seat.match(/^[A-Za-z]+/)?.[0] || 'Other';
                        if (!seatsByRow[rowLetter]) {
                          seatsByRow[rowLetter] = [];
                        }
                        seatsByRow[rowLetter].push(seat);
                      });

                      // Sort rows alphabetically
                      const sortedRows = Object.keys(seatsByRow).sort();

                      return sortedRows.map(rowLetter => (
                        <div key={rowLetter} className="qr-seat-row">
                          {/* Row Label */}
                          <div className="qr-seat-row-label">
                            {rowLetter}
                          </div>

                          {/* Seat Buttons in this row */}
                          <div className="qr-seat-row-seats">
                            {seatsByRow[rowLetter]
                              .sort((a, b) => {
                                // Sort by number part: A1, A2, A3, etc.
                                const numA = parseInt(a.seat.match(/\d+/)?.[0] || '0');
                                const numB = parseInt(b.seat.match(/\d+/)?.[0] || '0');
                                return numA - numB;
                              })
                              .map((seat, index) => (
                                <div
                                  key={seat._id || index}
                                  className={`qr-seat-button ${!seat.isActive ? 'inactive' : ''}`}
                                  title={mode === 'view' ? `Left-click: Edit | Right-click: Download ${seat.seat}` : `Editing ${seat.seat}`}
                                  onClick={() => {
                                    // In view mode: Trigger seat edit callback
                                    if (mode === 'view' && onSeatEdit) {
                                      const seatData = {
                                        ...formData,
                                        isSeatRow: true,
                                        seatNumber: seat.seat,
                                        qrImageUrl: seat.qrCodeUrl,
                                        isActive: seat.isActive,
                                        scanCount: seat.scanCount || 0,
                                        seatId: seat._id,
                                        parentQRDetailId: formData._id,
                                        parentDocId: formData.parentDocId || formData._id,
                                        _id: `${formData._id}_${seat._id}`,
                                        parentQRName: formData.name,
                                        seatClass: formData.seatClass,
                                        seats: formData.seats
                                      };
                                      

                                      onSeatEdit(seatData);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault(); // Prevent default context menu
                                    if (seat.qrCodeUrl && mode === 'view') {
                                      // Download QR code for this seat
                                      const link = document.createElement('a');
                                      link.href = seat.qrCodeUrl;
                                      link.download = `${formData.seatClass || formData.name}_${seat.seat}_QR.png`;
                                      link.target = '_blank';
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                      
                                      // Visual feedback
                                      e.currentTarget.style.transform = 'scale(0.95)';
                                      setTimeout(() => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }, 150);
                                    }
                                  }}
                                >
                                  {seat.seat}
                                  {seat.qrCodeUrl && (
                                    <div className="qr-seat-qr-indicator" title="QR code available" />
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Legend */}
                  <div className="qr-seat-legend">
                    <div className="qr-seat-legend-item">
                      <div className="qr-seat-legend-box"></div>
                      <span>Active with QR</span>
                    </div>
                    <div className="qr-seat-legend-item">
                      <div className="qr-seat-legend-box inactive"></div>
                      <span>Inactive</span>
                    </div>
                    <div className="qr-seat-legend-item">
                      <div className="qr-seat-legend-dot"></div>
                      <span>QR Code Available (click to view)</span>
                    </div>
                  </div>

                  {/* Seat Count Summary */}
                  <div className="qr-seat-summary">
                    <div className="qr-seat-summary-text">
                      <strong>Summary:</strong> {formData.seats.filter(s => s.isActive).length} active seats, 
                      {' '}{formData.seats.filter(s => s.qrCodeUrl).length} with QR codes
                    </div>
                    <div className="qr-seat-quick-actions">
                      <strong>Quick Actions:</strong> Left-click to edit � Right-click to download
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* <div className="form-group stats-group">
              <div className="stat-item">
                <span className="stat-label">Orders:</span>
                <span className="stat-value">{formData.orderCount || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Revenue:</span>
                <span className="stat-value">₹{formData.totalRevenue || 0}</span>
              </div>
            </div> */}
          </div>
        </div>

        {/* Modal Footer */}
        <div 
          className="modal-actions"
          style={{
            padding: '16px 24px',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}
        >
          {mode === 'view' && !formData.isSeatRow && (
            <>
              <button 
                type="button" 
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  minWidth: '100px'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => onModeChange('edit')}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  minWidth: '100px'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                }}
              >
                Edit
              </button>
            </>
          )}
          
          {mode === 'view' && formData.isSeatRow && (
            <>
              <button 
                type="button" 
                onClick={() => {
                  // Navigate back to parent screen QR view
                  if (formData.parentQRDetailId) {
                    const parentQR = {
                      _id: formData.parentQRDetailId,
                      parentDocId: formData.parentDocId || formData._id,
                      name: formData.parentQRName || formData.seatClass,
                      qrType: 'screen',
                      seatClass: formData.seatClass,
                      seats: formData.seats,
                      qrImageUrl: formData.qrImageUrl,
                      isActive: formData.isActive
                    };
                    onModeChange('view', parentQR);
                  } else {
                    onClose();
                  }
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  marginRight: 'auto'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDelete && formData.seatId) {
                    onDelete(formData.seatId, `Seat ${formData.seatNumber}`);
                  }
                }}
                disabled={actionLoading[formData.seatId]}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: actionLoading[formData.seatId] ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  cursor: actionLoading[formData.seatId] ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!actionLoading[formData.seatId]) {
                    e.target.style.backgroundColor = '#b91c1c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!actionLoading[formData.seatId]) {
                    e.target.style.backgroundColor = '#dc2626';
                  }
                }}
              >
                {actionLoading[formData.seatId] ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => onModeChange('edit')}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                }}
              >
                Edit
              </button>
            </>
          )}
          
          {mode === 'edit' && formData.isSeatRow && (
            <>
              <button 
                type="button" 
                onClick={() => {
                  // Switch back to view mode instead of closing
                  onModeChange('view');
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  marginRight: 'auto'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#dc2626';
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDelete && formData.seatId) {
                    onDelete(formData.seatId, `Seat ${formData.seatNumber}`);
                  }
                }}
                disabled={actionLoading[formData.seatId]}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: actionLoading[formData.seatId] ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  cursor: actionLoading[formData.seatId] ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!actionLoading[formData.seatId]) {
                    e.target.style.backgroundColor = '#b91c1c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!actionLoading[formData.seatId]) {
                    e.target.style.backgroundColor = '#dc2626';
                  }
                }}
              >
                {actionLoading[formData.seatId] ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={actionLoading[formData._id]}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: actionLoading[formData._id] 
                    ? 'linear-gradient(135deg, #9ca3af 0%, #9ca3af 100%)'
                    : 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: actionLoading[formData._id] ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!actionLoading[formData._id]) {
                    e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!actionLoading[formData._id]) {
                    e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                  }
                }}
              >
                {actionLoading[formData._id] ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
          
          {mode === 'edit' && !formData.isSeatRow && (
            <>
              <button 
                type="button" 
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={actionLoading[formData._id]}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: actionLoading[formData._id] 
                    ? 'linear-gradient(135deg, #9ca3af 0%, #9ca3af 100%)'
                    : 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: actionLoading[formData._id] ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!actionLoading[formData._id]) {
                    e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!actionLoading[formData._id]) {
                    e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                  }
                }}
              >
                {actionLoading[formData._id] ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
          
          {mode === 'create' && (
            <>
              <button 
                type="button" 
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={actionLoading.new}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: actionLoading.new 
                    ? 'linear-gradient(135deg, #9ca3af 0%, #9ca3af 100%)'
                    : 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)',
                  color: 'white',
                  cursor: actionLoading.new ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!actionLoading.new) {
                    e.target.style.background = 'linear-gradient(135deg, #5A0C82 0%, #4A0A6B 100%)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!actionLoading.new) {
                    e.target.style.background = 'linear-gradient(135deg, #6B0E9B 0%, #5A0C82 100%)';
                  }
                }}
              >
                {actionLoading.new ? 'Creating...' : 'Create QR Code'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Use React Portal to render modal outside the DOM hierarchy
  return ReactDOM.createPortal(modalContent, document.body);
});

QRCodeViewModal.displayName = 'QRCodeViewModal';

// Skeleton component for QR cards (matching performance patterns)
const QRCardSkeleton = React.memo(() => (
  <div className="qr-detail-card skeleton-card">
    <div className="qr-image skeleton-image"></div>
    <div className="qr-info">
      <div className="skeleton-line skeleton-title"></div>
      <div className="skeleton-line skeleton-text"></div>
      <div className="skeleton-line skeleton-stats"></div>
    </div>
    <div className="qr-actions">
      <div className="skeleton-button"></div>
      <div className="skeleton-button"></div>
      <div className="skeleton-button"></div>
      <div className="skeleton-button"></div>
    </div>
  </div>
));

QRCardSkeleton.displayName = 'QRCardSkeleton';

const TheaterQRDetail = () => {
  const { theaterId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { showError, showSuccess, alert } = useModal();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterQRDetail');
  
  // Data from navigation state or fetch
  const [theater, setTheater] = useState(location.state?.theater || null);
  // ✅ FIX: Don't show loading if we have theater data from navigation (instant display)
  const [loading, setLoading] = useState(() => {
    // If we have theater data passed from navigation, don't show loading screen
    return !location.state?.theater;
  });
  const [actionLoading, setActionLoading] = useState({});
  const [togglingQRId, setTogglingQRId] = useState(null); // Track which QR is being toggled
  
  // QR Names state for dynamic sidebar
  const [qrNames, setQrNames] = useState([]);
  const [qrNamesLoading, setQrNamesLoading] = useState(true);
  
  // QR Codes grouped by name
  const [qrCodesByName, setQrCodesByName] = useState({});
  
  // Pagination state (matching RolesList)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Search state (matching RolesList)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Performance refs (matching QRManagement)
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  
  // Active category state - will be set to first QR name when loaded
  const [activeCategory, setActiveCategory] = useState(null);
  
  // Force render state for tab reloading
  const [forceRender, setForceRender] = useState(0);
  
  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    isActive: ''
  });
  
  // CRUD Modal state
  const [crudModal, setCrudModal] = useState({
    isOpen: false,
    qrCode: null,
    mode: 'view' // 'view', 'edit', 'create'
  });

  // Delete Modal state (matching Theater Management global design)
  const [deleteModal, setDeleteModal] = useState({ show: false, qrCode: null });

  // Prevent body scroll and handle escape key for delete modal
  useEffect(() => {
    if (deleteModal.show) {
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Handle escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          setDeleteModal({ show: false, qrCode: null });
        }
      };
      
      document.addEventListener('keydown', handleEscape);
      
      return () => {
        document.body.style.overflow = 'unset';
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [deleteModal.show]);

  // Display image URL state for signed URL
  const [displayImageUrl, setDisplayImageUrl] = useState(null);

  // Debounced search effect (matching RolesList)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Load QR Names for dynamic sidebar
  const loadQRNames = useCallback(async () => {
    if (!theaterId) return;
    
    try {

      setQrNamesLoading(true);
      const url = `${config.api.baseUrl}/qrcodenames?theaterId=${theaterId}&isActive=true&limit=100`;

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const data = await optimizedFetch(
        url,
        {
          headers: getAuthHeaders()
        },
        `qrcodenames_theater_${theaterId}_active_limit_100`,
        120000 // 2-minute cache
      );
      

      if (data && data.success && data.data) {
        const qrNamesArray = data.data.qrCodeNames || [];

        setQrNames(qrNamesArray);
      } else {

        setQrNames([]);
      }
    } catch (error) {

      setQrNames([]);
    } finally {
      setQrNamesLoading(false);
    }
  }, [theaterId]);

  // Set active category to first QR name when QR names are loaded
  useEffect(() => {

    if (qrNames.length > 0) {
      // Set activeCategory if it's null OR if current activeCategory is not in the list
      if (!activeCategory || !qrNames.find(qr => qr.qrName === activeCategory)) {
        const firstQRName = qrNames[0].qrName;

        setActiveCategory(firstQRName);
      }
    }
  }, [qrNames]); // Removed activeCategory from dependencies to prevent loops

  const loadTheaterData = useCallback(async () => {
    // ✅ FIX: Check if theaterId exists before making API calls
    if (!theaterId) {
      console.warn('⚠️ TheaterQRDetail: theaterId is missing, cannot load data');
      setLoading(false);
      return;
    }
    
    try {
      // Cancel previous request if still pending
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort('New request initiated');
      }
      
      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      
      const signal = abortControllerRef.current.signal;
      const headers = getAuthHeaders();
      
      if (!theater) {
        // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
        const theaterData = await optimizedFetch(
          `${config.api.baseUrl}/theaters/${theaterId}`,
          {
            signal,
            headers
          },
          `theater_${theaterId}`,
          120000 // 2-minute cache
        );
        if (theaterData && theaterData.success) {
          setTheater(theaterData.theater || theaterData.data);
        }
      }
      
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const singleUrl = `${config.api.baseUrl}/single-qrcodes/theater/${theaterId}`;
      const singleData = await optimizedFetch(
        singleUrl,
        {
          signal,
          headers
        },
        `single_qrcodes_theater_${theaterId}`,
        120000 // 2-minute cache
      ).catch(() => ({ success: false, message: 'Failed to fetch QR codes' })) || { success: false, message: 'No data returned' };
      const screenData = { success: false }; // Not fetching screens separately anymore
      
      // Group QR codes by name
      const qrsByName = {};
      

      // singleResponse removed

      if (!singleData || !singleData.success) {

        // Only show error for actual server errors, not "not found" cases
        if (singleData.message && !singleData.message.includes('not found') && !singleData.message.includes('No QR codes found')) {

          // Removed error modal - errors logged to console only
        }
      }
      
      if (!screenData.success) {

        // Only show error for actual server errors, not "not found" cases
        if (screenData.message && !screenData.message.includes('not found') && !screenData.message.includes('No QR codes found')) {

          // Removed error modal - errors logged to console only
        }
      }
      
      if (singleData && singleData.success) {

        (singleData.data?.qrCodes || []).forEach(qr => {

          if (!qrsByName[qr.name]) {
            qrsByName[qr.name] = [];
          }
          
          // Keep screen QR as single row with seats array (don't expand into individual rows)
          // The view modal will display the seat grid visually when clicked
          qrsByName[qr.name].push({ ...qr });
        });
      }
      
      // singleResponse removed

      // Additional error logging for screen QR codes (already handled above)
      if (!screenData.success) {
  }
      
      if (screenData.success) {

        (screenData.data?.qrCodes || []).forEach(qr => {

          if (!qrsByName[qr.name]) {
            qrsByName[qr.name] = [];
          }
          
          // Keep screen QR as single row with seats array (don't expand into individual rows)
          // The view modal will display the seat grid visually when clicked
          qrsByName[qr.name].push({ ...qr });
        });
      }
      

      setQrCodesByName(qrsByName);
      
    } catch (error) {
      // Handle AbortError gracefully
      if (error.name === 'AbortError') {

        return;
      }

      // Removed error modal - errors logged to console only
    } finally {
      setLoading(false);
    }
  }, [theaterId]); // Removed 'theater' to prevent circular dependency

  // Fetch signed URL for QR code image display
  const fetchDisplayImageUrl = useCallback(async (qrCodeId) => {
    if (!qrCodeId) return null;
    
    try {

      const response = await unifiedFetch(`${config.api.baseUrl}/qrcodes/${qrCodeId}/image-url`, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `qrcode_image_url_${qrCodeId}`,
        cacheTTL: 300000 // 5 minutes
      });
      
      if (!response.ok) {

        return null;
      }
      
      const data = await response.json();

      if (data.success && data.data && data.data.imageUrl) {
        return data.data.imageUrl;
      }
      
      return null;
    } catch (error) {

      return null;
    }
  }, []);

  // Load theater and QR data - MUST be after function declarations
  useEffect(() => {
    loadTheaterData();
    loadQRNames();
    
    // Cleanup on unmount to prevent stale data
    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort('Component unmounted');
      }
      // Reset state to prevent displaying stale data on remount
      setQrCodesByName({});
      setActiveCategory(null);
      setQrNames([]);
      setLoading(true);
    };
  }, [theaterId, loadTheaterData, loadQRNames]);

  // Memoized computations for better performance - now based on QR names with pagination
  const filteredQRs = useMemo(() => {
    if (!activeCategory || !qrCodesByName[activeCategory]) {
      return [];
    }
    
    return qrCodesByName[activeCategory].filter(qr => {
      const matchesSearch = !debouncedSearchTerm || 
        qr.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (qr.screenName && qr.screenName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (qr.seatNumber && qr.seatNumber.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
      
      const matchesStatus = !filters.isActive || 
        qr.isActive.toString() === filters.isActive;
      
      return matchesSearch && matchesStatus;
    });
  }, [activeCategory, qrCodesByName, debouncedSearchTerm, filters.isActive]);

  // Update pagination when filtered results change
  useEffect(() => {
    const total = filteredQRs.length;
    setTotalItems(total);
    setTotalPages(Math.ceil(total / itemsPerPage));
  }, [filteredQRs, itemsPerPage]);

  // Paginated QRs
  const currentQRs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredQRs.slice(startIndex, endIndex);
  }, [filteredQRs, currentPage, itemsPerPage]);

  // Get QR count for each QR name (for sidebar display)
  const qrNameCounts = useMemo(() => {
    const counts = {};
    Object.keys(qrCodesByName).forEach(name => {
      counts[name] = qrCodesByName[name].length;
    });
    return counts;
  }, [qrCodesByName]);

  const statsInfo = useMemo(() => {
    const allQRs = Object.values(qrCodesByName).flat();
    return {
      totalQRs: allQRs.length,
      activeQRs: allQRs.filter(qr => qr.isActive).length,
      qrNameCount: qrNames.length
    };
  }, [qrCodesByName, qrNames]);

  // Action handlers (matching QRManagement performance)
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      search: '',
      isActive: ''
    });
  }, []);

  // Ref to track if modal was just opened (to prevent immediate close)
  const modalJustOpenedRef = useRef(false);
  const modalOpenTimeRef = useRef(0);

  // CRUD Modal Functions
  const openCrudModal = useCallback(async (qrCode, mode = 'view', event) => {
    // Prevent opening if qrCode is invalid
    if (!qrCode) {
      console.warn('Cannot open modal: qrCode is null or undefined');
      return;
    }
    
    // CRITICAL: Stop ALL event propagation immediately and prevent default
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      // Stop immediate propagation to prevent event from reaching any other handlers
      if (event.nativeEvent) {
        event.nativeEvent.stopImmediatePropagation();
      }
    }
    
    // Mark that modal is being opened with timestamp BEFORE setting state
    modalJustOpenedRef.current = true;
    modalOpenTimeRef.current = Date.now();
    
    // Add a global click blocker that will prevent ANY click from closing the modal
    const blockClick = (e) => {
      const timeSinceOpen = Date.now() - modalOpenTimeRef.current;
      if (modalJustOpenedRef.current || timeSinceOpen < 1000) {
        // Check if click is on a modal overlay
        const target = e.target;
        if (target && target.closest && target.closest('.modal-overlay')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
      }
    };
    
    // Add the blocker in capture phase BEFORE opening modal
    document.addEventListener('click', blockClick, true);
    document.addEventListener('mousedown', blockClick, true);
    
    // Set modal state
    setCrudModal(prev => ({
      ...prev,
      isOpen: true,
      qrCode: { ...qrCode },
      mode
    }));
    
    // Set display image URL directly from qrCode data
    if (qrCode && qrCode.qrImageUrl) {
      setDisplayImageUrl(qrCode.qrImageUrl);
    } else {
      setDisplayImageUrl(null);
    }
    
    // Remove the blocker after 1 second
    setTimeout(() => {
      document.removeEventListener('click', blockClick, true);
      document.removeEventListener('mousedown', blockClick, true);
      modalJustOpenedRef.current = false;
    }, 1000);
  }, []);

  const closeCrudModal = useCallback(() => {
    // Don't close if modal was just opened (check with a longer window)
    const timeSinceOpen = Date.now() - modalOpenTimeRef.current;
    if (modalJustOpenedRef.current || timeSinceOpen < 1000) {
      console.log('Modal close blocked - modal was just opened', { 
        justOpened: modalJustOpenedRef.current, 
        timeSinceOpen 
      });
      return;
    }
    
    setCrudModal({
      isOpen: false,
      qrCode: null,
      mode: 'view'
    });
  }, []);

  const handleCrudSave = useCallback(async (formData) => {

    try {
      setActionLoading(prev => ({ ...prev, [formData._id || 'new']: true }));
      
      const isEditing = crudModal.mode === 'edit';
      
      if (isEditing) {
        // PHASE 3 FIX: Check if this is a seat-level update
        if (formData.isSeatRow && formData.parentQRDetailId && formData.seatId) {

          // Check if this is a new seat (seatId starts with 'new_')
          if (formData.isNewSeat || formData.seatId.toString().startsWith('new_')) {

            // For new seats, use the new POST endpoint to add seat to existing screen
            const response = await unifiedFetch(
              `${config.api.baseUrl}/single-qrcodes/${formData.parentDocId}/details/${formData.parentQRDetailId}/seats`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                  // Token is automatically added by unifiedFetch
                },
                body: JSON.stringify({
                  seat: formData.seatNumber,
                  isActive: formData.isActive
                  // QR code will be auto-generated by backend
                })
              },
              {
                forceRefresh: true, // Don't cache POST requests
                cacheTTL: 0
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Failed to create new seat');
            }

            const result = await response.json();

            // Clear caches to ensure fresh data
            clearCachePattern('qr_');
            clearCachePattern(`theater_${theaterId}`);
            clearCachePattern('single_qrcodes');
            clearCachePattern('qrcodenames');
            
            // Reload both theater data and QR names to reflect the new seat
            await Promise.all([
              loadTheaterData(),
              loadQRNames()
            ]);
            closeCrudModal();
            showSuccess(`Seat ${formData.seatNumber} added successfully!`);
            
          } else {
            // Update existing seat
            const response = await unifiedFetch(
              `${config.api.baseUrl}/single-qrcodes/${formData.parentDocId}/details/${formData.parentQRDetailId}/seats/${formData.seatId}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                  // Token is automatically added by unifiedFetch
                },
                body: JSON.stringify({
                  seat: formData.seatNumber,
                  isActive: formData.isActive,
                  qrCodeUrl: formData.qrImageUrl // Include QR code URL update
                })
              },
              {
                forceRefresh: true, // Don't cache PUT requests
                cacheTTL: 0
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Failed to update seat');
            }

            const result = await response.json();

            // Clear caches to ensure fresh data
            clearCachePattern('qr_');
            clearCachePattern(`theater_${theaterId}`);
            clearCachePattern('single_qrcodes');
            clearCachePattern('qrcodenames');
            
            // Set flag to clear cache when navigating back to QR Management
            localStorage.setItem('qr_codes_modified', 'true');
            
            // Reload both theater data and QR names
            await Promise.all([
              loadTheaterData(),
              loadQRNames()
            ]);
            closeCrudModal();
            showSuccess(`Seat ${formData.seatNumber} updated successfully`);
          }
          
        } else {
          // Regular QR detail update
          if (!formData.parentDocId) {
            // Removed error modal - errors logged to console only
            setActionLoading(prev => ({ ...prev, [formData._id]: false }));
            return;
          }

          // Prepare update payload with all fields needed for QR regeneration
          const updatePayload = {
            qrName: formData.name,           // QR code name
            seatClass: formData.seatClass,   // Seat class (e.g., 'screen-1')
            seat: formData.seat || null,     // Seat number (for screen QR codes)
            logoUrl: formData.logoUrl,       // Logo overlay URL
            logoType: formData.logoType || 'default',
            isActive: formData.isActive
          };

          const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes/${formData.parentDocId}/details/${formData._id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
              // Token is automatically added by unifiedFetch
            },
            body: JSON.stringify(updatePayload)
          }, {
            forceRefresh: true, // Don't cache PUT requests
            cacheTTL: 0
          });
          
          const data = await response.json();
          
          if (data.success) {
            // Clear caches to ensure fresh data
            clearCachePattern('qr_');
            clearCachePattern(`theater_${theaterId}`);
            clearCachePattern('single_qrcodes');
            clearCachePattern('qrcodenames');
            
            // Set flag to clear cache when navigating back to QR Management
            localStorage.setItem('qr_codes_modified', 'true');
            
            // Reload both theater data and QR names to get updated QR codes
            await Promise.all([
              loadTheaterData(),
              loadQRNames()
            ]);
            showSuccess('QR code updated successfully');
            closeCrudModal();
          } else {
            // Removed error modal - errors logged to console only
          }
        }
        
        // Reload data after any successful update
        clearCachePattern('qr_');
        clearCachePattern(`theater_${theaterId}`);
        clearCachePattern('single_qrcodes');
        clearCachePattern('qrcodenames');
        await Promise.all([
          loadTheaterData(),
          loadQRNames()
        ]);
        closeCrudModal();
      } else {
        // Create new QR code using generate endpoint
        let payload;
        
        if (formData.qrType === 'screen' && formData.screenName && formData.seatNumber) {
          // For screen QR codes, use selectedSeats array format expected by backend
          payload = {
            theaterId: theaterId,
            qrType: 'screen',
            name: formData.screenName, // Use screen name as the QR name
            selectedSeats: [formData.seatNumber], // Array of seat numbers
            logoType: 'theater'
          };
        } else {
          // For single QR codes
          payload = {
            theaterId: theaterId,
            qrType: 'single',
            name: formData.name,
            logoType: 'theater'
          };
        }
        

        const response = await unifiedFetch(`${config.api.baseUrl}/qrcodes/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }, {
          forceRefresh: true, // Don't cache POST requests
          cacheTTL: 0
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Clear caches to ensure fresh data
          clearCachePattern('qr_');
          clearCachePattern(`theater_${theaterId}`);
          clearCachePattern('single_qrcodes');
          clearCachePattern('qrcodenames');
          
          // Set flag to clear cache when navigating back to QR Management
          localStorage.setItem('qr_codes_modified', 'true');
          
          // Reload both theater data and QR names to get the new QR code
          await Promise.all([
            loadTheaterData(),
            loadQRNames()
          ]);
          showSuccess('QR code created successfully');
          closeCrudModal();
        } else {
          // Removed error modal - errors logged to console only
        }
      }
    } catch (error) {

      // Removed error modal - errors logged to console only
    } finally {
      setActionLoading(prev => ({ ...prev, [formData._id || 'new']: false }));
    }
  }, [crudModal.mode, showSuccess, loadTheaterData, closeCrudModal, theaterId]);

  const viewQRCode = (qrCode) => {
    const details = [
      `Name: ${qrCode.name}`,
      `Theater: ${theater?.name}`,
      `Type: ${qrCode.qrType === 'canteen' ? 'Canteen' : 'Screen'}`,
      ...(qrCode.qrType === 'screen' ? [
        `Screen: ${qrCode.screenName}`,
        `Seat: ${qrCode.seatNumber}`
      ] : []),
      `Location: ${qrCode.location || 'Not specified'}`,
      `Status: ${qrCode.isActive ? 'Active' : 'Inactive'}`,
      `Orders: ${qrCode.orderCount || 0}`,
      `Revenue: ?${qrCode.totalRevenue || 0}`
    ].join('\n');

    alert({
      title: 'QR Code Details',
      message: details,
      type: 'info'
    });
  };

  const downloadQRCode = useCallback(async (qrCode) => {
    try {
      if (!qrCode || !qrCode._id) {
        showError('Invalid QR code data');
        return;
      }
      
      // Check if this is a screen QR with seats
      if (qrCode.qrType === 'screen' && qrCode.seats && qrCode.seats.length > 0) {
        const seatsWithQR = qrCode.seats.filter(s => s.qrCodeUrl);
        
        if (seatsWithQR.length === 0) {
          showError('No QR codes available to download');
          return;
        }
        

        try {
          const zip = new JSZip();
          const folderName = `${qrCode.seatClass || qrCode.name}_QR_Codes`;
          const folder = zip.folder(folderName);
          
          // Fetch all seat QR code images
          const fetchPromises = seatsWithQR.map(async (seat) => {
            try {
              const response = await fetch(seat.qrCodeUrl);
              if (!response.ok) {
                throw new Error(`Failed to fetch QR for seat ${seat.seat}: ${response.status}`);
              }
              const blob = await response.blob();
              if (!blob || blob.size === 0) {
                throw new Error(`Empty blob for seat ${seat.seat}`);
              }
              const filename = `${seat.seat}_QR.png`;
              folder.file(filename, blob);
            } catch (error) {
              console.error(`Failed to fetch QR code for seat ${seat.seat}:`, error);
              // Continue with other seats even if one fails
            }
          });
          
          await Promise.all(fetchPromises);
          
          // Check if any files were added to the ZIP
          const fileCount = Object.keys(folder.files || {}).length;
          if (fileCount === 0) {
            showError('No QR code images were available to download');
            return;
          }
          
          // Generate ZIP file
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          
          // Download ZIP
          const link = document.createElement('a');
          link.href = URL.createObjectURL(zipBlob);
          link.download = `${folderName}.zip`;
          link.style.display = 'none';
          
          document.body.appendChild(link);
          link.click();
          
          // Clean up after a short delay
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
          }, 100);

          showSuccess(`Downloaded ${fileCount} QR codes as ZIP file!`);
        } catch (error) {

          showError('Failed to create ZIP file. Please try again.');
        }
        return;
      }
      
      // Single QR code download (original logic)

      // Create clean filename
      const filename = `${qrCode.name.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}_QR.png`;

      // Use backend proxy to download (handles CORS)
      const downloadUrl = `${config.api.baseUrl}/single-qrcodes/${qrCode._id}/download`;

      // Use direct fetch for blob downloads (unifiedFetch doesn't handle blobs properly)
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'image/png, image/*, */*'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to download QR code: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // Not JSON, use status text
        }
        throw new Error(errorMessage);
      }
      
      const blob = await response.blob();

      // Verify we got a valid image blob
      if (!blob || blob.size === 0) {
        throw new Error('Received empty or invalid QR code image');
      }

      // Create download link
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';

      document.body.appendChild(a);
      a.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);

      showSuccess('QR code downloaded successfully!');
      
    } catch (error) {
      console.error('Failed to download QR code:', error);
      showError(error.message || 'Failed to download QR code. Please try again.');
    }
  }, [showError, showSuccess]);
  
  const toggleQRStatus = useCallback(async (qrCodeId, currentStatus) => {
    const newStatus = !currentStatus;
    
    // Prevent multiple clicks on the same QR
    if (togglingQRId === qrCodeId) {
      return;
    }
    
    try {
      
      setTogglingQRId(qrCodeId);
      setActionLoading(prev => ({ ...prev, [qrCodeId]: true }));
      
      // Find the QR code to get its parentDocId
      let qrToUpdate = null;
      let parentDocId = null;
      
      Object.keys(qrCodesByName).forEach(name => {
        const qr = qrCodesByName[name].find(q => q._id === qrCodeId);
        if (qr) {
          qrToUpdate = qr;
          parentDocId = qr.parentDocId;
        }
      });
      
      if (!parentDocId) {
        console.error('❌ Parent document ID not found for QR:', qrCodeId);
        showError('Failed to update QR status: Missing parent document');
        return;
      }
      
      // 🚀 INSTANT UI UPDATE: Update local state immediately (before API call)
      // Use functional update to ensure we get the latest state and create new references
      // This must happen synchronously to ensure immediate UI feedback
      setQrCodesByName(prevQRs => {
        // Create completely new object structure to ensure React detects the change
        const updatedQRs = {};
        let hasChanges = false;
        Object.keys(prevQRs).forEach(name => {
          // Create new array with updated QR code
          const updatedArray = prevQRs[name].map(qr => {
            if (qr._id === qrCodeId && qr.isActive !== newStatus) {
              hasChanges = true;
              return { ...qr, isActive: newStatus };
            }
            return qr;
          });
          updatedQRs[name] = updatedArray;
        });
        // Only return new object if there are actual changes (optimization)
        return hasChanges ? updatedQRs : prevQRs;
      });
      
      
      const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes/${parentDocId}/details/${qrCodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({ isActive: newStatus })
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ API response not OK:', response.status, errorData);
        throw new Error(errorData.message || 'Failed to update QR status');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 🔄 Invalidate cache to ensure fresh data on next load
        clearTheaterCache();
        clearCachePattern('qr_');
        clearCachePattern(`theater_${theaterId}`);
        clearCachePattern('single_qrcodes');
        clearCachePattern('qrcodenames');
        localStorage.setItem('qr_codes_modified', 'true');
        
        showSuccess(`QR code ${newStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        throw new Error(data.message || 'Failed to update QR status');
      }
    } catch (error) {
      console.error('❌ Failed to toggle QR status:', error);
      
      // 🔄 ROLLBACK: Revert the optimistic update
      setQrCodesByName(prevQRs => {
        const updatedQRs = { ...prevQRs };
        Object.keys(updatedQRs).forEach(name => {
          updatedQRs[name] = updatedQRs[name].map(qr =>
            qr._id === qrCodeId ? { ...qr, isActive: currentStatus } : qr
          );
        });
        return updatedQRs;
      });
      
      showError(`Failed to update QR status: ${error.message}`);
    } finally {
      setTogglingQRId(null);
      setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
    }
  }, [qrCodesByName, showError, showSuccess]);

  const deleteSeat = async (seatId, seatName) => {
    // Get the parent document ID and detail ID from the current crud modal data
    const parentDocId = crudModal.qrCode?.parentDocId;
    const parentQRDetailId = crudModal.qrCode?.parentQRDetailId;
    
    if (!parentDocId || !parentQRDetailId || !seatId) {
      showError('Missing required information to delete seat');
      return;
    }

    // Use browser confirm dialog
    const confirmed = window.confirm(`Are you sure you want to delete ${seatName}? This action cannot be undone.`);
    
    if (!confirmed) return;
    
    try {
      setActionLoading(prev => ({ ...prev, [seatId]: true }));
      
      const response = await unifiedFetch(
        `${config.api.baseUrl}/single-qrcodes/${parentDocId}/details/${parentQRDetailId}/seats/${seatId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        },
        {
          forceRefresh: true, // Don't cache DELETE requests
          cacheTTL: 0
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete seat');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // ✅ CRITICAL FIX: Clear ALL QR-related caches before reloading to prevent stale data
        clearCachePattern('qr_'); // Clear all QR code caches
        clearCachePattern(`theater_${theaterId}`); // Clear theater cache
        clearCachePattern('single_qrcodes'); // Clear single QR codes cache
        clearCachePattern('qrcodes'); // Clear all QR codes cache
        clearCachePattern('qrcodenames'); // Clear QR code names cache
        
        // Also clear sessionStorage caches
        const allKeys = Object.keys(sessionStorage);
        allKeys.forEach(key => {
          if (key.includes('qr_') || key.includes('qrcode') || key.includes(`theater_${theaterId}`)) {
            sessionStorage.removeItem(key);
          }
        });
        
        // ✅ Clear state immediately to force fresh data display
        setQrCodesByName({});
        setQrNames([]);
        setActiveCategory(null);
        
        closeCrudModal();
        
        // ✅ CRITICAL: Wait to ensure cache is fully cleared, then reload both data sources
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reload both theater data and QR names to get updated list with fresh data
        await Promise.all([
          loadTheaterData(),
          loadQRNames()
        ]);
        
        // Set flag to clear cache when navigating back to QR Management
        localStorage.setItem('qr_codes_modified', 'true');
        showSuccess(`${seatName} deleted successfully`);
      } else {
        throw new Error(data.message || 'Failed to delete seat');
      }
    } catch (error) {

      showError(error.message || 'Failed to delete seat');
    } finally {
      setActionLoading(prev => ({ ...prev, [seatId]: false }));
    }
  };

  const deleteQRCode = useCallback((qrCodeId, qrCodeName) => {
    // Find the QR code to delete and set it in modal
    let qrToDelete = null;
    Object.keys(qrCodesByName).forEach(name => {
      const qr = qrCodesByName[name].find(q => q._id === qrCodeId);
      if (qr) {
        qrToDelete = qr;
      }
    });
    
    if (qrToDelete) {
      setDeleteModal({ show: true, qrCode: qrToDelete });
    } else {
      showError('QR code not found');
    }
  }, [qrCodesByName, showError]);

  // Handle actual deletion after confirmation
  const handleDeleteConfirmed = async () => {
    const qrCodeId = deleteModal.qrCode?._id;
    const parentDocId = deleteModal.qrCode?.parentDocId;
    
    if (!qrCodeId || !parentDocId) {
      setDeleteModal({ show: false, qrCode: null });
      return;
    }
    
    try {
      setActionLoading(prev => ({ ...prev, [qrCodeId]: true }));
      
      const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes/${parentDocId}/details/${qrCodeId}?permanent=true`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
      });
      
      const data = await response.json();
      
      if (data.success) {
        // ✅ CRITICAL FIX: Clear ALL QR-related caches before reloading to prevent stale data
        clearCachePattern('qr_'); // Clear all QR code caches
        clearCachePattern(`theater_${theaterId}`); // Clear theater cache
        clearCachePattern('single_qrcodes'); // Clear single QR codes cache
        clearCachePattern('qrcodes'); // Clear all QR codes cache
        clearCachePattern('qrcodenames'); // Clear QR code names cache
        
        // Also clear sessionStorage caches
        const allKeys = Object.keys(sessionStorage);
        allKeys.forEach(key => {
          if (key.includes('qr_') || key.includes('qrcode') || key.includes(`theater_${theaterId}`)) {
            sessionStorage.removeItem(key);
          }
        });
        
        // Set flag to clear cache when navigating back to QR Management
        localStorage.setItem('qr_codes_modified', 'true');
        
        // ✅ Clear state immediately to force fresh data display
        setQrCodesByName({});
        setQrNames([]);
        setActiveCategory(null);
        
        // Close modal first
        setDeleteModal({ show: false, qrCode: null });
        
        // ✅ CRITICAL: Reload BOTH theater data AND QR names to get updated list with fresh data
        // Wait a tiny bit to ensure cache is fully cleared
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reload both data sources in parallel for faster refresh
        await Promise.all([
          loadTheaterData(),
          loadQRNames()
        ]);
        
        showSuccess('QR code deleted successfully');
      } else {
        // Removed error modal - errors logged to console only
        setDeleteModal({ show: false, qrCode: null });
      }
    } catch (error) {

      // Removed error modal - errors logged to console only
      setDeleteModal({ show: false, qrCode: null });
    } finally {
      setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
    }
  };

  // Cleanup effect for aborting requests (matching QRManagement)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort('Component cleanup');
      }
    };
  }, []);

  if (loading) {
    return (
      <ErrorBoundary>
        <AdminLayout 
          pageTitle="Loading Theater QR Details..." 
          currentPage="qr-list"
        >
          <div className="theater-list-page qr-management-page">
            <div className="page-header-section">
              <div className="header-content">
                <h1 className="page-title">Loading QR Codes...</h1>
              </div>
            </div>
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">...</div>
                <div className="stat-label">Total QR Codes</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">...</div>
                <div className="stat-label">Active QR Codes</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">...</div>
                <div className="stat-label">Inactive QR Codes</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">...</div>
                <div className="stat-label">QR Name Categories</div>
              </div>
            </div>
            <div className="theater-list-section">
              <div className="theater-table-container">
                <table className="theater-table">
                  <thead>
                    <tr>
                      <th className="sno-cell">S.No</th>
                      <th className="name-cell">QR Code Name</th>
                      <th className="description-cell">Type</th>
                      <th className="status-cell">Status</th>
                      <th className="actions-cell">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan="5" className="loading-cell">
                        <div className="loading-spinner"></div>
                        <span>Loading QR codes...</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </AdminLayout>
      </ErrorBoundary>
    );
  }

  // Only show "Theater Not Found" if loading is complete and theater is still null
  if (!loading && !theater) {
    return (
      <ErrorBoundary>
        <AdminLayout 
          pageTitle="Theater Not Found" 
          currentPage="qr-list"
        >
          <div className="theater-list-page qr-management-page">
            <div className="page-header-section">
              <div className="header-content">
                <h1 className="page-title">Theater Not Found</h1>
              </div>
            </div>
            <div className="theater-list-section">
              <div className="theater-table-container">
                <div className="error-container">
                  <i className="fas fa-exclamation-circle fa-3x error-icon"></i>
                  <h2>Theater not found</h2>
                  <p>The requested theater could not be found.</p>
                  <button 
                    className="add-theater-btn error-button" 
                    onClick={() => {
                      // Set flag to indicate QR codes might have been modified
                      localStorage.setItem('qr_codes_modified', 'true');
                      navigate('/qr-management', { state: { qrCodesModified: true } });
                    }}
                  >
                    Return to QR Management
                  </button>
                </div>
              </div>
            </div>
          </div>
        </AdminLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AdminLayout 
        pageTitle={theater ? `QR Codes - ${theater.name}` : "Theater QR Management"} 
        currentPage="qr-list"
      >
        <div className="theater-user-details-page">
          <PageContainer
            hasHeader={false}
            className="theater-user-management-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title={theater?.name ? `${theater.name} - QR Code Management` : 'QR Code Management'}
              backButtonText="Back to QR Management"
              backButtonPath="/qr-management"
              actionButton={
                <button 
                  className="header-btn"
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (theaterId) {
                      navigate(`/qr-generate?theaterId=${theaterId}`);
                    } else {
                      showError('Theater ID is missing');
                    }
                  }}
                >
                  <span className="btn-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </span>
                  Generate QR Codes
                </button>
              }
            />
            <div className="theater-user-settings-container">
              {/* Settings Tabs - EXACTLY like Theater Users page */}
              <div className="theater-user-settings-tabs" key={`tabs-${forceRender}`}>
                {qrNames.length > 0 && qrNames.map((qrName) => (
                  <button
                    key={qrName.qrName}
                    className={`theater-user-settings-tab ${activeCategory === qrName.qrName ? 'active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveCategory(qrName.qrName);
                      setCurrentPage(1);
                    }}
                  >
                    <span className="theater-user-tab-icon">
                      <i className="fas fa-qrcode"></i>
                    </span>
                    {qrName.qrName}
                    <span className={`badge badge-inline ${activeCategory === qrName.qrName ? 'badge-active' : 'badge-inactive'}`}>
                      {qrNameCounts[qrName.qrName] || 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Settings Content - EXACTLY like Theater Users page */}
              <div className="theater-user-settings-content">
                {activeCategory ? (
                  <div className="theater-user-settings-section">
                   

             

                    {/* QR Codes Table */}
                    {loading ? (
                      <div className="theater-user-empty-state">
                        <div className="theater-user-empty-state-icon">⏳</div>
                        <h4>Loading QR codes...</h4>
                        <p>Please wait while we fetch the QR code data.</p>
                      </div>
                    ) : currentQRs.length === 0 ? (
                      <div className="theater-user-empty-state">
                        <div className="theater-user-empty-state-icon">
                          <i className="fas fa-qrcode fa-3x"></i>
                        </div>
                        <h4>No QR codes found</h4>
                        {debouncedSearchTerm ? (
                          <>
                            <p>No QR codes match your search.</p>
                            <button 
                              className="add-theater-btn"
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSearchTerm('');
                              }}
                            >
                              Clear Search
                            </button>
                          </>
                        ) : (
                          <>
                            <p>Get started by generating your first QR code.</p>
                            <button 
                              className="add-theater-btn"
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (theaterId) {
                                  navigate(`/qr-generate?theaterId=${theaterId}`);
                                } else {
                                  showError('Theater ID is missing');
                                }
                              }}
                            >
                              Generate First QR Code
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="theater-table-container">
                          <table className="theater-table">
                            <thead>
                              <tr>
                                <th className="sno-col">S NO</th>
                                <th className="name-col">QR CODE NAME</th>
                                <th className="description-col">TYPE</th>
                                <th className="status-col">STATUS</th>
                                <th className="access-status-col">ACCESS STATUS</th>
                                <th className="actions-col">ACTIONS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentQRs.map((qrCode, index) => (
                                <tr key={qrCode._id} className="theater-row">
                                  <td className="sno-cell">
                                    <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
                                  </td>
                                  <td className="name-cell">
                                    <strong>{qrCode.name}</strong>
                                  </td>
                                  <td className="description-cell">
                                    {qrCode.qrType === 'screen' ? (
                                      <span>
                                        <i className="fas fa-film"></i> Screen QR
                                        {qrCode.screenName && ` - ${qrCode.screenName}`}
                                      </span>
                                    ) : (
                                      <span>
                                        <i className="fas fa-qrcode"></i> Single QR
                                      </span>
                                    )}
                                  </td>
                                  <td className="status-cell">
                                    <span className={`status-badge ${qrCode.isActive ? 'active' : 'inactive'}`}>
                                      {qrCode.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                  </td>
                                  <td className="access-status-cell">
                                    <div className="toggle-wrapper">
                                      <label className={`switch toggle-switch-user ${togglingQRId === qrCode._id ? 'disabled' : ''}`}>
                                        <input
                                          type="checkbox"
                                          checked={qrCode.isActive !== false}
                                          onChange={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (qrCode && qrCode._id && toggleQRStatus) {
                                              toggleQRStatus(qrCode._id, qrCode.isActive);
                                            }
                                          }}
                                          disabled={togglingQRId === qrCode._id}
                                          className="toggle-input-user"
                                        />
                                        <span className={`slider toggle-slider-user ${qrCode.isActive !== false ? 'active' : ''}`}></span>
                                      </label>
                                    </div>
                                  </td>
                                  <td className="actions-cell">
                                    <div className="action-buttons">
                                      <ActionButton
                                        type="view"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (e.nativeEvent) {
                                            e.nativeEvent.stopImmediatePropagation();
                                          }
                                          if (qrCode && openCrudModal) {
                                            openCrudModal(qrCode, 'view', e);
                                          }
                                        }}
                                        title="View QR Details"
                                      />
                                      <ActionButton
                                        type="download"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (qrCode && downloadQRCode) {
                                            downloadQRCode(qrCode);
                                          }
                                        }}
                                        title="Download QR"
                                      />
                                      <ActionButton
                                        type="delete"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (qrCode && qrCode._id && deleteQRCode) {
                                            deleteQRCode(qrCode._id, qrCode.name);
                                          }
                                        }}
                                        disabled={actionLoading[qrCode._id]}
                                        title="Delete QR Code"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        {!loading && (
                          <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                            itemType="QR codes"
                          />
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="theater-user-empty-state">
                    <div className="theater-user-empty-state-icon">
                      <i className="fas fa-qrcode fa-3x"></i>
                    </div>
                    <h4>Select a QR Category</h4>
                    <p>Choose a category from the left sidebar to view QR codes.</p>
                  </div>
                )}
              </div>
            </div>
          </PageContainer>
        </div>

        {/* QR Code View Modal */}
        {crudModal.isOpen && crudModal.qrCode && (
          <QRCodeViewModal
            isOpen={crudModal.isOpen}
            qrCode={crudModal.qrCode}
            mode={crudModal.mode}
            theater={theater}
            onClose={closeCrudModal}
            onSave={handleCrudSave}
            onDelete={crudModal.qrCode?.isSeatRow ? deleteSeat : deleteQRCode}
            onModeChange={(mode, newQrCode) => {
              if (newQrCode) {
                // Update both mode and QR code data (for navigating back to parent)
                setCrudModal(prev => ({ ...prev, mode, qrCode: newQrCode }));
              } else {
                // Just update the mode
                setCrudModal(prev => ({ ...prev, mode }));
              }
            }}
            actionLoading={actionLoading}
            displayImageUrl={displayImageUrl}
            onToggleStatus={toggleQRStatus}
            qrNames={qrNames}
            existingQRNames={Object.keys(qrCodesByName)}
            onSeatEdit={(seatData) => {
              // Close current modal and open seat edit modal
              closeCrudModal();
              setTimeout(() => {
                setCrudModal({
                  isOpen: true,
                  qrCode: seatData,
                  mode: 'edit'
                });
              }, 100);
            }}
          />
        )}

        {/* Delete Confirmation Modal - Global Design Pattern */}
        {deleteModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header">
                <h3>Confirm Deletion</h3>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete <strong>{deleteModal.qrCode?.name}</strong>?</p>
                <p className="warning-text">⚠️ This action cannot be undone.</p>
              </div>
              <div className="modal-actions">
                <button 
                  onClick={() => setDeleteModal({ show: false, qrCode: null })}
                  className="cancel-btn"
                  disabled={actionLoading[deleteModal.qrCode?._id]}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteConfirmed}
                  className="confirm-delete-btn"
                  disabled={actionLoading[deleteModal.qrCode?._id]}
                >
                  {actionLoading[deleteModal.qrCode?._id] ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default TheaterQRDetail;

// QR-specific table column widths
const style = document.createElement('style');
style.textContent = `
  /* QR Management Table Column Widths */
  .theater-user-settings-content .theater-table .sno-col { 
    width: 80px; 
    min-width: 70px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .name-col { 
    width: 200px; 
    min-width: 180px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .description-col { 
    width: 180px; 
    min-width: 160px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .status-col { 
    width: 130px; 
    min-width: 120px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .access-status-col { 
    width: 150px; 
    min-width: 130px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .actions-col { 
    width: 180px; 
    min-width: 160px;
    text-align: center;
  }

  /* Ensure all cells are centered for QR table */
  .theater-user-settings-content .theater-table .sno-cell,
  .theater-user-settings-content .theater-table .description-cell,
  .theater-user-settings-content .theater-table .status-cell,
  .theater-user-settings-content .theater-table .access-status-cell,
  .theater-user-settings-content .theater-table .actions-cell {
    text-align: center;
  }

  /* Name cell can be left-aligned or centered */
  .theater-user-settings-content .theater-table .name-cell {
    font-weight: 600;
    color: #111827;
    text-align: center;
  }
`;

if (!document.head.querySelector('#qr-detail-styles')) {
  style.id = 'qr-detail-styles';
  document.head.appendChild(style);
}

