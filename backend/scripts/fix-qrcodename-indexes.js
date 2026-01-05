const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

async function fixIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const collection = mongoose.connection.collection('qrcodenames');
    const indexes = await collection.indexes();

    // List of indexes to drop (from old schema)
    const indexesToDrop = [
      'normalizedName_1',
      'theater_1_isActive_1'
    ];

    for (const indexName of indexesToDrop) {
      if (indexes.find(idx => idx.name === indexName)) {
        await collection.dropIndex(indexName);
      } else {
      }
    }

    // Check remaining indexes
    const remainingIndexes = await collection.indexes();

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixIndexes();
