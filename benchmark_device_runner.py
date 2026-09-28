#!/usr/bin/env python3
"""
AutoRIS Vietnamese ASR Benchmark Device Runner
Automates APK installation, permission granting, ADB profiling,
memory monitoring, battery/thermal tracking, and logcat metric harvesting
on Samsung Galaxy S24 Ultra (or connected Android devices).
"""

import subprocess
import sys
import time
import os
import re
import json

def run_adb(cmd, capture=True, text=True):
    full_cmd = ["adb"] + cmd
    try:
        res = subprocess.run(full_cmd, capture_output=capture, text=text, encoding="utf-8", errors="replace")
        return res
    except Exception as e:
        print(f"Error executing adb {' '.join(cmd)}: {e}")
        return None

def check_devices():
    res = run_adb(["devices", "-l"])
    if not res or res.returncode != 0:
        return []
    lines = res.stdout.strip().splitlines()
    devices = []
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            dev_id = parts[0]
            props = " ".join(parts[2:])
            devices.append({"id": dev_id, "props": props})
    return devices

def get_device_property(prop_name):
    res = run_adb(["shell", "getprop", prop_name])
    return res.stdout.strip() if res and res.returncode == 0 else ""

def get_battery_stats():
    res = run_adb(["shell", "dumpsys", "battery"])
    if not res or res.returncode != 0:
        return {}
    stats = {}
    for line in res.stdout.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            stats[k.strip()] = v.strip()
    return stats

def get_process_memory(package_name="com.autoris.asrbenchmark.debug"):
    res = run_adb(["shell", "dumpsys", "meminfo", package_name])
    if not res or res.returncode != 0:
        return {}
    
    total_pss = 0
    native_heap = 0
    java_heap = 0
    
    for line in res.stdout.splitlines():
        if "TOTAL PSS:" in line:
            m = re.search(r"TOTAL PSS:\s+(\d+)", line)
            if m:
                total_pss = int(m.group(1)) // 1024 # KB to MB
        elif "TOTAL:" in line and total_pss == 0:
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                total_pss = int(parts[1]) // 1024
    
    return {"total_pss_mb": total_pss}

def install_and_prepare(apk_path, package_name="com.autoris.asrbenchmark.debug"):
    print(f"[*] Installing APK: {apk_path} ...")
    res = run_adb(["install", "-r", "-d", apk_path])
    if res and res.returncode == 0 and "Success" in res.stdout:
        print("[+] APK installed successfully!")
    else:
        print(f"[-] APK install failed or warning: {res.stdout if res else 'Unknown error'}")

    print("[*] Granting RECORD_AUDIO permission...")
    run_adb(["shell", "pm", "grant", package_name, "android.permission.RECORD_AUDIO"])

    print("[*] Launching Main Activity...")
    run_adb(["shell", "am", "start", "-n", f"{package_name}/com.autoris.asrbenchmark.MainActivity"])
    print("[+] App launched!")

def monitor_device(package_name="com.autoris.asrbenchmark.debug", duration_sec=30):
    print(f"[*] Monitoring {package_name} for {duration_sec} seconds...")
    start_t = time.time()
    
    # Clear logcat
    run_adb(["logcat", "-c"])
    
    max_pss = 0
    while time.time() - start_t < duration_sec:
        mem = get_process_memory(package_name)
        pss = mem.get("total_pss_mb", 0)
        if pss > max_pss:
            max_pss = pss
            
        battery = get_battery_stats()
        temp_raw = float(battery.get("temperature", 0)) / 10.0
        level = battery.get("level", "N/A")
        
        print(f"  [T+{(time.time()-start_t):.0f}s] RAM PSS: {pss} MB (Peak: {max_pss} MB) | Battery: {level}% | Temp: {temp_raw:.1f}°C", end="\r")
        time.sleep(2)
        
    print(f"\n[+] Monitoring complete! Peak RAM: {max_pss} MB")
    
    # Collect logcat lines
    log_res = run_adb(["logcat", "-d", "-s", "ZipformerStreaming:V", "AudioRecorderManager:V", "MainViewModel:V"])
    logs = log_res.stdout if log_res else ""
    return {"peak_ram_mb": max_pss, "logs": logs}

def main():
    print("==================================================")
    print(" AutoRIS ViASR Benchmark Runner — S24 Ultra")
    print("==================================================")
    
    devices = check_devices()
    if not devices:
        print("[-] No active ADB devices found!")
        print("    To connect Samsung Galaxy S24 Ultra:")
        print("    1. Enable Developer Options: Settings > About phone > Software info > Tap 'Build number' 7 times.")
        print("    2. Enable USB Debugging in Developer Options.")
        print("    3. Connect USB cable to PC and tap 'Allow USB debugging' on the phone.")
        print("    Or for Wireless Debugging:")
        print("    4. Settings > Developer Options > Wireless debugging > Pair device with pairing code.")
        print("       Then run: adb pair <ip>:<port> <code / adb connect <ip>:<port>")
        sys.exit(0)
        
    device = devices[0]
    dev_id = device["id"]
    model = get_device_property("ro.product.model")
    manufacturer = get_device_property("ro.product.manufacturer")
    android_ver = get_device_property("ro.build.version.release")
    abi = get_device_property("ro.product.cpu.abi")
    
    print(f"[+] Connected Device: {manufacturer} {model} (ID: {dev_id})")
    print(f"    Android Version: {android_ver} (API {get_device_property('ro.build.version.sdk')})")
    print(f"    CPU Architecture: {abi}")
    
    apk_candidates = [
        "app/build/outputs/apk/debug/app-debug.apk",
        "app/build/outputs/apk/release/app-release-unsigned.apk"
    ]
    apk_to_install = None
    for a in apk_candidates:
        if os.path.exists(a):
            apk_to_install = a
            break
            
    if apk_to_install:
        install_and_prepare(apk_to_install)
        monitor_device()
    else:
        print("[-] APK not yet built. Please run: .\\gradlew.bat assembleDebug")

if __name__ == "__main__":
    main()
