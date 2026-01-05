/**
 * Save GCS Configuration from Service Account File to Database
 * This script reads the service account JSON file and saves it to the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in your .env file');
  console.error('   Expected location: backend/.env');
  process.exit(1);
}
const SERVICE_ACCOUNT_FILE = path.join(__dirname, '../config/fit-galaxy-472209-s4-3badbe9634f2.json');
const BUCKET_NAME = 'theater-canteen-uploads';
const PROJECT_ID = 'fit-galaxy-472209-s4';
const REGION = 'us-central1'; // or asia-south1

async function saveGCSConfig() {
  try {
    
    // Step 1: Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    // Step 2: Read service account file
    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
      throw new Error(`Service account file not found: ${SERVICE_ACCOUNT_FILE}`);
    }
    
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'));
    
    // Step 3: Prepare GCS config
    const gcsConfig = {
      projectId: PROJECT_ID,
      bucketName: BUCKET_NAME,
      region: REGION,
      folder: 'theater list', // Default upload folder
      credentials: {
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
        clientId: serviceAccount.client_id,
        privateKeyId: serviceAccount.private_key_id
      },
      keyFilename: path.relative(path.join(__dirname, '..'), SERVICE_ACCOUNT_FILE)
    };
    
    
    // Step 4: Get or create system settings document
    const db = mongoose.connection.db;
    
    let systemDoc = await db.collection('settings').findOne({ _systemSettings: true });
    
    if (!systemDoc) {
      const result = await db.collection('settings').insertOne({
        _systemSettings: true,
        createdAt: new Date(),
        lastUpdated: new Date()
      });
      systemDoc = { _id: result.insertedId };
    } else {
    }
    
    // Step 5: Save GCS config to database
    const updateResult = await db.collection('settings').findOneAndUpdate(
      { _id: systemDoc._id },
      {
        $set: {
          'gcsConfig': gcsConfig,
          lastUpdated: new Date()
        }
      },
      { 
        returnDocument: 'after',
        upsert: false
      }
    );
    
    if (!updateResult) {
      throw new Error('Failed to update settings document');
    }
    
    
    // Step 6: Verify saved configuration
    const verified = await db.collection('settings').findOne({ _id: systemDoc._id });
    
    const savedGcsConfig = verified.gcsConfig || {};
    
    
    if (savedGcsConfig.credentials) {
    }
    
    // Final verification
    if (savedGcsConfig.projectId && savedGcsConfig.bucketName && savedGcsConfig.credentials && 
        savedGcsConfig.credentials.clientEmail && savedGcsConfig.credentials.privateKey) {
    } else {
      if (!savedGcsConfig.projectId) console.log('      - Project ID');
      if (!savedGcsConfig.bucketName) console.log('      - Bucket Name');
      if (!savedGcsConfig.credentials) console.log('      - Credentials object');
      else {
        if (!savedGcsConfig.credentials.clientEmail) console.log('      - Client Email');
        if (!savedGcsConfig.credentials.privateKey) console.log('      - Private Key');
      }
    }
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignore
    }
    
    process.exit(1);
  }
}

saveGCSConfig();

