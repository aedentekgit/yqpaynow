import React from 'react';
import CustomerHeader from './CustomerHeader';
import CustomerFooter from './CustomerFooter';
import '../../styles/customer/CustomerLayout.css';

const CustomerLayout = ({ 
  children, 
  className = '',
  // Header props
  theater = null,
  screenName = null,
  seatId = null,
  title = null,
  showBack = false,
  onBack = null,
  // Footer props
  activeTab = 'home',
  onHomeClick = null,
  onCategoryClick = null,
  onOrderClick = null,
  onProfileClick = null,
  onHomeNavigation = null,
  // URL parameters for navigation
  theaterid = null,
  screen = null,
  seat = null,
  // Layout props
  showHeader = true,
  showFooter = true
}) => {
  return (
    <div className={`customer-layout ${className}`}>
      <div className="customer-container">
        {/* Header */}
        {showHeader && (
          <CustomerHeader
            theater={theater}
            screenName={screenName}
            seatId={seatId}
            title={title}
            showBack={showBack}
            onBack={onBack}
          />
        )}
        
        {/* Main Content */}
        <div className={`customer-content ${showFooter ? 'with-footer' : ''}`}>
          {children}
        </div>
        
        {/* Footer */}
        {showFooter && (
          <CustomerFooter
            activeTab={activeTab}
            onHomeClick={onHomeNavigation || onHomeClick}
            onCategoryClick={onCategoryClick}
            onOrderClick={onOrderClick}
            onProfileClick={onProfileClick}
            theaterid={theaterid}
            screen={screen}
            seat={seat}
          />
        )}
      </div>
    </div>
  );
};

export default CustomerLayout;