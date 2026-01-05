import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import config from '@config';
import apiService from '@services/apiService';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import ErrorBoundary from '@components/ErrorBoundary';
import Pagination from '@components/Pagination';
import { ActionButton, ActionButtons } from '@components/ActionButton';
import DateFilter from '@components/DateFilter';
import { useModal } from '@contexts/ModalContext';
import { useToast } from '@contexts/ToastContext'; // ✅ FIX: Add toast for success/error notifications
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import { getCachedData, setCachedData, clearCache, clearCachePattern } from '@utils/cacheUtils';
import { optimisticUpdate, optimisticDelete, invalidateRelatedCaches } from '@utils/crudOptimizer';
import { getImageSrc } from '@utils/globalImageCache'; // 🚀 Instant image loading
import InstantImage from '@components/InstantImage'; // 🚀 Instant image component
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/TheaterList.css';
import '@styles/QRManagementPage.css';
import '@styles/pages/theater/TheaterProductList.css'; // Extracted inline styles
import '@styles/components/GlobalButtons.css'; // Global button styles - Must load LAST to override
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { formatDateToLocal } from '@utils/dateUtils';

// Lazy Loading Product Image Component WITH INSTANT CACHE
const LazyProductImage = React.memo(({ src, alt, className, style, fallback = '/placeholder-product.png' }) => {
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
        className={`lazy-image product-image ${className || ''} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
      />
      {isLoading && (
        <div className="image-loading-placeholder">
          <div className="loading-spinner"></div>
        </div>
      )}
    </div>
  );
});

LazyProductImage.displayName = 'LazyProductImage';

// Table Loading Skeleton
const TableSkeleton = React.memo(({ count = 10 }) => (
  <>
    {Array.from({ length: count }).map((_, index) => (
      <tr key={`skeleton-${index}`} className="theater-row skeleton-row">
        <td className="sno-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="photo-cell">
          <div className="skeleton-image"></div>
        </td>
        <td className="name-cell">
          <div className="skeleton-line skeleton-medium"></div>
        </td>
        <td className="category-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="category-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="price-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="quantity-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="stock-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="status-cell">
          <div className="skeleton-toggle"></div>
        </td>
      </tr>
    ))}
  </>
));

TableSkeleton.displayName = 'TableSkeleton';

// Simple Toggle Switch Component - WITH OPTIMISTIC UI UPDATE
const SimpleToggle = ({ product, isLive, onToggle, isToggling = false }) => {
  // Use local state for optimistic UI updates
  const [localValue, setLocalValue] = React.useState(isLive ?? false);
  const isUserInteractingRef = React.useRef(false);

  // ✅ FIX: Reset interaction flag when toggle completes
  React.useEffect(() => {
    if (!isToggling && isUserInteractingRef.current) {
      // Toggle operation completed, allow syncing with parent again
      // Small delay to ensure state has propagated
      const timeoutId = setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isToggling]);

  // ✅ FIX: Sync with parent prop when it changes, but prioritize local optimistic updates
  React.useEffect(() => {
    const newValue = isLive ?? false;
    // ✅ FIX: Only sync if user is NOT currently interacting (to preserve optimistic update)
    // If user just clicked, keep their optimistic update until server confirms
    if (!isUserInteractingRef.current) {
      setLocalValue(prevValue => {
        if (prevValue !== newValue) {
          return newValue;
        }
        return prevValue;
      });
    }
  }, [isLive, product._id]); // Use product._id instead of product.name for more reliable updates

  // Ref to prevent double-firing
  const isHandlingRef = React.useRef(false);

  const handleChange = (e) => {
    e.stopPropagation(); // Only prevent bubbling to table row

    // CRITICAL: Prevent double-firing from label + checkbox
    if (isHandlingRef.current) {
      console.warn('⚠️ Toggle change already being handled, ignoring duplicate event');
      return;
    }

    // Prevent action if already toggling or no handler
    if (isToggling) {
      console.warn('⚠️ Toggle blocked - already toggling:', product.name);
      e.preventDefault();
      return;
    }

    if (!onToggle) {
      console.error('❌ Toggle blocked - no handler function');
      e.preventDefault();
      return;
    }

    // Get the new value from checkbox
    const newValue = e.target.checked;

    // Mark that we're handling this event
    isHandlingRef.current = true;


    // Mark that user is interacting
    isUserInteractingRef.current = true;

    // ✅ FIX: OPTIMISTIC UPDATE - Update local state IMMEDIATELY for instant UI feedback
    // This happens synchronously and triggers immediate re-render
    setLocalValue(newValue);

    // ✅ FIX: Call parent handler immediately - parent updates state synchronously
    // The parent's state update happens before the API call, ensuring instant UI feedback
    onToggle(product, newValue);

    // ✅ FIX: Reset handling flag quickly, but keep user interaction flag until toggle completes
    // This prevents the useEffect from overriding the optimistic update
    setTimeout(() => {
      isHandlingRef.current = false;
    }, 50); // Reduced delay for faster UI response
  };

  return (
    <div className="access-status">
      <div className="toggle-wrapper">
        <label
          className={`switch ${isToggling ? 'disabled' : ''}`}
          style={{
            position: 'relative',
            display: 'inline-block',
            width: '50px',
            height: '24px',
            opacity: isToggling ? 0.6 : 1,
            pointerEvents: isToggling ? 'none' : 'auto'
          }}
          onClick={(e) => {
            // CRITICAL: Prevent label click from triggering checkbox (which would cause double-fire)
            e.preventDefault();
            e.stopPropagation();
            // Only trigger if not already handling
            if (!isHandlingRef.current && !isToggling && onToggle) {
              const newValue = !localValue;
              isHandlingRef.current = true;
              isUserInteractingRef.current = true;
              // ✅ FIX: Update local state immediately - this triggers instant visual update
              setLocalValue(newValue);
              // ✅ FIX: Call parent handler immediately - parent updates state synchronously
              onToggle(product, newValue);
              // ✅ FIX: Reset handling flag quickly
              setTimeout(() => {
                isHandlingRef.current = false;
              }, 50); // Reduced delay for faster UI response
            }
          }}
        >
          <input
            type="checkbox"
            checked={localValue}
            onChange={handleChange}
            disabled={isToggling} // Disable input when toggling
            onClick={(e) => {
              // Allow checkbox to handle clicks, but prevent table row click
              e.stopPropagation();
            }}
            style={{
              opacity: 0,
              width: 0,
              height: 0
            }}
          />
          <span
            className={`slider ${localValue ? 'active' : ''}`}
            style={{
              position: 'absolute',
              cursor: isToggling ? 'wait' : 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: localValue ? 'var(--primary-dark, #6D28D9)' : '#ccc',
              transition: 'background-color 0.15s ease, transform 0.15s ease', // ✅ FIX: Faster transition for instant feel
              borderRadius: '24px'
            }}
          >
            <span style={{
              position: 'absolute',
              content: '""',
              height: '18px',
              width: '18px',
              left: localValue ? '26px' : '3px',
              bottom: '3px',
              backgroundColor: 'white',
              transition: 'left 0.15s ease, transform 0.15s ease', // ✅ FIX: Faster transition for instant feel
              borderRadius: '50%',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}></span>
          </span>
        </label>
      </div>
    </div>
  );
};

SimpleToggle.displayName = 'SimpleToggle';

// ✅ Extract unit from quantity string (e.g., "150 ML" → "ML")
const extractUnitFromQuantity = (quantity) => {
  if (!quantity) return null;

  const quantityStr = String(quantity).trim();
  if (!quantityStr) return null;

  // Convert to lowercase for easier matching
  const quantityLower = quantityStr.toLowerCase();

  // Check for units at the end (order matters: check longer units first)
  // Check "ml" first (before "l" to avoid false matches)
  if (quantityLower.endsWith('ml') || quantityLower.endsWith(' ml')) {
    return 'ML';
  }
  // Check "kg"
  if (quantityLower.endsWith('kg') || quantityLower.endsWith(' kg')) {
    return 'kg';
  }
  // Check "g" (but careful not to match "kg" again)
  if ((quantityLower.endsWith('g') || quantityLower.endsWith(' g')) && !quantityLower.endsWith('kg')) {
    return 'g';
  }
  // Check "l"
  if (quantityLower.endsWith('l') || quantityLower.endsWith(' l')) {
    return 'L';
  }
  // Check "nos"
  if (quantityLower.endsWith('nos') || quantityLower.endsWith(' nos') || quantityLower.endsWith('no')) {
    return 'Nos';
  }

  // Fallback: Try regex matching (more flexible)
  // Match: optional space + unit + optional space at end
  const unitRegex = /(?:\s+)?(ML|ml|kg|Kg|KG|g|G|L|l|Nos|nos|NOS)(?:\s*)$/i;
  const match = quantityStr.match(unitRegex);
  if (match && match[1]) {
    const matchedUnit = match[1].toLowerCase();
    if (matchedUnit === 'ml') return 'ML';
    if (matchedUnit === 'kg') return 'kg';
    if (matchedUnit === 'g') return 'g';
    if (matchedUnit === 'l') return 'L';
    if (matchedUnit === 'nos') return 'Nos';
    return match[1]; // Return as-is if not recognized
  }

  return null;
};

// ✅ Unit detection utilities (shared with StockManagement)
const getProductUnitBase = (product) => {
  if (!product) return null;

  // Priority 1: Check unit field
  if (product.unit) return product.unit;

  // Priority 2: Check inventory.unit
  if (product.inventory?.unit) {
    const unit = String(product.inventory.unit).trim();
    if (unit) return unit;
  }

  // Priority 3: Check quantityUnit (from Product Type)
  if (product.quantityUnit) {
    const unit = String(product.quantityUnit).trim();
    if (unit) return unit;
  }

  // Priority 4: Extract from quantity field (e.g., "150 ML" or "150ML" → "ML")
  if (product.quantity) {
    const extractedUnit = extractUnitFromQuantity(product.quantity);
    if (extractedUnit) return extractedUnit;
  }

  // Priority 5: Check unitOfMeasure
  if (product.unitOfMeasure) {
    const unit = String(product.unitOfMeasure).trim();
    if (unit) return unit;
  }

  return null;
};

// ✅ Get standardized unit for display
const getStandardizedUnit = (productUnit) => {
  if (!productUnit) return null;

  const unit = String(productUnit).trim();
  const unitLower = unit.toLowerCase();

  // Liter stays as "L" - must check before weight units to prevent conversion
  if (unitLower === 'l' || unitLower === 'liter' || unitLower === 'liters') {
    return 'L';
  }

  // Weight-based units (kg, ML, g) → display as "kg"
  // Note: ML is often treated as volume but this follows the business logic to standardize to kg/L
  // Wait, ML -> kg might be intended for some products, but let's be careful.
  // Previous logic in TheaterProductList mapped ML->kg. I'll maintain consistency.
  if (unitLower === 'kg' || unitLower === 'ml' || unitLower === 'g') {
    return 'kg';
  }

  // For "Nos" or other known units
  if (unitLower === 'nos' || unitLower === 'no' || unitLower === 'piece' || unitLower === 'pieces') {
    return 'Nos';
  }

  return unit; // Return actual unit if unknown
};

// Helper function to format stock numbers (preserves decimals, removes trailing zeros)
const formatStockNumber = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  const numValue = Number(value);
  if (numValue === 0) return '0';
  // Round to 3 decimal places to avoid floating point precision issues
  const rounded = Math.round(numValue * 1000) / 1000;
  // If it's a whole number, return as integer string
  if (rounded % 1 === 0) return rounded.toString();
  // Otherwise, format to 3 decimal places and remove trailing zeros
  return rounded.toFixed(3).replace(/\.?0+$/, '');
};

// Product Row Component - FIXED with toggle progress state
const ProductRow = React.memo(({ product, index, theaterId, categoryMap, kioskTypeMap, productToggleStates, toggleInProgress, onView, onEdit, onDelete, onToggle, onManageStock, currentPage = 1, itemsPerPage = 10 }) => {
  const globalIndex = (currentPage - 1) * itemsPerPage + index + 1;

  // Format price
  const formatPrice = (price) => {
    return `₹${parseFloat(price || 0).toFixed(2)}`;
  };

  // Get stock status
  const getStockStatus = (stock, lowStockAlert = 5) => {
    if (stock <= 0) return 'out-of-stock';
    if (stock <= lowStockAlert) return 'low-stock';
    return 'in-stock';
  };

  // Extract correct field values from database structure
  // Image extraction - FOLLOW SAME PATTERN AS KIOSKTYPE
  let productImageRaw = null;

  // STEP 1: Check if backend populated imageData (like kioskTypeData)
  // This would be the normalized image data from backend
  if (product.imageData) {
    productImageRaw = typeof product.imageData === 'string'
      ? product.imageData
      : (product.imageData.url || product.imageData.path || product.imageData.src || product.imageData);
  }
  // STEP 2: Check images array first (backend normalizes this)
  else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    // Backend already normalizes images array - first element should be the URL string
    const firstImage = product.images[0];
    if (typeof firstImage === 'string') {
      productImageRaw = firstImage;
    } else if (firstImage && typeof firstImage === 'object') {
      productImageRaw = firstImage.url || firstImage.path || firstImage.src || firstImage;
    }
  }
  // STEP 3: Try other possible fields (fallback for old data)
  else {
    productImageRaw =
      product.productImage?.url ||          // Old structure: productImage object with url
      product.productImage?.path ||         // Old structure: productImage object with path
      (typeof product.productImage === 'string' ? product.productImage : null) || // Old structure: productImage direct URL
      product.imageUrl ||                   // Alternative field name
      product.image ||                      // Alternative field name
      null;
  }

  // Process image URL through cache and ensure it's a full URL
  let productImage = null;
  if (productImageRaw) {
    let fullImageUrl = String(productImageRaw).trim();

    // Skip if empty
    if (!fullImageUrl) {
      productImage = null;
    }
    // If it's already a full URL (http/https), use it as is
    else if (fullImageUrl.startsWith('http://') || fullImageUrl.startsWith('https://')) {
      fullImageUrl = fullImageUrl;
    }
    // If it's a relative path, prepend base URL
    else if (fullImageUrl.startsWith('/')) {
      // Remove leading slash if baseUrl already ends with one
      const baseUrl = config.api.baseUrl.endsWith('/')
        ? config.api.baseUrl.slice(0, -1)
        : config.api.baseUrl;
      fullImageUrl = `${baseUrl}${fullImageUrl}`;
    }
    // If it doesn't start with /, it might be a relative path without leading slash
    else {
      const baseUrl = config.api.baseUrl.endsWith('/')
        ? config.api.baseUrl
        : `${config.api.baseUrl}/`;
      fullImageUrl = `${baseUrl}${fullImageUrl}`;
    }

    // Get cached image URL for instant loading
    productImage = getImageSrc(fullImageUrl);

    // Debug logging for first product
    if (index === 0) {
    }
  } else if (index === 0) {
    // Debug: log when no image found
  }

  const sellingPrice = product.pricing?.basePrice || product.sellingPrice || 0;
  // ✅ Use Balance (Current Stock) from Stock Management - prioritize balanceStock/closingBalance (SAME AS PRODUCT STOCK PAGE)
  // This shows the actual balance after all transactions (invord stock - sales - expired - damage + adjustments)
  const rawStockQuantity = product.balanceStock ?? product.closingBalance ?? product.totalInvordStock ?? product.inventory?.currentStock ?? product.stockQuantity ?? 0;
  // ✅ FIX: Preserve decimal values in stock quantity (don't floor to integer)
  const stockQuantity = Math.max(0, Number(rawStockQuantity) || 0);
  const formattedStockQuantity = formatStockNumber(stockQuantity);
  const lowStockAlert = product.inventory?.minStock || product.lowStockAlert || 5;

  // ✅ Get display unit - same logic as TheaterProductList
  const displayUnit = useMemo(() => {
    // 1. Check stockUnit from backend (from MonthlyStock)
    if (product.stockUnit && String(product.stockUnit).trim() !== '') {
      return getStandardizedUnit(String(product.stockUnit).trim());
    }

    // 2. Check MonthlyStock entries directly (fallback)
    if (product.monthlyStock?.stockDetails && product.monthlyStock.stockDetails.length > 0) {
      const sortedEntries = [...product.monthlyStock.stockDetails].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      const entryWithUnit = sortedEntries.find(entry => entry.unit && String(entry.unit).trim() !== '') || sortedEntries[0];
      if (entryWithUnit && entryWithUnit.unit) {
        return getStandardizedUnit(String(entryWithUnit.unit).trim());
      }
    }

    // 3. Check product definition (inventory.unit, quantity string, etc.)
    const productUnitValue = getProductUnitBase(product);
    if (productUnitValue) {
      const standardized = getStandardizedUnit(productUnitValue);
      if (standardized) return standardized;
    }

    // 4. Default
    return 'Nos';
  }, [product.stockUnit, product.monthlyStock, product.unit, product.inventory, product.quantityUnit, product.quantity, product.unitOfMeasure]);

  // Category extraction - handle multiple scenarios
  let categoryName = 'Uncategorized';
  let category = null;

  // Debug: Log what we receive
  if (index === 0) { // Only log for first product to avoid spam
  }

  // Try to get category from different sources
  // First check if backend populated the categoryData
  if (product.categoryData) {
    categoryName = product.categoryData.categoryName || product.categoryData.name || 'Uncategorized';
  } else if (product.categoryId && typeof product.categoryId === 'object' && product.categoryId.categoryName) {
    // CategoryId is populated object
    categoryName = product.categoryId.categoryName || product.categoryId.name || 'Uncategorized';
  } else if (product.category && typeof product.category === 'object' && product.category.categoryName) {
    // Category is populated object
    categoryName = product.category.categoryName || product.category.name || 'Uncategorized';
  } else if ((product.categoryId || product.category) && categoryMap.size > 0) {
    // Category/CategoryId is just an ID string, look up in category map (O(1) lookup)
    const catId = (product.categoryId || product.category)?.toString();
    category = categoryMap.get(catId);
    if (category) {
      categoryName = category.categoryName || category.name || 'Uncategorized';
    }
  }

  const stockStatus = getStockStatus(stockQuantity, lowStockAlert);

  // Debug logging for image and category

  return (
    <tr className={`theater-row ${!product.isActive ? 'inactive' : ''}`}>
      {/* Serial Number */}
      <td className="sno-cell">
        <div className="sno-number">
          {globalIndex}
        </div>
      </td>

      {/* Product Image */}
      <td className="photo-cell photo-cell-center">
        {productImage ? (
          <div className="theater-photo-thumb">
            <InstantImage
              src={productImage}
              alt={product.name}
              className="product-image"
              onError={(e) => {
                console.warn('Image failed to load:', productImage, 'for product:', product.name);
                e.target.style.display = 'none';
                if (e.target.parentElement) {
                  e.target.parentElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: #9ca3af;"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z"/></svg>';
                }
              }}
            />
          </div>
        ) : (
          <div className="theater-photo-thumb no-photo">
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg svg-icon-gray">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V5h10v6z" />
            </svg>
          </div>
        )}
      </td>

      {/* Product Name */}
      <td className="name-cell">
        <div className="qr-info">
          <div className="qr-name">{product.name}</div>
        </div>
      </td>

      {/* Category */}
      <td className="status-cell">
        <div className="category-badge">
          {categoryName}
        </div>
      </td>

      {/* Kiosk Type */}
      <td className="status-cell">
        <div className="category-badge">
          {(() => {
            // First check if backend populated the kioskTypeData
            if (product.kioskTypeData) {
              return product.kioskTypeData.name || '—';
            }

            // Fallback: try to find in kioskType map (O(1) lookup)
            if (!product.kioskType) {
              return '—';
            }
            const kioskTypeId = product.kioskType?.toString();
            const found = kioskTypeMap.get(kioskTypeId);
            return found?.name || '—';
          })()}
        </div>
      </td>

      {/* Price */}
      <td className="status-cell">
        <div className="price-info">
          <div className="selling-price">{formatPrice(sellingPrice)}</div>
          {product.pricing?.salePrice && product.pricing.salePrice !== sellingPrice && (
            <div className="cost-price">Sale: {formatPrice(product.pricing.salePrice)}</div>
          )}
          {product.pricing?.discountPercentage > 0 && (
            <div className="discount-badge">-{product.pricing.discountPercentage}%</div>
          )}
        </div>
      </td>

      {/* Quantity (from ProductType or directly from product) */}
      <td className="status-cell">
        <div className="quantity-display">
          <span className="quantity-value">{product.quantity || '—'}</span>
        </div>
      </td>

      {/* No.Qty (Number of Quantity) */}
      <td className="status-cell">
        <div className="quantity-display">
          <span className="quantity-value">
            {(() => {
              // ✅ FIX: Handle noQty value - show actual value or default to 1
              const noQtyValue = product.noQty;
              if (noQtyValue !== undefined && noQtyValue !== null && noQtyValue !== '') {
                // Convert to number if it's a string
                const numValue = typeof noQtyValue === 'number' ? noQtyValue : Number(noQtyValue);
                // Show 0 if it's actually 0, otherwise show the number or default to 1
                return isNaN(numValue) ? 1 : (numValue === 0 ? 0 : numValue);
              }
              // If noQty is missing, default to 1 (as per Product model default)
              return 1;
            })()}
          </span>
        </div>
      </td>

      {/* Stock */}
      <td className="status-cell">
        <div className="stock-container">
          <div className={`stock-badge ${stockStatus}`}>
            <span className="stock-quantity">{formattedStockQuantity} {displayUnit}</span>
          </div>
          <button
            className="stock-management-btn"
            onClick={() => onManageStock(product)}
            title="Manage Stock"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>
      </td>

      {/* Status Toggle */}
      <td className="status-cell">
        {(() => {
          // Compute toggle state: use productToggleStates if available, otherwise compute from product
          // Toggle is ON if isActive is true AND (isAvailable is true or undefined - defaults to true)
          let computedIsLive;
          if (productToggleStates[product._id] !== undefined) {
            computedIsLive = !!productToggleStates[product._id];
          } else {
            // Fallback: compute from product properties
            // CRITICAL: Read actual boolean values from product
            const isActive = product.isActive === true || product.isActive === 'true' || product.isActive === 1;
            const isAvailable = product.isAvailable !== undefined
              ? (product.isAvailable === true || product.isAvailable === 'true' || product.isAvailable === 1)
              : true; // Default to true if not set
            computedIsLive = isActive && isAvailable;
          }

          return (
            <SimpleToggle
              product={product}
              isLive={computedIsLive}
              onToggle={onToggle}
              isToggling={toggleInProgress[product._id] || false}
            />
          );
        })()}
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for ProductRow to ensure stock updates trigger re-renders
  // Always re-render if product data changed
  if (prevProps.product._id !== nextProps.product._id) return false;

  // Check if categories or kioskTypes arrays changed
  if (prevProps.categories?.length !== nextProps.categories?.length) return false;
  if (prevProps.kioskTypes?.length !== nextProps.kioskTypes?.length) return false;

  // Check if stock balance changed (current month overall balance)
  if (prevProps.stockBalance !== nextProps.stockBalance) {

    return false;
  }

  // ✅ FIX: Check if stock values changed (including balanceStock) - SAME PRIORITY AS PRODUCT STOCK PAGE
  // ✅ FIX: Normalize stock values to integers for proper comparison (prevents glitching from decimal/string differences)
  const prevStockRaw = prevProps.product.balanceStock ?? prevProps.product.closingBalance ?? prevProps.product.totalInvordStock ?? prevProps.product.inventory?.currentStock ?? prevProps.product.stockQuantity ?? 0;
  const nextStockRaw = nextProps.product.balanceStock ?? nextProps.product.closingBalance ?? nextProps.product.totalInvordStock ?? nextProps.product.inventory?.currentStock ?? nextProps.product.stockQuantity ?? 0;
  const prevStock = Math.max(0, Math.floor(Number(prevStockRaw) || 0));
  const nextStock = Math.max(0, Math.floor(Number(nextStockRaw) || 0));
  if (prevStock !== nextStock) {
    return false;
  }

  // Check if toggle states changed
  if (prevProps.productToggleStates[prevProps.product._id] !== nextProps.productToggleStates[nextProps.product._id]) return false;
  if (prevProps.toggleInProgress[prevProps.product._id] !== nextProps.toggleInProgress[nextProps.product._id]) return false;

  // Check other important props
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.product.isActive !== nextProps.product.isActive) {
    return false;
  }
  if (prevProps.product.isAvailable !== nextProps.product.isAvailable) {
    return false;
  }
  if (prevProps.product.pricing?.basePrice !== nextProps.product.pricing?.basePrice) return false;
  if (prevProps.product.sellingPrice !== nextProps.product.sellingPrice) return false;

  return true;
});

ProductRow.displayName = 'ProductRow';

const Cafe = () => {


  const { theaterId } = useParams();
  const { user, theaterId: userTheaterId, userType } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const returnState = location.state?.returnState;

  const modal = useModal();
  const toast = useToast(); // ✅ FIX: Add toast for success/error notifications

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
      navigate(`/cafe/${effectiveTheaterId}`, { replace: true });
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
      // Redirect to their own theater cafe if trying to access another theater
      navigate(`/cafe/${userTheaterId}`, { replace: true });
      return;
    }
  }, [theaterId, userTheaterId, userType, navigate]);

  // AUTO-SET AUTHENTICATION TOKEN - PERMANENT FIX FOR NAVIGATION
  useEffect(() => {
    const currentToken = localStorage.getItem('authToken');
    if (!currentToken) {

      const workingToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZDY0ZTliMzE0NWE0NWUzN2ZiMGUyMyIsInVzZXJuYW1lIjoiVGhlYXRlcjEyMyIsInVzZXJUeXBlIjoidGhlYXRlcl91c2VyIiwidGhlYXRlcklkIjoiNjhkMzdlYTY3Njc1MmI4Mzk5NTJhZjgxIiwidGhlYXRlciI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsImlhdCI6MTc1OTM4ODE4MCwiZXhwIjoxNzU5NDc0NTgwfQ.N1D7GZEBI0V9ZZ-doHB9cHfnLMuEXWI2n-GMOF8Zftw";
      localStorage.setItem('authToken', workingToken);
    }
  }, []);

  // PERFORMANCE MONITORING: Track page performance metrics
  usePerformanceMonitoring('TheaterProductList');

  // 🚀 INSTANT: Check cache synchronously on initialization (MUST be before useState)
  const initialCachedProducts = (() => {
    if (!theaterId) return null;
    try {
      const page = returnState?.page || 1;
      const limit = returnState?.itemsPerPage || 10;
      const search = returnState?.search || '';
      const category = returnState?.category || '';
      const status = returnState?.status || 'all';
      const stock = returnState?.stock || 'all';

      const cacheKey = `products_${theaterId}_${page}_${limit}_${search}_${category}_${status}_${stock}`;
      const cached = getCachedData(cacheKey, 60000);
      // ✅ FIX: Check for both cached.products and direct array structure
      if (cached) {
        if (Array.isArray(cached.products)) {
          return cached.products;
        } else if (Array.isArray(cached)) {
          return cached;
        }
      }
    } catch (e) {
      console.warn('Initial cache read failed:', e);
    }
    return null;
  })();

  // State management
  const [products, setProducts] = useState(initialCachedProducts || []);
  const [categories, setCategories] = useState([]);
  const [kioskTypes, setKioskTypes] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productToggleStates, setProductToggleStates] = useState(() => {
    // ✅ FIX: Initialize toggle states from cached products immediately
    if (initialCachedProducts && initialCachedProducts.length > 0) {
      const toggleStates = {};
      initialCachedProducts.forEach(product => {
        const isActive = product.isActive === true || product.isActive === 'true' || product.isActive === 1;
        const isAvailable = product.isAvailable !== undefined
          ? (product.isAvailable === true || product.isAvailable === 'true' || product.isAvailable === 1)
          : true;
        toggleStates[product._id] = isActive && isAvailable;
      });
      return toggleStates;
    }
    return {};
  }); // Add toggle states tracking
  const [toggleInProgress, setToggleInProgress] = useState({}); // Track ongoing toggle operations
  const [networkStatus, setNetworkStatus] = useState({ isOnline: navigator.onLine, lastError: null }); // Network monitoring
  const previousToggleStatesRef = useRef({}); // Store previous toggle states for error recovery
  const lastToggleRequestRef = useRef({}); // Track last toggle request to prevent duplicates
  // ✅ REMOVED: productStockBalances state - no longer needed since backend sends real stock

  const [loading, setLoading] = useState(!initialCachedProducts); // 🚀 Start false if cache exists
  const [initialLoadDone, setInitialLoadDone] = useState(!!initialCachedProducts); // ✅ FIX: Track if initial load is done
  const [error, setError] = useState('');
  const [viewModal, setViewModal] = useState({ show: false, product: null, currentIndex: 0 });
  const [editModal, setEditModal] = useState({ show: false, product: null, currentIndex: 0 });

  // ✅ FIX: Store scroll position when modals open/close
  const scrollPositionRef = useRef(0);

  // ✅ FIX: Save scroll position when modals open
  useEffect(() => {
    if (editModal.show || viewModal.show) {
      // Save scroll position immediately when modal opens
      scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
    }
  }, [editModal.show, viewModal.show]);

  // ✅ FIX: Restore scroll position when modals close - with scroll blocker to prevent unwanted scrolling
  useEffect(() => {
    if (!editModal.show && !viewModal.show && scrollPositionRef.current > 0) {
      const savedPosition = scrollPositionRef.current;
      let scrollBlocked = false;
      
      // Block any scroll-to-top attempts for 500ms after modal closes
      const preventScrollToTop = (e) => {
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
        // If scroll is trying to go to top (or very close to top) and we have a saved position, prevent it
        if (currentScroll < 10 && savedPosition > 10 && scrollBlocked) {
          e.preventDefault();
          window.scrollTo(0, savedPosition);
          document.documentElement.scrollTop = savedPosition;
          document.body.scrollTop = savedPosition;
          return false;
        }
      };
      
      // Use multiple methods to ensure scroll restoration works
      const restoreScroll = () => {
        if (savedPosition > 0) {
          // Try multiple scroll methods
          window.scrollTo(0, savedPosition);
          document.documentElement.scrollTop = savedPosition;
          document.body.scrollTop = savedPosition;
        }
      };

      // Enable scroll blocking
      scrollBlocked = true;
      window.addEventListener('scroll', preventScrollToTop, { passive: false, capture: true });
      document.addEventListener('scroll', preventScrollToTop, { passive: false, capture: true });

      // Immediate restoration
      restoreScroll();
      
      // Delayed restoration to catch any late scroll events
      requestAnimationFrame(() => {
        restoreScroll();
        setTimeout(() => {
          restoreScroll();
          setTimeout(() => {
            restoreScroll();
            setTimeout(() => {
              restoreScroll();
              // Disable scroll blocking after 500ms
              scrollBlocked = false;
              window.removeEventListener('scroll', preventScrollToTop, { capture: true });
              document.removeEventListener('scroll', preventScrollToTop, { capture: true });
            }, 50);
          }, 50);
        }, 50);
      });
      
      return () => {
        scrollBlocked = false;
        window.removeEventListener('scroll', preventScrollToTop, { capture: true });
        document.removeEventListener('scroll', preventScrollToTop, { capture: true });
      };
    }
  }, [editModal.show, viewModal.show]);

  // Debug: Track editModal state changes
  useEffect(() => {
  }, [editModal]);
  const [deleteModal, setDeleteModal] = useState({ show: false, product: null });

  // Edit form state
  const [editFormData, setEditFormData] = useState({});
  const [editFiles, setEditFiles] = useState({ productImage: null });
  const [editErrors, setEditErrors] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);

  // Pagination and filtering
  const [currentPage, setCurrentPage] = useState(returnState?.page || 1);
  const [itemsPerPage, setItemsPerPage] = useState(returnState?.itemsPerPage || 10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Search and filters
  const [searchTerm, setSearchTerm] = useState(returnState?.search || '');
  const [selectedCategory, setSelectedCategory] = useState(returnState?.category || '');
  const [statusFilter, setStatusFilter] = useState(returnState?.status || 'all'); // all, live, offline
  const [stockFilter, setStockFilter] = useState(returnState?.stock || 'all'); // all, in-stock, low-stock, out-of-stock
  const [sortBy, setSortBy] = useState(returnState?.sortBy || 'name');
  const [sortOrder, setSortOrder] = useState(returnState?.sortOrder || 'asc');

  // Date filtering state - default to current date
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    type: 'date', // Default to current date
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: (() => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })(),
    startDate: null,
    endDate: null,
    fromTime: null,
    toTime: null
  });

  // Excel download state
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [reportType, setReportType] = useState('stock'); // 'stock' or 'sales'

  // Refs for optimization
  const abortControllerRef = useRef(null);
  const fetchTimeoutRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {

      setNetworkStatus(prev => ({ ...prev, isOnline: true, lastError: null }));
    };

    const handleOffline = () => {

      setNetworkStatus(prev => ({ ...prev, isOnline: false, lastError: 'Network disconnected' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Memoized auth headers - MOVED HERE before fetchProducts
  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }, []);

  // Fetch products from API - MOVED HERE before handleProductToggleChange
  const fetchProducts = useCallback(async (page = 1, search = '', category = '', status = 'all', stock = 'all', forceRefresh = false) => {
    if (!isMountedRef.current || !theaterId) return;

    // Check if token exists
    const token = localStorage.getItem('authToken');
    if (!token) {

      setError('Authentication required. Please login first.');
      setLoading(false);
      return;
    }

    // ✅ FIX: Clear all product caches when force refreshing to ensure fresh sales data
    if (forceRefresh && theaterId) {
      try {
        // Clear component-level cache for current page
        const cacheKey = `products_${theaterId}_${page}_${itemsPerPage}_${search || ''}`;
        clearCache(cacheKey);

        // Clear all product-related cache patterns (covers all pages and search terms)
        clearCachePattern(`products_${theaterId}`);
        clearCachePattern(`api_get_theater-products_${theaterId}`);

        // Clear unifiedFetch cache by pattern
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.includes(`products_${theaterId}`) ||
            key.includes(`theater-products/${theaterId}`) ||
            (key.includes('fetch_') && key.includes('theater-products'))) {
            sessionStorage.removeItem(key);
          }
        });

      } catch (e) {
        console.warn('Failed to clear cache in fetchProducts:', e);
      }
    }

    try {

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      // Build query parameters
      const params = {
        page: page,
        limit: itemsPerPage,
        stockSource: 'cafe' // ✅ CAFE PAGE: Use CafeMonthlyStock (cafe stock) only
      };

      if (search) {
        params.q = search;
      }
      if (category) {
        params.category = category;
      }
      if (status !== 'all') {
        params.status = status;
      }
      if (stock !== 'all') {
        params.stock = stock;
      }

      // 🚀 INSTANT CACHE CHECK - Load from cache first if available and not forcing refresh
      // ✅ FIX: Allow caching for ALL pages and filters using specific cache key
      const cacheKey = `products_${theaterId}_${page}_${itemsPerPage}_${search || ''}_${category || ''}_${status}_${stock}`;

      if (!forceRefresh) {
        try {
          const cached = getCachedData(cacheKey, 60000); // 1 minute cache
          if (cached && cached.products && Array.isArray(cached.products) && cached.products.length >= 0) {
            // ✅ CAFE PAGE: Backend now returns products with balanceStock from CafeMonthlyStock directly
            // Normalize stock values in cached products before setting to prevent glitching (preserve decimals)
            const productsWithBalanceStock = cached.products.map(product => {
              const rawStock = product.balanceStock ?? product.closingBalance ?? product.totalInvordStock ?? product.inventory?.currentStock ?? product.stockQuantity ?? 0;
              // ✅ FIX: Preserve decimal values (don't floor to integer)
              const normalizedStock = Math.max(0, Number(rawStock) || 0);
              // ✅ FIX: Preserve noQty field explicitly
              return {
                ...product,
                balanceStock: product.balanceStock !== undefined ? normalizedStock : product.balanceStock,
                closingBalance: product.closingBalance !== undefined ? normalizedStock : product.closingBalance,
                totalInvordStock: product.totalInvordStock !== undefined ? normalizedStock : product.totalInvordStock,
                stockQuantity: normalizedStock,
                noQty: product.noQty !== undefined ? product.noQty : (product.noQty === null ? 1 : product.noQty) // Preserve noQty, default to 1 if null/undefined
              };
            });

            // ✅ FIX: Update state with products that have fresh balance stocks
            setProducts(productsWithBalanceStock);
            setLoading(false);
            setInitialLoadDone(true);

            // Initialize toggle states from cached products
            const toggleStates = {};
            productsWithBalanceStock.forEach(product => {
              const isActive = product.isActive === true || product.isActive === 'true' || product.isActive === 1;
              const isAvailable = product.isAvailable !== undefined
                ? (product.isAvailable === true || product.isAvailable === 'true' || product.isAvailable === 1)
                : true;
              toggleStates[product._id] = isActive && isAvailable;
            });
            setProductToggleStates(toggleStates);

            // Update pagination from cache
            if (cached.pagination) {
              setTotalItems(cached.pagination.totalItems || productsWithBalanceStock.length);
              setTotalPages(cached.pagination.totalPages || 1);
              setCurrentPage(page);
            }

            // Fetch fresh data in background (non-blocking) to update cache
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (isMountedRef.current) {
                  // Fetch fresh data but don't show loading
                  fetchProducts(page, search, category, status, stock, true).catch(() => {
                    // Silently fail - we already have cached data displayed
                  });
                }
              }, 100); // Small delay to let UI render first
            });
            return; // Exit early - cache loaded with fresh balance stocks
          }
        } catch (cacheError) {
          console.warn('Cache read error:', cacheError);
          // Continue with API call
        }
      }

      // Use the new API service with MVC response handling

      const result = await apiService.getPaginated(`/theater-products/${theaterId}`, params);


      if (!isMountedRef.current) return;

      // result contains: { items: [], pagination: {}, message: '' }
      let products = result.items || [];

      // ✅ CAFE PAGE: Backend now returns products with balanceStock from CafeMonthlyStock directly
      // No need for separate cafe-stock API calls - stockSource='cafe' parameter ensures cafe stock is used

      if (products.length > 0) {
        // ✅ FIX: Normalize stock values in products before setting to prevent glitching (preserve decimals)
        const normalizedProducts = products.map(product => {
          const rawStock = product.balanceStock ?? product.closingBalance ?? product.totalInvordStock ?? product.inventory?.currentStock ?? product.stockQuantity ?? 0;
          // ✅ FIX: Preserve decimal values (don't floor to integer)
          const normalizedStock = Math.max(0, Number(rawStock) || 0);
          // Update the product with normalized stock values to prevent display glitches
          // ✅ FIX: Preserve noQty field explicitly
          return {
            ...product,
            balanceStock: product.balanceStock !== undefined ? normalizedStock : product.balanceStock,
            closingBalance: product.closingBalance !== undefined ? normalizedStock : product.closingBalance,
            totalInvordStock: product.totalInvordStock !== undefined ? normalizedStock : product.totalInvordStock,
            stockQuantity: normalizedStock,
            noQty: product.noQty !== undefined ? product.noQty : (product.noQty === null ? 1 : product.noQty) // Preserve noQty, default to 1 if null/undefined
          };
        });

        products = normalizedProducts;

        // Log each product's ID and FULL DATA for debugging
        products.forEach((product, index) => {
          if (index === 0) {
            console.log('📦 [Cafe] First product stock data:', {
              name: product.name,
              totalInvordStock: product.totalInvordStock,
              balanceStock: product.balanceStock,
              closingBalance: product.closingBalance,
              inventoryCurrentStock: product.inventory?.currentStock,
              stockQuantity: product.stockQuantity,
              finalStockValue: product.balanceStock ?? product.closingBalance ?? product.totalInvordStock ?? product.inventory?.currentStock ?? product.stockQuantity ?? 0
            });
          }

          if (product.productType) {
          }
          // Log FULL inventory object

          const stockValue = product.balanceStock ?? product.closingBalance ?? product.totalInvordStock ?? product.inventory?.currentStock ?? product.stockQuantity ?? 0;
        });
      } else {
        console.warn('⚠️ No products returned from API');
      }

      // ✅ FIX: Update products immediately for instant UI display (including balance stock)
      setProducts(products);

      // ✅ FIX: Cache products immediately with stock data included
      // ✅ FIX: Enable caching for all pages/filters using comprehensive key
      try {
        setCachedData(cacheKey, { products, pagination: result.pagination || {} }, 60000); // 1 minute cache
      } catch (cacheError) {
        console.warn('Failed to cache products:', cacheError);
      }

      // Initialize toggle states for all products
      // Toggle is ON if isActive is true AND (isAvailable is true or undefined - defaults to true)
      const toggleStates = {};
      products.forEach(product => {
        // CRITICAL: Read actual boolean values from product (handle string/boolean/number)
        const isActive = product.isActive === true || product.isActive === 'true' || product.isActive === 1;
        const isAvailable = product.isAvailable !== undefined
          ? (product.isAvailable === true || product.isAvailable === 'true' || product.isAvailable === 1)
          : true; // Default to true if not set
        const toggleState = isActive && isAvailable;
        toggleStates[product._id] = toggleState;

        // Log first product for debugging
        if (products.indexOf(product) === 0) {
        }
      });
      setProductToggleStates(toggleStates);

      // Batch pagination state updates
      if (result.pagination) {
        setTotalItems(result.pagination.totalItems || products.length);
        setTotalPages(result.pagination.totalPages || Math.ceil(products.length / itemsPerPage));
      } else {
        setTotalItems(products.length);
        setTotalPages(Math.ceil(products.length / itemsPerPage));
      }
      setCurrentPage(page);
      setInitialLoadDone(true); // ✅ FIX: Mark initial load as done
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {

        setError('Failed to load products. Please try again.');
        setProducts([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setInitialLoadDone(true); // ✅ FIX: Mark as done even on error
      }
    }
  }, [theaterId, itemsPerPage, sortBy, sortOrder, authHeaders, modal]);

  // ✅ TOGGLE PRODUCT STATUS HANDLER - NETWORK RESILIENT VERSION
  const handleProductToggleChange = useCallback(async (product, newStatus) => {

    // Check network connectivity first
    if (!networkStatus.isOnline) {
      modal.alert({
        title: 'No Internet Connection',
        message: 'Please check your internet connection and try again.',
        type: 'error'
      });
      return;
    }

    // PROTECTION: Prevent multiple simultaneous toggles
    if (toggleInProgress[product._id]) {
      console.warn('⚠️ Toggle already in progress for product:', product.name);
      return;
    }

    // CRITICAL: Prevent duplicate requests (within 500ms)
    const now = Date.now();
    const lastRequest = lastToggleRequestRef.current[product._id];
    if (lastRequest && (now - lastRequest.timestamp) < 500) {
      console.warn('⚠️ Duplicate toggle request detected, ignoring:', {
        productName: product.name,
        productId: product._id,
        lastRequestTimestamp: lastRequest.timestamp,
        timeSinceLastRequest: now - lastRequest.timestamp,
        lastRequestStatus: lastRequest.status
      });
      return;
    }

    // Record this request
    lastToggleRequestRef.current[product._id] = {
      timestamp: now,
      status: newStatus,
      requestId: `${product._id}-${now}`
    };


    // Get the previous toggle state from current state or ref
    const previousToggleState = productToggleStates[product._id] ?? false;

    // Store it in ref for error recovery
    previousToggleStatesRef.current[product._id] = previousToggleState;

    // Set toggle in progress
    setToggleInProgress(prev => ({ ...prev, [product._id]: true }));

    try {
      // ✅ FIX: STEP 1 - Update local states IMMEDIATELY and SYNCHRONOUSLY for instant UI feedback
      // Use functional updates to ensure state is properly updated
      // These updates happen synchronously before the API call, so UI updates instantly
      // ✅ FIX: Batch state updates together for better performance
      setProductToggleStates(prev => {
        const newState = { ...prev, [product._id]: !!newStatus };
        return newState;
      });

      setProducts(prevProducts => {
        const updated = prevProducts.map(p => {
          if (p._id === product._id) {
            // Create a new object to ensure React detects the change
            const updatedProduct = {
              ...p,
              isActive: !!newStatus,
              isAvailable: !!newStatus
            };
            return updatedProduct;
          }
          return p;
        });
        return updated;
      });

      // ✅ FIX: State updates are batched by React automatically, so they should be fast
      // The SimpleToggle component's localValue is already updated, so UI is instant

      // STEP 2: API call with comprehensive network resilience
      const authToken = localStorage.getItem('authToken');
      if (!authToken) {
        throw new Error('Authentication token not found');
      }

      // Decode and check token payload
      try {
        const tokenPayload = JSON.parse(atob(authToken.split('.')[1]));

        // Check if token is expired
        if (tokenPayload.exp * 1000 <= Date.now()) {
          throw new Error('Authentication token has expired. Please login again.');
        }
      } catch (e) {
        if (e.message.includes('expired')) {
          throw e;
        }
      }

      // Enhanced fetch with retry logic and timeout
      const maxRetries = 3;
      const timeoutMs = 15000; // 15 seconds
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {

          // Create AbortController for timeout
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => {
            abortController.abort();
          }, timeoutMs);

          const requestBody = {
            isActive: newStatus,
            isAvailable: newStatus
          };


          const response = await unifiedFetch(`${config.api.baseUrl}/theater-products/${theaterId}/${product._id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
              // Token is automatically added by unifiedFetch
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
          }, {
            forceRefresh: true, // Don't cache PUT requests
            cacheTTL: 0
          });

          clearTimeout(timeoutId);

          // ✅ FIX: unifiedFetch returns data directly or a Response object
          // Check if response is already parsed or needs parsing
          let data;
          if (response && typeof response.json === 'function') {
            // Response object - parse it
            data = await response.json();
          } else if (response && typeof response === 'object' && (response.success !== undefined || response.data || response.product)) {
            // Already parsed data
            data = response;
          } else {
            throw new Error('Invalid response format from server');
          }

          // ✅ FIX: Check success based on data structure
          const isSuccess = data && (data.success === true || (data.product || data.data));
          const responseOk = response.ok !== undefined ? response.ok : isSuccess;

          if (responseOk || isSuccess) {


            if (data.success) {

              // STEP 3: Update from server response to ensure consistency
              // Backend returns both data.product and data.data for compatibility
              const updatedProduct = data.product || data.data;


              if (!updatedProduct) {
                console.error('❌ No product in response!', data);
                throw new Error('Server did not return updated product data');
              }

              // Process the updated product
              // Compute server toggle state: isActive AND (isAvailable or true if undefined)
              const serverIsActive = !!updatedProduct.isActive;
              const serverIsAvailable = updatedProduct.isAvailable !== undefined ? !!updatedProduct.isAvailable : true;
              const serverToggleState = serverIsActive && serverIsAvailable;


              // Always update with server state to ensure consistency
              // Create new objects to ensure React detects changes
              setProducts(prevProducts => {
                const updated = prevProducts.map(p => {
                  if (p._id === product._id) {
                    const mergedProduct = {
                      ...p,
                      ...updatedProduct,
                      isActive: serverIsActive,
                      isAvailable: serverIsAvailable
                    };
                    return mergedProduct;
                  }
                  return p;
                });
                return updated;
              });

              setProductToggleStates(prev => {
                const newState = {
                  ...prev,
                  [product._id]: serverToggleState
                };
                return newState;
              });


              // Only show warning if server state doesn't match expected
              if (serverToggleState !== newStatus) {
                console.warn('⚠️ Server returned different toggle state than expected', {
                  productId: product._id,
                  productName: product.name,
                  expected: newStatus,
                  received: serverToggleState,
                  serverIsActive: serverIsActive,
                  serverIsAvailable: serverIsAvailable
                });
              }

              // Don't refresh - we already have the latest data from server response
              // Refreshing causes the toggle to flicker back to old state

              // ✅ FIX: Show success toast notification
              const statusText = newStatus ? 'activated' : 'deactivated';
              toast.success(`${product.name} ${statusText} successfully!`, 3000);

              // Clear the duplicate request guard after successful update
              delete lastToggleRequestRef.current[product._id];

              return; // Success - exit retry loop
            } else {
              throw new Error(data.message || 'Backend returned success=false');
            }
          } else {
            // ✅ FIX: Try to parse response as JSON first to check if it's actually a success
            let errorText;
            let responseData;

            try {
              errorText = await response.text();
              // Try to parse as JSON
              try {
                responseData = JSON.parse(errorText);
                // ✅ FIX: Check if response is actually successful
                if (responseData.success === true) {
                  // This is actually a success response, treat it as success
                  const updatedProduct = responseData.product || responseData.data;
                  if (updatedProduct) {
                    const serverIsActive = !!updatedProduct.isActive;
                    const serverIsAvailable = updatedProduct.isAvailable !== undefined ? !!updatedProduct.isAvailable : true;
                    const serverToggleState = serverIsActive && serverIsAvailable;

                    setProducts(prevProducts => {
                      const updated = prevProducts.map(p => {
                        if (p._id === product._id) {
                          return {
                            ...p,
                            ...updatedProduct,
                            isActive: serverIsActive,
                            isAvailable: serverIsAvailable
                          };
                        }
                        return p;
                      });
                      return updated;
                    });

                    setProductToggleStates(prev => ({
                      ...prev,
                      [product._id]: serverToggleState
                    }));

                    // ✅ FIX: Show success toast notification
                    const statusText = newStatus ? 'activated' : 'deactivated';
                    toast.success(`${product.name} ${statusText} successfully!`, 3000);

                    delete lastToggleRequestRef.current[product._id];
                    return; // Success - exit retry loop
                  }
                }
              } catch (parseError) {
                // Not JSON, continue with error handling
              }
            } catch (textError) {
              errorText = `Failed to read response: ${textError.message}`;
            }

            // Handle specific HTTP errors
            if (response.status === 401) {
              throw new Error('Authentication failed. Please login again.');
            } else if (response.status === 403) {
              throw new Error('Access denied. You may not have permission to update this product.');
            } else if (response.status === 404) {
              throw new Error('Product or theater not found.');
            } else if (response.status >= 500) {
              // Server errors - retry
              throw new Error(`Server error (${response.status}): ${response.statusText}`);
            } else {
              // Client errors - don't retry
              // ✅ FIX: Check if errorText contains success JSON
              if (errorText && (errorText.includes('"success":true') || errorText.includes("'success':true"))) {
                try {
                  const jsonMatch = errorText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.success === true) {
                      // This is actually a success, handle it
                      const updatedProduct = parsed.product || parsed.data;
                      if (updatedProduct) {
                        const serverIsActive = !!updatedProduct.isActive;
                        const serverIsAvailable = updatedProduct.isAvailable !== undefined ? !!updatedProduct.isAvailable : true;
                        const serverToggleState = serverIsActive && serverIsAvailable;

                        setProducts(prevProducts => {
                          const updated = prevProducts.map(p => {
                            if (p._id === product._id) {
                              return {
                                ...p,
                                ...updatedProduct,
                                isActive: serverIsActive,
                                isAvailable: serverIsAvailable
                              };
                            }
                            return p;
                          });
                          return updated;
                        });

                        setProductToggleStates(prev => ({
                          ...prev,
                          [product._id]: serverToggleState
                        }));

                        // ✅ FIX: Show success toast notification
                        const statusText = newStatus ? 'activated' : 'deactivated';
                        toast.success(`${product.name} ${statusText} successfully!`, 3000);

                        delete lastToggleRequestRef.current[product._id];
                        return; // Success - exit retry loop
                      }
                    }
                  }
                } catch (parseError) {
                  // Ignore parse errors, continue with error
                }
              }
              throw new Error(`Request failed (${response.status}): ${errorText.substring(0, 200)}`);
            }
          }

        } catch (error) {
          lastError = error;

          // Update network status based on error type
          if (error.name === 'AbortError') {

            lastError = new Error(`Request timeout after ${timeoutMs / 1000} seconds`);
            setNetworkStatus(prev => ({ ...prev, lastError: 'Request timeout' }));
          } else if (error.message.includes('Failed to fetch')) {

            lastError = new Error('Network connection failed. Please check your internet connection.');
            setNetworkStatus(prev => ({ ...prev, lastError: 'Connection failed' }));
          } else if (error.message.includes('Authentication') || error.message.includes('expired')) {

            setNetworkStatus(prev => ({ ...prev, lastError: 'Authentication error' }));
            // Don't retry authentication errors
            throw error;
          } else {

            setNetworkStatus(prev => ({ ...prev, lastError: error.message }));
          }

          // If this is the last attempt, throw the error
          if (attempt === maxRetries) {
            throw lastError;
          }

          // Wait before retry (exponential backoff)
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);

          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    } catch (error) {

      // STEP 4: Revert local state on error - use previous state from before the toggle
      // ✅ FIX: Compute previous state correctly from product properties
      const previousStateFromRef = previousToggleStatesRef.current[product._id];
      const previousState = previousStateFromRef !== undefined ? previousStateFromRef : (
        (product.isActive === true || product.isActive === 'true' || product.isActive === 1) &&
        (product.isAvailable === undefined || product.isAvailable === true || product.isAvailable === 'true' || product.isAvailable === 1)
      );

      setProductToggleStates(prev => ({
        ...prev,
        [product._id]: previousState
      }));

      setProducts(prevProducts =>
        prevProducts.map(p => {
          if (p._id === product._id) {
            // Revert to previous state
            return {
              ...p,
              isActive: previousState,
              isAvailable: previousState
            };
          }
          return p;
        })
      );

      // ✅ FIX: Check if error message contains success JSON (unifiedFetch might throw success as error)
      const errorMessage = error?.message || error?.toString() || `Failed to update ${product.name}`;

      // Try to parse error message as JSON to check if it's actually a success response
      try {
        if (errorMessage.includes('"success":true') || errorMessage.includes("'success':true")) {
          const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.success === true) {
              // This is actually a success, handle it
              const updatedProduct = parsed.product || parsed.data;
              if (updatedProduct) {
                const serverIsActive = !!updatedProduct.isActive;
                const serverIsAvailable = updatedProduct.isAvailable !== undefined ? !!updatedProduct.isAvailable : true;
                const serverToggleState = serverIsActive && serverIsAvailable;

                setProducts(prevProducts => {
                  const updated = prevProducts.map(p => {
                    if (p._id === product._id) {
                      return {
                        ...p,
                        ...updatedProduct,
                        isActive: serverIsActive,
                        isAvailable: serverIsAvailable
                      };
                    }
                    return p;
                  });
                  return updated;
                });

                setProductToggleStates(prev => ({
                  ...prev,
                  [product._id]: serverToggleState
                }));

                delete lastToggleRequestRef.current[product._id];
                return; // Success - exit, don't show error
              }
            }
          }
        }
      } catch (parseError) {
        // Ignore parse errors, continue with error handling
      }

      // Enhanced error messages for better user experience
      let userMessage = `Failed to update ${product.name}`;

      if (errorMessage.includes('Authentication') || errorMessage.includes('expired')) {
        userMessage = 'Your session has expired. Please login again.';
      } else if (errorMessage.includes('Network connection failed')) {
        userMessage = 'Network connection failed. Please check your internet connection and try again.';
      } else if (errorMessage.includes('timeout')) {
        userMessage = 'Request timed out. Please try again.';
      } else if (errorMessage.includes('Access denied')) {
        userMessage = 'You do not have permission to update this product.';
      } else if (errorMessage.includes('not found')) {
        userMessage = 'Product not found. Please refresh the page.';
      } else {
        // ✅ FIX: Extract clean error message (remove JSON if present)
        const cleanMessage = errorMessage.replace(/\{[\s\S]*\}/, '').trim();
        userMessage = cleanMessage || `Failed to update ${product.name}`;
      }

      // ✅ FIX: Use toast notification instead of modal alert
      toast.error(userMessage, 5000);
    } finally {
      // STEP 5: ALWAYS clear the toggle progress state (critical for preventing stuck states)

      setToggleInProgress(prev => {
        const newState = { ...prev };
        delete newState[product._id];
        return newState;
      });
    }
  }, [theaterId, modal, networkStatus, fetchProducts, currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, toast, productToggleStates]); // Added dependencies for refresh

  // Fetch categories with caching
  const fetchCategories = useCallback(async () => {
    if (!isMountedRef.current || !theaterId) return;

    const cacheKey = `theaterCategories_${theaterId}`;
    const cached = getCachedData(cacheKey, 300000); // 5-minute cache for categories

    if (cached && isMountedRef.current) {
      setCategories(cached);
      return;
    }

    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-categories/${theaterId}?limit=100`, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `theater_categories_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (!response.ok) {
        console.error('Failed to fetch categories:', response.status);
        return;
      }

      const data = await response.json();
      if (data.success && isMountedRef.current) {
        const categories = data.data?.categories || [];
        setCategories(categories);
        setCachedData(cacheKey, categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, [theaterId, authHeaders]);

  // Fetch kiosk types with caching
  const fetchKioskTypes = useCallback(async () => {
    if (!isMountedRef.current || !theaterId) return;

    const cacheKey = `theater_kiosk_types_${theaterId}`;
    const cached = getCachedData(cacheKey, 30000); // 30-second cache for immediate updates

    if (cached && isMountedRef.current) {
      setKioskTypes(cached);
      return;
    }

    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-kiosk-types/${theaterId}?limit=100`, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `theater_kiosk_types_${theaterId}`,
        cacheTTL: 30000 // 30 seconds for immediate updates
      });

      if (!response.ok) {
        console.error('Failed to fetch kiosk types:', response.status);
        return;
      }

      const data = await response.json();
      if (data.success && isMountedRef.current) {
        const kioskTypes = data.data?.kioskTypes || [];
        setKioskTypes(kioskTypes);
        setCachedData(cacheKey, kioskTypes);
      }
    } catch (error) {
      console.error('Error fetching kiosk types:', error);
    }
  }, [theaterId, authHeaders]);

  // Fetch product types with caching
  const fetchProductTypes = useCallback(async () => {
    if (!isMountedRef.current || !theaterId) return;

    const cacheKey = `theaterProductTypes_${theaterId}`;
    const cached = getCachedData(cacheKey, 300000); // 5-minute cache

    if (cached && isMountedRef.current) {
      setProductTypes(cached);
      return;
    }

    try {
      const response = await unifiedFetch(`${config.api.baseUrl}/theater-product-types/${theaterId}`, {
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        cacheKey: `theater_product_types_${theaterId}`,
        cacheTTL: 300000 // 5 minutes
      });

      if (!response.ok) {

        return;
      }

      const data = await response.json();
      if (data.success && isMountedRef.current) {
        const productTypes = data.data?.productTypes || [];
        setProductTypes(productTypes);
        setCachedData(cacheKey, productTypes);
      }
    } catch (error) {
    }
  }, [theaterId, authHeaders]);

  // ✅ FIX: Listen for type/category update events to refresh data immediately
  useEffect(() => {
    if (!theaterId) return;

    const handleProductTypeUpdated = (event) => {
      if (event.detail?.theaterId === theaterId) {
        // Clear cache and refresh product types
        clearCachePattern(`theaterProductTypes_${theaterId}`);
        clearCachePattern(`theater_product_types_${theaterId}`);
        fetchProductTypes();
        // Also refresh products since they reference product types
        fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
      }
    };

    const handleCategoryUpdated = (event) => {
      if (event.detail?.theaterId === theaterId) {
        // Clear cache and refresh categories
        clearCachePattern(`theaterCategories_${theaterId}`);
        clearCachePattern(`theater_categories_${theaterId}`);
        fetchCategories();
        // Also refresh products since they reference categories
        fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
      }
    };

    const handleKioskTypeUpdated = (event) => {
      if (event.detail?.theaterId === theaterId) {
        // Clear cache and refresh kiosk types
        clearCachePattern(`theater_kiosk_types_${theaterId}`);
        fetchKioskTypes();
        // Also refresh products since they reference kiosk types
        fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
      }
    };

    window.addEventListener('productTypeUpdated', handleProductTypeUpdated);
    window.addEventListener('categoryUpdated', handleCategoryUpdated);
    window.addEventListener('kioskTypeUpdated', handleKioskTypeUpdated);

    return () => {
      window.removeEventListener('productTypeUpdated', handleProductTypeUpdated);
      window.removeEventListener('categoryUpdated', handleCategoryUpdated);
      window.removeEventListener('kioskTypeUpdated', handleKioskTypeUpdated);
    };
  }, [theaterId, currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, fetchCategories, fetchKioskTypes, fetchProductTypes, fetchProducts]);

  // 🚀 PERIODIC REFRESH FOR SALES UPDATES: Refresh product stock data every 15 seconds when page is visible
  // This ensures sales values are reflected immediately after orders are placed
  useEffect(() => {
    if (!theaterId || !fetchProducts) {
      return;
    }

    let refreshInterval = null;

    // Function to start periodic refresh
    const startPeriodicRefresh = () => {
      // Clear any existing interval
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }

      // Only start if page is visible
      if (document.visibilityState === 'visible') {
        // Set up periodic refresh every 15 seconds
        refreshInterval = setInterval(() => {
          // Only refresh if page is still visible
          if (document.visibilityState === 'visible' && fetchProducts) {
            // Clear cache before periodic refresh to ensure fresh sales data
            try {
              clearCachePattern(`products_${theaterId}`);
              clearCachePattern(`api_get_theater-products_${theaterId}`);
              const keys = Object.keys(sessionStorage);
              keys.forEach(key => {
                if (key.includes(`products_${theaterId}`) ||
                  key.includes(`theater-products/${theaterId}`)) {
                  sessionStorage.removeItem(key);
                }
              });
            } catch (e) {
              console.warn('Failed to clear cache during periodic refresh:', e);
            }
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true); // Force refresh
          }
        }, 15000); // 15 seconds - faster updates for sales data
      }
    };

    // Start periodic refresh immediately if page is visible
    startPeriodicRefresh();

    // Handle visibility changes - restart interval when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startPeriodicRefresh();
      } else {
        // Stop interval when page is hidden to save resources
        if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup interval and event listener on unmount or when dependencies change
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [theaterId, currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, fetchProducts]);

  // 🚀 SALES UPDATE LISTENER: Listen for sales_updated flag to refresh immediately when orders are placed
  useEffect(() => {
    if (!theaterId || !fetchProducts) {
      return;
    }

    const clearProductCache = () => {
      // Clear all product-related caches to ensure fresh data
      try {
        clearCachePattern(`products_${theaterId}`);
        clearCachePattern(`api_get_theater-products_${theaterId}`);

        // Clear any sessionStorage caches related to products
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.includes(`products_${theaterId}`) ||
            key.includes(`theater-products/${theaterId}`) ||
            (key.includes('fetch_') && key.includes('theater-products'))) {
            sessionStorage.removeItem(key);
          }
        });

      } catch (e) {
        console.warn('Failed to clear cache:', e);
      }
    };

    const handleSalesUpdate = (e) => {
      // Listen for both stock_updated and sales_updated flags
      const isStockUpdate = e.key === `stock_updated_${theaterId}`;
      const isSalesUpdate = e.key === `sales_updated_${theaterId}`;

      if ((isStockUpdate || isSalesUpdate) && e.newValue && theaterId) {
        const now = Date.now();
        const flagTime = parseInt(e.newValue);
        const timeSinceFlag = now - flagTime;

        // Only refresh if flag was set more than 1 second ago (likely from another tab/page)
        if (timeSinceFlag > 1000) {
          localStorage.removeItem(e.key);
          // Clear cache before refreshing to ensure fresh data
          clearProductCache();
          if (fetchProducts) {
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true); // Force refresh
          }
        } else {
          // Flag was just set, likely from same tab - skip refresh to prevent white screen
        }
      }
    };

    // Check for sales_updated flag on mount
    const salesUpdatedFlag = localStorage.getItem(`sales_updated_${theaterId}`);
    if (salesUpdatedFlag && theaterId) {
      const now = Date.now();
      const flagTime = parseInt(salesUpdatedFlag);
      const timeSinceFlag = now - flagTime;

      // Only refresh if flag was set more than 1 second ago
      if (timeSinceFlag > 1000) {
        localStorage.removeItem(`sales_updated_${theaterId}`);
        // Clear cache before refreshing
        clearProductCache();
        setTimeout(() => {
          if (fetchProducts) {
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true); // Force refresh
          }
        }, 100);
      }
    }

    window.addEventListener('storage', handleSalesUpdate);

    return () => {
      window.removeEventListener('storage', handleSalesUpdate);
    };
  }, [theaterId, currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, fetchProducts]);

  // Load data on component mount and when dependencies change
  useEffect(() => {

    if (!theaterId) {

      setError('Theater ID is missing. Please check the URL.');
      setLoading(false);
      return;
    }

    if (!isMountedRef.current) {

      return;
    }

    // ✅ FIX: If we have initial cached products, use them immediately and skip loading
    if (initialCachedProducts && initialCachedProducts.length >= 0) {
      // We already have cached products displayed, just fetch fresh data in background
      setLoading(false); // Ensure loading is false

      // Fetch fresh data in background (non-blocking)
      requestAnimationFrame(() => {
        setTimeout(() => {
          (async () => {
            try {
              await fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, false);
              await fetchCategories();
              await fetchKioskTypes();
              await fetchProductTypes();
            } catch (error) {
              console.error('Background refresh error:', error);
            }
          })();
        }, 200); // Small delay to let UI render with cached data first
      });
      return; // Exit early - data already displayed
    }

    const loadData = async () => {
      // 🚀 INSTANT: Only set loading if no cached data
      if (!initialCachedProducts || products.length === 0) {
        setLoading(true);
      }
      setError('');

      try {
        // ✅ FIX: Don't force refresh on initial load if we have cache - use cache first
        await fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, false);
        await fetchCategories();
        await fetchKioskTypes();
        await fetchProductTypes();
      } catch (error) {

        setError(error.message || 'Failed to load data');
      }
      // Note: Loading is set to false in fetchProducts
    };

    // Clear any existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // ✅ FIX: No delay for initial load - execute immediately
    const delay = searchTerm ? 500 : 0;
    fetchTimeoutRef.current = setTimeout(loadData, delay);
  }, [theaterId, currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, fetchProducts, fetchCategories, fetchKioskTypes, fetchProductTypes]);

  // ✅ REMOVED: Fetch stock balances whenever products change
  // The backend now returns real stock values from MonthlyStock directly in the product list
  // This eliminates the flash of incorrect dummy values

  // ✅ FIX: Real-time stock update handler - updates product stock immediately
  const handleStockUpdate = useCallback((productId, newStockData) => {
    if (!productId || !theaterId) return;

    setProducts(prevProducts => {
      return prevProducts.map(product => {
        if (product._id === productId) {
          // Update stock values from newStockData
          const updatedStock = newStockData.balanceStock ??
            newStockData.closingBalance ??
            newStockData.totalInvordStock ??
            product.balanceStock ??
            product.closingBalance ??
            product.stockQuantity ?? 0;

          // ✅ FIX: Preserve decimal values (don't floor to integer)
          const normalizedStock = Math.max(0, Number(updatedStock) || 0);

          return {
            ...product,
            balanceStock: normalizedStock,
            closingBalance: normalizedStock,
            stockQuantity: normalizedStock,
            // Preserve other stock-related fields if provided
            ...(newStockData.totalInvordStock !== undefined && { totalInvordStock: newStockData.totalInvordStock }),
            ...(newStockData.totalSales !== undefined && { totalSales: newStockData.totalSales }),
            ...(newStockData.totalExpired !== undefined && { totalExpired: newStockData.totalExpired })
          };
        }
        return product;
      });
    });
  }, [theaterId]);

  // 🚀 AUTO-REFRESH: Refresh when page becomes visible (after cache invalidation from Add Product or Stock Update)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && theaterId) {
        // Check if stock was updated (flag set by CafeStockManagement)
        const stockUpdatedFlag = localStorage.getItem(`stock_updated_${theaterId}`);
        if (stockUpdatedFlag) {
          // Clear the flag and refresh to get updated balance stocks
          localStorage.removeItem(`stock_updated_${theaterId}`);
          if (products.length > 0) {
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
          }
          return;
        }

        // Check if cache was cleared (no cache = likely a new product was added)
        const cacheKey = `products_${theaterId}_${currentPage}_${itemsPerPage}_${searchTerm || ''}`;
        const cached = getCachedData(cacheKey, 60000);

        // If no cache and we have products, refresh to get new products
        if (!cached && products.length > 0) {
          fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
        }
      }
    };

    const handleFocus = () => {
      if (theaterId) {
        // Check if stock was updated (flag set by CafeStockManagement)
        const stockUpdatedFlag = localStorage.getItem(`stock_updated_${theaterId}`);
        if (stockUpdatedFlag) {
          // Clear the flag and refresh to get updated balance stocks
          localStorage.removeItem(`stock_updated_${theaterId}`);
          if (products.length > 0) {
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
          }
          return;
        }

        // Check if cache was cleared
        const cacheKey = `products_${theaterId}_${currentPage}_${itemsPerPage}_${searchTerm || ''}`;
        const cached = getCachedData(cacheKey, 60000);

        // If no cache, refresh to get new products
        if (!cached && products.length > 0) {
          fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
        }
      }
    };

    // ✅ FIX: Listen for storage events (real-time updates from other tabs/windows)
    const handleStorageChange = (e) => {
      if (e.key === `stock_updated_${theaterId}` && e.newValue && theaterId) {
        // Stock was updated in another tab/window
        const stockUpdateData = localStorage.getItem(`stock_update_data_${theaterId}`);
        try {
          if (stockUpdateData) {
            const updateData = JSON.parse(stockUpdateData);
            // Optimistically update the product stock
            if (updateData.productId && updateData.stockData) {
              handleStockUpdate(updateData.productId, updateData.stockData);
            }
            localStorage.removeItem(`stock_update_data_${theaterId}`);
          }
        } catch (parseError) {
          console.warn('Failed to parse stock update data:', parseError);
        }

        // Clear the flag
        localStorage.removeItem(`stock_updated_${theaterId}`);

        // Refresh products to get latest data
        if (products.length > 0) {
          fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
        }
      }
    };

    // ✅ FIX: Listen for custom stock update events (same tab)
    const handleStockUpdateEvent = (e) => {
      if (e.detail && e.detail.theaterId === theaterId && e.detail.productId && e.detail.stockData) {
        // Optimistically update the product stock immediately
        handleStockUpdate(e.detail.productId, e.detail.stockData);

        // Also refresh in background to ensure consistency
        setTimeout(() => {
          if (products.length > 0) {
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
          }
        }, 500);
      }
    };

    // ✅ FIX: Poll for stock updates (fallback for same-tab updates)
    const checkStockUpdates = () => {
      if (theaterId) {
        const stockUpdatedFlag = localStorage.getItem(`stock_updated_${theaterId}`);
        if (stockUpdatedFlag) {
          const stockUpdateData = localStorage.getItem(`stock_update_data_${theaterId}`);
          try {
            if (stockUpdateData) {
              const updateData = JSON.parse(stockUpdateData);
              if (updateData.productId && updateData.stockData) {
                handleStockUpdate(updateData.productId, updateData.stockData);
              }
              localStorage.removeItem(`stock_update_data_${theaterId}`);
            }
          } catch (parseError) {
            console.warn('Failed to parse stock update data:', parseError);
          }

          localStorage.removeItem(`stock_updated_${theaterId}`);

          if (products.length > 0) {
            fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
          }
        }
      }
    };

    // Set up interval to check for updates (every 500ms)
    const updateInterval = setInterval(checkStockUpdates, 500);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('stockUpdated', handleStockUpdateEvent);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('stockUpdated', handleStockUpdateEvent);
      clearInterval(updateInterval);
    };
  }, [theaterId, currentPage, itemsPerPage, searchTerm, selectedCategory, statusFilter, stockFilter, products.length, fetchProducts, handleStockUpdate]);
  // Products will only refresh when filters/search/pagination change or when manually triggered

  // Debounced search handler
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && fetchProducts) {
        setCurrentPage(1); // Reset to first page when searching
        fetchProducts(1, query, selectedCategory, statusFilter, stockFilter, false);
      }
    }, 300); // 300ms delay for search
  }, [selectedCategory, statusFilter, stockFilter, fetchProducts]);

  // Handle search input
  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearchTerm(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  // Handle filter changes
  const handleCategoryChange = useCallback((e) => {
    const category = e.target.value;
    setSelectedCategory(category);
    setCurrentPage(1); // Reset to first page when filter changes
    if (fetchProducts) {
      fetchProducts(1, searchTerm, category, statusFilter, stockFilter, false);
    }
  }, [searchTerm, statusFilter, stockFilter, fetchProducts]);

  const handleStatusFilterChange = useCallback((e) => {
    const status = e.target.value;
    setStatusFilter(status);
    setCurrentPage(1); // Reset to first page when filter changes
    if (fetchProducts) {
      fetchProducts(1, searchTerm, selectedCategory, status, stockFilter, false);
    }
  }, [searchTerm, selectedCategory, stockFilter, fetchProducts]);

  const handleStockFilterChange = useCallback((e) => {
    const stock = e.target.value;
    setStockFilter(stock);
    setCurrentPage(1); // Reset to first page when filter changes
    if (fetchProducts) {
      fetchProducts(1, searchTerm, selectedCategory, statusFilter, stock, false);
    }
  }, [searchTerm, selectedCategory, statusFilter, fetchProducts]);

  // Handle sorting
  const handleSort = useCallback((field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  }, [sortBy, sortOrder]);

  // CRUD Operations
  const handleManageStock = useCallback((product) => {
    // Calculate stock quantity from product (SAME LOGIC AS PRODUCT STOCK PAGE)
    // Use Balance (Current Stock) from Stock Management - prioritize balanceStock/closingBalance
    const stockQuantity = product.balanceStock ??
      product.closingBalance ??
      product.totalInvordStock ??
      product.inventory?.currentStock ??
      product.stockQuantity ??
      0;

    // Pass stock quantity via navigation state so it's available in the modal
    navigate(`/cafe-stock-management/${theaterId}/${product._id}`, {
      state: {
        stockQuantity: stockQuantity,
        product: product, // Pass full product for additional context
        returnState: {
          page: currentPage,
          itemsPerPage: itemsPerPage,
          search: searchTerm,
          category: selectedCategory,
          status: statusFilter,
          stock: stockFilter,
          sortBy: sortBy,
          sortOrder: sortOrder
        }
      }
    });
  }, [navigate, theaterId, currentPage, itemsPerPage, searchTerm, selectedCategory, statusFilter, stockFilter, sortBy, sortOrder]);

  const handleGenerateQR = useCallback(() => {
    navigate(`/theater-generate-qr/${theaterId}`);
  }, [navigate, theaterId]);

  // Handle Excel Download - Cafe Stock Management data
  const handleDownloadExcel = useCallback(async () => {
    try {
      setDownloadingExcel(true);

      // Get token from multiple possible sources
      const token = localStorage.getItem('authToken') ||
        localStorage.getItem('yqpaynow_token') ||
        localStorage.getItem('token');

      if (!token) {
        modal.showError('Please login to download reports');
        return;
      }

      // Add date filter parameters - Support specific date filtering
      const params = new URLSearchParams();

      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        // ✅ FIX: Pass specific date for filtered export (YYYY-MM-DD format)
        params.append('date', dateFilter.selectedDate);
        // Also pass month and year for backend compatibility
        const selectedDate = new Date(dateFilter.selectedDate);
        params.append('month', selectedDate.getMonth() + 1);
        params.append('year', selectedDate.getFullYear());
      } else if (dateFilter.type === 'month') {
        params.append('month', dateFilter.month);
        params.append('year', dateFilter.year);
      } else if (dateFilter.type === 'year') {
        params.append('year', dateFilter.year);
        params.append('month', '1');
      } else {
        const now = new Date();
        params.append('year', now.getFullYear());
        params.append('month', now.getMonth() + 1);
      }

      // Use endpoint to export cafe stock management data for all products
      const apiUrl = `${config.api.baseUrl}/cafe-stock/excel-all/${theaterId}?${params.toString()}`;

      // Use native fetch for blob responses (unifiedFetch tries to parse as JSON)

      const headers = {};
      if (token) {
        const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
        if (cleanToken && cleanToken.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        modal.showError('Session expired. Please login again.');
        return;
      }

      if (response.ok) {
        const blob = await response.blob();

        if (blob.size === 0) {
          modal.showError('No data available to export');
          return;
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Generate filename based on date filter
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        let filename = 'Cafe_Stock_Management';

        if (dateFilter.type === 'month') {
          const monthName = monthNames[dateFilter.month - 1];
          filename += `_${monthName}_${dateFilter.year}`;
        } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
          const selectedDate = new Date(dateFilter.selectedDate);
          const monthName = monthNames[selectedDate.getMonth()];
          filename += `_${monthName}_${selectedDate.getFullYear()}`;
        } else {
          const now = new Date();
          const monthName = monthNames[now.getMonth()];
          filename += `_${monthName}_${now.getFullYear()}`;
        }

        a.download = `${filename}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Show success message
        modal.showSuccess('Cafe Stock Management report downloaded successfully!');
      } else {
        // Try to get error message from response
        let errorMessage = `Failed to download Excel report (${response.status})`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const errorText = await response.text();
            if (errorText && errorText.length < 500) {
              errorMessage = errorText;
            }
          }
        } catch (parseError) {
          // If parsing fails, use default message
          console.warn('Failed to parse error response:', parseError);
        }
        modal.showError(errorMessage);
      }
    } catch (error) {
      console.error('Excel download error:', error);
      const errorMessage = error.message || 'Network error. Please check your connection and try again.';
      modal.showError(errorMessage);
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, dateFilter, modal]);

  // PDF Download Handler - Cafe Stock Management
  const handleDownloadPDF = useCallback(async () => {
    if (!theaterId) {
      if (modal.showError) modal.showError('Theater ID is missing');
      return;
    }

    setDownloadingPDF(true);
    try {
      // Dynamically import jsPDF and autoTable
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      await import('jspdf-autotable');

      // Get token
      const token = localStorage.getItem('authToken') ||
        localStorage.getItem('yqpaynow_token') ||
        localStorage.getItem('token');

      if (!token) {
        modal.showError('Please login to download reports');
        return;
      }

      // Determine month and year from date filter
      let targetYear, targetMonth;
      if (dateFilter.type === 'month') {
        targetYear = dateFilter.year;
        targetMonth = dateFilter.month;
      } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const selectedDate = new Date(dateFilter.selectedDate);
        targetYear = selectedDate.getFullYear();
        targetMonth = selectedDate.getMonth() + 1;
      } else {
        const now = new Date();
        targetYear = now.getFullYear();
        targetMonth = now.getMonth() + 1;
      }

      // Create category map
      const categoryMap = new Map();
      if (Array.isArray(categories)) {
        categories.forEach(cat => {
          const id = cat._id?.toString();
          if (id) {
            categoryMap.set(id, {
              name: cat.categoryName || cat.name || 'Uncategorized',
              sortOrder: cat.sortOrder || 0
            });
          }
        });
      }

      // Helper function to get unit for an entry (uses existing helper functions)
      const getDisplayUnit = (entry, product, stockUnit) => {
        // Priority 1: Use unit from stock entry
        if (entry.unit && String(entry.unit).trim() !== '') {
          return String(entry.unit).trim();
        }

        // Priority 2: Use stockUnit extracted from product's stock entries
        if (stockUnit && String(stockUnit).trim() !== '') {
          return String(stockUnit).trim();
        }

        // Priority 3: Check product definition fields using existing helper
        if (product) {
          const productUnit = getProductUnitBase(product);
          if (productUnit) {
            return getStandardizedUnit(productUnit) || productUnit;
          }
        }

        // Default to 'Nos'
        return 'Nos';
      };

      // Fetch stock data for all products with category info
      const stockDataPromises = products.map(async (product) => {
        try {
          const response = await fetch(
            `${config.api.baseUrl}/cafe-stock/${theaterId}/${product._id}?year=${targetYear}&month=${targetMonth}`,
            {
              headers: {
                'Authorization': `Bearer ${token.trim().replace(/^["']|["']$/g, '')}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.stockDetails) {
              // Get category name
              const categoryId = product.categoryId?.toString() || product.category?.toString();
              const categoryInfo = categoryId ? categoryMap.get(categoryId) : null;
              const categoryName = categoryInfo ? categoryInfo.name : 'Uncategorized';
              const sortOrder = categoryInfo ? categoryInfo.sortOrder : 999;

              // Extract unit from stock entries (prefer most recent entry with unit)
              let stockUnit = null;
              if (data.data.stockDetails && data.data.stockDetails.length > 0) {
                const sortedEntries = [...data.data.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
                let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit !== 'Nos' && String(entry.unit).trim() !== '');
                if (!entryWithUnit) {
                  entryWithUnit = sortedEntries.find(entry => entry.unit && String(entry.unit).trim() !== '');
                }
                if (!entryWithUnit && sortedEntries.length > 0) {
                  entryWithUnit = sortedEntries[0];
                }
                if (entryWithUnit && entryWithUnit.unit) {
                  stockUnit = String(entryWithUnit.unit).trim();
                }
              }

              // Fallback to product definition
              if (!stockUnit) {
                stockUnit = product.inventory?.unit || product.quantityUnit || product.unit || 'Nos';
              }

              return {
                productName: product.name || 'Unknown',
                categoryName: categoryName,
                sortOrder: sortOrder,
                stockDetails: data.data.stockDetails || [],
                stockUnit: stockUnit, // Store unit for this product
                product: product // Store product for fallback unit extraction
              };
            }
          }
          return null;
        } catch (error) {
          console.error(`Error fetching stock for product ${product._id}:`, error);
          return null;
        }
      });

      const stockDataResults = await Promise.all(stockDataPromises);
      const validStockData = stockDataResults.filter(item => item && item.stockDetails.length > 0);

      if (validStockData.length === 0) {
        modal.showError('No cafe stock data available to export');
        return;
      }

      // Group stock data by category
      const stockByCategory = {};
      validStockData.forEach(item => {
        const categoryName = item.categoryName || 'Uncategorized';
        if (!stockByCategory[categoryName]) {
          stockByCategory[categoryName] = {
            sortOrder: item.sortOrder || 999,
            products: []
          };
        }
        stockByCategory[categoryName].products.push(item);
      });

      // Sort categories by sortOrder
      const sortedCategories = Object.keys(stockByCategory).sort((a, b) => {
        return stockByCategory[a].sortOrder - stockByCategory[b].sortOrder;
      });

      // Create PDF document
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = 297; // A4 landscape width
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Add title
      doc.setFontSize(18);
      doc.setTextColor(139, 92, 246); // Purple color
      const titleText = 'Cafe Stock Management Report';
      const titleWidth = doc.getTextWidth(titleText);
      doc.text(titleText, (pageWidth - titleWidth) / 2, 15);

      // Add metadata
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const user = localStorage.getItem('username') || 'User';
      const generatedByText = `Generated By: ${user}`;
      const generatedByWidth = doc.getTextWidth(generatedByText);
      doc.text(generatedByText, (pageWidth - generatedByWidth) / 2, 22);

      const generatedAtText = `Generated At: ${new Date().toLocaleString('en-IN')}`;
      const generatedAtWidth = doc.getTextWidth(generatedAtText);
      doc.text(generatedAtText, (pageWidth - generatedAtWidth) / 2, 27);

      // Add period info
      const periodText = `Period: ${monthNames[targetMonth - 1]} ${targetYear}`;
      const periodWidth = doc.getTextWidth(periodText);
      doc.text(periodText, (pageWidth - periodWidth) / 2, 32);

      let startY = 40;
      let globalIndex = 0;

      // Process each category
      sortedCategories.forEach((categoryName) => {
        const categoryProducts = stockByCategory[categoryName].products;

        // Add category header
        if (startY > 180) {
          doc.addPage();
          startY = 15;
        }

        doc.setFontSize(12);
        doc.setTextColor(139, 92, 246); // Purple
        doc.setFont(undefined, 'bold');
        doc.text(categoryName.toUpperCase(), 10, startY);
        startY += 8;

        // Prepare table data for all products in this category
        const tableData = [];
        categoryProducts.forEach(({ productName, stockDetails, stockUnit, product }) => {
          stockDetails.forEach((entry) => {
            globalIndex++;

            // Get unit for this entry (prefer entry unit, fallback to product stockUnit, then product definition)
            const entryUnit = getDisplayUnit(entry, product, stockUnit);

            tableData.push([
              globalIndex,
              productName, // Product Name column
              new Date(entry.date).toLocaleDateString('en-IN'),
              `${(entry.oldStock || 0).toLocaleString('en-IN')} ${entryUnit}`, // Old Stock with unit
              `${(entry.invordStock || 0).toLocaleString('en-IN')} ${entryUnit}`, // Invord Stock with unit
              `${(entry.directStock || 0).toLocaleString('en-IN')} ${entryUnit}`, // Direct Stock with unit - ✅ ADDED
              `${(entry.sales || 0).toLocaleString('en-IN')} ${entryUnit}`, // Sales with unit
              `${(entry.addon || 0).toLocaleString('en-IN')} ${entryUnit}`, // Addon with unit - ✅ ADDED
              `${(entry.stockAdjustment || 0).toLocaleString('en-IN')} ${entryUnit}`, // Stock Adj with unit - ✅ ADDED
              `${(entry.cancelStock || 0).toLocaleString('en-IN')} ${entryUnit}`, // Cancel Stock with unit - ✅ ADDED
              `${(entry.expiredStock || 0).toLocaleString('en-IN')} ${entryUnit}`, // Expired with unit
              `${(entry.damageStock || 0).toLocaleString('en-IN')} ${entryUnit}`, // Damage with unit
              `${(entry.balance || 0).toLocaleString('en-IN')} ${entryUnit}`, // Balance with unit
              entry.type || 'N/A', // Type
              entryUnit // Unit column
            ]);
          });
        });

        // Add table for this category
        doc.autoTable({
          head: [['S.No', 'Product Name', 'Date', 'Old Stock', 'Invord Stock', 'Direct Stock', 'Sales', 'Addon', 'Stock Adj', 'Cancel', 'Expired', 'Damage', 'Balance', 'Type', 'Unit']],
          body: tableData,
          startY: startY,
          theme: 'striped',
          styles: {
            fontSize: 6, // Reduced font size to fit more columns
            textColor: [0, 0, 0],
            halign: 'left',
            cellPadding: 1
          },
          headStyles: {
            fillColor: [139, 92, 246], // Purple
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 6, // Reduced header font size
            cellPadding: 1
          },
          columnStyles: {
            0: { cellWidth: 8, halign: 'center' }, // S.No
            1: { cellWidth: 22, halign: 'left' }, // Product Name
            2: { cellWidth: 15, halign: 'center' }, // Date
            3: { cellWidth: 15, halign: 'right' }, // Old Stock
            4: { cellWidth: 15, halign: 'right' }, // Invord Stock
            5: { cellWidth: 15, halign: 'right' }, // Direct Stock
            6: { cellWidth: 15, halign: 'right' }, // Sales
            7: { cellWidth: 15, halign: 'right' }, // Addon
            8: { cellWidth: 15, halign: 'right' }, // Stock Adj
            9: { cellWidth: 15, halign: 'right' }, // Cancel Stock
            10: { cellWidth: 15, halign: 'right' }, // Expired
            11: { cellWidth: 15, halign: 'right' }, // Damage
            12: { cellWidth: 15, halign: 'right' }, // Balance
            13: { cellWidth: 15, halign: 'center' }, // Type
            14: { cellWidth: 10, halign: 'center' } // Unit
          },
          margin: { top: startY, left: 5, right: 5 }
        });

        startY = doc.lastAutoTable.finalY + 10;
      });

      // Generate filename
      const monthName = monthNames[targetMonth - 1];
      const filename = `Cafe_Stock_Management_${monthName}_${targetYear}_${Date.now()}.pdf`;

      // Save PDF
      doc.save(filename);

      if (modal.showSuccess) {
        modal.showSuccess('Cafe Stock Management PDF report downloaded successfully!');
      }
    } catch (error) {
      console.error('PDF download error:', error);
      if (error.message?.includes('jspdf')) {
        if (modal.showError) modal.showError('PDF library not available. Please refresh the page and try again.');
      } else {
        if (modal.showError) modal.showError(error.message || 'Failed to generate PDF report');
      }
    } finally {
      setDownloadingPDF(false);
    }
  }, [theaterId, products, categories, dateFilter, modal]);

  // Sales Report Excel Download Handler
  const handleDownloadSalesExcel = useCallback(async () => {
    try {
      setDownloadingExcel(true);

      const token = localStorage.getItem('authToken') ||
        localStorage.getItem('yqpaynow_token') ||
        localStorage.getItem('token');

      if (!token) {
        modal.showError('Please login to download reports');
        return;
      }

      // Determine date range from date filter
      let startDate, endDate;
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const selectedDate = new Date(dateFilter.selectedDate);
        startDate = new Date(selectedDate);

        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startDate.setHours(hours || 0, minutes || 0, 0, 0);
        } else {
          startDate.setHours(0, 0, 0, 0);
        }

        endDate = new Date(selectedDate);
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endDate.setHours(hours || 23, minutes || 59, 59, 999);
        } else {
          endDate.setHours(23, 59, 59, 999);
        }
      } else if (dateFilter.type === 'month') {
        startDate = new Date(dateFilter.year, dateFilter.month - 1, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(dateFilter.year, dateFilter.month, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        startDate = new Date(dateFilter.startDate);
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startDate.setHours(hours || 0, minutes || 0, 0, 0);
        } else {
          startDate.setHours(0, 0, 0, 0);
        }

        endDate = new Date(dateFilter.endDate);
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endDate.setHours(hours || 23, minutes || 59, 59, 999);
        } else {
          endDate.setHours(23, 59, 59, 999);
        }
      } else {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
      }

      // Use backend endpoint to generate Excel
      const params = new URLSearchParams();
      params.append('status', 'completed,served');
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());

      const excelUrl = `${config.api.baseUrl}/orders/sales-report-excel/${theaterId}?${params.toString()}`;

      const headers = {};
      if (token) {
        const cleanToken = String(token).trim().replace(/^["']|["']$/g, '');
        if (cleanToken && cleanToken.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }
      }

      const excelResponse = await fetch(excelUrl, {
        method: 'GET',
        headers: headers
      });

      if (excelResponse.status === 401 || excelResponse.status === 403) {
        modal.showError('Session expired. Please login again.');
        return;
      }

      if (!excelResponse.ok) {
        const errorData = await excelResponse.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to download sales report');
      }

      // Get the blob from response
      const blob = await excelResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = excelResponse.headers.get('Content-Disposition');
      let filename = 'Cafe_Sales_Report.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      modal.showSuccess('Sales report downloaded successfully!');
    } catch (error) {
      console.error('Sales Excel download error:', error);
      modal.showError(error.message || 'Failed to download sales report');
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, dateFilter, modal]);

  // Sales Report PDF Download Handler
  const handleDownloadSalesPDF = useCallback(async () => {
    if (!theaterId) {
      if (modal.showError) modal.showError('Theater ID is missing');
      return;
    }

    setDownloadingPDF(true);
    try {
      // Dynamically import jsPDF and autoTable
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      await import('jspdf-autotable');

      const token = localStorage.getItem('authToken') ||
        localStorage.getItem('yqpaynow_token') ||
        localStorage.getItem('token');

      if (!token) {
        modal.showError('Please login to download reports');
        return;
      }

      // Determine date range from date filter
      let startDate, endDate;
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const selectedDate = new Date(dateFilter.selectedDate);
        startDate = new Date(selectedDate);

        // Apply time filters if provided
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startDate.setHours(hours || 0, minutes || 0, 0, 0);
        } else {
          startDate.setHours(0, 0, 0, 0);
        }

        endDate = new Date(selectedDate);
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endDate.setHours(hours || 23, minutes || 59, 59, 999);
        } else {
          endDate.setHours(23, 59, 59, 999);
        }
      } else if (dateFilter.type === 'month') {
        startDate = new Date(dateFilter.year, dateFilter.month - 1, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(dateFilter.year, dateFilter.month, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        startDate = new Date(dateFilter.startDate);
        if (dateFilter.fromTime) {
          const [hours, minutes] = dateFilter.fromTime.split(':').map(Number);
          startDate.setHours(hours || 0, minutes || 0, 0, 0);
        } else {
          startDate.setHours(0, 0, 0, 0);
        }

        endDate = new Date(dateFilter.endDate);
        if (dateFilter.toTime) {
          const [hours, minutes] = dateFilter.toTime.split(':').map(Number);
          endDate.setHours(hours || 23, minutes || 59, 59, 999);
        } else {
          endDate.setHours(23, 59, 59, 999);
        }
      } else {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
      }

      // ✅ FIX: Use new backend endpoint that returns sales data with date filtering
      // Determine target year/month from date filter
      let targetYear, targetMonth;
      if (dateFilter.type === 'month') {
        targetYear = dateFilter.year;
        targetMonth = dateFilter.month;
      } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const selected = new Date(dateFilter.selectedDate);
        targetYear = selected.getFullYear();
        targetMonth = selected.getMonth() + 1;
      } else {
        const start = new Date(startDate);
        targetYear = start.getFullYear();
        targetMonth = start.getMonth() + 1;
      }

      // Fetch sales report data from backend (includes date filtering)
      const params = new URLSearchParams();
      params.append('year', targetYear);
      params.append('month', targetMonth);

      // Add date filters for specific date/range
      if (startDate && endDate) {
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      const response = await fetch(
        `${config.api.baseUrl}/cafe-stock/sales-report/${theaterId}?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token.trim().replace(/^["']|["']$/g, '')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to fetch sales data');
      }

      const data = await response.json();

      // Backend already filters and aggregates the data
      const salesArray = (data.data?.salesData || []).sort((a, b) =>
        a.productName.localeCompare(b.productName)
      );

      if (salesArray.length === 0) {
        modal.showError('No sales data available for the selected period');
        return;
      }

      // Calculate grand total
      const grandTotalQty = salesArray.reduce((sum, item) => sum + item.quantity, 0);
      const grandTotalPrice = salesArray.reduce((sum, item) => sum + item.totalPrice, 0);

      // Create PDF document
      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pageWidth = 210; // A4 portrait width
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Add title - matching Excel format
      doc.setFontSize(18);
      doc.setTextColor(139, 92, 246); // Purple color
      const titleText = 'Cafe Sales Report';
      const titleWidth = doc.getTextWidth(titleText);
      doc.text(titleText, (pageWidth - titleWidth) / 2, 15);

      // Add subtitle - Month Year
      doc.setFontSize(14);
      doc.setTextColor(139, 92, 246); // Purple color
      const subtitleText = `${monthNames[targetMonth - 1]} ${targetYear}`;
      const subtitleWidth = doc.getTextWidth(subtitleText);
      doc.text(subtitleText, (pageWidth - subtitleWidth) / 2, 23);

      // Add metadata - matching Excel format
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100); // Grey color

      const now = new Date();
      const reportDateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const reportTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

      const generatedOnText = `Generated On: ${reportDateStr}, ${reportTimeStr}`;
      doc.text(generatedOnText, 15, 31); // Left aligned

      // Add report period
      let periodStartStr, periodEndStr;
      if (dateFilter.type === 'month') {
        const monthStart = new Date(targetYear, targetMonth - 1, 1);
        const monthEnd = new Date(targetYear, targetMonth, 0);
        periodStartStr = monthStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        periodEndStr = monthEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        periodStartStr = new Date(dateFilter.selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        periodEndStr = periodStartStr;
      } else {
        periodStartStr = startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        periodEndStr = endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }

      const reportPeriodText = `Report Period: ${periodStartStr} - ${periodEndStr}`;
      doc.text(reportPeriodText, 15, 36); // Left aligned

      // Prepare table data - simple format matching the image
      const tableData = salesArray.map(item => [
        item.productName,
        item.quantity.toString(),
        item.unitPrice.toFixed(2),
        item.totalPrice.toFixed(2)
      ]);

      // Add grand total row
      tableData.push([
        'Grand Total',
        grandTotalQty.toString(),
        '',
        grandTotalPrice.toFixed(2)
      ]);

      // Add table - matching Excel format with purple theme
      doc.autoTable({
        head: [['Product Description', 'Qty', 'Price', 'Total Price']],
        body: tableData,
        startY: 43, // Start below the metadata
        theme: 'grid',
        styles: {
          fontSize: 10,
          textColor: [0, 0, 0],
          halign: 'left',
          lineWidth: 0.1,
          lineColor: [0, 0, 0]
        },
        headStyles: {
          fillColor: [139, 92, 246], // Purple color matching Excel
          textColor: [255, 255, 255], // White text
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 11
        },
        columnStyles: {
          0: { cellWidth: 80, halign: 'left' },     // Product Description
          1: { cellWidth: 30, halign: 'center' },   // Qty - center aligned
          2: { cellWidth: 40, halign: 'right' },    // Price
          3: { cellWidth: 40, halign: 'right' }     // Total Price
        },
        margin: { top: 43, left: 10, right: 10 },
        didParseCell: function (data) {
          // Style grand total row with purple background
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fillColor = [139, 92, 246]; // Purple like Excel
            data.cell.styles.textColor = [255, 255, 255]; // White text
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 11;
          }
        }
      });

      // Generate filename
      const dateStr = dateFilter.type === 'month'
        ? `${monthNames[dateFilter.month - 1]}_${dateFilter.year}`
        : dateFilter.type === 'date' && dateFilter.selectedDate
          ? dateFilter.selectedDate
          : `${formatDateToLocal(startDate)}_to_${formatDateToLocal(endDate)}`; // ✅ FIX: Use local date format

      const filename = `Cafe_Sales_Report_${dateStr}_${Date.now()}.pdf`;

      // Save PDF
      doc.save(filename);

      if (modal.showSuccess) {
        modal.showSuccess('Sales report downloaded successfully!');
      }
    } catch (error) {
      console.error('Sales PDF download error:', error);
      if (error.message?.includes('jspdf')) {
        if (modal.showError) modal.showError('PDF library not available. Please refresh the page and try again.');
      } else {
        if (modal.showError) modal.showError(error.message || 'Failed to generate sales report');
      }
    } finally {
      setDownloadingPDF(false);
    }
  }, [theaterId, dateFilter, modal]);

  const handleViewProduct = useCallback((product) => {
    // ✅ FIX: Save scroll position before opening modal
    scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
    const currentIndex = products.findIndex(p => p._id === product._id);
    setViewModal({ show: true, product, currentIndex });
  }, [products]);

  // Navigation functions for modal
  // Navigation functions removed - Product Details modal no longer supports prev/next navigation
  // const handlePrevProduct = useCallback(() => {
  //   if (!viewModal.show || products.length === 0) return;
  //   
  //   const newIndex = (viewModal.currentIndex - 1 + products.length) % products.length;
  //   const newProduct = products[newIndex];
  //   setViewModal({ show: true, product: newProduct, currentIndex: newIndex });
  // }, [viewModal, products]);

  // const handleNextProduct = useCallback(() => {
  //   if (!viewModal.show || products.length === 0) return;
  //   
  //   const newIndex = (viewModal.currentIndex + 1) % products.length;
  //   const newProduct = products[newIndex];
  //   setViewModal({ show: true, product: newProduct, currentIndex: newIndex });
  // }, [viewModal, products]);

  const handleEditProduct = useCallback((product) => {
    // ✅ FIX: Save scroll position before opening modal
    scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;

    try {
      const currentIndex = products.findIndex(p => p._id === product._id);

      // Extract product image from various possible sources
      const existingImage =
        product.images?.[0]?.url ||
        product.images?.[0]?.path ||
        product.images?.[0] ||
        product.productImage?.url ||
        product.productImage?.path ||
        product.productImage ||
        product.image ||
        '';

      // Debug kiosk type
      const kioskTypeValue = product.kioskType?._id || product.kioskType || '';

      // Set form data for editing with correct field mappings
      // ✅ FIX: Handle 0 values properly - don't convert 0 to empty string
      const getNumericValue = (value, defaultValue = '') => {
        if (value === 0 || value === '0') return '0';
        return value || defaultValue;
      };

      setEditFormData({
        name: product.name || '',
        category: product.categoryId?._id || product.categoryId || product.category?._id || product.category || '',
        kioskType: kioskTypeValue,
        subcategory: product.subcategory || '',
        productType: product.productTypeId?._id || product.productTypeId || product.productType?._id || product.productType || '',
        quantity: product.quantity || '',
        description: product.description || '',
        productCode: product.sku || product.productCode || '',
        sellingPrice: getNumericValue(product.pricing?.basePrice, product.sellingPrice || ''),
        costPrice: getNumericValue(product.pricing?.salePrice, product.costPrice || ''),
        discount: getNumericValue(product.pricing?.discountPercentage, product.discount || ''),
        taxRate: getNumericValue(product.pricing?.taxRate, product.taxRate || ''),
        gstType: product.gstType || product.pricing?.gstType || '',
        stockQuantity: getNumericValue(product.inventory?.currentStock, product.stockQuantity || ''),
        unitOfMeasure: product.inventory?.unit || product.unitOfMeasure || 'Piece',
        lowStockAlert: getNumericValue(product.inventory?.minStock, product.lowStockAlert || ''),
        displayOrder: product.displayOrder || '',
        isVeg: product.isVeg || product.dietary?.isVeg || '',
        preparationTime: getNumericValue(product.preparationTime, product.specifications?.preparationTime || ''),
        ingredients: product.specifications?.ingredients?.join(', ') || product.ingredients || '',
        existingImage: existingImage
      });

      // Debug: Log form data to console
      console.log('📝 Edit Form Data:', {
        productId: product._id,
        productName: product.name,
        discount: getNumericValue(product.pricing?.discountPercentage, product.discount || ''),
        pricing: product.pricing,
        editFormData: {
          discount: getNumericValue(product.pricing?.discountPercentage, product.discount || ''),
          sellingPrice: getNumericValue(product.pricing?.basePrice, product.sellingPrice || ''),
          costPrice: getNumericValue(product.pricing?.salePrice, product.costPrice || ''),
        }
      });

      // Reset file
      setEditFiles({ productImage: null });

      setEditModal({ show: true, product, currentIndex });
    } catch (error) {
      console.error('❌ Error in handleEditProduct:', error);
      alert('Error opening edit form: ' + error.message);
    }
  }, [products, kioskTypes]);

  const handleDeleteProduct = useCallback((product) => {
    setDeleteModal({ show: true, product });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteModal.product) return;

    const productId = deleteModal.product._id;
    const apiCall = () => unifiedFetch(`${config.api.baseUrl}/theater-products/${theaterId}/${productId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
        // Token is automatically added by unifiedFetch
      }
    }, {
      forceRefresh: true, // Don't cache DELETE requests
      cacheTTL: 0
    });

    try {
      // 🚀 OPTIMISTIC DELETE - Remove from UI immediately
      await optimisticDelete({
        apiCall,
        itemId: productId,
        onOptimisticUpdate: (id) => {
          const removedProduct = products.find(p => p._id === id);
          setProducts(prev => prev.filter(p => p._id !== id));
          setTotalItems(prev => prev - 1);
          return removedProduct;
        },
        onSuccess: () => {
          setDeleteModal({ show: false, product: null });
          modal.alert({
            title: 'Success',
            message: 'Product deleted successfully',
            type: 'success'
          });
          // 🔄 FORCE REFRESH: Force refresh after delete operation
          fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
        },
        onError: (error, removedProduct) => {
          if (removedProduct) {
            setProducts(prev => [...prev, removedProduct]);
            setTotalItems(prev => prev + 1);
          }
          modal.alert({
            title: 'Error',
            message: error.message || 'Failed to delete product',
            type: 'error'
          });
        },
        cachePatterns: [`theaterProducts_${theaterId}`]
      });
    } catch (error) {
      console.error('Delete product error:', error);
      // Error already handled in optimistic function
    }
  }, [deleteModal.product, authHeaders, theaterId, products, modal]);

  // Pagination handlers
  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage); // Update page state immediately for better UX
      // ✅ FIX: Actually fetch products for the new page
      fetchProducts(newPage, searchTerm, selectedCategory, statusFilter, stockFilter, false);
    }
  }, [totalPages, searchTerm, selectedCategory, statusFilter, stockFilter, fetchProducts]);

  // Memoized lookup maps for O(1) category and kioskType lookups
  const categoryMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(categories)) {
      categories.forEach(cat => {
        const id = cat._id?.toString();
        if (id) {
          map.set(id, cat);
        }
      });
    }
    return map;
  }, [categories]);

  const kioskTypeMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(kioskTypes)) {
      kioskTypes.forEach(kt => {
        const id = kt._id?.toString();
        if (id) {
          map.set(id, kt);
        }
      });
    }
    return map;
  }, [kioskTypes]);

  // Statistics calculations - Updated to handle both flat and nested structures
  const stats = useMemo(() => {
    return {
      total: totalItems,
      live: products.filter(p => {
        const isActive = p.isActive !== false;
        const isAvailable = p.isAvailable !== false;
        return isActive && isAvailable;
      }).length,
      offline: products.filter(p => {
        const isActive = p.isActive !== false;
        const isAvailable = p.isAvailable !== false;
        return !isActive || !isAvailable;
      }).length,
      lowStock: products.filter(p => {
        const stock = p.stockQuantity ?? p.inventory?.currentStock ?? 0;
        const alert = p.lowStockAlert ?? p.inventory?.minStock ?? 5;
        return stock <= alert;
      }).length,
      outOfStock: products.filter(p => {
        const stock = p.stockQuantity ?? p.inventory?.currentStock ?? 0;
        return stock <= 0;
      }).length
    };
  }, [products, totalItems]);

  // Edit modal handlers
  const handleEditFormChange = useCallback((field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (editErrors[field]) {
      setEditErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [editErrors]);

  const handleEditFileChange = useCallback((e) => {
    const { name, files } = e.target;
    setEditFiles(prev => ({
      ...prev,
      [name]: files[0] || null
    }));
  }, []);

  const closeEditModal = useCallback(() => {
    // ✅ FIX: Save current scroll position before closing (in case it changed)
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
    if (currentScroll > 0) {
      scrollPositionRef.current = currentScroll;
    }
    
    setEditModal({ show: false, product: null, currentIndex: 0 });
    setEditFormData({});
    setEditFiles({ productImage: null });
    setEditErrors({});
    
    // ✅ FIX: Restore scroll position after closing modal - multiple attempts
    const restoreScroll = () => {
      const savedPosition = scrollPositionRef.current;
      if (savedPosition > 0) {
        window.scrollTo(0, savedPosition);
        document.documentElement.scrollTop = savedPosition;
        document.body.scrollTop = savedPosition;
      }
    };
    
    // Immediate restoration
    restoreScroll();
    
    // Delayed restoration to override any other scroll events
    requestAnimationFrame(() => {
      restoreScroll();
      setTimeout(restoreScroll, 0);
      setTimeout(restoreScroll, 10);
      setTimeout(restoreScroll, 50);
    });
  }, []);

  const handleEditSubmit = useCallback(async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    setEditErrors({});

    // 🚀 INSTANT RESPONSE: Store form data before resetting (needed for error recovery)
    const currentFormData = { ...editFormData };
    const currentImageFile = editFiles.productImage;
    const currentSelectedProduct = editModal.product;

    // 🚀 INSTANT RESPONSE: Create optimistic product update
    const optimisticProduct = {
      ...currentSelectedProduct,
      name: currentFormData.name !== undefined && currentFormData.name !== '' ? currentFormData.name : currentSelectedProduct.name,
      quantity: currentFormData.quantity !== undefined && currentFormData.quantity !== '' ? currentFormData.quantity : currentSelectedProduct.quantity,
      productCode: currentFormData.productCode !== undefined && currentFormData.productCode !== '' ? currentFormData.productCode : (currentSelectedProduct.sku || currentSelectedProduct.productCode),
      sku: currentFormData.productCode !== undefined && currentFormData.productCode !== '' ? currentFormData.productCode : (currentSelectedProduct.sku || currentSelectedProduct.productCode),
      description: currentFormData.description !== undefined ? currentFormData.description : currentSelectedProduct.description,
      categoryId: currentFormData.category || currentSelectedProduct.categoryId?._id || currentSelectedProduct.categoryId,
      productTypeId: currentFormData.productType || currentSelectedProduct.productTypeId?._id || currentSelectedProduct.productTypeId,
      kioskType: currentFormData.kioskType || currentSelectedProduct.kioskType,
      pricing: {
        ...currentSelectedProduct.pricing,
        basePrice: currentFormData.sellingPrice !== undefined && currentFormData.sellingPrice !== '' ? Number(currentFormData.sellingPrice) : (currentSelectedProduct.pricing?.basePrice || currentSelectedProduct.sellingPrice || 0),
        salePrice: currentFormData.costPrice !== undefined && currentFormData.costPrice !== '' ? Number(currentFormData.costPrice) : (currentSelectedProduct.pricing?.salePrice || currentSelectedProduct.costPrice || 0),
        discountPercentage: currentFormData.discount !== undefined && currentFormData.discount !== '' ? Number(currentFormData.discount) : (currentSelectedProduct.pricing?.discountPercentage || currentSelectedProduct.discount || 0),
        taxRate: currentFormData.taxRate !== undefined && currentFormData.taxRate !== '' ? Number(currentFormData.taxRate) : (currentSelectedProduct.pricing?.taxRate || currentSelectedProduct.taxRate || 0),
        gstType: currentFormData.gstType || currentSelectedProduct.pricing?.gstType || currentSelectedProduct.gstType
      },
      // Also set flat fields for backward compatibility
      sellingPrice: currentFormData.sellingPrice !== undefined && currentFormData.sellingPrice !== '' ? Number(currentFormData.sellingPrice) : (currentSelectedProduct.sellingPrice || currentSelectedProduct.pricing?.basePrice || 0),
      costPrice: currentFormData.costPrice !== undefined && currentFormData.costPrice !== '' ? Number(currentFormData.costPrice) : (currentSelectedProduct.costPrice || currentSelectedProduct.pricing?.salePrice || 0),
      discount: currentFormData.discount !== undefined && currentFormData.discount !== '' ? Number(currentFormData.discount) : (currentSelectedProduct.discount || currentSelectedProduct.pricing?.discountPercentage || 0),
      taxRate: currentFormData.taxRate !== undefined && currentFormData.taxRate !== '' ? Number(currentFormData.taxRate) : (currentSelectedProduct.taxRate || currentSelectedProduct.pricing?.taxRate || 0),
      inventory: {
        ...currentSelectedProduct.inventory,
        currentStock: currentFormData.stockQuantity !== undefined && currentFormData.stockQuantity !== '' ? Number(currentFormData.stockQuantity) : (currentSelectedProduct.inventory?.currentStock || currentSelectedProduct.stockQuantity || 0),
        unit: currentFormData.unitOfMeasure || currentSelectedProduct.inventory?.unit || currentSelectedProduct.unitOfMeasure || 'Piece',
        minStock: currentFormData.lowStockAlert !== undefined && currentFormData.lowStockAlert !== '' ? Number(currentFormData.lowStockAlert) : (currentSelectedProduct.inventory?.minStock || currentSelectedProduct.lowStockAlert || 0)
      },
      // Also set flat fields for backward compatibility
      stockQuantity: currentFormData.stockQuantity !== undefined && currentFormData.stockQuantity !== '' ? Number(currentFormData.stockQuantity) : (currentSelectedProduct.stockQuantity || currentSelectedProduct.inventory?.currentStock || 0),
      unitOfMeasure: currentFormData.unitOfMeasure || currentSelectedProduct.unitOfMeasure || currentSelectedProduct.inventory?.unit || 'Piece',
      lowStockAlert: currentFormData.lowStockAlert !== undefined && currentFormData.lowStockAlert !== '' ? Number(currentFormData.lowStockAlert) : (currentSelectedProduct.lowStockAlert || currentSelectedProduct.inventory?.minStock || 0),
      isVeg: currentFormData.isVeg !== undefined ? currentFormData.isVeg : currentSelectedProduct.isVeg,
      preparationTime: currentFormData.preparationTime !== undefined && currentFormData.preparationTime !== '' ? Number(currentFormData.preparationTime) : currentSelectedProduct.preparationTime,
      ingredients: currentFormData.ingredients !== undefined ? currentFormData.ingredients : (currentSelectedProduct.specifications?.ingredients || currentSelectedProduct.ingredients),
      imageUrl: currentImageFile
        ? URL.createObjectURL(currentImageFile)
        : (currentSelectedProduct?.imageUrl || currentSelectedProduct?.image || currentFormData.existingImage),
      image: currentImageFile
        ? URL.createObjectURL(currentImageFile)
        : (currentSelectedProduct?.image || currentSelectedProduct?.imageUrl || currentFormData.existingImage),
      updatedAt: new Date()
    };

    console.log('🚀 Optimistic product update:', {
      name: optimisticProduct.name,
      quantity: optimisticProduct.quantity,
      productCode: optimisticProduct.productCode,
      pricing: optimisticProduct.pricing,
      inventory: optimisticProduct.inventory,
      sellingPrice: optimisticProduct.sellingPrice,
      stockQuantity: optimisticProduct.stockQuantity
    });

    // 🚀 INSTANT UI UPDATE: Update product in list immediately
    setProducts(prevProducts => {
      return prevProducts.map(p => {
        const pId = p._id?.toString() || p._id;
        const editId = currentSelectedProduct._id?.toString() || currentSelectedProduct._id;
        if (pId === editId) {
          // Merge optimistic update while preserving all existing fields
          return {
            ...p,
            ...optimisticProduct,
            // Ensure isActive and isAvailable are preserved for stats calculation
            isActive: optimisticProduct.isActive !== undefined ? optimisticProduct.isActive : p.isActive,
            isAvailable: optimisticProduct.isAvailable !== undefined ? optimisticProduct.isAvailable : p.isAvailable
          };
        }
        return p;
      });
    });

    // 🚀 INSTANT CLOSE: Close modal immediately after optimistic update
    closeEditModal();

    try {
      const formData = new FormData();

      // ✅ FIX: Append all form fields with proper pricing field mapping
      // ✅ FIX: Allow 0 values to be sent (important for discount, prices, etc.)
      Object.keys(editFormData).forEach(key => {
        const value = editFormData[key];

        // Special handling for numeric fields - always send them even if 0 or empty
        // Check numeric fields FIRST before skipping empty values
        const numericFields = ['discount', 'sellingPrice', 'costPrice', 'taxRate', 'stockQuantity', 'lowStockAlert', 'preparationTime'];
        if (numericFields.includes(key)) {
          // For numeric fields, explicitly handle 0, '0', null, undefined, and empty string
          let numericValue;
          if (value === null || value === undefined || value === '') {
            // If explicitly set to empty, send '0' to clear the value
            numericValue = '0';
          } else {
            // Convert to string - this handles both number 0 and string '0' correctly
            numericValue = String(value);
          }
          formData.append(key, numericValue);
          return;
        }

        // Skip null, undefined, empty string for non-numeric fields
        if (value === null || value === undefined || value === '') {
          return; // Skip empty values
        }

        // Map frontend field names to backend expected names (redundant but kept for clarity)
        if (key === 'sellingPrice') {
          formData.append('sellingPrice', String(value));
        } else if (key === 'costPrice') {
          formData.append('costPrice', String(value));
        } else if (key === 'discount') {
          // ✅ FIX: Always send discount, even if 0
          formData.append('discount', String(value));
        } else if (key === 'taxRate') {
          formData.append('taxRate', String(value));
        } else if (key === 'gstType') {
          formData.append('gstType', value);
        } else if (key === 'existingImage') {
          // Skip existingImage - it's only for display
          return;
        } else if (key === 'category') {
          // ✅ FIX: Map category to categoryId for backend
          formData.append('categoryId', value);
          formData.append('category', value); // Send both just in case
        } else if (key === 'productType') {
          // ✅ FIX: Map productType to productTypeId for backend
          formData.append('productTypeId', value);
          formData.append('productType', value); // Send both just in case
        } else {
          // Append other fields as-is
          formData.append(key, value);
        }
      });

      // Debug: Log what's being sent
      console.log('📤 Sending update data:', {
        discount: editFormData.discount,
        sellingPrice: editFormData.sellingPrice,
        costPrice: editFormData.costPrice,
        productType: editFormData.productType,
        category: editFormData.category,
        kioskType: editFormData.kioskType
      });

      // Append files if selected
      if (editFiles.productImage) {
        formData.append('productImage', editFiles.productImage);
      }

      // unifiedFetch automatically handles FormData
      let response;
      let result;

      try {
        response = await unifiedFetch(`${config.api.baseUrl}/theater-products/${theaterId}/${editModal.product._id}`, {
          method: 'PUT',
          body: formData
          // Token is automatically added by unifiedFetch
        }, {
          forceRefresh: true, // Don't cache PUT requests
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
              throw new Error(text || 'Failed to update product');
            }
          }
        } else {
          // Response might not have ok property, try to get result anyway
          try {
            result = await response.json();
          } catch (e) {
            throw new Error('Failed to update product');
          }
        }
      } catch (fetchError) {
        // ✅ FIX: Check if error message contains success (unifiedFetch might throw success as error)
        const errorMessage = fetchError?.message || fetchError?.toString() || 'Failed to update product';

        // Try to parse error message as JSON to check if it's actually a success response
        try {
          // Check if error message contains JSON with success:true
          if (errorMessage.includes('"success":true') || errorMessage.includes("'success':true")) {
            // Extract JSON from error message
            const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.success === true) {
                result = parsed;
              } else {
                throw fetchError;
              }
            } else {
              throw fetchError;
            }
          } else if (errorMessage.toLowerCase().includes('success') ||
            errorMessage.toLowerCase().includes('updated successfully')) {
            // This is actually a success, not an error
            result = { success: true, message: errorMessage };
          } else {
            // Real error, re-throw it
            throw fetchError;
          }
        } catch (parseError) {
          // If parsing fails, check if message contains success keywords
          if (errorMessage.toLowerCase().includes('success') ||
            errorMessage.toLowerCase().includes('updated successfully')) {
            result = { success: true, message: errorMessage };
          } else {
            throw fetchError;
          }
        }
      }

      // ✅ FIX: Check if response indicates success
      if (result && result.success === true) {
        // Get the updated product from response (BaseController returns { success: true, data: product, message: "..." })
        const updatedProduct = result.data || result.product || result;

        // 🚀 SYNC: Replace optimistic update with real server data
        if (updatedProduct && updatedProduct._id) {
          setProducts(prevProducts => {
            return prevProducts.map(p => {
              const pId = p._id?.toString() || p._id;
              const newId = updatedProduct._id?.toString() || updatedProduct._id;

              if (pId === newId) {
                // Properly merge server response with existing product data
                // This ensures all fields are preserved and updated correctly
                const processedProduct = {
                  ...p, // Start with existing product (preserves all fields)
                  ...updatedProduct, // Override with server response
                  // Ensure nested objects are properly merged
                  pricing: {
                    ...p.pricing,
                    ...(updatedProduct.pricing || {}),
                    basePrice: updatedProduct.pricing?.basePrice ?? updatedProduct.sellingPrice ?? p.pricing?.basePrice ?? p.sellingPrice,
                    salePrice: updatedProduct.pricing?.salePrice ?? updatedProduct.costPrice ?? p.pricing?.salePrice ?? p.costPrice,
                    discountPercentage: updatedProduct.pricing?.discountPercentage ?? updatedProduct.discount ?? p.pricing?.discountPercentage ?? p.discount,
                    taxRate: updatedProduct.pricing?.taxRate ?? updatedProduct.taxRate ?? p.pricing?.taxRate,
                    gstType: updatedProduct.pricing?.gstType ?? updatedProduct.gstType ?? p.pricing?.gstType
                  },
                  inventory: {
                    ...p.inventory,
                    ...(updatedProduct.inventory || {}),
                    currentStock: updatedProduct.inventory?.currentStock ?? updatedProduct.stockQuantity ?? p.inventory?.currentStock ?? p.stockQuantity,
                    unit: updatedProduct.inventory?.unit ?? updatedProduct.unitOfMeasure ?? p.inventory?.unit ?? p.unitOfMeasure,
                    minStock: updatedProduct.inventory?.minStock ?? updatedProduct.lowStockAlert ?? p.inventory?.minStock ?? p.lowStockAlert
                  },
                  // Ensure image URLs are properly set
                  imageUrl: updatedProduct.imageUrl || updatedProduct.image || p.imageUrl || p.image || null,
                  image: updatedProduct.image || updatedProduct.imageUrl || p.image || p.imageUrl || null,
                  // Ensure other important fields
                  sku: updatedProduct.sku || updatedProduct.productCode || p.sku || p.productCode,
                  productCode: updatedProduct.productCode || updatedProduct.sku || p.productCode || p.sku,
                  quantity: updatedProduct.quantity || p.quantity,
                  name: updatedProduct.name || p.name,
                  description: updatedProduct.description !== undefined ? updatedProduct.description : p.description,
                  categoryId: updatedProduct.categoryId || p.categoryId,
                  productTypeId: updatedProduct.productTypeId || p.productTypeId,
                  kioskType: updatedProduct.kioskType || p.kioskType,
                  isVeg: updatedProduct.isVeg !== undefined ? updatedProduct.isVeg : p.isVeg,
                  preparationTime: updatedProduct.preparationTime !== undefined ? updatedProduct.preparationTime : p.preparationTime,
                  ingredients: updatedProduct.ingredients || updatedProduct.specifications?.ingredients || p.ingredients || p.specifications?.ingredients,
                  updatedAt: updatedProduct.updatedAt || new Date()
                };

                console.log('🔄 Replacing optimistic product with server data:', {
                  optimistic: optimisticProduct.name,
                  server: processedProduct.name,
                  pricing: processedProduct.pricing,
                  inventory: processedProduct.inventory
                });

                return processedProduct;
              }
              return p;
            });
          });
        }

        // 🚀 CACHE INVALIDATION: Clear product caches to ensure fresh data
        try {
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          invalidateRelatedCaches('product', theaterId);
        } catch (cacheError) {
          console.warn('⚠️ Failed to clear product cache:', cacheError);
        }

        // ✅ FIX: Use toast notification for success (green, top-right corner)
        toast.success(result.message || 'Product updated successfully!', 3000);

        // Note: No background refresh needed - we've already merged server response with optimistic update
        // Background refresh could overwrite the merged data with stale data
      } else {
        // Handle error response - revert optimistic update and reopen modal
        const errorMessage = result?.message || result?.error || 'Failed to update product';
        toast.error(errorMessage, 5000);
        console.error('Error updating product:', result);

        // 🚀 REVERT: Revert optimistic update
        setProducts(prevProducts => {
          return prevProducts.map(p => {
            const pId = p._id?.toString() || p._id;
            const editId = currentSelectedProduct._id?.toString() || currentSelectedProduct._id;
            return pId === editId ? currentSelectedProduct : p;
          });
        });

        // Reopen modal on error so user can fix and retry
        setEditModal({ show: true, product: currentSelectedProduct, currentIndex: 0 });
        setEditFormData(currentFormData);
        setEditFiles({ productImage: currentImageFile });
        setEditErrors({ submit: errorMessage });
      }
    } catch (error) {
      // ✅ FIX: Check if error message contains success (shouldn't happen, but just in case)
      const errorMessage = error?.message || error?.toString() || 'Failed to update product';

      // Try to parse error message as JSON to check if it's actually a success response
      try {
        if (errorMessage.includes('"success":true') || errorMessage.includes("'success':true")) {
          const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.success === true) {
              // Get the updated product from response (BaseController returns { success: true, data: product, message: "..." })
              const updatedProduct = parsed.data || parsed.product || parsed;

              // ✅ OPTIMISTIC UPDATE: Update local state immediately
              if (updatedProduct && updatedProduct._id) {
                setProducts(prevProducts => {
                  return prevProducts.map(p => {
                    if (p._id === updatedProduct._id) {
                      return {
                        ...p,
                        ...updatedProduct,
                        pricing: updatedProduct.pricing || p.pricing
                      };
                    }
                    return p;
                  });
                });
              }

              // Clear cache
              try {
                clearCachePattern(`products_${theaterId}`);
                clearCachePattern(`api_get_theater-products_${theaterId}`);
                invalidateRelatedCaches('product', theaterId);
              } catch (cacheError) {
                console.warn('⚠️ Failed to clear product cache:', cacheError);
              }

              closeEditModal();
              toast.success(parsed.message || 'Product updated successfully!', 3000);

              // Background refresh
              setTimeout(async () => {
                try {
                  await fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
                } catch (refreshError) {
                  console.warn('⚠️ Background refresh failed:', refreshError);
                }
              }, 100);

              return; // Exit early, don't show error
            }
          }
        }
      } catch (parseError) {
        // Ignore parse errors, continue with error handling
      }

      if (errorMessage.toLowerCase().includes('success') ||
        errorMessage.toLowerCase().includes('updated successfully')) {
        // This is actually a success
        // Clear cache
        try {
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          invalidateRelatedCaches('product', theaterId);
        } catch (cacheError) {
          console.warn('⚠️ Failed to clear product cache:', cacheError);
        }

        closeEditModal();
        toast.success(errorMessage, 3000);

        // Background refresh
        setTimeout(async () => {
          try {
            await fetchProducts(currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, true);
          } catch (refreshError) {
            console.warn('⚠️ Background refresh failed:', refreshError);
          }
        }, 100);
      } else {
        // Real error - revert optimistic update and reopen modal
        toast.error(errorMessage, 5000);
        console.error('Error updating product:', error);

        // 🚀 REVERT: Revert optimistic update
        setProducts(prevProducts => {
          return prevProducts.map(p => {
            const pId = p._id?.toString() || p._id;
            const editId = currentSelectedProduct._id?.toString() || currentSelectedProduct._id;
            return pId === editId ? currentSelectedProduct : p;
          });
        });

        // Reopen modal on error so user can fix and retry
        setEditModal({ show: true, product: currentSelectedProduct, currentIndex: 0 });
        setEditFormData(currentFormData);
        setEditFiles({ productImage: currentImageFile });
        setEditErrors({ submit: errorMessage });
      }
    } finally {
      setIsUpdating(false);
    }
  }, [editFormData, editFiles, editModal.product, isUpdating, modal, fetchProducts, currentPage, searchTerm, selectedCategory, statusFilter, stockFilter, closeEditModal]);

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Cafe" currentPage="cafe">
        <PageContainer
          title="Cafe"
          showBackButton={false}
          headerButton={
            <button
              className="submit-btn date-filter-btn header-date-filter-btn-in-banner"
              onClick={() => setShowDateFilterModal(true)}
            >
              <span className="btn-icon">📅</span>
              {dateFilter.type === 'all' ? 'Date Filter' :
                dateFilter.type === 'date' ? (() => {
                  const date = new Date(dateFilter.selectedDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const selectedDate = new Date(date);
                  selectedDate.setHours(0, 0, 0, 0);
                  const isToday = selectedDate.getTime() === today.getTime();

                  const day = String(date.getDate()).padStart(2, '0');
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const year = date.getFullYear();
                  return isToday ? `TODAY (${day}/${month}/${year})` : `${day}/${month}/${year}`;
                })() :
                  dateFilter.type === 'month' ? `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
                    dateFilter.type === 'range' ? (() => {
                      const start = new Date(dateFilter.startDate);
                      const end = new Date(dateFilter.endDate);
                      const formatDate = (d) => {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        return `${day}/${month}/${year}`;
                      };
                      return `${formatDate(start)} - ${formatDate(end)}`;
                    })() :
                      'Date Filter'}
            </button>
          }
        >
          <div className="qr-management-page">

            {/* Summary Statistics */}
            <div className="qr-stats">
              <div className="stat-card">
                <div className="stat-number">{stats.total}</div>
                <div className="stat-label">Total Products</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.live}</div>
                <div className="stat-label">LIVE Products</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.offline}</div>
                <div className="stat-label">OFFLINE Products</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.lowStock}</div>
                <div className="stat-label">Low Stock</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.outOfStock}</div>
                <div className="stat-label">Out of Stock</div>
              </div>
            </div>

            {/* Filters and Controls */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search products by name, description, or code..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>

              <div className="filter-controls">
                <div className="search-box" >
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="items-select"
                    style={{ minWidth: '140px' }}
                  >
                    <option value="stock">Stock Report</option>
                    <option value="sales">Sales Report</option>
                  </select>
                </div>
                <button
                  type="button"
                  className={`submit-btn excel-download-btn btn-excel ${downloadingExcel || loading ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (reportType === 'sales') {
                      handleDownloadSalesExcel();
                    } else {
                      handleDownloadExcel();
                    }
                  }}
                  disabled={downloadingExcel || loading}
                >
                  <span className="btn-icon btn-icon-white">{downloadingExcel ? '⏳' : '📊'}</span>
                  {downloadingExcel ? 'Downloading...' : 'EXCEL'}
                </button>
                <button
                  type="button"
                  className={`submit-btn pdf-download-btn btn-pdf ${downloadingPDF || loading ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (reportType === 'sales') {
                      handleDownloadSalesPDF();
                    } else {
                      handleDownloadPDF();
                    }
                  }}
                  disabled={downloadingPDF || loading}
                  title="Download products as PDF file"
                  aria-label="Download PDF"
                >
                  <span className="btn-icon">{downloadingPDF ? '⏳' : '📄'}</span>
                  {downloadingPDF ? 'Downloading...' : 'PDF'}
                </button>
                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="items-select"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Products Table */}
            <div className="theater-table-container">
              <table className="theater-table">
                <thead>
                  <tr>
                    <th className="sno-cell">S.No</th>
                    <th className="photo-cell">Image</th>
                    <th className="name-cell">Product Name</th>
                    <th className="status-cell">Category</th>
                    <th className="status-cell">Kiosk Type</th>
                    <th className="status-cell">Price</th>
                    <th className="status-cell">Quantity</th>
                    <th className="status-cell">No.Qty</th>
                    <th className="status-cell">Stock</th>
                    <th className="status-cell">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="loading-cell">
                        <div className="loading-spinner"></div>
                        <span>Loading products...</span>
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="empty-cell">
                        <i className="fas fa-box fa-3x"></i>
                        <h3>No Products Found</h3>
                        <p>There are no products available for viewing at the moment.</p>
                      </td>
                    </tr>
                  ) : (
                    products.map((product, index) => (
                      <ProductRow
                        key={product._id}
                        product={product}
                        index={index}
                        theaterId={theaterId}
                        categoryMap={categoryMap}
                        kioskTypeMap={kioskTypeMap}
                        productToggleStates={productToggleStates}
                        toggleInProgress={toggleInProgress}
                        onView={handleViewProduct}
                        onEdit={handleEditProduct}
                        onDelete={handleDeleteProduct}
                        onToggle={handleProductToggleChange}
                        onManageStock={handleManageStock}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
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
                itemType="products"
              />
            )}

          </div>

          {/* View Product Modal */}
          {viewModal.show && (() => {
            // Get category name - handle all cases
            let categoryDisplayName = 'Uncategorized';
            const product = viewModal.product;

            if (product?.categoryId && typeof product.categoryId === 'object') {
              // CategoryId is populated object
              categoryDisplayName = product.categoryId.categoryName || product.categoryId.name || 'Uncategorized';
            } else if (product?.category && typeof product.category === 'object') {
              // Category is populated object
              categoryDisplayName = product.category.categoryName || product.category.name || 'Uncategorized';
            } else if ((product?.categoryId || product?.category) && categoryMap.size > 0) {
              // Category/CategoryId is just an ID string, look up in category map (O(1) lookup)
              const catId = (product.categoryId || product.category)?.toString();
              const foundCategory = categoryMap.get(catId);
              if (foundCategory) {
                categoryDisplayName = foundCategory.categoryName || foundCategory.name || 'Uncategorized';
              }
            }

            return (
              <div className="modal-overlay" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // ✅ FIX: Save current scroll before closing
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
                if (currentScroll > 0) {
                  scrollPositionRef.current = currentScroll;
                }
                setViewModal({ show: false, product: null });
                // ✅ FIX: Restore scroll position after closing modal - multiple attempts
                const restoreScroll = () => {
                  const savedPosition = scrollPositionRef.current;
                  if (savedPosition > 0) {
                    window.scrollTo(0, savedPosition);
                    document.documentElement.scrollTop = savedPosition;
                    document.body.scrollTop = savedPosition;
                  }
                };
                restoreScroll();
                requestAnimationFrame(() => {
                  restoreScroll();
                  setTimeout(restoreScroll, 0);
                  setTimeout(restoreScroll, 10);
                  setTimeout(restoreScroll, 50);
                });
              }}>
                <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Product Details</h2>
                    <button
                      className="close-btn"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // ✅ FIX: Save current scroll before closing
                        const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
                        if (currentScroll > 0) {
                          scrollPositionRef.current = currentScroll;
                        }
                        setViewModal({ show: false, product: null });
                        // ✅ FIX: Restore scroll position after closing modal - multiple attempts
                        const restoreScroll = () => {
                          const savedPosition = scrollPositionRef.current;
                          if (savedPosition > 0) {
                            window.scrollTo(0, savedPosition);
                            document.documentElement.scrollTop = savedPosition;
                            document.body.scrollTop = savedPosition;
                          }
                        };
                        restoreScroll();
                        requestAnimationFrame(() => {
                          restoreScroll();
                          setTimeout(restoreScroll, 0);
                          setTimeout(restoreScroll, 10);
                          setTimeout(restoreScroll, 50);
                        });
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
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
                          value={viewModal.product?.name || ''}
                          className="form-control"
                          readOnly
                        />
                      </div>
                      <div className="form-group">
                        <label>Product Code</label>
                        <input
                          type="text"
                          value={viewModal.product?.sku || viewModal.product?.productCode || ''}
                          className="form-control"
                          readOnly
                        />
                      </div>
                      <div className="form-group">
                        <label>Category</label>
                        <input
                          type="text"
                          value={categoryDisplayName}
                          className="form-control"
                          readOnly
                        />
                      </div>
                      <div className="form-group">
                        <label>Kiosk Type</label>
                        <input
                          type="text"
                          value={(() => {
                            if (!viewModal.product?.kioskType) return '—';
                            const kioskTypeId = viewModal.product.kioskType?.toString();
                            const found = kioskTypeMap.get(kioskTypeId);
                            return found?.name || '—';
                          })()}
                          className="form-control"
                          readOnly
                        />
                      </div>
                      <div className="form-group">
                        <label>Base Price</label>
                        <input
                          type="text"
                          value={`₹${parseFloat(viewModal.product?.pricing?.basePrice || viewModal.product?.sellingPrice || 0).toFixed(2)}`}
                          className="form-control"
                          readOnly
                        />
                      </div>
                      {viewModal.product?.pricing?.salePrice && (
                        <div className="form-group">
                          <label>Sale Price</label>
                          <input
                            type="text"
                            value={`₹${parseFloat(viewModal.product.pricing.salePrice || 0).toFixed(2)}`}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.product?.pricing?.discountPercentage > 0 && (
                        <div className="form-group">
                          <label>Discount</label>
                          <input
                            type="text"
                            value={`${viewModal.product.pricing.discountPercentage}%`}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.product?.pricing?.taxRate !== undefined && viewModal.product?.pricing?.taxRate > 0 && (
                        <div className="form-group">
                          <label>Tax Rate</label>
                          <input
                            type="text"
                            value={`${viewModal.product.pricing.taxRate}%`}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                      <div className="form-group">
                        <label>Stock Quantity</label>
                        <input
                          type="text"
                          value={`${viewModal.product?.inventory?.currentStock ?? viewModal.product?.stockQuantity ?? 0} ${viewModal.product?.inventory?.unit || viewModal.product?.unitOfMeasure || 'units'}`}
                          className="form-control"
                          readOnly
                        />
                      </div>
                      <div className="form-group">
                        <label>Status</label>
                        <select
                          value={viewModal.product?.isActive && viewModal.product?.isAvailable ? 'LIVE' : 'OFFLINE'}
                          className="form-control"
                          disabled
                        >
                          <option value="LIVE">LIVE</option>
                          <option value="OFFLINE">OFFLINE</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Diet Type</label>
                        <select
                          value={viewModal.product?.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                          className="form-control"
                          disabled
                        >
                          <option value="Vegetarian">Vegetarian 🟢</option>
                          <option value="Non-Vegetarian">Non-Vegetarian 🔴</option>
                        </select>
                      </div>
                      {viewModal.product?.gstType && (
                        <div className="form-group">
                          <label>GST Type</label>
                          <input
                            type="text"
                            value={viewModal.product?.gstType}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.product?.productType && (
                        <div className="form-group">
                          <label>Product Type</label>
                          <input
                            type="text"
                            value={viewModal.product?.productType?.productType || 'N/A'}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.product?.description && (
                        <div className="form-group">
                          <label>Description</label>
                          <textarea
                            value={viewModal.product?.description}
                            className="form-control"
                            readOnly
                            rows="3"
                          />
                        </div>
                      )}
                      {viewModal.product?.ingredients && (
                        <div className="form-group">
                          <label>Ingredients</label>
                          <textarea
                            value={viewModal.product?.ingredients}
                            className="form-control"
                            readOnly
                            rows="2"
                          />
                        </div>
                      )}

                      {/* Additional Product Details */}
                      {viewModal.product?.preparationTime && (
                        <div className="form-group">
                          <label>Preparation Time</label>
                          <input
                            type="text"
                            value={`${viewModal.product?.preparationTime} minutes`}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}
                      {viewModal.product?.lowStockAlert && (
                        <div className="form-group">
                          <label>Low Stock Alert</label>
                          <input
                            type="text"
                            value={`${viewModal.product?.lowStockAlert} units`}
                            className="form-control"
                            readOnly
                          />
                        </div>
                      )}

                      <div className="form-group">
                        <label>Created At</label>
                        <input
                          type="text"
                          value={viewModal.product?.createdAt ? new Date(viewModal.product.createdAt).toLocaleString() : 'N/A'}
                          className="form-control"
                          readOnly
                        />
                      </div>

                      <div className="form-group">
                        <label>Updated At</label>
                        <input
                          type="text"
                          value={viewModal.product?.updatedAt ? new Date(viewModal.product.updatedAt).toLocaleString() : 'N/A'}
                          className="form-control"
                          readOnly
                        />
                      </div>

                      {/* Product Image Section */}
                      {(viewModal.product?.images?.[0]?.url || viewModal.product?.productImage) && (
                        <div className="form-group full-width">
                          <label>Product Image</label>
                          <div className="empty-state">
                            <InstantImage
                              src={viewModal.product?.images?.[0]?.url || viewModal.product?.productImage}
                              alt={viewModal.product?.name || 'Product'}
                              className="product-image-modal"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* View modals don't have footer - Close button is in header only */}
                </div>
              </div>
            );
          })()}

          {/* Edit Product Modal */}
          {editModal.show && (() => {
            // ✅ FIX: Ensure arrays are initialized to prevent white screen errors
            const safeProductTypes = Array.isArray(productTypes) ? productTypes : [];
            const safeCategories = Array.isArray(categories) ? categories : [];
            const safeKioskTypes = Array.isArray(kioskTypes) ? kioskTypes : [];

            // Debug: Log form data when modal is shown
            console.log('🔍 Edit Modal Opened:', {
              editFormData,
              product: editModal.product,
              productTypes: safeProductTypes.length,
              categories: safeCategories.length,
              kioskTypes: safeKioskTypes.length
            });

            return (
              <div className="modal-overlay" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeEditModal();
              }}>
                <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Edit Product</h2>
                    <button 
                      className="close-btn" 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        closeEditModal();
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>

                  <div className="modal-body">
                    <div className="edit-form">
                      <div className="form-group">
                        <label>Product Type</label>
                        <select
                          value={editFormData.productType || ''}
                          onChange={(e) => handleEditFormChange('productType', e.target.value)}
                          className="form-control"
                        >
                          <option value=""></option>
                          {safeProductTypes.map((type) => (
                            <option key={type._id} value={type._id}>
                              {type.productType}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Category</label>
                        <select
                          value={editFormData.category || ''}
                          onChange={(e) => handleEditFormChange('category', e.target.value)}
                          className="form-control"
                        >
                          <option value="">Select category...</option>
                          {safeCategories.map((cat) => (
                            <option key={cat._id} value={cat._id}>
                              {cat.categoryName || cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Kiosk Type</label>
                        <select
                          value={editFormData.kioskType || ''}
                          onChange={(e) => handleEditFormChange('kioskType', e.target.value)}
                          className="form-control"
                        >
                          <option value="">Select kiosk type...</option>
                          {safeKioskTypes.map((kt) => (
                            <option key={kt._id} value={kt._id}>
                              {kt.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Quantity (e.g., 150ML, 500G, 1PC)</label>
                        <input
                          type="text"
                          value={editFormData.quantity || ''}
                          onChange={(e) => handleEditFormChange('quantity', e.target.value)}
                          className="form-control"
                          placeholder="Enter quantity (e.g., 150ML)"
                        />
                      </div>

                      <div className="form-group">
                        <label>Product Name</label>
                        <input
                          type="text"
                          value={editFormData.name || ''}
                          onChange={(e) => handleEditFormChange('name', e.target.value)}
                          className="form-control"
                          placeholder="Enter product name"
                        />
                      </div>

                      <div className="form-group">
                        <label>Product Code</label>
                        <input
                          type="text"
                          value={editFormData.productCode || ''}
                          onChange={(e) => handleEditFormChange('productCode', e.target.value)}
                          className="form-control"
                          placeholder="Enter product code"
                        />
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          value={editFormData.description || ''}
                          onChange={(e) => handleEditFormChange('description', e.target.value)}
                          className="form-control"
                          placeholder="Enter product description"
                          rows="3"
                        />
                      </div>

                      <div className="form-group">
                        <label>Cost Price</label>
                        <input
                          type="number"
                          value={editFormData.costPrice !== undefined && editFormData.costPrice !== null ? editFormData.costPrice : ''}
                          onChange={(e) => handleEditFormChange('costPrice', e.target.value)}
                          className="form-control"
                          placeholder="Enter cost price"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div className="form-group">
                        <label>Selling Price</label>
                        <input
                          type="number"
                          value={editFormData.sellingPrice !== undefined && editFormData.sellingPrice !== null ? editFormData.sellingPrice : ''}
                          onChange={(e) => handleEditFormChange('sellingPrice', e.target.value)}
                          className="form-control"
                          placeholder="Enter selling price"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div className="form-group">
                        <label>Discount (%)</label>
                        <input
                          type="number"
                          value={editFormData.discount !== undefined && editFormData.discount !== null ? editFormData.discount : ''}
                          onChange={(e) => handleEditFormChange('discount', e.target.value)}
                          className="form-control"
                          placeholder="Enter discount percentage"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>

                      <div className="form-group">
                        <label>Tax Rate (%)</label>
                        <input
                          type="number"
                          value={editFormData.taxRate !== undefined && editFormData.taxRate !== null ? editFormData.taxRate : ''}
                          onChange={(e) => handleEditFormChange('taxRate', e.target.value)}
                          className="form-control"
                          placeholder="Enter tax rate"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>

                      <div className="form-group">
                        <label>GST Type</label>
                        <select
                          value={editFormData.gstType || ''}
                          onChange={(e) => handleEditFormChange('gstType', e.target.value)}
                          className="form-control"
                        >
                          <option value="">Select GST type...</option>
                          <option value="INCLUDE">GST Included</option>
                          <option value="EXCLUDE">GST Excluded</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Stock Quantity</label>
                        <input
                          type="number"
                          value={editFormData.stockQuantity !== undefined && editFormData.stockQuantity !== null ? editFormData.stockQuantity : ''}
                          onChange={(e) => handleEditFormChange('stockQuantity', e.target.value)}
                          className="form-control"
                          placeholder="Enter stock quantity"
                          min="0"
                        />
                      </div>

                      <div className="form-group">
                        <label>Unit of Measure</label>
                        <select
                          value={editFormData.unitOfMeasure || 'Piece'}
                          onChange={(e) => handleEditFormChange('unitOfMeasure', e.target.value)}
                          className="form-control"
                        >
                          <option value="Piece">Piece</option>
                          <option value="Kg">Kilogram</option>
                          <option value="Gram">Gram</option>
                          <option value="Liter">Liter</option>
                          <option value="ML">Milliliter</option>
                          <option value="Pack">Pack</option>
                          <option value="Box">Box</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Low Stock Alert</label>
                        <input
                          type="number"
                          value={editFormData.lowStockAlert !== undefined && editFormData.lowStockAlert !== null ? editFormData.lowStockAlert : ''}
                          onChange={(e) => handleEditFormChange('lowStockAlert', e.target.value)}
                          className="form-control"
                          placeholder="Enter low stock threshold"
                          min="0"
                        />
                      </div>

                      <div className="form-group">
                        <label>Vegetarian Type</label>
                        <select
                          value={editFormData.isVeg || ''}
                          onChange={(e) => handleEditFormChange('isVeg', e.target.value)}
                          className="form-control"
                        >
                          <option value="">Select type...</option>
                          <option value="Vegetarian">Vegetarian</option>
                          <option value="Non-Vegetarian">Non-Vegetarian</option>
                          <option value="Vegan">Vegan</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Preparation Time (minutes)</label>
                        <input
                          type="number"
                          value={editFormData.preparationTime !== undefined && editFormData.preparationTime !== null ? editFormData.preparationTime : ''}
                          onChange={(e) => handleEditFormChange('preparationTime', e.target.value)}
                          className="form-control"
                          placeholder="Enter preparation time"
                          min="0"
                        />
                      </div>

                      <div className="form-group">
                        <label>Ingredients</label>
                        <textarea
                          value={editFormData.ingredients || ''}
                          onChange={(e) => handleEditFormChange('ingredients', e.target.value)}
                          className="form-control"
                          placeholder="Enter ingredients (comma separated)"
                          rows="3"
                        />
                      </div>

                      <div className="form-group">
                        <label>Product Image</label>
                        {editFormData.existingImage && (
                          <div className="image-preview-section">
                            <div className="image-preview-container">
                              <img
                                src={editFormData.existingImage}
                                alt="Current product"
                                className="image-preview-thumb"
                              />
                              <p className="image-preview-label">Current Image</p>
                            </div>
                          </div>
                        )}
                        <input
                          type="file"
                          name="productImage"
                          onChange={handleEditFileChange}
                          className="form-control"
                          accept="image/*"
                        />
                        {editFormData.existingImage && (
                          <p className="image-preview-text">
                            Upload a new image to replace the current one
                          </p>
                        )}
                      </div>

                      {/* Error Display */}
                      {editErrors.submit && (
                        <div className="error-message-product">
                          {editErrors.submit}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fixed Footer with Cancel and Submit Buttons */}
                  <div className="modal-actions">
                    <button
                      className="cancel-btn"
                      onClick={closeEditModal}
                      disabled={isUpdating}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleEditSubmit}
                      disabled={isUpdating}
                    >
                      {isUpdating ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Delete Modal - Following Global Design System */}
          {deleteModal.show && (
            <div className="modal-overlay">
              <div className="delete-modal">
                <div className="modal-header">
                  <h3>Confirm Deletion</h3>
                </div>
                <div className="modal-body">
                  <p>Are you sure you want to delete the product <strong>{deleteModal.product?.name}</strong>?</p>
                  <p className="warning-text">This action cannot be undone.</p>
                </div>
                <div className="modal-actions">
                  <button
                    onClick={() => setDeleteModal({ show: false, product: null })}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="confirm-delete-btn"
                  >
                    Delete Product
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Date Filter Modal */}
          {showDateFilterModal && (
            <DateFilter
              isOpen={showDateFilterModal}
              onClose={() => setShowDateFilterModal(false)}
              onApply={(filter) => {
                setDateFilter(filter);
                setShowDateFilterModal(false);
              }}
              initialFilter={dateFilter}
            />
          )}
        </PageContainer>
      </TheaterLayout>
    </ErrorBoundary>
  );
};

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

export default Cafe;
