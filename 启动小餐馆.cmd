@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\start-bistro.ps1"
if errorlevel 1 pause
