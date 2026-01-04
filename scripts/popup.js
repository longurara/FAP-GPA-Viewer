// ====== FAP Dashboard (popup) with caching + ScheduleOfWeek attendance ======
const STORAGE = {
  get: (k, d) =>
    new Promise((r) => chrome.storage.local.get({ [k]: d }, (v) => r(v[k]))),
  set: (obj) => new Promise((r) => chrome.storage.local.set(obj, r)),
  remove: (k) => new Promise((r) => chrome.storage.local.remove(k, r)),
};

const DEFAULT_URLS = {
  transcript: "https://fap.fpt.edu.vn/Grade/StudentTranscript.aspx",
  scheduleOfWeek: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx",
  examSchedule: "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx",
};

function $(sel) {
  return document.querySelector(sel);
}
function setValue(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}
function toNum(txt) {
  const m = (txt || "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : NaN;
}
function NORM(s) {
  return (s || "").replace(/\s+/g, " ").trim().toUpperCase();
}

// ===== Update checker (GitHub Releases) =====
const REPO = "longurara/FAP-GPA-Viewer";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_PAGE =
  "https://github.com/longurara/FAP-GPA-Viewer/releases/latest";

function semverParts(v) {
  const m = String(v || "")
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(.*)?$/);
  if (!m) return [0, 0, 0, ""];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] || ""];
}
function semverCmp(a, b) {
  const A = semverParts(a),
    B = semverParts(b);
  for (let i = 0; i < 3; i++) {
    if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  }
  return 0;
}

async function checkUpdate(force = false) {
  const CACHE_KEY = "__gh_latest_release__";
  const now = Date.now();
  const cached = await STORAGE.get(CACHE_KEY, null);
  let latest = null;
  if (!force && cached && now - cached.ts < 6 * 60 * 60 * 1000) {
    latest = cached.data;
  } else {
    const res = await fetch(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("GitHub API error " + res.status);
    const j = await res.json();
    latest = {
      tag: j.tag_name || j.name || "",
      url: j.html_url || RELEASE_PAGE,
      published_at: j.published_at || "",
    };
    await STORAGE.set({ [CACHE_KEY]: { ts: now, data: latest } });
  }

  const curr = chrome.runtime.getManifest().version;
  const latestClean = (latest.tag || "").replace(/^v/i, "");
  const cmp = semverCmp(latestClean, curr);

  renderUpdateButton(cmp, curr, latestClean);
}

function renderUpdateButton(cmp, curr, latestClean) {
  const badge = document.getElementById("verBadge");
  const btn = document.getElementById("btnCheckUpdate");

  if (badge) {
    badge.textContent = `v${curr}`;
  }

  if (cmp > 0) {
    if (badge) {
      badge.innerHTML = `v${curr} ? <strong>v${latestClean}</strong>`;
      badge.style.color = "var(--accent)";
    }
    if (btn) {
      btn.textContent = "C?p nh?t";
      btn.addEventListener("click", () => {
        // Show update modal instead of redirecting to GitHub
        UpdateModal.show();
      });
      btn.classList.add("primary");
    }
  } else {
    if (btn) {
      btn.textContent = "Check update";
      btn.addEventListener("click", async () => {
        try {
          await checkUpdate(true);
          // Show iPadOS style update modal
          UpdateModal.show();
        } catch (e) {
          Modal.error("Kh�ng ki?m tra du?c c?p nh?t" + e.message);
        }
      });
    }
  }
}

async function waitForTabComplete(tabId, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function fetchViaContentScript(url) {
  const parsedUrl = new URL(url);
  const targetOrigin = parsedUrl.origin;

  // Prefer an existing FAP tab to reuse logged-in session
  const tabs = await chrome.tabs.query({ url: `${targetOrigin}/*`, status: "complete" });
  let tabId;
  let createdTab = false;

  if (tabs && tabs.length > 0) {
    tabId = tabs[0].id;
  } else {
    const tab = await chrome.tabs.create({ url: targetOrigin, active: false });
    tabId = tab.id;
    createdTab = true;
    await waitForTabComplete(tabId);
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [url],
    func: async (targetUrl) => {
      try {
        const res = await fetch(targetUrl, { credentials: "include" });
        const text = await res.text();
        return { status: res.status, redirected: res.redirected, url: res.url, text };
      } catch (err) {
        return { error: err?.message || String(err) };
      }
    },
  });

  if (createdTab) {
    await chrome.tabs.remove(tabId);
  }

  if (!result || !result.result) return null;
  return result.result;
}

function looksLikeLoginPage(doc) {
  if (!doc) return true;
  const title = (doc.querySelector("title")?.textContent || "").toLowerCase();
  if (title.includes("login") || title.includes("dang nh?p")) return true;
  const bodyText = (doc.body?.textContent || "").slice(0, 500).toLowerCase();
  if (bodyText.includes("login") || bodyText.includes("dang nh?p")) return true;
  return false;
}

async function fetchHTML(url) {
  try {
    // Prefer content-script fetch first to stay in first-party context (avoid 403)
    const csResult = await fetchViaContentScript(url);
    if (csResult?.text) {
      const doc = new DOMParser().parseFromString(csResult.text, "text/html");
      if (!looksLikeLoginPage(doc)) {
        return doc;
      }
    }

    // Fallback to direct fetch
    const res = await fetch(url, { credentials: "include", redirect: "follow" });
    if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
      await STORAGE.set({ show_login_banner: true });
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      await STORAGE.set({ show_login_banner: true });
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (looksLikeLoginPage(doc)) {
      await STORAGE.set({ show_login_banner: true });
      return null;
    }
    return doc;
  } catch (error) {
    console.error("fetchHTML error:", error);
    await STORAGE.set({ show_login_banner: true });
    return null;
  }
}

// ---------- Simple cache (ms TTL) ----------
async function cacheGet(key, maxAgeMs) {
  const obj = await STORAGE.get(key, null);
  if (!obj) return null;
  const { ts, data } = obj;
  if (!ts || Date.now() - ts > maxAgeMs) return null;
  return data;
}
async function cacheSet(key, data) {
  await STORAGE.set({ [key]: { ts: Date.now(), data } });
}

// ---------- Transcript parsing ----------
function parseTranscriptDoc(doc) {
  const tables = [...doc.querySelectorAll("table")];
  for (const t of tables) {
    const trs = [...t.querySelectorAll("tr")];
    for (const tr of trs) {
      const labels = [...tr.children].map((td) => NORM(td.textContent));
      if (labels.includes("CREDIT") && labels.includes("GRADE")) {
        const header = [...tr.children].map((x) => NORM(x.textContent));
        const idx = {
          term: header.findIndex((v) => v === "TERM"),
          semester: header.findIndex((v) => v === "SEMESTER"),
          code: header.findIndex((v) => v.includes("SUBJECT CODE")),
          name: header.findIndex(
            (v) => v.includes("SUBJECT NAME") || v.includes("SUBJECT")
          ),
          credit: header.indexOf("CREDIT"),
          grade: header.indexOf("GRADE"),
          status: header.findIndex((v) => v === "STATUS"),
        };
        const all = [...t.querySelectorAll("tr")];
        const start = all.indexOf(tr) + 1;
        const rows = [];
        for (const r of all.slice(start)) {
          const tds = [...r.querySelectorAll("td")];
          if (!tds.length) continue;
          const row = {
            term: idx.term >= 0 ? tds[idx.term]?.textContent.trim() : "",
            semester:
              idx.semester >= 0 ? tds[idx.semester]?.textContent.trim() : "",
            code: idx.code >= 0 ? tds[idx.code]?.textContent.trim() : "",
            name: idx.name >= 0 ? tds[idx.name]?.textContent.trim() : "",
            credit: idx.credit >= 0 ? toNum(tds[idx.credit]?.textContent) : NaN,
            grade: idx.grade >= 0 ? toNum(tds[idx.grade]?.textContent) : NaN,
            status: idx.status >= 0 ? tds[idx.status]?.textContent.trim() : "",
          };
          if (!row.code && !row.name && !Number.isFinite(row.credit)) continue;
          rows.push(row);
        }
        return rows;
      }
    }
  }
  return [];
}

function computeGPA(items, excluded) {
  let sumC = 0,
    sumP = 0;
  for (const it of items) {
    const c = it.credit,
      g = it.grade,
      code = (it.code || "").toUpperCase();
    if (!Number.isFinite(c) || !Number.isFinite(g) || c <= 0 || g <= 0)
      continue;
    if (excluded.includes(code)) continue;
    sumC += c;
    sumP += c * g;
  }
  const g10 = sumC > 0 ? sumP / sumC : NaN;
  const g4 = Number.isFinite(g10) ? (g10 / 10) * 4 : NaN;
  return { gpa10: g10, gpa4: g4, credits: sumC };
}

// ---------- Attendance moved to modules/attendance.js ----------
const { parseScheduleOfWeek, renderAttendance, renderScheduleWeek, refreshAttendance, loadAttendanceAndSchedule, debugAttendanceData } = window.Attendance || {};

// ---------- Renderers ----------
async function renderTranscript(rows, excluded) {
  const g = computeGPA(rows, excluded);
  setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
  setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
  setValue("#credits", g.credits || "--");

  const tbody = document.querySelector("#tblCourses tbody");
  tbody.innerHTML = "";
  const q = (document.querySelector("#searchCourse").value || "").toLowerCase();

  // Load all notes from storage
  const allNotes = await STORAGE.get("course_notes", {});

  // Load excluded courses from storage
  const excludedCourses = await STORAGE.get("excluded_courses", []);

  // Update excluded count display
  const excludedCount = excludedCourses.length;
  setValue("#excludedCount", excludedCount);

  if (excludedCount > 0) {
    const excludedNames = excludedCourses.slice(0, 2).join(", ");
    const moreText =
      excludedCount > 2 ? ` và ${excludedCount - 2} môn khác` : "";
    setValue("#excludedDetail", `${excludedNames}${moreText}`);
  } else {
    setValue("#excludedDetail", "Không có môn nào");
  }

  rows.forEach((r) => {
    if (
      q &&
      !(
        String(r.code).toLowerCase().includes(q) ||
        String(r.name).toLowerCase().includes(q)
      )
    )
      return;

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
          <button class="note-toggle-btn ${hasNote ? "has-note" : ""
      }" data-code="${courseCode}" title="Ghi chú">
            ${hasNote ? "📝" : "📝"}
          </button>
        </td>
    `;

    // Note row (hidden by default)
    const noteRow = document.createElement("tr");
    noteRow.className = "note-row";
    noteRow.style.display = "none";
    noteRow.innerHTML = `
      <td colspan="6" class="note-cell">
        <textarea 
          class="course-note-input" 
          data-code="${courseCode}"
          placeholder="Ghi chú cho môn ${courseCode}... (Tự động lưu)"
          rows="3"
        >${allNotes[courseCode] || ""}</textarea>
      </td>
    `;

    tbody.appendChild(tr);
    tbody.appendChild(noteRow);

    // Toggle note on button click
    const toggleBtn = tr.querySelector(".note-toggle-btn");
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = noteRow.style.display !== "none";
      noteRow.style.display = isVisible ? "none" : "table-row";
      if (!isVisible) {
        noteRow.querySelector("textarea").focus();
      }
    });

    // Handle exclude checkbox
    const excludeCheckbox = tr.querySelector(".exclude-checkbox");
    excludeCheckbox.addEventListener("change", async (e) => {
      const courseCode = e.target.dataset.code;
      const isExcluded = e.target.checked;

      // Get current excluded courses
      const excludedCourses = await STORAGE.get("excluded_courses", []);

      if (isExcluded) {
        // Add to excluded list
        if (!excludedCourses.includes(courseCode)) {
          excludedCourses.push(courseCode);
        }
      } else {
        // Remove from excluded list
        const index = excludedCourses.indexOf(courseCode);
        if (index > -1) {
          excludedCourses.splice(index, 1);
        }
      }

      // Save updated list
      await STORAGE.set({ excluded_courses: excludedCourses });

      // Update UI
      tr.className = isExcluded ? "course-row excluded" : "course-row";

      // Recalculate and update GPA
      await renderTranscript(rows, excludedCourses);

      // Show toast
      Toast.success(
        isExcluded
          ? `Đã loại trừ ${courseCode} khỏi GPA`
          : `Đã thêm ${courseCode} vào GPA`
      );
    });

    // Auto-save on input
    const textarea = noteRow.querySelector("textarea");
    let saveTimeout;
    textarea.addEventListener("input", async () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const currentNotes = await STORAGE.get("course_notes", {});
        currentNotes[courseCode] = textarea.value;
        await STORAGE.set({ course_notes: currentNotes });

        // Update button icon
        const hasContent = textarea.value.trim();
        toggleBtn.textContent = hasContent ? "??" : "??";
        toggleBtn.classList.toggle("has-note", hasContent);

        Toast.success("�� luu note", "");
      }, 1000);
    });
  });
}

function summarizeAttendance(entries) {
  let present = 0,
    absent = 0,
    late = 0,
    neutral = 0;
  for (const e of entries) {
    if (!e) continue;
    const s = NORM(e.status || "");
    if (/ATTENDED|CÓ MẶT/.test(s)) present++;
    else if (/LATE|MUỘN/.test(s))
      late++; // muộn: không tính vắng, cũng không tính vào mẫu
    else if (/ABSENT|VẮNG/.test(s)) absent++; // vắng thực sự
    else if (/NOT YET/.test(s)) neutral++; // chưa diễn ra -> bỏ qua
  }
  const denom = present + absent; // chỉ tính khi tiết đã chặt hiện diện/vắng
  const rate = denom ? Math.round((present / denom) * 100) : 0;
  return {
    present,
    absent,
    late,
    rate,
    total: present + absent + late,
    neutral,
  };
}

function updateQuickAttendanceStats(entries) {
  console.log("=== updateQuickAttendanceStats ===");
  console.log("Entries:", entries);
  console.log("Entries length:", entries?.length);

  if (entries && entries.length > 0) {
    const stats = summarizeAttendance(entries);
    console.log("Attendance stats:", stats);
    setValue("#attRateQuick", stats.rate + "%");
    setValue("#quickAttendance", stats.rate + "%");
  } else {
    console.log("No attendance data, setting to --");
    setValue("#attRateQuick", "--");
    setValue("#quickAttendance", "--");
  }
}

async function updateAttendanceQuickStats() {
  try {
    const attCache = await cacheGet("cache_attendance", 10 * 60 * 1000);
    console.log("=== updateAttendanceQuickStats ===");
    console.log("Cache data:", attCache);
    console.log("Cache entries:", attCache?.entries);
    console.log("Cache entries length:", attCache?.entries?.length);

    if (attCache?.entries && attCache.entries.length > 0) {
      const stats = summarizeAttendance(attCache.entries);
      console.log("Computed stats:", stats);
      setValue("#attRateQuick", stats.rate + "%");
      setValue("#quickAttendance", stats.rate + "%");
    } else {
      console.log("No cache data, setting to --");
      setValue("#attRateQuick", "--");
      setValue("#quickAttendance", "--");
    }
  } catch (error) {
    console.error("Error updating attendance quick stats:", error);
    setValue("#attRateQuick", "--");
    setValue("#quickAttendance", "--");
  }
}

// renderAttendance moved to modules/attendance.js

function _renderScheduleToday_DEPRECATED(rows) {
  const tbody = document.querySelector("#tblScheduleToday tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4">Hôm nay không có tiết nào  (hoặc trang lịch khác định dạng).</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.time || ""}</td><td>${r.course || ""}</td><td>${r.room || ""
      }</td><td>${r.note || ""}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------- Loaders with caching ----------
const EXCLUDED_KEY = "__FAP_EXCLUDED_CODES__";
const EXCLUDED_DEFAULT = [
  "TRS501",
  "ENT503",
  "VOV114",
  "VOV124",
  "VOV134",
  "OTP101",
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function loadGPA() {
  // 24h cache: if cached data exists, use it; otherwise fetch and cache
  const cache = await cacheGet("cache_transcript", DAY_MS);
  let rows;
  if (cache && Array.isArray(cache.rows)) {
    rows = cache.rows;
  } else {
    const doc = await fetchHTML(DEFAULT_URLS.transcript);
    if (doc === null) {
      // Use cached data when login is required
      const cachedRows = await STORAGE.get("cache_transcript_flat", []);
      await STORAGE.set({ cache_transcript_fallback_ts: Date.now() });
      rows = cachedRows;
    } else {
      rows = parseTranscriptDoc(doc);
      await cacheSet("cache_transcript", { rows });
      await STORAGE.set({
        cache_transcript_flat: rows,
        cache_transcript_fallback_ts: null,
      });
      // Clear login banner flag and update last successful fetch time
      await STORAGE.set({
        show_login_banner: false,
        last_successful_fetch: Date.now(),
      });
    }
  }
  const excludedCourses = await STORAGE.get("excluded_courses", []);
  renderTranscript(rows, excludedCourses);
}

// refreshAttendance moved to modules/attendance.js

// loadAttendanceAndSchedule moved to modules/attendance.js

// ---------- Settings (UI <-> storage) ----------
const DEFAULT_CFG = {
  activeFrom: "07:00",
  activeTo: "17:40",
  delayMin: 10,
  delayMax: 30,
  pollEvery: 15,
};

async function loadSettingsUI() {
  const cfg = await STORAGE.get("cfg", DEFAULT_CFG);
  const get = (id) => document.getElementById(id);
  get("setActiveFrom").value = cfg.activeFrom || DEFAULT_CFG.activeFrom;
  get("setActiveTo").value = cfg.activeTo || DEFAULT_CFG.activeTo;
  get("setDelayMin").value = Number.isFinite(cfg.delayMin)
    ? cfg.delayMin
    : DEFAULT_CFG.delayMin;
  get("setDelayMax").value = Number.isFinite(cfg.delayMax)
    ? cfg.delayMax
    : DEFAULT_CFG.delayMax;
  get("setPollEvery").value = Number.isFinite(cfg.pollEvery)
    ? cfg.pollEvery
    : DEFAULT_CFG.pollEvery;
}

async function saveSettingsUI() {
  const get = (id) => document.getElementById(id);
  const currentCfg = await STORAGE.get("cfg", DEFAULT_CFG);
  const cfg = {
    ...currentCfg,
    activeFrom: get("setActiveFrom").value || DEFAULT_CFG.activeFrom,
    activeTo: get("setActiveTo").value || DEFAULT_CFG.activeTo,
    delayMin: Math.max(
      0,
      parseInt(get("setDelayMin").value || DEFAULT_CFG.delayMin, 10)
    ),
    delayMax: Math.max(
      0,
      parseInt(get("setDelayMax").value || DEFAULT_CFG.delayMax, 10)
    ),
    pollEvery: Math.max(
      5,
      parseInt(get("setPollEvery").value || DEFAULT_CFG.pollEvery, 10)
    ),
  };
  if (cfg.delayMax < cfg.delayMin) {
    const t = cfg.delayMin;
    cfg.delayMin = cfg.delayMax;
    cfg.delayMax = t;
  }
  await STORAGE.set({ cfg });
  // ping background to reschedule
  chrome.runtime.sendMessage({ type: "CFG_UPDATED" });
  Toast.success("�� luu c�i d?t");

}

// ---------- Buttons & Filters ----------
document
  .getElementById("btnOpenFAP")
  ?.addEventListener("click", () =>
    chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" })
  );
document
  .getElementById("btnOpenTranscript")
  ?.addEventListener("click", () =>
    chrome.tabs.create({ url: DEFAULT_URLS.transcript })
  );

// --- Quick bookmarks ---
const btnLMS = document.getElementById("btnOpenLMS");
if (btnLMS)
  btnLMS.addEventListener("click", () =>
    chrome.tabs.create({ url: "https://lms-hcm.fpt.edu.vn/" })
  );
const btnFAP2 = document.getElementById("btnOpenFAP2");
if (btnFAP2)
  btnFAP2.addEventListener("click", () =>
    chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" })
  );
const btnIT = document.getElementById("btnOpenIT");
if (btnIT)
  btnIT.addEventListener("click", () =>
    chrome.tabs.create({ url: "https://it-hcm.fpt.edu.vn/" })
  );

document
  .getElementById("btnOpenAttendance")
  ?.addEventListener("click", () =>
    chrome.tabs.create({ url: DEFAULT_URLS.scheduleOfWeek })
  );
document
  .getElementById("btnOpenSchedule")
  ?.addEventListener("click", () =>
    chrome.tabs.create({ url: DEFAULT_URLS.scheduleOfWeek })
  );

// Debounce helper for search inputs
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Apply debounced search
document
  .getElementById("searchCourse")
  ?.addEventListener("input", debounce(loadGPA, 300));
document.getElementById("searchAtt")?.addEventListener(
  "input",
  debounce(async () => {
    const c = await cacheGet("cache_attendance", 10 * 60 * 1000);
    renderAttendance(c?.entries || []);
  }, 300)
);
document.getElementById("filterDay")?.addEventListener("change", async () => {
  const c = await cacheGet("cache_attendance", 10 * 60 * 1000);
  renderAttendance(c?.entries || []);
});

document
  .getElementById("btnRefreshAttendance")
  ?.addEventListener("click", async function () {
    // Check login status first before loading data
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      // Show login banner and don't load data
      await checkAndShowLoginBanner();

      // Show notification that user needs to login first
      showLoginNotification();

      return;
    }

    // If logged in, proceed with loading data
    await handleRefreshWithLoading(this, async () => {
      await refreshAttendance();
      // Update last successful fetch time
      await STORAGE.set({ last_successful_fetch: Date.now() });
    });
  });
document
  .getElementById("btnRefreshSchedule")
  ?.addEventListener("click", async function () {
    // Check login status first before loading data
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      // Show login banner and don't load data
      await checkAndShowLoginBanner();

      // Show notification that user needs to login first
      showLoginNotification();

      return;
    }

    // If logged in, proceed with loading data
    await handleRefreshWithLoading(this, async () => {
      await refreshAttendance();
      // Update last successful fetch time
      await STORAGE.set({ last_successful_fetch: Date.now() });
    });
  });

// Settings buttons
document
  .getElementById("btnSaveSettings")
  ?.addEventListener("click", saveSettingsUI);
document
  .getElementById("btnTestNotify")
  ?.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "TEST_NOTIFY" })
  );

// Tabs
// Liquid Glass Tab Indicator - iOS 26 Style with Draggable
function initLiquidGlassTabs() {
  const indicator = document.querySelector(".tab-indicator");
  const tabsContainer = document.querySelector(".tabs");
  const buttons = document.querySelectorAll(".tabs button");

  if (!indicator || !tabsContainer || buttons.length === 0) {
    console.error("Tabs not initialized properly");
    return;
  }

  let isDragging = false;
  let dragStartX = 0;
  let indicatorStartLeft = 0;

  // Function to move indicator to active tab
  function moveIndicator(button, instant = false) {
    // Get scroll position
    const scrollLeft = tabsContainer.scrollLeft;

    // Get button position relative to tabs container
    const buttonRect = button.getBoundingClientRect();
    const tabsRect = tabsContainer.getBoundingClientRect();

    // Calculate left position (accounting for scroll and padding)
    const left = buttonRect.left - tabsRect.left + scrollLeft;
    const width = buttonRect.width;

    if (instant) {
      indicator.style.transition = "none";
    }

    indicator.style.left = `${left}px`;
    indicator.style.width = `${width}px`;

    if (instant) {
      // Force reflow to apply no-transition
      indicator.offsetHeight;
      indicator.style.transition = "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
    }
  }

  // Function to set indicator position by pixel value
  function setIndicatorPosition(left, width) {
    indicator.style.left = `${left}px`;
    indicator.style.width = `${width}px`;
  }

  // Find closest tab to a given x position
  function findClosestTab(xPos) {
    let closestBtn = null;
    let minDistance = Infinity;

    buttons.forEach((btn) => {
      const rect = btn.getBoundingClientRect();
      const tabsRect = tabsContainer.getBoundingClientRect();
      const btnCenter =
        rect.left - tabsRect.left + rect.width / 2 + tabsContainer.scrollLeft;
      const distance = Math.abs(btnCenter - xPos);

      if (distance < minDistance) {
        minDistance = distance;
        closestBtn = btn;
      }
    });

    return closestBtn;
  }

  // Initialize indicator position on first active tab
  const activeButton = document.querySelector(".tabs button.active");
  if (activeButton) {
    moveIndicator(activeButton, true);
  }

  // Handle clicks anywhere on tabs - indicator flies to clicked position
  tabsContainer.addEventListener("click", (e) => {
    if (isDragging) return; // Don't handle clicks while dragging

    // Don't handle if clicking on indicator itself
    if (e.target === indicator || indicator.contains(e.target)) return;

    // Create ripple effect at click position
    const ripple = document.createElement("div");
    ripple.style.cssText = `
      position: absolute;
      width: 20px;
      height: 20px;
      background: rgba(96, 165, 250, 0.4);
      border-radius: 50%;
      pointer-events: none;
      animation: rippleEffect 0.6s ease-out;
      left: ${e.clientX - tabsContainer.getBoundingClientRect().left - 10}px;
      top: ${e.clientY - tabsContainer.getBoundingClientRect().top - 10}px;
      z-index: 5;
    `;
    tabsContainer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    // Get click position relative to tabs container
    const tabsRect = tabsContainer.getBoundingClientRect();
    const clickX = e.clientX - tabsRect.left + tabsContainer.scrollLeft;

    // Find closest tab to click position
    const closestButton = findClosestTab(clickX);

    if (!closestButton) return;

    // Remove active class from all buttons
    buttons.forEach((b) => b.classList.remove("active"));

    // Add active class to closest button
    closestButton.classList.add("active");

    // Move indicator to closest button with animation
    moveIndicator(closestButton);

    // Scroll button into view if needed
    closestButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });

    // Get the tab ID from data-tab attribute
    const id = closestButton.dataset.tab;

    // Hide all tab content sections
    document
      .querySelectorAll(".tab")
      .forEach((s) => s.classList.remove("active"));

    // Show the selected tab content
    document.getElementById(id).classList.add("active");
  });

  // Draggable indicator functionality
  indicator.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    indicatorStartLeft = parseFloat(indicator.style.left) || 0;

    // Disable transition while dragging
    indicator.style.transition = "none";
    indicator.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const newLeft = indicatorStartLeft + deltaX;

    // Get bounds
    const tabsRect = tabsContainer.getBoundingClientRect();
    const maxLeft =
      tabsContainer.scrollWidth - parseFloat(indicator.style.width);

    // Constrain within bounds
    const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));

    setIndicatorPosition(constrainedLeft, parseFloat(indicator.style.width));

    // Highlight closest tab while dragging
    const closestTab = findClosestTab(
      constrainedLeft + parseFloat(indicator.style.width) / 2
    );
    if (closestTab) {
      buttons.forEach((b) => b.classList.remove("hover-preview"));
      closestTab.classList.add("hover-preview");
    }
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;

    isDragging = false;
    indicator.style.cursor = "grab";
    document.body.style.userSelect = "";

    // Find closest tab and snap to it
    const currentLeft = parseFloat(indicator.style.left);
    const currentWidth = parseFloat(indicator.style.width);
    const centerX = currentLeft + currentWidth / 2;

    const closestTab = findClosestTab(centerX);

    if (closestTab) {
      // Remove active from all
      buttons.forEach((b) => {
        b.classList.remove("active");
        b.classList.remove("hover-preview");
      });

      // Set new active
      closestTab.classList.add("active");

      // Re-enable transition
      indicator.style.transition = "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";

      // Snap to closest tab
      moveIndicator(closestTab);

      // Switch tab content
      const id = closestTab.dataset.tab;
      document
        .querySelectorAll(".tab")
        .forEach((s) => s.classList.remove("active"));
      document.getElementById(id).classList.add("active");

      // Scroll into view
      closestTab.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  });

  // Update indicator position on window resize
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const activeBtn = document.querySelector(".tabs button.active");
      if (activeBtn) {
        moveIndicator(activeBtn, true);
      }
    }, 100);
  });

  // Update indicator position on tabs scroll - REALTIME!
  tabsContainer.addEventListener("scroll", () => {
    if (isDragging) return; // Don't update while dragging

    const activeBtn = document.querySelector(".tabs button.active");
    if (activeBtn) {
      // Disable transition for smooth scroll following
      indicator.style.transition = "none";
      moveIndicator(activeBtn);

      // Re-enable transition after a short delay
      clearTimeout(tabsContainer._scrollTimer);
      tabsContainer._scrollTimer = setTimeout(() => {
        indicator.style.transition =
          "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
      }, 150);
    }
  });

  // Set initial cursor
  indicator.style.cursor = "grab";
}

// Initialize on load
initLiquidGlassTabs();

// Reinitialize tabs
setTimeout(() => {
  initLiquidGlassTabs();
  // Force update indicator position to first tab
  const firstTab = document.querySelector(".tabs button.active");
  if (firstTab) {
    const indicator = document.querySelector(".tab-indicator");
    const tabsContainer = document.querySelector(".tabs");
    if (indicator && tabsContainer) {
      const buttonRect = firstTab.getBoundingClientRect();
      const tabsRect = tabsContainer.getBoundingClientRect();
      const left = buttonRect.left - tabsRect.left + tabsContainer.scrollLeft;
      const width = buttonRect.width;
      indicator.style.left = `${left}px`;
      indicator.style.width = `${width}px`;
    }
  }
}, 100);

(async function init() {
  await Promise.all([
    loadGPA(),
    loadAttendanceAndSchedule(),
    loadSettingsUI(),
    loadExams(),
    loadStatistics(),
    initGPACalculator(),
  ]);

  // Check login status and show banner if needed
  await checkLoginStatus();
  await checkAndShowLoginBanner();

  // Also check for updates on popup open
  // Auto update check disabled to avoid GitHub API rate limit
  // try {
  //   await checkUpdate(true);
  // } catch (e) {
  //   console.log("Update check failed:", e);
  // }

  // Set up periodic login status check (every 5 minutes)
  setInterval(async () => {
    await checkLoginStatus();
    await checkAndShowLoginBanner();
  }, 5 * 60 * 1000);

  // Check login status when popup becomes visible
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      await checkLoginStatus();
      await checkAndShowLoginBanner();
    }
  });

  // Check login status when window gains focus
  window.addEventListener("focus", async () => {
    await checkLoginStatus();
    await checkAndShowLoginBanner();
  });

  // Check login status when user clicks on any tab
  document.addEventListener("click", async (e) => {
    if (e.target.closest(".tabs button[data-tab]")) {
      setTimeout(async () => {
        await checkLoginStatus();
        await checkAndShowLoginBanner();
      }, 1000); // Check after 1 second
    }
  });

  // Check login status when user clicks on any refresh button
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[id*='refresh'], [id*='Refresh']")) {
      const isLoggedIn = await checkLoginStatus();
      if (!isLoggedIn) {
        await checkAndShowLoginBanner();

        // Show notification that user needs to login first
        showLoginNotification();
      }
    }
  });

  // Check login status when user clicks on any open FAP button
  document.addEventListener("click", async (e) => {
    if (
      e.target.closest(
        "[id*='OpenFAP'], [id*='OpenTranscript'], [id*='OpenAttendance'], [id*='OpenSchedule'], [id*='OpenExams']"
      )
    ) {
      const isLoggedIn = await checkLoginStatus();
      if (!isLoggedIn) {
        await checkAndShowLoginBanner();

        // Show notification that user needs to login first
        showLoginNotification();
      }
    }
  });

  // Check login status when user clicks on any export button
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[id*='Export'], [id*='export']")) {
      const isLoggedIn = await checkLoginStatus();
      if (!isLoggedIn) {
        await checkAndShowLoginBanner();

        // Show notification that user needs to login first
        showLoginNotification();
      }
    }
  });

  // Check login status when user clicks on any copy button
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[id*='Copy'], [id*='copy']")) {
      const isLoggedIn = await checkLoginStatus();
      if (!isLoggedIn) {
        await checkAndShowLoginBanner();

        // Show notification that user needs to login first
        showLoginNotification();
      }
    }
  });

  // Check login status when user clicks on any calculate button
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[id*='Calculate'], [id*='calculate']")) {
      const isLoggedIn = await checkLoginStatus();
      if (!isLoggedIn) {
        await checkAndShowLoginBanner();

        // Show notification that user needs to login first
        showLoginNotification();
      }
    }
  });

  // Check login status when user clicks on any reset button
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[id*='Reset'], [id*='reset']")) {
      const isLoggedIn = await checkLoginStatus();
      if (!isLoggedIn) {
        await checkAndShowLoginBanner();

        // Show notification that user needs to login first
        showLoginNotification();
      }
    }
  });

  // Check login status when user scrolls (indicates activity)
  let scrollTimeout;
  document.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(async () => {
      await checkLoginStatus();
      await checkAndShowLoginBanner();
    }, 2000); // Check after 2 seconds of no scrolling
  });

  // Login status click handler - Check update and open FAP
  const loginStatus = document.getElementById("loginStatus");
  if (loginStatus) {
    loginStatus.addEventListener("click", async () => {
      // Check for updates first
      // Auto update check disabled to avoid GitHub API rate limit
      // try {
      //   await checkUpdate(true);
      // } catch (e) {
      //   console.log("Update check failed:", e);
      // }

      // Then open FAP
      chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" });
    });
  }

  // Auto update check disabled to avoid GitHub API rate limit
  // try {
  //   await checkUpdate();
  // } catch (e) {}

  // Render update button without checking for updates
  const curr = chrome.runtime.getManifest().version;
  renderUpdateButton(0, curr, curr); // 0 means no update available
})();

// Refresh-all: clear caches and reload
document
  .getElementById("btnRefreshAll")
  ?.addEventListener("click", async function () {
    // Show confirmation before clearing cache
    const confirmed = await Modal.confirm(
      "Xóa cache và tải lại dữ liệu?\n\nDữ liệu cũ sẽ bị xóa và fetch lại từ FAP.",
      { title: "Xác nhận làm mới", confirmText: "Làm mới", icon: "🔄" }
    );

    if (!confirmed) return;

    // Check login status first before loading data
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      // Show login banner and don't load data
      await checkAndShowLoginBanner();

      // Show notification that user needs to login first
      showLoginNotification();

      return;
    }

    // If logged in, proceed with loading data
    await handleRefreshWithLoading(this, async () => {
      await STORAGE.remove("cache_transcript");
      await STORAGE.remove("cache_transcript_flat");
      await STORAGE.remove("cache_attendance");
      await STORAGE.remove("cache_attendance_flat");
      await STORAGE.remove("cache_exams");
      await STORAGE.remove("cache_exams_flat");
      await Promise.all([loadGPA(), refreshAttendance(), loadExams()]);

      // Update last successful fetch time
      await STORAGE.set({
        last_successful_fetch: Date.now(),
        cache_reset_ts: Date.now(),
      });
    });
  });

// renderScheduleWeek now in modules/attendance.js
// ===== Export All to PDF =====
async function exportAllPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("vi-VN");
  function addHeaderFooter() {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`FAP GPA Viewer � Dashboard | Xu?t ng�y: ${today}`, 14, 10);
      doc.text(
        `Trang ${i} / ${pageCount}`,
        doc.internal.pageSize.getWidth() - 40,
        doc.internal.pageSize.getHeight() - 10
      );
    }
  }
  const logo = await fetch(
    chrome.runtime.getURL("assets/icons/icon128.png")
  )
    .then((r) => r.blob())
    .then(
      (b) =>
        new Promise((res) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => res(reader.result));
          reader.readAsDataURL(b);
        })
    );
  doc.addImage(logo, "PNG", 15, 20, 30, 30);
  doc.setFontSize(18);
  doc.text("FAP GPA Viewer � Dashboard", 55, 30);
  doc.setFontSize(12);
  doc.text(
    "M?t Chrome Extension gi�p sinh vi�n FPT University theo d�i GPA, l?ch h?c, di?m danh v� nh?c nh? t? d?ng.",
    15,
    60
  );
  doc.addPage();
  const transcript = await STORAGE.get("cache_transcript", null);
  if (transcript?.rows?.length) {
    doc.setFontSize(16);
    doc.text("Transcript", 14, 20);
    doc.autoTable({
      startY: 25,
      head: [["Code", "Name", "Credit", "Grade", "Status"]],
      body: transcript.rows.map((r) => [
        r.code,
        r.name,
        r.credit,
        r.grade,
        r.status,
      ]),
    });
    doc.addPage();
  }
  const att = await STORAGE.get("cache_attendance", null);
  if (att?.entries?.length) {
    doc.setFontSize(16);
    doc.text("Attendance", 14, 20);
    doc.autoTable({
      startY: 25,
      head: [["Date", "Day", "Slot", "Course", "Status"]],
      body: att.entries.map((e) => [e.date, e.day, e.slot, e.course, e.status]),
    });
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Schedule (Week)", 14, 20);
    doc.autoTable({
      startY: 25,
      head: [["Day", "Date", "Slot", "Time", "Course", "Room", "Status"]],
      body: att.entries.map((e) => [
        e.day,
        e.date,
        e.slot,
        e.time || "",
        e.course,
        e.room || "",
        e.status || "",
      ]),
    });
    doc.addPage();
  }
  const cfg = await STORAGE.get("cfg", {});
  doc.setFontSize(16);
  doc.text("Settings", 14, 20);
  doc.autoTable({
    startY: 25,
    head: [["Key", "Value"]],
    body: Object.entries(cfg).map(([k, v]) => [k, String(v)]),
  });
  addHeaderFooter();
  doc.save("fap_dashboard_all.pdf");
}

// G?n v�o n�t Export PDF n?u c�
const btnExportPDF = document.getElementById("btnExportPDF");
if (btnExportPDF) btnExportPDF.addEventListener("click", exportAllPDF);

//exam btn
document
  .getElementById("btnOpenExams")
  ?.addEventListener("click", () =>
    chrome.tabs.create({ url: DEFAULT_URLS.examSchedule })
  );

document
  .getElementById("btnRefreshExams")
  ?.addEventListener("click", async function () {
    // Check login status first before loading data
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      // Show login banner and don't load data
      await checkAndShowLoginBanner();

      // Show notification that user needs to login first
      showLoginNotification();

      return;
    }

    // If logged in, proceed with loading data
    await handleRefreshWithLoading(this, async () => {
      await STORAGE.remove("cache_exams");
      await loadExams();
      // Update last successful fetch time
      await STORAGE.set({ last_successful_fetch: Date.now() });
    });
  });

function dayToVietnamese(day) {
  const map = {
    MON: "Th? 2",
    TUE: "Th? 3",
    WED: "Th? 4",
    THU: "Th? 5",
    FRI: "Th? 6",
    SAT: "Th? 7",
    SUN: "Ch? nh?t",
  };
  return map[day] || day;
}
// === Export PDF via printable report page (no external libs needed) ===
(function () {
  const btn = document.getElementById("btnExportPDF");
  if (btn) {
    btn.addEventListener("click", () =>
      chrome.tabs.create({
        url: chrome.runtime.getURL("pages/report.html"),
      })
    );
  }
})();

// ---------- Parse Exam Schedule ----------
function parseExamScheduleDoc(doc) {
  const exams = [];
  const tables = [...doc.querySelectorAll("table")];
  let examTable = null;

  // 1. T�m d�ng b?ng ch?a l?ch thi
  for (const table of tables) {
    const tableText = (table.textContent || "").toLowerCase();
    if (
      tableText.includes("subjectcode") &&
      tableText.includes("date of publication")
    ) {
      examTable = table;
      break;
    }
  }

  if (!examTable) {
    console.log("Không tìm thấy bảng lịch thi.");
    return [];
  }

  // 2. L?y t?t c? c�c h�ng, t�m h�ng ti�u d? v� ch? x? l� c�c h�ng d? li?u sau d�
  const allRows = [...examTable.querySelectorAll("tr")];
  let headerRowIndex = -1;

  // T�m v? tr� c?a h�ng ti�u d? (h�ng ch?a "SubjectCode")
  for (let i = 0; i < allRows.length; i++) {
    const rowText = (allRows[i].textContent || "").toLowerCase();
    if (rowText.includes("subjectcode")) {
      headerRowIndex = i;
      break;
    }
  }

  // N?u kh�ng t�m th?y header, kh�ng l�m g� c?
  if (headerRowIndex === -1) {
    console.log("Kh�ng t�m th?y h�ng ti�u d? trong b?ng l?ch thi.");
    return [];
  }

  const dataRows = allRows.slice(headerRowIndex + 1); // Ch? l?y c�c h�ng sau h�ng ti�u d?
  // 3. Trích xuất dữ liệu từ các hàng đã lọc
  for (const row of dataRows) {
    const cells = [...row.querySelectorAll("td")];
    if (cells.length < 9) continue; // B? qua n?u h�ng kh�ng d? 9 c?t nhu tr�n web

    const examData = {
      no: cells[0]?.textContent.trim() || "",
      code: cells[1]?.textContent.trim() || "",
      name: cells[2]?.textContent.trim() || "",
      date: cells[3]?.textContent.trim() || "",
      room: cells[4]?.textContent.trim() || "",
      time: cells[5]?.textContent.trim() || "",
      form: cells[6]?.textContent.trim() || "",
      type: cells[7]?.textContent.trim() || "",
      publishDate: cells[8]?.textContent.trim() || "",
    };

    // Ch? th�m v�o n?u c� m� m�n h?c
    if (examData.code) {
      exams.push(examData);
    }
  }
  return exams;
}

// ---------- Renderer for Exam Schedule ----------
function renderExamSchedule(exams) {
  const tbody = document.querySelector("#tblExams tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!exams || exams.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="6" style="text-align: center; color: var(--muted)">Kh�ng c� l?ch thi.</td>';
    tbody.appendChild(tr);
    return;
  }

  exams.forEach((exam) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${exam.code}</td>
      <td>${exam.name}</td>
      <td>${exam.date}</td>
      <td>${exam.time}</td>
      <td>${exam.room}</td>
      <td>${exam.form}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Loader for Exams with caching ----------
async function loadExams() {
  const cache = await cacheGet("cache_exams", DAY_MS); // Cache 24h
  let exams;
  if (cache && Array.isArray(cache.exams)) {
    exams = cache.exams;
  } else {
    const doc = await fetchHTML(DEFAULT_URLS.examSchedule);
    if (doc === null) {
      // Use cached data when login is required
      const cachedExams = await STORAGE.get("cache_exams_flat", []);
      await STORAGE.set({ cache_exams_fallback_ts: Date.now() });
      exams = cachedExams;
    } else {
      exams = parseExamScheduleDoc(doc);
      await cacheSet("cache_exams", { exams });
      await STORAGE.set({
        cache_exams_flat: exams,
        cache_exams_fallback_ts: null,
      });
      // Clear login banner flag and update last successful fetch time
      await STORAGE.set({
        show_login_banner: false,
        last_successful_fetch: Date.now(),
      });
    }
  }
  renderExamSchedule(exams);
}

// === Login Banner Functions ===
async function checkAndShowLoginBanner() {
  // Check multiple indicators to determine if login is needed
  const showBanner = await STORAGE.get("show_login_banner", false);
  const lastFetchTime = await STORAGE.get("last_successful_fetch", 0);
  const now = Date.now();

  // Show banner if:
  // 1. Flag is explicitly set to true, OR
  // 2. No successful fetch in the last 10 minutes (likely means login expired)
  const shouldShow =
    showBanner || (lastFetchTime > 0 && now - lastFetchTime > 10 * 60 * 1000);

  if (shouldShow) {
    showLoginBanner();
  } else {
    hideLoginBanner();
  }
}

function showLoginBanner() {
  const banner = document.getElementById("loginBanner");
  if (banner) {
    banner.style.display = "block";
    banner.classList.add("slideDown");
  }
}

function hideLoginBanner() {
  const banner = document.getElementById("loginBanner");
  if (banner) {
    banner.style.display = "none";
    banner.classList.remove("slideDown");
  }
}

async function handleLoginNow() {
  const loginUrl = "https://fap.fpt.edu.vn/";
  chrome.tabs.create({ url: loginUrl });
  hideLoginBanner();
  await STORAGE.set({ show_login_banner: false });

  // Check login status after a delay to see if user logged in
  setTimeout(async () => {
    await checkLoginStatus();
    await checkAndShowLoginBanner();
  }, 3000); // Check after 3 seconds
}

async function handleDismissBanner() {
  hideLoginBanner();
  await STORAGE.set({ show_login_banner: false });
}

// Simple notification function (disabled)
function showLoginNotification() {
  // notifications removed
}


// Function to update login status display
function updateLoginStatusDisplay(isLoggedIn, isChecking = false) {
  const loginStatus = document.getElementById("loginStatus");
  const loginStatusIcon = document.getElementById("loginStatusIcon");
  const loginStatusTitle = document.getElementById("loginStatusTitle");
  const statusDot = document.getElementById("statusDot");

  if (!loginStatus) return;

  // Remove all status classes
  loginStatus.classList.remove("logged-in", "logged-out", "checking");

  if (isChecking) {
    loginStatus.classList.add("checking");
    loginStatusIcon.textContent = ""; // Clear content for CSS spinner
    loginStatusTitle.textContent = "Ki?m tra...";
  } else if (isLoggedIn) {
    loginStatus.classList.add("logged-in");
    loginStatusIcon.textContent = "?";
    loginStatusTitle.textContent = "�� dang nh?p";
  } else {
    loginStatus.classList.add("logged-out");
    loginStatusIcon.textContent = "?";
    loginStatusTitle.textContent = "Chua dang nh?p";
  }
}

// Function to actively check login status
async function checkLoginStatus() {
  // Show checking status
  updateLoginStatusDisplay(false, true);

  // Also check for updates while checking login status
  // Auto update check disabled to avoid GitHub API rate limit
  // try {
  //   await checkUpdate(true);
  // } catch (e) {
  //   console.log("Update check failed:", e);
  // }

  try {
    const testUrl = "https://fap.fpt.edu.vn/Student.aspx";
    const csResult = await fetchViaContentScript(testUrl);

    const doc =
      csResult?.text &&
      new DOMParser().parseFromString(csResult.text, "text/html");

    if (!doc || looksLikeLoginPage(doc)) {
      await STORAGE.set({ show_login_banner: true });
      updateLoginStatusDisplay(false, false);
      return false;
    }

    await STORAGE.set({
      show_login_banner: false,
      last_successful_fetch: Date.now(),
    });
    updateLoginStatusDisplay(true, false);
    return true;
  } catch (error) {
    // On error, assume we need to login
    await STORAGE.set({ show_login_banner: true });
    updateLoginStatusDisplay(false, false);
    return false;
  }
}

// === Loading States cho Refresh Buttons ===
const loadingStyles = `
/* Custom Scrollbar - M?ng v� d?p hon */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}

/* Firefox scrollbar */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border) var(--bg);
}

@keyframes spin {
  0% { transform: translateY(-50%) rotate(0deg); }
  100% { transform: translateY(-50%) rotate(360deg); }
}

.btn-loading {
  position: relative;
  pointer-events: none;
  opacity: 0.7;
  padding-left: 32px !important;
}

.btn-loading::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 50%;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  transform-origin: center center;
}

.btn-success,
.btn-error {
  position: relative;
  padding-left: 32px !important;
}

.btn-success::before {
  content: '✓';
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #10b981;
  font-size: 18px;
  font-weight: bold;
  line-height: 1;
}

.btn-error::before {
  content: '✗';
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #ef4444;
  font-size: 18px;
  font-weight: bold;
  line-height: 1;
}
`;

const styleEl = document.createElement("style");
styleEl.textContent = loadingStyles;
document.head.appendChild(styleEl);

async function handleRefreshWithLoading(btn, fn) {
  // Remove any previous states
  btn.classList.remove("btn-success", "btn-error");

  // Store original text and add loading state
  const orig = btn.textContent;
  btn.classList.add("btn-loading");
  btn.textContent = "Đang tải... ";

  try {
    await fn();

    // Success state
    btn.classList.remove("btn-loading");
    btn.classList.add("btn-success");
    btn.textContent = "Thành công!";

    setTimeout(() => {
      btn.classList.remove("btn-success");
      btn.textContent = orig;
    }, 2000);
  } catch (e) {
    // Error state
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

// === Copy GPA Button ===
const btnCopyGPA = document.getElementById("btnCopyGPA");
if (btnCopyGPA) {
  btnCopyGPA.addEventListener("click", async function () {
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

      // Show success feedback
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
}

// === Reset Excluded Courses Button ===
const btnResetExcluded = document.getElementById("btnResetExcluded");
if (btnResetExcluded) {
  btnResetExcluded.addEventListener("click", async function () {
    const confirmed = await Modal.confirm(
      "Reset danh sách môn loại trừ\n\nTất cả môn sẽ được tính vào GPA trở khi bạn chọn loại trừ lại.",
      "Reset loại trừ môn"
    );

    if (confirmed) {
      // Clear all excluded courses
      await STORAGE.set({ excluded_courses: [] });

      // Reload transcript to update UI
      await loadGPA();

      Toast.success("✅ Đã reset danh sách môn loại trừ!");
    }
  });
}

// === Set Default Excluded Courses Button ===
const btnSetDefaultExcluded = document.getElementById("btnSetDefaultExcluded");
if (btnSetDefaultExcluded) {
  btnSetDefaultExcluded.addEventListener("click", async function () {
    const confirmed = await Modal.confirm(
      "Set mặc định loại trừ\n\nSẽ loại trừ TRS501, ENT503, VOV114 khỏi GPA (theo chuẩn FPT).",
      "Set mặc định loại trừ"
    );

    if (confirmed) {
      // Set default excluded courses
      await STORAGE.set({ excluded_courses: EXCLUDED_DEFAULT });

      // Reload transcript to update UI
      await loadGPA();

      Toast.success("✅ Đã set mặc định loại trừ môn!");
    }
  });
}

// Export function
window.handleRefreshWithLoading = handleRefreshWithLoading;

// ===== DARK MODE TOGGLE =====
(async function initDarkMode() {
  const theme = await STORAGE.get("theme", "dark");
  document.documentElement.setAttribute("data-theme", theme);

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", async () => {
      const current = document.documentElement.getAttribute("data-theme");
      const newTheme = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      await STORAGE.set({ theme: newTheme });

      // Re-render chart with new theme colors
      if (gpaChartInstance) {
        await loadStatistics();
      }
    });
  }
})();

// ===== TODAY'S SCHEDULE WITH COUNTDOWN =====
async function loadTodaySchedule() {
  try {
    console.log("🔄 Loading today's schedule...");

    // Check if widget container exists, retry if not
    const container = document.getElementById("todayClasses");
    if (!container) {
      console.warn(
        "⚠️ Today's schedule container not found, retrying in 1s..."
      );
      setTimeout(loadTodaySchedule, 1000);
      return;
    }

    // Try multiple cache sources with better fallback
    let entries = [];

    // Try main cache first (increased TTL to 30 minutes)
    const cache = await cacheGet("cache_attendance", 30 * 60 * 1000);
    if (cache?.entries && cache.entries.length > 0) {
      entries = cache.entries;
      console.log(`📦 Using main cache: ${entries.length} entries`);
    } else {
      // Fallback to flat cache
      entries = await STORAGE.get("cache_attendance_flat", []);
      await STORAGE.set({ cache_attendance_fallback_ts: Date.now() });
      console.log(`?? Using flat cache: ${entries.length} entries`);

      // If still empty, try to refresh
      if (entries.length === 0) {
        console.log("?? No cache data, attempting refresh...");
        try {
          await refreshAttendance();
          // Retry with fresh data
          const newCache = await cacheGet("cache_attendance", 30 * 60 * 1000);
          entries = newCache?.entries || [];
          console.log(`🔄 After refresh: ${entries.length} entries`);
        } catch (refreshError) {
          console.error("❌ Refresh failed:", refreshError);
          // Show error message instead of silent fail
          container.innerHTML =
            '<div class="no-class">❌ Không thể tải lịch học. Vui lòng thử lại.</div>';
          return;
        }
      }
    }

    // Improved date parsing with multiple format support
    const todayClasses = findTodayClasses(entries);
    console.log(`📅 Found ${todayClasses.length} classes for today`);

    if (todayClasses.length === 0) {
      container.innerHTML =
        '<div class="no-class">Hôm nay không có lịch học!</div>';
      return;
    }

    // Sort classes by slot
    const sortedClasses = todayClasses.sort((a, b) => {
      const slotA = parseInt((a.slot || "").replace(/\D/g, "") || "999");
      const slotB = parseInt((b.slot || "").replace(/\D/g, "") || "999");
      return slotA - slotB;
    });

    container.innerHTML = "";
    sortedClasses.forEach((cls) => {
      const item = document.createElement("div");
      item.className = "class-item";

      const countdown = getTimeUntilClass(cls.time);

      item.innerHTML = `
        <div class="class-info">
          <div class="class-time">${cls.time || cls.slot}</div>
          <div class="class-course">${cls.course} - ${cls.room || "N/A"}</div>
        </div>
        <div class="class-countdown">${countdown}</div>
      `;
      container.appendChild(item);
    });

    console.log("✅ Today's schedule loaded successfully");
  } catch (error) {
    console.error("❌ Error loading today's schedule:", error);
    const container = document.getElementById("todayClasses");
    if (container) {
      container.innerHTML =
        '<div class="no-class">?? L?i t?i l?ch h?c. Vui l�ng th? l?i.</div>';
    }
  }
}

// Helper function to find today's classes with multiple date format support
function findTodayClasses(entries) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");

  // Try different date formats
  const formats = [
    `${dd}/${mm}`, // 15/12
    `${today.getDate()}/${mm}`, // 15/12 (no padding)
    `${dd}/${today.getMonth() + 1}`, // 15/12 (no padding)
    `${today.getDate()}/${today.getMonth() + 1}`, // 15/12 (no padding)
  ];

  console.log("?? Searching for today's classes with formats:", formats);

  for (const format of formats) {
    const matches = entries.filter((e) => e.date === format);
    if (matches.length > 0) {
      console.log(`? Found ${matches.length} classes with format: ${format}`);
      return matches;
    }
  }

  console.log("? No classes found for any date format");
  return [];
}

function getTimeUntilClass(timeStr) {
  if (!timeStr || !timeStr.includes("-")) return "?";

  const startTime = timeStr.split("-")[0].trim();
  const [hour, minute] = startTime.split(":").map(Number);

  const now = new Date();
  const classTime = new Date();
  classTime.setHours(hour, minute, 0, 0);

  const diff = classTime - now;

  if (diff < 0) {
    return "⏰ đã qua";
  } else if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / 60000);
    return `⏰ ${minutes} phút nữa`;
  } else {
    const hours = Math.floor(diff / 3600000);
    return `⏰ ${hours}h nữa`;
  }
}

// Update countdown every minute
setInterval(() => {
  const activeTab = document.querySelector(".tab.active");
  if (activeTab && activeTab.id === "tab-today") {
    loadTodaySchedule();
  }
}, 60000);

// ===== GPA CALCULATOR =====
async function initGPACalculator() {
  const cache = await cacheGet("cache_transcript", DAY_MS);
  if (!cache || !cache.rows) return;

  const excludedCourses = await STORAGE.get("excluded_courses", []);
  const gpa = computeGPA(cache.rows, excludedCourses);

  setValue(
    "#calcCurrentGPA",
    Number.isFinite(gpa.gpa10) ? gpa.gpa10.toFixed(2) : "--"
  );
  setValue("#calcCurrentCredits", gpa.credits || "--");
}

document
  .getElementById("btnCalculateGPA")
  ?.addEventListener("click", async () => {
    const currentGPA = parseFloat(
      document.getElementById("calcCurrentGPA").textContent
    );
    const currentCredits = parseFloat(
      document.getElementById("calcCurrentCredits").textContent
    );
    const targetGPA = parseFloat(
      document.getElementById("calcTargetGPA")?.value || "0"
    );
    const newCredits = parseFloat(
      document.getElementById("calcNewCredits")?.value || "0"
    );

    if (
      isNaN(currentGPA) ||
      isNaN(currentCredits) ||
      isNaN(targetGPA) ||
      isNaN(newCredits)
    ) {
      document.getElementById("calcResult").textContent = "Nhập đầy đủ!";
      return;
    }

    if (targetGPA < 0 || targetGPA > 10) {
      document.getElementById("calcResult").textContent = "GPA 0-10!";
      return;
    }

    // Formula: (current_gpa * current_credits + required_grade * new_credits) / (current_credits + new_credits) = target_gpa
    // => required_grade = (target_gpa * (current_credits + new_credits) - current_gpa * current_credits) / new_credits

    const requiredGrade =
      (targetGPA * (currentCredits + newCredits) -
        currentGPA * currentCredits) /
      newCredits;

    const resultEl = document.getElementById("calcResult");
    // Remove old color classes
    resultEl.classList.remove("calc-success", "calc-warning", "calc-error");

    if (requiredGrade > 10) {
      resultEl.textContent = "Không khả thi 😢";
      resultEl.classList.add("calc-error");
    } else {
      // Always show the required grade, even if it's negative or very low
      resultEl.textContent = requiredGrade.toFixed(2);
      
      if (requiredGrade < 0) {
        // If negative, it means target is already achieved
        resultEl.classList.add("calc-success");
      } else if (requiredGrade >= 8) {
        resultEl.classList.add("calc-warning");
      } else {
        resultEl.classList.add("calc-success");
      }
    }
  });

document.getElementById("btnResetCalc")?.addEventListener("click", () => {
  const targetGPAEl = document.getElementById("calcTargetGPA");
  const newCreditsEl = document.getElementById("calcNewCredits");
  const resultEl = document.getElementById("calcResult");

  if (targetGPAEl) targetGPAEl.value = "";
  if (newCreditsEl) newCreditsEl.value = "3";
  if (resultEl) {
    resultEl.textContent = "--";
    resultEl.classList.remove("calc-success", "calc-warning", "calc-error");
  }
});

// ===== STATISTICS & GPA TREND CHART =====
let gpaChartInstance = null;

async function loadStatistics() {
  const cache = await cacheGet("cache_transcript", DAY_MS);
  if (!cache || !cache.rows) return;

  const rows = cache.rows.filter(
    (r) => Number.isFinite(r.grade) && r.grade > 0
  );

  if (rows.length === 0) return;

  // Calculate statistics
  const grades = rows.map((r) => r.grade);
  const avgGrade = grades.reduce((a, b) => a + b, 0) / grades.length;

  const best = rows.reduce(
    (max, r) => (r.grade > max.grade ? r : max),
    rows[0]
  );
  const worst = rows.reduce(
    (min, r) => (r.grade < min.grade ? r : min),
    rows[0]
  );

  const passed = rows.filter(
    (r) => r.status?.toLowerCase() !== "failed" && r.grade >= 5
  ).length;
  const passRate = ((passed / rows.length) * 100).toFixed(1);

  setValue("#statAvgGrade", avgGrade.toFixed(2));
  setValue("#statBestGrade", best.grade.toFixed(2));
  setValue("#statBestCourse", best.code || "--");
  setValue("#statWorstGrade", worst.grade.toFixed(2));
  setValue("#statWorstCourse", worst.code || "--");
  setValue("#statPassRate", passRate + "%");

  // Build GPA trend by semester
  const semesterMap = new Map();
  rows.forEach((r) => {
    const sem = r.semester || r.term || "Unknown";
    if (!semesterMap.has(sem)) {
      semesterMap.set(sem, []);
    }
    semesterMap.get(sem).push(r);
  });

  const excludedCourses = await STORAGE.get("excluded_courses", []);
  const semesters = Array.from(semesterMap.keys()).sort();
  const gpaData = semesters.map((sem) => {
    const semRows = semesterMap.get(sem);
    const gpa = computeGPA(semRows, excludedCourses);
    return Number.isFinite(gpa.gpa10) ? gpa.gpa10 : 0;
  });

  renderGPAChart(semesters, gpaData);
}

function renderGPAChart(labels, data) {
  const canvas = document.getElementById("gpaChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (gpaChartInstance) {
    gpaChartInstance.destroy();
  }

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor = isDark ? "#9ca3af" : "#6b7280";
  const gridColor = isDark
    ? "rgba(55, 65, 81, 0.3)"
    : "rgba(229, 231, 235, 0.5)";

  // Create gradient for line
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (isDark) {
    gradient.addColorStop(0, "rgba(96, 165, 250, 0.4)");
    gradient.addColorStop(0.5, "rgba(129, 140, 248, 0.2)");
    gradient.addColorStop(1, "rgba(139, 92, 246, 0.05)");
  } else {
    gradient.addColorStop(0, "rgba(96, 165, 250, 0.3)");
    gradient.addColorStop(1, "rgba(96, 165, 250, 0.05)");
  }

  gpaChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "GPA theo kỳ",
          data: data,
          borderColor: isDark
            ? "rgba(96, 165, 250, 0.9)"
            : "rgba(96, 165, 250, 1)",
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: isDark ? "#60a5fa" : "#3b82f6",
          pointBorderColor: isDark ? "#1e293b" : "#ffffff",
          pointBorderWidth: 3,
          pointHoverBackgroundColor: "#60a5fa",
          pointHoverBorderColor: isDark ? "#0f172a" : "#ffffff",
          pointHoverBorderWidth: 3,
          // Add shadow effect
          shadowOffsetX: 0,
          shadowOffsetY: 4,
          shadowBlur: 8,
          shadowColor: "rgba(96, 165, 250, 0.3)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "start",
          labels: {
            color: textColor,
            font: {
              size: 13,
              weight: "600",
              family: "'Inter', 'SF Pro', -apple-system, sans-serif",
            },
            padding: 16,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: isDark
            ? "rgba(15, 23, 42, 0.95)"
            : "rgba(255, 255, 255, 0.95)",
          titleColor: isDark ? "#e5e7eb" : "#0f172a",
          bodyColor: isDark ? "#60a5fa" : "#3b82f6",
          borderColor: isDark
            ? "rgba(96, 165, 250, 0.3)"
            : "rgba(96, 165, 250, 0.2)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          boxPadding: 6,
          usePointStyle: true,
          titleFont: {
            size: 13,
            weight: "600",
          },
          bodyFont: {
            size: 14,
            weight: "700",
          },
          callbacks: {
            label: (context) => ` GPA: ${context.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 10,
          ticks: {
            color: textColor,
            font: {
              size: 11,
              weight: "500",
            },
            padding: 8,
            stepSize: 2,
          },
          grid: {
            color: gridColor,
            lineWidth: 1,
            drawBorder: false,
            drawTicks: false,
          },
          border: {
            display: false,
          },
        },
        x: {
          ticks: {
            color: textColor,
            font: {
              size: 11,
              weight: "500",
            },
            padding: 8,
            maxRotation: 0,
            minRotation: 0,
          },
          grid: {
            color: gridColor,
            lineWidth: 1,
            drawBorder: false,
            drawTicks: false,
          },
          border: {
            display: false,
          },
        },
      },
    },
  });
}

document
  .getElementById("btnRefreshStats")
  ?.addEventListener("click", async function () {
    // Check login status first before loading data
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      // Show login banner and don't load data
      await checkAndShowLoginBanner();

      // Show notification that user needs to login first
      showLoginNotification();

      return;
    }

    // If logged in, proceed with loading data
    await handleRefreshWithLoading(this, async () => {
      await loadStatistics();
      // Update last successful fetch time
      await STORAGE.set({ last_successful_fetch: Date.now() });
    });
  });

// ===== EXAM COUNTDOWN =====
function parseExamDate(dateStr) {
  // Parse "31/12/2024" or "31-12-2024"
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const year = parseInt(parts[2]);

  return new Date(year, month, day);
}

function addExamCountdown() {
  const table = document.querySelector("#tblExams tbody");
  if (!table) return;

  const rows = table.querySelectorAll("tr");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    if (cells.length < 3) return;

    const dateCell = cells[2];
    const dateStr = dateCell.textContent.trim();
    const examDate = parseExamDate(dateStr);

    if (!examDate) return;

    const diff = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

    if (diff < 0) return; // Past exam

    let badge = "";
    if (diff === 0) {
      badge =
        '<span class="exam-days" style="background: #ef4444; color: white;">HÔM NAY! </span>';
      row.classList.add("exam-urgent");
    } else if (diff <= 3) {
      badge = `<span class="exam-days">${diff} ngày nữa</span>`;
      row.classList.add("exam-urgent");
    } else if (diff <= 7) {
      badge = `<span class="exam-days" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">${diff} ngày nữa</span>`;
      row.classList.add("exam-soon");
    }

    if (badge) {
      dateCell.innerHTML = dateStr + " " + badge;
    }
  });
}

// Add countdown when exams are loaded
const originalLoadExams = loadExams;
loadExams = async function () {
  await originalLoadExams();
  setTimeout(addExamCountdown, 100);
};

// ===== ADVANCED EXAM FILTERS =====
document
  .getElementById("filterExamTime")
  ?.addEventListener("change", filterExams);
document
  .getElementById("searchExam")
  ?.addEventListener("input", debounce(filterExams, 300));

function filterExams() {
  const filterValue = document.getElementById("filterExamTime")?.value || "ALL";
  const searchValue = (
    document.getElementById("searchExam")?.value || ""
  ).toLowerCase();

  const tbody = document.querySelector("#tblExams tbody");
  if (!tbody) return;

  const rows = tbody.querySelectorAll("tr");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    if (cells.length < 3) return;

    const code = cells[0].textContent.toLowerCase();
    const name = cells[1].textContent.toLowerCase();
    const dateStr = cells[2].textContent.trim().split(" ")[0]; // Remove countdown badge text

    // Search filter
    let matchSearch = true;
    if (searchValue) {
      matchSearch = code.includes(searchValue) || name.includes(searchValue);
    }

    // Time filter
    let matchTime = true;
    if (filterValue !== "ALL") {
      const examDate = parseExamDate(dateStr);
      if (!examDate) {
        matchTime = false;
      } else {
        const diffDays = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

        switch (filterValue) {
          case "THIS_WEEK":
            matchTime = diffDays >= 0 && diffDays <= 7;
            break;
          case "THIS_MONTH":
            matchTime = diffDays >= 0 && diffDays <= 30;
            break;
          case "UPCOMING":
            matchTime = diffDays >= 0;
            break;
        }
      }
    }

    row.style.display = matchSearch && matchTime ? "" : "none";
  });
}

// ===== QUICK REFRESH ALL =====
document
  .getElementById("btnQuickRefresh")
  ?.addEventListener("click", async function () {
    // Check login status first before loading data
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      // Show login banner and don't load data
      await checkAndShowLoginBanner();

      // Show notification that user needs to login first
      showLoginNotification();

      return;
    }

    // If logged in, proceed with loading data
    await handleRefreshWithLoading(this, async () => {
      await STORAGE.remove("cache_transcript");
      await STORAGE.remove("cache_transcript_flat");
      await STORAGE.remove("cache_attendance");
      await STORAGE.remove("cache_attendance_flat");
      await STORAGE.remove("cache_exams");
      await STORAGE.remove("cache_exams_flat");
      await Promise.all([
        loadGPA(),
        refreshAttendance(),
        loadExams(),
        loadTodaySchedule(),
        initGPACalculator(),
      ]);

      // Update last successful fetch time
      await STORAGE.set({
        last_successful_fetch: Date.now(),
        cache_reset_ts: Date.now(),
      });

      // Update quick stats
      const cache = await cacheGet("cache_transcript", DAY_MS);
      if (cache?.rows) {
        const defaultExcluded = await STORAGE.get(
          EXCLUDED_KEY,
          EXCLUDED_DEFAULT
        );
        const userExcluded = await STORAGE.get("excluded_courses", []);
        const allExcluded = [...defaultExcluded, ...userExcluded];
        const gpa = computeGPA(cache.rows, allExcluded);
        setValue(
          "#gpa10Quick",
          Number.isFinite(gpa.gpa10) ? gpa.gpa10.toFixed(2) : "--"
        );
      }

      const attCache = await cacheGet("cache_attendance", 10 * 60 * 1000);
      if (attCache?.entries && attCache.entries.length > 0) {
        const stats = summarizeAttendance(attCache.entries);
        setValue("#attRateQuick", stats.rate + "%");
      } else {
        setValue("#attRateQuick", "--");
      }
    });
  });

// ===== EXPORT TO EXCEL (CSV) =====
function exportToCSV() {
  Promise.all([
    STORAGE.get("cache_transcript", null),
    STORAGE.get("cache_attendance", null),
    STORAGE.get("cache_exams", null),
  ]).then(([transcript, attendance, exams]) => {
    let csv = "";

    // Transcript
    csv += "TRANSCRIPT\n";
    csv += "Code,Name,Credit,Grade,Status\n";
    const tRows = transcript?.rows || transcript?.data?.rows || [];
    tRows.forEach((r) => {
      csv += `${r.code || ""},${r.name || ""},${r.credit || ""},${r.grade || ""
        },${r.status || ""}\n`;
    });

    csv += "\n\nATTENDANCE\n";
    csv += "Date,Day,Slot,Course,Status\n";
    const aEntries = attendance?.entries || attendance?.data?.entries || [];
    aEntries.forEach((e) => {
      csv += `${e.date || ""},${e.day || ""},${e.slot || ""},${e.course || ""
        },${e.status || ""}\n`;
    });

    csv += "\n\nEXAMS\n";
    csv += "Code,Name,Date,Time,Room,Form\n";
    const eRows = exams?.exams || exams?.data?.exams || [];
    eRows.forEach((e) => {
      csv += `${e.code || ""},${e.name || ""},${e.date || ""},${e.time || ""},${e.room || ""
        },${e.form || ""}\n`;
    });

    // Download
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fap_dashboard_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

// Wire up Export CSV button
document.getElementById("btnExportCSV")?.addEventListener("click", exportToCSV);

// ===== CUSTOM MODAL & TOAST SYSTEM =====
// Moved to modules/ui.js

// ===== THEME CUSTOMIZATION =====
const THEME_COLORS = {
  blue: "#60a5fa",
  green: "#10b981",
  purple: "#a78bfa",
  pink: "#f472b6",
  orange: "#fb923c",
  red: "#ef4444",
};

async function initThemeCustomization() {
  const savedColor = await STORAGE.get("accent_color", THEME_COLORS.blue);
  applyAccentColor(savedColor);

  // Update color picker value
  const colorPicker = document.getElementById("customAccentColor");
  if (colorPicker) {
    colorPicker.value = savedColor;
  }

  // Mark active preset
  updateActivePreset(savedColor);

  // Theme preset buttons
  document.querySelectorAll(".theme-preset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const themeColor = THEME_COLORS[btn.dataset.theme];
      applyAccentColor(themeColor);
      await STORAGE.set({ accent_color: themeColor });
      updateActivePreset(themeColor);
      
    });
  });

  // Custom color picker
  if (colorPicker) {
    colorPicker.addEventListener("change", async () => {
      const color = colorPicker.value;
      applyAccentColor(color);
      await STORAGE.set({ accent_color: color });
      updateActivePreset(color);
      Toast.success("Đã đổi màu");
    });
  }
}

function applyAccentColor(color) {
  document.documentElement.style.setProperty("--accent", color);

  // Update chart if exists
  if (gpaChartInstance) {
    loadStatistics();
  }
}

function updateActivePreset(color) {
  document.querySelectorAll(".theme-preset").forEach((btn) => {
    const themeColor = THEME_COLORS[btn.dataset.theme];
    btn.classList.toggle("active", themeColor === color);
  });
}

// Initialize on load
initThemeCustomization();

// ===== BACKGROUND IMAGE SYSTEM =====
const PRESET_BACKGROUNDS = [
  {
    name: "Gradient Blue",
    url: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  {
    name: "Gradient Purple",
    url: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  },
  {
    name: "Gradient Orange",
    url: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  },
  {
    name: "Gradient Green",
    url: "linear-gradient(135deg, #a8caba 0%, #5d4e75 100%)",
  },
  {
    name: "Gradient Pink",
    url: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
  },
  {
    name: "Gradient Dark",
    url: "linear-gradient(135deg, #2c3e50 0%, #34495e 100%)",
  },
];

async function initBackgroundSystem() {
  let savedBg = await STORAGE.get("background_image", "");
  let savedOpacity = await STORAGE.get("background_opacity", 20);

  // Apply saved background
  if (savedBg) {
    applyBackground(savedBg, savedOpacity);
  }

  // Apply frame opacity
  applyFrameOpacity(savedOpacity);

  // Update UI
  updateBackgroundPreview(savedBg);
  document.getElementById("bgOpacity").value = savedOpacity;
  document.getElementById("bgOpacityValue").textContent = savedOpacity + "%";

  // File input
  const fileInput = document.getElementById("bgImageInput");
  const selectBtn = document.getElementById("btnSelectBg");
  const removeBtn = document.getElementById("btnRemoveBg");
  const presetBtn = document.getElementById("btnPresetBg");
  const opacitySlider = document.getElementById("bgOpacity");

  selectBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.addEventListener("load", async (e) => {
        const dataUrl = e.target.result;
        await STORAGE.set({ background_image: dataUrl });
        savedBg = dataUrl;
        applyBackground(dataUrl, savedOpacity);
        updateBackgroundPreview(dataUrl);
        Toast.success("Đã đặt ảnh nền");
      });
      reader.readAsDataURL(file);
    }
  });

  removeBtn.addEventListener("click", async () => {
    await STORAGE.set({ background_image: "" });
    savedBg = "";
    applyBackground("", savedOpacity);
    updateBackgroundPreview("");
    Toast.success("Đã xóa ảnh nền");
  });

  presetBtn.addEventListener("click", () => {
    showPresetBackgrounds();
  });

  opacitySlider.addEventListener("input", async (e) => {
    const opacity = parseInt(e.target.value);
    document.getElementById("bgOpacityValue").textContent = opacity + "%";
    await STORAGE.set({ background_opacity: opacity });
    savedOpacity = opacity;
    applyBackground(savedBg, opacity);
    applyFrameOpacity(opacity);
  });
}

function applyBackground(bgUrl, opacity) {
  const body = document.body;

  // Remove old overlay (legacy)
  const legacyOverlay = document.getElementById("bgOverlay");
  if (legacyOverlay) legacyOverlay.remove();

  if (bgUrl) {
    if (bgUrl.startsWith("linear-gradient")) {
      body.style.background = bgUrl;
    } else {
      body.style.backgroundImage = `url(${bgUrl})`;
      body.style.backgroundSize = "cover";
      body.style.backgroundPosition = "center";
      body.style.backgroundRepeat = "no-repeat";
    }
    body.style.backgroundAttachment = "fixed";
  } else {
    body.style.background = "";
    body.style.backgroundImage = "";
  }

  // Apply opacity overlay via CSS variable for consistent stacking
  updateOverlayOpacity(opacity);
}

function updateBackgroundPreview(bgUrl) {
  const preview = document.getElementById("bgPreview");
  if (bgUrl) {
    if (bgUrl.startsWith("linear-gradient")) {
      preview.style.background = bgUrl;
    } else {
      preview.style.backgroundImage = `url(${bgUrl})`;
    }
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
}

function showPresetBackgrounds() {
  const modal = document.createElement("div");
  modal.className = "bg-preset-modal-overlay";
  modal.innerHTML = `
    <div class="bg-preset-modal-box">
      <div class="bg-preset-modal-header">
        <div class="bg-preset-modal-icon">🎨</div>
        <h2 class="bg-preset-modal-title">Chọn Background Preset</h2>
        <p class="bg-preset-modal-subtitle">Chọn một trong các preset có sẵn</p>
      </div>
      <div class="bg-preset-modal-content">
      <div class="preset-grid">
        ${PRESET_BACKGROUNDS.map(
      (preset, i) => `
            <button class="preset-bg-btn" data-index="${i}" title="${preset.name}">
              <div class="preset-bg-preview" style="background: ${preset.url};"></div>
              <div class="preset-bg-name">${preset.name}</div>
            </button>
          `
    ).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const closeModal = () => modal.remove();

  // Add event listeners
  document.getElementById("bgPresetCancel")?.addEventListener("click", closeModal);
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  modal.querySelectorAll(".preset-bg-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const index = parseInt(btn.dataset.index);
        const preset = PRESET_BACKGROUNDS[index];
        await STORAGE.set({ background_image: preset.url });
        applyBackground(
          preset.url,
          parseInt(document.getElementById("bgOpacity").value)
        );
        savedBg = preset.url;
        updateBackgroundPreview(preset.url);
        closeModal();
        Toast.success(`�� �p d?ng ${preset.name}`);
      });
    });
}

// Initialize background system
initBackgroundSystem();

function updateOverlayOpacity(opacityPercent) {
  const overlayOpacity = Math.max(
    0,
    Math.min(1, (100 - (opacityPercent || 0)) / 100)
  );
  document.documentElement.style.setProperty(
    "--bg-overlay-opacity",
    overlayOpacity
  );
}

// ===== FRAME OPACITY SYSTEM =====
function applyFrameOpacity(opacityPercent) {
  // Convert percentage to decimal (0-1)
  const opacity = opacityPercent / 100;

  // Update CSS variable
  document.documentElement.style.setProperty("--frame-opacity", opacity);

  // Save to storage
  STORAGE.set({ frame_opacity: opacityPercent });
}

// Load saved frame opacity on init
async function initFrameOpacity() {
  const savedOpacity = await STORAGE.get("frame_opacity", 100);
  applyFrameOpacity(savedOpacity);
}

// Initialize frame opacity
initFrameOpacity();

// Achievements removed

// Setup all event listeners using data attributes
function setupEventListeners() {
  // Add a small delay to ensure DOM is fully loaded
  setTimeout(() => {
    // Widget toggle and remove buttons
    document.querySelectorAll("[data-widget-action]").forEach((btn) => {
      const action = btn.getAttribute("data-widget-action");
      const widgetId = btn.getAttribute("data-widget-id");

      if (action === "toggle") {
        btn.addEventListener("click", () => toggleWidget(widgetId));
      } else if (action === "remove") {
        btn.addEventListener("click", () => removeWidget(widgetId));
      }
    });

    // Tab switch buttons
    const switchButtons = document.querySelectorAll(
      '[data-tab-action="switch"]'
    );
    console.log(`Found ${switchButtons.length} tab switch buttons`);
    switchButtons.forEach((btn) => {
      const tabId = btn.getAttribute("data-tab-id");
      console.log(`Setting up switch button for tab: ${tabId}`);
      btn.addEventListener("click", () => switchTab(tabId));
    });
  }, 100);

  // Quick Actions - Direct event delegation
  document.addEventListener("click", (e) => {
    if (e.target.closest(".quick-action-btn")) {
      const btn = e.target.closest(".quick-action-btn");
      const tabId = btn.getAttribute("data-tab-id");
      console.log(`Quick action clicked: ${tabId}`);
      if (tabId) {
        switchTab(tabId);
      }
    }
  });

  // Tab buttons - Direct event listeners
  document.querySelectorAll(".tabs button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute("data-tab");
      console.log(`Tab button clicked: ${tabId}`);
      switchTab(tabId);
    });
  });

  // Generic data-action event delegation
  document.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    if (!action) return;

    switch (action) {
      case "close-modal":
        e.target.closest(".modal-overlay, .tab-editor-modal")?.remove();
        break;

      case "select-result":
        const resultType = e.target.getAttribute("data-result-type");
        if (window.advancedSearch && resultType) {
          advancedSearch.selectResult(resultType);
        }
        break;

      case "show-create-plan-modal":
        if (window.studyPlans) {
          studyPlans.showCreatePlanModal();
        }
        break;

      case "create-plan":
        if (window.studyPlans) {
          studyPlans.createPlan();
        }
        break;

      case "start-plan":
      case "pause-plan":
      case "resume-plan":
      case "complete-plan":
      case "restart-plan":
      case "delete-plan":
        const planId = e.target.getAttribute("data-plan-id");
        if (window.studyPlans && planId) {
          switch (action) {
            case "start-plan":
              studyPlans.startPlan(planId);
              break;
            case "pause-plan":
              studyPlans.pausePlan(planId);
              break;
            case "resume-plan":
              studyPlans.resumePlan(planId);
              break;
            case "complete-plan":
              studyPlans.completePlan(planId);
              break;
            case "restart-plan":
              studyPlans.restartPlan(planId);
              break;
            case "delete-plan":
              studyPlans.deletePlan(planId);
              break;
          }
        }
        break;
    }
  });

  // End setupEventListeners
}

// Basic widget controls (collapse and hide)
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

// ===== ADVANCED SEARCH =====
// Moved to modules/advanced-search.js

// ===== STUDY PLANS =====
// Moved to modules/study-plans.js

// ===== INITIALIZE STUDY PLANS =====

let studyPlans;

function initStudyPlans() {
  studyPlans = new StudyPlans();
}

// ===== KEYBOARD SHORTCUTS =====

document.addEventListener("keydown", (e) => {
  // Ctrl / Cmd + R: Refresh all
  if ((e.ctrlKey || e.metaKey) && e.key === "r") {
    e.preventDefault();
    document.getElementById("btnQuickRefresh")?.click();
    return;
  }

  // Ctrl / Cmd + K: Focus search
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    const searchInputs = [
      document.getElementById("searchCourse"),
      document.getElementById("searchAtt"),
      document.getElementById("searchExam"),
    ];

    const activeTab = document.querySelector(".tab.active");
    const activeSearch = searchInputs.find(
      (input) => input && activeTab?.contains(input)
    );

    if (activeSearch) {
      activeSearch.focus();
      activeSearch.select();
    }
    return;
  }

  // Numbers 1�9: Switch tabs
  if (
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.altKey &&
    e.key >= "1" &&
    e.key <= "9"
  ) {
    if (
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA"
    ) {
      return;
    }

    e.preventDefault();
    const tabs = document.querySelectorAll(".tabs button");
    const tabIndex = parseInt(e.key) - 1;
    if (tabs[tabIndex]) {
      tabs[tabIndex].click();
    }
  }
});

// ===== DEMO FUNCTIONS =====

// ===== iPadOS Style Update Modal System =====
const UpdateModal = {
  overlay: null,
  box: null,
  progressBar: null,
  progressFill: null,
  progressText: null,
  downloadBtn: null,
  cancelBtn: null,

  // Configuration for GitHub repository
  config: {
    repoOwner: "longurara", // Real FAP-GPA-Viewer repository
    repoName: "FAP-GPA-Viewer", // Real FAP-GPA-Viewer repository
    fallbackDownloadUrl:
      "https://github.com/longurara/FAP-GPA-Viewer/releases/latest", // Fallback URL
    useRealDownload: true,
  },

  init() {
    const modalHTML = `
      <div class="update-modal-overlay" id="updateModalOverlay">
        <div class="update-modal-box">
          <div class="update-modal-header">
            <div class="update-modal-icon">
              <div style="font-size: 48px;">🚀</div>
            </div>
            <h2 class="update-modal-title">Cập nhật FAP-Dashboard</h2>
            <p class="update-modal-subtitle">Phiên bản mới đã có sẵn</p>
          </div>
          <div class="update-modal-content">
            <div class="update-app-info">
              <div class="update-app-name" id="updateAppName">FAP Dashboard v2.3.0</div>
              <div class="update-developer" id="updateDeveloper">Nhà phát triển: FAP Team</div>
            </div>
            <div class="update-description" id="updateDescription">
              Phiên bản mới với nhiều tính năng tuyệt vời và cải tiến hiệu suất đáng kể.
            </div>
            <ul class="update-features" id="updateFeatures">
              <li>Giao diện mới với thiết kế hiện đại</li>
              <li>Cải thiện hiệu suất và tốc độ tải</li>
              <li>Tối ưu hóa cho mobile và tablet</li>
              <li>Sửa lỗi và cải thiện ổn định</li>
            </ul>
            <div class="update-size" id="updateSize">
              <strong>Kích thước:</strong> 2.4 MB
            </div>
            <div class="update-progress" id="updateProgress">
              <div class="progress-fill" id="progressFill"></div>
              <div class="progress-text" id="progressText">Đang tải về...</div>
            </div>
          </div>
          <div class="update-actions">
            <button class="update-btn secondary" id="updateCancelBtn">Hủy</button>
            <button class="update-btn primary" id="updateDownloadBtn">Tải về</button>
          </div>
        </div>
      </div>
    `;

    // Add to body
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Get references
    this.overlay = document.getElementById("updateModalOverlay");
    this.progressBar = document.getElementById("updateProgress");
    this.progressFill = document.getElementById("progressFill");
    this.progressText = document.getElementById("progressText");
    this.downloadBtn = document.getElementById("updateDownloadBtn");
    this.cancelBtn = document.getElementById("updateCancelBtn");

    // Add event listeners
    this.cancelBtn.addEventListener("click", () => this.close());
    this.downloadBtn.addEventListener("click", () => this.startDownload());

    // Click overlay to close
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlay?.classList.contains("active")) {
        this.close();
      }
    });
  },

  show() {
    if (!this.overlay) this.init();
    this.overlay.classList.add("active");
    this.resetProgress();
    this.updateModalContent();
    this.checkForUpdates();
  },

  async checkForUpdates() {
    try {
      const latestReleaseUrl = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/releases/latest`;
      console.log("🔍 Fetching release info from:", latestReleaseUrl);
      const response = await fetch(latestReleaseUrl);

      if (response.ok) {
        const releaseData = await response.json();
        console.log("📦 Release data:", releaseData);
        console.log("📦 Assets:", releaseData.assets);

        const latestVersion = releaseData.tag_name;
        const currentVersion = this.getCurrentVersion();

        console.log(`📦 Current version: ${currentVersion}`);
        console.log(`📦 Latest version available: ${latestVersion}`);

        // Check if update is needed
        if (this.isVersionNewer(latestVersion, currentVersion)) {
          // Update available
          this.showUpdateAvailable(latestVersion, releaseData);
        } else {
          // Already up to date
          this.showUpToDate(currentVersion);
        }
      } else {
        console.error(
          "GitHub API error:",
          response.status,
          response.statusText
        );
      }
    } catch (error) {
      console.log("Could not fetch latest version info:", error.message);
      // Fallback to showing update modal anyway
      this.showUpdateAvailable("v4.2.0", null);
    }
  },

  getCurrentVersion() {
    // Get current version from manifest or default
    try {
      const manifest = chrome.runtime.getManifest();
      return manifest.version || "v2.2.1"; // Fallback to current version
    } catch (error) {
      return "v2.2.1"; // Fallback version
    }
  },

  isVersionNewer(latestVersion, currentVersion) {
    // Simple version comparison (remove 'v' prefix and compare)
    const latest = latestVersion.replace("v", "").split(".").map(Number);
    const current = currentVersion.replace("v", "").split(".").map(Number);

    for (let i = 0; i < Math.max(latest.length, current.length); i++) {
      const latestNum = latest[i] || 0;
      const currentNum = current[i] || 0;

      if (latestNum > currentNum) return true;
      if (latestNum < currentNum) return false;
    }

    return false; // Versions are equal
  },

  showUpdateAvailable(latestVersion, releaseData) {
    // Update modal title with latest version
    const titleEl = document.querySelector(".update-modal-title");
    if (titleEl && this.config.repoOwner === "longurara") {
      titleEl.textContent = `C?p nh?t FAP-Dashboard ${latestVersion}`;
    }

    // Update app name with latest version
    const appNameEl = document.getElementById("updateAppName");
    if (appNameEl && this.config.repoOwner === "longurara") {
      appNameEl.textContent = `FAP-Dashboard ${latestVersion}`;
    }

    // Update with real release data if available
    if (releaseData) {
      this.updateModalWithRealData(releaseData);
    }

    // Show download button
    const downloadBtn = document.getElementById("updateDownloadBtn");
    if (downloadBtn) {
      downloadBtn.style.display = "block";
      downloadBtn.textContent = "T?i v?";
      // Ensure download functionality is restored
      downloadBtn.replaceWith(downloadBtn.cloneNode(true));
      const newDownloadBtn = document.getElementById("updateDownloadBtn");
      newDownloadBtn.addEventListener("click", () => this.startDownload());
    }
  },


  updateModalWithRealData(releaseData) {
    console.log("?? Release data received:", releaseData);

    // Update description with simple text
    const descriptionEl = document.getElementById("updateDescription");
    if (descriptionEl) {
      descriptionEl.textContent = "";
    }

    // Hide features list
    const featuresEl = document.getElementById("updateFeatures");
    if (featuresEl) {
      featuresEl.style.display = "none";
    }

    // Show file size with real asset size
    const sizeEl = document.getElementById("updateSize");
    if (sizeEl) {
      sizeEl.style.display = "block";
      if (releaseData.assets && releaseData.assets.length > 0) {
        const asset = releaseData.assets[0];
        const sizeInMB = (asset.size / 1024 / 1024).toFixed(1);
        console.log(`?? Real file size: ${asset.size} bytes = ${sizeInMB} MB`);
        sizeEl.innerHTML = `<strong>K�ch thu?c:</strong> ${sizeInMB} MB`;
      } else {
        console.log("?? No assets found in release data");
        // Try to fetch size from repository or use estimated size
        this.fetchEstimatedSize().then((size) => {
          sizeEl.innerHTML = `<strong>K�ch thu?c:</strong> ${size}`;
        });
      }
    }
  },

  async fetchEstimatedSize() {
    try {
      // Try to get repository size or estimate based on common extension sizes
      const repoUrl = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}`;
      const response = await fetch(repoUrl);
      if (response.ok) {
        const repoData = await response.json();
        if (repoData.size) {
          const sizeInMB = (repoData.size / 1024 / 1024).toFixed(1);
          return `${sizeInMB} MB (u?c t�nh)`;
        }
      }
    } catch (error) {
      console.log("Could not fetch repository size:", error);
    }
    return "~2.0 MB (u?c t�nh)";
  },


  extractFeaturesFromReleaseNotes(releaseNotes) {
    const features = [];
    const lines = releaseNotes.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Look for bullet points or numbered lists
      if (
        trimmedLine.match(/^[-*+]\s+(.+)/) ||
        trimmedLine.match(/^\d+\.\s+(.+)/)
      ) {
        let feature = trimmedLine
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "");

        // Clean up markdown formatting
        feature = feature
          .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
          .replace(/\*([^*]+)\*/g, "$1") // Remove italic
          .replace(/`([^`]+)`/g, "$1") // Remove inline code
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links
          .trim();

        if (feature && feature.length > 0 && feature.length < 100) {
          features.push(feature);
        }
      }

      // Limit to 5 features max
      if (features.length >= 5) break;
    }

    // If no features found, use default ones
    if (features.length === 0) {
      return [
        "Pomodoro Timer Material Design 3",
        "Dynamic GPA Calculation",
        "Clean Scrollbar Design",
        "Performance optimizations",
      ];
    }

    return features;
  },

  showUpToDate(currentVersion) {
    // Update modal title
    const titleEl = document.querySelector(".update-modal-title");
    if (titleEl) {
      titleEl.textContent = `FAP-Dashboard ${currentVersion}`;
    }

    // Update subtitle
    const subtitleEl = document.querySelector(".update-modal-subtitle");
    if (subtitleEl) {
      subtitleEl.textContent = "Bạn đã ở phiên bản mới nhất!";
    }

    // Update app name
    const appNameEl = document.getElementById("updateAppName");
    if (appNameEl) {
      appNameEl.textContent = `FAP-Dashboard ${currentVersion}`;
    }

    // Update description
    const descriptionEl = document.getElementById("updateDescription");
    if (descriptionEl) {
      descriptionEl.textContent =
        "Extension của bạn đã được cập nhật lên phiên bản mới nhất. Cảm ơn bạn đã sử dụng FAP Dashboard!";
    }

    // Hide features list
    const featuresEl = document.getElementById("updateFeatures");
    if (featuresEl) {
      featuresEl.style.display = "none";
    }

    // Hide size info
    const sizeEl = document.getElementById("updateSize");
    if (sizeEl) {
      sizeEl.style.display = "none";
    }

    // Change download button to close button
    const downloadBtn = document.getElementById("updateDownloadBtn");
    if (downloadBtn) {
      downloadBtn.textContent = "Đóng";
      // Remove existing event listeners and add new one
      downloadBtn.replaceWith(downloadBtn.cloneNode(true));
      const newDownloadBtn = document.getElementById("updateDownloadBtn");
      newDownloadBtn.addEventListener("click", () => this.close());
    }

    console.log("? User is up to date!");
  },

  updateModalContent() {
    // Update modal content based on current repository
    const appNameEl = document.getElementById("updateAppName");
    const developerEl = document.getElementById("updateDeveloper");
    const descriptionEl = document.getElementById("updateDescription");
    const featuresEl = document.getElementById("updateFeatures");
    const sizeEl = document.getElementById("updateSize");

    if (this.config.repoOwner === "longurara" && this.config.repoName === "FAP-GPA-Viewer") {
      // FAP-GPA-Viewer real content
      if (appNameEl) appNameEl.textContent = "FAP-GPA-Viewer v4.2.0";
      if (developerEl) developerEl.textContent = "Nhà phát triển: longurara";
      if (descriptionEl) descriptionEl.textContent = "Test download";
      if (featuresEl) {
        featuresEl.style.display = "none";
      }
      if (sizeEl) {
        sizeEl.style.display = "block";
        sizeEl.innerHTML = "<strong>Kích thước:</strong> ~2.4 MB";
      }
    } else if (this.config.repoOwner === "microsoft" && this.config.repoName === "vscode") {      if (appNameEl) appNameEl.textContent = "Visual Studio Code v1.85.0";
      if (developerEl) developerEl.textContent = "Nhà phát triển: Microsoft";
      if (descriptionEl)
        descriptionEl.textContent =
          "Phiên bản mới của VS Code với nhiều tính năng và cải tiến hiệu suất.";
      if (featuresEl) {
        featuresEl.innerHTML = `
        <li>IntelliSense cải tiến với AI</li>
        <li>Performance tối ưu hóa</li>
        <li>Extensions mới và cập nhật</li>
        <li>Debugging tools nâng cao</li>
        <li>Git integration cải thiện</li>
      `;
      }
      if (sizeEl) sizeEl.innerHTML = "<strong>Kích thước:</strong> ~100 MB";
    } else if (this.config.repoOwner === "facebook" && this.config.repoName === "react") {      if (appNameEl) appNameEl.textContent = "React v18.2.0";
      if (developerEl) developerEl.textContent = "Nhà phát triển: Facebook (Meta)";
      if (descriptionEl)
        descriptionEl.textContent =
          "Thư viện JavaScript mạnh mẽ cho xây dựng giao diện người dùng.";
      if (featuresEl) {
        featuresEl.innerHTML = `
        <li>Concurrent rendering</li>
        <li>Automatic batching</li>
        <li>Suspense improvements</li>
        <li>New hooks v� APIs</li>
        <li>Better TypeScript support</li>
      `;
      }
      if (sizeEl) sizeEl.innerHTML = "<strong>Kích thước:</strong> ~50 MB";
    } else {
      // Default FAP Dashboard content
      if (appNameEl) appNameEl.textContent = "FAP Dashboard v2.3.0";
      if (developerEl) developerEl.textContent = "Nhà phát triển: FAP Team";
      if (descriptionEl)
        descriptionEl.textContent =
          "Phiên bản mới với nhiều tính năng tuyệt vời và cải tiến hiệu suất đáng kể.";
      if (featuresEl) {
        featuresEl.innerHTML = `
        <li>Giao diện mới với thiết kế hiện đại</li>
        <li>Cải thiện hiệu suất và tốc độ tải</li>
        <li>Tối ưu hóa cho mobile và tablet</li>
        <li>Sửa lỗi và cải thiện ổn định</li>
      `;
      }
      if (sizeEl) sizeEl.innerHTML = "<strong>Kích thước:</strong> 2.4 MB";
    }
  },

  close() {
    this.overlay?.classList.remove("active");
  },

  resetProgress() {
    this.progressBar.classList.remove("active");
    this.progressFill.style.width = "0%";
    this.progressText.textContent = "Đang tải về...";
    if (this.downloadBtn) {
      this.downloadBtn.textContent = "Tải về";
      this.downloadBtn.disabled = false;
      this.downloadBtn.style.display = "block";
    }
  },

  async startDownload() {
    this.downloadBtn.disabled = true;
    this.downloadBtn.textContent = "Đang tải về...";
    this.progressBar.classList.add("active");

    try {
      if (this.config.useRealDownload) {
        // Try real download from GitHub first
        await this.realDownload();
      } else {
        // Fallback: Open GitHub releases page
        await this.fallbackDownload();
      }

      // After download, show installation instructions instead of simulating installation
      this.progressText.textContent = "Tải về hoàn thành!";
      this.progressFill.style.width = "100%";

      setTimeout(() => {
        this.close();
        // Show detailed installation instructions
        this.showInstallationInstructions();
      }, 1000);
    } catch (error) {
      console.error("Download failed:", error);
      this.progressText.textContent = "Tải về thất bại!";
      this.downloadBtn.disabled = false;
      this.downloadBtn.textContent = "Mở GitHub";

      // Change button to open GitHub page instead of retry
      this.downloadBtn.replaceWith(this.downloadBtn.cloneNode(true));
      const newDownloadBtn = document.getElementById("updateDownloadBtn");
      newDownloadBtn.addEventListener("click", () => {
        window.open(this.config.fallbackDownloadUrl, "_blank");
        this.close();
      });

      // Show error notification with option to open GitHub
      Toast.error(
        "Không thể tải về trực tiếp. Nhấn 'Mở GitHub' để tải về thủ công."
      );
    }
  },


  showInstallationInstructions() {
    // Create installation instructions modal
    const instructionsHTML = `
    <div class="update-modal-overlay" id="installInstructionsOverlay">
      <div class="update-modal-box" style="max-width: 500px;">
        <div class="update-modal-header">
          <div class="update-modal-icon">
            <div style="font-size: 48px;">📦</div>
          </div>
          <h2 class="update-modal-title">Hướng dẫn cài đặt</h2>
          <p class="update-modal-subtitle">
            File đã được tải về. Làm theo các bước sau để cài đặt extension
          </p>
        </div>

        <div class="update-modal-content">
          <div class="install-steps">
            <div class="install-step">
              <div class="step-number">1</div>
              <div class="step-content">
                <h4>File đã tải về</h4>
                <p>
                  File <strong>FAP-GPA-Viewer-*.zip</strong> đã được tải về thư mục Downloads
                </p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">2</div>
              <div class="step-content">
                <h4>Giải nén file</h4>
                <p>Giải nén file .zip vào một thư mục trên máy tính</p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">3</div>
              <div class="step-content">
                <h4>Mở Chrome Extensions</h4>
                <p>Vào <strong>chrome://extensions/</strong> hoặc <strong>edge://extensions/</strong></p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">4</div>
              <div class="step-content">
                <h4>Bật Developer Mode</h4>
                <p>Bật chế độ "Developer mode" ở góc trên bên phải</p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">5</div>
              <div class="step-content">
                <h4>Load Extension</h4>
                <p>Nhấn "Load unpacked" và chọn thư mục đã giải nén</p>
              </div>
            </div>
          </div>

          <div class="update-actions">
            <button class="update-btn secondary" id="installCloseBtn">Đã hiểu</button>
            <button class="update-btn primary" id="installOpenExtensionsBtn">Mở Extensions</button>
          </div>
        </div>
      </div>
    </div>
  `;


    // Add to body
    document.body.insertAdjacentHTML("beforeend", instructionsHTML);

    // Add event listeners
    document.getElementById("installCloseBtn").addEventListener("click", () => {
      document.getElementById("installInstructionsOverlay").remove();
    });

    document
      .getElementById("installOpenExtensionsBtn")
      .addEventListener("click", () => {
        // Open extensions page
        if (navigator.userAgent.includes("Edg")) {
          window.open("edge://extensions/", "_blank");
        } else {
          window.open("chrome://extensions/", "_blank");
        }
        document.getElementById("installInstructionsOverlay").remove();
      });

    // Add CSS for installation steps
    if (!document.getElementById("installStepsCSS")) {
      const style = document.createElement("style");
      style.id = "installStepsCSS";
      style.textContent = `
        .install-steps {
          margin: 20px 0;
        }
        .install-step {
          display: flex;
          align-items: flex-start;
          margin-bottom: 20px;
          padding: 15px;
          background: var(--card-bg);
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .step-number {
          width: 32px;
          height: 32px;
          background: var(--accent);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          margin-right: 15px;
          flex-shrink: 0;
        }
        .step-content h4 {
          margin: 0 0 8px 0;
          color: var(--text);
          font-size: 16px;
        }
        .step-content p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }
      `;
      document.head.appendChild(style);
    }
  },

  async fallbackDownload() {
    // Simulate download progress for fallback
    this.progressText.textContent = "Đang mở trang tải về...";
    this.progressFill.style.width = "30%";

    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.progressText.textContent = "Đang chuyển hướng...";
    this.progressFill.style.width = "60%";

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Open GitHub releases page in new tab
    window.open(this.config.fallbackDownloadUrl, "_blank");

    this.progressFill.style.width = "100%";
    this.progressText.textContent = "Đã mở trang tải về! ";
  },

  async realDownload() {
    const latestReleaseUrl = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/releases/latest`;

    try {
      // Get latest release info
      this.progressText.textContent = "Đang kiểm tra phiên bản mới... ";
      this.progressFill.style.width = "10%";

      console.log("?? Fetching release info from:", latestReleaseUrl);

      const response = await fetch(latestReleaseUrl);
      if (!response.ok) {
        console.error("GitHub API error:", response.status, response.statusText);
        throw new Error(`GitHub API error: ${response.status} - ${response.statusText}`);
      }

      const releaseData = await response.json();
      console.log("?? Release data:", releaseData);

      // Check if there are assets
      if (!releaseData.assets || releaseData.assets.length === 0) {
        console.log("?? Release data:", releaseData);
        // No assets found in release - this is normal for some releases
        throw new Error(
          "Không tìm thấy file tải về trong release này. Release có thể chưa có file đính kèm."
        );
      }

      const downloadUrl = releaseData.assets[0]?.browser_download_url;
      const fileName = releaseData.assets[0]?.name || "update.zip";
      const fileSize = releaseData.assets[0]?.size || 0;

      if (!downloadUrl) {
        throw new Error("Không tìm thấy URL tải về");
      }

      console.log("?? Downloading from:", downloadUrl);
      console.log("?? File name:", fileName);
      console.log("?? File size:", fileSize, "bytes");

      // Start actual download
      this.progressText.textContent = "Đang tải về...";
      this.progressFill.style.width = "20%";

      const downloadResponse = await fetch(downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error(`Download failed: ${downloadResponse.status} - ${downloadResponse.statusText}`);
      }

      const contentLength = downloadResponse.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : fileSize;
      let loaded = 0;

      console.log("?? Total size to download:", total, "bytes");

      const reader = downloadResponse.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Update progress
        const progress = total > 0 ? Math.round((loaded / total) * 80) + 20 : 50;
        this.progressFill.style.width = progress + "%";

        const percent = total > 0 ? Math.round((loaded / total) * 100) : 50;
        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
        const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : "?";

        this.progressText.textContent = `Đang tải về... ${percent}% (${loadedMB}/${totalMB} MB)`;

        // Small delay for smooth animation
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      // Combine chunks
      const blob = new Blob(chunks);
      console.log("? Download completed, blob size:", blob.size, "bytes");

      // Save file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      this.progressFill.style.width = "100%";
      this.progressText.textContent = "Tải về hoàn tất!";

      console.log("?? File saved successfully:", fileName);
    } catch (error) {
      console.error("Real download error:", error);
      throw error;
    }
  },

  async simulateDownload() {
    const steps = [
      { progress: 20, text: "Đang tải về... 20%" },
      { progress: 40, text: "Đang tải về... 40%" },
      { progress: 60, text: "Đang tải về... 60%" },
      { progress: 80, text: "Đang tải về... 80%" },
      { progress: 100, text: "Tải về hoàn tất!" },
    ];

    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      this.progressFill.style.width = step.progress + "%";
      this.progressText.textContent = step.text;
    }
  },

  async simulateInstallation() {
    const steps = [
      { progress: 20, text: "Đang cài đặt... 20%" },
      { progress: 40, text: "Đang cài đặt... 40%" },
      { progress: 60, text: "Đang cài đặt... 60%" },
      { progress: 80, text: "Đang cài đặt... 80%" },
      { progress: 100, text: "Cài đặt hoàn tất!" },
    ];

    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      this.progressFill.style.width = step.progress + "%";
      this.progressText.textContent = step.text;
    }
  },
};

// ===== CALENDAR INTEGRATION =====
let calendarService = null;

function initCalendarService() {
  if (!calendarService) {
    calendarService = new CalendarService();
  }
}

// Toast function for auto calendar
function showToast(message, type = "info") {
  if (typeof Toast !== "undefined") {
    switch (type) {
      case "success":
        Toast.success(message);
        break;
      case "error":
        Toast.error(message);
        break;
      case "info":
        Toast.info(message);
        break;
      default:
        Toast.info(message);
    }
  } else {
    // Fallback to console if Toast is not available
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

// ===== EXPORT FUNCTIONS =====

// Export lịch học
async function exportScheduleICS() {
  try {
    initCalendarService();

    const btn = document.getElementById("btnExportScheduleICS");
    btn.classList.add("loading");
    btn.disabled = true;

    const result = await calendarService.exportScheduleICS();

    if (result.success) {
      showToast(`🎉 Export ${result.count} sự kiện lịch học thành file .ics!`, "success");
    }
  } catch (error) {
    console.error("Export schedule failed:", error);
    showToast(`Lỗi: ${error.message}`, "error");
  } finally {
    const btn = document.getElementById("btnExportScheduleICS");
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// Export lịch thi
async function exportExamICS() {
  try {
    initCalendarService();

    const btn = document.getElementById("btnExportExamICS");
    btn.classList.add("loading");
    btn.disabled = true;

    const result = await calendarService.exportExamICS();

    if (result.success) {
      showToast(`🎉 Export ${result.count} sự kiện lịch thi thành file .ics!`, "success");
    }
  } catch (error) {
    console.error("Export exam failed:", error);
    showToast(`Lỗi: ${error.message}`, "error");
  } finally {
    const btn = document.getElementById("btnExportExamICS");
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// Hiện thị modal hướng dẫn 
function showCalendarHelp() {
  const modal = document.getElementById("calendarHelpModal");
  modal.style.display = "flex";
}

// ��ng modal hu?ng d?n
function closeCalendarHelp() {
  const modal = document.getElementById("calendarHelpModal");
  modal.style.display = "none";
}

// Th�m event listeners cho Calendar
function initCalendarUI() {
  // Export buttons
  document.getElementById("btnExportScheduleICS")?.addEventListener("click", exportScheduleICS);
  document.getElementById("btnExportExamICS")?.addEventListener("click", exportExamICS);

  // Help modal
  document.getElementById("modalHelpClose")?.addEventListener("click", closeCalendarHelp);

  // Close modal when clicking outside
  document.getElementById("calendarHelpModal")?.addEventListener("click", function (e) {
    if (e.target === this) {
      closeCalendarHelp();
    }
  });

  // Add help button to schedule and exam tabs
  const scheduleActions = document.querySelector("#tab-schedule .actions");
  const examActions = document.querySelector("#tab-exam .actions");

  if (scheduleActions && !scheduleActions.querySelector("#btnCalendarHelp")) {
    const helpBtn = document.createElement("button");
    helpBtn.id = "btnCalendarHelp";
    helpBtn.className = "secondary";
    helpBtn.textContent = "Hướng dẫn";
    helpBtn.addEventListener("click", showCalendarHelp);
    scheduleActions.appendChild(helpBtn);
  }

  if (examActions && !examActions.querySelector("#btnCalendarHelp2")) {
    const helpBtn = document.createElement("button");
    helpBtn.id = "btnCalendarHelp2";
    helpBtn.className = "secondary";
    helpBtn.textContent = "Hướng dẫn";
    helpBtn.addEventListener("click", showCalendarHelp);
    examActions.appendChild(helpBtn);
  }
}

function initPopup() {
  initStudyPlans();
  initCalendarUI();
  setupEventListeners();
}

document.addEventListener("DOMContentLoaded", initPopup);





