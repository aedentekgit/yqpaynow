/**
 * Debug script to check category imageUrl in database
 * Usage: node scripts/check-category-imageurl.js <theaterId>
 */

const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

async function checkCategoryImageUrl(theaterId) {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/yqpay';
    await mongoose.connect(mongoUri);

    // Convert theaterId to ObjectId if it's a string
    const theaterObjectId = mongoose.Types.ObjectId.isValid(theaterId) 
      ? new mongoose.Types.ObjectId(theaterId)
      : theaterId;


    // Query using Mongoose
    const categoryDoc = await Category.findOne({ theater: theaterObjectId });
    
    if (!categoryDoc) {
      await mongoose.disconnect();
      return;
    }


    // Check each category
    categoryDoc.categoryList.forEach((cat, index) => {
      
      // Try toObject()
      const plainCat = cat.toObject ? cat.toObject({ minimize: false }) : {};
      
      // Try JSON.stringify
      try {
        const jsonCat = JSON.parse(JSON.stringify(cat));
      } catch (e) {
      }
      
      // Check all fields
      const allFields = cat.toObject ? Object.keys(cat.toObject({ minimize: false })) : [];
    });

    // Also query directly using MongoDB native driver
    const db = mongoose.connection.db;
    const collection = db.collection('categories');
    const rawDoc = await collection.findOne({ theater: theaterObjectId });
    
    if (rawDoc && rawDoc.categoryList) {
      rawDoc.categoryList.forEach((cat, index) => {
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Get theaterId from command line
const theaterId = process.argv[2];

if (!theaterId) {
  console.error('❌ Please provide a theaterId');
  process.exit(1);
}

checkCategoryImageUrl(theaterId);

