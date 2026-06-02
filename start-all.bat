@echo off
chcp 65001 >nul

echo 正在启动游戏（带远程调试端口）...
start "" "C:\Users\Muchen\Desktop\oye\RPGmaper\Game.exe --remote-debugging-port=9222"
echo.
echo 请在 mtool 中拖入游戏 exe
echo 然后在本窗口按任意键启动地图监听...
echo.
pause >nul

echo 启动地图监听...
node "C:\Users\Muchen\Desktop\oye\RPGmaper\scripts\watch-game.js"
pause
