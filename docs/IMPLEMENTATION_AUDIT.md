# AutoRIS Implementation Audit & Baseline Report (Phase 0)

**Date:** 2026-09-28  
**Target Device Platform:** Samsung Galaxy S24 Ultra / OnePlus Ace 5 (Qualcomm Snapdragon 8 Gen 3)  
**ASR Framework:** sherpa-onnx (Native C++ JNI via CPU / 4 threads)  
**Primary Reference Model:** `hynt/ZipFormer-150M-CR-CTC-RNNT-6000h` (100% On-Device, Zero Cloud)

---

## 1. Kiến trúc hiện tại (Current Architecture)

AutoRIS là hệ thống ASR dictation y khoa CĐHA (Radiology) chạy hoàn toàn cục bộ trên Android.

```
[Microphone (AudioRecord 16kHz Mono)]
                │
                ▼
    [AudioRecorderManager] (Monolithic: Capture + VAD + Slicing + ASR Dispatch + WAV Buffer)
        ├── Sliding Window Percentile VAD (15th percentile of 30-chunk buffer)
        └── 1.0s Natural Pause Detector
                │
                ▼
  [Zipformer150MOfflineEngine (JNI)]
        └── OfflineRecognizer (4 CPU threads)
                │
                ▼
   [MedicalTextNormalizer] (Regex dictionary & rule-based replacement)
        ├── Radiology phonetic fixes
        ├── Spine levels
        └── Compound numbers & dimensions
                │
                ▼
   [AccuracyEvaluator] (Levenshtein WER/CER + substring contains() matching)
                │
                ▼
   [MainViewModel & HomeScreen Compose UI]
        ├── SQLite DB (BenchmarkDatabase)
        └── Local PC Server Sync (BenchmarkSyncClient -> benchmark_server.py)
```

---

## 2. Điểm mạnh (Strengths)

1. **Hiệu năng suy luận đỉnh cao trên Snapdragon 8 Gen 3:**
   - Model ZipFormer 150M (~153M parameters) chạy trên 4 CPU threads với thời gian giải mã thực tế chỉ **104ms – 175ms** cho mỗi phân đoạn 3–5 giây.
   - RTF thực tế đạt **0.015 – 0.035** (nhanh hơn thời gian thực 30 đến 60 lần).
2. **Tiêu thụ tài nguyên tối ưu:**
   - RAM trung bình chỉ **330 MB – 410 MB**, RAM peak khi nạp ONNX khoảng **520 MB – 560 MB** (hoàn toàn an toàn trên máy 12GB–16GB RAM).
   - Nhiệt độ pin ổn định ở **35.8°C – 36.5°C**, không bị hiện tượng throttling.
3. **Thu âm liên tục không gián đoạn:**
   - Micro ghi âm xuyên suốt toàn bộ ca đọc, không ngắt quãng hay mất âm tiết giữa các câu.
   - Toàn bộ file WAV 16kHz được lưu trữ trọn vẹn.
4. **Hạ tầng kiểm thử & đồng bộ tự động:**
   - Server PC nội bộ (`benchmark_server.py`) nhận dữ liệu JSON + WAV và hiển thị dashboard phân tích tức thì.
   - Đã thu thập 21 phiên test thực tế từ bác sĩ trên điện thoại.

---

## 3. Các Bug, Lỗ hổng và Hạn chế đã xác định (Bugs & Architectural Issues)

1. **Kiến trúc AudioRecorderManager bị nguyên khối (Monolithic Coupling):**
   - Lớp `AudioRecorderManager` vừa quản lý capture phần cứng, vừa tính toán RMS, vừa tracking VAD, vừa cắt audio segment, vừa điều phối ASR thread, vừa tích lũy buffer.
   - Chưa có tầng trừu tượng (abstraction) cho **AudioPreprocessor**, **VadEngine**, **SpeakerGate**, **AudioCapture**.
2. **Không có khả năng can thiệp bộ lọc khử ồn (Preprocessing Pipeline):**
   - Hiện tại chưa hỗ trợ chuyển đổi linh hoạt giữa `RAW`, `ANDROID_NS`, `ANDROID_NS_AGC`, `DPDFNET`, `ANDROID_NS_DPDFNET`.
   - Chưa kiểm tra runtime capability của phần cứng Android (`NoiseSuppressor.isAvailable()`, `AcousticEchoCanceler.isAvailable()`, `AutomaticGainControl.isAvailable()`).
3. **VAD còn hạn chế với môi trường nhiều người nói:**
   - VAD hiện tại chỉ dựa trên mức năng lượng âm thanh (Energy-based percentile).
   - Khi có người khác nói to ở hậu cảnh (background speaker) hoặc tiếng tivi/nhạc, VAD năng lượng có thể kích hoạt sai và đưa giọng nói ngoài luồng vào bản báo cáo y khoa.
4. **Thiếu Speaker Gate / Voice Lock:**
   - Chưa có cơ chế enrollment giọng của bác sĩ phụ trách ca đọc để xác thực `ACCEPT`, `REJECT`, `UNCERTAIN`.
5. **MedicalTextNormalizer chưa được mô-đun hóa (Monolithic Regex):**
   - Chưa tách biệt các parser chuyên biệt: `VietnameseNumberParser`, `MeasurementParser`, `DimensionParser`, `RangeParser`, `PercentageParser`, `VolumeParser`, `SpineLevelParser`, `MedicalPhraseNormalizer`.
   - Nguy cơ cao phát sinh regression khi sửa một luật làm hỏng luật khác.
6. **AccuracyEvaluator đánh giá thực thể bằng `contains()` lỏng lẻo:**
   - Độ chính xác thuật ngữ, giải phẫu, số đo đang dùng chuỗi con `contains()`, dẫn đến sai số thống kê (false positive) hoặc bỏ sót đảo nghĩa (ví dụ: *"không giãn"* vs *"giãn"*).
   - Chưa so sánh dựa trên thực thể có cấu trúc: `MeasurementEntity`, `DimensionEntity`, `SpineLevelEntity`, `NegationEntity`, `LateralityEntity`.
   - Thiếu chỉ số **Critical Error Rate**.

---

## 4. Kiểm toán Metric (Metric Audit: Sai & Thiếu)

### 4.1. Metric sai / Chưa chuẩn xác:
- **`firstPartialMs`:** Hiện tại đang gán bằng độ trễ của segment đầu tiên (`first_segment_result_latency_ms`), không phải true streaming partial latency.
- **`rtf`:** Trong một số phiên test trước, RTF bị ghi nhận là `0.0` do `processingMs` tích lũy chưa được nối đúng từ các segment chạy ngầm.
- **`numericAccuracy`:** Bị đánh giá 0.0 nếu chuỗi số không trùng khớp từng ký tự với reference dù giá trị định lượng thực tế tương đương.

### 4.2. Metric thiếu theo chuẩn Benchmark V2:
- `session_id`, `android_version`, `cpu_info`, `num_threads`.
- **Thông tin phòng & tiếng ồn:** `room_id`, `room_type`, `noise_type`, `noise_level`, `speaker_distance_cm`, `mic_orientation_deg`.
- **Preprocessing:** `preprocessing_profile`, `vad_segment_count`, `vad_total_speech_ms`.
- **Speaker Gate:** `speaker_lock_enabled`, `speaker_confidence`, `speaker_rejection`.
- **Phân tách WER/CER:** `wer_raw`, `cer_raw`, `wer_normalized`, `cer_normalized`.
- **Độ chính xác thực thể chuyên biệt:** `measurement_accuracy`, `laterality_accuracy`, `spine_level_accuracy`, `dimension_accuracy`, `range_accuracy`, `percentage_accuracy`, `volume_accuracy`.
- **Critical Errors (Lỗi nghiêm trọng y khoa):**
  - `critical_numeric_error`
  - `critical_measurement_error`
  - `critical_negation_error`
  - `critical_laterality_error`
  - `critical_spine_error`
- **Độ trễ phân tách:** `first_segment_result_latency_ms`, `true_partial_latency_ms`, `final_latency_ms`, `processing_ms`, `rtf`.

---

## 5. Kiểm toán Tài nguyên Kiểm thử Tiếng Anh & Mô hình (English Test Assets & Model Audit)

### 5.1. Kết quả quét tài nguyên Tiếng Anh (English Assets Scan):
- **Phạm vi quét:** Toàn bộ thư mục `E:\Code linh tinh\`, `AutoRIS`, và thư mục người dùng `Downloads`.
- **Kết quả:** Không tìm thấy file âm thanh (`.wav`, `.mp3`, `.flac`, `.pcm`) hoặc transcript tiếng Anh có sẵn nào trên đĩa.
- **Kế hoạch cho Phase 9 (ENGLISH_FRONTEND):**
  - Vì mục tiêu của English track là **kiểm tra tiền xử lý (preprocessing) có làm méo mó, biến dạng giọng nói, gây clipping hay cắt xén tín hiệu âm thanh hay không**, ta sẽ triển khai bộ kiểm thử Frontend Audio Test Bench.
  - Sử dụng tín hiệu kiểm chuẩn (chuẩn hóa âm phổ, SNR, speech preservation, dynamic range, clipping metric) và bộ dữ liệu synthetic / downloaded reference chuẩn mà không phụ thuộc vào bất kỳ dịch vụ đám mây nào.

### 5.2. Vị trí các tệp mô hình (Model Assets Location):
- **ZipFormer 30M Streaming:** Tích hợp trong APK tại `app/src/main/assets/model/` (`encoder.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`).
- **ZipFormer 150M Offline:** Lưu trữ tại `models/zipformer-150m/` và `model_cache/` trên máy chủ PC, và được nạp vào bộ nhớ trong của điện thoại tại `context.filesDir/zipformer_150m_offline/`.
- **DPDFNet ONNX:** Sẽ được cấu hình downloader cục bộ và đường dẫn nạp runtime trong Phase 3.

---

## 6. Lộ trình triển khai (Execution Roadmap)

- **Phase 1:** Chuẩn hóa Session Benchmark Schema (đầy đủ các trường room, noise, distance, speaker lock, critical error flags, latency chuẩn).
- **Phase 2:** Tách trừu tượng hóa Audio Preprocessing (`AudioCapture`, `AudioPreprocessor`, `VadEngine`, `SpeakerGate`, `AsrEngine`) và phát hiện tính năng phần cứng Android.
- **Phase 3:** Tích hợp bộ tiền xử lý DPDFNet ONNX streaming-capable với fallback an toàn.
- **Phase 4:** Mô hình phòng thích ứng (`NoiseScenario.kt`, `NoiseProfile.kt`).
- **Phase 5:** Tích hợp Neural VAD song song cùng Energy VAD fallback.
- **Phase 6:** Voice Lock / Speaker Gate (`ACCEPT`, `REJECT`, `UNCERTAIN`).
- **Phase 7:** Tái cấu trúc bộ chuẩn hóa Y khoa thành các parser chuyên biệt kèm regression unit test.
- **Phase 8:** Structured Medical Evaluator với entity parsing và critical error detection.
- **Phase 9:** English Frontend Benchmark Track (đánh giá bảo toàn tín hiệu âm thanh).
- **Phase 10:** Giao diện Noise Lab trên Android.
- **Phase 11:** Ma trận Benchmark đa phòng cấu hình JSON/YAML.
- **Phase 12:** Script phân tích kết quả chuyên sâu `analyze_noise_benchmark.py`.
- **Phase 13:** Thuật toán tự động chọn profile tiền xử lý (`PreprocessingPolicy.kt`).
- **Phase 14:** Safety Gate kiểm duyệt an toàn trước khi đẩy sang hệ thống RIS.
- **Phase 15:** Tích hợp RIS và hoàn thiện tài liệu.
