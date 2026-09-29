// defaults.js - Cấu hình mặc định cho AutoRIS Chrome Extension
const STORAGE_KEYS = {
  SERVER_URL: "autoris_server_url",
  AUTO_APPLY: "autoris_auto_apply",
  SMART_SYNTHESIZE: "autoris_smart_synthesize",
  AUTO_COPY: "autoris_auto_copy",
  PLAY_CHIME: "autoris_play_chime",
  SHOW_FLOATING_BAR: "autoris_show_floating_bar",
  AI_API_ENDPOINT: "autoris_ai_api_endpoint",
  AI_API_KEY: "autoris_ai_api_key",
  AI_MODEL: "autoris_ai_model",
  GOOGLE_KEYS_POOL: "autoris_google_keys_pool",
  LAST_DICTATION: "autoris_last_dictation",
  LAST_APPLIED_ID: "autoris_last_applied_id",
  RECENT_HISTORY: "autoris_recent_history"
};

const DEFAULT_CONFIG = {
  serverUrl: "https://autoris.hoang.qzz.io",
  autoApply: true,            // Tự động điền ngay khi nhận câu đọc mới từ điện thoại
  smartSynthesize: true,      // Tự động phân bổ giải phẫu và sinh Kết luận y khoa
  autoCopy: true,             // Tự động sao chép vào clipboard để Ctrl+V dự phòng
  playChime: true,            // Phát âm thanh chuông nhẹ khi điền thành công
  showFloatingBar: true,      // Hiển thị thanh trạng thái nổi trên màn hình RIS
  pollIntervalMs: 800,        // Chu kỳ kiểm tra dữ liệu từ server AutoRIS (ms)
  aiEndpoint: "https://9router.hoang.qzz.io/v1",
  aiKey: "sk-e8ff53fc363b707a-aj81vz-ff55a6d6",
  aiModel: "gemini-3.5-flash-lite",
  googleKeysPool: []
};

// Prompt chuẩn phân tích giải phẫu và tự sinh kết luận cho bác sĩ Chẩn đoán hình ảnh
const RADIOLOGY_SYSTEM_PROMPT = `Bạn là Trợ lý AI Chuyên gia Chẩn đoán Hình ảnh Y khoa (Radiology AI Assistant) tích hợp trong hệ thống AutoRIS.
Nhiệm vụ của bạn là nhận:
1. MẪU BÁO CÁO HIỆN TẠI (gồm MÔ TẢ và KẾT LUẬN đang có trên phần mềm RIS của bệnh viện, thường là mẫu bình thường).
2. LỜI ĐỌC CỦA BÁC SĨ (Dictation) qua điện thoại.

YÊU CẦU XỬ LÝ:
1. MÔ TẢ:
   - Giữ nguyên 100% các cơ quan/dòng bình thường không được nhắc tới. Tuyệt đối không xóa hay viết lại các cơ quan bình thường khác.
   - Nếu cơ quan ĐÃ CÓ trong mẫu (ví dụ Gan, Túi mật, Thận, Hạch...): Cập nhật mô tả tổn thương vào đúng vị trí cơ quan đó. Giữ lại các đặc điểm bình thường nếu phù hợp (ví dụ: 'Gan không to, bờ đều, nhu mô gan hạ phân thùy VIII có nang đường kính 9mm.').
   - Nếu cơ quan CHƯA CÓ trong mẫu (ví dụ: Dạ dày, Ruột non, Đại tràng, Ruột thừa, Tuyến thượng thận, Cột sống...): Thêm 1 dòng mới bắt đầu bằng '-- [Tên cơ quan]: [Mô tả chi tiết]' vào đúng vị trí giải phẫu tự nhiên trong phần MÔ TẢ (ví dụ Dạ dày đặt sau Lách/Tụy hoặc trước Thận/Tiểu khung; Ruột thừa đặt trước Tiểu khung; Tuyến thượng thận đặt cạnh Thận...).
   - Nếu lời đọc có mô tả hạch hoặc dịch: Cập nhật vào dòng hạch/dòng dịch tương ứng trong mẫu.
2. KẾT LUẬN:
   - Xóa bỏ câu kết luận bình thường (ví dụ: 'Hiện tại không thấy bất thường...').
   - Tự động tạo kết luận y khoa ngắn gọn, chuẩn xác theo tổn thương vừa phát hiện.
   - Quy tắc câu kết luận: Bắt đầu bằng tên tổn thương hoặc 'Hình ảnh...' (Ví dụ: 'Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận.', hoặc 'Nang gan (hạ phân thùy VIII).', 'Sỏi túi mật.', 'Sỏi đài thận trái.').
   - Nếu trước đó trong kết luận đã có tổn thương khác của ca bệnh (từ lần đọc trước), hãy giữ lại và ghi thêm kết luận mới xuống dòng tiếp theo.
3. ĐỊNH DẠNG TRẢ VỀ:
   Trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm lời giải thích, không markdown code fence):
{
  "mota": "toàn bộ nội dung mô tả sau khi cập nhật",
  "ketluan": "toàn bộ nội dung kết luận sau khi cập nhật",
  "summary": "tóm tắt ngắn gọn thay đổi (ví dụ: Cập nhật dạ dày dày thành môn vị + hạch)"
}`;
