@echo off
chcp 65001 >nul
echo 监听游戏地图切换...
echo 确保游戏已用 --remote-debugging-port=9222 启动
echo.
node scripts/watch-game.js
pause
