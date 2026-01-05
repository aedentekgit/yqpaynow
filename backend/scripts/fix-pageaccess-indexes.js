/**
 * Fix PageAccess Indexes - Drop problematic pageName index
 * Run this script to remove the old pageName index that's causing duplicate key errors
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpay';

async function fixPageAccessIndexes() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const db = mongoose.connection.db;
    const collection = db.collection('pageaccesses');

    // Get current indexes
    const indexes = await collection.indexes();
    indexes.forEach(index => {
    });

    // Drop the problematic pageName index
    try {
      await collection.dropIndex('pageName_1');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
      } else {
        console.error('❌ Error dropping index:', error.message);
      }
    }

    // Also drop any other problematic pageName indexes
    const pageNameIndexes = indexes.filter(idx => 
      idx.name && idx.name.includes('pageName') && idx.name !== '_id_'
    );
    
    for (const index of pageNameIndexes) {
      if (index.name !== 'pageName_1') {
        try {
          await collection.dropIndex(index.name);
        } catch (error) {
          console.error(`❌ Error dropping ${index.name}:`, error.message);
        }
      }
    }

    // Show final indexes
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(index => {
    });


  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Run the fix
fixPageAccessIndexes()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });

