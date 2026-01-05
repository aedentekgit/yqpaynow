/**
 * Cleanup Script for Old Route Files
 * 
 * This script helps identify and optionally remove old route files
 * after MVC migration is complete and tested.
 * 
 * WARNING: Only run this after thorough testing!
 */

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');
const oldRoutes = [
  'theaters.js',      // Replaced by theaters.mvc.js
  'orders.js',        // Replaced by orders.mvc.js
  // 'products.js',   // Keep for categories/productTypes
];


oldRoutes.forEach(routeFile => {
  const filePath = path.join(routesDir, routeFile);
  const mvcFile = routeFile.replace('.js', '.mvc.js');
  const mvcPath = path.join(routesDir, mvcFile);

  if (fs.existsSync(filePath)) {
    if (fs.existsSync(mvcPath)) {
    } else {
    }
  } else {
  }
});


