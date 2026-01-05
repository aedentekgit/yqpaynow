@echo off
REM Start POS Agent as hidden background service

echo Starting POS Agent Service (hidden)...

cd /d "%~dp0backend\pos-agent"

REM Run in background without window using VBScript
echo Set WshShell = CreateObject("WScript.Shell") > "%TEMP%\start-agent.vbs"
echo WshShell.Run "cmd /c cd /d %CD% && node agent-service.js", 0, False >> "%TEMP%\start-agent.vbs"
cscript //nologo "%TEMP%\start-agent.vbs"
del "%TEMP%\start-agent.vbs"

echo.
echo ========================================
echo  POS Agent running in background!
echo  No window will be visible
echo  Check: backend\pos-agent\agent.log
echo ========================================
echo.
pause
