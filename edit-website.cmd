@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install Node.js and try again.
  pause
  exit /b 1
)
set NEED_INSTALL=0
if not exist "node_modules\parse5\package.json" set NEED_INSTALL=1
if not exist "node_modules\marked\package.json" set NEED_INSTALL=1
if not exist "node_modules\sanitize-html\package.json" set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Please retry npm install.
    pause
    exit /b 1
  )
)
node tools/editor/start.mjs
if errorlevel 1 pause
