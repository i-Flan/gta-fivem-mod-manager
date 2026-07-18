@echo off
setlocal
title Fivey (Admin + Bot)
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

REM يقرأ توكن Discord من ملف token.txt المحلي (غير مرفوع على GitHub).
REM ضع توكن البوت في السطر الأول من token.txt بجوار هذا الملف.
if exist "token.txt" (
  set /p DISCORD_BOT_TOKEN=<token.txt
) else (
  echo [تنبيه] لم يوجد token.txt — البرنامج سيشتغل بدون بوت Discord.
  echo         لتشغيل البوت: انسخ توكن البوت داخل ملف token.txt هنا.
)

echo.
echo Starting app (admin mode)... اترك النافذة مفتوحة لرؤية سجل البوت.
echo.

call npm run dev
