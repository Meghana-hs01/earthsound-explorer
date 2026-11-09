@echo off
title EarthExplorer
echo ========================================================
echo   Launching EarthExplorer (NASA Space Apps Challenge)
echo   Unified App: Frontend + Backend on http://localhost:8000
echo ========================================================
cd /d "%~dp0\backend"
echo Opening app in your browser...
start "" http://localhost:8000
echo Running server...
.venv\Scripts\python.exe -m uvicorn main:app --port 8000
