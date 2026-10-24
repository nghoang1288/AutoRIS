// content.js - Tích hợp AutoRIS Dictation (Điện thoại) & PACS Lung-RADS Translator (F9)
(() => {
  "use strict";

  const BUTTON_CONTAINER_ID = "pacs-reporter-container";
  const BUTTON_ID = "pacs-translate-copy-btn";
  const SETTINGS_BTN_ID = "pacs-settings-btn";
  const MODAL_ID = "pacs-settings-modal";
  const TOAST_ID = "autoris-translate-toast";

  let lastDictationText = "";
  let lastSynthesizedData = null;
  let lastInputText = "";
  let lastSynthesizedReport = "";
  let lastAppliedReportTime = 0;
  let observerTimer = null;
  let toastTimeout = null;
  const undoStack = [];

  // Định danh duy nhất cho từng Tab RIS đang mở (để phân biệt khi mở nhiều tab cùng lúc)
  const TAB_INSTANCE_ID = "tab_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
  let userExplicitlyUnchecked = false;

  // =========================================================================
  // 0. BỘ KẾT NỐI SANDBOX CLINICAL SYNTHESIZER (TẢI LUẬT ĐỘNG TỪ VPS)
  // =========================================================================
  const SynthesizerBridge = {
    iframe: null,
    isReady: false,
    pending: new Map(),
    currentVersion: 0,
    initStarted: false,

    init() {
      if (this.initStarted) return;
      this.initStarted = true;

      const ensureIframe = () => {
        if (this.iframe || !document.body) return;
        this.iframe = document.createElement("iframe");
        this.iframe.id = "autoris-synthesizer-sandbox";
        this.iframe.src = chrome.runtime.getURL("sandbox.html");
        this.iframe.style.position = "absolute";
        this.iframe.style.top = "-9999px";
        this.iframe.style.left = "-9999px";
        this.iframe.style.width = "1px";
        this.iframe.style.height = "1px";
        this.iframe.style.border = "none";
        document.body.appendChild(this.iframe);

        this.iframe.onload = async () => {
          this.isReady = true;
          console.log("[AutoRIS Content] Synthesizer Sandbox loaded.");
          try {
            const stored = await chrome.storage.local.get([
              STORAGE_KEYS.SYNTHESIZER_CODE,
              STORAGE_KEYS.SYNTHESIZER_VERSION
            ]);
            if (stored[STORAGE_KEYS.SYNTHESIZER_CODE]) {
              await this.updateCode(
                stored[STORAGE_KEYS.SYNTHESIZER_CODE],
                stored[STORAGE_KEYS.SYNTHESIZER_VERSION]
              );
            }
          } catch (e) {
            console.warn("[AutoRIS Content] Lỗi khởi tạo code Sandbox:", e);
          }
        };
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureIframe, { once: true });
      } else {
        ensureIframe();
      }

      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || !data.id) return;

        if (this.pending.has(data.id)) {
          const { resolve, reject, timer } = this.pending.get(data.id);
          clearTimeout(timer);
          this.pending.delete(data.id);

          if (data.success) {
            resolve(data.result);
          } else {
            reject(new Error(data.error || "Lỗi thực thi Sandbox"));
          }
        }
      });

      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === "local" && changes[STORAGE_KEYS.SYNTHESIZER_CODE]) {
            const newCode = changes[STORAGE_KEYS.SYNTHESIZER_CODE].newValue;
            const newVer = changes[STORAGE_KEYS.SYNTHESIZER_VERSION]?.newValue || Date.now();
            if (newCode) {
              this.updateCode(newCode, newVer)
                .then(() => {
                  showToast("⚡ Đã cập nhật luật mô tả lâm sàng mới từ VPS!");
                })
                .catch(err => {
                  console.error("[AutoRIS Content] Lỗi cập nhật code từ storage:", err);
                });
            }
          }
        });
      }
    },

    updateCode(code, version) {
      return new Promise((resolve, reject) => {
        if (!this.iframe || !this.iframe.contentWindow) {
          return reject(new Error("Sandbox iframe chưa sẵn sàng"));
        }
        const id = "upd_" + Math.random().toString(36).slice(2) + "_" + Date.now();
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("Timeout cập nhật code Sandbox"));
        }, 3000);

        this.pending.set(id, {
          resolve: () => {
            this.currentVersion = version;
            console.log(`[AutoRIS Content] ⚡ Sandbox đã nạp luật mới (v${version})!`);
            resolve(true);
          },
          reject,
          timer
        });

        this.iframe.contentWindow.postMessage({
          action: "UPDATE_CODE",
          id,
          code,
          version
        }, "*");
      });
    },

    invoke(method, args = []) {
      return new Promise((resolve, reject) => {
        if (!this.isReady || !this.iframe || !this.iframe.contentWindow) {
          if (window.ClinicalSynthesizer && typeof window.ClinicalSynthesizer[method] === "function") {
            try {
              const res = window.ClinicalSynthesizer[method](...args);
              return resolve(res);
            } catch (e) {
              return reject(e);
            }
          }
          return reject(new Error("Sandbox chưa sẵn sàng và không có fallback local"));
        }

        const id = "inv_" + Math.random().toString(36).slice(2) + "_" + Date.now();
        const timer = setTimeout(() => {
          this.pending.delete(id);
          if (window.ClinicalSynthesizer && typeof window.ClinicalSynthesizer[method] === "function") {
            try {
              const res = window.ClinicalSynthesizer[method](...args);
              return resolve(res);
            } catch (e) {
              return reject(e);
            }
          }
          reject(new Error(`Timeout gọi ${method} từ Sandbox`));
        }, 4000);

        this.pending.set(id, { resolve, reject, timer });

        this.iframe.contentWindow.postMessage({
          action: "INVOKE",
          id,
          method,
          args
        }, "*");
      });
    },

    cleanFillerWords(text) {
      return this.invoke("cleanFillerWords", [text]);
    },
    parseEditorSections(rawText) {
      return this.invoke("parseEditorSections", [rawText]);
    },
    isSecretaryCommand(cleanDictation) {
      return this.invoke("isSecretaryCommand", [cleanDictation]);
    },
    executeSecretaryCommand(currentMota, currentKetluan, cleanDictation) {
      return this.invoke("executeSecretaryCommand", [currentMota, currentKetluan, cleanDictation]);
    },
    synthesize(currentMota, currentKetluan, cleanDictation, useSmartSynthesize) {
      return this.invoke("synthesize", [currentMota, currentKetluan, cleanDictation, useSmartSynthesize]);
    },
    localDeterministicFallback(currentMota, currentKetluan, cleanDictation) {
      return this.invoke("localDeterministicFallback", [currentMota, currentKetluan, cleanDictation]);
    }
  };

  // =========================================================================
  // 1. NHẬN DIỆN TRANG WEB & BẢO VỆ PHẠM VI (GATE CHECKS)
  // =========================================================================
  function isViewerPage(urlStr) {
    const url = (urlStr || window.location.href).toLowerCase();
    return url.includes("vrviewer") ||
           url.includes("dicomviewer") ||
           url.includes("dcmviewer") ||
           url.includes("study/viewer") ||
           url.includes("/ris/viewer") ||
           url.includes("/viewer") ||
           url.includes("viewer.") ||
           url.includes("pacsviewer") ||
           url.includes("webviewer") ||
           url.includes("ohif") ||
           url.includes("cornerstone") ||
           url.includes("weasis");
  }

  function isRISPage() {
    if (isViewerPage()) {
      return false;
    }
    const url = window.location.href.toLowerCase();
    return url.includes("192.168.50.105") ||
           url.includes("benhviendaihocyhanoi.com") ||
           url.includes("study/reading") ||
           url.includes("/ris/") ||
           url.includes("ris_") ||
           !!document.querySelector(".text-diagnosis, #txt-mota, #txt-ketluan, div[id^='txt-']");
  }

  function isPACSPage() {
    const url = window.location.href.toLowerCase();
    return url.includes("192.168.50.110") ||
           url.includes("30979") ||
           !!document.getElementById("uai_report_ex");
  }

  // Dừng ngay lập tức nếu không phải trang RIS và không phải trang PACS (hoặc nếu là trang xem ảnh DICOM viewer)
  if (!isRISPage() && !isPACSPage()) {
    return;
  }

  function isExtensionValid() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[tag] || tag));
  }

  // =========================================================================
  // 2. TÌM KIẾM EDITOR TRÊN RIS & PACS
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
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) {
      return active;
    }

    for (const sel of RIS_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) return el;
    }

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

  function findSeparateFields() {
    const motaSelectors = ["#txt-mota", "#mota", "[name*='mota']", "[name*='mo_ta']", ".mo-ta"];
    const ketluanSelectors = ["#txt-ketluan", "#ketluan", "[name*='ketluan']", "[name*='ket_luan']", ".ket-luan"];

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

  function findPACSElement() {
    const pacsSelectors = ["#uai_report_ex", "div[contenteditable='true']"];
    for (const sel of pacsSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
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

  function triggerInputEvents(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {}
  }

  function highlightElement(el) {
    if (!el) return;
    el.classList.add("autoris-highlight-pulse");
    setTimeout(() => el.classList.remove("autoris-highlight-pulse"), 2000);
  }

  // =========================================================================
  // 3. THAY THẾ PHẪU THUẬT (SURGICAL DOM REPLACEMENT) CHO RIS EDITOR
  // =========================================================================

  /**
   * Thay thế phẫu thuật cho ca đọc điện thoại (Ổ bụng, Toàn thân, Tiêu hóa, Tiết niệu)
   * CHỈ sửa đúng dòng cơ quan bị tổn thương và KẾT LUẬN. Mọi dòng khác giữ nguyên 100%.
   */
  function applySurgicalDictationToRISEditor(editorEl, synthResult) {
    if (!editorEl || !synthResult) return false;

    const isCE = editorEl.isContentEditable || editorEl.getAttribute("contenteditable") === "true";
    const isInput = editorEl.tagName === "TEXTAREA" || editorEl.tagName === "INPUT";

    // Xử lý lệnh xóa trắng / xóa toàn bộ văn bản
    if (synthResult.action === "clear_all") {
      if (isCE) {
        const footerRegex = /(?:<table\b|<h1\b|(?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:Người\s*ký|Kỹ\s*thuật\s*viên|Bác\s*sĩ\s*đọc|Chữ\s*ký|Alt\s*\+\s*1|Alt\s*\+\s*2))/i;
        const footerMatch = editorEl.innerHTML.normalize("NFC").match(footerRegex);
        const footerHTML = footerMatch ? editorEl.innerHTML.normalize("NFC").slice(footerMatch.index) : "";
        editorEl.innerHTML = footerHTML ? "<p><br></p>" + footerHTML : "<p><br></p>";
      } else {
        const footerRegex = /(?:^|\n)\s*(?:Người\s*ký|Kỹ\s*thuật\s*viên|Bác\s*sĩ\s*đọc|Chữ\s*ký|Alt\s*\+\s*1|Alt\s*\+\s*2)[^\n]*/i;
        const text = (editorEl.value || "").normalize("NFC");
        const footerMatch = text.match(footerRegex);
        const footerText = footerMatch ? text.slice(footerMatch.index) : "";
        editorEl.value = footerText ? "\n\n" + footerText.trim() : "";
      }
      triggerInputEvents(editorEl);
      highlightElement(editorEl);
      return true;
    }

    const organFindings = synthResult.organs || [];
    // Hỗ trợ trường hợp cũ nếu synthResult chỉ trả về affected_organ đơn lẻ
    if (organFindings.length === 0 && synthResult.affected_organ) {
      organFindings.push({
        organ: synthResult.affected_organ,
        findingText: synthResult.updated_organ_line || "",
        label: synthResult.affected_organ,
        lesionType: "tổn thương"
      });
    }

    const conclusion = synthResult.ketluan || "";
    let modified = false;

    if (isCE) {
      let html = editorEl.innerHTML.normalize("NFC");

      // 1. Tách Header/Body vs Footer (Bảng chữ ký, table, script, Người ký Alt+1...)
      const footerRegex = /(?:<table\b|<h1\b|(?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:Người\s*ký|Kỹ\s*thuật\s*viên|Bác\s*sĩ\s*đọc|Chữ\s*ký|Alt\s*\+\s*1|Alt\s*\+\s*2))/i;
      const footerMatch = html.match(footerRegex);
      let bodyHTML = html;
      let footerHTML = "";
      if (footerMatch) {
        bodyHTML = html.slice(0, footerMatch.index);
        footerHTML = html.slice(footerMatch.index);
      }

      // 2. Thay thế phẫu thuật từng cơ quan trong bodyHTML
      for (const item of organFindings) {
        let organLineRegex = null;
        let newClause = "";

        if (item.organ === "than_phai") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Thận\s*phải|Thận\s*phải)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "than_trai") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Thận\s*trái|Thận\s*trái)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "than_hai_ben") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Hai\s*thận|Hai\s*thận)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "gan") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Gan|Nhu\s*mô\s*gan)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          let cleanFinding = item.findingText.replace(/^[.,;: ]+/, "").trim();
          cleanFinding = cleanFinding.replace(/\b(nang|sỏi)\s+(nang|sỏi)\s+(lớn|nhỏ)\b/i, "$1, $2 $3");
          cleanFinding = cleanFinding.replace(/\bHạ\s+phân\s+thùy\b/g, "hạ phân thùy");
          if (/^(?:trái|phải)\b/i.test(cleanFinding)) {
            newClause = `gan ${cleanFinding}`;
          } else if (/^(?:hạ\s*phân\s*thùy|hpt|thùy|nhu\s*mô)/i.test(cleanFinding)) {
            newClause = cleanFinding.replace(/^nhu\s*mô\s*/i, "");
          } else if (!cleanFinding.startsWith("nhu mô")) {
            newClause = cleanFinding.startsWith("có") ? cleanFinding : `có ${cleanFinding}`;
          } else {
            newClause = cleanFinding;
          }
        } else if (item.organ === "da_day") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*Dạ\s*dày\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        } else if (item.organ === "tui_mat") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Túi\s*mật|Túi\s*mật)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "tuy") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Tụy|Tụy|Nhu\s*mô\s*tụy)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "lach") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Lách|Lách|Nhu\s*mô\s*lách)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "bang_quang") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Bàng\s*quang|Bàng\s*quang)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "tuyen_tien_liet") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Tuyến\s*tiền\s*liệt|Tiền\s*liệt\s*tuyến)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "tu_cung") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Tử\s*cung|Phần\s*phụ|Buồng\s*trứng)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        } else if (item.organ === "ruot_thua") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Ruột\s*thừa|Hố\s*chậu\s*phải)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        } else if (item.organ === "dich") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Dịch\s*(?:ổ\s*bụng|tự\s*do|màng\s*phổi))\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        } else if (item.organ === "hach") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Hạch|Hạch)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        } else if (item.organ === "phoi_phai") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Phổi\s*phải|Phổi\s*phải)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        } else if (item.organ === "phoi_trai") {
          organLineRegex = /((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Phổi\s*trái|Phổi\s*trái)\b\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*:?\s*)([\s\S]*?)(?=<\/p>|<br\s*\/?>|\n|$)/i;
          newClause = item.findingText;
        }

        if (organLineRegex && organLineRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(organLineRegex, (fullMatch, prefix, content) => {
            let updatedContent = content;
            if (item.organ === "tui_mat") {
              const normalGbRegex = /(không\s*thấy\s*sỏi[^.]*|không\s*sỏi[^.]*|bình\s*thường[^.]*)(\.?)/i;
              if (normalGbRegex.test(content)) {
                updatedContent = content.replace(normalGbRegex, `${newClause}$2`);
              } else {
                updatedContent = `${content.replace(/[.,\s]+$/, "")}, ${newClause}.`;
              }
            } else if (item.organ === "gan") {
              const normalParenchymaRegex = /(Nhu\s*mô\s*(?:đồng\s*nhất[,\s]*)?)(?:không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|đều[,\s]*không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|không\s*thấy\s*khối[^.]*|bình\s*thường[^.]*)(\.?)/i;
              if (normalParenchymaRegex.test(content)) {
                updatedContent = content.replace(normalParenchymaRegex, (match, p1, p2) => {
                  const isLower = p1.trim().startsWith("nhu");
                  const pfx = isLower ? "nhu mô " : "Nhu mô ";
                  return `${pfx}${newClause}${p2}`;
                });
              } else if (content.includes("không to") || content.includes("hình thái, kích thước bình thường")) {
                updatedContent = content.replace(/Nhu\s*mô[^.]*\.?/i, `Nhu mô ${newClause}.`);
              } else {
                updatedContent = `${content.trim()} Nhu mô ${newClause}.`;
              }
            } else if (item.organ === "phoi_phai" || item.organ === "phoi_trai") {
              const normalLungRegex = /(?:trường\s*phổi\s*(?:sáng\s*đều[,\s]*)?)(?:không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|đều[,\s]*không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*)(\.?)/i;
              let cleanFinding = newClause.trim().replace(/[.,\s]+$/, "");
              if (normalLungRegex.test(content)) {
                updatedContent = content.replace(normalLungRegex, `${cleanFinding}.`);
              } else if (/dày\s+tổ\s+chức\s+kẽ|giãn\s+phế\s+quản/i.test(content)) {
                const suffixMatch = content.match(/(?:không\s*thấy\s*dày\s*tổ\s*chức\s*kẽ[^\n<]*)/i);
                const suffix = suffixMatch ? suffixMatch[0] : "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.";
                updatedContent = `${cleanFinding}. ${suffix}`;
              } else {
                updatedContent = `${cleanFinding}. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.`;
              }
            } else {
              updatedContent = `${newClause}.`;
            }
            return `${prefix}${updatedContent}`;
          });
          modified = true;
        } else {
          // Nếu mẫu chưa có cơ quan này, chèn dòng mới ngay trước KẾT LUẬN để tránh mất thông tin
          const klMatch = bodyHTML.match(/((?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:--|—|-)?\s*KẾT\s*LUẬN)/i);
          const organInsertHtml = `<p>-- <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.findingText || newClause)}</p>\n`;
          if (klMatch && klMatch.index !== undefined) {
            bodyHTML = bodyHTML.slice(0, klMatch.index) + organInsertHtml + bodyHTML.slice(klMatch.index);
            modified = true;
          } else {
            bodyHTML += `\n${organInsertHtml}`;
            modified = true;
          }
        }
      }

      // 3. Thay thế phẫu thuật duy nhất phần KẾT LUẬN (Bắt đầu bằng "Hình ảnh", không lặp)
      if (conclusion) {
        const klRegex = /((?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:--|—|-)?\s*KẾT\s*LUẬN\s*(?:<\/strong>|<\/b>)?\s*:\s*(?:<\/strong>|<\/b>)?\s*(?:<\/p>)?\s*(?:<br\s*\/?>|\s*|\n)*)[\s\S]*/i;
        if (klRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(klRegex, (_, p1) => {
            const cleanP1 = p1.replace(/(?:<br\s*\/?>|\s)+$/i, "");
            return `${cleanP1}\n<p>${escapeHTML(conclusion)}</p>\n`;
          });
          modified = true;
        } else {
          bodyHTML += `\n<p><strong>KẾT LUẬN:</strong></p>\n<p>${escapeHTML(conclusion)}</p>\n`;
          modified = true;
        }
      }

      if (modified) {
        editorEl.innerHTML = (bodyHTML.trim() + "\n" + footerHTML).trim();
      }
    } else if (isInput) {
      let text = (editorEl.value || "").normalize("NFC");

      // 1. Tách Header/Body vs Footer
      const footerRegex = /(?:^|\n)\s*(?:Người\s*ký|Kỹ\s*thuật\s*viên|Bác\s*sĩ\s*đọc|Chữ\s*ký|Alt\s*\+\s*1|Alt\s*\+\s*2)[^\n]*/i;
      const footerMatch = text.match(footerRegex);
      let bodyText = text;
      let footerText = "";
      if (footerMatch) {
        bodyText = text.slice(0, footerMatch.index);
        footerText = text.slice(footerMatch.index);
      }

      // 2. Sửa từng cơ quan trong bodyText
      if (synthResult.mota) {
        bodyText = synthResult.mota;
        modified = true;
      }

      // 3. Sửa Kết luận
      if (conclusion) {
        const klExp = /((?:^|\n)\s*(?:--|—|-)?\s*KẾT\s*LUẬN\s*:\s*\n?)[\s\S]*/i;
        if (klExp.test(bodyText)) {
          bodyText = bodyText.replace(klExp, `$1${conclusion}\n`);
          modified = true;
        } else {
          bodyText += `\n\nKẾT LUẬN:\n${conclusion}\n`;
          modified = true;
        }
      }

      if (modified) {
        editorEl.value = (bodyText.trim() + (footerText ? "\n\n" + footerText.trim() : "")).trim();
      }
    }

    if (modified) {
      triggerInputEvents(editorEl);
      highlightElement(editorEl);
      return true;
    }
    return false;
  }

  /**
   * Thay thế phẫu thuật cho ca ngực CT Lung-RADS v2022 (Từ PACS sang RIS)
   * CHỈ sửa: Phổi phải, Phổi trái và Kết luận. Mọi cơ quan khác giữ nguyên.
   */
  function applySynthesizedReportToRISEditor(editorEl, aiResult) {
    if (!editorEl || !aiResult) return false;

    lastSynthesizedReport = aiResult;
    saveUndoSnapshot(null, null, editorEl);

    const isCE = editorEl.isContentEditable || editorEl.getAttribute("contenteditable") === "true";
    const isInput = editorEl.tagName === "TEXTAREA" || editorEl.tagName === "INPUT";
    const normalizedAiText = aiResult.normalize("NFC");

    const lines = normalizedAiText.split("\n").map(l => l.trim()).filter(Boolean);
    let rawRightLungLines = [];
    let rawLeftLungLines = [];
    let rawConclusionLines = [];
    let currentSection = "";

    for (const line of lines) {
      if (/^(?:--|—|-)?\s*Phổi\s*phải\s*:/i.test(line)) {
        currentSection = "right";
        rawRightLungLines.push(line);
      } else if (/^(?:--|—|-)?\s*Phổi\s*trái\s*:/i.test(line)) {
        currentSection = "left";
        rawLeftLungLines.push(line);
      } else if (/^(?:--|—|-)?\s*Kết\s*luận\s*:/i.test(line)) {
        currentSection = "conclusion";
        const afterColon = line.replace(/^(?:--|—|-)?\s*Kết\s*luận\s*:\s*/i, "").trim();
        if (afterColon) rawConclusionLines.push(afterColon);
      } else if (currentSection === "right") {
        rawRightLungLines.push(line);
      } else if (currentSection === "left") {
        rawLeftLungLines.push(line);
      } else if (currentSection === "conclusion") {
        rawConclusionLines.push(line);
      }
    }

    const LUNG_INTERSTITIAL_SUFFIX = "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.";

    function ensureInterstitialSuffix(lungLine) {
      if (!lungLine || !lungLine.trim()) return lungLine;
      let text = lungLine.trim();
      if (/dày\s+tổ\s+chức\s+kẽ|giãn\s+phế\s+quản/i.test(text)) {
        return text;
      }
      text = text.replace(/[.,\s]+$/, "");
      return `${text}. ${LUNG_INTERSTITIAL_SUFFIX}`;
    }

    const rawRightLung = ensureInterstitialSuffix(rawRightLungLines.join(" ").trim());
    const rawLeftLung = ensureInterstitialSuffix(rawLeftLungLines.join(" ").trim());
    const rawConclusion = (typeof sanitizeLungRADSConclusion === "function")
      ? sanitizeLungRADSConclusion(rawConclusionLines.join(" ").trim())
      : rawConclusionLines.join(" ").trim();
    const htmlConclusion = escapeHTML(rawConclusion);

    let modified = false;

    if (isCE) {
      let html = editorEl.innerHTML.normalize("NFC");
      const footerIdx = html.search(/(?:<h1\b|<table\b)/i);
      let bodyHTML = footerIdx !== -1 ? html.slice(0, footerIdx) : html;
      const footerHTML = footerIdx !== -1 ? html.slice(footerIdx) : "";

      // 1. Phổi phải
      if (rawRightLung) {
        const rightRegex = /(?:\s*<(?:b\b|strong\b|span\b)[^>]*>)?\s*(?:--|—|-)?\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?(?:<(?:b\b|strong\b|span\b)[^>]*>\s*)?Phổi\s*phải\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?:\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?[^<\n\r]*(?:<(?!br\b|\/p\b|\/div\b)[^>]*>[^<\n\r]*)*(?=(?:<br\s*\/?>|<\/p>|<\/div>|\n|$))/i;
        if (rightRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(rightRegex, (m) => {
            const hasStrong = /<(?:strong|b)\b/i.test(m);
            const prefix = hasStrong ? "-- <strong>Phổi phải:</strong> " : "-- Phổi phải: ";
            const findingOnly = rawRightLung.replace(/^(?:--|—|-)?\s*Phổi\s*phải\s*:\s*/i, "").trim();
            return `${prefix}${escapeHTML(findingOnly)}`;
          });
          modified = true;
        }
      }

      // 2. Phổi trái
      if (rawLeftLung) {
        const leftRegex = /(?:\s*<(?:b\b|strong\b|span\b)[^>]*>)?\s*(?:--|—|-)?\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?(?:<(?:b\b|strong\b|span\b)[^>]*>\s*)?Phổi\s*trái\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?:\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?[^<\n\r]*(?:<(?!br\b|\/p\b|\/div\b)[^>]*>[^<\n\r]*)*(?=(?:<br\s*\/?>|<\/p>|<\/div>|\n|$))/i;
        if (leftRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(leftRegex, (m) => {
            const hasStrong = /<(?:strong|b)\b/i.test(m);
            const prefix = hasStrong ? "-- <strong>Phổi trái:</strong> " : "-- Phổi trái: ";
            const findingOnly = rawLeftLung.replace(/^(?:--|—|-)?\s*Phổi\s*trái\s*:\s*/i, "").trim();
            return `${prefix}${escapeHTML(findingOnly)}`;
          });
          modified = true;
        }
      }

      // 3. Kết luận
      if (htmlConclusion) {
        const klRegex = /((?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*KẾT\s*LUẬN\s*(?:<\/strong>|<\/b>)?\s*:\s*(?:<\/strong>|<\/b>)?\s*(?:<\/p>)?\s*(?:<br\s*\/?>|\s*|\n)*)[\s\S]*/i;
        if (klRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(klRegex, (_, p1) => {
            const cleanP1 = p1.replace(/(?:<br\s*\/?>|\s)+$/i, "");
            return `${cleanP1}<br>${htmlConclusion}<br><br>`;
          });
          modified = true;
        } else {
          bodyHTML += `<br><br><strong>KẾT LUẬN:</strong><br>${htmlConclusion}<br><br>`;
          modified = true;
        }
      }

      if (modified) {
        editorEl.innerHTML = bodyHTML + footerHTML;
      }
    } else if (isInput) {
      let text = (editorEl.value || "").normalize("NFC");
      if (rawRightLung) {
        const rExp = /(?:--|—|-)?\s*Phổi\s*phải\s*:[^\n]*/i;
        if (rExp.test(text)) {
          const findingOnly = rawRightLung.replace(/^(?:--|—|-)?\s*Phổi\s*phải\s*:\s*/i, "").trim();
          text = text.replace(rExp, () => `-- Phổi phải: ${findingOnly}`);
          modified = true;
        }
      }
      if (rawLeftLung) {
        const lExp = /(?:--|—|-)?\s*Phổi\s*trái\s*:[^\n]*/i;
        if (lExp.test(text)) {
          const findingOnly = rawLeftLung.replace(/^(?:--|—|-)?\s*Phổi\s*trái\s*:\s*/i, "").trim();
          text = text.replace(lExp, () => `-- Phổi trái: ${findingOnly}`);
          modified = true;
        }
      }
      if (rawConclusion) {
        const klExp = /((?:--|—|-)?\s*KẾT\s*LUẬN\s*:\s*\n?)[\s\S]*/i;
        if (klExp.test(text)) {
          text = text.replace(klExp, (_, p1) => `${p1}${rawConclusion}`);
          modified = true;
        } else {
          text += `\n\nKẾT LUẬN:\n${rawConclusion}`;
          modified = true;
        }
      }
      if (modified) {
        editorEl.value = text;
      }
    }

    if (modified) {
      triggerInputEvents(editorEl);
      highlightElement(editorEl);
      showToast("✅ Đã tự động cập nhật kết quả Lung-RADS từ PACS vào Editor RIS!");
      return true;
    }
    return false;
  }

  /**
   * Gọi Thư ký AI trên VPS (Qwen LLM Docker) cho các câu lệnh phức tạp
   */
  async function callVPSSecretaryAI(currentMota, currentKetluan, commandText) {
    let serverUrl = DEFAULT_CONFIG.serverUrl;
    try {
      if (isExtensionValid()) {
        const stored = await chrome.storage.local.get([STORAGE_KEYS.SERVER_URL]);
        if (stored[STORAGE_KEYS.SERVER_URL]) {
          serverUrl = stored[STORAGE_KEYS.SERVER_URL];
        }
      }
    } catch (e) {}

    serverUrl = serverUrl.replace(/\/+$/, "");
    const res = await fetch(`${serverUrl}/api/secretary/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_mota: currentMota,
        current_ketluan: currentKetluan,
        command: commandText
      })
    });

    if (!res.ok) {
      throw new Error(`Máy chủ báo lỗi HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.status === "error") {
      throw new Error(data.message || "Lỗi xử lý từ máy chủ AI");
    }
    return {
      mota: data.mota,
      ketluan: data.ketluan,
      summary: data.summary || "Đã áp dụng chỉnh sửa từ Thư ký Y khoa AI",
      isSecretary: true
    };
  }

  // =========================================================================
  // 4. TIẾN TRÌNH XỬ LÝ LỜI ĐỌC ĐIỆN THOẠI TRÊN TRANG RIS
  // =========================================================================
  // Hàng đợi tuần tự (FIFO Mutex Lock) chống race condition khi nhận luồng đọc dồn dập
  let dictationProcessingQueue = Promise.resolve();

  function enqueueDictation(dictationText) {
    const runTask = () => processAndApplyDictation(dictationText);
    const chained = dictationProcessingQueue.then(runTask, runTask);
    dictationProcessingQueue = chained.catch((err) => {
      console.error("[AutoRIS Content] Lỗi trong hàng đợi xử lý lời đọc:", err);
    });
    return chained;
  }

  async function processAndApplyDictation(dictationText) {
    if (!isExtensionValid()) {
      console.warn("[AutoRIS] Tiện ích đã cập nhật/tải lại. Vui lòng bấm F5 lại trang RIS!");
      showToast("⚠️ Tiện ích vừa tải lại. Vui lòng bấm F5 lại trang RIS!", true);
      return false;
    }
    if (!dictationText || !dictationText.trim()) return false;
    if (!isTabSelectedForFilling()) {
      console.log("[AutoRIS Content] Bỏ qua điền vì tab này chưa được tick chọn '🎯 Điền tab này'.");
      return false;
    }
    const rawClean = await SynthesizerBridge.cleanFillerWords(dictationText);
    if (!rawClean) return false;
    const cleanDictation = rawClean;
    lastDictationText = cleanDictation;

    updateFloatingPreview(cleanDictation, null, "Đang xử lý...");

    let storedConfig = {};
    try {
      if (isExtensionValid()) {
        storedConfig = await chrome.storage.local.get([
          STORAGE_KEYS.SMART_SYNTHESIZE,
          STORAGE_KEYS.AUTO_COPY,
          STORAGE_KEYS.PLAY_CHIME
        ]);
      }
    } catch (e) {
      storedConfig = {};
    }
    const useSmartSynthesize = storedConfig[STORAGE_KEYS.SMART_SYNTHESIZE] !== false;

    const sep = findSeparateFields();
    const editor = findRISEditor();

    if (!sep && !editor) {
      showToast("⚠️ Không tìm thấy khung soạn thảo RIS! Hãy nhấp chuột vào ô cần điền.", true);
      return false;
    }

    let currentMota = "";
    let currentKetluan = "";

    if (sep && (sep.motaEl || sep.ketluanEl)) {
      currentMota = sep.motaEl ? getElementText(sep.motaEl) : "";
      currentKetluan = sep.ketluanEl ? getElementText(sep.ketluanEl) : "";
    } else if (editor) {
      const fullText = getElementText(editor);
      const parsed = await SynthesizerBridge.parseEditorSections(fullText);
      currentMota = parsed.mota;
      currentKetluan = parsed.ketluan;
    }

    let synthesizedResult = null;

    // KIỂM TRA LỆNH THƯ KÝ Y KHOA (TIER 1 & TIER 2)
    const isSecretary = await SynthesizerBridge.isSecretaryCommand(cleanDictation);
    if (isSecretary) {
      updateFloatingPreview(cleanDictation, null, "Thư ký y khoa đang xử lý lệnh...");
      const localCmd = await SynthesizerBridge.executeSecretaryCommand(currentMota, currentKetluan, cleanDictation);
      if (localCmd.handled) {
        if (localCmd.action === "undo") {
          handleUndo();
          return true;
        }
        synthesizedResult = {
          mota: localCmd.mota,
          ketluan: localCmd.ketluan,
          summary: localCmd.summary,
          isSecretary: true
        };
      } else {
        // Lệnh phức tạp -> Gửi lên VPS AI Secretary
        try {
          updateFloatingPreview(cleanDictation, null, "Thư ký AI (VPS) đang xử lý...");
          synthesizedResult = await callVPSSecretaryAI(currentMota, currentKetluan, cleanDictation);
        } catch (err) {
          console.warn("[AutoRIS Content] VPS Secretary error:", err);
          showToast(`⚠️ Lỗi Thư ký AI: ${err.message}`, true);
          return false;
        }
      }
    } else {
      // Phân bổ giải phẫu bệnh học thông thường
      try {
        synthesizedResult = await SynthesizerBridge.synthesize(
          currentMota,
          currentKetluan,
          cleanDictation,
          useSmartSynthesize
        );
      } catch (err) {
        console.error("[AutoRIS Content] Synthesizer error:", err);
        synthesizedResult = await SynthesizerBridge.localDeterministicFallback(currentMota, currentKetluan, cleanDictation);
      }
    }

    lastSynthesizedData = synthesizedResult;

    // Tự động nhận diện Modality & Vùng giải phẫu (Tri-Source Detector)
    const serviceTitle = extractRISServiceTitle();
    const detected = (typeof ModalityDetector !== "undefined" && ModalityDetector.detect)
      ? ModalityDetector.detect(serviceTitle, `${currentMota} ${currentKetluan}`, cleanDictation)
      : { modality: "US", region: "ABDOMEN" };

    // KIỂM ĐỊNH AN TOÀN LÂM SÀNG TRƯỚC KHI ĐIỀN (CLINICAL SAFETY GUARD 2.0)
    const safetyCheck = (typeof ClinicalSafetyGuard !== "undefined")
      ? ClinicalSafetyGuard.verifyClinicalSafety(cleanDictation, synthesizedResult.mota, synthesizedResult.ketluan, currentMota, currentKetluan, detected.modality)
      : { safe: true };

    if (!safetyCheck.safe && (safetyCheck.riskLevel === "CRITICAL" || safetyCheck.riskLevel === "HIGH")) {
      console.warn("[AutoRIS Safety] Phát hiện bất thường lâm sàng:", safetyCheck.summary);
      if (storedConfig[STORAGE_KEYS.PLAY_CHIME] !== false) {
        playWarningChimeSound();
      }
      showAmberWarningBanner(cleanDictation, synthesizedResult, safetyCheck, currentMota, currentKetluan, editor, sep);
      updateFloatingPreview(cleanDictation, synthesizedResult, `⚠️ ${safetyCheck.anomalies[0].message}`);
      showToast(`⚠️ Cảnh báo lâm sàng: ${safetyCheck.anomalies[0].message}`, true);
      return false; // DỪNG LẠI - TUYỆT ĐỐI KHÔNG TỰ Ý SỬA DỮ LIỆU!
    }

    // Hiển thị Command Pill nếu là lệnh Thư ký
    if (synthesizedResult.isSecretary) {
      showCommandPill(synthesizedResult.summary);
    }

    let applied = false;
    const isAutoApplyEnabled = storedConfig[STORAGE_KEYS.AUTO_APPLY] !== false;

    if (!isAutoApplyEnabled && !synthesizedResult.isSecretary) {
      // Auto Apply bị tắt: Không tự ý điền vào RIS, chỉ cập nhật lên Floating Bar
      applied = false;
      lastSynthesizedReport = `${synthesizedResult.mota || ""}\n\nKẾT LUẬN:\n${synthesizedResult.ketluan || ""}`.trim();
      updateFloatingPreview(cleanDictation, synthesizedResult, "Auto Apply đang TẮT. Bấm F8 hoặc '✍️ Điền lại' để chèn!");
      showToast("ℹ️ Auto Apply đang tắt. Bấm F8 để điền vào RIS!");
    } else {
      applied = executeDirectApply(synthesizedResult, editor, sep);
    }

    if (storedConfig[STORAGE_KEYS.AUTO_COPY] !== false) {
      copyToClipboard(`${synthesizedResult.mota || ""}\n\nKẾT LUẬN:\n${synthesizedResult.ketluan || ""}`);
    }

    const timeStr = new Date().toLocaleTimeString();
    if (applied) {
      if (storedConfig[STORAGE_KEYS.PLAY_CHIME] !== false) {
        playChimeSound();
      }
      updateFloatingPreview(cleanDictation, synthesizedResult);
      showToast(`✅ AutoRIS (${timeStr}): ${synthesizedResult.summary || "Đã phân bổ mô tả & kết luận vào RIS!"}`);
    } else {
      updateFloatingPreview(cleanDictation, synthesizedResult, `⚠️ Không tìm thấy ô nhập RIS (Đã tự động copy Ctrl+V)`);
      showToast(`⚠️ AutoRIS: Không tìm thấy ô nhập RIS hoặc mẫu không khớp! (Đã copy sẵn Ctrl+V)`, true);
    }
    return applied;
  }

  // Helper trích xuất tiêu đề chỉ định y khoa từ DOM RIS
  function extractRISServiceTitle() {
    try {
      const selectors = [
        "#lbl-dichvu", "#txt-service-name", ".patient-study-desc", "td.service-title",
        "[id*='dich_vu']", "[id*='dichvu']", "[class*='service-name']", "[class*='study-desc']",
        ".study-description", "#serviceName", "#tenDichVu", ".header-service-title"
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el.innerText || el.value || "").trim();
          if (text) return text;
        }
      }
    } catch (e) {
      // Ignored
    }
    return "";
  }

  // Helper thực thi ghi kết quả vào Editor hoặc các ô riêng biệt
  function executeDirectApply(synthesizedResult, editor, sep) {
    if (!synthesizedResult) return false;
    let applied = false;
    if (editor) {
      saveUndoSnapshot(null, null, editor);
      applied = applySurgicalDictationToRISEditor(editor, synthesizedResult);
      if (applied && undoStack.length > 0) {
        undoStack[undoStack.length - 1].appliedVal = editor.isContentEditable ? editor.innerHTML : editor.value;
      }
    } else if (sep) {
      saveUndoSnapshot(sep.motaEl, sep.ketluanEl, null);
      if (sep.motaEl && typeof synthesizedResult.mota === "string") {
        sep.motaEl.value = synthesizedResult.mota;
        triggerInputEvents(sep.motaEl);
        applied = true;
      }
      if (sep.ketluanEl && typeof synthesizedResult.ketluan === "string") {
        sep.ketluanEl.value = synthesizedResult.ketluan;
        triggerInputEvents(sep.ketluanEl);
        applied = true;
      }
      if (applied && undoStack.length > 0) {
        undoStack[undoStack.length - 1].appliedMota = sep.motaEl ? sep.motaEl.value : null;
        undoStack[undoStack.length - 1].appliedKL = sep.ketluanEl ? sep.ketluanEl.value : null;
      }
    }
    return applied;
  }

  // Hiển thị Command Pill trên Floating Bar khi bác sĩ ra lệnh
  let cmdPillTimer = null;
  function showCommandPill(summary) {
    const pill = document.getElementById("autoris-cmd-pill");
    if (!pill) return;
    pill.textContent = `⚡ ${summary || "LỆNH THƯ KÝ"}`;
    pill.style.display = "inline-flex";
    if (cmdPillTimer) clearTimeout(cmdPillTimer);
    cmdPillTimer = setTimeout(() => {
      pill.style.display = "none";
    }, 3500);
  }

  // Âm thanh cảnh báo an toàn lâm sàng (Amber Chime: 520Hz -> 660Hz)
  function playWarningChimeSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Tone 1: 520Hz ấm
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(520, ctx.currentTime);
      gain1.gain.setValueAtTime(0.18, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.12);

      // Tone 2: 660Hz dịu
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.28);
    } catch (e) {
      // Browser autoplay policy có thể chặn audio nếu chưa tương tác
    }
  }

  // Hiển thị Amber Warning Banner khi phát hiện sai số / bất thường y khoa
  function showAmberWarningBanner(rawText, synthesizedResult, safetyCheck, currentMota, currentKetluan, editor, sep) {
    let warnBox = document.getElementById("autoris-amber-warning");
    if (!warnBox) {
      warnBox = document.createElement("div");
      warnBox.id = "autoris-amber-warning";
      warnBox.className = "autoris-amber-warning-card";
      const body = document.getElementById("autoris-bar-body");
      if (body) body.prepend(warnBox);
    }

    const anomalyMessages = safetyCheck.anomalies.map(a => `• <b>${escapeHTML(a.type)}</b>: ${escapeHTML(a.message)}`).join("<br/>");

    warnBox.innerHTML = `
      <div class="autoris-warning-header">
        <span>⚠️ CẢNH BÁO AN TOÀN LÂM SÀNG: PHÁT HIỆN BẤT THƯỜNG</span>
        <button id="autoris-btn-warn-close" class="autoris-icon-btn" style="color:#fcd34d; background:none; border:none; cursor:pointer;">✕</button>
      </div>
      <div class="autoris-warning-body">
        <div class="autoris-warning-msg">${anomalyMessages}</div>
        <div class="autoris-warning-diff">
          <div><b>Câu đọc gốc:</b> <code>${escapeHTML(rawText)}</code></div>
        </div>
      </div>
      <div class="autoris-warning-actions">
        <button id="autoris-btn-warn-confirm" class="autoris-btn-warn-confirm" title="Chấp nhận nội dung đề xuất của AI">
          ✓ Xác nhận đúng
        </button>
        <button id="autoris-btn-warn-raw" class="autoris-btn-warn-raw" title="Không dùng AI, chèn nguyên văn câu đọc">
          ↺ Giữ câu đọc gốc
        </button>
        <button id="autoris-btn-warn-undo" class="autoris-btn-secondary" style="font-size:11px; padding:4px 6px;" title="Hủy bỏ, giữ nguyên trạng thái trước">
          ↶ Hủy bỏ
        </button>
      </div>
    `;
    warnBox.style.display = "block";

    // Bind sự kiện
    const btnClose = document.getElementById("autoris-btn-warn-close");
    if (btnClose) btnClose.onclick = () => { warnBox.style.display = "none"; };

    const btnConfirm = document.getElementById("autoris-btn-warn-confirm");
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        warnBox.style.display = "none";
        executeDirectApply(synthesizedResult, editor, sep);
        showToast("✅ Đã áp dụng nội dung theo xác nhận của bác sĩ");
      };
    }

    const btnRaw = document.getElementById("autoris-btn-warn-raw");
    if (btnRaw) {
      btnRaw.onclick = () => {
        warnBox.style.display = "none";
        const fallbackResult = {
          mota: currentMota ? currentMota.trim() + "\n- " + rawText : "- " + rawText,
          ketluan: currentKetluan,
          summary: "Giữ nguyên câu đọc gốc"
        };
        executeDirectApply(fallbackResult, editor, sep);
        showToast("↺ Đã chèn nguyên văn câu đọc gốc vào mô tả");
      };
    }

    const btnUndo = document.getElementById("autoris-btn-warn-undo");
    if (btnUndo) {
      btnUndo.onclick = () => {
        warnBox.style.display = "none";
        showToast("↶ Đã hủy bỏ thao tác");
      };
    }
  }

  // =========================================================================
  // 5. HỆ THỐNG HOÀN TÁC (UNDO SYSTEM)
  // =========================================================================
  let lastStreamSnapshotSaved = false;
  let streamResetTimer = null;

  function resetStreamUndoSession() {
    lastStreamSnapshotSaved = false;
    if (streamResetTimer) {
      clearTimeout(streamResetTimer);
      streamResetTimer = null;
    }
  }

  function saveUndoSnapshot(motaEl, ketluanEl, unifiedEl, isStream = false) {
    const curUnified = unifiedEl ? (unifiedEl.isContentEditable ? unifiedEl.innerHTML : unifiedEl.value) : null;
    const curMota = motaEl ? (motaEl.isContentEditable ? motaEl.innerHTML : motaEl.value) : null;
    const curKL = ketluanEl ? (ketluanEl.isContentEditable ? ketluanEl.innerHTML : ketluanEl.value) : null;

    // 1. Chống trùng lặp (Deduplication): Nếu nội dung không thay đổi so với snapshot trên đỉnh stack, không lưu
    if (undoStack.length > 0) {
      const top = undoStack[undoStack.length - 1];
      const sameUnified = top.unifiedEl === unifiedEl && top.unifiedVal === curUnified;
      const sameMota = top.motaEl === motaEl && top.motaVal === curMota;
      const sameKL = top.ketluanEl === ketluanEl && top.ketluanVal === curKL;
      if (sameUnified && sameMota && sameKL) {
        return;
      }
    }

    // 2. Chế độ gộp luồng đọc (Streaming Session Grouping):
    // Trong 1 câu đọc có nhiều lần gửi tự động liên tục, chỉ lưu snapshot GỐC trước khi đọc câu đó!
    if (isStream && lastStreamSnapshotSaved) {
      if (streamResetTimer) clearTimeout(streamResetTimer);
      streamResetTimer = setTimeout(resetStreamUndoSession, 3500);
      return;
    }

    const snapshot = {
      motaEl,
      ketluanEl,
      unifiedEl,
      motaVal: curMota,
      ketluanVal: curKL,
      unifiedVal: curUnified
    };
    undoStack.push(snapshot);
    if (isStream) {
      lastStreamSnapshotSaved = true;
      if (streamResetTimer) clearTimeout(streamResetTimer);
      streamResetTimer = setTimeout(resetStreamUndoSession, 3500);
    }
    if (undoStack.length > 15) undoStack.shift();
  }

  function handleUndo() {
    resetStreamUndoSession();
    if (undoStack.length === 0) {
      showToast("ℹ️ Không có thao tác nào để hoàn tác!");
      return;
    }

    const lastState = undoStack.pop();

    // Kiểm tra xem bác sĩ có vừa gõ tay chỉnh sửa sau lần tự động điền không
    let hasManualEdits = false;
    if (lastState.unifiedEl) {
      const cur = lastState.unifiedEl.isContentEditable ? lastState.unifiedEl.innerHTML : lastState.unifiedEl.value;
      if (lastState.appliedVal && cur !== lastState.appliedVal && cur !== lastState.unifiedVal) {
        hasManualEdits = true;
      }
    } else {
      if (lastState.motaEl) {
        const curMota = lastState.motaEl.isContentEditable ? lastState.motaEl.innerHTML : lastState.motaEl.value;
        if (lastState.appliedMota && curMota !== lastState.appliedMota && curMota !== lastState.motaVal) {
          hasManualEdits = true;
        }
      }
      if (lastState.ketluanEl) {
        const curKL = lastState.ketluanEl.isContentEditable ? lastState.ketluanEl.innerHTML : lastState.ketluanEl.value;
        if (lastState.appliedKL && curKL !== lastState.appliedKL && curKL !== lastState.ketluanVal) {
          hasManualEdits = true;
        }
      }
    }

    if (hasManualEdits) {
      const confirmUndo = window.confirm("⚠️ CẢNH BÁO: Bác sĩ đã chỉnh sửa thủ công văn bản sau lần tự động điền.\nHoàn tác sẽ xóa các chỉnh sửa tay này. Bác sĩ có chắc chắn muốn hoàn tác?");
      if (!confirmUndo) {
        undoStack.push(lastState);
        return;
      }
    }

    if (lastState.unifiedEl) {
      if (!document.body.contains(lastState.unifiedEl)) {
        showToast("⚠️ Khung soạn thảo của ca bệnh trước đã đóng. Từ chối hoàn tác sang ca bệnh mới để chống nhiễm chéo!", true);
        return;
      }
      const activeEl = lastState.unifiedEl;
      if (activeEl.isContentEditable) {
        activeEl.innerHTML = lastState.unifiedVal;
      } else {
        activeEl.value = lastState.unifiedVal;
      }
      triggerInputEvents(activeEl);
      highlightElement(activeEl);
    } else {
      const motaInDom = lastState.motaEl && document.body.contains(lastState.motaEl);
      const klInDom = lastState.ketluanEl && document.body.contains(lastState.ketluanEl);

      if (!motaInDom && !klInDom) {
        showToast("⚠️ Các ô nhập liệu của ca bệnh trước đã đóng. Từ chối hoàn tác sang ca bệnh mới để chống nhiễm chéo!", true);
        return;
      }

      if (motaInDom) {
        if (lastState.motaEl.isContentEditable) lastState.motaEl.innerHTML = lastState.motaVal;
        else lastState.motaEl.value = lastState.motaVal;
        triggerInputEvents(lastState.motaEl);
      }
      if (klInDom) {
        if (lastState.ketluanEl.isContentEditable) lastState.ketluanEl.innerHTML = lastState.ketluanVal;
        else lastState.ketluanEl.value = lastState.ketluanVal;
        triggerInputEvents(lastState.ketluanEl);
      }
    }

    showToast("↩️ Đã hoàn tác nội dung trước đó trên RIS!");
  }

  function isTabSelectedForFilling() {
    const chk = document.getElementById("autoris-chk-target-tab");
    if (chk) {
      return chk.checked;
    }
    return true;
  }

  // =========================================================================
  // 5.5. THU THẬP VÀ GỬI PHẢN HỒI / CA SỬA CỦA BÁC SĨ LÊN SERVER
  // =========================================================================
  function extractCurrentDoctorReport() {
    const editor = findRISEditor();
    if (editor) {
      if (editor.isContentEditable || editor.getAttribute("contenteditable") === "true") {
        return (editor.innerText || editor.textContent || "").trim();
      }
      if (editor.value) {
        return editor.value.trim();
      }
    }
    const sep = findSeparateFields();
    if (sep) {
      const motaVal = sep.motaEl ? (sep.motaEl.value || sep.motaEl.innerText || "").trim() : "";
      const klVal = sep.ketluanEl ? (sep.ketluanEl.value || sep.ketluanEl.innerText || "").trim() : "";
      if (motaVal || klVal) {
        return `${motaVal}\n\nKẾT LUẬN:\n${klVal}`.trim();
      }
    }
    return "";
  }

  function getLatestAIOutput() {
    if (lastSynthesizedReport) {
      return lastSynthesizedReport.trim();
    }
    if (lastSynthesizedData) {
      if (lastSynthesizedData.mota && lastSynthesizedData.ketluan) {
        return `${lastSynthesizedData.mota}\n\nKẾT LUẬN:\n${lastSynthesizedData.ketluan}`.trim();
      }
      return (lastSynthesizedData.ketluan || lastSynthesizedData.mota || "").trim();
    }
    return "";
  }

  function getLatestRawInput() {
    return (lastInputText || lastDictationText || "").trim();
  }

  async function captureAndSubmitFeedback() {
    if (!isExtensionValid()) {
      showToast("⚠️ Tiện ích vừa tải lại. Vui lòng bấm F5 lại trang RIS!", true);
      return;
    }

    const doctorFinal = extractCurrentDoctorReport();
    let aiOutput = getLatestAIOutput();
    let rawInput = getLatestRawInput();

    // Fallback: Nếu aiOutput hoặc rawInput trống trong bộ nhớ trang RIS, đọc từ storage đã đồng bộ
    if (!aiOutput || !rawInput) {
      try {
        const stored = await chrome.storage.local.get([
          STORAGE_KEYS.LAST_REPORT,
          "lastRawInput"
        ]);
        if (!aiOutput && stored[STORAGE_KEYS.LAST_REPORT]) {
          aiOutput = (stored[STORAGE_KEYS.LAST_REPORT] || "").trim();
        }
        if (!rawInput && stored["lastRawInput"]) {
          rawInput = (stored["lastRawInput"] || "").trim();
        }
      } catch (e) {
        // bỏ qua lỗi đọc storage
      }
    }

    if (!doctorFinal && !aiOutput && !rawInput) {
      showToast("ℹ️ Chưa có nội dung báo cáo hoặc bản đọc nào để lưu!", true);
      return;
    }

    const feedbackBtn = document.getElementById("autoris-btn-feedback");
    const originalText = feedbackBtn ? feedbackBtn.innerHTML : "";
    if (feedbackBtn) {
      feedbackBtn.disabled = true;
      feedbackBtn.innerHTML = "⏳ Đang gửi lên server...";
    }

    const isLungRADS = (lastSynthesizedReport && /Lung-RADS/i.test(lastSynthesizedReport)) ||
                       (aiOutput && /Lung-RADS/i.test(aiOutput)) ||
                       (doctorFinal && /Lung-RADS/i.test(doctorFinal));

    const payload = {
      source: isLungRADS ? "pacs_lung_rads" : "voice_dictation",
      raw_input: rawInput,
      ai_output: aiOutput,
      doctor_final: doctorFinal,
      page_url: window.location.href,
      timestamp: new Date().toISOString()
    };

    chrome.runtime.sendMessage({
      action: "SUBMIT_FEEDBACK",
      payload: payload
    }, (res) => {
      if (feedbackBtn) {
        feedbackBtn.disabled = false;
        feedbackBtn.innerHTML = originalText;
      }
      if (res && res.success) {
        playChimeSound();
        const cid = res.data?.id || "OK";
        showToast(`✅ Đã lưu ca sửa lên server (Mã: ${cid})! Tối nay AI sẽ học lại.`);
        if (feedbackBtn) {
          feedbackBtn.innerHTML = "✅ Đã lưu ca sửa!";
          setTimeout(() => {
            feedbackBtn.innerHTML = originalText;
          }, 3000);
        }
      } else {
        console.error("[AutoRIS] Lỗi lưu feedback:", res?.error);
        showToast(`❌ Không thể lưu lên server: ${res?.error || "Mất kết nối"}`, true);
      }
    });
  }

  // =========================================================================
  // 6. THANH ĐIỀU KHIỂN NỔI (CHỈ HIỆN TRÊN TRANG RIS)
  // =========================================================================
  function createFloatingVoiceBar() {
    if (window.self !== window.top) return; // Chỉ hiện thanh nổi trên Top Frame, tránh nhân bản trong các iframes con
    if (isViewerPage()) {
      const existing = document.getElementById("autoris-floating-bar");
      if (existing) existing.remove();
      return;
    }
    if (!isRISPage() || document.getElementById("autoris-floating-bar")) return;

    const bar = document.createElement("div");
    bar.id = "autoris-floating-bar";
    bar.className = "autoris-bar-container";
    bar.innerHTML = `
      <div class="autoris-bar-header" id="autoris-bar-drag">
        <div class="autoris-status-pill">
          <span class="autoris-dot" id="autoris-dot-status"></span>
          <span class="autoris-title">AutoRIS</span>
          <span id="autoris-cmd-pill" class="autoris-cmd-pill" style="display:none;">⚡ LỆNH</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <label class="autoris-tab-select-toggle is-active" id="autoris-tab-toggle-wrap" title="Tick chọn để cho phép nhận và điền kết quả vào tab này. Chỉ tab được tick mới điền để tránh nhầm ca bệnh khi mở nhiều tab RIS cùng lúc!">
            <input type="checkbox" id="autoris-chk-target-tab" checked>
            <span id="autoris-tab-toggle-txt">🎯 Điền tab này</span>
          </label>
          <button id="autoris-btn-min" class="autoris-icon-btn" title="Thu nhỏ/Mở rộng">_</button>
        </div>
      </div>
      <div class="autoris-bar-body" id="autoris-bar-body">
        <div id="autoris-amber-warning" class="autoris-amber-warning-card" style="display:none;"></div>
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
          <button id="autoris-btn-feedback" class="autoris-btn-feedback" title="Lưu log ca bệnh & bản sửa của bác sĩ lên server để tối về AI học và sửa lại (Phím tắt: Ctrl+Shift+S)">
            🚨 Báo lỗi / Lưu ca sửa
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);

    makeDraggable(bar, document.getElementById("autoris-bar-drag"));

    const minBtn = document.getElementById("autoris-btn-min");
    const bodyEl = document.getElementById("autoris-bar-body");
    minBtn.addEventListener("click", () => {
      bodyEl.style.display = bodyEl.style.display === "none" ? "block" : "none";
    });

    const chkTarget = document.getElementById("autoris-chk-target-tab");
    const toggleWrap = document.getElementById("autoris-tab-toggle-wrap");
    const toggleTxt = document.getElementById("autoris-tab-toggle-txt");
    const dotStatus = document.getElementById("autoris-dot-status");

    function updateTabActiveUI(isActive) {
      if (chkTarget) chkTarget.checked = isActive;
      if (toggleWrap) {
        if (isActive) toggleWrap.classList.add("is-active");
        else toggleWrap.classList.remove("is-active");
      }
      if (toggleTxt) {
        toggleTxt.textContent = isActive ? "🎯 Điền tab này" : "⚪ Tạm dừng tab";
      }
      if (dotStatus) {
        dotStatus.style.backgroundColor = isActive ? "#10b981" : "#64748b";
        dotStatus.style.boxShadow = isActive ? "0 0 8px #10b981" : "none";
      }
    }

    chkTarget.addEventListener("change", () => {
      if (chkTarget.checked) {
        userExplicitlyUnchecked = false;
        chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TARGET_TAB]: TAB_INSTANCE_ID });
        updateTabActiveUI(true);
        showToast("🎯 Đã CHỌN tab này để tự động điền kết quả!");
      } else {
        userExplicitlyUnchecked = true;
        chrome.storage.local.get([STORAGE_KEYS.ACTIVE_TARGET_TAB], (res) => {
          if (res && res[STORAGE_KEYS.ACTIVE_TARGET_TAB] === TAB_INSTANCE_ID) {
            chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TARGET_TAB]: "" });
          }
        });
        updateTabActiveUI(false);
        showToast("⏸️ Đã TẠM DỪNG điền ở tab này (tránh ghi đè ca bệnh).");
      }
    });

    // Khởi tạo trạng thái active của tab
    chrome.storage.local.get([STORAGE_KEYS.ACTIVE_TARGET_TAB], (res) => {
      const curActive = res && res[STORAGE_KEYS.ACTIVE_TARGET_TAB];
      if (!curActive) {
        chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TARGET_TAB]: TAB_INSTANCE_ID });
        updateTabActiveUI(true);
      } else if (curActive === TAB_INSTANCE_ID) {
        updateTabActiveUI(true);
      } else {
        updateTabActiveUI(false);
      }
    });

    // Lắng nghe thay đổi tab active từ các tab khác
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[STORAGE_KEYS.ACTIVE_TARGET_TAB]) {
          const newActiveId = changes[STORAGE_KEYS.ACTIVE_TARGET_TAB].newValue;
          if (newActiveId === TAB_INSTANCE_ID) {
            userExplicitlyUnchecked = false;
            updateTabActiveUI(true);
          } else {
            updateTabActiveUI(false);
          }
        }
      });
    } catch (e) {}

    // Bác sĩ hoàn toàn chủ động chọn tab qua checkbox chkTarget hoặc nút Áp dụng (tránh cướp quyền khi chuyển tab xem bệnh án)

    async function handleRefillAction() {
      if (!chkTarget.checked) {
        userExplicitlyUnchecked = false;
        chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TARGET_TAB]: TAB_INSTANCE_ID });
        updateTabActiveUI(true);
      }

      const editor = findRISEditor();

      // 1. Kiểm tra bản dịch PACS Lung-RADS gần nhất (F9) - Chống nhiễm chéo ca bệnh cũ (> 5 phút coi như hết hạn)
      const store = await chrome.storage.local.get([STORAGE_KEYS.LAST_REPORT, STORAGE_KEYS.LAST_REPORT_TIME]);
      const lastRepTime = store[STORAGE_KEYS.LAST_REPORT_TIME] || 0;
      const isStale = (Date.now() - lastRepTime) > 5 * 60 * 1000;
      const pacsReport = lastSynthesizedReport || (!isStale ? store[STORAGE_KEYS.LAST_REPORT] : null);

      if (pacsReport && editor) {
        applySynthesizedReportToRISEditor(editor, pacsReport);
        playChimeSound();
        showToast("✅ Đã điền lại kết quả Lung-RADS vào RIS!");
        return;
      }

      // 2. Kiểm tra câu đọc từ điện thoại (ASR)
      if (lastDictationText) {
        enqueueDictation(lastDictationText);
        showToast("✅ Đã xử lý và điền lại câu đọc từ điện thoại!");
        return;
      }

      if (!editor) {
        showToast("⚠️ Chưa tìm thấy khung soạn thảo RIS. Vui lòng click chuột vào ô Mô tả trên RIS rồi bấm lại!", true);
      } else {
        showToast("ℹ️ Chưa có nội dung bản dịch hoặc câu đọc nào để điền lại!");
      }
    }

    document.getElementById("autoris-btn-apply").addEventListener("click", handleRefillAction);

    // Phím tắt F8 hoặc Alt+D trên trang RIS: Điền lại ngay lập tức
    window.addEventListener("keydown", (e) => {
      if (window.self !== window.top) return;
      if (e.key === "F8" || (e.altKey && (e.key === "D" || e.key === "d" || e.code === "KeyD"))) {
        if (isRISPage()) {
          e.preventDefault();
          handleRefillAction();
        }
      }
    });

    document.getElementById("autoris-btn-undo").addEventListener("click", handleUndo);

    const feedbackBtn = document.getElementById("autoris-btn-feedback");
    if (feedbackBtn) {
      feedbackBtn.addEventListener("click", captureAndSubmitFeedback);
    }

    // Phím tắt Ctrl+Shift+S hoặc Alt+S: Báo lỗi / Lưu ca sửa lên server
    window.addEventListener("keydown", (e) => {
      if (window.self !== window.top) return;
      if ((e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s" || e.code === "KeyS")) ||
          (e.altKey && (e.key === "S" || e.key === "s" || e.code === "KeyS"))) {
        e.preventDefault();
        captureAndSubmitFeedback();
      }
    });
  }

  const recentDictationsLog = [];
  const MAX_LOG_ENTRIES = 6;

  function updateFloatingPreview(rawText, synthResult = null, statusMsg = "") {
    const previewEl = document.getElementById("autoris-preview-text");
    if (!previewEl) return;

    if (statusMsg && !rawText && recentDictationsLog.length === 0) {
      previewEl.innerHTML = `<span style="color:#38bdf8;">⏳ ${escapeHTML(statusMsg)}</span>`;
      return;
    }

    const timeStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (rawText && rawText.trim()) {
      const trimmed = rawText.trim();
      const lastEntry = recentDictationsLog[recentDictationsLog.length - 1];
      if (!lastEntry || lastEntry.text !== trimmed) {
        recentDictationsLog.push({
          time: timeStr,
          text: trimmed,
          summary: synthResult && synthResult.summary ? synthResult.summary : "",
          ketluan: synthResult && synthResult.ketluan ? synthResult.ketluan : ""
        });
        if (recentDictationsLog.length > MAX_LOG_ENTRIES) {
          recentDictationsLog.shift();
        }
      } else if (synthResult) {
        if (synthResult.summary) lastEntry.summary = synthResult.summary;
        if (synthResult.ketluan) lastEntry.ketluan = synthResult.ketluan;
      }
    }

    let html = "";
    if (recentDictationsLog.length === 0) {
      if (statusMsg) {
        html = `<span style="color:#38bdf8;">⏳ ${escapeHTML(statusMsg)}</span>`;
      } else {
        html = `<span style="color:#64748b;">🟢 Sẵn sàng nhận giọng nói từ điện thoại (AutoRIS ZipFormer)...</span>`;
      }
    } else {
      html += `<div style="display:flex;flex-direction:column;gap:5px;">`;
      recentDictationsLog.forEach((item, index) => {
        const isLatest = index === recentDictationsLog.length - 1;
        const borderColor = isLatest ? "#38bdf8" : "#334155";
        const bgColor = isLatest ? "rgba(56, 189, 248, 0.08)" : "transparent";
        html += `
          <div style="padding:4px 6px;border-left:3px solid ${borderColor};background:${bgColor};border-radius:3px;">
            <div style="font-size:11px;color:${isLatest ? '#f8fafc' : '#94a3b8'};">
              <span style="color:#64748b;font-size:10px;margin-right:4px;">[${item.time}]</span>
              <b>Bác sĩ:</b> "${escapeHTML(item.text)}"
            </div>
            ${item.summary ? `<div style="color:#10b981;font-size:10.5px;margin-top:2px;">⚡ ${escapeHTML(item.summary)}</div>` : ''}
          </div>
        `;
      });
      html += `</div>`;

      const latestKetluan = synthResult && synthResult.ketluan 
        ? synthResult.ketluan 
        : (recentDictationsLog[recentDictationsLog.length - 1]?.ketluan || "");

      if (latestKetluan) {
        html += `<div style="color:#38bdf8;font-size:11.5px;font-weight:600;border-top:1px solid #1e293b;margin-top:6px;padding-top:4px;"><b>KẾT LUẬN:</b> ${escapeHTML(latestKetluan)}</div>`;
      }

      if (statusMsg) {
        html += `<div style="color:#f59e0b;font-size:10.5px;margin-top:4px;">⚠️ ${escapeHTML(statusMsg)}</div>`;
      }
    }

    previewEl.innerHTML = html;
    previewEl.scrollTop = previewEl.scrollHeight;
  }

  // =========================================================================
  // 7. CỤM ĐIỀU KHIỂN & PHÍM TẮT F9 TRÊN TRANG PACS (192.168.50.110:30979)
  // =========================================================================
  async function handlePACSAction(btn) {
    if (!isExtensionValid()) {
      showToast("⚠️ Tiện ích vừa được tải lại. Vui lòng bấm F5 lại trang PACS!", true);
      return;
    }

    const reportEl = findPACSElement();
    if (!reportEl) {
      showToast("❌ Không tìm thấy khung báo cáo trên PACS!", true);
      return;
    }

    const currentText = (reportEl.innerText || reportEl.textContent || "").trim();
    if (!currentText) {
      showToast("⚠️ Chưa có nội dung báo cáo để tổng hợp!", true);
      return;
    }

    if (currentText === lastInputText && lastSynthesizedReport) {
      await copyToClipboard(lastSynthesizedReport);
      const now = Date.now();
      chrome.storage.local.set({
        [STORAGE_KEYS.LAST_REPORT]: lastSynthesizedReport,
        [STORAGE_KEYS.LAST_REPORT_TIME]: now
      });
      // Phát sóng lại ngay lập tức sang các tab RIS để điền lại
      chrome.runtime.sendMessage({
        action: "BROADCAST_PACS",
        payload: {
          report: lastSynthesizedReport,
          rawText: currentText,
          timestamp: now
        }
      });
      btn.innerHTML = `✅ Đã điền vào RIS & Copy!`;
      btn.style.backgroundColor = "#38a169";
      showToast("📋 Đã gửi lại kết quả sang RIS & copy vào clipboard (Ctrl+V)!");
      return;
    }

    btn.disabled = true;
    let secondsElapsed = 0;
    btn.innerHTML = `⏳ Đang dịch Lung-RADS (${secondsElapsed}s)...`;
    btn.style.backgroundColor = "#d69e2e";
    btn.style.cursor = "wait";

    const countInterval = setInterval(() => {
      secondsElapsed++;
      btn.innerHTML = `⏳ Đang dịch Lung-RADS (${secondsElapsed}s)...`;
    }, 1000);

    try {
      const config = await chrome.storage.local.get([
        STORAGE_KEYS.CONNECTION_MODE,
        STORAGE_KEYS.AI_API_ENDPOINT,
        STORAGE_KEYS.AI_API_KEY,
        STORAGE_KEYS.AI_MODEL,
        STORAGE_KEYS.GOOGLE_KEYS_POOL,
        STORAGE_KEYS.SYSTEM_PROMPT
      ]);

      const synthesized = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Hết thời gian chờ phản hồi AI (40s)")), 40000);
        chrome.runtime.sendMessage({
          action: ACTIONS.SYNTHESIZE,
          payload: {
            connectionMode: config[STORAGE_KEYS.CONNECTION_MODE] || DEFAULT_CONFIG.connectionMode,
            apiEndpoint: config[STORAGE_KEYS.AI_API_ENDPOINT] || DEFAULT_CONFIG.aiEndpoint,
            apiKey: config[STORAGE_KEYS.AI_API_KEY] || DEFAULT_CONFIG.aiKey,
            googleKeysPool: config[STORAGE_KEYS.GOOGLE_KEYS_POOL] || DEFAULT_CONFIG.googleKeysPool,
            preferredModel: config[STORAGE_KEYS.AI_MODEL] || DEFAULT_CONFIG.aiModel,
            systemPrompt: (config[STORAGE_KEYS.SYSTEM_PROMPT] && config[STORAGE_KEYS.SYSTEM_PROMPT].includes("QUY TẮC BẮT BUỘC VỀ THỨ TỰ MÔ TẢ"))
              ? config[STORAGE_KEYS.SYSTEM_PROMPT]
              : LUNG_RADS_SYSTEM_PROMPT,
            rawText: currentText
          }
        }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.success) resolve(res.data);
          else reject(new Error(res?.error || "Không thể dịch báo cáo"));
        });
      });

      clearInterval(countInterval);
      const cleanSynthesized = (typeof sanitizeLungRADSReport === "function")
        ? sanitizeLungRADSReport(synthesized)
        : synthesized;
      await copyToClipboard(cleanSynthesized);
      lastInputText = currentText;
      lastSynthesizedReport = cleanSynthesized;

      btn.disabled = false;
      btn.innerHTML = `✅ Đã điền vào RIS & Copy!`;
      btn.style.backgroundColor = "#38a169";
      btn.style.cursor = "pointer";
      showToast(`✅ Đã tổng hợp Lung-RADS (${secondsElapsed}s) & Tự động điền sang RIS!`);
    } catch (err) {
      clearInterval(countInterval);
      console.error("[AutoRIS PACS] Lỗi:", err);
      btn.disabled = false;
      btn.innerHTML = `❌ Lỗi! (Thử lại)`;
      btn.style.backgroundColor = "#e53e3e";
      btn.style.cursor = "pointer";
      showToast(`❌ Lỗi: ${err.message}`, true);
    }
  }

  function attachPACSControls() {
    if (document.getElementById(BUTTON_CONTAINER_ID)) return true;
    const reportEl = findPACSElement();
    if (!reportEl) return false;

    const container = document.createElement("div");
    container.id = BUTTON_CONTAINER_ID;
    container.style.cssText = "display:flex; align-items:center; gap:8px; margin:8px 0; z-index:1000;";

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "pacs-btn-main";
    btn.innerHTML = `📋 Dịch Lung-RADS & Điền RIS (F9)`;
    btn.title = "Dịch báo cáo theo chuẩn Lung-RADS v2022 và tự động điền sang RIS (Phím tắt: F9)";
    btn.style.cssText = "padding:8px 16px; font-size:13px; font-weight:600; color:#fff; background-color:#3182ce; border:none; border-radius:6px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handlePACSAction(btn);
    });

    const settingsBtn = document.createElement("button");
    settingsBtn.id = SETTINGS_BTN_ID;
    settingsBtn.type = "button";
    settingsBtn.innerHTML = `⚙️ Cài đặt`;
    settingsBtn.style.cssText = "padding:8px 12px; font-size:13px; font-weight:600; color:#4a5568; background:#edf2f7; border:1px solid #cbd5e0; border-radius:6px; cursor:pointer;";
    settingsBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: ACTIONS.OPEN_OPTIONS }));

    container.appendChild(btn);
    container.appendChild(settingsBtn);

    if (reportEl.parentNode) {
      reportEl.parentNode.insertBefore(container, reportEl);
      return true;
    }
    return false;
  }

  // Lắng nghe phím tắt F9 trên PACS (chỉ kích hoạt khi khung báo cáo PACS đang sẵn sàng)
  window.addEventListener("keydown", (e) => {
    if (window.self !== window.top) return;
    if (e.key === "F9" && isPACSPage()) {
      const btn = document.getElementById(BUTTON_ID);
      const reportEl = findPACSElement();
      if (btn && !btn.disabled && reportEl) {
        e.preventDefault();
        handlePACSAction(btn);
      }
    }
  });

  // =========================================================================
  // 8. TIỆN ÍCH UI, KÉO THẢ, ÂM THANH & TOAST
  // =========================================================================
  function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
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
      setTimeout(() => ctx.close(), 300);
    } catch (e) {}
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      Object.assign(toast.style, {
        position: "fixed",
        top: "24px",
        left: "50%",
        maxWidth: "460px",
        padding: "10px 20px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: "600",
        color: "#ffffff",
        zIndex: "2147483647",
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
        cursor: "pointer",
        display: "none",
        opacity: "0",
        transform: "translateX(-50%) translateY(-10px)",
        textAlign: "center"
      });
      toast.title = "Bấm để tắt";
      toast.addEventListener("click", () => {
        toast.style.opacity = "0";
        setTimeout(() => toast.style.display = "none", 250);
      });
      (document.body || document.documentElement).appendChild(toast);
    }

    if (toastTimeout) clearTimeout(toastTimeout);
    toast.style.backgroundColor = isError ? "#e53e3e" : "#2b6cb0";
    toast.textContent = message;
    toast.style.display = "block";
    void toast.offsetWidth;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";

    toastTimeout = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-10px)";
      setTimeout(() => { if (toast.style.opacity === "0") toast.style.display = "none"; }, 250);
    }, 3500);
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  }

  // =========================================================================
  // 9. LẮNG NGHE SỰ KIỆN TỪ BACKGROUND SERVICE WORKER (RIS SIDE)
  // =========================================================================
  if (isRISPage()) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // A. Nhận lời đọc từ điện thoại (AutoRIS ASR)
      if (msg.action === "ACTION_NEW_DICTATION") {
        const data = msg.data;
        const textToApply = data.normalized_transcript || data.raw_transcript;
        if (!isTabSelectedForFilling()) {
          console.log("[AutoRIS RIS] Bỏ qua ca đọc vì tab này chưa được tick '🎯 Điền tab này'.");
          if (textToApply) {
            updateFloatingPreview(textToApply, null, "⚪ Tab này đang tắt tick '🎯 Điền tab này' (Bỏ qua)");
          }
          sendResponse({ success: false, skipped: true });
          return;
        }
        console.log("[AutoRIS RIS] Nhận ca đọc từ điện thoại:", textToApply);
        if (textToApply) {
          enqueueDictation(textToApply).then((applied) => {
            sendResponse({ success: Boolean(applied) });
          }).catch((err) => {
            console.error("[AutoRIS RIS] Dictation failed:", err);
            sendResponse({ success: false, error: err.message });
          });
          return true; // Giữ kết nối mở để phản hồi bất đồng bộ
        }
      }

      // B. Nhận kết quả dịch PACS Lung-RADS (từ tab PACS qua phím F9)
      if (msg.action === ACTIONS.AUTO_APPLY_PACS || msg.action === ACTIONS.AUTO_APPLY) {
        if (!isTabSelectedForFilling()) {
          console.log("[AutoRIS RIS] Bỏ qua kết quả PACS vì tab này chưa được tick '🎯 Điền tab này'.");
          return;
        }
        const report = msg.report;
        const reportTime = msg.timestamp || Date.now();
        if (report && reportTime >= lastAppliedReportTime) {
          lastAppliedReportTime = reportTime;
          lastSynthesizedReport = report;
          if (msg.rawText) {
            lastInputText = msg.rawText;
          }

          // Kiểm định an toàn lâm sàng (Clinical Safety Guard) cho kết quả PACS
          if (typeof ClinicalSafetyGuard !== "undefined") {
            const safetyCheck = ClinicalSafetyGuard.verifyClinicalSafety(msg.rawText || "", report, "", "", "", "CT");
            if (!safetyCheck.safe && (safetyCheck.riskLevel === "CRITICAL" || safetyCheck.riskLevel === "HIGH")) {
              const reason = safetyCheck.anomalies?.[0]?.message || "Bất thường lâm sàng";
              console.warn("[AutoRIS PACS Safety] Từ chối tự động điền PACS:", reason);
              showToast(`⛔ Chặn tự điền PACS: ${reason}`, true);
              updateFloatingPreview(msg.rawText || "", null, `⚠️ ${reason}`);
              sendResponse({ received: true, blocked: true, reason: reason });
              return;
            }
          }

          // Kiểm tra cài đặt Auto Apply
          const isAutoApplyEnabled = storedConfig[STORAGE_KEYS.AUTO_APPLY] !== false;
          if (!isAutoApplyEnabled) {
            showToast("ℹ️ Auto Apply đang tắt. Bấm F8 để điền kết quả PACS vào RIS!");
            updateFloatingPreview(msg.rawText || "", null, "Đã nhận kết quả PACS. Bấm F8 để điền!");
            sendResponse({ received: true, autoApplyDisabled: true });
            return;
          }

          const editor = findRISEditor();
          if (editor) {
            applySynthesizedReportToRISEditor(editor, report);
            playChimeSound();
            showToast("✅ Đã tự động điền kết quả dịch Lung-RADS từ PACS!");
          } else {
            console.warn("[AutoRIS RIS] Chưa tìm thấy ô soạn thảo RIS để tự điền tự động. Bác sĩ có thể bấm '✍️ Điền lại' (F8) hoặc Ctrl+V!");
          }
          sendResponse({ received: true });
        }
      }
    });



    // Khởi tạo Sandbox Bridge & Floating Bar
    SynthesizerBridge.init();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createFloatingVoiceBar);
    } else {
      createFloatingVoiceBar();
    }
  }

  // =========================================================================
  // 10. KHỞI TẠO MUTATION OBSERVER TRÊN TRANG PACS
  // =========================================================================
  if (isPACSPage()) {
    function startPACSObserver() {
      if (!document.body) {
        window.addEventListener("DOMContentLoaded", startPACSObserver, { once: true });
        return;
      }

      if (attachPACSControls()) return;

      const observer = new MutationObserver(() => {
        if (!isExtensionValid()) {
          observer.disconnect();
          return;
        }
        if (observerTimer) clearTimeout(observerTimer);
        observerTimer = setTimeout(() => {
          if (attachPACSControls()) {
            observer.disconnect();
          }
        }, 400);
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startPACSObserver, { once: true });
    } else {
      startPACSObserver();
    }
  }
})();
