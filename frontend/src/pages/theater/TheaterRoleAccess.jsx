import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import Pagination from '@components/Pagination';
import ErrorBoundary from '@components/ErrorBoundary';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/pages/theater/TheaterRoleAccess.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { clearCachePattern } from '@utils/cacheUtils';



const TheaterRoleAccess = () => {
  const navigate = useNavigate();
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError, showSuccess } = useModal();
  const toast = useToast();

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterRoleAccess');

  // Data state
  const [rolePermissions, setRolePermissions] = useState([]);
  const [activeRoles, setActiveRoles] = useState([]);
  const [activePages, setActivePages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    activeRoleAccess: 0,
    inactiveRoleAccess: 0,
    totalRoleAccess: 0
  });

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRolePermission, setSelectedRolePermission] = useState(null);
  const [formData, setFormData] = useState({
    roleId: '',
    permissions: []
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

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {

      return;
    }
  }, [theaterId, userTheaterId, userType]);

  // Sort role permissions by ID in ascending order
  const sortedRolePermissions = useMemo(() => {
    return [...rolePermissions].sort((a, b) => {
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [rolePermissions]);

  // Load active pages from database - ✅ FIX: Removed caching to always show current values
  const loadActivePages = useCallback(async (forceRefresh = false) => {
    if (!theaterId) {
      setActivePages([]);
      return [];
    }

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      // ✅ FIX: Clear cache before fetching when force refresh is requested
      if (forceRefresh) {
        clearCachePattern('page_access');
        clearCachePattern(`page_access_${theaterId}`);
      }

      // ✅ FIX: Use direct fetch with no-cache headers (no unifiedFetch caching)
      const response = await fetch(`${config.api.baseUrl}/page-access?theaterId=${theaterId}&_t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (response.ok) {
        const data = await response.json();

        // Backend returns data.data.pageAccessList (array-based structure per theater)
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
          setActivePages([]);
          return [];
        }
      } else {
        throw new Error(`HTTP ${response.status}: Failed to fetch pages from database`);
      }
    } catch (error) {
      console.error('❌ [TheaterRoleAccess] Error loading active pages:', error);
      setActivePages([]);
      return [];
    }
  }, [theaterId]);

  // Load role permissions data - ✅ FIX: Removed caching to always show current values
  const loadRolePermissionsData = useCallback(async (page = 1, limit = 10, search = '', forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);

      // ✅ FIX: Clear cache patterns before fetching
      if (forceRefresh) {
        clearCachePattern('role_permissions');
        clearCachePattern(`role_permissions_${theaterId}`);
        clearCachePattern('roles');
        clearCachePattern(`roles_${theaterId}`);
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        theaterId: theaterId,
        search: search || '',
        _t: Date.now().toString() // Always add timestamp to bust cache
      });

      // Add status filter
      if (filterStatus && filterStatus !== 'all') {
        params.append('isActive', filterStatus === 'active' ? 'true' : 'false');
      }

      const baseUrl = `${config.api.baseUrl}/roles?${params.toString()}`;
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

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
        signal: abortControllerRef.current.signal,
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!isMountedRef.current) return;

      // ✅ FIX: Handle various response structures
      let roles = [];
      let paginationData = null;

      if (data.success && data.data) {
        roles = data.data.roles || data.data.items || data.data || [];
        paginationData = data.data.pagination || data.pagination;
      } else if (data.roles) {
        roles = data.roles;
        paginationData = data.pagination;
      } else if (data.items) {
        roles = data.items;
        paginationData = data.pagination;
      } else if (Array.isArray(data)) {
        roles = data;
      }

      setRolePermissions(roles);

      // Batch pagination state updates
      if (paginationData) {
        setTotalItems(paginationData.totalItems || roles.length);
        setTotalPages(paginationData.totalPages || 1);
      } else {
        // Calculate pagination if not provided
        setTotalItems(roles.length);
        setTotalPages(Math.max(1, Math.ceil(roles.length / limit)));
      }
      setCurrentPage(page);

      // Calculate summary
      const activeCount = roles.filter(r => r.isActive).length;
      const inactiveCount = roles.filter(r => !r.isActive).length;

      setSummary({
        activeRoleAccess: activeCount,
        inactiveRoleAccess: inactiveCount,
        totalRoleAccess: roles.length
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('❌ [TheaterRoleAccess] Error loading role permissions:', error);
      if (!isMountedRef.current) return;
      setRolePermissions([]);
      setTotalItems(0);
      setTotalPages(1);
      setSummary({ activeRoleAccess: 0, inactiveRoleAccess: 0, totalRoleAccess: 0 });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterId, filterStatus]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await loadActivePages();
      await loadRolePermissionsData(currentPage, itemsPerPage, searchTerm, true);
    };
    init();
  }, [loadActivePages, loadRolePermissionsData, currentPage, itemsPerPage, filterStatus]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(1);
      loadRolePermissionsData(1, itemsPerPage, searchTerm);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, itemsPerPage, loadRolePermissionsData]);

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

  // View role permissions
  const viewRolePermission = (role) => {
    setSelectedRolePermission(role);
    setShowViewModal(true);
  };

  // Edit role permissions
  const editRolePermission = async (role) => {

    // ✅ FIX: Reload active pages to get the latest list (in case pages were deleted)
    // Force refresh to ensure we get the latest pages after any changes in Page Access Management
    const freshPages = await loadActivePages(true);

    if (freshPages.length === 0) {
      showError('No active pages available. Please activate pages in Page Access Management first.');
      return;
    }

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

  // Delete role permission
  const deleteRolePermission = (role) => {
    setSelectedRolePermission(role);
    setShowDeleteModal(true);
  };

  // Handle permission change
  const handlePermissionChange = (pageIndex, hasAccess) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((perm, index) =>
        index === pageIndex ? { ...perm, hasAccess } : perm
      )
    }));
  };

  // Submit role permissions update
  const handleSubmitRolePermission = async () => {
    // ✅ Safety check
    if (!selectedRolePermission || !selectedRolePermission._id) {
      toast.error('Invalid role selected. Please try again.');
      return;
    }

    // ✅ FIX: Close modal immediately (optimistic) for better UX
    setShowEditModal(false);

    // Save previous state for potential rollback
    const previousFormData = { ...formData };
    const previousSelected = selectedRolePermission;

    // Reset form immediately
    setFormData({
      roleId: '',
      permissions: []
    });
    setSelectedRolePermission(null);

    try {
      const url = `${config.api.baseUrl}/roles/${previousSelected._id}`;
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      // ✅ FIX: Clear cache before update
      clearCachePattern('role_permissions');
      clearCachePattern(`role_permissions_${theaterId}`);
      clearCachePattern('roles');
      clearCachePattern(`roles_${theaterId}`);

      const payload = {
        permissions: previousFormData.permissions
      };

      // ✅ FIX: Use direct fetch with no-cache headers (no unifiedFetch caching)
      const response = await fetch(`${url}?_t=${Date.now()}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });

      // ✅ FIX: Parse response to check for success/error
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        // If we can't parse, assume success (modal stays closed)
        toast.success('Role updated successfully!');
        setTimeout(async () => {
          await loadRolePermissionsData(currentPage, itemsPerPage, searchTerm, true);
        }, 100);
        return;
      }

      // ✅ FIX: Only reopen modal if there's an EXPLICIT error
      // Check for explicit error indicators
      const hasError = result.error || result.success === false;
      const statusCode = response.status;
      const isHttpError = statusCode && statusCode >= 400;

      // ✅ DEBUG: Log response details
      console.log('🔍 Role update response:', {
        hasError,
        statusCode,
        isHttpError,
        result,
        responseOk: response.ok
      });

      if (hasError || isHttpError) {
        // ❌ Explicit error - restore form and reopen modal
        console.error('❌ Role update error detected:', { hasError, isHttpError, result });
        setFormData(previousFormData);
        setSelectedRolePermission(previousSelected);
        setShowEditModal(true);

        const errorMessage = result.error || result.message || 'Failed to update role permissions';
        toast.error(errorMessage);
      } else {
        // ✅ Success - modal already closed, show toast and reload
        // ✅ FIX: Explicitly use success toast (green) - ensure type is 'success'

        // ✅ FIX: Double-check we're using success, not error
        if (typeof toast.success === 'function') {
          toast.success('Role updated successfully!');
        } else {
          console.error('❌ toast.success is not a function!', toast);
        }

        // ✅ Reload data in background
        setTimeout(async () => {
          await loadRolePermissionsData(currentPage, itemsPerPage, searchTerm, true);
        }, 100);
      }
    } catch (error) {
      // Network or other error - restore form state and show error
      setFormData(previousFormData);
      setSelectedRolePermission(previousSelected);
      setShowEditModal(true);

      toast.error(`Failed to update role permissions: ${error.message || 'Network error'}`);
    }
  };

  // Handle delete role permission
  const handleDeleteRolePermission = async () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      // ✅ FIX: Clear cache before delete
      clearCachePattern('role_permissions');
      clearCachePattern(`role_permissions_${theaterId}`);
      clearCachePattern('roles');
      clearCachePattern(`roles_${theaterId}`);

      // ✅ FIX: Use direct fetch with no-cache headers (no unifiedFetch caching)
      const response = await fetch(`${config.api.baseUrl}/roles/${selectedRolePermission._id}?permanent=true&_t=${Date.now()}`, {
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
        // ✅ FIX: Close modal immediately
        setShowDeleteModal(false);
        setSelectedRolePermission(null);

        // ✅ FIX: Show success toast (green) - removed duplicate showSuccess call
        toast.success('Role deleted successfully!');

        // ✅ FIX: Reload data in background
        setTimeout(async () => {
          await loadRolePermissionsData(currentPage, itemsPerPage, searchTerm, true);
        }, 100);
      } else {
        const errorData = await response.json();
        showError(errorData.message || 'Failed to delete role');
      }
    } catch (error) {

      showError('Failed to delete role. Please try again.');
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

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Role Access Management" currentPage="theater-role-access">
        <PageContainer
          title="Role Access Management"
          className="theater-role-access-page"
        >

          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.activeRoleAccess || 0}</div>
              <div className="stat-label">Active Role Access</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.inactiveRoleAccess || 0}</div>
              <div className="stat-label">Inactive Role Access</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalRoleAccess || 0}</div>
              <div className="stat-label">Total Role Access</div>
            </div>
          </div>

          {/* Enhanced Filters Section */}
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
                Showing {sortedRolePermissions.length} of {totalItems} role access (Page {currentPage} of {totalPages})
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
                        <svg viewBox="0 0 24 24" fill="currentColor" className="empty-state-icon">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                        </svg>
                        <p>No role access found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedRolePermissions
                    .map((rolePermission, index) => (
                      <tr key={rolePermission._id} className="theater-row">
                        <td className="sno-cell">
                          <div className="sno-number">{((currentPage - 1) * itemsPerPage) + index + 1}</div>
                        </td>
                        <td className="photo-cell">
                          <div>
                            <svg viewBox="0 0 24 24" fill="currentColor" className="role-icon">
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

          {/* Edit Modal */}
          {showEditModal && (
            <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Edit Role Access</h2>
                  <button
                    className="close-btn"
                    onClick={() => setShowEditModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
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

                      {formData.permissions.length === 0 ? (
                        <div className="role-access-empty-state">
                          <p>No page permissions available.</p>
                          <p className="role-access-empty-hint">
                            Please ensure pages are active in Page Access Management.
                          </p>
                        </div>
                      ) : (
                        <div className="permissions-grid-modern">
                          {formData.permissions.map((permission, index) => (
                            <div
                              key={permission.page}
                              className={`permission-card-modern ${permission.hasAccess ? 'granted' : ''}`}
                              onClick={() => handlePermissionChange(index, !permission.hasAccess)}
                            >
                              <div className="permission-content">
                                <span className="permission-name">{permission.pageName}</span>
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
                    onClick={handleSubmitRolePermission}
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
                  <h2>Role Access Details</h2>
                  <button
                    className="close-btn"
                    onClick={() => setShowViewModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
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
                      />
                    </div>

                    <div className="form-group">
                      <label>Status</label>
                      <input
                        type="text"
                        value={selectedRolePermission?.isActive ? 'Active' : 'Inactive'}
                        className="form-control"
                        readOnly
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

                    <div className="form-group">
                      <label>Created At</label>
                      <input
                        type="text"
                        value={selectedRolePermission?.createdAt ? new Date(selectedRolePermission.createdAt).toLocaleString() : ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                {/* Fixed Footer with Close Button */}
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
                  <p>Are you sure you want to delete role access for <strong>{selectedRolePermission?.name}</strong>?</p>
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

        </PageContainer>
      </TheaterLayout>

      {/* Custom CSS for modal width and Role Access Modal Forms */}
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



          .role-access-permissions-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
          }

          .role-access-permission-card {
            display: block;
            padding: 16px 20px;
            padding-top: 20px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            background: #ffffff;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            min-height: auto;
            position: relative;
            overflow: hidden;
          }

          .role-access-permission-card:hover {
            border-color: #c7d2fe;
            box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);
            background: #faf5ff;
          }

          .role-access-permission-card.granted {
            border-color: #86efac;
            background: #f0fdf4;
          }

          .role-access-permission-card.granted:hover {
            border-color: #4ade80;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
            background: #ecfdf5;
          }

          .role-access-permission-card.denied {
            border-color: #e5e7eb;
            background: #ffffff;
          }

          .role-access-permission-card.denied:hover {
            border-color: #d1d5db;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            background: #f9fafb;
          }

          .role-access-permission-name {
            font-size: 14px;
            font-weight: 500;
            color: #374151;
            line-height: 1.5;
            letter-spacing: -0.01em;
            margin: 0;
            width: 100%;
            padding-right: 28px;
            box-sizing: border-box;
          }

          .role-access-permission-card.granted .role-access-permission-name {
            color: #065f46;
            font-weight: 600;
          }

          /* Checkbox Wrapper for Edit Modal */
          .role-access-checkbox-wrapper {
            position: absolute;
            top: 4px;
            right: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            padding: 0;
            margin: 0;
            width: auto;
            height: auto;
            border-radius: 4px;
            transition: background-color 0.15s ease;
            z-index: 10;
          }

          .role-access-checkbox-wrapper:hover {
            background-color: rgba(139, 92, 246, 0.05);
          }

          .role-access-checkbox {
            width: 18px;
            height: 18px;
            min-width: 18px;
            min-height: 18px;
            max-width: 18px;
            max-height: 18px;
            cursor: pointer;
            margin: 0;
            padding: 0;
            border-radius: 4px;
            border: 1.5px solid #d1d5db;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            position: relative;
            background-color: #ffffff;
            outline: none;
          }

          .role-access-checkbox:hover {
            border-color: #8b5cf6;
            background-color: #faf5ff;
          }

          .role-access-checkbox:focus {
            outline: 2px solid rgba(139, 92, 246, 0.3);
            outline-offset: 2px;
          }

          .role-access-checkbox:checked {
            border-color: #8b5cf6;
            background-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
          }

          .role-access-checkbox:checked::after {
            content: '';
            position: absolute;
            left: 5px;
            top: 2px;
            width: 5px;
            height: 9px;
            border: solid #ffffff;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
            opacity: 0;
            animation: checkmarkAppear 0.2s ease forwards;
          }

          @keyframes checkmarkAppear {
            from {
              opacity: 0;
              transform: rotate(45deg) scale(0.8);
            }
            to {
              opacity: 1;
              transform: rotate(45deg) scale(1);
            }
          }

          .role-access-permission-card.granted .role-access-checkbox {
            border-color: #10b981;
          }

          .role-access-permission-card.granted .role-access-checkbox:hover {
            border-color: #059669;
            background-color: #d1fae5;
          }

          .role-access-permission-card.granted .role-access-checkbox:checked {
            border-color: #10b981;
            background-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
          }

          .role-access-permission-card.granted .role-access-checkbox-wrapper:hover {
            background-color: rgba(16, 185, 129, 0.05);
          }


          /* Status Badge for View Modal */
          .role-access-permission-status {
            margin-top: auto;
            display: flex;
            align-items: center;
          }

          .role-access-status-badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            width: 100%;
            justify-content: center;
            text-transform: uppercase;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          }

          .role-access-status-badge.status-granted {
            background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
            color: #065f46;
            border: 1px solid #10b981;
          }

          .role-access-status-badge.status-denied {
            background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
            color: #991b1b;
            border: 1px solid #ef4444;
          }

          /* Empty State */
          .role-access-empty-state {
            padding: 60px 20px;
            text-align: center;
            color: #6b7280;
          }

          .role-access-empty-state p {
            margin: 0;
            font-size: 15px;
            font-weight: 500;
          }

          .role-access-empty-hint {
            font-size: 13px;
            margin-top: 12px;
            color: #9ca3af;
            font-weight: 400;
          }


          /* Form Control Styling */
          .role-access-modal-form .form-control {
            background: #ffffff;
            border: 1.5px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px 16px;
            font-size: 14px;
            transition: all 0.15s ease;
          }

          .role-access-modal-form .form-control:focus {
            outline: none;
            border-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
          }

          .role-access-modal-form .form-control[readonly] {
            background: #f9fafb;
            color: #374151;
            cursor: not-allowed;
          }

          /* Responsive Grid */
          @media (max-width: 1200px) {
            .role-access-permissions-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (max-width: 768px) {
            .role-access-permissions-grid {
              grid-template-columns: 1fr;
            }
          }
        `
      }} />
    </ErrorBoundary>
  );
};

export default TheaterRoleAccess;
