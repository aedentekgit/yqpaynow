import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { filterNavigationByPermissions } from '../../utils/rolePermissions';
import config from '../../config';
import '../../styles/Sidebar.css'; // Import sidebar styles for responsive behavior (includes extracted inline styles)

// Theater-specific icons
const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
  </svg>
);

const IconOrders = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4V2C7 1.45 7.45 1 8 1h8c.55 0 1 .45 1 1v2h5c.55 0 1 .45 1 1s-.45 1-1 1h-1v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V6H2c-.55 0-1-.45-1-1s.45-1 1-1h5zm2-1v1h6V3H9zm-4 3v13h14V6H5z" />
  </svg>
);

const IconCategories = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z" />
  </svg>
);

const IconAddProduct = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z" />
  </svg>
);

const IconProducts = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 6h-2c0-2.21-1.79-4-4-4S10 3.79 10 6H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H8V8h2v2h8V8h2v12zm-9-9h6v2h-6v-2zm0 4h4v2h-4v-2z" />
  </svg>
);

const IconProductStock = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z" />
  </svg>
);

const IconCafe = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z" />
  </svg>
);

const IconProductType = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 3H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 8H4V5h6v6zm10-8h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 8h-6V5h6v6zM10 13H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2zm0 8H4v-6h6v6zm7-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
  </svg>
);

const IconCategoryType = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z" />
  </svg>
);

const IconKioskType = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zm-2-9H8v2h11V8zm0 4H8v2h11v-2zM7 8H5v2h2V8zm0 4H5v2h2v-2z" />
  </svg>
);

const IconPOS = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4h16v2H4V4zm16 4H4c-1.11 0-2 .89-2 2v8c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2v-8c0-1.11-.89-2-2-2zM9 17H7v-2h2v2zm0-3H7v-2h2v2zm3 3h-2v-2h2v2zm0-3h-2v-2h2v2zm3 3h-2v-2h2v2zm0-3h-2v-2h2v2zm5 3h-3v-5h3v5z" />
  </svg>
);

const IconProductName = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
  </svg>
);

const IconOrderInterface = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 6V4c0-1.11.89-2 2-2s2 .89 2 2v2h2c.55 0 1 .45 1 1v11c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V7c0-.55.45-1 1-1h2V4c0-1.11.89-2 2-2s2 .89 2 2v2h8zM6 6h2V4H6v2zm-2 5v2h16v-2H4zm0 6h4v-2H4v2zm6-2h4v2h-4v-2zm6 0h4v2h-4v-2z" />
  </svg>
);

const IconPrinter = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" />
  </svg>
);

const IconOrderHistory = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
  </svg>
);

const IconOnlineOrders = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

const IconKioskOrders = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z" />
  </svg>
);

const IconQRCode = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2z" />
  </svg>
);

const IconGenerateQR = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-4v-4h4v4zm-2-2h2v2h-2v-2zM5 11h4V7H5v4zm2-2h2v2H7V9zM5 19h4v-4H5v4zm2-2h2v2H7v-2zM13 5h4V1h-4v4zm2-2h2v2h-2V3z" />
    <path d="M19 19h-2v2h2v-2zm0-4h-2v2h2v-2zm-4 0h-2v2h2v-2zm4-2h2v2h-2v-2zm0 6h2v2h-2v-2zm-4 0h2v2h-2v-2z" />
    <path d="M20 18h-1v-1h1v1zm0-2h-1v-1h1v1z" />
    <circle cx="20.5" cy="20.5" r="1.5" />
    <path d="M20 20h1v1h-1v-1zm0-1h1v1h-1v-1z" fill="white" />
  </svg>
);

const IconQRCodeNames = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4z" />
  </svg>
);

const IconQRManagement = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4z" />
    <path d="M19 15h-2v2h2v-2zm0 4h-2v2h2v-2zm-4-4h-2v2h2v-2zm4-2h2v2h-2v-2zm0 6h2v2h-2v-2zm-4 0h2v2h-2v-2z" />
    <path d="M13 19h2v2h-2v-2zm0-4h2v2h-2v-2z" />
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
  </svg>
);

const IconProductCancel = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z" />
  </svg>
);

const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 7H17c-.8 0-1.54.37-2.01.99l-2.49 3.2A1 1 0 0 0 12.5 12h2.9l2.6 8zM12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9.5c0-.8-.67-1.5-1.5-1.5S6 8.7 6 9.5V15H4v7h3.5z" />
  </svg>
);

const IconSales = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
  </svg>
);

const IconMessages = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
  </svg>
);

const IconReports = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
  </svg>
);

const IconTheaterBanner = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z" />
  </svg>
);

const IconOffers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7zm11.77 8.27L13 19.54l-4.27-4.27C8.28 14.81 8 14.19 8 13.5c0-1.38 1.12-2.5 2.5-2.5.69 0 1.32.28 1.77.74l.73.72.73-.73c.45-.45 1.08-.73 1.77-.73 1.38 0 2.5 1.12 2.5 2.5 0 .69-.28 1.32-.73 1.77z" />
  </svg>
);

const IconComboOffers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z" />
  </svg>
);

const IconRoleManagement = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
  </svg>
);

const IconRoleAccess = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.65 10C11.7 7.31 8.9 5.5 5.77 6.12c-2.29.46-4.15 2.29-4.63 4.58C.32 14.57 3.26 18 7 18c2.61 0 4.83-1.67 5.65-4H17v2c0 1.1.9 2 2 2s2-.9 2-2v-2c1.1 0 2-.9 2-2s-.9-2-2-2h-8.35zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
  </svg>
);

const IconTheaterUsers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
);

const IconBanner = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-1l2.5-3.21 1.79 2.15 2.5-3.22L21 19H3l3-3.86z" />
  </svg>
);



const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
  </svg>
);

const getIcon = (iconName) => {
  const icons = {
    dashboard: <IconDashboard />,
    orders: <IconOrders />,
    categories: <IconCategories />,
    categorytype: <IconCategoryType />,
    kiosktype: <IconKioskType />,
    pos: <IconPOS />,
    products: <IconProducts />,
    productstock: <IconProductStock />,
    cafe: <IconCafe />,
    producttype: <IconProductType />,
    addproduct: <IconAddProduct />,
    productname: <IconProductName />,
    orderinterface: <IconOrderInterface />,
    printer: <IconPrinter />,
    orderhistory: <IconOrderHistory />,
    onlineorders: <IconOnlineOrders />,
    kioskorders: <IconKioskOrders />,
    qrcode: <IconQRCode />,
    generateqr: <IconGenerateQR />,
    qrcodenames: <IconQRCodeNames />,
    qrmanagement: <IconQRManagement />,
    productcancel: <IconProductCancel />,
    users: <IconUsers />,
    theaterusers: <IconTheaterUsers />,
    sales: <IconSales />,
    messages: <IconMessages />,
    reports: <IconReports />,
    banner: <IconBanner />,
    theaterbanner: <IconTheaterBanner />,
    offers: <IconOffers />,
    combooffers: <IconComboOffers />,
    rolemanagement: <IconRoleManagement />,
    roleaccess: <IconRoleAccess />,
    lock: <IconLock />,
    settings: <IconSettings />
  };
  return icons[iconName] || null;
};

const TheaterSidebar = ({ sidebarOpen, setSidebarOpen, sidebarCollapsed, currentPage = 'dashboard' }) => {
  const navigate = useNavigate();
  const { theaterId, userType, user, rolePermissions } = useAuth();
  const sidebarRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Get effective theater ID - same logic as TheaterDashboard
  let effectiveTheaterId = theaterId;

  // If no theater ID from context, try to extract from user data
  if (!effectiveTheaterId && user) {
    if (user.assignedTheater) {
      effectiveTheaterId = user.assignedTheater._id || user.assignedTheater;
    } else if (user.theater) {
      effectiveTheaterId = user.theater._id || user.theater;
    }
  }

  // Debug logging

  // ✅ USE REAL ROLE PERMISSIONS FROM DATABASE (No hardcoded override)
  let effectiveRolePermissions = rolePermissions;

  if (!effectiveRolePermissions || effectiveRolePermissions.length === 0) {
  } else {
  }

  // All available navigation items
  const allNavigationItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', path: effectiveTheaterId ? `/theater-dashboard/${effectiveTheaterId}` : '/theater-dashboard' },
    { id: 'add-product', icon: 'addproduct', label: 'Add Product', path: effectiveTheaterId ? `/theater-add-product/${effectiveTheaterId}` : '/theater-add-product' },
    { id: 'products', icon: 'productstock', label: 'Product Stock', path: effectiveTheaterId ? `/theater-products/${effectiveTheaterId}` : '/theater-products' },
    { id: 'cafe', icon: 'cafe', label: 'Cafe', path: effectiveTheaterId ? `/cafe/${effectiveTheaterId}` : '/cafe' }, // ✅ Cafe Page
    { id: 'simple-products', icon: 'products', label: 'Simple Products', path: effectiveTheaterId ? `/simple-products/${effectiveTheaterId}` : '/simple-products' }, // ✅ Simple Product List
    { id: 'product-types', icon: 'producttype', label: 'Product Type', path: effectiveTheaterId ? `/theater-product-types/${effectiveTheaterId}` : '/theater-product-types' },
    { id: 'categories', icon: 'categorytype', label: 'Categorie Type', path: effectiveTheaterId ? `/theater-categories/${effectiveTheaterId}` : '/theater-categories' },
    { id: 'kiosk-types', icon: 'kiosktype', label: 'Kiosk Type', path: effectiveTheaterId ? `/theater-kiosk-types/${effectiveTheaterId}` : '/theater-kiosk-types' },
    { id: 'online-pos', icon: 'pos', label: 'POS', path: effectiveTheaterId ? `/pos/${effectiveTheaterId}` : '/pos' },
    { id: 'professional-pos', icon: 'orderinterface', label: 'Professional POS', path: effectiveTheaterId ? `/theater-order-pos/${effectiveTheaterId}` : '/theater-order-pos' }, // ✅ Professional POS Interface
    { id: 'offline-pos', icon: 'orderinterface', label: 'POS', path: effectiveTheaterId ? `/offline-pos/${effectiveTheaterId}` : '/offline-pos' }, // ✅ Offline POS

    { id: 'view-cart', icon: 'orders', label: 'View Cart', path: effectiveTheaterId ? `/view-cart/${effectiveTheaterId}` : '/view-cart' }, // ✅ View Cart
    { id: 'order-history', icon: 'orderhistory', label: 'Order History', path: effectiveTheaterId ? `/theater-order-history/${effectiveTheaterId}` : '/theater-order-history' },
    { id: 'online-order-history', icon: 'onlineorders', label: 'Live Order', path: effectiveTheaterId ? `/online-order-history/${effectiveTheaterId}` : '/online-order-history' },
    { id: 'kiosk-order-history', icon: 'kioskorders', label: 'Kiosk Orders', path: effectiveTheaterId ? `/kiosk-order-history/${effectiveTheaterId}` : '/kiosk-order-history' },
    { id: 'messages', icon: 'messages', label: 'Messages', path: effectiveTheaterId ? `/theater-messages/${effectiveTheaterId}` : '/theater-messages' },
    { id: 'banner', icon: 'theaterbanner', label: 'Theater Banner', path: effectiveTheaterId ? `/theater-banner/${effectiveTheaterId}` : '/theater-banner' }, // ✅ Theater Banner
    { id: 'offers', icon: 'offers', label: 'Offers', path: effectiveTheaterId ? `/theater-offers/${effectiveTheaterId}` : '/theater-offers' }, // ✅ Theater Offers
    { id: 'combo-offers', icon: 'combooffers', label: 'Combo Offers', path: effectiveTheaterId ? `/combo-offers/${effectiveTheaterId}` : '/combo-offers' }, // ✅ Combo Offers
    { id: 'theater-roles', icon: 'rolemanagement', label: 'Role Management', path: effectiveTheaterId ? `/theater-roles/${effectiveTheaterId}` : '/theater-roles' }, // ✅ Theater Roles
    { id: 'theater-role-access', icon: 'roleaccess', label: 'Role Access', path: effectiveTheaterId ? `/theater-role-access/${effectiveTheaterId}` : '/theater-role-access' }, // ✅ Theater Role Access
    { id: 'theater-users', icon: 'theaterusers', label: 'Theater Users', path: effectiveTheaterId ? `/theater-user-management/${effectiveTheaterId}` : '/theater-user-management' }, // ✅ Theater User Management
    { id: 'generate-qr', icon: 'generateqr', label: 'Generate QR', path: effectiveTheaterId ? `/theater-generate-qr/${effectiveTheaterId}` : '/theater-generate-qr' }, // ✅ Theater Generate QR
    { id: 'qr-code-names', icon: 'qrcodenames', label: 'QR Code Names', path: effectiveTheaterId ? `/theater-qr-code-names/${effectiveTheaterId}` : '/theater-qr-code-names' }, // ✅ Theater QR Code Names
    { id: 'qr-management', icon: 'qrmanagement', label: 'QR Management', path: effectiveTheaterId ? `/theater-qr-management/${effectiveTheaterId}` : '/theater-qr-management' }, // ✅ Theater QR Management
    { id: 'stock', icon: 'categories', label: 'Stock Data', path: effectiveTheaterId ? `/theater-stock-management/${effectiveTheaterId}` : '/theater-stock-management' }, // ✅ Stock Management
    { id: 'orders', icon: 'orders', label: 'Orders', path: effectiveTheaterId ? `/theater-orders/${effectiveTheaterId}` : '/theater-orders' }, // ✅ Orders
    { id: 'product-cancel', icon: 'productcancel', label: 'Product Cancel', path: effectiveTheaterId ? `/product-cancel/${effectiveTheaterId}` : '/product-cancel' }, // ✅ Product Cancel
    // { id: 'reports', icon: 'reports', label: 'Reports', path: effectiveTheaterId ? `/theater-reports/${effectiveTheaterId}` : '/theater-reports' }, // ✅ Reports
    { id: 'settings', icon: 'settings', label: 'Settings', path: effectiveTheaterId ? `/theater-settings/${effectiveTheaterId}` : '/theater-settings' },

  ];

  // Filter navigation items based on role permissions
  let navigationItems;

  // ✅ ROLE-BASED FILTERING ENABLED
  // Super admin sees all pages, theater users see only permitted pages

  if (userType === 'super_admin') {

    navigationItems = allNavigationItems;
  } else if (!effectiveRolePermissions || effectiveRolePermissions.length === 0) {

    // ✅ NO DEFAULT PAGES: If no permissions, show nothing
    navigationItems = [];
  } else {

    navigationItems = filterNavigationByPermissions(allNavigationItems, effectiveRolePermissions);
  }


  const handleNavigation = (item) => {
    // Close sidebar on mobile when navigating (use media query for better detection)
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      setSidebarOpen(false);
    }
    // Use React Router navigation instead of window.location.href
    if (item.path) {
      navigate(item.path);
    }
  };

  // Preserve sidebar scroll position
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    // Save scroll position on scroll
    const handleScroll = () => {
      scrollPositionRef.current = sidebar.scrollTop;
      // Save to localStorage for persistence across page changes
      const storageKey = theaterId ? `theater-sidebar-scroll-${theaterId}` : 'theater-sidebar-scroll';
      localStorage.setItem(storageKey, sidebar.scrollTop.toString());
    };

    sidebar.addEventListener('scroll', handleScroll);

    // Restore scroll position after DOM updates
    const restoreScroll = () => {
      const storageKey = theaterId ? `theater-sidebar-scroll-${theaterId}` : 'theater-sidebar-scroll';
      const savedScroll = localStorage.getItem(storageKey);
      if (savedScroll) {
        const savedValue = parseInt(savedScroll, 10);
        const currentValue = sidebar.scrollTop;

        // Restore if:
        // 1. We have a saved position > 0
        // 2. Current position is 0 (likely reset by re-render) OR
        // 3. Current position is significantly different from saved (more than 50px difference)
        if (savedValue > 0 && (currentValue === 0 || Math.abs(currentValue - savedValue) > 50)) {
          sidebar.scrollTop = savedValue;
          scrollPositionRef.current = savedValue;
        }
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      restoreScroll();
    });

    // Also try after a short delay to catch late updates
    const timeoutId = setTimeout(restoreScroll, 100);

    return () => {
      sidebar.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [navigationItems, sidebarCollapsed, theaterId, currentPage]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && window.matchMedia('(max-width: 768px)').matches) {
      // Prevent body scroll when sidebar is open on mobile
      // Store the current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      // Store scroll position for restoration
      return () => {
        // Restore body scroll when sidebar is closed
        const body = document.body;
        const scrollY = body.style.top;
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.overflow = '';
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      };
    }
  }, [sidebarOpen]);

  return (
    <>
      {/* Sidebar Overlay for Mobile - Only show when sidebar is open */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay sidebar-overlay-visible"
          onClick={() => setSidebarOpen(false)}
          onTouchEnd={(e) => {
            // Close on touch for better mobile UX
            e.preventDefault();
            setSidebarOpen(false);
          }}
          aria-label="Close sidebar"
        ></div>
      )}

      {/* Sidebar - Apply 'open' class when sidebarOpen is true (for mobile) */}
      <aside ref={sidebarRef} className={`dashboard-sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'} ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand sidebar-brand-no-padding">
          <img
            src="/images/sidebar.jpeg"
            alt="Theater Logo"
            className="sidebar-logo-image"
          />
        </div>

        <nav className="sidebar-nav">
          {navigationItems.length === 0 ? (
            <div className="sidebar-empty-state" style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #64748b)'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>
                <IconLock />
              </div>
              <p style={{ fontSize: '0.875rem', lineHeight: '1.5', margin: 0 }}>
                {sidebarCollapsed ? 'No Access' : 'No pages available. Contact your administrator to grant access.'}
              </p>
            </div>
          ) : (
            navigationItems.map((item) => {
              const isActive = currentPage === item.id;
              // Debug logging for stock item
              if (item.id === 'stock' || item.id === 'products') {
                console.log('🔍 [TheaterSidebar] Item check:', {
                  itemId: item.id,
                  itemLabel: item.label,
                  currentPage: currentPage,
                  isActive: isActive
                });
              }
              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavigation(item)}
                  data-tooltip={item.label}
                >
                  <span className="nav-icon">{getIcon(item.icon)}</span>
                  <span className="nav-text">{item.label}</span>
                </button>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
};

export default TheaterSidebar;