/**
 * Find and fix all documents with null pageName values
 */

const mongoose = require('mongoose');

async function findAndFixNullPageNames() {
  try {
    
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpay';
    await mongoose.connect(MONGODB_URI);

    const db = mongoose.connection.db;
    const collection = db.collection('pageaccesses');
    
    // Count total documents
    const totalDocs = await collection.countDocuments();
    
    // Find ALL documents (even if total is 0)
    const allDocs = await collection.find({}).toArray();
    
    if (allDocs.length > 0) {
      allDocs.forEach((doc, i) => {
        
        if (doc.pageAccessList && doc.pageAccessList.length > 0) {
          doc.pageAccessList.forEach((page, pi) => {
          });
        }
      });
    }
    
    // Check for documents with null pageName AT TOP LEVEL (old schema)
    const topLevelNull = await collection.countDocuments({
      $or: [
        { pageName: null },
        { pageName: '' },
        { pageName: { $exists: false } }
      ]
    });
    
    if (topLevelNull > 0) {
      const deleteResult = await collection.deleteMany({
        $or: [
          { pageName: null },
          { pageName: '' },
          { pageName: { $exists: false } }
        ]
      });
    }
    
    // Drop pageName_1 index if it exists
    try {
      await collection.dropIndex('pageName_1');
    } catch (err) {
    }
    
    // List final indexes
    const indexes = await collection.indexes();
    indexes.forEach((index, i) => {
    });
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Error message:', error.message);
    process.exit(1);
  }
}

findAndFixNullPageNames();

