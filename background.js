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
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Cần đăng nhập FAP",
        message: "Bạn chưa đăng nhập. Đã mở trang đăng nhập FEID.",
        priority: 2,
      });
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
    pollEvery: 15,
  });
  if (!within(cfg.activeFrom, cfg.activeTo)) return;
  try {
    const html = await fetchHtml(SCHEDULE_OF_WEEK);
    const fp = extractFingerprint(html);
    const prevFp = await STORAGE.get("att_fp", null);

    // Compare entries to craft better notifications
    const newEntries = parseScheduleOfWeek(html);
    const oldEntries = await STORAGE.get("att_entries", []);
    const oldMap = new Map(oldEntries.map((e) => [e.key, e.status]));

    const newlyAttended = [];
    for (const e of newEntries) {
      const prevStatus = oldMap.get(e.key) || "";
      if (e.status === "attended" && prevStatus !== "attended") {
        newlyAttended.push(e.course);
      }
    }
    // persist latest snapshot
    await STORAGE.set({ att_entries: newEntries, att_fp: fp });

    if (prevFp && prevFp !== fp && newlyAttended.length) {
      const delay = Math.floor(
        cfg.delayMin + Math.random() * (cfg.delayMax - cfg.delayMin)
      );
      const at = Date.now() + delay * 60 * 1000;
      const alarmId = `att_notify_${at}`;
      chrome.alarms.create(alarmId, { when: at });
      const courses = Array.from(new Set(newlyAttended));
      const msg =
        courses.length === 1
          ? `Môn ${courses[0]} đã được điểm danh`
          : `Các môn ${courses.slice(0, 3).join(", ")} đã được điểm danh`;
      const pending = await STORAGE.get("pending_msgs", {});
      pending[alarmId] = msg;
      await STORAGE.set({
        pending_msgs: pending,
        last_reason: `Attendance changed (detected ${courses.length})`,
      });
      // also update popup cache silently
      await STORAGE.set({
        cache_attendance: {
          ts: Date.now(),
          data: { entries: newEntries, todayRows: [] },
        },
      });
    } else if (!prevFp) {
      await STORAGE.set({ att_fp: fp });
    }
  } catch (e) {
    /* ignore */
  }
}

async function schedulePollAlarm() {
  const cfg = await STORAGE.get("cfg", { pollEvery: 15 });
  chrome.alarms.create("att_poll", {
    periodInMinutes: Math.max(5, cfg.pollEvery),
  });
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
      } catch (e) {}

      try {
        if (!transcriptRows) {
          const html = await fetchHtml(TRANSCRIPT_URL);
          const rows = parseTranscriptDoc(html);
          await STORAGE.set({
            cache_transcript: { ts: Date.now(), data: { rows } },
          });
          transcriptRows = rows;
        }
      } catch (e) {}

      const cfg = await STORAGE.get("cfg", {
        activeFrom: "07:00",
        activeTo: "17:40",
        delayMin: 10,
        delayMax: 30,
        pollEvery: 15,
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
      });
    })();
    return true;
  }

  if (msg.type === "CFG_UPDATED") {
    await schedulePollAlarm();
    sendResponse({ ok: true });
  }
  if (msg.type === "TEST_NOTIFY") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "FAP Attendance",
      message: "Môn DEMO101 đã được điểm danh",
      priority: 2,
    });
    sendResponse({ ok: true });
  }
});

// ===== GitHub Update Check =====
const GH_REPO = "longurara/FAP-GPA-Viewer";
const GH_LATEST = `https://api.github.com/repos/${GH_REPO}/releases/latest`;
const RELEASE_LATEST_PAGE =
  "https://github.com/longurara/FAP-GPA-Viewer/releases/latest";

async function checkUpdateAndNotify() {
  try {
    const res = await fetch(GH_LATEST, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const j = await res.json();
    const tag = (j.tag_name || j.name || "").replace(/^v/i, "");
    const curr = chrome.runtime.getManifest().version;
    const notified = await STORAGE.get("__last_notified_version__", "");
    function semverParts(v) {
      const m = String(v || "")
        .trim()
        .match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!m) return [0, 0, 0];
      return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    }
    function cmp(a, b) {
      const A = semverParts(a),
        B = semverParts(b);
      for (let i = 0; i < 3; i++) {
        if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
      }
      return 0;
    }
    if (cmp(tag, curr) > 0 && tag !== notified) {
      chrome.notifications.create("update_avail", {
        type: "basic",
        iconUrl: "icon128.png",
        title: "FAP GPA Viewer – có bản mới",
        message: `Phiên bản ${tag} đã phát hành. Nhấn để mở trang cập nhật.`,
        priority: 2,
      });
      await STORAGE.set({ __last_notified_version__: tag });
    }
  } catch (e) {
    /* silent */
  }
}

async function scheduleUpdateAlarm() {
  chrome.alarms.create("UPDATE_CHECK", {
    periodInMinutes: 60 * 6,
    when: Date.now() + 30 * 1000,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "getAllData_fallback") {
    (async () => {
      const tcache = await STORAGE.get("cache_transcript", null);
      const acache = await STORAGE.get("cache_attendance", null);
      const cfg = await STORAGE.get("cfg", {
        activeFrom: "07:00",
        activeTo: "17:40",
        delayMin: 10,
        delayMax: 30,
        pollEvery: 15,
      });
      const transcriptRows = tcache?.rows || tcache?.data?.rows || [];
      const attendance = acache?.entries || acache?.data?.entries || [];
      sendResponse({
        ok: true,
        transcript: transcriptRows,
        attendance,
        schedule: attendance,
        settings: cfg,
      });
    })();
    return true;
  }

  // Smart Study Mode message handlers
  if (msg && msg.action === "startSmartStudy") {
    (async () => {
      try {
        // Get current active tab
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await smartStudyMode.startStudySession(activeTab?.id, activeTab);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error starting smart study:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg && msg.action === "endSmartStudy") {
    (async () => {
      try {
        console.log("Ending smart study session...");
        await smartStudyMode.endStudySession();
        console.log("Smart study session ended successfully");
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error ending smart study:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg && msg.action === "updateSmartStudySettings") {
    (async () => {
      try {
        smartStudyMode.settings = msg.settings;
        await STORAGE.set({ smartStudySettings: msg.settings });
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error updating smart study settings:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg && msg.action === "enableSmartStudy") {
    (async () => {
      try {
        await smartStudyMode.enableSmartStudy();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error enabling smart study:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg && msg.action === "disableSmartStudy") {
    (async () => {
      try {
        await smartStudyMode.disableSmartStudy();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error disabling smart study:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Pomodoro timer messages
  if (msg && msg.action === "pomodoro_start") {
    (async () => {
      await startPomodoroTimer(msg.mode, msg.duration);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg && msg.action === "pomodoro_pause") {
    (async () => {
      await pausePomodoroTimer();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg && msg.action === "pomodoro_resume") {
    (async () => {
      await resumePomodoroTimerFromPause();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg && msg.action === "pomodoro_reset") {
    (async () => {
      await resetPomodoroTimer();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg && msg.action === "pomodoro_get_status") {
    (async () => {
      const activeTimer = await STORAGE.get("active_timer", null);
      sendResponse({ ok: true, activeTimer });
    })();
    return true;
  }
});

// ===== SMART NOTIFICATIONS - Pre-Class Reminders =====
async function scheduleClassReminders() {
  try {
    const acache = await STORAGE.get("cache_attendance", null);
    const entries = acache?.entries || acache?.data?.entries || [];

    if (!entries.length) return;

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const todayDate = `${dd}/${mm}`;

    const todayClasses = entries.filter((e) => e.date === todayDate && e.time);

    // Clear old class reminder alarms
    const allAlarms = await chrome.alarms.getAll();
    allAlarms.forEach((alarm) => {
      if (alarm.name.startsWith("class_reminder_")) {
        chrome.alarms.clear(alarm.name);
      }
    });

    // Schedule new reminders (15 minutes before each class)
    todayClasses.forEach((cls) => {
      if (!cls.time || !cls.time.includes("-")) return;

      const startTime = cls.time.split("-")[0].trim();
      const [hour, minute] = startTime.split(":").map(Number);

      const classTime = new Date();
      classTime.setHours(hour, minute, 0, 0);

      // Remind 15 minutes before
      const reminderTime = new Date(classTime.getTime() - 15 * 60 * 1000);

      if (reminderTime > new Date()) {
        const alarmName = `class_reminder_${cls.course}_${cls.slot}`;
        chrome.alarms.create(alarmName, { when: reminderTime.getTime() });

        // Store reminder data
        STORAGE.set({
          [`reminder_${alarmName}`]: {
            course: cls.course,
            time: cls.time,
            room: cls.room || "N/A",
            slot: cls.slot,
          },
        });
      }
    });
  } catch (e) {
    console.error("Error scheduling class reminders:", e);
  }
}

// Check and schedule reminders every hour
chrome.alarms.create("SCHEDULE_REMINDERS", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Existing alarm handlers
  if (alarm.name === "att_poll") {
    await pollOnce();
  } else if (alarm.name.startsWith("att_notify_")) {
    const pending = await STORAGE.get("pending_msgs", {});
    const msg = pending[alarm.name] || "Một môn đã được điểm danh";
    delete pending[alarm.name];
    await STORAGE.set({ pending_msgs: pending });
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "FAP Attendance",
      message: msg,
      priority: 2,
    });
  } else if (alarm.name === "UPDATE_CHECK") {
    checkUpdateAndNotify();
  } else if (alarm.name === "SCHEDULE_REMINDERS") {
    await scheduleClassReminders();
  } else if (alarm.name.startsWith("class_reminder_")) {
    // Show class reminder notification
    const reminderData = await STORAGE.get(`reminder_${alarm.name}`, null);
    if (reminderData) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "⏰ Sắp đến giờ học!",
        message: `Môn ${reminderData.course} sẽ bắt đầu lúc ${reminderData.time}\nPhòng: ${reminderData.room}`,
        priority: 2,
      });
      await STORAGE.remove(`reminder_${alarm.name}`);
    }
  } else if (alarm.name.startsWith("pomodoro_complete_")) {
    // Handle Pomodoro timer completion
    const activeTimer = await STORAGE.get("active_timer", null);
    if (
      activeTimer &&
      activeTimer.id === alarm.name.replace("pomodoro_complete_", "")
    ) {
      await completePomodoroTimer(activeTimer);
    }
  }
});

// Schedule reminders on startup
chrome.runtime.onStartup.addListener(async () => {
  await scheduleUpdateAlarm();
  await checkUpdateAndNotify();
  await scheduleClassReminders();
});

// ===== POMODORO BACKGROUND SYSTEM =====
async function initializePomodoroBackground() {
  console.log("Initializing Pomodoro background system...");

  // Check if there's an active timer
  const timerData = await STORAGE.get("timer_data", {});
  const activeTimer = await STORAGE.get("active_timer", null);

  if (activeTimer && activeTimer.isRunning) {
    console.log("Resuming active Pomodoro timer...");
    await resumePomodoroTimer(activeTimer);
  }
}

async function resumePomodoroTimer(activeTimer) {
  const now = Date.now();
  const elapsed = Math.floor((now - activeTimer.startTime) / 1000);
  const remaining = activeTimer.duration - elapsed;

  if (remaining <= 0) {
    // Timer should have completed
    await completePomodoroTimer(activeTimer);
    return;
  }

  // Schedule completion alarm
  const completionTime = now + remaining * 1000;
  chrome.alarms.create(`pomodoro_complete_${activeTimer.id}`, {
    when: completionTime,
  });

  console.log(`Pomodoro timer resumed: ${remaining} seconds remaining`);
}

async function startPomodoroTimer(mode, duration) {
  const timerId = `pomodoro_${Date.now()}`;
  const startTime = Date.now();
  const completionTime = startTime + duration * 60 * 1000;

  const activeTimer = {
    id: timerId,
    mode: mode,
    duration: duration * 60, // in seconds
    startTime: startTime,
    isRunning: true,
  };

  // Save active timer
  await STORAGE.set({ active_timer: activeTimer });

  // Schedule completion alarm
  chrome.alarms.create(`pomodoro_complete_${timerId}`, {
    when: completionTime,
  });

  console.log(`Pomodoro timer started: ${mode} for ${duration} minutes`);
}

async function pausePomodoroTimer() {
  const activeTimer = await STORAGE.get("active_timer", null);
  if (!activeTimer || !activeTimer.isRunning) return;

  // Calculate remaining time
  const now = Date.now();
  const elapsed = Math.floor((now - activeTimer.startTime) / 1000);
  const remaining = activeTimer.duration - elapsed;

  if (remaining <= 0) {
    await completePomodoroTimer(activeTimer);
    return;
  }

  // Update timer with remaining time
  activeTimer.isRunning = false;
  activeTimer.remainingTime = remaining;
  activeTimer.pausedAt = now;

  await STORAGE.set({ active_timer: activeTimer });

  // Clear completion alarm
  chrome.alarms.clear(`pomodoro_complete_${activeTimer.id}`);

  console.log(`Pomodoro timer paused: ${remaining} seconds remaining`);
}

async function resumePomodoroTimerFromPause() {
  const activeTimer = await STORAGE.get("active_timer", null);
  if (!activeTimer || activeTimer.isRunning) return;

  const now = Date.now();
  const completionTime = now + activeTimer.remainingTime * 1000;

  // Update timer
  activeTimer.isRunning = true;
  activeTimer.startTime = now;
  delete activeTimer.remainingTime;
  delete activeTimer.pausedAt;

  await STORAGE.set({ active_timer: activeTimer });

  // Schedule completion alarm
  chrome.alarms.create(`pomodoro_complete_${activeTimer.id}`, {
    when: completionTime,
  });

  console.log(`Pomodoro timer resumed from pause`);
}

async function completePomodoroTimer(activeTimer) {
  // Clear alarm
  chrome.alarms.clear(`pomodoro_complete_${activeTimer.id}`);

  // Update timer data
  const timerData = await STORAGE.get("timer_data", {});

  if (activeTimer.mode === "pomodoro") {
    timerData.pomodorosToday = (timerData.pomodorosToday || 0) + 1;
    timerData.studyTimeToday =
      (timerData.studyTimeToday || 0) + activeTimer.duration;

    // Update streak
    const today = new Date().toDateString();
    const lastStudyDate = timerData.lastStudyDate;
    if (lastStudyDate === today) {
      // Already studied today, no change to streak
    } else if (
      lastStudyDate ===
      new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString()
    ) {
      // Studied yesterday, increment streak
      timerData.studyStreak = (timerData.studyStreak || 0) + 1;
    } else {
      // Reset streak
      timerData.studyStreak = 1;
    }
    timerData.lastStudyDate = today;
  }

  await STORAGE.set({ timer_data: timerData });

  // Clear active timer
  await STORAGE.remove("active_timer");

  // Show notification
  const modeNames = {
    pomodoro: "Pomodoro",
    short: "Nghỉ ngắn",
    long: "Nghỉ dài",
  };

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title: `⏰ ${modeNames[activeTimer.mode]} hoàn thành!`,
    message:
      activeTimer.mode === "pomodoro"
        ? `Chúc mừng! Bạn đã hoàn thành 1 Pomodoro. Hãy nghỉ ngơi một chút nhé!`
        : `Thời gian nghỉ đã kết thúc. Sẵn sàng cho Pomodoro tiếp theo!`,
    priority: 2,
  });

  console.log(`Pomodoro timer completed: ${activeTimer.mode}`);
}

async function resetPomodoroTimer() {
  const activeTimer = await STORAGE.get("active_timer", null);
  if (activeTimer) {
    chrome.alarms.clear(`pomodoro_complete_${activeTimer.id}`);
    await STORAGE.remove("active_timer");
  }
  console.log("Pomodoro timer reset");
}

// ===== SMART STUDY MODE SYSTEM =====
class SmartStudyMode {
  constructor() {
    this.isActive = false;
    this.currentSession = null;
    this.distractingSites = [
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "youtube.com",
      "twitter.com",
      "reddit.com",
      "netflix.com",
      "twitch.tv",
    ];
    this.studySites = [
      "fap.fpt.edu.vn",
      "lms.fpt.edu.vn",
      "github.com",
      "stackoverflow.com",
      "w3schools.com",
      "coursera.org",
      "edx.org",
      "khanacademy.org",
    ];
    this.init();
  }

  async init() {
    // Load saved settings
    const settings = await STORAGE.get("smartStudySettings", {
      enabled: true, // Master switch to completely disable Smart Study Mode
      autoDetect: true,
      blockDistractions: true,
      showNotifications: true,
      minSessionTime: 5, // minutes
      breakReminderInterval: 25, // minutes
    });
    this.settings = settings;

    // Setup listeners only if enabled
    if (this.settings.enabled) {
      this.setupTabListeners();
      this.setupActivityTracking();
    }
  }

  setupTabListeners() {
    // Detect when user visits study-related sites
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.url) {
        this.handleTabUpdate(tabId, tab);
      }
    });

    // Detect when user switches tabs
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabSwitch(activeInfo.tabId);
    });
  }

  async handleTabUpdate(tabId, tab) {
    const url = new URL(tab.url);
    const domain = url.hostname;

    // Check if it's a study site
    if (this.isStudySite(domain)) {
      await this.startStudySession(tabId, tab);
    } else if (this.isDistractingSite(domain) && this.isActive) {
      await this.handleDistraction(tabId, tab);
    }
  }

  async handleTabSwitch(tabId) {
    if (this.isActive) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        const url = new URL(tab.url);
        const domain = url.hostname;

        if (this.isDistractingSite(domain)) {
          await this.handleDistraction(tabId, tab);
        }
      }
    }
  }

  isStudySite(domain) {
    return this.studySites.some((site) => domain.includes(site));
  }

  isDistractingSite(domain) {
    return this.distractingSites.some((site) => domain.includes(site));
  }

  async startStudySession(tabId, tab) {
    if (!this.settings.enabled || !this.settings.autoDetect) return;

    const now = Date.now();

    // Check if we're already in a session
    if (this.isActive && this.currentSession) {
      // Update existing session
      this.currentSession.lastActivity = now;
      return;
    }

    // Get current tab if not provided
    if (!tab && tabId) {
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (error) {
        console.error("Error getting tab:", error);
        return;
      }
    }

    // Start new session
    this.isActive = true;
    this.currentSession = {
      startTime: now,
      lastActivity: now,
      tabId: tabId || null,
      url: tab?.url || "unknown",
      distractions: 0,
      focusTime: 0,
    };

    // Show notification
    if (this.settings.showNotifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "🧠 Smart Study Mode Activated",
        message: "Focus mode enabled. Distracting sites will be blocked.",
        priority: 1,
      });
    }

    // Setup break reminder
    this.scheduleBreakReminder();

    // Save session data
    await this.saveSessionData();

    console.log("Smart Study Mode started");
  }

  async handleDistraction(tabId, tab) {
    if (!this.settings.enabled || !this.settings.blockDistractions) return;

    this.currentSession.distractions++;

    // Show warning notification
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "⚠️ Distraction Detected",
      message: "You're on a distracting site. Consider staying focused!",
      priority: 2,
    });

    // Optionally redirect to a focus page
    if (this.settings.blockDistractions) {
      await chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("focus-page.html"),
      });
    }
  }

  scheduleBreakReminder() {
    const interval = this.settings.breakReminderInterval * 60 * 1000;
    chrome.alarms.create("study_break_reminder", {
      when: Date.now() + interval,
    });
  }

  async endStudySession() {
    if (!this.isActive || !this.currentSession) return;

    const now = Date.now();
    const sessionDuration = now - this.currentSession.startTime;
    const focusTime =
      sessionDuration - this.currentSession.distractions * 60000; // Subtract distraction time

    // Save session analytics
    const analytics = await STORAGE.get("studyAnalytics", {
      totalSessions: 0,
      totalTime: 0,
      totalFocusTime: 0,
      averageSessionLength: 0,
      distractionRate: 0,
    });

    analytics.totalSessions++;
    analytics.totalTime += sessionDuration;
    analytics.totalFocusTime += focusTime;
    analytics.averageSessionLength =
      analytics.totalTime / analytics.totalSessions;
    analytics.distractionRate =
      this.currentSession.distractions / (sessionDuration / 60000);

    await STORAGE.set({ studyAnalytics: analytics });

    // Show session summary
    if (this.settings.showNotifications) {
      const minutes = Math.round(sessionDuration / 60000);
      const focusMinutes = Math.round(focusTime / 60000);

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "📊 Study Session Complete",
        message: `Session: ${minutes}min | Focus: ${focusMinutes}min | Distractions: ${this.currentSession.distractions}`,
        priority: 1,
      });
    }

    this.isActive = false;
    this.currentSession = null;

    // Clear session data from storage
    await STORAGE.set({
      currentStudySession: null,
      smartStudyActive: false,
    });

    console.log("Smart Study Mode ended");
  }

  async saveSessionData() {
    if (this.currentSession) {
      await STORAGE.set({
        currentStudySession: this.currentSession,
        smartStudyActive: this.isActive,
      });
    }
  }

  async enableSmartStudy() {
    this.settings.enabled = true;
    await STORAGE.set({ smartStudySettings: this.settings });
    this.setupTabListeners();
    this.setupActivityTracking();
    console.log("Smart Study Mode enabled");
  }

  async disableSmartStudy() {
    this.settings.enabled = false;
    await STORAGE.set({ smartStudySettings: this.settings });

    // End current session if active
    if (this.isActive) {
      await this.endStudySession();
    }

    // Remove listeners
    chrome.tabs.onUpdated.removeListener(this.handleTabUpdate);
    chrome.tabs.onActivated.removeListener(this.handleTabSwitch);

    console.log("Smart Study Mode disabled");
  }

  setupActivityTracking() {
    // Track user activity to detect when they're not studying
    let lastActivity = Date.now();

    setInterval(async () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivity;

      // If no activity for 5 minutes, end session
      if (this.isActive && timeSinceActivity > 5 * 60 * 1000) {
        await this.endStudySession();
      }

      lastActivity = now;
    }, 60000); // Check every minute
  }
}

// Initialize Smart Study Mode
const smartStudyMode = new SmartStudyMode();

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleUpdateAlarm();
  setTimeout(checkUpdateAndNotify, 5000);
  await scheduleClassReminders();
  await initializePomodoroBackground();
});
