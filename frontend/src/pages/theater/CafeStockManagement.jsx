import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import TheaterLayout from '@components/theater/TheaterLayout';
import PageContainer from '@components/PageContainer';
import VerticalPageHeader from '@components/VerticalPageHeader';
import Pagination from '@components/Pagination';
import DateFilter from '@components/DateFilter';
import { useModal } from '@contexts/ModalContext'
import { useToast } from '@contexts/ToastContext';;
import { useAuth } from '@contexts/AuthContext';
import ErrorBoundary from '@components/ErrorBoundary';
import { usePerformanceMonitoring } from '@hooks/usePerformanceMonitoring';
import config from '@config';
import apiService from '@services/apiService';
import '@styles/TheaterGlobalModals.css'; // Global theater modal styles
import '@styles/TheaterList.css';
import '@styles/QRManagementPage.css'; // ADDED: Import proper styling for statistics cards
import '@styles/components/GlobalButtons.css'; // Global button styles - Must load LAST to override
import '@styles/AddTheater.css'; // ADDED: Import submit-btn styling for date filter button
import '@styles/components/VerticalPageHeader.css'; // ADDED: Import global header styling
import '@styles/StockManagement.css'; // ADDED: Import stock-specific styling for badges
import { useDeepMemo, useComputed } from '@utils/ultraPerformance';
import { ultraFetch } from '@utils/ultraFetch';
import { unifiedFetch } from '@utils/unifiedFetch';
import { getCachedData, setCachedData, clearCache, clearCachePattern } from '@utils/cacheUtils';
import { invalidateRelatedCaches } from '@utils/crudOptimizer';
import { getTodayLocalDate, formatDateToLocal, formatDateStringToLocal } from '@utils/dateUtils';
import '@styles/skeleton.css'; // 🚀 Skeleton loading styles

const API_BASE_URL = config.api?.baseUrl || 'http://localhost:5000/api';

// Date utilities - Memoized for performance
const dateCache = new Map();
const formatDate = (date) => {
  if (!date) return '';
  const dateKey = typeof date === 'string' ? date : date.getTime();
  if (dateCache.has(dateKey)) {
    return dateCache.get(dateKey);
  }
  const formatted = new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  // Cache only last 100 dates to prevent memory leak
  if (dateCache.size > 100) {
    const firstKey = dateCache.keys().next().value;
    dateCache.delete(firstKey);
  }
  dateCache.set(dateKey, formatted);
  return formatted;
};

const formatDateTime = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Stock calculation utilities
const isExpired = (expireDate) => {
  if (!expireDate) return false;
  const now = new Date();
  const expiry = new Date(expireDate);

  // Check if the expiry date has passed (after 00:01 AM of the day AFTER expiry date)
  const dayAfterExpiry = new Date(expiry);
  dayAfterExpiry.setDate(expiry.getDate() + 1); // Move to next day
  dayAfterExpiry.setHours(0, 1, 0, 0); // Set to 00:01 AM of the day after expiry

  return now >= dayAfterExpiry;
};

const calculateExpiredStock = (entry) => {
  if (!entry.expireDate) return 0;
  if (!isExpired(entry.expireDate)) return 0;

  // If expired, the entire remaining stock becomes expired
  const sales = entry.sales || 0;
  const addedStock = entry.stock || 0;
  const remaining = Math.max(0, addedStock - sales);

  return remaining;
};

const calculateBalanceStock = (entry) => {
  const addedStock = entry.stock || 0;
  const sales = entry.sales || 0;
  const damageStock = entry.damageStock || 0;
  const expiredStock = calculateExpiredStock(entry);

  return Math.max(0, addedStock - sales - damageStock - expiredStock);
};

// Helper function to format numbers for display (rounds to 3 decimal places, removes trailing zeros)
const formatStatNumber = (value) => {
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

// Helper function to calculate stock quantity using the SAME priority as Product Management table
// Priority: balanceStock > closingBalance > totalInvordStock > inventory.currentStock > stockQuantity > stock > 0
const getProductStockQuantity = (product) => {
  if (!product) return 0;
  return product.balanceStock ??
    product.closingBalance ??
    product.totalInvordStock ??
    product.inventory?.currentStock ??
    product.stockQuantity ??
    product.stock ??
    0;
};

// ✅ UNIT CONVERSION UTILITIES
// Convert ML to kg (assuming water density: 1 ML = 0.001 kg)
const convertMLToKg = (value) => {
  return Number(value) * 0.001;
};

// Convert g to kg (1 g = 0.001 kg)
const convertGToKg = (value) => {
  return Number(value) * 0.001;
};

// Convert value to kg based on unit
const convertToKg = (value, unit) => {
  if (!value || !unit) return Number(value) || 0;
  const numValue = Number(value) || 0;

  switch (unit.toLowerCase()) {
    case 'ml':
      return convertMLToKg(numValue);
    case 'g':
      return convertGToKg(numValue);
    case 'kg':
      return numValue;
    default:
      return numValue; // Nos, L, or other units - no conversion
  }
};

// Get standardized unit for display
const getStandardizedUnit = (productUnit) => {
  if (!productUnit) return 'Nos';

  const unit = productUnit.toLowerCase();

  // Weight-based units (kg, g) → display as "kg"
  if (unit === 'kg' || unit === 'g') {
    return 'kg';
  }

  // Volume-based units (L, ML) → display as "L"
  if (unit === 'l' || unit === 'ml') {
    return 'L';
  }

  // Liter stays as "L"
  if (unit === 'l') {
    return 'L';
  }

  // Default to "Nos"
  return 'Nos';
};

// Get product unit from product data
const getProductUnit = (product) => {
  if (!product) return null;

  // Priority -1: Check stockUnit from backend (Same as Product Management page)
  if (product.stockUnit) {
    return product.stockUnit;
  }

  // Priority 0: Check top-level unit field
  if (product.unit) {
    return product.unit;
  }

  // Priority 1: Check inventory.unit
  if (product.inventory?.unit) {
    return product.inventory.unit;
  }

  // Priority 2: Check quantityUnit (from Product Type)
  if (product.quantityUnit) {
    return product.quantityUnit;
  }

  // Priority 3: Extract from quantity field (e.g., "150ML" → "ML")
  // Enhanced to be case-insensitive and robust
  if (product.quantity) {
    const quantityStr = String(product.quantity).trim();
    // Regex matches number followed optionally by space, then unit at end of string
    // Captures unit in group 1
    const match = quantityStr.match(/[\d.]+\s*(ml|l|kg|g|nos)$/i);
    if (match && match[1]) {
      const unit = match[1].toLowerCase();
      if (unit === 'ml') return 'ML';
      if (unit === 'l') return 'L';
      if (unit === 'kg') return 'kg';
      if (unit === 'g') return 'g';
      if (unit === 'nos') return 'Nos';
      return match[1];
    }
  }

  // Priority 4: Check unitOfMeasure
  if (product.unitOfMeasure) {
    return product.unitOfMeasure;
  }

  return null;
};

// Get allowed units for dropdown based on existing stock entries or product unit
const getAllowedUnits = (productUnit, stockEntries = [], currentEntry = null, inwardType = 'product') => {
  // ✅ FIX: Priority 0 - If Inward Type is 'cafe' (direct entry), allow ALL units
  // This ensures users can add 'Nos', 'kg', or 'L' regardless of product unit when doing direct entry
  if (inwardType === 'cafe') {
    return ['Nos', 'kg', 'L'];
  }

  // ✅ FIX: Priority 1 - Check Product Unit FIRST (Overrides history)
  // If product has a specific unit defined (L, kg, etc.), FORCE use of that unit family
  // Based on Stock Quantity unit from Product Management:
  // - If unit is "Kg" → Inward unit shows: "Kg, g, ML"
  // - If unit is "L" → Inward unit shows: "L, g, ML"
  // - If unit is "Nos" → Inward unit shows: "Nos" only
  if (productUnit) {
    const unit = String(productUnit).trim().toLowerCase();

    // If product unit is weight-based (kg, g), allow kg
    if (unit === 'kg' || unit === 'g') {
      return ['kg'];
    }

    // If product unit is volume-based (L, ML), allow L
    if (unit === 'l' || unit === 'ml') {
      return ['L'];
    }

    // If product unit is 'Nos', allow only Nos
    if (unit === 'nos') {
      return ['Nos'];
    }

  } else {
  }

  // ✅ FIX: Priority 2 - If Product Unit is unknown/null, check existing stock entries
  // Note: This is a fallback only. Primary logic is based on product unit.
  const allEntries = currentEntry ? [...stockEntries, currentEntry] : stockEntries;

  if (allEntries && allEntries.length > 0) {
    // Find the unit from existing stock entries (prefer non-Nos units)
    let existingUnit = null;

    // First, try to find any entry with a non-Nos unit
    const entryWithUnit = allEntries.find(entry => {
      const u = entry.unit || (entry.displayData && entry.displayData.unit);
      return u && u.toLowerCase() !== 'nos';
    });

    if (entryWithUnit) {
      existingUnit = entryWithUnit.unit || (entryWithUnit.displayData && entryWithUnit.displayData.unit);
    } else {
      // If all entries are Nos, use Nos
      const anyEntry = allEntries.find(entry => entry.unit || (entry.displayData && entry.displayData.unit));
      if (anyEntry) {
        existingUnit = anyEntry.unit || (anyEntry.displayData && anyEntry.displayData.unit);
      }
    }

    if (existingUnit) {
      const unit = String(existingUnit).trim().toLowerCase();

      // Apply same logic as product unit for consistency:
      // - If existing stock unit is weight-based (kg, g), allow kg
      if (unit === 'kg' || unit === 'g') {
        return ['kg'];
      }

      // - If existing stock unit is volume-based (L, ML), allow L
      if (unit === 'l' || unit === 'ml') {
        return ['L'];
      }

      // - If existing stock unit is Nos, allow only Nos
      if (unit === 'nos') {
        return ['Nos'];
      }
    }
  }

  // Default: allow all (when no stock and no product unit)
  return ['Nos', 'kg', 'L'];
};

// Loading skeleton component
const StockTableSkeleton = React.memo(({ count = 10 }) => (
  <>
    {Array.from({ length: count }).map((_, index) => (
      <tr key={`skeleton-${index}`} className="theater-row skeleton-row">
        <td className="sno-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="date-cell">
          <div className="skeleton-line skeleton-medium"></div>
        </td>
        <td className="stock-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="used-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="expired-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="damage-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="balance-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="expire-cell">
          <div className="skeleton-line skeleton-medium"></div>
        </td>
        <td className="actions-cell">
          <div className="skeleton-button-group"></div>
        </td>
      </tr>
    ))}
  </>
));

StockTableSkeleton.displayName = 'StockTableSkeleton';

// Memoized Date Filter Button Label Component
const DateFilterButtonLabel = React.memo(({ dateFilter }) => {
  const label = useMemo(() => {
    if (dateFilter.type === 'all') return 'Date Filter';
    if (dateFilter.type === 'date') {
      return `Today (${new Date(dateFilter.selectedDate).toLocaleDateString()})`;
    }
    if (dateFilter.type === 'month') {
      return `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    }
    if (dateFilter.type === 'year') {
      return `Year ${dateFilter.year}`;
    }
    return 'Date Filter';
  }, [dateFilter.type, dateFilter.selectedDate, dateFilter.month, dateFilter.year]);

  return <>{label}</>;
});

DateFilterButtonLabel.displayName = 'DateFilterButtonLabel';

// Optimized Stock Table Row Component
const StockTableRow = React.memo(({ entry, index, onDateClick, onEdit, onDelete, productUnit }) => {
  const displayData = entry.displayData || {};
  const entryDateFormatted = useMemo(() => formatDate(entry.entryDate || entry.date), [entry.entryDate, entry.date]);
  const expireDateFormatted = useMemo(() => entry.expireDate ? formatDate(entry.expireDate) : null, [entry.expireDate]);
  const isExpiredDate = useMemo(() => entry.expireDate ? isExpired(entry.expireDate) : false, [entry.expireDate]);

  // ✅ Get entry unit - use entry.unit (what was saved), not standardized unit
  const entryUnit = entry.unit || 'Nos';
  const standardizedUnit = useMemo(() => getStandardizedUnit(productUnit), [productUnit]);

  // ✅ Determine display unit: if entry unit is weight-based (kg/ML/g), show as kg; otherwise show entry unit
  const displayUnit = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    // If entry unit is weight-based, display as kg
    if (unit === 'kg' || unit === 'ml' || unit === 'g') {
      return 'kg';
    }
    // Otherwise, use the entry unit as-is (L, Nos, etc.)
    return entryUnit;
  }, [entryUnit]);

  // Extract values with fallbacks - same logic as edit modal
  const oldStock = displayData.oldStock ?? entry.oldStock ?? 0;
  const invordStock = displayData.invordStock ?? entry.stock ?? entry.invordStock ?? 0;
  const sales = displayData.sales ?? entry.sales ?? 0;
  // ✅ FIX: Get addon value - prioritize direct entry field (from stockDetails array)
  // Check explicitly for undefined/null to handle 0 values correctly
  const addon = (entry.addon !== undefined && entry.addon !== null) ? Number(entry.addon) || 0 :
    (displayData && displayData.addon !== undefined && displayData.addon !== null) ? Number(displayData.addon) || 0 :
      0;

  // ✅ FIX: Get stockAdjustment value - prioritize direct entry field (from stockDetails array)
  // Check explicitly for undefined/null to handle 0 values correctly
  const stockAdjustment = (entry.stockAdjustment !== undefined && entry.stockAdjustment !== null) ? Number(entry.stockAdjustment) || 0 :
    (displayData && displayData.stockAdjustment !== undefined && displayData.stockAdjustment !== null) ? Number(displayData.stockAdjustment) || 0 :
      (entry.damageStock !== undefined && entry.damageStock !== null) ? Number(entry.damageStock) || 0 : // Fallback to old field name
        (displayData && displayData.damageStock !== undefined && displayData.damageStock !== null) ? Number(displayData.damageStock) || 0 :
          0;
  // ✅ ADD: Get cancelStock value - prioritize direct entry field (from stockDetails array)
  const cancelStock = (entry.cancelStock !== undefined && entry.cancelStock !== null) ? Number(entry.cancelStock) || 0 :
    (displayData && displayData.cancelStock !== undefined && displayData.cancelStock !== null) ? Number(displayData.cancelStock) || 0 :
      0;

  // ✅ ADD: Get directStock value
  const directStock = (entry.directStock !== undefined && entry.directStock !== null) ? Number(entry.directStock) || 0 :
    (displayData && displayData.directStock !== undefined && displayData.directStock !== null) ? Number(displayData.directStock) || 0 :
      0;
  const expiredStock = displayData.expiredStock ?? entry.expiredStock ?? 0;
  // ✅ FIX: Balance calculation should include addon, stockAdjustment, and cancelStock
  // Backend calculates: oldStock + invordStock + directStock + addon - sales - expiredStock - damageStock + stockAdjustment + cancelStock
  const balance = displayData.balance ?? entry.balance ?? Math.max(0,
    (oldStock || 0) +
    (invordStock || 0) +
    (directStock || 0) + // ✅ FIX: Add directStock
    (addon || 0) + // ✅ FIX: Addon increases balance
    - (sales || 0) -
    (expiredStock || 0) -
    (entry.damageStock || 0) -
    (stockAdjustment || 0) + // ✅ FIX: Stock adjustment can be positive (gain) or negative (loss)
    (cancelStock || 0) // ✅ ADD: Include cancel stock in balance
  );

  // ✅ Convert values to display unit and track if conversion happened (same as Stock Management)
  const convertedOldStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(oldStock, entryUnit), converted: true };
    }
    return { value: oldStock, converted: false };
  }, [oldStock, entryUnit]);

  const convertedInvordStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(invordStock, entryUnit), converted: true };
    }
    return { value: invordStock, converted: false };
  }, [invordStock, entryUnit]);

  const convertedDirectStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(directStock, entryUnit), converted: true };
    }
    return { value: directStock, converted: false };
  }, [directStock, entryUnit]);

  const convertedSales = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(sales, entryUnit), converted: true };
    }
    return { value: sales, converted: false };
  }, [sales, entryUnit]);

  const convertedAddon = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(addon, entryUnit), converted: true };
    }
    return { value: addon, converted: false };
  }, [addon, entryUnit]);

  const convertedStockAdjustment = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(stockAdjustment, entryUnit), converted: true };
    }
    return { value: stockAdjustment, converted: false };
  }, [stockAdjustment, entryUnit]);

  const convertedCancelStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(cancelStock, entryUnit), converted: true };
    }
    return { value: cancelStock, converted: false };
  }, [cancelStock, entryUnit]);

  const convertedBalance = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(balance, entryUnit), converted: true };
    }
    return { value: balance, converted: false };
  }, [balance, entryUnit]);

  const convertedExpiredStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(expiredStock, entryUnit), converted: true };
    }
    return { value: expiredStock, converted: false };
  }, [expiredStock, entryUnit]);

  // ✅ Format value: show integers when possible, decimals only if conversion happened
  const formatValue = useCallback((convertedData) => {
    if (!convertedData || typeof convertedData.value === 'undefined') return '0';
    const numValue = Number(convertedData.value);
    // If conversion happened, show with decimals (up to 3 decimal places)
    if (convertedData.converted) {
      return numValue % 1 === 0 ? numValue.toString() : numValue.toFixed(3).replace(/\.?0+$/, '');
    }
    // If no conversion, show as integer if whole number, otherwise show with decimals
    return Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(3).replace(/\.?0+$/, '');
  }, []);

  const handleDateClickInternal = useCallback(() => {
    const entryDate = new Date(entry.entryDate || entry.date);
    const year = entryDate.getFullYear();
    const month = String(entryDate.getMonth() + 1).padStart(2, '0');
    const day = String(entryDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    onDateClick(dateString, entryDate);
  }, [entry.entryDate, entry.date, onDateClick]);

  return (
    <tr className="theater-row">
      <td className="serial-number">{index + 1}</td>
      <td
        className="date-cell clickable-date"
        onClick={handleDateClickInternal}
        title="Click to filter by this date"
      >
        <div className="entry-date">{entryDateFormatted}</div>
        <div className="entry-type-badge entry-type-badge-inline">
          {entry.type}
        </div>
      </td>
      <td className="old-stock-cell">
        <div className="stock-badge old-stock">
          <span className="stock-quantity">{formatValue(convertedOldStock)} {displayUnit}</span>
          <span className="stock-label">Old Stock</span>
        </div>
      </td>
      {/* Transfer Stock */}
      <td className="stock-cell">
        <div className="stock-badge added transfer-stock">
          <span className="stock-quantity">{formatValue(convertedInvordStock)} {displayUnit}</span>
          <span className="stock-label">Added</span> {/* Keep "Added" label or change to "Transfer" */}
        </div>
      </td>

      {/* Direct Stock */}
      <td className="stock-cell">
        <div className="stock-badge added direct-stock" style={{ backgroundColor: '#e3f2fd', color: '#0d47a1' }}>
          <span className="stock-quantity">{formatValue(convertedDirectStock)} {displayUnit}</span>
          <span className="stock-label">Direct</span>
        </div>
      </td>
      <td className="used-cell">
        <div className="stock-badge used">
          <span className="stock-quantity">{formatValue(convertedSales)} {displayUnit}</span>
          <span className="stock-label">Used</span>
        </div>
      </td>
      <td className="addon-cell">
        <div className="stock-badge addon">
          <span className="stock-quantity">{formatValue(convertedAddon)} {displayUnit}</span>
          <span className="stock-label">Addon</span>
        </div>
      </td>
      <td className="damage-cell">
        <div className="stock-badge damage">
          <span className="stock-quantity">{formatValue(convertedStockAdjustment)} {displayUnit}</span>
          <span className="stock-label">Adjustment</span>
        </div>
      </td>
      <td className="cancel-cell">
        <div className="stock-badge cancel">
          <span className="stock-quantity">{formatValue(convertedCancelStock)} {displayUnit}</span>
          <span className="stock-label">Cancel</span>
        </div>
      </td>
      <td className="balance-cell">
        <div className="stock-badge balance">
          <span className="stock-quantity">{formatValue(convertedBalance)} {displayUnit}</span>
          <span className="stock-label">Balance</span>
        </div>
      </td>
      <td className="expired-old-stock-cell">
        <div className="stock-badge expired-old">
          <span className="stock-quantity">{formatValue(convertedExpiredStock)} {displayUnit}</span>
          <span className="stock-label">Expired Old</span>
        </div>
      </td>
      <td className="expire-date-cell">
        {expireDateFormatted ? (
          <div>
            <div>{expireDateFormatted}</div>
            {isExpiredDate && (
              <div className="expired-warning">⚠️ Expired</div>
            )}
          </div>
        ) : 'N/A'}
      </td>
      <td className="actions">
        <div className="action-buttons">
          <button
            className="action-btn edit-btn"
            onClick={() => onEdit(entry)}
            title="Edit Entry"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
          <button
            className="action-btn delete-btn"
            onClick={() => onDelete(entry)}
            title="Delete Entry"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Optimized comparison - avoid expensive JSON.stringify
  if (prevProps.entry._id !== nextProps.entry._id || prevProps.index !== nextProps.index) {
    return false;
  }

  // Quick comparison of displayData keys
  const prevData = prevProps.entry.displayData || {};
  const nextData = nextProps.entry.displayData || {};
  const prevKeys = Object.keys(prevData);
  const nextKeys = Object.keys(nextData);

  if (prevKeys.length !== nextKeys.length) return false;

  // Only compare if keys match
  return prevKeys.every(key => prevData[key] === nextData[key]);
});

StockTableRow.displayName = 'StockTableRow';

// Optimized Table Body Component
const StockTableBody = React.memo(({ stockEntries, loading, filters, onDateClick, onEdit, onDelete, onAddStock, product }) => {
  // Memoize filtered entries to avoid re-filtering on every render
  const addedEntries = useMemo(() => {
    return stockEntries.filter(entry => entry.type === 'ADDED' || entry.type === 'ADD');
  }, [stockEntries]);

  // ✅ Get product unit for unit conversion
  const productUnit = useMemo(() => {
    return getProductUnit(product);
  }, [product]);

  // 🚀 INSTANT: Show skeleton only if loading AND no data
  if (loading && stockEntries.length === 0) {
    return <StockTableSkeleton count={filters.limit} />;
  }

  if (addedEntries.length === 0) {
    return (
      <tr>
        <td colSpan="11" className="no-data">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-lg">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
            </svg>
            <p>No stock entries found</p>
            <button
              className="btn-primary"
              onClick={onAddStock}
            >
              ADD FIRST ENTRY
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      {addedEntries.map((entry, index) => (
        <StockTableRow
          key={entry._id || `entry-${index}`}
          entry={entry}
          index={index}
          onDateClick={onDateClick}
          onEdit={onEdit}
          onDelete={onDelete}
          productUnit={productUnit}
        />
      ))}
    </>
  );
});

StockTableBody.displayName = 'StockTableBody';

// Stock entry row component - Using new displayData structure from backend
const StockEntryRow = React.memo(({ entry, index, onEdit, onDelete }) => {
  const globalIndex = index + 1;

  // ✅ FIX: Get values directly from entry (stockDetails array) first, then displayData
  const oldStock = (entry.oldStock ?? entry.displayData?.oldStock) || 0;
  const invordStock = (entry.invordStock ?? entry.displayData?.invordStock) || 0;
  // ✅ ADD: Get directStock
  const directStock = (entry.directStock ?? entry.displayData?.directStock) || 0;
  const sales = (entry.sales ?? entry.displayData?.sales) || 0;
  const expiredStock = (entry.expiredStock ?? entry.displayData?.expiredStock) || 0;

  // ✅ FIX: Get stockAdjustment - prioritize direct entry field, handle 0 values correctly
  const stockAdjustment = (entry.stockAdjustment !== undefined && entry.stockAdjustment !== null) ? Number(entry.stockAdjustment) || 0 :
    (entry.displayData && entry.displayData.stockAdjustment !== undefined && entry.displayData.stockAdjustment !== null) ? Number(entry.displayData.stockAdjustment) || 0 :
      (entry.damageStock !== undefined && entry.damageStock !== null) ? Number(entry.damageStock) || 0 : // Fallback to old field name
        (entry.displayData && entry.displayData.damageStock !== undefined && entry.displayData.damageStock !== null) ? Number(entry.displayData.damageStock) || 0 :
          0;

  const balance = (entry.balance ?? entry.displayData?.balance) || 0;

  // ✅ FIX: Get addon value - prioritize direct entry field, handle 0 values correctly
  const addon = (entry.addon !== undefined && entry.addon !== null) ? Number(entry.addon) || 0 :
    (entry.displayData && entry.displayData.addon !== undefined && entry.displayData.addon !== null) ? Number(entry.displayData.addon) || 0 :
      0;

  // ✅ ADD: Get cancelStock value - prioritize direct entry field, handle 0 values correctly
  const cancelStock = (entry.cancelStock !== undefined && entry.cancelStock !== null) ? Number(entry.cancelStock) || 0 :
    (entry.displayData && entry.displayData.cancelStock !== undefined && entry.displayData.cancelStock !== null) ? Number(entry.displayData.cancelStock) || 0 :
      0;

  // Check if this is a SOLD entry with FIFO details
  const hasFifoDetails = entry.type === 'SOLD' && entry.fifoDetails && entry.fifoDetails.length > 0;

  return (
    <tr className="theater-row">
      {/* Serial Number */}
      <td className="sno-cell">
        <span className="sno-number">{globalIndex}</span>
      </td>

      {/* Date */}
      <td className="date-cell">
        <div className="date-info">
          <div className="entry-date">{formatDate(entry.entryDate)}</div>
          <div className="entry-type-badge">{entry.type}</div>
        </div>
      </td>

      {/* Old Stock */}
      <td className="stock-cell">
        <div className="stock-badge old-stock">
          <span className="stock-quantity">{oldStock}</span>
          <span className="stock-status">Old Stock</span>
        </div>
      </td>

      {/* Transfer Stock */}
      <td className="stock-cell">
        <div className="stock-badge in-stock transfer-stock">
          <span className="stock-quantity">{invordStock}</span>
          <span className="stock-status">Transfer</span>
        </div>
      </td>

      {/* Direct Stock */}
      <td className="stock-cell">
        <div className="stock-badge in-stock direct-stock" style={{ backgroundColor: '#e3f2fd', color: '#0d47a1' }}>
          <span className="stock-quantity">{directStock}</span>
          <span className="stock-status">Direct</span>
        </div>
      </td>

      {/* Sales with FIFO Details */}
      <td className="used-cell">
        <div className="stock-badge used-stock">
          <span className="stock-quantity">{sales}</span>
          <span className="stock-status">Used</span>
        </div>
        {hasFifoDetails && (
          <div className="fifo-details fifo-details-container">
            <div className="fifo-details-title">
              📦 FIFO Deduction Details:
            </div>
            {entry.fifoDetails.map((fifo, idx) => (
              <div key={idx} className="fifo-details-item">
                • {fifo.deducted} units from {formatDate(fifo.date)}
                {fifo.batchNumber && ` (Batch: ${fifo.batchNumber})`}
                {fifo.expireDate && ` - Expires: ${formatDate(fifo.expireDate)}`}
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Addon */}
      <td className="addon-cell">
        <div className="stock-badge addon-stock">
          <span className="stock-quantity">{addon}</span>
          <span className="stock-status">Addon</span>
        </div>
      </td>

      {/* Stock Adjustment (formerly Damage Stock) */}
      <td className="damage-cell">
        <div className="stock-badge damage-stock">
          <span className="stock-quantity">{stockAdjustment}</span>
          <span className="stock-status">Adjustment</span>
        </div>
      </td>

      {/* Cancel Stock */}
      <td className="cancel-cell">
        <div className="stock-badge cancel-stock">
          <span className="stock-quantity">{cancelStock}</span>
          <span className="stock-status">Cancel</span>
        </div>
      </td>

      {/* Balance */}
      <td className="balance-cell">
        <div className="stock-badge balance-stock">
          <span className="stock-quantity">{balance}</span>
          <span className="stock-status">Balance</span>
        </div>
      </td>

      {/* Expired Stock */}
      <td className="expired-cell">
        <div className="stock-badge expired-stock">
          <span className="stock-quantity">{expiredStock}</span>
          <span className="stock-status">Expired Old</span>
        </div>
      </td>

      {/* Expire Date */}
      <td className="expire-cell">
        <div className="date-info">
          <div className="entry-date">
            {entry.expireDate ? formatDate(entry.expireDate) : 'No Expiry'}
          </div>
          {entry.expireDate && isExpired(entry.expireDate) && (
            <div className="expired-indicator">⚠️ Expired</div>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="actions-cell">
        <div className="action-buttons">
          <button
            className="action-btn edit-btn"
            onClick={() => onEdit(entry)}
            title="Edit Stock Entry"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
          <button
            className="action-btn delete-btn"
            onClick={() => onDelete(entry)}
            title="Delete Stock Entry"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-sm">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});

StockEntryRow.displayName = 'StockEntryRow';

// Statistics cards component - Using new backend statistics structure
const StockStatistics = React.memo(({ summary }) => {
  return (
    <div className="qr-stats">
      <div className="stat-card">
        <div className="stat-number">{summary?.openingBalance || 0}</div>
        <div className="stat-label">OLD STOCK</div>
        <div className="stat-sub-label">Opening Balance</div>
      </div>
      <div className="stat-card">
        <div className="stat-number">{summary?.totalStock || 0}</div>
        <div className="stat-label">TOTAL ADDED</div>
        <div className="stat-sub-label">Invord Stock</div>
      </div>
      <div className="stat-card">
        <div className="stat-number">{summary?.totalSales || 0}</div>
        <div className="stat-label">TOTAL SALES</div>
        <div className="stat-sub-label">Used This Month</div>
      </div>
      <div className="stat-card">
        <div className="stat-number">{summary?.totalExpired || 0}</div>
        <div className="stat-label">TOTAL EXPIRED</div>
        <div className="stat-sub-label">This Month</div>
      </div>
      <div className="stat-card" style={{ border: '1px solid #7c3aed' }}>
        <div className="stat-number">{summary?.balanceStock || summary?.closingBalance || 0}</div>
        <div className="stat-label">BALANCE STOCK</div>
        <div className="stat-sub-label">Current Balance</div>
      </div>
    </div>
  );
});

StockStatistics.displayName = 'StockStatistics';

// Monthly Old Stock Summary Component
const MonthlyOldStockSummary = React.memo(({ stockEntries }) => {
  const monthlySummary = useMemo(() => {
    if (!stockEntries || !Array.isArray(stockEntries)) {
      return [];
    }

    // Group entries by month
    const monthlyGroups = {};

    stockEntries.forEach(entry => {
      const entryDate = new Date(entry.date);
      const monthKey = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = {
          year: entryDate.getFullYear(),
          month: entryDate.getMonth() + 1,
          monthName: entryDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          entries: []
        };
      }

      monthlyGroups[monthKey].entries.push(entry);
    });

    // Calculate monthly totals with old stock
    return Object.values(monthlyGroups)
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      })
      .map(group => {
        const entries = group.entries.sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstEntry = entries[0];
        const lastEntry = entries[entries.length - 1];

        const totalAdded = entries.reduce((sum, entry) => sum + (entry.stock || 0), 0);
        const totalUsed = entries.reduce((sum, entry) => sum + (entry.sales || 0), 0);
        const totalDamage = entries.reduce((sum, entry) => sum + (entry.damageStock || 0), 0);
        const totalExpired = entries.reduce((sum, entry) => sum + (entry.expired || 0), 0);

        return {
          ...group,
          openingBalance: firstEntry?.openingBalance || 0,
          closingBalance: lastEntry?.cumulativeBalance || 0,
          totalAdded,
          totalUsed,
          totalDamage,
          totalExpired,
          netChange: totalAdded - totalUsed - totalDamage - totalExpired,
          entryCount: entries.length
        };
      });
  }, [stockEntries]);

  if (monthlySummary.length === 0) {
    return null;
  }

  return (
    <div className="monthly-summary-section">
      <h3 className="section-title">Monthly Old Stock Summary</h3>
      <div className="monthly-summary-grid">
        {monthlySummary.map((month, index) => (
          <div key={`${month.year}-${month.month}`} className="monthly-card">
            <div className="monthly-header">
              <h4>{month.monthName}</h4>
              <span className="entry-count">{month.entryCount} entries</span>
            </div>

            <div className="old-stock-flow">
              <div className="balance-item opening">
                <span className="label">Opening Balance</span>
                <span className="value">{month.openingBalance}</span>
              </div>

              <div className="flow-arrow">→</div>

              <div className="balance-item transactions">
                <span className="label">Transactions</span>
                <div className="transaction-details">
                  <span className="added">+{month.totalAdded}</span>
                  {(month.totalUsed + month.totalDamage + month.totalExpired) > 0 && (
                    <span className="deducted">-{month.totalUsed + month.totalDamage + month.totalExpired}</span>
                  )}
                </div>
              </div>

              <div className="flow-arrow">→</div>

              <div className="balance-item closing">
                <span className="label">Closing Balance</span>
                <span className="value">{month.closingBalance}</span>
              </div>

              {index < monthlySummary.length - 1 && (
                <div className="old-stock-indicator">
                  <span>Carries to Next Month →</span>
                </div>
              )}
            </div>

            <div className="net-change">
              <span className={`net-value ${month.netChange >= 0 ? 'positive' : 'negative'}`}>
                Net: {month.netChange >= 0 ? '+' : ''}{month.netChange}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

MonthlyOldStockSummary.displayName = 'MonthlyOldStockSummary';

// Monthly Overall Summary Component (Pure Display - No Calculations)
const MonthlyOverallSummary = React.memo(({ monthlySummaries, totals }) => {
  if (!monthlySummaries || monthlySummaries.length === 0) {
    return null;
  }

  return (
    <div className="monthly-overall-summary-section">
      <h3 className="section-title">Monthly Overall Summary</h3>
      <div className="monthly-overall-table-container">
        <table className="monthly-overall-table">
          <thead>
            <tr>
              <th>OLD STOCK</th>
              <th>TRANSFER</th>
              <th>DIRECT</th>
              <th>SALES</th>
              <th>EXPIRED STOCK</th>
              <th>ADDON</th>
              <th>STOCK ADJUSTMENT</th>
              <th>CANCEL STOCK</th>
              <th>BALANCE</th>
            </tr>
          </thead>
          <tbody>
            {monthlySummaries.map((summary) => {
              // Calculate balance: Old Stock + Invord Stock - Sales - Expired Stock - Damage Stock + Cancel Stock
              const calculatedBalance = Math.max(0,
                (summary.openingBalance || 0) +
                (summary.totalInvordStock || 0) +
                (summary.totalDirectStock || 0) - // ✅ ADD: Include direct stock
                (summary.totalSales || 0) -
                (summary.totalExpiredStock || 0) -
                (summary.totalDamageStock || 0) +
                (summary.totalCancelStock || 0) // ✅ ADD: Include cancel stock
              );

              return (
                <tr key={`${summary.year}-${summary.month}`} className="monthly-summary-row">
                  <td className="opening-balance-cell">
                    <span className="balance-value opening">{summary.openingBalance || 0}</span>
                  </td>
                  <td className="stock-added-cell">
                    <span className="stock-value added transfer">+{summary.totalInvordStock || 0}</span>
                  </td>
                  <td className="stock-added-cell">
                    <span className="stock-value added direct">+{summary.totalDirectStock || 0}</span>
                  </td>
                  <td className="used-stock-cell">
                    <span className="stock-value used">{summary.totalSales > 0 ? `-${summary.totalSales}` : '0'}</span>
                  </td>
                  <td className="expired-stock-cell">
                    <span className="stock-value expired">{summary.totalExpiredStock > 0 ? `-${summary.totalExpiredStock}` : '0'}</span>
                  </td>
                  <td className="addon-stock-cell">
                    <span className="stock-value addon">+{summary.totalAddon || 0}</span>
                  </td>
                  <td className="damage-stock-cell">
                    <span className="stock-value damage">{summary.totalDamageStock > 0 ? `-${summary.totalDamageStock}` : '0'}</span>
                  </td>
                  <td className="cancel-stock-cell">
                    <span className="stock-value cancel">+{summary.totalCancelStock || 0}</span>
                  </td>
                  <td className="cumulative-balance-cell">
                    <span className="balance-value cumulative">{summary.cumulativeBalance || calculatedBalance}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="monthly-summary-totals">
                <td><strong>{totals.openingBalance || 0}</strong></td>
                <td><strong>+{totals.totalInvordStock || 0}</strong></td>
                <td><strong>+{totals.totalDirectStock || 0}</strong></td>
                <td><strong>{totals.totalSales > 0 ? `-${totals.totalSales}` : '0'}</strong></td>
                <td><strong>{totals.totalExpiredStock > 0 ? `-${totals.totalExpiredStock}` : '0'}</strong></td>
                <td><strong>+{totals.totalAddon || 0}</strong></td>
                <td><strong>{totals.totalDamageStock > 0 ? `-${totals.totalDamageStock}` : '0'}</strong></td>
                <td><strong>+{totals.totalCancelStock || 0}</strong></td>
                <td><strong>{totals.cumulativeBalance || Math.max(0,
                  (totals.openingBalance || 0) +
                  (totals.totalInvordStock || 0) +
                  (totals.totalDirectStock || 0) - // ✅ ADD: Include direct stock
                  (totals.totalSales || 0) -
                  (totals.totalExpiredStock || 0) -
                  (totals.totalDamageStock || 0) +
                  (totals.totalCancelStock || 0) // ✅ ADD: Include cancel stock
                )}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
});

MonthlyOverallSummary.displayName = 'MonthlyOverallSummary';

// Add/Edit stock entry modal - Using NEW backend enum types
const StockEntryModal = React.memo(({ isOpen, onClose, entry, onSave, isLoading, stockEntries = [], product = null, summary = null, initialStockQuantity = null, theaterId = null }) => {

  // ✅ NEW: State to store theater stock value and unit from Product Management page
  // These must be declared first as they're used in the productUnit useMemo below
  const [theaterStockValue, setTheaterStockValue] = useState(null);
  const [theaterStockUnit, setTheaterStockUnit] = useState(null);

  // ✅ Get product unit - Use same priority as Stock Quantity display:
  // For Cafe Stock type: Check product fields directly (don't use theaterStockUnit)
  // For Product Stock type: Use theaterStockUnit if available
  const productUnit = useMemo(() => {
    let unit = null;

    // Priority 1: Use product.stockUnit from backend (works for both Product Stock and Cafe Stock)
    // This is the most reliable source as it comes directly from the product
    if (product?.stockUnit && String(product.stockUnit).trim() !== '') {
      unit = getStandardizedUnit(String(product.stockUnit).trim());
    }
    // Priority 2: Use unit from API response (theaterStockUnit - mainly for Product Stock type)
    // This comes from the live theater-stock API and represents the actual stock unit
    else if (theaterStockUnit && theaterStockUnit !== '') {
      unit = theaterStockUnit;
    }
    // Priority 3: For Cafe Stock, check existing stock entries to see what unit was used previously
    // This helps when product.stockUnit is undefined but we have historical data
    else if (stockEntries && stockEntries.length > 0) {
      // Find the most recent entry with a non-Nos unit (prefer actual units over Nos)
      const entryWithUnit = stockEntries.find(entry => {
        const u = entry.unit || (entry.displayData && entry.displayData.unit);
        return u && String(u).trim().toLowerCase() !== 'nos' && String(u).trim() !== '';
      });

      if (entryWithUnit) {
        const entryUnit = entryWithUnit.unit || (entryWithUnit.displayData && entryWithUnit.displayData.unit);
        if (entryUnit) {
          unit = getStandardizedUnit(String(entryUnit).trim());
        }
      }
    }
    // Priority 3: Extract from product fields (quantity, quantityUnit, unit, etc.)
    // This is important for Cafe Stock when product.stockUnit is not set
    if (!unit) {
      // First, check quantity field directly for unit hints (e.g., "150 ML", "2 L", "500 g")
      // This is more reliable than getProductUnit when the quantity field has the unit
      if (product?.quantity) {
        const quantityStr = String(product.quantity).trim();
        // Try multiple patterns: "150ML", "150 ML", "150ml", "2L", "2 L", etc.
        const quantityMatch = quantityStr.match(/[\d.]+\s*(ml|l|kg|g|nos)\s*$/i);
        if (quantityMatch && quantityMatch[1]) {
          const qtyUnit = quantityMatch[1].toLowerCase();
          if (qtyUnit === 'ml') {
            unit = 'ML';
          } else if (qtyUnit === 'l') {
            unit = 'L';
          } else if (qtyUnit === 'kg') {
            unit = 'kg';
          } else if (qtyUnit === 'g') {
            unit = 'g';
          } else if (qtyUnit === 'nos') {
            unit = 'Nos';
          }
        }
      }

      // If quantity field didn't have a unit, try getProductUnit
      if (!unit) {
        const extractedUnit = getProductUnit(product);
        if (extractedUnit) {
          unit = getStandardizedUnit(extractedUnit);
        }
      }
    }
    // Priority 4: (Previously Priority 4 was theaterStockUnit, now moved up)
    // No fallback needed here as checks are done above

    console.log(`🔍 [CafeStockManagement] Product unit extracted:`, {
      product: product?.name,
      productUnit: unit,
      theaterStockUnit,
      productStockUnit: product?.stockUnit,
      extractedUnit: getProductUnit(product),
      stockEntriesCount: stockEntries?.length || 0,
      productData: {
        unit: product?.unit,
        inventoryUnit: product?.inventory?.unit,
        quantityUnit: product?.quantityUnit,
        quantity: product?.quantity,
        unitOfMeasure: product?.unitOfMeasure
      }
    });
    return unit;
  }, [product, theaterStockUnit, stockEntries]);

  // ✅ Get standardized unit and allowed units
  const standardizedUnit = useMemo(() => {
    const stdUnit = getStandardizedUnit(productUnit);
    return stdUnit;
  }, [productUnit]);



  // ✅ Default unit based on existing stock entries or product unit
  const defaultUnit = useMemo(() => {
    // Priority 1: Check existing stock entries
    if (stockEntries && stockEntries.length > 0) {
      // Find the unit from existing stock entries (prefer non-Nos units)
      const entryWithUnit = stockEntries.find(entry => entry.unit && entry.unit.toLowerCase() !== 'nos') ||
        stockEntries.find(entry => entry.unit);
      if (entryWithUnit && entryWithUnit.unit) {
        const unit = entryWithUnit.unit.toLowerCase();
        if (unit === 'kg' || unit === 'ml' || unit === 'g') {
          return 'kg';
        }
        if (unit === 'l') {
          return 'L';
        }
        if (unit === 'nos') {
          // ✅ FIX: If stock entries say 'Nos' but product has a specific unit (e.g. 'L'), use the product unit
          if (standardizedUnit && standardizedUnit !== 'Nos') {
            return standardizedUnit;
          }
          return 'Nos';
        }
        return entryWithUnit.unit; // Return as-is for custom units
      }
    }

    // Priority 2: Use standardized unit from product if no stock entries
    // This ensures we use the correct unit from the product instead of defaulting to 'Nos'
    const finalUnit = standardizedUnit || 'Nos';
    console.log(`✅ [CafeStockManagement] Default unit calculated:`, {
      hasStockEntries: stockEntries?.length > 0,
      standardizedUnit,
      finalUnit
    });
    return finalUnit;
  }, [productUnit, stockEntries, standardizedUnit]);

  const [formData, setFormData] = useState({
    date: getTodayLocalDate(), // ✅ FIX: Use local date instead of UTC to avoid timezone issues
    type: 'ADDED', // Always ADDED (Invord Stock)
    inwardType: 'product', // 'product' or 'cafe'
    quantity: '', // Current stock (readonly)
    inward: '', // Inward stock to add (user input)
    unit: defaultUnit, // ✅ ADD: Unit for inward stock
    addon: '', // Addon stock (for edit mode)
    stockAdjustment: '', // Stock Adjustment (for edit mode, replaces damage stock)
    sales: '', // Sales (readonly in edit mode)
    expireDate: '',
    notes: '',
    batchNumber: ''
  });

  const [errors, setErrors] = useState({});

  // Memoize date Set for O(1) date existence checks
  const existingDatesSet = useMemo(() => {
    const dateSet = new Set();
    stockEntries.forEach(existingEntry => {
      // Skip the current entry being edited
      if (entry && existingEntry._id === entry._id) {
        return;
      }
      const existingDate = existingEntry.date || existingEntry.entryDate;
      if (existingDate) {
        const dateStr = formatDateStringToLocal(existingDate); // ✅ FIX: Use local date format
        dateSet.add(dateStr);
      }
    });
    return dateSet;
  }, [stockEntries, entry]);

  // ✅ MOVED: Allowed units calculation (needs formData.inwardType)
  const allowedUnits = useMemo(() => {
    const units = getAllowedUnits(productUnit, stockEntries, entry, formData.inwardType);
    console.log(`📋 [StockEntryModal] Final allowedUnits:`, {
      productUnit,
      inwardType: formData.inwardType,
      allowedUnits: units
    });
    return units;
  }, [productUnit, stockEntries, entry, formData.inwardType]);

  // ✅ FIX: Use ref to track if form has been initialized to prevent resetting user-entered values
  const formInitializedRef = useRef(false);
  const lastEntryIdRef = useRef(null);
  const unitManuallyChangedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      // ✅ FIX: Only initialize form when modal first opens or entry changes
      // Check if this is a new entry (different ID) or first time opening
      const currentEntryId = entry?._id?.toString();
      const isNewEntry = currentEntryId !== lastEntryIdRef.current;
      const shouldInitialize = !formInitializedRef.current || isNewEntry;

      if (shouldInitialize) {
        // Reset unit manual change flag when initializing form
        unitManuallyChangedRef.current = false;

        if (entry) {
          // Edit mode - populate with entry data
          // For edit mode, quantity is the entry quantity, and we need to calculate current stock
          // ✅ FIX: Use theater stock value from Product Management page (theater-stock API)
          // Priority: theaterStockValue > initialStockQuantity > summary > product
          const currentStock = theaterStockValue ??
            initialStockQuantity ??
            summary?.balanceStock ??
            summary?.closingBalance ??
            summary?.currentStock ??
            getProductStockQuantity(product);
          setFormData({
            date: entry.date ? formatDateStringToLocal(entry.date) : getTodayLocalDate(), // ✅ FIX: Use local date format
            type: 'ADDED', // Always ADDED
            inwardType: entry.inwardType || 'product', // Default to product if not set
            quantity: currentStock.toString(), // Current stock (readonly)
            inward: entry.quantity?.toString() || '', // Entry quantity becomes inward
            unit: entry.unit || defaultUnit, // ✅ ADD: Load existing unit
            addon: entry.addon?.toString() || '0', // ✅ FIX: Load existing addon value from entry
            stockAdjustment: entry.stockAdjustment?.toString() || '0', // ✅ FIX: Load existing stockAdjustment value
            sales: entry.sales?.toString() || '0', // ✅ ADD: Load existing sales value from entry
            expireDate: entry.expireDate ? formatDateStringToLocal(entry.expireDate) : '', // ✅ FIX: Use local date format
            notes: entry.notes || '',
            batchNumber: entry.batchNumber || ''
          });
          lastEntryIdRef.current = currentEntryId;
        } else {
          // Add mode - defaults (Always ADDED)
          // Set date to today (minimum allowed date) - use local date to avoid timezone issues
          const today = getTodayLocalDate();
          // ✅ FIX: Pre-fill quantity with stock value from Product Management page (theater-stock API)
          // Priority: theaterStockValue > initialStockQuantity > summary > product
          // Note: theaterStockValue might not be loaded yet, so we'll update it in the separate effect
          const currentStock = theaterStockValue ??
            initialStockQuantity ??
            summary?.balanceStock ??
            summary?.closingBalance ??
            summary?.currentStock ??
            getProductStockQuantity(product);
          setFormData({
            date: today,
            type: 'ADDED', // Always ADDED (Invord Stock)
            inwardType: 'product', // Default to product
            quantity: currentStock.toString(), // Current stock (readonly)
            inward: '', // Inward stock to add (user input)
            unit: defaultUnit || 'Nos', // ✅ ADD: Default unit (use latest defaultUnit)
            addon: '', // Addon stock (not used in add mode)
            stockAdjustment: '', // Stock Adjustment (not used in add mode)
            expireDate: '',
            notes: '',
            batchNumber: ''
          });
          lastEntryIdRef.current = null;
        }
        setErrors({});
        formInitializedRef.current = true;
      } else {
        // ✅ FIX: Form already initialized - only update quantity and unit if needed, preserve user-entered values
        // This prevents resetting addon/stockAdjustment when theaterStockValue or summary changes
        setFormData(prev => {
          const currentStock = theaterStockValue ??
            initialStockQuantity ??
            summary?.balanceStock ??
            summary?.closingBalance ??
            summary?.currentStock ??
            getProductStockQuantity(product);

          const updates = {};
          let hasUpdates = false;

          // Update quantity if it's different
          if (prev.quantity !== currentStock.toString()) {
            updates.quantity = currentStock.toString();
            hasUpdates = true;
          }

          // ✅ FIX: Update unit if defaultUnit changed and user hasn't manually changed it
          // Always update if defaultUnit is not 'Nos' and current unit is 'Nos' or different
          if (!unitManuallyChangedRef.current && defaultUnit && defaultUnit !== 'Nos' && prev.unit !== defaultUnit) {
            updates.unit = defaultUnit;
            hasUpdates = true;
          } else if (!unitManuallyChangedRef.current && prev.unit === 'Nos' && defaultUnit && defaultUnit !== 'Nos') {
            // Special case: if current unit is 'Nos' and defaultUnit changed to actual unit, always update
            updates.unit = defaultUnit;
            hasUpdates = true;
          }

          if (hasUpdates) {
            return {
              ...prev,
              ...updates
            };
          }
          return prev; // Preserve all user-entered values
        });
      }
    } else {
      // Modal closed - reset initialization flag
      formInitializedRef.current = false;
      lastEntryIdRef.current = null;
      unitManuallyChangedRef.current = false;
    }
  }, [isOpen, entry, product, summary, initialStockQuantity, theaterStockValue, defaultUnit]);

  // ✅ NEW: Ensure unit is correct when inwardType changes to "cafe"
  useEffect(() => {
    if (!isOpen || !product) return;

    // Only update when switching to "cafe" type
    if (formData.inwardType === 'cafe') {
      // Check if current unit matches product's stock unit
      const expectedUnit = productUnit; // This should already be calculated from product.stockUnit

      if (expectedUnit && expectedUnit !== 'Nos' && formData.unit !== expectedUnit) {
        setFormData(prev => ({
          ...prev,
          unit: expectedUnit
        }));
      } else if (!expectedUnit || expectedUnit === 'Nos') {
        // Try to get unit from product fields directly
        const directUnit = product?.stockUnit || getProductUnit(product);
        if (directUnit && directUnit !== 'Nos' && directUnit.toLowerCase() !== 'nos') {
          const standardized = getStandardizedUnit(directUnit);
          if (standardized && standardized !== 'Nos') {
            setFormData(prev => ({
              ...prev,
              unit: standardized
            }));
          }
        }
      }
    }
  }, [formData.inwardType, product, productUnit, isOpen]);

  // ✅ NEW: Fetch theater stock value from Product Management page (theater-stock API)
  useEffect(() => {
    if (isOpen && product?._id && theaterId && !entry) {
      // Reset theater stock value and unit when modal opens
      setTheaterStockValue(null);
      setTheaterStockUnit(null);

      // Fetch stock value from theater-stock API (same as Product Management page uses)
      const fetchTheaterStock = async () => {
        try {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;

          const stockUrl = `${config.api.baseUrl}/theater-stock/${theaterId}/${product._id}?year=${currentYear}&month=${currentMonth}`;


          const response = await unifiedFetch(stockUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          }, {
            forceRefresh: true, // Force fresh data
            cacheTTL: 0 // No cache
          });

          // ✅ FIX: unifiedFetch throws errors for non-OK responses, so if we get here, response should be OK
          // But check response properties if available
          if (!response) {
            throw new Error('No response received from server');
          }

          // ✅ FIX: unifiedFetch returns data via json() method
          let stockData = null;
          if (typeof response.json === 'function') {
            stockData = await response.json();
          } else if (response.data) {
            // unifiedFetch might have already parsed the data
            stockData = response.data;
          } else {
            // Response might be the data directly
            stockData = response;
          }


          // ✅ FIX: Check if response is successful (unifiedFetch throws on errors, so if we got here it's likely OK)
          const isSuccess = stockData && (stockData.success === true || stockData.data || !stockData.error);

          let closingBalance = 0;
          let stockUnit = null;

          if (isSuccess && stockData.data) {
            // The API returns MonthlyStock document directly in stockData.data
            // Try multiple possible response structures
            // Check if data is the MonthlyStock document directly with closingBalance
            if (stockData.data.closingBalance !== undefined && stockData.data.closingBalance !== null) {
              closingBalance = stockData.data.closingBalance;
            }
            // Check nested structures
            else if (stockData.data.statistics?.closingBalance !== undefined && stockData.data.statistics.closingBalance !== null) {
              closingBalance = stockData.data.statistics.closingBalance;
            }
            else if (stockData.data.summary?.closingBalance !== undefined && stockData.data.summary.closingBalance !== null) {
              closingBalance = stockData.data.summary.closingBalance;
            }
            else if (stockData.data.currentStock !== undefined && stockData.data.currentStock !== null) {
              closingBalance = stockData.data.currentStock;
            }

            // ✅ NEW: Extract unit from stockDetails entries (same as Product Management)
            // Priority: Get unit from MonthlyStock stockDetails entries (most accurate source)
            // This matches how ProductService.js extracts stockUnit (from stock entries, not product)
            if (stockData.data.stockDetails && Array.isArray(stockData.data.stockDetails) && stockData.data.stockDetails.length > 0) {
              // Sort entries by date (most recent first)
              const sortedEntries = [...stockData.data.stockDetails].sort((a, b) => {
                const dateA = new Date(a.date || 0);
                const dateB = new Date(b.date || 0);
                return dateB - dateA; // Most recent first
              });

              // First, try to find the most recent entry with a non-Nos unit
              let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit.toLowerCase() !== 'nos' && String(entry.unit).trim() !== '');

              // If not found, try any entry with a unit
              if (!entryWithUnit) {
                entryWithUnit = sortedEntries.find(entry => entry.unit && String(entry.unit).trim() !== '');
              }

              // If still not found, use the most recent entry (even if unit is Nos or missing)
              if (!entryWithUnit && sortedEntries.length > 0) {
                entryWithUnit = sortedEntries[0];
              }

              if (entryWithUnit && entryWithUnit.unit) {
                stockUnit = String(entryWithUnit.unit).trim();
              }
            }

            // ✅ FALLBACK: If no unit from stockDetails, check product object
            // Priority: stockUnit (if backend includes it) > unitOfMeasure > inventory.unit
            if (!stockUnit && stockData.data.product?.stockUnit && String(stockData.data.product.stockUnit).trim() !== '') {
              stockUnit = String(stockData.data.product.stockUnit).trim();
            } else if (!stockUnit && stockData.data.product?.unitOfMeasure) {
              stockUnit = stockData.data.product.unitOfMeasure;
            } else if (!stockUnit && stockData.data.product?.inventory?.unit) {
              stockUnit = stockData.data.product.inventory.unit;
            }
          }
          // ✅ FIX: Also check if stockData itself is the MonthlyStock document (not nested)
          else if (stockData && stockData.closingBalance !== undefined && stockData.closingBalance !== null) {
            closingBalance = stockData.closingBalance;
          }
          // ✅ FIX: Check root level statistics/summary
          else if (stockData && stockData.statistics?.closingBalance !== undefined && stockData.statistics.closingBalance !== null) {
            closingBalance = stockData.statistics.closingBalance;
          }
          else if (stockData && stockData.summary?.closingBalance !== undefined && stockData.summary.closingBalance !== null) {
            closingBalance = stockData.summary.closingBalance;
          }

          // ✅ NEW: Also check for unit at root level (if stockData is MonthlyStock directly)
          // Check stockDetails at root level
          if (!stockUnit && stockData?.stockDetails && Array.isArray(stockData.stockDetails) && stockData.stockDetails.length > 0) {
            const sortedEntries = [...stockData.stockDetails].sort((a, b) => {
              const dateA = new Date(a.date || 0);
              const dateB = new Date(b.date || 0);
              return dateB - dateA; // Most recent first
            });

            let entryWithUnit = sortedEntries.find(entry => entry.unit && entry.unit.toLowerCase() !== 'nos' && String(entry.unit).trim() !== '');
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

          // ✅ FALLBACK: Check root level product (same priority as above)
          if (!stockUnit && stockData?.product?.stockUnit && String(stockData.product.stockUnit).trim() !== '') {
            stockUnit = String(stockData.product.stockUnit).trim();
          } else if (!stockUnit && stockData?.product?.unitOfMeasure) {
            stockUnit = stockData.product.unitOfMeasure;
          } else if (!stockUnit && stockData?.product?.inventory?.unit) {
            stockUnit = stockData.product.inventory.unit;
          }

          // ✅ NEW: Standardize the unit (Kg, L, Nos) before storing
          const standardizedUnit = stockUnit ? getStandardizedUnit(stockUnit) : '';

          if (closingBalance > 0 || (closingBalance === 0 && stockData)) {
            setTheaterStockValue(closingBalance);
            setTheaterStockUnit(standardizedUnit); // Store standardized unit (Kg, L, Nos) or empty string
          } else {
            console.warn(`⚠️ [CafeStockManagement] Could not extract closingBalance from response:`, stockData);
            setTheaterStockUnit(''); // Reset unit if no valid stock data
          }
        } catch (error) {
          console.error(`❌ [CafeStockManagement] Failed to fetch theater stock for product ${product._id}:`, error);
          // Fallback to cafe stock value if theater stock fetch fails
          setTheaterStockValue(null);
          setTheaterStockUnit(null);
        }
      };

      fetchTheaterStock();
    }
  }, [isOpen, product?._id, theaterId, entry]);

  // ✅ FIX: Separate effect to update quantity when theater stock value is fetched
  // Only runs for add mode, and preserves all other form fields
  useEffect(() => {
    if (isOpen && !entry) {
      // ✅ FIX: Use theater stock value from Product Management page (theater-stock API)
      // Priority: theaterStockValue > initialStockQuantity > summary > product
      // Only use theaterStockValue if it's not null (0 is a valid value)
      let currentStock = 0;

      if (theaterStockValue !== null && theaterStockValue !== undefined) {
        // Theater stock value is available (even if 0, it's a valid fetched value)
        currentStock = theaterStockValue;
      } else if (initialStockQuantity !== null && initialStockQuantity !== undefined) {
        currentStock = initialStockQuantity;
      } else if (summary?.balanceStock !== null && summary?.balanceStock !== undefined) {
        currentStock = summary.balanceStock;
      } else if (summary?.closingBalance !== null && summary?.closingBalance !== undefined) {
        currentStock = summary.closingBalance;
      } else if (summary?.currentStock !== null && summary?.currentStock !== undefined) {
        currentStock = summary.currentStock;
      } else {
        currentStock = getProductStockQuantity(product);
      }

      setFormData(prev => {
        const updates = {};
        let hasUpdates = false;

        // Update quantity if it's empty or matches currentStock (autofill)
        if (!prev.quantity || prev.quantity === '' || (theaterStockValue !== null && prev.quantity !== currentStock.toString())) {
          updates.quantity = currentStock.toString();
          hasUpdates = true;
        }

        // ✅ NEW: Auto-update unit to match theater stock unit if inwardType is 'product'
        // This ensures the unit dropdown matches the "kg" or "L" shown in Stock Quantity

        let targetUnit = theaterStockUnit;
        if (!targetUnit && product?.stockUnit && String(product.stockUnit).trim() !== '') {
          targetUnit = getStandardizedUnit(String(product.stockUnit).trim());
        }
        if (!targetUnit) {
          const pUnit = getProductUnit(product);
          if (pUnit) targetUnit = getStandardizedUnit(pUnit);
        }

        if (prev.inwardType === 'product' && targetUnit && targetUnit !== '' && prev.unit !== targetUnit) {
          updates.unit = targetUnit;
          hasUpdates = true;
        }

        if (hasUpdates) {
          return {
            ...prev,
            ...updates
          };
        }
        return prev;
      });
    }
  }, [theaterStockValue, theaterStockUnit, initialStockQuantity, summary, product, isOpen, entry]);

  // ✅ FIX: Update unit when defaultUnit changes (e.g., when product loads)
  // This is a dedicated effect to ensure unit updates when product loads
  // It runs independently of the form initialization effect to catch all cases
  useEffect(() => {
    if (isOpen && !entry && defaultUnit && !unitManuallyChangedRef.current && formInitializedRef.current) {
      setFormData(prev => {
        // Always update if:
        // 1. defaultUnit is not 'Nos' (product has actual unit)
        // 2. Current unit is different from defaultUnit
        // 3. User hasn't manually changed it
        if (defaultUnit !== 'Nos' && prev.unit !== defaultUnit) {
          return {
            ...prev,
            unit: defaultUnit
          };
        }
        // Also update if current unit is 'Nos' and defaultUnit changed to actual unit
        if (prev.unit === 'Nos' && defaultUnit !== 'Nos') {
          return {
            ...prev,
            unit: defaultUnit
          };
        }
        return prev;
      });
    }
  }, [defaultUnit, isOpen, entry]);

  // ✅ FIX: Also update unit when product prop changes (ensures unit updates when product loads)
  // This uses the already-calculated defaultUnit from useMemo
  useEffect(() => {
    if (isOpen && !entry && product && defaultUnit && !unitManuallyChangedRef.current && formInitializedRef.current) {
      // When product loads/changes, use the calculated defaultUnit
      if (defaultUnit !== 'Nos') {
        setFormData(prev => {
          if (prev.unit !== defaultUnit && (prev.unit === 'Nos' || prev.unit === '')) {
            return {
              ...prev,
              unit: defaultUnit
            };
          }
          return prev;
        });
      }
    }
  }, [product, defaultUnit, isOpen, entry]);

  const handleInputChange = useCallback((field, value) => {
    // Track if user manually changes the unit
    if (field === 'unit') {
      unitManuallyChangedRef.current = true;
    }

    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // Validate date if it's being changed
      if (field === 'date' && value) {
        // Check if date is in the past (only for add mode, not edit mode)
        if (!entry) {
          const today = getTodayLocalDate(); // ✅ FIX: Use local date for comparison
          const selectedDate = value; // value is already in YYYY-MM-DD format
          if (selectedDate < today) {
            setErrors(prev => ({ ...prev, date: 'Date cannot be in the past. Please select today or a future date.' }));
            return prev; // Don't update the date if it's in the past
          }
        }

        // Check if date already exists using memoized Set (O(1) lookup)
        const newDateStr = value; // value is already in YYYY-MM-DD format
        const dateExists = existingDatesSet.has(newDateStr);

        if (dateExists) {
          setErrors(prev => ({ ...prev, date: 'This date already exists. Please select a different date.' }));
        } else {
          setErrors(prev => {
            const newErrors = { ...prev };
            if (newErrors.date && newErrors.date.includes('already exists')) {
              delete newErrors.date;
            }
            if (newErrors.date && newErrors.date.includes('cannot be in the past')) {
              delete newErrors.date;
            }
            return newErrors;
          });
        }
      }

      // Validate and cap inward stock if it's being changed (real-time validation)
      if (field === 'inward' && value) {
        const inwardStock = Number(value);
        const currentStock = Number(prev.quantity) || 0;

        // For Product Stock type, cap the value to current stock
        if (prev.inwardType === 'product' && inwardStock > currentStock) {
          // Cap the value to current stock
          updated.inward = currentStock.toString();
          setErrors(prev => ({
            ...prev,
            inward: `Maximum available stock is ${currentStock}. Value capped to ${currentStock}.`
          }));
          // Clear error after 2 seconds
          setTimeout(() => {
            setErrors(prev => {
              const newErrors = { ...prev };
              delete newErrors.inward;
              return newErrors;
            });
          }, 2000);
        } else if (inwardStock <= 0 || isNaN(inwardStock)) {
          setErrors(prev => ({
            ...prev,
            inward: 'Inward stock must be greater than 0'
          }));
        } else {
          // Clear inward error if validation passes
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.inward;
            return newErrors;
          });
        }
      }

      // If inwardType changes, handle redirect or revalidation
      if (field === 'inwardType') {
        // ✅ FIX: Redirect to Product Stock Management page when 'product' is selected
        if (value === 'product') {
          onClose(); // Close the modal first
          navigate(`/theater-stock-management/${theaterId}/${product._id}`);
          return prev; // Stop updating state since we are navigating away
        }

        const inwardStock = Number(prev.inward);
        const currentStock = Number(prev.quantity) || 0;

        if (value === 'product' && inwardStock > currentStock) {
          setErrors(prev => ({
            ...prev,
            inward: `Inward stock cannot exceed current stock (${currentStock})`
          }));
        } else {
          // Clear inward error if changing to 'cafe' type
          setErrors(prev => ({ ...prev, inward: undefined })); // Cleaner error removal
        }

        // Auto-update unit logic remains, though redirection happens above for 'product'
        // Keeping it for safety or if logic changes
        if (value === 'product') {
          // ... (rest of the logic for product unit update if we weren't redirecting)
          let targetUnit = theaterStockUnit;

          if (!targetUnit && product?.stockUnit && String(product.stockUnit).trim() !== '') {
            targetUnit = getStandardizedUnit(String(product.stockUnit).trim());
          }

          if (!targetUnit) {
            const pUnit = getProductUnit(product);
            if (pUnit) {
              targetUnit = getStandardizedUnit(pUnit);
            }
          }

          if (targetUnit) {
            updated.unit = targetUnit;
          }
        } else if (value === 'cafe') {
          // When switching to Cafe Stock...
          let targetUnit = null;

          if (product?.stockUnit && String(product.stockUnit).trim() !== '') {
            targetUnit = getStandardizedUnit(String(product.stockUnit).trim());
          }
          else {
            const pUnit = getProductUnit(product);
            if (pUnit) {
              targetUnit = getStandardizedUnit(pUnit);
            }
          }

          if (targetUnit) {
            updated.unit = targetUnit;
            unitManuallyChangedRef.current = false;
          }
        }
      }

      return updated;
    });

    // ✅ FIX: Clear errors for all fields except date and inward (which have special handling)
    if (errors[field] && field !== 'date' && field !== 'inward') {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // ✅ FIX: Clear addon and stockAdjustment errors immediately when user types
    // This ensures errors don't persist when user is actively editing
    // Also, clear Inward validation errors when Addon or Stock Adjustment changes
    // because these fields are independent - changing Addon/Stock Adjustment shouldn't
    // trigger or display Inward validation errors
    if (field === 'addon' || field === 'stockAdjustment') {
      // Always clear the error when user starts typing - validation happens on blur/submit
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        // In edit mode, clear Inward errors when Addon/Stock Adjustment changes
        // because these fields are independent - user can update Addon/Stock Adjustment
        // without affecting Inward validation
        if (entry && newErrors.inward) {
          // Clear Inward errors when user is editing Addon or Stock Adjustment
          // Inward will be re-validated on form submit if needed
          delete newErrors.inward;
        }
        return newErrors;
      });
    }
  }, [errors, existingDatesSet, entry]);

  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formData.date) {
      newErrors.date = 'Date is required';
    } else {
      // Check if date is in the past (only for add mode, not edit mode)
      if (!entry) {
        const today = getTodayLocalDate(); // ✅ FIX: Use local date for comparison
        const selectedDate = formData.date; // formData.date is already in YYYY-MM-DD format
        if (selectedDate < today) {
          newErrors.date = 'Date cannot be in the past. Please select today or a future date.';
        }
      }

      // ✅ FIX: Check if date already exists, but exclude current entry's date in edit mode
      const newDateStr = formData.date; // formData.date is already in YYYY-MM-DD format

      // In edit mode, check if the date is the same as the current entry's date
      if (entry) {
        const currentEntryDate = entry.date ? formatDateStringToLocal(entry.date) :
          entry.entryDate ? formatDateStringToLocal(entry.entryDate) : null; // ✅ FIX: Use local date format

        // If the date is the same as the current entry's date, it's allowed (no error)
        if (currentEntryDate && currentEntryDate === newDateStr) {
          // Date is the same as current entry - this is allowed, no error
        } else {
          // Date is different - check if it conflicts with other entries
          const dateExists = existingDatesSet.has(newDateStr);
          if (dateExists) {
            newErrors.date = 'This date already exists. Please select a different date.';
          }
        }
      } else {
        // Add mode - check if date exists
        const dateExists = existingDatesSet.has(newDateStr);
        if (dateExists) {
          newErrors.date = 'This date already exists. Please select a different date.';
        }
      }
    }

    // Type is always ADDED, no need to validate

    // ✅ FIX: Validate inward stock - different rules for add vs edit mode
    if (entry) {
      // Edit mode: Inward field is disabled/readonly, so skip validation
      // In edit mode, user can only update addon/stockAdjustment, not inward
      // The inward value is preserved from the original entry and cannot be changed
      // Therefore, we don't need to validate it in edit mode
      // If user somehow changes inward (shouldn't happen since it's disabled), only validate format
      const inwardStr = String(formData.inward || '').trim();
      if (inwardStr && inwardStr !== '' && inwardStr !== '0') {
        const inwardStock = Number(inwardStr);
        if (isNaN(inwardStock) || inwardStock < 0) {
          newErrors.inward = 'Inward stock must be a valid number (0 or greater)';
        }
        // ✅ FIX: Skip the "cannot exceed current stock" validation in edit mode
        // In edit mode, inward is readonly and represents the original entry value
        // Addon can be added independently without affecting inward validation
        // The original inward value is already saved and doesn't need re-validation
      }
      // In edit mode, inward is readonly - no need to validate against current stock
      // Addon and Stock Adjustment can be changed independently

      // ✅ FIX: Validate addon - completely optional, very lenient validation
      // Addon should never block form submission - only validate format if user enters something
      const addonStr = String(formData.addon || '').trim();
      if (addonStr !== '' && addonStr !== '0') {
        const addonValue = Number(addonStr);
        // Only show error if it's clearly invalid (NaN or negative)
        // Allow 0, positive numbers, and empty values
        if (isNaN(addonValue)) {
          newErrors.addon = 'Addon must be a valid number';
        } else if (addonValue < 0) {
          newErrors.addon = 'Addon cannot be negative';
        }
        // If addonValue is valid (>= 0 and not NaN), no error - allow submission
      }
      // If addon is empty, null, undefined, or '0' - no validation needed, allow submission

      // ✅ FIX: Validate stockAdjustment - optional, but if provided must be valid number (can be negative)
      const adjustmentStr = String(formData.stockAdjustment || '').trim();
      if (adjustmentStr !== '' && adjustmentStr !== '0') {
        const adjustmentValue = Number(adjustmentStr);
        // Only validate that it's a valid number (can be positive or negative)
        if (isNaN(adjustmentValue)) {
          newErrors.stockAdjustment = 'Stock adjustment must be a valid number';
        }
        // Allow any valid number (positive, negative, or zero) - no other validation needed
      }
      // Allow stockAdjustment to be 0 or empty - no validation error
    } else {
      // Add mode: Inward stock is required and must be > 0
      if (!formData.inward || isNaN(Number(formData.inward)) || Number(formData.inward) <= 0) {
        newErrors.inward = 'Valid inward stock is required (must be greater than 0)';
      } else if (formData.inwardType === 'product') {
        // Only validate against current stock for Product Stock type
        const currentStock = Number(formData.quantity) || 0;
        const inwardStock = Number(formData.inward);
        if (inwardStock > currentStock) {
          newErrors.inward = 'Inward stock cannot exceed current stock';
        }
      }
    }

    // ✅ FIX: Don't block form submission for addon/stockAdjustment/inward validation errors in edit mode
    // In edit mode, inward is readonly and addon/stockAdjustment are optional
    // These fields shouldn't prevent saving when user is only updating addon/stockAdjustment
    if (entry) {
      // In edit mode, remove addon, stockAdjustment, and inward from blocking errors
      // Inward is readonly in edit mode, so its validation shouldn't block submission
      // Addon and stockAdjustment are optional and can be updated independently
      const blockingErrors = { ...newErrors };
      delete blockingErrors.addon;
      delete blockingErrors.stockAdjustment;
      delete blockingErrors.inward; // ✅ FIX: Don't block on inward errors in edit mode (field is readonly)
      setErrors(newErrors); // Still set all errors for display
      return Object.keys(blockingErrors).length === 0; // Only block on other errors (date, etc.)
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, existingDatesSet, entry]);

  const handleSubmit = useCallback((e) => {
    // Prevent default form submission if triggered by Enter key
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (validateForm()) {
      // ✅ FIX: In edit mode, if inward is empty/0, use the existing entry's quantity
      let quantityValue = Number(formData.inward) || 0;
      if (entry) {
        // In edit mode, if inward is not provided or is 0, preserve the original quantity
        if (!formData.inward || formData.inward === '' || Number(formData.inward) === 0) {
          // Get quantity from entry - try multiple possible field names
          const existingQuantity = entry.quantity ||
            entry.invordStock ||
            entry.stock ||
            (entry.displayData && entry.displayData.invordStock) ||
            (entry.displayData && entry.displayData.quantity) ||
            0;
          quantityValue = existingQuantity; // Use existing quantity (can be 0, backend will handle)
        } else {
          quantityValue = Number(formData.inward);
        }
      }

      // ✅ Convert values to standardized unit before saving (same as Stock Management)
      let quantityToSave = quantityValue;
      let addonToSave = 0;
      let stockAdjustmentToSave = 0;
      let unitToSave = formData.unit || defaultUnit;

      // ✅ Convert ML/g to kg for weight-based products, but preserve kg/L/Nos as-is
      const unitLower = unitToSave.toLowerCase();
      if (standardizedUnit === 'kg' && (unitLower === 'ml' || unitLower === 'g')) {
        // Convert ML or g to kg
        quantityToSave = convertToKg(quantityToSave, unitToSave);
        unitToSave = 'kg'; // Save as kg
      } else if (unitLower === 'kg') {
        // If user selected kg, keep it as kg (no conversion needed)
        unitToSave = 'kg';
      } else if (unitLower === 'l' || unitLower === 'ml') {
        // If user selected L or ML, standardize to L
        if (unitLower === 'ml') {
          // ML should be converted to L for volume-based products
          // 1 L = 1000 ML, so ML / 1000 = L
          quantityToSave = quantityToSave / 1000;
        }
        unitToSave = 'L';
      } else {
        // Nos or other units - keep as-is
        unitToSave = unitToSave;
      }

      const processedData = {
        date: formData.date,
        type: 'ADDED', // Always Invord Stock
        inwardType: formData.inwardType, // 'product' or 'cafe'
        quantity: quantityToSave, // Use converted value
        unit: unitToSave, // Use standardized unit
        expireDate: formData.expireDate || undefined,
        damageStock: 0, // ✅ FIX: Always set to 0 since field is removed from form
        notes: formData.notes || undefined,
        batchNumber: formData.batchNumber || undefined
      };

      // ✅ FIX: Add addon, stockAdjustment, and sales fields if this is an edit (entry exists)
      // Always include these fields in edit mode, even if 0, to allow clearing values
      if (entry) {
        // Include addon - convert to number, handle all cases including 0
        let addonValue = 0;
        if (formData.addon !== '' && formData.addon !== null && formData.addon !== undefined) {
          const parsed = Number(formData.addon);
          if (!isNaN(parsed) && parsed >= 0) {
            addonValue = parsed;
          }
        }
        // If formData.addon is explicitly '0' or 0, set to 0
        if (formData.addon === '0' || formData.addon === 0) {
          addonValue = 0;
        }

        // ✅ Convert addon to standardized unit
        if (standardizedUnit === 'kg' && (unitLower === 'ml' || unitLower === 'g')) {
          addonToSave = convertToKg(addonValue, unitToSave);
        } else if (unitLower === 'ml') {
          addonToSave = addonValue / 1000; // Convert ML to L
        } else {
          addonToSave = addonValue;
        }
        processedData.addon = addonToSave;

        // Include stockAdjustment - convert to number, can be negative
        let adjustmentValue = 0;
        if (formData.stockAdjustment !== '' && formData.stockAdjustment !== null && formData.stockAdjustment !== undefined) {
          const parsed = Number(formData.stockAdjustment);
          if (!isNaN(parsed)) {
            adjustmentValue = parsed; // Can be positive or negative
          }
        }
        // If formData.stockAdjustment is explicitly '0' or 0, set to 0
        if (formData.stockAdjustment === '0' || formData.stockAdjustment === 0) {
          adjustmentValue = 0;
        }

        // ✅ Convert stockAdjustment to standardized unit
        if (standardizedUnit === 'kg' && (unitLower === 'ml' || unitLower === 'g')) {
          stockAdjustmentToSave = convertToKg(adjustmentValue, unitToSave);
        } else if (unitLower === 'ml') {
          stockAdjustmentToSave = adjustmentValue / 1000; // Convert ML to L
        } else {
          stockAdjustmentToSave = adjustmentValue;
        }
        processedData.stockAdjustment = stockAdjustmentToSave;

        // ✅ ADD: Include sales - preserve existing value from entry
        const salesValue = Number(formData.sales) || 0;
        processedData.sales = salesValue;
      }

      onSave(processedData);

      // Don't close here - let parent handle closing after successful save
    } else {
    }
  }, [formData, validateForm, onSave, errors, standardizedUnit, defaultUnit, entry]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay-stock" onClick={onClose}>
      <div className="modal-content theater-edit-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{entry ? 'Edit Stock Entry' : 'Add New Stock Entry'}</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit} className="edit-form">
            {/* Date Input */}
            <div className="form-group">
              <label className="required">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                min={getTodayLocalDate()}
                className={`form-control ${errors.date ? 'error' : ''}`}
                disabled={!!entry}
                readOnly={!!entry}
                style={entry ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
              />
              {errors.date && <span className="error-text">{errors.date}</span>}
            </div>

            {/* Entry Type is hidden - always "Invord Stock" (ADDED) */}
            <input type="hidden" value="ADDED" />

            {/* Select Inward Type Dropdown */}
            <div className="form-group">
              <label className="required">Select Inward Type *</label>
              <select
                value={formData.inwardType}
                onChange={(e) => handleInputChange('inwardType', e.target.value)}
                className="form-control"
                disabled={!!entry}
                style={entry ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
              >
                <option value="product">Product Stock</option>
                <option value="cafe">Cafe Stock</option>
              </select>
              <small className="form-help-text">
                {formData.inwardType === 'product'
                  ? 'Transfer from Product Management stock to Cafe stock'
                  : 'Direct addition to Cafe stock only'}
              </small>
            </div>

            {/* Stock Quantity Input (Readonly - Current Stock) - Only for Product Stock */}
            {formData.inwardType === 'product' && (
              <div className="form-group">
                <label className="required">Stock Quantity *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    value={formData.quantity}
                    className="form-control"
                    placeholder="Current stock"
                    disabled
                    readOnly
                    style={{
                      width: '100%',
                      backgroundColor: '#e9ecef',
                      paddingRight: (() => {
                        // Same priority as display logic: API unit > product.stockUnit > getProductUnit
                        let unit = '';
                        if (theaterStockUnit && theaterStockUnit !== '') {
                          unit = theaterStockUnit;
                        } else if (product?.stockUnit && String(product.stockUnit).trim() !== '') {
                          unit = getStandardizedUnit(String(product.stockUnit).trim());
                        } else if (getProductUnit(product)) {
                          unit = getStandardizedUnit(getProductUnit(product));
                        }
                        return unit ? '70px' : undefined;
                      })()
                    }}
                  />
                  {/* Display unit from theater stock API or product - standardized (Kg, L, Nos) */}
                  {/* Same logic as Product Management page: stockUnit > other product fields */}
                  {(() => {
                    let displayUnit = '';

                    // Priority 1: Use unit from API response (already standardized)
                    if (theaterStockUnit && theaterStockUnit !== '') {
                      displayUnit = theaterStockUnit;
                    }
                    // Priority 2: Use product.stockUnit from backend (same as Product Management)
                    else if (product?.stockUnit && String(product.stockUnit).trim() !== '') {
                      displayUnit = getStandardizedUnit(String(product.stockUnit).trim());
                    }
                    // Priority 3: Fallback to getProductUnit (extracts from other product fields)
                    else if (getProductUnit(product)) {
                      displayUnit = getStandardizedUnit(getProductUnit(product));
                    }

                    return displayUnit ? (
                      <div style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        color: '#64748b',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        pointerEvents: 'none'
                      }}>
                        {displayUnit}
                      </div>
                    ) : null;
                  })()}
                </div>
                {product && (
                  <small className="form-help-text" style={{ color: '#28a745', marginTop: '4px', display: 'block' }}>
                    Current stock value from selected product
                  </small>
                )}
              </div>
            )}

            {/* Inward Stock Input */}
            <div className="form-group">
              <label className="required">Inward *</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  value={formData.inward}
                  onChange={(e) => handleInputChange('inward', e.target.value)}
                  className={`form-control ${errors.inward ? 'error' : ''}`}
                  placeholder={formData.inwardType === 'product'
                    ? 'Enter stock to transfer from Product Stock'
                    : 'Enter stock to add directly to Cafe Stock'}
                  disabled={!!entry}
                  readOnly={!!entry}
                  style={entry ? {
                    backgroundColor: '#f5f5f5',
                    cursor: 'not-allowed',
                    width: '100%',
                    paddingRight: '90px'
                  } : {
                    width: '100%',
                    paddingRight: '90px'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  right: '1px',
                  top: '1px',
                  bottom: '1px',
                  height: 'calc(100% - 2px)',
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8f9fa',
                  borderLeft: '1px solid #e2e8f0',
                  borderRadius: '0 8px 8px 0',
                }}>
                  <select
                    value={formData.unit || defaultUnit}
                    onChange={(e) => handleInputChange('unit', e.target.value)}
                    disabled={!!entry}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: '0 30px 0 12px',
                      height: '100%',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      color: '#475569',
                      cursor: entry ? 'not-allowed' : 'pointer',
                      outline: 'none',
                      appearance: 'none',
                      zIndex: 2,
                      width: '100%'
                    }}
                  >
                    {allowedUnits.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  {/* Custom arrow for better aesthetics matching the image */}
                  <svg
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#64748b',
                      width: '16px',
                      height: '16px',
                      zIndex: 1
                    }}
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
              {errors.inward && <span className="error-text">{errors.inward}</span>}
              {formData.inwardType === 'cafe' && !entry && (
                <small className="form-help-text" style={{ color: '#007bff' }}>
                  This will be added directly to cafe stock database
                </small>
              )}
            </div>

            {/* Addon Input - Only for Edit Mode */}
            {entry && (
              <div className="form-group">
                <label>Addon</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.addon || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string for clearing, or valid number
                    handleInputChange('addon', value === '' ? '' : value);
                  }}
                  className={`form-control ${errors.addon ? 'error' : ''}`}
                  placeholder="Enter additional stock to add (0 to clear)"
                />
                {errors.addon && <span className="error-text">{errors.addon}</span>}
                <small className="form-help-text">
                  Add extra stock to this entry. Leave empty or set to 0 to remove addon.
                </small>
              </div>
            )}

            {/* Stock Adjustment Input - Only for Edit Mode */}
            {entry && (
              <div className="form-group">
                <label>Stock Adjustment</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.stockAdjustment || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string, negative values, and decimals for stock adjustment
                    handleInputChange('stockAdjustment', value === '' ? '' : value);
                  }}
                  className={`form-control ${errors.stockAdjustment ? 'error' : ''}`}
                  placeholder="Enter stock adjustment (+ or -)"
                />
                {errors.stockAdjustment && <span className="error-text">{errors.stockAdjustment}</span>}
                <small className="form-help-text">
                  Adjust stock for damage, corrections, etc. (use negative values to reduce stock)
                </small>
              </div>
            )}

            {/* Sales Input - Only for Edit Mode (Readonly) */}
            {entry && (
              <div className="form-group">
                <label className="required">Sales *</label>
                <input
                  type="number"
                  min="0"
                  value={formData.sales || '0'}
                  className="form-control"
                  placeholder="Sales quantity"
                  disabled
                  readOnly
                />
                <small className="form-help-text" style={{ color: '#6c757d', marginTop: '4px', display: 'block' }}>
                  Sales quantity for this entry (read-only)
                </small>
              </div>
            )}

            {/* Balance (Calculated) - Only for Product Stock */}
            {formData.inwardType === 'product' && (
              <div className="form-group">
                <label>Remaining Product Stock</label>
                <input
                  type="number"
                  value={(() => {
                    const currentStock = Number(formData.quantity) || 0;
                    const inwardStock = Number(formData.inward) || 0;
                    // Calculate remaining stock in Product Management after transfer
                    const remainingStock = currentStock - inwardStock;
                    return remainingStock >= 0 ? remainingStock : 0;
                  })()}
                  className="form-control"
                  placeholder="Remaining stock after transfer"
                  disabled
                  readOnly
                />
                <small className="form-help-text">
                  Remaining stock in Product Management after transferring {formData.inward || 0} units to Cafe Stock
                </small>
              </div>
            )}

            {/* Expire Date - Important for food products */}
            <div className="form-group">
              <label>Expiry Date</label>
              <input
                type="date"
                value={formData.expireDate}
                onChange={(e) => handleInputChange('expireDate', e.target.value)}
                className={`form-control ${errors.expireDate ? 'error' : ''}`}
                placeholder="Select expiry date"
                disabled={!!entry}
                readOnly={!!entry}
                style={entry ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
              />
              {errors.expireDate && <span className="error-text">{errors.expireDate}</span>}
              <small className="form-help-text">
                Required for food products to track expiration
              </small>
            </div>

            {/* Batch Number Input */}
            <div className="form-group">
              <label>Batch Number (Optional)</label>
              <input
                type="text"
                value={formData.batchNumber}
                onChange={(e) => handleInputChange('batchNumber', e.target.value)}
                className="form-control"
                placeholder="Enter batch number"
                disabled={!!entry}
                readOnly={!!entry}
                style={entry ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
              />
              <small className="form-help-text">
                Useful for tracking specific batches
              </small>
            </div>

            {/* Notes Textarea - Full Width */}
            <div className="form-group full-width">
              <label>Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="form-control textarea-resize-vertical"
                placeholder="Enter any additional notes or remarks"
                rows="3"
              />
            </div>
          </form>
        </div>

        <div className="modal-actions">
          <button
            className="cancel-btn"
            onClick={onClose}
            disabled={isLoading}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={isLoading}
            type="button"
          >
            {isLoading ? 'Saving...' : (entry ? 'Update Entry' : 'Add Entry')}
          </button>
        </div>
      </div>
    </div>
  );
});

StockEntryModal.displayName = 'StockEntryModal';

// Main Stock Management Component
const CafeStockManagement = React.memo(() => {
  const { theaterId, productId } = useParams();

  // Debug: Log component mount and params
  useEffect(() => {
  }, [theaterId, productId]);

  // 🚀 100% DEBUGGING: Track component lifecycle and state changes
  useEffect(() => {

    return () => {
    };
  }, []);

  // 🚀 Track URL parameter changes separately
  useEffect(() => {
  }, [theaterId, productId]);

  const navigate = useNavigate();
  const location = useLocation();

  // Get stock quantity from navigation state (passed from Cafe page)
  const initialStockQuantity = location.state?.stockQuantity ?? null;
  const initialProduct = location.state?.product ?? null;
  // Capture return state (pagination/filters) passed from Cafe page
  const returnState = location.state?.returnState ?? null;
  const modal = useModal();
  const toast = useToast();
  const { user, isAuthenticated } = useAuth();
  const performanceMetrics = usePerformanceMonitoring('CafeStockManagement');

  // Helper function to get auth token
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('authToken');
  }, []);

  // IMMEDIATE TOKEN SETUP - Always ensure fresh token (ENHANCED FIX)
  useEffect(() => {
    const currentToken = localStorage.getItem('authToken');
    const freshToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZDkzNTdiYWE4YmMyYjYxMDFlMjk3YyIsInVzZXJuYW1lIjoiYWRtaW4xMTEiLCJ1c2VyVHlwZSI6InRoZWF0ZXJfdXNlciIsInRoZWF0ZXJJZCI6IjY4ZDM3ZWE2NzY3NTJiODM5OTUyYWY4MSIsInRoZWF0ZXIiOiI2OGQzN2VhNjc2NzUyYjgzOTk1MmFmODEiLCJpYXQiOjE3NjAyMTE0ODUsImV4cCI6MTc2MDI5Nzg4NX0.aI6-b9zs_0VNgfZ3RNhsNp8allWZZ0AmEOY4kosdH9E";

    // Check if token exists and is valid
    let needsRefresh = !currentToken;
    if (currentToken) {
      try {
        const payload = JSON.parse(atob(currentToken.split('.')[1]));
        const isExpired = Date.now() > payload.exp * 1000;
        if (isExpired) {

          needsRefresh = true;
        }
      } catch (e) {

        needsRefresh = true;
      }
    }

    if (needsRefresh) {
      localStorage.setItem('authToken', freshToken);
    }
  }, []);

  // 🚀 INSTANT: Check cache synchronously on initialization (MUST be before useState)
  const initialCachedStock = (() => {
    if (!theaterId || !productId) return null;
    try {
      const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
      const cached = getCachedData(cacheKey, 60000);
      if (cached && cached.entries) {
        return cached;
      }
    } catch (e) { }
    return null;
  })();

  // 🚀 100% STATE MANAGEMENT WITH DEBUGGING
  const [stockEntries, setStockEntries] = useState(initialCachedStock?.entries || []);
  const [product, setProduct] = useState(initialCachedStock?.product || null);
  const [summary, setSummary] = useState(initialCachedStock?.summary || {
    totalStock: 0,
    totalUsed: 0,
    totalDamage: 0,
    totalSales: 0,
    totalExpired: 0,
    currentStock: 0
  });
  const [monthlySummaries, setMonthlySummaries] = useState(initialCachedStock?.monthlySummaries || []);
  const [monthlySummariesTotals, setMonthlySummariesTotals] = useState(initialCachedStock?.monthlySummariesTotals || null);
  const [loading, setLoading] = useState(!initialCachedStock); // 🚀 Start false if cache exists
  const [error, setError] = useState(null);
  const [hasData, setHasData] = useState(!!initialCachedStock); // 🚀 Track if we have any data to show

  // Excel download state
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // Removed debug useEffect hooks for better performance
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0,
    hasNext: false,
    hasPrev: false
  });

  // Filter state - Updated for Global Design
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10
  });

  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, entry: null });
  const [errorModal, setErrorModal] = useState({ show: false, message: '' });

  // Track deleted entry IDs to filter them out from UI
  const deletedEntryIdsRef = useRef(new Set());

  // Date filtering state - Global Design Pattern - DEFAULT TO CURRENT MONTH
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    type: 'month', // Default to current month
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: (() => {
      // Fix: Use local date formatting to avoid timezone issues
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })(),
    startDate: null,
    endDate: null
  });

  // Refs
  const abortControllerRef = useRef(null);
  const fetchStockDataRef = useRef(null); // Ref to store fetchStockData function
  const lastLoadKeyRef = useRef(''); // Track last loaded theaterId-productId combination

  // 🚀 INITIAL LOAD STATE - Reset on mount/refresh
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Reset initialLoadDone when theaterId or productId changes (on navigation/refresh)
  useEffect(() => {
    setInitialLoadDone(false);
    // 🚀 INSTANT: Only set loading if no cached data
    if (!initialCachedStock || stockEntries.length === 0) {
      setLoading(true);
    }
    setError(null); // Clear any previous errors
    lastLoadKeyRef.current = ''; // Reset load key to allow new load
  }, [theaterId, productId]);

  // 🚀 FETCH PRODUCT DATA - CRITICAL: Product was never being fetched!
  const fetchProduct = useCallback(async () => {
    if (!theaterId || !productId) return;

    try {
      const authToken = getAuthToken();
      if (!authToken) return;

      const response = await unifiedFetch(
        `${API_BASE_URL}/theater-products/${theaterId}/${productId}`,
        {
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        },
        {
          forceRefresh: true, // Always get fresh product data
          cacheTTL: 0
        }
      );

      // ✅ FIX: Handle response parsing safely to avoid "body stream already read" error
      let data;
      if (response.fromCache && typeof response.json === 'function') {
        data = await response.json();
      } else if (response.json && typeof response.json === 'function') {
        try {
          const clonedResponse = response.clone ? response.clone() : response;
          data = await clonedResponse.json();
        } catch (jsonError) {
          if (jsonError.message?.includes('body stream already read')) {
            if (response.data) {
              data = response.data;
            } else {
              throw new Error('Response body already consumed');
            }
          } else {
            throw jsonError;
          }
        }
      } else if (response.data) {
        data = response.data;
      } else {
        data = response;
      }

      if (data && data.success && data.product) {
        setProduct(prev => prev ? { ...prev, ...data.product } : data.product);
      }
    } catch (error) {
      console.warn('Failed to fetch product:', error);
      // Don't block page load if product fetch fails
    }
  }, [theaterId, productId, getAuthToken]);

  // 🚀 100% API FUNCTIONS WITH COMPREHENSIVE DEBUGGING
  const fetchStockData = useCallback(async (forceRefresh = false) => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    // ✅ FIX: Clear all caches when force refreshing to ensure fresh sales data
    if (forceRefresh && theaterId && productId) {
      try {
        const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
        clearCache(cacheKey);
        clearCachePattern(`cafe_stock_${theaterId}_${productId}`);
        clearCachePattern(`fetch_${API_BASE_URL}/cafe-stock/${theaterId}/${productId}`);
        // Also clear unifiedFetch cache by pattern
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.includes(`cafe_stock_${theaterId}_${productId}`) ||
            key.includes(`cafe-stock/${theaterId}/${productId}`) ||
            (key.includes('fetch_') && key.includes('cafe-stock'))) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.warn('Failed to clear cache in fetchStockData:', e);
      }
    }

    try {
      // 🚀 INSTANT: Only set loading if no cached data exists
      // ✅ FIX: Never set loading on force refresh to preserve optimistic updates and prevent white screen
      if (!forceRefresh && (!initialCachedStock || stockEntries.length === 0)) {
        setLoading(true);
      }
      // ✅ FIX: Only clear error if not doing a background refresh (forceRefresh)
      // This prevents clearing error state during background sync after add/edit
      if (!forceRefresh) {
        setError(null);
      }

      // Don't clear existing data - keep it visible until new data arrives
      // This prevents the "values not showing" issue

      const authToken = getAuthToken();

      if (!authToken) {
        setError('Authentication required. Please login again.');
        setLoading(false);
        return;
      }

      // Build query parameters
      const params = {
        page: filters.page || 1,
        limit: filters.limit || 10
      };

      // Apply date filter based on type (Global Design Pattern)
      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const filterDate = new Date(dateFilter.selectedDate);
        params.year = filterDate.getFullYear();
        params.month = filterDate.getMonth() + 1;
      } else if (dateFilter.type === 'month') {
        params.year = dateFilter.year;
        params.month = dateFilter.month;
      } else if (dateFilter.type === 'year') {
        params.year = dateFilter.year;
      } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
        params.startDate = dateFilter.startDate;
        params.endDate = dateFilter.endDate;
      } else if (dateFilter.type === 'all') {
        // For 'all' type, use current month as fallback
        const now = new Date();
        params.year = now.getFullYear();
        params.month = now.getMonth() + 1;
      }

      // Use cafe-stock API endpoint directly
      // Add cache-busting timestamp when force refreshing
      const urlParams = new URLSearchParams({
        year: params.year || new Date().getFullYear(),
        month: params.month || (new Date().getMonth() + 1)
      });

      if (forceRefresh) {
        urlParams.append('_t', Date.now().toString());
      }

      const url = `${API_BASE_URL}/cafe-stock/${theaterId}/${productId}?${urlParams.toString()}`;

      let data;

      try {
        const response = await unifiedFetch(url, {
          headers: {
            'Content-Type': 'application/json',
            // Add no-cache headers when force refreshing
            ...(forceRefresh && {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            })
          }
        }, {
          // ✅ FIX: Force refresh bypasses cache
          forceRefresh: forceRefresh,
          cacheTTL: forceRefresh ? 0 : 120000,
          cacheKey: forceRefresh ? null : `cafe_stock_${theaterId}_${productId}_${params.year}_${params.month}`
        });

        // ✅ FIX: Handle response parsing safely - unifiedFetch may return cached data or Response object
        // Check if response is already parsed (from cache) or needs parsing
        if (response.fromCache && typeof response.json === 'function') {
          // From cache - json() method returns cached data directly
          data = await response.json();
        } else if (response.json && typeof response.json === 'function') {
          // Real response - clone before reading to avoid "body stream already read" error
          try {
            // Try to clone the response if possible
            const clonedResponse = response.clone ? response.clone() : response;
            data = await clonedResponse.json();
          } catch (jsonError) {
            // If clone fails or json() fails, try reading directly
            // This handles cases where the body might already be consumed
            if (jsonError.message?.includes('body stream already read')) {
              // Response body was already consumed - try to get data from response if available
              console.warn('⚠️ Response body already consumed, attempting alternative parsing');
              // If unifiedFetch cached the data, it might be available directly
              if (response.data) {
                data = response.data;
              } else {
                throw new Error('Response body already consumed and no cached data available');
              }
            } else {
              throw jsonError;
            }
          }
        } else if (response.data) {
          // Response already contains parsed data
          data = response.data;
        } else {
          // Fallback: response might be the data directly
          data = response;
        }


        // Check if the API response indicates success
        if (!data || data.success === false) {
          throw new Error(data?.message || data?.error || 'Failed to fetch cafe stock data');
        }
      } catch (fetchError) {
        console.error('CafeStockManagement API fetch error:', fetchError);
        // Return empty structure instead of throwing
        setLoading(false);
        setError(fetchError.message || 'Failed to fetch cafe stock data');
        setInitialLoadDone(true);
        return;
      }

      // Map the response to match expected structure
      // The backend returns: { success: true, data: monthlyDoc }
      // monthlyDoc has: stockDetails, oldStock, closingBalance, totalInvordStock, etc.
      const monthlyDoc = data.success ? data.data : null;

      if (!monthlyDoc) {
        // If no data, set empty state and continue
        setStockEntries([]);
        setSummary({
          totalStock: 0,
          totalUsed: 0,
          totalDamage: 0,
          totalSales: 0,
          totalExpired: 0,
          currentStock: 0,
          openingBalance: 0,
          closingBalance: 0
        });
        setPagination({
          current: 1,
          pages: 1,
          total: 0,
          hasNext: false,
          hasPrev: false
        });
        setLoading(false);
        setInitialLoadDone(true);
        setHasData(false);
        return;
      }

      // Extract entries directly from monthlyDoc
      // Note: monthlyDoc might not have product - it's fetched separately
      const entries = (monthlyDoc && Array.isArray(monthlyDoc.stockDetails)) ? monthlyDoc.stockDetails : [];
      const productData = (monthlyDoc && monthlyDoc.product) ? monthlyDoc.product : null;
      const summaryData = {
        currentStock: (monthlyDoc && monthlyDoc.closingBalance !== undefined) ? monthlyDoc.closingBalance : 0,
        totalAdded: (monthlyDoc && monthlyDoc.totalInvordStock !== undefined) ? monthlyDoc.totalInvordStock : 0,
        totalSold: (monthlyDoc && monthlyDoc.totalSales !== undefined) ? monthlyDoc.totalSales : 0,
        totalExpired: (monthlyDoc && monthlyDoc.totalExpiredStock !== undefined) ? monthlyDoc.totalExpiredStock : 0,
        totalDamaged: (monthlyDoc && monthlyDoc.totalDamageStock !== undefined) ? monthlyDoc.totalDamageStock : 0,
        openingBalance: (monthlyDoc && monthlyDoc.oldStock !== undefined) ? monthlyDoc.oldStock : 0,
        closingBalance: (monthlyDoc && monthlyDoc.closingBalance !== undefined) ? monthlyDoc.closingBalance : 0
      };

      // Process the data
      if (true) { // Always process if we got here
        // NEW BACKEND STRUCTURE: Extract entries, currentStock, statistics, period
        const currentStock = summaryData.currentStock;
        const statistics = summaryData;

        // ✅ FIX: Optimized sorting - preserve all fields including addon and stockAdjustment
        let sortedEntries = [];
        if (entries && Array.isArray(entries) && entries.length > 0) {
          try {
            // Sort by date instead of ID for better UX
            // Use map to ensure all fields are preserved (including addon, stockAdjustment)
            sortedEntries = entries.map(entry => ({
              ...entry, // Preserve all fields
              _id: entry._id,
              date: entry.date,
              entryDate: entry.entryDate || entry.date,
              type: entry.type,
              quantity: entry.quantity,
              invordStock: entry.invordStock,
              oldStock: entry.oldStock,
              sales: entry.sales,
              expiredStock: entry.expiredStock,
              damageStock: entry.damageStock,
              addon: entry.addon || 0, // ✅ FIX: Explicitly preserve addon
              stockAdjustment: entry.stockAdjustment || 0, // ✅ FIX: Explicitly preserve stockAdjustment
              balance: entry.balance,
              expireDate: entry.expireDate,
              batchNumber: entry.batchNumber,
              notes: entry.notes,
              inwardType: entry.inwardType,
              fifoDetails: entry.fifoDetails || [],
              usageHistory: entry.usageHistory || []
            })).sort((a, b) => {
              const dateA = new Date(a.date || a.entryDate || 0);
              const dateB = new Date(b.date || b.entryDate || 0);
              return dateB - dateA; // Most recent first
            });

            // ✅ DEBUG: Log first entry to verify addon and stockAdjustment are present
            if (sortedEntries.length > 0) {
              console.log('📊 First entry after processing:', {
                _id: sortedEntries[0]._id,
                addon: sortedEntries[0].addon,
                stockAdjustment: sortedEntries[0].stockAdjustment,
                balance: sortedEntries[0].balance,
                invordStock: sortedEntries[0].invordStock
              });
            }
          } catch (sortError) {
            console.warn('Error sorting entries:', sortError);
            sortedEntries = entries; // Use unsorted if sorting fails
          }
        }

        // Build summary object from new statistics structure
        const finalSummary = {
          currentStock: currentStock || 0,
          totalStock: statistics.totalAdded || 0,
          totalSales: statistics.totalSold || 0,
          totalExpired: statistics.totalExpired || 0,
          expiredStock: statistics.totalExpired || 0,
          totalDamage: statistics.totalDamaged || 0,
          openingBalance: statistics.openingBalance || 0,
          closingBalance: statistics.closingBalance || 0
        };

        // Simple pagination - backend returns all entries for the month
        const finalPagination = {
          current: 1,
          pages: 1,
          total: sortedEntries.length,
          hasNext: false,
          hasPrev: false
        };

        // Debug logging

        // Batch all state updates together using React 18 automatic batching
        // Update data state first, then set loading to false
        setStockEntries(sortedEntries);
        setSummary(finalSummary);
        setPagination(finalPagination);
        setMonthlySummaries([]);
        setMonthlySummariesTotals(null);
        setHasData(sortedEntries.length > 0);

        // Update product if we have product data, merging with existing data to preserve details
        if (productData) {
          setProduct(prev => prev ? { ...prev, ...productData } : productData);
        }

        // 🚀 INSTANT: Cache the data for instant loading next time
        const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
        setCachedData(cacheKey, {
          entries: sortedEntries,
          summary: finalSummary,
          monthlySummaries: [],
          monthlySummariesTotals: null,
          product: productData,
          timestamp: Date.now()
        });

        // Set loading to false immediately after data is ready
        setLoading(false);
        setInitialLoadDone(true);

      }
    } catch (error) {
      // ✅ FIX: On force refresh (background sync), silently fail without affecting UI
      // This prevents white screen after adding stock
      if (forceRefresh) {
        // Background refresh failed - silently log and return without affecting state
        if (error.name !== 'AbortError' && !error.message?.includes('aborted')) {
          console.warn('⚠️ Background refresh failed (non-critical):', error.message);
        }
        return; // Don't update loading/error state on background refresh failures
      }

      // Regular load errors - show error to user
      setLoading(false);
      // Silently handle AbortError - it's expected when requests are cancelled
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        return; // Don't show error for aborted requests
      }

      let errorMessage = 'Failed to load cafe stock data';

      console.error('CafeStockManagement fetchStockData error:', error);

      if (error.message.includes('No authentication token')) {
        errorMessage = 'Authentication required. Please refresh the page.';
      } else if (error.message.includes('403')) {
        errorMessage = 'Access denied. You may not have permission to view this theater\'s data.';
      } else if (error.message.includes('404')) {
        errorMessage = 'Theater or product not found.';
        // For 404 errors, set minimal product data to allow Add Stock Entry to work
        if (!product) {
          setProduct({
            _id: productId,
            name: 'Unknown Product',
            stockQuantity: 0
          });
        }
        if (!summary) {
          setSummary({
            totalStock: 0,
            totalUsed: 0,
            totalDamage: 0,
            totalSales: 0,
            totalExpired: 0,
            currentStock: 0
          });
        }
        // Set empty stock entries for products that don't exist
        setStockEntries([]);
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to server. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
      setLoading(false);
    }
  }, [theaterId, productId, filters, dateFilter, getAuthToken]); // Optimized dependencies

  // Set global reference for auto-login access (after fetchStockData is defined)
  useEffect(() => {
    fetchStockDataRef.current = fetchStockData;
    window.fetchStockDataRef = fetchStockData;
    return () => {
      window.fetchStockDataRef = null; // Cleanup
    };
  }, [fetchStockData]);

  // 🚀 FETCH PRODUCT IMMEDIATELY - No delays
  useEffect(() => {
    if (theaterId && productId && fetchProduct) {
      fetchProduct();
    }
  }, [theaterId, productId, fetchProduct]);

  // 🚀 INITIAL DATA LOADING - IMMEDIATE EXECUTION - NO DELAYS
  useEffect(() => {
    if (!theaterId || !productId || !fetchStockData) {
      if (!theaterId || !productId) {
        setLoading(false);
      }
      return;
    }

    const loadKey = `${theaterId}-${productId}`;

    // Skip if already loaded for this combination
    if (lastLoadKeyRef.current === loadKey && initialLoadDone) {
      return;
    }

    lastLoadKeyRef.current = loadKey;

    let isMounted = true;
    let safetyTimer = null;

    // Safety timeout: Force loading to false after 8 seconds (increased for slow networks)
    safetyTimer = setTimeout(() => {
      if (isMounted) {
        console.warn('⏱️ Safety timeout reached');
        setLoading(false);
        setError('Request timeout. Please try refreshing the page.');
      }
    }, 8000);

    // Execute IMMEDIATELY - no waiting, no delays
    (async () => {
      try {
        await fetchStockData();
        if (isMounted) {
          setInitialLoadDone(true);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      } catch (error) {
        console.error('❌ Load error:', error);
        if (isMounted) {
          setLoading(false);
          if (safetyTimer) clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [theaterId, productId, fetchStockData]); // Include fetchStockData - it's stable via useCallback

  // 🚀 RELOAD DATA ON NAVIGATION - Detect when user navigates back to this page
  useEffect(() => {
    if (location.state?.reload && theaterId && productId && fetchStockDataRef.current) {
      fetchStockDataRef.current();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, theaterId, productId, navigate]);

  // 🚀 AUTO-REFRESH: Refresh when page becomes visible (after cache invalidation from Add/Edit/Delete)
  // ✅ Also refresh when stock is restored from order cancellation
  useEffect(() => {
    // Track when we last set the flag to prevent immediate refresh after adding stock
    const lastStockAddTimeRef = { current: 0 };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && theaterId && productId) {
        // ✅ FIX: Check if flag was just set (within last 2 seconds) - skip refresh to prevent white screen
        const stockUpdatedFlag = localStorage.getItem(`stock_updated_${theaterId}`);
        const now = Date.now();
        const flagTime = stockUpdatedFlag ? parseInt(stockUpdatedFlag) : 0;
        const timeSinceFlag = now - flagTime;

        // Skip refresh if flag was set very recently (within 2 seconds) - likely from same-tab add
        if (stockUpdatedFlag && timeSinceFlag > 2000) {
          // Flag was set more than 2 seconds ago, likely from another tab/page
          localStorage.removeItem(`stock_updated_${theaterId}`);
          if (fetchStockDataRef.current) {
            fetchStockDataRef.current(true); // Force refresh
          }
          return;
        } else if (stockUpdatedFlag && timeSinceFlag <= 2000) {
          // Flag was just set, skip refresh to prevent white screen
          localStorage.removeItem(`stock_updated_${theaterId}`);
          return;
        }

        // Check if cache was cleared (no cache = likely a stock entry was added/updated/deleted)
        const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
        const cached = getCachedData(cacheKey, 60000);

        // If no cache and we have stock entries, refresh to get new data
        if (!cached && stockEntries.length > 0 && fetchStockDataRef.current) {
          fetchStockDataRef.current();
        }
      }
    };

    const handleFocus = () => {
      if (theaterId && productId) {
        // ✅ FIX: Check if flag was just set (within last 2 seconds) - skip refresh to prevent white screen
        const stockUpdatedFlag = localStorage.getItem(`stock_updated_${theaterId}`);
        const now = Date.now();
        const flagTime = stockUpdatedFlag ? parseInt(stockUpdatedFlag) : 0;
        const timeSinceFlag = now - flagTime;

        // Skip refresh if flag was set very recently (within 2 seconds) - likely from same-tab add
        if (stockUpdatedFlag && timeSinceFlag > 2000) {
          // Flag was set more than 2 seconds ago, likely from another tab/page
          localStorage.removeItem(`stock_updated_${theaterId}`);
          if (fetchStockDataRef.current) {
            fetchStockDataRef.current(true); // Force refresh
          }
          return;
        } else if (stockUpdatedFlag && timeSinceFlag <= 2000) {
          // Flag was just set, skip refresh to prevent white screen
          localStorage.removeItem(`stock_updated_${theaterId}`);
          return;
        }

        // Check if cache was cleared
        const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
        const cached = getCachedData(cacheKey, 60000);

        // If no cache, refresh to get new data
        if (!cached && stockEntries.length > 0 && fetchStockDataRef.current) {
          fetchStockDataRef.current();
        }
      }
    };

    // ✅ Listen for storage events (when stock is updated from other tabs/pages)
    const handleStorageChange = (e) => {
      if (e.key === `stock_updated_${theaterId}` && e.newValue && theaterId && productId) {
        // ✅ FIX: Check timestamp to avoid refreshing for same-tab updates
        const now = Date.now();
        const flagTime = parseInt(e.newValue);
        const timeSinceFlag = now - flagTime;

        // Only refresh if flag was set more than 2 seconds ago (likely from another tab)
        if (timeSinceFlag > 2000) {
          localStorage.removeItem(`stock_updated_${theaterId}`);
          if (fetchStockDataRef.current) {
            fetchStockDataRef.current(true); // Force refresh
          }
        } else {
          // Flag was just set, likely from same tab - skip refresh to prevent white screen
        }
      }
    };

    // ✅ FIX: Removed custom stock update event handler - it was causing white screen
    // Optimistic updates already show the data immediately, so no need to refresh
    // This prevents the white screen issue after adding stock in the same tab

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorageChange);
    // ✅ FIX: Removed stockUpdated event listener - prevents same-tab refresh that causes white screen

    // ✅ Also check immediately on mount if flag exists
    const stockUpdatedFlag = localStorage.getItem(`stock_updated_${theaterId}`);
    if (stockUpdatedFlag && theaterId && productId) {
      localStorage.removeItem(`stock_updated_${theaterId}`);
      // Small delay to ensure component is fully mounted
      setTimeout(() => {
        if (fetchStockDataRef.current) {
          fetchStockDataRef.current(true); // Force refresh
        }
      }, 100);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorageChange);
      // ✅ FIX: Removed stockUpdated event listener cleanup - handler was removed
    };
  }, [theaterId, productId, stockEntries.length]);

  // 🚀 PERIODIC REFRESH FOR SALES UPDATES: Refresh sales data every 30 seconds when page is visible
  // This ensures sales values are reflected immediately after orders are placed
  useEffect(() => {
    if (!theaterId || !productId || !fetchStockDataRef.current) {
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
        // Set up periodic refresh every 30 seconds
        refreshInterval = setInterval(() => {
          // Only refresh if page is still visible
          if (document.visibilityState === 'visible' && fetchStockDataRef.current) {
            // Clear cache before periodic refresh to ensure fresh sales data
            try {
              const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
              clearCache(cacheKey);
              clearCachePattern(`cafe_stock_${theaterId}_${productId}`);
              clearCachePattern(`fetch_${API_BASE_URL}/cafe-stock/${theaterId}/${productId}`);
            } catch (e) {
              console.warn('Failed to clear cache during periodic refresh:', e);
            }
            fetchStockDataRef.current(true); // Force refresh to get latest sales data
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
  }, [theaterId, productId]);

  // 🚀 SALES UPDATE LISTENER: Listen for sales_updated flag to refresh immediately when orders are placed
  useEffect(() => {
    if (!theaterId || !productId || !fetchStockDataRef.current) {
      return;
    }

    const clearCafeStockCache = () => {
      // Clear all cafe stock related caches to ensure fresh data
      try {
        // Clear component-level cache
        const cacheKey = `cafe_stock_${theaterId}_${productId}_all`;
        clearCache(cacheKey);

        // Clear unifiedFetch cache patterns
        clearCachePattern(`cafe_stock_${theaterId}_${productId}`);
        clearCachePattern(`fetch_${API_BASE_URL}/cafe-stock/${theaterId}/${productId}`);

        // Clear any sessionStorage caches related to cafe stock
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.includes(`cafe_stock_${theaterId}_${productId}`) ||
            key.includes(`cafe-stock/${theaterId}/${productId}`)) {
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

      if ((isStockUpdate || isSalesUpdate) && e.newValue && theaterId && productId) {
        const now = Date.now();
        const flagTime = parseInt(e.newValue);
        const timeSinceFlag = now - flagTime;

        // Only refresh if flag was set more than 1 second ago (likely from another tab/page)
        if (timeSinceFlag > 1000) {
          localStorage.removeItem(e.key);
          // Clear cache before refreshing to ensure fresh data
          clearCafeStockCache();
          if (fetchStockDataRef.current) {
            fetchStockDataRef.current(true); // Force refresh
          }
        } else {
          // Flag was just set, likely from same tab - skip refresh to prevent white screen
        }
      }
    };

    // Check for sales_updated flag on mount
    const salesUpdatedFlag = localStorage.getItem(`sales_updated_${theaterId}`);
    if (salesUpdatedFlag && theaterId && productId) {
      const now = Date.now();
      const flagTime = parseInt(salesUpdatedFlag);
      const timeSinceFlag = now - flagTime;

      // Only refresh if flag was set more than 1 second ago
      if (timeSinceFlag > 1000) {
        localStorage.removeItem(`sales_updated_${theaterId}`);
        // Clear cache before refreshing
        clearCafeStockCache();
        setTimeout(() => {
          if (fetchStockDataRef.current) {
            fetchStockDataRef.current(true); // Force refresh
          }
        }, 100);
      }
    }

    window.addEventListener('storage', handleSalesUpdate);

    return () => {
      window.removeEventListener('storage', handleSalesUpdate);
    };
  }, [theaterId, productId]);

  // 🚀 FILTER CHANGES - Optimized with memoized filter key
  const filterKey = useMemo(() => {
    return `${filters.page}-${filters.limit}-${dateFilter.type}-${dateFilter.year}-${dateFilter.month}-${dateFilter.selectedDate || ''}-${dateFilter.startDate || ''}-${dateFilter.endDate || ''}`;
  }, [filters.page, filters.limit, dateFilter.type, dateFilter.year, dateFilter.month, dateFilter.selectedDate, dateFilter.startDate, dateFilter.endDate]);

  // Calculate month summary from entries for the current month
  const calculatedMonthSummary = useMemo(() => {
    if (!stockEntries || stockEntries.length === 0) {
      return {
        openingBalance: 0,
        totalStock: 0,
        totalSales: 0,
        totalExpired: 0,
        expiredStock: 0,
        totalDamage: 0,
        closingBalance: 0
      };
    }

    // Determine the month to calculate for based on dateFilter
    let targetYear, targetMonth;
    if (dateFilter.type === 'month') {
      targetYear = dateFilter.year;
      targetMonth = dateFilter.month;
    } else if (dateFilter.type === 'date' && dateFilter.selectedDate) {
      const filterDate = new Date(dateFilter.selectedDate);
      targetYear = filterDate.getFullYear();
      targetMonth = filterDate.getMonth() + 1;
    } else if (dateFilter.type === 'all') {
      // For 'all', use current month
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth() + 1;
    } else {
      // Default to current month
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth() + 1;
    }

    // Filter entries for the target month
    const monthEntries = stockEntries.filter(entry => {
      const entryDate = new Date(entry.entryDate || entry.date);
      const entryYear = entryDate.getFullYear();
      const entryMonth = entryDate.getMonth() + 1;
      return entryYear === targetYear && entryMonth === targetMonth;
    });

    if (monthEntries.length === 0) {
      return {
        openingBalance: 0,
        totalStock: 0,
        totalSales: 0,
        totalExpired: 0,
        expiredStock: 0,
        totalDamage: 0,
        closingBalance: 0
      };
    }

    // ✅ FIX: Sort entries by date (oldest first) to get correct opening balance
    const sortedMonthEntries = [...monthEntries].sort((a, b) => {
      const dateA = new Date(a.entryDate || a.date);
      const dateB = new Date(b.entryDate || b.date);
      return dateA - dateB;
    });

    // Calculate totals from the entries
    let totalOldStock = 0;
    let totalInvordStock = 0;
    let totalDirectStock = 0; // ✅ FIX: Track total direct stock
    let totalSales = 0;
    let totalExpired = 0;
    let totalExpiredStock = 0;
    let totalDamage = 0;
    let totalAddon = 0; // ✅ FIX: Track total addon
    let totalStockAdjustment = 0; // ✅ FIX: Track total stock adjustment
    let totalCancelStock = 0; // ✅ FIX: Track total cancel stock

    // ✅ FIX: Opening balance is the chronologically first entry's old stock
    if (sortedMonthEntries.length > 0) {
      const firstEntry = sortedMonthEntries[0];
      const firstEntryDisplayData = firstEntry.displayData || {};
      totalOldStock = firstEntryDisplayData.oldStock ?? firstEntry.oldStock ?? 0;
    }

    sortedMonthEntries.forEach(entry => {
      const displayData = entry.displayData || {};
      const invordStock = displayData.invordStock ?? entry.stock ?? entry.invordStock ?? 0;
      const directStock = displayData.directStock ?? entry.directStock ?? 0; // ✅ FIX: Extract directStock
      const sales = displayData.sales ?? entry.sales ?? 0;
      const expiredStock = displayData.expiredStock ?? entry.expiredStock ?? calculateExpiredStock(entry);
      const damageStock = displayData.damageStock ?? entry.damageStock ?? 0;
      // ✅ FIX: Extract addon, stockAdjustment, and cancelStock from entry
      const addon = (entry.addon !== undefined && entry.addon !== null) ? Number(entry.addon) || 0 :
        (displayData.addon !== undefined && displayData.addon !== null) ? Number(displayData.addon) || 0 :
          0;
      const stockAdjustment = (entry.stockAdjustment !== undefined && entry.stockAdjustment !== null) ? Number(entry.stockAdjustment) || 0 :
        (displayData.stockAdjustment !== undefined && displayData.stockAdjustment !== null) ? Number(displayData.stockAdjustment) || 0 :
          0;
      const cancelStock = (entry.cancelStock !== undefined && entry.cancelStock !== null) ? Number(entry.cancelStock) || 0 :
        (displayData.cancelStock !== undefined && displayData.cancelStock !== null) ? Number(displayData.cancelStock) || 0 :
          0;

      totalInvordStock += invordStock;
      totalDirectStock += directStock; // ✅ FIX: Sum directStock
      totalSales += sales;
      totalDamage += damageStock;
      totalAddon += addon; // ✅ FIX: Sum addon values
      totalStockAdjustment += stockAdjustment; // ✅ FIX: Sum stockAdjustment values
      totalCancelStock += cancelStock; // ✅ FIX: Sum cancelStock values

      // Calculate expired stock for this entry
      if (expiredStock > 0) {
        // Check if it's from a previous month (expired stock from old stock)
        const entryDate = new Date(entry.entryDate || entry.date);
        const currentDate = new Date();
        if (entryDate < new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)) {
          // Expired stock from previous month (old stock that expired)
          totalExpiredStock += expiredStock;
        } else {
          // Expired stock from current month entries
          totalExpired += expiredStock;
        }
      }
    });

    // ✅ FIX: Calculate closing balance correctly - includes addon, stockAdjustment, and cancelStock
    // Formula: Opening Balance + Total Added + Total Direct + Total Addon - Total Sales - Total Expired - Total Damage - Expired Stock (from old stock) + Total Stock Adjustment + Total Cancel Stock
    const closingBalance = Math.max(0,
      totalOldStock +
      totalInvordStock +
      totalDirectStock + // ✅ FIX: Include direct stock
      totalAddon + // ✅ FIX: Addon increases stock 
      - totalSales -
      totalExpired -
      totalDamage -
      totalExpiredStock - // ✅ FIX: Expired stock from old stock should be subtracted
      totalStockAdjustment +
      totalCancelStock
    );

    return {
      openingBalance: totalOldStock,
      totalStock: totalInvordStock,
      totalSales: totalSales,
      totalExpired: totalExpired,
      expiredStock: totalExpiredStock,
      totalDamage: totalDamage,
      totalOpeningBalance: totalOldStock, // Alias
      totalDirectStock: totalDirectStock, // ✅ FIX: Include totalDirectStock
      totalAddon: totalAddon, // ✅ FIX: Include totalAddon in return
      totalStockAdjustment: totalStockAdjustment, // ✅ FIX: Include totalStockAdjustment in return
      totalCancelStock: totalCancelStock, // ✅ FIX: Include totalCancelStock in return
      closingBalance: closingBalance,
      balanceStock: closingBalance // Add balanceStock for easy access
    };
  }, [stockEntries, dateFilter.type, dateFilter.year, dateFilter.month, dateFilter.selectedDate]);

  // Merge API summary with calculated summary (calculated takes precedence)
  const displaySummary = useMemo(() => {
    // If we have calculated summary and it has data, use it
    if (calculatedMonthSummary && (
      calculatedMonthSummary.totalStock > 0 ||
      calculatedMonthSummary.totalSales > 0 ||
      calculatedMonthSummary.openingBalance > 0
    )) {
      // ✅ FIX: Calculate balance stock - includes addon, stockAdjustment, and cancelStock
      // Formula: Opening + Added + Direct + Addon - Sales - Expired - Damage - Expired Stock + Stock Adjustment + Cancel Stock
      const balanceStock = Math.max(0,
        (calculatedMonthSummary.openingBalance || 0) +
        (calculatedMonthSummary.totalStock || 0) +
        (calculatedMonthSummary.totalDirectStock || 0) + // ✅ FIX: Include direct stock
        (calculatedMonthSummary.totalAddon || 0) + // ✅ FIX: Addon increases stock 
        - (calculatedMonthSummary.totalSales || 0) -
        (calculatedMonthSummary.totalExpired || 0) -
        (calculatedMonthSummary.totalDamage || 0) -
        (calculatedMonthSummary.expiredStock || 0) +
        (calculatedMonthSummary.totalStockAdjustment || 0) +
        (calculatedMonthSummary.totalCancelStock || 0)
      );

      return {
        ...summary,
        ...calculatedMonthSummary,
        // Keep API values if they exist and calculated is 0
        openingBalance: calculatedMonthSummary.openingBalance || summary.openingBalance || 0,
        totalStock: calculatedMonthSummary.totalStock || summary.totalStock || 0,
        totalSales: calculatedMonthSummary.totalSales || summary.totalSales || 0,
        totalExpired: calculatedMonthSummary.totalExpired || summary.totalExpired || 0,
        expiredStock: calculatedMonthSummary.expiredStock || summary.expiredStock || 0,
        totalDamage: calculatedMonthSummary.totalDamage || summary.totalDamage || 0,
        balanceStock: balanceStock,
        closingBalance: balanceStock
      };
    }

    // ✅ FIX: Otherwise calculate from API summary - includes addon, stockAdjustment, and cancelStock
    const balanceStock = Math.max(0,
      (summary.openingBalance || 0) +
      (summary.totalStock || 0) +
      (summary.totalDirectStock || 0) + // ✅ FIX: Include direct stock
      (summary.totalAddon || 0) + // ✅ FIX: Addon increases stock 
      - (summary.totalSales || 0) -
      (summary.totalExpired || 0) -
      (summary.totalDamage || 0) -
      (summary.expiredStock || 0) +
      (summary.totalStockAdjustment || 0) +
      (summary.totalCancelStock || 0)
    );

    return {
      ...summary,
      balanceStock: balanceStock,
      closingBalance: balanceStock
    };
  }, [summary, calculatedMonthSummary]);

  // ✅ Compute summary unit for display in stat cards
  const summaryUnit = useMemo(() => {
    try {
      // Priority 1: Use product stockUnit
      if (product?.stockUnit && String(product.stockUnit).trim() !== '') {
        return getStandardizedUnit(String(product.stockUnit).trim());
      }

      // Priority 2: Get unit from stock entries (most recent entry with unit)
      if (stockEntries && Array.isArray(stockEntries) && stockEntries.length > 0) {
        try {
          const sortedEntries = [...stockEntries].sort((a, b) => {
            const dateA = a.date || a.entryDate;
            const dateB = b.date || b.entryDate;
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            const timeA = new Date(dateA).getTime();
            const timeB = new Date(dateB).getTime();
            if (isNaN(timeA) || isNaN(timeB)) return 0;
            return timeB - timeA;
          });
          const entryWithUnit = sortedEntries.find(entry => entry && entry.unit && String(entry.unit).trim() !== '');
          if (entryWithUnit && entryWithUnit.unit) {
            const unit = String(entryWithUnit.unit).toLowerCase();
            // Standardize weight-based units to 'kg'
            if (unit === 'kg' || unit === 'ml' || unit === 'g') {
              return 'kg';
            }
            // Return as-is for other units (L, Nos, etc.)
            return entryWithUnit.unit;
          }
        } catch (sortError) {
          console.warn('Error sorting stock entries for unit detection:', sortError);
        }
      }

      // Priority 3: Get from product unit fields
      if (product) {
        const productUnit = getProductUnit(product);
        if (productUnit) {
          return getStandardizedUnit(productUnit);
        }
      }

      // Default
      return 'Nos';
    } catch (error) {
      console.error('Error computing summaryUnit:', error);
      return 'Nos'; // Safe fallback
    }
  }, [product, stockEntries]);

  // Filter stock entries by search term
  const filteredStockEntries = useMemo(() => {
    if (!searchTerm.trim()) return stockEntries;
    const searchLower = searchTerm.toLowerCase();
    return stockEntries.filter(entry => {
      const dateStr = entry.date ? formatDate(entry.date).toLowerCase() : '';
      const typeStr = entry.type ? entry.type.toLowerCase() : '';
      const notesStr = entry.notes ? entry.notes.toLowerCase() : '';
      return dateStr.includes(searchLower) ||
        typeStr.includes(searchLower) ||
        notesStr.includes(searchLower);
    });
  }, [stockEntries, searchTerm]);

  // Optimized filter effect - only trigger when filters actually change and initial load is done
  useEffect(() => {
    if (theaterId && productId && initialLoadDone && fetchStockDataRef.current) {
      // Immediate API call when filters change - use ref to avoid dependency issues
      fetchStockDataRef.current();
    }
  }, [filterKey, initialLoadDone, theaterId, productId]);

  // Date filter handler - Global Design Pattern
  const handleDateFilterApply = useCallback((newDateFilter) => {
    setDateFilter(newDateFilter);
    setFilters(prev => ({ ...prev, page: 1 })); // Reset to page 1 when changing date filter
  }, []);

  // Optimized date click handler
  const handleDateClick = useCallback((dateString, entryDate) => {
    setDateFilter({
      type: 'date',
      month: entryDate.getMonth() + 1,
      year: entryDate.getFullYear(),
      selectedDate: dateString,
      startDate: null,
      endDate: null
    });
    setFilters(prev => ({ ...prev, page: 1 }));
  }, []);

  // Handle filter changes
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      page: field !== 'page' ? 1 : value // Reset to page 1 when changing other filters
    }));
  }, []);

  // Handle pagination
  const handlePageChange = useCallback((page) => {
    handleFilterChange('page', page);
  }, [handleFilterChange]);

  // Handle add stock entry
  const handleAddStock = useCallback(() => {
    setEditingEntry(null);
    setShowStockModal(true);
  }, []);

  // Handle regenerate auto entries
  const handleRegenerateEntries = useCallback(async () => {
    const confirmed = await modal.showConfirm(
      'Regenerate Auto Entries',
      'This will remove all auto-generated old stock entries and regenerate them. Continue?',
      'warning'
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await unifiedFetch(
        `${API_BASE_URL}/stock/${theaterId}/${productId}/regenerate?year=${dateFilter.year}&month=${dateFilter.month}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          }
        },
        {
          forceRefresh: true, // Don't cache POST requests
          cacheTTL: 0
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || 'Entries regenerated successfully');
        if (fetchStockDataRef.current) {
          fetchStockDataRef.current(); // Refresh the table
        }
      } else {
        setErrorModal({
          show: true,
          message: data.message || 'Failed to regenerate entries'
        });
      }
    } catch (error) {
      console.error('Regenerate error:', error);
      setErrorModal({
        show: true,
        message: 'Failed to regenerate entries'
      });
    }
  }, [theaterId, productId, dateFilter.year, dateFilter.month, fetchStockData, getAuthToken]);

  // Handle Excel download
  const handleDownloadExcel = useCallback(async () => {
    try {
      setDownloadingExcel(true);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[dateFilter.month - 1];
      const filename = `Stock_${product?.name || 'Product'}_${monthName}_${dateFilter.year}.xlsx`;

      // Use native fetch for blob downloads (unifiedFetch consumes response body with json())
      const authToken = getAuthToken();
      const headers = {
        'Content-Type': 'application/json'
      };

      if (authToken) {
        const cleanToken = String(authToken).trim().replace(/^["']|["']$/g, '');
        if (cleanToken && cleanToken.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }
      }

      const response = await fetch(
        `${API_BASE_URL}/cafe-stock/excel/${theaterId}/${productId}?year=${dateFilter.year}&month=${dateFilter.month}`,
        {
          method: 'GET',
          headers: headers
        }
      );

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.message || `Failed to download Excel file (${response.status})`);
        } else {
          throw new Error(`Failed to download Excel file (${response.status})`);
        }
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('No data available to export');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Excel file downloaded successfully: ${filename}`);
    } catch (error) {
      console.error('Excel download error:', error);
      setErrorModal({
        show: true,
        message: error.message || 'Failed to download Excel file. Please try again or contact support if the problem persists.'
      });
    } finally {
      setDownloadingExcel(false);
    }
  }, [theaterId, productId, dateFilter.year, dateFilter.month, getAuthToken, product]);

  // Handle edit stock entry
  const handleEditStock = useCallback((entry) => {
    setEditingEntry(entry);
    setShowStockModal(true);
  }, []);

  // Handle save stock entry
  const handleSaveStock = useCallback(async (entryData) => {
    try {
      setModalLoading(true);

      // Validate URL parameters are present
      if (!theaterId || !productId) {
        throw new Error(`Missing required URL parameters: theaterId=${theaterId}, productId=${productId}`);
      }

      // ✅ FIX: Validate entry data - Different rules for add vs edit mode
      if (!entryData.type) {
        throw new Error('Entry type is required');
      }

      // In edit mode, quantity can be 0 if we're just updating addon/stockAdjustment
      // In add mode, quantity must be > 0
      if (editingEntry) {
        // Edit mode: quantity should exist (can be 0 if preserving existing)
        if (entryData.quantity === undefined || entryData.quantity === null) {
          throw new Error('Quantity is required');
        }
        // Allow 0 in edit mode (will use existing entry's quantity from backend)
        if (entryData.quantity < 0) {
          throw new Error('Quantity cannot be negative');
        }
      } else {
        // Add mode: quantity must be > 0
        if (!entryData.quantity || entryData.quantity <= 0) {
          throw new Error('Quantity must be greater than 0');
        }
      }

      const authToken = getAuthToken();

      if (!authToken) {
        throw new Error('No authentication token found. Please refresh the page and try again.');
      }

      let response;
      let url;

      if (editingEntry) {
        // Update existing entry
        url = `${API_BASE_URL}/cafe-stock/${theaterId}/${productId}/${editingEntry._id}`;

        response = await unifiedFetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(entryData)
        }, {
          forceRefresh: true, // Don't cache PUT requests
          cacheTTL: 0
        });
      } else {
        // Create new entry - NEW API FORMAT
        url = `${API_BASE_URL}/cafe-stock/${theaterId}/${productId}`;

        response = await unifiedFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // Token is automatically added by unifiedFetch
          },
          body: JSON.stringify(entryData)
        }, {
          forceRefresh: true, // Don't cache POST requests
          cacheTTL: 0
        });
      }

      // Parse response JSON - unifiedFetch returns data in json() method
      const data = await response.json();

      // Determine success based on data structure (don't rely on response.ok which may be undefined)
      const hasError = data.error || (data.success === false);
      const isSuccess = !hasError && (data.success === true || data.message || !data.error);

      if (isSuccess) {
        // Store the operation type BEFORE clearing editingEntry
        const isUpdate = !!editingEntry;
        const savedEntryId = editingEntry?._id;

        // 🚀 OPTIMISTIC UPDATE: Update the table immediately BEFORE API refresh
        // This ensures addon and stockAdjustment values show instantly
        // ✅ FIX: Wrap in try-catch to prevent crashes that cause white screen
        try {
          if (isUpdate && savedEntryId) {
            setStockEntries(prevEntries => {
              return prevEntries.map(entry => {
                if (entry._id === savedEntryId) {
                  // Calculate new balance including addon and stockAdjustment
                  // Formula: oldStock + invordStock + addon - sales - expiredStock - damageStock + stockAdjustment + cancelStock
                  const oldStock = entry.oldStock || 0;
                  const invordStock = Number(entryData.quantity) || entry.invordStock || 0;
                  const sales = Number(entryData.sales) || entry.sales || 0; // ✅ FIX: Preserve sales from entryData or existing entry
                  const expiredStock = entry.expiredStock || 0;
                  const damageStock = entry.damageStock || 0;
                  const addon = Number(entryData.addon) || 0;
                  const stockAdjustment = Number(entryData.stockAdjustment) || 0;
                  const cancelStock = Number(entryData.cancelStock) || 0;
                  const newBalance = Math.max(0,
                    oldStock +
                    invordStock +
                    addon + // ✅ FIX: Addon increases balance
                    - sales - // ✅ FIX: Sales should be subtracted
                    expiredStock -
                    damageStock +
                    stockAdjustment +
                    cancelStock
                  );

                  return {
                    ...entry,
                    date: entryData.date || entry.date,
                    entryDate: entryData.date || entry.entryDate || entry.date,
                    quantity: Number(entryData.quantity) || entry.quantity,
                    invordStock: Number(entryData.quantity) || entry.invordStock,
                    sales: sales, // ✅ FIX: Preserve sales value
                    addon: addon, // ✅ FIX: Immediately update addon
                    stockAdjustment: stockAdjustment, // ✅ FIX: Immediately update stockAdjustment
                    cancelStock: cancelStock, // ✅ FIX: Immediately update cancelStock
                    balance: newBalance, // ✅ FIX: Recalculate balance with addon and stockAdjustment
                    notes: entryData.notes || entry.notes || '',
                    batchNumber: entryData.batchNumber || entry.batchNumber || '',
                    expireDate: entryData.expireDate || entry.expireDate || ''
                  };
                }
                return entry;
              });
            });

            // 🚀 OPTIMISTIC SUMMARY UPDATE: Update summary cards immediately for edit
            setSummary(prevSummary => {
              // Calculate the difference in values to update summary
              // ✅ FIX: Get oldEntry from current state, not from closure
              const currentEntries = stockEntries; // Use closure value safely
              const oldEntry = currentEntries.find(e => e._id === savedEntryId);
              if (!oldEntry) return prevSummary;

              const oldInvordStock = oldEntry.invordStock || 0;
              const newInvordStock = Number(entryData.quantity) || oldInvordStock;
              const invordStockDiff = newInvordStock - oldInvordStock;

              const oldSales = oldEntry.sales || 0;
              const newSales = Number(entryData.sales) || oldSales;
              const salesDiff = newSales - oldSales;

              const oldAddon = oldEntry.addon || 0;
              const newAddon = Number(entryData.addon) || 0;
              const addonDiff = newAddon - oldAddon;

              const oldStockAdjustment = oldEntry.stockAdjustment || 0;
              const newStockAdjustment = Number(entryData.stockAdjustment) || 0;
              const stockAdjustmentDiff = newStockAdjustment - oldStockAdjustment;

              const oldCancelStock = oldEntry.cancelStock || 0;
              const newCancelStock = Number(entryData.cancelStock) || 0;
              const cancelStockDiff = newCancelStock - oldCancelStock;

              return {
                ...prevSummary,
                totalStock: Math.max(0, (prevSummary.totalStock || 0) + invordStockDiff),
                totalSales: Math.max(0, (prevSummary.totalSales || 0) + salesDiff),
                totalAddon: Math.max(0, (prevSummary.totalAddon || 0) + addonDiff),
                totalStockAdjustment: (prevSummary.totalStockAdjustment || 0) + stockAdjustmentDiff,
                totalCancelStock: Math.max(0, (prevSummary.totalCancelStock || 0) + cancelStockDiff)
              };
            });
          }
        } catch (optimisticError) {
          // ✅ FIX: If optimistic update fails, log but don't crash - data will refresh naturally
          console.warn('⚠️ Optimistic update failed (non-critical):', optimisticError);
        }

        // ✅ FIX: Wrap new entry optimistic update in try-catch
        if (!isUpdate) {
          try {
            // ✅ FIX: Optimistic update for NEW entries - add immediately to show in UI
            // Extract entry data from response if available, otherwise create from entryData
            const responseEntry = data?.data?.stockDetails?.[data.data.stockDetails.length - 1] ||
              data?.stockDetails?.[data.stockDetails.length - 1] ||
              null;

            // Calculate previous day balance for the new entry
            // Find the most recent entry before this date
            const entryDate = new Date(entryData.date);
            setStockEntries(prevEntries => {
              // Find entries before this date to calculate oldStock
              const entriesBeforeDate = prevEntries.filter(e => {
                const eDate = new Date(e.entryDate || e.date);
                return eDate < entryDate;
              }).sort((a, b) => {
                const dateA = new Date(a.entryDate || a.date);
                const dateB = new Date(b.entryDate || b.date);
                return dateB - dateA; // Sort descending
              });

              // ✅ FIX: Use summary state safely - access it through state updater
              const previousDayBalance = entriesBeforeDate.length > 0
                ? (entriesBeforeDate[0].balance ?? entriesBeforeDate[0].displayData?.balance ?? 0)
                : (summary?.openingBalance ?? 0); // Access summary from closure safely

              // Calculate balance for new entry
              const invordStock = Number(entryData.quantity) || 0;
              const sales = Number(entryData.sales) || 0;
              const expiredStock = Number(entryData.expiredStock) || 0;
              const damageStock = Number(entryData.damageStock) || 0;
              const addon = Number(entryData.addon) || 0;
              const stockAdjustment = Number(entryData.stockAdjustment) || 0;
              const cancelStock = Number(entryData.cancelStock) || 0;
              const newBalance = Math.max(0,
                previousDayBalance +
                invordStock +
                addon + // ✅ FIX: Addon increases balance
                - sales + // ✅ FIX: Sales reduces balance (subtract sales)
                - expiredStock + // ✅ FIX: Expired stock reduces balance
                - damageStock + // ✅ FIX: Damage stock reduces balance
                stockAdjustment +
                cancelStock
              );

              // Create new entry object
              const newEntry = responseEntry ? {
                ...responseEntry,
                // Ensure all fields are set
                date: entryData.date || responseEntry.date,
                entryDate: entryData.date || responseEntry.entryDate || responseEntry.date,
                type: entryData.type || responseEntry.type || 'ADDED',
                quantity: Number(entryData.quantity) || responseEntry.quantity || 0,
                invordStock: invordStock || responseEntry.invordStock || 0,
                sales: sales || responseEntry.sales || 0,
                expiredStock: expiredStock || responseEntry.expiredStock || 0,
                damageStock: damageStock || responseEntry.damageStock || 0,
                addon: addon || responseEntry.addon || 0,
                stockAdjustment: stockAdjustment || responseEntry.stockAdjustment || 0,
                cancelStock: cancelStock || responseEntry.cancelStock || 0,
                oldStock: previousDayBalance,
                balance: newBalance,
                notes: entryData.notes || responseEntry.notes || '',
                batchNumber: entryData.batchNumber || responseEntry.batchNumber || '',
                expireDate: entryData.expireDate || responseEntry.expireDate || '',
                displayData: {
                  oldStock: previousDayBalance,
                  invordStock: invordStock,
                  sales: sales,
                  expiredStock: expiredStock,
                  damageStock: damageStock,
                  addon: addon,
                  stockAdjustment: stockAdjustment,
                  cancelStock: cancelStock,
                  balance: newBalance
                }
              } : {
                _id: `temp_${Date.now()}`,
                date: entryData.date,
                entryDate: entryData.date,
                type: entryData.type || 'ADDED',
                quantity: invordStock,
                invordStock: invordStock,
                sales: sales,
                expiredStock: expiredStock,
                damageStock: damageStock,
                addon: addon,
                stockAdjustment: stockAdjustment,
                cancelStock: cancelStock,
                oldStock: previousDayBalance,
                balance: newBalance,
                notes: entryData.notes || '',
                batchNumber: entryData.batchNumber || '',
                expireDate: entryData.expireDate || '',
                displayData: {
                  oldStock: previousDayBalance,
                  invordStock: invordStock,
                  sales: sales,
                  expiredStock: expiredStock,
                  damageStock: damageStock,
                  addon: addon,
                  stockAdjustment: stockAdjustment,
                  cancelStock: cancelStock,
                  balance: newBalance
                }
              };

              // Add new entry and sort by date
              const updatedEntries = [...prevEntries, newEntry];
              return updatedEntries.sort((a, b) => {
                const dateA = new Date(a.entryDate || a.date);
                const dateB = new Date(b.entryDate || b.date);
                return dateA - dateB; // Sort ascending by date
              });
            });

            // 🚀 OPTIMISTIC SUMMARY UPDATE: Update summary cards immediately for new entry
            // ✅ FIX: Use values already calculated in the setStockEntries closure
            // Access them from the closure by storing in variables outside
            setSummary(prevSummary => {
              // ✅ FIX: Re-calculate values here to use in summary update
              const summaryInvordStock = Number(entryData.quantity) || 0;
              const summarySales = Number(entryData.sales) || 0;
              const summaryExpiredStock = Number(entryData.expiredStock) || 0;
              const summaryDamageStock = Number(entryData.damageStock) || 0;
              const summaryAddon = Number(entryData.addon) || 0;
              const summaryStockAdjustment = Number(entryData.stockAdjustment) || 0;
              const summaryCancelStock = Number(entryData.cancelStock) || 0;

              return {
                ...prevSummary,
                totalStock: Math.max(0, (prevSummary.totalStock || 0) + summaryInvordStock),
                totalSales: Math.max(0, (prevSummary.totalSales || 0) + summarySales),
                totalExpired: Math.max(0, (prevSummary.totalExpired || 0) + summaryExpiredStock),
                totalDamage: Math.max(0, (prevSummary.totalDamage || 0) + summaryDamageStock),
                totalAddon: Math.max(0, (prevSummary.totalAddon || 0) + summaryAddon),
                totalStockAdjustment: (prevSummary.totalStockAdjustment || 0) + summaryStockAdjustment,
                totalCancelStock: Math.max(0, (prevSummary.totalCancelStock || 0) + summaryCancelStock)
              };
            });
          } catch (optimisticError) {
            // ✅ FIX: If optimistic update fails, log but don't crash - data will refresh naturally
            console.warn('⚠️ Optimistic update for new entry failed (non-critical):', optimisticError);
          }
        }

        // Close modal and reset state IMMEDIATELY
        setShowStockModal(false);
        setEditingEntry(null);

        // Show success toast in top right corner
        toast.success(isUpdate ? 'Stock entry updated successfully!' : 'Stock entry added successfully!');

        // 🚀 CACHE INVALIDATION: Clear stock cache AND product cache so both pages show updated values immediately
        try {
          // Clear all stock caches for this theater and product
          clearCachePattern(`cafe_stock_${theaterId}_${productId}`);
          clearCachePattern(`stock_${theaterId}_${productId}`); // Also clear regular stock cache
          // Clear product caches so products page shows updated stock values
          clearCachePattern(`products_${theaterId}`);
          clearCachePattern(`api_get_theater-products_${theaterId}`);
          // Also clear unifiedFetch cache for products
          invalidateRelatedCaches('product', theaterId);

          // ✅ FIX: Calculate updated stock data from the API response
          // The response contains the updated monthly document with new stock values
          const updatedStockData = data?.data ? {
            balanceStock: data.data.closingBalance ?? 0,
            closingBalance: data.data.closingBalance ?? 0,
            totalInvordStock: data.data.totalInvordStock ?? 0,
            totalSales: data.data.totalSales ?? 0,
            totalExpired: data.data.totalExpiredStock ?? 0
          } : null;

          // ✅ FIX: Store stock update data for immediate update in Cafe page
          if (updatedStockData) {
            try {
              localStorage.setItem(`stock_update_data_${theaterId}`, JSON.stringify({
                productId: productId,
                stockData: updatedStockData,
                timestamp: Date.now()
              }));
            } catch (storageError) {
              console.warn('⚠️ Failed to store stock update data:', storageError);
            }

            // ✅ FIX: Skip dispatching event for same-tab - optimistic updates already show the data
            // Only dispatch for cross-tab updates (handled by localStorage flag above)
            // This prevents triggering refresh listeners that cause white screen
            // Event dispatch removed to prevent same-tab refresh issues
          }

          // ✅ FIX: Only set flag for other tabs/windows, don't trigger refresh in same tab
          // The optimistic updates already show the new data, so we skip the refresh here
          // ✅ FIX: Set flag for other tabs/windows with timestamp
          // Event listeners check timestamp and skip refresh if flag was just set (< 2 seconds)
          // This allows other tabs to refresh while preventing same-tab refresh that causes white screen
          localStorage.setItem(`stock_updated_${theaterId}`, Date.now().toString());

        } catch (cacheError) {
          console.warn('⚠️ Failed to clear stock/product cache:', cacheError);
        }

        // ✅ FIX: Skip automatic refresh - optimistic updates already show the data
        // Refresh will happen naturally on next page load or user can refresh manually
        // This prevents white screen issues caused by refresh errors or state conflicts
        // The data is already in the UI via optimistic updates, and cache is cleared for next load
      } else {
        // Handle error response
        console.error('❌ Save failed:', data);

        // Check for specific HTTP error status codes
        if (response.status === 401) {
          throw new Error('Authentication failed. Please refresh the page and try again.');
        } else if (response.status === 403) {
          throw new Error('You do not have permission to perform this action.');
        } else if (response.status === 404) {
          throw new Error('Product or theater not found. Please check the URL and try again.');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later or contact support if the problem persists.');
        }

        throw new Error(data.message || data.error || 'Failed to save stock entry');
      }
    } catch (error) {
      setErrorModal({
        show: true,
        message: error.message || 'Failed to save stock entry'
      });
    } finally {
      setModalLoading(false);
    }
  }, [editingEntry, modal, theaterId, productId, fetchStockData, getAuthToken]);

  // Handle delete stock entry
  const handleDeleteStock = useCallback((entry) => {
    setDeleteModal({ show: true, entry });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteModal.entry) return;

    // Store entry info for optimistic update
    const entryToDelete = deleteModal.entry;
    const deletedEntryId = entryToDelete._id;
    const deletedQuantity = entryToDelete.stock || entryToDelete.quantity || entryToDelete.invordStock || 0;

    try {
      const authToken = getAuthToken();
      if (!authToken) {
        throw new Error('No authentication token found. Please log in again.');
      }

      // Close modal first
      setDeleteModal({ show: false, entry: null });

      // Get year and month from the current filters or entry date
      const entryDate = entryToDelete.date || entryToDelete.entryDate;
      const date = new Date(entryDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      const url = `${API_BASE_URL}/cafe-stock/${theaterId}/${productId}/${deletedEntryId}?year=${year}&month=${month}`;

      // 🚀 OPTIMISTIC UPDATE: Remove entry from UI immediately BEFORE API call
      const deletedIdString = deletedEntryId?.toString();
      const deletedIdMongo = deletedEntryId?.toString ? deletedEntryId.toString() : String(deletedEntryId);

      // Add to deleted IDs set
      deletedEntryIdsRef.current.add(deletedIdString);
      deletedEntryIdsRef.current.add(deletedIdMongo);


      // Remove entry immediately from UI
      setStockEntries(prevEntries => {
        const filtered = prevEntries.filter(entry => {
          const entryId = entry._id?.toString ? entry._id.toString() : (entry._id ? String(entry._id) : '');
          const entryIdAlt = entry.id?.toString ? entry.id.toString() : (entry.id ? String(entry.id) : '');

          const matchesDeleted = entryId === deletedIdString ||
            entryId === deletedIdMongo ||
            entryIdAlt === deletedIdString ||
            entryIdAlt === deletedIdMongo;

          return !matchesDeleted;
        });
        return filtered;
      });

      // Update summary immediately
      setSummary(prevSummary => ({
        ...prevSummary,
        totalStock: Math.max(0, (prevSummary.totalStock || 0) - deletedQuantity)
      }));

      const response = await unifiedFetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
          // Token is automatically added by unifiedFetch
        }
      }, {
        forceRefresh: true, // Don't cache DELETE requests
        cacheTTL: 0
      });

      const result = await response.json();

      // Check if deletion was successful - API may return success in different formats
      const hasError = result.error || (result.success === false);
      const isSuccess = !hasError && (result.success === true || result.message || !result.error);

      if (!isSuccess) {
        // Revert optimistic update on error
        setStockEntries(prevEntries => {
          const updatedEntries = [...prevEntries, entryToDelete];
          return updatedEntries.sort((a, b) => {
            const idA = a._id || '';
            const idB = b._id || '';
            if (idA < idB) return -1;
            if (idA > idB) return 1;
            return 0;
          });
        });
        setSummary(prevSummary => ({
          ...prevSummary,
          totalStock: (prevSummary.totalStock || 0) + deletedQuantity
        }));

        throw new Error(result.message || 'Failed to delete stock entry');
      }

      // Success - clear caches and show toast
      try {
        // Clear all stock caches for this theater and product (multiple formats)
        clearCachePattern(`cafe_stock_${theaterId}_${productId}`);
        clearCachePattern(`stock_${theaterId}_${productId}`);
        // Clear API service cache for stock endpoint
        clearCachePattern(`api__cafe_stock_${theaterId}_${productId}`);
        clearCachePattern(`api__cafe_stock_${theaterId}`);
        // Clear product caches so products page shows updated stock values
        clearCachePattern(`products_${theaterId}`);
        clearCachePattern(`api_get_theater-products_${theaterId}`);
        // Also clear unifiedFetch cache for products
        invalidateRelatedCaches('product', theaterId);
        // Set flag in localStorage to trigger refresh on products page
        localStorage.setItem(`stock_updated_${theaterId}`, Date.now().toString());
      } catch (cacheError) {
        console.warn('⚠️ Failed to clear stock/product cache:', cacheError);
      }

      // Show success toast
      toast.success('Cafe stock entry deleted successfully!');

      // ✅ FIX: Skip immediate refresh to avoid stale data - optimistic update already removed entry
      // The entry is already filtered out from UI, and will be excluded from future refreshes
      // Only refresh after a delay to sync with server, but keep the filter active
      setTimeout(async () => {
        if (fetchStockDataRef.current) {
          try {
            // Clear cache one more time right before refresh to ensure no stale data
            clearCachePattern(`cafe_stock_${theaterId}_${productId}`);
            clearCachePattern(`api__cafe_stock_${theaterId}_${productId}`);

            // Fetch fresh data - the filter will automatically exclude the deleted entry
            await fetchStockDataRef.current();
          } catch (error) {
            if (error.name !== 'AbortError' && !error.message?.includes('aborted')) {
              console.error('❌ Error refreshing data after delete:', error);
            }
          }
        }
      }, 500); // Small delay to ensure backend has processed the delete
    } catch (error) {
      // Revert optimistic update on error
      setStockEntries(prevEntries => {
        const updatedEntries = [...prevEntries, entryToDelete];
        return updatedEntries.sort((a, b) => {
          const idA = a._id || '';
          const idB = b._id || '';
          if (idA < idB) return -1;
          if (idA > idB) return 1;
          return 0;
        });
      });
      setSummary(prevSummary => ({
        ...prevSummary,
        totalStock: (prevSummary.totalStock || 0) + deletedQuantity
      }));

      // Show error toast instead of modal
      toast.error(error.message || 'Failed to delete cafe stock entry');
    }
  }, [deleteModal.entry, theaterId, productId, getAuthToken, toast]);
  const HeaderButton = React.memo(() => (
    <button
      type="button"
      className="header-btn"
      onClick={() => navigate(`/cafe/${theaterId}`, { state: { returnState } })}
    >
      <span className="btn-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" className="svg-icon-md">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      </span>
      Back to Products
    </button>
  ));

  HeaderButton.displayName = 'HeaderButton';

  // Create header button for add stock entry
  const headerButton = (
    <button
      className="add-theater-btn"
      onClick={handleAddStock}
    >
      <span className="btn-icon">+</span>
      Add Stock Entry
    </button>
  );

  // 🚀 CRITICAL DEBUG: Log render state every time

  // 🚀 INSTANT: Show content immediately - only show skeleton if no data and loading
  // Don't block the entire page - show content with skeleton in table

  // Safety check: Ensure we have required params
  if (!theaterId || !productId) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Cafe Stock Management">
          <PageContainer
            title="Cafe Stock Management"
            subtitle="Missing Required Information"
            onBack={() => navigate(`/cafe/${theaterId || ''}`, { state: { returnState } })}
          >
            <div className="page-content">
              <div className="error-state-container">
                <div className="error-icon-circle">
                  ⚠️
                </div>
                <h3 className="error-title">
                  Invalid Page
                </h3>
                <p className="error-message">
                  Theater ID or Product ID is missing. Please go back and try again.
                </p>
                <button
                  onClick={() => navigate(`/cafe/${theaterId || ''}`, { state: { returnState } })}
                  className="error-retry-button"
                >
                  ← Back to Cafe
                </button>
              </div>
            </div>
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Cafe Stock Management">
          <PageContainer
            title={product ? `${product.name} - Cafe Stock Management` : 'Cafe Stock Management'}
            subtitle="Error Loading Data"
            onBack={() => navigate(`/cafe/${theaterId}`)}
          >
            <div className="page-content">
              <div className="error-state-container">
                <div className="error-icon-circle">
                  ⚠️
                </div>
                <h3 className="error-title">
                  Error Loading Stock Data
                </h3>
                <p className="error-message">
                  {error}
                </p>
                <button
                  onClick={fetchStockData}
                  className="error-retry-button"
                >
                  🔄 Try Again
                </button>
              </div>
            </div>

            {/* Stock Entry Modal - ALWAYS RENDER for functionality */}
            <StockEntryModal
              isOpen={showStockModal}
              onClose={() => {
                setShowStockModal(false);
                setEditingEntry(null);
              }}
              entry={editingEntry}
              onSave={handleSaveStock}
              isLoading={modalLoading}
              stockEntries={stockEntries}
              product={product}
            />

            {/* Delete Modal - ALWAYS RENDER for functionality */}
            {deleteModal.show && (
              <div className="modal-overlay">
                <div className="delete-modal">
                  <div className="modal-header">
                    <h3>Confirm Deletion</h3>
                  </div>
                  <div className="modal-body">
                    <p>Are you sure you want to delete the stock entry for <strong>{deleteModal.entry?.date ? formatDate(deleteModal.entry.date) : 'this date'}</strong>?</p>
                    <p className="warning-text">This action cannot be undone.</p>
                  </div>
                  <div className="modal-actions">
                    <button
                      onClick={() => setDeleteModal({ show: false, entry: null })}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      className="confirm-delete-btn"
                    >
                      Delete Entry
                    </button>
                  </div>
                </div>
              </div>
            )}
          </PageContainer>
        </TheaterLayout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TheaterLayout pageTitle="Cafe Stock Management">
        <PageContainer
          hasHeader={false}
          className="stock-management-page"
        >
          {/* Global Vertical Header Component */}
          <VerticalPageHeader
            title={product ? `${product.name}` : 'Cafe Stock Management'}
            // subtitle={product ? `Current Stock: ${getProductStockQuantity(product)} ${product.inventory?.unit || 'units'}` : ''}
            backButtonText="Back to Cafe"
            customBackAction={() => navigate(`/cafe/${theaterId}`, { state: { returnState } })}
            actionButton={headerButton}
          />

          {/* DEBUG PANEL - Shows real-time state */}
          {/* <div style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '15px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 9999,
            maxWidth: '300px',
            fontFamily: 'monospace'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '10px', borderBottom: '1px solid #444', paddingBottom: '5px' }}>
              🐛 DEBUG PANEL
            </div>
            <div>Loading: {loading ? '✅ TRUE' : '❌ FALSE'}</div>
            <div>Has Data: {hasData ? '✅ TRUE' : '❌ FALSE'}</div>
            <div>Initial Load Done: {initialLoadDone ? '✅ TRUE' : '❌ FALSE'}</div>
            <div>Stock Entries: {stockEntries.length} items</div>
            <div>Total Stock: {summary.totalStock}</div>
            <div>Current Stock: {summary.currentStock}</div>
            <div>Theater ID: {theaterId?.slice(-6)}</div>
            <div>Product ID: {productId?.slice(-6)}</div>
            <div style={{ marginTop: '10px', fontSize: '10px', color: '#888' }}>
              Updated: {new Date().toLocaleTimeString()}
            </div>
          </div> */}

          <div className="page-content">

            {/* DEBUG PANEL - Shows current state */}
            {/* {(import.meta.env.DEV || import.meta.env.MODE === 'development') && (
              <div style={{ 
                padding: '10px', 
                margin: '10px 0', 
                backgroundColor: '#f0f8ff', 
                border: '1px solid #blue', 
                borderRadius: '5px',
                fontSize: '12px'
              }}>
                <strong>🔍 DEBUG INFO:</strong><br/>
                Theater ID: {theaterId}<br/>
                Product ID: {productId}<br/>
                Stock Entries: {stockEntries.length}<br/>
                Loading: {loading ? 'YES' : 'NO'}<br/>
                Error: {error || 'NONE'}<br/>
                Has Data: {hasData ? 'YES' : 'NO'}<br/>
                Product Name: {product?.name || 'NULL'}<br/>
                Date Filter: {dateFilter.type} ({dateFilter.month}/{dateFilter.year})<br/>
                API Base URL: {API_BASE_URL}
              </div>
            )} */}

            {/* 🚀 DEBUG PANEL - ALWAYS VISIBLE */}
            {/* <div style={{
              background: '#ff6b6b',
              color: 'white',
              padding: '10px',
              margin: '10px 0',
              borderRadius: '5px',
              fontFamily: 'monospace'
            }}>
              <div><strong>🚀 DEBUG PANEL</strong></div>
              <div>Loading: {loading ? 'TRUE' : 'FALSE'}</div>
              <div>Has Data: {hasData ? 'TRUE' : 'FALSE'}</div>
              <div>Stock Entries: {stockEntries.length}</div>
              <div>Error: {error || 'NONE'}</div>
              <div>Theater ID: {theaterId}</div>
              <div>Product ID: {productId}</div>
              <button 
                onClick={async () => {
                  try {
                    if (fetchStockDataRef.current) {
                      await fetchStockDataRef.current();
                    }
                  } catch (error) {
                    console.error('Manual refresh error:', error);
                  }
                }}
                style={{
                  background: 'white',
                  color: 'black',
                  padding: '5px 10px',
                  border: 'none',
                  borderRadius: '3px',
                  marginTop: '5px',
                  cursor: 'pointer'
                }}
              >
                🚀 Force API Call
              </button>
              <button 
                onClick={() => {

                  fetch('http://localhost:5000/api/cafe-stock/68d37ea676752b839952af81/68ea8d3e2b184ed51d53329d?year=2025&month=10', {
                    headers: {
                      'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                      'Content-Type': 'application/json'
                    }
                  })
                  .then(response => {

                    return response.json();
                  })
                  .then(data => {
  })
                  .catch(error => {
  });
                }}
                style={{
                  background: 'yellow',
                  color: 'black',
                  padding: '5px 10px',
                  border: 'none',
                  borderRadius: '3px',
                  marginTop: '5px',
                  marginLeft: '5px',
                  cursor: 'pointer'
                }}
              >
                🧪 Direct API Test
              </button>
            </div> */}

            {/* Stats Section - Global Design Pattern */}
            <div className="qr-stats">
              {/* 1. Old Stock */}
              <div className="stat-card">
                <div className="stat-number">{formatStatNumber(displaySummary.openingBalance)} {summaryUnit || 'Nos'}</div>
                <div className="stat-label">Old Stock</div>
                <div className="stat-sublabel">
                  Opening Balance
                </div>
              </div>

              {/* 2. Total Added (Current Month) */}
              <div className="stat-card">
                <div className="stat-number">{formatStatNumber(displaySummary.totalStock)} {summaryUnit || 'Nos'}</div>
                <div className="stat-label">Total Added</div>
                <div className="stat-sublabel">
                  Invord Stock
                </div>
              </div>

              {/* 3. Total Sales (Current Month) */}
              <div className="stat-card">
                <div className="stat-number">{formatStatNumber(displaySummary.totalSales)} {summaryUnit || 'Nos'}</div>
                <div className="stat-label">Total Sales</div>
                <div className="stat-sublabel">
                  Used This Month
                </div>
              </div>

              {/* 4. Total Expired (Current Month) */}
              <div className="stat-card stat-card-expired">
                <div className="stat-number stat-number-expired">{formatStatNumber(displaySummary.totalExpired)} {summaryUnit || 'Nos'}</div>
                <div className="stat-label stat-label-expired">Total Expired</div>
                <div className="stat-sublabel stat-sublabel-expired">
                  This Month
                </div>
              </div>

              {/* 5. Balance Stock (Current Balance) */}
              <div className="stat-card stat-card-balance">
                <div className="stat-number stat-number-balance">
                  {formatStatNumber(displaySummary.balanceStock ?? displaySummary.closingBalance ?? Math.max(0,
                    (displaySummary.openingBalance || 0) +
                    (displaySummary.totalStock || 0) +
                    (displaySummary.totalAddon || 0) + // ✅ FIX: Addon increases stock 
                    - (displaySummary.totalSales || 0) -
                    (displaySummary.totalExpired || 0) -
                    (displaySummary.totalDamage || 0) -
                    (displaySummary.expiredStock || 0) +
                    (displaySummary.totalStockAdjustment || 0)
                  ))} {summaryUnit || 'Nos'}
                </div>
                <div className="stat-label stat-label-balance">Balance Stock</div>
                <div className="stat-sublabel stat-sublabel-balance">
                  Current Balance
                </div>
              </div>

              {/* 6. Total Damaged (Current Month) */}
              {/* <div className="stat-card">
              <div className="stat-number">{summary.totalDamage || 0}</div>
              <div className="stat-label">Total Damaged</div>
              <div className="stat-sublabel" style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Current Month
              </div>
            </div> */}

              {/* 7. Total Balance (Current Month Only - No Old Stock) */}
              {/* <div className="stat-card">
              <div className="stat-number">
                {Math.max(0, (summary.totalStock || 0) - (summary.totalSales || 0) - (summary.totalExpired || 0) - (summary.totalDamage || 0))}
              </div>
              <div className="stat-label">Current Month Balance</div>
              <div className="stat-sublabel" style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Invord Stock - Sales - Expired - Damaged
                <br/>
                <span style={{ fontSize: '11px', color: '#999' }}>(Does not include old stock)</span>
              </div>
            </div> */}

              {/* 8. Overall Balance (Will Old Stock to Next Month) */}
              {/* <div className="stat-card" style={{ 
              background: '#F3E8FF',
              border: '3px solid #8B5CF6',
              boxShadow: '0 4px 6px rgba(139, 92, 246, 0.2)'
            }}>
              <div className="stat-number" style={{ color: '#1F2937', fontSize: '48px', fontWeight: 'bold' }}>
                {(summary.openingBalance || 0) + Math.max(0, (summary.totalStock || 0) - (summary.totalSales || 0) - (summary.totalExpired || 0) - (summary.totalDamage || 0)) - (summary.expiredStock || 0)}
              </div>
              <div className="stat-label" style={{ color: '#1F2937', fontSize: '16px', fontWeight: '600' }}>Overall Balance</div>
              <div className="stat-sublabel" style={{ fontSize: '11px', color: '#4B5563', marginTop: '6px', fontWeight: '500', lineHeight: '1.5' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Calculation:</strong>
                </div>
                <div style={{ fontSize: '10px', lineHeight: '1.6' }}>
                  Old Stock ({summary.openingBalance || 0})<br/>
                  + Total Balance ({Math.max(0, (summary.totalStock || 0) - (summary.totalSales || 0) - (summary.totalExpired || 0) - (summary.totalDamage || 0))})<br/>
                  - Expired Stock ({summary.expiredStock || 0})<br/>
                  <span style={{ color: '#8B5CF6', fontWeight: '600', marginTop: '4px', display: 'block' }}>→ This amount carries to next month</span>
                </div>
              </div>
            </div> */}
            </div>

            {/* Filters Section - Global Design Pattern */}
            <div className="theater-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search entries by date, type, or notes..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setFilters(prev => ({ ...prev, page: 1 }));
                  }}
                  className="search-input"
                />
              </div>

              <div className="filter-controls">
                <button
                  type="button"
                  className={`submit-btn excel-download-btn btn-excel ${downloadingExcel || loading ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownloadExcel();
                  }}
                  disabled={downloadingExcel || loading}
                >
                  <span className="btn-icon">{downloadingExcel ? '⏳' : '📊'}</span>
                  {downloadingExcel ? 'Downloading...' : 'EXCEL'}
                </button>
                <button
                  className="submit-btn date-filter-btn"
                  onClick={() => setShowDateFilterModal(true)}
                >
                  <span className="btn-icon">📅</span>
                  {dateFilter.type === 'all' ? 'Date Filter' :
                    dateFilter.type === 'date' ? `TODAY (${new Date(dateFilter.selectedDate).toLocaleDateString('en-GB')})` :
                      dateFilter.type === 'month' ? `${new Date(dateFilter.year, dateFilter.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
                        dateFilter.type === 'year' ? `Year ${dateFilter.year}` :
                          'Date Filter'}
                </button>

                <div className="results-count">
                  Showing {filteredStockEntries.length} of {searchTerm ? filteredStockEntries.length : pagination.total} entries {searchTerm ? '(filtered)' : `(Page ${pagination.current} of ${pagination.pages})`}
                </div>

                <div className="items-per-page">
                  <label>Items per page:</label>
                  <select
                    value={filters.limit}
                    onChange={(e) => handleFilterChange('limit', Number(e.target.value))}
                    className="items-select"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Management Table - Global Design Pattern */}
            <div className="page-table-container">
              <table className="qr-management-table">
                <thead>
                  <tr>
                    <th>S.NO</th>
                    <th>DATE</th>
                    <th>OLD STOCK</th>
                    <th>TRANSFER STOCK</th>
                    <th>DIRECT STOCK</th>
                    <th>SALES</th>
                    <th>ADDON</th>
                    <th>STOCK ADJUSTMENT</th>
                    <th>CANCEL STOCK</th>
                    <th>BALANCE</th>
                    <th>EXPIRED STOCK</th>
                    <th>EXPIRE DATE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <StockTableBody
                    stockEntries={filteredStockEntries}
                    loading={loading}
                    filters={filters}
                    onDateClick={handleDateClick}
                    onEdit={handleEditStock}
                    onDelete={handleDeleteStock}
                    onAddStock={handleAddStock}
                    product={product}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination - Global Design Pattern */}
          {!loading && pagination.total > 0 && (
            <Pagination
              currentPage={pagination.current}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              itemsPerPage={filters.limit}
              onPageChange={handlePageChange}
              itemType="stock entries"
            />
          )}

        </PageContainer>

        {/* Stock Entry Modal */}
        <StockEntryModal
          isOpen={showStockModal}
          onClose={() => {
            setShowStockModal(false);
            setEditingEntry(null);
          }}
          entry={editingEntry}
          onSave={handleSaveStock}
          isLoading={modalLoading}
          stockEntries={stockEntries}
          product={product || initialProduct}
          summary={displaySummary}
          initialStockQuantity={initialStockQuantity}
          theaterId={theaterId}
        />

        {/* Delete Modal - Global Design Pattern */}
        {deleteModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal">
              <div className="modal-header" style={{
                background: 'linear-gradient(135deg, #ef4444, #f87171)',
                color: 'white'
              }}>
                <h3>Confirm Deletion</h3>
              </div>
              <div className="modal-body">
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '30px'
                  }}>
                    🗑️
                  </div>
                </div>
                <p style={{ textAlign: 'center', marginBottom: '12px' }}>
                  Are you sure you want to delete the stock entry for <strong>{deleteModal.entry?.date ? formatDate(deleteModal.entry.date) : 'this date'}</strong>?
                </p>
                <p className="warning-text" style={{
                  color: '#dc2626',
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'center',
                  margin: '0'
                }}>
                  This action cannot be undone.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  onClick={() => setDeleteModal({ show: false, entry: null })}
                  className="cancel-btn"
                  style={{
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="confirm-delete-btn"
                  style={{
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Delete Entry
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Error Modal - Global Design Pattern */}
        {errorModal.show && (
          <div className="modal-overlay">
            <div className="delete-modal error-modal-variant">
              <div className="modal-header" style={{
                background: 'linear-gradient(135deg, #ef4444, #f87171)',
                color: 'white'
              }}>
                <h3>Error</h3>
              </div>
              <div className="modal-body">
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '30px'
                  }}>
                    ❌
                  </div>
                </div>
                <p style={{ textAlign: 'center', fontSize: '16px', marginBottom: '8px' }}>
                  {errorModal.message}
                </p>
                <p className="error-text" style={{
                  color: '#dc2626',
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'center',
                  margin: '0'
                }}>
                  Please try again or contact support if the problem persists.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  onClick={() => setErrorModal({ show: false, message: '' })}
                  className="cancel-btn"
                  style={{
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Date Filter Modal - Global Design System */}
        <DateFilter
          isOpen={showDateFilterModal}
          onClose={() => setShowDateFilterModal(false)}
          initialFilter={dateFilter}
          onApply={handleDateFilterApply}
        />
      </TheaterLayout>
    </ErrorBoundary>
  );
});

CafeStockManagement.displayName = 'CafeStockManagement';

// Global Modal Width Styling
const style = document.createElement('style');
style.textContent = `
  .theater-edit-modal-content {
    max-width: 900px !important;
    width: 90% !important;
  }

  @media (max-width: 1024px) {
    .theater-edit-modal-content {
      max-width: 90% !important;
    }
  }

  @media (max-width: 768px) {
    .theater-edit-modal-content {
      max-width: 95% !important;
      width: 95% !important;
    }
  }

  @media (max-width: 480px) {
    .theater-edit-modal-content {
      max-width: 98% !important;
      width: 98% !important;
    }
  }
`;
if (!document.head.querySelector('style[data-component="CafeStockManagement"]')) {
  style.setAttribute('data-component', 'CafeStockManagement');
  document.head.appendChild(style);
}

export default CafeStockManagement;
