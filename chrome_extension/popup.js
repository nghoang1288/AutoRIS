// popup.js - Quản lý cài đặt Extension AutoRIS
document.addEventListener("DOMContentLoaded", async () => {
  const autoApplyCheck = document.getElementById("auto-apply");
  const smartSynthesizeCheck = document.getElementById("smart-synthesize");
  const showFloatingBarCheck = document.getElementById("show-floating-bar");
  const playChimeCheck = document.getElementById("play-chime");
  const statusBadge = document.getElementById("server-status-badge");

  // Load cấu hình đã lưu
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.AUTO_APPLY,
    STORAGE_KEYS.SMART_SYNTHESIZE,
    STORAGE_KEYS.SHOW_FLOATING_BAR,
    STORAGE_KEYS.PLAY_CHIME
  ]);

  autoApplyCheck.checked = stored[STORAGE_KEYS.AUTO_APPLY] !== undefined ? stored[STORAGE_KEYS.AUTO_APPLY] : DEFAULT_CONFIG.autoApply;
  smartSynthesizeCheck.checked = stored[STORAGE_KEYS.SMART_SYNTHESIZE] !== undefined ? stored[STORAGE_KEYS.SMART_SYNTHESIZE] : DEFAULT_CONFIG.smartSynthesize;
  showFloatingBarCheck.checked = stored[STORAGE_KEYS.SHOW_FLOATING_BAR] !== undefined ? stored[STORAGE_KEYS.SHOW_FLOATING_BAR] : DEFAULT_CONFIG.showFloatingBar;
  playChimeCheck.checked = stored[STORAGE_KEYS.PLAY_CHIME] !== undefined ? stored[STORAGE_KEYS.PLAY_CHIME] : DEFAULT_CONFIG.playChime;

  // Tự động lưu cấu hình mỗi khi bật/tắt switch
  const saveOptions = () => {
    chrome.storage.local.set({
      [STORAGE_KEYS.AUTO_APPLY]: autoApplyCheck.checked,
      [STORAGE_KEYS.SMART_SYNTHESIZE]: smartSynthesizeCheck.checked,
      [STORAGE_KEYS.SHOW_FLOATING_BAR]: showFloatingBarCheck.checked,
      [STORAGE_KEYS.PLAY_CHIME]: playChimeCheck.checked
    });
  };

  autoApplyCheck.addEventListener("change", saveOptions);
  smartSynthesizeCheck.addEventListener("change", saveOptions);
  showFloatingBarCheck.addEventListener("change", saveOptions);
  playChimeCheck.addEventListener("change", saveOptions);

  // Kiểm tra kết nối máy chủ AutoRIS
  function checkConnection() {
    statusBadge.textContent = "Đang kiểm tra...";
    statusBadge.className = "status-badge";

    chrome.runtime.sendMessage({
      action: "CHECK_SERVER_STATUS",
      serverUrl: DEFAULT_CONFIG.serverUrl
    }, (res) => {
      if (res && res.success) {
        statusBadge.textContent = "🟢 Online";
        statusBadge.className = "status-badge status-online";
      } else {
        statusBadge.textContent = "🔴 Mất kết nối";
        statusBadge.className = "status-badge status-offline";
      }
    });
  }

  // Quản lý đồng bộ luật lâm sàng OTA
  const synthStatusEl = document.getElementById("synthesizer-status");
  const synthSyncDescEl = document.getElementById("synthesizer-sync-desc");
  const btnSyncSynth = document.getElementById("btn-sync-synthesizer");

  async function updateSynthesizerUI() {
    const synthData = await chrome.storage.local.get([
      STORAGE_KEYS.SYNTHESIZER_VERSION,
      STORAGE_KEYS.SYNTHESIZER_SYNC_TIME,
      STORAGE_KEYS.SYNTHESIZER_CODE
    ]);

    if (synthData[STORAGE_KEYS.SYNTHESIZER_CODE]) {
      const ver = synthData[STORAGE_KEYS.SYNTHESIZER_VERSION] || "Đã nạp";
      const syncTime = synthData[STORAGE_KEYS.SYNTHESIZER_SYNC_TIME]
        ? new Date(synthData[STORAGE_KEYS.SYNTHESIZER_SYNC_TIME]).toLocaleTimeString("vi-VN")
        : "";
      synthStatusEl.textContent = `🟢 v${ver}`;
      synthStatusEl.style.color = "#34d399";
      synthSyncDescEl.textContent = syncTime ? `Đã đồng bộ lúc: ${syncTime}` : "Đang dùng luật mới nhất từ VPS";
    } else {
      synthStatusEl.textContent = "⚪ Bản gốc (Mặc định)";
      synthStatusEl.style.color = "#94a3b8";
      synthSyncDescEl.textContent = "Chưa nạp luật từ VPS (dùng file mặc định)";
    }
  }

  if (btnSyncSynth) {
    btnSyncSynth.addEventListener("click", () => {
      btnSyncSynth.disabled = true;
      btnSyncSynth.textContent = "⏳ Đang tải từ VPS...";
      chrome.runtime.sendMessage({ action: "SYNC_SYNTHESIZER" }, (res) => {
        btnSyncSynth.disabled = false;
        btnSyncSynth.textContent = "⚡ Cập nhật luật mới từ VPS ngay";
        if (res && res.success) {
          updateSynthesizerUI();
          alert(res.updated ? `✅ Đã cập nhật phiên bản mới (v${res.version}) từ VPS!` : "ℹ️ Bạn đang dùng phiên bản mới nhất từ VPS!");
        } else {
          alert(`❌ Lỗi cập nhật: ${res?.error || res?.reason || "Không thể kết nối máy chủ"}`);
        }
      });
    });
  }

  checkConnection();
  updateSynthesizerUI();
});
