import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { useModal } from '../contexts/ModalContext';
import { optimizedFetch } from '../utils/apiOptimizer';
import config from '../config';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/theater/TheaterUserManagement.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



// Table Row Skeleton for loading state (matching RoleAccessManagementList)
const TableSkeletonRow = React.memo(() => (
  <tr className="theater-row skeleton">
    <td className="sno-cell"><div className="skeleton-text short"></div></td>
    <td className="photo-cell"><div className="theater-photo-thumb skeleton-image"></div></td>
    <td className="name-cell"><div className="skeleton-text medium"></div></td>
    <td className="owner-cell"><div className="skeleton-text medium"></div></td>
    <td className="contact-cell"><div className="skeleton-text medium"></div></td>
    <td className="actions-cell"><div className="skeleton-buttons"><div className="skeleton-button skeleton-small"></div></div></td>
  </tr>
));

TableSkeletonRow.displayName = 'TableSkeletonRow';

const TheaterUserManagement = () => {
  usePerformanceMonitoring('TheaterUserManagement');
  const navigate = useNavigate();
  const { showSuccess, showError } = useModal();
  
  const [theaters, setTheaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [editModal, setEditModal] = useState({ show: false, theater: null });
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', message: '', onConfirm: null });
  const [editFormData, setEditFormData] = useState({ password: '', confirmPassword: '' });
  
  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Performance refs
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isInitialMountRef = useRef(true);
  const isFetchingRef = useRef(false);
  const currentRequestUrlRef = useRef(null);

  // Sort theaters by ID in ascending order
  const sortedTheaters = useMemo(() => {
    return [...theaters].sort((a, b) => {
      // Sort by MongoDB ObjectId in ascending order (chronological creation order)
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [theaters]);

  const fetchTheaters = useCallback(async (forceRefresh = false) => {
    // Build query parameters for active theaters only
    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: itemsPerPage.toString(),
      isActive: 'true' // Only fetch active theaters
    });

    // Add search parameter if provided (backend expects 'q' parameter)
    if (debouncedSearchTerm.trim()) {
      params.append('q', debouncedSearchTerm.trim());
    }
    
    // 🔄 FORCE REFRESH: Add cache-busting timestamp when forceRefresh is true
    if (forceRefresh) {
      params.append('_t', Date.now().toString());
    }
    
    const requestUrl = `${config.api.baseUrl}/theaters?${params.toString()}`;
    
    // ✅ DEDUPLICATION: Skip if same request is already in progress
    if (isFetchingRef.current && currentRequestUrlRef.current === requestUrl && !forceRefresh) {
      return;
    }
    
    try {
      // ✅ FIX: Only abort if it's a different request URL
      if (abortControllerRef.current && currentRequestUrlRef.current !== requestUrl) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      currentRequestUrlRef.current = requestUrl;
      isFetchingRef.current = true;
      
      // Only set loading if we don't have cached data
      const cacheKey = `theaters_page_${currentPage}_limit_${itemsPerPage}_search_${debouncedSearchTerm || 'none'}_active`;
      const hasCache = !forceRefresh && (() => {
        try {
          const { getCachedData } = require('../utils/cacheUtils');
          return getCachedData(cacheKey, 120000) !== null;
        } catch {
          return false;
        }
      })();
      
      if (!hasCache) {
        setLoading(true);
      }
      setError('');
      
      // � FORCE REFRESH: Add no-cache headers when forceRefresh is true
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Accept': 'application/json'
      };
      
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // �🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const result = await optimizedFetch(
        requestUrl,
        {
          signal: abortControllerRef.current.signal,
          headers
        },
        forceRefresh ? null : cacheKey, // 🔄 FORCE REFRESH: Skip cache key when forceRefresh is true
        120000 // 2-minute cache
      );
      
      // ✅ FIX: Check if request was aborted after fetch completes
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      
      if (!result) {
        throw new Error('Failed to fetch active theaters');
      }

      if (result.success) {
        // PERFORMANCE OPTIMIZATION: Direct state updates
        const theaterData = result.data || [];
        setTheaters(theaterData);
        
        // Handle pagination data
        const paginationData = result.pagination || {};
        setTotalPages(paginationData.totalPages || 0);
        setTotalItems(paginationData.totalItems || 0);
      } else {
        throw new Error(result.message || 'Failed to fetch active theaters');
      }
      
    } catch (error) {
      // Handle AbortError gracefully - don't update state if aborted
      if (error.name === 'AbortError') {
        return;
      }

      // Only set error if request wasn't aborted
      if (!abortControllerRef.current?.signal.aborted) {
        setError('Failed to load active theaters');
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm]);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when searching
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  useEffect(() => {
    // 🔄 FORCE REFRESH: Only force refresh on initial mount, then use cache for subsequent calls
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      fetchTheaters(true);
    } else {
      fetchTheaters(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, currentPage, itemsPerPage]);

  // Handle edit theater password
  const handleEditClick = (theater) => {
    setEditModal({ show: true, theater });
    setEditFormData({ password: '', confirmPassword: '' });
  };

  // Handle view theater details - navigate to new page
  const handleViewClick = (theater) => {
    navigate(`/theater-users/${theater._id}`);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle password update
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    
    if (!editFormData.password) {
      setConfirmModal({
        show: true,
        type: 'error',
        message: 'Please enter a new password',
        onConfirm: () => setConfirmModal({ show: false, type: '', message: '', onConfirm: null })
      });
      return;
    }
    
    if (editFormData.password !== editFormData.confirmPassword) {
      setConfirmModal({
        show: true,
        type: 'error',
        message: 'Passwords do not match',
        onConfirm: () => setConfirmModal({ show: false, type: '', message: '', onConfirm: null })
      });
      return;
    }

    // Show confirmation dialog
    setConfirmModal({
      show: true,
      type: 'confirm',
      message: `Are you sure you want to update the password for ${editModal.theater?.name}?`,
      onConfirm: async () => {
        setConfirmModal({ show: false, type: '', message: '', onConfirm: null });
        await performPasswordUpdate();
      }
    });
  };

  // Perform the actual password update
  const performPasswordUpdate = async () => {
    try {
      setLoading(true);
      
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${editModal.theater._id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({
          password: editFormData.password
        })
      }, {
        forceRefresh: true, // Don't cache password updates
        cacheTTL: 0
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update password');
      }

      // Close modal and reset form
      setEditModal({ show: false, theater: null });
      setEditFormData({ password: '', confirmPassword: '' });
      setShowPassword(false);
      setShowConfirmPassword(false);
      
      // Show success toast
      showSuccess('Password updated successfully!');
      
      // 🔄 FORCE REFRESH: Refresh data with cache bypass after update
      await fetchTheaters(true);
      
    } catch (error) {

      // Show error toast
      showError(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  // Handle search
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Error state
  if (error) {
    return (
      <AdminLayout pageTitle="Active Theater List" currentPage="theater-users">
        <div className="error-container theater-users-page">
          <h3>Error Loading Data</h3>
          <p>{error}</p>
          <button onClick={fetchTheaters} className="retry-btn">
            Try Again
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Active Theater List" currentPage="theater-users">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Active Theater List"
              showBackButton={false}
            />
            
            {/* Statistics Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{totalItems || 0}</div>
                <div className="stat-label">Total Active Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{Array.isArray(theaters) ? theaters.filter(theater => theater && theater.isActive).length : 0}</div>
                <div className="stat-label">Currently Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{Array.isArray(theaters) ? theaters.filter(theater => theater && theater.contact).length : 0}</div>
                <div className="stat-label">With Contact Info</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{Array.isArray(theaters) ? theaters.length : 0}</div>
                <div className="stat-label">Displayed on Page</div>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search theaters by name, city, or owner..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <div className="filter-controls">
                <div className="results-count">
                  Showing {Array.isArray(sortedTheaters) ? sortedTheaters.length : 0} of {totalItems || 0} theaters (Page {currentPage || 1} of {totalPages || 1})
                </div>
                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select value={itemsPerPage} onChange={handleItemsPerPageChange} className="items-select">
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Theater Table Container */}
            <div className="page-table-container">
              {sortedTheaters.length === 0 && !loading ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg svg-icon-gray">
                      <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1V3H9V1L3 7V9H1V11H3V19C3 20.1 3.9 21 5 21H11V19H5V11H3V9H21M16 12C14.9 12 14 12.9 14 14S14.9 16 16 16 18 15.1 18 14 17.1 12 16 12M24 20V18H18V20C18 21.1 18.9 22 20 22H22C23.1 22 24 21.1 24 20Z"/>
                    </svg>
                  </div>
                  <h3>No Active Theaters Found</h3>
                  <p>No active theaters are currently available in the system.</p>
                  {debouncedSearchTerm && (
                    <p className="search-hint">
                      Try adjusting your search terms or <button type="button" onClick={() => setSearchTerm('')} className="clear-search-btn">clear the search</button>.
                    </p>
                  )}
                </div>
              ) : (
                <div className="theater-table-container">
                  <table className="theater-table">
                    <thead>
                      <tr>
                        <th className="sno-col">S NO</th>
                        <th className="photo-col">LOGO</th>
                        <th className="name-col">THEATER NAME</th>
                        <th className="owner-col">OWNER NAME</th>
                        <th className="contact-col">CONTACT NUMBER</th>
                        <th className="actions-col">ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        // Loading skeleton (exact copy from Role Access Management)
                        Array.from({ length: itemsPerPage }, (_, index) => (
                          <TableSkeletonRow key={index} />
                        ))
                      ) : (
                        // Theater rows (EXACT copy from Role Access Management structure)
                        sortedTheaters.map((theater, index) => {
                          // Copy the exact data extraction from Role Access Management
                          const theaterName = String(theater.name || 'Unnamed Theater');
                          const theaterCity = String(theater.location?.city || '');
                          const theaterState = String(theater.location?.state || '');
                          // Fixed: Use ownerDetails.name like in TheaterList
                          const theaterOwner = theater.ownerDetails?.name || 'Not specified';
                          // Fixed: Use ownerDetails.contactNumber like in TheaterList
                          const theaterPhone = theater.ownerDetails?.contactNumber || 'Not provided';
                          
                          return (
                            <tr key={theater._id} className="theater-row">
                              <td className="sno-cell">
                                <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
                              </td>
                              
                              <td className="photo-cell">
                                {/* Fixed: Use branding.logoUrl like in TheaterList (not media.logoUrl) */}
                                {(theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl) ? (
                                  <img
                                    src={theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl}
                                    alt={theater.name}
                                    className="theater-logo"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div className="no-logo" style={{display: (theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl) ? 'none' : 'flex'}}>
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md svg-icon-purple">
                                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
                                  </svg>
                                </div>
                              </td>
                              
                              <td className="name-cell">
                                <div className="theater-name-container">
                                  <div className="theater-name">
                                    {theaterName}
                                  </div>
                                  <div className="theater-location">
                                    {/* Fixed: Check both address and city for better location display */}
                                    {(theater.location?.address || theater.location?.city) ? `${theaterCity}, ${theaterState}` : 'Location not specified'}
                                  </div>
                                </div>
                              </td>
                              
                              <td className="owner-cell">
                                {theaterOwner}
                              </td>
                              
                              <td className="contact-cell">
                                {theaterPhone}
                              </td>
                              
                              <td className="actions-cell">
                                <div className="action-buttons">
                                  <ActionButton 
                                    type="view"
                                    onClick={() => handleViewClick(theater)}
                                    title="View Theater Details"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && (
                <Pagination 
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  itemType="theaters"
                />
              )}
            </div>
          </PageContainer>
        </div>

        {/* Edit Password Modal */}
        {editModal.show && (
          <div className="modal-overlay" onClick={() => setEditModal({ show: false, theater: null })}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-nav-left">
                  {/* Empty div for consistent layout */}
                </div>
                
                <div className="modal-title-section">
                  <h2>Edit Theater Password</h2>
                  <span className="theater-counter">
                    {editModal.theater?.name}
                  </span>
                </div>
                
                <div className="modal-nav-right">
                  <button 
                    className="close-btn"
                    onClick={() => setEditModal({ show: false, theater: null })}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <form onSubmit={handlePasswordUpdate}>
                <div className="modal-body">
                  <div className="edit-form">
                    <div className="theater-info-section">
                      <div className="detail-row">
                        <strong>Theater Name:</strong>
                        <span>{editModal.theater?.name}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Email:</strong>
                        <span>{editModal.theater?.contact?.email}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Current Password:</strong>
                        <span className="current-password">{editModal.theater?.password || '••••••••'}</span>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label>New Password *</label>
                      <div className="password-input-container">
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          value={editFormData.password}
                          onChange={handleInputChange}
                          className="form-control password-input"
                          required
                          minLength="6"
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="eye-icon">
                              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="eye-icon">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label>Confirm New Password *</label>
                      <div className="password-input-container">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          name="confirmPassword"
                          value={editFormData.confirmPassword}
                          onChange={handleInputChange}
                          className="form-control password-input"
                          required
                          minLength="6"
                          placeholder="Confirm new password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="eye-icon">
                              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="eye-icon">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
              
              {/* Fixed Footer with Cancel and Submit Buttons */}
              <div className="modal-actions">
                <button 
                  type="button" 
                  onClick={() => setEditModal({ show: false, theater: null })}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Confirmation Modal */}
        {confirmModal.show && (
          <div className="modal-overlay" onClick={() => setConfirmModal({ show: false, type: '', message: '', onConfirm: null })}>
            <div className={`confirmation-modal ${confirmModal.type}`} onClick={(e) => e.stopPropagation()}>
              <div className="confirmation-header">
                <div className="confirmation-icon">
                  {confirmModal.type === 'success' && (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="success-icon">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  )}
                  {confirmModal.type === 'error' && (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="error-icon">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                  )}
                  {confirmModal.type === 'confirm' && (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="confirm-icon">
                      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                    </svg>
                  )}
                </div>
                <h3>
                  {confirmModal.type === 'success' && 'Success'}
                  {confirmModal.type === 'error' && 'Error'}
                  {confirmModal.type === 'confirm' && 'Confirm Action'}
                </h3>
              </div>
              
              <div className="confirmation-body">
                <p>{confirmModal.message}</p>
              </div>
              
              <div className="confirmation-actions">
                {confirmModal.type === 'confirm' ? (
                  <>
                    <button 
                      onClick={() => setConfirmModal({ show: false, type: '', message: '', onConfirm: null })}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={confirmModal.onConfirm}
                      className="btn-primary confirm-btn"
                    >
                      Confirm
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={confirmModal.onConfirm}
                    className="btn-primary"
                  >
                    OK
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <style>{`
          /* Theater Name Layout Fix */
          .theater-name-container {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .theater-name {
            font-weight: 600;
            color: #1f2937;
            font-size: 14px;
            line-height: 1.3;
          }

          .theater-owner {
            font-size: 12px;
            color: #6b7280;
            font-style: italic;
          }

          /* Global Modal Design System */
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1001 !important;
          }

          .modal-content {
            background: var(--white);
            border-radius: 12px;
            max-width: 900px !important; /* Match TheaterList global width */
            width: 85% !important;
            max-height: 90vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
            position: relative;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 32px;
            border-bottom: 1px solid var(--border-color);
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
            color: var(--white);
            border-radius: 12px 12px 0 0;
            box-shadow: 0 2px 10px var(--shadow-light);
            flex-shrink: 0; /* Prevent shrinking */
          }

          .modal-nav-left,
          .modal-nav-right {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .modal-title-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
          }

          .modal-title-section h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }

          .theater-counter {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
            font-weight: 500;
            letter-spacing: 0.3px;
          }

          .close-btn {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            cursor: pointer;
            width: 44px;
            height: 44px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
          }

          .close-btn:hover {
            background: rgba(239, 68, 68, 0.25);
            border-color: rgba(239, 68, 68, 0.5);
            color: #fecaca;
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(239, 68, 68, 0.2);
          }

          .modal-body {
            padding: 24px 32px;
            overflow-y: auto;
            flex: 1;
            min-height: 0;
          }

          /* Theater Info Section for Edit Modal */
          .theater-info-section {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 20px;
          }

          .theater-info-section .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid #f1f5f9;
          }

          .theater-info-section .detail-row:last-child {
            border-bottom: none;
          }

          /* Edit Form Container */
          .edit-form {
            display: flex;
            flex-direction: column;
            gap: 0;
          }

          .current-password {
            font-family: monospace;
            font-size: 16px;
            color: #6b7280;
            letter-spacing: 2px;
          }

          /* Form Styling */
          .edit-form .form-group {
            margin-bottom: 16px;
          }

          .edit-form .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            color: #374151;
            font-size: 14px;
          }

          /* Password Input Container */
          .password-input-container {
            position: relative;
            display: flex;
            align-items: center;
          }

          .password-input {
            padding-right: 50px !important;
          }

          .password-toggle-btn {
            position: absolute;
            right: 12px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            color: #6b7280;
            transition: color 0.3s ease;
            z-index: 2;
          }

          .password-toggle-btn:hover {
            color: #374151;
          }

          .eye-icon {
            width: 20px;
            height: 20px;
          }

          .form-control {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.3s ease;
          }

          .form-control:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(107, 14, 155, 0.1);
          }

          /* View Details */
          .view-details .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 12px 0;
            border-bottom: 1px solid #f3f4f6;
          }

          .view-details .detail-row:last-child {
            border-bottom: none;
          }

          .view-details .detail-row strong {
            font-weight: 600;
            color: #374151;
            min-width: 140px;
            flex-shrink: 0;
          }

          .view-details .detail-row span {
            color: #6b7280;
            text-align: right;
            word-break: break-word;
          }

          .status-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .status-badge.active {
            background: #d1fae5;
            color: #065f46;
          }

          .status-badge.inactive {
            background: #fee2e2;
            color: #dc2626;
          }

          .logo-preview {
            margin-top: 8px;
          }

          .modal-logo {
            max-width: 100px;
            max-height: 60px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 24px 32px;
            border-top: 1px solid #e5e7eb;
            background: #f9fafb;
          }

          /* Global Modal Actions */
          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 16px;
            padding: 20px 32px;
            border-top: 1px solid #e5e7eb;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            flex-shrink: 0;
            border-radius: 0 0 12px 12px;
          }

          /* Global Button Styles */
          .cancel-btn {
            background: #f3f4f6;
            color: #374151;
            border: 2px solid #d1d5db;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .cancel-btn:hover {
            background: #e5e7eb;
            border-color: #9ca3af;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }

          .btn-primary {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
            color: white;
            border: 2px solid var(--primary-color);
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .btn-primary:hover {
            background: linear-gradient(135deg, var(--primary-dark) 0%, #4A0A6F 100%);
            border-color: var(--primary-dark);
            transform: translateY(-1px);
            box-shadow: 0 4px 20px var(--shadow-primary);
          }

          .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }

          /* Confirmation Modal */
          .confirmation-modal {
            background: var(--white);
            border-radius: 16px;
            max-width: 450px;
            width: 90%;
            overflow: hidden;
            box-shadow: 0 25px 75px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            transform: scale(0.9);
            animation: modalAppear 0.3s ease forwards;
          }

          @keyframes modalAppear {
            to {
              transform: scale(1);
            }
          }

          .confirmation-header {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 24px 32px;
            border-bottom: 1px solid #e5e7eb;
          }

          .confirmation-modal.success .confirmation-header {
            background: linear-gradient(135deg, var(--success-color) 0%, #059669 100%);
            color: white;
          }

          .confirmation-modal.error .confirmation-header {
            background: linear-gradient(135deg, var(--error-color) 0%, #dc2626 100%);
            color: white;
          }

          .confirmation-modal.confirm .confirmation-header {
            background: linear-gradient(135deg, var(--warning-color) 0%, #d97706 100%);
            color: white;
          }

          .confirmation-icon {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
          }

          .confirmation-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
          }

          .confirmation-body {
            padding: 24px 32px;
          }

          .confirmation-body p {
            margin: 0;
            color: #374151;
            font-size: 16px;
            line-height: 1.6;
          }

          .confirmation-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 20px 32px;
            border-top: 1px solid #e5e7eb;
            background: #f9fafb;
          }

          .confirm-btn {
            background: linear-gradient(135deg, var(--warning-color) 0%, #d97706 100%);
            border-color: var(--warning-color);
          }

          .confirm-btn:hover {
            background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
            border-color: #d97706;
            box-shadow: 0 4px 20px rgba(245, 158, 11, 0.4);
          }

          /* Global CSS Variables */
          :root {
            --primary-color: #6B0E9B;
            --primary-dark: #5A0C82;
            --primary-light: #8B4FB3;
            --success-color: #10B981;
            --warning-color: #F59E0B;
            --error-color: #EF4444;
            --white: #ffffff;
            --border-color: #e5e7eb;
            --shadow-light: rgba(107, 14, 155, 0.15);
            --shadow-primary: rgba(107, 14, 155, 0.3);
          }

          /* Responsive Design for Edit Modal */
          @media (max-height: 700px) {
            .modal-content {
              max-height: 95vh;
            }
            .modal-body {
              padding: 16px 32px;
            }
            .modal-actions {
              padding: 16px 32px;
            }
            .theater-info-section {
              padding: 12px;
              margin-bottom: 16px;
            }
          }

          @media (max-width: 768px) {
            .modal-content {
              width: 95% !important;
              max-width: none !important;
            }
            .modal-header {
              padding: 20px 24px;
            }
            .modal-body {
              padding: 20px 24px;
            }
            .modal-actions {
              padding: 16px 24px;
              gap: 12px;
            }
          }
        `}</style>
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default TheaterUserManagement;