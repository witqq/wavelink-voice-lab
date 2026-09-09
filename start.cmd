@echo off
cd /d "%~dp0"
if not exist "node_modules\ws" call npm install --omit=dev
node server.mjs
pause
