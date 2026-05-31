@echo off
setlocal
pushd "%~dp0..\.."
npm.cmd run dev:desktop
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
