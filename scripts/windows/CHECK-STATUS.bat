@echo off
echo ========================================
echo  YQ PAY System Status Check
echo ========================================
echo.

REM Check Backend
echo [1/3] Backend Status:
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8080/api/health' -TimeoutSec 3 -UseBasicParsing ; Write-Host '  ✅ Running on port 8080' -ForegroundColor Green } catch { Write-Host '  ❌ Not running' -ForegroundColor Red }"
echo.

REM Check Frontend  
echo [2/3] Frontend Status:
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000' -TimeoutSec 3 -UseBasicParsing ; Write-Host '  ✅ Running on port 3000' -ForegroundColor Green } catch { Write-Host '  ❌ Not running' -ForegroundColor Red }"
echo.

REM Check POS Agent
echo [3/3] POS Agent Status:
if exist "D:\1\backend\pos-agent\agent.log" (
    powershell -Command "$log = Get-Content 'D:\1\backend\pos-agent\agent.log' -Tail 5 ; $connected = $log | Select-String 'SSE Connected' ; if ($connected) { Write-Host '  ✅ Connected and ready' -ForegroundColor Green ; $log | Select-String 'Connection confirmed' | Select-Object -Last 1 } else { Write-Host '  ⚠️  Agent running but not connected' -ForegroundColor Yellow }"
) else (
    echo   ❌ Not running (no log file)
)

echo.
echo ========================================
echo  Recent Agent Activity:
echo ========================================
if exist "D:\1\backend\pos-agent\agent.log" (
    powershell -Command "Get-Content 'D:\1\backend\pos-agent\agent.log' -Tail 10"
) else (
    echo No activity logged yet
)

echo.
echo ========================================
pause
