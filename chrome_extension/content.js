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
  // 1. NHẬN DIỆN TRANG WEB & BẢO VỆ PHẠM VI (GATE CHECKS)
  // =========================================================================
  function isRISPage() {
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

  // Dừng ngay lập tức nếu không phải trang RIS và không phải trang PACS
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

    saveUndoSnapshot(null, null, editorEl);

    const isCE = editorEl.isContentEditable || editorEl.getAttribute("contenteditable") === "true";
    const isInput = editorEl.tagName === "TEXTAREA" || editorEl.tagName === "INPUT";

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
          newClause = item.findingText;
        }

        if (organLineRegex && organLineRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(organLineRegex, (fullMatch, prefix, content) => {
            let updatedContent = content;
            const normalParenchymaRegex = /(Nhu\s*mô\s*(?:đồng\s*nhất[,\s]*)?)(?:không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|đều[,\s]*không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|không\s*thấy\s*khối[^.]*|bình\s*thường[^.]*)(\.?)/i;
            if (normalParenchymaRegex.test(content)) {
              updatedContent = content.replace(normalParenchymaRegex, `Nhu mô ${newClause}$2`);
            } else if (content.includes("không to") || content.includes("hình thái, kích thước bình thường")) {
              updatedContent = content.replace(/Nhu\s*mô[^.]*\.?/i, `Nhu mô ${newClause}.`);
            } else {
              updatedContent = `${content.trim()} Nhu mô ${newClause}.`;
            }
            return `${prefix}${updatedContent}`;
          });
          modified = true;
        } else if (item.organ === "da_day") {
          // Nếu chưa có Dạ dày trong mẫu, chèn sau Lách hoặc Tụy
          const anchorPat = /(<p\b[^>]*>.*?(?:Lách|Lách|Tụy|Tụy).*?<\/p>)/i;
          if (anchorPat.test(bodyHTML)) {
            bodyHTML = bodyHTML.replace(anchorPat, `$1\n<p>-- <strong>Dạ dày:</strong> ${escapeHTML(item.findingText)}</p>`);
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

    const rawRightLung = rawRightLungLines.join(" ").trim();
    const htmlRightLung = escapeHTML(rawRightLung);
    const rawLeftLung = rawLeftLungLines.join(" ").trim();
    const htmlLeftLung = escapeHTML(rawLeftLung);
    const rawConclusion = rawConclusionLines.join(" ").trim();
    const htmlConclusion = escapeHTML(rawConclusion);

    let modified = false;

    if (isCE) {
      let html = editorEl.innerHTML.normalize("NFC");
      const footerIdx = html.search(/(?:<h1\b|<table\b)/i);
      let bodyHTML = footerIdx !== -1 ? html.slice(0, footerIdx) : html;
      const footerHTML = footerIdx !== -1 ? html.slice(footerIdx) : "";

      // 1. Phổi phải
      if (htmlRightLung) {
        const rightRegex = /(?:\s*<(?:b\b|strong\b|span\b)[^>]*>)?\s*(?:--|—|-)?\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?(?:<(?:b\b|strong\b|span\b)[^>]*>\s*)?Phổi\s*phải\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?:\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?[^<\n\r]*(?:<(?!br\b|\/p\b|\/div\b)[^>]*>[^<\n\r]*)*(?=(?:<br\s*\/?>|<\/p>|<\/div>|\n|$))/i;
        if (rightRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(rightRegex, () => htmlRightLung);
          modified = true;
        }
      }

      // 2. Phổi trái
      if (htmlLeftLung) {
        const leftRegex = /(?:\s*<(?:b\b|strong\b|span\b)[^>]*>)?\s*(?:--|—|-)?\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?(?:<(?:b\b|strong\b|span\b)[^>]*>\s*)?Phổi\s*trái\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?:\s*(?:<\/(?:b\b|strong\b|span\b)>\s*)?[^<\n\r]*(?:<(?!br\b|\/p\b|\/div\b)[^>]*>[^<\n\r]*)*(?=(?:<br\s*\/?>|<\/p>|<\/div>|\n|$))/i;
        if (leftRegex.test(bodyHTML)) {
          bodyHTML = bodyHTML.replace(leftRegex, () => htmlLeftLung);
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
          text = text.replace(rExp, () => rawRightLung);
          modified = true;
        }
      }
      if (rawLeftLung) {
        const lExp = /(?:--|—|-)?\s*Phổi\s*trái\s*:[^\n]*/i;
        if (lExp.test(text)) {
          text = text.replace(lExp, () => rawLeftLung);
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

  // =========================================================================
  // 4. TIẾN TRÌNH XỬ LÝ LỜI ĐỌC ĐIỆN THOẠI TRÊN TRANG RIS
  // =========================================================================
  async function processAndApplyDictation(dictationText) {
    if (!dictationText || !dictationText.trim()) return false;
    if (!isTabSelectedForFilling()) {
      console.log("[AutoRIS Content] Bỏ qua điền vì tab này chưa được tick chọn '🎯 Điền tab này'.");
      return false;
    }
    const cleanDictation = dictationText.normalize("NFC").trim();
    lastDictationText = cleanDictation;

    updateFloatingPreview(cleanDictation, null, "Đang phân bổ giải phẫu...");

    const storedConfig = await chrome.storage.local.get([
      STORAGE_KEYS.SMART_SYNTHESIZE,
      STORAGE_KEYS.AUTO_COPY,
      STORAGE_KEYS.PLAY_CHIME
    ]);
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
      const parsed = ClinicalSynthesizer.parseEditorSections(fullText);
      currentMota = parsed.mota;
      currentKetluan = parsed.ketluan;
    }

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

    let applied = false;
    if (editor) {
      saveUndoSnapshot(null, null, editor);
      applied = applySurgicalDictationToRISEditor(editor, synthesizedResult);
      if (applied && undoStack.length > 0) {
        undoStack[undoStack.length - 1].appliedVal = editor.isContentEditable ? editor.innerHTML : editor.value;
      }
    } else if (sep) {
      saveUndoSnapshot(sep.motaEl, sep.ketluanEl, null);
      if (sep.motaEl && synthesizedResult.mota) {
        sep.motaEl.value = synthesizedResult.mota;
        triggerInputEvents(sep.motaEl);
        applied = true;
      }
      if (sep.ketluanEl && synthesizedResult.ketluan) {
        sep.ketluanEl.value = synthesizedResult.ketluan;
        triggerInputEvents(sep.ketluanEl);
        applied = true;
      }
      if (applied && undoStack.length > 0) {
        undoStack[undoStack.length - 1].appliedMota = sep.motaEl ? sep.motaEl.value : null;
        undoStack[undoStack.length - 1].appliedKL = sep.ketluanEl ? sep.ketluanEl.value : null;
      }
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

  // =========================================================================
  // 5. HỆ THỐNG HOÀN TÁC (UNDO SYSTEM)
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
  // 6. THANH ĐIỀU KHIỂN NỔI (CHỈ HIỆN TRÊN TRANG RIS)
  // =========================================================================
  function createFloatingVoiceBar() {
    if (!isRISPage() || document.getElementById("autoris-floating-bar")) return;

    const bar = document.createElement("div");
    bar.id = "autoris-floating-bar";
    bar.className = "autoris-bar-container";
    bar.innerHTML = `
      <div class="autoris-bar-header" id="autoris-bar-drag">
        <div class="autoris-status-pill">
          <span class="autoris-dot" id="autoris-dot-status"></span>
          <span class="autoris-title">AutoRIS</span>
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
        <div class="autoris-preview-box" id="autoris-preview-text">
          <span style="color:#64748b;">🟢 Sẵn sàng nhận giọng nói từ điện thoại (AutoRIS ZipFormer)...</span>
        </div>
        <div class="autoris-controls">
          <button id="autoris-btn-apply" class="autoris-btn-primary" title="Điền lại câu này vào RIS">
            ✍️ Điền lại
          </button>
          <button id="autoris-btn-copy" class="autoris-btn-secondary" title="Sao chép toàn bộ kết quả vào Clipboard">
            📋 Copy
          </button>
          <button id="autoris-btn-undo" class="autoris-btn-secondary" title="Hoàn tác nội dung vừa điền (Ctrl+Z)">
            ↩️ Hoàn tác
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

    document.getElementById("autoris-btn-apply").addEventListener("click", () => {
      if (!chkTarget.checked) {
        userExplicitlyUnchecked = false;
        chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TARGET_TAB]: TAB_INSTANCE_ID });
        updateTabActiveUI(true);
      }
      if (lastDictationText) {
        processAndApplyDictation(lastDictationText);
      } else {
        showToast("ℹ️ Chưa có câu đọc nào từ điện thoại!");
      }
    });

    document.getElementById("autoris-btn-copy").addEventListener("click", async () => {
      let textToCopy = "";
      if (lastSynthesizedData) {
        if (lastSynthesizedData.mota && lastSynthesizedData.ketluan) {
          textToCopy = `${lastSynthesizedData.mota}\n\nKẾT LUẬN:\n${lastSynthesizedData.ketluan}`;
        } else {
          textToCopy = lastSynthesizedData.ketluan || lastSynthesizedData.mota || "";
        }
      }
      if (!textToCopy) {
        const previewEl = document.getElementById("autoris-preview-text");
        textToCopy = previewEl ? (previewEl.innerText || previewEl.textContent || "").trim() : "";
      }
      if (textToCopy) {
        await copyToClipboard(textToCopy);
        showToast("📋 Đã copy kết quả vào clipboard!");
      } else {
        showToast("ℹ️ Chưa có nội dung để sao chép!");
      }
    });

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
      chrome.storage.local.set({
        [STORAGE_KEYS.LAST_REPORT]: lastSynthesizedReport,
        [STORAGE_KEYS.LAST_REPORT_TIME]: Date.now()
      });
      btn.innerHTML = `✅ Đã điền vào RIS & Copy!`;
      btn.style.backgroundColor = "#38a169";
      showToast("📋 Đã đồng bộ sang RIS & copy vào clipboard (Ctrl+V)!");
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
            systemPrompt: config[STORAGE_KEYS.SYSTEM_PROMPT] || LUNG_RADS_SYSTEM_PROMPT,
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
      await copyToClipboard(synthesized);
      lastInputText = currentText;
      lastSynthesizedReport = synthesized;

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
          const applied = processAndApplyDictation(textToApply);
          sendResponse({ success: applied });
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
        if (report && reportTime > lastAppliedReportTime) {
          lastAppliedReportTime = reportTime;
          const editor = findRISEditor();
          if (editor) {
            applySynthesizedReportToRISEditor(editor, report);
            playChimeSound();
          }
          sendResponse({ received: true });
        }
      }
    });

    // Tự động kiểm tra báo cáo mới khi tab RIS được focus
    function checkLatestStorageReport() {
      if (!isExtensionValid() || !isTabSelectedForFilling()) return;
      try {
        chrome.storage.local.get([STORAGE_KEYS.LAST_REPORT, STORAGE_KEYS.LAST_REPORT_TIME], (res) => {
          const report = res[STORAGE_KEYS.LAST_REPORT];
          const time = res[STORAGE_KEYS.LAST_REPORT_TIME];
          if (report && time && time > lastAppliedReportTime && Date.now() - time < 900000) {
            lastAppliedReportTime = time;
            const editor = findRISEditor();
            if (editor) {
              applySynthesizedReportToRISEditor(editor, report);
              playChimeSound();
            }
          }
        });
      } catch (e) {}
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkLatestStorageReport();
    });
    window.addEventListener("focus", checkLatestStorageReport);

    // Khởi tạo Floating Bar
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
