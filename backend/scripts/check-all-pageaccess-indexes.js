/**
 * Check all PageAccess-related collections and their indexes
 */

const mongoose = require('mongoose');

async function checkAllIndexes() {
  try {
    
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpay';
    await mongoose.connect(MONGODB_URI);

    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    collections.forEach((coll, i) => {
    });

    // Check indexes on all pageaccess-related collections
    const pageAccessCollections = ['pageaccesses', 'pageaccesses_old', 'pageaccessarrays'];
    
    for (const collName of pageAccessCollections) {
      const exists = collections.some(c => c.name === collName);
      
      if (!exists) {
        continue;
      }
      
      const collection = db.collection(collName);
      const indexes = await collection.indexes();
      
      indexes.forEach((index, i) => {
      });
      
      // Check for documents
      const count = await collection.countDocuments();
      
      // If pageName_1 index exists, show sample documents
      const hasPageNameIndex = indexes.some(idx => idx.name === 'pageName_1');
      if (hasPageNameIndex) {
        
        // Check for null pageName
        const nullCount = await collection.countDocuments({ pageName: null });
        
        if (nullCount > 0) {
          const samples = await collection.find({ pageName: null }).limit(3).toArray();
          samples.forEach((doc, i) => {
          });
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error checking indexes:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

checkAllIndexes();

