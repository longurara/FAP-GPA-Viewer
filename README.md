
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

---

````md
<p align="center">
  <img src="icon128.png" alt="FAP GPA Viewer Logo" width="100" height="100">
</p>

<h1 align="center">🎓 FAP GPA Viewer – Dashboard</h1>

<p align="center">
  <b>A Chrome Extension that helps FPT University students track GPA, attendance, and schedules with smart notifications.</b><br>
  <i>Privacy-first • Non-commercial • Made by FPT Students</i>
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
  🌐 <b>Language:</b> 
  <a href="README.md">🇻🇳 Vietnamese</a> | 
  <a href="#-english">🇬🇧 English</a>
</p>

---

## 🇬🇧 English

### 🧭 Overview

**FAP GPA Viewer – Dashboard** is an **unofficial Chrome Extension (Manifest V3)** developed by FPT University students.  
It helps students view GPA, attendance, weekly schedule, and receive auto-notifications — all in one simple and elegant interface.

---

### ✨ Key Features

- **📊 GPA Tracking:**  
  Calculate both 10-point and 4-point GPA, total credits, and subject search.  
- **✅ Attendance Monitor:**  
  Displays attendance history, absences, and late records with live updates.  
- **📅 Weekly Schedule:**  
  View your entire class timetable with Slot, Time, and Room info.  
- **🔔 Smart Notifications:**  
  Automatically notifies you when attendance is updated (with random delay 10–30 mins).  
- **📄 Export PDF:**  
  Generate PDF reports for GPA, schedule, and attendance.  
- **🔄 Auto Update Check:**  
  Detects the latest release from GitHub and notifies you.

---

### 🚀 Installation

#### Option 1 – Manual Download
1. Visit [GitHub Repository](https://github.com/longurara/FAP-GPA-Viewer)
2. Open **Releases → Download ZIP**
3. Extract the ZIP to any folder

#### Option 2 – Clone via Git
```bash
git clone https://github.com/longurara/FAP-GPA-Viewer.git
cd FAP-GPA-Viewer
````

#### Option 3 – Load into Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the folder containing `manifest.json`
5. Pin the extension via 🧩 → 📌 **FAP GPA Viewer**

---

### 📖 Usage Guide

#### First-time setup

1. Log in to [fap.fpt.edu.vn](https://fap.fpt.edu.vn/)
2. Open the extension and click **“Refresh Data”**
3. Wait a few seconds for GPA, attendance, and schedule to load

#### Tabs Overview

| Tab              | Description                           | Actions                               |
| ---------------- | ------------------------------------- | ------------------------------------- |
| 📊 **GPA**       | Displays GPA, total credits, subjects | Refresh / Copy / Open Transcript      |
| ✅ **Attendance** | Attendance rate and history           | Refresh / Open Attendance             |
| 📅 **Schedule**  | Weekly timetable view                 | Refresh / Open Schedule               |
| 🔖 **Bookmarks** | Quick links (LMS / FAP / IT Portal)   | —                                     |
| ⚙️ **Settings**  | Control hours, delay, refresh rate    | Save / Test Notification / Export PDF |

---

### 🧠 Technical Details

* **Permissions:**
  `storage`, `tabs`, `notifications`, `alarms`, `host_permissions (https://fap.fpt.edu.vn/*)`
* **Cache:**

  * GPA: 24 hours
  * Attendance: 10 minutes
  * Update check: 6 hours
* **Service Worker:**
  Background checks for attendance, version updates, and notifications.

---

### 🐞 Troubleshooting

| Issue               | Cause              | Solution                                            |
| ------------------- | ------------------ | --------------------------------------------------- |
| ❌ No data loaded    | Not logged in      | Log in again → click Refresh                        |
| 🔕 No notifications | Disabled in Chrome | Enable at `chrome://settings/content/notifications` |
| ⚙️ Extension errors | Old cache          | Reload or reinstall                                 |
| 📉 Wrong GPA        | Outdated data      | Click “Refresh” or clear cache                      |

---

### 🔄 Updates

* **Automatic:** Checks GitHub for new releases every 6 hours
* **Manual:** Click “Check Update” in the popup → open GitHub → reinstall latest version

---

### 🤝 Contributing

Contributions from the FPT student community are welcome 🎉

* Report bugs via [GitHub Issues](https://github.com/longurara/FAP-GPA-Viewer/issues)
* Suggest features (label: enhancement)
* Create Pull Requests:

```bash
git checkout -b feature/your-feature
git commit -m "Add new feature"
git push origin feature/your-feature
```

---

### 📜 License

Released under the [MIT Non-Commercial License](LICENSE.md).
See also:

* [Privacy Policy](PRIVACY.md)
* [Terms of Use](TERMS.md)

---

### 👤 Author

**Lê Hoàng Long (longurara)**

* GitHub: [@longurara](https://github.com/longurara)
* Repository: [FAP-GPA-Viewer](https://github.com/longurara/FAP-GPA-Viewer)

---

### ⚠️ Disclaimer

This is an **unofficial, community-built extension** created independently to assist FPT University students.
It is **not affiliated with, endorsed by, or maintained by FPT University or fap.fpt.edu.vn**.
The extension **does not collect personal data**, **does not store passwords**, and **does not send data externally**.
Use at your own risk.

---

### 🛡️ Privacy Summary

* No credentials or private data are collected
* All processing happens **locally in your browser**
* Temporary data is stored only in localStorage
* Uninstalling the extension removes all local data

---

### ❤️ Made by FPT Students – for FPT Students

If you find this project useful, please ⭐ the repository on GitHub!

---
