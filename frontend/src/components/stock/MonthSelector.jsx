/**
 * STOCK HISTORY RESTRUCTURING PROJECT
 * Phase 5: Frontend Components - Month Selector
 */

import React, { useState, useEffect } from 'react';
import config from '../../config';
import '../../styles/components/stock/MonthSelector.css'; // Extracted inline styles

const MonthSelector = ({ 
  productId, 
  selectedYear,
  selectedMonth, 
  onMonthChange, 
  className = '',
  disabled = false 
}) => {
  const [availableMonths, setAvailableMonths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    if (productId && selectedYear) {
      fetchAvailableMonths();
    } else {
      setAvailableMonths([]);
      onMonthChange(null);
    }
  }, [productId, selectedYear]);

  const fetchAvailableMonths = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('authToken');
      const response = await fetch(
        config.helpers.getApiUrl(`/stock-history/${productId}/months?year=${selectedYear}`), 
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
      setAvailableMonths(data.data.availableMonths);

      // Auto-select current month if available and no month is selected
      if (!selectedMonth && data.data.availableMonths.length > 0) {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        if (selectedYear === currentYear && data.data.availableMonths.includes(currentMonth)) {
          onMonthChange(currentMonth);
        } else {
          // Select the most recent month
          onMonthChange(Math.max(...data.data.availableMonths));
        }
      }
  } catch (error) {

      setError('Failed to load available months');
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (event) => {
    const month = parseInt(event.target.value);
    onMonthChange(month);
  };

  const formatMonthOption = (monthNum) => {
    return `${monthNum.toString().padStart(2, '0')} - ${monthNames[monthNum - 1]}`;
  };

  return (
    <div className={`month-selector ${className}`}>
      <label htmlFor="month-select">
        🗓️ Select Month:
      </label>
      
      <select
        id="month-select"
        value={selectedMonth || ''}
        onChange={handleMonthChange}
        disabled={disabled || loading || !selectedYear}
        className="form-control month-selector-select"
      >
        <option value="">
          {loading ? 'Loading months...' : 
           !selectedYear ? 'Select year first' : 'Select Month'}
        </option>
        {availableMonths.map(month => (
          <option key={month} value={month}>
            {formatMonthOption(month)}
          </option>
        ))}
      </select>

      {error && (
        <div className="error-message month-selector-error">
          {error}
        </div>
      )}

      {!loading && availableMonths.length === 0 && !error && selectedYear && (
        <div className="info-message month-selector-info">
          No stock history for {selectedYear}
        </div>
      )}

      <div className="month-info month-selector-month-info">
        {availableMonths.length > 0 && `${availableMonths.length} month(s) available in ${selectedYear}`}
      </div>
    </div>
  );
};

export default MonthSelector;