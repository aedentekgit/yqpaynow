import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import Pagination from '../components/Pagination';
import DateFilter from '../components/DateFilter/DateFilter';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import { useToast } from '../contexts/ToastContext';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { optimizedFetch } from '../utils/apiOptimizer';
import config from '../config';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/QRManagementPage.css';
import '../styles/TheaterList.css';
import '../styles/pages/theater/TheaterQRCodeNames.css'; // Use same styles as QR Code Names
import '../styles/pages/TransactionDetail.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



const TransactionDetail = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  
  // PERFORMANCE MONITORING
  usePerformanceMonitoring('TransactionDetail');
  
  // Data state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theater, setTheater] = useState(null);
  const [summary, setSummary] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    posOrders: 0,
    posOrdersAmount: 0,
    kioskOrders: 0,
    kioskOrdersAmount: 0,
    onlineOrders: 0,
    onlineOrdersAmount: 0,
    cancelledOrders: 0,
    cancelledOrdersAmount: 0
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Filter state
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'pos', 'kiosk', 'online'
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    type: 'month',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: null,
    startDate: null,
    endDate: null
  });
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // Refs
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

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

  // Fetch theater info
  const fetchTheater = useCallback(async (forceRefresh = false) => {
    if (!theaterId) return;
    
    try {
      // � FORCE REFRESH: Add cache-busting parameter when force refreshing
      const params = new URLSearchParams();
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const data = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}${params.toString() ? '?' + params.toString() : ''}`,
        {
          headers
        },
        forceRefresh ? null : `theater_${theaterId}`,
        120000 // 2-minute cache
      );
      
      if (data && data.success && data.data) {
        setTheater(data.data);
      }
    } catch (error) {
      console.error('Error fetching theater info:', error);
    }
  }, [theaterId]);

  // Fetch all orders with filters (POS, KIOSK, ONLINE)
  const fetchOrders = useCallback(async (forceRefresh = false) => {
    if (!theaterId || !isMountedRef.current) return;

    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError('');

      // Build query parameters
      const params = new URLSearchParams({
        theaterId: theaterId,
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        _cacheBuster: Date.now()
      });

      // Add date filter params
      if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        params.append('month', dateFilter.month.toString());
        params.append('year', dateFilter.year.toString());
      } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        params.append('date', dateFilter.selectedDate);
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        params.append('startDate', dateFilter.startDate);
        params.append('endDate', dateFilter.endDate);
      }

      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading (shorter TTL for orders)
      // 🔄 FORCE REFRESH: Skip cache by passing null as cacheKey when force refreshing
      const cacheKey = `orders_theater_${theaterId}_page_${currentPage}_limit_${itemsPerPage}_date_${JSON.stringify(dateFilter)}_search_${debouncedSearchTerm || 'none'}`;
      const data = await optimizedFetch(
        `${config.api.baseUrl}/orders/theater-nested?${params.toString()}`,
        {
          signal: abortControllerRef.current.signal,
          headers
        },
        forceRefresh ? null : cacheKey,
        60000 // 1-minute cache for orders (fresher data)
      );

      if (!data) {
        // No orders found - handle gracefully
        setOrders([]);
        setTotalItems(0);
        setTotalPages(0);
        setSummary({
          totalOrders: 0,
          totalRevenue: 0,
          posOrders: 0,
          posOrdersAmount: 0,
          kioskOrders: 0,
          kioskOrdersAmount: 0,
          onlineOrders: 0,
          onlineOrdersAmount: 0,
          cancelledOrders: 0,
          cancelledOrdersAmount: 0
        });
        setLoading(false);
        return;
      }

      if (!isMountedRef.current) return;

      if (data.success && data.data) {
        // Get all orders from API
        let allOrders = Array.isArray(data.data) ? data.data : [];
        
        // Apply source filter on frontend
        if (sourceFilter !== 'all') {
          allOrders = allOrders.filter(order => {
            const source = order.source?.toLowerCase() || '';
            if (sourceFilter === 'pos') {
              return source === 'pos';
            } else if (sourceFilter === 'kiosk') {
              return source === 'kiosk';
            } else if (sourceFilter === 'online') {
              return source === 'qr_code' || source === 'online';
            }
            return true;
          });
        }
        
        // Calculate summary statistics
        const posOrders = allOrders.filter(order => {
          const source = order.source?.toLowerCase() || '';
          return source === 'pos';
        });
        
        const kioskOrders = allOrders.filter(order => {
          const source = order.source?.toLowerCase() || '';
          return source === 'kiosk';
        });
        
        const onlineOrders = allOrders.filter(order => {
          const source = order.source?.toLowerCase() || '';
          return source === 'qr_code' || source === 'online';
        });

        const cancelledOrders = allOrders.filter(order => {
          const status = order.status?.toLowerCase() || '';
          return status === 'cancelled';
        });

        // Calculate amounts for each order type
        const posOrdersAmount = posOrders.reduce((sum, order) => {
          return sum + (order.pricing?.total || order.totalAmount || order.total || 0);
        }, 0);

        const kioskOrdersAmount = kioskOrders.reduce((sum, order) => {
          return sum + (order.pricing?.total || order.totalAmount || order.total || 0);
        }, 0);

        const onlineOrdersAmount = onlineOrders.reduce((sum, order) => {
          return sum + (order.pricing?.total || order.totalAmount || order.total || 0);
        }, 0);

        const cancelledOrdersAmount = cancelledOrders.reduce((sum, order) => {
          return sum + (order.pricing?.total || order.totalAmount || order.total || 0);
        }, 0);

        const totalRevenue = allOrders.reduce((sum, order) => {
          return sum + (order.pricing?.total || order.totalAmount || order.total || 0);
        }, 0);

        setOrders(allOrders);
        setSummary({
          totalOrders: allOrders.length,
          totalRevenue: totalRevenue,
          posOrders: posOrders.length,
          posOrdersAmount: posOrdersAmount,
          kioskOrders: kioskOrders.length,
          kioskOrdersAmount: kioskOrdersAmount,
          onlineOrders: onlineOrders.length,
          onlineOrdersAmount: onlineOrdersAmount,
          cancelledOrders: cancelledOrders.length,
          cancelledOrdersAmount: cancelledOrdersAmount
        });

        // Set pagination if provided
        if (data.pagination) {
          setTotalItems(data.pagination.total || allOrders.length);
          setTotalPages(data.pagination.pages || 1);
          setCurrentPage(data.pagination.current || currentPage);
        } else {
          setTotalItems(allOrders.length);
          setTotalPages(Math.ceil(allOrders.length / itemsPerPage));
        }
      } else {
        setOrders([]);
        setTotalItems(0);
        setTotalPages(0);
        setSummary({
          totalOrders: 0,
          totalRevenue: 0,
          posOrders: 0,
          posOrdersAmount: 0,
          kioskOrders: 0,
          kioskOrdersAmount: 0,
          onlineOrders: 0,
          onlineOrdersAmount: 0,
          cancelledOrders: 0,
          cancelledOrdersAmount: 0
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        console.error('Error fetching orders:', error);
        setError('Failed to load transactions');
        setOrders([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterId, dateFilter, sourceFilter, currentPage, itemsPerPage, debouncedSearchTerm]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    isMountedRef.current = true;
    // 🔄 FORCE REFRESH: Always force refresh on mount to ensure fresh data
    fetchTheater(true);
    fetchOrders(true);

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [fetchTheater, fetchOrders]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get order type badge
  const getOrderTypeBadge = (order) => {
    const source = order.source?.toLowerCase() || '';
    if (source === 'pos' || source === 'kiosk') {
      return <span className="order-type-badge pos">POS/KIOSK</span>;
    } else if (source === 'qr_code' || source === 'online') {
      return <span className="order-type-badge online">ONLINE</span>;
    }
    return <span className="order-type-badge other">{source.toUpperCase() || 'OTHER'}</span>;
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return 'status-badge active';
      case 'completed': return 'status-badge completed';
      case 'cancelled': return 'status-badge inactive';
      case 'pending': return 'status-badge pending';
      default: return 'status-badge';
    }
  };

  // Orders are already paginated from backend
  const paginatedOrders = orders;

  // Handle pagination
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Handle search
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Get month name from date filter
  const monthName = dateFilter.type === 'month' 
    ? new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : dateFilter.type === 'date' && dateFilter.selectedDate
    ? new Date(dateFilter.selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'All Time';

  // Handle source filter change
  const handleSourceFilterChange = (e) => {
    setSourceFilter(e.target.value);
    setCurrentPage(1);
  };

  // Handle date filter apply
  const handleDateFilterApply = useCallback((newDateFilter) => {
    setDateFilter(newDateFilter);
    setCurrentPage(1);
  }, []);

  // Excel Download Handler
  const handleDownloadExcel = useCallback(async () => {
    if (!theaterId) {
      toast.error('Theater ID is missing');
      return;
    }
    
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) {
      toast.error('Please login again to download reports');
      return;
    }
    
    setDownloadingExcel(true);
    try {
      const params = new URLSearchParams();
      
      // Add date filter params
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        params.append('date', dateFilter.selectedDate);
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        params.append('month', dateFilter.month);
        params.append('year', dateFilter.year);
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        params.append('startDate', dateFilter.startDate);
        params.append('endDate', dateFilter.endDate);
      }
      
      // Add source filter if not 'all'
      if (sourceFilter !== 'all') {
        if (sourceFilter === 'pos') {
          params.append('source', 'pos');
        } else if (sourceFilter === 'kiosk') {
          params.append('source', 'kiosk');
        } else if (sourceFilter === 'online') {
          params.append('source', 'qr_code');
        }
      }

      const apiUrl = `${config.api.baseUrl}/orders/excel/${theaterId}?${params.toString()}`;

      const response = await unifiedFetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache file downloads
        cacheTTL: 0
      });

      if (response.status === 401 || response.status === 403) {
        toast.error('Session expired. Please login again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }

      if (response.ok) {
        const blob = await response.blob();
        if (blob.size === 0) {
          toast.error('No data available to export');
          return;
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = dateFilter.type === 'date' && dateFilter.selectedDate 
          ? `_${dateFilter.selectedDate}` 
          : dateFilter.type === 'month' 
          ? `_${dateFilter.year}-${String(dateFilter.month).padStart(2, '0')}`
          : '';
        const sourceStr = sourceFilter !== 'all' ? `_${sourceFilter.toUpperCase()}` : '';
        a.download = `Transactions${sourceStr}${dateStr}_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Excel file downloaded successfully');
      } else {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          toast.error(errorData.error || `Failed to download Excel report (${response.status})`);
        } else {
          toast.error(`Failed to download Excel report (${response.status})`);
        }
      }
    } catch (error) {
      console.error('Excel download error:', error);
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, dateFilter, sourceFilter, toast]);


  return (
    <ErrorBoundary>
      <AdminLayout 
        pageTitle={theater ? `Transactions - ${theater.name}` : 'Transaction Detail'} 
        currentPage="transactions"
      >
        <div className="qr-code-name-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="qr-code-name-vertical"
          >
            {/* Global Vertical Header Component - matching QR Code Names page */}
            <VerticalPageHeader
              title={theater?.name || 'Theater Name Not Available'}
              backButtonText="Back to Theater List"
              backButtonPath="/transactions"
            />
        
            {/* Stats Section */}
            <div className="qr-stats">
          <div className="stat-card">
            <div className="stat-number">{summary.posOrders || 0}</div>
            <div className="stat-label">POS Orders</div>
            <div className="stat-amount">{formatCurrency(summary.posOrdersAmount || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.kioskOrders || 0}</div>
            <div className="stat-label">Kiosk Orders</div>
            <div className="stat-amount">{formatCurrency(summary.kioskOrdersAmount || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.onlineOrders || 0}</div>
            <div className="stat-label">Online Orders</div>
            <div className="stat-amount">{formatCurrency(summary.onlineOrdersAmount || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.cancelledOrders || 0}</div>
            <div className="stat-label">Cancelled Orders</div>
            <div className="stat-amount">{formatCurrency(summary.cancelledOrdersAmount || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.totalOrders || 0}</div>
            <div className="stat-label">Overall Orders</div>
            <div className="stat-amount">{formatCurrency(summary.totalRevenue || 0)}</div>
          </div>
        </div>

            {/* Enhanced Filters Section - matching QR Code Names page */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search by order number or customer..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <div className="filter-controls">
                {/* Source Filter Dropdown */}
                <select
                  value={sourceFilter}
                  onChange={handleSourceFilterChange}
                  className="status-filter"
                >
                  <option value="all">All Types</option>
                  <option value="pos">POS</option>
                  <option value="kiosk">KIOSK</option>
                  <option value="online">ONLINE</option>
                </select>

                {/* Excel Download Button */}
                <button 
                  className="submit-btn excel-download-btn"
                  onClick={handleDownloadExcel}
                  disabled={downloadingExcel || loading}
                >
                  <span>{downloadingExcel ? '⏳' : '📊'}</span>
                  {downloadingExcel ? 'Downloading...' : 'Excel'}
                </button>

                <div className="results-count">
                  Showing {paginatedOrders.length} of {totalItems} orders (Page {currentPage} of {totalPages || 1})
                </div>
                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select 
                    value={itemsPerPage} 
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }} 
                    className="items-select"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Management Table */}
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-col">S.No</th>
                    <th className="name-col">Order Number</th>
                    <th className="name-col">Date & Time</th>
                    <th className="name-col">Order Type</th>
                    <th className="name-col">Customer</th>
                    <th className="status-col">Status</th>
                    <th className="name-col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <tr key={`skeleton-${index}`} className="skeleton-row">
                        <td><div className="skeleton-text"></div></td>
                        <td><div className="skeleton-text"></div></td>
                        <td><div className="skeleton-text wide"></div></td>
                        <td><div className="skeleton-text"></div></td>
                        <td><div className="skeleton-text"></div></td>
                        <td><div className="skeleton-text"></div></td>
                        <td><div className="skeleton-text"></div></td>
                      </tr>
                    ))
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="no-data">
                        <div className="empty-state">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="empty-state-icon">
                            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2z"/>
                          </svg>
                          <p>No transactions found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order, index) => (
                      <tr key={order._id || `order-${index}`} className="theater-row">
                        <td className="sno-cell">
                          <div className="sno-number">{((currentPage - 1) * itemsPerPage) + index + 1}</div>
                        </td>
                        <td className="name-cell">
                          <div className="theater-name-container">
                            <div className="theater-name">{order.orderNumber || 'N/A'}</div>
                          </div>
                        </td>
                        <td className="name-cell">
                          <div className="theater-name-container">
                            <div className="theater-name">{formatDate(order.createdAt || order.orderDate)}</div>
                          </div>
                        </td>
                        <td className="name-cell">
                          <div className="theater-name-container">
                            {getOrderTypeBadge(order)}
                          </div>
                        </td>
                        <td className="name-cell">
                          <div className="theater-name-container">
                            <div className="theater-name">{order.customerName || order.customerInfo?.name || 'Walk-in Customer'}</div>
                          </div>
                        </td>
                        <td className="status-cell">
                          <span className={getStatusBadgeClass(order.status)}>
                            {order.status?.toUpperCase() || 'PENDING'}
                          </span>
                        </td>
                        <td className="name-cell">
                          <div className="theater-name-container">
                            <div className="theater-name">{formatCurrency(order.pricing?.total || order.totalAmount || order.total || 0)}</div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
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
                onPageChange={handlePageChange}
                itemType="transactions"
              />
            )}

          </PageContainer>
        </div>


        {/* Custom CSS for transaction table styling - matching QR Code Names */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Order Type Badges */
            .order-type-badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              white-space: nowrap;
            }
            .order-type-badge.pos {
              background: #FEF3C7;
              color: #92400E;
            }
            .order-type-badge.online {
              background: #DBEAFE;
              color: #1E40AF;
            }
            .order-type-badge.other {
              background: #F3F4F6;
              color: #374151;
            }
            
            /* Excel Download Button */
            .excel-download-btn {
              padding: 8px 16px;
              background-color: #10b981;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 6px;
              transition: all 0.2s ease;
            }
            
            .excel-download-btn:hover:not(:disabled) {
              background-color: #059669;
              transform: translateY(-1px);
              box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
            }
            
            .excel-download-btn:disabled {
              background-color: #9ca3af;
              cursor: not-allowed;
              opacity: 0.6;
              pointer-events: none;
            }
          `
        }} />
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default TransactionDetail;

