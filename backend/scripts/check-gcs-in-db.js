/**
 * Check GCS Configuration in Database
 * Directly inspects what's saved in the database
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in your .env file');
  console.error('   Expected location: backend/.env');
  process.exit(1);
}

async function checkGCSConfig() {
  try {
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    
    // Find system settings document
    const settingsDoc = await db.collection('settings').findOne({ _systemSettings: true });
    
    if (!settingsDoc) {
      
      // Check for any settings documents
      const allSettings = await db.collection('settings').find({}).toArray();
      allSettings.forEach((doc, index) => {
        if (doc.gcsConfig) {
        }
      });
      
      await mongoose.disconnect();
      return;
    }
    
    
    const gcsConfig = settingsDoc.gcsConfig || {};
    
    
    if (gcsConfig.credentials) {
      const creds = gcsConfig.credentials;
    } else {
    }
    
    // Check last updated
    if (settingsDoc.lastUpdated) {
    }
    
    if (gcsConfig.projectId && gcsConfig.bucketName && gcsConfig.credentials && 
        (gcsConfig.credentials.clientEmail || gcsConfig.credentials.client_email) &&
        (gcsConfig.credentials.privateKey || gcsConfig.credentials.private_key)) {
    } else {
      if (!gcsConfig.projectId) console.log('      - Project ID');
      if (!gcsConfig.bucketName) console.log('      - Bucket Name');
      if (!gcsConfig.credentials) console.log('      - Credentials object');
      else {
        if (!gcsConfig.credentials.clientEmail && !gcsConfig.credentials.client_email) console.log('      - Client Email');
        if (!gcsConfig.credentials.privateKey && !gcsConfig.credentials.private_key) console.log('      - Private Key');
      }
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore
    }
  }
}

if (require.main === module) {
  checkGCSConfig().then(() => {
    process.exit(0);
  });
}

module.exports = { checkGCSConfig };

