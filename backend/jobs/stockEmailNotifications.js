/**
 * Stock Email Notification Jobs
 * Automated email notifications for stock management events
 */

const cron = require('node-cron');
const mongoose = require('mongoose');
const Theater = require('../models/Theater');
const Product = require('../models/Product');
const MonthlyStock = require('../models/MonthlyStock');
const Order = require('../models/Order');
const {
  sendStockExpirationWarning,
  sendLowStockAlert,
  sendDailySalesReport,
  sendDailyStockReport,
  sendExpiredStockNotification
} = require('../utils/emailService');
const { getTheaterEmailAddresses } = require('../utils/stockEmailHelper');
const settingsService = require('../services/SettingsService');

// Store cron job references for reloading
let cronJobs = {
  expiringStock: null,
  expiredStock: null,
  lowStock: null,
  dailyStockReport: null,
  stockReport: null
};

// Get db instance - will be initialized when mongoose is connected
function getDb() {
  return mongoose.connection.db;
}

/**
 * Get all active products for a theater from productlist collection
 */
async function getTheaterProducts(theaterId) {
  try {
    const db = getDb();
    if (!db) {
      console.warn('⚠️  Database not connected');
      return [];
    }
    
    const productContainer = await db.collection('productlist').findOne({
      theater: new mongoose.Types.ObjectId(theaterId),
      productList: { $exists: true }
    });

    if (!productContainer || !productContainer.productList) {
      return [];
    }

    return productContainer.productList.filter(p => p.isActive === true);
  } catch (error) {
    console.error(`❌ Error getting products for theater ${theaterId}:`, error);
    return [];
  }
}

/**
 * Check for stock expiring within 3 days and send warnings
 * Runs daily at 9:00 AM
 */
async function checkExpiringStock() {
  try {
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    threeDaysLater.setHours(23, 59, 59, 999);
    
    // Get all active theaters
    const theaters = await Theater.find({ isActive: true });
    
    for (const theater of theaters) {
      try {
        // Check if theater has active email notifications
        const emailAddresses = await getTheaterEmailAddresses(theater._id);
        if (!emailAddresses || emailAddresses.length === 0) {
          continue; // Skip theaters without email notifications
        }
        
        // Get all products for this theater (array-based structure)
        const products = await getTheaterProducts(theater._id);
        
        const expiringProducts = [];
        
        for (const product of products) {
          // Get current month's stock
          const currentDate = new Date();
          const year = currentDate.getFullYear();
          const month = currentDate.getMonth() + 1;
          
          const monthlyDoc = await MonthlyStock.findOne({
            theaterId: theater._id,
            productId: product._id,
            year,
            monthNumber: month
          });
          
          if (monthlyDoc && monthlyDoc.stockDetails) {
            // Check each stock entry for expiration
            for (const entry of monthlyDoc.stockDetails) {
              if (entry.expireDate && entry.balance > 0) {
                const expiryDate = new Date(entry.expireDate);
                expiryDate.setHours(0, 0, 0, 0);
                
                // Check if expiring within 3 days
                if (expiryDate >= today && expiryDate <= threeDaysLater) {
                  const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
                  
                  expiringProducts.push({
                    productName: product.name,
                    oldStock: entry.oldStock || 0,
                    invordStock: entry.invordStock || 0,
                    sales: entry.sales || 0,
                    damageStock: entry.damageStock || 0,
                    expiredStock: entry.expiredStock || 0,
                    balance: entry.balance || 0,
                    expireDate: entry.expireDate,
                    daysUntilExpiry
                  });
                }
              }
            }
          }
        }
        
        // Send email if there are expiring products
        if (expiringProducts.length > 0) {
          await sendStockExpirationWarning(theater, expiringProducts);
        }
      } catch (error) {
        console.error(`❌ Error processing theater ${theater.name}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in checkExpiringStock:', error);
  }
}

/**
 * Check for low stock products and send alerts
 * Checks 30 minutes before reaching threshold by predicting stock depletion
 * Runs every 30 minutes
 */
async function checkLowStock() {
  try {
    
    // Get all active theaters
    const theaters = await Theater.find({ isActive: true });
    
    for (const theater of theaters) {
      try {
        // Check if theater has active email notifications
        const emailAddresses = await getTheaterEmailAddresses(theater._id);
        if (!emailAddresses || emailAddresses.length === 0) {
          continue; // Skip theaters without email notifications
        }
        
        // Get all products for this theater (array-based structure)
        const products = await getTheaterProducts(theater._id);
        
        const lowStockProducts = [];
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        
        for (const product of products) {
          const lowStockAlert = product.inventory?.minStock || 5; // Default threshold
          
          // Get monthly stock document for sales calculation
          const monthlyDoc = await MonthlyStock.findOne({
            theaterId: theater._id,
            productId: product._id,
            year,
            monthNumber: month
          });
          
          // Get current stock from latest entry
          let currentStock = 0;
          if (monthlyDoc && monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
            // Get latest stock entry
            const latestEntry = monthlyDoc.stockDetails[monthlyDoc.stockDetails.length - 1];
            currentStock = Math.max(0,
              (latestEntry.invordStock || 0) - (latestEntry.sales || 0) - 
              (latestEntry.expiredStock || 0) - (latestEntry.damageStock || 0)
            );
          }
          
          // Calculate average daily sales from last 7 days
          let totalSales = 0;
          let daysWithSales = 0;
          if (monthlyDoc && monthlyDoc.stockDetails) {
            const last7DaysEntries = monthlyDoc.stockDetails.filter(entry => {
              const entryDate = new Date(entry.date);
              return entryDate >= sevenDaysAgo;
            });
            
            last7DaysEntries.forEach(entry => {
              if (entry.sales > 0) {
                totalSales += entry.sales;
                daysWithSales++;
              }
            });
          }
          
          const averageDailySales = daysWithSales > 0 ? totalSales / daysWithSales : 0;
          const salesPer30Minutes = averageDailySales / 48; // 48 * 30 minutes = 24 hours
          
          // Predict stock level in 30 minutes
          const predictedStockIn30Minutes = currentStock - salesPer30Minutes;
          
          // Check if stock will reach threshold in 30 minutes OR is already at/below threshold
          const willReachThreshold = predictedStockIn30Minutes <= lowStockAlert && predictedStockIn30Minutes > 0;
          const isAlreadyLow = currentStock > 0 && currentStock <= lowStockAlert;
          
          if (willReachThreshold || isAlreadyLow) {
            // Get today's stock entry
            let stockEntry = null;
            if (monthlyDoc && monthlyDoc.stockDetails) {
              stockEntry = monthlyDoc.stockDetails.find(entry => {
                const entryDate = new Date(entry.date);
                entryDate.setHours(0, 0, 0, 0);
                return entryDate.getTime() === today.getTime();
              });
            }
            
            lowStockProducts.push({
              productName: product.name,
              oldStock: stockEntry?.oldStock || 0,
              invordStock: stockEntry?.invordStock || 0,
              sales: stockEntry?.sales || 0,
              damageStock: stockEntry?.damageStock || 0,
              expiredStock: stockEntry?.expiredStock || 0,
              balance: currentStock,
              predictedBalance: Math.max(0, predictedStockIn30Minutes),
              expireDate: stockEntry?.expireDate || null,
              lowStockAlert,
              warningType: isAlreadyLow ? 'Currently Low' : 'Will Reach Threshold Soon'
            });
          }
        }
        
        // Send email if there are low stock products
        if (lowStockProducts.length > 0) {
          await sendLowStockAlert(theater, lowStockProducts);
        }
      } catch (error) {
        console.error(`❌ Error processing theater ${theater.name}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in checkLowStock:', error);
  }
}

/**
 * Send daily stock report to all theaters
 * Runs daily at 10:00 PM
 */
async function sendDailyStockReports() {
  try {
    
    // Get all active theaters
    const theaters = await Theater.find({ isActive: true });
    
    for (const theater of theaters) {
      try {
        // Check if theater has active email notifications
        const emailAddresses = await getTheaterEmailAddresses(theater._id);
        if (!emailAddresses || emailAddresses.length === 0) {
          continue; // Skip theaters without email notifications
        }
        
        // Get all products for this theater (array-based structure)
        const products = await getTheaterProducts(theater._id);
        
        const stockData = [];
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const product of products) {
          const lowStockAlert = product.inventory?.minStock || 5;
          
          // Get today's stock entry
          const monthlyDoc = await MonthlyStock.findOne({
            theaterId: theater._id,
            productId: product._id,
            year,
            monthNumber: month
          });
          
          let stockEntry = null;
          let currentStock = 0;
          
          if (monthlyDoc && monthlyDoc.stockDetails) {
            // Find today's stock entry
            stockEntry = monthlyDoc.stockDetails.find(entry => {
              const entryDate = new Date(entry.date);
              entryDate.setHours(0, 0, 0, 0);
              return entryDate.getTime() === today.getTime();
            });
            
            // Calculate current stock from today's entry or latest entry
            if (stockEntry) {
              currentStock = Math.max(0,
                (stockEntry.invordStock || 0) - (stockEntry.sales || 0) - 
                (stockEntry.expiredStock || 0) - (stockEntry.damageStock || 0)
              );
            } else if (monthlyDoc.stockDetails.length > 0) {
              // Use latest entry if today's entry not found
              const latestEntry = monthlyDoc.stockDetails[monthlyDoc.stockDetails.length - 1];
              currentStock = Math.max(0,
                (latestEntry.invordStock || 0) - (latestEntry.sales || 0) - 
                (latestEntry.expiredStock || 0) - (latestEntry.damageStock || 0)
              );
            }
          }
          
          // Determine status
          let status = 'Active';
          if (currentStock <= 0) {
            status = 'Out of Stock';
          } else if (currentStock <= lowStockAlert) {
            status = 'Low Stock';
          }
          
          // Check expiration
          if (stockEntry?.expireDate) {
            const expiryDate = new Date(stockEntry.expireDate);
            expiryDate.setHours(0, 0, 0, 0);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiry < 0) {
              status = 'Expired';
            } else if (daysUntilExpiry <= 3) {
              status = 'Expiring Soon';
            }
          }
          
          stockData.push({
            productName: product.name,
            oldStock: stockEntry?.oldStock || 0,
            invordStock: stockEntry?.invordStock || 0,
            sales: stockEntry?.sales || 0,
            damageStock: stockEntry?.damageStock || 0,
            expiredStock: stockEntry?.expiredStock || 0,
            balance: currentStock,
            expireDate: stockEntry?.expireDate || null,
            lowStockAlert,
            status
          });
        }
        
        if (stockData.length > 0) {
          await sendDailyStockReport(theater, stockData);
        } else {
        }
      } catch (error) {
        console.error(`❌ Error processing theater ${theater.name}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in sendDailyStockReports:', error);
  }
}

/**
 * Send comprehensive stock report to all theaters
 * Runs daily at configured time (default 8:00 PM)
 */
async function sendStockReports() {
  try {
    
    // Get all active theaters
    const theaters = await Theater.find({ isActive: true });
    
    for (const theater of theaters) {
      try {
        // Check if theater has active email notifications
        const emailAddresses = await getTheaterEmailAddresses(theater._id);
        if (!emailAddresses || emailAddresses.length === 0) {
          continue; // Skip theaters without email notifications
        }
        
        // Get all products for this theater (array-based structure)
        const products = await getTheaterProducts(theater._id);
        
        const stockData = [];
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const product of products) {
          const lowStockAlert = product.inventory?.minStock || 5;
          
          // Get today's stock entry
          const monthlyDoc = await MonthlyStock.findOne({
            theaterId: theater._id,
            productId: product._id,
            year,
            monthNumber: month
          });
          
          let stockEntry = null;
          let currentStock = 0;
          
          if (monthlyDoc && monthlyDoc.stockDetails) {
            // Find today's stock entry
            stockEntry = monthlyDoc.stockDetails.find(entry => {
              const entryDate = new Date(entry.date);
              entryDate.setHours(0, 0, 0, 0);
              return entryDate.getTime() === today.getTime();
            });
            
            // Calculate current stock from today's entry or latest entry
            if (stockEntry) {
              currentStock = Math.max(0,
                (stockEntry.invordStock || 0) - (stockEntry.sales || 0) - 
                (stockEntry.expiredStock || 0) - (stockEntry.damageStock || 0)
              );
            } else if (monthlyDoc.stockDetails.length > 0) {
              // Use latest entry if today's entry not found
              const latestEntry = monthlyDoc.stockDetails[monthlyDoc.stockDetails.length - 1];
              currentStock = Math.max(0,
                (latestEntry.invordStock || 0) - (latestEntry.sales || 0) - 
                (latestEntry.expiredStock || 0) - (latestEntry.damageStock || 0)
              );
            }
          }
          
          let status = 'Normal';
          if (currentStock <= 0) {
            status = 'Out of Stock';
          } else if (currentStock <= lowStockAlert) {
            status = 'Low Stock';
          }
          
          // Check expiration
          if (stockEntry?.expireDate) {
            const expiryDate = new Date(stockEntry.expireDate);
            expiryDate.setHours(0, 0, 0, 0);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiry < 0) {
              status = 'Expired';
            } else if (daysUntilExpiry <= 3) {
              status = 'Expiring Soon';
            }
          }
          
          stockData.push({
            productName: product.name,
            oldStock: stockEntry?.oldStock || 0,
            invordStock: stockEntry?.invordStock || 0,
            sales: stockEntry?.sales || 0,
            damageStock: stockEntry?.damageStock || 0,
            expiredStock: stockEntry?.expiredStock || 0,
            balance: currentStock,
            expireDate: stockEntry?.expireDate || null,
            lowStockAlert,
            status
          });
        }
        
        if (stockData.length > 0) {
          await sendDailyStockReport(theater, stockData);
        } else {
        }
      } catch (error) {
        console.error(`❌ Error processing theater ${theater.name}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in sendStockReports:', error);
  }
}

/**
 * Check for expired stock and send notifications
 * Runs daily at 8:00 AM
 */
async function checkExpiredStock() {
  try {
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all active theaters
    const theaters = await Theater.find({ isActive: true });
    
    for (const theater of theaters) {
      try {
        // Check if theater has active email notifications
        const emailAddresses = await getTheaterEmailAddresses(theater._id);
        if (!emailAddresses || emailAddresses.length === 0) {
          continue; // Skip theaters without email notifications
        }
        
        // Get all products for this theater (array-based structure)
        const products = await getTheaterProducts(theater._id);
        
        const expiredProducts = [];
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        
        for (const product of products) {
          // Get current month's stock
          const monthlyDoc = await MonthlyStock.findOne({
            theaterId: theater._id,
            productId: product._id,
            year,
            monthNumber: month
          });
          
          if (monthlyDoc && monthlyDoc.stockDetails) {
            // Check each stock entry for expiration
            for (const entry of monthlyDoc.stockDetails) {
              if (entry.expireDate && entry.balance > 0) {
                const expiryDate = new Date(entry.expireDate);
                expiryDate.setHours(0, 0, 0, 0);
                
                // Check if expired (past today)
                if (expiryDate < today) {
                  expiredProducts.push({
                    productName: product.name,
                    oldStock: entry.oldStock || 0,
                    invordStock: entry.invordStock || 0,
                    sales: entry.sales || 0,
                    damageStock: entry.damageStock || 0,
                    expiredStock: entry.expiredStock || 0,
                    balance: entry.balance || 0,
                    expireDate: entry.expireDate
                  });
                }
              }
            }
          }
        }
        
        // Send email if there are expired products
        if (expiredProducts.length > 0) {
          await sendExpiredStockNotification(theater, expiredProducts);
        }
      } catch (error) {
        console.error(`❌ Error processing theater ${theater.name}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in checkExpiredStock:', error);
  }
}

/**
 * Stop all existing cron jobs
 */
function stopAllCronJobs() {
  if (cronJobs.expiringStock) {
    cronJobs.expiringStock.stop();
    cronJobs.expiringStock = null;
  }
  if (cronJobs.expiredStock) {
    cronJobs.expiredStock.stop();
    cronJobs.expiredStock = null;
  }
  if (cronJobs.lowStock) {
    cronJobs.lowStock.stop();
    cronJobs.lowStock = null;
  }
  if (cronJobs.dailyStockReport) {
    cronJobs.dailyStockReport.stop();
    cronJobs.dailyStockReport = null;
  }
  
  if (cronJobs.stockReport) {
    cronJobs.stockReport.stop();
    cronJobs.stockReport = null;
  }
}

/**
 * Initialize cron jobs from database configuration
 */
async function initializeStockEmailJobs() {
  try {
    // Stop existing jobs if any
    stopAllCronJobs();
    
    // Get schedule configuration from database
    const schedule = await settingsService.getEmailNotificationSchedule();
    
    // Schedule expiring stock check
    if (schedule.expiringStockCheck && schedule.expiringStockCheck.enabled) {
      cronJobs.expiringStock = cron.schedule(schedule.expiringStockCheck.cron, async () => {
        await checkExpiringStock();
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });
    } else {
    }
    
    // Schedule expired stock check
    if (schedule.expiredStockCheck && schedule.expiredStockCheck.enabled) {
      cronJobs.expiredStock = cron.schedule(schedule.expiredStockCheck.cron, async () => {
        await checkExpiredStock();
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });
    } else {
    }
    
    // Schedule low stock check
    if (schedule.lowStockCheck && schedule.lowStockCheck.enabled) {
      cronJobs.lowStock = cron.schedule(schedule.lowStockCheck.cron, async () => {
        await checkLowStock();
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });
      const interval = schedule.lowStockCheck.interval || 30;
    } else {
    }
    
    // Schedule daily stock report
    if (schedule.dailyStockReport && schedule.dailyStockReport.enabled) {
      cronJobs.dailyStockReport = cron.schedule(schedule.dailyStockReport.cron, async () => {
        await sendDailyStockReports();
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });
    } else {
    }

    // Schedule stock report
    if (schedule.stockReport && schedule.stockReport.enabled) {
      cronJobs.stockReport = cron.schedule(schedule.stockReport.cron, async () => {
        await sendStockReports();
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });
    } else {
    }
    
  } catch (error) {
    console.error('❌ Error initializing stock email jobs:', error);
    // Fallback to default schedules if database read fails
    initializeStockEmailJobsWithDefaults();
  }
}

/**
 * Initialize cron jobs with default hardcoded schedules (fallback)
 */
function initializeStockEmailJobsWithDefaults() {
  // Check expiring stock daily at 9:00 AM
  cronJobs.expiringStock = cron.schedule('0 9 * * *', async () => {
    await checkExpiringStock();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
  
  // Check expired stock daily at 8:00 AM
  cronJobs.expiredStock = cron.schedule('0 8 * * *', async () => {
    await checkExpiredStock();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
  
  // Check low stock every 30 minutes
  cronJobs.lowStock = cron.schedule('*/30 * * * *', async () => {
    await checkLowStock();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
  
  // Send daily stock report at 10:00 PM
  cronJobs.dailyStockReport = cron.schedule('0 22 * * *', async () => {
    await sendDailyStockReports();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  cronJobs.stockReport = cron.schedule('0 20 * * *', async () => {
    await sendStockReports();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
  
}

/**
 * Reload stock email jobs (called when schedule is updated)
 */
function reloadStockEmailJobs() {
  initializeStockEmailJobs().catch(error => {
    console.error('❌ Error reloading stock email jobs:', error);
    // Fallback to defaults on error
    initializeStockEmailJobsWithDefaults();
  });
}

module.exports = {
  checkExpiringStock,
  checkExpiredStock,
  checkLowStock,
  sendDailyStockReports,
  initializeStockEmailJobs,
  reloadStockEmailJobs
};

