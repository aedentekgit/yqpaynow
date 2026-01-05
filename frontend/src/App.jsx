import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import PerformanceProvider from './components/PerformanceProvider';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { useContext } from 'react';
import SettingsContext from './contexts/SettingsContext';
import { ModalProvider } from './contexts/ModalContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { ToastProvider } from './contexts/ToastContext';
import RoleBasedRoute from './components/RoleBasedRoute';
import MobileOnlyRoute from './components/MobileOnlyRoute';
import GlobalOrderNotifications from './components/GlobalOrderNotifications';
// import CachePerformanceMonitor from './components/CachePerformanceMonitor'; // 📊 Global cache performance monitor - REMOVED (dev-only component)
import './utils/withCaching'; // 🚀 AUTO-CACHING: Enables automatic caching for ALL fetch calls
import './utils/prefetch'; // 🚀 INSTANT NAVIGATION: Prefetch on route hover
import { showPerformanceReport } from './utils/withCaching';
import { clearOldImageCache, getImageCacheStats } from './utils/globalImageCache'; // 🖼️ Global image caching
import { fixSvgAttributes } from './utils/fixSvgAttributes'; // 🔧 Fix SVG width/height="auto" errors
import config from './config';
import './styles/App.css';
import './styles/action-buttons.css';

// Lazy load components for better performance
const HomePage = React.lazy(() => import('./home/pages/HomePage'));
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));
const ModalDemo = React.lazy(() => import('./pages/demo/ModalDemo'));
const AddTheater = React.lazy(() => import('./pages/AddTheater'));
const TheaterList = React.lazy(() => import('./pages/TheaterList'));
const TheaterUserManagement = React.lazy(() => import('./pages/TheaterUserManagement'));
const TheaterUserDetails = React.lazy(() => import('./pages/TheaterUserDetails'));
const TheaterUsersArray = React.lazy(() => import('./components/TheaterUsersArray'));
const QRGenerate = React.lazy(() => import('./pages/QRGenerate'));

const QRManagement = React.lazy(() => import('./pages/QRManagement'));
const TheaterQRDetail = React.lazy(() => import('./pages/TheaterQRDetail'));
const QRScanner = React.lazy(() => import('./pages/QRScanner'));
const CustomerLanding = React.lazy(() => import('./pages/customer/CustomerLanding'));
const CustomerHome = React.lazy(() => import('./pages/customer/CustomerHome'));
const CustomerCart = React.lazy(() => import('./pages/customer/CustomerCart'));
const CustomerOrderHistory = React.lazy(() => import('./pages/customer/CustomerOrderHistory'));
const CustomerOrderDetails = React.lazy(() => import('./pages/customer/CustomerOrderDetails'));
const CustomerFavorites = React.lazy(() => import('./pages/customer/CustomerFavorites'));
const CustomerHelpSupport = React.lazy(() => import('./pages/customer/CustomerHelpSupport'));
const CustomerCheckout = React.lazy(() => import('./pages/customer/CustomerCheckout'));
const CustomerPhoneEntry = React.lazy(() => import('./pages/customer/CustomerPhoneEntry'));
const CustomerOTPVerification = React.lazy(() => import('./pages/customer/CustomerOTPVerification'));
const CustomerPayment = React.lazy(() => import('./pages/customer/CustomerPayment'));
const CustomerOrderSuccess = React.lazy(() => import('./pages/customer/CustomerOrderSuccess'));
const QRServiceUnavailable = React.lazy(() => import('./pages/customer/QRServiceUnavailable'));
const RoleCreate = React.lazy(() => import('./pages/RoleCreate'));
const RoleManagementList = React.lazy(() => import('./pages/RoleManagementList'));
const QRCodeNameManagement = React.lazy(() => import('./pages/QRCodeNameManagement'));
const QRCodeNameList = React.lazy(() => import('./pages/QRCodeNameList'));
const RoleAccessManagement = React.lazy(() => import('./pages/RoleAccessManagement'));
const RoleAccessManagementList = React.lazy(() => import('./pages/RoleAccessManagementList'));
const PageAccessManagement = React.lazy(() => import('./pages/PageAccessManagement'));
const PageAccessManagementList = React.lazy(() => import('./pages/PageAccessManagementList'));
const Messages = React.lazy(() => import('./pages/Messages'));
const RoleNameManagementList = React.lazy(() => import('./pages/RoleNameManagementList'));
const RoleNameManagement = React.lazy(() => import('./pages/RoleNameManagement'));
const TransactionList = React.lazy(() => import('./pages/TransactionList'));
const TransactionDetail = React.lazy(() => import('./pages/TransactionDetail'));

// Theater Admin Pages
const TheaterDashboard = React.lazy(() => import('./pages/theater/TheaterDashboard'));
const TheaterSettings = React.lazy(() => import('./pages/theater/TheaterSettings'));
const TheaterMessages = React.lazy(() => import('./pages/theater/TheaterMessages'));
const TheaterAdminList = React.lazy(() => import('./pages/TheaterAdminList'));
const TheaterAdminManagement = React.lazy(() => import('./pages/TheaterAdminManagement'));
const TheaterCategories = React.lazy(() => import('./pages/theater/TheaterCategories'));
const TheaterKioskTypes = React.lazy(() => import('./pages/theater/TheaterKioskTypes'));
const TheaterProductTypes = React.lazy(() => import('./pages/theater/TheaterProductTypes'));
const TheaterOrderHistory = React.lazy(() => import('./pages/theater/TheaterOrderHistory'));
// const StaffOrderHistory = React.lazy(() => import('./pages/theater/StaffOrderHistory')); // ❌ File doesn't exist
const TheaterProductList = React.lazy(() => import('./pages/theater/TheaterProductList'));
const Cafe = React.lazy(() => import('./pages/theater/Cafe'));
const TheaterRoles = React.lazy(() => import('./pages/theater/TheaterRoles')); // ✅ Theater Roles Management
const TheaterRoleAccess = React.lazy(() => import('./pages/theater/TheaterRoleAccess')); // ✅ Theater Role Access Management
const TheaterQRCodeNames = React.lazy(() => import('./pages/theater/TheaterQRCodeNames')); // ✅ Theater QR Code Names
const TheaterGenerateQR = React.lazy(() => import('./pages/theater/TheaterGenerateQR')); // ✅ Theater Generate QR
const TheaterQRManagement = React.lazy(() => import('./pages/theater/TheaterQRManagement')); // ✅ Theater QR Management
const TheaterUserManagementPage = React.lazy(() => import('./pages/theater/TheaterUserManagement')); // ✅ Theater User Management
const TheaterBanner = React.lazy(() => import('./pages/theater/TheaterBanner')); // ✅ Theater Banner Management
const TheaterOffers = React.lazy(() => import('./pages/theater/TheaterOffers')); // ✅ Theater Offers Management
const ComboOffers = React.lazy(() => import('./pages/theater/ComboOffers')); // ✅ Combo Offers Management
const PaymentGatewayList = React.lazy(() => import('./pages/admin/PaymentGatewayList')); // ✅ Payment Gateway List
const TheaterPaymentGatewaySettings = React.lazy(() => import('./pages/admin/TheaterPaymentGatewaySettings')); // ✅ Theater Payment Gateway Settings
const SuperAdminCredentials = React.lazy(() => import('./pages/admin/SuperAdminCredentials')); // ✅ Super Admin Credentials Management
// const CachingDemo = React.lazy(() => import('./pages/demo/CachingDemo')); // 🚀 Caching Performance Demo - REMOVED (demo page)

const StockManagement = React.lazy(() => import('./pages/theater/StockManagement'));
const CafeStockManagement = React.lazy(() => import('./pages/theater/CafeStockManagement'));
const SimpleProductList = React.lazy(() => import('./pages/theater/SimpleProductList'));
const OnlinePOSInterface = React.lazy(() => import('./pages/theater/OnlinePOSInterface'));
const OfflinePOSInterface = React.lazy(() => import('./pages/theater/OfflinePOSInterface')); // 📶 Offline POS
const ViewCart = React.lazy(() => import('./pages/theater/ViewCart'));
const ProfessionalPOSInterface = React.lazy(() => import('./pages/theater/ProfessionalPOSInterface'));
const OnlineOrderHistory = React.lazy(() => import('./pages/theater/OnlineOrderHistory'));
const KioskOrderHistory = React.lazy(() => import('./pages/theater/KioskOrderHistory'));
const AddProduct = React.lazy(() => import('./pages/theater/AddProduct'));
const TheaterReports = React.lazy(() => import('./pages/theater/TheaterReports')); // ✅ Theater Reports
const ProductCancelPage = React.lazy(() => import('./pages/theater/ProductCancelPage')); // ✅ Product Cancel Page
// const TestAddProductDropdowns = React.lazy(() => import('./components/TestAddProductDropdowns')); // REMOVED (test component)
// const AuthDebugPage = React.lazy(() => import('./pages/auth/AuthDebugPage')); // REMOVED (debug page)

// Kiosk Pages
const KioskCheckout = React.lazy(() => import('./pages/theater/KioskCheckout'));
const KioskPayment = React.lazy(() => import('./pages/theater/KioskPayment'));
const KioskViewCart = React.lazy(() => import('./pages/theater/KioskViewCart'));


// 🚀 INSTANT: No loader - show content immediately
const PageLoader = () => (
  <div className="page-loader">
    <div className="loader-container">
      <div className="loader-spinner"></div>
      <p>Loading...</p>
    </div>
  </div>
);

// 🔔 Global notification wrapper - plays audio on ALL pages for new orders
function GlobalNotificationWrapper() {
  const { user, theaterId, userType } = useAuth();

  // Debug log
  console.log('🔊 [GlobalNotificationWrapper] Rendering with:', {
    userType,
    theaterId,
    hasUser: !!user,
    enabled: userType === 'theater' && !!theaterId
  });

  // Only enable for theater users and admins
  const shouldEnable = userType === 'theater' && !!theaterId;

  if (!shouldEnable) {
  }

  return <GlobalOrderNotifications theaterId={theaterId} enabled={shouldEnable} />;
}

// 🔄 Favicon refresh component - refreshes favicon on route changes
function FaviconRefresher() {
  const location = useLocation();

  // ✅ FIX: Safely access SettingsContext - useContext won't throw if context is null
  // This allows the component to work even if SettingsProvider is not available
  const settingsContext = useContext(SettingsContext);
  const generalSettings = settingsContext?.generalSettings || null;

  useEffect(() => {
    // ✅ FIX: Load favicon from localStorage FIRST (instant, before SettingsContext loads)
    try {
      const savedSettings = localStorage.getItem('generalSettings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        if (parsedSettings.logoUrl && parsedSettings.logoUrl !== 'undefined' && parsedSettings.logoUrl !== 'null' && !parsedSettings.logoUrl.startsWith('data:')) {
          const logoApiUrl = `${window.location.origin}/api/settings/image/logo`;
          const cacheBustUrl = `${logoApiUrl}?t=${Date.now()}&cb=${Math.random()}&page=${location.pathname}`;

          // Remove all existing favicon links
          const faviconSelectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[type="image/x-icon"]'
          ];

          faviconSelectors.forEach(selector => {
            const links = document.querySelectorAll(selector);
            links.forEach(link => link.remove());
          });

          // Add new favicon links with multiple sizes
          const faviconTypes = [
            { rel: 'shortcut icon', type: 'image/x-icon', sizes: null },
            { rel: 'icon', type: 'image/png', sizes: '16x16' },
            { rel: 'icon', type: 'image/png', sizes: '32x32' },
            { rel: 'icon', type: 'image/png', sizes: '48x48' },
            { rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180' }
          ];

          faviconTypes.forEach(({ rel, type, sizes }) => {
            const link = document.createElement('link');
            link.rel = rel;
            link.type = type;
            link.href = cacheBustUrl;
            if (sizes) link.sizes = sizes;
            document.head.appendChild(link);
          });
          return; // Exit early if favicon set from localStorage
        }
      }
    } catch (e) {
      // Continue to use generalSettings if localStorage fails
    }

    // ✅ FIX: Fallback to generalSettings from context (if available)
    if (generalSettings?.logoUrl && generalSettings.logoUrl !== 'undefined' && generalSettings.logoUrl !== 'null') {
      const logoApiUrl = `${window.location.origin}/api/settings/image/logo`;

      // ✅ FIX: Prevent duplicate favicon updates
      const lastFaviconUrl = window.__lastFaviconUrl;
      if (lastFaviconUrl === logoApiUrl) {
        // Same URL, skip update to prevent duplicate requests
        return;
      }
      window.__lastFaviconUrl = logoApiUrl;

      const cacheBustUrl = `${logoApiUrl}?t=${Date.now()}&cb=${Math.random()}&page=${location.pathname}`;

      // Remove all existing favicon links
      const faviconSelectors = [
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
        'link[rel="apple-touch-icon-precomposed"]',
        'link[type="image/x-icon"]'
      ];

      faviconSelectors.forEach(selector => {
        const links = document.querySelectorAll(selector);
        links.forEach(link => link.remove());
      });

      // ✅ FIX: Add error handler to favicon links to suppress connection errors
      const createFaviconLink = (rel, type, sizes) => {
        const link = document.createElement('link');
        link.rel = rel;
        link.type = type;
        link.href = cacheBustUrl;
        if (sizes) link.sizes = sizes;

        // ✅ FIX: Suppress error events to prevent console spam when backend is down
        link.addEventListener('error', (e) => {
          // Silently handle favicon load errors - don't spam console
          e.preventDefault();
          e.stopPropagation();
        }, { once: true, passive: true });

        document.head.appendChild(link);
        return link;
      };

      // Add new favicon links with multiple sizes
      const faviconTypes = [
        { rel: 'shortcut icon', type: 'image/x-icon', sizes: null },
        { rel: 'icon', type: 'image/png', sizes: '16x16' },
        { rel: 'icon', type: 'image/png', sizes: '32x32' },
        { rel: 'icon', type: 'image/png', sizes: '48x48' },
        { rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180' }
      ];

      faviconTypes.forEach(({ rel, type, sizes }) => {
        createFaviconLink(rel, type, sizes);
      });

      // Force browser to reload favicon by briefly setting a different URL
      setTimeout(() => {
        const tempLink = document.createElement('link');
        tempLink.rel = 'icon';
        tempLink.href = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
        document.head.appendChild(tempLink);

        setTimeout(() => {
          tempLink.remove();
          const finalLink = document.createElement('link');
          finalLink.rel = 'icon';
          finalLink.type = 'image/png';
          finalLink.href = cacheBustUrl;
          document.head.appendChild(finalLink);
        }, 50);
      }, 50);
    }
  }, [location.pathname, generalSettings?.logoUrl]);

  return null;
}

function App() {
  useEffect(() => {
    // Make performance report available globally for easy access in console
    window.showCacheStats = showPerformanceReport;
    window.getImageCacheStats = getImageCacheStats; // Image cache stats

    // Clear old cached images on app start (no-op now, cache persists 24 hours)
    clearOldImageCache();

    // 🔧 Fix SVG elements with invalid width/height="auto" attributes (from third-party libraries)
    const cleanupSvgFix = fixSvgAttributes();

    // 🔇 Suppress specific React console errors (like SVG width="auto" from third-party libs)
    const originalConsoleError = console.error;
    console.error = (...args) => {
      // Filter out SVG attribute errors
      if (
        args.length > 0 &&
        typeof args[0] === 'string' &&
        (
          args[0].includes('Expected length, "auto"') ||
          args[0].includes('<svg> attribute width: Expected length') ||
          args[0].includes('<svg> attribute height: Expected length')
        )
      ) {
        // Ignore this specific error
        return;
      }
      originalConsoleError.apply(console, args);
    };

    // console.log('🚀 YQPAY Global Auto-Caching is ACTIVE!');
    // console.log('🖼️  Global Image Caching: UNIFIED with Offline POS (24-hour cache)');
    // console.log('⚡ Images load INSTANTLY from base64 cache (same as Offline POS)');
    // console.log('📊 Cache Performance Monitor: Bottom-right corner (minimized by default)');
    // console.log('⌨️  Keyboard Shortcut: Ctrl+Shift+P to toggle cache monitor');
    // console.log('💡 Type window.showCacheStats() to see API cache stats');
    // console.log('🎨 Type window.getImageCacheStats() to see image cache stats');

    return () => {
      if (cleanupSvgFix) cleanupSvgFix();
      console.error = originalConsoleError; // Restore console.error
    };
  }, []);

  return (
    <PerformanceProvider>
      <SettingsProvider>
        <ModalProvider>
          <ToastProvider>
            <CartProvider>
              <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
                <AuthProvider>
                  <GlobalNotificationWrapper />
                  <div className="App">
                    {/* 🔄 Favicon Refresher - Updates favicon on every route change */}
                    <FaviconRefresher />

                    {/* 🚀 Global Cache Performance Monitor - REMOVED (dev-only component) */}
                    {/* <CachePerformanceMonitor position="bottom-right" minimized={true} /> */}

                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/login" element={<LoginPage />} />

                        {/* Customer Routes - Mobile Only Access */}
                        <Route path="/customer" element={<MobileOnlyRoute><CustomerLanding /></MobileOnlyRoute>} />
                        <Route path="/customer/home" element={<MobileOnlyRoute><CustomerHome /></MobileOnlyRoute>} />
                        <Route path="/customer/cart" element={<MobileOnlyRoute><CustomerCart /></MobileOnlyRoute>} />
                        <Route path="/customer/order" element={<MobileOnlyRoute><CustomerHome /></MobileOnlyRoute>} />
                        <Route path="/customer/history" element={<MobileOnlyRoute><CustomerOrderHistory /></MobileOnlyRoute>} />
                        <Route path="/customer/order-history" element={<MobileOnlyRoute><CustomerOrderHistory /></MobileOnlyRoute>} />
                        <Route path="/customer/order-details/:orderId" element={<MobileOnlyRoute><CustomerOrderDetails /></MobileOnlyRoute>} />
                        <Route path="/customer/favorites" element={<MobileOnlyRoute><CustomerFavorites /></MobileOnlyRoute>} />
                        <Route path="/customer/help-support" element={<MobileOnlyRoute><CustomerHelpSupport /></MobileOnlyRoute>} />
                        <Route path="/customer/checkout" element={<MobileOnlyRoute><CustomerCheckout /></MobileOnlyRoute>} />
                        <Route path="/customer/phone-entry" element={<MobileOnlyRoute><CustomerPhoneEntry /></MobileOnlyRoute>} />
                        <Route path="/customer/otp-verification" element={<MobileOnlyRoute><CustomerOTPVerification /></MobileOnlyRoute>} />
                        <Route path="/customer/payment" element={<MobileOnlyRoute><CustomerPayment /></MobileOnlyRoute>} />
                        <Route path="/customer/order-success" element={<MobileOnlyRoute><CustomerOrderSuccess /></MobileOnlyRoute>} />
                        <Route path="/customer/:theaterId/:qrName/:seat/order-confirmation" element={<MobileOnlyRoute><CustomerOrderHistory /></MobileOnlyRoute>} />

                        {/* Caching Performance Demo - REMOVED */}
                        {/* <Route path="/caching-demo" element={<CachingDemo />} /> */}
                        <Route path="/qr-unavailable" element={<MobileOnlyRoute><QRServiceUnavailable /></MobileOnlyRoute>} />

                        {/* QR Code Redirect Route - Redirects scanned QR codes to customer landing */}
                        <Route path="/menu/:theaterId" element={<MobileOnlyRoute><CustomerLanding /></MobileOnlyRoute>} />

                        {/* Super Admin Only Routes */}
                        <Route path="/dashboard" element={<RoleBasedRoute allowedRoles={['super_admin']}><Dashboard /></RoleBasedRoute>} />
                        <Route path="/settings" element={<RoleBasedRoute allowedRoles={['super_admin']}><Settings /></RoleBasedRoute>} />
                        <Route path="/add-theater" element={<RoleBasedRoute allowedRoles={['super_admin']}><AddTheater /></RoleBasedRoute>} />
                        <Route path="/theaters" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterList /></RoleBasedRoute>} />
                        <Route path="/theater-users" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterUserManagement /></RoleBasedRoute>} />
                        <Route path="/theater-users-array" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterUsersArray /></RoleBasedRoute>} />
                        <Route path="/theater-users/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterUserDetails /></RoleBasedRoute>} />
                        <Route path="/roles" element={<RoleBasedRoute allowedRoles={['super_admin']}><RoleManagementList /></RoleBasedRoute>} />
                        <Route path="/roles/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><RoleCreate /></RoleBasedRoute>} />
                        <Route path="/email-notification" element={<RoleBasedRoute allowedRoles={['super_admin']}><RoleNameManagementList /></RoleBasedRoute>} />
                        <Route path="/email-notification/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><RoleNameManagement /></RoleBasedRoute>} />
                        <Route path="/transactions" element={<RoleBasedRoute allowedRoles={['super_admin']}><TransactionList /></RoleBasedRoute>} />
                        <Route path="/transactions/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><TransactionDetail /></RoleBasedRoute>} />
                        <Route path="/qr-names" element={<RoleBasedRoute allowedRoles={['super_admin']}><QRCodeNameList /></RoleBasedRoute>} />
                        <Route path="/qr-names/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><QRCodeNameManagement /></RoleBasedRoute>} />
                        <Route path="/role-access" element={<RoleBasedRoute allowedRoles={['super_admin']}><RoleAccessManagementList /></RoleBasedRoute>} />
                        <Route path="/role-access/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><RoleAccessManagement /></RoleBasedRoute>} />
                        <Route path="/page-access" element={<RoleBasedRoute allowedRoles={['super_admin']}><PageAccessManagementList /></RoleBasedRoute>} />
                        <Route path="/page-access/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><PageAccessManagement /></RoleBasedRoute>} />
                        <Route path="/messages" element={<RoleBasedRoute allowedRoles={['super_admin']}><Messages /></RoleBasedRoute>} />
                        <Route path="/payment-gateway-list" element={<RoleBasedRoute allowedRoles={['super_admin']}><PaymentGatewayList /></RoleBasedRoute>} />
                        <Route path="/payment-gateway-settings/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterPaymentGatewaySettings /></RoleBasedRoute>} />
                        <Route path="/super-admin-credentials" element={<RoleBasedRoute allowedRoles={['super_admin']}><SuperAdminCredentials /></RoleBasedRoute>} />
                        <Route path="/qr-generate" element={<RoleBasedRoute allowedRoles={['super_admin']}><QRGenerate /></RoleBasedRoute>} />

                        <Route path="/qr-management" element={<RoleBasedRoute allowedRoles={['super_admin']}><QRManagement /></RoleBasedRoute>} />
                        <Route path="/qr-theater/:theaterId" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterQRDetail /></RoleBasedRoute>} />
                        <Route path="/qr-scanner" element={<RoleBasedRoute allowedRoles={['super_admin']}><QRScanner /></RoleBasedRoute>} />
                        <Route path="/modal-demo" element={<RoleBasedRoute allowedRoles={['super_admin']}><ModalDemo /></RoleBasedRoute>} />
                        <Route path="/theater-admin" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterAdminList /></RoleBasedRoute>} />
                        <Route path="/theater-admin-management" element={<RoleBasedRoute allowedRoles={['super_admin']}><TheaterAdminManagement /></RoleBasedRoute>} />

                        {/* Theater User Routes - WITH PROPER ROLE-BASED PAGE ACCESS CONTROL */}
                        <Route path="/theater-dashboard/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterDashboardWithId']}><TheaterDashboard /></RoleBasedRoute>} />
                        <Route path="/theater-settings/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterSettingsWithId']}><TheaterSettings /></RoleBasedRoute>} />
                        <Route path="/theater-messages/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterMessages']}><TheaterMessages /></RoleBasedRoute>} />
                        <Route path="/theater-categories/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterCategories']}><TheaterCategories /></RoleBasedRoute>} />
                        <Route path="/theater-kiosk-types/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterKioskTypes']}><TheaterKioskTypes /></RoleBasedRoute>} />
                        <Route path="/theater-product-types/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterProductTypes']}><TheaterProductTypes /></RoleBasedRoute>} />
                        <Route path="/theater-product-types" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterProductTypes']}><TheaterProductTypes /></RoleBasedRoute>} />
                        <Route path="/theater-order-history/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterOrderHistory']}><TheaterOrderHistory /></RoleBasedRoute>} />
                        <Route path="/theater-banner/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterBanner']}><TheaterBanner /></RoleBasedRoute>} />
                        <Route path="/theater-offers/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterOffers']}><TheaterOffers /></RoleBasedRoute>} />
                        <Route path="/combo-offers/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['ComboOffers']}><ComboOffers /></RoleBasedRoute>} />
                        <Route path="/theater-roles/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterRoles']}><TheaterRoles /></RoleBasedRoute>} />
                        <Route path="/theater-role-access/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterRoleAccess']}><TheaterRoleAccess /></RoleBasedRoute>} />
                        <Route path="/theater-qr-code-names/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterQRCodeNames']}><TheaterQRCodeNames /></RoleBasedRoute>} />
                        {/* Theater Generate QR - QR Generation Form (like /qr-generate) */}
                        <Route path="/theater-generate-qr/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterGenerateQR']}><TheaterGenerateQR /></RoleBasedRoute>} />
                        {/* Theater QR Management - QR List/Management Page (like /theater-qr-detail) */}
                        <Route path="/theater-qr-management/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterQRManagement']}><TheaterQRManagement /></RoleBasedRoute>} />
                        <Route path="/theater-user-management/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterUserManagement']}><TheaterUserManagementPage /></RoleBasedRoute>} />
                        <Route path="/theater-products/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterProductList']}><TheaterProductList /></RoleBasedRoute>} />
                        <Route path="/cafe/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['Cafe']}><Cafe /></RoleBasedRoute>} />
                        <Route path="/cafe" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['Cafe']}><Cafe /></RoleBasedRoute>} />
                        <Route path="/theater-stock-management/:theaterId/:productId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} ><StockManagement /></RoleBasedRoute>} />
                        <Route path="/cafe-stock-management/:theaterId/:productId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} ><CafeStockManagement /></RoleBasedRoute>} />
                        {/* <Route path="/test-stock-management/:theaterId/:productId" element={<TestStockManagement />} /> */}
                        <Route path="/simple-products/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['SimpleProductList']}><SimpleProductList /></RoleBasedRoute>} />
                        <Route path="/pos/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['OnlinePOSInterface']}><OnlinePOSInterface /></RoleBasedRoute>} />
                        <Route path="/offline-pos/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['OfflinePOSInterface']}><OfflinePOSInterface /></RoleBasedRoute>} />
                        <Route path="/online-order-history/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['OnlineOrderHistory']}><OnlineOrderHistory /></RoleBasedRoute>} />
                        <Route path="/kiosk-order-history/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['KioskOrderHistory']}><KioskOrderHistory /></RoleBasedRoute>} />
                        <Route path="/view-cart/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']}><ViewCart /></RoleBasedRoute>} />
                        <Route path="/theater-order-pos/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['ProfessionalPOSInterface']}><ProfessionalPOSInterface /></RoleBasedRoute>} />
                        <Route path="/theater-add-product/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['TheaterAddProductWithId']}><AddProduct /></RoleBasedRoute>} />
                        <Route path="/theater-orders/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['OrderManagement']}><TheaterOrderHistory /></RoleBasedRoute>} />
                        <Route path="/theater-reports/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['ReportGeneration']}><TheaterReports /></RoleBasedRoute>} />
                        <Route path="/theater-stock-management/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['StockManagement']}><StockManagement /></RoleBasedRoute>} />
                        <Route path="/product-cancel/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['ProductCancel']}><ProductCancelPage /></RoleBasedRoute>} />

                        {/* Test/Debug Routes - REMOVED */}
                        {/* <Route path="/test-add-product-dropdowns/:theaterId" element={<TestAddProductDropdowns />} /> */}
                        {/* <Route path="/test-add-product-dropdowns" element={<TestAddProductDropdowns />} /> */}
                        {/* <Route path="/auth-debug" element={<AuthDebugPage />} /> */}

                        {/* Kiosk Routes */}
                        <Route path="/kiosk-products/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['KioskProductList']}><SimpleProductList /></RoleBasedRoute>} />
                        <Route path="/kiosk-cart/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['KioskCart']}><KioskViewCart /></RoleBasedRoute>} />
                        <Route path="/kiosk-checkout/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['KioskCheckout']}><KioskCheckout /></RoleBasedRoute>} />
                        <Route path="/kiosk-payment/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['KioskPayment']}><KioskPayment /></RoleBasedRoute>} />
                        <Route path="/kiosk-view-cart/:theaterId" element={<RoleBasedRoute allowedRoles={['theater_user', 'theater_admin', 'super_admin']} requiredPermissions={['KioskViewCart']}><KioskViewCart /></RoleBasedRoute>} />

                      </Routes>
                    </Suspense>
                  </div>
                </AuthProvider>
              </Router>
            </CartProvider>
          </ToastProvider>
        </ModalProvider>
      </SettingsProvider>
    </PerformanceProvider>
  );
}

export default App;