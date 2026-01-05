import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import Pagination from '../components/Pagination';
import { useToast } from '../contexts/ToastContext';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData, setCachedData, clearCache, clearCachePattern } from '../utils/cacheUtils';
import config from '../config';
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/QRManagement.css'; // Extracted inline styles

// ==================== COMPONENTS ====================
const TableSkeleton = ({ count = 10 }) => (
  <>
    {Array.from({ length: count }, (_, index) => (
      <tr key={`skeleton-${index}`} className="theater-row skeleton-row">
        <td><div className="skeleton-line skeleton-small"></div></td>
        <td><div className="theater-photo-thumb skeleton-image"></div></td>
        <td><div className="skeleton-line skeleton-medium"></div></td>
        <td><div className="skeleton-line skeleton-small"></div></td>
        <td><div className="skeleton-line skeleton-small"></div></td>
        <td><div className="skeleton-button skeleton-small"></div></td>
      </tr>
    ))}
  </>
);

// ==================== MAIN COMPONENT ====================
const QRManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  usePerformanceMonitoring('QRManagement');

  // ==================== CACHE HELPERS ====================
  const getCacheKey = (page, limit, search) => 
    `qr_management_theaters_page_${page}_limit_${limit}_search_${search || 'none'}`;

  // Load initial cache
  const initialCache = typeof window !== 'undefined' 
    ? getCachedData(getCacheKey(1, 10, ''), 300000)
    : null;

  const initialData = (initialCache?.success && initialCache?.data) || initialCache?.data || [];
  const initialPagination = initialCache?.pagination || { totalPages: 0, totalItems: 0 };
  const initialSummary = initialCache?.summary || {
    totalTheaters: 0,
    totalCanteenQRs: 0,
    totalScreenQRs: 0,
    totalQRs: 0
  };

  // ==================== STATE ====================
  const [managementData, setManagementData] = useState(initialData);
  // ✅ FIX: NEVER show loading if we have cache - this ensures instant display
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    // If we have initial data, never show loading
    return !initialData.length;
  });
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(initialSummary);
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
  const hasInitialCache = useRef(!!initialData.length);
  const hasLoadedOnceRef = useRef(!!initialData.length); // Track if we've loaded data at least once
  const isNavigatingBackRef = useRef(false); // Track if this is a navigation back

  // ==================== COMPUTED VALUES ====================
  // ✅ FIX: Filter and sort theaters - add client-side filtering as fallback
  const sortedManagementData = useMemo(() => {
    let filtered = [...managementData];
    
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
    return filtered.sort((a, b) => (a._id || '').localeCompare(b._id || ''));
  }, [managementData, debouncedSearchTerm]);

  // ==================== API FETCH ====================
  const fetchQRCounts = useCallback(async (theater, forceRefresh = false) => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const cacheKey = `qr_codes_theater_${theater._id}`;
      
      // Try to get cached counts first for instant display
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey, 300000);
        if (cached?.success && cached.data?.qrCodes) {
          const qrCodes = cached.data.qrCodes;
          const singleQRScreens = new Set();
          const screenQRScreens = new Set();

          qrCodes.forEach(qr => {
            const qrName = qr.name || qr.qrName;
            if (qrName) {
              if (qr.qrType === 'single') singleQRScreens.add(qrName);
              else if (qr.qrType === 'screen') screenQRScreens.add(qrName);
            }
          });

          return {
            canteenQRCount: singleQRScreens.size,
            screenQRCount: screenQRScreens.size,
            fromCache: true
          };
        }
      }

      // If force refresh, clear cache BEFORE fetching
      if (forceRefresh) {
        clearCache(cacheKey);
        // Also clear URL-based cache key
        const url = `${config.api.baseUrl}/single-qrcodes/theater/${theater._id}`;
        const urlBasedKey = `fetch_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
        clearCache(urlBasedKey);
      }
      
      // Fetch fresh data
      const url = `${config.api.baseUrl}/single-qrcodes/theater/${theater._id}`;
      const finalUrl = forceRefresh ? `${url}?_t=${Date.now()}` : url;
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      };
      
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      const qrData = await optimizedFetch(
        finalUrl,
        {
          headers,
          signal: abortControllerRef.current?.signal
        },
        forceRefresh ? null : cacheKey,
        forceRefresh ? 0 : 300000
      );

      if (qrData?.success && qrData.data?.qrCodes) {
        const qrCodes = qrData.data.qrCodes;
        const singleQRScreens = new Set();
        const screenQRScreens = new Set();

        qrCodes.forEach(qr => {
          const qrName = qr.name || qr.qrName;
          if (qrName) {
            if (qr.qrType === 'single') singleQRScreens.add(qrName);
            else if (qr.qrType === 'screen') screenQRScreens.add(qrName);
          }
        });

        return {
          canteenQRCount: singleQRScreens.size,
          screenQRCount: screenQRScreens.size,
          fromCache: false
        };
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn(`Failed to fetch QR codes for theater ${theater._id}:`, error);
      }
    }
    return { canteenQRCount: 0, screenQRCount: 0, fromCache: false };
  }, []);

  const loadManagementData = useCallback(async (forceRefresh = false) => {
    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // ✅ FIX: NEVER show loading if:
      // 1. We already have data displayed (hasLoadedOnceRef)
      // 2. This is a force refresh (background update)
      // 3. We're navigating back (isNavigatingBackRef)
      // Only show loading on first load with no cache
      if (!hasLoadedOnceRef.current && !forceRefresh && !isNavigatingBackRef.current) {
        setLoading(true);
      } else {
        // Ensure loading is off if we have data or this is a background refresh
        setLoading(false);
      }
      setError('');

      // Build params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        isActive: 'true',
        ...(debouncedSearchTerm && { search: debouncedSearchTerm.trim() })
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

      // Fetch theaters
      const cacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm);
      
      // If force refresh, clear cache BEFORE fetching
      if (forceRefresh) {
        clearCache(cacheKey);
        // Clear URL-based cache key that optimizedFetch might generate
        const urlBasedKey = `fetch_${`${config.api.baseUrl}/theaters?${params.toString()}`.replace(/[^a-zA-Z0-9]/g, '_')}`;
        clearCache(urlBasedKey);
        // Also clear any pattern-based caches
        clearCachePattern(`qr_management_theaters_page_${currentPage}`);
        clearCachePattern(`fetch_${config.api.baseUrl.replace(/[^a-zA-Z0-9]/g, '_')}_theaters`);
      }
      
      const data = await optimizedFetch(
        `${config.api.baseUrl}/theaters?${params.toString()}`,
        { signal: abortControllerRef.current.signal, headers },
        forceRefresh ? null : cacheKey, // Only use cache key if not force refresh
        300000
      );

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to fetch QR management data');
      }

      const theaters = data.data || [];

      // 🚀 PERFORMANCE: Load QR counts - skip cache if forceRefresh
      // Step 1: Load QR counts (use cache only if not forceRefresh)
      const theatersWithCachedCounts = await Promise.all(
        theaters.map(async (theater) => {
          const counts = await fetchQRCounts(theater, forceRefresh); // Force refresh if needed
          return { ...theater, ...counts };
        })
      );

      // Update UI immediately with cached counts
      const summaryCalcCached = theatersWithCachedCounts.reduce((acc, theater) => ({
        totalCanteenQRs: acc.totalCanteenQRs + (theater.canteenQRCount || 0),
        totalScreenQRs: acc.totalScreenQRs + (theater.screenQRCount || 0),
        totalQRs: acc.totalQRs + (theater.canteenQRCount || 0) + (theater.screenQRCount || 0)
      }), { totalCanteenQRs: 0, totalScreenQRs: 0, totalQRs: 0 });

      const newSummaryCached = {
        totalTheaters: theatersWithCachedCounts.length,
        ...summaryCalcCached
      };

      // Update state immediately with cached data
      setManagementData(theatersWithCachedCounts);
      setSummary(newSummaryCached);
      
      const paginationData = data.pagination || {};
      setTotalPages(paginationData.totalPages || 0);
      setTotalItems(paginationData.totalItems || 0);

      // ✅ FIX: Mark that we've loaded data (so we never show loading again on this page)
      hasLoadedOnceRef.current = true;
      setLoading(false); // Ensure loading is off after first load

      // Cache data
      setCachedData(cacheKey, {
        success: true,
        data: theatersWithCachedCounts,
        pagination: paginationData,
        summary: newSummaryCached
      });

      // Step 2: Fetch fresh QR counts in background only if we used cache
      // Skip if we already force-refreshed above
      const needsRefresh = !forceRefresh && theatersWithCachedCounts.some(t => t.fromCache);
      
      if (needsRefresh && !abortControllerRef.current?.signal.aborted) {
        // Fetch fresh counts in background without blocking UI
        Promise.all(
          theaters.map(async (theater) => {
            try {
              const counts = await fetchQRCounts(theater, true); // Force refresh
              return { theaterId: theater._id, ...counts };
            } catch (error) {
              if (error.name !== 'AbortError') {
                console.warn(`Background refresh failed for theater ${theater._id}:`, error);
              }
              return null;
            }
          })
        ).then(freshCounts => {
          // Only update if component is still mounted and not aborted
          if (!abortControllerRef.current?.signal.aborted) {
            // Update theaters with fresh counts
            const updatedTheaters = theaters.map(theater => {
              const freshCount = freshCounts.find(c => c && c.theaterId === theater._id);
              if (freshCount) {
                return {
                  ...theater,
                  canteenQRCount: freshCount.canteenQRCount || 0,
                  screenQRCount: freshCount.screenQRCount || 0
                };
              }
              return theater;
            });

            // Recalculate summary with fresh counts
            const summaryCalcFresh = updatedTheaters.reduce((acc, theater) => ({
              totalCanteenQRs: acc.totalCanteenQRs + (theater.canteenQRCount || 0),
              totalScreenQRs: acc.totalScreenQRs + (theater.screenQRCount || 0),
              totalQRs: acc.totalQRs + (theater.canteenQRCount || 0) + (theater.screenQRCount || 0)
            }), { totalCanteenQRs: 0, totalScreenQRs: 0, totalQRs: 0 });

            const newSummaryFresh = {
              totalTheaters: updatedTheaters.length,
              ...summaryCalcFresh
            };

            // Update state with fresh data
            setManagementData(updatedTheaters);
            setSummary(newSummaryFresh);

            // Update cache with fresh data
            setCachedData(cacheKey, {
              success: true,
              data: updatedTheaters,
              pagination: paginationData,
              summary: newSummaryFresh
            });
          }
        }).catch(error => {
          if (error.name !== 'AbortError') {
            console.warn('Background refresh error:', error);
          }
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error loading QR management data:', error);
        setError('Failed to load QR management data');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm, fetchQRCounts]);

  // ==================== EFFECTS ====================
  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Check for QR code modifications on mount/focus and clear cache if needed
  useEffect(() => {
    // Check if QR codes were modified (via localStorage flag set by QR detail pages)
    const qrModifiedKey = 'qr_codes_modified';
    const qrModified = localStorage.getItem(qrModifiedKey);
    
    if (qrModified || location.state?.qrCodesModified) {
      // Clear all QR-related caches immediately
      clearCachePattern('qr_management_theaters');
      clearCachePattern('qr_codes_theater_');
      clearCachePattern('single_qrcodes_theater_');
      
      // Also clear any optimizedFetch caches for theaters and QR codes
      const allKeys = Object.keys(sessionStorage);
      allKeys.forEach(key => {
        if (key.includes('qr_') || key.includes('theater_')) {
          sessionStorage.removeItem(key);
        }
      });
      
      // Clear the flag
      if (qrModified) localStorage.removeItem(qrModifiedKey);
      
      
      // Force immediate reload by updating a state that triggers refresh
      // Reset the loaded flag so fresh data is fetched
      hasLoadedOnceRef.current = false;
    }
  }, [location.state]);

  // Load data
  useEffect(() => {
    let refreshTimer = null;

    // Check if QR codes were modified - if so, skip cache and force immediate refresh
    const qrModifiedKey = 'qr_codes_modified';
    const qrModified = localStorage.getItem(qrModifiedKey);
    const fromQROperation = qrModified || location.state?.qrCodesModified;

    // ✅ FIX: Always check cache FIRST before doing anything (unless QR codes were modified)
    const currentCacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm);
    const cached = fromQROperation ? null : getCachedData(currentCacheKey, 300000); // Skip cache if modified
    const cachedData = (cached?.success && cached?.data) || cached?.data || [];
    
    // If QR codes were modified, force immediate refresh without showing cache
    if (fromQROperation) {
      // Clear cache flag if exists
      if (qrModified) localStorage.removeItem(qrModifiedKey);
      
      // Clear ALL caches before loading
      clearCachePattern('qr_management_theaters');
      clearCachePattern('qr_codes_theater_');
      clearCachePattern('single_qrcodes_theater_');
      
      // Clear current page cache specifically
      clearCache(currentCacheKey);
      
      // Reset loaded flag to ensure fresh fetch
      hasLoadedOnceRef.current = false;
      
      // Force immediate refresh - don't show cached data
      isNavigatingBackRef.current = false;
      
      // Load fresh data immediately (no delay, no cache)
      loadManagementData(true); // Force refresh immediately
      return;
    }
    
    // If we have cache, show it INSTANTLY (no loading, no delay)
    if (cachedData.length > 0) {
      // ✅ CRITICAL: Set data immediately and ensure loading is OFF
      setManagementData(cachedData);
      setSummary(cached?.summary || {
        totalTheaters: 0,
        totalCanteenQRs: 0,
        totalScreenQRs: 0,
        totalQRs: 0
      });
      setTotalPages(cached?.pagination?.totalPages || 0);
      setTotalItems(cached?.pagination?.totalItems || 0);
      hasLoadedOnceRef.current = true;
      setLoading(false); // ✅ CRITICAL: Force loading off
      isNavigatingBackRef.current = true; // Mark as navigating back
      
      // Then refresh in background (non-blocking)
      refreshTimer = setTimeout(() => {
        isNavigatingBackRef.current = false;
        loadManagementData(true);
      }, 300);
    } else {
      // No cache - this is first load
      isNavigatingBackRef.current = false;
      
      if (isInitialMountRef.current) {
        isInitialMountRef.current = false;
        // First mount with no cache - load normally
        loadManagementData(false);
      } else {
        // Filter/page change with no cache - load normally
        loadManagementData(false);
        refreshTimer = setTimeout(() => loadManagementData(true), 300);
      }
    }

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, currentPage, itemsPerPage, loadManagementData, location.state]);

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
    navigate(`/qr-theater/${theater._id}`, {
      state: {
        theater,
        canteenQRCount: theater.canteenQRCount,
        screenQRCount: theater.screenQRCount
      }
    });
  };

  // ==================== RENDER HELPERS ====================
  const renderTheaterRow = (theater, index) => {
    const logo = theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl;
    const location = theater.location?.city && theater.location?.state
      ? `${theater.location.city}, ${theater.location.state}`
      : 'Location not specified';

    return (
      <tr key={theater._id} className="theater-row">
        <td className="sno-cell">
          <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
        </td>
        <td className="theater-logo-cell">
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
            <div className="theater-name">{theater.name || 'No Name'}</div>
            <div className="theater-location">{location}</div>
          </div>
        </td>
        <td className="owner-cell">
          <span className="count-badge canteen-badge">{theater.canteenQRCount || 0}</span>
        </td>
        <td className="contact-cell">
          <span className="count-badge screen-badge">{theater.screenQRCount || 0}</span>
        </td>
        <td className="actions-cell">
          <button
            className="action-btn view-btn"
            onClick={(e) => handleViewClick(e, theater)}
            title="View QR Codes"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
          </button>
        </td>
      </tr>
    );
  };

  // ==================== RENDER ====================
  const headerButton = (
    <button
      type="button"
      className="header-btn"
      onClick={(e) => {
        e.preventDefault();
        navigate('/qr-generate');
      }}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </span>
      GENERATE QR CODES
    </button>
  );

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="QR Management" currentPage="qr-list">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="QR Code Management"
              showBackButton={false}
              actionButton={headerButton}
            />
            
            {/* Stats Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.totalTheaters || 0}</div>
                <div className="stat-label">Total Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.totalCanteenQRs || 0}</div>
                <div className="stat-label">Canteen QRs</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.totalScreenQRs || 0}</div>
                <div className="stat-label">Screen QRs</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.totalQRs || 0}</div>
                <div className="stat-label">Total QR Codes</div>
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
                    Showing {sortedManagementData.length} of {totalItems} theaters (Page {currentPage} of {totalPages || 1})
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
              {sortedManagementData.length === 0 && !loading ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="empty-state-icon">
                      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
                    </svg>
                  </div>
                  <h3>No Theaters Found</h3>
                  <p>No theaters are currently available in the system.</p>
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
                          <th className="name-col">Theater Name</th>
                          <th className="owner-col">Single QR</th>
                          <th className="contact-col">Screen QR</th>
                          <th className="actions-col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <TableSkeleton count={itemsPerPage} />
                        ) : (
                          sortedManagementData.map(renderTheaterRow)
                        )}
                      </tbody>
                    </table>
              )}
            </div>

            {/* Pagination */}
            {!loading && sortedManagementData.length > 0 && (
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

export default QRManagement;
