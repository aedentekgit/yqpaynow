/**
 * Remove Old Route Files Script
 * 
 * WARNING: Only run this after thorough testing of all MVC routes!
 * This script will move old route files to a backup directory.
 */

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');
const backupDir = path.join(__dirname, '../routes/_old_backup');

// List of old route files that have been migrated
const migratedRoutes = [
  'theaters.js',          // ✅ Migrated to theaters.mvc.js
  'orders.js',            // ✅ Migrated to orders.mvc.js
  'settings.js',          // ✅ Migrated to settings.mvc.js
  'upload.js',            // ✅ Migrated to upload.mvc.js
  'stock.js',             // ✅ Migrated to stock.mvc.js
  'dashboard.js',         // ✅ Migrated to dashboard.mvc.js
  'payments.js',          // ✅ Migrated to payments.mvc.js
  'qrcodes.js',           // ✅ Migrated to qrcodes.mvc.js
  'qrcodenamesArray.js',  // ✅ Migrated to qrcodenames.mvc.js
  'rolesArray.js',        // ✅ Migrated to roles.mvc.js
  'pageAccessArray.js',   // ✅ Migrated to pageAccess.mvc.js
  'theaterUsersArray.js', // ✅ Migrated to theaterUsers.mvc.js
  'theater-dashboard.js'  // ✅ Migrated to theater-dashboard.mvc.js
];


// Create backup directory
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

let movedCount = 0;
let skippedCount = 0;

// Map old file names to MVC file names
const mvcFileMap = {
  'theaters.js': 'theaters.mvc.js',
  'orders.js': 'orders.mvc.js',
  'settings.js': 'settings.mvc.js',
  'upload.js': 'upload.mvc.js',
  'stock.js': 'stock.mvc.js',
  'dashboard.js': 'dashboard.mvc.js',
  'payments.js': 'payments.mvc.js',
  'qrcodes.js': 'qrcodes.mvc.js',
  'qrcodenamesArray.js': 'qrcodenames.mvc.js',
  'rolesArray.js': 'roles.mvc.js',
  'pageAccessArray.js': 'pageAccess.mvc.js',
  'theaterUsersArray.js': 'theaterUsers.mvc.js',
  'theater-dashboard.js': 'theater-dashboard.mvc.js'
};

migratedRoutes.forEach(routeFile => {
  const filePath = path.join(routesDir, routeFile);
  const backupPath = path.join(backupDir, routeFile);
  const mvcFile = mvcFileMap[routeFile] || routeFile.replace('.js', '.mvc.js');
  const mvcPath = path.join(routesDir, mvcFile);

  if (fs.existsSync(filePath)) {
    // Check for MVC file (handle different naming patterns)
    let mvcFileExists = fs.existsSync(mvcPath);
    
    // Try alternative naming patterns
    if (!mvcFileExists) {
      const altMvcFile = routeFile.replace('Array.js', '.mvc.js').replace('.js', '.mvc.js');
      const altMvcPath = path.join(routesDir, altMvcFile);
      if (fs.existsSync(altMvcPath)) {
        mvcFileExists = true;
      }
    }
    
    if (mvcFileExists) {
      try {
        // Move to backup
        fs.renameSync(filePath, backupPath);
        movedCount++;
      } catch (error) {
        console.error(`❌ Failed to move ${routeFile}:`, error.message);
      }
    } else {
      skippedCount++;
    }
  } else {
  }
});


