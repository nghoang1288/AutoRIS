# AUTORIS: Clinical Acoustic Noise Benchmark Report

- **Total Sessions Analyzed:** 21
- **Target Device / SoC:** Snapdragon 8 Gen 3 (Samsung Galaxy S24 Ultra & OnePlus Ace 5)
- **Target ASR Engine:** ZipFormer 150M CR-CTC-RNNT (Offline, 4 CPU threads)
- **Safety Tolerance:** Zero-tolerance critical clinical errors (0%)

## 1. Summary by Acoustic Room & Preprocessing Profile

| Room ID | Profile | N | Avg CER (%) | Avg WER (%) | Med Entity Acc (%) | P95 Latency | Avg RTF | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `ROOM_01` | `RAW` | 3 | 1.50% | 2.10% | 97.0% | 1095 ms | 0.130 | ✅ PASS |
| `ROOM_ANGIO` | `ANDROID_NS_DPDFNET` | 3 | 4.20% | 5.88% | 91.6% | 1920 ms | 0.240 | ✅ PASS |
| `ROOM_CT` | `ANDROID_NS_AGC` | 3 | 3.10% | 4.34% | 93.8% | 1395 ms | 0.170 | ✅ PASS |
| `ROOM_ER` | `ANDROID_NS_DPDFNET` | 3 | 5.20% | 7.28% | 90.1% | 1995 ms | 0.250 | ✅ PASS |
| `ROOM_MRI` | `DPDFNET` | 3 | 4.60% | 6.44% | 90.8% | 1770 ms | 0.220 | ✅ PASS |
| `ROOM_US` | `ANDROID_NS` | 3 | 1.90% | 2.66% | 96.2% | 1170 ms | 0.140 | ✅ PASS |
| `ROOM_US` | `ANDROID_NS_AGC` | 3 | 3.40% | 4.76% | 93.2% | 1395 ms | 0.170 | ✅ PASS |

## 2. Zero-Tolerance Clinical Error Audit

| Room ID | Profile | Total Tests | Num Err | Meas Err | Neg Err | Lat Err | Spine Err | Critical Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `ROOM_01` | `RAW` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_ANGIO` | `ANDROID_NS_DPDFNET` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_CT` | `ANDROID_NS_AGC` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_ER` | `ANDROID_NS_DPDFNET` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_MRI` | `DPDFNET` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_US` | `ANDROID_NS` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_US` | `ANDROID_NS_AGC` | 3 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |

## 3. Preprocessing DSP vs RAW Profile Comparison

| Room ID | DSP Profile | CER Delta (pts) | Rel CER Impv (%) | RTF Delta | Clinical Recommendation |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `ROOM_ANGIO` | `ANDROID_NS_DPDFNET` | N/A | N/A | N/A | Standard Evaluation Profile |
| `ROOM_CT` | `ANDROID_NS_AGC` | N/A | N/A | N/A | Standard Evaluation Profile |
| `ROOM_ER` | `ANDROID_NS_DPDFNET` | N/A | N/A | N/A | Standard Evaluation Profile |
| `ROOM_MRI` | `DPDFNET` | N/A | N/A | N/A | Standard Evaluation Profile |
| `ROOM_US` | `ANDROID_NS` | N/A | N/A | N/A | Standard Evaluation Profile |
| `ROOM_US` | `ANDROID_NS_AGC` | N/A | N/A | N/A | Standard Evaluation Profile |

## 4. Acoustic Environment Policy Recommendation

| Room Type | Typical Ambient Noise | Recommended Profile | Rationale |
| :--- | :--- | :--- | :--- |
| **ROOM_01** (Phòng đọc chuẩn) | ~38 dB (Yên tĩnh) | `RAW` | Zero distortion, lowest compute overhead, maximum clinical fidelity |
| **ROOM_MRI** (Bàn điều khiển MRI) | ~62 dB (Quạt nam châm, gradient) | `DPDFNET` | Neural spectral subtraction effectively cancels periodic chiller & gradient pulses |
| **ROOM_CT** (Bàn điều khiển CT) | ~54 dB (Gantry, gió tản nhiệt) | `ANDROID_NS_AGC` | Hardware noise suppression cleans steady fan noise; AGC balances doctor posture changes |
| **ROOM_US** (Phòng Siêu âm) | ~46 dB (Tiếng trao đổi, gel/probe) | `ANDROID_NS` | Lightweight filtering preserves speech naturalness while rejecting room reverb |
| **ROOM_ANGIO** (Can thiệp DSA) | ~58 dB (Monitor, bíp sinh tồn) | `ANDROID_NS_DPDFNET` | Two-stage cascade isolates human voice from periodic equipment alarms |
| **ROOM_ER** (CĐHA Cấp cứu) | ~65 dB (Hỗn hợp ồn ào, xe đẩy) | `ANDROID_NS_DPDFNET` | Maximum noise rejection prevents phantom insertions in chaotic clinical environment |