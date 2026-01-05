/**
 * Real-time Low Stock Checker
 * Checks and sends notifications when stock becomes low
 */

const Theater = require('../models/Theater');
const Product = require('../models/Product');
const MonthlyStock = require('../models/MonthlyStock');
const { sendLowStockAlert } = require('./emailService');

// Track recently sent notifications to avoid spam
const recentNotifications = new Map(); // key: `${theaterId}_${productId}`, value: timestamp

/**
 * Check if stock is low for a specific product and send notification
 * @param {string} theaterId - Theater ID
 * @param {string} productId - Product ID
 * @param {number} currentStock - Current stock level
 * @returns {Promise<boolean>} - Returns true if notification was sent
 */
async function checkAndNotifyLowStock(theaterId, productId, currentStock) {
  try {
    // Get product and theater info
    const [product, theater] = await Promise.all([
      Product.findById(productId).select('name inventory'),
      Theater.findById(theaterId).select('name email')
    ]);

    if (!product || !theater || !theater.email) {
      return false;
    }

    const lowStockAlert = product.inventory?.minStock || 5; // Default threshold
    
    // Check if stock is low
    if (currentStock > 0 && currentStock <= lowStockAlert) {
      // Check if we sent notification recently (within last 4 hours to avoid spam)
      const notificationKey = `${theaterId}_${productId}`;
      const lastNotification = recentNotifications.get(notificationKey);
      const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
      
      if (lastNotification && lastNotification > fourHoursAgo) {
        return false;
      }

      // Get current month's stock details for Excel report
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      
      const monthlyDoc = await MonthlyStock.findOne({
        theaterId,
        productId,
        year,
        monthNumber: month
      });
      
      // Get today's stock entry
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let stockEntry = null;
      
      if (monthlyDoc && monthlyDoc.stockDetails) {
        stockEntry = monthlyDoc.stockDetails.find(entry => {
          const entryDate = new Date(entry.date);
          entryDate.setHours(0, 0, 0, 0);
          return entryDate.getTime() === today.getTime();
        });
      }
      
      const lowStockProduct = {
        productName: product.name,
        oldStock: stockEntry?.oldStock || 0,
        invordStock: stockEntry?.invordStock || 0,
        sales: stockEntry?.sales || 0,
        damageStock: stockEntry?.damageStock || 0,
        expiredStock: stockEntry?.expiredStock || 0,
        balance: currentStock,
        expireDate: stockEntry?.expireDate || null,
        lowStockAlert
      };

      // Send email notification
      const result = await sendLowStockAlert(theater, [lowStockProduct]);
      
      if (result.success) {
        // Record that we sent notification
        recentNotifications.set(notificationKey, Date.now());
        
        // Clean up old entries (older than 24 hours)
        for (const [key, timestamp] of recentNotifications.entries()) {
          if (timestamp < Date.now() - (24 * 60 * 60 * 1000)) {
            recentNotifications.delete(key);
          }
        }
        
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error checking low stock:', error);
    return false;
  }
}

/**
 * Check low stock for multiple products (batch check)
 * @param {string} theaterId - Theater ID
 * @param {Array} products - Array of {productId, currentStock}
 */
async function checkLowStockBatch(theaterId, products) {
  const lowStockProducts = [];
  
  for (const { productId, currentStock } of products) {
    const isLow = await checkAndNotifyLowStock(theaterId, productId, currentStock);
    if (isLow) {
      lowStockProducts.push({ productId, currentStock });
    }
  }
  
  return lowStockProducts;
}

module.exports = {
  checkAndNotifyLowStock,
  checkLowStockBatch
};

