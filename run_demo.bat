@echo off
title NullWasted - Interactive UI Testing Demo Launcher
echo ============================================================================
echo   NULLWASTED: AUTONOMOUS AI-POWERED SURPLUS FOOD MARKETPLACE
echo   Starting Local Backend (Port 8000) and Frontend PWA (Port 5173)...
echo ============================================================================

cd /d "%~dp0"
set "NODE_OPTIONS="

echo [1/3] Starting FastAPI Backend Server on http://localhost:8000 ...
start "NullWasted Backend API" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/3] Starting React Vite PWA on http://localhost:5173 ...
start "NullWasted Frontend PWA" cmd /k "cd /d "%~dp0frontend" && set "NODE_OPTIONS=" && npm run dev -- --host 0.0.0.0 --port 5173"

echo [3/3] Waiting 4 seconds before opening browser...
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo.
echo Both servers are launching in separate terminal windows.
echo - Frontend UI : http://localhost:5173
echo - Backend Docs: http://localhost:8000/docs
echo ============================================================================
