/**
 * Unit Test for AutoRIS Medical Secretary Tier 1 (Deterministic Engine)
 */
const fs = require("fs");
const path = require("path");

// Load ClinicalSynthesizer
const synthCode = fs.readFileSync(path.join(__dirname, "..", "autoris-ris-extension", "clinical_synthesizer.js"), "utf-8");
eval(synthCode);

console.log("=== KIỂM THỬ BỘ THƯ KÝ Y KHOA TẦNG 1 (INSTANT LOCAL ENGINE) ===");

const sampleMotaChest = `
- Nhu mô phổi phải: Có nốt mờ 5mm thùy trên phổi phải.
- Nhu mô phổi trái: Thông khí tốt, không thấy tổn thương khu trú.
- Trung thất: Không thấy hạch to.
- Màng phổi hai bên: Không thấy tràn dịch, tràn khí màng phổi.
`.trim();

const sampleKetluanChest = `Hình ảnh nốt mờ thùy trên phổi phải.`;

let passed = 0;
let total = 0;

function assert(name, condition, details = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name} ${details ? "- " + details : ""}`);
  }
}

// 1. Nhận diện lệnh thư ký
assert(
  "Nhận diện lệnh: Xóa dòng phổi phải",
  ClinicalSynthesizer.isSecretaryCommand("Xóa dòng phổi phải")
);
assert(
  "Nhận diện lệnh: Xóa kết luận",
  ClinicalSynthesizer.isSecretaryCommand("Xóa kết luận")
);
assert(
  "Nhận diện lệnh: Thay thùy trên bằng thùy dưới",
  ClinicalSynthesizer.isSecretaryCommand("thay thùy trên bằng thùy dưới")
);
assert(
  "Nhận diện lệnh: Hoàn tác",
  ClinicalSynthesizer.isSecretaryCommand("hoàn tác")
);
assert(
  "Nhận diện không phải lệnh: Nốt đặc thùy trên phổi phải",
  !ClinicalSynthesizer.isSecretaryCommand("Nốt đặc thùy trên phổi phải")
);

// 2. Thực thi lệnh: Xóa dòng phổi phải
const resDeleteOrgan = ClinicalSynthesizer.executeSecretaryCommand(
  sampleMotaChest,
  sampleKetluanChest,
  "xóa dòng phổi phải"
);
assert(
  "Xóa dòng phổi phải cập nhật mô tả",
  resDeleteOrgan.handled && !resDeleteOrgan.mota.includes("nốt mờ 5mm"),
  resDeleteOrgan.mota
);
assert(
  "Xóa dòng phổi phải xóa kết luận liên quan",
  resDeleteOrgan.ketluan.includes("theo dõi lâm sàng") || !resDeleteOrgan.ketluan.includes("nốt mờ"),
  resDeleteOrgan.ketluan
);

// 3. Thực thi lệnh: Thay thế từ khóa
const resReplace = ClinicalSynthesizer.executeSecretaryCommand(
  sampleMotaChest,
  sampleKetluanChest,
  "thay thùy trên bằng thùy dưới"
);
assert(
  "Thay thế thùy trên bằng thùy dưới trong mô tả",
  resReplace.mota.includes("thùy dưới phổi phải") && !resReplace.mota.includes("thùy trên"),
  resReplace.mota
);
assert(
  "Thay thế thùy trên bằng thùy dưới trong kết luận",
  resReplace.ketluan.includes("thùy dưới"),
  resReplace.ketluan
);

// 4. Thực thi lệnh: Xóa kết luận
const resDeleteKL = ClinicalSynthesizer.executeSecretaryCommand(
  sampleMotaChest,
  sampleKetluanChest,
  "xóa kết luận"
);
assert(
  "Xóa kết luận trả về theo dõi lâm sàng hoặc rỗng",
  resDeleteKL.ketluan.includes("theo dõi lâm sàng"),
  resDeleteKL.ketluan
);

// 5. Thực thi lệnh: Xóa toàn bộ
const resDeleteAll = ClinicalSynthesizer.executeSecretaryCommand(
  sampleMotaChest,
  sampleKetluanChest,
  "xóa toàn bộ"
);
assert(
  "Xóa toàn bộ làm trống mô tả & kết luận",
  resDeleteAll.mota === "" && resDeleteAll.ketluan === ""
);

console.log(`\nKết quả: ${passed}/${total} test pass.`);
