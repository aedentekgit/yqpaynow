import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import config from '../../config';
import '../../styles/LoginPage.css';
import '../../styles/pages/auth/LoginPage.css'; // Extracted inline styles
import { ultraFetch, useUltraFetch } from '../../utils/ultraFetch';
import { unifiedFetch } from '../../utils/unifiedFetch';


const LoginPage = () => {
  const [formData, setFormData] = useState({
    username: '', // Changed from email to support both email and username
    password: '',
    rememberMe: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false); // Add password visibility state
  const [showPinInput, setShowPinInput] = useState(false); // Show PIN input after password validation
  const [pin, setPin] = useState(''); // 4-digit PIN
  const [pendingAuth, setPendingAuth] = useState(null); // Store pending authentication data
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, userType, theaterId, rolePermissions, isLoading: authLoading } = useAuth();
  const toast = useToast();

  // Helper function to get route from page ID
  const getRouteFromPageId = (pageId, theaterId) => {
    // ✅ BULLETPROOF COMPREHENSIVE PAGE ROUTE MAPPING
    // Generated from App.jsx and pageExtractor.js - covers ALL possible formats
    const pageRouteMap = {
      // ==================== LOWERCASE-HYPHEN FORMAT ====================
      'dashboard': `/theater-dashboard/${theaterId}`,
      'products': `/theater-products/${theaterId}`,
      'cafe': `/cafe/${theaterId}`,
      'simple-products': `/simple-products/${theaterId}`,
      'add-product': `/theater-add-product/${theaterId}`,
      'categories': `/theater-categories/${theaterId}`,
      'product-types': `/theater-product-types/${theaterId}`,
      'kiosk-types': `/theater-kiosk-types/${theaterId}`,
      'pos': `/pos/${theaterId}`,
      'professional-pos': `/theater-order-pos/${theaterId}`,
      'offline-pos': `/offline-pos/${theaterId}`,
      'view-cart': `/view-cart/${theaterId}`,
      'order-history': `/theater-order-history/${theaterId}`,
      'online-order-history': `/online-order-history/${theaterId}`,
      'kiosk-order-history': `/kiosk-order-history/${theaterId}`,
      'orders': `/theater-orders/${theaterId}`,
      'qr-management': `/theater-qr-management/${theaterId}`,
      'qr-code-names': `/theater-qr-code-names/${theaterId}`,
      'generate-qr': `/theater-generate-qr/${theaterId}`,
      'settings': `/theater-settings/${theaterId}`,
      'stock': `/theater-stock-management/${theaterId}`,
      'reports': `/theater-reports/${theaterId}`,
      'messages': `/theater-messages/${theaterId}`,
      'banner': `/theater-banner/${theaterId}`,
      'theater-roles': `/theater-roles/${theaterId}`,
      'theater-role-access': `/theater-role-access/${theaterId}`,
      'theater-users': `/theater-user-management/${theaterId}`,
      'payment-gateway': `/payment-gateway-settings/${theaterId}`,
      
      // ==================== EXACT CAMELCASE FROM PAGEEXTRACTOR.JS ====================
      // Super Admin Pages
      'Dashboard': `/dashboard`,
      'Settings': `/settings`,
      'AddTheater': `/add-theater`,
      'TheaterList': `/theaters`,
      'TheaterUserManagement': `/theater-users`,
      'TheaterUserDetails': `/theater-users/${theaterId}`,
      'RoleCreate': `/roles`,
      'RoleAccessManagement': `/role-access`,
      'PageAccessManagement': `/page-access`,
      'QRGenerate': `/qr-generate`,
      'QRManagement': `/qr-management`,
      'TheaterQRDetail': `/qr-theater/${theaterId}`,
      'QRScanner': `/qr-scanner`,
      'ModalDemo': `/modal-demo`,
      'TheaterAdminList': `/theater-admin`,
      'TheaterAdminManagement': `/theater-admin-management`,
      'Messages': `/messages`,
      'TransactionList': `/transactions`,
      'TransactionDetail': `/transactions/${theaterId}`,
      'PaymentGatewayList': `/payment-gateway`,
      'CachingDemo': `/caching-demo`,
      'AuthDebugPage': `/auth-debug`,
      
      // Theater Admin Pages (with :theaterId parameter)
      'TheaterDashboardWithId': `/theater-dashboard/${theaterId}`,
      'TheaterDashboard': `/theater-dashboard/${theaterId}`,
      'TheaterSettingsWithId': `/theater-settings/${theaterId}`,
      'TheaterSettings': `/theater-settings/${theaterId}`,
      'TheaterCategories': `/theater-categories/${theaterId}`,
      'TheaterKioskTypes': `/theater-kiosk-types/${theaterId}`,
      'TheaterProductTypes': `/theater-product-types/${theaterId}`,
      'TheaterProductList': `/theater-products/${theaterId}`,
      'Cafe': `/cafe/${theaterId}`,
      'TheaterOrderHistory': `/theater-order-history/${theaterId}`,
      'OnlineOrderHistory': `/online-order-history/${theaterId}`,
      'KioskOrderHistory': `/kiosk-order-history/${theaterId}`,
      'StaffOrderHistory': `/staff-order-history/${theaterId}`,
      'TheaterAddProductWithId': `/theater-add-product/${theaterId}`,
      'AddProduct': `/theater-add-product/${theaterId}`,
      'TheaterRoles': `/theater-roles/${theaterId}`,
      'TheaterRoleAccess': `/theater-role-access/${theaterId}`,
      'TheaterQRCodeNames': `/theater-qr-code-names/${theaterId}`,
      'TheaterGenerateQR': `/theater-generate-qr/${theaterId}`,
      'TheaterQRManagement': `/theater-qr-management/${theaterId}`,
      'TheaterUserManagementPage': `/theater-user-management/${theaterId}`,
      'TheaterBanner': `/theater-banner/${theaterId}`,
      'TheaterMessages': `/theater-messages/${theaterId}`,
      'TheaterReports': `/theater-reports/${theaterId}`,
      'TheaterPaymentGatewaySettings': `/payment-gateway-settings/${theaterId}`,
      
      // POS & Cart Pages
      'OnlinePOSInterface': `/pos/${theaterId}`,
      'OfflinePOSInterface': `/offline-pos/${theaterId}`,
      'ProfessionalPOSInterface': `/theater-order-pos/${theaterId}`,
      'ViewCart': `/view-cart/${theaterId}`,
      'KioskCheckout': `/kiosk-checkout/${theaterId}`,
      'KioskPayment': `/kiosk-payment/${theaterId}`,
      'KioskViewCart': `/kiosk-view-cart/${theaterId}`,
      
      // Stock & Product Management
      'StockManagement': `/theater-stock-management/${theaterId}`,
      'SimpleProductList': `/simple-products/${theaterId}`,
      
      // Customer Pages
      'CustomerLanding': `/customer`,
      'CustomerHome': `/customer/home`,
      'CustomerCart': `/customer/cart`,
      'CustomerOrderHistory': `/customer/orders`,
      'CustomerOrderDetails': `/customer/orders/${theaterId}`,
      'CustomerFavorites': `/customer/favorites`,
      'CustomerHelpSupport': `/customer/help`,
      'CustomerCheckout': `/customer/checkout`,
      'CustomerPhoneEntry': `/customer/phone`,
      'CustomerOTPVerification': `/customer/verify`,
      'CustomerPayment': `/customer/payment`,
      'CustomerOrderSuccess': `/customer/success`,
      'QRServiceUnavailable': `/qr-unavailable`
    };
    
    const route = pageRouteMap[pageId];
    
    if (!route) {
      console.error(`❌ [getRouteFromPageId] No route found for pageId: "${pageId}"`);
      console.error(`❌ [getRouteFromPageId] Searched in ${Object.keys(pageRouteMap).length} mappings`);
      console.error('❌ [getRouteFromPageId] Available page IDs:', Object.keys(pageRouteMap).slice(0, 20).join(', '), '...');
    }
    
    return route || null;
  };

  // Set browser tab title
  useEffect(() => {
    document.title = 'Login - YQPayNow';
  }, []);

  // ✅ REDIRECT LOGIC: Check if user is already authenticated (e.g., page refresh)
  useEffect(() => {
    // Only run redirect logic if coming from a page refresh or direct URL access
    // NOT during active login flow (handled in handlePinSubmit)
    if (!authLoading && isAuthenticated && !showPinInput) {

      // Redirect based on user type
      if (userType === 'theater_user' || userType === 'theater_admin') {
        if (theaterId) {
          // ✅ Navigate to FIRST ACCESSIBLE PAGE based on role permissions
          if (rolePermissions && rolePermissions.length > 0 && rolePermissions[0].permissions) {
            const accessiblePages = rolePermissions[0].permissions.filter(p => p.hasAccess === true);
            if (accessiblePages.length > 0) {
              const firstPage = accessiblePages[0];
              // Get route from page ID using helper function
              const firstRoute = firstPage.route 
                ? firstPage.route.replace(':theaterId', theaterId)
                : getRouteFromPageId(firstPage.page, theaterId);
              
              if (firstRoute) {
                navigate(firstRoute, { replace: true });
                return;
              }
            }
          }
          // ✅ NO DEFAULT PAGES: If no accessible pages, redirect to login with error
          console.warn('⚠️ [Redirect] Theater user/admin with no accessible pages - redirecting to login');
          navigate('/login', { replace: true });
        } else {
          // Fallback if theaterId is missing
          navigate('/dashboard', { replace: true });
        }
      } else {
        // Super admin users go to admin dashboard
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, userType, theaterId, rolePermissions, authLoading, showPinInput, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  // Handle PIN input change
  const handlePinChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only digits
    if (value.length <= 4) {
      setPin(value);
      if (errors.pin) {
        setErrors(prev => ({ ...prev, pin: '' }));
      }
    }
  };

  // Handle PIN submission
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    
    if (pin.length !== 4) {
      setErrors({ pin: 'PIN must be 4 digits' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {

      const response = await unifiedFetch(`${config.api.baseUrl}/auth/validate-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: pendingAuth.userId,
          pin: pin,
          theaterId: pendingAuth.theaterId,
          _tempPassword: pendingAuth._tempPassword,  // ✅ Pass password for agent start
          loginUsername: pendingAuth.loginUsername   // ✅ Pass login username for agent
        })
      }, {
        forceRefresh: true, // Don't cache authentication requests
        cacheTTL: 0
      });

      // ✅ FIX: Parse JSON and check response (same logic as TheaterList.jsx)
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ [PIN] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to validate PIN`);
          }
        }
        throw parseError;
      }

      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      if (data && data.success === true) {
        const userData = data.user;
        const userType = data.user.userType;
        const theaterId = data.user.theaterId;
        const rolePermissions = data.rolePermissions;
        
        // Clear any previous errors before successful login
        setErrors({});
        
        // ✅ ROLE-BASED NAVIGATION: Check permissions BEFORE login to avoid useEffect race condition
        if (rolePermissions && rolePermissions.length > 0 && rolePermissions[0].permissions) {
          const accessiblePages = rolePermissions[0].permissions.filter(p => p.hasAccess === true);
          
          if (accessiblePages.length > 0) {
            // Navigate to FIRST accessible page
            const firstPage = accessiblePages[0];
            
            // Get route from page ID using helper function
            const firstRoute = firstPage.route 
              ? firstPage.route.replace(':theaterId', theaterId)
              : getRouteFromPageId(firstPage.page, theaterId);
            
            
            if (firstRoute) {
              // Complete login with AuthContext AFTER confirming navigation route
              login(userData, data.token, userType, theaterId, rolePermissions);
              
              // Show success toast
              toast.success('Login Successfully.');
              
              // Clear loading state and errors before navigation
              setIsLoading(false);
              setErrors({});
              
              // Small delay to ensure state updates complete before navigation
              setTimeout(() => {
                navigate(firstRoute, { replace: true });
              }, 100);
              return;
            } else {
              console.error('❌ [PIN] No valid route found for page:', firstPage);
              console.error('❌ [PIN] Page ID received:', firstPage.page);
              console.error('❌ [PIN] Available permissions:', accessiblePages);
              setErrors({ pin: `Navigation error: Cannot find route for page "${firstPage.page}". Contact administrator.` });
              setIsLoading(false);
              return;
            }
          } else {
            // ❌ NO accessible pages - show error, don't login
            console.error('❌ [PIN] No accessible pages found');
            console.error('❌ [PIN] Role permissions:', rolePermissions);
            console.error('❌ [PIN] All permissions:', rolePermissions[0]?.permissions);
            setErrors({ pin: 'Your role has no page access enabled. Contact administrator to grant page permissions.' });
            setIsLoading(false);
            return;
          }
        } else {
          // ❌ NO permissions defined - show error, don't login
          console.error('❌ [PIN] No role permissions found or invalid structure');
          console.error('❌ [PIN] Received data:', { rolePermissions, userType, theaterId });
          setErrors({ pin: 'Role permissions not configured. Contact administrator to set up role permissions.' });
          setIsLoading(false);
          return;
        }
      } else if (data && data.success === false) {
        // Backend explicitly returned success: false
        console.error('❌ [PIN] Backend returned success: false:', data);
        setErrors({ pin: data.error || data.message || 'Invalid PIN. Please try again.' });
        setIsLoading(false);
      } else if (response.ok === false || (response.status && response.status >= 400)) {
        // HTTP error status
        console.error('❌ [PIN] API response not OK:', response.status, data);
        setErrors({ pin: data?.error || data?.message || `HTTP ${response.status}: Failed to validate PIN. Please try again.` });
        setIsLoading(false);
      } else {
        // Unknown error
        console.error('❌ [PIN] Unknown error:', { response, data });
        setErrors({ pin: 'An unexpected error occurred. Please try again.' });
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ [PIN] Exception during PIN validation:', error);
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Unable to connect to server. Please check your connection and try again.';
      
      // Check error name/type first (for TypeError, NetworkError, etc.)
      const errorName = error?.name || '';
      const errorType = error?.type || '';
      const errorMsg = error?.message || '';
      const errorString = String(error).toLowerCase();
      
      // Helper function to get full URL from baseUrl
      const getFullUrl = (baseUrl) => {
        return baseUrl.startsWith('http') ? baseUrl : `${window.location.origin}${baseUrl}`;
      };
      
      // Connection reset errors (ECONNRESET)
      if (errorMsg.includes('ECONNRESET') || 
          errorMsg.includes('read ECONNRESET') ||
          errorMsg.includes('connection reset') ||
          errorString.includes('econnreset') ||
          errorString.includes('connection reset')) {
        errorMessage = 'Connection was reset by the server. The backend server may have stopped or crashed. Please ensure the backend server is running on ' + getFullUrl(config.api.baseUrl);
      }
      // Network errors - check multiple indicators
      else if (errorName === 'TypeError' && 
          (errorMsg.includes('Failed to fetch') || 
           errorMsg.includes('NetworkError') ||
           errorMsg.includes('Network request failed') ||
           errorString.includes('failed to fetch') ||
           errorString.includes('networkerror'))) {
        errorMessage = 'Unable to connect to server. Please check your internet connection and ensure the backend server is running on ' + getFullUrl(config.api.baseUrl);
      }
      // Connection refused errors
      else if (errorMsg.includes('ERR_CONNECTION_REFUSED') || 
               errorMsg.includes('ECONNREFUSED') || 
               errorMsg.includes('Connection refused') ||
               errorString.includes('connection refused')) {
        errorMessage = 'Connection refused. Please ensure the backend server is running on ' + getFullUrl(config.api.baseUrl);
      }
      // Connection timeout errors
      else if (errorMsg.includes('ERR_CONNECTION_TIMED_OUT') || 
               errorMsg.includes('ETIMEDOUT') || 
               errorMsg.includes('timeout') || 
               errorMsg.includes('timed out') ||
               errorName === 'AbortError') {
        errorMessage = 'Request timed out. The server may be slow or unavailable. Please try again.';
      }
      // Internet disconnected
      else if (errorMsg.includes('ERR_INTERNET_DISCONNECTED') || 
               errorMsg.includes('ERR_NAME_NOT_RESOLVED')) {
        errorMessage = 'No internet connection. Please check your network connection and try again.';
      }
      // CORS errors
      else if (errorMsg.includes('CORS') || 
               errorMsg.includes('cross-origin') ||
               errorMsg.includes('Access-Control-Allow-Origin')) {
        errorMessage = 'CORS error: Please check server configuration. The server may not be configured to accept requests from this origin.';
      }
      // HTTP errors (already handled above, but catch any remaining)
      else if (error.status || (errorMsg.includes('HTTP') && errorMsg.match(/HTTP \d{3}/))) {
        const statusMatch = errorMsg.match(/HTTP (\d{3})/);
        const status = statusMatch ? statusMatch[1] : (error.status || '');
        
        // If error message contains actual error details (not just "HTTP XXX: StatusText"), use it
        // unifiedFetch should have extracted the actual error message from the response
        if (errorMsg && 
            errorMsg.length > 0 && 
            !errorMsg.match(/^HTTP \d{3}: [A-Z][a-z\s]+$/)) { // Not just "HTTP 503: Service Unavailable"
          errorMessage = errorMsg;
        } else if (status === '503') {
          // Service Unavailable - could be database connection issue
          errorMessage = errorMsg || 'Service temporarily unavailable. The database may be disconnected. Please check your database connection.';
        } else if (status === '500' || status === '502' || status === '504') {
          errorMessage = errorMsg || 'Server error. Please try again later or contact support if the problem persists.';
        } else if (status === '404') {
          errorMessage = errorMsg || 'PIN validation endpoint not found. Please check server configuration.';
        } else {
          errorMessage = errorMsg || `HTTP ${status}: Server error occurred.`;
        }
      }
      // Use the error message if it's informative and not a generic fetch error
      else if (errorMsg && 
               errorMsg.length > 0 && 
               !errorMsg.includes('Failed to fetch') &&
               !errorMsg.includes('NetworkError') &&
               !errorMsg.includes('ECONNRESET') &&
               !errorMsg.includes('read ECONNRESET')) {
        errorMessage = errorMsg;
      }
      
      setErrors({ pin: errorMessage });
      setIsLoading(false);
    }
  };

  // Handle back to password screen
  const handleBackToPassword = () => {
    setShowPinInput(false);
    setPin('');
    setPendingAuth(null);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    // Validation
    const newErrors = {};
    if (!formData.username) newErrors.username = 'Username/Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    try {
      // Real API call to backend authentication

      const response = await unifiedFetch(`${config.api.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // ✅ FIX: Send both email and username fields
          // Backend checks: email (for admins) || username (for theater users)
          ...(formData.username.includes('@') 
            ? { email: formData.username }
            : { username: formData.username }
          ),
          password: formData.password
        })
      }, {
        forceRefresh: true, // Don't cache login requests
        cacheTTL: 0
      });

      // ✅ FIX: Parse JSON and check response (same logic as TheaterList.jsx)
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ [Login] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to login`);
          }
        }
        throw parseError;
      }

      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      if (data && data.success === true) {
        // Check if PIN is required (theater users)
        if (data.isPinRequired) {

          setPendingAuth(data.pendingAuth);
          setShowPinInput(true);
          setIsLoading(false);
          return;
        }

        // Admin login - no PIN required
        const userData = data.user;
        const userType = data.user.userType; // Fix: get userType from data.user.userType
        const theaterId = data.user.theaterId || data.theaterId;
        const rolePermissions = data.rolePermissions; // Role-based permissions for theater users
        
        // Clear any previous errors before successful login
        setErrors({});
        
        // Use AuthContext login method with theater data and permissions
        login(userData, data.token, userType, theaterId, rolePermissions);
        
        // Show success toast
        toast.success('Login Successfully.');
        
        // ✅ ROLE-BASED NAVIGATION: Navigate to first accessible page based on permissions
        
        if (userType === 'theater_user' || userType === 'theater_admin') {
          // For theater users, navigate to their first accessible page
          if (rolePermissions && rolePermissions.length > 0 && rolePermissions[0].permissions) {
            const accessiblePages = rolePermissions[0].permissions.filter(p => p.hasAccess === true);
            
            if (accessiblePages.length > 0) {
              // Navigate to FIRST accessible page (not always theater-dashboard)
              const firstPage = accessiblePages[0];
              
              // Get route from page ID using helper function
              const firstRoute = firstPage.route 
                ? firstPage.route.replace(':theaterId', theaterId)
                : getRouteFromPageId(firstPage.page, theaterId);
              
              
              if (firstRoute) {
                // Clear loading state and errors before navigation
                setIsLoading(false);
                setErrors({});
                
                // Small delay to ensure state updates complete before navigation
                setTimeout(() => {
                  navigate(firstRoute, { replace: true });
                }, 100);
                return;
              } else {
                console.error('❌ [Login] No valid route found for page:', firstPage);
                console.error('❌ [Login] Page ID received:', firstPage.page);
                console.error('❌ [Login] Available permissions:', accessiblePages);
                setErrors({ password: `Navigation error: Cannot find route for page "${firstPage.page}". Contact administrator.` });
                setIsLoading(false);
                return;
              }
            } else {
              // ❌ NO accessible pages - show error, don't navigate
              console.error('❌ [Login] No accessible pages found');
              console.error('❌ [Login] Role permissions:', rolePermissions);
              console.error('❌ [Login] All permissions:', rolePermissions[0]?.permissions);
              setErrors({ password: 'Your role has no page access enabled. Contact administrator to grant page permissions.' });
              setIsLoading(false);
              return;
            }
          } else {
            // ❌ NO permissions defined - show error, don't navigate
            console.error('❌ [Login] No role permissions found or invalid structure');
            console.error('❌ [Login] Received data:', { rolePermissions, userType, theaterId });
            setErrors({ password: 'Role permissions not configured. Contact administrator to set up role permissions.' });
            setIsLoading(false);
            return;
          }
        } else {
          // Super admin users go to admin dashboard
          setIsLoading(false);
          setErrors({});
          
          // Small delay to ensure state updates complete before navigation
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 100);
        }
      } else if (data && data.success === false) {
        // Backend explicitly returned success: false
        console.error('❌ [Login] Backend returned success: false:', data);
        setErrors({ 
          general: data.message || data.error || 'Invalid email or password. Please try again.' 
        });
        setIsLoading(false);
      } else if (response.ok === false || (response.status && response.status >= 400)) {
        // HTTP error status
        console.error('❌ [Login] API response not OK:', response.status, data);
        setErrors({ 
          general: data?.message || data?.error || `HTTP ${response.status}: Failed to login. Please try again.` 
        });
        setIsLoading(false);
      } else {
        // Unknown error
        console.error('❌ [Login] Unknown error:', { response, data });
        setErrors({ 
          general: 'An unexpected error occurred. Please try again.' 
        });
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ [Login] Exception during login:', error);
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Unable to connect to server. Please check your connection and try again.';
      
      // Check error name/type first (for TypeError, NetworkError, etc.)
      const errorName = error?.name || '';
      const errorType = error?.type || '';
      const errorMsg = error?.message || '';
      const errorString = String(error).toLowerCase();
      
      // Helper function to get full URL from baseUrl
      const getFullUrl = (baseUrl) => {
        return baseUrl.startsWith('http') ? baseUrl : `${window.location.origin}${baseUrl}`;
      };
      
      // Connection reset errors (ECONNRESET)
      if (errorMsg.includes('ECONNRESET') || 
          errorMsg.includes('read ECONNRESET') ||
          errorMsg.includes('connection reset') ||
          errorString.includes('econnreset') ||
          errorString.includes('connection reset')) {
        errorMessage = 'Connection was reset by the server. The backend server may have stopped or crashed. Please ensure the backend server is running on ' + getFullUrl(config.api.baseUrl);
      }
      // Network errors - check multiple indicators
      else if (errorName === 'TypeError' && 
          (errorMsg.includes('Failed to fetch') || 
           errorMsg.includes('NetworkError') ||
           errorMsg.includes('Network request failed') ||
           errorString.includes('failed to fetch') ||
           errorString.includes('networkerror'))) {
        errorMessage = 'Unable to connect to server. Please check your internet connection and ensure the backend server is running on ' + getFullUrl(config.api.baseUrl);
      }
      // Connection refused errors
      else if (errorMsg.includes('ERR_CONNECTION_REFUSED') || 
               errorMsg.includes('ECONNREFUSED') || 
               errorMsg.includes('Connection refused') ||
               errorString.includes('connection refused')) {
        errorMessage = 'Connection refused. Please ensure the backend server is running on ' + getFullUrl(config.api.baseUrl);
      }
      // Connection timeout errors
      else if (errorMsg.includes('ERR_CONNECTION_TIMED_OUT') || 
               errorMsg.includes('ETIMEDOUT') || 
               errorMsg.includes('timeout') || 
               errorMsg.includes('timed out') ||
               errorName === 'AbortError') {
        errorMessage = 'Request timed out. The server may be slow or unavailable. Please try again.';
      }
      // Internet disconnected
      else if (errorMsg.includes('ERR_INTERNET_DISCONNECTED') || 
               errorMsg.includes('ERR_NAME_NOT_RESOLVED')) {
        errorMessage = 'No internet connection. Please check your network connection and try again.';
      }
      // CORS errors
      else if (errorMsg.includes('CORS') || 
               errorMsg.includes('cross-origin') ||
               errorMsg.includes('Access-Control-Allow-Origin')) {
        errorMessage = 'CORS error: Please check server configuration. The server may not be configured to accept requests from this origin.';
      }
      // HTTP errors (already handled above, but catch any remaining)
      else if (error.status || (errorMsg.includes('HTTP') && errorMsg.match(/HTTP \d{3}/))) {
        const statusMatch = errorMsg.match(/HTTP (\d{3})/);
        const status = statusMatch ? statusMatch[1] : (error.status || '');
        
        // If error message contains actual error details (not just "HTTP XXX: StatusText"), use it
        // unifiedFetch should have extracted the actual error message from the response
        if (errorMsg && 
            errorMsg.length > 0 && 
            !errorMsg.match(/^HTTP \d{3}: [A-Z][a-z\s]+$/)) { // Not just "HTTP 503: Service Unavailable"
          errorMessage = errorMsg;
        } else if (status === '503') {
          // Service Unavailable - could be database connection issue
          errorMessage = errorMsg || 'Service temporarily unavailable. The database may be disconnected. Please check your database connection.';
        } else if (status === '500' || status === '502' || status === '504') {
          errorMessage = errorMsg || 'Server error. Please try again later or contact support if the problem persists.';
        } else if (status === '404') {
          errorMessage = errorMsg || 'Login endpoint not found. Please check server configuration.';
        } else {
          errorMessage = errorMsg || `HTTP ${status}: Server error occurred.`;
        }
      }
      // Use the error message if it's informative and not a generic fetch error
      else if (errorMsg && 
               errorMsg.length > 0 && 
               !errorMsg.includes('Failed to fetch') &&
               !errorMsg.includes('NetworkError') &&
               !errorMsg.includes('ECONNRESET') &&
               !errorMsg.includes('read ECONNRESET')) {
        errorMessage = errorMsg;
      }
      
      setErrors({ 
        general: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Theater Icons Collage Background */}
      <div className="login-background-collage">
        <div className="theater-icon-item theater-icon-1">🎭</div>
        <div className="theater-icon-item theater-icon-2">🎬</div>
        <div className="theater-icon-item theater-icon-3">🎪</div>
        <div className="theater-icon-item theater-icon-4">🎨</div>
        <div className="theater-icon-item theater-icon-5">🎫</div>
        <div className="theater-icon-item theater-icon-6">🎤</div>
        <div className="theater-icon-item theater-icon-7">🎵</div>
        <div className="theater-icon-item theater-icon-8">🎼</div>
        <div className="theater-icon-item theater-icon-9">🎹</div>
        <div className="theater-icon-item theater-icon-10">🎺</div>
        <div className="theater-icon-item theater-icon-11">🎻</div>
        <div className="theater-icon-item theater-icon-12">🎸</div>
        <div className="theater-icon-item theater-icon-13">🎯</div>
        <div className="theater-icon-item theater-icon-14">🎲</div>
        <div className="theater-icon-item theater-icon-15">🎰</div>
        <div className="theater-icon-item theater-icon-16">🎪</div>
        <div className="theater-icon-item theater-icon-17">🎭</div>
        <div className="theater-icon-item theater-icon-18">🎬</div>
        <div className="theater-icon-item theater-icon-19">🎨</div>
        <div className="theater-icon-item theater-icon-20">🎫</div>
      </div>

      {/* Centered Login Form Container */}
      <div className="login-center-container">
        <div className="login-form-container">
          {/* Header */}
          <div className="login-header">
            <h2 className="login-title">
              Welcome Back
            </h2>
            <p className="login-subtitle">
              Sign in to access your dashboard
            </p>
          </div>

          {/* Error Message */}
          {errors.general && (
            <div className="error-banner">
              <span className="error-icon">!</span>
              {errors.general}
            </div>
          )}

          {/* Login Form - Password Step */}
          {!showPinInput && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Username / Email
              </label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className={`form-input ${errors.username ? 'error' : ''}`}
                  placeholder="Enter username or email"
                />
                <span className="input-icon">👤</span>
              </div>
              {errors.username && (
                <span className="error-text">
                  {errors.username}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`form-input ${errors.password ? 'error' : ''}`}
                  placeholder="Enter your password"
                />
                <span 
                  className="password-toggle"
                  onClick={togglePasswordVisibility}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
              </div>
              {errors.password && (
                <span className="error-text">
                  {errors.password}
                </span>
              )}
            </div>

            <div className="form-options">
              <label className="checkbox-wrapper">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-label">Remember me</span>
              </label>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className={`submit-btn ${isLoading ? 'loading' : ''}`}
            >
              {isLoading && (
                <span className="loading-spinner"></span>
              )}
              {isLoading ? 'Signing In...' : 'Sign In to Dashboard'}
            </button>
          </form>
          )}

          {/* PIN Input Form - Second Step for Theater Users */}
          {showPinInput && (
          <form onSubmit={handlePinSubmit} className="login-form pin-form">
            <div className="pin-header">
              <h2 className="login-title">
                Enter Your PIN
              </h2>
              <p className="pin-instruction">
                Welcome, <strong>{pendingAuth?.username}</strong>!
                <br />
                Please enter your 4-digit PIN to continue
              </p>
            </div>

            {errors.pin && (
              <div className="error-banner">
                <span className="error-icon">!</span>
                {errors.pin}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="pin" className="form-label">
                4-Digit PIN
              </label>
              <div className="input-wrapper pin-input-wrapper">
                <button 
                  type="button" 
                  onClick={handleBackToPassword}
                  className="pin-back-button"
                  title="Back to password"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                  </svg>
                </button>
                <input
                  type="password"
                  id="pin"
                  name="pin"
                  value={pin}
                  onChange={handlePinChange}
                  className={`form-input pin-input ${errors.pin ? 'error' : ''}`}
                  placeholder="••••"
                  maxLength="4"
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={pin.length !== 4 || isLoading}
              className={`submit-btn ${isLoading ? 'loading' : ''}`}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  <span>Validating PIN...</span>
                </>
              ) : (
                'Verify PIN & Continue'
              )}
            </button>
          </form>
          )}

          {/* Footer */}
          <div className="login-footer">
            <p className="footer-text">© 2025 YQPayNow. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
