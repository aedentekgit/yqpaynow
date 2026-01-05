/**
 * Setup Razorpay Test Credentials for All Theaters
 * 
 * This script adds Razorpay test credentials to all theaters
 * for both KIOSK/POS and ONLINE channels
 * 
 * Usage: node backend/scripts/setup-razorpay-test-credentials.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables from backend directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Razorpay Test Credentials (Standard Test Keys)
const RAZORPAY_TEST_CREDENTIALS = {
  keyId: 'rzp_test_1DP5mmOlF5M5dp',
  keySecret: '3KgeNoLSHqk7L0XmXqgJ5Xqg',
  webhookSecret: 'test_webhook_secret_12345'
};

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  setupPaymentGateways();
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

async function setupPaymentGateways() {
  try {
    const Theater = require(path.join(__dirname, '../models/Theater'));
    
    // Get all theaters
    const theaters = await Theater.find({});
    
    if (theaters.length === 0) {
      process.exit(0);
    }
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const theater of theaters) {
      
      // Initialize paymentGateway if it doesn't exist
      if (!theater.paymentGateway) {
        theater.paymentGateway = {};
      }
      
      // Setup KIOSK/POS Channel
      if (!theater.paymentGateway.kiosk) {
        theater.paymentGateway.kiosk = {};
      }
      
      // Setup ONLINE Channel
      if (!theater.paymentGateway.online) {
        theater.paymentGateway.online = {};
      }
      
      let theaterUpdated = false;
      
      // Configure KIOSK Channel
      if (!theater.paymentGateway.kiosk.enabled || !theater.paymentGateway.kiosk.razorpay?.enabled) {
        theater.paymentGateway.kiosk.enabled = true;
        theater.paymentGateway.kiosk.provider = 'razorpay';
        theater.paymentGateway.kiosk.razorpay = {
          enabled: true,
          keyId: RAZORPAY_TEST_CREDENTIALS.keyId,
          keySecret: RAZORPAY_TEST_CREDENTIALS.keySecret,
          webhookSecret: RAZORPAY_TEST_CREDENTIALS.webhookSecret,
          testMode: true
        };
        theater.paymentGateway.kiosk.acceptedMethods = {
          cash: true,
          card: true,
          upi: true,
          netbanking: false,
          wallet: false
        };
        theater.paymentGateway.kiosk.configuredAt = new Date();
        theaterUpdated = true;
      } else {
      }
      
      // Configure ONLINE Channel
      if (!theater.paymentGateway.online.enabled || !theater.paymentGateway.online.razorpay?.enabled) {
        theater.paymentGateway.online.enabled = true;
        theater.paymentGateway.online.provider = 'razorpay';
        theater.paymentGateway.online.razorpay = {
          enabled: true,
          keyId: RAZORPAY_TEST_CREDENTIALS.keyId,
          keySecret: RAZORPAY_TEST_CREDENTIALS.keySecret,
          webhookSecret: RAZORPAY_TEST_CREDENTIALS.webhookSecret,
          testMode: true
        };
        theater.paymentGateway.online.acceptedMethods = {
          cash: false,
          card: true,
          upi: true,
          netbanking: true,
          wallet: false
        };
        theater.paymentGateway.online.configuredAt = new Date();
        theaterUpdated = true;
      } else {
      }
      
      if (theaterUpdated) {
        await theater.save();
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
    
    
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up payment gateways:', error);
    process.exit(1);
  }
}

