@echo off
chcp 65001 >nul
title AutoRIS Extension - Tự Động Cập Nhật 1-Click
cls
echo ==========================================================
echo        AUTORIS EXTENSION - TỰ ĐỘNG CẬP NHẬT 1-CLICK
echo ==========================================================
echo.
echo [*] Đang tải bản phát hành mới nhất từ máy chủ AutoRIS VPS...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://autoris.hoang.qzz.io/autoris-extension.zip' -OutFile 'update_temp.zip'"
if not exist update_temp.zip (
    echo [!] Không thể tải bản cập nhật từ máy chủ. Vui lòng kiểm tra kết nối mạng.
    pause
    exit /b 1
)

echo [*] Đang tự động giải nén và ghi đè vào thư mục hiện tại...
powershell -Command "Expand-Archive -Path 'update_temp.zip' -DestinationPath '.' -Force"
del /f /q update_temp.zip >nul 2>&1

echo.
echo ==========================================================
echo [OK] ĐÃ CẬP NHẬT EXTENSION LÊN PHIÊN BẢN MỚI NHẤT THÀNH CÔNG!
echo ==========================================================
echo.
echo Bác sĩ chỉ cần:
echo  1. Mở trình duyệt Chrome vào trang: chrome://extensions
echo  2. Bấm nút [Reload] (biểu tượng mũi tên xoay tròn 🔄) của AutoRIS.
echo.
pause
