@echo off
echo ================================================================
echo   CAI DAT AUTO-RIS VI ASR BENCHMARK LEN SAMSUNG GALAXY S24 ULTRA
echo ================================================================

adb devices
echo.
echo Dang cai dat APK: release_apk\ViASRBenchmark_S24Ultra.apk ...
adb install -r -d "release_apk\ViASRBenchmark_S24Ultra.apk"

if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Khong the cai dat APK qua ADB.
    echo Vui long kiem tra:
    echo 1. Da bat USB Debugging tren dien thoai chua?
    echo 2. Dien thoai da bam 'Cho phep go loi USB' (Allow USB debugging) chua?
    echo 3. Co the copy truc tiep file 'release_apk\ViASRBenchmark_S24Ultra.apk' vao may va mo de cai dat.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [+] Cap quyen MICROPHONE cho app...
adb shell pm grant com.autoris.asrbenchmark.debug android.permission.RECORD_AUDIO

echo.
echo [+] Khoi dong ung dung tren Samsung Galaxy S24 Ultra...
adb shell am start -n com.autoris.asrbenchmark.debug/com.autoris.asrbenchmark.MainActivity

echo.
echo ================================================================
echo   CAI DAT VA KHOI DONG THANH CONG!
echo ================================================================
pause
