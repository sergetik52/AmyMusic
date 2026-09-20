@echo off
chcp 65001 >nul
echo =========================================
echo   AmyMusic: Быстрый Git-коммит и сборка EXE
echo =========================================
echo.

set /p msg="Введите текст коммита (или нажмите Enter для 'Auto update'): "
if "%msg%"=="" set msg=Auto update

echo.
echo [1/3] Сохраняем изменения в Git...
git add .
git commit -m "%msg%"
git push origin main

echo.
echo [2/3] Закрываем работающий AmyMusic.exe (чтобы избежать ошибки доступа)...
taskkill /F /IM AmyMusic.exe /T >nul 2>&1

echo.
echo [3/3] Запускаем сборку...
call npm run package:windows

echo.
echo =========================================
echo   Готово! Установщик лежит в папке release\
echo =========================================
pause
