@echo off
REM ============================================
REM YQPay Auto-Print System - Stop Script
REM ============================================

echo.
echo ========================================
echo   Stopping YQPay Auto-Print System
echo ========================================
echo.

cd /d "%~dp0"

pm2 stop all

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] All services stopped
    echo.
    echo To start again: start-autoprint.bat
    echo.
) else (
    echo.
    echo [ERROR] Failed to stop services
    echo.
)

pause
