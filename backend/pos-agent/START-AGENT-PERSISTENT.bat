@echo off
REM Keep POS Agent running - Auto restart on crash

:START
echo ========================================
echo  POS Agent Running...
echo  Auto-restart enabled
echo ========================================
echo.

cd /d "%~dp0"
node agent-http.js

echo.
echo ========================================
echo  Agent stopped. Restarting in 3 seconds...
echo  Press Ctrl+C to stop
echo ========================================
timeout /t 3 /nobreak >nul

goto START
