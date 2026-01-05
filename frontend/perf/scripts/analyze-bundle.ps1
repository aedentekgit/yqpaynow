# Bundle Analysis Script (PowerShell)
# Generates bundle visualization and statistics

Write-Host "🔍 Starting bundle analysis..." -ForegroundColor Cyan

# Build the project
Write-Host "📦 Building project..." -ForegroundColor Yellow
npm run build

# Check if rollup-plugin-visualizer is installed
$visualizerInstalled = npm list rollup-plugin-visualizer 2>$null
if (-not $visualizerInstalled) {
  Write-Host "📥 Installing rollup-plugin-visualizer..." -ForegroundColor Yellow
  npm install --save-dev rollup-plugin-visualizer
}

# Run bundle analysis
Write-Host "📊 Generating bundle stats..." -ForegroundColor Yellow
npm run build -- --mode production

# Check for generated stats
if (Test-Path "dist/stats.html") {
  Write-Host "✅ Bundle stats generated: dist/stats.html" -ForegroundColor Green
  Copy-Item "dist/stats.html" "perf/bundle-stats.html" -Force
  Write-Host "📄 Copied to perf/bundle-stats.html" -ForegroundColor Green
} else {
  Write-Host "⚠️  Bundle stats not found. Check vite.config.js for visualizer plugin." -ForegroundColor Yellow
}

# Analyze bundle sizes
Write-Host "📏 Analyzing bundle sizes..." -ForegroundColor Yellow
Get-ChildItem -Path "dist/assets/*.js" -ErrorAction SilentlyContinue | 
  Sort-Object Length | 
  Select-Object Name, @{Name="Size (KB)";Expression={[math]::Round($_.Length/1KB,2)}} | 
  Format-Table -AutoSize | 
  Out-File "perf/bundle-sizes.txt"
Write-Host "✅ Bundle sizes saved to perf/bundle-sizes.txt" -ForegroundColor Green

Write-Host "✅ Bundle analysis complete!" -ForegroundColor Green

