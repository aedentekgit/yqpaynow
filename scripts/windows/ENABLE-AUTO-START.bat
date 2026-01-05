@echo off
REM This script sets up Windows Task Scheduler to auto-start YQ PAY system on boot

echo ========================================
echo  Setup Auto-Start on Windows Boot
echo ========================================
echo.
echo This will create a scheduled task that runs
echo START-ALL.bat automatically when Windows starts.
echo.
pause

REM Create scheduled task
schtasks /create /tn "YQ PAY Auto Start" /tr "D:\1\START-ALL.bat" /sc onlogon /rl highest /f

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo  ✅ SUCCESS!
    echo ========================================
    echo.
    echo Auto-start is now enabled.
    echo YQ PAY will start automatically when you log in.
    echo.
    echo To disable auto-start, run:
    echo   DISABLE-AUTO-START.bat
    echo.
) else (
    echo.
    echo ========================================
    echo  ❌ FAILED!
    echo ========================================
    echo.
    echo Could not create scheduled task.
    echo Make sure you run this as Administrator.
    echo.
    echo Right-click this file and select:
    echo   "Run as administrator"
    echo.
)

pause
