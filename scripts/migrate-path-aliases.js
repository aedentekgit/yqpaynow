/**
 * Script to migrate deep relative imports (../../) to path aliases (@components, @utils, etc.)
 * 
 * Usage: node scripts/migrate-path-aliases.js [file-path]
 * If no file path is provided, it will process all .jsx and .js files in frontend/src
 */

const fs = require('fs');
const path = require('path');

// Path alias mappings
const ALIAS_MAPPINGS = {
  '../../components/': '@components/',
  '../../utils/': '@utils/',
  '../../styles/': '@styles/',
  '../../contexts/': '@contexts/',
  '../../hooks/': '@hooks/',
  '../../config': '@config',
  '../../services/': '@services/',
  '../../pages/': '@pages/',
  '../components/': '@components/',
  '../utils/': '@utils/',
  '../styles/': '@styles/',
  '../contexts/': '@contexts/',
  '../hooks/': '@hooks/',
  '../config': '@config',
  '../services/': '@services/',
  '../pages/': '@pages/',
};

// Files to process
const filesToProcess = [];

function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('dist')) {
      findFiles(filePath, fileList);
    } else if ((file.endsWith('.jsx') || file.endsWith('.js')) && !file.includes('.test.')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function migrateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];
  
  // Process each alias mapping
  Object.entries(ALIAS_MAPPINGS).forEach(([oldPath, newAlias]) => {
    // Match import statements with the old path
    const importRegex = new RegExp(`(import\\s+.*?\\s+from\\s+['"])${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^'"]+)(['"])`, 'g');
    
    const matches = Array.from(content.matchAll(importRegex));
    for (const match of matches) {
      const fullMatch = match[0];
      const before = match[1];
      const importPath = match[2];
      const after = match[3];
      
      // Skip if already using alias
      if (fullMatch.includes('@')) {
        continue;
      }
      
      const newImport = `${before}${newAlias}${importPath}${after}`;
      content = content.replace(fullMatch, newImport);
      modified = true;
      changes.push(`${oldPath}${importPath} → ${newAlias}${importPath}`);
    }
  });
  
  // Also handle CSS imports
  const cssImportRegex = /(import\s+['"])\.\.\/\.\.\/(styles\/[^'"]+)(['"])/g;
  const cssMatches = Array.from(content.matchAll(cssImportRegex));
  for (const match of cssMatches) {
    const fullMatch = match[0];
    const before = match[1];
    const cssPath = match[2];
    const after = match[3];
    
    if (!fullMatch.includes('@')) {
      const newImport = `${before}@${cssPath}${after}`;
      content = content.replace(fullMatch, newImport);
      modified = true;
      changes.push(`${cssPath} → @${cssPath}`);
    }
  }
  
  // Handle single-level relative imports (../)
  const singleLevelRegex = /(import\s+.*?\s+from\s+['"])\.\.\/(components|utils|styles|contexts|hooks|config|services|pages)\/([^'"]+)(['"])/g;
  const singleMatches = Array.from(content.matchAll(singleLevelRegex));
  for (const match of singleMatches) {
    const fullMatch = match[0];
    const before = match[1];
    const category = match[2];
    const importPath = match[3];
    const after = match[4];
    
    if (!fullMatch.includes('@')) {
      const newAlias = `@${category}/`;
      const newImport = `${before}${newAlias}${importPath}${after}`;
      content = content.replace(fullMatch, newImport);
      modified = true;
      changes.push(`../${category}/${importPath} → ${newAlias}${importPath}`);
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { modified: true, changes };
  }
  
  return { modified: false, changes: [] };
}

// Main execution
const targetFile = process.argv[2];

if (targetFile) {
  // Process single file
  if (fs.existsSync(targetFile)) {
    const result = migrateImports(targetFile);
    if (result.modified) {
      console.log(`✅ Migrated: ${targetFile}`);
      result.changes.forEach(change => console.log(`   ${change}`));
    } else {
      console.log(`ℹ️  No changes needed: ${targetFile}`);
    }
  } else {
    console.error(`❌ File not found: ${targetFile}`);
    process.exit(1);
  }
} else {
  // Process all files
  const srcDir = path.join(__dirname, '../frontend/src');
  const files = findFiles(srcDir);
  
  console.log(`📁 Found ${files.length} files to process...\n`);
  
  let totalModified = 0;
  let totalChanges = 0;
  
  files.forEach(file => {
    const result = migrateImports(file);
    if (result.modified) {
      totalModified++;
      totalChanges += result.changes.length;
      const relativePath = path.relative(srcDir, file);
      console.log(`✅ ${relativePath} (${result.changes.length} changes)`);
    }
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files modified: ${totalModified}/${files.length}`);
  console.log(`   Total changes: ${totalChanges}`);
}

