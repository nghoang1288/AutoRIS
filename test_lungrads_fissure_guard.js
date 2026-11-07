/**
 * test_lungrads_fissure_guard.js - Unit tests for Interlobar Fissure & Calcified Nodule Consistency Guard
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Load clinical_synthesizer and defaults
const defaultsCode = fs.readFileSync(path.join(__dirname, "chrome_extension", "defaults.js"), "utf-8");
eval(defaultsCode);

const synthesizerCode = fs.readFileSync(path.join(__dirname, "clinical_synthesizer.js"), "utf-8");
eval(synthesizerCode);

console.log("=== KIỂM THỬ BỘ ĐỒNG BỘ NỐT RÃNH LIÊN THUỲ & VÔI HOÁ LUNGRAD-S (10 TESTS) ===");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

// Case 1: fb_20261107_024319_399370 (Missing 4x4mm calcified nodule in oblique fissure of right lung)
runTest("Ca lâm sàng fb_20261107_024319: Bổ sung nốt vôi hoá 4x4mm rãnh liên thuỳ chếch phổi phải", () => {
  const rawInput = `Multiple nodules are found in the lungs. 
Solid nodule measuring 3×2mm, right upper lobe/apical segment  (SE304, IM73). 
Solid nodule measuring 3×2mm, left upper lobe/anterior segment  (SE304, IM134). 
Solid nodule measuring 3×2mm, left upper lobe/apicoposterior segment  (SE304, IM163). 
Solid nodule measuring 3×2mm, left upper lobe/inferior lingular segment  (SE304, IM250). 
Calcified nodule measuring 4×4mm, oblique fissure of right lung  (SE304, IM269). 
Pure ground glass nodule measuring 16×8mm, right lower lobe/anterior basal segment  (SE304, IM334), demonstrating sign(s) of Pleural indentation.`;

  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Thuỳ dưới có 1 nốt kính mờ kích thước 16×8 mm (đường kính trung bình 12 mm), co kéo màng phổi. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: Thuỳ trên có 3 nốt đặc, nốt lớn kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt kính mờ thuỳ dưới phổi phải (Lung-RADS 3). Vài nốt đặc hai phổi (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  assert(fixed.includes("Rãnh liên thuỳ chếch có 1 nốt vôi hoá kích thước 4×4 mm."), "Phải có mô tả nốt vôi hoá ở rãnh liên thuỳ chếch");
  assert(fixed.includes("-- Phổi phải: Thuỳ trên có 1 nốt đặc"), "Giữ nguyên mô tả thuỳ trên phổi phải");
  assert(!fixed.includes("-- Phổi trái: Thuỳ trên có 3 nốt đặc, nốt lớn kích thước 3×2 mm (đường kính trung bình 2.5 mm). Có 1 nốt vôi hoá."), "Không được nhầm sang phổi trái");
  assert(fixed.includes("Nốt vôi hoá phổi phải (Lung-RADS 1)."), "Giữ nguyên kết luận nốt vôi hoá phổi phải");
});

// Case 2: Oblique fissure nodule in left lung
runTest("Nốt ở rãnh liên thuỳ chếch phổi trái được đưa vào dòng phổi trái", () => {
  const rawInput = `Solid nodule measuring 4×3mm, oblique fissure of left lung  (SE3, IM299).`;
  const aiReport = `-- Phổi phải: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc hai phổi (Lung-RADS 2).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  assert(fixed.includes("Rãnh liên thuỳ chếch có 1 nốt đặc kích thước 4×3 mm (đường kính trung bình 3.5 mm)."), "Phải bổ sung nốt rãnh liên thuỳ chếch phổi trái");
  assert(!fixed.split("\n")[0].includes("Rãnh liên thuỳ chếch"), "Phổi phải không được bị thêm");
});

// Case 3: Horizontal fissure nodule in right lung
runTest("Nốt ở rãnh liên thuỳ ngang phổi phải được nhận diện chuẩn xác", () => {
  const rawInput = `Calcified nodule measuring 5×3mm, horizontal fissure of right lung  (SE3, IM120).`;
  const aiReport = `-- Phổi phải: Thuỳ dưới có 1 nốt đặc kích thước 4×4 mm (đường kính trung bình 4 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ dưới phổi phải (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  assert(fixed.includes("Rãnh liên thuỳ ngang có 1 nốt vôi hoá kích thước 5×3 mm."), "Phải có nốt vôi hoá rãnh liên thuỳ ngang");
});

// Case 4: No rawText passed, but Conclusion has calcified nodule missing from description
runTest("Khi không có rawText: Tự động cứu vãn nốt vôi hoá từ Kết luận vào Mô tả", () => {
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  assert(fixed.includes("Có 1 nốt vôi hoá."), "Phải tự động chèn mô tả nốt vôi hoá vào phổi phải");
  assert(!fixed.split("\n")[1].includes("vôi hoá"), "Phổi trái không bị chèn nốt vôi hoá");
});

// Case 5: When AI already included fissure nodule, do NOT duplicate
runTest("Không nhân đôi nốt rãnh liên thuỳ nếu AI đã mô tả", () => {
  const rawInput = `Calcified nodule measuring 4×4mm, oblique fissure of right lung  (SE304, IM269).`;
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Rãnh liên thuỳ chếch có 1 nốt vôi hoá kích thước 4×4 mm. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  const countMatches = (fixed.match(/4×4\s*mm/g) || []).length;
  assert.strictEqual(countMatches, 1, "Không được nhân đôi kích thước 4x4 mm");
});

// Case 6: Multiple lobes and fissure nodules in both lungs
runTest("Hỗ trợ nốt vôi hoá ở cả hai phổi từ kết luận", () => {
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: Thuỳ dưới có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh vài nốt đặc hai phổi (Lung-RADS 2). Vài nốt vôi hoá hai phổi (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  const pPhai = fixed.split("\n")[0];
  const pTrai = fixed.split("\n")[1];
  assert(pPhai.includes("vôi hoá"), "Phổi phải phải có vôi hoá");
  assert(pTrai.includes("vôi hoá"), "Phổi trái phải có vôi hoá");
});

// Case 7: Pure ground glass nodule in oblique fissure
runTest("Nốt kính mờ ở rãnh liên thuỳ chếch tính chuẩn đường kính trung bình", () => {
  const rawInput = `Pure ground glass nodule measuring 6×4mm, oblique fissure of right lung  (SE3, IM250).`;
  const aiReport = `-- Phổi phải: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt kính mờ thuỳ dưới phổi phải (Lung-RADS 2).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  assert(fixed.includes("Rãnh liên thuỳ chếch có 1 nốt kính mờ kích thước 6×4 mm (đường kính trung bình 5 mm)."), "Phải mô tả nốt kính mờ rãnh liên thuỳ");
});

// Case 8: ClinicalSynthesizer object method matches standalone function
runTest("ClinicalSynthesizer.sanitizeLungRADSReport hoạt động đồng bộ với defaults.js", () => {
  const rawInput = `Calcified nodule measuring 4×4mm, oblique fissure of right lung  (SE304, IM269).`;
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const res1 = sanitizeLungRADSReport(aiReport, rawInput);
  const res2 = ClinicalSynthesizer.sanitizeLungRADSReport(aiReport, rawInput);
  assert.strictEqual(res1, res2, "Hai phương thức phải trả về kết quả giống nhau 100%");
});

// Case 9: Closing sentence remains intact at the very end of description line
runTest("Câu kết chuẩn 'Không thấy dày tổ chức kẽ...' luôn ở cuối dòng", () => {
  const rawInput = `Calcified nodule measuring 4×4mm, oblique fissure of right lung  (SE304, IM269).`;
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  const pPhai = fixed.split("\n")[0];
  assert(pPhai.endsWith("Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang."), "Câu kết phải nằm ở cuối cùng của dòng");
});

// Case 10: System prompt contains explicit fissure and calcified nodule rules
runTest("LUNG_RADS_SYSTEM_PROMPT chứa đầy đủ quy tắc rãnh liên thuỳ và nốt vôi hoá", () => {
  assert(defaultsCode.includes("QUY TẮC BẮT BUỘC VỀ NỐT Ở RÃNH LIÊN THUỲ"), "Phải có tiêu đề quy tắc rãnh liên thuỳ");
  assert(/oblique fissure/i.test(defaultsCode), "Phải có từ khóa oblique fissure");
  assert(/horizontal fissure/i.test(defaultsCode), "Phải có từ khóa horizontal fissure");
  assert(/rãnh liên thuỳ chếch/i.test(defaultsCode), "Phải có thuật ngữ tiếng Việt rãnh liên thuỳ chếch");
});

// Case 11: Audit #1 - Dimension Collision (4x4mm solid in upper lobe + 4x4mm calcified in oblique fissure)
runTest("Audit #1: Không bỏ sót nốt rãnh liên thuỳ khi trùng kích thước (4x4mm) với nốt ở thuỳ khác", () => {
  const rawInput = `Solid nodule measuring 4×4mm, right upper lobe/apical segment (SE3, IM50).
Calcified nodule measuring 4×4mm, oblique fissure of right lung (SE3, IM269).`;
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 4×4 mm (đường kính trung bình 4 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2). Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  assert(fixed.includes("Rãnh liên thuỳ chếch có 1 nốt vôi hoá kích thước 4×4 mm."), "Phải bổ sung nốt vôi hoá 4x4mm dù thuỳ trên đã có nốt đặc 4x4mm");
});

// Case 12: Audit #2 - Same-Fissure Nodule Merging
runTest("Audit #2: Gộp nhiều nốt cùng loại cùng độ Lung-RADS trong cùng rãnh liên thuỳ chếch thành 1 câu", () => {
  const aiReport = `-- Phổi phải: Rãnh liên thuỳ chếch có 1 nốt đặc kích thước 3×2 mm (đường kính trung bình 2.5 mm). Rãnh liên thuỳ chếch có 1 nốt đặc kích thước 4×3 mm (đường kính trung bình 3.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh vài nốt đặc phổi phải (Lung-RADS 2).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  assert(fixed.includes("Rãnh liên thuỳ chếch có 2 nốt đặc, nốt lớn kích thước 4×3 mm (đường kính trung bình 3.5 mm)."), "Phải gộp 2 nốt đặc ở rãnh liên thuỳ chếch thành 1 câu");
});

// Case 13: Audit #3 - Contradictory Normal Text Cleanup
runTest("Audit #3: Tự động xoá câu 'trường phổi sáng đều, không thấy tổn thương...' khi chèn nốt bị sót", () => {
  const rawInput = `Calcified nodule measuring 4×4mm, oblique fissure of right lung (SE3, IM269).`;
  const aiReport = `-- Phổi phải: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  const pPhai = fixed.split("\n")[0];
  assert(!pPhai.includes("không thấy tổn thương dạng nốt"), "Phải xoá câu bình thường mâu thuẫn ở phổi phải");
  assert(pPhai.includes("-- Phổi phải: Rãnh liên thuỳ chếch có 1 nốt vôi hoá kích thước 4×4 mm."), "Câu mô tả phổi phải phải bắt đầu mạch lạc");
});

// Case 14: Audit #4a - Reverse Conclusion Guard (Description has calcified nodule, Conclusion forgot Lung-RADS 1)
runTest("Audit #4a: Tự động bổ sung 'Nốt vôi hoá ... (Lung-RADS 1).' vào Kết luận nếu Mô tả có nốt vôi hoá", () => {
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 4×3 mm (đường kính trung bình 3.5 mm). Rãnh liên thuỳ chếch có 1 nốt vôi hoá kích thước 4×4 mm. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc thuỳ trên phổi phải (Lung-RADS 2).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  assert(fixed.includes("Nốt vôi hoá phổi phải (Lung-RADS 1)."), "Kết luận phải tự động được thêm Nốt vôi hoá phổi phải (Lung-RADS 1)");
});

// Case 15: Audit #4b - Strip erroneous mean diameter from calcified nodule
runTest("Audit #4b: Tự động xoá '(đường kính trung bình ... mm)' nếu AI ghi thừa cho nốt vôi hoá", () => {
  const aiReport = `-- Phổi phải: Thuỳ dưới có 1 nốt vôi hoá kích thước 4×4 mm (đường kính trung bình 4 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Nốt vôi hoá thuỳ dưới phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  assert(fixed.includes("Thuỳ dưới có 1 nốt vôi hoá kích thước 4×4 mm."), "Phải giữ kích thước nốt vôi hoá");
  assert(!fixed.includes("đường kính trung bình"), "Phải xoá đường kính trung bình khỏi nốt vôi hoá");
});

// Case 16: Audit #5a - Laterality Hallucination Guard (fb_20261026_045433_473648)
runTest("Audit #5a (fb_20261026_045433): Sửa 'hai phổi' thành 'phổi phải' khi phổi trái hoàn toàn bình thường", () => {
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt kính mờ kích thước 3×2 mm (đường kính trung bình 2.5 mm). Thuỳ giữa có 2 nốt đặc, nốt lớn kích thước 5×4 mm (đường kính trung bình 4.5 mm). Thuỳ dưới có 1 nốt đặc kích thước 3×3 mm (đường kính trung bình 3 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh vài nốt đặc và kính mờ hai phổi (Lung-RADS 2).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  assert(fixed.includes("Hình ảnh vài nốt đặc và kính mờ phổi phải (Lung-RADS 2)."), "Phải sửa 'hai phổi' thành 'phổi phải'");
  assert(!fixed.includes("hai phổi"), "Không được còn chữ 'hai phổi'");
});

// Case 17: Audit #5b - Wording Guard (fb_20261105_040355_435995 & fb_20261026_072537_537189)
runTest("Audit #5b (fb_20261105_040355 & fb_20261026_072537): Chuẩn hoá 'vài nốt đặc và kính mờ' & sửa 'thuỳ trái/phải'", () => {
  const aiReport = `-- Phổi phải: Thuỳ trên có 1 nốt đặc kích thước 4×2 mm (đường kính trung bình 3 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: Thuỳ trên có 1 nốt kính mờ kích thước 6×5 mm (đường kính trung bình 5.5 mm). Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Hình ảnh nốt đặc và kính mờ hai phổi (Lung-RADS 2). Nốt vôi hoá thuỳ trái (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, "");
  assert(fixed.includes("Hình ảnh vài nốt đặc và kính mờ hai phổi (Lung-RADS 2)."), "Phải chuẩn hoá thành 'Hình ảnh vài nốt đặc và kính mờ hai phổi'");
  assert(fixed.includes("Nốt vôi hoá phổi trái (Lung-RADS 1)."), "Phải sửa 'thuỳ trái' thành 'phổi trái'");
});

// Case 18: Audit #5c - Bilingual Chinese/English PACS separator & 3mmx2mm format
runTest("Audit #5c: Hỗ trợ báo cáo PACS song ngữ Trung-Anh (dấu 。 và định dạng 3mm×2mm)", () => {
  const rawInput = `双肺多发结节。Calcified nodule measuring 3mm×2mm, oblique fissure of right lung (SE2, IM125)。`;
  const aiReport = `-- Phổi phải: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
-- Phổi trái: trường phổi sáng đều, không thấy tổn thương dạng nốt hoặc dạng khối. Không thấy dày tổ chức kẽ, không thấy giãn phế quản, phế nang.
Kết luận:
Nốt vôi hoá phổi phải (Lung-RADS 1).`;

  const fixed = sanitizeLungRADSReport(aiReport, rawInput);
  assert(fixed.includes("Rãnh liên thuỳ chếch có 1 nốt vôi hoá kích thước 3×2 mm."), "Phải tách được câu bằng dấu chấm câu tiếng Trung (。) và chuẩn hoá 3mm×2mm -> 3×2 mm");
});

console.log("======================================================");
console.log(`KẾT QUẢ KIỂM THỬ: ${passed}/${total} test cases passed.`);
if (passed === total) {
  console.log(`🎉 TOÀN BỘ ${total}/${total} BÀI TEST AUDIT RÃNH LIÊN THUỲ & LUNGRADS ĐÃ VƯỢT QUA 100%!`);
} else {
  process.exit(1);
}
