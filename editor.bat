@echo off
title Horse Tinder content editor
cd /d "%~dp0"
rem Edits www\js\content.js in the browser. Localhost only; backups go to tools\.backups\.
python tools\editor.py %*
pause
