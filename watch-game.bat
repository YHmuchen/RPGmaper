@echo off
chcp 65001 >nul
echo Listening for map changes...
echo Make sure the game is started with --remote-debugging-port=9222
echo.
node scripts/watch-game.js
pause
