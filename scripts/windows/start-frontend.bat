@echo off
echo ========================================
echo Starting YQPayNow Frontend Server
echo ========================================
cd /d D:\15\frontend
echo Current directory: %CD%
echo Starting frontend on port 3000...
set PORT=3000
set BROWSER=none
npm start
pause
