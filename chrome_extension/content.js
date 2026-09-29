// content.js - Tự động điền Mô tả & Kết luận vào RIS khi bác sĩ đọc (AutoRIS)
(function () {
  "use strict";

  console.log("[AutoRIS Content] Injected into:", window.location.href);

  let isListeningWebMic = false;
  let recognition = null;
  let lastAppliedText = "";
  let floatingBarEl = null;

  // =========================================================================
  // 1. BỘ TÌM KIẾM EDITOR TRÊN RIS
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
    // 1. Kiểm tra phần tử đang được focus (Active Element)
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) {
      return active;
    }

    // 2. Tìm theo danh sách selector chuẩn
    for (const sel of RIS_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) return el;
    }

    // 3. Quét đệ quy vào các iframe cùng nguồn (same-origin iframes)
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
        } catch (e) { /* ignore cross-origin */ }
      }
    } catch (e) {}

    return null;
  }

  // Tìm riêng 2 ô Mô tả và Kết luận nếu RIS chia tách riêng biệt
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

  // =========================================================================
  // 2. BỘ TÁCH THÔNG MINH MÔ TẢ & KẾT LUẬN (SMART SPLITTER)
  // =========================================================================
  function splitMotaAndKetluan(text) {
    if (!text) return { mota: "", ketluan: "" };
    const clean = text.trim();

    // Regex tìm từ khóa kết luận (hỗ trợ "KẾT LUẬN:", "Kết luận:", "KL:", "Nghĩ đến:", "Theo dõi:")
    const klRegex = /(?:^|\n|\.\s+|;\s+)(?:--|—|-)?\s*(?:KẾT\s*LUẬN|Kết\s*luận|KL|CHẨN\s*ĐOÁN|Chẩn\s*đoán)\s*[:：]?\s*/i;
    const match = clean.match(klRegex);

    if (match) {
      const matchIndex = match.index;
      const matchLen = match[0].length;

      // Đoạn trước từ khóa là Mô tả
      const motaPart = clean.slice(0, matchIndex).trim();
      // Đoạn sau từ khóa là Kết luận
      const ketluanPart = clean.slice(matchIndex + matchLen).trim();

      return {
        mota: motaPart,
        ketluan: ketluanPart
      };
    }

    // Nếu không có từ khóa kết luận, coi toàn bộ là Mô tả
    return {
      mota: clean,
      ketluan: ""
    };
  }

  // =========================================================================
  // 3. HÀM ĐIỀN VĂN BẢN VÀO EDITOR RIS
  // =========================================================================
  function applyDictationToRIS(dictationText) {
    if (!dictationText || !dictationText.trim()) return false;
    const normalized = dictationText.normalize("NFC").trim();
    lastAppliedText = normalized;

    // 1. Phân tách Mô tả & Kết luận
    const { mota, ketluan } = splitMotaAndKetluan(normalized);

    // 2. Kiểm tra nếu có 2 ô riêng biệt
    const sep = findSeparateFields();
    if (sep && (sep.motaEl || sep.ketluanEl)) {
      let applied = false;
      if (sep.motaEl && mota) {
        setElementText(sep.motaEl, mota, true);
        applied = true;
      }
      if (sep.ketluanEl && ketluan) {
        setElementText(sep.ketluanEl, ketluan, false); // kết luận thường thay mới
        applied = true;
      }
      if (applied) {
        finishApplySuccess(mota, ketluan);
        return true;
      }
    }

    // 3. Khung Editor chung (CKEditor, Summernote, ContentEditable, Textarea)
    const editor = findRISEditor();
    if (!editor) {
      showToast("⚠️ Không tìm thấy khung soạn thảo RIS! Hãy nhấp chuột vào ô cần điền.", "warning");
      return false;
    }

    const isContentEditable = editor.isContentEditable || editor.getAttribute("contenteditable") === "true";
    const isTextarea = editor.tagName === "TEXTAREA" || editor.tagName === "INPUT";

    if (isContentEditable) {
      let currentHTML = editor.innerHTML.normalize("NFC");

      // Tìm vị trí tiêu đề KẾT LUẬN trong editor đã có sẵn
      const klRegexInDoc = /((?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*KẾT\s*LUẬN\s*(?:<\/strong>|<\/b>)?\s*:\s*(?:<\/strong>|<\/b>)?\s*(?:<\/p>)?\s*(?:<br\s*\/?>|\s*|\n)*)[\s\S]*/i;
      let newHTML = "";

      if (klRegexInDoc.test(currentHTML)) {
        // Tài liệu đã có mục KẾT LUẬN:
        if (ketluan) {
          // Thay thế hoặc cập nhật đoạn kết luận
          currentHTML = currentHTML.replace(klRegexInDoc, (_, p1) => {
            const cleanP1 = p1.replace(/(?:<br\s*\/?>|\s)+$/i, "");
            return `${cleanP1}<br>${escapeHTML(ketluan)}<br><br>`;
          });
        }
        if (mota) {
          // Thêm phần mô tả trước mục KẾT LUẬN
          const splitIdx = currentHTML.search(klRegexInDoc);
          if (splitIdx !== -1) {
            const beforeKL = currentHTML.slice(0, splitIdx);
            const afterKL = currentHTML.slice(splitIdx);
            currentHTML = `${beforeKL}<p>${escapeHTML(mota)}</p>${afterKL}`;
          }
        }
        newHTML = currentHTML;
      } else {
        // Tài liệu chưa có mục KẾT LUẬN:
        if (mota && ketluan) {
          newHTML = currentHTML ? `${currentHTML}<br><p>${escapeHTML(mota)}</p><p><strong>KẾT LUẬN:</strong><br>${escapeHTML(ketluan)}</p>`
                                : `<p>${escapeHTML(mota)}</p><p><strong>KẾT LUẬN:</strong><br>${escapeHTML(ketluan)}</p>`;
        } else if (ketluan) {
          newHTML = currentHTML ? `${currentHTML}<br><br><strong>KẾT LUẬN:</strong><br>${escapeHTML(ketluan)}<br>`
                                : `<strong>KẾT LUẬN:</strong><br>${escapeHTML(ketluan)}<br>`;
        } else {
          newHTML = currentHTML ? `${currentHTML} ${escapeHTML(mota)}` : escapeHTML(mota);
        }
      }

      editor.innerHTML = newHTML;
      triggerInputEvents(editor);
    } else if (isTextarea) {
      let currentVal = (editor.value || "").normalize("NFC");
      const klExp = /((?:--|—|-)?\s*KẾT\s*LUẬN\s*:\s*\n?)[\s\S]*/i;

      if (klExp.test(currentVal)) {
        if (ketluan) {
          currentVal = currentVal.replace(klExp, (_, p1) => `${p1}${ketluan}`);
        }
        if (mota) {
          const sIdx = currentVal.search(klExp);
          if (sIdx !== -1) {
            const b = currentVal.slice(0, sIdx).trimEnd();
            const a = currentVal.slice(sIdx);
            currentVal = `${b}\n${mota}\n\n${a}`;
          }
        }
      } else {
        if (mota && ketluan) {
          currentVal = currentVal ? `${currentVal}\n${mota}\n\nKẾT LUẬN:\n${ketluan}`
                                  : `${mota}\n\nKẾT LUẬN:\n${ketluan}`;
        } else if (ketluan) {
          currentVal = currentVal ? `${currentVal}\n\nKẾT LUẬN:\n${ketluan}`
                                  : `KẾT LUẬN:\n${ketluan}`;
        } else {
          currentVal = currentVal ? `${currentVal} ${mota}` : mota;
        }
      }

      editor.value = currentVal;
      triggerInputEvents(editor);
    }

    finishApplySuccess(mota, ketluan);
    return true;
  }

  function setElementText(el, text, isAppend = false) {
    if (!el) return;
    const isCE = el.isContentEditable || el.getAttribute("contenteditable") === "true";
    if (isCE) {
      if (isAppend && el.innerHTML.trim().length > 0) {
        el.innerHTML += `<br>${escapeHTML(text)}`;
      } else {
        el.innerHTML = escapeHTML(text);
      }
    } else {
      if (isAppend && el.value && el.value.trim().length > 0) {
        el.value += `\n${text}`;
      } else {
        el.value = text;
      }
    }
    triggerInputEvents(el);
  }

  function triggerInputEvents(el) {
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {}
  }

  function finishApplySuccess(mota, ketluan) {
    playChimeSound();
    updateFloatingPreview(mota, ketluan);

    let msg = "✅ AutoRIS: ";
    if (mota && ketluan) msg += "Đã điền Mô tả & Kết luận vào RIS!";
    else if (ketluan) msg += "Đã điền Kết luận vào RIS!";
    else msg += "Đã điền Mô tả vào RIS!";

    showToast(msg, "success");
  }

  // =========================================================================
  // 4. ÂM THANH CHIME THÔNG BÁO (WEB AUDIO API - ZERO DEPENDENCY)
  // =========================================================================
  function playChimeSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

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

  // =========================================================================
  // 5. THANH ĐIỀU KHIỂN NỔI TRÊN MÀN HÌNH RIS (FLOATING VOICE BAR)
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
          Chờ câu đọc từ điện thoại hoặc bấm Micro PC...
        </div>
        <div class="autoris-controls">
          <button id="autoris-btn-mic" class="autoris-mic-btn" title="Bấm để đọc trực tiếp bằng Micro máy tính (F8)">
            <span class="autoris-mic-icon">🎙️</span>
            <span id="autoris-mic-label">Bật Mic PC</span>
          </button>
          <button id="autoris-btn-apply" class="autoris-btn-secondary" title="Điền lại câu này vào ô đang chọn">
            ✍️ Điền lại
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);
    floatingBarEl = bar;

    // Sự kiện kéo thả (Draggable)
    makeDraggable(bar, document.getElementById("autoris-bar-drag"));

    // Nút thu nhỏ
    const minBtn = document.getElementById("autoris-btn-min");
    const bodyEl = document.getElementById("autoris-bar-body");
    minBtn.addEventListener("click", () => {
      bodyEl.style.display = bodyEl.style.display === "none" ? "block" : "none";
    });

    // Nút Mic PC
    const micBtn = document.getElementById("autoris-btn-mic");
    micBtn.addEventListener("click", togglePCMicrophone);

    // Nút Điền lại
    const applyBtn = document.getElementById("autoris-btn-apply");
    applyBtn.addEventListener("click", () => {
      if (lastAppliedText) {
        applyDictationToRIS(lastAppliedText);
      }
    });

    // Lắng nghe phím tắt F8
    window.addEventListener("keydown", (e) => {
      if (e.key === "F8") {
        e.preventDefault();
        togglePCMicrophone();
      }
    });
  }

  function updateFloatingPreview(mota, ketluan) {
    const previewEl = document.getElementById("autoris-preview-text");
    if (!previewEl) return;
    let html = "";
    if (mota) html += `<div style="color:#e2e8f0;"><b>Mô tả:</b> ${escapeHTML(mota)}</div>`;
    if (ketluan) html += `<div style="color:#38bdf8;margin-top:4px;"><b>Kết luận:</b> ${escapeHTML(ketluan)}</div>`;
    if (!html) html = `<div style="color:#94a3b8;">Đã nhận câu đọc...</div>`;
    previewEl.innerHTML = html;
  }

  // =========================================================================
  // 6. NHẬN DIỆN TRỰC TIẾP QUA MICRO MÁY TÍNH (PC WEB SPEECH API)
  // =========================================================================
  function togglePCMicrophone() {
    if (isListeningWebMic) {
      stopPCMicrophone();
    } else {
      startPCMicrophone();
    }
  }

  function startPCMicrophone() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("❌ Trình duyệt không hỗ trợ Web Speech API", "error");
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.lang = "vi-VN";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        isListeningWebMic = true;
        updateMicUI(true);
        showToast("🎙️ Đang lắng nghe micro PC... Hãy đọc kết quả!", "info");
      };

      recognition.onresult = (event) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const previewEl = document.getElementById("autoris-preview-text");
        if (previewEl) {
          previewEl.innerHTML = `<span style="color:#38bdf8;">${escapeHTML(final || interim)}</span>`;
        }

        if (final) {
          applyDictationToRIS(final);
        }
      };

      recognition.onerror = (e) => {
        console.warn("[AutoRIS PC Mic] Error:", e.error);
        stopPCMicrophone();
      };

      recognition.onend = () => {
        isListeningWebMic = false;
        updateMicUI(false);
      };

      recognition.start();
    } catch (e) {
      console.error("[AutoRIS PC Mic] Start failed:", e);
      stopPCMicrophone();
    }
  }

  function stopPCMicrophone() {
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    isListeningWebMic = false;
    updateMicUI(false);
  }

  function updateMicUI(listening) {
    const micBtn = document.getElementById("autoris-btn-mic");
    const micLabel = document.getElementById("autoris-mic-label");
    if (!micBtn || !micLabel) return;

    if (listening) {
      micBtn.classList.add("autoris-recording");
      micLabel.textContent = "Dừng Mic (F8)";
    } else {
      micBtn.classList.remove("autoris-recording");
      micLabel.textContent = "Bật Mic PC (F8)";
    }
  }

  // =========================================================================
  // 7. KÉO THẢ FLOATING BAR & TOAST TIỆN ÍCH
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

  function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[tag] || tag));
  }

  // =========================================================================
  // 8. LẮNG NGHE SỰ KIỆN TỪ BACKGROUND SERVICE WORKER
  // =========================================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "ACTION_NEW_DICTATION") {
      const data = msg.data;
      const textToApply = data.normalized_transcript || data.raw_transcript;
      console.log("[AutoRIS Content] Received dictation:", textToApply);

      if (textToApply) {
        applyDictationToRIS(textToApply);
        sendResponse({ success: true });
      }
    }
  });

  // Khởi tạo Floating Bar khi trang đã tải xong
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createFloatingVoiceBar);
  } else {
    createFloatingVoiceBar();
  }
})();
