
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import VerticalPageHeader from '@components/VerticalPageHeader';
import Pagination from '@components/Pagination';
import ErrorBoundary from '@components/ErrorBoundary';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import config from '@config';
import apiService from '@services/apiService';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/pages/theater/TheaterRoles.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { clearCachePattern } from '@utils/cacheUtils';



const TheaterRoles = () => {
  const navigate = useNavigate();
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal()
  const toast = useToast();;

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterRoles');
  
  // Data state
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    activeRoles: 0,
    inactiveRoles: 0,
    totalRoles: 0
  });

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Theater data
  const [theater, setTheater] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Modal states  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true
  });

  // Refs for cleanup and performance
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  
  // Ensure mounted ref is set on component mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Load theater data
  useEffect(() => {
    if (theaterId) {
      loadTheaterData();
    }
  }, [theaterId]);

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {

      return;
    }
  }, [theaterId, userTheaterId, userType]);

  // Load theater data
  const loadTheaterData = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `theater_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch theater data: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        const theaterData = result.theater || result.data;
        setTheater(theaterData);
      }
    } catch (error) {
  }
  }, [theaterId]);

  // Load roles data - ✅ FIX: Removed caching to always show current values
  const loadRolesData = useCallback(async (page = 1, limit = 10, search = '', forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) {
      return;
    }

    try {
      setLoading(true);

      // ✅ FIX: Clear cache patterns before fetching
      if (forceRefresh) {
        clearCachePattern('roles');
        clearCachePattern(`roles_${theaterId}`);
      }

      // Build query parameters with cache-busting timestamp
      const params = new URLSearchParams({
        theaterId: theaterId,
        page: page.toString(),
        limit: limit.toString(),
        search: search || '',
        _t: Date.now().toString() // Always add timestamp to bust cache
      });

      // Add status filter
      if (filterStatus && filterStatus !== 'all') {
        params.append('isActive', filterStatus === 'active' ? 'true' : 'false');
      }

      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const baseUrl = `${config.api.baseUrl}/roles?${params.toString()}`;
      
      // ✅ FIX: Use direct fetch with no-cache headers (no unifiedFetch caching)
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: headers
      });

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json().catch(() => ({}));
      
      // ✅ FIX: Handle various response structures
      // Response might be: { success: true, data: { items: [], pagination: {} } }
      // Or: { success: true, items: [], pagination: {} }
      // Or: { items: [], pagination: {} }
      let rolesArray = [];
      let paginationData = null;

      if (data.success && data.data) {
        // MVC format: { success: true, data: { items: [], pagination: {} } }
        rolesArray = data.data.items || data.data.roles || data.data || [];
        paginationData = data.data.pagination || data.pagination;
      } else if (data.items) {
        // Direct format: { items: [], pagination: {} }
        rolesArray = data.items;
        paginationData = data.pagination;
      } else if (data.roles) {
        // Alternative format: { roles: [], pagination: {} }
        rolesArray = data.roles;
        paginationData = data.pagination;
      } else if (Array.isArray(data)) {
        // Array format: []
        rolesArray = data;
      } else if (data.data && Array.isArray(data.data)) {
        // Nested array: { data: [] }
        rolesArray = data.data;
      }

      if (!isMountedRef.current) return;

      if (rolesArray && rolesArray.length >= 0) {
        // Sort roles by ID in ascending order
        const sortedRoles = rolesArray.sort((a, b) => {
          const idA = a._id ? a._id.toString() : '';
          const idB = b._id ? b._id.toString() : '';
          return idA.localeCompare(idB);
        });
        
        setRoles(sortedRoles);
        
        // Set pagination data
        if (paginationData) {
          setTotalItems(paginationData.totalItems || sortedRoles.length);
          setTotalPages(paginationData.totalPages || 1);
        } else {
          // Calculate pagination if not provided
          setTotalItems(sortedRoles.length);
          setTotalPages(Math.max(1, Math.ceil(sortedRoles.length / limit)));
        }
        
        // Calculate summary
        const activeCount = sortedRoles.filter(r => r.isActive).length;
        const inactiveCount = sortedRoles.filter(r => !r.isActive).length;
        
        setSummary({
          activeRoles: activeCount,
          inactiveRoles: inactiveCount,
          totalRoles: sortedRoles.length
        });
      } else {
        // No data returned
        setRoles([]);
        setTotalItems(0);
        setTotalPages(1);
        setSummary({ activeRoles: 0, inactiveRoles: 0, totalRoles: 0 });
      }
      
    } catch (error) {
      if (!isMountedRef.current) return;
      
      console.error('❌ [TheaterRoles] Error loading roles:', error);
      // Show error message
      if (showError) {
        showError(error.message || 'Failed to load roles');
      }
      setRoles([]);
      setTotalItems(0);
      setTotalPages(1);
      setSummary({ activeRoles: 0, inactiveRoles: 0, totalRoles: 0 });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterId, filterStatus, showError]);

  // Initial load
  useEffect(() => {
    loadRolesData(currentPage, itemsPerPage, debouncedSearchTerm, true);
  }, [loadRolesData, currentPage, itemsPerPage, debouncedSearchTerm, filterStatus]);

  // Removed duplicate debounced search effect (already added above)

  // Handle search input
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle filter change
  const handleFilterChange = useCallback((e) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  }, []);

  // Handle page change
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Handle items per page change
  const handleItemsPerPageChange = (e) => {
    const newItemsPerPage = parseInt(e.target.value);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  // View role
  const viewRole = (role) => {
    setSelectedRole(role);
    setShowViewModal(true);
  };

  // Edit role
  const editRole = (role) => {
    if (role.isDefault && !role.canEdit) {
      alert('This is a default Theater Admin role and cannot be edited.');
      return;
    }
    setSelectedRole(role);
    setFormData({
      name: role.name || '',
      description: role.description || '',
      isActive: role.isActive !== undefined ? role.isActive : true
    });
    setShowEditModal(true);
  };

  // Delete role
  const deleteRole = (role) => {
    if (role.isDefault && !role.canDelete) {
      alert('This is a default Theater Admin role and cannot be deleted.');
      return;
    }
    setSelectedRole(role);
    setShowDeleteModal(true);
  };

  // Create new role
  const handleCreateNewRole = () => {
    setFormData({
      name: '',
      description: '',
      isActive: true
    });
    setSelectedRole(null);
    setShowCreateModal(true);
  };

  // Handle input change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Toggle state to prevent double clicks (like RoleCreate)
  const [togglingRoleId, setTogglingRoleId] = useState(null);

  // Toggle role status (Access Status toggle) - Updated to match RoleCreate.jsx
  const toggleRoleStatus = async (roleId, currentStatus) => {
    const newStatus = !currentStatus;
    
    // Prevent multiple clicks on the same role
    if (togglingRoleId === roleId) return;
    
    try {
      
      // Set loading state for this specific role
      setTogglingRoleId(roleId);
      
      // 🚀 INSTANT UI UPDATE: Update local state immediately for instant feedback
      setRoles(prevRoles => 
        prevRoles.map(role => 
          role._id === roleId 
            ? { ...role, isActive: newStatus }
            : role
        )
      );

      // Also update summary counts immediately for better UX
      setSummary(prev => ({
        ...prev,
        activeRoles: newStatus ? prev.activeRoles + 1 : prev.activeRoles - 1,
        inactiveRoles: newStatus ? prev.inactiveRoles - 1 : prev.inactiveRoles + 1
      }));

      // Now make the API call in the background
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // ✅ FIX: Clear cache before update
      clearCachePattern('roles');
      clearCachePattern(`roles_${theaterId}`);
      
      // ✅ FIX: Use direct fetch with no-cache headers
      const response = await fetch(`${config.api.baseUrl}/roles/${roleId}?_t=${Date.now()}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ isActive: newStatus })
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
          // Revert summary counts
          setSummary(prev => ({
            ...prev,
            activeRoles: newStatus ? prev.activeRoles - 1 : prev.activeRoles + 1,
            inactiveRoles: newStatus ? prev.inactiveRoles + 1 : prev.inactiveRoles - 1
          }));
          // Refresh data to get correct state
          loadRolesData(currentPage, itemsPerPage, searchTerm, true);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to update role status');
      }

      const result = await response.json();
      
      if (result.success) {
        // 🔄 FORCE REFRESH: Refresh data with cache bypass after toggle
        setTimeout(() => {
          loadRolesData(currentPage, itemsPerPage, debouncedSearchTerm, true);
        }, 500);
        
        // Optional: Show success message
        if (toast) {
          toast.success(`Role ${newStatus ? 'activated' : 'deactivated'} successfully`);
        }
      } else {
        throw new Error(result.message || 'Failed to update role status');
      }

    } catch (error) {
      // Handle network errors or other exceptions
      if (error.name === 'AbortError') {
        return; // Request was aborted, don't show error
      }
      
      // Check if error message indicates role not found or invalid
      const errorMessage = error.message || error.toString() || '';
      if (errorMessage.includes('404') || errorMessage.includes('not found') || 
          errorMessage.includes('400') || errorMessage.includes('Invalid')) {
        // Role might already be deleted, just refresh
        // Revert optimistic update
        setRoles(prevRoles => 
          prevRoles.map(role => 
            role._id === roleId 
              ? { ...role, isActive: currentStatus } // Revert to original status
              : role
          )
        );
        // Revert summary counts
        setSummary(prev => ({
          ...prev,
          activeRoles: currentStatus ? prev.activeRoles + 1 : prev.activeRoles - 1,
          inactiveRoles: currentStatus ? prev.inactiveRoles - 1 : prev.inactiveRoles + 1
        }));
        loadRolesData(currentPage, itemsPerPage, searchTerm, true);
        return;
      }
      
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
      if (showError) {
        showError(`Failed to update role status: ${error.message}`);
      }
    } finally {
      // Clear loading state
      setTogglingRoleId(null);
    }
  };

  // Submit role (Create or Update)
  const handleSubmitRole = async (isEdit) => {
    try {
      const url = isEdit 
        ? `${config.api.baseUrl}/roles/${selectedRole._id}`
        : `${config.api.baseUrl}/roles`;
      
      const method = isEdit ? 'PUT' : 'POST';
      
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      
      // ✅ FIX: Clear cache before create/update
      clearCachePattern('roles');
      clearCachePattern(`roles_${theaterId}`);
      
      // ✅ FIX: Use direct fetch with no-cache headers (no unifiedFetch caching)
      const response = await fetch(`${url}?_t=${Date.now()}`, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          ...formData,
          theaterId: theaterId
        })
      });
      
      // ✅ FIX: Parse response first to check success
      let result = {};
      let responseOk = false;
      let responseStatus = 0;
      let responseText = '';
      
      try {
        // unifiedFetch might return a response object or a cached object
        if (response && typeof response === 'object') {
          responseOk = response.ok !== undefined ? response.ok : true;
          responseStatus = response.status || 200;
          
          // Try to get response text/JSON
          if (typeof response.text === 'function') {
            responseText = await response.text();
            result = responseText ? JSON.parse(responseText) : {};
          } else if (typeof response.json === 'function') {
            result = await response.json();
          } else if (response.data) {
            // Might be a cached response
            result = response.data;
          }
        }
      } catch (parseError) {
        console.error('❌ [TheaterRoles] Failed to parse response:', parseError);
        // If we can't parse, assume success if status looks good
        responseOk = responseStatus >= 200 && responseStatus < 300;
      }

      // ✅ FIX: Check if request was successful (handle multiple response formats)
      const isSuccess = responseOk || (responseStatus >= 200 && responseStatus < 300) || (result && result.success);
      
      // ✅ DEBUG: Log response details
      console.log('🔍 [TheaterRoles] Submit response:', {
        responseOk,
        responseStatus,
        resultSuccess: result?.success,
        isSuccess,
        hasResult: !!result,
        result: result
      });

      // ✅ FIX: Close modal IMMEDIATELY if success (FIRST THING - before any other operations)
      // Check multiple conditions to ensure we close on success
      const shouldClose = isSuccess || (result && result.success === true) || (result && result.message && result.message.includes('successfully'));
      
      if (shouldClose) {
        
        // ✅ FIX: Close modal IMMEDIATELY (FIRST ACTION)
        if (isEdit) {
          setShowEditModal(false);
        } else {
          setShowCreateModal(false);
        }
        
        // ✅ FIX: Reset form immediately
        setFormData({
          name: '',
          description: '',
          isActive: true
        });
        setSelectedRole(null);
        
        // ✅ FIX: Show success message
        toast.success(isEdit ? 'Role updated successfully!' : 'Role created successfully!');
        
        // ✅ FIX: Optimistically update UI based on response
        try {
          if (result.success && result.data) {
            // Handle both response structures: result.data.role or result.data directly
            const roleData = result.data.role || result.data;
            
            if (roleData && roleData._id) {
              if (isEdit) {
                // UPDATE: Update the specific role in the list
                setRoles(prev => prev.map(role => 
                  role._id === roleData._id ? roleData : role
                ));
                
                // Update summary if status changed
                if (selectedRole && selectedRole.isActive !== roleData.isActive) {
                  setSummary(prev => ({
                    ...prev,
                    activeRoles: roleData.isActive ? prev.activeRoles + 1 : prev.activeRoles - 1,
                    inactiveRoles: !roleData.isActive ? prev.inactiveRoles + 1 : prev.inactiveRoles - 1
                  }));
                }
              } else {
                // CREATE: Add new role to the list immediately
                setRoles(prev => {
                  // Check if role already exists (avoid duplicates)
                  const exists = prev.some(r => r._id === roleData._id);
                  if (exists) {
                    return prev.map(r => r._id === roleData._id ? roleData : r);
                  }
                  return [...prev, roleData];
                });
                
                // Update summary immediately
                setSummary(prev => ({
                  activeRoles: roleData.isActive !== false ? prev.activeRoles + 1 : prev.activeRoles,
                  inactiveRoles: roleData.isActive === false ? prev.inactiveRoles + 1 : prev.inactiveRoles,
                  totalRoles: prev.totalRoles + 1
                }));
                
                // Update total items
                setTotalItems(prev => prev + 1);
                
                // Recalculate total pages
                const newTotal = totalItems + 1;
                const itemsPerPageValue = itemsPerPage || 10;
                setTotalPages(Math.max(1, Math.ceil(newTotal / itemsPerPageValue)));
              }
            }
          }
        } catch (optimisticError) {
          // ✅ FIX: Don't let optimistic update errors prevent modal from closing
          console.warn('⚠️ [TheaterRoles] Error in optimistic update (non-critical):', optimisticError);
        }
        
        // ✅ FIX: Reload data IMMEDIATELY (no setTimeout delay)
        // This ensures the table is updated with the latest data from server
        loadRolesData(currentPage, itemsPerPage, debouncedSearchTerm, true).catch(loadError => {
          console.warn('⚠️ [TheaterRoles] Failed to reload data after save:', loadError);
        });
      } else {
        console.warn('⚠️ [TheaterRoles] Not closing modal - success check failed:', {
          responseOk,
          responseStatus,
          resultSuccess: result?.success
        });
        // ✅ FIX: Use already parsed result or try to parse from stored text
        let errorData = result;
        if (!errorData && responseText) {
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            errorData = {};
          }
        }
        
        console.error('❌ [TheaterRoles] Error response:', {
          status: responseStatus,
          ok: responseOk,
          errorData: errorData
        });
        
        // Show error message
        const errorMessage = errorData?.message || errorData?.error || 'Failed to save role';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('❌ [TheaterRoles] Exception during save:', error);
      toast.error(`An error occurred while saving the role: ${error.message}`);
    }
  };

  // Confirm delete
  const handleDeleteRole = async () => {
    if (!selectedRole || !selectedRole._id) {
      setShowDeleteModal(false);
      return;
    }

    // Store role data for potential revert
    const deletedRole = selectedRole;
    const deletedRoleId = deletedRole._id;

    // 🚀 OPTIMISTIC UPDATE: Remove from UI immediately for instant feedback
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

    // Close modal immediately for instant UI feedback
    setShowDeleteModal(false);
    setSelectedRole(null);

    // Show success message immediately
    toast.success('Role deleted successfully!');

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      
      // ✅ FIX: Clear cache before delete
      clearCachePattern('roles');
      clearCachePattern(`roles_${theaterId}`);
      
      // ✅ FIX: Use direct fetch with no-cache headers (no unifiedFetch caching)
      const response = await fetch(`${config.api.baseUrl}/roles/${deletedRoleId}?permanent=true&_t=${Date.now()}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      
      if (response.ok) {
        // Success - refresh data to ensure consistency
        loadRolesData(currentPage, itemsPerPage, searchTerm, true);
      } else {
        // Handle specific error cases
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 404 || response.status === 400) {
          // Role not found or invalid - optimistic update was correct, just refresh
          loadRolesData(currentPage, itemsPerPage, searchTerm, true);
        } else {
          // Other errors - revert optimistic update
          setRoles(prevRoles => [...prevRoles, deletedRole]);
          setSummary(prev => ({
            ...prev,
            totalRoles: prev.totalRoles + 1,
            activeRoles: deletedRole.isActive ? prev.activeRoles + 1 : prev.activeRoles,
            inactiveRoles: deletedRole.isActive ? prev.inactiveRoles : prev.inactiveRoles - 1
          }));
          toast.error(errorData.message || errorData.error || 'Failed to delete role');
        }
      }
    } catch (error) {
      // Handle network errors or other exceptions
      if (error.name === 'AbortError') {
        return; // Request was aborted, don't show error
      }
      
      // Check if error message indicates role not found or invalid
      const errorMessage = error.message || error.toString() || '';
      if (errorMessage.includes('404') || errorMessage.includes('not found') || 
          errorMessage.includes('400') || errorMessage.includes('Invalid')) {
        // Role might already be deleted, optimistic update was correct - just refresh
        loadRolesData(currentPage, itemsPerPage, searchTerm, true);
      } else {
        // Other errors - revert optimistic update
        setRoles(prevRoles => [...prevRoles, deletedRole]);
        setSummary(prev => ({
          ...prev,
          totalRoles: prev.totalRoles + 1,
          activeRoles: deletedRole.isActive ? prev.activeRoles + 1 : prev.activeRoles,
          inactiveRoles: deletedRole.isActive ? prev.inactiveRoles : prev.inactiveRoles - 1
        }));
        toast.error('Failed to delete role. Please check your connection and try again.');
      }
    }
  };

  // Memoized skeleton component for loading states
  const TableRowSkeleton = useMemo(() => () => (
    <tr className="skeleton-row">
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  ), []);

  // Header button (matching QR Names structure)
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
      Create New Role
    </button>
  );

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Role Management" currentPage="theater-roles">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title={theater?.name || 'Role Management'}
              showBackButton={false}
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
                  placeholder="Search roles by name or description..."
                  value={searchTerm}
                  onChange={handleSearch}
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
              <table className="qr-management-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Role Name</th>
                    <th>Status</th>
                    <th>Access Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="loading-cell">
                    <div className="loading-spinner"></div>
                    <span>Loading roles...</span>
                  </td>
                </tr>
              ) : roles.length > 0 ? (
                roles
                  .filter(role => role && role._id && role.name) // ✅ Safety check for valid roles
                  .map((role, index) => {
                    const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={role._id} className="theater-row">
                        <td className="serial-number">{serialNumber}</td>
                        <td className="role-name-cell">
                          <div className="role-name-container">
                            <span className="role-name">{role.name || 'No Name'}</span>
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
                                checked={role.isActive !== false}
                                onChange={() => toggleRoleStatus(role._id, role.isActive)}
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
                                backgroundColor: (role.isActive !== false) ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                                transition: '.4s',
                                borderRadius: '24px'
                              }}>
                                <span style={{
                                  position: 'absolute',
                                  content: '""',
                                  height: '18px',
                                  width: '18px',
                                  left: (role.isActive !== false) ? '26px' : '3px',
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
                              title={role.isDefault && !role.canEdit ? "Default roles cannot be edited - use Role Access to modify permissions" : "Edit Role"}
                              disabled={role.isDefault && !role.canEdit}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                              </svg>
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={() => deleteRole(role)}
                              title={role.isDefault && !role.canDelete ? "Default roles cannot be deleted" : "Delete Role"}
                              disabled={role.isDefault && !role.canDelete}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan="5" className="no-data">
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                      <p>No roles found</p>
                      <button 
                        className="btn-primary" 
                        onClick={handleCreateNewRole}
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

            {/* Management Footer */}
            <div className="management-footer">
              <p>
                {debouncedSearchTerm ? (
                  `Showing ${totalItems} of ${summary.totalRoles} roles matching "${debouncedSearchTerm}"`
                ) : (
                  `Total: ${summary.totalRoles} roles (${summary.activeRoles} active, ${summary.inactiveRoles} inactive)`
                )}
              </p>
            </div>

            {/* Pagination - Always Show (Global Component) */}
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
          </PageContainer>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Role</h2>
                <button 
                  className="close-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
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
                    />
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

        {/* Edit Modal */}
        {showEditModal && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Role</h2>
                <button 
                  className="close-btn"
                  onClick={() => setShowEditModal(false)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
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
                    />
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

        {/* View Modal */}
        {showViewModal && (
          <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Role Details</h2>
                <button 
                  className="close-btn"
                  onClick={() => setShowViewModal(false)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
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
                      value={selectedRole?.description || ''} 
                      className="form-control"
                      readOnly
                      rows="3"
                    />
                  </div>
                  <div className="form-group">
                    <label>Permissions Count</label>
                    <input 
                      type="text" 
                      value={selectedRole?.permissions ? selectedRole.permissions.length : 0} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  {selectedRole?.isDefault && (
                    <div className="form-group">
                      <label>Role Type</label>
                      <input 
                        type="text" 
                        value="Default Role" 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Created At</label>
                    <input 
                      type="text" 
                      value={selectedRole?.createdAt ? new Date(selectedRole.createdAt).toLocaleString() : ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Updated At</label>
                    <input 
                      type="text" 
                      value={selectedRole?.updatedAt ? new Date(selectedRole.updatedAt).toLocaleString() : ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                </div>
              </div>
              
              {/* Fixed Footer with Close and Edit Buttons */}
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

        {/* Delete Modal */}
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

        {/* Custom CSS for TheaterRoles modals only */}
        <style dangerouslySetInnerHTML={{
      __html: `
        .theater-role-view-modal-content,
        .theater-role-edit-modal-content,
        .theater-role-create-modal-content {
          max-width: 900px !important;
          width: 85% !important;
        }

        @media (max-width: 768px) {
          .theater-role-view-modal-content,
          .theater-role-edit-modal-content,
          .theater-role-create-modal-content {
            width: 95% !important;
            max-width: none !important;
          }
        }
      `
    }} />
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default TheaterRoles;
