import React, { useState, useEffect } from 'react';
import '../styles/components/NestedOrderHistory.css';

const NestedOrderHistory = () => {
  const [theaterData, setTheaterData] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  // Fetch theater statistics on component mount
  useEffect(() => {
    fetchTheaterStats();
  }, []);

  const fetchTheaterStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/orders/theater-stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
  } else {
  }
    } catch (error) {
  } finally {
      setLoading(false);
    }
  };

  const fetchNestedOrders = async (year = null, month = null) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      let url = '/api/orders/theater-nested';
      const params = new URLSearchParams();
      if (year) params.append('year', year);
      if (month) params.append('month', month);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTheaterData(data.data);
        
        // Extract orders based on filters
        if (year && month) {
          const yearData = data.data.years.find(y => y.year === year);
          const monthData = yearData?.months.find(m => m.monthNumber === month);
          setOrders(monthData?.orders || []);
        } else if (year) {
          const yearData = data.data.years.find(y => y.year === year);
          const allOrders = yearData?.months.flatMap(m => m.orders) || [];
          setOrders(allOrders);
        } else {
          const allOrders = data.data.years.flatMap(y => 
            y.months.flatMap(m => m.orders)
          );
          setOrders(allOrders);
        }
      } else {
  }
    } catch (error) {
  } finally {
      setLoading(false);
    }
  };

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    fetchNestedOrders(year);
  };

  const handleMonthSelect = (month) => {
    setSelectedMonth(month);
    fetchNestedOrders(selectedYear, month);
  };

  const formatCurrency = (amount) => {
    return `₹${amount.toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-IN');
  };

  if (loading) {
    return (
      <div className="nested-order-history">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading order history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nested-order-history">
      <div className="header">
        <h2>Order History (Nested Structure)</h2>
        <p>Browse orders organized by year and month</p>
      </div>

      {/* Overall Statistics */}
      {stats && (
        <div className="stats-overview">
          <h3>Theater Overview</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Total Orders</h4>
              <p className="stat-value">{stats.overallStats.totalOrders}</p>
            </div>
            <div className="stat-card">
              <h4>Total Revenue</h4>
              <p className="stat-value">{formatCurrency(stats.overallStats.totalRevenue)}</p>
            </div>
            <div className="stat-card">
              <h4>Average Order Value</h4>
              <p className="stat-value">{formatCurrency(stats.overallStats.averageOrderValue)}</p>
            </div>
            <div className="stat-card">
              <h4>Total GST</h4>
              <p className="stat-value">{formatCurrency(stats.overallStats.totalGst)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Year Selection */}
      {stats && stats.yearlyBreakdown.length > 0 && (
        <div className="year-selection">
          <h3>Select Year</h3>
          <div className="year-buttons">
            {stats.yearlyBreakdown.map(yearData => (
              <button
                key={yearData.year}
                className={`year-btn ${selectedYear === yearData.year ? 'active' : ''}`}
                onClick={() => handleYearSelect(yearData.year)}
              >
                <span className="year-label">{yearData.year}</span>
                <span className="year-stats">
                  {yearData.stats.totalOrders} orders • {formatCurrency(yearData.stats.totalRevenue)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Month Selection */}
      {selectedYear && stats && (
        <div className="month-selection">
          <h3>Select Month ({selectedYear})</h3>
          <div className="month-buttons">
            {stats.monthlyBreakdown
              .filter(monthData => monthData.year === selectedYear)
              .map(monthData => (
                <button
                  key={`${monthData.year}-${monthData.monthNumber}`}
                  className={`month-btn ${selectedMonth === monthData.monthNumber ? 'active' : ''}`}
                  onClick={() => handleMonthSelect(monthData.monthNumber)}
                >
                  <span className="month-label">{monthData.month}</span>
                  <span className="month-stats">
                    {monthData.stats.totalOrders} orders • {formatCurrency(monthData.stats.totalRevenue)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Orders List */}
      {orders.length > 0 && (
        <div className="orders-section">
          <h3>
            Orders {selectedYear && `(${selectedYear}${selectedMonth ? ` - ${stats.monthlyBreakdown.find(m => m.monthNumber === selectedMonth)?.month}` : ''})`}
          </h3>
          <div className="orders-list">
            {orders
              .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
              .map((order, index) => (
                <div key={`${order.orderNumber}-${index}`} className="order-card">
                  <div className="order-header">
                    <div className="order-number">
                      <strong>{order.orderNumber}</strong>
                    </div>
                    <div className="order-date">
                      {formatDate(order.orderDate)}
                    </div>
                  </div>
                  
                  <div className="order-details">
                    <div className="customer-info">
                      <p><strong>Customer:</strong> {order.customerName}</p>
                      {order.customerPhone && (
                        <p><strong>Phone:</strong> {order.customerPhone}</p>
                      )}
                    </div>
                    
                    <div className="staff-info">
                      <p><strong>Staff:</strong> {order.createdByName || 'Unknown Staff'}</p>
                      <p className="staff-username">@{order.createdByUsername || 'unknown'}</p>
                    </div>
                    
                    <div className="order-items">
                      <h4>Items ({order.products.length})</h4>
                      {order.products.map((product, idx) => (
                        <div key={idx} className="product-item">
                          <span className="product-name">{product.productName}</span>
                          <span className="product-details">
                            {product.quantity} × {formatCurrency(product.unitPrice)} = {formatCurrency(product.totalPrice)}
                          </span>
                          {product.specialInstructions && (
                            <span className="special-instructions">
                              Note: {product.specialInstructions}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="order-summary">
                      <div className="summary-row">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      <div className="summary-row">
                        <span>GST:</span>
                        <span>{formatCurrency(order.totalGst)}</span>
                      </div>
                      <div className="summary-row total">
                        <span><strong>Total:</strong></span>
                        <span><strong>{formatCurrency(order.totalAmount)}</strong></span>
                      </div>
                    </div>
                    
                    <div className="order-meta">
                      <span className={`status status-${order.status}`}>
                        {order.status.toUpperCase()}
                      </span>
                      <span className="payment-method">
                        {order.paymentMethod.toUpperCase()}
                      </span>
                      {order.orderNotes && (
                        <div className="order-notes">
                          <strong>Notes:</strong> {order.orderNotes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Orders from Stats */}
      {stats && stats.recentOrders.length > 0 && !selectedYear && (
        <div className="recent-orders-section">
          <h3>Recent Orders</h3>
          <div className="recent-orders-list">
            {stats.recentOrders.map((order, index) => (
              <div key={`recent-${order.orderNumber}-${index}`} className="recent-order-item">
                <div className="recent-order-header">
                  <span className="order-number">{order.orderNumber}</span>
                  <span className="order-total">{formatCurrency(order.totalAmount)}</span>
                </div>
                <div className="recent-order-details">
                  <span className="customer-name">{order.customerName}</span>
                  <span className="order-date">{formatDate(order.orderDate)}</span>
                  <span className="staff-name">Staff: {order.createdByName || 'Unknown'}</span>
                  <span className={`status status-${order.status}`}>
                    {order.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && selectedYear && (
        <div className="empty-state">
          <h3>No Orders Found</h3>
          <p>No orders found for the selected time period.</p>
        </div>
      )}
    </div>
  );
};

export default NestedOrderHistory;