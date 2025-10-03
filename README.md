# FAP GPA Viewer – Dashboard (Chrome Extension)

A modern, lightweight Chrome Extension that makes FPT University’s FAP easier to use.  
It adds **beautiful GPA summaries**, **weekly schedule parsing**, **attendance reminders**, quick access to LMS / FAP / IT portals, and PDF export — all in one popup.

> Manifest V3 • Zero server • Works entirely in your browser

![Logo](icon128.png "Logo")

---

## ✨ Features

- **GPA (10 & 4)**: Parse transcript and calculate GPA with total credits. Cache results and refresh on demand.
- **Weekly Schedule (ScheduleOfWeek)**: Fetch & normalize into a clean table (Day → Slot → Time → Course → Room → Note).
- **Attendance Reminders**: Background checks with randomized delay (10–30 min) after teachers update attendance.
- **Bookmarks**: One-click open to:
  - `https://lms-hcm.***.e**.vn/` (LMS HCM)
  - `https://fap.***.e**.vn/` (FAP)
  - `https://it****.***.e**.vn/` (IT HCM)
- **Export PDF**: Generate a professional PDF report (Transcript, Attendance, Schedule, Settings).
- **UI/UX**: Dark, card-based popup with tab navigation and a settings screen.
- **Privacy First**: Everything is local, adjustable, and transparent.

> **Note:** The extension never stores or sends your credentials anywhere. It only reads the already logged-in pages that you open.

---

## 📦 Installation (Developer Mode)

1. Download the latest ZIP (or this repository) and extract it.
2. Open `chrome://extensions` → enable **Developer mode** (top right).
3. Click **Load unpacked** and select the extracted folder (where `manifest.json` lives).
4. Pin the extension to your toolbar and click the icon to open the popup.

Works on Chrome 110+ and other Chromium-based browsers that support Manifest V3.

---

## 🧭 Usage

### GPA Tab
- Press **Refresh** to parse transcript data (requires you to be logged in to FAP).
- **Copy GPA** quickly copies both 10-point and 4-point scales.
- If you are not logged in, the extension will prompt you to log in first.

### Schedule Tab
- Press **Refresh** to fetch and render the weekly schedule.
- The extension detects redirects to the login page and prompts you to log in if necessary.

### Attendance Tab
- View your latest attendance records.
- The extension can send notifications 10–30 minutes after teachers update attendance.

### Settings
- Configure active hours (e.g., 07:00–17:40).
- Configure randomized notification delay (10–30 minutes).
- **Test Notification** button to verify notifications.
- **Export PDF** button to save all data (Transcript, Attendance, Schedule, Settings) as a PDF.

---

## 🔐 Permissions & Why

| Permission     | Why it’s needed |
|----------------|-----------------|
| `storage`      | Save cached GPA, schedule, attendance, and user settings locally. |
| `tabs`         | Open FAP/LMS/IT pages when you click bookmark buttons. |
| `alarms`       | Schedule background attendance checks. |
| `notifications`| Show local reminders when attendance updates are detected. |

> No external servers. No analytics. No credential capture.

---

## 🧩 Project Structure

```
.
├── manifest.json
├── popup.html / popup.css / popup.js    # Popup UI (tabs: GPA / Schedule / Attendance / Settings)
├── background.js                        # Service worker: alarms, notifications, update checks
├── report.html / report.css / report.js # PDF export page
└── icon128.png
```

---

## 🛠️ Building / Packaging

This is a plain MV3 extension — no build step required.  
To ship:
- **Zip** the folder contents (keeping `manifest.json` at the root) and upload to the Chrome Web Store.
- Or share the ZIP for developer-mode installation.

---

## 🔄 Check for Updates

- The extension can query the GitHub Releases API:  
  `https://github.com/longurara/FAP-GPA-Viewer/releases/`
- It compares the latest release tag with the current `version` in `manifest.json`.
- If a newer version exists, the popup will display a **“Update”** button linking to the release page.

---

## 🧪 Troubleshooting

- **Popup shows empty tables** → Ensure you are logged in to FAP in a normal tab, then press **Refresh**.
- **Data looks outdated** → Click **Refresh**; cached data is replaced with fresh data.
- **Notifications not appearing** → Check Chrome notification settings: `chrome://settings/content/notifications` and make sure they are allowed.

---

## 🗺️ Roadmap

- Custom bookmarks (add/remove links from the UI).
- Export CSV/Excel.
- GPA breakdown by term.
- Smarter login detection.

---

## 🤝 Contributing

1. Fork the repo & create a feature branch: `git checkout -b feat/my-feature`
2. Commit changes, keeping code clean.
3. Open a PR with a clear description and screenshots.

---

## 📝 License

Licensed under a **Non-Commercial MIT License**.

- ✅ Use, modify, distribute with attribution  
- ❌ No commercial use  

**TL;DR:** Free to use, modify, share — **not for commercial use**.
