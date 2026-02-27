# Changelog

All notable changes to FAP Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [6.0.0] - 2026-02-11

### 🎨 Page Styling — Student Portal

- **Student Portal** (`Student.aspx`): Complete modern redesign via `fap-schedule.css` (~786 lines)
  - Gradient page background (`#f0f4f8` → `#e2e8f0`) with system font stack
  - White rounded cards (`.box`) with subtle shadow, `border-radius: 16px`
  - User info bar: navy pill badges with gradient, hover lift + shadow
  - Breadcrumb: white card with border, rounded corners
  - **Important Notice table**: dark navy gradient title bar, light gray column headers with uppercase labels, zebra-striped data rows, hover highlight (`#f0f7ff`), overridden MSO inline styles
  - **Academic Information section**: `h4` headers with blue left border + gradient background, link lists with hover slide-right effect (`translateX(4px)`), "New" icon badges
  - **Schedule Widget UI**: white card container, dark navy `<thead>` with white uppercase text, attendance stats bar (green/blue/red/blue stat numbers), today row highlighting with blue left border + "Hôm nay" badge, status labels (`label-success`/`label-danger`/`label-info`), Material (amber) and Meet (blue) link badges
  - **Notice collapse toggle**: rounded button, hover color change, smooth expand/collapse animation
  - **App Download footer**: dark gradient card with App Store + Google Play badges, hover lift
  - **Email modal**: backdrop blur, rounded content, navy header, styled inputs with focus glow
  - Focus-visible outlines for all interactive elements (accessibility)
  - Disabled refresh button styling during loading
  - Responsive design: stacked columns on mobile, scrollable schedule table
  - Print stylesheet: removes shadows, hides toggles + chat widget

- **ScheduleOfWeek.aspx Enhancement** (`fap-schedule-week.js` + `fap-schedule-week.css`):
  - Header widget with attendance stats now scoped to table wrapper
  - Status-colored left borders on course cells (orange=attended, green=not yet, red=absent)
  - Today's date highlighting with blue background
  - Material/Meet link badges with colored backgrounds
  - Innermost table selection to avoid ASP.NET layout table false matches

### 🎉 New Features

- **Per-Page CSS Toggle** (Settings tab): Users can enable/disable extension styling on each FAP page independently
  - 8 toggle switches in Settings → "Tùy chỉnh giao diện trang" section (Login, FeID Login, Student, Schedule, Transcript, Exam, Fees, News)
  - Stored in `chrome.storage.local` under key `page_styles` — plain object with boolean values
  - Auto-save on toggle change (instant, no need to click "Lưu cài đặt")
  - CSS gate in every content script: reads `page_styles`, programmatically injects CSS only when enabled, skips entirely when `false`
  - New `fap-news-gate.js` script for the CSS-only News entry

- **Weekly Schedule Widget** (`Student.aspx`): Fully rewritten `fap-schedule.js` (~800 lines)
  - Fetches `ScheduleOfWeek.aspx` via `fetch()` with `credentials: 'include'` and parses with DOMParser
  - Renders a weekly schedule table with attendance stats (Đã học, Chưa học, Vắng, Tỷ lệ ĐD)
  - Material/Meet link badges rendered as clickable labels
  - Today highlighting with "Hôm nay" badge
  - 4-level fallback chain for widget insertion (`chat-widget-container` > breadcrumb > `mainContent` > first `.row`)
  - `chrome.storage.local` cache with 15-minute TTL
  - Loading guard prevents concurrent fetches
  - Retry button on error state
  - Cross-module cache sync: writes to `cache_attendance` so popup/dashboard can consume without refetching

### 🔗 Unified Data Schema

- **Standardized schedule data across 3 independent parsers** (`fap-schedule.js`, `background.js`, `attendance.js`):
  - Course regex broadened: `/[A-Z]{2,4}\d{3}/` → `/[A-Za-z]{2,4}\d{2,3}[a-z]?/` (supports codes like `GDQP01`, `LAB21`)
  - Status string unified: `'not_yet'` → `'not yet'` (with space) everywhere
  - `slot` field: integer in widget, `"Slot N"` string in cache (normalized during sync)
  - All parsers now produce `day` (`'MON'`/`'TUE'`/etc.) and `key` (`'DD/MM|Slot N|CODE'`) fields
  - `background.js` parser now includes `room` and `time` fields
  - Validation regex (`isValidScheduleData`) broadened in both `utils.js` and `background.js`

### 🐛 Bug Fixes

- **Fixed "Đã học always shows 1"** (`fap-schedule-week.js`): `enhanceTable()` was scanning ALL rows including headers/footers — non-slot rows containing course-like text + "attended" produced phantom counts. Now only classifies course/status on slot rows (first cell matches `Slot N`)
- **Fixed `escapeHtml` SyntaxError crash**: Both `exams.js` and `lms-events.js` declared `const escapeHtml` at global scope — duplicate `const` in same lexical scope throws SyntaxError, killing `lms-events.js` entirely. Removed declarations; bare `escapeHtml` resolves to `window.escapeHtml` set by `utils.js`
- **Fixed `window.loadLMSEvents is not a function`**: Caused by the above SyntaxError. Added optional chaining (`window.loadLMSEvents?.()`) for defensive safety
- **Fixed login detection false-positives** (`background.js`): Both transcript and schedule parsers matched "login" as substring of "logout"/"lbllogin" on logged-in pages, falsely reporting `LOGIN_REQUIRED`. Added exclusion guards matching `fap-schedule.js` pattern
- **Fixed status fallback to raw text** (`background.js`): Status defaulted to `""` and fell through to raw cell text (`status || raw`). Changed default to `'not yet'` matching `fap-schedule.js`
- **Fixed manifest path**: `scripts/vendor/chart.min.js` → `assets/vendor/chart.min.js` (actual file location)
- **Fixed tab content ID lookup** (`tabs.js`): `getElementById(tabId)` → `getElementById("tab-" + tabId)` (tab content divs use `id="tab-today"` not `"today"`)
- **Fixed `switchTab()` delegation** (`popup.js`): Now delegates to `TabsService.switchTab()` for indicator animation with fallback
- **Fixed `_countdownInterval` TDZ risk** (`popup.js`): Removed reference to `const` declared 42 lines below from `beforeunload` handler
- **Fixed per-page CSS toggle not working**: Toggling off any page styling had no effect — Chrome MV3 injects `content_scripts` CSS as inline `<style>` elements (not `<link>` tags), so the `link[rel="stylesheet"]` selector never matched. Removed all `"css"` entries from manifest; each content script now programmatically creates a `<link>` via `chrome.runtime.getURL()` only when toggle is ON

### ⚡ Stability & Defensive Checks

- **`popup.js` module references**: All `Modal.xxx()` → `Modal?.xxx()`, `Toast.xxx()` → `Toast?.xxx()` to prevent crash if `ui.js` fails to load
- **`attendance.js`**: All bare `STORAGE`, `fetchHTML`, `cacheSet`, `isValidScheduleData` → `window.X?.()` with optional chaining
- **`auto-calendar.js`**: `STORAGE.get()` → `window.STORAGE?.get()` with nullish coalescing
- **`exams.js`**: Safe `escapeHtml` access via global scope chain
- **`lms-events.js`**: Same safe `escapeHtml` access
- **`attendance.js`**: Exported `window.refreshAttendance` so `today-schedule.js` can call it (was silently dead)
- **`fap-schedule-week.js`**: Stats query scoped to table wrapper instead of `document.querySelectorAll`; `findScheduleTable()` now picks innermost matching table; status check order: `not yet` before `attended`

### 🗑️ Removed

- **Deleted orphaned focus feature**: `scripts/focus-page.js` and `pages/focus-page.html` — sent messages (`resumeStudy`/`endStudySession`/`updateDistractions`) that `background.js` never handled
- **Removed dead code**: `debugAttendanceData()` export in `attendance.js`, shadowed `window.loadGPA` in `transcript.js`, unused `firstEntry` variable in `fap-schedule.js`, dead `EXCLUDED_KEY` constant in `popup.js`

### 🔧 Technical Changes

- Added `TEST_NOTIFY` message handler in `background.js` — responds with `{ ok: true }`
- Settings test notification button now shows toast with response
- `fap-schedule-week.js` course regex broadened to match unified pattern
- Focus-visible outlines added for accessibility
- **CSS injection strategy change**: Moved from declarative (`manifest.json` `content_scripts.css`) to programmatic injection (JS creates `<link>` at runtime), eliminating FOUC when toggle is OFF
- Added all 8 page CSS files to `web_accessible_resources`

---

## [5.9.0] - 2026-02-09

### 🎨 Page Styling — Login Pages

- **FAP Login Page** (`fap.fpt.edu.vn`): Complete modern dark redesign
  - Wallpaper background (`wallpaper1.jpg`) with blur overlay
  - Centered glassmorphic login card with frosted glass effect
  - Custom dropdown replacing native `<select>` — animated open/close, active indicator, dark theme
  - Styled Google (red gradient) and FeID (blue gradient) login buttons with hover lift
  - Hides unnecessary elements: app banner, breadcrumb, footer, parent login
  - New files: `styles/fap-login.css`, `scripts/fap-login.js`

- **FeID Login Page** (`feid.fpt.edu.vn/Account/Login`): Dark glassmorphic theme
  - Wallpaper background with blur overlay
  - Dark navbar with FPT Education branding
  - Two glassmorphic cards: username/password form + SSO (Google/Microsoft) buttons
  - Styled form inputs with focus glow, blue Login button, outlined SSO buttons
  - New files: `styles/feid-login.css`, `scripts/feid-login.js`

### 🐛 Bug Fixes

- **Fixed Chrome startup tabs**: Removed `fetchTranscriptInBackground()` from `onStartup` listener that was creating visible FAP tabs every time Chrome launched

### 🔧 Technical Changes

- Added `feid.fpt.edu.vn` to `host_permissions` and `web_accessible_resources`
- Added wallpaper files to `web_accessible_resources`
- New content_scripts entries for login pages (FAP + FeID)

---

## [5.7.0] - 2026-02-09

### 🎨 Page Styling — FAP Portal Pages

- **Student Transcript** (`StudentTranscript.aspx`): Dark theme with styled grade table, status badges, GPA widget
- **Exam Schedule** (`ExamSchedule.aspx`): Card-based layout with countdown badges, exam type indicators
- **Subject Fees** (`SubjectFees.aspx`): Modern dark table with payment status badges
- **News Page** (`CMSNews.aspx`): Styled news listing with hover effects
- **News Detail** (`NewsDetail.aspx`): Clean article layout with dark cards
- **Student Portal** page styling with cohesive dark theme

### 🐛 Bug Fixes

- Fixed race conditions in transcript fetching
- Fixed theme preset buttons visibility
- Fixed notice table CSS scoping issues
- Fixed settings sync between popup and dashboard
- Improved error handling across all async functions
- Added proper try-catch guards to prevent silent failures

### ⚡ Stability Improvements

- Added defensive null checks throughout the codebase
- Improved content script injection timing
- Fixed duplicate fetch prevention logic
- Enhanced SWR (Stale-While-Revalidate) cache reliability

---

## [5.6.0] - 2026-01-19

- **Login Page** (`fap.fpt.edu.vn`): Enhanced glassmorphic design (`fap-login.css` rewrite + `fap-login.js` updates):
  - Card entrance animation (`fapCardIn` — fadeInUp + scale) and subtle border glow pulse (`fapGlow`)
  - FPT University branding section with gradient blue/indigo graduation cap icon above "Đăng nhập" heading
  - "Chọn cơ sở" label above the campus dropdown
  - "hoặc" divider (line-text-line pattern with gradient lines) between Google and FeID buttons
  - Login buttons: shine sweep effect on hover (`::before` pseudo-element), `scale(0.98)` press feedback
  - Error message: amber background + border pill styling
  - Footer with extension version credit at bottom of card
  - Deeper glassmorphic card: `blur(24px) saturate(1.3)`, blue ambient glow in `box-shadow`
  - Narrower card width (`520px` → `480px`) for tighter feel
  - Softer dropdown border (`1.5px`, lower opacity)
  - Responsive adjustments for mobile

### 🎉 New Features

- **LMS Calendar Integration**: New tab to view upcoming events from LMS HCM
  - Displays assignments, quizzes, and deadlines from LMS calendar
  - Countdown badges (urgent/soon) for upcoming events
  - Direct links to submit assignments
  - Search functionality to filter events
  - Works in both Popup and Fullpage modes

### 🔧 Technical Changes

- Added `https://lms-hcm.fpt.edu.vn/*` to host permissions
- Created new module: `scripts/modules/lms-events.js`
- Added `FETCH_LMS_EVENTS` message handler in background.js
- Added LMS tab to `popup.html` and `dashboard.html`
- Added LMS events styling to `schedule.css`

### 🐛 Bug Fixes

- Fixed login banner showing too frequently (removed time-based trigger)
- Banner now only shows when data fetch actually fails

---

## [5.4.0] - 2026-01-08

### ⚡ Performance Improvements

- **Login Check Cache**: Login status now cached for 30 minutes
  - Extension no longer loads FAP page every time popup opens
  - Cache resets on browser startup for fresh check
  - Manual refresh buttons still perform real-time login check

### 🎨 New Features

- **ScheduleOfWeek Page Enhancement**: Beautiful redesign for the schedule page
  - Clean header widget with attendance statistics (Đã học, Chưa học, Vắng, Tỷ lệ ĐD)
  - Subtle status highlighting with colored left border
  - Enhanced View Materials & Meet URL buttons styling
  - Today's date highlighting
  - Responsive design with clean, minimal aesthetic

### 🔧 Technical Changes

- Added new content script: `fap-schedule-week.js`
- Added new stylesheet: `fap-schedule-week.css`
- Updated `manifest.json` with ScheduleOfWeek.aspx content script entry
- Added `forceCheckLoginStatus()` function for manual refresh operations
- Background service worker now resets login cache on browser startup

### 🐛 Bug Fixes

- Fixed login check causing FAP tab to open on every popup click
- Improved content preservation - schedule page now keeps all original info (room, teacher, links)

---

## [5.3.0] - 2026-01-08

### 🏗️ CSS Architecture Refactor

- **Modular CSS**: Split monolithic `popup.css` (~88KB, 4400 lines) into 8 focused files (~50KB total):
  - `main.css` - Entry point with imports
  - `base.css` - CSS variables, reset, typography
  - `animations.css` - All @keyframes
  - `layout.css` - Containers, grids, structure
  - `components.css` - Buttons, cards, forms, tables
  - `tabs.css` - Tab navigation with liquid glass effect
  - `modals.css` - Modal dialogs, toasts, overlays
  - `schedule.css` - Schedule, attendance, exams styles

### ⚡ Performance Improvements

- **GPA Cache Extended**: Cache max age increased from 5 minutes to **7 days**
  - Reduces unnecessary network requests
  - GPA data only refreshes on manual refresh or when cache expires
- **Duplicate Fetch Prevention**: Added guard to prevent concurrent transcript fetches
- **Hidden Scrollbar**: Cleaner UI with invisible scrollbar (still scrollable)

### 🐛 Bug Fixes

- Fixed missing CSS for buttons in Settings/Export sections
- Fixed login status indicator alignment (moved to left)
- Fixed duplicate error handling guards in background.js
- Added missing CSS for stats-grid, calc-form, theme-presets, widgets

### 🔧 Error Handling

- Added try-catch blocks to all async functions:
  - `login.js`: checkAndShowLoginBanner, handleLoginNow
  - `transcript.js`: loadGPA
  - `study-plans.js`: init, loadPlans, savePlans
  - `gpa-calculator.js`: initGPACalculator
  - `statistics.js`: loadStatistics

---

## [5.2.0] - 2026-01-06

### ✨ New Features

- **Full Page Dashboard**: Now you can choose between sticking with the compact Popup or opening a spacious Full Page Dashboard.
  - **Popup Mode**: Classic compact view for quick checks.
  - **Full Page Mode**: Expanded interface, larger charts, and more breathing room for your data.
- **View Mode Setting**: New option in "Settings > System" to toggle between Popup and Full Page modes.

### 🎨 UI Improvements

- **Dashboard UI**: Completely responsive design for the new Full Page mode with optimized font sizes and spacing.
- **Visual Polish**: refined spacing, better card scaling, and improved readability on larger screens.

---

### 🏗️ Major Architecture Refactor

This release represents a complete rewrite of the extension's architecture, reducing the codebase by **43%** while improving maintainability and performance.

### ✨ Added

- **Modular Architecture**: 12 new ES Modules for better code organization
  - `utils.js` - DOM helpers, debounce utilities
  - `storage.js` - Chrome storage wrapper with caching
  - `api.js` - FAP API integration layer
  - `login.js` - Authentication status management
  - `transcript.js` - GPA parsing and calculation
  - `exams.js` - Exam schedule handling with countdowns
  - `today-schedule.js` - Today's classes widget
  - `settings.js` - User preferences management
  - `statistics.js` - Charts and analytics (Chart.js)
  - `theme.js` - Theme and background customization
  - `tabs.js` - Liquid Glass tab navigation
  - `gpa-calculator.js` - Target GPA planning tool

- **Stale-While-Revalidate Caching**: Instant UI with background data refresh
- **Background Polling**: Automatic schedule updates via Chrome Alarms API
- **ICS Export**: Export schedule to Google Calendar, Apple Calendar, Outlook

### 🔄 Changed

- **popup.js**: Reduced from ~3,989 lines to ~2,300 lines (43% reduction)
- **Manifest optimized**: Reduced host_permissions from 5 to 2 domains
- **Improved error handling**: Better fallbacks and error recovery
- **Cleaner module references**: Backward-compatible with graceful degradation

### 🔒 Security

- Removed unnecessary host_permissions:
  - ❌ `https://github.com/*` (not needed, only bookmark links)
  - ❌ `https://lms-hcm.fpt.edu.vn/*` (not needed, only bookmark links)
  - ❌ `https://it-hcm.fpt.edu.vn/*` (not needed, only bookmark links)
  - ❌ `https://wttr.in/*` (unused)
- Kept only essential permissions:
  - ✅ `https://fap.fpt.edu.vn/*` (core functionality)
  - ✅ `https://api.github.com/*` (update checker)

### 🐛 Fixed

- Fixed "Cannot access before initialization" error with module references
- Fixed duplicate function declarations causing redeclare errors
- Fixed tab navigation initialization timing issues
- Improved Today Schedule countdown accuracy

### 📝 Documentation

- Complete README.md rewrite with professional formatting
- Added architecture documentation
- Added permission explanations
- Updated installation instructions

---

## [4.5.0] - 2024-12-XX

### Added
- Advanced Search System with scoring algorithm
- Background Pomodoro Timer with Chrome Alarms API
- Smart Study Break Reminders
- Achievement System with rate limiting

### Changed
- Improved notification panel with glassmorphism design
- Better Dark/Light mode support for charts

---

## [4.1.0] - 2024-11-XX

### Added
- Dark/Light Mode toggle
- Today's Schedule with real-time countdown
- GPA Calculator for target planning
- Statistics & Trend Chart (Chart.js)
- Attendance Streak Tracker
- Exam Countdown badges

---

## [4.0.0] - 2024-10-XX

### Added
- Initial Manifest V3 migration
- Service Worker background script
- Chrome Storage API integration

---

[6.0.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v6.0.0
[5.9.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v5.9.0
[5.7.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v5.7.0
[5.6.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v5.6.0
[5.0.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v5.0.0
[4.5.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.5.0
[4.1.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.1.0
[4.0.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.0.0
[4.0.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.0.0
