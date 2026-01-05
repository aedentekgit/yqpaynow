/**
 * Force drop ALL indexes on pageaccesses collection and recreate only the correct ones
 * This will fix the pageName_1 duplicate key error
 */

const mongoose = require('mongoose');

async function forceDropAllIndexes() {
  try {
    
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpay';
    await mongoose.connect(MONGODB_URI);

    const db = mongoose.connection.db;
    const collection = db.collection('pageaccesses');
    
    // Get all indexes
    const indexes = await collection.indexes();
    indexes.forEach((index, i) => {
    });

    // Drop ALL indexes except _id_
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          await collection.dropIndex(index.name);
        } catch (err) {
          console.error(`  ❌ Failed to drop ${index.name}:`, err.message);
        }
      }
    }

    // Recreate only the correct indexes for PageAccessArray model
    
    // 1. theater (UNIQUE - one document per theater)
    await collection.createIndex({ theater: 1 }, { unique: true, name: 'theater_1' });
    
    // 2. pageAccessList.page (for quick page lookup within theater)
    await collection.createIndex({ 'pageAccessList.page': 1 }, { name: 'pageAccessList.page_1' });
    
    // 3. pageAccessList.isActive (for filtering active/inactive pages)
    await collection.createIndex({ 'pageAccessList.isActive': 1 }, { name: 'pageAccessList.isActive_1' });
    
    // 4. pageAccessList.category (for category filtering)
    await collection.createIndex({ 'pageAccessList.category': 1 }, { name: 'pageAccessList.category_1' });

    // Verify final indexes
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index, i) => {
    });

    
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Error message:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

forceDropAllIndexes();

