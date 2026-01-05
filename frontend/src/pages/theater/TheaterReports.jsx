import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import config from '@config';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import '@styles/pages/theater/TheaterReports.css'; // Extracted inline styles


function TheaterReports() {
  const { theaterId } = useParams();
  const { rolePermissions, user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [myStats, setMyStats] = useState({
    myOrders: 0,
    myRevenue: 0,
    myCategories: []
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Determine user's role
  const userRole = rolePermissions?.[0]?.role?.name || 'Unknown';
  const isTheaterAdmin = userRole === 'Theater Admin';

  // ✅ Fetch user-specific stats on load (for non-admin users)
  useEffect(() => {
    if (!isTheaterAdmin) {
      fetchMyStats();
    }
  }, [isTheaterAdmin, theaterId]);

  const fetchMyStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await unifiedFetch(
        `${config.api.baseUrl}/reports/my-stats/${theaterId}`,
        {
          headers: { 'Content-Type': 'application/json' }
        },
        {
          cacheKey: `reports_my_stats_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMyStats(data.stats);
      } else {
  }
    } catch (error) {
  }
  };

  // ✅ Download Full Report (Theater Admin only)
  const handleDownloadFullReport = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      
      // Build query string
      const params = new URLSearchParams({
        format: 'csv'
      });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await unifiedFetch(
        `${config.api.baseUrl}/reports/full-report/${theaterId}?${params.toString()}`,
        {
          headers: { 'Content-Type': 'application/json' }
        },
        {
          forceRefresh: true, // Don't cache file downloads
          cacheTTL: 0
        }
      );

      if (response.ok) {
        // Download CSV file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `full_report_${theaterId}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setSuccess('✅ Full report downloaded successfully!');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to download report');
      }
    } catch (error) {

      setError('Failed to download report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Download Excel Report
  const handleDownloadExcel = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      
      // Build query string
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await unifiedFetch(
        `${config.api.baseUrl}/reports/excel/${theaterId}?${params.toString()}`,
        {
          headers: { 'Content-Type': 'application/json' }
        },
        {
          forceRefresh: true, // Don't cache file downloads
          cacheTTL: 0
        }
      );

      if (response.ok) {
        // Download Excel file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = startDate ? `_${startDate.replace(/-/g, '')}` : '';
        a.download = `Sales_Report${dateStr}_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setSuccess('✅ Excel report downloaded successfully!');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to download Excel report');
      }
    } catch (error) {

      setError('Failed to download Excel report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Download My Sales Report (All roles)
  const handleDownloadMySales = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      
      // Build query string
      const params = new URLSearchParams({
        format: 'csv'
      });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await unifiedFetch(
        `${config.api.baseUrl}/reports/my-sales/${theaterId}?${params.toString()}`,
        {
          headers: { 'Content-Type': 'application/json' }
        },
        {
          forceRefresh: true, // Don't cache file downloads
          cacheTTL: 0
        }
      );

      if (response.ok) {
        // Download CSV file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my_sales_${user?.username || 'user'}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setSuccess(`✅ ${isTheaterAdmin ? 'Full report' : 'Your sales report'} downloaded successfully!`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to download report');
      }
    } catch (error) {

      setError('Failed to download report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TheaterLayout pageTitle="Reports" currentPage="reports">
      <PageContainer
        title="Sales Reports"
        subtitle={`Download reports for ${isTheaterAdmin ? 'all data' : 'your assigned data'}`}
      >
        {/* ✅ User-specific stats for non-admin */}
        {!isTheaterAdmin && (
          <div className="stats-container stats-container-user">
            <h3 className="stats-title">📊 Your Statistics</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Your Orders</div>
                <div className="stat-value">
                  {myStats.myOrders}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Your Revenue</div>
                <div className="stat-value stat-value-revenue">
                  ₹{myStats.myRevenue.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Your Categories</div>
                <div className="stat-value-categories">
                  {myStats.myCategories.length > 0 ? myStats.myCategories.join(', ') : 'None assigned'}
                </div>
              </div>
            </div>
            <p className="stats-note">
              ℹ️ You can only download reports for your assigned categories
            </p>
          </div>
        )}

        {/* Date Range Filter */}
        <div className="filter-section filter-section-white">
          <h3 className="filter-title">📅 Filter by Date Range (Optional)</h3>
          <div className="filter-form">
            <div>
              <label className="filter-label">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="filter-input"
              />
            </div>
            <div>
              <label className="filter-label">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="filter-input"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="filter-button filter-button-clear"
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>

        {/* Download Buttons */}
        <div className="download-section download-section-white">
          <h3 className="download-title">📥 Download Reports</h3>
          
          <div className="download-buttons">
            {/* Excel Report Button (All users) */}
            <button
              onClick={handleDownloadExcel}
              disabled={loading}
              className={`download-button download-button-primary ${loading ? 'disabled' : ''}`}
            >
              {loading ? '⏳ Downloading...' : '📊 Download Excel Report'}
            </button>

            {/* Theater Admin - Full Report Button */}
            {isTheaterAdmin && (
              <button
                onClick={handleDownloadFullReport}
                disabled={loading}
                className={`download-button download-button-secondary ${loading ? 'disabled' : ''}`}
              >
                {loading ? '⏳ Downloading...' : '� Download CSV (All Data)'}
              </button>
            )}

            {/* My Sales Button (All users) */}
            <button
              onClick={handleDownloadMySales}
              disabled={loading}
              className={`download-button ${isTheaterAdmin ? 'download-button-tertiary' : 'download-button-secondary'} ${loading ? 'disabled' : ''}`}
            >
              {loading ? '⏳ Downloading...' : isTheaterAdmin ? '📈 CSV (My Sales Endpoint)' : '📈 Download My Sales (CSV)'}
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Information Box */}
        <div className={`info-box ${isTheaterAdmin ? 'info-box-admin' : 'info-box-user'}`}>
          <h3 className="info-title">
            {isTheaterAdmin ? '✅ Theater Admin Access' : '⚠️ User-Specific Access'}
          </h3>
          {isTheaterAdmin ? (
           <div>
              <p className="info-paragraph">
                As Theater Admin, you have full access to:
              </p>
              <ul className="info-list">
                <li>✅ Download ALL orders and sales data from ALL users</li>
                <li>✅ Complete financial information</li>
                <li>✅ Data from all categories and products</li>
                <li>✅ Two download options: Full Report or My Sales endpoint</li>
              </ul>
            </div> 
          ) : (
            <div>
              <p className="info-paragraph">
                As <strong>{user?.username || 'user'}</strong> (<strong>{userRole}</strong>), you can download:
              </p>
              <ul className="info-list-spaced">
                <li>✅ Sales data for <strong>YOUR</strong> assigned categories/products only</li>
                <li>✅ Orders within <strong>YOUR</strong> assigned scope</li>
                <li>❌ You CANNOT access other users' data</li>
                <li>❌ You CANNOT download complete financial data</li>
              </ul>
              <p className="info-note">
                <strong>Note:</strong> Even if another user has the same role as you, you cannot see their data.
                Each user can only view and download their own assigned data.
              </p>
            </div>
          )}
        </div>
      </PageContainer>
    </TheaterLayout>
  );
}

export default TheaterReports;
