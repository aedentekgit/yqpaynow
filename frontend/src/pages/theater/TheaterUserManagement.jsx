import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import ErrorBoundary from '@components/ErrorBoundary';
import PageContainer from '@components/PageContainer';
import VerticalPageHeader from '@components/VerticalPageHeader';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { optimizedFetch } from '@utils/apiOptimizer';
import { getCachedData } from '@utils/cacheUtils';
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/TheaterUserDetails.css';
import '@styles/TheaterList.css';
import '@styles/QRManagementPage.css';
import '@styles/AddTheater.css';
import '@styles/pages/theater/TheaterUserManagement.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



const TheaterUserManagement = () => {
  const { theaterId } = useParams();
  const navigate = useNavigate();

  // 🚀 OPTIMIZATION: Synchronous cache check on mount for instant loading
  const initialTheaterCache = useMemo(() => {
    if (!theaterId) return null;
    const cacheKey = `theater_${theaterId}`;
    return getCachedData(cacheKey);
  }, [theaterId]);

  const initialRolesCache = useMemo(() => {
    if (!theaterId) return null;
    const cacheKey = `roles_theater_${theaterId}_active`;
    return getCachedData(cacheKey);
  }, [theaterId]);

  const initialUsersCache = useMemo(() => {
    if (!theaterId) return null;
    const cacheKey = `theater_users_${theaterId}_page_1_limit_100_active`;
    return getCachedData(cacheKey);
  }, [theaterId]);

  // State management - Initialize with cached data
  const [theater, setTheater] = useState(() => {
    if (initialTheaterCache && initialTheaterCache.data) {
      return initialTheaterCache.data || initialTheaterCache.theater || null;
    }
    return null;
  });
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(!initialTheaterCache);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState(null);
  const hasInitialTheaterCache = useRef(!!initialTheaterCache);
  
  // Role icons mapping
  const roleIconsMap = {
    'theater_admin': '👨‍💼',
    'theater_manager': '👩‍💼',
    'theater_staff': '👥',
    'admin': '🔧',
    'manager': '📊',
    'staff': '👤',
    'supervisor': '👔'
  };

  // Dynamic roles for tabs - Initialize with cached data
  const [tabRoles, setTabRoles] = useState(() => {
    if (initialRolesCache && initialRolesCache.success && initialRolesCache.data) {
      const rolesArray = initialRolesCache.data?.roles || [];
      const validRoles = rolesArray
        .filter(role => role && role._id && role.name && role.isActive !== false)
        .sort((a, b) => a._id.localeCompare(b._id));
      return validRoles.map(role => ({
        id: role._id,
        name: role.name,
        icon: roleIconsMap[role.name.toLowerCase().replace(/\s+/g, '_')] || '👤'
      }));
    }
    return [];
  });
  const [users, setUsers] = useState(() => {
    if (initialUsersCache && initialUsersCache.success && initialUsersCache.data) {
      return initialUsersCache.data.users || [];
    }
    return [];
  });
  
  // Available roles - Initialize with cached data
  const [availableRoles, setAvailableRoles] = useState(() => {
    if (initialRolesCache && initialRolesCache.success && initialRolesCache.data) {
      const rolesArray = initialRolesCache.data?.roles || [];
      return rolesArray
        .filter(role => role && role._id && role.name && role.isActive !== false)
        .sort((a, b) => a._id.localeCompare(b._id));
    }
    return [];
  });
  
  // Modal states
  const [crudModal, setCrudModal] = useState({ isOpen: false, mode: 'view', user: null });
  const [deleteModal, setDeleteModal] = useState({ show: false, userId: null, userName: '' });
  const [editConfirmModal, setEditConfirmModal] = useState({ show: false, userData: null });
  const [successModal, setSuccessModal] = useState({ show: false, message: '' });
  
  // Form data
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phoneNumber: '',
    role: '',
    pin: ''
  });
  const [formErrors, setFormErrors] = useState({});
  
  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Get auth headers
  const getAuthHeaders = () => {
    const authToken = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    };
  };

  // Fetch theater details - OPTIMIZED: Use optimizedFetch with cache
  const fetchTheaterDetails = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      // 🚀 OPTIMIZATION: Only set loading if no initial cache
      if (!hasInitialTheaterCache.current) {
        setLoading(true);
      }

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `theater_${theaterId}`;
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}`,
        {
          method: 'GET',
          headers: getAuthHeaders()
        },
        cacheKey,
        120000 // 2-minute cache
      );

      if (result && result.success) {
        const theaterData = result.data || result.theater || result;
        setTheater(theaterData);
      } else {
        setError('Failed to load theater details');
      }
    } catch (err) {
      setError('Error loading theater details');
    } finally {
      setLoading(false);
    }
  }, [theaterId]);

  // Fetch available roles - OPTIMIZED: Use optimizedFetch with cache
  const fetchAvailableRoles = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      const params = new URLSearchParams({
        theaterId: theaterId,
        isActive: 'true'
      });

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `roles_theater_${theaterId}_active`;
      const result = await optimizedFetch(
        `${config.api.baseUrl}/roles?${params.toString()}`,
        {
          method: 'GET',
          headers: getAuthHeaders()
        },
        cacheKey,
        120000 // 2-minute cache
      );

      if (result && result.success) {
        // Handle multiple possible response structures
        let rolesArray = [];
        if (result.data) {
          rolesArray = result.data.roles || result.data || [];
        }

        const validRoles = rolesArray
          .filter(role => role && role._id && role.name && role.isActive !== false)
          .sort((a, b) => a._id.localeCompare(b._id));

        setAvailableRoles(validRoles);
        
        const mappedRoles = validRoles.map(role => ({
          id: role._id,
          name: role.name,
          icon: roleIconsMap[role.name.toLowerCase().replace(/\s+/g, '_')] || '👤'
        }));

        setTabRoles(mappedRoles);

        // Auto-select first role
        if (mappedRoles.length > 0 && !selectedRole) {
          setSelectedRole(mappedRoles[0]);
        }
      } else {
        setTabRoles([]);
      }
    } catch (err) {
      setTabRoles([]);
    }
  }, [theaterId, selectedRole]);

  // Fetch users for the theater - OPTIMIZED: Use optimizedFetch with cache
  const fetchUsers = useCallback(async (forceRefresh = false) => {
    if (!theaterId) return;

    try {
      setLoadingUsers(true);
      
      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
      }

      const params = new URLSearchParams({
        theaterId: theaterId,
        page: '1',
        limit: '100',
        isActive: 'true'
      });

      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading (skip cache if force refresh)
      const cacheKey = forceRefresh ? null : `theater_users_${theaterId}_page_1_limit_100_active`;
      
      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = getAuthHeaders();
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      const result = await optimizedFetch(
        `${config.api.baseUrl}/theater-users?${params.toString()}`,
        {
          method: 'GET',
          headers
        },
        cacheKey,
        120000 // 2-minute cache
      );

      if (result && result.success && result.data) {
        // Handle multiple possible response structures
        let usersList = [];
        if (result.data.users) {
          usersList = result.data.users;
        } else if (Array.isArray(result.data)) {
          usersList = result.data;
        }

        // Ensure we always set an array
        setUsers(Array.isArray(usersList) ? usersList : []);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [theaterId]);

  // Filtered users for selected role
  const roleUsers = Array.isArray(users) ? users.filter(user => {
    if (!user.role) return false;
    const userRoleId = typeof user.role === 'object' ? user.role._id : user.role;
    return userRoleId === selectedRole?.id;
  }) : [];

  // Initialize - OPTIMIZED: Parallel loading with cache-first rendering
  useEffect(() => {
    if (!theaterId) return;
    
    // 🚀 OPTIMIZATION: Load all data in parallel
    // If cache exists, data is already set in state initialization, so this will refresh in background
    Promise.allSettled([
      fetchTheaterDetails(),
      fetchAvailableRoles(),
      fetchUsers(true)
    ]).then(() => {
      // All data loaded (from cache or API)
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theaterId]);

  // Note: fetchUsers is now called in the initialization useEffect above for parallel loading

  // Open CRUD modal
  const openCrudModal = (user = null, mode = 'view') => {
    if (user) {
      setFormData({
        userId: user._id,
        username: user.username || '',
        email: user.email || '',
        fullName: user.fullName || '',
        phoneNumber: user.phoneNumber || '',
        role: typeof user.role === 'object' ? user.role._id : user.role,
        password: '',
        confirmPassword: '',
        pin: user.pin || ''
      });
    } else {
      // ✅ FIX: Auto-populate username with theater's uniqueNumber (mirror super admin)
      setFormData({
        username: theater?.uniqueNumber || '',
        email: '',
        password: '',
        confirmPassword: '',
        fullName: '',
        phoneNumber: '',
        role: selectedRole?.id || '',
        pin: ''
      });
    }
    setFormErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
    setCrudModal({ isOpen: true, mode, user });
  };

  // Close CRUD modal
  const closeCrudModal = () => {
    setCrudModal({ isOpen: false, mode: 'view', user: null });
    // ✅ FIX: Reset username to theater's uniqueNumber (mirror super admin)
    setFormData({
      username: theater?.uniqueNumber || '',
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      phoneNumber: '',
      role: '',
      pin: ''
    });
    setFormErrors({});
  };

  // Handle input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {

    const errors = {};

    // ✅ FIX: Username validation (mirror super admin)
    if (crudModal.mode === 'create') {
      if (!formData.username?.trim()) {
        errors.username = 'Username is required';
      } else if (formData.username.length < 3) {
        errors.username = 'Username must be at least 3 characters';
      }
    }

    // Email validation
    if (!formData.email?.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    
    // Password validation
    if (crudModal.mode === 'create') {
      if (!formData.password) errors.password = 'Password is required';
      else if (formData.password.length < 6) errors.password = 'Password must be at least 6 characters';
      if (formData.password !== formData.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    } else if (crudModal.mode === 'edit' && formData.password) {
      // Only validate password if user wants to change it
      if (formData.password.length < 6) errors.password = 'Password must be at least 6 characters';
      if (formData.password !== formData.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    }

    // Required fields for both create and edit
    if (!formData.fullName?.trim()) errors.fullName = 'Full name is required';
    if (!formData.phoneNumber?.trim()) errors.phoneNumber = 'Phone number is required';
    if (!formData.role) errors.role = 'Role is required';


    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle create user - ✅ FIX: Auto-close modal on success
  const handleCreateUser = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      // Backend expects: theaterId, username, email, password, role, fullName, phoneNumber
      const payload = {
        theaterId: theaterId, // Backend expects 'theaterId' field for array-based structure
        username: formData.username,
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber,
        role: formData.role, // This is the role ID from the selected role
        pin: formData.pin || undefined // Optional PIN
      };

      const response = await unifiedFetch(`${config.api.baseUrl}/theater-users`, {
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
        console.error('❌ [TheaterUserManagement] Failed to parse response:', parseError);
        // If we can't parse, assume success if status looks good
        responseOk = responseStatus >= 200 && responseStatus < 300;
      }

      // ✅ FIX: Check if request was successful (handle multiple response formats)
      const isSuccess = responseOk || (responseStatus >= 200 && responseStatus < 300) || (result && result.success === true);
      
      // ✅ DEBUG: Log response details
      console.log('🔍 [TheaterUserManagement] Create user response:', {
        responseOk,
        responseStatus,
        resultSuccess: result?.success,
        isSuccess,
        result: result
      });

      // ✅ FIX: Close modal IMMEDIATELY if success (FIRST THING - before any other operations)
      if (isSuccess || (result && result.success === true)) {
        
        // ✅ FIX: Close modal IMMEDIATELY (FIRST ACTION)
        closeCrudModal();
        
        // ✅ FIX: Show success message
        setSuccessModal({ show: true, message: 'User created successfully!' });
        
        // ✅ FIX: Reload users in background
        fetchUsers(true).catch(loadError => {
          console.warn('⚠️ [TheaterUserManagement] Failed to reload users after create:', loadError);
        });
      } else {
        console.warn('⚠️ [TheaterUserManagement] Not closing modal - success check failed:', {
          responseOk,
          responseStatus,
          resultSuccess: result?.success
        });
        
        // ✅ FIX: Use already parsed result for error
        const errorMessage = result?.error || result?.message || 'Failed to create user';
        setFormErrors({ submit: errorMessage });
        // Don't close modal on error so user can fix and retry
      }
    } catch (err) {
      console.error('❌ [TheaterUserManagement] Exception during create:', err);
      setFormErrors({ submit: err.message || 'Error creating user' });
      // Don't close modal on error so user can fix and retry
    }
  };

  // Handle update user - Show confirmation modal
  const handleUpdateUser = () => {

    const isValid = validateForm();

    if (!isValid) {

      return;
    }


    // Show confirmation modal with user data
    setEditConfirmModal({ show: true, userData: formData });
  };

  // Confirm update user
  const confirmUpdateUser = async () => {

    if (!formData.userId) {

      alert('Error: User ID is missing. Please close and reopen the edit form.');
      return;
    }
    
    try {
      setLoadingUsers(true);

      // Backend expects: theaterId, fullName, email, phoneNumber, password, role, isActive
      const payload = {
        theaterId: theaterId,
        fullName: formData.fullName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        role: formData.role
      };

      // Only include password if it's being changed
      if (formData.password && formData.password.trim()) {
        payload.password = formData.password;
      }


      const response = await unifiedFetch(`${config.api.baseUrl}/theater-users/${formData.userId}`, {
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
        console.error('❌ [TheaterUserManagement] Failed to parse update response:', parseError);
        // If we can't parse, assume success if status looks good
        responseOk = responseStatus >= 200 && responseStatus < 300;
      }

      // ✅ FIX: Check if request was successful (handle multiple response formats)
      const isSuccess = responseOk || (responseStatus >= 200 && responseStatus < 300) || (result && result.success === true);
      
      // ✅ DEBUG: Log response details
      console.log('🔍 [TheaterUserManagement] Update user response:', {
        responseOk,
        responseStatus,
        resultSuccess: result?.success,
        isSuccess,
        result: result
      });

      // ✅ FIX: Close modals IMMEDIATELY if success (FIRST THING - before any other operations)
      if (isSuccess || (result && result.success === true)) {
        
        // ✅ FIX: Close confirmation modal IMMEDIATELY
        setEditConfirmModal({ show: false, userData: null });
        
        // ✅ FIX: Close CRUD modal IMMEDIATELY (FIRST ACTION)
        closeCrudModal();
        
        // ✅ FIX: Show success message
        setSuccessModal({ show: true, message: 'User updated successfully!' });
        
        // ✅ FIX: Reload users in background
        fetchUsers(true).catch(loadError => {
          console.warn('⚠️ [TheaterUserManagement] Failed to reload users after update:', loadError);
        });
      } else {
        console.warn('⚠️ [TheaterUserManagement] Not closing modals - success check failed:', {
          responseOk,
          responseStatus,
          resultSuccess: result?.success
        });
        
        // Show detailed error message
        let errorMessage = result?.message || result?.error || 'Failed to update user';
        if (result?.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          errorMessage += '\n\nDetails:\n' + result.errors.map(err => 
            `- ${err.path || err.param}: ${err.msg || err.message}`
          ).join('\n');
        }
        
        setEditConfirmModal({ show: false, userData: null });
        setFormErrors({ submit: errorMessage });
        // ✅ FIX: Removed alert - error is shown in formErrors
      }
    } catch (err) {
      console.error('❌ [TheaterUserManagement] Exception during update:', err);
      setEditConfirmModal({ show: false, userData: null });
      setFormErrors({ submit: err.message || 'Error updating user' });
      // ✅ FIX: Removed alert - error is shown in formErrors
    } finally {
      setLoadingUsers(false);
    }
  };

  // Handle delete user - ✅ FIX: Auto-close modal on success
  const handleDeleteUser = async () => {
    try {
      const params = new URLSearchParams({
        theaterId: theaterId,
        permanent: 'true'
      });

      const response = await unifiedFetch(`${config.api.baseUrl}/theater-users/${deleteModal.userId}?${params.toString()}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
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
        console.error('❌ [TheaterUserManagement] Failed to parse delete response:', parseError);
        // If we can't parse, assume success if status looks good
        responseOk = responseStatus >= 200 && responseStatus < 300;
      }

      // ✅ FIX: Check if request was successful (handle multiple response formats)
      // Check if message contains "success" or "deleted successfully" as a fallback
      const messageText = result?.message || result?.error || '';
      const hasSuccessMessage = messageText.toLowerCase().includes('success') || 
                                 messageText.toLowerCase().includes('deleted successfully');
      
      const isSuccess = responseOk || 
                       (responseStatus >= 200 && responseStatus < 300) || 
                       (result && result.success === true) ||
                       (responseStatus === 200 && hasSuccessMessage);
      
      // ✅ DEBUG: Log response details
      console.log('🔍 [TheaterUserManagement] Delete user response:', {
        responseOk,
        responseStatus,
        resultSuccess: result?.success,
        messageText,
        hasSuccessMessage,
        isSuccess,
        result: result
      });

      // ✅ FIX: Close modal IMMEDIATELY if success (FIRST THING - before any other operations)
      if (isSuccess || hasSuccessMessage) {
        
        // ✅ FIX: Close delete modal IMMEDIATELY (FIRST ACTION)
        setDeleteModal({ show: false, userId: null, userName: '' });
        
        // ✅ FIX: Show success message (use result message if available, otherwise default)
        const successMessage = hasSuccessMessage ? messageText : 'User deleted successfully!';
        setSuccessModal({ show: true, message: successMessage });
        
        // ✅ FIX: Reload users in background
        fetchUsers(true).catch(loadError => {
          console.warn('⚠️ [TheaterUserManagement] Failed to reload users after delete:', loadError);
        });
      } else {
        console.warn('⚠️ [TheaterUserManagement] Not closing delete modal - success check failed:', {
          responseOk,
          responseStatus,
          resultSuccess: result?.success,
          messageText
        });
        
        // ✅ FIX: Use already parsed result for error (remove alert, use form error or modal)
        const errorMessage = result?.error || result?.message || 'Failed to delete user';
        setFormErrors({ submit: errorMessage });
        // Don't close modal on error so user can see the error
      }
    } catch (err) {
      console.error('❌ [TheaterUserManagement] Exception during delete:', err);
      // ✅ FIX: Remove alert, use error state instead
      setFormErrors({ submit: err.message || 'Failed to delete user. Please try again.' });
      // Don't close modal on error so user can see the error
    }
  };

  // Handle toggle user access status
  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      
      // Optimistic UI update
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === userId ? { ...user, isActive: newStatus } : user
        )
      );

      const response = await unifiedFetch(`${config.api.baseUrl}/theater-users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({
          isActive: newStatus,
          theaterId: theaterId
        })
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });

      const result = await response.json();
      if (!result.success) {

        // Revert on failure
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user._id === userId ? { ...user, isActive: currentStatus } : user
          )
        );
      } else {
  }
    } catch (error) {

      // Revert on error
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === userId ? { ...user, isActive: currentStatus } : user
        )
      );
    }
  };

  // Handle form submit
  const handleSubmit = (e) => {
    e.preventDefault();
    if (crudModal.mode === 'create') {
      handleCreateUser();
    } else if (crudModal.mode === 'edit') {
      handleUpdateUser();
    }
  };

  if (loading) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Theater User Management">
          <div className="theater-details-container">
            <div className="loading-state">Loading...</div>
          </div>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Theater User Management">
          <div className="theater-details-container">
            <div className="error-state">{error}</div>
          </div>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Theater User Management">
        <div className="theater-user-details-page">
          <PageContainer hasHeader={false} className="theater-user-management-vertical">
            {/* Debug info */}
            {/* Vertical Page Header */}
            <VerticalPageHeader
              title={theater?.name || 'Theater User Management'}
              showBackButton={false}
              actionButton={
                <button className="header-btn" onClick={() => openCrudModal(null, 'create')}>
                  <span className="btn-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </span>
                  Create New User
                </button>
              }
            />

            <div className="theater-user-settings-container">
              {/* Role Tabs */}
              <div className="theater-user-settings-tabs">
                {tabRoles.length > 0 && tabRoles.map((role) => (
                  <button
                    key={role.id}
                    className={`theater-user-settings-tab ${selectedRole?.id === role.id ? 'active' : ''}`}
                    onClick={() => setSelectedRole(role)}
                  >
                    <span className="theater-user-tab-icon">{role.icon || '👤'}</span>
                    {role.name}
                  </button>
                ))}
              </div>

              {/* Settings Content */}
              <div className="theater-user-settings-content">
                {selectedRole ? (
                  <div className="theater-user-settings-section">
                    <div className="theater-user-section-header">
                      <h3>Users with {selectedRole.name} Role</h3>
                    </div>

                    {/* User Management Content */}
                    {loadingUsers ? (
                      <div className="theater-user-empty-state">
                        <div className="theater-user-empty-state-icon">⏳</div>
                        <h4>Loading users...</h4>
                        <p>Please wait while we fetch the user data.</p>
                      </div>
                    ) : roleUsers.length > 0 ? (
                      <div className="table-container">
                        <div className="table-wrapper">
                          <table className="theater-table">
                            <thead>
                              <tr>
                                <th className="sno-col">S NO</th>
                                <th className="name-col">USERNAME</th>
                                <th className="access-status-col">ACCESS STATUS</th>
                                <th className="status-col">STATUS</th>
                                <th className="actions-col">ACTION</th>
                              </tr>
                            </thead>
                            <tbody>
                              {roleUsers.map((user, index) => (
                                <tr key={user._id} className="theater-row">
                                  <td className="sno-cell">
                                    <div className="sno-number">{index + 1}</div>
                                  </td>
                                  <td className="name-cell">
                                    {user.username}
                                  </td>
                                  <td className="access-status-cell">
                                    <div className="toggle-wrapper">
                                      <label className="switch" style={{
                                        position: 'relative',
                                        display: 'inline-block',
                                        width: '50px',
                                        height: '24px'
                                      }}>
                                        <input
                                          type="checkbox"
                                          checked={user.isActive !== false}
                                          onChange={() => toggleUserStatus(user._id, user.isActive !== false)}
                                          style={{
                                            opacity: 0,
                                            width: 0,
                                            height: 0
                                          }}
                                        />
                                        <span className="slider" style={{
                                          position: 'absolute',
                                          cursor: 'pointer',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          bottom: 0,
                                          backgroundColor: (user.isActive !== false) ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                                          transition: '.4s',
                                          borderRadius: '24px'
                                        }}>
                                          <span style={{
                                            position: 'absolute',
                                            content: '""',
                                            height: '18px',
                                            width: '18px',
                                            left: (user.isActive !== false) ? '28px' : '3px',
                                            bottom: '3px',
                                            backgroundColor: 'white',
                                            transition: '.4s',
                                            borderRadius: '50%'
                                          }}></span>
                                        </span>
                                      </label>
                                    </div>
                                  </td>
                                  <td className="status-cell">
                                    <span className={`status-badge ${user.isActive !== false ? 'active' : 'inactive'}`}>
                                      {user.isActive !== false ? 'Active' : 'Inactive'}
                                    </span>
                                  </td>
                                  <td className="actions-cell">
                                    <ActionButtons>
                                      <ActionButton
                                        type="view"
                                        onClick={() => openCrudModal(user, 'view')}
                                        title="View User"
                                      />
                                      <ActionButton
                                        type="edit"
                                        onClick={() => openCrudModal(user, 'edit')}
                                        title="Edit User"
                                      />
                                      <ActionButton
                                        type="delete"
                                        onClick={() => setDeleteModal({ show: true, userId: user._id, userName: user.username })}
                                        title="Delete User"
                                      />
                                    </ActionButtons>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="theater-user-empty-state">
                        <div className="theater-user-empty-state-icon">👤</div>
                        <h4>No users found</h4>
                        <p>No users found with {selectedRole.name} role for this theater.</p>
                        <p className="helper-text">
                          Use the "Add User" button in the top right to add a new user.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="theater-user-empty-state">
                    <div className="theater-user-empty-state-icon">🔧</div>
                    <h4>Select a Role</h4>
                    <p>Choose a role from the tabs above to view and manage users.</p>
                  </div>
                )}
              </div>
            </div>
          </PageContainer>
        </div>

        {/* CRUD Modal */}
        {crudModal.isOpen && (
          <div className="modal-overlay" onClick={closeCrudModal}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {crudModal.mode === 'view' ? 'View User' : crudModal.mode === 'edit' ? 'Edit User' : 'Create User'}
                </h2>
                <button className="close-btn" onClick={closeCrudModal}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>

              <div className="modal-body">
                <div className="edit-form">
                    {/* Username - ✅ FIX: Mirror super admin with prefix handling */}
                    <div className="form-group">
                      <label>Username *</label>
                      <div className="position-relative">
                        <input
                          type="text"
                          name="username"
                          value={formData.username}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            const theaterPrefix = theater?.uniqueNumber || '';
                            
                            // ✅ Ensure the value always starts with theater's uniqueNumber
                            if (theaterPrefix && !newValue.startsWith(theaterPrefix)) {
                              // If user tries to delete the prefix, restore it
                              setFormData(prev => ({ ...prev, username: theaterPrefix }));
                            } else {
                              // Allow adding text after the prefix
                              setFormData(prev => ({ ...prev, username: newValue }));
                            }
                            
                            // Clear error if exists
                            if (formErrors.username) {
                              setFormErrors(prev => ({ ...prev, username: '' }));
                            }
                          }}
                          placeholder={theater?.uniqueNumber ? `${theater.uniqueNumber}` : "Enter unique username"}
                          className={`form-control ${theater?.uniqueNumber ? 'input-padding-left' : ''}`}
                          disabled={crudModal.mode === 'view' || crudModal.mode === 'edit'}
                          autoComplete="off"
                        />
                        {theater?.uniqueNumber && crudModal.mode === 'create' && (
                          <div className={`prefix-overlay ${formData.username.startsWith(theater.uniqueNumber) ? 'hidden' : ''}`}>
                            {theater.uniqueNumber}
                          </div>
                        )}
                      </div>
                      {formErrors.username && <span className="error-message">{formErrors.username}</span>}
                      {theater?.uniqueNumber && crudModal.mode === 'create' && (
                        <div className="helper-text-small-green">
                          🎯 Theater ID: <strong>{theater.uniqueNumber}</strong> (locked as prefix, you can add text after it)
                        </div>
                      )}
                      {crudModal.mode === 'edit' && (
                        <div className="helper-text-small-green">
                          ⚠️ Username cannot be changed
                        </div>
                      )}
                      {users.length > 0 && crudModal.mode === 'create' && (
                        <div className="helper-text-small">
                          💡 Existing usernames: {users.slice(0, 5).map(u => u.username).join(', ')}
                          {users.length > 5 && ` and ${users.length - 5} more...`}
                        </div>
                      )}
                    </div>

                    {/* Email */}
                    <div className="form-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        name="email"
                        className="form-control"
                        value={formData.email}
                        onChange={handleInputChange}
                        disabled={crudModal.mode === 'view'}
                        placeholder="Enter email"
                        autoComplete="off"
                      />
                      {formErrors.email && <span className="error-message">{formErrors.email}</span>}
                    </div>

                    {/* Full Name */}
                    <div className="form-group">
                      <label>Full Name *</label>
                      <input
                        type="text"
                        name="fullName"
                        className="form-control"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        disabled={crudModal.mode === 'view'}
                        placeholder="Enter full name"
                      />
                      {formErrors.fullName && <span className="error-message">{formErrors.fullName}</span>}
                    </div>

                    {/* Phone Number */}
                    <div className="form-group">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        name="phoneNumber"
                        className="form-control"
                        value={formData.phoneNumber}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                          setFormData(prev => ({ ...prev, phoneNumber: value }));
                        }}
                        disabled={crudModal.mode === 'view'}
                        placeholder="Enter 10 digit phone number"
                        maxLength="10"
                        autoComplete="off"
                      />
                      {formErrors.phoneNumber && <span className="error-message">{formErrors.phoneNumber}</span>}
                      {crudModal.mode !== 'view' && (
                        <div className="helper-text-small">
                          💡 Enter exactly 10 digits (e.g., 1234567890)
                        </div>
                      )}
                    </div>

                    {/* PIN */}
                    <div className="form-group">
                      <label>PIN *</label>
                      <input
                        type="text"
                        name="pin"
                        className="form-control"
                        value={formData.pin}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                          setFormData(prev => ({ ...prev, pin: value }));
                        }}
                        disabled={crudModal.mode === 'view'}
                        placeholder="Enter 4 digit PIN"
                        maxLength="4"
                        autoComplete="off"
                        style={crudModal.mode === 'view' ? {
                          letterSpacing: '8px',
                          fontSize: '18px',
                          fontWeight: '700',
                          textAlign: 'center',
                          backgroundColor: '#fffbeb',
                          border: '2px solid #f59e0b',
                          color: '#92400e'
                        } : {
                          letterSpacing: '8px',
                          fontSize: '18px',
                          fontWeight: '600',
                          textAlign: 'center'
                        }}
                      />
                      {formErrors.pin && <span className="error-message">{formErrors.pin}</span>}
                      {crudModal.mode !== 'view' && (
                        <div className="helper-text-small">
                          🔐 4-digit PIN for theater user login
                        </div>
                      )}
                    </div>

                    {/* Role */}
                    <div className="form-group">
                      <label>Role *</label>
                      <select
                        name="role"
                        className="form-control"
                        value={formData.role}
                        onChange={handleInputChange}
                        disabled={crudModal.mode === 'view'}
                      >
                        <option value="">Select Role</option>
                        {availableRoles.map(role => (
                          <option key={role._id} value={role._id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      {formErrors.role && <span className="error-message">{formErrors.role}</span>}
                    </div>

                    {/* Password (Create/Edit) */}
                    {crudModal.mode !== 'view' && (
                      <>
                        <div className="form-group">
                          <label>Password {crudModal.mode === 'create' ? '*' : '(Leave blank to keep current)'}</label>
                          <div className="password-input-wrapper">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              name="password"
                              className="form-control"
                              value={formData.password}
                              onChange={handleInputChange}
                              placeholder={crudModal.mode === 'create' ? 'Enter password' : 'Enter new password'}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="password-toggle"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                                  <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                                </svg>
                              )}
                            </button>
                          </div>
                          {formErrors.password && <span className="error-message">{formErrors.password}</span>}
                        </div>

                        <div className="form-group">
                          <label>Confirm Password {crudModal.mode === 'create' ? '*' : ''}</label>
                          <div className="password-input-wrapper">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              name="confirmPassword"
                              className="form-control"
                              value={formData.confirmPassword}
                              onChange={handleInputChange}
                              placeholder="Confirm password"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="password-toggle"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                                  <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                                </svg>
                              )}
                            </button>
                          </div>
                          {formErrors.confirmPassword && <span className="error-message">{formErrors.confirmPassword}</span>}
                        </div>
                      </>
                    )}

                    {formErrors.submit && (
                      <div className="form-error-message">{formErrors.submit}</div>
                    )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeCrudModal}>
                  Close
                </button>
                {crudModal.mode === 'view' && (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setDeleteModal({ show: true, userId: crudModal.user._id, userName: crudModal.user.username });
                        closeCrudModal();
                      }}
                    >
                      DELETE
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setCrudModal(prev => ({ ...prev, mode: 'edit' }))}
                    >
                      EDIT
                    </button>
                  </>
                )}
                {crudModal.mode === 'edit' && (
                  <button type="button" className="btn-primary" onClick={handleUpdateUser}>
                    SAVE CHANGES
                  </button>
                )}
                {crudModal.mode === 'create' && (
                  <button type="button" className="btn-primary" onClick={handleCreateUser}>
                    CREATE USER
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header">
                <h3>Confirm Deletion</h3>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete user <strong>{deleteModal.userName}</strong>?</p>
                <p className="warning-text">This action cannot be undone.</p>
              </div>
              <div className="modal-actions">
                <button
                  onClick={() => setDeleteModal({ show: false, userId: null, userName: '' })}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  className="confirm-delete-btn"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Confirmation Modal */}
        {editConfirmModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header">
                <h3>Confirm User Update</h3>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to update user <strong>{editConfirmModal.userData?.username}</strong>?</p>
                <div className="info-box">
                  <p><strong>Full Name:</strong> {editConfirmModal.userData?.fullName}</p>
                  <p><strong>Email:</strong> {editConfirmModal.userData?.email}</p>
                  <p><strong>Phone:</strong> {editConfirmModal.userData?.phoneNumber}</p>
                  <p><strong>Role:</strong> {availableRoles.find(r => r._id === editConfirmModal.userData?.role)?.name || 'N/A'}</p>
                  {editConfirmModal.userData?.password && (
                    <p><strong>Password:</strong> Will be updated</p>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button 
                  onClick={() => setEditConfirmModal({ show: false, userData: null })}
                  className="cancel-btn"
                  disabled={loadingUsers}
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmUpdateUser}
                  className="confirm-delete-btn"
                  disabled={loadingUsers}
                >
                  {loadingUsers ? 'Updating...' : 'Confirm Update'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal - Global Design Pattern */}
        {successModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header delete-modal-header">
                <h3>✓ Success</h3>
              </div>
              <div className="modal-body delete-modal-body">
                <div className="delete-modal-icon">✓</div>
                <p className="delete-modal-message">{successModal.message}</p>
              </div>
              <div className="modal-actions delete-modal-actions">
                <button 
                  onClick={() => setSuccessModal({ show: false, message: '' })}
                  className="confirm-delete-btn delete-modal-button"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </TheaterLayout>
    </ErrorBoundary>
  );
};

// ✅ Comprehensive Table Styling
const style = document.createElement('style');
style.textContent = `
  /* ============================================
     COMPREHENSIVE TABLE RESPONSIVE DESIGN
     ============================================ */
  
  /* ✅ FIX: Scope table base styling to Theater User Management page only */
  body.theater-user-management-page .theater-user-settings-content .theater-table,
  .theater-user-management-page .theater-user-settings-content .theater-table {
    width: 100%;
    min-width: 800px;
    border-collapse: collapse;
    font-size: 0.9rem;
    background: white;
    table-layout: auto !important;
    border: 1px solid #d1d5db;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* ✅ FIX: Scope table header styles to Theater User Management page only */
  body.theater-user-management-page .theater-user-settings-content .theater-table thead,
  .theater-user-management-page .theater-user-settings-content .theater-table thead {
    background: linear-gradient(135deg, #6B0E9B 0%, #8B2FB8 100%);
    box-shadow: 0 2px 4px rgba(107, 14, 155, 0.1);
    color: white;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  body.theater-user-management-page .theater-user-settings-content .theater-table thead tr,
  .theater-user-management-page .theater-user-settings-content .theater-table thead tr {
    border-bottom: 2px solid #5A0C82;
  }

  /* ✅ FIX: Scope table header styles to Theater User Management page only */
  body.theater-user-management-page .theater-user-settings-content .theater-table th,
  .theater-user-management-page .theater-user-settings-content .theater-table th {
    padding: 18px 16px;
    text-align: center;
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: none;
    position: relative;
    white-space: nowrap;
    color: white !important;
  }

  .theater-user-settings-content .theater-table th::after {
    content: '';
    position: absolute;
    right: 0;
    top: 25%;
    height: 50%;
    width: 1px;
    background: rgba(255, 255, 255, 0.2);
  }

  .theater-user-settings-content .theater-table th:last-child::after {
    display: none;
  }

  /* Column Widths - Specific for User Management */
  .theater-user-settings-content .theater-table .sno-col { 
    width: 80px; 
    min-width: 70px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .name-col { 
    width: 200px; 
    min-width: 180px;
  }
  
  .theater-user-settings-content .theater-table .access-status-col { 
    width: 150px; 
    min-width: 130px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .status-col { 
    width: 130px; 
    min-width: 120px;
    text-align: center;
  }
  
  .theater-user-settings-content .theater-table .actions-col { 
    width: 180px; 
    min-width: 160px;
    text-align: center;
  }

  /* Table body styling */
  .theater-user-settings-content .theater-table tbody tr {
    border-bottom: 1px solid #e5e7eb;
    background: #ffffff;
    transition: all 0.2s ease;
  }

  .theater-user-settings-content .theater-table tbody tr:nth-child(even) {
    background: #f9fafb;
  }

  .theater-user-settings-content .theater-table tbody tr:hover {
    background: #f0f9ff !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transform: translateY(-1px);
  }

  .theater-user-settings-content .theater-table td {
    padding: 16px 12px;
    vertical-align: middle;
    border-right: 1px solid #f3f4f6;
  }

  .theater-user-settings-content .theater-table td:last-child {
    border-right: none;
  }

  /* S.No cell styling */
  .theater-user-settings-content .theater-table .sno-cell {
    text-align: center;
  }

  .theater-user-settings-content .theater-table .sno-number {
    display: inline-block;
    width: 32px;
    height: 32px;
    line-height: 32px;
    background: #f3f4f6;
    border-radius: 50%;
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
  }

  /* Name cell styling */
  .theater-user-settings-content .theater-table .name-cell {
    font-weight: 600;
    color: #111827;
    text-align: center !important;
    padding: 16px 12px !important;
  }

  /* Access Status cell styling */
  .theater-user-settings-content .theater-table .access-status-cell {
    text-align: center;
  }

  /* Status cell styling */
  .theater-user-settings-content .theater-table .status-cell {
    text-align: center;
  }

  /* Status badge styling - Matching Theater Management global style */
  .theater-user-settings-content .status-badge {
    padding: 6px 12px !important;
    border-radius: 20px !important;
    font-size: 0.8rem !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    margin: 0 8px !important;
  }

  .theater-user-settings-content .status-badge.active {
    background: rgba(16, 185, 129, 0.15) !important;
    color: var(--success-color, #10b981) !important;
    border: none !important;
  }

  .theater-user-settings-content .status-badge.inactive {
    background: rgba(156, 163, 175, 0.15) !important;
    color: var(--text-gray, #6b7280) !important;
    border: none !important;
  }

  /* Actions cell styling */
  .theater-user-settings-content .theater-table .actions-cell {
    text-align: center;
  }

  .theater-user-settings-content .action-buttons {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: center;
    flex-wrap: nowrap;
  }

  /* Table container */
  .theater-table-container {
    overflow-x: auto;
    overflow-y: visible;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    margin-bottom: 20px;
  }

  /* Responsive Design - Tablet */
  @media (max-width: 1024px) {
    .theater-user-settings-content .theater-table {
      min-width: 700px;
    }
    
    .theater-user-settings-content .theater-table .name-col { 
      width: 160px; 
      min-width: 140px;
    }
    
    .theater-user-settings-content .theater-table .access-status-col { 
      width: 120px; 
      min-width: 100px;
    }
    
    .theater-user-settings-content .theater-table .status-col { 
      width: 110px; 
      min-width: 100px;
    }
    
    .theater-user-settings-content .theater-table .actions-col { 
      width: 150px; 
      min-width: 130px;
    }
    
    body.theater-user-management-page .theater-user-settings-content .theater-table th,
    .theater-user-management-page .theater-user-settings-content .theater-table th {
      padding: 14px 12px;
      font-size: 0.8rem;
    }
    
    .theater-user-settings-content .theater-table td {
      padding: 12px 10px;
      font-size: 0.85rem;
    }
  }

  /* Responsive Design - Mobile */
  @media (max-width: 768px) {
    .theater-table-container {
      margin: 0 -15px;
      border-radius: 0;
    }
    
    .theater-user-settings-content .theater-table {
      min-width: 600px;
      font-size: 0.85rem;
    }
    
    .theater-user-settings-content .theater-table .sno-col { 
      width: 60px; 
      min-width: 50px;
    }
    
    .theater-user-settings-content .theater-table .name-col { 
      width: 140px; 
      min-width: 120px;
    }
    
    .theater-user-settings-content .theater-table .access-status-col { 
      width: 100px; 
      min-width: 90px;
    }
    
    .theater-user-settings-content .theater-table .status-col { 
      width: 100px; 
      min-width: 90px;
    }
    
    .theater-user-settings-content .theater-table .actions-col { 
      width: 130px; 
      min-width: 120px;
    }
    
    .theater-user-settings-content .theater-table th {
      padding: 12px 8px;
      font-size: 0.75rem;
    }
    
    .theater-user-settings-content .theater-table td {
      padding: 10px 8px;
      font-size: 0.8rem;
    }
    
    .theater-user-settings-content .theater-table .sno-number {
      width: 28px;
      height: 28px;
      line-height: 28px;
      font-size: 0.8rem;
    }
    
    .theater-user-settings-content .action-buttons {
      gap: 6px;
    }
    
    .theater-user-settings-content .status-badge {
      padding: 3px 8px;
      font-size: 0.7rem;
    }
  }

  /* Very Small Mobile */
  @media (max-width: 480px) {
    .theater-user-settings-content .theater-table {
      min-width: 500px;
    }
    
    body.theater-user-management-page .theater-user-settings-content .theater-table th,
    .theater-user-management-page .theater-user-settings-content .theater-table th {
      padding: 10px 6px;
      font-size: 0.7rem;
    }
    
    .theater-user-settings-content .theater-table td {
      padding: 8px 6px;
    }
  }

  /* ============================================
     MODAL WIDTH STYLING - GLOBAL STANDARD
     ============================================ */
  
  /* Modal width for CRUD operations */
  .theater-edit-modal-content {
    max-width: 900px !important;
    width: 85% !important;
  }

  /* Tablet responsive modal */
  @media (max-width: 1024px) {
    .theater-edit-modal-content {
      width: 90% !important;
    }
  }

  /* Mobile responsive modal */
  @media (max-width: 768px) {
    .theater-edit-modal-content {
      width: 95% !important;
      max-width: none !important;
    }
  }

  /* Very Small Mobile modal */
  @media (max-width: 480px) {
    .theater-edit-modal-content {
      width: 98% !important;
    }
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(style);
}

export default TheaterUserManagement;
