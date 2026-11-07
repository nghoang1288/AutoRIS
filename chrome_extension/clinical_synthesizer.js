// clinical_synthesizer.js - Bộ xử lý phân bổ giải phẫu và tự sinh kết luận y khoa (AutoRIS)
(function (global) {
  "use strict";

  const ClinicalSynthesizer = {
    // Regex nhận diện mệnh đề nhiễu/rác thuần tuý
    _pureNoiseClause: /^(?:[.,;\s]*(?:bây\s+giờ|đây\s+này|đó\s+thôi|dừng\s+lại|được\s+rồi|bây|giờ|đây|này|đó|thôi|tôi|em|hết|xong|dừng|có|là|rồi|thì|ạ|nhé|nha|đấy|ừ|à|ờ)[.,;\s]*)+$/i,
    /**
     * Tách nội dung văn bản editor thành 3 phần: KỸ THUẬT, MÔ TẢ, KẾT LUẬN
     */
    parseEditorSections(rawText) {
      if (!rawText) return { kythuat: "", mota: "", ketluan: "", isUnified: false };
      const text = rawText.normalize("NFC").trim();

      const klRegex = /(?:^|\n)\s*(?:--|—|-)?\s*(?:KẾT\s*LUẬN|Kết\s*luận|KL|CHẨN\s*ĐOÁN)\s*[:：]?\s*/i;
      const mtRegex = /(?:^|\n)\s*(?:--|—|-)?\s*(?:MÔ\s*TẢ|Mô\s*tả)\s*[:：]?\s*/i;
      const ktRegex = /(?:^|\n)\s*(?:--|—|-)?\s*(?:KỸ\s*THUẬT|Kỹ\s*thuật)\s*[:：]?\s*/i;

      const hasKL = klRegex.test(text);
      const hasMT = mtRegex.test(text);

      if (!hasKL && !hasMT) {
        return { kythuat: "", mota: text, ketluan: "", isUnified: false };
      }

      let kythuat = "";
      let mota = "";
      let ketluan = "";

      let klIndex = -1;
      const klMatch = text.match(klRegex);
      if (klMatch) {
        klIndex = klMatch.index;
        let rawKL = text.slice(klIndex + klMatch[0].length).trim();
        const footerRegex = /(?:^|\n)\s*(?:Người\s*ký|Kỹ\s*thuật\s*viên|Bác\s*sĩ\s*đọc|Chữ\s*ký|Alt\s*\+\s*1|Alt\s*\+\s*2)[^\n]*/i;
        const footerMatch = rawKL.match(footerRegex);
        if (footerMatch) {
          rawKL = rawKL.slice(0, footerMatch.index).trim();
        }
        ketluan = rawKL;
      }

      const beforeKL = klIndex !== -1 ? text.slice(0, klIndex) : text;

      const mtMatch = beforeKL.match(mtRegex);
      if (mtMatch) {
        const mtIndex = mtMatch.index;
        mota = beforeKL.slice(mtIndex + mtMatch[0].length).trim();
        kythuat = beforeKL.slice(0, mtIndex).trim();
      } else {
        mota = beforeKL.trim();
      }

      return {
        kythuat,
        mota,
        ketluan,
        isUnified: true
      };
    },

    /**
     * Ghép lại nội dung hoàn chỉnh cho editor hợp nhất (Unified Editor)
     */
    assembleUnifiedReport(kythuat, mota, ketluan) {
      let result = "";
      if (kythuat) {
        result += `${kythuat.trim()}\n\n`;
      }
      result += `MÔ TẢ:\n${(mota || "").trim()}\n\n`;
      result += `KẾT LUẬN:\n${(ketluan || "").trim()}`;
      return result;
    },

    /**
     * Xóa các từ đệm, từ thừa khi nói tiếng Việt ở cuối câu
     */
    cleanFillerWords(text) {
      if (!text) return "";
      let result = text.normalize("NFC").trim();
      // Loại bỏ tiếng click / rác mở đầu câu
      result = result.replace(/^(?:[.,\s]*(?:đó|này|thì|à|ừ|ờ|dạ|vâng|rồi|xong)[.,\s]+)+/i, "");
      // Loại bỏ tiếng nhiễu quạt / hơi thở lặp lại ở cuối câu (bảo tồn cụm "vừa rồi")
      const trailingFillers = /(?:[.,\s]+(?:đây\s+này|đó\s+thôi|thế\s+thôi|vậy\s+thôi|thế\s+nhé|vậy\s+nhé|thế\s+nha|vậy\s+nha|bây\s+giờ|dừng\s+lại|được\s+rồi|đây|này|đó|thôi|tôi|em|hết|xong|dừng|có|là|(?<!vừa\s+)rồi|thì|ạ|nhé|nha|nhỉ|thế|vậy|đấy|ừ|à|ờ)[.,\s]*)+$/i;
      while (trailingFillers.test(result)) {
        result = result.replace(trailingFillers, "");
      }
      result = result.replace(/(?:[.,\s]+(?:đấy|đó|này|ạ|nhé|nha|nhỉ|thế|thôi)[.,\s]*)+$/i, "");
      return result.replace(/[.,?!]+$/, "").trim();
    },

    /**
     * Tách câu đọc của bác sĩ thành các tổn thương theo từng cơ quan riêng biệt
     */
    parseDictationOrgans(dictationText) {
      let clean = this.cleanFillerWords(dictationText);
      if (!clean) return [];

      // Hiệu chỉnh âm học giải phẫu nếu có lỗi nghe nhầm
      clean = clean
        .replace(/(?<![\p{L}\p{N}])(?:khai|khải|hai|hại)\s+phân\s+(?:thuỷ|thủy|thùy|thuỳ|thuy)(?![\p{L}\p{N}])/gui, "hạ phân thùy")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:tám|8)(?![\p{L}\p{N}])/gui, "hạ phân thùy VIII")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:bảy|7)(?![\p{L}\p{N}])/gui, "hạ phân thùy VII")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:sáu|6)(?![\p{L}\p{N}])/gui, "hạ phân thùy VI")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:năm|5)(?![\p{L}\p{N}])/gui, "hạ phân thùy V")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:bốn|tư|4)(?![\p{L}\p{N}])/gui, "hạ phân thùy IV")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:ba|3)(?![\p{L}\p{N}])/gui, "hạ phân thùy III")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:hai|2)(?![\p{L}\p{N}])/gui, "hạ phân thùy II")
        .replace(/(?<![\p{L}\p{N}])(?:hạ\s+phân\s+thùy|phân\s+thùy|hpt)\s+(?:một|1)(?![\p{L}\p{N}])/gui, "hạ phân thùy I");

      const pureNoiseClause = this._pureNoiseClause;

      // Tách thành các mệnh đề/câu dựa trên dấu chấm, phẩy, chấm phẩy, xuống dòng hoặc liên từ "và", loại bỏ các mệnh đề rác nhiễu
      const clauses = clean.split(/(?:[.;\n]+|\bvà\s+(?=(?:phổi|thận|gan|túi mật|dạ dày|tụy|lách|bàng quang|tiền liệt|tử cung|buồng trứng|ruột thừa|hạch|dịch)))/i)
                           .map(c => c.trim())
                           .filter(c => c && !pureNoiseClause.test(c));

      const organFindings = [];

      for (const clause of clauses) {
        const lower = clause.toLowerCase();

        // 1. Phổi phải
        if (lower.includes("phổi phải")) {
          const finding = clause.replace(/^.*?(?:phổi\s*phải|phổi\s*phải)\s*(?:có\s*)?/i, "").trim();
          organFindings.push({
            organ: "phoi_phai",
            label: "Phổi phải",
            lesionType: "tổn thương",
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 2. Phổi trái
        else if (lower.includes("phổi trái")) {
          const finding = clause.replace(/^.*?(?:phổi\s*trái|phổi\s*trái)\s*(?:có\s*)?/i, "").trim();
          organFindings.push({
            organ: "phoi_trai",
            label: "Phổi trái",
            lesionType: "tổn thương",
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 3. Hai phổi
        else if (lower.includes("hai phổi") || lower.includes("cả hai phổi") || lower.includes("2 phổi")) {
          const finding = clause.replace(/^.*?(?:hai|2|cả\s*hai)\s*phổi\s*(?:có\s*)?/i, "").trim();
          organFindings.push({
            organ: "phoi_phai",
            label: "Phổi phải",
            lesionType: "tổn thương",
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
          organFindings.push({
            organ: "phoi_trai",
            label: "Phổi trái",
            lesionType: "tổn thương",
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 4. Thận phải
        else if (lower.includes("thận phải")) {
          const finding = clause.replace(/^.*?(?:thận\s*phải|thận\s*phải)\s*(?:có\s*)?/i, "").trim();
          const lesionType = lower.includes("nang") ? "nang" : (lower.includes("sỏi") ? "sỏi" : "tổn thương");
          organFindings.push({
            organ: "than_phai",
            label: "Thận phải",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, ""),
            rawClause: clause
          });
        }
        // 5. Thận trái
        else if (lower.includes("thận trái")) {
          const finding = clause.replace(/^.*?(?:thận\s*trái|thận\s*trái)\s*(?:có\s*)?/i, "").trim();
          const lesionType = lower.includes("nang") ? "nang" : (lower.includes("sỏi") ? "sỏi" : "tổn thương");
          organFindings.push({
            organ: "than_trai",
            label: "Thận trái",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, ""),
            rawClause: clause
          });
        }
        // 6. Hai thận
        else if (lower.includes("hai thận") || lower.includes("2 thận") || lower.includes("cả hai thận")) {
          const finding = clause.replace(/^.*?(?:hai|2|cả\s*hai)\s*(?:thận|thận)\s*(?:có\s*)?/i, "").trim();
          const lesionType = lower.includes("nang") ? "nang" : (lower.includes("sỏi") ? "sỏi" : "tổn thương");
          organFindings.push({
            organ: "than_hai_ben",
            label: "Hai thận",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, ""),
            rawClause: clause
          });
        }
        // 7. Gan
        else if (lower.includes("gan") || lower.includes("hạ phân thùy") || lower.includes("hpt")) {
          let finding = clause;
          if (/^(?:nhu\s*mô\s*)?gan\s*(?:có\s*)?/i.test(finding)) {
            finding = finding.replace(/^(?:nhu\s*mô\s*)?gan\s*(?:có\s*)?/i, "").trim();
          } else if (/gan\s*(?:có\s*)?/i.test(finding) && !/^(?:hạ\s*phân\s*thùy|hpt|thùy)/i.test(finding)) {
            finding = finding.replace(/^.*?(?:nhu\s*mô\s*)?gan\s*(?:có\s*)?/i, "").trim();
          } else {
            finding = finding.replace(/\bgan\s*(?:có\s*)?/i, "").trim();
          }
          finding = finding.replace(/\b(nang|sỏi)\s+(nang|sỏi)\s+(lớn|nhỏ)\b/i, "$1, $2 $3");
          let lesionType = "tổn thương";
          if (lower.includes("nang")) lesionType = "nang";
          else if (lower.includes("u máu")) lesionType = "u máu";
          else if (lower.includes("vôi")) lesionType = "vôi hóa";
          else if (lower.includes("tăng âm")) lesionType = "nốt tăng âm";
          else if (lower.includes("giảm âm")) lesionType = "nốt giảm âm";
          else if (lower.includes("đồng âm")) lesionType = "nốt đồng âm";
          else if (lower.includes("u gan") || lower.includes("khối u")) lesionType = "khối u";

          organFindings.push({
            organ: "gan",
            label: "Gan",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, ""),
            rawClause: clause
          });
        }
        // 8. Tụy
        else if (lower.includes("tụy")) {
          const finding = clause.replace(/^.*?(?:nhu\s*mô\s*)?(?:tụy|tụy)\s*(?:có\s*)?/i, "").trim();
          let lesionType = "tổn thương";
          if (lower.includes("nang")) lesionType = "nang";
          else if (lower.includes("u")) lesionType = "khối u";
          else if (lower.includes("viêm")) lesionType = "viêm tụy";
          else if (lower.includes("vôi")) lesionType = "vôi hóa";
          organFindings.push({
            organ: "tuy",
            label: "Tụy",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 9. Lách
        else if (lower.includes("lách")) {
          const finding = clause.replace(/^.*?(?:nhu\s*mô\s*)?(?:lách|lách)\s*(?:có\s*)?/i, "").trim();
          let lesionType = "tổn thương";
          if (lower.includes("to")) lesionType = "lách to";
          else if (lower.includes("nang")) lesionType = "nang";
          else if (lower.includes("vôi")) lesionType = "vôi hóa";
          organFindings.push({
            organ: "lach",
            label: "Lách",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 10. Bàng quang
        else if (lower.includes("bàng quang")) {
          const finding = clause.replace(/^.*?(?:lòng\s*|thành\s*)?(?:bàng|bàng)\s*quang\s*(?:có\s*)?/i, "").trim();
          let lesionType = "tổn thương";
          if (lower.includes("sỏi")) lesionType = "sỏi";
          else if (lower.includes("dày thành") || lower.includes("dày")) lesionType = "dày thành";
          else if (lower.includes("polyp")) lesionType = "polyp";
          else if (lower.includes("u")) lesionType = "khối u";
          organFindings.push({
            organ: "bang_quang",
            label: "Bàng quang",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 11. Tuyến tiền liệt
        else if (lower.includes("tiền liệt")) {
          const finding = clause.replace(/^.*?(?:tuyến\s*tiền\s*liệt|tiền\s*liệt\s*tuyến|tuyến\s*tiền\s*liệt)\s*(?:có\s*)?/i, "").trim();
          let lesionType = "tổn thương";
          if (lower.includes("to") || lower.includes("phì đại")) lesionType = "phì đại";
          else if (lower.includes("vôi")) lesionType = "vôi hóa";
          organFindings.push({
            organ: "tuyen_tien_liet",
            label: "Tuyến tiền liệt",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, "") || clause,
            rawClause: clause
          });
        }
        // 12. Tử cung - Phần phụ
        else if (lower.includes("tử cung") || lower.includes("buồng trứng") || lower.includes("phần phụ")) {
          let lesionType = "tổn thương";
          if (lower.includes("u xơ")) lesionType = "u xơ";
          else if (lower.includes("nang")) lesionType = "nang";
          organFindings.push({
            organ: "tu_cung",
            label: "Tử cung & Phần phụ",
            lesionType: lesionType,
            findingText: clause,
            rawClause: clause
          });
        }
        // 13. Dịch ổ bụng / Khoang màng phổi (ưu tiên nhận diện dịch nếu có từ dịch)
        else if (lower.includes("dịch") || lower.includes("màng phổi")) {
          organFindings.push({
            organ: "dich",
            label: "Dịch tự do",
            lesionType: "tràn dịch",
            findingText: clause,
            rawClause: clause
          });
        }
        // 14. Ruột thừa / Hố chậu phải (khi không phải dịch)
        else if (lower.includes("ruột thừa") || lower.includes("hố chậu phải")) {
          organFindings.push({
            organ: "ruot_thua",
            label: "Ruột thừa",
            lesionType: "viêm ruột thừa",
            findingText: clause,
            rawClause: clause
          });
        }
        // 15. Hạch
        else if (lower.includes("hạch")) {
          organFindings.push({
            organ: "hach",
            label: "Hạch",
            lesionType: "hạch",
            findingText: clause,
            rawClause: clause
          });
        }
        // 16. Dạ dày
        else if (lower.includes("dạ dày") || lower.includes("hang vị") || lower.includes("môn vị")) {
          organFindings.push({
            organ: "da_day",
            label: "Dạ dày",
            lesionType: "dày thành",
            findingText: clause,
            rawClause: clause
          });
        }
        // 17. Túi mật
        else if (lower.includes("túi mật")) {
          const finding = clause.replace(/^.*?(?:túi|túi)\s*mật\s*(?:có\s*)?/i, "").trim();
          const lesionType = lower.includes("sỏi") ? "sỏi" : (lower.includes("polyp") ? "polyp" : "tổn thương");
          organFindings.push({
            organ: "tui_mat",
            label: "Túi mật",
            lesionType: lesionType,
            findingText: finding.replace(/^[.,;: ]+/, ""),
            rawClause: clause
          });
        }
        // 18. Khác
        else if (clause.trim().length > 3) {
          organFindings.push({
            organ: "khac",
            label: "Khác",
            lesionType: "tổn thương",
            findingText: clause,
            rawClause: clause
          });
        }
      }

      return organFindings;
    },

    /**
     * Tự động tổng hợp dòng KẾT LUẬN chuẩn xác y khoa:
     * - Luôn bắt đầu bằng 1 từ "Hình ảnh" duy nhất ở câu đầu tiên.
     * - Mỗi tổn thương là 1 câu riêng biệt, kết thúc bằng dấu chấm (.), chữ cái đầu viết hoa.
     *   Ví dụ: "Hình ảnh nang thận hai bên. Nang gan." (Không dùng dấu phẩy ghép)
     * - Không chứa kích thước chi tiết (kích thước chỉ nằm ở phần Mô tả).
     * - Tự động kế thừa các tổn thương từ ca/lần đọc trước đó nếu có trong editor.
     */
    synthesizeConclusion(organFindings, currentKetluan = "") {
      const pureNoiseClause = this._pureNoiseClause;
      const conclusions = [];

      // 1. Phân tích các tổn thương từ lần đọc hiện tại
      const hasRightCyst = organFindings.some(f => f.organ === "than_phai" && f.lesionType === "nang");
      const hasLeftCyst = organFindings.some(f => f.organ === "than_trai" && f.lesionType === "nang");
      const hasBothKidneyCyst = organFindings.some(f => f.organ === "than_hai_ben" && f.lesionType === "nang");

      const hasRightStone = organFindings.some(f => f.organ === "than_phai" && f.lesionType === "sỏi");
      const hasLeftStone = organFindings.some(f => f.organ === "than_trai" && f.lesionType === "sỏi");
      const hasBothKidneyStone = organFindings.some(f => f.organ === "than_hai_ben" && f.lesionType === "sỏi");

      // 1. Gan
      const liverFindings = organFindings.filter(f => f.organ === "gan");
      for (const lf of liverFindings) {
        const raw = (lf.rawClause || "").toLowerCase();
        if (lf.lesionType === "nang") {
          if (raw.includes("trái")) conclusions.push("nang gan trái");
          else if (raw.includes("phải")) conclusions.push("nang gan phải");
          else conclusions.push("nang gan");
        } else if (lf.lesionType === "u máu") {
          conclusions.push("u máu gan");
        } else if (lf.lesionType === "vôi hóa") {
          conclusions.push("vôi hóa gan");
        } else if (lf.lesionType === "nốt tăng âm") {
          const hptMatch = (lf.rawClause || "").match(/(?:hạ\s*phân\s*thùy|hpt)\s*(?:[1-8]|VIII|VII|VI|V|IV|III|II|I)\b/i);
          if (hptMatch) {
            const hptUpper = hptMatch[0].replace(/\b([ivx]+)\b/i, (_, rom) => rom.toUpperCase());
            conclusions.push(`nốt tăng âm ${hptUpper} gan`);
          } else {
            conclusions.push("nốt tăng âm gan");
          }
        } else if (lf.lesionType === "nốt giảm âm") {
          const hptMatch = (lf.rawClause || "").match(/(?:hạ\s*phân\s*thùy|hpt)\s*(?:[1-8]|VIII|VII|VI|V|IV|III|II|I)\b/i);
          if (hptMatch) {
            const hptUpper = hptMatch[0].replace(/\b([ivx]+)\b/i, (_, rom) => rom.toUpperCase());
            conclusions.push(`nốt giảm âm ${hptUpper} gan`);
          } else {
            conclusions.push("nốt giảm âm gan");
          }
        } else if (lf.lesionType === "khối u") {
          conclusions.push("khối u gan");
        }
      }

      // 2. Túi mật
      const tmFindings = organFindings.filter(f => f.organ === "tui_mat");
      for (const tf of tmFindings) {
        if (tf.lesionType === "sỏi") conclusions.push("sỏi túi mật");
        else if (tf.lesionType === "polyp") conclusions.push("polyp túi mật");
      }

      // 3. Tụy
      const pancreasFindings = organFindings.filter(f => f.organ === "tuy");
      for (const pf of pancreasFindings) {
        if (pf.lesionType === "nang") conclusions.push("nang tụy");
        else if (pf.lesionType === "khối u") conclusions.push("khối u tụy");
        else if (pf.lesionType === "viêm tụy") conclusions.push("viêm tụy");
      }

      // 4. Lách
      const spleenFindings = organFindings.filter(f => f.organ === "lach");
      for (const sf of spleenFindings) {
        if (sf.lesionType === "nang") conclusions.push("nang lách");
        else if (sf.lesionType === "vôi hóa") conclusions.push("vôi hóa lách");
        else conclusions.push("tổn thương lách");
      }

      // 5. Thận - Nang
      if ((hasRightCyst && hasLeftCyst) || hasBothKidneyCyst) {
        conclusions.push("nang thận hai bên");
      } else if (hasRightCyst) {
        conclusions.push("nang thận phải");
      } else if (hasLeftCyst) {
        conclusions.push("nang thận trái");
      }

      // 6. Thận - Sỏi
      if ((hasRightStone && hasLeftStone) || hasBothKidneyStone) {
        conclusions.push("sỏi thận hai bên");
      } else if (hasRightStone) {
        conclusions.push("sỏi thận phải");
      } else if (hasLeftStone) {
        conclusions.push("sỏi thận trái");
      }

      // Bàng quang
      const bladderFindings = organFindings.filter(f => f.organ === "bang_quang");
      for (const bf of bladderFindings) {
        if (bf.lesionType === "sỏi") conclusions.push("sỏi bàng quang");
        else if (bf.lesionType === "dày thành") conclusions.push("dày thành bàng quang");
        else if (bf.lesionType === "polyp") conclusions.push("polyp bàng quang");
        else if (bf.lesionType === "khối u") conclusions.push("khối u bàng quang");
        else conclusions.push(`tổn thương bàng quang`);
      }

      // Tuyến tiền liệt
      const prostateFindings = organFindings.filter(f => f.organ === "tuyen_tien_liet");
      for (const prof of prostateFindings) {
        if (prof.lesionType === "phì đại") conclusions.push("phì đại tuyến tiền liệt");
        else if (prof.lesionType === "vôi hóa") conclusions.push("vôi hóa tuyến tiền liệt");
        else conclusions.push(`tổn thương tuyến tiền liệt`);
      }

      // Tử cung - Phần phụ
      const uterusFindings = organFindings.filter(f => f.organ === "tu_cung");
      for (const uf of uterusFindings) {
        if (uf.lesionType === "u xơ") conclusions.push("u xơ tử cung");
        else if (uf.lesionType === "nang") conclusions.push("nang buồng trứng");
        else conclusions.push(uf.findingText.replace(/(?:đường\s*kính|kích\s*thước)\s*[\d,.\s]+(?:mm|cm)/gi, "").trim() || "tổn thương phần phụ");
      }

      // Ruột thừa
      const appFindings = organFindings.filter(f => f.organ === "ruot_thua");
      if (appFindings.length > 0) {
        conclusions.push("theo dõi viêm ruột thừa");
      }

      // Dịch ổ bụng / khoang màng phổi
      const fluidFindings = organFindings.filter(f => f.organ === "dich");
      for (const ff of fluidFindings) {
        const raw = (ff.rawClause || "").toLowerCase();
        if (raw.includes("màng phổi")) conclusions.push("tràn dịch màng phổi");
        else conclusions.push("dịch tự do ổ bụng");
      }

      // Hạch
      const lymphFindings = organFindings.filter(f => f.organ === "hach");
      if (lymphFindings.length > 0) {
        conclusions.push("hạch ổ bụng");
      }

      // Dạ dày
      const stomachFindings = organFindings.filter(f => f.organ === "da_day");
      if (stomachFindings.length > 0) {
        conclusions.push("dày thành hang - môn vị dạ dày");
      }

      // Các phát hiện khác
      const otherFindings = organFindings.filter(f => f.organ === "khac");
      for (const of of otherFindings) {
        const cleanText = of.findingText.replace(/(?:đường\s*kính|kích\s*thước)\s*[\d,.\s]+(?:mm|cm)/gi, "").trim();
        if (cleanText && !pureNoiseClause.test(cleanText) && cleanText.length > 3) {
          conclusions.push(cleanText);
        }
      }

      // 2. Kế thừa các tổn thương từ kết luận cũ trong editor nếu có (Tuyệt đối không kế thừa câu bình thường hoặc dòng chữ ký)
      const isNormal = !currentKetluan || /(?:chưa\s*thấy|không\s*thấy\s*bất\s*thường|không\s*thấy\s*tổn\s*thương|bình\s*thường|theo\s*dõi\s*lâm\s*sàng)/i.test(currentKetluan);
      if (!isNormal && currentKetluan.trim()) {
        const existingClauses = currentKetluan
          .split(/[.\n;]+/)
          .map(s => s.trim().replace(/^Hình\s*ảnh\s*/i, "").trim())
          .filter(s => s.length > 3 &&
                       !/(?:chưa\s*thấy|không\s*thấy|bình\s*thường|theo\s*dõi)/i.test(s) &&
                       !/(?:người\s*ký|kỹ\s*thuật\s*viên|bác\s*sĩ|alt\s*\+\s*1|alt\s*\+\s*2|chữ\s*ký)/i.test(s) &&
                       !pureNoiseClause.test(s));

        const newOrgans = new Set(organFindings.map(f => f.organ.startsWith("than") ? "than" : f.organ));
        const inherited = [];

        for (const ec of existingClauses) {
          const lower = ec.toLowerCase();
          let organOfClause = "khac";
          if (lower.includes("thận")) organOfClause = "than";
          else if (lower.includes("gan")) organOfClause = "gan";
          else if (lower.includes("túi mật") || lower.includes("túi mật")) organOfClause = "tui_mat";
          else if (lower.includes("dạ dày")) organOfClause = "da_day";
          else if (lower.includes("tụy") || lower.includes("tụy")) organOfClause = "tuy";
          else if (lower.includes("lách") || lower.includes("lách")) organOfClause = "lach";
          else if (lower.includes("bàng quang") || lower.includes("bàng quang")) organOfClause = "bang_quang";
          else if (lower.includes("tiền liệt") || lower.includes("tiền liệt")) organOfClause = "tuyen_tien_liet";
          else if (lower.includes("tử cung") || lower.includes("buồng trứng")) organOfClause = "tu_cung";
          else if (lower.includes("ruột thừa")) organOfClause = "ruot_thua";
          else if (lower.includes("dịch")) organOfClause = "dich";
          else if (lower.includes("hạch")) organOfClause = "hach";

          if (!newOrgans.has(organOfClause)) {
            if (!conclusions.some(c => c.toLowerCase() === lower)) {
              inherited.push(ec);
            }
          }
        }
        conclusions.unshift(...inherited);
      }

      if (conclusions.length === 0) {
        return "Hình ảnh theo dõi lâm sàng.";
      }

      // 3. Chuẩn hóa định dạng chuẩn y khoa:
      // "Hình ảnh [tổn thương 1]. [Tổn thương 2]. [Tổn thương 3]."
      return conclusions.map((c, idx) => {
        let clean = c.trim().replace(/^Hình\s*ảnh\s*/i, "").replace(/[.,]+$/, "").trim();
        clean = clean.replace(/\bHạ\s+phân\s+thùy\b/g, "hạ phân thùy")
                     .replace(/(?<=(?:hạ\s+phân\s+thùy|hpt)\s+)([ivx]+)(?![\p{L}\p{N}])/gui, (_, rom) => rom.toUpperCase());
        if (idx === 0) {
          const firstWordLower = clean.charAt(0).toLowerCase() + clean.slice(1);
          return `Hình ảnh ${firstWordLower}.`;
        } else {
          return `${clean.charAt(0).toUpperCase() + clean.slice(1)}.`;
        }
      }).join(" ");
    },

    /**
     * Thay thế phẫu thuật trong chuỗi văn bản mô tả (Mô tả dạng text thuần)
     */
    applyIntraLineToMotaText(currentMota, organFindings) {
      let mota = (currentMota || "").normalize("NFC").trim();

      for (const item of organFindings) {
        let newClause = "";
        let organRegex = null;

        if (item.organ === "than_phai") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Thận\s*phải|Thận\s*phải)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "than_trai") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Thận\s*trái|Thận\s*trái)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "than_hai_ben") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Hai\s*thận|Hai\s*thận)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "gan") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Gan|Nhu\s*mô\s*gan)\b\s*:?[^\n<]*/i;
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
        } else if (item.organ === "tui_mat") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Túi\s*mật|Túi\s*mật)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "tuy") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Tụy|Tụy|Nhu\s*mô\s*tụy)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "lach") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Lách|Lách|Nhu\s*mô\s*lách)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "bang_quang") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Bàng\s*quang|Bàng\s*quang)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "tuyen_tien_liet") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Tuyến\s*tiền\s*liệt|Tiền\s*liệt\s*tuyến)\b\s*:?[^\n<]*/i;
          newClause = `có ${item.findingText}`.replace(/^có\s+có\s*/i, "có ");
        } else if (item.organ === "tu_cung") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Tử\s*cung|Phần\s*phụ|Buồng\s*trứng)\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        } else if (item.organ === "ruot_thua") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Ruột\s*thừa|Hố\s*chậu\s*phải)\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        } else if (item.organ === "dich") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Dịch\s*(?:ổ\s*bụng|tự\s*do|màng\s*phổi))\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        } else if (item.organ === "hach") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Hạch|Hạch)\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        } else if (item.organ === "da_day") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*Dạ\s*dày\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        } else if (item.organ === "phoi_phai") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Phổi\s*phải|Phổi\s*phải)\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        } else if (item.organ === "phoi_trai") {
          organRegex = /(?:^|\n|<p\b[^>]*>)\s*(?:--|—|-)?\s*(?:<(?:\/)?(?:strong|b|span)[^>]*>)*\s*(?:Phổi\s*trái|Phổi\s*trái)\b\s*:?[^\n<]*/i;
          newClause = item.findingText;
        }

        if (organRegex && organRegex.test(mota)) {
          mota = mota.replace(organRegex, (fullLine) => {
            if (item.organ === "phoi_phai" || item.organ === "phoi_trai") {
              const normalLungRegex = /(?:trường\s*phổi\s*(?:sáng\s*đều[,\s]*)?)(?:không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|đều[,\s]*không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*)(\.?)/i;
              let cleanFinding = newClause.trim().replace(/[.,\s]+$/, "");
              if (normalLungRegex.test(fullLine)) {
                return fullLine.replace(normalLungRegex, `${cleanFinding}.`);
              } else if (/dày\s+tổ\s+chức\s+kẽ|giãn\s+phế\s+quản/i.test(fullLine)) {
                const organPrefix = fullLine.split(":")[0];
                return `${organPrefix}: ${cleanFinding}. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.`;
              } else {
                const organPrefix = fullLine.split(":")[0];
                return `${organPrefix}: ${cleanFinding}. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.`;
              }
            }

            const normalParenchymaRegex = /(Nhu\s*mô\s*(?:đồng\s*nhất[,\s]*)?)(?:không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|đều[,\s]*không\s*thấy\s*(?:khối|tổn\s*thương)[^.]*|không\s*thấy\s*khối[^.]*|bình\s*thường[^.]*)(\.?)/i;
            if (normalParenchymaRegex.test(fullLine)) {
              return fullLine.replace(normalParenchymaRegex, (match, p1, p2) => {
                const isLower = p1.trim().startsWith("nhu");
                const prefix = isLower ? "nhu mô " : "Nhu mô ";
                return `${prefix}${newClause}${p2}`;
              });
            } else if (fullLine.includes("không to") || fullLine.includes("hình thái, kích thước bình thường")) {
              return fullLine.replace(/Nhu\s*mô[^.]*\.?/i, `Nhu mô ${newClause}.`);
            } else {
              const organPrefix = fullLine.split(":")[0];
              return `${organPrefix}: ${newClause}.`;
            }
          });
        } else {
          // Bổ sung dòng mới trước KẾT LUẬN nếu mẫu chưa có cơ quan này (chống mất dữ liệu)
          const klIndex = mota.search(/(?:^|\n)\s*(?:--|—|-)?\s*KẾT\s*LUẬN\s*:/i);
          const organContent = (item.organ === "phoi_phai" || item.organ === "phoi_trai")
            ? `${(item.findingText || newClause).trim().replace(/[.,\s]+$/, "")}. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.`
            : (item.findingText || newClause);
          const organLine = `\n-- ${item.label}: ${organContent}\n`;
          if (klIndex !== -1) {
            mota = mota.slice(0, klIndex) + organLine + mota.slice(klIndex);
          } else {
            mota = mota + organLine;
          }
        }
      }

      return mota;
    },

    /**
     * Bộ quy tắc cục bộ (Deterministic Rule-Based Fallback)
     * Đảm bảo không mất dữ liệu ngay cả khi mất mạng hoặc không dùng AI
     */
    localDeterministicFallback(currentMota, currentKetluan, dictationText) {
      const cleanDictation = this.cleanFillerWords(dictationText);
      const findings = this.parseDictationOrgans(cleanDictation);
      const generatedConclusion = this.synthesizeConclusion(findings, currentKetluan);
      const updatedMota = this.applyIntraLineToMotaText(currentMota, findings);

      const organSummaries = findings.map(f => f.label).join(" & ");

      return {
        organs: findings,
        mota: updatedMota,
        ketluan: generatedConclusion,
        summary: organSummaries ? `Cập nhật ${organSummaries}` : "Cập nhật kết quả lâm sàng"
      };
    },

    /**
     * TỪ ĐIỂN KHÁNG LỆNH LÂM SÀNG (Clinical Immunity Whitelist)
     * Ngăn chặn tuyệt đối việc hiểu nhầm thuật ngữ y khoa thành câu lệnh điều khiển.
     */
    isClinicalImmuneText(text) {
      if (!text) return false;
      const lower = text.toLowerCase();
      const immunityPatterns = [
        // Chuyển (CT / MRI / Bệnh học)
        /chuyển\s+dạng\s+xuất\s+huyết/i,
        /chuyển\s+dạng\s+ác\s+tính/i,
        /chuyển\s+vị\s+đại\s+động\s+mạch/i,
        /chuyển\s+vị\s+phủ\s+tạng/i,
        /vùng\s+chuyển\s+tiếp/i,
        /chuyển\s+giai\s+đoạn/i,
        /chuyển\s+dạ/i,
        /chuyển\s+máu/i,
        /chuyển\s+chỗ/i,
        /situs\s+inversus/i,

        // Xóa (CT / MRI / DSA / X-quang)
        /xung\s+xóa\s+mỡ/i,
        /xóa\s+mỡ/i,
        /xóa\s+nền/i,
        /chụp\s+mạch\s+xóa\s+nền/i,
        /xóa\s+(?:mờ\s+)?(?:góc\s+sườn\s+hoành|bờ\s+tim|vòm\s+hoành|rãnh\s+cuộn\s+não|nhân\s+đậu|rãnh\s+sylvius)/i,
        /xóa\s+(?:cấu\s+trúc|ranh\s+giới|xoang\s+thận|khoang\s+dưới\s+nhện|bể\s+não|bể\s+đáy)/i,
        /dấu\s+hiệu\s+xóa\s+bờ/i,
        /silhouette\s+sign/i,

        // Cắt (CT / Phẫu thuật / Lát cắt)
        /cắt\s+lớp\s+vi\s+tính/i,
        /cắt\s+lớp/i,
        /lát\s+cắt\s+(?:mỏng|ngang|đứng\s+dọc|đứng\s+ngang|axial|sagittal|coronal)/i,
        /(?:phẫu\s*thuật|đã|tiền\s*sử)\s+(?:cắt\s+bỏ|bỏ|cắt)/i,

        // Thay (Chấn thương chỉnh hình / Cột sống / Tim mạch)
        /thay\s+đĩa\s+đệm/i,
        /thay\s+khớp\s+(?:háng|gối|vai|nhân\s+tạo)/i,
        /thay\s+chỏm\s+xương\s+đùi/i,
        /thay\s+van\s+(?:hai\s+lá|ba\s+lá|động\s+mạch\s+chủ|động\s+mạch\s+phổi)/i,
        /thay\s+đổi\s+(?:tín\s+hiệu|tỷ\s+trọng|đậm\s+độ|thoái\s+hóa|viêm|sợi\s+bọc|hình\s+dạng|modic)/i,

        // Thoát / Chèn (Thần kinh / Cột sống)
        /thoát\s+vị\s+(?:đĩa\s+đệm|não|qua\s+lều|hoành|bẹn|thành\s+bụng)/i,
        /chèn\s+ép\s+(?:bao\s+màng\s+cứng|rễ\s+thần\s+kinh|tủy\s+sống|não\s+thất|đường\s+giữa)/i,

        // Thải / Bỏ (Động học ngấm thuốc CT/MRI)
        /thải\s+thuốc/i,
        /wash-?out/i,
        /không\s+ngấm\s+thuốc/i,
        /ngấm\s+thuốc\s+dạng\s+viền/i,
        /bỏ\s+sót/i,

        // Thêm
        /thêm\s+(?:một|vài|nhiều)?\s*(?:nốt|ổ|khối|tổn\s+thương|sỏi|hạch)/i,

        // Tái tạo
        /tái\s+tạo\s+(?:đa\s+bình\s+diện|mpr|mip|3d|vrt)/i,
        /dây\s+chằng\s+đã\s+tái\s+tạo/i
      ];
      return immunityPatterns.some(p => p.test(lower));
    },

    /**
     * BỘ THƯ KÝ Y KHOA - TẦNG 1: LOCAL DETERMINISTIC ENGINE (<5ms)
     * Áp dụng thuật toán 4 lớp Quad-Layer Disambiguator
     */
    isSecretaryCommand(dictationText) {
      if (!dictationText) return false;
      let clean = this.cleanFillerWords(dictationText).trim();
      let lower = clean.toLowerCase();
      if (!lower) return false;

      // Lớp 1: Explicit Prefix Gate (e.g. "Thư ký: ...", "Lệnh: ...", "AutoRIS: ...")
      const prefixMatch = lower.match(/^(?:thư\s*ký|autoris|lệnh|lệnh\s*thư\s*ký)[:\s,]+(.*)$/i);
      if (prefixMatch) {
        lower = prefixMatch[1].trim();
        clean = clean.slice(clean.length - lower.length).trim();
      }

      // Lớp 2: Clinical Immunity Whitelist (Nếu là thuật ngữ y khoa đặc thù -> KHÔNG PHẢI LỆNH)
      if (this.isClinicalImmuneText(lower)) {
        return false;
      }

      // Lớp 3: Syntactic Pattern Matcher

      // 3.1. Lệnh ngắt dòng & định dạng
      if (/^(?:xuống\s*dòng|sang\s*dòng\s*mới|ngắt\s*dòng|gạch\s*đầu\s*dòng|dấu\s*chấm|dấu\s*phẩy|chấm|phẩy)$/i.test(lower)) {
        return true;
      }

      // 3.2. Lệnh điều hướng trường: "Mô tả: ...", "Kết luận: ..."
      if (/^(?:mô\s*tả|phần\s*mô\s*tả)\s*:\s*.+$/i.test(lower)) return true;
      if (/^(?:kết\s*luận|phần\s*kết\s*luận)\s*:\s*.+$/i.test(lower)) return true;

      // 3.3. Lệnh hoàn tác
      if (/^(?:hoàn\s*tác|quay\s*lại|undo)$/i.test(lower)) return true;

      // 3.4. Lệnh chuyển đoạn/câu sang kết luận
      if (/^(?:chuyển|đưa)\s+(?:câu|đoạn|dòng)?\s*(?:vừa\s*(?:rồi|đọc)|cuối|gần\s*nhất)?\s*(?:sang|xuống|vào)\s+kết\s*luận/i.test(lower)) return true;

      // 3.5. Lệnh sửa câu vừa rồi: "sửa câu vừa rồi thành...", "sửa đoạn vừa đọc thành..."
      if (/^(?:sửa|đổi)\s+(?:câu|đoạn|dòng)\s+(?:vừa\s*(?:rồi|đọc)|cuối|gần\s*nhất)\s*(?:thành|bằng|là)?\s*.+$/i.test(lower)) return true;

      // 3.6. Lệnh thay thế: thay/đổi/sửa [từ A] bằng/thành [từ B]
      if (/^(?:thay|đổi|sửa)\s+(?:từ|chữ|cụm\s*từ)?\s*.+?\s+(?:bằng|thành)\s+.+$/i.test(lower)) return true;

      // 3.7. Lệnh xóa câu vừa rồi / xóa dòng cuối
      if (/^(?:xóa|xoá|bỏ)\s+(?:câu|đoạn|dòng|từ|chữ)\s+(?:vừa\s*(?:rồi|đọc)?|cuối|gần\s*nhất)$/i.test(lower)) return true;

      // 3.8. Lệnh xóa dòng / xóa cơ quan / xóa kết luận / xóa hết
      if (/^(?:xóa|xoá|bỏ)\s+(?:dòng|phần|mục|đoạn|kết\s*luận|mô\s*tả|toàn\s*bộ|hết|tất\s*cả|sạch)\b/i.test(lower)) return true;
      if (/^(?:xóa|xoá|bỏ)\s+(?:phổi\s*phải|phổi\s*trái|hai\s*phổi|thận\s*phải|thận\s*trái|hai\s*thận|gan|tụy|lách|bàng\s*quang|tiền\s*liệt|tử\s*cung|buồng\s*trứng|ruột\s*thừa|hạch|dịch|màng\s*phổi|dạ\s*dày|túi\s*mật)\b/i.test(lower)) return true;

      // 3.9. Lệnh mẫu bình thường
      if (/^mẫu\s+(?:ngực|phổi|bụng|sọ\s*não|não|tiêu\s*hóa|tiết\s*niệu)\s*bình\s*thường/i.test(lower)) return true;
      if (/^(?:tất\s*cả|toàn\s*bộ)\s*bình\s*thường$/i.test(lower)) return true;

      // 3.10. Lệnh chèn thêm
      if (/^(?:thêm|chèn)\s+vào\s+(?:phần|mục|dòng)?\s*.+?:?\s*.+$/i.test(lower)) return true;

      // Lớp 4: Mặc định an toàn là Clinical Content
      return false;
    },

    executeSecretaryCommand(currentMota = "", currentKetluan = "", commandText = "") {
      let clean = this.cleanFillerWords(commandText).trim();
      let lower = clean.toLowerCase();

      // Bóc tách Explicit Prefix nếu có
      const prefixMatch = lower.match(/^(?:thư\s*ký|autoris|lệnh|lệnh\s*thư\s*ký)[:\s,]+(.*)$/i);
      if (prefixMatch) {
        lower = prefixMatch[1].trim();
        clean = clean.slice(clean.length - lower.length).trim();
      }

      // Case 1: Lệnh Hoàn tác (Undo)
      if (/^(?:hoàn\s*tác|quay\s*lại|undo)$/i.test(lower)) {
        return {
          handled: true,
          action: "undo",
          mota: currentMota,
          ketluan: currentKetluan,
          summary: "Hoàn tác thao tác trước"
        };
      }

      // Case 2: Lệnh ngắt dòng & định dạng
      if (/^(?:xuống\s*dòng|sang\s*dòng\s*mới|ngắt\s*dòng)$/i.test(lower)) {
        const updatedMota = currentMota ? (currentMota.endsWith("\n") ? currentMota + "\n" : currentMota + "\n\n") : "\n";
        return {
          handled: true,
          action: "new_line",
          mota: updatedMota,
          ketluan: currentKetluan,
          summary: "Xuống dòng mới"
        };
      }
      if (/^gạch\s*đầu\s*dòng$/i.test(lower)) {
        const prefix = currentMota && !currentMota.endsWith("\n") ? "\n- " : "- ";
        return {
          handled: true,
          action: "bullet",
          mota: (currentMota || "") + prefix,
          ketluan: currentKetluan,
          summary: "Thêm gạch đầu dòng"
        };
      }
      if (/^(?:dấu\s*chấm|chấm)$/i.test(lower)) {
        return {
          handled: true,
          action: "punctuation",
          mota: currentMota ? currentMota.trimEnd() + ". " : ". ",
          ketluan: currentKetluan,
          summary: "Thêm dấu chấm"
        };
      }
      if (/^(?:dấu\s*phẩy|phẩy)$/i.test(lower)) {
        return {
          handled: true,
          action: "punctuation",
          mota: currentMota ? currentMota.trimEnd() + ", " : ", ",
          ketluan: currentKetluan,
          summary: "Thêm dấu phẩy"
        };
      }

      // Case 3: Lệnh Điều hướng trường: "Mô tả: ...", "Kết luận: ..."
      const navMotaMatch = clean.match(/^(?:mô\s*tả|phần\s*mô\s*tả)\s*:\s*([\s\S]+)$/i);
      if (navMotaMatch) {
        let addedContent = navMotaMatch[1].trim();
        if (addedContent && !/[.!?]$/.test(addedContent)) addedContent += ".";
        let updatedMota = currentMota ? currentMota.trim() + "\n" + addedContent : addedContent;
        return {
          handled: true,
          action: "navigate_mota",
          mota: updatedMota,
          ketluan: currentKetluan,
          summary: "Thêm nội dung vào Mô tả"
        };
      }

      const navKetluanMatch = clean.match(/^(?:kết\s*luận|phần\s*kết\s*luận)\s*:\s*([\s\S]+)$/i);
      if (navKetluanMatch) {
        const addedContent = navKetluanMatch[1].trim();
        let updatedKetluan = currentKetluan ? currentKetluan.trim() + " " + addedContent : addedContent;
        if (!updatedKetluan.endsWith(".")) updatedKetluan += ".";
        return {
          handled: true,
          action: "navigate_ketluan",
          mota: currentMota,
          ketluan: updatedKetluan,
          summary: "Cập nhật vào Kết luận"
        };
      }

      // Case 4: Lệnh Chuyển đoạn/câu sang kết luận
      if (/^(?:chuyển|đưa)\s+(?:câu|đoạn|dòng)?\s*(?:vừa\s*(?:rồi|đọc)|cuối|gần\s*nhất)?\s*(?:sang|xuống|vào)\s+kết\s*luận/i.test(lower)) {
        if (!currentMota) {
          return { handled: true, action: "move_to_conclusion", mota: currentMota, ketluan: currentKetluan, summary: "Mô tả rỗng, không có đoạn cuối để chuyển" };
        }
        const lines = currentMota.split("\n").filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          const lastLine = lines.pop().trim();
          let newKetluanClause = lastLine.replace(/^[-*•]\s*/, "").replace(/^.*:\s*/, "").trim();
          if (newKetluanClause) {
            newKetluanClause = newKetluanClause.charAt(0).toUpperCase() + newKetluanClause.slice(1);
            if (!newKetluanClause.endsWith(".")) newKetluanClause += ".";
          }
          const updatedMota = lines.join("\n");
          let updatedKetluan = currentKetluan ? currentKetluan.trim() + " " + newKetluanClause : newKetluanClause;
          return {
            handled: true,
            action: "move_to_conclusion",
            mota: updatedMota,
            ketluan: updatedKetluan,
            summary: "Đã chuyển đoạn cuối mô tả sang Kết luận"
          };
        }
      }

      // Case 5: Lệnh Sửa câu vừa rồi thành...
      const editLastSentenceMatch = clean.match(/^(?:sửa|đổi)\s+(?:câu|đoạn|dòng)\s+(?:vừa\s*(?:rồi|đọc)|cuối|gần\s*nhất)\s*(?:thành|bằng|là)?\s*([\s\S]+)$/i);
      if (editLastSentenceMatch) {
        const replacement = editLastSentenceMatch[1].trim();
        let updatedMota = currentMota;
        if (updatedMota) {
          const lines = updatedMota.split("\n");
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim()) {
              // Nếu dòng có tiền tố cơ quan (e.g. "- Gan: ..."), bảo tồn tiền tố
              const prefixOrgan = lines[i].match(/^([-*•]?\s*[^:]+:\s*)/);
              if (prefixOrgan) {
                lines[i] = prefixOrgan[1] + replacement;
              } else {
                lines[i] = replacement;
              }
              break;
            }
          }
          updatedMota = lines.join("\n");
        } else {
          updatedMota = replacement;
        }
        return {
          handled: true,
          action: "edit_last_sentence",
          mota: updatedMota,
          ketluan: currentKetluan,
          summary: "Đã sửa câu vừa rồi"
        };
      }

      // Case 6: Lệnh Xóa câu vừa rồi / Xóa dòng cuối
      if (/^(?:xóa|xoá|bỏ)\s+(?:câu|đoạn|dòng|từ|chữ)\s+(?:vừa\s*(?:rồi|đọc)|cuối|gần\s*nhất)$/i.test(lower)) {
        let updatedMota = currentMota;
        if (updatedMota) {
          const lines = updatedMota.split("\n");
          while (lines.length > 0 && !lines[lines.length - 1].trim()) {
            lines.pop();
          }
          if (lines.length > 0) {
            lines.pop();
          }
          updatedMota = lines.join("\n").trim();
        }
        return {
          handled: true,
          action: "delete_last_line",
          mota: updatedMota,
          ketluan: currentKetluan,
          summary: "Đã xóa dòng cuối vừa đọc"
        };
      }

      // Case 7: Lệnh Xóa toàn bộ / Xóa hết
      if (/^(?:xóa|xoá|bỏ)\s+(?:toàn\s*bộ|hết|tất\s*cả|sạch)$/i.test(lower)) {
        return {
          handled: true,
          action: "delete_all",
          mota: "",
          ketluan: "",
          summary: "Đã xóa toàn bộ nội dung"
        };
      }

      // Case 8: Lệnh Xóa kết luận
      if (/^(?:xóa|xoá|bỏ)\s+(?:phần\s*)?kết\s*luận$/i.test(lower)) {
        return {
          handled: true,
          action: "delete_conclusion",
          mota: currentMota,
          ketluan: "Hình ảnh theo dõi lâm sàng.",
          summary: "Đã xóa kết luận"
        };
      }

      // Case 9: Lệnh Xóa dòng cơ quan / Xóa tổn thương cơ quan
      const deleteOrganMatch = lower.match(/^(?:xóa|xoá|bỏ)\s+(?:dòng|phần|mục)?\s*(phổi\s*phải|phổi\s*trái|hai\s*phổi|thận\s*phải|thận\s*trái|hai\s*thận|gan|tụy|lách|bàng\s*quang|tiền\s*liệt|tử\s*cung|buồng\s*trứng|ruột\s*thừa|hạch|dịch|màng\s*phổi|dạ\s*dày|túi\s*mật)/i);
      if (deleteOrganMatch) {
        const targetOrganStr = deleteOrganMatch[1].trim();
        let updatedMota = currentMota;

        // Reset hoặc xóa dòng cơ quan trong mô tả
        const lines = updatedMota.split("\n");
        const newLines = [];

        for (const line of lines) {
          const lLower = line.toLowerCase();
          if (lLower.includes(targetOrganStr)) {
            // Nếu là dòng cấu trúc mẫu (e.g. - Nhu mô phổi phải: ...), reset về chuẩn bình thường
            if (/nhu\s*mô\s*phổi\s*phải/i.test(lLower)) {
              newLines.push("- Nhu mô phổi phải: Thông khí tốt, không thấy tổn thương khu trú.");
            } else if (/nhu\s*mô\s*phổi\s*trái/i.test(lLower)) {
              newLines.push("- Nhu mô phổi trái: Thông khí tốt, không thấy tổn thương khu trú.");
            } else if (/thận\s*phải/i.test(lLower)) {
              newLines.push("- Thận phải: Nhu mô dày đều, không sỏi, không ứ nước.");
            } else if (/thận\s*trái/i.test(lLower)) {
              newLines.push("- Thận trái: Nhu mô dày đều, không sỏi, không ứ nước.");
            } else if (/gan/i.test(lLower)) {
              newLines.push("- Gan: Kích thước bình thường, bờ đều, nhu mô đồng nhất, không nốt khu trú.");
            } else if (/túi\s*mật/i.test(lLower)) {
              newLines.push("- Túi mật: Thành mỏng, lòng dịch trong, không sỏi.");
            } else if (/bàng\s*quang/i.test(lLower)) {
              newLines.push("- Bàng quang: Thành mỏng, lòng dịch trong, không sỏi.");
            } else if (/ruột\s*thừa/i.test(lLower)) {
              newLines.push("- Ruột thừa: Không thấy hình ảnh bất thường vùng hố chậu phải.");
            } else {
              // Bỏ dòng hoàn toàn nếu là dòng bổ sung khác
            }
          } else {
            newLines.push(line);
          }
        }
        updatedMota = newLines.join("\n");

        // Loại bỏ tổn thương cơ quan đó khỏi kết luận
        let updatedKetluan = currentKetluan;
        if (updatedKetluan) {
          const clauses = updatedKetluan.split(/[.\n;]+/).map(c => c.trim()).filter(Boolean);
          const filteredClauses = clauses.filter(c => !c.toLowerCase().includes(targetOrganStr));
          if (filteredClauses.length === 0) {
            updatedKetluan = "Hình ảnh theo dõi lâm sàng.";
          } else {
            updatedKetluan = filteredClauses.map((c, i) => {
              const cleanC = c.replace(/^Hình\s*ảnh\s*/i, "").trim();
              if (i === 0) return `Hình ảnh ${cleanC.charAt(0).toLowerCase() + cleanC.slice(1)}.`;
              return `${cleanC.charAt(0).toUpperCase() + cleanC.slice(1)}.`;
            }).join(" ");
          }
        }

        return {
          handled: true,
          action: "delete_organ",
          mota: updatedMota,
          ketluan: updatedKetluan,
          summary: `Đã xóa dòng ${targetOrganStr}`
        };
      }

      // Case 10: Lệnh Thay thế từ khóa (Replace)
      const replaceMatch = clean.match(/^(?:thay|đổi|sửa)\s+(?:từ|chữ|cụm\s*từ)?\s*["'“]?(.+?)["'”]?\s+(?:bằng|thành)\s+["'“]?(.+?)["'”]?$/i);
      if (replaceMatch) {
        const oldTerm = replaceMatch[1].trim();
        const newTerm = replaceMatch[2].trim();

        if (oldTerm && newTerm) {
          const regex = new RegExp(oldTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
          const updatedMota = currentMota.replace(regex, newTerm);
          const updatedKetluan = currentKetluan.replace(regex, newTerm);

          return {
            handled: true,
            action: "replace_text",
            mota: updatedMota,
            ketluan: updatedKetluan,
            summary: `Đã thay "${oldTerm}" thành "${newTerm}"`
          };
        }
      }

      // Case 11: Lệnh Mẫu bình thường (Đa phương tiện: Siêu âm, CT, MRI, X-quang)
      if (/^mẫu\s+(?:ct\s*sọ\s*não|sọ\s*não\s*ct|ct\s*não)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Nhu mô não: Không thấy ổ giảm hoặc tăng tỷ trọng bất thường trước và sau tiêm thuốc cản quang.\n- Cấu trúc đường giữa: Cân đối, không đè đẩy hay di lệch.\n- Não thất: Hệ thống não thất hai bên, não thất III và IV kích thước và hình thái bình thường.\n- Khoang dưới nhện: Các rãnh cuộn não và bể não hai bên thông thoáng, không thấy tụ máu.\n- Xương sọ: Không thấy đường nứt hay gãy vỡ xương vòm sọ và nền sọ.`,
          ketluan: `Hình ảnh cắt lớp vi tính sọ não hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu CT sọ não bình thường`
        };
      }
      if (/^mẫu\s+(?:mri\s*sọ\s*não|cht\s*sọ\s*não|sọ\s*não\s*mri)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Nhu mô đại não và tiểu não: Tín hiệu đồng nhất trên các chuỗi xung T1W, T2W, FLAIR. Không thấy tổn thương hạn chế khuếch tán trên DWI/ADC.\n- Đường giữa: Cân đối, không di lệch.\n- Hệ thống não thất và khoang dưới nhện: Kích thước và hình dạng bình thường, không giãn, không ứ trệ dịch.\n- Vùng tuyến yên và góc cầu tiểu não: Hai bên bình thường, không thấy khối choán chỗ.\n- Các xoang tĩnh mạch màng cứng: Bình thường, tín hiệu dòng chảy thông thoáng.`,
          ketluan: `Hình ảnh cộng hưởng từ sọ não hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu MRI sọ não bình thường`
        };
      }
      if (/^mẫu\s+(?:mri\s*cột\s*sống\s*thắt\s*lưng|cột\s*sống\s*thắt\s*lưng|mri\s*cột\s*sống)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Đường cong sinh lý cột sống thắt lưng: Trong giới hạn bình thường.\n- Thân đốt sống: Chiều cao và tín hiệu tủy xương các thân đốt sống từ L1 đến S1 bình thường, không xẹp trượt.\n- Đĩa đệm: Chiều cao và tín hiệu các đĩa đệm bình thường, không thấy phồng hay thoát vị đĩa đệm.\n- Ống sống và lỗ tiếp hợp: Đường kính trước sau ống sống bình thường, các lỗ tiếp hợp hai bên thông thoáng, không chèn ép bao màng cứng hay rễ thần kinh.\n- Tủy cùng và chùm đuôi ngựa: Bình thường.`,
          ketluan: `Hình ảnh cộng hưởng từ cột sống thắt lưng hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu MRI cột sống thắt lưng bình thường`
        };
      }
      if (/^mẫu\s+(?:mri\s*khớp\s*gối|khớp\s*gối\s*mri|mri\s*gối)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Dây chằng chéo trước và sau: Tín hiệu liên tục, hướng đi bình thường, không thấy đứt rách.\n- Dây chằng bên trong và bên ngoài: Bình thường, không phù nề quanh dây chằng.\n- Sụn chêm trong và ngoài: Hình thái và tín hiệu bình thường, không thấy đường rách chạm mặt khớp.\n- Sụn khớp và xương dưới sụn: Bề mặt sụn đều, không thấy khuyết sụn hay phù tủy xương.\n- Ổ khớp và túi cùng hoạt dịch: Không thấy tràn dịch bất thường.`,
          ketluan: `Hình ảnh cộng hưởng từ khớp gối hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu MRI khớp gối bình thường`
        };
      }
      if (/^mẫu\s+(?:ct\s*bụng|clvt\s*bụng|ct\s*ổ\s*bụng)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Gan: Kích thước bình thường, tỷ trọng đồng nhất, ngấm thuốc cản quang đều qua các thì, không thấy khối khu trú.\n- Đường mật và túi mật: Không giãn, túi mật thành mỏng, không thấy sỏi tăng tỷ trọng.\n- Tụy và lách: Hình thái, kích thước và ngấm thuốc bình thường, ống tụy không giãn.\n- Hai tuyến thượng thận: Cân đối hai bên, không thấy khối u.\n- Hai thận: Vị trí bình thường, bài tiết thuốc cản quang tốt, không sỏi, không ứ nước.\n- Ống tiêu hóa: Không thấy dày thành bất thường hay tắc ruột.\n- Khoang phúc mạc và sau phúc mạc: Không thấy dịch tự do, không thấy hạch to bệnh lý.`,
          ketluan: `Hình ảnh cắt lớp vi tính ổ bụng - tiểu khung hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu CT bụng bình thường`
        };
      }
      if (/^mẫu\s+(?:x\s*[-]?\s*quang(?:\s*tim\s*phổi|\s*ngực|\s*phổi)?|tim\s*phổi|xquang)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Phế trường hai bên: Sáng đều, không thấy tổn thương dạng đám mờ hay nốt mờ khu trú.\n- Rốn phổi hai bên: Đậm độ và kích thước bình thường.\n- Bóng tim: Kích thước bình thường, chỉ số tim - lồng ngực < 0.5.\n- Vòm hoành hai bên đều, các góc sườn hoành sáng nhọn.\n- Khung xương lồng ngực: Cân đối, không gãy vỡ xương sườn.`,
          ketluan: `Hình ảnh X-quang tim phổi hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu X-quang tim phổi bình thường`
        };
      }
      if (/^mẫu\s+(?:ngực|phổi|lồng\s*ngực)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Nhu mô phổi hai bên: Thông khí tốt, không thấy nốt mờ hay đám mờ khu trú.\n- Màng phổi: Không thấy tràn dịch, tràn khí màng phổi.\n- Rốn phổi hai bên: Không to, bình thường.\n- Bóng tim và trung thất: Trong giới hạn bình thường.\n- Khung xương lồng ngực: Không thấy gãy xương hay tổn thương tiêu xương.`,
          ketluan: `Hình ảnh tim phổi hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu ngực bình thường`
        };
      }
      if (/^mẫu\s+(?:bụng|ổ\s*bụng|siêu\s*âm\s*bụng)\s*bình\s*thường/i.test(lower)) {
        return {
          handled: true,
          action: "apply_template",
          mota: `- Gan: Kích thước bình thường, bờ đều, nhu mô đồng nhất, không nốt khu trú.\n- Túi mật: Thành mỏng, lòng dịch trong, không sỏi.\n- Đường mật trong và ngoài gan: Không giãn, không sỏi.\n- Tụy: Kích thước và nhu mô bình thường, ống tụy không giãn.\n- Lách: Kích thước trong giới hạn bình thường.\n- Hai thận: Kích thước bình thường, nhu mô dày đều, phân biệt vỏ tủy rõ, không sỏi, không ứ nước.\n- Bàng quang: Thành mỏng đều, lòng dịch trong, không sỏi.\n- Tuyến tiền liệt / Tử cung phần phụ: Trong giới hạn bình thường.\n- Dịch ổ bụng: Hiện không thấy dịch tự do ổ bụng.`,
          ketluan: `Hình ảnh siêu âm ổ bụng hiện tại chưa thấy bất thường.`,
          summary: `Đã áp dụng mẫu bụng bình thường`
        };
      }

      // Nếu không khớp lệnh cục bộ nào
      return {
        handled: false,
        action: "unknown",
        mota: currentMota,
        ketluan: currentKetluan,
        summary: "Cần xử lý qua AI"
      };
    },

    /**
     * Tổng hợp báo cáo y khoa
     */
    async synthesize(currentMota, currentKetluan, dictationText, useAI = true) {
      const cleanDictation = this.cleanFillerWords(dictationText);
      if (!cleanDictation) {
        return { mota: currentMota, ketluan: currentKetluan, summary: "Không có câu đọc" };
      }

      return this.localDeterministicFallback(currentMota, currentKetluan, cleanDictation);
    },

    /**
     * Chuẩn hoá câu Kết luận theo chuẩn Lung-RADS v2022
     */
    sanitizeLungRADSConclusion(conclusionText) {
      if (!conclusionText || !conclusionText.trim()) return conclusionText;
      let text = conclusionText.trim();

      // 1. Chuẩn hoá chữ hoa cho mức Lung-RADS (4a -> 4A, 4b -> 4B, 4x -> 4X)
      text = text.replace(/Lung-RADS\s+([0-9])([a-z])\b/gi, function(_, num, letter) {
        return "Lung-RADS " + num + letter.toUpperCase();
      });

      // 2. Loại bỏ các mở ngoặc liệt kê tên thuỳ sau "hai phổi"
      text = text.replace(/hai\s+phổi\s*\([^)]*(?:thuỳ|thùy)[^)]*\)/gi, "hai phổi");

      // 3. Chuyển đổi "nốt/các nốt ... hai phổi" hoặc "các nốt ... phổi phải/trái" thành "vài nốt ..."
      text = text.replace(/(^|[.\n]\s*)(Hình\s+ảnh\s+)?(?:nốt|các\s+nốt)\s+((?:đặc|kính\s+mờ|vôi\s+hoá|vôi\s+hóa|bán\s+đặc|bán-đặc)(?:\s+và\s+(?:vài\s+|các\s+)?(?:nốt\s+)?(?:đặc|kính\s+mờ|vôi\s+hoá|vôi\s+hóa|bán\s+đặc|bán-đặc))?)\s+hai\s+phổi/gi, function(match, punct, prefix, type) {
        const cleanType = type.replace(/\b(?:vài|các)\s+nốt\s+/gi, "").replace(/\bnốt\s+/gi, "");
        if (prefix) {
          return (punct || "") + prefix + "vài nốt " + cleanType + " hai phổi";
        }
        const cap = (!punct || punct.includes("\n") || punct.includes(".")) ? "Vài nốt " : "vài nốt ";
        return (punct || "") + cap + cleanType + " hai phổi";
      });
      text = text.replace(/(^|[.\n]\s*)(Hình\s+ảnh\s+)?(?:các\s+nốt)\s+((?:đặc|kính\s+mờ|vôi\s+hoá|vôi\s+hóa|bán\s+đặc|bán-đặc)(?:\s+và\s+(?:vài\s+|các\s+)?(?:nốt\s+)?(?:đặc|kính\s+mờ|vôi\s+hoá|vôi\s+hóa|bán\s+đặc|bán-đặc))?)\s+phổi\s+(phải|trái)/gi, function(match, punct, prefix, type, side) {
        const cleanType = type.replace(/\b(?:vài|các)\s+nốt\s+/gi, "").replace(/\bnốt\s+/gi, "");
        if (prefix) {
          return (punct || "") + prefix + "vài nốt " + cleanType + " phổi " + side;
        }
        const cap = (!punct || punct.includes("\n") || punct.includes(".")) ? "Vài nốt " : "vài nốt ";
        return (punct || "") + cap + cleanType + " phổi " + side;
      });

      // 3.5. Sửa lỗi giải phẫu sai "thuỳ phải / thuỳ trái" -> "phổi phải / phổi trái"
      text = text.replace(/\bth[uù][yỳ]\s+(phải|trái)\b/gi, "phổi $1");

      // 4. Chuẩn hoá định dạng Lung-RADS:
      text = text.replace(/\s*[-–—]\s*(Lung-RADS\s+[0-9][A-Za-z]?)\.?/gi, function(_, lr) {
        const stdLr = lr.replace(/lung-rads/i, "Lung-RADS");
        return " (" + stdLr + ").";
      });
      text = text.replace(/\(\s*lung-rads\b/gi, "(Lung-RADS");

      // 5. GỘP CÁC TỔN THƯƠNG CÙNG MỨC LUNG-RADS TRONG CÂU:
      const sameTierRegex = /\((Lung-RADS\s+[0-9][A-Za-z]?)\)[.,;\s]+(?:và\s+)?([^().]+?)\s*\(\1\)/i;
      while (sameTierRegex.test(text)) {
        text = text.replace(sameTierRegex, function(match, lr, secondPart) {
          let cleanPart = secondPart.trim().replace(/^và\s+/i, "");
          if (cleanPart) {
            cleanPart = cleanPart.charAt(0).toLowerCase() + cleanPart.slice(1);
          }
          return " __JOIN__ " + cleanPart + " (" + lr + ")";
        });
      }

      if (text.includes("__JOIN__")) {
        const parts = text.split("__JOIN__");
        let joined = parts[0].trim();
        for (let i = 1; i < parts.length; i++) {
          if (i === parts.length - 1) {
            joined += " và " + parts[i].trim();
          } else {
            joined += ", " + parts[i].trim();
          }
        }
        text = joined;
      }

      // 6. TÁCH CÁC CÂU KHÁC MỨC LUNG-RADS:
      text = text.replace(/(\(Lung-RADS\s+[0-9][A-Za-z]?\))[.,;\s]+(?:và\s+)?([a-zà-ỹ\p{L}])/gui, function(_, lr, nextChar) {
        return lr + ". " + nextChar.toUpperCase();
      });

      text = text.replace(/(\(Lung-RADS\s+[0-9][A-Za-z]?\))(?!\.)/gi, function(_, lr) {
        return lr + ".";
      });

      // 7. Xoá từ 'Hình ảnh' lặp lại ở các câu phía sau
      text = text.replace(/(?:^|[.!?\n]\s+)Hình\s+ảnh\s+/gui, function(match, offset) {
        if (offset === 0) return match;
        return ". ";
      });

      // 8. Dọn dẹp khoảng trắng trước dấu câu
      text = text.replace(/\s+([.,;:!?])/g, "$1");

      text = text.replace(/\.\s+([a-zà-ỹ\p{L}])/gui, function(_, c) {
        return ". " + c.toUpperCase();
      });

      text = text.replace(/[.,;]{2,}/g, ".").replace(/\s{2,}/g, " ").trim();
      text = text.replace(/\.\s*\./g, ".");
      text = text.replace(/[.,;\s]+$/, "") + ".";

      return text;
    },

    /**
     * Tự động gộp các nốt trong cùng một thùy (hoặc cùng rãnh liên thuỳ) và cùng 1 mức Lung-RADS vào đúng 1 câu duy nhất
     */
    mergeSameLobeSameTierNodules(text) {
      const locations = [
        { pattern: "Th[uù][yỳ]\\s+trên", label: "Thuỳ trên" },
        { pattern: "Th[uù][yỳ]\\s+giữa", label: "Thuỳ giữa" },
        { pattern: "Th[uù][yỳ]\\s+dưới", label: "Thuỳ dưới" },
        { pattern: "Rãnh\\s+liên\\s+th[uù][yỳ]\\s+chếch", label: "Rãnh liên thuỳ chếch" },
        { pattern: "Rãnh\\s+liên\\s+th[uù][yỳ]\\s+ngang", label: "Rãnh liên thuỳ ngang" }
      ];
      const types = ["đặc", "kính mờ", "bán đặc", "vôi hoá", "vôi hóa"];

      function getSolidTier(mean) {
        if (mean < 6.0) return 2;
        if (mean < 8.0) return 3;
        return 4;
      }

      let changed = true;
      let iterations = 0;
      while (changed && iterations < 5) {
        changed = false;
        iterations++;
        for (const loc of locations) {
          for (const type of types) {
            const regex = new RegExp(
              "(?:" + loc.pattern + "\\s+có\\s+(\\d+)\\s+nốt\\s+" + type + "[^.]*?kích\\s+thước(?:\\s+(?:lớn\\s+nhất|lớn))?\\s+(\\d+(?:[.,]\\d+)?)\\s*[×xX*]\\s*(\\d+(?:[.,]\\d+)?)\\s*mm(?:\\s*\\(\\s*đường\\s+kính\\s+trung\\s+bình\\s+([0-9.,]+)\\s*mm\\s*\\))?[^.]*?\\.)" +
              "\\s*" +
              "(?:(?:Ngoài\\s+ra\\s+)?" + loc.pattern + "\\s+(?:còn\\s+)?có\\s+(\\d+)\\s+nốt\\s+" + type + "[^.]*?kích\\s+thước(?:\\s+(?:lớn\\s+nhất|lớn))?\\s+(\\d+(?:[.,]\\d+)?)\\s*[×xX*]\\s*(\\d+(?:[.,]\\d+)?)\\s*mm(?:\\s*\\(\\s*đường\\s+kính\\s+trung\\s+bình\\s+([0-9.,]+)\\s*mm\\s*\\))?[^.]*?\\.)",
              "i"
            );

            if (regex.test(text)) {
              text = text.replace(regex, (match, c1Str, d11Str, d12Str, m1Str, c2Str, d21Str, d22Str, m2Str) => {
                if (/tua\s*gai|co\s*kéo|spiculat/i.test(match)) return match;

                const c1 = parseInt(c1Str, 10) || 1;
                const c2 = parseInt(c2Str, 10) || 1;
                const totalCount = c1 + c2;

                const d11 = parseFloat(d11Str.replace(",", "."));
                const d12 = parseFloat(d12Str.replace(",", "."));
                const mean1 = m1Str ? parseFloat(m1Str.replace(",", ".")) : (d11 + d12) / 2;

                const d21 = parseFloat(d21Str.replace(",", "."));
                const d22 = parseFloat(d22Str.replace(",", "."));
                const mean2 = m2Str ? parseFloat(m2Str.replace(",", ".")) : (d21 + d22) / 2;

                if (type === "đặc" && getSolidTier(mean1) !== getSolidTier(mean2)) {
                  return match;
                }

                let maxDimStr = `${d11Str}×${d12Str}`;
                let maxMean = mean1;
                if (mean2 > mean1) {
                  maxDimStr = `${d21Str}×${d22Str}`;
                  maxMean = mean2;
                }

                const isCalc = type.includes("vôi");
                const formattedMean = (maxMean % 1 !== 0) ? maxMean.toFixed(1) : String(maxMean);
                const meanPart = isCalc ? "" : ` (đường kính trung bình ${formattedMean} mm)`;

                changed = true;
                return `${loc.label} có ${totalCount} nốt ${type}, nốt lớn kích thước ${maxDimStr} mm${meanPart}.`;
              });
            }
          }
        }
      }

      return text;
    },

    /**
     * Chuẩn hoá toàn bộ báo cáo Lung-RADS (Mô tả + Kết luận)
     * - Tự động tính và chuẩn hóa đường kính trung bình ra 1 số sau dấu phẩy (.5)
     * - Không kết luận nếu không mô tả: dày màng phổi khu trú
     * - Đồng bộ 2 chiều nốt vôi hoá và nốt ở rãnh liên thuỳ (oblique fissure, horizontal fissure)
     */
    sanitizeLungRADSReport(reportText, rawText = "") {
      if (!reportText) return "";
      let text = reportText.normalize("NFC");

      // 1. Tự động tính và chuẩn hóa đường kính trung bình ra đúng 1 số sau dấu phẩy (.5) nếu có phần lẻ: vd 3.5 mm, 4.5 mm, 2.5 mm, 5.5 mm (hỗ trợ cả dấu phẩy 3,5 mm)
      text = text.replace(/(kích\s+thước(?:\s+(?:lớn\s+nhất|lớn))?\s+)(\d+(?:[.,]\d+)?)\s*[×xX*]\s*(\d+(?:[.,]\d+)?)\s*mm\s*\(\s*đường\s+kính\s+trung\s+bình\s+([0-9.,]+)\s*mm\s*\)/gi, function(match, prefix, d1Str, d2Str, oldMeanStr) {
        const d1 = parseFloat(d1Str.replace(",", "."));
        const d2 = parseFloat(d2Str.replace(",", "."));
        if (isNaN(d1) || isNaN(d2)) return match;
        const trueMean = (d1 + d2) / 2;
        const formattedMean = (trueMean % 1 !== 0) ? trueMean.toFixed(1) : String(trueMean);
        return `${prefix}${d1Str}×${d2Str} mm (đường kính trung bình ${formattedMean} mm)`;
      });

      // 1.2. Xoá "(đường kính trung bình ... mm)" ở nốt vôi hoá (quy tắc: nốt vôi hoá chỉ ghi kích thước, không ghi đường kính trung bình)
      text = text.replace(/(nốt\s+vôi\s+ho[áa][,;\s]+(?:nốt\s+lớn\s+)?kích\s+thước(?:\s+(?:lớn\s+nhất|lớn))?\s+\d+(?:[.,]\d+)?\s*[×xX*]\s*\d+(?:[.,]\d+)?\s*mm)\s*\(\s*đường\s+kính\s+trung\s+bình\s+[0-9.,]+\s*mm\s*\)/gi, "$1");

      // 1.5. Tự động gộp các nốt cùng thùy/rãnh và cùng 1 độ Lung-RADS vào đúng 1 câu duy nhất (chống tách câu vụn)
      text = this.mergeSameLobeSameTierNodules(text);

      // 2. Sắp xếp thứ tự nốt trong Mô tả: Nốt có mức Lung-RADS cao hơn / nguy cơ cao hơn BẮT BUỘC mô tả trước
      const lobeNames = ["trên", "giữa", "dưới"];
      lobeNames.forEach(lobe => {
        const bigRegex = new RegExp("(Th[uù][yỳ]\\s+" + lobe + "\\s+còn\\s+có[\\s\\S]+?\\.\\s*(?=(?:Th[uù][yỳ]|Rãnh|Không|Động|Trung|$)))", "i");
        const mBig = text.match(bigRegex);
        if (mBig) {
          const bigSentence = mBig[1].trim();
          const earlyRegex = new RegExp("(Th[uù][yỳ]\\s+" + lobe + "\\s+có[\\s\\S]+?\\.\\s*(?=(?:Th[uù][yỳ]|Rãnh|Không|Động|Trung|$)))", "i");
          const mEarly = text.match(earlyRegex);
          if (mEarly && text.indexOf(mEarly[1]) < text.indexOf(bigSentence)) {
            const earlySentence = mEarly[1].trim();
            text = text.replace(bigSentence, "").replace(/\s{2,}/g, " ");
            const newBig = bigSentence.replace(/còn\s+có/i, "có");
            const newEarly = "Ngoài ra " + earlySentence.replace(/^Th[uù][yỳ]/i, "thuỳ");
            text = text.replace(earlySentence, newBig + " " + newEarly);
          }
        }
      });
      text = text.replace(/(Phổi\s+(?:phải|trái)\s*:\s*Th[uù][yỳ]\s+(?:trên|giữa|dưới)\s+)còn\s+có\b/gi, "$1có");

      // 3. Đảm bảo tính nhất quán giữa MÔ TẢ và KẾT LUẬN (Cái gì mô tả mới được ghi kết luận)
      const parts = text.split(/(?:^|\n)\s*(?:--|—|-)?\s*(?:KẾT\s*LUẬN|Kết\s*luận)\s*[:：]?\s*/i);
      if (parts.length >= 2) {
        let motaPart = parts[0];
        let klBody = parts[1];
        const suffix = "Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.";

        // A. NÚT NHẦY PHẾ QUẢN (Bronchial mucus plug):
        const mucusMatch = klBody.match(/(Nút\s+nhầy\s+phế\s+quản[^.\n]+)/i);
        if (mucusMatch) {
          const mucusSentence = mucusMatch[1].trim().replace(/\.?$/, ".");
          if (!/(?:nút\s+nhầy|nut\s+nhay)/i.test(motaPart)) {
            const isBoth = /hai\s+phổi|2\s+phổi|hai\s+bên/i.test(mucusSentence);
            const isRight = /phổi\s+phải/i.test(mucusSentence) || isBoth;
            const isLeft = /phổi\s+trái/i.test(mucusSentence) || isBoth;
            const lines = motaPart.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (isRight && lines[i].toLowerCase().includes("phổi phải")) {
                const mText = isBoth ? mucusSentence.replace(/hai\s+phổi|hai\s+bên/i, "phổi phải") : mucusSentence;
                if (lines[i].includes(suffix)) {
                  lines[i] = lines[i].replace(suffix, mText + " " + suffix);
                } else {
                  lines[i] += " " + mText;
                }
              }
              if (isLeft && lines[i].toLowerCase().includes("phổi trái")) {
                const mText = isBoth ? mucusSentence.replace(/hai\s+phổi|hai\s+bên/i, "phổi trái") : mucusSentence;
                if (lines[i].includes(suffix)) {
                  lines[i] = lines[i].replace(suffix, mText + " " + suffix);
                } else {
                  lines[i] += " " + mText;
                }
              }
            }
            motaPart = lines.join("\n");
          }
        }

        // B. NỐT Ở RÃNH LIÊN THUỲ VÀ NỐT VÔI HOÁ (Interlobar Fissure & Calcified Nodules - Bidirectional Guard):
        function checkKlVoiHoa(kl, side) {
          if (!kl) return false;
          const sentences = kl.split(/(?<=[.!?])\s+/);
          for (const s of sentences) {
            if (!/(?:vôi\s*ho[áa]|Lung-RADS\s*1)/i.test(s)) continue;
            if (side === "right") {
              if (/phổi\s*phải|hai\s*phổi|2\s*phổi/i.test(s)) return true;
            } else if (side === "left") {
              if (/phổi\s*trái|hai\s*phổi|2\s*phổi/i.test(s)) return true;
            }
          }
          return false;
        }

        const mLines = motaPart.split("\n");
        for (let i = 0; i < mLines.length; i++) {
          const line = mLines[i];
          const isRight = line.toLowerCase().includes("phổi phải");
          const isLeft = line.toLowerCase().includes("phổi trái");
          if (!isRight && !isLeft) continue;

          const side = isRight ? "right" : "left";
          const toInject = [];

          // 1. Quét nốt ở rãnh liên thuỳ (oblique fissure, horizontal fissure) từ rawText nếu chưa được mô tả
          if (rawText) {
            const rawLines = rawText.split(/[\n。]+/);
            for (const rawLine of rawLines) {
              if (!/(?:oblique\s+fissure|horizontal\s+fissure|rãnh\s+liên\s+thu[ỳy])/i.test(rawLine)) continue;
              let isTarget = false;
              if (side === "right" && (/horizontal\s+fissure|rãnh\s+liên\s+thu[ỳy]\s+ngang|right|phổi\s+phải/i.test(rawLine))) isTarget = true;
              if (side === "left" && (/left|phổi\s+trái/i.test(rawLine) && !/horizontal/i.test(rawLine))) isTarget = true;
              if (!isTarget) continue;

              const mDim = rawLine.match(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[×xX*]\s*(\d+(?:[.,]\d+)?)\s*mm/i);
              const dim = mDim ? `${mDim[1]}×${mDim[2]}` : "";

              let fissureName = "Rãnh liên thuỳ chếch";
              if (/horizontal\s+fissure|rãnh\s+liên\s+thu[ỳy]\s+ngang/i.test(rawLine)) fissureName = "Rãnh liên thuỳ ngang";

              let type = "đặc";
              let isCalc = false;
              if (/calcif|vôi/i.test(rawLine)) {
                type = "vôi hoá";
                isCalc = true;
              } else if (/ground\s*glass|kính\s*mờ/i.test(rawLine)) {
                type = "kính mờ";
              } else if (/part[- ]solid|bán\s*đặc/i.test(rawLine)) {
                type = "bán đặc";
              }

              // Kiểm tra chính xác xem nốt rãnh liên thuỳ này đã có trong dòng mô tả chưa (tránh trùng kích thước với nốt khác loại ở thuỳ khác)
              if (isCalc) {
                const alreadyHasCalc = new RegExp("vôi\\s*ho[áa][^.]*" + (dim ? dim.replace("×", "[×xX*]") : ""), "i").test(line);
                if (alreadyHasCalc) continue;
              } else {
                const alreadyHasFissureOrSameTypeDim =
                  new RegExp(fissureName + "[^.]*" + (dim ? dim.replace("×", "[×xX*]") : ""), "i").test(line) ||
                  (dim && new RegExp("nốt\\s+" + type + "[^.]*" + dim.replace("×", "[×xX*]"), "i").test(line));
                if (alreadyHasFissureOrSameTypeDim) continue;
              }

              if (isCalc) {
                toInject.push(`${fissureName} có 1 nốt vôi hoá${dim ? " kích thước " + dim + " mm" : ""}.`);
              } else if (dim) {
                const parts = dim.split("×").map(s => parseFloat(s.trim().replace(",", ".")));
                const mean = (parts[0] + parts[1]) / 2;
                const formattedMean = (mean % 1 !== 0) ? mean.toFixed(1) : String(mean);
                toInject.push(`${fissureName} có 1 nốt ${type} kích thước ${dim} mm (đường kính trung bình ${formattedMean} mm).`);
              }
            }
          }

          // 2. Đồng bộ nốt vôi hoá nếu Kết luận hoặc rawText có mà Mô tả chưa có
          const hasKlVoi = checkKlVoiHoa(klBody, side);
          const hasRawVoi = rawText && rawText.split(/[\n。]+/).some(rl => {
            if (!/(?:calcif|vôi\s*ho[áa])/i.test(rl)) return false;
            if (side === "right") return /horizontal|right|phổi\s+phải|thu[ỳy]\s+giữa/i.test(rl);
            return /left|phổi\s+trái/i.test(rl) && !/horizontal/i.test(rl);
          });
          const hasMotaVoi = /(?:vôi\s*ho[áa])/i.test(line) || toInject.some(s => /vôi\s*ho[áa]/i.test(s));

          if ((hasKlVoi || hasRawVoi) && !hasMotaVoi) {
            let added = false;
            if (rawText) {
              const rawLines = rawText.split(/[\n。]+/);
              for (const rawLine of rawLines) {
                if (!/(?:calcif|vôi\s*ho[áa])/i.test(rawLine)) continue;
                let isTarget = false;
                if (side === "right" && (/horizontal|right|phổi\s+phải|thu[ỳy]\s+giữa/i.test(rawLine))) isTarget = true;
                if (side === "left" && (/left|phổi\s+trái/i.test(rawLine) && !/horizontal/i.test(rawLine))) isTarget = true;
                if (!isTarget) continue;

                const mDim = rawLine.match(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[×xX*]\s*(\d+(?:[.,]\d+)?)\s*mm/i);
                const dim = mDim ? `${mDim[1]}×${mDim[2]} mm` : "";
                let loc = "";
                if (/oblique\s+fissure|rãnh\s+liên\s+thu[ỳy]\s+chếch/i.test(rawLine)) loc = "Rãnh liên thuỳ chếch";
                else if (/horizontal\s+fissure|rãnh\s+liên\s+thu[ỳy]\s+ngang/i.test(rawLine)) loc = "Rãnh liên thuỳ ngang";
                else if (/upper\s+lobe|thu[ỳy]\s+trên/i.test(rawLine)) loc = "Thuỳ trên";
                else if (/middle\s+lobe|thu[ỳy]\s+giữa/i.test(rawLine)) loc = "Thuỳ giữa";
                else if (/lower\s+lobe|thu[ỳy]\s+dưới/i.test(rawLine)) loc = "Thuỳ dưới";

                if (loc && dim) toInject.push(`${loc} có 1 nốt vôi hoá kích thước ${dim}.`);
                else if (dim) toInject.push(`Có 1 nốt vôi hoá kích thước ${dim}.`);
                else toInject.push("Có 1 nốt vôi hoá.");
                added = true;
              }
            }
            if (!added && hasKlVoi) {
              toInject.push("Có 1 nốt vôi hoá.");
            }
          }

          if (toInject.length > 0) {
            const injectStr = this.mergeSameLobeSameTierNodules(toInject.join(" "));
            mLines[i] = mLines[i].replace(/trường\s+phổi\s+sáng\s+đều(?:\s*,\s*không\s+thấy\s+tổn\s+thương\s+dạng\s+nốt\s+hoặc\s+dạng\s+khối)?\s*\.?\s*/gi, "");
            if (mLines[i].includes(suffix)) {
              mLines[i] = mLines[i].replace(suffix, injectStr + " " + suffix);
            } else {
              mLines[i] += " " + injectStr;
            }
            mLines[i] = mLines[i].replace(/\s{2,}/g, " ");
          }
        }
        motaPart = this.mergeSameLobeSameTierNodules(mLines.join("\n"));

        // 3. Chiều ngược lại: Nếu Mô tả phổi có nốt vôi hoá mà Kết luận chưa có câu vôi hoá (Lung-RADS 1) -> Tự động bổ sung vào Kết luận
        const rightLine = mLines.find(l => l.toLowerCase().includes("phổi phải")) || "";
        const leftLine = mLines.find(l => l.toLowerCase().includes("phổi trái")) || "";
        const rightHasVoi = /nốt\s+vôi\s*ho[áa]/i.test(rightLine);
        const leftHasVoi = /nốt\s+vôi\s*ho[áa]/i.test(leftLine);
        if ((rightHasVoi || leftHasVoi) && !/(?:vôi\s*ho[áa]|Lung-RADS\s*1)/i.test(klBody)) {
          let voiKl = "";
          if (rightHasVoi && leftHasVoi) {
            voiKl = "Vài nốt vôi hoá hai phổi (Lung-RADS 1).";
          } else {
            const targetLine = rightHasVoi ? rightLine : leftLine;
            const sideLabel = rightHasVoi ? "phổi phải" : "phổi trái";
            const calcMatches = targetLine.match(/(\d+)\s+nốt\s+vôi\s*ho[áa]/gi) || [];
            let totalCalc = 0;
            calcMatches.forEach(m => {
              const n = parseInt(m, 10);
              totalCalc += isNaN(n) ? 1 : n;
            });
            const lobeMatch = targetLine.match(/(thu[ỳy]\s+(?:trên|giữa|dưới))\s+(?:còn\s+)?có\s+1\s+nốt\s+vôi\s*ho[áa]/i);
            if (totalCalc > 1) {
              voiKl = `Vài nốt vôi hoá ${sideLabel} (Lung-RADS 1).`;
            } else if (lobeMatch && calcMatches.length === 1) {
              voiKl = `Nốt vôi hoá ${lobeMatch[1].toLowerCase()} ${sideLabel} (Lung-RADS 1).`;
            } else {
              voiKl = `Nốt vôi hoá ${sideLabel} (Lung-RADS 1).`;
            }
          }
          if (voiKl) {
            if (/(?:Nút\s+nhầy\s+phế\s+quản)/i.test(klBody)) {
              klBody = klBody.replace(/(Nút\s+nhầy\s+phế\s+quản)/i, voiKl + " $1");
            } else {
              klBody = klBody.trim().replace(/\.?$/, ".") + " " + voiKl;
            }
          }
        }

        // C. CHỐNG LỖI ĐẢO BÊN / GHI "HAI PHỔI" KHI 1 BÊN PHỔI BÌNH THƯỜNG (Ca fb_20261026_045433):
        const rightNormal = /trường\s+phổi\s+sáng\s+đều|không\s+thấy\s+tổn\s+thương\s+dạng\s+nốt/i.test(rightLine) && !/\bnốt\s+(?:đặc|kính\s+mờ|bán\s+đặc|vôi\s+ho[áa])/i.test(rightLine);
        const leftNormal = /trường\s+phổi\s+sáng\s+đều|không\s+thấy\s+tổn\s+thương\s+dạng\s+nốt/i.test(leftLine) && !/\bnốt\s+(?:đặc|kính\s+mờ|bán\s+đặc|vôi\s+ho[áa])/i.test(leftLine);
        if (rightLine && leftLine) {
          if (leftNormal && !rightNormal) {
            klBody = klBody.replace(/\bhai\s+phổi\b/gi, "phổi phải");
          } else if (rightNormal && !leftNormal) {
            klBody = klBody.replace(/\bhai\s+phổi\b/gi, "phổi trái");
          }
        }

        // D. DÀY MÀNG PHỔI KHU TRÚ & CÁC BIẾN THỂ DÀY DÍNH:
        const hasMotaDayMangPhoi = /(?:dày|day|vôi\s+hóa|vôi\s+hoá|dính|mảng\s+dày)[^.\n]*màng\s+phổi|màng\s+phổi[^.\n]*(?:dày|day|vôi|dính)/i.test(motaPart) && !/(?:không|chưa)\s+thấy\s+(?:dày|bất\s+thường)/i.test(motaPart);
        if (!hasMotaDayMangPhoi) {
          klBody = klBody.replace(/(?:^|[.!?\n]\s*)(?:Hình\s+ảnh\s+)?(?:dày|dày\s+dính|dày\s+vôi\s+hóa|dày\s+vôi\s+hoá)\s+màng\s+phổi(?:\s+khu\s+trú)?(?:\s+bên\s+(?:phải|trái|hai\s+bên))?[.,;]?/gi, "");
          klBody = klBody.replace(/(?:và|,)\s*(?:hình\s+ảnh\s+)?(?:dày|dày\s+dính)\s+màng\s+phổi(?:\s+khu\s+trú)?(?:\s+bên\s+(?:phải|trái|hai\s+bên))?/gi, "");
          klBody = klBody.replace(/(?:hình\s+ảnh\s+)?(?:dày|dày\s+dính)\s+màng\s+phổi(?:\s+khu\s+trú)?(?:\s+bên\s+(?:phải|trái|hai\s+bên))?\s+(?:và|,)\s*/gi, "");
          klBody = klBody.replace(/\s{2,}/g, " ").replace(/\.\s*\./g, ".").trim();
          if (klBody && !/[.!?]$/.test(klBody)) klBody += ".";
        }

        text = motaPart.trim() + "\nKết luận:\n" + klBody.trim();
      }

      const conclusionSanitizer = (typeof this.sanitizeLungRADSConclusion === "function")
        ? this.sanitizeLungRADSConclusion.bind(this)
        : (typeof sanitizeLungRADSConclusion === "function" ? sanitizeLungRADSConclusion : null);
      if (conclusionSanitizer) {
        text = text.replace(/((?:Kết\s*luận\s*:?\s*))([\s\S]*)/i, function(_, label, klBody) {
          return label.trim() + "\n" + conclusionSanitizer(klBody);
        });
      }

      return text;
    },

    version: 1792840000
  };

  const ModalityDetector = {
    MODALITIES: {
      CT: "CT",
      MRI: "MRI",
      US: "US",
      XR: "XR"
    },

    REGIONS: {
      BRAIN: "BRAIN",
      SPINE: "SPINE",
      MSK: "MSK",
      CHEST: "CHEST",
      ABDOMEN: "ABDOMEN",
      VASCULAR: "VASCULAR"
    },

    detect(serviceTitle = "", currentEditorText = "", dictationText = "") {
      const combined = `${serviceTitle || ""} ${(currentEditorText || "").slice(0, 1000)} ${dictationText || ""}`.toLowerCase();
      
      let modality = this.MODALITIES.US;
      let region = this.REGIONS.ABDOMEN;

      // 1. Nhận diện Modality
      if (/(?:cộng\s*hưởng\s*từ|chụp\s*cht|mri\b|chuỗi\s*xung|t1w|t2w|flair|dwi|adc|stir|gadolinium|đối\s*quang\s*từ)/i.test(combined)) {
        modality = this.MODALITIES.MRI;
      } else if (/(?:cắt\s*lớp\s*vi\s*tính|chụp\s*clvt|ct\s*scanner|\bct\b|hounsfield|\bhu\b|cửa\s*sổ\s*xương|cửa\s*sổ\s*nhu\s*mô|tiêm\s*thuốc\s*cản\s*quang)/i.test(combined)) {
        modality = this.MODALITIES.CT;
      } else if (/(?:x\s*[-]?\s*quang|radiography|\bxray\b|tim\s*phổi\s*thẳng|phim\s*nghiêng|tia\s*x)/i.test(combined)) {
        modality = this.MODALITIES.XR;
      } else if (/(?:siêu\s*âm|ultrasound|doppler|đầu\s*dò|echography)/i.test(combined)) {
        modality = this.MODALITIES.US;
      }

      // 2. Nhận diện Phân vùng (Region)
      if (/(?:sọ\s*não|não|tiểu\s*não|bán\s*cầu|nhân\s*đậu|đồi\s*thị|chảy\s*máu\s*não|xuất\s*huyết\s*não|nhồi\s*máu\s*não|máu\s*tụ|não\s*thất|rãnh\s*cuộn\s*não)/i.test(combined)) {
        region = this.REGIONS.BRAIN;
      } else if (/(?:cột\s*sống|đĩa\s*đệm|thắt\s*lưng|cổ|đốt\s*sống|l1-s1|c1-c7|t1-t12|rễ\s*thần\s*kinh|ống\s*sống|bao\s*màng\s*cứng)/i.test(combined)) {
        region = this.REGIONS.SPINE;
      } else if (/(?:khớp\s*gối|khớp\s*háng|khớp\s*vai|sụn\s*chêm|dây\s*chằng|cổ\s*chân|xương\s*đùi|gối|háng|vai)/i.test(combined)) {
        region = this.REGIONS.MSK;
      } else if (/(?:lồng\s*ngực|phổi|màng\s*phổi|trung\s*thất|lung-rads|nốt\s*phổi|rốn\s*phổi)/i.test(combined)) {
        region = this.REGIONS.CHEST;
      } else if (/(?:động\s*mạch\s*chủ|đm\s*phổi|cta|mra|mạch\s*máu|tĩnh\s*mạch\s*cửa|phình\s*đmc)/i.test(combined)) {
        region = this.REGIONS.VASCULAR;
      } else {
        region = this.REGIONS.ABDOMEN;
      }

      return { modality, region };
    }
  };

  ClinicalSynthesizer.ModalityDetector = ModalityDetector;
  global.ModalityDetector = ModalityDetector;
  global.ClinicalSynthesizer = ClinicalSynthesizer;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ClinicalSynthesizer, ModalityDetector };
  }
})(typeof window !== "undefined" ? window : globalThis);
