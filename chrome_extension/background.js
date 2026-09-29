// background.js - Service Worker đồng bộ dữ liệu ASR từ AutoRIS Server về RIS Tab
let pollTimer = null;
let lastSeenId = 0;
let isPolling = false;

// Khởi tạo cấu hình ban đầu
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (items) => {
    const toSet = {};
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
      if (items[k] === undefined) toSet[k] = v;
    }
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet);
    }
    console.log("[AutoRIS BG] Extension installed & defaults set.");
  });

  startPollingLoop();
});

// Bắt đầu vòng lặp polling
function startPollingLoop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollLatestDictation, DEFAULT_CONFIG.pollIntervalMs || 800);
  console.log("[AutoRIS BG] Polling loop started.");
}

// Hàm kiểm tra ca đọc mới nhất từ server
async function pollLatestDictation() {
  if (isPolling) return;
  isPolling = true;

  try {
    const config = await chrome.storage.local.get([STORAGE_KEYS.SERVER_URL, STORAGE_KEYS.LAST_APPLIED_ID]);
    const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    const lastId = config[STORAGE_KEYS.LAST_APPLIED_ID] || lastSeenId || 0;

    const url = `${serverUrl}/api/dictation/latest${lastId ? `?after_id=${encodeURIComponent(lastId)}` : ""}`;
    const resp = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!resp.ok) {
      isPolling = false;
      return;
    }

    const data = await resp.json();
    if (data && data.has_new && data.dictation) {
      const item = data.dictation;
      const itemId = item.id;

      // Tránh lặp lại câu cũ
      if (itemId && itemId !== lastId) {
        lastSeenId = itemId;
        await chrome.storage.local.set({
          [STORAGE_KEYS.LAST_APPLIED_ID]: itemId,
          [STORAGE_KEYS.LAST_DICTATION]: item
        });

        console.log("[AutoRIS BG] New dictation received from phone:", item);

        // Lưu vào lịch sử gần nhất (tối đa 10 câu)
        const histResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_HISTORY);
        const history = histResult[STORAGE_KEYS.RECENT_HISTORY] || [];
        history.unshift(item);
        if (history.length > 10) history.pop();
        await chrome.storage.local.set({ [STORAGE_KEYS.RECENT_HISTORY]: history });

        // Gửi lệnh tới tất cả các tab RIS đang mở
        broadcastDictationToRISTabs(item);
      }
    }
  } catch (err) {
    // Network silence (không spam log khi mất kết nối tạm thời)
  } finally {
    isPolling = false;
  }
}

// Bắn sự kiện tới content scripts trên các tab RIS
function broadcastDictationToRISTabs(dictationItem) {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    for (const tab of tabs) {
      if (!tab.url) continue;
      const url = tab.url.toLowerCase();
      // Nhận diện tab RIS (192.168.50.105, pacs.benhviendaihocyhanoi.com hoặc url chứa ris/report)
      const isTarget = url.includes("192.168.50.105") ||
                       url.includes("benhviendaihocyhanoi.com") ||
                       url.includes("192.168.50.110") ||
                       url.includes("study/reading") ||
                       url.includes("ris") ||
                       url.includes("diagnosis") ||
                       url.includes("report");

      if (isTarget) {
        chrome.tabs.sendMessage(tab.id, {
          action: "ACTION_NEW_DICTATION",
          data: dictationItem
        }, () => {
          // Bỏ qua lỗi nếu tab chưa load xong content script
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    }
  });
}

// Lắng nghe yêu cầu từ Popup hoặc Content Script
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "CHECK_SERVER_STATUS") {
    const serverUrl = (req.serverUrl || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    fetch(`${serverUrl}/api/health`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Asynchronous response
  }

  if (req.action === "TRIGGER_POLL_NOW") {
    pollLatestDictation().then(() => sendResponse({ done: true }));
    return true;
  }

  if (req.action === "RE_APPLY_DICTATION") {
    if (req.dictation) {
      broadcastDictationToRISTabs(req.dictation);
      sendResponse({ success: true });
    }
    return false;
  }
});
