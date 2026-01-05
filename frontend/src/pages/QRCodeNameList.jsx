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
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/QRCodeNameList.css'; // Extracted inline styles

// ==================== COMPONENTS ====================
const TableSkeleton = ({ count = 10 }) => (
  <tbody>
    {Array.from({ length: count }, (_, index) => (
      <tr key={`skeleton-${index}`} className="theater-row skeleton-row">
        <td><div className="skeleton-line skeleton-small"></div></td>
        <td><div className="theater-photo-thumb skeleton-image"></div></td>
        <td><div className="skeleton-line skeleton-medium"></div></td>
        <td><div className="skeleton-line skeleton-medium"></div></td>
        <td><div className="skeleton-line skeleton-small"></div></td>
        <td><div className="skeleton-button skeleton-small"></div></td>
      </tr>
    ))}
  </tbody>
);

// ==================== MAIN COMPONENT ====================
const QRCodeNameList = () => {
  const navigate = useNavigate();
  usePerformanceMonitoring('QRCodeNameList');

  // ==================== CACHE HELPERS ====================
  const getCacheKey = (page, limit, search) => 
    `theaters_qr_names_page_${page}_limit_${limit}_search_${search || 'none'}_active`;

  // Load initial cache - check both direct data and success.data structure
  const initialCache = typeof window !== 'undefined' 
    ? getCachedData(getCacheKey(1, 10, ''), 300000)
    : null;

  // Extract data from cache (handles both {data: []} and {success: true, data: []} structures)
  const initialTheaters = (initialCache?.success && initialCache?.data) || initialCache?.data || [];
  const initialPagination = initialCache?.pagination || { totalPages: 0, totalItems: 0 };

  // ==================== STATE ====================
  const [theaters, setTheaters] = useState(initialTheaters);
  const [loading, setLoading] = useState(!initialTheaters.length);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages || 0);
  const [totalItems, setTotalItems] = useState(initialPagination.totalItems || 0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // ==================== REFS ====================
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isInitialMountRef = useRef(true);

  // ==================== COMPUTED VALUES ====================
  const sortedTheaters = useMemo(() => {
    return [...theaters].sort((a, b) => (a._id || '').localeCompare(b._id || ''));
  }, [theaters]);

  const stats = useMemo(() => ({
    total: totalItems || 0,
    active: theaters.filter(t => t?.isActive).length,
    withContact: theaters.filter(t => t?.contact || t?.owner).length,
    displayed: theaters.length
  }), [theaters, totalItems]);

  // ==================== API FETCH ====================
  const hasInitialCache = useRef(!!initialTheaters.length);
  
  const fetchTheaters = useCallback(async (forceRefresh = false) => {
    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Set loading only if no cache
      if (!hasInitialCache.current && !forceRefresh) {
        setLoading(true);
      }
      setError('');

      // Build params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        isActive: 'true',
        ...(debouncedSearchTerm && { q: debouncedSearchTerm })
      });

      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // Build headers
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Accept': 'application/json',
        ...(forceRefresh && {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        })
      };

      // Fetch data
      const cacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm);
      const data = await optimizedFetch(
        `${config.api.baseUrl}/theaters?${params.toString()}`,
        { signal: abortControllerRef.current.signal, headers },
        forceRefresh ? null : cacheKey,
        forceRefresh ? 0 : 300000
      );

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to fetch theaters');
      }

      // Update state
      setTheaters(data.data || []);
      setTotalPages(data.pagination?.totalPages || 0);
      setTotalItems(data.pagination?.totalItems || 0);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error loading theaters:', error);
        setError('Failed to load theaters. Please try again.');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm]);

  // ==================== EFFECTS ====================
  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch data
  useEffect(() => {
    let refreshTimer = null;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // First load: use cache if available, then refresh
      if (hasInitialCache.current) {
        refreshTimer = setTimeout(() => fetchTheaters(true), 500);
      } else {
        fetchTheaters(false);
      }
    } else {
      // Subsequent loads: fetch with cache, then refresh
      fetchTheaters(false);
      refreshTimer = setTimeout(() => fetchTheaters(true), 300);
    }

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [debouncedSearchTerm, currentPage, itemsPerPage, fetchTheaters]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // ==================== HANDLERS ====================
  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  const handleItemsPerPageChange = (e) => {
    e.preventDefault();
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => setCurrentPage(newPage);

  const handleViewClick = (e, theater) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(`/qr-names/${theater._id}`);
  };

  // ==================== RENDER HELPERS ====================
  const renderTheaterRow = (theater, index) => {
    if (!theater?._id) return null;

    const logo = theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl;
    const location = theater.location?.city && theater.location?.state
      ? `${theater.location.city}, ${theater.location.state}`
      : 'Location not specified';

    return (
      <tr key={theater._id} className="theater-row">
        <td className="sno-cell">
          <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
        </td>
        <td className="photo-cell">
          {logo ? (
            <img
              src={logo}
              alt={theater.name}
              className="theater-logo"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div className="no-logo" style={{ display: logo ? 'none' : 'flex' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="no-logo-icon">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
            </svg>
          </div>
        </td>
        <td className="name-cell">
          <div className="theater-name-container">
            <div className="theater-name">{theater.name || 'Unnamed Theater'}</div>
            <div className="theater-location">{location}</div>
          </div>
        </td>
        <td className="owner-cell">{theater.ownerDetails?.name || 'Not specified'}</td>
        <td className="contact-cell">{theater.ownerDetails?.contactNumber || 'Not provided'}</td>
        <td className="actions-cell">
          <ActionButtons>
            <ActionButton
              type="view"
              onClick={(e) => handleViewClick(e, theater)}
              title="Manage QR Code Names for this Theater"
            />
          </ActionButtons>
        </td>
      </tr>
    );
  };

  // ==================== RENDER ====================
  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="QR Code Name Management" currentPage="qr-names">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="QR Code Name Management"
              showBackButton={false}
            />
            
            {/* Stats Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{stats.total}</div>
                <div className="stat-label">Total Active Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.active}</div>
                <div className="stat-label">Currently Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.withContact}</div>
                <div className="stat-label">With Contact Info</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.displayed}</div>
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
                    onKeyDown={handleSearchKeyDown}
                    className="search-input"
                  />
                </div>
                <div className="filter-controls">
                  <div className="results-count">
                    Showing {sortedTheaters.length} of {totalItems} theaters (Page {currentPage} of {totalPages || 1})
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
                  <svg viewBox="0 0 24 24" fill="currentColor" className="empty-state-icon">
                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
                  </svg>
                  <p>No Theaters Found</p>
                  <p>There are no theaters available for QR code name management at the moment.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/add-theater');
                    }}
                  >
                    CREATE YOUR FIRST THEATER
                  </button>
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
                      <TableSkeleton count={itemsPerPage} />
                    ) : (
                      <tbody>
                        {sortedTheaters.map(renderTheaterRow)}
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

export default QRCodeNameList;
