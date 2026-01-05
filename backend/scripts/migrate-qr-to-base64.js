/**
 * Migration Script: Convert QR Code URLs to Base64 Data URLs
 * 
 * This script regenerates all QR codes that are currently using
 * fake GCS mock URLs and converts them to base64 data URLs that
 * display correctly in the browser.
 * 
 * Run with: node scripts/migrate-qr-to-base64.js
 */

const mongoose = require('mongoose');
const { generateQRCodeImage } = require('../utils/qrCodeGenerator');
const path = require('path');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aedentekuiuxdesigner:Aedentek%40123%23@cluster0.vrj9qje.mongodb.net/yqpay';

async function migrateQRCodes() {
  try {
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const qrCodesCollection = db.collection('singleqrcodes');
    
    // Find all QR codes with mock URLs (check nested structure)
    const qrCodes = await qrCodesCollection.find({}).toArray();
    
    // Filter for those with mock URLs
    const qrCodesToMigrate = qrCodes.filter(qr => {
      if (!qr.qrDetails || !qr.qrDetails[0] || !qr.qrDetails[0].seats) {
        return false;
      }
      return qr.qrDetails[0].seats.some(seat => 
        seat.qrCodeUrl && seat.qrCodeUrl.includes('mock')
      );
    });
    
    
    if (qrCodesToMigrate.length === 0) {
      process.exit(0);
    }
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const qrCode of qrCodesToMigrate) {
      try {
        
        const qrDetail = qrCode.qrDetails[0];
        if (!qrDetail || !qrDetail.seats) {
          continue;
        }
        
        // Update each seat's QR code
        for (const seat of qrDetail.seats) {
          if (!seat.qrCodeData || !seat.qrCodeUrl.includes('mock')) {
            continue;
          }
          
          
          // Generate new QR code as base64
          const imageBuffer = await generateQRCodeImage(seat.qrCodeData, {
            width: 500,
            margin: 2,
            darkColor: '#7c3aed',
            lightColor: '#FFFFFF'
          });
          
          // Convert to base64 data URL
          const base64Data = imageBuffer.toString('base64');
          const dataUrl = `data:image/png;base64,${base64Data}`;
          
          // Update seat QR code URL
          seat.qrCodeUrl = dataUrl;
          seat.updatedAt = new Date();
          
        }
        
        // Save updated QR code
        await qrCodesCollection.updateOne(
          { _id: qrCode._id },
          { $set: { qrDetails: qrCode.qrDetails } }
        );
        
        updatedCount++;
        
      } catch (error) {
        console.error(`   ❌ Error processing QR Code:`, error.message);
        errorCount++;
      }
    }
    
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateQRCodes();
