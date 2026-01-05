/**
 * Migration Script: Update QR Code URLs from localhost to IP address
 * This script updates all existing QR codes in the database to use IP address instead of localhost
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://192.168.1.6:27017/theater_canteen_db';
const OLD_URL = 'http://localhost:3001';
const NEW_URL = 'http://192.168.1.6:3001';

async function updateQRUrls() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    
    // Get the singleqrcodes collection
    const collection = db.collection('singleqrcodes');
    
    // Find all documents with localhost URLs
    const qrCodes = await collection.find({
      $or: [
        { qrCodeUrl: { $regex: 'localhost' } },
        { qrCodeData: { $regex: 'localhost' } }
      ]
    }).toArray();
    if (qrCodes.length === 0) {
      return;
    }
    
    let updateCount = 0;
    let errorCount = 0;
    
    for (const qr of qrCodes) {
      try {
        const updates = {};
        
        // Update qrCodeUrl if it contains localhost
        if (qr.qrCodeUrl && qr.qrCodeUrl.includes('localhost')) {
          updates.qrCodeUrl = qr.qrCodeUrl.replace(/localhost/g, '192.168.1.6');
        }
        
        // Update qrCodeData if it contains localhost
        if (qr.qrCodeData && qr.qrCodeData.includes('localhost')) {
          updates.qrCodeData = qr.qrCodeData.replace(/localhost/g, '192.168.1.6');
        }
        
        if (Object.keys(updates).length > 0) {
          await collection.updateOne(
            { _id: qr._id },
            { $set: updates }
          );
          
          updateCount++;


        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error updating QR ${qr._id}:`, error.message);
      }
    }
    if (updateCount > 0) {
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Run the migration
updateQRUrls()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
