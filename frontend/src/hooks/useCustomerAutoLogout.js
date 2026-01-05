import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// 30 minutes in milliseconds
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

/**
 * Custom hook to automatically logout customers after:
 * 1. Tab/window is closed
 * 2. 30 minutes of inactivity after login
 * 
 * This hook tracks user activity (mouse, keyboard, scroll, touch) and resets
 * the inactivity timer whenever the user interacts with the page.
 */
const useCustomerAutoLogout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const inactivityTimerRef = useRef(null);
  const lastActivityTimeRef = useRef(null);
  const loginTimestampRef = useRef(null); // Track when user logged in to prevent immediate logout

  /**
   * Check if user is logged in as a customer
   */
  const isCustomerLoggedIn = useCallback(() => {
    const customerPhone = localStorage.getItem('customerPhone');
    return !!customerPhone;
  }, []);

  /**
   * Clear customer session and logout
   */
  const performLogout = useCallback(() => {

    // Clear customer data from localStorage
    // NOTE: customerFavorites is NOT cleared - favorites should persist across sessions
    localStorage.removeItem('customerPhone');
    localStorage.removeItem('cart');
    localStorage.removeItem('yqpay_cart');
    localStorage.removeItem('checkoutData');
    // localStorage.removeItem('customerFavorites'); // Removed - favorites should persist

    // Get theater ID for redirect (preserve context)
    const theaterId = localStorage.getItem('customerTheaterId');
    const qrName = localStorage.getItem('customerQrName');
    const screenName = localStorage.getItem('customerScreenName');
    const seat = localStorage.getItem('customerSeat');

    // Build redirect URL to landing page with theater info
    if (theaterId) {
      const params = new URLSearchParams();
      params.set('theaterid', theaterId);
      if (screenName) params.set('screen', screenName);
      if (seat) params.set('seat', seat);
      if (qrName) params.set('qrName', qrName);

      // Only redirect if we're not already on the landing page
      const currentPath = location.pathname;
      if (!currentPath.includes('/customer') || currentPath === '/customer' || currentPath.includes('/menu/')) {
        // Already on landing or external page, no redirect needed
        return;
      }

      navigate(`/menu/${theaterId}?${params.toString()}`, { replace: true });
    } else {
      // No theater context, redirect to generic customer page
      if (location.pathname !== '/customer') {
        navigate('/customer', { replace: true });
      }
    }
  }, [navigate, location.pathname]);

  /**
   * Reset the inactivity timer
   */
  const resetInactivityTimer = useCallback(() => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    // Only set timer if user is logged in
    if (!isCustomerLoggedIn()) {
      return;
    }

    // Update last activity time
    const now = Date.now();
    lastActivityTimeRef.current = now;
    
    // ✅ CRITICAL FIX: Track login timestamp on first activity reset
    // This prevents immediate logout on first login
    if (!loginTimestampRef.current) {
      loginTimestampRef.current = now;
    }

    // Set new inactivity timer
    inactivityTimerRef.current = setTimeout(() => {

      // Check if still logged in before logging out
      if (isCustomerLoggedIn()) {
        performLogout();
      }

      // Clear timer reference
      inactivityTimerRef.current = null;
    }, INACTIVITY_TIMEOUT);
  }, [isCustomerLoggedIn, performLogout]);

  /**
   * Handle user activity events
   */
  const handleActivity = useCallback(() => {
    // Reset timer on any user activity
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  /**
   * Handle tab/window close
   */
  /**
   * Handle tab/window close
   * Note: We do NOT clear localStorage here because beforeunload also fires on page refresh.
   * Clearing data here results in the user being logged out when they refresh the page.
   * We rely on the inactivity timer for security.
   */
  const handleBeforeUnload = useCallback((event) => {
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  /**
   * Handle visibility change (when tab becomes hidden/visible)
   */
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Tab is now hidden - user might have switched tabs or minimized window
      // We'll still track inactivity, but won't force logout until they come back
    } else {
      // Tab is now visible - check if user should be logged out
      if (isCustomerLoggedIn()) {
        // ✅ CRITICAL FIX: Check if user just logged in (within last 10 seconds)
        // Prevent immediate logout on first login
        const now = Date.now();
        const loginTime = loginTimestampRef.current;
        const gracePeriod = 10000; // 10 seconds grace period after login
        
        if (loginTime && (now - loginTime) < gracePeriod) {
          // Reset timer but don't check for inactivity yet
          resetInactivityTimer();
          return;
        }
        
        if (lastActivityTimeRef.current) {
          const timeSinceLastActivity = now - lastActivityTimeRef.current;

          if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
            performLogout();
          } else {
            // Reset timer when tab becomes visible again
            resetInactivityTimer();
          }
        } else {
          // First time or no last activity time - start timer
          resetInactivityTimer();
        }
      }
    }
  }, [isCustomerLoggedIn, performLogout, resetInactivityTimer]);

  // Set up activity tracking and timers
  useEffect(() => {
    // Only enable auto-logout for customer routes
    const isCustomerRoute = location.pathname.startsWith('/customer') ||
      location.pathname.startsWith('/menu/');

    if (!isCustomerRoute) {
      // Not on customer route, don't set up auto-logout
      return;
    }

    // Initialize timer if user is logged in
    if (isCustomerLoggedIn()) {
      const now = Date.now();
      lastActivityTimeRef.current = now;
      
      // ✅ CRITICAL FIX: Set login timestamp on mount if not already set
      // This prevents immediate logout on first login
      if (!loginTimestampRef.current) {
        loginTimestampRef.current = now;
      }
      
      resetInactivityTimer();
    } else {
      // ✅ CRITICAL FIX: Clear login timestamp when user logs out
      loginTimestampRef.current = null;
    }

    // Track user activity events
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown'
    ];

    // Add event listeners for activity tracking
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Handle tab/window close
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      // Remove activity event listeners
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });

      // Remove beforeunload listener
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Remove visibility change listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Clear inactivity timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [
    location.pathname,
    isCustomerLoggedIn,
    handleActivity,
    handleBeforeUnload,
    handleVisibilityChange,
    resetInactivityTimer
  ]);

  // Reset timer when user logs in during the session
  useEffect(() => {
    if (isCustomerLoggedIn()) {
      const now = Date.now();
      // ✅ CRITICAL FIX: Set login timestamp when user logs in
      // This prevents immediate logout on first login
      if (!loginTimestampRef.current) {
        loginTimestampRef.current = now;
      }
      lastActivityTimeRef.current = now;
      resetInactivityTimer();
    } else {
      // ✅ CRITICAL FIX: Clear login timestamp when user logs out
      loginTimestampRef.current = null;
      lastActivityTimeRef.current = null;
    }
  }, [isCustomerLoggedIn, resetInactivityTimer]);

  // ✅ CRITICAL FIX: Listen for customerPhone changes in localStorage to detect login
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'customerPhone') {
        const customerPhone = e.newValue;
        if (customerPhone && isCustomerLoggedIn()) {
          // User just logged in - reset timers
          const now = Date.now();
          loginTimestampRef.current = now;
          lastActivityTimeRef.current = now;
          resetInactivityTimer();
        } else if (!customerPhone) {
          // User logged out - clear timers
          loginTimestampRef.current = null;
          lastActivityTimeRef.current = null;
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also check immediately if user is logged in
    if (isCustomerLoggedIn() && !loginTimestampRef.current) {
      const now = Date.now();
      loginTimestampRef.current = now;
      lastActivityTimeRef.current = now;
      resetInactivityTimer();
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isCustomerLoggedIn, resetInactivityTimer]);
};

export default useCustomerAutoLogout;
