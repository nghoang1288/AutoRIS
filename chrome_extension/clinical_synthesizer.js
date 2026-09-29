// clinical_synthesizer.js - Bộ xử lý phân bổ giải phẫu và tự sinh kết luận y khoa (AutoRIS)
(function (global) {
  "use strict";

  const ClinicalSynthesizer = {
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
        ketluan = text.slice(klIndex + klMatch[0].length).trim();
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
     * Tổng hợp báo cáo y khoa: Kết hợp AI Synthesizer với Local Rule Fallback
     */
    async synthesize(currentMota, currentKetluan, dictationText, useAI = true) {
      const cleanDictation = (dictationText || "").normalize("NFC").trim();
      if (!cleanDictation) {
        return { mota: currentMota, ketluan: currentKetluan, summary: "Không có câu đọc" };
      }

      // 1. Thử qua AI Synthesizer (9router / Gemini)
      if (useAI) {
        try {
          const aiResult = await this.callAISynthesizer(currentMota, currentKetluan, cleanDictation);
          if (aiResult && (aiResult.mota || aiResult.updated_organ_line) && aiResult.ketluan) {
            return aiResult;
          }
        } catch (err) {
          console.warn("[AutoRIS Synthesizer] AI gọi thất bại, kích hoạt Local Rule Fallback:", err.message);
        }
      }

      // 2. Chế độ dự phòng theo quy tắc giải phẫu cục bộ (Deterministic Local Fallback)
      return this.localDeterministicFallback(currentMota, currentKetluan, cleanDictation);
    },

    /**
     * Gửi yêu cầu tổng hợp qua background service worker
     */
    callAISynthesizer(currentMota, currentKetluan, dictationText) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "SYNTHESIZE_REPORT",
          payload: {
            currentMota,
            currentKetluan,
            dictationText
          }
        }, (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (res && res.success && res.data) {
            resolve(res.data);
          } else {
            reject(new Error(res?.error || "Không nhận được phản hồi từ AI Synthesizer"));
          }
        });
      });
    },

    /**
     * Bộ quy tắc cục bộ (Deterministic Rule-Based Fallback)
     * Đảm bảo không mất dữ liệu ngay cả khi mất mạng hoặc không dùng AI
     */
    localDeterministicFallback(currentMota, currentKetluan, dictationText) {
      let mota = (currentMota || "").normalize("NFC").trim();
      let ketluan = (currentKetluan || "").normalize("NFC").trim();
      const cleanDictation = dictationText.normalize("NFC").trim();
      const lower = cleanDictation.toLowerCase();

      // Xóa câu bình thường ở kết luận
      const normalKLRegex = /(?:hiện tại|hiện tại)\s+(?:không|chưa)\s+thấy\s+bất\s+thường[^\n]*/gi;
      ketluan = ketluan.replace(normalKLRegex, "").trim();

      let affectedOrgan = "";
      let updatedOrganLine = "";
      let isNewOrgan = false;
      let insertAfter = "Lách";
      let hachLine = null;
      let generatedConclusion = "";
      let summaryText = "";

      // 1. GAN
      if (lower.includes("gan") || lower.includes("hạ phân thùy") || lower.includes("hpt") || lower.includes("nhu mô gan")) {
        affectedOrgan = "gan";
        const finding = cleanDictation.replace(/^(nhu mô gan|nhu mô|gan)\s*/i, "").trim();
        updatedOrganLine = `-- Gan không to, bờ đều, nhu mô gan ${finding}.`;
        
        const ganRegex = /(--\s*Gan[^\n]*)/i;
        if (ganRegex.test(mota)) {
          mota = mota.replace(ganRegex, updatedOrganLine);
        }

        // Tạo kết luận ngắn gọn, không ghi kích thước, bắt đầu bằng "Hình ảnh"
        let lesion = "tổn thương gan";
        if (lower.includes("nang")) {
          if (lower.includes("trái")) lesion = "nang gan trái";
          else if (lower.includes("phải")) lesion = "nang gan phải";
          else if (lower.includes("hạ phân thùy") || lower.includes("hpt")) {
            const hptMatch = cleanDictation.match(/(?:hạ phân thùy|hpt)\s*([ivx\d]+)/i);
            lesion = `nang gan hạ phân thùy ${hptMatch ? hptMatch[1].toUpperCase() : ''}`.trim();
          } else lesion = "nang gan";
        } else if (lower.includes("u máu")) {
          lesion = "u máu gan";
        } else if (lower.includes("vôi hóa") || lower.includes("nốt vôi")) {
          lesion = "nốt vôi hóa gan";
        }

        generatedConclusion = `Hình ảnh ${lesion}.`;
        summaryText = `Cập nhật gan: ${lesion}`;
      }

      // 2. DẠ DÀY (nếu chưa có dòng dạ dày thì thêm mới)
      else if (lower.includes("dạ dày") || lower.includes("hang vị") || lower.includes("môn vị") || lower.includes("thành dạ dày")) {
        affectedOrgan = "da_day";
        isNewOrgan = true;
        insertAfter = "Lách";

        let stomachText = cleanDictation;
        let hachText = "";
        const hachIdx = cleanDictation.search(/(?:lân cận có vài hạch|kèm hạch|có vài hạch|hạch lân cận)/i);
        if (hachIdx !== -1) {
          stomachText = cleanDictation.slice(0, hachIdx).replace(/[,;]\s*$/, "").trim();
          hachText = cleanDictation.slice(hachIdx).trim();
        }

        updatedOrganLine = `-- Dạ dày: ${stomachText}`;
        if (hachText) {
          hachLine = `-- Hạch: ${hachText}`;
        }

        const ddRegex = /(--\s*Dạ dày[^\n]*)/i;
        if (ddRegex.test(mota)) {
          isNewOrgan = false;
          mota = mota.replace(ddRegex, updatedOrganLine);
        } else {
          const lachRegex = /(--\s*Lách[^\n]*\n?|--\s*Lách[^\n]*\n?)/i;
          if (lachRegex.test(mota)) {
            mota = mota.replace(lachRegex, `$1${updatedOrganLine}\n`);
          } else {
            mota += `\n${updatedOrganLine}`;
          }
        }

        if (hachLine) {
          const hachRegex = /(--\s*Không thấy hạch[^\n]*|--\s*Không thấy hạch[^\n]*|--\s*Hạch[^\n]*)/i;
          if (hachRegex.test(mota)) {
            mota = mota.replace(hachRegex, hachLine);
          }
        }

        generatedConclusion = "Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận.";
        summaryText = "Thêm mô tả Dạ dày & Hạch lân cận";
      }

      // 3. TÚI MẬT
      else if (lower.includes("túi mật") || lower.includes("sỏi mật") || lower.includes("polyp túi mật")) {
        affectedOrgan = "tui_mat";
        updatedOrganLine = `-- Túi mật: ${cleanDictation}`;
        const tmRegex = /(--\s*Túi mật[^\n]*|--\s*Túi mật[^\n]*)/i;
        if (tmRegex.test(mota)) {
          mota = mota.replace(tmRegex, updatedOrganLine);
        }
        const lesion = lower.includes("sỏi") ? "sỏi túi mật" : (lower.includes("polyp") ? "polyp túi mật" : "bệnh lý túi mật");
        generatedConclusion = `Hình ảnh ${lesion}.`;
        summaryText = `Cập nhật túi mật: ${lesion}`;
      }

      // 4. THẬN
      else if (lower.includes("thận phải") || lower.includes("thận trái") || lower.includes("hai thận") || lower.includes("sỏi thận") || lower.includes("nang thận")) {
        const isRight = lower.includes("phải");
        const isLeft = lower.includes("trái");
        affectedOrgan = isLeft ? "than_trai" : (isRight ? "than_phai" : "than");
        const organLabel = isLeft ? "Thận trái" : (isRight ? "Thận phải" : "Hai thận");
        updatedOrganLine = `-- ${organLabel}: ${cleanDictation}`;

        const tpRegex = /(--\s*Thận phải[^\n]*|--\s*Thận phải[^\n]*)/i;
        const ttRegex = /(--\s*Thận trái[^\n]*|--\s*Thận trái[^\n]*)/i;
        const htRegex = /(--\s*Hai\s*thận[^\n]*|--\s*Hai\s*thận[^\n]*)/i;

        if (isRight && tpRegex.test(mota)) {
          mota = mota.replace(tpRegex, updatedOrganLine);
        } else if (isLeft && ttRegex.test(mota)) {
          mota = mota.replace(ttRegex, updatedOrganLine);
        } else if (htRegex.test(mota)) {
          mota = mota.replace(htRegex, updatedOrganLine);
        }

        const lesion = lower.includes("sỏi") ? "sỏi thận" : (lower.includes("nang") ? "nang thận" : "tổn thương thận");
        const side = isLeft ? " trái" : (isRight ? " phải" : "");
        generatedConclusion = `Hình ảnh ${lesion}${side}.`;
        summaryText = `Cập nhật ${organLabel.toLowerCase()}: ${lesion}${side}`;
      }

      // 5. Mặc định nếu không khớp cơ quan cụ thể
      else {
        affectedOrgan = "khac";
        updatedOrganLine = `-- Ghi nhận thêm: ${cleanDictation}`;
        mota += `\n${updatedOrganLine}`;
        generatedConclusion = `Hình ảnh ${cleanDictation}.`;
        summaryText = `Ghi nhận thêm: ${cleanDictation.slice(0, 30)}...`;
      }

      // Chuẩn hóa kết luận: Bắt đầu bằng 1 từ "Hình ảnh" duy nhất, không lặp
      if (generatedConclusion) {
        if (!generatedConclusion.startsWith("Hình ảnh")) {
          generatedConclusion = `Hình ảnh ${generatedConclusion}`;
        }
        // Xoá lặp từ "Hình ảnh"
        generatedConclusion = generatedConclusion.replace(/^Hình ảnh\s+Hình ảnh/i, "Hình ảnh");

        if (ketluan && !ketluan.includes(generatedConclusion)) {
          // Bỏ chữ "Hình ảnh" ở các câu tiếp theo nếu đã có câu trước
          const subsequent = generatedConclusion.replace(/^Hình ảnh\s*/i, "");
          ketluan = `${ketluan}\n${subsequent}`.trim();
        } else {
          ketluan = generatedConclusion;
        }
      }

      return {
        affected_organ: affectedOrgan,
        updated_organ_line: updatedOrganLine,
        is_new_organ: isNewOrgan,
        insert_after: insertAfter,
        hach_line: hachLine,
        mota: mota.trim(),
        ketluan: ketluan.trim(),
        summary: summaryText || `Cập nhật ${affectedOrgan}`
      };
    }
  };

  global.ClinicalSynthesizer = ClinicalSynthesizer;
})(typeof window !== "undefined" ? window : globalThis);
