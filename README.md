# AutoRIS: On-Device Vietnamese ASR Benchmark & Clinical Radiology Dictation

Hệ thống đánh giá hiệu năng (Benchmarking) và Nhận diện giọng nói Y khoa (ASR) chạy hoàn toàn cục bộ (**100% On-Device, Zero Cloud**) dành cho bác sĩ Chẩn đoán Hình ảnh (CĐHA / Radiology).

Hệ thống được thiết kế và tối ưu chuyên sâu cho các thiết bị di động đầu bảng trang bị vi xử lý **Snapdragon 8 Gen 3** (OnePlus Ace 5 / Samsung Galaxy S24 Ultra).

---

## 1. Tính năng cốt lõi (Core Features)

1. **Chế độ đọc liên tục với VAD bám ồn thích ứng (Adaptive Noise Floor VAD):**
   - Tự động theo dõi mức ồn nền của phòng đọc phim theo thời gian thực (phân vị thứ 15 của cửa sổ năng lượng trượt 3.0s).
   - Tự động phát hiện khi kết thúc câu (khoảng nghỉ ~1.0s) để cắt câu giải mã ngay lập tức.
   - **Ghi âm ngầm xuyên suốt:** Micro tiếp tục thu âm liên tục không làm mất âm tiết của các câu tiếp theo.

2. **Mô hình ASR ZipFormer 150M CR-CTC-RNNT (hynt/ZipFormer-150M-CR-CTC-RNNT-6000h):**
   - Kiến trúc Hybrid CTC + Transducer (RNN-T) ~153 triệu tham số, huấn luyện trên 6.000 giờ tiếng Việt.
   - Chạy trực tiếp qua JNI Sherpa-ONNX với 4 luồng CPU.
   - Độ trễ giải mã mỗi câu cực thấp: **~100ms – 180ms** trên Snapdragon 8 Gen 3.

3. **Bộ chuẩn hóa chuyên sâu Y khoa CĐHA (MedicalTextNormalizer):**
   - **Xử lý số và kích thước tổn thương:**
     - Đọc số ghép: *"hai mốt"* $\rightarrow$ `21`, *"ba lăm"* $\rightarrow$ `35`.
     - Kích thước đa chiều: *"21 x tám"* / *"hai mốt nhân tám mm"* $\rightarrow$ **`21 × 8 mm`**.
     - Đường kính: *"đường kính chín"* $\rightarrow$ **`đường kính 9 mm`**.
   - **Tầng cột sống:** *"L bốn năm"* $\rightarrow$ **`L4-L5`**, *"L năm S một"* $\rightarrow$ **`L5-S1`**.
   - **Hiệu chỉnh biến âm / đồng âm tiếng Việt:**
     - *"không gian"* $\rightarrow$ **`không giãn`** (tĩnh mạch cửa, đường mật, ống tụy, niệu quản).
     - *"cái chiếc"* / *"cái trích"* $\rightarrow$ **`kích thước`**.
     - *"mà đều"* / *"vừa đều"* $\rightarrow$ **`bờ đều`**.
     - *"clitsung"* / *"quýt xung"* $\rightarrow$ **`Wirsung`**.
     - *"ngấm thuốc không đều biết"* $\rightarrow$ **`ngấm thuốc không đồng nhất`**.
   - **Cắt tỉa khẩu lệnh kết thúc:** Loại bỏ các từ đệm/khẩu lệnh lúc dừng đọc (*"đó thôi"*, *"thôi"*, *"xong"*).

4. **Đồng bộ kết quả về Server PC Local:**
   - Khi bấm dừng thu âm, dữ liệu phiên test được tự động lưu SQLite trên điện thoại và đẩy về `benchmark_server.py` qua HTTP JSON + WAV.
   - Tự động tính toán WER, CER, Medical Term Accuracy, Numeric Accuracy, Latency, RTF, RAM Peak, Nhiệt độ pin.

5. **Bộ Test Set 50+ bệnh cảnh thực tế:**
   - Bao quát toàn diện: CT Bụng, CT Ngực, MRI Sọ não, X-quang Tim phổi, Siêu âm Tổng quát, X-quang Xương khớp, Cột sống.
   - Nút **`🎲 CÂU TIẾP THEO (NGẪU NHIÊN)`** hỗ trợ bốc câu test ngẫu nhiên để đánh giá khách quan.

---

## 2. Kết quả Benchmark thực tế trên thiết bị (OnePlus Ace 5 - Snapdragon 8 Gen 3)

| Chỉ số (Metric) | Kết quả thực đo trên máy | Đánh giá lâm sàng |
| :--- | :--- | :--- |
| **Model** | ZipFormer 150M CR-CTC-RNNT (Offline) | Model ASR tiếng Việt mã nguồn mở chính xác nhất |
| **Thời gian giải mã mỗi câu (Segment Latency)** | **104ms – 175ms** | Tức thì, hiện chữ ngay khi bác sĩ vừa nghỉ câu |
| **First Partial Latency** | **~130ms** | Phản hồi siêu tốc |
| **Độ chính xác thuật ngữ y khoa (Term Acc)** | **90% – 100%** | Nhận diện chính xác tên tạng, mạch máu, bệnh lý |
| **Độ chính xác số đo / giải phẫu (Num/Anatomy)** | **100%** | Chuẩn hóa kích thước `mm`, tầng cột sống `L4-L5` |
| **Mức chiếm dụng RAM trung bình** | **330 MB – 410 MB** | Cực kỳ nhẹ so với 16GB RAM của máy |
| **RAM Peak (Đỉnh điểm nạp ONNX)** | **520 MB – 560 MB** | An toàn, không có nguy cơ OOM |
| **Nhiệt độ pin (Battery Temperature)** | **35.8°C – 36.5°C** | Máy mát, không bị quá nhiệt khi chạy liên tục |

---

## 3. Cấu trúc thư mục dữ liệu Benchmark (Dành cho AI / ChatGPT phân tích)

- `benchmark_results_device/sessions/*.json`: Từng phiên test chi tiết lưu dưới dạng JSON (chứa raw transcript, normalized transcript, reference text, WER, CER, thời lượng audio, latency, RAM, pin).
- `benchmark_results_device/all_device_sessions.json`: Tập hợp toàn bộ các phiên test của các ca đọc.
- `benchmark_results_device/device_benchmark_aggregate.csv`: Bảng tổng hợp CSV để vẽ biểu đồ và phân tích thống kê.
- `app/src/main/java/com/autoris/asrbenchmark/`:
  - `audio/AudioRecorderManager.kt`: Quản lý ghi âm liên tục, VAD bám ồn thích ứng, nhận diện nghỉ câu và cắt đoạn giải mã.
  - `normalizer/MedicalTextNormalizer.kt`: Bộ luật chuẩn hóa ngữ nghĩa, số đo và thuật ngữ CĐHA.
  - `asr/Zipformer150MOfflineEngine.kt`: Engine JNI giao tiếp Sherpa-ONNX mô hình ZipFormer 150M.
  - `benchmark/AccuracyEvaluator.kt`: Tính toán tự động WER, CER, Term Accuracy.
  - `benchmark/MedicalTestSentence.kt`: Kho 50+ câu test CĐHA chuẩn.
- `benchmark_server.py`: Local server Python nhận kết quả từ điện thoại và hiển thị Dashboard.
