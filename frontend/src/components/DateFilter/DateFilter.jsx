import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/components/DateFilter/DateFilter.css';

const DateFilter = ({ 
  isOpen, 
  onClose, 
  onApply, 
  initialFilter = {
    type: 'all',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedDate: null,
    startDate: null,
    endDate: null,
    fromTime: null,
    toTime: null
  },
  dateOnly = false
}) => {
  const { userType } = useAuth();
  const [localFilter, setLocalFilter] = useState(initialFilter);
  const [rangeSelectionMode, setRangeSelectionMode] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(null);
  
  // Initialize time fields if not present
  const [fromTime, setFromTime] = useState(initialFilter.fromTime || '00:00');
  const [toTime, setToTime] = useState(initialFilter.toTime || '23:59');
  
  // Show time filter if time values are already set (not default)
  const [showTimeFilter, setShowTimeFilter] = useState(
    (initialFilter.fromTime && initialFilter.fromTime !== '00:00') || 
    (initialFilter.toTime && initialFilter.toTime !== '23:59')
  );
  
  // Update time fields when initialFilter changes
  useEffect(() => {
    if (initialFilter.fromTime !== undefined) {
      setFromTime(initialFilter.fromTime || '00:00');
    }
    if (initialFilter.toTime !== undefined) {
      setToTime(initialFilter.toTime || '23:59');
    }
  }, [initialFilter.fromTime, initialFilter.toTime]);
  
  const allMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // For theater users, limit to current month and previous month only
  const months = useMemo(() => {
    const isTheaterUser = userType === 'theater_user' || userType === 'theater_admin';
    if (!isTheaterUser) {
      return allMonths;
    }
    
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    
    // Return only current and previous month (previous month first, then current)
    return [
      allMonths[previousMonth],
      allMonths[currentMonth]
    ];
  }, [userType]);
  
  // Ensure selected month is valid for theater users (default to current month if not in filtered list)
  useEffect(() => {
    const isTheaterUser = userType === 'theater_user' || userType === 'theater_admin';
    if (isTheaterUser && months.length > 0) {
      const selectedMonthName = allMonths[localFilter.month - 1];
      if (!months.includes(selectedMonthName)) {
        // Selected month is not in the filtered list, set to current month
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1-12
        setLocalFilter(prev => ({ ...prev, month: currentMonth }));
      }
    }
  }, [userType, months, localFilter.month]);
  
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  
  // Function to check if a month/year combination is valid (not in the future)
  const isMonthYearValid = (month, year) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    // If year is in the future, not valid
    if (year > currentYear) return false;
    
    // If year is current year, only months up to current month are valid
    if (year === currentYear) {
      return month <= currentMonth;
    }
    
    // Past years are always valid
    return true;
  };
  
  // Generate calendar days for selected month/year
  const generateCalendar = () => {
    const firstDay = new Date(localFilter.year, localFilter.month - 1, 1);
    const lastDay = new Date(localFilter.year, localFilter.month, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const calendar = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      calendar.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      calendar.push(day);
    }
    
    return calendar;
  };
  
  const calendar = generateCalendar();
  
  const handleDateClick = (day) => {
    if (!day) return;
    
    // Check if the selected date is in the future
    const selectedDate = new Date(localFilter.year, localFilter.month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to compare only dates
    
    if (selectedDate > today) {
      // Don't allow selecting future dates
      return;
    }
    
    // Fix: Use local date formatting to avoid timezone conversion issues
    const year = localFilter.year;
    const month = String(localFilter.month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const selectedDateString = `${year}-${month}-${dayStr}`;
    
    // Handle range selection mode
    if (rangeSelectionMode) {
      if (!tempStartDate) {
        // First click - set start date
        setTempStartDate(selectedDateString);
      } else {
        // Second click - set end date and complete range
        const start = new Date(tempStartDate);
        const end = new Date(selectedDateString);
        
        // Ensure start is before end
        if (start <= end) {
          setLocalFilter(prev => ({
            ...prev,
            type: 'range',
            startDate: tempStartDate,
            endDate: selectedDateString,
            selectedDate: null
          }));
        } else {
          setLocalFilter(prev => ({
            ...prev,
            type: 'range',
            startDate: selectedDateString,
            endDate: tempStartDate,
            selectedDate: null
          }));
        }
        setTempStartDate(null);
        setRangeSelectionMode(false);
      }
    } else {
      // Single date selection
      setLocalFilter(prev => ({
        ...prev,
        type: 'date',
        selectedDate: selectedDateString,
        startDate: null,
        endDate: null
      }));
    }
  };
  
  const handleApply = () => {
    const filterWithTime = {
      ...localFilter,
      fromTime: fromTime,
      toTime: toTime
    };
    onApply(filterWithTime);
    onClose();
  };
  
  const handleClear = () => {
    const clearedFilter = {
      type: 'all',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      selectedDate: null,
      startDate: null,
      endDate: null,
      fromTime: null,
      toTime: null
    };
    setLocalFilter(clearedFilter);
    setRangeSelectionMode(false);
    setTempStartDate(null);
    setFromTime('00:00');
    setToTime('23:59');
    setShowTimeFilter(false);
    onApply(clearedFilter);
    onClose();
  };
  
  const handleReset = () => {
    const clearedFilter = {
      type: 'all',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      selectedDate: null,
      startDate: null,
      endDate: null,
      fromTime: null,
      toTime: null
    };
    setLocalFilter(clearedFilter);
    setRangeSelectionMode(false);
    setTempStartDate(null);
    setFromTime('00:00');
    setToTime('23:59');
    setShowTimeFilter(false);
  };
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="date-filter-modal-overlay" 
      onClick={(e) => {
        if (onClose && typeof onClose === 'function') {
          onClose();
        }
      }}
    >
      <div className="date-filter-modal-content" onClick={e => e.stopPropagation()}>
        <div className="date-filter-modal-header">
          <h2>
            <span className="date-filter-modal-icon">📅</span>
            {dateOnly ? 'Select Current Date' : 'Filter by Date'}
          </h2>
          <div className="date-filter-header-actions">
            {!dateOnly && (
              <button 
                className="date-filter-reset-header-btn"
                onClick={handleReset}
                title="Reset all filters"
              >
                <span className="date-filter-btn-icon">↻</span>
                Reset
              </button>
            )}
            <button 
              className="date-filter-close-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onClose && typeof onClose === 'function') {
                  onClose();
                }
              }}
              type="button"
              aria-label="Close modal"
            >
              <span className="close-icon">✕</span>
            </button>
          </div>
        </div>
        
        {/* Current Date Display */}
        <div className="date-filter-current-date-display">
          <div className="date-filter-current-date-info">
            <span className="date-filter-current-label">Today:</span>
            <span className="date-filter-current-date">{new Date().toLocaleDateString('en-GB', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </div>
          <div className="date-filter-current-time-info">
            <span className="date-filter-current-time">{new Date().toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            })}</span>
          </div>
        </div>
        
        <div className="date-filter-modal-body">
          {/* Month & Year Selection - Only show if not dateOnly mode */}
          {!dateOnly && (
            <div className="date-filter-form-group">
              <label>Filter by Month & Year:</label>
              <div className="date-filter-month-year-controls">
                <select 
                  className="date-filter-form-control"
                  value={localFilter.month} 
                  onChange={(e) => setLocalFilter(prev => ({ ...prev, month: parseInt(e.target.value) }))}
                >
                  {months.map((monthName) => {
                    // Get the actual month number (1-12) from the month name
                    const monthValue = allMonths.indexOf(monthName) + 1;
                    const isValid = isMonthYearValid(monthValue, localFilter.year);
                    return (
                      <option key={monthValue} value={monthValue} disabled={!isValid}>
                        {monthName} {!isValid ? '(Future)' : ''}
                      </option>
                    );
                  })}
                </select>
                <select 
                  className="date-filter-form-control"
                  value={localFilter.year} 
                  onChange={(e) => {
                    const newYear = parseInt(e.target.value);
                    const newMonth = localFilter.month;
                    
                    // If the selected month becomes invalid with the new year, adjust to current month
                    if (!isMonthYearValid(newMonth, newYear)) {
                      const now = new Date();
                      setLocalFilter(prev => ({ 
                        ...prev, 
                        year: newYear,
                        month: now.getMonth() + 1 // Set to current month
                      }));
                    } else {
                      setLocalFilter(prev => ({ ...prev, year: newYear }));
                    }
                  }}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <button 
                  className="date-filter-submit-btn date-filter-apply-month-btn"
                  onClick={() => {
                    // Validate month/year before applying
                    if (!isMonthYearValid(localFilter.month, localFilter.year)) {
                      alert('Cannot filter by a future month. Please select the current month or a past month.');
                      return;
                    }
                    
                    // Fix: Apply month filter immediately and close modal
                    const monthFilter = {
                      ...localFilter,
                      type: 'month',
                      selectedDate: null // Clear specific date when applying month filter
                    };
                    setLocalFilter(monthFilter);
                    onApply(monthFilter);
                    onClose();
                  }}
                >
                  <span className="date-filter-btn-icon">✓</span>
                  Apply Month
                </button>
              </div>
            </div>
          )}
          
          {/* Calendar Selection */}
          <div className="date-filter-form-group">
            <div className="date-filter-calendar-form-header">
              {dateOnly ? (
                <label>Select Current Date:</label>
              ) : (
                <div className="date-filter-button-group">
                  <button 
                    className={`date-filter-range-toggle-btn ${rangeSelectionMode ? 'active' : ''}`}
                    onClick={() => {
                      setRangeSelectionMode(!rangeSelectionMode);
                      setTempStartDate(null);
                      if (!rangeSelectionMode) {
                        setLocalFilter(prev => ({
                          ...prev,
                          selectedDate: null,
                          startDate: null,
                          endDate: null
                        }));
                      }
                    }}
                  >
                    <span className="date-filter-btn-icon">📅</span>
                    {rangeSelectionMode ? 'Cancel Range' : 'Select Date Range'}
                  </button>
                  <button 
                    className={`date-filter-range-toggle-btn ${showTimeFilter ? 'active' : ''}`}
                    onClick={() => {
                      setShowTimeFilter(!showTimeFilter);
                    }}
                  >
                    <span className="date-filter-btn-icon">🕐</span>
                    {showTimeFilter ? 'Cancel Time Range' : 'Select Time Range'}
                  </button>
                </div>
              )}
            </div>
            
            {rangeSelectionMode && (
              <div className="date-filter-range-info">
                <div className="date-filter-range-instruction">
                  {!tempStartDate ? (
                    <span>📍 Click on a date to set the <strong>From Date</strong></span>
                  ) : (
                    <span>📍 Click on a date to set the <strong>To Date</strong> (From: {new Date(tempStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})</span>
                  )}
                </div>
              </div>
            )}
            
            {localFilter.type === 'range' && localFilter.startDate && localFilter.endDate && (
              <div className="date-filter-range-display">
                <strong>Selected Range:</strong> {new Date(localFilter.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(localFilter.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            
            {/* Time Filter - Show when time filter button is clicked */}
            {showTimeFilter && !dateOnly && (
              <div className="date-filter-time-container">
          
                <div className="date-filter-time-controls">
                  <div className="date-filter-time-input-group">
                    {/* <label className="date-filter-time-label">From Time:</label> */}
                    <input
                      type="time"
                      className="date-filter-time-input"
                      value={fromTime}
                      onChange={(e) => {
                        const newFromTime = e.target.value;
                        setFromTime(newFromTime);
                        // Validate: fromTime should be before toTime
                        if (newFromTime && toTime && newFromTime > toTime) {
                          // Auto-adjust toTime if it's before fromTime
                          setToTime(newFromTime);
                        }
                      }}
                    />
                  </div>
                  <div className="date-filter-time-separator">→</div>
                  <div className="date-filter-time-input-group">
                    {/* <label className="date-filter-time-label">To Time:</label> */}
                    <input
                      type="time"
                      className="date-filter-time-input"
                      value={toTime}
                      onChange={(e) => {
                        const newToTime = e.target.value;
                        setToTime(newToTime);
                        // Validate: toTime should be after fromTime
                        if (fromTime && newToTime && fromTime > newToTime) {
                          // Auto-adjust fromTime if it's after toTime
                          setFromTime(newToTime);
                        }
                      }}
                    />
                  </div>
                 
                </div>
                {(fromTime !== '00:00' || toTime !== '23:59') && (
                  <div className="date-filter-time-display">
                    <strong>Time Range:</strong> {fromTime} → {toTime}
                  </div>
                )}
              </div>
            )}
            
            <div className="date-filter-calendar-container">
              <div className="date-filter-calendar-header">
                {!dateOnly && (
                  <button 
                    className="date-filter-calendar-nav-btn"
                    onClick={() => {
                      const newMonth = localFilter.month === 1 ? 12 : localFilter.month - 1;
                      const newYear = localFilter.month === 1 ? localFilter.year - 1 : localFilter.year;
                      setLocalFilter(prev => ({ ...prev, month: newMonth, year: newYear }));
                    }}
                    title="Previous month"
                  >
                    ‹
                  </button>
                )}
                <strong>{months[localFilter.month - 1]} {localFilter.year}</strong>
                {!dateOnly && (
                  <button 
                    className="date-filter-calendar-nav-btn"
                    onClick={() => {
                      const newMonth = localFilter.month === 12 ? 1 : localFilter.month + 1;
                      const newYear = localFilter.month === 12 ? localFilter.year + 1 : localFilter.year;
                      
                      // Only allow navigation if the new month/year is not in the future
                      if (isMonthYearValid(newMonth, newYear)) {
                        setLocalFilter(prev => ({ ...prev, month: newMonth, year: newYear }));
                      }
                    }}
                    disabled={!isMonthYearValid(
                      localFilter.month === 12 ? 1 : localFilter.month + 1,
                      localFilter.month === 12 ? localFilter.year + 1 : localFilter.year
                    )}
                    title="Next month"
                  >
                    ›
                  </button>
                )}
              </div>
              <div className="date-filter-calendar-grid">
                <div className="date-filter-calendar-weekdays">
                  <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                </div>
                <div className="date-filter-calendar-days">
                  {calendar.map((day, index) => {
                    // Get current date info for highlighting today
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const currentDateStr = day ? `${localFilter.year}-${String(localFilter.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
                    
                    const isToday = day && 
                      localFilter.year === today.getFullYear() && 
                      localFilter.month === today.getMonth() + 1 && 
                      day === today.getDate();
                    
                    const isSelected = day && localFilter.selectedDate === currentDateStr;
                    
                    // Check if date is in the future
                    const dateObj = day ? new Date(localFilter.year, localFilter.month - 1, day) : null;
                    const isFutureDate = dateObj && dateObj > today;
                    
                    // In dateOnly mode, only allow selecting today's date
                    const isDisabledForDateOnly = dateOnly && day && !isToday;
                    
                    // Check if this day is in the selected range
                    const isInRange = day && localFilter.type === 'range' && localFilter.startDate && localFilter.endDate && currentDateStr >= localFilter.startDate && currentDateStr <= localFilter.endDate;
                    
                    // Check if this is the start or end date of range
                    const isRangeStart = day && currentDateStr === localFilter.startDate;
                    const isRangeEnd = day && currentDateStr === localFilter.endDate;
                    
                    // Check if this is the temporary start date during range selection
                    const isTempStart = day && tempStartDate === currentDateStr;
                    
                    return (
                      <div 
                        key={index} 
                        className={`date-filter-calendar-day ${day ? 'clickable' : 'empty'} ${
                          isSelected ? 'selected' : ''
                        } ${isToday ? 'today' : ''} ${isFutureDate || isDisabledForDateOnly ? 'disabled-future' : ''} ${
                          isInRange ? 'in-range' : ''
                        } ${isRangeStart ? 'range-start' : ''} ${isRangeEnd ? 'range-end' : ''} ${
                          isTempStart ? 'temp-start' : ''
                        }`}
                        onClick={() => !isFutureDate && !isDisabledForDateOnly && handleDateClick(day)}
                        style={(isFutureDate || isDisabledForDateOnly) ? { 
                          cursor: 'not-allowed', 
                          opacity: 0.3,
                          pointerEvents: 'none'
                        } : {}}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Action Buttons Right After Calendar */}
            <div className="date-filter-calendar-actions">
              {/* Reset All Button - Only show if not dateOnly mode */}
              {!dateOnly && (
                <button className="date-filter-cancel-btn date-filter-reset-all-btn" onClick={handleClear}>
                  <span className="date-filter-btn-icon">↻</span>
                  Reset All
                </button>
              )}
              
              {/* Submit Button */}
              <button className="date-filter-submit-btn date-filter-submit-date-btn" onClick={handleApply}>
                {/* <span className="date-filter-btn-icon">✓</span> */}
                Submit
              </button>
            </div>
          </div>
          
          {/* Current Filter Display */}
          <div className="date-filter-current-filter">
            <strong>Current Filter: </strong>
            {localFilter.type === 'all' && 'All Records'}
            {localFilter.type === 'month' && `${months[localFilter.month - 1]} ${localFilter.year}`}
            {localFilter.type === 'year' && `Year ${localFilter.year}`}
            {localFilter.type === 'date' && localFilter.selectedDate && 
              `Selected Date: ${new Date(localFilter.selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}`
            }
            {localFilter.type === 'range' && localFilter.startDate && localFilter.endDate && 
              `Date Range: ${new Date(localFilter.startDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              })} → ${new Date(localFilter.endDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              })}`
            }
            {!dateOnly && (fromTime !== '00:00' || toTime !== '23:59') && (
              <span className="date-filter-time-in-current">
                {' | Time: '}{fromTime} → {toTime}
              </span>
            )}
          </div>
        </div>
        
        <div className="date-filter-form-actions">
          {/* Cancel Button */}
          <button 
            className="date-filter-cancel-btn date-filter-close-modal-btn" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onClose && typeof onClose === 'function') {
                onClose();
              }
            }}
            type="button"
            aria-label="Cancel and close modal"
          >
            <span className="date-filter-btn-icon">✕</span>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DateFilter;