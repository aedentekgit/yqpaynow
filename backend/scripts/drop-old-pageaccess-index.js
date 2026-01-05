/**
 * Script to drop old PageAccess indexes
 * Run this once to fix the E11000 duplicate key error
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function dropOldIndexes() {
  try {
    // Connect to MongoDB - require environment variable
    const MONGODB_URI = process.env.MONGODB_URI?.trim();
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI is not set in environment variables!');
      console.error('   Please set MONGODB_URI in backend/.env file');
      process.exit(1);
    }
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 120000,
      connectTimeoutMS: 30000,
    });


    const db = mongoose.connection.db;
    const collection = db.collection('pageaccesses');

    // Get all existing indexes
    const indexes = await collection.indexes();
    indexes.forEach(index => {
    });

    // Drop problematic indexes from old schema
    const indexesToDrop = ['role_1_page_1', 'pageName_1'];
    
    for (const indexName of indexesToDrop) {
      try {
        await collection.dropIndex(indexName);
      } catch (error) {
        if (error.codeName === 'IndexNotFound' || error.message.includes('index not found')) {
        } else {
          console.error(`\n❌ Error dropping ${indexName}:`, error.message);
          // Continue with other indexes even if one fails
        }
      }
    }

    // Verify remaining indexes
    const remainingIndexes = await collection.indexes();
    remainingIndexes.forEach(index => {
    });

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

dropOldIndexes();
