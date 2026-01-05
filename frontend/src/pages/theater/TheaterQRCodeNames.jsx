import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import config from '@config';
import { useParams, useNavigate } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import Pagination from '@components/Pagination';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { useAuth } from '@contexts/AuthContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/pages/theater/TheaterQRCodeNames.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { clearCachePattern } from '@utils/cacheUtils';



// Table Row Skeleton Component
const TableRowSkeleton = React.memo(() => (
  <tr className="skeleton-row">
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text wide"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
  </tr>
));

const TheaterQRCodeNames = () => {
  const navigate = useNavigate();
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showSuccess, showError } = useModal();
  
  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterQRCodeNames');
  
  // Data state
  const [qrCodeNames, setQRCodeNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    activeQRNames: 0,
    inactiveQRNames: 0,
    totalQRNames: 0
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Filter state with debounced search
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  
  // Performance refs
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const deletedIdsRef = useRef(new Set()); // Track deleted IDs to filter them out

  // ✅ FIX: Wrapper function to always filter deleted items when setting QR code names
  const setQRCodeNamesFiltered = useCallback((newData) => {
    if (!Array.isArray(newData)) {
      setQRCodeNames(newData);
      return;
    }
    
    const filtered = newData.filter(qr => {
      const isDeleted = deletedIdsRef.current.has(qr._id);
      if (isDeleted && qr._id) {
      }
      return !isDeleted;
    });
    
    if (filtered.length !== newData.length) {
    }
    
    setQRCodeNames(filtered);
  }, []);

  // Ensure mounted ref is set
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Validate theater access
  useEffect(() => {
    if (userType === 'theater_user' && userTheaterId && theaterId !== userTheaterId) {

      return;
    }
  }, [theaterId, userTheaterId, userType]);

  // Sort QR Code Names by ID in ascending order
  // ✅ FIX: Also filter out deleted items and apply status filter
  const sortedQRCodeNames = useMemo(() => {
    let filtered = qrCodeNames.filter(qr => !deletedIdsRef.current.has(qr._id));
    
    // Apply status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(qr => qr.isActive === true);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(qr => qr.isActive === false);
    }
    
    return filtered.sort((a, b) => {
      const idA = a._id || '';
      const idB = b._id || '';
      return idA.localeCompare(idB);
    });
  }, [qrCodeNames, statusFilter]);

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

  // Load QR Code Name data
  const loadQRCodeNameData = useCallback(async (forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);

      // ✅ FIX: Remove caching - always fetch fresh data
      const params = new URLSearchParams({
        theaterId: theaterId,
        page: currentPage,
        limit: itemsPerPage,
        search: debouncedSearchTerm,
        _t: Date.now().toString() // Always add timestamp to bust cache
      });

      const baseUrl = `${config.api.baseUrl}/qrcodenames?${params.toString()}`;
      
      // ✅ FIXED: Standardized to use 'authToken' as primary key
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // ✅ FIX: Always use no-cache headers (no caching at all)
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      // ✅ FIX: Use regular fetch instead of unifiedFetch to avoid caching
      const response = await fetch(baseUrl, {
        signal: abortControllerRef.current.signal,
        method: 'GET',
        headers: headers
      });
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Failed to fetch QR code name data';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
          console.error('❌ [QRCodeNames] API Error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
        } catch (parseError) {
          console.error('❌ [QRCodeNames] API Error (non-JSON):', {
            status: response.status,
            statusText: response.statusText
          });
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (!isMountedRef.current) return;
      
      // ✅ DEBUG: Log API response structure
      console.log('🔍 [QRCodeNames] API Response:', {
        success: data?.success,
        hasData: !!data?.data,
        hasQrCodeNames: !!data?.data?.qrCodeNames,
        qrCodeNamesLength: data?.data?.qrCodeNames?.length || 0,
        dataKeys: data?.data ? Object.keys(data.data) : [],
        fullResponse: data
      });
      
      if (data.success) {
        // ✅ FIX: Handle different response structures
        // Try data.data.qrCodeNames first, then data.qrCodeNames, then data.data
        const newData = data.data?.qrCodeNames || data.qrCodeNames || (Array.isArray(data.data) ? data.data : []);
        
        // ✅ DEBUG: Log what we're setting
        console.log('🔍 [QRCodeNames] Setting QR Names:', {
          count: newData.length,
          names: newData.slice(0, 5).map(n => ({
            _id: n._id,
            qrName: n.qrName,
            seatClass: n.seatClass,
            isActive: n.isActive
          })),
          totalCount: newData.length
        });
        
        // ✅ FIX: Filter out any deleted items that might have been returned from cache
        const filteredData = newData.filter(qr => {
          const isDeleted = deletedIdsRef.current.has(qr._id);
          if (isDeleted) {
          }
          return !isDeleted;
        });
        
        if (filteredData.length !== newData.length) {
        }
        
        // ✅ FIX: Use filtered data for ALL calculations (not the original newData)
        setQRCodeNamesFiltered(filteredData);
        
        // ✅ FIX: Handle pagination - calculate based on FILTERED data
        const paginationData = data.data?.pagination || {};
        const totalCount = filteredData.length; // Use filtered count, not original
        const itemsPerPageValue = itemsPerPage || 10;
        const calculatedTotalPages = Math.max(1, Math.ceil(totalCount / itemsPerPageValue));
        
        setTotalPages(calculatedTotalPages);
        setTotalItems(totalCount);
        
        // ✅ FIX: Calculate summary statistics from FILTERED data
        const activeQRNames = filteredData.filter(qr => qr.isActive).length;
        const inactiveQRNames = filteredData.filter(qr => !qr.isActive).length;
        
        setSummary({
          activeQRNames,
          inactiveQRNames,
          totalQRNames: filteredData.length // Use filtered length
        });
      } else {
        // API returned success: false
        console.warn('⚠️ [QRCodeNames] API returned success: false:', {
          message: data?.message,
          error: data?.error,
          data: data
        });
        setQRCodeNames([]);
        setTotalPages(0);
        setTotalItems(0);
        setSummary({
          activeQRNames: 0,
          inactiveQRNames: 0,
          totalQRNames: 0
        });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      
      // ✅ FIX: Log all errors for debugging
      console.error('❌ [QRCodeNames] Error loading QR code names:', {
        error: error.message,
        stack: error.stack,
        theaterId: theaterId
      });
      
      // ✅ FIX: Show error to user
      if (isMountedRef.current) {
        showError(`Failed to load QR code names: ${error.message}`);
        setQRCodeNames([]);
        setTotalPages(0);
        setTotalItems(0);
        setSummary({
          activeQRNames: 0,
          inactiveQRNames: 0,
          totalQRNames: 0
        });
      }
  } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, debouncedSearchTerm, itemsPerPage, theaterId]);

  // Initial load
  useEffect(() => {
    loadQRCodeNameData(true);
  }, [loadQRCodeNameData]);

  // Cleanup effect
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

  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedQRCodeName, setSelectedQRCodeName] = useState(null);
  const [formData, setFormData] = useState({
    qrName: '',
    seatClass: '',
    description: '',
    isActive: true
  });

  // Pagination handlers
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
  }, []);

  const handleItemsPerPageChange = useCallback((e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  }, []);

  // Handle search input
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  // View QR Code Name
  const viewQRCodeName = (qrCodeName) => {
    setSelectedQRCodeName(qrCodeName);
    setShowViewModal(true);
  };

  // Edit QR Code Name
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

  // Delete QR Code Name
  const deleteQRCodeName = (qrCodeName) => {
    setSelectedQRCodeName(qrCodeName);
    setShowDeleteModal(true);
  };

  // Handle delete
  const handleDeleteQRCodeName = async () => {
    // ✅ FIX: Store item data BEFORE any async operations (needed for optimistic update)
    const deletedItem = selectedQRCodeName;
    const deletedId = deletedItem?._id;
    const wasActive = deletedItem?.isActive;

    // ✅ FIX: Close modal IMMEDIATELY (FIRST THING - before API call)
    setShowDeleteModal(false);
    setSelectedQRCodeName(null);

        // ✅ FIX: Optimistically remove item from list immediately (before API call)
        if (deletedId) {
          // Track deleted ID
          deletedIdsRef.current.add(deletedId);
          
          // Remove from list immediately
          setQRCodeNames(prev => {
            const filtered = prev.filter(qr => qr._id !== deletedId && !deletedIdsRef.current.has(qr._id));
            return filtered;
          });
      
      // Update summary stats immediately
      setSummary(prev => ({
        activeQRNames: wasActive ? Math.max(0, prev.activeQRNames - 1) : prev.activeQRNames,
        inactiveQRNames: !wasActive ? Math.max(0, prev.inactiveQRNames - 1) : prev.inactiveQRNames,
        totalQRNames: Math.max(0, prev.totalQRNames - 1)
      }));
      
      // Update total items for pagination
      setTotalItems(prev => {
        const newTotal = Math.max(0, prev - 1);
        // Recalculate total pages based on new total
        const itemsPerPageValue = itemsPerPage || 10;
        setTotalPages(Math.max(1, Math.ceil(newTotal / itemsPerPageValue)));
        return newTotal;
      });
    }

    try {
      // ✅ FIXED: Standardized to use 'authToken' as primary key
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // ✅ FIX: Use regular fetch instead of unifiedFetch to avoid any caching issues
      const deleteUrl = `${config.api.baseUrl}/qrcodenames/${deletedId}?theaterId=${theaterId}&permanent=true&_t=${Date.now()}`;
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      
      // ✅ FIX: Check if request was successful (handle both response.ok and status codes)
      const isSuccess = response.ok || (response.status >= 200 && response.status < 300);

      if (isSuccess) {
        // Try to parse response, but don't fail if there's no body
        let data = {};
        try {
          const responseText = await response.text();
          if (responseText) {
            data = JSON.parse(responseText);
          }
        } catch (parseError) {
          // DELETE requests might not have a response body, that's okay
        }
        
        // ✅ FIX: Show success message
        showSuccess('QR Code Name deleted successfully!');
        
        // ✅ FIX: Clear cache for QR code names to prevent stale data
        clearCachePattern('qrcodenames');
        clearCachePattern(`qrcodenames_${theaterId}`);
        
        // ✅ FIX: DO NOT reload after delete - optimistic update is sufficient
        // Reloading immediately can restore the deleted item from cache or if server hasn't processed it yet
        // The item is already removed from UI via optimistic update
        // User can manually refresh if they want to see the latest server state
        // This ensures the deleted item stays removed from the UI
      } else {
        // ✅ FIX: Rollback optimistic update on error
        if (deletedId) {
          // Remove from deleted IDs tracking
          deletedIdsRef.current.delete(deletedId);
          
          // Restore the item if delete failed
          setQRCodeNames(prev => {
            // Check if item is already in the list
            const exists = prev.some(qr => qr._id === deletedId);
            if (!exists && deletedItem) {
              return [...prev, deletedItem].sort((a, b) => {
                // Try to maintain original order
                return 0;
              });
            }
            return prev;
          });
          
          // Restore summary stats
          setSummary(prev => ({
            activeQRNames: wasActive ? prev.activeQRNames + 1 : prev.activeQRNames,
            inactiveQRNames: !wasActive ? prev.inactiveQRNames + 1 : prev.inactiveQRNames,
            totalQRNames: prev.totalQRNames + 1
          }));
          
          // Restore total items
          setTotalItems(prev => prev + 1);
        }

        // Try to get error message
        let errorMessage = 'Failed to delete QR Code Name';
        try {
          const responseText = await response.text();
          if (responseText) {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          }
        } catch (parseError) {
          // Use status text if available
          errorMessage = response.statusText || errorMessage;
        }

        console.error('❌ [QRCodeNames] Delete error:', {
          status: response.status,
          statusText: response.statusText,
          message: errorMessage
        });

        // Enhanced error handling
        if (errorMessage.includes('Theater QR names not found')) {
          showError('Theater not found. Please refresh the page and try again.');
        } else if (errorMessage.includes('QR name not found')) {
          showError('QR code name not found. It may have been already deleted.');
          // Reload to show current state
          loadQRCodeNameData(true).catch(err => {
            console.warn('⚠️ [QRCodeNames] Failed to reload after delete error:', err);
          });
        } else {
          showError(errorMessage);
        }
      }
    } catch (error) {
      console.error('❌ [QRCodeNames] Delete exception:', error);
      
      // ✅ FIX: Rollback optimistic update on exception
      if (deletedId) {
        // Remove from deleted IDs tracking
        deletedIdsRef.current.delete(deletedId);
        
        // Restore the item if delete failed
        setQRCodeNames(prev => {
          const exists = prev.some(qr => qr._id === deletedId);
          if (!exists && deletedItem) {
            return [...prev, deletedItem];
          }
          return prev;
        });
        
        // Restore summary stats
        setSummary(prev => ({
          activeQRNames: wasActive ? prev.activeQRNames + 1 : prev.activeQRNames,
          inactiveQRNames: !wasActive ? prev.inactiveQRNames + 1 : prev.inactiveQRNames,
          totalQRNames: prev.totalQRNames + 1
        }));
        
        // Restore total items
        setTotalItems(prev => prev + 1);
      }
      
      showError('Failed to delete QR Code Name. Please try again.');
    }
  };

  // Handle save (create/update)
  const handleSaveQRCodeName = async (isEdit) => {
    try {
      // ✅ FIXED: Standardized to use 'authToken' as primary key
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const url = isEdit 
        ? `${config.api.baseUrl}/qrcodenames/${selectedQRCodeName._id}`
        : `${config.api.baseUrl}/qrcodenames`;
      
      const method = isEdit ? 'PUT' : 'POST';
      
      const payload = {
        ...formData,
        theaterId: theaterId
      };
      
      
      const response = await unifiedFetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        },
        body: JSON.stringify(payload)
      }, {
        forceRefresh: true, // Don't cache POST/PUT requests
        cacheTTL: 0
      });
      
      
      // Parse response once
      let result;
      try {
        const responseText = await response.text();
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('❌ [QRCodeNames] Failed to parse response:', parseError);
        throw new Error('Invalid response from server');
      }
      
      // ✅ FIX: Check if request was successful (handle both response.ok and result.success)
      const isSuccess = response.ok || (result && result.success);
      
      if (isSuccess) {
        // ✅ FIX: Close modal IMMEDIATELY (FIRST THING - before anything else)
        if (isEdit) {
          setShowEditModal(false);
        } else {
          setShowCreateModal(false);
        }
        
        // ✅ FIX: Reset form immediately
        setFormData({
          qrName: '',
          seatClass: 'GENERAL',
          description: '',
          isActive: true
        });
        setSelectedQRCodeName(null);
        
        // ✅ FIX: Show success message
        showSuccess(isEdit ? 'QR Code Name updated successfully!' : 'QR Code Name created successfully!');
        
        // ✅ FIX: Optimistically update UI based on response (wrap in try-catch to prevent errors from blocking)
        try {
          if (result.success && result.data) {
          if (result.data.qrCodeNames && Array.isArray(result.data.qrCodeNames)) {
            // CREATE: Response contains full list of QR code names
            const newQRCodeNames = result.data.qrCodeNames;
            
            // ✅ FIX: Filter out deleted items before setting
            const filteredQRCodeNames = newQRCodeNames.filter(qr => !deletedIdsRef.current.has(qr._id));
            if (filteredQRCodeNames.length !== newQRCodeNames.length) {
            }
            
            // Update the entire list immediately with the FILTERED response data
            setQRCodeNamesFiltered(filteredQRCodeNames);
            
            // ✅ FIX: Update summary from FILTERED data
            if (result.data.metadata) {
              // Recalculate from filtered data to ensure accuracy
              const activeCount = filteredQRCodeNames.filter(qr => qr.isActive).length;
              const inactiveCount = filteredQRCodeNames.filter(qr => !qr.isActive).length;
              setSummary({
                activeQRNames: activeCount,
                inactiveQRNames: inactiveCount,
                totalQRNames: filteredQRCodeNames.length
              });
            } else {
              // Calculate from the FILTERED data
              const activeQRNames = filteredQRCodeNames.filter(qr => qr.isActive).length;
              const inactiveQRNames = filteredQRCodeNames.filter(qr => !qr.isActive).length;
              setSummary({
                activeQRNames,
                inactiveQRNames,
                totalQRNames: filteredQRCodeNames.length
              });
            }
            
            // ✅ FIX: Update total items for pagination based on FILTERED data
            setTotalItems(filteredQRCodeNames.length);
            
            // Calculate total pages
            const itemsPerPageValue = itemsPerPage || 10;
            const calculatedTotalPages = Math.ceil(filteredQRCodeNames.length / itemsPerPageValue);
            setTotalPages(calculatedTotalPages);
          } else if (result.data._id || result.data.qrName) {
            // UPDATE: Response contains single updated QR name
            const updatedQRName = result.data;
            
            // Update the specific item in the list and summary in one go
            setQRCodeNames(prev => {
              // ✅ FIX: First filter out deleted items
              const filtered = prev.filter(qr => !deletedIdsRef.current.has(qr._id));
              
              // Find the old item to compare before updating
              const oldItem = filtered.find(qr => qr._id === updatedQRName._id);
              
              // Update summary if active status changed
              if (oldItem && oldItem.isActive !== updatedQRName.isActive) {
                setSummary(summaryPrev => ({
                  activeQRNames: updatedQRName.isActive ? summaryPrev.activeQRNames + 1 : summaryPrev.activeQRNames - 1,
                  inactiveQRNames: !updatedQRName.isActive ? summaryPrev.inactiveQRNames + 1 : summaryPrev.inactiveQRNames - 1,
                  totalQRNames: summaryPrev.totalQRNames
                }));
              }
              
              // ✅ FIX: Return updated list (already filtered)
              return filtered.map(qr => 
                qr._id === updatedQRName._id ? updatedQRName : qr
              );
            });
          }
          }
        } catch (optimisticError) {
          // ✅ FIX: Don't let optimistic update errors prevent modal from closing
          console.warn('⚠️ [QRCodeNames] Error in optimistic update (non-critical):', optimisticError);
        }
        
        // ✅ FIX: Reload data IMMEDIATELY (no setTimeout delay)
        // This ensures the table is updated with the latest data from server
        loadQRCodeNameData(true).catch(loadError => {
          console.warn('⚠️ [QRCodeNames] Failed to reload data after save:', loadError);
        });
      } else {
        console.error('❌ [QRCodeNames] Error response:', result);
        
        // Show error message - check both message and details.message
        const errorMessage = result.message || result.details?.message || result.error || 'Failed to save QR Code Name';
        
        if (errorMessage.includes('already exists') || 
            errorMessage.includes('Duplicate QR name') ||
            errorMessage.includes('unique constraint violation')) {
          showError('A QR code name with this name and seat class already exists in this theater. Please use a different name or seat class.');
        } else {
          showError(errorMessage);
        }
      }
    } catch (error) {
      console.error('❌ [QRCodeNames] Exception during save:', error);
      console.error('❌ [QRCodeNames] Error stack:', error.stack);
      showError(`An error occurred while saving the QR Code Name: ${error.message}`);
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
      <TheaterLayout pageTitle="QR Code Names" currentPage="qr-code-names">
        <PageContainer
          title="QR Code Names"
          headerButton={headerButton}
        >
        
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

        {/* Enhanced Filters Section */}
        <div className="theater-filters">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search QR code names..."
              value={searchTerm}
              onChange={handleSearch}
              className="search-input"
            />
          </div>
          <div className="filter-controls">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="status-filter"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="results-count">
              Showing {sortedQRCodeNames.length} of {totalItems} QR names (Page {currentPage} of {totalPages || 1})
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
                <th className="sno-col">S.No</th>
                <th className="name-col">QR Name</th>
                <th className="name-col">Seat Class</th>
                <th className="status-col">Status</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <TableRowSkeleton key={`skeleton-${index}`} />
                ))
              ) : sortedQRCodeNames.length === 0 ? (
                <tr>
                  <td colSpan="5" className="no-data">
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="empty-state-icon">
                        <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2z"/>
                      </svg>
                      <p>No QR code names found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedQRCodeNames.map((qrCodeName, index) => (
                  <tr key={qrCodeName._id} className="theater-row">
                    <td className="sno-cell">
                      <div className="sno-number">{((currentPage - 1) * itemsPerPage) + index + 1}</div>
                    </td>
                    <td className="name-cell">
                      <div className="theater-name-container">
                        <div className="theater-name">{qrCodeName.qrName || 'N/A'}</div>
                      </div>
                    </td>
                    <td className="seat-class-cell">
                      <span className={`seat-class-badge ${(qrCodeName.seatClass || 'GENERAL').toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                        {qrCodeName.seatClass || 'GENERAL'}
                      </span>
                    </td>
                    <td className="status-cell">
                      <span className={`status-badge ${qrCodeName.isActive ? 'active' : 'inactive'}`}>
                        {qrCodeName.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <ActionButtons>
                        <ActionButton 
                          type="view"
                          onClick={() => viewQRCodeName(qrCodeName)}
                          title="View QR Code Name Details"
                        />
                        <ActionButton 
                          type="edit"
                          onClick={() => editQRCodeName(qrCodeName)}
                          title="Edit QR Code Name"
                        />
                        <ActionButton 
                          type="delete"
                          onClick={() => deleteQRCodeName(qrCodeName)}
                          title="Delete QR Code Name"
                        />
                      </ActionButtons>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New QR Code Name</h2>
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
                    <label>QR Code Name</label>
                    <input 
                      type="text" 
                      value={formData.qrName} 
                      onChange={(e) => handleInputChange('qrName', e.target.value)}
                      className="form-control"
                      placeholder="Enter QR code name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Seat Class</label>
                    <input 
                      type="text"
                      value={formData.seatClass} 
                      onChange={(e) => handleInputChange('seatClass', e.target.value)}
                      className="form-control"
                      placeholder="Enter seat class (e.g., General, VIP, Premium)"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={formData.description} 
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="form-control"
                      placeholder="Enter description"
                      rows="3"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={formData.isActive} 
                      onChange={(e) => handleInputChange('isActive', e.target.value === 'true')}
                      className="form-control"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
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
                  onClick={() => handleSaveQRCodeName(false)}
                >
                  Create QR Name
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
                <h2>Edit QR Code Name</h2>
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
                    <label>QR Code Name</label>
                    <input 
                      type="text" 
                      value={formData.qrName} 
                      onChange={(e) => handleInputChange('qrName', e.target.value)}
                      className="form-control"
                      placeholder="Enter QR code name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Seat Class</label>
                    <input 
                      type="text"
                      value={formData.seatClass} 
                      onChange={(e) => handleInputChange('seatClass', e.target.value)}
                      className="form-control"
                      placeholder="Enter seat class"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={formData.description} 
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="form-control"
                      placeholder="Enter description"
                      rows="3"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={formData.isActive} 
                      onChange={(e) => handleInputChange('isActive', e.target.value === 'true')}
                      className="form-control"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
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
                  onClick={() => handleSaveQRCodeName(true)}
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
                <h2>QR Code Name Details</h2>
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
                      value={selectedQRCodeName?.seatClass || 'GENERAL'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={selectedQRCodeName?.description || 'No description'} 
                      className="form-control"
                      readOnly
                      rows="3"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <input 
                      type="text" 
                      value={selectedQRCodeName?.isActive ? 'Active' : 'Inactive'} 
                      className="form-control"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Created At</label>
                    <input 
                      type="text" 
                      value={selectedQRCodeName?.createdAt ? new Date(selectedQRCodeName.createdAt).toLocaleString() : ''} 
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
                <p>Are you sure you want to delete QR code name <strong>{selectedQRCodeName?.qrName}</strong>?</p>
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
                  onClick={handleDeleteQRCodeName}
                  className="confirm-delete-btn"
                >
                  Delete QR Name
                </button>
              </div>
            </div>
          </div>
        )}

        </PageContainer>
      </TheaterLayout>

      {/* Custom CSS for modal width */}
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

export default TheaterQRCodeNames;
