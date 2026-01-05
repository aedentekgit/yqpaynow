@echo off
echo ========================================
echo Starting YQPayNow with IP Configuration
echo ========================================
echo.
echo IP Address: 172.20.10.2
echo Backend: http://172.20.10.2:5000
echo Frontend: http://172.20.10.2:3001
echo.
echo ========================================
echo.

echo Starting Backend Server...
start "YQPayNow Backend" cmd /k "cd /d D:\15\backend && npm run dev"

timeout /t 5 /nobreak

echo Starting Frontend Server...
start "YQPayNow Frontend" cmd /k "cd /d D:\15\frontend && npm start"

timeout /t 3 /nobreak

echo.
echo ========================================
echo Both servers are starting...
echo.
echo Access your application at:
echo http://172.20.10.2:3001
echo.
echo Backend API available at:
echo http://172.20.10.2:5000/api
echo ========================================
