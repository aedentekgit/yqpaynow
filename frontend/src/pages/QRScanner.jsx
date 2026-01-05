import React, { useState, useEffect } from 'react';
import config from '../config';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/QRScanner.css';

const QRScanner = () => {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Set browser title
  useEffect(() => {
    document.title = 'QR Scanner - YQPayNow';
  }, []);

  useEffect(() => {
    // Check if QR data is passed via URL parameters or location state
    const urlParams = new URLSearchParams(location.search);
    const dataParam = urlParams.get('data');
    
    if (dataParam) {
      try {
        const parsedData = JSON.parse(decodeURIComponent(dataParam));
        setQrData(parsedData);
      } catch (err) {
        setError('Invalid QR code data format');
      }
    } else if (location.state?.qrData) {
      setQrData(location.state.qrData);
    }
  }, [location]);

  // Function to simulate scanning QR code (for testing)
  const simulateQRScan = (type) => {
    setLoading(true);
    setTimeout(() => {
      if (type === 'canteen') {
        setQrData({
          type: 'canteen',
          theaterId: '507f1f77bcf86cd799439011',
          theaterName: 'Sabarish Theater',
          canteenName: 'Main Canteen',
          timestamp: Date.now()
        });
      } else {
        setQrData({
          type: 'screen',
          theaterId: '507f1f77bcf86cd799439011',
          theaterName: 'Sabarish Theater',
          screenName: 'Screen - 1',
          seatId: 'A15',
          timestamp: Date.now()
        });
      }
      setLoading(false);
    }, 1000);
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleOrderNow = () => {
    if (qrData) {
      // Navigate to order page with QR data
      navigate('/order', { state: { qrData } });
    }
  };

  if (loading) {
    return (
      <div className="qr-scanner-container">
        <div className="scanner-content">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Scanning QR Code...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="qr-scanner-container">
        <div className="scanner-content">
          <div className="error-message">
            <div className="error-icon">❌</div>
            <h2>Invalid QR Code</h2>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={handleBackToHome}>
              Go Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!qrData) {
    return (
      <div className="qr-scanner-container">
        <div className="scanner-content">
          <div className="scanner-placeholder">
            <h1>QR Code Scanner</h1>
            <p>Scan a QR code to view details</p>
            
            {/* Testing buttons */}
            <div className="test-buttons">
              <h3>For Testing:</h3>
              <button 
                className="btn btn-outline" 
                onClick={() => simulateQRScan('canteen')}
              >
                Test Canteen QR
              </button>
              <button 
                className="btn btn-outline" 
                onClick={() => simulateQRScan('screen')}
              >
                Test Screen QR
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="qr-scanner-container">
      <div className="scanner-content">
        <div className="qr-info-card">
          <div className="card-header">
            <div className="qr-type-badge">
              {qrData.type === 'canteen' ? '🍽️' : '🎬'} {qrData.type.toUpperCase()}
            </div>
            <button className="close-btn" onClick={handleBackToHome}>×</button>
          </div>

          <div className="card-body">
            <div className="theater-info">
              <h1 className="theater-name">{qrData.theaterName}</h1>
              
              {qrData.type === 'canteen' ? (
                <div className="canteen-details">
                  <div className="detail-item">
                    <span className="label">Canteen:</span>
                    <span className="value">{qrData.canteenName}</span>
                  </div>
                  <div className="detail-description">
                    <p>Welcome to our theater canteen! Browse our menu and place your order.</p>
                  </div>
                </div>
              ) : (
                <div className="screen-details">
                  <div className="detail-item">
                    <span className="label">Screen:</span>
                    <span className="value">{qrData.screenName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Seat:</span>
                    <span className="value seat-number">{qrData.seatId}</span>
                  </div>
                  <div className="detail-description">
                    <p>Enjoy your movie experience! Order snacks and beverages from your seat.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="action-buttons">
              <button className="btn btn-primary" onClick={handleOrderNow}>
                {qrData.type === 'canteen' ? 'Browse Menu' : 'Order Snacks'}
              </button>
              <button className="btn btn-secondary" onClick={handleBackToHome}>
                Back to Home
              </button>
            </div>
          </div>

          <div className="card-footer">
            <div className="timestamp">
              Scanned: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;