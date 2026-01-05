@echo off
REM ============================================
REM Uninstall YQPay Windows Startup Service
REM Run this as Administrator
REM ============================================

echo.
echo ========================================
echo   Uninstall YQPay Auto-Start
echo ========================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script requires Administrator privileges
    echo Right-click this file and select "Run as Administrator"
    pause
    exit /b 1
)

echo Stopping services...
pm2 stop all
pm2 delete all

echo Removing PM2 startup...
pm2-startup uninstall

echo.
echo ========================================
echo   Uninstall Complete!
echo ========================================
echo.
echo YQPay will no longer start automatically on boot.
echo.
pause
