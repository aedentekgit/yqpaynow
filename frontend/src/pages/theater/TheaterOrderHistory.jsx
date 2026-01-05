import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getCachedData, setCachedData, clearCachePattern, clearCache } from '@utils/cacheUtils';
import DateFilter from '@components/DateFilter';
import Pagination from '@components/Pagination';
import config from '@config';
import apiService from '@services/apiService';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/AddTheater.css';
import '@styles/skeleton.css'; // 🚀 Skeleton loading styles
import '@styles/pages/theater/TheaterOrderHistory.css'; // Extracted inline styles
import '@styles/components/GlobalButtons.css'; // Global button styles - Must load LAST to override
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';

const TheaterOrderHistory = React.memo(() => {
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal();

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterOrderHistory');

  // 🚀 INSTANT: Check cache synchronously on initialization
  const initialCachedData = (() => {
    if (!theaterId) return null;
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const selectedDate = `${year}-${month}-${day}`;

      const cacheKey = `theaterOrderHistory_${theaterId}_${selectedDate}`;
      const cached = getCachedData(cacheKey, 300000);
      // ✅ FIX: Check for both cached.data and cached.orders structures
      if (cached && (cached.data || cached.orders)) {
        const cachedOrders = Array.isArray(cached.data) ? cached.data : (Array.isArray(cached.orders) ? cached.orders : []);
        return {
          orders: cachedOrders,
          pagination: cached.pagination || {},
          summary: cached.summary || {}
        };
      }
    } catch (e) {
      console.warn('Initial cache read failed:', e);
    }
    return null;
  })();

  // Data state - Initialize with cached data immediately
  const [orders, setOrders] = useState(initialCachedData?.orders || []);
  const [allOrders, setAllOrders] = useState(initialCachedData?.orders || []); // Store all orders for pagination
  const [loading, setLoading] = useState(false); // 🚀 Never show loading on initial render if we have cache
  // ✅ FIX: Set initialLoadDone to true if we have cached data (even if empty array)
  const [initialLoadDone, setInitialLoadDone] = useState(!!(initialCachedData && initialCachedData.orders && initialCachedData.orders.length >= 0));
  const lastLoadKeyRef = useRef('');
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [theaterInfo, setTheaterInfo] = useState(null); // Theater information for receipts
  // ✅ FIX: Initialize summary from cached data or calculate from cached orders
  const [summary, setSummary] = useState(() => {
    if (initialCachedData?.summary) {
      return initialCachedData.summary;
    }
    if (initialCachedData?.orders && initialCachedData.orders.length > 0) {
      // Calculate summary from cached orders if summary not available
      const cancelledOrders = initialCachedData.orders.filter(o => o.status === 'cancelled');
      const cancelledOrderAmount = cancelledOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0);

      return {
        totalOrders: initialCachedData.orders.length,
        confirmedOrders: initialCachedData.orders.filter(o => o.status === 'confirmed').length,
        completedOrders: initialCachedData.orders.filter(o => o.status === 'completed').length,
        cancelledOrderAmount: cancelledOrderAmount,
        totalRevenue: initialCachedData.orders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0)
      };
    }
    return {
      totalOrders: 0,
      confirmedOrders: 0,
      completedOrders: 0,
      cancelledOrderAmount: 0,
      totalRevenue: 0
    };
  });

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentModeFilter, setPaymentModeFilter] = useState('all');
  const [orderSourceFilter, setOrderSourceFilter] = useState('all'); // POS, KIOSK, ONLINE filter (only for Theater Admin)

  // Date filtering state - Default to current date
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    type: 'date', // Default to current date instead of 'all'
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: (() => {
      // Fix: Use local date formatting to avoid timezone issues
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })(), // Today's date in YYYY-MM-DD format
    startDate: null,
    endDate: null
  });

  // Pagination - Initialize with cached data if available
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(initialCachedData?.pagination?.totalItems || 0);
  const [totalPages, setTotalPages] = useState(initialCachedData?.pagination?.totalPages || 0);

  // Modal states  
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Refs for cleanup and performance
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadOrdersDataRef = useRef(null); // Ref to store loadOrdersData function

  // Ensure mounted ref is set on component mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {
      // Removed error modal - access denied logged to console only
      return;
    }
  }, [theaterId, userTheaterId, userType]);

  // Fetch theater information for receipts
  const fetchTheaterInfo = useCallback(async () => {
    if (!theaterId) return;

    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
        headers: {
          'Accept': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `theater_info_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setTheaterInfo(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching theater info:', error);
    }
  }, [theaterId]);

  // Load theater info on mount
  useEffect(() => {
    fetchTheaterInfo();
  }, [fetchTheaterInfo]);

  // 🚀 ULTRA-OPTIMIZED: Load orders data - <50ms with instant cache
  const loadOrdersData = useCallback(async (page = 1, limit = 10, search = '', status = 'all', dateFilterParam = null, paymentMode = 'all', orderSource = 'all', skipCache = false, forceRefresh = false) => {
    const currentDateFilter = dateFilterParam || dateFilter;
    const currentPaymentMode = paymentMode !== undefined ? paymentMode : paymentModeFilter;
    const currentOrderSource = orderSource !== undefined ? orderSource : orderSourceFilter;

    if (!isMountedRef.current || !theaterId) {
      return;
    }

    // ✅ FIX: When forceRefresh is true, skip ALL cache checks completely
    if (forceRefresh || skipCache) {
      // Clear all caches aggressively BEFORE any API calls
      try {
        clearCachePattern(`theaterOrderHistory_${theaterId}`);
        clearCachePattern(`orders_nested_${theaterId}`);
        clearCachePattern(`api_orders_theater_${theaterId}`);
        clearCachePattern(`orders_theater_${theaterId}`);
        clearCachePattern(`/orders/theater/${theaterId}`);
        clearCachePattern(`order_${theaterId}`);
      } catch (error) {
        console.warn('Cache clear error:', error);
      }
      // Skip to API call immediately - no cache check
    } else if (!skipCache && !forceRefresh && page === 1 && !search && status === 'all' && currentPaymentMode === 'all' && currentOrderSource === 'all' && currentDateFilter.type === 'date') {
      // 🚀 INSTANT CACHE CHECK - Load from cache first (< 50ms) - SYNCHRONOUS
      // Only cache for first page, no search, default status, default payment mode, and default date filter
      const cacheKey = `theaterOrderHistory_${theaterId}_${currentDateFilter.selectedDate}`;
      try {
        const cached = getCachedData(cacheKey, 60000); // ✅ Reduced from 5min to 1min for fresher data

        if (cached && isMountedRef.current) {
          // Cached data structure: { data, pagination, summary }
          let cachedOrders = cached.data || [];
          const cachedPagination = cached.pagination || {};
          const cachedSummary = cached.summary || {};

          // Ensure cachedOrders is an array
          if (!Array.isArray(cachedOrders)) {
            cachedOrders = [];
          }

          // 🚀 INSTANT state update from cache (< 50ms) - Use React 18 batching
          // All state updates in event handlers are automatically batched
          // ✅ FIX: Update all state synchronously for instant UI display
          setAllOrders(cachedOrders);
          setOrders(cachedOrders);
          setTotalItems(cachedPagination.totalItems || cachedPagination.total || 0);
          setTotalPages(cachedPagination.totalPages || cachedPagination.pages || 0);
          setCurrentPage(1);
          // ✅ FIX: Calculate cancelledOrderAmount from cached orders
          const cancelledOrdersCache = cachedOrders.filter(o => o.status === 'cancelled');
          const cancelledOrderAmountCache = cancelledOrdersCache.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0);

          setSummary({
            totalOrders: cachedSummary.totalOrders || cachedOrders.length || 0,
            confirmedOrders: cachedSummary.confirmedOrders || cachedOrders.filter(o => o.status === 'confirmed').length || 0,
            completedOrders: cachedSummary.completedOrders || cachedOrders.filter(o => o.status === 'completed').length || 0,
            cancelledOrderAmount: cachedSummary.cancelledOrderAmount || cancelledOrderAmountCache || 0,
            totalRevenue: cachedSummary.totalRevenue || cachedOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0) || 0
          });
          setInitialLoadDone(true);
          setLoading(false); // ✅ FIX: Ensure loading is false when using cached data

          // ✅ FIX: Skip background refresh if we're already forcing a refresh
          // Only do background refresh for normal cache hits
          if (!forceRefresh && !skipCache) {
            // Fetch fresh data in background (non-blocking) - Update cache silently
            // Use requestAnimationFrame to ensure it doesn't block rendering
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (isMountedRef.current && loadOrdersDataRef.current) {
                  // Only refresh cache if filters haven't changed
                  if (status === 'all' && currentPaymentMode === 'all' && currentOrderSource === 'all' && !search) {
                    loadOrdersDataRef.current(1, limit, '', 'all', currentDateFilter, 'all', 'all', true, false);
                  }
                }
              }, 50); // Reduced delay for faster refresh
            });
          }
          return;
        }
      } catch (error) {
        // Cache read failed, continue with API call
        console.warn('Cache read error:', error);
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // Set loading at the start of fetch (only if we don't have initial data)
      if (!skipCache && orders.length === 0) {
        setLoading(true);
      }

      // Build query parameters
      const params = {
        page: page,
        limit: limit
      };

      // Add search parameter if provided
      if (search.trim()) {
        params.search = search.trim();
      }

      // Add status filter if not 'all'
      if (status !== 'all') {
        params.status = status;
      }

      // Add payment mode filter if not 'all'
      if (currentPaymentMode !== 'all') {
        params.paymentMode = currentPaymentMode;
      }

      // Add date filter parameters
      // Backend expects startDate and endDate, not a single date parameter
      if (currentDateFilter.type === 'month') {
        // For month filter, set start and end of month
        const year = currentDateFilter.year;
        const month = currentDateFilter.month;
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

        // Apply time filters if provided
        if (currentDateFilter.fromTime) {
          const [hours, minutes] = currentDateFilter.fromTime.split(':').map(Number);
          startOfMonth.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (currentDateFilter.toTime) {
          const [hours, minutes] = currentDateFilter.toTime.split(':').map(Number);
          endOfMonth.setHours(hours || 23, minutes || 59, 59, 999);
        }

        params.startDate = startOfMonth.toISOString();
        params.endDate = endOfMonth.toISOString();
      } else if (currentDateFilter.type === 'date' && currentDateFilter.selectedDate) {
        // For specific date, set start and end of that day
        const selectedDate = new Date(currentDateFilter.selectedDate);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Apply time filters if provided
        if (currentDateFilter.fromTime) {
          const [hours, minutes] = currentDateFilter.fromTime.split(':').map(Number);
          startOfDay.setHours(hours || 0, minutes || 0, 0, 0);
        }
        if (currentDateFilter.toTime) {
          const [hours, minutes] = currentDateFilter.toTime.split(':').map(Number);
          endOfDay.setHours(hours || 23, minutes || 59, 59, 999);
        }

        params.startDate = startOfDay.toISOString();
        params.endDate = endOfDay.toISOString();
      } else if (currentDateFilter.type === 'range') {
        if (currentDateFilter.startDate) {
          const startDate = new Date(currentDateFilter.startDate);
          startDate.setHours(0, 0, 0, 0);

          // Apply time filter if provided
          if (currentDateFilter.fromTime) {
            const [hours, minutes] = currentDateFilter.fromTime.split(':').map(Number);
            startDate.setHours(hours || 0, minutes || 0, 0, 0);
          }

          params.startDate = startDate.toISOString();
        }
        if (currentDateFilter.endDate) {
          const endDate = new Date(currentDateFilter.endDate);
          endDate.setHours(23, 59, 59, 999);

          // Apply time filter if provided
          if (currentDateFilter.toTime) {
            const [hours, minutes] = currentDateFilter.toTime.split(':').map(Number);
            endDate.setHours(hours || 23, minutes || 59, 59, 999);
          }

          params.endDate = endDate.toISOString();
        }
      }

      // ✅ FIX: Filter by order source based on filter selection (only for Theater Admin)
      // For Theater Admin users, allow filtering by POS, KIOSK, ONLINE, or All (all three)
      // For other users, default to POS orders only
      if (userType === 'theater_admin') {
        if (currentOrderSource === 'all') {
          // Show all order sources: POS, KIOSK, and ONLINE
          params.source = 'pos,staff,offline-pos,counter,kiosk,qr_code,online,qr_order,web';
        } else if (currentOrderSource === 'POS') {
          // POS orders: 'pos', 'staff', 'offline-pos', 'counter'
          params.source = 'pos,staff,offline-pos,counter';
        } else if (currentOrderSource === 'KIOSK') {
          // KIOSK orders: 'kiosk'
          params.source = 'kiosk';
        } else if (currentOrderSource === 'ONLINE') {
          // ONLINE orders: 'qr_code', 'online', 'qr_order', 'web'
          params.source = 'qr_code,online,qr_order,web';
        }
      } else {
        // Default behavior for non-admin users: Filter to show only POS orders (not online orders)
        // POS orders have source: 'pos', 'staff', 'offline-pos', 'counter'
        // Exclude online orders (source: 'online', 'qr_code', 'qr_order', 'web')
        params.source = 'pos,staff,offline-pos,counter';
      }

      // ✅ FIX: Aggressively clear ALL caches before API call if forceRefresh
      if (forceRefresh || skipCache) {
        try {
          // Clear all order-related cache patterns
          clearCachePattern(`api_orders_theater_${theaterId}`);
          clearCachePattern(`orders_theater_${theaterId}`);
          clearCachePattern(`theaterOrderHistory_${theaterId}`);
          clearCachePattern(`orders_nested_${theaterId}`);
          clearCachePattern(`/orders/theater/${theaterId}`);
          clearCachePattern(`order_${theaterId}`);

          // Also clear specific cache keys that might exist
          const cacheKey = `theaterOrderHistory_${theaterId}_${currentDateFilter.selectedDate || 'all'}`;
          clearCache(cacheKey);

          // Clear unifiedFetch cache key
          const unifiedCacheKey = `orders_theater_${theaterId}_${JSON.stringify(params)}`;
          clearCache(unifiedCacheKey);

        } catch (error) {
          console.warn('Cache clear error:', error);
        }
      }

      // ✅ FIX: Add cache-busting timestamp to params when forcing refresh
      if (forceRefresh || skipCache) {
        params._t = Date.now();
        params._refresh = 'true';
      }

      // ✅ FIX: When forceRefresh, use direct fetch to completely bypass ALL caching layers
      const fetchUrl = `${config.api.baseUrl}/orders/theater/${theaterId}?${new URLSearchParams(params).toString()}`;

      let response;

      if (forceRefresh || skipCache) {
        // ✅ DIRECT FETCH: Completely bypass unifiedFetch cache when forcing refresh
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const headers = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token.trim()}` })
        };


        response = await fetch(fetchUrl, {
          method: 'GET',
          headers,
          signal: abortControllerRef.current?.signal,
          cache: 'no-store' // ✅ Browser-level cache bypass
        });
      } else {
        // Normal fetch with caching
        const uniqueCacheKey = `orders_theater_${theaterId}_${JSON.stringify(params)}`;

        response = await unifiedFetch(fetchUrl, {
          headers: {
            'Accept': 'application/json'
          },
          signal: abortControllerRef.current?.signal
        }, {
          cacheKey: uniqueCacheKey,
          cacheTTL: 60000, // 1 minute
          forceRefresh: false
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const apiData = await response.json();

      // ✅ Handle MVC response format
      const result = {
        items: apiData.data || apiData.orders || apiData.items || [],
        pagination: apiData.pagination || {},
        summary: apiData.summary || {}
      };

      if (!isMountedRef.current) return;

      // result contains: { items: [], pagination: {}, message: '' }
      const ordersData = result.items || [];

      // Extract summary from result if available, or calculate from orders
      const cancelledOrders = ordersData.filter(o => o.status === 'cancelled');
      const cancelledOrderAmount = cancelledOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0);

      const summaryData = result.summary || {
        totalOrders: ordersData.length,
        confirmedOrders: ordersData.filter(o => o.status === 'confirmed').length,
        completedOrders: ordersData.filter(o => o.status === 'completed').length,
        cancelledOrderAmount: cancelledOrderAmount,
        totalRevenue: ordersData.reduce((sum, o) => sum + (o.pricing?.total || 0), 0)
      };

      // 🚀 BATCH ALL STATE UPDATES - Update immediately for instant UI feedback
      setAllOrders(ordersData);
      setOrders(ordersData);
      setSummary(summaryData);

      // Update pagination immediately
      if (result.pagination) {
        setTotalItems(result.pagination.totalItems || 0);
        setTotalPages(result.pagination.totalPages || 1);
        setCurrentPage(result.pagination.current || page);
      } else {
        setTotalItems(ordersData.length);
        setTotalPages(1);
        setCurrentPage(page);
      }

      setInitialLoadDone(true);
      setLoading(false); // ✅ FIX: Set loading false immediately after state updates

      // ✅ FIX: Only cache the response if NOT forcing refresh
      // Don't cache when forceRefresh to ensure fresh data next time
      if (!forceRefresh && !skipCache && page === 1 && !search && status === 'all' && currentPaymentMode === 'all' && currentOrderSource === 'all' && currentDateFilter.type === 'date') {
        const cacheKey = `theaterOrderHistory_${theaterId}_${currentDateFilter.selectedDate}`;
        setCachedData(cacheKey, {
          data: ordersData,
          pagination: result.pagination || {},
          summary: summaryData // ✅ Include summary in cache with cancelledOrderAmount
        });
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      if (error.name === 'AbortError') {
        return; // Don't show error for aborted requests
      }

      console.error('Error loading orders:', error);

      // Handle specific error cases
      if (error.message?.includes('Authentication')) {
        setError('Authentication failed. Please login again.');
      } else if (error.message?.includes('404') || error.message?.includes('not found')) {
        // 404 means no orders found - handle gracefully
        setAllOrders([]);
        setOrders([]);
        setTotalItems(0);
        setTotalPages(0);
        setCurrentPage(1);
        setSummary({ totalOrders: 0, confirmedOrders: 0, completedOrders: 0, cancelledOrderAmount: 0, totalRevenue: 0 });
      } else {
        setError(error.message || 'Failed to load orders');
      }

      setLoading(false);
    }
  }, [theaterId, dateFilter, orderSourceFilter, userType]); // Added orderSourceFilter and userType dependencies

  // Store loadOrdersData in ref for stable access - MUST be set before initial load
  useEffect(() => {
    loadOrdersDataRef.current = loadOrdersData;
  }, [loadOrdersData]);

  // 🚀 OPTIMIZED: Debounced search - Ultra-fast 90ms delay
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loadOrdersDataRef.current) {
        loadOrdersDataRef.current(1, itemsPerPage, query, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter);
      }
    }, 90); // Ultra-fast 90ms delay for near-instant response
  }, [itemsPerPage, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter]);

  // Search handler
  const handleSearch = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  // 🚀 OPTIMIZED: Status filter handler - Use ref for stable access
  const handleStatusFilter = useCallback((e) => {
    const status = e.target.value;
    setStatusFilter(status);
    setCurrentPage(1);
    if (loadOrdersDataRef.current) {
      loadOrdersDataRef.current(1, itemsPerPage, searchTerm, status, dateFilter, paymentModeFilter, orderSourceFilter);
    }
  }, [itemsPerPage, searchTerm, dateFilter, paymentModeFilter, orderSourceFilter]);

  // 🚀 OPTIMIZED: Order source filter handler - Use ref for stable access (only for Theater Admin)
  const handleOrderSourceFilter = useCallback((e) => {
    const orderSource = e.target.value;
    setOrderSourceFilter(orderSource);
    setCurrentPage(1);
    if (loadOrdersDataRef.current) {
      loadOrdersDataRef.current(1, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSource);
    }
  }, [itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter]);

  // 🚀 OPTIMIZED: Payment mode filter handler - Use ref for stable access
  const handlePaymentModeFilter = useCallback((e) => {
    const paymentMode = e.target.value;
    setPaymentModeFilter(paymentMode);
    setCurrentPage(1);
    if (loadOrdersDataRef.current) {
      loadOrdersDataRef.current(1, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentMode, orderSourceFilter);
    }
  }, [itemsPerPage, searchTerm, statusFilter, dateFilter, orderSourceFilter]);

  // 🚀 OPTIMIZED: Date filter handler - Use ref for stable access
  const handleDateFilterApply = useCallback((newDateFilter) => {
    setDateFilter(newDateFilter);
    setCurrentPage(1); // Reset to first page when date filter changes
    if (loadOrdersDataRef.current) {
      loadOrdersDataRef.current(1, itemsPerPage, searchTerm, statusFilter, newDateFilter, paymentModeFilter, orderSourceFilter);
    }
  }, [itemsPerPage, searchTerm, statusFilter, paymentModeFilter, orderSourceFilter]);

  // Excel Download Handler
  const handleDownloadExcel = useCallback(async () => {

    if (!theaterId) {

      showError('Theater ID is missing');
      return;
    }

    // Check if user is authenticated - try both token keys
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');

    if (!token) {

      showError('Please login again to download reports');
      return;
    }

    setDownloadingExcel(true);
    try {
      // Build query parameters based on current filters
      const params = new URLSearchParams();

      // Add source filter based on orderSourceFilter (only for Theater Admin)
      if (userType === 'theater_admin') {
        if (orderSourceFilter === 'all') {
          // Show all order sources: POS, KIOSK, and ONLINE
          params.append('source', 'pos,staff,offline-pos,counter,kiosk,qr_code,online,qr_order,web');
        } else if (orderSourceFilter === 'POS') {
          params.append('source', 'pos,staff,offline-pos,counter');
        } else if (orderSourceFilter === 'KIOSK') {
          params.append('source', 'kiosk');
        } else if (orderSourceFilter === 'ONLINE') {
          params.append('source', 'qr_code,online,qr_order,web');
        }
      } else {
        // Default: POS orders only
        params.append('source', 'pos,staff,offline-pos');
      }

      // Add date filter params - backend expects startDate and endDate
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // For specific date, set start and end of that day
        const selectedDate = new Date(dateFilter.selectedDate);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        params.append('startDate', startOfDay.toISOString());
        params.append('endDate', endOfDay.toISOString());
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        // For month filter, set start and end of month
        const year = dateFilter.year;
        const month = dateFilter.month;
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
        params.append('startDate', startOfMonth.toISOString());
        params.append('endDate', endOfMonth.toISOString());
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        const startDate = new Date(dateFilter.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      // Add status filter
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      // Add payment mode filter
      if (paymentModeFilter && paymentModeFilter !== 'all') {
        params.append('paymentMode', paymentModeFilter);
      }

      const apiUrl = `${config.api.baseUrl}/orders/excel/${theaterId}?${params.toString()}`;

      // For file downloads, use native fetch instead of unifiedFetch to properly handle blob responses
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401 || response.status === 403) {
        showError('Session expired. Please login again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }

      if (response.ok) {
        // Download Excel file
        const blob = await response.blob();

        if (blob.size === 0) {
          showError('No data available to export');
          return;
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = dateFilter.type === 'date' && dateFilter.selectedDate
          ? `_${dateFilter.selectedDate}`
          : dateFilter.type === 'month'
            ? `_${dateFilter.year}-${String(dateFilter.month).padStart(2, '0')}`
            : dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate
              ? `_${dateFilter.startDate}_to_${dateFilter.endDate}`
              : '';
        a.download = `Theater_Orders${dateStr}_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // Try to parse error response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            showError(errorData.error || errorData.message || `Failed to download Excel report (${response.status})`);
          } catch (e) {
            showError(`Failed to download Excel report (${response.status})`);
          }
        } else {
          showError(`Failed to download Excel report (${response.status})`);
        }
      }
    } catch (error) {
      console.error('Excel download error:', error);
      if (error.message) {
        showError(error.message);
      } else {
        showError('Network error. Please check your connection and try again.');
      }
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, statusFilter, paymentModeFilter, dateFilter, orderSourceFilter, userType, showError]);

  // PDF Download Handler
  const handleDownloadPDF = useCallback(async () => {
    if (!theaterId) {
      showError('Theater ID is missing');
      return;
    }

    setDownloadingPDF(true);
    try {
      // Dynamically import jsPDF and autoTable
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      await import('jspdf-autotable');

      // Fetch ALL matching orders for PDF export (bypass pagination)
      let ordersToExport = [];
      try {
        const params = new URLSearchParams();
        params.append('page', '1');
        params.append('limit', '10000'); // Fetch all

        // Add search
        if (searchTerm.trim()) {
          params.append('search', searchTerm.trim());
        }

        // Add status filter
        if (statusFilter !== 'all') {
          params.append('status', statusFilter);
        }

        // Add payment mode filter
        if (paymentModeFilter !== 'all') {
          params.append('paymentMode', paymentModeFilter);
        }

        // Add order source filter (Theater Admin only)
        if (userType === 'theater_admin') {
          if (orderSourceFilter === 'all') {
            params.append('source', 'pos,staff,offline-pos,counter,kiosk,qr_code,online,qr_order,web');
          } else if (orderSourceFilter === 'POS') {
            params.append('source', 'pos,staff,offline-pos,counter');
          } else if (orderSourceFilter === 'KIOSK') {
            params.append('source', 'kiosk');
          } else if (orderSourceFilter === 'ONLINE') {
            params.append('source', 'qr_code,online,qr_order,web');
          }
        } else {
          params.append('source', 'pos,staff,offline-pos,counter');
        }

        // Add date filters
        if (dateFilter.type === 'month') {
          const year = dateFilter.year;
          const month = dateFilter.month;
          const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
          const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
          params.append('startDate', startOfMonth.toISOString());
          params.append('endDate', endOfMonth.toISOString());
        } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
          const selectedDate = new Date(dateFilter.selectedDate);
          const startOfDay = new Date(selectedDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(selectedDate);
          endOfDay.setHours(23, 59, 59, 999);
          params.append('startDate', startOfDay.toISOString());
          params.append('endDate', endOfDay.toISOString());
        } else if (dateFilter.type === 'range') {
          if (dateFilter.startDate) {
            const startDate = new Date(dateFilter.startDate);
            startDate.setHours(0, 0, 0, 0);
            params.append('startDate', startDate.toISOString());
          }
          if (dateFilter.endDate) {
            const endDate = new Date(dateFilter.endDate);
            endDate.setHours(23, 59, 59, 999);
            params.append('endDate', endDate.toISOString());
          }
        }

        const fetchUrl = `${config.api.baseUrl}/orders/theater/${theaterId}?${params.toString()}`;
        const response = await unifiedFetch(fetchUrl, {
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const apiData = await response.json();
          ordersToExport = apiData.data || apiData.orders || [];
        } else {
          // Fallback to currently loaded orders if fetch fails
          ordersToExport = allOrders.length > 0 ? allOrders : orders;
        }
      } catch (err) {
        console.error('Error fetching full order history for PDF:', err);
        ordersToExport = allOrders.length > 0 ? allOrders : orders;
      }

      if (ordersToExport.length === 0) {
        showError('No orders available to export');
        return;
      }

      // Create PDF document
      const doc = new jsPDF('landscape', 'mm', 'a4');

      // Format currency function - use INR prefix instead of ₹ symbol for better PDF compatibility
      const formatCurrency = (val) => {
        return `INR ${val.toFixed(2)}`;
      };

      // Get page width for center alignment (A4 landscape: 297mm)
      const pageWidth = 297;

      // Add title - center aligned
      doc.setFontSize(18);
      doc.setTextColor(139, 92, 246); // Purple color
      const titleText = 'Order History Report';
      const titleWidth = doc.getTextWidth(titleText);
      doc.text(titleText, (pageWidth - titleWidth) / 2, 15);

      // Add metadata - center aligned
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const user = localStorage.getItem('username') || 'User';
      const generatedByText = `Generated By: ${user}`;
      const generatedByWidth = doc.getTextWidth(generatedByText);
      doc.text(generatedByText, (pageWidth - generatedByWidth) / 2, 22);

      const generatedAtText = `Generated At: ${new Date().toLocaleString('en-IN')}`;
      const generatedAtWidth = doc.getTextWidth(generatedAtText);
      doc.text(generatedAtText, (pageWidth - generatedAtWidth) / 2, 27);

      // Add filter info - center aligned
      let filterInfo = 'Filter: ';
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const date = new Date(dateFilter.selectedDate);
        filterInfo += `Date: ${date.toLocaleDateString('en-IN')}`;
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        filterInfo += `Month: ${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        filterInfo += `Date Range: ${new Date(dateFilter.startDate).toLocaleDateString('en-IN')} to ${new Date(dateFilter.endDate).toLocaleDateString('en-IN')}`;
      } else {
        filterInfo += 'All Records';
      }
      if (statusFilter && statusFilter !== 'all') {
        filterInfo += ` | Status: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`;
      }
      if (paymentModeFilter && paymentModeFilter !== 'all') {
        filterInfo += ` | Payment: ${paymentModeFilter.charAt(0).toUpperCase() + paymentModeFilter.slice(1)}`;
      }
      const filterInfoWidth = doc.getTextWidth(filterInfo);
      doc.text(filterInfo, (pageWidth - filterInfoWidth) / 2, 32);

      // Prepare table data - exclude Customer and Phone for Order History
      const tableData = ordersToExport.map((order, index) => {
        const orderDate = new Date(order.createdAt);

        // Format items - keep comma separated, autoTable will wrap
        const items = order.products?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          order.items?.map(i => `${i.productName || i.name || 'Item'} (${i.quantity || 0})`).join(', ') ||
          'N/A';

        const totalQty = order.products?.reduce((sum, i) => sum + (i.quantity || 0), 0) ||
          order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;

        // Calculate amount - handle cancelled orders
        const rawAmount = order.pricing?.total || order.totalAmount || order.total || 0;
        const isCancelled = order.status === 'cancelled';
        // Show negative for cancelled orders
        const amount = isCancelled ? -Math.abs(rawAmount) : rawAmount;

        const paymentMethod = (order.payment?.method || order.paymentMethod || '').toLowerCase();

        // Get staff name
        let staffName = order.staffInfo?.username || order.staffName || order.createdByUsername || 'POS Staff';

        // Format payment amounts
        let cashAmount = 0;
        let upiAmount = 0;
        let cardAmount = 0;

        // Set amounts for columns (visual only)
        if (paymentMethod === 'cash') {
          cashAmount = isCancelled ? -Math.abs(rawAmount) : rawAmount;
        } else if (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') {
          upiAmount = isCancelled ? -Math.abs(rawAmount) : rawAmount;
        } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
          cardAmount = isCancelled ? -Math.abs(rawAmount) : rawAmount;
        } else {
          // Default to UPI if unclear
          upiAmount = isCancelled ? -Math.abs(rawAmount) : rawAmount;
        }

        // Format order number - ensure it's fully visible
        const orderNumber = order.orderNumber || order._id?.toString().slice(-8) || 'N/A';

        // Format status - ensure full text is visible
        const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Pending';

        return [
          index + 1,
          orderNumber,
          orderDate.toLocaleDateString('en-IN'),
          orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          staffName,
          items,
          totalQty,
          formatCurrency(cashAmount),
          formatCurrency(upiAmount),
          formatCurrency(cardAmount),
          formatCurrency(amount),
          statusText
        ];
      });

      // Add table using autoTable with optimized column widths and text wrapping
      doc.autoTable({
        head: [['S.No', 'Order No', 'Date', 'Time', 'Staff Name', 'Items', 'Quantity', 'Cash', 'UPI', 'Card', 'Total', 'Status']],
        body: tableData,
        startY: 38,
        theme: 'striped',
        headStyles: {
          fillColor: [139, 92, 246], // Purple
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak', // Enable text wrapping
          cellWidth: 'wrap', // Auto-wrap text
          halign: 'center' // Center align all text by default
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' }, // S.No
          1: { cellWidth: 38, halign: 'center', overflow: 'linebreak' }, // Order No
          2: { cellWidth: 20, halign: 'center' }, // Date
          3: { cellWidth: 16, halign: 'center' }, // Time
          4: { cellWidth: 26, halign: 'center', overflow: 'linebreak' }, // Staff Name
          5: { cellWidth: 45, halign: 'center', overflow: 'linebreak' }, // Items
          6: { cellWidth: 16, halign: 'center' }, // Quantity
          7: { cellWidth: 28, halign: 'center', overflow: 'visible' }, // Cash
          8: { cellWidth: 28, halign: 'center', overflow: 'visible' }, // UPI
          9: { cellWidth: 28, halign: 'center', overflow: 'visible' }, // Card
          10: { cellWidth: 28, halign: 'center', overflow: 'visible' }, // Total
          11: { cellWidth: 25, halign: 'center', overflow: 'visible' } // Status
        },
        margin: { top: 38, left: 10, right: 10 },
        tableWidth: 'auto', // Auto-calculate to fit page
        showHead: 'everyPage' // Show header on every page
      });

      // Add summary row - Calculate totals EXCLUDING pending/failed orders
      const finalY = doc.lastAutoTable.finalY || 38;

      let totalCash = 0;
      let totalUPI = 0;
      let totalCard = 0;
      let totalRevenue = 0;
      let cancelledAmount = 0;

      ordersToExport.forEach(order => {
        const rawAmount = order.pricing?.total || order.totalAmount || order.total || 0;
        const isCancelled = order.status === 'cancelled';

        // Pending Check: status is pending OR payment is pending/failed (and not manually confirmed)
        const isPending = order.status === 'pending' ||
          (order.payment?.status === 'pending' && order.status !== 'confirmed' && order.status !== 'completed' && order.status !== 'paid' && order.status !== 'served') ||
          order.payment?.status === 'failed';

        const isCountedRevenue = !isCancelled && !isPending;

        if (isCancelled) {
          cancelledAmount += rawAmount;
          return; // Don't add to totals
        }

        if (!isCountedRevenue) {
          return; // Skip pending/failed orders for totals
        }

        // It is confirmed revenue
        totalRevenue += rawAmount;

        const paymentMethod = (order.payment?.method || order.paymentMethod || '').toLowerCase();
        if (paymentMethod === 'cash') {
          totalCash += rawAmount;
        } else if (paymentMethod === 'upi' || paymentMethod === 'online' || paymentMethod === 'razorpay') {
          totalUPI += rawAmount;
        } else if (paymentMethod === 'card' || paymentMethod === 'neft' || paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
          totalCard += rawAmount;
        } else {
          totalUPI += rawAmount;
        }
      });

      doc.autoTable({
        body: [[
          '',
          '',
          '',
          '',
          '',
          'TOTAL (Realized):',
          ordersToExport.length,
          formatCurrency(totalCash),
          formatCurrency(totalUPI),
          formatCurrency(totalCard),
          formatCurrency(totalRevenue),
          ''
        ]],
        startY: finalY + 5,
        theme: 'striped',
        styles: {
          fontSize: 8,
          fontStyle: 'bold',
          fillColor: [255, 235, 156], // Light yellow
          textColor: [0, 0, 0],
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 38, halign: 'center' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 16, halign: 'center' },
          4: { cellWidth: 26, halign: 'center' },
          5: { cellWidth: 45, halign: 'center' },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 28, halign: 'center', overflow: 'visible' },
          8: { cellWidth: 28, halign: 'center', overflow: 'visible' },
          9: { cellWidth: 28, halign: 'center', overflow: 'visible' },
          10: { cellWidth: 28, halign: 'center', overflow: 'visible', fillColor: [209, 250, 229], textColor: [5, 150, 105] }, // Green for total
          11: { cellWidth: 25, halign: 'center', overflow: 'visible' }
        },
        margin: { top: finalY + 5, left: 10, right: 10 },
        tableWidth: 'auto'
      });

      // Add cancelled amount if needed
      if (cancelledAmount > 0) {
        const currentY = doc.lastAutoTable.finalY + 2;
        doc.setFontSize(8);
        doc.setTextColor(220, 38, 38); // Red
        doc.text(`Total Cancelled Amount: -${formatCurrency(cancelledAmount)}`, 287, currentY, { align: 'right' });
      }

      // Generate filename
      const dateStr = dateFilter.type === 'date' && dateFilter.selectedDate
        ? `_${dateFilter.selectedDate}`
        : dateFilter.type === 'month'
          ? `_${dateFilter.year}-${String(dateFilter.month).padStart(2, '0')}`
          : dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate
            ? `_${dateFilter.startDate}_to_${dateFilter.endDate}`
            : '';
      const filename = `Theater_Orders${dateStr}_${Date.now()}.pdf`;

      // Save PDF
      doc.save(filename);
    } catch (error) {
      console.error('PDF download error:', error);
      if (error.message?.includes('jspdf')) {
        showError('PDF library not available. Please refresh the page and try again.');
      } else {
        showError(error.message || 'Failed to generate PDF report');
      }
    } finally {
      setDownloadingPDF(false);
    }
  }, [theaterId, allOrders, orders, statusFilter, paymentModeFilter, dateFilter, showError]);

  // 🚀 OPTIMIZED: Pagination handlers - Use ref for stable access
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    if (loadOrdersDataRef.current) {
      loadOrdersDataRef.current(1, newLimit, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter);
    }
  }, [searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages && loadOrdersDataRef.current) {
      loadOrdersDataRef.current(newPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter);
    }
  }, [totalPages, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter]);

  // View order details - Memoized
  const viewOrder = useCallback((order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  }, []);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'confirmed': return 'status-badge active';
      case 'completed': return 'status-badge completed';
      case 'cancelled': return 'status-badge inactive';
      case 'pending': return 'status-badge pending';
      default: return 'status-badge';
    }
  };

  // Download order as PDF
  const downloadOrderPDF = (order) => {
    try {
      // Format theater address
      const formatTheaterAddress = () => {
        if (!theaterInfo || !theaterInfo.address) return 'N/A';
        const addr = theaterInfo.address;
        const parts = [
          addr.street,
          addr.city,
          addr.state,
          addr.zipCode,
          addr.country
        ].filter(Boolean);
        return parts.join(', ') || 'N/A';
      };

      // Create PDF content as HTML - Thermal Receipt Style
      const pdfContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Bill - ${order.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              max-width: 300px; 
              margin: 0 auto; 
              padding: 10px;
              font-size: 12px;
              line-height: 1.4;
            }
            .receipt-header {
              text-align: center;
              border-bottom: 1px dashed #000;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .business-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .business-info {
              font-size: 11px;
              line-height: 1.5;
            }
            .bill-details {
              border-bottom: 1px dashed #000;
              padding: 8px 0;
              margin-bottom: 8px;
            }
            .bill-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3px;
              font-size: 11px;
            }
            .bill-row strong {
              font-weight: bold;
            }
            .items-header {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              border-bottom: 1px solid #000;
              padding-bottom: 5px;
              margin-bottom: 5px;
            }
            .item-name { flex: 2; }
            .item-qty { flex: 0.5; text-align: center; }
            .item-rate { flex: 1; text-align: right; }
            .item-total { flex: 1; text-align: right; }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
              font-size: 11px;
            }
            .totals-section {
              border-top: 1px dashed #000;
              padding-top: 8px;
              margin-top: 8px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
              font-size: 12px;
            }
            .total-row.grand-total {
              font-weight: bold;
              font-size: 14px;
              border-top: 1px solid #000;
              padding-top: 5px;
              margin-top: 5px;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px dashed #000;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <!-- Business Header -->
          <div class="receipt-header">
            <div class="business-name">${theaterInfo?.name || 'Theater Name'}</div>
            <div class="business-info">
              ${theaterInfo?.address ? formatTheaterAddress() : 'Address'}<br>
              ${theaterInfo?.phone ? 'Phone: ' + theaterInfo.phone : ''}<br>
              ${theaterInfo?.email ? 'Email: ' + theaterInfo.email : ''}<br>
              ${theaterInfo?.gstNumber ? 'GST: ' + theaterInfo.gstNumber + '<br>' : ''}
              ${theaterInfo?.fssaiNumber ? 'FSSAI: ' + theaterInfo.fssaiNumber : ''}
            </div>
          </div>

          <!-- Bill Details -->
          <div class="bill-details">
            <div class="bill-row">
              <span><strong>Invoice ID:</strong> ${order.orderNumber || 'N/A'}</span>
            </div>
            <div class="bill-row">
              <span><strong>Date:</strong> ${formatDate(order.createdAt)}</span>
            </div>
            <div class="bill-row">
              <span><strong>Bill To:</strong> ${order.customerName || order.customerInfo?.name || 'Customer'}</span>
            </div>
          </div>

          <!-- Items Header -->
          <div class="items-table-header">
            <div class="item-name">Item Name</div>
            <div class="items-table-header-center item-qty">Qty</div>
            <div class="items-table-header-right item-rate">Rate</div>
            <div class="items-table-header-right item-total">Total</div>
          </div>

          <!-- Items List -->
          ${(order.products || order.items || []).map(item => {
        const qty = item.quantity || 1;
        const rate = item.unitPrice || item.price || 0;
        const total = item.totalPrice || (qty * rate);
        return `
            <div class="item-row">
              <div class="item-name">${item.productName || item.menuItem?.name || item.name || 'Item'}</div>
              <div class="item-qty">${qty}</div>
              <div class="item-rate">${rate.toFixed(2)}</div>
              <div class="item-total">${total.toFixed(2)}</div>
            </div>
            `;
      }).join('')}

          <!-- Totals Section -->
          <div class="totals-section">
            ${(() => {
          const grandTotal = order.pricing?.total || order.totalAmount || order.total || 0;
          const gstTax = order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0;
          const subtotalWithoutGst = grandTotal - gstTax;
          return subtotalWithoutGst > 0 ? `
            <div class="total-row">
              <span>Subtotal:</span>
              <span>₹${subtotalWithoutGst.toFixed(2)}</span>
            </div>
            ` : '';
        })()}
            
            ${(() => {
          const gstTax = order.pricing?.tax || order.tax || order.pricing?.gst || order.gst || 0;
          if (gstTax <= 0) return '';
          const cgst = gstTax / 2;
          const sgst = gstTax / 2;
          return `
            <div class="total-row">
              <span>CGST:</span>
              <span>₹${cgst.toFixed(2)}</span>
            </div>
            <div class="total-row">
              <span>SGST:</span>
              <span>₹${sgst.toFixed(2)}</span>
            </div>
            `;
        })()}
            
            ${(() => {
          const discount = order.pricing?.totalDiscount || order.pricing?.discount || order.pricing?.discountAmount || order.totalDiscount || order.discount || 0;
          return discount > 0 ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-₹${discount.toFixed(2)}</span>
            </div>
            ` : '';
        })()}
            
            <div class="total-row grand-total">
              <span>Grand Total:</span>
              <span>₹${(order.pricing?.total || order.totalAmount || order.total || 0).toFixed(2)}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>Thank you for your order!</p>
                        <p>By YQPayNow</p>

            <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
        </html>
      `;

      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      printWindow.document.write(pdfContent);
      printWindow.document.close();

      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
        // Close window after printing (optional)
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      };

    } catch (error) {
      // Removed error modal - PDF generation failure logged to console only
    }
  };

  // Reset initial load flag when theaterId changes
  useEffect(() => {
    setInitialLoadDone(false);
    lastLoadKeyRef.current = '';
  }, [theaterId]);

  // 🚀 ULTRA-OPTIMIZED: Initial load - INSTANT CACHE FIRST (< 50ms)
  useEffect(() => {
    if (!theaterId) {
      setLoading(false);
      return;
    }

    const loadKey = `${theaterId}_${dateFilter.selectedDate || 'default'}`;
    if (lastLoadKeyRef.current === loadKey && initialLoadDone) {
      return;
    }

    // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - MUST happen before any async operations
    if (dateFilter.type === 'date' && dateFilter.selectedDate) {
      const cacheKey = `theaterOrderHistory_${theaterId}_${dateFilter.selectedDate}`;
      try {
        const cached = getCachedData(cacheKey, 300000);
        if (cached) {
          // Cached data exists - load INSTANTLY (< 50ms) - SYNCHRONOUS
          let cachedOrders = cached.data || [];
          const cachedPagination = cached.pagination || {};
          const cachedSummary = cached.summary || {};

          if (!Array.isArray(cachedOrders)) {
            cachedOrders = [];
          }

          // INSTANT SYNCHRONOUS state update - NO async, NO loading delay
          // ✅ FIX: Calculate summary from cached orders if summary not available
          const calculatedSummary = cachedSummary.totalOrders !== undefined ? cachedSummary : (() => {
            const cancelledOrders = cachedOrders.filter(o => o.status === 'cancelled');
            const cancelledOrderAmount = cancelledOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0);

            return {
              totalOrders: cachedOrders.length,
              confirmedOrders: cachedOrders.filter(o => o.status === 'confirmed').length,
              completedOrders: cachedOrders.filter(o => o.status === 'completed').length,
              cancelledOrderAmount: cancelledOrderAmount,
              totalRevenue: cachedOrders.reduce((sum, o) => sum + (o.pricing?.total || o.totalAmount || 0), 0)
            };
          })();

          setAllOrders(cachedOrders);
          setOrders(cachedOrders);
          setTotalItems(cachedPagination.totalItems || cachedPagination.total || cachedOrders.length || 0);
          setTotalPages(cachedPagination.totalPages || cachedPagination.pages || 1);
          setCurrentPage(1);
          setSummary(calculatedSummary);
          setLoading(false); // CRITICAL: Set false immediately
          setInitialLoadDone(true);
          lastLoadKeyRef.current = loadKey;

          // Fetch fresh data in background (non-blocking)
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (loadOrdersDataRef.current) {
                loadOrdersDataRef.current(1, 10, '', 'all', dateFilter, 'all', 'all', true, false);
              }
            }, 50); // ✅ FIX: Reduced delay from 200ms to 50ms for faster refresh
          });

          return; // EXIT EARLY - cache loaded, no API call needed
        }
      } catch (error) {
        // Cache check failed silently, continue with API call
      }
    }

    // ✅ FIX: If we have initial cached data, use it and skip loading state
    if (initialCachedData && initialCachedData.orders && initialCachedData.orders.length >= 0) {
      // We already have cached data displayed, just fetch in background
      lastLoadKeyRef.current = loadKey;
      setInitialLoadDone(true);
      setLoading(false); // Ensure loading is false

      // Fetch fresh data in background (non-blocking)
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (loadOrdersDataRef.current) {
            loadOrdersDataRef.current(1, 10, '', 'all', dateFilter, 'all', 'all', true, false);
          }
        }, 200); // Small delay to let UI render with cached data first
      });
      return; // Exit early - data already displayed
    }

    // No cache found - proceed with API call
    lastLoadKeyRef.current = loadKey;
    setLoading(true); // Only set loading if no cache

    let isMounted = true;
    let safetyTimer = null;

    // ✅ FIX: Reduced safety timeout from 5s to 3s for faster failure detection
    safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 3000);

    // Execute API call
    (async () => {
      try {
        if (loadOrdersDataRef.current) {
          await loadOrdersDataRef.current(1, 10, '', 'all', dateFilter, 'all', 'all', false, true);
        } else {
          // Fallback direct API call if ref not set
          const params = new URLSearchParams({
            page: 1,
            limit: 10,
            theaterId: theaterId,
            _t: Date.now()
          });
          // Backend expects startDate and endDate, not a single date parameter
          if (dateFilter.type === 'date' && dateFilter.selectedDate) {
            const selectedDate = new Date(dateFilter.selectedDate);
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            params.append('startDate', startOfDay.toISOString());
            params.append('endDate', endOfDay.toISOString());
          } else if (dateFilter.type === 'month') {
            const year = dateFilter.year;
            const month = dateFilter.month;
            const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
            const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
            params.append('startDate', startOfMonth.toISOString());
            params.append('endDate', endOfMonth.toISOString());
          } else if (dateFilter.type === 'range') {
            if (dateFilter.startDate) {
              const startDate = new Date(dateFilter.startDate);
              startDate.setHours(0, 0, 0, 0);
              params.append('startDate', startDate.toISOString());
            }
            if (dateFilter.endDate) {
              const endDate = new Date(dateFilter.endDate);
              endDate.setHours(23, 59, 59, 999);
              params.append('endDate', endDate.toISOString());
            }
          }

          const response = await unifiedFetch(`${config.api.baseUrl}/orders/theater-nested?${params.toString()}`, {
            headers: {
              'Accept': 'application/json'
              // Token is automatically added by unifiedFetch
            }
          }, {
            cacheKey: `orders_nested_${theaterId}_${dateFilter.type}_${dateFilter.selectedDate || dateFilter.startDate || 'all'}`,
            cacheTTL: 300000, // 5 minutes
            forceRefresh: skipCache || forceRefresh
          });

          if (response.ok && isMounted) {
            const data = await response.json();
            if (data.success) {
              const ordersData = data.data || [];
              const summaryData = data.summary || {};

              setAllOrders(ordersData);
              setOrders(ordersData);
              setSummary(summaryData);
              if (data.pagination) {
                setTotalItems(data.pagination.total || 0);
                setTotalPages(data.pagination.pages || 0);
                setCurrentPage(1);
              }
            }
          }
        }

        if (isMounted) {
          setInitialLoadDone(true);
          setLoading(false);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      } catch (error) {
        if (isMounted) {
          setLoading(false);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [theaterId, dateFilter.type, dateFilter.selectedDate, initialLoadDone]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // 🚀 AUTO-REFRESH: Refresh data when page becomes visible or user returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && theaterId && loadOrdersDataRef.current) {
        // Page became visible - refresh data to show new orders
        loadOrdersDataRef.current(currentPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter, true, false);
      }
    };

    const handleFocus = () => {
      if (theaterId && loadOrdersDataRef.current) {
        // Window gained focus - refresh data
        loadOrdersDataRef.current(currentPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter, true, false);
      }
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      // Cleanup event listeners
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [theaterId, currentPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter]);

  // 🚀 PERIODIC AUTO-REFRESH: Refresh data every 30 seconds when on default filters
  useEffect(() => {
    if (!theaterId) return;

    // Only auto-refresh if user is on default filters (no active search/filtering)
    const shouldAutoRefresh = searchTerm === '' && statusFilter === 'all' && paymentModeFilter === 'all' && orderSourceFilter === 'all';

    if (!shouldAutoRefresh) return;

    const refreshInterval = setInterval(() => {
      if (loadOrdersDataRef.current && document.visibilityState === 'visible') {
        // Silent refresh - skip cache to get fresh data, but don't show loading state
        loadOrdersDataRef.current(currentPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter, true, false);
      }
    }, 10000); // ✅ FIX: Reduced from 30s to 10s for faster updates

    return () => {
      clearInterval(refreshInterval);
    };
  }, [theaterId, currentPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter]);

  // ✅ FIX: IMMEDIATE REFRESH - Listen for order update events (from ProductCancelPage, etc.)
  useEffect(() => {
    if (!theaterId) return;

    const handleOrderUpdate = (event) => {
      const { theaterId: eventTheaterId, type } = event.detail || {};

      // Only refresh if the event is for this theater
      if (eventTheaterId && eventTheaterId === theaterId) {

        // ✅ FIX: Immediately clear caches and refresh - no delays
        // Clear caches first for immediate effect
        try {
          clearCachePattern(`theaterOrderHistory_${eventTheaterId}`);
          clearCachePattern(`orders_nested_${eventTheaterId}`);
          clearCachePattern(`api_orders_theater_${eventTheaterId}`);
          clearCachePattern(`orders_theater_${eventTheaterId}`);
          clearCachePattern(`/orders/theater/${eventTheaterId}`);
        } catch (e) {
          console.warn('Error clearing cache:', e);
        }

        // Immediately refresh orders - skip cache to get latest data
        // Use requestAnimationFrame for immediate execution without blocking UI
        if (loadOrdersDataRef.current && isMountedRef.current) {
          loadOrdersDataRef.current(
            currentPage,
            itemsPerPage,
            searchTerm,
            statusFilter,
            dateFilter,
            paymentModeFilter,
            orderSourceFilter,
            true, // Skip cache
            true  // Force refresh
          );
        }
      }
    };

    // Listen for custom order update events
    window.addEventListener('orderUpdated', handleOrderUpdate);

    // Also listen for storage events (for cross-tab updates)
    const handleStorageChange = (e) => {
      // Check if order cache was cleared or order was updated
      if (e.key && (
        e.key.includes(`order_${theaterId}`) ||
        e.key.includes(`theaterOrderHistory_${theaterId}`) ||
        e.key.includes(`orders_nested_${theaterId}`)
      )) {
        // ✅ FIX: Clear caches immediately and refresh without delay
        try {
          clearCachePattern(`theaterOrderHistory_${theaterId}`);
          clearCachePattern(`orders_nested_${theaterId}`);
          clearCachePattern(`api_orders_theater_${theaterId}`);
          clearCachePattern(`orders_theater_${theaterId}`);
        } catch (e) {
          console.warn('Error clearing cache:', e);
        }

        // Immediate refresh without delay
        if (loadOrdersDataRef.current && isMountedRef.current) {
          loadOrdersDataRef.current(
            currentPage,
            itemsPerPage,
            searchTerm,
            statusFilter,
            dateFilter,
            paymentModeFilter,
            orderSourceFilter,
            true, // Skip cache
            true  // Force refresh
          );
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('orderUpdated', handleOrderUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [theaterId, currentPage, itemsPerPage, searchTerm, statusFilter, dateFilter, paymentModeFilter, orderSourceFilter]);

  // Memoized skeleton component for loading states
  const TableRowSkeleton = useMemo(() => () => (
    <tr className="skeleton-row">
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  ), []);

  // 🚀 OPTIMIZED: Memoized Order Table Row Component
  const OrderRow = React.memo(({ order, index, currentPage, itemsPerPage, onView, onDownloadPDF }) => {
    const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;

    return (
      <tr key={order._id}>
        <td className="serial-number">{serialNumber}</td>
        <td className="order-number-cell">
          <div className="order-info">
            <div className="order-number">{order.orderNumber}</div>
          </div>
        </td>
        <td className="items-count">
          {(order.products?.length || order.items?.length || 0)} items
        </td>
        <td className="amount-cell">
          <div className="amount">{formatCurrency(order.pricing?.total ?? order.totalAmount ?? 0)}</div>
        </td>
        <td className="payment-mode-cell">
          <div className="payment-mode">{order.payment?.method ? order.payment.method.charAt(0).toUpperCase() + order.payment.method.slice(1) : 'N/A'}</div>
        </td>
        <td className="payment-status-cell">
          {order.payment?.method === 'cash' || order.payment?.method === 'cod' ? (
            <span className="badge badge-success">Success</span>
          ) : (
            <span className={order.payment?.status === 'paid' ? 'badge badge-success' : 'badge badge-pending'}>
              {order.payment?.status === 'paid' ? 'Success' : 'Pending'}
            </span>
          )}
        </td>
        <td className="status-cell">
          <span className={getStatusBadgeClass(order.status)}>
            {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Unknown'}
          </span>
        </td>
        <td className="date-cell">
          <div className="order-date">{formatDate(order.orderDate || order.createdAt)}</div>
        </td>
        <td className="action-cell">
          <div className="action-buttons action-buttons-flex">
            <button
              className="action-btn view-btn btn-no-margin"
              onClick={() => onView(order)}
              title="View Details"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              </svg>
            </button>
            <button
              className="action-btn download-btn btn-no-margin"
              onClick={() => onDownloadPDF(order)}
              title="Download PDF"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison function for better performance
    return (
      prevProps.order._id === nextProps.order._id &&
      prevProps.index === nextProps.index &&
      prevProps.currentPage === nextProps.currentPage &&
      prevProps.itemsPerPage === nextProps.itemsPerPage &&
      prevProps.order.orderNumber === nextProps.order.orderNumber &&
      prevProps.order.status === nextProps.order.status &&
      prevProps.order.pricing?.total === nextProps.order.pricing?.total &&
      prevProps.order.payment?.status === nextProps.order.payment?.status
    );
  });

  OrderRow.displayName = 'OrderRow';

  return (
    <ErrorBoundary>
      <style>
        {`
          .calendar-container { margin: 20px 0; }
          .calendar-header { text-align: center; margin-bottom: 15px; color: #8B5CF6; }
          .calendar-grid { max-width: 300px; margin: 0 auto; }
          .calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 10px; font-weight: bold; color: #666; text-align: center; }
          .calendar-weekdays > div { padding: 5px; }
          .calendar-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
          .calendar-day { padding: 8px; text-align: center; border-radius: 4px; cursor: pointer; border: 1px solid #e0e0e0; background: #fff; }
          .calendar-day.empty { cursor: default; border: none; background: transparent; }
          .calendar-day.clickable:hover { background: #f3f0ff; border-color: #8B5CF6; }
          .calendar-day.selected { background: #8B5CF6; color: white; border-color: #8B5CF6; }
        `}
      </style>
      <TheaterLayout pageTitle="Order History" currentPage="order-history">
        <PageContainer
          title="Order History"
          headerButton={
            <button
              className="submit-btn date-filter-btn"
              onClick={() => setShowDateFilterModal(true)}
            >
              <span className="btn-icon">📅</span>
              {dateFilter.type === 'all' ? 'Date Filter' :
                dateFilter.type === 'date' ? (() => {
                  const date = new Date(dateFilter.selectedDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const selectedDate = new Date(date);
                  selectedDate.setHours(0, 0, 0, 0);
                  const isToday = selectedDate.getTime() === today.getTime();

                  const day = String(date.getDate()).padStart(2, '0');
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const year = date.getFullYear();
                  return isToday ? `TODAY (${day}/${month}/${year})` : `${day}/${month}/${year}`;
                })() :
                  dateFilter.type === 'month' ? `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
                    dateFilter.type === 'range' ? (() => {
                      const start = new Date(dateFilter.startDate);
                      const end = new Date(dateFilter.endDate);
                      const formatDate = (d) => {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        return `${day}/${month}/${year}`;
                      };
                      return `${formatDate(start)} - ${formatDate(end)}`;
                    })() :
                      'Date Filter'}
            </button>
          }
        >

          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.totalOrders || 0}</div>
              <div className="stat-label">Total Orders</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.confirmedOrders || 0}</div>
              <div className="stat-label">Confirmed Orders</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{formatCurrency(summary.cancelledOrderAmount || 0)}</div>
              <div className="stat-label">Cancel Order Amount</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{formatCurrency(summary.totalRevenue || 0)}</div>
              <div className="stat-label">Total Revenue</div>
            </div>
          </div>

          {/* Enhanced Filters Section matching TheaterList */}
          <div className="theater-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search orders by order number or customer name..."
                value={searchTerm}
                onChange={handleSearch}
                className="search-input"
              />
            </div>
            <div className="filter-controls">
              <select
                value={statusFilter}
                onChange={handleStatusFilter}
                className="status-filter"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={paymentModeFilter}
                onChange={handlePaymentModeFilter}
                className="status-filter"
              >
                <option value="all">All Payment Modes</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online">Online</option>
                <option value="netbanking">Net Banking</option>
              </select>
              {/* Order Source Filter - Only visible for Theater Admin */}
              {userType === 'theater_admin' && (
                <select
                  value={orderSourceFilter}
                  onChange={handleOrderSourceFilter}
                  className="status-filter"
                >
                  <option value="all">All</option>
                  <option value="POS">POS</option>
                  <option value="KIOSK">KIOSK</option>
                  <option value="ONLINE">ONLINE</option>
                </select>
              )}
              <button
                type="button"
                className={`submit-btn excel-download-btn btn-excel ${downloadingExcel || loading ? 'disabled' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  handleDownloadExcel();
                }}
                disabled={downloadingExcel || loading}
              >
                <span className="btn-icon">{downloadingExcel ? '⏳' : '📊'}</span>
                {downloadingExcel ? 'Downloading...' : 'EXCEL'}
              </button>
              <button
                type="button"
                className={`submit-btn pdf-download-btn btn-pdf ${downloadingPDF || loading ? 'disabled' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  handleDownloadPDF();
                }}
                disabled={downloadingPDF || loading}
              >
                <span className="btn-icon">{downloadingPDF ? '⏳' : '📄'}</span>
                {downloadingPDF ? 'Downloading...' : 'PDF'}
              </button>
              <div className="items-per-page">
                <label>Items per page:</label>
                <select value={itemsPerPage} onChange={handleItemsPerPageChange} className="items-select">
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
                  <th className="sno-cell">S.No</th>
                  <th className="name-cell">Order Number</th>
                  <th className="status-cell">Items</th>
                  <th className="status-cell">Amount</th>
                  <th className="status-cell">Payment Mode</th>
                  <th className="status-cell">Payment Status</th>
                  <th className="status-cell">Status</th>
                  <th className="status-cell">Date</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && orders.length === 0 ? (
                  // 🚀 INSTANT: Show skeleton instead of spinner
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className="skeleton-row">
                      <td><div className="skeleton-box skeleton-box-30" /></td>
                      <td><div className="skeleton-box skeleton-box-120" /></td>
                      <td><div className="skeleton-box skeleton-box-100" /></td>
                      <td><div className="skeleton-box skeleton-box-60" /></td>
                      <td><div className="skeleton-box skeleton-box-80" /></td>
                      <td><div className="skeleton-box skeleton-box-100" /></td>
                      <td><div className="skeleton-box skeleton-box-80" /></td>
                      <td><div className="skeleton-box skeleton-box-80" /></td>
                      <td><div className="skeleton-box skeleton-box-100" /></td>
                      <td><div className="skeleton-box skeleton-box-80" /></td>
                    </tr>
                  ))
                ) : orders.length > 0 ? (
                  orders.map((order, index) => (
                    <OrderRow
                      key={order._id}
                      order={order}
                      index={index}
                      currentPage={currentPage}
                      itemsPerPage={itemsPerPage}
                      onView={viewOrder}
                      onDownloadPDF={downloadOrderPDF}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="empty-cell">
                      <i className="fas fa-shopping-cart fa-3x"></i>
                      <h3>No Orders Found</h3>
                      <p>There are no orders available for viewing at the moment.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination - Always Show (Global Component) */}
          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              itemType="orders"
            />
          )}

          {/* View Modal - Thermal Receipt Style */}
          {showViewModal && selectedOrder && (
            <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
              <div className="modal-content modal-content-bill" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header modal-header-bill">
                  <h2 className="modal-title-bill">Bill - {selectedOrder.orderNumber}</h2>
                  <button
                    className="close-btn modal-close-btn-bill"
                    onClick={() => setShowViewModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>

                <div className="modal-body modal-body-bill">
                  {/* Business Header */}
                  <div className="bill-header">
                    <div className="bill-header-title">{theaterInfo?.name || 'Theater Name'}</div>
                    <div className="bill-header-subtitle">
                      {theaterInfo?.address ? (() => {
                        const addr = theaterInfo.address;
                        const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
                        return parts.join(', ') || 'Address';
                      })() : 'Address'}<br />
                      {theaterInfo?.phone ? `Phone: ${theaterInfo.phone}` : ''}<br />
                      {theaterInfo?.email ? `Email: ${theaterInfo.email}` : ''}<br />
                      {theaterInfo?.gstNumber ? `GST: ${theaterInfo.gstNumber}` : ''}
                      {theaterInfo?.gstNumber && theaterInfo?.fssaiNumber ? <br /> : null}
                      {theaterInfo?.fssaiNumber ? `FSSAI: ${theaterInfo.fssaiNumber}` : ''}
                    </div>
                  </div>

                  {/* Bill Details */}
                  <div className="bill-info-section">
                    <div className="bill-info-row">
                      <span className="bill-info-label">Invoice ID:</span>
                      <span>{selectedOrder.orderNumber || 'N/A'}</span>
                    </div>
                    <div className="bill-info-row">
                      <span className="bill-info-label">Date:</span>
                      <span>{formatDate(selectedOrder.createdAt)}</span>
                    </div>
                    <div className="bill-info-row">
                      <span className="bill-info-label">Bill To:</span>
                      <span>{selectedOrder.customerName || selectedOrder.customerInfo?.name || 'Customer'}</span>
                    </div>
                    <div className="bill-info-row-last">
                      <span className="bill-info-label">Payment:</span>
                      <span>{selectedOrder.payment?.method ? selectedOrder.payment.method.toUpperCase() : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Items Header */}
                  <div className="items-table-header">
                    <div className="item-name">Item Name</div>
                    <div className="items-table-header-center item-qty">Qty</div>
                    <div className="items-table-header-right item-rate">Rate</div>
                    <div className="items-table-header-right item-total">Total</div>
                  </div>

                  {/* Items List */}
                  {(selectedOrder.products || selectedOrder.items || []).map((item, index) => {
                    const qty = item.quantity || 1;
                    const rate = item.unitPrice || item.price || 0;
                    const total = item.totalPrice || (qty * rate);
                    return (
                      <div key={index} className="item-row">
                        <div className="item-name">{item.productName || item.menuItem?.name || item.name || 'Item'}</div>
                        <div className="item-qty">{qty}</div>
                        <div className="item-rate">₹{rate.toFixed(2)}</div>
                        <div className="item-total">₹{total.toFixed(2)}</div>
                      </div>
                    );
                  })}

                  {/* Totals Section */}
                  <div className="summary-section">
                    {(() => {
                      const grandTotal = selectedOrder.pricing?.total || selectedOrder.totalAmount || selectedOrder.total || 0;
                      const gstTax = selectedOrder.pricing?.tax || selectedOrder.tax || selectedOrder.pricing?.gst || selectedOrder.gst || 0;
                      const subtotalWithoutGst = grandTotal - gstTax;
                      // Split GST into CGST and SGST (50/50)
                      const cgst = gstTax / 2;
                      const sgst = gstTax / 2;

                      return (
                        <>
                          {subtotalWithoutGst > 0 && (
                            <div className="summary-row">
                              <span>Subtotal:</span>
                              <span>₹{subtotalWithoutGst.toFixed(2)}</span>
                            </div>
                          )}

                          {gstTax > 0 && (
                            <>
                              <div className="summary-row">
                                <span>CGST:</span>
                                <span>₹{cgst.toFixed(2)}</span>
                              </div>
                              <div className="summary-row">
                                <span>SGST:</span>
                                <span>₹{sgst.toFixed(2)}</span>
                              </div>
                            </>
                          )}

                          {(selectedOrder.pricing?.totalDiscount || selectedOrder.pricing?.discount || selectedOrder.pricing?.discountAmount || selectedOrder.totalDiscount || selectedOrder.discount) > 0 && (
                            <div className="summary-row">
                              <span>Discount:</span>
                              <span>-₹{(selectedOrder.pricing?.totalDiscount || selectedOrder.pricing?.discount || selectedOrder.pricing?.discountAmount || selectedOrder.totalDiscount || selectedOrder.discount || 0).toFixed(2)}</span>
                            </div>
                          )}

                          <div className="summary-total">
                            <span>Grand Total:</span>
                            <span>₹{grandTotal.toFixed(2)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="bill-footer">
                    <p className="bill-footer-thanks">Thank you for your order!</p>
                    <p className="bill-footer-date">Generated on {new Date().toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Date Filter Modal */}
          <DateFilter
            isOpen={showDateFilterModal}
            onClose={() => setShowDateFilterModal(false)}
            initialFilter={dateFilter}
            onApply={handleDateFilterApply}
          />

        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
});

TheaterOrderHistory.displayName = 'TheaterOrderHistory';

export default TheaterOrderHistory;