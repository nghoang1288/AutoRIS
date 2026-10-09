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
    if (!items[STORAGE_KEYS.SYSTEM_PROMPT] || !items[STORAGE_KEYS.SYSTEM_PROMPT].includes("Nốt bán đặc thuỳ trên phổi phải (Lung-RADS 4A)")) {
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
      STORAGE_KEYS.SYNTHESIZER_VERSION,
      STORAGE_KEYS.SYNTHESIZER_CODE
    ]);
    const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    const currentVersion = config[STORAGE_KEYS.SYNTHESIZER_VERSION] || 0;
    const hasCode = !!config[STORAGE_KEYS.SYNTHESIZER_CODE];

    // 1. Kiểm tra version nhẹ từ server trước
    const verUrl = `${serverUrl}/api/clinical_synthesizer/version?t=${Date.now()}`;
    const verRes = await fetch(verUrl, { cache: "no-store" });
    if (!verRes.ok) return { updated: false, reason: "server_offline" };
    const verData = await verRes.json();

    if (verData.status === "ok" && verData.version) {
      if (force || !hasCode || verData.version !== currentVersion) {
        // 2. Tải toàn bộ mã JS mới từ server
        const codeUrl = `${serverUrl}/api/clinical_synthesizer.js?t=${Date.now()}`;
        const codeRes = await fetch(codeUrl, { cache: "no-store" });
        if (!codeRes.ok) return { updated: false, reason: "fetch_code_failed" };
        const newCode = await codeRes.text();

        if (newCode && newCode.includes("ClinicalSynthesizer")) {
          await chrome.storage.local.set({
            [STORAGE_KEYS.SYNTHESIZER_CODE]: newCode,
            [STORAGE_KEYS.SYNTHESIZER_VERSION]: verData.version,
            [STORAGE_KEYS.SYNTHESIZER_SYNC_TIME]: Date.now()
          });
          console.log(`[AutoRIS BG] ⚡ Nhận thành công luật ClinicalSynthesizer mới (v${verData.version}) từ ${serverUrl}!`);
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
      STORAGE_KEYS.EXTENSION_LAST_CHECK_TIME
    ]);
    const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    const lastCheck = config[STORAGE_KEYS.EXTENSION_LAST_CHECK_TIME] || 0;

    // Giới hạn kiểm tra 5 phút 1 lần nếu không phải ép buộc
    if (!force && Date.now() - lastCheck < 300000) {
      return { checked: false, reason: "throttled" };
    }

    const currentVersion = chrome.runtime.getManifest().version;
    const url = `${serverUrl}/api/extension/version?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
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

      if (itemId && itemId !== lastId) {
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

        // Phát sóng lệnh tới tất cả các tab RIS đang mở
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
      const dlUrl = data[STORAGE_KEYS.EXTENSION_DOWNLOAD_URL] || `${serverUrl}/autoris-extension.zip`;

      if (chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download({
          url: dlUrl,
          filename: "autoris-extension.zip",
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
  const config = await chrome.storage.local.get([STORAGE_KEYS.SERVER_URL]);
  const serverUrl = (config[STORAGE_KEYS.SERVER_URL] || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");

  const res = await fetch(`${serverUrl}/api/feedback/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Server lỗi HTTP ${res.status}: ${errText}`);
  }

  return await res.json();
}

// 6. Xử lý gọi AI Synthesizer cho lời đọc điện thoại (9router -> Fallback Direct Google)
async function handleAISynthesis(payload) {
  const { currentMota, currentKetluan, dictationText } = payload;
  const config = await chrome.storage.local.get([
    STORAGE_KEYS.AI_API_ENDPOINT,
    STORAGE_KEYS.AI_API_KEY,
    STORAGE_KEYS.AI_MODEL,
    STORAGE_KEYS.GOOGLE_KEYS_POOL
  ]);

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

  try {
    const rawOut = await callOpenAICompatibleServer(endpoint, apiKey, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
    return parseAIJsonResult(rawOut);
  } catch (serverErr) {
    console.warn("[AutoRIS BG] 9router gặp sự cố, chuyển tiếp sang Google Direct API...", serverErr.message);
    try {
      const rawOut = await callGoogleGeminiDirect(googleKeysPool, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
      return parseAIJsonResult(rawOut);
    } catch (directErr) {
      throw new Error(`9router lỗi: ${serverErr.message}; Google Direct lỗi: ${directErr.message}`);
    }
  }
}

// 7. Xử lý gọi AI Synthesizer cho PACS Chest CT Lung-RADS (9router -> Fallback Direct Google)
async function handlePACSSynthesizeReport(payload) {
  const { connectionMode, apiEndpoint, apiKey, googleKeysPool, preferredModel, systemPrompt, rawText } = payload;
  const mode = connectionMode || DEFAULT_CONFIG.connectionMode;

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
      if (mode === "server") {
        return await callOpenAICompatibleServer(serverEndpoint, serverKey, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:\n${rawText}`, 15000, abortController.signal);
      }
      if (mode === "direct") {
        return await callGoogleGeminiDirect(activeGooglePool, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:\n${rawText}`, 15000, abortController.signal);
      }
      // Chế độ "auto": Thử Server -> nếu lỗi chuyển Google Direct
      try {
        return await callOpenAICompatibleServer(serverEndpoint, serverKey, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:\n${rawText}`, 15000, abortController.signal);
      } catch (err) {
        if (abortController.signal.aborted) throw err;
        console.warn("[AutoRIS BG] Server 9router gặp lỗi, tự động chuyển sang Google Direct...", err.message);
        return await callGoogleGeminiDirect(activeGooglePool, preferredModel, activePrompt, `BÁO CÁO ĐẦU VÀO:\n${rawText}`, 15000, abortController.signal);
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
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
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

      try {
        const data = JSON.parse(rawBody);
        outputText = data.choices?.[0]?.message?.content?.trim() || "";
      } catch (parseErr) {
        if (rawBody.trim().startsWith("data:")) {
          const chunks = rawBody.split(/(?:^|\n)data:\s*/);
          for (const chunk of chunks) {
            const trimmed = chunk.trim();
            if (trimmed && trimmed !== "[DONE]") {
              try {
                const data = JSON.parse(trimmed);
                outputText += data.choices?.[0]?.delta?.content || data.choices?.[0]?.text || "";
              } catch (e) {}
            }
          }
        }
      }

      if (outputText) {
        return outputText;
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

// 9. Gọi trực tiếp Google Gemini API khi dự phòng
async function callGoogleGeminiDirect(keysPool, preferredModel, systemPrompt, userPrompt, timeoutMs = 15000, externalSignal = null) {
  const activeKeys = (keysPool && keysPool.length > 0) ? keysPool : DEFAULT_CONFIG.googleKeysPool;
  const candidateModels = [
    GOOGLE_MODEL_MAP[preferredModel] || preferredModel || "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite"
  ];
  const models = Array.from(new Set(candidateModels.filter(Boolean)));
  const contents = [
    {
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
    }
  ];

  let lastError = null;

  for (const apiKey of activeKeys) {
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
          if (response.status === 400 || response.status === 403 || response.status === 429) {
            break; // Thử key tiếp theo
          }
          throw new Error(errMsg);
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

  throw lastError || new Error("Không thể kết nối tới Google Gemini Trực tiếp");
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
