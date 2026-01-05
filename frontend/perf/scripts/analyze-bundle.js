#!/usr/bin/env node

/**
 * Bundle Analysis Script
 * Generates bundle visualization and statistics
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('🔍 Starting bundle analysis...\n');

try {
  // Build the project
  console.log('📦 Building project...');
  execSync('npm run build', { stdio: 'inherit' });

  // Check dist directory
  const distPath = join(process.cwd(), 'dist');
  if (!existsSync(distPath)) {
    console.error('❌ dist directory not found. Build may have failed.');
    process.exit(1);
  }

  // Analyze bundle sizes
  console.log('\n📏 Analyzing bundle sizes...');
  const { readdirSync, statSync } = await import('fs');
  const assetsPath = join(distPath, 'assets');
  
  if (existsSync(assetsPath)) {
    const files = readdirSync(assetsPath)
      .filter(f => f.endsWith('.js') || f.endsWith('.css'))
      .map(f => {
        const filePath = join(assetsPath, f);
        const stats = statSync(filePath);
        return {
          name: f,
          size: stats.size,
          sizeKB: (stats.size / 1024).toFixed(2),
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
        };
      })
      .sort((a, b) => b.size - a.size);

    // Generate report
    let report = '# Bundle Size Analysis\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += '## JavaScript Bundles\n\n';
    report += '| File | Size (KB) | Size (MB) |\n';
    report += '|------|-----------|-----------|\n';
    
    files.filter(f => f.name.endsWith('.js')).forEach(file => {
      report += `| ${file.name} | ${file.sizeKB} KB | ${file.sizeMB} MB |\n`;
    });

    report += '\n## CSS Bundles\n\n';
    report += '| File | Size (KB) | Size (MB) |\n';
    report += '|------|-----------|-----------|\n';
    
    files.filter(f => f.name.endsWith('.css')).forEach(file => {
      report += `| ${file.name} | ${file.sizeKB} KB | ${file.sizeMB} MB |\n`;
    });

    // Calculate totals
    const totalJS = files.filter(f => f.name.endsWith('.js')).reduce((sum, f) => sum + f.size, 0);
    const totalCSS = files.filter(f => f.name.endsWith('.css')).reduce((sum, f) => sum + f.size, 0);
    const total = totalJS + totalCSS;

    report += '\n## Summary\n\n';
    report += `- **Total JS:** ${(totalJS / 1024).toFixed(2)} KB (${(totalJS / (1024 * 1024)).toFixed(2)} MB)\n`;
    report += `- **Total CSS:** ${(totalCSS / 1024).toFixed(2)} KB (${(totalCSS / (1024 * 1024)).toFixed(2)} MB)\n`;
    report += `- **Total Assets:** ${(total / 1024).toFixed(2)} KB (${(total / (1024 * 1024)).toFixed(2)} MB)\n`;

    // Save report
    const reportPath = join(process.cwd(), 'perf', 'bundle-sizes.txt');
    writeFileSync(reportPath, report);
    console.log(`✅ Bundle sizes saved to ${reportPath}`);

    // Display top 10 largest files
    console.log('\n📊 Top 10 Largest Files:');
    files.slice(0, 10).forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name}: ${file.sizeKB} KB`);
    });
  }

  console.log('\n✅ Bundle analysis complete!');
  console.log('\n💡 Next steps:');
  console.log('  1. Check perf/bundle-sizes.txt for detailed breakdown');
  console.log('  2. Open dist/stats.html (if visualizer plugin is configured)');
  console.log('  3. Review perf/REPORT.md for optimization recommendations');

} catch (error) {
  console.error('❌ Error during bundle analysis:', error.message);
  process.exit(1);
}

