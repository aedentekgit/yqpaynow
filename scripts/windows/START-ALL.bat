@echo off
echo ========================================
echo  Starting YQ PAY POS System
echo ========================================
echo.

REM Kill any existing processes first
echo Cleaning up old processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [1/3] Backend Server...
cd /d D:\1\backend
start "YQ PAY Backend" cmd /k npm run dev

echo Waiting for backend to start...
timeout /t 8 /nobreak >nul

echo [2/3] Frontend...
cd /d D:\1\frontend
start "YQ PAY Frontend" cmd /k npm run dev

echo Waiting for frontend to start...
timeout /t 5 /nobreak >nul

echo [3/3] POS Agent (Background Service)...
cd /d D:\1\backend\pos-agent

REM Clean old log file
if exist agent.log del agent.log

REM Start agent hidden in background using PowerShell
powershell -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'agent-service.js'"

echo Waiting for agent to connect...
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo  ✅ ALL SYSTEMS STARTED!
echo ========================================
echo.
echo  Backend:  http://localhost:8080
echo  Frontend: http://localhost:3000
echo  POS Agent: Running in background
echo.
echo ========================================
echo  ⚠️  CRITICAL - READ THIS! ⚠️
echo ========================================
echo.
echo  You will see 2 windows: Backend + Frontend
echo.
echo  ✅ YOU CAN:
echo     - Close the BROWSER (Chrome/Edge) anytime
echo     - Reopen browser anytime
echo     - Minimize Backend/Frontend windows
echo.
echo  ❌ DO NOT:
echo     - Close Backend window (breaks printing!)
echo     - Close Frontend window (breaks system!)
echo.
echo  💡 TIP: Run MINIMIZE-SYSTEM.bat to minimize
echo          windows safely to taskbar
echo.
echo  📖 Read: CRITICAL-WARNING.txt for details
echo.
echo ========================================
echo.
echo Press any key to continue...
pause >nul

REM Open the browser automatically
start http://localhost:3000

echo.
echo ✅ Browser opened!
echo.
echo Keep Backend + Frontend windows OPEN!
echo Close this window now.
echo.
