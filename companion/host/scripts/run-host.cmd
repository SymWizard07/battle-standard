@echo off
REM Launcher for Chrome native messaging — path must be absolute in host manifest.
cd /d "%~dp0.."
node dist\main.js
