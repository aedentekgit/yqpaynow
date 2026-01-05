import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import config from '../config';
import { getApiUrl } from '../utils/apiHelper';
import { hasPageAccess } from '../utils/rolePermissions';
import { unifiedFetch } from '../utils/unifiedFetch';
import '../styles/Header.css'; // Extracted inline styles

// Header-specific icons
const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
  </svg>
);

const IconNotification = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
  </svg>
);

const IconEmail = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
  </svg>
);

const getIcon = (iconName) => {
  const icons = {
    hamburger: <IconMenu />,
    search: <IconSearch />,
    notification: <IconNotification />,
    email: <IconEmail />,
    settings: <IconSettings />
  };
  return icons[iconName] || null;
};

const Header = ({ sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed, pageTitle = 'Dashboard', userProfile = null, dateFilterProps = null, posStatusData = null }) => {
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileLogoUrl, setProfileLogoUrl] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const { user: authUser, logout, userType, theaterId, rolePermissions } = useAuth();
  const navigate = useNavigate();
  const notificationRef = useRef(null);
  const profileRef = useRef(null);
  const profileImageRef = useRef(null);
  const previousLogoUrlRef = useRef(null);
  
  const defaultUserProfile = {
    firstName: 'Admin',
    lastName: 'User', 
    email: `admin@${config.branding.companyName.toLowerCase()}.com`,
    phone: '+91 89404 16286',
    city: 'Bengaluru',
    country: 'India'
  };

  // Use authenticated user data if available, otherwise use provided userProfile or default
  const user = authUser || userProfile || defaultUserProfile;
  const userInitials = `${user.name?.charAt(0) || user.firstName?.charAt(0) || 'A'}${user.name?.charAt(1) || user.lastName?.charAt(0) || 'U'}`;

  // Sync ref with state to track previous logo URL
  useEffect(() => {
    if (profileLogoUrl) {
      previousLogoUrlRef.current = profileLogoUrl;
    }
  }, [profileLogoUrl]);

  // Fetch theater logo for theater users or application logo for super admin
  useEffect(() => {
    const fetchProfileLogo = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const currentLogoUrl = previousLogoUrlRef.current;
        
        // Set loading state only if we don't have a logo yet or if the URL might change
        if (!currentLogoUrl) {
          setIsImageLoading(true);
        }

        // For theater users: fetch theater logo
        if ((userType === 'theater_user' || userType === 'theater_admin') && theaterId) {
          const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
            headers: {
              'Content-Type': 'application/json'
              // Token is automatically added by unifiedFetch
            }
          }, {
            cacheKey: `theater_${theaterId}`,
            cacheTTL: 300000 // 5 minutes
          });
          
          if (response && response.ok) {
            try {
              // Clone response if body might be consumed elsewhere
              const clonedResponse = response.clone ? response.clone() : response;
              const data = await clonedResponse.json();
              if (data.success && data.data) {
                const theater = data.data;
                // Check multiple possible logo locations
                const logoUrl = theater.branding?.logoUrl 
                  || theater.branding?.logo 
                  || theater.documents?.logo 
                  || theater.media?.logo 
                  || theater.logo 
                  || theater.logoUrl 
                  || null;
                
                // Only update if the URL is different to prevent unnecessary re-renders and glitching
                if (logoUrl !== currentLogoUrl) {
                  previousLogoUrlRef.current = logoUrl;
                  setProfileLogoUrl(logoUrl);
                  // If we had a previous logo, don't show loading state to prevent flicker
                  if (currentLogoUrl) {
                    setIsImageLoading(false);
                  }
                } else {
                  setIsImageLoading(false);
                }
              } else {
                setIsImageLoading(false);
              }
            } catch (jsonError) {
              // Handle "body stream already read" error gracefully
              if (jsonError.message?.includes('already read')) {
                // Response body was already consumed, skip this fetch
                setIsImageLoading(false);
                return;
              }
              throw jsonError;
            }
          } else {
            setIsImageLoading(false);
          }
        } 
        // For super admin: fetch application logo from settings
        else if (userType === 'super_admin') {
          // Check if logo is configured in settings
          const response = await unifiedFetch(`${config.api.baseUrl}/settings/general`, {
            headers: {
              'Content-Type': 'application/json'
              // Token is automatically added by unifiedFetch
            }
          }, {
            cacheKey: 'settings_general',
            cacheTTL: 300000 // 5 minutes
          });
          
          if (response && response.ok) {
            try {
              // Clone response if body might be consumed elsewhere
              const clonedResponse = response.clone ? response.clone() : response;
              const data = await clonedResponse.json();
              if (data.success && data.data && data.data.logoUrl) {
                // Use the image proxy endpoint for the logo
                const logoUrl = getApiUrl('/settings/image/logo');
                
                // Only update if the URL is different to prevent unnecessary re-renders and glitching
                if (logoUrl !== currentLogoUrl) {
                  previousLogoUrlRef.current = logoUrl;
                  setProfileLogoUrl(logoUrl);
                  // If we had a previous logo, don't show loading state to prevent flicker
                  if (currentLogoUrl) {
                    setIsImageLoading(false);
                  }
                } else {
                  setIsImageLoading(false);
                }
              } else {
                setIsImageLoading(false);
              }
            } catch (jsonError) {
              // Handle "body stream already read" error gracefully
              if (jsonError.message?.includes('already read')) {
                // Response body was already consumed, skip this fetch
                setIsImageLoading(false);
                return;
              }
              throw jsonError;
            }
          } else {
            setIsImageLoading(false);
          }
        } else {
          setIsImageLoading(false);
        }
      } catch (error) {
        console.error('Error fetching profile logo:', error);
        setIsImageLoading(false);
      }
    };

    fetchProfileLogo();
  }, [userType, theaterId]);

  // Fetch unread messages for notifications
  useEffect(() => {
    let controller = null;
    let reader = null;
    let isMounted = true; // Track if component is mounted
    let shouldStopRetrying = false; // Track if we should stop retrying due to token errors
    
    const fetchNotifications = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token || shouldStopRetrying) return;

        const response = await unifiedFetch(`${config.api.baseUrl}/chat/theaters`, {
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: 'chat_theaters',
          cacheTTL: 60000 // 1 minute (notifications change frequently)
        });

        if (response.ok) {
          const theaters = await response.json();
          // Handle both array response and {success, data} response
          const theaterList = Array.isArray(theaters) ? theaters : (theaters.data || []);
          const unreadTheaters = theaterList.filter(t => t.unreadCount > 0);
          setNotifications(unreadTheaters);
          const totalUnread = unreadTheaters.reduce((sum, t) => sum + t.unreadCount, 0);
          setUnreadCount(totalUnread);
        } else if (response.status === 403) {
          // Token is invalid - stop retrying
          const errorData = await response.json().catch(() => ({}));
          if (errorData.code === 'TOKEN_INVALID' || errorData.error?.includes('token')) {
            console.warn('⚠️ [Notifications] Token invalid, stopping retries');
            shouldStopRetrying = true;
            return;
          }
        }
      } catch (error) {
        // Silently handle errors - don't spam console
        if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
          shouldStopRetrying = true;
        }
      }
    };

    // Initial fetch
    fetchNotifications();

    // Setup Server-Sent Events for real-time notifications using fetch API
    const setupSSE = async () => {
      const token = localStorage.getItem('authToken');
      if (!token || shouldStopRetrying) return;

      try {
        controller = new AbortController();
        
        // Fetch with error suppression for aborted connections
        const response = await fetch(`${config.api.baseUrl}/notifications/stream`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream'
          },
          signal: controller.signal
        }).catch(err => {
          // Suppress aborted connection errors (normal during navigation/refresh)
          if (err.name === 'AbortError') {
            throw err; // Re-throw to be handled by outer catch
          }
          console.error(`❌ [SSE] Fetch error:`, err);
          throw err;
        });

        if (!response.ok) {
          const errorText = await response.text().catch((err) => {
            // Silently handle AbortError when reading response text
            if (err.name === 'AbortError') {
              return 'Request aborted';
            }
            return 'Unknown error';
          });
          
          // Check if it's a token error
          let errorData = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // Not JSON, ignore
          }
          
          // ✅ FIX: Check for proxy errors and connection closed errors
          const isProxyError = errorData.code === 'PROXY_ERROR' || 
                              errorData.message?.includes('ECONNRESET') ||
                              errorData.message?.includes('read ECONNRESET');
          const isConnectionClosed = errorData.code === 'CONNECTION_CLOSED';
          
          // If token is invalid, stop retrying
          if (response.status === 403 && (errorData.code === 'TOKEN_INVALID' || errorData.error?.includes('token') || errorData.error?.includes('expired'))) {
            console.warn('⚠️ [SSE] Token invalid or expired, stopping retries');
            shouldStopRetrying = true;
            return; // Don't retry
          }
          
          // ✅ FIX: Suppress proxy/connection errors - they're normal
          if (isProxyError || isConnectionClosed) {
            // Don't log these - they're expected when server restarts or connection drops
            throw new Error(`SSE connection closed: ${response.status}`);
          }
          
          // ✅ FIX: Suppress 503 (Service Unavailable) errors - server is likely down, which is expected
          // Only log unexpected errors (not server unavailable)
          if (response.status === 503) {
            // Server is down - this is expected, don't log as error
            // Will retry automatically
            throw new Error(`SSE connection failed: ${response.status}`);
          } else if (response.status >= 500) {
            // Other server errors - log but don't spam
            console.warn(`⚠️ [SSE] Server error: ${response.status}`);
            throw new Error(`SSE connection failed: ${response.status}`);
          } else {
            console.warn(`⚠️ [SSE] Connection failed: ${response.status}`, errorData.message || errorText);
            throw new Error(`SSE connection failed: ${response.status}`);
          }
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              // Skip empty lines and comments (keep-alive pings)
              if (!line.trim() || line.startsWith(':')) {
                continue;
              }

              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.type === 'connected') {
                  } else if (data.type === 'new_message') {
                    // Instantly refresh notifications
                    fetchNotifications();
                  }
                } catch (e) {
                  console.error('❌ [SSE] Error parsing message:', e, line);
                }
              }
            }
          } catch (readError) {
            // Silently handle AbortError during stream reading (normal during unmount)
            if (readError.name === 'AbortError') {
              break;
            }
            // Re-throw other errors to be handled by outer catch
            throw readError;
          }
        }
      } catch (error) {
        // Silently handle AbortError (normal during navigation/unmount)
        if (error.name === 'AbortError') {
          return;
        }
        
        // ✅ FIX: Suppress connection closed/proxy/server unavailable errors - they're normal
        const isConnectionError = 
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('read ECONNRESET') ||
          error.message?.includes('connection closed') ||
          error.message?.includes('Connection closed') ||
          error.message?.includes('PROXY_ERROR') ||
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('503') ||
          error.message?.includes('Service Unavailable') ||
          error.message?.includes('not running') ||
          error.code === 'ECONNRESET';
        
        // Check if error is related to token/auth
        if (error.message?.includes('403') || error.message?.includes('Forbidden') || error.message?.includes('token')) {
          console.warn('⚠️ [SSE] Authentication error, stopping retries');
          shouldStopRetrying = true;
          return; // Don't retry on auth errors
        }
        
        // ✅ FIX: Only log unexpected errors (not connection/server unavailable errors)
        // 503 errors are expected when server is down - don't log them
        if (!shouldStopRetrying && !isConnectionError) {
          // Only log if it's not a server unavailable error
          if (!error.message?.includes('503') && !error.message?.includes('Service Unavailable')) {
            console.error('❌ [SSE] Connection error:', error);
          }
        }
        
        // Retry connection after 5 seconds (only if component is still mounted and not stopped)
        // Don't retry immediately on connection errors - wait a bit longer
        if (!shouldStopRetrying) {
          const retryDelay = isConnectionError ? 10000 : 5000; // Wait longer for connection errors
          setTimeout(() => {
            if (isMounted && !shouldStopRetrying) {
              setupSSE();
            }
          }, retryDelay);
        }
      }
    };

    setupSSE();

    // Fallback polling every 30 seconds (only if not stopped due to token errors)
    const interval = setInterval(() => {
      if (!shouldStopRetrying) {
        fetchNotifications();
      }
    }, 30000);

    return () => {
      isMounted = false; // Mark component as unmounted
      shouldStopRetrying = true; // Stop all retries on unmount
      
      if (controller) {
        try {
          controller.abort();
        } catch (e) {
          // Silently ignore errors during cleanup
        }
      }
      if (reader) {
        try {
          reader.cancel().catch(() => {
            // Silently ignore cancel errors
          });
        } catch (e) {
          // Silently ignore errors during cleanup
        }
      }
      clearInterval(interval);
    };
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (theater) => {
    setShowNotificationDropdown(false);
    navigate('/messages', { state: { selectedTheaterId: theater._id } });
  };

  const toggleNotificationDropdown = () => {
    setShowNotificationDropdown(!showNotificationDropdown);
  };

  const handleLogout = () => {
    logout();
    setShowProfileDropdown(false);
  };

  const toggleProfileDropdown = () => {
    setShowProfileDropdown(!showProfileDropdown);
  };

  // Check if user has access to settings page
  const hasSettingsAccess = useMemo(() => {
    // Super admin always has access
    if (userType === 'super_admin') {
      return true;
    }
    
    // For theater users, check if they have access to TheaterSettingsWithId page
    if ((userType === 'theater_user' || userType === 'theater_admin') && rolePermissions) {
      return hasPageAccess(rolePermissions, 'TheaterSettingsWithId') || 
             hasPageAccess(rolePermissions, 'TheaterSettings');
    }
    
    return false;
  }, [userType, rolePermissions]);

  // Handle Account Settings click
  const handleAccountSettings = () => {
    setShowProfileDropdown(false);
    
    if (userType === 'super_admin') {
      navigate('/settings');
    } else if ((userType === 'theater_user' || userType === 'theater_admin') && theaterId) {
      navigate(`/theater-settings/${theaterId}`);
    }
  };

  return (
    <header className="dashboard-header">
      <div className="header-actions-container">
        <button 
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {getIcon('hamburger')}
        </button>
        
        <button 
          className={`desktop-menu-btn ${sidebarCollapsed ? 'collapsed' : ''}`}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {getIcon('hamburger')}
        </button>
        
        <h1 className="header-title">{pageTitle}</h1>
      </div>
      
      <div className="header-actions">
        {/* Date Filter Button - Only show if dateFilterProps provided */}
        {dateFilterProps && dateFilterProps.showButton && (
          <button 
            className="submit-btn date-filter-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dateFilterProps.onOpenModal) {
                dateFilterProps.onOpenModal();
              }
            }}
          >
            <span className="btn-icon">📅</span>
            {dateFilterProps.dateFilter.type === 'all' ? 'Date Filter' : 
             dateFilterProps.dateFilter.type === 'date' ? `TODAY (${new Date(dateFilterProps.dateFilter.selectedDate).toLocaleDateString('en-GB')})` :
             dateFilterProps.dateFilter.type === 'month' ? `${new Date(dateFilterProps.dateFilter.year, dateFilterProps.dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
             dateFilterProps.dateFilter.type === 'range' && dateFilterProps.dateFilter.startDate && dateFilterProps.dateFilter.endDate ? 
               `${new Date(dateFilterProps.dateFilter.startDate).toLocaleDateString('en-GB')} - ${new Date(dateFilterProps.dateFilter.endDate).toLocaleDateString('en-GB')}` :
             'Date Filter'}
          </button>
        )}
        
        {/* POS Status Items - Only show for Offline POS page */}
        {posStatusData && (
          <div className="pos-status-items">
            <div className="pos-status-item">
              <span className="pos-status-label">Connection</span>
              <div className={`pos-status-badge ${posStatusData.connectionStatus}`}>
                <span className={`pos-status-icon ${posStatusData.connectionStatus}`}></span>
                {posStatusData.connectionStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>
            <div className="pos-status-item">
              <span className="pos-status-label">Pending Orders</span>
              <div className="pos-status-value">
                🔄 {posStatusData.pendingCount}
              </div>
            </div>
            <div className="pos-status-item">
              <span className="pos-status-label">Last Sync</span>
              <div className="pos-status-value">
                {posStatusData.lastSyncTime ? new Date(posStatusData.lastSyncTime).toLocaleTimeString() : 'Never'}
              </div>
            </div>
          </div>
        )}
        
        <div className="header-icons">
          <div className="notification-container" ref={notificationRef}>
            <button 
              className="icon-btn notification-btn" 
              onClick={toggleNotificationDropdown}
              title="Messages"
            >
              {getIcon('notification')}
              {unreadCount > 0 && (
                <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
            {showNotificationDropdown && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <h3>Messages</h3>
                  {unreadCount > 0 && (
                    <span className="unread-count">{unreadCount} unread</span>
                  )}
                </div>
                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="no-notifications">
                      <span>📭</span>
                      <p>No new messages</p>
                    </div>
                  ) : (
                    notifications.map((theater) => (
                      <div 
                        key={theater._id} 
                        className="notification-item"
                        onClick={() => handleNotificationClick(theater)}
                      >
                        <div className="notification-avatar">
                          {theater.theaterName?.charAt(0) || 'T'}
                        </div>
                        <div className="notification-content">
                          <div className="notification-title">{theater.theaterName}</div>
                          <div className="notification-message">
                            {theater.unreadCount} new message{theater.unreadCount > 1 ? 's' : ''}
                          </div>
                        </div>
                        {theater.unreadCount > 0 && (
                          <span className="notification-dot"></span>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="notification-footer">
                  <button 
                    className="view-all-btn"
                    onClick={() => {
                      setShowNotificationDropdown(false);
                      navigate('/messages');
                    }}
                  >
                    View All Messages
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="user-profile-container" ref={profileRef}>
            <div 
              className="user-avatar clickable" 
              onClick={toggleProfileDropdown}
              title="Profile Menu"
            >
              {profileLogoUrl ? (
                <img 
                  ref={profileImageRef}
                  src={profileLogoUrl} 
                  alt="Profile" 
                  className="profile-image"
                  onLoad={() => {
                    setIsImageLoading(false);
                    // Smoothly show image and hide initials
                    if (profileImageRef.current) {
                      profileImageRef.current.style.opacity = '1';
                    }
                    const initialsSpan = profileImageRef.current?.parentElement?.querySelector('.avatar-initials');
                    if (initialsSpan) {
                      initialsSpan.style.opacity = '0';
                      // Hide initials after transition completes
                      setTimeout(() => {
                        if (initialsSpan.style.opacity === '0') {
                          initialsSpan.style.display = 'none';
                        }
                      }, 200);
                    }
                  }}
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    setIsImageLoading(false);
                    e.target.style.display = 'none';
                    const initialsSpan = e.target.parentElement.querySelector('.avatar-initials');
                    if (initialsSpan) {
                      initialsSpan.style.display = 'flex';
                      initialsSpan.style.opacity = '1';
                    }
                  }}
                  style={{ 
                    opacity: isImageLoading && !previousLogoUrlRef.current ? 0 : 1,
                    transition: 'opacity 0.2s ease-in-out'
                  }}
                />
              ) : null}
              <span 
                className="avatar-initials" 
                style={{ 
                  display: profileLogoUrl && !isImageLoading ? 'none' : 'flex',
                  opacity: profileLogoUrl && !isImageLoading ? 0 : 1,
                  transition: 'opacity 0.2s ease-in-out'
                }}
              >
                {userInitials}
              </span>
            </div>
            {showProfileDropdown && (
              <div className="profile-dropdown">
                <div className="profile-info">
                  <div className="profile-name">{user.name || `${user.firstName} ${user.lastName}`}</div>
                  <div className="profile-email">{user.email}</div>
                  {(user.role || userType) && (
                    <div className="profile-role profile-role-white">
                      {user.role 
                        ? (typeof user.role === 'object' ? user.role.name : user.role.replace('_', ' ').toUpperCase())
                        : (userType ? userType.replace('_', ' ').toUpperCase() : '')
                      }
                    </div>
                  )}
                </div>
                <div className="profile-divider"></div>
                <div className="profile-actions">
                  {hasSettingsAccess && (
                    <button className="profile-action-btn" onClick={handleAccountSettings}>
                      <span>⚙️</span>
                      Account Settings
                    </button>
                  )}
                  <button className="profile-action-btn logout-btn" onClick={handleLogout}>
                    <span>🚪</span>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;