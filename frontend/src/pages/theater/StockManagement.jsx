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
import { getCachedData, setCachedData, clearCachePattern } from '@utils/cacheUtils';
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

// Helper to determine cafe stock type
const getCafeStockInfo = (cafeEntry) => {
  if (!cafeEntry) return { transfer: 0, direct: 0, type: null };
  const stock = cafeEntry.invordStock || cafeEntry.quantity || 0;
  // If inwardType is 'cafe', it's direct (not a transfer from product)
  // If inwardType is 'product' or missing (legacy), it's a transfer
  const isDirect = cafeEntry.inwardType === 'cafe';
  return {
    transfer: isDirect ? 0 : stock,
    direct: isDirect ? stock : 0,
    type: isDirect ? 'direct' : 'transfer'
  };
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

  // Weight-based units (kg, ML, g) → display as "kg"
  if (unit === 'kg' || unit === 'ml' || unit === 'g') {
    return 'kg';
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

  // Priority 1: Check inventory.unit
  if (product.inventory?.unit) {
    return product.inventory.unit;
  }

  // Priority 2: Check quantityUnit (from Product Type)
  if (product.quantityUnit) {
    return product.quantityUnit;
  }

  // Priority 3: Extract from quantity field (e.g., "150ML" → "ML")
  if (product.quantity) {
    const quantityStr = String(product.quantity);
    const units = ['ML', 'kg', 'g', 'L', 'Nos'];
    for (const unit of units) {
      if (quantityStr.trim().endsWith(unit)) {
        return unit;
      }
    }
  }

  // Priority 4: Check unitOfMeasure
  if (product.unitOfMeasure) {
    return product.unitOfMeasure;
  }

  return null;
};

// Get allowed units for dropdown based on cafe stock entries, existing stock entries, or product unit
const getAllowedUnits = (productUnit, stockEntries = [], currentEntry = null, cafeStockData = null) => {
  // ✅ FIX: Priority 1 - Check Cafe Stock entries FIRST (what unit was used in Cafe Stock Management)
  // If cafe stock entries exist, use the unit from those entries to determine allowed units
  if (cafeStockData && cafeStockData.stockDetails && cafeStockData.stockDetails.length > 0) {
    console.log(`🔍 [getAllowedUnits] Checking cafe stock entries:`, {
      stockDetailsCount: cafeStockData.stockDetails.length,
      sampleEntry: cafeStockData.stockDetails[0],
      allUnits: cafeStockData.stockDetails.map(e => e.unit || e.displayData?.unit).filter(Boolean)
    });

    // Find the unit from cafe stock entries (prefer non-Nos units)
    let cafeUnit = null;

    // First, try to find any cafe entry with a non-Nos unit
    // Check both entry.unit and entry.displayData.unit
    const cafeEntryWithUnit = cafeStockData.stockDetails.find(cafeEntry => {
      const u = cafeEntry.unit || (cafeEntry.displayData && cafeEntry.displayData.unit);
      return u && String(u).trim().toLowerCase() !== 'nos';
    });

    if (cafeEntryWithUnit) {
      cafeUnit = cafeEntryWithUnit.unit || (cafeEntryWithUnit.displayData && cafeEntryWithUnit.displayData.unit);
    } else {
      // If all cafe entries are Nos, use Nos
      const anyCafeEntry = cafeStockData.stockDetails.find(cafeEntry => {
        return cafeEntry.unit || (cafeEntry.displayData && cafeEntry.displayData.unit);
      });
      if (anyCafeEntry) {
        cafeUnit = anyCafeEntry.unit || (anyCafeEntry.displayData && anyCafeEntry.displayData.unit);
      }
    }

    if (cafeUnit) {
      const unit = String(cafeUnit).trim().toLowerCase();

      // Apply same rules as Cafe Stock Management:
      // - If cafe stock unit is "Kg" or "g" → show "Kg, g, ML"
      if (unit === 'kg' || unit === 'g') {
        return ['kg'];
      }

      // - If cafe stock unit is "L" or "ML" → show "L, g, ML"
      if (unit === 'l' || unit === 'ml') {
        return ['L'];
      }

      // - If cafe stock unit is "Nos" → show "Nos" only
      if (unit === 'nos') {
        return ['Nos'];
      }
    }
  }

  // ✅ FIX: Priority 2 - Check existing stock entries (including current entry if editing)
  // If stock entries exist, use the unit from those entries
  const allEntries = currentEntry ? [...stockEntries, currentEntry] : stockEntries;

  if (allEntries && allEntries.length > 0) {
    // Find the unit from existing stock entries (prefer non-Nos units)
    let existingUnit = null;

    // First, try to find any entry with a non-Nos unit
    const entryWithUnit = allEntries.find(entry => {
      const entryUnit = entry.unit || (entry.displayData && entry.displayData.unit);
      return entryUnit && entryUnit.toLowerCase() !== 'nos';
    });

    if (entryWithUnit) {
      existingUnit = entryWithUnit.unit || (entryWithUnit.displayData && entryWithUnit.displayData.unit);
    } else {
      // If all entries are Nos, use Nos
      const anyEntry = allEntries.find(entry => {
        const entryUnit = entry.unit || (entry.displayData && entry.displayData.unit);
        return entryUnit;
      });
      if (anyEntry) {
        existingUnit = anyEntry.unit || (anyEntry.displayData && anyEntry.displayData.unit);
      }
    }

    if (existingUnit) {
      const unit = String(existingUnit).trim().toLowerCase();

      // Apply same rules as Cafe Stock Management for consistency:
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

  // ✅ FIX: Priority 3 - If no cafe stock and no stock entries, use product unit
  if (!productUnit) return ['Nos', 'kg', 'g', 'L', 'ML'];

  const unit = String(productUnit).trim().toLowerCase();

  // Apply same rules for consistency:
  // - If product unit is weight-based (kg, g), allow kg
  if (unit === 'kg' || unit === 'g') {
    return ['kg'];
  }

  // - If product unit is volume-based (L, ML), allow L
  if (unit === 'l' || unit === 'ml') {
    return ['L'];
  }

  // - If product unit is Nos, allow only Nos
  if (unit === 'nos') {
    return ['Nos'];
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
        <td className="transfer-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="stock-adjustment-cell">
          <div className="skeleton-line skeleton-small"></div>
        </td>
        <td className="balance-cell">
          <div className="skeleton-line skeleton-small"></div>
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
const StockTableRow = React.memo(({ entry, index, onDateClick, onEdit, onDelete, cafeStockData, productUnit }) => {
  const displayData = entry.displayData || {};
  const entryDateFormatted = useMemo(() => formatDate(entry.entryDate || entry.date), [entry.entryDate, entry.date]);

  // Extract values with fallbacks - same logic as edit modal
  const invordStock = displayData.invordStock ?? entry.stock ?? entry.invordStock ?? 0;
  const stockAdjustment = entry.stockAdjustment ?? displayData.stockAdjustment ?? 0;
  const balance = entry.balance ?? displayData.balance ?? 0;

  // ✅ Get display unit - use entry.unit (what was saved), not standardized unit
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

  // ✅ Convert values to display unit and track if conversion happened
  const convertedInvordStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    // Only convert if entry unit is ML or g (convert to kg)
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(invordStock, entryUnit), converted: true };
    }
    // If already kg or other unit, no conversion needed
    return { value: invordStock, converted: false };
  }, [invordStock, entryUnit]);

  const convertedStockAdjustment = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(stockAdjustment, entryUnit), converted: true };
    }
    return { value: stockAdjustment, converted: false };
  }, [stockAdjustment, entryUnit]);

  const convertedBalance = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(balance, entryUnit), converted: true };
    }
    return { value: balance, converted: false };
  }, [balance, entryUnit]);

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

  // Get transfer (cafe inward stock) for this date - prefer saved entry data, fallback to cafe stock data
  // Get transfer (cafe inward stock) for this date - prefer saved entry data, fallback to cafe stock data
  const cafeStockInfo = useMemo(() => {
    // Check cafe stock data first to determine type
    let cafeEntry = null;
    if (cafeStockData && cafeStockData.stockDetails) {
      const entryDate = new Date(entry.entryDate || entry.date);
      const entryDateStr = formatDateToLocal(entryDate);
      cafeEntry = cafeStockData.stockDetails.find(c => {
        const cDate = new Date(c.date);
        return formatDateToLocal(cDate) === entryDateStr;
      });
    }

    const info = getCafeStockInfo(cafeEntry);

    // If we have a saved transfer value in the entry, use that as the source of truth for 'transfer' amount
    // But we still use cafeEntry to know if there's a direct amount
    if (entry.transfer !== undefined && entry.transfer !== null) {
      return {
        ...info,
        transfer: entry.transfer, // Use saved value
        // Keep direct as calculated from cafe data (since it's not saved in theater stock)
      };
    }

    return info;
  }, [entry, cafeStockData]);

  // Compatibility: use transfer part for logic relying on 'transferStock'
  const transferStock = cafeStockInfo.transfer;
  const directStock = cafeStockInfo.direct;

  // ✅ Convert transfer stock if needed
  const convertedTransferStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(transferStock, entryUnit), converted: true };
    }
    return { value: transferStock, converted: false };
  }, [transferStock, entryUnit]);

  // ✅ Convert direct stock if needed
  const convertedDirectStock = useMemo(() => {
    const unit = entryUnit.toLowerCase();
    if (unit === 'ml' || unit === 'g') {
      return { value: convertToKg(directStock, entryUnit), converted: true };
    }
    return { value: directStock, converted: false };
  }, [directStock, entryUnit]);

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
      <td className="stock-cell">
        <div className="stock-badge added">
          <span className="stock-quantity">{formatValue(convertedInvordStock)} {displayUnit}</span>
          <span className="stock-label">Added</span>
        </div>
      </td>
      <td className="transfer-cell">
        {(convertedTransferStock.value > 0 || convertedDirectStock.value > 0) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {convertedTransferStock.value > 0 && (
              <div className="stock-badge added">
                <span className="stock-quantity">{formatValue(convertedTransferStock)} {displayUnit}</span>
                <span className="stock-label">Transfer</span>
              </div>
            )}
            {convertedDirectStock.value > 0 && (
              <div className="stock-badge in-stock" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                <span className="stock-quantity">{formatValue(convertedDirectStock)} {displayUnit}</span>
                <span className="stock-label">Direct Cafe</span>
              </div>
            )}
          </div>
        ) : (
          <span style={{ color: '#999', fontSize: '14px' }}>—</span>
        )}
      </td>
      <td className="stock-adjustment-cell">
        {convertedStockAdjustment.value !== 0 ? (
          <div className={`stock-badge ${convertedStockAdjustment.value > 0 ? 'added' : 'used-stock'}`}>
            <span className="stock-quantity">{convertedStockAdjustment.value > 0 ? '+' : ''}{formatValue(convertedStockAdjustment)} {displayUnit}</span>
            <span className="stock-label">{convertedStockAdjustment.value > 0 ? 'Adjustment' : 'Reduction'}</span>
          </div>
        ) : (
          <span style={{ color: '#999', fontSize: '14px' }}>—</span>
        )}
      </td>
      <td className="balance-cell">
        <div className="stock-badge balance-stock">
          <span className="stock-quantity">{formatValue(convertedBalance)} {displayUnit}</span>
          <span className="stock-label">Balance</span>
        </div>
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

  // Compare cafe stock data reference
  if (prevProps.cafeStockData !== nextProps.cafeStockData) {
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
const StockTableBody = React.memo(({ stockEntries, loading, filters, onDateClick, onEdit, onDelete, onAddStock, cafeStockData, productUnit }) => {
  // Memoize filtered entries to avoid re-filtering on every render
  // Only show invord entries (exclude carryforward entries with invordStock = 0)
  const addedEntries = useMemo(() => {
    return stockEntries.filter(entry => {
      // Must be ADDED type
      if (entry.type !== 'ADDED' && entry.type !== 'ADD') {
        return false;
      }

      // Get invordStock value from displayData or entry
      const displayData = entry.displayData || {};
      const invordStock = displayData.invordStock ?? entry.stock ?? entry.invordStock ?? entry.quantity ?? 0;

      // Only show entries with invordStock > 0 (exclude carryforward entries)
      return invordStock > 0;
    });
  }, [stockEntries]);

  // 🚀 INSTANT: Show skeleton only if loading AND no data
  if (loading && stockEntries.length === 0) {
    return <StockTableSkeleton count={filters.limit} />;
  }

  if (addedEntries.length === 0) {
    return (
      <tr>
        <td colSpan="7" className="no-data">
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
      {addedEntries.map((entry, index) => {
        // Ensure unique key - use _id if available, otherwise create a stable key
        const entryId = entry._id?.toString() || entry.date?.toString() || `entry-${index}`;
        return (
          <StockTableRow
            key={entryId}
            entry={entry}
            index={index}
            onDateClick={onDateClick}
            onEdit={onEdit}
            onDelete={onDelete}
            cafeStockData={cafeStockData}
            productUnit={productUnit}
          />
        );
      })}
    </>
  );
});

StockTableBody.displayName = 'StockTableBody';

// Stock entry row component - Using new displayData structure from backend
const StockEntryRow = React.memo(({ entry, index, onEdit, onDelete }) => {
  const globalIndex = index + 1;

  // Use displayData from backend (auto-calculated)
  const invordStock = entry.displayData?.invordStock || 0;
  const sales = entry.displayData?.sales || 0;
  const expiredStock = entry.displayData?.expiredStock || 0;
  const damageStock = entry.displayData?.damageStock || 0;
  const balance = entry.displayData?.balance || 0;

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

      {/* Invord Stock */}
      <td className="stock-cell">
        <div className="stock-badge in-stock">
          <span className="stock-quantity">{invordStock} {entry.unit || 'Nos'}</span>
          <span className="stock-status">Added</span>
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

      {/* Damage Stock */}
      <td className="damage-cell">
        <div className="stock-badge damage-stock">
          <span className="stock-quantity">{damageStock}</span>
          <span className="stock-status">Damage</span>
        </div>
      </td>

      {/* Balance */}
      <td className="balance-cell">
        <div className="stock-badge balance-stock">
          <span className="stock-quantity">{balance}</span>
          <span className="stock-status">Balance</span>
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
        <div className="stat-number">{summary?.currentStock || 0}</div>
        <div className="stat-label">CURRENT STOCK</div>
        <div className="stat-sub-label">Opening: {summary?.openingBalance || 0} | Closing: {summary?.closingBalance || 0}</div>
      </div>
      <div className="stat-card">
        <div className="stat-number">{summary?.totalStock || 0}</div>
        <div className="stat-label">TOTAL ADDED</div>
        <div className="stat-sub-label">This Month</div>
      </div>
      <div className="stat-card">
        <div className="stat-number">{summary?.totalExpired || 0}</div>
        <div className="stat-label">TOTAL EXPIRED</div>
        <div className="stat-sub-label">This Month</div>
      </div>
      <div className="stat-card">
        <div className="stat-number">{summary?.totalDamage || 0}</div>
        <div className="stat-label">TOTAL DAMAGED</div>
        <div className="stat-sub-label">This Month</div>
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
        const totalDamage = entries.reduce((sum, entry) => sum + (entry.damageStock || 0), 0);
        const totalExpired = entries.reduce((sum, entry) => sum + (entry.expired || 0), 0);

        return {
          ...group,
          openingBalance: firstEntry?.openingBalance || 0,
          closingBalance: lastEntry?.cumulativeBalance || 0,
          totalAdded,
          totalDamage,
          totalExpired,
          netChange: totalAdded - totalDamage - totalExpired,
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
                  {(month.totalDamage + month.totalExpired) > 0 && (
                    <span className="deducted">-{month.totalDamage + month.totalExpired}</span>
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
              <th>INVORD STOCK</th>
            </tr>
          </thead>
          <tbody>
            {monthlySummaries.map((summary) => {
              return (
                <tr key={`${summary.year}-${summary.month}`} className="monthly-summary-row">
                  <td className="stock-added-cell">
                    <span className="stock-value added">+{summary.totalInvordStock || 0}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="monthly-summary-totals">
                <td><strong>+{totals.totalInvordStock || 0}</strong></td>
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
const StockEntryModal = React.memo(({ isOpen, onClose, entry, onSave, isLoading, stockEntries = [], cafeStockData = null, productUnit = null }) => {

  // ✅ Get standardized unit and allowed units
  // ✅ FIX: Pass cafeStockData first, then stockEntries, then productUnit to getAllowedUnits
  // Priority: Cafe Stock entries > Stock Management entries > Product unit
  const standardizedUnit = useMemo(() => getStandardizedUnit(productUnit), [productUnit]);
  const allowedUnits = useMemo(() => {
    const units = getAllowedUnits(productUnit, stockEntries, entry, cafeStockData);
    console.log(`📋 [StockEntryModal] Final allowedUnits:`, {
      productUnit,
      hasCafeStockData: !!cafeStockData,
      cafeStockEntriesCount: cafeStockData?.stockDetails?.length || 0,
      stockEntriesCount: stockEntries?.length || 0,
      allowedUnits: units
    });
    return units;
  }, [productUnit, stockEntries, entry, cafeStockData]);

  // ✅ Default unit based on product unit
  // ✅ Default unit based on existing stock entries or product unit
  const defaultUnit = useMemo(() => {
    // ✅ FIX: Priority 0 - Check Cafe Stock entries FIRST (what unit was used in Cafe Stock Management)
    // If cafe stock entries exist, use the unit from those entries as default
    if (cafeStockData && cafeStockData.stockDetails && cafeStockData.stockDetails.length > 0) {
      // Find the unit from cafe stock entries (prefer non-Nos units)
      const cafeEntryWithUnit = cafeStockData.stockDetails.find(cafeEntry => {
        const u = cafeEntry.unit || (cafeEntry.displayData && cafeEntry.displayData.unit);
        return u && String(u).trim().toLowerCase() !== 'nos';
      }) || cafeStockData.stockDetails.find(cafeEntry => {
        return cafeEntry.unit || (cafeEntry.displayData && cafeEntry.displayData.unit);
      });

      if (cafeEntryWithUnit) {
        const cafeUnit = cafeEntryWithUnit.unit || (cafeEntryWithUnit.displayData && cafeEntryWithUnit.displayData.unit);
        if (cafeUnit) {
          const unit = String(cafeUnit).trim().toLowerCase();
          if (unit === 'kg' || unit === 'g') return 'kg';
          if (unit === 'l' || unit === 'ml') return 'L';
          if (unit === 'nos') return 'Nos';
          return cafeUnit;
        }
      }
    }

    // Priority 1: Check existing stock entries
    if (stockEntries && stockEntries.length > 0) {
      // Find the unit from existing stock entries (prefer non-Nos units)
      const entryWithUnit = stockEntries.find(entry => entry.unit && entry.unit.toLowerCase() !== 'nos') ||
        stockEntries.find(entry => entry.unit);
      if (entryWithUnit && entryWithUnit.unit) {
        const unit = entryWithUnit.unit.toLowerCase();
        if (unit === 'kg' || unit === 'ml' || unit === 'g') return 'kg';
        if (unit === 'l') return 'L';
        if (unit === 'nos') return 'Nos';
        return entryWithUnit.unit; // Return as-is for custom units
      }
    }

    // Priority 2: Use product unit if no stock entries
    if (!productUnit) return 'Nos';
    const unit = productUnit.toLowerCase();
    if (unit === 'kg' || unit === 'ml' || unit === 'g') return 'kg';
    if (unit === 'l') return 'L';
    return 'Nos';
  }, [productUnit, stockEntries, cafeStockData]);

  const [formData, setFormData] = useState({
    date: getTodayLocalDate(), // ✅ FIX: Use local date instead of UTC
    type: 'ADDED', // Always ADDED (Invord Stock)
    quantity: '',
    unit: defaultUnit,
    stockAdjustment: '',
    notes: '',
    batchNumber: '',
    transfer: 0
  });

  const [errors, setErrors] = useState({});

  // Calculate previous day balance (oldStock) for balance calculation
  const previousDayBalance = useMemo(() => {
    if (!formData.date) return 0;

    const entryDate = new Date(formData.date);
    entryDate.setHours(0, 0, 0, 0);

    // If editing, use the entry's oldStock
    if (entry && entry.oldStock !== undefined) {
      return entry.oldStock;
    }

    // If adding new entry, find the previous day's balance from stockEntries
    if (stockEntries && stockEntries.length > 0) {
      // Find entries before the selected date
      const previousEntries = stockEntries
        .filter(entry => {
          const entryDateObj = new Date(entry.date || entry.entryDate);
          entryDateObj.setHours(0, 0, 0, 0);
          return entryDateObj < entryDate;
        })
        .sort((a, b) => {
          const dateA = new Date(a.date || a.entryDate);
          const dateB = new Date(b.date || b.entryDate);
          return dateB - dateA; // Sort descending to get most recent first
        });

      if (previousEntries.length > 0) {
        // Get balance from the most recent entry before this date
        const previousEntry = previousEntries[0];
        return previousEntry.balance || previousEntry.oldStock || 0;
      }
    }

    // If no previous entries, check if entry has oldStock from monthly summary
    if (entry && entry.oldStock !== undefined) {
      return entry.oldStock;
    }

    return 0;
  }, [formData.date, entry, stockEntries]);

  // Get transfer value from cafe stock for the selected date
  const transferValue = useMemo(() => {
    if (!formData.date || !cafeStockData || !cafeStockData.stockDetails) return getCafeStockInfo(null);

    const entryDate = new Date(formData.date);
    const entryDateStr = formatDateToLocal(entryDate); // ✅ FIX: Use local date format

    // Find matching cafe stock entry by date
    const cafeEntry = cafeStockData.stockDetails.find(cafeEntry => {
      const cafeDate = new Date(cafeEntry.date);
      const cafeDateStr = formatDateToLocal(cafeDate); // ✅ FIX: Use local date format
      return cafeDateStr === entryDateStr;
    });

    return getCafeStockInfo(cafeEntry);
  }, [formData.date, cafeStockData]);

  // Calculate current balance based on form inputs (including transfer)
  // ✅ Note: Values are already in standardized unit (kg for weight-based), so no conversion needed here
  const calculatedBalance = useMemo(() => {
    const quantity = Number(formData.quantity) || 0;
    const stockAdjustment = Number(formData.stockAdjustment) || 0;
    // Use formData.transfer if edited, otherwise use transferValue.transfer (deductible part)
    // Only 'product' type inward is deductible
    const transfer = (formData.transfer !== undefined && formData.transfer !== null && formData.transfer !== '')
      ? Number(formData.transfer) || 0
      : (transferValue.transfer || 0);

    // Balance = oldStock + invordStock - transfer + stockAdjustment
    return Math.max(0, previousDayBalance + quantity - transfer + stockAdjustment);
  }, [previousDayBalance, formData.quantity, formData.stockAdjustment, formData.transfer, transferValue]);

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
        const dateStr = formatDateStringToLocal(existingDate);
        dateSet.add(dateStr);
      }
    });
    return dateSet;
  }, [stockEntries, entry]);

  useEffect(() => {
    if (isOpen) {
      if (entry) {
        // Edit mode - populate with entry data
        // Get transfer from entry or from cafe stock data
        const entryDate = entry.date ? formatDateStringToLocal(entry.date) : getTodayLocalDate(); // ✅ FIX: Use local date format
        let transfer = entry.transfer || 0;

        // If transfer not in entry, try to get from cafe stock data
        if (!transfer && cafeStockData && cafeStockData.stockDetails) {
          const cafeEntry = cafeStockData.stockDetails.find(cafeEntry => {
            const cafeDate = new Date(cafeEntry.date);
            const cafeDateStr = formatDateToLocal(cafeDate); // ✅ FIX: Use local date format
            return cafeDateStr === entryDate;
          });

          if (cafeEntry) {
            // For initial populate, only use 'transfer' part (deductible)
            const info = getCafeStockInfo(cafeEntry);
            transfer = info.transfer;
          }
        }

        // ✅ Load entry values - only convert if entry unit is ML or g (to kg)
        const entryUnit = entry.unit || 'Nos';
        let convertedQuantity = entry.quantity || 0;
        let convertedStockAdjustment = entry.stockAdjustment || 0;
        let convertedTransfer = transfer;
        let displayUnit = entryUnit;

        // Only convert if entry unit is ML or g (convert to kg for display)
        const unitLower = entryUnit.toLowerCase();
        if (unitLower === 'ml' || unitLower === 'g') {
          convertedQuantity = convertToKg(convertedQuantity, entryUnit);
          convertedStockAdjustment = convertToKg(convertedStockAdjustment, entryUnit);
          convertedTransfer = convertToKg(convertedTransfer, entryUnit);
          displayUnit = 'kg'; // Display as kg
        } else if (unitLower === 'kg') {
          // Already kg, no conversion needed
          displayUnit = 'kg';
        } else {
          // L, Nos, or other - keep as-is
          displayUnit = entryUnit;
        }

        setFormData({
          date: entryDate,
          type: 'ADDED', // Always ADDED
          quantity: convertedQuantity.toString(),
          unit: displayUnit, // Use the display unit (kg if converted, or original unit)
          stockAdjustment: convertedStockAdjustment.toString(),
          notes: entry.notes || '',
          batchNumber: entry.batchNumber || '',
          transfer: convertedTransfer
        });
      } else {
        // Add mode - defaults (Always ADDED)
        // Set date to today (minimum allowed date) - use local date to avoid timezone issues
        const today = getTodayLocalDate(); // ✅ FIX: Use local date
        setFormData({
          date: today,
          type: 'ADDED', // Always ADDED (Invord Stock)
          quantity: '',
          unit: defaultUnit, // Use default unit based on product
          stockAdjustment: '',
          notes: '',
          batchNumber: '',
          transfer: 0
        });
      }
      setErrors({});
    }
  }, [isOpen, entry, cafeStockData]);

  // Update transfer when date changes
  useEffect(() => {
    if (isOpen && formData.date && cafeStockData && cafeStockData.stockDetails) {
      const entryDateStr = formData.date; // formData.date is already in YYYY-MM-DD format
      const cafeEntry = cafeStockData.stockDetails.find(cafeEntry => {
        const cafeDate = new Date(cafeEntry.date);
        const cafeDateStr = formatDateToLocal(cafeDate); // ✅ FIX: Use local date format
        return cafeDateStr === entryDateStr;
      });
      const transfer = cafeEntry?.invordStock || cafeEntry?.quantity || 0;

      // Only update if transfer value has changed
      if (formData.transfer !== transfer) {
        const transferAmount = getCafeStockInfo(cafeEntry).transfer; // Only get deductible transfer amount
        if (formData.transfer !== transferAmount) {
          setFormData(prev => ({ ...prev, transfer: transferAmount }));
        }
      }
    }
  }, [formData.date, cafeStockData, isOpen]);

  const handleInputChange = useCallback((field, value) => {
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

        // Update transfer value when date changes
        if (cafeStockData && cafeStockData.stockDetails) {
          const entryDateStr = value; // value is already in YYYY-MM-DD format
          const cafeEntry = cafeStockData.stockDetails.find(cafeEntry => {
            const cafeDate = new Date(cafeEntry.date);
            const cafeDateStr = formatDateToLocal(cafeDate); // ✅ FIX: Use local date format
            return cafeDateStr === entryDateStr;
          });
          const transfer = getCafeStockInfo(cafeEntry).transfer;
          updated.transfer = transfer;
        }
      }

      return updated;
    });

    if (errors[field] && field !== 'date') {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors, existingDatesSet, entry, cafeStockData]);

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

      // Check if date already exists using memoized Set (O(1) lookup)
      const newDateStr = formData.date; // formData.date is already in YYYY-MM-DD format
      const dateExists = existingDatesSet.has(newDateStr);

      if (dateExists) {
        newErrors.date = 'This date already exists. Please select a different date.';
      }
    }

    // Type is always ADDED, no need to validate

    if (!formData.quantity || isNaN(Number(formData.quantity)) || Number(formData.quantity) <= 0) {
      newErrors.quantity = 'Valid quantity is required (must be greater than 0)';
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
      // For edit mode: use formData.transfer if user edited it, otherwise preserve existing transfer
      // For add mode: use transferValue from cafe stock
      let transferToSave;
      if (entry) {
        // Edit mode: use formData.transfer if provided, otherwise keep existing value
        if (formData.transfer !== undefined && formData.transfer !== null && formData.transfer !== '') {
          transferToSave = Number(formData.transfer) || 0;
        } else {
          // Preserve existing transfer value from entry
          transferToSave = entry.transfer || 0;
        }
      } else {
        // Add mode: use transferValue.transfer from cafe stock
        transferToSave = transferValue.transfer || 0;
      }

      // ✅ Convert values to standardized unit before saving
      let quantityToSave = Number(formData.quantity) || 0;
      let stockAdjustmentToSave = formData.stockAdjustment ? Number(formData.stockAdjustment) : 0;
      let transferToSaveConverted = transferToSave;
      let unitToSave = formData.unit || defaultUnit;

      // ✅ Convert ML/g to kg for weight-based products, but preserve kg/L/Nos as-is
      const unitLower = unitToSave.toLowerCase();
      if (standardizedUnit === 'kg' && (unitLower === 'ml' || unitLower === 'g')) {
        // Convert ML or g to kg
        quantityToSave = convertToKg(quantityToSave, unitToSave);
        stockAdjustmentToSave = convertToKg(stockAdjustmentToSave, unitToSave);
        transferToSaveConverted = convertToKg(transferToSaveConverted, unitToSave);
        unitToSave = 'kg'; // Save as kg
      } else if (unitLower === 'kg') {
        // If user selected kg, keep it as kg (no conversion needed)
        unitToSave = 'kg';
      } else if (unitLower === 'l') {
        // If user selected L, keep it as L
        unitToSave = 'L';
      } else {
        // Nos or other units - keep as-is
        unitToSave = unitToSave;
      }

      const processedData = {
        date: formData.date,
        type: 'ADDED', // Always Invord Stock
        quantity: quantityToSave,
        unit: unitToSave, // Use standardized unit
        stockAdjustment: stockAdjustmentToSave,
        transfer: transferToSaveConverted, // Restore transfer saving (deductible only)
        notes: formData.notes || undefined,
        batchNumber: formData.batchNumber || undefined
      };

      onSave(processedData);

      // Don't close here - let parent handle closing after successful save
    } else {
    }
  }, [formData, validateForm, onSave, errors, transferValue, entry, standardizedUnit, defaultUnit]);

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
              />
              {errors.date && <span className="error-text">{errors.date}</span>}
            </div>

            {/* Entry Type is hidden - always "Invord Stock" (ADDED) */}
            <input type="hidden" value="ADDED" />

            {/* Quantity Input */}
            <div className="form-group">
              <label className="required">Stock Quantity *</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  className={`form-control ${errors.quantity ? 'error' : ''}`}
                  placeholder="Enter stock quantity"
                  style={{
                    width: '100%',
                    paddingRight: '90px' // Make space for the unit selector
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
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: '0 30px 0 12px',
                      height: '100%',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      color: '#475569',
                      cursor: 'pointer',
                      outline: 'none',
                      appearance: 'none', // Remove default arrow to use custom styling or just keep simple
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
              {errors.quantity && <span className="error-text">{errors.quantity}</span>}
            </div>

            {/* Transfer Display - Only show in Edit mode, read-only */}
            {/* Transfer Display - Only show in Edit mode, read-only */}
            {/* Show Deductible Transfer (from Product) */}
            {entry && (
              <div className="form-group">
                <label>Transfer (Deducted from Balance)</label>
                <input
                  type="number"
                  value={formData.transfer !== undefined ? formData.transfer : (transferValue.transfer || 0)}
                  readOnly
                  className="form-control"
                  style={{
                    backgroundColor: '#fff1f2',
                    borderColor: '#fecdd3',
                    cursor: 'not-allowed'
                  }}
                />
                <small className="form-help-text" style={{ color: '#9f1239' }}>
                  Stock transferred from here to Cafe. Value is subtracted from balance.
                </small>
              </div>
            )}

            {/* Show Direct Cafe Stock (Non-deductible) - Informational only */}
            {entry && transferValue.direct > 0 && (
              <div className="form-group">
                <label>Cafe Stock (Direct Entry)</label>
                <input
                  type="number"
                  value={transferValue.direct}
                  readOnly
                  className="form-control"
                  style={{
                    backgroundColor: '#f0fdf4',
                    borderColor: '#bbf7d0',
                    cursor: 'not-allowed',
                    color: '#166534'
                  }}
                />
                <small className="form-help-text" style={{ color: '#15803d' }}>
                  Stock added directly in Cafe. Not subtracted from this balance.
                </small>
              </div>
            )}

            {/* Stock Adjustment Input - Only show in Edit mode */}
            {entry && (
              <div className="form-group">
                <label>Stock Adjustment (Optional)</label>
                <input
                  type="number"
                  value={formData.stockAdjustment}
                  onChange={(e) => handleInputChange('stockAdjustment', e.target.value)}
                  className="form-control"
                  placeholder="Enter adjustment value (positive or negative)"
                />
                <small className="form-help-text">
                  Use positive values to add stock or negative values to reduce stock. Useful for corrections or adjustments.
                </small>
              </div>
            )}

            {/* Calculated Balance Display - Only show in Edit mode */}
            {entry && (
              <div className="form-group">
                <label>Calculated Balance</label>
                <input
                  type="number"
                  value={calculatedBalance}
                  readOnly
                  className="form-control"
                  style={{
                    backgroundColor: '#f5f5f5',
                    cursor: 'not-allowed',
                    fontWeight: '600',
                    color: '#333'
                  }}
                />
                <small className="form-help-text">
                  Previous Balance ({previousDayBalance}) + Quantity ({Number(formData.quantity) || 0}) + Adjustment ({Number(formData.stockAdjustment) || 0}) = {calculatedBalance}
                </small>
              </div>
            )}

            {/* Batch Number Input */}
            <div className="form-group">
              <label>Batch Number (Optional)</label>
              <input
                type="text"
                value={formData.batchNumber}
                onChange={(e) => handleInputChange('batchNumber', e.target.value)}
                className="form-control"
                placeholder="Enter batch number"
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
const StockManagement = React.memo(() => {

  const { theaterId, productId } = useParams();

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
  const modal = useModal();
  const toast = useToast();
  const { user, isAuthenticated } = useAuth();
  const performanceMetrics = usePerformanceMonitoring('StockManagement');

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
      const cacheKey = `stock_${theaterId}_${productId}_all`;
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
    totalStockAdjustment: 0,
    currentStock: 0
  });
  const [monthlySummaries, setMonthlySummaries] = useState(initialCachedStock?.monthlySummaries || []);
  const [monthlySummariesTotals, setMonthlySummariesTotals] = useState(initialCachedStock?.monthlySummariesTotals || null);
  const [loading, setLoading] = useState(!initialCachedStock); // 🚀 Start false if cache exists
  const [error, setError] = useState(null);
  const [hasData, setHasData] = useState(!!initialCachedStock); // 🚀 Track if we have any data to show
  // Cafe stock data for transfer column
  const [cafeStockData, setCafeStockData] = useState(null);

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
  // Removed successModal state - using toast notifications in top right corner instead
  const [errorModal, setErrorModal] = useState({ show: false, message: '' });

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
  const deletedEntryIdsRef = useRef(new Set()); // Track deleted entry IDs to filter them out

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

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.product) {
          setProduct(data.product);
        }
      }
    } catch (error) {
      console.warn('Failed to fetch product:', error);
      // Don't block page load if product fetch fails
    }
  }, [theaterId, productId, getAuthToken]);

  // ✅ Fetch cafe stock data ONLY for transfer column display (showing how much was transferred to cafe)
  // This is NOT used for balance calculations - all calculations use THEATER STOCK (MonthlyStock) only
  const fetchCafeStockData = useCallback(async () => {
    if (!theaterId || !productId) return;

    try {
      const authToken = getAuthToken();
      if (!authToken) return;

      // Get current date filter parameters
      let year = new Date().getFullYear();
      let month = new Date().getMonth() + 1;

      if (dateFilter.type === 'date' && dateFilter.selectedDate) {
        const filterDate = new Date(dateFilter.selectedDate);
        year = filterDate.getFullYear();
        month = filterDate.getMonth() + 1;
      } else if (dateFilter.type === 'month') {
        year = dateFilter.year;
        month = dateFilter.month;
      } else if (dateFilter.type === 'year') {
        year = dateFilter.year;
      }

      const url = `${API_BASE_URL}/cafe-stock/${theaterId}/${productId}?${new URLSearchParams({
        year: year,
        month: month
      }).toString()}`;

      const response = await unifiedFetch(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          console.log(`📦 [StockManagement] Cafe stock data fetched:`, {
            hasStockDetails: !!data.data.stockDetails,
            stockDetailsCount: data.data.stockDetails?.length || 0,
            sampleEntry: data.data.stockDetails?.[0],
            allUnits: data.data.stockDetails?.map(e => e.unit).filter(Boolean)
          });
          setCafeStockData(data.data);
        }
      }
    } catch (error) {
      console.warn('Failed to fetch cafe stock data:', error);
      // Don't block page load if cafe stock fetch fails
      setCafeStockData(null);
    }
  }, [theaterId, productId, dateFilter, getAuthToken]);

  // 🚀 100% API FUNCTIONS WITH COMPREHENSIVE DEBUGGING
  const fetchStockData = useCallback(async () => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // 🚀 INSTANT: Only set loading if no cached data exists
      if (!initialCachedStock || stockEntries.length === 0) {
        setLoading(true);
      }
      setError(null);

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

      // Use the new API service with MVC response handling
      const result = await apiService.getStock(theaterId, { ...params, productId });

      // 🔥 FIX: Backend returns MVC response with data containing monthlyDoc + product
      // Response structure: { success: true, data: { stockDetails: [], product: {}, ... } }

      // Extract from MVC response - result is already parsed by apiService
      const monthlyDoc = result || {};
      const entries = monthlyDoc.stockDetails || [];
      const product = monthlyDoc.product || null;

      // ✅ FIX: Calculate summary from monthlyDoc fields (THEATER STOCK - MonthlyStock)
      // This is theater stock management, so we ONLY use theater stock values from MonthlyStock
      // DO NOT use cafe stock values (CafeMonthlyStock) here
      const summary = {
        currentStock: monthlyDoc.closingBalance || 0, // Theater stock closing balance
        totalStock: monthlyDoc.totalInvordStock || 0, // Theater stock total added
        totalSales: monthlyDoc.totalSales || 0, // Theater stock sales
        totalExpired: monthlyDoc.totalExpiredStock || 0, // Theater stock expired
        totalDamage: monthlyDoc.totalDamageStock || 0, // Theater stock damage
        openingBalance: monthlyDoc.openingBalance || 0, // Theater stock opening balance
        closingBalance: monthlyDoc.closingBalance || 0, // Theater stock closing balance
        totalTransfer: monthlyDoc.totalTransfer || 0, // Theater stock transferred to cafe
        totalStockAdjustment: monthlyDoc.totalStockAdjustment || 0 // Theater stock adjustments
      };

      const responseData = {
        success: true,
        data: {
          entries: entries,
          product: product,
          summary: summary,
          monthlySummaries: [],
          currentStock: summary.currentStock,
          statistics: summary
        },
        pagination: {}
      };

      // Debug logging to help identify issues
      console.log('📊 Processed response:', {
        entriesCount: entries.length,
        product: product?.name || 'null',
        summary: summary
      });

      if (responseData.success) {
        // NEW BACKEND STRUCTURE: Extract entries, currentStock, statistics, period
        const {
          entries,
          currentStock,
          statistics
        } = responseData.data || {};

        // Optimized sorting - only sort if entries exist and is array
        let sortedEntries = [];
        if (entries && Array.isArray(entries) && entries.length > 0) {
          // Use faster comparison for MongoDB _id strings
          sortedEntries = entries.slice().sort((a, b) => {
            const idA = a._id || '';
            const idB = b._id || '';
            // Direct string comparison is faster than localeCompare for IDs
            if (idA < idB) return -1;
            if (idA > idB) return 1;
            return 0;
          });
        }

        // ✅ FIX: Build summary object from new statistics structure (THEATER STOCK ONLY)
        // This is theater stock management, so we ONLY use theater stock values from MonthlyStock
        // DO NOT use cafe stock values (CafeMonthlyStock) here
        const finalSummary = {
          currentStock: currentStock || 0, // Theater stock current stock
          totalStock: statistics?.totalAdded || statistics?.totalInvordStock || 0, // Theater stock total added
          totalSales: statistics?.totalSold || statistics?.totalSales || 0, // Theater stock sales
          totalExpired: statistics?.totalExpired || statistics?.totalExpiredStock || 0, // Theater stock expired
          expiredStock: statistics?.expiredStock || 0, // Theater stock expired (old stock)
          totalDamage: statistics?.totalDamaged || statistics?.totalDamageStock || 0, // Theater stock damage
          openingBalance: statistics?.openingBalance || 0, // Theater stock opening balance
          closingBalance: statistics?.closingBalance || 0, // Theater stock closing balance
          totalTransfer: statistics?.totalTransfer || monthlyDoc?.totalTransfer || 0, // Theater stock transferred to cafe
          totalStockAdjustment: statistics?.totalStockAdjustment || monthlyDoc?.totalStockAdjustment || 0 // Theater stock adjustments
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

        // Filter out any deleted entries (in case refresh happens before backend fully processes delete)
        const filteredEntries = sortedEntries.filter(entry => {
          const entryId = entry._id?.toString ? entry._id.toString() : String(entry._id || '');
          const isDeleted = deletedEntryIdsRef.current.has(entryId);
          if (isDeleted) {
          }
          return !isDeleted;
        });

        if (filteredEntries.length !== sortedEntries.length) {
        }

        // Batch all state updates together using React 18 automatic batching
        // Update data state first, then set loading to false
        setStockEntries(filteredEntries);
        setSummary(finalSummary);
        setPagination(finalPagination);
        setMonthlySummaries([]);
        setMonthlySummariesTotals(null);
        setHasData(filteredEntries.length > 0);

        // 🔥 UPDATE PRODUCT STATE from API response (product from monthlyDoc)
        if (product) {
          setProduct(product);
        }

        // 🚀 INSTANT: Cache the data for instant loading next time
        const cacheKey = `stock_${theaterId}_${productId}_all`;
        setCachedData(cacheKey, {
          entries: filteredEntries,
          summary: finalSummary,
          monthlySummaries: [],
          monthlySummariesTotals: null,
          product: product, // Use product from API response, not state
          timestamp: Date.now()
        });

        // Set loading to false immediately after data is ready
        setLoading(false);
        setInitialLoadDone(true);

      } else {
        setLoading(false);
        throw new Error(responseData.message || 'Failed to fetch stock data');
      }
    } catch (error) {
      // Ensure loading is always set to false on error
      setLoading(false);
      // Silently handle AbortError - it's expected when requests are cancelled
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        return; // Don't show error for aborted requests
      }

      let errorMessage = 'Failed to load stock data';

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
  }, [theaterId, productId, filters, dateFilter, getAuthToken, fetchCafeStockData]); // Optimized dependencies

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

  // Fetch cafe stock data when date filter changes
  useEffect(() => {
    if (theaterId && productId && fetchCafeStockData) {
      fetchCafeStockData();
    }
  }, [theaterId, productId, dateFilter, fetchCafeStockData]);

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
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && theaterId && productId) {
        // Check if cache was cleared (no cache = likely a stock entry was added/updated/deleted)
        const cacheKey = `stock_${theaterId}_${productId}_all`;
        const cached = getCachedData(cacheKey, 60000);

        // If no cache and we have stock entries, refresh to get new data
        if (!cached && stockEntries.length > 0 && fetchStockDataRef.current) {
          fetchStockDataRef.current();
        }
      }
    };

    const handleFocus = () => {
      if (theaterId && productId) {
        // Check if cache was cleared
        const cacheKey = `stock_${theaterId}_${productId}_all`;
        const cached = getCachedData(cacheKey, 60000);

        // If no cache, refresh to get new data
        if (!cached && stockEntries.length > 0 && fetchStockDataRef.current) {
          fetchStockDataRef.current();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [theaterId, productId, stockEntries.length]);

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
        totalStockAdjustment: 0,
        totalTransfer: 0,
        closingBalance: 0
      };
    }

    // Calculate totals from the entries
    let totalOldStock = 0;
    let totalInvordStock = 0;
    let totalSales = 0;
    let totalExpired = 0;
    let totalExpiredStock = 0;
    let totalDamage = 0;
    let totalStockAdjustment = 0;
    let totalTransfer = 0;

    monthEntries.forEach(entry => {
      const displayData = entry.displayData || {};
      const oldStock = displayData.oldStock ?? entry.oldStock ?? 0;
      const invordStock = displayData.invordStock ?? entry.stock ?? entry.invordStock ?? 0;
      const sales = displayData.sales ?? entry.sales ?? 0;
      const expiredStock = displayData.expiredStock ?? entry.expiredStock ?? calculateExpiredStock(entry);
      const damageStock = displayData.damageStock ?? entry.damageStock ?? 0;
      const stockAdjustment = entry.stockAdjustment ?? displayData.stockAdjustment ?? 0;
      const transfer = entry.transfer ?? 0;

      // Opening balance is the first entry's old stock
      if (monthEntries.indexOf(entry) === 0) {
        totalOldStock = oldStock;
      }

      totalInvordStock += invordStock;
      totalSales += sales;
      totalDamage += damageStock;
      totalStockAdjustment += stockAdjustment;
      totalTransfer += transfer;

      // Calculate expired stock for this entry
      if (expiredStock > 0) {
        totalExpired += expiredStock;
        // Check if it's from a previous month (expired stock)
        const entryDate = new Date(entry.entryDate || entry.date);
        const currentDate = new Date();
        if (entryDate < new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)) {
          totalExpiredStock += expiredStock;
        } else {
          totalExpired += expiredStock;
        }
      }
    });

    // Calculate closing balance (current balance stock) - includes stock adjustment and transfer
    // TRANSFER is subtracted (stock transferred out to cafe)
    const closingBalance = Math.max(0,
      totalOldStock + totalInvordStock - totalTransfer - totalSales - totalExpired - totalDamage - totalExpiredStock + totalStockAdjustment
    );

    return {
      openingBalance: totalOldStock,
      totalStock: totalInvordStock,
      totalSales: totalSales,
      totalExpired: totalExpired,
      expiredStock: totalExpiredStock,
      totalDamage: totalDamage,
      totalStockAdjustment: totalStockAdjustment,
      totalTransfer: totalTransfer,
      closingBalance: closingBalance,
      balanceStock: closingBalance // Add balanceStock for easy access
    };
  }, [stockEntries, dateFilter.type, dateFilter.year, dateFilter.month, dateFilter.selectedDate]);

  // Merge API summary with calculated summary (calculated takes precedence)
  // ✅ Get unit from stock entries or product for summary display
  const summaryUnit = useMemo(() => {
    // Priority 1: Get unit from first stock entry (most reliable)
    if (stockEntries && stockEntries.length > 0) {
      const firstEntry = stockEntries[0];
      const entryUnit = firstEntry.unit;
      if (entryUnit) {
        const unit = entryUnit.toLowerCase();
        // If weight-based, return kg; otherwise return the unit
        if (unit === 'kg' || unit === 'ml' || unit === 'g') {
          return 'kg';
        }
        return entryUnit;
      }
    }

    // Priority 2: Get unit from product
    if (product) {
      const productUnitValue = getProductUnit(product);
      if (productUnitValue) {
        const standardized = getStandardizedUnit(productUnitValue);
        return standardized;
      }
    }

    // Default: Nos
    return 'Nos';
  }, [stockEntries, product]);

  // ✅ Format summary value: show integers when possible
  const formatSummaryValue = useCallback((value) => {
    const numValue = Number(value) || 0;
    return Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(3).replace(/\.?0+$/, '');
  }, []);

  const displaySummary = useMemo(() => {
    // If we have calculated summary and it has data, use it
    if (calculatedMonthSummary && (
      calculatedMonthSummary.totalStock > 0 ||
      calculatedMonthSummary.totalSales > 0 ||
      calculatedMonthSummary.openingBalance > 0
    )) {
      // Calculate balance stock: Opening + Added - Transfer - Sales - Expired - Damage - Expired Stock + Stock Adjustment
      // TRANSFER is subtracted (stock transferred out to cafe)
      const balanceStock = Math.max(0,
        (calculatedMonthSummary.openingBalance || 0) +
        (calculatedMonthSummary.totalStock || 0) -
        (calculatedMonthSummary.totalTransfer || 0) -
        (calculatedMonthSummary.totalSales || 0) -
        (calculatedMonthSummary.totalExpired || 0) -
        (calculatedMonthSummary.totalDamage || 0) -
        (calculatedMonthSummary.expiredStock || 0) +
        (calculatedMonthSummary.totalStockAdjustment || 0)
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
        totalStockAdjustment: calculatedMonthSummary.totalStockAdjustment || 0,
        balanceStock: balanceStock,
        closingBalance: balanceStock
      };
    }

    // Otherwise calculate from API summary
    // TRANSFER is subtracted (stock transferred out to cafe)
    const balanceStock = Math.max(0,
      (summary.openingBalance || 0) +
      (summary.totalStock || 0) -
      (summary.totalTransfer || 0) -
      (summary.totalSales || 0) -
      (summary.totalExpired || 0) -
      (summary.totalDamage || 0) -
      (summary.expiredStock || 0) +
      (summary.totalStockAdjustment || 0)
    );

    return {
      ...summary,
      totalStockAdjustment: summary.totalStockAdjustment || 0,
      balanceStock: balanceStock,
      closingBalance: balanceStock
    };
  }, [summary, calculatedMonthSummary]);

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
        `${API_BASE_URL}/theater-stock/excel/${theaterId}/${productId}?year=${dateFilter.year}&month=${dateFilter.month}`,
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

      // Validate entry data - NEW FORMAT
      if (!entryData.type || !entryData.quantity) {
        throw new Error('Entry type and quantity are required');
      }

      if (entryData.quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      const authToken = getAuthToken();

      if (!authToken) {
        throw new Error('No authentication token found. Please refresh the page and try again.');
      }

      let response;
      let url;

      if (editingEntry) {
        // Update existing entry
        url = `${API_BASE_URL}/theater-stock/${theaterId}/${productId}/${editingEntry._id}`;

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
        url = `${API_BASE_URL}/theater-stock/${theaterId}/${productId}`;

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
        // This ensures the table reflects changes instantly just like the stat card
        setStockEntries(prevEntries => {
          if (isUpdate && savedEntryId) {
            // Update existing entry in the list
            return prevEntries.map(entry => {
              if (entry._id === savedEntryId) {
                return {
                  ...entry,
                  date: entryData.date,
                  entryDate: entryData.date,
                  stock: entryData.quantity,
                  invordStock: entryData.quantity,
                  quantity: entryData.quantity,
                  unit: entryData.unit, // ✅ ADDED: Ensure unit is updated
                  stockAdjustment: entryData.stockAdjustment || 0,
                  type: 'ADDED',
                  notes: entryData.notes || '',
                  batchNumber: entryData.batchNumber || '',
                  displayData: {
                    ...entry.displayData,
                    invordStock: entryData.quantity,
                    unit: entryData.unit // ✅ ADDED: Ensure unit is in displayData too
                  }
                };
              }
              return entry;
            });
          } else {
            // Add new entry to the list with a temporary ID
            const newEntry = {
              _id: data.entry?._id || `temp_${Date.now()}`,
              date: entryData.date,
              entryDate: entryData.date,
              stock: entryData.quantity,
              invordStock: entryData.quantity,
              quantity: entryData.quantity,
              unit: entryData.unit, // ✅ ADDED: Ensure unit is added
              stockAdjustment: entryData.stockAdjustment || 0,
              type: 'ADDED',
              notes: entryData.notes || '',
              batchNumber: entryData.batchNumber || '',
              displayData: {
                invordStock: entryData.quantity,
                unit: entryData.unit // ✅ ADDED: Ensure unit is in displayData
              }
            };
            // Sort by _id to maintain order
            const updatedEntries = [...prevEntries, newEntry];
            return updatedEntries.sort((a, b) => {
              const idA = a._id || '';
              const idB = b._id || '';
              if (idA < idB) return -1;
              if (idA > idB) return 1;
              return 0;
            });
          }
        });

        // 🚀 OPTIMISTIC UPDATE: Update summary immediately for stat card
        setSummary(prevSummary => {
          const quantityDiff = isUpdate
            ? entryData.quantity - (editingEntry?.stock || editingEntry?.quantity || 0)
            : entryData.quantity;
          return {
            ...prevSummary,
            totalStock: (prevSummary.totalStock || 0) + quantityDiff
          };
        });

        // Close modal and reset state IMMEDIATELY
        setShowStockModal(false);
        setEditingEntry(null);

        // Show success toast in top right corner
        toast.success(isUpdate ? 'Stock entry updated successfully!' : 'Stock entry added successfully!');

        // 🚀 CACHE INVALIDATION: Clear stock cache AND product cache so both pages show updated values immediately
        try {
          // Clear all stock caches for this theater and product
          clearCachePattern(`stock_${theaterId}_${productId}`);
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

        // Refresh data in background to sync with server - don't await, let it run in background
        // The optimistic update already shows the changes immediately
        try {
          if (fetchStockDataRef.current) {
            fetchStockDataRef.current().catch(error => {
              // Silently handle abort errors during refresh after save
              if (error.name !== 'AbortError' && !error.message?.includes('aborted')) {
                console.error('❌ Error refreshing data after save:', error);
              }
            });
          } else {
            console.error('❌ fetchStockDataRef.current is not defined!');
          }
        } catch (error) {
          console.error('❌ Error initiating data refresh:', error);
        }
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

      const url = `${API_BASE_URL}/theater-stock/${theaterId}/${productId}/${deletedEntryId}?year=${year}&month=${month}`;

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

      // Success - show toast
      try {
        // Clear all stock caches for this theater and product (multiple formats)
        clearCachePattern(`stock_${theaterId}_${productId}`);
        clearCachePattern(`stock_${theaterId}_${productId}_all`);
        // Clear API service cache for stock endpoint
        clearCachePattern(`api__theater_stock_${theaterId}_${productId}`);
        clearCachePattern(`api__theater_stock_${theaterId}`);
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
      toast.success('Stock entry deleted successfully!');

      // ✅ FIX: Skip immediate refresh to avoid stale data - optimistic update already removed entry
      // The entry is already filtered out from UI, and will be excluded from future refreshes
      // Only refresh after a delay to sync with server, but keep the filter active
      setTimeout(async () => {
        if (fetchStockDataRef.current) {
          try {
            // Clear cache one more time right before refresh to ensure no stale data
            clearCachePattern(`stock_${theaterId}_${productId}`);
            clearCachePattern(`api__theater_stock_${theaterId}_${productId}`);

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
      toast.error(error.message || 'Failed to delete stock entry');
    }
  }, [deleteModal.entry, modal, theaterId, productId, fetchStockData, getAuthToken]);
  const HeaderButton = React.memo(() => (
    <button
      type="button"
      className="header-btn"
      onClick={() => navigate(`/theater-products/${theaterId}`)}
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

  // Error state
  if (error) {
    return (
      <ErrorBoundary>
        <TheaterLayout pageTitle="Stock Management">
          <PageContainer
            title={product ? `${product.name} - Stock Management` : 'Stock Management'}
            subtitle="Error Loading Data"
            onBack={() => navigate(`/theater-products/${theaterId}`)}
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
              cafeStockData={cafeStockData}
              productUnit={getProductUnit(product)}
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
      <TheaterLayout pageTitle="Stock Management">
        <PageContainer
          hasHeader={false}
          className="stock-management-page"
        >
          {/* Global Vertical Header Component */}
          <VerticalPageHeader
            title={product?.name ? `${product.name}` : 'Stock Management'}
            subtitle={product?.name ? null : 'Loading product...'}
            backButtonText="Back to Product List"
            customBackAction={() => navigate(`/theater-products/${theaterId}`)}
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

                  fetch('http://localhost:5000/api/theater-stock/68d37ea676752b839952af81/68ea8d3e2b184ed51d53329d?year=2025&month=10', {
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
              {/* Previous Month Carry Forward */}
              <div className="stat-card stat-card-carryforward">
                <div className="stat-number stat-number-carryforward">{formatSummaryValue(displaySummary.openingBalance || 0)} {summaryUnit}</div>
                <div className="stat-label stat-label-carryforward">Previous Month Carry Forward</div>
                <div className="stat-sublabel stat-sublabel-carryforward">
                  Opening Balance
                </div>
              </div>

              {/* Total Added (Current Month) */}
              <div className="stat-card">
                <div className="stat-number">{formatSummaryValue(displaySummary.totalStock || 0)} {summaryUnit}</div>
                <div className="stat-label">Total Added</div>
                <div className="stat-sublabel">
                  Invord Stock
                </div>
              </div>

              {/* Stock Adjustment (Current Month) */}
              <div className="stat-card">
                <div className="stat-number">{formatSummaryValue(displaySummary.totalStockAdjustment || 0)} {summaryUnit}</div>
                <div className="stat-label">Stock Adjustment</div>
                <div className="stat-sublabel">
                  This Month
                </div>
              </div>

              {/* Balance (Current Month) */}
              <div className="stat-card">
                <div className="stat-number">{formatSummaryValue(displaySummary.closingBalance || displaySummary.balanceStock || 0)} {summaryUnit}</div>
                <div className="stat-label">Balance</div>
                <div className="stat-sublabel">
                  Current Stock
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
                    <th>INVORD STOCK</th>
                    <th>CAFE STOCK</th>
                    <th>STOCK ADJUSTMENT</th>
                    <th>BALANCE</th>
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
                    cafeStockData={cafeStockData}
                    productUnit={getProductUnit(product)}
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
          cafeStockData={cafeStockData}
          productUnit={getProductUnit(product)}
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

        {/* Success Modal - Global Design Pattern */}
        {/* Success messages now use toast notifications in top right corner */}

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

StockManagement.displayName = 'StockManagement';

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
if (!document.head.querySelector('style[data-component="StockManagement"]')) {
  style.setAttribute('data-component', 'StockManagement');
  document.head.appendChild(style);
}

export default StockManagement;
