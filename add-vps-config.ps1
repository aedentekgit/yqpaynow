# PowerShell Script to Add VPS Configuration to .env file
# This script safely adds VPS upload configuration to your backend .env file

$envFile = "d:\02-01-2025 - Copy\backend\.env"

# Check if .env file exists
if (-Not (Test-Path $envFile)) {
    Write-Host "Error: .env file not found at $envFile" -ForegroundColor Red
    Write-Host "Please make sure the file exists before running this script." -ForegroundColor Yellow
    pause
    exit 1
}

# Configuration to add
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$vpsConfig = "`n`n# ==============================================`n"
$vpsConfig += "# VPS UPLOAD CONFIGURATION (Added: $timestamp)`n"
$vpsConfig += "# ==============================================`n"
$vpsConfig += "VPS_UPLOAD_PATH=/var/www/html/uploads`n"
$vpsConfig += "VPS_BASE_URL=https://yqpaynow.com`n"

# Read current content
$currentContent = Get-Content $envFile -Raw

# Check if VPS config already exists
if ($currentContent -match "VPS_UPLOAD_PATH" -or $currentContent -match "VPS_BASE_URL") {
    Write-Host "VPS configuration already exists in .env file!" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Do you want to update it? (y/n)"
    
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "Operation cancelled." -ForegroundColor Red
        pause
        exit 0
    }
    
    # Remove old VPS config lines
    $lines = $currentContent -split "`n"
    $newLines = $lines | Where-Object { 
        $_ -notmatch "VPS_UPLOAD_PATH" -and 
        $_ -notmatch "VPS_BASE_URL" -and
        $_ -notmatch "VPS UPLOAD CONFIGURATION"
    }
    $currentContent = $newLines -join "`n"
}

# Add VPS configuration
$newContent = $currentContent.TrimEnd() + $vpsConfig

# Backup original file
$backupFile = "$envFile.backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item $envFile $backupFile
Write-Host "Backup created: $backupFile" -ForegroundColor Green

# Write new content
Set-Content -Path $envFile -Value $newContent -NoNewline

Write-Host ""
Write-Host "SUCCESS! VPS configuration added to .env file" -ForegroundColor Green
Write-Host ""
Write-Host "Added configuration:" -ForegroundColor Cyan
Write-Host "  VPS_UPLOAD_PATH=/var/www/html/uploads" -ForegroundColor White
Write-Host "  VPS_BASE_URL=https://yqpaynow.com" -ForegroundColor White
Write-Host ""
Write-Host "Next step: Restart your backend server" -ForegroundColor Yellow
Write-Host "   Run: pm2 restart all" -ForegroundColor White
Write-Host ""

pause
