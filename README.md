<p align="center">
  <img src="icon128.png" alt="FAP Dashboard Logo" width="100" height="100">
</p>

<h1 align="center">🎓 FAP Dashboard – Advanced Edition</h1>

<p align="center">
  <b>Chrome Extension mạnh mẽ giúp sinh viên FPT University quản lý học tập thông minh, trực quan và hiệu quả!</b><br>
  <i>Không thu thập dữ liệu • Không thương mại • Dành cho sinh viên FPT</i>
</p>

<p align="center">
  <!-- Version -->
  <img src="https://img.shields.io/badge/version-4.5.0-blue.svg" alt="Version: 4.5.0">
  <!-- License -->
  <a href="LICENSE.md">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT">
  </a>
  <!-- Chrome -->
  <img src="https://img.shields.io/badge/Chrome-Extension-orange.svg" alt="Chrome Extension">
  <!-- Privacy -->
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-green.svg" alt="Privacy: Local Only">
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

**FAP Dashboard – Advanced Edition** là tiện ích mở rộng Chrome (Manifest V3) được phát triển bởi sinh viên FPT University.  
Giúp bạn **xem GPA, điểm danh, lịch học, Pomodoro timer, thống kê, và nhận thông báo thông minh** — tất cả trong một giao diện hiện đại, đẹp mắt.

---

### ✨ Tính năng nổi bật v4.1.0

#### 🌓 **Dark/Light Mode**

- Toggle chuyển đổi giao diện sáng/tối mượt mà
- Tự động lưu preference
- Tối ưu cho mắt khi sử dụng lâu dài

#### 📅 **Today's Schedule**

- Hiển thị lịch học hôm nay ngay trang chủ
- **Countdown real-time** đến từng tiết học
- Cập nhật tự động mỗi phút

#### 🧮 **GPA Calculator**

- Tính toán điểm cần đạt để đạt GPA mục tiêu
- Formula: `(target_gpa * total_credits - current_points) / new_credits`
- Hỗ trợ plan môn học tiếp theo

#### 📊 **Statistics & Trend Chart**

- **Biểu đồ GPA theo kỳ** (powered by Chart.js)
- Thống kê chi tiết: điểm trung bình, môn điểm cao nhất/thấp nhất, tỷ lệ Pass/Fail
- Responsive với Dark/Light mode

#### 🔥 **Attendance Streak Tracker**

- Theo dõi chuỗi ngày đi học liên tiếp
- Gamification: Badge động với animation
- Motivate sinh viên đi học đầy đủ

#### ⏰ **Smart Notifications**

- **Nhắc nhở trước giờ học 15 phút**
- Tự động schedule cho tất cả lớp trong ngày
- Hiển thị môn học, giờ, và phòng

#### ⏳ **Exam Countdown**

- Badge đếm ngược số ngày đến kỳ thi
- Highlight màu đỏ cho thi gấp (<3 ngày)
- Highlight màu cam cho thi sắp tới (<7 ngày)
- Badge "HÔM NAY!" cho ngày thi

#### 🔍 **Advanced Search System**

- **Global search** với scoring algorithm thông minh
- Tìm kiếm across GPA, attendance, exams, timer data
- Loading states với spinner animation
- Auto-refresh search data mỗi 30 giây

#### ⏰ **Background Pomodoro Timer**

- **Chạy ngầm** ngay cả khi đóng extension
- Chrome Alarms API integration
- Seamless sync giữa popup và background
- Auto-resume timer sau khi restart extension

#### 🧠 **Smart Study Break Reminders**

- Tính **thời gian học thực tế** thay vì thời gian trôi qua
- Study history tracking cho tính toán chính xác
- Prevent notification spam

#### 🏆 **Achievement System**

- Rate limiting (chỉ check achievements 1 lần/giờ)
- Notifications chỉ hiển thị cho achievements mới unlock
- Close button cho achievement notifications
- Auto-clear existing notifications

#### 🎨 **Smart Notifications Panel Redesign**

- Complete UI redesign với modern glassmorphism
- Grouped settings (Timing, Notification Types, Sound, Test)
- Gradient backgrounds và hover effects
- Toggle switches với smooth animations

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
5. Ghim extension qua biểu tượng 🧩 → 📌 **FAP Dashboard**

---

### 📖 Hướng dẫn sử dụng

#### Bước đầu tiên

1. Đăng nhập [fap.fpt.edu.vn](https://fap.fpt.edu.vn/)
2. Mở extension → bấm **Làm mới tất cả**
3. Chờ vài giây để tải GPA, điểm danh và lịch học

#### Các tab chính

| Tab              | Mô tả                                       | Chức năng                      |
| ---------------- | ------------------------------------------- | ------------------------------ |
| 📅 **Hôm nay**   | Lịch học hôm nay với countdown, quick stats | Làm mới / Xem chi tiết         |
| 📊 **GPA**       | Xem điểm, GPA, tổng tín chỉ                 | Làm mới / Copy / Mở Transcript |
| ✅ **Điểm danh** | Tỷ lệ chuyên cần, vắng, muộn                | Làm mới / Mở Attendance        |
| 📅 **Lịch học**  | Lịch tuần, Slot, phòng                      | Làm mới / Mở Schedule          |
| 📝 **Lịch thi**  | Lịch thi với countdown badges               | Làm mới / Mở Exam Schedule     |
| 🧮 **Tính GPA**  | GPA Calculator với target planning          | Tính điểm cần đạt              |
| 📊 **Thống kê**  | Statistics với trend chart                  | Xem biểu đồ GPA                |
| ⏰ **Timer**     | Pomodoro timer với background support       | Start/Pause/Reset timer        |
| 🔍 **Tìm kiếm**  | Advanced search system                      | Tìm kiếm toàn bộ dữ liệu       |
| 🔖 **Bookmark**  | Truy cập nhanh LMS / FAP / IT HCM           | —                              |
| ⚙️ **Cài đặt**   | Giờ hoạt động, thông báo, theme             | Lưu / Test / Xuất PDF          |

---

### 🧠 Chi tiết kỹ thuật

- **Quyền:**
  `storage`, `tabs`, `notifications`, `alarms`, `host_permissions (https://fap.fpt.edu.vn/*)`
- **Cache:**
  GPA – 24h, Điểm danh – 10 phút, Cập nhật – 6h
- **Service Worker:**
  Background Pomodoro timer, kiểm tra điểm danh, gửi thông báo, kiểm tra bản cập nhật
- **Background Features:**
  Chrome Alarms API, Study session tracking, Auto-resume functionality

---

### 🐞 Khắc phục sự cố

| Vấn đề                    | Nguyên nhân         | Cách khắc phục                               |
| ------------------------- | ------------------- | -------------------------------------------- |
| ❌ Không hiển thị dữ liệu | Chưa đăng nhập FAP  | Đăng nhập lại → Làm mới                      |
| 🔕 Không nhận thông báo   | Bị tắt Notification | Mở `chrome://settings/content/notifications` |
| ⚙️ Lỗi sau cập nhật       | Cache cũ            | `Reload` hoặc gỡ và cài lại                  |
| 📉 Sai GPA                | Dữ liệu lỗi         | Click "Làm mới" hoặc xóa cache               |
| ⏰ Timer không chạy ngầm  | Background bị tắt   | Restart extension hoặc cài lại               |
| 🔍 Search không hiệu quả  | Cache search cũ     | Chờ 30 giây để auto-refresh hoặc reload      |

---

### 🔄 Cập nhật

- **Tự động:** Kiểm tra bản mới mỗi 6 giờ
- **Thủ công:** Bấm "Check Update" → Mở GitHub → Cài lại bản mới nhất

---

### 🤝 Đóng góp

Chào mừng đóng góp từ sinh viên FPT 🎉

- Báo lỗi: [GitHub Issues](https://github.com/longurara/FAP-GPA-Viewer/issues)
- Đề xuất tính năng: gắn nhãn "enhancement"
- Tạo Pull Request:

```bash
git checkout -b feature/ten-tinh-nang
git commit -m "Thêm tính năng mới"
git push origin feature/ten-tinh-nang
```

---

### 📜 Giấy phép

Phát hành theo [Giấy phép MIT (LICENSE.md)](LICENSE.md)

---

### 👤 Tác giả

**Lê Hoàng Long (longurara)**

- GitHub: [@longurara](https://github.com/longurara)
- Repository: [FAP-GPA-Viewer](https://github.com/longurara/FAP-GPA-Viewer)

---

### ⚠️ Miễn trừ trách nhiệm

Dự án này là **công cụ không chính thức**, phát triển **độc lập** để hỗ trợ sinh viên FPT University.
Không thuộc, không được bảo trợ, và không đại diện cho **FPT University** hoặc trang **[fap.fpt.edu.vn](https://fap.fpt.edu.vn)**.
Phần mềm **không thu thập dữ liệu cá nhân**, **không lưu mật khẩu**, **không gửi dữ liệu ra ngoài**.
Người dùng **tự chịu trách nhiệm** khi sử dụng phần mềm.

---

### 🛡️ Chính sách bảo mật (Tóm tắt)

- Không thu thập hoặc gửi thông tin đăng nhập ra ngoài
- Xử lý **cục bộ trong trình duyệt**
- Lưu tạm qua **Chrome Storage API**
- Gỡ extension = xóa toàn bộ dữ liệu

---

### ❤️ Dành cho sinh viên FPT – Bởi sinh viên FPT

Nếu bạn thấy tiện ích này hữu ích, hãy ⭐ dự án trên GitHub nhé!

---

## 🇬🇧 English

---

<p align="center">
  <img src="icon128.png" alt="FAP Dashboard Logo" width="100" height="100">
</p>

<h1 align="center">🎓 FAP Dashboard – Advanced Edition</h1>

<p align="center">
  <b>A powerful Chrome Extension that helps FPT University students manage their studies intelligently, visually, and efficiently!</b><br>
  <i>Privacy-first • Non-commercial • Made by FPT Students</i>
</p>

<p align="center">
  <!-- Version -->
  <img src="https://img.shields.io/badge/version-4.1.0-blue.svg" alt="Version: 4.1.0">
  <!-- License -->
  <a href="LICENSE.md">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT">
  </a>
  <!-- Chrome -->
  <img src="https://img.shields.io/badge/Chrome-Extension-orange.svg" alt="Chrome Extension">
  <!-- Privacy -->
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-green.svg" alt="Privacy: Local Only">
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

## 🇬🇧 English

### 🧭 Overview

**FAP Dashboard – Advanced Edition** is a Chrome Extension (Manifest V3) developed by FPT University students.  
It helps students **view GPA, attendance, schedules, Pomodoro timer, statistics, and receive smart notifications** — all in one modern, beautiful interface.

---

### ✨ Key Features v4.1.0

#### 🌓 **Dark/Light Mode**

- Smooth toggle between light and dark themes
- Auto-save preferences
- Optimized for long-term eye comfort

#### 📅 **Today's Schedule**

- Display today's classes on the homepage
- **Real-time countdown** to each class
- Auto-update every minute

#### 🧮 **GPA Calculator**

- Calculate required grades to achieve target GPA
- Formula: `(target_gpa * total_credits - current_points) / new_credits`
- Support for planning next semester courses

#### 📊 **Statistics & Trend Chart**

- **GPA trend chart by semester** (powered by Chart.js)
- Detailed statistics: average grades, highest/lowest courses, Pass/Fail ratio
- Responsive with Dark/Light mode

#### 🔥 **Attendance Streak Tracker**

- Track consecutive days of attendance
- Gamification: Dynamic badges with animation
- Motivate students to maintain perfect attendance

#### ⏰ **Smart Notifications**

- **15-minute pre-class reminders**
- Auto-schedule for all classes in the day
- Display subject, time, and room

#### ⏳ **Exam Countdown**

- Countdown badges to exam days
- Red highlight for urgent exams (<3 days)
- Orange highlight for upcoming exams (<7 days)
- "TODAY!" badge for exam day

#### 🔍 **Advanced Search System**

- **Global search** with intelligent scoring algorithm
- Search across GPA, attendance, exams, timer data
- Loading states with spinner animation
- Auto-refresh search data every 30 seconds

#### ⏰ **Background Pomodoro Timer**

- **Runs in background** even when extension is closed
- Chrome Alarms API integration
- Seamless sync between popup and background
- Auto-resume timer after extension restart

#### 🧠 **Smart Study Break Reminders**

- Calculate **actual study time** instead of elapsed time
- Study history tracking for accurate calculations
- Prevent notification spam

#### 🏆 **Achievement System**

- Rate limiting (check achievements only once per hour)
- Notifications only for newly unlocked achievements
- Close button for achievement notifications
- Auto-clear existing notifications

#### 🎨 **Smart Notifications Panel Redesign**

- Complete UI redesign with modern glassmorphism
- Grouped settings (Timing, Notification Types, Sound, Test)
- Gradient backgrounds and hover effects
- Toggle switches with smooth animations

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
```

#### Option 3 – Load into Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the folder containing `manifest.json`
5. Pin the extension via 🧩 → 📌 **FAP Dashboard**

---

### 📖 Usage Guide

#### First-time setup

1. Log in to [fap.fpt.edu.vn](https://fap.fpt.edu.vn/)
2. Open the extension and click **"Refresh All"**
3. Wait a few seconds for GPA, attendance, and schedule to load

#### Tabs Overview

| Tab               | Description                                  | Actions                          |
| ----------------- | -------------------------------------------- | -------------------------------- |
| 📅 **Today**      | Today's schedule with countdown, quick stats | Refresh / View details           |
| 📊 **GPA**        | Displays GPA, total credits, subjects        | Refresh / Copy / Open Transcript |
| ✅ **Attendance** | Attendance rate and history                  | Refresh / Open Attendance        |
| 📅 **Schedule**   | Weekly timetable view                        | Refresh / Open Schedule          |
| 📝 **Exams**      | Exam schedule with countdown badges          | Refresh / Open Exam Schedule     |
| 🧮 **Calculator** | GPA Calculator with target planning          | Calculate required grades        |
| 📊 **Statistics** | Statistics with trend chart                  | View GPA chart                   |
| ⏰ **Timer**      | Pomodoro timer with background support       | Start/Pause/Reset timer          |
| 🔍 **Search**     | Advanced search system                       | Search all data                  |
| 🔖 **Bookmarks**  | Quick links (LMS / FAP / IT Portal)          | —                                |
| ⚙️ **Settings**   | Control hours, notifications, theme          | Save / Test / Export PDF         |

---

### 🧠 Technical Details

- **Permissions:**
  `storage`, `tabs`, `notifications`, `alarms`, `host_permissions (https://fap.fpt.edu.vn/*)`
- **Cache:**
  GPA – 24 hours, Attendance – 10 minutes, Update check – 6 hours
- **Service Worker:**
  Background Pomodoro timer, attendance checks, notifications, version updates
- **Background Features:**
  Chrome Alarms API, Study session tracking, Auto-resume functionality

---

### 🐞 Troubleshooting

| Issue                              | Cause               | Solution                                            |
| ---------------------------------- | ------------------- | --------------------------------------------------- |
| ❌ No data loaded                  | Not logged in       | Log in again → click Refresh                        |
| 🔕 No notifications                | Disabled in Chrome  | Enable at `chrome://settings/content/notifications` |
| ⚙️ Extension errors                | Old cache           | Reload or reinstall                                 |
| 📉 Wrong GPA                       | Outdated data       | Click "Refresh" or clear cache                      |
| ⏰ Timer not running in background | Background disabled | Restart extension or reinstall                      |
| 🔍 Search not effective            | Old search cache    | Wait 30 seconds for auto-refresh or reload          |

---

### 🔄 Updates

- **Automatic:** Checks GitHub for new releases every 6 hours
- **Manual:** Click "Check Update" in the popup → open GitHub → reinstall latest version

---

### 🤝 Contributing

Contributions from the FPT student community are welcome 🎉

- Report bugs via [GitHub Issues](https://github.com/longurara/FAP-GPA-Viewer/issues)
- Suggest features (label: enhancement)
- Create Pull Requests:

```bash
git checkout -b feature/your-feature
git commit -m "Add new feature"
git push origin feature/your-feature
```

---

### 📜 License

Released under the [MIT License](LICENSE.md)

---

### 👤 Author

**Lê Hoàng Long (longurara)**

- GitHub: [@longurara](https://github.com/longurara)
- Repository: [FAP-GPA-Viewer](https://github.com/longurara/FAP-GPA-Viewer)

---

### ⚠️ Disclaimer

This is an **unofficial, community-built extension** created independently to assist FPT University students.
It is **not affiliated with, endorsed by, or maintained by FPT University or fap.fpt.edu.vn**.
The extension **does not collect personal data**, **does not store passwords**, and **does not send data externally**.
Use at your own risk.

---

### 🛡️ Privacy Summary

- No credentials or private data are collected
- All processing happens **locally in your browser**
- Temporary data is stored only in Chrome Storage API
- Uninstalling the extension removes all local data

---

### ❤️ Made by FPT Students – for FPT Students

If you find this project useful, please ⭐ the repository on GitHub!

---
