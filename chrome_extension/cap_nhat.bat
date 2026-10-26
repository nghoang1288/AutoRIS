@echo off
cd /d "%~dp0"
title AutoRIS Extension - Tu Dong Cap Nhat
cls
echo ==========================================================
echo        AUTORIS EXTENSION - TU DONG CAP NHAT 1-CLICK
echo ==========================================================
echo.
echo [*] Dang tai ban cap nhat moi nhat tu may chu VPS...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;  = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://autoris.hoang.qzz.io/autoris-extension.zip' -OutFile '%~dp0update_temp.zip'"

if not exist "%~dp0update_temp.zip" (
    echo.
    echo [!] Khong the tai ban cap nhat tu may chu VPS.
    echo [*] Vui long kiem tra ket noi Internet hoac lien he quan tri vien.
    echo.
    pause
    exit /b 1
)

echo [*] Dang tu dong giai nen va cap nhat file...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%~dp0update_temp.zip' -DestinationPath '%~dp0.' -Force"
del /f /q "%~dp0update_temp.zip" >nul 2>&1

echo.
echo ==========================================================
echo [OK] DA CAP NHAT EXTENSION LEN BAN MOI NHAT THANH CONG!
echo ==========================================================
echo.
echo Bac si chi can:
echo  1. Mo trinh duyet Chrome vao trang: chrome://extensions
echo  2. Bam nut Reload (bieu tuong mui ten xoay tron) cua AutoRIS.
echo.
pause
