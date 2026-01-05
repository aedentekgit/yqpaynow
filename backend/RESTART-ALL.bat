@echo off
REM ============================================
REM YQPay Auto-Print - ULTIMATE ONE-CLICK START
REM Kills existing processes and starts fresh
REM ============================================

echo.
echo  ==========================================
echo    YQPay Auto-Print System
echo    COMPLETE RESTART
echo  ==========================================
echo.

cd /d "%~dp0"

REM Kill any existing node processes
echo [1/5] Cleaning up existing processes...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq YQPay*" >nul 2>nul
timeout /t 1 /nobreak >nul
echo       Done

REM Check config
if not exist "pos-agent\config.json" (
    echo [2/5] Creating config.json...
    (
        echo {
        echo   "backendUrl": "http://localhost:8080",
        echo   "agents": [
        echo     {
        echo       "label": "Main POS Counter",
        echo       "username": "admin@yqpaynow.com",
        echo       "password": "admin123"
        echo     }
        echo   ]
        echo }
    ) > pos-agent\config.json
    echo       Created
) else (
    echo [2/5] Config exists
)

REM Start backend
echo [3/5] Starting backend server...
start "YQPay Backend" /MIN cmd /c "node server.js"
echo       Waiting for server to initialize...
timeout /t 5 /nobreak >nul
echo       Backend ready

REM Test backend
echo [4/5] Testing backend connection...
curl -s http://localhost:8080/api/auth/login -X POST -H "Content-Type: application/json" -d "{\"username\":\"admin@yqpaynow.com\",\"password\":\"admin123\"}" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo       Backend OK
) else (
    echo       Backend still starting...
    timeout /t 3 /nobreak >nul
)

REM Start POS agent
echo [5/5] Starting POS agent...
echo.
echo  ==========================================
echo    SYSTEM RUNNING!
echo  ==========================================
echo.
echo  Backend:   http://localhost:8080
echo  POS Agent: Active (logs below)
echo  Theater:   Auto-selected
echo.
echo  Status: 🟢 LIVE - Waiting for orders...
echo  ==========================================
echo.

node pos-agent\agent.js

REM Cleanup on exit
echo.
echo Shutting down...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq YQPay Backend" >nul 2>nul
echo.
echo Stopped. Press any key to exit.
pause >nul
