const mongoose = require('mongoose');
const PageAccess = require('../models/PageAccess'); // Old model
const PageAccessArray = require('../models/PageAccessArray'); // New model
const Theater = require('../models/Theater');

/**
 * Migration Script: Convert global page access to theater-based array structure
 * 
 * BEFORE: Individual documents per page (global)
 * AFTER: One document per theater with pageAccessList array
 */

async function migratePageAccessToTheaterBased() {
  try {
    // Load environment variables
    require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
    
    // Connect to database - use environment variable or exit with error
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
    // Step 1: Get all global pages
    const globalPages = await PageAccess.find();
    globalPages.forEach(page => {

    });
    // Step 2: Get all active theaters
    const theaters = await Theater.find({ isActive: true });
    if (theaters.length === 0) {
      process.exit(0);
    }

    // Step 3: Migrate for each theater
    let successCount = 0;
    let errorCount = 0;

    for (const theater of theaters) {

      try {
        // Find or create page access document for this theater
        let pageAccessDoc = await PageAccessArray.findOrCreateByTheater(theater._id);
        // Check if theater already has pages
        if (pageAccessDoc.pageAccessList.length > 0) {
          continue;
        }

        // Add all global pages to this theater
        let addedCount = 0;
        for (const globalPage of globalPages) {
          await pageAccessDoc.addPage({
            page: globalPage.page,
            pageName: globalPage.pageName,
            displayName: globalPage.displayName || globalPage.pageName,
            route: globalPage.route,
            category: globalPage.category || 'admin',
            description: globalPage.description || '',
            icon: globalPage.icon || '',
            requiredRoles: globalPage.requiredRoles || [],
            requiredPermissions: globalPage.requiredPermissions || [],
            showInMenu: globalPage.showInMenu !== undefined ? globalPage.showInMenu : true,
            showInSidebar: globalPage.showInSidebar !== undefined ? globalPage.showInSidebar : true,
            menuOrder: globalPage.menuOrder || 0,
            isActive: globalPage.isActive !== undefined ? globalPage.isActive : true,
            isBeta: globalPage.isBeta || false,
            requiresSubscription: globalPage.requiresSubscription || false,
            tags: globalPage.tags || [],
            version: globalPage.version || '1.0.0'
          });
          addedCount++;
        }
        successCount++;

      } catch (error) {
        console.error(`   ❌ Error migrating theater ${theater.name}:`, error.message);
        errorCount++;
      }
    }

    // Step 4: Summary
    // Step 5: Verification
    const allPageAccessDocs = await PageAccessArray.find().populate('theater', 'name');
    allPageAccessDocs.forEach(doc => {

    });

    // Step 6: Optional - Backup old data


    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migratePageAccessToTheaterBased();
