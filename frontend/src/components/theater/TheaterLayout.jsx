import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import TheaterSidebar from './TheaterSidebar';
import Header from '../Header'; // Use global header component
import config from '../../config';
import globalPOSService from '@services/GlobalPOSNotificationService'; // Global POS notification service
import '../../styles/Dashboard.css'; // Use same styles as admin layout

const TheaterLayout = ({ children, pageTitle = 'Theater Dashboard', dateFilterProps = null, currentPage: propCurrentPage = null, posStatusData = null }) => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Persist sidebar state in localStorage
    const savedState = localStorage.getItem('theater-sidebar-open');
    return savedState ? JSON.parse(savedState) : false;
  });
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Persist sidebar collapsed state in localStorage
    const savedState = localStorage.getItem('theater-sidebar-collapsed');
    return savedState !== null ? JSON.parse(savedState) : true; // Default to collapsed (icons only)
  });
  
  const [theaterName, setTheaterName] = useState('');
  const [theaterInfo, setTheaterInfo] = useState(null);
  const location = useLocation();
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId } = useAuth();

  // Custom setSidebarOpen that persists state
  const handleSetSidebarOpen = (value) => {
    setSidebarOpen(value);
    localStorage.setItem('theater-sidebar-open', JSON.stringify(value));
  };
  
  // Custom setSidebarCollapsed that persists state
  const handleSetSidebarCollapsed = (value) => {
    setSidebarCollapsed(value);
    localStorage.setItem('theater-sidebar-collapsed', JSON.stringify(value));
  };

  // User profile for theater admin (similar to AdminLayout structure)
  const [userProfile] = useState({
    firstName: 'Theater',
    lastName: 'Admin', 
    email: 'admin@theater.com',
    role: 'Theater Administrator'
  });

  // ✅ FIX: Use prop currentPage if provided, otherwise calculate from URL
  // Recalculate currentPage whenever location changes to ensure sidebar highlights correctly
  const currentPage = useMemo(() => {
    if (propCurrentPage) return propCurrentPage;
    
    const path = location.pathname;
    
    // ✅ FIX: Use more specific path matching to avoid conflicts
    // Dashboard - check first and use exact match pattern
    if (path.match(/\/theater-dashboard(\/|$)/)) return 'dashboard';
    
    // Products - check more specific paths first
    if (path.includes('/theater-add-product')) return 'add-product';
    
    // ✅ FIX: Check stock management BEFORE products to avoid conflicts
    // Stock management can have /theater-stock-management/:theaterId or /theater-stock-management/:theaterId/:productId
    // IMPORTANT: This check MUST come before /theater-products check
    // Return 'products' to highlight "Product Stock" in sidebar
    if (path.includes('/theater-stock-management')) {
      return 'products';
    }
    
    if (path.includes('/simple-products')) return 'simple-products';
    if (path.includes('/theater-products')) {
      return 'products';
    }
    // ✅ FIX: Check cafe stock management BEFORE general cafe path
    // Cafe stock management: /cafe-stock-management/:theaterId/:productId
    if (path.includes('/cafe-stock-management')) {
      return 'cafe';
    }
    // ✅ FIX: Make cafe path more specific to avoid matching other paths
    if (path.match(/\/cafe(\/|$)/)) return 'cafe';
    if (path.includes('/theater-product-types')) return 'product-types';
    
    // Categories
    if (path.includes('/theater-categories')) return 'categories';
    if (path.includes('/theater-kiosk-types')) return 'kiosk-types';
    
    // POS
    if (path.includes('/theater-order-pos')) return 'professional-pos';
    if (path.includes('/offline-pos')) return 'offline-pos';
    if (path.includes('/pos/')) return 'online-pos';
    if (path.includes('/view-cart')) return 'view-cart';
    
    // Orders
    if (path.includes('/theater-orders')) return 'orders';
    if (path.includes('/theater-order-history')) return 'order-history';
    if (path.includes('/online-order-history')) return 'online-order-history';
    if (path.includes('/kiosk-order-history')) return 'kiosk-order-history';
    
    // QR Management
    if (path.includes('/theater-qr-code-names')) return 'qr-code-names';
    if (path.includes('/theater-generate-qr')) return 'generate-qr';
    if (path.includes('/theater-qr-management')) return 'qr-management';
    
    // User Management
    if (path.includes('/theater-user-management')) return 'theater-users';
    if (path.includes('/theater-roles')) return 'theater-roles';
    if (path.includes('/theater-role-access')) return 'theater-role-access';
    
    // Messages & Banner & Offers
    if (path.includes('/theater-messages')) return 'messages';
    if (path.includes('/theater-banner')) return 'banner';
    if (path.includes('/theater-offers')) return 'offers';
    if (path.includes('/combo-offers')) return 'combo-offers';
    
    // Reports & Settings
    if (path.includes('/theater-reports')) return 'reports';
    if (path.includes('/theater-settings')) return 'settings';
    
    // Fallback
    return 'dashboard';
  }, [location.pathname, propCurrentPage]);

  // REMOVED: Don't close sidebar on route change - let user control it manually
  // The sidebar state is now persisted in localStorage

  // Debug: Log currentPage changes
  useEffect(() => {
    console.log('🔍 [TheaterLayout] currentPage updated:', {
      pathname: location.pathname,
      currentPage: currentPage,
      propCurrentPage: propCurrentPage
    });
  }, [currentPage, location.pathname, propCurrentPage]);

  // Add body class for sidebar state
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }

    return () => {
      document.body.classList.remove('sidebar-open');
    };
  }, [sidebarOpen]);

  // Fetch theater name and update browser title
  useEffect(() => {
    const fetchTheaterName = async () => {
      // Determine effective theater ID
      let effectiveTheaterId = theaterId || userTheaterId;
      
      if (!effectiveTheaterId && user) {
        if (user.assignedTheater) {
          effectiveTheaterId = user.assignedTheater._id || user.assignedTheater;
        } else if (user.theater) {
          effectiveTheaterId = user.theater._id || user.theater;
        }
      }

      if (!effectiveTheaterId) {
        document.title = `${pageTitle} - YQPayNow`;
        return;
      }

      // Check if theater name is cached in localStorage
      const cachedTheaterName = localStorage.getItem(`theater_${effectiveTheaterId}_name`);
      if (cachedTheaterName) {
        setTheaterName(cachedTheaterName);
        document.title = `${pageTitle} - ${cachedTheaterName}`;
        return;
      }

      // Fetch theater info from API
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${config.api.baseUrl}/theater-dashboard/${effectiveTheaterId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response && response.ok) {
          try {
            // Clone response if body might be consumed elsewhere
            const clonedResponse = response.clone ? response.clone() : response;
            const data = await clonedResponse.json();
            if (data.success && data.theater && data.theater.name) {
              const name = data.theater.name;
              setTheaterName(name);
              // Cache the theater name to avoid repeated API calls
              localStorage.setItem(`theater_${effectiveTheaterId}_name`, name);
              document.title = `${pageTitle} - ${name}`;
            } else {
              document.title = `${pageTitle} - YQPayNow`;
            }
          } catch (jsonError) {
            // Handle "body stream already read" error gracefully
            if (jsonError.message?.includes('already read')) {
              // Response body was already consumed, skip this fetch
              document.title = `${pageTitle} - YQPayNow`;
              return;
            }
            throw jsonError;
          }
        } else {
          document.title = `${pageTitle} - YQPayNow`;
        }
      } catch (error) {
        // Don't log connection refused errors (server is down)
        if (!error.message?.includes('Failed to fetch') && !error.message?.includes('ERR_CONNECTION_REFUSED')) {
          console.error('Failed to fetch theater name:', error);
        }
        document.title = `${pageTitle} - YQPayNow`;
      }
    };

    fetchTheaterName();
  }, [theaterId, userTheaterId, user, pageTitle]);

  // 🔔 Start global POS notification service for auto-printing and beep sounds
  useEffect(() => {
    const effectiveTheaterId = theaterId || userTheaterId;
    
    if (!effectiveTheaterId) {
      return;
    }

    // Fetch theater info for printing
    const fetchTheaterInfoForPrinting = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${config.api.baseUrl}/theaters/${effectiveTheaterId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response && response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const info = {
              name: data.data.name,
              address: data.data.address,
              phone: data.data.phone,
              email: data.data.email,
              gstNumber: data.data.gstNumber,
              fssaiNumber: data.data.fssaiNumber
            };
            setTheaterInfo(info);
            
            // Start or update global POS service
            globalPOSService.start(effectiveTheaterId, info);
          }
        }
      } catch (error) {
        if (!error.message?.includes('Failed to fetch')) {
          console.error('[TheaterLayout] Error fetching theater info for POS service:', error);
        }
        // Start service anyway with minimal info
        globalPOSService.start(effectiveTheaterId, {});
      }
    };

    fetchTheaterInfoForPrinting();

    // Don't stop the service when component unmounts
    // Let it run globally in the background
    return () => {
    };
  }, [theaterId, userTheaterId]);


  return (
    <div className={`dashboard-container ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <TheaterSidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={handleSetSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        currentPage={currentPage}
      />

      {/* Main Content */}
      <main className={`dashboard-main ${!sidebarCollapsed ? 'expanded' : 'collapsed'}`}>
        <Header 
          sidebarOpen={sidebarOpen}
          setSidebarOpen={handleSetSidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={handleSetSidebarCollapsed}
          pageTitle={pageTitle}
          userProfile={userProfile}
          dateFilterProps={dateFilterProps}
          posStatusData={posStatusData}
        />

        {/* Content */}
        <div className="dashboard-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default TheaterLayout;