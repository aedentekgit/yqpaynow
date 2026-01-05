import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import config from '../config';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import Pagination from '../components/Pagination';
import { useModal } from '../contexts/ModalContext';
import { clearTheaterCache, addCacheBuster } from '../utils/cacheManager';
import { clearCachePattern } from '../utils/cacheUtils';
import { usePerformanceMonitoring, preventLayoutShift } from '../hooks/usePerformanceMonitoring';
import { optimizedFetch } from '../utils/apiOptimizer';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/QRManagementPage.css';
import '../styles/TheaterList.css';
import '../styles/pages/RoleCreate.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



// Enhanced Lazy Loading Image Component with Intersection Observer (matching TheaterList)
const LazyTheaterImage = React.memo(({ src, alt, className, style }) => {
  const [imageSrc, setImageSrc] = useState('/placeholder-theater.png');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && src && src !== '/placeholder-theater.png') {
          const img = new Image();
          img.onload = () => {
            setImageSrc(src);
            setIsLoading(false);
            setHasError(false);
          };
          img.onerror = () => {
            setHasError(true);
            setIsLoading(false);
          };
          img.src = src;
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  return (
    <div className="lazy-theater-container" style={style}>
      {src ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`${className} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
          style={style}
        />
      ) : (
        <div className="no-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
          </svg>
        </div>
      )}
      {isLoading && (
        <div className="image-loading-placeholder">
          <div className="image-skeleton"></div>
        </div>
      )}
    </div>
  );
});

LazyTheaterImage.displayName = 'LazyTheaterImage';

// Skeleton component for table rows (matching TheaterList pattern)
const TableRowSkeleton = React.memo(() => (
  <tr className="skeleton-row">
    <td><div className="skeleton-text"></div></td>
    <td>
      <div className="theater-info-skeleton">
        <div className="skeleton-image"></div>
        <div className="skeleton-text"></div>
      </div>
    </td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
  </tr>
));

TableRowSkeleton.displayName = 'TableRowSkeleton';

const RoleCreate = () => {
  const navigate = useNavigate();
  const { theaterId: pathTheaterId } = useParams(); // Get from path (/roles/:theaterId)
  const [searchParams] = useSearchParams(); // Get from query string (?theaterId=xxx)
  
  // FIXED: Support both path parameter and query parameter for theaterId
  // Priority: query parameter > path parameter
  const theaterId = searchParams.get('theaterId') || pathTheaterId;
  
  
  const { showError, showSuccess } = useModal();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('RoleManagement');
  
  // Theater state
  const [theater, setTheater] = useState(null);
  const [theaterLoading, setTheaterLoading] = useState(true);
  
  // Data state
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({
    activeRoles: 0,
    inactiveRoles: 0,
    totalRoles: 0
  });
  
  // Pagination state (matching TheaterList)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pagination, setPagination] = useState({});
  
  // Filter state with debounced search
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Toggle state to prevent double clicks (like TheaterList)
  const [togglingRoleId, setTogglingRoleId] = useState(null);
  
  // Performance refs (matching TheaterList)
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  // ✅ Prevent modal from reopening after successful creation (using ref for immediate access)
  const preventModalReopenRef = useRef(false);
  const [preventModalReopen, setPreventModalReopen] = useState(false);
  // ✅ Prevent data reload during toggle operations
  const isTogglingRef = useRef(false);
  // ✅ Prevent data reload during delete operations
  const isDeletingRef = useRef(false);

  // Debounced search effect (matching TheaterList)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when searching
    }, 500); // PERFORMANCE: 500ms debounce to reduce API calls

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Load theater data when theaterId is present
  useEffect(() => {
    if (theaterId) {
      loadTheaterData();
    } else {
      setTheaterLoading(false);
    }
  }, [theaterId]);

  // Load role data with pagination and search
  // 🔄 FORCE REFRESH: Always force refresh on component mount to ensure fresh data
  useEffect(() => {
    // ✅ Don't reload if we're in the middle of a toggle or delete operation
    if (isTogglingRef.current || isDeletingRef.current) {
      return;
    }
    loadRoleData(true);
  }, [currentPage, debouncedSearchTerm, itemsPerPage, theaterId, filterStatus]);

  // ✅ Ensure modal stays closed when preventModalReopen flag is set
  useEffect(() => {
    if (preventModalReopen || preventModalReopenRef.current) {
      setShowCreateModal(false);
    }
  }, [preventModalReopen]);

  const loadTheaterData = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      setTheaterLoading(true);

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        },
        `theater_${theaterId}`,
        120000 // 2-minute cache
      );
      

      if (!result) {
        throw new Error('Failed to fetch theater data');
      }

      if (result.success) {
        // Backend returns theater data under 'theater' key, not 'data'
        const theaterData = result.theater || result.data;

        setTheater(theaterData);
      } else {
        throw new Error(result.message || 'Failed to load theater');
      }
    } catch (error) {

      setError('Failed to load theater details');
    } finally {
      setTheaterLoading(false);
    }
  }, [theaterId]);

  // Toggle role active status with optimistic UI (like TheaterList)
  const toggleRoleStatus = async (roleId, currentStatus) => {
    const newStatus = !currentStatus;
    
    // Prevent multiple clicks on the same role
    if (togglingRoleId === roleId || isTogglingRef.current) return;
    
    try {
      // ✅ Set flag to prevent data reload during toggle
      isTogglingRef.current = true;
      
      // Set loading state for this specific role
      setTogglingRoleId(roleId);
      
      // 🚀 INSTANT UI UPDATE: Update local state immediately for instant feedback
      // Use functional update to ensure we get the latest state
      setRoles(prevRoles => {
        const updatedRoles = prevRoles.map(role => 
          role._id === roleId 
            ? { ...role, isActive: newStatus }
            : role
        );
        return updatedRoles;
      });

      // Also update summary counts immediately for better UX
      setSummary(prev => ({
        ...prev,
        activeRoles: newStatus ? prev.activeRoles + 1 : prev.activeRoles - 1,
        inactiveRoles: newStatus ? prev.inactiveRoles - 1 : prev.inactiveRoles + 1
      }));

      // Now make the API call in the background
      try {
        const response = await unifiedFetch(`${config.api.baseUrl}/roles/${roleId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify({ isActive: newStatus })
        }, {
          forceRefresh: true, // Don't cache PUT requests
          cacheTTL: 0
        });

        if (!response.ok) {
          // If role not found (404) or bad request (400), revert optimistic update
          if (response.status === 404 || response.status === 400) {
            // Revert optimistic update
            setRoles(prevRoles =>
              prevRoles.map(role =>
                role._id === roleId ? { ...role, isActive: !newStatus } : role
              )
            );
            setSummary(prev => ({
              ...prev,
              activeRoles: newStatus ? prev.activeRoles - 1 : prev.activeRoles + 1,
              inactiveRoles: newStatus ? prev.inactiveRoles + 1 : prev.inactiveRoles - 1
            }));
            return;
          }
          throw new Error('Failed to update role status');
        }
      } catch (error) {
        // If role not found or invalid, revert optimistic update
        if (error.message?.includes('404') || error.message?.includes('not found') || 
            error.message?.includes('400') || error.message?.includes('Invalid')) {
          // Revert optimistic update
          setRoles(prevRoles =>
            prevRoles.map(role =>
              role._id === roleId ? { ...role, isActive: !newStatus } : role
            )
          );
          setSummary(prev => ({
            ...prev,
            activeRoles: newStatus ? prev.activeRoles - 1 : prev.activeRoles + 1,
            inactiveRoles: newStatus ? prev.inactiveRoles + 1 : prev.inactiveRoles - 1
          }));
          return;
        }
        // For other errors, revert and show error
        console.error('Error updating role status:', error);
        // Revert optimistic update
        setRoles(prevRoles =>
          prevRoles.map(role =>
            role._id === roleId ? { ...role, isActive: !newStatus } : role
          )
        );
        setSummary(prev => ({
          ...prev,
          activeRoles: newStatus ? prev.activeRoles - 1 : prev.activeRoles + 1,
          inactiveRoles: newStatus ? prev.inactiveRoles + 1 : prev.inactiveRoles - 1
        }));
        if (showError) {
          showError('Failed to update role status. Please try again.');
        }
      }

      // If request was successful, the optimistic update already happened, so the UI is already updated
      
      // ✅ CLEAR CACHE: Clear all roles-related cache to ensure fresh data
      clearCachePattern('roles_');
      if (theaterId) {
        clearCachePattern(`theater_${theaterId}`);
      }
      
      // Optional: Show success message
      if (showSuccess) {
        showSuccess(`Role ${newStatus ? 'activated' : 'deactivated'} successfully`);
      }
      
      // ✅ No need to reload data - optimistic update is already in place
      // The UI is already updated from the optimistic update above

    } catch (error) {
      console.error('❌ Failed to toggle role status:', error);
      
      // 🔄 ROLLBACK: Revert the optimistic update if API fails
      setRoles(prevRoles => 
        prevRoles.map(role => 
          role._id === roleId 
            ? { ...role, isActive: currentStatus } // Revert to original status
            : role
        )
      );

      // Revert summary counts as well
      setSummary(prev => ({
        ...prev,
        activeRoles: currentStatus ? prev.activeRoles + 1 : prev.activeRoles - 1,
        inactiveRoles: currentStatus ? prev.inactiveRoles - 1 : prev.inactiveRoles + 1
      }));

      // Show error message
      showError(`Failed to update role status: ${error.message}`);
    } finally {
      // Clear loading state
      setTogglingRoleId(null);
      // Clear the toggle flag after a delay to allow UI to update and prevent race conditions
      setTimeout(() => {
        isTogglingRef.current = false;
      }, 500); // Increased delay to ensure UI has time to render
    }
  };

  const loadRoleData = useCallback(async (forceRefresh = false) => {
    try {
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      setError('');
      
      // Build query parameters with pagination
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });
      
      // Add theater filter if theaterId is present
      if (theaterId) {
        params.append('theaterId', theaterId);
      }
      
      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }

      // Add status filter
      if (filterStatus && filterStatus !== 'all') {
        params.append('isActive', filterStatus === 'active' ? 'true' : 'false');
      }
      
      // 🔄 FORCE REFRESH: Add cache-busting timestamp when forceRefresh is true
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }
      
      // 🔄 FORCE REFRESH: Add no-cache headers when forceRefresh is true
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Accept': 'application/json'
      };
      
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // �🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `roles_theater_${theaterId}_page_${currentPage}_limit_${itemsPerPage}_status_${filterStatus}_search_${debouncedSearchTerm || 'none'}`;
      const data = await optimizedFetch(
        `${config.api.baseUrl}/roles?${params.toString()}`,
        {
          signal: abortControllerRef.current.signal,
          headers
        },
        forceRefresh ? null : cacheKey, // 🔄 FORCE REFRESH: Skip cache key when forceRefresh is true
        120000 // 2-minute cache
      );
      
      if (!data) {
        throw new Error('Failed to fetch role data');
      }
      
      if (data.success) {
        // ✅ Don't overwrite state if we're in the middle of a toggle or delete operation
        if (isTogglingRef.current || isDeletingRef.current) {
          return;
        }
        
        // PERFORMANCE OPTIMIZATION: Direct state update with sorting by ID
        const newData = data.data?.roles || [];
        
        // Sort roles by ID in ascending order
        const sortedRoles = newData.sort((a, b) => {
          // Convert IDs to strings for consistent comparison
          const idA = a._id ? a._id.toString() : '';
          const idB = b._id ? b._id.toString() : '';
          return idA.localeCompare(idB);
        });
        
        setRoles(sortedRoles);
        
        // PERFORMANCE OPTIMIZATION: Batch pagination state updates
        const paginationData = data.data?.pagination || {};
        setPagination(paginationData);
        setTotalPages(paginationData.totalPages || 0);
        setTotalItems(paginationData.totalItems || 0);
        
        // Calculate summary statistics
        const activeRoles = newData.filter(r => r.isActive).length;
        const inactiveRoles = newData.filter(r => !r.isActive).length;
        
        setSummary({
          activeRoles,
          inactiveRoles,
          totalRoles: newData.length
        });
      } else {
        setError('Failed to load QR management data');
      }
    } catch (error) {
      // Handle AbortError gracefully
      if (error.name === 'AbortError') {

        return;
      }

      setError('Failed to load QR management data');
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, itemsPerPage, theaterId, filterStatus]);

  // Pagination handlers (matching TheaterList)
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
  }, []);

  const handleItemsPerPageChange = useCallback((e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  const handleFilterChange = useCallback((e) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1); // Reset to first page when filtering
  }, []);

  // Cleanup effect for aborting requests (matching TheaterList)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const viewRole = (role) => {
    setSelectedRole(role);
    setShowViewModal(true);
  };

  const editRole = (role) => {
    setSelectedRole(role);
    setFormData({
      name: role.name || '',
      description: role.description || '',
      permissions: role.permissions || [],
      isActive: role.isActive
    });
    setShowEditModal(true);
  };

  const deleteRole = (role) => {
    setSelectedRole(role);
    setShowDeleteModal(true);
  };

  const handleSubmitRole = async (isEdit = false) => {
    try {
      const token = config.helpers.getAuthToken();
      if (!token) {
        showError('Authentication required. Please login again.');
        return;
      }
      
      // Validate required fields
      if (!formData.name || formData.name.trim() === '') {
        showError('Role name is required');
        return;
      }
      
      const url = isEdit 
        ? `${config.api.baseUrl}/roles/${selectedRole._id}` 
        : `${config.api.baseUrl}/roles`;
      const method = isEdit ? 'PUT' : 'POST';
      
      // Include theaterId in the form data when creating/editing roles
      const roleData = {
        ...formData,
        name: formData.name.trim(), // Trim whitespace
        ...(theaterId && { theaterId: theaterId }) // Add theaterId field for array-based structure
      };
      

      // 🚀 OPTIMISTIC UPDATE: Update UI immediately for instant feedback
      if (isEdit) {
        // Update existing role in the list
        const updatedRole = { ...selectedRole, ...roleData };
        setRoles(prevRoles => 
          prevRoles.map(role => 
            role._id === selectedRole._id 
              ? updatedRole
              : role
          )
        );
      } else {
        // Add new role optimistically with temporary ID
        const tempRole = {
          _id: `temp_${Date.now()}`, // Temporary ID for optimistic update
          ...roleData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setRoles(prevRoles => [tempRole, ...prevRoles]);
        
        // Update summary counts immediately
        setSummary(prev => ({
          ...prev,
          totalRoles: prev.totalRoles + 1,
          activeRoles: roleData.isActive ? prev.activeRoles + 1 : prev.activeRoles,
          inactiveRoles: roleData.isActive ? prev.inactiveRoles : prev.inactiveRoles + 1
        }));
      }

      // 🚀 CLOSE MODAL IMMEDIATELY for better UX
      if (isEdit) {
        setShowEditModal(false);
        setSelectedRole(null);
      } else {
        setShowCreateModal(false);
      }
      
      // Reset form data
      setFormData({
        name: '',
        description: '',
        permissions: [],
        isActive: true
      });

      // Show success message immediately
      const successMessage = isEdit 
        ? `Role "${roleData.name}" updated successfully` 
        : `Role "${roleData.name}" created successfully`;
      
      if (showSuccess) {
        showSuccess(successMessage);
      }

      // Now make the actual API call in the background
      // unifiedFetch throws errors for non-OK responses, so if we get here, it succeeded
      await unifiedFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(roleData)
      }, {
        forceRefresh: true, // Don't cache POST/PUT requests
        cacheTTL: 0
      });

      // If unifiedFetch didn't throw, the request was successful
      // Mark that a role was created/updated so RolesList can refresh when user navigates back
      sessionStorage.setItem('last_role_action', Date.now().toString());
      sessionStorage.setItem('roles_navigation_state', 'from_create_or_edit');
      
      // ✅ ENSURE MODAL STAYS CLOSED after successful creation/update
      if (isEdit) {
        setShowEditModal(false);
        setSelectedRole(null);
      } else {
        // ✅ Set flags FIRST (both ref and state) to prevent modal from reopening
        preventModalReopenRef.current = true;
        setPreventModalReopen(true);
        // ✅ Force close modal immediately and ensure it stays closed
        setShowCreateModal(false);
      }
      
      // ✅ CLEAR CACHE: Clear all roles-related cache to ensure fresh data
      clearCachePattern('roles_');
      if (theaterId) {
        clearCachePattern(`theater_${theaterId}`);
      }
      
      // 🔄 IMMEDIATE REFRESH: Refresh data immediately without delay
      // Use setTimeout to ensure prevent flags are set before any re-renders from loadRoleData
      setTimeout(() => {
        try {
          // ✅ Ensure modal is closed before refreshing
          setShowCreateModal(false);
          
          // Call loadRoleData and handle the promise
          const refreshPromise = loadRoleData(true);
          if (refreshPromise && typeof refreshPromise.then === 'function') {
            refreshPromise.then(() => {
              // ✅ Ensure modal stays closed after data refresh
              setShowCreateModal(false);
              // ✅ Clear the flags after refresh completes (allow modal to open normally after 2 seconds)
              setTimeout(() => {
                preventModalReopenRef.current = false;
                setPreventModalReopen(false);
              }, 2000);
            }).catch((error) => {
              console.error('Error refreshing role data:', error);
              // ✅ Ensure modal stays closed even on error
              setShowCreateModal(false);
              // Still clear the flags even if there's an error
              setTimeout(() => {
                preventModalReopenRef.current = false;
                setPreventModalReopen(false);
              }, 2000);
            });
          } else {
            // If loadRoleData doesn't return a promise, just clear flags after delay
            setTimeout(() => {
              preventModalReopenRef.current = false;
              setPreventModalReopen(false);
            }, 2000);
          }
        } catch (error) {
          console.error('Error in refresh logic:', error);
          // Ensure modal is closed and clear flags
          setShowCreateModal(false);
          setTimeout(() => {
            preventModalReopenRef.current = false;
            setPreventModalReopen(false);
          }, 2000);
        }
      }, 100);
    } catch (error) {
      console.error(`❌ Failed to ${isEdit ? 'update' : 'create'} role:`, error);
      console.error('Error details:', {
        message: error?.message,
        status: error?.status,
        error: error?.error,
        response: error?.response,
        toString: error?.toString?.(),
        fullError: error
      });
      
      // 🔄 ROLLBACK: Revert optimistic updates if API fails
      if (isEdit) {
        // Revert to original role data
        setRoles(prevRoles => 
          prevRoles.map(role => 
            role._id === selectedRole._id 
              ? selectedRole // Revert to original
              : role
          )
        );
      } else {
        // Remove the optimistically added role
        setRoles(prevRoles => 
          prevRoles.filter(role => !role._id.toString().startsWith('temp_'))
        );
        
        // Revert summary counts
        setSummary(prev => ({
          ...prev,
          totalRoles: Math.max(0, prev.totalRoles - 1),
          activeRoles: formData.isActive ? Math.max(0, prev.activeRoles - 1) : prev.activeRoles,
          inactiveRoles: formData.isActive ? prev.inactiveRoles : Math.max(0, prev.inactiveRoles - 1)
        }));
      }
      
      // Extract meaningful error message
      let errorMessage = 'Failed to save role';
      if (error) {
        if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.toString && error.toString() !== '[object Object]') {
          errorMessage = error.toString();
        } else if (error.error) {
          errorMessage = error.error;
        } else if (error.response) {
          // Try to extract from response object
          try {
            const responseData = error.response;
            errorMessage = responseData.message || responseData.error || responseData.statusText || errorMessage;
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
      
      // Show error message
      if (showError) {
        showError(`Failed to ${isEdit ? 'update' : 'create'} role: ${errorMessage}`);
      }
      
      // Reopen modal for user to retry
      if (isEdit) {
        setShowEditModal(true);
        setSelectedRole(selectedRole);
      } else {
        setShowCreateModal(true);
      }
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) return;
    
    try {
      const token = config.helpers.getAuthToken();
      if (!token) {
        showError('Authentication required. Please login again.');
        return;
      }
      
      // ✅ Set flag to prevent data reload during delete
      isDeletingRef.current = true;
      
      // 🚀 OPTIMISTIC UPDATE: Remove from UI immediately
      const deletedRole = selectedRole;
      const deletedRoleId = deletedRole._id;
      
      setRoles(prevRoles => 
        prevRoles.filter(role => role._id !== deletedRoleId)
      );
      
      // Update summary counts immediately
      setSummary(prev => ({
        ...prev,
        totalRoles: Math.max(0, prev.totalRoles - 1),
        activeRoles: deletedRole.isActive ? Math.max(0, prev.activeRoles - 1) : prev.activeRoles,
        inactiveRoles: deletedRole.isActive ? prev.inactiveRoles : Math.max(0, prev.inactiveRoles - 1)
      }));
      
      // Close modal and clear selection immediately
      setShowDeleteModal(false);
      setSelectedRole(null);
      
      // Show success message immediately
      if (showSuccess) {
        showSuccess(`Role "${deletedRole.name}" deleted successfully`);
      }
      
      // Make API call in background
      // unifiedFetch throws errors for non-OK responses, so if we get here, it succeeded
      try {
        const response = await unifiedFetch(`${config.api.baseUrl}/roles/${deletedRoleId}?permanent=true`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          forceRefresh: true, // Don't cache DELETE requests
          cacheTTL: 0
        });

        // Check if response is OK
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // If role not found (404) or bad request (400), it's already deleted - that's fine
          if (response.status === 404 || response.status === 400) {
            // Role is already gone, optimistic update was correct
            return;
          }
          throw new Error(errorData.error || errorData.message || 'Failed to delete role');
        }
      } catch (error) {
        // If role not found or already deleted, that's fine - optimistic update was correct
        if (error.message?.includes('404') || error.message?.includes('not found') || 
            error.message?.includes('400') || error.message?.includes('Invalid')) {
          // Role is already gone, optimistic update was correct - don't show error
          return;
        }
        // For other errors, revert the optimistic update
        console.error('Error deleting role:', error);
        // Revert optimistic update
        setRoles(prevRoles => [...prevRoles, deletedRole]);
        setSummary(prev => ({
          ...prev,
          totalRoles: prev.totalRoles + 1,
          activeRoles: deletedRole.isActive ? prev.activeRoles + 1 : prev.activeRoles,
          inactiveRoles: deletedRole.isActive ? prev.inactiveRoles : prev.inactiveRoles - 1
        }));
        setSelectedRole(deletedRole);
        setShowDeleteModal(true);
        if (showError) {
          showError(error.message || 'Failed to delete role. Please try again.');
        }
        return;
      }

      // If unifiedFetch didn't throw, the request was successful
      // The optimistic update already removed the item from the UI
      
      // ✅ CLEAR CACHE: Clear all roles-related cache to ensure fresh data
      clearCachePattern('roles_');
      if (theaterId) {
        clearCachePattern(`theater_${theaterId}`);
      }
      
      // 🔄 REFRESH: Refresh data in background after a delay to ensure server has processed the delete
      // Use a longer delay to ensure the server has fully processed the deletion
      setTimeout(() => {
        // Filter out the deleted role when refreshing to ensure it doesn't reappear
        loadRoleData(true).then(() => {
          // Ensure the deleted role is still filtered out after refresh
          setRoles(prevRoles => 
            prevRoles.filter(role => role._id !== deletedRoleId)
          );
        }).catch(loadError => {
          console.warn('⚠️ Failed to reload data after delete:', loadError);
        }).finally(() => {
          // Clear the delete flag after refresh completes
          setTimeout(() => {
            isDeletingRef.current = false;
          }, 500);
        });
      }, 300);
    } catch (error) {
      console.error('❌ Failed to delete role:', error);
      
      // 🔄 ROLLBACK: Restore the deleted role if API fails
      if (deletedRole) {
        setRoles(prevRoles => {
          // Check if role is already in the list (shouldn't be, but just in case)
          const exists = prevRoles.some(role => role._id === deletedRoleId);
          if (!exists) {
            return [deletedRole, ...prevRoles];
          }
          return prevRoles;
        });
        
        // Restore summary counts
        setSummary(prev => ({
          ...prev,
          totalRoles: prev.totalRoles + 1,
          activeRoles: deletedRole.isActive ? prev.activeRoles + 1 : prev.activeRoles,
          inactiveRoles: deletedRole.isActive ? prev.inactiveRoles : prev.inactiveRoles + 1
        }));
      }
      
      // Show error message
      if (showError) {
        showError(`Failed to delete role: ${error.message}`);
      }
    } finally {
      // Clear the delete flag after a delay
      setTimeout(() => {
        isDeletingRef.current = false;
      }, 500);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [],
    isActive: true
  });

  const handleCreateNewRole = () => {
    // ✅ Prevent opening modal if we just successfully created a role (check both ref and state)
    if (preventModalReopenRef.current || preventModalReopen) {
      return;
    }
    setFormData({
      name: '',
      description: '',
      permissions: [],
      isActive: true
    });
    setShowCreateModal(true);
  };

  const headerButton = (
    <button 
      className="header-btn"
      onClick={handleCreateNewRole}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </span>
      CREATE NEW ROLE
    </button>
  );

  return (
    <ErrorBoundary>
      <AdminLayout 
        pageTitle={theaterId ? `${theater?.name || 'Theater'}` : "Role Management"} 
        currentPage="roles"
      >
        <div className="role-create-details-page qr-management-page">
        <PageContainer
          hasHeader={false}
          className="role-create-vertical"
        >
          {/* Global Vertical Header Component */}
          <VerticalPageHeader
            title={theaterLoading ? 'Loading Theater...' : (theater?.name || 'Theater Name Not Available')}
            backButtonText="Back to Theater List"
            backButtonPath="/roles"
            actionButton={headerButton}
          />
        {/* Stats Section */}
        <div className="qr-stats">
          <div className="stat-card">
            <div className="stat-number">{summary.activeRoles || 0}</div>
            <div className="stat-label">Active Roles</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.inactiveRoles || 0}</div>
            <div className="stat-label">Inactive Roles</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.totalRoles || 0}</div>
            <div className="stat-label">Total Roles</div>
          </div>
        </div>

        {/* Enhanced Filters Section matching TheaterList */}
        <div className="theater-filters">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search roles by name, level, or permissions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-controls">
            <select
              value={filterStatus}
              onChange={handleFilterChange}
              className="status-filter"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <div className="results-count">
              Showing {roles.length} of {totalItems} roles (Page {currentPage} of {totalPages})
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

        {/* Management Table */}
        <div className="page-table-container">
          {/* {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={() => loadRoleData()} className="retry-btn">
                Try Again
              </button>
            </div>
          )} */}
          <table className="qr-management-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Icon</th>
                <th>Role Name</th>
                <th>Status</th>
                <th>Access Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <TableRowSkeleton key={`skeleton-${index}`} />
                ))
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-data">
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                      <p>No roles found</p>
                      <button 
                        className="btn-primary" 
                        onClick={() => navigate('/role-create')}
                      >
                        CREATE YOUR FIRST ROLE
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                roles
                  .filter(role => role && role._id && role.name) // ✅ Safety check for valid roles
                  .map((role, index) => (
                  <tr key={`${role._id}-${role.isActive}`} className="theater-row">
                    <td className="serial-number">{((currentPage - 1) * itemsPerPage) + index + 1}</td>
                    <td className="theater-logo-cell">
                      <div className="role-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                          <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 4V6L19 8V9H21ZM15 10C16.1 10 17 10.9 17 12S16.1 14 15 14 13 13.1 13 12 13.9 10 15 10ZM5 16C6.1 16 7 16.9 7 18S6.1 20 5 20 3 19.1 3 18 3.9 16 5 16ZM12 7C8.14 7 5 8.79 5 11V12H10V14H5V22H7V19H10V22H12V14H9V12H15V11C15 8.79 11.86 7 12 7Z"/>
                        </svg>
                      </div>
                    </td>
                    <td className="role-name-cell">
                      <div className="role-name-container">
                        <div className="role-name">{role.name || 'No Name'}</div>
                        {role.isDefault && (
                          <span className="default-badge" title="This is a default role with limited editing">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xs">
                              <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z"/>
                            </svg>
                            DEFAULT
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="status-cell">
                      <span className={`status-badge ${role.isActive ? 'active' : 'inactive'}`}>
                        {role.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="access-status-cell">
                      <div className="toggle-wrapper">
                        <label className="switch" style={{
                          position: 'relative',
                          display: 'inline-block',
                          width: '50px',
                          height: '24px',
                          opacity: togglingRoleId === role._id ? 0.6 : 1,
                          pointerEvents: togglingRoleId === role._id ? 'none' : 'auto'
                        }}>
                          <input
                            type="checkbox"
                            checked={role.isActive === true}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleRoleStatus(role._id, role.isActive);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            disabled={togglingRoleId === role._id}
                            style={{
                              opacity: 0,
                              width: 0,
                              height: 0
                            }}
                          />
                          <span className="slider" style={{
                            position: 'absolute',
                            cursor: togglingRoleId === role._id ? 'wait' : 'pointer',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: (role.isActive === true) ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                            transition: '.4s',
                            borderRadius: '24px'
                          }}>
                            <span style={{
                              position: 'absolute',
                              content: '""',
                              height: '18px',
                              width: '18px',
                              left: (role.isActive === true) ? '26px' : '3px',
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
                    <td className="actions">
                      <div className="action-buttons">
                        <button
                          className="action-btn view-btn"
                          onClick={() => viewRole(role)}
                          title="View Role Details"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                          </svg>
                        </button>
                        <button
                          className="action-btn edit-btn"
                          onClick={() => editRole(role)}
                          title={role.isDefault ? "Default roles cannot be edited - use Role Access to modify permissions" : "Edit Role"}
                          disabled={!role.isActive || role.isDefault}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                          </svg>
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => deleteRole(role)}
                          title={role.isDefault ? "Default roles cannot be deleted" : "Delete Role"}
                          disabled={role.isDefault}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination - Global Component */}
        {!loading && (
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            itemType="roles"
          />
        )}

        <div className="management-footer">
          <p>
            {debouncedSearchTerm ? (
              `Showing ${totalItems} of ${summary.totalRoles} roles matching "${debouncedSearchTerm}"`
            ) : (
              `Total: ${summary.totalRoles} roles (${summary.activeRoles} active, ${summary.inactiveRoles} inactive)`
            )}
          </p>
        </div>

        {/* Create Role Modal */}
        {showCreateModal && !preventModalReopen && !preventModalReopenRef.current && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content role-create-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-nav-left">
                </div>
                
                <div className="modal-title-section">
                  <h2>Create New Role</h2>
                </div>
                
                <div className="modal-nav-right">
                  <button 
                    className="close-btn"
                    onClick={() => setShowCreateModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Role Name</label>
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="form-control"
                      placeholder="Enter role name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={formData.isActive ? 'Active' : 'Inactive'} 
                      onChange={(e) => handleInputChange('isActive', e.target.value === 'Active')}
                      className="form-control"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={formData.description || ''} 
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="form-control"
                      placeholder="Enter role description (optional)"
                      rows="3"
                    ></textarea>
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
                  onClick={() => handleSubmitRole(false)}
                >
                  Create Role
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Role Modal */}
        {showEditModal && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content role-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-nav-left">
                </div>
                
                <div className="modal-title-section">
                  <h2>Edit Role</h2>
                </div>
                
                <div className="modal-nav-right">
                  <button 
                    className="close-btn"
                    onClick={() => setShowEditModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Role Name</label>
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="form-control"
                      placeholder="Enter role name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={formData.isActive ? 'Active' : 'Inactive'} 
                      onChange={(e) => handleInputChange('isActive', e.target.value === 'Active')}
                      className="form-control"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={formData.description || ''} 
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="form-control"
                      placeholder="Enter role description (optional)"
                      rows="3"
                    ></textarea>
                  </div>
                </div>
              </div>
              
              {/* Fixed Footer with Cancel and Submit Buttons */}
              <div className="modal-actions">
                <button 
                  className="cancel-btn" 
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => handleSubmitRole(true)}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Role Modal */}
        {showViewModal && (
          <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
            <div className="modal-content role-view-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-nav-left">
                </div>
                
                <div className="modal-title-section">
                  <h2>Role Details</h2>
                </div>
                
                <div className="modal-nav-right">
                  <button 
                    className="close-btn"
                    onClick={() => setShowViewModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Role Name</label>
                    <input 
                      type="text" 
                      value={selectedRole?.name || ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={selectedRole?.isActive ? 'Active' : 'Inactive'} 
                      className="form-control"
                      disabled
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={selectedRole?.description || 'No description provided'} 
                      className="form-control"
                      rows="3"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Created Date</label>
                    <input 
                      type="text" 
                      value={selectedRole?.createdAt ? new Date(selectedRole.createdAt).toLocaleDateString() : 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                </div>
              </div>
              
              {/* Footer with Close and Edit Buttons */}
              <div className="modal-actions">
                <button 
                  className="cancel-btn" 
                  onClick={() => setShowViewModal(false)}
                >
                  Close
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    setShowViewModal(false);
                    editRole(selectedRole);
                  }}
                >
                  Edit Role
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Role Modal */}
        {showDeleteModal && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header">
                <h3>Confirm Deletion</h3>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete the role <strong>{selectedRole?.name}</strong>?</p>
                <p className="warning-text">This action cannot be undone.</p>
              </div>
              <div className="modal-actions">
                <button 
                  onClick={() => setShowDeleteModal(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteRole}
                  className="confirm-delete-btn"
                >
                  Delete Role
                </button>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
        </div>

    {/* Custom CSS for RoleCreate modals only */}
    <style dangerouslySetInnerHTML={{
      __html: `
        .role-view-modal-content,
        .role-edit-modal-content,
        .role-create-modal-content {
          max-width: 900px !important;
          width: 85% !important;
        }

        @media (max-width: 768px) {
          .role-view-modal-content,
          .role-edit-modal-content,
          .role-create-modal-content {
            width: 95% !important;
            max-width: none !important;
          }
        }
      `
    }} />
    </AdminLayout>
  </ErrorBoundary>
  );
};

export default RoleCreate;
