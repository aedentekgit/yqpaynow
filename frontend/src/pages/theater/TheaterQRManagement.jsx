import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import VerticalPageHeader from '@components/VerticalPageHeader';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import JSZip from 'jszip';
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/TheaterUserDetails.css';
import '@styles/TheaterList.css';
import '@styles/QRManagementPage.css';
import '@styles/AddTheater.css';
import '@styles/pages/theater/TheaterQRManagement.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import InstantImage from '@components/InstantImage';



// Helper function to get authenticated headers
const getAuthHeaders = () => {
  const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(authToken && { 'Authorization': `Bearer ${authToken}` })
  };
};

// Direct QR Image Component - No Caching
const DirectQRImage = React.memo(({ src, alt, className, style }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const hasFetchedRef = React.useRef(new Set());

  // Handle different types of image sources
  React.useEffect(() => {
    if (!src) {
      setImageSrc('/placeholder-qr.png');
      setIsLoading(false);
      return;
    }

    // If it's a data URL (base64), use directly
    if (src.startsWith('data:')) {
      setImageSrc(src);
      setIsLoading(false);
      return;
    }

    // If it's a blob URL, use directly
    if (src.startsWith('blob:')) {
      setImageSrc(src);
      setIsLoading(false);
      return;
    }

    // For Google Cloud Storage URLs, use proxy to avoid CORS issues
    if ((src.includes('storage.googleapis.com') || src.includes('googleapis.com')) && !hasFetchedRef.current.has(src)) {
      hasFetchedRef.current.add(src);
      setIsLoading(true);

      // Use POST proxy endpoint for GCS URLs
      const proxyUrl = `${config.api.baseUrl}/proxy-image`;
      fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ url: src })
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Proxy request failed: ${response.status}`);
          }
          return response.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          setImageSrc(blobUrl);
          setIsLoading(false);
          setHasError(false);
        })
        .catch((error) => {
          console.error('Failed to fetch QR image via proxy, trying direct URL:', error);
          // Fallback to direct URL with timestamp
          setImageSrc(`${src}${src.includes('?') ? '&' : '?'}_t=${Date.now()}`);
          setIsLoading(false);
        });
    } else {
      // For regular URLs, add timestamp to bypass caching
      setImageSrc(`${src}${src.includes('?') ? '&' : '?'}_t=${Date.now()}`);
      setIsLoading(false);
    }
  }, [src]);

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // If there's an error, show a proper fallback instead of the broken image
  if (hasError) {
    return (
      <div className="direct-qr-image-error" style={style}>
        <div>
          <div className="direct-qr-image-error-icon">⚠️</div>
          <div>QR Code image failed to load</div>
          <div className="direct-qr-image-error-text">
            {src && src.startsWith('data:') ? 'Base64 data URL provided' :
              src ? `URL: ${src.substring(0, 50)}...` : 'No URL provided'}
          </div>
        </div>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="direct-qr-image-container" style={style}>
        <div className="direct-qr-image-loading">
          Loading QR Code...
        </div>
      </div>
    );
  }

  return (
    <div className="direct-qr-image-container" style={style}>
      {isLoading && (
        <div className="direct-qr-image-loading">
          Loading QR Code...
        </div>
      )}
      <img
        src={imageSrc}
        alt="" // Remove alt text to prevent showing "QR Code for A2" when image fails
        className={className}
        style={{
          ...style,
          opacity: isLoading ? 0.3 : 1,
          transition: 'opacity 0.3s ease',
          display: hasError ? 'none' : 'block'
        }}
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
});

DirectQRImage.displayName = 'DirectQRImage';

// CRUD Modal Component (Complete mirror from TheaterQRDetail.js)
const CrudModal = React.memo(({ isOpen, qrCode, mode, theater, onClose, onSave, onDelete, onModeChange, actionLoading, displayImageUrl, onSeatEdit, onToggleStatus, qrNames = [], existingQRNames = [] }) => {
  const [formData, setFormData] = useState({
    name: '',
    qrType: 'single',
    screenName: '',
    seatNumber: '',
    location: '',
    isActive: true,
    ...qrCode
  });

  useEffect(() => {
    if (qrCode) {
      // Ensure qrImageUrl is set from qrCodeUrl if needed
      const updatedQrCode = {
        ...qrCode,
        qrImageUrl: qrCode.qrImageUrl || qrCode.qrCodeUrl || null,
        qrCodeUrl: qrCode.qrCodeUrl || qrCode.qrImageUrl || null
      };
      setFormData(updatedQrCode);
    }
  }, [qrCode]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-nav-left"></div>

          <div className="modal-title-section">
            <h2>{getModalTitle()}</h2>
          </div>

          <div className="modal-nav-right">
            <button className="close-btn" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="edit-form">
            <div className="form-group">
              <label>QR Code Name *</label>
              {isReadOnly ? (
                <input
                  type="text"
                  className="form-control"
                  value={formData.name || ''}
                  disabled
                />
              ) : (
                <select
                  name="name"
                  className="form-control"
                  value={formData.name || ''}
                  onChange={(e) => {
                    const selectedQRName = qrNames.find(qr => qr.qrName === e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      name: e.target.value,
                      screenName: selectedQRName?.seatClass || prev.screenName,
                      seatClass: selectedQRName?.seatClass || prev.seatClass
                    }));
                  }}
                  required
                >
                  <option value="">Select QR Code Name</option>
                  {qrNames
                    .filter(qr => !existingQRNames.includes(qr.qrName) || qr.qrName === qrCode?.name)
                    .map((qr, index) => (
                      <option key={index} value={qr.qrName}>{qr.qrName}</option>
                    ))}
                </select>
              )}
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

            {/* QR Code Preview - Only for single QR or individual seat rows */}
            {(() => {
              // Show preview for single QR codes (not screen type with seats array)
              const isSingleQR = formData.qrType === 'single' || (!formData.qrType && !formData.seats);
              const isSeatRow = formData.isSeatRow;
              const hasSeatsArray = formData.seats && Array.isArray(formData.seats) && formData.seats.length > 0;
              const shouldShowQRPreview = (isSingleQR || isSeatRow) && !hasSeatsArray;

              console.log('🔍 [TheaterQRManagement] Preview condition check:', {
                qrType: formData.qrType,
                isSingleQR,
                isSeatRow,
                hasSeatsArray,
                shouldShowQRPreview,
                displayImageUrl: displayImageUrl ? 'exists' : 'null',
                formDataKeys: Object.keys(formData)
              });

              return shouldShowQRPreview;
            })() && (
                <div className="form-group full-width">
                  <label>QR Code Preview</label>
                  <div className="qr-preview">
                    {(displayImageUrl || formData.qrImageUrl || formData.qrCodeUrl) ? (
                      <div className="qr-preview-styled-container">
                        {/* Styled QR Preview Card - Match Single Screen QR Style Perfectly */}
                        {/* The displayImageUrl already contains the full rendered QR code with all elements */}
                        <div className="qr-preview-card-portrait">
                          <InstantImage
                            src={displayImageUrl || formData.qrImageUrl || formData.qrCodeUrl}
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
                              if (e.target.nextElementSibling) {
                                e.target.nextElementSibling.style.display = 'block';
                              }
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

                                const fetchPromises = seatsWithQR.map(async (seat) => {
                                  try {
                                    const response = await fetch(seat.qrCodeUrl);
                                    const blob = await response.blob();
                                    folder.file(`${seat.seat}_QR.png`, blob);
                                  } catch (error) {
                                    console.error(`Failed to fetch ${seat.seat}:`, error);
                                  }
                                });

                                await Promise.all(fetchPromises);
                                const zipBlob = await zip.generateAsync({ type: 'blob' });

                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(zipBlob);
                                link.download = `${formData.seatClass || formData.name}_QR_Codes.zip`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(link.href);

                                alert(`✅ Downloaded ${seatsWithQR.length} QR codes as ZIP file!`);
                              } catch (error) {
                                alert('❌ Failed to create ZIP file.');
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
                        const seatsByRow = {};
                        formData.seats.forEach(seat => {
                          const rowLetter = seat.seat.match(/^[A-Za-z]+/)?.[0] || 'Other';
                          if (!seatsByRow[rowLetter]) seatsByRow[rowLetter] = [];
                          seatsByRow[rowLetter].push(seat);
                        });

                        return Object.keys(seatsByRow).sort().map(rowLetter => (
                          <div key={rowLetter} className="qr-seat-row">
                            {/* Row Label */}
                            <div className="qr-seat-row-label">
                              {rowLetter}
                            </div>

                            {/* Seat Buttons in this row */}
                            <div className="qr-seat-row-seats">
                              {seatsByRow[rowLetter]
                                .sort((a, b) => {
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
          </div>
        </div>

        {/* Modal Footer - Complete CRUD Actions */}
        <div className="modal-actions">
          {mode === 'view' && !formData.isSeatRow && (
            <>
              <button type="button" className="cancel-btn" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onModeChange('edit')}
              >
                Edit
              </button>
            </>
          )}

          {mode === 'view' && formData.isSeatRow && (
            <>
              <button
                type="button"
                className="cancel-btn btn-margin-auto"
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
              >
                Back
              </button>
              <button
                type="button"
                className="btn-secondary btn-delete"
                onClick={() => {
                  if (onDelete && formData.seatId) {
                    onDelete(formData.seatId, `Seat ${formData.seatNumber}`);
                  }
                }}
                disabled={actionLoading[formData.seatId]}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                {actionLoading[formData.seatId] ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onModeChange('edit')}
              >
                Edit
              </button>
            </>
          )}

          {mode === 'edit' && formData.isSeatRow && (
            <>
              <button
                type="button"
                className="cancel-btn btn-margin-auto"
                onClick={() => {
                  // Switch back to view mode instead of closing
                  onModeChange('view');
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-secondary btn-delete"
                onClick={() => {
                  if (onDelete && formData.seatId) {
                    onDelete(formData.seatId, `Seat ${formData.seatNumber}`);
                  }
                }}
                disabled={actionLoading[formData.seatId]}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                {actionLoading[formData.seatId] ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="submit"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={actionLoading[formData._id]}
              >
                {actionLoading[formData._id] ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}

          {mode === 'edit' && !formData.isSeatRow && (
            <>
              <button type="button" className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={actionLoading[formData._id]}
              >
                {actionLoading[formData._id] ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}

          {mode === 'create' && (
            <>
              <button type="button" className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={actionLoading.new}
              >
                {actionLoading.new ? 'Creating...' : 'Create QR Code'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

CrudModal.displayName = 'CrudModal';

const TheaterQRManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError, showSuccess } = useModal();

  // PERFORMANCE MONITORING
  usePerformanceMonitoring('TheaterQRManagement');

  // Theater state
  const [theater, setTheater] = useState(null);

  // Data state
  const [qrCodes, setQrCodes] = useState([]);
  const [qrCodesByName, setQrCodesByName] = useState({});
  const [loading, setLoading] = useState(true);
  const [qrNames, setQrNames] = useState([]);
  const [qrNamesLoading, setQrNamesLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('');
  const [qrNameCounts, setQrNameCounts] = useState({});
  const [actionLoading, setActionLoading] = useState({});

  // Modal states
  const [crudModal, setCrudModal] = useState({
    isOpen: false,
    qrCode: null,
    mode: 'view' // 'view', 'edit'
  });

  const [deleteModal, setDeleteModal] = useState({ show: false, qrCode: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [displayImageUrl, setDisplayImageUrl] = useState(null);

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    isActive: 'all'
  });

  const abortControllerRef = useRef(null);

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {

      return;
    }
  }, [theaterId, userTheaterId, userType]);

  // Load QR Names (like admin page tabs)
  const loadQRNames = useCallback(async () => {
    if (!theaterId) return;

    try {
      setQrNamesLoading(true);
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');


      const response = await unifiedFetch(`${config.api.baseUrl}/qrcodenames?theaterId=${theaterId}&limit=100`, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `qrcodenames_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      // ✅ FIX: Better error handling - don't throw on server errors, handle gracefully
      if (!response.ok) {
        const status = response.status;
        if (status >= 500) {
          // Server error (500/503) - expected when server is down
          // Don't clear existing data, just exit
          return;
        }
        // Other errors (400, 401, 403, 404) - log these
        try {
          const errorData = await response.json().catch(() => ({}));
          console.warn('⚠️ QR names API returned error:', status, errorData);
        } catch (e) {
          console.warn('⚠️ QR names API returned error:', status);
        }
        // For non-server errors, clear data
        setQrNames([]);
        return;
      }

      const data = await response.json();


      if (data.success && data.data && data.data.qrCodeNames) {
        const names = data.data.qrCodeNames;

        // ✅ DEBUG: Log QR names structure to identify mismatches
        console.log('🔍 [DEBUG] QR names loaded:', {
          count: names.length,
          names: names.map(n => ({
            qrName: n.qrName || n.name,
            seatClass: n.seatClass,
            hasQrName: !!n.qrName,
            hasName: !!n.name,
            allKeys: Object.keys(n)
          }))
        });

        setQrNames(names);
        if (names.length > 0 && !activeCategory) {
          // ✅ FIX: Handle both qrName and name fields from API
          const firstCategory = names[0].qrName || names[0].name || '';
          setActiveCategory(firstCategory);
        }
      } else {
        // No data or invalid response structure
        console.warn('⚠️ QR names API returned invalid structure:', {
          success: data?.success,
          hasData: !!data?.data,
          hasQrCodeNames: !!data?.data?.qrCodeNames,
          dataKeys: data?.data ? Object.keys(data.data) : []
        });
        setQrNames([]);
      }
    } catch (error) {
      // Only log if it's not a server unavailability error
      if (error.message && !error.message.includes('Failed to fetch') && !error.message.includes('NetworkError')) {
        console.error('Failed to load QR names:', error);
      }
    } finally {
      setQrNamesLoading(false);
    }
  }, [theaterId]); // Removed 'showError' dependency

  // Load theater data and organize QR codes by name
  const loadTheaterData = useCallback(async () => {
    // ✅ FIX: Check if theaterId exists before making API calls
    if (!theaterId) {
      console.warn('⚠️ TheaterQRManagement: theaterId is missing, cannot load data');
      setLoading(false);
      return;
    }

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setLoading(true);

      const signal = abortControllerRef.current.signal;
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      };

      if (!theater) {
        const theaterResponse = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
          signal,
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: `theater_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });
        const theaterData = await theaterResponse.json();
        if (theaterData.success) {
          setTheater(theaterData.theater);
        }
      }

      // ✅ FIX: Ensure theaterId is valid before making API call
      if (!theaterId) {
        console.error('❌ TheaterQRManagement: theaterId is missing, cannot fetch QR codes');
        setLoading(false);
        setQrCodesByName({});
        setQrCodes([]);
        setQrNameCounts({});
        return;
      }

      const singleUrl = `${config.api.baseUrl}/single-qrcodes/theater/${theaterId}?_t=${Date.now()}`;

      const singleResponse = await unifiedFetch(singleUrl, {
        signal,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Always get latest QR codes
        cacheTTL: 0
      });

      // ✅ FIX: unifiedFetch may return response with undefined ok/status, handle it properly
      let singleData = { success: false };
      let responseOk = true; // Default to true for unifiedFetch (it throws on errors)
      let responseStatus = 200; // Default status

      try {
        // ✅ FIX: unifiedFetch returns data via json() method
        // unifiedFetch throws errors for non-OK responses, so if we get here, it should be OK
        // But check response properties if available
        if (singleResponse && typeof singleResponse.json === 'function') {
          singleData = await singleResponse.json();

          // ✅ FIX: Check response status if available
          responseOk = singleResponse.ok !== undefined
            ? singleResponse.ok
            : true; // unifiedFetch throws on errors, so if we got here it's likely OK
          responseStatus = singleResponse.status || 200;
        } else if (singleResponse && singleResponse.data) {
          // unifiedFetch might have already parsed the data
          singleData = singleResponse.data;
          responseOk = singleResponse.ok !== undefined ? singleResponse.ok : true;
          responseStatus = singleResponse.status || 200;
        } else {
          // Response might be the data directly
          singleData = singleResponse;
          responseOk = true;
          responseStatus = 200;
        }


        // ✅ DEBUG: Log the received data structure for debugging
        console.log('🔍 [DEBUG] QR codes API raw response:', {
          success: singleData?.success,
          hasData: !!singleData?.data,
          dataKeys: singleData?.data ? Object.keys(singleData.data) : [],
          hasQrCodes: !!singleData?.data?.qrCodes,
          qrCodesType: Array.isArray(singleData?.data?.qrCodes) ? 'array' : typeof singleData?.data?.qrCodes,
          qrCodesCount: Array.isArray(singleData?.data?.qrCodes) ? singleData.data.qrCodes.length : 0,
          total: singleData?.data?.total || 0,
          firstQRCode: singleData?.data?.qrCodes?.[0] || null,
          responseType: typeof singleResponse,
          responseKeys: singleResponse ? Object.keys(singleResponse) : []
        });

        // ✅ FIX: Check if data indicates error
        if (singleData && singleData.success === false) {
          console.warn('⚠️ QR codes API returned success: false', singleData);
          // Don't clear data if it's a server error, just log
          if (singleData.error && !singleData.error.includes('500')) {
            setQrCodesByName({});
            setQrCodes([]);
            setQrNameCounts({});
          }
          setLoading(false);
          return;
        }
      } catch (parseError) {
        // unifiedFetch throws errors for non-OK responses
        console.error('❌ Error fetching QR codes:', parseError);
        // If it's a network/server error, preserve existing data
        if (parseError.message && (parseError.message.includes('500') || parseError.message.includes('503'))) {
          console.warn('⚠️ Server error, preserving existing data');
          return;
        }
        // For other errors, clear data
        setQrCodesByName({});
        setQrCodes([]);
        setQrNameCounts({});
        setLoading(false);
        return;
      }

      // ✅ FIX: Log when data is undefined/null or doesn't have success flag
      if (!singleData) {
        console.warn('⚠️ QR codes API returned null/undefined data');
        setQrCodesByName({});
        setQrCodes([]);
        setQrNameCounts({});
        setLoading(false);
        return;
      }

      // ✅ FIX: Check if response indicates success (handle both explicit success and implicit success)
      const isSuccess = singleData.success === true || (singleData.data && !singleData.error);

      if (!isSuccess && singleData.success !== undefined) {
        // Explicit failure
        console.warn('⚠️ QR codes API returned success: false', {
          success: singleData.success,
          error: singleData.error,
          message: singleData.message,
          data: singleData.data
        });
        // Only clear if it's not a server error
        if (!singleData.error || !singleData.error.toString().includes('500')) {
          setQrCodesByName({});
          setQrCodes([]);
          setQrNameCounts({});
        }
        setLoading(false);
        return;
      }

      const qrsByName = {};

      if (singleData && singleData.success && singleData.data && singleData.data.qrCodes) {
        const qrCodesArray = singleData.data.qrCodes || [];


        qrCodesArray.forEach(qr => {
          // ✅ FIX: Handle both 'name' and 'qrName' fields (API might return either)
          const qrName = qr.name || qr.qrName || 'Unnamed';

          // Log QR code structure for debugging
          if (qrCodesArray.indexOf(qr) === 0) {
            console.log('📋 [TheaterQRManagement] Sample QR code structure:', {
              _id: qr._id,
              name: qr.name,
              qrName: qr.qrName,
              qrType: qr.qrType,
              hasQrImageUrl: !!qr.qrImageUrl,
              qrImageUrl: qr.qrImageUrl ? qr.qrImageUrl.substring(0, 50) + '...' : null,
              hasQrCodeUrl: !!qr.qrCodeUrl,
              qrCodeUrl: qr.qrCodeUrl ? qr.qrCodeUrl.substring(0, 50) + '...' : null,
              allFields: Object.keys(qr)
            });
          }

          if (!qrsByName[qrName]) {
            qrsByName[qrName] = [];
          }
          qrsByName[qrName].push({
            ...qr,
            name: qrName, // Ensure name field is always set
            // Ensure qrImageUrl is set if qrCodeUrl exists, and preserve both fields
            qrImageUrl: qr.qrImageUrl || qr.qrCodeUrl || null,
            qrCodeUrl: qr.qrCodeUrl || qr.qrImageUrl || null // Preserve original field for fallback
          });
        });

      } else {
        // ✅ FIX: Handle different response structures
        // Check if data is in different format (e.g., direct array, different nesting)
        let qrCodesArray = null;

        // Try different possible data structures
        if (Array.isArray(singleData)) {
          // Data is directly an array
          qrCodesArray = singleData;
        } else if (singleData?.data && Array.isArray(singleData.data)) {
          // Data is in data array
          qrCodesArray = singleData.data;
        } else if (singleData?.qrCodes && Array.isArray(singleData.qrCodes)) {
          // Data is in qrCodes field (not nested in data)
          qrCodesArray = singleData.qrCodes;
        } else if (singleData?.data?.qrCodes && Array.isArray(singleData.data.qrCodes)) {
          // Already checked above, but keep for completeness
          qrCodesArray = singleData.data.qrCodes;
        }

        if (qrCodesArray && qrCodesArray.length > 0) {
          // Process QR codes from alternative structure

          qrCodesArray.forEach(qr => {
            const qrName = qr.name || qr.qrName || 'Unnamed';

            if (!qrsByName[qrName]) {
              qrsByName[qrName] = [];
            }
            qrsByName[qrName].push({
              ...qr,
              name: qrName
            });
          });

        } else {
          // No QR codes found in any structure
          console.warn('⚠️ QR codes API returned but no QR codes found in any expected structure');
          console.log('📋 Full response structure:', {
            hasData: !!singleData,
            hasDataData: !!singleData?.data,
            dataType: typeof singleData?.data,
            isDataArray: Array.isArray(singleData?.data),
            dataKeys: singleData?.data ? Object.keys(singleData.data) : [],
            hasQrCodes: !!singleData?.qrCodes,
            isQrCodesArray: Array.isArray(singleData?.qrCodes),
            fullSingleData: singleData
          });

          // Clear data to show "No QR Codes Found" message
          setQrCodesByName({});
          setQrCodes([]);
          setQrNameCounts({});
          setLoading(false);
          return;
        }
      }

      // Only update state if we have data or if it's not a server error
      setQrCodesByName(qrsByName);

      // Also set qrCodes for backward compatibility
      const allQRs = Object.values(qrsByName).flat();
      setQrCodes(allQRs);

      // ✅ FIX: Calculate counts - ensure keys match QR names exactly (handle case and whitespace)
      const counts = {};
      Object.keys(qrsByName).forEach(name => {
        const trimmed = name.trim();
        // Store with original key
        counts[name] = qrsByName[name].length;
        // Store with trimmed key for matching
        counts[trimmed] = qrsByName[name].length;
        // Store with lowercase for case-insensitive matching
        counts[trimmed.toLowerCase()] = qrsByName[name].length;
        counts[name.toLowerCase()] = qrsByName[name].length;
      });

      // ✅ FIX: Also create normalized lookup using QR names from API
      // QR Names API returns objects with 'qrName' field
      // QR Codes API returns objects with 'name' field
      // We need to ensure counts can be looked up using either field format
      const normalizedCounts = { ...counts };

      // Map QR names to their corresponding counts
      qrNames.forEach(qrNameObj => {
        const qrName = qrNameObj.qrName || qrNameObj.name || '';
        const trimmed = qrName.trim();

        // Find matching count from QR codes (by name)
        const matchingCount = Object.keys(qrsByName).find(codeName => {
          const codeNameTrimmed = codeName.trim();
          return codeNameTrimmed.toLowerCase() === trimmed.toLowerCase() ||
            codeNameTrimmed === trimmed ||
            codeName === qrName;
        });

        if (matchingCount !== undefined) {
          const count = qrsByName[matchingCount].length;
          // Store count with QR name as key (for lookup in UI)
          normalizedCounts[qrName] = count;
          normalizedCounts[trimmed] = count;
          normalizedCounts[trimmed.toLowerCase()] = count;
          normalizedCounts[qrName.toLowerCase()] = count;
        } else {
          // No matching QR codes found
          normalizedCounts[qrName] = 0;
          normalizedCounts[trimmed] = 0;
          normalizedCounts[trimmed.toLowerCase()] = 0;
          normalizedCounts[qrName.toLowerCase()] = 0;
        }
      });

      console.log('📊 QR name counts calculated:', {
        originalCounts: counts,
        normalizedCounts: normalizedCounts,
        qrNameKeys: Object.keys(counts),
        qrCodesByKey: Object.keys(qrsByName).map(k => ({
          key: k,
          count: qrsByName[k].length,
          sampleNames: qrsByName[k].slice(0, 2).map(qr => qr.name || qr.qrName)
        }))
      });
      setQrNameCounts({ ...counts, ...normalizedCounts }); // Merge both for flexible lookup

      // ✅ FIX: Auto-switch active category - match with QR names from separate API
      setActiveCategory(prevCategory => {
        // ✅ FIX: Normalize previous category for matching
        const prevCategoryNormalized = prevCategory ? prevCategory.trim().toLowerCase() : '';

        // Check if previous category still exists (with normalized matching)
        const prevCategoryExists = prevCategory && Object.keys(qrsByName).some(name => {
          const normalized = name.trim().toLowerCase();
          return normalized === prevCategoryNormalized || name === prevCategory;
        });

        // If no previous category or previous category no longer exists in QR codes
        if (!prevCategory || !prevCategoryExists) {
          // Try to find a category that matches existing QR names first
          // This ensures we select a category that exists in both QR names and QR codes
          const availableCategories = Object.keys(qrsByName).filter(name => qrsByName[name].length > 0);

          // Check if any QR names match available categories (normalized matching)
          if (qrNames.length > 0 && availableCategories.length > 0) {
            // Try to find a match between QR names and QR code categories
            for (const qrNameObj of qrNames) {
              const qrName = qrNameObj.qrName || qrNameObj.name || '';
              const qrNameNormalized = qrName.trim().toLowerCase();

              // Find matching category from QR codes
              const matchingCategory = availableCategories.find(category => {
                const categoryNormalized = category.trim().toLowerCase();
                return categoryNormalized === qrNameNormalized || category === qrName;
              });

              if (matchingCategory) {
                return matchingCategory; // Use the category name from QR codes (not QR names)
              }
            }
          }

          // ✅ FIX: If no match found, use first available category (even if no QR names match)
          if (availableCategories.length > 0) {
            return availableCategories[0];
          }

          // ✅ FIX: If we have QR codes but no categories match QR names, still set first category
          const allCategories = Object.keys(qrsByName);
          if (allCategories.length > 0) {
            return allCategories[0];
          }

          console.warn('⚠️ No QR code categories available');
          return null;
        }

        // Previous category still exists, keep it
        return prevCategory;
      });

      // ✅ FIX: If active category is still not set after processing, set it to first available
      setTimeout(() => {
        setActiveCategory(prev => {
          if (!prev && Object.keys(qrsByName).length > 0) {
            const firstCategory = Object.keys(qrsByName)[0];
            return firstCategory;
          }
          return prev;
        });
      }, 100);

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      // ✅ FIX: Only log errors that aren't network/server unavailability errors
      // Network errors (Failed to fetch, ECONNRESET, etc.) are expected when server is down
      const isNetworkError =
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('network request failed') ||
        error.code === 'ECONNRESET';

      if (!isNetworkError) {
        console.error('Failed to load theater data:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [theaterId]); // Removed 'theater' and 'showError' to prevent circular dependency

  // Load QR codes
  const loadQRCodes = useCallback(async (forceRefresh = false) => {
    if (!theaterId) return;

    try {
      setLoading(true);

      // 🚀 CRITICAL: Clear existing data before fetch to prevent stale data
      setQrCodes([]);
      setQrCodesByName({});
      setQrNameCounts({});

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
      }

      // Use same endpoint as admin page with cache-busting timestamp
      const timestamp = Date.now();
      const params = new URLSearchParams({
        _t: timestamp.toString()
      });

      if (forceRefresh) {
        params.append('_force', Date.now().toString());
      }


      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes/theater/${theaterId}?${params.toString()}`, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Always get latest QR codes
        cacheTTL: 0
      });


      if (!response.ok) {
        throw new Error('Failed to fetch QR codes');
      }

      const data = await response.json();

      if (data.success && data.data && data.data.qrCodes) {
        const qrCodesData = data.data.qrCodes;

        setQrCodes(qrCodesData);

        // Calculate counts per QR name
        const counts = {};
        qrCodesData.forEach(qr => {
          const name = qr.name || 'Unnamed';
          counts[name] = (counts[name] || 0) + 1;
        });

        setQrNameCounts(counts);
      } else {
        console.warn('⚠️ No QR codes found or invalid response');
        setQrCodes([]);
        setQrNameCounts({});
      }
    } catch (error) {
      if (error.name === 'AbortError') {

        return;
      }

      showError('Failed to load QR codes');
    } finally {
      setLoading(false);
    }
  }, [theaterId, showError]);

  useEffect(() => {
    loadQRNames();
    loadTheaterData(); // This now handles both theater and QR codes

    // Add event listener for page visibility changes
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadTheaterData();
      }
    };

    // Add event listener for window focus
    const handleFocus = () => {
      loadTheaterData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      setQrCodesByName({});
      setActiveCategory(null);
      setQrNames([]);
      setLoading(true);
    };
  }, [theaterId, loadQRNames, loadTheaterData]); // Add theaterId to dependencies

  // Reload data when navigating back from Generate QR page
  useEffect(() => {
    if (location.state?.reload) {
      loadTheaterData();
      // Clear the state to prevent reload loops
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, loadTheaterData, navigate]);

  // ✅ FIX: Auto-set active category when QR codes are loaded but no category is selected
  useEffect(() => {
    if (!activeCategory && Object.keys(qrCodesByName).length > 0) {
      const firstCategory = Object.keys(qrCodesByName)[0];
      setActiveCategory(firstCategory);
    }
  }, [qrCodesByName, activeCategory]);

  // Filter QR codes by active category (matching admin page pattern)
  const currentQRs = useMemo(() => {
    // ✅ FIX: If no active category, try to show all QR codes or first available category
    if (!activeCategory) {
      // If we have QR codes but no active category, show all or first category
      const allCategories = Object.keys(qrCodesByName);
      if (allCategories.length > 0) {
        // Return first category's QR codes as fallback
        return qrCodesByName[allCategories[0]] || [];
      }
      return [];
    }

    // ✅ FIX: Try exact match first
    if (qrCodesByName[activeCategory]) {
      return qrCodesByName[activeCategory];
    }

    // ✅ FIX: Try normalized matching (case-insensitive, whitespace-tolerant)
    const activeCategoryNormalized = activeCategory.trim().toLowerCase();
    const matchingCategory = Object.keys(qrCodesByName).find(category => {
      const categoryNormalized = category.trim().toLowerCase();
      return categoryNormalized === activeCategoryNormalized || category === activeCategory;
    });

    if (matchingCategory) {
      return qrCodesByName[matchingCategory];
    }

    // ✅ FIX: If still no match, return all QR codes from all categories
    const allQRs = Object.values(qrCodesByName).flat();
    if (allQRs.length > 0) {
      console.warn(`⚠️ Active category "${activeCategory}" not found in QR codes, showing all QR codes`);
      return allQRs;
    }

    return [];
  }, [qrCodesByName, activeCategory]);

  // Modal handlers
  const openCrudModal = useCallback((qrCode, mode = 'view') => {
    console.log('🔍 [TheaterQRManagement] Opening modal with QR code:', {
      _id: qrCode?._id,
      name: qrCode?.name,
      qrType: qrCode?.qrType,
      hasQrImageUrl: !!qrCode?.qrImageUrl,
      qrImageUrl: qrCode?.qrImageUrl,
      hasQrCodeUrl: !!qrCode?.qrCodeUrl,
      qrCodeUrl: qrCode?.qrCodeUrl,
      hasSeats: !!(qrCode?.seats && qrCode.seats.length > 0),
      seatsCount: qrCode?.seats?.length || 0,
      fullQrCode: qrCode
    });

    setCrudModal({
      isOpen: true,
      qrCode: qrCode,
      mode: mode
    });

    // Set display image URL - check multiple possible field names
    let imageUrl = null;

    if (qrCode) {
      // Check for qrImageUrl (mapped from backend) - primary field
      if (qrCode.qrImageUrl && qrCode.qrImageUrl.trim()) {
        imageUrl = qrCode.qrImageUrl.trim();
      }
      // Fallback to qrCodeUrl if qrImageUrl is not available
      else if (qrCode.qrCodeUrl && qrCode.qrCodeUrl.trim()) {
        imageUrl = qrCode.qrCodeUrl.trim();
      }
      // Check for imageUrl (alternative field name)
      else if (qrCode.imageUrl && qrCode.imageUrl.trim()) {
        imageUrl = qrCode.imageUrl.trim();
      }
      // Check for gcsPath and generate signed URL if needed
      else if (qrCode.gcsPath && qrCode.gcsPath.trim()) {
        // For GCS paths, we might need to generate a signed URL
        // For now, try to construct the URL directly
        const gcsPath = qrCode.gcsPath.trim();
        if (gcsPath.startsWith('http')) {
          imageUrl = gcsPath;
        } else {
          // If it's a path, we might need to fetch a signed URL from backend
        }
      }
      // For screen QR codes, use first seat's QR code URL if available
      else if (qrCode.qrType === 'screen' && qrCode.seats && qrCode.seats.length > 0) {
        const firstSeatWithQR = qrCode.seats.find(seat =>
          (seat.qrCodeUrl && seat.qrCodeUrl.trim()) ||
          (seat.qrImageUrl && seat.qrImageUrl.trim())
        );
        if (firstSeatWithQR) {
          imageUrl = (firstSeatWithQR.qrCodeUrl || firstSeatWithQR.qrImageUrl).trim();
        }
      }

      if (!imageUrl) {
        console.warn('⚠️ [TheaterQRManagement] No image URL found for QR code:', {
          _id: qrCode._id,
          name: qrCode.name,
          qrType: qrCode.qrType,
          availableFields: Object.keys(qrCode),
          qrImageUrl: qrCode.qrImageUrl ? 'exists' : 'missing',
          qrCodeUrl: qrCode.qrCodeUrl ? 'exists' : 'missing',
          imageUrl: qrCode.imageUrl ? 'exists' : 'missing',
          gcsPath: qrCode.gcsPath ? 'exists' : 'missing'
        });
      }
    }

    setDisplayImageUrl(imageUrl);
  }, []);

  const closeCrudModal = useCallback(() => {
    setCrudModal({
      isOpen: false,
      qrCode: null,
      mode: 'view'
    });
  }, []);

  // Handle Generate QR Codes navigation
  const handleGenerateQRCodes = useCallback(() => {
    navigate(`/theater-generate-qr/${theaterId}`);
  }, [navigate, theaterId]);

  // Handle CRUD Save (mirrored from admin page)
  const handleCrudSave = useCallback(async (formData) => {
    try {
      setActionLoading(prev => ({ ...prev, [formData._id || 'new']: true }));

      const isEditing = crudModal.mode === 'edit';
      const isCreating = crudModal.mode === 'create';

      if (isCreating) {
        // Handle QR Code Creation
        const createPayload = {
          theater: theaterId,
          qrType: formData.qrType || 'single',
          qrName: formData.name,
          seatClass: formData.seatClass,
          seat: formData.seat || null,
          logoUrl: formData.logoUrl,
          logoType: formData.logoType || 'default',
          isActive: formData.isActive !== false
        };

        const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(createPayload)
        }, {
          forceRefresh: true, // Don't cache POST requests
          cacheTTL: 0
        });

        // Parse response JSON once
        const data = await response.json();

        // Check both response.ok and data.success for proper error handling
        if (response.ok && data.success !== false) {
          // Immediately add to state
          if (data.qrCode) {
            setQrCodes(prevQrs => [...prevQrs, data.qrCode]);

            // Update counts immediately
            setQrNameCounts(prevCounts => ({
              ...prevCounts,
              [data.qrCode.name]: (prevCounts[data.qrCode.name] || 0) + 1
            }));
          }

          showSuccess('QR code created successfully');
          closeCrudModal();

          // Reload to ensure data is in sync
          await loadTheaterData();
        } else {
          throw new Error(data.message || data.error || 'Failed to create QR code');
        }

      } else if (isEditing) {
        if (formData.isSeatRow && formData.parentQRDetailId && formData.seatId) {
          if (formData.isNewSeat || formData.seatId.toString().startsWith('new_')) {
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
                })
              },
              {
                forceRefresh: true, // Don't cache POST requests
                cacheTTL: 0
              }
            );

            // Parse response JSON
            const seatData = await response.json();

            // Check both response.ok and data.success
            if (response.ok && seatData.success !== false) {
              await loadTheaterData();
              closeCrudModal();
              showSuccess(`Seat ${formData.seatNumber} added successfully!`);
            } else {
              throw new Error(seatData.message || seatData.error || 'Failed to create new seat');
            }

          } else {
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
                  qrCodeUrl: formData.qrImageUrl
                })
              },
              {
                forceRefresh: true, // Don't cache PUT requests
                cacheTTL: 0
              }
            );

            // Parse response JSON
            const seatUpdateData = await response.json();

            // Check both response.ok and data.success
            if (response.ok && seatUpdateData.success !== false) {
              showSuccess(`Seat ${formData.seatNumber} updated successfully`);
              closeCrudModal();
              await loadTheaterData();
            } else {
              throw new Error(seatUpdateData.message || seatUpdateData.error || 'Failed to update seat');
            }
          }

        } else {
          if (!formData.parentDocId) {
            setActionLoading(prev => ({ ...prev, [formData._id]: false }));
            return;
          }

          const updatePayload = {
            qrName: formData.name,
            seatClass: formData.seatClass,
            seat: formData.seat || null,
            logoUrl: formData.logoUrl,
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

          // Check both response.ok and data.success for proper error handling
          if (response.ok && data.success !== false) {
            // Immediately update state
            setQrCodes(prevQrs =>
              prevQrs.map(qr =>
                qr._id === formData._id
                  ? { ...qr, ...updatePayload, name: updatePayload.qrName }
                  : qr
              )
            );

            showSuccess('QR code updated successfully');
            closeCrudModal();

            // Reload to ensure data is in sync
            await loadTheaterData();
          } else {
            throw new Error(data.message || data.error || 'Failed to update QR code');
          }
        }
      }
    } catch (error) {
      console.error('Error saving QR code:', error);
      showError(error.message || 'Failed to save QR code');
      // Don't close modal on error so user can fix and retry
    } finally {
      setActionLoading(prev => ({ ...prev, [formData._id || 'new']: false }));
    }
  }, [crudModal.mode, loadTheaterData, closeCrudModal, showSuccess, showError]);

  // Delete Seat (mirrored from admin page)
  const deleteSeat = async (seatId, seatName) => {
    const parentDocId = crudModal.qrCode?.parentDocId;
    const parentQRDetailId = crudModal.qrCode?.parentQRDetailId;

    if (!parentDocId || !parentQRDetailId || !seatId) {
      showError('Missing required information to delete seat');
      return;
    }

    const confirmed = await showConfirm(
      'Confirm Deletion',
      `Are you sure you want to delete ${seatName}? This action cannot be undone.`,
      'danger'
    );

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
        closeCrudModal();
        await loadTheaterData();
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

  // Download QR code
  const downloadQRCode = useCallback(async (qrCode) => {
    try {
      // Check if QR code has required fields
      if (!qrCode._id) {
        showError('QR code ID not available');
        return;
      }

      // Check if this is a screen QR with seats - download as ZIP collection
      if (qrCode.qrType === 'screen' && qrCode.seats && qrCode.seats.length > 0) {
        const seatsWithQR = qrCode.seats.filter(s => s.qrCodeUrl);

        if (seatsWithQR.length === 0) {
          showError('No QR codes available to download');
          return;
        }

        try {
          const zip = new JSZip();
          const folderName = `${qrCode.seatClass || qrCode.name || 'QR_Codes'}_QR_Codes`;
          const folder = zip.folder(folderName);

          // Fetch all seat QR code images
          const token = localStorage.getItem('authToken') || localStorage.getItem('token');
          const fetchPromises = seatsWithQR.map(async (seat) => {
            try {
              // Try to fetch directly from qrCodeUrl first
              let response = await fetch(seat.qrCodeUrl);

              // If direct fetch fails (CORS issue), try using backend proxy
              if (!response.ok || response.type === 'opaque') {
                // Use backend proxy endpoint if available
                if (seat._id) {
                  const proxyUrl = `${config.api.baseUrl}/single-qrcodes/${seat._id}/download`;
                  response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Accept': 'image/png, image/*, */*'
                    }
                  });
                }
              }

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
          return;
        } catch (error) {
          console.error('Failed to create ZIP file:', error);
          showError('Failed to create ZIP file. Please try again.');
          return;
        }
      }

      // Single QR code download (for non-screen types or single QR codes)
      const filename = `${(qrCode.name || 'qr-code').replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}_QR.png`;

      // Use backend proxy to download (handles CORS and authentication)
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

  // Toggle QR code status
  const toggleQRStatus = useCallback(async (qrCodeId, currentStatus) => {
    try {
      setActionLoading(prev => ({ ...prev, [qrCodeId]: true }));

      // Find the QR code to get its parentDocId
      let qrToUpdate = null;
      let parentDocId = null;

      // Search in qrCodes array
      const allQRs = qrCodes || [];
      qrToUpdate = allQRs.find(q => q._id === qrCodeId);

      if (qrToUpdate) {
        parentDocId = qrToUpdate.parentDocId;
      } else {
        // Also search in qrCodesByName structure
        Object.keys(qrCodesByName).forEach(name => {
          const qr = qrCodesByName[name].find(q => q._id === qrCodeId);
          if (qr) {
            qrToUpdate = qr;
            parentDocId = qr.parentDocId;
          }
        });
      }

      if (!parentDocId) {
        console.error('❌ Parent document ID not found for QR:', qrCodeId);
        showError('Failed to update QR status: Missing parent document');
        setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
        return;
      }

      const newStatus = !currentStatus;

      // 🚀 INSTANT UI UPDATE: Update local state immediately (before API call)
      setQrCodes(prevQrs => {
        return prevQrs.map(qr =>
          qr._id === qrCodeId
            ? { ...qr, isActive: newStatus }
            : qr
        );
      });

      // Also update qrCodesByName structure
      setQrCodesByName(prevQRs => {
        const updatedQRs = {};
        Object.keys(prevQRs).forEach(name => {
          updatedQRs[name] = prevQRs[name].map(qr =>
            qr._id === qrCodeId ? { ...qr, isActive: newStatus } : qr
          );
        });
        return updatedQRs;
      });

      // ✅ FIX: Use correct endpoint with parentDocId and PUT method
      const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes/${parentDocId}/details/${qrCodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({
          isActive: newStatus
        })
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });

      // ✅ FIX: unifiedFetch throws errors for non-OK responses, so if we get here, response should be OK
      if (!response) {
        throw new Error('No response received from server');
      }

      const data = await response.json();

      if (data.success) {
        // ✅ FIX: Verify the response contains the updated QR code data
        console.log('✅ [Toggle QR Status] API response:', {
          success: data.success,
          hasData: !!data.data,
          hasOffer: !!(data.data?.offer || data.data?.qrDetail),
          updatedIsActive: data.data?.offer?.isActive ?? data.data?.qrDetail?.isActive
        });

        showSuccess(`QR code ${newStatus ? 'activated' : 'deactivated'} successfully`);

        // ✅ FIX: Clear cache and reload using loadTheaterData to ensure both qrCodes and qrCodesByName are updated
        // Clear any cached data for QR codes from sessionStorage
        try {
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`single-qrcodes/theater/${theaterId}`) ||
              key.includes(`theater_${theaterId}`) ||
              key.includes(`qrcodenames_${theaterId}`) ||
              key.includes('single-qrcodes') ||
              key.includes('theater_offers')) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('Cache clear warning:', e);
        }

        // Clear localStorage cache as well
        try {
          const localCacheKeys = Object.keys(localStorage);
          localCacheKeys.forEach(key => {
            if (key.includes(`single-qrcodes/theater/${theaterId}`) ||
              key.includes(`theater_${theaterId}`) ||
              key.includes(`qrcodenames_${theaterId}`)) {
              localStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('LocalStorage cache clear warning:', e);
        }

        // ✅ FIX: Reload immediately after API success to ensure data is in sync
        // Use loadTheaterData instead of loadQRCodes to ensure qrCodesByName is also updated
        // No delay needed - reload immediately since API call is complete
        loadTheaterData();
      } else {
        // Rollback optimistic update
        setQrCodes(prevQrs => {
          return prevQrs.map(qr =>
            qr._id === qrCodeId
              ? { ...qr, isActive: currentStatus }
              : qr
          );
        });
        setQrCodesByName(prevQRs => {
          const updatedQRs = {};
          Object.keys(prevQRs).forEach(name => {
            updatedQRs[name] = prevQRs[name].map(qr =>
              qr._id === qrCodeId ? { ...qr, isActive: currentStatus } : qr
            );
          });
          return updatedQRs;
        });
        throw new Error(data.message || 'Failed to update QR code status');
      }
    } catch (error) {
      console.error('❌ Failed to toggle QR status:', error);

      // Rollback optimistic update on error
      setQrCodes(prevQrs => {
        return prevQrs.map(qr =>
          qr._id === qrCodeId
            ? { ...qr, isActive: currentStatus }
            : qr
        );
      });
      setQrCodesByName(prevQRs => {
        const updatedQRs = {};
        Object.keys(prevQRs).forEach(name => {
          updatedQRs[name] = prevQRs[name].map(qr =>
            qr._id === qrCodeId ? { ...qr, isActive: currentStatus } : qr
          );
        });
        return updatedQRs;
      });

      showError(error.message || 'Failed to update QR code status');
    } finally {
      setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
    }
  }, [qrCodes, qrCodesByName, loadTheaterData, showError, showSuccess]);

  // Delete QR code
  const deleteQRCode = useCallback((qrCodeId, qrCodeName) => {

    // Find the full QR code object to get parentDocId
    let qrToDelete = null;
    const allQRs = qrCodes || [];
    qrToDelete = allQRs.find(q => q._id === qrCodeId);

    if (qrToDelete) {
      setDeleteModal({ show: true, qrCode: qrToDelete });
    } else {
      // Fallback if QR not found in list
      setDeleteModal({ show: true, qrCode: { _id: qrCodeId, name: qrCodeName } });
    }
  }, [qrCodes]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteModal.qrCode || isDeleting) return;

    setIsDeleting(true);
    const qrCodeId = deleteModal.qrCode._id;
    const parentDocId = deleteModal.qrCode.parentDocId;


    // Check if we have parentDocId (nested structure)
    if (!parentDocId) {

      // Fallback to direct delete if no parentDocId
      try {
        setActionLoading(prev => ({ ...prev, [qrCodeId]: true }));

        const token = localStorage.getItem('token') || localStorage.getItem('authToken');

        const response = await unifiedFetch(`${config.api.baseUrl}/single-qrcodes/${qrCodeId}?permanent=true`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          forceRefresh: true, // Don't cache DELETE requests
          cacheTTL: 0
        });


        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ Delete failed:', errorData);

          // Handle specific case where QR detail is already deleted
          if (response.status === 404 && (errorData.error === 'QR detail not found' || errorData.message?.includes('QR detail not found'))) {
            // QR is already deleted, just update the UI state
            const deletedQrName = deleteModal.qrCode.name;

            // Remove from state
            setQrCodes(prevQrs => prevQrs.filter(qr => qr._id !== qrCodeId));
            setQrCodesByName(prevByName => {
              const updated = { ...prevByName };
              if (updated[deletedQrName]) {
                updated[deletedQrName] = updated[deletedQrName].filter(qr => qr._id !== qrCodeId);
                if (updated[deletedQrName].length === 0) {
                  delete updated[deletedQrName];
                  if (activeCategory === deletedQrName) {
                    const remainingCategories = Object.keys(updated);
                    setActiveCategory(remainingCategories.length > 0 ? remainingCategories[0] : null);
                  }
                }
              }
              return updated;
            });

            setDeleteModal({ show: false, qrCode: null });
            showSuccess('QR code was already deleted');
            setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
            setIsDeleting(false);
            return; // Exit early, don't throw error
          }

          throw new Error(errorData.message || errorData.error || 'Failed to delete QR code');
        }

        const data = await response.json();

        if (data.success) {
          // Immediately remove from ALL state before reloading
          const deletedQrName = deleteModal.qrCode.name;

          setQrCodes(prevQrs => {
            const updatedQrs = prevQrs.filter(qr => qr._id !== qrCodeId);

            // Update counts immediately
            const counts = {};
            updatedQrs.forEach(qr => {
              const name = qr.name || 'Unnamed';
              counts[name] = (counts[name] || 0) + 1;
            });
            setQrNameCounts(counts);

            return updatedQrs;
          });

          // CRITICAL: Also update qrCodesByName immediately
          setQrCodesByName(prevByName => {
            const updated = { ...prevByName };
            if (updated[deletedQrName]) {
              updated[deletedQrName] = updated[deletedQrName].filter(qr => qr._id !== qrCodeId);
              // Remove category if empty
              if (updated[deletedQrName].length === 0) {
                delete updated[deletedQrName];

                // Switch to another category if current one is empty
                if (activeCategory === deletedQrName) {
                  const remainingCategories = Object.keys(updated);
                  if (remainingCategories.length > 0) {
                    setActiveCategory(remainingCategories[0]);
                  } else {
                    setActiveCategory(null);
                  }
                }
              }
            }
            return updated;
          });

          setDeleteModal({ show: false, qrCode: null });
          showSuccess('QR code deleted successfully');

          // NO RELOAD - State is already updated immediately above
        } else {
          throw new Error(data.message || 'Failed to delete QR code');
        }
      } catch (error) {
        console.error('💥 Delete error:', error);

        showError(error.message || 'Failed to delete QR code');
      } finally {
        setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
        setIsDeleting(false);
      }
      return;
    }

    // Use nested delete endpoint (matching TheaterQRDetail)
    try {
      setActionLoading(prev => ({ ...prev, [qrCodeId]: true }));

      const token = localStorage.getItem('token') || localStorage.getItem('authToken');


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


      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Delete failed:', errorData);

        // Handle specific case where QR detail is already deleted
        if (response.status === 404 && (errorData.error === 'QR detail not found' || errorData.message?.includes('QR detail not found'))) {
          // QR is already deleted, just update the UI state
          const deletedQrName = deleteModal.qrCode.name;

          // Remove from state
          setQrCodes(prevQrs => prevQrs.filter(qr => qr._id !== qrCodeId));
          setQrCodesByName(prevByName => {
            const updated = { ...prevByName };
            if (updated[deletedQrName]) {
              updated[deletedQrName] = updated[deletedQrName].filter(qr => qr._id !== qrCodeId);
              if (updated[deletedQrName].length === 0) {
                delete updated[deletedQrName];
                if (activeCategory === deletedQrName) {
                  const remainingCategories = Object.keys(updated);
                  setActiveCategory(remainingCategories.length > 0 ? remainingCategories[0] : null);
                }
              }
            }
            return updated;
          });

          setDeleteModal({ show: false, qrCode: null });
          showSuccess('QR code was already deleted');
          setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
          setIsDeleting(false);
          return; // Exit early, don't throw error
        }

        throw new Error(errorData.message || errorData.error || 'Failed to delete QR code');
      }

      const data = await response.json();

      if (data.success) {
        // Immediately remove from ALL state before reloading
        const deletedQrName = deleteModal.qrCode.name;

        setQrCodes(prevQrs => {
          const updatedQrs = prevQrs.filter(qr => qr._id !== qrCodeId);

          // Update counts immediately
          const counts = {};
          updatedQrs.forEach(qr => {
            const name = qr.name || 'Unnamed';
            counts[name] = (counts[name] || 0) + 1;
          });
          setQrNameCounts(counts);

          return updatedQrs;
        });

        // CRITICAL: Also update qrCodesByName immediately
        setQrCodesByName(prevByName => {
          const updated = { ...prevByName };
          if (updated[deletedQrName]) {
            updated[deletedQrName] = updated[deletedQrName].filter(qr => qr._id !== qrCodeId);
            // Remove category if empty
            if (updated[deletedQrName].length === 0) {
              delete updated[deletedQrName];

              // Switch to another category if current one is empty
              if (activeCategory === deletedQrName) {
                const remainingCategories = Object.keys(updated);
                if (remainingCategories.length > 0) {
                  setActiveCategory(remainingCategories[0]);
                } else {
                  setActiveCategory(null);
                }
              }
            }
          }
          return updated;
        });

        setDeleteModal({ show: false, qrCode: null });
        showSuccess('QR code deleted successfully');

        // NO RELOAD - State is already updated immediately above
      } else {
        console.error('❌ Delete unsuccessful:', data);
        throw new Error(data.message || 'Failed to delete QR code');
      }
    } catch (error) {
      console.error('💥 Delete error:', error);
      showError(error.message || 'Failed to delete QR code');
    } finally {
      setActionLoading(prev => ({ ...prev, [qrCodeId]: false }));
      setIsDeleting(false);
    }
  }, [deleteModal.qrCode, loadTheaterData, showError, showSuccess, isDeleting]);

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="QR Management" currentPage="qr-management">
        <div className="theater-user-details-page">
          <PageContainer
            hasHeader={false}
            className="theater-user-management-vertical"
          >
            {/* Vertical Page Header */}
            <VerticalPageHeader
              title="QR CODE"
              showBackButton={false}
              actionButton={
                <button
                  className="header-btn"
                  onClick={handleGenerateQRCodes}
                >
                  <span className="btn-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                  </span>
                  GENERATE QR CODES
                </button>
              }
            />



            <div className="theater-user-settings-container">
              {/* Settings Tabs - Dynamic QR Names */}
              <div className="theater-user-settings-tabs">
                {qrNamesLoading ? (
                  <div className="theater-user-loading">Loading QR names...</div>
                ) : (() => {
                  // ✅ FIX: Use QR names if available, otherwise fall back to QR code names
                  const availableCategories = qrNames.length > 0
                    ? qrNames.map(qrName => qrName.qrName || qrName.name || '').filter(Boolean)
                    : Object.keys(qrCodesByName).filter(Boolean);

                  // Only show alert if there are no QR codes AND no QR names
                  if (availableCategories.length === 0 && Object.keys(qrCodesByName).length === 0) {
                    return <div className="theater-user-no-names">No QR names configured for this theater</div>;
                  }

                  // If we have QR names, use them; otherwise use QR code names
                  if (qrNames.length > 0) {
                    return qrNames.map((qrName) => {
                      // ✅ FIX: Get count using multiple lookup methods to handle mismatches
                      const qrNameKey = qrName.qrName || qrName.name || '';
                      // Try multiple lookup methods: exact match, trimmed, lowercase
                      const count = qrNameCounts[qrNameKey]
                        || qrNameCounts[qrNameKey.trim()]
                        || qrNameCounts[qrNameKey.trim().toLowerCase()]
                        || qrNameCounts[qrNameKey.toLowerCase()]
                        || 0;

                      // ✅ FIX: Find matching category from QR codes when clicking tab
                      const handleTabClick = () => {
                        // Find matching category from qrCodesByName (which uses 'name' from QR codes)
                        const matchingCategory = Object.keys(qrCodesByName).find(category => {
                          const categoryNormalized = category.trim().toLowerCase();
                          const qrNameNormalized = qrNameKey.trim().toLowerCase();
                          return categoryNormalized === qrNameNormalized || category === qrNameKey;
                        });

                        // Use matching category if found, otherwise use QR name key
                        setActiveCategory(matchingCategory || qrNameKey);
                      };

                      // Check if this tab is active (with normalized matching)
                      const isActive = activeCategory && (
                        activeCategory === qrNameKey ||
                        activeCategory.trim().toLowerCase() === qrNameKey.trim().toLowerCase() ||
                        Object.keys(qrCodesByName).some(category => {
                          const categoryNormalized = category.trim().toLowerCase();
                          const qrNameNormalized = qrNameKey.trim().toLowerCase();
                          return (categoryNormalized === qrNameNormalized || category === qrNameKey) &&
                            activeCategory === category;
                        })
                      );

                      return (
                        <button
                          key={qrNameKey}
                          className={`theater-user-settings-tab ${isActive ? 'active' : ''}`}
                          onClick={handleTabClick}
                        >
                          {qrNameKey}
                          <span className="theater-user-tab-count">{count}</span>
                        </button>
                      );
                    });
                  } else {
                    // ✅ FIX: Use QR code names when QR names are not available
                    return Object.keys(qrCodesByName).map((category) => {
                      const qrCodesInCategory = qrCodesByName[category] || [];
                      const count = qrCodesInCategory.length;

                      const handleTabClick = () => {
                        setActiveCategory(category);
                      };

                      const isActive = activeCategory === category;

                      return (
                        <button
                          key={category}
                          className={`theater-user-settings-tab ${isActive ? 'active' : ''}`}
                          onClick={handleTabClick}
                        >
                          {category}
                          <span className="theater-user-tab-count">{count}</span>
                        </button>
                      );
                    });
                  }
                })()}
              </div>

              {/* Settings Content - Table */}
              <div className="theater-user-settings-content">
                <div className="theater-user-settings-section">
                  <div className="theater-user-section-header">
                    <h3>{activeCategory ? `${activeCategory} QR Codes` : 'QR Codes'}</h3>
                    <div className="theater-user-section-stats">
                      {loading ? (
                        <>
                          <span>Total: <span className="loading-dots">...</span></span>
                          <span>Active: <span className="loading-dots">...</span></span>
                        </>
                      ) : (
                        <>
                          <span>Total: {currentQRs.length}</span>
                          <span>Active: {currentQRs.filter(qr => qr.isActive !== false).length}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* QR Table - MATCHES SUPER ADMIN PAGE */}
                  <div className="table-container">
                    <div className="table-wrapper">
                      <table className="theater-table">
                        <thead>
                          <tr>
                            <th className="sno-col">S NO</th>
                            <th className="name-col">QR CODE NAME</th>
                            <th className="access-status-col">ACCESS STATUS</th>
                            <th className="status-col">STATUS</th>
                            <th className="actions-col">ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan="5" className="table-empty-center">
                                Loading QR codes...
                              </td>
                            </tr>
                          ) : currentQRs.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="table-empty-center">
                                <div className="empty-state">
                                  <div className="empty-icon">
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                                      <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v3h-3v2h3v3h2v-3h3v-2h-3v-3z" />
                                    </svg>
                                  </div>
                                  <h3>No QR Codes Found</h3>
                                  <p>
                                    {activeCategory
                                      ? `No QR codes found for "${activeCategory}"`
                                      : 'Start by generating your first QR code'}
                                  </p>
                                  <button
                                    className="btn-primary"
                                    onClick={handleGenerateQRCodes}
                                  >
                                    GENERATE QR CODES
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            currentQRs.map((qrCode, index) => (
                              <tr key={qrCode._id} className={`theater-row ${!qrCode.isActive ? 'inactive' : ''}`}>
                                {/* S NO Column */}
                                <td className="sno-cell">
                                  <div className="sno-number">{index + 1}</div>
                                </td>

                                {/* QR Name Column */}
                                <td className="theater-name-cell">
                                  <div className="theater-name-full">{qrCode.name}</div>
                                </td>

                                {/* Access Status Column - Toggle Switch */}
                                <td className="access-status-cell">
                                  <div className="toggle-wrapper">
                                    <label className="switch" style={{
                                      position: 'relative',
                                      display: 'inline-block',
                                      width: '50px',
                                      height: '24px'
                                    }}>
                                      <input
                                        type="checkbox"
                                        checked={qrCode.isActive}
                                        onChange={() => toggleQRStatus(qrCode._id, qrCode.isActive)}
                                        disabled={actionLoading[qrCode._id]}
                                        style={{
                                          opacity: 0,
                                          width: 0,
                                          height: 0
                                        }}
                                      />
                                      <span className="slider" style={{
                                        position: 'absolute',
                                        cursor: actionLoading[qrCode._id] ? 'not-allowed' : 'pointer',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: qrCode.isActive ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                                        transition: '.4s',
                                        borderRadius: '24px',
                                        opacity: actionLoading[qrCode._id] ? 0.5 : 1
                                      }}>
                                        <span style={{
                                          position: 'absolute',
                                          content: '""',
                                          height: '18px',
                                          width: '18px',
                                          left: qrCode.isActive ? '26px' : '3px',
                                          bottom: '3px',
                                          backgroundColor: 'white',
                                          transition: '.4s',
                                          borderRadius: '50%',
                                          display: 'block'
                                        }}></span>
                                      </span>
                                    </label>
                                  </div>
                                </td>

                                {/* Status Column */}
                                <td className="status-cell">
                                  <span className={`status-badge ${qrCode.isActive ? 'active' : 'inactive'}`}>
                                    {qrCode.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>

                                {/* Actions Column */}
                                <td className="actions-cell">
                                  <ActionButtons>
                                    <ActionButton
                                      type="view"
                                      onClick={() => openCrudModal(qrCode, 'view')}
                                      disabled={actionLoading[qrCode._id]}
                                      title="View QR Details"
                                    />

                                    <ActionButton
                                      type="download"
                                      onClick={() => downloadQRCode(qrCode)}
                                      title="Download QR Code"
                                    />

                                    <ActionButton
                                      type="delete"
                                      onClick={() => deleteQRCode(qrCode._id, qrCode.name)}
                                      disabled={actionLoading[qrCode._id]}
                                      title="Delete QR Code"
                                    />
                                  </ActionButtons>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </PageContainer>
        </div>

        {/* CRUD Modal - Complete Mirror from Admin Page */}
        {crudModal.isOpen && crudModal.qrCode && (
          <CrudModal
            isOpen={crudModal.isOpen}
            qrCode={crudModal.qrCode}
            mode={crudModal.mode}
            theater={theater}
            onClose={closeCrudModal}
            onSave={handleCrudSave}
            onDelete={deleteSeat}
            onModeChange={(mode, newQrCode) => {
              if (newQrCode) {
                setCrudModal(prev => ({ ...prev, mode, qrCode: newQrCode }));
              } else {
                setCrudModal(prev => ({ ...prev, mode }));
              }
            }}
            actionLoading={actionLoading}
            displayImageUrl={displayImageUrl}
            onSeatEdit={(seatData) => {
              closeCrudModal();
              setTimeout(() => {
                setCrudModal({
                  isOpen: true,
                  qrCode: seatData,
                  mode: 'edit'
                });
              }, 100);
            }}
            onToggleStatus={toggleQRStatus}
            qrNames={qrNames}
            existingQRNames={Object.keys(qrCodesByName)}
          />
        )}

        {/* Delete Modal - Following Global Design System */}
        {deleteModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header">
                <h3>Delete Confirmation</h3>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete the QR code <strong>{deleteModal.qrCode?.name}</strong>?</p>
                <p className="warning-text">This action cannot be undone.</p>
              </div>
              <div className="modal-actions">
                <button
                  onClick={() => setDeleteModal({ show: false, qrCode: null })}
                  className="cancel-btn"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="confirm-delete-btn"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </TheaterLayout>

      {/* ? COMPREHENSIVE TABLE STYLING - MATCHES SUPER ADMIN PAGE */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .theater-view-modal-content,
          .theater-edit-modal-content {
            max-width: 900px !important;
            width: 85% !important;
          }

          @media (max-width: 768px) {
            .theater-view-modal-content,
            .theater-edit-modal-content {
              width: 95% !important;
              max-width: none !important;
            }
          }

          /* ============================================
             COMPREHENSIVE TABLE RESPONSIVE DESIGN
             ============================================ */
          
          /* Table base styling */
          .theater-user-settings-content .theater-table {
            width: 100%;
            min-width: 740px;
            border-collapse: collapse;
            font-size: 0.9rem;
            background: white;
            table-layout: auto !important;
            border: 1px solid #d1d5db;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }

          /* Table header styling */
          .theater-user-settings-content .theater-table thead {
            background: linear-gradient(135deg, #6B0E9B 0%, #8B2FB8 100%);
            box-shadow: 0 2px 4px rgba(107, 14, 155, 0.1);
            color: white;
            position: sticky;
            top: 0;
            z-index: 10;
          }

          .theater-user-settings-content .theater-table thead tr {
            border-bottom: 2px solid #5A0C82;
          }

          .theater-user-settings-content .theater-table th {
            padding: 18px 16px;
            text-align: center;
            font-weight: 600;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border: none;
            position: relative;
            white-space: nowrap;
            color: white !important;
          }

          .theater-user-settings-content .theater-table th::after {
            content: '';
            position: absolute;
            right: 0;
            top: 25%;
            height: 50%;
            width: 1px;
            background: rgba(255, 255, 255, 0.2);
          }

          .theater-user-settings-content .theater-table th:last-child::after {
            display: none;
          }

          /* Table body styling */
          .theater-user-settings-content .theater-table tbody tr {
            border-bottom: 1px solid #e5e7eb;
            background: #ffffff;
            transition: all 0.2s ease;
          }

          .theater-user-settings-content .theater-table tbody tr:nth-child(even) {
            background: #f9fafb;
          }

          .theater-user-settings-content .theater-table tbody tr:hover {
            background: #f0f9ff !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            transform: translateY(-1px);
          }

          .theater-user-settings-content .theater-table td {
            padding: 16px 12px;
            vertical-align: middle;
            border-right: 1px solid #f3f4f6;
          }

          .theater-user-settings-content .theater-table td:last-child {
            border-right: none;
          }

          /* Column Widths - 5 COLUMNS ONLY */
          .theater-user-settings-content .theater-table .sno-col { 
            width: 80px; 
            min-width: 70px;
            text-align: center;
          }
          
          .theater-user-settings-content .theater-table .name-col { 
            width: 200px; 
            min-width: 180px;
          }
          
          .theater-user-settings-content .theater-table .access-status-col { 
            width: 150px; 
            min-width: 130px;
            text-align: center;
          }
          
          .theater-user-settings-content .theater-table .status-col { 
            width: 130px; 
            min-width: 120px;
            text-align: center;
          }
          
          .theater-user-settings-content .theater-table .actions-col { 
            width: 180px; 
            min-width: 160px;
            text-align: center;
          }

          /* S.No cell styling */
          .theater-user-settings-content .theater-table .sno-cell {
            text-align: center;
          }

          .theater-user-settings-content .theater-table .sno-number {
            display: inline-block;
            width: 32px;
            height: 32px;
            line-height: 32px;
            background: #f3f4f6;
            border-radius: 50%;
            font-size: 0.875rem;
            font-weight: 600;
            color: #6b7280;
          }

          /* Name cell styling */
          .theater-user-settings-content .theater-table .theater-name-cell {
            font-weight: 600;
            color: #111827;
            text-align: left;
            padding-left: 20px;
          }

          .theater-user-settings-content .theater-table .theater-name-full {
            font-weight: 600;
            color: #111827;
          }

          /* Access Status cell styling */
          .theater-user-settings-content .theater-table .access-status-cell {
            text-align: center;
          }

          /* Status cell styling */
          .theater-user-settings-content .theater-table .status-cell {
            text-align: center;
          }

          /* Actions cell styling */
          .theater-user-settings-content .theater-table .actions-cell {
            text-align: center;
          }

          /* Enhanced action buttons styling */
          .theater-user-settings-content .action-buttons {
            display: flex;
            gap: 8px;
            justify-content: center;
            align-items: center;
            flex-wrap: nowrap;
          }

          /* Status badge styling */
          .theater-user-settings-content .status-badge {
            padding: 6px 16px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-block;
          }

          .theater-user-settings-content .status-badge.active {
            background: #d1fae5;
            color: #065f46;
          }

          .theater-user-settings-content .status-badge.inactive {
            background: #fee2e2;
            color: #991b1b;
          }

          /* Toggle wrapper styling */
          .theater-user-settings-content .toggle-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
          }

          /* Responsive table container */
          .theater-user-settings-content .table-container {
            width: 100%;
            overflow-x: auto;
            margin-top: 20px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }

          .theater-user-settings-content .table-wrapper {
            min-width: 100%;
            display: inline-block;
          }

          /* Empty state styling */
          .theater-user-settings-content .empty-state {
            text-align: center;
            padding: 60px 20px;
          }

          .theater-user-settings-content .empty-state .empty-icon {
            margin-bottom: 20px;
          }

          .theater-user-settings-content .empty-state h3 {
            font-size: 1.25rem;
            font-weight: 600;
            color: #111827;
            margin-bottom: 8px;
          }

          .theater-user-settings-content .empty-state p {
            color: #6b7280;
            margin-bottom: 24px;
          }

          /* Mobile responsive adjustments */
          @media (max-width: 768px) {
            .theater-user-settings-content .theater-table {
              min-width: 600px;
            }

            .theater-user-settings-content .theater-table th {
              padding: 12px 8px;
              font-size: 0.75rem;
            }

            .theater-user-settings-content .theater-table td {
              padding: 12px 8px;
            }
          }
        `
      }} />
    </ErrorBoundary>
  );
};

export default TheaterQRManagement;
