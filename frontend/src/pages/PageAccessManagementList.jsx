import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData } from '../utils/cacheUtils';
import config from '../config';
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/PageAccessManagementList.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';


// Skeleton components for loading state
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


const PageAccessManagementList = () => {
  const navigate = useNavigate();
  
  // Cache key helper
  const getCacheKey = (page, limit, search) => 
    `theaters_page_access_page_${page}_limit_${limit}_search_${search || 'none'}_active`;
  
  // 🚀 OPTIMIZED: Check cache synchronously on mount for instant loading
  const initialCacheKey = getCacheKey(1, 10, '');
  const initialCache = typeof window !== 'undefined' 
    ? getCachedData(initialCacheKey, 120000) 
    : null;
  const initialTheaters = (initialCache && initialCache.success) 
    ? (initialCache.data || []) 
    : [];
  const initialPagination = (initialCache && initialCache.pagination) 
    ? initialCache.pagination 
    : { totalPages: 0, totalItems: 0 };
  
  // State management
  const [theaters, setTheaters] = useState(initialTheaters);
  const [loading, setLoading] = useState(initialTheaters.length === 0); // Only show loading if no cache
  const [error, setError] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages || 0);
  const [totalItems, setTotalItems] = useState(initialPagination.totalItems || 0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Performance refs
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const hasInitialCache = useRef(initialTheaters.length > 0); // Track if we had cache on mount

  // Sort theaters by ID in ascending order
  const sortedTheaters = useMemo(() => {
    return [...theaters].sort((a, b) => {
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [theaters]);

  // Debounced search effect
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

  // Fetch theaters function - OPTIMIZED: optimizedFetch handles cache automatically
  const fetchTheaters = useCallback(async () => {
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
        isActive: 'true'
      });

      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }

      // 🚀 PERFORMANCE: Use optimizedFetch - it handles cache automatically
      // If cache exists, this returns instantly (< 50ms), otherwise fetches from API
      const cacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm);
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters?${params.toString()}`,
        {
        signal: abortControllerRef.current.signal,
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Accept': 'application/json'
        }
        },
        cacheKey,
        120000 // 2-minute cache
      );
      
      if (!result) {
        throw new Error('Failed to fetch theaters');
      }
      
      if (result.success) {
      const activeTheaters = result.data || [];
      setTheaters(activeTheaters);
      
      const paginationData = result.pagination || {};
      setTotalPages(paginationData.totalPages || 0);
      setTotalItems(paginationData.totalItems || 0);
      } else {
        throw new Error(result.message || 'Failed to fetch theaters');
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      
      // ✅ SINGLE SESSION: Check if session was invalidated
      if (error.code === 'SESSION_INVALIDATED' || error.status === 401) {
        // Session invalidated - logout will be handled by optimizedFetch
        // Just return, don't show error
        return;
      }
      
      setError('Failed to load theaters');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm]);

  useEffect(() => {
    fetchTheaters();
  }, [fetchTheaters]);

  // Handle navigate to page access for specific theater
  const handlePageAccessClick = (theater) => {
    navigate(`/page-access/${theater._id}`);
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
      <AdminLayout pageTitle="Page Access Management" currentPage="page-access">
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
      <AdminLayout pageTitle="Page Access Management" currentPage="page-access">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Page Access Management"
              showBackButton={false}
            />
            
            {/* Stats Section */}
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

            {/* Enhanced Filters Section */}
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

            {/* Management Table */}
            <div className="page-table-container">
              {sortedTheaters.length === 0 && !loading ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="empty-state-icon">
                      <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1V3H9V1L3 7V9H1V11H3V19C3 20.1 3.9 21 5 21H11V19H5V11H3V9H21M16 12C14.9 12 14 12.9 14 14S14.9 16 16 16 18 15.1 18 14 17.1 12 16 12M24 20V18H18V20C18 21.1 18.9 22 20 22H22C23.1 22 24 21.1 24 20Z"/>
                    </svg>
                  </div>
                  <h3>No Theaters Found</h3>
                  <p>There are no theaters available for page access management at the moment.</p>
                </div>
              ) : (
                <table className="qr-management-table">
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
                      <tbody>
                        {Array.from({ length: 5 }, (_, index) => (
                          <TableSkeletonRow key={`skeleton-${index}`} />
                        ))}
                      </tbody>
                    ) : (
                      <tbody>
                        {Array.isArray(sortedTheaters) && sortedTheaters.map((theater, index) => {
                          if (!theater || !theater._id) return null;
                          
                          const theaterName = String(theater.name || 'Unnamed Theater');
                          const theaterCity = String(theater.location?.city || '');
                          const theaterState = String(theater.location?.state || '');
                          // Fixed: Use ownerDetails.name like in RoleManagementList
                          const theaterOwner = theater.ownerDetails?.name || 'Not specified';
                          // Fixed: Use ownerDetails.contactNumber like in RoleManagementList
                          const theaterPhone = theater.ownerDetails?.contactNumber || 'Not provided';
                          
                          return (
                            <tr key={theater._id} className="theater-row">
                              <td className="sno-cell">
                                <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
                              </td>
                              
                              <td className="photo-cell">
                                {/* Fixed: Use branding.logoUrl like in RoleManagementList (not media.logoUrl) */}
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
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="no-logo-icon">
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
                                  onClick={() => handlePageAccessClick(theater)}
                                  title="Manage Page Access"
                                />
                              </ActionButtons>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    )}
                  </table>
              )}
            </div>

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
          </PageContainer>
        </div>
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default PageAccessManagementList;


