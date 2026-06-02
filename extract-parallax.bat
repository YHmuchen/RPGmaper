@echo off
chcp 65001 >nul
echo 确保游戏已用 --remote-debugging-port=9222 启动
echo.
node scripts/extract-parallax.js
echo.
pause
