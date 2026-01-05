@echo off
REM Create desktop shortcut for easy access

echo ========================================
echo  Create Desktop Shortcuts
echo ========================================
echo.

set DESKTOP=%USERPROFILE%\Desktop

REM Create START-ALL shortcut
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\YQ PAY - Start System.lnk'); $Shortcut.TargetPath = 'D:\1\START-ALL.bat'; $Shortcut.IconLocation = 'shell32.dll,137'; $Shortcut.Save()"

REM Create CHECK-STATUS shortcut
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\YQ PAY - Check Status.lnk'); $Shortcut.TargetPath = 'D:\1\CHECK-STATUS.bat'; $Shortcut.IconLocation = 'shell32.dll,210'; $Shortcut.Save()"

REM Create MINIMIZE shortcut
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\YQ PAY - Minimize Windows.lnk'); $Shortcut.TargetPath = 'D:\1\MINIMIZE-SYSTEM.bat'; $Shortcut.IconLocation = 'shell32.dll,238'; $Shortcut.Save()"

echo.
echo ========================================
echo  ✅ Shortcuts created on Desktop!
echo ========================================
echo.
echo You now have 3 desktop shortcuts:
echo.
echo  🚀 YQ PAY - Start System
echo  📊 YQ PAY - Check Status  
echo  📉 YQ PAY - Minimize Windows
echo.
echo ========================================
pause
