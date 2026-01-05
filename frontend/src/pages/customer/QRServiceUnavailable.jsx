import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { unifiedFetch } from '@utils/unifiedFetch';
import config from '@config';
import '../../styles/customer/QRServiceUnavailable.css';
import '../../styles/pages/customer/QRServiceUnavailable.css'; // Extracted inline styles

const QRServiceUnavailable = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qrName = searchParams.get('qrName') || searchParams.get('qrname') || searchParams.get('QRNAME');
  const theaterId = searchParams.get('theaterid') || searchParams.get('theaterId') || searchParams.get('THEATERID');
  
  // ✅ REAL-TIME VALIDATION: Continuously check QR status while user is on maintenance screen
  // This ensures immediate redirect if QR is turned ON while customer is on maintenance screen
  useEffect(() => {
    if (!qrName || !theaterId) {
      // Only poll if QR name and theater ID exist
      return;
    }


    // Check QR status every 5 seconds
    const checkInterval = setInterval(async () => {
      try {
        const encodedQrName = encodeURIComponent(qrName);
        const apiUrl = `${config.api.baseUrl}/single-qrcodes/verify-qr/${encodedQrName}?theaterId=${theaterId}&_t=${Date.now()}`;

        const response = await unifiedFetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, {
          forceRefresh: true, // Always get latest status
          cacheTTL: 0
        });

        // Check status code - if not 403, QR might be active
        const status = response?.status;
        if (status !== 403) {
          // Parse response to check if QR is active
          if (response && typeof response.json === 'function') {
            const data = await response.json();
            
            // Check if QR became active
            if (data.isActive === true || data.isActive === 'true' || (data.success === true && data.isActive !== false)) {
              
              // Get saved parameters from localStorage to reconstruct customer page URL
              const savedScreen = localStorage.getItem('customerScreenName');
              const savedSeat = localStorage.getItem('customerSeat');
              
              // Build customer order page URL with all parameters
              const params = new URLSearchParams();
              params.set('theaterid', theaterId);
              if (qrName) params.set('qrName', qrName);
              if (savedScreen) params.set('screen', savedScreen);
              if (savedSeat) params.set('seat', savedSeat);
              
              // Redirect to customer order page
              navigate(`/customer/order?${params.toString()}`, { replace: true });
              return;
            }
          }
        }
      } catch (error) {
        // Handle errors - if it's not a 403, QR might be active
        if (error.status !== 403 && !error.message?.includes('403')) {
          // Try to parse error response to see if QR is actually active
          try {
            // If unifiedFetch didn't throw a 403, QR might be active
            // Check if we can get a successful response
            const encodedQrName = encodeURIComponent(qrName);
            const apiUrl = `${config.api.baseUrl}/single-qrcodes/verify-qr/${encodedQrName}?theaterId=${theaterId}&_t=${Date.now()}`;
            
            // Try a direct fetch to check status
            const directResponse = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (directResponse.ok) {
              const data = await directResponse.json();
              if (data.isActive === true || (data.success === true && data.isActive !== false)) {
                const savedScreen = localStorage.getItem('customerScreenName');
                const savedSeat = localStorage.getItem('customerSeat');
                const params = new URLSearchParams();
                params.set('theaterid', theaterId);
                if (qrName) params.set('qrName', qrName);
                if (savedScreen) params.set('screen', savedScreen);
                if (savedSeat) params.set('seat', savedSeat);
                navigate(`/customer/order?${params.toString()}`, { replace: true });
                return;
              }
            }
          } catch (directError) {
            // If direct fetch also fails, just log and continue
          }
        } else {
          // 403 error means QR is still inactive, which is expected
        }
      }
    }, 5000); // Check every 5 seconds

    // Cleanup interval on unmount or when dependencies change
    return () => {
      clearInterval(checkInterval);
    };
  }, [qrName, theaterId, navigate]);

  // No navigation - terminal state
  // User cannot go back or navigate to any customer screens

  // Block browser back button
  useEffect(() => {
    // Push current state to history to prevent back navigation
    const blockNavigation = () => {
      window.history.pushState(null, '', window.location.href);
    };

    // Block initial back button
    blockNavigation();

    // Listen for popstate (back button) and block it
    window.addEventListener('popstate', blockNavigation);

    // Cleanup
    return () => {
      window.removeEventListener('popstate', blockNavigation);
    };
  }, []);

  // Prevent context menu and refresh
  useEffect(() => {
    const preventActions = (e) => {
      // Allow normal behavior, just inform user this is a terminal state
      // We don't want to be too aggressive, just make navigation difficult
    };

    // Block refresh with warning
    const preventRefresh = (e) => {
      e.preventDefault();
      e.returnValue = 'This QR code is deactivated. Please contact staff.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', preventRefresh);

    return () => {
      window.removeEventListener('beforeunload', preventRefresh);
    };
  }, []);

  return (
    <div className="qr-unavailable-container">
      <div className="qr-unavailable-content">
        {/* 3D Error Icon/Image */}
        <div className="qr-unavailable-icon-wrapper">
          <div className="qr-unavailable-3d-icon">
            {/* 3D QR Code Error Icon */}
            <svg className="qr-error-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              {/* 3D QR Code Base */}
              <defs>
                <linearGradient id="qrGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#6B0E9B', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#8B2FC9', stopOpacity: 1}} />
                </linearGradient>
                <linearGradient id="qrGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#5A0C82', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#6B0E9B', stopOpacity: 1}} />
                </linearGradient>
                <filter id="shadow">
                  <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.3"/>
                </filter>
              </defs>
              
              {/* QR Code Frame - 3D effect */}
              <g filter="url(#shadow)">
                <rect x="40" y="40" width="120" height="120" rx="12" fill="url(#qrGradient1)" />
                <rect x="45" y="45" width="110" height="110" rx="8" fill="white" opacity="0.95" />
                
                {/* QR Pattern elements */}
                <rect x="55" y="55" width="30" height="30" rx="4" fill="url(#qrGradient2)" />
                <rect x="115" y="55" width="30" height="30" rx="4" fill="url(#qrGradient2)" />
                <rect x="55" y="115" width="30" height="30" rx="4" fill="url(#qrGradient2)" />
                
                {/* Small pattern dots */}
                <rect x="100" y="70" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
                <rect x="100" y="85" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
                <rect x="100" y="100" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
                <rect x="70" y="100" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
                <rect x="85" y="100" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
                <rect x="115" y="100" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
                <rect x="130" y="100" width="8" height="8" rx="2" fill="url(#qrGradient2)" />
              </g>
              
              {/* Error X overlay - 3D */}
              <g className="error-x-overlay">
                <circle cx="100" cy="100" r="40" fill="#FF4444" opacity="0.95" filter="url(#shadow)" />
                <line x1="80" y1="80" x2="120" y2="120" stroke="white" strokeWidth="8" strokeLinecap="round" />
                <line x1="120" y1="80" x2="80" y2="120" stroke="white" strokeWidth="8" strokeLinecap="round" />
              </g>
            </svg>
          </div>
          
          {/* Floating particles */}
          <div className="particle particle-1"></div>
          <div className="particle particle-2"></div>
          <div className="particle particle-3"></div>
        </div>

        {/* Error Message */}
        <div className="qr-unavailable-message">
          <h1 className="qr-unavailable-title">Oops!</h1>
          <h2 className="qr-unavailable-subtitle">Service Not Available</h2>
          {qrName && (
            <div className="qr-name-display" style={{
              marginBottom: '16px',
              padding: '12px 20px',
              backgroundColor: 'rgba(107, 14, 155, 0.1)',
              borderRadius: '12px',
              border: '2px solid rgba(107, 14, 155, 0.3)'
            }}>
              <p style={{
                margin: 0,
                fontSize: '1.1rem',
                fontWeight: 600,
                color: '#6B0E9B'
              }}>
                QR Code: <span style={{ color: '#8B2FC9' }}>{qrName}</span>
              </p>
            </div>
          )}
          <p className="qr-unavailable-text">
            {qrName 
              ? `The QR code "${qrName}" is currently under maintenance and is not available at this time.`
              : 'This QR code has been deactivated or is no longer in service.'
            }
            <br />
            Please contact the staff for assistance.
          </p>
        </div>

        {/* No action buttons - terminal state */}
        <div className="qr-unavailable-notice">
          <p className="qr-notice-text">
            ⚠️ {qrName ? `"${qrName}" is under maintenance` : 'This screen cannot be accessed at this time'}
          </p>
          {qrName && theaterId && (
            <p className="qr-notice-text" style={{
              marginTop: '12px',
              fontSize: '0.9rem',
              color: '#8B2FC9',
              fontStyle: 'italic'
            }}>
              🔄 We're checking automatically - you'll be redirected when service is available again
            </p>
          )}
        </div>

        {/* Decorative elements */}
        <div className="qr-unavailable-decoration">
          <div className="decoration-circle circle-1"></div>
          <div className="decoration-circle circle-2"></div>
          <div className="decoration-circle circle-3"></div>
        </div>
      </div>
    </div>
  );
};

export default QRServiceUnavailable;
