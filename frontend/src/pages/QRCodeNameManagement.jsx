import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import config from '../config';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import PageContainer from '../components/PageContainer';
import VerticalPageHeader from '../components/VerticalPageHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import Pagination from '../components/Pagination';
import { useToast } from '../contexts/ToastContext';
import { clearTheaterCache, addCacheBuster } from '../utils/cacheManager';
import { usePerformanceMonitoring, preventLayoutShift } from '../hooks/usePerformanceMonitoring';
import { optimizedFetch } from '../utils/apiOptimizer';
import '../styles/TheaterGlobalModals.css'; // Global theater modal styles
import '../styles/QRManagementPage.css';
import '../styles/TheaterList.css';
import '../styles/pages/QRCodeNameManagement.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '../utils/ultraPerformance';
import { ultraFetch } from '../utils/ultraFetch';
import { unifiedFetch } from '../utils/unifiedFetch';



// Enhanced Lazy Loading Image Component with Intersection Observer (matching TheaterList)
const LazyTheaterImage = React.memo(({ src, alt, className, style }) => {
  const [imageSrc, setImageSrc] = useState('/placeholder-theater.png');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && src && src !== '/placeholder-theater.png') {
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
  }, [src]);

  return (
    <div className="lazy-theater-container" style={style}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`lazy-theater-image ${className} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
        onError={() => setHasError(true)}
      />
      {isLoading && (
        <div className="image-skeleton">
          <div className="skeleton-shimmer"></div>
        </div>
      )}
    </div>
  );
});

// Table Row Skeleton Component (matching TheaterList)
const TableRowSkeleton = React.memo(() => (
  <tr className="skeleton-row">
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text wide"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
  </tr>
));

const QRCodeNameManagement = () => {
  const navigate = useNavigate();
  const { theaterId } = useParams(); // Get theaterId from URL
  const toast = useToast();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('QRCodeNameManagement');
  
  // Theater state
  const [theater, setTheater] = useState(null);
  const [theaterLoading, setTheaterLoading] = useState(true);
  
  // Data state
  const [qrCodeNames, setQRCodeNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({
    activeQRNames: 0,
    inactiveQRNames: 0,
    totalQRNames: 0
  });
  
  // Pagination state (matching TheaterList)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pagination, setPagination] = useState({});
  
  // Filter state with debounced search
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Performance refs (matching TheaterList)
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Sort QR Code Names by ID in ascending order
  const sortedQRCodeNames = useMemo(() => {
    return [...qrCodeNames].sort((a, b) => {
      // Sort by MongoDB ObjectId in ascending order (chronological creation order)
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [qrCodeNames]);

  // Debounced search effect (matching TheaterList)
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

  // Load theater data when theaterId is present
  useEffect(() => {
    if (theaterId) {
      // 🔄 FORCE REFRESH: Always force refresh theater data on mount
      loadTheaterData(true);
    } else {
      setTheaterLoading(false);
    }
  }, [theaterId]);

  // Load QR code name data with pagination and search
  useEffect(() => {
    // 🔄 FORCE REFRESH: Force refresh on initial mount (first page, no search)
    const isInitialMount = currentPage === 1 && !debouncedSearchTerm;
    loadQRCodeNameData(isInitialMount);
  }, [currentPage, debouncedSearchTerm, itemsPerPage, theaterId]);

  const loadTheaterData = useCallback(async (forceRefresh = false) => {
    if (!theaterId) return;
    
    try {
      setTheaterLoading(true);

      // � FORCE REFRESH: Add cache-busting parameter when force refreshing
      const params = new URLSearchParams();
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // 🔄 FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      // 🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const apiUrl = `${config.api.baseUrl}/theaters/${theaterId}${params.toString() ? '?' + params.toString() : ''}`;
      const result = await optimizedFetch(
        apiUrl,
        {
          method: 'GET',
          headers
        },
        forceRefresh ? null : `theater_${theaterId}`,
        120000 // 2-minute cache
      );
      

      if (!result) {
        throw new Error('Failed to fetch theater data');
      }

      if (result.success) {
        // Backend returns theater data under 'theater' key, not 'data'
        const theaterData = result.theater || result.data;

        setTheater(theaterData);
      } else {
        throw new Error(result.message || 'Failed to load theater');
      }
    } catch (error) {

      setError('Failed to load theater details');
    } finally {
      setTheaterLoading(false);
    }
  }, [theaterId]);

  const loadQRCodeNameData = useCallback(async (forceRefresh = false) => {
    try {
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      setError('');
      
      // Build query parameters with pagination
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });
      
      // Add theater filter if theaterId is present
      if (theaterId) {
        params.append('theaterId', theaterId);
  }
      
      if (debouncedSearchTerm.trim()) {
        params.append('q', debouncedSearchTerm.trim());
      }

      // 🔄 FORCE REFRESH: Add cache-busting timestamp when force refreshing
      if (forceRefresh) {
        params.append('_t', Date.now().toString());
      }

      // � FORCE REFRESH: Add no-cache headers when force refreshing
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Accept': 'application/json'
      };

      if (forceRefresh) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      // �🚀 PERFORMANCE: Use optimizedFetch for instant cache loading
      const apiUrl = `${config.api.baseUrl}/qrcodenames?${params.toString()}`;
      const cacheKey = `qrcodenames_theater_${theaterId || 'all'}_page_${currentPage}_limit_${itemsPerPage}_search_${debouncedSearchTerm || 'none'}`;
      const data = await optimizedFetch(
        apiUrl,
        {
          signal: abortControllerRef.current.signal,
          headers
        },
        forceRefresh ? null : cacheKey,
        120000 // 2-minute cache
      );
      

      if (!data) {
        throw new Error('Failed to fetch QR code name data');
      }

      if (data.success) {
        // PERFORMANCE OPTIMIZATION: Direct state update without expensive comparison
        const newData = data.data?.qrCodeNames || [];

        setQRCodeNames(newData);
        
        // PERFORMANCE OPTIMIZATION: Batch pagination state updates
        const paginationData = data.data?.pagination || {};
        setPagination(paginationData);
        setTotalPages(paginationData.totalPages || 0);
        setTotalItems(paginationData.totalItems || 0);
        
        // Calculate summary statistics
        const activeQRNames = newData.filter(qr => qr.isActive).length;
        const inactiveQRNames = newData.filter(qr => !qr.isActive).length;
        
        setSummary({
          activeQRNames,
          inactiveQRNames,
          totalQRNames: newData.length
        });
      } else {
        setError('Failed to load QR code name data');
      }
    } catch (error) {
      // Handle AbortError gracefully
      if (error.name === 'AbortError') {

        return;
      }

      setError('Failed to load QR code name data');
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, itemsPerPage, theaterId]);

  // Pagination handlers (matching TheaterList)
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
  }, []);

  const handleItemsPerPageChange = useCallback((e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  // Cleanup effect for aborting requests (matching TheaterList)
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

  const [showViewModal, setShowViewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQRCodeName, setSelectedQRCodeName] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ show: false, qrCodeName: null });
  const [formData, setFormData] = useState({
    qrName: '',
    seatClass: '',
    description: '',
    isActive: true
  });

  const viewQRCodeName = (qrCodeName) => {
    setSelectedQRCodeName(qrCodeName);
    setShowViewModal(true);
  };

  const editQRCodeName = (qrCodeName) => {
    setSelectedQRCodeName(qrCodeName);
    setFormData({
      qrName: qrCodeName.qrName || '',
      seatClass: qrCodeName.seatClass || 'GENERAL',
      description: qrCodeName.description || '',
      isActive: qrCodeName.isActive
    });
    setShowEditModal(true);
  };

  const deleteQRCodeName = async (qrCodeName) => {
    try {
      const token = config.helpers.getAuthToken();
      if (!token) {
        toast.error('Authentication required. Please login again.');
        return;
      }

      // Show simple delete modal instead of confirm dialog
      setDeleteModal({ show: true, qrCodeName });
    } catch (error) {

      toast.error('Failed to prepare delete action. Please try again.');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const token = config.helpers.getAuthToken();
      const qrCodeName = deleteModal.qrCodeName;

      if (!qrCodeName || !qrCodeName._id) {
        toast.error('Invalid QR code name. Please try again.');
        setDeleteModal({ show: false, qrCodeName: null });
        return;
      }

      let response;
      try {
        response = await unifiedFetch(`${config.api.baseUrl}/qrcodenames/${qrCodeName._id}?theaterId=${theaterId}&permanent=true`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        }, {
          forceRefresh: true, // Don't cache DELETE requests
          cacheTTL: 0
        });
      } catch (fetchError) {
        // Handle network errors and HTTP error responses from unifiedFetch
        console.error('❌ [QRCodeNames] DELETE fetch error:', fetchError);
        const errorMessage = fetchError.message || fetchError.toString();
        const errorStatus = fetchError.status;
        
        // Handle HTTP error responses
        if (errorStatus === 404) {
          // Item not found - might already be deleted, close modal and refresh
          setDeleteModal({ show: false, qrCodeName: null });
          toast.error('QR code name not found. It may have been already deleted.');
          loadQRCodeNameData(true).catch(err => {
            console.warn('⚠️ Failed to reload after delete:', err);
          });
        } else if (errorStatus === 401) {
          toast.error('Session expired. Please login again.');
        } else if (errorStatus) {
          toast.error(errorMessage || `Failed to delete QR code name (Status: ${errorStatus})`);
        } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          toast.error('Network error. Please check your connection and try again.');
        } else {
          toast.error(errorMessage || 'Failed to delete QR code name. Please try again.');
        }
        return;
      }

      // If we get here, the request was successful
      // unifiedFetch throws errors for non-OK responses, so response should be OK
      try {
        const data = await response.json();
      } catch (parseError) {
        // Response might not have JSON body, that's okay for DELETE
      }

      // Close modal immediately on success
      setDeleteModal({ show: false, qrCodeName: null });
      toast.success('QR Code Name deleted successfully!');
      
      // Refresh the list
      setTimeout(() => {
        loadQRCodeNameData(true).catch(err => {
          console.warn('⚠️ Failed to reload after delete:', err);
        });
      }, 100);
    } catch (error) {
      console.error('❌ [QRCodeNames] DELETE exception:', error);
      console.error('❌ [QRCodeNames] Error stack:', error.stack);
      
      // Extract meaningful error message
      let errorMessage = 'Failed to delete QR code name. Please try again.';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.toString && error.toString() !== '[object Object]') {
        errorMessage = error.toString();
      }
      
      toast.error(errorMessage);
    }
  };

  const handleSubmitQRCodeName = async (isEdit = false) => {
    try {
      
      const token = config.helpers.getAuthToken();
      if (!token) {
        toast.error('Authentication required. Please login again.');
        return;
      }

      // 🔄 CLIENT-SIDE VALIDATION: Validate required fields
      if (!formData.qrName || !formData.qrName.trim()) {
        toast.error('QR Code Name is required');
        return;
      }

      if (!formData.seatClass || !formData.seatClass.trim()) {
        toast.error('Seat Class is required');
        return;
      }

        if (!theaterId && !isEdit) {
          toast.error('Theater ID is required for creating QR code names. Please navigate from the theater list.');
          return;
        }
      
      
      const url = isEdit 
        ? `${config.api.baseUrl}/qrcodenames/${selectedQRCodeName._id}` 
        : `${config.api.baseUrl}/qrcodenames`;
      const method = isEdit ? 'PUT' : 'POST';
      
      // CRITICAL: Theater ID is REQUIRED - ensure it's always included
      if (!theaterId) {
        console.error('❌ [QRCodeNames] Theater ID is missing!');
        console.error('   URL params:', { theaterId });
        console.error('   This should not happen - theaterId is required');
        toast.error('Theater ID is required. Please navigate from the theater list.');
        return;
      }

      // Include theaterId in the form data when creating/editing QR code names
      // CRITICAL: Always include theaterId - it's required for theater-scoped validation
      const qrCodeNameData = {
        qrName: formData.qrName.trim(),
        seatClass: formData.seatClass.trim(),
        description: formData.description?.trim() || '',
        isActive: formData.isActive,
        theaterId: theaterId // ALWAYS include theaterId - required for correct theater validation
      };

      

      let response;
      try {
        response = await unifiedFetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(qrCodeNameData)
        }, {
          forceRefresh: true, // Don't cache POST/PUT requests
          cacheTTL: 0
        });
      } catch (fetchError) {
        // Handle network errors, timeouts, and HTTP error responses from unifiedFetch
        console.error('❌ [QRCodeNames] Fetch error:', fetchError);
        console.error('❌ [QRCodeNames] Error status:', fetchError.status);
        console.error('❌ [QRCodeNames] Error message:', fetchError.message);
        
        const errorMessage = fetchError.message || fetchError.toString();
        const errorStatus = fetchError.status;
        
        // Handle HTTP error responses (unifiedFetch throws errors for non-OK responses)
        if (errorStatus) {
          // This is an HTTP error response, use the message from unifiedFetch
          if (errorStatus === 401) {
            toast.error('Session expired. Please login again.');
          } else if (errorStatus === 400) {
            // Bad request - show the specific error message
            toast.error(errorMessage || 'Invalid request. Please check your input and try again.');
          } else if (errorStatus === 404) {
            toast.error('Resource not found. Please refresh the page and try again.');
          } else if (errorStatus === 500) {
            toast.error('Server error. Please try again later.');
          } else {
            toast.error(errorMessage || `Request failed with status ${errorStatus}. Please try again.`);
          }
        } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          // Network error
          toast.error('Network error. Please check your connection and try again.');
        } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
          // Timeout error
          toast.error('Request timed out. Please try again.');
        } else {
          // Other errors - show the error message
          toast.error(errorMessage || 'An error occurred while connecting to the server. Please try again.');
        }
        return;
      }
      

      // Validate response object
      if (!response) {
        console.error('❌ [QRCodeNames] No response received');
        toast.error('No response received from server. Please try again.');
        return;
      }

      // Parse response text once to avoid body already read errors
      let responseText;
      try {
        responseText = await response.text();
      } catch (textError) {
        console.error('❌ [QRCodeNames] Failed to read response text:', textError);
        toast.error('Failed to read server response. Please try again.');
        return;
      }
      
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('❌ [QRCodeNames] Failed to parse response:', parseError);
        console.error('❌ [QRCodeNames] Response text:', responseText);
        result = { message: 'Invalid response from server' };
      }

      // Check if response indicates success
      // unifiedFetch throws errors for non-OK responses, so if we get here, response should be OK
      // Check both response.ok and result.success to be safe
      const isSuccess = (response.ok === true || response.ok === undefined) && 
                        (result.success === true || result.success === undefined);
      
      if (isSuccess) {

        // Close modal first
        if (isEdit) {
          setShowEditModal(false);
        } else {
          setShowCreateModal(false);
        }
        
        // Reset form
        setFormData({
          qrName: '',
          seatClass: 'GENERAL', 
          description: '',
          isActive: true
        });
        setSelectedQRCodeName(null);
        
        // Show success message
        toast.success(isEdit ? 'QR Code Name updated successfully!' : 'QR Code Name created successfully!');
        
        // Refresh data in background
        setTimeout(() => {
          loadQRCodeNameData(true).catch(err => {
            console.warn('⚠️ Failed to reload after save:', err);
          });
        }, 100);
      } else {
        console.error('❌ [QRCodeNames] Error response:', result);
        console.error('❌ [QRCodeNames] Response status:', response.status);
        // Safely log headers if they exist
        if (response.headers && typeof response.headers.entries === 'function') {
          try {
            console.error('❌ [QRCodeNames] Response headers:', Object.fromEntries(response.headers.entries()));
          } catch (headerError) {
            console.error('❌ [QRCodeNames] Response headers (raw):', response.headers);
          }
        } else {
          console.error('❌ [QRCodeNames] Response headers: Not available');
        }

        // Enhanced error handling with better error message extraction
        let errorMessage = 'Failed to save QR Code Name';
        
        if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          // Validation errors from express-validator
          const firstError = result.errors[0];
          errorMessage = firstError.msg || firstError.message || 'Validation failed';
        } else if (result.message) {
          errorMessage = result.message;
        } else if (result.details?.message) {
          errorMessage = result.details.message;
        } else if (result.error) {
          errorMessage = typeof result.error === 'string' ? result.error : result.error.message || 'An error occurred';
        }

        // Specific error message handling
        if (errorMessage.includes('Theater QR names not found')) {
          toast.error('Theater not found. Please refresh the page and try again.');
        } else if (errorMessage.includes('QR name not found')) {
          toast.error('QR code name not found. Please refresh and try again.');
        } else if (errorMessage.includes('already exists') || 
                   errorMessage.includes('Duplicate QR name') ||
                   errorMessage.includes('unique constraint violation')) {
          // ✅ FIX: Show detailed error message with better formatting for toast
          if (errorMessage.includes('Existing entry:') || errorMessage.includes('You attempted to create:')) {
            // Extract key information from multi-line error message
            const existingMatch = errorMessage.match(/QR Name: "([^"]+)"/g);
            const seatClassMatch = errorMessage.match(/Seat Class: "([^"]+)"/g);
            
            if (existingMatch && seatClassMatch && existingMatch.length >= 2) {
              const existingQRName = existingMatch[0].match(/"([^"]+)"/)[1];
              const existingSeatClass = seatClassMatch[0].match(/"([^"]+)"/)[1];
              const attemptingQRName = existingMatch[1] ? existingMatch[1].match(/"([^"]+)"/)[1] : '';
              const attemptingSeatClass = seatClassMatch[1] ? seatClassMatch[1].match(/"([^"]+)"/)[1] : '';
              
              toast.error(
                `Duplicate Entry!\n\n` +
                `Existing: "${existingQRName}" - Seat Class "${existingSeatClass}"\n` +
                `Attempting: "${attemptingQRName}" - Seat Class "${attemptingSeatClass}"\n\n` +
                `💡 Tip: Use the same QR Name with different Seat Classes (A, B, C, etc.)`,
                { duration: 6000 }
              );
            } else {
              // Fallback: show the message with line breaks replaced
              toast.error(errorMessage.replace(/\n/g, ' | '), { duration: 6000 });
            }
          } else {
            toast.error('A QR code name with this name and seat class already exists in this theater. Please use a different name or seat class.');
          }
        } else if (errorMessage.includes('Theater ID is required') || errorMessage.includes('Valid theater ID')) {
          toast.error('Theater ID is required. Please navigate from the theater list.');
        } else if (errorMessage.includes('QR name is required')) {
          toast.error('QR Code Name is required.');
        } else if (errorMessage.includes('Seat class is required')) {
          toast.error('Seat class is required.');
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (error) {
      console.error('❌ [QRCodeNames] Exception:', error);
      console.error('❌ [QRCodeNames] Error stack:', error.stack);
      
      // Extract meaningful error message
      let errorMessage = 'An error occurred while saving the QR Code Name.';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.toString && error.toString() !== '[object Object]') {
        errorMessage = error.toString();
      }
      
      // Provide more specific error messages
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        toast.error('Network error. Please check your connection and try again.');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        toast.error('Request timed out. Please try again.');
      } else if (error.status === 401) {
        toast.error('Session expired. Please login again.');
      } else {
        toast.error(errorMessage + ' Check console for details.');
      }
    }
  };



  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateNewQRName = () => {
    setFormData({
      qrName: '',
      seatClass: '',
      description: '',
      isActive: true
    });
    setShowCreateModal(true);
  };

  const headerButton = (
    <button 
      className="header-btn"
      onClick={handleCreateNewQRName}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </span>
      CREATE NEW QR NAME
    </button>
  );

  return (
    <ErrorBoundary>
      <AdminLayout 
        pageTitle={theaterId ? `QR Code Names - ${theater?.name || 'Theater'}` : "QR Code Name Management"} 
        currentPage="qr-names"
      >
        <div className="qr-code-name-details-page qr-management-page">
        <PageContainer
          hasHeader={false}
          className="qr-code-name-vertical"
        >
          {/* Global Vertical Header Component */}
          <VerticalPageHeader
            title={theaterLoading ? 'Loading Theater...' : (theater?.name || 'Theater Name Not Available')}
            backButtonText="Back to Theater List"
            backButtonPath="/qr-names"
            actionButton={headerButton}
          />
          {/* Stats Section */}
          <div className="qr-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.activeQRNames || 0}</div>
              <div className="stat-label">Active QR Names</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.inactiveQRNames || 0}</div>
              <div className="stat-label">Inactive QR Names</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalQRNames || 0}</div>
              <div className="stat-label">Total QR Names</div>
            </div>
          </div>

          {/* Enhanced Filters Section matching TheaterList */}
          <div className="theater-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search QR names by name, seat class, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="filter-controls">
              <select
                value="all"
                className="status-filter"
                disabled
              >
                <option value="all">All Status</option>
              </select>
              <div className="results-count">
                Showing {sortedQRCodeNames.length} of {totalItems} QR names (Page {currentPage} of {totalPages})
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
                    <th>QR Name</th>
                    <th>Seat Class</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <TableRowSkeleton key={`skeleton-${index}`} />
                    ))
                  ) : sortedQRCodeNames.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="no-data">
                        <div className="empty-state">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
                            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4z"/>
                            <path d="M19 13h-2v2h2v-2zM13 13h2v2h-2v-2zM15 15h2v2h-2v-2zM13 17h2v2h-2v-2zM15 19h2v2h-2v-2zM17 17h2v2h-2v-2zM19 19h-2v2h2v-2z"/>
                          </svg>
                          <p>No QR Code Names found</p>
                          <button 
                            className="btn-primary" 
                            onClick={() => navigate(`/qr-create/${theaterId}`)}
                          >
                            CREATE YOUR FIRST QR CODE
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedQRCodeNames.map((qrCodeName, index) => (
                      <tr key={qrCodeName._id} className="theater-row">
                        <td className="serial-number">{((currentPage - 1) * itemsPerPage) + index + 1}</td>
                        <td className="theater-logo-cell">
                          <div className="qr-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                              <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4z"/>
                              <path d="M19 13h-2v2h2v-2zM13 13h2v2h-2v-2zM15 15h2v2h-2v-2zM13 17h2v2h-2v-2zM15 19h2v2h-2v-2zM17 17h2v2h-2v-2zM19 19h-2v2h2v-2z"/>
                            </svg>
                          </div>
                        </td>
                        <td className="qr-name-cell">
                          <div className="qr-name">{qrCodeName.qrName || 'No Name'}</div>
                        </td>
                        <td className="seat-class-cell">
                          <span className={`seat-class-badge ${qrCodeName.seatClass?.toLowerCase()}`}>
                            {qrCodeName.seatClass || 'GENERAL'}
                          </span>
                        </td>
                        <td className="qr-status">
                          <span className={`status-badge ${qrCodeName.isActive ? 'active-badge' : 'inactive-badge'}`}>
                            {qrCodeName.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="actions">
                          <div className="action-buttons">
                            <button
                              className="action-btn view-btn"
                              onClick={() => viewQRCodeName(qrCodeName)}
                              title="View QR Code Name Details"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                              </svg>
                            </button>
                            <button
                              className="action-btn edit-btn"
                              onClick={() => editQRCodeName(qrCodeName)}
                              title="Edit QR Code Name"
                              disabled={!qrCodeName.isActive}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                              </svg>
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={() => deleteQRCodeName(qrCodeName)}
                              title="Delete QR Code Name"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination - Global Component */}
            {!loading && (
              <Pagination 
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                itemType="QR names"
              />
            )}

          {/* Create QR Code Name Modal */}
          {showCreateModal && (
            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-nav-left"></div>
                  <div className="modal-title-section">
                    <h2>Create New QR Code Name</h2>
                  </div>
                  <div className="modal-nav-right">
                    <button 
                      className="close-btn"
                      onClick={() => setShowCreateModal(false)}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="modal-body">
                  <div className="edit-form">
                    <div className="form-group">
                      <label>QR Code Name <span className="required-field-indicator">*</span></label>
                      <input 
                        type="text" 
                        value={formData.qrName} 
                        onChange={(e) => handleInputChange('qrName', e.target.value)}
                        className="form-control"
                        placeholder="Enter QR code name"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Seat Class <span className="required-field-indicator">*</span></label>
                      <input 
                        type="text"
                        value={formData.seatClass} 
                        onChange={(e) => handleInputChange('seatClass', e.target.value)}
                        className="form-control"
                        placeholder="Enter seat class (e.g., General, VIP, Premium, etc.)"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select 
                        value={formData.isActive} 
                        onChange={(e) => handleInputChange('isActive', e.target.value === 'true')}
                        className="form-control"
                      >
                        <option value={true}>Active</option>
                        <option value={false}>Inactive</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <textarea 
                        value={formData.description} 
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        className="form-control"
                        rows="3"
                      placeholder="Enter description (optional)"
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
                  onClick={() => handleSubmitQRCodeName(false)}
                >
                  Create QR Code Name
                </button>
              </div>
            </div>
          </div>
        )}          {/* Edit QR Code Name Modal */}
          {showEditModal && (
            <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-nav-left"></div>
                  <div className="modal-title-section">
                    <h2>Edit QR Code Name</h2>
                  </div>
                  <div className="modal-nav-right">
                    <button 
                      className="close-btn"
                      onClick={() => setShowEditModal(false)}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="modal-body">
                  <div className="edit-form">
                    <div className="form-group">
                      <label>QR Code Name <span className="required-field-indicator">*</span></label>
                      <input 
                        type="text" 
                        value={formData.qrName} 
                        onChange={(e) => handleInputChange('qrName', e.target.value)}
                        className="form-control"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Seat Class <span className="required-field-indicator">*</span></label>
                      <input 
                        type="text"
                        value={formData.seatClass} 
                        onChange={(e) => handleInputChange('seatClass', e.target.value)}
                        className="form-control"
                        placeholder="Enter seat class (e.g., General, VIP, Premium, etc.)"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select 
                        value={formData.isActive} 
                        onChange={(e) => handleInputChange('isActive', e.target.value === 'true')}
                        className="form-control"
                      >
                        <option value={true}>Active</option>
                        <option value={false}>Inactive</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <textarea 
                        value={formData.description} 
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        className="form-control"
                      rows="3"
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
                  onClick={() => handleSubmitQRCodeName(true)}
                >
                  Update QR Code Name
                </button>
              </div>
            </div>
          </div>
        )}          {/* View QR Code Name Modal */}
          {showViewModal && (
            <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-nav-left"></div>
                  <div className="modal-title-section">
                    <h2>QR Code Name Details</h2>
                  </div>
                  <div className="modal-nav-right">
                    <button 
                      className="close-btn"
                      onClick={() => setShowViewModal(false)}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="modal-body">
                  <div className="edit-form">
                    <div className="form-group">
                      <label>QR Code Name</label>
                      <input 
                        type="text" 
                        value={selectedQRCodeName?.qrName || ''} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Seat Class</label>
                      <input 
                        type="text" 
                        value={selectedQRCodeName?.seatClass || ''} 
                        className="form-control"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select 
                        value={selectedQRCodeName?.isActive ? 'Active' : 'Inactive'} 
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
                        value={selectedQRCodeName?.description || 'No description provided'} 
                        className="form-control"
                        rows="3"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label>Created Date</label>
                      <input 
                        type="text" 
                        value={selectedQRCodeName?.createdAt ? new Date(selectedQRCodeName.createdAt).toLocaleDateString() : 'N/A'} 
                        className="form-control"
                      readOnly
                    />
                  </div>
                </div>
              </div>
              
              {/* Footer with Close and Edit Buttons */}
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
                    editQRCodeName(selectedQRCodeName);
                  }}
                >
                  Edit QR Code Name
                </button>
              </div>
            </div>
          </div>
        )}        </PageContainer>
        </div>
      </AdminLayout>

      {/* Delete Confirmation Modal - Matching TheaterList Design */}
      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="delete-modal">
            <div className="modal-header">
              <h3>Confirm Deletion</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete the QR code name <strong>"{deleteModal.qrCodeName?.qrName}"</strong> with seat class <strong>"{deleteModal.qrCodeName?.seatClass}"</strong>?</p>
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button 
                onClick={() => setDeleteModal({ show: false, qrCodeName: null })}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteConfirm}
                className="confirm-delete-btn"
              >
                Delete QR Code Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom CSS for modal width - matches TheaterList */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .modal-content {
            max-width: 900px !important;
            width: 85% !important;
          }

          @media (max-width: 768px) {
            .modal-content {
              width: 95% !important;
              max-width: none !important;
            }
          }
        `
      }} />
    </ErrorBoundary>
  );
};

export default QRCodeNameManagement;
