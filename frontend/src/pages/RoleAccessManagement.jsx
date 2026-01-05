import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { useToast } from '../contexts/ToastContext';
import { optimizedFetch } from '../utils/apiOptimizer';
import config from '../config';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/QRManagementPage.css';
import '../styles/TheaterList.css';
import '../styles/pages/RoleAccessManagement.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



const RoleAccessManagement = () => {
  const navigate = useNavigate();
  const { theaterId } = useParams(); // Get theaterId from URL
  const toast = useToast();

  // Theater state
  const [theater, setTheater] = useState(null);
  const [theaterLoading, setTheaterLoading] = useState(true);

  // State management
  const [rolePermissions, setRolePermissions] = useState([]);
  const [activeRoles, setActiveRoles] = useState([]);
  const [activePages, setActivePages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [summary, setSummary] = useState({
    activeRolePermissions: 0,
    inactiveRolePermissions: 0,
    totalRolePermissions: 0
  });

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRolePermission, setSelectedRolePermission] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    roleId: '',
    permissions: []
  });

  // Sort role permissions by ID in ascending order
  const sortedRolePermissions = useMemo(() => {
    return [...rolePermissions].sort((a, b) => {
      // Sort by MongoDB ObjectId in ascending order (chronological creation order)
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [rolePermissions]);

  // Load active pages from pageaccesses collection database for specific theater
  const loadActivePages = useCallback(async (forceRefresh = false) => {
    if (!theaterId) {
      setActivePages([]);
      return [];
    }

    try {

      // ✅ FIX: Use fresh fetch with cache-busting to get latest page list
      const cacheBuster = `_t=${Date.now()}`;
      const url = `${config.api.baseUrl}/page-access?theaterId=${theaterId}&${cacheBuster}`;

      const response = await unifiedFetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `page_access_${theaterId}`,
        cacheTTL: 300000, // 5 minutes
        forceRefresh: forceRefresh // ✅ FIX: Force refresh when requested
      });

      // unifiedFetch throws errors for non-ok responses, so if we get here, response is ok
      const data = await response.json();


      // ✅ NEW: Backend returns data.data.pageAccessList (array-based structure per theater)
      if (data.success && data.data && data.data.pageAccessList && Array.isArray(data.data.pageAccessList)) {
        const pages = data.data.pageAccessList
          .filter(pageAccess => pageAccess.isActive !== false) // Only show active pages
          .map(pageAccess => ({
            page: pageAccess.page,
            pageName: pageAccess.pageName,
            description: pageAccess.description || `Access to ${pageAccess.pageName}`,
            route: pageAccess.route
          }));

        setActivePages(pages);
        return pages;
      } else {
        console.warn('⚠️ [loadActivePages] No page access list found in response');
        setActivePages([]);
        return [];
      }
    } catch (error) {
      // unifiedFetch throws errors, so handle them properly
      if (error.name === 'AbortError') {
        return [];
      }

      console.error('❌ [loadActivePages] Error loading pages:', error);
      setActivePages([]);
      return [];
    }
  }, [theaterId]);

  // Fetch theater details for theater-specific context
  const fetchTheater = useCallback(async () => {
    if (!theaterId) {
      setTheater(null);
      setTheaterLoading(false);
      return;
    }

    try {
      setTheaterLoading(true);

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const data = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}`,
        {
          headers: {
            'Accept': 'application/json',
            // Add auth token if it exists
            ...(localStorage.getItem('authToken') && {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            })
          }
        },
        `theater_${theaterId}`,
        120000 // 2-minute cache
      );

      if (!data) {
        throw new Error('Failed to fetch theater details');
      }

      // ✅ FIX: Backend returns data.data, not data.theater
      if (data.success && data.data) {

        setTheater(data.data);
      } else {
        throw new Error('Theater not found');
      }
    } catch (error) {

      toast.error(`Failed to load theater details: ${error.message}`);
      setTheater(null);
    } finally {
      setTheaterLoading(false);
    }
  }, [theaterId, toast]);

  // Refs
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Load role permissions data
  const loadRolePermissionsData = useCallback(async (page = 1, limit = 10, search = '', forceRefresh = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search })
      });

      // Add theater filter if theaterId is present
      if (theaterId) {
        params.append('theaterId', theaterId);
      }

      // � FORCE REFRESH: Add cache-busting timestamp when forceRefresh is true
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // 🔄 FORCE REFRESH: Add no-cache headers when forceRefresh is true
      const headers = {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('authToken') && {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        })
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      // �🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `roles_theater_${theaterId || 'all'}_page_${page}_limit_${limit}_search_${search || 'none'}`;
      const data = await optimizedFetch(
        `${config.api.baseUrl}/roles?${params}`,
        {
          signal: abortController.signal,
          headers
        },
        forceRefresh ? null : cacheKey, // 🔄 FORCE REFRESH: Skip cache key when forceRefresh is true
        120000 // 2-minute cache
      );

      if (!data) {
        throw new Error('Failed to fetch roles');
      }

      if (isMountedRef.current && data.success) {
        const rolesData = data.data?.roles || [];
        const paginationData = data.data?.pagination || {};

        setRolePermissions(rolesData);
        setCurrentPage(paginationData.page || 1);
        setTotalPages(paginationData.pages || 1);
        setTotalItems(paginationData.total || 0);

        // Calculate summary
        const activeCount = rolesData.filter(role => role.isActive).length;
        const inactiveCount = rolesData.filter(role => !role.isActive).length;

        const newSummary = {
          activeRolePermissions: activeCount,
          inactiveRolePermissions: inactiveCount,
          totalRolePermissions: paginationData.total || 0
        };

        setSummary(newSummary);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        if (isMountedRef.current) {
          toast.error('Failed to load role permissions. Please try again.');
          setRolePermissions([]);
          setSummary({ activeRolePermissions: 0, inactiveRolePermissions: 0, totalRolePermissions: 0 });
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterId, toast]);

  // Load active roles
  const loadActiveRoles = useCallback(async () => {
    try {

      // SECURITY: Build URL with theater isolation
      let url = `${config.api.baseUrl}/roles?limit=100&isActive=true`;
      if (theaterId && theaterId !== 'null' && theaterId !== 'undefined') {
        url += `&theaterId=${theaterId}`;
      }

      const response = await unifiedFetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `roles_${theaterId || 'all'}`,
        cacheTTL: 300000 // 5 minutes
      });

      // unifiedFetch throws errors for non-ok responses, so if we get here, response is ok
      const data = await response.json();

      if (data.success && data.data?.roles) {
        const activeRoles = data.data.roles.filter(role => role.isActive !== false);
        setActiveRoles(activeRoles);
      } else {
        toast.error('Failed to load roles: Invalid response format');
      }
    } catch (error) {
      // unifiedFetch throws errors, so handle them properly
      if (error.name === 'AbortError') {
        return; // Don't show error for aborted requests
      }

      // Extract meaningful error message
      let errorMessage = 'Failed to load roles. Please try again.';

      if (error.message) {
        // Clean up error message - remove "HTTP XXX: " prefix if it's not informative
        const errorMsg = error.message.trim();

        // If error message starts with "HTTP" and contains status code, try to extract meaningful message
        if (errorMsg.startsWith('HTTP') && errorMsg.includes(':')) {
          const parts = errorMsg.split(':');
          if (parts.length > 1) {
            const statusPart = parts[0].trim(); // "HTTP 404"
            const messagePart = parts.slice(1).join(':').trim(); // Rest of the message

            // If message part is meaningful (not just status text), use it
            if (messagePart && messagePart.length > 0 && !messagePart.match(/^[A-Z][a-z\s]+$/)) {
              errorMessage = messagePart;
            } else if (error.status === 404) {
              errorMessage = 'Roles not found. Please check your permissions.';
            } else if (error.status === 401 || error.status === 403) {
              errorMessage = 'You do not have permission to view roles.';
            } else if (error.status === 500) {
              errorMessage = 'Server error occurred. Please try again later.';
            } else {
              errorMessage = errorMsg;
            }
          } else {
            errorMessage = errorMsg;
          }
        } else {
          // Use the error message as-is if it's meaningful
          errorMessage = errorMsg;
        }
      }

      // Handle specific error status codes
      if (error.status === 404) {
        errorMessage = 'Roles not found. Please check your permissions.';
      } else if (error.status === 401 || error.status === 403) {
        errorMessage = 'You do not have permission to view roles.';
      } else if (error.status === 500) {
        errorMessage = 'Server error occurred. Please try again later.';
      }

      toast.error(errorMessage);
    }
  }, [theaterId, toast]);  // Debounced search
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      loadRolePermissionsData(1, itemsPerPage, query);
    }, 500);
  }, [itemsPerPage, loadRolePermissionsData]);

  // Search handler
  const handleSearch = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  // Pagination handlers
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    loadRolePermissionsData(1, newLimit, searchTerm);
  }, [loadRolePermissionsData, searchTerm]);

  const handlePageChange = useCallback((newPage) => {
    loadRolePermissionsData(newPage, itemsPerPage, searchTerm);
  }, [itemsPerPage, searchTerm, loadRolePermissionsData]);


  // CRUD Operations
  const viewRolePermission = (rolePermission) => {
    setSelectedRolePermission(rolePermission);
    setShowViewModal(true);
  };

  const editRolePermission = async (role) => {

    // ✅ FIX: Reload active pages to get the latest list (in case pages were deleted)
    // Force refresh to ensure we get the latest pages after any changes in Page Access Management
    const freshPages = await loadActivePages(true);

    setSelectedRolePermission(role);

    // ✅ FIX: Only include permissions for pages that still exist in active pages
    const activePageIds = new Set(freshPages.map(p => p.page));
    const savedPermissions = role.permissions || [];


    // Filter out deleted pages from saved permissions
    const validSavedPermissions = savedPermissions.filter(p => activePageIds.has(p.page));

    // Prepare form data with all active pages (include saved state only for existing pages)
    const permissions = freshPages.map(page => {
      const existingPermission = validSavedPermissions.find(p => p.page === page.page);
      return {
        page: page.page,
        pageName: page.pageName,
        hasAccess: existingPermission ? existingPermission.hasAccess : false
      };
    });


    setFormData({
      roleId: role._id,
      permissions: permissions
    });

    setShowEditModal(true);
  };

  const deleteRolePermission = (rolePermission) => {
    setSelectedRolePermission(rolePermission);
    setShowDeleteModal(true);
  };

  const handleCreateNewRolePermission = async () => {
    // ✅ FIX: Reload active pages to get the latest list
    // Force refresh to ensure we get the latest pages after any changes in Page Access Management
    const freshPages = await loadActivePages(true);

    // Check if there are active pages available from database
    if (freshPages.length === 0) {
      toast.error('No active pages available for role access management. Please activate pages in Page Access Management first.');
      return;
    }

    // Reset form for new role permission
    const defaultPermissions = freshPages.map(page => ({
      page: page.page,
      pageName: page.pageName,
      hasAccess: false
    }));

    setFormData({
      roleId: '',
      permissions: defaultPermissions
    });
    setSelectedRolePermission(null);
    setShowCreateModal(true);
  };

  // Submit handler for create/edit
  const handleSubmitRolePermission = async (isEdit = false) => {
    const startTime = Date.now();

    try {
      // For editing role permissions, we update the role's permissions array
      if (isEdit && selectedRolePermission) {
        const url = `${config.api.baseUrl}/roles/${selectedRolePermission._id}`;

        // ✅ Only send permissions field (critical for default roles)
        const payload = {
          permissions: formData.permissions
        };


        const fetchStartTime = Date.now();
        const response = await unifiedFetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(payload)
        }, {
          forceRefresh: true, // Don't cache PUT requests
          cacheTTL: 0
        });
        const fetchDuration = Date.now() - fetchStartTime;


        // ✅ CRITICAL FIX: Read response body ONCE before checking success
        // Response body is a stream and can only be read once
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ Failed to parse response JSON:', parseError);
          throw new Error('Invalid response from server. Please try again.');
        }

        // Check if response was successful
        const isSuccess = response.ok !== false && data.success !== false;

        if (isSuccess) {
          // Update local state immediately with the updated role from response
          if (data.success && data.data?.role) {
            setRolePermissions(prevRoles =>
              prevRoles.map(role =>
                role._id === selectedRolePermission._id
                  ? { ...role, permissions: data.data.role.permissions }
                  : role
              )
            );
          }

          // ✅ FIX: Close modal FIRST before showing toast and reloading
          setShowEditModal(false);

          // Reset form immediately
          setFormData({
            roleId: '',
            permissions: activePages.map(page => ({
              page: page.page,
              pageName: page.pageName,
              hasAccess: false
            }))
          });
          setSelectedRolePermission(null);

          // Show success message
          if (selectedRolePermission?.isDefault) {
            toast.success('Theater Admin permissions updated successfully! Page access has been modified.');
          } else {
            toast.success('Role updated successfully!');
          }

          // 🔄 FORCE REFRESH: Reload from server with cache bypass to ensure consistency
          setTimeout(async () => {
            await loadRolePermissionsData(currentPage, itemsPerPage, searchTerm, true);
          }, 100);
        } else {
          // Handle error response (data already parsed above)
          // ✅ Enhanced error messages based on status code
          if (response.status === 401) {
            toast.error('Authentication required. Please login again.');
          } else if (response.status === 403) {
            if (data.code === 'TOKEN_INVALID') {
              toast.error('Your session has expired. Please login again.');
            } else if (data.code === 'DEFAULT_ROLE_PROTECTED') {
              toast.error(
                'Theater Admin role is protected. ' +
                'You can update page access permissions, but role properties like name and description cannot be changed.'
              );
            } else {
              toast.error(data.error || 'Insufficient permissions to update this role.');
            }
          } else if (data.code === 'DEFAULT_ROLE_PROTECTED') {
            toast.error(
              'Theater Admin role is protected. ' +
              'You can update page access permissions, but role properties like name and description cannot be changed.'
            );
          } else if (data.error) {
            toast.error(data.error);
          } else {
            toast.error(data.message || 'Failed to update role permissions');
          }
        }
      } else {
        // For creating, we don't create new roles here - role creation is in RoleCreate page
        toast.error('Please use the Role Create page to create new roles. This page is for managing existing role permissions.');
        setShowCreateModal(false);
      }
    } catch (error) {
      // ✅ FIX: unifiedFetch throws errors for non-ok responses
      // Show error but don't close modal so user can retry
      toast.error(`Failed to save role permissions: ${error.message || 'Network error'}. Please check your internet connection and try again.`);
    }
  };

  const handleDeleteRolePermission = async () => {
    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/roles/${selectedRolePermission._id}`, {
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
        setShowDeleteModal(false);
        toast.success('Role deleted successfully!');
        toast.success('Role deleted successfully');
        loadRolePermissionsData(currentPage, itemsPerPage, searchTerm);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to delete role');
      }
    } catch (error) {
      toast.error('Failed to delete role. Please try again.');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePermissionChange = (pageIndex, hasAccess) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((perm, index) =>
        index === pageIndex ? { ...perm, hasAccess } : perm
      )
    }));
  };

  // Component mount effect - FIX: Only depend on theaterId to prevent infinite refresh loop
  useEffect(() => {
    isMountedRef.current = true;

    fetchTheater();
    // 🔄 FORCE REFRESH: Always force refresh on component mount to ensure fresh data
    loadRolePermissionsData(1, 10, '', true);
    loadActiveRoles();
    loadActivePages();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
    // ✅ FIX: Only depend on theaterId - functions are already memoized with useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theaterId]);

  // Skeleton component
  const TableRowSkeleton = () => (
    <tr className="skeleton-row">
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  );

  // Header button - Removed as requested
  const headerButton = null;


  return (
    <ErrorBoundary>
      <AdminLayout
        pageTitle={theaterId ? `Role Access Management` : "Role Access Management"}
        currentPage="role-access"
      >
        <div className="role-access-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-access-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title={theaterLoading ? 'Loading Theater...' : (theater?.name || 'Role Access Management')}
              backButtonText="Back to Theater List"
              backButtonPath="/role-access"
              actionButton={headerButton}
            />

            {/* Statistics */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-info">
                  <div className="stat-number">{summary.activeRolePermissions || 0}</div>
                  <div className="stat-label">Active Role Access</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <div className="stat-number">{summary.inactiveRolePermissions || 0}</div>
                  <div className="stat-label">Inactive Role Access</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <div className="stat-number">{summary.totalRolePermissions || 0}</div>
                  <div className="stat-label">Total Role Access</div>
                </div>
              </div>
            </div>

            {/* Enhanced Filters Section matching RoleCreate */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search role access by role name..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="search-input"
                />
              </div>
              <div className="filter-controls">
                <div className="results-count">
                  Showing {sortedRolePermissions.length} of {totalItems} role access (Page {currentPage} of {totalPages || 1})
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
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-col">S.No</th>
                    <th className="photo-col">Icon</th>
                    <th className="name-col">Role Name</th>
                    <th className="status-col">Status</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <TableRowSkeleton key={`skeleton-${index}`} />
                    ))
                  ) : sortedRolePermissions.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="no-data">
                        <div className="empty-state">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                          </svg>
                          <p>No role access found</p>
                          <button
                            className="btn-primary"
                            onClick={handleCreateNewRolePermission}
                          >
                            CREATE YOUR FIRST ROLE ACCESS
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedRolePermissions
                      .filter(rolePermission => rolePermission.isActive !== false)
                      .map((rolePermission, index) => (
                        <tr key={rolePermission._id} className="theater-row">
                          <td className="sno-cell">
                            <div className="sno-number">{((currentPage - 1) * itemsPerPage) + index + 1}</div>
                          </td>
                          <td className="photo-cell">
                            <div className="role-icon">
                              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                              </svg>
                            </div>
                          </td>
                          <td className="name-cell">
                            <div className="theater-name-container">
                              <div className="theater-name">{rolePermission.name || 'No Role'}</div>
                              <div className="theater-location">
                                {(rolePermission.permissions?.filter(p => p.hasAccess).length || 0)} permissions granted
                              </div>
                            </div>
                          </td>
                          <td className="status-cell">
                            <span className={`status-badge ${rolePermission.isActive ? 'active' : 'inactive'}`}>
                              {rolePermission.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="actions-cell">
                            <ActionButtons>
                              <ActionButton
                                type="view"
                                onClick={() => viewRolePermission(rolePermission)}
                                title="View Role Access Details"
                              />
                              {rolePermission.name !== 'Kiosk Screen' && (
                                <ActionButton
                                  type="edit"
                                  onClick={() => editRolePermission(rolePermission)}
                                  title="Edit Role Access"
                                />
                              )}
                            </ActionButtons>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            {/* End theater-table-container */}

            {/* Pagination */}
            {!loading && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                itemType="role access"
              />
            )}

            {/* End PageContainer - Modals are inside AdminLayout but outside PageContainer */}
          </PageContainer>
        </div>

        {/* Modals are outside PageContainer but inside AdminLayout */}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create Role Access</h2>
                <button
                  className="close-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Select Role</label>
                    <select
                      value={formData.roleId}
                      onChange={(e) => handleInputChange('roleId', e.target.value)}
                      className="form-control"
                    >
                      <option value="">Select a role...</option>
                      {activeRoles.map((role) => (
                        <option key={role._id} value={role._id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    {activeRoles.length === 0 && (
                      <small className="text-muted">No active roles found. Check console for errors.</small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Page Permissions</label>
                    <div className="permissions-grid">
                      {formData.permissions.length === 0 ? (
                        <div className="empty-permissions-message">
                          No active pages available. Please activate pages in Page Access Management first.
                        </div>
                      ) : (
                        formData.permissions.map((permission, index) => (
                          <div key={permission.page} className="permission-item">
                            <input
                              type="checkbox"
                              checked={permission.hasAccess}
                              onChange={(e) => handlePermissionChange(index, e.target.checked)}
                              className="permission-item-checkbox"
                            />
                            <div>
                              <div className="permission-item-name">{permission.pageName}</div>
                              <div className="permission-item-route">{permission.page}</div>
                            </div>
                          </div>
                        ))
                      )}
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
                  onClick={() => handleSubmitRolePermission(false)}
                  disabled={!formData.roleId}
                >
                  Create Role Access
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Role Access</h2>
                <button
                  className="close-btn"
                  onClick={() => setShowEditModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Role Name</label>
                    <input
                      type="text"
                      value={selectedRolePermission?.name || ''}
                      className="form-control"
                      readOnly
                      style={{ backgroundColor: '#f8fafc', color: '#64748b' }}
                    />
                  </div>

                  <div className="form-group full-width">
                    <div className="permissions-header">
                      <label>Page Access Permissions</label>
                      <div className="permissions-actions">
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => {
                            const allSelected = formData.permissions.every(p => p.hasAccess);
                            setFormData(prev => ({
                              ...prev,
                              permissions: prev.permissions.map(p => ({ ...p, hasAccess: !allSelected }))
                            }));
                          }}
                        >
                          {formData.permissions.every(p => p.hasAccess) ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    {formData.permissions && formData.permissions.length === 0 ? (
                      <div className="role-access-empty-state">
                        <p>No page permissions available.</p>
                        <p className="role-access-empty-hint">
                          Please ensure pages are active in Page Access Management.
                        </p>
                      </div>
                    ) : (
                      <div className="permissions-grid-modern">
                        {formData.permissions && formData.permissions.map((permission, index) => (
                          <div
                            key={permission.page || index}
                            className={`permission-card-modern ${permission.hasAccess ? 'granted' : ''}`}
                            onClick={() => handlePermissionChange(index, !permission.hasAccess)}
                          >
                            <div className="permission-content">
                              <span className="permission-name">{permission.pageName || permission.page}</span>
                              <span className="status-indicator">
                                {permission.hasAccess ? 'Allowed' : 'Denied'}
                              </span>
                            </div>
                            <div className="toggle-wrapper">
                              <div className={`modern-toggle ${permission.hasAccess ? 'checked' : ''}`}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                  onClick={() => handleSubmitRolePermission(true)}
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
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Role Access Details</h2>
                <button
                  className="close-btn"
                  onClick={() => setShowViewModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Role Name</label>
                    <input
                      type="text"
                      value={selectedRolePermission?.name || ''}
                      className="form-control"
                      readOnly
                      style={{ backgroundColor: '#f8fafc', color: '#64748b' }}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label style={{ marginBottom: '16px', display: 'block' }}>Granted Permissions</label>
                    <div className="permissions-grid-modern">
                      {selectedRolePermission?.permissions?.filter(p => p.hasAccess).length === 0 ? (
                        <div className="role-access-empty-state" style={{ gridColumn: '1/-1', width: '100%' }}>
                          <p>No permissions granted for this role.</p>
                        </div>
                      ) : (
                        selectedRolePermission?.permissions
                          ?.filter(p => p.hasAccess)
                          .map(permission => (
                            <div key={permission.page} className="permission-card-modern granted" style={{ cursor: 'default' }}>
                              <div className="permission-content">
                                <span className="permission-name">{permission.pageName}</span>
                                <span className="status-indicator">✓ GRANTED</span>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer with Close Button */}
              <div className="modal-actions">
                <button
                  className="btn-primary"
                  onClick={() => setShowViewModal(false)}
                >
                  Close
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
                <p>Are you sure you want to delete role access for <strong>{selectedRolePermission?.roleName || selectedRolePermission?.role?.name}</strong>?</p>
                <p className="warning-text">This action will remove all page permissions for this role and cannot be undone.</p>
              </div>
              <div className="modal-actions">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRolePermission}
                  className="confirm-delete-btn"
                >
                  Delete Role Access
                </button>
              </div>
            </div>
          </div>
        )}

      </AdminLayout>


    </ErrorBoundary>
  );
};

export default RoleAccessManagement;
