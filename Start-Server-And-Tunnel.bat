@echo off
chcp 65001 >nul
title Key2lix - السيرفر + الرابط العام
cd /d "%~dp0"

echo.
echo  Key2lix: تشغيل السيرفر وفتح الرابط العام...
echo.

node scripts\start-server-and-tunnel.js

pause
