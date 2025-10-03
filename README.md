# FAP Dashboard — Chrome Extension

> Trợ lý học tập cho sinh viên FPT: xem **GPA**, **điểm danh**, **lịch học** theo tuần & nhận **thông báo “Môn XXX đã được điểm danh”** — nhanh, gọn, chính xác.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](#)
[![Manifest v3](https://img.shields.io/badge/Manifest-v3-000000.svg)](#)
[![Status](https://img.shields.io/badge/status-active-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](#)

---

## Mục lục
- [Tính năng](#tính-năng)
- [Ảnh minh họa](#ảnh-minh-họa)
- [Cài đặt](#cài-đặt)
- [Sử dụng nhanh](#sử-dụng-nhanh)
- [Cài đặt (Settings)](#cài-đặt-settings)
- [Cách hoạt động](#cách-hoạt-động)
- [Quyền truy cập & Bảo mật](#quyền-truy-cập--bảo-mật)
- [Khắc phục sự cố](#khắc-phục-sự-cố)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Đóng góp](#đóng-góp)
- [Lộ trình](#lộ-trình)
- [Giấy phép](#giấy-phép)

---

## Tính năng

### GPA / Bảng điểm
- Tự động lấy Transcript, **tính GPA thang 10 & 4**, và tổng tín chỉ.
- **Cache 24 giờ**: nếu đã có dữ liệu thì **không fetch lại**, sau 24h tự cập nhật.
- Tìm kiếm theo **mã môn / tên môn**.

### Điểm danh (Attendance)
- Đọc **Schedule Of Week** và trích **attended / absent / not yet**.
- **Thông báo thông minh**: phát hiện môn mới chuyển sang *attended* → gửi thông báo:
  - `Môn XXX đã được điểm danh`  
  - Nhiều môn: `Các môn AAA, BBB… đã được điểm danh`.
- Chạy theo **khung giờ hoạt động** và **độ trễ ngẫu nhiên** (tránh spam, giống hành vi tự nhiên).

### Lịch học (Cả tuần)
- Parse linh hoạt bảng tuần của FAP (MON→SUN + `dd/mm`), **lọc sạch ô rỗng/“-”**.
- Hiển thị **cả tuần** theo thứ tự: **Thứ → Slot → Giờ → Môn → Phòng → Ghi chú**.

### Trải nghiệm
- Nút **Làm mới**: xoá cache và tải lại tức thì.
- Nếu bị đá về `Default.aspx` (chưa đăng nhập) → **mở trang `https://fap.fpt.edu.vn/`** để bạn đăng nhập rồi quay lại nhấn **Làm mới**.

---

## Ảnh minh hoạ

- `assets/screen-gpa.png` — tab GPA  
- `assets/screen-attendance.png` — tab Điểm danh  
- `assets/screen-schedule-week.png` — tab Lịch (cả tuần)

---

## Cài đặt
1. Tải bản phát hành ZIP tại **Releases** hoặc file `FAP-Dashboard-fixed.zip`.
2. Giải nén ZIP ra một thư mục.
3. Mở **Chrome/Edge (Chromium)** → `chrome://extensions`  
   Bật **Developer mode** → **Load unpacked** → chọn thư mục vừa giải nén.

> Edge: `edge://extensions` thao tác tương tự.

---

## Sử dụng nhanh
1. Mở **FAP Dashboard** từ thanh Extensions.  
2. **GPA**: xem GPA (10/4), tổng tín chỉ, danh sách môn (có ô tìm kiếm).  
3. **Điểm danh**: xem tỷ lệ, lọc theo ngày/keyword.  
4. **Lịch**: xem **lịch cả tuần**; đã sắp xếp theo Thứ → Slot → Giờ.  
5. **Làm mới** để cập nhật ngay sau khi bạn đăng nhập FAP.

---

## Cài đặt (Settings)
- **Khung giờ hoạt động**: mặc định `07:00 → 17:40`.
- **Độ trễ thông báo**: mặc định ngẫu nhiên `10–30` phút.
- **Tần suất kiểm tra** (`pollEvery`): mặc định `15` phút.

> Nhấn **Lưu cài đặt** để background reschedule theo cấu hình mới.

---

## Cách hoạt động

- **GPA**  
  - Lấy bảng Transcript, parse các trường `code/name/credit/grade/status`.  
  - Lưu **cache 24h** trong `chrome.storage.local`.

- **Điểm danh & Thông báo**  
  - Background định kỳ tải `ScheduleOfWeek.aspx`.  
  - So sánh với snapshot trước → phát hiện môn **vừa được attended**.  
  - Lên lịch gửi **notification** với câu chữ chuẩn, có **delay ngẫu nhiên**.  

- **Lịch cả tuần**  
  - Heuristic chọn đúng bảng (có MON–SUN + `dd/mm` + nhiều hàng “Slot x”).  
  - Chỉ ghi nhận dòng **có mã môn** (`[A-Z]{2,4}\d{3}`) → tránh “môn = Slot 1/2/…”.

- **Đăng nhập**  
  - Nếu phát hiện redirect `Default.aspx` → mở **`https://fap.fpt.edu.vn/`** cho bạn đăng nhập.  
  - Background giới hạn nhắc đăng nhập **≤ 1 lần/giờ**.

---

## Quyền truy cập & Bảo mật
- **Host permissions**: `https://fap.fpt.edu.vn/*` để đọc dữ liệu GPA/lịch/điểm danh.
- Dữ liệu chỉ lưu **cục bộ** qua `chrome.storage.local`.
- Không thu thập hay gửi dữ liệu ra bên ngoài; không dùng khóa API.

---

## Khắc phục sự cố
- **Không thấy dữ liệu**  
  - Hãy chắc bạn đã **đăng nhập FAP** (extension sẽ mở trang FAP nếu phát hiện chưa đăng nhập).  
  - Nhấn **Làm mới** để xoá cache và tải lại.
- **Không có thông báo**  
  - Kiểm tra **khung giờ hoạt động** và quyền **Notifications** của trình duyệt.  
- **Lịch có dòng rác (Slot 1/2/…)**  
  - Đã xử lý bằng parser mới. Nếu vẫn gặp, vui lòng tạo Issue kèm **ảnh bảng tuần/HTML snippet**.

---

## Cấu trúc thư mục
.
├─ manifest.json
├─ background.js # Poll lịch/điểm danh; thông báo; xử lý login → fap.fpt.edu.vn
├─ contentScript.js # (để dành overlay nếu cần)
├─ popup.html / popup.css / popup.js
│ ├─ GPA tab # cache 24h, tính GPA 10/4, search
│ ├─ Attendance tab # tỷ lệ hiện diện, lọc theo ngày
│ └─ Schedule tab # lịch cả tuần; sắp xếp Thứ→Slot→Giờ
├─ viewer.html/.css/.js # (tuỳ chọn; hiện không còn nút mở)
└─ icon128.png


---

## Đóng góp
- **Bug report**: mô tả chi tiết + ảnh/snip HTML bảng FAP + log console (nếu có).  
- **Tính năng**: mô tả use-case, mock UI nếu thuận tiện.  
- **Code style**: JavaScript thuần, MV3, async/await, xử lý lỗi rõ ràng.

---

## Lộ trình
- [ ] Bộ lọc **tuần** trong popup (đọc YEAR/WEEK của FAP).  
- [ ] **Copy/Export** GPA (CSV/Markdown).  
- [ ] Tô màu trạng thái lịch (attended/absent).  
- [ ] Export **CSV** lịch/điểm danh.

---

## Giấy phép
Phát hành theo giấy phép **MIT**. Xem file `LICENSE` .
