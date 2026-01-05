/**
 * Fix Payment Gateway Accepted Methods
 * 
 * This script ensures all theaters with enabled payment gateways
 * have proper acceptedMethods configured.
 * 
 * Run: node backend/scripts/fix-payment-accepted-methods.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return false;
  }
}

async function fixAcceptedMethods() {
  try {
    const Theater = require(path.join(__dirname, '../models/Theater'));
    
    const theaters = await Theater.find({});
    
    if (theaters.length === 0) {
      return;
    }
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const theater of theaters) {
      let theaterUpdated = false;
      
      // Fix KIOSK channel
      if (theater.paymentGateway?.kiosk?.enabled) {
        const kiosk = theater.paymentGateway.kiosk;
        const provider = kiosk.provider;
        
        // Check if acceptedMethods need fixing
        const needsFix = !kiosk.acceptedMethods || 
                        Object.keys(kiosk.acceptedMethods).length === 0 ||
                        (kiosk.acceptedMethods.card === undefined && kiosk.acceptedMethods.upi === undefined);
        
        if (needsFix) {
          
          if (provider === 'razorpay' && kiosk.razorpay?.enabled) {
            theater.paymentGateway.kiosk.acceptedMethods = {
              cash: true,
              card: true,
              upi: true,
              netbanking: false,
              wallet: false
            };
            theaterUpdated = true;
          } else if (provider === 'phonepe' && kiosk.phonepe?.enabled) {
            theater.paymentGateway.kiosk.acceptedMethods = {
              cash: true,
              card: false,
              upi: true,
              netbanking: false,
              wallet: false
            };
            theaterUpdated = true;
          } else if (provider === 'paytm' && kiosk.paytm?.enabled) {
            theater.paymentGateway.kiosk.acceptedMethods = {
              cash: true,
              card: true,
              upi: true,
              netbanking: true,
              wallet: true
            };
            theaterUpdated = true;
          }
        }
      }
      
      // Fix ONLINE channel
      if (theater.paymentGateway?.online?.enabled) {
        const online = theater.paymentGateway.online;
        const provider = online.provider;
        
        // Check if acceptedMethods need fixing
        const needsFix = !online.acceptedMethods || 
                        Object.keys(online.acceptedMethods).length === 0 ||
                        (online.acceptedMethods.card === undefined && online.acceptedMethods.upi === undefined);
        
        if (needsFix) {
          
          if (provider === 'razorpay' && online.razorpay?.enabled) {
            theater.paymentGateway.online.acceptedMethods = {
              cash: false,  // Online orders typically don't accept cash
              card: true,
              upi: true,
              netbanking: true,
              wallet: false
            };
            theaterUpdated = true;
          } else if (provider === 'phonepe' && online.phonepe?.enabled) {
            theater.paymentGateway.online.acceptedMethods = {
              cash: false,
              card: false,
              upi: true,
              netbanking: false,
              wallet: false
            };
            theaterUpdated = true;
          } else if (provider === 'paytm' && online.paytm?.enabled) {
            theater.paymentGateway.online.acceptedMethods = {
              cash: false,
              card: true,
              upi: true,
              netbanking: true,
              wallet: true
            };
            theaterUpdated = true;
          }
        }
      }
      
      if (theaterUpdated) {
        await theater.save();
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
    
    
  } catch (error) {
    console.error('❌ Error fixing accepted methods:', error);
    throw error;
  }
}

async function run() {
  
  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }
  
  try {
    await fixAcceptedMethods();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the fix
run();
