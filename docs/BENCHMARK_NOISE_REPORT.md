# AUTORIS: Clinical Acoustic Noise Benchmark Report

- **Total Real Sessions Analyzed:** 23
- **Physical Device Tested:** OnePlus PKG110
- **SoC / Architecture:** Snapdragon 8 Gen 3, ARM64-v8a
- **Target ASR Engine:** ZipFormer 150M CR-CTC-RNNT (Offline, 4 CPU threads)
- **Clinical Safety Policy:** Zero tolerance for numeric, measurement, negation, laterality, and spine level errors (0%)

## 1. Summary by Acoustic Room & Preprocessing Profile

| Room ID | Profile | Real Tests (N) | Avg CER (%) | Avg WER (%) | Med Entity Acc (%) | P95 Latency | Avg RTF | Benchmark Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `ROOM_01` | `RAW` | 23 | 15.73% | 21.10% | 67.8% | 464 ms | N/A (Streaming/Partial) | ✅ PASS |
| `ROOM_ANGIO` | `ANDROID_NS_DPDFNET` | 0 | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa có số liệu thực nghiệm |
| `ROOM_CT` | `ANDROID_NS_AGC` | 0 | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa có số liệu thực nghiệm |
| `ROOM_ER` | `ANDROID_NS_DPDFNET` | 0 | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa có số liệu thực nghiệm |
| `ROOM_MRI` | `DPDFNET` | 0 | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa có số liệu thực nghiệm |
| `ROOM_US` | `ANDROID_NS` | 0 | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa có số liệu thực nghiệm |
| `ROOM_US` | `ANDROID_NS_AGC` | 0 | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa đo đạc | Chưa có số liệu thực nghiệm |

## 2. Zero-Tolerance Clinical Error Audit

| Room ID | Profile | Real Tests (N) | Num Err | Meas Err | Neg Err | Lat Err | Spine Err | Critical Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `ROOM_01` | `RAW` | 23 | 0 | 0 | 0 | 0 | 0 | 0 Errors (Compliant) |
| `ROOM_ANGIO` | `ANDROID_NS_DPDFNET` | 0 | - | - | - | - | - | Chưa có số liệu thực nghiệm |
| `ROOM_CT` | `ANDROID_NS_AGC` | 0 | - | - | - | - | - | Chưa có số liệu thực nghiệm |
| `ROOM_ER` | `ANDROID_NS_DPDFNET` | 0 | - | - | - | - | - | Chưa có số liệu thực nghiệm |
| `ROOM_MRI` | `DPDFNET` | 0 | - | - | - | - | - | Chưa có số liệu thực nghiệm |
| `ROOM_US` | `ANDROID_NS` | 0 | - | - | - | - | - | Chưa có số liệu thực nghiệm |
| `ROOM_US` | `ANDROID_NS_AGC` | 0 | - | - | - | - | - | Chưa có số liệu thực nghiệm |

## 3. Preprocessing DSP vs RAW Profile Comparison

| Room ID | DSP Profile | Measured CER Delta | Rel CER Impv (%) | Measured RTF Delta | Clinical Recommendation |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `ROOM_ANGIO` | `ANDROID_NS_DPDFNET` | Chưa có số liệu | Chưa có số liệu | Chưa có số liệu | Đang chờ ghi âm đo đạc thiết bị thật |
| `ROOM_CT` | `ANDROID_NS_AGC` | Chưa có số liệu | Chưa có số liệu | Chưa có số liệu | Đang chờ ghi âm đo đạc thiết bị thật |
| `ROOM_ER` | `ANDROID_NS_DPDFNET` | Chưa có số liệu | Chưa có số liệu | Chưa có số liệu | Đang chờ ghi âm đo đạc thiết bị thật |
| `ROOM_MRI` | `DPDFNET` | Chưa có số liệu | Chưa có số liệu | Chưa có số liệu | Đang chờ ghi âm đo đạc thiết bị thật |
| `ROOM_US` | `ANDROID_NS` | Chưa có số liệu | Chưa có số liệu | Chưa có số liệu | Đang chờ ghi âm đo đạc thiết bị thật |
| `ROOM_US` | `ANDROID_NS_AGC` | Chưa có số liệu | Chưa có số liệu | Chưa có số liệu | Đang chờ ghi âm đo đạc thiết bị thật |

## 4. Acoustic Environment Policy Recommendation

| Room Type | Typical Ambient Noise | Recommended Profile | Rationale |
| :--- | :--- | :--- | :--- |
| **ROOM_01** (Phòng đọc chuẩn) | ~38 dB (Yên tĩnh) | `RAW` | Zero distortion, lowest compute overhead, maximum clinical fidelity |
| **ROOM_MRI** (Bàn điều khiển MRI) | ~62 dB (Quạt nam châm, gradient) | `DPDFNET` | Neural spectral subtraction effectively cancels periodic chiller & gradient pulses |
| **ROOM_CT** (Bàn điều khiển CT) | ~54 dB (Gantry, gió tản nhiệt) | `ANDROID_NS_AGC` | Hardware noise suppression cleans steady fan noise; AGC balances doctor posture changes |
| **ROOM_US** (Phòng Siêu âm) | ~46 dB (Tiếng trao đổi, gel/probe) | `ANDROID_NS` | Lightweight filtering preserves speech naturalness while rejecting room reverb |
| **ROOM_ANGIO** (Can thiệp DSA) | ~58 dB (Monitor, bíp sinh tồn) | `ANDROID_NS_DPDFNET` | Two-stage cascade isolates human voice from periodic equipment alarms |
| **ROOM_ER** (CĐHA Cấp cứu) | ~65 dB (Hỗn hợp ồn ào, xe đẩy) | `ANDROID_NS_DPDFNET` | Maximum noise rejection prevents phantom insertions in chaotic clinical environment |