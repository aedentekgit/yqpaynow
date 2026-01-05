/**
 * Date utility functions to handle local timezone dates
 * Fixes timezone issues where toISOString() converts to UTC
 */

/**
 * Get today's date in local timezone (YYYY-MM-DD format)
 * @returns {string} Today's date in YYYY-MM-DD format
 */
const getTodayLocalDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get today's date string for order numbers (YYYYMMDD format)
 * @returns {string} Today's date in YYYYMMDD format
 */
const getTodayLocalDateForOrder = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Get start of today in local timezone
 * @returns {Date} Start of today (00:00:00.000)
 */
const getStartOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};

/**
 * Get end of today in local timezone
 * @returns {Date} End of today (23:59:59.999)
 */
const getEndOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
};

/**
 * Format date to local timezone string (YYYY-MM-DD format)
 * @param {Date|string} date - Date to format
 * @returns {string} Date in YYYY-MM-DD format (local timezone)
 */
const formatDateToLocal = (date) => {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

module.exports = {
  getTodayLocalDate,
  getTodayLocalDateForOrder,
  getStartOfToday,
  getEndOfToday,
  formatDateToLocal
};

