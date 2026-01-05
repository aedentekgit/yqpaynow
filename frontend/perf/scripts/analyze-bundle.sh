#!/bin/bash

# Bundle Analysis Script
# Generates bundle visualization and statistics

echo "🔍 Starting bundle analysis..."

# Build the project
echo "📦 Building project..."
npm run build

# Check if rollup-plugin-visualizer is installed
if ! npm list rollup-plugin-visualizer > /dev/null 2>&1; then
  echo "📥 Installing rollup-plugin-visualizer..."
  npm install --save-dev rollup-plugin-visualizer
fi

# Run bundle analysis
echo "📊 Generating bundle stats..."
npm run build -- --mode production

# The visualizer plugin will generate stats.json
# Convert to HTML if needed
if [ -f "dist/stats.html" ]; then
  echo "✅ Bundle stats generated: dist/stats.html"
  cp dist/stats.html perf/bundle-stats.html
  echo "📄 Copied to perf/bundle-stats.html"
else
  echo "⚠️  Bundle stats not found. Check vite.config.js for visualizer plugin."
fi

# Analyze bundle sizes
echo "📏 Analyzing bundle sizes..."
du -sh dist/assets/*.js | sort -h > perf/bundle-sizes.txt
echo "✅ Bundle sizes saved to perf/bundle-sizes.txt"

echo "✅ Bundle analysis complete!"

