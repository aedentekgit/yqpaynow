import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData } from '../utils/cacheUtils';
import config from '../config';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/RoleManagementList.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';


// Lazy Loading Image Component
const LazyImage = React.memo(({ src, alt, className, style, fallback = '/placeholder-theater.png' }) => {
  const [imageSrc, setImageSrc] = useState(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && src && src !== fallback) {
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
  }, [src, fallback]);

  return (
    <div className="lazy-image-container" style={style}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
        style={style}
      />
      {isLoading && <div className="image-loading-spinner"></div>}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

// Skeleton components for loading state
const TableSkeleton = ({ count = 10 }) => (
  <tbody>
    {Array.from({ length: count }, (_, index) => (
      <TableSkeletonRow key={`skeleton-${index}`} />
    ))}
  </tbody>
);

const TableSkeletonRow = React.memo(() => (
  <tr className="theater-row skeleton-row">
    <td className="sno-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="photo-cell">
      <div className="theater-photo-thumb skeleton-image"></div>
    </td>
    <td className="name-cell">
      <div className="skeleton-line skeleton-medium"></div>
    </td>
    <td className="owner-cell">
      <div className="skeleton-line skeleton-medium"></div>
    </td>
    <td className="contact-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="actions-cell">
      <div className="skeleton-buttons">
        <div className="skeleton-button skeleton-small"></div>
      </div>
    </td>
  </tr>
));

TableSkeletonRow.displayName = 'TableSkeletonRow';

const RoleManagementList = () => {
  const navigate = useNavigate();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('RoleManagementList');
  
  // Cache key helper
  const getCacheKey = (page, limit, search) => 
    `theaters_role_management_page_${page}_limit_${limit}_search_${search || 'none'}_active`;
  
  // 🚀 OPTIMIZED: Check cache synchronously on mount for instant loading
      const initialCacheKey = getCacheKey(1, 10, '');
      const initialCache = typeof window !== 'undefined' 
        ? getCachedData(initialCacheKey, 300000) // 5-minute cache
        : null;
  const initialTheaters = (initialCache && initialCache.success) 
    ? (initialCache.data || []) 
    : [];
  const initialPagination = (initialCache && initialCache.pagination) 
    ? initialCache.pagination 
    : { totalPages: 0, totalItems: 0 };
  
  // State management (exactly like TheaterUserManagement)
  const [theaters, setTheaters] = useState(initialTheaters);
  const [loading, setLoading] = useState(initialTheaters.length === 0); // Only show loading if no cache
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages || 0);
  const [totalItems, setTotalItems] = useState(initialPagination.totalItems || 0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Modal state
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    type: '',
    message: '',
    onConfirm: null
  });
  
  // Performance refs
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const hasInitialCache = useRef(initialTheaters.length > 0); // Track if we had cache on mount

  // ✅ FIX: Filter and sort theaters - add client-side filtering as fallback
  const sortedTheaters = useMemo(() => {
    let filtered = [...theaters];
    
    // ✅ FIX: Client-side filtering as fallback if backend search doesn't work
    // This ensures search works even if backend doesn't filter properly
    if (debouncedSearchTerm.trim()) {
      const searchLower = debouncedSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(theater => {
        if (!theater) return false;
        
        // Search in theater name
        const name = String(theater.name || '').toLowerCase();
        // Search in city/state
        const city = String(theater.location?.city || '').toLowerCase();
        const state = String(theater.location?.state || '').toLowerCase();
        const address = String(theater.location?.address || '').toLowerCase();
        // Search in owner name
        const owner = String(theater.ownerDetails?.name || '').toLowerCase();
        // Search in contact number
        const contact = String(theater.ownerDetails?.contactNumber || '').toLowerCase();
        
        return name.includes(searchLower) || 
               city.includes(searchLower) || 
               state.includes(searchLower) ||
               address.includes(searchLower) ||
               owner.includes(searchLower) ||
               contact.includes(searchLower);
      });
    }
    
    // Sort by MongoDB ObjectId in ascending order (chronological creation order)
    return filtered.sort((a, b) => {
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [theaters, debouncedSearchTerm]);

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

  // Fetch theaters function - OPTIMIZED: optimizedFetch handles cache automatically
  // 🔄 FORCE REFRESH: Added forceRefresh parameter to bypass all caches
  const fetchTheaters = useCallback(async (forceRefresh = false) => {
    try {
      // 🚀 PERFORMANCE: Only set loading if we didn't have initial cache
      if (!hasInitialCache.current) {
        setLoading(true);
      }
      setError('');
      
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Build query parameters for active theaters only
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        isActive: 'true' // Only fetch active theaters
      });

      // Add search parameter if provided
      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }
      
      // 🔄 FORCE REFRESH: Add cache-busting timestamp when forceRefresh is true
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }
      
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
      
      // �🚀 PERFORMANCE: Use optimizedFetch - it handles cache automatically
      // If cache exists, this returns instantly (< 50ms), otherwise fetches from API
      const cacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm);
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters?${params.toString()}`,
        {
          signal: abortControllerRef.current.signal,
          headers
        },
        forceRefresh ? null : cacheKey, // 🔄 FORCE REFRESH: Skip cache key when forceRefresh is true
        300000 // 5-minute cache
      );
      
      if (!result) {
        throw new Error('Failed to fetch theaters for role management');
      }
      
      if (result.success) {
        // Update state with active theaters only
        const activeTheaters = result.data || [];
        setTheaters(activeTheaters);
        
        // Update pagination
        const paginationData = result.pagination || {};
        setTotalPages(paginationData.totalPages || 0);
        setTotalItems(paginationData.totalItems || 0);
      } else {
        throw new Error(result.message || 'Failed to fetch theaters for role management');
      }
      
    } catch (error) {
      // Handle AbortError gracefully
      if (error.name === 'AbortError') {

        return;
      }

      setError('Failed to load theaters for role management');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm]);

  useEffect(() => {
    // ✅ FIX: Fetch theaters when search term changes or component mounts
    // Only force refresh on mount, not on every search change (to avoid unnecessary API calls)
    const isInitialMount = debouncedSearchTerm === '' && currentPage === 1;
    fetchTheaters(isInitialMount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, debouncedSearchTerm]); // fetchTheaters is stable (useCallback with same deps)

  // Handle view theater role management - navigate to role management page for specific theater
  const handleRoleManagementClick = (theater) => {
    navigate(`/roles/${theater._id}`);
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
      <AdminLayout pageTitle="Role Management" currentPage="roles">
        <div className="error-container">
          <h2>Error</h2>
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
      <AdminLayout pageTitle="Role Management" currentPage="roles">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Role Management"
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
                <div className="stat-number">{Array.isArray(theaters) ? theaters.filter(theater => theater && (theater.contactInfo || theater.contact)).length : 0}</div>
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
                  <h3>No Theaters Found</h3>
                  <p>There are no theaters available for role management at the moment.</p>
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
                    {loading ? (
                      <TableSkeleton count={itemsPerPage} />
                    ) : (
                      <tbody>
                        {Array.isArray(sortedTheaters) && sortedTheaters.length > 0 ? sortedTheaters.map((theater, index) => {
                          if (!theater || !theater._id) return null;
                          
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
                                    {/* Fixed: Check both address and city for location display */}
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
                                <ActionButtons>
                                  <ActionButton 
                                    type="view"
                                    onClick={() => handleRoleManagementClick(theater)}
                                    title="Manage Roles for this Theater"
                                  />
                                </ActionButtons>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan="6" className="table-empty-center">
                              Loading theaters...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    )}
                  </table>
                </div>
              )}

              {/* Pagination - Global Component */}
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
                
                <h3>{confirmModal.type === 'success' ? 'Success' : confirmModal.type === 'error' ? 'Error' : 'Confirm Action'}</h3>
              </div>
              
              <div className="confirmation-body">
                <p>{confirmModal.message}</p>
              </div>
              
              <div className="confirmation-actions">
                <button 
                  className="btn-secondary" 
                  onClick={() => setConfirmModal({ show: false, type: '', message: '', onConfirm: null })}
                >
                  {confirmModal.type === 'confirm' ? 'Cancel' : 'Close'}
                </button>
                
                {confirmModal.type === 'confirm' && confirmModal.onConfirm && (
                  <button 
                    className="btn-primary" 
                    onClick={confirmModal.onConfirm}
                  >
                    Confirm
                  </button>
                )}
              </div>
            </div>
          </div>
        )}


      </AdminLayout>

      {/* Custom CSS for modal width - matches TheaterList */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .confirmation-modal {
            max-width: 900px !important;
            width: 85% !important;
          }

          @media (max-width: 768px) {
            .confirmation-modal {
              width: 95% !important;
              max-width: none !important;
            }
          }
        `
      }} />
    </ErrorBoundary>
  );
};

export default RoleManagementList;