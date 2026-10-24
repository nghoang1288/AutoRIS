/**
 * test_multimodality_clinical_suite.js
 * Bộ kiểm thử toàn diện Đa Phương tiện Chẩn đoán Hình ảnh (Multi-Modality Clinical Suite)
 * Kiểm định: Siêu âm (US), Cắt lớp vi tính (CT), Cộng hưởng từ (MRI), X-quang (XR)
 * Bao gồm:
 * 1. Tri-Source Modality & Region Detector (Nhận diện phương tiện & phân vùng)
 * 2. Extended Clinical Immunity Whitelist (Kháng lệnh CT / MRI / DSA)
 * 3. Multi-Modality Normal Templates (Mẫu chuẩn tức thì)
 * 4. Cross-Modality Confusion Guard (Chống nhầm lẫn thuật ngữ vật lý)
 * 5. Red-Flag Emergency Dimensions (Giám sát chỉ số đỏ cấp cứu sọ não, mạch máu, ống sống)
 * 6. Extended Laterality Engine (Đảo chiều giải phẫu bán cầu não, rễ thần kinh, khớp)
 */

const assert = require("assert");
const ClinicalSynthesizer = require("./clinical_synthesizer.js").ClinicalSynthesizer;
const ModalityDetector = ClinicalSynthesizer.ModalityDetector;
const ClinicalSafetyGuard = require("./clinical_safety_guard.js").ClinicalSafetyGuard;

console.log("=== KIỂM THỬ HỆ THỐNG ĐA PHƯƠNG TIỆN AUTORIS (MULTI-MODALITY SUITE) ===\n");
let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   -> Lỗi: ${err.message}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// NHÓM 1: TRI-SOURCE MODALITY & REGION DETECTOR
// -------------------------------------------------------------
console.log("--- NHÓM 1: NHẬN DIỆN MODALITY & PHÂN VÙNG GIẢI PHẪU ---");

runTest("Nhận diện CT Sọ não từ tiêu đề chỉ định RIS", () => {
  const res = ModalityDetector.detect("Chụp cắt lớp vi tính sọ não có tiêm thuốc cản quang", "", "");
  assert.strictEqual(res.modality, "CT");
  assert.strictEqual(res.region, "BRAIN");
});

runTest("Nhận diện MRI Cột sống thắt lưng từ tiêu đề chỉ định", () => {
  const res = ModalityDetector.detect("Chụp cộng hưởng từ cột sống thắt lưng", "", "");
  assert.strictEqual(res.modality, "MRI");
  assert.strictEqual(res.region, "SPINE");
});

runTest("Nhận diện MRI Khớp gối từ tiêu đề chỉ định", () => {
  const res = ModalityDetector.detect("Chụp CHT khớp gối phải", "", "");
  assert.strictEqual(res.modality, "MRI");
  assert.strictEqual(res.region, "MSK");
});

runTest("Nhận diện X-quang lồng ngực từ tiêu đề chỉ định", () => {
  const res = ModalityDetector.detect("Chụp X-quang tim phổi thẳng", "", "");
  assert.strictEqual(res.modality, "XR");
  assert.strictEqual(res.region, "CHEST");
});

runTest("Nhận diện Siêu âm ổ bụng từ tiêu đề chỉ định", () => {
  const res = ModalityDetector.detect("Siêu âm ổ bụng tổng quát", "", "");
  assert.strictEqual(res.modality, "US");
  assert.strictEqual(res.region, "ABDOMEN");
});

runTest("Nhận diện CT Mạch máu (CTA) từ tiêu đề chỉ định", () => {
  const res = ModalityDetector.detect("Chụp CLVT mạch máu động mạch chủ bụng (CTA)", "", "");
  assert.strictEqual(res.modality, "CT");
  assert.strictEqual(res.region, "VASCULAR");
});

runTest("Nhận diện MRI từ chuỗi xung trong mẫu kỹ thuật (Template Fingerprint)", () => {
  const res = ModalityDetector.detect("", "KỸ THUẬT: Chuỗi xung T1W, T2W sagittal, T2 axial, FLAIR, DWI.", "");
  assert.strictEqual(res.modality, "MRI");
});

runTest("Nhận diện CT từ thông số kỹ thuật (lát cắt, Hounsfield)", () => {
  const res = ModalityDetector.detect("", "KỸ THUẬT: Cắt lớp vi tính đa dãy, tái tạo lát cắt mỏng 1mm, đo tỷ trọng Hounsfield.", "");
  assert.strictEqual(res.modality, "CT");
});

// -------------------------------------------------------------
// NHÓM 2: TỪ ĐIỂN KHÁNG LỆNH CT / MRI / DSA MỞ RỘNG
// -------------------------------------------------------------
console.log("\n--- NHÓM 2: KHÁNG LỆNH LÂM SÀNG CT / MRI / DSA MỞ RỘNG ---");

runTest("Kháng lệnh: 'Xung xóa mỡ STIR' không bị hiểu thành lệnh xóa", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Xung xóa mỡ STIR có tổn thương"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Xung xóa mỡ STIR"), false);
});

runTest("Kháng lệnh: 'Chụp mạch số hóa xóa nền DSA' không bị hiểu thành lệnh xóa", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Chụp mạch số hóa xóa nền DSA không thấy phình mạch"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Chụp mạch xóa nền"), false);
});

runTest("Kháng lệnh: 'Xóa rãnh cuộn não và bể não' không bị hiểu thành lệnh xóa", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Phù não làm xóa rãnh cuộn não và bể não"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Xóa rãnh cuộn não"), false);
});

runTest("Kháng lệnh: 'Cắt lớp vi tính' không bị hiểu thành lệnh cắt/bỏ", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Cắt lớp vi tính sọ não cấp cứu"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Cắt lớp vi tính"), false);
});

runTest("Kháng lệnh: 'Lát cắt ngang axial' không bị hiểu thành lệnh cắt", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Lát cắt ngang axial qua cuống não"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Lát cắt ngang"), false);
});

runTest("Kháng lệnh: 'Chuyển dạng xuất huyết' không bị hiểu thành lệnh chuyển", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Ổ nhồi máu não có chuyển dạng xuất huyết"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Chuyển dạng xuất huyết"), false);
});

runTest("Kháng lệnh: 'Thay đĩa đệm nhân tạo' không bị hiểu thành lệnh thay", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Bệnh nhân có tiền sử thay đĩa đệm L4-L5"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Thay đĩa đệm"), false);
});

runTest("Kháng lệnh: 'Thoát vị đĩa đệm' không bị hiểu thành lệnh điều khiển", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Thoát vị đĩa đệm tầng L4/L5 chèn ép bao màng cứng"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Thoát vị đĩa đệm"), false);
});

runTest("Kháng lệnh: 'Thải thuốc thì muộn' (washout) không bị hiểu thành lệnh thải/bỏ", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Khối u gan thải thuốc thì muộn điển hình"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Thải thuốc thì muộn"), false);
});

runTest("Kháng lệnh: 'Tái tạo đa bình diện MPR' không bị hiểu thành lệnh", () => {
  assert.strictEqual(ClinicalSynthesizer.isClinicalImmuneText("Hình ảnh tái tạo đa bình diện MPR"), true);
  assert.strictEqual(ClinicalSynthesizer.isSecretaryCommand("Tái tạo đa bình diện"), false);
});

// -------------------------------------------------------------
// NHÓM 3: MẪU BÁO CÁO CHUẨN TỨC THÌ (TIER 1 NORMAL TEMPLATES)
// -------------------------------------------------------------
console.log("\n--- NHÓM 3: MẪU BÁO CÁO CHUẨN TỨC THÌ (<5ms) ---");

runTest("Áp dụng mẫu CT Sọ não bình thường", () => {
  const res = ClinicalSynthesizer.executeSecretaryCommand("", "", "Mẫu CT sọ não bình thường");
  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.action, "apply_template");
  assert.ok(res.mota.includes("Nhu mô não"));
  assert.ok(res.mota.includes("Cấu trúc đường giữa"));
  assert.ok(res.ketluan.includes("Hình ảnh cắt lớp vi tính sọ não hiện tại chưa thấy bất thường."));
});

runTest("Áp dụng mẫu MRI Sọ não bình thường", () => {
  const res = ClinicalSynthesizer.executeSecretaryCommand("", "", "Mẫu MRI sọ não bình thường");
  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.action, "apply_template");
  assert.ok(res.mota.includes("T1W, T2W, FLAIR"));
  assert.ok(res.ketluan.includes("Hình ảnh cộng hưởng từ sọ não hiện tại chưa thấy bất thường."));
});

runTest("Áp dụng mẫu MRI Cột sống thắt lưng bình thường", () => {
  const res = ClinicalSynthesizer.executeSecretaryCommand("", "", "Mẫu MRI cột sống thắt lưng bình thường");
  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.action, "apply_template");
  assert.ok(res.mota.includes("L1 đến S1"));
  assert.ok(res.ketluan.includes("Hình ảnh cộng hưởng từ cột sống thắt lưng hiện tại chưa thấy bất thường."));
});

runTest("Áp dụng mẫu MRI Khớp gối bình thường", () => {
  const res = ClinicalSynthesizer.executeSecretaryCommand("", "", "Mẫu MRI khớp gối bình thường");
  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.action, "apply_template");
  assert.ok(res.mota.includes("Dây chằng chéo"));
  assert.ok(res.mota.includes("Sụn chêm"));
  assert.ok(res.ketluan.includes("Hình ảnh cộng hưởng từ khớp gối hiện tại chưa thấy bất thường."));
});

runTest("Áp dụng mẫu CT Ổ bụng bình thường", () => {
  const res = ClinicalSynthesizer.executeSecretaryCommand("", "", "Mẫu CT bụng bình thường");
  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.action, "apply_template");
  assert.ok(res.mota.includes("Gan: Kích thước bình thường, tỷ trọng đồng nhất"));
  assert.ok(res.ketluan.includes("Hình ảnh cắt lớp vi tính ổ bụng - tiểu khung hiện tại chưa thấy bất thường."));
});

runTest("Áp dụng mẫu X-quang tim phổi bình thường", () => {
  const res = ClinicalSynthesizer.executeSecretaryCommand("", "", "Mẫu X-quang tim phổi bình thường");
  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.action, "apply_template");
  assert.ok(res.mota.includes("Phế trường hai bên"));
  assert.ok(res.ketluan.includes("Hình ảnh X-quang tim phổi hiện tại chưa thấy bất thường."));
});

// -------------------------------------------------------------
// NHÓM 4: CHỐNG NHẦM LẪN THUẬT NGỮ VẬT LÝ (CROSS-MODALITY CONFUSION)
// -------------------------------------------------------------
console.log("\n--- NHÓM 4: CHỐNG NHẦM LẪN THUẬT NGỮ VẬT LÝ XUYÊN PHƯƠNG TIỆN ---");

runTest("Bắt lỗi: Dùng từ siêu âm 'giảm âm' trong báo cáo CT", () => {
  const text = "Nhu mô não thùy trán phải có nốt giảm âm kích thước 10mm.";
  const anomalies = ClinicalSafetyGuard.checkCrossModalityAnomaly("CT", text);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "CROSS_MODALITY_CONFUSION");
  assert.ok(anomalies[0].message.includes("thuật ngữ siêu âm 'giảm âm'"));
});

runTest("Bắt lỗi: Dùng từ siêu âm 'tăng âm' trong báo cáo MRI", () => {
  const text = "Thân đốt sống L4 có nốt tăng âm kèm bóng lưng.";
  const anomalies = ClinicalSafetyGuard.checkCrossModalityAnomaly("MRI", text);
  assert.ok(anomalies.length >= 1);
  assert.strictEqual(anomalies[0].type, "CROSS_MODALITY_CONFUSION");
  assert.ok(anomalies[0].message.includes("thuật ngữ siêu âm"));
});

runTest("Bắt lỗi: Dùng từ CT 'tỷ trọng' trong báo cáo Siêu âm", () => {
  const text = "Nhu mô gan có nốt giảm tỷ trọng 25 Hounsfield.";
  const anomalies = ClinicalSafetyGuard.checkCrossModalityAnomaly("US", text);
  assert.ok(anomalies.length >= 1);
  assert.strictEqual(anomalies[0].type, "CROSS_MODALITY_CONFUSION");
  assert.ok(anomalies[0].message.includes("thuật ngữ CT"));
});

runTest("Bắt lỗi: Dùng từ MRI 'hạn chế khuếch tán' trong báo cáo Siêu âm", () => {
  const text = "Tuyến giáp thùy phải có nhân hạn chế khuếch tán trên chuỗi xung DWI.";
  const anomalies = ClinicalSafetyGuard.checkCrossModalityAnomaly("US", text);
  assert.ok(anomalies.length >= 1);
  assert.strictEqual(anomalies[0].type, "CROSS_MODALITY_CONFUSION");
});

runTest("Bắt lỗi: Dùng từ MRI 'chuỗi xung FLAIR' trong báo cáo CT", () => {
  const text = "Cắt lớp vi tính sọ não thấy tổn thương tăng tín hiệu trên FLAIR.";
  const anomalies = ClinicalSafetyGuard.checkCrossModalityAnomaly("CT", text);
  assert.ok(anomalies.length >= 1);
  assert.strictEqual(anomalies[0].type, "CROSS_MODALITY_CONFUSION");
});

runTest("Hợp lệ: Báo cáo dùng đúng chuẩn thuật ngữ vật lý từng phương tiện", () => {
  assert.strictEqual(ClinicalSafetyGuard.checkCrossModalityAnomaly("CT", "Nốt giảm tỷ trọng thùy trán 15 HU.").length, 0);
  assert.strictEqual(ClinicalSafetyGuard.checkCrossModalityAnomaly("MRI", "Tổn thương tăng tín hiệu trên T2W, hạn chế khuếch tán trên DWI.").length, 0);
  assert.strictEqual(ClinicalSafetyGuard.checkCrossModalityAnomaly("US", "Nang gan giảm âm, tăng âm thành sau.").length, 0);
});

// -------------------------------------------------------------
// NHÓM 5: GIÁM SÁT CHỈ SỐ NGUY CƠ ĐỎ CẤP CỨU (RED-FLAGS)
// -------------------------------------------------------------
console.log("\n--- NHÓM 5: GIÁM SÁT CHỈ SỐ NGUY CƠ ĐỎ CẤP CỨU (RED-FLAGS) ---");

runTest("Báo động đỏ: Đường giữa sọ não di lệch 7 mm (> 5mm)", () => {
  const text = "Khối máu tụ bán cầu não phải gây đè đẩy đường giữa 7 mm sang trái.";
  const anomalies = ClinicalSafetyGuard.checkRedFlagAnomalies(text);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "RED_FLAG_EMERGENCY");
  assert.strictEqual(anomalies[0].severity, "CRITICAL");
  assert.ok(anomalies[0].message.includes("Đường giữa di lệch 7 mm"));
  assert.ok(anomalies[0].message.includes("tụt kẹt não"));
});

runTest("Báo động đỏ: Máu tụ dưới màng cứng bề dày 14 mm (> 10mm)", () => {
  const text = "Tụ máu dưới màng cứng bán cầu não trái bề dày 14 mm, gây phù não.";
  const anomalies = ClinicalSafetyGuard.checkRedFlagAnomalies(text);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "RED_FLAG_EMERGENCY");
  assert.ok(anomalies[0].message.includes("bề dày 14 mm"));
  assert.ok(anomalies[0].message.includes("chỉ định phẫu thuật"));
});

runTest("Báo động đỏ: Phình động mạch chủ bụng 55 mm (>= 50mm)", () => {
  const text = "Hình ảnh phình động mạch chủ bụng đoạn dưới thận đường kính 55 mm.";
  const anomalies = ClinicalSafetyGuard.checkRedFlagAnomalies(text);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "RED_FLAG_EMERGENCY");
  assert.ok(anomalies[0].message.includes("55 mm"));
  assert.ok(anomalies[0].message.includes("vỡ phình"));
});

runTest("Cảnh báo: Hẹp ống sống tuyệt đối 8 mm (< 10mm)", () => {
  const text = "Thoát vị đĩa đệm tầng L4/L5, đường kính trước sau ống sống đo được 8 mm.";
  const anomalies = ClinicalSafetyGuard.checkRedFlagAnomalies(text);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "RED_FLAG_ANATOMY");
  assert.strictEqual(anomalies[0].severity, "HIGH");
  assert.ok(anomalies[0].message.includes("8 mm"));
  assert.ok(anomalies[0].message.toLowerCase().includes("hẹp ống sống"));
});

runTest("Hợp lệ: Các chỉ số trong giới hạn an toàn", () => {
  const text = "Đường giữa cân đối không di lệch. Đường kính ống sống đo được 14 mm. ĐMC bụng 21 mm.";
  const anomalies = ClinicalSafetyGuard.checkRedFlagAnomalies(text);
  assert.strictEqual(anomalies.length, 0);
});

// -------------------------------------------------------------
// NHÓM 6: ĐẢO CHIỀU GIẢI PHẪU MỞ RỘNG (EXTENDED LATERALITY)
// -------------------------------------------------------------
console.log("\n--- NHÓM 6: ĐẢO CHIỀU GIẢI PHẪU MỞ RỘNG CHO THẦN KINH, CỘT SỐNG & KHỚP ---");

runTest("Bắt lỗi: Đọc Bán cầu đại não phải nhưng văn bản ghi Bán cầu đại não trái", () => {
  const rawASR = "Bán cầu đại não phải có ổ xuất huyết 20mm.";
  const proposed = "Bán cầu đại não trái có ổ xuất huyết 20mm.";
  const anomalies = ClinicalSafetyGuard.checkLateralityAnomaly(rawASR, proposed);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "LATERALITY_INVERSION");
  assert.strictEqual(anomalies[0].severity, "CRITICAL");
});

runTest("Bắt lỗi: Đọc Thùy trán phải nhưng văn bản ghi Thùy trán trái", () => {
  const rawASR = "Thùy trán phải có ổ nhồi máu cấp.";
  const proposed = "Thùy trán trái có ổ nhồi máu cấp.";
  const anomalies = ClinicalSafetyGuard.checkLateralityAnomaly(rawASR, proposed);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "LATERALITY_INVERSION");
});

runTest("Bắt lỗi: Đọc Chèn ép rễ L5 phải nhưng văn bản ghi Rễ L5 trái", () => {
  const rawASR = "Thoát vị tầng L4/L5 chèn ép rễ L5 phải.";
  const proposed = "Thoát vị tầng L4/L5 chèn ép rễ L5 trái.";
  const anomalies = ClinicalSafetyGuard.checkLateralityAnomaly(rawASR, proposed);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].type, "LATERALITY_INVERSION");
});

runTest("Bắt lỗi: Đọc Rách sụn chêm trong gối phải nhưng văn bản ghi Gối trái", () => {
  const rawASR = "Rách sụn chêm trong khớp gối phải độ 3.";
  const proposed = "Rách sụn chêm trong khớp gối trái độ 3.";
  const anomalies = ClinicalSafetyGuard.checkLateralityAnomaly(rawASR, proposed);
  assert.ok(anomalies.length >= 1);
  assert.strictEqual(anomalies[0].type, "LATERALITY_INVERSION");
});

runTest("Hợp lệ: Khớp gối phải khớp chuẩn với gối phải", () => {
  const rawASR = "Đứt dây chằng chéo trước khớp gối phải.";
  const proposed = "Hình ảnh đứt dây chằng chéo trước khớp gối phải.";
  const anomalies = ClinicalSafetyGuard.checkLateralityAnomaly(rawASR, proposed);
  assert.strictEqual(anomalies.length, 0);
});

// -------------------------------------------------------------
// NHÓM 7: ĐÁNH GIÁ AN TOÀN TỔNG HỢP (MAIN VERIFIER)
// -------------------------------------------------------------
console.log("\n--- NHÓM 7: ĐÁNH GIÁ AN TOÀN TỔNG HỢP CA LÂM SÀNG ĐA PHƯƠNG TIỆN ---");

runTest("Ca CT Sọ não an toàn tuyệt đối", () => {
  const raw = "Mô tả: Nhu mô não thùy trán phải có ổ giảm tỷ trọng 12mm. Kết luận: Nhồi máu não thùy trán phải.";
  const mota = "Nhu mô não thùy trán phải có ổ giảm tỷ trọng 12mm.";
  const kl = "Hình ảnh nhồi máu não thùy trán phải.";
  const res = ClinicalSafetyGuard.verifyClinicalSafety(raw, mota, kl, "", "", "CT");
  assert.strictEqual(res.safe, true);
  assert.strictEqual(res.riskLevel, "NONE");
});

runTest("Ca CT Sọ não cấp cứu kích hoạt Báo động đỏ tụt kẹt não", () => {
  const raw = "Mô tả: Máu tụ dưới màng cứng bán cầu phải 15mm, di lệch đường giữa 8mm sang trái.";
  const mota = "Máu tụ dưới màng cứng bán cầu phải bề dày 15mm, đè đẩy đường giữa 8mm sang trái.";
  const kl = "Hình ảnh máu tụ dưới màng cứng bán cầu não phải.";
  const res = ClinicalSafetyGuard.verifyClinicalSafety(raw, mota, kl, "", "", "CT");
  assert.strictEqual(res.safe, false);
  assert.strictEqual(res.riskLevel, "CRITICAL");
  assert.ok(res.anomalies.some(a => a.type === "RED_FLAG_EMERGENCY"));
});

runTest("Ca nhầm lẫn vật lý: Bác sĩ đọc CT nhưng máy điền 'giảm âm'", () => {
  const raw = "Ổ giảm tỷ trọng 10mm";
  const mota = "Nhu mô não có nốt giảm âm 10mm.";
  const kl = "Hình ảnh nốt giảm âm.";
  const res = ClinicalSafetyGuard.verifyClinicalSafety(raw, mota, kl, "", "", "CT");
  assert.strictEqual(res.safe, false);
  assert.strictEqual(res.riskLevel, "CRITICAL");
  assert.ok(res.anomalies.some(a => a.type === "CROSS_MODALITY_CONFUSION"));
});

// -------------------------------------------------------------
// TỔNG KẾT
// -------------------------------------------------------------
console.log("\n======================================================");
console.log(`KẾT QUẢ KIỂM THỬ: ${passed}/${total} test cases passed.`);
if (passed === total) {
  console.log("🎉 TOÀN BỘ BỘ TEST ĐA PHƯƠNG TIỆN (US/CT/MRI/XR) ĐÃ VƯỢT QUA 100%!");
} else {
  console.log("⚠️ CÓ TEST THẤT BẠI, CẦN KIỂM TRA LẠI!");
}
