import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import Pagination from '@components/Pagination';
import ErrorBoundary from '@components/ErrorBoundary';
import ImageUpload from '@components/common/ImageUpload';
import InstantImage from '@components/InstantImage'; // 🚀 Instant image loading
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getCachedData, setCachedData, clearCachePattern } from '@utils/cacheUtils';
import { invalidateRelatedCaches } from '@utils/crudOptimizer';
import config from '@config';
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/TheaterGlobalModals.css'; // ✅ FIX: Import global modal styles for form grid layout
import '@styles/pages/theater/TheaterProductTypes.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';

import {
  ChevronLeft,
  Heart,
  Minus,
  Plus,
  CheckCircle2,
  Layers
} from 'lucide-react';

// Size and Price Definitions for Preview
const PREVIEW_SIZES = ['6"', '8"', '10"', '12"', '14"', '16"', '18"', '20"', '22"', '24"'];

const PREVIEW_SIZE_PRICES = {
  '6"': 149,
  '8"': 199,
  '10"': 249,
  '12"': 299,
  '14"': 349,
  '16"': 399,
  '18"': 449,
  '20"': 499,
  '22"': 549,
  '24"': 599
};

const PREVIEW_SIZE_QUANTITY = {
  '6"': '200 ML',
  '8"': '300 ML',
  '10"': '400 ML',
  '12"': '500 ML',
  '14"': '600 ML',
  '16"': '700 ML',
  '18"': '850 ML',
  '20"': '1000 ML',
  '22"': '1200 ML',
  '24"': '1500 ML'
};

const PREVIEW_SIZE_IMAGES = {
  '6"': 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?q=80&w=800&auto=format&fit=crop',
  '8"': 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?q=80&w=800&auto=format&fit=crop',
  '10"': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop',
  '12"': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop',
  '14"': 'https://images.unsplash.com/photo-1593504049359-74330189a345?q=80&w=800&auto=format&fit=crop',
  '16"': 'https://images.unsplash.com/photo-1593504049359-74330189a345?q=80&w=800&auto=format&fit=crop',
  '18"': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=800&auto=format&fit=crop',
  '20"': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=800&auto=format&fit=crop',
  '22"': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=800&auto=format&fit=crop',
  '24"': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=800&auto=format&fit=crop'
};

const SizeButton = ({ label, imageUrl, isSelected, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`relative min-w-[60px] h-[60px] rounded-full flex items-center justify-center transition-all duration-300 border overflow-hidden ${isSelected
      ? 'border-black shadow-lg scale-110 ring-2 ring-black ring-offset-2'
      : 'border-gray-200 hover:border-black opacity-70 hover:opacity-100'
      }`}
  >
    <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
  </button>
);

const ProductDetailView = ({ product, onClose }) => {
  const productName = product?.productName || 'Unknown Product';

  // Get product image - check all possible image fields
  const getProductImage = () => {
    // Check imageData field first (normalized from backend)
    if (product?.imageData) {
      const imageData = typeof product.imageData === 'string'
        ? product.imageData
        : (product.imageData.url || product.imageData.path || product.imageData.src || product.imageData);
      if (imageData) return imageData;
    }

    // Check images array
    if (product?.images && Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      if (typeof firstImage === 'string') {
        return firstImage;
      } else if (firstImage && typeof firstImage === 'object') {
        return firstImage.url || firstImage.path || firstImage.src || firstImage;
      }
    }

    // Check other possible fields
    return product?.imageUrl || product?.image || null;
  };

  const productImage = getProductImage();

  // Use proxy for GCS images if needed
  let finalImageSrc = productImage;
  if (finalImageSrc) {
    // If it's a relative path, prepend base URL
    if (finalImageSrc.startsWith('/')) {
      const baseUrl = config.api.baseUrl.endsWith('/')
        ? config.api.baseUrl.slice(0, -1)
        : config.api.baseUrl;
      finalImageSrc = `${baseUrl}${finalImageSrc}`;
    } else if (!finalImageSrc.startsWith('http://') && !finalImageSrc.startsWith('https://') && !finalImageSrc.startsWith('data:')) {
      // If it doesn't start with /, it might be a relative path without leading slash
      const baseUrl = config.api.baseUrl.endsWith('/')
        ? config.api.baseUrl
        : `${config.api.baseUrl}/`;
      finalImageSrc = `${baseUrl}${finalImageSrc}`;
    }

    // ✅ FIX: No manual proxying here - InstantImage component handles GCS URLs automatically
    // via POST proxy to avoid header size limits and improve reliability
  }

  return (
    <>
      {/* Modal Header - Using Global Design */}
      <div className="modal-header">
        <h2>Product Type Details</h2>
        <button
          className="close-btn"
          type="button"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Modal Body - Scrollable Content Area */}
      <div className="modal-body">
        <div className="edit-form">
          <div className="form-group">
            <label>Product Name</label>
            <input
              type="text"
              value={productName}
              className="form-control"
              readOnly
            />
          </div>

          <div className="form-group">
            <label>Product Code / SKU</label>
            <input
              type="text"
              value={product?.productCode || ''}
              className="form-control"
              readOnly
            />
          </div>

          <div className="form-group">
            <label>No.Qty</label>
            <input
              type="text"
              value={product?.noQty || 1}
              className="form-control"
              readOnly
            />
          </div>

          <div className="form-group">
            <label>Quantity</label>
            <div className="quantity-input-wrapper">
              <input
                type="text"
                value={product?.quantity || ''}
                className="form-control quantity-input"
                readOnly
              />
              <div className="quantity-unit-selector">
                <select
                  value={product?.quantityUnit || 'Nos'}
                  className="quantity-unit-select"
                  disabled
                >
                  <option value="Nos">Nos</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="ML">ML</option>
                </select>
                <svg
                  className="quantity-unit-arrow"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              value={product?.isActive !== false ? 'Active' : 'Inactive'}
              className="form-control"
              disabled
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              value={product?.description || ''}
              className="form-control"
              readOnly
              rows="3"
            />
          </div>

          {/* Product Image - At the bottom like edit form */}
          <div className="form-group full-width">
            <label>Product Image</label>
            {finalImageSrc ? (
              <div style={{ marginTop: '8px', textAlign: 'center' }}>
                <InstantImage
                  src={finalImageSrc}
                  alt={productName}
                  style={{
                    maxWidth: '300px',
                    maxHeight: '300px',
                    borderRadius: '12px',
                    objectFit: 'cover',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }}
                  fallback={
                    <div style={{
                      width: '300px',
                      height: '200px',
                      borderRadius: '12px',
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      color: '#9ca3af'
                    }}>
                      No Image Available
                    </div>
                  }
                />
              </div>
            ) : (
              <div style={{
                width: '300px',
                height: '200px',
                borderRadius: '12px',
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '8px auto 0',
                color: '#9ca3af'
              }}>
                No Image Available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Actions - Using Global Design */}
      <div className="modal-actions">
        <button
          className="btn-secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </>
  );
};
const TheaterProductTypes = React.memo(() => {
  const { theaterId } = useParams();
  const navigate = useNavigate();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal()
  const toast = useToast();;

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterProductTypes');

  // Data state
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const lastLoadKeyRef = useRef('');
  const [summary, setSummary] = useState({
    activeProductTypes: 0,
    inactiveProductTypes: 0,
    totalProductTypes: 0
  });

  // Search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'inactive'

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
  const [selectedProductType, setSelectedProductType] = useState(null);

  // ✅ FIX: Store scroll position when modals open/close - Using body position locking technique
  const scrollPositionRef = useRef(0);
  const scrollBlockerTimeoutRef = useRef(null);
  const isModalOpenRef = useRef(false);

  // ✅ FIX: Lock body scroll position when modals open (prevents scroll-to-top)
  useEffect(() => {
    const hasAnyModalOpen = showCreateModal || showEditModal || showViewModal || showDeleteModal;

    if (hasAnyModalOpen && !isModalOpenRef.current) {
      // Lock body scroll position when modals open (prevents scroll-to-top)
      if (document.body.style.position !== 'fixed') {
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
        scrollPositionRef.current = scrollY;

        // Lock body position to prevent scroll-to-top
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
      }
      isModalOpenRef.current = true;
    } else if (!hasAnyModalOpen && isModalOpenRef.current) {
      // Restore scroll position when modals close
      isModalOpenRef.current = false;
      const savedScrollY = scrollPositionRef.current;

      // Restore body styles
      const body = document.body;
      const scrollY = body.style.top;
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.overflow = '';

      // Restore scroll position
      if (scrollY) {
        const scrollValue = parseInt(scrollY || '0') * -1;
        window.scrollTo(0, scrollValue);
      } else if (savedScrollY > 0) {
        window.scrollTo(0, savedScrollY);
      }

      // Multiple restoration attempts for consistency
      const restoreScroll = () => {
        if (savedScrollY > 0) {
          window.scrollTo(0, savedScrollY);
        }
      };

      restoreScroll();
      requestAnimationFrame(() => {
        restoreScroll();
        setTimeout(restoreScroll, 10);
        setTimeout(restoreScroll, 50);
      });
    }
  }, [showCreateModal, showEditModal, showViewModal, showDeleteModal]);
  const [formData, setFormData] = useState({
    productName: '',
    productCode: '',
    description: '',
    quantity: '',
    quantityUnit: 'Nos',
    noQty: '',
    isActive: true
  });

  // Image upload state
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageError, setImageError] = useState('');

  // Refs for cleanup and performance
  const abortControllerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadProductTypesDataRef = useRef(null); // Ref to store loadProductTypesData function

  // Ensure mounted ref is set on component mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle missing theaterId - redirect to proper URL
  useEffect(() => {
    // Get effective theaterId from URL params or auth context
    let effectiveTheaterId = theaterId || userTheaterId;

    // If still no theater ID, try to extract from user data
    if (!effectiveTheaterId && user) {
      if (user.assignedTheater) {
        effectiveTheaterId = user.assignedTheater._id || user.assignedTheater;
      } else if (user.theater) {
        effectiveTheaterId = user.theater._id || user.theater;
      }
    }

    // If no theaterId in URL but we found one, redirect to proper URL
    if (!theaterId && effectiveTheaterId) {
      navigate(`/theater-product-types/${effectiveTheaterId}`, { replace: true });
      return;
    }

    // If no theaterId at all, show error
    if (!theaterId && !effectiveTheaterId) {
      console.error('Theater ID not found. Please login again.');
      toast.error('Theater ID not found. Please login again.');
      navigate('/login', { replace: true });
      return;
    }
  }, [theaterId, userTheaterId, user, navigate, toast]);

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId && theaterId !== userTheaterId) {
      // Redirect to their own theater product types if trying to access another theater
      navigate(`/theater-product-types/${userTheaterId}`, { replace: true });
      return;
    }
  }, [theaterId, userTheaterId, userType, navigate]);

  // 🚀 ULTRA-OPTIMIZED: Load product types data - <90ms with instant cache
  const loadProductTypesData = useCallback(async (page = 1, limit = 10, search = '', skipCache = false, forceRefresh = false, status = 'all') => {
    if (!isMountedRef.current || !theaterId) {
      return;
    }

    // 🚀 INSTANT CACHE CHECK - Load from cache first (< 90ms)
    // Skip cache if force refresh is requested or status filter is applied
    if (!skipCache && !forceRefresh && page === 1 && !search && status === 'all') {
      const cacheKey = `theaterProductTypes_${theaterId}`;
      const cached = getCachedData(cacheKey, 300000); // 5-minute cache

      if (cached && isMountedRef.current) {
        // Cached data structure: { data, pagination, statistics }
        let cachedProductTypes = cached.data || [];
        const cachedPagination = cached.pagination || {};
        const cachedStatistics = cached.statistics || {};

        // Ensure cachedProductTypes is an array
        if (!Array.isArray(cachedProductTypes)) {
          cachedProductTypes = [];
        }

        // 🚀 ULTRA-FAST: Minimal processing for cache (< 90ms)
        // Always ensure imageUrl is set from all possible fields
        if (cachedProductTypes.length > 0) {
          cachedProductTypes = cachedProductTypes.map(pt => {
            // Only process if imageUrl is missing or if image field exists but imageUrl doesn't
            const hasImageUrl = pt.imageUrl && typeof pt.imageUrl === 'string' && pt.imageUrl.trim().length > 0;
            if (!hasImageUrl && (pt.image || pt.imageData || pt.productImage)) {
              return {
                ...pt,
                // Extract image from multiple possible fields (matching backend response structure)
                imageUrl: pt.image || pt.imageData || pt.productImage || null
              };
            }
            return pt;
          });
        }

        // Instant state update from cache (< 90ms) - Single batch update
        setProductTypes(cachedProductTypes);
        setTotalItems(cachedPagination.totalItems || 0);
        setTotalPages(cachedPagination.totalPages || 1);
        setCurrentPage(1);
        setSummary({
          activeProductTypes: cachedStatistics.active || 0,
          inactiveProductTypes: cachedStatistics.inactive || 0,
          totalProductTypes: cachedStatistics.total || 0
        });
        setLoading(false);

        // Fetch fresh data in background (non-blocking) - Update cache silently
        requestAnimationFrame(() => {
          if (isMountedRef.current && loadProductTypesDataRef.current) {
            loadProductTypesDataRef.current(1, limit, '', true, false, statusFilter);
          }
        });
        return;
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // Set loading at the start of fetch (unless skipping cache)
      if (!skipCache) {
        setLoading(true);
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: search || '',
        _t: Date.now().toString()
      });

      // ✅ DEBUG: Log pagination request
      console.log('📄 [Product Types] Loading page:', {
        page,
        limit,
        search,
        status,
        theaterId
      });

      // Add status filter if specified
      if (status && status !== 'all') {
        params.append('isActive', status === 'active' ? 'true' : 'false');
      }

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      const baseUrl = `${config.api.baseUrl}/theater-product-types/${theaterId}?${params.toString()}`;

      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
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
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        // ✅ FIX: Include pagination and filters in cache key to prevent showing same data on all pages
        cacheKey: `theater_product_types_${theaterId}_p${page}_l${limit}_s${search}_st${status}`,
        cacheTTL: 300000, // 5 minutes
        forceRefresh: forceRefresh
      });

      // Parse response - unifiedFetch returns data in json() method
      const data = await response.json();

      // Check for errors in data structure (don't rely on response.ok which may be undefined)
      if (data.error || (data.success === false)) {
        throw new Error(data.message || data.error || 'Failed to load product types');
      }

      if (!isMountedRef.current) return;

      // Success if data.success is true OR we have data (data.success can be undefined)
      if (data.success !== false && (data.success === true || data.data || data.productTypes)) {
        // Handle both data.data (array) and data.data.productTypes (nested) structures
        let productTypes = Array.isArray(data.data)
          ? data.data
          : (data.data?.productTypes || data.productTypes || []);

        // Ensure productTypes is always an array
        if (!Array.isArray(productTypes)) {
          console.warn('Product types data is not an array:', productTypes);
          productTypes = [];
        }

        // 🚀 ULTRA-OPTIMIZED: Process data efficiently - Ensure imageUrl is set from all possible fields
        // ✅ FIX: Don't sort here - backend already sorts before pagination
        // Sorting after pagination causes wrong items to show on each page
        productTypes = productTypes.map((pt, index) => {
          // Extract image from multiple possible fields (matching backend response structure)
          const imageUrl = pt.imageUrl || pt.image || pt.imageData || pt.productImage || null;

          return {
            ...pt,
            imageUrl: imageUrl
          };
        });

        // 🚀 BATCH ALL STATE UPDATES
        const paginationData = data.pagination || data.data?.pagination || {};
        const statisticsData = data.statistics || data.data?.statistics || {};

        setProductTypes(productTypes);
        setTotalItems(paginationData.totalItems || 0);
        setTotalPages(paginationData.totalPages || 1);
        setCurrentPage(page);
        setSummary({
          activeProductTypes: statisticsData.active || 0,
          inactiveProductTypes: statisticsData.inactive || 0,
          totalProductTypes: statisticsData.total || 0
        });
        setLoading(false);

        // Cache the response for instant future loads
        if (page === 1 && !search) {
          const cacheKey = `theaterProductTypes_${theaterId}`;
          setCachedData(cacheKey, {
            data: productTypes,
            pagination: paginationData,
            statistics: statisticsData
          });
        }
      } else {
        // Handle API error response
        console.error('API returned success=false:', data.message || data.error);
        setProductTypes([]);
        setTotalItems(0);
        setTotalPages(0);
        setCurrentPage(1);
        setSummary({
          activeProductTypes: 0,
          inactiveProductTypes: 0,
          totalProductTypes: 0
        });
        setLoading(false);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        // Don't clear existing data on error
        setLoading(false);
      }
    }
  }, [theaterId]);

  // Store loadProductTypesData in ref for stable access
  useEffect(() => {
    loadProductTypesDataRef.current = loadProductTypesData;
  }, [loadProductTypesData]);

  // 🚀 OPTIMIZED: Debounced search - Ultra-fast 90ms delay
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loadProductTypesDataRef.current) {
        setCurrentPage(1); // Reset to first page when searching
        loadProductTypesDataRef.current(1, itemsPerPage, query, false, false, statusFilter); // Reset to first page
      }
    }, 90); // Ultra-fast 90ms delay for near-instant response
  }, [itemsPerPage, statusFilter]);

  // Search handler
  const handleSearch = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  // Status filter handler
  const handleStatusChange = useCallback((e) => {
    const newStatus = e.target.value;
    setStatusFilter(newStatus);
    setCurrentPage(1); // Reset to first page when filter changes
    // Reset to first page when filter changes
    if (loadProductTypesDataRef.current) {
      loadProductTypesDataRef.current(1, itemsPerPage, searchTerm, false, false, newStatus);
    }
  }, [itemsPerPage, searchTerm]);

  // 🚀 OPTIMIZED: Pagination handlers - Use ref for stable access
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    setCurrentPage(1); // Reset to first page when items per page changes
    if (loadProductTypesDataRef.current) {
      loadProductTypesDataRef.current(1, newLimit, searchTerm, false, false, statusFilter);
    }
  }, [searchTerm, statusFilter]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages && loadProductTypesDataRef.current) {
      setCurrentPage(newPage); // Update page state immediately for better UX
      loadProductTypesDataRef.current(newPage, itemsPerPage, searchTerm, false, false, statusFilter);
    }
  }, [totalPages, itemsPerPage, searchTerm, statusFilter]);

  // CRUD Operations - Memoized for performance
  const viewProductType = useCallback((productType, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent) {
        event.nativeEvent.stopImmediatePropagation();
      }
    }

    setSelectedProductType(productType);
    setShowViewModal(true);
  }, []);

  const editProductType = useCallback((productType, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent) {
        event.nativeEvent.stopImmediatePropagation();
      }
    }

    setSelectedProductType(productType);

    // Parse quantity to extract value and unit (e.g., "5 Nos" -> quantity: "5", quantityUnit: "Nos")
    let quantityValue = '';
    let quantityUnit = 'Nos';
    if (productType.quantity) {
      const quantityStr = String(productType.quantity);
      // Try to extract unit from end (Nos, kg, g, L, ML)
      const units = ['Nos', 'ML', 'kg', 'g', 'L'];
      let foundUnit = false;
      for (const unit of units) {
        if (quantityStr.trim().endsWith(unit)) {
          quantityValue = quantityStr.trim().slice(0, -unit.length).trim();
          quantityUnit = unit;
          foundUnit = true;
          break;
        }
      }
      if (!foundUnit) {
        quantityValue = quantityStr;
      }
    }

    setFormData({
      productName: productType.productName || '',
      productCode: productType.productCode || '',
      description: productType.description || '',
      quantity: quantityValue,
      quantityUnit: quantityUnit,
      noQty: productType.noQty !== undefined ? productType.noQty : '',
      isActive: productType.isActive,
      imageUrl: productType.imageUrl || productType.image || productType.imageData || productType.productImage || null,
      removeImage: false
    });

    // Reset image states
    setImageFile(null);
    setImageError('');

    // Set current image preview if exists - Extract from multiple possible fields
    const imageSrc = productType.imageUrl || productType.image || productType.imageData || productType.productImage || null;
    if (imageSrc) {
      setImagePreview(imageSrc);
    } else {
      setImagePreview(null);
    }

    setShowEditModal(true);
  }, []);

  const deleteProductType = useCallback((productType, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent) {
        event.nativeEvent.stopImmediatePropagation();
      }
    }

    setSelectedProductType(productType);
    setShowDeleteModal(true);
  }, []);

  // ✅ FIX: Helper function to restore scroll position
  const restoreScrollPosition = useCallback(() => {
    const savedPosition = scrollPositionRef.current;
    if (savedPosition > 0) {
      const restoreScroll = () => {
        window.scrollTo(0, savedPosition);
        document.documentElement.scrollTop = savedPosition;
        document.body.scrollTop = savedPosition;
      };
      restoreScroll();
      requestAnimationFrame(() => {
        restoreScroll();
        setTimeout(restoreScroll, 0);
        setTimeout(restoreScroll, 10);
        setTimeout(restoreScroll, 50);
      });
    }
  }, []);

  // ✅ FIX: Helper function to close modal with scroll restoration
  const closeModalWithScrollRestore = useCallback((setModalFn) => {
    // Save current scroll before closing
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
    if (currentScroll > 0) {
      scrollPositionRef.current = currentScroll;
    }
    setModalFn(false);
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  // Submit handler for create/edit - Memoized
  const handleSubmitProductType = useCallback(async (isEdit = false) => {
    // Store form data before resetting
    const currentFormData = { ...formData };
    const currentImageFile = imageFile;
    const currentSelectedProductType = selectedProductType;

    // 🚀 INSTANT UI UPDATE: Optimistically update UI immediately
    const quantityWithUnit = currentFormData.quantity ? `${currentFormData.quantity} ${currentFormData.quantityUnit || 'Nos'}` : '';
    const optimisticProductType = {
      _id: isEdit ? currentSelectedProductType._id : `temp-${Date.now()}`,
      productName: currentFormData.productName,
      productCode: currentFormData.productCode,
      description: currentFormData.description || '',
      quantity: quantityWithUnit,
      noQty: currentFormData.noQty || '',
      isActive: currentFormData.isActive,
      imageUrl: currentImageFile ? URL.createObjectURL(currentImageFile) : (isEdit ? (currentSelectedProductType?.imageUrl || currentSelectedProductType?.image) : null),
      image: currentImageFile ? URL.createObjectURL(currentImageFile) : (isEdit ? (currentSelectedProductType?.imageUrl || currentSelectedProductType?.image) : null),
      createdAt: isEdit ? currentSelectedProductType?.createdAt : new Date(),
      updatedAt: new Date()
    };

    // Update UI immediately with optimistic data
    if (!isEdit) {
      // Add new product type to list immediately
      setProductTypes(prev => [optimisticProductType, ...prev]);
      // Update summary counts immediately
      setSummary(prev => ({
        ...prev,
        totalProductTypes: prev.totalProductTypes + 1,
        activeProductTypes: optimisticProductType.isActive !== false ? prev.activeProductTypes + 1 : prev.activeProductTypes
      }));
      setTotalItems(prev => prev + 1);
    } else {
      // Update existing product type in list immediately
      setProductTypes(prev => prev.map(pt => {
        const ptId = pt._id?.toString() || pt._id;
        const editId = currentSelectedProductType._id?.toString() || currentSelectedProductType._id;
        return ptId === editId ? { ...pt, ...optimisticProductType } : pt;
      }));
    }

    if (isEdit) {
      setShowEditModal(false);
    } else {
      setShowCreateModal(false);
    }

    // Reset form immediately after closing modal
    setFormData({
      productName: '',
      productCode: '',
      description: '',
      quantity: '',
      quantityUnit: 'Nos',
      noQty: '',
      isActive: true
    });
    setImageFile(null);
    setImagePreview(null);
    setSelectedProductType(null);

    try {
      const url = isEdit
        ? `${config.api.baseUrl}/theater-product-types/${theaterId}/${currentSelectedProductType._id}`
        : `${config.api.baseUrl}/theater-product-types/${theaterId}`;
      const method = isEdit ? 'PUT' : 'POST';

      // Create FormData for file upload support
      const formDataToSend = new FormData();
      formDataToSend.append('productName', currentFormData.productName);
      formDataToSend.append('productCode', currentFormData.productCode);
      formDataToSend.append('description', currentFormData.description || '');
      // Combine quantity value and unit (e.g., "5 Nos")
      const quantityWithUnit = currentFormData.quantity ? `${currentFormData.quantity} ${currentFormData.quantityUnit || 'Nos'}` : '';
      formDataToSend.append('quantity', quantityWithUnit);
      formDataToSend.append('noQty', currentFormData.noQty || 1);
      formDataToSend.append('isActive', currentFormData.isActive);

      // Add image if selected
      if (currentImageFile) {
        formDataToSend.append('image', currentImageFile);
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
      // Success if: data.success === true OR we have data.productType/data.data/data.product OR no error field
      const hasError = data.error || (data.success === false);
      const hasSuccessData = data.success === true || data.data || data.productType || data.product;
      const isSuccess = !hasError && (hasSuccessData || !data.error);

      if (isSuccess) {
        // 🚀 INSTANT UI UPDATE: Optimistically update UI FIRST before any other operations
        const newProductType = data.data?.productType || data.productType || data.data || data.product;
        if (newProductType) {
          // ✅ FIX: Process product type data to ensure imageUrl is properly set
          const processedProductType = {
            ...newProductType,
            // ✅ FIX: Prioritize imageUrl from response (backend now includes it)
            imageUrl: newProductType.imageUrl || newProductType.image || null,
            image: newProductType.image || newProductType.imageUrl || null
          };

          // ✅ FIX: Log product type data to verify imageUrl is included
          console.log('✅ [Product Type Create] Product type created with data:', {
            productName: processedProductType.productName,
            productCode: processedProductType.productCode,
            imageUrl: processedProductType.imageUrl ? processedProductType.imageUrl.substring(0, 80) + '...' : 'null',
            hasImageUrl: !!processedProductType.imageUrl
          });

          if (!isEdit) {
            // Replace optimistic entry with real backend data
            setProductTypes(prev => {
              // Remove optimistic entry (temp ID) and add real one
              const filtered = prev.filter(pt => {
                const ptId = pt._id?.toString() || pt._id;
                return !ptId.toString().startsWith('temp-');
              });
              // Check if real entry already exists
              const exists = filtered.some(pt => {
                const ptId = pt._id?.toString() || pt._id;
                const newId = processedProductType._id?.toString() || processedProductType._id;
                return ptId === newId;
              });
              if (exists) {
                return filtered.map(pt => {
                  const ptId = pt._id?.toString() || pt._id;
                  const newId = processedProductType._id?.toString() || processedProductType._id;
                  return ptId === newId ? processedProductType : pt;
                });
              }
              return [processedProductType, ...filtered];
            });
          } else {
            // Replace optimistic update with real backend data
            setProductTypes(prev => prev.map(pt => {
              const ptId = pt._id?.toString() || pt._id;
              const newId = processedProductType._id?.toString() || processedProductType._id;
              return ptId === newId ? processedProductType : pt;
            }));
          }
        }

        // Show success message
        toast.success(isEdit ? 'Product updated successfully!' : 'Product created successfully!', 3000);

        // ✅ FIX: Comprehensive cache invalidation for Product Types
        try {
          // Clear all Product Type cache variations
          clearCachePattern(`theaterProductTypes_${theaterId}`);
          clearCachePattern(`theater_product_types_${theaterId}`);
          clearCachePattern(`theaterProductTypes`);
          clearCachePattern(`theater_product_types`);
          // Use invalidateRelatedCaches for comprehensive clearing
          invalidateRelatedCaches('productType', theaterId);
          // Also clear product caches since products reference product types
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          // Clear all sessionStorage entries matching product type patterns
          const cacheKeys = Object.keys(sessionStorage);
          cacheKeys.forEach(key => {
            if (key.includes(`productType`) || key.includes(`product_type`) ||
              (key.includes(`theaterProductTypes`) && key.includes(theaterId))) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.warn('⚠️ Product Type cache clear warning:', e);
        }

        // ✅ FIX: Dispatch event to trigger refresh in other pages (Cafe, Product Management)
        try {
          window.dispatchEvent(new CustomEvent('productTypeUpdated', {
            detail: { theaterId, productTypeId: processedProductType._id }
          }));
        } catch (e) {
          // Ignore event dispatch errors
        }

        // Refresh data in background
        setTimeout(() => {
          if (loadProductTypesDataRef.current) {
            loadProductTypesDataRef.current(currentPage, itemsPerPage, searchTerm, true, true, statusFilter);
          }
        }, 500); // Reduced delay for faster refresh
      } else {
        // Handle error response - revert optimistic update and reopen modal
        const errorMessage = data.message || data.error || 'Failed to save product type';
        toast.error(errorMessage, 5000);
        console.error('Error saving product type:', data);

        // Revert optimistic update
        if (!isEdit) {
          setProductTypes(prev => prev.filter(pt => {
            const ptId = pt._id?.toString() || pt._id;
            return !ptId.toString().startsWith('temp-');
          }));
          setSummary(prev => ({
            ...prev,
            totalProductTypes: Math.max(0, prev.totalProductTypes - 1),
            activeProductTypes: optimisticProductType.isActive !== false
              ? Math.max(0, prev.activeProductTypes - 1)
              : prev.activeProductTypes
          }));
          setTotalItems(prev => Math.max(0, prev - 1));
        } else {
          // Revert to original data
          setProductTypes(prev => prev.map(pt => {
            const ptId = pt._id?.toString() || pt._id;
            const editId = currentSelectedProductType._id?.toString() || currentSelectedProductType._id;
            return ptId === editId ? currentSelectedProductType : pt;
          }));
        }

        // Reopen modal on error so user can fix and retry
        if (isEdit) {
          setShowEditModal(true);
          // Restore form data
          setFormData(currentFormData);
          setImageFile(currentImageFile);
          setSelectedProductType(currentSelectedProductType);
        } else {
          setShowCreateModal(true);
          // Restore form data
          setFormData(currentFormData);
          setImageFile(currentImageFile);
        }
      }
    } catch (error) {
      console.error('Error saving product type:', error);
      toast.error(error.message || 'Failed to save product type');

      // Revert optimistic update
      if (!isEdit) {
        setProductTypes(prev => prev.filter(pt => {
          const ptId = pt._id?.toString() || pt._id;
          return !ptId.toString().startsWith('temp-');
        }));
        setSummary(prev => ({
          ...prev,
          totalProductTypes: Math.max(0, prev.totalProductTypes - 1),
          activeProductTypes: optimisticProductType.isActive !== false
            ? Math.max(0, prev.activeProductTypes - 1)
            : prev.activeProductTypes
        }));
        setTotalItems(prev => Math.max(0, prev - 1));
      } else {
        // Revert to original data
        setProductTypes(prev => prev.map(pt => {
          const ptId = pt._id?.toString() || pt._id;
          const editId = currentSelectedProductType._id?.toString() || currentSelectedProductType._id;
          return ptId === editId ? currentSelectedProductType : pt;
        }));
      }

      // Reopen modal on error so user can see the error
      if (isEdit) {
        setShowEditModal(true);
        // Restore form data
        setFormData(currentFormData);
        setImageFile(currentImageFile);
        setSelectedProductType(currentSelectedProductType);
      } else {
        setShowCreateModal(true);
        // Restore form data
        setFormData(currentFormData);
        setImageFile(currentImageFile);
      }
    }
  }, [theaterId, selectedProductType, formData, imageFile, currentPage, itemsPerPage, searchTerm, statusFilter, loadProductTypesData, toast]);

  const handleDeleteProductType = useCallback(async () => {
    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-product-types/${theaterId}/${selectedProductType._id}`, {
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
        // 🚀 INSTANT UI UPDATE: Optimistically remove from UI immediately
        setProductTypes(prev => prev.filter(pt => pt._id !== selectedProductType._id));
        // Update summary counts immediately
        setSummary(prev => ({
          ...prev,
          totalProductTypes: Math.max(0, prev.totalProductTypes - 1),
          activeProductTypes: selectedProductType.isActive !== false
            ? Math.max(0, prev.activeProductTypes - 1)
            : prev.activeProductTypes,
          inactiveProductTypes: selectedProductType.isActive === false
            ? Math.max(0, prev.inactiveProductTypes - 1)
            : prev.inactiveProductTypes
        }));

        // Close delete modal immediately
        // ✅ FIX: Save scroll position before closing
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
        if (currentScroll > 0) {
          scrollPositionRef.current = currentScroll;
        }
        setShowDeleteModal(false);
        setSelectedProductType(null);
        // ✅ FIX: Restore scroll position after closing
        restoreScrollPosition();

        // Show success message
        toast.success('Product deleted successfully!', 3000);

        // Clear cache to ensure fresh data
        const cacheKey = `theaterProductTypes_${theaterId}`;
        try {
          sessionStorage.removeItem(cacheKey);
        } catch (e) {
          // Ignore cache clear errors
        }

        // ✅ FIX: Refresh data after a longer delay to ensure image upload completes
        // Image upload now happens before response, but refresh to ensure everything is synced
        setTimeout(() => {
          if (loadProductTypesDataRef.current) {
            loadProductTypesDataRef.current(currentPage, itemsPerPage, searchTerm, true, true, statusFilter);
          }
        }, 1000); // Increased delay to ensure image is fully processed
      } else {
        // Handle error response
        const errorMessage = data.message || data.error || 'Failed to delete product type';
        toast.error(errorMessage, 5000);
        console.error('Error deleting product type:', data);
        // Don't close modal on error so user can see the error
      }
    } catch (error) {
      console.error('Error deleting product type:', error);
      toast.error(error.message || 'Failed to delete product type');
      // Don't close modal on error so user can see the error
    }
  }, [theaterId, selectedProductType, currentPage, itemsPerPage, searchTerm, statusFilter, loadProductTypesData, toast]);

  const handleCreateNewProductType = useCallback(() => {
    setFormData({
      productName: '',
      productCode: '',
      description: '',
      quantity: '',
      quantityUnit: 'Nos',
      noQty: '',
      isActive: true,
      imageUrl: null,
      removeImage: false
    });
    setImageFile(null);
    setImagePreview(null);
    setImageFile(null);
    setImageError('');
    setSelectedProductType(null);
    setShowCreateModal(true);
  }, []);

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Image handling functions (matching TheaterCategories pattern) - Memoized
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
    setImagePreview(null);
    setImageError('');
    setFormData(prev => ({
      ...prev,
      imageUrl: null,
      removeImage: true
    }));
  }, []);

  // Reset initial load flag when theaterId changes
  useEffect(() => {
    setInitialLoadDone(false);
    setLoading(true);
    lastLoadKeyRef.current = '';
  }, [theaterId]);

  // 🚀 ULTRA-OPTIMIZED: Initial load - INSTANT CACHE FIRST (< 90ms)
  useEffect(() => {
    if (!theaterId || !loadProductTypesDataRef.current) {
      if (!theaterId) {
        setLoading(false);
      }
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
    (async () => {
      try {
        await loadProductTypesDataRef.current(1, 10, '', false, true, 'all');
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
  }, [theaterId, initialLoadDone]); // Depend on initialLoadDone to allow retry

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
      <td><div className="skeleton-text"></div></td>
      <td><div className="skeleton-text"></div></td>
    </tr>
  ), []);

  // 🚀 OPTIMIZED: Memoized Product Type Table Row Component
  const ProductTypeRow = React.memo(({ productType, index, currentPage, itemsPerPage, onView, onEdit, onDelete }) => {
    const serialNumber = (currentPage - 1) * itemsPerPage + index + 1;

    return (
      <tr key={productType._id} className={`theater-row ${!productType.isActive ? 'inactive' : ''}`}>
        <td className="sno-cell">{serialNumber}</td>
        <td className="photo-cell">
          {(() => {
            // ✅ FIX: Extract image URL from various possible fields
            let imageSrc = productType.imageUrl || productType.image || productType.imageData || productType.productImage || null;

            // ✅ FIX: Log raw product type data for debugging
            console.log('🔍 [Product Type Image] Raw product type data:', {
              productName: productType.productName,
              imageUrl: productType.imageUrl,
              image: productType.image,
              imageData: productType.imageData,
              productImage: productType.productImage,
              allKeys: Object.keys(productType)
            });

            // ✅ FIX: Normalize image URL - convert relative paths to absolute URLs
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

              console.log('✅ [Product Type Image] Processed image URL:', {
                productName: productType.productName,
                original: productType.imageUrl || productType.image,
                processed: imageSrc,
                isGCS: imageSrc.includes('storage.googleapis.com')
              });
            } else {
              console.warn('⚠️ [Product Type Image] No valid image URL found:', {
                productName: productType.productName,
                hasImageUrl: !!productType.imageUrl,
                hasImage: !!productType.image
              });
              imageSrc = null;
            }

            if (imageSrc) {
              // ✅ FIX: Use InstantImage component for better reliability, caching, and GCS proxy support
              // InstantImage handles its own proxying via POST to avoid header size limits
              return (
                <div className="theater-photo-thumb">
                  <InstantImage
                    src={imageSrc}
                    alt={productType.productName || 'Product Type'}
                    className="product-row-img"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                    showLoadingSpinner={false}
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
            <div className="qr-name">{productType.productName}</div>
            {productType.description && (
              <div className="qr-description">{productType.description}</div>
            )}
          </div>
        </td>
        <td className="name-cell">
          <div className="qr-code">{productType.productCode}</div>
        </td>
        <td className="status-cell">
          <div className="quantity-display">
            <span className="quantity-value">{productType.noQty !== undefined ? productType.noQty : 1}</span>
          </div>
        </td>
        <td className="status-cell">
          <div className="quantity-display">
            <span className="quantity-value">{productType.quantity || 'Not set'}</span>
          </div>
        </td>
        <td className="status-cell">
          <span className={`status-badge ${productType.isActive ? 'active' : 'inactive'}`}>
            {productType.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="actions-cell">
          <ActionButtons>
            <ActionButton
              type="view"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onView(productType, e);
              }}
              title="View Details"
            />
            <ActionButton
              type="edit"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(productType, e);
              }}
              title="Edit Product Type"
            />
            <ActionButton
              type="delete"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(productType, e);
              }}
              title="Delete Product Type"
            />
          </ActionButtons>
        </td>
      </tr>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison function for better performance
    return (
      prevProps.productType._id === nextProps.productType._id &&
      prevProps.index === nextProps.index &&
      prevProps.currentPage === nextProps.currentPage &&
      prevProps.itemsPerPage === nextProps.itemsPerPage &&
      prevProps.productType.productName === nextProps.productType.productName &&
      prevProps.productType.productCode === nextProps.productType.productCode &&
      prevProps.productType.quantity === nextProps.productType.quantity &&
      prevProps.productType.noQty === nextProps.productType.noQty &&
      prevProps.productType.isActive === nextProps.productType.isActive &&
      // Check all image fields for changes
      (prevProps.productType.imageUrl || prevProps.productType.image || prevProps.productType.imageData || prevProps.productType.productImage) ===
      (nextProps.productType.imageUrl || nextProps.productType.image || nextProps.productType.imageData || nextProps.productType.productImage)
    );
  });

  ProductTypeRow.displayName = 'ProductTypeRow';

  // 🚀 OPTIMIZED: Memoized header button to prevent re-renders
  const headerButton = useMemo(() => (
    <button
      className="header-btn"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCreateNewProductType(e);
      }}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </span>
      Create New Product Name
    </button>
  ), [handleCreateNewProductType]);

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Product Names" currentPage="product-types">
        <PageContainer
          title="Product Name"
          headerButton={headerButton}
        >

          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.activeProductTypes || 0}</div>
              <div className="stat-label">Active Product Names</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.inactiveProductTypes || 0}</div>
              <div className="stat-label">Inactive Product Names</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalProductTypes || 0}</div>
              <div className="stat-label">Total Product Names</div>
            </div>
          </div>

          {/* Enhanced Filters Section matching TheaterList */}
          <div className="theater-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search product names by name..."
                value={searchTerm}
                onChange={handleSearch}
                className="search-input"
              />
            </div>

            <select
              value={statusFilter}
              onChange={handleStatusChange}
              className="status-filter"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <span className="results-count">
              Showing {productTypes.length} of {totalItems} product names (Page {currentPage} of {totalPages})
            </span>

            <div className="items-per-page">
              <label>Items per page:</label>
              <select value={itemsPerPage} onChange={handleItemsPerPageChange} className="items-select">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Management Table */}
          <div className="theater-table-container">
            <table className="theater-table">
              <thead>
                <tr>
                  <th className="sno-cell">S.No</th>
                  <th className="photo-cell">Image</th>
                  <th className="name-cell">Product Name</th>
                  <th className="name-cell">Product Code / SKU</th>
                  <th className="status-cell">No.Qty</th>
                  <th className="status-cell">Quantity</th>
                  <th className="status-cell">Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <TableRowSkeleton key={`skeleton-${index}`} />
                  ))
                ) : productTypes.length > 0 ? (
                  productTypes.map((productType, index) => (
                    <ProductTypeRow
                      key={productType._id}
                      productType={productType}
                      index={index}
                      currentPage={currentPage}
                      itemsPerPage={itemsPerPage}
                      onView={viewProductType}
                      onEdit={editProductType}
                      onDelete={deleteProductType}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-cell">
                      <i className="fas fa-box fa-3x"></i>
                      <h3>No Product Names Found</h3>
                      <p>There are no product names available for management at the moment.</p>
                      <button
                        className="add-theater-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCreateNewProductType(e);
                        }}
                      >
                        Create First Product Name
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
              itemType="product names"
            />
          )}

          {/* Create Modal */}
          {showCreateModal && (
            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Create New Product Name</h2>
                  <button
                    className="close-btn"
                    type="button"
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
                      <label>Product Name</label>
                      <input
                        type="text"
                        value={formData.productName || ''}
                        onChange={(e) => handleInputChange('productName', e.target.value)}
                        className="form-control"
                        placeholder="Enter product name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Product Code / SKU</label>
                      <input
                        type="text"
                        value={formData.productCode || ''}
                        onChange={(e) => handleInputChange('productCode', e.target.value)}
                        className="form-control"
                        placeholder="Enter product code or SKU"
                      />
                    </div>
                    <div className="form-group">
                      <label>No.Qty</label>
                      <input
                        type="text"
                        value={formData.noQty || ''}
                        onChange={(e) => handleInputChange('noQty', e.target.value)}
                        className="form-control"
                        placeholder="Enter number of quantity"
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity</label>
                      <div className="quantity-input-wrapper">
                        <input
                          type="text"
                          value={formData.quantity || ''}
                          onChange={(e) => handleInputChange('quantity', e.target.value)}
                          className="form-control quantity-input"
                          placeholder="Enter stock quantity"
                        />
                        <div className="quantity-unit-selector">
                          <select
                            value={formData.quantityUnit || 'Nos'}
                            onChange={(e) => handleInputChange('quantityUnit', e.target.value)}
                            className="quantity-unit-select"
                          >
                            <option value="Nos">Nos</option>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="L">L</option>
                            <option value="ML">ML</option>
                          </select>
                          <svg
                            className="quantity-unit-arrow"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </div>
                      </div>
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
                        placeholder="Enter product type description (optional)"
                        rows="3"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Product Image</label>
                      <ImageUpload
                        value={imageFile || null}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Product Image"
                        helperText="Drag and drop an image here, or click to select (optional)"
                        className="form-helper-text"
                        maxSize={500 * 1024}
                      />
                    </div>
                  </div>
                </div>

                {/* Fixed Footer with Cancel and Submit Buttons */}
                <div className="modal-actions">
                  <button
                    className="cancel-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeModalWithScrollRestore(setShowCreateModal);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handleSubmitProductType(false)}
                  >
                    Create Product Type
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
                  <h2>Edit Product Name</h2>
                  <button
                    className="close-btn"
                    type="button"
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
                      <label>Product Name</label>
                      <input
                        type="text"
                        value={formData.productName || ''}
                        onChange={(e) => handleInputChange('productName', e.target.value)}
                        className="form-control"
                        placeholder="Enter product name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Product Code / SKU</label>
                      <input
                        type="text"
                        value={formData.productCode || ''}
                        onChange={(e) => handleInputChange('productCode', e.target.value)}
                        className="form-control"
                        placeholder="Enter product code or SKU"
                      />
                    </div>
                    <div className="form-group">
                      <label>No.Qty</label>
                      <input
                        type="text"
                        value={formData.noQty || ''}
                        onChange={(e) => handleInputChange('noQty', e.target.value)}
                        className="form-control"
                        placeholder="Enter number of quantity"
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity</label>
                      <div className="quantity-input-wrapper">
                        <input
                          type="text"
                          value={formData.quantity || ''}
                          onChange={(e) => handleInputChange('quantity', e.target.value)}
                          className="form-control quantity-input"
                          placeholder="Enter stock quantity"
                        />
                        <div className="quantity-unit-selector">
                          <select
                            value={formData.quantityUnit || 'Nos'}
                            onChange={(e) => handleInputChange('quantityUnit', e.target.value)}
                            className="quantity-unit-select"
                          >
                            <option value="Nos">Nos</option>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="L">L</option>
                            <option value="ML">ML</option>
                          </select>
                          <svg
                            className="quantity-unit-arrow"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </div>
                      </div>
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
                        placeholder="Enter product type description (optional)"
                        rows="3"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Product Image</label>
                      <ImageUpload
                        value={imageFile || (formData.imageUrl && !formData.removeImage ? formData.imageUrl : null)}
                        onChange={handleImageSelect}
                        onRemove={handleImageRemove}
                        error={imageError}
                        label="Upload Product Image"
                        helperText="Drag and drop an image here, or click to select (optional)"
                        className="form-helper-text"
                        maxSize={500 * 1024}
                      />
                    </div>
                  </div>
                </div>

                {/* Fixed Footer with Cancel and Submit Buttons */}
                <div className="modal-actions">
                  <button
                    className="cancel-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeModalWithScrollRestore(setShowEditModal);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handleSubmitProductType(true)}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive View Modal - Using Global Modal Design */}
          {showViewModal && (
            <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                <ProductDetailView product={selectedProductType} onClose={() => setShowViewModal(false)} />
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
                  <p>Are you sure you want to delete the product type <strong>{selectedProductType?.productType}</strong>?</p>
                  <p className="warning-text">This action cannot be undone.</p>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteProductType}
                    className="confirm-delete-btn"
                  >
                    Delete Product Name
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

TheaterProductTypes.displayName = 'TheaterProductTypes';

// ✅ Global Modal Width Styling + Professional Quantity Input
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

  /* ============================================
     PROFESSIONAL QUANTITY INPUT WITH DROPDOWN
     MERGED SEAMLESSLY AS ONE COMPONENT
     ============================================ */
  
  .quantity-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    background-color: #ffffff;
    transition: all 0.3s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .quantity-input-wrapper:hover {
    border-color: #cbd5e1;
  }

  .quantity-input-wrapper:focus-within {
    border-color: var(--primary-color, #8b5cf6);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
    background-color: #fefefe;
  }

  .quantity-input-wrapper .quantity-input {
    width: 100%;
    padding-right: 100px !important;
    border: none !important;
    border-radius: 8px 0 0 8px !important;
    background: transparent !important;
    transition: none;
    box-shadow: none !important;
  }

  .quantity-input-wrapper .quantity-input:focus {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }

  .quantity-unit-selector {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    height: 100%;
    display: flex;
    align-items: center;
    background-color: #f8f9fa;
    border: none;
    border-left: 1px solid #e2e8f0;
    border-radius: 0 8px 8px 0;
    min-width: 85px;
    transition: all 0.3s ease;
  }

  .quantity-input-wrapper:focus-within .quantity-unit-selector {
    background-color: #fafafa;
    border-left-color: #e2e8f0;
  }

  .quantity-input-wrapper:hover .quantity-unit-selector {
    background-color: #f1f5f9;
  }

  .quantity-unit-select {
    border: none;
    background: transparent;
    padding: 0 32px 0 14px;
    height: 100%;
    font-size: 14px;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    z-index: 2;
    width: 100%;
    font-family: inherit;
    transition: color 0.2s ease;
  }

  .quantity-unit-select:hover {
    color: #334155;
  }

  .quantity-unit-select:focus {
    color: var(--primary-color, #8b5cf6);
  }

  .quantity-unit-arrow {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: #64748b;
    width: 16px;
    height: 16px;
    z-index: 1;
    transition: color 0.2s ease, transform 0.2s ease;
  }

  .quantity-unit-selector:hover .quantity-unit-arrow {
    color: #475569;
  }

  .quantity-unit-select:focus + .quantity-unit-arrow,
  .quantity-input-wrapper:focus-within .quantity-unit-arrow {
    color: var(--primary-color, #8b5cf6);
  }

  /* Ensure proper alignment and spacing */
  .quantity-input-wrapper .form-control {
    margin: 0;
  }

  /* Focus state coordination */
  .quantity-input-wrapper:focus-within {
    z-index: 1;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .quantity-unit-selector {
      min-width: 75px;
    }
    
    .quantity-input-wrapper .quantity-input {
      padding-right: 85px !important;
    }
    
    .quantity-unit-select {
      padding: 0 28px 0 12px;
      font-size: 13px;
    }
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(style);
}

export default TheaterProductTypes;
