import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import Pagination from '@components/Pagination';
import ErrorBoundary from '@components/ErrorBoundary';
import ImageUpload from '@components/common/ImageUpload';
import InstantImage from '@components/InstantImage'; // 🚀 Instant image loading
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { useModal } from '@contexts/ModalContext';
import { useToast } from '@contexts/ToastContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { clearCachePattern } from '@utils/cacheUtils';
import { invalidateRelatedCaches } from '@utils/crudOptimizer';
import { clearPendingRequests } from '@utils/apiOptimizer';
import config from '@config';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/skeleton.css'; // 🚀 Skeleton loading styles
import '@styles/pages/theater/TheaterCategories.css'; // Extracted inline styles
import { unifiedFetch } from '@utils/unifiedFetch';



const TheaterCategories = React.memo(() => {
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal();
  const toast = useToast();

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterCategories');

  // 🚀 INSTANT: Check cache synchronously on initialization
  const initialCachedCategories = (() => {
    if (!theaterId) return null;
    try {
      const cacheKey = `categories_${theaterId}_1_10_`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.categories || [];
      }
    } catch (e) { }
    return null;
  })();

  // Data state
  const [categories, setCategories] = useState(initialCachedCategories || []);
  const [loading, setLoading] = useState(!initialCachedCategories); // 🚀 Start false if cache exists
  const [initialLoadDone, setInitialLoadDone] = useState(!!initialCachedCategories); // 🚀 Mark done if cache exists
  const lastLoadKeyRef = useRef('');
  const [summary, setSummary] = useState({
    activeCategories: 0,
    inactiveCategories: 0,
    totalCategories: 0
  });

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');

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
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
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
  const loadCategoriesDataRef = useRef(null); // Ref to store loadCategoriesData function

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

  // 🚀 ULTRA-OPTIMIZED: Load categories data - Instant with memory cache
  const loadCategoriesData = useCallback(async (page = 1, limit = 10, search = '', skipCache = false, forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) {
      return;
    }

    // 🚀 INSTANT MEMORY CACHE CHECK - Use sessionStorage for persistence
    const memoryCacheKey = `categories_${theaterId}_${page}_${limit}_${search}`;

    // Skip cache if force refresh is requested
    if (!skipCache && !forceRefresh) {
      try {
        const cached = sessionStorage.getItem(memoryCacheKey);
        if (cached) {
          const memCached = JSON.parse(cached);
          // INSTANT state update from cache (< 0.1ms) - NO loading state needed
          setCategories(memCached.categories || []);
          setTotalItems(memCached.totalItems || 0);
          setTotalPages(memCached.totalPages || 1);
          setCurrentPage(page);
          setSummary(memCached.summary || {
            activeCategories: 0,
            inactiveCategories: 0,
            totalCategories: 0
          });
          setLoading(false);
          setInitialLoadDone(true);

          // Background refresh (non-blocking)
          if (page === 1 && !search) {
            setTimeout(() => {
              if (isMountedRef.current && loadCategoriesDataRef.current) {
                loadCategoriesDataRef.current(1, limit, '', true);
              }
            }, 100);
          }
          return;
        }
      } catch (e) {
        console.warn('Cache read failed:', e);
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // Only show loading on first load or if no memory cache
      if (!skipCache && !initialLoadDone) {
        setLoading(true);
      }

      const params = new URLSearchParams({
        page: page,
        limit: limit,
        q: search || '',
        _t: Date.now()
      });

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      const baseUrl = `${config.api.baseUrl}/theater-categories/${theaterId}?${params.toString()}`;

      // � FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json'
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      // 🚀 SIMPLE & RELIABLE: Regular fetch with proper error handling
      const response = await unifiedFetch(baseUrl, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        // ✅ FIX: Include pagination and search in cache key to avoid returning page 1 data for other pages
        cacheKey: `theater_categories_${theaterId}_p${page}_l${limit}_s${search}`,
        cacheTTL: 300000 // 5 minutes
      });

      // Parse response - unifiedFetch returns data in json() method
      const data = await response.json();

      // Check for errors in data structure (don't rely on response.ok which may be undefined)
      if (data.error || (data.success === false)) {
        throw new Error(data.message || data.error || 'Failed to load categories');
      }

      if (!isMountedRef.current) return;

      // Success if data.success is true OR we have data (data.success can be undefined)
      if (data.success !== false && (data.success === true || data.data || data.categories)) {
        // Handle both data.data.categories and data.data (array) structures
        let categories = Array.isArray(data.data?.categories)
          ? data.data.categories
          : (Array.isArray(data.data) ? data.data : (data.categories || []));

        // Ensure categories is always an array
        if (!Array.isArray(categories)) {
          console.warn('Categories data is not an array:', categories);
          categories = [];
        }

        // ✅ FIX: Log raw category data to debug imageUrl (simplified)
        if (categories.length > 0 && categories[0]) {
          console.log('📦 [Categories] Sample category from API:', {
            categoryName: categories[0].categoryName || categories[0].name,
            imageUrl: categories[0].imageUrl,
            hasImageUrl: !!categories[0].imageUrl,
            imageUrlPreview: categories[0].imageUrl ? categories[0].imageUrl.substring(0, 80) + '...' : null
          });
        }

        // 🚀 ULTRA-OPTIMIZED: Process data efficiently
        categories = categories
          .map(cat => {
            // ✅ FIX: Ensure imageUrl is properly set and normalized
            let imageUrl = cat.imageUrl || cat.image || cat.categoryImage || null;

            // ✅ FIX: Log imageUrl processing (only if imageUrl exists)
            if (imageUrl && (cat.categoryName || cat.name)) {
            }

            // ✅ FIX: Normalize image URL - convert relative paths to absolute URLs
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
              const trimmedUrl = imageUrl.trim();

              // If it's already absolute (http/https), keep it
              if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
                imageUrl = trimmedUrl;
              }
              // If it's a data URL or blob URL, keep it
              else if (trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:')) {
                imageUrl = trimmedUrl;
              }
              // If it's a GCS URL, keep it
              else if (trimmedUrl.includes('storage.googleapis.com') || trimmedUrl.includes('googleapis.com')) {
                imageUrl = trimmedUrl;
              }
              // If it starts with /, prepend API base URL
              else if (trimmedUrl.startsWith('/')) {
                imageUrl = `${config.api.baseUrl}${trimmedUrl}`;
              }
              // Otherwise, assume relative path
              else {
                imageUrl = `${config.api.baseUrl}/${trimmedUrl}`;
              }
            } else {
              console.warn('⚠️ [Category Processing] No valid image URL found for category:', cat.categoryName || cat.name);
              imageUrl = null;
            }

            return {
              ...cat,
              imageUrl: imageUrl,
              image: imageUrl // Also set image for backward compatibility
            };
          })
          .sort((a, b) => {
            const idA = a._id || '';
            const idB = b._id || '';
            return idA.localeCompare(idB);
          });

        // 🚀 BATCH ALL STATE UPDATES
        const paginationData = data.data?.pagination || data.pagination || {};
        const statisticsData = data.data?.statistics || data.statistics || {};

        const summaryData = {
          activeCategories: statisticsData.active || 0,
          inactiveCategories: statisticsData.inactive || 0,
          totalCategories: statisticsData.total || 0
        };

        setCategories(categories);
        setTotalItems(paginationData.totalItems || 0);
        setTotalPages(paginationData.totalPages || 1);
        setCurrentPage(page);
        setSummary(summaryData);
        setLoading(false);
        setInitialLoadDone(true);

        // 🚀 Store in sessionStorage for instant access (< 0.1ms)
        try {
          sessionStorage.setItem(memoryCacheKey, JSON.stringify({
            categories: categories,
            totalItems: paginationData.totalItems || 0,
            totalPages: paginationData.totalPages || 1,
            summary: summaryData
          }));
        } catch (e) {
          console.warn('Cache write failed:', e);
        }
      } else {
        // Handle API error response
        console.error('API returned success=false:', data.message || data.error);
        setCategories([]);
        setTotalItems(0);
        setTotalPages(0);
        setCurrentPage(1);
        setSummary({
          activeCategories: 0,
          inactiveCategories: 0,
          totalCategories: 0
        });
        setLoading(false);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        // Don't clear existing data on error
        setLoading(false);
      }
    }
  }, [theaterId, categories.length]);

  // Store loadCategoriesData in ref for stable access - Set immediately
  loadCategoriesDataRef.current = loadCategoriesData;

  useEffect(() => {
    loadCategoriesDataRef.current = loadCategoriesData;
  }, [loadCategoriesData]);

  // 🚀 OPTIMIZED: Debounced search - Ultra-fast 50ms delay
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loadCategoriesDataRef.current) {
        loadCategoriesDataRef.current(1, itemsPerPage, query);
      }
    }, 50); // Ultra-fast 50ms delay for instant response
  }, [itemsPerPage]);

  // Search handler
  const handleSearch = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  // 🚀 OPTIMIZED: Pagination handlers - Use ref for stable access
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    if (loadCategoriesDataRef.current) {
      loadCategoriesDataRef.current(1, newLimit, searchTerm);
    }
  }, [searchTerm]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages && loadCategoriesDataRef.current) {
      loadCategoriesDataRef.current(newPage, itemsPerPage, searchTerm);
    }
  }, [totalPages, itemsPerPage, searchTerm]);

  // CRUD Operations - Memoized for performance
  const viewCategory = useCallback((category) => {
    setSelectedCategory(category);
    setShowViewModal(true);
  }, []);

  const editCategory = useCallback((category) => {
    setSelectedCategory(category);
    setFormData({
      name: category.categoryName || category.name || '',
      isActive: category.isActive,
      image: category.imageUrl || null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setShowEditModal(true);
  }, []);

  const deleteCategory = useCallback((category) => {
    setSelectedCategory(category);
    setShowDeleteModal(true);
  }, []);

  // Submit handler for create/edit - Memoized
  const handleSubmitCategory = useCallback(async (isEdit = false) => {
    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    // Validate required fields
    if (!formData.name || !formData.name.trim()) {
      setImageError('Category name is required');
      return;
    }

    // Validate selectedCategory for edit
    if (isEdit && !selectedCategory?._id) {
      setImageError('Category not selected for editing');
      return;
    }

    // Store form data before resetting
    const currentFormData = { ...formData };
    const currentImageFile = imageFile;
    const currentSelectedCategory = selectedCategory;

    // 🚀 INSTANT UI UPDATE: Optimistically update UI immediately
    const optimisticCategory = {
      _id: isEdit ? currentSelectedCategory._id : `temp-${Date.now()}`,
      categoryName: currentFormData.name,
      name: currentFormData.name,
      isActive: currentFormData.isActive,
      imageUrl: currentImageFile ? URL.createObjectURL(currentImageFile) : (isEdit ? (currentSelectedCategory?.imageUrl || currentSelectedCategory?.image) : null),
      image: currentImageFile ? URL.createObjectURL(currentImageFile) : (isEdit ? (currentSelectedCategory?.imageUrl || currentSelectedCategory?.image) : null),
      createdAt: isEdit ? currentSelectedCategory?.createdAt : new Date(),
      updatedAt: new Date()
    };

    // Update UI immediately with optimistic data
    if (!isEdit) {
      // Add new category to list immediately
      setCategories(prev => [optimisticCategory, ...prev]);
      // Update summary counts immediately
      setSummary(prev => ({
        ...prev,
        totalCategories: prev.totalCategories + 1,
        activeCategories: optimisticCategory.isActive !== false ? prev.activeCategories + 1 : prev.activeCategories
      }));
      setTotalItems(prev => prev + 1);
    } else {
      // Update existing category in list immediately
      setCategories(prev => prev.map(cat => {
        const catId = cat._id?.toString() || cat._id;
        const editId = currentSelectedCategory._id?.toString() || currentSelectedCategory._id;
        return catId === editId ? { ...cat, ...optimisticCategory } : cat;
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
      isActive: true,
      image: null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setSelectedCategory(null);

    try {
      setIsSubmitting(true);

      const url = isEdit
        ? `${config.api.baseUrl}/theater-categories/${theaterId}/${currentSelectedCategory._id}`
        : `${config.api.baseUrl}/theater-categories/${theaterId}`;
      const method = isEdit ? 'PUT' : 'POST';

      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('categoryName', currentFormData.name);  // Backend expects 'categoryName'
      formDataToSend.append('isActive', currentFormData.isActive);

      // Add image file if selected
      if (currentImageFile) {
        formDataToSend.append('image', currentImageFile);
      }

      // Add remove image flag for edit operations
      if (isEdit && currentFormData.removeImage) {
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
      const responseData = await response.json();

      // Determine success based on data structure (don't rely on response.ok which may be undefined)
      // Success if: data.success === true OR we have data.category/data.data OR no error field
      const hasError = responseData.error || (responseData.success === false);
      const hasSuccessData = responseData.success === true || responseData.data || responseData.data?.category || responseData.category;
      const isSuccess = !hasError && (hasSuccessData || !responseData.error);

      if (isSuccess) {
        // ✅ SYNC: Replace optimistic update with real backend data
        const newCategory = responseData.data?.category || responseData.data || responseData.category;
        if (newCategory) {
          const processedCategory = {
            ...newCategory,
            // ✅ FIX: Prioritize imageUrl from response (backend now includes it)
            imageUrl: newCategory.imageUrl || newCategory.image || null,
            categoryName: newCategory.categoryName || newCategory.name,
            name: newCategory.name || newCategory.categoryName
          };

          if (!isEdit) {
            // Replace optimistic entry with real data
            setCategories(prev => {
              // Remove optimistic entry (temp ID) and add real one
              const filtered = prev.filter(cat => {
                const catId = cat._id?.toString() || cat._id;
                return !catId.toString().startsWith('temp-');
              });
              // Check if real entry already exists
              const exists = filtered.some(cat => {
                const catId = cat._id?.toString() || cat._id;
                const newId = processedCategory._id?.toString() || processedCategory._id;
                return catId === newId;
              });
              if (exists) {
                return filtered.map(cat => {
                  const catId = cat._id?.toString() || cat._id;
                  const newId = processedCategory._id?.toString() || processedCategory._id;
                  return catId === newId ? processedCategory : cat;
                });
              }
              return [processedCategory, ...filtered];
            });
          } else {
            // Replace optimistic update with real backend data
            setCategories(prev => prev.map(cat => {
              const catId = cat._id?.toString() || cat._id;
              const newId = processedCategory._id?.toString() || processedCategory._id;
              return catId === newId ? processedCategory : cat;
            }));
          }
        }

        // Show success message
        toast.success(isEdit ? 'Category updated successfully!' : 'Category created successfully!', 3000);

        // ✅ FIX: Comprehensive cache invalidation for Categories
        try {
          // Clear all Category cache variations
          clearCachePattern(`categories_${theaterId}`);
          clearCachePattern(`theaterCategories_${theaterId}`);
          clearCachePattern(`theater_categories_${theaterId}`);
          clearCachePattern(`categories`);
          clearCachePattern(`theaterCategories`);
          // Use invalidateRelatedCaches for comprehensive clearing
          invalidateRelatedCaches('category', theaterId);
          // Also clear product caches since products reference categories
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          // Clear all sessionStorage entries matching category patterns
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`categories_${theaterId}`) ||
              key.includes(`theaterCategories_${theaterId}`) ||
              key.includes(`theater_categories_${theaterId}`)) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('⚠️ Category cache clear warning:', e);
        }

        // ✅ FIX: Dispatch event to trigger refresh in other pages (Cafe, Product Management)
        try {
          window.dispatchEvent(new CustomEvent('categoryUpdated', {
            detail: { theaterId, categoryId: processedCategory._id }
          }));
        } catch (e) {
          // Ignore event dispatch errors
        }

        // Refresh data in background
        setTimeout(() => {
          if (loadCategoriesDataRef.current && isMountedRef.current) {
            loadCategoriesDataRef.current(currentPage, itemsPerPage, searchTerm, true, true);
          }
        }, 500); // Reduced delay for faster refresh
      } else {
        // Handle error response - revert optimistic update and reopen modal
        const errorMessage = responseData.message || responseData.error || 'Failed to save category';
        toast.error(errorMessage, 5000);
        console.error('Error saving category:', responseData);

        // Revert optimistic update
        if (!isEdit) {
          setCategories(prev => prev.filter(cat => {
            const catId = cat._id?.toString() || cat._id;
            return !catId.toString().startsWith('temp-');
          }));
          setSummary(prev => ({
            ...prev,
            totalCategories: Math.max(0, prev.totalCategories - 1),
            activeCategories: optimisticCategory.isActive !== false
              ? Math.max(0, prev.activeCategories - 1)
              : prev.activeCategories
          }));
          setTotalItems(prev => Math.max(0, prev - 1));
        } else {
          // Revert to original data
          setCategories(prev => prev.map(cat => {
            const catId = cat._id?.toString() || cat._id;
            const editId = currentSelectedCategory._id?.toString() || currentSelectedCategory._id;
            return catId === editId ? currentSelectedCategory : cat;
          }));
        }

        // Reopen modal on error so user can fix and retry
        if (isEdit) {
          setShowEditModal(true);
          // Restore form data
          setFormData(currentFormData);
          setImageFile(currentImageFile);
          setSelectedCategory(currentSelectedCategory);
        } else {
          setShowCreateModal(true);
          // Restore form data
          setFormData(currentFormData);
          setImageFile(currentImageFile);
        }
      }
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error(error.message || 'Failed to save category');

      // Revert optimistic update
      if (!isEdit) {
        setCategories(prev => prev.filter(cat => {
          const catId = cat._id?.toString() || cat._id;
          return !catId.toString().startsWith('temp-');
        }));
        setSummary(prev => ({
          ...prev,
          totalCategories: Math.max(0, prev.totalCategories - 1),
          activeCategories: optimisticCategory.isActive !== false
            ? Math.max(0, prev.activeCategories - 1)
            : prev.activeCategories
        }));
        setTotalItems(prev => Math.max(0, prev - 1));
      } else {
        // Revert to original data
        setCategories(prev => prev.map(cat => {
          const catId = cat._id?.toString() || cat._id;
          const editId = currentSelectedCategory._id?.toString() || currentSelectedCategory._id;
          return catId === editId ? currentSelectedCategory : cat;
        }));
      }

      // Reopen modal on error so user can see the error
      if (isEdit) {
        setShowEditModal(true);
        // Restore form data
        setFormData(currentFormData);
        setImageFile(currentImageFile);
        setSelectedCategory(currentSelectedCategory);
      } else {
        setShowCreateModal(true);
        // Restore form data
        setFormData(currentFormData);
        setImageFile(currentImageFile);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [theaterId, selectedCategory, formData, imageFile, currentPage, itemsPerPage, searchTerm, isSubmitting, showError, toast]);

  // Handle delete - Memoized
  const handleDeleteCategory = useCallback(async () => {
    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-categories/${theaterId}/${selectedCategory._id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
      });

      // Parse response JSON
      const data = await response.json();

      // Determine success based on data structure (don't rely on response.ok)
      const hasError = data.error || (data.success === false);
      const isSuccess = !hasError && (data.success === true || data.message || !data.error);

      if (isSuccess) {
        // Store deleted ID for proper comparison (handle string/object ID differences)
        const deletedId = selectedCategory._id?.toString() || selectedCategory._id;
        const deletedIsActive = selectedCategory.isActive !== false;

        // 🚀 INSTANT UI UPDATE: Optimistically remove from UI immediately
        // Use proper ID comparison (handle both string and object IDs)
        setCategories(prev => prev.filter(cat => {
          const catId = cat._id?.toString() || cat._id;
          return catId !== deletedId;
        }));

        // Update summary counts immediately
        setSummary(prev => ({
          ...prev,
          totalCategories: Math.max(0, prev.totalCategories - 1),
          activeCategories: deletedIsActive
            ? Math.max(0, prev.activeCategories - 1)
            : prev.activeCategories,
          inactiveCategories: !deletedIsActive
            ? Math.max(0, prev.inactiveCategories - 1)
            : prev.inactiveCategories
        }));
        setTotalItems(prev => Math.max(0, prev - 1));

        // Close delete modal immediately
        setShowDeleteModal(false);
        setSelectedCategory(null);

        // Show success message
        toast.success('Category deleted successfully!', 3000);

        // ✅ FIX: Comprehensive cache invalidation for Categories
        try {
          // Clear all Category cache variations
          clearCachePattern(`categories_${theaterId}`);
          clearCachePattern(`theaterCategories_${theaterId}`);
          clearCachePattern(`theater_categories_${theaterId}`);
          clearCachePattern(`categories`);
          clearCachePattern(`theaterCategories`);
          // Use invalidateRelatedCaches for comprehensive clearing
          invalidateRelatedCaches('category', theaterId);
          // Also clear product caches since products reference categories
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          // Clear all sessionStorage entries matching category patterns
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`categories_${theaterId}`) ||
              key.includes(`theaterCategories_${theaterId}`) ||
              key.includes(`theater_categories_${theaterId}`)) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('⚠️ Category cache clear warning:', e);
        }

        // ✅ FIX: Dispatch event to trigger refresh in other pages (Cafe, Product Management)
        try {
          window.dispatchEvent(new CustomEvent('categoryUpdated', {
            detail: { theaterId, categoryId: processedCategory._id }
          }));
        } catch (e) {
          // Ignore event dispatch errors
        }

        // Refresh data in background to ensure sync (but UI already updated optimistically)
        // Use a longer delay to ensure backend has processed the deletion
        setTimeout(() => {
          if (loadCategoriesDataRef.current && isMountedRef.current) {
            // Force refresh with cache bypass to ensure deleted item doesn't reappear
            loadCategoriesDataRef.current(currentPage, itemsPerPage, searchTerm, true, true);
          }
        }, 500);
      } else {
        // Handle error response
        const errorMessage = data.message || data.error || 'Failed to delete category';
        toast.error(errorMessage, 5000);
        console.error('Error deleting category:', data);
        // Don't close modal on error so user can see the error
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(error.message || 'Failed to delete category');
      // Don't close modal on error so user can see the error
    }
  }, [theaterId, selectedCategory, currentPage, itemsPerPage, searchTerm, toast]);

  // Handle create new category - Memoized
  const handleCreateNewCategory = useCallback(() => {
    setFormData({
      name: '',
      isActive: true,
      image: null,
      removeImage: false
    });
    setImageFile(null);
    setImageError('');
    setSelectedCategory(null);
    setShowCreateModal(true);
  }, []);

  // Form input handlers - Memoized
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Image handling functions - Memoized
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
    setImageError('');
    setFormData(prev => ({
      ...prev,
      image: null,
      removeImage: true
    }));
  }, []);

  const getCurrentImageValue = () => {
    if (imageFile) {
      return imageFile; // New file selected
    }
    if (formData.image && !formData.removeImage) {
      return formData.image; // Existing image URL
    }
    return null; // No image
  };

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
    const loadFunction = loadCategoriesDataRef.current || loadCategoriesData;

    (async () => {
      try {
        // 🔄 FORCE REFRESH: Always force refresh on mount for fresh data
        await loadFunction(1, 10, '', false, true);
        if (isMounted) {
          setInitialLoadDone(true);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      } catch (error) {
        if (isMounted) {
          setLoading(false);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [theaterId, initialLoadDone, loadCategoriesData]); // Include loadCategoriesData as fallback

  // 🚀 AUTO-REFRESH: Refresh when page becomes visible or window gains focus
  useEffect(() => {
    if (!theaterId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && theaterId && loadCategoriesDataRef.current) {
        // Check if cache was cleared (no cache = likely data was changed externally)
        const cacheKey = `categories_${theaterId}_${currentPage}_${itemsPerPage}_${searchTerm || ''}`;
        try {
          const cached = sessionStorage.getItem(cacheKey);
          // If no cache or cache is old, refresh to get latest data
          if (!cached) {
            loadCategoriesDataRef.current(currentPage, itemsPerPage, searchTerm, false, true);
          } else {
            // Even if cache exists, do a background refresh to ensure data is up-to-date
            setTimeout(() => {
              if (isMountedRef.current && loadCategoriesDataRef.current) {
                loadCategoriesDataRef.current(currentPage, itemsPerPage, searchTerm, false, true);
              }
            }, 1000); // Refresh after 1 second to avoid immediate refresh
          }
        } catch (e) {
          console.warn('Cache check failed:', e);
        }
      }
    };

    const handleFocus = () => {
      if (theaterId && loadCategoriesDataRef.current) {
        // Check if cache was cleared
        const cacheKey = `categories_${theaterId}_${currentPage}_${itemsPerPage}_${searchTerm || ''}`;
        try {
          const cached = sessionStorage.getItem(cacheKey);
          // If no cache, refresh to get latest data
          if (!cached && categories.length > 0) {
            loadCategoriesDataRef.current(currentPage, itemsPerPage, searchTerm, false, true);
          }
        } catch (e) {
          console.warn('Cache check failed:', e);
        }
      }
    };

    // Auto-refresh interval (every 30 seconds when page is visible)
    let refreshInterval = null;
    const startAutoRefresh = () => {
      if (document.visibilityState === 'visible' && theaterId && loadCategoriesDataRef.current) {
        refreshInterval = setInterval(() => {
          if (isMountedRef.current && document.visibilityState === 'visible' && loadCategoriesDataRef.current) {
            loadCategoriesDataRef.current(currentPage, itemsPerPage, searchTerm, false, true);
          }
        }, 30000); // Refresh every 30 seconds
      }
    };

    // Start auto-refresh if page is visible
    startAutoRefresh();

    const handleVisibilityChangeEvent = () => {
      handleVisibilityChange();
      // Restart interval when page becomes visible, clear when hidden
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      if (document.visibilityState === 'visible') {
        startAutoRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChangeEvent);

    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChangeEvent);
      window.removeEventListener('focus', handleFocus);
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [theaterId, currentPage, itemsPerPage, searchTerm, categories.length]);

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

  // 🚀 OPTIMIZED: Memoized Category Table Row Component
  const CategoryRow = React.memo(({ category, index, currentPage, itemsPerPage, onView, onEdit, onDelete }) => {
    const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;

    return (
      <tr className={`theater-row ${!category.isActive ? 'inactive' : ''}`}>
        <td className="sno-cell">{serialNumber}</td>
        <td className="photo-cell">
          {(() => {
            // ✅ FIX: Extract image URL from various possible fields
            let imageSrc = category.imageUrl || category.image || category.categoryImage || null;

            // ✅ FIX: Log the raw category data for debugging (simplified)
            if (imageSrc) {
            }

            // ✅ FIX: Convert relative paths to absolute URLs
            if (imageSrc && typeof imageSrc === 'string' && imageSrc.trim().length > 0) {
              const trimmedSrc = imageSrc.trim();

              // If it's already an absolute URL (http/https), use it directly
              if (trimmedSrc.startsWith('http://') || trimmedSrc.startsWith('https://')) {
                imageSrc = trimmedSrc;
              }
              // If it's a data URL or blob URL, use it directly
              else if (trimmedSrc.startsWith('data:') || trimmedSrc.startsWith('blob:')) {
                imageSrc = trimmedSrc;
              }
              // If it's a GCS URL (storage.googleapis.com), use it directly
              else if (trimmedSrc.includes('storage.googleapis.com') || trimmedSrc.includes('googleapis.com')) {
                imageSrc = trimmedSrc;
              }
              // If it starts with /, it's a relative path - prepend API base URL
              else if (trimmedSrc.startsWith('/')) {
                imageSrc = `${config.api.baseUrl}${trimmedSrc}`;
              }
              // Otherwise, assume it's a relative path and prepend API base URL
              else {
                imageSrc = `${config.api.baseUrl}/${trimmedSrc}`;
              }

              // Log only for GCS URLs to track proxy usage
              if (imageSrc.includes('storage.googleapis.com')) {
              }
            } else {
              // Only log warning if we expected an image but didn't find one
              // (Don't spam console for categories that legitimately don't have images)
              if (category.imageUrl !== null && category.imageUrl !== undefined) {
                console.warn('⚠️ [Category Image] Invalid image URL found:', {
                  categoryName: category.categoryName || category.name,
                  imageUrl: category.imageUrl,
                  imageUrlType: typeof category.imageUrl
                });
              }
              imageSrc = null;
            }

            if (imageSrc) {
              // ✅ FIX: Use proxy for GCS URLs to avoid CORS issues
              let finalImageSrc = imageSrc;
              const isGCS = imageSrc.includes('storage.googleapis.com') || imageSrc.includes('googleapis.com');

              if (isGCS) {
                // For GCS URLs, use proxy endpoint via GET (simpler)
                // Ensure we use the correct API path
                finalImageSrc = `${config.api.baseUrl}/proxy-image?url=${encodeURIComponent(imageSrc)}`;
              }

              // ✅ FIX: Use direct img tag for better reliability and immediate rendering
              return (
                <div className="theater-photo-thumb">
                  <img
                    src={finalImageSrc}
                    alt={category.name || category.categoryName || 'Category'}
                    loading="eager"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                    onError={(e) => {
                      console.error('❌ [Category Image] Image failed to load:', {
                        categoryName: category.categoryName || category.name,
                        imageUrl: finalImageSrc,
                        originalUrl: imageSrc,
                        error: e
                      });

                      // ✅ FIX: Try POST proxy as fallback if GET proxy failed
                      if (isGCS && finalImageSrc.includes('/proxy-image?url=')) {
                        const img = e.target;
                        const postUrl = `${config.api.baseUrl}/proxy-image`;
                        fetch(postUrl, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: imageSrc })
                        })
                          .then(res => {
                            if (!res.ok) {
                              console.error('❌ [Category Image] POST proxy response not OK:', res.status, res.statusText);
                              throw new Error(`POST proxy failed: ${res.status} ${res.statusText}`);
                            }
                            return res.blob();
                          })
                          .then(blob => {
                            const blobUrl = URL.createObjectURL(blob);
                            img.src = blobUrl;
                          })
                          .catch(err => {
                            console.error('❌ [Category Image] POST proxy also failed:', err);
                            // Show placeholder
                            img.style.display = 'none';
                            if (img.parentElement) {
                              img.parentElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: #9ca3af;"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z"/></svg>';
                            }
                          });
                      } else {
                        // Show placeholder on error for non-GCS URLs
                        e.target.style.display = 'none';
                        if (e.target.parentElement) {
                          e.target.parentElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: #9ca3af;"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z"/></svg>';
                        }
                      }
                    }}
                    onLoad={() => {
                      console.log('✅ [Category Image] Image loaded successfully:', {
                        categoryName: category.categoryName || category.name,
                        imageUrl: finalImageSrc
                      });
                    }}
                    crossOrigin={isGCS ? "anonymous" : undefined}
                  />
                </div>
              );
            } else {
              return (
                <div className="theater-photo-thumb no-photo">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z" />
                  </svg>
                </div>
              );
            }
          })()}
        </td>
        <td className="name-cell">
          <div className="qr-info">
            <div className="qr-name">{category.categoryName || category.name}</div>
          </div>
        </td>
        <td className="status-cell">
          <span className={`status-badge ${category.isActive ? 'active' : 'inactive'}`}>
            {category.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="actions-cell">
          <ActionButtons>
            <ActionButton
              type="view"
              onClick={() => onView(category)}
              title="View Details"
            />
            <ActionButton
              type="edit"
              onClick={() => onEdit(category)}
              title="Edit Category"
            />
            <ActionButton
              type="delete"
              onClick={() => onDelete(category)}
              title="Delete Category"
            />
          </ActionButtons>
        </td>
      </tr>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison function for better performance
    return (
      prevProps.category._id === nextProps.category._id &&
      prevProps.index === nextProps.index &&
      prevProps.currentPage === nextProps.currentPage &&
      prevProps.itemsPerPage === nextProps.itemsPerPage &&
      prevProps.category.categoryName === nextProps.category.categoryName &&
      prevProps.category.name === nextProps.category.name &&
      prevProps.category.isActive === nextProps.category.isActive &&
      prevProps.category.imageUrl === nextProps.category.imageUrl
    );
  });

  CategoryRow.displayName = 'CategoryRow';

  // 🚀 OPTIMIZED: Memoized header button to prevent re-renders
  const headerButton = useMemo(() => (
    <button
      className="header-btn"
      onClick={handleCreateNewCategory}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </span>
      Create New Category
    </button>
  ), [handleCreateNewCategory]);

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Categories" currentPage="categories">
        <PageContainer
          title="Category Management"
          headerButton={headerButton}
        >

          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.activeCategories || 0}</div>
              <div className="stat-label">Active Categories</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.inactiveCategories || 0}</div>
              <div className="stat-label">Inactive Categories</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalCategories || 0}</div>
              <div className="stat-label">Total Categories</div>
            </div>
          </div>

          {/* Enhanced Filters Section matching TheaterList */}
          <div className="theater-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search categories by name..."
                value={searchTerm}
                onChange={handleSearch}
                className="search-input"
              />
            </div>
            <div className="filter-controls">
              <div className="results-count">
                Showing {categories.length > 0 ? ((currentPage - 1) * itemsPerPage + 1) : 0}
                {' - '}
                {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} categories
                {' (Page '}{currentPage} of {totalPages || 1}{')'}
              </div>
              <div className="items-per-page">
                <label>Items per page:</label>
                <select value={itemsPerPage} onChange={handleItemsPerPageChange} className="items-select">
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
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
                  <th className="name-cell">Category Name</th>
                  <th className="status-cell">Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !initialLoadDone && categories.length === 0 ? (
                  // 🚀 INSTANT: Show skeleton instead of spinner
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className="skeleton-row">
                      <td><div className="skeleton-box skeleton-box-small" /></td>
                      <td><div className="skeleton-box skeleton-box-image" /></td>
                      <td><div className="skeleton-box skeleton-box-medium" /></td>
                      <td><div className="skeleton-box skeleton-box-name" /></td>
                      <td><div className="skeleton-box skeleton-box-status" /></td>
                    </tr>
                  ))
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-cell">
                      <i className="fas fa-folder fa-3x"></i>
                      <h3>No Categories Found</h3>
                      <p>There are no categories available for management at the moment.</p>
                      <button className="add-theater-btn" onClick={handleCreateNewCategory}>
                        Create First Category
                      </button>
                    </td>
                  </tr>
                ) : (
                  categories.map((category, index) => (
                    <CategoryRow
                      key={category._id}
                      category={category}
                      index={index}
                      currentPage={currentPage}
                      itemsPerPage={itemsPerPage}
                      onView={viewCategory}
                      onEdit={editCategory}
                      onDelete={deleteCategory}
                    />
                  ))
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
              itemType="categories"
            />
          )}

          {/* Create Modal */}
          {showCreateModal && (
            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Create New Category</h2>
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
                      <label>Category Name</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="form-control"
                        placeholder="Enter category name"
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
                      <label>Category Image</label>
                      <ImageUpload
                        value={getCurrentImageValue()}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Category Image"
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSubmitCategory(false);
                    }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Category'}
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
                  <h2>Edit Category</h2>
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
                      <label>Category Name</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="form-control"
                        placeholder="Enter category name"
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
                      <label>Category Image</label>
                      <ImageUpload
                        value={getCurrentImageValue()}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Category Image"
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSubmitCategory(true);
                    }}
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
                  <h2>Category Details</h2>
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
                      <label>Category Name</label>
                      <input
                        type="text"
                        value={selectedCategory?.name || ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={selectedCategory?.isActive ? 'Active' : 'Inactive'}
                        className="form-control"
                        disabled
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                    {(selectedCategory?.imageUrl || selectedCategory?.image) && (
                      <div className="form-group full-width">
                        <label>Category Image</label>
                        <div className="empty-state-center">
                          <InstantImage
                            src={selectedCategory.imageUrl || selectedCategory.image}
                            alt={selectedCategory.name || selectedCategory.categoryName || 'Category'}
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
                            onError={(e) => {
                              // Error handled by InstantImage component
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="form-group">
                      <label>Created At</label>
                      <input
                        type="text"
                        value={selectedCategory?.createdAt ? new Date(selectedCategory.createdAt).toLocaleString() : ''}
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Updated At</label>
                      <input
                        type="text"
                        value={selectedCategory?.updatedAt ? new Date(selectedCategory.updatedAt).toLocaleString() : ''}
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
                  <p>Are you sure you want to delete the category <strong>{selectedCategory?.name}</strong>?</p>
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
                    onClick={handleDeleteCategory}
                    className="confirm-delete-btn"
                  >
                    Delete Category
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

TheaterCategories.displayName = 'TheaterCategories';

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

export default TheaterCategories;
