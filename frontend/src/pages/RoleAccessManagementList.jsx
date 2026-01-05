import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import ActionButton from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { useToast } from '../contexts/ToastContext';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData } from '../utils/cacheUtils';
import config from '../config';
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/RoleAccessManagementList.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';


// Table Row Skeleton for loading state
const TableRowSkeleton = () => (
  <tr className="theater-row skeleton">
    <td className="sno-cell"><div className="skeleton-text short"></div></td>
    <td className="photo-cell"><div className="theater-photo-thumb skeleton-image"></div></td>
    <td className="name-cell"><div className="skeleton-text medium"></div></td>
    <td className="owner-cell"><div className="skeleton-text medium"></div></td>
    <td className="contact-cell"><div className="skeleton-text medium"></div></td>
    <td className="actions-cell"><div className="skeleton-buttons"><div className="skeleton-button skeleton-small"></div></div></td>
  </tr>
);

// Define TableRowSkeleton.displayName for debugging
TableRowSkeleton.displayName = 'TableRowSkeleton';

const RoleAccessManagementList = () => {
  const navigate = useNavigate();
  const toast = useToast();
  
  // PERFORMANCE MONITORING: Track component performance
  usePerformanceMonitoring('RoleAccessManagementList');

  // Cache key helper
  const getCacheKey = (page, limit, search) => 
    `theaters_role_access_page_${page}_limit_${limit}_search_${search || 'none'}_active`;
  
  // 🚀 OPTIMIZED: Check cache synchronously on mount for instant loading (< 2ms)
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
  
  // Data state
  const [theaters, setTheaters] = useState(initialTheaters);
  const [loading, setLoading] = useState(initialTheaters.length === 0); // Only show loading if no cache
  const [error, setError] = useState('');
  
  // Pagination state (matching TheaterList)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages || 0);
  const [totalItems, setTotalItems] = useState(initialPagination.totalItems || 0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pagination, setPagination] = useState({});

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Refs for performance optimization
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const hasInitialCache = useRef(initialTheaters.length > 0); // Track if we had cache on mount

  // ✅ FIX: Filter and sort theaters - add client-side filtering as fallback
  const sortedTheaters = useMemo(() => {
    if (!Array.isArray(theaters) || theaters.length === 0) return [];
    
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

  // 🚀 PERFORMANCE: Memoize statistics calculations to prevent unnecessary recalculations
  const statistics = useMemo(() => {
    if (!Array.isArray(theaters)) return { total: 0, active: 0, withContact: 0, displayed: 0 };
    return {
      total: totalItems || 0,
      active: theaters.filter(theater => theater && theater.isActive).length,
      withContact: theaters.filter(theater => theater && theater.contact).length,
      displayed: theaters.length
    };
  }, [theaters, totalItems]);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch theaters data with pagination and search - OPTIMIZED: optimizedFetch handles cache automatically
  // 🔄 FORCE REFRESH: Added forceRefresh parameter to bypass all caches
  const fetchTheaters = useCallback(async (forceRefresh = false) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 🚀 PERFORMANCE: Only set loading if we didn't have initial cache
      if (!hasInitialCache.current) {
        setLoading(true);
      }
      setError('');
      
      // Build query parameters with pagination and search
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        isActive: 'true' // Only fetch active theaters
      });
      
      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }
      
      // 🔄 FORCE REFRESH: Add cache-busting timestamp when forceRefresh is true
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }
      
      // 🔄 FORCE REFRESH: Add no-cache headers when forceRefresh is true
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Accept': 'application/json'
      };
      
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // 🚀 PERFORMANCE: Use optimizedFetch - it handles cache automatically
      // If cache exists, this returns instantly (< 2ms), otherwise fetches from API
      const cacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm);
      const data = await optimizedFetch(
        `${config.api.baseUrl}/theaters?${params.toString()}`,
        {
          signal: abortController.signal,
          headers
        },
        forceRefresh ? null : cacheKey, // 🔄 FORCE REFRESH: Skip cache key when forceRefresh is true
        300000 // 5-minute cache for faster subsequent loads
      );
      
      if (!data) {
        throw new Error('Failed to fetch theaters for role access management');
      }

      if (data.success) {
        // PERFORMANCE OPTIMIZATION: Direct state updates
        const theaterData = data.data || [];
        setTheaters(theaterData);
        
        // Handle pagination data
        const paginationData = data.pagination || {};
        setPagination(paginationData);
        setTotalPages(paginationData.totalPages || 0);
        setTotalItems(paginationData.totalItems || 0);
      } else {
        throw new Error(data.message || 'Failed to fetch theaters for role access management');
      }
    } catch (error) {
      // Handle AbortError gracefully
      if (error.name === 'AbortError') {
        return;
      }

      setError('Failed to load theaters for role access management');
      setTheaters([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm]);

  // Effect to trigger data fetching when dependencies change
  // ✅ FIX: Fetch theaters when search term changes or component mounts
  // Only force refresh on mount, not on every search change (to avoid unnecessary API calls)
  useEffect(() => {
    const isInitialMount = debouncedSearchTerm === '' && currentPage === 1;
    const shouldForceRefresh = isInitialMount && !hasInitialCache.current;
    fetchTheaters(shouldForceRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, debouncedSearchTerm]); // fetchTheaters is stable (useCallback with same deps)

  // Handle view theater role access management - navigate to role access management page for specific theater
  const handleRoleAccessManagementClick = (theater) => {
    navigate(`/role-access/${theater._id}`);
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
      <AdminLayout pageTitle="Role Access Management" currentPage="role-access">
        <div className="error-container">
          <div className="error-message">
            <h2>Error Loading Theaters</h2>
            <p>{error}</p>
            <button className="retry-btn" onClick={fetchTheaters}>
              Try Again
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Main component render
  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Role Access Management" currentPage="role-access">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Role Access Management"
              showBackButton={false}
            />
            
            {/* Stats Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{statistics.total}</div>
                <div className="stat-label">Total Active Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{statistics.active}</div>
                <div className="stat-label">Currently Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{statistics.withContact}</div>
                <div className="stat-label">With Contact Info</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{statistics.displayed}</div>
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
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg svg-icon-gray">
                      <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1V3H9V1L3 7V9H1V11H3V19C3 20.1 3.9 21 5 21H11V19H5V11H3V9H21M16 12C14.9 12 14 12.9 14 14S14.9 16 16 16 18 15.1 18 14 17.1 12 16 12M24 20V18H18V20C18 21.1 18.9 22 20 22H22C23.1 22 24 21.1 24 20Z"/>
                    </svg>
                  </div>
                  <h3>No Theaters Found</h3>
                  <p>There are no theaters available for role access management at the moment.</p>
                  {debouncedSearchTerm && (
                    <p className="search-hint">
                      Try adjusting your search terms or <button type="button" onClick={() => setSearchTerm('')} className="clear-search-btn">clear the search</button>.
                    </p>
                  )}
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
                    <tbody>
                      {loading ? (
                        // Loading skeleton (exact copy from Role Management)
                        Array.from({ length: itemsPerPage }, (_, index) => (
                          <TableRowSkeleton key={index} />
                        ))
                      ) : (
                        // Theater rows (EXACT copy from Role Management structure)
                        sortedTheaters.map((theater, index) => {
                          // Copy the exact data extraction from QR Names (corrected structure)
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
                                    onClick={() => handleRoleAccessManagementClick(theater)}
                                    title="Manage Role Access for this Theater"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
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

export default RoleAccessManagementList;
