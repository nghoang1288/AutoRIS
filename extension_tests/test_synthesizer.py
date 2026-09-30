import urllib.request
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')


system_prompt = """Bạn là Trợ lý AI Chuyên gia Chẩn đoán Hình ảnh Y khoa (Radiology AI Assistant) tích hợp trong hệ thống AutoRIS.
Nhiệm vụ của bạn là nhận:
1. MẪU BÁO CÁO HIỆN TẠI (gồm MÔ TẢ và KẾT LUẬN đang có trên phần mềm RIS của bệnh viện, thường là mẫu bình thường).
2. LỜI ĐỌC CỦA BÁC SĨ (Dictation) qua điện thoại.

YÊU CẦU XỬ LÝ:
1. MÔ TẢ:
   - Giữ nguyên 100% các cơ quan/dòng bình thường không được nhắc tới. Tuyệt đối không xóa hay viết lại các cơ quan bình thường khác.
   - Nếu cơ quan ĐÃ CÓ trong mẫu (ví dụ Gan, Túi mật, Thận, Hạch...): Cập nhật mô tả tổn thương vào đúng vị trí cơ quan đó. Giữ lại các đặc điểm bình thường nếu phù hợp (ví dụ: 'Gan không to, bờ đều, nhu mô gan hạ phân thùy VIII có nang đường kính 9mm.').
   - Nếu cơ quan CHƯA CÓ trong mẫu (ví dụ: Dạ dày, Ruột non, Đại tràng, Ruột thừa, Tuyến thượng thận, Cột sống...): Thêm 1 dòng mới bắt đầu bằng '-- [Tên cơ quan]: [Mô tả chi tiết]' vào đúng vị trí giải phẫu tự nhiên trong phần MÔ TẢ (ví dụ Dạ dày đặt sau Lách/Tụy hoặc trước Thận/Tiểu khung; Ruột thừa đặt trước Tiểu khung; Tuyến thượng thận đặt cạnh Thận...).
   - Nếu lời đọc có mô tả hạch hoặc dịch: Cập nhật vào dòng hạch/dòng dịch tương ứng trong mẫu.
2. KẾT LUẬN:
   - Xóa bỏ câu kết luận bình thường (ví dụ: 'Hiện tại không thấy bất thường...').
   - Tự động tạo kết luận y khoa ngắn gọn, chuẩn xác theo tổn thương vừa phát hiện.
   - Quy tắc câu kết luận: Bắt đầu bằng tên tổn thương hoặc 'Hình ảnh...' (Ví dụ: 'Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận.', hoặc 'Nang gan (hạ phân thùy VIII).', 'Sỏi túi mật.', 'Sỏi đài thận trái.').
   - Nếu trước đó trong kết luận đã có tổn thương khác của ca bệnh (từ lần đọc trước), hãy giữ lại và ghi thêm kết luận mới xuống dòng tiếp theo.
3. ĐỊNH DẠNG TRẢ VỀ:
   Trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm lời giải thích, không markdown code fence ```json):
{
  "mota": "toàn bộ nội dung mô tả sau khi cập nhật",
  "ketluan": "toàn bộ nội dung kết luận sau khi cập nhật",
  "summary": "tóm tắt ngắn gọn thay đổi (ví dụ: Cập nhật gan: nang HSP VIII)"
}
"""

template_text = """KỸ THUẬT: Chụp CLVT ổ bụng độ dày lớp cắt 3mm trước và sau tiêm thuốc cản quang. 
MÔ TẢ:
-- Gan không to, bờ đều, nhu mô đồng nhất, không thấy khối khu trú trước và sau tiêm thuốc cản quang. 
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
-- Không thấy dịch tự do ổ bụng và khoang màng phổi hai bên. 
KẾT LUẬN:
Hiện tại không thấy bất thường trên CLVT ổ bụng."""

def run_test(dictation, title):
    print(f"\n==================== {title} ====================")
    print("DOCTOR DICTATION:", dictation)
    prompt = f"""MẪU BÁO CÁO HIỆN TẠI TRÊN RIS:
{template_text}

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
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            print("Status:", resp.status)
            print("Raw len:", len(raw))
            if raw.strip().startswith("data:"):
                # SSE format
                lines = raw.split("\n")
                chunks = []
                for line in lines:
                    if line.startswith("data: ") and not line.startswith("data: [DONE]"):
                        c = json.loads(line[6:])
                        chunks.append(c["choices"][0]["delta"].get("content", ""))
                content = "".join(chunks)
            else:
                res = json.loads(raw)
                content = res["choices"][0]["message"]["content"]
            # Clean markdown code blocks if present
            clean_json = content.strip()
            if clean_json.startswith("```"):
                clean_json = clean_json.split("\n", 1)[1]
                if clean_json.endswith("```"):
                    clean_json = clean_json.rsplit("```", 1)[0]
                clean_json = clean_json.strip()
            parsed = json.loads(clean_json)
            print("\n--- KẾT QUẢ MÔ TẢ ĐÃ GHÉP ---")
            print(parsed.get("mota"))
            print("\n--- KẾT QUẢ KẾT LUẬN TỰ SINH ---")
            print(parsed.get("ketluan"))
            print("\n--- TÓM TẮT ---")
            print(parsed.get("summary"))

    except urllib.error.HTTPError as e:
        print("HTTP ERROR:", e.code, e.read().decode("utf-8"))
    except Exception as e:
        print("OTHER ERROR:", e)


if __name__ == "__main__":
    ex1 = "Dày không đều thành hang - môn vị dạ dày, chỗ dày nhất 21mm, gây hẹp lòng môn vị, sau tiêm ngấm thuốc mạnh không đều, mất cấu trúc lớp, thâm nhiễm mỡ nhẹ xung quanh, lân cận có vài hạch (khoảng 6-7 hạch), hạch lớn kích thước 21x8mm, bờ không đều, sau tiêm ngấm thuốc không đồng nhất."
    ex2 = "hạ phân thùy VIII có nang đường kính 9mm"
    run_test(ex1, "VÍ DỤ 1: DẠ DÀY + HẠCH")
    run_test(ex2, "VÍ DỤ 2: NANG GAN HẠ PHÂN THÙY VIII")
