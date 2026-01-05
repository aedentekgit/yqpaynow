import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import Pagination from '@components/Pagination';
import ErrorBoundary from '@components/ErrorBoundary';
import ImageUpload from '@components/common/ImageUpload';
import InstantImage from '@components/InstantImage';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getCachedData, setCachedData, clearCachePattern } from '@utils/cacheUtils';
import { invalidateRelatedCaches } from '@utils/crudOptimizer';
import { clearPendingRequests } from '@utils/apiOptimizer';
import config from '@config';
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/TheaterGlobalModals.css'; // ✅ FIX: Import global modal styles for form grid layout
import '@styles/pages/theater/TheaterKioskTypes.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



const TheaterKioskTypes = React.memo(() => {
  const { theaterId } = useParams();
  const location = useLocation();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal()
  const toast = useToast();;

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterKioskTypes');

  // Data state
  const [kioskTypes, setKioskTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const lastLoadKeyRef = useRef('');
  const [summary, setSummary] = useState({
    activeKioskTypes: 0,
    inactiveKioskTypes: 0,
    totalKioskTypes: 0
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedKioskType, setSelectedKioskType] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    image: null,
    removeImage: false
  });

  // Image upload states
  const [imageFile, setImageFile] = useState(null);
  const [imageError, setImageError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Refs for cleanup and performance
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadKioskTypesDataRef = useRef(null); // Ref to store loadKioskTypesData function

  // Ensure mounted ref is set on component mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 🚀 ULTRA-OPTIMIZED: Load kiosk types data - <90ms with instant cache
  const loadKioskTypesData = useCallback(async (page = 1, limit = 10, search = '', skipCache = false, forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) {
      return;
    }

    // 🚀 INSTANT CACHE CHECK - Load from cache first (< 90ms)
    // Skip cache if force refresh is requested or skipCache is true
    if (!skipCache && !forceRefresh && page === 1 && !search) {
      const cacheKey = `theater_kiosk_types_${theaterId}`;
      const cached = getCachedData(cacheKey, 30000); // 30-second cache for immediate updates

      // ✅ FIX: Handle both cache structures:
      // 1. TheaterKioskTypes structure: { data: [...], pagination: {...}, statistics: {...} }
      // 2. unifiedFetch structure: { success: true, data: { kioskTypes: [...], pagination: {...}, statistics: {...} } }
      if (cached && isMountedRef.current) {
        let cachedKioskTypes = [];
        let cachedPagination = {};
        let cachedStatistics = {};

        // Check for TheaterKioskTypes cache structure (data is array)
        if (cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
          cachedKioskTypes = cached.data;
          cachedPagination = cached.pagination || {};
          cachedStatistics = cached.statistics || {};
        }
        // Check for unifiedFetch cache structure (data.data.kioskTypes or data.data is array)
        else if (cached.data) {
          // Handle unifiedFetch structure: { success: true, data: { kioskTypes: [...], ... } }
          if (Array.isArray(cached.data.kioskTypes) && cached.data.kioskTypes.length > 0) {
            cachedKioskTypes = cached.data.kioskTypes;
            cachedPagination = cached.data.pagination || {};
            cachedStatistics = cached.data.statistics || {};
          }
          // Handle case where data.data is directly an array
          else if (Array.isArray(cached.data) && cached.data.length > 0) {
            cachedKioskTypes = cached.data;
            cachedPagination = cached.pagination || {};
            cachedStatistics = cached.statistics || {};
          }
        }
        // Check if kioskTypes is at root level
        else if (Array.isArray(cached.kioskTypes) && cached.kioskTypes.length > 0) {
          cachedKioskTypes = cached.kioskTypes;
          cachedPagination = cached.pagination || {};
          cachedStatistics = cached.statistics || {};
        }

        // Only use cache if we found valid kiosk types
        if (cachedKioskTypes.length > 0) {
          // Ensure cachedKioskTypes is an array
          if (!Array.isArray(cachedKioskTypes)) {
            cachedKioskTypes = [];
          }

          // 🚀 ULTRA-FAST: Minimal processing for cache (< 90ms)
          // Only process if needed (data might already be processed)
          if (cachedKioskTypes.length > 0 && !cachedKioskTypes[0].imageUrl) {
            cachedKioskTypes = cachedKioskTypes.map(kt => ({
              ...kt,
              imageUrl: kt.imageUrl || kt.image
            }));
          }

          // Instant state update from cache (< 90ms) - Single batch update
          setKioskTypes(cachedKioskTypes);
          setTotalItems(cachedPagination.totalItems || 0);
          setTotalPages(cachedPagination.totalPages || 1);
          setCurrentPage(1);
          setSummary({
            activeKioskTypes: cachedStatistics.active || 0,
            inactiveKioskTypes: cachedStatistics.inactive || 0,
            totalKioskTypes: cachedStatistics.total || 0
          });
          setLoading(false);

          // Fetch fresh data in background (non-blocking) - Update cache silently
          // Use skipCache=true to bypass cache and force API fetch
          if (isMountedRef.current && loadKioskTypesDataRef.current) {
            loadKioskTypesDataRef.current(1, limit, '', true, false);
          }
          return;
        }
        // ✅ FIX: If cache exists but structure doesn't match or is empty, proceed to API fetch
      }
      // ✅ FIX: If no cache or cache is empty, proceed to API fetch
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // ✅ FIX: Always set loading when fetching from API (skipCache=true means we're fetching from API)
      // Only skip setting loading if we're using cache (skipCache=false and cache exists)
      if (skipCache || forceRefresh || !getCachedData(`theater_kiosk_types_${theaterId}`, 30000)) {
        setLoading(true);
      }

      console.log('🔄 Fetching kiosk types from API:', {
        theaterId,
        page,
        limit,
        search,
        skipCache,
        forceRefresh
      });

      const params = new URLSearchParams({
        page: page,
        limit: limit,
        search: search || '',
        _t: Date.now()
      });

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      const authToken = localStorage.getItem('authToken');
      if (!authToken) {
        throw new Error('No authentication token found');
      }

      const baseUrl = `${config.api.baseUrl}/theater-kiosk-types/${theaterId}?${params}`;

      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      } else {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      const response = await unifiedFetch(baseUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        signal: abortControllerRef.current.signal
      }, {
        // ✅ FIX: Include pagination and search in cache key to avoid returning page 1 data for other pages
        cacheKey: `theater_kiosk_types_${theaterId}_p${page}_l${limit}_s${search}`,
        cacheTTL: 30000, // 30 seconds for immediate updates
        forceRefresh: forceRefresh || skipCache // ✅ FIX: Pass forceRefresh to unifiedFetch to bypass cache when needed
      });

      // Parse response - unifiedFetch returns data in json() method
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response from server');
      }

      // Check for errors in data structure (don't rely on response.ok which may be undefined)
      if (data.error || (data.success === false)) {
        const errorMsg = data.message || data.error || 'Failed to load kiosk types';
        console.error('API error response:', errorMsg, data);
        throw new Error(errorMsg);
      }

      if (!isMountedRef.current) return;

      // Success if data.success is true OR we have data (data.success can be undefined)
      // Also handle case where data.data exists but might be empty
      console.log('📦 Raw API response:', {
        success: data.success,
        hasData: !!data.data,
        hasKioskTypes: !!data.kioskTypes,
        hasDataKioskTypes: !!data.data?.kioskTypes,
        dataStructure: Object.keys(data),
        dataDataKeys: data.data ? Object.keys(data.data) : [],
        kioskTypesCount: data.data?.kioskTypes?.length ?? 'N/A'
      });

      // ✅ FIX: Handle response even if kioskTypes array is empty (valid response)
      // Check if response structure is valid (success !== false and has data structure)
      const hasValidResponse = data.success !== false && (
        data.success === true ||
        data.data !== undefined ||
        data.kioskTypes !== undefined
      );

      if (hasValidResponse && isMountedRef.current) {
        // Handle multiple possible response structures
        // Priority 1: data.data.kioskTypes (standard API response)
        // Priority 2: data.data (if it's an array)
        // Priority 3: data.kioskTypes (if at root)
        // Priority 4: data (if it's an array)
        let items = [];

        if (Array.isArray(data.data?.kioskTypes)) {
          items = data.data.kioskTypes;
        } else if (Array.isArray(data.data)) {
          items = data.data;
        } else if (Array.isArray(data.kioskTypes)) {
          items = data.kioskTypes;
        } else if (Array.isArray(data)) {
          items = data;
        }

        // Ensure items is always an array
        if (!Array.isArray(items)) {
          console.warn('⚠️ Kiosk types data is not an array:', items);
          items = [];
        }

        console.log('✅ Kiosk types loaded from API:', {
          count: items.length,
          hasData: items.length > 0,
          firstItem: items[0]?.name || 'N/A',
          items: items.map(kt => ({ id: kt._id, name: kt.name }))
        });

        // 🚀 ULTRA-OPTIMIZED: Process data efficiently
        items = items
          .map(kt => ({
            ...kt,
            imageUrl: kt.imageUrl || kt.image
          }))
          .sort((a, b) => {
            const idA = a._id || '';
            const idB = b._id || '';
            return idA < idB ? -1 : idA > idB ? 1 : 0;
          });

        // 🚀 BATCH ALL STATE UPDATES
        const paginationData = data.data?.pagination || data.pagination || {};
        const statisticsData = data.data?.statistics || data.statistics || {};

        // ✅ FIX: Calculate statistics from items if not provided by API
        const calculatedStats = {
          active: statisticsData.active !== undefined ? statisticsData.active : items.filter(kt => kt.isActive !== false).length,
          inactive: statisticsData.inactive !== undefined ? statisticsData.inactive : items.filter(kt => kt.isActive === false).length,
          total: statisticsData.total !== undefined ? statisticsData.total : items.length
        };

        // Smart merge: Preserve optimistic updates by merging with existing data
        setKioskTypes(prev => {
          // If this is a refresh after create/update, merge intelligently to preserve optimistic updates
          if (forceRefresh && prev.length > 0 && items.length > 0) {
            // Merge: Keep items from server, but also preserve any optimistically added items
            const merged = [...items];
            // Add any items from prev that aren't in items (preserve optimistic updates temporarily)
            prev.forEach(prevItem => {
              const exists = merged.some(item =>
                item._id === prevItem._id || item._id?.toString() === prevItem._id?.toString()
              );
              if (!exists) {
                // Item was optimistically added but not yet in server response, keep it
                merged.push(prevItem);
              }
            });
            return merged.sort((a, b) => {
              const idA = a._id || '';
              const idB = b._id || '';
              return idA < idB ? -1 : idA > idB ? 1 : 0;
            });
          }
          // Normal load - replace completely
          return items;
        });
        setTotalItems(paginationData.totalItems !== undefined ? paginationData.totalItems : items.length);
        setTotalPages(paginationData.totalPages !== undefined ? paginationData.totalPages : Math.ceil(items.length / limit) || 1);
        setCurrentPage(page);
        setSummary({
          activeKioskTypes: calculatedStats.active,
          inactiveKioskTypes: calculatedStats.inactive,
          totalKioskTypes: calculatedStats.total
        });
        setLoading(false);

        // Cache the response for instant future loads
        if (page === 1 && !search) {
          const cacheKey = `theater_kiosk_types_${theaterId}`;
          setCachedData(cacheKey, {
            data: items,
            pagination: {
              totalItems: paginationData.totalItems !== undefined ? paginationData.totalItems : items.length,
              totalPages: paginationData.totalPages !== undefined ? paginationData.totalPages : Math.ceil(items.length / limit) || 1
            },
            statistics: calculatedStats
          });
          console.log('💾 Cached kiosk types data:', {
            itemsCount: items.length,
            totalItems: paginationData.totalItems !== undefined ? paginationData.totalItems : items.length,
            statistics: calculatedStats
          });
        }
      } else {
        // Handle API error response or empty data
        if (isMountedRef.current) {
          console.error('API returned success=false or no data:', data.message || data.error || 'No data in response');

          // ✅ FIX: Check if response has empty kioskTypes array (valid but empty response)
          let items = [];
          if (data.data?.kioskTypes && Array.isArray(data.data.kioskTypes)) {
            items = data.data.kioskTypes;
          } else if (data.data && Array.isArray(data.data)) {
            items = data.data;
          }

          // ✅ FIX: Always set state, even if empty array (this is valid - no kiosk types exist yet)
          setKioskTypes(items);
          setTotalItems(items.length);
          setTotalPages(items.length > 0 ? 1 : 0);
          setCurrentPage(1);
          setSummary({
            activeKioskTypes: items.filter(kt => kt.isActive !== false).length,
            inactiveKioskTypes: items.filter(kt => kt.isActive === false).length,
            totalKioskTypes: items.length
          });
          setLoading(false);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        console.error('Error loading kiosk types:', error);
        // ✅ FIX: Always clear loading state on error
        setLoading(false);
        // If we have no data and this is the initial load, show empty state
        if (kioskTypes.length === 0) {
          setKioskTypes([]);
          setTotalItems(0);
          setTotalPages(0);
          setCurrentPage(1);
          setSummary({
            activeKioskTypes: 0,
            inactiveKioskTypes: 0,
            totalKioskTypes: 0
          });
        }
      } else if (error.name === 'AbortError') {
        // Request was aborted - don't update state
      } else {
        // ✅ FIX: Ensure loading is cleared even if component unmounted
        setLoading(false);
      }
    }
  }, [theaterId]); // Removed kioskTypes.length to prevent unnecessary re-renders

  // Store loadKioskTypesData in ref for stable access - Set immediately
  loadKioskTypesDataRef.current = loadKioskTypesData;

  useEffect(() => {
    loadKioskTypesDataRef.current = loadKioskTypesData;
  }, [loadKioskTypesData]);

  // 🚀 OPTIMIZED: Debounced search - Ultra-fast 90ms delay
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loadKioskTypesDataRef.current) {
        loadKioskTypesDataRef.current(1, itemsPerPage, query);
      }
    }, 90); // Ultra-fast 90ms delay for near-instant response
  }, [itemsPerPage]);

  // Search handler
  const handleSearch = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  // Handle filter change
  const handleFilterChange = useCallback((e) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  }, []);

  // 🚀 OPTIMIZED: Pagination handlers - Use ref for stable access
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    if (loadKioskTypesDataRef.current) {
      loadKioskTypesDataRef.current(1, newLimit, searchTerm);
    }
  }, [searchTerm]);

  const handlePageChange = useCallback((newPage) => {
    // For filtered data, we handle pagination client-side
    const filteredTotal = filterStatus === 'all'
      ? kioskTypes.length
      : filterStatus === 'active'
        ? kioskTypes.filter(kt => kt.isActive !== false).length
        : kioskTypes.filter(kt => kt.isActive === false).length;
    const maxPages = Math.max(1, Math.ceil(filteredTotal / itemsPerPage));

    if (newPage >= 1 && newPage <= maxPages) {
      setCurrentPage(newPage);
    }
  }, [filterStatus, kioskTypes, itemsPerPage]);

  // CRUD Operations - Memoized for performance
  const viewKioskType = useCallback((kioskType) => {
    setSelectedKioskType(kioskType);
    setShowViewModal(true);
  }, []);

  const editKioskType = useCallback((kioskType) => {
    setSelectedKioskType(kioskType);
    setFormData({
      name: kioskType.name || '',
      description: kioskType.description || '',
      isActive: kioskType.isActive,
      image: kioskType.imageUrl || null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setShowEditModal(true);
  }, []);

  const deleteKioskType = useCallback((kioskType) => {
    setSelectedKioskType(kioskType);
    setShowDeleteModal(true);
  }, []);

  // Submit handler for create/edit - Memoized
  const handleSubmitKioskType = useCallback(async (isEdit = false) => {
    // Validation
    if (!formData.name || !formData.name.trim()) {
      setImageError('Kiosk type name is required');
      return;
    }

    // Store form data before resetting
    const currentFormData = { ...formData };
    const currentImageFile = imageFile;
    const currentSelectedKioskType = selectedKioskType;

    // 🚀 INSTANT UI UPDATE: Optimistically update UI immediately
    const optimisticKioskType = {
      _id: isEdit ? currentSelectedKioskType._id : `temp-${Date.now()}`,
      name: currentFormData.name,
      description: currentFormData.description || '',
      isActive: currentFormData.isActive,
      imageUrl: currentImageFile
        ? URL.createObjectURL(currentImageFile)
        : (isEdit ? (currentSelectedKioskType?.imageUrl || currentSelectedKioskType?.image) : null),
      image: currentImageFile
        ? URL.createObjectURL(currentImageFile)
        : (isEdit ? (currentSelectedKioskType?.imageUrl || currentSelectedKioskType?.image) : null),
      createdAt: isEdit ? currentSelectedKioskType?.createdAt : new Date(),
      updatedAt: new Date()
    };

    // Update UI immediately with optimistic data
    if (!isEdit) {
      // Add new kiosk type to list immediately
      setKioskTypes(prev => [optimisticKioskType, ...prev]);
      // Update summary counts immediately
      setSummary(prev => ({
        ...prev,
        totalKioskTypes: prev.totalKioskTypes + 1,
        activeKioskTypes: optimisticKioskType.isActive !== false ? prev.activeKioskTypes + 1 : prev.activeKioskTypes
      }));
      setTotalItems(prev => prev + 1);
    } else {
      // Update existing kiosk type in list immediately
      setKioskTypes(prev => prev.map(kt => {
        const ktId = kt._id?.toString() || kt._id;
        const editId = currentSelectedKioskType._id?.toString() || currentSelectedKioskType._id;
        return ktId === editId ? { ...kt, ...optimisticKioskType } : kt;
      }));
    }

    // 🚀 INSTANT CLOSE: Close modal immediately after optimistic update
    if (isEdit) {
      setShowEditModal(false);
    } else {
      setShowCreateModal(false);
    }

    // Reset form immediately after closing modal
    setFormData({
      name: '',
      description: '',
      isActive: true,
      image: null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setSelectedKioskType(null);

    try {
      const url = isEdit
        ? `${config.api.baseUrl}/theater-kiosk-types/${theaterId}/${currentSelectedKioskType._id}`
        : `${config.api.baseUrl}/theater-kiosk-types/${theaterId}`;
      const method = isEdit ? 'PUT' : 'POST';

      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('name', currentFormData.name);
      formDataToSend.append('isActive', currentFormData.isActive);

      // Add image file if selected
      if (currentImageFile) {
        formDataToSend.append('image', currentImageFile);
      }

      // Add description if provided
      if (currentFormData.description) {
        formDataToSend.append('description', currentFormData.description);
      }

      // Handle image removal
      if (currentFormData.removeImage && !currentImageFile) {
        formDataToSend.append('removeImage', 'true');
      }

      // unifiedFetch automatically handles FormData
      const response = await unifiedFetch(url, {
        method: method,
        body: formDataToSend
        // Token is automatically added by unifiedFetch
      }, {
        forceRefresh: true, // Don't cache POST/PUT requests
        cacheTTL: 0
      });

      // Parse response JSON - unifiedFetch returns data directly in json() method
      const data = await response.json();

      // Determine success based on data structure (don't rely on response.ok which may be undefined)
      // Success if: data.success === true OR we have data.kioskType/data.data OR no error field
      const hasError = data.error || (data.success === false);
      const hasSuccessData = data.success === true || data.data || data.data?.kioskType || data.kioskType;
      const isSuccess = !hasError && (hasSuccessData || !data.error);

      if (isSuccess) {
        // ✅ SYNC: Replace optimistic update with real backend data
        const newKioskType = data.data?.kioskType || data.data || data.kioskType;

        if (newKioskType) {
          const processedKioskType = {
            ...newKioskType,
            imageUrl: newKioskType.imageUrl || newKioskType.image || null,
            updatedAt: newKioskType.updatedAt || new Date().toISOString()
          };

          if (!isEdit) {
            // Replace optimistic entry with real data
            setKioskTypes(prev => {
              // Remove optimistic entry (temp ID) and add real one
              const filtered = prev.filter(kt => {
                const ktId = kt._id?.toString() || kt._id;
                return !ktId.toString().startsWith('temp-');
              });

              // Check if real entry already exists
              const exists = filtered.some(kt => {
                const ktId = kt._id?.toString() || kt._id;
                const newId = processedKioskType._id?.toString() || processedKioskType._id;
                return ktId === newId;
              });

              if (exists) {
                return filtered.map(kt => {
                  const ktId = kt._id?.toString() || kt._id;
                  const newId = processedKioskType._id?.toString() || processedKioskType._id;
                  return ktId === newId ? processedKioskType : kt;
                });
              }
              return [processedKioskType, ...filtered];
            });
          } else {
            // Replace optimistic update with real backend data
            setKioskTypes(prev => prev.map(kt => {
              const ktId = kt._id?.toString() || kt._id;
              const newId = processedKioskType._id?.toString() || processedKioskType._id;
              return ktId === newId ? processedKioskType : kt;
            }));
          }
        }

        // Show success message
        toast.success(isEdit ? 'Kiosk type updated successfully!' : 'Kiosk type created successfully!', 3000);

        // ✅ FIX: Comprehensive cache invalidation for Kiosk Types
        try {
          // Clear all Kiosk Type cache variations
          clearCachePattern(`theater_kiosk_types_${theaterId}`);
          clearCachePattern(`theaterKioskTypes_${theaterId}`);
          clearCachePattern(`theater_kiosk_types`);
          clearCachePattern(`theaterKioskTypes`);
          clearCachePattern(`kiosk`);
          clearCachePattern(`theater_kiosk`);
          // Use invalidateRelatedCaches for comprehensive clearing
          invalidateRelatedCaches('kioskType', theaterId);
          // Also clear product caches since products reference kiosk types
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          // Clear all sessionStorage entries matching kiosk type patterns
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.toLowerCase().includes('kiosk') ||
              (key.includes(`theater_kiosk_types`) && key.includes(theaterId))) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('⚠️ Kiosk Type cache clear warning:', e);
        }

        // ✅ FIX: Dispatch event to trigger refresh in other pages (Cafe, Product Management)
        try {
          window.dispatchEvent(new CustomEvent('kioskTypeUpdated', {
            detail: { theaterId, kioskTypeId: processedKioskType._id }
          }));
        } catch (e) {
          // Ignore event dispatch errors
        }

        // Refresh data in background
        setTimeout(() => {
          if (loadKioskTypesDataRef.current && isMountedRef.current) {
            loadKioskTypesDataRef.current(currentPage, itemsPerPage, searchTerm, true, true);
          }
        }, 500);
      } else {
        // Handle error response - revert optimistic update and reopen modal
        const errorMessage = data.message || data.error || 'Failed to save kiosk type';
        toast.error(errorMessage, 5000);
        console.error('Error saving kiosk type:', data);

        // Revert optimistic update
        if (!isEdit) {
          setKioskTypes(prev => prev.filter(kt => {
            const ktId = kt._id?.toString() || kt._id;
            return !ktId.toString().startsWith('temp-');
          }));
          setSummary(prev => ({
            ...prev,
            totalKioskTypes: Math.max(0, prev.totalKioskTypes - 1),
            activeKioskTypes: optimisticKioskType.isActive !== false
              ? Math.max(0, prev.activeKioskTypes - 1)
              : prev.activeKioskTypes
          }));
          setTotalItems(prev => Math.max(0, prev - 1));
        } else {
          // Revert to original data
          setKioskTypes(prev => prev.map(kt => {
            const ktId = kt._id?.toString() || kt._id;
            const editId = currentSelectedKioskType._id?.toString() || currentSelectedKioskType._id;
            return ktId === editId ? currentSelectedKioskType : kt;
          }));
        }

        // Reopen modal on error so user can fix and retry
        if (isEdit) {
          setShowEditModal(true);
          // Restore form data
          setFormData(currentFormData);
          setImageFile(currentImageFile);
          setSelectedKioskType(currentSelectedKioskType);
        } else {
          setShowCreateModal(true);
          // Restore form data
          setFormData(currentFormData);
          setImageFile(currentImageFile);
        }
      }
    } catch (error) {
      console.error('Error saving kiosk type:', error);
      toast.error(error.message || 'Failed to save kiosk type');

      // Revert optimistic update
      if (!isEdit) {
        setKioskTypes(prev => prev.filter(kt => {
          const ktId = kt._id?.toString() || kt._id;
          return !ktId.toString().startsWith('temp-');
        }));
        setSummary(prev => ({
          ...prev,
          totalKioskTypes: Math.max(0, prev.totalKioskTypes - 1),
          activeKioskTypes: optimisticKioskType.isActive !== false
            ? Math.max(0, prev.activeKioskTypes - 1)
            : prev.activeKioskTypes
        }));
        setTotalItems(prev => Math.max(0, prev - 1));
      } else {
        // Revert to original data
        setKioskTypes(prev => prev.map(kt => {
          const ktId = kt._id?.toString() || kt._id;
          const editId = currentSelectedKioskType._id?.toString() || currentSelectedKioskType._id;
          return ktId === editId ? currentSelectedKioskType : kt;
        }));
      }

      // Reopen modal on error so user can see the error
      if (isEdit) {
        setShowEditModal(true);
        // Restore form data
        setFormData(currentFormData);
        setImageFile(currentImageFile);
        setSelectedKioskType(currentSelectedKioskType);
      } else {
        setShowCreateModal(true);
        // Restore form data
        setFormData(currentFormData);
        setImageFile(currentImageFile);
      }
    }
  }, [theaterId, selectedKioskType, formData, imageFile, currentPage, itemsPerPage, searchTerm, toast]);

  // Handle delete - Memoized
  const handleDeleteKioskType = useCallback(async () => {
    // Store deleted item data for error recovery
    const deletedId = selectedKioskType._id?.toString() || selectedKioskType._id;
    const deletedIsActive = selectedKioskType.isActive !== false;
    const deletedKioskType = { ...selectedKioskType };

    // 🚀 INSTANT UI UPDATE: Remove from UI immediately
    setKioskTypes(prev => prev.filter(kt => {
      const ktId = kt._id?.toString() || kt._id;
      return ktId !== deletedId;
    }));

    // Update summary counts immediately
    setSummary(prev => ({
      ...prev,
      totalKioskTypes: Math.max(0, prev.totalKioskTypes - 1),
      activeKioskTypes: deletedIsActive
        ? Math.max(0, prev.activeKioskTypes - 1)
        : prev.activeKioskTypes,
      inactiveKioskTypes: !deletedIsActive
        ? Math.max(0, prev.inactiveKioskTypes - 1)
        : prev.inactiveKioskTypes
    }));
    setTotalItems(prev => Math.max(0, prev - 1));

    // Close delete modal immediately
    setShowDeleteModal(false);
    setSelectedKioskType(null);

    try {
      const response = await unifiedFetch(
        `${config.api.baseUrl}/theater-kiosk-types/${theaterId}/${deletedId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        },
        {
          forceRefresh: true, // Don't cache DELETE requests
          cacheTTL: 0
        }
      );

      // Parse response JSON
      const data = await response.json();

      // Determine success based on data structure (don't rely on response.ok)
      const hasError = data.error || (data.success === false);
      const isSuccess = !hasError && (data.success === true || data.message || !data.error);

      if (isSuccess) {
        // Show success message
        toast.success('Kiosk type deleted successfully!', 3000);

        // Clear cache
        try {
          clearCachePattern(`kiosk`);
          clearCachePattern(`theater_kiosk`);
          clearCachePattern(`theaterKiosk`);
        } catch (e) {
          console.warn('Cache clear warning:', e);
        }

        try {
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.toLowerCase().includes('kiosk')) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('Session storage clear warning:', e);
        }

        // Refresh data in background
        setTimeout(() => {
          if (loadKioskTypesDataRef.current && isMountedRef.current) {
            loadKioskTypesDataRef.current(currentPage, itemsPerPage, searchTerm, true, true);
          }
        }, 500);
      } else {
        // Handle error response - revert optimistic update
        const errorMessage = data.message || data.error || 'Failed to delete kiosk type';
        toast.error(errorMessage, 5000);
        console.error('Error deleting kiosk type:', data);

        // Revert optimistic update - re-add the item
        setKioskTypes(prev => {
          const exists = prev.some(kt => {
            const ktId = kt._id?.toString() || kt._id;
            return ktId === deletedId;
          });
          if (exists) {
            return prev;
          }
          return [...prev, deletedKioskType].sort((a, b) => {
            const idA = a._id?.toString() || a._id || '';
            const idB = b._id?.toString() || b._id || '';
            return idA < idB ? -1 : idA > idB ? 1 : 0;
          });
        });

        // Revert summary counts
        setSummary(prev => ({
          ...prev,
          totalKioskTypes: prev.totalKioskTypes + 1,
          activeKioskTypes: deletedIsActive ? prev.activeKioskTypes + 1 : prev.activeKioskTypes,
          inactiveKioskTypes: !deletedIsActive ? prev.inactiveKioskTypes + 1 : prev.inactiveKioskTypes
        }));
        setTotalItems(prev => prev + 1);

        // Reopen modal
        setShowDeleteModal(true);
        setSelectedKioskType(deletedKioskType);
      }
    } catch (error) {
      console.error('Error deleting kiosk type:', error);
      toast.error(error.message || 'Failed to delete kiosk type');

      // Revert optimistic update - re-add the item
      setKioskTypes(prev => {
        const exists = prev.some(kt => {
          const ktId = kt._id?.toString() || kt._id;
          return ktId === deletedId;
        });
        if (exists) {
          return prev;
        }
        return [...prev, deletedKioskType].sort((a, b) => {
          const idA = a._id?.toString() || a._id || '';
          const idB = b._id?.toString() || b._id || '';
          return idA < idB ? -1 : idA > idB ? 1 : 0;
        });
      });

      // Revert summary counts
      setSummary(prev => ({
        ...prev,
        totalKioskTypes: prev.totalKioskTypes + 1,
        activeKioskTypes: deletedIsActive ? prev.activeKioskTypes + 1 : prev.activeKioskTypes,
        inactiveKioskTypes: !deletedIsActive ? prev.inactiveKioskTypes + 1 : prev.inactiveKioskTypes
      }));
      setTotalItems(prev => prev + 1);

      // Reopen modal
      setShowDeleteModal(true);
      setSelectedKioskType(deletedKioskType);
    }
  }, [theaterId, selectedKioskType, currentPage, itemsPerPage, searchTerm, toast]);

  // Form input handlers - Memoized
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleImageSelect = useCallback((file) => {
    setImageFile(file);
    setImageError('');
    setFormData(prev => ({
      ...prev,
      removeImage: false
    }));
  }, []);

  const handleImageRemove = useCallback(() => {
    setImageFile(null);
    setFormData(prev => ({
      ...prev,
      image: null,
      removeImage: true
    }));
  }, []);

  const getCurrentImageValue = () => {
    if (imageFile) {
      return URL.createObjectURL(imageFile);
    }
    if (formData.removeImage) {
      return null;
    }
    return formData.image;
  };

  // Handle create new kiosk type - Memoized
  const handleCreateNewKioskType = useCallback(() => {
    setFormData({
      name: '',
      description: '',
      isActive: true,
      image: null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setShowCreateModal(true);
  }, []);

  // Reset initial load flag when theaterId changes
  useEffect(() => {
    setInitialLoadDone(false);
    setLoading(true);
    lastLoadKeyRef.current = '';
  }, [theaterId]);

  // 🚀 ULTRA-OPTIMIZED: Initial load - INSTANT CACHE FIRST (< 90ms)
  useEffect(() => {

    if (!theaterId) {
      setLoading(false);
      return;
    }

    const loadKey = `${theaterId}`;
    if (lastLoadKeyRef.current === loadKey && initialLoadDone) {
      return;
    }
    lastLoadKeyRef.current = loadKey;

    let isMounted = true;
    let safetyTimer = null;

    // Safety timeout to prevent infinite loading
    safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 8000); // 8 seconds timeout

    // Execute immediately - cache check happens first (< 90ms)
    // Use the function directly if ref is not set yet
    const loadFunction = loadKioskTypesDataRef.current || loadKioskTypesData;

    (async () => {
      try {
        // ✅ FIX: Always fetch from API on initial load to ensure data is loaded
        // Check cache first for instant display, but always fetch fresh data
        const cacheKey = `theater_kiosk_types_${theaterId}`;
        const cached = getCachedData(cacheKey, 30000);

        // ✅ FIX: Check for valid cache with kiosk types data (handle both structures)
        let hasValidCache = false;
        if (cached) {
          // Check TheaterKioskTypes structure: { data: [...], pagination: {...}, statistics: {...} }
          if (cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
            hasValidCache = true;
          }
          // Check unifiedFetch structure: { success: true, data: { kioskTypes: [...], ... } }
          else if (cached.data && Array.isArray(cached.data.kioskTypes) && cached.data.kioskTypes.length > 0) {
            hasValidCache = true;
          }
          // Check if kioskTypes is at root level
          else if (Array.isArray(cached.kioskTypes) && cached.kioskTypes.length > 0) {
            hasValidCache = true;
          }
        }

        if (hasValidCache) {
          // Cache exists and has data - use it for instant display
          // But still fetch fresh data in background to ensure it's up to date
          // Use skipCache=true to bypass cache check and force API fetch
          // Don't await - let it run in background while showing cached data
          loadFunction(1, 10, '', true, false).catch(err => {
            console.warn('⚠️ Background fetch failed:', err);
          });
          // Set initial load done since we have cached data
          if (isMounted) {
            setInitialLoadDone(true);
            if (safetyTimer) clearTimeout(safetyTimer);
          }
        } else {
          // No cache or empty/invalid cache - force fetch from API immediately
          console.log('📋 Cache check result:', {
            hasCache: !!cached,
            cacheStructure: cached ? Object.keys(cached) : 'none',
            cacheDataKeys: cached?.data ? Object.keys(cached.data) : 'none'
          });
          // Use skipCache=true and forceRefresh=true to ensure API fetch happens
          setLoading(true); // Ensure loading is set before fetch

          try {
            // ✅ FIX: Always await the load to ensure it completes before marking as done
            const result = await loadFunction(1, 10, '', true, true);
            console.log('✅ Initial load completed successfully', {
              result: result ? 'has result' : 'no result',
              kioskTypesCount: 'check state'
            });
          } catch (loadError) {
            console.error('❌ Error during initial load:', loadError);
            // Set error state but don't block UI
            if (isMounted) {
              setKioskTypes([]);
              setLoading(false);
            }
          }

          if (isMounted) {
            setInitialLoadDone(true);
            if (safetyTimer) clearTimeout(safetyTimer);
          }
        }
      } catch (error) {
        console.error('❌ Error loading kiosk types on initial load:', error);
        if (isMounted) {
          setLoading(false);
          setInitialLoadDone(true);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [theaterId, initialLoadDone, loadKioskTypesData]); // Include loadKioskTypesData as fallback

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

  // ✅ FIX: Reset overflow styles on mount/navigation to prevent horizontal scrollbar from persisting
  useEffect(() => {
    // Reset overflow-x on table containers to ensure scrollbar only appears when needed
    const resetOverflow = () => {
      const tableContainers = document.querySelectorAll('.theater-table-container');
      tableContainers.forEach(container => {
        if (container) {
          // Force recalculation by checking if content actually overflows
          requestAnimationFrame(() => {
            if (container.scrollWidth <= container.clientWidth) {
              // No overflow, hide scrollbar
              container.style.overflowX = 'hidden';
            } else {
              // Has overflow, show scrollbar
              container.style.overflowX = 'auto';
            }
          });
        }
      });
    };

    // Reset immediately on mount/navigation
    resetOverflow();

    // Also reset after a short delay to catch any delayed rendering
    const timeoutId = setTimeout(resetOverflow, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [location.pathname, location.key]); // Re-run on navigation

  // Memoized skeleton component for loading states
  const TableRowSkeleton = useMemo(() => () => (
    <tr className="skeleton-row">
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-image"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  ), []);

  // 🚀 OPTIMIZED: Memoized Kiosk Type Table Row Component
  const KioskTypeRow = React.memo(({ kioskType, index, currentPage, itemsPerPage, onView, onEdit, onDelete }) => {
    const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;

    return (
      <tr className={`theater-row ${!kioskType.isActive ? 'inactive' : ''}`}>
        <td className="sno-cell">{serialNumber}</td>
        <td className="photo-cell">
          {(kioskType.imageUrl || kioskType.image) ? (
            <div className="theater-photo-thumb">
              <img
                src={kioskType.imageUrl || kioskType.image}
                alt={kioskType.name || 'Kiosk Type'}
                loading="eager"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
                onError={(e) => {
                  console.error('Kiosk Type image failed to load:', kioskType.imageUrl || kioskType.image);
                  e.target.style.display = 'none';
                  if (e.target.parentElement) {
                    e.target.parentElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: #9ca3af;"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
                  }
                }}
                onLoad={() => {
                }}
              />
            </div>
          ) : (
            <div className="theater-photo-thumb no-photo">
              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
            </div>
          )}
        </td>
        <td className="name-cell">
          <div className="qr-info">
            <div className="qr-name">{kioskType.name}</div>
          </div>
        </td>
        <td className="status-cell">
          <span className={`status-badge ${kioskType.isActive ? 'active' : 'inactive'}`}>
            {kioskType.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="actions-cell">
          <ActionButtons>
            <ActionButton
              type="view"
              onClick={() => onView(kioskType)}
              title="View Details"
            />
            <ActionButton
              type="edit"
              onClick={() => onEdit(kioskType)}
              title="Edit Kiosk Type"
            />
            <ActionButton
              type="delete"
              onClick={() => onDelete(kioskType)}
              title="Delete Kiosk Type"
            />
          </ActionButtons>
        </td>
      </tr>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison function for better performance
    return (
      prevProps.kioskType._id === nextProps.kioskType._id &&
      prevProps.index === nextProps.index &&
      prevProps.currentPage === nextProps.currentPage &&
      prevProps.itemsPerPage === nextProps.itemsPerPage &&
      prevProps.kioskType.name === nextProps.kioskType.name &&
      prevProps.kioskType.isActive === nextProps.kioskType.isActive &&
      prevProps.kioskType.imageUrl === nextProps.kioskType.imageUrl
    );
  });

  KioskTypeRow.displayName = 'KioskTypeRow';

  // Filtered kiosk types based on status filter
  const filteredKioskTypes = useMemo(() => {
    if (filterStatus === 'all') {
      return kioskTypes;
    } else if (filterStatus === 'active') {
      return kioskTypes.filter(kt => kt.isActive !== false);
    } else {
      return kioskTypes.filter(kt => kt.isActive === false);
    }
  }, [kioskTypes, filterStatus]);

  // Calculate filtered counts for display
  const filteredTotalItems = useMemo(() => {
    return filteredKioskTypes.length;
  }, [filteredKioskTypes]);

  const filteredTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredTotalItems / itemsPerPage));
  }, [filteredTotalItems, itemsPerPage]);

  // Paginated filtered kiosk types
  const paginatedFilteredKioskTypes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredKioskTypes.slice(startIndex, endIndex);
  }, [filteredKioskTypes, currentPage, itemsPerPage]);

  // 🚀 OPTIMIZED: Memoized header button to prevent re-renders
  const headerButton = useMemo(() => (
    <button
      className="header-btn"
      onClick={handleCreateNewKioskType}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </span>
      Create New Kiosk Type
    </button>
  ), [handleCreateNewKioskType]);

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Kiosk Types" currentPage="kiosk-types">
        <PageContainer
          title="Kiosk Type Management"
          headerButton={headerButton}
        >

          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.activeKioskTypes || 0}</div>
              <div className="stat-label">Active Kiosk Types</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.inactiveKioskTypes || 0}</div>
              <div className="stat-label">Inactive Kiosk Types</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalKioskTypes || 0}</div>
              <div className="stat-label">Total Kiosk Types</div>
            </div>
          </div>

          {/* Enhanced Filters Section */}
          <div className="theater-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search kiosk types by name or description..."
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
                Showing {paginatedFilteredKioskTypes.length} of {filteredTotalItems} kiosk types (Page {currentPage} of {filteredTotalPages})
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
                  <th className="sno-cell">S.No</th>
                  <th className="photo-cell">Image</th>
                  <th className="name-cell">Kiosk Type Name</th>
                  <th className="status-cell">Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="loading-cell">
                      <div className="loading-spinner"></div>
                      <span>Loading kiosk types...</span>
                    </td>
                  </tr>
                ) : paginatedFilteredKioskTypes.length > 0 ? (
                  paginatedFilteredKioskTypes.map((kioskType, index) => {
                    // Use a composite key that includes updatedAt to force re-render on updates
                    // Use updatedAt if available, otherwise fall back to _id only
                    const uniqueKey = kioskType.updatedAt
                      ? `${kioskType._id || `kiosk-type-${index}`}-${kioskType.updatedAt}`
                      : (kioskType._id || `kiosk-type-${index}`);
                    // Calculate actual index for serial number
                    const actualIndex = (currentPage - 1) * itemsPerPage + index;
                    return (
                      <KioskTypeRow
                        key={uniqueKey}
                        kioskType={kioskType}
                        index={actualIndex}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        onView={viewKioskType}
                        onEdit={editKioskType}
                        onDelete={deleteKioskType}
                      />
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="empty-cell">
                      <i className="fas fa-desktop fa-3x"></i>
                      <h3>No Kiosk Types Found</h3>
                      <p>There are no kiosk types available for management at the moment.</p>
                      <button className="add-theater-btn" onClick={handleCreateNewKioskType}>
                        Create First Kiosk Type
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination - Always Show (Global Component) */}
          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalPages={filteredTotalPages}
              totalItems={filteredTotalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              itemType="kiosk types"
            />
          )}

          {/* Create Modal */}
          {showCreateModal && (
            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Create New Kiosk Type</h2>
                  <button
                    className="close-btn"
                    onClick={() => setShowCreateModal(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>

                <div className="modal-body">
                  <div className="edit-form">
                    <div className="form-group">
                      <label>Kiosk Type Name <span className="required-field-indicator">*</span></label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="form-control"
                        placeholder="Enter kiosk type name"
                        required
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
                    <div className="form-group full-width">
                      <label>Description</label>
                      <textarea
                        value={formData.description || ''}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        className="form-control"
                        placeholder="Enter kiosk type description (optional)"
                        rows="3"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Kiosk Type Image</label>
                      <ImageUpload
                        value={getCurrentImageValue()}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Kiosk Type Image"
                        helperText="Drag and drop an image here, or click to select (optional)"
                        className="form-helper-text"
                        maxSize={100 * 1024}
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
                    onClick={() => handleSubmitKioskType(false)}
                    disabled={!formData.name?.trim()}
                  >
                    Create Kiosk Type
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
                  <h2>Edit Kiosk Type</h2>
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
                      <label>Kiosk Type Name</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="form-control"
                        placeholder="Enter kiosk type name"
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
                    <div className="form-group full-width">
                      <label>Description</label>
                      <textarea
                        value={formData.description || ''}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        className="form-control"
                        placeholder="Enter kiosk type description (optional)"
                        rows="3"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Kiosk Type Image</label>
                      <ImageUpload
                        value={getCurrentImageValue()}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Kiosk Type Image"
                        helperText="Drag and drop an image here, or click to select (optional)"
                        className="form-helper-text"
                        maxSize={100 * 1024}
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
                    onClick={() => handleSubmitKioskType(true)}
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
                  <h2>Kiosk Type Details</h2>
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
                      <label>Kiosk Type Name</label>
                      <input
                        type="text"
                        value={selectedKioskType?.name || ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={selectedKioskType?.isActive ? 'Active' : 'Inactive'}
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
                        value={selectedKioskType?.description || ''}
                        className="form-control"
                        readOnly
                        rows="3"
                      />
                    </div>
                    {(selectedKioskType?.imageUrl || selectedKioskType?.image) && (
                      <div className="form-group full-width">
                        <label>Kiosk Type Image</label>
                        <div className="empty-state-center">
                          <img
                            src={selectedKioskType.imageUrl || selectedKioskType.image}
                            alt={selectedKioskType.name}
                            loading="eager"
                            decoding="async"
                            style={{
                              maxWidth: '100%',
                              height: 'auto',
                              maxHeight: '400px',
                              width: 'auto',
                              borderRadius: '8px',
                              border: '1px solid #e0e0e0',
                              objectFit: 'contain',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="form-group">
                      <label>Created At</label>
                      <input
                        type="text"
                        value={selectedKioskType?.createdAt ? new Date(selectedKioskType.createdAt).toLocaleString() : ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Updated At</label>
                      <input
                        type="text"
                        value={selectedKioskType?.updatedAt ? new Date(selectedKioskType.updatedAt).toLocaleString() : ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                  </div>
                </div>
                {/* View modals don't have footer - Close button is in header only */}
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
                  <p>Are you sure you want to delete the kiosk type <strong>{selectedKioskType?.name}</strong>?</p>
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
                    onClick={handleDeleteKioskType}
                    className="confirm-delete-btn"
                  >
                    Delete Kiosk Type
                  </button>
                </div>
              </div>
            </div>
          )}

        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
});

TheaterKioskTypes.displayName = 'TheaterKioskTypes';

// ✅ Global Modal Width Styling
const style = document.createElement('style');
style.textContent = `
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

export default TheaterKioskTypes;
