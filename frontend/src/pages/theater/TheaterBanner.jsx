import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
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
import { clearPendingRequests } from '@utils/apiOptimizer';
import { clearImageCachePattern } from '@utils/imageCacheUtils';
import { optimisticCreate, optimisticUpdate, optimisticDelete, invalidateRelatedCaches } from '@utils/crudOptimizer';
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/pages/theater/TheaterBanner.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



const TheaterBanner = () => {
  const { theaterId} = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal()
  const toast = useToast();;

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterBanner');
  
  // Data state
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    activeBanners: 0,
    inactiveBanners: 0,
    totalBanners: 0
  });

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
  const [selectedBanner, setSelectedBanner] = useState(null);
  const [formData, setFormData] = useState({
    isActive: true,
    image: null,
    removeImage: false
  });

  // Image upload states
  const [imageFile, setImageFile] = useState(null);
  const [imageError, setImageError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for cleanup and performance
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadBannersDataRef = useRef(null); // Ref to store loadBannersData function
  
  // Ensure mounted ref is set on component mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Validate theater access - removed client-side check, backend handles access control
  // useEffect(() => {
  //   if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {
  //     showError('Access denied: You can only manage categories for your assigned theater');
  //     return;
  //   }
  // }, [theaterId, userTheaterId, userType, showError]);

  // Load banners data with caching
  const loadBannersData = useCallback(async (page = 1, limit = 10, forceRefresh = false) => {
    
    if (!isMountedRef.current || !theaterId) {
      console.warn('⚠️ Skipping load - isMounted:', isMountedRef.current, 'theaterId:', theaterId);
      return;
    }

    const cacheKey = `theaterBanners_${theaterId}_p${page}_l${limit}`;
    
    // Check cache first (skip if force refresh)
    if (!forceRefresh) {
      const cached = getCachedData(cacheKey, 120000); // 2-minute cache
      if (cached && isMountedRef.current) {
        setBanners(cached.banners);
        setTotalItems(cached.totalItems);
        setTotalPages(cached.totalPages);
        setCurrentPage(page);
        setSummary(cached.summary);
        setLoading(false);
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // ✅ FIX: Don't set loading state on force refresh to preserve optimistic updates
      // This ensures the optimistic update stays visible during background refresh
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey, 120000);
        if (!cached) setLoading(true);
      }
      // Don't set loading on force refresh - preserves optimistic update visibility

      const params = new URLSearchParams({
        page: page,
        limit: limit,
        _cacheBuster: Date.now()
      });

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      const baseUrl = `${config.api.baseUrl}/theater-banners/${theaterId}?${params.toString()}`;
      
      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      } else {
        headers['Cache-Control'] = 'no-cache';
      }

      const response = await unifiedFetch(baseUrl, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: forceRefresh ? null : `theater_banners_${theaterId}`, // Don't cache if force refresh
        cacheTTL: forceRefresh ? 0 : 300000, // No cache TTL if force refresh
        forceRefresh: forceRefresh // Pass forceRefresh flag to unifiedFetch
      });
      
      // ✅ FIX: unifiedFetch returns a response-like object, check ok property
      // Note: unifiedFetch throws errors for non-OK responses, so if we get here, response should be OK
      if (!response) {
        throw new Error('No response received from server');
      }

      // ✅ FIX: Ensure response has json method (unifiedFetch always provides this)
      if (typeof response.json !== 'function') {
        throw new Error('Invalid response: response object does not have a json method');
      }

      // ✅ FIX: Check response.ok - unifiedFetch may return ok: false for some cases
      if (response.ok === false) {
        const status = response.status || 'unknown';
        throw new Error(`HTTP error! status: ${status}`);
      }

      const data = await response.json();
      
      // ✅ FIX: Add detailed logging to debug response structure
      console.log('📥 [Banners] API Response received:', {
        success: data?.success,
        hasData: !!data?.data,
        hasBanners: !!data?.data?.banners,
        bannersType: Array.isArray(data?.data?.banners) ? 'array' : typeof data?.data?.banners,
        bannersLength: Array.isArray(data?.data?.banners) ? data.data.banners.length : 'N/A',
        dataKeys: data?.data ? Object.keys(data.data) : [],
        fullData: data
      });
      
      if (!isMountedRef.current) return;

      // ✅ FIX: Handle both explicit success and implicit success (when data exists)
      const isSuccess = data && (data.success === true || (data.data && !data.error));
      
      if (isSuccess) {
        // ✅ FIX: Handle multiple possible response structures with better logging
        let banners = [];
        
        // Try multiple possible locations for banners array
        if (Array.isArray(data.data?.banners)) {
          banners = data.data.banners;
        } else if (Array.isArray(data.data?.bannerList)) {
          // Backend might return bannerList instead of banners
          banners = data.data.bannerList;
        } else if (Array.isArray(data.data)) {
          banners = data.data;
        } else if (Array.isArray(data.banners)) {
          banners = data.banners;
        } else if (Array.isArray(data.bannerList)) {
          banners = data.bannerList;
        } else {
          console.warn('⚠️ [Banners] No banners array found in response. Response structure:', {
            hasData: !!data.data,
            dataType: typeof data.data,
            dataKeys: data.data ? Object.keys(data.data) : [],
            hasBanners: !!data.banners,
            hasBannerList: !!data.bannerList,
            bannersType: typeof data.banners,
            fullData: data
          });
          banners = [];
        }

        // Ensure banners is always an array
        if (!Array.isArray(banners)) {
          console.warn('Banners data is not an array:', banners);
          banners = [];
        }
        
        // ✅ FIX: Ensure all banners have proper imageUrl and updatedAt fields
        banners = banners.map(banner => ({
          ...banner,
          imageUrl: banner.imageUrl || banner.image,
          updatedAt: banner.updatedAt || banner.createdAt || new Date().toISOString()
        }));
        
        // ✅ FIX: Smart merge - preserve optimistic updates when refreshing after create/edit
        setBanners(prev => {
          // If this is a force refresh and we have existing banners, merge intelligently
          if (forceRefresh && prev.length > 0 && banners.length > 0) {
            // Merge: Keep items from server, but also preserve any optimistically added items
            const merged = [...banners];
            // Add any items from prev that aren't in banners (preserve optimistic updates temporarily)
            prev.forEach(prevBanner => {
              const prevId = prevBanner._id?.toString() || prevBanner._id;
              const exists = merged.some(banner => {
                const bannerId = banner._id?.toString() || banner._id;
                return bannerId === prevId;
              });
              if (!exists) {
                // Item was optimistically added but not yet in server response, keep it
                merged.push(prevBanner);
              }
            });
            return merged;
          }
          // Normal load or empty state - replace completely
          return banners;
        });
        
        // Batch pagination state updates
        const paginationData = data.data?.pagination || data.pagination || {};
        const totalItemsCount = paginationData.totalItems || 0;
        const totalPagesCount = paginationData.totalPages || 1;
        setTotalItems(totalItemsCount);
        setTotalPages(totalPagesCount);
        setCurrentPage(page);
        
        // Calculate summary statistics - use server data which should be accurate
        const statisticsData = data.data?.statistics || data.statistics || {};
        const summary = {
          activeBanners: statisticsData.active || 0,
          inactiveBanners: statisticsData.inactive || 0,
          totalBanners: statisticsData.total || 0
        };

        setSummary(summary);
        
        // Cache the data
        setCachedData(cacheKey, {
          banners,
          totalItems: totalItemsCount,
          totalPages: totalPagesCount,
          summary
        });
      } else {
        // Handle API error response or unexpected structure
        console.error('❌ [Banners] API error or unexpected response:', {
          success: data?.success,
          error: data?.error,
          message: data?.message,
          hasData: !!data?.data,
          dataStructure: data?.data ? Object.keys(data.data) : []
        });
        
        // ✅ FIX: Even if success is false, try to extract banners if they exist
        let banners = [];
        if (data?.data?.banners && Array.isArray(data.data.banners)) {
          banners = data.data.banners;
        }
        
        setBanners(banners);
        setTotalItems(banners.length);
        setTotalPages(banners.length > 0 ? 1 : 0);
        setCurrentPage(1);
        setSummary({
          activeBanners: banners.filter(b => b.isActive).length,
          inactiveBanners: banners.filter(b => !b.isActive).length,
          totalBanners: banners.length
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        console.error('❌ [Banners] Error loading banners:', error);
        // ✅ FIX: Provide better error message handling - unifiedFetch throws Error objects with status property
        const errorStatus = error?.status || (error?.response?.status) || 'unknown';
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
        console.error('❌ [Banners] Error details:', {
          message: errorMessage,
          status: errorStatus,
          name: error?.name,
          code: error?.code
        });
        
        // Show empty state but don't show error modal (user can see empty state)
        // Only show error toast for non-network errors
        if (errorStatus !== 'unknown' && errorStatus !== 'NetworkError') {
          // Don't show error for 404 (no banners yet) or if it's a network issue
          if (errorStatus !== 404 && !errorMessage.includes('Failed to fetch')) {
            showError(`Failed to load banners: ${errorMessage}`);
          }
        }
        
        setBanners([]);
        setTotalItems(0);
        setTotalPages(0);
        setCurrentPage(1);
        setSummary({ activeBanners: 0, inactiveBanners: 0, totalBanners: 0 });
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterId, showError]);

  // Store loadBannersData in ref for stable access
  useEffect(() => {
    loadBannersDataRef.current = loadBannersData;
  }, [loadBannersData]);

  // Pagination handlers
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    loadBannersData(1, newLimit);
  }, [loadBannersData]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadBannersData(newPage, itemsPerPage);
    }
  }, [totalPages, itemsPerPage, loadBannersData]);

  // CRUD Operations
  const viewBanner = (banner) => {
    setSelectedBanner(banner);
    setShowViewModal(true);
  };

  const editBanner = (banner) => {
    setSelectedBanner(banner);
    setFormData({
      isActive: banner.isActive,
      image: banner.imageUrl || null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setShowEditModal(true);
  };

  const deleteBanner = (banner) => {
    setSelectedBanner(banner);
    setShowDeleteModal(true);
  };

  // Submit handler for create/edit - Fixed for instant modal close and refresh
  const handleSubmitBanner = useCallback(async (isEdit = false) => {
    // ✅ FIX: Prevent double submission
    if (isSubmitting) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      setImageError('');
      
      // Validate required fields for create
      if (!isEdit && !imageFile) {
        setImageError('Banner image is required');
        setIsSubmitting(false);
        return;
      }
      
      const url = isEdit 
        ? `${config.api.baseUrl}/theater-banners/${theaterId}/${selectedBanner._id}` 
        : `${config.api.baseUrl}/theater-banners/${theaterId}`;
      const method = isEdit ? 'PUT' : 'POST';
      
      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('isActive', formData.isActive);
      
      // Add image file if selected
      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }
      
      // Add remove image flag for edit operations
      if (isEdit && formData.removeImage) {
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

      // ✅ FIX: unifiedFetch throws errors for non-OK responses, so if we get here, response should be OK
      if (!response) {
        throw new Error('No response received from server');
      }

      // ✅ FIX: Ensure response has json method (unifiedFetch always provides this)
      if (typeof response.json !== 'function') {
        throw new Error('Invalid response: response object does not have a json method');
      }

      // ✅ FIX: Check response.ok - unifiedFetch may return ok: false for some cases
      if (response.ok === false) {
        const status = response.status || 'unknown';
        // Try to get error message from response
        let errorMessage = `HTTP error! status: ${status}`;
        try {
          // unifiedFetch might have already parsed the JSON, try to get it
          const errorData = await response.json();
          errorMessage = errorData?.message || errorData?.error || errorMessage;
        } catch (e) {
          // If parsing fails, use default message
          console.warn('Could not parse error response:', e);
        }
        throw new Error(errorMessage);
      }

      // Parse response JSON - unifiedFetch returns data in json() method
      const data = await response.json();
      
      console.log('📥 [Banner Create] Response received:', {
        success: data?.success,
        hasError: !!data?.error,
        hasBanner: !!(data?.data?.banner || data?.banner),
        hasData: !!data?.data,
        responseStatus: response?.status,
        fullResponse: data
      });
      
      // ✅ FIX: Determine success based on data structure (don't rely on response.ok which may be undefined)
      // Success if: data.success === true OR we have data.banner/data.data OR no error field
      const hasError = data?.error || (data?.success === false);
      const hasSuccessData = data?.success === true || data?.data || data?.data?.banner || data?.banner;
      const isSuccess = !hasError && hasSuccessData;
      
      console.log('✅ [Banner Create] Success check:', {
        hasError,
        hasSuccessData,
        isSuccess
      });
      
      if (isSuccess) {
        // ✅ FIX: Reset submitting state first to allow modal to close properly
        setIsSubmitting(false);
        
        // ✅ FIX: Close modal IMMEDIATELY (synchronously) for instant feedback
        if (isEdit) {
          setShowEditModal(false);
        } else {
          setShowCreateModal(false);
        }
        
        // 🚀 INSTANT: Optimistically update UI FIRST (before cache clearing) for instant display
        // Handle multiple possible response structures
        const bannerData = data.data?.banner || data.banner || data.data;
        
        if (bannerData && (bannerData._id || bannerData.id)) {
          const processedBanner = {
            ...bannerData,
            imageUrl: bannerData.imageUrl || bannerData.image,
            _id: bannerData._id || bannerData.id,
            updatedAt: bannerData.updatedAt || bannerData.createdAt || new Date().toISOString(),
            isActive: bannerData.isActive !== undefined ? bannerData.isActive : true
          };
          
          console.log('✅ [Banner Create] Processing banner data:', {
            id: processedBanner._id,
            isActive: processedBanner.isActive,
            hasImage: !!processedBanner.imageUrl
          });
          
          if (isEdit) {
            // Update existing banner instantly
            setBanners(prev => prev.map(b => {
              const bId = b._id?.toString() || b._id;
              const pId = processedBanner._id?.toString() || processedBanner._id;
              if (bId === pId) {
                return {
                  ...processedBanner,
                  _imageUpdated: Date.now(),
                  updatedAt: processedBanner.updatedAt || new Date().toISOString()
                };
              }
              return b;
            }));
          } else {
            // ✅ FIX: Add new banner to the list INSTANTLY (before API refresh)
            setBanners(prev => {
              const pId = processedBanner._id?.toString() || processedBanner._id;
              const exists = prev.some(b => {
                const bId = b._id?.toString() || b._id;
                return bId === pId;
              });
              if (exists) {
                return prev.map(b => {
                  const bId = b._id?.toString() || b._id;
                  return bId === pId ? { ...b, ...processedBanner, _imageUpdated: Date.now() } : b;
                });
              }
              // Add to beginning of list for instant visibility
              const updated = [{ ...processedBanner, _imageUpdated: Date.now() }, ...prev];
              return updated;
            });
            setTotalItems(prev => {
              const newTotal = prev + 1;
              return newTotal;
            });
            
            // ✅ FIX: Update summary instantly
            setSummary(prev => {
              const newSummary = {
                ...prev,
                totalBanners: prev.totalBanners + 1,
                activeBanners: processedBanner.isActive ? prev.activeBanners + 1 : prev.activeBanners,
                inactiveBanners: !processedBanner.isActive ? prev.inactiveBanners + 1 : prev.inactiveBanners
              };
              return newSummary;
            });
          }
        } else {
          // ✅ FIX: If no banner data in response, still reload to get fresh data
          console.warn('⚠️ [Banner Create] No banner data in response, will reload from server');
          console.warn('⚠️ [Banner Create] Response data:', data);
          // Still reload to get the newly created banner from server
        }
        
        // Reset form immediately
        setFormData({
          isActive: true,
          image: null,
          removeImage: false
        });
        setImageFile(null);
        setImageError('');
        setSelectedBanner(null);
        
        // Show success message
        toast.success(isEdit ? 'Banner updated successfully!' : 'Banner created successfully!');
        
        // 🚀 INSTANT: Clear all related caches (after optimistic update)
        try {
          clearCachePattern(`theaterBanners_${theaterId}`);
          clearCachePattern(`banners_${theaterId}`);
          clearCachePattern(`theater_banners_${theaterId}`);
        } catch (e) {
          console.warn('Cache clear warning:', e);
        }
        
        // Clear optimizedFetch cache patterns
        try {
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`theaterBanners_${theaterId}`) || 
                key.includes(`banners_${theaterId}`) ||
                key.includes(`theater_banners_${theaterId}`)) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          // Ignore cache clear errors
        }
        
        // Clear any pending requests to ensure fresh data
        try {
          clearPendingRequests();
        } catch (e) {
          console.warn('Clear pending requests warning:', e);
        }
        
        // 🚀 INSTANT: Reload data from backend to sync (but UI already shows new banner)
        // ✅ FIX: After create, reload from page 1 to see the new banner (new items usually appear first)
        // Use a longer delay to ensure backend has processed the creation and optimistic update is visible
        setTimeout(() => {
          if (isMountedRef.current && loadBannersDataRef.current) {
            // After create, go to page 1; after edit, stay on current page
            const pageToLoad = isEdit ? currentPage : 1;
            // Don't set loading state during refresh to preserve optimistic update visibility
            // ✅ FIX: Wrap reload in try-catch to prevent reload errors from affecting create success
            try {
              loadBannersDataRef.current(pageToLoad, itemsPerPage, true);
              if (!isEdit) {
                setCurrentPage(1); // Update current page state
              }
            } catch (reloadError) {
              // ✅ FIX: Log reload error but don't show error to user (banner was created successfully)
              console.warn('⚠️ [Banner Create] Failed to reload banners after create (non-critical):', reloadError);
              // Banner was created successfully, so we don't need to show an error
              // The optimistic update is already visible, and user can manually refresh if needed
            }
          }
        }, 500); // Longer delay to ensure backend has processed and optimistic update stays visible
      } else {
        // Handle error response
        const errorMessage = data?.message || data?.error || 'Failed to save banner';
        console.error('❌ [Banner Create] Error response:', errorMessage, data);
        setImageError(errorMessage);
        showError(errorMessage);
        // ✅ FIX: Reset submitting state immediately on error
        setIsSubmitting(false);
        // ✅ FIX: Don't close modal on error - keep it open so user can fix issues
      }
    } catch (error) {
      console.error('❌ [Banner Create] Exception caught:', error);
      const errorMessage = error?.message || error?.toString() || 'An error occurred. Please try again.';
      setImageError(errorMessage);
      showError(errorMessage);
      // ✅ FIX: Reset submitting state immediately on error
      setIsSubmitting(false);
      // ✅ FIX: Don't close modal on error - keep it open so user can fix issues
    }
    // Note: No finally block needed - isSubmitting is reset in both success and error paths
  }, [theaterId, selectedBanner, formData, imageFile, currentPage, itemsPerPage, toast, showError, isSubmitting]);

  const handleDeleteBanner = useCallback(async () => {
    try {
      const bannerId = selectedBanner._id;
      
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-banners/${theaterId}/${bannerId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
      });

      const data = await response.json();

      // Determine success based on data structure (don't rely on response.ok which may be undefined)
      const hasError = data.error || (data.success === false);
      const isSuccess = !hasError && (data.success === true || data.message || !data.error);

      if (isSuccess) {
        // Store deleted ID for proper comparison (handle string/object ID differences)
        const deletedId = bannerId?.toString() || bannerId;
        const deletedIsActive = selectedBanner?.isActive !== false;
        
        // 🚀 INSTANT: Clear all related caches immediately
        try {
          clearCachePattern(`theaterBanners_${theaterId}`);
          clearCachePattern(`banners_${theaterId}`);
        } catch (e) {
          console.warn('Cache clear warning:', e);
        }
        
        // Clear optimizedFetch cache patterns
        try {
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`theaterBanners_${theaterId}`) || key.includes(`banners_${theaterId}`)) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          // Ignore cache clear errors
        }
        
        // Clear any pending requests to ensure fresh data
        try {
          clearPendingRequests();
        } catch (e) {
          console.warn('Clear pending requests warning:', e);
        }
        
        // Close modal immediately
        setShowDeleteModal(false);
        toast.success('Banner deleted successfully!');
        
        // 🚀 INSTANT: Optimistically remove from UI immediately
        // Use proper ID comparison (handle both string and object IDs)
        setBanners(prev => prev.filter(b => {
          const bId = b._id?.toString() || b._id;
          return bId !== deletedId;
        }));
        
        // Update summary counts immediately
        setSummary(prev => ({
          ...prev,
          totalBanners: Math.max(0, prev.totalBanners - 1),
          activeBanners: deletedIsActive 
            ? Math.max(0, prev.activeBanners - 1) 
            : prev.activeBanners,
          inactiveBanners: !deletedIsActive 
            ? Math.max(0, prev.inactiveBanners - 1) 
            : prev.inactiveBanners
        }));
        
        setTotalItems(prev => Math.max(0, prev - 1));
        setSelectedBanner(null);
        
        // 🚀 INSTANT: Reload data in background to ensure sync (but UI already updated optimistically)
        // Use a longer delay to ensure backend has processed the deletion
        setTimeout(() => {
          if (isMountedRef.current && loadBannersDataRef.current) {
            // 🔄 FORCE REFRESH: Force refresh with cache bypass to ensure deleted item doesn't reappear
            loadBannersDataRef.current(currentPage, itemsPerPage, true);
          }
        }, 500);
      } else {
        const errorMessage = data.message || data.error || 'Failed to delete banner';
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Delete banner error:', error);
      const errorMessage = error.message || 'An error occurred. Please try again.';
      showError(errorMessage);
    }
  }, [theaterId, selectedBanner, currentPage, itemsPerPage, toast, showError]);

  const handleCreateNewBanner = () => {
    setFormData({
      isActive: true,
      image: null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setSelectedBanner(null);
    setShowCreateModal(true);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Image handling functions
  const handleImageSelect = (file) => {
    setImageFile(file);
    setImageError('');
    setFormData(prev => ({
      ...prev,
      removeImage: false
    }));
  };

  const handleImageRemove = () => {
    setImageFile(null);
    setImageError('');
    setFormData(prev => ({
      ...prev,
      image: null,
      removeImage: true
    }));
  };

  const getCurrentImageValue = () => {
    if (imageFile) {
      return imageFile; // New file selected
    }
    if (formData.image && !formData.removeImage) {
      return formData.image; // Existing image URL
    }
    return null; // No image
  };

  // Initial load
  useEffect(() => {
    if (theaterId) {
      // Force refresh on initial load to ensure we get latest data
      loadBannersData(1, 10, true);
    } else {
      console.warn('⚠️ [Banners] No theaterId provided, skipping load');
    }
  }, [theaterId, loadBannersData]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Memoized skeleton component for loading states
  const TableRowSkeleton = useMemo(() => () => (
    <tr className="skeleton-row">
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  ), []);

  // Header button
  const headerButton = (
    <button 
      className="header-btn"
      onClick={handleCreateNewBanner}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </span>
      Create New Banner
    </button>
  );

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Banners" currentPage="banner">
        <PageContainer
          title="Banner Management"
          headerButton={headerButton}
          className="theater-banner-page"
        >
        
        {/* Stats Section */}
        <div className="qr-stats">
          <div className="stat-card">
            <div className="stat-number">{summary.activeBanners || 0}</div>
            <div className="stat-label">Active Banners</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.inactiveBanners || 0}</div>
            <div className="stat-label">Inactive Banners</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{summary.totalBanners || 0}</div>
            <div className="stat-label">Total Banners</div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="theater-filters">
          <div className="filter-controls">
            <div className="results-count">
              Showing {banners.length} of {totalItems} banners (Page {currentPage} of {totalPages})
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
                <th className="status-cell">Status</th>
                <th className="actions-cell">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="loading-cell">
                    <div className="loading-spinner"></div>
                    <span>Loading banners...</span>
                  </td>
                </tr>
              ) : banners.length > 0 ? (
                banners.map((banner, index) => {
                  const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;
                  return (
                    <tr key={banner._id} className={`theater-row ${!banner.isActive ? 'inactive' : ''}`}>
                      <td className="sno-cell">{serialNumber}</td>
                      <td className="photo-cell">
                        {(() => {
                          // Extract image URL from various possible fields
                          const imageSrc = banner.imageUrl || banner.image || null;
                          
                          // Validate imageSrc is a valid URL string
                          // Allow: http/https URLs, data URLs, blob URLs, relative paths, and GCS URLs
                          const validImageSrc = imageSrc && typeof imageSrc === 'string' && imageSrc.trim().length > 0 && 
                                                (imageSrc.startsWith('http') || 
                                                 imageSrc.startsWith('https') || 
                                                 imageSrc.startsWith('data:') || 
                                                 imageSrc.startsWith('blob:') ||
                                                 imageSrc.startsWith('/') ||
                                                 imageSrc.includes('storage.googleapis.com') ||
                                                 imageSrc.includes('googleapis.com')) 
                                                ? imageSrc.trim() 
                                                : null;
                          
                          if (validImageSrc) {
                            return (
                              <div className="theater-photo-thumb">
                                <InstantImage
                                  key={`banner-${banner._id}-${banner.updatedAt || banner._imageUpdated || ''}`}
                                  src={validImageSrc}
                                  alt={`Banner ${serialNumber}`}
                                  loading="eager"
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block'
                                  }}
                                  onError={(e) => {
                                    console.error('Banner image failed to load:', banner.imageUrl);
                                    e.target.style.display = 'none';
                                    if (e.target.parentElement) {
                                      e.target.parentElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: #9ca3af;"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-1l2.5-3.21 1.79 2.15 2.5-3.22L21 19H3l3-3.86z"/></svg>';
                                    }
                                  }}
                                  onLoad={() => {
                                  }}
                                />
                              </div>
                            );
                          } else {
                            return (
                              <div className="theater-photo-thumb no-photo">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                                  <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-1l2.5-3.21 1.79 2.15 2.5-3.22L21 19H3l3-3.86z"/>
                                </svg>
                              </div>
                            );
                          }
                        })()}
                      </td>
                      <td className="status-cell">
                        <span className={`status-badge ${banner.isActive ? 'active' : 'inactive'}`}>
                          {banner.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <ActionButtons>
                          <ActionButton 
                            type="view"
                            onClick={() => viewBanner(banner)}
                            title="View Details"
                          />
                          <ActionButton 
                            type="edit"
                            onClick={() => editBanner(banner)}
                            title="Edit Banner"
                          />
                          <ActionButton 
                            type="delete"
                            onClick={() => deleteBanner(banner)}
                            title="Delete Banner"
                          />
                        </ActionButtons>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    <i className="fas fa-image fa-3x"></i>
                    <h3>No Banners Found</h3>
                    <p>There are no banners available for management at the moment.</p>
                    <button 
                      className="add-theater-btn" 
                      onClick={handleCreateNewBanner}
                    >
                      Create First Banner
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
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            itemType="banners"
          />
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Banner</h2>
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
                    <label>Banner Image (Required)</label>
                    <ImageUpload
                      value={getCurrentImageValue()}
                      onChange={handleImageSelect}
                      onRemove={handleImageRemove}
                      error={imageError}
                      label="Upload Banner Image"
                      helperText="Drag and drop an image here, or click to select (required)"
                      className="form-helper-text"
                      maxSize={900 * 1024}
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
                  onClick={() => handleSubmitBanner(false)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Banner'}
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
                <h2>Edit Banner</h2>
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
                    <label>Banner Image</label>
                    <ImageUpload
                      value={getCurrentImageValue()}
                      onChange={handleImageSelect}
                      onRemove={handleImageRemove}
                      error={imageError}
                      label="Upload Banner Image"
                      helperText="Drag and drop an image here, or click to select (optional - leave empty to keep existing)"
                      className="form-helper-text"
                      maxSize={900 * 1024}
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
                  onClick={() => handleSubmitBanner(true)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
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
                <h2>Banner Details</h2>
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
                    <label>Status</label>
                    <select 
                      value={selectedBanner?.isActive ? 'Active' : 'Inactive'} 
                      className="form-control"
                      disabled
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  {selectedBanner?.imageUrl && (
                    <div className="form-group full-width">
                      <label>Banner Image</label>
                      <div className="empty-state-center">
                        <InstantImage
                          src={selectedBanner.imageUrl}
                          alt="Banner"
                          loading="eager"
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
                        />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Created At</label>
                    <input 
                      type="text" 
                      value={selectedBanner?.createdAt ? new Date(selectedBanner.createdAt).toLocaleString() : ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Updated At</label>
                    <input 
                      type="text" 
                      value={selectedBanner?.updatedAt ? new Date(selectedBanner.updatedAt).toLocaleString() : ''} 
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
                <p>Are you sure you want to delete this banner?</p>
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
                  onClick={handleDeleteBanner}
                  className="confirm-delete-btn"
                >
                  Delete Banner
                </button>
              </div>
            </div>
          </div>
        )}

        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default TheaterBanner;
