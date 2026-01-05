/**
 * Migration Script: Add Default Theater Admin Roles to Existing Theaters
 * 
 * This script creates a default "Theater Admin" role for all theaters that don't have one yet.
 * It's safe to run multiple times (idempotent).
 * 
 * Usage:
 *   node backend/migrations/add-default-theater-admin-roles.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Theater = require('../models/Theater');
const Role = require('../models/Role');
const roleService = require('../services/roleService');

// Database connection - require environment variable
const MONGODB_URI = process.env.MONGODB_URI?.trim();
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in backend/.env file');
  process.exit(1);
}
async function addDefaultRolesToExistingTheaters() {
  try {
    // Connect to database
    await mongoose.connect(MONGODB_URI);
    // Fetch all theaters
    const allTheaters = await Theater.find({ isActive: true }).select('_id name').lean();
    if (allTheaters.length === 0) {
      return;
    }

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    // Process each theater
    for (const theater of allTheaters) {
      try {

        // Check if theater already has a default role
        const existingDefaultRole = await Role.findOne({
          theater: theater._id,
          isDefault: true
        });

        if (existingDefaultRole) {

          skippedCount++;
          continue;
        }

        // Create default Theater Admin role
        const defaultRole = await roleService.createDefaultTheaterAdminRole(
          theater._id,
          theater.name
        );

        createdCount++;

      } catch (theaterError) {
        console.error(`   ❌ Error processing theater ${theater.name}:`, theaterError.message);
        errorCount++;
      }
    }

    // Summary

    if (createdCount > 0) {
      // Verify: Count theaters with default roles
      const theatersWithDefaultRoles = await Role.countDocuments({ isDefault: true });
      if (theatersWithDefaultRoles === allTheaters.length) {
      } else {
      }
    } else if (skippedCount === allTheaters.length) {
    } else {
    }

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
  }
}

// Run migration
addDefaultRolesToExistingTheaters()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
