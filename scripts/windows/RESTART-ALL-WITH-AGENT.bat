@echo off
REM Complete system restart with POS Agent auto-start

echo ========================================
echo  YQ PAY POS System - Full Restart
echo ========================================
echo.

REM Kill all existing processes
echo [1/4] Stopping all existing processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

REM Start Backend
echo [2/4] Starting Backend Server...
cd /d "%~dp0backend"
start "YQ PAY Backend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul

REM Start Frontend
echo [3/4] Starting Frontend...
cd /d "%~dp0frontend"
start "YQ PAY Frontend" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul

REM Start POS Agent
echo [4/4] Starting POS Agent...
cd /d "%~dp0backend\pos-agent"
start "POS Agent" powershell -NoExit -Command "node agent-http.js"

echo.
echo ========================================
echo  ALL SYSTEMS STARTED!
echo  Backend: http://localhost:8080
echo  Frontend: http://localhost:3000
echo  POS Agent: Running in separate window
echo ========================================
echo.
echo Press any key to close this window...
pause >nul
