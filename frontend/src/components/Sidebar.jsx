import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { unifiedFetch } from '../utils/unifiedFetch';
import config from '../config';
import '../styles/Sidebar.css'; // Extracted inline styles

// Theater Canteen Management Icons - More relevant and modern
const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>
  </svg>
);

const IconTheaters = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
  </svg>
);

const IconAddTheater = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    {/* Theater building with plus sign */}
    <path d="M12 3L2 7v14h20V7l-10-4zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm4 8H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2z"/>
    <circle cx="19" cy="5" r="4" fill="#10B981"/>
    <path d="M19 3v4M17 5h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconTheaterUsers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);

const IconSuperAdmin = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z"/>
    <path d="M12 17.5l-3.09 1.63.59-3.45-2.5-2.44 3.45-.5L12 9.5l1.55 3.24 3.45.5-2.5 2.44.59 3.45L12 17.5z" opacity="0.8"/>
  </svg>
);

const IconRoles = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1V3H9V1L3 7V9H1V11H3V19C3 20.1 3.9 21 5 21H11V19H5V11H3V9H21M16 12C14.9 12 14 12.9 14 14S14.9 16 16 16 18 15.1 18 14 17.1 12 16 12M24 20V18H18V20C18 21.1 18.9 22 20 22H22C23.1 22 24 21.1 24 20Z"/>
  </svg>
);

const IconCreateRole = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
    <path d="M17 8h-2V6h-2v2h-2v2h2v2h2v-2h2V8z" opacity="0.9"/>
  </svg>
);

const IconRoleAccess = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
  </svg>
);

const IconPageAccess = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8l6-6V4c0-1.1-.9-2-2-2zm4 18l-4-4h4v4zM8 15h8v2H8v-2zm0-4h8v2H8v-2zm0-4h8v2H8V7z"/>
  </svg>
);

const IconQRGenerate = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 11h6V5H3v6zm2-4h2v2H5V7zM3 21h6v-6H3v6zm2-4h2v2H5v-2zM15 5h6v6h-6V5zm4 4h-2V7h2v2z"/>
    <path d="M19 13h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2z" opacity="0.9"/>
    <path d="M11 5h2v4h-2V5zm0 6h2v2h-2v-2zM5 13h2v2H5v-2zm6 0h2v2h-2v-2z"/>
  </svg>
);

const IconQRList = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9h4V5H3v4zm1-3h2v2H4V6zM3 15h4v-4H3v4zm1-3h2v2H4v-2zM9 5v4h4V5H9zm3 3h-2V6h2v3zM9 15h4v-4H9v4zm1-3h2v2h-2v-2z"/>
    <path d="M15 5v4h4V5h-4zm3 3h-2V6h2v3zM15 15h4v-4h-4v4zm1-3h2v2h-2v-2z"/>
    <path d="M3 21h4v-4H3v4zm1-3h2v2H4v-2zM9 21h4v-4H9v4zm1-3h2v2h-2v-2zM15 21h4v-4h-4v4zm1-3h2v2h-2v-2z" opacity="0.9"/>
  </svg>
);

const IconQRNames = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 11h6V5H3v6zm2-4h2v2H5V7zM3 21h6v-6H3v6zm2-4h2v2H5v-2zM13 5h6v6h-6V5zm4 4h-2V7h2v2z"/>
    <path d="M21.41 11.58l-9 9L10 18.17l9-9 2.41 2.41zm-1.91 1.09L17.09 11 16 12.09l2.41 2.41 1.09-1.83z" opacity="0.8"/>
    <path d="M13 13h2v2h-2v-2zm-2 0h2v2h-2v-2zm-2 0h2v2H9v-2zm0 2h2v2H9v-2zm2 0h2v2h-2v-2z"/>
  </svg>
);

const IconOrders = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a1 1 0 0 0-1 1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8a1 1 0 0 0-1-1zM10 6a2 2 0 0 1 4 0v1h-4zm8 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9h2v1a1 1 0 0 0 2 0V9h4v1a1 1 0 0 0 2 0V9h2z"/>
  </svg>
);

const IconSales = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const IconCustomers = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63c-.24-.72-.97-1.37-1.96-1.37h-2.5c-.83 0-1.54.5-1.84 1.22l-1.92 4.53c-.29.7-.14 1.51.36 2.06L15 18.3V22h4zM12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9.5c0-.8-.67-1.5-1.5-1.5S6 8.7 6 9.5V15H4v7h3.5z"/>
  </svg>
);

const IconRefunds = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.5v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.65c.1 1.6 1.18 2.68 2.85 3.02V19h1.71v-1.66c1.48-.33 2.68-1.31 2.68-2.88 0-1.52-1.1-2.63-3.58-3.32z"/>
  </svg>
);

const IconMessages = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
  </svg>
);

const IconEmail = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
  </svg>
);

const IconTransactions = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    {/* Receipt/Transaction list icon */}
    <path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2v14H3v3c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3V2l-1.5 1.5zM19 19c0 .55-.45 1-1 1s-1-.45-1-1v-3H8V5h11v14z"/>
    <path d="M9 7h6v2H9V7zm7 0h1v2h-1V7zm-7 3h6v2H9v-2zm7 0h1v2h-1v-2z"/>
  </svg>
);

const IconInvoices = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8l6-6V4c0-1.1-.9-2-2-2zm4 18l-4-4h4v4zM8 15h8v2H8v-2zm0-4h8v2H8v-2zm0-4h8v2H8V7z"/>
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
  </svg>
);

const IconPayment = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
  </svg>
);

const getIcon = (iconName) => {
  const icons = {
    dashboard: <IconDashboard />,
    theaters: <IconTheaters />,
    'add-theater': <IconAddTheater />,
    'theater-users': <IconTheaterUsers />,
    'theater-admin-management': <IconTheaterUsers />,
    'super-admin': <IconSuperAdmin />,
    roles: <IconRoles />,
    'create-role': <IconCreateRole />,
    'role-access': <IconRoleAccess />,
    'page-access': <IconPageAccess />,
    'qr-generate': <IconQRGenerate />,
    'qr-list': <IconQRList />,
    'qr-names': <IconQRNames />,
    orders: <IconOrders />,
    sales: <IconSales />,
    customers: <IconCustomers />,
    refunds: <IconRefunds />,
    messages: <IconMessages />,
    email: <IconEmail />,
    transactions: <IconTransactions />,
    invoices: <IconInvoices />,
    payment: <IconPayment />,
    settings: <IconSettings />
  };
  return icons[iconName] || null;
};

const Sidebar = ({ sidebarOpen, setSidebarOpen, sidebarCollapsed, currentPage = 'dashboard', userRole = 'super_admin' }) => {
  const navigate = useNavigate();
  const { userType, rolePermissions, theaterId } = useAuth();
  const [theaterLogo, setTheaterLogo] = useState(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const sidebarRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Define navigation items first (before filteredNavigationItems)
  const navigationItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', path: '/dashboard', tooltip: 'Main Dashboard - Overview & Analytics' },
    { id: 'add-theater', icon: 'add-theater', label: 'Add Theater', path: '/add-theater', tooltip: 'Add New Theater - Register Theater Location' },
    { id: 'theaters', icon: 'theaters', label: 'Theater List', path: '/theaters', tooltip: 'Theater Management - View All Theaters' },
    { id: 'payment-gateway', icon: 'payment', label: 'Payment Gateway', path: '/payment-gateway-list', tooltip: 'Payment Gateway Settings - Configure Kiosk & Online APIs' },
    { id: 'page-access', icon: 'page-access', label: 'Page Access', path: '/page-access', tooltip: 'Page Access Control - Manage Page Permissions' },
    { id: 'roles', icon: 'create-role', label: 'Create Role ', path: '/roles', tooltip: 'Role Management - Create & Edit User Roles' },
    { id: 'email-notification', icon: 'email', label: 'Email Notification', path: '/email-notification', tooltip: 'Email Notification Management - Manage Email Notifications' },
    { id: 'role-access', icon: 'role-access', label: 'Role Access', path: '/role-access', tooltip: 'Role Permissions - Configure Role Access Rights' },
    { id: 'theater-users', icon: 'theater-users', label: 'Theater Users', path: '/theater-users', tooltip: 'User Management - Manage Theater Staff & Admins' },
    { id: 'super-admin-credentials', icon: 'super-admin', label: 'Super Admin Credentials', path: '/super-admin-credentials', tooltip: 'Super Admin Credentials - Manage Super Admin Login Credentials' },
    { id: 'messages', icon: 'messages', label: 'Messages', path: '/messages', tooltip: 'Theater Messages - Chat with Theater Users' },
    { id: 'qr-generate', icon: 'qr-generate', label: 'Generate QR', path: '/qr-generate', tooltip: 'QR Generator - Create New QR Codes' },
    { id: 'qr-names', icon: 'qr-names', label: 'QR Code Names', path: '/qr-names', tooltip: 'QR Code Names - Manage QR Names & Seat Classes' },
    { id: 'qr-list', icon: 'qr-list', label: 'QR Management', path: '/qr-management', tooltip: 'QR Management - View & Manage All QR Codes' },
    { id: 'transactions', icon: 'transactions', label: 'Transaction List', path: '/transactions', tooltip: 'Transaction List - View All Theater Transactions (POS, KIOSK, ONLINE)' },
    { id: 'settings', icon: 'settings', label: 'Settings', path: '/settings', tooltip: 'System Settings - Configure Application Settings' }
  ];

  // ✅ FILTER MENU BASED ON ROLE PERMISSIONS (moved before useEffect that uses it)
  const filteredNavigationItems = useMemo(() => {
    // Super admin sees everything
    if (userType === 'super_admin') {
      return navigationItems;
    }

    // Theater users see only pages they have permission for
    if (userType === 'theater_user' || userType === 'theater_admin') {
      if (!rolePermissions || rolePermissions.length === 0) {

        return [];
      }

      const allowedPages = rolePermissions[0]?.permissions
        ?.filter(p => p.hasAccess === true)
        .map(p => p.route) || [];


      return navigationItems.filter(item => {
        // Replace :theaterId in route for comparison
        const itemRoute = item.path.replace(':theaterId', theaterId);
        
        // Check if this menu item's path matches any allowed page route
        const isAllowed = allowedPages.some(allowedRoute => {
          const normalizedAllowed = allowedRoute.replace(':theaterId', theaterId);
          return itemRoute === normalizedAllowed || itemRoute.startsWith(normalizedAllowed);
        });

        if (isAllowed) {
  }

        return isAllowed;
      });
    }

    // Default: show nothing
    return [];
  }, [userType, rolePermissions, theaterId, navigationItems]);

  // Fetch theater logo for theater users
  useEffect(() => {
    const fetchTheaterLogo = async () => {
      if ((userType === 'theater_user' || userType === 'theater_admin') && theaterId) {
        setLogoLoading(true);
        try {
          const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
            headers: {
              'Content-Type': 'application/json'
              // Token is automatically added by unifiedFetch
            }
          }, {
            cacheKey: `theater_${theaterId}`,
            cacheTTL: 300000 // 5 minutes
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.theater && data.theater.theaterPhoto) {
              setTheaterLogo(data.theater.theaterPhoto);
            }
          }
        } catch (error) {
  } finally {
          setLogoLoading(false);
        }
      }
    };

    fetchTheaterLogo();
  }, [userType, theaterId]);

  // Preserve sidebar scroll position
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    // Save scroll position on scroll
    const handleScroll = () => {
      scrollPositionRef.current = sidebar.scrollTop;
      // Save to localStorage for persistence across page changes
      localStorage.setItem('admin-sidebar-scroll', sidebar.scrollTop.toString());
    };

    sidebar.addEventListener('scroll', handleScroll);

    // Restore scroll position after DOM updates
    const restoreScroll = () => {
      const savedScroll = localStorage.getItem('admin-sidebar-scroll');
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
  }, [filteredNavigationItems, sidebarCollapsed, currentPage]);

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

  const handleNavigation = (item, event) => {
    // Prevent default button behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Close sidebar on mobile when navigating (use media query for better detection)
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      setSidebarOpen(false);
    }
    
    // Use React Router navigation instead of window.location.href
    if (item && item.path) {
      try {
        navigate(item.path);
      } catch (error) {
        console.error('Navigation error:', error);
        // Fallback to window.location if navigate fails
        window.location.href = item.path;
      }
    }
  };

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
          {userType === 'super_admin' ? (
            <img 
              src="/images/sidebar.jpeg" 
              alt="Application Logo" 
              className="sidebar-logo-image"
            />
          ) : (userType === 'theater_admin') ? (
            <img 
              src="/images/sidebar.jpeg" 
              alt="Theater Admin Logo" 
              className="sidebar-logo-image"
            />
          ) : (userType === 'theater_user' && theaterLogo) ? (
            <img 
              src={theaterLogo} 
              alt="Theater Logo" 
              className="sidebar-logo-image"
            />
          ) : (
            <img 
              src="/images/sidebar.jpeg" 
              alt="Default Logo" 
              className="sidebar-logo-image"
            />
          )}
        </div>
        
        <nav className="sidebar-nav">
          {filteredNavigationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={(e) => handleNavigation(item, e)}
              data-tooltip={item.tooltip}
              aria-label={item.label}
            >
              <span className="nav-icon">{getIcon(item.icon)}</span>
              <span className="nav-text">{item.label}</span>
              <div className="nav-tooltip">{item.tooltip}</div>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
