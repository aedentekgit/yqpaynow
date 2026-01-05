@echo off
REM This script removes the auto-start scheduled task

echo ========================================
echo  Disable Auto-Start on Windows Boot
echo ========================================
echo.
echo This will remove the scheduled task.
echo You will need to manually start YQ PAY.
echo.
pause

REM Delete scheduled task
schtasks /delete /tn "YQ PAY Auto Start" /f

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo  ✅ SUCCESS!
    echo ========================================
    echo.
    echo Auto-start has been disabled.
    echo.
    echo To enable it again, run:
    echo   ENABLE-AUTO-START.bat
    echo.
) else (
    echo.
    echo ========================================
    echo  ℹ️ Task not found or already removed
    echo ========================================
    echo.
)

pause
