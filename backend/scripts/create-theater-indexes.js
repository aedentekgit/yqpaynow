/**
 * Create Theater Indexes Script
 * Run this to ensure all performance indexes are created in MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Theater = require('../models/Theater');

const MONGODB_URI = process.env.MONGODB_URI;

async function createIndexes() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 120000,
      connectTimeoutMS: 30000
    });
    
    
    // Create all indexes
    await Theater.createIndexes();
    
    
    // List all indexes
    const indexes = await Theater.collection.getIndexes();
    Object.keys(indexes).forEach(indexName => {
    });
    
    // Test query performance
    const startTime = Date.now();
    const theaters = await Theater.find({})
      .select('-password -__v')
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();
    const duration = Date.now() - startTime;
    
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createIndexes();
