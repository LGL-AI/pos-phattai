@echo off
setlocal
cd /d "%~dp0"
call npm ci --no-audit --no-fund
if errorlevel 1 exit /b %errorlevel%
call npm run deploy:remote
exit /b %errorlevel%
