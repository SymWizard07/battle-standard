@echo off
setlocal
cd /d "C:\Users\cade0\source\repos\5e Battle Map Website\companion\tray\resources\host"
where node >nul 2>nul
if %ERRORLEVEL%==0 (
  node "C:\Users\cade0\source\repos\5e Battle Map Website\companion\tray\resources\host\main.js"
  exit /b %ERRORLEVEL%
)
if defined BATTLE_STANDARD_ELECTRON_NODE (
  set ELECTRON_RUN_AS_NODE=1
  "%BATTLE_STANDARD_ELECTRON_NODE%" "C:\Users\cade0\source\repos\5e Battle Map Website\companion\tray\resources\host\main.js"
  exit /b %ERRORLEVEL%
)
echo Node.js not found. Install Node or set BATTLE_STANDARD_ELECTRON_NODE to Electron.exe >&2
exit /b 1
