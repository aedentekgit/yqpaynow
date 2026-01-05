/**
 * 🚀 AUTOMATED PERFORMANCE OPTIMIZATION SCRIPT
 * 
 * This script helps migrate pages to use ultra-performance utilities
 * Run with: node scripts/optimize-performance.js [pageName]
 * 
 * Example: node scripts/optimize-performance.js Dashboard
 */

const fs = require('fs');
const path = require('path');

const optimizations = {
  // Replace Context imports with Zustand stores
  replaceImports: [
    {
      find: /import\s+{\s*useCart\s*}\s+from\s+['"]\.\.\/contexts\/CartContext['"]/g,
      replace: "import { useCartItems, useCartActions } from '../stores/optimizedStores'"
    },
    {
      find: /import\s+{\s*useAuth\s*}\s+from\s+['"]\.\.\/contexts\/AuthContext['"]/g,
      replace: "import { useAuthStore, useAuthUser, useIsAuthenticated } from '../stores/optimizedStores'"
    },
    {
      find: /const\s+{\s*items,\s*addItem,\s*removeItem,?\s*}\s*=\s*useCart\(\)/g,
      replace: "const items = useCartItems();\nconst { addItem, removeItem } = useCartActions()"
    }
  ],

  // Add performance imports
  addImports: [
    "import { useDeepMemo, useComputed, ultraDebounce } from '../utils/ultraPerformance'",
    "import { useUltraFetch, prefetchData } from '../utils/ultraFetch'"
  ],

  // Replace fetch with ultraFetch
  replaceFetch: [
    {
      find: /const\s+response\s*=\s*await\s+fetch\((.*?)\)/g,
      replace: "const response = await ultraFetch($1)"
    }
  ],

  // Add memoization
  addMemoization: [
    {
      pattern: /const\s+(\w+)\s*=\s*(\w+)\.map\(/g,
      replacement: "const $1 = useMemo(() => $2.map(", 
      addDependency: true
    }
  ]
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const analysis = {
    path: filePath,
    size: content.length,
    issues: [],
    suggestions: []
  };

  // Check for performance issues
  if (content.includes('useState') && !content.includes('useMemo')) {
    analysis.issues.push('No memoization detected - consider using useMemo/useCallback');
  }

  if (content.includes('map(') && !content.includes('React.memo')) {
    analysis.issues.push('List rendering without memo - consider virtualizing or memoizing');
  }

  if (content.includes('useEffect') && content.match(/useEffect/g).length > 5) {
    analysis.issues.push(`High useEffect count (${content.match(/useEffect/g).length}) - consider consolidating`);
  }

  if (content.includes('fetch(') && !content.includes('ultraFetch')) {
    analysis.issues.push('Using native fetch - migrate to ultraFetch for caching');
  }

  if (content.includes('useCart') && !content.includes('useCartStore')) {
    analysis.issues.push('Using CartContext - migrate to useCartStore for better performance');
  }

  if (content.includes('useAuth') && !content.includes('useAuthStore')) {
    analysis.issues.push('Using AuthContext - migrate to useAuthStore for better performance');
  }

  // Check for positive optimizations
  if (content.includes('useMemo') || content.includes('useCallback')) {
    analysis.suggestions.push('✓ Memoization already in use');
  }

  if (content.includes('React.memo')) {
    analysis.suggestions.push('✓ Component memoization already in use');
  }

  if (content.includes('ultraFetch') || content.includes('useUltraFetch')) {
    analysis.suggestions.push('✓ Ultra fetch already in use');
  }

  return analysis;
}

function generateOptimizationReport(pagesDir) {
  log('\n🔍 Analyzing project for optimization opportunities...\n', 'blue');

  const files = getAllFiles(pagesDir);
  const reports = [];

  files.forEach(file => {
    if (file.endsWith('.jsx') || file.endsWith('.js')) {
      const analysis = analyzeFile(file);
      if (analysis.issues.length > 0) {
        reports.push(analysis);
      }
    }
  });

  // Sort by number of issues
  reports.sort((a, b) => b.issues.length - a.issues.length);

  log('╔══════════════════════════════════════════════════════════════╗', 'bright');
  log('║           PERFORMANCE OPTIMIZATION REPORT                     ║', 'bright');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'bright');

  log(`Total Files Analyzed: ${files.length}`, 'green');
  log(`Files Needing Optimization: ${reports.length}`, 'yellow');
  log('');

  reports.forEach((report, index) => {
    const fileName = path.basename(report.path);
    log(`${index + 1}. ${fileName}`, 'bright');
    log(`   Path: ${report.path}`, 'reset');
    log(`   Issues Found: ${report.issues.length}`, 'yellow');
    
    report.issues.forEach(issue => {
      log(`   ⚠  ${issue}`, 'yellow');
    });

    if (report.suggestions.length > 0) {
      log(`   Positives:`, 'green');
      report.suggestions.forEach(suggestion => {
        log(`   ${suggestion}`, 'green');
      });
    }
    log('');
  });

  // Generate summary
  const totalIssues = reports.reduce((sum, r) => sum + r.issues.length, 0);
  const issueTypes = {};
  reports.forEach(r => {
    r.issues.forEach(issue => {
      const key = issue.split('-')[0].trim();
      issueTypes[key] = (issueTypes[key] || 0) + 1;
    });
  });

  log('\n═══════════════════════════════════════════════════════════════', 'bright');
  log('SUMMARY', 'bright');
  log('═══════════════════════════════════════════════════════════════\n', 'bright');
  log(`Total Issues: ${totalIssues}`, 'red');
  log('\nIssue Breakdown:', 'bright');
  Object.entries(issueTypes).forEach(([type, count]) => {
    log(`  • ${type}: ${count}`, 'yellow');
  });

  log('\n📈 Priority Recommendations:', 'blue');
  log('  1. Migrate to Zustand stores (useCartStore, useAuthStore)', 'green');
  log('  2. Replace fetch() with ultraFetch()', 'green');
  log('  3. Add memoization to expensive computations', 'green');
  log('  4. Virtualize large lists (100+ items)', 'green');
  log('  5. Add React.memo to components', 'green');

  return reports;
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

function optimizeFile(filePath, dryRun = false) {
  log(`\n🔧 Optimizing: ${path.basename(filePath)}`, 'blue');
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // Apply import replacements
  optimizations.replaceImports.forEach(({ find, replace }) => {
    if (content.match(find)) {
      content = content.replace(find, replace);
      changes++;
      log(`  ✓ Updated imports`, 'green');
    }
  });

  // Add performance imports if not present
  if (!content.includes('ultraPerformance') && (content.includes('useMemo') || content.includes('useCallback'))) {
    const importLine = "import { useDeepMemo, useComputed } from '../utils/ultraPerformance';\n";
    const lines = content.split('\n');
    const lastImportIndex = lines.findLastIndex(line => line.startsWith('import'));
    lines.splice(lastImportIndex + 1, 0, importLine);
    content = lines.join('\n');
    changes++;
    log(`  ✓ Added performance imports`, 'green');
  }

  // Replace fetch with ultraFetch
  if (content.includes('fetch(') && !content.includes('ultraFetch')) {
    if (!content.includes('ultraFetch')) {
      const importLine = "import { ultraFetch } from '../utils/ultraFetch';\n";
      const lines = content.split('\n');
      const lastImportIndex = lines.findLastIndex(line => line.startsWith('import'));
      lines.splice(lastImportIndex + 1, 0, importLine);
      content = lines.join('\n');
    }
    // Note: Manual review needed for fetch replacement
    log(`  ⚠ Contains fetch() calls - manual migration recommended`, 'yellow');
  }

  if (!dryRun && changes > 0) {
    // Backup original file
    fs.writeFileSync(filePath + '.backup', fs.readFileSync(filePath));
    // Write optimized file
    fs.writeFileSync(filePath, content);
    log(`  💾 Saved (${changes} changes, backup created)`, 'green');
  } else if (changes > 0) {
    log(`  📋 Dry run: ${changes} potential changes`, 'yellow');
  } else {
    log(`  ℹ  No automatic changes needed`, 'reset');
  }

  return changes;
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  log('\n🚀 Ultra Performance Optimizer\n', 'bright');
  log('Usage:', 'bright');
  log('  node scripts/optimize-performance.js analyze [path]  - Analyze files', 'green');
  log('  node scripts/optimize-performance.js optimize <file> - Optimize specific file', 'green');
  log('  node scripts/optimize-performance.js batch [path]    - Batch optimize all files\n', 'green');
  process.exit(0);
}

if (command === 'analyze') {
  const targetPath = args[1] || './src/pages';
  generateOptimizationReport(targetPath);
} else if (command === 'optimize') {
  const file = args[1];
  if (!file) {
    log('❌ Error: Please specify a file to optimize', 'red');
    process.exit(1);
  }
  optimizeFile(file, args.includes('--dry-run'));
} else if (command === 'batch') {
  const targetPath = args[1] || './src/pages';
  const dryRun = args.includes('--dry-run');
  
  log(`\n🔄 Batch optimizing files in: ${targetPath}\n`, 'blue');
  
  const files = getAllFiles(targetPath).filter(f => f.endsWith('.jsx') || f.endsWith('.js'));
  let totalChanges = 0;

  files.forEach(file => {
    const changes = optimizeFile(file, dryRun);
    totalChanges += changes;
  });

  log(`\n✅ Batch optimization complete!`, 'green');
  log(`   Files processed: ${files.length}`, 'bright');
  log(`   Total changes: ${totalChanges}`, 'bright');
  
  if (dryRun) {
    log(`   Run without --dry-run to apply changes`, 'yellow');
  }
} else {
  log(`❌ Unknown command: ${command}`, 'red');
  process.exit(1);
}
