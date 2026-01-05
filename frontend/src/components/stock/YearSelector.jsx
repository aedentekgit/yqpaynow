/**
 * STOCK HISTORY RESTRUCTURING PROJECT
 * Phase 5: Frontend Components - Year Selector
 */

import React, { useState, useEffect } from 'react';
import config from '../../config';
import '../../styles/YearSelector.css'; // Extracted inline styles

const YearSelector = ({ 
  productId, 
  selectedYear, 
  onYearChange, 
  className = '',
  disabled = false 
}) => {
  const [availableYears, setAvailableYears] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (productId) {
      fetchAvailableYears();
    }
  }, [productId]);

  const fetchAvailableYears = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('authToken');
      const response = await fetch(
        config.helpers.getApiUrl(`/stock-history/${productId}/years`), 
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setAvailableYears(data.data.availableYears);

      // Auto-select current year if available and no year is selected
      if (!selectedYear && data.data.availableYears.length > 0) {
        const currentYear = new Date().getFullYear();
        if (data.data.availableYears.includes(currentYear)) {
          onYearChange(currentYear);
        } else {
          // Select the most recent year
          onYearChange(Math.max(...data.data.availableYears));
        }
      }
  } catch (error) {

      setError('Failed to load available years');
    } finally {
      setLoading(false);
    }
  };

  const handleYearChange = (event) => {
    const year = parseInt(event.target.value);
    onYearChange(year);
  };

  return (
    <div className={`year-selector ${className}`}>
      <label htmlFor="year-select">
        📅 Select Year:
      </label>
      
      <select
        id="year-select"
        value={selectedYear || ''}
        onChange={handleYearChange}
        disabled={disabled || loading}
        className="form-control year-selector-select"
      >
        <option value="">
          {loading ? 'Loading years...' : 'Select Year'}
        </option>
        {availableYears.map(year => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      {error && (
        <div className="error-message year-selector-error">
          {error}
        </div>
      )}

      {!loading && availableYears.length === 0 && !error && (
        <div className="info-message year-selector-info">
          No stock history available
        </div>
      )}

      <div className="year-info year-selector-year-info">
        {availableYears.length > 0 && `${availableYears.length} year(s) available`}
      </div>
    </div>
  );
};

export default YearSelector;