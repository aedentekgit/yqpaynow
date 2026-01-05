const mongoose = require('mongoose');
require('dotenv').config();
const roleService = require('../services/roleService');

/**
 * Migration Script: Add Kiosk Screen Role to All Existing Theaters
 * 
 * This script adds the default "Kiosk Screen" role to all theaters that don't have it yet.
 * Safe to run multiple times - it will skip theaters that already have the role.
 */

async function addKioskRoleToAllTheaters() {
  try {
    
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get all theaters
    const theaters = await mongoose.connection.db.collection('theaters').find({}).toArray();
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Process each theater
    for (const theater of theaters) {
      try {
        
        // Check if Kiosk Screen role already exists
        const rolesDoc = await mongoose.connection.db.collection('roles')
          .findOne({ theater: theater._id });
        
        if (rolesDoc) {
          const hasKioskRole = rolesDoc.roleList.some(role => 
            role.name === 'Kiosk Screen' && role.isDefault === true
          );
          
          if (hasKioskRole) {
            skipCount++;
            continue;
          }
        }
        
        // Create the Kiosk Screen role
        await roleService.createDefaultKioskRole(theater._id, theater.name);
        successCount++;
        
      } catch (error) {
        console.error(`   ❌ Error processing theater ${theater.name}:`, error.message);
        errorCount++;
      }
    }
    
    // Summary
    
    if (successCount > 0) {
    } else if (skipCount === theaters.length) {
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Run the migration
addKioskRoleToAllTheaters()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
