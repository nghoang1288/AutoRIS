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
          if (aiResult && aiResult.mota && aiResult.ketluan) {
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
      const cleanDictation = dictationText.normalize("NFC");
      const lower = cleanDictation.toLowerCase();

      // Xóa câu bình thường ở kết luận
      const normalKLRegex = /(?:hiện tại|hiện tại)\s+(?:không|chưa)\s+thấy\s+bất\s+thường[^\n]*/gi;
      ketluan = ketluan.replace(normalKLRegex, "").trim();

      // Kiểm tra cơ quan liên quan
      let organMatched = false;
      let generatedConclusion = "";

      // 1. GAN
      if (lower.includes("gan") || lower.includes("hạ phân thùy") || lower.includes("hpt") || lower.includes("nhu mô gan")) {
        const ganRegex = /(--\s*Gan[^\n]*)/i;
        if (ganRegex.test(mota)) {
          mota = mota.replace(ganRegex, () => {
            const finding = dictationText.replace(/^(nhu mô gan|gan)\s*/i, "").trim();
            return `-- Gan không to, bờ đều, nhu mô gan ${finding}.`;
          });
          organMatched = true;
          generatedConclusion = lower.includes("nang") ? "Nang gan." :
                                lower.includes("u máu") ? "U máu gan." :
                                lower.includes("vôi hóa") ? "Nốt vôi hóa gan." : "Tổn thương gan.";
        }
      }

      // 2. DẠ DÀY (nếu chưa có dòng dạ dày thì thêm mới)
      if (lower.includes("dạ dày") || lower.includes("hang vị") || lower.includes("môn vị") || lower.includes("thành dạ dày")) {
        let stomachText = dictationText;
        let hachText = "";
        const hachIdx = dictationText.search(/(?:lân cận có vài hạch|kèm hạch|có vài hạch|hạch lân cận)/i);
        if (hachIdx !== -1) {
          stomachText = dictationText.slice(0, hachIdx).replace(/[,;]\s*$/, "").trim();
          hachText = dictationText.slice(hachIdx).trim();
        }

        const ddRegex = /(--\s*Dạ dày[^\n]*)/i;
        if (ddRegex.test(mota)) {
          mota = mota.replace(ddRegex, `-- Dạ dày: ${stomachText}`);
        } else {
          // Chèn sau Lách hoặc Tụy
          const lachRegex = /(--\s*Lách[^\n]*\n?|--\s*Lách[^\n]*\n?)/i;
          if (lachRegex.test(mota)) {
            mota = mota.replace(lachRegex, `$1-- Dạ dày: ${stomachText}\n`);
          } else {
            mota += `\n-- Dạ dày: ${stomachText}`;
          }
        }

        if (hachText) {
          const hachRegex = /(--\s*Không thấy hạch[^\n]*|--\s*Không thấy hạch[^\n]*|--\s*Hạch[^\n]*)/i;
          if (hachRegex.test(mota)) {
            mota = mota.replace(hachRegex, `-- Hạch: ${hachText}`);
          }
        }

        organMatched = true;
        generatedConclusion = "Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận.";
      }

      // 3. TÚI MẬT
      if (lower.includes("túi mật") || lower.includes("sỏi mật") || lower.includes("polyp túi mật")) {
        const tmRegex = /(--\s*Túi mật[^\n]*|--\s*Túi mật[^\n]*)/i;
        if (tmRegex.test(mota)) {
          mota = mota.replace(tmRegex, `-- Túi mật: ${dictationText}`);
          organMatched = true;
          generatedConclusion = lower.includes("sỏi") ? "Sỏi túi mật." : "Polyp túi mật.";
        }
      }

      // 4. THẬN
      if (lower.includes("thận phải") || lower.includes("thận trái") || lower.includes("sỏi thận") || lower.includes("nang thận")) {
        const isRight = lower.includes("phải");
        const isLeft = lower.includes("trái");
        const tpRegex = /(--\s*Thận phải[^\n]*|--\s*Thận phải[^\n]*)/i;
        const ttRegex = /(--\s*Thận trái[^\n]*|--\s*Thận trái[^\n]*)/i;

        if (isRight && tpRegex.test(mota)) {
          mota = mota.replace(tpRegex, `-- Thận phải: ${dictationText}`);
          organMatched = true;
          generatedConclusion = "Bệnh lý thận phải.";
        } else if (isLeft && ttRegex.test(mota)) {
          mota = mota.replace(ttRegex, `-- Thận trái: ${dictationText}`);
          organMatched = true;
          generatedConclusion = "Bệnh lý thận trái.";
        }
      }

      // 5. HẠCH (nếu chưa được xử lý trong cơ quan cụ thể)
      if (lower.includes("hạch") && !lower.includes("dạ dày")) {
        const hachRegex = /(--\s*Không thấy hạch[^\n]*|--\s*Không thấy hạch[^\n]*|--\s*Hạch[^\n]*)/i;
        if (hachRegex.test(mota)) {
          mota = mota.replace(hachRegex, `-- Hạch: ${dictationText}`);
        }
      }

      // Nếu không khớp cơ quan nào ở trên, thêm dòng mới vào cuối phần mô tả
      if (!organMatched) {
        mota += `\n-- Ghi nhận thêm: ${dictationText}`;
        generatedConclusion = dictationText;
      }

      // Cập nhật kết luận
      if (generatedConclusion) {
        if (ketluan) {
          if (!ketluan.includes(generatedConclusion)) {
            ketluan = `${ketluan}\n${generatedConclusion}`;
          }
        } else {
          ketluan = generatedConclusion;
        }
      }

      return {
        mota: mota.trim(),
        ketluan: ketluan.trim(),
        summary: `Điền tự động: ${dictationText.slice(0, 30)}...`
      };
    }
  };

  global.ClinicalSynthesizer = ClinicalSynthesizer;
})(typeof window !== "undefined" ? window : globalThis);
