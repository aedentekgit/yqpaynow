import React, { useState } from 'react';
import config from '../config';
import '../styles/pages/DashboardContent.css'; // Extracted inline styles

// Dashboard-specific icons (icons that are used in the dashboard content)
const IconSales = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
  </svg>
);

const IconCustomers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 7H17c-.8 0-1.54.37-2.01.99l-2.49 3.2A1 1 0 0 0 12.5 12h2.9l2.6 8zM12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9.5c0-.8-.67-1.5-1.5-1.5S6 8.7 6 9.5V15H4v7h3.5z"/>
  </svg>
);

const IconOrders = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4V2C7 1.45 7.45 1 8 1h8c.55 0 1 .45 1 1v2h5c.55 0 1 .45 1 1s-.45 1-1 1h-1v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V6H2c-.55 0-1-.45-1-1s.45-1 1-1h5zm2-1v1h6V3H9zm-4 3v13h14V6H5z"/>
  </svg>
);

const IconTheaters = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const getIcon = (iconName) => {
  const icons = {
    sales: <IconSales />,
    customers: <IconCustomers />,
    orders: <IconOrders />,
    theaters: <IconTheaters />
  };
  return icons[iconName] || null;
};

/**
 * DashboardContent Component
 * NOTE: This component contains mock data and is not currently used in the application.
 * The main dashboard is Dashboard.jsx (Super Admin) and TheaterDashboard.jsx (Theater Admin).
 * This file is kept for reference but should not be used with mock data.
 * 
 * If you need to use this component, please:
 * 1. Remove all mock/hardcoded data
 * 2. Implement API calls to fetch real data
 * 3. Update to use the same data structure as Dashboard.jsx
 */
const DashboardContent = () => {
  // This component is deprecated and contains mock data
  // All dashboards now use real API data
  return (
    <div className="content-header">
      <div className="deprecated-notice-container">
        <h3>This component is deprecated</h3>
        <p>Please use Dashboard.jsx for Super Admin or TheaterDashboard.jsx for Theater Admin</p>
        <p className="deprecated-notice-text">
          All mock data has been removed. All dashboards now fetch real data from the API.
        </p>
      </div>
    </div>
  );
};

export default DashboardContent;
