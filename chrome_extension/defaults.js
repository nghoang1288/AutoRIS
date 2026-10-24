// defaults.js - Cấu hình tích hợp AutoRIS Voice Dictation & PACS Lung-RADS Translator
const STORAGE_KEYS = {
  // Máy chủ AutoRIS (Điện thoại)
  SERVER_URL: "autoris_server_url",
  AUTO_APPLY: "autoris_auto_apply",
  SMART_SYNTHESIZE: "autoris_smart_synthesize",
  AUTO_COPY: "autoris_auto_copy",
  PLAY_CHIME: "autoris_play_chime",
  SHOW_FLOATING_BAR: "autoris_show_floating_bar",
  LAST_DICTATION: "autoris_last_dictation",
  LAST_APPLIED_ID: "autoris_last_applied_id",
  RECENT_HISTORY: "autoris_recent_history",

  // Máy chủ AI Router & Model
  AI_API_ENDPOINT: "apiEndpoint",
  AI_API_KEY: "apiKey",
  AI_MODEL: "preferredModel",
  CONNECTION_MODE: "connectionMode",
  GOOGLE_KEYS_POOL: "googleKeysPool",

  // PACS Lung-RADS Translator
  INSTALLED_VERSION: "installedVersion",
  LAST_REPORT: "lastSynthesizedReport",
  LAST_REPORT_TIME: "lastReportTime",
  SYSTEM_PROMPT: "systemPrompt",
  ACTIVE_TARGET_TAB: "autoris_active_target_tab",

  // Dynamic Clinical Synthesizer (Tải từ VPS)
  SYNTHESIZER_CODE: "clinical_synthesizer_code",
  SYNTHESIZER_VERSION: "clinical_synthesizer_version",
  SYNTHESIZER_SYNC_TIME: "clinical_synthesizer_sync_time",

  // Extension Package Auto-Update
  EXTENSION_UPDATE_AVAILABLE: "extension_update_available",
  LATEST_EXTENSION_VERSION: "latest_extension_version",
  EXTENSION_DOWNLOAD_URL: "extension_download_url",
  EXTENSION_RELEASE_NOTES: "extension_release_notes",
  EXTENSION_LAST_CHECK_TIME: "extension_last_check_time"
};

const ACTIONS = {
  SYNTHESIZE: "synthesize_report",
  SYNTHESIZE_LUNG: "synthesize_report",
  AUTO_APPLY: "auto_apply_to_ris_editor",
  AUTO_APPLY_PACS: "auto_apply_to_ris_editor",
  OPEN_OPTIONS: "open_options",
  CHECK_EXTENSION_UPDATE: "check_extension_update",
  DOWNLOAD_EXTENSION_UPDATE: "download_extension_update"
};

const TIMING = {
  MODEL_TIMEOUT_MS: 15000,
  TOTAL_TIMEOUT_MS: 35000,
  CLIENT_TIMEOUT_MS: 40000,
  TOAST_DURATION_MS: 3500,
  OBSERVER_DEBOUNCE_MS: 400
};

const GOOGLE_MODEL_MAP = {
  "gemini-3.5-flash-lite": "gemini-3.5-flash-lite",
  "gemini-3.5-flash": "gemini-3.5-flash",
  "gemini-3.7-flash": "gemini-3.5-flash",
  "gemini-3.8-flash": "gemini-3.5-flash",
  "combo1": "gemini-3.5-flash-lite"
};

const DEFAULT_CONFIG = {
  serverUrl: "https://autoris.hoang.qzz.io",
  autoApply: true,
  smartSynthesize: true,
  autoCopy: true,
  playChime: true,
  showFloatingBar: true,
  pollIntervalMs: 800,
  connectionMode: "auto",
  aiEndpoint: "https://9router.hoang.qzz.io/v1",
  aiKey: "sk-e8ff53fc363b707a-aj81vz-ff55a6d6",
  aiModel: "gemini-3.5-flash-lite",
  googleKeysPool: [
    "AIzaSyAbHAXnTiePACai-G3sF2taXvdRvoADuoc"
  ]
};

const DEFAULT_SETTINGS = {
  connectionMode: DEFAULT_CONFIG.connectionMode,
  apiEndpoint: DEFAULT_CONFIG.aiEndpoint,
  apiKey: DEFAULT_CONFIG.aiKey,
  preferredModel: DEFAULT_CONFIG.aiModel,
  googleKeysPool: DEFAULT_CONFIG.googleKeysPool
};

// 1. Prompt Chẩn đoán Hình ảnh Toàn thân / Ổ bụng (AutoRIS Clinical Synthesizer)
const RADIOLOGY_SYSTEM_PROMPT = `Bạn là Trợ lý AI Chuyên gia Chẩn đoán Hình ảnh Y khoa (Radiology AI Assistant) tích hợp trong hệ thống AutoRIS.
Nhiệm vụ của bạn là nhận:
1. MẪU BÁO CÁO HIỆN TẠI (gồm MÔ TẢ và KẾT LUẬN đang có trên phần mềm RIS của bệnh viện).
2. LỜI ĐỌC CỦA BÁC SĨ (Dictation) qua điện thoại.

YÊU CẦU XỬ LÝ (TUYỆT ĐỐI TUÂN THỦ 3 NGUYÊN TẮC):
1. QUY TẮC MÔ TẢ (FINDINGS):
   - CHỈ SỬA ĐÚNG DÒNG CƠ QUAN CÓ TỔN THƯƠNG. Giữ nguyên 100% tất cả các dòng cơ quan bình thường khác, không viết lại hay format lại các dòng bình thường.
   - Với GAN: Khi có tổn thương (ví dụ nang gan, u máu, nốt vôi hóa, u gan...), BẮT BUỘC XOÁ BỎ câu "không thấy khối khu trú trước và sau tiêm thuốc cản quang." và câu "nhu mô đồng nhất". Cấu trúc dòng gan chuẩn: "-- Gan không to, bờ đều, nhu mô gan [vị trí + tổn thương + kích thước bác sĩ đọc]." (Ví dụ: "-- Gan không to, bờ đều, nhu mô gan trái có nang đường kính 5mm.").
   - Với TÚI MẬT: Khi có tổn thương (sỏi, polyp...), XOÁ BỎ câu "không thấy sỏi".
   - Với THẬN: Khi có tổn thương (sỏi, nang, ứ nước...), XOÁ BỎ câu "không thấy sỏi", "không giãn".
   - Với PHỔI (Phổi phải, Phổi trái): Khi có tổn thương (nốt, khối, kính mờ...), mô tả chi tiết tổn thương nhưng BẮT BUỘC GIỮ NGUYÊN câu kết: "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang." ở cuối dòng.
     Ví dụ: "-- Phổi trái: Thuỳ trên có 1 nốt kính mờ kích thước 5×4 mm (đường kính trung bình 4.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang."
   - Với cơ quan CHƯA CÓ trong mẫu (ví dụ: Dạ dày, Ruột non, Đại tràng, Ruột thừa, Tuyến thượng thận, Cột sống...): Thêm 1 dòng mới duy nhất "-- [Tên cơ quan]: [mô tả]" vào đúng vị trí giải phẫu tự nhiên trong phần MÔ TẢ (sau Tụy/Lách).
   - Nếu lời đọc có hạch hoặc dịch: Cập nhật vào dòng hạch/dòng dịch tương ứng trong mẫu.

2. QUY TẮC KẾT LUẬN (IMPRESSION):
   - BẮT BUỘC LUÔN CÓ TỪ "Hình ảnh" ĐỨNG ĐẦU CÂU (VÀ CHỈ DUY NHẤT 1 TỪ "Hình ảnh", TUYỆT ĐỐI KHÔNG ĐƯỢC LẶP LẠI TỪ NÀY Ở CÁC CÂU SAU).
   - KẾT LUẬN TUYỆT ĐỐI KHÔNG CÓ PHẦN MÔ TẢ CHI TIẾT (KHÔNG ghi kích thước mm, KHÔNG ghi đường kính, tỷ trọng, bề dày).
   - Ví dụ đúng: "Hình ảnh nang gan trái." (CẤM ghi: "Hình ảnh nang gan trái đường kính 5mm").
   - Ví dụ đúng: "Hình ảnh nang gan hạ phân thùy VIII."
   - Ví dụ đúng: "Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận."
   - Nếu trước đó trong kết luận đã có tổn thương khác, các câu phía sau nối tiếp KHÔNG lặp lại từ "Hình ảnh" (ví dụ: "Hình ảnh nang gan trái. Sỏi thận phải.").
   - Với PHỔI (nốt phổi, Lung-RADS): Khi có nốt ở cả hai phổi (nốt đặc hoặc kính mờ hai phổi), câu kết luận chuẩn là: "Hình ảnh vài nốt [đặc/kính mờ] hai phổi (Lung-RADS [X]).", TUYỆT ĐỐI KHÔNG mở ngoặc liệt kê tên từng thuỳ như (thuỳ dưới phổi phải, thuỳ dưới phổi trái).
   - Xóa bỏ câu kết luận bình thường ("Hiện tại không thấy bất thường...").

3. ĐỊNH DẠNG TRẢ VỀ:
   Trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm lời giải thích):
{
  "affected_organ": "gan / da_day / tui_mat / than_phai / than_trai / hach / ...",
  "updated_organ_line": "-- Gan không to, bờ đều, nhu mô gan trái có nang đường kính 5mm.",
  "is_new_organ": false,
  "insert_after": "Lách",
  "mota": "toàn bộ nội dung mô tả sau khi cập nhật (chỉ dòng có tổn thương bị sửa, các dòng khác giữ nguyên)",
  "ketluan": "Hình ảnh nang gan trái.",
  "summary": "Cập nhật gan: nang gan trái"
}`;

// 2. Prompt Dịch & Tổng hợp Nốt Phổi Lung-RADS v2022 (PACS Medical Report Translator)
const LUNG_RADS_SYSTEM_PROMPT = `**1. Phân loại nốt (CHỈ DÙNG ĐÚNG 4 TỪ KHÓA SAU)**
* Nốt đặc (Solid)
* Nốt kính mờ (Ground-glass / Non-solid) - CHỈ DÙNG TỪ 'kính mờ', KHÔNG DÙNG 'kính mờ thuần tuý'
* Nốt bán đặc (Part-solid)
* Nốt vôi hoá (Calcified)

**2. Cấu trúc báo cáo**
Luôn gồm đúng cấu trúc:
-- Phổi phải: ...
-- Phổi trái: ...
Kết luận: 
...

Mô tả trong mỗi phổi theo thứ tự: thuỳ trên, thuỳ giữa (chỉ phổi phải), thuỳ dưới. Không nhắc đến thuỳ không có nốt. Không xuống dòng trong cùng một phổi.

* **QUY TẮC MÔ TẢ KÍCH THƯỚC VÀ ĐƯỜNG KÍNH TRUNG BÌNH (BẮT BUỘC)**:
  - ĐỊNH DẠNG CHUẨN: "kích thước [dài × ngắn] mm (đường kính trung bình [x] mm)".
  - Cách tính: đường kính trung bình x = (dài + ngắn) / 2.
    + BẮT BUỘC GIỮ 1 CHỮ SỐ THẬP PHÂN SAU DẤU PHẨY NẾU KẾT QUẢ CÓ PHẦN LẺ .5 (VÍ DỤ: 3.5 mm, 4.5 mm, 2.5 mm, 5.5 mm).
    + TUYỆT ĐỐI CẤM LÀM TRÒN THÀNH SỐ NGUYÊN! (Ví dụ: 4×3 mm thì đường kính trung bình là 3.5 mm, CẤM ghi 3 hay 4; 5×4 mm thì là 4.5 mm, CẤM ghi 5; 3×2 mm thì là 2.5 mm, CẤM ghi 2 hay 3; 6×5 mm thì là 5.5 mm, CẤM ghi 6).
    + Nếu kết quả là số nguyên chẵn thì ghi số nguyên (ví dụ 4×4 mm là 4 mm). Nếu bản gốc chỉ có 1 số (ví dụ 15 mm) thì ghi "kích thước 15 mm (đường kính trung bình 15 mm)".
  - NGOẠI LỆ - NỐT VÔI HOÁ: Chỉ ghi kích thước, KHÔNG ghi đường kính trung bình (ví dụ: "1 nốt vôi hoá kích thước 5×3 mm").
  - CẤM DÙNG "kích thước lần lượt là": Khi có từ 2 nốt trở lên cùng loại trong một thuỳ, không liệt kê kích thước từng nốt mà bắt buộc gom lại theo kích thước lớn nhất.

* **QUY TẮC GỘP NỐT CÙNG LOẠI TRONG CÙNG MỘT THUỲ (BẮT BUỘC GOM GỌN, TUYỆT ĐỐI CẤM LIỆT KÊ TÁCH RỜI)**:
  - Khi trong CÙNG MỘT THUỲ có từ 2 nốt trở lên CÙNG LOẠI (cùng nốt đặc, cùng nốt kính mờ, hoặc cùng nốt vôi hoá) và CÙNG MỨC LUNG-RADS (ví dụ cùng Lung-RADS 2, hoặc cùng vôi hoá Lung-RADS 1):
    + **BẮT BUỘC GỘP LẠI THÀNH 1 CÂU/CỤM DUY NHẤT**: Ghi rõ số lượng nốt + "nốt lớn kích thước [dài × ngắn] mm (đường kính trung bình [x] mm)" (hoặc "kích thước lớn nhất [dài × ngắn] mm (đường kính trung bình [x] mm)").
    + **TUYỆT ĐỐI CẤM LIỆT KÊ TÁCH RIÊNG TỪNG NỐT NỐI BẰNG CHỮ 'VÀ'**:
      * ĐÚNG: "Thuỳ trên có 2 nốt đặc, nốt lớn kích thước 4×4 mm (đường kính trung bình 4 mm)."
      * ĐÚNG: "Thuỳ trên có 2 nốt kính mờ, nốt lớn kích thước 6×5 mm (đường kính trung bình 5.5 mm)."
    + **ĐỐI VỚI NỐT ĐẶC VÀ KÍNH MỜ (Lung-RADS 2)**:
      * Khi có đúng 2 nốt trong cùng thuỳ: BẮT BUỘC GHI: "Thuỳ [tên] có 2 nốt [đặc/kính mờ], nốt lớn kích thước [dài × ngắn] mm (đường kính trung bình [x] mm)."
      * Khi có từ 3 nốt trở lên hoặc vài nốt: "Thuỳ [tên] có [X] nốt [đặc/kính mờ], kích thước lớn nhất [dài × ngắn] mm (đường kính trung bình [x] mm)."
    + **ĐỐI VỚI NỐT VÔI HOÁ (Lung-RADS 1)**:
      * 1 nốt: "Thuỳ [tên] có 1 nốt vôi hoá kích thước [dài × ngắn] mm."
      * Từ 2 nốt trở lên: Bắt buộc gom lại: "Thuỳ [tên] có [X] nốt vôi hoá, kích thước lớn nhất [dài × ngắn] mm."

* **QUY TẮC BẮT BUỘC VỀ THỨ TỰ MÔ TẢ (LUNG-RADS CAO HƠN MÔ TẢ ĐẦU TIÊN)**:
  - Trong mỗi thùy hoặc mỗi bên phổi, nốt có mức Lung-RADS CAO HƠN (nguy cơ cao hơn: 4X > 4B > 4A > 3 > 2 > 1) BẮT BUỘC PHẢI ĐƯỢC MÔ TẢ ĐẦU TIÊN!
  - Sau khi mô tả nốt nguy cơ cao, các nốt nguy cơ thấp hơn (Lung-RADS 2, 1) trong cùng thùy mới được mô tả tiếp theo, mở đầu bằng cụm: "Ngoài ra thuỳ [tên] có..." hoặc "Thuỳ [tên] còn có...".
  - TUYỆT ĐỐI CẤM: Mô tả các nốt nhỏ Lung-RADS 2 trước rồi mới nhắc đến nốt lớn/nguy cơ cao Lung-RADS 3, 4 ở cuối thùy!
  - VÍ DỤ ĐÚNG CHUẨN:
    "Thuỳ trên có 1 nốt đặc kích thước 7×5 mm (đường kính trung bình 6 mm), co kéo màng phổi. Ngoài ra thuỳ trên có 3 nốt đặc, nốt lớn kích thước 3×2 mm (đường kính trung bình 2.5 mm). Thuỳ giữa có 1 nốt vôi hoá kích thước 3×3 mm. Thuỳ dưới có 8 nốt đặc, nốt lớn kích thước 6×4 mm (đường kính trung bình 5 mm)."
  - VÍ DỤ SAI (CẤM):
    "Thuỳ trên có 3 nốt đặc, nốt lớn kích thước 3×2 mm... Thuỳ giữa có 1 nốt vôi hoá... Thuỳ dưới có 8 nốt đặc... Thuỳ trên còn có 1 nốt đặc kích thước 7×5 mm, co kéo màng phổi." (SAI vì nốt 7x5 mm Lung-RADS 3 lại bị ném xuống sau các nốt nhỏ).

* **QUY TẮC NHẤT QUÁN TUYỆT ĐỐI: CHỈ KẾT LUẬN NHỮNG GÌ ĐÃ ĐƯỢC MÔ TẢ (ĐẶC BIỆT LÀ NÚT NHẦY PHẾ QUẢN)**:
  - Mọi tổn thương có trong KẾT LUẬN bắt buộc PHẢI ĐƯỢC MÔ TẢ CHI TIẾT TRONG PHẦN MÔ TẢ TRƯỚC!
  - **ĐẶC BIỆT - NÚT NHẦY PHẾ QUẢN (Bronchial mucus plug)**:
    - Khi bản đọc gốc có nút nhầy phế quản (ví dụ "Bronchial mucus plug is found in Right lower lobe"):
      + Ở phần MÔ TẢ của phổi tương ứng (ở đây là Phổi phải), BẮT BUỘC PHẢI GHI CÂU MÔ TẢ: "Nút nhầy phế quản thùy dưới phổi phải." (đặt ngay trước câu kết "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.").
      + Ở phần KẾT LUẬN: Ghi "Nút nhầy phế quản thùy dưới phổi phải." ở cuối câu kết luận.
      + TUYỆT ĐỐI CẤM: Có câu "Nút nhầy phế quản..." ở Kết luận nhưng trong phần Mô tả lại hoàn toàn không nhắc đến!
  - **ĐỐI VỚI CÁC TỔN THƯƠNG NGOÀI PHỔI (Dày màng phổi khu trú...)**:
    - Nếu phần MÔ TẢ không mô tả bất thường (vẫn để mẫu bình thường không thấy tràn dịch, tràn khí) thì TUYỆT ĐỐI CẤM ghi vào Kết luận! Chỉ khi nào phần Mô tả có ghi nhận dày màng phổi thì mới được đưa vào Kết luận.

* **QUY TẮC TÁCH CÂU TRONG MÔ TẢ THEO MỨC LUNG-RADS VÀ NÊU RÕ VỊ TRÍ THUỲ**:
  - Mọi câu mô tả tách riêng bắt buộc phải có tên thuỳ hoặc vị trí cụ thể.
  - Các nốt khác mức Lung-RADS (3 vs 2 vs 1) hoặc khác loại tổn thương trong cùng một thuỳ tách thành các câu riêng biệt, mỗi câu nêu rõ tên thuỳ:
    + Nốt Lung-RADS 3/4: Mô tả trước tiên (Ví dụ: "Thuỳ trên có 1 nốt đặc kích thước 7×5 mm (đường kính trung bình 6 mm), co kéo màng phổi.").
    + Nốt Lung-RADS 2: Mô tả tiếp theo: "Ngoài ra thuỳ trên có 3 nốt đặc, nốt lớn kích thước 3×2 mm (đường kính trung bình 2.5 mm)."
    + Nốt Lung-RADS 1 (vôi hoá): Tách thành câu riêng và ghi rõ thuỳ.

* **QUY TẮC NỐT NGUY CƠ CAO (LUNG-RADS 4A, 4B, 4X) VÀ ĐẶC ĐIỂM HÌNH THÁI**:
  - Bất kỳ nốt nào thuộc nhóm Lung-RADS 4 phải được mô tả riêng biệt chi tiết, dịch đầy đủ đặc điểm hình thái có trong bản gốc.
  - QUY TẮC BỜ TUA GAI: Nếu bản gốc có Burr và/hoặc Spiculation, chỉ ghi "bờ tua gai" ĐÚNG 1 LẦN DUY NHẤT. CÓ BỜ TUA GAI BẮT BUỘC LÀ LUNG-RADS 4X BẤT KỂ KÍCH THƯỚC.
  - QUY TẮC CO KÉO MÀNG PHỔI:
    + Nốt đặc đường kính trung bình < 6 mm kèm co kéo màng phổi -> Lung-RADS 2.
    + Nốt đặc đường kính trung bình từ 6 đến < 8 mm kèm co kéo màng phổi (không có bờ tua gai) -> Lung-RADS 3.

* **QUY TẮC BẮT BUỘC VỀ DÀY MÀNG PHỔI KHU TRÚ (KHÔNG KẾT LUẬN NẾU KHÔNG CÓ MÔ TẢ)**:
  - TUYỆT ĐỐI KHÔNG KẾT LUẬN "Dày màng phổi khu trú" (hoặc tổn thương màng phổi) nếu trong phần MÔ TẢ không có dòng mô tả cụ thể về dày màng phổi.
  - Dù trong báo cáo gốc tiếng Anh/PACS có câu "Localized pleural thickening on the right side" hoặc tương tự, nếu tổn thương này KHÔNG được đưa vào phần MÔ TẢ (do màng phổi vẫn để mẫu bình thường không thấy tràn dịch, tràn khí) thì TUYỆT ĐỐI CẤM đưa vào phần KẾT LUẬN.
  - Chỉ khi nào phần MÔ TẢ có câu mô tả tổn thương dày màng phổi thì mới được phép xuất hiện ở phần KẾT LUẬN.

* **QUY TẮC BẮT BUỘC VỀ CÂU KẾT CỦA CẢ HAI PHỔI (TUYỆT ĐỐI KHÔNG ĐƯỢC XOÁ)**:
  - DÙ PHỔI CÓ TỔN THƯƠNG HAY KHÔNG CÓ TỔN THƯƠNG, DÒNG MÔ TẢ CỦA CẢ HAI PHỔI BẮT BUỘC LUÔN KẾT THÚC BẰNG CÂU:
    "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang."
  - Nếu phổi KHÔNG có tổn thương/nốt:
    "trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang."
  - Nếu phổi CÓ tổn thương/nốt: Mô tả chi tiết tổn thương theo quy tắc trên, rồi BẮT BUỘC VIẾT TIẾP CÂU:
    "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang." ở cuối dòng.
    * Ví dụ đúng chuẩn:
      -- Phổi phải: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
      -- Phổi trái: Thuỳ trên có 1 nốt kính mờ kích thước 5×4 mm (đường kính trung bình 4.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
    * CẤM (SAI):
      -- Phổi trái: Thuỳ trên có 1 nốt kính mờ kích thước 5×4 mm (đường kính trung bình 4.5 mm). (SAI vì bị xoá mất câu 'Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.')
* Toàn bộ phần Kết luận phải nằm trên 1 DÒNG DUY NHẤT.
* Phân loại Lung-RADS bắt buộc tính theo ĐƯỜNG KÍNH TRUNG BÌNH.
* **QUY TẮC ĐỊNH DẠNG LUNG-RADS TRONG KẾT LUẬN (BẮT BUỘC)**:
  - Luôn đặt Lung-RADS trong dấu ngoặc đơn ở cuối câu: "(Lung-RADS 2).", "(Lung-RADS 3).", "(Lung-RADS 4A)."
  - TUYỆT ĐỐI CẤM dùng dấu gạch nối (CẤM ghi "- Lung-RADS 2.").

* **QUY TẮC GỘP CÁC TỔN THƯƠNG CÙNG MỨC LUNG-RADS TRONG KẾT LUẬN (BẮT BUỘC)**:
  - Khi có từ 2 tổn thương khác loại hoặc khác vị trí có CÙNG MỨC LUNG-RADS (ví dụ cùng Lung-RADS 2, hoặc cùng Lung-RADS 3):
    + BẮT BUỘC GỘP CHUNG VÀO 1 CÂU DUY NHẤT nối bằng từ "và" (hoặc dấu phẩy nếu từ 3 tổn thương trở lên).
    + Mức "(Lung-RADS [X])." CHỈ ĐƯỢC XUẤT HIỆN ĐÚNG 1 LẦN DUY NHẤT Ở CUỐI CÂU GỘP.
    + TUYỆT ĐỐI CẤM gắn "(Lung-RADS [X])" vào từng vế rồi nối bằng dấu chấm phẩy ".," hoặc tách rời!
    + ĐÚNG CHUẨN: "Hình ảnh nốt đặc thuỳ trên phổi trái và nốt kính mờ thuỳ trên phổi phải (Lung-RADS 2)."
    + SAI (CẤM): "Hình ảnh nốt đặc thuỳ trên phổi trái (Lung-RADS 2)., nốt kính mờ thuỳ trên phổi phải (Lung-RADS 2)."
    + SAI (CẤM): "Hình ảnh nốt đặc thuỳ trên phổi trái (Lung-RADS 2). Nốt kính mờ thuỳ trên phổi phải (Lung-RADS 2)."

* **QUY TẮC NỐT Ở HAI PHỔI VÀ ĐỊNH LƯỢNG "VÀI NỐT" TRONG KẾT LUẬN (BẮT BUỘC)**:
  - Khi có nốt cùng loại (cùng nốt đặc, cùng nốt kính mờ, hoặc cùng nốt vôi hoá) ở CẢ HAI PHỔI:
    + BẮT BUỘC dùng cụm: "vài nốt [đặc/kính mờ/vôi hoá] hai phổi (Lung-RADS [X])."
    + TUYỆT ĐỐI CẤM liệt kê tên từng thuỳ trong Kết luận khi đã ở hai phổi (CẤM ghi "(thuỳ dưới phổi phải, thuỳ dưới phổi trái)"). Tên các thuỳ chỉ được mô tả chi tiết ở phần MÔ TẢ.
    + ĐÚNG CHUẨN: "Hình ảnh vài nốt đặc hai phổi (Lung-RADS 2)."
    + ĐÚNG CHUẨN: "Hình ảnh vài nốt kính mờ hai phổi (Lung-RADS 2)."
    + ĐÚNG CHUẨN: "Hình ảnh vài nốt vôi hoá hai phổi (Lung-RADS 1)."
    + SAI (CẤM): "Hình ảnh nốt đặc hai phổi (thuỳ dưới phổi phải, thuỳ dưới phổi trái) - Lung-RADS 2."
  - Khi có từ 2 nốt trở lên cùng loại ở nhiều thuỳ của CÙNG MỘT BÊN PHỔI:
    + BẮT BUỘC dùng cụm: "vài nốt [đặc/kính mờ/vôi hoá] phổi [phải/trái] (Lung-RADS [X])."
    + ĐÚNG CHUẨN: "Hình ảnh vài nốt đặc phổi phải (Lung-RADS 2)."
    + ĐÚNG CHUẨN: "Nốt vôi hoá phổi phải (Lung-RADS 1)." (hoặc "Vài nốt vôi hoá phổi phải (Lung-RADS 1).")
  - Chỉ ghi tên thuỳ trong Kết luận khi tổn thương chỉ nằm khu trú ở DUY NHẤT một thuỳ của một bên phổi (Ví dụ: "Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2).", "Nốt vôi hoá thuỳ trên phổi trái (Lung-RADS 1).").
* **QUY TẮC CÁC CÂU KHÁC MỨC LUNG-RADS TRONG KẾT LUẬN (BẮT BUỘC TÁCH CÂU RIÊNG)**:
  - Mỗi mức Lung-RADS khác nhau (hoặc tổn thương kèm theo) là MỘT CÂU RIÊNG BIỆT kết thúc bằng dấu chấm: "(Lung-RADS [X]).".
  - Chữ cái đầu của câu tiếp theo BẮT BUỘC viết hoa (Ví dụ: ". Nốt bán đặc...", ". Nốt đặc...", ". Nốt vôi hoá...", ". Nút nhầy...").
  - TUYỆT ĐỐI CẤM dùng dấu phẩy, dấu chấm phẩy hoặc từ "và" để nối các câu khác mức Lung-RADS (CẤM ghi "(Lung-RADS 4X)., nốt...", CẤM ghi "(Lung-RADS 2)., và nốt...").
  - CHỈ DÙNG từ "và" để gộp các nốt CÙNG MỨC Lung-RADS ở bên trong câu đó trước "(Lung-RADS [X]).".
  - TỔN THƯƠNG KÈM THEO (nút nhầy phế quản, giãn phế quản, dày thành phế quản, tràn dịch...) nằm ở câu cuối cùng, BẮT ĐẦU BẰNG CHỮ CÁI VIẾT HOA, TUYỆT ĐỐI KHÔNG dùng lại từ "Hình ảnh".
  - VÍ DỤ ĐÚNG CHUẨN:
    "Hình ảnh các nốt trung tâm tiểu thuỳ thuỳ trên phổi phải (Lung-RADS 4X). Nốt bán đặc thuỳ trên phổi phải (Lung-RADS 4A). Nốt đặc thuỳ trên phổi trái và nốt kính mờ thuỳ dưới phổi phải (Lung-RADS 2). Nốt vôi hoá thuỳ trên phổi phải (Lung-RADS 1). Nút nhầy phế quản thùy trên và thùy dưới phổi trái."
  - VÍ DỤ SAI (CẤM):
    "Hình ảnh các nốt trung tâm tiểu thuỳ thuỳ trên phổi phải (Lung-RADS 4X)., nốt bán đặc thuỳ trên phổi phải (Lung-RADS 4A)., nốt đặc thuỳ trên phổi trái và nốt kính mờ thuỳ dưới phổi phải (Lung-RADS 2)., và nốt vôi hoá thuỳ trên phổi phải (Lung-RADS 1). Hình ảnh nút nhầy phế quản thùy trên và thùy dưới phổi trái."
* Ưu tiên câu nốt nguy cơ cao (4X, 4B, 4A) lên đầu tiên. BỎ TOÀN BỘ MÔ TẢ HÌNH THÁI TRONG KẾT LUẬN (chỉ ghi loại tổn thương + vị trí + Lung-RADS).
* Mỗi mức Lung-RADS chỉ xuất hiện ĐÚNG 1 LẦN trong kết luận.
* Thứ tự các câu trong dòng Kết luận:
  1. Câu Lung-RADS cao nhất (bắt đầu bằng từ "Hình ảnh").
  2. Câu các mức Lung-RADS thấp hơn (viết nối tiếp, KHÔNG dùng lại từ "Hình ảnh"):
     - Câu gom nốt Lung-RADS 3 (nếu có).
     - Câu gom nốt Lung-RADS 2 (nếu có). Ví dụ: "Vài nốt đặc hai phổi (Lung-RADS 2)."
     - Câu gom nốt vôi hoá Lung-RADS 1. Ví dụ: "Vài nốt vôi hoá hai phổi (Lung-RADS 1)."
  3. Câu tổn thương kèm theo ở cuối cùng (viết hoa chữ đầu, KHÔNG dùng từ "Hình ảnh").
* CHỈ DÙNG ĐÚNG 1 TỪ 'Hình ảnh' DUY NHẤT ở đầu dòng kết luận.
* Không ghi kích thước trong Kết luận.

**4. Bảng phân loại Lung-RADS v2022**:
* Lung-RADS 1: Phổi không có tổn thương, hoặc nốt vôi hoá lành tính hoàn toàn.
* Lung-RADS 2:
  - Nốt đặc đường kính trung bình < 6mm.
  - Nốt kính mờ thuần túy (pGGN) < 30mm.
  - Nốt bán đặc (Part-solid): Có thành phần đặc < 6mm (bất kể kích thước tổng thể).
* Lung-RADS 3:
  - Nốt đặc đường kính trung bình từ 6mm đến < 8mm.
  - Nốt kính mờ thuần túy (pGGN) >= 30mm.
  - Nốt bán đặc: Có thành phần đặc từ 6mm đến < 8mm.
* Lung-RADS 4A:
  - Nốt đặc đường kính trung bình từ 8mm đến < 15mm.
  - Nốt bán đặc: Có thành phần đặc >= 8mm.
* Lung-RADS 4B:
  - Nốt đặc đường kính trung bình >= 15mm.
  - Nốt đặc hoặc nốt bán đặc tăng kích thước nhanh so với phim cũ.
* Lung-RADS 4X:
  - Bất kỳ nốt nào (đặc, bán đặc, kính mờ) có bờ tua gai (Spiculation/Burr), co kéo màng phổi ác tính, hạch to rốn phổi/trung thất kèm theo, hoặc dấu hiệu ác tính cao bất kể kích thước.`;

function formatMaskedKey(key) {
  if (!key) return "Chưa thiết lập";
  const trimmed = key.trim();
  if (trimmed.length <= 6) return trimmed;
  return `${trimmed.slice(0, 3)}••••••••••••••••${trimmed.slice(-3)}`;
}

/**
 * Chuẩn hoá câu Kết luận theo chuẩn Lung-RADS v2022:
 * 1. Chuyển " - Lung-RADS 2." thành " (Lung-RADS 2)."
 * 2. Loại bỏ mở ngoặc liệt kê thuỳ sau "hai phổi": "(thuỳ dưới phổi phải, thuỳ dưới phổi trái)" -> BỎ
 * 3. Chuyển "nốt ... hai phổi" thành "vài nốt ... hai phổi"
 */
function sanitizeLungRADSConclusion(conclusionText) {
  if (!conclusionText || !conclusionText.trim()) return conclusionText;
  let text = conclusionText.trim();

  // 1. Chuẩn hoá chữ hoa cho mức Lung-RADS (4a -> 4A, 4b -> 4B, 4x -> 4X)
  text = text.replace(/Lung-RADS\s+([0-9])([a-z])\b/gi, function(_, num, letter) {
    return "Lung-RADS " + num + letter.toUpperCase();
  });

  // 2. Loại bỏ các mở ngoặc liệt kê tên thuỳ sau "hai phổi"
  text = text.replace(/hai\s+phổi\s*\([^)]*(?:thuỳ|thùy)[^)]*\)/gi, "hai phổi");

  // 3. Chuyển đổi "nốt/các nốt ... hai phổi" hoặc "các nốt ... phổi phải/trái" thành "vài nốt ..."
  text = text.replace(/(^|[.\n]\s*)(Hình\s+ảnh\s+)?(?:nốt|các\s+nốt)\s+(đặc|kính\s+mờ|vôi\s+hoá|vôi\s+hóa|bán\s+đặc|bán-đặc)\s+hai\s+phổi/gi, function(match, punct, prefix, type) {
    if (prefix) {
      return (punct || "") + prefix + "vài nốt " + type + " hai phổi";
    }
    const cap = (!punct || punct.includes("\n") || punct.includes(".")) ? "Vài nốt " : "vài nốt ";
    return (punct || "") + cap + type + " hai phổi";
  });
  text = text.replace(/(^|[.\n]\s*)(Hình\s+ảnh\s+)?(?:các\s+nốt)\s+(đặc|kính\s+mờ|vôi\s+hoá|vôi\s+hóa|bán\s+đặc|bán-đặc)\s+phổi\s+(phải|trái)/gi, function(match, punct, prefix, type, side) {
    if (prefix) {
      return (punct || "") + prefix + "vài nốt " + type + " phổi " + side;
    }
    const cap = (!punct || punct.includes("\n") || punct.includes(".")) ? "Vài nốt " : "vài nốt ";
    return (punct || "") + cap + type + " phổi " + side;
  });

  // 4. Chuẩn hoá định dạng Lung-RADS:
  // Chuyển " - Lung-RADS 2." hoặc " - Lung-RADS 2" thành " (Lung-RADS 2)."
  text = text.replace(/\s*[-–—]\s*(Lung-RADS\s+[0-9][A-Za-z]?)\.?/gi, function(_, lr) {
    const stdLr = lr.replace(/lung-rads/i, "Lung-RADS");
    return " (" + stdLr + ").";
  });
  text = text.replace(/\(\s*lung-rads\b/gi, "(Lung-RADS");

  // 5. GỘP CÁC TỔN THƯƠNG CÙNG MỨC LUNG-RADS TRONG CÂU:
  // Ví dụ: "Hình ảnh nốt đặc thuỳ trên phổi trái (Lung-RADS 2), nốt kính mờ thuỳ trên phổi phải (Lung-RADS 2)."
  // -> "Hình ảnh nốt đặc thuỳ trên phổi trái và nốt kính mờ thuỳ trên phổi phải (Lung-RADS 2)."
  const sameTierRegex = /\((Lung-RADS\s+[0-9][A-Za-z]?)\)[.,;\s]+(?:và\s+)?([^().]+?)\s*\(\1\)/i;
  while (sameTierRegex.test(text)) {
    text = text.replace(sameTierRegex, function(match, lr, secondPart) {
      let cleanPart = secondPart.trim().replace(/^và\s+/i, "");
      if (cleanPart) {
        cleanPart = cleanPart.charAt(0).toLowerCase() + cleanPart.slice(1);
      }
      return " __JOIN__ " + cleanPart + " (" + lr + ")";
    });
  }

  if (text.includes("__JOIN__")) {
    const parts = text.split("__JOIN__");
    let joined = parts[0].trim();
    for (let i = 1; i < parts.length; i++) {
      if (i === parts.length - 1) {
        joined += " và " + parts[i].trim();
      } else {
        joined += ", " + parts[i].trim();
      }
    }
    text = joined;
  }

  // 6. TÁCH CÁC CÂU KHÁC MỨC LUNG-RADS:
  // Sửa lỗi '., nốt', '., và nốt', ', nốt', '., và' sau (Lung-RADS X) thành '. Nốt'
  text = text.replace(/(\(Lung-RADS\s+[0-9][A-Za-z]?\))[.,;\s]+(?:và\s+)?([a-zà-ỹ\p{L}])/gui, function(_, lr, nextChar) {
    return lr + ". " + nextChar.toUpperCase();
  });

  // Đảm bảo có dấu chấm sau (Lung-RADS X) nếu chưa có
  text = text.replace(/(\(Lung-RADS\s+[0-9][A-Za-z]?\))(?!\.)/gi, function(_, lr) {
    return lr + ".";
  });

  // 7. Xoá từ 'Hình ảnh' lặp lại ở các câu phía sau (chỉ giữ đúng 1 từ 'Hình ảnh' ở đầu kết luận)
  text = text.replace(/(?:^|[.!?\n]\s+)Hình\s+ảnh\s+/gui, function(match, offset) {
    if (offset === 0) return match; // Giữ nguyên 'Hình ảnh' đầu tiên của toàn bộ kết luận
    return ". ";
  });

  // 8. Dọn dẹp khoảng trắng trước dấu câu
  text = text.replace(/\s+([.,;:!?])/g, "$1");

  // Viết hoa chữ cái đầu câu sau dấu chấm nếu bị viết thường
  text = text.replace(/\.\s+([a-zà-ỹ\p{L}])/gui, function(_, c) {
    return ". " + c.toUpperCase();
  });

  // Dọn dẹp khoảng trắng và dấu chấm trùng lặp
  text = text.replace(/[.,;]{2,}/g, ".").replace(/\s{2,}/g, " ").trim();
  text = text.replace(/\.\s*\./g, ".");

  // Đảm bảo kết thúc bằng đúng 1 dấu chấm duy nhất
  text = text.replace(/[.,;\s]+$/, "") + ".";

  return text;
}

/**
 * Chuẩn hoá toàn bộ báo cáo Lung-RADS (Mô tả + Kết luận)
 */
function sanitizeLungRADSReport(reportText) {
  if (!reportText) return "";
  let text = reportText.normalize("NFC");

  // 1. Tự động tính và chuẩn hóa đường kính trung bình ra đúng 1 số sau dấu phẩy (.5) nếu có phần lẻ: vd 3.5 mm, 4.5 mm, 2.5 mm, 5.5 mm (hỗ trợ cả dấu phẩy 3,5 mm)
  text = text.replace(/(kích\s+thước(?:\s+(?:lớn\s+nhất|lớn))?\s+)(\d+(?:[.,]\d+)?)\s*[×xX*]\s*(\d+(?:[.,]\d+)?)\s*mm\s*\(\s*đường\s+kính\s+trung\s+bình\s+([0-9.,]+)\s*mm\s*\)/gi, function(match, prefix, d1Str, d2Str, oldMeanStr) {
    const d1 = parseFloat(d1Str.replace(",", "."));
    const d2 = parseFloat(d2Str.replace(",", "."));
    if (isNaN(d1) || isNaN(d2)) return match;
    const trueMean = (d1 + d2) / 2;
    const formattedMean = (trueMean % 1 !== 0) ? trueMean.toFixed(1) : String(trueMean);
    return `${prefix}${d1Str}×${d2Str} mm (đường kính trung bình ${formattedMean} mm)`;
  });

  // 2. Sắp xếp thứ tự nốt trong Mô tả: Nốt có mức Lung-RADS cao hơn / nguy cơ cao hơn BẮT BUỘC mô tả trước
  // Nếu có câu nốt lớn "Thuỳ [X] còn có 1 nốt..." nằm sau câu nốt nhỏ "Thuỳ [X] có [N] nốt..."
  const lobeNames = ["trên", "giữa", "dưới"];
  lobeNames.forEach(lobe => {
    const bigRegex = new RegExp("(Th[uù][yỳ]\\s+" + lobe + "\\s+còn\\s+có[\\s\\S]+?\\.\\s*(?=(?:Th[uù][yỳ]|Không|Động|Trung|$)))", "i");
    const mBig = text.match(bigRegex);
    if (mBig) {
      const bigSentence = mBig[1].trim();
      const earlyRegex = new RegExp("(Th[uù][yỳ]\\s+" + lobe + "\\s+có[\\s\\S]+?\\.\\s*(?=(?:Th[uù][yỳ]|Không|Động|Trung|$)))", "i");
      const mEarly = text.match(earlyRegex);
      if (mEarly && text.indexOf(mEarly[1]) < text.indexOf(bigSentence)) {
        const earlySentence = mEarly[1].trim();
        text = text.replace(bigSentence, "").replace(/\s{2,}/g, " ");
        const newBig = bigSentence.replace(/còn\s+có/i, "có");
        const newEarly = "Ngoài ra " + earlySentence.replace(/^Th[uù][yỳ]/i, "thuỳ");
        text = text.replace(earlySentence, newBig + " " + newEarly);
      }
    }
  });

  // 3. Đảm bảo tính nhất quán giữa MÔ TẢ và KẾT LUẬN (Cái gì mô tả mới được ghi kết luận)
  const parts = text.split(/(?:^|\n)\s*(?:--|—|-)?\s*(?:KẾT\s*LUẬN|Kết\s*luận)\s*[:：]?\s*/i);
  if (parts.length >= 2) {
    let motaPart = parts[0];
    let klBody = parts[1];

    // A. NÚT NHẦY PHẾ QUẢN (Bronchial mucus plug):
    // Nếu Kết luận có câu nút nhầy mà Mô tả chưa có -> Bắt buộc chèn vào Mô tả của phổi tương ứng
    const mucusMatch = klBody.match(/(Nút\s+nhầy\s+phế\s+quản[^.\n]+)/i);
    if (mucusMatch) {
      const mucusSentence = mucusMatch[1].trim().replace(/\.?$/, ".");
      if (!/(?:nút\s+nhầy|nut\s+nhay)/i.test(motaPart)) {
        const isBoth = /hai\s+phổi|2\s+phổi|hai\s+bên/i.test(mucusSentence);
        const isRight = /phổi\s+phải/i.test(mucusSentence) || isBoth;
        const isLeft = /phổi\s+trái/i.test(mucusSentence) || isBoth;
        const suffix = "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.";
        const lines = motaPart.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (isRight && lines[i].toLowerCase().includes("phổi phải")) {
            const mText = isBoth ? mucusSentence.replace(/hai\s+phổi|hai\s+bên/i, "phổi phải") : mucusSentence;
            if (lines[i].includes(suffix)) {
              lines[i] = lines[i].replace(suffix, mText + " " + suffix);
            } else {
              lines[i] += " " + mText;
            }
          }
          if (isLeft && lines[i].toLowerCase().includes("phổi trái")) {
            const mText = isBoth ? mucusSentence.replace(/hai\s+phổi|hai\s+bên/i, "phổi trái") : mucusSentence;
            if (lines[i].includes(suffix)) {
              lines[i] = lines[i].replace(suffix, mText + " " + suffix);
            } else {
              lines[i] += " " + mText;
            }
          }
        }
        motaPart = lines.join("\n");
      }
    }

    // B. DÀY MÀNG PHỔI KHU TRÚ & CÁC BIẾN THỂ DÀY DÍNH:
    // Nếu Kết luận có mà Mô tả KHÔNG CÓ -> Bắt buộc xóa khỏi Kết luận
    const hasMotaDayMangPhoi = /(?:dày|day|vôi\s+hóa|vôi\s+hoá|dính|mảng\s+dày)[^.\n]*màng\s+phổi|màng\s+phổi[^.\n]*(?:dày|day|vôi|dính)/i.test(motaPart) && !/(?:không|chưa)\s+thấy\s+(?:dày|bất\s+thường)/i.test(motaPart);
    if (!hasMotaDayMangPhoi) {
      klBody = klBody.replace(/(?:^|[.!?\n]\s*)(?:Hình\s+ảnh\s+)?(?:dày|dày\s+dính|dày\s+vôi\s+hóa|dày\s+vôi\s+hoá)\s+màng\s+phổi(?:\s+khu\s+trú)?(?:\s+bên\s+(?:phải|trái|hai\s+bên))?[.,;]?/gi, "");
      klBody = klBody.replace(/(?:và|,)\s*(?:hình\s+ảnh\s+)?(?:dày|dày\s+dính)\s+màng\s+phổi(?:\s+khu\s+trú)?(?:\s+bên\s+(?:phải|trái|hai\s+bên))?/gi, "");
      klBody = klBody.replace(/(?:hình\s+ảnh\s+)?(?:dày|dày\s+dính)\s+màng\s+phổi(?:\s+khu\s+trú)?(?:\s+bên\s+(?:phải|trái|hai\s+bên))?\s+(?:và|,)\s*/gi, "");
      klBody = klBody.replace(/\s{2,}/g, " ").replace(/\.\s*\./g, ".").trim();
      if (klBody && !/[.!?]$/.test(klBody)) klBody += ".";
    }

    text = motaPart.trim() + "\nKết luận:\n" + klBody.trim();
  }

  // 4. Chuẩn hoá câu Kết luận theo Lung-RADS v2022
  text = text.replace(/((?:Kết\s*luận\s*:?\s*))([\s\S]*)/i, function(_, label, klBody) {
    const cleanKL = sanitizeLungRADSConclusion(klBody);
    return label.trim() + "\n" + cleanKL;
  });

  return text;
}
