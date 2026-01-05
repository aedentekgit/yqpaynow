/**
 * Add GST Number to Existing Theater
 * This script updates the existing theater with a GST Number
 */

const mongoose = require('mongoose');
const Theater = require('../models/Theater');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

async function addGSTNumber() {
  
  try {
    // Find the theater
    const theaterName = 'YQPAY NOW';
    
    const theater = await Theater.findOne({ name: theaterName });
    
    if (!theater) {
      return;
    }
    
    
    // Add GST Number
    const newGstNumber = '33AAAAA9999A1Z7'; // Valid GST format for Tamil Nadu (33)
    
    
    const updatedTheater = await Theater.findByIdAndUpdate(
      theater._id,
      { 
        gstNumber: newGstNumber,
        // Keep existing FSSAI number or add if not present
        fssaiNumber: theater.fssaiNumber || '12345678901234'
      },
      { new: true, runValidators: true }
    );
    
    
    // Verify the update
    const verifiedTheater = await Theater.findById(theater._id).lean();
    
    if (verifiedTheater.gstNumber === newGstNumber) {
    } else {
    }
    
    
  } catch (error) {
    console.error('❌ Error during update:', error);
    if (error.errors) {
      console.error('Validation errors:');
      Object.keys(error.errors).forEach(key => {
        console.error(`  - ${key}: ${error.errors[key].message}`);
      });
    }
  } finally {
    await mongoose.connection.close();
  }
}

async function run() {
  try {
    await connectDB();
    await addGSTNumber();
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
  process.exit(0);
}

run();

