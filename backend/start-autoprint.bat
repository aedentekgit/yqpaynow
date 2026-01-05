@echo off
REM ============================================
REM YQPay Auto-Print System Startup Script
REM ============================================

echo.
echo ========================================
echo    YQPay Auto-Print System Startup
echo ========================================
echo.

cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js found: 
node --version
echo.

REM Check if PM2 is installed
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] PM2 not found. Installing PM2 globally...
    call npm install -g pm2
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install PM2
        pause
        exit /b 1
    )
)

echo [OK] PM2 found
echo.

REM Check if config.json exists
if not exist "pos-agent\config.json" (
    echo [INFO] Creating pos-agent/config.json from example...
    copy pos-agent\config.example.json pos-agent\config.json
    echo.
    echo [IMPORTANT] Please edit pos-agent/config.json with your credentials
    echo Press any key to open the file in notepad...
    pause >nul
    notepad pos-agent\config.json
    echo.
    echo After saving your changes, press any key to continue...
    pause >nul
)

REM Create logs directory
if not exist "logs" mkdir logs

echo ========================================
echo Starting Backend Server + POS Agent...
echo ========================================
echo.

REM Stop any existing instances
pm2 delete all >nul 2>nul

REM Start both backend and POS agent using PM2
pm2 start ecosystem.config.json

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   SUCCESS! System is now running
    echo ========================================
    echo.
    echo Backend Server: Running on http://localhost:8080
    echo POS Agent:      Connected and listening for orders
    echo.
    echo To view logs:   pm2 logs
    echo To monitor:     pm2 monit
    echo To stop:        pm2 stop all
    echo To restart:     pm2 restart all
    echo.
    echo Auto-print is now active! Orders will print automatically.
    echo.
    
    REM Save PM2 process list
    pm2 save
    
    REM Setup PM2 to start on system boot
    echo.
    echo Setting up auto-start on Windows boot...
    pm2 startup
    
    echo.
    echo Opening PM2 monitor in 5 seconds...
    timeout /t 5 >nul
    pm2 monit
) else (
    echo.
    echo [ERROR] Failed to start services
    echo Check the error messages above
    pause
    exit /b 1
)
