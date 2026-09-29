// popup.js - Quản lý cài đặt Extension và Lịch sử câu đọc AutoRIS
document.addEventListener("DOMContentLoaded", async () => {
  const serverUrlInput = document.getElementById("server-url");
  const aiEndpointInput = document.getElementById("ai-endpoint");
  const autoApplyCheck = document.getElementById("auto-apply");
  const smartSynthesizeCheck = document.getElementById("smart-synthesize");
  const showFloatingBarCheck = document.getElementById("show-floating-bar");
  const playChimeCheck = document.getElementById("play-chime");
  const statusBadge = document.getElementById("server-status-badge");
  const saveBtn = document.getElementById("btn-save");
  const testBtn = document.getElementById("btn-test");
  const historyList = document.getElementById("history-list");

  // Load cấu hình đã lưu
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.SERVER_URL,
    STORAGE_KEYS.AI_API_ENDPOINT,
    STORAGE_KEYS.AUTO_APPLY,
    STORAGE_KEYS.SMART_SYNTHESIZE,
    STORAGE_KEYS.SHOW_FLOATING_BAR,
    STORAGE_KEYS.PLAY_CHIME,
    STORAGE_KEYS.RECENT_HISTORY
  ]);

  serverUrlInput.value = stored[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl;
  aiEndpointInput.value = stored[STORAGE_KEYS.AI_API_ENDPOINT] || DEFAULT_CONFIG.aiEndpoint;
  autoApplyCheck.checked = stored[STORAGE_KEYS.AUTO_APPLY] !== undefined ? stored[STORAGE_KEYS.AUTO_APPLY] : DEFAULT_CONFIG.autoApply;
  smartSynthesizeCheck.checked = stored[STORAGE_KEYS.SMART_SYNTHESIZE] !== undefined ? stored[STORAGE_KEYS.SMART_SYNTHESIZE] : DEFAULT_CONFIG.smartSynthesize;
  showFloatingBarCheck.checked = stored[STORAGE_KEYS.SHOW_FLOATING_BAR] !== undefined ? stored[STORAGE_KEYS.SHOW_FLOATING_BAR] : DEFAULT_CONFIG.showFloatingBar;
  playChimeCheck.checked = stored[STORAGE_KEYS.PLAY_CHIME] !== undefined ? stored[STORAGE_KEYS.PLAY_CHIME] : DEFAULT_CONFIG.playChime;

  // Kiểm tra kết nối ban đầu
  checkConnection(serverUrlInput.value);

  // Render lịch sử câu đọc
  renderHistory(stored[STORAGE_KEYS.RECENT_HISTORY] || []);

  // Lưu cấu hình
  saveBtn.addEventListener("click", async () => {
    const newServerUrl = serverUrlInput.value.trim().replace(/\/+$/, "");
    const newAiEndpoint = aiEndpointInput.value.trim().replace(/\/+$/, "");
    await chrome.storage.local.set({
      [STORAGE_KEYS.SERVER_URL]: newServerUrl,
      [STORAGE_KEYS.AI_API_ENDPOINT]: newAiEndpoint,
      [STORAGE_KEYS.AUTO_APPLY]: autoApplyCheck.checked,
      [STORAGE_KEYS.SMART_SYNTHESIZE]: smartSynthesizeCheck.checked,
      [STORAGE_KEYS.SHOW_FLOATING_BAR]: showFloatingBarCheck.checked,
      [STORAGE_KEYS.PLAY_CHIME]: playChimeCheck.checked
    });

    saveBtn.textContent = "✅ Đã lưu!";
    setTimeout(() => { saveBtn.textContent = "💾 Lưu Cấu Hình"; }, 1500);
    checkConnection(newServerUrl);
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
