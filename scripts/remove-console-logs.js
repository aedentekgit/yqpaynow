/**
 * 🧹 Console Log Removal Script
 * 
 * This script removes or replaces console.log statements with proper logging
 * 
 * Usage:
 *   node scripts/remove-console-logs.js [--dry-run] [--replace] [--path=frontend/src]
 * 
 * Options:
 *   --dry-run    : Show what would be changed without making changes
 *   --replace    : Replace console.log with logger instead of removing
 *   --path=      : Specific path to process (default: frontend/src)
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldReplace = args.includes('--replace');
const pathArg = args.find(arg => arg.startsWith('--path='));
const targetPath = pathArg ? pathArg.split('=')[1] : 'frontend/src';

const stats = {
  filesProcessed: 0,
  consoleLogsRemoved: 0,
  consoleErrorsKept: 0,
  consoleWarnsKept: 0,
  filesModified: 0
};

// Patterns to match console statements
const consolePatterns = {
  log: /console\.log\([^)]*\)/g,
  debug: /console\.debug\([^)]*\)/g,
  info: /console\.info\([^)]*\)/g,
  warn: /console\.warn\([^)]*\)/g,
  error: /console\.error\([^)]*\)/g
};

// Keep error and warn in production (they're important)
const keepInProduction = ['error', 'warn'];

function shouldKeepConsole(statement, type) {
  // Always keep error and warn
  if (keepInProduction.includes(type)) {
    return true;
  }
  
  // Keep if it's a critical error message
  if (type === 'error' && statement.includes('Error') || statement.includes('Failed')) {
    return true;
  }
  
  return false;
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modifiedContent = content;
    let fileModified = false;
    let logsRemoved = 0;
    let errorsKept = 0;
    let warnsKept = 0;

    // Process each console type
    Object.entries(consolePatterns).forEach(([type, pattern]) => {
      const matches = content.matchAll(pattern);
      
      for (const match of matches) {
        const statement = match[0];
        const fullLine = content.split('\n').find(line => line.includes(statement));
        
        // Check if we should keep this statement
        if (shouldKeepConsole(statement, type)) {
          if (type === 'error') errorsKept++;
          if (type === 'warn') warnsKept++;
          continue;
        }

        // Remove or replace
        if (shouldReplace) {
          // Replace with logger
          const loggerCall = statement
            .replace('console.log', 'log.debug')
            .replace('console.debug', 'log.debug')
            .replace('console.info', 'log.info')
            .replace('console.warn', 'log.warn')
            .replace('console.error', 'log.error');
          
          modifiedContent = modifiedContent.replace(statement, loggerCall);
        } else {
          // Remove the entire line if it only contains console statement
          const lines = modifiedContent.split('\n');
          const lineIndex = lines.findIndex(line => line.includes(statement));
          
          if (lineIndex !== -1) {
            const line = lines[lineIndex].trim();
            // Only remove if line is just console statement (with optional whitespace/semicolon)
            if (line === statement || line === statement + ';' || line.replace(/^\s*/, '').startsWith(statement)) {
              lines.splice(lineIndex, 1);
              modifiedContent = lines.join('\n');
              logsRemoved++;
              fileModified = true;
            }
          }
        }
      }
    });

    // Add logger import if replacing and not already present
    if (shouldReplace && fileModified && !content.includes("from '../utils/logger'") && !content.includes("from './utils/logger'")) {
      const importLine = "import { log } from '../utils/logger';\n";
      const lines = modifiedContent.split('\n');
      const lastImportIndex = lines.findLastIndex(line => line.startsWith('import'));
      if (lastImportIndex !== -1) {
        lines.splice(lastImportIndex + 1, 0, importLine);
        modifiedContent = lines.join('\n');
      }
    }

    if (fileModified && !isDryRun) {
      fs.writeFileSync(filePath, modifiedContent, 'utf8');
      stats.filesModified++;
    }

    if (logsRemoved > 0 || errorsKept > 0 || warnsKept > 0) {
      stats.filesProcessed++;
      stats.consoleLogsRemoved += logsRemoved;
      stats.consoleErrorsKept += errorsKept;
      stats.consoleWarnsKept += warnsKept;
      
      console.log(`\n📄 ${path.relative(process.cwd(), filePath)}`);
      if (logsRemoved > 0) {
        console.log(`   ✅ Removed ${logsRemoved} console.log/debug/info statements`);
      }
      if (errorsKept > 0) {
        console.log(`   ⚠️  Kept ${errorsKept} console.error statements (important)`);
      }
      if (warnsKept > 0) {
        console.log(`   ⚠️  Kept ${warnsKept} console.warn statements (important)`);
      }
    }

    return { fileModified, logsRemoved, errorsKept, warnsKept };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { fileModified: false, logsRemoved: 0, errorsKept: 0, warnsKept: 0 };
  }
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      // Skip node_modules and dist
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

function main() {
  console.log('🧹 Console Log Cleanup Script');
  console.log('==============================\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  if (shouldReplace) {
    console.log('🔄 REPLACE MODE - console.log will be replaced with logger\n');
  } else {
    console.log('🗑️  REMOVE MODE - console.log will be removed\n');
  }

  const fullPath = path.resolve(targetPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Path not found: ${fullPath}`);
    process.exit(1);
  }

  console.log(`📁 Processing: ${fullPath}\n`);

  const files = getAllFiles(fullPath);
  console.log(`Found ${files.length} files to process...\n`);

  files.forEach(processFile);

  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Console logs removed: ${stats.consoleLogsRemoved}`);
  console.log(`Console errors kept: ${stats.consoleErrorsKept}`);
  console.log(`Console warns kept: ${stats.consoleWarnsKept}`);
  console.log(`Files modified: ${stats.filesModified}`);
  
  if (isDryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  }
  
  if (shouldReplace) {
    console.log('\n💡 Remember to import logger in files that need it:');
    console.log("   import { log } from '../utils/logger';");
  }
}

main();

