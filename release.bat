@echo off
setlocal
title AmyMusic 1-Click Release
set PATH=%~dp0node-v20.18.0-win-x64;%PATH%
node scripts/release.cjs %*
pause
