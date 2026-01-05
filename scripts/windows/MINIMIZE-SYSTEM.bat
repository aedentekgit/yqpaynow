@echo off
REM This keeps the system running - minimized but not closed
REM Use this instead of closing everything

echo ========================================
echo  Minimize System (Keep Running)
echo ========================================
echo.
echo This will minimize Backend and Frontend windows
echo but keep them running in the background.
echo.
echo The POS system will continue working!
echo You can close the browser safely.
echo.
pause

REM Minimize all Node.js windows
powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -like '*Backend*' -or $_.MainWindowTitle -like '*Frontend*'} | ForEach-Object { $sig = '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);' ; Add-Type -MemberDefinition $sig -name NativeMethods -namespace Win32 ; [Win32.NativeMethods]::ShowWindow($_.MainWindowHandle, 6) }"

echo.
echo ========================================
echo  ✅ Windows minimized to taskbar
echo ========================================
echo.
echo Backend and Frontend are still running!
echo Close browser safely - printing will still work.
echo.
echo To bring windows back, click them in taskbar.
echo.
pause
