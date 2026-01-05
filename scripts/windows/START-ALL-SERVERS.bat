@echo off
echo ========================================
echo Starting YQPayNow - All Servers
echo ========================================
echo.
echo Starting Backend Server (Port 5000)...
start "YQPayNow Backend" cmd /k "cd /d D:\15\backend && node server.js"
timeout /t 3 /nobreak >nul
echo.
echo Starting Frontend Server (Port 3001)...
start "YQPayNow Frontend" cmd /k "cd /d D:\15\frontend && set PORT=3001 && npm start"
timeout /t 2 /nobreak >nul
echo.
echo ========================================
echo Both servers are starting!
echo ========================================
echo Backend:  http://localhost:3001/api
echo Frontend: http://localhost:3000
echo ========================================
echo.
echo Wait for both servers to fully start, then access:
echo http://localhost:3000
echo.
pause
