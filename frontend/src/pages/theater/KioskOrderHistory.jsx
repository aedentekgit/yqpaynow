import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import DateFilter from '@components/DateFilter';
import Pagination from '@components/Pagination';
import config from '@config';
import { clearCachePattern, getCachedData, setCachedData } from '@utils/cacheUtils'; // 🚀 Cache utilities
import { getTodayLocalDate } from '@utils/dateUtils';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/AddTheater.css';
import '@styles/pages/theater/KioskOrderHistory.css'; // Extracted inline styles
import '@styles/components/GlobalButtons.css'; // Global button styles - Must load LAST to override
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



const KioskOrderHistory = () => {
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal();

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('KioskOrderHistory');
  
  // 🚀 INSTANT: Check cache synchronously on initialization
  const initialCachedData = (() => {
    if (!theaterId) return null;
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const selectedDate = `${year}-${month}-${day}`;
      
      const cacheKey = `kioskOrderHistory_${theaterId}_${selectedDate}`;
      const cached = getCachedData(cacheKey, 300000); // 5-minute cache
      // ✅ FIX: Check for cached.orders (actual structure) not cached.data
      if (cached && (cached.orders || cached.data)) {
        return {
          orders: cached.orders || cached.data || [],
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
  // ✅ FIX: Only set initialLoadDone to true if we actually have cached orders
  const [initialLoadDone, setInitialLoadDone] = useState(!!(initialCachedData && initialCachedData.orders && initialCachedData.orders.length >= 0));
  const lastLoadKeyRef = useRef(''); // Track last load to prevent duplicate loads
  const isMountedRef = useRef(true); // Track component mount state
  const fetchOrdersRef = useRef(null); // Ref to fetchOrders function
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [theaterInfo, setTheaterInfo] = useState(null); // Theater information for receipts
  const [summary, setSummary] = useState(initialCachedData?.summary || {
    totalOrders: 0,
    confirmedOrders: 0,
    completedOrders: 0,
    totalRevenue: 0
  });

  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentModeFilter, setPaymentModeFilter] = useState('all');
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
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Abort controller ref for cleanup
  const abortControllerRef = useRef(null);

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
        cacheKey: `theater_${theaterId}`,
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

  // Fetch orders from backend
  const fetchOrders = useCallback(async (forceRefresh = false) => {
    try {
      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // 🚀 CLEAR CACHE: Force fresh fetch to get updated filtered data
      if (forceRefresh) {
        clearCachePattern(`/orders/theater/${theaterId}`);
      }

      setLoading(true);

      // Build URL with optional cache-busting parameter and source filter
      const params = new URLSearchParams();
      // ✅ FIX: Add source filter to ONLY get kiosk orders from backend
      params.append('source', 'kiosk'); // Only kiosk orders, exclude POS orders
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }
      const queryString = params.toString();
      const url = `${config.api.baseUrl}/orders/theater/${theaterId}?${queryString}`;

      // ✅ FIX: Backend now filters by source='kiosk', so we only get kiosk orders
      const response = await unifiedFetch(url, {
        signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `orders_kiosk_${theaterId}_${queryString}`,
        cacheTTL: forceRefresh ? 0 : 300000 // 5 minutes if not force refresh
      });

      // ✅ FIX: Parse JSON and check response (same logic as ViewCart and other components)
      // unifiedFetch returns a modified response, so check backend success flag first
      let data;
      try {
        // ✅ FIX: Ensure response exists and has json method
        if (!response || typeof response.json !== 'function') {
          throw new Error('Invalid response: response object is missing or does not have a json method');
        }
        data = await response.json();
      } catch (parseError) {
        console.error('❌ [KioskOrderHistory] Failed to parse response:', parseError);
        // If response indicates an error, provide better error message
        if (!response.ok || (response.status && response.status >= 400)) {
          const status = response.status || 'unknown';
          if (status === 404) {
            // No orders found - this is OK
            setOrders([]);
            setAllOrders([]);
            setSummary({
              totalOrders: 0,
              confirmedOrders: 0,
              completedOrders: 0,
              totalRevenue: 0
            });
            setLoading(false);
            return;
          }
          throw new Error(`HTTP error! status: ${status}`);
        }
        throw new Error(`Failed to parse response: ${parseError.message}`);
      }

      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      if (data && data.success === true) {
        // Handle multiple possible response structures
        const ordersArray = Array.isArray(data.orders)
          ? data.orders
          : (Array.isArray(data.data) ? data.data : (Array.isArray(data.data?.orders) ? data.data.orders : []));

        if (ordersArray.length >= 0) {
        
        // Filter to show ONLY kiosk orders (source="kiosk")
        // EXCLUDE POS orders (source="pos") and QR code orders (source="qr_code")
        const kioskOrders = ordersArray.filter(order => {
          const source = order.source?.toLowerCase() || '';
          
          // ✅ CRITICAL: Only include orders with source='kiosk'
          // EXCLUDE 'pos' orders (POS bills) - they should NOT appear in kiosk order history
          if (source === 'kiosk') {
            return true;
          }
          
          // Exclude everything else (pos, qr_code, online, undefined, etc.)
          return false;
        });

        
        // Log all unique source values to debug
        const uniqueSources = [...new Set(ordersArray.map(o => o.source || 'undefined'))];

        setAllOrders(kioskOrders);
        setOrders(kioskOrders);

        // Calculate summary statistics
        const newSummary = {
          totalOrders: kioskOrders.length,
          confirmedOrders: kioskOrders.filter(o => o.status === 'confirmed').length,
          completedOrders: kioskOrders.filter(o => o.status === 'completed').length,
          totalRevenue: kioskOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
        };
        setSummary(newSummary);
        
        // 🚀 Cache the data for instant loading next time
        if (isMountedRef.current) {
          try {
            // Build cache key
            const cacheKey = (() => {
              if (dateFilter.type === 'date' && dateFilter.selectedDate) {
                return `kioskOrderHistory_${theaterId}_${dateFilter.selectedDate}`;
              } else if (dateFilter.type === 'month') {
                return `kioskOrderHistory_${theaterId}_month_${dateFilter.year}_${dateFilter.month}`;
              } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
                return `kioskOrderHistory_${theaterId}_range_${dateFilter.startDate}_${dateFilter.endDate}`;
              }
              return `kioskOrderHistory_${theaterId}_all`;
            })();
            
            setCachedData(cacheKey, {
              orders: kioskOrders,
              summary: newSummary
            });
          } catch (cacheError) {
            console.warn('Cache write error:', cacheError);
          }
        }
        
        setInitialLoadDone(true);
        setLoading(false);
        } else {
          // Empty orders array but success=true - this is OK
          setOrders([]);
          setAllOrders([]);
          setSummary({
            totalOrders: 0,
            confirmedOrders: 0,
            completedOrders: 0,
            totalRevenue: 0
          });
          setLoading(false);
        }
      } else if (data && data.success === false) {
        // Backend explicitly returned success: false
        console.warn('API returned success=false:', data.message || data.error);
        setOrders([]);
        setAllOrders([]);
        setSummary({
          totalOrders: 0,
          confirmedOrders: 0,
          completedOrders: 0,
          totalRevenue: 0
        });
        setLoading(false);
      } else if (!response.ok || (response.status && response.status >= 400)) {
        // HTTP error status but no success flag - treat as error
        const status = response.status || 'unknown';
        if (status === 404) {
          // No orders found - this is OK
          setOrders([]);
          setAllOrders([]);
          setSummary({
            totalOrders: 0,
            confirmedOrders: 0,
            completedOrders: 0,
            totalRevenue: 0
          });
          setLoading(false);
          return;
        }
        throw new Error(`HTTP error! status: ${status}`);
      } else {
        // No success flag but HTTP status is OK - assume success with empty data
        console.warn('⚠️ [KioskOrderHistory] No success flag in response, assuming success with empty data:', data);
        setOrders([]);
        setAllOrders([]);
        setSummary({
          totalOrders: 0,
          confirmedOrders: 0,
          completedOrders: 0,
          totalRevenue: 0
        });
        setLoading(false);
      }

    } catch (error) {
      // Check if request was aborted
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return; // Don't show error or clear data for aborted requests
      }

      // Check if component is still mounted
      if (!isMountedRef.current) {
        return; // Component unmounted, don't update state
      }

      console.error('Error fetching kiosk orders:', error);
      
      // ✅ FIX: Don't clear existing data on error - keep what we have
      // Only clear if this is the initial load and we have no data
      const isInitialLoad = !initialLoadDone && allOrders.length === 0;
      
      if (isInitialLoad) {
        // First load failed - show error and clear
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
        showError('Failed to load kiosk orders: ' + errorMessage);
        setOrders([]);
        setAllOrders([]);
        setSummary({
          totalOrders: 0,
          confirmedOrders: 0,
          completedOrders: 0,
          totalRevenue: 0
        });
      } else {
        // Background refresh or subsequent fetch failed - keep existing data
        console.warn('API fetch failed, but keeping existing orders:', error.message);
        // Don't show error to user for background refreshes - it's not critical
      }
    } finally {
      setLoading(false);
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, [theaterId, dateFilter, showError, initialLoadDone]);

  // Store fetchOrders in ref for stable access
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 🚀 ULTRA-OPTIMIZED: Initial load - INSTANT CACHE FIRST (< 50ms)
  useEffect(() => {
    if (!theaterId) {
      setLoading(false);
      return;
    }

    const loadKey = `${theaterId}_${dateFilter.type}_${dateFilter.selectedDate || dateFilter.startDate || 'default'}`;
    
    // ✅ FIX: If we already loaded this exact data and have initial data, skip
    if (lastLoadKeyRef.current === loadKey && initialLoadDone && allOrders.length >= 0) {
      return; // Already loaded this exact data
    }

    // ✅ FIX: If we have initial cached data, use it INSTANTLY and skip useEffect logic
    if (initialCachedData && initialCachedData.orders && allOrders.length === 0 && !initialLoadDone) {
      // We have cached data from initialization - it's already in state
      // Just mark as loaded and fetch fresh data in background
      setInitialLoadDone(true);
      lastLoadKeyRef.current = loadKey;
      setLoading(false); // Ensure loading is false
      
      // Fetch fresh data in background (non-blocking)
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (isMountedRef.current && fetchOrdersRef.current) {
            fetchOrdersRef.current(true, true); // Force refresh, skip cache check
          }
        }, 200); // Small delay to let UI render with cached data
      });
      return; // EXIT EARLY - use initial cached data
    }

    // Reset flags when theaterId changes (but not if we have cached data)
    const prevTheaterId = lastLoadKeyRef.current.split('_')[0];
    if (theaterId !== prevTheaterId && !initialCachedData) {
      lastLoadKeyRef.current = '';
      setInitialLoadDone(false);
    }

    // 🚀 INSTANT SYNCHRONOUS CACHE CHECK - MUST happen before any async operations
    if (dateFilter.type === 'date' && dateFilter.selectedDate) {
      const cacheKey = `kioskOrderHistory_${theaterId}_${dateFilter.selectedDate}`;
      try {
        const cached = getCachedData(cacheKey, 300000);
        // ✅ FIX: Check for both cached.orders and cached.data structures
        const cachedOrders = Array.isArray(cached?.orders) ? cached.orders : (Array.isArray(cached?.data) ? cached.data : []);
        
        if (cached && cachedOrders.length >= 0) {
          // Cached data exists - load INSTANTLY (< 50ms) - SYNCHRONOUS
          const cachedSummary = cached.summary || {
            totalOrders: cachedOrders.length,
            confirmedOrders: cachedOrders.filter(o => o.status === 'confirmed').length,
            completedOrders: cachedOrders.filter(o => o.status === 'completed').length,
            totalRevenue: cachedOrders.reduce((sum, o) => sum + (o.pricing?.total ?? o.totalAmount ?? 0), 0)
          };
          
          // ✅ FIX: INSTANT SYNCHRONOUS state update - Batch all updates
          setAllOrders(cachedOrders);
          setOrders(cachedOrders);
          setSummary(cachedSummary);
          setLoading(false); // CRITICAL: Set false immediately
          setInitialLoadDone(true);
          lastLoadKeyRef.current = loadKey;
          
          // Fetch fresh data in background (non-blocking)
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (isMountedRef.current && fetchOrdersRef.current) {
                fetchOrdersRef.current(true, true); // Force refresh, skip cache check
              }
            }, 300); // Small delay to let UI render with cached data first
          });
          
          return; // EXIT EARLY - cache loaded, no API call needed
        }
      } catch (error) {
        // Cache check failed silently, continue with API call
        console.warn('Cache check failed:', error);
      }
    }

    // ✅ FIX: Only proceed with API call if we don't have any cached data
    // If we have initial cached data, don't set loading or make API call
    if (initialCachedData && initialCachedData.orders && initialCachedData.orders.length > 0) {
      // We already have cached data displayed, just fetch in background
      lastLoadKeyRef.current = loadKey;
      return; // Exit - data already displayed
    }

    // No cache found - proceed with API call
    lastLoadKeyRef.current = loadKey;
    setLoading(true); // Only set loading if no cache

    let isMounted = true;
    let safetyTimer = null;

    // Safety timeout to prevent infinite loading
    safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 5000);

    // Execute API call
    (async () => {
      try {
        if (fetchOrdersRef.current) {
          await fetchOrdersRef.current(true, false); // Force refresh, but check cache in function
        }
      } catch (error) {
        console.error('Error in initial fetch:', error);
      } finally {
        if (safetyTimer) clearTimeout(safetyTimer);
      }
    })();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theaterId, dateFilter]); // Re-fetch when theaterId or dateFilter changes

  // Format currency helper
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }, []);

  // Format date helper
  const formatDateTime = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Invalid Date';
    }
  }, []);

  // Get status badge class - Same as OnlineOrderHistory
  const getStatusBadgeClass = useCallback((status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'status-badge active';
      case 'completed':
        return 'status-badge completed';
      case 'cancelled':
        return 'status-badge inactive';
      case 'pending':
        return 'status-badge pending';
      case 'preparing':
        return 'status-badge preparing';
      default:
        return 'status-badge';
    }
  }, []);

  // Get payment status badge class
  const getPaymentStatusBadgeClass = useCallback((paymentStatus, paymentMethod) => {
    // Cash/COD payments are always successful
    if (paymentMethod === 'cash' || paymentMethod === 'cod') {
      return 'badge-success';
    }
    
    // Check payment status
    const status = paymentStatus?.toLowerCase() || 'pending';
    if (status === 'paid' || status === 'completed' || status === 'success') {
      return 'badge-success';
    }
    return 'badge-pending';
  }, []);

  // Get payment status text
  const getPaymentStatusText = useCallback((paymentStatus, paymentMethod) => {
    // Cash/COD payments are always successful
    if (paymentMethod === 'cash' || paymentMethod === 'cod') {
      return 'Success';
    }
    
    // Check payment status
    const status = paymentStatus?.toLowerCase() || 'pending';
    if (status === 'paid' || status === 'completed' || status === 'success') {
      return 'Success';
    }
    return 'Pending';
  }, []);

  // View order details
  const viewOrder = useCallback((order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  }, []);

  // Download order as PDF
  const downloadOrderPDF = useCallback((order) => {
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
              <span><strong>Date:</strong> ${formatDateTime(order.createdAt)}</span>
            </div>
            <div class="bill-row">
              <span><strong>Bill To:</strong> ${order.customerName || order.customerInfo?.name || 'Kiosk Customer'}</span>
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
      console.error('PDF generation error:', error);
    }
  }, [theaterInfo, formatDateTime]);

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    if (!Array.isArray(allOrders)) return [];

    return allOrders.filter(order => {
      // Search filter
      const matchesSearch = searchTerm === '' || 
        order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerPhone?.includes(searchTerm);

      // Status filter
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

      // Payment mode filter
      const matchesPaymentMode = paymentModeFilter === 'all' || (() => {
        const paymentMethod = order.payment?.method || order.paymentMode || order.paymentMethod || '';
        return paymentMethod.toLowerCase() === paymentModeFilter.toLowerCase();
      })();

      // Date filter with time support
      let matchesDate = true;
      if (dateFilter.type === 'date') {
        const orderDate = new Date(order.createdAt);
        const year = orderDate.getFullYear();
        const month = String(orderDate.getMonth() + 1).padStart(2, '0');
        const day = String(orderDate.getDate()).padStart(2, '0');
        const localDateString = `${year}-${month}-${day}`;
        matchesDate = localDateString === dateFilter.selectedDate;
        
        // Apply time filter if provided
        if (matchesDate && (dateFilter.fromTime || dateFilter.toTime)) {
          const orderTime = orderDate.getHours() * 60 + orderDate.getMinutes(); // Convert to minutes
          
          if (dateFilter.fromTime) {
            const [fromHours, fromMinutes] = dateFilter.fromTime.split(':').map(Number);
            const fromTimeMinutes = (fromHours || 0) * 60 + (fromMinutes || 0);
            if (orderTime < fromTimeMinutes) {
              matchesDate = false;
            }
          }
          
          if (dateFilter.toTime && matchesDate) {
            const [toHours, toMinutes] = dateFilter.toTime.split(':').map(Number);
            const toTimeMinutes = (toHours || 23) * 60 + (toMinutes || 59);
            if (orderTime > toTimeMinutes) {
              matchesDate = false;
            }
          }
        }
      } else if (dateFilter.type === 'month') {
        const orderDate = new Date(order.createdAt);
        matchesDate = orderDate.getMonth() + 1 === dateFilter.month && 
                     orderDate.getFullYear() === dateFilter.year;
        
        // Apply time filter if provided (for first and last day of month)
        if (matchesDate && (dateFilter.fromTime || dateFilter.toTime)) {
          const orderTime = orderDate.getHours() * 60 + orderDate.getMinutes();
          
          if (dateFilter.fromTime) {
            const [fromHours, fromMinutes] = dateFilter.fromTime.split(':').map(Number);
            const fromTimeMinutes = (fromHours || 0) * 60 + (fromMinutes || 0);
            if (orderTime < fromTimeMinutes) {
              matchesDate = false;
            }
          }
          
          if (dateFilter.toTime && matchesDate) {
            const [toHours, toMinutes] = dateFilter.toTime.split(':').map(Number);
            const toTimeMinutes = (toHours || 23) * 60 + (toMinutes || 59);
            if (orderTime > toTimeMinutes) {
              matchesDate = false;
            }
          }
        }
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        const orderDate = new Date(order.createdAt);
        const orderDateStr = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-${String(orderDate.getDate()).padStart(2, '0')}`;
        matchesDate = orderDateStr >= dateFilter.startDate && orderDateStr <= dateFilter.endDate;
        
        // Apply time filter if provided
        if (matchesDate && (dateFilter.fromTime || dateFilter.toTime)) {
          const orderTime = orderDate.getHours() * 60 + orderDate.getMinutes();
          
          // For start date, check fromTime
          if (orderDateStr === dateFilter.startDate && dateFilter.fromTime) {
            const [fromHours, fromMinutes] = dateFilter.fromTime.split(':').map(Number);
            const fromTimeMinutes = (fromHours || 0) * 60 + (fromMinutes || 0);
            if (orderTime < fromTimeMinutes) {
              matchesDate = false;
            }
          }
          
          // For end date, check toTime
          if (orderDateStr === dateFilter.endDate && dateFilter.toTime && matchesDate) {
            const [toHours, toMinutes] = dateFilter.toTime.split(':').map(Number);
            const toTimeMinutes = (toHours || 23) * 60 + (toMinutes || 59);
            if (orderTime > toTimeMinutes) {
              matchesDate = false;
            }
          }
        }
      }

      return matchesSearch && matchesStatus && matchesPaymentMode && matchesDate;
    });
  }, [allOrders, searchTerm, statusFilter, paymentModeFilter, dateFilter]);

  // Paginated orders
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  // Page change handler
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Download Excel functionality
  const handleDownloadExcel = useCallback(async () => {
    try {
      setDownloadingExcel(true);

      // Build query parameters
      const params = new URLSearchParams();
      
      // ✅ FIX: Only include kiosk orders in Excel download, exclude POS orders
      params.append('source', 'kiosk');


      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (paymentModeFilter !== 'all') params.append('paymentMode', paymentModeFilter);
      
      // Add date filters based on current selection with time support
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const selectedDate = new Date(dateFilter.selectedDate);
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
      } else if (dateFilter.type === 'month') {
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
      }

      const apiUrl = `${config.api.baseUrl}/orders/excel/${theaterId}?${params.toString()}`;

      const response = await unifiedFetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache file downloads
        cacheTTL: 0
      });

      if (!response.ok) {
        throw new Error(`Failed to download Excel: ${response.status}`);
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with date
      const today = getTodayLocalDate(); // ✅ FIX: Use local date format
      link.download = `kiosk-orders-${today}.xlsx`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Excel download error:', error);
      showError('Failed to download Excel file: ' + error.message);
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, searchTerm, statusFilter, paymentModeFilter, dateFilter, showError]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFilter]);

  // Render loading state
  if (loading) {
    return (
      <ErrorBoundary>
        <TheaterLayout currentPage="kiosk-order-history">
          <PageContainer title="Kiosk Order History" showBackButton={false}>
            <div className="theater-user-loading">
              Loading kiosk orders...
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TheaterLayout currentPage="kiosk-order-history" pageTitle="Kiosk Order History">
        <PageContainer 
          title="Kiosk Order History" 
          showBackButton={false}
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
          <div className="qr-management-page">
            
           

            {/* Summary Statistics */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.totalOrders}</div>
                <div className="stat-label">Total Orders</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.confirmedOrders}</div>
                <div className="stat-label">Confirmed</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.completedOrders}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{formatCurrency(summary.totalRevenue)}</div>
                <div className="stat-label">Total Revenue</div>
              </div>
            </div>

            {/* Filters and Controls */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search by order number, customer name, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              
              <div className="filter-controls">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
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
                  onChange={(e) => {
                    setPaymentModeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="status-filter"
                >
                  <option value="all">All Payment Modes</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                  <option value="netbanking">Net Banking</option>
                </select>
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
                  <span className="btn-icon btn-icon-white">{downloadingExcel ? '⏳' : '📊'}</span>
                  {downloadingExcel ? 'Downloading...' : 'EXCEL'}
                </button>
                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
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

            {/* Orders Table */}
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-cell">S.No</th>
                    <th className="name-cell">Order Number</th>
                    <th className="name-cell">Customer</th>
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
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="loading-cell">
                        <div className="loading-spinner"></div>
                        <span>Loading kiosk orders...</span>
                      </td>
                    </tr>
                  ) : paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="empty-cell">
                        <i className="fas fa-desktop fa-3x"></i>
                        <h3>No Kiosk Orders Found</h3>
                        <p>There are no kiosk orders available for viewing at the moment.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order, index) => (
                      <tr key={order._id} className="theater-row">
                        <td className="sno-cell">
                          <div className="sno-number">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </div>
                        </td>
                        
                        <td className="order-number-cell">
                          <div className="order-number">
                            {order.orderNumber || 'N/A'}
                          </div>
                        </td>
                        
                        <td className="customer-cell">
                          <div className="customer-info">
                            <div className="customer-name">
                              {order.customerName || order.customer?.name || 'Kiosk Customer'}
                            </div>
                            {(order.customerPhone || order.customer?.phone) && (
                              <div className="customer-phone">
                                {order.customerPhone || order.customer?.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        
                        <td className="items-cell">
                          <div className="items-count">
                            {order.items?.length || 0} items
                          </div>
                        </td>
                        
                        <td className="amount-cell table-cell-center">
                          <div className="amount">
                            {formatCurrency(order.pricing?.total ?? order.totalAmount ?? 0)}
                          </div>
                        </td>
                        
                        <td className="payment-mode-cell">
                          <div className="payment-mode">
                            {order.payment?.method || order.paymentMode || order.paymentMethod || 'UPI'}
                          </div>
                        </td>
                        
                        <td className="payment-status-cell">
                          <span className={`badge ${getPaymentStatusBadgeClass(order.payment?.status, order.payment?.method)}`}>
                            {getPaymentStatusText(order.payment?.status, order.payment?.method)}
                          </span>
                        </td>
                        
                        <td className="status-cell">
                          <span className={`status-badge ${getStatusBadgeClass(order.status)}`}>
                            {order.status || 'pending'}
                          </span>
                        </td>
                        
                        <td className="date-cell">
                          <div className="order-date">
                            {formatDateTime(order.createdAt)}
                          </div>
                        </td>
                        
                        <td className="action-cell">
                          <div className="action-buttons action-buttons-flex">
                            <button 
                              className="action-btn view-btn btn-no-margin"
                              title="View Details"
                              onClick={() => viewOrder(order)}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                              </svg>
                            </button>
                            <button 
                              className="action-btn download-btn btn-no-margin"
                              title="Download Receipt"
                              onClick={() => downloadOrderPDF(order)}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination - Always Show (Global Component) */}
            {!loading && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredOrders.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                itemType="orders"
              />
            )}

          </div>

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
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
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
                      })() : 'Address'}<br/>
                      {theaterInfo?.phone ? `Phone: ${theaterInfo.phone}` : ''}<br/>
                      {theaterInfo?.email ? `Email: ${theaterInfo.email}` : ''}<br/>
                      {theaterInfo?.gstNumber ? `GST: ${theaterInfo.gstNumber}` : ''}
                      {theaterInfo?.gstNumber && theaterInfo?.fssaiNumber ? <br/> : null}
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
                      <span>{formatDateTime(selectedOrder.createdAt)}</span>
                    </div>
                    <div className="bill-info-row">
                      <span className="bill-info-label">Bill To:</span>
                      <span>{selectedOrder.customerName || selectedOrder.customerInfo?.name || 'Kiosk Customer'}</span>
                    </div>
                    <div className="bill-info-row-last">
                      <span className="bill-info-label">Payment:</span>
                      <span>{selectedOrder.payment?.method ? selectedOrder.payment.method.toUpperCase() : (selectedOrder.paymentMode || selectedOrder.paymentMethod || 'UPI').toUpperCase()}</span>
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
            onApply={(newDateFilter) => setDateFilter(newDateFilter)}
          />

        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default KioskOrderHistory;