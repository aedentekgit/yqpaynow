@echo off
REM ============================================
REM Install YQPay as Windows Startup Service
REM Run this as Administrator
REM ============================================

echo.
echo ========================================
echo   YQPay Auto-Start on Windows Boot
echo ========================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script requires Administrator privileges
    echo.
    echo Right-click this file and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

echo [OK] Running as Administrator
echo.

cd /d "%~dp0"

REM Install PM2 globally if not present
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing PM2...
    call npm install -g pm2
    call npm install -g pm2-windows-startup
)

echo Setting up PM2 Windows startup...
pm2-startup install

echo.
echo Starting services...
call start-autoprint.bat

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo YQPay Auto-Print will now start automatically when Windows boots.
echo.
echo To uninstall: run uninstall-windows-startup.bat as Administrator
echo.
pause
