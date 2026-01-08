const STORAGE = {
  get: (k, d) =>
    new Promise((r) => chrome.storage.local.get({ [k]: d }, (v) => r(v[k]))),
  set: (obj) => new Promise((r) => chrome.storage.local.set(obj, r)),
  remove: (k) => new Promise((r) => chrome.storage.local.remove(k, r)),
};

const SCHEDULE_OF_WEEK = "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx";

const TRANSCRIPT_URL = "https://fap.fpt.edu.vn/Grade/StudentTranscript.aspx";

// ========== Message Types ==========
const MSG = {
  FETCH_TRANSCRIPT: 'FETCH_TRANSCRIPT',
  TRANSCRIPT_READY: 'TRANSCRIPT_READY',
  TRANSCRIPT_LOADING: 'TRANSCRIPT_LOADING',
  FETCH_STATUS: 'FETCH_STATUS'
};

// ========== Loading State ==========
let loadingState = {
  transcript: false,
  schedule: false
};

// ========== Service Worker Helper Functions ==========
// NOTE: These are copies of Utils functions because Service Worker 
// doesn't have access to window.Utils (runs in isolated context)
// Canonical versions are in scripts/modules/utils.js

function toNum(txt) {
  const m = String(txt || "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : NaN;
}

function NORM_TXT(s) {
  return (s || "").replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Validate schedule entries before saving to cache
 * Prevents overwriting good data with empty data when user is not logged in
 * @param {Array} entries - Schedule entries to validate
 * @returns {boolean} - true if data is valid and safe to cache
 * NOTE: Copy of Utils.isValidScheduleData for Service Worker context
 */
function isValidScheduleData(entries) {
  if (!Array.isArray(entries)) return false;
  if (entries.length === 0) return false;

  // Check if at least one entry has valid course code (e.g., "ABC123")
  const hasValidEntry = entries.some(e =>
    e && e.course && /^[A-Z]{2,4}\d{3}$/.test(e.course)
  );

  return hasValidEntry;
}

function parseTranscriptDoc(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tables = [...doc.querySelectorAll("table")];
    console.log("🔍 parseTranscriptDoc: Found", tables.length, "tables");

    for (const t of tables) {
      const trs = [...t.querySelectorAll("tr")];
      for (const tr of trs) {
        const labels = [...tr.children].map((td) => NORM_TXT(td.textContent));

        // Debug: Look for tables with interesting headers
        if (labels.some(l => l.includes("CREDIT") || l.includes("GRADE") || l.includes("SUBJECT"))) {
          console.log("🔍 Found potential header row:", labels);
        }

        if (labels.includes("CREDIT") && labels.includes("GRADE")) {
          console.log("✅ Found transcript table header:", labels);
          const header = [...tr.children].map((x) => NORM_TXT(x.textContent));
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
          console.log("📊 Column indices:", idx);

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
              credit:
                idx.credit >= 0 ? toNum(tds[idx.credit]?.textContent) : NaN,
              grade: idx.grade >= 0 ? toNum(tds[idx.grade]?.textContent) : NaN,
              status:
                idx.status >= 0 ? tds[idx.status]?.textContent.trim() : "",
            };
            if (!row.code && !row.name && !Number.isFinite(row.credit))
              continue;
            rows.push(row);
          }
          console.log("📊 Parsed", rows.length, "course rows");
          return rows;
        }
      }
    }
    console.log("⚠️ No transcript table found (no CREDIT+GRADE headers)");
  } catch (e) {
    console.error("❌ parseTranscriptDoc error:", e);
  }
  return [];
}

function nowHm() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
} // "HH:MM"
function within(activeFrom, activeTo) {
  const n = nowHm();
  return n >= activeFrom && n <= activeTo;
}

async function fetchHtml(url) {
  const res = await fetch(url, { credentials: "include", redirect: "follow" });
  if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
    const last = await STORAGE.get("last_login_prompt_ts", 0);
    const now = Date.now();
    if (now - last > 60 * 60 * 1000) {
      // not more than once per hour
      const loginUrl = "https://fap.fpt.edu.vn/";
      chrome.tabs.create({ url: loginUrl });
      await STORAGE.set({ last_login_prompt_ts: now });
    }
    throw new Error("LOGIN_REQUIRED");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ========== Content Script Based Fetch (for cookie access) ==========
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

  try {
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
  } catch (e) {
    if (createdTab) {
      try { await chrome.tabs.remove(tabId); } catch (x) { }
    }
    throw e;
  }
}

// Fetch AND PARSE transcript inside content script (where DOMParser is available)
async function fetchAndParseTranscriptViaTab(url) {
  const parsedUrl = new URL(url);
  const targetOrigin = parsedUrl.origin;

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

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [url],
      func: async (targetUrl) => {
        // This runs IN the tab context where DOMParser is available
        try {
          const res = await fetch(targetUrl, { credentials: "include" });
          const html = await res.text();

          // Check for login page
          if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
            return { error: "LOGIN_REQUIRED", status: res.status };
          }

          const looksLikeLogin = html.toLowerCase().slice(0, 2000).includes("login") ||
            html.toLowerCase().slice(0, 2000).includes("đăng nhập");
          if (looksLikeLogin) {
            return { error: "LOGIN_REQUIRED", status: res.status };
          }

          // Parse the HTML
          const NORM = (s) => (s || "").replace(/\s+/g, " ").trim().toUpperCase();
          const toNum = (txt) => {
            const m = (txt || "").match(/-?\d+(?:[.,]\d+)?/);
            return m ? parseFloat(m[0].replace(",", ".")) : NaN;
          };

          const doc = new DOMParser().parseFromString(html, "text/html");
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
                  name: header.findIndex((v) => v.includes("SUBJECT NAME") || v.includes("SUBJECT")),
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
                    semester: idx.semester >= 0 ? tds[idx.semester]?.textContent.trim() : "",
                    code: idx.code >= 0 ? tds[idx.code]?.textContent.trim() : "",
                    name: idx.name >= 0 ? tds[idx.name]?.textContent.trim() : "",
                    credit: idx.credit >= 0 ? toNum(tds[idx.credit]?.textContent) : NaN,
                    grade: idx.grade >= 0 ? toNum(tds[idx.grade]?.textContent) : NaN,
                    status: idx.status >= 0 ? tds[idx.status]?.textContent.trim() : "",
                  };
                  if (!row.code && !row.name && !Number.isFinite(row.credit)) continue;
                  rows.push(row);
                }

                return { status: res.status, rows, htmlLength: html.length };
              }
            }
          }

          // No transcript table found
          return { status: res.status, rows: [], htmlLength: html.length, noTable: true };

        } catch (err) {
          return { error: err?.message || String(err) };
        }
      },
    });

    if (createdTab) {
      await chrome.tabs.remove(tabId);
    }

    if (!result || !result.result) return { error: "NO_RESULT" };
    return result.result;
  } catch (e) {
    if (createdTab) {
      try { await chrome.tabs.remove(tabId); } catch (x) { }
    }
    throw e;
  }
}

function looksLikeLoginPage(html) {
  if (!html) return true;
  const lc = html.toLowerCase().slice(0, 2000);
  if (lc.includes("login") || lc.includes("đăng nhập") || lc.includes("dang nhap")) return true;
  return false;
}

// Fetch HTML via content script (first-party context) for proper cookie handling
async function fetchHtmlViaTab(url) {
  console.log("🌐 Fetching via content script:", url);
  const result = await fetchViaContentScript(url);

  if (!result || result.error) {
    console.error("❌ Content script fetch failed:", result?.error);
    throw new Error(result?.error || "FETCH_FAILED");
  }

  // Check if redirected to login
  if (result.redirected && /\/Default\.aspx$/i.test(new URL(result.url).pathname)) {
    throw new Error("LOGIN_REQUIRED");
  }

  // Check if looks like login page
  if (looksLikeLoginPage(result.text)) {
    throw new Error("LOGIN_REQUIRED");
  }

  if (result.status !== 200) {
    throw new Error(`HTTP ${result.status}`);
  }

  return result.text;
}
function extractFingerprint(html) {
  const s = html.replace(/\s+/g, " ").slice(0, 20000);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 131 + s.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

// Minimal parser to pull weekly entries with statuses
function parseScheduleOfWeek(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const NORM = (s) => (s || "").replace(/\s+/g, " ").trim().toUpperCase();
  const result = [];
  const tables = [...doc.querySelectorAll("table")];
  let grid = null;
  for (const t of tables) {
    const txt = NORM(t.textContent);
    if (
      txt.includes("YEAR") &&
      txt.includes("WEEK") &&
      /MON|TUE|WED|THU|FRI|SAT|SUN/.test(txt)
    ) {
      grid = t;
      break;
    }
  }
  if (!grid) return result;
  const rows = [...grid.querySelectorAll("tr")];
  // header day columns
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const txt = NORM(rows[i].textContent);
    if (
      /MON/.test(txt) &&
      /TUE/.test(txt) &&
      /WED/.test(txt) &&
      /THU/.test(txt) &&
      /FRI/.test(txt)
    ) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return result;
  const headerCells = [...rows[headerRowIdx].querySelectorAll("td,th")];
  const dayCols = [];
  headerCells.forEach((c, i) => {
    const text = c.textContent.trim();
    const m = text.match(/(MON|TUE|WED|THU|FRI|SAT|SUN)/i);
    if (m) {
      const date = (text.match(/\d{2}\/\d{2}/) || [])[0] || null;
      dayCols.push({ name: m[1].toUpperCase(), idx: i, date });
    }
  });
  if (dayCols.length < 5) return result;
  function isSlotLabel(s) {
    return /^slot\s*\d+/i.test(s);
  }
  const slotRows = rows.filter((r) => {
    const c0 = r.querySelector("td,th");
    return c0 && isSlotLabel((c0.textContent || "").trim());
  });

  slotRows.forEach((r) => {
    const cells = [...r.querySelectorAll("td,th")];
    const slotName = (cells[0]?.textContent || "").trim(); // "Slot 1"
    dayCols.forEach((d) => {
      const cell = cells[d.idx];
      if (!cell) return;
      const raw = (cell.textContent || "").trim();
      if (!raw || raw === "-") return;
      const codeMatch = raw.match(/\b[A-Z]{3}\d{3}\b/);
      const code = codeMatch ? codeMatch[0] : "";
      if (!code) return;
      let status = "";
      if (/attended/i.test(raw)) status = "attended";
      else if (/not yet/i.test(raw)) status = "not yet";
      else if (/absent|v\u1eafng/i.test(raw)) status = "absent";
      result.push({
        key: `${d.date || d.name}|${slotName}|${code}`,
        course: code,
        day: d.name,
        date: d.date,
        slot: slotName,
        status: status || raw,
      });
    });
  });
  return result;
}

// ========== Background Transcript Fetch ==========
async function fetchTranscriptInBackground(forceRefresh = false) {
  // Prevent duplicate fetches
  if (loadingState.transcript) {
    console.log("📋 Transcript fetch already in progress, skipping...");
    return { status: 'already_loading' };
  }

  // Check cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = await STORAGE.get("cache_transcript", null);
    const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days - match popup logic
    const cachedRows = cached?.data?.rows || [];

    // Only consider cache fresh if it has actual data
    if (cached && cached.ts && cachedRows.length > 0 && Date.now() - cached.ts < CACHE_MAX_AGE) {
      console.log("📋 Transcript cache is fresh with", cachedRows.length, "courses, skipping fetch (age:", Math.round((Date.now() - cached.ts) / 1000), "s)");
      return { status: 'cache_fresh', rows: cachedRows };
    }

    // Cache is stale or empty
    if (cached && cachedRows.length === 0) {
      console.log("📋 Transcript cache is empty, will fetch fresh data");
    } else if (cached && cached.ts) {
      console.log("📋 Transcript cache is stale (age:", Math.round((Date.now() - cached.ts) / 1000), "s), will refresh");
    }
  }

  loadingState.transcript = true;
  console.log("📋 Starting background transcript fetch...");

  // Notify popup that loading started (ignore if popup closed)
  chrome.runtime.sendMessage({ type: MSG.TRANSCRIPT_LOADING }).catch(() => { });

  try {
    // Use the new function that fetches AND parses inside content script
    console.log("🌐 Fetching and parsing transcript via content script...");
    const result = await fetchAndParseTranscriptViaTab(TRANSCRIPT_URL);

    console.log("📊 Content script result:", result);

    // Check for errors
    if (result.error) {
      if (result.error === "LOGIN_REQUIRED") {
        await STORAGE.set({ show_login_banner: true });
        throw new Error("LOGIN_REQUIRED");
      }
      throw new Error(result.error);
    }

    const rows = result.rows || [];

    if (result.noTable) {
      console.warn("⚠️ No transcript table found in HTML (length:", result.htmlLength, ")");
    }

    // Save to storage
    await STORAGE.set({
      cache_transcript: { ts: Date.now(), data: { rows } },
      cache_transcript_flat: rows,
      show_login_banner: false,
      last_successful_fetch: Date.now()
    });

    console.log(`✅ Background transcript fetch completed: ${rows.length} courses`);

    // Notify popup if open (ignore if popup closed)
    chrome.runtime.sendMessage({ type: MSG.TRANSCRIPT_READY, rows }).catch(() => { });

    return { status: 'success', rows };

  } catch (e) {
    console.error("❌ Background transcript fetch failed:", e);

    if (e.message === "LOGIN_REQUIRED") {
      await STORAGE.set({ show_login_banner: true });
      return { status: 'login_required' };
    }

    return { status: 'error', error: e.message };

  } finally {
    loadingState.transcript = false;
  }
}

async function pollOnce() {
  const cfg = await STORAGE.get("cfg", {
    activeFrom: "07:00",
    activeTo: "17:40",
    delayMin: 10,
    delayMax: 30,
    pollEvery: 30,
  });

  // Always poll, but with different intervals based on time
  const now = new Date();
  const currentHour = now.getHours();
  const isActiveTime = within(cfg.activeFrom, cfg.activeTo);

  // If outside active hours, poll less frequently (every 2 hours)
  if (!isActiveTime) {
    console.log("🕐 Outside active hours, skipping detailed polling");
    return;
  }

  try {
    console.log("🔄 Background polling schedule data...");
    const html = await fetchHtml(SCHEDULE_OF_WEEK);
    const fp = extractFingerprint(html);
    const prevFp = await STORAGE.get("att_fp", null);

    const newEntries = parseScheduleOfWeek(html);

    // Validate data before saving - don't overwrite cache with empty/invalid data
    if (!isValidScheduleData(newEntries)) {
      console.warn("⚠️ Invalid schedule data from polling, keeping existing cache");
      return;
    }

    await STORAGE.set({
      att_entries: newEntries,
      att_fp: fp,
      last_poll_time: Date.now(),
    });

    await STORAGE.set({
      cache_attendance: {
        ts: Date.now(),
        data: { entries: newEntries, todayRows: [] },
      },
      cache_attendance_flat: newEntries,
    });

    console.log(
      `✅ Background polling completed: ${newEntries.length} entries`
    );
  } catch (e) {
    console.error("❌ Background polling failed:", e);

    // If it's a login error, don't spam retries
    if (e.message === "LOGIN_REQUIRED") {
      console.log("🔐 Login required, will retry later");
      return;
    }

    // For other errors, schedule a retry
    const retryDelay = 5 * 60 * 1000; // 5 minutes
    setTimeout(() => {
      console.log("🔄 Retrying background poll after error...");
      pollOnce();
    }, retryDelay);
  }
}

async function schedulePollAlarm() {
  const cfg = await STORAGE.get("cfg", { pollEvery: 30 });

  // Create multiple alarms for different polling frequencies
  chrome.alarms.create("att_poll_active", {
    periodInMinutes: Math.max(5, cfg.pollEvery), // Active hours: every 5-30 minutes
  });

  chrome.alarms.create("att_poll_inactive", {
    periodInMinutes: 120, // Inactive hours: every 2 hours
  });

  console.log(
    "⏰ Scheduled polling alarms: active every",
    Math.max(5, cfg.pollEvery),
    "min, inactive every 120 min"
  );
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await schedulePollAlarm();
  await updateActionPopup(); // Set initial popup behavior

  // On fresh install, start fetching transcript immediately
  if (details.reason === 'install') {
    console.log("🆕 Extension installed, starting background fetch...");
    setTimeout(() => fetchTranscriptInBackground(), 1000);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await schedulePollAlarm();
  await updateActionPopup(); // Set popup behavior on startup
  // Reset login cache on browser startup (so first extension click will check)
  await STORAGE.set({ last_login_check_ts: 0, cached_login_status: null });
  // Also try to fetch transcript on browser startup
  fetchTranscriptInBackground();
});

// ========== View Mode Handler ==========
async function updateActionPopup() {
  const cfg = await STORAGE.get("cfg", { viewMode: "popup" });
  const viewMode = cfg.viewMode || "popup";

  if (viewMode === "fullpage") {
    // Disable popup so onClicked fires
    await chrome.action.setPopup({ popup: "" });
    console.log("📺 View mode: fullpage - popup disabled");
  } else {
    // Enable popup
    await chrome.action.setPopup({ popup: "pages/popup.html" });
    console.log("📺 View mode: popup - popup enabled");
  }
}

// Handle extension icon click when popup is disabled
chrome.action.onClicked.addListener(async (tab) => {
  // This only fires when popup is disabled (fullpage mode)
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/dashboard.html") });
});

// ========== Message Handlers ==========
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Handle FETCH_TRANSCRIPT request from popup
  if (msg.type === MSG.FETCH_TRANSCRIPT) {
    const forceRefresh = msg.force || false;
    fetchTranscriptInBackground(forceRefresh).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  // Handle FETCH_STATUS request
  if (msg.type === MSG.FETCH_STATUS) {
    sendResponse({ loading: loadingState });
    return true;
  }

  // Handle getAllData request (legacy)
  if (msg.action === "getAllData") {
    (async () => {
      const tcache = await STORAGE.get("cache_transcript", null);
      const acache = await STORAGE.get("cache_attendance", null);
      let transcriptRows = tcache?.rows || tcache?.data?.rows || null;
      let attendanceEntries = acache?.entries || acache?.data?.entries || null;
      let showLoginBanner = false;

      // If missing attendance, try to fetch now
      try {
        if (!attendanceEntries) {
          const docHtml = await fetchHtml(SCHEDULE_OF_WEEK);
          const entries = parseScheduleOfWeek(docHtml);

          // Only save to cache if data is valid (prevents overwriting with empty data)
          if (isValidScheduleData(entries)) {
            await STORAGE.set({
              cache_attendance: {
                ts: Date.now(),
                data: { entries, todayRows: [] },
              },
            });
            attendanceEntries = entries;
          } else {
            console.warn("⚠️ Invalid schedule data from getAllData, not caching");
          }
        }
      } catch (e) {
        if (e.message === "LOGIN_REQUIRED") {
          showLoginBanner = true;
        }
      }

      // For transcript, use cache if available, else trigger background fetch
      if (!transcriptRows) {
        // Trigger background fetch (non-blocking)
        fetchTranscriptInBackground();
      }

      // Set login banner flag
      await STORAGE.set({ show_login_banner: showLoginBanner });

      const cfg = await STORAGE.get("cfg", {
        activeFrom: "07:00",
        activeTo: "17:40",
        delayMin: 10,
        delayMax: 30,
        pollEvery: 30,
      });
      try {
        await STORAGE.set({
          cache_transcript_flat: transcriptRows || [],
          cache_attendance_flat: attendanceEntries || [],
        });
      } catch (e) { }
      sendResponse({
        ok: true,
        transcript: transcriptRows || [],
        attendance: attendanceEntries || [],
        schedule: attendanceEntries || [],
        settings: cfg,
        show_login_banner: showLoginBanner,
      });
    })();
    return true;
  }

  // Handle CFG_UPDATED
  if (msg.type === "CFG_UPDATED") {
    Promise.all([schedulePollAlarm(), updateActionPopup()]).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
