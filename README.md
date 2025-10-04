
<p align="center">
  <img src="icon128.png" alt="FAP GPA Viewer Logo" width="100" height="100">
</p>

<h1 align="center">🎓 FAP GPA Viewer – Dashboard</h1>

<p align="center">
  <b>Tiện ích Chrome giúp sinh viên FPT University theo dõi GPA, điểm danh, lịch học và nhận thông báo tự động.</b><br>
  <i>Không thu thập dữ liệu • Không thương mại • Dành cho sinh viên FPT</i>
</p>

<p align="center">
  <!-- License -->
  <a href="LICENSE.md">
    <img src="https://img.shields.io/badge/License-Non--Commercial%20MIT-blue.svg" alt="License: Non-Commercial MIT">
  </a>
  <!-- Privacy -->
  <a href="PRIVACY.md">
    <img src="https://img.shields.io/badge/Privacy-Local%20Only-green.svg" alt="Privacy: Local Only">
  </a>
  <!-- Terms -->
  <a href="TERMS.md">
    <img src="https://img.shields.io/badge/Terms-Clear-orange.svg" alt="Terms of Use">
  </a>
  <!-- Status -->
  <img src="https://img.shields.io/badge/Status-Unofficial-lightgrey.svg" alt="Unofficial">
  <!-- Stars -->
  <a href="https://github.com/longurara/FAP-GPA-Viewer/stargazers">
    <img src="https://img.shields.io/github/stars/longurara/FAP-GPA-Viewer?style=social" alt="GitHub Stars">
  </a>
</p>

---

<p align="center">
  🌐 <b>Ngôn ngữ:</b> 
  <a href="#-tiếng-việt">🇻🇳 Tiếng Việt</a> | 
  <a href="#-english">🇬🇧 English</a>
</p>

---

## 🇻🇳 Tiếng Việt

### 🧭 Giới thiệu

**FAP GPA Viewer – Dashboard** là tiện ích mở rộng Chrome (Manifest V3) được phát triển bởi sinh viên FPT University.  
Giúp bạn **xem GPA, điểm danh, lịch học, nhận thông báo tự động** và **xuất báo cáo PDF**, tất cả trong một giao diện gọn gàng, hiện đại.

---

### ✨ Tính năng chính

- **📊 GPA (Điểm trung bình):**  
  Tính GPA thang 10 và 4, tổng tín chỉ, hỗ trợ tìm kiếm môn học.  
- **✅ Điểm danh:**  
  Hiển thị tỷ lệ chuyên cần, buổi vắng, muộn, cập nhật tự động.  
- **📅 Lịch học:**  
  Lịch học cả tuần với Slot, thời gian, phòng học.  
- **🔔 Thông báo tự động:**  
  Gửi thông báo khi có cập nhật điểm danh mới (trễ ngẫu nhiên 10–30 phút).  
- **📄 Xuất PDF:**  
  Xuất toàn bộ dữ liệu GPA, điểm danh, lịch học ra file PDF.  
- **🔄 Kiểm tra cập nhật:**  
  Tự động phát hiện phiên bản mới trên GitHub.

---

### 🚀 Cài đặt

#### Cách 1 – Tải trực tiếp
1. Vào [GitHub Repository](https://github.com/longurara/FAP-GPA-Viewer)
2. Chọn **Releases → Download ZIP**
3. Giải nén file ZIP vào thư mục bất kỳ

#### Cách 2 – Clone qua Git
```bash
git clone https://github.com/longurara/FAP-GPA-Viewer.git
cd FAP-GPA-Viewer
```

#### Cách 3 – Cài vào Chrome

1. Mở Chrome → `chrome://extensions/`
2. Bật **Developer Mode**
3. Nhấn **Load unpacked**
4. Chọn thư mục có `manifest.json`
5. Ghim extension qua biểu tượng 🧩 → 📌 **FAP GPA Viewer**

---

### 📖 Hướng dẫn sử dụng

#### Bước đầu tiên

1. Đăng nhập [fap.fpt.edu.vn](https://fap.fpt.edu.vn/)
2. Mở extension → bấm **Làm mới dữ liệu**
3. Chờ vài giây để tải GPA, điểm danh và lịch học

#### Các tab chính

| Tab             | Mô tả                                            | Chức năng                           |
| --------------- | ------------------------------------------------ | ----------------------------------- |
| 📊 **GPA**      | Xem điểm, GPA, tổng tín chỉ                      | Làm mới / Copy / Mở Transcript      |
| ✅ **Điểm danh** | Tỷ lệ chuyên cần, vắng, muộn                     | Làm mới / Mở Attendance             |
| 📅 **Lịch học** | Lịch tuần, Slot, phòng                           | Làm mới / Mở Schedule               |
| 🔖 **Bookmark** | Truy cập nhanh LMS / FAP / IT HCM                | —                                   |
| ⚙️ **Cài đặt**  | Giờ hoạt động, trễ ngẫu nhiên, tần suất kiểm tra | Lưu / Kiểm tra thông báo / Xuất PDF |

---

### 🧠 Chi tiết kỹ thuật

* **Quyền:**
  `storage`, `tabs`, `notifications`, `alarms`, `host_permissions (https://fap.fpt.edu.vn/*)`
* **Cache:**
  GPA – 24h, Điểm danh – 10 phút, Cập nhật – 6h
* **Service Worker:**
  Kiểm tra điểm danh, gửi thông báo, kiểm tra bản cập nhật từ GitHub

---

### 🐞 Khắc phục sự cố

| Vấn đề                   | Nguyên nhân         | Cách khắc phục                               |
| ------------------------ | ------------------- | -------------------------------------------- |
| ❌ Không hiển thị dữ liệu | Chưa đăng nhập FAP  | Đăng nhập lại → Làm mới                      |
| 🔕 Không nhận thông báo  | Bị tắt Notification | Mở `chrome://settings/content/notifications` |
| ⚙️ Lỗi sau cập nhật      | Cache cũ            | `Reload` hoặc gỡ và cài lại                  |
| 📉 Sai GPA               | Dữ liệu lỗi         | Click “Làm mới” hoặc xóa cache               |

---

### 🔄 Cập nhật

* **Tự động:** Kiểm tra bản mới mỗi 6 giờ
* **Thủ công:** Bấm “Check Update” → Mở GitHub → Cài lại bản mới nhất

---

### 🤝 Đóng góp

Chào mừng đóng góp từ sinh viên FPT 🎉

* Báo lỗi: [GitHub Issues](https://github.com/longurara/FAP-GPA-Viewer/issues)
* Đề xuất tính năng: gắn nhãn “enhancement”
* Tạo Pull Request:

```bash
git checkout -b feature/ten-tinh-nang
git commit -m "Thêm tính năng mới"
git push origin feature/ten-tinh-nang
```

---

### 📜 Giấy phép

Phát hành theo [Giấy phép MIT Phi Thương mại (LICENSE.md)](LICENSE.md)
Tham khảo thêm:

* [Chính sách bảo mật (PRIVACY.md)](PRIVACY.md)
* [Điều khoản sử dụng (TERMS.md)](TERMS.md)

---

### 👤 Tác giả

**Lê Hoàng Long (longurara)**

* GitHub: [@longurara](https://github.com/longurara)
* Repository: [FAP-GPA-Viewer](https://github.com/longurara/FAP-GPA-Viewer)

---

### ⚠️ Miễn trừ trách nhiệm

Dự án này là **công cụ không chính thức**, phát triển **độc lập** để hỗ trợ sinh viên FPT University.
Không thuộc, không được bảo trợ, và không đại diện cho **FPT University** hoặc trang **[fap.fpt.edu.vn](https://fap.fpt.edu.vn)**.
Phần mềm **không thu thập dữ liệu cá nhân**, **không lưu mật khẩu**, **không gửi dữ liệu ra ngoài**.
Người dùng **tự chịu trách nhiệm** khi sử dụng phần mềm.

---

### 🛡️ Chính sách bảo mật (Tóm tắt)

* Không thu thập hoặc gửi thông tin đăng nhập ra ngoài
* Xử lý **cục bộ trong trình duyệt**
* Lưu tạm qua **localStorage**
* Gỡ extension = xóa toàn bộ dữ liệu

---

### ❤️ Dành cho sinh viên FPT – Bởi sinh viên FPT

Nếu bạn thấy tiện ích này hữu ích, hãy ⭐ dự án trên GitHub nhé!

---

## 🇬🇧 English

### 🧭 Overview

**FAP GPA Viewer – Dashboard** is an unofficial Chrome Extension (Manifest V3) made by FPT University students.
It helps you view GPA, attendance, schedules, notifications, and export reports — all locally in your browser.

### ✨ Key Features

* View GPA (10 & 4 scale)
* Track attendance updates
* Display weekly class schedule
* Auto notifications when attendance changes
* Export PDF reports
* Auto update checks via GitHub

### 🛡️ Privacy

No login credentials are collected.
All processing happens locally in your browser.
No external servers are used.

### ⚠️ Disclaimer

This project is **not affiliated with or endorsed by FPT University or fap.fpt.edu.vn**.
It is a **community-built educational tool** for personal use only.

**Made with ❤️ by FPT Students – for FPT Students**

