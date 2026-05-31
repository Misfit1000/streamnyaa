@echo off
setlocal
pushd "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\prepare-desktop-frontend.ps1"
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
