import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { optimizedFetch } from '../utils/apiOptimizer';
import { clearCachePattern } from '../utils/cacheUtils';
import config from '../config';
import apiService from '../services/apiService';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/RoleCreate.css';
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



const RolesList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theaterId } = useParams();
  
  // State management
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theater, setTheater] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Modal state
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    roleId: null,
    roleName: ''
  });
  
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch theater details
  const fetchTheater = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
          }
        },
        `theater_${theaterId}`,
        120000 // 2-minute cache
      );
      if (result && result.data) {
        setTheater(result.data);
      }
    } catch (error) {
  }
  }, [theaterId]);

  // Fetch roles - Updated to use MVC API service
  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const params = {
        page: currentPage,
        limit: itemsPerPage
      };

      if (theaterId) {
        params.theaterId = theaterId;
      }

      if (debouncedSearchTerm.trim()) {
        params.search = debouncedSearchTerm.trim();
      }
      
      // Use the new API service with MVC response handling
      const result = await apiService.getRoles(theaterId, params);
      
      
      // result contains: { items: [], pagination: {}, message: '' }
      if (result && result.items) {
        setRoles(result.items);
        
        if (result.pagination) {
          setTotalPages(result.pagination.totalPages || 0);
          setTotalItems(result.pagination.totalItems || 0);
        } else {
          setTotalPages(0);
          setTotalItems(0);
        }
      } else {
        setRoles([]);
        setTotalPages(0);
        setTotalItems(0);
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      console.error('❌ Error fetching roles:', error);
      setError(`Failed to load roles: ${error.message || 'Unknown error'}`);
      setRoles([]);
      setTotalPages(0);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm, theaterId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]); 

  useEffect(() => {
    fetchTheater();
  }, [fetchTheater]);

  // Refresh when component mounts (check if coming from create/edit)
  useEffect(() => {
    // Check if we're returning from create/edit page
    const lastRoleAction = sessionStorage.getItem('last_role_action');
    const now = Date.now();
    
    if (lastRoleAction && now - parseInt(lastRoleAction) < 60000) { // Within last 60 seconds
      clearCachePattern('roles_');
      if (theaterId) {
        clearCachePattern(`theater_${theaterId}`);
      }
      // Force refresh - fetchRoles always bypasses cache now
      setTimeout(() => {
        fetchRoles();
      }, 200);
      sessionStorage.removeItem('last_role_action');
    }
  }, [theaterId, fetchRoles]);

  // Refresh when location changes (navigating back from create/edit)
  useEffect(() => {
    const currentPath = location.pathname;
    // Check if we're on a roles page (could be /roles or /roles/:theaterId)
    const isRolesListPage = currentPath.match(/^\/roles(\/|$)/) && 
                           !currentPath.includes('/create') && 
                           !currentPath.includes('/edit');
    
    if (isRolesListPage) {
      const navigationState = sessionStorage.getItem('roles_navigation_state');
      if (navigationState === 'from_create_or_edit') {
        sessionStorage.removeItem('roles_navigation_state');
        clearCachePattern('roles_');
        if (theaterId) {
          clearCachePattern(`theater_${theaterId}`);
        }
        // Small delay to ensure component is ready
        setTimeout(() => {
          fetchRoles();
        }, 200);
      }
    }
  }, [location.pathname, theaterId, fetchRoles]);
  
  // Also refresh when page becomes visible (user switches tabs/windows)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const lastRoleAction = sessionStorage.getItem('last_role_action');
        const now = Date.now();
        if (lastRoleAction && now - parseInt(lastRoleAction) < 60000) {
          clearCachePattern('roles_');
          if (theaterId) {
            clearCachePattern(`theater_${theaterId}`);
          }
          fetchRoles();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [theaterId, fetchRoles]);



  // Handle delete role
  const handleDeleteClick = (role) => {
    if (role.isDefault && !role.canDelete) {
      alert('This is a default Theater Admin role and cannot be deleted.');
      return;
    }
    
    setConfirmModal({
      show: true,
      roleId: role._id,
      roleName: role.name
    });
  };

  const confirmDelete = async () => {
    if (!confirmModal.roleId) {
      setConfirmModal({ show: false, roleId: null, roleName: '' });
      return;
    }

    // Store role data for potential revert
    const deletedRoleId = confirmModal.roleId;
    const deletedRoleName = confirmModal.roleName;

    // 🚀 OPTIMISTIC UPDATE: Remove from UI immediately for instant feedback
    setRoles(prevRoles => 
      prevRoles.filter(role => role._id !== deletedRoleId)
    );

    // Close modal immediately for instant UI feedback
    setConfirmModal({ show: false, roleId: null, roleName: '' });

    // Show success message immediately
    alert('Role deleted successfully');

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

      const result = await response.json();

      if (response.ok) {
        // Clear cache and force refresh
        clearCachePattern('roles_');
        if (theaterId) {
          clearCachePattern(`theater_${theaterId}`);
        }
        // fetchRoles always bypasses cache now
        fetchRoles();
      } else {
        // Handle specific error cases
        if (response.status === 404 || response.status === 400) {
          // Role not found or invalid - optimistic update was correct, just refresh
          clearCachePattern('roles_');
          if (theaterId) {
            clearCachePattern(`theater_${theaterId}`);
          }
          fetchRoles();
        } else {
          // Other errors - revert optimistic update
          // Note: We can't easily revert here since we don't have the full role object
          // But the refresh will fix it
          clearCachePattern('roles_');
          if (theaterId) {
            clearCachePattern(`theater_${theaterId}`);
          }
          fetchRoles();
          alert(result.message || result.error || 'Failed to delete role');
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
        clearCachePattern('roles_');
        if (theaterId) {
          clearCachePattern(`theater_${theaterId}`);
        }
        fetchRoles();
      } else {
        // Other errors - refresh to get correct state
        clearCachePattern('roles_');
        if (theaterId) {
          clearCachePattern(`theater_${theaterId}`);
        }
        fetchRoles();
        alert('Failed to delete role. Please check your connection and try again.');
      }
    }
  };

  // Handle edit role
  const handleEditClick = (role) => {
    if (role.isDefault && !role.canEdit) {
      alert('This is a default Theater Admin role and cannot be edited.');
      return;
    }
    
    // Mark navigation state for refresh detection
    sessionStorage.setItem('roles_navigation_state', 'from_create_or_edit');
    sessionStorage.setItem('last_role_action', Date.now().toString());
    
    // Navigate to RoleCreate page with theaterId and roleId in query params for editing
    if (theaterId) {
      navigate(`/roles/${theaterId}?editRoleId=${role._id}`);
    } else {
      // If no theaterId, try to get it from role
      const roleTheaterId = role.theater?._id || role.theater;
      if (roleTheaterId) {
        navigate(`/roles/${roleTheaterId}?editRoleId=${role._id}`);
      } else {
        alert('Cannot edit role: Theater ID not found');
      }
    }
  };

  // Handle create role
  const handleCreateRole = () => {
    // Mark navigation state for refresh detection
    sessionStorage.setItem('roles_navigation_state', 'from_create_or_edit');
    sessionStorage.setItem('last_role_action', Date.now().toString());
    
    // Navigate to RoleCreate page - the route is /roles/:theaterId
    if (theaterId) {
      navigate(`/roles/${theaterId}`);
    } else {
      // If no theaterId, navigate to roles list to select a theater first
      navigate('/roles');
    }
  };

  return (
    <ErrorBoundary>
      <AdminLayout>
        <div className="theater-list-page qr-management-page">
          {/* Header */}
          <div className="page-header-section">
            <div className="header-content">
              <h1 className="page-title">
                {theater ? `${theater.name} - Role Management` : 'Role Management'}
              </h1>
              <button className="add-theater-btn" onClick={handleCreateRole}>
                <i className="fas fa-plus"></i>
                Create New Role
              </button>
            </div>
          </div>

          {/* Statistics - Enhanced with QR Stats Design */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{totalItems}</div>
              <div className="stat-label">Total Roles</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{roles.filter(r => r.isActive).length}</div>
              <div className="stat-label">Active Roles</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{roles.filter(r => !r.isActive).length}</div>
              <div className="stat-label">Inactive Roles</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{roles.filter(r => r.isDefault).length}</div>
              <div className="stat-label">Default Roles</div>
            </div>
          </div>

          {/* Filters */}
          <div className="theater-list-section">
            <div className="filters-section">
              <div className="theater-filters">
                <div className="search-box">
                  <i className="fas fa-search search-icon"></i>
                  <input
                    type="text"
                    placeholder="Search roles by name or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>

              <div className="pagination-info">
                Showing {roles.length > 0 ? ((currentPage - 1) * itemsPerPage + 1) : 0} 
                {' - '}
                {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} roles
                {' (Page '}{currentPage} of {totalPages || 1}{')'}
              </div>

              <div className="items-per-page">
                <label>Items per page:</label>
                <select value={itemsPerPage} onChange={(e) => {
                  setItemsPerPage(parseInt(e.target.value));
                  setCurrentPage(1);
                }}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="error-message">
                <i className="fas fa-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            )}

            {/* Roles Table */}
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-cell">S.No</th>
                    <th className="name-cell">Role Name</th>
                    <th className="description-cell">Description</th>
                    <th className="permissions-cell">Permissions</th>
                    <th className="status-cell">Status</th>
                    <th className="actions-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="loading-cell">
                        <div className="loading-spinner"></div>
                        <span>Loading roles...</span>
                      </td>
                    </tr>
                  ) : roles.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-cell">
                        <i className="fas fa-user-shield fa-3x"></i>
                        <p>No roles found</p>
                        <button className="add-theater-btn" onClick={handleCreateRole}>
                          Create First Role
                        </button>
                      </td>
                    </tr>
                  ) : (
                    roles.map((role, index) => (
                      <tr key={role._id} className="theater-row">
                        <td className="sno-cell">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </td>
                        <td className="name-cell">
                          <div className="role-name-wrapper">
                            <strong>{role.name}</strong>
                            {role.isDefault && (
                              <span className="default-role-badge" title="Default role - Cannot be edited or deleted">
                                <i className="fas fa-shield-alt"></i> Default
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="description-cell">
                          {role.description || 'No description'}
                        </td>
                        <td className="permissions-cell">
                          {role.permissions ? role.permissions.length : 0} permissions
                        </td>
                        <td className="status-cell">
                          <span className={`status-badge ${role.isActive ? 'active' : 'inactive'}`}>
                            {role.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <ActionButtons>
                            <ActionButton
                              icon="edit"
                              onClick={() => handleEditClick(role)}
                              disabled={role.isDefault && !role.canEdit}
                              title={role.isDefault && !role.canEdit ? "Cannot edit default role" : "Edit role"}
                            />
                            <ActionButton
                              icon="trash"
                              onClick={() => handleDeleteClick(role)}
                              disabled={role.isDefault && !role.canDelete}
                              title={role.isDefault && !role.canDelete ? "Cannot delete default role" : "Delete role"}
                            />
                          </ActionButtons>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {confirmModal.show && (
          <div className="modal-overlay" onClick={() => setConfirmModal({ show: false, roleId: null, roleName: '' })}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Confirm Delete</h3>
              <p>Are you sure you want to delete the role "<strong>{confirmModal.roleName}</strong>"?</p>
              <p className="warning-text">This action cannot be undone.</p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setConfirmModal({ show: false, roleId: null, roleName: '' })}>
                  Cancel
                </button>
                <button className="btn-delete" onClick={confirmDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default RolesList;
