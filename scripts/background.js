const STORAGE = {
  get: (k, d) =>
    new Promise((r) => chrome.storage.local.get({ [k]: d }, (v) => {
      if (chrome.runtime.lastError) {
        console.warn("[BG] Storage get error:", chrome.runtime.lastError.message);
        r(d);
        return;
      }
      r(v[k]);
    })),
  set: (obj) => new Promise((r) => chrome.storage.local.set(obj, () => {
    if (chrome.runtime.lastError) {
      console.warn("[BG] Storage set error:", chrome.runtime.lastError.message);
    }
    r();
  })),
  remove: (k) => new Promise((r) => chrome.storage.local.remove(k, () => {
    if (chrome.runtime.lastError) {
      console.warn("[BG] Storage remove error:", chrome.runtime.lastError.message);
    }
    r();
  })),
};

const SCHEDULE_OF_WEEK = "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx";

const TRANSCRIPT_URL = "https://fap.fpt.edu.vn/Grade/StudentTranscript.aspx";

const LMS_CALENDAR_URL = "https://lms-hcm.fpt.edu.vn/calendar/view.php?view=upcoming";

// ========== Message Types ==========
const MSG = {
  FETCH_TRANSCRIPT: 'FETCH_TRANSCRIPT',
  TRANSCRIPT_READY: 'TRANSCRIPT_READY',
  TRANSCRIPT_LOADING: 'TRANSCRIPT_LOADING',
  FETCH_STATUS: 'FETCH_STATUS',
  FETCH_LMS_EVENTS: 'FETCH_LMS_EVENTS'
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

  // Check if at least one entry has valid course code
  // Matches: ABC123, GDQP01, LAB211 (2-4 letters + 2-3 digits + optional letter suffix)
  const hasValidEntry = entries.some(e =>
    e && e.course && /^[A-Z]{2,4}\d{2,3}[A-Z]?$/.test(e.course)
  );

  return hasValidEntry;
}

// NOTE: parseTranscriptDoc removed — DOMParser is not available in Service Worker.
// Transcript parsing is done inside content script via fetchAndParseTranscriptViaTab().



// NOTE: fetchHtml removed — no longer used. Schedule/transcript fetching now uses
// fetchAndParseScheduleViaTab / fetchAndParseTranscriptViaTab which handle login detection internally.

// ========== Content Script Based Fetch (for cookie access) ==========
async function waitForTabComplete(tabId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(true);
    }

    // Check if already complete before attaching listener
    chrome.tabs.get(tabId).then((tab) => {
      if (settled) return;
      if (tab.status === "complete") {
        settled = true;
        clearTimeout(timer);
        resolve(true);
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    }).catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    });
  });
}

// Dedup map: prevents creating multiple tabs for the same origin when called concurrently
const _pendingTabFetches = new Map();

async function fetchViaContentScript(url) {
  const parsedUrl = new URL(url);
  const targetOrigin = parsedUrl.origin;

  // If a fetch for this origin is already in-flight, reuse the same Promise
  if (_pendingTabFetches.has(targetOrigin)) {
    console.log("[dedup] Reusing in-flight fetch for", targetOrigin);
    return _pendingTabFetches.get(targetOrigin);
  }

  const promise = _doFetchViaContentScript(url).finally(() => {
    _pendingTabFetches.delete(targetOrigin);
  });
  _pendingTabFetches.set(targetOrigin, promise);
  return promise;
}

async function _doFetchViaContentScript(url) {
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

// STAB #3 FIX: Dedup maps for fetchAndParse functions — prevent concurrent calls
// from creating multiple tabs for the same origin (same issue that fetchViaContentScript already solves).
const _pendingTranscriptFetch = new Map();
const _pendingScheduleFetch = new Map();

// Fetch AND PARSE transcript inside content script (where DOMParser is available)
// BUG-01 FIX: Accept optional tabTracker object so callers can register the tabId
// created during fetch and close it if a timeout occurs (orphan tab prevention).
async function fetchAndParseTranscriptViaTab(url, tabTracker = null) {
  const parsedUrl = new URL(url);
  const targetOrigin = parsedUrl.origin;

  // STAB #3 FIX: If a transcript fetch is already in-flight, reuse the same Promise
  if (_pendingTranscriptFetch.has(targetOrigin)) {
    console.log("[dedup] Reusing in-flight transcript fetch for", targetOrigin);
    return _pendingTranscriptFetch.get(targetOrigin);
  }

  const promise = _doFetchAndParseTranscriptViaTab(url, tabTracker).finally(() => {
    _pendingTranscriptFetch.delete(targetOrigin);
  });
  _pendingTranscriptFetch.set(targetOrigin, promise);
  return promise;
}

async function _doFetchAndParseTranscriptViaTab(url, tabTracker = null) {
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
    // BUG-01 FIX: Register tabId in tabTracker immediately after creation so the
    // timeout handler (in Promise.race) can close this tab if it fires before
    // _doFetchAndParseTranscriptViaTab has a chance to clean up itself.
    if (tabTracker) tabTracker.id = tabId;
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

          // Check for login page — exclude "logout"/"lbllogin" which appear on logged-in pages
          const _lc = html.toLowerCase().slice(0, 2000);
          const looksLikeLogin = _lc.includes("đăng nhập") ||
            (_lc.includes("login") && !_lc.includes("logout") && !_lc.includes("lbllogin"));
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


// NOTE: parseScheduleOfWeek with DOMParser removed — not available in Service Worker.
// Schedule parsing is now done inside content script context via fetchAndParseScheduleViaTab().

// Fetch AND PARSE schedule inside content script (where DOMParser is available)
async function fetchAndParseScheduleViaTab(url) {
  const parsedUrl = new URL(url);
  const targetOrigin = parsedUrl.origin;

  // STAB #3 FIX: Dedup map for schedule fetch
  if (_pendingScheduleFetch.has(targetOrigin)) {
    console.log("[dedup] Reusing in-flight schedule fetch for", targetOrigin);
    return _pendingScheduleFetch.get(targetOrigin);
  }

  const promise = _doFetchAndParseScheduleViaTab(url).finally(() => {
    _pendingScheduleFetch.delete(targetOrigin);
  });
  _pendingScheduleFetch.set(targetOrigin, promise);
  return promise;
}

async function _doFetchAndParseScheduleViaTab(url) {
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
        try {
          const res = await fetch(targetUrl, { credentials: "include" });
          const html = await res.text();

          if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
            return { error: "LOGIN_REQUIRED" };
          }

          // Check for login page — exclude "logout"/"lbllogin" which appear on logged-in pages
          const lc = html.toLowerCase().slice(0, 2000);
          if (lc.includes("đăng nhập") || (lc.includes("login") && !lc.includes("logout") && !lc.includes("lbllogin"))) {
            return { error: "LOGIN_REQUIRED" };
          }

          const NORM = (s) => (s || "").replace(/\s+/g, " ").trim().toUpperCase();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const entries = [];
          const tables = [...doc.querySelectorAll("table")];
          let grid = null;
          for (const t of tables) {
            const txt = NORM(t.textContent);
            if (txt.includes("YEAR") && txt.includes("WEEK") && /MON|TUE|WED|THU|FRI|SAT|SUN/.test(txt)) {
              grid = t;
              break;
            }
          }
          if (!grid) return { entries: [], htmlLength: html.length };

          const rows = [...grid.querySelectorAll("tr")];
          let headerRowIdx = -1;
          for (let i = 0; i < Math.min(8, rows.length); i++) {
            const txt = NORM(rows[i].textContent);
            if (/MON/.test(txt) && /TUE/.test(txt) && /WED/.test(txt) && /THU/.test(txt) && /FRI/.test(txt)) {
              headerRowIdx = i;
              break;
            }
          }
          if (headerRowIdx === -1) return { entries: [], htmlLength: html.length };

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
          if (dayCols.length < 5) return { entries: [], htmlLength: html.length };

          const slotRows = rows.filter((r) => {
            const c0 = r.querySelector("td,th");
            return c0 && /^slot\s*\d+/i.test((c0.textContent || "").trim());
          });

          slotRows.forEach((r) => {
            const cells = [...r.querySelectorAll("td,th")];
            const slotName = (cells[0]?.textContent || "").trim();
            dayCols.forEach((d) => {
              const cell = cells[d.idx];
              if (!cell) return;
              const raw = (cell.textContent || "").trim();
              if (!raw || raw === "-") return;
              const codeMatch = raw.match(/\b[A-Za-z]{2,4}\d{2,3}[a-z]?\b/);
              const code = codeMatch ? codeMatch[0].toUpperCase() : "";
              if (!code) return;
              let status = "not yet";
              if (/attended/i.test(raw)) status = "attended";
              else if (/not yet/i.test(raw)) status = "not yet";
              else if (/absent|vắng/i.test(raw)) status = "absent";
              // Extract room and time for unified schema
              const roomMatch = raw.match(/at\s+([A-Za-z0-9._\-\/]+)/);
              const timeMatch = raw.match(/\((\d{1,2}:\d{2}-\d{1,2}:\d{2})\)/);
              entries.push({
                key: `${d.date || d.name}|${slotName}|${code}`,
                course: code,
                day: d.name,
                date: d.date,
                slot: slotName,
                room: roomMatch ? roomMatch[1] : '',
                time: timeMatch ? timeMatch[1] : '',
                status,
              });
            });
          });
          return { entries, htmlLength: html.length };
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
    const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes - aligned with popup
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

  // Maximum time to wait for the transcript fetch before giving up
  const TRANSCRIPT_TIMEOUT_MS = 35_000;

  // BUG-01 FIX: Use a shared tabTracker object instead of a plain variable.
  // _doFetchAndParseTranscriptViaTab writes the created tabId into tabTracker.id
  // immediately after chrome.tabs.create(), so the timeout handler below can read it
  // and close the orphan tab even though Promise.race has already settled.
  // Previously _tabIdForCleanup was declared here but NEVER assigned, making the
  // orphan-tab cleanup code dead code.
  const tabTracker = { id: null };

  try {
    // Use the new function that fetches AND parses inside content script
    console.log("🌐 Fetching and parsing transcript via content script...");

    const result = await Promise.race([
      fetchAndParseTranscriptViaTab(TRANSCRIPT_URL, tabTracker),
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error("TRANSCRIPT_TIMEOUT"));
          // BUG-01 FIX: tabTracker.id is now reliably set by _doFetchAndParseTranscriptViaTab
          // when it creates a new tab, so this cleanup actually works.
          if (tabTracker.id !== null) {
            chrome.tabs.remove(tabTracker.id).catch(() => { });
            console.warn("[BG] Closed orphan tab", tabTracker.id, "after TRANSCRIPT_TIMEOUT");
            tabTracker.id = null;
          }
        }, TRANSCRIPT_TIMEOUT_MS)
      ),
    ]);

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
// ========== Auto-disable on sensitive pages (transparency) ==========
const SENSITIVE_URLS = [
  "fap.fpt.edu.vn/FrontOffice/ShoppingCart.aspx"
];

const sensitiveTabIds = new Set();

function isSensitivePage(url) {
  return url && SENSITIVE_URLS.some(s => url.includes(s));
}

async function disableOnTab(tabId) {
  if (sensitiveTabIds.has(tabId)) return;
  sensitiveTabIds.add(tabId);
  console.log("🔒 Sensitive page — pausing extension on tab", tabId);

  // Grey out icon + show OFF badge
  chrome.action.setIcon({ tabId, path: { "128": "assets/icons/icon128.png" } });
  chrome.action.setBadgeText({ tabId, text: "OFF" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#dc3545" });
  chrome.action.setTitle({ tabId, title: "FAP Dashboard — Tạm tắt (trang thanh toán)" });
  chrome.action.setPopup({ tabId, popup: "" }); // disable popup

  // Remove any injected CSS on this tab
  try {
    await chrome.scripting.removeCSS({
      target: { tabId }, files: [
        "styles/fap-subjectfees.css"
      ]
    });
  } catch (_) { /* tab may not have these styles */ }
}

async function enableOnTab(tabId) {
  if (!sensitiveTabIds.has(tabId)) return;
  sensitiveTabIds.delete(tabId);
  console.log("🔓 Left sensitive page — restoring extension on tab", tabId);

  // Restore icon + clear badge
  chrome.action.setIcon({ tabId, path: { "128": "assets/icons/icon128.png" } });
  chrome.action.setBadgeText({ tabId, text: "" });
  chrome.action.setTitle({ tabId, title: "FAP Dashboard" });

  // Respect user's viewMode setting when restoring popup
  const cfg = await STORAGE.get("cfg", { viewMode: "popup" });
  const popup = (cfg.viewMode === "fullpage") ? "" : "pages/popup.html";
  chrome.action.setPopup({ tabId, popup });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!url) return;

  if (isSensitivePage(url)) {
    disableOnTab(tabId);
  } else if (sensitiveTabIds.has(tabId)) {
    enableOnTab(tabId);
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  sensitiveTabIds.delete(tabId);
});


chrome.runtime.onInstalled.addListener(async (details) => {
  await updateActionPopup();

  if (details.reason === 'install') {
    console.log("🆕 Extension installed, setting up defaults...");

    // Set default wallpaper for new users
    try {
      const sampleUrl = chrome.runtime.getURL("wallpaper/sample.jpg");
      const res = await fetch(sampleUrl);
      const blob = await res.blob();

      // Convert to data URL via FileReader workaround (Service Worker)
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      // Chunk-based conversion: process 8KB at a time instead of byte-by-byte
      let binary = "";
      const CHUNK_SIZE = 8192;
      for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, uint8Array.subarray(i, i + CHUNK_SIZE));
      }
      const dataUrl = `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;

      await STORAGE.set({
        background_image: dataUrl,
        background_opacity: 53
      });
      console.log("🖼️ Default wallpaper set successfully");
    } catch (e) {
      console.warn("⚠️ Could not set default wallpaper:", e.message);
    }

    fetchTranscriptInBackground();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await updateActionPopup();
  await STORAGE.set({ last_login_check_ts: 0, cached_login_status: null });

  // Auto-login on browser startup
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(
        ["auto_login_enabled", "auto_login_on_startup", "auto_login_username", "auto_login_password",
          "auto_login_lms_enabled", "auto_login_lms_startup", "auto_login_lms_username", "auto_login_lms_password"],
        (result) => resolve(result)
      );
    });

    if (data.auto_login_on_startup && data.auto_login_enabled &&
      data.auto_login_username && data.auto_login_password) {
      console.log("Auto-login on startup: opening FAP tab...");
      const tab = await chrome.tabs.create({
        url: "https://fap.fpt.edu.vn/",
        active: false
      });
      _monitorForCloudflare(tab.id);
    }

    // Also auto-login LMS on startup if enabled (uses separate credentials)
    if (data.auto_login_lms_startup && data.auto_login_lms_enabled &&
      data.auto_login_lms_username && data.auto_login_lms_password) {
      console.log("Auto-login on startup: opening LMS tab...");
      // NEW #4 FIX: await the tab creation and track the tabId for potential cleanup.
      // Without await, if startup is interrupted the tab reference is lost.
      chrome.tabs.create({
        url: "https://lms-hcm.fpt.edu.vn/login/index.php",
        active: false
      }).catch(e => console.warn("[BG] LMS startup tab creation failed:", e.message));
    }
  } catch (e) {
    console.warn("Auto-login on startup error:", e.message);
  }

  // STAB #8 FIX: Trigger transcript prefetch on startup if cache is stale.
  // Without this, popup shows empty GPA until user manually refreshes.
  // Use a short delay to not block other startup work.
  setTimeout(() => {
    fetchTranscriptInBackground(false /* use cache if fresh */).catch(e =>
      console.warn("[BG] Startup transcript prefetch failed:", e.message)
    );
  }, 3000);
});

function _monitorForCloudflare(tabId) {
  // Event-based monitoring: react immediately when tab status changes
  // instead of polling every 5s (which could miss fast loads)
  function onTabUpdated(updatedId, changeInfo, tab) {
    if (updatedId !== tabId || changeInfo.status !== "complete") return;

    cleanup();

    const url = tab.url || "";
    if (url.includes("Student.aspx") || url.includes("StudentTranscript") || url.includes("ScheduleOfWeek")) {
      console.log("Auto-login on startup succeeded!");
      return;
    }
    if (tab.title && (tab.title.includes("Just a moment") || tab.title.includes("Attention Required") || tab.title.includes("Cloudflare"))) {
      console.log("Cloudflare detected! Showing tab to user...");
      chrome.tabs.update(tabId, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    }
  }

  function onTabRemoved(removedId) {
    if (removedId === tabId) cleanup();
  }

  function cleanup() {
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
    clearTimeout(safetyTimer);
  }

  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);

  // Safety timeout: remove listeners after 60s if tab never finishes
  const safetyTimer = setTimeout(cleanup, 60_000);
}

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
    // NEW #3 FIX: Add .catch() to prevent message channel from hanging if fetch throws.
    // Without this, a rejected Promise silently drops the response and the popup waits forever.
    fetchTranscriptInBackground(forceRefresh)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("[BG] FETCH_TRANSCRIPT error:", err);
        sendResponse({ status: 'error', error: err?.message || String(err) });
      });
    return true; // Keep channel open for async response
  }

  // Handle FETCH_STATUS request
  if (msg.type === MSG.FETCH_STATUS) {
    sendResponse({ loading: loadingState });
    return true;
  }

  // Handle getAllData request (legacy)
  // WARN-04: This handler is kept for backward compatibility. Search the codebase
  // for callers before removing. If no content scripts / popup code sends
  // { action: "getAllData" } anymore, this block can be safely deleted.
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
          const scheduleResult = await fetchAndParseScheduleViaTab(SCHEDULE_OF_WEEK);
          if (scheduleResult.error) {
            if (scheduleResult.error === "LOGIN_REQUIRED") throw new Error("LOGIN_REQUIRED");
            console.warn("⚠️ Schedule fetch error:", scheduleResult.error);
          } else {
            const entries = scheduleResult.entries || [];
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
        viewMode: "popup",
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

  // Handle FETCH_LMS_EVENTS request
  if (msg.type === MSG.FETCH_LMS_EVENTS) {
    (async () => {
      try {
        const result = await fetchViaContentScript(LMS_CALENDAR_URL);
        if (result && result.text) {
          sendResponse({ html: result.text });
        } else {
          sendResponse({ error: result?.error || 'FETCH_FAILED' });
        }
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Handle CFG_UPDATED
  if (msg.type === "CFG_UPDATED") {
    // F5 #4 FIX: Add .catch() to prevent unhandled rejection if updateActionPopup() throws
    updateActionPopup()
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error("[BG] CFG_UPDATED error:", err);
        sendResponse({ ok: false, error: err?.message });
      });
    return true;
  }

  // Handle TEST_NOTIFY from settings
  if (msg.type === "TEST_NOTIFY") {
    sendResponse({ ok: true, message: "Notification system is working!" });
    return true;
  }
});
