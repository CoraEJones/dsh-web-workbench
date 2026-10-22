@echo off
setlocal DisableDelayedExpansion
powershell.exe -NoProfile -File "%~dp0scripts\install-windows.ps1" %*
set "install_result=%errorlevel%"
echo.
if not "%install_result%"=="0" echo Installation failed. See the error above. No global full-access setting is needed.
pause
exit /b %install_result%
