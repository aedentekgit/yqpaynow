import React, { useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import DateFilter from '../components/DateFilter';
import config from '../config';
import { optimizedFetch } from '../utils/apiOptimizer';
import { unifiedFetch } from '../utils/unifiedFetch';
import { getCachedData, setCachedData } from '../utils/cacheUtils';
import { SkeletonDashboard } from '../components/SkeletonLoader';
import { useToast } from '../contexts/ToastContext';
import { formatDateToLocal } from '../utils/dateUtils';
import '../styles/SuperAdminDashboard.css';
import '../styles/pages/Dashboard.css'; // Extracted inline styles



const Dashboard = () => {
  const token = useMemo(() => localStorage.getItem('authToken'), []);

  // 🚀 INSTANT: Check cache first (synchronous, < 2ms)
  const [initialStats] = React.useState(() => {
    const cached = getCachedData('dashboard_super_admin_stats', 300000); // 5-minute cache
    return cached || null;
  });

  const [stats, setStats] = React.useState(initialStats);
  const [loading, setLoading] = React.useState(!initialStats);
  const [error, setError] = React.useState(null);
  const [overallTheaterValue, setOverallTheaterValue] = React.useState(0);
  const [posOrdersAmount, setPosOrdersAmount] = React.useState(0);
  const [posOrdersCount, setPosOrdersCount] = React.useState(0);
  const [kioskOrdersAmount, setKioskOrdersAmount] = React.useState(0);
  const [kioskOrdersCount, setKioskOrdersCount] = React.useState(0);
  const [onlineOrdersAmount, setOnlineOrdersAmount] = React.useState(0);
  const [onlineOrdersCount, setOnlineOrdersCount] = React.useState(0);
  const [cancelledOrdersAmount, setCancelledOrdersAmount] = React.useState(0);
  const [loadingTheaterValue, setLoadingTheaterValue] = React.useState(false);

  // Date filtering state - Default to current date
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    type: 'date', // Default to current date
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

  // Handle date filter apply
  const handleDateFilterApply = (newDateFilter) => {
    setDateFilter(newDateFilter);
    setShowDateFilterModal(false);
    // Note: Backend doesn't support date filtering for main stats yet, but overall theater value will update
    // When backend support is added, we'll clear cache and refetch here
  };

  // 🚀 PERFORMANCE: Load stats with optimized fetch (parallel-ready)
  React.useEffect(() => {
    if (!token) {
      setError('Authentication token not found');
      setLoading(false);
      return;
    }

    const loadStats = async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
        setError(null);

        // ✅ FIX: Backend doesn't support date filters yet - use default cache key
        // Date filter UI is ready, but backend filtering will be added later
        const cacheKey = 'dashboard_super_admin_stats';

        const response = await optimizedFetch(
          `${config.api.baseUrl}/dashboard/super-admin-stats`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          },
          cacheKey,
          300000 // 5-minute cache
        );

        if (response && response.success) {
          const statsData = response.data;
          setStats(statsData);
          setCachedData(cacheKey, statsData);
        } else {
          // Only show error if we don't have cached data to fall back on
          if (!initialStats) {
            setError(response?.error || 'Failed to load dashboard data');
          }
        }
      } catch (err) {
        console.error('❌ [Dashboard] Error loading stats:', err);
        // Only show error if we don't have cached data to fall back on
        if (!initialStats) {
          setError(err.message || 'Failed to load dashboard data');
        }
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    };

    // Show cached data immediately if available, then refresh in background
    if (initialStats) {
      // Have cached data - refresh silently in background without showing loading
      loadStats(false);
    } else {
      // No cached data - fetch with loading indicator
      loadStats(true);
    }
  }, [token]);

  // Refetch function
  const refetch = React.useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      // ✅ FIX: Use simple cache key - backend doesn't support date filtering yet
      const cacheKey = 'dashboard_super_admin_stats';

      const response = await optimizedFetch(
        `${config.api.baseUrl}/dashboard/super-admin-stats`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        cacheKey,
        300000
      );

      if (response && response.success) {
        const statsData = response.data;
        setStats(statsData);
        setCachedData(cacheKey, statsData);
      } else {
        setError(response?.error || 'Failed to load dashboard data');
      }
    } catch (err) {
      console.error('❌ [Dashboard] Error refetching stats:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // 🚀 PERFORMANCE: Auto-refresh every 5 minutes - Stable ref to prevent re-renders
  const refetchRef = React.useRef(refetch);
  refetchRef.current = refetch;

  React.useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      refetchRef.current(); // Use ref to avoid dependency on refetch
    }, 300000); // 5 minutes (reduced frequency for better performance)

    return () => clearInterval(interval);
  }, [token]); // Only depend on token, not refetch

  // Fetch overall theater value (totalOrdersAmount from all theaters)
  const fetchOverallTheaterValue = React.useCallback(async () => {
    if (!token) return;

    try {
      setLoadingTheaterValue(true);

      // Build date filter params based on dateFilter state
      let startDate, endDate;

      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // Single date selected
        const selectedDateStr = dateFilter.selectedDate;
        let selectedDate;

        try {
          if (selectedDateStr.includes('T')) {
            selectedDate = new Date(selectedDateStr);
          } else {
            const [year, month, day] = selectedDateStr.split('-').map(Number);
            selectedDate = new Date(year, month - 1, day);
          }

          if (!isNaN(selectedDate.getTime())) {
            startDate = new Date(selectedDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(selectedDate);
            endDate.setHours(23, 59, 59, 999);
          }
        } catch (e) {
          console.error('Error parsing selected date:', e);
        }
      } else if (dateFilter.type === 'month' && dateFilter.month && dateFilter.year) {
        // Month selected
        startDate = new Date(dateFilter.year, dateFilter.month - 1, 1, 0, 0, 0, 0);
        endDate = new Date(dateFilter.year, dateFilter.month, 0, 23, 59, 59, 999);
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        // Date range selected
        startDate = new Date(dateFilter.startDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Default to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        startDate = today;
      }

      if (!startDate || !endDate) {
        // Fallback to today if date parsing failed
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate = today;
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
      }

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const dateKey = formatDateToLocal(startDate); // ✅ FIX: Use local date format for cache key
      const cacheKey = `overall_theater_value_${dateKey}`;

      const response = await optimizedFetch(
        `${config.api.baseUrl}/orders/all-theaters-stats?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        },
        cacheKey,
        60000 // 1-minute cache for theater value
      );

      if (response && response.success && response.data) {
        setOverallTheaterValue(response.data.totalOrdersAmount || 0);
        setPosOrdersAmount(response.data.posOrdersAmount || 0);
        setPosOrdersCount(response.data.posOrders || 0);
        setKioskOrdersAmount(response.data.kioskOrdersAmount || 0);
        setKioskOrdersCount(response.data.kioskOrders || 0);
        setOnlineOrdersAmount(response.data.onlineOrdersAmount || 0);
        setOnlineOrdersCount(response.data.onlineOrders || 0);
        setCancelledOrdersAmount(response.data.cancelledOrdersAmount || 0);
      }
    } catch (err) {
      console.error('❌ [Dashboard] Error fetching overall theater value:', err);
      setOverallTheaterValue(0);
    } finally {
      setLoadingTheaterValue(false);
    }
  }, [token, dateFilter]);

  // Fetch overall theater value on mount and when date filter changes
  React.useEffect(() => {
    fetchOverallTheaterValue();
  }, [fetchOverallTheaterValue]);

  // Check for expiring agreements and show notification - Only on fresh login
  const [expiringAgreements, setExpiringAgreements] = React.useState([]);
  const { warning } = useToast();
  const warningRef = React.useRef(warning);
  warningRef.current = warning;
  const lastCheckRef = React.useRef(0);

  React.useEffect(() => {
    if (!token) return;

    const checkExpiringAgreements = async () => {
      const now = Date.now();
      // Prevent multiple simultaneous calls
      if (now - lastCheckRef.current < 1000) {
        return;
      }
      lastCheckRef.current = now;

      try {
        const response = await unifiedFetch(`${config.api.baseUrl}/theaters/expiring-agreements`, {
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: 'expiring_agreements',
          cacheTTL: 300000 // 5 minutes
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data.expiringTheaters.length > 0) {
            setExpiringAgreements(prev => {
              // Only update if data actually changed
              const prevIds = prev.map(t => t.theaterId).sort().join(',');
              const newIds = result.data.expiringTheaters.map(t => t.theaterId).sort().join(',');
              if (prevIds === newIds) return prev;

              // ✅ FIX: Check if notifications have already been shown in this session
              const sessionKey = 'agreement_notifications_shown';
              const notificationsShown = sessionStorage.getItem(sessionKey);

              // Only show notifications if they haven't been shown in this session (fresh login)
              if (!notificationsShown) {
                // Mark as shown FIRST to prevent race conditions (before showing notifications)
                sessionStorage.setItem(sessionKey, 'true');

                // Show notification for each expiring agreement
                // (This will only happen once per browser session, on fresh login)
                result.data.expiringTheaters.forEach(theater => {
                  warningRef.current(
                    `Agreement for ${theater.theaterName} expires in ${theater.daysUntilExpiration} day(s)`,
                    5000
                  );
                });
              }
              // Note: sessionStorage automatically clears when browser tab closes
              // Also cleared on logout via clearAllCaches() function

              return result.data.expiringTheaters;
            });
          }
        }
      } catch (error) {
        console.error('Error checking expiring agreements:', error);
      }
    };

    // ✅ FIX: Only check on mount (fresh login/page load), not on every redirect
    // Don't check periodically - notifications should only show once per session
    checkExpiringAgreements();

    // No interval needed - we only want to show notifications once per session
    // return () => clearInterval(interval);
  }, [token]); // Removed warning from dependencies

  // 🚀 INSTANT: Always show content - use skeleton if no data
  const hasData = stats;

  // Show skeleton instead of spinner - instant UI
  if (loading && !hasData) {
    return (
      <AdminLayout pageTitle="Dashboard" currentPage="dashboard">
        <div className="sadmin-wrapper">
          <SkeletonDashboard />
        </div>
      </AdminLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <AdminLayout pageTitle="Dashboard" currentPage="dashboard">
        <div className="sadmin-wrapper">
          <div className="sadmin-error">
            <div className="sadmin-error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3>Error Loading Dashboard</h3>
            <p>{error}</p>
            <button onClick={refetch} className="sadmin-retry-btn">
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // No data state
  if (!stats) {
    return (
      <AdminLayout pageTitle="Dashboard" currentPage="dashboard">
        <div className="sadmin-wrapper">
          <div className="sadmin-empty">
            <p>No dashboard data available</p>
            <button onClick={refetch} className="sadmin-retry-btn">
              Reload
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }


  // Extract dynamic data from backend stats
  // Theater counts (no trends needed for these)
  const employeesTrend = stats?.trends?.employees ?? 0;

  // Working time from backend (calculated from actual order timestamps)
  const workingTime = stats?.workingTime || {
    dayShift: 0,
    overtime: 0,
    nightShift: 0
  };

  // Popular time data from backend (calculated from actual order timestamps)
  const popularTimeData = stats?.popularTime || [];

  // Food order data from backend (calculated from order items and categories)
  const foodOrderData = stats?.foodOrder || {
    setMenu: 0,
    alacarteMenu: 0,
    hotpotMenu: 0
  };

  // Payment method data from backend (calculated from actual payment methods)
  const paymentMethodData = stats?.paymentMethod || {
    transfer: 0,
    cash: 0
  };

  // Revenue statistic data from backend (last 7 months revenue)
  const revenueStatisticData = stats?.revenueStatistic || [];

  const maxPopularTime = popularTimeData.length > 0
    ? Math.max(...popularTimeData.map(d => d.value || 0), 1)
    : 100;
  const maxRevenue = revenueStatisticData.length > 0
    ? Math.max(...revenueStatisticData.map(d => d.value || 0), 1)
    : 100;

  // Date filter props for Header component
  const dateFilterProps = {
    dateFilter,
    onOpenModal: () => setShowDateFilterModal(true)
  };

  // Calculate statistics for additional insights
  const totalOrders = posOrdersCount + kioskOrdersCount + onlineOrdersCount;
  const avgOrderValue = totalOrders > 0 ? overallTheaterValue / totalOrders : 0;
  const totalTheaters = (stats?.theaters?.active || 0) + (stats?.theaters?.inactive || 0);
  const theaterActiveRate = totalTheaters > 0 ? ((stats?.theaters?.active || 0) / totalTheaters * 100) : 0;

  return (
    <ErrorBoundary>
      <AdminLayout
        pageTitle="Dashboard"
        currentPage="dashboard"
        dateFilterProps={dateFilterProps}
      >
        <div className="sadmin-wrapper">
          {/* Executive Summary Header */}
          <div className="corp-header">
            <div className="corp-header-content">
              <h1 className="corp-header-title">Executive Dashboard</h1>
              <p className="corp-header-subtitle">Real-time business insights and performance metrics</p>
            </div>
            <div className="corp-header-actions">
              {/* Date Filter Button */}
              <button
                className="corp-date-filter-btn"
                onClick={() => setShowDateFilterModal(true)}
                title="Filter by date"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span className="corp-filter-label">
                  {dateFilter.type === 'date' && dateFilter.selectedDate ?
                    new Date(dateFilter.selectedDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) :
                    dateFilter.type === 'month' ?
                      `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` :
                      dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate ?
                        `${new Date(dateFilter.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - ${new Date(dateFilter.endDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}` :
                        'Select Date'
                  }
                </span>
                <svg className="corp-filter-chevron" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </button>

              <div className="corp-header-meta">
                <div className="corp-meta-item">
                  <span className="corp-meta-label">Last Updated</span>
                  <span className="corp-meta-value">{new Date().toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key Performance Indicators */}
          <div className="corp-kpi-grid">
            {/* Total Revenue KPI */}
            <div className="corp-kpi-card corp-kpi-primary">
              <div className="corp-kpi-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3h12" />
                  <path d="M6 8h12" />
                  <path d="m6 13 8.5 8" />
                  <path d="M6 13h3" />
                  <path d="M9 13c6.667 0 6.667-10 0-10" />
                </svg>
              </div>
              <div className="corp-kpi-content">
                <div className="corp-kpi-label">Total Revenue</div>
                <div className="corp-kpi-value">
                  {loadingTheaterValue ? (
                    <div className="corp-shimmer">Loading...</div>
                  ) : (
                    `₹${(overallTheaterValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </div>
                <div className="corp-kpi-meta">
                  <span className="corp-kpi-trend trend-positive">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" />
                    </svg>
                    {dateFilter.type === 'date' ? 'Today' : dateFilter.type === 'month' ? 'This Month' : 'Date Range'}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Orders KPI */}
            <div className="corp-kpi-card corp-kpi-success">
              <div className="corp-kpi-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="corp-kpi-content">
                <div className="corp-kpi-label">Total Orders</div>
                <div className="corp-kpi-value">
                  {loadingTheaterValue ? (
                    <div className="corp-shimmer">Loading...</div>
                  ) : (
                    totalOrders.toLocaleString('en-IN')
                  )}
                </div>
                <div className="corp-kpi-meta">
                  <span className="corp-kpi-badge">Active Transactions</span>
                </div>
              </div>
            </div>

            {/* Average Order Value KPI */}
            <div className="corp-kpi-card corp-kpi-info">
              <div className="corp-kpi-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="corp-kpi-content">
                <div className="corp-kpi-label">Avg Order Value</div>
                <div className="corp-kpi-value">
                  {loadingTheaterValue ? (
                    <div className="corp-shimmer">Loading...</div>
                  ) : (
                    `₹${avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </div>
                <div className="corp-kpi-meta">
                  <span className="corp-kpi-badge">Per Transaction</span>
                </div>
              </div>
            </div>

            {/* Active Theaters KPI */}
            <div className="corp-kpi-card corp-kpi-warning">
              <div className="corp-kpi-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="corp-kpi-content">
                <div className="corp-kpi-label">Active Theaters</div>
                <div className="corp-kpi-value">
                  {stats?.theaters?.active || 0}
                  <span className="corp-kpi-suffix">/ {totalTheaters}</span>
                </div>
                <div className="corp-kpi-meta">
                  <span className="corp-kpi-badge">{theaterActiveRate.toFixed(0)}% Active Rate</span>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Breakdown Section */}
          <div className="corp-section">
            <div className="corp-section-header">
              <h2 className="corp-section-title">Revenue Distribution</h2>
              <p className="corp-section-subtitle">Breakdown by order channels</p>
            </div>
            <div className="corp-metrics-grid">
              {/* POS Orders */}
              <div className="corp-metric-card">
                <div className="corp-metric-header">
                  <div className="corp-metric-icon corp-icon-blue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="corp-metric-trend">
                    <span className="trend-badge trend-positive">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="corp-metric-body">
                  <div className="corp-metric-label">POS Orders</div>
                  <div className="corp-metric-value">
                    {loadingTheaterValue ? '...' : `₹${(posOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  </div>
                  <div className="corp-metric-footer">
                    <span className="corp-metric-count">{posOrdersCount} orders</span>
                    <span className="corp-metric-percentage">{totalOrders > 0 ? ((posOrdersCount / totalOrders) * 100).toFixed(1) : 0}%</span>
                  </div>
                </div>
                <div className="corp-metric-progress">
                  <div className="corp-progress-bar corp-progress-blue" style={{ width: `${totalOrders > 0 ? (posOrdersCount / totalOrders) * 100 : 0}%` }}></div>
                </div>
              </div>

              {/* Kiosk Orders */}
              <div className="corp-metric-card">
                <div className="corp-metric-header">
                  <div className="corp-metric-icon corp-icon-purple">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="corp-metric-trend">
                    <span className="trend-badge trend-positive">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="corp-metric-body">
                  <div className="corp-metric-label">Kiosk Orders</div>
                  <div className="corp-metric-value">
                    {loadingTheaterValue ? '...' : `₹${(kioskOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  </div>
                  <div className="corp-metric-footer">
                    <span className="corp-metric-count">{kioskOrdersCount} orders</span>
                    <span className="corp-metric-percentage">{totalOrders > 0 ? ((kioskOrdersCount / totalOrders) * 100).toFixed(1) : 0}%</span>
                  </div>
                </div>
                <div className="corp-metric-progress">
                  <div className="corp-progress-bar corp-progress-purple" style={{ width: `${totalOrders > 0 ? (kioskOrdersCount / totalOrders) * 100 : 0}%` }}></div>
                </div>
              </div>

              {/* Online Orders */}
              <div className="corp-metric-card">
                <div className="corp-metric-header">
                  <div className="corp-metric-icon corp-icon-green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <div className="corp-metric-trend">
                    <span className="trend-badge trend-positive">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="corp-metric-body">
                  <div className="corp-metric-label">Online Orders</div>
                  <div className="corp-metric-value">
                    {loadingTheaterValue ? '...' : `₹${(onlineOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  </div>
                  <div className="corp-metric-footer">
                    <span className="corp-metric-count">{onlineOrdersCount} orders</span>
                    <span className="corp-metric-percentage">{totalOrders > 0 ? ((onlineOrdersCount / totalOrders) * 100).toFixed(1) : 0}%</span>
                  </div>
                </div>
                <div className="corp-metric-progress">
                  <div className="corp-progress-bar corp-progress-green" style={{ width: `${totalOrders > 0 ? (onlineOrdersCount / totalOrders) * 100 : 0}%` }}></div>
                </div>
              </div>

              {/* Cancelled Orders */}
              <div className="corp-metric-card">
                <div className="corp-metric-header">
                  <div className="corp-metric-icon corp-icon-red">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="corp-metric-trend">
                    <span className="trend-badge trend-neutral">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="corp-metric-body">
                  <div className="corp-metric-label">Cancelled Orders</div>
                  <div className="corp-metric-value">
                    {loadingTheaterValue ? '...' : `₹${(cancelledOrdersAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  </div>
                  <div className="corp-metric-footer">
                    <span className="corp-metric-count">Impact on revenue</span>
                    <span className="corp-metric-percentage corp-text-danger">Lost</span>
                  </div>
                </div>
                <div className="corp-metric-progress">
                  <div className="corp-progress-bar corp-progress-red" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Section */}
          <div className="corp-analytics-row">
            {/* Order Channel Distribution */}
            <div className="corp-chart-card">
              <div className="corp-chart-header">
                <div>
                  <h3 className="corp-chart-title">Order Channel Distribution</h3>
                  <p className="corp-chart-subtitle">By transaction count</p>
                </div>
              </div>
              <div className="corp-chart-body">
                {(() => {
                  const total = posOrdersCount + kioskOrdersCount + onlineOrdersCount;
                  const posPercent = total > 0 ? (posOrdersCount / total) * 100 : 0;
                  const kioskPercent = total > 0 ? (kioskOrdersCount / total) * 100 : 0;
                  const onlinePercent = total > 0 ? (onlineOrdersCount / total) * 100 : 0;

                  const circumference = 2 * Math.PI * 70;

                  return (
                    <div className="corp-donut-wrapper">
                      <div className="corp-donut-chart">
                        <svg viewBox="0 0 200 200">
                          {/* POS Orders */}
                          <circle
                            cx="100"
                            cy="100"
                            r="70"
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth="28"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference - (circumference * posPercent / 100)}
                            strokeLinecap="round"
                            transform="rotate(-90 100 100)"
                          />
                          {/* Kiosk Orders */}
                          <circle
                            cx="100"
                            cy="100"
                            r="70"
                            fill="none"
                            stroke="#8B5CF6"
                            strokeWidth="28"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference - (circumference * kioskPercent / 100)}
                            strokeLinecap="round"
                            transform={`rotate(${-90 + (posPercent * 3.6)} 100 100)`}
                          />
                          {/* Online Orders */}
                          <circle
                            cx="100"
                            cy="100"
                            r="70"
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="28"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference - (circumference * onlinePercent / 100)}
                            strokeLinecap="round"
                            transform={`rotate(${-90 + ((posPercent + kioskPercent) * 3.6)} 100 100)`}
                          />
                        </svg>
                        <div className="corp-donut-center">
                          <div className="corp-donut-total">{total}</div>
                          <div className="corp-donut-label">Total Orders</div>
                        </div>
                      </div>
                      <div className="corp-chart-legend">
                        <div className="corp-legend-item">
                          <span className="corp-legend-dot" style={{ background: '#3B82F6' }}></span>
                          <span className="corp-legend-label">POS</span>
                          <span className="corp-legend-value">{posOrdersCount}</span>
                          <span className="corp-legend-percent">{posPercent.toFixed(1)}%</span>
                        </div>
                        <div className="corp-legend-item">
                          <span className="corp-legend-dot" style={{ background: '#8B5CF6' }}></span>
                          <span className="corp-legend-label">Kiosk</span>
                          <span className="corp-legend-value">{kioskOrdersCount}</span>
                          <span className="corp-legend-percent">{kioskPercent.toFixed(1)}%</span>
                        </div>
                        <div className="corp-legend-item">
                          <span className="corp-legend-dot" style={{ background: '#10B981' }}></span>
                          <span className="corp-legend-label">Online</span>
                          <span className="corp-legend-value">{onlineOrdersCount}</span>
                          <span className="corp-legend-percent">{onlinePercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Theater Status Overview */}
            <div className="corp-chart-card">
              <div className="corp-chart-header">
                <div>
                  <h3 className="corp-chart-title">Theater Network Status</h3>
                  <p className="corp-chart-subtitle">Operational overview</p>
                </div>
              </div>
              <div className="corp-chart-body">
                <div className="corp-status-grid">
                  <div className="corp-status-item corp-status-active">
                    <div className="corp-status-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="corp-status-content">
                      <div className="corp-status-value">{stats?.theaters?.active || 0}</div>
                      <div className="corp-status-label">Active Theaters</div>
                      <div className="corp-status-bar">
                        <div className="corp-status-fill corp-fill-success" style={{ width: `${theaterActiveRate}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="corp-status-item corp-status-inactive">
                    <div className="corp-status-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="corp-status-content">
                      <div className="corp-status-value">{stats?.theaters?.inactive || 0}</div>
                      <div className="corp-status-label">Inactive Theaters</div>
                      <div className="corp-status-bar">
                        <div className="corp-status-fill corp-fill-danger" style={{ width: `${100 - theaterActiveRate}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="corp-status-item corp-status-total">
                    <div className="corp-status-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div className="corp-status-content">
                      <div className="corp-status-value">{totalTheaters}</div>
                      <div className="corp-status-label">Total Network</div>
                      <div className="corp-status-meta">{stats?.system?.totalPageAccess || 20} User Pages</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Expiring Agreements Alert */}
          {stats?.expiringAgreements && stats.expiringAgreements.length > 0 && (
            <div className="corp-alert-section">
              <div className="corp-alert-card">
                <div className="corp-alert-header">
                  <div className="corp-alert-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="corp-alert-title">Agreement Expiration Alerts</h3>
                    <p className="corp-alert-subtitle">{stats.expiringAgreements.length} agreement(s) require attention</p>
                  </div>
                </div>
                <div className="corp-alert-list">
                  {stats.expiringAgreements.slice(0, 5).map((agreement, index) => (
                    <div key={agreement.theaterId || index} className="corp-alert-item">
                      <div className="corp-alert-item-header">
                        <span className="corp-alert-item-title">{agreement.theaterName || 'Unknown Theater'}</span>
                        <span className={`corp-alert-badge ${agreement.daysUntilExpiration <= 7 ? 'badge-critical' : agreement.daysUntilExpiration <= 15 ? 'badge-warning' : 'badge-info'}`}>
                          {agreement.daysUntilExpiration} {agreement.daysUntilExpiration === 1 ? 'day' : 'days'} remaining
                        </span>
                      </div>
                      <div className="corp-alert-item-footer">
                        <span className="corp-alert-date">
                          Expires: {agreement.endDate ? new Date(agreement.endDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {stats.expiringAgreements.length > 5 && (
                    <div className="corp-alert-more">
                      +{stats.expiringAgreements.length - 5} more agreements expiring soon
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Date Filter Modal */}
        {showDateFilterModal && (
          <DateFilter
            isOpen={showDateFilterModal}
            onClose={() => setShowDateFilterModal(false)}
            onApply={handleDateFilterApply}
            initialFilter={dateFilter}
          />
        )}
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default Dashboard;
