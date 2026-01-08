# Changelog

All notable changes to FAP Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[5.0.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v5.0.0
[4.5.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.5.0
[4.1.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.1.0
[4.0.0]: https://github.com/longurara/FAP-GPA-Viewer/releases/tag/v4.0.0
