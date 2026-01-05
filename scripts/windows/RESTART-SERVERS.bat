@echo off
echo.
echo ========================================
echo  RESTARTING YQPAY SERVERS
echo ========================================
echo.

echo Killing ALL existing Node processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM node.exe 2>nul

echo Waiting for processes to close...
timeout /t 3 /nobreak >nul

echo.
echo Starting Backend Server on port 5000...
start "YQPay Backend" cmd /k "cd /d D:\21\backend && npm run dev"

echo Waiting for backend to initialize...
timeout /t 8 /nobreak >nul

echo.
echo Starting Frontend Server on port 3001...
start "YQPay Frontend" cmd /k "cd /d D:\21\frontend && set PORT=3001 && npm start"

echo Waiting for frontend to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo  SERVERS STARTED!
echo ========================================
echo  Backend:  http://172.20.10.2:5000/api
echo  Frontend: http://172.20.10.2:3001
echo.
echo  IMPORTANT: Wait 15-20 seconds for complete startup
echo  Then open: http://172.20.10.2:3001
echo ========================================
echo.
echo Press any key to exit this window...
pause >nul
