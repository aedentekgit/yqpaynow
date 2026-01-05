@echo off
REM ============================================
REM YQPay Auto-Print System - Quick Start
REM (Simple version without PM2 for testing)
REM ============================================

echo.
echo ========================================
echo    YQPay Auto-Print Quick Start
echo ========================================
echo.

cd /d "%~dp0"

REM Check if config exists
if not exist "pos-agent\config.json" (
    echo [INFO] Creating pos-agent/config.json...
    copy pos-agent\config.example.json pos-agent\config.json
    echo [IMPORTANT] Edit the file with your credentials!
    notepad pos-agent\config.json
    echo Press any key after saving...
    pause >nul
)

REM Start backend in background
echo [1/2] Starting Backend Server...
start "YQPay Backend" /MIN cmd /c "node server.js"
timeout /t 5 /nobreak >nul

REM Start POS agent
echo [2/2] Starting POS Agent...
echo.
echo ========================================
echo   System Running!
echo ========================================
echo.
echo Backend: http://localhost:8080
echo POS Agent: Active (logs below)
echo.
echo Press Ctrl+C to stop
echo ========================================
echo.

node pos-agent\agent.js

REM When agent stops, kill backend too
taskkill /FI "WINDOWTITLE eq YQPay Backend" /F >nul 2>nul
