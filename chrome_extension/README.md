# AutoRIS - Chrome Extension: Tự Động Điền Mô Tả & Kết Luận Vào RIS

Tiện ích mở rộng Google Chrome (Manifest V3) hỗ trợ bác sĩ Chẩn đoán Hình ảnh: **Khi đọc kết quả (trên điện thoại hoặc micro PC), văn bản sẽ tự động được phân tách Mô tả và Kết luận rồi gõ trực tiếp vào hệ thống RIS** (`192.168.50.105`).

Dựa trên nền tảng kỹ thuật định vị Editor và xử lý DOM tiên tiến từ `pacs-medical-report-translator`.

---

## 🌟 Tính Năng Nổi Bật

1. **Hai phương thức nhận diện giọng nói linh hoạt**:
   - **Qua điện thoại (AutoRIS On-Device ZipFormer 150M)**: Bác sĩ cầm OnePlus Ace 5 / S24 Ultra đọc ca bệnh, mô hình 153M offline nhận diện và chuẩn hóa y khoa $\rightarrow$ tự động bắn kết quả về server $\rightarrow$ Extension bắt ngay lập tức và điền vào RIS trên máy tính chỉ sau ~200ms.
   - **Trực tiếp trên PC (Direct Mic)**: Nút Micro nổi trên màn hình RIS (hoặc phím tắt **`F8`**) cho phép bác sĩ dùng micro máy tính/tai nghe đọc trực tiếp.

2. **Bộ bóc tách thông minh Mô tả & Kết luận (Smart Splitter)**:
   - Tự động nhận diện từ khóa `Kết luận:`, `KẾT LUẬN:`, `KL:`, `Nghĩ đến:`, `Theo dõi:`.
   - Phần trước từ khóa $\rightarrow$ Tự động điền vào mục **Mô tả hình ảnh**.
   - Phần sau từ khóa $\rightarrow$ Tự động điền vào mục **Kết luận**.
   - Hỗ trợ cả hệ thống RIS có 1 khung soạn thảo chung (CKEditor, Summernote, ContentEditable, Textarea) lẫn hệ thống RIS chia tách riêng 2 ô `#txt-mota` và `#txt-ketluan`.

3. **Thanh điều khiển giọng nói nổi (Floating Voice Bar)**:
   - Nổi ngay trên màn hình RIS, có thể kéo thả di chuyển linh hoạt.
   - Đèn LED báo trạng thái kết nối tới server (`🟢 Online (autoris.hoang.qzz.io)`).
   - Xem nhanh trước văn bản vừa đọc được và nút **"Điền lại"** 1 chạm.

4. **Âm thanh phản hồi chuông báo (Audio Chime)**:
   - Phát âm thanh "bíp" êm tai (sinh trực tiếp từ Web Audio API không tốn tài nguyên) ngay khi văn bản đã được điền thành công vào RIS.

5. **An toàn dữ liệu & Chống mất chữ**:
   - Tự động sao chép vào Clipboard (luôn sẵn sàng nhấn `Ctrl + V` dán thủ công nếu cần).
   - Tự động kích hoạt các sự kiện DOM `input`, `change`, `keydown` để RIS nhận biết thay đổi và không bị mất nội dung khi bấm "Lưu".

---

## 🛠️ Hướng Dẫn Cài Đặt Lên Google Chrome

1. Mở trình duyệt Google Chrome trên máy tính phòng đọc.
2. Truy cập địa chỉ: `chrome://extensions/`
3. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải màn hình.
4. Bấm nút **Load unpacked (Tải tiện ích đã giải nén)** ở góc trên bên trái.
5. Chọn thư mục:
   `E:\Code linh tinh\autoris-ris-extension`
6. Mở trang RIS (`http://192.168.50.105`) hoặc ấn icon AutoRIS trên thanh công cụ Chrome để sử dụng ngay!
