import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import apiService from '@services/apiService';
import { getAuthToken } from '@utils/authHelper';
import config from '@config';
import { getImageSrc } from '@utils/globalImageCache';
import InstantImage from '@components/InstantImage';
import DateFilter from '@components/DateFilter';
import '@styles/TheaterAdminDashboard.css';
import '@styles/pages/theater/TheaterDashboard.css'; // Extracted inline styles

// Category color classes - will be assigned dynamically based on category count
const getCategoryColorClass = (index) => {
  const colors = [
    'tadmin-legend-food',
    'tadmin-legend-drink', 
    'tadmin-legend-desert',
    'tadmin-legend-food', // Reuse colors if more than 3 categories
    'tadmin-legend-drink',
    'tadmin-legend-desert'
  ];
  return colors[index % colors.length];
};

const getCategoryBarClass = (index) => {
  const colors = [
    'tadmin-bar-food',
    'tadmin-bar-drink',
    'tadmin-bar-desert',
    'tadmin-bar-food',
    'tadmin-bar-drink',
    'tadmin-bar-desert'
  ];
  return colors[index % colors.length];
};

// Professional Clean Theater Dashboard - Dynamic Data with Primary/Secondary Colors
const TheaterDashboard = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const [chartPeriod, setChartPeriod] = useState('Monthly');
  const [categoryPeriod, setCategoryPeriod] = useState('Last week');
  const [transactionPeriod, setTransactionPeriod] = useState('Today');
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  
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
    // Force a refresh by closing the modal - the useEffect will trigger with new dateFilter
  };

  // Retry function
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setDashboardData(null);
    // Trigger refetch by updating a dependency or manually calling fetch
    // The useEffect will be triggered when dependencies change
    setDateFilter(prev => ({ ...prev })); // Trigger refetch
  };

  // Fetch dashboard data from API
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!theaterId) {
        setError('Theater ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Build date filter parameters
        const params = {};
        
        
        // Helper function to parse time string (HH:MM) and apply to date
        const applyTimeToDate = (date, timeStr) => {
          if (!timeStr || timeStr === '00:00' || timeStr === '23:59') {
            return date;
          }
          const [hours, minutes] = timeStr.split(':').map(Number);
          date.setHours(hours || 0, minutes || 0, 0, 0);
          return date;
        };

        // Add date filter based on current dateFilter state
        if (dateFilter.type === 'date' && dateFilter.selectedDate) {
          // For specific date, set start and end of that day (local time, avoid timezone issues)
          const [year, month, day] = dateFilter.selectedDate.split('-').map(Number);
          const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
          const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
          
          // Apply time filters if provided
          if (dateFilter.fromTime) {
            applyTimeToDate(startOfDay, dateFilter.fromTime);
          }
          if (dateFilter.toTime) {
            const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
            endOfDay.setHours(hours || 23, minutes || 59, 59, 999);
          }
          
          params.startDate = startOfDay.toISOString();
          params.endDate = endOfDay.toISOString();
        } else if (dateFilter.type === 'month') {
          // For month filter, set start and end of month
          const year = dateFilter.year;
          const month = dateFilter.month;
          const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
          const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
          
          // Apply time filters if provided (for first and last day of month)
          if (dateFilter.fromTime) {
            applyTimeToDate(startOfMonth, dateFilter.fromTime);
          }
          if (dateFilter.toTime) {
            const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
            endOfMonth.setHours(hours || 23, minutes || 59, 59, 999);
          }
          
          params.startDate = startOfMonth.toISOString();
          params.endDate = endOfMonth.toISOString();
        } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
          // For custom range (parse YYYY-MM-DD format to avoid timezone issues)
          const [startYear, startMonth, startDay] = dateFilter.startDate.split('-').map(Number);
          const [endYear, endMonth, endDay] = dateFilter.endDate.split('-').map(Number);
          const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
          const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
          
          // Apply time filters if provided
          if (dateFilter.fromTime) {
            applyTimeToDate(startDate, dateFilter.fromTime);
          }
          if (dateFilter.toTime) {
            const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
            endDate.setHours(hours || 23, minutes || 59, 59, 999);
          }
          
          params.startDate = startDate.toISOString();
          params.endDate = endDate.toISOString();
        }
        // For 'all' type, don't add date filters
        
        const result = await apiService.getItem(`/theater-dashboard/${theaterId}`, params);
        
        // handleItemResponse already extracts data, so result IS the data
        if (result) {
          setDashboardData(result);
        } else {
          setError('Failed to load dashboard data');
        }
      } catch (err) {
        console.error('❌ [Dashboard] Error fetching dashboard data:', err);
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [theaterId, dateFilter]);

  // Memoize computed values
  const stats = useMemo(() => {
    if (!dashboardData) return null;
    return dashboardData.stats || {};
  }, [dashboardData]);

  // ✅ FIX: Transform sales data based on chartPeriod
  const salesData = useMemo(() => {
    if (!dashboardData?.salesFigures) return [];
    
    const rawData = dashboardData.salesFigures.map(item => ({
      month: item.month,
      value: item.value
    }));
    
    // If Monthly, return as is (backend already provides monthly data)
    if (chartPeriod === 'Monthly') {
      return rawData;
    }
    
    // For other periods, we need to aggregate the monthly data
    // Since backend only provides monthly data, we'll show a simplified view
    if (chartPeriod === 'Daily') {
      // For daily, show last 7 days (would need backend support for real daily data)
      // For now, distribute monthly data across days
      const lastMonth = rawData[rawData.length - 1];
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push({
          month: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: lastMonth ? Math.round(lastMonth.value / 30) : 0 // Approximate daily from monthly
        });
      }
      return days;
    }
    
    if (chartPeriod === 'Weekly') {
      // For weekly, aggregate last 4 weeks from monthly data
      const last4Months = rawData.slice(-4);
      return last4Months.map((item, index) => ({
        month: `Week ${index + 1}`,
        value: Math.round(item.value / 4) // Approximate weekly from monthly
      }));
    }
    
    if (chartPeriod === 'Yearly') {
      // For yearly, show last 3-5 years if we have enough data
      // Since backend provides 12 months, we'll group into years
      // For now, show current year total and previous year if available
      const currentYearTotal = rawData.slice(-12).reduce((sum, item) => sum + item.value, 0);
      const previousYearTotal = rawData.length > 12 
        ? rawData.slice(-24, -12).reduce((sum, item) => sum + item.value, 0)
        : 0;
      
      const result = [];
      if (previousYearTotal > 0) {
        result.push({
          month: (new Date().getFullYear() - 1).toString(),
          value: previousYearTotal
        });
      }
      result.push({
        month: new Date().getFullYear().toString(),
        value: currentYearTotal
      });
      return result;
    }
    
    return rawData;
  }, [dashboardData, chartPeriod]);

  const categoryData = useMemo(() => {
    if (!dashboardData?.categoryEarnings) return [];
    return dashboardData.categoryEarnings;
  }, [dashboardData]);

  // Get category metadata from dashboard data
  const categoryMetadata = useMemo(() => {
    if (!dashboardData?.categoryMetadata || !Array.isArray(dashboardData.categoryMetadata)) {
      return [];
    }
    return dashboardData.categoryMetadata;
  }, [dashboardData]);

  const recentTransactions = useMemo(() => {
    if (!dashboardData?.recentTransactions) return [];
    return dashboardData.recentTransactions;
  }, [dashboardData]);

  // Filter recent transactions based on transactionPeriod
  const filteredRecentTransactions = useMemo(() => {
    if (!recentTransactions || recentTransactions.length === 0) {
      return [];
    }
    
    // Log first transaction to see its structure
    if (recentTransactions.length > 0) {
      console.log('📅 [Dashboard] Sample transaction structure:', {
        firstTransaction: recentTransactions[0],
        allFields: Object.keys(recentTransactions[0])
      });
    }
    
    // Get current date in local timezone
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay()); // Start of week (Sunday)
    thisWeekStart.setHours(0, 0, 0, 0);
    
    console.log('📅 [Dashboard] Filtering transactions:', {
      period: transactionPeriod,
      totalTransactions: recentTransactions.length,
      today: today.toLocaleDateString('en-GB'),
      yesterday: yesterday.toLocaleDateString('en-GB'),
      thisWeekStart: thisWeekStart.toLocaleDateString('en-GB')
    });
    
    const filtered = recentTransactions.filter(transaction => {
      // Get transaction date - handle different date field formats
      // The backend now returns transactions with createdAt or date field
      let transactionDate = null;
      
      if (transaction.createdAt) {
        transactionDate = new Date(transaction.createdAt);
      } else if (transaction.date) {
        transactionDate = new Date(transaction.date);
      } else if (transaction.timestamps?.placedAt) {
        transactionDate = new Date(transaction.timestamps.placedAt);
      } else {
        // If no date is available, skip this transaction
        console.warn('⚠️ [Dashboard] Transaction missing date field:', transaction);
        return false;
      }
      
      if (!transactionDate || isNaN(transactionDate.getTime())) {
        console.warn('⚠️ [Dashboard] Invalid transaction date:', transaction, 'Parsed date:', transactionDate);
        return false;
      }
      
      // Normalize transaction date to start of day in LOCAL timezone for comparison
      // This avoids timezone issues when comparing dates
      const txYear = transactionDate.getFullYear();
      const txMonth = transactionDate.getMonth();
      const txDay = transactionDate.getDate();
      const txDate = new Date(txYear, txMonth, txDay);
      
      // Also get today's date components for comparison
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDay = today.getDate();
      
      let matches = false;
      switch (transactionPeriod) {
        case 'Today':
          // Compare year, month, and day directly
          matches = txYear === todayYear && txMonth === todayMonth && txDay === todayDay;
          break;
        case 'Yesterday':
          const yesterdayYear = yesterday.getFullYear();
          const yesterdayMonth = yesterday.getMonth();
          const yesterdayDay = yesterday.getDate();
          matches = txYear === yesterdayYear && txMonth === yesterdayMonth && txDay === yesterdayDay;
          break;
        case 'This week':
          matches = txDate >= thisWeekStart && txDate <= today;
          break;
        default:
          matches = true; // Show all if period not recognized
      }
      
      if (matches) {
        console.log('✅ [Dashboard] Transaction matches filter:', {
          transactionId: transaction.id,
          transactionName: transaction.name,
          transactionDate: `${txYear}-${String(txMonth + 1).padStart(2, '0')}-${String(txDay).padStart(2, '0')}`,
          period: transactionPeriod,
          todayDate: `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`
        });
      } else {
        console.log('❌ [Dashboard] Transaction does NOT match filter:', {
          transactionId: transaction.id,
          transactionName: transaction.name,
          transactionDate: `${txYear}-${String(txMonth + 1).padStart(2, '0')}-${String(txDay).padStart(2, '0')}`,
          period: transactionPeriod,
          todayDate: `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`
        });
      }
      
      return matches;
    });
    
    // Limit to 10 transactions for display
    return filtered.slice(0, 7);
  }, [recentTransactions, transactionPeriod]);

  const specialties = useMemo(() => {
    if (!dashboardData?.specialties) return [];
    return dashboardData.specialties;
  }, [dashboardData]);

  // ✅ Get top products (highest sales) for Specialties Sales section
  const topProducts = useMemo(() => {
    if (!dashboardData) {
      return [];
    }
    
    // Debug: Log what's in dashboardData
    
    // Try to get topProducts first
    if (dashboardData.topProducts && Array.isArray(dashboardData.topProducts) && dashboardData.topProducts.length > 0) {
      // Sort by revenue (highest first) - backend already sorts, but ensure it's correct
      const sorted = dashboardData.topProducts
        .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
        .slice(0, 5); // Show top 5 products
      return sorted;
    }
    
    // Fallback: Try to use specialties if available
    if (dashboardData.specialties && Array.isArray(dashboardData.specialties) && dashboardData.specialties.length > 0) {
      // Convert specialties to topProducts format
      return dashboardData.specialties.map((specialty, index) => ({
        name: specialty.name,
        revenue: specialty.revenue || 0,
        quantity: specialty.quantity || 0,
        image: specialty.image || '🍽️',
        rank: index + 1
      }));
    }
    
    return [];
  }, [dashboardData]);

  // ✅ FIX: Calculate maxSales properly and create Y-axis labels
  const maxSales = useMemo(() => {
    if (!salesData || salesData.length === 0) return 100;
    const max = Math.max(...salesData.map(d => d.value || 0));
    // Round up to nearest 10, 50, 100, 500, or 1000 for better chart scaling
    if (max === 0) return 100;
    if (max < 10) return 10;
    if (max < 50) return Math.ceil(max / 10) * 10;
    if (max < 100) return 50;
    if (max < 500) return Math.ceil(max / 50) * 50;
    if (max < 1000) return Math.ceil(max / 100) * 100;
    return Math.ceil(max / 500) * 500;
  }, [salesData]);

  // ✅ FIX: Generate dynamic Y-axis labels based on maxSales
  const yAxisLabels = useMemo(() => {
    if (maxSales <= 0) return [0, 1, 2, 3, 4, 5];
    
    // Generate 6 labels (0 to maxSales) with nice round numbers
    const labels = [];
    const numIntervals = 5; // 5 intervals between 0 and max
    
    // Round maxSales to a nice number for better readability
    let niceMax = maxSales;
    if (maxSales < 10) {
      niceMax = Math.ceil(maxSales);
    } else if (maxSales < 50) {
      niceMax = Math.ceil(maxSales / 5) * 5;
    } else if (maxSales < 100) {
      niceMax = Math.ceil(maxSales / 10) * 10;
    } else {
      niceMax = Math.ceil(maxSales / 50) * 50;
    }
    
    const step = niceMax / numIntervals;
    for (let i = 0; i <= numIntervals; i++) {
      labels.push(Math.round(step * i));
    }
    
    return labels;
  }, [maxSales]);

  const maxCategory = useMemo(() => {
    if (!categoryData || categoryData.length === 0 || !categoryMetadata || categoryMetadata.length === 0) return 30;
    // Calculate max across all categories (using category IDs as keys)
    const allValues = categoryData.flatMap(day => 
      categoryMetadata.map(cat => {
        const catId = cat.id || cat.key;
        return day[catId] || 0;
      })
    );
    return Math.max(...allValues, 10);
  }, [categoryData, categoryMetadata]);

  // ✅ Calculate category totals and sort legend by valuation (highest to lowest)
  const sortedCategoriesForLegend = useMemo(() => {
    if (!categoryData || categoryData.length === 0 || !categoryMetadata || categoryMetadata.length === 0) {
      return [];
    }

    // Calculate total value for each category across all days
    const totals = {};
    
    categoryData.forEach(day => {
      categoryMetadata.forEach(cat => {
        const catId = cat.id || cat.key;
        if (day[catId] !== undefined) {
          totals[catId] = (totals[catId] || 0) + (day[catId] || 0);
        }
      });
    });

    // Create category objects with totals, colors, and bar classes
    const categories = categoryMetadata.map((cat, index) => ({
      id: cat.id || cat.key,
      name: cat.name || 'Uncategorized', // ✅ FIX: Use "Uncategorized" to match backend
      key: cat.id || cat.key,
      value: totals[cat.id || cat.key] || 0,
      className: getCategoryColorClass(index),
      barClassName: getCategoryBarClass(index),
      sortOrder: cat.sortOrder || 0
    }));

    // Sort by value (highest to lowest) for legend
    return categories.sort((a, b) => b.value - a.value);
  }, [categoryData, categoryMetadata]);

  // Calculate line chart points
  const getLinePoints = useMemo(() => {
    if (!salesData || salesData.length === 0) return '';
    const points = salesData.map((item, index) => {
      const x = (index / (salesData.length - 1)) * 560 + 20;
      const y = 180 - ((item.value / maxSales) * 150);
      return `${x},${y}`;
    });
    return points.join(' ');
  }, [salesData, maxSales]);

  // Calculate area fill points
  const getAreaPoints = useMemo(() => {
    if (!salesData || salesData.length === 0) return '20,180 580,180';
    const points = salesData.map((item, index) => {
      const x = (index / (salesData.length - 1)) * 560 + 20;
      const y = 180 - ((item.value / maxSales) * 150);
      return `${x},${y}`;
    });
    return `20,180 ${points} 580,180`;
  }, [salesData, maxSales]);

  // Calculate trend percentage (simplified)
  const calculateTrend = (current, previous) => {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  // Get trend for today vs yesterday
  const todayTrend = useMemo(() => {
    if (!stats?.todayRevenue) return 0;
    // Simplified: compare with previous day (would need historical data)
    return 20.8; // Default trend
  }, [stats]);

  // Calculate trend for Active Products (simplified - would need historical data)
  const activeProductsTrend = useMemo(() => {
    if (!stats?.activeProducts) return 0;
    // Simplified: placeholder trend (would need to compare with previous period)
    // For now, showing a positive trend if active products > 0
    return stats.activeProducts > 0 ? 5.2 : 0;
  }, [stats]);

  // Calculate trend for Inactive Products (simplified - would need historical data)
  const inactiveProductsTrend = useMemo(() => {
    const inactiveCount = (stats?.totalProducts || 0) - (stats?.activeProducts || 0);
    if (inactiveCount === 0) return 0;
    // Simplified: placeholder trend (would need to compare with previous period)
    // For now, showing a negative trend if there are inactive products
    return inactiveCount > 0 ? -2.5 : 0;
  }, [stats]);


  // Loading state
  if (loading) {
    return (
      <ErrorBoundary>
        <TheaterLayout 
          pageTitle="Dashboard" 
          currentPage="dashboard"
          dateFilterProps={{
            dateFilter,
            onOpenModal: () => setShowDateFilterModal(true),
            showButton: true
          }}
        >
          <div className="tadmin-wrapper-clean">
            <div className="tadmin-loading" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '400px',
              gap: '20px'
            }}>
              <div className="tadmin-spinner" style={{
                width: '50px',
                height: '50px',
                border: '4px solid rgba(139, 92, 246, 0.1)',
                borderTop: '4px solid var(--primary-color)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <p style={{ color: 'var(--text-gray)', fontSize: '1rem' }}>Loading dashboard...</p>
            </div>
          </div>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  // Error state
  if (error || !dashboardData) {
    return (
      <ErrorBoundary>
        <TheaterLayout 
          pageTitle="Dashboard" 
          currentPage="dashboard"
          dateFilterProps={{
            dateFilter,
            onOpenModal: () => setShowDateFilterModal(true),
            showButton: true
          }}
        >
          <div className="tadmin-wrapper-clean">
            <div className="tadmin-error">
              <div className="tadmin-error-icon">⚠️</div>
              <h3>Failed to Load Dashboard</h3>
              <p>{error || 'Unable to fetch dashboard data. Please try again later.'}</p>
              <button 
                className="tadmin-retry-btn"
                onClick={handleRetry}
              >
                Retry
              </button>
            </div>
          </div>
          <DateFilter 
            key={`date-filter-error-${showDateFilterModal}`}
            isOpen={showDateFilterModal}
            onClose={() => {
              setShowDateFilterModal(false);
            }}
            initialFilter={dateFilter}
            onApply={handleDateFilterApply}
          />
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  // Render dashboard with dynamic data
  return (
    <ErrorBoundary>
      <TheaterLayout 
        pageTitle="Dashboard" 
        currentPage="dashboard"
        dateFilterProps={{
          dateFilter,
          onOpenModal: () => setShowDateFilterModal(true),
          showButton: true
        }}
      >
        <div className="tadmin-wrapper-clean">
          {/* Top Stats Row */}
          <div className="tadmin-stats-row-clean">
            <div className="tadmin-stat-card-clean tadmin-stat-earning">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">Total Earning</h3>
              </div>
              <div className="tadmin-stat-card-value">
                ₹ {stats.todayRevenue?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
              </div>
              <button 
                className="tadmin-view-more-btn"
                onClick={() => navigate(`/theater-order-history/${theaterId}`)}
              >
                View More
              </button>
            </div>

            <div className="tadmin-stat-card-clean tadmin-stat-profit">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">Active Products</h3>
                <div className="tadmin-mini-chart">
                  <svg viewBox="0 0 60 30" className="svg-chart-mini">
                    <polyline
                      points="0,25 10,20 20,15 30,10 40,12 50,8 60,5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              <div className="tadmin-stat-card-value">
                {stats.activeProducts?.toLocaleString('en-IN') || '0'}
              </div>
              {activeProductsTrend !== 0 && (
                <div className={`tadmin-trend-badge ${activeProductsTrend > 0 ? 'trend-up' : 'trend-down'}`}>
                  <span>{activeProductsTrend > 0 ? '↑' : '↓'}</span> {Math.abs(activeProductsTrend).toFixed(1)}%
                </div>
              )}
             

              <div
  className="tadmin-stat-card-subtitle"
  style={{
    marginTop: '8px',
    fontSize: '14px',
    color: 'black'
  }}
  onMouseEnter={(e) => (e.target.style.color = 'black')}
  onMouseLeave={(e) => (e.target.style.color = 'black')}
>
Active
</div>

            </div>

            <div className="tadmin-stat-card-clean tadmin-stat-sales">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">Inactive Products</h3>
                <div className="tadmin-mini-chart">
                  <svg viewBox="0 0 60 30" className="svg-chart-mini">
                    <polyline
                      points="0,25 10,18 20,12 30,8 40,10 50,6 60,3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              <div className="tadmin-stat-card-value">
                {(stats.totalProducts - stats.activeProducts)?.toLocaleString('en-IN') || '0'}
              </div>
              {inactiveProductsTrend !== 0 && (
                <div className={`tadmin-trend-badge ${inactiveProductsTrend > 0 ? 'trend-up' : 'trend-down'}`}>
                  <span>{inactiveProductsTrend > 0 ? '↑' : '↓'}</span> {Math.abs(inactiveProductsTrend).toFixed(1)}%
                </div>
              )}
            <div
  className="tadmin-stat-card-subtitle"
  style={{
    marginTop: '8px',
    fontSize: '14px',
    color: 'black'
  }}
  onMouseEnter={(e) => (e.target.style.color = 'black')}
  onMouseLeave={(e) => (e.target.style.color = 'black')}
>
  Inactive
</div>

            </div>

            <div className="tadmin-stat-card-clean tadmin-stat-orders">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">Total Orders</h3>
                <div className="tadmin-mini-chart">
                  <svg viewBox="0 0 60 30" className="svg-chart-mini">
                    <polyline
                      points="0,5 10,12 20,18 30,22 40,20 50,24 60,27"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              <div className="tadmin-stat-card-value">
                {stats.totalOrders?.toLocaleString('en-IN') || '0'}
              </div>
              <div className="tadmin-trend-badge trend-down">
                <span>↓</span> {todayTrend.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* ✅ POS, Kiosk, and Online Sales Cards */}
          <div className="tadmin-stats-row-clean tadmin-sales-row" style={{ marginTop: '20px' }}>
            <div className="tadmin-stat-card-clean tadmin-stat-pos">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">POS Sales</h3>
              </div>
              <div className="tadmin-stat-card-value">
                ₹ {stats.posSales?.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
              </div>
              <div className="tadmin-stat-card-subtitle" style={{ marginTop: '8px', fontSize: '14px', color: 'var(--secondary-color)' }}>
                {stats.posSales?.orders?.toLocaleString('en-IN') || '0'} Orders
              </div>
              {/* ✅ Payment Method Breakdown */}
              <div className="tadmin-payment-breakdown" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>Cash:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.posSales?.paymentMethods?.cash?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>UPI:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.posSales?.paymentMethods?.upi?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>Card:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.posSales?.paymentMethods?.card?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
            </div>

            <div className="tadmin-stat-card-clean tadmin-stat-kiosk">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">Kiosk Sales</h3>
              </div>
              <div className="tadmin-stat-card-value">
                ₹ {stats.kioskSales?.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
              </div>
              <div className="tadmin-stat-card-subtitle" style={{ marginTop: '8px', fontSize: '14px', color: 'var(--secondary-color)' }}>
                {stats.kioskSales?.orders?.toLocaleString('en-IN') || '0'} Orders
              </div>
              {/* ✅ Payment Method Breakdown */}
              <div className="tadmin-payment-breakdown" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>Cash:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.kioskSales?.paymentMethods?.cash?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>UPI:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.kioskSales?.paymentMethods?.upi?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>Card:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.kioskSales?.paymentMethods?.card?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
            </div>

            <div className="tadmin-stat-card-clean tadmin-stat-online">
              <div className="tadmin-stat-card-header">
                <h3 className="tadmin-stat-card-title">Online Sales</h3>
              </div>
              <div className="tadmin-stat-card-value">
                ₹ {stats.onlineSales?.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
              </div>
              <div className="tadmin-stat-card-subtitle" style={{ marginTop: '8px', fontSize: '14px', color: 'var(--secondary-color)' }}>
                {stats.onlineSales?.orders?.toLocaleString('en-IN') || '0'} Orders
              </div>
              {/* ✅ Payment Method Breakdown */}
              <div className="tadmin-payment-breakdown" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>Cash:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.onlineSales?.paymentMethods?.cash?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>UPI:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.onlineSales?.paymentMethods?.upi?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="tadmin-payment-item" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ opacity: 0.9 }}>Card:</span>
                  <span style={{ fontWeight: '600' }}>₹ {stats.onlineSales?.paymentMethods?.card?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="tadmin-main-grid">
            {/* Sales Figures Chart */}
            <div className="tadmin-chart-card">
              <div className="tadmin-chart-header">
                <h3 className="tadmin-chart-title">Sales Figures</h3>
                <select 
                  className="tadmin-period-select"
                  value={chartPeriod}
                  onChange={(e) => setChartPeriod(e.target.value)}
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>
              <div className="tadmin-line-chart-container">
                {salesData && salesData.length > 0 ? (
                  <>
                    <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="svg-chart-full">
                      <defs>
                        <linearGradient id="salesGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="var(--primary-color)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="var(--primary-color)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* ✅ FIX: Grid lines based on dynamic Y-axis labels */}
                      {yAxisLabels.map(val => {
                        const y = 180 - ((val / maxSales) * 150);
                        return (
                          <line
                            key={val}
                            x1="20"
                            y1={y}
                            x2="580"
                            y2={y}
                            stroke="var(--secondary-color)"
                            strokeWidth="1"
                            strokeDasharray="4,4"
                            opacity="0.5"
                          />
                        );
                      })}
                      {/* Area fill */}
                      <polygon
                        points={getAreaPoints}
                        fill="url(#salesGradient)"
                      />
                      {/* Line */}
                      <polyline
                        points={getLinePoints}
                        fill="none"
                        stroke="var(--primary-color)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Data points */}
                      {salesData.map((item, index) => {
                        const x = (index / (salesData.length - 1)) * 560 + 20;
                        const y = 180 - ((item.value / maxSales) * 150);
                        return (
                          <g key={index}>
                            <circle
                              cx={x}
                              cy={y}
                              r="4"
                              fill="var(--primary-color)"
                              stroke="#fff"
                              strokeWidth="2"
                            />
                            {index === salesData.length - 1 && (
                              <>
                                <line
                                  x1={x}
                                  y1="0"
                                  x2={x}
                                  y2="180"
                                  stroke="var(--primary-color)"
                                  strokeWidth="1"
                                  strokeDasharray="4,4"
                                  opacity="0.5"
                                />
                                <text
                                  x={x}
                                  y={y - 15}
                                  fill="var(--primary-color)"
                                  fontSize="12"
                                  fontWeight="700"
                                  textAnchor="middle"
                                >
                                  {item.value}
                                </text>
                              </>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    {/* X-axis labels */}
                    <div className="tadmin-chart-labels-x">
                      {salesData.map((item, index) => (
                        <span key={index} className="tadmin-chart-label-x">{item.month}</span>
                      ))}
                    </div>
                    {/* ✅ FIX: Y-axis labels based on dynamic maxSales */}
                    <div className="tadmin-chart-labels-y">
                      {yAxisLabels.map(val => (
                        <span key={val} className="tadmin-chart-label-y">{val}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="tadmin-empty-chart">
                    <p>No sales data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Earning Categories Chart */}
            <div className="tadmin-chart-card">
              <div className="tadmin-chart-header">
                <h3 className="tadmin-chart-title">Earning Categories</h3>
                <select 
                  className="tadmin-period-select"
                  value={categoryPeriod}
                  onChange={(e) => setCategoryPeriod(e.target.value)}
                >
                  <option value="Today">Today</option>
                  <option value="Last week">Last week</option>
                  <option value="Last month">Last month</option>
                </select>
              </div>
              <div className="tadmin-bar-chart-container">
                {categoryData && categoryData.length > 0 && categoryMetadata && categoryMetadata.length > 0 ? (
                  <>
                    <div className="tadmin-bar-chart">
                      {categoryData.map((day, index) => (
                        <div key={index} className="tadmin-bar-group">
                          <div className="tadmin-bars-stack">
                            {/* ✅ Render bars based on actual theater categories */}
                            {categoryMetadata.map((category, catIndex) => {
                              const catId = category.id || category.key;
                              const value = day[catId] || 0;
                              // ✅ FIX: Calculate height - ensure bars with data are visible (minimum 3px or 2%)
                              let heightPercent = 0;
                              if (maxCategory > 0 && value > 0) {
                                heightPercent = (value / maxCategory) * 100;
                                // Ensure minimum visibility for bars with actual data (at least 2% or 3px)
                                heightPercent = Math.max(heightPercent, 2);
                              }
                              return (
                                <div 
                                  key={catId}
                                  className={`tadmin-bar ${getCategoryBarClass(catIndex)}`}
                                  style={{ 
                                    height: `${heightPercent}%`,
                                    minHeight: value > 0 ? '3px' : '0px' // Minimum 3px for bars with data
                                  }}
                                  title={`${category.name}: ${value}k`}
                                ></div>
                              );
                            })}
                          </div>
                          <span className="tadmin-bar-label">{day.day}</span>
                        </div>
                      ))}
                    </div>
                    <div className="tadmin-chart-legend">
                      {/* ✅ Render legend sorted by valuation (highest value first) - using actual theater categories */}
                      {sortedCategoriesForLegend.length > 0 ? (
                        sortedCategoriesForLegend.map((category) => (
                          <div key={category.key || category.id} className="tadmin-legend-item">
                            <span className={`tadmin-legend-color ${category.className}`}></span>
                            <span className="tadmin-legend-label">{category.name}</span>
                          </div>
                        ))
                      ) : (
                        <div className="tadmin-empty-chart">
                          <p>No categories available</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="tadmin-empty-chart">
                    <p>No category data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Last Transaction */}
            <div className="tadmin-transaction-card">
              <div className="tadmin-chart-header">
                <h3 className="tadmin-chart-title">Last Transaction</h3>
                <select 
                  className="tadmin-period-select"
                  value={transactionPeriod}
                  onChange={(e) => setTransactionPeriod(e.target.value)}
                >
                  <option value="Today">Today</option>
                  <option value="Yesterday">Yesterday</option>
                  <option value="This week">This week</option>
                </select>
              </div>
              <div className="tadmin-transaction-list">
                {filteredRecentTransactions && filteredRecentTransactions.length > 0 ? (
                  filteredRecentTransactions.map((transaction) => {
                    // Process image URL
                    let imageUrl = null;
                    const imageField = transaction.image || '';
                    
                    // Check if it's a URL (http/https) or emoji/text
                    if (imageField && typeof imageField === 'string') {
                      if (imageField.startsWith('http://') || imageField.startsWith('https://')) {
                        // It's already a full URL
                        imageUrl = imageField;
                      } else if (imageField.startsWith('/') || imageField.includes('.')) {
                        // It might be a relative path or filename
                        const baseUrl = config.api.baseUrl.endsWith('/') 
                          ? config.api.baseUrl.slice(0, -1) 
                          : config.api.baseUrl;
                        imageUrl = imageField.startsWith('/') 
                          ? `${baseUrl}${imageField}`
                          : `${baseUrl}/${imageField}`;
                      } else {
                        // It's likely an emoji or text - will use fallback
                        imageUrl = null;
                      }
                    }
                    
                    // Get cached image URL for instant loading
                    const processedImageUrl = imageUrl ? getImageSrc(imageUrl) : null;
                    
                    // Determine if we should show image or emoji placeholder
                    const isImageUrl = processedImageUrl && (
                      processedImageUrl.startsWith('http://') || 
                      processedImageUrl.startsWith('https://') ||
                      processedImageUrl.startsWith('data:') ||
                      processedImageUrl.startsWith('/')
                    );
                    
                    return (
                      <div key={transaction.id} className="tadmin-transaction-item">
                        <div className="tadmin-transaction-image">
                          {isImageUrl ? (
                            <InstantImage
                              src={processedImageUrl}
                              alt={transaction.name || 'Product'}
                              className="tadmin-transaction-img"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: '50%',
                                display: 'block'
                              }}
                              onError={(e) => {
                                console.warn('Transaction image failed to load:', processedImageUrl);
                                if (e.target) {
                                  e.target.style.display = 'none';
                                }
                                const container = e.target?.parentElement;
                                if (container) {
                                  const placeholder = container.querySelector('.tadmin-transaction-placeholder');
                                  if (placeholder) {
                                    placeholder.style.display = 'flex';
                                  }
                                }
                              }}
                            />
                          ) : null}
                          <div 
                            className="tadmin-transaction-placeholder"
                            style={{ display: isImageUrl ? 'none' : 'flex' }}
                          >
                            <span className="tadmin-transaction-emoji">
                              {imageField && typeof imageField === 'string' && !imageField.includes('http') && !imageField.includes('.') 
                                ? imageField 
                                : '🍽️'}
                            </span>
                          </div>
                        </div>
                        <div className="tadmin-transaction-info">
                          <div className="tadmin-transaction-name">{transaction.name}</div>
                          <div className="tadmin-transaction-time">{transaction.time}</div>
                        </div>
                        <div className="tadmin-transaction-amount">
                          ₹{transaction.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="tadmin-empty-state">
                    <div className="tadmin-empty-icon">📭</div>
                    <p>No recent transactions</p>
                  </div>
                )}
              </div>
            </div>

            {/* Transaction History - Left - Table Format */}
            <div className="tadmin-specialty-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="tadmin-chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 className="tadmin-chart-title">Transaction History</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--secondary-color)', fontWeight: '600' }}>
                    {Math.min(recentTransactions?.length || 0, 7)}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/theater-order-history/${theaterId}`)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'var(--primary-dark)';
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 8px rgba(139, 92, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'var(--primary-color)';
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 2px 4px rgba(139, 92, 246, 0.3)';
                  }}
                >
                  <span>📋</span>
                  <span>Order History</span>
                </button>
              </div>
              <div className="tadmin-transaction-table-container" style={{ flex: 1, overflowY: 'auto', marginTop: '16px' }}>
                {recentTransactions && recentTransactions.length > 0 ? (
                  <table className="tadmin-transaction-table">
                    <thead className="tadmin-transaction-thead">
                      <tr>
                        <th style={{ width: '140px' }}>Order Number</th>
                        <th style={{ width: '100px' }}>Items</th>
                        <th style={{ width: '110px' }}>Amount</th>
                        <th style={{ width: '110px' }}>Payment Mode</th>
                        <th style={{ width: '120px' }}>Payment Status</th>
                        <th style={{ width: '110px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody className="tadmin-transaction-tbody">
                      {recentTransactions.slice(0, 7).map((transaction, index) => (
                        <tr key={transaction.id || transaction._id} className="tadmin-transaction-row">
                          <td className="tadmin-transaction-order-num">
                            {transaction.orderNumber || transaction.id?.slice(-8) || 'N/A'}
                          </td>
                          <td className="tadmin-transaction-items">
                            {transaction.items || transaction.itemsCount || '0'}
                          </td>
                          <td className="tadmin-transaction-amount-cell">
                            ₹{transaction.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                          </td>
                          <td className="tadmin-transaction-payment-mode">
                            <span className={`tadmin-payment-badge tadmin-payment-${transaction.paymentMethod || 'cash'}`}>
                              {transaction.paymentMethodDisplay || 'Cash'}
                            </span>
                          </td>
                          <td className="tadmin-transaction-payment-status">
                            <span className={`tadmin-status-badge tadmin-status-${transaction.paymentStatus || 'pending'}`}>
                              {transaction.paymentStatusDisplay || 'Pending'}
                            </span>
                          </td>
                          <td className="tadmin-transaction-status">
                            <span className={`tadmin-status-badge tadmin-order-status-${(transaction.status || 'pending').toLowerCase()}`}>
                              {transaction.statusDisplay || transaction.status || 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              ) : (
                <div className="tadmin-empty-state">
                    <div className="tadmin-empty-icon">📭</div>
                    <p style={{ fontSize: '0.875rem' }}>No transactions</p>
                </div>
              )}
              </div>
            </div>

            {/* Payment Methods - Right with Donut Chart */}
            <div className="tadmin-specialty-card">
              <h3 className="tadmin-chart-title">Payment Methods</h3>
              {(() => {
                // Calculate total payment methods from all sales channels
                const totalCash = (stats.posSales?.paymentMethods?.cash || 0) + 
                                 (stats.kioskSales?.paymentMethods?.cash || 0) + 
                                 (stats.onlineSales?.paymentMethods?.cash || 0);
                const totalUpi = (stats.posSales?.paymentMethods?.upi || 0) + 
                                (stats.kioskSales?.paymentMethods?.upi || 0) + 
                                (stats.onlineSales?.paymentMethods?.upi || 0);
                const totalCard = (stats.posSales?.paymentMethods?.card || 0) + 
                                 (stats.kioskSales?.paymentMethods?.card || 0) + 
                                 (stats.onlineSales?.paymentMethods?.card || 0);
                
                const totalAmount = totalCash + totalUpi + totalCard;
                
                if (totalAmount === 0) {
                    return (
                    <div className="tadmin-empty-state">
                      <div className="tadmin-empty-icon">💳</div>
                      <p>No payment data available</p>
                      <p style={{ fontSize: '12px', color: 'var(--secondary-color)', marginTop: '8px' }}>
                        No payment transactions found for the selected date range
                      </p>
                    </div>
                  );
                }
                
                // Calculate percentages
                const cashPercent = (totalCash / totalAmount) * 100;
                const upiPercent = (totalUpi / totalAmount) * 100;
                const cardPercent = (totalCard / totalAmount) * 100;
                
                // Donut chart parameters
                const centerX = 50;
                const centerY = 50;
                const radius = 35;
                const circumference = 2 * Math.PI * radius;
                
                // Calculate stroke dasharray and offset for each segment
                const cashLength = (cashPercent / 100) * circumference;
                const upiLength = (upiPercent / 100) * circumference;
                const cardLength = (cardPercent / 100) * circumference;
                
                // Calculate offsets (each segment starts where the previous one ends)
                const cashOffset = circumference - cashLength;
                const upiOffset = circumference - (cashLength + upiLength);
                const cardOffset = circumference - (cashLength + upiLength + cardLength);
                
                // Calculate rotation angles for each segment
                const cashRotation = -90; // Start from top
                const upiRotation = -90 + (cashPercent / 100) * 360;
                const cardRotation = -90 + ((cashPercent + upiPercent) / 100) * 360;
                
                // Payment method colors
                const cashColor = '#3B82F6'; // Blue
                const upiColor = '#10B981'; // Green
                const cardColor = '#F59E0B'; // Orange/Amber
                
                return (
                  <div className="tadmin-payment-donut-container">
                    <div className="tadmin-donut-chart-wrapper">
                      <svg viewBox="0 0 100 100" className="tadmin-donut-chart-svg">
                        {/* Background circle */}
                            <circle
                          cx={centerX}
                          cy={centerY}
                          r={radius}
                              fill="none"
                          stroke="#E5E7EB"
                              strokeWidth="8"
                            />
                        {/* Cash segment */}
                        {cashPercent > 0 && (
                            <circle
                            cx={centerX}
                            cy={centerY}
                            r={radius}
                              fill="none"
                            stroke={cashColor}
                              strokeWidth="8"
                            strokeDasharray={`${cashLength} ${circumference}`}
                            strokeDashoffset={0}
                              strokeLinecap="round"
                            transform={`rotate(${cashRotation} ${centerX} ${centerY})`}
                            style={{ transition: 'all 0.5s ease' }}
                          />
                        )}
                        {/* UPI segment */}
                        {upiPercent > 0 && (
                          <circle
                            cx={centerX}
                            cy={centerY}
                            r={radius}
                            fill="none"
                            stroke={upiColor}
                            strokeWidth="8"
                            strokeDasharray={`${upiLength} ${circumference}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            transform={`rotate(${upiRotation} ${centerX} ${centerY})`}
                            style={{ transition: 'all 0.5s ease' }}
                          />
                        )}
                        {/* Card segment */}
                        {cardPercent > 0 && (
                          <circle
                            cx={centerX}
                            cy={centerY}
                            r={radius}
                            fill="none"
                            stroke={cardColor}
                            strokeWidth="8"
                            strokeDasharray={`${cardLength} ${circumference}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            transform={`rotate(${cardRotation} ${centerX} ${centerY})`}
                            style={{ transition: 'all 0.5s ease' }}
                          />
                        )}
                      </svg>
                      {/* Center text */}
                      <div className="tadmin-donut-center">
                        <div className="tadmin-donut-center-value">
                          ₹{(totalAmount / 1000).toFixed(0)}k
                        </div>
                        <div className="tadmin-donut-center-label">Total</div>
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="tadmin-payment-legend">
                      <div className="tadmin-legend-item-payment">
                        <span className="tadmin-legend-dot" style={{ backgroundColor: cashColor }}></span>
                        <span className="tadmin-legend-label-payment">Cash</span>
                        <span className="tadmin-legend-value-payment">
                          ₹{totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                          </div>
                      <div className="tadmin-legend-item-payment">
                        <span className="tadmin-legend-dot" style={{ backgroundColor: upiColor }}></span>
                        <span className="tadmin-legend-label-payment">UPI</span>
                        <span className="tadmin-legend-value-payment">
                          ₹{totalUpi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        </div>
                      <div className="tadmin-legend-item-payment">
                        <span className="tadmin-legend-dot" style={{ backgroundColor: cardColor }}></span>
                        <span className="tadmin-legend-label-payment">Card</span>
                        <span className="tadmin-legend-value-payment">
                          ₹{totalCard.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                </div>
                </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Date Filter Modal */}
        <DateFilter 
          key={`date-filter-${showDateFilterModal}`}
          isOpen={showDateFilterModal}
          onClose={() => {
            setShowDateFilterModal(false);
          }}
          initialFilter={dateFilter}
          onApply={handleDateFilterApply}
        />
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default TheaterDashboard;
