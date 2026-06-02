@echo off
chcp 65001 >nul

echo 检查依赖...
node -e "require('chrome-remote-interface')" 2>nul
if %errorlevel% neq 0 (
    echo 正在安装 chrome-remote-interface...
    npm install chrome-remote-interface
)

echo 启动地图导出...
echo 确保游戏已用 --remote-debugging-port=9222 启动
echo.

node scripts/export-maps.js

echo.
pause
