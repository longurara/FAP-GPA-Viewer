<p align="center"> 
  <a href="https://chromewebstore.google.com/detail/fpt-academic-portal-dashb/pkfcnophcekokdfobdkbliaainejbdhn" target="_blank">
    <img src="assets/icons/icon128.png" alt="FAP Dashboard" width="120" height="120">
  </a>
</p>

<h1 align="center">FAP Dashboard</h1>

<p align="center">
  <strong>The Ultimate Chrome Extension for FPT University Students</strong><br>
  <sub>GPA Tracking • Smart Scheduling • Exam Countdown • Study Analytics</sub>
</p>

<p align="center">
  <a href="https://github.com/longurara/FAP-GPA-Viewer/releases">
    <img src="https://img.shields.io/badge/version-5.0.0-blue?style=flat-square" alt="Version">
  </a>
  <a href="LICENSE.md">
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  </a>
  <a href="https://chromewebstore.google.com/detail/cngofiaoddikgpdlibjgkjggiihjaoln">
    <img src="https://img.shields.io/badge/chrome-extension-orange?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  </a>
  <img src="https://img.shields.io/badge/privacy-local%20only-success?style=flat-square" alt="Privacy">
  <a href="https://github.com/longurara/FAP-GPA-Viewer/stargazers">
    <img src="https://img.shields.io/github/stars/longurara/FAP-GPA-Viewer?style=social" alt="Stars">
  </a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## 🌟 Overview

**FAP Dashboard** is a modern Chrome Extension (Manifest V3) that transforms how FPT University students interact with the FAP academic portal. Built with performance and privacy in mind, it provides real-time GPA tracking, smart scheduling, exam countdowns, and comprehensive study analytics—all in a beautiful, intuitive interface.

> 🔒 **Privacy First**: All data is processed locally. No external servers. No data collection.

---

## ✨ Features

### 📊 Academic Tracking

| Feature | Description |
|---------|-------------|
| **GPA Dashboard** | Real-time GPA calculation (10-point & 4-point scale) with course exclusion support |
| **Transcript Viewer** | Complete course history with grades, credits, and status |
| **GPA Calculator** | Calculate required grades to achieve target GPA |
| **Course Notes** | Add personal notes to any course |

### 📅 Schedule Management

| Feature | Description |
|---------|-------------|
| **Today's Schedule** | At-a-glance view of today's classes with real-time countdown |
| **Weekly Timetable** | Full week schedule with slot times and room numbers |
| **Exam Schedule** | Upcoming exams with countdown badges (urgent/soon/today) |
| **ICS Export** | Export schedule to Google Calendar, Apple Calendar, Outlook |

### 📈 Analytics & Statistics

| Feature | Description |
|---------|-------------|
| **GPA Trend Chart** | Visual semester-by-semester GPA progression |
| **Attendance Tracker** | Present/Absent/Late statistics with rates |
| **Performance Stats** | Best/worst courses, pass rate, average grade |

### 🎨 User Experience

| Feature | Description |
|---------|-------------|
| **Dark/Light Mode** | System-aware theme with manual toggle |
| **Accent Colors** | 6 preset colors + custom color picker |
| **Background Images** | Gradient presets or custom image upload |
| **Liquid Glass UI** | Modern glassmorphism design with smooth animations |

### 🔔 Smart Notifications

| Feature | Description |
|---------|-------------|
| **Class Reminders** | Configurable pre-class notifications |
| **Exam Alerts** | Countdown notifications for upcoming exams |
| **Background Polling** | Automatic schedule updates even when closed |

---

## 🚀 Installation

### Option 1: Chrome Web Store (Recommended)

<a href="https://chromewebstore.google.com/detail/cngofiaoddikgpdlibjgkjggiihjaoln">
  <img src="https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/iNEddTyWiMfLSwFD6qGq.png" alt="Available in Chrome Web Store" width="200">
</a>

### Option 2: Manual Installation

```bash
# Clone the repository
git clone https://github.com/longurara/FAP-GPA-Viewer.git
cd FAP-GPA-Viewer

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the cloned folder
```

### Option 3: Download ZIP

1. Download from [Releases](https://github.com/longurara/FAP-GPA-Viewer/releases)
2. Extract to a folder
3. Load unpacked in Chrome

---

## 📖 Usage

### Quick Start

1. **Login** to [fap.fpt.edu.vn](https://fap.fpt.edu.vn/)
2. **Click** the FAP Dashboard extension icon
3. **Wait** for automatic data sync (or click "Refresh All")

### Tab Overview

| Tab | Purpose |
|-----|---------|
| 🏠 **Today** | Quick stats, today's classes, GPA overview |
| 📊 **GPA** | Full transcript, course management, notes |
| 🧮 **Calculator** | GPA target planning tool |
| 📈 **Statistics** | Trend charts, performance analytics |
| ✅ **Attendance** | Attendance records and rates |
| 📅 **Schedule** | Weekly timetable view |
| 📝 **Exams** | Exam schedule with countdowns |
| 🔖 **Bookmarks** | Quick links to FAP, LMS, IT Portal |
| ⚙️ **Settings** | Themes, notifications, export options |

---

## 🏗️ Architecture

### v5.0.0 Modular Architecture

```
FAP-GPA-Viewer/
├── manifest.json           # Extension configuration
├── pages/
│   ├── popup.html          # Main popup interface
│   └── report.html         # PDF export page
├── scripts/
│   ├── popup.js            # Main orchestrator (~2,300 lines)
│   ├── background.js       # Service worker for notifications
│   └── modules/            # ES Modules (12 modules)
│       ├── utils.js        # DOM helpers, debounce
│       ├── storage.js      # Chrome storage wrapper
│       ├── api.js          # FAP API integration
│       ├── login.js        # Authentication status
│       ├── transcript.js   # GPA parsing & calculation
│       ├── exams.js        # Exam schedule handling
│       ├── today-schedule.js # Today widget
│       ├── settings.js     # User preferences
│       ├── statistics.js   # Charts & analytics
│       ├── theme.js        # Theme customization
│       ├── tabs.js         # Tab navigation
│       └── gpa-calculator.js # Target GPA tool
├── styles/
│   ├── popup.css           # Main styles
│   └── themes/             # Theme variations
└── assets/
    └── icons/              # Extension icons
```

### Technical Highlights

- **Manifest V3** compliant with Service Workers
- **Modular codebase** with 43% reduction from v4.x
- **Stale-While-Revalidate** caching pattern
- **Chrome Alarms API** for background polling
- **Chart.js** for data visualization

---

## 🔧 Technical Details

### Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save preferences and cached data locally |
| `notifications` | Class reminders and exam alerts |
| `alarms` | Background polling and timer functionality |
| `scripting` | Inject fetch requests into FAP tabs to retrieve data with user's session cookies (bypasses CORS) |

### Cache TTL

| Data | Cache Duration |
|------|---------------|
| GPA/Transcript | 24 hours |
| Attendance | 4 hours |
| Exams | 24 hours |
| Settings | Persistent |

### Browser Support

- ✅ Google Chrome (v88+)
- ✅ Microsoft Edge (Chromium)
- ✅ Brave Browser
- ✅ Opera (Chromium)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| No data displayed | Login to FAP first, then refresh |
| Notifications not working | Enable at `chrome://settings/content/notifications` |
| Wrong GPA values | Click "Refresh" to fetch latest data |
| Extension not loading | Reload extension at `chrome://extensions` |

---

## 🤝 Contributing

Contributions are welcome from the FPT student community!

```bash
# Fork the repository
# Create your feature branch
git checkout -b feature/amazing-feature

# Commit your changes
git commit -m 'Add amazing feature'

# Push to the branch
git push origin feature/amazing-feature

# Open a Pull Request
```

### Guidelines

- Follow existing code style
- Test on multiple Chrome versions
- Update documentation for new features
- Add comments for complex logic

---

## 📜 License

This project is licensed under the [MIT License](LICENSE.md).

---

## 👤 Author

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/longurara">
        <img src="https://github.com/longurara.png" width="100px;" alt="longurara"/><br />
        <sub><b>Lê Hoàng Long</b></sub>
      </a>
    </td>
  </tr>
</table>

---

## ⚠️ Disclaimer

This is an **unofficial, community-built extension** created independently to assist FPT University students. It is:

- ❌ NOT affiliated with FPT University
- ❌ NOT endorsed by fap.fpt.edu.vn
- ❌ NOT collecting any personal data
- ✅ Open source and transparent
- ✅ Privacy-focused with local-only processing

**Use at your own discretion.**

---

## 🛡️ Privacy Policy

- **No data collection**: All processing happens in your browser
- **No external servers**: Data never leaves your device
- **No tracking**: No analytics or telemetry
- **Easy cleanup**: Uninstall removes all data

For details, see [PRIVACY.md](PRIVACY.md).

---

<p align="center">
  <sub>Made with ❤️ by FPT Students, for FPT Students</sub><br>
  <sub>If you find this useful, please ⭐ the repository!</sub>
</p>
