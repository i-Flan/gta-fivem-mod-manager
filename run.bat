@echo off
setlocal
title Fivey
cd /d "%~dp0"

REM أضف مسار Node القياسي إن لم يكن على PATH
if exist "C:\Program Files\nodejs\npm.cmd" set "PATH=C:\Program Files\nodejs;%PATH%"

where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js is needed. Install the LTS version from https://nodejs.org then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" call npm install

echo.
echo Starting app... Keep this window open to see Discord bot logs.
echo Bot slash commands: /list  /refresh  /image  /help
echo Old commands are removed automatically when the bot starts.
echo.

call npm run dev
