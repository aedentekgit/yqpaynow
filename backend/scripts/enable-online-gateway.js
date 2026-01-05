const mongoose = require('mongoose');
require('dotenv').config();

async function enableOnlineGateway() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const Theater = mongoose.model('Theater', new mongoose.Schema({}, { strict: false }));
    
    // Find the theater (update with your theater ID if needed)
    const theaterId = '6914a3db5627d93f862c933e';
    const theater = await Theater.findById(theaterId);
    
    if (!theater) {
      console.error('❌ Theater not found');
      process.exit(1);
    }


    // Copy kiosk gateway config to online gateway
    if (theater.paymentGateway?.kiosk?.razorpay) {
      
      if (!theater.paymentGateway.online) {
        theater.paymentGateway.online = {};
      }

      theater.paymentGateway.online = {
        provider: 'razorpay',
        razorpay: {
          enabled: true,
          keyId: theater.paymentGateway.kiosk.razorpay.keyId,
          keySecret: theater.paymentGateway.kiosk.razorpay.keySecret,
          testMode: theater.paymentGateway.kiosk.razorpay.testMode || false
        },
        acceptedMethods: {
          cash: false, // Online orders typically don't accept cash
          card: true,
          upi: true,
          netbanking: true,
          wallet: true
        }
      };

      await theater.save();
      
    } else {
      console.error('❌ No Razorpay configuration found in kiosk gateway');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

enableOnlineGateway();
