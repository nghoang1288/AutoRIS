// popup.js - Quản lý cài đặt Extension và Lịch sử câu đọc
document.addEventListener("DOMContentLoaded", async () => {
  const serverUrlInput = document.getElementById("server-url");
  const autoApplyCheck = document.getElementById("auto-apply");
  const smartSplitCheck = document.getElementById("smart-split");
  const showFloatingBarCheck = document.getElementById("show-floating-bar");
  const playChimeCheck = document.getElementById("play-chime");
  const statusBadge = document.getElementById("server-status-badge");
  const saveBtn = document.getElementById("btn-save");
  const testBtn = document.getElementById("btn-test");
  const historyList = document.getElementById("history-list");

  // Load cấu hình đã lưu
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.SERVER_URL,
    STORAGE_KEYS.AUTO_APPLY,
    STORAGE_KEYS.SMART_SPLIT,
    STORAGE_KEYS.SHOW_FLOATING_BAR,
    STORAGE_KEYS.PLAY_CHIME,
    STORAGE_KEYS.RECENT_HISTORY
  ]);

  serverUrlInput.value = stored[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl;
  autoApplyCheck.checked = stored[STORAGE_KEYS.AUTO_APPLY] !== undefined ? stored[STORAGE_KEYS.AUTO_APPLY] : DEFAULT_CONFIG.autoApply;
  smartSplitCheck.checked = stored[STORAGE_KEYS.SMART_SPLIT] !== undefined ? stored[STORAGE_KEYS.SMART_SPLIT] : DEFAULT_CONFIG.smartSplit;
  showFloatingBarCheck.checked = stored[STORAGE_KEYS.SHOW_FLOATING_BAR] !== undefined ? stored[STORAGE_KEYS.SHOW_FLOATING_BAR] : DEFAULT_CONFIG.showFloatingBar;
  playChimeCheck.checked = stored[STORAGE_KEYS.PLAY_CHIME] !== undefined ? stored[STORAGE_KEYS.PLAY_CHIME] : DEFAULT_CONFIG.playChime;

  // Kiểm tra kết nối ban đầu
  checkConnection(serverUrlInput.value);

  // Render lịch sử câu đọc
  renderHistory(stored[STORAGE_KEYS.RECENT_HISTORY] || []);

  // Lưu cấu hình
  saveBtn.addEventListener("click", async () => {
    const newUrl = serverUrlInput.value.trim().replace(/\/+$/, "");
    await chrome.storage.local.set({
      [STORAGE_KEYS.SERVER_URL]: newUrl,
      [STORAGE_KEYS.AUTO_APPLY]: autoApplyCheck.checked,
      [STORAGE_KEYS.SMART_SPLIT]: smartSplitCheck.checked,
      [STORAGE_KEYS.SHOW_FLOATING_BAR]: showFloatingBarCheck.checked,
      [STORAGE_KEYS.PLAY_CHIME]: playChimeCheck.checked
    });

    saveBtn.textContent = "✅ Đã lưu!";
    setTimeout(() => { saveBtn.textContent = "💾 Lưu Cấu Hình"; }, 1500);
    checkConnection(newUrl);
  });

  // Test kết nối
  testBtn.addEventListener("click", () => {
    checkConnection(serverUrlInput.value.trim());
  });

  function checkConnection(url) {
    statusBadge.textContent = "Đang kiểm tra...";
    statusBadge.className = "status-badge";

    chrome.runtime.sendMessage({
      action: "CHECK_SERVER_STATUS",
      serverUrl: url
    }, (res) => {
      if (res && res.success && res.data) {
        statusBadge.textContent = `🟢 Online (${res.data.total_stored || 0} ca)`;
        statusBadge.className = "status-badge status-online";
      } else {
        statusBadge.textContent = "🔴 Mất kết nối";
        statusBadge.className = "status-badge status-offline";
      }
    });
  }

  function renderHistory(items) {
    if (!items || items.length === 0) {
      historyList.innerHTML = `<div style="font-size:11px;color:#64748b;text-align:center;padding:8px;">Chưa có câu đọc nào gần đây</div>`;
      return;
    }

    historyList.innerHTML = "";
    items.slice(0, 5).forEach((item) => {
      const text = item.normalized_transcript || item.raw_transcript || "";
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `
        <span class="history-text" title="${escapeHtml(text)}">${escapeHtml(text)}</span>
        <button class="btn-apply-small">Điền</button>
      `;

      div.querySelector(".btn-apply-small").addEventListener("click", () => {
        chrome.runtime.sendMessage({
          action: "RE_APPLY_DICTATION",
          dictation: item
        });
        div.querySelector(".btn-apply-small").textContent = "✓";
        setTimeout(() => { div.querySelector(".btn-apply-small").textContent = "Điền"; }, 1000);
      });

      historyList.appendChild(div);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, t => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[t] || t));
  }
});
