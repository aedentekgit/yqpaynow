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
import DateFilter from '../components/DateFilter/DateFilter';
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/pages/TransactionList.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { formatDateToLocal } from '../utils/dateUtils';


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

const TransactionList = () => {
  const navigate = useNavigate();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TransactionList');
  
  // Cache key helper
  const getCacheKey = (page, limit, search, dateFilter) => {
    const dateKey = dateFilter?.selectedDate || dateFilter?.startDate || dateFilter?.type || 'none';
    return `theaters_transactions_page_${page}_limit_${limit}_search_${search || 'none'}_date_${dateKey}_active`;
  };
  
  // Date filter state - Default to current date
  const getCurrentDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const initialDateFilter = {
    type: 'date',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: getCurrentDateString(),
    startDate: null,
    endDate: null
  };

  // 🚀 OPTIMIZED: Check cache synchronously on mount for instant loading
  const initialCacheKey = getCacheKey(1, 10, '', initialDateFilter);
  const initialCache = typeof window !== 'undefined' 
        ? getCachedData(initialCacheKey, 300000) // 5-minute cache
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
  const [overallRevenue, setOverallRevenue] = useState(0);
  
  // Order statistics state
  const [orderStats, setOrderStats] = useState({
    posOrders: 0,
    posOrdersAmount: 0,
    kioskOrders: 0,
    kioskOrdersAmount: 0,
    onlineOrders: 0,
    onlineOrdersAmount: 0,
    cancelledOrders: 0,
    cancelledOrdersAmount: 0,
    totalOrders: 0,
    totalOrdersAmount: 0
  });
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages || 0);
  const [totalItems, setTotalItems] = useState(initialPagination.totalItems || 0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Date filter state - Default to current date
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  
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
      setCurrentPage(1);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch theaters function - OPTIMIZED: optimizedFetch handles cache automatically
  const fetchTheaters = useCallback(async (forceRefresh = false) => {
    try {
      // 🚀 PERFORMANCE: Only set loading if we didn't have initial cache
      if (!hasInitialCache.current) {
        setLoading(true);
      }
      setError('');
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        isActive: 'true'
      });

      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }

      // Add date filter to params (for theater filtering if needed)
      // Note: The date filter is primarily used for order statistics, not theater filtering
      // Theaters are filtered by isActive status, and orders are filtered separately
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // Use local date format for consistency with user's timezone
        const selectedDateStr = dateFilter.selectedDate;
        const selectedDate = selectedDateStr.includes('T') 
          ? new Date(selectedDateStr) 
          : new Date(selectedDateStr + 'T00:00:00');
        params.append('date', formatDateToLocal(selectedDate)); // ✅ FIX: Use local date format
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        params.append('startDate', dateFilter.startDate);
        params.append('endDate', dateFilter.endDate);
      } else if (dateFilter.type === 'month') {
        params.append('month', dateFilter.month.toString());
        params.append('year', dateFilter.year.toString());
      }

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // � FORCE REFRESH: Add no-cache headers when force refreshing
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
      // 🔄 FORCE REFRESH: Skip cache by passing null as cacheKey when force refreshing
      const cacheKey = getCacheKey(currentPage, itemsPerPage, debouncedSearchTerm, dateFilter);
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters?${params.toString()}`,
        {
          signal: abortControllerRef.current.signal,
          headers
        },
        forceRefresh ? null : cacheKey,
        300000 // 5-minute cache
      );
      
      if (!result) {
        throw new Error('Failed to fetch theaters for transaction list');
      }
      
      if (result.success) {
        const activeTheaters = result.data || [];
        setTheaters(activeTheaters);
        
        const paginationData = result.pagination || {};
        setTotalPages(paginationData.totalPages || 0);
        setTotalItems(paginationData.totalItems || 0);
      } else {
        throw new Error(result.message || 'Failed to fetch theaters for transaction list');
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      setError('Failed to load theaters for transaction list');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm, dateFilter]);

  useEffect(() => {
    // ✅ FIX: Fetch theaters when search term changes or component mounts
    // Only force refresh on mount, not on every search change (to avoid unnecessary API calls)
    const isInitialMount = debouncedSearchTerm === '' && currentPage === 1;
    fetchTheaters(isInitialMount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, debouncedSearchTerm, dateFilter]); // fetchTheaters is stable (useCallback with same deps)

  // Fetch order statistics across all theaters
  const fetchOrderStatistics = useCallback(async () => {
    try {
      setLoadingStats(true);
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('[TransactionList] No auth token found');
        setOrderStats({
          posOrders: 0,
          posOrdersAmount: 0,
          kioskOrders: 0,
          kioskOrdersAmount: 0,
          onlineOrders: 0,
          onlineOrdersAmount: 0,
          cancelledOrders: 0,
          cancelledOrdersAmount: 0,
          totalOrders: 0,
          totalOrdersAmount: 0
        });
        setLoadingStats(false);
        return;
      }

      // Build date filter params - convert single date to startDate/endDate range
      const params = new URLSearchParams();
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // Convert single date to start and end of day for proper filtering
        // Handle both YYYY-MM-DD format and Date object
        const selectedDateStr = dateFilter.selectedDate;
        let selectedDate;
        
        try {
          if (selectedDateStr.includes('T')) {
            selectedDate = new Date(selectedDateStr);
          } else {
            // Parse YYYY-MM-DD format
            const [year, month, day] = selectedDateStr.split('-').map(Number);
            selectedDate = new Date(year, month - 1, day);
          }
          
          // Validate date
          if (isNaN(selectedDate.getTime())) {
            throw new Error('Invalid date format');
          }
          
          const startOfDay = new Date(selectedDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(selectedDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          // Apply time filters if provided
          if (dateFilter.fromTime) {
            const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
            startOfDay.setHours(hours || 0, minutes || 0, 0, 0);
          }
          if (dateFilter.toTime) {
            const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
            endOfDay.setHours(hours || 23, minutes || 59, 59, 999);
          }
          
          params.append('startDate', startOfDay.toISOString());
          params.append('endDate', endOfDay.toISOString());
          
        } catch (dateError) {
          console.error('[TransactionList] Error parsing date:', dateError, 'Date string:', selectedDateStr);
          setLoadingStats(false);
          return;
        }
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        // Convert month to start and end of month
        const startOfMonth = new Date(dateFilter.year, dateFilter.month - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(dateFilter.year, dateFilter.month, 0, 23, 59, 59, 999);
        
        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startOfMonth.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endOfMonth.setHours(hours || 23, minutes || 59, 59, 999);
        }
        
        params.append('startDate', startOfMonth.toISOString());
        params.append('endDate', endOfMonth.toISOString());
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        const startDate = new Date(dateFilter.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);
        
        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startDate.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endDate.setHours(hours || 23, minutes || 59, 59, 999);
        }
        
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      } else {
        console.warn('[TransactionList] No valid date filter provided, using current date as fallback:', dateFilter);
        // Fallback to current date if no valid filter
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);
        params.append('startDate', today.toISOString());
        params.append('endDate', endOfToday.toISOString());
      }


      // Use the new aggregated endpoint for all theaters
      const statsResponse = await optimizedFetch(
        `${config.api.baseUrl}/orders/all-theaters-stats?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        `all_theaters_stats_${params.toString()}`,
        60000 // 1-minute cache for stats
      );

      if (statsResponse && statsResponse.success && statsResponse.data) {
        setOrderStats({
          posOrders: statsResponse.data.posOrders || 0,
          posOrdersAmount: statsResponse.data.posOrdersAmount || 0,
          kioskOrders: statsResponse.data.kioskOrders || 0,
          kioskOrdersAmount: statsResponse.data.kioskOrdersAmount || 0,
          onlineOrders: statsResponse.data.onlineOrders || 0,
          onlineOrdersAmount: statsResponse.data.onlineOrdersAmount || 0,
          cancelledOrders: statsResponse.data.cancelledOrders || 0,
          cancelledOrdersAmount: statsResponse.data.cancelledOrdersAmount || 0,
          totalOrders: statsResponse.data.totalOrders || 0,
          totalOrdersAmount: statsResponse.data.totalOrdersAmount || 0
        });
      } else {
        console.warn('[TransactionList] Failed to fetch aggregated statistics:', statsResponse);
        // Set default values
        setOrderStats({
          posOrders: 0,
          posOrdersAmount: 0,
          kioskOrders: 0,
          kioskOrdersAmount: 0,
          onlineOrders: 0,
          onlineOrdersAmount: 0,
          cancelledOrders: 0,
          cancelledOrdersAmount: 0,
          totalOrders: 0,
          totalOrdersAmount: 0
        });
      }

    } catch (error) {
      console.error('[TransactionList] Failed to fetch order statistics:', error);
      setOrderStats({
        posOrders: 0,
        posOrdersAmount: 0,
        kioskOrders: 0,
        kioskOrdersAmount: 0,
        onlineOrders: 0,
        onlineOrdersAmount: 0,
        cancelledOrders: 0,
        cancelledOrdersAmount: 0,
        totalOrders: 0,
        totalOrdersAmount: 0
      });
    } finally {
      setLoadingStats(false);
    }
  }, [dateFilter]);

  // Fetch order statistics when date filter changes or on mount
  useEffect(() => {
    // Always call fetchOrderStatistics - it will handle date filter validation internally
    fetchOrderStatistics();
  }, [fetchOrderStatistics]);

  // Handle view theater transactions - navigate to transaction detail page
  const handleTransactionClick = (theater) => {
    navigate(`/transactions/${theater._id}`);
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

  // Handle date filter apply
  const handleDateFilterApply = useCallback((newDateFilter) => {
    setDateFilter(newDateFilter);
    setCurrentPage(1); // Reset to page 1 when changing date filter
  }, []);

  // Error state
  if (error) {
    return (
      <AdminLayout pageTitle="Transaction List" currentPage="transactions">
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

  const dateFilterButton = (
    <button 
      className="header-btn"
      onClick={() => setShowDateFilterModal(true)}
    >
      <span className="btn-icon">📅</span>
      {dateFilter.type === 'all' ? 'Date Filter' : 
       dateFilter.type === 'date' && dateFilter.selectedDate ? 
         (() => {
           try {
             const dateStr = dateFilter.selectedDate;
             const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
             const today = new Date();
             today.setHours(0, 0, 0, 0);
             const selectedDateOnly = new Date(date);
             selectedDateOnly.setHours(0, 0, 0, 0);
             const isToday = selectedDateOnly.getTime() === today.getTime();
             return isToday 
               ? `Today (${date.toLocaleDateString('en-GB')})` 
               : date.toLocaleDateString('en-GB');
           } catch (e) {
             return 'Date Filter';
           }
         })() :
       dateFilter.type === 'month' ? `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
       dateFilter.type === 'year' ? `Year ${dateFilter.year}` :
       dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate ? 
         `${new Date(dateFilter.startDate).toLocaleDateString('en-GB')} - ${new Date(dateFilter.endDate).toLocaleDateString('en-GB')}` :
       'Date Filter'}
    </button>
  );

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Transaction List" currentPage="transactions">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Transaction List"
              showBackButton={false}
              actionButton={dateFilterButton}
            />
            
            {/* Stats Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{loadingStats ? '...' : (orderStats.posOrders || 0)}</div>
                <div className="stat-label">POS Orders</div>
                <div className="stat-amount">₹{(orderStats.posOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{loadingStats ? '...' : (orderStats.kioskOrders || 0)}</div>
                <div className="stat-label">Kiosk Orders</div>
                <div className="stat-amount">₹{(orderStats.kioskOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{loadingStats ? '...' : (orderStats.onlineOrders || 0)}</div>
                <div className="stat-label">Online Orders</div>
                <div className="stat-amount">₹{(orderStats.onlineOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{loadingStats ? '...' : (orderStats.cancelledOrders || 0)}</div>
                <div className="stat-label">Cancelled Orders</div>
                <div className="stat-amount">₹{(orderStats.cancelledOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{loadingStats ? '...' : (orderStats.totalOrders || 0)}</div>
                <div className="stat-label">Overall Orders</div>
                <div className="stat-amount">₹{(orderStats.totalOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                  <p>There are no theaters available for transaction list at the moment.</p>
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
                        {Array.isArray(sortedTheaters) && sortedTheaters.length > 0 ? sortedTheaters.map((theater, index) => {
                          if (!theater || !theater._id) return null;
                          
                          const theaterName = String(theater.name || 'Unnamed Theater');
                          const theaterCity = String(theater.location?.city || '');
                          const theaterState = String(theater.location?.state || '');
                          const theaterOwner = theater.ownerDetails?.name || 'Not specified';
                          const theaterPhone = theater.ownerDetails?.contactNumber || 'Not provided';
                          
                          return (
                            <tr key={theater._id} className="theater-row">
                              <td className="sno-cell">
                                <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
                              </td>
                              
                              <td className="photo-cell">
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
                                    onClick={() => handleTransactionClick(theater)}
                                    title="View Transactions for this Theater"
                                  />
                                </ActionButtons>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan="6" className="table-empty-cell">
                              Loading theaters...
                            </td>
                          </tr>
                        )}
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

        {/* Date Filter Modal */}
        <DateFilter
          isOpen={showDateFilterModal}
          onClose={() => setShowDateFilterModal(false)}
          onApply={handleDateFilterApply}
          initialFilter={dateFilter}
          dateOnly={false}
        />
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default TransactionList;

