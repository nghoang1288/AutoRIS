import urllib.request
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

system_prompt = """Bạn là Trợ lý AI Chuyên gia Chẩn đoán Hình ảnh Y khoa (Radiology AI Assistant) tích hợp trong hệ thống AutoRIS.
Nhiệm vụ của bạn là nhận:
1. MẪU BÁO CÁO HIỆN TẠI (gồm MÔ TẢ và KẾT LUẬN đang có trên phần mềm RIS của bệnh viện).
2. LỜI ĐỌC CỦA BÁC SĨ (Dictation) qua điện thoại.

YÊU CẦU XỬ LÝ:
1. MÔ TẢ:
   - CHỈ SỬA ĐÚNG DÒNG CƠ QUAN CÓ TỔN THƯƠNG. Giữ nguyên 100% tất cả các dòng cơ quan bình thường khác, không viết lại hay format lại các dòng bình thường.
   - Với GAN: Khi có tổn thương (ví dụ nang gan, u máu, nốt vôi hóa...), BẮT BUỘC XOÁ BỎ câu "không thấy khối khu trú trước và sau tiêm thuốc cản quang." và câu "nhu mô đồng nhất". Cấu trúc dòng gan chuẩn: "-- Gan không to, bờ đều, nhu mô gan [vị trí + tổn thương + kích thước bác sĩ đọc]." (Ví dụ: "-- Gan không to, bờ đều, nhu mô gan trái có nang đường kính 5mm.").
   - Với cơ quan CHƯA CÓ trong mẫu (ví dụ: Dạ dày, Ruột non, Đại tràng, Ruột thừa, Tuyến thượng thận, Cột sống...): Thêm 1 dòng mới duy nhất "-- [Tên cơ quan]: [mô tả]" vào đúng vị trí giải phẫu tự nhiên trong phần MÔ TẢ (sau Tụy/Lách).
   - Nếu lời đọc có hạch hoặc dịch: Cập nhật vào dòng hạch/dòng dịch tương ứng trong mẫu.

2. KẾT LUẬN:
   - LUÔN LUÔN BẮT ĐẦU BẰNG TỪ "Hình ảnh" Ở ĐẦU CÂU (VÀ CHỈ DUY NHẤT 1 TỪ "Hình ảnh", TUYỆT ĐỐI KHÔNG ĐƯỢC LẶP LẠI TỪ NÀY Ở CÁC CÂU SAU).
   - KẾT LUẬN TUYỆT ĐỐI KHÔNG CÓ PHẦN MÔ TẢ CHI TIẾT (KHÔNG ghi kích thước mm, KHÔNG ghi đường kính, tỷ trọng, bề dày).
   - Ví dụ đúng: "Hình ảnh nang gan trái." (CẤM ghi: "Hình ảnh nang gan trái đường kính 5mm").
   - Ví dụ đúng: "Hình ảnh nang gan hạ phân thùy VIII."
   - Ví dụ đúng: "Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận."
   - Nếu trước đó trong kết luận đã có tổn thương khác, các câu phía sau nối tiếp KHÔNG lặp lại từ "Hình ảnh" (ví dụ: "Hình ảnh nang gan trái. Sỏi thận phải.").
   - Xóa bỏ câu kết luận bình thường ("Hiện tại không thấy bất thường...").

3. ĐỊNH DẠNG TRẢ VỀ:
   Trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "mota": "toàn bộ nội dung mô tả sau khi cập nhật (chỉ dòng có tổn thương bị sửa, các dòng khác giữ nguyên)",
  "ketluan": "nội dung kết luận chuẩn (bắt đầu bằng Hình ảnh, không có kích thước chi tiết)",
  "summary": "tóm tắt ngắn gọn thay đổi"
}
"""

template_mota = """-- Gan không to, bờ đều, nhu mô đồng nhất, không thấy khối khu trú trước và sau tiêm thuốc cản quang. 
-- Tĩnh mạch cửa không giãn, không thấy huyết khối. 
-- Đường mật trong gan không giãn, không thấy sỏi tăng tỷ trọng
-- Ống mật chủ không giãn, không thấy sỏi tăng tỷ trọng 
-- Túi mật không giãn, thành mỏng, không thấy sỏi, xung quanh túi mật không có dịch.
-- Tụy: Kích thước bình thường , nhu mô đều, ống tụy không giãn. 
-- Lách không to, nhu mô đều. 
-- Thận phải: hình thái, kích thước bình thường. Nhu mô dày và ngấm thuốc bình thường. Đài bể thận không giãn, không thấy sỏi. Niệu quản không giãn. 
-- Thận trái: hình thái, kích thước bình thường. Nhu mô dày và ngấm thuốc bình thường. Đài bể thận không giãn, không thấy sỏi. Niệu quản không giãn. 
-- Bàng quang thành mỏng, dịch đồng nhất, không có sỏi.
-- Tiểu khung: không thấy khối bất thường 
-- Không thấy hạch to dọc các mạch máu lớn 
-- Không thấy dịch tự do ổ bụng và khoang màng phổi hai bên."""

template_kl = "Hiện tại không thấy bất thường trên CLVT ổ bụng."

def test(dictation):
    prompt = f"""MẪU BÁO CÁO HIỆN TẠI:
MÔ TẢ:
{template_mota}

KẾT LUẬN:
{template_kl}

LỜI BÁC SĨ ĐỌC:
{dictation}
"""
    data = {
        "model": "gemini-3.5-flash-lite",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "stream": False
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-e8ff53fc363b707a-aj81vz-ff55a6d6"
    }
    req = urllib.request.Request("https://9router.hoang.qzz.io/v1/chat/completions", data=json.dumps(data).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        raw = res["choices"][0]["message"]["content"]
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
            raw = raw.strip()
        parsed = json.loads(raw)
        print("=== DICTATION:", dictation)
        print("--- DÒNG GAN TRONG MÔ TẢ ---")
        for line in parsed["mota"].split("\n"):
            if "Gan" in line:
                print(line)
        print("--- KẾT LUẬN ---")
        print(parsed["ketluan"])

if __name__ == "__main__":
    test("gan trái có nang đường kính 5 mm")
