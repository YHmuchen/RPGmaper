@echo off
title RPGmaper - Setup Launcher

echo Drag mtool's start batch file onto this window and press Enter
echo.
set /p MTOOL_BAT="Path: "

if not exist "%MTOOL_BAT%" (
    echo File not found: %MTOOL_BAT%
    pause
    exit /b 1
)

echo Generating launcher...
node "%~dp0scripts\gen-launcher.js" "%MTOOL_BAT%"

echo.
echo Generated:
echo   launch.bat      - Start game + mtool + map watcher
echo   restore-cdp.bat - Restore package.json after playing
echo.
pause
