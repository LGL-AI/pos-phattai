@echo off
setlocal
cd /d "%~dp0"
node --version
if errorlevel 1 goto fail
call npm ci
if errorlevel 1 goto fail
call npm run deploy:remote
if errorlevel 1 goto fail
call npm run check:cloud
if errorlevel 1 goto fail
echo PHAT TAI v1.6.2 deployment verified.
pause
exit /b 0
:fail
echo Deployment stopped. Read the error above; do not treat it as successful.
pause
exit /b 1
