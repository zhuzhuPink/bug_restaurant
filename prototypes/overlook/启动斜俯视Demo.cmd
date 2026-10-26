@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
if not exist "node_modules\three\build\three.module.js" (
  echo [Demo] Missing dependency. Please run npm install in this folder first.
  pause
  exit /b 1
)
if exist "..\..\node_modules\electron\dist\electron.exe" (
  start "" "..\..\node_modules\electron\dist\electron.exe" "%~dp0electron.cjs"
) else (
  echo [Demo] Electron not found. Run npm run dev and open http://127.0.0.1:5178
  pause
)
endlocal
