const fs = require('fs');
const path = require('path');

/**
 * Fix incorrect import paths for ultraPerformance and ultraFetch
 * Theater pages need ../../utils/ but had ../utils/
 */

const filesToFix = [
  'frontend-website/src/pages/theater/AddProduct.jsx',
  'frontend-website/src/pages/theater/KioskCheckout.jsx',
  'frontend-website/src/pages/theater/KioskOrderHistory.jsx',
  'frontend-website/src/pages/theater/KioskPayment.jsx',
  'frontend-website/src/pages/theater/OfflinePOSInterface.jsx',
  'frontend-website/src/pages/theater/OnlineOrderHistory.jsx',
  'frontend-website/src/pages/theater/OnlinePOSInterface.jsx',
  'frontend-website/src/pages/theater/ProfessionalPOSInterface.jsx',
  'frontend-website/src/pages/theater/StockManagement.jsx',
  'frontend-website/src/pages/theater/TheaterBanner.jsx',
  'frontend-website/src/pages/theater/TheaterDashboard.jsx',
  'frontend-website/src/pages/theater/TheaterGenerateQR.jsx',
  'frontend-website/src/pages/theater/TheaterKioskTypes.jsx',
  'frontend-website/src/pages/theater/TheaterMessages.jsx',
  'frontend-website/src/pages/theater/TheaterOrderHistory.jsx',
  'frontend-website/src/pages/theater/TheaterOrderInterface.jsx',
  'frontend-website/src/pages/theater/TheaterPageAccess.jsx',
  'frontend-website/src/pages/theater/TheaterProductList.jsx',
  'frontend-website/src/pages/theater/TheaterProductTypes.jsx',
  'frontend-website/src/pages/theater/TheaterQRCodeNames.jsx',
  'frontend-website/src/pages/theater/TheaterQRManagement.jsx',
  'frontend-website/src/pages/theater/TheaterRoleAccess.jsx',
  'frontend-website/src/pages/theater/TheaterRoles.jsx',
  'frontend-website/src/pages/theater/TheaterUserManagement.jsx',
  'frontend-website/src/pages/theater/ViewCart.jsx',
];

function fixImportPaths(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Fix ultraPerformance import
  if (content.includes("from '../utils/ultraPerformance'")) {
    content = content.replace(
      /from ['"]\.\.\/utils\/ultraPerformance['"]/g,
      "from '../../utils/ultraPerformance'"
    );
    modified = true;
  }

  // Fix ultraFetch import
  if (content.includes("from '../utils/ultraFetch'")) {
    content = content.replace(
      /from ['"]\.\.\/utils\/ultraFetch['"]/g,
      "from '../../utils/ultraFetch'"
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Fixed: ${path.basename(filePath)}`);
    return true;
  }

  return false;
}

// Run fixes
console.log('🔧 Fixing incorrect import paths in theater pages...\n');

let fixedCount = 0;
filesToFix.forEach(file => {
  if (fixImportPaths(file)) {
    fixedCount++;
  }
});

console.log(`\n✅ Fixed ${fixedCount} files with incorrect import paths`);
