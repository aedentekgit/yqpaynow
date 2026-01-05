import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../config';
import { clearAllCaches } from '../utils/cacheManager';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 🚀 OPTIMIZED: Split context values to prevent unnecessary re-renders
const AuthStateContext = createContext();
const AuthActionsContext = createContext();

export const useAuthState = () => {
  const context = useContext(AuthStateContext);
  if (!context) {
    throw new Error('useAuthState must be used within an AuthProvider');
  }
  return context;
};

export const useAuthActions = () => {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error('useAuthActions must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = React.memo(({ children }) => {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [theaterId, setTheaterId] = useState(null); // Add theater ID for data isolation
  const [rolePermissions, setRolePermissions] = useState([]); // Add role-based permissions
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // 🚀 OPTIMIZED: Instant session restoration - synchronous, no blocking
  useEffect(() => {
    const restoreSession = () => {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('user');
      const storedUserType = localStorage.getItem('userType');
      const storedTheaterId = localStorage.getItem('theaterId');
      const storedRolePermissions = localStorage.getItem('rolePermissions');
      
      // 🚀 INSTANT: Restore from localStorage synchronously (no async needed)
      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData);
          const parsedRolePermissions = storedRolePermissions ? JSON.parse(storedRolePermissions) : [];
          
          // 🚀 INSTANT: Set all state synchronously - no waiting
          setUser(parsedUser);
          setUserType(storedUserType || 'admin');
          setTheaterId(storedTheaterId);
          setRolePermissions(parsedRolePermissions);
          setIsAuthenticated(true);
          setIsLoading(false); // 🚀 CRITICAL: Set false immediately - don't wait for validation
          
          // Optional: Validate token in background (don't block UI)
          validateTokenInBackground(token);
          
        } catch (parseError) {
          // Only clear if data is corrupted
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('userType');
          localStorage.removeItem('theaterId');
          localStorage.removeItem('rolePermissions');
          setIsAuthenticated(false);
          setIsLoading(false);
        }
      } else {
        setIsAuthenticated(false);
        setIsLoading(false); // 🚀 INSTANT: No loading if no session
      }
    };

    // Background token validation (optional, doesn't affect login state)
    const validateTokenInBackground = async (token) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${config.api.baseUrl}/auth/validate`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        }).catch(err => {
          // Silently handle 404 or network errors - don't log to avoid noise
          if (err.name === 'AbortError' || err.message?.includes('404')) {
            return null;
          }
          throw err;
        });
        
        if (!response || !response.ok) {
          clearTimeout(timeoutId);
          return; // Silently fail - don't affect user experience
        }
        
        clearTimeout(timeoutId);
        
        // Token is valid - no action needed
        // User will be logged out when they try to make an API call if token is invalid
      } catch (error) {
        // Background validation error - ignore silently
        // Don't logout on network errors - user stays authenticated
      }
    };

    restoreSession();
  }, []);

  // 🚀 OPTIMIZED: Memoized state value to prevent re-renders
  const stateValue = useMemo(() => ({
    user,
    userType,
    theaterId,
    rolePermissions,
    isAuthenticated,
    isLoading,
  }), [user, userType, theaterId, rolePermissions, isAuthenticated, isLoading]);

  // 🚀 OPTIMIZED: Memoized login function
  const login = useCallback((userData, token, type = 'super_admin', userTheaterId = null, userRolePermissions = []) => {
    // ✅ FIX: Clean token before storing (remove quotes, trim whitespace)
    const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
    
    // Validate token format (should have 3 parts separated by dots)
    if (cleanToken.split('.').length !== 3) {
      console.error('❌ [AuthContext] Invalid token format, login failed');
      return;
    }
    
    // ✅ CRITICAL FIX: Clear any old logout-event BEFORE storing new session
    // This prevents old logout events from triggering immediately after login
    localStorage.removeItem('logout-event');
    
    // ✅ CRITICAL FIX: Set a login timestamp to prevent immediate logout
    // This allows us to ignore logout events that happen within 3 seconds of login
    localStorage.setItem('login-timestamp', Date.now().toString());
    
    localStorage.setItem('authToken', cleanToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('userType', type);
    
    if (userTheaterId) {
      localStorage.setItem('theaterId', userTheaterId);
      setTheaterId(userTheaterId);
    }
    
    if (userRolePermissions && userRolePermissions.length > 0) {
      localStorage.setItem('rolePermissions', JSON.stringify(userRolePermissions));
      setRolePermissions(userRolePermissions);
    }
    
    // ✅ CRITICAL FIX: Set all state synchronously and ensure loading is false
    setUser(userData);
    setUserType(type);
    setIsAuthenticated(true);
    setIsLoading(false); // ✅ FIX: Set loading to false on login to prevent white screen
    
  }, []);

  // 🚀 OPTIMIZED: Memoized logout function
  const logout = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    const currentUserType = userType || localStorage.getItem('userType');
    
    // ✅ CLEAR CACHES: Clear all caches for super_admin or theater users
    if (currentUserType === 'super_admin' || currentUserType === 'theater_user' || currentUserType === 'theater_admin') {
      try {
        await clearAllCaches();
      } catch (error) {
        console.error('Error clearing caches on logout:', error);
        // Continue with logout even if cache clearing fails
      }
    }
    
    // ✅ SINGLE SESSION: Call backend to invalidate session
    if (token) {
      try {
        await fetch(`${config.api.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).catch(() => {
          // Ignore errors - logout locally even if API call fails
        });
      } catch (error) {
        // Ignore errors - logout locally even if API call fails
        console.error('Logout API error:', error);
      }
    }
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    localStorage.removeItem('theaterId');
    localStorage.removeItem('rolePermissions');
    localStorage.setItem('logout-event', Date.now().toString());
    
    setUser(null);
    setUserType(null);
    setTheaterId(null);
    setRolePermissions([]);
    setIsAuthenticated(false);
    navigate('/login');
  }, [navigate, userType]);

  // 🚀 OPTIMIZED: Memoized actions value
  const actionsValue = useMemo(() => ({
    login,
    logout,
  }), [login, logout]);

  // 🚀 OPTIMIZED: Combined value for backward compatibility
  const combinedValue = useMemo(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  // ✅ LISTEN FOR LOGOUT EVENTS: Handle logout from other tabs
  useEffect(() => {
    const handleStorageChange = async (e) => {
      if (e.key === 'logout-event') {
        // ✅ CRITICAL FIX: Check if logout event happened too soon after login
        // Ignore logout events that happen within 3 seconds of login (prevents false positives)
        const loginTimestamp = localStorage.getItem('login-timestamp');
        if (loginTimestamp) {
          const timeSinceLogin = Date.now() - parseInt(loginTimestamp, 10);
          if (timeSinceLogin < 3000) {
            console.warn('⚠️ [AuthContext] Ignoring logout event - too soon after login (prevent false logout)');
            return; // Ignore this logout event - it's likely from a previous session
          }
        }
        
        // ✅ CRITICAL FIX: Also check if we're currently authenticated
        // Don't logout if we're not authenticated (prevents race conditions)
        if (!isAuthenticated) {
          console.warn('⚠️ [AuthContext] Ignoring logout event - not currently authenticated');
          return;
        }
        
        // Another tab triggered logout, sync this tab
        const currentUserType = userType || localStorage.getItem('userType');
        
        // ✅ CLEAR CACHES: Clear all caches for super_admin or theater users
        if (currentUserType === 'super_admin' || currentUserType === 'theater_user' || currentUserType === 'theater_admin') {
          try {
            await clearAllCaches();
          } catch (error) {
            console.error('Error clearing caches on cross-tab logout:', error);
            // Continue with logout even if cache clearing fails
          }
        }
        
        setUser(null);
        setUserType(null);
        setTheaterId(null);
        setRolePermissions([]);
        setIsAuthenticated(false);
        navigate('/login');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [navigate, userType, isAuthenticated]);

  // ✅ SINGLE SESSION: Periodically check if session is still valid
  useEffect(() => {
    if (!isAuthenticated || !user) {
      return; // Don't check if not logged in
    }

    let isFirstCheck = true; // Track if this is the first check after login
    let checkCount = 0; // Track number of checks to prevent premature logout

    const checkSession = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          // Only logout if not first check - might be race condition on first login
          if (!isFirstCheck && checkCount > 1) {
            logout();
          }
          return;
        }

        const response = await fetch(`${config.api.baseUrl}/auth/check-session`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        checkCount++; // Increment check count

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          
          // ✅ FIX: On first check, be EXTREMELY lenient - don't logout on ANY errors
          if (isFirstCheck) {
            // ✅ CRITICAL: On first check, NEVER logout - ignore ALL errors
            // The backend might not have the session ready yet, or there might be network issues
            // We'll retry on the next interval (30 seconds later)
            console.warn(`⚠️ Session check error on first check (will retry on next interval): ${response.status} - ${data.code || 'unknown'}`);
            console.warn('⚠️ This is normal on first login - session may still be establishing');
            // Mark first check as complete but DON'T logout
            isFirstCheck = false;
          } else {
            // Subsequent checks - normal behavior
            if (data.code === 'SESSION_INVALIDATED' || response.status === 401) {
              // Session was invalidated - user logged in elsewhere
              console.warn('⚠️ Session invalidated - logging out');
              logout();
              // Show notification if possible
              if (window.toast) {
                window.toast.error('You have been logged out because you logged in from another device/browser.');
              }
            }
          }
        } else {
          // Session is valid - mark first check as complete
          if (isFirstCheck) {
            isFirstCheck = false;
          }
        }
      } catch (error) {
        // Network errors - don't logout, just log
        // ✅ FIX: On first check, be VERY lenient with network errors
        if (isFirstCheck) {
          console.warn('⚠️ Network error on first session check (will retry):', error.message);
          isFirstCheck = false; // Mark as complete to allow retries
        } else {
          console.error('Session check error:', error);
        }
        checkCount++; // Increment even on error
      }
    };

    // ✅ FIX: Increase delay before first check to allow session to be fully created
    // This prevents immediate logout after first login due to race condition
    // Increased to 10 seconds to give backend plenty of time to establish session
    const initialDelay = setTimeout(() => {
      checkSession();
    }, 10000); // Wait 10 seconds before first check (increased from 5 seconds)

    // Then check every 30 seconds
    const intervalId = setInterval(checkSession, 30000); // Check every 30 seconds

    return () => {
      clearTimeout(initialDelay);
      clearInterval(intervalId);
    };
  }, [isAuthenticated, user, logout]);

  return (
    <AuthContext.Provider value={combinedValue}>
      <AuthStateContext.Provider value={stateValue}>
        <AuthActionsContext.Provider value={actionsValue}>
          {children}
        </AuthActionsContext.Provider>
      </AuthStateContext.Provider>
    </AuthContext.Provider>
  );
});

AuthProvider.displayName = 'AuthProvider';

export default AuthContext;