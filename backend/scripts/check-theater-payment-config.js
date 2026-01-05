/**
 * Check Theater Payment Gateway Configuration
 * 
 * Run: node backend/scripts/check-theater-payment-config.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return false;
  }
}

async function checkTheaters() {
  try {
    const Theater = require(path.join(__dirname, '../models/Theater'));
    
    const theaters = await Theater.find({});
    
    for (const theater of theaters) {
      
      // Check KIOSK gateway
      if (theater.paymentGateway?.kiosk) {
        const kiosk = theater.paymentGateway.kiosk;
        
        if (kiosk.provider === 'razorpay' && kiosk.razorpay) {
        }
        
        if (kiosk.acceptedMethods) {
        } else {
        }
      } else {
      }
      
      // Check ONLINE gateway
      if (theater.paymentGateway?.online) {
        const online = theater.paymentGateway.online;
        
        if (online.provider === 'razorpay' && online.razorpay) {
        }
        
        if (online.acceptedMethods) {
        } else {
        }
      } else {
      }
      
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

async function run() {
  
  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }
  
  try {
    await checkTheaters();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
