// popup.js - Quản lý cài đặt Extension AutoRIS
document.addEventListener("DOMContentLoaded", async () => {
  const autoApplyCheck = document.getElementById("auto-apply");
  const smartSynthesizeCheck = document.getElementById("smart-synthesize");
  const showFloatingBarCheck = document.getElementById("show-floating-bar");
  const playChimeCheck = document.getElementById("play-chime");
  const statusBadge = document.getElementById("server-status-badge");

  const modeSelect = document.getElementById("connection-mode");
  const geminiKeysTextarea = document.getElementById("gemini-api-keys");
  const geminiKeysCount = document.getElementById("gemini-keys-count");
  const btnToggleMaskKey = document.getElementById("btn-toggle-mask-key");
  const btnSaveKey = document.getElementById("btn-save-gemini-key");
  const keySavedMsg = document.getElementById("key-saved-msg");
  const btnTestAi = document.getElementById("btn-test-ai");
  const aiTestResult = document.getElementById("ai-test-result");

  function updateKeyCountDisplay(count) {
    if (!geminiKeysCount) return;
    if (count > 1) {
      geminiKeysCount.textContent = `⚡ Đang có ${count} key luân phiên giảm tải`;
      geminiKeysCount.style.color = "#10b981";
    } else if (count === 1) {
      geminiKeysCount.textContent = "🔑 1 key hoạt động";
      geminiKeysCount.style.color = "#38bdf8";
    } else {
      geminiKeysCount.textContent = "⚠️ Chưa có key cá nhân";
      geminiKeysCount.style.color = "#f59e0b";
    }
  }

  // Load cấu hình đã lưu
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.AUTO_APPLY,
    STORAGE_KEYS.SMART_SYNTHESIZE,
    STORAGE_KEYS.SHOW_FLOATING_BAR,
    STORAGE_KEYS.PLAY_CHIME,
    STORAGE_KEYS.CONNECTION_MODE,
    STORAGE_KEYS.GOOGLE_KEYS_POOL,
    STORAGE_KEYS.AI_API_KEY
  ]);

  autoApplyCheck.checked = stored[STORAGE_KEYS.AUTO_APPLY] !== undefined ? stored[STORAGE_KEYS.AUTO_APPLY] : DEFAULT_CONFIG.autoApply;
  smartSynthesizeCheck.checked = stored[STORAGE_KEYS.SMART_SYNTHESIZE] !== undefined ? stored[STORAGE_KEYS.SMART_SYNTHESIZE] : DEFAULT_CONFIG.smartSynthesize;
  showFloatingBarCheck.checked = stored[STORAGE_KEYS.SHOW_FLOATING_BAR] !== undefined ? stored[STORAGE_KEYS.SHOW_FLOATING_BAR] : DEFAULT_CONFIG.showFloatingBar;
  playChimeCheck.checked = stored[STORAGE_KEYS.PLAY_CHIME] !== undefined ? stored[STORAGE_KEYS.PLAY_CHIME] : DEFAULT_CONFIG.playChime;

  if (modeSelect) {
    modeSelect.value = stored[STORAGE_KEYS.CONNECTION_MODE] || DEFAULT_CONFIG.connectionMode;
    modeSelect.addEventListener("change", () => {
      chrome.storage.local.set({ [STORAGE_KEYS.CONNECTION_MODE]: modeSelect.value });
    });
  }

  if (geminiKeysTextarea) {
    const rawPool = stored[STORAGE_KEYS.GOOGLE_KEYS_POOL];
    const pool = (Array.isArray(rawPool) && rawPool.length > 0)
      ? rawPool
      : (DEFAULT_CONFIG.googleKeysPool || []);
    geminiKeysTextarea.value = pool.join("\n");
    updateKeyCountDisplay(pool.length);

    let isKeyMasked = true;
    if (btnToggleMaskKey) {
      btnToggleMaskKey.addEventListener("click", () => {
        isKeyMasked = !isKeyMasked;
        if (isKeyMasked) {
          geminiKeysTextarea.style.webkitTextSecurity = "disc";
          btnToggleMaskKey.textContent = "👁️ Hiện key";
        } else {
          geminiKeysTextarea.style.webkitTextSecurity = "none";
          btnToggleMaskKey.textContent = "🙈 Ẩn key";
        }
      });
    }

    geminiKeysTextarea.addEventListener("input", () => {
      const lines = geminiKeysTextarea.value.split("\n").map(s => s.trim()).filter(Boolean);
      updateKeyCountDisplay(lines.length);
    });

    if (btnSaveKey) {
      btnSaveKey.addEventListener("click", async () => {
        const lines = geminiKeysTextarea.value.split("\n").map(s => s.trim()).filter(Boolean);
        const poolToSave = lines.length > 0 ? lines : DEFAULT_CONFIG.googleKeysPool;
        await chrome.storage.local.set({
          [STORAGE_KEYS.GOOGLE_KEYS_POOL]: poolToSave,
          [STORAGE_KEYS.AI_API_KEY]: poolToSave[0] || ""
        });
        updateKeyCountDisplay(poolToSave.length);
        if (keySavedMsg) {
          keySavedMsg.style.display = "block";
          setTimeout(() => { keySavedMsg.style.display = "none"; }, 3000);
        }
      });
    }
  }

  if (btnTestAi) {
    btnTestAi.addEventListener("click", () => {
      btnTestAi.disabled = true;
      btnTestAi.textContent = "⏳ Đang kiểm tra AI...";
      if (aiTestResult) aiTestResult.style.display = "none";

      chrome.runtime.sendMessage({ action: "TEST_AI_CONNECTION" }, (res) => {
        btnTestAi.disabled = false;
        btnTestAi.textContent = "🧪 Kiểm tra kết nối AI ngay";
        if (aiTestResult) {
          aiTestResult.style.display = "block";
          if (res && res.success) {
            aiTestResult.style.background = "rgba(16, 185, 129, 0.15)";
            aiTestResult.style.color = "#34d399";
            aiTestResult.style.border = "1px solid rgba(16, 185, 129, 0.3)";
            aiTestResult.textContent = `🟢 AI phản hồi tốt (${res.latencyMs}ms)! ${res.modelUsed ? `Mô hình: ${res.modelUsed}` : ""}`;
          } else {
            aiTestResult.style.background = "rgba(239, 68, 68, 0.15)";
            aiTestResult.style.color = "#f87171";
            aiTestResult.style.border = "1px solid rgba(239, 68, 68, 0.3)";
            aiTestResult.textContent = `🔴 Lỗi AI: ${res?.error || "Không có phản hồi từ AI"}`;
          }
        }
      });
    });
  }

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

  // Quản lý kiểm tra và cập nhật Extension Package
  const extVerLabel = document.getElementById("ext-version-label");
  const extStatus = document.getElementById("ext-update-status");
  const extDesc = document.getElementById("ext-update-desc");
  const btnCheckUpdate = document.getElementById("btn-check-ext-update");
  const btnDownloadUpdate = document.getElementById("btn-download-ext-update");

  const currentVer = chrome.runtime.getManifest().version;
  if (extVerLabel) extVerLabel.textContent = `AutoRIS Extension (v${currentVer})`;

  async function updateExtUpdateUI() {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.EXTENSION_UPDATE_AVAILABLE,
      STORAGE_KEYS.LATEST_EXTENSION_VERSION,
      STORAGE_KEYS.EXTENSION_RELEASE_NOTES
    ]);
    const hasUpdate = !!data[STORAGE_KEYS.EXTENSION_UPDATE_AVAILABLE];
    const latestVer = data[STORAGE_KEYS.LATEST_EXTENSION_VERSION] || currentVer;

    if (hasUpdate && latestVer !== currentVer) {
      if (extStatus) {
        extStatus.textContent = `⚡ Có bản v${latestVer}`;
        extStatus.style.color = "#f59e0b";
      }
      if (extDesc) {
        extDesc.textContent = data[STORAGE_KEYS.EXTENSION_RELEASE_NOTES] || "Đã có bản phát hành mới trên máy chủ.";
      }
      if (btnDownloadUpdate) {
        btnDownloadUpdate.style.display = "inline-block";
        btnDownloadUpdate.textContent = `🚀 Tải bản v${latestVer} (ZIP)`;
      }
    } else {
      if (extStatus) {
        extStatus.textContent = "Mới nhất ✅";
        extStatus.style.color = "#10b981";
      }
      if (extDesc) {
        extDesc.textContent = "Phiên bản hiện tại đang tương thích hoàn hảo.";
      }
      if (btnDownloadUpdate) {
        btnDownloadUpdate.style.display = "none";
      }
    }
  }

  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener("click", () => {
      btnCheckUpdate.disabled = true;
      btnCheckUpdate.textContent = "⏳ Đang kiểm tra...";
      chrome.runtime.sendMessage({ action: "CHECK_EXTENSION_UPDATE" }, (res) => {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = "🔄 Kiểm tra bản mới";
        updateExtUpdateUI();
        if (res && res.hasUpdate) {
          alert(`⚡ Có bản cập nhật mới: v${res.latestVersion}!\nNhấn "Cập nhật ngay (ZIP)" để tải về.`);
        } else if (res && res.checked) {
          alert("✅ Bạn đang sử dụng phiên bản mới nhất!");
        } else {
          alert(`ℹ️ Trạng thái: ${res?.reason || "Đã kiểm tra"}`);
        }
      });
    });
  }

  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener("click", () => {
      btnDownloadUpdate.disabled = true;
      btnDownloadUpdate.textContent = "⏳ Đang tải file ZIP...";
      chrome.runtime.sendMessage({ action: "DOWNLOAD_EXTENSION_UPDATE" }, (res) => {
        btnDownloadUpdate.disabled = false;
        btnDownloadUpdate.textContent = "🚀 Tải lại bản ZIP";
        alert("📥 Đã bắt đầu tải file autoris-extension.zip về máy!\n\n💡 Mẹo 1-Click: Bạn chỉ cần nhấp đúp file 'cap_nhat.bat' trong thư mục Extension hiện tại để tự động tải & ghi đè, sau đó ấn biểu tượng 🔄 Reload trong chrome://extensions là xong!");
      });
    });
  }

  checkConnection();
  updateSynthesizerUI();
  updateExtUpdateUI();
});
