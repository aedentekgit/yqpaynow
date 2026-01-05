const cron = require('node-cron');
const MonthlyStock = require('../models/MonthlyStock');
const Product = require('../models/Product');

/**
 * Auto-expire stock entries at 12:01 AM daily
 * Checks all stock entries with expireDate <= today
 * Moves quantity from stockAdded to expiredStock
 */
async function processExpiredStock() {
  try {

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all monthly documents with stock details that have expired
    const monthlyDocs = await MonthlyStock.find({
      'stockDetails.expireDate': { $lte: today },
      'stockDetails.stockAdded': { $gt: 0 }
    });

    let totalProcessed = 0;
    let totalExpired = 0;

    for (const doc of monthlyDocs) {
      let docModified = false;
      let runningBalance = doc.carryForward;

      // Process each stock detail entry
      for (let i = 0; i < doc.stockDetails.length; i++) {
        const entry = doc.stockDetails[i];

        // Check if entry has expireDate and it's expired
        if (entry.expireDate && new Date(entry.expireDate) <= today && entry.stockAdded > 0) {
          // Move stock from stockAdded to expiredStock
          const expiredQty = entry.stockAdded;
          entry.expiredStock += expiredQty;
          entry.stockAdded = 0;
          
          // Adjust balance (reduce by expired amount)
          entry.balance = runningBalance - expiredQty;
          
          totalExpired += expiredQty;
          docModified = true;
        }

        // Update running balance for next iteration
        runningBalance = entry.balance;
      }

      // Save modified document
      if (docModified) {
        await doc.save();
        
        // Update product's current stock
        try {
          await Product.findByIdAndUpdate(doc.productId, {
            'inventory.currentStock': doc.closingBalance
          });
        } catch (prodError) {
          console.error('  ❌ Failed to update product stock:', prodError.message);
        }

        totalProcessed++;
      }
    }

  } catch (error) {
    console.error('❌ Expired Stock Scheduler Error:', error);
  }
}

/**
 * Start the scheduled job
 * Runs daily at 12:01 AM
 */
function startExpiredStockScheduler() {
  // Schedule: Run at 12:01 AM every day
  // Cron format: minute hour day month dayOfWeek
  // 1 0 * * * = At 12:01 AM every day
  cron.schedule('1 0 * * *', async () => {
    await processExpiredStock();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust to your timezone
  });
}

// Export functions
module.exports = {
  startExpiredStockScheduler,
  processExpiredStock // For manual testing
};
