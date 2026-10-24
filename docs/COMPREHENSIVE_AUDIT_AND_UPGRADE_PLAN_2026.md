# AutoRIS: Báo Cáo Audit Toàn Diện Codebase & Kế Hoạch Nâng Cấp Hệ Thống
**Tác giả:** Principal System Architect & Clinical AI Auditor  
**Ngày báo cáo:** 24/10/2026  
**Dự án:** Hệ thống Nhập liệu Giọng nói Y khoa AutoRIS & Phân loại Lung-RADS PACS  
**Phạm vi rà soát:** Chrome Extension, Backend & VPS Server, Android Mobile App, Pipeline Tự học & Cơ chế Triển khai Hot-OTA  

---

## MỤC LỤC
1. [TỔNG QUAN KIẾN TRÚC & MA TRẬN TRẠNG THÁI HỆ THỐNG](#1-tổng-quan-kiến-trúc--ma-trận-trạng-thái-hệ-thống)
2. [ĐÁNH GIÁ CHUYÊN SÂU THEO TỪNG THÀNH PHẦN (DEEP-DIVE AUDIT)](#2-đánh-giá-chuyên-sâu-theo-từng-thành-phần-deep-dive-audit)
   - [2.1. Logic Nghiệp vụ Lâm sàng & Chuẩn Lung-RADS v2022](#21-logic-nghiệp-vụ-lâm-sàng--chuẩn-lung-rads-v2022)
   - [2.2. Kiến trúc Hệ thống & Luồng Dữ liệu (Extension <-> Phone <-> PACS <-> RIS <-> Server)](#22-kiến-trúc-hệ-thống--luồng-dữ-liệu)
   - [2.3. An ninh Mạng, Bảo mật Y tế & Tuân thủ Dữ liệu Bệnh nhân](#23-an-ninh-mạng-bảo-mật-y-tế--tuân-thủ-dữ-liệu-bệnh-nhân)
   - [2.4. Hiệu năng, Độ ổn định & Xử lý Lỗi / Concurrency](#24-hiệu-năng-độ-ổn-định--xử-lý-lỗi--concurrency)
   - [2.5. Cơ chế Tự học (Daily Auto Learner) & Bộ Kiểm thử Hồi quy](#25-cơ-chế-tự-học-daily-auto-learner--bộ-kiểm-thử-hồi-quy)
3. [BẢNG TỔNG HỢP SWOT & MA TRẬN RỦI RO LÂM SÀNG](#3-bảng-tổng-hợp-swot--ma-trận-rủi-ro-lâm-sàng)
4. [LỘ TRÌNH NÂNG CẤP CHI TIẾT (UPGRADE ROADMAP)](#4-lộ-trình-nâng-cấp-chi-tiết-upgrade-roadmap)
   - [Giai đoạn 1: Quick Wins - Vá Lỗ hổng Khẩn cấp & Tối ưu Logic Tức thì (1-3 Ngày)](#giai-đoạn-1-quick-wins---vá-lỗ-hổng-khẩn-cấp--tối-ưu-logic-tức-thì-1-3-ngày)
   - [Giai đoạn 2: Hardening & Refactoring - Khép kín Vòng lặp Học & Gia cố Độ tin cậy (1-2 Tuần)](#giai-đoạn-2-hardening--refactoring---khép-kín-vòng-lặp-học--gia-cố-độ-tin-cậy-1-2-tuần)
   - [Giai đoạn 3: Clinical Intelligence & UX - Nâng cấp Trí tuệ Lâm sàng & Đa chuyên khoa (3-4 Tuần)](#giai-đoạn-3-clinical-intelligence--ux---nâng-cấp-trí-tuệ-lâm-sàng--đa-chuyên-khoa-3-4-tuần)
5. [KẾT LUẬN & KHUYẾN NGHỊ TRIỂN KHAI](#5-kết-luận--khuyến-nghị-triển-khai)

---

## 1. TỔNG QUAN KIẾN TRÚC & MA TRẬN TRẠNG THÁI HỆ THỐNG

AutoRIS là giải pháp trợ lý AI toàn diện cho bác sĩ Chẩn đoán Hình ảnh (CĐHA) tại Bệnh viện Đại học Y Hà Nội, kết nối 4 khối module then chốt:

```
+-----------------------------------------------------------------------------------------+
|                                    HỆ THỐNG AUTORIS                                     |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [ 1. ANDROID APP ] (S24 Ultra / Ace 5 - Snapdragon 8 Gen 3)                            |
|    * AudioCapture 16kHz PCM + Silero Neural VAD + DPDFNet Denoiser                      |
|    * Zipformer 30M (Streaming) & Zipformer 150M (Offline) Dual-Engine                   |
|    * VoiceLock (64-dim spectral speaker gate) + Normalizer V2 (3-tier certainty)         |
|    * SafetyGate (Fail-Closed, token invalidation) -> HTTP Upload                        |
|                                     |                                                   |
|                                     v (POST /api/benchmark/upload)                      |
|  [ 2. VPS SERVER / BENCHMARK ] (benchmark_server.py :8080)                              |
|    * Ingestion API, Audio Storage (50MB), Feedback Store, OTA Synthesizer Code Provider |
|    * LLM Secretary Tier 2 proxy (Qwen2.5-1.5B via llama.cpp server)                     |
|                                     |                                                   |
|           +-------------------------+-------------------------+                         |
|           | (GET /api/dictation/latest poll 800ms)            |                         |
|           v                                                   v                         |
|  [ 3. CHROME EXTENSION ]                             [ 4. DAILY AUTO LEARNER ]          |
|    * background.js (Service Worker,                   (daily_auto_learner.py)           |
|      Short-polling 800ms, OTA sync 1.6s)               * Quét feedback bác sĩ gửi       |
|    * content.js (Tiêm vào RIS BVDHYHN                  * Gemini 3.8 Flash phân tích Diffs|
|      & PACS 192.168.50.110:30979)                      * Double-check Re-run            |
|    * sandbox.js (Thực thi dynamic                      * Chạy test hồi quy 11/11 tests  |
|      clinical_synthesizer.js)                          * Ghi Golden Few-Shot Dataset    |
|    * Floating Bar (Preview, Undo, Refill, Feedback)    * Xuất Báo cáo Đối chiếu 3 chiều |
|    * Phím F9: Dịch Lung-RADS PACS -> RIS               * Đánh dấu Resolved trên server  |
+-----------------------------------------------------------------------------------------+
```

### Bảng Ma trận Thành phần (Component Audit Matrix)

| Thành phần | Trạng thái hiện tại | Độ an toàn lâm sàng | Rủi ro kỹ thuật | Mức độ ưu tiên |
| :--- | :---: | :---: | :---: | :---: |
| **Chrome Extension (content.js)** | Hoạt động tốt trên DOM/CKEditor | Khá (8/10) | Tiêm vào mọi iframe (`all_frames`), xung đột Tab ID khi đa tab | **P1 (Cao)** |
| **Chrome Extension (background.js)** | Hoạt động, fallback Google Direct | Trung bình (6/10) | Lộ API Keys; Polling VPS 1.6s quá dày gây lãng phí tài nguyên | **P0 (Khẩn cấp)** |
| **Clinical Synthesizer (JS Rules)** | Khá đầy đủ luật cơ bản ổ bụng/ngực | Khá (7.5/10) | Thiếu nốt bán đặc (Part-Solid); Regex đường kính & nốt 2 bên có khe hở | **P1 (Cao)** |
| **Backend VPS (benchmark_server.py)** | Chạy ổn định HTTP cơ bản | Rất thấp (3/10) | Lỗ hổng Path Traversal; Không xác thực Auth; CORS `*` lộ bệnh án | **P0 (Khẩn cấp)** |
| **Thư ký Y khoa AI (Qwen Server)** | Chạy song song Tier 1 & Tier 2 | Thấp (4/10) | `max_tokens: 512` làm cắt cụt JSON gây sập lệnh sửa văn bản dài | **P0 (Khẩn cấp)** |
| **Daily Auto Learner (Python)** | Chạy trơn tru phân tích & test | Trung bình (5/10) | Vòng lặp đứt gãy: Ghi Golden Dataset nhưng không có ai đọc/nạp | **P1 (Cao)** |
| **Android On-device ASR** | Rất tốt, 114 unit tests pass | Rất cao (9.5/10) | Hoàn chỉnh, cần tinh chỉnh telemetry môi trường ồn thực tế | **P2 (Trung bình)** |

---

## 2. ĐÁNH GIÁ CHUYÊN SÂU THEO TỪNG THÀNH PHẦN (DEEP-DIVE AUDIT)

### 2.1. Logic Nghiệp vụ Lâm sàng & Chuẩn Lung-RADS v2022

#### Điểm mạnh:
1. **Quy tắc đường kính trung bình**: Đã thiết lập tính chất bắt buộc $(d1 + d2) / 2$, giữ phần lẻ `.5` (3.5 mm, 4.5 mm, 5.5 mm), chống việc LLM tự ý làm tròn số nguyên làm sai lệch phân loại.
2. **Deterministic Sanitizer**: Có tầng lọc hậu xử lý bằng Regex sau khi LLM sinh kết quả (`sanitizeLungRADSReport`), giúp cứu vãn các lỗi không tuân thủ prompt của AI.
3. **Cơ chế gộp nốt cùng mức**: Tránh báo cáo rườm rà dạng liệt kê từng nốt rời rạc, chuẩn hóa thành câu gom nốt lớn nhất theo đúng thói quen đọc của bác sĩ CĐHA Việt Nam.

#### Lỗ hổng & Bất cập Lâm sàng:
1. **Thiếu hoàn toàn Nốt bán đặc (Part-Solid / Subsolid) trong bảng phân loại Lung-RADS**:
   - Trong `LUNG_RADS_SYSTEM_PROMPT` (dòng 269-275), bảng chỉ định nghĩa Nốt đặc và Nốt kính mờ.
   - Theo chuẩn Lung-RADS v2022 của ACR (American College of Radiology):
     * Nốt bán đặc có phần đặc $< 6\text{ mm}$ $\rightarrow$ **Lung-RADS 2** (Bất kể kích thước tổng thể).
     * Nốt bán đặc có phần đặc $6 \le d < 8\text{ mm}$ $\rightarrow$ **Lung-RADS 3**.
     * Nốt bán đặc có phần đặc $\ge 8\text{ mm}$ $\rightarrow$ **Lung-RADS 4A**.
   - *Hậu quả lâm sàng*: Khi gặp ca nốt bán đặc (ví dụ: "Nốt bán đặc thùy trên phổi phải kích thước 14x10mm, phần đặc 4mm"), AI sẽ áp quy tắc nốt đặc hoặc kính mờ $\ge 30\text{ mm}$, có thể xếp sai thành Lung-RADS 4A hoặc 3, khiến bệnh nhân phải chụp CT liều thấp sau 3 tháng hoặc sinh thiết xâm lấn không cần thiết thay vì theo dõi định kỳ 12 tháng (Lung-RADS 2).
2. **Khe hở trong Regex tính đường kính trung bình**:
   - Biểu thức hiện tại: `/(kích\s+thước(?:\s+(?:lớn\s+nhất|lớn))?\s+)(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*mm\s*\(\s*đường\s+kính\s+trung\s+bình\s+([0-9.]+)\s*mm\s*\)/gi`
   - *Trường hợp thất bại*:
     * Bác sĩ hoặc AI không mở ngoặc đơn mà viết: `kích thước 5x4 mm, đường kính trung bình 4 mm` $\rightarrow$ Regex bỏ qua, lỗi làm tròn số nguyên vẫn tồn tại.
     * Tổn thương đo 3 chiều: `21 × 8 × 10 mm` $\rightarrow$ Regex không khớp.
     * Nốt đơn kích thước 1 số: `15 mm` $\rightarrow$ Regex không khớp.
3. **Lỗ hổng sắp xếp thứ tự nốt nguy cơ cao**:
   - Regex hiện tại dựa vào cụm từ khóa cứng `"còn có"` (`Thùy [X] còn có 1 nốt...`).
   - Nếu AI dùng câu văn khác: `"Thuỳ trên có 3 nốt đặc... Thuỳ trên có 1 nốt đặc 7x5mm..."` (không có từ "còn có"), bộ lọc hoàn toàn không kích hoạt! Nốt 7x5mm (Lung-RADS 3) vẫn bị đặt sau các nốt nhỏ Lung-RADS 2.
4. **Lỗi gán sai bên khi Nút nhầy phế quản ở 2 phổi**:
   - Trong `clinical_synthesizer.js`: `const targetSide = /phổi\s+phải/i.test(mucusSentence) ? "phải" : "trái";`
   - Nếu kết luận có nút nhầy ở cả hai phổi (ví dụ: "Nút nhầy phế quản thùy dưới hai phổi"), do không khớp "phổi phải" đơn thuần, biến `targetSide` bị ép thành `"trái"`. Đoạn mô tả chỉ được chèn vào dòng phổi trái, dòng phổi phải bị bỏ trống!
5. **Dày màng phổi khu trú bỏ sót biến thể từ khóa**:
   - Chỉ tìm chính xác `dày\s+màng\s+phổi`. Bỏ sót: "dày dính màng phổi", "dày vôi hóa màng phổi", "dày lá thành màng phổi". Khi bị sót, câu kết luận vẫn chứa dày màng phổi dù phần mô tả không có ghi nhận.

---

### 2.2. Kiến trúc Hệ thống & Luồng Dữ liệu

#### 1. Đứt gãy Vòng lặp Học (The Broken Learning Loop):
- `daily_auto_learner.py` thực hiện phân tích rất kỹ các ca feedback bằng Gemini 3.8 Flash, lưu trữ vào `data/golden_few_shot_dataset.jsonl` và `data/learning_reports/report_YYYY-MM-DD.md`.
- **Tuy nhiên, không có bất kỳ API hay module nào đọc từ file `golden_few_shot_dataset.jsonl` này!**
- Prompt trong `defaults.js` và `clinical_synthesizer.js` hoàn toàn là chuỗi tĩnh (static hardcoded string). Các tri thức, quy tắc mà Gemini Flash đã rút tỉa và bác sĩ đã dày công sửa hàng ngày bị đóng băng trong file log mà không bao giờ được đưa vào vận hành thực tế.

#### 2. Short-Polling 1.6s gây lãng phí tài nguyên mạng & CPU:
- Service worker `background.js` thực hiện vòng lặp `setInterval(..., 800ms)`.
- Cứ mỗi 2 chu kỳ (1.6s), extension gọi `fetch("/api/clinical_synthesizer/version")`.
- Cứ mỗi 1 chu kỳ (800ms), extension gọi `fetch("/api/dictation/latest?after_id=...")`.
- Với 10-20 máy tính khoa CĐHA cùng chạy, máy chủ VPS nhận hơn 1.000 requests mỗi phút chỉ để kiểm tra trạng thái không đổi.
- Kiến trúc đúng chuẩn: Cần chuyển sang **Server-Sent Events (SSE)** hoặc **WebSocket** cho luồng Dictation streaming; và chỉ kiểm tra OTA khi extension khởi động hoặc khi nhận tín hiệu notification từ SSE.

#### 3. Sự cố Tiêm vào Mọi Frame (`all_frames: true`):
- `manifest.json` cấu hình `"all_frames": true`. Hệ thống RIS của bệnh viện thường sử dụng iframe để hiển thị danh sách bệnh nhân, thông tin bảo hiểm, viewer.
- Do đó, `content.js` được nạp vào 4-5 iframes cùng lúc trên một màn hình đọc. Mỗi iframe đều:
  * Tạo một Floating Bar ẩn/hiện.
  * Đăng ký lắng nghe phím tắt toàn cục (F8, F9, Ctrl+Shift+S).
  * Đăng ký `TAB_INSTANCE_ID` và ghi đè cờ `ACTIVE_TARGET_TAB` trong `chrome.storage.local`.
- *Hậu quả*: Bác sĩ nhấn F9 trên PACS có thể kích hoạt gửi 2-3 request dịch đồng thời; hoặc khi chuyển tab RIS, phím tắt F8 không hoạt động do frame ẩn đang chiếm quyền.

#### 4. Khóa cứng Token cắt cụt của Thư ký AI Qwen VPS:
- Trong `benchmark_server.py`, hàm `call_qwen_secretary()` gọi mô hình LLM nội bộ với tham số `"max_tokens": 512`.
- Bản mô tả kết quả CT Ngực hoặc Siêu âm ổ bụng tổng quát tiếng Việt thường dài từ 300 - 600 từ (tương đương 700 - 1200 tokens).
- Giới hạn 512 tokens khiến JSON trả về luôn bị cắt ngang giữa chừng $\rightarrow$ `JSONDecodeError` $\rightarrow$ Thư ký AI tầng 2 luôn báo lỗi không kết nối được trên giao diện bác sĩ.

---

### 2.3. An ninh Mạng, Bảo mật Y tế & Tuân thủ Dữ liệu Bệnh nhân

> [!CAUTION]
> **CẢNH BÁO AN NINH MẠNG CẤP ĐỘ KHẨN CẤP (P0 CRITICAL)**  
> Phát hiện các lỗ hổng nghiêm trọng có thể dẫn đến rò rỉ dữ liệu y tế nhạy cảm (PHI) và nguy cơ xâm nhập máy chủ VPS.

#### 1. Lộ lọt Toàn bộ API Keys trong Mã Nguồn Extension:
- File `chrome_extension/defaults.js` chứa trực tiếp:
  * Key 9Router: `sk-e8ff53fc363b707a-aj81vz-ff55a6d6`
  * Key Google Gemini API: `AIzaSyAbHAXnTiePACai-G3sF2taXvdRvoADuoc`
- Do extension phân phối dưới dạng file nén `.zip` (`/autoris-extension.zip`) công khai trên web, bất kỳ ai cũng có thể trích xuất API keys này để dùng miễn phí, gây cạn kiệt hạn ngạch (quota exhaustion) hoặc tấn công từ chối dịch vụ (DoS).

#### 2. Không Xác Thực (Zero-Authentication) & CORS Mở Toàn Bộ (`*`):
- `benchmark_server.py` đặt header `Access-Control-Allow-Origin: *` trên toàn bộ endpoints.
- Các API nhạy cảm:
  * `GET /api/dictation/latest`: Lấy trực tiếp nội dung giọng đọc chẩn đoán bệnh nhân theo thời gian thực.
  * `GET /api/feedback/list`: Xem toàn bộ bệnh án, mô tả tổn thương và ghi chú của bác sĩ.
  * `GET /api/benchmark/sessions`: Xem lịch sử đo lường, thông tin thiết bị và file ghi âm bệnh nhân.
- Không hề có Token, Bearer Auth, hay Session Cookie.
- *Rủi ro*: Một trang web bất kỳ mà bác sĩ vô tình truy cập trên cùng trình duyệt có thể chạy script ngầm gửi XHR tới VPS `https://autoris.hoang.qzz.io` để thu thập trái phép toàn bộ hồ sơ bệnh án (vi phạm Nghị định 13/2023/NĐ-CP và tiêu chuẩn bảo vệ dữ liệu y tế).

#### 3. Lỗ hổng Ghi đè Tệp Tùy ý (Path Traversal File Write):
- Tại endpoint `POST /api/feedback/submit` (`benchmark_server.py`, dòng 390 & 405):
  ```python
  sid = payload.get("id") or f"fb_{now_str}_{rand_suffix}"
  single_file = os.path.join(FEEDBACK_DIR, f"{sid}.json")
  with open(single_file, "w", encoding="utf-8") as f:
      json.dump(record, f, ensure_ascii=False, indent=2)
  ```
- Biến `sid` được lấy trực tiếp từ JSON gửi lên mà KHÔNG qua `os.path.basename` hay kiểm tra ký tự `..`.
- Kẻ tấn công có thể truyền payload: `{"id": "../../../tmp/backdoor"}` hoặc ghi đè vào các file cấu hình hệ thống máy chủ nếu user chạy container có quyền root.

#### 4. Lỗ hổng Thực thi Mã trong Sandbox OTA (Unrestricted postMessage):
- File `chrome_extension/sandbox.js` lắng nghe:
  ```javascript
  window.addEventListener("message", async (event) => {
    if (data.action === "UPDATE_CODE") {
      const runner = new Function(code);
      runner();
    }
  });
  ```
- Hoàn toàn KHÔNG kiểm tra `event.origin` hoặc nguồn gốc `sender`.
- Trong khi đó, `manifest.json` cấp quyền `sandbox.html` là `web_accessible_resources` cho `["<all_urls>"]`.
- Một trang web độc hại có thể nhúng iframe tới `chrome-extension://[id]/sandbox.html` và bắn message `UPDATE_CODE` chứa mã độc JS để thực thi tùy ý trong ngữ cảnh extension sandbox.

---

### 2.4. Hiệu năng, Độ ổn định & Xử lý Lỗi / Concurrency

1. **Nguy cơ cạn kiệt ổ cứng VPS (Disk Exhaustion DoS)**:
   - Endpoint `POST /api/benchmark/upload_audio` cho phép upload file âm thanh lên đến 50MB mà không cần xác thực danh tính.
   - Không có cơ chế xoay vòng (retention policy) dọn dẹp các file `.wav` cũ hơn 30 ngày. Ổ cứng VPS có thể bị đầy, làm sập toàn bộ dịch vụ cơ sở dữ liệu và Docker container.
2. **Quản lý Bộ nhớ Undo Stack trên Client**:
   - Trong `content.js`, mỗi lần bác sĩ đọc một câu tổn thương mới, hệ thống snapshot lại toàn bộ `innerHTML` của CKEditor (có thể chứa hình ảnh base64, bảng biểu HTML nặng vài trăm KB).
   - Mặc dù giới hạn độ dài stack, việc lưu giữ chuỗi HTML lớn lặp đi lặp lại trong phiên làm việc kéo dài của ca trực có thể gây giật lag trình duyệt trên các máy tính trạm cấu hình cũ tại bệnh viện.
3. **Tranh chấp khóa tệp JSON (Race Condition & File Lock)**:
   - `benchmark_server.py` sử dụng một file JSON khổng lồ `all_device_sessions.json` để lưu tất cả các phiên.
   - Mỗi lần có 1 câu đọc gửi lên, server đọc toàn bộ file vào RAM, append, rồi ghi lại toàn bộ file xuống đĩa bằng `threading.Lock()`.
   - Khi có nhiều thiết bị ghi âm cùng gửi (nhiều phòng đọc CT, MRI, Siêu âm), cơ chế này tạo nút thắt cổ chai I/O nghiêm trọng, có nguy cơ gây hỏng file (file corruption) nếu server bị tắt đột ngột trong lúc ghi.

---

### 2.5. Cơ chế Tự học (Daily Auto Learner) & Bộ Kiểm thử Hồi quy

1. **Bộ kiểm thử hồi quy cục bộ (Local Regression Test)**:
   - File `test_secretary_tier1.js` hiện có 11/11 tests pass trong < 10ms. Đây là điểm sáng xuất sắc của hệ thống, kiểm tra đầy đủ các lệnh xóa dòng cơ quan, xóa kết luận, thay thế từ khóa và hoàn tác.
   - Tuy nhiên, 11 tests này chỉ kiểm tra phần Thư ký lệnh cơ bản, **hoàn toàn chưa có test suite cho bộ luật Lung-RADS v2022** (chưa có unit test cho trường hợp nốt kính mờ, nốt đặc có bờ tua gai 4X, nốt bán đặc, tính trung bình đường kính .5, gộp nốt hai phổi).
2. **Cơ chế Double-Check Verification sau khi học**:
   - `daily_auto_learner.py` đã triển khai logic kiểm tra đối chiếu rất tiến bộ: sau khi AI phân tích xong ca sửa của bác sĩ, nó tự giả lập lại lời đọc gốc qua model để so khớp lại với bản sửa của bác sĩ (Keyword Recall score).
   - Tuy nhiên, tiêu chí `score >= 75` hiện chỉ so khớp tập từ vựng (bag-of-words / set intersection), dễ bỏ qua các lỗi đảo ngữ nguy hiểm trong y khoa (ví dụ: "nang thận phải" vs "nang thận trái" có độ khớp từ vựng 66-75% nhưng về mặt lâm sàng là sai hoàn toàn vị trí can thiệp phẫu thuật).

---

## 3. BẢNG TỔNG HỢP SWOT & MA TRẬN RỦI RO LÂM SÀNG

### Phân tích SWOT

| Điểm mạnh (Strengths) | Điểm yếu (Weaknesses) |
| :--- | :--- |
| • ASR On-device Snapdragon 8 Gen 3 cực nhanh, an toàn âm thanh tuyệt đối.<br>• Dual-Engine 30M + 150M kiểm tra chéo ngữ nghĩa chống hallucination số đo.<br>• Bộ thư ký y khoa Tier 1 cục bộ < 5ms phản hồi tức thì.<br>• Bác sĩ chủ động tick chọn Tab RIS linh hoạt, có thanh Floating Bar trực quan.<br>• Bộ lọc Lung-RADS v2022 hạn chế được nhiều lỗi làm tròn số của LLM. | • Vòng lặp học tập bị đứt gãy, Golden Few-shot không được tái sử dụng.<br>• Lộ API Keys công khai trong extension build.<br>• Chưa phân loại nốt bán đặc (Part-solid) theo Lung-RADS v2022.<br>• API Backend không có Auth, CORS mở toang nguy hiểm.<br>• Polling 1.6s gây tải ảo cho server; `all_frames: true` tiêm nhầm iframes.<br>• `max_tokens: 512` của Qwen Secretary làm hỏng các báo cáo dài. |
| **Cơ hội (Opportunities)** | **Thách thức & Rủi ro (Threats)** |
| • Mở rộng sang các hệ thống phân loại khác: TI-RADS (Giáp), BI-RADS (Vú), PI-RADS (Tiền liệt tuyến).<br>• Tận dụng kho dữ liệu Golden Cases để Fine-tune model chuyên biệt tiếng Việt.<br>• Chuyển sang SSE/WebSocket giúp giảm 90% tải server và trải nghiệm mượt mà. | • Vi phạm an toàn thông tin y tế (Nghị định 13/2023/NĐ-CP) nếu bị rò rỉ dữ liệu.<br>• Lỗi gán sai bên giải phẫu (Laterality swap) nếu bác sĩ không kiểm tra lại.<br>• Rate limit từ nhà cung cấp LLM làm gián đoạn lúc cao điểm phòng khám. |

---

## 4. LỘ TRÌNH NÂNG CẤP CHI TIẾT (UPGRADE ROADMAP)

### Giai đoạn 1: Quick Wins - Vá Lỗ hổng Khẩn cấp & Tối ưu Logic Tức thì (1-3 Ngày)

#### Mục tiêu:
Loại bỏ 100% các lỗ hổng bảo mật nghiêm trọng, vá lỗi lâm sàng Lung-RADS cấp bách và ổn định luồng hoạt động trên trình duyệt.

```
[ GIAI ĐOẠN 1: QUICK WINS ]
1. Vá Path Traversal & CORS trong benchmark_server.py
2. Proxy hóa API Keys qua VPS (Xóa bỏ key lộ trong defaults.js)
3. Chặn Sandbox postMessage Origin & Sửa all_frames -> Top Frame Only
4. Cập nhật LUNG_RADS_SYSTEM_PROMPT bổ sung Nốt bán đặc (Part-Solid)
5. Hoàn thiện Regex đường kính trung bình (.5), nốt 2 bên & dày màng phổi
6. Tăng max_tokens của Qwen Secretary từ 512 lên 2048
```

#### Chi tiết Kỹ thuật:
1. **Vá lỗ hổng Path Traversal (`benchmark_server.py`)**:
   - Sử dụng `clean_id = re.sub(r'[^a-zA-Z0-9_-]', '', str(sid))` và ép qua `os.path.basename` trước khi mở file.
   - Giới hạn CORS: Chỉ cho phép nguồn từ các IP nội bộ bệnh viện (`192.168.50.*`, `pacs.benhviendaihocyhanoi.com`, `chrome-extension://*`).
2. **Bảo vệ API Keys & Proxy hóa qua Server**:
   - Thu hồi lập tức key Google AI và key 9Router bị lộ.
   - Đưa việc gọi LLM Gemini/9Router về phía VPS server endpoint (`/api/ai/synthesize`), Extension chỉ gửi payload cần dịch kèm theo một Client Token xác thực nội bộ. Client extension không bao giờ được giữ Master API Key.
3. **Khắc phục Sandbox & Đa Frame trong Extension**:
   - Thêm kiểm tra `if (window.self !== window.top) return;` trong `content.js` để ngăn chặn việc khởi tạo Floating Bar và phím tắt trong các iframes con.
   - Thêm xác thực `event.origin` trong `sandbox.js`, chỉ chấp nhận message từ chính extension ID (`chrome-extension://${chrome.runtime.id}`).
4. **Bổ sung chuẩn Nốt bán đặc vào Prompt Lung-RADS v2022**:
   - Cập nhật mục 4 trong `LUNG_RADS_SYSTEM_PROMPT`:
     * *Nốt bán đặc (Part-solid)*:
       - Phần đặc $< 6\text{ mm}$: Lung-RADS 2.
       - Phần đặc $6\text{ mm}$ đến $< 8\text{ mm}$: Lung-RADS 3.
       - Phần đặc $\ge 8\text{ mm}$: Lung-RADS 4A.
       - Bờ tua gai: Lung-RADS 4X.
5. **Gia cố Regex Hậu xử lý (`clinical_synthesizer.js`)**:
   - Nâng cấp regex tính đường kính trung bình để chấp nhận cả trường hợp không có ngoặc đơn hoặc viết cách quãng.
   - Sửa lỗi nút nhầy phế quản: nếu câu chứa "hai phổi" hoặc "hai bên", chèn mô tả vào CẢ HAI dòng phổi phải và phổi trái.
   - Mở rộng nhận diện dày màng phổi: bắt thêm "dày dính", "vôi hóa", "mảng dày".
6. **Sửa tham số Qwen Secretary**:
   - Nâng `max_tokens` từ 512 lên 2048 trong `benchmark_server.py` để tránh lỗi cắt cụt JSON trên các ca đọc dài.

---

### Giai đoạn 2: Hardening & Refactoring - Khép kín Vòng lặp Học & Gia cố Độ tin cậy (1-2 Tuần)

#### Mục tiêu:
Hoàn thiện cơ chế tự học hàng ngày (Closed-Loop Autonomous Learning), tối ưu hóa hiệu năng mạng và tái cấu trúc lưu trữ cơ sở dữ liệu.

```
[ GIAI ĐOẠN 2: HARDENING & REFACTORING ]
1. Khép kín vòng lặp Daily Learner: Xây dựng Dynamic Few-Shot Context Provider
2. Chuyển đổi Polling sang Server-Sent Events (SSE) cho Dictation Streaming
3. Hạ tần suất OTA check từ 1.6s xuống Event-driven hoặc 5 phút/lần
4. Chuyển đổi all_device_sessions.json sang cơ sở dữ liệu SQLite chuẩn ACID
5. Nâng cấp bộ nhớ Undo Stack: Lưu trữ Text Delta / Range thay vì full DOM HTML
6. Bổ sung Unit Test Suite cho Lung-RADS v2022 (Mở rộng từ 11 tests lên 35 tests)
```

#### Chi tiết Kỹ thuật:
1. **Khép kín Vòng lặp Tự học (Closed-Loop Learning Architecture)**:
   - Trong `daily_auto_learner.py`: Sau khi phân tích và xác thực ca sửa của bác sĩ, tự động chọn lọc top 20 ca vàng (Golden Few-Shot Examples) tiêu biểu nhất.
   - Tạo endpoint `/api/clinical/few_shots?category=chest_ct` trên VPS.
   - Khi Extension gọi AI để dịch Lung-RADS hoặc tổng hợp ổ bụng, server tự động chèn 2-3 ca Few-Shot tương đồng nhất vào System Prompt.
   - Nhờ đó, một khi bác sĩ sửa một lỗi mẫu (ví dụ: cách dùng từ địa phương, tên phẫu thuật viên, quy ước viết tắt của viện), ngày hôm sau toàn bộ hệ thống AI sẽ tự động đọc đúng theo mẫu mới mà không cần sửa code bằng tay!
2. **Thay thế Short-Polling bằng SSE (Server-Sent Events)**:
   - Server cung cấp endpoint `GET /api/dictation/stream` (hỗ trợ `text/event-stream`).
   - Extension mở kết nối EventSource duy nhất. Khi điện thoại gửi âm thanh lên server, server push ngay lập tức về extension trong vòng 50ms (giảm độ trễ từ 800ms xuống < 50ms, triệt tiêu 95% số lượng request rác đến server).
3. **Tái cấu trúc Lưu trữ sang SQLite**:
   - Thay thế việc ghi file `all_device_sessions.json` bằng cơ sở dữ liệu `autoris.db` (SQLite với WAL mode - Write-Ahead Logging).
   - Đảm bảo tính toàn vẹn dữ liệu khi nhiều bác sĩ cùng đọc đồng thời, có index theo `id`, `timestamp`, `deviceModel`.
4. **Tối ưu hóa Quản lý Tab RIS**:
   - Khi một Tab RIS bị đóng (`window.addEventListener("beforeunload", ...)`), nếu tab đó đang giữ quyền Active, tự động xóa khóa hoặc chuyển giao quyền cho Tab RIS đang mở gần nhất.
   - Hiển thị thông báo nhỏ trên Floating Bar nếu hiện tại không có tab nào được tick chọn điền.

---

### Giai đoạn 3: Clinical Intelligence & UX - Nâng cấp Trí tuệ Lâm sàng & Đa chuyên khoa (3-4 Tuần)

#### Mục tiêu:
Mở rộng năng lực AI y tế, hỗ trợ so sánh tổn thương đa thời điểm và tích hợp các bảng phân loại quốc tế khác cho bệnh viện.

```
[ GIAI ĐOẠN 3: CLINICAL INTELLIGENCE & MULTI-MODALITY ]
1. Bổ sung tính năng So sánh Đa thời điểm (Prior Comparison & Growth Rate)
2. Tích hợp trọn vẹn Lung-RADS v2022 Modifiers (S-Modifier: bệnh lý tim/màng phổi, C-Modifier: tiền sử ung thư)
3. Mở rộng Hệ thống Phân loại Đa Chuyên khoa:
   * TI-RADS (Siêu âm Tuyến giáp ACR 2017)
   * BI-RADS (X-quang / Siêu âm Tuyến vú ACR)
   * PI-RADS v2.1 (Cộng hưởng từ Tuyến tiền liệt)
4. Telemetry âm học nâng cao trên Android: Dynamic Noise Profile Adaptation
5. Dashboard Thống kê Y tế & Theo dõi Năng suất Đọc của Khoa CĐHA
```

#### Chi tiết Kỹ thuật:
1. **Tính năng So sánh Đa thời điểm (Prior Comparison)**:
   - Nhận diện lời đọc so sánh của bác sĩ: "Nốt thùy trên phổi phải lần này kích thước 8x7mm, tăng kích thước so với phim cũ tháng 6/2025 là 5x4mm".
   - AI tự động tính toán thời gian tăng đôi thể tích (Volume Doubling Time - VDT) hoặc ghi chú phân loại nốt mới (New nodule) / nốt tiến triển (Growing nodule) $\rightarrow$ Tự động nâng bậc Lung-RADS 4B nếu tốc độ phát triển nhanh theo chuẩn ACR.
2. **Hỗ trợ Đầy đủ Modifiers Lung-RADS**:
   - **S-Modifier (Significant incidental finding)**: Tự động gắn hậu tố `(Lung-RADS 2S)` khi phát hiện tổn thương ngoài phổi có ý nghĩa lâm sàng (ví dụ: phình động mạch chủ ngực, tràn dịch màng tim, gãy xương sườn).
   - **C-Modifier**: Gắn `(Lung-RADS 3C)` khi bệnh nhân có tiền sử đã từng điều trị ung thư phổi.
3. **Hệ thống Phân loại Đa Chuyên khoa (Multi-RADS Engine)**:
   - Mở rộng `clinical_synthesizer.js` để tự động kích hoạt bộ từ vựng và bảng điểm chuyên biệt dựa trên mẫu RIS đang mở:
     * *Mẫu Siêu âm Giáp*: Tự động tính điểm ACR TI-RADS (Thành phần + Cấu trúc âm + Hình dáng + Bờ + Vôi hóa $\rightarrow$ TR1 đến TR5).
     * *Mẫu X-quang Tuyến vú*: Bắt buộc câu phân loại BI-RADS 1 đến 6.

---

## 5. KẾT LUẬN & KHUYẾN NGHỊ TRIỂN KHAI

Hệ thống AutoRIS hiện tại là một công trình kỹ thuật ấn tượng, kết hợp nhuần nhuyễn giữa **ASR AI On-device trên Snapdragon 8 Gen 3** và **Trợ lý Điền thông minh trên trình duyệt Web/RIS**. Các cơ chế Fail-Closed Safety Gate và bộ quy tắc deterministic sanitizer đã giải quyết được những vấn đề hóc búa nhất trong tương tác giữa AI và phần mềm quản lý bệnh viện.

Tuy nhiên, để đạt chuẩn vận hành an toàn cấp bệnh viện (Hospital-Grade Readiness) và mở rộng cho toàn bộ các khoa CĐHA, việc thực hiện **Giai đoạn 1 (Vá bảo mật khẩn cấp, khắc phục lộ API Key, vá lỗ hổng Lung-RADS bán đặc và đa frame)** là yêu cầu **BẮT BUỘC TIÊN QUYẾT** cần thực hiện ngay trong vòng 24-48 giờ tới.

Sau đó, việc **khép kín vòng lặp tự học Daily Auto Learner (Giai đoạn 2)** sẽ biến AutoRIS thành một hệ thống "sống", tự hoàn thiện và thông minh hơn sau mỗi ca trực của các bác sĩ Bệnh viện Đại học Y Hà Nội.
