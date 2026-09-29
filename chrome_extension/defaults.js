// defaults.js - Cấu hình mặc định cho AutoRIS Chrome Extension
const STORAGE_KEYS = {
  SERVER_URL: "autoris_server_url",
  AUTO_APPLY: "autoris_auto_apply",
  SMART_SPLIT: "autoris_smart_split",
  AUTO_COPY: "autoris_auto_copy",
  PLAY_CHIME: "autoris_play_chime",
  SHOW_FLOATING_BAR: "autoris_show_floating_bar",
  HOTKEY_ENABLED: "autoris_hotkey_enabled",
  LAST_DICTATION: "autoris_last_dictation",
  LAST_APPLIED_ID: "autoris_last_applied_id",
  RECENT_HISTORY: "autoris_recent_history"
};

const DEFAULT_CONFIG = {
  serverUrl: "https://autoris.hoang.qzz.io",
  autoApply: true,           // Tự động điền ngay khi nhận câu đọc mới từ điện thoại hoặc PC
  smartSplit: true,          // Tự động bóc tách Mô tả (Findings) và Kết luận (Conclusion)
  autoCopy: true,            // Tự động sao chép vào clipboard để Ctrl+V dự phòng
  playChime: true,           // Phát âm thanh chuông nhẹ khi điền thành công
  showFloatingBar: true,     // Hiển thị thanh trạng thái / Micro nổi trên màn hình RIS
  hotkeyEnabled: true,       // Bấm F8 để bật/tắt micro PC đọc trực tiếp
  pollIntervalMs: 800        // Chu kỳ kiểm tra dữ liệu từ server (ms)
};

// Từ khóa phân định kết luận
const CONCLUSION_KEYWORDS = [
  "kết luận:",
  "kết luận",
  "kết_luận:",
  "kết_luận",
  "kl:",
  "nghĩ đến:",
  "theo dõi:",
  "hướng đến:",
  "chẩn đoán:",
  "đề nghị:"
];
