@echo off
REM ============================================
REM YQPay MASTER AUTO-START
REM Everything in one click - FULLY AUTOMATIC
REM ============================================

echo.
echo  ==========================================
echo    YQPay Auto-Print - MASTER STARTUP
echo  ==========================================
echo.

cd /d "%~dp0"

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found!
    echo Please install from: https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Node.js: OK
echo.

REM Check/Create Config
if not exist "pos-agent\config.json" (
    echo [2/4] Creating config.json...
    copy pos-agent\config.example.json pos-agent\config.json >nul
    echo {   > pos-agent\config.json
    echo   "backendUrl": "http://localhost:8080",   >> pos-agent\config.json
    echo   "agents": [   >> pos-agent\config.json
    echo     {   >> pos-agent\config.json
    echo       "label": "Main POS Counter",   >> pos-agent\config.json
    echo       "username": "admin@yqpaynow.com",   >> pos-agent\config.json
    echo       "password": "admin123"   >> pos-agent\config.json
    echo     }   >> pos-agent\config.json
    echo   ]   >> pos-agent\config.json
    echo }   >> pos-agent\config.json
    echo       Config created with default credentials
) else (
    echo [2/4] Config: EXISTS
)
echo.

REM Start Backend
echo [3/4] Starting Backend Server...
tasklist /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq YQPay*" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo       Backend already running
) else (
    start "YQPay Backend Server" /MIN cmd /c "node server.js"
    timeout /t 3 /nobreak >nul
    echo       Backend started
)
echo.

REM Start POS Agent
echo [4/4] Starting POS Agent...
echo.
echo  ==========================================
echo    SYSTEM ACTIVE!
echo  ==========================================
echo.
echo  Backend:   http://localhost:8080
echo  POS Agent: Running (logs below)
echo.
echo  Auto-print is now FULLY AUTOMATIC!
echo  Close this window to stop.
echo  ==========================================
echo.

REM Run agent in foreground
node pos-agent\agent.js

REM Cleanup when stopped
echo.
echo Stopping backend server...
taskkill /FI "WINDOWTITLE eq YQPay Backend Server" /F >nul 2>nul
echo.
echo Stopped. Have a great day!
pause
