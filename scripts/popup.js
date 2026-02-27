// ====== FAP Dashboard (popup) - Clean Version ======
// Core functions are provided by modules loaded before this script:
// - utils.js: $, setValue, toNum, NORM, debounce
// - storage.js: STORAGE, cacheGet, cacheSet
// - api.js: DEFAULT_URLS, fetchViaContentScript, looksLikeLoginPage, fetchHTML
// - login.js: checkLoginStatus, checkAndShowLoginBanner

// - calendar.js: initCalendarUI, exportScheduleICS, exportExamICS

// ---------- Module References ----------
const STORAGE = window.STORAGE;
const DEFAULT_URLS = window.DEFAULT_URLS;
const $ = window.$;
const setValue = window.setValue;
const toNum = window.toNum;
const NORM = window.NORM;
const fetchHTML = window.fetchHTML;
const cacheGet = window.cacheGet;
const cacheSet = window.cacheSet;
const debounce = window.debounce;

// Transcript - from modules/transcript.js
const parseTranscriptDoc = window.parseTranscriptDoc || ((doc) => window.TranscriptService?.parseTranscriptDoc(doc) || []);
const computeGPA = window.computeGPA || ((items, excluded) => window.TranscriptService?.computeGPA(items, excluded) || { gpa10: NaN, gpa4: NaN, credits: 0 });

// Attendance - from modules/attendance.js (individual fallbacks prevent crash if attendance.js fails)
const parseScheduleOfWeek = window.Attendance?.parseScheduleOfWeek || ((doc) => ({ entries: [], todayRows: [] }));
const renderAttendance = window.Attendance?.renderAttendance || (() => { });
const renderScheduleWeek = window.Attendance?.renderScheduleWeek || (() => { });
const refreshAttendance = window.Attendance?.refreshAttendance || (() => Promise.resolve());
const loadAttendanceAndSchedule = window.Attendance?.loadAttendanceAndSchedule || (() => Promise.resolve());

// Today Schedule - from modules/today-schedule.js
const loadTodaySchedule = window.loadTodaySchedule || (() => window.TodayScheduleService?.loadTodaySchedule());

// Statistics - from modules/statistics.js
const loadStatistics = window.loadStatistics || (() => window.StatisticsService?.loadStatistics());

// GPA Calculator - from modules/gpa-calculator.js
const initGPACalculator = window.initGPACalculator || (() => {
  window.GPACalculatorService?.initGPACalculator();
  window.GPACalculatorService?.init();
});

// Settings - from modules/settings.js
const loadSettingsUI = window.loadSettingsUI || (() => window.SettingsService?.loadSettingsUI());
const saveSettingsUI = window.saveSettingsUI || (() => window.SettingsService?.saveSettingsUI());

// Exams - from modules/exams.js
const loadExams = window.loadExams || (() => window.ExamService?.loadExams());

// LMS Events - from modules/lms-events.js (already on window, just reference them)
// Functions: window.loadLMSEvents, window.refreshLMSEvents, window.renderLMSEvents

// Tabs - from modules/tabs.js (init via TabsService.init() at bottom)

// Login - from modules/login.js
const checkLoginStatus = window.checkLoginStatus || (() => window.LoginService?.checkLoginStatus());
const forceCheckLoginStatus = window.forceCheckLoginStatus || (() => window.LoginService?.forceCheckLoginStatus());
const checkAndShowLoginBanner = window.checkAndShowLoginBanner || (() => window.LoginService?.checkAndShowLoginBanner());

// Constants
const DAY_MS = window.DAY_MS || 24 * 60 * 60 * 1000;
const EXCLUDED_DEFAULT = window.EXCLUDED_DEFAULT || ["TRS501", "ENT503", "VOV114", "VOV124", "VOV134", "OTP101"];

// ---------- Stability: Refresh Cooldown ----------
const REFRESH_COOLDOWN_MS = 10000; // 10 seconds
let _lastRefreshTs = 0;

function isRefreshOnCooldown() {
  const now = Date.now();
  if (now - _lastRefreshTs < REFRESH_COOLDOWN_MS) {
    const remaining = Math.ceil((REFRESH_COOLDOWN_MS - (now - _lastRefreshTs)) / 1000);
    Toast?.warning(`Vui lòng đợi ${remaining}s trước khi làm mới lại.`, "Quá nhanh");
    return true;
  }
  return false;
}

function markRefreshUsed() {
  _lastRefreshTs = Date.now();
}

// ---------- Stability: Safe Chrome API Wrappers ----------
function safeOpenTab(url) {
  try {
    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[SafeOpen] Failed to open tab:", chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.error("[SafeOpen] Exception:", e);
  }
}

function safeSendMessage(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) {
        console.warn("[SafeMsg] Message failed:", chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.error("[SafeMsg] Exception:", e);
  }
}

// escapeHtml is provided by utils.js (window.escapeHtml)

// ---------- Renderers ----------

// Track current rows for event delegation
let _currentTranscriptRows = [];

async function renderTranscript(rows, excluded) {
  _currentTranscriptRows = rows;
  const g = computeGPA(rows, excluded);
  setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
  setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
  setValue("#credits", g.credits || "--");
  setValue("#gpa10Quick", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");

  const tbody = document.querySelector("#tblCourses tbody");
  if (!tbody) return;

  const q = (document.querySelector("#searchCourse")?.value || "").toLowerCase();
  const { course_notes: allNotes, excluded_courses: excludedCourses } =
    await STORAGE.getMultiple({ course_notes: {}, excluded_courses: [] });

  setValue("#excludedCount", excludedCourses.length);
  if (excludedCourses.length > 0) {
    const excludedNames = excludedCourses.slice(0, 2).join(", ");
    const moreText = excludedCourses.length > 2 ? ` và ${excludedCourses.length - 2} môn khác` : "";
    setValue("#excludedDetail", `${excludedNames}${moreText}`);
  } else {
    setValue("#excludedDetail", "Không có môn nào");
  }

  // Build all rows in DocumentFragment (single DOM mutation)
  const fragment = document.createDocumentFragment();

  rows.forEach((r) => {
    if (q && !(String(r.code).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q))) return;

    const courseCode = (r.code || "").toUpperCase();
    const safeCourseCode = escapeHtml(courseCode);
    const hasNote = allNotes[courseCode] && allNotes[courseCode].trim();
    const isExcluded = excludedCourses.includes(courseCode);

    const tr = document.createElement("tr");
    tr.className = isExcluded ? "course-row excluded" : "course-row";
    tr.dataset.code = courseCode;

    // Grade badge with color coding
    let gradeHtml = "";
    if (Number.isFinite(r.grade)) {
      let gradeClass = "grade-fail";
      if (r.grade >= 8) gradeClass = "grade-high";
      else if (r.grade >= 5) gradeClass = "grade-mid";
      else if (r.grade >= 4) gradeClass = "grade-low";
      gradeHtml = `<span class="grade-badge ${gradeClass}">${r.grade}</span>`;
    }

    // Status badge with color coding
    let statusHtml = "";
    const rawStatus = (r.status || "").trim();
    if (rawStatus) {
      const normStatus = rawStatus.toUpperCase();
      let statusClass = "status-learning";
      if (/PASS|DAT|PASSED/.test(normStatus)) statusClass = "status-passed";
      else if (/FAIL|ROT|NOT PASS|FAILED/.test(normStatus)) statusClass = "status-failed";
      else if (/EXEMPT|MIEN/.test(normStatus)) statusClass = "status-exempt";
      statusHtml = `<span class="status-badge ${statusClass}">${escapeHtml(rawStatus)}</span>`;
    }

    tr.innerHTML = `
        <td style="text-align: center">
          <input type="checkbox" class="exclude-checkbox" 
                data-code="${safeCourseCode}" 
                ${isExcluded ? "checked" : ""}
                title="Loai tru khoi GPA">
        </td>
        <td class="course-code">${safeCourseCode}</td>
        <td class="course-name">${escapeHtml(r.name || "")}</td>
        <td class="r">${Number.isFinite(r.credit) ? r.credit : ""}</td>
        <td class="r">${gradeHtml}</td>
        <td>${statusHtml}</td>
        <td style="text-align: center">
          <button class="note-toggle-btn ${hasNote ? "has-note" : ""}" data-code="${safeCourseCode}" title="Ghi chu">📝</button>
        </td>
    `;

    const noteRow = document.createElement("tr");
    noteRow.className = "note-row";
    noteRow.style.display = "none";
    noteRow.dataset.code = courseCode;
    noteRow.innerHTML = `
      <td colspan="7" class="note-cell">
        <textarea class="course-note-input" data-code="${safeCourseCode}" placeholder="Ghi chú cho môn ${safeCourseCode}..." rows="3">${escapeHtml(allNotes[courseCode] || "")}</textarea>
      </td>
    `;

    fragment.appendChild(tr);
    fragment.appendChild(noteRow);
  });

  tbody.innerHTML = "";
  tbody.appendChild(fragment); // SINGLE DOM mutation instead of N appendChild calls

  // Setup event delegation ONCE (not per row)
  if (!tbody._delegated) {
    tbody._delegated = true;
    _setupTranscriptDelegation(tbody);
  }
}

// Event delegation for transcript table — replaces 3N individual listeners with 3
function _setupTranscriptDelegation(tbody) {
  let _noteSaveTimeout;

  // Handle note toggle clicks
  tbody.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".note-toggle-btn");
    if (!toggleBtn) return;
    e.stopPropagation();
    const code = toggleBtn.dataset.code;
    const noteRow = tbody.querySelector(`tr.note-row[data-code="${code}"]`);
    if (noteRow) {
      const isVisible = noteRow.style.display !== "none";
      noteRow.style.display = isVisible ? "none" : "table-row";
      if (!isVisible) noteRow.querySelector("textarea")?.focus();
    }
  });

  // Handle exclude checkbox — INCREMENTAL update, no full re-render
  tbody.addEventListener("change", async (e) => {
    if (!e.target.classList.contains("exclude-checkbox")) return;

    const code = e.target.dataset.code;
    const isExcl = e.target.checked;
    const excl = await STORAGE.get("excluded_courses", []);

    if (isExcl && !excl.includes(code)) excl.push(code);
    else if (!isExcl) {
      const idx = excl.indexOf(code);
      if (idx > -1) excl.splice(idx, 1);
    }

    await STORAGE.set({ excluded_courses: excl });

    // INCREMENTAL: only update row class + GPA values (no full re-render!)
    const tr = e.target.closest("tr");
    if (tr) tr.className = isExcl ? "course-row excluded" : "course-row";

    const g = computeGPA(_currentTranscriptRows, excl);
    setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
    setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
    setValue("#credits", g.credits || "--");
    setValue("#gpa10Quick", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
    setValue("#excludedCount", excl.length);

    if (excl.length > 0) {
      const excludedNames = excl.slice(0, 2).join(", ");
      const moreText = excl.length > 2 ? ` và ${excl.length - 2} môn khác` : "";
      setValue("#excludedDetail", `${excludedNames}${moreText}`);
    } else {
      setValue("#excludedDetail", "Không có môn nào");
    }

    Toast?.success(isExcl ? `Đã loại trừ ${code} khỏi GPA` : `Đã thêm ${code} vào GPA`);
  });

  // Handle auto-save notes (debounced)
  tbody.addEventListener("input", (e) => {
    if (!e.target.classList.contains("course-note-input")) return;

    const textarea = e.target;
    const code = textarea.dataset.code;

    clearTimeout(_noteSaveTimeout);
    _noteSaveTimeout = setTimeout(async () => {
      const notes = await STORAGE.get("course_notes", {});
      notes[code] = textarea.value;
      await STORAGE.set({ course_notes: notes });

      const toggleBtn = tbody.querySelector(`.note-toggle-btn[data-code="${code}"]`);
      toggleBtn?.classList.toggle("has-note", !!textarea.value.trim());
      Toast?.success("Đã lưu note");
    }, 1000);
  });
}

function summarizeAttendance(entries) {
  let present = 0, absent = 0, late = 0, neutral = 0;
  for (const e of entries) {
    if (!e) continue;
    const s = NORM(e.status || "");
    if (/ATTENDED|CÓ MẶT/.test(s)) present++;
    else if (/LATE|MUỘN/.test(s)) late++;
    else if (/ABSENT|VẮNG/.test(s)) absent++;
    else if (/NOT YET/.test(s)) neutral++;
  }
  // Late counts as present for rate calculation (student DID attend)
  const denom = present + late + absent;
  const rate = denom ? Math.round(((present + late) / denom) * 100) : 0;
  return { present, absent, late, rate, total: present + absent + late, neutral };
}

function updateQuickAttendanceStats(entries) {
  if (entries && entries.length > 0) {
    const stats = summarizeAttendance(entries);
    setValue("#attRateQuick", stats.rate + "%");
  } else {
    setValue("#attRateQuick", "--");
  }
}

async function updateAttendanceQuickStats() {
  try {
    const attCache = await cacheGet("cache_attendance", 10 * 60 * 1000);
    if (attCache?.entries && attCache.entries.length > 0) {
      const stats = summarizeAttendance(attCache.entries);
      setValue("#attRateQuick", stats.rate + "%");
    } else {
      setValue("#attRateQuick", "--");
    }
  } catch (error) {
    setValue("#attRateQuick", "--");
  }
}

// Cache freshness threshold (30 min — aligned with SWR pattern in transcript.js)
const GPA_CACHE_MAX_AGE = 30 * 60 * 1000;

/**
 * Render GPA from cache only - for search/filter operations
 * Does NOT trigger background fetch
 */
async function renderGPAFromCache() {
  const { cache_transcript: cachedObj, excluded_courses: excludedCourses } =
    await STORAGE.getMultiple({ cache_transcript: null, excluded_courses: [] });
  const cachedData = cachedObj ? cachedObj.data : null;

  if (cachedData && Array.isArray(cachedData.rows) && cachedData.rows.length > 0) {
    renderTranscript(cachedData.rows, excludedCourses);
  }
}

/**
 * Load GPA - renders from cache and optionally fetches fresh data
 * @param {boolean} forceFetch - Force background fetch regardless of cache age
 */
async function loadGPA(forceFetch = false) {
  const { cache_transcript: cachedObj, excluded_courses: excludedCourses } =
    await STORAGE.getMultiple({ cache_transcript: null, excluded_courses: [] });
  const cachedData = cachedObj ? cachedObj.data : null;
  const cacheTimestamp = cachedObj?.ts || 0;

  // Always render from cache first (instant display)
  if (cachedData && Array.isArray(cachedData.rows) && cachedData.rows.length > 0) {
    console.log("[GPA] Rendering from cache:", cachedData.rows.length, "courses");
    renderTranscript(cachedData.rows, excludedCourses);
  } else {
    // No cache - show loading indicators
    console.log("[GPA] No cache, showing loading state");
    setValue("#gpa10", "⏳");
    setValue("#gpa4", "⏳");
    setValue("#credits", "⏳");
    setValue("#gpa10Quick", "⏳");
  }

  // Check if we need to fetch fresh data
  const cacheAge = Date.now() - cacheTimestamp;
  const isCacheStale = cacheAge > GPA_CACHE_MAX_AGE;
  const hasNoData = !cachedData || !cachedData.rows || cachedData.rows.length === 0;

  if (forceFetch || isCacheStale || hasNoData) {
    // Request background to fetch fresh data (non-blocking)
    try {
      chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', force: forceFetch });
      console.log("[GPA] Requested background fetch (stale:", isCacheStale, ", force:", forceFetch, ", age:", Math.round(cacheAge / 1000), "s)");
    } catch (e) {
      console.error("[GPA] Failed to request background fetch:", e);
    }
  } else {
    console.log("[GPA] Cache is fresh, skipping background fetch (age:", Math.round(cacheAge / 1000), "s)");
  }
}

// ---------- Loading States (with cooldown) ----------
async function handleRefreshWithLoading(btn, fn) {
  // Rate-limit: prevent rapid-fire refreshes
  if (isRefreshOnCooldown()) return;
  markRefreshUsed();

  btn.classList.remove("btn-success", "btn-error");
  const isIconBtn = btn.classList.contains("today-refresh-btn");
  const orig = btn.textContent;
  btn.classList.add("btn-loading");
  btn.disabled = true;
  if (!isIconBtn) btn.textContent = "Đang tải...";

  try {
    await fn();
    btn.classList.remove("btn-loading");
    btn.classList.add("btn-success");
    if (!isIconBtn) btn.textContent = "Thành công!";
    setTimeout(() => {
      btn.classList.remove("btn-success");
      if (!isIconBtn) btn.textContent = orig;
      btn.disabled = false;
    }, 2000);
  } catch (e) {
    btn.classList.remove("btn-loading");
    btn.classList.add("btn-error");
    if (!isIconBtn) btn.textContent = "Lỗi!";
    console.error("Refresh error:", e);
    setTimeout(() => {
      btn.classList.remove("btn-error");
      if (!isIconBtn) btn.textContent = orig;
      btn.disabled = false;
    }, 2000);
  }
}
window.handleRefreshWithLoading = handleRefreshWithLoading;

// ---------- Stability: Cached Login Check ----------
// Cache login check result for 2 minutes to avoid network request per refresh click
let _loginCheckCache = { result: null, ts: 0 };

async function cachedLoginCheck() {
  const LOGIN_CACHE_MS = window.TIME_CONSTANTS?.CACHE_TTL_LOGIN || 2 * 60 * 1000;
  if (Date.now() - _loginCheckCache.ts < LOGIN_CACHE_MS && _loginCheckCache.result !== null) {
    return _loginCheckCache.result;
  }
  const result = await forceCheckLoginStatus();
  _loginCheckCache = { result, ts: Date.now() };
  return result;
}

// ---------- Button Event Listeners (using safeOpenTab) ----------
document.getElementById("btnOpenFAP")?.addEventListener("click", () => safeOpenTab("https://fap.fpt.edu.vn/"));
document.getElementById("btnOpenTranscript")?.addEventListener("click", () => safeOpenTab(DEFAULT_URLS.transcript));
document.getElementById("btnOpenLMS")?.addEventListener("click", () => safeOpenTab("https://lms-hcm.fpt.edu.vn/"));
document.getElementById("btnOpenFAP2")?.addEventListener("click", () => safeOpenTab("https://fap.fpt.edu.vn/"));
document.getElementById("btnOpenIT")?.addEventListener("click", () => safeOpenTab("https://it-hcm.fpt.edu.vn/"));
document.getElementById("btnOpenAttendance")?.addEventListener("click", () => safeOpenTab(DEFAULT_URLS.scheduleOfWeek));
document.getElementById("btnOpenSchedule")?.addEventListener("click", () => safeOpenTab(DEFAULT_URLS.scheduleOfWeek));
document.getElementById("btnOpenExams")?.addEventListener("click", () => safeOpenTab(DEFAULT_URLS.examSchedule));

// LMS Events buttons
document.getElementById("btnOpenLMS2")?.addEventListener("click", () => safeOpenTab("https://lms-hcm.fpt.edu.vn/calendar/view.php?view=upcoming"));
document.getElementById("btnRefreshLMS")?.addEventListener("click", async function () {
  await handleRefreshWithLoading(this, async () => {
    await window.refreshLMSEvents?.();
  });
});
document.getElementById("searchLMS")?.addEventListener("input", debounce(async () => {
  const c = await cacheGet("cache_lms_events", 30 * 60 * 1000);
  const searchQuery = document.getElementById("searchLMS")?.value || "";
  window.renderLMSEvents?.(c?.events || [], searchQuery);
}, 300));

// Search & Filter - Use renderGPAFromCache to avoid triggering background fetch on every keystroke
document.getElementById("searchCourse")?.addEventListener("input", debounce(renderGPAFromCache, 300));
document.getElementById("searchAtt")?.addEventListener("input", debounce(async () => {
  const c = await cacheGet("cache_attendance", 10 * 60 * 1000);
  renderAttendance(c?.entries || []);
}, 300));
document.getElementById("filterDay")?.addEventListener("change", async () => {
  const c = await cacheGet("cache_attendance", 10 * 60 * 1000);
  renderAttendance(c?.entries || []);
});

// Refresh Buttons
document.getElementById("btnRefreshAttendance")?.addEventListener("click", async function () {
  const isLoggedIn = await cachedLoginCheck();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); return; }
  await handleRefreshWithLoading(this, async () => {
    await refreshAttendance();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshSchedule")?.addEventListener("click", async function () {
  const isLoggedIn = await cachedLoginCheck();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); return; }
  await handleRefreshWithLoading(this, async () => {
    await refreshAttendance();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshExams")?.addEventListener("click", async function () {
  const isLoggedIn = await cachedLoginCheck();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); return; }
  await handleRefreshWithLoading(this, async () => {
    await STORAGE.remove("cache_exams");
    await loadExams();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshStats")?.addEventListener("click", async function () {
  const isLoggedIn = await cachedLoginCheck();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); return; }
  await handleRefreshWithLoading(this, async () => {
    await loadStatistics();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshAll")?.addEventListener("click", async function () {
  const confirmed = await Modal?.confirm("Xóa cache và tải lại dữ liệu?", { title: "Xác nhận làm mới", confirmText: "Làm mới", icon: "🔄" });
  if (!confirmed) return;

  const isLoggedIn = await cachedLoginCheck();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); return; }

  await handleRefreshWithLoading(this, async () => {
    // Clear all caches (single IPC call instead of 6)
    await STORAGE.remove([
      "cache_transcript", "cache_transcript_flat",
      "cache_attendance", "cache_attendance_flat",
      "cache_exams", "cache_exams_flat"
    ]);

    // Show loading state for GPA
    setValue("#gpa10", "⏳");
    setValue("#gpa4", "⏳");
    setValue("#credits", "⏳");

    // Request FORCED background fetch for transcript
    safeSendMessage({ type: 'FETCH_TRANSCRIPT', force: true });

    // Refresh attendance and exams (these are fast)
    await Promise.all([refreshAttendance(), loadExams()]);
    await STORAGE.set({ last_successful_fetch: Date.now(), cache_reset_ts: Date.now() });
  });
});

document.getElementById("btnQuickRefresh")?.addEventListener("click", async function () {
  const isLoggedIn = await cachedLoginCheck();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); return; }

  await handleRefreshWithLoading(this, async () => {
    // Clear all caches (single IPC call instead of 6)
    await STORAGE.remove([
      "cache_transcript", "cache_transcript_flat",
      "cache_attendance", "cache_attendance_flat",
      "cache_exams", "cache_exams_flat"
    ]);

    // Show loading state for GPA
    setValue("#gpa10", "⏳");
    setValue("#gpa4", "⏳");
    setValue("#credits", "⏳");
    setValue("#gpa10Quick", "⏳");

    // Request FORCED background fetch for transcript (non-blocking)
    safeSendMessage({ type: 'FETCH_TRANSCRIPT', force: true });

    // Refresh other data (these are fast)
    await Promise.all([refreshAttendance(), loadExams(), loadTodaySchedule(), initGPACalculator()]);
    await STORAGE.set({ last_successful_fetch: Date.now(), cache_reset_ts: Date.now() });
    await updateAttendanceQuickStats();
  });
});

// Settings (handled by SettingsService.init() — no duplicate listeners here)

// Copy GPA
document.getElementById("btnCopyGPA")?.addEventListener("click", async function () {
  const gpa10 = document.querySelector("#gpa10")?.textContent || "--";
  const gpa4 = document.querySelector("#gpa4")?.textContent || "--";
  const credits = document.querySelector("#credits")?.textContent || "--";

  if (gpa10 === "--" || gpa4 === "--") {
    Modal?.warning("Chưa có dữ liệu GPA để copy!");
    return;
  }

  const text = `GPA (10): ${gpa10}\nGPA (4): ${gpa4}\nTổng tín chỉ: ${credits}`;
  try {
    await navigator.clipboard.writeText(text);
    const original = this.textContent;
    this.textContent = "✓ Đã copy!";
    this.classList.add("btn-copied");
    setTimeout(() => {
      this.textContent = original;
      this.classList.remove("btn-copied");
    }, 1500);
  } catch (err) {
    Modal?.error("Không thể copy: " + err.message);
  }
});

// Reset/Set Excluded Courses
document.getElementById("btnResetExcluded")?.addEventListener("click", async function () {
  const confirmed = await Modal?.confirm("Reset danh sách môn loại trừ?", { title: "Reset loại trừ môn" });
  if (confirmed) {
    await STORAGE.set({ excluded_courses: [] });
    await loadGPA();
    Toast?.success("Đã reset danh sách môn loại trừ!");
  }
});

document.getElementById("btnSetDefaultExcluded")?.addEventListener("click", async function () {
  const confirmed = await Modal?.confirm("Set mặc định loại trừ TRS501, ENT503, VOV114?", { title: "Set mặc định loại trừ" });
  if (confirmed) {
    await STORAGE.set({ excluded_courses: EXCLUDED_DEFAULT });
    await loadGPA();
    Toast?.success("Đã set mặc định loại trừ môn!");
  }
});

// Export CSV
function exportToCSV() {
  // Helper: escape CSV fields that contain commas, quotes, or newlines
  function csvField(val) {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  Promise.all([
    STORAGE.get("cache_transcript", null),
    STORAGE.get("cache_attendance", null),
    STORAGE.get("cache_exams", null),
  ]).then(([transcript, attendance, exams]) => {
    const lines = ["TRANSCRIPT", "Code,Name,Credit,Grade,Status"];
    (transcript?.rows || transcript?.data?.rows || []).forEach((r) => {
      lines.push([r.code, r.name, r.credit, r.grade, r.status].map(csvField).join(","));
    });

    lines.push("", "", "ATTENDANCE", "Date,Day,Slot,Course,Status");
    (attendance?.entries || attendance?.data?.entries || []).forEach((e) => {
      lines.push([e.date, e.day, e.slot, e.course, e.status].map(csvField).join(","));
    });

    lines.push("", "", "EXAMS", "Code,Name,Date,Time,Room,Form");
    (exams?.exams || exams?.data?.exams || []).forEach((e) => {
      lines.push([e.code, e.name, e.date, e.time, e.room, e.form].map(csvField).join(","));
    });

    const csv = lines.join("\n") + "\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fap_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    // Delay revocation to prevent download failure on slower machines
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
document.getElementById("btnExportCSV")?.addEventListener("click", exportToCSV);

// Export PDF
document.getElementById("btnExportPDF")?.addEventListener("click", () => {
  safeOpenTab(chrome.runtime.getURL("pages/report.html"));
});

// Dark mode is handled by ThemeService.init() below — no duplicate IIFE needed.

// ---------- Widget Controls ----------
const HIDDEN_WIDGET_KEY = "hidden_widgets";

async function toggleWidget(widgetId) {
  const widget = document.querySelector(`[data-widget="${widgetId}"]`);
  if (!widget) return;
  const content = widget.querySelector(".widget-content");
  if (!content) return;
  const isCollapsed = content.style.display === "none";
  content.style.display = isCollapsed ? "" : "none";
  widget.setAttribute("data-collapsed", (!isCollapsed).toString());
}

async function removeWidget(widgetId) {
  const widget = document.querySelector(`[data-widget="${widgetId}"]`);
  if (!widget) return;
  widget.style.display = "none";
  const hidden = (await STORAGE.get(HIDDEN_WIDGET_KEY, [])) || [];
  if (!hidden.includes(widgetId)) {
    hidden.push(widgetId);
    await STORAGE.set({ [HIDDEN_WIDGET_KEY]: hidden });
  }
}

// switchTab delegates to TabsService (defined in tabs.js)
// window.switchTab is already set by tabs.js — no need to redefine here
function switchTab(tabId) {
  window.TabsService?.switchTab(tabId);
}



// ---------- Keyboard Shortcuts ----------
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "r") {
    e.preventDefault();
    document.getElementById("btnQuickRefresh")?.click();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    const searchInputs = [
      document.getElementById("searchCourse"),
      document.getElementById("searchAtt"),
      document.getElementById("searchExam"),
    ];
    const activeTab = document.querySelector(".tab.active");
    const activeSearch = searchInputs.find((input) => input && activeTab?.contains(input));
    if (activeSearch) {
      activeSearch.focus();
      activeSearch.select();
    }
    return;
  }

  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
    e.preventDefault();
    const tabs = document.querySelectorAll(".tabs button");
    const tabIndex = parseInt(e.key) - 1;
    if (tabs[tabIndex]) tabs[tabIndex].click();
  }
});

// ---------- Setup Event Listeners ----------
function setupEventListeners() {
  // Elements already exist at DOMContentLoaded, no delay needed
  document.querySelectorAll("[data-widget-action]").forEach((btn) => {
    const action = btn.getAttribute("data-widget-action");
    const widgetId = btn.getAttribute("data-widget-id");
    if (action === "toggle") btn.addEventListener("click", () => toggleWidget(widgetId));
    else if (action === "remove") btn.addEventListener("click", () => removeWidget(widgetId));
  });

  document.querySelectorAll('[data-tab-action="switch"]').forEach((btn) => {
    const tabId = btn.getAttribute("data-tab-id");
    btn.addEventListener("click", () => switchTab(tabId));
  });

  // Single delegated click listener (merged from two separate listeners)
  document.addEventListener("click", (e) => {
    // Quick action buttons
    const qBtn = e.target.closest(".quick-action-btn");
    if (qBtn) {
      const tabId = qBtn.getAttribute("data-tab-id");
      if (tabId) switchTab(tabId);
      return;
    }

    // Data actions (e.g. close-modal)
    const action = e.target.getAttribute("data-action");
    if (action === "close-modal") {
      e.target.closest(".modal-overlay, .tab-editor-modal")?.remove();
    }
  });
}

// ---------- Initialize ----------
(async function init() {
  console.log("[Init] Starting popup initialization...");

  // ========== PRIORITY 1: UI-Critical Data (Fast, from cache) ==========
  // These load from cache and will display immediately
  // NOTE: loadTodaySchedule is NOT included here — it also calls refreshAttendance()
  // which would cause a double network request. It runs after attendance is loaded.
  await Promise.all([
    loadAttendanceAndSchedule(),  // Schedule/Attendance - shows on Today tab
    loadExams(),                  // Exam schedule
    window.loadLMSEvents?.() || Promise.resolve(),  // LMS upcoming events
  ]);
  // Load today schedule AFTER attendance is loaded (uses same cache, no double fetch)
  await loadTodaySchedule();
  console.log("[Init] Priority 1 complete: Schedule, Today, Exams");

  // ========== PRIORITY 2: GPA (Cache + Background Fetch) ==========
  // This loads from cache instantly, then triggers background fetch
  loadGPA().catch(e => console.warn("[Init] loadGPA error:", e));
  console.log("[Init] Priority 2 complete: GPA loading initiated");

  // ========== PRIORITY 3: Non-Critical ==========
  loadSettingsUI().catch(e => console.warn("[Init] loadSettingsUI error:", e));
  loadStatistics().catch(e => console.warn("[Init] loadStatistics error:", e));
  initGPACalculator();
  console.log("[Init] Priority 3 complete: Settings, Stats, Calculator");

  // Initialize login banner event listeners
  if (window.LoginService) window.LoginService.init();

  await checkLoginStatus();
  await checkAndShowLoginBanner();

  // Periodic login check (every 5 min while popup is open)
  window._loginCheckInterval = setInterval(async () => {
    await checkLoginStatus();
    await checkAndShowLoginBanner();
  }, 5 * 60 * 1000);

  // Login status click handler
  document.getElementById("loginStatusIndicator")?.addEventListener("click", async () => {
    safeOpenTab("https://fap.fpt.edu.vn/");
  });

  // Version badge
  const curr = chrome.runtime.getManifest().version;
  const badge = document.getElementById("verBadge");
  if (badge) badge.textContent = `v${curr}`;

  // ---------- Last Fetch Time Indicator ----------
  async function updateLastFetchTime() {
    const ts = await STORAGE.get("last_successful_fetch", 0);
    const el = document.getElementById("lastFetchTime");
    if (!el || !ts) { if (el) el.textContent = ""; return; }
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    let text;
    if (mins < 1) text = "Vừa cập nhật";
    else if (mins < 60) text = `${mins} phút trước`;
    else if (hours < 24) text = `${hours} giờ trước`;
    else text = `${days} ngày trước`;
    el.textContent = `🕐 ${text}`;
    // Warn if stale (>1 hour)
    el.style.color = hours >= 1 ? "#e67e22" : "";
  }
  await updateLastFetchTime();
  window._lastFetchInterval = setInterval(updateLastFetchTime, 30000);

  // Clean up intervals when popup/dashboard closes
  // Use visibilitychange (works for popups) + beforeunload (works for fullpage)
  function cleanupIntervals() {
    clearInterval(window._loginCheckInterval);
    clearInterval(window._lastFetchInterval);
    clearInterval(window._countdownInterval);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cleanupIntervals();
  });
  window.addEventListener("beforeunload", cleanupIntervals);
})();

// ========== Reactive Updates: Listen for Background Fetch ==========

// Use centralized isValidScheduleData from utils.js
const isValidScheduleData = window.isValidScheduleData;

// Listen for storage changes (when background updates cache)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // When transcript cache is updated by background, re-render GPA
  if (changes.cache_transcript) {
    const newValue = changes.cache_transcript.newValue;
    if (newValue?.data?.rows && newValue.data.rows.length > 0) {
      console.log("[Storage] Transcript cache updated, re-rendering GPA");
      const excluded = await STORAGE.get("excluded_courses", []);
      renderTranscript(newValue.data.rows, excluded);
    }
  }

  // When attendance cache is updated, re-render (only if valid data)
  if (changes.cache_attendance) {
    const newValue = changes.cache_attendance.newValue;
    const entries = newValue?.data?.entries;

    // Only re-render if new data is valid (prevents blank screen on login page redirect)
    if (entries && isValidScheduleData(entries)) {
      console.log("[Storage] Attendance cache updated with valid data, re-rendering");
      renderAttendance(entries);
      updateQuickAttendanceStats(entries);
    } else if (entries && entries.length === 0) {
      console.warn("[Storage] Ignoring empty attendance cache update (likely not logged in)");
    }
  }
});

// Redundant TRANSCRIPT_READY/LOADING listener removed — storage.onChanged handles re-rendering.

// Update countdown every minute
window._countdownInterval = setInterval(() => {
  const activeTab = document.querySelector(".tab.active");
  if (activeTab?.id === "tab-today") loadTodaySchedule();
}, 60000);

// Init tabs (guarded against double init)
if (window.TabsService) window.TabsService.init();

// Init theme
if (window.ThemeService) window.ThemeService.init();

// Init exam filters
if (window.ExamService) window.ExamService.init();

// Init settings listeners
if (window.SettingsService) window.SettingsService.init();

function initPopup() {
  if (window.initCalendarUI) window.initCalendarUI();
  setupEventListeners();
}

// Fix: Use readyState check to avoid race condition
// DOMContentLoaded may have already fired by the time this script runs
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPopup);
} else {
  initPopup();
}
