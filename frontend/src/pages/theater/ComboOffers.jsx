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
import { useModal } from '@contexts/ModalContext';
import { useToast } from '@contexts/ToastContext';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getCachedData, setCachedData, clearCachePattern } from '@utils/cacheUtils';
import { unifiedFetch } from '@utils/unifiedFetch';
import config from '@config';
import '@styles/TheaterGlobalModals.css';
import '@styles/QRManagementPage.css';
import '@styles/TheaterList.css';
import '@styles/pages/theater/TheaterOffers.css';

const ComboOffers = () => {
  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();
  const { showError } = useModal();
  const toast = useToast();

  usePerformanceMonitoring('ComboOffers');

  // Data state
  const [comboOffers, setComboOffers] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
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
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedComboOffer, setSelectedComboOffer] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    products: [],
    isActive: true,
    image: null,
    removeImage: false,
    offerPrice: '',
    gstType: 'Inclusive',
    gstTaxRate: 0
  });

  // Image upload states
  const [imageFile, setImageFile] = useState(null);
  const [imageError, setImageError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadComboOffersDataRef = useRef(null);
  const formDataRef = useRef(formData);
  const searchTimeoutRef = useRef(null);

  // Keep formDataRef in sync with formData state
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load active products for combo creation
  const loadActiveProducts = useCallback(async () => {
    if (!theaterId) return;

    // Prevent multiple simultaneous requests
    if (loadingProducts) return;

    try {
      setLoadingProducts(true);
      const response = await unifiedFetch(
        `${config.api.baseUrl}/combo-offers/${theaterId}/active-products`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        },
        {
          cacheKey: `active_products_${theaterId}`,
          cacheTTL: 300000 // 5 minutes
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to load active products:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        setActiveProducts([]);
        return;
      }

      const data = await response.json();

      // Handle different response structures
      let products = [];
      if (data.success && data.data?.products) {
        products = Array.isArray(data.data.products) ? data.data.products : [];
      } else if (data.products && Array.isArray(data.products)) {
        // Fallback: direct products array
        products = data.products;
      } else if (data.data && Array.isArray(data.data)) {
        // Fallback: data is directly an array
        products = data.data;
      }


      // Debug: Log image URLs for first few products
      if (products.length > 0) {
        console.log('📸 [ComboOffers] Product images:', products.slice(0, 3).map(p => ({
          name: p.name,
          imageUrl: p.imageUrl || 'NO IMAGE URL',
          hasImage: !!(p.imageUrl && p.imageUrl.trim())
        })));
      }

      setActiveProducts(products);
    } catch (error) {
      console.error('Error loading active products:', error);
      setActiveProducts([]);
      // Don't block modal opening on error
    } finally {
      setLoadingProducts(false);
    }
  }, [theaterId]);

  // Load combo offers
  const loadComboOffersData = useCallback(async (page = 1, limit = 10, forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) return;

    const cacheKey = `comboOffers_${theaterId}_p${page}_l${limit}_s${searchTerm || ''}`;

    if (!forceRefresh) {
      const cached = getCachedData(cacheKey, 120000);
      if (cached && isMountedRef.current) {
        setComboOffers(cached.comboOffers);
        setTotalItems(cached.totalItems);
        setTotalPages(cached.totalPages);
        setCurrentPage(page);
        setSummary(cached.summary);
        setLoading(false);
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey, 120000);
        if (!cached) setLoading(true);
      }

      const params = new URLSearchParams({
        page: page,
        limit: limit
      });

      if (searchTerm) {
        params.append('q', searchTerm);
      }

      const response = await unifiedFetch(
        `${config.api.baseUrl}/combo-offers/${theaterId}?${params.toString()}`,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          signal: abortControllerRef.current.signal
        },
        {
          cacheKey: forceRefresh ? null : cacheKey,
          cacheTTL: 120000
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load combo offers');
      }

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (data.success) {
        const offers = data.data?.comboOffers || [];
        const pagination = data.data?.pagination || {};
        const statistics = data.data?.statistics || {};

        // Debug logging
        if (import.meta.env.MODE === 'development') {
          console.log('📊 [ComboOffers] Data loaded:', {
            offersCount: offers.length,
            totalItems: pagination.totalItems,
            statistics: statistics,
            hasData: !!data.data,
            fullData: data
          });
        }

        setComboOffers(offers);
        setTotalItems(pagination.totalItems || 0);
        setTotalPages(pagination.totalPages || 0);
        setCurrentPage(page);

        // Calculate summary from statistics if available, otherwise calculate from offers
        let newSummary;
        if (statistics && (statistics.total !== undefined || statistics.active !== undefined || statistics.inactive !== undefined)) {
          // Use statistics from server (calculated from ALL offers, not just paginated)
          newSummary = {
            activeOffers: Number(statistics.active) || 0,
            inactiveOffers: Number(statistics.inactive) || 0,
            totalOffers: Number(statistics.total) || 0
          };
        } else {
          // Fallback: Calculate from paginated offers (less accurate but better than 0)
          const activeCount = offers.filter(o => o && o.isActive !== false).length;
          const inactiveCount = offers.filter(o => o && o.isActive === false).length;
          newSummary = {
            activeOffers: activeCount,
            inactiveOffers: inactiveCount,
            totalOffers: offers.length
          };
        }

        // Debug: Log summary being set
        if (import.meta.env.MODE === 'development') {
        }

        setSummary(newSummary);

        setCachedData(cacheKey, {
          comboOffers: offers,
          totalItems: pagination.totalItems || 0,
          totalPages: pagination.totalPages || 0,
          summary: newSummary
        });
      } else {
        // Handle case where success is false
        console.warn('⚠️ [ComboOffers] API returned success: false', data);
        setComboOffers([]);
        setTotalItems(0);
        setTotalPages(0);
        setSummary({ activeOffers: 0, inactiveOffers: 0, totalOffers: 0 });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        console.error('Error loading combo offers:', error);
        setComboOffers([]);
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
  }, [theaterId, searchTerm]);

  useEffect(() => {
    loadComboOffersDataRef.current = loadComboOffersData;
  }, [loadComboOffersData]);

  // Keep formDataRef in sync with formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Initial load
  useEffect(() => {
    if (theaterId) {
      loadComboOffersData(1, itemsPerPage, false);
      loadActiveProducts();
    }
  }, [theaterId]); // Remove dependencies to avoid infinite loops - loadComboOffersData and loadActiveProducts are stable

  // Search handler with proper debounce cleanup
  const handleSearch = useCallback((e) => {
    const value = e.target.value;
    setSearchTerm(value);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        loadComboOffersData(1, itemsPerPage, true);
      }
    }, 500);
  }, [itemsPerPage, loadComboOffersData]);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Pagination handlers
  const handleItemsPerPageChange = useCallback((e) => {
    const newLimit = parseInt(e.target.value);
    setItemsPerPage(newLimit);
    loadComboOffersData(1, newLimit);
  }, [loadComboOffersData]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadComboOffersData(newPage, itemsPerPage);
    }
  }, [totalPages, itemsPerPage, loadComboOffersData]);

  // CRUD Operations
  const viewComboOffer = (offer) => {
    setSelectedComboOffer(offer);
    setShowViewModal(true);
  };

  const editComboOffer = (offer) => {
    setSelectedComboOffer(offer);
    // Ensure products have proper structure with productId as string
    // Note: productQuantity will be populated from activeProducts after they load
    const formattedProducts = (offer.products || []).map(p => ({
      productId: p.productId?.toString() || p.productId,
      productName: p.productName || '',
      actualPrice: p.actualPrice || 0,
      currentPrice: p.currentPrice || 0,
      quantity: p.quantity || 1,
      productQuantity: p.productQuantity || ''
    }));
    setFormData({
      name: offer.name || '',
      description: offer.description || '',
      products: formattedProducts,
      isActive: offer.isActive !== undefined ? offer.isActive : true,
      image: offer.imageUrl || null,
      removeImage: false,
      offerPrice: offer.offerPrice || offer.comboOfferPrice || '',
      gstType: offer.gstType || 'Inclusive',
      gstTaxRate: offer.gstTaxRate || 0
    });
    setImageFile(null);
    setImageError('');
    // Load active products when opening edit modal
    if (theaterId && !loadingProducts) {
      loadActiveProducts().catch(err => {
        console.error('Error loading products:', err);
      });
    }
    setShowEditModal(true);
  };

  const deleteComboOffer = (offer) => {
    setSelectedComboOffer(offer);
    setShowDeleteModal(true);
  };

  // Toggle product selection (checkbox)
  const handleProductToggle = useCallback((product) => {
    setFormData(prev => {
      const productIdStr = product._id?.toString();
      const existingIndex = prev.products.findIndex(p => {
        const pIdStr = p.productId?.toString();
        return pIdStr === productIdStr;
      });

      if (existingIndex >= 0) {
        // Remove product if already selected
        const newProducts = prev.products.filter((_, i) => i !== existingIndex);
        return {
          ...prev,
          products: newProducts
        };
      } else {
        // Add product if not selected
        const actualPrice = parseFloat(product.pricing?.basePrice || product.pricing?.sellingPrice || 0);
        const currentPrice = parseFloat(product.pricing?.sellingPrice || product.pricing?.basePrice || 0);
        const newProduct = {
          productId: productIdStr,
          productName: product.name || 'Unknown Product',
          actualPrice: actualPrice,
          currentPrice: currentPrice,
          quantity: 1,
          productQuantity: product.quantity || product.sizeLabel || ''
        };
        return {
          ...prev,
          products: [...prev.products, newProduct]
        };
      }
    });
  }, []);

  // Check if product is selected
  const isProductSelected = useCallback((productId) => {
    const productIdStr = productId?.toString();
    return formData.products.some(p => {
      const pIdStr = p.productId?.toString();
      return pIdStr === productIdStr;
    });
  }, [formData.products]);

  // Update product in form (for price and quantity changes)
  const handleProductChange = useCallback((index, field, value) => {
    setFormData(prev => {
      const newProducts = prev.products.map((p, i) => {
        if (i === index) {
          return {
            ...p,
            [field]: field === 'quantity' ? parseInt(value) || 1 : parseFloat(value) || 0
          };
        }
        return p;
      });
      return { ...prev, products: newProducts };
    });
  }, []);

  // Remove product from form
  const handleRemoveProduct = useCallback((index) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index)
    }));
  }, []);

  // Calculate totals - must be defined before handleSubmitComboOffer
  const calculateTotals = useCallback((products) => {
    if (!products || !Array.isArray(products) || products.length === 0) {
      return { totalActualPrice: 0, totalCurrentPrice: 0, discount: 0, discountPercentage: 0 };
    }
    let totalActualPrice = 0;
    let totalCurrentPrice = 0;
    products.forEach(p => {
      if (p) {
        totalActualPrice += (parseFloat(p.actualPrice) || 0) * (parseInt(p.quantity) || 1);
        totalCurrentPrice += (parseFloat(p.currentPrice) || 0) * (parseInt(p.quantity) || 1);
      }
    });
    const discount = totalActualPrice - totalCurrentPrice;
    const discountPercentage = totalActualPrice > 0 ? ((discount / totalActualPrice) * 100).toFixed(2) : 0;
    return { totalActualPrice, totalCurrentPrice, discount, discountPercentage };
  }, []);

  // Submit handler with optimistic updates
  const handleSubmitComboOffer = useCallback(async (isEdit = false) => {
    if (isSubmitting) return;

    // Step 1: Store form data before resetting
    const currentFormData = { ...formDataRef.current };
    const currentImageFile = imageFile;
    const currentSelectedItem = selectedComboOffer;

    // Validation
    if (!currentFormData.name || currentFormData.name.trim() === '') {
      setImageError('Combo offer name is required');
      return;
    }

    if (!currentFormData.products || !Array.isArray(currentFormData.products) || currentFormData.products.length === 0) {
      setImageError('Please select at least one product from the product list above');
      return;
    }

    // Validate all products have required fields
    for (let i = 0; i < currentFormData.products.length; i++) {
      const product = currentFormData.products[i];
      if (!product.productId) {
        setImageError(`Product ${i + 1}: Please select a product`);
        return;
      }
      const actualPrice = parseFloat(product.actualPrice) || 0;
      const currentPrice = parseFloat(product.currentPrice) || 0;
      const quantity = parseInt(product.quantity) || 1;
      if (actualPrice <= 0 || currentPrice <= 0 || quantity <= 0) {
        setImageError(`Product ${i + 1}: Prices and quantity must be greater than 0`);
        return;
      }
    }

    // Step 2: Create optimistic data object
    const totals = calculateTotals(currentFormData.products);
    const optimisticItem = {
      _id: isEdit ? (currentSelectedItem?._id || `temp-${Date.now()}`) : `temp-${Date.now()}`,
      name: currentFormData.name.trim(),
      description: currentFormData.description || '',
      products: currentFormData.products.map(p => ({
        productId: p.productId,
        productName: p.productName || '',
        actualPrice: parseFloat(p.actualPrice) || 0,
        currentPrice: parseFloat(p.currentPrice) || 0,
        quantity: parseInt(p.quantity) || 1,
        productQuantity: p.productQuantity || ''
      })),
      isActive: currentFormData.isActive !== false,
      imageUrl: currentImageFile
        ? URL.createObjectURL(currentImageFile)
        : (isEdit ? (currentSelectedItem?.imageUrl || currentSelectedItem?.image || null) : null),
      offerPrice: parseFloat(currentFormData.offerPrice || 0),
      gstType: currentFormData.gstType || 'Inclusive',
      gstTaxRate: parseFloat(currentFormData.gstTaxRate || 0),
      totalActualPrice: totals.totalActualPrice,
      totalCurrentPrice: totals.totalCurrentPrice,
      discount: totals.discount,
      discountPercentage: parseFloat(totals.discountPercentage),
      createdAt: isEdit ? (currentSelectedItem?.createdAt || new Date()) : new Date(),
      updatedAt: new Date()
    };

    // Step 3: Update UI immediately (Optimistic Update)
    if (!isEdit) {
      // CREATE: Add new item to list immediately
      setComboOffers(prev => [optimisticItem, ...prev]);

      // Update summary counts immediately
      setSummary(prev => ({
        ...prev,
        totalOffers: prev.totalOffers + 1,
        activeOffers: optimisticItem.isActive !== false
          ? prev.activeOffers + 1
          : prev.activeOffers
      }));
      setTotalItems(prev => prev + 1);
    } else {
      // UPDATE: Update existing item in list immediately
      setComboOffers(prev => prev.map(item => {
        const itemId = item._id?.toString() || item._id;
        const editId = currentSelectedItem?._id?.toString() || currentSelectedItem?._id;
        return itemId === editId ? { ...item, ...optimisticItem } : item;
      }));
    }

    // Step 4: Close modal and reset form immediately
    if (isEdit) {
      setShowEditModal(false);
    } else {
      setShowCreateModal(false);
    }

    // Reset form immediately
    setFormData({
      name: '',
      description: '',
      products: [],
      isActive: true,
      image: null,
      removeImage: false,
      offerPrice: '',
      gstType: 'Inclusive',
      gstTaxRate: 0
    });
    setImageFile(null);
    setImageError('');
    setIsSubmitting(false);

    // Step 5: Make API call in background
    try {
      const url = isEdit
        ? `${config.api.baseUrl}/combo-offers/${theaterId}/${currentSelectedItem._id}`
        : `${config.api.baseUrl}/combo-offers/${theaterId}`;
      const method = isEdit ? 'PUT' : 'POST';

      const formDataToSend = new FormData();
      formDataToSend.append('name', currentFormData.name.trim());
      formDataToSend.append('description', currentFormData.description || '');

      // Prepare products array with proper types
      const productsToSend = currentFormData.products.map(p => ({
        productId: String(p.productId),
        productName: String(p.productName || ''),
        actualPrice: parseFloat(p.actualPrice) || 0,
        currentPrice: parseFloat(p.currentPrice) || 0,
        quantity: parseInt(p.quantity) || 1,
        productQuantity: String(p.productQuantity || '')
      }));

      formDataToSend.append('products', JSON.stringify(productsToSend));
      formDataToSend.append('isActive', currentFormData.isActive ? 'true' : 'false');
      formDataToSend.append('offerPrice', String(currentFormData.offerPrice || '0'));
      formDataToSend.append('gstType', currentFormData.gstType || 'Inclusive');
      formDataToSend.append('gstTaxRate', String(currentFormData.gstTaxRate || 0));

      if (currentImageFile) {
        formDataToSend.append('image', currentImageFile);
      }

      const response = await unifiedFetch(url, {
        method: method,
        body: formDataToSend
      }, {
        forceRefresh: true,
        cacheTTL: 0
      });

      let data;
      if (response && typeof response.json === 'function') {
        data = await response.json();
      } else if (response && typeof response === 'object') {
        data = response;
      } else {
        throw new Error('Invalid response format from server');
      }

      // Check for success
      const hasError = data.error || (data.success === false);
      const isSuccess = !hasError && (data.success === true || data.data || data.comboOffer);

      if (isSuccess) {
        // Step 6: Replace optimistic data with real server data
        const processedItem = data.data?.comboOffer || data.data || data.comboOffer || {};
        const serverItem = {
          ...processedItem,
          imageUrl: processedItem.imageUrl || processedItem.image || optimisticItem.imageUrl,
          products: processedItem.products || optimisticItem.products
        };

        if (!isEdit) {
          // Remove optimistic entry and add real one
          setComboOffers(prev => {
            const filtered = prev.filter(item => {
              const itemId = item._id?.toString() || item._id;
              return !itemId.toString().startsWith('temp-');
            });

            const exists = filtered.some(item => {
              const itemId = item._id?.toString() || item._id;
              const newId = serverItem._id?.toString() || serverItem._id;
              return itemId === newId;
            });

            if (exists) {
              return filtered.map(item => {
                const itemId = item._id?.toString() || item._id;
                const newId = serverItem._id?.toString() || serverItem._id;
                return itemId === newId ? serverItem : item;
              });
            }
            return [serverItem, ...filtered];
          });
        } else {
          // Replace optimistic update with real data
          setComboOffers(prev => prev.map(item => {
            const itemId = item._id?.toString() || item._id;
            const newId = serverItem._id?.toString() || serverItem._id;
            return itemId === newId ? serverItem : item;
          }));
        }

        // Show success message
        toast.success(data.message || (isEdit ? 'Combo offer updated successfully!' : 'Combo offer created successfully!'), 3000);

        // Clear cache
        clearCachePattern(`comboOffers_${theaterId}_*`);

        // Refresh data in background (optional)
        setTimeout(() => {
          if (isMountedRef.current && loadComboOffersDataRef.current) {
            loadComboOffersDataRef.current(currentPage, itemsPerPage, true);
          }
        }, 500);
      } else {
        // Step 7: Handle Error - Revert Optimistic Update
        const errorMessage = data.message || data.error || 'Failed to save combo offer';
        toast.error(errorMessage, 5000);

        // Revert optimistic update
        if (!isEdit) {
          setComboOffers(prev => prev.filter(item => {
            const itemId = item._id?.toString() || item._id;
            return !itemId.toString().startsWith('temp-');
          }));
          setSummary(prev => ({
            ...prev,
            totalOffers: Math.max(0, prev.totalOffers - 1),
            activeOffers: optimisticItem.isActive !== false
              ? Math.max(0, prev.activeOffers - 1)
              : prev.activeOffers
          }));
          setTotalItems(prev => Math.max(0, prev - 1));
        } else {
          // Revert to original data
          setComboOffers(prev => prev.map(item => {
            const itemId = item._id?.toString() || item._id;
            const editId = currentSelectedItem?._id?.toString() || currentSelectedItem?._id;
            return itemId === editId ? currentSelectedItem : item;
          }));
        }

        // Reopen modal with form data restored
        if (isEdit) {
          setShowEditModal(true);
          setFormData(currentFormData);
          setImageFile(currentImageFile);
          setSelectedComboOffer(currentSelectedItem);
        } else {
          setShowCreateModal(true);
          setFormData(currentFormData);
          setImageFile(currentImageFile);
        }
        setImageError(errorMessage);
      }
    } catch (error) {
      // Handle network/other errors - same revert logic as above
      console.error('Error saving combo offer:', error);

      let errorMessage = 'Failed to save combo offer';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      toast.error(errorMessage, 5000);

      // Revert optimistic update
      if (!isEdit) {
        setComboOffers(prev => prev.filter(item => {
          const itemId = item._id?.toString() || item._id;
          return !itemId.toString().startsWith('temp-');
        }));
        setSummary(prev => ({
          ...prev,
          totalOffers: Math.max(0, prev.totalOffers - 1),
          activeOffers: optimisticItem.isActive !== false
            ? Math.max(0, prev.activeOffers - 1)
            : prev.activeOffers
        }));
        setTotalItems(prev => Math.max(0, prev - 1));
      } else {
        // Revert to original data
        setComboOffers(prev => prev.map(item => {
          const itemId = item._id?.toString() || item._id;
          const editId = currentSelectedItem?._id?.toString() || currentSelectedItem?._id;
          return itemId === editId ? currentSelectedItem : item;
        }));
      }

      // Reopen modal with form data restored
      if (isEdit) {
        setShowEditModal(true);
        setFormData(currentFormData);
        setImageFile(currentImageFile);
        setSelectedComboOffer(currentSelectedItem);
      } else {
        setShowCreateModal(true);
        setFormData(currentFormData);
        setImageFile(currentImageFile);
      }
      setImageError(errorMessage);
    }
  }, [isSubmitting, formData, imageFile, theaterId, selectedComboOffer, currentPage, itemsPerPage, toast, calculateTotals]);

  // Delete handler with optimistic updates
  const handleDeleteComboOffer = useCallback(async () => {
    if (!selectedComboOffer?._id) return;

    const deletedId = selectedComboOffer._id?.toString() || selectedComboOffer._id;
    const deletedIsActive = selectedComboOffer.isActive !== false;
    const deletedItem = { ...selectedComboOffer };

    // Remove immediately (optimistic update)
    setComboOffers(prev => prev.filter(item => {
      const itemId = item._id?.toString() || item._id;
      return itemId !== deletedId;
    }));

    // Update counts
    setSummary(prev => ({
      ...prev,
      totalOffers: Math.max(0, prev.totalOffers - 1),
      activeOffers: deletedIsActive ? Math.max(0, prev.activeOffers - 1) : prev.activeOffers
    }));
    setTotalItems(prev => Math.max(0, prev - 1));

    // Close modal
    setShowDeleteModal(false);
    setSelectedComboOffer(null);

    // API call in background
    try {
      const response = await unifiedFetch(
        `${config.api.baseUrl}/combo-offers/${theaterId}/${deletedId}`,
        {
          method: 'DELETE'
        },
        {
          forceRefresh: true,
          cacheTTL: 0
        }
      );

      let data;
      if (response && typeof response.json === 'function') {
        data = await response.json();
      } else if (response && typeof response === 'object') {
        data = response;
      } else {
        throw new Error('Invalid response format from server');
      }

      if (data && data.success) {
        toast.success('Combo offer deleted successfully!', 3000);

        // Clear cache
        clearCachePattern(`comboOffers_${theaterId}_*`);

        // Refresh data in background (optional)
        setTimeout(() => {
          if (isMountedRef.current && loadComboOffersDataRef.current) {
            loadComboOffersDataRef.current(currentPage, itemsPerPage, true);
          }
        }, 500);
      } else {
        throw new Error(data?.error || data?.message || 'Failed to delete combo offer');
      }
    } catch (error) {
      console.error('Error deleting combo offer:', error);

      // Revert on error - re-add item to list
      setComboOffers(prev => {
        const exists = prev.some(item => {
          const itemId = item._id?.toString() || item._id;
          return itemId === deletedId;
        });
        if (!exists) {
          return [...prev, deletedItem];
        }
        return prev;
      });

      // Revert counts
      setSummary(prev => ({
        ...prev,
        totalOffers: prev.totalOffers + 1,
        activeOffers: deletedIsActive ? prev.activeOffers + 1 : prev.activeOffers
      }));
      setTotalItems(prev => prev + 1);

      toast.error(error.message || 'Failed to delete combo offer', 5000);
    }
  }, [selectedComboOffer, theaterId, currentPage, itemsPerPage, toast]);

  // Create new combo offer
  const handleCreateNewComboOffer = () => {
    // Reset form data
    setFormData({
      name: '',
      description: '',
      products: [],
      isActive: true,
      image: null,
      removeImage: false,
      offerPrice: '',
      gstType: 'Inclusive',
      gstTaxRate: 0
    });
    setImageFile(null);
    setImageError('');
    setSelectedComboOffer(null);

    // Open modal first (immediately, don't wait for anything)
    setShowCreateModal(true);

    // Load active products in background (non-blocking)
    if (theaterId) {
      loadActiveProducts().catch(err => {
        console.error('Error loading products:', err);
      });
    }
  };

  const headerButton = (
    <button
      className="header-btn"
      onClick={handleCreateNewComboOffer}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </span>
      CREATE COMBO OFFER
    </button>
  );

  // Safety check - ensure component always renders
  if (!theaterId) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Combo Offers" currentPage="combo-offers">
          <PageContainer title="Combo Offers" showBackButton={false}>
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p>Loading theater information...</p>
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Combo Offers" currentPage="combo-offers">
        <PageContainer
          title="Combo Offers"
          showBackButton={false}
          headerButton={headerButton}
        >
          <div className="qr-management-page">
            {/* Summary Statistics */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{summary.totalOffers}</div>
                <div className="stat-label">Total Offers</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.activeOffers}</div>
                <div className="stat-label">Active Offers</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{summary.inactiveOffers}</div>
                <div className="stat-label">Inactive Offers</div>
              </div>
            </div>

            {/* Filters and Controls */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search combo offers by name or description..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="search-input"
                />
              </div>

              <div className="filter-controls">
                <div className="items-per-page-container">
                  <label>Items per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                    className="items-select"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Combo Offers Table */}
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-cell">S.NO</th>
                    <th className="photo-cell">IMAGE</th>
                    <th className="name-cell">NAME</th>
                    <th className="description-cell">DESCRIPTION</th>
                    <th className="products-cell">PRODUCTS</th>
                    <th className="price-cell">TOTAL AMOUNT</th>
                    <th className="price-cell">NET PRICE</th>
                    <th className="discount-cell">SAVED AMOUNT</th>
                    <th className="status-cell">STATUS</th>
                    <th className="actions-cell">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="loading-cell">
                        <div className="loading-spinner"></div>
                        <span>Loading combo offers...</span>
                      </td>
                    </tr>
                  ) : comboOffers.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="empty-cell">
                        <i className="fas fa-box fa-3x"></i>
                        <h3>No Combo Offers Found</h3>
                        <p>There are no combo offers available. Create your first combo offer!</p>
                        <button
                          className="add-theater-btn"
                          onClick={handleCreateNewComboOffer}
                        >
                          Create First Combo Offer
                        </button>
                      </td>
                    </tr>
                  ) : (
                    comboOffers.map((offer, index) => {
                      const totals = calculateTotals(offer.products || []);
                      const netPrice = offer.finalPrice || offer.offerPrice || 0;
                      return (
                        <tr key={offer._id} className="theater-row">
                          <td className="sno-cell">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                          <td className="photo-cell">
                            {offer.imageUrl ? (
                              <div className="theater-photo-thumb">
                                <InstantImage
                                  src={offer.imageUrl}
                                  alt={offer.name}
                                  loading="eager"
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block'
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="theater-photo-thumb no-photo">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                                  <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-1l2.5-3.21 1.79 2.15 2.5-3.22L21 19H3l3-3.86z" />
                                </svg>
                              </div>
                            )}
                          </td>
                          <td className="name-cell">{offer.name}</td>
                          <td className="description-cell">
                            {offer.description || 'N/A'}
                          </td>
                          <td className="products-cell">
                            <div className="products-list">
                              {offer.products?.slice(0, 2).map((p, i) => (
                                <span key={i} className="product-tag">
                                  {p.productName} (x{p.quantity})
                                </span>
                              ))}
                              {offer.products?.length > 2 && (
                                <span className="product-tag more">
                                  +{offer.products.length - 2} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="price-cell">₹{totals.totalCurrentPrice.toFixed(2)}</td>
                          <td className="price-cell">₹{netPrice.toFixed(2)}</td>
                          <td className="discount-cell">
                            <span className="discount-badge">
                              ₹{(totals.totalCurrentPrice - netPrice).toFixed(2)}
                            </span>
                          </td>
                          <td className="status-cell">
                            <span className={`status-badge ${offer.isActive ? 'active' : 'inactive'}`}>
                              {offer.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="actions-cell">
                            <ActionButtons>
                              <ActionButton
                                onClick={() => viewComboOffer(offer)}
                                type="view"
                              />
                              <ActionButton
                                onClick={() => editComboOffer(offer)}
                                type="edit"
                              />
                              <ActionButton
                                onClick={() => deleteComboOffer(offer)}
                                type="delete"
                              />
                            </ActionButtons>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                itemType="combo offers"
              />
            )}

            {/* Create Modal */}
            {showCreateModal && (
              <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', width: '95%' }}>
                  <div className="modal-header">
                    <h2>Create Combo Offer</h2>
                    <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                  <div className="modal-body">
                    <div className="edit-form">
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Combo Offer Name *</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            className="form-control"
                            placeholder="Enter combo offer name"
                          />
                        </div>
                        <div className="form-group">
                          <label>Status</label>
                          <select
                            value={formData.isActive ? 'Active' : 'Inactive'}
                            onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.value === 'Active' }))}
                            className="form-control"
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                          className="form-control"
                          placeholder="Enter description (optional)"
                          rows="3"
                        />
                      </div>
                      <div className="form-group">
                        <label>Products *</label>
                        <p className="form-helper-text" style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
                          Select products by checking the boxes below. You can select multiple products.
                          {formData.products.length === 0 && (
                            <span style={{ color: '#ef4444', fontWeight: '500', display: 'block', marginTop: '8px' }}>
                              ⚠️ Please select at least one product to continue
                            </span>
                          )}
                        </p>

                        {/* Product Selection Grid */}
                        {loadingProducts ? (
                          <div className="loading-products" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                            Loading products...
                          </div>
                        ) : activeProducts.length === 0 ? (
                          <div className="no-products-message" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                            No active products available.
                          </div>
                        ) : (
                          <div className="product-selection-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, 1fr)',
                            gap: '12px',
                            marginBottom: '24px',
                            padding: '4px'
                          }}>
                            {activeProducts.map((product) => {
                              const isSelected = isProductSelected(product._id);
                              const stockQuantity = product.balanceStock ?? product.closingBalance ?? 0;
                              const isOutOfStock = stockQuantity <= 0;

                              // Format helper for stock
                              const formatStockValue = (value) => {
                                if (value === null || value === undefined || isNaN(value)) return '0';
                                const numValue = Number(value);
                                if (numValue === 0) return '0';
                                const rounded = Math.round(numValue * 1000) / 1000;
                                if (rounded % 1 === 0) return rounded.toString();
                                return rounded.toFixed(3).replace(/\.?0+$/, '');
                              };

                              return (
                                <div
                                  key={product._id}
                                  className={`product-selection-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() => !isOutOfStock && handleProductToggle(product)}
                                  style={{
                                    border: isSelected ? '1px solid #8b5cf6' : '1px solid #e5e7eb',
                                    borderRadius: '12px',
                                    backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s ease',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    opacity: isOutOfStock ? 0.7 : 1,
                                    height: '100%'
                                  }}
                                >
                                  {/* Custom Checkbox */}
                                  <div style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    zIndex: 10,
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '6px',
                                    backgroundColor: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.9)',
                                    border: isSelected ? 'none' : '2px solid #e5e7eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                  }}>
                                    {isSelected && (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                  </div>

                                  {/* Discount Badge (Top Left) */}
                                  {(() => {
                                    const originalPrice = product.pricing?.basePrice ?? product.pricing?.sellingPrice ?? 0;
                                    const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
                                    const hasDiscount = discountPercentage > 0;

                                    if (hasDiscount && !isOutOfStock) {
                                      return (
                                        <div style={{
                                          position: 'absolute',
                                          top: '8px',
                                          left: '8px',
                                          zIndex: 10,
                                          backgroundColor: '#10b981',
                                          color: 'white',
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                        }}>
                                          {discountPercentage}% OFF
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}

                                  {/* Out of Stock Overlay */}
                                  {isOutOfStock && (
                                    <div style={{
                                      position: 'absolute',
                                      inset: 0,
                                      backgroundColor: 'rgba(255,255,255,0.6)',
                                      zIndex: 5,
                                      pointerEvents: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <span style={{
                                        backgroundColor: '#ef4444',
                                        color: '#fff',
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        transform: 'rotate(-10deg)',
                                        boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)'
                                      }}>
                                        OUT OF STOCK
                                      </span>
                                    </div>
                                  )}

                                  {/* Image Section */}
                                  <div style={{
                                    position: 'relative',
                                    height: '100px',
                                    backgroundColor: '#f9fafb',
                                    borderBottom: '1px solid #f3f4f6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden'
                                  }}>
                                    {(() => {
                                      const hasImage = product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim().length > 0;

                                      if (hasImage) {
                                        return (
                                          <InstantImage
                                            src={product.imageUrl}
                                            alt={product.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="eager"
                                            onError={(e) => {
                                              console.warn(`[ComboOffers] Failed to load image for "${product.name}":`, product.imageUrl);
                                            }}
                                          />
                                        );
                                      } else {
                                        return (
                                          <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: '100%',
                                            color: '#9ca3af'
                                          }}>
                                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '32px', height: '32px', marginBottom: '4px' }}>
                                              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z" />
                                            </svg>
                                            <span style={{ fontSize: '10px', textAlign: 'center', padding: '0 4px' }}>No Image</span>
                                          </div>
                                        );
                                      }
                                    })()}
                                  </div>

                                  {/* Content Section */}
                                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {/* Name & Quantity */}
                                    <div style={{
                                      fontSize: '13px',
                                      fontWeight: '600',
                                      color: '#1f2937',
                                      lineHeight: '1.3',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }} title={product.name}>
                                      {product.name}
                                      <span style={{
                                        fontSize: '11px',
                                        color: '#6b7280',
                                        fontWeight: '500',
                                        marginLeft: '4px'
                                      }}>
                                        {product.quantity || product.sizeLabel || ''}
                                      </span>
                                    </div>

                                    {/* Footer: Price & Stock */}
                                    <div style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'flex-end',
                                      marginTop: '4px',
                                      borderTop: '1px dashed #e5e7eb',
                                      paddingTop: '6px'
                                    }}>
                                      {/* Price Display */}
                                      {(() => {
                                        const originalPrice = product.pricing?.basePrice ?? product.pricing?.sellingPrice ?? 0;
                                        const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
                                        const hasDiscount = discountPercentage > 0;
                                        const finalPrice = hasDiscount ? originalPrice * (1 - discountPercentage / 100) : originalPrice;

                                        const formatPrice = (p) => {
                                          const n = Number(p);
                                          return Math.round(n) === n ? n : n.toFixed(2);
                                        };

                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                            {hasDiscount ? (
                                              <>
                                                <span style={{ fontSize: '11px', textDecoration: 'line-through', color: '#9ca3af' }}>
                                                  ₹{formatPrice(originalPrice)}
                                                </span>
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: '#10b981' }}>
                                                  ₹{formatPrice(finalPrice)}
                                                </span>
                                              </>
                                            ) : (
                                              <span style={{ fontSize: '14px', fontWeight: '700', color: '#7c3aed' }}>
                                                ₹{formatPrice(finalPrice)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <div style={{
                                          width: '6px',
                                          height: '6px',
                                          borderRadius: '50%',
                                          backgroundColor: isOutOfStock ? '#ef4444' : stockQuantity <= 5 ? '#f59e0b' : '#10b981'
                                        }} />
                                        <span style={{
                                          fontSize: '10px',
                                          color: isOutOfStock ? '#ef4444' : '#6b7280',
                                          fontWeight: '500'
                                        }}>
                                          {isOutOfStock ? 'No Stock' : stockQuantity <= 5 ? 'Low' : 'In Stock'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Selected Products with Professional Cart Style */}
                        {formData.products.length > 0 && (
                          <div className="selected-products-section" style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                            <h4 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                              Selected Products ({formData.products.length})
                            </h4>
                            {formData.products.map((product, index) => {
                              const fullProduct = activeProducts.find(p => {
                                const pId = p._id?.toString();
                                const prodId = product.productId?.toString();
                                return pId === prodId;
                              });
                              const currentPrice = parseFloat(product.currentPrice) || 0;
                              const quantity = parseInt(product.quantity) || 1;
                              const totalProductPrice = currentPrice * quantity;

                              return (
                                <div key={`product-${product.productId}-${index}`} className="selected-product-row" style={{
                                  display: 'flex',
                                  gap: '16px',
                                  marginBottom: '16px',
                                  padding: '16px',
                                  backgroundColor: '#ffffff',
                                  borderRadius: '12px',
                                  border: '1px solid #e5e7eb',
                                  alignItems: 'center'
                                }}>
                                  {/* Product Image */}
                                  {fullProduct?.imageUrl && (
                                    <InstantImage
                                      src={fullProduct.imageUrl}
                                      alt={product.productName}
                                      className="selected-product-image"
                                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                                    />
                                  )}

                                  {/* Product Info */}
                                  <div className="selected-product-info" style={{ flex: '1', minWidth: 0 }}>
                                    <div className="selected-product-name" style={{
                                      fontSize: '16px',
                                      fontWeight: '600',
                                      marginBottom: '6px',
                                      color: '#1f2937',
                                      lineHeight: '1.4',
                                      wordBreak: 'break-word'
                                    }}>
                                      {product.productName}
                                    </div>
                                  </div>

                                  {/* Right Section: Price, Quantity, Total, Remove */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    {/* Individual Price Display (Editable) */}
                                    <div style={{ minWidth: '100px', textAlign: 'center' }}>
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Price</div>
                                      <input
                                        type="number"
                                        value={currentPrice}
                                        onChange={(e) => handleProductChange(index, 'currentPrice', e.target.value)}
                                        disabled
                                        style={{
                                          width: '100%',
                                          padding: '6px 8px',
                                          fontSize: '14px',
                                          fontWeight: '600',
                                          color: '#6b7280',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          textAlign: 'center',
                                          backgroundColor: '#f3f4f6'
                                        }}
                                        step="0.01"
                                        min="0"
                                      />
                                    </div>

                                    {/* Quantity Controls */}
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      background: '#ffffff',
                                      borderRadius: '12px',
                                      padding: '4px',
                                      border: '1px solid #e5e7eb',
                                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                    }}>
                                      <button
                                        onClick={() => {
                                          if (quantity > 1) {
                                            handleProductChange(index, 'quantity', quantity - 1);
                                          }
                                        }}
                                        disabled={quantity <= 1}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '8px',
                                          border: 'none',
                                          fontSize: '16px',
                                          fontWeight: '700',
                                          cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                                          transition: 'all 0.2s ease',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: 0,
                                          background: 'linear-gradient(135deg, #e8e8e8, #d0d0d0)',
                                          color: '#666',
                                          opacity: quantity <= 1 ? 0.4 : 1
                                        }}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                      </button>

                                      <span style={{
                                        minWidth: '24px',
                                        textAlign: 'center',
                                        fontSize: '16px',
                                        fontWeight: '700',
                                        color: '#1f2937'
                                      }}>
                                        {quantity}
                                      </span>

                                      <button
                                        onClick={() => handleProductChange(index, 'quantity', quantity + 1)}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '8px',
                                          border: 'none',
                                          fontSize: '16px',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: 0,
                                          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                          color: 'white',
                                          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                                        }}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                      </button>
                                    </div>

                                    {/* Total Price */}
                                    <div style={{ minWidth: '100px', textAlign: 'right' }}>
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total</div>
                                      <div style={{
                                        fontSize: '16px',
                                        fontWeight: '700',
                                        color: '#8b5cf6'
                                      }}>
                                        ₹{totalProductPrice.toFixed(2)}
                                      </div>
                                    </div>

                                    {/* Remove Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveProduct(index)}
                                      title="Remove product"
                                      style={{
                                        padding: '8px',
                                        backgroundColor: 'transparent',
                                        color: '#ef4444',
                                        border: '2px solid #ef4444',
                                        borderRadius: '50%',
                                        width: '36px',
                                        height: '36px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px',
                                        fontWeight: 'bold',
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = '#ef4444';
                                        e.target.style.color = '#ffffff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = 'transparent';
                                        e.target.style.color = '#ef4444';
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="totals-display" style={{
                              marginTop: '16px',
                              padding: '16px',
                              backgroundColor: '#ffffff',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb'
                            }}>
                              {(() => {
                                const totals = calculateTotals(formData.products);
                                const totalAmount = totals.totalCurrentPrice;
                                const offerPrice = parseFloat(formData.offerPrice || 0);
                                const gstTaxRate = parseFloat(formData.gstTaxRate || 0);
                                const gstType = formData.gstType || 'Inclusive';

                                let gstAmount = 0;
                                let finalPrice = 0;
                                let balance = 0;

                                if (gstType === 'Exclusive') {
                                  gstAmount = offerPrice * (gstTaxRate / 100);
                                  finalPrice = offerPrice + gstAmount;
                                  balance = totalAmount - finalPrice;
                                } else {
                                  finalPrice = offerPrice;
                                  const basePrice = offerPrice / (1 + gstTaxRate / 100);
                                  gstAmount = offerPrice - basePrice;
                                  balance = totalAmount - finalPrice;
                                }

                                return (
                                  <>
                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '16px' }}>Total Amount:</span>
                                      <span className="total-value" style={{ fontWeight: '700', color: '#8b5cf6', fontSize: '18px' }}>₹{totalAmount.toFixed(2)}</span>
                                    </div>

                                    {/* GST Type & Rate */}
                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>GST Type:</span>
                                      <select
                                        value={formData.gstType || 'Inclusive'}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gstType: e.target.value }))}
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '14px',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          width: '200px',
                                          fontWeight: '500',
                                          color: '#1f2937'
                                        }}
                                      >
                                        <option value="Inclusive">Inclusive</option>
                                        <option value="Exclusive">Exclusive</option>
                                      </select>
                                    </div>

                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>GST Rate (%):</span>
                                      <input
                                        type="number"
                                        value={formData.gstTaxRate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gstTaxRate: e.target.value }))}
                                        placeholder="0"
                                        min="0"
                                        step="0.01"
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '14px',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          width: '200px',
                                          fontWeight: '500',
                                          color: '#1f2937',
                                          textAlign: 'right'
                                        }}
                                      />
                                    </div>

                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>Combo Offer Price:</span>
                                      <input
                                        type="number"
                                        value={formData.offerPrice || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, offerPrice: e.target.value }))}
                                        placeholder="Enter offer price"
                                        step="0.01"
                                        min="0"
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '14px',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          width: '200px',
                                          fontWeight: '500',
                                          color: '#1f2937',
                                          textAlign: 'right'
                                        }}
                                      />
                                    </div>

                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
                                      <span className="total-label">GST Amount:</span>
                                      <span className="total-value">₹{gstAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', fontWeight: '600' }}>
                                      <span className="total-label">Final Price (Inc. Tax):</span>
                                      <span className="total-value" style={{ color: '#111827' }}>₹{finalPrice.toFixed(2)}</span>
                                    </div>

                                    <div className="total-item saved-amount" style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>Saved Amount:</span>
                                      <span className="total-value" style={{ fontWeight: '700', color: balance >= 0 ? '#059669' : '#ef4444', fontSize: '16px' }}>
                                        ₹{balance.toFixed(2)}
                                      </span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label>Image</label>
                        <ImageUpload
                          value={imageFile || formData.image}
                          onChange={setImageFile}
                          onRemove={() => {
                            setImageFile(null);
                            setFormData(prev => ({ ...prev, image: null }));
                          }}
                          error={imageError}
                          label="Upload Combo Offer Image"
                          helperText="Drag and drop an image here, or click to select (optional)"
                        />
                      </div>
                      {imageError && <div className="error-message">{imageError}</div>}
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="cancel-btn"
                      onClick={() => setShowCreateModal(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => handleSubmitComboOffer(false)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Creating...' : 'Create Offer'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Modal - Similar structure to Create Modal */}
            {showEditModal && (
              <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', width: '95%' }}>
                  <div className="modal-header">
                    <h2>Edit Combo Offer</h2>
                    <button className="close-btn" onClick={() => setShowEditModal(false)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                  <div className="modal-body">
                    <div className="edit-form">
                      {/* Same form fields as create modal */}
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Combo Offer Name *</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            className="form-control"
                            placeholder="Enter combo offer name"
                          />
                        </div>
                        <div className="form-group">
                          <label>Status</label>
                          <select
                            value={formData.isActive ? 'Active' : 'Inactive'}
                            onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.value === 'Active' }))}
                            className="form-control"
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                          className="form-control"
                          placeholder="Enter description (optional)"
                          rows="3"
                        />
                      </div>
                      <div className="form-group">
                        <label>Products *</label>
                        <p className="form-helper-text" style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
                          Select products by checking the boxes below. You can select multiple products.
                          {formData.products.length === 0 && (
                            <span style={{ color: '#ef4444', fontWeight: '500', display: 'block', marginTop: '8px' }}>
                              ⚠️ Please select at least one product to continue
                            </span>
                          )}
                        </p>

                        {/* Product Selection Grid */}
                        {loadingProducts ? (
                          <div className="loading-products" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                            Loading products...
                          </div>
                        ) : activeProducts.length === 0 ? (
                          <div className="no-products-message" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                            No active products available.
                          </div>
                        ) : (
                          <div className="product-selection-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, 1fr)',
                            gap: '12px',
                            marginBottom: '24px',
                            padding: '8px'
                          }}>
                            {activeProducts.map((product) => {
                              const isSelected = isProductSelected(product._id);
                              const stockQuantity = product.balanceStock ?? product.closingBalance ?? 0;
                              const isOutOfStock = stockQuantity <= 0;

                              // Format helper for stock
                              const formatStockValue = (value) => {
                                if (value === null || value === undefined || isNaN(value)) return '0';
                                const numValue = Number(value);
                                if (numValue === 0) return '0';
                                const rounded = Math.round(numValue * 1000) / 1000;
                                if (rounded % 1 === 0) return rounded.toString();
                                return rounded.toFixed(3).replace(/\.?0+$/, '');
                              };

                              return (
                                <div
                                  key={product._id}
                                  className={`product-selection-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() => !isOutOfStock && handleProductToggle(product)}
                                  style={{
                                    border: isSelected ? '1px solid #8b5cf6' : '1px solid #e5e7eb',
                                    borderRadius: '12px',
                                    backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s ease',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    opacity: isOutOfStock ? 0.7 : 1,
                                    height: '100%'
                                  }}
                                >
                                  {/* Custom Checkbox */}
                                  <div style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    zIndex: 10,
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '6px',
                                    backgroundColor: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.9)',
                                    border: isSelected ? 'none' : '2px solid #e5e7eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                  }}>
                                    {isSelected && (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                  </div>

                                  {/* Discount Badge (Top Left) */}
                                  {(() => {
                                    const originalPrice = product.pricing?.basePrice ?? product.pricing?.sellingPrice ?? 0;
                                    const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
                                    const hasDiscount = discountPercentage > 0;

                                    if (hasDiscount && !isOutOfStock) {
                                      return (
                                        <div style={{
                                          position: 'absolute',
                                          top: '8px',
                                          left: '8px',
                                          zIndex: 10,
                                          backgroundColor: '#10b981',
                                          color: 'white',
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                        }}>
                                          {discountPercentage}% OFF
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}

                                  {/* Out of Stock Overlay */}
                                  {isOutOfStock && (
                                    <div style={{
                                      position: 'absolute',
                                      inset: 0,
                                      backgroundColor: 'rgba(255,255,255,0.6)',
                                      zIndex: 5,
                                      pointerEvents: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <span style={{
                                        backgroundColor: '#ef4444',
                                        color: '#fff',
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        transform: 'rotate(-10deg)',
                                        boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)'
                                      }}>
                                        OUT OF STOCK
                                      </span>
                                    </div>
                                  )}

                                  {/* Image Section */}
                                  <div style={{
                                    position: 'relative',
                                    height: '100px',
                                    backgroundColor: '#f9fafb',
                                    borderBottom: '1px solid #f3f4f6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden'
                                  }}>
                                    {(() => {
                                      const hasImage = product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim().length > 0;

                                      if (hasImage) {
                                        return (
                                          <InstantImage
                                            src={product.imageUrl}
                                            alt={product.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="eager"
                                            onError={(e) => {
                                              console.warn(`[ComboOffers] Failed to load image for "${product.name}":`, product.imageUrl);
                                            }}
                                          />
                                        );
                                      } else {
                                        return (
                                          <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: '100%',
                                            color: '#9ca3af'
                                          }}>
                                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '32px', height: '32px', marginBottom: '4px' }}>
                                              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z" />
                                            </svg>
                                            <span style={{ fontSize: '10px', textAlign: 'center', padding: '0 4px' }}>No Image</span>
                                          </div>
                                        );
                                      }
                                    })()}
                                  </div>

                                  {/* Content Section */}
                                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {/* Name & Quantity */}
                                    <div style={{
                                      fontSize: '13px',
                                      fontWeight: '600',
                                      color: '#1f2937',
                                      lineHeight: '1.3',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }} title={product.name}>
                                      {product.name}
                                      <span style={{
                                        fontSize: '11px',
                                        color: '#6b7280',
                                        fontWeight: '500',
                                        marginLeft: '4px'
                                      }}>
                                        {product.quantity || product.sizeLabel || ''}
                                      </span>
                                    </div>

                                    {/* Footer: Price & Stock */}
                                    <div style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'flex-end',
                                      marginTop: '4px',
                                      borderTop: '1px dashed #e5e7eb',
                                      paddingTop: '6px'
                                    }}>
                                      {/* Price Display */}
                                      {(() => {
                                        const originalPrice = product.pricing?.basePrice ?? product.pricing?.sellingPrice ?? 0;
                                        const discountPercentage = parseFloat(product.discountPercentage || product.pricing?.discountPercentage) || 0;
                                        const hasDiscount = discountPercentage > 0;
                                        const finalPrice = hasDiscount ? originalPrice * (1 - discountPercentage / 100) : originalPrice;

                                        const formatPrice = (p) => {
                                          const n = Number(p);
                                          return Math.round(n) === n ? n : n.toFixed(2);
                                        };

                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                            {hasDiscount ? (
                                              <>
                                                <span style={{ fontSize: '11px', textDecoration: 'line-through', color: '#9ca3af' }}>
                                                  ₹{formatPrice(originalPrice)}
                                                </span>
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: '#10b981' }}>
                                                  ₹{formatPrice(finalPrice)}
                                                </span>
                                              </>
                                            ) : (
                                              <span style={{ fontSize: '14px', fontWeight: '700', color: '#7c3aed' }}>
                                                ₹{formatPrice(finalPrice)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <div style={{
                                          width: '6px',
                                          height: '6px',
                                          borderRadius: '50%',
                                          backgroundColor: isOutOfStock ? '#ef4444' : stockQuantity <= 5 ? '#f59e0b' : '#10b981'
                                        }} />
                                        <span style={{
                                          fontSize: '10px',
                                          color: isOutOfStock ? '#ef4444' : '#6b7280',
                                          fontWeight: '500'
                                        }}>
                                          {isOutOfStock ? 'No Stock' : stockQuantity <= 5 ? 'Low' : 'In Stock'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Selected Products with Professional Cart Style */}
                        {formData.products.length > 0 && (
                          <div className="selected-products-section" style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                            <h4 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                              Selected Products ({formData.products.length})
                            </h4>
                            {formData.products.map((product, index) => {
                              const fullProduct = activeProducts.find(p => {
                                const pId = p._id?.toString();
                                const prodId = product.productId?.toString();
                                return pId === prodId;
                              });
                              const currentPrice = parseFloat(product.currentPrice) || 0;
                              const quantity = parseInt(product.quantity) || 1;
                              const totalProductPrice = currentPrice * quantity;

                              return (
                                <div key={`product-${product.productId}-${index}`} className="selected-product-row" style={{
                                  display: 'flex',
                                  gap: '16px',
                                  marginBottom: '16px',
                                  padding: '16px',
                                  backgroundColor: '#ffffff',
                                  borderRadius: '12px',
                                  border: '1px solid #e5e7eb',
                                  alignItems: 'center'
                                }}>
                                  {/* Product Image */}
                                  {fullProduct?.imageUrl && (
                                    <InstantImage
                                      src={fullProduct.imageUrl}
                                      alt={product.productName}
                                      className="selected-product-image"
                                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                                    />
                                  )}

                                  {/* Product Info */}
                                  <div className="selected-product-info" style={{ flex: '1', minWidth: 0 }}>
                                    <div className="selected-product-name" style={{
                                      fontSize: '16px',
                                      fontWeight: '600',
                                      marginBottom: '6px',
                                      color: '#1f2937',
                                      lineHeight: '1.4',
                                      wordBreak: 'break-word'
                                    }}>
                                      {product.productName}
                                    </div>
                                  </div>

                                  {/* Right Section: Price, Quantity, Total, Remove */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    {/* Individual Price Display (Editable) */}
                                    <div style={{ minWidth: '100px', textAlign: 'center' }}>
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Price</div>
                                      <input
                                        type="number"
                                        value={currentPrice}
                                        onChange={(e) => handleProductChange(index, 'currentPrice', e.target.value)}
                                        disabled
                                        style={{
                                          width: '100%',
                                          padding: '6px 8px',
                                          fontSize: '14px',
                                          fontWeight: '600',
                                          color: '#6b7280',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          textAlign: 'center',
                                          backgroundColor: '#f3f4f6'
                                        }}
                                        step="0.01"
                                        min="0"
                                      />
                                    </div>

                                    {/* Quantity Controls */}
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      background: '#ffffff',
                                      borderRadius: '12px',
                                      padding: '4px',
                                      border: '1px solid #e5e7eb',
                                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                    }}>
                                      <button
                                        onClick={() => {
                                          if (quantity > 1) {
                                            handleProductChange(index, 'quantity', quantity - 1);
                                          }
                                        }}
                                        disabled={quantity <= 1}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '8px',
                                          border: 'none',
                                          fontSize: '16px',
                                          fontWeight: '700',
                                          cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                                          transition: 'all 0.2s ease',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: 0,
                                          background: 'linear-gradient(135deg, #e8e8e8, #d0d0d0)',
                                          color: '#666',
                                          opacity: quantity <= 1 ? 0.4 : 1
                                        }}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                      </button>

                                      <span style={{
                                        minWidth: '24px',
                                        textAlign: 'center',
                                        fontSize: '16px',
                                        fontWeight: '700',
                                        color: '#1f2937'
                                      }}>
                                        {quantity}
                                      </span>

                                      <button
                                        onClick={() => handleProductChange(index, 'quantity', quantity + 1)}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '8px',
                                          border: 'none',
                                          fontSize: '16px',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: 0,
                                          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                          color: 'white',
                                          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                                        }}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                      </button>
                                    </div>

                                    {/* Total Price */}
                                    <div style={{ minWidth: '100px', textAlign: 'right' }}>
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total</div>
                                      <div style={{
                                        fontSize: '16px',
                                        fontWeight: '700',
                                        color: '#8b5cf6'
                                      }}>
                                        ₹{totalProductPrice.toFixed(2)}
                                      </div>
                                    </div>

                                    {/* Remove Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveProduct(index)}
                                      title="Remove product"
                                      style={{
                                        padding: '8px',
                                        backgroundColor: 'transparent',
                                        color: '#ef4444',
                                        border: '2px solid #ef4444',
                                        borderRadius: '50%',
                                        width: '36px',
                                        height: '36px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px',
                                        fontWeight: 'bold',
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = '#ef4444';
                                        e.target.style.color = '#ffffff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = 'transparent';
                                        e.target.style.color = '#ef4444';
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="totals-display" style={{
                              marginTop: '16px',
                              padding: '16px',
                              backgroundColor: '#ffffff',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb'
                            }}>
                              {(() => {
                                const totals = calculateTotals(formData.products);
                                const totalAmount = totals.totalCurrentPrice;
                                const offerPrice = parseFloat(formData.offerPrice || 0);
                                const gstTaxRate = parseFloat(formData.gstTaxRate || 0);
                                const gstType = formData.gstType || 'Inclusive';

                                let gstAmount = 0;
                                let finalPrice = 0;
                                let balance = 0;

                                if (gstType === 'Exclusive') {
                                  gstAmount = offerPrice * (gstTaxRate / 100);
                                  finalPrice = offerPrice + gstAmount;
                                  balance = totalAmount - finalPrice;
                                } else {
                                  finalPrice = offerPrice;
                                  const basePrice = offerPrice / (1 + gstTaxRate / 100);
                                  gstAmount = offerPrice - basePrice;
                                  balance = totalAmount - finalPrice;
                                }

                                return (
                                  <>
                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '16px' }}>Total Amount:</span>
                                      <span className="total-value" style={{ fontWeight: '700', color: '#8b5cf6', fontSize: '18px' }}>₹{totalAmount.toFixed(2)}</span>
                                    </div>

                                    {/* GST Type & Rate */}
                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>GST Type:</span>
                                      <select
                                        value={formData.gstType || 'Inclusive'}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gstType: e.target.value }))}
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '14px',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          width: '200px',
                                          fontWeight: '500',
                                          color: '#1f2937'
                                        }}
                                      >
                                        <option value="Inclusive">Inclusive</option>
                                        <option value="Exclusive">Exclusive</option>
                                      </select>
                                    </div>

                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>GST Rate (%):</span>
                                      <input
                                        type="number"
                                        value={formData.gstTaxRate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gstTaxRate: e.target.value }))}
                                        placeholder="0"
                                        min="0"
                                        step="0.01"
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '14px',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          width: '200px',
                                          fontWeight: '500',
                                          color: '#1f2937',
                                          textAlign: 'right'
                                        }}
                                      />
                                    </div>

                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>Combo Offer Price:</span>
                                      <input
                                        type="number"
                                        value={formData.offerPrice || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, offerPrice: e.target.value }))}
                                        placeholder="Enter offer price"
                                        step="0.01"
                                        min="0"
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '14px',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '6px',
                                          width: '200px',
                                          fontWeight: '500',
                                          color: '#1f2937',
                                          textAlign: 'right'
                                        }}
                                      />
                                    </div>

                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
                                      <span className="total-label">GST Amount:</span>
                                      <span className="total-value">₹{gstAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="total-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', fontWeight: '600' }}>
                                      <span className="total-label">Final Price (Inc. Tax):</span>
                                      <span className="total-value" style={{ color: '#111827' }}>₹{finalPrice.toFixed(2)}</span>
                                    </div>

                                    <div className="total-item saved-amount" style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                                      <span className="total-label" style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>Saved Amount:</span>
                                      <span className="total-value" style={{ fontWeight: '700', color: balance >= 0 ? '#059669' : '#ef4444', fontSize: '16px' }}>
                                        ₹{balance.toFixed(2)}
                                      </span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label>Image</label>
                        <ImageUpload
                          value={imageFile || formData.image}
                          onChange={setImageFile}
                          onRemove={() => {
                            setImageFile(null);
                            setFormData(prev => ({ ...prev, image: null }));
                          }}
                          error={imageError}
                          label="Upload Combo Offer Image"
                          helperText="Drag and drop an image here, or click to select (optional)"
                        />
                      </div>
                      {imageError && <div className="error-message">{imageError}</div>}
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="cancel-btn"
                      onClick={() => setShowEditModal(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => handleSubmitComboOffer(true)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Updating...' : 'Update Offer'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Modal */}
            {showViewModal && selectedComboOffer && (
              <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
                <div
                  className="modal-content theater-edit-modal-content"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: '800px', width: '90%' }}
                >
                  <div className="modal-header">
                    <h2>{selectedComboOffer.name}</h2>
                    <button className="close-btn" onClick={() => setShowViewModal(false)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                  <div className="modal-body" style={{ padding: '0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: selectedComboOffer.imageUrl ? '1fr 1.2fr' : '1fr', gap: '0', minHeight: '400px' }}>

                      {/* Left Column: Image */}
                      {selectedComboOffer.imageUrl && (
                        <div style={{
                          backgroundColor: '#f9fafb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '24px',
                          borderRight: '1px solid #e5e7eb'
                        }}>
                          <InstantImage
                            src={selectedComboOffer.imageUrl}
                            alt={selectedComboOffer.name}
                            loading="eager"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '350px',
                              width: 'auto',
                              borderRadius: '12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              objectFit: 'contain'
                            }}
                          />
                        </div>
                      )}

                      {/* Right Column: Details */}
                      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '500px', overflowY: 'auto' }}>

                        {/* Status & Description */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: selectedComboOffer.isActive ? '#dcfce7' : '#fee2e2',
                              color: selectedComboOffer.isActive ? '#166534' : '#991b1b',
                              display: 'inline-block'
                            }}>
                              {selectedComboOffer.isActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </div>

                          <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: '1.6' }}>
                            {selectedComboOffer.description || 'No description provided.'}
                          </p>
                        </div>

                        {/* Products List */}
                        <div>
                          <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Included Products
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {selectedComboOffer.products?.map((p, i) => (
                              <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{
                                    backgroundColor: '#8b5cf6',
                                    color: '#fff',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    minWidth: '24px',
                                    textAlign: 'center'
                                  }}>
                                    x{p.quantity}
                                  </span>
                                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>{p.productName}</span>
                                </div>
                                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                  ₹{p.currentPrice}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Pricing Summary */}
                        <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                          {(() => {
                            const totals = calculateTotals(selectedComboOffer.products || []);
                            const offerPrice = selectedComboOffer.offerPrice || 0;
                            const gstType = selectedComboOffer.gstType || 'Inclusive';
                            const gstTaxRate = selectedComboOffer.gstTaxRate || 0;
                            const gstAmount = selectedComboOffer.gstAmount || 0;
                            const finalPrice = selectedComboOffer.finalPrice || offerPrice;
                            const savedAmount = totals.totalCurrentPrice - finalPrice;

                            return (
                              <div style={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                padding: '16px',
                                backgroundImage: 'linear-gradient(to right, #ffffff, #f9fafb)'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: '#6b7280' }}>
                                  <span>Total Value</span>
                                  <span style={{ textDecoration: 'line-through' }}>₹{totals.totalCurrentPrice.toFixed(2)}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px', color: '#374151' }}>
                                  <span>Offer Price ({gstType})</span>
                                  <span>₹{offerPrice.toFixed(2)}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
                                  <span>GST ({gstTaxRate}%)</span>
                                  <span>₹{gstAmount.toFixed(2)}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '18px', fontWeight: '700', color: '#8b5cf6' }}>
                                  <span>Net Payable</span>
                                  <span>₹{finalPrice.toFixed(2)}</span>
                                </div>

                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  paddingTop: '8px',
                                  borderTop: '1px dashed #e5e7eb',
                                  fontSize: '14px',
                                  fontWeight: '600',
                                  color: '#059669'
                                }}>
                                  <span>You Save</span>
                                  <span>₹{savedAmount.toFixed(2)}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="modal-actions" style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
                    <button
                      className="cancel-btn"
                      onClick={() => setShowViewModal(false)}
                      style={{ width: '100%', padding: '10px' }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && selectedComboOffer && (
              <div className="modal-overlay">
                <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Confirm Deletion</h3>
                  </div>
                  <div className="modal-body">
                    <p>Are you sure you want to delete "{selectedComboOffer.name}"?</p>
                    <p className="warning-text">This action cannot be undone.</p>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="cancel-btn"
                      onClick={() => setShowDeleteModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="confirm-delete-btn"
                      onClick={handleDeleteComboOffer}
                    >
                      Delete Offer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

export default ComboOffers;

