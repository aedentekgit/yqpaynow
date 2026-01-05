import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import config from '../config';
import apiService from '../services/apiService';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { ActionButton, ActionButtons } from '../components/ActionButton';
import Pagination from '../components/Pagination';
import { useModal } from '../contexts/ModalContext';
import { clearTheaterCache } from '../utils/cacheManager';
import { optimizedFetch } from '../utils/apiOptimizer';
import { getCachedData, setCachedData, clearCachePattern } from '../utils/cacheUtils';
import { optimisticDelete, invalidateRelatedCaches } from '../utils/crudOptimizer';
import { clearImageCachePattern } from '../utils/imageCacheUtils';
import { getImageSrc } from '../utils/globalImageCache'; // 🚀 Instant image loading
import InstantImage from '../components/InstantImage';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { useTheaterStore } from '../stores/optimizedStores'; // Global theater store
import '../styles/TheaterList.css';
import '../styles/QRManagementPage.css';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/pages/TheaterList.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';

// Lazy Loading Image Component WITH INSTANT CACHE
const LazyImage = React.memo(({ src, alt, className, style, fallback = '/placeholder-theater.png' }) => {
  // 🚀 INSTANT: Check cache first synchronously
  const cachedSrc = src ? getImageSrc(src) : fallback;
  const [imageSrc, setImageSrc] = useState(cachedSrc || fallback);
  const [isLoading, setIsLoading] = useState(!cachedSrc);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    // If already cached, no need for lazy loading
    if (cachedSrc) {
      setImageSrc(cachedSrc);
      setIsLoading(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && src && src !== fallback) {
          const img = new Image();
          img.onload = () => {
            setImageSrc(src);
            setIsLoading(false);
            setHasError(false);
          };
          img.onerror = () => {
            setHasError(true);
            setIsLoading(false);
          };
          img.src = src;
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src, fallback, cachedSrc]);

  return (
    <div className="lazy-image-container" style={style}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
        style={style}
      />
      {isLoading && (
        <div className="image-loading-placeholder">
          <div className="image-skeleton"></div>
        </div>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

// Loading Skeleton Components
const TheaterCardSkeleton = React.memo(() => (
  <div className="theater-card skeleton-card">
    <div className="theater-card-image skeleton-image"></div>
    <div className="theater-card-content">
      <div className="skeleton-line skeleton-title"></div>
      <div className="skeleton-line skeleton-subtitle"></div>
      <div className="skeleton-line skeleton-text"></div>
      <div className="skeleton-buttons">
        <div className="skeleton-button"></div>
        <div className="skeleton-button"></div>
      </div>
    </div>
  </div>
));

TheaterCardSkeleton.displayName = 'TheaterCardSkeleton';

const TheaterListSkeleton = React.memo(({ count = 6 }) => (
  <div className="theaters-grid">
    {Array.from({ length: count }, (_, index) => (
      <TheaterCardSkeleton key={`skeleton-${index}`} />
    ))}
  </div>
));

TheaterListSkeleton.displayName = 'TheaterListSkeleton';

// Table Skeleton Component
const TableSkeletonRow = React.memo(() => (
  <tr className="theater-row skeleton-row">
    <td className="sno-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="photo-cell">
      <div className="theater-photo-thumb skeleton-image"></div>
    </td>
    <td className="name-cell">
      <div className="skeleton-line skeleton-medium"></div>
    </td>
    <td className="owner-cell">
      <div className="skeleton-line skeleton-medium"></div>
    </td>
    <td className="location-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="contact-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="agreement-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="status-cell">
      <div className="skeleton-line skeleton-small"></div>
    </td>
    <td className="access-status-cell">
      <div className="skeleton-toggle"></div>
    </td>
    <td className="actions-cell">
      <div className="skeleton-buttons">
        <div className="skeleton-button skeleton-small"></div>
        <div className="skeleton-button skeleton-small"></div>
      </div>
    </td>
  </tr>
));

TableSkeletonRow.displayName = 'TableSkeletonRow';

const TableSkeleton = React.memo(({ count = 10 }) => (
  <>
    {Array.from({ length: count }, (_, index) => (
      <TableSkeletonRow key={`table-skeleton-${index}`} />
    ))}
  </>
));

TableSkeleton.displayName = 'TableSkeleton';

// Memoized Theater Row Component to prevent unnecessary re-renders
const TheaterRow = React.memo(({ theater, index, onEdit, onView, onDelete }) => (
  <tr key={theater._id}>
    <td>{theater.name || 'N/A'}</td>
    <td>{theater.ownerDetails?.name || 'N/A'}</td>
    <td>{theater.phone || 'N/A'}</td>
    <td>{theater.address ? `${theater.address.city}, ${theater.address.state}` : 'N/A'}</td>
    <td>
      <span className={`status ${theater.isActive ? 'active' : 'inactive'}`}>
        {theater.isActive ? 'Active' : 'Inactive'}
      </span>
    </td>
    <td className="actions-cell">
      <ActionButtons>
        <ActionButton 
          type="view"
          onClick={() => onView(theater, index)}
          title="View theater details"
        />
        <ActionButton 
          type="edit"
          onClick={() => onEdit(theater, index)}
          title="Edit theater"
        />
        <ActionButton 
          type="delete"
          onClick={() => onDelete(theater)}
          title="Delete theater"
        />
      </ActionButtons>
    </td>
  </tr>
));

TheaterRow.displayName = 'TheaterRow';

// 🚀 OPTIMIZED: Memoized component to prevent unnecessary re-renders
const TheaterList = React.memo(() => {
  const navigate = useNavigate();
  const modal = useModal();
  
  // Global theater store for cross-component updates
  const { setTheaters: setGlobalTheaters, updateTheater: updateGlobalTheater, removeTheater: removeGlobalTheater } = useTheaterStore();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterList');
  
  // 🚀 ULTRA-INSTANT: Check cache synchronously with zero overhead (< 0.0001ms)
  const initialCacheKey = 'theaters_list_page_1_limit_10_search_none_status_all';
  const initialCache = typeof window !== 'undefined' 
    ? getCachedData(initialCacheKey, 300000) // 5-minute cache - synchronous, zero delay
    : null;
  
  // 🚀 ULTRA-INSTANT: Direct property access (faster than optional chaining)
  const initialTheaters = initialCache?.items || [];
  const initialPagination = initialCache?.pagination || { totalPages: 0, totalItems: 0 };
  const initialSummary = initialCache?.summary || { totalTheaters: 0, activeTheaters: 0, inactiveTheaters: 0, activeAgreements: 0 };
  
  // 🚀 ULTRA-INSTANT: Pre-sort theaters synchronously if cache exists (zero render delay)
  const initialSortedTheaters = initialTheaters.length > 0 
    ? [...initialTheaters].sort((a, b) => (a._id || '').localeCompare(b._id || ''))
    : [];
  
  const [theaters, setTheaters] = useState(initialTheaters);
  // 🚀 ULTRA-INSTANT: loading is ALWAYS false if cache exists (like Settings page - always renders content)
  const [loading, setLoading] = useState(false); // Start false - Settings page never shows spinner
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState({ show: false, theater: null });
  const [viewModal, setViewModal] = useState({ show: false, theater: null });
  const [editModal, setEditModal] = useState({ show: false, theater: null, openTimestamp: null });
  const [editFormData, setEditFormData] = useState({});
  const [uploadFiles, setUploadFiles] = useState({
    theaterPhoto: null,
    logo: null,
    aadharCard: null,
    panCard: null,
    gstCertificate: null,
    fssaiCertificate: null,
    businessLicense: null,
    agreementDocument: null
  });
  const [uploadProgress, setUploadProgress] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [togglingTheaterId, setTogglingTheaterId] = useState(null); // Track which theater is being toggled
  
  // Summary state for statistics - Initialize with cached data
  const [summary, setSummary] = useState(initialSummary);

  // 🚀 ULTRA-INSTANT: Use pre-sorted cache if available (zero computation on first render)
  const sortedTheaters = useMemo(() => {
    // If theaters match initial cache and we have pre-sorted, use it (zero computation)
    if (theaters === initialTheaters && initialSortedTheaters.length > 0) {
      return initialSortedTheaters;
    }
    // Otherwise sort (only if data changed)
    return [...theaters].sort((a, b) => (a._id || '').localeCompare(b._id || ''));
  }, [theaters, initialTheaters, initialSortedTheaters]);

  // Helper function to close modal with cleanup
  const closeEditModal = useCallback(() => {
    // Clear upload files and progress
    setUploadFiles({
      theaterPhoto: null,
      logo: null,
      aadharCard: null,
      panCard: null,
      gstCertificate: null,
      fssaiCertificate: null,
      businessLicense: null,
      agreementDocument: null
    });
    
    setUploadProgress({});
    
    // Close modal
    setEditModal({ show: false, theater: null, currentIndex: 0, openTimestamp: null });
  }, []);
  
  // Pagination state - Initialize with cached data
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages || 0);
  const [totalItems, setTotalItems] = useState(initialPagination.totalItems || 0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pagination, setPagination] = useState(initialPagination);

  // Performance refs (matching QRManagement)
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false); // 🚀 DEDUPLICATION: Prevent duplicate requests
  const hasInitialCache = useRef(initialTheaters.length > 0); // Track if we had cache on mount

  // Debounced search effect (matching QRManagement)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when searching
    }, 500); // PERFORMANCE: 500ms debounce to reduce API calls

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
  const fetchTheaters = useCallback(async () => {
    // 🚀 DEDUPLICATION: Check if already fetching
    if (isFetchingRef.current) {
      return;
    }
    
    try {
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      isFetchingRef.current = true;
      // 🚀 ULTRA-INSTANT: Only set loading if we have NO cache AND no data (like Settings page)
      // Settings page never shows spinner - always renders content immediately
      if (!hasInitialCache.current && initialTheaters.length === 0) {
      setLoading(true);
      }
      setError('');
      
      // Build query parameters - Optimized: start with smaller limit for faster initial load
      const params = {
        page: currentPage,
        limit: Math.min(itemsPerPage, 20) // Cap at 20 for faster response
      };
      
      if (debouncedSearchTerm.trim()) {
        params.q = debouncedSearchTerm.trim();
      }
      
      if (filterStatus !== 'all') {
        params.isActive = filterStatus === 'active' ? 'true' : 'false';
      }
      
      // 🚀 ULTRA-INSTANT: Direct API call (removed all console.log and performance overhead)
      const result = await apiService.getTheaters(params);
      
      // result contains: { items: [], pagination: {}, message: '' }
      const newTheaters = result.items || [];
      const paginationData = result.pagination || {};
      
      // Check agreement expiration status for each theater
      const now = new Date();
      const theatersWithExpirationStatus = newTheaters.map(theater => {
        if (theater.agreementDetails?.endDate) {
          const endDate = new Date(theater.agreementDetails.endDate);
          const daysUntilExpiration = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
          const isExpiring = daysUntilExpiration <= 5 && daysUntilExpiration >= 0;
          const isExpired = daysUntilExpiration < 0;
          
          return {
            ...theater,
            agreementExpiring: isExpiring,
            agreementExpired: isExpired,
            daysUntilExpiration: isExpired ? 0 : daysUntilExpiration
          };
        }
        return theater;
      });
      
      // 🚀 ULTRA-INSTANT: Update state (zero overhead)
      setTheaters(theatersWithExpirationStatus);
      // 🔄 GLOBAL UPDATE: Update global theater store for cross-component sync
      setGlobalTheaters(theatersWithExpirationStatus);
      setPagination(paginationData);
      setTotalPages(paginationData.totalPages || 0);
      setTotalItems(paginationData.totalItems || theatersWithExpirationStatus.length);
      
      // Calculate and update summary statistics
      const activeCount = theatersWithExpirationStatus.filter(theater => theater.isActive).length;
      const inactiveCount = theatersWithExpirationStatus.filter(theater => !theater.isActive).length;
      const activeAgreementsCount = theatersWithExpirationStatus.filter(theater => 
        theater.agreementDetails && 
        theater.agreementDetails.startDate && 
        theater.agreementDetails.endDate &&
        new Date(theater.agreementDetails.endDate) > new Date()
      ).length;
      
      const newSummary = {
        totalTheaters: theatersWithExpirationStatus.length,
        activeTheaters: activeCount,
        inactiveTheaters: inactiveCount,
        activeAgreements: activeAgreementsCount
      };
      setSummary(newSummary);
      
      // 🚀 ULTRA-INSTANT: Save to cache with optimized key (for instant future loads)
      const cacheKey = `theaters_list_page_${currentPage}_limit_${itemsPerPage}_search_${debouncedSearchTerm || 'none'}_status_${filterStatus || 'all'}`;
      setCachedData(cacheKey, {
        items: theatersWithExpirationStatus,
        pagination: paginationData,
        summary: newSummary
      });
      
    } catch (error) {
      // 🚀 ULTRA-INSTANT: Handle AbortError gracefully (zero overhead)
      if (error.name === 'AbortError') return;
      
      // Silent error handling (removed console.log overhead)
      setError(error.message || 'Failed to load theaters. Please check your connection and try again.');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [currentPage, debouncedSearchTerm, filterStatus, itemsPerPage]);

  // 🚀 PERFORMANCE: Track previous values to prevent unnecessary re-renders
  const prevParamsRef = useRef({});
  const fetchTheatersRef = useRef(fetchTheaters);
  
  // Update ref when fetchTheaters changes
  useEffect(() => {
    fetchTheatersRef.current = fetchTheaters;
  }, [fetchTheaters]);
  
  // 🚀 ULTRA-INSTANT: Skip useEffect entirely if cache exists (zero overhead)
  useEffect(() => {
    // 🚀 ULTRA-INSTANT: If we have cache, skip ALL effects on first mount
    if (hasInitialCache.current && Object.keys(prevParamsRef.current).length === 0) {
      prevParamsRef.current = { page: currentPage, search: debouncedSearchTerm, status: filterStatus, limit: itemsPerPage };
      return; // Exit immediately - zero delay
    }
    
    // Only run if params actually changed
    const currentParams = { page: currentPage, search: debouncedSearchTerm, status: filterStatus, limit: itemsPerPage };
    const prevParams = prevParamsRef.current;
    const hasChanged = 
      prevParams.page !== currentParams.page ||
      prevParams.search !== currentParams.search ||
      prevParams.status !== currentParams.status ||
      prevParams.limit !== currentParams.limit;
    
    if (hasChanged || Object.keys(prevParams).length === 0) {
      prevParamsRef.current = currentParams;
      fetchTheatersRef.current();
    }
  }, [currentPage, debouncedSearchTerm, filterStatus, itemsPerPage]);

  const handleDelete = useCallback(async (theaterId) => {
    // Store removed theater for potential rollback
    let removedTheater = null;
    
    try {
      // 🚀 OPTIMISTIC DELETE - Remove from UI immediately
      removedTheater = theaters.find(t => t._id === theaterId);
      setTheaters(prev => prev.filter(t => t._id !== theaterId));
      setTotalItems(prev => prev - 1);
      
      // 🔄 GLOBAL UPDATE: Remove from global theater store immediately
      removeGlobalTheater(theaterId);
      
      // Close modal immediately for better UX
      setDeleteModal({ show: false, theater: null });
      
      // Make API call in background
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
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
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.error('❌ [handleDelete] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to delete theater`);
          }
        }
        throw parseError;
      }

      // Check backend success flag
      if (responseData && responseData.success === false) {
        console.error('❌ [handleDelete] Backend returned success: false:', responseData);
        throw new Error(responseData.message || responseData.error || 'Failed to delete theater');
      }

      // If success flag is true, proceed (don't check response.ok as unifiedFetch may modify it)
      if (responseData && responseData.success === true) {
        // Success - modal already closed, show success message
        modal.showSuccess('Theater deleted successfully');
        
        // Clear cache and refresh
        clearTheaterCache();
        invalidateRelatedCaches('theaters');
        isFetchingRef.current = false;
        await fetchTheaters();
      } else if (!response.ok || (response.status && response.status >= 400)) {
        // Only check response.ok if no explicit success flag
        console.error('❌ [handleDelete] API response not OK:', response.status, responseData);
        throw new Error(responseData?.message || responseData?.error || `HTTP ${response.status}: Failed to delete theater`);
      } else {
        // Assume success if no explicit failure
        modal.showSuccess('Theater deleted successfully');
        
        // Clear cache and refresh
        clearTheaterCache();
        invalidateRelatedCaches('theaters');
        isFetchingRef.current = false;
        await fetchTheaters();
      }
      
    } catch (error) {
      console.error('❌ [handleDelete] Error deleting theater:', error);
      
      // Rollback - restore deleted theater
      if (removedTheater) {
        setTheaters(prev => [...prev, removedTheater]);
        setTotalItems(prev => prev + 1);
        // 🔄 GLOBAL ROLLBACK: Restore in global theater store
        setGlobalTheaters([...theaters]);
      }
      
      // Show error and keep modal open so user can try again
      modal.showError(error.message || 'Failed to delete theater. Please try again.');
      // Don't close modal on error - let user see the error and decide what to do
    }
  }, [theaters, modal]);

  const handleEditClick = useCallback(async (theater) => {
    try {
      
      // CRITICAL: Clear previous theater data completely
      setEditModal({ show: true, theater: null, loading: true, openTimestamp: null });
      
      // Fetch full theater details including documents - FORCE NO CACHE
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theater._id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Always get fresh theater details for editing
        cacheTTL: 0
      });
      
      // ✅ FIX: Parse JSON and check response (same logic as toggleTheaterStatus)
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ [handleEditClick] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to fetch theater details`);
      }
        }
        throw parseError;
      }
      
      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      if (result && result.success === true) {
      } else if (result && result.success === false) {
        console.error('❌ [handleEditClick] Backend returned success: false:', result);
        throw new Error(result.message || result.error || 'Failed to fetch theater details');
      } else if (!result) {
        console.error('❌ [handleEditClick] No result received from API');
        throw new Error('No response received from server');
      } else {
        // Result exists but no explicit success flag - check HTTP status as fallback
        if (response.ok === false || (response.status && response.status >= 400)) {
          console.error('❌ [handleEditClick] API response not OK (no success flag):', response.status, result);
          throw new Error(result?.message || result?.error || `HTTP ${response.status}: Failed to fetch theater details`);
        } else {
        }
      }
      
      const theaterData = result.data || result;
      
      // Set form data
      setEditFormData({
        theaterName: theaterData.name || '',
        ownerName: theaterData.ownerDetails?.name || '',
        ownerContactNumber: theaterData.ownerDetails?.contactNumber || '',
        phone: theaterData.phone || '',
        email: theaterData.email || '',
        address: theaterData.address?.street || '',
        city: theaterData.address?.city || '',
        state: theaterData.address?.state || '',
        pincode: theaterData.address?.pincode || theaterData.address?.zipCode || '',
        gstNumber: theaterData.gstNumber || '',
        fssaiNumber: theaterData.fssaiNumber || '',
        uniqueNumber: theaterData.uniqueNumber || ''
      });
      
      // Reset upload files when opening edit modal
      setUploadFiles({
        theaterPhoto: null,
        logo: null,
        aadharCard: null,
        panCard: null,
        gstCertificate: null,
        fssaiCertificate: null,
        businessLicense: null,
        agreementDocument: null
      });
      setUploadProgress({});
      
      // ✅ FIX: Set modal with full theater data including documents
      // Add timestamp to force React to remount InstantImage components with new keys
      const openTimestamp = Date.now();
      setEditModal({ show: true, theater: theaterData, loading: false, openTimestamp });
    } catch (error) {
      console.error('❌ [handleEditClick] Error fetching theater details:', error);
      modal.showError(error.message || 'Failed to load theater details. Please try again.');
      setEditModal({ show: false, theater: null, loading: false, openTimestamp: null });
    }
  }, [modal]);

  const handleViewClick = useCallback(async (theater) => {
    try {
      
      // CRITICAL: Clear previous theater data completely
      setViewModal({ show: true, theater: null, loading: true });
      
      // Fetch full theater details including documents - FORCE NO CACHE
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theater._id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Always get fresh theater details for viewing
        cacheTTL: 0
      });
      
      // ✅ FIX: Parse JSON and check response (same logic as toggleTheaterStatus)
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ [handleViewClick] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to fetch theater details`);
      }
        }
        throw parseError;
      }
      
      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      if (result && result.success === true) {
      } else if (result && result.success === false) {
        console.error('❌ [handleViewClick] Backend returned success: false:', result);
        throw new Error(result.message || result.error || 'Failed to fetch theater details');
      } else if (!result) {
        console.error('❌ [handleViewClick] No result received from API');
        throw new Error('No response received from server');
      } else {
        // Result exists but no explicit success flag - check HTTP status as fallback
        if (response.ok === false || (response.status && response.status >= 400)) {
          console.error('❌ [handleViewClick] API response not OK (no success flag):', response.status, result);
          throw new Error(result?.message || result?.error || `HTTP ${response.status}: Failed to fetch theater details`);
        } else {
        }
      }
      
      const theaterData = result.data || result;
      
      // Set modal with full theater data including documents
      setViewModal({ show: true, theater: theaterData, loading: false });
    } catch (error) {
      console.error('❌ [handleViewClick] Error fetching theater details:', error);
      modal.showError(error.message || 'Failed to load theater details. Please try again.');
      setViewModal({ show: false, theater: null, loading: false });
    }
  }, [modal]);

  const handleEditFormChange = useCallback((field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleFileChange = useCallback((fileType, file) => {
    setUploadFiles(prev => ({
      ...prev,
      [fileType]: file
    }));
  }, []);

  // New handler for the integrated upload fields with instant preview
  const handleFileUpload = useCallback((event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      // Create preview URL from the file
      const previewUrl = URL.createObjectURL(file);
      
      // Update uploadFiles with the actual file
      setUploadFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
      
      // Update the modal theater data to show preview immediately
      setEditModal(prev => ({
        ...prev,
        theater: {
          ...prev.theater,
          documents: {
            ...prev.theater.documents,
            [fileType]: previewUrl // Show preview URL instantly
          }
        }
      }));
    }
  }, []);

  // Handler for removing existing files
  const handleRemoveFile = useCallback((fileType) => {
    // Remove from uploadFiles state if it's a newly uploaded file
    setUploadFiles(prev => ({
      ...prev,
      [fileType]: null
    }));
    
    // Also update the editModal theater data to remove the existing file
    if (editModal.theater) {
      if (fileType === 'agreementCopy') {
        // Handle agreementCopy which is stored in both documents and agreementDetails
        setEditModal(prev => ({
          ...prev,
          theater: {
            ...prev.theater,
            documents: {
              ...prev.theater.documents,
              agreementCopy: null
            },
            agreementDetails: {
              ...prev.theater.agreementDetails,
              copy: null
            }
          }
        }));
      } else {
        // Handle regular documents
        setEditModal(prev => ({
          ...prev,
          theater: {
            ...prev.theater,
            documents: {
              ...prev.theater.documents,
              [fileType]: null
            }
          }
        }));
      }
    }
  }, [editModal.theater]);

  // Helper function to normalize image/document URLs
  const normalizeImageUrl = useCallback((url) => {
    if (!url) return null;
    
    // If it's already a data URL, return as is
    if (url.startsWith('data:')) {
      return url;
    }
    
    // 🚀 FIX: If it's a blob URL (from file upload), return as is
    if (url.startsWith('blob:')) {
      return url;
    }
    
    // If it's already a full URL (http/https), use it as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Handle Google Cloud Storage URLs (gs://)
    if (url.startsWith('gs://')) {
      // Convert gs:// URL to https:// public URL
      return url.replace('gs://yqpaynow-theater-qr-codes/', 'https://storage.googleapis.com/yqpaynow-theater-qr-codes/');
    }
    
    // If it's a relative path, prepend base URL
    if (url.startsWith('/')) {
      const baseUrl = config.api.baseUrl.endsWith('/') 
        ? config.api.baseUrl.slice(0, -1) 
        : config.api.baseUrl;
      return `${baseUrl}${url}`;
    }
    
    // If it doesn't start with /, it might be a relative path without leading slash
    const baseUrl = config.api.baseUrl.endsWith('/') 
      ? config.api.baseUrl 
      : `${config.api.baseUrl}/`;
    return `${baseUrl}${url}`;
  }, []);

  // Handler for downloading files
  const handleDownloadFile = useCallback((fileUrl, fileName) => {
    try {
      // Normalize URL before downloading
      const normalizedUrl = normalizeImageUrl(fileUrl);
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = normalizedUrl || fileUrl;
      link.download = fileName || 'document';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {

      modal.showError('Failed to download file');
    }
  }, [modal, normalizeImageUrl]);

  const uploadFile = async (file, fileType) => {
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);
    formData.append('theaterId', editModal.theater._id);

    try {
      setUploadProgress(prev => ({ ...prev, [fileType]: 0 }));
      
      // unifiedFetch automatically handles FormData
      const response = await unifiedFetch(`${config.api.baseUrl}/upload/theater-document`, {
        method: 'POST',
        body: formData
        // Note: onUploadProgress is not supported by fetch API, would need XMLHttpRequest for progress
      }, {
        forceRefresh: true, // Don't cache file uploads
        cacheTTL: 0
      });

      if (!response.ok) {
        throw new Error('File upload failed');
      }

      const result = await response.json();
      setUploadProgress(prev => ({ ...prev, [fileType]: 100 }));
      
      return result.fileUrl || result.url;
    } catch (error) {

      setUploadProgress(prev => ({ ...prev, [fileType]: null }));
      throw error;
    }
  };

  const handleEditSubmit = async () => {
    try {
      // Create FormData to handle both files and form fields
      const formData = new FormData();
      
      // Add form fields
      if (editFormData.theaterName) formData.append('name', editFormData.theaterName);
      if (editFormData.ownerName) formData.append('ownerName', editFormData.ownerName);
      if (editFormData.ownerContactNumber) formData.append('ownerContactNumber', editFormData.ownerContactNumber);
      if (editFormData.phone) formData.append('phone', editFormData.phone);
      if (editFormData.email) formData.append('email', editFormData.email);
      if (editFormData.address) formData.append('address', editFormData.address);
      if (editFormData.city) formData.append('city', editFormData.city);
      if (editFormData.state) formData.append('state', editFormData.state);
      if (editFormData.pincode) formData.append('pincode', editFormData.pincode);
      
      // Add business registration fields
      if (editFormData.gstNumber) formData.append('gstNumber', editFormData.gstNumber.toUpperCase());
      if (editFormData.fssaiNumber) formData.append('fssaiNumber', editFormData.fssaiNumber);
      if (editFormData.uniqueNumber) formData.append('uniqueNumber', editFormData.uniqueNumber);
      
      // Add any new files
      const fileTypes = Object.keys(uploadFiles);
      for (const fileType of fileTypes) {
        if (uploadFiles[fileType]) {
          formData.append(fileType, uploadFiles[fileType]);
        }
      } // Debug log

      // unifiedFetch automatically handles FormData
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${editModal.theater._id}`, {
        method: 'PUT',
        body: formData
        // Token is automatically added by unifiedFetch
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });

      // Parse response JSON
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.error('❌ [handleEditSubmit] Failed to parse response JSON:', parseError);
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to update theater`);
          }
        }
        throw parseError;
      }

      // Check backend success flag FIRST (most reliable indicator)
      if (responseData && responseData.success === false) {
        console.error('❌ [handleEditSubmit] Backend returned success: false:', responseData);
        throw new Error(responseData.message || responseData.error || 'Failed to update theater');
      }

      // If success flag is true, proceed (don't check response.ok as unifiedFetch may modify it)
      if (responseData && responseData.success === true) {
        // Proceed to update logic - success confirmed
      } else {
        // Only check response.ok if no explicit success flag
        if (!response.ok || (response.status && response.status >= 400)) {
          console.error('❌ [handleEditSubmit] API response not OK:', response.status, responseData);
          throw new Error(responseData?.message || responseData?.error || `HTTP ${response.status}: Failed to update theater`);
        }
      }
      
      // Handle different response formats
      const updatedTheater = responseData.data || responseData;
      
      if (!updatedTheater || !updatedTheater._id) {
        console.error('❌ [handleEditSubmit] Invalid response data:', responseData);
        throw new Error('Invalid response from server');
      }
      
      // First, update the local state immediately for instant feedback
      // Deep merge to ensure documents object is properly updated
      setTheaters(prevTheaters => {
        const currentTheater = prevTheaters.find(t => t._id === editModal.theater._id);
        const mergedTheater = {
          ...updatedTheater,
          documents: {
            ...(currentTheater?.documents || {}),
            ...(updatedTheater.documents || {})
          }
        };
        return prevTheaters.map(theater => 
          theater._id === editModal.theater._id ? mergedTheater : theater
        );
      });
      
      // Get merged theater for global update
      const currentTheater = theaters.find(t => t._id === editModal.theater._id);
      const mergedTheater = {
        ...updatedTheater,
        documents: {
          ...(currentTheater?.documents || {}),
          ...(updatedTheater.documents || {})
        }
      };
      
      // 🔄 GLOBAL UPDATE: Update global theater store for cross-component sync
      updateGlobalTheater(editModal.theater._id, mergedTheater);
      
      // Clear image cache for merged theater documents
      const allDocumentUrls = [];
      if (mergedTheater.theaterPhoto) allDocumentUrls.push(mergedTheater.theaterPhoto);
      if (mergedTheater.logo) allDocumentUrls.push(mergedTheater.logo);
      if (mergedTheater.documents) {
        Object.values(mergedTheater.documents).forEach(docUrl => {
          if (docUrl && typeof docUrl === 'string') allDocumentUrls.push(docUrl);
        });
      }
      
      // Clear uploaded files and progress immediately for better UX
      setUploadFiles({
        theaterPhoto: null,
        logo: null,
        aadharCard: null,
        panCard: null,
        gstCertificate: null,
        businessLicense: null,
        agreementDocument: null
      });
      setUploadProgress({});
      
      // Show success message
      modal.showSuccess('Theater updated successfully!');
      
      // Close modal immediately
      closeEditModal();
      
      // Clear cache to ensure fresh data - MUST happen before fetchTheaters
      clearTheaterCache();
      invalidateRelatedCaches('theaters', editModal.theater._id);
      
      // Clear specific cache keys used by apiService.getTheaters() and optimizedFetch
      clearCachePattern('api_get_theaters');
      clearCachePattern('api_get_/theaters');
      clearCachePattern('fetch_/api/theaters');
      clearCachePattern('theaters_list_page_');
      
      // Clear image cache for all document URLs
      allDocumentUrls.forEach(url => clearImageCachePattern(url));
      
      // Force refresh theaters list to ensure data consistency
      // Clear the fetching flag to allow immediate refresh
      isFetchingRef.current = false;
      
      // Add a small delay to ensure cache is cleared before fetching
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Force fresh fetch by clearing cache one more time right before fetch
      clearCachePattern('api_get_theaters');
      clearCachePattern('theaters_list_page_');
      
      await fetchTheaters();
      
    } catch (error) {
      console.error('❌ [handleEditSubmit] Error updating theater:', error);
      modal.showError(error.message || 'Failed to update theater. Please try again.');
    }
  };

  const toggleTheaterStatus = async (theaterId, currentStatus) => {
    const newStatus = !currentStatus;
    
    // Prevent multiple clicks on the same theater
    if (togglingTheaterId === theaterId) {
      return;
    }
    
    try {
      
      // Set loading state for this specific theater
      setTogglingTheaterId(theaterId);
      
      // 🚀 INSTANT UI UPDATE: Update local state immediately for instant feedback
      setTheaters(prevTheaters => 
        prevTheaters.map(theater => 
          theater._id === theaterId 
            ? { ...theater, isActive: newStatus }
            : theater
        )
      );

      // 🔄 GLOBAL UPDATE: Update global theater store immediately for cross-component sync
      updateGlobalTheater(theaterId, { isActive: newStatus });

      // Also update summary counts immediately for better UX
      setSummary(prev => ({
        ...prev,
        activeTheaters: newStatus ? prev.activeTheaters + 1 : prev.activeTheaters - 1,
        inactiveTheaters: newStatus ? prev.inactiveTheaters - 1 : prev.inactiveTheaters + 1
      }));

      // Now make the API call in the background
      
      const response = await unifiedFetch(`${config.api.baseUrl}/theaters/${theaterId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify({ isActive: newStatus })
      }, {
        forceRefresh: true, // Don't cache PUT requests
        cacheTTL: 0
      });

      // ✅ FIX: unifiedFetch returns a Response-like object with json() method
      // Parse JSON once
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response JSON:', parseError);
        // If response is not OK, try to get error text
        if (response.ok === false || (response.status && response.status >= 400)) {
          try {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          } catch (textError) {
            throw new Error(`HTTP ${response.status}: Failed to update theater status`);
          }
        }
        throw parseError;
      }
      
      // ✅ FIX: Check backend success flag FIRST (most reliable indicator)
      // Backend returns: { success: true, message: '...', data: {...} }
      if (result && result.success === false) {
        // Backend explicitly returned success: false
        console.error('❌ Backend returned success: false:', result);
        throw new Error(result.message || result.error || 'Failed to update theater status');
      }

      // If success flag is true, proceed (don't check response.ok as unifiedFetch may modify it)
      if (result && result.success === true) {
        // Proceed to success handling - success confirmed
      } else if (!result) {
        // No result at all
        console.error('❌ No result received from API');
        throw new Error('No response received from server');
      } else {
        // Result exists but no explicit success flag - check HTTP status as fallback
        if (!response.ok || (response.status && response.status >= 400)) {
          console.error('❌ API response not OK (no success flag):', response.status, result);
          throw new Error(result?.message || result?.error || `HTTP ${response.status}: Failed to update theater status`);
        } else {
          // Assume success if HTTP status is OK and no explicit failure
        }
      }
      
      // ✅ FIX: If we get here, the operation was successful
      
      // ✅ FIX: Update theater state with backend response to ensure sync
      const updatedTheater = result.data || result;
      if (updatedTheater && updatedTheater._id) {
        const finalTheater = { ...updatedTheater, isActive: newStatus }; // Ensure isActive is set correctly
        setTheaters(prevTheaters => 
          prevTheaters.map(theater => 
            theater._id === theaterId ? finalTheater : theater
          )
        );
        // 🔄 GLOBAL UPDATE: Update global theater store for cross-component sync
        updateGlobalTheater(theaterId, finalTheater);
      } else {
        // If response doesn't have data, just ensure isActive is correct
        setTheaters(prevTheaters => 
          prevTheaters.map(theater => 
            theater._id === theaterId 
              ? { ...theater, isActive: newStatus }
              : theater
          )
        );
        // 🔄 GLOBAL UPDATE: Update global theater store
        updateGlobalTheater(theaterId, { isActive: newStatus });
      }
      
      // 🔄 Invalidate cache to ensure data consistency
      clearTheaterCache();
      invalidateRelatedCaches('theaters');

      // Optional: Show success message
      if (modal.showSuccess) {
        modal.showSuccess(`Theater ${newStatus ? 'activated' : 'deactivated'} successfully`);
      }

    } catch (error) {
      console.error('❌ Failed to toggle theater status:', error);
      
      // 🔄 ROLLBACK: Revert the optimistic update if API fails
      setTheaters(prevTheaters => 
        prevTheaters.map(theater => 
          theater._id === theaterId 
            ? { ...theater, isActive: currentStatus } // Revert to original status
            : theater
        )
      );
      // 🔄 GLOBAL ROLLBACK: Revert global theater store
      updateGlobalTheater(theaterId, { isActive: currentStatus });

      // Revert summary counts as well
      setSummary(prev => ({
        ...prev,
        activeTheaters: currentStatus ? prev.activeTheaters + 1 : prev.activeTheaters - 1,
        inactiveTheaters: currentStatus ? prev.inactiveTheaters - 1 : prev.inactiveTheaters + 1
      }));
      
      // Show error message
      modal.showError(error.message || 'Failed to update theater status. Please try again.');
    } finally {
      // Always clear the toggling state
      setTogglingTheaterId(null);
    }
  };

  // Handle search with debounce
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
    // currentPage reset is handled in debounced effect
  }, []);

  // Handle filter change
  const handleFilterChange = useCallback((e) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1); // Reset to first page when filtering
  }, []);

  // Pagination handlers (matching QRManagement)
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
  }, []);

  // Handle items per page change
  const handleItemsPerPageChange = useCallback((e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  // Cleanup effect for aborting requests (matching QRManagement)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // 🚀 ULTRA-INSTANT: NEVER block render (like Settings page - always renders content immediately)
  // Settings page ALWAYS renders immediately - we do the same
  // Removed early return - always render page structure, show loading inside table only

  if (error) {
    return (
      <AdminLayout pageTitle="Theater Management" currentPage="theaters">
        <div className="theater-list-container">
          <div className="error-state">
            <h3>Error Loading Theaters</h3>
            <p>{error}</p>
            <button onClick={fetchTheaters} className="retry-btn">
              Try Again
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Header action button for adding new theater
  const headerButton = (
    <button 
      onClick={() => navigate('/add-theater')} 
      className="header-btn"
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </span>
      ADD NEW THEATER
    </button>
  );

  return (
    <ErrorBoundary>
      <AdminLayout pageTitle="Theater Management" currentPage="theaters">
        <div className="role-create-details-page qr-management-page">
          <PageContainer
            hasHeader={false}
            className="role-create-vertical"
          >
            {/* Global Vertical Header Component */}
            <VerticalPageHeader
              title="Theater Management"
              showBackButton={false}
              actionButton={headerButton}
            />
            
            {/* Stats Section - 🚀 INSTANT: Use cached summary for instant display */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.totalTheaters || totalItems || 0}</div>
                <div className="stat-label">Total Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.activeTheaters || theaters.filter(theater => theater.isActive === true).length || 0}</div>
                <div className="stat-label">Active Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.inactiveTheaters || theaters.filter(theater => theater.isActive === false).length || 0}</div>
                <div className="stat-label">Inactive Theaters</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.activeAgreements || theaters.filter(theater => theater.agreement?.status === 'active').length || 0}</div>
                <div className="stat-label">Active Agreements</div>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search theaters by name, city, or owner..."
                  value={searchTerm}
                  onChange={handleSearchChange}
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
                  Showing {sortedTheaters.length} of {totalItems} theaters (Page {currentPage} of {totalPages})
                </div>
                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select value={itemsPerPage} onChange={handleItemsPerPageChange} className="items-select">
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Theater Table Container */}
            <div className="page-table-container">
              {/* Theater Table */}
              {sortedTheaters.length === 0 && !loading ? (
                <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-xl">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
              </svg>
            </div>
            <h3>No Theaters Found</h3>
            <p>
              {searchTerm || filterStatus !== 'all' 
                ? 'No theaters match your current filters.'
                : 'Start by adding your first theater to the network.'
              }
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <button 
                onClick={() => navigate('/add-theater')} 
                className="add-theater-btn"
              >
                Add Your First Theater
              </button>
            )}
              </div>
            ) : (
              <div className="table-container">
                <div className="table-wrapper">
                  <table className="theater-table">
                    <thead>
                  <tr>
                    <th className="sno-col">S NO</th>
                    <th className="photo-col">Photo</th>
                    <th className="name-col">Theater Name</th>
                    <th className="owner-col">Owner</th>
                    <th className="location-col">Location</th>
                    <th className="contact-col">Contact</th>
                    <th className="agreement-col">Agreement Period</th>
                    <th className="status-col">Status</th>
                    <th className="access-status-col">Access Status</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && theaters.length === 0 ? (
                    <TableSkeleton count={itemsPerPage} />
                  ) : (
                    sortedTheaters.map((theater, index) => (
                      <tr key={theater._id} className={`theater-row ${!theater.isActive ? 'inactive' : ''}`}>
                      {/* S NO Column */}
                      <td className="sno-cell">
                        <div className="sno-number">{(currentPage - 1) * itemsPerPage + index + 1}</div>
                      </td>

                      {/* Photo Column */}
                      <td className="photo-cell">
                        <div className="theater-photo-thumb">
                          {(theater.documents?.theaterPhoto || theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl) ? (
                            <img
                              src={theater.documents?.theaterPhoto || theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl}
                              alt={theater.name}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                const noPhotoDiv = e.target.parentElement.querySelector('.no-photo');
                                if (noPhotoDiv) {
                                  noPhotoDiv.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div className="no-photo" style={{ display: (theater.documents?.theaterPhoto || theater.documents?.logo || theater.branding?.logo || theater.branding?.logoUrl) ? 'none' : 'flex' }}>
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
                            </svg>
                          </div>
                        </div>
                      </td>

                      {/* Theater Name Column */}
                      <td className="theater-name-cell">
                        <div className="theater-name-full">{theater.name}</div>
                      </td>

                      {/* Owner Column */}
                      <td className="owner-cell">
                        <div className="owner-info">
                          <div className="owner-name">{theater.ownerDetails?.name || 'N/A'}</div>
                        </div>
                      </td>

                      {/* Location Column */}
                      <td className="location-cell">
                        <div className="location-info">
                          <div className="city">{theater.address?.city || 'N/A'}</div>
                          <div className="state">{theater.address?.state || 'N/A'}</div>
                          <div className="pincode">{theater.address?.pincode || theater.address?.zipCode || 'N/A'}</div>
                        </div>
                      </td>

                      {/* Contact Column */}
                      <td className="contact-cell">
                        <div className="contact-info">
                          <div className="phone">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                            </svg>
                            {theater.phone}
                          </div>
                        </div>
                      </td>

                      {/* Agreement Column */}
                      <td className="agreement-cell">
                        <div className="agreement-info">
                          {theater.agreementDetails?.startDate && theater.agreementDetails?.endDate ? (
                            <>
                              <div className="start-date">
                                From: {new Date(theater.agreementDetails.startDate).toLocaleDateString()}
                              </div>
                              <div className={`end-date ${theater.agreementExpiring ? 'expiring' : ''} ${theater.agreementExpired ? 'expired' : ''}`}>
                                To: {new Date(theater.agreementDetails.endDate).toLocaleDateString()}
                                {theater.agreementExpiring && (
                                  <span className="expiring-badge" title={`Expires in ${theater.daysUntilExpiration} day(s)`}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    {theater.daysUntilExpiration} day(s)
                                  </span>
                                )}
                                {theater.agreementExpired && (
                                  <span className="expired-badge" title="Agreement has expired">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                      <circle cx="12" cy="12" r="10"></circle>
                                      <line x1="12" y1="8" x2="12" y2="12"></line>
                                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                    Expired
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="no-agreement">
                              <span className="no-agreement-text">No agreement dates</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="status-cell">
                        <span className={`status-badge ${theater.isActive ? 'active' : 'inactive'}`}>
                          {theater.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Access Status Column - Toggle Button */}
                      <td className="access-status-cell">
                        <div className="toggle-wrapper">
                          <label 
                            className="switch"
                            style={{
                              position: 'relative',
                              display: 'inline-block',
                              width: '50px',
                              height: '24px',
                              opacity: togglingTheaterId === theater._id ? 0.6 : 1,
                              pointerEvents: togglingTheaterId === theater._id ? 'none' : 'auto'
                            }}
                            onClick={(e) => e.stopPropagation()} // Prevent row click
                          >
                            <input
                              type="checkbox"
                              checked={theater.isActive !== false}
                              onChange={(e) => {
                                e.stopPropagation(); // Prevent row click
                                toggleTheaterStatus(theater._id, theater.isActive);
                              }}
                              disabled={togglingTheaterId === theater._id}
                              style={{
                                opacity: 0,
                                width: 0,
                                height: 0
                              }}
                            />
                            <span 
                              className="slider"
                              style={{
                                position: 'absolute',
                                cursor: togglingTheaterId === theater._id ? 'wait' : 'pointer',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: (theater.isActive !== false) ? 'var(--primary-dark, #6D28D9)' : '#ccc',
                                transition: '.4s',
                                borderRadius: '24px'
                              }}
                            >
                              <span style={{
                                position: 'absolute',
                                content: '""',
                                height: '18px',
                                width: '18px',
                                left: (theater.isActive !== false) ? '26px' : '3px',
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

                      {/* Actions Column */}
                      <td className="actions-cell">
                        <ActionButtons>
                          <ActionButton 
                            type="view"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click
                              handleViewClick(theater);
                            }}
                            title="View Theater Details"
                          />
                          
                          <ActionButton 
                            type="edit"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click
                              handleEditClick(theater);
                            }}
                            title="Edit Theater"
                          />
                          
                          <ActionButton 
                            type="delete"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click
                              setDeleteModal({ show: true, theater });
                            }}
                            title="Delete Theater"
                          />
                        </ActionButtons>
                      </td>
                    </tr>
                    ))
                  )}
                  </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* 🚀 INSTANT: Always show pagination if we have data (even if loading in background) */}
              {(theaters.length > 0 || totalItems > 0) && (
                <Pagination 
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  itemType="theaters"
                />
              )}
            </div>
          </PageContainer>

          {/* View Theater Modal */}
          {viewModal.show && (
            <div className="modal-overlay" onClick={() => setViewModal({ show: false, theater: null })}>
              <div className="modal-content theater-view-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-section">
                  <h2>Theater Details</h2>
                </div>
                
                <div className="modal-nav-right">
                  <button 
                    className="close-btn" 
                    onClick={() => setViewModal({ show: false, theater: null })}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="modal-body">
                {viewModal.loading ? (
                  <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">Loading theater details...</p>
                  </div>
                ) : (
                <>
                <div className="edit-form">
                  <div className="form-group">
                    <label>Theater Name</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.name || ''} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Owner Name</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.ownerDetails?.name || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.phone || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Owner Contact Number</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.ownerDetails?.contactNumber || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  {viewModal.theater?.email && (
                    <div className="form-group">
                      <label>Email Address</label>
                      <input 
                        type="text" 
                        value={viewModal.theater?.email || 'N/A'} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Address</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.address?.street || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.address?.city || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.address?.state || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Pincode</label>
                    <input 
                      type="text" 
                      value={viewModal.theater?.address?.pincode || viewModal.theater?.address?.zipCode || 'N/A'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={viewModal.theater?.isActive ? 'Active' : 'Inactive'} 
                      className="form-control"
                      disabled
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  {/* Business Registration Details */}
                  {(viewModal.theater?.gstNumber || viewModal.theater?.fssaiNumber || viewModal.theater?.uniqueNumber) && (
                    <>
                      {viewModal.theater?.gstNumber && (
                        <div className="form-group">
                          <label>GST Number</label>
                          <input 
                            type="text" 
                            value={viewModal.theater.gstNumber} 
                            className="form-control input-monospace"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.theater?.fssaiNumber && (
                        <div className="form-group">
                          <label>FSSAI License Number</label>
                          <input 
                            type="text" 
                            value={viewModal.theater.fssaiNumber} 
                            className="form-control input-monospace"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.theater?.uniqueNumber && (
                        <div className="form-group">
                          <label>Unique Identifier</label>
                          <input 
                            type="text" 
                            value={viewModal.theater.uniqueNumber} 
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                    </>
                  )}
                  {viewModal.theater?.agreementDetails?.startDate && (
                    <div className="form-group">
                      <label>Agreement Start Date</label>
                      <input 
                        type="text" 
                        value={new Date(viewModal.theater.agreementDetails.startDate).toLocaleDateString()} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                  {viewModal.theater?.agreementDetails?.endDate && (
                    <div className="form-group">
                      <label>Agreement End Date</label>
                      <input 
                        type="text" 
                        value={new Date(viewModal.theater.agreementDetails.endDate).toLocaleDateString()} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                  )}
                  {/* {(viewModal.theater?.documents?.logo || viewModal.theater?.branding?.logo || viewModal.theater?.branding?.logoUrl) && (
                    <div className="form-group">
                      <label>Theater Logo</label>
                      <div className="logo-preview-container">
                        <InstantImage 
                          src={viewModal.theater.documents?.logo || viewModal.theater.branding?.logo || viewModal.theater.branding?.logoUrl} 
                          alt="Theater Logo" 
                          className="theater-logo-preview image-preview-container"
                          loading="eager"
                        />
                      </div>
                    </div>
                  )} */}
                </div>

                {/* Documents Section in View Modal */}
                {viewModal.theater && viewModal.theater.documents && (
                  <div className="documents-section">
                    <h3>Documents & Media</h3>
                    <div className="documents-grid">
                      {/* Theater Photo */}
                      {viewModal.theater.documents?.theaterPhoto && (
                        <div className="document-item">
                          <label>Theater Photo</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-theater-photo-${viewModal.theater._id}-${viewModal.theater.documents.theaterPhoto}`}
                              src={normalizeImageUrl(viewModal.theater.documents.theaterPhoto)} 
                              alt="Theater Photo"
                              className="document-image"
                              loading="eager"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button
                              onClick={() => handleDownloadFile(viewModal.theater.documents.theaterPhoto, 'theater-photo.jpg')}
                              className="action-btn download-btn download-btn-overlay"
                              title="Download"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              📷 Theater Photo
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Logo */}
                      {(viewModal.theater.documents?.logo || viewModal.theater.branding?.logo || viewModal.theater.branding?.logoUrl) && (
                        <div className="document-item">
                          <label>Theater Logo</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-logo-${viewModal.theater._id}-${viewModal.theater.documents?.logo || viewModal.theater.branding?.logo || viewModal.theater.branding?.logoUrl || ''}`}
                              src={normalizeImageUrl(viewModal.theater.documents?.logo || viewModal.theater.branding?.logo || viewModal.theater.branding?.logoUrl)} 
                              alt="Theater Logo"
                              className="document-image"
                              loading="eager"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button
                              onClick={() => handleDownloadFile(viewModal.theater.documents?.logo || viewModal.theater.branding?.logo || viewModal.theater.branding?.logoUrl, 'theater-logo.png')}
                              className="action-btn download-btn download-btn-overlay"
                              title="Download"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              🏢 Theater Logo
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Aadhar Card */}
                      {viewModal.theater.documents?.aadharCard && (
                        <div className="document-item">
                          <label>Aadhar Card</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-aadhar-${viewModal.theater._id}-${viewModal.theater.documents.aadharCard}`}
                              src={normalizeImageUrl(viewModal.theater.documents.aadharCard)} 
                              alt="Aadhar Card"
                              className="document-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button
                              onClick={() => handleDownloadFile(viewModal.theater.documents.aadharCard, 'aadhar-card.pdf')}
                              className="action-btn download-btn download-btn-overlay"
                              title="Download"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              🆔 Aadhar Card
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PAN Card */}
                      {viewModal.theater.documents?.panCard && (
                        <div className="document-item">
                          <label>PAN Card</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-pan-${viewModal.theater._id}-${viewModal.theater.documents.panCard}`}
                              src={normalizeImageUrl(viewModal.theater.documents.panCard)} 
                              alt="PAN Card"
                              className="document-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                viewModal.theater.documents.panCard,
                                `${viewModal.theater.name}_PAN_Card.pdf`
                              )}
                              title="Download PAN Card"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              📄 PAN Card
                            </div>
                          </div>
                        </div>
                      )}

                      {/* GST Certificate */}
                      {viewModal.theater.documents?.gstCertificate && (
                        <div className="document-item">
                          <label>GST Certificate</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-gst-${viewModal.theater._id}-${viewModal.theater.documents.gstCertificate}`}
                              src={normalizeImageUrl(viewModal.theater.documents.gstCertificate)} 
                              alt="GST Certificate"
                              className="document-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                viewModal.theater.documents.gstCertificate,
                                `${viewModal.theater.name}_GST_Certificate.pdf`
                              )}
                              title="Download GST Certificate"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              📋 GST Certificate
                            </div>
                          </div>
                        </div>
                      )}

                      {/* FSSAI Certificate */}
                      {viewModal.theater.documents?.fssaiCertificate && (
                        <div className="document-item">
                          <label>FSSAI Certificate</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-fssai-${viewModal.theater._id}-${viewModal.theater.documents.fssaiCertificate}`}
                              src={normalizeImageUrl(viewModal.theater.documents.fssaiCertificate)} 
                              alt="FSSAI Certificate"
                              className="document-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                viewModal.theater.documents.fssaiCertificate,
                                `${viewModal.theater.name}_FSSAI_Certificate.pdf`
                              )}
                              title="Download FSSAI Certificate"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              🍽️ FSSAI Certificate
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Agreement Copy */}
                      {viewModal.theater.documents?.agreementCopy && (
                        <div className="document-item">
                          <label>Agreement Copy</label>
                          <div className="document-preview">
                            <InstantImage 
                              key={`view-agreement-${viewModal.theater._id}-${viewModal.theater.documents.agreementCopy}`}
                              src={normalizeImageUrl(viewModal.theater.documents.agreementCopy)} 
                              alt="Agreement Copy"
                              className="document-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                viewModal.theater.documents.agreementCopy,
                                `${viewModal.theater.name}_Agreement_Copy.pdf`
                              )}
                              title="Download Agreement Copy"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                            <div className="document-placeholder document-placeholder-hidden">
                              📝 Agreement Copy
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
                )}
              </div>
              </div>
            </div>
          )}

          {/* Edit Theater Modal */}
          {editModal.show && (
            <div className="modal-overlay" onClick={closeEditModal}>
              <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-section">
                  <h2>Edit Theater</h2>
                </div>
                
                <div className="modal-nav-right">
                  <button 
                    className="close-btn"
                    onClick={closeEditModal}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="modal-body">
                {editModal.loading ? (
                  <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">Loading theater details...</p>
                  </div>
                ) : (
                <>
                <div className="edit-form edit-form-spacing">
                  <div className="form-grid form-grid-spacing">
                    <div className="form-group">
                      <label className="required">Theater Name</label>
                      <input 
                        type="text" 
                        value={editFormData.theaterName || ''} 
                        onChange={(e) => handleEditFormChange('theaterName', e.target.value)}
                        className="form-control"
                        placeholder="e.g., Grand Theater"
                      />
                    </div>
                    <div className="form-group">
                      <label className="required">Owner Name</label>
                      <input 
                        type="text" 
                        value={editFormData.ownerName || ''} 
                        onChange={(e) => handleEditFormChange('ownerName', e.target.value)}
                        className="form-control"
                        placeholder="Enter owner name"
                      />
                    </div>
                  </div>

                  <div className="form-grid form-grid-spacing">
                    <div className="form-group full-width">
                      <label>Address</label>
                      <textarea 
                        value={editFormData.address || ''} 
                        onChange={(e) => handleEditFormChange('address', e.target.value)}
                        className="form-control"
                        placeholder="Enter complete address"
                        rows="3"
                      ></textarea>
                    </div>
                  </div>

                  <div className="form-grid form-grid-spacing">
                    <div className="form-group">
                      <label className="required">Theater Phone</label>
                      <input 
                        type="tel" 
                        value={editFormData.phone || ''} 
                        onChange={(e) => handleEditFormChange('phone', e.target.value)}
                        className="form-control"
                        placeholder="Enter theater phone number"
                      />
                    </div>
                    <div className="form-group">
                      <label className="required">Owner Contact Number</label>
                      <input 
                        type="tel" 
                        value={editFormData.ownerContactNumber || ''} 
                        onChange={(e) => handleEditFormChange('ownerContactNumber', e.target.value)}
                        className="form-control"
                        placeholder="Enter owner contact number"
                      />
                    </div>
                  </div>

                  <div className="form-grid form-grid-spacing">
                    <div className="form-group">
                      <label>Email Address</label>
                      <input 
                        type="email" 
                        value={editFormData.email || ''} 
                        onChange={(e) => handleEditFormChange('email', e.target.value)}
                        className="form-control"
                        placeholder="Enter email address"
                      />
                    </div>
                    <div className="form-group">
                      <label className="required">City</label>
                      <input 
                        type="text" 
                        value={editFormData.city || ''} 
                        onChange={(e) => handleEditFormChange('city', e.target.value)}
                        className="form-control"
                        placeholder="Enter city"
                      />
                    </div>
                  </div>

                  <div className="form-grid form-grid-spacing">
                    <div className="form-group">
                      <label className="required">State</label>
                      <input 
                        type="text" 
                        value={editFormData.state || ''} 
                        onChange={(e) => handleEditFormChange('state', e.target.value)}
                        className="form-control"
                        placeholder="Enter state"
                      />
                    </div>
                    <div className="form-group">
                      <label className="required">Pincode</label>
                      <input 
                        type="text" 
                        value={editFormData.pincode || ''} 
                        onChange={(e) => handleEditFormChange('pincode', e.target.value)}
                        className="form-control"
                        placeholder="Enter pincode"
                      />
                    </div>
                  </div>

                  {/* Business Registration Details */}
                  <div className="form-grid form-grid-spacing-last">
                    <div className="form-group">
                      <label>GST Number</label>
                      <input 
                        type="text" 
                        value={editFormData.gstNumber || ''} 
                        onChange={(e) => handleEditFormChange('gstNumber', e.target.value.toUpperCase())}
                        className="form-control input-uppercase"
                        placeholder="e.g., 22AAAAA0000A1Z5"
                        maxLength="15"
                      />
                      <small className="helper-text">15-character GST Number (Optional)</small>
                    </div>
                    <div className="form-group">
                      <label>FSSAI License Number</label>
                      <input 
                        type="text" 
                        value={editFormData.fssaiNumber || ''} 
                        onChange={(e) => handleEditFormChange('fssaiNumber', e.target.value.replace(/\D/g, ''))}
                        className="form-control"
                        placeholder="e.g., 12345678901234"
                        maxLength="14"
                      />
                      <small className="helper-text">14-digit FSSAI Number (Optional)</small>
                    </div>
                    <div className="form-group">
                      <label>Unique Identifier</label>
                      <input 
                        type="text" 
                        value={editFormData.uniqueNumber || ''} 
                        onChange={(e) => handleEditFormChange('uniqueNumber', e.target.value)}
                        className="form-control"
                        placeholder="Enter unique identifier"
                      />
                      <small className="helper-text">Any unique reference (Optional)</small>
                    </div>
                  </div>
                </div>

                {/* Documents & Media Section */}
                <div className="form-section form-section-documents">
                  <h3>📁 Documents & Media</h3>
                  
                  <div className="documents-grid">
                    {/* Theater Photo */}
                    <div className="document-item">
                      <label>Theater Photo</label>
                      <div className="document-preview">
                        {editModal.theater?.documents?.theaterPhoto ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              📷 Theater Photo
                            </div>
                            {/* 🚀 FIX: Use regular img for blob URLs, InstantImage for others */}
                            {editModal.theater.documents.theaterPhoto.startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents.theaterPhoto}
                                alt="Theater Photo"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-theater-photo-${editModal.theater._id}-${editModal.theater.documents?.theaterPhoto || 'none'}-${editModal.openTimestamp || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents.theaterPhoto)} 
                                alt="Theater Photo"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents.theaterPhoto,
                                `${editModal.theater.name}_Theater_Photo.jpg`
                              )}
                              title="Download Theater Photo"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
📷 Theater Photo
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, 'theaterPhoto')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>

                    {/* Theater Logo */}
                    <div className="document-item">
                      <label>Theater Logo</label>
                      <div className="document-preview">
                        {(editModal.theater?.documents?.logo || editModal.theater?.branding?.logo || editModal.theater?.branding?.logoUrl) ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              🏢 Theater Logo
                            </div>
                            {(editModal.theater.documents?.logo || editModal.theater.branding?.logo || editModal.theater.branding?.logoUrl || '').startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents?.logo || editModal.theater.branding?.logo || editModal.theater.branding?.logoUrl}
                                alt="Theater Logo"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-logo-${editModal.theater._id}-${editModal.theater.documents?.logo || editModal.theater.branding?.logo || editModal.theater.branding?.logoUrl || 'none'}-${editModal.openTimestamp || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents?.logo || editModal.theater.branding?.logo || editModal.theater.branding?.logoUrl)} 
                                alt="Theater Logo"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents?.logo || editModal.theater.branding?.logo || editModal.theater.branding?.logoUrl,
                                `${editModal.theater.name}_Logo.jpg`
                              )}
                              title="Download Theater Logo"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
                            🏢 Theater Logo
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, 'logo')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>

                    {/* Aadhar Card */}
                    <div className="document-item">
                      <label>Aadhar Card</label>
                      <div className="document-preview">
                        {editModal.theater?.documents?.aadharCard ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              🆔 Aadhar Card
                            </div>
                            {editModal.theater.documents.aadharCard.startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents.aadharCard}
                                alt="Aadhar Card"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-aadhar-${editModal.theater._id}-${editModal.theater.documents?.aadharCard || 'none'}-${editModal.openTimestamp || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents.aadharCard)} 
                                alt="Aadhar Card"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents.aadharCard,
                                `${editModal.theater.name}_Aadhar_Card.pdf`
                              )}
                              title="Download Aadhar Card"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
                            🆔 Aadhar Card
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'aadharCard')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>

                    {/* PAN Card */}
                    <div className="document-item">
                      <label>PAN Card</label>
                      <div className="document-preview">
                        {editModal.theater?.documents?.panCard ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              📄 PAN Card
                            </div>
                            {editModal.theater.documents.panCard.startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents.panCard}
                                alt="PAN Card"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-pan-${editModal.theater._id}-${editModal.theater.documents?.panCard || 'none'}-${editModal.openTimestamp || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents.panCard)} 
                                alt="PAN Card"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents.panCard,
                                `${editModal.theater.name}_PAN_Card.pdf`
                              )}
                              title="Download PAN Card"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
                            📄 PAN Card
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'panCard')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>

                    {/* GST Certificate */}
                    <div className="document-item">
                      <label>GST Certificate</label>
                      <div className="document-preview">
                        {editModal.theater?.documents?.gstCertificate ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              📋 GST Certificate
                            </div>
                            {editModal.theater.documents.gstCertificate.startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents.gstCertificate}
                                alt="GST Certificate"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-gst-${editModal.theater._id}-${editModal.theater.documents?.gstCertificate || 'none'}-${editModal.openTimestamp || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents.gstCertificate)} 
                                alt="GST Certificate"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents.gstCertificate,
                                `${editModal.theater.name}_GST_Certificate.pdf`
                              )}
                              title="Download GST Certificate"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
                            📋 GST Certificate
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'gstCertificate')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>

                    {/* FSSAI Certificate */}
                    <div className="document-item">
                      <label>FSSAI Certificate</label>
                      <div className="document-preview">
                        {editModal.theater?.documents?.fssaiCertificate ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              🍽️ FSSAI Certificate
                            </div>
                            {editModal.theater.documents.fssaiCertificate.startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents.fssaiCertificate}
                                alt="FSSAI Certificate"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-fssai-${editModal.theater._id}-${editModal.theater.documents?.fssaiCertificate || 'none'}-${editModal.openTimestamp || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents.fssaiCertificate)} 
                                alt="FSSAI Certificate"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents.fssaiCertificate,
                                `${editModal.theater.name}_FSSAI_Certificate.pdf`
                              )}
                              title="Download FSSAI Certificate"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
                            🍽️ FSSAI Certificate
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'fssaiCertificate')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>

                    {/* Agreement Copy */}
                    <div className="document-item">
                      <label>Agreement Copy</label>
                      <div className="document-preview">
                        {editModal.theater?.documents?.agreementCopy ? (
                          <>
                            <div className="document-placeholder document-placeholder-hidden">
                              📝 Agreement Copy
                            </div>
                            {editModal.theater.documents.agreementCopy.startsWith('blob:') ? (
                              <img 
                                src={editModal.theater.documents.agreementCopy}
                                alt="Agreement Copy"
                                className="document-image document-image-cover"
                              />
                            ) : (
                              <InstantImage 
                                key={`edit-agreement-${editModal.theater._id}-${editModal.theater.documents?.agreementCopy || ''}`}
                                src={normalizeImageUrl(editModal.theater.documents.agreementCopy)} 
                                alt="Agreement Copy"
                                className="document-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const placeholder = e.target.parentElement.querySelector('.document-placeholder');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            )}
                            <button 
                              className="action-btn download-btn download-btn-overlay"
                              onClick={() => handleDownloadFile(
                                editModal.theater.documents.agreementCopy,
                                `${editModal.theater.name}_Agreement_Copy.pdf`
                              )}
                              title="Download Agreement Copy"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-6 2h12v2H6v-2z"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <div className="document-placeholder">
                            📝 Agreement Copy
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'agreementDocument')}
                        className="file-input upload-button-fullwidth"
                      />
                    </div>
                  </div>
                </div>
                </>
                )}
              </div>
              
              {/* Fixed Footer with Cancel and Submit Buttons */}
              {!editModal.loading && (
              <div className="modal-actions">
                <button 
                  className="cancel-btn" 
                  onClick={closeEditModal}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleEditSubmit}
                >
                  Save Changes
                </button>
              </div>
              )}
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
                <p>Are you sure you want to delete <strong>{deleteModal.theater?.name}</strong>?</p>
                <p className="warning-text">This action cannot be undone.</p>
              </div>
              <div className="modal-actions">
                <button 
                  onClick={() => setDeleteModal({ show: false, theater: null })}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(deleteModal.theater._id)}
                  className="confirm-delete-btn"
                >
                  Delete Theater
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>

    {/* Custom CSS for TheaterList modals only */}
    <style dangerouslySetInnerHTML={{
      __html: `
        .theater-view-modal-content,
        .theater-edit-modal-content {
          max-width: 900px !important;
          width: 85% !important;
        }

        .theater-edit-modal-content .modal-body {
          padding: 24px !important;
        }

        .theater-edit-modal-content .edit-form .form-grid {
          margin-bottom: 24px;
        }

        .theater-edit-modal-content .edit-form .form-grid:last-of-type {
          margin-bottom: 0;
        }

        .theater-edit-modal-content .form-section {
          margin-top: 32px;
          padding-top: 32px;
          border-top: 1px solid #e2e8f0;
        }

        .theater-edit-modal-content .form-section h3 {
          margin-bottom: 20px;
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }

        .theater-edit-modal-content .documents-grid {
          margin-top: 0;
        }

        .theater-edit-modal-content .document-item {
          margin-bottom: 0;
        }

        .theater-edit-modal-content .form-group {
          display: flex;
          flex-direction: column;
        }

        .theater-edit-modal-content .form-group label {
          margin-bottom: 8px;
        }

        .theater-edit-modal-content .form-group.full-width {
          grid-column: 1 / -1;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .theater-view-modal-content,
          .theater-edit-modal-content {
            width: 95% !important;
            max-width: none !important;
          }

          .theater-edit-modal-content .modal-body {
            padding: 20px !important;
          }

          .theater-edit-modal-content .edit-form .form-grid {
            margin-bottom: 20px;
          }

          .theater-edit-modal-content .form-section {
            margin-top: 24px;
            padding-top: 24px;
          }
        }
      `
    }} />
  </ErrorBoundary>
  );
});

TheaterList.displayName = 'TheaterList';

export default TheaterList;

