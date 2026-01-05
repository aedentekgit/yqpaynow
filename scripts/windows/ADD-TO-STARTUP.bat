@echo off
REM ========================================
REM Add YQPayNow to Windows Startup
REM This will make servers start automatically on Windows boot
REM ========================================

echo ========================================
echo Adding YQPayNow to Windows Startup
echo ========================================
echo.

REM Get the script directory and find the auto-start script
cd /d "%~dp0"
set AUTO_START_SCRIPT=%CD%\AUTO-START-SERVERS.bat

REM Get Windows Startup folder path
set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

echo Auto-Start Script: %AUTO_START_SCRIPT%
echo Startup Folder: %STARTUP_FOLDER%
echo.

REM Check if auto-start script exists
if not exist "%AUTO_START_SCRIPT%" (
    echo ERROR: Auto-start script not found!
    echo Expected at: %AUTO_START_SCRIPT%
    pause
    exit /b 1
)

REM Create shortcut in Startup folder
echo Creating shortcut in Startup folder...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_FOLDER%\YQPayNow Auto-Start.lnk'); $Shortcut.TargetPath = '%AUTO_START_SCRIPT%'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Description = 'Auto-start YQPayNow Backend and Frontend servers'; $Shortcut.Save()"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! YQPayNow added to Startup
    echo ========================================
    echo.
    echo The servers will now start automatically when Windows boots.
    echo.
    echo To remove from startup:
    echo 1. Press Windows + R
    echo 2. Type: shell:startup
    echo 3. Delete "YQPayNow Auto-Start.lnk"
    echo.
) else (
    echo.
    echo ERROR: Failed to create startup shortcut
    echo Please run this script as Administrator and try again.
    echo.
)

pause

