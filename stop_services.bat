@echo off
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 stop_services.py
) else (
    python stop_services.py
)

if %errorlevel% neq 0 pause
