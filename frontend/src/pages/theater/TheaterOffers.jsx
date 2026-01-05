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
import '@styles/pages/theater/TheaterOffers.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';



const TheaterOffers = () => {
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal()
  const toast = useToast();;

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterOffers');

  // Data state
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    activeOffers: 0,
    inactiveOffers: 0,
    totalOffers: 0
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
  const [selectedOffer, setSelectedOffer] = useState(null);
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
  const loadOffersDataRef = useRef(null); // Ref to store loadOffersData function

  // Ensure mounted ref is set on component mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset horizontal scroll position on mount to prevent scroll persistence bug
  useEffect(() => {
    // Reset scroll position of table container and window
    const tableContainer = document.querySelector('.theater-table-container');
    if (tableContainer) {
      tableContainer.scrollLeft = 0;
    }
    // Also reset window scroll to prevent any horizontal scrolling
    window.scrollTo(0, window.scrollY);
  }, []);

  // Validate theater access - removed client-side check, backend handles access control
  // useEffect(() => {
  //   if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {
  //     showError('Access denied: You can only manage categories for your assigned theater');
  //     return;
  //   }
  // }, [theaterId, userTheaterId, userType, showError]);

  // Load offers data with caching
  const loadOffersData = useCallback(async (page = 1, limit = 10, forceRefresh = false) => {

    if (!isMountedRef.current || !theaterId) {
      console.warn('⚠️ Skipping load - isMounted:', isMountedRef.current, 'theaterId:', theaterId);
      return;
    }

    const cacheKey = `theaterOffers_${theaterId}_p${page}_l${limit}`;

    // Check cache first (skip if force refresh)
    if (!forceRefresh) {
      const cached = getCachedData(cacheKey, 120000); // 2-minute cache
      if (cached && isMountedRef.current) {
        setOffers(cached.offers);
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

      const baseUrl = `${config.api.baseUrl}/theater-offers/${theaterId}?${params.toString()}`;

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
        // ✅ FIX: Use dynamic cache key with pagination parameters to prevent page 1 data being returned for other pages
        cacheKey: forceRefresh ? null : `theater_offers_${theaterId}_p${page}_l${limit}`,
        cacheTTL: forceRefresh ? 0 : 300000, // 5 minutes cache
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
      console.log('📥 [Offers] API Response received:', {
        success: data?.success,
        hasData: !!data?.data,
        hasOffers: !!data?.data?.offers,
        offersType: Array.isArray(data?.data?.offers) ? 'array' : typeof data?.data?.offers,
        offersLength: Array.isArray(data?.data?.offers) ? data.data.offers.length : 'N/A',
        dataKeys: data?.data ? Object.keys(data.data) : [],
        fullData: data
      });

      if (!isMountedRef.current) return;

      // ✅ FIX: Handle both explicit success and implicit success (when data exists)
      const isSuccess = data && (data.success === true || (data.data && !data.error));

      if (isSuccess) {
        // ✅ FIX: Handle multiple possible response structures with better logging
        let offers = [];

        // Try multiple possible locations for offers array
        if (Array.isArray(data.data?.offers)) {
          offers = data.data.offers;
        } else if (Array.isArray(data.data?.offerList)) {
          // Backend might return offerList instead of offers
          offers = data.data.offerList;
        } else if (Array.isArray(data.data)) {
          offers = data.data;
        } else if (Array.isArray(data.offers)) {
          offers = data.offers;
        } else if (Array.isArray(data.offerList)) {
          offers = data.offerList;
        } else {
          console.warn('⚠️ [Offers] No offers array found in response. Response structure:', {
            hasData: !!data.data,
            dataType: typeof data.data,
            dataKeys: data.data ? Object.keys(data.data) : [],
            hasOffers: !!data.offers,
            hasOfferList: !!data.offerList,
            offersType: typeof data.offers,
            fullData: data
          });
          offers = [];
        }

        // Ensure offers is always an array
        if (!Array.isArray(offers)) {
          console.warn('Offers data is not an array:', offers);
          offers = [];
        }

        // ✅ FIX: Ensure all offers have proper imageUrl and updatedAt fields
        offers = offers.map(offer => ({
          ...offer,
          imageUrl: offer.imageUrl || offer.image,
          updatedAt: offer.updatedAt || offer.createdAt || new Date().toISOString()
        }));

        // ✅ FIX: Smart merge - preserve optimistic updates when refreshing after create/edit
        setOffers(prev => {
          // If this is a force refresh and we have existing offers, merge intelligently
          if (forceRefresh && prev.length > 0 && offers.length > 0) {
            // Merge: Keep items from server, but also preserve any optimistically added items
            const merged = [...offers];
            // Add any items from prev that aren't in offers (preserve optimistic updates temporarily)
            prev.forEach(prevOffer => {
              const prevId = prevOffer._id?.toString() || prevOffer._id;
              const exists = merged.some(offer => {
                const offerId = offer._id?.toString() || offer._id;
                return offerId === prevId;
              });
              if (!exists) {
                // Item was optimistically added but not yet in server response, keep it
                merged.push(prevOffer);
              }
            });
            return merged;
          }
          // Normal load or empty state - replace completely
          return offers;
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
          activeOffers: statisticsData.active || 0,
          inactiveOffers: statisticsData.inactive || 0,
          totalOffers: statisticsData.total || 0
        };

        setSummary(summary);

        // Cache the data
        setCachedData(cacheKey, {
          offers,
          totalItems: totalItemsCount,
          totalPages: totalPagesCount,
          summary
        });
      } else {
        // Handle API error response or unexpected structure
        console.error('❌ [Offers] API error or unexpected response:', {
          success: data?.success,
          error: data?.error,
          message: data?.message,
          hasData: !!data?.data,
          dataStructure: data?.data ? Object.keys(data.data) : []
        });

        // ✅ FIX: Even if success is false, try to extract offers if they exist
        let offers = [];
        if (data?.data?.offers && Array.isArray(data.data.offers)) {
          offers = data.data.offers;
        }

        setOffers(offers);
        setTotalItems(offers.length);
        setTotalPages(offers.length > 0 ? 1 : 0);
        setCurrentPage(1);
        setSummary({
          activeOffers: offers.filter(o => o.isActive).length,
          inactiveOffers: offers.filter(o => !o.isActive).length,
          totalOffers: offers.length
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        console.error('❌ [Offers] Error loading offers:', error);
        // ✅ FIX: Provide better error message handling - unifiedFetch throws Error objects with status property
        const errorStatus = error?.status || (error?.response?.status) || 'unknown';
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
        console.error('❌ [Offers] Error details:', {
          message: errorMessage,
          status: errorStatus,
          name: error?.name,
          code: error?.code
        });

        // Show empty state but don't show error modal (user can see empty state)
        // Only show error toast for non-network errors
        if (errorStatus !== 'unknown' && errorStatus !== 'NetworkError') {
          // Don't show error for 404 (no offers yet) or if it's a network issue
          if (errorStatus !== 404 && !errorMessage.includes('Failed to fetch')) {
            showError(`Failed to load offers: ${errorMessage}`);
          }
        }

        setOffers([]);
        setTotalItems(0);
        setTotalPages(0);
        setCurrentPage(1);
        setSummary({ activeOffers: 0, inactiveOffers: 0, totalOffers: 0 });
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [theaterId, showError]);

  // Store loadOffersData in ref for stable access
  useEffect(() => {
    loadOffersDataRef.current = loadOffersData;
  }, [loadOffersData]);

  // Pagination handlers
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    loadOffersData(1, newLimit);
  }, [loadOffersData]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadOffersData(newPage, itemsPerPage);
    }
  }, [totalPages, itemsPerPage, loadOffersData]);

  // CRUD Operations
  const viewOffer = (offer) => {
    setSelectedOffer(offer);
    setShowViewModal(true);
  };

  const editOffer = (offer) => {
    setSelectedOffer(offer);
    setFormData({
      isActive: offer.isActive,
      image: offer.imageUrl || null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setShowEditModal(true);
  };

  const deleteOffer = (offer) => {
    setSelectedOffer(offer);
    setShowDeleteModal(true);
  };

  // Submit handler for create/edit - Fixed for instant modal close and refresh
  const handleSubmitOffer = useCallback(async (isEdit = false) => {

    // ✅ FIX: Prevent double submission
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setImageError('');

      console.log('📋 [Offer Submit] Current form data:', {
        isActive: formData.isActive,
        hasImage: !!formData.image,
        hasImageFile: !!imageFile,
        imageFileName: imageFile?.name
      });

      // ✅ Client-side validation - Check required fields before submission
      // Validate image is required for new offers
      if (!isEdit && !imageFile) {
        setImageError('Please upload an offer image');
        setIsSubmitting(false);
        return;
      }

      // Only validate selectedOffer for edit (critical for API call)
      if (isEdit && !selectedOffer?._id) {
        setImageError('Invalid offer selected for editing');
        setIsSubmitting(false);
        return;
      }


      const url = isEdit
        ? `${config.api.baseUrl}/theater-offers/${theaterId}/${selectedOffer._id}`
        : `${config.api.baseUrl}/theater-offers/${theaterId}`;
      const method = isEdit ? 'PUT' : 'POST';

      // 🔍 DEBUG: Log form state before creating FormData
      console.log('📝 [Offer Submit] Form state:', {
        isActive: formData.isActive,
        hasImageFile: !!imageFile,
        imageFileName: imageFile?.name,
        isEdit: isEdit
      });

      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('isActive', formData.isActive ? 'true' : 'false');

      // Add image file if selected
      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }

      // Add remove image flag for edit operations
      if (isEdit && formData.removeImage) {
        formDataToSend.append('removeImage', 'true');
      }

      // 🔍 DEBUG: Log FormData contents
      for (let [key, value] of formDataToSend.entries()) {
      }
      console.log('🌐 [Offer Submit] Request details:', {
        url: url,
        method: method
      });

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

      // ✅ FIX: unifiedFetch throws errors for non-OK responses, so response should be OK here
      // Parse response JSON - unifiedFetch returns data in json() method
      const data = await response.json();

      console.log('📥 [Offer Create] Response received:', {
        success: data?.success,
        hasError: !!data?.error,
        hasOffer: !!(data?.data?.offer || data?.offer),
        hasData: !!data?.data,
        responseStatus: response?.status,
        fullResponse: data
      });

      // ✅ FIX: Determine success based on data structure (don't rely on response.ok which may be undefined)
      // Success if: data.success === true OR we have data.offer/data.data OR no error field
      const hasError = data?.error || (data?.success === false);
      const hasSuccessData = data?.success === true || data?.data || data?.data?.offer || data?.offer;
      const isSuccess = !hasError && hasSuccessData;

      console.log('✅ [Offer Create] Success check:', {
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
        const offerData = data.data?.offer || data.offer || data.data;

        if (offerData && (offerData._id || offerData.id)) {
          const processedOffer = {
            ...offerData,
            imageUrl: offerData.imageUrl || offerData.image,
            _id: offerData._id || offerData.id,
            updatedAt: offerData.updatedAt || offerData.createdAt || new Date().toISOString(),
            isActive: offerData.isActive !== undefined ? offerData.isActive : true
          };

          console.log('✅ [Offer Create] Processing offer data:', {
            id: processedOffer._id,
            isActive: processedOffer.isActive,
            hasImage: !!processedOffer.imageUrl
          });

          if (isEdit) {
            // Update existing offer instantly
            setOffers(prev => prev.map(o => {
              const oId = o._id?.toString() || o._id;
              const pId = processedOffer._id?.toString() || processedOffer._id;
              if (oId === pId) {
                return {
                  ...processedOffer,
                  _imageUpdated: Date.now(),
                  updatedAt: processedOffer.updatedAt || new Date().toISOString()
                };
              }
              return o;
            }));
          } else {
            // ✅ FIX: Add new offer to the list INSTANTLY (before API refresh)
            setOffers(prev => {
              const pId = processedOffer._id?.toString() || processedOffer._id;
              const exists = prev.some(o => {
                const oId = o._id?.toString() || o._id;
                return oId === pId;
              });
              if (exists) {
                return prev.map(o => {
                  const oId = o._id?.toString() || o._id;
                  return oId === pId ? { ...o, ...processedOffer, _imageUpdated: Date.now() } : o;
                });
              }
              // Add to beginning of list for instant visibility
              const updated = [{ ...processedOffer, _imageUpdated: Date.now() }, ...prev];
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
                totalOffers: prev.totalOffers + 1,
                activeOffers: processedOffer.isActive ? prev.activeOffers + 1 : prev.activeOffers,
                inactiveOffers: !processedOffer.isActive ? prev.inactiveOffers + 1 : prev.inactiveOffers
              };
              return newSummary;
            });
          }
        } else {
          // ✅ FIX: If no offer data in response, still reload to get fresh data
          console.warn('⚠️ [Offer Create] No offer data in response, will reload from server');
          console.warn('⚠️ [Offer Create] Response data:', data);
          // Still reload to get the newly created offer from server
        }

        // Reset form immediately
        setFormData({
          isActive: true,
          image: null,
          removeImage: false
        });
        setImageFile(null);
        setImageError('');
        setSelectedOffer(null);

        // Show success message
        toast.success(isEdit ? 'Offer updated successfully!' : 'Offer created successfully!');

        // 🚀 INSTANT: Clear all related caches (after optimistic update)
        try {
          clearCachePattern(`theaterOffers_${theaterId}`);
          clearCachePattern(`offers_${theaterId}`);
          clearCachePattern(`theater_offers_${theaterId}`);
        } catch (e) {
          console.warn('Cache clear warning:', e);
        }

        // Clear optimizedFetch cache patterns
        try {
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`theaterOffers_${theaterId}`) ||
              key.includes(`offers_${theaterId}`) ||
              key.includes(`theater_offers_${theaterId}`)) {
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

        // 🚀 INSTANT: Reload data from backend to sync (but UI already shows new offer)
        // ✅ FIX: After create, reload from page 1 to see the new offer (new items usually appear first)
        // Use a longer delay to ensure backend has processed the creation and optimistic update is visible
        setTimeout(() => {
          if (isMountedRef.current && loadOffersDataRef.current) {
            // After create, go to page 1; after edit, stay on current page
            const pageToLoad = isEdit ? currentPage : 1;
            // Don't set loading state during refresh to preserve optimistic update visibility
            // ✅ FIX: Wrap reload in try-catch to prevent reload errors from affecting create success
            try {
              loadOffersDataRef.current(pageToLoad, itemsPerPage, true);
              if (!isEdit) {
                setCurrentPage(1); // Update current page state
              }
            } catch (reloadError) {
              // ✅ FIX: Log reload error but don't show error to user (offer was created successfully)
              console.warn('⚠️ [Offer Create] Failed to reload offers after create (non-critical):', reloadError);
              // Offer was created successfully, so we don't need to show an error
              // The optimistic update is already visible, and user can manually refresh if needed
            }
          }
        }, 500); // Longer delay to ensure backend has processed and optimistic update stays visible
      } else {
        // Handle error response
        const errorMessage = data?.message || data?.error || 'Failed to save offer';
        console.error('❌ [Offer Create] Error response:', errorMessage, data);
        setImageError(errorMessage);
        showError(errorMessage);
        // ✅ FIX: Reset submitting state immediately on error
        setIsSubmitting(false);
        // ✅ FIX: Don't close modal on error - keep it open so user can fix issues
      }
    } catch (error) {
      console.error('❌ [Offer Create] Exception caught:', error);
      console.error('❌ [Offer Create] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        response: error?.response,
        status: error?.status,
        fullError: error
      });

      // Extract detailed error message
      let errorMessage = 'An error occurred. Please try again.';

      if (error?.response?.data?.details) {
        // Backend validation errors
        const details = error.response.data.details;
        if (Array.isArray(details) && details.length > 0) {
          errorMessage = details.map(d => d.msg || d.message).join(', ');
        } else {
          errorMessage = error.response.data.error || error.response.data.message;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      console.error('❌ [Offer Create] Final error message:', errorMessage);

      setImageError(errorMessage);
      showError(errorMessage);
      // ✅ FIX: Reset submitting state immediately on error
      setIsSubmitting(false);
      // ✅ FIX: Don't close modal on error - keep it open so user can fix issues
    }
    // Note: No finally block needed - isSubmitting is reset in both success and error paths
  }, [theaterId, selectedOffer, formData, imageFile, currentPage, itemsPerPage, toast, showError, isSubmitting]);

  const handleDeleteOffer = useCallback(async () => {
    try {
      if (!selectedOffer || !selectedOffer._id) {
        showError('No offer selected for deletion');
        return;
      }

      const offerId = selectedOffer._id;

      const response = await unifiedFetch(`${config.api.baseUrl}/theater-offers/${theaterId}/${offerId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
      });

      // ✅ FIX: unifiedFetch throws errors for non-OK responses, so if we get here, response should be OK
      if (!response) {
        throw new Error('No response received from server');
      }

      const data = await response.json();

      // Determine success based on data structure (don't rely on response.ok which may be undefined)
      const hasError = data.error || (data.success === false);
      const isSuccess = !hasError && (data.success === true || data.message || !data.error);

      if (isSuccess) {
        // Store deleted ID for proper comparison (handle string/object ID differences)
        const deletedId = offerId?.toString() || offerId;
        const deletedIsActive = selectedOffer?.isActive !== false;

        // 🚀 INSTANT: Clear all related caches immediately
        try {
          clearCachePattern(`theaterOffers_${theaterId}`);
          clearCachePattern(`offers_${theaterId}`);
        } catch (e) {
          console.warn('Cache clear warning:', e);
        }

        // Clear optimizedFetch cache patterns
        try {
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`theaterOffers_${theaterId}`) || key.includes(`offers_${theaterId}`)) {
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
        toast.success('Offer deleted successfully!');

        // 🚀 INSTANT: Optimistically remove from UI immediately
        // Use proper ID comparison (handle both string and object IDs)
        setOffers(prev => prev.filter(o => {
          const oId = o._id?.toString() || o._id;
          return oId !== deletedId;
        }));

        // Update summary counts immediately
        setSummary(prev => ({
          ...prev,
          totalOffers: Math.max(0, prev.totalOffers - 1),
          activeOffers: deletedIsActive
            ? Math.max(0, prev.activeOffers - 1)
            : prev.activeOffers,
          inactiveOffers: !deletedIsActive
            ? Math.max(0, prev.inactiveOffers - 1)
            : prev.inactiveOffers
        }));

        setTotalItems(prev => Math.max(0, prev - 1));
        setSelectedOffer(null);

        // 🚀 INSTANT: Reload data in background to ensure sync (but UI already updated optimistically)
        // Use a longer delay to ensure backend has processed the deletion
        setTimeout(() => {
          if (isMountedRef.current && loadOffersDataRef.current) {
            // 🔄 FORCE REFRESH: Force refresh with cache bypass to ensure deleted item doesn't reappear
            loadOffersDataRef.current(currentPage, itemsPerPage, true);
          }
        }, 500);
      } else {
        const errorMessage = data.message || data.error || 'Failed to delete offer';
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Delete offer error:', error);
      const errorMessage = error.message || 'An error occurred. Please try again.';
      showError(errorMessage);
    }
  }, [theaterId, selectedOffer, currentPage, itemsPerPage, toast, showError]);

  const handleCreateNewOffer = () => {
    setFormData({
      isActive: true,
      image: null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setSelectedOffer(null);
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setImageError('');
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

  // Reset error states when create modal opens
  useEffect(() => {
    if (showCreateModal) {
      setImageError('');
    }
  }, [showCreateModal]);

  // Initial load
  useEffect(() => {
    if (theaterId) {
      // Force refresh on initial load to ensure we get latest data
      loadOffersData(1, 10, true);
    } else {
      console.warn('⚠️ [Offers] No theaterId provided, skipping load');
    }
  }, [theaterId, loadOffersData]);

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
      <td><div className="skeleton-text"></div></td>
    </tr>
  ), []);

  // Header button
  const headerButton = (
    <button
      className="header-btn"
      onClick={handleCreateNewOffer}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </span>
      CREATE NEW OFFER
    </button>
  );

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Offers" currentPage="offers">
        <PageContainer
          title="Offer Management"
          headerButton={headerButton}
          className="theater-offers-page"
        >

          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.activeOffers || 0}</div>
              <div className="stat-label">Active Offers</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.inactiveOffers || 0}</div>
              <div className="stat-label">Inactive Offers</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalOffers || 0}</div>
              <div className="stat-label">Total Offers</div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="theater-filters">
            <div className="filter-controls">
              <div className="results-count">
                Showing {offers.length} of {totalItems} offers (Page {currentPage} of {totalPages})
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
                      <span>Loading offers...</span>
                    </td>
                  </tr>
                ) : offers.length > 0 ? (
                  offers.map((offer, index) => {
                    const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={offer._id} className={`theater-row ${!offer.isActive ? 'inactive' : ''}`}>
                        <td className="sno-cell">{serialNumber}</td>
                        <td className="photo-cell">
                          {(() => {
                            // Extract image URL from various possible fields
                            const imageSrc = offer.imageUrl || offer.image || null;

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
                                    key={`offer-${offer._id}-${offer.updatedAt || offer._imageUpdated || ''}`}
                                    src={validImageSrc}
                                    alt={`Offer ${serialNumber}`}
                                    loading="eager"
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      display: 'block'
                                    }}
                                    onError={(e) => {
                                      console.error('Offer image failed to load:', offer.imageUrl);
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
                                    <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-1l2.5-3.21 1.79 2.15 2.5-3.22L21 19H3l3-3.86z" />
                                  </svg>
                                </div>
                              );
                            }
                          })()}
                        </td>
                        <td className="status-cell">
                          <span className={`status-badge ${offer.isActive ? 'active' : 'inactive'}`}>
                            {offer.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <ActionButtons>
                            <ActionButton
                              type="view"
                              onClick={() => viewOffer(offer)}
                              title="View Details"
                            />
                            <ActionButton
                              type="edit"
                              onClick={() => editOffer(offer)}
                              title="Edit Offer"
                            />
                            <ActionButton
                              type="delete"
                              onClick={() => deleteOffer(offer)}
                              title="Delete Offer"
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
                      <h3>No Offers Found</h3>
                      <p>There are no offers available for management at the moment.</p>
                      <button
                        className="add-theater-btn"
                        onClick={handleCreateNewOffer}
                      >
                        Create First Offer
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
              itemType="offers"
            />
          )}

          {/* Create Modal */}
          {showCreateModal && (
            <div className="modal-overlay" onClick={handleCloseCreateModal}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Create New Offer</h2>
                  <button
                    className="close-btn"
                    onClick={handleCloseCreateModal}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
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
                      <label>Offer Image (Required)</label>
                      <ImageUpload
                        value={getCurrentImageValue()}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Offer Image"
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
                    onClick={handleCloseCreateModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handleSubmitOffer(false)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Offer'}
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
                  <h2>Edit Offer</h2>
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
                      <label>Offer Image</label>
                      <ImageUpload
                        value={getCurrentImageValue()}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Offer Image"
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
                    onClick={() => handleSubmitOffer(true)}
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
                  <h2>Offer Details</h2>
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
                      <label>Status</label>
                      <select
                        value={selectedOffer?.isActive ? 'Active' : 'Inactive'}
                        className="form-control"
                        disabled
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                    {selectedOffer?.imageUrl && (
                      <div className="form-group full-width">
                        <label>Offer Image</label>
                        <div className="empty-state-center">
                          <InstantImage
                            src={selectedOffer.imageUrl}
                            alt="Offer"
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
                        value={selectedOffer?.createdAt ? new Date(selectedOffer.createdAt).toLocaleString() : ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Updated At</label>
                      <input
                        type="text"
                        value={selectedOffer?.updatedAt ? new Date(selectedOffer.updatedAt).toLocaleString() : ''}
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
                  <p>Are you sure you want to delete this offer?</p>
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
                    onClick={handleDeleteOffer}
                    className="confirm-delete-btn"
                  >
                    Delete Offer
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

export default TheaterOffers;
