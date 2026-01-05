/**
 * Database Migration Script: Rename "expiredOldStock" to "expiredStock"
 * 
 * This script migrates all existing database documents to use "expiredStock" instead of "expiredOldStock"
 * 
 * Usage: node backend/scripts/migrate-expired-old-stock-to-expired-stock.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Connect to MongoDB - require environment variable
const MONGODB_URI = process.env.MONGODB_URI?.trim();
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in backend/.env file');
  process.exit(1);
}

async function migrateDatabase() {
  try {
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    
    const db = mongoose.connection.db;
    const monthlyStocksCollection = db.collection('monthlystocks');
    
    // Migrate monthlystocks collection
    const monthlyDocs = await monthlyStocksCollection.find({}).toArray();
    
    let monthlyUpdatedCount = 0;
    let monthlyErrorCount = 0;
    
    for (const doc of monthlyDocs) {
      try {
        const updateFields = {};
        let hasChanges = false;
        
        // Update top-level expiredOldStock field
        if (doc.expiredOldStock !== undefined) {
          updateFields.expiredStock = doc.expiredOldStock;
          hasChanges = true;
        }
        
        // Update expiredOldStock in stockDetails array
        if (doc.stockDetails && Array.isArray(doc.stockDetails)) {
          const updatedStockDetails = doc.stockDetails.map(detail => {
            const updatedDetail = { ...detail };
            if (detail.expiredOldStock !== undefined) {
              updatedDetail.expiredStock = detail.expiredOldStock;
              delete updatedDetail.expiredOldStock;
            }
            return updatedDetail;
          });
          
          if (updatedStockDetails.some((detail, index) => detail.expiredStock !== doc.stockDetails[index]?.expiredOldStock)) {
            updateFields.stockDetails = updatedStockDetails;
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          // Remove old fields
          const unsetFields = {};
          if (doc.expiredOldStock !== undefined) {
            unsetFields.expiredOldStock = '';
          }
          
          await monthlyStocksCollection.updateOne(
            { _id: doc._id },
            {
              $set: updateFields,
              $unset: unsetFields
            }
          );
          
          monthlyUpdatedCount++;
        }
      } catch (error) {
        monthlyErrorCount++;
        console.error(`❌ Error migrating monthly stock document ${doc._id}:`, error.message);
      }
    }
    
    
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Run migration
migrateDatabase();

