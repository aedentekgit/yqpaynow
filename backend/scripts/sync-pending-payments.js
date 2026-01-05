/**
 * Script to sync all pending payments from Razorpay
 * 
 * Usage:
 *   node backend/scripts/sync-pending-payments.js [theaterId]
 * 
 * If theaterId is not provided, it will sync for all theaters
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const paymentService = require('../services/paymentService');
const Theater = require('../models/Theater');

async function syncPendingPayments(theaterId = null) {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpaynow';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    let theaters = [];
    
    if (theaterId) {
      const theater = await Theater.findById(theaterId);
      if (theater) {
        theaters = [theater];
      } else {
        console.error(`❌ Theater not found: ${theaterId}`);
        process.exit(1);
      }
    } else {
      // Get all theaters with Razorpay configured
      theaters = await Theater.find({
        $or: [
          { 'paymentGateway.kiosk.razorpay.enabled': true },
          { 'paymentGateway.online.razorpay.enabled': true }
        ]
      });
    }

    const totalResults = {
      theatersProcessed: 0,
      totalSynced: 0,
      totalFailed: 0,
      totalAlreadyUpToDate: 0
    };

    for (const theater of theaters) {
      
      try {
        const result = await paymentService.syncAllPendingPayments(theater._id.toString());
        
        totalResults.theatersProcessed++;
        totalResults.totalSynced += result.synced;
        totalResults.totalFailed += result.failed;
        totalResults.totalAlreadyUpToDate += result.alreadyUpToDate;

        console.log(`   - Failed: ${result.failed}`);
        
        if (result.errors && result.errors.length > 0) {
          result.errors.slice(0, 5).forEach(err => {
          });
          if (result.errors.length > 5) {
          }
        }
      } catch (error) {
        console.error(`❌ Error syncing theater ${theater._id}:`, error.message);
        totalResults.totalFailed++;
      }
    }

    console.log(`Total failed: ${totalResults.totalFailed}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Get theater ID from command line arguments
const theaterId = process.argv[2] || null;

syncPendingPayments(theaterId);

