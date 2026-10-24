/**
 * Comprehensive Unit Test Suite v2 for AutoRIS Medical Secretary Tier 1
 * Kiểm thử Bộ Thư ký Y khoa Tầng 1: Quad-Layer Disambiguator & Instant AST Engine
 */
const fs = require("fs");
const path = require("path");

const synthPath = path.join(__dirname, "clinical_synthesizer.js");
const synthCode = fs.readFileSync(synthPath, "utf-8");
eval(synthCode);

console.log("=== KIỂM THỬ MỞ RỘNG BỘ THƯ KÝ Y KHOA TẦNG 1 (V2 - 30 TESTS) ===");

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    console.error(`❌ [FAIL] ${message}`);
  }
}

// -------------------------------------------------------------
// NHÓM 1: BẪY Y KHOA (CLINICAL IMMUNITY WHITELIST - CHỐNG FALSE-POSITIVE)
// -------------------------------------------------------------
console.log("\n--- NHÓM 1: TỪ ĐIỂN KHÁNG LỆNH LÂM SÀNG (CHỐNG NHẬN NHẦM LỆNH) ---");

assert(!ClinicalSynthesizer.isSecretaryCommand("Bệnh nhân sau mổ chuyển vị đại động mạch"), 
  "Kháng lệnh: 'chuyển vị đại động mạch' không bị hiểu thành lệnh 'chuyển'");

assert(!ClinicalSynthesizer.isSecretaryCommand("Không thấy xóa mờ góc sườn hoành hai bên"), 
  "Kháng lệnh: 'xóa mờ góc sườn hoành' không bị hiểu thành lệnh 'xóa'");

assert(!ClinicalSynthesizer.isSecretaryCommand("Bệnh nhân có tiền sử thay van hai lá cơ học"), 
  "Kháng lệnh: 'thay van hai lá' không bị hiểu thành lệnh 'thay'");

assert(!ClinicalSynthesizer.isSecretaryCommand("Thêm một nốt giảm tỷ trọng ở hạ phân thùy VI của gan"), 
  "Kháng lệnh: 'thêm một nốt giảm tỷ trọng' không bị hiểu thành lệnh 'thêm'");

assert(!ClinicalSynthesizer.isSecretaryCommand("Tiền sử phẫu thuật cắt bỏ tử cung và hai phần phụ"), 
  "Kháng lệnh: 'cắt bỏ tử cung' không bị hiểu thành lệnh 'bỏ'");

assert(!ClinicalSynthesizer.isSecretaryCommand("Không thấy dấu hiệu xóa bờ tim hay xóa rãnh cuộn não"), 
  "Kháng lệnh: 'xóa bờ tim', 'xóa rãnh cuộn não' là tổn thương mô tả");

assert(!ClinicalSynthesizer.isSecretaryCommand("Chưa phát hiện tổn thương chuyển dạng ác tính"), 
  "Kháng lệnh: 'chuyển dạng ác tính' không bị hiểu thành lệnh 'chuyển'");

// -------------------------------------------------------------
// NHÓM 2: LỆNH ĐIỀU HƯỚNG TRƯỜNG & ĐỊNH DẠNG (NAVIGATION & FORMATTING)
// -------------------------------------------------------------
console.log("\n--- NHÓM 2: LỆNH ĐIỀU HƯỚNG & ĐỊNH DẠNG VĂN BẢN ---");

assert(ClinicalSynthesizer.isSecretaryCommand("Xuống dòng"), "Nhận diện lệnh: Xuống dòng");
assert(ClinicalSynthesizer.isSecretaryCommand("Gạch đầu dòng"), "Nhận diện lệnh: Gạch đầu dòng");
assert(ClinicalSynthesizer.isSecretaryCommand("Dấu chấm"), "Nhận diện lệnh: Dấu chấm");
assert(ClinicalSynthesizer.isSecretaryCommand("Dấu phẩy"), "Nhận diện lệnh: Dấu phẩy");

const resNL = ClinicalSynthesizer.executeSecretaryCommand("Mô tả ban đầu", "", "Xuống dòng");
assert(resNL.handled && resNL.mota.includes("Mô tả ban đầu\n\n"), "Thực thi: 'Xuống dòng' tạo ngắt dòng");

const resBullet = ClinicalSynthesizer.executeSecretaryCommand("Dòng 1", "", "Gạch đầu dòng");
assert(resBullet.handled && resBullet.mota === "Dòng 1\n- ", "Thực thi: 'Gạch đầu dòng' thêm gạch đầu dòng");

assert(ClinicalSynthesizer.isSecretaryCommand("Mô tả: gan kích thước bình thường, bờ đều"), "Nhận diện lệnh: Mô tả: [nội dung]");
const resNavMota = ClinicalSynthesizer.executeSecretaryCommand("- Thận phải: bình thường.", "", "Mô tả: - Gan: Kích thước bình thường.");
assert(resNavMota.handled && resNavMota.mota.includes("- Gan: Kích thước bình thường."), "Thực thi: 'Mô tả: ...' chèn thêm vào mô tả");

assert(ClinicalSynthesizer.isSecretaryCommand("Kết luận: hình ảnh sỏi túi mật 8mm"), "Nhận diện lệnh: Kết luận: [nội dung]");
const resNavKL = ClinicalSynthesizer.executeSecretaryCommand("", "Hình ảnh nốt phổi.", "Kết luận: Sỏi túi mật 8mm.");
assert(resNavKL.handled && resNavKL.ketluan.includes("Sỏi túi mật 8mm."), "Thực thi: 'Kết luận: ...' chèn thêm vào kết luận");

// -------------------------------------------------------------
// NHÓM 3: SỬA ĐỔI NGỮ CẢNH (SENTENCE EDIT & CROSS-FIELD REFACTORING)
// -------------------------------------------------------------
console.log("\n--- NHÓM 3: SỬA ĐỔI NGỮ CẢNH VĂN BẢN ---");

assert(ClinicalSynthesizer.isSecretaryCommand("Sửa câu vừa rồi thành sỏi thận phải 8mm"), "Nhận diện lệnh: Sửa câu vừa rồi");
const sampleEditMota = `- Gan: Kích thước bình thường.\n- Thận phải: Có sỏi 5mm.`;
const resEditSentence = ClinicalSynthesizer.executeSecretaryCommand(sampleEditMota, "", "Sửa câu vừa rồi thành Có sỏi kích thước 8mm, không ứ nước.");
assert(resEditSentence.handled && resEditSentence.mota.includes("8mm, không ứ nước") && !resEditSentence.mota.includes("5mm"), 
  "Thực thi: 'Sửa câu vừa rồi' thay thế chính xác câu cuối cùng");

assert(ClinicalSynthesizer.isSecretaryCommand("Chuyển đoạn cuối sang kết luận"), "Nhận diện lệnh: Chuyển đoạn cuối sang kết luận");
const sampleMoveMota = `- Gan: Bình thường.\n- Thận: Bình thường.\n- Túi mật: Có sỏi kích thước 12mm.`;
const resMove = ClinicalSynthesizer.executeSecretaryCommand(sampleMoveMota, "Theo dõi gan nhiễm mỡ.", "Chuyển đoạn cuối sang kết luận");
assert(resMove.handled && !resMove.mota.includes("Túi mật") && resMove.ketluan.includes("Có sỏi kích thước 12mm."), 
  "Thực thi: 'Chuyển đoạn cuối sang kết luận' bóc tách khỏi Mô tả và đưa vào Kết luận");

assert(ClinicalSynthesizer.isSecretaryCommand("Xóa câu vừa rồi"), "Nhận diện lệnh: Xóa câu vừa rồi");
assert(ClinicalSynthesizer.isSecretaryCommand("Xóa dòng cuối"), "Nhận diện lệnh: Xóa dòng cuối");
const resDelLastLine = ClinicalSynthesizer.executeSecretaryCommand("Dòng 1\nDòng 2\nDòng 3", "", "Xóa dòng cuối");
assert(resDelLastLine.handled && resDelLastLine.mota === "Dòng 1\nDòng 2", "Thực thi: 'Xóa dòng cuối' xóa chính xác dòng cuối cùng");

// -------------------------------------------------------------
// NHÓM 4: TIỀN TỐ MỆNH LỆNH RÕ RÀNG (EXPLICIT COMMAND PREFIX)
// -------------------------------------------------------------
console.log("\n--- NHÓM 4: TIỀN TỐ MỆNH LỆNH EXPLICIT ---");

assert(ClinicalSynthesizer.isSecretaryCommand("Thư ký xóa dòng gan"), "Nhận diện lệnh có tiền tố 'Thư ký:'");
assert(ClinicalSynthesizer.isSecretaryCommand("Lệnh: thay thùy trên thành thùy dưới"), "Nhận diện lệnh có tiền tố 'Lệnh:'");
assert(ClinicalSynthesizer.isSecretaryCommand("AutoRIS: hoàn tác"), "Nhận diện lệnh có tiền tố 'AutoRIS:'");

const resPrefixExec = ClinicalSynthesizer.executeSecretaryCommand("Nốt thùy trên phổi phải", "", "Thư ký: thay thùy trên thành thùy dưới");
assert(resPrefixExec.handled && resPrefixExec.mota.includes("thùy dưới"), "Thực thi lệnh bóc tách tiền tố 'Thư ký:' chuẩn xác");

// -------------------------------------------------------------
// NHÓM 5: TƯƠNG THÍCH BỘ 11 TESTS GỐC
// -------------------------------------------------------------
console.log("\n--- NHÓM 5: TƯƠNG THÍCH CÁC LỆNH GỐC (REGRESSION TESTS) ---");

assert(ClinicalSynthesizer.isSecretaryCommand("Xóa dòng phổi phải"), "Lệnh gốc: Xóa dòng phổi phải");
assert(ClinicalSynthesizer.isSecretaryCommand("Xóa kết luận"), "Lệnh gốc: Xóa kết luận");
assert(ClinicalSynthesizer.isSecretaryCommand("thay thùy trên bằng thùy dưới"), "Lệnh gốc: thay thùy trên bằng thùy dưới");
assert(ClinicalSynthesizer.isSecretaryCommand("hoàn tác"), "Lệnh gốc: hoàn tác");
assert(!ClinicalSynthesizer.isSecretaryCommand("Nốt đặc thùy trên phổi phải"), "Không phải lệnh: Nốt đặc thùy trên phổi phải");

const resDelOrgan = ClinicalSynthesizer.executeSecretaryCommand(
  "- Nhu mô phổi phải: Có nốt mờ 5mm.\n- Nhu mô phổi trái: Bình thường.",
  "Hình ảnh nốt mờ phổi phải.",
  "Xóa dòng phổi phải"
);
assert(resDelOrgan.mota.includes("Thông khí tốt") && resDelOrgan.ketluan.includes("theo dõi lâm sàng"), "Thực thi: Xóa dòng phổi phải reset về chuẩn");

const resDelAll = ClinicalSynthesizer.executeSecretaryCommand("Mô tả dài", "Kết luận dài", "Xóa toàn bộ");
assert(resDelAll.mota === "" && resDelAll.ketluan === "", "Thực thi: Xóa toàn bộ làm trống");

// -------------------------------------------------------------
// TỔNG KẾT
// -------------------------------------------------------------
console.log(`\n======================================================`);
console.log(`KẾT QUẢ KIỂM THỬ: ${passed}/${total} test cases passed.`);
if (passed === total) {
  console.log("🎉 TOÀN BỘ 30/30 BÀI TEST TẦNG 1 ĐÃ VƯỢT QUA 100%!");
} else {
  console.error("⚠️ CÓ TEST CHƯA VƯỢT QUA!");
  process.exit(1);
}
