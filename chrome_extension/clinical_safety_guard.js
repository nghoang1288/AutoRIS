/**
 * AutoRIS Clinical Safety & Anomaly Guard Engine
 * Bộ gác cổng an toàn lâm sàng: Phát hiện nhảy vọt đơn vị, đảo chiều giải phẫu và đảo cực phủ định
 * Tuân thủ nguyên tắc: CẢNH BÁO KHÔNG ĐỒNG NGHĨA VỚI TỰ SỬA DỮ LIỆU
 */

(function (global) {
  "use strict";

  const ClinicalSafetyGuard = {
    version: "2.0.0",

    // Danh sách cơ quan có tính đối xứng giải phẫu 2 bên (Đa phương tiện: Thần kinh, Cột sống, Khớp, Tạng)
    BILATERAL_ORGANS: [
      // Cơ quan ngực & bụng
      "phổi", "thận", "niệu quản", "buồng trứng", "tuyến thượng thận", "thượng thận",
      "tinh hoàn", "mắt", "màng phổi", "hạch bẹn", "hạch nách", "đỉnh phổi", "đáy phổi",
      "thùy trên", "thùy dưới", "thùy giữa", "xoang hàm",

      // Thần kinh sọ não (CT / MRI Brain)
      "bán cầu đại não", "bán cầu não", "bán cầu tiểu não", "thùy trán", "thùy thái dương",
      "thùy đỉnh", "thùy chẩm", "nhân đậu", "đồi thị", "rãnh sylvius", "góc cầu tiểu não",

      // Cột sống & Thần kinh ngoại biên (CT / MRI Spine)
      "rễ l1", "rễ l2", "rễ l3", "rễ l4", "rễ l5", "rễ s1", "rễ c5", "rễ c6", "rễ c7", "rễ c8",
      "lỗ tiếp hợp", "khớp liên mấu",

      // Cơ xương khớp (MSK MRI / X-ray)
      "khớp gối", "dây chằng chéo trước", "dây chằng chéo sau", "dây chằng bên trong", "dây chằng bên ngoài",
      "sụn chêm trong", "sụn chêm ngoài", "khớp háng", "khớp vai", "chỏm xương đùi", "khớp cổ chân",
      "xương đùi", "cánh tay",

      // Mạch máu đối xứng (Vascular)
      "động mạch cảnh trong", "động mạch não giữa", "động mạch đốt sống"
    ],

    // Các từ phủ định lâm sàng
    NEGATION_WORDS: [
      "không", "chưa", "chẳng", "không thấy", "không có", "chưa thấy",
      "chưa phát hiện", "không ghi nhận", "không rõ"
    ],

    // Các thực thể tổn thương bệnh học cần giám sát phủ định (Đa phương tiện)
    PATHOLOGY_ENTITIES: [
      "tràn dịch", "tràn khí", "gãy xương", "hạch to", "khối u", "khối choán chỗ",
      "sỏi", "sỏi thận", "sỏi túi mật", "sỏi niệu quản", "giãn phế quản",
      "dày tổ chức kẽ", "dày màng phổi", "tiêu xương", "tổn thương khu trú",
      "ứ nước", "thâm nhiễm", "đám mờ", "nốt mờ", "vôi hóa ác tính",
      "xuất huyết", "chảy máu", "tụ máu", "nhồi máu", "dập não", "phù não",
      "thoát vị đĩa đệm", "phồng đĩa đệm", "rách bao xơ", "chèn ép rễ", "hẹp ống sống",
      "đứt dây chằng", "rách sụn chêm", "phù tủy xương", "phình động mạch", "bóc tách động mạch"
    ],

    /**
     * Trích xuất các số đo kèm đơn vị từ văn bản
     * Hỗ trợ số đo 3 chiều (12x10x8mm), 2 chiều (12x10mm), dải đo (3-5mm, 3 đến 5 mm),
     * số đo thập phân tiếng Việt (12,5mm, 3.5mm), và các đơn vị dân gian (phân, ly, milimet).
     * Trả về mảng các object { val1, val2, val3, maxVal, unit: "mm"|"cm", rawMatch, is3D }
     */
    extractMeasurements(text) {
      if (!text) return [];
      const measurements = [];
      const matched3DRanges = [];

      // 1. Regex cho kích thước 3 chiều (3D): ví dụ 12x10x8 mm hoặc 12 x 10 x 8 mm hoặc 12×10×8mm
      const regex3D = /(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|milimét|milimet|xen-ti-mét|centimet|xentimet|ly|phân)\b/gi;
      let match;
      while ((match = regex3D.exec(text)) !== null) {
        matched3DRanges.push([match.index, match.index + match[0].length]);
        const val1 = parseFloat(match[1].replace(",", "."));
        const val2 = parseFloat(match[2].replace(",", "."));
        const val3 = parseFloat(match[3].replace(",", "."));
        let rawUnit = match[4].toLowerCase();
        let unit = "mm";
        if (rawUnit === "cm" || rawUnit === "xen-ti-mét" || rawUnit === "centimet" || rawUnit === "xentimet" || rawUnit === "phân") unit = "cm";
        if (rawUnit === "ly") unit = "mm";

        measurements.push({
          rawMatch: match[0],
          val1: val1,
          val2: val2,
          val3: val3,
          maxVal: Math.max(val1, val2, val3),
          unit: unit,
          is3D: true
        });
      }

      // 2. Regex cho 1 chiều hoặc 2 chiều hoặc dải (range): ví dụ 12x10mm, 3-5mm, 3 đến 5 mm, 12mm, 3 phân, 5 ly
      const regex2D = /(\d+(?:[.,]\d+)?)\s*(?:(?:x|×|\*|\s+đến\s+|\s*-\s*)\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|milimét|milimet|xen-ti-mét|centimet|xentimet|ly|phân)\b/gi;
      while ((match = regex2D.exec(text)) !== null) {
        // Tránh trùng lặp nếu vị trí nằm trọn trong cấu trúc 3D đã trích xuất trước đó
        const isInside3D = matched3DRanges.some(([start, end]) => match.index >= start && match.index < end);
        if (isInside3D) continue;

        const val1 = parseFloat(match[1].replace(",", "."));
        const val2 = match[2] ? parseFloat(match[2].replace(",", ".")) : null;
        let rawUnit = match[3].toLowerCase();
        let unit = "mm";
        if (rawUnit === "cm" || rawUnit === "xen-ti-mét" || rawUnit === "centimet" || rawUnit === "xentimet" || rawUnit === "phân") unit = "cm";
        if (rawUnit === "ly") unit = "mm";

        measurements.push({
          rawMatch: match[0],
          val1: val1,
          val2: val2,
          val3: null,
          maxVal: val2 ? Math.max(val1, val2) : val1,
          unit: unit,
          is3D: false
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

      // A. Nhảy vọt hoặc sụt giảm đơn vị đo x10 lần (mm <-> cm)
      // Sử dụng Multiset Balance Accounting chống bỏ lọt đa thực thể (multi-entity collision)
      // Bắt trọn vẹn case: "U gan 12 cm, nang thận 12 mm" -> "U gan 12 mm, nang thận 12 mm"
      const getNumUnitList = (measurements) => {
        const list = [];
        for (const m of measurements) {
          const vals = [m.val1, m.val2, m.val3].filter(v => v !== null && v !== undefined);
          for (const v of vals) {
            list.push({ val: Math.round(v * 10) / 10, unit: m.unit, rawMatch: m.rawMatch });
          }
        }
        return list;
      };

      const rawList = getNumUnitList(rawMeasurements);
      const propList = getNumUnitList(proposedMeasurements);
      const allVals = Array.from(new Set([...rawList.map(x => x.val), ...propList.map(x => x.val)]));
      const seenRawMatches = new Set();

      for (const v of allVals) {
        const rawMm = rawList.filter(x => Math.abs(x.val - v) < 0.1 && x.unit === "mm").length;
        const rawCm = rawList.filter(x => Math.abs(x.val - v) < 0.1 && x.unit === "cm").length;
        const propMm = propList.filter(x => Math.abs(x.val - v) < 0.1 && x.unit === "mm").length;
        const propCm = propList.filter(x => Math.abs(x.val - v) < 0.1 && x.unit === "cm").length;

        // Hướng 1: raw mm -> prop cm (phóng to x10 lần: số lượng cm tăng lên trong khi số lượng mm giảm đi)
        if (propCm > rawCm && propMm < rawMm) {
          const rawItem = rawList.find(x => Math.abs(x.val - v) < 0.1 && x.unit === "mm");
          const propItem = propList.find(x => Math.abs(x.val - v) < 0.1 && x.unit === "cm");
          const matchKey = `UP_${rawItem ? rawItem.rawMatch : v}`;
          if (!seenRawMatches.has(matchKey)) {
            seenRawMatches.add(matchKey);
            anomalies.push({
              type: "UNIT_SCALE_JUMP",
              severity: "CRITICAL",
              message: `Phát hiện nhảy vọt đơn vị đo x10 lần: ${rawItem ? rawItem.rawMatch : v + " mm"} (trong câu đọc) biến thành ${propItem ? propItem.rawMatch : v + " cm"} (trong văn bản đề xuất).`,
              details: {
                rawMeasurement: rawItem ? rawItem.rawMatch : `${v} mm`,
                proposedMeasurement: propItem ? propItem.rawMatch : `${v} cm`,
                factor: 10
              }
            });
          }
        }

        // Hướng 2: raw cm -> prop mm (thu nhỏ 10 lần: số lượng mm tăng lên trong khi số lượng cm giảm đi)
        if (propMm > rawMm && propCm < rawCm) {
          const rawItem = rawList.find(x => Math.abs(x.val - v) < 0.1 && x.unit === "cm");
          const propItem = propList.find(x => Math.abs(x.val - v) < 0.1 && x.unit === "mm");
          const matchKey = `DOWN_${rawItem ? rawItem.rawMatch : v}`;
          if (!seenRawMatches.has(matchKey)) {
            seenRawMatches.add(matchKey);
            anomalies.push({
              type: "UNIT_SCALE_JUMP",
              severity: "CRITICAL",
              message: `Phát hiện sụt giảm đơn vị đo 10 lần: ${rawItem ? rawItem.rawMatch : v + " cm"} (trong câu đọc) biến thành ${propItem ? propItem.rawMatch : v + " mm"} (trong văn bản đề xuất).`,
              details: {
                rawMeasurement: rawItem ? rawItem.rawMatch : `${v} cm`,
                proposedMeasurement: propItem ? propItem.rawMatch : `${v} mm`,
                factor: 0.1
              }
            });
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
      if (!text) {
        const emptyArr = [];
        emptyArr.isBilateral = false;
        return emptyArr;
      }
      const sides = [];
      let isBilateral = false;
      const lesions = "sỏi|nang|nốt|khối|u|tràn\\s*dịch|tràn\\s*khí|gãy\\s*xương|đám\\s*mờ|thâm\\s*nhiễm|vôi\\s*hóa|vôi\\s*hoá|tổn\\s*thương|giãn|ứ\\s*nước|xuất\\s*huyết|chảy\\s*máu|tụ\\s*máu|nhồi\\s*máu|dập\\s*não|thoát\\s*vị|phồng|rách|đứt|chèn\\s*ép|hẹp";

      // Pattern 0: Cụm từ 2 bên (Bilateral)
      const bilateralRegex = new RegExp(`(?:(?:hai|2|cả\\s+hai)\\s+${organ}|${organ}[^.,;\\n]{0,25}?(?:hai|2|cả\\s+hai)\\s*bên|${organ}[^.,;\\n]{0,25}?(?:rải\\s*rác\\s*hai\\s*bên)|(?:rải\\s*rác\\s*hai\\s*bên)[^.,;\\n]{0,25}?${organ})`, "gi");
      if (bilateralRegex.test(text)) {
        isBilateral = true;
        sides.push("phải", "trái", "hai bên");
      }

      // Pattern 1: [Tổn thương] + [Cơ quan] + [Bên] (không nhảy qua ranh giới mệnh đề , ; . \n)
      const regex1 = new RegExp(`(?:${lesions})[^,;.!\\n]{0,35}?\\b${organ}(?:\\s+bên)?\\s*(phải|trái)\\b`, "gi");

      // Pattern 2: [Cơ quan] + [Bên] + [có/thấy/hình ảnh] + [Tổn thương] (không nhảy qua ranh giới mệnh đề , ; . \n)
      const regex2 = new RegExp(`\\b${organ}(?:\\s+bên)?\\s*(phải|trái)\\b[^,;.!\\n]{0,35}?(?:có|thấy|xuất\\s*hiện|hình\\s*ảnh|nghi|theo\\s*dõi)?[^,;.!\\n]{0,15}?(?:${lesions})`, "gi");

      // Pattern 3: Cụm trực tiếp "thùy trên phổi phải", "màng phổi trái", "khớp gối phải"
      const regex3 = new RegExp(`(?:tràn\\s*dịch|tràn\\s*khí|dày|đứt|rách|thoát\\s*vị|chèn\\s*ép)[^,;.!\\n]{0,35}?\\b${organ}[^,;.!\\n]{0,15}?(?:\\s+bên)?\\s*(phải|trái)\\b`, "gi");

      let m;
      while ((m = regex1.exec(text)) !== null) sides.push(m[1].toLowerCase());
      while ((m = regex2.exec(text)) !== null) sides.push(m[1].toLowerCase());
      while ((m = regex3.exec(text)) !== null) sides.push(m[1].toLowerCase());

      const uniqueSides = Array.from(new Set(sides));
      if (uniqueSides.includes("phải") && uniqueSides.includes("trái")) {
        isBilateral = true;
      }
      uniqueSides.isBilateral = isBilateral;
      return uniqueSides;
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

        // 1. Đảo bên đối lập (Phải <-> Trái)
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

        // 2. Mâu thuẫn 1 bên thành 2 bên (Unilateral -> Bilateral Hallucination)
        if (rawSides.length > 0 && propSides.length > 0) {
          if (!rawSides.isBilateral && propSides.isBilateral) {
            const side = rawSides.includes("phải") ? "phải" : "trái";
            anomalies.push({
              type: "LATERALITY_INVERSION",
              severity: "CRITICAL",
              message: `Phát hiện biến đổi từ 1 bên thành 2 bên: Câu đọc gốc chỉ nói '${organ} ${side.toUpperCase()}' nhưng văn bản ghi nhận '${organ} HAI BÊN'.`,
              details: { organ, rawSide: side, proposedSide: "hai bên" }
            });
          }
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
          } else if (!motaSides.isBilateral && motaSides.length > 0 && klSides.isBilateral) {
            const side = motaSides.includes("phải") ? "phải" : "trái";
            anomalies.push({
              type: "CROSS_SECTION_MISMATCH",
              severity: "CRITICAL",
              message: `Mâu thuẫn giữa Mô tả và Kết luận: Mô tả ghi '${organ} ${side}' nhưng Kết luận lại ghi '${organ} hai bên'.`,
              details: { organ, motaSide: side, klSide: "hai bên" }
            });
          }
        }
      }

      return anomalies;
    },

    /**
     * Xác định xem một thực thể tổn thương có bị phủ định trong văn bản hay không
     * Bóc tách các cụm nghi ngờ bệnh học ("không loại trừ", "chưa loại trừ") và chặn hiện tượng lan truyền phủ định
     */
    isEntityNegated(text, entity, allEntities = []) {
      if (!text || !entity) return false;
      const lower = text.toLowerCase();

      const entityIndices = [];
      let idx = 0;
      while ((idx = lower.indexOf(entity, idx)) !== -1) {
        entityIndices.push(idx);
        idx += entity.length;
      }
      if (entityIndices.length === 0) return false;

      // Cụm từ nghi ngờ bệnh lý lâm sàng (pseudo-negation) -> KHÔNG PHẢI PHỦ ĐỊNH
      const pseudoNegRegex = /(?:chưa\s+thể\s+loại\s+trừ|không\s+thể\s+loại\s+trừ|chưa\s+loại\s+trừ|không\s+loại\s+trừ|không\s+thể\s+loại\s+bỏ|chưa\s+thể\s+loại\s+bỏ|ít\s+nghĩ\s+đến\s+nhưng\s+chưa\s+loại\s+trừ)/i;
      // Đặt các cụm từ dài lên trước để tránh match 'không' trước 'không thấy'
      const standardNegRegex = /(?:không\s+thấy|chưa\s+thấy|không\s+có|chưa\s+có|không\s+ghi\s+nhận|chưa\s+ghi\s+nhận|chưa\s+phát\s+hiện|không\s+phát\s+hiện|không\s+rõ|không|chưa|chẳng)/i;
      const positiveAffirmationRegex = /(?:\bcó\b|\bxuất\s+hiện\b|\bhình\s+ảnh\b)/i;

      for (const pos of entityIndices) {
        const start = Math.max(0, pos - 45);
        const precedingText = lower.slice(start, pos);

        // Cắt theo dấu ngắt câu hoặc mệnh đề nếu có
        const lastDelim = Math.max(
          precedingText.lastIndexOf("."),
          precedingText.lastIndexOf(";"),
          precedingText.lastIndexOf("\n"),
          precedingText.lastIndexOf(",")
        );
        const windowText = lastDelim !== -1 ? precedingText.slice(lastDelim + 1) : precedingText;

        // 1. Kiểm tra cụm nghi ngờ bệnh lý (pseudo-negation)
        if (pseudoNegRegex.test(windowText)) {
          continue; // Nghi ngờ bệnh lý, không phải phủ định
        }

        // 2. Kiểm tra từ phủ định chuẩn
        const negMatch = windowText.match(standardNegRegex);
        if (negMatch) {
          const textAfterNeg = windowText.slice(negMatch.index + negMatch[0].length);

          // 2a. Nếu giữa từ phủ định và tổn thương có từ khẳng định dương tính (ví dụ: "không sỏi CÓ tràn dịch")
          if (positiveAffirmationRegex.test(textAfterNeg)) {
            continue; // Phủ định thuộc về cơ quan/tổn thương trước
          }

          // 2b. Nếu giữa từ phủ định và tổn thương có một thực thể bệnh học khác (ví dụ: "không sỏi thận ứ nước")
          let hasInterveningEntity = false;
          for (const otherEntity of allEntities) {
            if (otherEntity !== entity && otherEntity.length > 2 && textAfterNeg.includes(otherEntity)) {
              hasInterveningEntity = true;
              break;
            }
          }
          if (hasInterveningEntity) {
            continue; // Phủ định đã được thực thể khác hấp thụ
          }

          return true; // Xác nhận có phủ định tổn thương này
        }
      }

      return false;
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

        const rawIsNegated = this.isEntityNegated(rawLower, entity, this.PATHOLOGY_ENTITIES);
        const propIsNegated = this.isEntityNegated(propLower, entity, this.PATHOLOGY_ENTITIES);

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
     * 4. Kiểm tra nhầm lẫn thuật ngữ vật lý xuyên phương tiện (Cross-Modality Confusion)
     */
    checkCrossModalityAnomaly(modality = "", proposedText = "") {
      if (!proposedText) return [];
      const anomalies = [];
      const textLower = proposedText.toLowerCase();

      // Nếu không truyền rõ modality, cố gắng phát hiện từ văn bản
      let activeModality = modality ? modality.toUpperCase() : "";
      if (!activeModality) {
        if (/(?:cộng\s*hưởng\s*từ|cht|mri|chuỗi\s*xung|t1w|t2w|flair|dwi)/i.test(textLower)) activeModality = "MRI";
        else if (/(?:cắt\s*lớp\s*vi\s*tính|clvt|ct\s*scanner|\bct\b|hounsfield)/i.test(textLower)) activeModality = "CT";
        else if (/(?:x\s*[-]?\s*quang|radiography|\bxray\b)/i.test(textLower)) activeModality = "XR";
        else if (/(?:siêu\s*âm|ultrasound|doppler)/i.test(textLower)) activeModality = "US";
      }
      if (!activeModality) return [];

      const US_ONLY_TERMS = [
        { term: "giảm âm", label: "thuật ngữ siêu âm 'giảm âm'" },
        { term: "tăng âm", label: "thuật ngữ siêu âm 'tăng âm'" },
        { term: "trống âm", label: "thuật ngữ siêu âm 'trống âm'" },
        { term: "bóng lưng", label: "thuật ngữ siêu âm 'bóng lưng'" },
        { term: "tăng âm thành sau", label: "thuật ngữ siêu âm 'tăng âm thành sau'" }
      ];

      const CT_ONLY_TERMS = [
        { term: "tỷ trọng", label: "thuật ngữ CT 'tỷ trọng'" },
        { term: "tăng tỷ trọng", label: "thuật ngữ CT 'tăng tỷ trọng'" },
        { term: "giảm tỷ trọng", label: "thuật ngữ CT 'giảm tỷ trọng'" },
        { term: "hounsfield", label: "đơn vị CT 'Hounsfield (HU)'" }
      ];

      const MRI_ONLY_TERMS = [
        { term: "hạn chế khuếch tán", label: "thuật ngữ MRI 'hạn chế khuếch tán (DWI)'" },
        { term: "tăng tín hiệu", label: "thuật ngữ MRI 'tăng tín hiệu'" },
        { term: "giảm tín hiệu", label: "thuật ngữ MRI 'giảm tín hiệu'" },
        { term: "chuỗi xung", label: "thuật ngữ MRI 'chuỗi xung'" },
        { term: "flair", label: "chuỗi xung MRI 'FLAIR'" },
        { term: "dwi", label: "chuỗi xung MRI 'DWI'" },
        { term: "t1w", label: "chuỗi xung MRI 'T1W'" },
        { term: "t2w", label: "chuỗi xung MRI 'T2W'" }
      ];

      // Nếu là CT hoặc MRI hoặc XR nhưng dùng từ siêu âm
      if (activeModality === "CT" || activeModality === "MRI" || activeModality === "XR") {
        for (const item of US_ONLY_TERMS) {
          if (textLower.includes(item.term)) {
            anomalies.push({
              type: "CROSS_MODALITY_CONFUSION",
              severity: "CRITICAL",
              message: `Nhầm lẫn vật lý: Sử dụng ${item.label} trong báo cáo ${activeModality}. Kết quả ${activeModality} phải dùng đúng thuật ngữ tỷ trọng hoặc tín hiệu!`,
              details: { modality: activeModality, term: item.term }
            });
          }
        }
      }

      // Nếu là Siêu âm nhưng dùng từ CT hoặc MRI
      if (activeModality === "US") {
        for (const item of CT_ONLY_TERMS) {
          if (textLower.includes(item.term)) {
            anomalies.push({
              type: "CROSS_MODALITY_CONFUSION",
              severity: "CRITICAL",
              message: `Nhầm lẫn vật lý: Sử dụng ${item.label} trong kết quả Siêu âm!`,
              details: { modality: activeModality, term: item.term }
            });
          }
        }
        for (const item of MRI_ONLY_TERMS) {
          if (textLower.includes(item.term)) {
            anomalies.push({
              type: "CROSS_MODALITY_CONFUSION",
              severity: "CRITICAL",
              message: `Nhầm lẫn vật lý: Sử dụng ${item.label} trong kết quả Siêu âm!`,
              details: { modality: activeModality, term: item.term }
            });
          }
        }
      }

      // Nếu là CT nhưng dùng từ MRI
      if (activeModality === "CT") {
        for (const item of MRI_ONLY_TERMS) {
          if (textLower.includes(item.term)) {
            anomalies.push({
              type: "CROSS_MODALITY_CONFUSION",
              severity: "CRITICAL",
              message: `Nhầm lẫn vật lý: Sử dụng ${item.label} trong kết quả Cắt lớp vi tính (CT)!`,
              details: { modality: activeModality, term: item.term }
            });
          }
        }
      }

      return anomalies;
    },

    /**
     * 5. Giám sát các chỉ số nguy cơ đỏ cấp cứu (Red-Flag Emergency Monitor)
     */
    checkRedFlagAnomalies(proposedText = "") {
      if (!proposedText) return [];
      const anomalies = [];

      // 1. Đè đẩy / di lệch đường giữa sọ não > 5mm (Nguy cơ tụt kẹt não)
      const midlineMatch = proposedText.match(/(?:di\s*lệch|đè\s*đẩy|lệch|đẩy\s*lệch)\s*(?:cấu\s*trúc\s*)?(?:đường\s*giữa)[^.\n]*?(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
      if (midlineMatch) {
        let val = parseFloat(midlineMatch[1].replace(",", "."));
        const unit = midlineMatch[2].toLowerCase();
        if (unit === "cm") val *= 10;
        if (val > 5.0) {
          anomalies.push({
            type: "RED_FLAG_EMERGENCY",
            severity: "CRITICAL",
            message: `BÁO ĐỘNG ĐỎ CẤP CỨU: Đường giữa di lệch ${val} mm (> 5mm). Nguy cơ tụt kẹt não đe dọa tính mạng!`,
            details: { indicator: "midline_shift", value: val, unit: "mm" }
          });
        }
      }

      // 2. Máu tụ ngoài/dưới màng cứng bề dày > 10mm (Chỉ định mổ cấp cứu)
      const hematomaMatch = proposedText.match(/(?:máu\s*tụ|tụ\s*máu)[^.\n]*?(?:bề\s*dày|dày|đo\s*được)[^.\n]*?(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
      if (hematomaMatch) {
        let val = parseFloat(hematomaMatch[1].replace(",", "."));
        const unit = hematomaMatch[2].toLowerCase();
        if (unit === "cm") val *= 10;
        if (val > 10.0) {
          anomalies.push({
            type: "RED_FLAG_EMERGENCY",
            severity: "CRITICAL",
            message: `BÁO ĐỘNG ĐỎ: Khối máu tụ nội sọ có bề dày ${val} mm (> 10mm). Nguy cơ chèn ép não nặng, có chỉ định phẫu thuật khẩn cấp!`,
            details: { indicator: "hematoma_thickness", value: val, unit: "mm" }
          });
        }
      }

      // 3. Phình động mạch chủ (AAA) >= 50mm (Nguy cơ vỡ phình)
      const aaaMatch = proposedText.match(/(?:phình\s*(?:động\s*mạch\s*chủ|đmc\s*bụng|đmc\s*ngực)|đmc\s*bụng\s*đo\s*được)[^.\n]*?(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
      if (aaaMatch) {
        let val = parseFloat(aaaMatch[1].replace(",", "."));
        const unit = aaaMatch[2].toLowerCase();
        if (unit === "cm") val *= 10;
        if (val >= 50.0) {
          anomalies.push({
            type: "RED_FLAG_EMERGENCY",
            severity: "CRITICAL",
            message: `BÁO ĐỘNG ĐỎ: Khối phình ĐMC có đường kính ${val} mm (>= 50mm). Nguy cơ vỡ phình cấp, cần hội chẩn ngoại mạch máu khẩn cấp!`,
            details: { indicator: "aortic_aneurysm", value: val, unit: "mm" }
          });
        }
      }

      // 4. Hẹp ống sống tuyệt đối < 10mm
      const canalMatch = proposedText.match(/(?:đường\s*kính\s*trước\s*sau\s*ống\s*sống|ống\s*sống\s*đo\s*được|kích\s*thước\s*ống\s*sống)[^.\n]*?(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
      if (canalMatch) {
        let val = parseFloat(canalMatch[1].replace(",", "."));
        const unit = canalMatch[2].toLowerCase();
        if (unit === "cm") val *= 10;
        if (val < 10.0) {
          anomalies.push({
            type: "RED_FLAG_ANATOMY",
            severity: "HIGH",
            message: `CẢNH BÁO: Đường kính ống sống ${val} mm (< 10mm). Mức độ hẹp ống sống tuyệt đối, nguy cơ chèn ép tủy/chùm đuôi ngựa!`,
            details: { indicator: "spinal_canal_stenosis", value: val, unit: "mm" }
          });
        }
      }

      return anomalies;
    },

    /**
     * HÀM KIỂM ĐỊNH TOÀN DIỆN CHÍNH (MAIN VERIFIER)
     * Trả về kết quả đánh giá an toàn, mức độ rủi ro và danh sách cảnh báo chi tiết
     */
    verifyClinicalSafety(rawASR = "", proposedMota = "", proposedKetluan = "", currentMota = "", currentKetluan = "", modality = "") {
      const fullProposedText = `${proposedMota}\n${proposedKetluan}`;
      const anomalies = [];

      // 1. Kiểm tra đơn vị & kích thước
      anomalies.push(...this.checkUnitScaleAnomaly(rawASR, fullProposedText));

      // 2. Kiểm tra đảo chiều giải phẫu (Trái <-> Phải)
      anomalies.push(...this.checkLateralityAnomaly(rawASR, fullProposedText, proposedMota, proposedKetluan));

      // 3. Kiểm tra đảo cực phủ định (mất từ "không", "chưa")
      anomalies.push(...this.checkPolarityAnomaly(rawASR, fullProposedText));

      // 4. Kiểm tra nhầm lẫn thuật ngữ vật lý xuyên phương tiện (Cross-Modality)
      anomalies.push(...this.checkCrossModalityAnomaly(modality, fullProposedText));

      // 5. Kiểm tra các chỉ số nguy cơ đỏ cấp cứu (Red-Flags)
      anomalies.push(...this.checkRedFlagAnomalies(fullProposedText));

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
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ClinicalSafetyGuard };
  }
})(typeof window !== "undefined" ? window : globalThis);
