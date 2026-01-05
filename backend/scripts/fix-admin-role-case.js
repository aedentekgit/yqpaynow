/**
 * Database Migration: Normalize Admin Roles to Lowercase
 * 
 * This script fixes the case sensitivity issue in admin roles by converting
 * all role values in the admins collection to lowercase.
 * 
 * Issue: Admins were created with "Super_admin" or other case variations,
 * but the authentication checks expect "super_admin" (lowercase).
 * 
 * Fix: Convert all admin.role values to lowercase for consistency.
 * 
 * Usage: node backend/scripts/fix-admin-role-case.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yqpaynow';

async function normalizeAdminRoles() {
  try {
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    
    const db = mongoose.connection.db;
    const adminsCollection = db.collection('admins');
    
    // Find all admins
    const admins = await adminsCollection.find({}).toArray();
    
    if (admins.length === 0) {
      await mongoose.disconnect();
      return;
    }
    
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Process each admin
    for (const admin of admins) {
      const originalRole = admin.role || '';
      const normalizedRole = originalRole.toLowerCase();
      
      // Check if role needs updating
      if (originalRole !== normalizedRole) {
        
        // Update the role
        await adminsCollection.updateOne(
          { _id: admin._id },
          { 
            $set: { 
              role: normalizedRole,
              updatedAt: new Date()
            } 
          }
        );
        
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
    
    
    // Disconnect
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the migration
normalizeAdminRoles()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

