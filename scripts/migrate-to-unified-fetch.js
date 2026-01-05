/**
 * 🔄 Migration Script: Consolidate Fetch Utilities
 * 
 * Migrates from ultraFetch/optimizedFetch/fastFetch to unifiedFetch
 * 
 * Usage:
 *   node scripts/migrate-to-unified-fetch.js [--dry-run] [--file=path/to/file]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const fileArg = args.find(arg => arg.startsWith('--file='));
const targetFile = fileArg ? fileArg.split('=')[1] : null;

const stats = {
  filesProcessed: 0,
  importsReplaced: 0,
  callsReplaced: 0,
  filesModified: 0
};

// Migration patterns
const migrations = [
  // Import replacements
  {
    name: 'ultraFetch import',
    find: /import\s+{\s*ultraFetch\s*}\s+from\s+['"]([^'"]*ultraFetch)['"]/g,
    replace: (match, importPath) => {
      const relativePath = importPath.includes('../') ? importPath : '../utils/unifiedFetch';
      return `import { unifiedFetch } from '${relativePath}'`;
    }
  },
  {
    name: 'optimizedFetch import',
    find: /import\s+{\s*optimizedFetch\s*}\s+from\s+['"]([^'"]*apiOptimizer)['"]/g,
    replace: (match, importPath) => {
      const relativePath = importPath.includes('../') ? importPath : '../utils/unifiedFetch';
      return `import { unifiedFetch } from '${relativePath}'`;
    }
  },
  {
    name: 'fastFetch import',
    find: /import\s+{\s*fastFetch\s*}\s+from\s+['"]([^'"]*fastFetch)['"]/g,
    replace: (match, importPath) => {
      const relativePath = importPath.includes('../') ? importPath : '../utils/unifiedFetch';
      return `import { unifiedFetch } from '${relativePath}'`;
    }
  },
  {
    name: 'default ultraFetch import',
    find: /import\s+ultraFetch\s+from\s+['"]([^'"]*ultraFetch)['"]/g,
    replace: (match, importPath) => {
      const relativePath = importPath.includes('../') ? importPath : '../utils/unifiedFetch';
      return `import unifiedFetch from '${relativePath}'`;
    }
  },
  {
    name: 'default fastFetch import',
    find: /import\s+fastFetch\s+from\s+['"]([^'"]*fastFetch)['"]/g,
    replace: (match, importPath) => {
      const relativePath = importPath.includes('../') ? importPath : '../utils/unifiedFetch';
      return `import unifiedFetch from '${relativePath}'`;
    }
  },
  
  // Function call replacements
  {
    name: 'ultraFetch call',
    find: /ultraFetch\s*\(/g,
    replace: 'unifiedFetch('
  },
  {
    name: 'optimizedFetch call (4 params)',
    find: /optimizedFetch\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options, cacheKey, cacheTTL) => {
      return `unifiedFetch(${url}, ${options}, { cacheKey: ${cacheKey}, cacheTTL: ${cacheTTL} })`;
    }
  },
  {
    name: 'optimizedFetch call (3 params)',
    find: /optimizedFetch\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options, cacheKey) => {
      return `unifiedFetch(${url}, ${options}, { cacheKey: ${cacheKey} })`;
    }
  },
  {
    name: 'optimizedFetch call (2 params)',
    find: /optimizedFetch\s*\(\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options) => {
      return `unifiedFetch(${url}, ${options})`;
    }
  },
  {
    name: 'fastFetch call (5 params)',
    find: /fastFetch\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options, cacheKey, cacheTTL, timeout) => {
      return `unifiedFetch(${url}, ${options}, { cacheKey: ${cacheKey}, cacheTTL: ${cacheTTL}, timeout: ${timeout} })`;
    }
  },
  {
    name: 'fastFetch call (4 params)',
    find: /fastFetch\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options, cacheKey, cacheTTL) => {
      return `unifiedFetch(${url}, ${options}, { cacheKey: ${cacheKey}, cacheTTL: ${cacheTTL} })`;
    }
  },
  {
    name: 'fastFetch call (3 params)',
    find: /fastFetch\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options, cacheKey) => {
      return `unifiedFetch(${url}, ${options}, { cacheKey: ${cacheKey} })`;
    }
  },
  {
    name: 'fastFetch call (2 params)',
    find: /fastFetch\s*\(\s*([^,]+),\s*([^)]+)\s*\)/g,
    replace: (match, url, options) => {
      return `unifiedFetch(${url}, ${options})`;
    }
  }
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let importsReplaced = 0;
    let callsReplaced = 0;
    let fileModified = false;

    // Skip if file doesn't use any fetch utilities
    if (!content.includes('ultraFetch') && 
        !content.includes('optimizedFetch') && 
        !content.includes('fastFetch')) {
      return { fileModified: false, importsReplaced: 0, callsReplaced: 0 };
    }

    // Apply migrations
    migrations.forEach(migration => {
      if (typeof migration.replace === 'function') {
        const matches = content.match(migration.find);
        if (matches) {
          content = content.replace(migration.find, migration.replace);
          if (migration.name.includes('import')) {
            importsReplaced += matches.length;
          } else {
            callsReplaced += matches.length;
          }
          fileModified = true;
        }
      } else {
        const matches = content.match(migration.find);
        if (matches) {
          content = content.replace(migration.find, migration.replace);
          if (migration.name.includes('import')) {
            importsReplaced += matches.length;
          } else {
            callsReplaced += matches.length;
          }
          fileModified = true;
        }
      }
    });

    if (fileModified && !isDryRun) {
      fs.writeFileSync(filePath, content, 'utf8');
      stats.filesModified++;
    }

    if (fileModified) {
      stats.filesProcessed++;
      stats.importsReplaced += importsReplaced;
      stats.callsReplaced += callsReplaced;
      
      console.log(`\n📄 ${path.relative(process.cwd(), filePath)}`);
      if (importsReplaced > 0) {
        console.log(`   ✅ Replaced ${importsReplaced} import(s)`);
      }
      if (callsReplaced > 0) {
        console.log(`   ✅ Replaced ${callsReplaced} function call(s)`);
      }
    }

    return { fileModified, importsReplaced, callsReplaced };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { fileModified: false, importsReplaced: 0, callsReplaced: 0 };
  }
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

function main() {
  console.log('🔄 Fetch Utility Migration Script');
  console.log('==================================\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  if (targetFile) {
    // Process single file
    const fullPath = path.resolve(targetFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }
    processFile(fullPath);
  } else {
    // Process all files
    const targetPath = path.resolve('frontend/src');
    const files = getAllFiles(targetPath);
    
    console.log(`📁 Processing: ${targetPath}`);
    console.log(`Found ${files.length} files to process...\n`);

    files.forEach(processFile);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Imports replaced: ${stats.importsReplaced}`);
  console.log(`Function calls replaced: ${stats.callsReplaced}`);
  console.log(`Files modified: ${stats.filesModified}`);
  
  if (isDryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Test the application thoroughly');
    console.log('2. Remove old fetch utilities if no longer needed:');
    console.log('   - frontend/src/utils/ultraFetch.js');
    console.log('   - frontend/src/utils/fastFetch.js');
    console.log('   - frontend/src/utils/apiOptimizer.js (or keep for backward compatibility)');
  }
}

main();

