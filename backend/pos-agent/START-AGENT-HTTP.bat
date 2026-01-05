@echo off
REM Start POS Agent in a new window using HTTP-based implementation

cd /d "%~dp0backend\pos-agent"

echo ========================================
echo  Starting POS Agent (HTTP version)...
echo ========================================
echo.

REM Kill any existing agent process
taskkill /F /FI "WINDOWTITLE eq POS Agent*" 2>nul

REM Start in a new PowerShell window
start "POS Agent (HTTP)" powershell -NoExit -Command "node agent-http.js"

echo.
echo ========================================
echo  POS Agent started in new window!
echo  Check the new window for connection status
echo ========================================
echo.
pause
