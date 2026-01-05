import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import '../../styles/customer/CustomerFooter.css';

const CustomerFooter = ({ 
  activeTab = 'home',
  className = '',
  onHomeClick = null,
  onCategoryClick = null,
  onOrderClick = null,
  onProfileClick = null
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems, isLoading } = useCart();

  // Get the stored cart count for initial display to prevent flicker
  const [displayCount, setDisplayCount] = useState(() => {
    try {
      const savedCart = localStorage.getItem('yqpay_cart');
      if (savedCart) {
        const items = JSON.parse(savedCart);
        return Array.isArray(items) ? items.reduce((total, item) => total + (item.quantity || 0), 0) : 0;
      }
    } catch (error) {
  }
    return 0;
  });

  // Update display count when cart loads
  useEffect(() => {
    if (!isLoading) {
      setDisplayCount(totalItems);
    }
  }, [totalItems, isLoading]);

  // Default navigation handlers
  const handleHomeClick = () => {
    if (onHomeClick) {
      onHomeClick();
    } else {
      // Navigate to customer home with current URL params if available
      const urlParams = new URLSearchParams(location.search);
      const theaterId = urlParams.get('theaterid');
      const screen = urlParams.get('screen');
      const seat = urlParams.get('seat');
      
      if (theaterId) {
        let url = `/customer/order?theaterid=${theaterId}`;
        if (screen) url += `&screen=${encodeURIComponent(screen)}`;
        if (seat) url += `&seat=${encodeURIComponent(seat)}`;
        navigate(url);
      } else {
        navigate('/customer/order');
      }
    }
  };

  const handleCategoryClick = () => {
    if (onCategoryClick) {
      onCategoryClick();
    } else {
      // For now, same as home - could be extended to show category page
      handleHomeClick();
    }
  };

  const handleOrderClick = () => {
    if (onOrderClick) {
      onOrderClick();
    } else {
      navigate('/customer/checkout');
    }
  };

  const handleProfileClick = () => {
    if (onProfileClick) {
      onProfileClick();
    } else {
      // Navigate to profile page (to be implemented)
      navigate('/customer/profile');
    }
  };

  return (
    <div className={`customer-footer ${className}`}>
      <div className="bottom-nav">
        <button 
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={handleHomeClick}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
          <span className="nav-label">Home</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'category' ? 'active' : ''}`}
          onClick={handleCategoryClick}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
          </svg>
          <span className="nav-label">Category</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'order' ? 'active' : ''}`}
          onClick={handleOrderClick}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
          <span className="nav-label">Order</span>
          {displayCount > 0 && (
            <span className="cart-count">
              {displayCount}
            </span>
          )}
        </button>

        <button 
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={handleProfileClick}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span className="nav-label">Profile</span>
        </button>
      </div>
    </div>
  );
};

export default CustomerFooter;
