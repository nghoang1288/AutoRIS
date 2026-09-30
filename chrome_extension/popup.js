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

  checkConnection();
});
