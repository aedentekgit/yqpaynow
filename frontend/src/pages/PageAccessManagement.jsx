import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import config from '../config';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import Pagination from '../components/Pagination';
import { useModal } from '../contexts/ModalContext';
import { clearTheaterCache, addCacheBuster } from '../utils/cacheManager';
import { usePerformanceMonitoring, preventLayoutShift } from '../hooks/usePerformanceMonitoring';
import { extractPagesFromAppJS, getPagesByRole } from '../utils/pageExtractor';
import { optimizedFetch } from '../utils/apiOptimizer';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/QRManagementPage.css'; // Using same CSS as QR Code Types
import '../styles/TheaterList.css'; // Theater List design styling
import '../styles/pages/PageAccessManagement.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';
import { clearCachePattern } from '../utils/cacheUtils';

// Table Row Skeleton Component (matching QR Code Types)
const TableRowSkeleton = React.memo(() => (
  <tr className="theater-row skeleton">
    <td><div className="skeleton-text short"></div></td>
    <td><div className="skeleton-text medium"></div></td>
    <td><div className="skeleton-text short"></div></td>
    <td><div className="skeleton-buttons"></div></td>
  </tr>
));

const PageAccessManagement = () => {
  // Get theaterId from URL params
  const { theaterId } = useParams();
  const navigate = useNavigate();

  // State management (identical to Role Access Management)
  const [pageAccessConfigs, setPageAccessConfigs] = useState([]);
  const [activeRoles, setActiveRoles] = useState([]);
  const [theater, setTheater] = useState(null);
  const [theaterLoading, setTheaterLoading] = useState(!!theaterId);

  // Filter pages to show only theater admin related pages
  const theaterAdminPages = useMemo(() => {
    const allPages = extractPagesFromAppJS();
    return allPages.filter(page => {
      // Include pages that have theater-admin or theater_user roles (theater admin related)
      return page.roles && (
        page.roles.includes('theater-admin') ||
        page.roles.includes('theater_user')
      );
    });
  }, []);

  const [frontendPages, setFrontendPages] = useState(theaterAdminPages);
  const [loading, setLoading] = useState(true);
  const [selectedPageAccess, setSelectedPageAccess] = useState(null);
  const [pageToggleStates, setPageToggleStates] = useState({});
  const [togglingPageKey, setTogglingPageKey] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [summary, setSummary] = useState({
    activePageAccess: 0,
    inactivePageAccess: 0,
    totalPageAccess: 0
  });

  // Modal states (identical structure)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form data for page access - initialized with theater admin pages only
  const [formData, setFormData] = useState({
    roleId: '',
    pages: theaterAdminPages.map(page => ({
      page: page.page,
      pageName: page.pageName,
      route: page.route,
      hasAccess: false
    }))
  });

  // Refs and timeouts
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const { showError, showSuccess, confirm } = useModal();

  // Performance monitoring
  usePerformanceMonitoring('PageAccessManagement');

  // Load existing page access states from database
  const loadExistingPageAccess = useCallback(async () => {
    try {
      // ✅ FIX: Theater ID is REQUIRED for page access management
      if (!theaterId) {
        console.warn('⚠️ [loadExistingPageAccess] Theater ID is missing - page access is theater-specific');
        setPageToggleStates({});
        setSummary({
          activePageAccess: 0,
          inactivePageAccess: theaterAdminPages.length,
          totalPageAccess: theaterAdminPages.length
        });
        return false;
      }

      // ✅ FIX: Add authentication token
      const token = config.helpers.getAuthToken();

      // ✅ FIX: Fetch theater-specific page access data with cache-busting timestamp
      const cacheBuster = `_t=${Date.now()}`;
      const url = `${config.api.baseUrl}/page-access?theaterId=${theaterId}&limit=1000&${cacheBuster}`;


      // ✅ FIX: Use regular fetch WITHOUT cache to always get fresh data
      // This prevents stale data from showing after toggle operations
      const response = await unifiedFetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        credentials: 'same-origin'
      }, {
        forceRefresh: true, // Force fresh fetch, don't use cached data
        cacheTTL: 0
      });


      // ✅ FIX: Parse JSON and check response properly
      // Note: unifiedFetch handles non-OK responses by throwing, so if we get here, response should be OK
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ [loadExistingPageAccess] Failed to parse response:', parseError);
        // If response indicates an error, provide better error message
        if (!response.ok || (response.status && response.status >= 400)) {
          throw new Error(`HTTP ${response.status}: Failed to fetch page access`);
        }
        throw new Error(`Failed to parse page access response: ${parseError.message}`);
      }


      if (data) {

        if (data.success && data.data) {
          // ✅ FIX: Backend returns data.data.pageAccessList as array for theater-specific query
          let existingPages = [];

          if (data.data.pageAccessList && Array.isArray(data.data.pageAccessList)) {
            // Theater-specific response: data.data.pageAccessList
            existingPages = data.data.pageAccessList;
          } else if (Array.isArray(data.data)) {
            // Global response: data.data (array directly)
            existingPages = data.data;
          }


          const toggleStates = {};


          existingPages.forEach(pageAccess => {
            toggleStates[pageAccess.page] = pageAccess.isActive;
          });

          setPageToggleStates(toggleStates);

          // Update summary counts
          const activeCount = existingPages.filter(p => p.isActive).length;
          const inactiveCount = existingPages.filter(p => !p.isActive).length;
          setSummary({
            activePageAccess: activeCount,
            inactivePageAccess: inactiveCount,
            totalPageAccess: theaterAdminPages.length
          });


          return true; // Successfully loaded
        }
      }
    } catch (error) {
      console.error('❌ [loadExistingPageAccess] Error loading page access:', error);
      console.error('❌ [loadExistingPageAccess] Error details:', error.message, error.stack);
      // If backend is not available, DON'T clear existing states
      // setPageToggleStates({}); // REMOVED: This was clearing the states on error
      console.warn('⚠️ [loadExistingPageAccess] Keeping existing toggle states due to error');
      return false; // Failed to load
    }
    return false;
  }, [theaterAdminPages.length, theaterId]); // ✅ FIX: Include theaterId in dependencies

  // Fetch theater details
  const fetchTheaterDetails = useCallback(async () => {
    if (!theaterId) {
      setTheaterLoading(false);
      return;
    }

    try {
      const token = config.helpers.getAuthToken();
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}`,
        {
          headers: {
            ...token ? { 'Authorization': `Bearer ${token}` } : {}
          }
        },
        `theater_${theaterId}`,
        120000 // 2-minute cache
      );

      if (result) {
        setTheater(result.success ? result.data : result);
      }
    } catch (error) {
      console.error('❌ [fetchTheaterDetails] Error fetching theater:', error);
      showError('Failed to load theater details');
    } finally {
      setTheaterLoading(false);
    }
  }, [theaterId, showError]);

  // Load page data - mirror frontend pages and load existing toggle states
  const loadPageAccessData = useCallback(async () => {
    if (!isMountedRef.current) return;

    setLoading(true);

    try {
      // Always set the theater admin pages from App.js immediately - don't wait for backend
      setFrontendPages(theaterAdminPages);

      // Try to load existing page access states (don't block on this)
      loadExistingPageAccess().then(backendAvailable => {
        if (!backendAvailable) {
          console.warn('⚠️ [loadPageAccessData] Backend not available, using default states');
        }
      }).catch(err => {
        console.error('❌ [loadPageAccessData] Error loading page access:', err);
      });

    } catch (error) {
      console.error('❌ [loadPageAccessData] Error loading page access data:', error);
      // Even if there's an error, still show the theater admin pages
      setFrontendPages(theaterAdminPages);
    } finally {
      // Always set loading to false
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterAdminPages, loadExistingPageAccess]);

  // Load active roles - just use static data for now
  const loadActiveRoles = useCallback(() => {
    // Static roles data - no backend calls
    const staticRoles = [
      { _id: '1', name: 'admin', description: 'Super Administrator' },
      { _id: '2', name: 'theater-admin', description: 'Theater Administrator' },
      { _id: '3', name: 'user', description: 'Regular User' }
    ];

    setActiveRoles(staticRoles);
  }, []);

  // Handle page toggle - Optimistic UI update pattern (like TheaterList)
  const handlePageToggleChange = useCallback(async (page, isEnabled) => {
    const pageKey = page.page;
    const newStatus = isEnabled;

    // Prevent multiple clicks on the same page
    if (togglingPageKey === pageKey) {
      return;
    }

    // Get current status from state directly (not using setState callback)
    const currentStatus = pageToggleStates[pageKey] || false;

    // Set loading state for this specific page
    setTogglingPageKey(pageKey);

    try {
      // 🚀 INSTANT UI UPDATE: Update local state immediately for instant feedback
      setPageToggleStates(prev => ({
        ...prev,
        [pageKey]: newStatus
      }));

      // Also update summary counts immediately
      setSummary(prev => ({
        activePageAccess: newStatus ? prev.activePageAccess + 1 : Math.max(0, prev.activePageAccess - 1),
        inactivePageAccess: newStatus ? Math.max(0, prev.inactivePageAccess - 1) : prev.inactivePageAccess + 1,
        totalPageAccess: prev.totalPageAccess
      }));

      // Get authentication token
      const token = config.helpers.getAuthToken();
      if (!token) {
        throw new Error('Authentication required. Please login again.');
      }

      if (newStatus) {
        // POST to enable page access

        // Validate required data
        if (!theaterId) {
          console.error('❌ [handlePageToggleChange] Missing theaterId');
          // Rollback optimistic update
          setPageToggleStates(prev => ({ ...prev, [pageKey]: currentStatus }));
          setSummary(prev => ({
            activePageAccess: currentStatus ? prev.activePageAccess + 1 : Math.max(0, prev.activePageAccess - 1),
            inactivePageAccess: currentStatus ? Math.max(0, prev.inactivePageAccess - 1) : prev.inactivePageAccess + 1,
            totalPageAccess: prev.totalPageAccess
          }));
          setTogglingPageKey(null);
          showError('Theater ID is required to enable page access');
          return;
        }

        // Map roles to requiredRoles (backend expects requiredRoles, not allowedRoles)
        const requiredRoles = page.roles || [];
        // Map role names to match backend enum: ['super_admin', 'theater_admin', 'theater_staff', 'customer']
        let mappedRoles = requiredRoles.map(role => {
          if (role === 'admin') return 'super_admin';
          if (role === 'theater-admin' || role === 'theater_admin') return 'theater_admin';
          if (role === 'theater_user' || role === 'theater-user') return 'theater_staff';
          return role;
        }).filter(role => ['super_admin', 'theater_admin', 'theater_staff', 'customer'].includes(role));

        // ✅ FIX: Ensure at least one role is present (default to theater_admin if empty)
        if (mappedRoles.length === 0) {
          console.warn('⚠️ [handlePageToggleChange] No valid roles found, defaulting to theater_admin');
          mappedRoles = ['theater_admin'];
        }

        // ✅ FIX: Keep route template as-is (backend stores template, not actual route)
        // The route template like '/offline-pos/:theaterId' is stored as-is
        const route = page.route || '';
        if (!route) {
          throw new Error('Route is required for page access');
        }

        // Determine category based on page name or route
        let category = 'admin'; // default
        const pageNameLower = (page.pageName || '').toLowerCase();
        const routeLower = route.toLowerCase();

        if (pageNameLower.includes('order') || routeLower.includes('order') || routeLower.includes('pos')) {
          category = 'orders';
        } else if (pageNameLower.includes('product') || routeLower.includes('product')) {
          category = 'products';
        } else if (pageNameLower.includes('category') || routeLower.includes('category')) {
          category = 'products';
        } else if (pageNameLower.includes('qr') || routeLower.includes('qr')) {
          category = 'qr';
        } else if (pageNameLower.includes('user') || routeLower.includes('user')) {
          category = 'users';
        } else if (pageNameLower.includes('dashboard') || routeLower.includes('dashboard')) {
          category = 'dashboard';
        } else if (pageNameLower.includes('setting') || routeLower.includes('setting')) {
          category = 'settings';
        } else if (pageNameLower.includes('stock') || routeLower.includes('stock')) {
          category = 'stock';
        }

        // ✅ FIX: Validate all required fields before sending
        if (!page.page || !page.pageName || !route) {
          throw new Error('Missing required page information: page, pageName, or route');
        }

        const payload = {
          page: page.page.trim(),
          pageName: page.pageName.trim(),
          route: route.trim(),
          description: (page.description || '').trim(),
          requiredRoles: mappedRoles,
          category: category,
          isActive: true,
          theaterId: theaterId
        };


        // ✅ NOTE: Backend's addPage method handles existing pages by updating them
        // So POST will work whether the page exists or not
        // POST to backend to save page access
        const response = await unifiedFetch(`${config.api.baseUrl}/page-access`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(payload)
        }, {
          forceRefresh: true, // Don't cache POST requests
          cacheTTL: 0
        });

        // ✅ FIX: Parse JSON and check response (same logic as TheaterList.jsx)
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ [handlePageToggleChange] Failed to parse response JSON:', parseError);
          if (response.ok === false || (response.status && response.status >= 400)) {
            try {
              const errorText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errorText}`);
            } catch (textError) {
              throw new Error(`HTTP ${response.status}: Failed to save page access`);
            }
          }
          throw parseError;
        }

        // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
        // Backend returns: { success: true, message: '...', data: {...} }
        if (data && data.success === false) {
          // Backend explicitly returned success: false
          console.error('❌ [handlePageToggleChange] Backend returned success=false:', data);
          const errorMessage = data.message || data.error || 'Failed to save page access';
          throw new Error(errorMessage);
        }

        // If success flag is true, proceed (don't check response.ok as unifiedFetch may modify it)
        if (data && data.success === true) {
          // Backend confirmed success - this is the primary indicator
          // Proceed to success handling - success confirmed
        } else if (!response.ok || (response.status && response.status >= 400)) {
          // Only check response.ok if no explicit success flag
          console.error('❌ [handlePageToggleChange] HTTP error response:', {
            status: response.status,
            statusText: response.statusText,
            data: data
          });

          // Extract detailed error message
          let errorMessage = 'Failed to save page access';
          if (data && data.message) {
            errorMessage = data.message;
          } else if (data && data.error) {
            errorMessage = data.error;
          } else if (data && data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            errorMessage = data.errors.map(e => e.msg || e.message).join(', ');
          }

          throw new Error(errorMessage);
        } else {
          // No success flag but HTTP status is OK - assume success
        }


        // Clear cache
        const cacheKey = `page_access_${theaterId || 'all'}_limit_1000`;
        try {
          if (typeof caches !== 'undefined') {
            caches.delete(cacheKey);
          }
          // Also clear sessionStorage cache if used
          try {
            sessionStorage.removeItem(cacheKey);
          } catch (e) {
            // Ignore sessionStorage errors
          }
        } catch (e) {
          console.warn('⚠️ [handlePageToggleChange] Cache clear failed:', e);
        }

        // ✅ FIX: Clear page access cache pattern to ensure Role Access Management gets fresh data
        try {
          clearCachePattern('page_access_');
        } catch (e) {
          console.warn('⚠️ [handlePageToggleChange] Failed to clear cache pattern:', e);
        }

        showSuccess(`Page "${page.pageName}" access enabled successfully`);

        // Reload to sync with backend state
        setTimeout(() => {
          loadExistingPageAccess().catch(err => {
            console.error('❌ [handlePageToggleChange] Failed to reload after enable:', err);
          });
        }, 500);

      } else {
        // DELETE to disable page access

        // ✅ FIX: Validate theaterId for disable operation
        if (!theaterId) {
          console.error('❌ [handlePageToggleChange] Missing theaterId for disable operation');
          // Rollback optimistic update
          setPageToggleStates(prev => ({ ...prev, [pageKey]: currentStatus }));
          setSummary(prev => ({
            activePageAccess: currentStatus ? prev.activePageAccess + 1 : Math.max(0, prev.activePageAccess - 1),
            inactivePageAccess: currentStatus ? Math.max(0, prev.inactivePageAccess - 1) : prev.inactivePageAccess + 1,
            totalPageAccess: prev.totalPageAccess
          }));
          setTogglingPageKey(null);
          showError('Theater ID is required to disable page access');
          return;
        }


        // ✅ FIX: Fetch page list to find the page ID
        const fetchUrl = `${config.api.baseUrl}/page-access?theaterId=${theaterId}&limit=1000`;
        const fetchResponse = await unifiedFetch(fetchUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          cacheKey: `page_access_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        });

        if (!fetchResponse.ok) {
          const errorData = await fetchResponse.json().catch(() => ({}));
          console.error('❌ [handlePageToggleChange] Failed to fetch page list:', {
            status: fetchResponse.status,
            statusText: fetchResponse.statusText,
            error: errorData
          });
          throw new Error(errorData.message || errorData.error || 'Failed to fetch page list');
        }

        const fetchData = await fetchResponse.json();

        // ✅ FIX: Handle different response structures
        let pageList = [];
        if (fetchData.success && fetchData.data) {
          if (Array.isArray(fetchData.data.pageAccessList)) {
            pageList = fetchData.data.pageAccessList;
          } else if (Array.isArray(fetchData.data)) {
            pageList = fetchData.data;
          }
        } else if (Array.isArray(fetchData.data)) {
          pageList = fetchData.data;
        }


        // ✅ FIX: Find page by page identifier (not _id)
        const pageToDelete = pageList.find(p => p.page === pageKey || p.page === page.page);

        if (!pageToDelete) {
          console.warn('⚠️ [handlePageToggleChange] Page not found in access list, already disabled');
          // Page is already disabled, just show success
          showSuccess(`Page "${page.pageName}" access is already disabled`);
          setTogglingPageKey(null);
          return;
        }

        if (!pageToDelete._id) {
          console.warn('⚠️ [handlePageToggleChange] Page found but missing _id:', pageToDelete);
          // Page exists but has no ID, treat as already disabled
          showSuccess(`Page "${page.pageName}" access is already disabled`);
          setTogglingPageKey(null);
          return;
        }

        console.log('🗑️ [handlePageToggleChange] Deleting page:', {
          pageId: pageToDelete._id,
          pageName: pageToDelete.pageName || page.pageName,
          theaterId
        });

        // ✅ FIX: Use correct DELETE endpoint format
        const deleteUrl = `${config.api.baseUrl}/page-access/${theaterId}/${pageToDelete._id}`;


        const response = await unifiedFetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          forceRefresh: true, // Don't cache DELETE requests
          cacheTTL: 0
        });

        // ✅ FIX: Parse JSON and check response (same logic as POST)
        let deleteData;
        try {
          deleteData = await response.json();
          console.log('📥 [handlePageToggleChange] Delete response:', {
            status: response.status,
            ok: response.ok,
            data: deleteData
          });
        } catch (parseError) {
          console.error('❌ [handlePageToggleChange] Failed to parse delete response JSON:', parseError);
          if (response.ok === false || (response.status && response.status >= 400)) {
            try {
              const errorText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errorText}`);
            } catch (textError) {
              throw new Error(`HTTP ${response.status}: Failed to delete page access`);
            }
          }
          throw parseError;
        }

        // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
        if (deleteData && deleteData.success === true) {
          // Backend confirmed success
        } else if (deleteData && deleteData.success === false) {
          // Backend explicitly returned success: false
          console.error('❌ [handlePageToggleChange] Delete failed (success=false):', deleteData);
          const errorMessage = deleteData.message || deleteData.error || 'Failed to delete page access';
          throw new Error(errorMessage);
        } else if (!response.ok || (response.status && response.status >= 400)) {
          // HTTP error status but no success flag - treat as error
          console.error('❌ [handlePageToggleChange] Delete failed (HTTP error):', {
            status: response.status,
            statusText: response.statusText,
            data: deleteData
          });

          // Extract detailed error message
          let errorMessage = 'Failed to delete page access';
          if (deleteData && deleteData.message) {
            errorMessage = deleteData.message;
          } else if (deleteData && deleteData.error) {
            errorMessage = deleteData.error;
          } else if (deleteData && deleteData.errors && Array.isArray(deleteData.errors) && deleteData.errors.length > 0) {
            errorMessage = deleteData.errors.map(e => e.msg || e.message).join(', ');
          }

          throw new Error(errorMessage);
        } else {
          // No success flag but HTTP status is OK - assume success
        }

        // Clear cache
        const cacheKey = `page_access_${theaterId || 'all'}_limit_1000`;
        try {
          if (typeof caches !== 'undefined') {
            caches.delete(cacheKey);
          }
          // Also clear sessionStorage cache if used
          try {
            sessionStorage.removeItem(cacheKey);
          } catch (e) {
            // Ignore sessionStorage errors
          }
        } catch (e) {
          console.warn('⚠️ [handlePageToggleChange] Cache clear failed:', e);
        }

        // ✅ FIX: Clear page access cache pattern to ensure Role Access Management gets fresh data
        try {
          clearCachePattern('page_access_');
        } catch (e) {
          console.warn('⚠️ [handlePageToggleChange] Failed to clear cache pattern:', e);
        }

        showSuccess(`Page "${page.pageName}" access disabled successfully`);

        // Reload to sync with backend state
        setTimeout(() => {
          loadExistingPageAccess().catch(err => {
            console.error('❌ [handlePageToggleChange] Failed to reload after disable:', err);
          });
        }, 500);
      }

    } catch (error) {
      console.error('❌ Failed to toggle page status:', error);

      // 🔄 ROLLBACK: Revert the optimistic update
      setPageToggleStates(prev => ({
        ...prev,
        [pageKey]: currentStatus // Revert to original status
      }));

      // Revert summary counts as well
      setSummary(prev => ({
        activePageAccess: currentStatus ? prev.activePageAccess + 1 : Math.max(0, prev.activePageAccess - 1),
        inactivePageAccess: currentStatus ? Math.max(0, prev.inactivePageAccess - 1) : prev.inactivePageAccess + 1,
        totalPageAccess: prev.totalPageAccess
      }));

      // Show error message
      showError(error.message || 'Failed to update page access. Please try again.');
    } finally {
      // Clear loading state
      setTogglingPageKey(null);
    }
  }, [showSuccess, showError, theaterId, loadExistingPageAccess]);

  // Debounced search functionality - filter pages client-side
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when searching
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Search handler
  const handleSearch = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
  }, []);

  // Page change handler
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
  }, []);

  // Items per page change
  const handleItemsPerPageChange = useCallback((e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  }, []);

  // Create new page access configuration
  const handleCreateNewPageAccess = () => {

    // Ensure roles are loaded before opening modal
    if (activeRoles.length === 0) {

      loadActiveRoles();
    }

    const formPages = frontendPages.map(page => ({
      page: page.page,
      pageName: page.pageName,
      route: page.route,
      hasAccess: false
    }));


    setFormData({
      roleId: '',
      pages: formPages
    });
    setSelectedPageAccess(null);
    setShowCreateModal(true);
  };

  // Handle role selection in form
  const handleRoleChange = (roleId) => {
    setFormData(prev => ({
      ...prev,
      roleId
    }));
  };

  // Handle page access toggle
  const handlePageToggle = (pageKey, hasAccess) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map(p =>
        p.page === pageKey ? { ...p, hasAccess } : p
      )
    }));
  };

  // Delete page access configuration
  const deletePageAccess = (pageAccess) => {
    setSelectedPageAccess(pageAccess);
    setShowDeleteModal(true);
  };

  const handleSubmitPageAccess = async () => {
    try {
      const selectedPages = formData.pages.filter(page => page.hasAccess);

      if (selectedPages.length === 0) {
        showError('Please select at least one page');
        return;
      }

      // ✅ FIX: Get authentication token
      const token = config.helpers.getAuthToken();

      if (!token) {
        showError('Authentication required. Please login again.');
        return;
      }

      setLoading(true);

      // ✅ FIX: Actually save to backend using batch endpoint
      const response = await unifiedFetch(`${config.api.baseUrl}/page-access/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({
          pages: selectedPages.map(page => ({
            page: page.page,
            pageName: page.pageName,
            route: page.route,
            description: frontendPages.find(p => p.page === page.page)?.description || '',
            allowedRoles: [formData.roleId],
            isActive: true
          }))
        })
      }, {
        forceRefresh: true, // Don't cache POST requests
        cacheTTL: 0
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setShowCreateModal(false);
          toast.success('Record created successfully!');
          showSuccess(`✅ Page access saved to database! ${selectedPages.length} pages configured for role: ${activeRoles.find(r => r._id === formData.roleId)?.name || 'Unknown'}`);

          // Refresh page access data
          loadPageAccessData();

          // Reset form
          setFormData({
            roleId: '',
            pages: theaterAdminPages.map(page => ({
              page: page.page,
              pageName: page.pageName,
              route: page.route,
              hasAccess: false
            }))
          });
        } else {
          throw new Error(data.message || 'Failed to save page access');
        }
      } else if (response.status === 401) {
        throw new Error('Unauthorized: Please login as super admin');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save page access configuration`);
      }
    } catch (error) {
      console.error('❌ [handleSubmitPageAccess] Error saving page access:', error);
      showError(`Failed to save page access: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePageAccess = async () => {
    try {
      // ✅ FIX: Get authentication token
      const token = config.helpers.getAuthToken();

      if (!token) {
        showError('Authentication required. Please login again.');
        return;
      }

      if (!selectedPageAccess) {
        showError('No page access selected for deletion');
        return;
      }

      setLoading(true);

      // ✅ FIX: Actually delete from backend
      const response = await unifiedFetch(`${config.api.baseUrl}/page-access/${selectedPageAccess._id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
      });

      if (response.ok) {
        const data = await response.json();
        setShowDeleteModal(false);
        toast.success('Record deleted successfully!');
        showSuccess(`✅ Page access deleted successfully from database: ${selectedPageAccess.pageName || 'Unknown'}`);

        // Refresh page access data
        loadPageAccessData();
      } else if (response.status === 401) {
        throw new Error('Unauthorized: Please login as super admin');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete page access');
      }
    } catch (error) {
      console.error('❌ [handleDeletePageAccess] Error deleting page access:', error);
      showError(`Failed to delete page access: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Initial load - just mirror App.js pages
  useEffect(() => {
    // ✅ FIX: Validate theaterId is present - this page is theater-specific
    if (!theaterId) {
      console.error('❌ [PageAccessManagement] Theater ID is required but missing from URL');
      showError('Theater ID is required. Please access this page from the theater list.');
      // Optionally redirect to theater list
      setTimeout(() => {
        navigate('/theater-list');
      }, 2000);
      return;
    }

    // Fetch theater details if theaterId is present
    fetchTheaterDetails();

    // Load roles immediately
    loadActiveRoles();

    // Load page data
    loadPageAccessData();
  }, [theaterId, fetchTheaterDetails, loadActiveRoles, loadPageAccessData, navigate, showError]);

  // Update summary when toggle states change
  useEffect(() => {
    const totalAvailablePages = theaterAdminPages.length;
    const enabledPages = Object.values(pageToggleStates).filter(Boolean).length;

    setSummary({
      activePageAccess: enabledPages,
      inactivePageAccess: totalAvailablePages - enabledPages,
      totalPageAccess: totalAvailablePages
    });
  }, [pageToggleStates, theaterAdminPages.length]);

  // Sort and filter pages by search term
  const sortedPages = useMemo(() => {
    let filtered = [...frontendPages];

    // Apply search filter if search term exists
    if (debouncedSearchTerm.trim()) {
      const searchLower = debouncedSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(page => {
        const pageName = (page.pageName || '').toLowerCase();
        const route = (page.route || '').toLowerCase();
        const description = (page.description || '').toLowerCase();
        const pageKey = (page.page || '').toLowerCase();

        return pageName.includes(searchLower) ||
          route.includes(searchLower) ||
          description.includes(searchLower) ||
          pageKey.includes(searchLower);
      });
    }

    // Sort by page property in ascending order (alphabetical)
    return filtered.sort((a, b) => {
      const pageA = (a.page || '').toLowerCase();
      const pageB = (b.page || '').toLowerCase();
      return pageA.localeCompare(pageB);
    });
  }, [frontendPages, debouncedSearchTerm]);

  // Set up pagination data when sorted pages change
  useEffect(() => {
    if (sortedPages.length > 0) {
      setTotalItems(sortedPages.length);
      setTotalPages(Math.ceil(sortedPages.length / itemsPerPage));
    } else {
      setTotalItems(0);
      setTotalPages(0);
    }
  }, [sortedPages.length, itemsPerPage]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Get paginated pages for current view
  const paginatedPages = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedPages.slice(startIndex, endIndex);
  }, [sortedPages, currentPage, itemsPerPage]);

  // Debug: Log toggle states changes
  useEffect(() => {
  }, [pageToggleStates]);


  // Bulk processing state
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Check if all visible pages are enabled
  const areAllVisibleSelected = useMemo(() => {
    if (paginatedPages.length === 0) return false;
    return paginatedPages.every(page => pageToggleStates[page.page]);
  }, [paginatedPages, pageToggleStates]);

  // Handle "Select All" toggle
  const handleSelectAll = useCallback(async (e) => {
    const isChecked = e.target.checked;
    const targetPages = paginatedPages.filter(page => {
      const currentState = pageToggleStates[page.page] || false;
      return currentState !== isChecked;
    });

    if (targetPages.length === 0) return;

    const confirmed = await confirm({
      title: 'Confirm Bulk Action',
      message: `Are you sure you want to ${isChecked ? 'enable' : 'disable'} access for all ${targetPages.length} visible pages?`,
      type: 'warning',
      confirmText: isChecked ? 'Enable All' : 'Disable All',
      cancelText: 'Cancel'
    });

    if (!confirmed) {
      e.preventDefault();
      return;
    }

    setIsBulkProcessing(true);

    try {
      // Process sequentially to ensure stability
      // We use the existing handler to ensure consistency in logic (optimistic updates, API calls, cache clearing)
      for (const page of targetPages) {
        await handlePageToggleChange(page, isChecked);
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      showSuccess(`Successfully updated ${targetPages.length} pages`);
    } catch (error) {
      console.error('❌ Bulk update failed:', error);
      showError('Some pages failed to update. Please check and try again.');
    } finally {
      setIsBulkProcessing(false);
    }
  }, [paginatedPages, pageToggleStates, handlePageToggleChange, showSuccess, showError, confirm]);

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Page Access Management" currentPage="page-access">
        <div className="role-access-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-access-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title={theaterLoading ? 'Loading Theater...' : (theater?.name || 'Page Access Management')}
              backButtonText="Back to Theater List"
              backButtonPath="/page-access"
            />

            {/* Stats Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.activePageAccess}</div>
                <div className="stat-label">Enabled in Database</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.inactivePageAccess}</div>
                <div className="stat-label">Disabled Pages</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.totalPageAccess}</div>
                <div className="stat-label">Total Pages in App.js</div>
              </div>
            </div>

            {/* Theater Content Container */}
            <div className="theater-content">
              {/* Filters and Search (identical structure) */}
              <div className="theater-filters">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search page access by role or page name..."
                    className="search-input"
                    value={searchTerm}
                    onChange={handleSearch}
                  />
                </div>

                <div className="filter-controls">
                  <div className="results-count">
                    Showing {paginatedPages.length} of {totalItems} pages (Page {currentPage} of {totalPages})
                  </div>
                  <div className="items-per-page">
                    <label>Items per page:</label>
                    <select value={itemsPerPage} onChange={handleItemsPerPageChange} className="items-select">
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* All Pages Table - Shows all available pages dynamically */}
              <div className="table-container">
                <div className="table-wrapper">
                  <table className="theater-table">
                    <thead>
                      <tr>
                        <th className="sno-col">S.NO</th>
                        <th className="page-name-col">PAGE NAME</th>
                        <th className="route-col">ROUTE</th>
                        <th className="description-col">DESCRIPTION</th>
                        <th className="access-status-col" style={{ minWidth: '160px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em' }}>ACCESS STATUS</span>
                            <label
                              className="switch"
                              style={{
                                position: 'relative',
                                display: 'inline-block',
                                width: '50px',
                                height: '24px',
                                margin: 0
                              }}
                              title="Select All Visible"
                            >
                              <input
                                type="checkbox"
                                checked={areAllVisibleSelected}
                                onChange={handleSelectAll}
                                disabled={isBulkProcessing || loading}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span
                                className="slider"
                                style={{
                                  position: 'absolute',
                                  cursor: (isBulkProcessing || loading) ? 'wait' : 'pointer',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  backgroundColor: areAllVisibleSelected ? '#10B981' : '#ccc',
                                  transition: '.4s',
                                  borderRadius: '24px'
                                }}
                              >
                                <span style={{
                                  position: 'absolute',
                                  content: '""',
                                  height: '18px',
                                  width: '18px',
                                  left: areAllVisibleSelected ? '26px' : '3px',
                                  bottom: '3px',
                                  backgroundColor: 'white',
                                  transition: '.4s',
                                  borderRadius: '50%',
                                  display: 'block'
                                }}></span>
                              </span>
                            </label>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading || isBulkProcessing ? (
                        Array(5).fill(0).map((_, index) => (
                          <tr key={index} className="theater-row skeleton">
                            <td className="sno-cell"><div className="skeleton-text short"></div></td>
                            <td className="page-name-cell"><div className="skeleton-text medium"></div></td>
                            <td className="route-cell"><div className="skeleton-text medium"></div></td>
                            <td className="description-cell"><div className="skeleton-text long"></div></td>
                            <td className="access-status-cell"><div className="skeleton-text short"></div></td>
                          </tr>
                        ))
                      ) : paginatedPages && paginatedPages.length > 0 ? (
                        paginatedPages.map((page, index) => (
                          <tr key={page.page} className="theater-row">
                            <td className="sno-cell">
                              <div className="sno-number">{((currentPage - 1) * itemsPerPage) + index + 1}</div>
                            </td>
                            <td className="page-name-cell">
                              <div className="page-name">
                                {page.pageName}
                              </div>
                            </td>
                            <td className="route-cell">
                              <code className="route-code">
                                {page.route}
                              </code>
                            </td>
                            <td className="description-cell">
                              <div className="page-description">
                                {page.description}
                              </div>
                            </td>
                            <td className="access-status-cell">
                              <div className="toggle-wrapper">
                                <label
                                  className="switch"
                                  style={{
                                    position: 'relative',
                                    display: 'inline-block',
                                    width: '50px',
                                    height: '24px',
                                    opacity: togglingPageKey === page.page ? 0.6 : 1,
                                    pointerEvents: togglingPageKey === page.page ? 'none' : 'auto'
                                  }}
                                  onClick={(e) => {
                                    // Prevent row click from triggering
                                    e.stopPropagation();
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={pageToggleStates[page.page] || false}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      if (togglingPageKey !== page.page) {
                                        handlePageToggleChange(page, e.target.checked);
                                      } else {
                                        console.warn('⚠️ [Toggle onChange] Blocked - already toggling');
                                      }
                                    }}
                                    onClick={(e) => {
                                      // Prevent row click from triggering
                                      e.stopPropagation();
                                    }}
                                    disabled={togglingPageKey === page.page}
                                    style={{
                                      opacity: 0,
                                      width: 0,
                                      height: 0
                                    }}
                                  />
                                  <span
                                    className="slider"
                                    style={{
                                      position: 'absolute',
                                      cursor: togglingPageKey === page.page ? 'wait' : 'pointer',
                                      top: 0,
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      backgroundColor: (pageToggleStates[page.page] || false) ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                                      transition: '.4s',
                                      borderRadius: '24px'
                                    }}
                                  >
                                    <span style={{
                                      position: 'absolute',
                                      content: '""',
                                      height: '18px',
                                      width: '18px',
                                      left: (pageToggleStates[page.page] || false) ? '26px' : '3px',
                                      bottom: '3px',
                                      backgroundColor: 'white',
                                      transition: '.4s',
                                      borderRadius: '50%',
                                      display: 'block'
                                    }}></span>
                                  </span>
                                </label>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="no-data">
                            <div className="empty-state">
                              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                              <p>No roles found</p>
                              <button
                                className="btn-primary"
                                onClick={() => setShowCreateModal(true)}
                              >
                                CREATE YOUR FIRST ROLE
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination - Global Component */}
              {!loading && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  itemType="pages"
                />
              )}
            </div> {/* End theater-content */}
          </PageContainer>
        </div> {/* End role-access-details-page */}

        {/* Modal components (identical structure to Role Access Management) */}

        {/* Create Modal - Following Global Design System */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-nav-left">
                </div>

                <div className="modal-title-section">
                  <h2>Create Page Access</h2>
                </div>

                <div className="modal-nav-right">
                  <button
                    className="close-btn"
                    onClick={() => setShowCreateModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      value={formData.roleId}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="form-control"
                      required
                    >
                      <option value="">Select Role</option>
                      {activeRoles.map(role => (
                        <option key={role._id} value={role._id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Frontend Pages</label>
                    <div className="permissions-grid">
                      {formData.pages.map((page, index) => (
                        <div key={page.page} className={`permission-item ${page.hasAccess ? 'permission-item-active' : ''}`}>
                          <label className="permission-item-label">
                            <input
                              type="checkbox"
                              checked={page.hasAccess}
                              onChange={(e) => handlePageToggle(page.page, e.target.checked)}
                              className="permission-item-checkbox"
                            />
                            <div>
                              <div className="permission-item-name">{page.pageName}</div>
                              <div className="permission-item-route">{page.route}</div>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Footer with Cancel and Submit Buttons */}
              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSubmitPageAccess}
                  disabled={!formData.roleId}
                >
                  Create Page Access
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal - Following Global Design System */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-nav-left">
                </div>

                <div className="modal-title-section">
                  <h2>Delete Page Access</h2>
                </div>

                <div className="modal-nav-right">
                  <button
                    className="close-btn"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="modal-body">
                <div className="edit-form">
                  <p>Are you sure you want to delete page access for <strong>{selectedPageAccess?.pageName}</strong>?</p>
                  <p className="error-text">
                    This action will remove access to this page for the assigned role and cannot be undone.
                  </p>
                </div>
              </div>

              {/* Fixed Footer with Cancel and Delete Buttons */}
              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="delete-btn"
                  onClick={handleDeletePageAccess}
                >
                  Delete Page Access
                </button>
              </div>
            </div>
          </div>
        )}

      </AdminLayout>

      {/* Custom CSS for modal width - matches TheaterList */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .modal-content {
            max-width: 900px !important;
            width: 85% !important;
          }

          @media (max-width: 768px) {
            .modal-content {
              width: 95% !important;
              max-width: none !important;
            }
          }
        `
      }} />
    </ErrorBoundary>
  );
};

export default PageAccessManagement;
