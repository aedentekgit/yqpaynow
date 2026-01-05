@echo off
REM Stop the hidden POS Agent service

echo Stopping POS Agent Service...

REM Find and kill the agent-service.js process
for /f "tokens=2" %%a in ('tasklist /v /fi "imagename eq node.exe" /fo list ^| findstr /i "agent-service"') do (
    taskkill /F /PID %%a 2>nul
)

REM Fallback - kill by window title if running
wmic process where "commandline like '%%agent-service.js%%'" delete 2>nul

echo.
echo POS Agent stopped
pause
