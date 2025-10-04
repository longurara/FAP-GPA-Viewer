# FAP GPA Viewer – Dashboard

Chrome Extension giúp sinh viên FPT University theo dõi GPA, điểm danh, lịch học và nhận thông báo tự động khi có cập nhật.

## ✨ Tính năng

- **📊 Xem GPA**: Tính toán GPA thang 10 và thang 4, tổng tín chỉ
- **✅ Theo dõi điểm danh**: Xem lịch sử điểm danh, tỷ lệ chuyên cần
- **📅 Lịch học**: Hiển thị lịch học trong tuần
- **🔔 Thông báo tự động**: Nhận thông báo khi có điểm danh mới
- **📄 Export PDF**: Xuất toàn bộ dữ liệu ra PDF
- **🔄 Kiểm tra cập nhật**: Tự động thông báo khi có phiên bản mới

## 🚀 Cài đặt

### Bước 1: Tải mã nguồn

**Cách 1: Tải trực tiếp**
1. Truy cập [GitHub Repository](https://github.com/longurara/FAP-GPA-Viewer)
2. Click nút **Code** → **Download ZIP**
3. Giải nén file ZIP vào thư mục bất kỳ

**Cách 2: Clone qua Git**
```bash
git clone https://github.com/longurara/FAP-GPA-Viewer.git
cd FAP-GPA-Viewer
```

### Bước 2: Mở Chrome Extensions

1. Mở trình duyệt Chrome
2. Truy cập `chrome://extensions/` hoặc:
   - Menu (⋮) → **Extensions** → **Manage Extensions**
3. Bật chế độ **Developer mode** (góc trên bên phải)

### Bước 3: Load extension

1. Click nút **Load unpacked** (Tải tiện ích đã giải nén)
2. Chọn thư mục chứa mã nguồn extension (thư mục có file `manifest.json`)
3. Extension sẽ xuất hiện trong danh sách

### Bước 4: Ghim extension

1. Click vào biểu tượng puzzle 🧩 (Extensions) trên thanh công cụ Chrome
2. Tìm **FAP GPA Viewer – Dashboard**
3. Click vào icon ghim 📌 để cố định extension trên thanh công cụ

## 📖 Hướng dẫn sử dụng

### Lần đầu sử dụng

1. **Đăng nhập FAP**: 
   - Truy cập https://fap.fpt.edu.vn
   - Đăng nhập bằng tài khoản FEID của bạn

2. **Mở extension**: 
   - Click vào icon extension trên thanh công cụ

3. **Làm mới dữ liệu**: 
   - Click nút **"Làm mới"** để tải dữ liệu lần đầu
   - Chờ vài giây để extension tải dữ liệu

### 📊 Tab GPA

- Hiển thị GPA thang 10, thang 4 và tổng tín chỉ
- Danh sách tất cả môn học với điểm số
- **Tìm kiếm**: Nhập tên môn hoặc mã môn vào ô tìm kiếm
- **Copy GPA**: Click "Copy GPA" để sao chép thông tin GPA

#### Các nút:
- **Trang Transcript**: Mở trang điểm của FAP
- **Copy GPA**: Copy GPA ra clipboard
- **Làm mới**: Tải lại dữ liệu transcript

### ✅ Tab Điểm danh

- Hiển thị tỷ lệ chuyên cần (%)
- Số buổi có mặt / vắng / muộn
- Lịch sử điểm danh chi tiết (mới nhất → cũ nhất)

#### Lọc và tìm kiếm:
- **Lọc theo ngày**: Chọn thứ hoặc ngày cụ thể từ dropdown
- **Tìm kiếm**: Tìm theo mã môn hoặc trạng thái

#### Các nút:
- **Trang Attendance**: Mở trang điểm danh FAP
- **Làm mới**: Cập nhật dữ liệu điểm danh mới nhất

### 📅 Tab Lịch

- Hiển thị lịch học cả tuần
- Thông tin chi tiết: Thứ, Slot, Giờ học, Phòng học

#### Các nút:
- **Trang Schedule**: Mở trang lịch học FAP
- **Làm mới**: Cập nhật lịch học mới nhất

### 🔖 Tab Bookmark

Truy cập nhanh các trang thường dùng:
- **LMS HCM**: Learning Management System
- **FAP**: Trang FAP chính
- **IT HCM**: Trang IT HCM

### ⚙️ Tab Cài đặt

#### Giờ hoạt động
- Cấu hình khung giờ extension hoạt động
- Mặc định: 07:00 - 17:40

#### Trễ thông báo ngẫu nhiên
- Thiết lập độ trễ ngẫu nhiên (phút) khi gửi thông báo
- Mặc định: 10-30 phút
- Giúp tránh bị phát hiện là bot

#### Tần suất kiểm tra
- Cài đặt tần suất kiểm tra cập nhật (phút)
- Mặc định: 15 phút
- Tối thiểu: 5 phút

#### Các nút:
- **Lưu cài đặt**: Lưu các thay đổi
- **Test thông báo**: Kiểm tra thông báo có hoạt động không
- **Export PDF**: Xuất toàn bộ dữ liệu ra file PDF

## 📁 Cấu trúc thư mục

```
FAP-GPA-Viewer/
├── manifest.json          # Cấu hình extension (Manifest V3)
├── background.js          # Service worker (polling, notifications)
├── popup.html            # Giao diện popup chính
├── popup.js              # Logic xử lý popup
├── popup.css             # Style cho popup
├── report.html           # Trang hiển thị PDF
├── report.js             # Logic xuất PDF
├── report.css            # Style cho PDF
├── icon128.png           # Icon extension (128x128)
└── README.md             # File hướng dẫn này
```

## 🔧 Chi tiết kỹ thuật

### Permissions
Extension yêu cầu các quyền sau:
- `storage`: Lưu trữ dữ liệu local
- `tabs`: Mở tab mới
- `notifications`: Hiển thị thông báo
- `alarms`: Lên lịch kiểm tra định kỳ
- `host_permissions`: Truy cập fap.fpt.edu.vn

### Cache
- Transcript: Cache 24 giờ
- Attendance: Cache 10 phút
- Update check: Cache 6 giờ

### Service Worker
- Tự động kiểm tra điểm danh mỗi 15 phút (có thể cấu hình)
- Gửi thông báo khi có điểm danh mới
- Kiểm tra cập nhật extension mỗi 6 giờ

## ⚠️ Lưu ý quan trọng

- Extension cần quyền truy cập `fap.fpt.edu.vn`
- **Bạn phải đăng nhập FAP** trước khi sử dụng extension
- Dữ liệu được cache để tối ưu hiệu suất
- Thông báo chỉ hoạt động trong khung giờ cài đặt
- Extension **không lưu mật khẩu** hay thông tin đăng nhập

## 🐛 Khắc phục sự cố

### Extension không tải được dữ liệu

**Nguyên nhân**: Chưa đăng nhập FAP hoặc session hết hạn

**Giải pháp**:
1. Mở https://fap.fpt.edu.vn và đăng nhập
2. Quay lại popup extension
3. Click nút **"Làm mới"**

### Không nhận được thông báo

**Kiểm tra**:
1. Vào `chrome://settings/content/notifications`
2. Đảm bảo thông báo được bật
3. Kiểm tra giờ hoạt động trong **Tab Cài đặt**
4. Dùng nút **"Test thông báo"** để kiểm tra

### Extension bị lỗi sau khi cập nhật

**Giải pháp**:
1. Vào `chrome://extensions/`
2. Tìm **FAP GPA Viewer**
3. Click nút **Reload** (biểu tượng 🔄)
4. Nếu vẫn lỗi: Xóa và cài lại extension

### Dữ liệu không chính xác

**Giải pháp**:
1. Click **"Làm mới"** trong từng tab
2. Xóa cache: Vào `chrome://extensions/` → Click **"Remove"** và cài lại
3. Kiểm tra lại trên trang FAP gốc

## 🔄 Cập nhật extension

### Tự động
Extension tự động kiểm tra cập nhật từ GitHub mỗi 6 giờ

### Thủ công
1. Click nút **"Check update"** trong popup
2. Nếu có bản mới, nút sẽ đổi thành **"Cập nhật"**
3. Click để mở trang release trên GitHub
4. Tải về và cài đặt lại theo hướng dẫn

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh!

### Báo lỗi
- Tạo [Issue](https://github.com/longurara/FAP-GPA-Viewer/issues) trên GitHub
- Mô tả chi tiết lỗi và cách tái hiện

### Đề xuất tính năng
- Tạo [Issue](https://github.com/longurara/FAP-GPA-Viewer/issues) với label "enhancement"
- Giải thích rõ tính năng và lợi ích

### Pull Request
1. Fork repository
2. Tạo branch mới: `git checkout -b feature/ten-tinh-nang`
3. Commit changes: `git commit -m 'Add some feature'`
4. Push to branch: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

## 📜 License

MIT License - Xem file [LICENSE](LICENSE) để biết thêm chi tiết

## 👤 Tác giả

**longurara**
- GitHub: [@longurara](https://github.com/longurara)
- Repository: [FAP-GPA-Viewer](https://github.com/longurara/FAP-GPA-Viewer)

## 🙏 Lời cảm ơn

- FPT University vì hệ thống FAP
- Cộng đồng sinh viên FPT đã đóng góp ý kiến

## ⚖️ Disclaimer

Extension này **không chính thức** và **không liên quan** đến FPT University hay FPT Education. 

- Sử dụng với trách nhiệm của bản thân
- Không spam hay lạm dụng hệ thống FAP
- Tôn trọng quy định của trường

---

**Made with ❤️ by FPT Students, for FPT Students**

*Nếu extension hữu ích, hãy cho repo một ⭐ trên GitHub!*
