/**
 * Test Suite for AutoRIS Clinical Safety & Anomaly Guard Engine
 * Kiểm thử Bộ Gác cổng An toàn Lâm sàng (25 Test Cases)
 */
const fs = require("fs");
const path = require("path");

const guardPath = path.join(__dirname, "clinical_safety_guard.js");
const guardCode = fs.readFileSync(guardPath, "utf-8");
eval(guardCode);

console.log("=== KIỂM THỬ BỘ GÁC CỔNG AN TOÀN LÂM SÀNG (25 TESTS) ===");

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
// NHÓM 1: NHẢY VỌT ĐƠN VỊ & KÍCH THƯỚC (SIZE & UNIT SCALE ANOMALY)
// -------------------------------------------------------------
console.log("\n--- NHÓM 1: PHÁT HIỆN NHẢY VỌT ĐƠN VỊ ĐO (MM <-> CM) ---");

// Test 1: 12 mm thành 12 cm
const r1 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Nốt mờ thùy trên phổi phải kích thước 12mm",
  "- Phổi phải: Thùy trên có nốt đặc kích thước 12cm.",
  "Hình ảnh nốt đặc phổi phải."
);
assert(!r1.safe && r1.anomalies.some(a => a.type === "UNIT_SCALE_JUMP"), 
  "Bắt lỗi: 12 mm trong câu đọc biến thành 12 cm trong văn bản");

// Test 2: 5 mm thành 5 cm
const r2 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Sỏi thận phải 5mm",
  "- Thận phải: Có sỏi kích thước 5 cm.",
  "Sỏi thận phải."
);
assert(!r2.safe && r2.anomalies.some(a => a.type === "UNIT_SCALE_JUMP"), 
  "Bắt lỗi: 5 mm biến thành 5 cm (sai số x10 lần)");

// Test 3: Đúng đơn vị mm -> mm (không báo lỗi)
const r3 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Nốt mờ thùy trên phổi phải kích thước 12mm",
  "- Phổi phải: Thùy trên có nốt đặc kích thước 12mm.",
  "Hình ảnh nốt đặc phổi phải."
);
assert(r3.safe && r3.riskLevel === "NONE", 
  "Hợp lệ: 12 mm giữ nguyên 12 mm -> An toàn tuyệt đối");

// Test 4: Bác sĩ thực sự đọc cm và văn bản ghi cm (không báo lỗi nhảy đơn vị)
const r4 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Khối u gan kích thước 10 cm",
  "- Gan: Có khối choán chỗ kích thước 10 cm.",
  "Khối u gan lớn."
);
assert(!r4.anomalies.some(a => a.type === "UNIT_SCALE_JUMP"), 
  "Hợp lệ: Bác sĩ chủ đích đọc 10 cm -> Không báo lỗi nhảy đơn vị");

// Test 5: Nốt phổi đo bằng cm (> 1cm) -> Cảnh báo ngưỡng giải phẫu
const r5 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Nốt thùy trên phổi phải 1.5 cm",
  "- Phổi phải: Nốt phổi thùy trên kích thước 1.5 cm.",
  "Nốt phổi phải."
);
assert(r5.anomalies.some(a => a.type === "ANATOMICAL_PLAUSIBILITY"), 
  "Cảnh báo giải phẫu: Nốt phổi đo bằng cm kích hoạt kiểm tra");

// Test 6: Sỏi niệu quản đo bằng cm (phi lý lâm sàng)
const r6 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Sỏi niệu quản 3 cm",
  "- Niệu quản phải: Có sỏi niệu quản 3 cm.",
  "Sỏi niệu quản."
);
assert(r6.anomalies.some(a => a.type === "ANATOMICAL_PLAUSIBILITY"), 
  "Cảnh báo giải phẫu: Sỏi niệu quản kích thước lớn phi lý (3cm)");

// -------------------------------------------------------------
// NHÓM 2: ĐẢO CHIỀU GIẢI PHẪU (LATERALITY INVERSION / MISMATCH)
// -------------------------------------------------------------
console.log("\n--- NHÓM 2: PHÁT HIỆN ĐẢO CHIỀU GIẢI PHẪU (PHẢI <-> TRÁI) ---");

// Test 7: Thận phải đọc thành thận trái
const r7 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Thận phải có sỏi 6mm",
  "- Thận trái: Có sỏi kích thước 6mm, thận phải bình thường.",
  "Hình ảnh sỏi thận trái."
);
assert(!r7.safe && r7.anomalies.some(a => a.type === "LATERALITY_INVERSION"), 
  "Bắt lỗi: Đọc Thận phải nhưng văn bản ghi Thận trái");

// Test 8: Tràn khí màng phổi trái đọc thành màng phổi phải
const r8 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Tràn khí màng phổi bên trái lượng ít",
  "- Màng phổi: Tràn khí màng phổi phải lượng ít.",
  "Tràn khí màng phổi phải."
);
assert(!r8.safe && r8.anomalies.some(a => a.type === "LATERALITY_INVERSION"), 
  "Bắt lỗi: Đọc Trái nhưng văn bản ghi Phải");

// Test 9: Giữ đúng bên giải phẫu -> An toàn
const r9 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Thận phải có sỏi 6mm",
  "- Thận phải: Có sỏi kích thước 6mm. Thận trái bình thường.",
  "Hình ảnh sỏi thận phải."
);
assert(!r9.anomalies.some(a => a.type === "LATERALITY_INVERSION"), 
  "Hợp lệ: Đúng Thận phải -> Không có lỗi đảo bên");

// Test 10: Mâu thuẫn chéo giữa Mô tả và Kết luận (Mô tả ghi Thận phải, Kết luận ghi Thận trái)
const r10 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Thận phải có sỏi 6mm",
  "- Thận phải: Nhu mô có sỏi 6mm. Thận trái bình thường.",
  "Hình ảnh sỏi thận trái kích thước 6mm."
);
assert(r10.anomalies.some(a => a.type === "CROSS_SECTION_MISMATCH"), 
  "Bắt lỗi mâu thuẫn chéo: Mô tả ghi Thận phải nhưng Kết luận ghi Thận trái");

// Test 11: Mâu thuẫn chéo giữa Mô tả (Phổi trái) và Kết luận (Phổi phải)
const r11 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Nốt mờ thùy trên phổi trái",
  "- Phổi trái: Thùy trên có nốt mờ 5mm. Phổi phải thông khí tốt.",
  "Hình ảnh nốt mờ thùy trên phổi phải."
);
assert(r11.anomalies.some(a => a.type === "CROSS_SECTION_MISMATCH"), 
  "Bắt lỗi mâu thuẫn chéo: Mô tả ghi Phổi trái nhưng Kết luận ghi Phổi phải");

// -------------------------------------------------------------
// NHÓM 3: ĐẢO CỰC LÂM SÀNG DO MẤT TỪ PHỦ ĐỊNH (POLARITY INVERSION)
// -------------------------------------------------------------
console.log("\n--- NHÓM 3: PHÁT HIỆN ĐẢO CỰC PHỦ ĐỊNH (MẤT TỪ 'KHÔNG', 'CHƯA') ---");

// Test 12: Đọc "Không thấy tràn dịch" nhưng văn bản ghi "Tràn dịch màng phổi"
const r12 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Không thấy tràn dịch màng phổi hai bên",
  "- Màng phổi: Có hình ảnh tràn dịch màng phổi hai bên lượng ít.",
  "Hình ảnh tràn dịch màng phổi."
);
assert(!r12.safe && r12.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi đảo cực: Đọc 'Không thấy tràn dịch' nhưng văn bản ghi có tràn dịch");

// Test 13: Đọc "Chưa thấy hạch to trung thất" nhưng văn bản ghi có hạch to
const r13 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Chưa thấy hạch to trung thất",
  "- Trung thất: Xuất hiện vài hạch to kích thước 15mm.",
  "Hạch to trung thất."
);
assert(!r13.safe && r13.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi đảo cực: Đọc 'Chưa thấy hạch to' nhưng văn bản ghi có hạch to");

// Test 14: Đọc "Không thấy gãy xương" nhưng văn bản ghi có gãy xương
const r14 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Khung xương lồng ngực không thấy gãy xương",
  "- Xương thành ngực: Hình ảnh gãy xương sườn số 5 bên phải.",
  "Gãy xương sườn phải."
);
assert(!r14.safe && r14.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi đảo cực: Đọc 'Không thấy gãy xương' nhưng văn bản ghi có gãy xương");

// Test 15: Đọc "Không có sỏi thận" nhưng văn bản ghi có sỏi thận
const r15 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Hai thận không có sỏi không ứ nước",
  "- Thận phải: Có sỏi thận kích thước 5mm.",
  "Sỏi thận phải."
);
assert(!r15.safe && r15.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi đảo cực: Đọc 'Không có sỏi' nhưng văn bản ghi có sỏi");

// Test 16: Bác sĩ đọc có bệnh lý ("Có tràn dịch màng phổi") nhưng văn bản áp nhầm mẫu bình thường
const r16 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Bệnh nhân có tràn dịch màng phổi phải lượng vừa",
  "- Màng phổi: Không thấy tràn dịch màng phổi hai bên.",
  "Hiện tại chưa thấy bất thường màng phổi."
);
assert(!r16.safe && r16.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi nuốt tổn thương: Đọc 'Có tràn dịch' nhưng văn bản áp mẫu 'Không thấy tràn dịch'");

// Test 17: Bác sĩ đọc "Gãy xương đòn" nhưng văn bản áp mẫu "Không thấy gãy xương"
const r17 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Gãy xương đòn bên trái di lệch",
  "- Khung xương: Không thấy gãy xương hay tiêu xương.",
  "Chưa thấy bất thường xương."
);
assert(!r17.safe && r17.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi nuốt tổn thương: Đọc 'Gãy xương đòn' nhưng văn bản áp mẫu 'Không thấy gãy xương'");

// Test 18: Phủ định được bảo toàn nguyên vẹn -> An toàn
const r18 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Không thấy tràn dịch màng phổi hai bên",
  "- Màng phổi: Không thấy tràn dịch màng phổi hai bên.",
  "Tim phổi chưa thấy bất thường."
);
assert(!r18.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Hợp lệ: Đọc phủ định và văn bản ghi phủ định -> Không báo lỗi");

// -------------------------------------------------------------
// NHÓM 4: CA LÂM SÀNG TỔNG THỂ & RỦI RO PHỨC HỢP
// -------------------------------------------------------------
console.log("\n--- NHÓM 4: ĐÁNH GIÁ TỔNG HỢP CA LÂM SÀNG ---");

// Test 19: Báo cáo ngực hoàn toàn bình thường
const r19 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Phổi hai bên thông khí tốt không thấy nốt khu trú",
  "- Nhu mô phổi hai bên: Thông khí tốt, không thấy nốt khu trú.",
  "Hiện tại chưa thấy bất thường tim phổi."
);
assert(r19.safe && r19.riskLevel === "NONE", 
  "Ca bình thường hoàn hảo: safe = true, riskLevel = NONE");

// Test 20: Ca có 2 lỗi đồng thời (Sai đơn vị + Đảo bên)
const r20 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Thận phải có sỏi 8mm",
  "- Thận trái: Có sỏi kích thước 8cm.",
  "Hình ảnh sỏi thận trái."
);
assert(!r20.safe && r20.anomalies.length >= 2 && r20.riskLevel === "CRITICAL", 
  "Ca đa lỗi: Bắt đồng thời lỗi nhảy đơn vị (8mm->8cm) và đảo bên (Phải->Trái)");

// Test 21: Kiểm tra trích xuất số đo
const measurements = ClinicalSafetyGuard.extractMeasurements("Nốt 12x10mm và nốt 5 mm và khối 3 cm");
assert(measurements.length === 3 && measurements[0].val1 === 12 && measurements[2].unit === "cm", 
  "Hàm extractMeasurements trích xuất chuẩn xác các số đo và đơn vị");

// Test 22: Trích xuất đơn vị tiếng Việt 'milimét' và 'xen-ti-mét'
const mVi = ClinicalSafetyGuard.extractMeasurements("Nốt 6 milimét và khối 4 xen-ti-mét");
assert(mVi.length === 2 && mVi[0].unit === "mm" && mVi[1].unit === "cm", 
  "Trích xuất đơn vị tiếng Việt (milimét, xen-ti-mét) chuẩn hóa thành mm, cm");

// Test 23: Dày màng phổi không bị hiểu nhầm thành đảo cực nếu không có phủ định
const r23 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Dày màng phổi khu trú bên phải",
  "- Màng phổi: Dày màng phổi khu trú bên phải.",
  "Hình ảnh dày màng phổi phải."
);
assert(!r23.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Khẳng định bệnh lý dày màng phổi đúng chuẩn");

// Test 24: Bác sĩ đọc "Không thấy dày màng phổi" nhưng văn bản ghi "Dày màng phổi"
const r24 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Không thấy dày màng phổi hai bên",
  "- Màng phổi: Hình ảnh dày màng phổi khu trú.",
  "Dày màng phổi."
);
assert(r24.anomalies.some(a => a.type === "POLARITY_INVERSION"), 
  "Bắt lỗi: Đọc 'Không thấy dày màng phổi' nhưng văn bản ghi dày màng phổi");

// Test 25: Bác sĩ đọc sỏi niệu quản hợp lý (6mm) -> Không báo lỗi giải phẫu
const r25 = ClinicalSafetyGuard.verifyClinicalSafety(
  "Sỏi niệu quản phải 6mm",
  "- Niệu quản phải: Có sỏi niệu quản 6mm.",
  "Sỏi niệu quản phải."
);
assert(!r25.anomalies.some(a => a.type === "ANATOMICAL_PLAUSIBILITY"), 
  "Sỏi niệu quản 6mm hợp lý lâm sàng -> Không báo lỗi");

// -------------------------------------------------------------
// TỔNG KẾT
// -------------------------------------------------------------
console.log(`\n======================================================`);
console.log(`KẾT QUẢ KIỂM THỬ: ${passed}/${total} test cases passed.`);
if (passed === total) {
  console.log("🎉 TOÀN BỘ 25/25 BÀI TEST GÁC CỔNG AN TOÀN ĐÃ VƯỢT QUA 100%!");
} else {
  console.error("⚠️ CÓ TEST CHƯA VƯỢT QUA!");
  process.exit(1);
}
