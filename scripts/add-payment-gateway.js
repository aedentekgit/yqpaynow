const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5000'; // Your backend URL
const THEATER_NAME = 'YQ Pay Now';
const AUTH_TOKEN = 'YOUR_AUTH_TOKEN_HERE'; // Get this from localStorage or login

// Payment Gateway Config
const paymentConfig = {
  kiosk: {
    razorpay: { enabled: false, keyId: '', keySecret: '' },
    phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
    paytm: { 
      enabled: true, 
      merchantId: 'DIY12386817555501617', 
      merchantKey: 'bKMfNxPPf_QdZppa' 
    }
  },
  online: {
    razorpay: { enabled: false, keyId: '', keySecret: '' },
    phonepe: { enabled: false, merchantId: '', saltKey: '', saltIndex: '' },
    paytm: { enabled: false, merchantId: '', merchantKey: '' }
  }
};

async function addPaymentGateway() {
  try {
    // Step 1: Get all theaters
    console.log('Fetching theaters...');
    const theatersResponse = await axios.get(`${BASE_URL}/api/theaters`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const theaters = Array.isArray(theatersResponse.data) 
      ? theatersResponse.data 
      : (theatersResponse.data.theaters || theatersResponse.data.data || []);
    
    // Step 2: Find YQ Pay Now theater
    const yqPayNowTheater = theaters.find(t => t.name === THEATER_NAME);
    
    if (!yqPayNowTheater) {
      console.error(`Theater "${THEATER_NAME}" not found!`);
      console.log('Available theaters:', theaters.map(t => t.name));
      return;
    }
    
    console.log(`Found theater: ${yqPayNowTheater.name} (ID: ${yqPayNowTheater._id})`);
    
    // Step 3: Update theater with payment gateway config
    console.log('Updating payment gateway configuration...');
    const updateResponse = await axios.put(
      `${BASE_URL}/api/theaters/${yqPayNowTheater._id}`,
      { paymentGateway: paymentConfig },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Success! Payment gateway configured.');
    console.log('Configuration:', JSON.stringify(paymentConfig, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Run the script
addPaymentGateway();
