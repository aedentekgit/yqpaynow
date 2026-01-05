const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ✅ ENFORCE: Only MongoDB Atlas (cloud) connections allowed
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in your .env file');
  console.error('   Format: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name');
  process.exit(1);
}

// Validate: Only MongoDB Atlas connections allowed
if (!MONGODB_URI.startsWith('mongodb+srv://')) {
  console.error('❌ Only MongoDB Atlas (cloud) connections are allowed!');
  console.error('   Connection string MUST start with: mongodb+srv://');
  process.exit(1);
}

// Reject localhost connections
if (MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1') || MONGODB_URI.includes('0.0.0.0')) {
  console.error('❌ Local MongoDB connections are NOT allowed!');
  console.error('   Please use a MongoDB Atlas connection string.');
  process.exit(1);
}
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'config', 'gcs-service-account.json');

async function initializeSystemSettings() {
  try {
    await mongoose.connect(MONGODB_URI);

    const db = mongoose.connection.db;
    
    // Read GCS service account
    let gcsConfig = null;
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
      gcsConfig = {
        projectId: 'fit-galaxy-472209-s4',
        bucketName: 'theater-canteen-uploads',
        credentials: {
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key
        }
      };
    } catch (err) {
    }

    // Check if system settings exist
    const existing = await db.collection('settings').findOne({ _systemSettings: true });
    
    const systemSettings = {
      _systemSettings: true,
      
      // Google Cloud Storage Configuration
      gcsConfig: existing?.gcsConfig || gcsConfig,
      
      // Firebase Configuration (from your Settings page)
      firebaseConfig: existing?.firebaseConfig || {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        measurementId: ''
      },
      
      // SMS Configuration
      smsConfig: existing?.smsConfig || {
        provider: 'twilio',
        accountSid: '',
        authToken: '',
        fromNumber: ''
      },
      
      // Email Configuration
      mailConfig: existing?.mailConfig || {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user: '',
        password: ''
      },
      
      // Database Configuration
      mongodbConfig: existing?.mongodbConfig || {
        uri: MONGODB_URI,
        poolSize: 10
      },
      
      // General System Configuration
      generalConfig: existing?.generalConfig || {
        appName: 'YQPayNow',
        version: '1.0.0',
        maintenanceMode: false
      },
      
      createdAt: existing?.createdAt || new Date(),
      lastUpdated: new Date()
    };

    if (existing) {
      await db.collection('settings').updateOne(
        { _systemSettings: true },
        { $set: systemSettings }
      );
    } else {
      await db.collection('settings').insertOne(systemSettings);
    }


    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}


initializeSystemSettings();
