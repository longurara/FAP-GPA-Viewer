# FAP GPA Viewer – Dashboard (Chrome Extension)

A modern, lightweight Chrome Extension that makes FPT University’s FAP easier to use. It adds **beautiful GPA summaries**, **weekly schedule parsing**, **attendance reminders**, and a brand‑new **Bookmark** tab for quick access to LMS / FAP / IT portals — all in one popup.

> Manifest V3 • Zero server • Works entirely in your browser

<p align="center">
  <img src="icon128.png" alt="Logo" width="72" height="72">
</p>

---

## ✨ Features

- **GPA (10 & 4)**: Parse transcript and calculate GPA with total credits. Cache results and refresh on demand.
- **Weekly Schedule (ScheduleOfWeek)**: Fetch & normalize to a clean table (Day → Slot → Time → Course → Room → Note).
- **Attendance Reminders**: Optional background check with randomized delay (10–30 min) after teachers update attendance.
- **Bookmark Tab**: One‑click open to
  - `https://lms-hcm.fpt.edu.vn/` (LMS HCM)
  - `https://fap.fpt.edu.vn/` (FAP)
  - `https://it-hcm.fpt.edu.vn/` (IT HCM)
- **Nice UI**: Dark, card‑based popup with tabs and a settings screen.
- **Respectful Defaults**: Everything is local, adjustable, and transparent.

> **Note:** The extension never stores or sends your credentials anywhere. It only reads the already logged‑in pages that you open.

---

## 📦 Installation (Developer Mode)

1. Download the latest ZIP (or this repository) and extract it.
2. Open `chrome://extensions` → enable **Developer mode** (top right).
3. Click **Load unpacked** and select the extracted folder (where `manifest.json` lives).
4. Pin the extension to your toolbar and click the icon to open the popup.

> Works on Chrome 110+ and Chromium‑based browsers that support Manifest V3 (Edge, Brave… may vary).

---

## 🧭 Usage

### GPA Tab
- Click **Trang Transcript** to open FAP’s transcript page.
- Press **Làm mới** to re‑parse; otherwise data comes from local cache.
- **Copy GPA** quickly copies both 10‑point and 4‑point scales.

### Schedule Tab
- Click **Trang Schedule** to open the official weekly schedule.
- Press **Làm mới** to fetch and re‑render the entire week into a clean table.
- The extension detects redirects to the login page and will prompt you to log in.

### Bookmark Tab
- Three instant buttons: **LMS HCM**, **FAP**, **IT HCM**.
- You can extend this easily by adding more buttons in `popup.html` and handlers in `popup.js`.

### Settings
- Configure polling window (e.g., 07:00–17:40) and randomized notify delay (10–30 min).
- Click **Test thông báo** to verify notifications.

---

## 🔐 Permissions & Why

The extension uses a minimal, transparent set of permissions:

| Permission                 | Why it’s needed |
|---                         |---|
| `storage`                  | Save cached GPA, schedule, and user settings locally. |
| `activeTab`                | Open related FAP/LMS/IT pages in new tabs when you click buttons. |
| `scripting` (MV3)          | Run the content script on transcript pages to read the table you are viewing. |
| `alarms`                   | Schedule attendance reminder checks at the times you configure. |
| `notifications`            | Show local reminders after attendance updates are detected. |

> No external servers. No analytics. No credential capture.

---

## 🧩 Project Structure

```
.
├── manifest.json
├── popup.html / popup.css / popup.js      # Popup UI (tabs: GPA / Schedule / Bookmark / Settings)
├── contentScript.js                       # Runs on Transcript page to read GPA table
├── background.js                          # Service worker: alarms, notifications, update checks
├── viewer.html / viewer.css / viewer.js   # Optional “beautiful viewer” page
└── icon128.png
```

---

## 🛠️ Building / Packaging

This is a plain MV3 extension — no build step is required. To ship:
- **Zip** the folder contents (keeping `manifest.json` at the root) and upload to the Chrome Web Store.
- Or share the ZIP for developer‑mode installation.

A ready‑to‑load ZIP may be provided in releases.

---

## 🔄 Check for Updates (Optional)

If you want in‑app update checks against GitHub Releases:
- Add a small routine in `background.js` to ping `https://api.github.com/repos/<owner>/<repo>/releases/latest`,
- Compare against the `version` in `manifest.json`,
- Show a notification with a button that opens the latest release page.
> This repository ships without automatic network calls by default; opt‑in is recommended.

---

## 🧪 Troubleshooting

- **Popup shows empty tables** → Make sure you are **logged in** to FAP in a normal tab first, then press **Làm mới**. Redirects to `Default.aspx` indicate login required.
- **Data looks outdated** → Click **Làm mới**; cached data is preferred to keep FAP fast.
- **Schedule day mismatch** → Ensure the page is the week you expect on FAP; then refresh again from the Schedule tab.
- **Notifications not appearing** → Check Chrome site permissions: `chrome://settings/content/notifications` and ensure they are allowed for the browser.

---

## 🗺️ Roadmap

- Custom bookmarks (add/remove links from the UI)
- Per‑course filters and export (CSV/Excel)
- GPA breakdown by term
- Smarter login detection & helpers

---

## 🤝 Contributing

1. Fork the repo & create a feature branch: `git checkout -b feat/my-feature`
2. Make changes, keep code clean.
3. Open a PR with a clear description and screenshots.

Bug reports and feature requests are welcome in Issues.

---

## 📝 License

This project is licensed under a **Non-Commercial MIT License**.

You are free to:
- ✅ Use the code
- ✅ Modify it for your own needs
- ✅ Distribute or share it with attribution

But you **may not**:
- ❌ Use it for commercial purposes (no selling, bundling in paid products, or monetization)

---

**TL;DR:** You’re free to use, modify, and distribute with attribution — but **not for commercial use**.


---
