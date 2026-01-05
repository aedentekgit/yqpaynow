@echo off
REM ============================================
REM Create Desktop Shortcut for YQPay Auto-Print
REM ============================================

echo.
echo Creating desktop shortcut...
echo.

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Create VBS script to make shortcut
echo Set oWS = WScript.CreateObject("WScript.Shell") > CreateShortcut.vbs
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\YQPay Auto-Print.lnk" >> CreateShortcut.vbs
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> CreateShortcut.vbs
echo oLink.TargetPath = "%SCRIPT_DIR%\START-HERE.bat" >> CreateShortcut.vbs
echo oLink.WorkingDirectory = "%SCRIPT_DIR%" >> CreateShortcut.vbs
echo oLink.Description = "YQPay Auto-Print System - Start with one click" >> CreateShortcut.vbs
echo oLink.IconLocation = "C:\Windows\System32\imageres.dll,103" >> CreateShortcut.vbs
echo oLink.Save >> CreateShortcut.vbs

REM Run the VBS script
cscript CreateShortcut.vbs >nul

REM Clean up
del CreateShortcut.vbs

echo.
echo ===========================================
echo   SUCCESS!
echo ===========================================
echo.
echo A shortcut has been created on your desktop:
echo    "YQPay Auto-Print"
echo.
echo Just double-click it to start auto-printing!
echo.
pause
