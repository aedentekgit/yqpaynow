import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import AdminLayout from '@components/AdminLayout';
import PageContainer from '@components/PageContainer';
import VerticalPageHeader from '@components/VerticalPageHeader';
import Pagination from '@components/Pagination';
import ErrorBoundary from '@components/ErrorBoundary';
import { useModal } from '@contexts/ModalContext';
import { useToast } from '@contexts/ToastContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Import first to ensure modal styles are applied
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';

const SuperAdminCredentials = () => {
  const navigate = useNavigate();
  const { user, userType } = useAuth();
  const { showError } = useModal();
  const toast = useToast();

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('SuperAdminCredentials');
  
  // Data state
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    activeAdmins: 0,
    inactiveAdmins: 0,
    totalAdmins: 0
  });

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
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
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'super_admin',
    isActive: true
  });

  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordEdit, setShowPasswordEdit] = useState(false);

  // Refs for cleanup and performance
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

  // Load admins data
  const loadAdminsData = useCallback(async (page = 1, limit = 10, search = '', forceRefresh = false) => {
    if (!isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);

      // Build query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: search || '',
        _t: Date.now().toString() // Cache busting
      });

      // Add status filter
      if (filterStatus && filterStatus !== 'all') {
        // Convert 'active'/'inactive' to boolean string
        const isActiveValue = filterStatus === 'active' ? 'true' : 'false';
        params.append('isActive', isActiveValue);
      }

      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const baseUrl = `${config.api.baseUrl}/admins?${params.toString()}`;
      
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
      
      // Handle various response structures
      let adminsArray = [];
      let paginationData = null;

      if (data.success && data.data) {
        adminsArray = data.data.items || data.data.admins || data.data || [];
        paginationData = data.pagination || data.data.pagination;
      } else if (data.items) {
        adminsArray = data.items;
        paginationData = data.pagination;
      } else if (data.admins) {
        adminsArray = data.admins;
        paginationData = data.pagination;
      } else if (Array.isArray(data)) {
        adminsArray = data;
      } else if (data.data && Array.isArray(data.data)) {
        adminsArray = data.data;
      }

      if (!isMountedRef.current) return;

      if (adminsArray && adminsArray.length >= 0) {
        // Sort admins by creation date (newest first)
        const sortedAdmins = adminsArray.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        
        setAdmins(sortedAdmins);
        
        // Set pagination data
        if (paginationData) {
          setTotalItems(paginationData.totalItems || sortedAdmins.length);
          setTotalPages(paginationData.totalPages || 1);
        } else {
          setTotalItems(sortedAdmins.length);
          setTotalPages(Math.max(1, Math.ceil(sortedAdmins.length / limit)));
        }
        
        // Calculate summary
        const activeCount = sortedAdmins.filter(a => a.isActive !== false).length;
        const inactiveCount = sortedAdmins.filter(a => a.isActive === false).length;
        
        setSummary({
          activeAdmins: activeCount,
          inactiveAdmins: inactiveCount,
          totalAdmins: sortedAdmins.length
        });
      } else {
        setAdmins([]);
        setTotalItems(0);
        setTotalPages(1);
        setSummary({ activeAdmins: 0, inactiveAdmins: 0, totalAdmins: 0 });
      }
      
    } catch (error) {
      if (!isMountedRef.current) return;
      
      console.error('❌ [SuperAdminCredentials] Error loading admins:', error);
      if (showError) {
        showError(error.message || 'Failed to load admins');
      }
      setAdmins([]);
      setTotalItems(0);
      setTotalPages(1);
      setSummary({ activeAdmins: 0, inactiveAdmins: 0, totalAdmins: 0 });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [filterStatus, showError]);

  // Initial load
  useEffect(() => {
    loadAdminsData(currentPage, itemsPerPage, debouncedSearchTerm, true);
  }, [loadAdminsData, currentPage, itemsPerPage, debouncedSearchTerm, filterStatus]);

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

  // View admin
  const viewAdmin = (admin) => {
    setSelectedAdmin(admin);
    setShowViewModal(true);
  };

  // Edit admin
  const editAdmin = (admin) => {
    setSelectedAdmin(admin);
    setFormData({
      name: admin.name || '',
      email: admin.email || '',
      password: '', // Don't pre-fill password
      phone: admin.phone || '',
      role: admin.role || 'super_admin',
      isActive: admin.isActive !== undefined ? admin.isActive : true
    });
    setShowPasswordEdit(false); // Reset password visibility
    setShowEditModal(true);
  };

  // Delete admin
  const deleteAdmin = (admin) => {
    setSelectedAdmin(admin);
    setShowDeleteModal(true);
  };

  // Create new admin
  const handleCreateNewAdmin = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      role: 'super_admin',
      isActive: true
    });
    setSelectedAdmin(null);
    setShowPassword(false); // Reset password visibility
    setShowCreateModal(true);
  };

  // Handle input change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Toggle state to prevent double clicks
  const [togglingAdminId, setTogglingAdminId] = useState(null);

  // Toggle admin status
  const toggleAdminStatus = async (adminId, currentStatus) => {
    const newStatus = !currentStatus;
    
    if (togglingAdminId === adminId) return;
    
    try {
      setTogglingAdminId(adminId);
      
      // Optimistic update
      setAdmins(prevAdmins => 
        prevAdmins.map(admin => 
          admin._id === adminId 
            ? { ...admin, isActive: newStatus }
            : admin
        )
      );

      setSummary(prev => ({
        ...prev,
        activeAdmins: newStatus ? prev.activeAdmins + 1 : prev.activeAdmins - 1,
        inactiveAdmins: newStatus ? prev.inactiveAdmins - 1 : prev.inactiveAdmins + 1
      }));

      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await fetch(`${config.api.baseUrl}/admins/${adminId}?_t=${Date.now()}`, {
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
        if (response.status === 404 || response.status === 400) {
          setAdmins(prevAdmins =>
            prevAdmins.map(admin =>
              admin._id === adminId ? { ...admin, isActive: !newStatus } : admin
            )
          );
          setSummary(prev => ({
            ...prev,
            activeAdmins: newStatus ? prev.activeAdmins - 1 : prev.activeAdmins + 1,
            inactiveAdmins: newStatus ? prev.inactiveAdmins + 1 : prev.inactiveAdmins - 1
          }));
          loadAdminsData(currentPage, itemsPerPage, searchTerm, true);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to update admin status');
      }

      const result = await response.json();
      
      if (result.success) {
        setTimeout(() => {
          loadAdminsData(currentPage, itemsPerPage, debouncedSearchTerm, true);
        }, 500);
        
        if (toast) {
          toast.success(`Admin ${newStatus ? 'activated' : 'deactivated'} successfully`);
        }
      } else {
        throw new Error(result.message || 'Failed to update admin status');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      
      console.error('❌ Failed to toggle admin status:', error);
      
      setAdmins(prevAdmins => 
        prevAdmins.map(admin => 
          admin._id === adminId 
            ? { ...admin, isActive: currentStatus }
            : admin
        )
      );

      setSummary(prev => ({
        ...prev,
        activeAdmins: currentStatus ? prev.activeAdmins + 1 : prev.activeAdmins - 1,
        inactiveAdmins: currentStatus ? prev.inactiveAdmins - 1 : prev.inactiveAdmins + 1
      }));

      if (showError) {
        showError(`Failed to update admin status: ${error.message}`);
      }
    } finally {
      setTogglingAdminId(null);
    }
  };

  // Submit admin (Create or Update)
  const handleSubmitAdmin = async (isEdit) => {
    try {
      const url = isEdit 
        ? `${config.api.baseUrl}/admins/${selectedAdmin._id}`
        : `${config.api.baseUrl}/admins`;
      
      const method = isEdit ? 'PUT' : 'POST';
      
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      
      // Prepare body - only include password if provided (for updates)
      const bodyData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        isActive: formData.isActive
      };

      // Only include password if it's provided (required for create, optional for update)
      if (!isEdit || formData.password) {
        if (!formData.password || formData.password.length < 6) {
          toast.error('Password must be at least 6 characters');
          return;
        }
        bodyData.password = formData.password;
      }
      
      const response = await fetch(`${url}?_t=${Date.now()}`, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(bodyData)
      });
      
      let result = {};
      let responseOk = false;
      let responseStatus = 0;
      
      try {
        if (response && typeof response === 'object') {
          responseOk = response.ok !== undefined ? response.ok : true;
          responseStatus = response.status || 200;
          
          if (typeof response.json === 'function') {
            result = await response.json();
          } else if (response.data) {
            result = response.data;
          }
        }
      } catch (parseError) {
        console.error('❌ [SuperAdminCredentials] Failed to parse response:', parseError);
        responseOk = responseStatus >= 200 && responseStatus < 300;
      }

      const isSuccess = responseOk || (responseStatus >= 200 && responseStatus < 300) || (result && result.success);
      
      if (isSuccess) {
        if (isEdit) {
          setShowEditModal(false);
        } else {
          setShowCreateModal(false);
        }
        
        setFormData({
          name: '',
          email: '',
          password: '',
          phone: '',
          role: 'super_admin',
          isActive: true
        });
        setSelectedAdmin(null);
        
        toast.success(isEdit ? 'Admin updated successfully!' : 'Admin created successfully!');
        
        loadAdminsData(currentPage, itemsPerPage, debouncedSearchTerm, true);
      } else {
        const errorMessage = result?.message || result?.error || 'Failed to save admin';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('❌ [SuperAdminCredentials] Exception during save:', error);
      toast.error(`An error occurred while saving the admin: ${error.message}`);
    }
  };

  // Confirm delete
  const handleDeleteAdmin = async () => {
    if (!selectedAdmin || !selectedAdmin._id) {
      setShowDeleteModal(false);
      return;
    }

    const deletedAdmin = selectedAdmin;
    const deletedAdminId = deletedAdmin._id;

    // Optimistic update
    setAdmins(prevAdmins => 
      prevAdmins.filter(admin => admin._id !== deletedAdminId)
    );

    setSummary(prev => ({
      ...prev,
      totalAdmins: Math.max(0, prev.totalAdmins - 1),
      activeAdmins: deletedAdmin.isActive ? Math.max(0, prev.activeAdmins - 1) : prev.activeAdmins,
      inactiveAdmins: deletedAdmin.isActive ? prev.inactiveAdmins : Math.max(0, prev.inactiveAdmins - 1)
    }));

    setShowDeleteModal(false);
    setSelectedAdmin(null);

    toast.success('Admin deleted successfully!');

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      
      const response = await fetch(`${config.api.baseUrl}/admins/${deletedAdminId}?permanent=true&_t=${Date.now()}`, {
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
        loadAdminsData(currentPage, itemsPerPage, searchTerm, true);
      } else {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 404 || response.status === 400) {
          loadAdminsData(currentPage, itemsPerPage, searchTerm, true);
        } else {
          setAdmins(prevAdmins => [...prevAdmins, deletedAdmin]);
          setSummary(prev => ({
            ...prev,
            totalAdmins: prev.totalAdmins + 1,
            activeAdmins: deletedAdmin.isActive ? prev.activeAdmins + 1 : prev.activeAdmins,
            inactiveAdmins: deletedAdmin.isActive ? prev.inactiveAdmins : prev.inactiveAdmins + 1
          }));
          toast.error(errorData.message || errorData.error || 'Failed to delete admin');
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      
      const errorMessage = error.message || error.toString() || '';
      if (errorMessage.includes('404') || errorMessage.includes('not found') || 
          errorMessage.includes('400') || errorMessage.includes('Invalid')) {
        loadAdminsData(currentPage, itemsPerPage, searchTerm, true);
      } else {
        setAdmins(prevAdmins => [...prevAdmins, deletedAdmin]);
        setSummary(prev => ({
          ...prev,
          totalAdmins: prev.totalAdmins + 1,
          activeAdmins: deletedAdmin.isActive ? prev.activeAdmins + 1 : prev.activeAdmins,
          inactiveAdmins: deletedAdmin.isActive ? prev.inactiveAdmins : prev.inactiveAdmins + 1
        }));
        toast.error('Failed to delete admin. Please check your connection and try again.');
      }
    }
  };

  // Header button
  const headerButton = (
    <button 
      className="header-btn"
      onClick={handleCreateNewAdmin}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </span>
      Create New Admin
    </button>
  );

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Super Admin Credentials" currentPage="super-admin-credentials">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Super Admin Credentials"
              showBackButton={false}
              actionButton={headerButton}
            />
            
            {/* Stats Section */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.activeAdmins || 0}</div>
                <div className="stat-label">Active Admins</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.inactiveAdmins || 0}</div>
                <div className="stat-label">Inactive Admins</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.totalAdmins || 0}</div>
                <div className="stat-label">Total Admins</div>
              </div>
            </div>

            {/* Enhanced Filters Section */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search admins by name, email, or phone..."
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
                  Showing {admins.length} of {totalItems} admins (Page {currentPage} of {totalPages})
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
                    <th>Icon</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Access Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="loading-cell">
                        <div className="loading-spinner"></div>
                        <span>Loading admins...</span>
                      </td>
                    </tr>
                  ) : admins.length > 0 ? (
                    admins
                      .filter(admin => admin && admin._id)
                      .map((admin, index) => {
                        const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;
                        return (
                          <tr key={admin._id} className="theater-row">
                            <td className="serial-number">{serialNumber}</td>
                            <td className="theater-logo-cell">
                              <div className="role-icon">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                </svg>
                              </div>
                            </td>
                            <td className="role-name-cell">
                              <div className="role-name-container">
                                <div className="role-name">{admin.name || 'No Name'}</div>
                              </div>
                            </td>
                            <td>{admin.email || 'N/A'}</td>
                            <td>{admin.phone || 'N/A'}</td>
                            <td className="seat-class-cell">
                              <span className={`seat-class-badge ${(admin.role || 'super_admin').toLowerCase().replace(/_/g, '-')}`}>
                                {(admin.role || 'super_admin').toUpperCase().replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="status-cell">
                              <span className={`status-badge ${admin.isActive !== false ? 'active' : 'inactive'}`}>
                                {admin.isActive !== false ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="access-status-cell">
                              <div className="toggle-wrapper">
                                <label className="switch" style={{
                                  position: 'relative',
                                  display: 'inline-block',
                                  width: '50px',
                                  height: '24px',
                                  opacity: togglingAdminId === admin._id ? 0.6 : 1,
                                  pointerEvents: togglingAdminId === admin._id ? 'none' : 'auto'
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={admin.isActive !== false}
                                    onChange={() => toggleAdminStatus(admin._id, admin.isActive)}
                                    disabled={togglingAdminId === admin._id}
                                    style={{
                                      opacity: 0,
                                      width: 0,
                                      height: 0
                                    }}
                                  />
                                  <span className="slider" style={{
                                    position: 'absolute',
                                    cursor: togglingAdminId === admin._id ? 'wait' : 'pointer',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundColor: (admin.isActive !== false) ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                                    transition: '.4s',
                                    borderRadius: '24px'
                                  }}>
                                    <span style={{
                                      position: 'absolute',
                                      content: '""',
                                      height: '18px',
                                      width: '18px',
                                      left: (admin.isActive !== false) ? '26px' : '3px',
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
                                  onClick={() => viewAdmin(admin)}
                                  title="View Admin Details"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                                  </svg>
                                </button>
                                <button
                                  className="action-btn edit-btn"
                                  onClick={() => editAdmin(admin)}
                                  title="Edit Admin"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                  </svg>
                                </button>
                                <button
                                  className="action-btn delete-btn"
                                  onClick={() => deleteAdmin(admin)}
                                  title="Delete Admin"
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
                      <td colSpan="9" className="no-data">
                        <div className="empty-state">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                          <p>No admins found</p>
                          <button 
                            className="btn-primary" 
                            onClick={handleCreateNewAdmin}
                          >
                            CREATE YOUR FIRST ADMIN
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
                  `Showing ${totalItems} of ${summary.totalAdmins} admins matching "${debouncedSearchTerm}"`
                ) : (
                  `Total: ${summary.totalAdmins} admins (${summary.activeAdmins} active, ${summary.inactiveAdmins} inactive)`
                )}
              </p>
            </div>

            {/* Pagination */}
            {!loading && (
              <Pagination 
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                itemType="admins"
              />
            )}
          </PageContainer>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Admin</h2>
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
                    <label>Name *</label>
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="form-control"
                      placeholder="Enter admin name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input 
                      type="email" 
                      value={formData.email || ''} 
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="form-control"
                      placeholder="Enter admin email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Password *</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        value={formData.password || ''} 
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="form-control"
                        placeholder="Enter password (min 6 characters)"
                        required
                        minLength={6}
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#666'
                        }}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
                            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input 
                      type="tel" 
                      value={formData.phone || ''} 
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="form-control"
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select 
                      value={formData.role || 'super_admin'} 
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="form-control"
                    >
                      <option value="super_admin">Super Admin</option>
                    </select>
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
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="cancel-btn" 
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => handleSubmitAdmin(false)}
                >
                  Create Admin
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
                <h2>Edit Admin</h2>
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
                    <label>Name *</label>
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="form-control"
                      placeholder="Enter admin name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input 
                      type="email" 
                      value={formData.email || ''} 
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="form-control"
                      placeholder="Enter admin email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Password (leave blank to keep current)</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPasswordEdit ? 'text' : 'password'} 
                        value={formData.password || ''} 
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="form-control"
                        placeholder="Enter new password (min 6 characters)"
                        minLength={6}
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordEdit(!showPasswordEdit)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#666'
                        }}
                        title={showPasswordEdit ? 'Hide password' : 'Show password'}
                      >
                        {showPasswordEdit ? (
                          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
                            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input 
                      type="tel" 
                      value={formData.phone || ''} 
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="form-control"
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select 
                      value={formData.role || 'super_admin'} 
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="form-control"
                    >
                      <option value="super_admin">Super Admin</option>
                    </select>
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
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="cancel-btn" 
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => handleSubmitAdmin(true)}
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
                <h2>Admin Details</h2>
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
                    <label>Name</label>
                    <input 
                      type="text" 
                      value={selectedAdmin?.name || ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input 
                      type="email" 
                      value={selectedAdmin?.email || ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input 
                      type="tel" 
                      value={selectedAdmin?.phone || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <input 
                      type="text" 
                      value={selectedAdmin?.role || 'super_admin'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={selectedAdmin?.isActive ? 'Active' : 'Inactive'} 
                      className="form-control"
                      disabled
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  {selectedAdmin?.createdAt && (
                    <div className="form-group">
                      <label>Created At</label>
                      <input 
                        type="text" 
                        value={new Date(selectedAdmin.createdAt).toLocaleString()} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                  {selectedAdmin?.updatedAt && (
                    <div className="form-group">
                      <label>Updated At</label>
                      <input 
                        type="text" 
                        value={new Date(selectedAdmin.updatedAt).toLocaleString()} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                  {selectedAdmin?.lastLogin && (
                    <div className="form-group">
                      <label>Last Login</label>
                      <input 
                        type="text" 
                        value={new Date(selectedAdmin.lastLogin).toLocaleString()} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                </div>
              </div>
              
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
                    editAdmin(selectedAdmin);
                  }}
                >
                  Edit Admin
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
                <p>Are you sure you want to delete the admin <strong>{selectedAdmin?.name}</strong>?</p>
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
                  onClick={handleDeleteAdmin}
                  className="confirm-delete-btn"
                >
                  Delete Admin
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>

    </ErrorBoundary>
  );
};

export default SuperAdminCredentials;

