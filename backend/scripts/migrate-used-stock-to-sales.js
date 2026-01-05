/**
 * Database Migration Script: Rename "usedStock" to "sales"
 * 
 * This script migrates all existing database documents to use "sales" instead of "usedStock"
 * 
 * Usage: node backend/scripts/migrate-used-stock-to-sales.js
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
    const stocksCollection = db.collection('stocks');
    
    // Migrate monthlystocks collection
    const monthlyDocs = await monthlyStocksCollection.find({}).toArray();
    
    let monthlyUpdatedCount = 0;
    let monthlyErrorCount = 0;
    
    for (const doc of monthlyDocs) {
      try {
        const updateFields = {};
        let hasChanges = false;
        
        // Update top-level totalUsedStock field
        if (doc.totalUsedStock !== undefined) {
          updateFields.totalSales = doc.totalUsedStock;
          hasChanges = true;
        }
        
        // Update usedStock in stockDetails array
        if (doc.stockDetails && Array.isArray(doc.stockDetails)) {
          const updatedStockDetails = doc.stockDetails.map(detail => {
            const updatedDetail = { ...detail };
            if (detail.usedStock !== undefined) {
              updatedDetail.sales = detail.usedStock;
              delete updatedDetail.usedStock;
            }
            return updatedDetail;
          });
          
          if (updatedStockDetails.some((detail, index) => detail.sales !== doc.stockDetails[index]?.usedStock)) {
            updateFields.stockDetails = updatedStockDetails;
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          // Remove old fields
          const unsetFields = {};
          if (doc.totalUsedStock !== undefined) {
            unsetFields.totalUsedStock = '';
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
    
    // Migrate stocks collection (if it exists)
    const stockDocs = await stocksCollection.find({}).toArray();
    
    let stockUpdatedCount = 0;
    let stockErrorCount = 0;
    
    for (const doc of stockDocs) {
      try {
        const updateFields = {};
        let hasChanges = false;
        
        // Update displayData.usedStock
        if (doc.displayData && doc.displayData.usedStock !== undefined) {
          if (!updateFields.displayData) {
            updateFields.displayData = { ...doc.displayData };
          }
          updateFields.displayData.sales = doc.displayData.usedStock;
          delete updateFields.displayData.usedStock;
          hasChanges = true;
        }
        
        if (hasChanges) {
          // Remove old fields
          const unsetFields = {};
          if (doc.displayData && doc.displayData.usedStock !== undefined) {
            unsetFields['displayData.usedStock'] = '';
          }
          
          await stocksCollection.updateOne(
            { _id: doc._id },
            {
              $set: updateFields,
              $unset: unsetFields
            }
          );
          
          stockUpdatedCount++;
        }
      } catch (error) {
        stockErrorCount++;
        console.error(`❌ Error migrating stock document ${doc._id}:`, error.message);
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

