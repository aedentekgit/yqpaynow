/**
 * Database Migration Script: Rename "carryForward" to "oldStock"
 * 
 * This script migrates all existing database documents to use "oldStock" instead of "carryForward"
 * 
 * Usage: node backend/scripts/migrate-carry-forward-to-old-stock.js
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
    const collection = db.collection('monthlystocks');
    
    // Get all documents
    const documents = await collection.find({}).toArray();
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const doc of documents) {
      try {
        const updateFields = {};
        let hasChanges = false;
        
        // Update top-level carryForward field
        if (doc.carryForward !== undefined) {
          updateFields.oldStock = doc.carryForward;
          hasChanges = true;
        }
        
        // Update expiredCarryForwardStock
        if (doc.expiredCarryForwardStock !== undefined) {
          updateFields.expiredOldStock = doc.expiredCarryForwardStock;
          hasChanges = true;
        }
        
        // Update usedCarryForwardStock
        if (doc.usedCarryForwardStock !== undefined) {
          updateFields.usedOldStock = doc.usedCarryForwardStock;
          hasChanges = true;
        }
        
        // Update carryForward in stockDetails array
        if (doc.stockDetails && Array.isArray(doc.stockDetails)) {
          const updatedStockDetails = doc.stockDetails.map(detail => {
            const updatedDetail = { ...detail };
            if (detail.carryForward !== undefined) {
              updatedDetail.oldStock = detail.carryForward;
              delete updatedDetail.carryForward;
            }
            return updatedDetail;
          });
          
          if (updatedStockDetails.some((detail, index) => detail.oldStock !== doc.stockDetails[index]?.carryForward)) {
            updateFields.stockDetails = updatedStockDetails;
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          // Remove old fields
          const unsetFields = {};
          if (doc.carryForward !== undefined) {
            unsetFields.carryForward = '';
          }
          if (doc.expiredCarryForwardStock !== undefined) {
            unsetFields.expiredCarryForwardStock = '';
          }
          if (doc.usedCarryForwardStock !== undefined) {
            unsetFields.usedCarryForwardStock = '';
          }
          
          await collection.updateOne(
            { _id: doc._id },
            {
              $set: updateFields,
              $unset: unsetFields
            }
          );
          
          updatedCount++;
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating document ${doc._id}:`, error.message);
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

