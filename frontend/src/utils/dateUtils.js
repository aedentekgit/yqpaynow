/**
 * Date utility functions to handle local timezone dates
 * Fixes timezone issues where toISOString() converts to UTC
 */

/**
 * Get today's date in local timezone (YYYY-MM-DD format)
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getTodayLocalDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Convert a date to local timezone format (YYYY-MM-DD)
 * Handles Date objects, date strings, and ISO strings
 * @param {Date|string} date - Date to convert
 * @returns {string} Date in YYYY-MM-DD format (local timezone)
 */
export const formatDateToLocal = (date) => {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Convert a date string to local timezone format (YYYY-MM-DD)
 * Useful when you have an ISO string and want local date
 * @param {string} dateString - ISO date string or date string
 * @returns {string} Date in YYYY-MM-DD format (local timezone)
 */
export const formatDateStringToLocal = (dateString) => {
  if (!dateString) return '';
  
  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Parse the date string and format to local
  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return '';
  
  return formatDateToLocal(dateObj);
};

