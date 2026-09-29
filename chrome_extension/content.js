// content.js - Tự động điền Mô tả & Kết luận vào RIS khi bác sĩ đọc từ điện thoại (AutoRIS)
(function () {
  "use strict";

  console.log("[AutoRIS Content] Injected into:", window.location.href);

  let lastDictationText = "";
  let lastSynthesizedData = null;
  let floatingBarEl = null;
  const undoStack = []; // Lưu trữ lịch sử hoàn tác (Undo)

  // =========================================================================
  // 1. TÌM KIẾM EDITOR TRÊN HỆ THỐNG RIS BỆNH VIỆN
  // =========================================================================
  const RIS_SELECTORS = [
    "div[contenteditable='true'].text-diagnosis",
    "div.text-diagnosis[contenteditable='true']",
    "div[id^='txt-'][contenteditable='true']",
    ".text-diagnosis[contenteditable='true']",
    ".text-diagnosis",
    "textarea.text-diagnosis",
    "div.cke_editable[contenteditable='true']",
    "body.cke_editable[contenteditable='true']",
    "div.note-editable[contenteditable='true']",
    "div[contenteditable='true']",
    "textarea"
  ];

  function findRISEditor() {
    // 1. Ưu tiên phần tử đang được focus
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) {
      return active;
    }

    // 2. Tìm theo danh sách selector chuẩn của RIS
    for (const sel of RIS_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) return el;
    }

    // 3. Quét đệ quy qua các iframe cùng nguồn (same-origin iframes)
    try {
      const iframes = document.querySelectorAll("iframe, frame");
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc) {
            for (const sel of RIS_SELECTORS) {
              const el = doc.querySelector(sel);
              if (el && isElementVisible(el)) return el;
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    return null;
  }

  // Tìm riêng 2 ô Mô tả và Kết luận nếu RIS chia làm 2 ô tách rời
  function findSeparateFields() {
    const motaSelectors = [
      "#txt-mota", "#mota", "[name*='mota']", "[name*='mo_ta']",
      ".mo-ta", "[id*='mota']", "[id*='description']", "[name*='desc']"
    ];
    const ketluanSelectors = [
      "#txt-ketluan", "#ketluan", "[name*='ketluan']", "[name*='ket_luan']",
      ".ket-luan", "[id*='ketluan']", "[id*='conclusion']", "[name*='conclusion']"
    ];

    let motaEl = null;
    let ketluanEl = null;

    for (const s of motaSelectors) {
      const el = document.querySelector(s);
      if (el && isElementVisible(el)) { motaEl = el; break; }
    }
    for (const s of ketluanSelectors) {
      const el = document.querySelector(s);
      if (el && isElementVisible(el)) { ketluanEl = el; break; }
    }

    if (motaEl || ketluanEl) {
      return { motaEl, ketluanEl };
    }
    return null;
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getElementText(el) {
    if (!el) return "";
    const isCE = el.isContentEditable || el.getAttribute("contenteditable") === "true";
    if (isCE) {
      return (el.innerText || el.textContent || "").normalize("NFC");
    }
    return (el.value || "").normalize("NFC");
  }

  // =========================================================================
  // 2. XỬ LÝ ĐIỀN VÀO RIS & TỔNG HỢP LÂM SÀNG
  // =========================================================================
  async function processAndApplyDictation(dictationText) {
    if (!dictationText || !dictationText.trim()) return false;
    const cleanDictation = dictationText.normalize("NFC").trim();
    lastDictationText = cleanDictation;

    // Hiển thị trạng thái đang xử lý trên floating bar
    updateFloatingPreview(cleanDictation, null, "Đang xử lý phân bổ giải phẫu...");

    const storedConfig = await chrome.storage.local.get([
      STORAGE_KEYS.SMART_SYNTHESIZE,
      STORAGE_KEYS.AUTO_COPY,
      STORAGE_KEYS.PLAY_CHIME
    ]);
    const useSmartSynthesize = storedConfig[STORAGE_KEYS.SMART_SYNTHESIZE] !== false;

    // Kiểm tra các ô nhập liệu
    const sep = findSeparateFields();
    const editor = findRISEditor();

    if (!sep && !editor) {
      showToast("⚠️ Không tìm thấy khung soạn thảo RIS! Hãy nhấp chuột vào ô cần điền.", "warning");
      return false;
    }

    let currentMota = "";
    let currentKetluan = "";
    let kythuatPart = "";
    let isUnified = false;

    if (sep && (sep.motaEl || sep.ketluanEl)) {
      currentMota = sep.motaEl ? getElementText(sep.motaEl) : "";
      currentKetluan = sep.ketluanEl ? getElementText(sep.ketluanEl) : "";
      saveUndoSnapshot(sep.motaEl, sep.ketluanEl, null);
    } else if (editor) {
      const fullText = getElementText(editor);
      const parsed = ClinicalSynthesizer.parseEditorSections(fullText);
      kythuatPart = parsed.kythuat;
      currentMota = parsed.mota;
      currentKetluan = parsed.ketluan;
      isUnified = parsed.isUnified;
      saveUndoSnapshot(null, null, editor);
    }

    // Gọi Clinical Synthesizer (AI hoặc Rule Engine)
    let synthesizedResult = null;
    try {
      synthesizedResult = await ClinicalSynthesizer.synthesize(
        currentMota,
        currentKetluan,
        cleanDictation,
        useSmartSynthesize
      );
    } catch (err) {
      console.error("[AutoRIS Content] Synthesizer error:", err);
      synthesizedResult = ClinicalSynthesizer.localDeterministicFallback(currentMota, currentKetluan, cleanDictation);
    }

    lastSynthesizedData = synthesizedResult;
    const finalMota = synthesizedResult.mota || currentMota;
    const finalKetluan = synthesizedResult.ketluan || currentKetluan;

    // Điền dữ liệu vào RIS
    if (sep && (sep.motaEl || sep.ketluanEl)) {
      if (sep.motaEl) setElementText(sep.motaEl, finalMota);
      if (sep.ketluanEl) setElementText(sep.ketluanEl, finalKetluan);
    } else if (editor) {
      let finalFullText = "";
      if (isUnified) {
        finalFullText = ClinicalSynthesizer.assembleUnifiedReport(kythuatPart, finalMota, finalKetluan);
      } else {
        // Trường hợp khung soạn thảo tự do
        finalFullText = `${finalMota}\n\nKẾT LUẬN:\n${finalKetluan}`;
      }
      setElementText(editor, finalFullText);
      highlightElement(editor);
    }

    // Sao chép clipboard nếu bật cấu hình
    if (storedConfig[STORAGE_KEYS.AUTO_COPY] !== false) {
      copyToClipboard(`${finalMota}\n\nKẾT LUẬN:\n${finalKetluan}`);
    }

    // Âm thanh chuông báo
    if (storedConfig[STORAGE_KEYS.PLAY_CHIME] !== false) {
      playChimeSound();
    }

    // Cập nhật UI
    updateFloatingPreview(cleanDictation, synthesizedResult);
    showToast(`✅ AutoRIS: ${synthesizedResult.summary || "Đã phân bổ mô tả & kết luận vào RIS!"}`, "success");
    return true;
  }

  function setElementText(el, text) {
    if (!el) return;
    const isCE = el.isContentEditable || el.getAttribute("contenteditable") === "true";
    if (isCE) {
      // Chuyển dòng sang định dạng HTML tương thích CKEditor/Summernote
      const lines = text.split("\n");
      const htmlLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return "<p><br></p>";
        if (trimmed.startsWith("KỸ THUẬT:") || trimmed.startsWith("MÔ TẢ:") || trimmed.startsWith("KẾT LUẬN:")) {
          return `<p><strong>${escapeHTML(trimmed)}</strong></p>`;
        }
        return `<p>${escapeHTML(line)}</p>`;
      }).join("");

      el.innerHTML = htmlLines;
    } else {
      el.value = text;
    }
    triggerInputEvents(el);
  }

  function triggerInputEvents(el) {
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {}
  }

  function highlightElement(el) {
    if (!el) return;
    el.classList.add("autoris-highlight-pulse");
    setTimeout(() => {
      el.classList.remove("autoris-highlight-pulse");
    }, 2000);
  }

  // =========================================================================
  // 3. HỆ THỐNG HOÀN TÁC (UNDO SYSTEM)
  // =========================================================================
  function saveUndoSnapshot(motaEl, ketluanEl, unifiedEl) {
    const snapshot = {
      motaEl,
      ketluanEl,
      unifiedEl,
      motaVal: motaEl ? (motaEl.isContentEditable ? motaEl.innerHTML : motaEl.value) : null,
      ketluanVal: ketluanEl ? (ketluanEl.isContentEditable ? ketluanEl.innerHTML : ketluanEl.value) : null,
      unifiedVal: unifiedEl ? (unifiedEl.isContentEditable ? unifiedEl.innerHTML : unifiedEl.value) : null
    };
    undoStack.push(snapshot);
    if (undoStack.length > 10) undoStack.shift();
  }

  function handleUndo() {
    if (undoStack.length === 0) {
      showToast("ℹ️ Không có thao tác nào để hoàn tác!", "info");
      return;
    }

    const lastState = undoStack.pop();
    if (lastState.unifiedEl) {
      if (lastState.unifiedEl.isContentEditable) {
        lastState.unifiedEl.innerHTML = lastState.unifiedVal;
      } else {
        lastState.unifiedEl.value = lastState.unifiedVal;
      }
      triggerInputEvents(lastState.unifiedEl);
      highlightElement(lastState.unifiedEl);
    } else {
      if (lastState.motaEl) {
        if (lastState.motaEl.isContentEditable) lastState.motaEl.innerHTML = lastState.motaVal;
        else lastState.motaEl.value = lastState.motaVal;
        triggerInputEvents(lastState.motaEl);
      }
      if (lastState.ketluanEl) {
        if (lastState.ketluanEl.isContentEditable) lastState.ketluanEl.innerHTML = lastState.ketluanVal;
        else lastState.ketluanEl.value = lastState.ketluanVal;
        triggerInputEvents(lastState.ketluanEl);
      }
    }

    showToast("↩️ Đã hoàn tác nội dung trước đó trên RIS!", "info");
  }

  // =========================================================================
  // 4. THANH ĐIỀU KHIỂN NỔI (FLOATING BAR - ĐIỆN THOẠI DUY NHẤT, KHÔNG MIC PC)
  // =========================================================================
  function createFloatingVoiceBar() {
    if (document.getElementById("autoris-floating-bar")) return;

    const bar = document.createElement("div");
    bar.id = "autoris-floating-bar";
    bar.className = "autoris-bar-container";
    bar.innerHTML = `
      <div class="autoris-bar-header" id="autoris-bar-drag">
        <div class="autoris-status-pill">
          <span class="autoris-dot"></span>
          <span class="autoris-title">AutoRIS Dictation</span>
        </div>
        <div class="autoris-actions-btn">
          <button id="autoris-btn-min" class="autoris-icon-btn" title="Thu nhỏ/Mở rộng">_</button>
        </div>
      </div>
      <div class="autoris-bar-body" id="autoris-bar-body">
        <div class="autoris-preview-box" id="autoris-preview-text">
          <span style="color:#64748b;">🟢 Sẵn sàng nhận giọng nói từ điện thoại (AutoRIS ZipFormer)...</span>
        </div>
        <div class="autoris-controls">
          <button id="autoris-btn-apply" class="autoris-btn-primary" title="Điền lại câu này vào RIS">
            ✍️ Điền lại
          </button>
          <button id="autoris-btn-undo" class="autoris-btn-secondary" title="Hoàn tác nội dung vừa điền (Ctrl+Z)">
            ↩️ Hoàn tác
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);
    floatingBarEl = bar;

    // Kéo thả thanh điều khiển
    makeDraggable(bar, document.getElementById("autoris-bar-drag"));

    // Nút thu nhỏ
    const minBtn = document.getElementById("autoris-btn-min");
    const bodyEl = document.getElementById("autoris-bar-body");
    minBtn.addEventListener("click", () => {
      bodyEl.style.display = bodyEl.style.display === "none" ? "block" : "none";
    });

    // Nút Điền lại
    document.getElementById("autoris-btn-apply").addEventListener("click", () => {
      if (lastDictationText) {
        processAndApplyDictation(lastDictationText);
      } else {
        showToast("ℹ️ Chưa có câu đọc nào từ điện thoại!", "info");
      }
    });

    // Nút Hoàn tác
    document.getElementById("autoris-btn-undo").addEventListener("click", handleUndo);
  }

  function updateFloatingPreview(rawText, synthResult = null, statusMsg = "") {
    const previewEl = document.getElementById("autoris-preview-text");
    if (!previewEl) return;

    if (statusMsg) {
      previewEl.innerHTML = `<span style="color:#38bdf8;">⏳ ${escapeHTML(statusMsg)}</span>`;
      return;
    }

    let html = `<div style="color:#94a3b8;font-size:11px;margin-bottom:4px;"><b>📱 Bác sĩ đọc:</b> "${escapeHTML(rawText)}"</div>`;

    if (synthResult) {
      if (synthResult.summary) {
        html += `<div style="color:#10b981;font-size:11px;margin-bottom:4px;"><b>⚡ Thay đổi:</b> ${escapeHTML(synthResult.summary)}</div>`;
      }
      if (synthResult.ketluan) {
        html += `<div style="color:#38bdf8;font-size:12px;border-top:1px solid #1e293b;padding-top:4px;"><b>KẾT LUẬN:</b> ${escapeHTML(synthResult.ketluan)}</div>`;
      }
    }

    previewEl.innerHTML = html;
  }

  // =========================================================================
  // 5. TIỆN ÍCH KÉO THẢ, ÂM THANH & TOAST
  // =========================================================================
  function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = "auto";
      el.style.right = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function playChimeSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Nốt 1 (D5 - 587Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.1);

      // Nốt 2 (A5 - 880Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  function showToast(message, type = "success") {
    let toast = document.getElementById("autoris-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "autoris-toast";
      document.body.appendChild(toast);
    }
    toast.className = `autoris-toast autoris-toast-${type} autoris-toast-show`;
    toast.textContent = message;

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.className = "autoris-toast";
    }, 3500);
  }

  function copyToClipboard(text) {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text).catch(() => {});
    } catch (e) {}
  }

  function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[tag] || tag));
  }

  // =========================================================================
  // 6. LẮNG NGHE SỰ KIỆN TỪ BACKGROUND SERVICE WORKER
  // =========================================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "ACTION_NEW_DICTATION") {
      const data = msg.data;
      const textToApply = data.normalized_transcript || data.raw_transcript;
      console.log("[AutoRIS Content] Received phone dictation:", textToApply);

      if (textToApply) {
        processAndApplyDictation(textToApply);
        sendResponse({ success: true });
      }
    }
  });

  // Khởi tạo Floating Bar
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createFloatingVoiceBar);
  } else {
    createFloatingVoiceBar();
  }
})();
