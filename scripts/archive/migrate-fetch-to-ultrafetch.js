const fs = require('fs');
const path = require('path');

/**
 * Migrate native fetch() calls to ultraFetch() with intelligent caching
 */

const filesToMigrate = [
  'frontend-website/src/pages/auth/LoginPage.jsx',
  'frontend-website/src/pages/auth/AuthDebugPage.jsx',
  'frontend-website/src/pages/customer/CustomerFavorites.jsx',
  'frontend-website/src/pages/customer/CustomerHelpSupport.jsx',
  'frontend-website/src/pages/customer/CustomerOrderDetails.jsx',
  'frontend-website/src/pages/customer/CustomerOrderHistory.jsx',
  'frontend-website/src/pages/customer/CustomerOTPVerification.jsx',
  'frontend-website/src/pages/customer/CustomerPayment.jsx',
  'frontend-website/src/pages/customer/CustomerPhoneEntry.jsx',
  'frontend-website/src/pages/customer/CustomerCheckout.jsx',
  'frontend-website/src/pages/customer/CustomerLanding.jsx',
  'frontend-website/src/pages/theater/TheaterReports.jsx',
  'frontend-website/src/pages/theater/TheaterSettings.jsx',
  'frontend-website/src/pages/theater/SimpleProductList.jsx',
  'frontend-website/src/pages/theater/KioskViewCart.jsx',
  'frontend-website/src/pages/demo/CachingDemo.jsx',
];

function migrateFetchToUltraFetch(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Check if ultraFetch is already imported
  const hasUltraFetchImport = content.includes("from '../utils/ultraFetch'") || 
                              content.includes('from "../utils/ultraFetch"') ||
                              content.includes("from '../../utils/ultraFetch'") ||
                              content.includes('from "../../utils/ultraFetch"');

  // Add import if needed
  if (!hasUltraFetchImport && content.includes('fetch(')) {
    // Determine relative path based on file location
    const depth = filePath.split('/').length - 3; // pages/xxx/File.jsx -> 2 levels
    const relativePath = depth === 2 ? '../../utils/ultraFetch' : '../utils/ultraFetch';
    
    // Find the last import statement
    const importRegex = /import[^;]+;/g;
    const imports = content.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const importStatement = `import { ultraFetch, useUltraFetch } from '${relativePath}';\n`;
      content = content.replace(lastImport, lastImport + '\n' + importStatement);
      modified = true;
      console.log(`✓ Added ultraFetch import to ${path.basename(filePath)}`);
    }
  }

  // Pattern 1: Simple GET fetch
  // fetch(url) or fetch(`${url}`)
  const simpleGetPattern = /const\s+(\w+)\s+=\s+await\s+fetch\(([^)]+)\);?\s*const\s+(\w+)\s+=\s+await\s+\1\.json\(\);?/g;
  content = content.replace(simpleGetPattern, (match, fetchVar, url, dataVar) => {
    modified = true;
    return `const ${dataVar} = await ultraFetch(${url}, {}, { cacheTTL: 60000 });`;
  });

  // Pattern 2: Fetch with method and headers
  const fetchWithOptionsPattern = /const\s+(\w+)\s+=\s+await\s+fetch\(([^,]+),\s*({[^}]+})\);?\s*const\s+(\w+)\s+=\s+await\s+\1\.json\(\);?/g;
  content = content.replace(fetchWithOptionsPattern, (match, fetchVar, url, options, dataVar) => {
    modified = true;
    // Extract method from options if present
    const methodMatch = options.match(/method:\s*['"](\w+)['"]/);
    const method = methodMatch ? methodMatch[1] : 'GET';
    
    // Determine cache TTL based on method
    const cacheTTL = method === 'GET' ? 60000 : 0;
    
    return `const ${dataVar} = await ultraFetch(${url}, ${options}, { cacheTTL: ${cacheTTL}, staleWhileRevalidate: true });`;
  });

  // Pattern 3: Response status check pattern
  const responseCheckPattern = /const\s+(\w+)\s+=\s+await\s+fetch\(([^)]+)\);?\s*if\s*\(\s*!\1\.ok\s*\)\s*{[^}]*}/g;
  content = content.replace(responseCheckPattern, (match, responseVar, url) => {
    modified = true;
    return `const data = await ultraFetch(${url}, {}, { cacheTTL: 60000 }).catch(error => { throw new Error('Request failed'); });`;
  });

  // Save if modified
  if (modified) {
    // Create backup
    const backupPath = fullPath + '.pre-ultrafetch-backup';
    fs.writeFileSync(backupPath, fs.readFileSync(fullPath));
    
    // Save modified content
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Migrated ${path.basename(filePath)}`);
    return true;
  }

  return false;
}

// Run migration
console.log('🚀 Starting fetch() to ultraFetch() migration...\n');

let successCount = 0;
let totalFiles = filesToMigrate.length;

filesToMigrate.forEach(file => {
  if (migrateFetchToUltraFetch(file)) {
    successCount++;
  }
});

console.log(`\n✅ Migration complete!`);
console.log(`   Files migrated: ${successCount}/${totalFiles}`);
console.log(`   Backups created with .pre-ultrafetch-backup extension`);
