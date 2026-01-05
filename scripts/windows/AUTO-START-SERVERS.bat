@echo off
REM ========================================
REM Auto-Start YQPayNow Backend & Frontend
REM This script can be added to Windows Startup
REM ========================================

REM Get the script directory and navigate to project root
cd /d "%~dp0\..\.."

REM Set project root path
set PROJECT_ROOT=%CD%
set BACKEND_PATH=%PROJECT_ROOT%\backend
set FRONTEND_PATH=%PROJECT_ROOT%\frontend

echo ========================================
echo Auto-Starting YQPayNow Servers
echo ========================================
echo Project Root: %PROJECT_ROOT%
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js and try again.
    pause
    exit /b 1
)

REM Kill any existing Node processes (optional - comment out if you want to keep existing instances)
REM echo Killing existing Node processes...
REM taskkill /F /IM node.exe 2>nul
REM timeout /t 2 /nobreak >nul

echo.
echo Starting Backend Server (Port 5000)...
if exist "%BACKEND_PATH%\package.json" (
    start "YQPayNow Backend" cmd /k "cd /d %BACKEND_PATH% && npm run dev"
    echo Backend started in new window
) else (
    echo ERROR: Backend directory not found at %BACKEND_PATH%
)

REM Wait for backend to initialize
timeout /t 5 /nobreak >nul

echo.
echo Starting Frontend Server (Port 3000)...
if exist "%FRONTEND_PATH%\package.json" (
    start "YQPayNow Frontend" cmd /k "cd /d %FRONTEND_PATH% && npm start"
    echo Frontend started in new window
) else (
    echo ERROR: Frontend directory not found at %FRONTEND_PATH%
)

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo Servers Starting!
echo ========================================
echo Backend:  http://localhost:5000/api
echo Frontend: http://localhost:3000
echo ========================================
echo.
echo Both servers are starting in separate windows.
echo Wait 15-20 seconds for complete startup.
echo.
echo To stop servers, close the command windows.
echo ========================================

REM Minimize this window after starting
timeout /t 2 /nobreak >nul
exit

