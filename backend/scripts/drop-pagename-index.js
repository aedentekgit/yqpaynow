/**
 * Drop pageName_1 index from pageaccesses collection
 * This index is causing E11000 duplicate key errors
 */

const mongoose = require('mongoose');

async function dropPageNameIndex() {
  try {
    
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpay';
    await mongoose.connect(MONGODB_URI);

    const db = mongoose.connection.db;
    
    // Try to drop the index directly
    try {
      const result = await db.collection('pageaccesses').dropIndex('pageName_1');
    } catch (dropError) {
      if (dropError.code === 27 || dropError.codeName === 'IndexNotFound') {
      } else {
        console.error('❌ Error dropping index:', dropError);
        throw dropError;
      }
    }

    // Also try pageAccessList.pageName_1 in case it's a nested index
    try {
      const result = await db.collection('pageaccesses').dropIndex('pageAccessList.pageName_1');
    } catch (dropError) {
      if (dropError.code === 27 || dropError.codeName === 'IndexNotFound') {
      } else {
        console.error('❌ Error dropping nested index:', dropError);
        // Don't throw - this might be expected
      }
    }

    // List all indexes to confirm
    const indexes = await db.collection('pageaccesses').indexes();
    indexes.forEach((index, i) => {
    });

    // Clean up any documents with null/empty pageName in the pageAccessList array
    const updateResult = await db.collection('pageaccesses').updateMany(
      {},
      {
        $pull: {
          pageAccessList: {
            $or: [
              { pageName: null },
              { pageName: '' },
              { pageName: { $exists: false } }
            ]
          }
        }
      }
    );

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Error message:', error.message);
    process.exit(1);
  }
}

dropPageNameIndex();

