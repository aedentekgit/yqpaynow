/**
 * 🧹 Advanced Console Log Cleanup Script
 * 
 * Handles multi-line console.log statements and complex patterns
 * 
 * Usage:
 *   node scripts/cleanup-remaining-console-logs.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const stats = {
  filesProcessed: 0,
  consoleLogsRemoved: 0,
  filesModified: 0
};

// More comprehensive patterns including multi-line
const patterns = [
  // Single line console.log
  /^\s*console\.log\([^)]*\);?\s*$/gm,
  // Multi-line console.log (simple)
  /console\.log\(\s*[^)]*\n[^)]*\)/g,
  // Console.log with template strings
  /console\.log\(`[^`]*`[^)]*\)/g,
  // Console.log with objects
  /console\.log\([^,)]+,\s*\{[^}]*\}\)/g
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let logsRemoved = 0;
    let fileModified = false;

    // Skip logger.js itself
    if (filePath.includes('logger.js')) {
      return { fileModified: false, logsRemoved: 0 };
    }

    // Remove console.log statements (more aggressive)
    const lines = content.split('\n');
    const newLines = [];
    let skipNext = false;
    let inMultiLine = false;
    let multiLineDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if this is a console.log line
      if (trimmed.startsWith('console.log(')) {
        // Check if it's a single-line statement
        if (trimmed.endsWith(');') || trimmed.endsWith(')')) {
          // Skip this line
          logsRemoved++;
          fileModified = true;
          continue;
        } else {
          // Multi-line - count parentheses
          let openParens = (line.match(/\(/g) || []).length;
          let closeParens = (line.match(/\)/g) || []).length;
          multiLineDepth = openParens - closeParens;
          
          if (multiLineDepth > 0) {
            inMultiLine = true;
            logsRemoved++;
            fileModified = true;
            // Skip this line and continue until we find closing paren
            continue;
          }
        }
      }

      // If we're in a multi-line console.log, skip until we find the closing paren
      if (inMultiLine) {
        const openParens = (line.match(/\(/g) || []).length;
        const closeParens = (line.match(/\)/g) || []).length;
        multiLineDepth += openParens - closeParens;
        
        if (multiLineDepth <= 0) {
          inMultiLine = false;
          multiLineDepth = 0;
        }
        continue;
      }

      // Keep the line
      newLines.push(line);
    }

    if (fileModified) {
      content = newLines.join('\n');
      
      // Clean up multiple empty lines
      content = content.replace(/\n{3,}/g, '\n\n');
      
      if (!isDryRun) {
        fs.writeFileSync(filePath, content, 'utf8');
        stats.filesModified++;
      }

      stats.filesProcessed++;
      stats.consoleLogsRemoved += logsRemoved;
      
      console.log(`\n📄 ${path.relative(process.cwd(), filePath)}`);
      console.log(`   ✅ Removed ${logsRemoved} console.log statement(s)`);
    }

    return { fileModified, logsRemoved };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { fileModified: false, logsRemoved: 0 };
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
  console.log('🧹 Advanced Console Log Cleanup');
  console.log('================================\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const targetPath = path.resolve('frontend/src');
  const files = getAllFiles(targetPath);
  
  console.log(`📁 Processing: ${targetPath}`);
  console.log(`Found ${files.length} files to process...\n`);

  files.forEach(processFile);

  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Console logs removed: ${stats.consoleLogsRemoved}`);
  console.log(`Files modified: ${stats.filesModified}`);
  
  if (isDryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  }
}

main();

