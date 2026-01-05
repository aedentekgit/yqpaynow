#!/usr/bin/env node

/**
 * Installation Script for Print Packages
 * This script installs required packages for automatic printing functionality
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');


const packages = [
  'node-thermal-printer@^4.4.0',
  'puppeteer@^21.6.1'
];

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packages.forEach(pkg => console.log(`   - ${pkg}`));

// Check if packages are already installed
let allInstalled = true;
packages.forEach(pkg => {
  const pkgName = pkg.split('@')[0];
  if (!packageJson.dependencies[pkgName]) {
    allInstalled = false;
  }
});

if (allInstalled) {
}

try {
  
  // Install packages
  packages.forEach((pkg, index) => {
    const pkgName = pkg.split('@')[0];
    try {
      execSync(`npm install ${pkg} --save`, {
        stdio: 'inherit',
        cwd: __dirname
      });
    } catch (error) {
      console.error(`❌ Failed to install ${pkgName}`);
      console.error(`   Error: ${error.message}\n`);
      throw error;
    }
  });


} catch (error) {
  console.error('\n❌ Installation failed!');
  console.error('\n💡 Troubleshooting:');
  console.error('   1. Make sure you have npm installed');
  console.error('   2. Try running: npm install --legacy-peer-deps');
  console.error('   3. For puppeteer issues, see: backend/INSTALL_PRINT_PACKAGES.md');
  console.error('\n   Error details:', error.message);
  process.exit(1);
}

