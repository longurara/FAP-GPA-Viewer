// ====== FAP Dashboard (popup) - Clean Version ======
// Core functions are provided by modules loaded before this script:
// - utils.js: $, setValue, toNum, NORM, debounce
// - storage.js: STORAGE, cacheGet, cacheSet
// - api.js: DEFAULT_URLS, fetchViaContentScript, looksLikeLoginPage, fetchHTML
// - login.js: checkLoginStatus, checkAndShowLoginBanner, showLoginNotification
// - update.js: UpdateModal
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

// Attendance - from modules/attendance.js
const { parseScheduleOfWeek, renderAttendance, renderScheduleWeek, refreshAttendance, loadAttendanceAndSchedule } = window.Attendance || {};

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

// Tabs - from modules/tabs.js
const initLiquidGlassTabs = window.initLiquidGlassTabs || (() => window.TabsService?.initLiquidGlassTabs());

// Login - from modules/login.js
const checkLoginStatus = window.checkLoginStatus || (() => window.LoginService?.checkLoginStatus());
const checkAndShowLoginBanner = window.checkAndShowLoginBanner || (() => window.LoginService?.checkAndShowLoginBanner());
const showLoginNotification = window.showLoginNotification || (() => { });

// Constants
const DAY_MS = window.DAY_MS || 24 * 60 * 60 * 1000;
const EXCLUDED_KEY = window.EXCLUDED_KEY || "__FAP_EXCLUDED_CODES__";
const EXCLUDED_DEFAULT = window.EXCLUDED_DEFAULT || ["TRS501", "ENT503", "VOV114", "VOV124", "VOV134", "OTP101"];

// ---------- Renderers ----------
async function renderTranscript(rows, excluded) {
  const g = computeGPA(rows, excluded);
  setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
  setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
  setValue("#credits", g.credits || "--");
  setValue("#gpa10Quick", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");

  const tbody = document.querySelector("#tblCourses tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const q = (document.querySelector("#searchCourse")?.value || "").toLowerCase();
  const allNotes = await STORAGE.get("course_notes", {});
  const excludedCourses = await STORAGE.get("excluded_courses", []);

  setValue("#excludedCount", excludedCourses.length);
  if (excludedCourses.length > 0) {
    const excludedNames = excludedCourses.slice(0, 2).join(", ");
    const moreText = excludedCourses.length > 2 ? ` và ${excludedCourses.length - 2} môn khác` : "";
    setValue("#excludedDetail", `${excludedNames}${moreText}`);
  } else {
    setValue("#excludedDetail", "Không có môn nào");
  }

  rows.forEach((r) => {
    if (q && !(String(r.code).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q))) return;

    const courseCode = r.code || "";
    const hasNote = allNotes[courseCode] && allNotes[courseCode].trim();
    const isExcluded = excludedCourses.includes(courseCode);

    const tr = document.createElement("tr");
    tr.className = isExcluded ? "course-row excluded" : "course-row";
    tr.innerHTML = `
        <td style="text-align: center">
          <input type="checkbox" class="exclude-checkbox" 
                data-code="${courseCode}" 
                ${isExcluded ? "checked" : ""}
                title="Loại trừ khỏi GPA">
        </td>
        <td class="course-code">${r.code || ""}</td>
        <td class="course-name">${r.name || ""}</td>
        <td class="r">${Number.isFinite(r.credit) ? r.credit : ""}</td>
        <td class="r">${Number.isFinite(r.grade) ? r.grade : ""}</td>
        <td>${r.status || ""}</td>
        <td style="text-align: center">
          <button class="note-toggle-btn ${hasNote ? "has-note" : ""}" data-code="${courseCode}" title="Ghi chú">📝</button>
        </td>
    `;

    const noteRow = document.createElement("tr");
    noteRow.className = "note-row";
    noteRow.style.display = "none";
    noteRow.innerHTML = `
      <td colspan="6" class="note-cell">
        <textarea class="course-note-input" data-code="${courseCode}" placeholder="Ghi chú cho môn ${courseCode}..." rows="3">${allNotes[courseCode] || ""}</textarea>
      </td>
    `;

    tbody.appendChild(tr);
    tbody.appendChild(noteRow);

    // Toggle note
    const toggleBtn = tr.querySelector(".note-toggle-btn");
    toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = noteRow.style.display !== "none";
      noteRow.style.display = isVisible ? "none" : "table-row";
      if (!isVisible) noteRow.querySelector("textarea")?.focus();
    });

    // Handle exclude checkbox
    const excludeCheckbox = tr.querySelector(".exclude-checkbox");
    excludeCheckbox?.addEventListener("change", async (e) => {
      const code = e.target.dataset.code;
      const isExcl = e.target.checked;
      const excl = await STORAGE.get("excluded_courses", []);

      if (isExcl && !excl.includes(code)) excl.push(code);
      else if (!isExcl) {
        const idx = excl.indexOf(code);
        if (idx > -1) excl.splice(idx, 1);
      }

      await STORAGE.set({ excluded_courses: excl });
      tr.className = isExcl ? "course-row excluded" : "course-row";
      await renderTranscript(rows, excl);
      Toast.success(isExcl ? `Đã loại trừ ${code} khỏi GPA` : `Đã thêm ${code} vào GPA`);
    });

    // Auto-save note
    const textarea = noteRow.querySelector("textarea");
    let saveTimeout;
    textarea?.addEventListener("input", async () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const notes = await STORAGE.get("course_notes", {});
        notes[courseCode] = textarea.value;
        await STORAGE.set({ course_notes: notes });
        toggleBtn.classList.toggle("has-note", textarea.value.trim());
        Toast.success("Đã lưu note");
      }, 1000);
    });
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
  const denom = present + absent;
  const rate = denom ? Math.round((present / denom) * 100) : 0;
  return { present, absent, late, rate, total: present + absent + late, neutral };
}

function updateQuickAttendanceStats(entries) {
  if (entries && entries.length > 0) {
    const stats = summarizeAttendance(entries);
    setValue("#attRateQuick", stats.rate + "%");
    setValue("#quickAttendance", stats.rate + "%");
  } else {
    setValue("#attRateQuick", "--");
    setValue("#quickAttendance", "--");
  }
}

async function updateAttendanceQuickStats() {
  try {
    const attCache = await cacheGet("cache_attendance", 10 * 60 * 1000);
    if (attCache?.entries && attCache.entries.length > 0) {
      const stats = summarizeAttendance(attCache.entries);
      setValue("#attRateQuick", stats.rate + "%");
      setValue("#quickAttendance", stats.rate + "%");
    } else {
      setValue("#attRateQuick", "--");
      setValue("#quickAttendance", "--");
    }
  } catch (error) {
    setValue("#attRateQuick", "--");
    setValue("#quickAttendance", "--");
  }
}

// Cache freshness threshold (7 days)
const GPA_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Render GPA from cache only - for search/filter operations
 * Does NOT trigger background fetch
 */
async function renderGPAFromCache() {
  const CACHE_KEY = "cache_transcript";
  const cachedObj = await STORAGE.get(CACHE_KEY, null);
  const cachedData = cachedObj ? cachedObj.data : null;
  const excludedCourses = await STORAGE.get("excluded_courses", []);

  if (cachedData && Array.isArray(cachedData.rows) && cachedData.rows.length > 0) {
    renderTranscript(cachedData.rows, excludedCourses);
  }
}

/**
 * Load GPA - renders from cache and optionally fetches fresh data
 * @param {boolean} forceFetch - Force background fetch regardless of cache age
 */
async function loadGPA(forceFetch = false) {
  const CACHE_KEY = "cache_transcript";
  const cachedObj = await STORAGE.get(CACHE_KEY, null);
  const cachedData = cachedObj ? cachedObj.data : null;
  const cacheTimestamp = cachedObj?.ts || 0;
  const excludedCourses = await STORAGE.get("excluded_courses", []);

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

// ---------- Loading States ----------
async function handleRefreshWithLoading(btn, fn) {
  btn.classList.remove("btn-success", "btn-error");
  const orig = btn.textContent;
  btn.classList.add("btn-loading");
  btn.textContent = "Đang tải...";

  try {
    await fn();
    btn.classList.remove("btn-loading");
    btn.classList.add("btn-success");
    btn.textContent = "Thành công!";
    setTimeout(() => {
      btn.classList.remove("btn-success");
      btn.textContent = orig;
    }, 2000);
  } catch (e) {
    btn.classList.remove("btn-loading");
    btn.classList.add("btn-error");
    btn.textContent = "Lỗi!";
    console.error("Refresh error:", e);
    setTimeout(() => {
      btn.classList.remove("btn-error");
      btn.textContent = orig;
    }, 2000);
  }
}
window.handleRefreshWithLoading = handleRefreshWithLoading;

// ---------- Button Event Listeners ----------
document.getElementById("btnOpenFAP")?.addEventListener("click", () => chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" }));
document.getElementById("btnOpenTranscript")?.addEventListener("click", () => chrome.tabs.create({ url: DEFAULT_URLS.transcript }));
document.getElementById("btnOpenLMS")?.addEventListener("click", () => chrome.tabs.create({ url: "https://lms-hcm.fpt.edu.vn/" }));
document.getElementById("btnOpenFAP2")?.addEventListener("click", () => chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" }));
document.getElementById("btnOpenIT")?.addEventListener("click", () => chrome.tabs.create({ url: "https://it-hcm.fpt.edu.vn/" }));
document.getElementById("btnOpenAttendance")?.addEventListener("click", () => chrome.tabs.create({ url: DEFAULT_URLS.scheduleOfWeek }));
document.getElementById("btnOpenSchedule")?.addEventListener("click", () => chrome.tabs.create({ url: DEFAULT_URLS.scheduleOfWeek }));
document.getElementById("btnOpenExams")?.addEventListener("click", () => chrome.tabs.create({ url: DEFAULT_URLS.examSchedule }));

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
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); showLoginNotification(); return; }
  await handleRefreshWithLoading(this, async () => {
    await refreshAttendance();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshSchedule")?.addEventListener("click", async function () {
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); showLoginNotification(); return; }
  await handleRefreshWithLoading(this, async () => {
    await refreshAttendance();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshExams")?.addEventListener("click", async function () {
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); showLoginNotification(); return; }
  await handleRefreshWithLoading(this, async () => {
    await STORAGE.remove("cache_exams");
    await loadExams();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshStats")?.addEventListener("click", async function () {
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); showLoginNotification(); return; }
  await handleRefreshWithLoading(this, async () => {
    await loadStatistics();
    await STORAGE.set({ last_successful_fetch: Date.now() });
  });
});

document.getElementById("btnRefreshAll")?.addEventListener("click", async function () {
  const confirmed = await Modal.confirm("Xóa cache và tải lại dữ liệu?", { title: "Xác nhận làm mới", confirmText: "Làm mới", icon: "🔄" });
  if (!confirmed) return;

  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); showLoginNotification(); return; }

  await handleRefreshWithLoading(this, async () => {
    // Clear all caches
    await STORAGE.remove("cache_transcript");
    await STORAGE.remove("cache_transcript_flat");
    await STORAGE.remove("cache_attendance");
    await STORAGE.remove("cache_attendance_flat");
    await STORAGE.remove("cache_exams");
    await STORAGE.remove("cache_exams_flat");

    // Show loading state for GPA
    setValue("#gpa10", "⏳");
    setValue("#gpa4", "⏳");
    setValue("#credits", "⏳");

    // Request FORCED background fetch for transcript
    chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', force: true });

    // Refresh attendance and exams (these are fast)
    await Promise.all([refreshAttendance(), loadExams()]);
    await STORAGE.set({ last_successful_fetch: Date.now(), cache_reset_ts: Date.now() });
  });
});

document.getElementById("btnQuickRefresh")?.addEventListener("click", async function () {
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) { await checkAndShowLoginBanner(); showLoginNotification(); return; }

  await handleRefreshWithLoading(this, async () => {
    // Clear all caches
    await STORAGE.remove("cache_transcript");
    await STORAGE.remove("cache_transcript_flat");
    await STORAGE.remove("cache_attendance");
    await STORAGE.remove("cache_attendance_flat");
    await STORAGE.remove("cache_exams");
    await STORAGE.remove("cache_exams_flat");

    // Show loading state for GPA
    setValue("#gpa10", "⏳");
    setValue("#gpa4", "⏳");
    setValue("#credits", "⏳");
    setValue("#gpa10Quick", "⏳");

    // Request FORCED background fetch for transcript (non-blocking)
    chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', force: true });

    // Refresh other data (these are fast)
    await Promise.all([refreshAttendance(), loadExams(), loadTodaySchedule(), initGPACalculator()]);
    await STORAGE.set({ last_successful_fetch: Date.now(), cache_reset_ts: Date.now() });
    await updateAttendanceQuickStats();
  });
});

// Settings
document.getElementById("btnSaveSettings")?.addEventListener("click", saveSettingsUI);
document.getElementById("btnTestNotify")?.addEventListener("click", () => chrome.runtime.sendMessage({ type: "TEST_NOTIFY" }));

// Copy GPA
document.getElementById("btnCopyGPA")?.addEventListener("click", async function () {
  const gpa10 = document.querySelector("#gpa10")?.textContent || "--";
  const gpa4 = document.querySelector("#gpa4")?.textContent || "--";
  const credits = document.querySelector("#credits")?.textContent || "--";

  if (gpa10 === "--" || gpa4 === "--") {
    Modal.warning("Chưa có dữ liệu GPA để copy!");
    return;
  }

  const text = `GPA (10): ${gpa10}\nGPA (4): ${gpa4}\nTổng tín chỉ: ${credits}`;
  try {
    await navigator.clipboard.writeText(text);
    const original = this.textContent;
    this.textContent = "✓ Đã copy!";
    this.style.background = "#10b981";
    this.style.borderColor = "#10b981";
    this.style.color = "#fff";
    setTimeout(() => {
      this.textContent = original;
      this.style.background = "";
      this.style.borderColor = "";
      this.style.color = "";
    }, 1500);
  } catch (err) {
    Modal.error("Không thể copy: " + err.message);
  }
});

// Reset/Set Excluded Courses
document.getElementById("btnResetExcluded")?.addEventListener("click", async function () {
  const confirmed = await Modal.confirm("Reset danh sách môn loại trừ?", "Reset loại trừ môn");
  if (confirmed) {
    await STORAGE.set({ excluded_courses: [] });
    await loadGPA();
    Toast.success("Đã reset danh sách môn loại trừ!");
  }
});

document.getElementById("btnSetDefaultExcluded")?.addEventListener("click", async function () {
  const confirmed = await Modal.confirm("Set mặc định loại trừ TRS501, ENT503, VOV114?", "Set mặc định loại trừ");
  if (confirmed) {
    await STORAGE.set({ excluded_courses: EXCLUDED_DEFAULT });
    await loadGPA();
    Toast.success("Đã set mặc định loại trừ môn!");
  }
});

// Export CSV
function exportToCSV() {
  Promise.all([
    STORAGE.get("cache_transcript", null),
    STORAGE.get("cache_attendance", null),
    STORAGE.get("cache_exams", null),
  ]).then(([transcript, attendance, exams]) => {
    let csv = "TRANSCRIPT\nCode,Name,Credit,Grade,Status\n";
    (transcript?.rows || transcript?.data?.rows || []).forEach((r) => {
      csv += `${r.code || ""},${r.name || ""},${r.credit || ""},${r.grade || ""},${r.status || ""}\n`;
    });

    csv += "\n\nATTENDANCE\nDate,Day,Slot,Course,Status\n";
    (attendance?.entries || attendance?.data?.entries || []).forEach((e) => {
      csv += `${e.date || ""},${e.day || ""},${e.slot || ""},${e.course || ""},${e.status || ""}\n`;
    });

    csv += "\n\nEXAMS\nCode,Name,Date,Time,Room,Form\n";
    (exams?.exams || exams?.data?.exams || []).forEach((e) => {
      csv += `${e.code || ""},${e.name || ""},${e.date || ""},${e.time || ""},${e.room || ""},${e.form || ""}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fap_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
}
document.getElementById("btnExportCSV")?.addEventListener("click", exportToCSV);

// Export PDF
document.getElementById("btnExportPDF")?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/report.html") });
});

// ---------- Dark Mode ----------
(async function initDarkMode() {
  const theme = await STORAGE.get("theme", "dark");
  document.documentElement.setAttribute("data-theme", theme);

  document.getElementById("themeToggle")?.addEventListener("click", async () => {
    const current = document.documentElement.getAttribute("data-theme");
    const newTheme = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    await STORAGE.set({ theme: newTheme });
    if (window.gpaChartInstance) await loadStatistics();
  });
})();

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

// ---------- Tab Switching ----------
function switchTab(tabId) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(`.tabs button[data-tab="${tabId}"]`)?.classList.add("active");
  document.getElementById(`tab-${tabId}`)?.classList.add("active");
}

// ---------- Study Plans ----------
let studyPlans;
function initStudyPlans() {
  if (typeof StudyPlans !== "undefined") {
    studyPlans = new StudyPlans();
  }
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
  setTimeout(() => {
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
  }, 100);

  document.addEventListener("click", (e) => {
    if (e.target.closest(".quick-action-btn")) {
      const btn = e.target.closest(".quick-action-btn");
      const tabId = btn.getAttribute("data-tab-id");
      if (tabId) switchTab(tabId);
    }
  });

  document.querySelectorAll(".tabs button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(btn.getAttribute("data-tab"));
    });
  });

  document.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    if (!action) return;

    switch (action) {
      case "close-modal":
        e.target.closest(".modal-overlay, .tab-editor-modal")?.remove();
        break;
      case "select-result":
        const resultType = e.target.getAttribute("data-result-type");
        if (window.advancedSearch && resultType) window.advancedSearch.selectResult(resultType);
        break;
      case "show-create-plan-modal":
        if (window.studyPlans) studyPlans.showCreatePlanModal();
        break;
      case "create-plan":
        if (window.studyPlans) studyPlans.createPlan();
        break;
      case "start-plan":
      case "pause-plan":
      case "resume-plan":
      case "complete-plan":
      case "restart-plan":
      case "delete-plan":
        const planId = e.target.getAttribute("data-plan-id");
        if (window.studyPlans && planId) {
          const method = action.replace("-plan", "Plan").replace("-", "");
          studyPlans[method]?.(planId);
        }
        break;
    }
  });
}

// ---------- Initialize ----------
(async function init() {
  console.log("[Init] Starting popup initialization...");

  // ========== PRIORITY 1: UI-Critical Data (Fast, from cache) ==========
  // These load from cache and will display immediately
  await Promise.all([
    loadAttendanceAndSchedule(),  // Schedule/Attendance - shows on Today tab
    loadTodaySchedule(),          // Today's classes
    loadExams(),                  // Exam schedule
  ]);
  console.log("[Init] Priority 1 complete: Schedule, Today, Exams");

  // ========== PRIORITY 2: GPA (Cache + Background Fetch) ==========
  // This loads from cache instantly, then triggers background fetch
  loadGPA();
  console.log("[Init] Priority 2 complete: GPA loading initiated");

  // ========== PRIORITY 3: Non-Critical ==========
  loadSettingsUI();
  loadStatistics();
  initGPACalculator();
  console.log("[Init] Priority 3 complete: Settings, Stats, Calculator");

  await checkLoginStatus();
  await checkAndShowLoginBanner();

  // Periodic login check
  setInterval(async () => {
    await checkLoginStatus();
    await checkAndShowLoginBanner();
  }, 5 * 60 * 1000);

  // Login check on visibility/focus
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      await checkLoginStatus();
      await checkAndShowLoginBanner();
    }
  });

  window.addEventListener("focus", async () => {
    await checkLoginStatus();
    await checkAndShowLoginBanner();
  });

  // Login status click handler
  document.getElementById("loginStatus")?.addEventListener("click", async () => {
    chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" });
  });

  // Version badge
  const curr = chrome.runtime.getManifest().version;
  const badge = document.getElementById("verBadge");
  if (badge) badge.textContent = `v${curr}`;
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

// Listen for messages from background (for logging only - rendering is handled by storage.onChanged)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRANSCRIPT_READY') {
    console.log("[Message] Received TRANSCRIPT_READY with", msg.rows?.length || 0, "courses");
    // Don't re-render here - storage.onChanged will handle it to avoid duplicates
  }
  if (msg.type === 'TRANSCRIPT_LOADING') {
    console.log("[Message] Background is loading transcript...");
  }
});

// Update countdown every minute
setInterval(() => {
  const activeTab = document.querySelector(".tab.active");
  if (activeTab?.id === "tab-today") loadTodaySchedule();
}, 60000);

// Init tabs
if (window.TabsService) window.TabsService.init();
else {
  initLiquidGlassTabs();
  setTimeout(() => initLiquidGlassTabs(), 100);
}

// Init theme
if (window.ThemeService) window.ThemeService.init();

// Init exam filters
if (window.ExamService) window.ExamService.init();

function initPopup() {
  initStudyPlans();
  if (window.initCalendarUI) window.initCalendarUI();
  setupEventListeners();
}

document.addEventListener("DOMContentLoaded", initPopup);
