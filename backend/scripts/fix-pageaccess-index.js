/**
 * Fix PageAccess Index Issue
 * 
 * Problem: Duplicate key error on pageName_1 index with null values
 * Solution: Drop the problematic unique index on pageName
 */

const mongoose = require('mongoose');
const PageAccessArray = require('../models/PageAccessArray');

async function fixPageAccessIndex() {
  try {
    
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpay';
    await mongoose.connect(MONGODB_URI);

    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections({ name: 'pageaccesses' }).toArray();
    
    if (collections.length === 0) {
      process.exit(0);
    }
    
    
    // Get the collection
    const collection = mongoose.connection.db.collection('pageaccesses');
    
    // List all indexes
    const indexes = await collection.indexes();
    indexes.forEach((index, i) => {
    });

    // Check if pageName_1 index exists
    const hasPageNameIndex = indexes.some(idx => idx.name === 'pageName_1');
    
    if (hasPageNameIndex) {
      try {
        await collection.dropIndex('pageName_1');
      } catch (dropError) {
        if (dropError.code === 27) {
        } else {
          throw dropError;
        }
      }
    } else {
    }

    // Check for documents with null pageName
    const nullPageNameDocs = await PageAccessArray.find({
      $or: [
        { 'pageAccessList.pageName': null },
        { 'pageAccessList.pageName': '' }
      ]
    }).lean();


    if (nullPageNameDocs.length > 0) {
      
      for (const doc of nullPageNameDocs) {
        const pagesToFix = doc.pageAccessList.filter(p => !p.pageName || p.pageName === '');
        
        pagesToFix.forEach(p => {
        });

        // Remove pages with null/empty pageName
        await PageAccessArray.updateOne(
          { _id: doc._id },
          {
            $pull: {
              pageAccessList: {
                $or: [
                  { pageName: null },
                  { pageName: '' }
                ]
              }
            }
          }
        );
      }
    }

    // Verify indexes after cleanup
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index, i) => {
    });

    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing PageAccess index:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the fix
fixPageAccessIndex();

