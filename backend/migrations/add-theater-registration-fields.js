/**
 * Migration Script: Add GST, FSSAI, and Unique Number fields to existing theaters
 * 
 * This script adds three new optional fields to all existing theater documents:
 * - gstNumber: GST registration number (15 characters)
 * - fssaiNumber: FSSAI license number (14 digits)
 * - uniqueNumber: Custom unique identifier
 * 
 * Usage: node migrations/add-theater-registration-fields.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpaynow';

async function migrateTheaters() {
  try {
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const Theater = mongoose.model('Theater', new mongoose.Schema({}, { strict: false }));
    
    // Get all theaters
    const theaters = await Theater.find({}).select('_id name gstNumber fssaiNumber uniqueNumber');

    if (theaters.length === 0) {
      await mongoose.disconnect();
      return;
    }

    // Check existing fields
    let theatersWithGST = 0;
    let theatersWithFSSAI = 0;
    let theatersWithUnique = 0;
    let theatersNeedingUpdate = 0;

    theaters.forEach(theater => {
      if (theater.gstNumber) theatersWithGST++;
      if (theater.fssaiNumber) theatersWithFSSAI++;
      if (theater.uniqueNumber) theatersWithUnique++;
      if (!theater.gstNumber && !theater.fssaiNumber && !theater.uniqueNumber) {
        theatersNeedingUpdate++;
      }
    });


    // Update theaters that don't have these fields
    const updateResult = await Theater.updateMany(
      {
        $or: [
          { gstNumber: { $exists: false } },
          { fssaiNumber: { $exists: false } },
          { uniqueNumber: { $exists: false } }
        ]
      },
      {
        $set: {
          gstNumber: null,
          fssaiNumber: null,
          uniqueNumber: null
        }
      }
    );


    // Show sample theater with new fields
    const sampleTheater = await Theater.findOne({}).select('name gstNumber fssaiNumber uniqueNumber').lean();
    if (sampleTheater) {
    }


    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateTheaters();
