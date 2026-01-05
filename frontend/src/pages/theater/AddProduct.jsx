import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { useAuth } from '@contexts/AuthContext';
import ErrorBoundary from '@components/ErrorBoundary';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import config from '@config';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  Box
} from '@mui/material';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/AddTheater.css'; // Keep original form styling only
import '@styles/AddProductMUI.css'; // MUI form component styles
import '@styles/pages/theater/AddProduct.css'; // Extracted inline styles
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { clearCachePattern } from '@utils/cacheUtils';

// Simple cache utilities (identical to AddTheater)
const getCachedData = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { data, expiry } = JSON.parse(cached);
      if (Date.now() < expiry) {
        return data;
      }
      localStorage.removeItem(key);
    }
  } catch (error) {
  }
  return null;
};

const setCachedData = (key, data, ttl = 5 * 60 * 1000) => {
  try {
    const expiry = Date.now() + ttl;
    localStorage.setItem(key, JSON.stringify({ data, expiry }));
  } catch (error) {
  }
};

// Simple debounce utility (identical to AddTheater)
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// File Upload Skeleton Component (identical to AddTheater)
const FileUploadSkeleton = React.memo(() => (
  <div className="file-upload-skeleton">
    <div className="file-upload-skeleton-content">
      Loading upload area...
    </div>
  </div>
));

// Memoized header button
const HeaderButton = React.memo(({ theaterId }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="header-btn"
      onClick={() => navigate(`/theater-dashboard/${theaterId}`)}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      </span>
      Back to Dashboard
    </button>
  );
});

const AddProduct = React.memo(() => {
  const { theaterId: urlTheaterId } = useParams();
  const { theaterId: authTheaterId, userType, user, isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const modal = useModal();
  const toast = useToast(); // ✅ FIX: Use toast for success/error notifications
  const performanceMetrics = usePerformanceMonitoring('AddProduct');

  // Determine effective theater ID from authentication (following TheaterSettings pattern)
  let effectiveTheaterId = urlTheaterId || authTheaterId;

  // If still no theater ID, try to extract from user data
  if (!effectiveTheaterId && user) {
    if (user.assignedTheater) {
      effectiveTheaterId = user.assignedTheater._id || user.assignedTheater;
    } else if (user.theater) {
      effectiveTheaterId = user.theater._id || user.theater;
    }
  }


  const theaterId = effectiveTheaterId;

  // Redirect to correct URL if theater ID mismatch
  useEffect(() => {
    if (theaterId && urlTheaterId && theaterId !== urlTheaterId) {
      navigate(`/theater-add-product/${theaterId}`, { replace: true });
    }
  }, [theaterId, urlTheaterId, navigate]);

  // Refs for performance optimization
  const abortControllerRef = useRef(null);
  const formRef = useRef(null);
  const validationTimeoutRef = useRef(null);

  // State management - simplified to match backend
  const [formData, setFormData] = useState({
    // Basic Information
    name: '',
    category: '',
    kioskType: '',
    quantity: '',
    noQty: '',
    description: '',
    productCode: '',

    // Pricing Information
    sellingPrice: '',
    costPrice: '',
    discount: '',
    taxRate: '',
    gstType: '',

    // Inventory Management
    lowStockAlert: '',

    // Food Information
    isVeg: '',
    preparationTime: '',
    ingredients: ''
  });

  const [files, setFiles] = useState({
    productImage: null
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Product Names dropdown state
  const [productNames, setProductNames] = useState([]);
  const [loadingProductNames, setLoadingProductNames] = useState(false);

  // Categories dropdown state
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Kiosk Types dropdown state
  const [kioskTypes, setKioskTypes] = useState([]);
  const [loadingKioskTypes, setLoadingKioskTypes] = useState(false);

  // Existing products state - to filter dropdown
  const [existingProducts, setExistingProducts] = useState([]);

  // Product Code field state - disabled by default until product is selected
  const [isProductCodeDisabled, setIsProductCodeDisabled] = useState(true);

  // Quantity field state - disabled by default until product is selected
  const [isQuantityDisabled, setIsQuantityDisabled] = useState(true);

  // No.Qty field state - disabled by default until product is selected
  const [isNoQtyDisabled, setIsNoQtyDisabled] = useState(true);

  // Product Image state management - for auto-filled images from ProductType
  const [productImage, setProductImage] = useState('');
  const [isImageFromProductType, setIsImageFromProductType] = useState(false);

  // Professional Modal States - Following Delete Modal Pattern
  const [validationModal, setValidationModal] = useState({ show: false, message: '' });
  const [unsavedChangesModal, setUnsavedChangesModal] = useState({ show: false });
  const [successModal, setSuccessModal] = useState({ show: false, message: '' });
  const [errorModal, setErrorModal] = useState({ show: false, message: '' });

  useEffect(() => {
    // If no theater ID and user is present, force logout and redirect to login
    if (user && !theaterId) {
      localStorage.clear();
      window.location.href = '/login';
      return;
    }
  }, [theaterId, authTheaterId, urlTheaterId, user]);

  // Load initial data on component mount
  useEffect(() => {
    if (!theaterId) {
      return;
    }

    // Clear any existing form data from localStorage (cleanup)
    const formKey = `addProduct_formData_${theaterId}`;
    localStorage.removeItem(formKey);

    // Clear cached ProductTypes data to always get fresh data
    const productTypesKey = `productTypes_${theaterId}`;
    localStorage.removeItem(productTypesKey);

    // Clear categories cache too
    const categoriesKey = `categories_${theaterId}`;
    localStorage.removeItem(categoriesKey);

    // Clear any existing errors on mount
    setErrors({});

    // Load data sequentially: existing products first, then product names and categories
    const loadInitialData = async () => {
      try {
        // Step 1: Load existing products first and get the array
        const existingProductsArray = await loadExistingProducts();

        // Step 2: Load product names with the existing products array for filtering
        await loadProductNames(existingProductsArray);

        // Step 3: Load categories and kiosk types in parallel (doesn't depend on filtering)
        loadCategories();
        loadKioskTypes();
      } catch (error) {
        // Silent error handling
      }
    };

    loadInitialData();

    // Cleanup function to cancel any pending requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [theaterId]);

  // ✅ FIX: Function to load existing products (to filter dropdown) - Get ALL products for proper filtering
  const loadExistingProducts = useCallback(async () => {
    if (!theaterId) return [];

    try {
      const timestamp = Date.now();
      // Fetch with a large limit to get all existing products for proper filtering
      const response = await unifiedFetch(config.helpers.getApiUrl(`/theater-products/${theaterId}?limit=1000&_t=${timestamp}`), {}, {
        cacheKey: `theater_products_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (!response.ok) {
        console.warn('⚠️ Failed to load existing products for filtering:', response.status);
        return [];
      }

      const data = await response.json();

      // Handle different response structures
      let products = [];

      if (data.success) {
        // Check if products are in data.data.products (paginated response)
        if (data.data?.products && Array.isArray(data.data.products)) {
          products = data.data.products;
        }
        // Check if products are in data.data (direct array)
        else if (data.data && Array.isArray(data.data)) {
          products = data.data;
        }
        // Check if products are in data.products
        else if (data.products && Array.isArray(data.products)) {
          products = data.products;
        }


        // Log product names for debugging
        if (products.length > 0) {
        }

        setExistingProducts(products);
        return products;
      }

      console.warn('⚠️ No products found or invalid response structure:', data);
      return [];
    } catch (error) {
      console.error('❌ Error loading existing products:', error);
      return [];
    }
  }, [theaterId]);

  // Function to load active product names for dropdown
  const loadProductNames = useCallback(async (existingProductsArray = null) => {
    if (!theaterId) return;

    setLoadingProductNames(true);

    try {
      const timestamp = Date.now();
      const response = await unifiedFetch(config.helpers.getApiUrl(`/theater-product-types/${theaterId}?limit=1000&_t=${timestamp}`), {}, {
        cacheKey: `theater_product_types_${theaterId}`,
        cacheTTL: 300000, // 5 minutes
        forceRefresh: false // Allow cache for faster loading
      });

      if (!response.ok) {
        console.error('❌ [loadProductNames] API response not OK:', response.status);
        throw new Error(`Failed to fetch product names: ${response.status}`);
      }

      const data = await response.json();
      console.log('📥 [loadProductNames] API response:', {
        success: data.success,
        hasData: !!data.data,
        dataType: Array.isArray(data.data) ? 'array' : typeof data.data,
        hasProductTypes: !!data.data?.productTypes,
        productTypesType: Array.isArray(data.data?.productTypes) ? 'array' : typeof data.data?.productTypes
      });

      // ✅ FIX: Handle different response structures (same as TheaterProductTypes.jsx)
      if (data.success !== false && (data.success === true || data.data || data.productTypes)) {
        // Handle both data.data (array) and data.data.productTypes (nested) structures
        let productTypesArray = Array.isArray(data.data)
          ? data.data
          : (data.data?.productTypes || data.productTypes || []);

        // Ensure productTypesArray is always an array
        if (!Array.isArray(productTypesArray)) {
          console.warn('⚠️ Product types data is not an array:', productTypesArray);
          productTypesArray = [];
        }

        let activeProductNames = productTypesArray
          .filter(type => type.isActive && type.productName && type.productName.trim())
          .map(type => ({
            id: type._id,
            name: type.productName.trim(),
            code: (type.productCode || '').trim(), // Ensure product code is trimmed
            quantity: type.quantity || '',
            noQty: type.noQty !== undefined ? type.noQty : 1,
            imageUrl: type.image || ''
          }));

        console.log('📋 [loadProductNames] All active product types:', activeProductNames.map(p => ({
          name: p.name,
          code: p.code,
          quantity: p.quantity,
          id: p.id
        })));

        // ✅ VALIDATION: Filter out product names that are already added to this theater's product list
        const productsToCheck = existingProductsArray || existingProducts;

        console.log('🔍 [loadProductNames] Filtering products:', {
          totalProductTypes: activeProductNames.length,
          existingProductsCount: productsToCheck?.length || 0,
          willFilter: !!productsToCheck && productsToCheck.length > 0,
          existingProducts: productsToCheck?.map(p => ({
            name: p.name,
            quantity: p.quantity,
            productCode: p.productCode || p.sku || p.productTypeId?.productCode || 'N/A',
            productTypeId: p.productTypeId?._id || p.productTypeId || 'N/A',
            sku: p.sku || 'N/A'
          })) || []
        });

        // Only filter if we have existing products to check against
        if (productsToCheck && Array.isArray(productsToCheck) && productsToCheck.length > 0) {
          activeProductNames = activeProductNames.filter(productType => {
            // Check if this ProductType already exists in the product list for this theater
            const isAlreadyAdded = productsToCheck.some(existingProduct => {
              // Ensure we have valid product data
              if (!existingProduct || !productType) {
                return false;
              }

              // ✅ FIX: First check if productTypeId matches (most reliable check)
              const existingProductTypeId = existingProduct.productTypeId?._id || existingProduct.productTypeId || null;
              const productTypeId = productType.id || productType._id || null;
              
              if (existingProductTypeId && productTypeId) {
                // Convert both to strings for comparison (handles ObjectId)
                const existingIdStr = existingProductTypeId.toString();
                const productTypeIdStr = productTypeId.toString();
                
                if (existingIdStr === productTypeIdStr) {
                  // Same product type ID = definitely a duplicate
                  console.log('🚫 [loadProductNames] Filtering duplicate by productTypeId:', {
                    productTypeId: productTypeIdStr,
                    name: productType.name
                  });
                  return true;
                }
              }

              // ✅ FIX: If productTypeId doesn't match or isn't available, check name, quantity, AND product code
              const existingName = (existingProduct.name || '').toLowerCase().trim();
              const existingQuantity = (existingProduct.quantity || '').toString().trim();
              
              // Check multiple possible fields for product code in existing products
              // Priority: product.sku > product.productCode > productTypeId.productCode
              // IMPORTANT: Always use the product's own sku first, not the productType's code
              let existingProductCode = '';
              if (existingProduct.sku && existingProduct.sku.trim()) {
                existingProductCode = existingProduct.sku.trim();
              } else if (existingProduct.productCode && existingProduct.productCode.trim()) {
                existingProductCode = existingProduct.productCode.trim();
              } else if (existingProduct.productTypeId) {
                // Only use productTypeId.productCode as last resort if product has no sku
                if (typeof existingProduct.productTypeId === 'object' && existingProduct.productTypeId.productCode) {
                  existingProductCode = existingProduct.productTypeId.productCode.trim();
                }
              }
              existingProductCode = existingProductCode.toUpperCase();
              
              const productTypeName = (productType.name || '').toLowerCase().trim();
              const productTypeQuantity = (productType.quantity || '').toString().trim();
              const productTypeCode = (productType.code || '').toUpperCase().trim();

              if (!existingName || !productTypeName) {
                return false;
              }

              const nameMatch = existingName === productTypeName;

              if (!nameMatch) {
                return false; // Name doesn't match, product is not the same
              }

              // ✅ FIX: Check if quantity also matches
              const quantityMatch = existingQuantity === productTypeQuantity;

              if (!quantityMatch) {
                // Name matches but quantity is different - allow this (same product, different quantity)
                return false;
              }

              // ✅ FIX: If name and quantity match, also check product code
              // CRITICAL: Product codes must match to be considered duplicate
              // If product codes are different (or one is missing), they are different products
              const hasProductTypeCode = productTypeCode && productTypeCode.length > 0;
              const hasExistingProductCode = existingProductCode && existingProductCode.length > 0;
              
              const isDuplicate = (() => {
                if (hasProductTypeCode && hasExistingProductCode) {
                  // Both have product codes - they must match EXACTLY to be considered duplicate
                  const codesMatch = productTypeCode === existingProductCode;
                  if (!codesMatch) {
                    // Different product codes = different products (even with same name/quantity)
                    return false;
                  }
                  // Codes match = duplicate
                  return true;
                } else if (!hasProductTypeCode && !hasExistingProductCode) {
                  // Both don't have codes - if name and quantity match, it's a duplicate
                  return true;
                } else {
                  // One has code, other doesn't - consider them different (not duplicate)
                  // This allows products with codes to coexist with products without codes
                  return false;
                }
              })();

              if (isDuplicate) {
                console.log('🚫 [loadProductNames] Filtering duplicate:', {
                  productType: {
                    name: productTypeName,
                    quantity: productTypeQuantity,
                    code: productTypeCode || 'N/A',
                    id: productTypeId
                  },
                  existing: {
                    name: existingName,
                    quantity: existingQuantity,
                    code: existingProductCode || 'N/A',
                    productTypeId: existingProductTypeId
                  }
                });
              }

              return isDuplicate;
            });

            // Only show products that are NOT already added to this theater
            if (isAlreadyAdded) {
              console.log('🚫 [loadProductNames] Filtering out product type:', {
                name: productType.name,
                code: productType.code,
                quantity: productType.quantity,
                id: productType.id
              });
            }
            return !isAlreadyAdded;
          });

          console.log('✅ [loadProductNames] After filtering:', {
            before: productTypesArray.length,
            after: activeProductNames.length,
            filtered: productTypesArray.length - activeProductNames.length,
            remainingProductTypes: activeProductNames.map(p => ({ 
              name: p.name, 
              code: p.code || 'N/A', 
              quantity: p.quantity || 'N/A',
              id: p.id 
            })),
            filteredOut: productTypesArray
              .filter(type => {
                const mapped = activeProductNames.find(pt => pt.id === type._id);
                return !mapped;
              })
              .map(type => ({
                name: type.productName,
                code: type.productCode || 'N/A',
                quantity: type.quantity || 'N/A',
                id: type._id
              }))
          });
        } else {
        }

        console.log('✅ [loadProductNames] Final product names:', {
          total: activeProductNames.length,
          names: activeProductNames.map(p => p.name)
        });
        setProductNames(activeProductNames);
      } else {
        console.warn('⚠️ [loadProductNames] No valid data in response:', data);
        setProductNames([]);
      }
    } catch (error) {
      console.error('❌ Error loading product names:', error);
      setProductNames([]);
    } finally {
      setLoadingProductNames(false);
    }
  }, [theaterId, existingProducts]);

  // Function to load active categories for dropdown
  const loadCategories = useCallback(async () => {
    if (!theaterId) return;

    setLoadingCategories(true);

    try {
      const timestamp = Date.now();
      const response = await unifiedFetch(config.helpers.getApiUrl(`/theater-categories/${theaterId}?limit=100&_t=${timestamp}`), {}, {
        cacheKey: `theater_categories_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data?.categories) {
        const activeCategories = data.data.categories
          .filter(category => category.categoryName && category.categoryName.trim())
          .map(category => ({
            id: category._id,
            name: category.categoryName.trim(),
            description: category.description || ''
          }));

        setCategories(activeCategories);
      } else {
        setCategories([]);
      }
    } catch (error) {
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  }, [theaterId]);

  // Function to load active kiosk types for dropdown
  const loadKioskTypes = useCallback(async () => {
    if (!theaterId) return;

    setLoadingKioskTypes(true);

    try {
      const timestamp = Date.now();
      const response = await unifiedFetch(config.helpers.getApiUrl(`/theater-kiosk-types/${theaterId}?limit=100&_t=${timestamp}`), {}, {
        cacheKey: `theater_kiosk_types_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      // unifiedFetch might not have response.ok, so check for errors in data
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse kiosk types response:', parseError);
        setKioskTypes([]);
        setLoadingKioskTypes(false);
        return;
      }

      // Check for API errors
      if (data.error || data.success === false) {
        console.warn('Kiosk types API error:', data.error || data.message);
        setKioskTypes([]);
        setLoadingKioskTypes(false);
        return;
      }

      // ✅ FIX: Handle different response structures - API returns data.data.kioskTypes
      let kioskTypesArray = [];

      // Priority 1: Check data.data.kioskTypes (standard API response)
      if (data.success !== false && data.data?.kioskTypes && Array.isArray(data.data.kioskTypes)) {
        kioskTypesArray = data.data.kioskTypes;
      }
      // Priority 2: Check if data.data is directly an array
      else if (data.success !== false && data.data && Array.isArray(data.data)) {
        kioskTypesArray = data.data;
      }
      // Priority 3: Check if kioskTypes is at root level
      else if (data.kioskTypes && Array.isArray(data.kioskTypes)) {
        kioskTypesArray = data.kioskTypes;
      }
      // Priority 4: Check if data itself is an array
      else if (Array.isArray(data)) {
        kioskTypesArray = data;
      }

      console.log('📦 Kiosk types loaded:', {
        total: kioskTypesArray.length,
        rawData: data,
        kioskTypesArray: kioskTypesArray
      });

      if (kioskTypesArray.length > 0) {
        // Filter active kiosk types and map to dropdown format
        const activeKioskTypes = kioskTypesArray
          .filter(kt => {
            // Include if isActive is true, undefined, or not explicitly false
            const isActive = kt.isActive !== false;
            const hasName = kt.name && kt.name.trim();
            return isActive && hasName;
          })
          .map(kt => ({
            id: kt._id || kt.id || kt._id?.toString() || kt.id?.toString(),
            name: (kt.name || '').trim()
          }))
          .filter(kt => kt.id && kt.name); // Remove any invalid entries

        setKioskTypes(activeKioskTypes);
      } else {
        console.warn('⚠️ No kiosk types found in response');
        setKioskTypes([]);
      }
    } catch (error) {
      console.error('❌ Error loading kiosk types:', error);
      setKioskTypes([]);
    } finally {
      setLoadingKioskTypes(false);
    }
  }, [theaterId]);

  // Memoized validation rules
  const validationRules = useMemo(() => ({
    name: /^.{2,100}$/,
    sellingPrice: /^\d+(\.\d{1,2})?$/,
    stockQuantity: /^\d+$/,
    productCode: /^[A-Za-z0-9_-]*$/
  }), []);

  // Enhanced form validation status
  const formValidationStatus = useMemo(() => {
    const requiredFields = ['name', 'sellingPrice', 'isVeg'];

    // Check each required field more thoroughly
    const fieldValidation = requiredFields.map(field => {
      const value = formData[field];
      let isValid = false;
      let isEmpty = false;

      if (value === undefined || value === null || value === '') {
        isEmpty = true;
      } else {
        // Additional validation for specific fields
        switch (field) {
          case 'name':
            // Must be selected from dropdown and exist in productNames
            isValid = productNames.some(product => product.name === value);
            break;
          case 'sellingPrice':
            // Must be a valid price
            isValid = validationRules.sellingPrice.test(value) && parseFloat(value) > 0;
            break;
          case 'isVeg':
            // Must be true or false
            isValid = value === 'true' || value === 'false' || value === true || value === false;
            break;
          default:
            isValid = true;
        }
      }

      return { field, value, isValid, isEmpty };
    });

    const hasAllRequired = fieldValidation.every(f => !f.isEmpty && f.isValid);
    const actualErrorCount = Object.keys(errors).filter(key => errors[key] && errors[key].trim()).length;
    const validFieldsCount = fieldValidation.filter(f => !f.isEmpty && f.isValid).length;

    return {
      isValid: hasAllRequired && actualErrorCount === 0,
      completionPercentage: Math.round((validFieldsCount / requiredFields.length) * 100),
      hasFiles: Object.values(files).some(file => file !== null),
      totalErrors: actualErrorCount,
      fieldStatus: fieldValidation.reduce((acc, f) => {
        acc[f.field] = { isValid: f.isValid, isEmpty: f.isEmpty };
        return acc;
      }, {})
    };
  }, [formData, errors, files, productNames, validationRules]);

  // Memoized file upload status
  const uploadStatus = useMemo(() => {
    const totalFiles = Object.keys(files).length;
    const uploadedFiles = Object.values(files).filter(file => file !== null).length;
    const inProgress = Object.values(uploadProgress).some(progress => progress > 0 && progress < 100);

    return {
      totalFiles,
      uploadedFiles,
      inProgress,
      percentage: totalFiles > 0 ? Math.round((uploadedFiles / totalFiles) * 100) : 0
    };
  }, [files, uploadProgress]);

  // Optimized input change handler with useCallback
  const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;

    let newFormData = {
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    };

    // AUTO-POPULATE PRODUCT CODE AND QUANTITY when product name is selected
    if (name === 'name' && value) {
      // ✅ FIX: Parse value - it may be in format "id:name" or just "name"
      let productNameToFind = value;
      if (typeof value === 'string' && value.includes(':')) {
        // Extract name from "id:name" format
        productNameToFind = value.split(':').slice(1).join(':'); // Handle names that might contain ':'
      }

      // Find the selected product in productNames array
      const selectedProduct = productNames.find(product => product.name === productNameToFind);

      // Update formData with the actual product name (not the id:name format)
      if (selectedProduct) {
        newFormData.name = selectedProduct.name;
      }

      if (selectedProduct) {
        // Handle Product Code auto-fill
        if (selectedProduct.code) {
          newFormData.productCode = selectedProduct.code;
          setIsProductCodeDisabled(true);
        } else {
          newFormData.productCode = '';
          setIsProductCodeDisabled(false);
        }

        // Handle Quantity - Auto-fill from template (user can modify)
        if (selectedProduct.quantity) {
          newFormData.quantity = selectedProduct.quantity;
          setIsQuantityDisabled(false); // Keep enabled so user can change
        } else {
          newFormData.quantity = '';
          setIsQuantityDisabled(false);
        }

        // Handle No.Qty - Auto-fill from template (keep disabled like quantity)
        if (selectedProduct.noQty !== undefined) {
          newFormData.noQty = selectedProduct.noQty;
          setIsNoQtyDisabled(true); // Keep disabled like quantity field
        } else {
          newFormData.noQty = 1;
          setIsNoQtyDisabled(true);
        }

        // Handle Product Image auto-fill from ProductType

        if (selectedProduct.imageUrl) {
          setProductImage(selectedProduct.imageUrl);
          setIsImageFromProductType(true);
        } else {
          setProductImage('');
          setIsImageFromProductType(false);
        }



        // Clear any existing errors for auto-filled fields
        if (errors.productCode || errors.quantity || errors.noQty) {
          setErrors(prev => {
            const newErrors = { ...prev };
            if (selectedProduct.code) delete newErrors.productCode;
            if (selectedProduct.quantity) delete newErrors.quantity;
            if (selectedProduct.noQty !== undefined) delete newErrors.noQty;
            return newErrors;
          });
        }
      } else {
        // No matching product - enable product code for manual entry, but keep quantity and noQty disabled
        newFormData.productCode = '';
        newFormData.quantity = '';
        newFormData.noQty = '';
        setIsProductCodeDisabled(false);
        setIsQuantityDisabled(true); // Keep disabled like quantity field
        setIsNoQtyDisabled(true); // Keep disabled like quantity field
        setProductImage('');
        setIsImageFromProductType(false);
      }
    } else if (name === 'name' && !value) {
      // If product name is cleared, disable both fields and clear them, reset image
      setIsProductCodeDisabled(true);
      setIsQuantityDisabled(true);
      setIsNoQtyDisabled(true);
      newFormData.productCode = '';
      newFormData.quantity = '';
      newFormData.noQty = '';
      setProductImage('');
      setIsImageFromProductType(false);
    }

    setFormData(newFormData);

    // Clear specific field error when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // Debounced validation for real-time feedback
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      validateField(name, type === 'checkbox' ? checked : value);
    }, 300);
  }, [errors, formData, productNames]);

  // Enhanced field validation with better error messages
  const validateField = useCallback((name, value) => {
    let error = '';

    switch (name) {
      case 'name':
        if (!value || value.trim() === '') {
          error = 'Please select a product name from the dropdown';
        } else {
          // ✅ FIX: Parse value - it may be in format "id:name" or just "name"
          let productNameToValidate = value;
          if (typeof value === 'string' && value.includes(':')) {
            // Extract name from "id:name" format
            productNameToValidate = value.split(':').slice(1).join(':'); // Handle names that might contain ':'
          }

          if (productNameToValidate.trim().length < 2) {
            error = 'Product name must be at least 2 characters long';
          } else {
            // ✅ VALIDATION: Check if the selected product name exists in available options
            const validOption = productNames.find(product => product.name === productNameToValidate);
            if (!validOption) {
              error = 'Please select a valid product name from the dropdown list';
            } else {
              // ✅ ADDITIONAL VALIDATION: Double-check if product is already saved in Product List
              // ✅ FIX: Validate by name, quantity, AND product code
              const selectedProduct = productNames.find(product => product.name === productNameToValidate);
              const selectedQuantity = selectedProduct?.quantity || '';
              const selectedCode = (selectedProduct?.code || formData.productCode || '').toUpperCase().trim();

              const isAlreadySaved = existingProducts.some(existingProduct => {
                const existingName = (existingProduct.name || '').toLowerCase().trim();
                const existingQuantity = (existingProduct.quantity || '').toString().trim();
                const existingCode = (
                  existingProduct.sku || 
                  existingProduct.productCode || 
                  existingProduct.productTypeId?.productCode || 
                  ''
                ).toUpperCase().trim();
                
                const selectedName = (productNameToValidate || '').toLowerCase().trim();
                const selectedQty = (selectedQuantity || '').toString().trim();

                // Match only if name, quantity, AND product code are the same
                const nameMatch = existingName === selectedName && existingName !== '';
                const quantityMatch = existingQuantity === selectedQty;
                const hasSelectedCode = selectedCode && selectedCode.length > 0;
                const hasExistingCode = existingCode && existingCode.length > 0;
                
                let codeMatch = false;
                if (hasSelectedCode && hasExistingCode) {
                  codeMatch = selectedCode === existingCode;
                } else if (!hasSelectedCode && !hasExistingCode) {
                  codeMatch = true; // Both don't have codes
                } else {
                  codeMatch = false; // One has code, other doesn't
                }

                return nameMatch && quantityMatch && codeMatch;
              });

              if (isAlreadySaved) {
                error = 'This product with the same name, quantity, and product code is already saved in your Product List. Please select a different product.';
              }
            }
          }
        }
        break;
      case 'sellingPrice':
        if (!value || value.trim() === '') {
          error = 'Selling price is required';
        } else if (!validationRules.sellingPrice.test(value)) {
          error = 'Please enter a valid selling price (numbers and up to 2 decimal places)';
        } else if (parseFloat(value) <= 0) {
          error = 'Selling price must be greater than 0';
        }
        break;
      case 'stockQuantity':
        if (value !== '' && !validationRules.stockQuantity.test(value)) {
          error = 'Stock quantity must be a whole number';
        } else if (value !== '' && parseInt(value) < 0) {
          error = 'Stock quantity cannot be negative';
        }
        break;
      case 'productCode':
        if (value && !validationRules.productCode.test(value)) {
          error = 'Product code can only contain letters, numbers, hyphens and underscores';
        }
        break;
      case 'isVeg':
        if (value === '' || value === undefined || value === null) {
          error = 'Please select if the product is vegetarian or non-vegetarian';
        }
        break;
      case 'category':
        // Category is optional, but if provided, validate it exists
        if (value && value.trim() !== '') {
          const validCategory = categories.find(cat => cat.name === value);
          if (!validCategory) {
            error = 'Please select a valid category from the dropdown list';
          }
        }
        break;
      default:
        if (value === '' && ['name', 'sellingPrice', 'isVeg'].includes(name)) {
          const fieldDisplayNames = {
            name: 'Product Name',
            sellingPrice: 'Selling Price',
            isVeg: 'Vegetarian/Non-Vegetarian'
          };
          error = `${fieldDisplayNames[name] || name} is required`;
        }
    }

    if (error) {
      setErrors(prev => ({
        ...prev,
        [name]: error
      }));
    } else {
      // Clear the error if validation passes
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [validationRules, productNames, categories, existingProducts]);

  // Optimized file change handler
  const handleFileChange = useCallback((e) => {
    const { name, files: fileList } = e.target;
    const file = fileList[0];

    // File validation
    if (file) {
      const maxSize = 5 * 1024 * 1024; // 5MB
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

      if (!allowedTypes.includes(file.type)) {
        setErrors(prev => ({
          ...prev,
          [name]: 'Please select a valid image file (JPEG, PNG, WebP)'
        }));
        return;
      }

      if (file.size > maxSize) {
        setErrors(prev => ({
          ...prev,
          [name]: 'File size must be less than 5MB'
        }));
        return;
      }

      // Clear any existing error
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });

      // Set the file
      setFiles(prev => ({
        ...prev,
        [name]: file
      }));
    }
  }, []);

  // Handle file removal
  const handleFileRemove = useCallback((fileName) => {
    setFiles(prev => ({
      ...prev,
      [fileName]: null
    }));

    // Clear upload progress
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });

    // Clear any file errors
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fileName];
      return newErrors;
    });

    // Reset the file input
    const fileInput = document.getElementById(fileName);
    if (fileInput) {
      fileInput.value = '';
    }
  }, []);

  // File upload function with progress tracking - NOW USES GCS ONLY
  const uploadFile = useCallback(async (file, fieldName) => {
    if (!file) return null;

    const uploadFormData = new FormData();
    uploadFormData.append('image', file);
    uploadFormData.append('theaterId', theaterId);
    uploadFormData.append('productName', formData.name || 'unnamed-product');

    try {
      setUploadProgress(prev => ({ ...prev, [fieldName]: 0 }));

      // Use the new product-image endpoint with structured folders
      // unifiedFetch automatically handles FormData
      const response = await unifiedFetch(config.helpers.getApiUrl('/upload/product-image'), {
        method: 'POST',
        body: uploadFormData
        // Token is automatically added by unifiedFetch
      }, {
        forceRefresh: true, // Don't cache file uploads
        cacheTTL: 0
      });

      if (!response.ok) {
        setUploadProgress(prev => ({ ...prev, [fieldName]: -1 }));
        const errorData = await response.json();
        throw new Error(errorData.message || `Upload failed with status ${response.status}`);
      }

      const data = await response.json();

      // Check if we have the expected response structure
      if (!data.data?.publicUrl) {
        setUploadProgress(prev => ({ ...prev, [fieldName]: -1 }));
        throw new Error('Invalid response: missing publicUrl in upload response');
      }

      setUploadProgress(prev => ({ ...prev, [fieldName]: 100 }));

      // Return the GCS public URL instead of local path
      return data.data.publicUrl;
    } catch (error) {
      setUploadProgress(prev => ({ ...prev, [fieldName]: -1 }));

      // Show user-friendly error message
      setErrorModal({
        show: true,
        message: `Failed to upload ${fieldName}: ${error.message}`
      });

      throw error;
    }
  }, []);

  // Form submission handler
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!formValidationStatus.isValid) {
      setValidationModal({
        show: true,
        message: 'Please fill in all required fields and fix any errors before submitting.'
      });
      return;
    }

    // ✅ ADDITIONAL VALIDATION: Double-check if product is already saved (prevent race conditions)
    // ✅ FIX: Parse value - it may be in format "id:name" or just "name"
    let selectedProductName = formData.name?.trim();
    if (selectedProductName && selectedProductName.includes(':')) {
      // Extract name from "id:name" format
      selectedProductName = selectedProductName.split(':').slice(1).join(':'); // Handle names that might contain ':'
    }

    if (selectedProductName) {
      // ✅ FIX: Validate by name, quantity, AND product code
      const selectedProduct = productNames.find(product => product.name === selectedProductName);
      const selectedQuantity = selectedProduct?.quantity || formData.quantity || '';
      const selectedCode = (selectedProduct?.code || formData.productCode || '').toUpperCase().trim();

      const isAlreadySaved = existingProducts.some(existingProduct => {
        const existingName = (existingProduct.name || '').toLowerCase().trim();
        const existingQuantity = (existingProduct.quantity || '').toString().trim();
        const existingCode = (
          existingProduct.sku || 
          existingProduct.productCode || 
          existingProduct.productTypeId?.productCode || 
          ''
        ).toUpperCase().trim();
        
        const selectedName = selectedProductName.toLowerCase().trim();
        const selectedQty = (selectedQuantity || '').toString().trim();

        // Match only if name, quantity, AND product code are the same
        const nameMatch = existingName === selectedName && existingName !== '';
        const quantityMatch = existingQuantity === selectedQty;
        const hasSelectedCode = selectedCode && selectedCode.length > 0;
        const hasExistingCode = existingCode && existingCode.length > 0;
        
        let codeMatch = false;
        if (hasSelectedCode && hasExistingCode) {
          codeMatch = selectedCode === existingCode;
        } else if (!hasSelectedCode && !hasExistingCode) {
          codeMatch = true; // Both don't have codes
        } else {
          codeMatch = false; // One has code, other doesn't
        }

        return nameMatch && quantityMatch && codeMatch;
      });

      if (isAlreadySaved) {
        const codeDisplay = selectedCode ? ` with product code "${selectedCode}"` : '';
        setValidationModal({
          show: true,
          message: `"${selectedProductName}" with quantity "${selectedQuantity}"${codeDisplay} is already saved in your Product List. Please select a different product from the dropdown.`
        });
        // Clear the selected product name to force user to select again
        setFormData(prev => ({ ...prev, name: '' }));
        setIsProductCodeDisabled(true);
        setIsQuantityDisabled(true);
        setProductImage('');
        setIsImageFromProductType(false);
        return;
      }
    }

    setIsSubmitting(true);
    setLoading(true);

    try {

      // Handle product image - auto-filled or uploaded
      let finalImageUrl = null;
      if (isImageFromProductType && productImage) {
        // Use auto-filled image from ProductType
        finalImageUrl = productImage;
      } else if (files.productImage) {
        // Upload new image file
        finalImageUrl = await uploadFile(files.productImage, 'productImage');
      }

      // Find the selected ProductType to get its ID for proper referencing
      // ✅ FIX: Parse value - it may be in format "id:name" or just "name"
      let productNameToFind = formData.name;
      if (typeof formData.name === 'string' && formData.name.includes(':')) {
        // Extract name from "id:name" format
        productNameToFind = formData.name.split(':').slice(1).join(':'); // Handle names that might contain ':'
      }
      const selectedProduct = productNames.find(product => product.name === productNameToFind);

      // Find the selected Category to get its ID
      const selectedCategory = categories.find(cat => cat.name === formData.category);

      if (!selectedCategory) {
        throw new Error('Please select a valid category');
      }

      // Find the selected KioskType to get its ID
      // formData.kioskType contains the ID (from Select value={kioskType.id})
      const selectedKioskType = kioskTypes.find(kt => kt.id === formData.kioskType || kt.name === formData.kioskType);


      // ✅ FIX: Prepare product data matching backend schema - ALL FIELDS INCLUDED
      // ✅ FIX: Use the parsed product name (not the id:name format)
      const productData = {
        name: productNameToFind || formData.name,
        description: formData.description || '',
        categoryId: selectedCategory.id, // Backend expects categoryId as ObjectId
        kioskType: selectedKioskType ? selectedKioskType.id : null, // Send kioskType ID (or null if not selected)
        productTypeId: selectedProduct ? selectedProduct.id : null, // Backend expects productTypeId
        sku: formData.productCode || '', // Map productCode to sku
        quantity: formData.quantity || '', // Send quantity (e.g., "150ML")
        noQty: formData.noQty !== undefined ? formData.noQty : 1, // Send noQty (Number of Quantity)
        pricing: {
          // ✅ FIX: Ensure numeric values are properly parsed and validated
          basePrice: formData.sellingPrice ? parseFloat(formData.sellingPrice) || 0 : 0,
          salePrice: formData.costPrice ? (parseFloat(formData.costPrice) || parseFloat(formData.sellingPrice) || 0) : (parseFloat(formData.sellingPrice) || 0),
          discountPercentage: formData.discount ? (parseFloat(formData.discount) || 0) : 0,
          taxRate: formData.taxRate ? (parseFloat(formData.taxRate) || 0) : 0,
          gstType: formData.gstType || 'EXCLUDE'
        },
        inventory: {
          trackStock: true,
          currentStock: 0, // Don't use quantity as stock - use stock management page
          minStock: formData.lowStockAlert ? parseInt(formData.lowStockAlert) || 5 : 5,
          maxStock: 1000
        },
        images: finalImageUrl ? [finalImageUrl] : [], // Backend expects array of URL strings
        specifications: {
          ingredients: formData.ingredients ? formData.ingredients.split(',').map(i => i.trim()).filter(i => i) : [],
          preparationTime: formData.preparationTime ? parseInt(formData.preparationTime) || null : null,
          // Ensure empty arrays/objects are handled properly
          allergens: [],
          nutritionalInfo: {}
        },
        // ✅ FIX: Include isVeg field
        isVeg: formData.isVeg === 'true' ? true : (formData.isVeg === 'false' ? false : undefined),
        // ✅ FIX: Include tags based on isVeg
        tags: formData.isVeg === 'true' ? ['veg'] : (formData.isVeg === 'false' ? ['non-veg'] : []),
        isActive: true,
        status: 'active'
      };

      // ✅ FIX: Log ALL fields being sent

      // Submit product data with abort controller
      abortControllerRef.current = new AbortController();

      let response;
      let result;

      try {
        response = await unifiedFetch(config.helpers.getApiUrl(`/theater-products/${theaterId}`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(productData),
          signal: abortControllerRef.current.signal
        }, {
          forceRefresh: true, // Don't cache POST requests
          cacheTTL: 0
        });

        // ✅ FIX: unifiedFetch might throw an error even on success, so check response.ok first
        if (response && response.ok !== false) {
          try {
            result = await response.json();
          } catch (parseError) {
            // If response is not JSON, it might be text
            const text = await response.text();
            if (text && text.toLowerCase().includes('success')) {
              // Success message in text format
              result = { success: true, message: text };
            } else {
              throw new Error(text || 'Failed to create product');
            }
          }
        } else {
          // Response might not have ok property, try to get result anyway
          try {
            result = await response.json();
          } catch (e) {
            throw new Error('Failed to create product');
          }
        }
      } catch (fetchError) {
        // ✅ FIX: Check if error message contains success (unifiedFetch might throw success as error)
        const errorMessage = fetchError?.message || fetchError?.toString() || 'Failed to create product';

        if (errorMessage.toLowerCase().includes('success') ||
          errorMessage.toLowerCase().includes('created successfully') ||
          errorMessage.toLowerCase().includes('added successfully')) {
          // This is actually a success, not an error
          result = { success: true, message: errorMessage };
        } else {
          // Real error, re-throw it
          throw fetchError;
        }
      }

      // ✅ FIX: Check if response indicates success
      // Backend returns { success: true, message: 'Product created successfully', data: {...} }
      if (result && (result.success === false || (result.error && !result.success))) {
        throw new Error(result.message || result.error || 'Failed to create product');
      }

      // ✅ FIX: If we don't have a result yet, it means unifiedFetch succeeded but didn't return JSON
      if (!result) {
        result = { success: true, message: 'Product created successfully' };
      }

      // Reset form
      setFormData({
        name: '',
        category: '',
        kioskType: '',
        quantity: '',
        description: '',
        productCode: '',
        sellingPrice: '',
        costPrice: '',
        discount: '',
        taxRate: '',
        gstType: '',
        lowStockAlert: '',
        isVeg: '',
        preparationTime: '',
        ingredients: ''
      });

      // Reset both product code and quantity disabled states to default (disabled)
      setIsProductCodeDisabled(true);
      setIsQuantityDisabled(true);
      setFiles({
        productImage: null
      });
      setErrors({});

      // ✅ Refresh product list to exclude newly added product from dropdown
      try {
        const updatedProducts = await loadExistingProducts();
        await loadProductNames(updatedProducts);
      } catch (refreshError) {
        console.warn('⚠️ Failed to refresh product list:', refreshError);
      }

      // 🚀 CACHE INVALIDATION: Clear product list cache so Product Stock page shows new product immediately
      try {
        // Clear all product list caches for this theater (all pages, all search terms)
        clearCachePattern(`products_${theaterId}`);
      } catch (cacheError) {
        console.warn('⚠️ Failed to clear product cache:', cacheError);
      }

      // ✅ FIX: Use toast notification for success (like other pages) instead of modal
      toast.success(result.message || 'Product created successfully!', 3000);

      // ✅ FIX: Navigate back after a short delay to show the toast
      setTimeout(() => {
        navigate(`/theater-products/${theaterId}`);
      }, 500);

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      // ✅ FIX: Check if error message contains success (shouldn't happen, but just in case)
      const errorMessage = error?.message || error?.toString() || 'Failed to add product. Please try again.';

      if (errorMessage.toLowerCase().includes('success') ||
        errorMessage.toLowerCase().includes('created successfully')) {
        // This is actually a success, show success toast
        toast.success(errorMessage, 3000);
        setTimeout(() => {
          navigate(`/theater-products/${theaterId}`);
        }, 500);
      } else {
        // Real error, show error toast
        toast.error(errorMessage, 5000);
      }
    } finally {
      setLoading(false);
      setIsSubmitting(false);
      setUploadProgress({});
    }
  }, [formData, files, isSubmitting, uploadFile, navigate, theaterId, loadExistingProducts, loadProductNames, existingProducts, formValidationStatus]);

  const handleCancel = useCallback(() => {
    // Check if form has unsaved changes
    const hasChanges = Object.values(formData).some(value => value !== '' && value !== false) ||
      Object.values(files).some(file => file !== null);

    if (hasChanges) {
      setUnsavedChangesModal({ show: true });
    } else {
      navigate(`/theater-products/${theaterId}`);
    }
  }, [formData, files, navigate, theaterId]);

  // Professional Modal Handlers - Following Delete Modal Pattern
  const handleConfirmUnsavedChanges = useCallback(() => {
    setUnsavedChangesModal({ show: false });
    navigate(`/theater-products/${theaterId}`);
  }, [navigate, theaterId]);

  const handleSuccessModalClose = useCallback(() => {
    setSuccessModal({ show: false, message: '' });
    navigate(`/theater-products/${theaterId}`);
  }, [navigate, theaterId]);

  const headerButton = <HeaderButton theaterId={theaterId} />;

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Add New Product" currentPage="add-product">
        <PageContainer
          title="Add New Product"
          headerButton={headerButton}
        >
          {/* Auth Loading State */}
          {authLoading && (
            <div className="loading-auth-container">
              <div className="loading-auth-spinner"></div>
              <p className="loading-auth-text">Loading authentication...</p>
            </div>
          )}

          {/* Main Form Content */}
          {!authLoading && (
            <form onSubmit={handleSubmit} className="add-theater-form" ref={formRef}>
              {/* Basic Information */}
              <div className="form-section mui-form-section">
                <h2>Basic Information</h2>
                <div className="form-grid mui-form-grid">
                  <Box className="mui-form-group">
                    <FormControl fullWidth error={!!errors.name} required>
                      <InputLabel id="name-label" shrink={!!formData.name}>Product Name *</InputLabel>
                      <Select
                        labelId="name-label"
                        id="name"
                        name="name"
                        value={(() => {
                          // ✅ FIX: Convert stored name to id:name format for proper matching
                          if (!formData.name) return '';
                          const foundProduct = productNames.find(p => p.name === formData.name);
                          if (foundProduct) {
                            return `${foundProduct.id}:${foundProduct.name}`;
                          }
                          // Fallback: if product not found in list, return as-is (for edit mode or edge cases)
                          return formData.name;
                        })()}
                        onChange={handleInputChange}
                        label="Product Name *"
                        disabled={loadingProductNames}
                        displayEmpty
                        notched={!!formData.name}
                        MenuProps={{
                          PaperProps: {
                            style: {
                              maxHeight: 300,
                              overflowY: 'auto',
                              overflowX: 'hidden'
                            }
                          },
                          anchorOrigin: {
                            vertical: 'bottom',
                            horizontal: 'left'
                          },
                          transformOrigin: {
                            vertical: 'top',
                            horizontal: 'left'
                          },
                          getContentAnchorEl: null
                        }}
                        renderValue={(selected) => {
                          if (!selected) {
                            return <span className="select-placeholder"></span>;
                          }
                          // ✅ FIX: Parse value - it may be in format "id:name" or just "name"
                          let productNameToFind = selected;
                          if (typeof selected === 'string' && selected.includes(':')) {
                            // Extract name from "id:name" format
                            productNameToFind = selected.split(':').slice(1).join(':'); // Handle names that might contain ':'
                          }

                          // Find the selected product to get its quantity
                          const selectedProduct = productNames.find(p => p.name === productNameToFind);

                          // ✅ VALIDATION: Check if selected product is already saved
                          // ✅ FIX: Validate by name, quantity, AND product code
                          const selectedQty = selectedProduct?.quantity || '';
                          const selectedCode = (selectedProduct?.code || '').toUpperCase().trim();
                          const isAlreadySaved = existingProducts.some(existingProduct => {
                            const existingName = (existingProduct.name || '').toLowerCase().trim();
                            const existingQuantity = (existingProduct.quantity || '').toString().trim();
                            const existingCode = (
                              existingProduct.sku || 
                              existingProduct.productCode || 
                              existingProduct.productTypeId?.productCode || 
                              ''
                            ).toUpperCase().trim();
                            
                            const selectedName = (selectedProduct?.name || productNameToFind || '').toLowerCase().trim();
                            const selectedQuantity = (selectedQty || '').toString().trim();

                            // Match only if name, quantity, AND product code are the same
                            const nameMatch = existingName === selectedName && existingName !== '';
                            const quantityMatch = existingQuantity === selectedQuantity;
                            const codeMatch = selectedCode && existingCode ? selectedCode === existingCode : (!selectedCode && !existingCode);
                            
                            return nameMatch && quantityMatch && codeMatch;
                          });
                          if (isAlreadySaved) {
                            return <span className="select-warning">⚠️ Already Saved - Select Different</span>;
                          }
                          const displayName = selectedProduct?.name || productNameToFind;
                          const quantity = selectedProduct?.quantity ? ` (${selectedProduct.quantity})` : '';
                          return <span className="select-value">{displayName}{quantity}</span>;
                        }}
                      >
                        <MenuItem value="">
                          <em>{loadingProductNames ? 'Loading product names...' : 'Select Product Name...'}</em>
                        </MenuItem>
                        {productNames.length === 0 && !loadingProductNames ? (
                          <MenuItem value="" disabled>
                            <em className="select-error-text">
                              ⚠️ No available products
                            </em>
                          </MenuItem>
                        ) : (
                          productNames.map((productName, index) => {
                            // ✅ VALIDATION: Double-check if this product is already saved (prevent stale data)
                            // ✅ FIX: Validate by name, quantity, AND product code
                            const productTypeQuantity = (productName.quantity || '').toString().trim();
                            const productTypeCode = (productName.code || '').toUpperCase().trim();
                            const isAlreadySaved = existingProducts.some(existingProduct => {
                              const existingName = (existingProduct.name || '').toLowerCase().trim();
                              const existingQuantity = (existingProduct.quantity || '').toString().trim();
                              const existingCode = (
                                existingProduct.sku || 
                                existingProduct.productCode || 
                                existingProduct.productTypeId?.productCode || 
                                ''
                              ).toUpperCase().trim();
                              const productTypeName = (productName.name || '').toLowerCase().trim();

                              // Match only if name, quantity, AND product code are the same
                              const nameMatch = existingName === productTypeName && existingName !== '';
                              const quantityMatch = existingQuantity === productTypeQuantity;
                              const hasProductTypeCode = productTypeCode && productTypeCode.length > 0;
                              const hasExistingCode = existingCode && existingCode.length > 0;
                              
                              let codeMatch = false;
                              if (hasProductTypeCode && hasExistingCode) {
                                codeMatch = productTypeCode === existingCode;
                              } else if (!hasProductTypeCode && !hasExistingCode) {
                                codeMatch = true; // Both don't have codes
                              } else {
                                codeMatch = false; // One has code, other doesn't
                              }

                              return nameMatch && quantityMatch && codeMatch;
                            });

                            if (isAlreadySaved) {
                              return null; // Don't render already-saved products
                            }

                            // ✅ FIX: Use unique identifier to prevent multiple items from being highlighted
                            // Combine ID and name to ensure uniqueness even if names are duplicate
                            const uniqueValue = `${productName.id}:${productName.name}`;
                            const displayQuantity = productName.quantity ? ` (${productName.quantity})` : '';

                            return (
                              <MenuItem key={`${productName.id}-${index}`} value={uniqueValue}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                  <span>{productName.name}</span>
                                  {productName.quantity && (
                                    <span style={{ color: '#6b7280', fontSize: '0.875rem', marginLeft: '8px' }}>
                                      {productName.quantity}
                                    </span>
                                  )}
                                </div>
                              </MenuItem>
                            );
                          }).filter(Boolean) // Remove null entries
                        )}
                      </Select>
                      {errors.name && <FormHelperText>{errors.name}</FormHelperText>}
                    </FormControl>
                  </Box>

                  <Box className="mui-form-group">
                    <FormControl fullWidth>
                      <InputLabel id="category-label" shrink={!!formData.category}>Category</InputLabel>
                      <Select
                        labelId="category-label"
                        id="category"
                        name="category"
                        value={formData.category || ''}
                        onChange={handleInputChange}
                        label="Category"
                        disabled={loadingCategories}
                        displayEmpty
                        notched={!!formData.category}
                        renderValue={(selected) => {
                          if (!selected) {
                            return <span className="select-placeholder"></span>;
                          }
                          const selectedCat = categories.find(c => c.name === selected);
                          return <span className="select-value">{selectedCat ? selectedCat.name : selected}</span>;
                        }}
                      >
                        <MenuItem value="">
                          <em>{loadingCategories ? 'Loading categories...' : 'Select category...'}</em>
                        </MenuItem>
                        {categories.map((category) => (
                          <MenuItem key={category.id} value={category.name}>
                            {category.name} {category.description ? `- ${category.description}` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  <Box className="mui-form-group">
                    <FormControl fullWidth>
                      <InputLabel id="kioskType-label" shrink={!!formData.kioskType}>Kiosk Type</InputLabel>
                      <Select
                        labelId="kioskType-label"
                        id="kioskType"
                        name="kioskType"
                        value={formData.kioskType || ''}
                        onChange={handleInputChange}
                        label="Kiosk Type"
                        disabled={loadingKioskTypes}
                        displayEmpty
                        notched={!!formData.kioskType}
                        renderValue={(selected) => {
                          if (!selected) {
                            return <span className="select-placeholder"></span>;
                          }
                          const selectedKiosk = kioskTypes.find(k => k.id === selected);
                          return <span className="select-value">{selectedKiosk ? selectedKiosk.name : selected}</span>;
                        }}
                      >
                        <MenuItem value="">
                          <em>{loadingKioskTypes ? 'Loading kiosk types...' : 'Select kiosk type...'}</em>
                        </MenuItem>
                        {kioskTypes.length === 0 && !loadingKioskTypes ? (
                          <MenuItem value="" disabled>
                            <em className="select-error-text">
                              ⚠️ No kiosk types available
                            </em>
                          </MenuItem>
                        ) : (
                          kioskTypes.map((kioskType) => (
                            <MenuItem key={kioskType.id} value={kioskType.id}>
                              {kioskType.name}
                            </MenuItem>
                          ))
                        )}
                      </Select>
                    </FormControl>
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="quantity"
                      name="quantity"
                      label="Quantity"
                      value={formData.quantity || ''}
                      onChange={handleInputChange}
                      error={!!errors.quantity}
                      helperText={errors.quantity || formData.quantity ? "Auto-filled from product name" : "Select a product name first"}
                      placeholder={
                        formData.quantity
                          ? "Auto-filled from product name"
                          : "Select a product name first"
                      }
                      disabled={true}
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="noQty"
                      name="noQty"
                      label="No.Qty"
                      type="number"
                      inputProps={{ step: "1", min: "1" }}
                      value={formData.noQty || ''}
                      onChange={handleInputChange}
                      error={!!errors.noQty}
                      helperText={errors.noQty || formData.noQty ? "Auto-filled from product name" : "Select a product name first"}
                      placeholder={
                        formData.noQty
                          ? "Auto-filled from product name"
                          : "Select a product name first"
                      }
                      disabled={isNoQtyDisabled}
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="productCode"
                      name="productCode"
                      label="Product Code / SKU"
                      value={formData.productCode || ''}
                      onChange={handleInputChange}
                      error={!!errors.productCode}
                      helperText={errors.productCode || ''}
                      placeholder={
                        isProductCodeDisabled && formData.productCode
                          ? "Auto-filled from product name"
                          : isProductCodeDisabled
                            ? "Select a product name first"
                            : "Enter product code"
                      }
                      disabled={isProductCodeDisabled}
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group full-width">
                    <TextField
                      id="description"
                      name="description"
                      label="Description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Enter product description (optional)"
                      multiline
                      rows={2}
                      fullWidth
                      inputProps={{ style: { minHeight: '60px', maxHeight: '80px' } }}
                    />
                  </Box>
                </div>
              </div>

              {/* Pricing Information */}
              <div className="form-section mui-form-section">
                <h2>Pricing Details</h2>
                <div className="form-grid mui-form-grid">
                  <Box className="mui-form-group">
                    <TextField
                      id="sellingPrice"
                      name="sellingPrice"
                      label="Selling Price *"
                      type="number"
                      inputProps={{ step: "0.01" }}
                      value={formData.sellingPrice}
                      onChange={handleInputChange}
                      error={!!errors.sellingPrice}
                      helperText={errors.sellingPrice || ''}
                      placeholder="Enter selling price"
                      required
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="costPrice"
                      name="costPrice"
                      label="Cost Price"
                      type="number"
                      inputProps={{ step: "0.01" }}
                      value={formData.costPrice}
                      onChange={handleInputChange}
                      placeholder="Enter cost price (optional)"
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="discount"
                      name="discount"
                      label="Discount (%)"
                      type="number"
                      inputProps={{ step: "0.01", min: "0", max: "100" }}
                      value={formData.discount}
                      onChange={handleInputChange}
                      placeholder="Enter discount percentage"
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group">
                    <FormControl fullWidth required>
                      <InputLabel id="gstType-label" shrink={!!formData.gstType}>GST Type *</InputLabel>
                      <Select
                        labelId="gstType-label"
                        id="gstType"
                        name="gstType"
                        value={formData.gstType || ''}
                        onChange={handleInputChange}
                        label="GST Type *"
                        displayEmpty
                        notched={!!formData.gstType}
                        renderValue={(selected) => {
                          if (!selected) {
                            return <span className="select-placeholder"></span>;
                          }
                          const displayValue = selected === 'EXCLUDE' ? 'EXCLUDE (GST added separately)' : 'INCLUDE (GST included in price)';
                          return <span className="select-value">{displayValue}</span>;
                        }}
                      >
                        <MenuItem value="">
                          <em>Select GST Type...</em>
                        </MenuItem>
                        <MenuItem value="EXCLUDE">EXCLUDE (GST added separately)</MenuItem>
                        <MenuItem value="INCLUDE">INCLUDE (GST included in price)</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="taxRate"
                      name="taxRate"
                      label="Tax Rate (%) *"
                      type="number"
                      inputProps={{ step: "0.01", min: "0", max: "100" }}
                      value={formData.taxRate}
                      onChange={handleInputChange}
                      placeholder="Enter tax rate percentage"
                      required
                      fullWidth
                    />
                  </Box>
                </div>
              </div>

              {/* Food Information & Display Settings */}
              <div className="form-section mui-form-section">
                <h2>Food Information & Display</h2>
                <div className="form-grid mui-form-grid">
                  <Box className="mui-form-group">
                    <FormControl fullWidth required>
                      <InputLabel id="isVeg-label" shrink={formData.isVeg !== '' && formData.isVeg !== undefined}>Is Veg / Non-Veg *</InputLabel>
                      <Select
                        labelId="isVeg-label"
                        id="isVeg"
                        name="isVeg"
                        value={formData.isVeg === '' ? '' : formData.isVeg.toString()}
                        onChange={(e) => handleInputChange({ target: { name: 'isVeg', value: e.target.value, type: 'select' } })}
                        label="Is Veg / Non-Veg *"
                        displayEmpty
                        notched={formData.isVeg !== '' && formData.isVeg !== undefined}
                        renderValue={(selected) => {
                          if (!selected) {
                            return <span className="select-placeholder"></span>;
                          }
                          const displayValue = selected === 'true' ? 'Vegetarian' : 'Non-Vegetarian';
                          return <span className="select-value">{displayValue}</span>;
                        }}
                      >
                        <MenuItem value="">
                          <em>Select Type...</em>
                        </MenuItem>
                        <MenuItem value="true">Vegetarian</MenuItem>
                        <MenuItem value="false">Non-Vegetarian</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="preparationTime"
                      name="preparationTime"
                      label="Preparation Time (minutes)"
                      type="number"
                      inputProps={{ min: "0" }}
                      value={formData.preparationTime}
                      onChange={handleInputChange}
                      placeholder="Enter preparation time"
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group">
                    <TextField
                      id="lowStockAlert"
                      name="lowStockAlert"
                      label="Low Stock Alert Level"
                      type="number"
                      inputProps={{ min: "0" }}
                      value={formData.lowStockAlert}
                      onChange={handleInputChange}
                      placeholder="Enter low stock alert level"
                      fullWidth
                    />
                  </Box>

                  <Box className="mui-form-group full-width">
                    <TextField
                      id="ingredients"
                      name="ingredients"
                      label="Ingredients"
                      value={formData.ingredients}
                      onChange={handleInputChange}
                      placeholder="Enter ingredients (optional)"
                      multiline
                      rows={2}
                      fullWidth
                      inputProps={{ style: { minHeight: '60px', maxHeight: '80px' } }}
                    />
                  </Box>
                </div>
              </div>

              {/* Product Image - Auto-filled ONLY (Upload Completely Removed) */}
              <div className="form-section mui-form-section">
                <h2>Product Image</h2>
                <div className="form-group full-width form-group-full-width">
                  {/* Show auto-filled image if available - NO UPLOAD OPTION AT ALL */}
                  {isImageFromProductType && productImage ? (
                    <div className="auto-filled-image-container auto-filled-image-container-highlighted">
                      <div className="auto-filled-image-label">
                        <span className="auto-filled-image-icon">🖼️</span>
                        Image from Product Type
                      </div>
                      <img
                        src={productImage}
                        alt="Auto-filled product"
                        className="auto-filled-image"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    /* NO UPLOAD - Show message when no auto-filled image */
                    <div className="auto-filled-image-empty">
                      <div className="auto-filled-image-empty-icon">📷</div>
                      <p className="auto-filled-image-empty-text">No image available</p>
                      <small className="auto-filled-image-empty-small">Images from Product Type</small>
                    </div>
                  )}
                  {errors.productImage && <span className="error-message">{errors.productImage}</span>}
                </div>
              </div>

              {/* Form Actions */}
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`submit-btn ${isSubmitting ? 'loading' : ''}`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="loading-spinner"></span>
                      Adding Product...
                    </>
                  ) : (
                    'Add Product'
                  )}
                </button>
              </div>
            </form>

          )} {/* End of !authLoading conditional */}

          {/* Professional Validation Error Modal - Following Delete Modal Style */}
          {validationModal.show && (
            <div className="modal-overlay modal-overlay-addproduct">
              <div className="delete-modal delete-modal-addproduct">
                <div className="modal-header modal-header-addproduct modal-header-error">
                  <h3 className="modal-header-title">Validation Error</h3>
                </div>
                <div className="modal-body modal-body-addproduct">
                  <div className="modal-body-icon-container">
                    <div className="modal-body-icon-circle modal-body-icon-error">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                    </div>
                  </div>
                  <p className="modal-body-text">{validationModal.message}</p>
                  <p className="warning-text modal-body-warning modal-body-warning-error">Please fix all errors before submitting.</p>
                </div>
                <div className="modal-actions modal-actions-addproduct">
                  <button
                    onClick={() => setValidationModal({ show: false, message: '' })}
                    className="btn-primary modal-action-button modal-action-button-primary"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Professional Unsaved Changes Modal - Following Delete Modal Style */}
          {unsavedChangesModal.show && (
            <div className="modal-overlay" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="delete-modal" style={{
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                maxWidth: '400px',
                width: '90%',
                overflow: 'hidden'
              }}>
                <div className="modal-header" style={{
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  padding: '24px',
                  color: 'white'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Unsaved Changes</h3>
                </div>
                <div className="modal-body" style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <div style={{
                      color: '#f59e0b',
                      background: '#fffbeb',
                      padding: '16px',
                      borderRadius: '50%',
                      display: 'inline-flex'
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px', lineHeight: '1.5' }}>You have unsaved changes. Are you sure you want to leave?</p>
                  <p className="warning-text" style={{ color: '#f59e0b', fontSize: '0.9rem', fontWeight: '600', margin: 0 }}>All unsaved data will be lost.</p>
                </div>
                <div className="modal-actions" style={{
                  background: '#f9fafb',
                  padding: '16px 24px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px'
                }}>
                  <button
                    onClick={() => setUnsavedChangesModal({ show: false })}
                    className="cancel-btn"
                    style={{
                      background: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 20px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmUnsavedChanges}
                    className="confirm-delete-btn"
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 20px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Leave Page
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Professional Success Modal - Following Delete Modal Style */}
          {successModal.show && (
            <div className="modal-overlay" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="delete-modal" style={{
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                maxWidth: '400px',
                width: '90%',
                overflow: 'hidden'
              }}>
                <div className="modal-header" style={{
                  background: 'linear-gradient(135deg, #10b981, #34d399)',
                  padding: '24px',
                  color: 'white'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Success</h3>
                </div>
                <div className="modal-body" style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <div style={{
                      color: '#10b981',
                      background: '#ecfdf5',
                      padding: '16px',
                      borderRadius: '50%',
                      display: 'inline-flex'
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22,4 12,14.01 9,11.01"></polyline>
                      </svg>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px', lineHeight: '1.5' }}>{successModal.message}</p>
                  <p className="warning-text" style={{ color: '#10b981', fontSize: '0.9rem', fontWeight: '600', margin: 0 }}>You will be redirected to the dashboard.</p>
                </div>
                <div className="modal-actions" style={{
                  background: '#f9fafb',
                  padding: '16px 24px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px'
                }}>
                  <button
                    onClick={handleSuccessModalClose}
                    className="btn-primary"
                    style={{
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 20px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Professional Error Modal - Following Delete Modal Style */}
          {errorModal.show && (
            <div className="modal-overlay" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="delete-modal" style={{
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                maxWidth: '400px',
                width: '90%',
                overflow: 'hidden'
              }}>
                <div className="modal-header" style={{
                  background: 'linear-gradient(135deg, #ef4444, #f87171)',
                  padding: '24px',
                  color: 'white'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Error</h3>
                </div>
                <div className="modal-body" style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <div style={{
                      color: '#ef4444',
                      background: '#fef2f2',
                      padding: '16px',
                      borderRadius: '50%',
                      display: 'inline-flex'
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px', lineHeight: '1.5' }}>{errorModal.message}</p>
                  {/* Only show "Please try again" if the message doesn't already indicate success or is too generic */}
                  {!errorModal.message?.toLowerCase().includes('successfully') &&
                    !errorModal.message?.toLowerCase().includes('success') &&
                    errorModal.message !== 'Failed to add product. Please try again.' && (
                      <p className="warning-text" style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: '600', margin: 0 }}>Please try again.</p>
                    )}
                </div>
                <div className="modal-actions" style={{
                  background: '#f9fafb',
                  padding: '16px 24px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px'
                }}>
                  <button
                    onClick={() => setErrorModal({ show: false, message: '' })}
                    className="btn-primary"
                    style={{
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 20px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    OK
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

AddProduct.displayName = 'AddProduct';

export default AddProduct;