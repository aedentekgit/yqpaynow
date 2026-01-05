import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext';
import { useToast } from '@contexts/ToastContext';
import config from '@config';
import { unifiedFetch } from '@utils/unifiedFetch';
import { clearCachePattern } from '@utils/cacheUtils';
import '@styles/AddTheater.css'; // Form styling
import '@styles/pages/theater/ProductCancelPage.css';

const ProductCancelPage = () => {
  const { theaterId: paramTheaterId } = useParams();
  const location = useLocation();
  const { user, theaterId: userTheaterId, isLoading: authLoading } = useAuth();
  const { showError, confirm } = useModal();
  const { showSuccess, showError: showToastError } = useToast();

  // ✅ FIX: Initialize all state to clean/default values to ensure consistent initial render
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingProductId, setCancellingProductId] = useState(null);
  const [error, setError] = useState('');

  // Extract theaterId from URL path as fallback if useParams isn't ready
  const extractTheaterIdFromPath = () => {
    const match = location.pathname.match(/\/product-cancel\/([^/]+)/);
    return match ? match[1] : null;
  };

  // Get effective theater ID with fallback - always available from URL
  const theaterId = paramTheaterId || extractTheaterIdFromPath();
  const effectiveTheaterId = theaterId || userTheaterId || user?.assignedTheater?._id || user?.assignedTheater || user?.theater?._id || user?.theater;

  // React Router handles component remounting on route changes typically.
  // We don't need manual state reset with useLayoutEffect unless we are reusing the component instance.
  useEffect(() => {
    // Reset state when path changes (like switching theaters)
    setOrderId('');
    setOrder(null);
    setError('');
    setCancelling(false);
    setCancellingProductId(null);
  }, [location.pathname]);

  // ✅ FIX: Also check for URL query parameters that might load order data
  useEffect(() => {
    // Check if there's an orderId in URL query params and clear it to ensure clean state
    const searchParams = new URLSearchParams(location.search);
    const orderIdParam = searchParams.get('orderId');
    if (orderIdParam) {
      // Clear the orderId from URL to ensure clean state
      const newSearchParams = new URLSearchParams(location.search);
      newSearchParams.delete('orderId');
      const newSearch = newSearchParams.toString();
      const newPath = newSearch ? `${location.pathname}?${newSearch}` : location.pathname;
      window.history.replaceState({}, '', newPath);
    }
  }, [location.search, location.pathname]);

  // Handle order ID input submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!orderId.trim()) {
      setError('Please enter an order ID');
      return;
    }

    if (!effectiveTheaterId) {
      setError('Theater ID is required');
      return;
    }

    setError('');
    setOrder(null);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      // Encode the orderId to handle special characters in order numbers
      const encodedOrderId = encodeURIComponent(orderId.trim());
      const response = await unifiedFetch(
        `${config.api.baseUrl}/orders/theater/${effectiveTheaterId}/${encodedOrderId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        },
        {
          cacheKey: `order_${effectiveTheaterId}_${orderId.trim()}`,
          cacheTTL: 60000, // 1 minute cache
          timeout: 15000, // 15 second timeout to prevent hanging
          forceRefresh: false,
          retry: true,
          maxRetries: 2
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error('Order not found. Please check the order ID or order number and try again.');
        }
        throw new Error(errorData.error || errorData.message || 'Failed to fetch order');
      }

      const data = await response.json();

      // Handle different response formats
      let orderData = null;
      if (data.success && data.data) {
        orderData = data.data;
      } else if (data.order) {
        // Handle case where order is returned directly
        orderData = data.order;
      } else if (data) {
        // Handle case where order is the root object
        orderData = data;
      } else {
        throw new Error('Order not found');
      }

      if (orderData) {
        setOrder(orderData);
        setError(''); // Clear any previous errors
        // Show success toast when order is found (but don't set error state)
        if (showSuccess) {
          showSuccess('Order found successfully');
        }
      } else {
        throw new Error('Order not found');
      }
    } catch (error) {
      console.error('Error fetching order:', error);
      setError(error.message || 'Order not found. Please check the order ID and try again.');
      setOrder(null);
      if (showToastError) {
        showToastError(error.message || 'Order not found');
      }
    }
  };

  // Handle individual product cancellation
  const handleCancelProduct = async (itemId, productName) => {
    if (!order) return;

    // Check if order can be modified
    if (order.status === 'cancelled') {
      showToastError('Cannot cancel products from a cancelled order');
      return;
    }

    if (order.status === 'completed') {
      showToastError('Cannot cancel products from a completed order');
      return;
    }

    // Confirm cancellation
    const confirmed = await confirm({
      title: 'Cancel Product',
      message: `Are you sure you want to cancel "${productName}" from this order? The order total will be updated automatically.`,
      type: 'warning',
      confirmText: 'Yes, Cancel Product',
      cancelText: 'No, Keep Product'
    });

    if (!confirmed) {
      return;
    }

    setCancellingProductId(itemId);
    setError('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await unifiedFetch(
        `${config.api.baseUrl}/orders/theater/${effectiveTheaterId}/${order._id}/products/${itemId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        },
        {
          skipCache: true
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to cancel product');
      }

      const data = await response.json();

      if (data.success) {
        // Clear caches to ensure order history shows updated data
        try {
          clearCachePattern(`/orders/theater/${effectiveTheaterId}`);
          clearCachePattern(`order_${effectiveTheaterId}`);
          clearCachePattern(`order_${effectiveTheaterId}_${orderId.trim()}`);
          clearCachePattern(`theaterOrderHistory_${effectiveTheaterId}`);
          clearCachePattern(`orders_nested_${effectiveTheaterId}`);

          // Clear product/stock caches
          const items = order.items || order.products || [];
          items.forEach(item => {
            if (item.productId) {
              clearCachePattern(`cafe_stock_${effectiveTheaterId}_${item.productId}`);
              clearCachePattern(`stock_${effectiveTheaterId}_${item.productId}`);
            }
          });
          clearCachePattern(`products_${effectiveTheaterId}`);
          clearCachePattern(`api_get_theater-products_${effectiveTheaterId}`);

          // Set localStorage flag to trigger refresh in Cafe Stock Management page
          localStorage.setItem(`stock_updated_${effectiveTheaterId}`, Date.now().toString());

          // ✅ FIX: Dispatch custom event for immediate order history refresh
          window.dispatchEvent(new CustomEvent('orderUpdated', {
            detail: {
              theaterId: effectiveTheaterId,
              orderId: order._id || orderId,
              timestamp: Date.now(),
              source: 'productCancellation',
              type: 'productCancelled'
            }
          }));

          // Also dispatch stockUpdated event for stock management pages
          window.dispatchEvent(new CustomEvent('stockUpdated', {
            detail: {
              theaterId: effectiveTheaterId,
              timestamp: Date.now(),
              source: 'productCancellation'
            }
          }));

        } catch (cacheError) {
          console.warn('⚠️ Failed to clear caches after product cancellation:', cacheError);
        }

        // Reload the order to show updated totals
        if (data.data && data.data.order) {
          setOrder(data.data.order);
        } else if (orderId.trim()) {
          // Re-fetch the order to get updated totals
          try {
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            const encodedOrderId = encodeURIComponent(orderId.trim());
            const refreshResponse = await unifiedFetch(
              `${config.api.baseUrl}/orders/theater/${effectiveTheaterId}/${encodedOrderId}`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  ...(token && { 'Authorization': `Bearer ${token}` })
                }
              },
              {
                cacheKey: `order_${effectiveTheaterId}_${orderId.trim()}`,
                cacheTTL: 0, // Don't cache, get fresh data
                skipCache: true
              }
            );

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              let orderData = null;
              if (refreshData.success && refreshData.data) {
                orderData = refreshData.data;
              } else if (refreshData.order) {
                orderData = refreshData.order;
              } else if (refreshData) {
                orderData = refreshData;
              }

              if (orderData) {
                setOrder(orderData);
              }
            }
          } catch (refreshError) {
            console.warn('Failed to refresh order after product cancellation:', refreshError);
          }
        }

        showSuccess(`Product "${productName}" cancelled successfully. Order total has been updated.`);
        setError('');
      } else {
        throw new Error('Failed to cancel product');
      }
    } catch (error) {
      console.error('Error cancelling product:', error);
      setError(error.message || 'Failed to cancel product. Please try again.');
      if (showToastError) {
        showToastError(error.message || 'Failed to cancel product');
      }
    } finally {
      setCancellingProductId(null);
    }
  };

  // Handle order cancellation
  const handleCancelOrder = async () => {
    if (!order) return;

    // Check if order is already cancelled or completed
    if (order.status === 'cancelled') {
      showToastError('This order is already cancelled');
      return;
    }

    if (order.status === 'completed') {
      showToastError('Cannot cancel a completed order');
      return;
    }

    // Confirm cancellation
    const confirmed = await confirm({
      title: 'Cancel Order',
      message: 'Are you sure you want to cancel this order?',
      type: 'warning',
      confirmText: 'Yes, Cancel Order',
      cancelText: 'No, Keep Order'
    });

    if (!confirmed) {
      return;
    }

    setCancelling(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await unifiedFetch(
        `${config.api.baseUrl}/orders/theater/${effectiveTheaterId}/${order._id}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({ status: 'cancelled' })
        },
        {
          skipCache: true // Don't cache status updates
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to cancel order');
      }

      const data = await response.json();

      if (data.success) {
        // Update order status locally
        setOrder(prev => ({
          ...prev,
          status: 'cancelled',
          updatedAt: new Date().toISOString()
        }));

        // ✅ Clear caches to ensure order history and stock management show updated data
        try {
          // Clear order caches so history pages show updated status
          clearCachePattern(`/orders/theater/${effectiveTheaterId}`);
          clearCachePattern(`order_${effectiveTheaterId}`);
          clearCachePattern(`theaterOrderHistory_${effectiveTheaterId}`);
          clearCachePattern(`orders_nested_${effectiveTheaterId}`);

          // Clear product/stock caches so cafe stock management shows restored stock
          if (order.items || order.products) {
            const items = order.items || order.products || [];
            items.forEach(item => {
              if (item.productId) {
                clearCachePattern(`cafe_stock_${effectiveTheaterId}_${item.productId}`);
                clearCachePattern(`stock_${effectiveTheaterId}_${item.productId}`);
              }
            });
          }
          clearCachePattern(`products_${effectiveTheaterId}`);
          clearCachePattern(`api_get_theater-products_${effectiveTheaterId}`);

          // ✅ Set localStorage flag to trigger refresh in Cafe Stock Management page
          // This ensures the stock table updates even if the page is already open
          localStorage.setItem(`stock_updated_${effectiveTheaterId}`, Date.now().toString());

          // ✅ FIX: Dispatch custom event for immediate order history refresh
          window.dispatchEvent(new CustomEvent('orderUpdated', {
            detail: {
              theaterId: effectiveTheaterId,
              orderId: order._id,
              timestamp: Date.now(),
              source: 'orderCancellation',
              type: 'orderCancelled'
            }
          }));

          // ✅ Dispatch custom event for same-tab refresh (storage event only fires in other tabs)
          // This allows CafeStockManagement to refresh immediately in the same tab
          window.dispatchEvent(new CustomEvent('stockUpdated', {
            detail: {
              theaterId: effectiveTheaterId,
              timestamp: Date.now(),
              source: 'orderCancellation'
            }
          }));

        } catch (cacheError) {
          console.warn('⚠️ Failed to clear caches after cancellation:', cacheError);
        }

        showSuccess('Order cancelled successfully. Stock has been restored to cafe inventory.');
        setError('');
      } else {
        throw new Error('Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      setError(error.message || 'Failed to cancel order. Please try again.');
      if (showToastError) {
        showToastError(error.message || 'Failed to cancel order');
      }
    } finally {
      setCancelling(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return '₹0.00';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Show loading only if auth is loading
  if (authLoading) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Product Cancellation" currentPage="product-cancel">
          <PageContainer title="Product Cancellation">
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div>Loading...</div>
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Product Cancellation" currentPage="product-cancel">
        <PageContainer
          title="Product Cancellation"
        >
          <div className="product-cancel-page">
            {/* Order ID Input Form */}
            <form onSubmit={handleSubmit} className="add-theater-form">
              <div className="form-section">
                <h2>Order Search</h2>
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="orderId">ORDER ID</label>
                    <div className="search-row">
                      <input
                        type="text"
                        id="orderId"
                        value={orderId}
                        onChange={(e) => setOrderId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && orderId.trim()) {
                            e.preventDefault();
                            handleSubmit(e);
                          }
                        }}
                        placeholder="Enter order ID or order number"
                        className="order-id-input"
                      />
                      <button
                        type="submit"
                        className="submit-btn search-order-btn"
                        disabled={!orderId.trim()}
                      >
                        Search Order
                        <span className="btn-icon" style={{ marginLeft: '0.5rem' }}>
                          <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                          </svg>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Error Message */}
            {error && (
              <div className="error-message" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Order Details */}
            {order && (
              <div className="add-theater-form" style={{ marginTop: '2rem' }}>
                <div className="form-section">
                  <div className="order-details-header">
                    <h2>Order Details</h2>
                    <div className="order-status-badge">
                      <span className={`status status-${order.status}`}>
                        {order.status?.toUpperCase() || 'PENDING'}
                      </span>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Order Number</label>
                      <div className="order-info-value">
                        {order.orderNumber || order._id?.toString().slice(-8) || 'N/A'}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Order Date</label>
                      <div className="order-info-value">
                        {formatDate(order.createdAt)}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <div className="order-info-value">
                        <span className={`status-text status-${order.status}`}>
                          {order.status?.toUpperCase() || 'PENDING'}
                        </span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Total Amount</label>
                      <div className="order-info-value order-amount">
                        {formatCurrency(order.pricing?.total || order.totalAmount || 0)}
                      </div>
                    </div>
                    {order.customerName && (
                      <div className="form-group">
                        <label>Customer Name</label>
                        <div className="order-info-value">
                          {order.customerName}
                        </div>
                      </div>
                    )}
                    {order.customerPhone && (
                      <div className="form-group">
                        <label>Customer Phone</label>
                        <div className="order-info-value">
                          {order.customerPhone}
                        </div>
                      </div>
                    )}
                    {order.staffInfo?.username && (
                      <div className="form-group">
                        <label>Staff</label>
                        <div className="order-info-value">
                          {order.staffInfo.username}
                        </div>
                      </div>
                    )}
                    {order.payment?.method && (
                      <div className="form-group">
                        <label>Payment Method</label>
                        <div className="order-info-value">
                          {order.payment.method.toUpperCase()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Items */}
                <div className="form-section" style={{ marginTop: '2rem' }}>
                  <h2>Order Items</h2>
                  <div className="items-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Total</th>
                          {order.status !== 'cancelled' && order.status !== 'completed' && (
                            <th>Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(order.products || order.items || []).map((item, index) => {
                          const itemId = item._id || item.productId;
                          const productName = item.productName || item.name || 'N/A';
                          const isCancelling = cancellingProductId === itemId;

                          return (
                            <tr key={index}>
                              <td>{productName}</td>
                              <td>{item.quantity || 0}</td>
                              <td>{formatCurrency(item.unitPrice || item.price || 0)}</td>
                              <td>
                                {formatCurrency(
                                  (item.unitPrice || item.price || 0) * (item.quantity || 0)
                                )}
                              </td>
                              {order.status !== 'cancelled' && order.status !== 'completed' && (
                                <td>
                                  <button
                                    onClick={() => handleCancelProduct(itemId, productName)}
                                    disabled={isCancelling || cancelling}
                                    className="cancel-product-btn"
                                    style={{
                                      padding: '0.5rem 1rem',
                                      backgroundColor: '#dc2626',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: isCancelling || cancelling ? 'not-allowed' : 'pointer',
                                      opacity: isCancelling || cancelling ? 0.6 : 1,
                                      fontSize: '0.875rem',
                                      fontWeight: '500'
                                    }}
                                  >
                                    {isCancelling ? 'Cancelling...' : 'Cancel'}
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cancel Button */}
                {order.status !== 'cancelled' && order.status !== 'completed' && (
                  <div className="form-section cancel-action-section">
                    <button
                      onClick={handleCancelOrder}
                      className="cancel-order-btn"
                      disabled={cancelling}
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Order'}
                    </button>
                  </div>
                )}

                {order.status === 'cancelled' && (
                  <div className="form-section" style={{ marginTop: '2rem' }}>
                    <div className="cancelled-notice">
                      <span className="cancelled-icon">❌</span>
                      <span>This order has been cancelled</span>
                    </div>
                  </div>
                )}

                {order.status === 'completed' && (
                  <div className="form-section" style={{ marginTop: '2rem' }}>
                    <div className="completed-notice">
                      <span className="completed-icon">✅</span>
                      <span>This order has been completed and cannot be cancelled</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default ProductCancelPage;

