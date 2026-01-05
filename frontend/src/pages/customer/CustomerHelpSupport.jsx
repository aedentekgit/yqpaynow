import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import config from '@config';
import '@styles/customer/CustomerHelpSupport.css';
import { ultraFetch, useUltraFetch } from '@utils/ultraFetch';


const CustomerHelpSupport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [theater, setTheater] = useState(null);
  const [loading, setLoading] = useState(true);

  // Extract theater info from URL params
  const urlParams = new URLSearchParams(location.search);
  const theaterId = urlParams.get('theaterid') || urlParams.get('theaterId');

  useEffect(() => {
    if (theaterId) {
      fetchTheaterInfo(theaterId);
    } else {
      setLoading(false);
    }
  }, [theaterId]);

  const fetchTheaterInfo = async (id) => {
    try {
      setLoading(true);
      const data = await ultraFetch(`${config.api.baseUrl}/theaters/${id}`, {}, { cacheTTL: 60000 });
      
      if (data.success && data.data) {
        setTheater(data.data);
      }
    } catch (err) {
  } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // Navigate back to customer home with all saved parameters
    if (theaterId) {
      const params = new URLSearchParams();
      params.set('theaterid', theaterId);
      
      // Get saved values from localStorage to restore state
      const savedQr = localStorage.getItem('customerQrName');
      const savedScreen = localStorage.getItem('customerScreenName');
      const savedSeat = localStorage.getItem('customerSeat');
      
      if (savedQr) params.set('qrName', savedQr);
      if (savedScreen) params.set('screen', savedScreen);
      if (savedSeat) params.set('seat', savedSeat);
      
      navigate(`/customer/home?${params.toString()}`);
    } else {
      navigate(-1);
    }
  };

  const handleCall = () => {
    if (theater?.contactPhone) {
      window.location.href = `tel:${theater.contactPhone}`;
    }
  };

  const handleEmail = () => {
    if (theater?.email) {
      window.location.href = `mailto:${theater.email}`;
    }
  };

  const formatAddress = (address) => {
    if (!address) return 'N/A';
    
    // If address is a string, return it directly
    if (typeof address === 'string') return address;
    
    // If address is an object, format it
    if (typeof address === 'object') {
      const parts = [];
      if (address.street) parts.push(address.street);
      if (address.city) parts.push(address.city);
      if (address.state) parts.push(address.state);
      if (address.country) parts.push(address.country);
      return parts.length > 0 ? parts.join(', ') : 'N/A';
    }
    
    return 'N/A';
  };

  return (
    <div className="help-support-page">
      <div className="help-header">
        <button 
          className="back-button"
          onClick={handleBack}
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="header-content-wrapper">
          <h1 className="help-title">Help & Support</h1>
          {theater?.contactPhone && (
            <p className="header-phone">{theater.contactPhone}</p>
          )}
        </div>
      </div>

      <div className="help-content">
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading theater information...</p>
          </div>
        ) : theater ? (
          <div className="help-card">
            <div className="help-icon-container">
              <svg className="help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <h2>Contact Information</h2>
            <p className="help-description">
              Need assistance? Feel free to reach out to us using the information below.
            </p>

            <div className="info-section">
              {/* Theater Name */}
              <div className="info-item">
                <div className="info-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </div>
                <div className="info-content">
                  <label>Theater Name</label>
                  <p>{theater.name || 'N/A'}</p>
                </div>
              </div>

              {/* Address */}
              {theater.address && (
                <div className="info-item">
                  <div className="info-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </div>
                  <div className="info-content">
                    <label>Address</label>
                    <p>{formatAddress(theater.address)}</p>
                  </div>
                </div>
              )}

              {/* Email */}
              {theater.email && (
                <div className="info-item clickable email-item" onClick={handleEmail}>
                  <div className="info-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </div>
                  <div className="info-content">
                    <label>Email Address</label>
                    <p className="link-text">{theater.email}</p>
                  </div>
                </div>
              )}

              {/* Phone */}
              {theater.contactPhone && (
                <div className="info-item clickable" onClick={handleCall}>
                  <div className="info-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>
                  <div className="info-content">
                    <label>Theater Phone</label>
                    <p className="link-text">{theater.contactPhone}</p>
                  </div>
                  <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              )}
            </div>

            <div className="help-footer">
              <p className="footer-text">
                Our support team is here to help you with any questions or concerns.
              </p>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3>Theater Information Not Available</h3>
            <p>Unable to load theater details at this time.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerHelpSupport;
