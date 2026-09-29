# AutoRIS - Chrome Extension: Tự Động Phân Bổ Mô Tả & Kết Luận Vào RIS

Tiện ích mở rộng Google Chrome (Manifest V3) chuyên dụng cho Bác sĩ Chẩn đoán Hình ảnh: **Bác sĩ chỉ cần đọc trên điện thoại (OnePlus Ace 5 / Snapdragon 8 Gen 3 với AutoRIS ZipFormer 150M), toàn bộ nội dung sẽ tự động được phân tích giải phẫu, điền vào đúng vị trí cơ quan trong mẫu mô tả bệnh viện và tự động sinh Kết luận chuẩn xác trên hệ thống RIS.**

Hỗ trợ đồng thời cả 2 hệ thống RIS:
- **Phòng đọc nội bộ / Lab**: `http://192.168.50.105/ris/study/reading`
- **Bệnh viện Đại học Y Hà Nội**: `https://pacs.benhviendaihocyhanoi.com/ris/study/reading`

---

## 🌟 Tính Năng Nổi Bật

1. **100% Qua Điện Thoại (Không Cần Micro hay Tai Nghe PC)**:
   - Bác sĩ đọc trực tiếp trên app AutoRIS mobile offline (mô hình ZipFormer 153M nhận diện tiếng Việt y khoa tức thì).
   - Server VPS (`https://autoris.hoang.qzz.io`) tiếp nhận và phát sóng tức thì về Extension trên Chrome PC qua SSE/Long-polling.

2. **Công Nghệ Phân Bổ Giải Phẫu Thông Minh (Clinical Template Synthesizer)**:
   - Đọc mẫu sẵn có trên RIS bệnh viện (như mẫu CLVT ổ bụng, lồng ngực, sọ não...).
   - **Giữ nguyên 100% các cơ quan bình thường**: Không bao giờ ghi đè hay xóa các dòng bình thường không được nhắc tới.
   - **Tổn thương đã có cơ quan trong mẫu (Ví dụ 2: Gan)**:
     - Bác sĩ đọc: *"hạ phân thùy VIII có nang đường kính 9mm"*
     - Extension tự động cập nhật vào dòng Gan: `-- Gan không to, bờ đều, nhu mô gan hạ phân thùy VIII có nang đường kính 9mm...`
     - Tự động thay thế câu phủ định bình thường ở kết luận bằng: `Nang gan hạ phân thùy VIII.`
   - **Tổn thương cơ quan CHƯA CÓ trong mẫu (Ví dụ 1: Dạ dày)**:
     - Bác sĩ đọc: *"Dày không đều thành hang - môn vị dạ dày, chỗ dày nhất 21mm, gây hẹp lòng môn vị... lân cận có vài hạch (khoảng 6-7 hạch)..."*
     - Extension tự động thêm 1 dòng mới `-- Dạ dày: ...` vào đúng vị trí giải phẫu tự nhiên trong phần MÔ TẢ (sau Lách/Tụy).
     - Cập nhật dòng `-- Hạch: ...` tương ứng.
     - Tự động sinh KẾT LUẬN: `Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm hạch lân cận.`

3. **Cơ Chế Kép (AI Synthesizer + Local Deterministic Fallback)**:
   - Tích hợp 9router (`https://9router.hoang.qzz.io/v1`) với các model `gemini-3.5-flash-lite`, `gemini-3.7-flash` và dự phòng trực tiếp Google Gemini API.
   - Khi mất mạng hoặc không dùng AI: Tự động kích hoạt bộ quy tắc phân bổ cục bộ (Local Fallback) dựa trên từ khóa giải phẫu (Gan, Mật, Tụy, Lách, Thận, Dạ dày, Ruột thừa, Hạch, Dịch...).

4. **Nút Hoàn Tác 1 Chạm (Undo System)**:
   - Lưu trữ stack 10 bước chỉnh sửa gần nhất.
   - Nếu muốn quay lại mẫu ban đầu hoặc xóa câu vừa điền, chỉ cần bấm **`↩️ Hoàn tác`** trên thanh điều khiển nổi.

5. **Thanh Trạng Thái Nổi Nhẹ Nhàng (Floating Bar)**:
   - Hiển thị gọn gàng ở góc màn hình RIS, có thể kéo thả di chuyển tùy ý.
   - Báo trạng thái kết nối điện thoại: `🟢 AutoRIS Dictation`.
   - Xem trước câu đọc từ điện thoại, phân tích thay đổi và kết luận.
   - Nút **`✍️ Điền lại`** và **`↩️ Hoàn tác`**.

---

## 🛠️ Hướng Dẫn Cài Đặt Lên Google Chrome

1. Mở trình duyệt Google Chrome trên máy tính phòng đọc RIS.
2. Truy cập địa chỉ: `chrome://extensions/`
3. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
4. Bấm nút **Load unpacked (Tải tiện ích đã giải nén)** ở góc trên bên trái.
5. Chọn thư mục extension:
   `E:\Code linh tinh\autoris-ris-extension`
6. Mở trang RIS tại `http://192.168.50.105` hoặc `https://pacs.benhviendaihocyhanoi.com/ris/study/reading`.
7. Mở app AutoRIS trên điện thoại và bắt đầu đọc ca bệnh!
