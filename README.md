# FAP Transcript Beautifier

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore)  
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Tiện ích Chrome giúp cải thiện trải nghiệm xem bảng điểm trên [FAP FPT University].

---

## ✨ Tính năng chính
- 🌈 **Viewer đẹp mắt**
  - Dark mode
  - Tìm kiếm môn học
  - Export CSV
  - Biểu đồ GPA theo kỳ (SVG chart)

- 📊 **Tính GPA tự động**
  - GPA thang 10
  - GPA thang 4
  - Tổng tín chỉ

- 🚫 **Loại trừ môn học**
  - Tuỳ chỉnh môn không tính vào GPA (VD: Vovinam, Orientation...)
  - Danh sách lưu cục bộ bằng `localStorage`

- 📋 **Copy nhanh GPA**
  - 1 click để copy GPA (thang 10, 4, tổng tín chỉ)

- ⚙️ **Nút bánh răng trên FAP**
  - 🌈 Mở viewer đẹp
  - 📊 Hiện overlay GPA ngay trên trang FAP
  - 📋 Copy GPA

- 💾 **Export dữ liệu**
  - Xuất bảng điểm ra CSV
  - Mở lại Excel gốc của FAP

---

## 🛠 Cài đặt
1. Tải file ZIP mới nhất: **`fap-beautifier-vanilla-exclude-overlay.zip`**
2. Giải nén ra thư mục
3. Mở `chrome://extensions`
4. Bật **Developer mode**
5. Chọn **Load unpacked** → trỏ tới thư mục vừa giải nén

---

## 📖 Hướng dẫn sử dụng
- Truy cập trang `StudentTranscript.aspx` trên FAP
- Góc phải dưới sẽ xuất hiện nút **⚙️**:
  - 🌈 **Mở viewer đẹp**
  - 📊 **Hiện GPA overlay**
  - 📋 **Copy GPA**

### Trong Viewer
- **Loại trừ môn** → chọn/tắt môn cần tính vào GPA
- **Export CSV** → tải bảng điểm về dạng CSV
- **Excel gốc** → mở lại file Excel từ FAP
- **Tìm kiếm** → lọc nhanh môn học theo code hoặc tên

---

## 📝 Ghi chú
- Danh sách môn loại trừ mặc định:  
TRS501, ENT503, VOV114, VOV124, VOV134, OTP101
- Danh sách loại trừ được lưu trong `localStorage` với key:  
FAP_EXCLUDED_CODES
- GPA overlay tính toán đồng bộ theo danh sách loại trừ này

---

## 📌 Changelog

### v1.5.0
- Thêm overlay GPA ngay trên trang FAP  
- Đồng bộ danh sách loại trừ giữa Viewer và Overlay  
- Bổ sung menu ⚙️ với 3 chức năng chính:
- Mở viewer đẹp
- Hiện GPA overlay
- Copy GPA

### v1.4.0
- Hỗ trợ loại trừ môn trong Viewer (có modal chọn môn)  
- Lưu danh sách loại trừ vào `localStorage`  

### v1.3.0
- Chuyển sang CSS/JS thuần (không phụ thuộc CDN)  
- Thêm biểu đồ GPA SVG  

### v1.2.0
- Thêm menu ⚙️ dưới góc phải  
- Thêm tùy chọn Copy GPA và Tính lại GPA  

### v1.1.0
- Thêm giao diện Viewer đẹp bằng Tailwind  
- Export CSV và Dark mode  

### v1.0.0
- Tính GPA cơ bản  
- Hiện overlay GPA đơn giản  

---

## ⚠️ Known Issues
- Một số thay đổi giao diện FAP có thể làm script không nhận diện đúng bảng điểm.  
- Nếu overlay hiển thị sai, hãy bấm **Mở viewer đẹp** để kiểm tra lại.  
- Extension chưa được publish chính thức trên Chrome Web Store (chỉ cài dạng unpacked).  

---

## 📜 License
Phát hành theo giấy phép [MIT](LICENSE).  
Bạn được phép sử dụng, chỉnh sửa và phân phối lại theo điều kiện của MIT License.
