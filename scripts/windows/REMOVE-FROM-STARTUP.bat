@echo off
REM ========================================
REM Remove YQPayNow from Windows Startup
REM ========================================

echo ========================================
echo Removing YQPayNow from Windows Startup
echo ========================================
echo.

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT=%STARTUP_FOLDER%\YQPayNow Auto-Start.lnk

if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo SUCCESS: Removed from startup
    echo.
    echo YQPayNow will no longer start automatically on boot.
) else (
    echo INFO: Startup shortcut not found
    echo YQPayNow is not currently set to auto-start.
)

echo.
pause

