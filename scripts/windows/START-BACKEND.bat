@echo off
echo ========================================
echo Starting YQPAY Backend Server
echo ========================================
echo.

cd /d "%~dp0backend"

:START
echo [%TIME%] Starting server...
node server.js
echo.
echo [%TIME%] Server stopped with exit code %ERRORLEVEL%
echo.
if %ERRORLEVEL% NEQ 0 (
    echo Server crashed. Waiting 3 seconds before restart...
    timeout /t 3 /nobreak > nul
    goto START
)

pause
