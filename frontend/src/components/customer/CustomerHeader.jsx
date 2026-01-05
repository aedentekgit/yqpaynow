import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../../styles/customer/CustomerHeader.css';

const CustomerHeader = ({ 
  theater = null, 
  screenName = null, 
  seatId = null,
  title = null,
  showBack = false,
  onBack = null,
  className = ''
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  // Default back handler for checkout
  const handleDefaultBack = () => {
    if (location.pathname === '/customer/checkout') {
      navigate('/customer/order');
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`customer-header ${className}`}>
      <div className="header-content">
        {/* Show back button if needed */}
        {showBack && (
          <div className="header-back-row">
            <button className="back-btn" onClick={onBack || handleDefaultBack}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/>
              </svg>
            </button>
            <h1 className="page-title">
              {title || 'My Cart'}
            </h1>
            <div className="header-spacer"></div>
          </div>
        )}

        {/* Theater header format */}
        {!showBack && (theater || screenName || seatId) && (
          <>
            {/* Top Row - QR Code Name and Seat Number */}
            <div className="header-top-row">
              <div className="header-left">
                {screenName && (
                  <div className="qr-code-name">
                    {screenName}
                  </div>
                )}
              </div>
              <div className="header-right">
                {seatId && (
                  <div className="seat-number">
                    SEAT: {seatId}
                  </div>
                )}
              </div>
            </div>
            
            {/* Bottom Row - Theater Name */}
            <div className="header-bottom-row">
              <h1 className="page-title">
                {theater ? theater.name : title || 'Loading Theater...'}
              </h1>
            </div>
          </>
        )}

        {/* Simple title header */}
        {!showBack && !theater && !screenName && !seatId && title && (
          <div className="header-simple">
            <h1 className="page-title">{title}</h1>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerHeader;
