import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import { Button } from '../components/GlobalDesignSystem';
import ActionButton from '../components/ActionButton';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData } from '../utils/cacheUtils';
import config from '../config';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/TheaterUserDetails.css';
import '../styles/TheaterList.css'; // Import TheaterList styles for table
import '../styles/QRManagementPage.css'; // Import global modal styles
import '../styles/AddTheater.css'; // Import error message styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



const TheaterUserDetails = () => {
  // ✅ FIXED: Using same pattern as RoleAccessManagement.js
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

  // Dynamic roles for tabs (will be populated ONLY from Role Management API)
  const [tabRoles, setTabRoles] = useState(() => {
    if (initialRolesCache && initialRolesCache.success && initialRolesCache.data) {
      const rolesArray = initialRolesCache.data?.roles || [];
      const validRoles = rolesArray
        .filter(role => role && role._id && role.name && role.isActive !== false)
        .sort((a, b) => a._id.localeCompare(b._id));
      return validRoles.map(role => ({
        id: role._id,
        name: role.name,
        icon: roleIconsMap[role._id] || roleIconsMap[role.name?.toLowerCase().replace(/\s+/g, '_')] || '👤'
      }));
    }
    return [];
  });
  const [forceRender, setForceRender] = useState(0);
  
  // Confirmation modals state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ show: false, userId: null, userName: '' });
  const [createConfirmModal, setCreateConfirmModal] = useState({ show: false, userData: null });
  const [editConfirmModal, setEditConfirmModal] = useState({ show: false, userData: null });
  
  // Success modal state
  const [successModal, setSuccessModal] = useState({ show: false, message: '' });
  
  // Create user form state
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [createUserData, setCreateUserData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phoneNumber: '',
    pin: '', // 4-digit PIN
    role: ''
  });
  const [createUserErrors, setCreateUserErrors] = useState({});
  
  // View user modal state
  const [showViewUserModal, setShowViewUserModal] = useState(false);
  const [viewUserData, setViewUserData] = useState(null);
  
  // Edit user modal state
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUserData, setEditUserData] = useState({
    userId: '',
    username: '',
    email: '',
    fullName: '',
    phoneNumber: '',
    pin: '', // 4-digit PIN
    role: '',
    password: '',
    confirmPassword: ''
  });
  const [editUserErrors, setEditUserErrors] = useState({});
  
  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);

  // Dynamic roles state with caching - Initialize with cached data
  const [availableRoles, setAvailableRoles] = useState(() => {
    if (initialRolesCache && initialRolesCache.success && initialRolesCache.data) {
      const rolesArray = initialRolesCache.data?.roles || [];
      return rolesArray
        .filter(role => role && role._id && role.name && role.isActive !== false)
        .sort((a, b) => a._id.localeCompare(b._id))
        .map(role => ({
          _id: role._id,
          roleName: role.name,
          name: role.name,
          isActive: role.isActive,
          isDefault: role.isDefault || false
        }));
    }
    return [];
  });
  const [rolesLoading, setRolesLoading] = useState(false);
  
  // Initialize users with cached data
  const [users, setUsers] = useState(() => {
    if (initialUsersCache && initialUsersCache.success && initialUsersCache.data) {
      return initialUsersCache.data.users || [];
    }
    return [];
  });
  
  // Cache roles in sessionStorage for faster subsequent loads (theater-specific)
  const getCachedRoles = () => {
    try {
      const cacheKey = `theater-roles-cache-${theaterId}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { roles, timestamp } = JSON.parse(cached);
        // Cache expires after 5 minutes
        if (Date.now() - timestamp < 300000) {
          return roles;
        }
      }
    } catch (error) {
  }
    return null;
  };
  
  const setCachedRoles = (roles) => {
    try {
      const cacheKey = `theater-roles-cache-${theaterId}`;
      sessionStorage.setItem(cacheKey, JSON.stringify({
        roles,
        timestamp: Date.now()
      }));
    } catch (error) {
  }
  };

  // Helper function to close modal and reset states
  const closeCreateUserModal = () => {
    setShowCreateUserForm(false);
    setCreateUserData({ 
      username: theater?.uniqueNumber || '', // Reset to theater's uniqueNumber
      email: '', 
      password: '', 
      confirmPassword: '', 
      fullName: '', 
      phoneNumber: '', 
      pin: '', 
      role: '' 
    });
    setCreateUserErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // Filtered users for selected role
  const roleUsers = users.filter(user => {
    // ✅ SAFETY: Handle null/undefined role (orphaned references)
    if (!user.role) {

      return false;
    }
    
    // Handle both object (populated) and string (ID) role formats
    const userRoleId = typeof user.role === 'object' ? user.role._id : user.role;
    return userRoleId === selectedRole?.id;
  });

  // Fetch available roles from Role Management with timeout and caching
  const fetchAvailableRoles = useCallback(async () => {
    if (!theaterId) {

      return;
    }
    
    try {
      setRolesLoading(true);
      

      // Check cache first for instant loading
      const cachedRoles = getCachedRoles();
      if (cachedRoles && cachedRoles.length > 0) {

        // ✅ CRITICAL FIX: Filter cached roles for safety and sort by ID ascending
        const validCachedRoles = cachedRoles
          .filter(role => role && role._id && role.name)
          .sort((a, b) => a._id.localeCompare(b._id)); // ✅ Sort by _id in ascending order
        
        if (validCachedRoles.length > 0) {
          setAvailableRoles(validCachedRoles);
          setTabRoles(validCachedRoles.map(role => ({
            id: role._id,
            name: role.name,
            icon: '👤'
          })));
          setRolesLoading(false);
          return;
        } else {
  }
      }
      
      // ✅ Fetch theater-specific roles from the roles database
      const apiUrl = `${config.api.baseUrl}/roles?theaterId=${theaterId}&isActive=true`;

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `roles_theater_${theaterId}_active`;
      const result = await optimizedFetch(
        apiUrl,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        },
        cacheKey,
        120000 // 2-minute cache
      );

      if (!result) {
        throw new Error('Failed to fetch roles');
      }

      if (result.success) {
        // ✅ FIXED: Use same pattern as RoleAccessManagement.js with fallback
        const rolesArray = result.data?.roles || [];
        

        // Filter only active roles and map to consistent structure with safety checks
        // ✅ FIXED: Sort by _id in ascending order
        const activeRoles = rolesArray
          .filter(role => {
            // ✅ Enhanced filtering with detailed logging
            if (!role) {

              return false;
            }
            if (!role._id) {

              return false;
            }
            if (!role.name) {

              return false;
            }
            if (!role.isActive) {

              return false;
            }
            return true;
          })
          .sort((a, b) => {
            // ✅ Sort by _id in ascending order (MongoDB ObjectId comparison)
            return a._id.localeCompare(b._id);
          })
          .map(role => ({
            _id: role._id,
            roleName: role.name, // Role model uses 'name' field
            name: role.name,
            isActive: role.isActive,
            isDefault: role.isDefault || false // ✅ Include isDefault flag
          }));
          

        // ✅ Additional validation
        if (activeRoles.length === 0) {
  }
        
        setAvailableRoles(activeRoles);
        
        // Cache the roles for faster subsequent loads
        setCachedRoles(activeRoles);
        
        // Auto-select first role in create user form if no role selected
        if (activeRoles.length > 0 && !createUserData.role) {
          setCreateUserData(prev => ({ 
            ...prev, 
            role: activeRoles[0]._id 
          }));
  }
        
        // Update tab roles for consistent display with safety checks
        // ✅ FIXED: Sort by _id in ascending order
        const tabRolesData = activeRoles
          .filter(role => {
            // ✅ CRITICAL: Multi-step validation to prevent null/undefined
            if (!role) {

              return false;
            }
            if (!role._id) {

              return false;
            }
            if (!role.name) {

              return false;
            }
            return true;
          })
          .sort((a, b) => {
            // ✅ Sort by _id in ascending order
            return a._id.localeCompare(b._id);
          })
          .map(role => {
            const roleObj = {
              id: role._id,
              name: role.name,
              icon: roleIconsMap[role._id] || roleIconsMap[role.name?.toLowerCase().replace(/\s+/g, '_')] || '👤'
            };

            return roleObj;
          });
        

        // ✅ Final validation before setting state
        if (tabRolesData.length === 0) {
  }
        
        setTabRoles(tabRolesData);
        setForceRender(prev => prev + 1); // Force re-render
        
        // Set first role as default selected
        if (tabRolesData.length > 0 && !selectedRole) {
          setSelectedRole(tabRolesData[0]);
        }
      } else {
        throw new Error(result.message || 'Failed to fetch roles');
      }
    } catch (error) {

      if (error.name === 'AbortError') {

        alert('Role loading timed out. Using basic roles for now. Please check your network connection.');
      }
      
      // Provide minimal fallback for immediate functionality
      const minimalRoles = [
        { _id: 'admin', name: 'Admin', isActive: true },
        { _id: 'manager', name: 'Manager', isActive: true },
        { _id: 'staff', name: 'Staff', isActive: true }
      ];
      
      setAvailableRoles(minimalRoles);
      setTabRoles(minimalRoles.map(role => ({
        id: role._id,
        name: role.name,
        icon: '👤'
      })));
    } finally {
      setRolesLoading(false);
    }
  }, [theaterId]); // ✅ Removed createUserData.role to prevent form refresh on role selection

  // Fetch theater details - OPTIMIZED: optimizedFetch handles cache internally
  const fetchTheater = useCallback(async () => {
    if (!theaterId) return;
    
    try {
      // 🚀 OPTIMIZATION: Only set loading if no initial cache
      if (!hasInitialTheaterCache.current) {
        setLoading(true);
      }

      // 🚀 PERFORMANCE: Use optimizedFetch - it handles cache automatically
      // If cache exists, this returns instantly (< 50ms), otherwise fetches from API
      const cacheKey = `theater_${theaterId}`;
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theaters/${theaterId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        },
        cacheKey,
        120000 // 2-minute cache
      );

      if (!result) {
        throw new Error('Failed to fetch theater');
      }

      if (result.success) {
        // ✅ FIX: Backend returns theater data under 'data' key (not 'theater')
        const theaterData = result.data || result.theater;

        setTheater(theaterData);
      } else {
        throw new Error(result.message || 'Failed to fetch theater details');
      }
    } catch (error) {
      console.error('Error fetching theater:', error);
      setError('Failed to load theater details');
    } finally {
      setLoading(false);
    }
  }, [theaterId]);

  // Fetch users by theater (using array-based structure with query params, same as roles)
  const fetchUsers = useCallback(async (forceRefresh = false) => {
    if (!theaterId) return;
    
    try {
      setLoadingUsers(true);
      
      // ✅ FIX: Use query parameter approach like roles implementation
      const params = new URLSearchParams({
        theaterId: theaterId,
        page: '1',
        limit: '100', // Get all users for the theater
        isActive: 'true'
      });
      
      // 🔄 FORCE REFRESH: Add cache-busting timestamp when forceRefresh is true
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }
      
      // � FORCE REFRESH: Add no-cache headers when forceRefresh is true
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };
      
      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // �🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const cacheKey = `theater_users_${theaterId}_page_1_limit_100_active`;
      const result = await optimizedFetch(
        `${config.api.baseUrl}/theater-users?${params.toString()}`,
        {
          method: 'GET',
          headers
        },
        forceRefresh ? null : cacheKey, // 🔄 FORCE REFRESH: Skip cache key when forceRefresh is true
        120000 // 2-minute cache
      );

      if (!result) {
        throw new Error('Failed to fetch users');
      }

      if (result.success && result.data) {
        // Array-based response structure
        const users = result.data.users || [];

        setUsers(users);
      } else {
        throw new Error(result.message || 'Failed to fetch users');
      }
    } catch (error) {

      setError('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, [theaterId]);

  // Handle create user - Show confirmation modal
  const handleCreateUser = (e) => {
    if (e) e.preventDefault();
    
    // ✅ FIX: Get current theaterId from URL to avoid stale closure
    const urlParts = window.location.pathname.split('/');
    const currentTheaterId = urlParts[urlParts.length - 1] || theaterId;
    
    // Reset errors
    setCreateUserErrors({});
    
    // Enhanced validation
    const errors = {};
    if (!createUserData.username?.trim()) errors.username = 'Username is required';
    if (createUserData.username && createUserData.username.length < 3) errors.username = 'Username must be at least 3 characters';
    if (!createUserData.email?.trim()) errors.email = 'Email is required';
    if (!createUserData.password) errors.password = 'Password is required';
    if (createUserData.password && createUserData.password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (!createUserData.confirmPassword) errors.confirmPassword = 'Confirm password is required';
    if (createUserData.password && createUserData.confirmPassword && createUserData.password !== createUserData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    if (!createUserData.fullName?.trim()) errors.fullName = 'Full name is required';
    if (!createUserData.phoneNumber?.trim()) {
      errors.phoneNumber = 'Phone number is required';
    } else {
      // ✅ Validate phone number: exactly 10 digits
      const phoneDigits = createUserData.phoneNumber.replace(/\D/g, ''); // Remove non-digits
      if (phoneDigits.length !== 10) {
        errors.phoneNumber = 'Phone number must be exactly 10 digits';
      }
    }
    
    // Validate PIN: exactly 4 digits
    if (!createUserData.pin?.trim()) {
      errors.pin = 'PIN is required';
    } else {
      const pinDigits = createUserData.pin.replace(/\D/g, ''); // Remove non-digits
      if (pinDigits.length !== 4) {
        errors.pin = 'PIN must be exactly 4 digits';
      } else if (!/^\d{4}$/.test(createUserData.pin)) {
        errors.pin = 'PIN must contain only numbers';
      }
    }
    
    if (!createUserData.role) errors.role = 'Role is required';
    if (!currentTheaterId) errors.theater = 'Theater ID is missing';
    if (currentTheaterId && currentTheaterId.length !== 24 && currentTheaterId.length !== 25) errors.theater = 'Invalid theater ID format';
    if (availableRoles.length === 0) errors.role = 'No roles available. Please create roles in Role Management first.';
    
    if (Object.keys(errors).length > 0) {
      setCreateUserErrors(errors);
      return;
    }

    // Show confirmation modal
    setCreateConfirmModal({ show: true, userData: createUserData });
  };

  // Confirm create user
  const confirmCreateUser = async () => {
    try {
      setLoadingUsers(true);
      
      // ✅ FIX: Extract theaterId from URL to avoid stale closure issues
      const urlParts = window.location.pathname.split('/');
      const currentTheaterId = urlParts[urlParts.length - 1] || theaterId;
      
      // ✅ DEBUG: Log current theaterId to detect stale closures
      
      // ✅ FIX: Use array-based structure with theaterId (same as roles implementation)
      const payload = {
        theaterId: currentTheaterId, // ✅ Use current theater ID from URL
        username: createUserData.username?.trim() || '',
        email: createUserData.email?.trim().toLowerCase() || '',
        password: createUserData.password || '',
        fullName: createUserData.fullName?.trim() || '',
        phoneNumber: createUserData.phoneNumber?.trim() || '+1234567890',
        pin: createUserData.pin?.trim() || '', // 4-digit PIN
        role: createUserData.role || availableRoles[0]?._id,
        isActive: true,
        isEmailVerified: false
      };
      
      // Ensure we have a role selected
      if (!payload.role && availableRoles.length > 0) {
        payload.role = availableRoles[0]._id;
  }
      
      // Additional validation
      if (!payload.theaterId) {
        setCreateUserErrors({ submit: 'Theater ID is missing' });
        return;
      }
      
      if (!payload.role) {
        setCreateUserErrors({ submit: 'Please select a role' });
        return;
      }
      

      // ✅ DEBUG: Log the actual API URL being used
      const apiUrl = `${config.api.baseUrl}/theater-users`;

      const response = await unifiedFetch(apiUrl, {
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


      // ✅ FIX: Parse JSON and check response (same logic as TheaterList.jsx and LoginPage.jsx)
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ [CreateUser] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to create user`);
          }
        }
        throw parseError;
      }

      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      if (result && result.success === true) {
        
        // Clear any errors
        setCreateUserErrors({});
        setCreateConfirmModal({ show: false, userData: null });
        closeCreateUserModal();
        // 🔄 FORCE REFRESH: Refresh with cache bypass after create
        await fetchUsers(true); // Refresh users list
        // Show success modal instead of alert
        setSuccessModal({ show: true, message: 'User created successfully!' });
      } else if (result && result.success === false) {
        // Backend explicitly returned success: false
        console.error('❌ [CreateUser] Backend returned success: false:', result);
        
        // Handle validation errors specifically
        if (result.errors && Array.isArray(result.errors)) {
          const fieldErrors = {};
          result.errors.forEach((error, index) => {
            if (error.path || error.param) {
              const fieldName = error.path || error.param;
              const errorMsg = error.msg || error.message;
              fieldErrors[fieldName] = errorMsg;
              
              // ✅ Enhanced logging for debugging
              console.error(`❌ Validation error on field "${fieldName}":`, errorMsg);
            }
          });

          // If no field errors were mapped, show general error
          if (Object.keys(fieldErrors).length === 0) {
            setCreateUserErrors({ submit: 'Validation failed. Please check all fields.' });
            console.error('❌ Validation failed with no specific field errors');
          } else {
            setCreateUserErrors(fieldErrors);
            console.error('❌ Validation errors:', fieldErrors);
          }
        } else {
          // ✅ Better error message for username conflicts
          const errorMessage = result.message || result.error || 'Failed to create user';
          console.error('❌ Create user failed:', errorMessage);
          if (errorMessage.includes('already exists')) {
            setCreateUserErrors({ 
              username: '❌ This username is already taken. Please try a different one.',
              submit: errorMessage 
            });
          } else {
            setCreateUserErrors({ submit: errorMessage });
          }
        }
      } else if (response.ok === false || (response.status && response.status >= 400)) {
        // HTTP error status
        console.error('❌ [CreateUser] API response not OK:', response.status, result);
        const errorMessage = result?.message || result?.error || `HTTP ${response.status}: Failed to create user`;
        setCreateUserErrors({ submit: errorMessage });
      } else {
        // Unknown error
        console.error('❌ [CreateUser] Unknown error:', { response, result });
        setCreateUserErrors({ submit: 'An unexpected error occurred. Please try again.' });
      }
    } catch (error) {

      setCreateUserErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Handle view user details - Open modal instead of navigate
  const handleViewUser = (user) => {

    setViewUserData(user);
    setShowViewUserModal(true);
  };

  // Close view user modal
  const closeViewUserModal = () => {
    setShowViewUserModal(false);
    setViewUserData(null);
  };

  // Handle edit user - Open modal instead of navigate
  const handleEditUser = (user) => {
    setEditUserData({
      userId: user._id,
      username: user.username,
      email: user.email,
      fullName: user.fullName || '',
      phoneNumber: user.phoneNumber || '',
      pin: user.pin || '', // Include existing PIN
      role: typeof user.role === 'object' ? user.role._id : user.role,
      password: '',
      confirmPassword: ''
    });
    setEditUserErrors({});
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
    setShowEditUserModal(true);
  };

  // Close edit user modal
  const closeEditUserModal = () => {
    setShowEditUserModal(false);
    setEditUserData({
      userId: '',
      username: '',
      email: '',
      fullName: '',
      phoneNumber: '',
      pin: '',
      role: '',
      password: '',
      confirmPassword: ''
    });
    setEditUserErrors({});
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
  };

  // Handle update user - Show confirmation modal
  const handleUpdateUser = () => {
    // Validate fields
    const errors = {};
    if (!editUserData.fullName?.trim()) errors.fullName = 'Full name is required';
    if (!editUserData.email?.trim()) errors.email = 'Email is required';
    if (!editUserData.phoneNumber?.trim()) {
      errors.phoneNumber = 'Phone number is required';
    } else {
      // ✅ Validate phone number: exactly 10 digits
      const phoneDigits = editUserData.phoneNumber.replace(/\D/g, ''); // Remove non-digits
      if (phoneDigits.length !== 10) {
        errors.phoneNumber = 'Phone number must be exactly 10 digits';
      }
    }
    
    // Validate PIN: exactly 4 digits
    if (!editUserData.pin?.trim()) {
      errors.pin = 'PIN is required';
    } else {
      const pinDigits = editUserData.pin.replace(/\D/g, ''); // Remove non-digits
      if (pinDigits.length !== 4) {
        errors.pin = 'PIN must be exactly 4 digits';
      } else if (!/^\d{4}$/.test(editUserData.pin)) {
        errors.pin = 'PIN must contain only numbers';
      }
    }
    
    if (!editUserData.role) errors.role = 'Role is required';
    
    // Validate password if provided
    if (editUserData.password) {
      if (editUserData.password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }
      if (editUserData.password !== editUserData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditUserErrors(errors);
      return;
    }

    // Show confirmation modal
    setEditConfirmModal({ show: true, userData: editUserData });
  };

  // Confirm update user
  const confirmUpdateUser = async () => {
    try {
      setLoadingUsers(true);
      
      // Prepare update data
      const updateData = {
        theaterId: theaterId,
        fullName: editUserData.fullName,
        email: editUserData.email,
        phoneNumber: editUserData.phoneNumber,
        pin: editUserData.pin, // Include PIN
        role: editUserData.role
      };
      
      // Only include password if provided
      if (editUserData.password) {
        updateData.password = editUserData.password;
      }

      const response = await unifiedFetch(`${config.api.baseUrl}/theater-users/${editUserData.userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(updateData)
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });

      const result = await response.json();
      
      if (response.ok && result.success) {

        setEditConfirmModal({ show: false, userData: null });
        closeEditUserModal();
        // 🔄 FORCE REFRESH: Refresh with cache bypass after update
        await fetchUsers(true);
        // Show success modal instead of alert
        setSuccessModal({ show: true, message: 'User updated successfully!' });
      } else {

        if (result.errors && Array.isArray(result.errors)) {
          const fieldErrors = {};
          result.errors.forEach(error => {
            if (error.path || error.param) {
              fieldErrors[error.path || error.param] = error.msg || error.message;
            }
          });
          setEditUserErrors(Object.keys(fieldErrors).length > 0 ? fieldErrors : { submit: result.message });
        } else {
          setEditUserErrors({ submit: result.message || 'Failed to update user' });
        }
      }
    } catch (error) {

      setEditUserErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Handle delete user - Show confirmation modal
  const handleDeleteUser = (user) => {
    setDeleteConfirmModal({
      show: true,
      userId: user._id,
      userName: user.username || user.fullName || 'this user'
    });
  };

  // Confirm delete user
  const confirmDeleteUser = async () => {
    const userId = deleteConfirmModal.userId;
    
    try {
      setLoadingUsers(true);
      // ✅ FIX: Permanent delete by default (removes from array)
      // Pass theaterId as query parameter (same as roles implementation)
      const params = new URLSearchParams({
        theaterId: theaterId
        // permanent defaults to true (permanent deletion)
      });
      
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-users/${userId}?${params.toString()}`, {
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
      if (result.success) {

        setDeleteConfirmModal({ show: false, userId: null, userName: '' });
        // 🔄 FORCE REFRESH: Refresh with cache bypass after delete
        await fetchUsers(true);
        // Show success modal instead of alert
        setSuccessModal({ show: true, message: 'User deleted successfully!' });
      } else {
        alert('Failed to delete user: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {

      alert('Failed to delete user. Please try again.');
    } finally {
      setLoadingUsers(false);
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
        alert('Failed to update status: ' + result.message);
      } else {
  }
    } catch (error) {

      // Revert on error
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === userId ? { ...user, isActive: currentStatus } : user
        )
      );
      alert('Failed to update status. Please try again.');
    }
  };

  // Load data on component mount - OPTIMIZED: Parallel loading with cache-first rendering
  useEffect(() => {
    if (!theaterId) return;
    
    // Clear any old generic cache that might interfere
    try {
      sessionStorage.removeItem('theater-roles-cache'); // Remove old generic cache
    } catch (error) {
      // Ignore cache clear errors
    }
    
    // 🚀 OPTIMIZATION: Load all data in parallel
    // 🔄 FORCE REFRESH: Always force refresh on component mount to ensure fresh data
    // If cache exists, data is already set in state initialization, so this will refresh in background
    Promise.allSettled([
      fetchTheater(),
      fetchAvailableRoles(),
      fetchUsers(true)
    ]).then(() => {
      // All data loaded (from cache or API)
      setLoading(false);
    });
  }, [theaterId, fetchTheater, fetchAvailableRoles, fetchUsers]);

  // ✅ Auto-select first role when tabRoles loads
  useEffect(() => {
    if (tabRoles.length > 0 && !selectedRole) {

      setSelectedRole(tabRoles[0]);
    }
  }, [tabRoles, selectedRole]);

  // Error state
  if (error) {
    return (
      <ErrorBoundary>
        <AdminLayout pageTitle="Theater User Management" currentPage="theater-users">
          <div className="theater-user-details-page">
          <PageContainer title="Error">
            <div className="error-container-center">
              <p className="error-text-red">{error}</p>
              <Button variant="primary" onClick={() => navigate('/theater-users')}>
                ← Back to Theaters
              </Button>
            </div>
          </PageContainer>
          </div>
        </AdminLayout>
      </ErrorBoundary>
    );
  }

  // Loading state with progress indicator - Only show if theater data is not available
  // 🚀 OPTIMIZED: Show page immediately if we have theater data (even if still loading users/roles)
  if (loading && !theater) {
    return (
      <ErrorBoundary>
        <AdminLayout pageTitle="Theater User Management" currentPage="theater-users">
          <div className="theater-user-details-page">
          <PageContainer title="Loading Theater...">
            <div className="error-container-center">
              <div className="loading-icon-large">⏳</div>
              <p className="loading-text-large">Loading theater details...</p>
              <p className="loading-text-gray">This should only take a few seconds</p>
              {rolesLoading && (
                <p className="loading-text-purple">
                  🔄 Loading roles from Role Management...
                </p>
              )}
            </div>
          </PageContainer>
          </div>
        </AdminLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Theater User Management" currentPage="theater-users">
        <div className="theater-user-details-page">
        <PageContainer
          hasHeader={false}
          className="theater-user-management-vertical"
        >
          {/* Global Vertical Header Component */}
          <VerticalPageHeader
            title={theater?.name || 'Theater Management'}
            backButtonText="Back to Theater List"
            backButtonPath="/theater-users"
            actionButton={
              <button 
                className="header-btn"
                onClick={() => {
                  setShowCreateUserForm(true);
                  setCreateUserErrors({}); // Clear any previous errors
                  // Auto-populate username with theater's uniqueNumber
                  setCreateUserData(prev => ({
                    ...prev,
                    username: theater?.uniqueNumber || ''
                  }));
                }}
              >
                <span className="btn-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </span>
                Create New User
              </button>
            }
          />
          <div className="theater-user-settings-container">
            {/* Settings Tabs - EXACTLY like Settings page */}
            <div className="theater-user-settings-tabs" key={`tabs-${forceRender}`}>
              {tabRoles.length > 0 && tabRoles
                .filter(role => {
                  // ✅ CRITICAL: Check role exists first before accessing properties
                  if (!role) {

                    return false;
                  }
                  if (!role.id) {

                    return false;
                  }
                  if (!role.name) {

                    return false;
                  }
                  return true;
                })
                .map((role, index) => (
                <button
                  key={`${role.id}-${forceRender}`}
                  className={`theater-user-settings-tab ${selectedRole?.id === role.id ? 'active' : ''}`}
                  onClick={() => setSelectedRole(role)}
                >
                  <span className="theater-user-tab-icon">{role.icon || '👤'}</span>
                  {role.name}
                </button>
              ))}
            </div>

            {/* Settings Content - EXACTLY like Settings page */}
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
                    <div className="theater-table-container">
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
                                  <label className={`switch toggle-switch-user`}>
                                    <input
                                      type="checkbox"
                                      checked={user.isActive}
                                      onChange={() => toggleUserStatus(user._id, user.isActive)}
                                      className="toggle-input-user"
                                    />
                                    <span className={`slider toggle-slider-user ${user.isActive ? 'active' : ''}`}>
                                    </span>
                                  </label>
                                </div>
                              </td>
                              <td className="status-cell">
                                <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                  {user.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="actions-cell">
                                <div className="action-buttons">
                                  <ActionButton 
                                    type="view"
                                    onClick={() => handleViewUser(user)}
                                    title="View user details"
                                  />
                                  <ActionButton 
                                    type="edit"
                                    onClick={() => handleEditUser(user)}
                                    title="Edit user"
                                  />
                                  <ActionButton 
                                    type="delete"
                                    onClick={() => handleDeleteUser(user)}
                                    title="Delete user"
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="theater-user-empty-state">
                      <div className="theater-user-empty-state-icon">👤</div>
                      <h4>No users found</h4>
                      <p>No users found with {selectedRole.name} role for this theater.</p>
                      <p className="helper-text-gray">
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

          {/* Create User Modal - Using Global Design System */}
          {showCreateUserForm && (
            <div className="modal-overlay" onClick={(e) => {
              // Only close if clicking directly on the overlay (not on select dropdowns or modal content)
              if (e.target.classList.contains('modal-overlay')) {
                closeCreateUserModal();
              }
            }}>
              <div className="modal-content theater-user-create-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Create New User</h2>
                  <button 
                    className="close-btn"
                    onClick={closeCreateUserModal}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
                
                <div className="modal-body">
                  <div className="edit-form">
                      <div className="form-group">
                        <label>Theater</label>
                        <input 
                          type="text"
                          value={theater?.name || (loading ? 'Loading theater...' : 'Theater information unavailable')}
                          readOnly
                        className={`form-control ${theater?.name ? 'input-disabled-bold' : 'input-disabled-gray'}`}
                      />
                      {theater?.name && theater?.address && (
                        <div className="helper-text-small">
                          📍 {theater.address?.city || 'Unknown City'}, {theater.address?.state || 'Unknown State'}
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Username *</label>
                      <div className="position-relative">
                        <input
                          type="text"
                          value={createUserData.username}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            const theaterPrefix = theater?.uniqueNumber || '';
                            
                            // Ensure the value always starts with theater's uniqueNumber
                            if (theaterPrefix && !newValue.startsWith(theaterPrefix)) {
                              // If user tries to delete the prefix, restore it
                              setCreateUserData(prev => ({ ...prev, username: theaterPrefix }));
                            } else {
                              // Allow adding text after the prefix
                              setCreateUserData(prev => ({ ...prev, username: newValue }));
                            }
                          }}
                          placeholder={theater?.uniqueNumber ? `${theater.uniqueNumber}` : "Enter unique username"}
                          className={`form-control ${theater?.uniqueNumber ? 'input-padding-left' : ''}`}
                          autoComplete="off"
                        />
                        {theater?.uniqueNumber && (
                          <div className={`prefix-overlay ${createUserData.username.startsWith(theater.uniqueNumber) ? 'hidden' : ''}`}>
                            {theater.uniqueNumber}
                          </div>
                        )}
                      </div>
                      {createUserErrors.username && (
                        <div className="error-message">{createUserErrors.username}</div>
                      )}
                      {theater?.uniqueNumber && (
                        <div className="helper-text-small-green">
                          🎯 Theater ID: <strong>{theater.uniqueNumber}</strong> (locked as prefix, you can add text after it)
                        </div>
                      )}
                      {users.length > 0 && (
                      <div className="helper-text-small">
                        💡 Existing usernames: {users.slice(0, 5).map(u => u.username).join(', ')}
                        {users.length > 5 && ` and ${users.length - 5} more...`}
                      </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Full Name *</label>
                      <input
                        type="text"
                        value={createUserData.fullName}
                        onChange={(e) => setCreateUserData(prev => ({ ...prev, fullName: e.target.value }))}
                        placeholder="Enter full name"
                        className="form-control"
                      />
                      {createUserErrors.fullName && (
                        <div className="error-message">{createUserErrors.fullName}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        value={createUserData.email}
                        onChange={(e) => setCreateUserData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter email address"
                        className="form-control"
                        autoComplete="off"
                      />
                      {createUserErrors.email && (
                        <div className="error-message">{createUserErrors.email}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        value={createUserData.phoneNumber}
                        onChange={(e) => {
                          // ✅ Only allow digits and limit to reasonable length
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                          setCreateUserData(prev => ({ ...prev, phoneNumber: value }));
                        }}
                        placeholder="Enter 10 digit phone number"
                        className="form-control"
                        maxLength="10"
                      />
                      {createUserErrors.phoneNumber && (
                        <div className="error-message">{createUserErrors.phoneNumber}</div>
                      )}
                      <div className="helper-text-small">
                        💡 Enter exactly 10 digits (e.g., 1234567890)
                      </div>
                    </div>

                    <div className="form-group">
                      <label>PIN *</label>
                      <input
                        type="text"
                        value={createUserData.pin}
                        onChange={(e) => {
                          // ✅ Only allow digits and limit to 4
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                          setCreateUserData(prev => ({ ...prev, pin: value }));
                        }}
                        placeholder="Enter 4 digit PIN"
                        className="form-control input-pin"
                        maxLength="4"
                      />
                      {createUserErrors.pin && (
                        <div className="error-message">{createUserErrors.pin}</div>
                      )}
                      <div className="helper-text-small">
                        🔐 4-digit PIN for theater user login
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Password *</label>
                      <div className="position-relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={createUserData.password}
                          onChange={(e) => setCreateUserData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Enter password"
                          className="form-control input-padding-right"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="password-toggle-btn"
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
                      {createUserErrors.password && (
                        <div className="error-message">{createUserErrors.password}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Confirm Password *</label>
                      <div className="position-relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={createUserData.confirmPassword}
                          onChange={(e) => setCreateUserData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          placeholder="Confirm password"
                          className="form-control input-padding-right"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="password-toggle-btn"
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
                      {createUserErrors.confirmPassword && (
                        <div className="error-message">{createUserErrors.confirmPassword}</div>
                      )}
                      {!createUserErrors.confirmPassword && createUserData.password && createUserData.confirmPassword && createUserData.password === createUserData.confirmPassword && (
                        <div className="success-message">
                          <span className="success-message-icon">✓</span>
                          Passwords match
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Role *</label>
                      <select
                        value={createUserData.role}
                        onChange={(e) => {
                          setCreateUserData(prev => ({ ...prev, role: e.target.value }));
                        }}
                        className="form-control"
                        disabled={rolesLoading}
                      >
                        <option value="">
                          {rolesLoading ? 'Loading roles...' : 'Select Role'}
                        </option>
                        {availableRoles.map((role, index) => (
                          <option key={role._id || role.id || index} value={role._id || role.id}>
                            {role.name || role.roleName || 'Unknown Role'}
                          </option>
                        ))}
                      </select>
                      {createUserErrors.role && (
                        <div className="error-message">{createUserErrors.role}</div>
                      )}
                      {rolesLoading && (
                        <div className="helper-text-small">
                          🔄 Loading dynamic roles from Role Management API...
                        </div>
                      )}
                      {!rolesLoading && availableRoles.length > 0 && (
                        <div className="helper-text-small-success">
                          ✅ {availableRoles.length} dynamic role(s) loaded from Role Management API
                        </div>
                      )}
                      {!rolesLoading && availableRoles.length === 0 && (
                        <div className="helper-text-small-error">
                          ❌ No roles found. Please create roles in Role Management first.
                        </div>
                      )}
                    </div>
                  </div>

                  {createUserErrors.submit && (
                    <div className="error-message error-message-center">
                      {createUserErrors.submit}
                    </div>
                  )}
                </div>
                
                <div className="modal-actions">
                  <button 
                    type="button"
                    className="cancel-btn" 
                    onClick={closeCreateUserModal}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="btn-primary"
                    onClick={handleCreateUser}
                    disabled={loadingUsers}
                  >
                    {loadingUsers ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View User Modal */}
          {showViewUserModal && viewUserData && (
            <div className="modal-overlay" onClick={(e) => {
              // Only close if clicking directly on the overlay (not on modal content)
              if (e.target.classList.contains('modal-overlay')) {
                closeViewUserModal();
              }
            }}>
              <div className="modal-content theater-user-view-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>👤 View User Details</h2>
                  <button 
                    className="close-btn" 
                    onClick={closeViewUserModal}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
                
                <div className="modal-body">
                  <div className="edit-form">
                    <div className="form-group">
                      <label>Theater</label>
                      <input 
                        type="text"
                        value={theater?.name || 'Loading...'}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>

                    <div className="form-group">
                      <label>Username</label>
                      <input
                        type="text"
                        value={viewUserData.username}
                        readOnly
                        className="form-control input-disabled"
                      />
                      {theater?.uniqueNumber && (
                        <div className="helper-text-small-green">
                          🎯 Theater ID: <strong>{theater.uniqueNumber}</strong>
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={viewUserData.fullName || 'N/A'}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>

                    <div className="form-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        value={viewUserData.email}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>

                    <div className="form-group">
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        value={viewUserData.phoneNumber || 'N/A'}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>

                    <div className="form-group">
                      <label>Role</label>
                      <input
                        type="text"
                        value={(() => {
                          const roleId = viewUserData.role;
                          const role = availableRoles.find(r => (r._id || r.id) === roleId);
                          return role ? (role.name || role.roleName) : 'N/A';
                        })()}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>

                    <div className="form-group">
                      <label>Status</label>
                      <input
                        type="text"
                        value={viewUserData.isActive ? '✅ Active' : '❌ Inactive'}
                        readOnly
                        className={`form-control ${viewUserData.isActive ? 'input-disabled-success' : 'input-disabled-error'}`}
                      />
                    </div>

                    {viewUserData.pin && (
                      <div className="form-group">
                        <label>PIN / Credentials</label>
                        <input
                          type="text"
                          value={viewUserData.pin}
                          readOnly
                          className="form-control input-disabled-warning"
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label>Last Login</label>
                      <input
                        type="text"
                        value={viewUserData.lastLogin ? new Date(viewUserData.lastLogin).toLocaleString() : 'Never'}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="modal-actions">
                  <button 
                    className="cancel-btn" 
                    onClick={closeViewUserModal}
                  >
                    Close
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={() => {
                      closeViewUserModal();
                      handleEditUser(viewUserData);
                    }}
                  >
                    Edit User
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit User Modal */}
          {showEditUserModal && (
            <div className="modal-overlay" onClick={(e) => {
              // Only close if clicking directly on the overlay (not on select dropdowns or modal content)
              if (e.target.classList.contains('modal-overlay')) {
                closeEditUserModal();
              }
            }}>
              <div className="modal-content theater-user-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>✏️ Edit User</h2>
                  <button 
                    className="close-btn" 
                    onClick={closeEditUserModal}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
                
                <div className="modal-body">
                  <div className="edit-form">
                    <div className="form-group">
                      <label>Theater</label>
                      <input 
                        type="text"
                        value={theater?.name || 'Loading...'}
                        readOnly
                        className="form-control input-disabled"
                      />
                    </div>

                    <div className="form-group">
                      <label>Username</label>
                      <input
                        type="text"
                        value={editUserData.username}
                        readOnly
                        className="form-control input-disabled"
                        title="Username cannot be changed"
                      />
                      <div className="helper-text-small">
                        ⚠️ Username cannot be changed
                      </div>
                      {theater?.uniqueNumber && (
                        <div className="helper-text-small-green">
                          🎯 Theater ID: <strong>{theater.uniqueNumber}</strong>
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Full Name *</label>
                      <input
                        type="text"
                        value={editUserData.fullName}
                        onChange={(e) => setEditUserData(prev => ({ ...prev, fullName: e.target.value }))}
                        placeholder="Enter full name"
                        className="form-control"
                      />
                      {editUserErrors.fullName && (
                        <div className="error-message">{editUserErrors.fullName}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        value={editUserData.email}
                        onChange={(e) => setEditUserData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter email address"
                        className="form-control"
                        autoComplete="off"
                      />
                      {editUserErrors.email && (
                        <div className="error-message">{editUserErrors.email}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        value={editUserData.phoneNumber}
                        onChange={(e) => {
                          // ✅ Only allow digits and limit to reasonable length
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                          setEditUserData(prev => ({ ...prev, phoneNumber: value }));
                        }}
                        placeholder="Enter 10 digit phone number"
                        className="form-control"
                        maxLength="10"
                      />
                      {editUserErrors.phoneNumber && (
                        <div className="error-message">{editUserErrors.phoneNumber}</div>
                      )}
                      <div className="helper-text-small">
                        💡 Enter exactly 10 digits (e.g., 1234567890)
                      </div>
                    </div>

                    <div className="form-group">
                      <label>PIN *</label>
                      <input
                        type="text"
                        value={editUserData.pin}
                        onChange={(e) => {
                          // ✅ Only allow digits and limit to 4
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                          setEditUserData(prev => ({ ...prev, pin: value }));
                        }}
                        placeholder="Enter 4 digit PIN"
                        className="form-control input-pin"
                        maxLength="4"
                      />
                      {editUserErrors.pin && (
                        <div className="error-message">{editUserErrors.pin}</div>
                      )}
                      <div className="helper-text-small">
                        🔐 4-digit PIN for theater user login
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Role *</label>
                      <select
                        value={editUserData.role}
                        onChange={(e) => {
                          setEditUserData(prev => ({ ...prev, role: e.target.value }));
                        }}
                        className="form-control"
                        disabled={rolesLoading}
                      >
                        <option value="">
                          {rolesLoading ? 'Loading roles...' : 'Select Role'}
                        </option>
                        {availableRoles.map((role, index) => (
                          <option key={role._id || role.id || index} value={role._id || role.id}>
                            {role.name || role.roleName || 'Unknown Role'}
                          </option>
                        ))}
                      </select>
                      {editUserErrors.role && (
                        <div className="error-message">{editUserErrors.role}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>New Password (optional)</label>
                      <div className="position-relative">
                        <input
                          type={showEditPassword ? 'text' : 'password'}
                          value={editUserData.password}
                          onChange={(e) => setEditUserData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Leave blank to keep current password"
                          className="form-control input-padding-right"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditPassword(!showEditPassword)}
                          className="password-toggle-btn"
                        >
                          {showEditPassword ? (
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
                      {editUserErrors.password && (
                        <div className="error-message">{editUserErrors.password}</div>
                      )}
                      <div className="helper-text-small">
                        💡 Leave blank to keep the current password
                      </div>
                    </div>

                    {editUserData.password && (
                      <div className="form-group">
                        <label>Confirm New Password *</label>
                        <div className="position-relative">
                          <input
                            type={showEditConfirmPassword ? 'text' : 'password'}
                            value={editUserData.confirmPassword}
                            onChange={(e) => setEditUserData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            placeholder="Confirm new password"
                            className="form-control input-padding-right"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
                            className="password-toggle-btn"
                          >
                            {showEditConfirmPassword ? (
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
                        {editUserErrors.confirmPassword && (
                          <div className="error-message">{editUserErrors.confirmPassword}</div>
                        )}
                        {!editUserErrors.confirmPassword && editUserData.password && editUserData.confirmPassword && editUserData.password === editUserData.confirmPassword && (
                          <div className="success-message">
                            <span className="success-message-icon">✓</span>
                            Passwords match
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {editUserErrors.submit && (
                    <div className="error-message error-message-center">
                      {editUserErrors.submit}
                    </div>
                  )}
                </div>
                
                <div className="modal-actions">
                  <button 
                    type="button"
                    className="cancel-btn" 
                    onClick={closeEditUserModal}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="btn-primary"
                    onClick={handleUpdateUser}
                    disabled={loadingUsers}
                  >
                    {loadingUsers ? 'Updating...' : 'Update User'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal - Global Design Pattern */}
          {deleteConfirmModal.show && (
            <div className="modal-overlay">
              <div className="delete-modal">
                <div className="modal-header">
                  <h3>Confirm Deletion</h3>
                </div>
                <div className="modal-body">
                  <p>Are you sure you want to permanently delete user <strong>{deleteConfirmModal.userName}</strong>?</p>
                  <p className="warning-text">⚠️ This action cannot be undone.</p>
                </div>
                <div className="modal-actions">
                  <button 
                    onClick={() => setDeleteConfirmModal({ show: false, userId: null, userName: '' })}
                    className="cancel-btn"
                    disabled={loadingUsers}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmDeleteUser}
                    className="confirm-delete-btn"
                    disabled={loadingUsers}
                  >
                    {loadingUsers ? 'Deleting...' : 'Delete User'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create User Confirmation Modal - Global Design Pattern */}
          {createConfirmModal.show && (
            <div className="modal-overlay">
              <div className="delete-modal">
                <div className="modal-header">
                  <h3>Confirm User Creation</h3>
                </div>
                <div className="modal-body">
                  <p>Are you sure you want to create a new user with the following details?</p>
                  <div className="info-box">
                    <p><strong>Username:</strong> {createConfirmModal.userData?.username}</p>
                    <p><strong>Full Name:</strong> {createConfirmModal.userData?.fullName}</p>
                    <p><strong>Email:</strong> {createConfirmModal.userData?.email}</p>
                    <p><strong>Phone:</strong> {createConfirmModal.userData?.phoneNumber}</p>
                    <p><strong>Role:</strong> {availableRoles.find(r => r._id === createConfirmModal.userData?.role)?.name || 'N/A'}</p>
                  </div>
                </div>
                <div className="modal-actions">
                  <button 
                    onClick={() => setCreateConfirmModal({ show: false, userData: null })}
                    className="cancel-btn"
                    disabled={loadingUsers}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmCreateUser}
                    className="confirm-delete-btn"
                    disabled={loadingUsers}
                  >
                    {loadingUsers ? 'Creating...' : 'Confirm Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit User Confirmation Modal - Global Design Pattern */}
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
              <div className="delete-modal modal-success">
                <div className="modal-header modal-header-success">
                  <h3>✓ Success</h3>
                </div>
                <div className="modal-body modal-body-center">
                  <div className="modal-success-icon">✓</div>
                  <p className="modal-success-text">{successModal.message}</p>
                </div>
                <div className="modal-actions modal-actions-center">
                  <button 
                    onClick={() => setSuccessModal({ show: false, message: '' })}
                    className="confirm-delete-btn btn-min-width"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </PageContainer>
        </div>
      </AdminLayout>

      {/* Custom Modal Width Styling */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .theater-user-view-modal-content,
          .theater-user-edit-modal-content,
          .theater-user-create-modal-content {
            max-width: 900px !important;
            width: 85% !important;
          }

          @media (max-width: 768px) {
            .theater-user-view-modal-content,
            .theater-user-edit-modal-content,
            .theater-user-create-modal-content {
              width: 95% !important;
              max-width: none !important;
            }
          }
        `
      }} />
    </ErrorBoundary>
  );
}

export default TheaterUserDetails;

// ✅ Additional inline styles for classic table and no vertical scroll
const style = document.createElement('style');
style.textContent = `
  /* Remove vertical scrolling from main container */
  .theater-user-details-page {
    overflow-y: visible !important;
    max-height: none !important;
    height: auto !important;
  }

  .theater-user-settings-container {
    overflow-y: visible !important;
    max-height: none !important;
    height: auto !important;
  }

  .theater-user-settings-content {
    overflow-y: visible !important;
    max-height: none !important;
    height: auto !important;
  }

  /* ============================================
     COMPREHENSIVE TABLE RESPONSIVE DESIGN
     ============================================ */
  
  /* Table base styling */
  .theater-user-settings-content .theater-table {
    width: 100%;
    min-width: 800px;
    border-collapse: collapse;
    font-size: 0.9rem;
    background: white;
    table-layout: auto !important;
    border: 1px solid #d1d5db;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Table header styling */
  .theater-user-settings-content .theater-table thead {
    background: linear-gradient(135deg, #6B0E9B 0%, #8B2FB8 100%);
    box-shadow: 0 2px 4px rgba(107, 14, 155, 0.1);
    color: white;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .theater-user-settings-content .theater-table thead tr {
    border-bottom: 2px solid #5A0C82;
  }

  .theater-user-settings-content .theater-table th {
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

  /* Actions cell styling */
  .theater-user-settings-content .theater-table .actions-cell {
    text-align: center;
  }

  /* Enhanced action buttons styling */
  .theater-user-settings-content .action-buttons {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: center;
    flex-wrap: nowrap;
  }

  /* Status badge styling */
  .theater-user-settings-content .status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .theater-user-settings-content .status-badge.active {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .theater-user-settings-content .status-badge.inactive {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  /* Table container improvements */
  .theater-table-container {
    overflow-x: auto;
    overflow-y: visible;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    margin-bottom: 20px;
  }

  /* Table wrapper improvements */
  .theater-user-settings-content .table-wrapper {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  /* S.No column styling */
  .sno-cell {
    text-align: center;
    font-weight: 600;
    color: #6b7280;
  }

  .sno-number {
    display: inline-block;
    width: 32px;
    height: 32px;
    line-height: 32px;
    background: #f3f4f6;
    border-radius: 50%;
    font-size: 0.875rem;
  }

  /* Username cell styling */
  .username-text {
    font-weight: 600;
    color: #111827;
  }

  /* Email cell styling */
  .email-text {
    color: #6b7280;
    font-size: 0.875rem;
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
    
    .theater-user-settings-content .theater-table th {
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
    
    .theater-user-settings-content .theater-table .action-buttons {
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
    
    .theater-user-settings-content .theater-table th {
      padding: 10px 6px;
      font-size: 0.7rem;
    }
    
    .theater-user-settings-content .theater-table td {
      padding: 8px 6px;
    }
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(style);
}