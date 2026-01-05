// Production migration script
const mongoose = require('mongoose');
const TheaterUserMigration = require('./theater-user-migration');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runProduction() {
  try {
    // Connect to MongoDB - require environment variable
    const MONGODB_URI = process.env.MONGODB_URI?.trim();
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI is not set in environment variables!');
      console.error('   Please set MONGODB_URI in backend/.env file');
      process.exit(1);
    }
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 120000,
      connectTimeoutMS: 30000,
    });
    // Create migration instance
    const migration = new TheaterUserMigration();

    // Run migration with backup
    const result = await migration.migrate({
      createBackup: true,
      dryRun: false
    });

    if (result.success) {
      // Verify migration
      const verification = await migration.verifyMigration();
      
      if (verification.integrityCheck) {
      } else {
      }

    } else {
    }

  } catch (error) {
    console.error('❌ Production migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

// Run production migration
runProduction();