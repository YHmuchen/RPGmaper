@echo off
chcp 65001 >nul
title RPGmaper - 启动器生成工具

echo 将 mtool 的 "与工具一同启动.bat" 拖到这个窗口，然后按回车
echo.
set /p MTOOL_BAT="路径: "

REM 检查文件是否存在
if not exist "%MTOOL_BAT%" (
    echo 文件不存在，请重试
    pause
    exit /b 1
)

echo 正在解析 mtool 配置...
node "%~dp0scripts\gen-launcher.js" "%MTOOL_BAT%"

echo.
echo 已生成:
echo   launch.bat      - 一键启动游戏+mtool+地图监听
echo   restore-cdp.bat - 关闭游戏后恢复 package.json
echo.
echo 使用方法:
echo   1. 双击 launch.bat
echo   2. 游戏和 mtool 自动启动，CDP 远程调试已开启
echo   3. 玩完游戏后，双击 restore-cdp.bat 恢复配置
echo.
pause
