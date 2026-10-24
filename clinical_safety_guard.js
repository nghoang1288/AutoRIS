/**
 * AutoRIS Clinical Safety & Anomaly Guard Engine
 * Bộ gác cổng an toàn lâm sàng: Phát hiện nhảy vọt đơn vị, đảo chiều giải phẫu và đảo cực phủ định
 * Tuân thủ nguyên tắc: CẢNH BÁO KHÔNG ĐỒNG NGHĨA VỚI TỰ SỬA DỮ LIỆU
 */

(function (global) {
  "use strict";

  const ClinicalSafetyGuard = {
    version: "1.0.0",

    // Danh sách cơ quan có tính đối xứng giải phẫu 2 bên
    BILATERAL_ORGANS: [
      "phổi", "thận", "niệu quản", "buồng trứng", "tuyến thượng thận", "thượng thận",
      "tinh hoàn", "mắt", "khớp háng", "khớp gối", "màng phổi", "hạch bẹn", "hạch nách",
      "xương đùi", "cánh tay", "bán cầu đại não", "xoang hàm", "thùy trên", "thùy dưới",
      "thùy giữa", "đỉnh phổi", "đáy phổi"
    ],

    // Các từ phủ định lâm sàng
    NEGATION_WORDS: [
      "không", "chưa", "chẳng", "không thấy", "không có", "chưa thấy",
      "chưa phát hiện", "không ghi nhận", "không rõ"
    ],

    // Các thực thể tổn thương bệnh học cần giám sát phủ định
    PATHOLOGY_ENTITIES: [
      "tràn dịch", "tràn khí", "gãy xương", "hạch to", "khối u", "khối choán chỗ",
      "sỏi", "sỏi thận", "sỏi túi mật", "sỏi niệu quản", "giãn phế quản",
      "dày tổ chức kẽ", "dày màng phổi", "tiêu xương", "tổn thương khu trú",
      "ứ nước", "thâm nhiễm", "đám mờ", "nốt mờ", "vôi hóa ác tính"
    ],

    /**
     * Trích xuất các số đo kèm đơn vị từ văn bản
     * Trả về mảng các object { val: number, unit: "mm"|"cm", raw: string }
     */
    extractMeasurements(text) {
      if (!text) return [];
      const measurements = [];
      const regex = /(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|\s+đến\s+|\s*-\s*)?\s*(\d+(?:[.,]\d+)?)?\s*(mm|cm|milimét|xen-ti-mét|centimet)\b/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const val1 = parseFloat(match[1].replace(",", "."));
        const val2 = match[2] ? parseFloat(match[2].replace(",", ".")) : null;
        let unit = match[3].toLowerCase();
        if (unit === "milimét") unit = "mm";
        if (unit === "xen-ti-mét" || unit === "centimet") unit = "cm";

        measurements.push({
          rawMatch: match[0],
          val1: val1,
          val2: val2,
          maxVal: val2 ? Math.max(val1, val2) : val1,
          unit: unit
        });
      }
      return measurements;
    },

    /**
     * 1. Kiểm tra nhảy vọt đơn vị (Unit Scale Jump) & Ngưỡng giải phẫu bất hợp lý
     */
    checkUnitScaleAnomaly(rawASR, proposedText) {
      const anomalies = [];
      const rawMeasurements = this.extractMeasurements(rawASR);
      const proposedMeasurements = this.extractMeasurements(proposedText);

      // A. Nhảy vọt đơn vị từ mm sang cm (ví dụ 12mm -> 12cm)
      for (const rawM of rawMeasurements) {
        if (rawM.unit === "mm") {
          for (const propM of proposedMeasurements) {
            if (propM.unit === "cm") {
              // Cùng giá trị số hoặc xấp xỉ nhưng khác đơn vị mm -> cm
              const isSameNumber = Math.abs(rawM.val1 - propM.val1) < 0.1 || (rawM.val2 && Math.abs(rawM.val2 - propM.val1) < 0.1);
              const rawHasNoCm = !/\b(?:cm|xen-ti-mét|centimet)\b/i.test(rawASR);

              if (isSameNumber && rawHasNoCm) {
                anomalies.push({
                  type: "UNIT_SCALE_JUMP",
                  severity: "CRITICAL",
                  message: `Phát hiện nhảy vọt đơn vị đo x10 lần: ${rawM.rawMatch} (trong câu đọc) biến thành ${propM.rawMatch} (trong văn bản đề xuất).`,
                  details: {
                    rawMeasurement: rawM.rawMatch,
                    proposedMeasurement: propM.rawMatch,
                    factor: 10
                  }
                });
              }
            }
          }
        }
      }

      // B. Kiểm tra ngưỡng giải phẫu phi lý
      // Nốt phổi đo bằng cm hoặc > 40mm
      const lungNoduleMatch = proposedText.match(/(?:nốt|nodule)[^.\n]*(?:phổi|thùy)[^.\n]*?(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
      if (lungNoduleMatch) {
        const val = parseFloat(lungNoduleMatch[1].replace(",", "."));
        const unit = lungNoduleMatch[2].toLowerCase();
        if (unit === "cm" && val >= 1.0) {
          anomalies.push({
            type: "ANATOMICAL_PLAUSIBILITY",
            severity: "HIGH",
            message: `Nốt phổi được ghi nhận bằng cm (${lungNoduleMatch[0]}). Nốt phổi thông thường được đo bằng mm (hoặc là khối u lớn > 3cm). Cần kiểm tra lại đơn vị.`
          });
        }
      }

      // Sỏi niệu quản đo bằng cm hoặc > 20mm
      const ureterStoneMatch = proposedText.match(/(?:sỏi\s+niệu\s+quản)[^.\n]*?(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
      if (ureterStoneMatch) {
        const val = parseFloat(ureterStoneMatch[1].replace(",", "."));
        const unit = ureterStoneMatch[2].toLowerCase();
        if (unit === "cm" || (unit === "mm" && val > 20)) {
          anomalies.push({
            type: "ANATOMICAL_PLAUSIBILITY",
            severity: "HIGH",
            message: `Sỏi niệu quản có kích thước bất thường (${ureterStoneMatch[0]}). Sỏi niệu quản hiếm khi vượt quá 20mm. Cần kiểm tra lại.`
          });
        }
      }

      return anomalies;
    },

    /**
     * Trích xuất các bên giải phẫu gắn liền với TỔN THƯƠNG BỆNH LÝ của một cơ quan
     */
    getLesionSides(text, organ) {
      if (!text) return [];
      const sides = [];
      const lesions = "sỏi|nang|nốt|khối|u|tràn\\s*dịch|tràn\\s*khí|gãy\\s*xương|đám\\s*mờ|thâm\\s*nhiễm|vôi\\s*hóa|tổn\\s*thương|giãn|ứ\\s*nước";

      // Pattern 1: [Tổn thương] + [Cơ quan] + [Bên] (không nhảy qua ranh giới mệnh đề , ; . \n)
      const regex1 = new RegExp(`(?:${lesions})[^,;.!\\n]{0,35}?\\b${organ}\\s*(phải|trái)\\b`, "gi");

      // Pattern 2: [Cơ quan] + [Bên] + [có/thấy/hình ảnh] + [Tổn thương] (không nhảy qua ranh giới mệnh đề , ; . \n)
      const regex2 = new RegExp(`\\b${organ}\\s*(phải|trái)\\b[^,;.!\\n]{0,35}?(?:có|thấy|xuất\\s*hiện|hình\\s*ảnh|nghi|theo\\s*dõi)?[^,;.!\\n]{0,15}?(?:${lesions})`, "gi");

      // Pattern 3: Cụm trực tiếp "thùy trên phổi phải", "màng phổi trái"
      const regex3 = new RegExp(`(?:tràn\\s*dịch|tràn\\s*khí|dày)[^,;.!\\n]{0,25}?\\b${organ}[^,;.!\\n]{0,15}?\\b(phải|trái)\\b`, "gi");

      let m;
      while ((m = regex1.exec(text)) !== null) sides.push(m[1].toLowerCase());
      while ((m = regex2.exec(text)) !== null) sides.push(m[1].toLowerCase());
      while ((m = regex3.exec(text)) !== null) sides.push(m[1].toLowerCase());

      return Array.from(new Set(sides));
    },

    /**
     * 2. Kiểm tra đảo chiều giải phẫu (Laterality Inversion / Mismatch)
     */
    checkLateralityAnomaly(rawASR, proposedText, proposedMota = "", proposedKetluan = "") {
      const anomalies = [];
      const rawLower = (rawASR || "").toLowerCase();
      const propLower = (proposedText || "").toLowerCase();

      // Duyệt qua các cơ quan 2 bên
      for (const organ of this.BILATERAL_ORGANS) {
        // So khớp bên mang tổn thương
        const rawSides = this.getLesionSides(rawLower, organ);
        const propSides = this.getLesionSides(propLower, organ);

        if (rawSides.includes("phải") && !rawSides.includes("trái") && propSides.includes("trái") && !propSides.includes("phải")) {
          anomalies.push({
            type: "LATERALITY_INVERSION",
            severity: "CRITICAL",
            message: `Phát hiện đảo chiều giải phẫu nguy hiểm: Câu đọc gốc nói '${organ} PHẢI' có tổn thương nhưng văn bản ghi '${organ} TRÁI'.`,
            details: { organ, rawSide: "phải", proposedSide: "trái" }
          });
        } else if (rawSides.includes("trái") && !rawSides.includes("phải") && propSides.includes("phải") && !propSides.includes("trái")) {
          anomalies.push({
            type: "LATERALITY_INVERSION",
            severity: "CRITICAL",
            message: `Phát hiện đảo chiều giải phẫu nguy hiểm: Câu đọc gốc nói '${organ} TRÁI' có tổn thương nhưng văn bản ghi '${organ} PHẢI'.`,
            details: { organ, rawSide: "trái", proposedSide: "phải" }
          });
        }
      }

      // Kiểm tra mâu thuẫn chéo giữa Mô tả và Kết luận
      if (proposedMota && proposedKetluan) {
        const motaLower = proposedMota.toLowerCase();
        const klLower = proposedKetluan.toLowerCase();

        for (const organ of this.BILATERAL_ORGANS) {
          const motaSides = this.getLesionSides(motaLower, organ);
          const klSides = this.getLesionSides(klLower, organ);

          if (motaSides.includes("phải") && !motaSides.includes("trái") && klSides.includes("trái") && !klSides.includes("phải")) {
            anomalies.push({
              type: "CROSS_SECTION_MISMATCH",
              severity: "CRITICAL",
              message: `Mâu thuẫn giữa Mô tả và Kết luận: Mô tả ghi '${organ} phải' nhưng Kết luận lại ghi '${organ} trái'.`,
              details: { organ, motaSide: "phải", klSide: "trái" }
            });
          } else if (motaSides.includes("trái") && !motaSides.includes("phải") && klSides.includes("phải") && !klSides.includes("trái")) {
            anomalies.push({
              type: "CROSS_SECTION_MISMATCH",
              severity: "CRITICAL",
              message: `Mâu thuẫn giữa Mô tả và Kết luận: Mô tả ghi '${organ} trái' nhưng Kết luận lại ghi '${organ} phải'.`,
              details: { organ, motaSide: "trái", klSide: "phải" }
            });
          }
        }
      }

      return anomalies;
    },

    /**
     * 3. Kiểm tra đảo cực lâm sàng do mất từ phủ định (Polarity Inversion / Negation Drop)
     */
    checkPolarityAnomaly(rawASR, proposedText) {
      const anomalies = [];
      const rawLower = (rawASR || "").toLowerCase();
      const propLower = (proposedText || "").toLowerCase();

      for (const entity of this.PATHOLOGY_ENTITIES) {
        // Kiểm tra xem entity có xuất hiện trong raw và proposed không
        const inRaw = rawLower.includes(entity);
        const inProp = propLower.includes(entity);

        if (!inRaw && !inProp) continue;

        // Kiểm tra xem entity có đi kèm phủ định trong rawASR không
        // Regex: (không|chưa|không thấy...) đi trước entity trong vòng 20 ký tự
        const negPrefixRegex = new RegExp(`(?:không|chưa|không\\s+thấy|không\\s+có|chưa\\s+thấy|không\\s+ghi\\s+nhận|chưa\\s+phát\\s+hiện)[^.,;\\n]{0,25}\\b${entity}\\b`, "i");
        const rawIsNegated = negPrefixRegex.test(rawLower);
        const propIsNegated = negPrefixRegex.test(propLower);

        // Trường hợp A: Raw ASR có phủ định (bình thường), nhưng văn bản đề xuất MẤT PHỦ ĐỊNH (khẳng định bệnh lý)
        if (inRaw && rawIsNegated && inProp && !propIsNegated) {
          anomalies.push({
            type: "POLARITY_INVERSION",
            severity: "CRITICAL",
            message: `Phát hiện đảo cực lâm sàng (Rụng từ phủ định): Bác sĩ đọc 'KHÔNG THẤY ${entity.toUpperCase()}' nhưng văn bản đề xuất ghi nhận có '${entity.toUpperCase()}'.`,
            details: { entity, rawNegated: true, proposedNegated: false }
          });
        }

        // Trường hợp B: Bác sĩ đọc có bệnh lý (không phủ định), nhưng văn bản lại áp mẫu phủ định (nuốt mất tổn thương)
        const posPrefixRegex = new RegExp(`(?:có|hình\\s*ảnh|thấy|phát\\s*hiện|nhiều|vài|ổ|khối|nốt)[^.,;\\n]{0,25}\\b${entity}\\b`, "i");
        const rawIsPositive = inRaw && !rawIsNegated && (posPrefixRegex.test(rawLower) || /\b(?:tràn\s*dịch|gãy\s*xương|sỏi)\b/i.test(rawLower));

        if (rawIsPositive && inProp && propIsNegated) {
          anomalies.push({
            type: "POLARITY_INVERSION",
            severity: "CRITICAL",
            message: `Phát hiện vô tình nuốt tổn thương: Bác sĩ đọc có '${entity.toUpperCase()}' nhưng văn bản đề xuất lại ghi 'KHÔNG THẤY ${entity.toUpperCase()}'.`,
            details: { entity, rawNegated: false, proposedNegated: true }
          });
        }
      }

      return anomalies;
    },

    /**
     * HÀM KIỂM ĐỊNH TOÀN DIỆN CHÍNH (MAIN VERIFIER)
     * Trả về kết quả đánh giá an toàn, mức độ rủi ro và danh sách cảnh báo chi tiết
     */
    verifyClinicalSafety(rawASR = "", proposedMota = "", proposedKetluan = "", currentMota = "", currentKetluan = "") {
      const fullProposedText = `${proposedMota}\n${proposedKetluan}`;
      const anomalies = [];

      // 1. Kiểm tra đơn vị & kích thước
      anomalies.push(...this.checkUnitScaleAnomaly(rawASR, fullProposedText));

      // 2. Kiểm tra đảo chiều giải phẫu (Trái <-> Phải)
      anomalies.push(...this.checkLateralityAnomaly(rawASR, fullProposedText, proposedMota, proposedKetluan));

      // 3. Kiểm tra đảo cực phủ định (mất từ "không", "chưa")
      anomalies.push(...this.checkPolarityAnomaly(rawASR, fullProposedText));

      // Tính toán mức độ rủi ro tổng hợp
      let riskLevel = "NONE";
      if (anomalies.some(a => a.severity === "CRITICAL")) {
        riskLevel = "CRITICAL";
      } else if (anomalies.some(a => a.severity === "HIGH")) {
        riskLevel = "HIGH";
      } else if (anomalies.length > 0) {
        riskLevel = "LOW";
      }

      return {
        safe: anomalies.length === 0,
        riskLevel: riskLevel,
        anomalies: anomalies,
        rawASR: rawASR,
        summary: anomalies.length > 0 ? anomalies.map(a => a.message).join(" | ") : "Báo cáo an toàn về mặt lâm sàng."
      };
    }
  };

  global.ClinicalSafetyGuard = ClinicalSafetyGuard;
})(typeof window !== "undefined" ? window : globalThis);
