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
      // Loại bỏ tiếng nhiễu quạt / hơi thở lặp lại ở cuối câu
      const trailingFillers = /(?:[.,\s]+(?:đây\s+này|đó\s+thôi|bây\s+giờ|dừng\s+lại|được\s+rồi|đây|này|đó|thôi|tôi|em|hết|xong|dừng|có|là|rồi|thì|ạ|nhé|nha|đấy|ừ|à|ờ)[.,\s]*)+$/i;
      while (trailingFillers.test(result)) {
        result = result.replace(trailingFillers, "");
      }
      result = result.replace(/(?:[.,\s]+(?:đấy|đó|này|ạ|nhé|nha)[.,\s]*)+$/i, "");
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
          let finding = clause.replace(/^.*?(?:nhu mô gan|gan)\s*(?:có\s*)?/i, "").trim();
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
        // 13. Ruột thừa / Hố chậu phải
        else if (lower.includes("ruột thừa") || lower.includes("hố chậu phải")) {
          organFindings.push({
            organ: "ruot_thua",
            label: "Ruột thừa",
            lesionType: "viêm ruột thừa",
            findingText: clause,
            rawClause: clause
          });
        }
        // 14. Dịch ổ bụng / Khoang màng phổi
        else if (lower.includes("dịch") || lower.includes("màng phổi")) {
          organFindings.push({
            organ: "dich",
            label: "Dịch tự do",
            lesionType: "tràn dịch",
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

      // Thận - Nang
      if ((hasRightCyst && hasLeftCyst) || hasBothKidneyCyst) {
        conclusions.push("nang thận hai bên");
      } else if (hasRightCyst) {
        conclusions.push("nang thận phải");
      } else if (hasLeftCyst) {
        conclusions.push("nang thận trái");
      }

      // Thận - Sỏi
      if ((hasRightStone && hasLeftStone) || hasBothKidneyStone) {
        conclusions.push("sỏi thận hai bên");
      } else if (hasRightStone) {
        conclusions.push("sỏi thận phải");
      } else if (hasLeftStone) {
        conclusions.push("sỏi thận trái");
      }

      // Gan
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

      // Tụy
      const pancreasFindings = organFindings.filter(f => f.organ === "tuy");
      for (const pf of pancreasFindings) {
        if (pf.lesionType === "nang") conclusions.push("nang tụy");
        else if (pf.lesionType === "khối u") conclusions.push("khối u tụy");
        else if (pf.lesionType === "viêm tụy") conclusions.push("viêm tụy");
        else if (pf.lesionType === "vôi hóa") conclusions.push("vôi hóa tụy");
        else conclusions.push(`tổn thương tụy`);
      }

      // Lách
      const spleenFindings = organFindings.filter(f => f.organ === "lach");
      for (const sf of spleenFindings) {
        if (sf.lesionType === "lách to") conclusions.push("lách to");
        else if (sf.lesionType === "nang") conclusions.push("nang lách");
        else if (sf.lesionType === "vôi hóa") conclusions.push("vôi hóa lách");
        else conclusions.push(`tổn thương lách`);
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

      // Túi mật
      const tmFindings = organFindings.filter(f => f.organ === "tui_mat");
      for (const tf of tmFindings) {
        if (tf.lesionType === "sỏi") conclusions.push("sỏi túi mật");
        else if (tf.lesionType === "polyp") conclusions.push("polyp túi mật");
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
              conclusions.unshift(ec);
            }
          }
        }
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
          return `Hình ảnh ${clean}.`;
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
     * Tổng hợp báo cáo y khoa
     */
    async synthesize(currentMota, currentKetluan, dictationText, useAI = true) {
      const cleanDictation = this.cleanFillerWords(dictationText);
      if (!cleanDictation) {
        return { mota: currentMota, ketluan: currentKetluan, summary: "Không có câu đọc" };
      }

      return this.localDeterministicFallback(currentMota, currentKetluan, cleanDictation);
    }
  };

  global.ClinicalSynthesizer = ClinicalSynthesizer;
})(typeof window !== "undefined" ? window : globalThis);
