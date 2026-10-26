// background.js - Service Worker đồng bộ ASR (Điện thoại) & Tổng hợp Lung-RADS (PACS) cho AutoRIS
importScripts("defaults.js");

let pollTimer = null;
let lastSeenId = 0;
let isPolling = false;

// 1. Khởi tạo cấu hình ban đầu khi cài đặt Extension (Zero-click Auto-migration)
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (items) => {
    const toSet = {};
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
      if (items[k] === undefined) toSet[k] = v;
    }
    if (!items[STORAGE_KEYS.SYSTEM_PROMPT] || !items[STORAGE_KEYS.SYSTEM_PROMPT].includes("QUY TẮC BẮT BUỘC VỀ DÀY MÀNG PHỔI KHU TRÚ")) {
      toSet[STORAGE_KEYS.SYSTEM_PROMPT] = LUNG_RADS_SYSTEM_PROMPT;
    }
    toSet[STORAGE_KEYS.INSTALLED_VERSION] = chrome.runtime.getManifest().version;
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet);
    }
    console.log("[AutoRIS BG] Extension installed & defaults set.");
  });

  startPollingLoop();
  checkAndUpdateSynthesizerCode(true);
  checkExtensionPackageUpdate(true);
  chrome.alarms.create('autoris-keepalive', { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(() => {
  startPollingLoop();
  checkAndUpdateSynthesizerCode(true);
  checkExtensionPackageUpdate(true);
});

startPollingLoop();
checkAndUpdateSynthesizerCode(true);
checkExtensionPackageUpdate(true);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoris-keepalive') {
    pollLatestDictation();
    checkAndUpdateSynthesizerCode();
    checkExtensionPackageUpdate();
  }
});

let pollCycleCounter = 0;

// 2. Vòng lặp polling kiểm tra ca đọc mới từ máy chủ AutoRIS
function startPollingLoop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollLatestDictation, DEFAULT_CONFIG.pollIntervalMs || 800);
  console.log("[AutoRIS BG] AutoRIS server polling started.");
}

// 2.2. Kiểm tra và tự động cập nhật luật ClinicalSynthesizer từ VPS
async function checkAndUpdateSynthesizerCode(force = false) {
  try {
    const config = await chrome.storage.local.get([
      STORAGE_KEYS.SERVER_URL,
      STORAGE_KEYS.API_TOKEN,
      STORAGE_KEYS.SYNTHESIZER_VERSION,
      STORAGE_KEYS.SYNTHESIZER_CODE
    ]);
    const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    const token = (config[STORAGE_KEYS.API_TOKEN] || "").trim();
    const currentVersion = config[STORAGE_KEYS.SYNTHESIZER_VERSION] || 0;
    const hasCode = !!config[STORAGE_KEYS.SYNTHESIZER_CODE];

    const headers = {};
    if (token) {
      headers["X-Client-Token"] = token;
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 1. Kiểm tra version nhẹ từ server trước
    const verUrl = `${serverUrl}/api/clinical_synthesizer/version?t=${Date.now()}`;
    const verRes = await fetch(verUrl, { cache: "no-store", headers });
    if (!verRes.ok) return { updated: false, reason: "server_offline" };
    const verData = await verRes.json();

    if (verData.status === "ok" && verData.version) {
      if (force || !hasCode || verData.version !== currentVersion) {
        // 2. Tải toàn bộ mã JS mới từ server
        const codeUrl = `${serverUrl}/api/clinical_synthesizer.js?t=${Date.now()}`;
        const codeRes = await fetch(codeUrl, { cache: "no-store", headers });
        if (!codeRes.ok) return { updated: false, reason: "fetch_code_failed" };
        const newCode = await codeRes.text();

        if (newCode && newCode.includes("ClinicalSynthesizer")) {
          // Kiểm tra toàn vẹn SHA-256 chống MITM / file hỏng
          if (verData.sha256) {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(newCode);
            const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const computedSha256 = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
            if (computedSha256.toLowerCase() !== verData.sha256.toLowerCase()) {
              console.error(`[AutoRIS BG] ❌ Lỗi kiểm tra toàn vẹn mã JS! Hash không khớp: tính toán ${computedSha256} vs server ${verData.sha256}`);
              return { updated: false, reason: "integrity_check_failed" };
            }
          }

          await chrome.storage.local.set({
            [STORAGE_KEYS.SYNTHESIZER_CODE]: newCode,
            [STORAGE_KEYS.SYNTHESIZER_VERSION]: verData.version,
            [STORAGE_KEYS.SYNTHESIZER_SYNC_TIME]: Date.now()
          });
          console.log(`[AutoRIS BG] ⚡ Nhận thành công luật ClinicalSynthesizer mới (v${verData.version}) từ ${serverUrl} (xác thực SHA-256 toàn vẹn)!`);
          return { updated: true, version: verData.version };
        }
      }
    }
    return { updated: false, reason: "already_latest", version: currentVersion };
  } catch (err) {
    return { updated: false, reason: err.message };
  }
}

// 2.3. So sánh phiên bản semver (v1.2.1 > v1.2.0)
function compareVersions(v1, v2) {
  const p1 = (v1 || "0").toString().replace(/^v/i, "").split(".").map(x => parseInt(x, 10) || 0);
  const p2 = (v2 || "0").toString().replace(/^v/i, "").split(".").map(x => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// 2.4. Kiểm tra phiên bản gói Extension từ máy chủ AutoRIS
async function checkExtensionPackageUpdate(force = false) {
  try {
    const config = await chrome.storage.local.get([
      STORAGE_KEYS.SERVER_URL,
      STORAGE_KEYS.API_TOKEN,
      STORAGE_KEYS.EXTENSION_LAST_CHECK_TIME
    ]);
    const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    const token = (config[STORAGE_KEYS.API_TOKEN] || "").trim();
    const lastCheck = config[STORAGE_KEYS.EXTENSION_LAST_CHECK_TIME] || 0;

    // Giới hạn kiểm tra 5 phút 1 lần nếu không phải ép buộc
    if (!force && Date.now() - lastCheck < 300000) {
      return { checked: false, reason: "throttled" };
    }

    const currentVersion = chrome.runtime.getManifest().version;
    const url = `${serverUrl}/api/extension/version?t=${Date.now()}`;
    const headers = {};
    if (token) {
      headers["X-Client-Token"] = token;
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(url, { cache: "no-store", headers });
    if (!res.ok) return { checked: false, reason: "server_offline" };

    const data = await res.json();
    const remoteVersion = data.version || "1.0.0";
    const downloadPath = data.zip_url || "/autoris-extension.zip";
    const fullDownloadUrl = downloadPath.startsWith("http") ? downloadPath : `${serverUrl}${downloadPath}`;
    const releaseNotes = data.release_notes || "";

    const hasNewUpdate = compareVersions(remoteVersion, currentVersion) > 0;

    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_LAST_CHECK_TIME]: Date.now(),
      [STORAGE_KEYS.EXTENSION_UPDATE_AVAILABLE]: hasNewUpdate,
      [STORAGE_KEYS.LATEST_EXTENSION_VERSION]: remoteVersion,
      [STORAGE_KEYS.EXTENSION_DOWNLOAD_URL]: fullDownloadUrl,
      [STORAGE_KEYS.EXTENSION_RELEASE_NOTES]: releaseNotes
    });

    if (hasNewUpdate) {
      chrome.action.setBadgeText({ text: "NEW" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      console.log(`[AutoRIS BG] ⚡ Có bản cập nhật Extension mới v${remoteVersion} (Hiện tại: v${currentVersion})!`);
    } else {
      chrome.action.setBadgeText({ text: "" });
    }

    return {
      checked: true,
      hasUpdate: hasNewUpdate,
      currentVersion,
      latestVersion: remoteVersion,
      downloadUrl: fullDownloadUrl,
      releaseNotes
    };
  } catch (err) {
    console.warn("[AutoRIS BG] Lỗi kiểm tra cập nhật Extension:", err);
    return { checked: false, error: err.message };
  }
}

async function pollLatestDictation() {
  if (isPolling) return;
  isPolling = true;

  // Cứ mỗi 2 chu kỳ (~1.6s) kiểm tra luật mới từ VPS
  pollCycleCounter++;
  if (pollCycleCounter % 2 === 0) {
    checkAndUpdateSynthesizerCode();
  }
  // Cứ mỗi 100 chu kỳ (~80s) kiểm tra bản cập nhật Extension package mới
  if (pollCycleCounter % 100 === 0) {
    checkExtensionPackageUpdate();
  }

  try {
    const config = await chrome.storage.local.get([
      STORAGE_KEYS.SERVER_URL,
      STORAGE_KEYS.API_TOKEN,
      STORAGE_KEYS.LAST_APPLIED_ID
    ]);
    const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    const token = (config[STORAGE_KEYS.API_TOKEN] || "").trim();
    const lastId = config[STORAGE_KEYS.LAST_APPLIED_ID] || lastSeenId || 0;

    const url = `${serverUrl}/api/dictation/latest${lastId ? `?after_id=${encodeURIComponent(lastId)}` : ""}`;
    const headers = { "Accept": "application/json" };
    if (token) {
      headers["X-Client-Token"] = token;
      headers["Authorization"] = `Bearer ${token}`;
    }
    const resp = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers
    });

    if (!resp.ok) {
      isPolling = false;
      return;
    }

    const data = await resp.json();
    if (data && data.has_new) {
      const itemsToProcess = (data.dictations && Array.isArray(data.dictations) && data.dictations.length > 0)
        ? data.dictations
        : (data.dictation ? [data.dictation] : []);

      for (const item of itemsToProcess) {
        const itemId = item.id;
        if (!itemId || itemId === lastSeenId) continue;

        lastSeenId = itemId;
        await chrome.storage.local.set({
          [STORAGE_KEYS.LAST_APPLIED_ID]: itemId,
          [STORAGE_KEYS.LAST_DICTATION]: item
        });

        console.log("[AutoRIS BG] New phone dictation received:", item);

        // Lưu vào danh sách lịch sử gần nhất (tối đa 10 câu)
        const histResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_HISTORY);
        const history = histResult[STORAGE_KEYS.RECENT_HISTORY] || [];
        history.unshift(item);
        if (history.length > 10) history.pop();
        await chrome.storage.local.set({ [STORAGE_KEYS.RECENT_HISTORY]: history });

        // Phát sóng lệnh tới tất cả các tab RIS đang mở theo đúng thứ tự
        broadcastDictationToRISTabs(item);
      }
    }
  } catch (err) {
    // Network silence
  } finally {
    isPolling = false;
  }
}

// 2.5. Kiểm tra URL trang xem ảnh DICOM viewer (tránh phát sóng vào tab xem ảnh)
function isViewerUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("vrviewer") ||
         lower.includes("dicomviewer") ||
         lower.includes("dcmviewer") ||
         lower.includes("study/viewer") ||
         lower.includes("/ris/viewer") ||
         lower.includes("/viewer") ||
         lower.includes("viewer.") ||
         lower.includes("pacsviewer") ||
         lower.includes("webviewer") ||
         lower.includes("ohif") ||
         lower.includes("cornerstone") ||
         lower.includes("weasis");
}

// 3. Phát sóng ca đọc tới các tab RIS
function broadcastDictationToRISTabs(dictationItem) {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    for (const tab of tabs) {
      if (!tab.url) continue;
      const url = tab.url.toLowerCase();
      if (isViewerUrl(url)) continue; // Bỏ qua tab DICOM viewer/vrViewer

      const isTarget = url.includes("192.168.50.105") ||
                       url.includes("benhviendaihocyhanoi.com") ||
                       url.includes("study/reading") ||
                       url.includes("/ris/") ||
                       url.includes("ris_") ||
                       url.includes("diagnosis") ||
                       url.includes("report");

      if (isTarget) {
        chrome.tabs.sendMessage(tab.id, {
          action: "ACTION_NEW_DICTATION",
          data: dictationItem
        }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    }
  });
}

// 4. Phát sóng kết quả dịch PACS Lung-RADS sang các tab RIS
function broadcastPACSToRISTabs(pacsReportText, timestamp, rawText = "") {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    for (const tab of tabs) {
      if (!tab.url) continue;
      const url = tab.url.toLowerCase();
      if (isViewerUrl(url)) continue; // Bỏ qua tab DICOM viewer/vrViewer

      const isTarget = url.includes("192.168.50.105") ||
                       url.includes("benhviendaihocyhanoi.com") ||
                       url.includes("study/reading") ||
                       url.includes("/ris/") ||
                       url.includes("ris_") ||
                       url.includes("diagnosis");

      if (isTarget) {
        chrome.tabs.sendMessage(tab.id, {
          action: ACTIONS.AUTO_APPLY_PACS,
          report: pacsReportText,
          rawText: rawText,
          timestamp: timestamp
        }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    }
  });
}

// 5. Lắng nghe yêu cầu từ Content Script (RIS & PACS) và Popup
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // A. Mở trang Cài đặt (Options / Popup)
  if (req.action === ACTIONS.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  // A1. Kiểm tra cập nhật Extension
  if (req.action === ACTIONS.CHECK_EXTENSION_UPDATE || req.action === "CHECK_EXTENSION_UPDATE") {
    checkExtensionPackageUpdate(true).then(res => {
      sendResponse({ success: true, ...res });
    });
    return true;
  }

  // A2. Tự động tải bản cập nhật Extension
  if (req.action === ACTIONS.DOWNLOAD_EXTENSION_UPDATE || req.action === "DOWNLOAD_EXTENSION_UPDATE") {
    (async () => {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.EXTENSION_DOWNLOAD_URL,
        STORAGE_KEYS.SERVER_URL
      ]);
      const serverUrl = (data[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
      const dlUrl = data[STORAGE_KEYS.EXTENSION_DOWNLOAD_URL] || `${serverUrl}/autoris-extension-v1.2.1.zip`;
      const urlFileName = dlUrl.split("/").pop().split("?")[0] || "autoris-extension-v1.2.1.zip";

      if (chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download({
          url: dlUrl,
          filename: urlFileName,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: dlUrl });
          }
          sendResponse({ success: true, downloadId, url: dlUrl });
        });
      } else {
        chrome.tabs.create({ url: dlUrl });
        sendResponse({ success: true, url: dlUrl });
      }
    })();
    return true;
  }

  // B. Kiểm tra trạng thái máy chủ AutoRIS
  if (req.action === "CHECK_SERVER_STATUS") {
    const serverUrl = (req.serverUrl || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    fetch(`${serverUrl}/api/health`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // C. Điền lại ca đọc từ lịch sử
  if (req.action === "RE_APPLY_DICTATION") {
    if (req.dictation) {
      broadcastDictationToRISTabs(req.dictation);
      sendResponse({ success: true });
    }
    return false;
  }

  // D. Tổng hợp PACS Chest CT Lung-RADS (Từ nút PACS F9)
  if (req.action === ACTIONS.SYNTHESIZE || req.action === ACTIONS.SYNTHESIZE_LUNG || (req.action === "SYNTHESIZE_REPORT" && req.payload?.rawText)) {
    const rawInputText = req.payload?.rawText || "";
    handlePACSSynthesizeReport(req.payload || {})
      .then((rawResult) => {
        const result = typeof sanitizeLungRADSReport === "function" ? sanitizeLungRADSReport(rawResult) : rawResult;
        const now = Date.now();
        chrome.storage.local.set({
          [STORAGE_KEYS.LAST_REPORT]: result,
          [STORAGE_KEYS.LAST_REPORT_TIME]: now,
          "lastRawInput": rawInputText
        });
        // Tự động phát sóng kết quả sang các tab RIS đang mở
        broadcastPACSToRISTabs(result, now, rawInputText);
        sendResponse({ success: true, data: result });
      })
      .catch((err) => {
        console.error("[AutoRIS BG] PACS synthesis error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // D0. Kiểm tra kết nối AI từ Popup
  if (req.action === "TEST_AI_CONNECTION") {
    (async () => {
      const startTime = Date.now();
      try {
        const config = await chrome.storage.local.get([
          STORAGE_KEYS.CONNECTION_MODE,
          STORAGE_KEYS.AI_API_ENDPOINT,
          STORAGE_KEYS.AI_API_KEY,
          STORAGE_KEYS.AI_MODEL,
          STORAGE_KEYS.GOOGLE_KEYS_POOL,
          STORAGE_KEYS.SERVER_URL
        ]);

        const rawResult = await handlePACSSynthesizeReport({
          connectionMode: config[STORAGE_KEYS.CONNECTION_MODE] || DEFAULT_CONFIG.connectionMode,
          apiEndpoint: config[STORAGE_KEYS.AI_API_ENDPOINT] || DEFAULT_CONFIG.aiEndpoint,
          apiKey: config[STORAGE_KEYS.AI_API_KEY] || DEFAULT_CONFIG.aiKey,
          googleKeysPool: config[STORAGE_KEYS.GOOGLE_KEYS_POOL] || DEFAULT_CONFIG.googleKeysPool,
          preferredModel: config[STORAGE_KEYS.AI_MODEL] || DEFAULT_CONFIG.aiModel,
          systemPrompt: "Bạn là trợ lý kiểm tra kết nối hệ thống. Trả về đúng 1 câu ngắn: 'AutoRIS AI Connected'.",
          rawText: "Test ping",
          serverUrl: config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl
        });

        const elapsed = Date.now() - startTime;
        sendResponse({ success: true, latencyMs: elapsed, preview: (rawResult || "").slice(0, 80) });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // D1. Phát sóng lại báo cáo PACS sang các tab RIS theo yêu cầu
  if (req.action === "BROADCAST_PACS") {
    const report = req.payload?.report;
    const rawText = req.payload?.rawText || "";
    const now = req.payload?.timestamp || Date.now();
    if (report) {
      broadcastPACSToRISTabs(report, now, rawText);
    }
    sendResponse({ success: true });
    return false;
  }

  // E. Tổng hợp báo cáo lâm sàng qua AI (Đọc từ điện thoại -> Phân bổ mô tả & kết luận)
  if (req.action === "SYNTHESIZE_REPORT" && req.payload?.dictationText) {
    handleAISynthesis(req.payload || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => {
        console.error("[AutoRIS BG] AI Synthesis error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // F. Lưu phản hồi / báo lỗi ca bệnh của bác sĩ lên server
  if (req.action === "SUBMIT_FEEDBACK") {
    handleFeedbackSubmission(req.payload || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => {
        console.error("[AutoRIS BG] Feedback error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // G. Cập nhật thủ công luật ClinicalSynthesizer từ Popup / Content
  if (req.action === "SYNC_SYNTHESIZER") {
    checkAndUpdateSynthesizerCode(true)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 5.5. Gửi log phản hồi ca bệnh của bác sĩ lên server AutoRIS (VPS)
async function handleFeedbackSubmission(payload) {
  const config = await chrome.storage.local.get([STORAGE_KEYS.SERVER_URL, STORAGE_KEYS.API_TOKEN]);
  const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
  const token = (config[STORAGE_KEYS.API_TOKEN] || "").trim();

  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["X-Client-Token"] = token;
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${serverUrl}/api/feedback/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Server lỗi HTTP ${res.status}: ${errText}`);
  }

  return await res.json();
}

// 5.5. Gọi Server Proxy (AutoRIS VPS Proxy - Bảo vệ API Key & Tích hợp Few-Shot)
async function callAutorisServerProxy(serverUrl, rawText, systemPrompt, preferredModel, timeoutMs = 25000, externalSignal = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (externalSignal) {
    externalSignal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const config = await chrome.storage.local.get([STORAGE_KEYS.API_TOKEN]);
    const token = (config[STORAGE_KEYS.API_TOKEN] || "").trim();
    const cleanUrl = (serverUrl || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");

    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["X-Client-Token"] = token;
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${cleanUrl}/api/ai/synthesize`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        rawText: rawText,
        systemPrompt: systemPrompt,
        preferredModel: preferredModel || DEFAULT_CONFIG.aiModel
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener("abort", onAbort);

    if (!response.ok) {
      throw new Error(`Server proxy error: HTTP ${response.status}`);
    }

    const resJson = await response.json();
    if (resJson.status === "success" && resJson.data) {
      return resJson.data;
    }
    throw new Error(resJson.error || "Không nhận được dữ liệu hợp lệ từ Server Proxy");
  } catch (err) {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    throw err;
  }
}

// Biến đếm round-robin toàn cục cho các key Google Gemini Direct
let roundRobinGoogleKeyIndex = 0;

// 6. Xử lý gọi AI Synthesizer cho lời đọc điện thoại (Proxy VPS -> 9router -> Fallback Direct Google luân phiên)
async function handleAISynthesis(payload) {
  const { currentMota, currentKetluan, dictationText } = payload;
  const config = await chrome.storage.local.get([
    STORAGE_KEYS.CONNECTION_MODE,
    STORAGE_KEYS.AI_API_ENDPOINT,
    STORAGE_KEYS.AI_API_KEY,
    STORAGE_KEYS.AI_MODEL,
    STORAGE_KEYS.GOOGLE_KEYS_POOL,
    STORAGE_KEYS.SERVER_URL
  ]);

  const mode = config[STORAGE_KEYS.CONNECTION_MODE] || DEFAULT_CONFIG.connectionMode;
  const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim();
  const endpoint = (config[STORAGE_KEYS.AI_API_ENDPOINT] || DEFAULT_CONFIG.aiEndpoint).trim().replace(/\/+$/, "");
  const apiKey = (config[STORAGE_KEYS.AI_API_KEY] || DEFAULT_CONFIG.aiKey).trim();
  const model = (config[STORAGE_KEYS.AI_MODEL] || DEFAULT_CONFIG.aiModel).trim();
  const googleKeysPool = config[STORAGE_KEYS.GOOGLE_KEYS_POOL] || DEFAULT_CONFIG.googleKeysPool;

  const userPrompt = `MẪU BÁO CÁO HIỆN TẠI TRÊN RIS:
MÔ TẢ:
${currentMota || "(Chưa có mô tả)"}

KẾT LUẬN:
${currentKetluan || "(Chưa có kết luận)"}

LỜI BÁC SĨ ĐỌC:
${dictationText}
`;

  if (mode === "direct") {
    const rawOut = await callGoogleGeminiDirect(googleKeysPool, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
    return parseAIJsonResult(rawOut);
  }

  // Chế độ "auto" hoặc "server": Ưu tiên 9router (qua Server VPS hoặc kết nối trực tiếp)
  // Chỉ khi không kết nối được mới fallback sang Google Direct luân phiên 3 key
  try {
    const rawOut = await callAutorisServerProxy(serverUrl, userPrompt, RADIOLOGY_SYSTEM_PROMPT, model, 25000);
    return parseAIJsonResult(rawOut);
  } catch (proxyErr) {
    console.warn("[AutoRIS BG] Server proxy gặp sự cố, thử tiếp 9router trực tiếp...", proxyErr.message);
    try {
      const rawOut = await callOpenAICompatibleServer(endpoint, apiKey, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
      return parseAIJsonResult(rawOut);
    } catch (serverErr) {
      console.warn("[AutoRIS BG] 9router gặp sự cố, chuyển tiếp sang Google Direct API luân phiên 3 key...", serverErr.message);
      try {
        const rawOut = await callGoogleGeminiDirect(googleKeysPool, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
        return parseAIJsonResult(rawOut);
      } catch (directErr) {
        throw new Error(`Server: ${proxyErr.message}; 9router: ${serverErr.message}; Google Direct: ${directErr.message}`);
      }
    }
  }
}

// 7. Xử lý gọi AI Synthesizer cho PACS Chest CT Lung-RADS (Server Proxy -> 9router -> Fallback Direct Google)
async function handlePACSSynthesizeReport(payload) {
  const { connectionMode, apiEndpoint, apiKey, googleKeysPool, preferredModel, systemPrompt, rawText, serverUrl } = payload;
  const mode = connectionMode || DEFAULT_CONFIG.connectionMode;

  const targetServerUrl = (serverUrl || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
  const serverEndpoint = (apiEndpoint || DEFAULT_CONFIG.aiEndpoint).trim().replace(/\/+$/, "");
  const serverKey = apiKey || DEFAULT_CONFIG.aiKey;
  const activeGooglePool = (googleKeysPool && googleKeysPool.length > 0) ? googleKeysPool : DEFAULT_CONFIG.googleKeysPool;
  const activePrompt = systemPrompt || LUNG_RADS_SYSTEM_PROMPT;

  const abortController = new AbortController();
  let timeoutId = null;

  const totalTimeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      reject(new Error(`Tác vụ tổng hợp vượt quá thời gian tối đa (${TIMING.TOTAL_TIMEOUT_MS / 1000}s)`));
    }, TIMING.TOTAL_TIMEOUT_MS);
  });

  const executionPromise = (async () => {
    try {
      if (mode === "direct") {
        return await callGoogleGeminiDirect(activeGooglePool, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:
${rawText}`, 15000, abortController.signal);
      }
      if (mode === "server") {
        try {
          return await callAutorisServerProxy(targetServerUrl, rawText, activePrompt, preferredModel, 25000, abortController.signal);
        } catch (proxyErr) {
          if (abortController.signal.aborted) throw proxyErr;
          console.warn("[AutoRIS BG] Server proxy lỗi, chuyển sang 9router trực tiếp:", proxyErr.message);
          return await callOpenAICompatibleServer(serverEndpoint, serverKey, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:
${rawText}`, 15000, abortController.signal);
        }
      }
      // Chế độ "auto": Ưu tiên 9router qua Server Proxy -> nếu lỗi thử 9router trực tiếp -> nếu lỗi fallback Google Direct luân phiên 3 key
      try {
        return await callAutorisServerProxy(targetServerUrl, rawText, activePrompt, preferredModel, 25000, abortController.signal);
      } catch (proxyErr) {
        if (abortController.signal.aborted) throw proxyErr;
        console.warn("[AutoRIS BG] Server Proxy lỗi, chuyển sang 9router trực tiếp...", proxyErr.message);
        try {
          return await callOpenAICompatibleServer(serverEndpoint, serverKey, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:
${rawText}`, 15000, abortController.signal);
        } catch (routerErr) {
          if (abortController.signal.aborted) throw routerErr;
          console.warn("[AutoRIS BG] 9router gặp lỗi, tự động chuyển sang Google Direct luân phiên 3 key...", routerErr.message);
          return await callGoogleGeminiDirect(activeGooglePool, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:
${rawText}`, 15000, abortController.signal);
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  })();

  return await Promise.race([executionPromise, totalTimeoutPromise]);
}

// 8. Gọi 9router (OpenAI Compatible Format)
async function callOpenAICompatibleServer(endpoint, apiKey, preferredModel, systemPrompt, userPrompt, timeoutMs = 15000, externalSignal = null) {
  const candidateModels = [
    preferredModel,
    "DI/google/gemini-3.5-flash",
    "DI/google/gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "combo1"
  ];
  const models = Array.from(new Set(candidateModels.filter(Boolean)));

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  let lastError = null;

  for (const model of models) {
    if (externalSignal && externalSignal.aborted) {
      throw new Error("Tác vụ đã bị hủy");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.1,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          throw Object.assign(new Error(errMsg), { fatal: true });
        }
        throw new Error(errMsg);
      }

      const rawBody = await response.text();
      let outputText = "";

      // Dọn dẹp token kết thúc [DONE] nếu có
      const cleanBody = rawBody.replace(/data:\s*\[DONE\]\s*$/i, "").trim();
      try {
        const data = JSON.parse(cleanBody);
        outputText = data.choices?.[0]?.message?.content?.trim() || "";
      } catch (parseErr) {
        if (rawBody.includes("data:")) {
          const chunks = rawBody.split(/(?:^|
)data:\s*/);
          for (const chunk of chunks) {
            const trimmed = chunk.trim();
            if (trimmed && trimmed !== "[DONE]") {
              try {
                const data = JSON.parse(trimmed);
                outputText += data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || data.choices?.[0]?.text || "";
              } catch (e) {}
            }
          }
        }
      }

      if (!outputText && rawBody.includes('"content":')) {
        const m = rawBody.match(/"content"\s*:\s*"([^"\]*(?:\.[^"\]*)*)"/);
        if (m) {
          try {
            outputText = JSON.parse(`"${m[1]}"`);
          } catch (e) {
            outputText = m[1];
          }
        }
      }

      if (outputText && outputText.trim()) {
        return outputText.trim();
      }
      throw new Error("Phản hồi rỗng từ 9router");
    } catch (err) {
      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
      if (err.fatal) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error("Không thể kết nối tới Server AI");
}

// 9. Gọi trực tiếp Google Gemini API khi dự phòng (Luân phiên 3 key round-robin để giảm tải)
async function callGoogleGeminiDirect(keysPool, preferredModel, systemPrompt, userPrompt, timeoutMs = 15000, externalSignal = null) {
  let activeKeys = (keysPool && keysPool.length > 0) ? keysPool : null;
  if (!activeKeys || activeKeys.length === 0) {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.GOOGLE_KEYS_POOL, STORAGE_KEYS.AI_API_KEY]);
    if (stored[STORAGE_KEYS.GOOGLE_KEYS_POOL] && Array.isArray(stored[STORAGE_KEYS.GOOGLE_KEYS_POOL]) && stored[STORAGE_KEYS.GOOGLE_KEYS_POOL].length > 0) {
      activeKeys = stored[STORAGE_KEYS.GOOGLE_KEYS_POOL].filter(k => typeof k === "string" && k.trim());
    } else if (stored[STORAGE_KEYS.AI_API_KEY] && stored[STORAGE_KEYS.AI_API_KEY].trim()) {
      activeKeys = [stored[STORAGE_KEYS.AI_API_KEY].trim()];
    }
  }

  if (!activeKeys || activeKeys.length === 0) {
    activeKeys = DEFAULT_CONFIG.googleKeysPool;
  }

  if (!activeKeys || activeKeys.length === 0) {
    throw new Error("Chưa có Google Gemini API Key. Vui lòng mở tiện ích AutoRIS trên thanh công cụ trình duyệt để nhập API Key của bạn.");
  }

  // Load balancing luân phiên các key round-robin: Key 1 -> Key 2 -> Key 3 -> Key 1
  const numKeys = activeKeys.length;
  const startIdx = roundRobinGoogleKeyIndex % numKeys;
  roundRobinGoogleKeyIndex = (roundRobinGoogleKeyIndex + 1) % numKeys;

  const rotatedKeys = [];
  for (let i = 0; i < numKeys; i++) {
    rotatedKeys.push(activeKeys[(startIdx + i) % numKeys]);
  }

  const candidateModels = [
    GOOGLE_MODEL_MAP[preferredModel] || "gemini-3.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-latest"
  ];
  const models = Array.from(new Set(candidateModels.filter(Boolean)));
  const contents = [
    {
      role: "user",
      parts: [{ text: `${systemPrompt}

${userPrompt}` }]
    }
  ];

  let lastError = null;

  for (const apiKey of rotatedKeys) {
    for (const model of models) {
      if (externalSignal && externalSignal.aborted) {
        throw new Error("Tác vụ đã bị hủy");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const onAbort = () => controller.abort();
      if (externalSignal) {
        externalSignal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: contents,
            generationConfig: { temperature: 0.1 }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (externalSignal) externalSignal.removeEventListener("abort", onAbort);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status}`;
          lastError = new Error(`Google API (${model}): ${errMsg}`);
          if (response.status === 400 || response.status === 403 || response.status === 429) {
            console.warn(`[AutoRIS BG] Google Key ...${apiKey.slice(-6)} gặp mã ${response.status}, tự động chuyển key kế tiếp...`);
            break; // Thử key tiếp theo trong danh sách xoay vòng
          }
          continue; // Thử model khác với key này
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const output = candidate?.content?.parts?.[0]?.text?.trim();
        if (output) {
          return output;
        }
        if (candidate?.finishReason === "SAFETY") {
          throw new Error("Google AI chặn do bộ lọc an toàn y tế");
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
        lastError = err;
      }
    }
  }

  throw lastError || new Error("Không thể kết nối tới Google Gemini Trực tiếp sau khi đã thử tất cả các key luân phiên");
}

// 10. Hàm bóc tách chuỗi JSON an toàn từ kết quả AI
function parseAIJsonResult(rawOutput) {
  let cleaned = (rawOutput || "").trim();
  // Xóa các code block markdown ```json ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Bóc tách block JSON ngoặc nhọn ngoài cùng
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      affected_organ: (parsed.affected_organ || "").trim().toLowerCase(),
      updated_organ_line: (parsed.updated_organ_line || "").trim(),
      is_new_organ: !!parsed.is_new_organ,
      insert_after: (parsed.insert_after || "Lách").trim(),
      hach_line: parsed.hach_line ? parsed.hach_line.trim() : null,
      mota: (parsed.mota || "").trim(),
      ketluan: (parsed.ketluan || "").trim(),
      summary: (parsed.summary || "").trim()
    };
  } catch (err) {
    console.warn("[AutoRIS BG] Lỗi parse JSON AI, trả về thô:", err);
    return {
      affected_organ: "",
      updated_organ_line: "",
      is_new_organ: false,
      insert_after: "Lách",
      hach_line: null,
      mota: rawOutput.trim(),
      ketluan: "",
      summary: "AI hoàn tất"
    };
  }
}
