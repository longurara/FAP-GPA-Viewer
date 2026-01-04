const STORAGE = {
  get: (k, d) =>
    new Promise((r) => chrome.storage.local.get({ [k]: d }, (v) => r(v[k]))),
  set: (obj) => new Promise((r) => chrome.storage.local.set(obj, r)),
  remove: (k) => new Promise((r) => chrome.storage.local.remove(k, r)),
};

const SCHEDULE_OF_WEEK = "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx";

const TRANSCRIPT_URL = "https://fap.fpt.edu.vn/Grade/StudentTranscript.aspx";

function toNum(txt) {
  const m = String(txt || "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : NaN;
}
function NORM_TXT(s) {
  return (s || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function parseTranscriptDoc(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tables = [...doc.querySelectorAll("table")];
    for (const t of tables) {
      const trs = [...t.querySelectorAll("tr")];
      for (const tr of trs) {
        const labels = [...tr.children].map((td) => NORM_TXT(td.textContent));
        if (labels.includes("CREDIT") && labels.includes("GRADE")) {
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
          return rows;
        }
      }
    }
  } catch (e) {}
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

chrome.runtime.onInstalled.addListener(async () => {
  await schedulePollAlarm();
});
chrome.runtime.onStartup.addListener(async () => {
  await schedulePollAlarm();
});

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (msg.action === "getAllData") {
    (async () => {
      const tcache = await STORAGE.get("cache_transcript", null);
      const acache = await STORAGE.get("cache_attendance", null);
      let transcriptRows = tcache?.rows || tcache?.data?.rows || null;
      let attendanceEntries = acache?.entries || acache?.data?.entries || null;
      let showLoginBanner = false;

      // If missing, try to fetch now
      try {
        if (!attendanceEntries) {
          const docHtml = await fetchHtml(SCHEDULE_OF_WEEK);
          const entries = parseScheduleOfWeek(docHtml);
          await STORAGE.set({
            cache_attendance: {
              ts: Date.now(),
              data: { entries, todayRows: [] },
            },
          });
          attendanceEntries = entries;
        }
      } catch (e) {
        if (e.message === "LOGIN_REQUIRED") {
          showLoginBanner = true;
        }
      }

      try {
        if (!transcriptRows) {
          const html = await fetchHtml(TRANSCRIPT_URL);
          const rows = parseTranscriptDoc(html);
          await STORAGE.set({
            cache_transcript: { ts: Date.now(), data: { rows } },
          });
          transcriptRows = rows;
        }
      } catch (e) {
        if (e.message === "LOGIN_REQUIRED") {
          showLoginBanner = true;
        }
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
      } catch (e) {}
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

  if (msg.type === "CFG_UPDATED") {
    await schedulePollAlarm();
    sendResponse({ ok: true });
    return true;
  }
});

// Schedule class reminders on install
chrome.runtime.onInstalled.addListener(async () => {
  // Auto update check disabled to avoid GitHub API rate limit
  // setTimeout(checkUpdateAndNotify, 5000);
  await scheduleClassReminders();
});
