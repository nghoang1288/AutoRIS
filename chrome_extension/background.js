// background.js - Service Worker đồng bộ dữ liệu ASR và AI Synthesizer cho AutoRIS
importScripts("defaults.js");

let pollTimer = null;
let lastSeenId = 0;
let isPolling = false;

// 1. Khởi tạo cấu hình ban đầu khi cài đặt Extension
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

// 2. Vòng lặp polling kiểm tra ca đọc mới từ máy chủ AutoRIS
function startPollingLoop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollLatestDictation, DEFAULT_CONFIG.pollIntervalMs || 800);
  console.log("[AutoRIS BG] AutoRIS server polling started.");
}

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

// 3. Phát sóng ca đọc tới các tab RIS
function broadcastDictationToRISTabs(dictationItem) {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    for (const tab of tabs) {
      if (!tab.url) continue;
      const url = tab.url.toLowerCase();
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
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    }
  });
}

// 4. Lắng nghe yêu cầu từ Content Script và Popup
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // A. Kiểm tra trạng thái máy chủ AutoRIS
  if (req.action === "CHECK_SERVER_STATUS") {
    const serverUrl = (req.serverUrl || DEFAULT_CONFIG.serverUrl).trim().replace(/\/+$/, "");
    fetch(`${serverUrl}/api/health`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // B. Điền lại câu đọc từ danh sách lịch sử
  if (req.action === "RE_APPLY_DICTATION") {
    if (req.dictation) {
      broadcastDictationToRISTabs(req.dictation);
      sendResponse({ success: true });
    }
    return false;
  }

  // C. Tổng hợp báo cáo lâm sàng qua AI (9router / Gemini)
  if (req.action === "SYNTHESIZE_REPORT") {
    handleAISynthesis(req.payload || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => {
        console.error("[AutoRIS BG] AI Synthesis error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Asynchronous response
  }
});

// 5. Xử lý gọi AI Synthesizer (9router -> Fallback Direct Google)
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

  // Thử gọi qua 9router server
  try {
    return await callOpenAICompatibleServer(endpoint, apiKey, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
  } catch (serverErr) {
    console.warn("[AutoRIS BG] 9router gặp sự cố, chuyển tiếp sang Google Direct API...", serverErr.message);
    try {
      return await callGoogleGeminiDirect(googleKeysPool, model, RADIOLOGY_SYSTEM_PROMPT, userPrompt);
    } catch (directErr) {
      throw new Error(`9router lỗi: ${serverErr.message}; Google Direct lỗi: ${directErr.message}`);
    }
  }
}

// 6. Gọi 9router (OpenAI Compatible Format)
async function callOpenAICompatibleServer(endpoint, apiKey, preferredModel, systemPrompt, userPrompt, timeoutMs = 15000) {
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
      } else {
        const data = JSON.parse(rawBody);
        outputText = data.choices?.[0]?.message?.content?.trim() || "";
      }

      if (outputText) {
        return parseAIJsonResult(outputText);
      }
      throw new Error("Phản hồi rỗng từ 9router");
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.fatal) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error("Không thể kết nối tới Server AI");
}

// 7. Gọi trực tiếp Google Gemini API khi dự phòng
async function callGoogleGeminiDirect(keysPool, preferredModel, systemPrompt, userPrompt, timeoutMs = 15000) {
  const candidateModels = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];
  const contents = [
    {
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
    }
  ];

  let lastError = null;

  for (const apiKey of keysPool) {
    for (const model of candidateModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status}`;
          if (response.status === 400 || response.status === 403 || response.status === 429) {
            break; // Thử key tiếp theo
          }
          throw new Error(errMsg);
        }

        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (output) {
          return parseAIJsonResult(output);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
      }
    }
  }

  throw lastError || new Error("Không thể kết nối tới Google Gemini Trực tiếp");
}

// 8. Hàm bóc tách chuỗi JSON an toàn từ kết quả AI
function parseAIJsonResult(rawOutput) {
  let cleaned = rawOutput.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.split("\n", 1)[1] || cleaned;
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
    }
    cleaned = cleaned.trim();
  }

  // Tìm vị trí JSON object { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned);
  return {
    mota: (parsed.mota || "").trim(),
    ketluan: (parsed.ketluan || "").trim(),
    summary: (parsed.summary || "").trim()
  };
}
