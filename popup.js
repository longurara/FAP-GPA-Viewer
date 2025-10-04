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
function setValue(id, v) {
  const el = document.querySelector(id);
  if (el) el.textContent = v;
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

  const badge = document.getElementById("verBadge");
  const btn = document.getElementById("btnCheckUpdate");

  if (badge) {
    badge.textContent = `v${curr}`;
  }

  if (cmp > 0) {
    if (badge) {
      badge.innerHTML = `v${curr} → <strong>v${latestClean}</strong>`;
      badge.style.color = "var(--accent)";
    }
    if (btn) {
      btn.textContent = "Cập nhật";
      btn.onclick = () =>
        chrome.tabs.create({ url: latest.url || RELEASE_PAGE });
      btn.classList.add("primary");
    }
  } else {
    if (btn) {
      btn.textContent = "Check update";
      btn.onclick = async () => {
        try {
          await checkUpdate(true);
          alert("Bạn đang ở phiên bản mới nhất.");
        } catch (e) {
          alert("Không kiểm tra được cập nhật: " + e.message);
        }
      };
    }
  }
}

async function fetchHTML(url) {
  const res = await fetch(url, { credentials: "include", redirect: "follow" });
  if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
    const loginUrl = "https://fap.fpt.edu.vn/";
    alert(
      'Bạn chưa đăng nhập FAP. Mình sẽ mở trang FAP. Hãy đăng nhập, rồi quay lại popup và bấm "Làm mới".'
    );
    chrome.tabs.create({ url: loginUrl });
    throw new Error("LOGIN_REQUIRED");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const dom = new DOMParser().parseFromString(html, "text/html");
  return dom;
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

// ---------- Parse ScheduleOfWeek for attendance + today's schedule ----------
function parseScheduleOfWeek(doc) {
  const result = { entries: [], todayRows: [] };
  const N = (s) => (s || "").replace(/\s+/g, " ").trim();

  console.log("=== Bắt đầu parse ScheduleOfWeek ===");

  // BƯỚC 1: Tìm table chính với validation chặt chẽ
  const tables = [...doc.querySelectorAll("table")];
  let mainTable = null;

  console.log(`Tìm thấy ${tables.length} tables`);

  for (const table of tables) {
    // Phải có cả thead và tbody
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    if (!thead || !tbody) {
      console.log("Bỏ qua table: thiếu thead hoặc tbody");
      continue;
    }

    // Kiểm tra thead có chứa các ngày trong tuần
    const theadText = N(thead.textContent).toUpperCase();
    const hasWeekdays =
      /MON/.test(theadText) &&
      /TUE/.test(theadText) &&
      /WED/.test(theadText) &&
      /THU/.test(theadText) &&
      /FRI/.test(theadText);

    if (!hasWeekdays) {
      console.log("Bỏ qua table: không có đầy đủ thứ trong tuần");
      continue;
    }

    // Kiểm tra tbody phải có ít nhất 5 rows (slots)
    const bodyRows = [...tbody.querySelectorAll("tr")];
    if (bodyRows.length < 5) {
      console.log(`Bỏ qua table: chỉ có ${bodyRows.length} rows`);
      continue;
    }

    // QUAN TRỌNG: Row đầu tiên phải bắt đầu bằng "Slot X"
    const firstCell = bodyRows[0]?.querySelector("td");
    if (!firstCell) {
      console.log("Bỏ qua table: row đầu không có cell");
      continue;
    }

    const firstCellText = N(firstCell.textContent);
    if (!/^Slot\s*\d+$/i.test(firstCellText)) {
      console.log(`Bỏ qua table: cell đầu không phải Slot (${firstCellText})`);
      continue;
    }

    // Kiểm tra table không chứa text "Activities" (tránh nhầm với table hoạt động)
    const tableText = N(table.textContent);
    if (
      tableText.includes("ACTIVITIES FOR") ||
      tableText.includes("CLUB ACTIVITIES")
    ) {
      console.log("Bỏ qua table: là bảng Activities");
      continue;
    }

    // ĐÃ TÌM THẤY TABLE ĐÚNG
    console.log("✓ Tìm thấy table schedule hợp lệ");
    mainTable = table;
    break;
  }

  if (!mainTable) {
    console.error("❌ Không tìm thấy bảng lịch học hợp lệ");
    return result;
  }

  // BƯỚC 2: Parse header để lấy thông tin ngày
  const dateHeaders = [""]; // Index 0 cho cột Slot
  const dayHeaders = [""];

  const theadRows = [...mainTable.querySelectorAll("thead tr")];
  console.log(`Thead có ${theadRows.length} rows`);

  // Row 1: Các thứ (MON, TUE, WED...)
  if (theadRows.length > 0) {
    const dayRow = theadRows[0];
    const dayCells = [...dayRow.querySelectorAll("th, td")];

    dayCells.forEach((cell) => {
      const text = N(cell.textContent).toUpperCase();
      const match = text.match(/(MON|TUE|WED|THU|FRI|SAT|SUN)/);
      if (match) {
        dayHeaders.push(match[1]);
      }
    });
  }

  // Row 2: Các ngày (dd/mm)
  if (theadRows.length > 1) {
    const dateRow = theadRows[1];
    const dateCells = [...dateRow.querySelectorAll("th, td")];

    dateCells.forEach((cell) => {
      const match = cell.textContent.match(/(\d{2}\/\d{2})/);
      if (match) {
        dateHeaders.push(match[1]);
      }
    });
  }

  console.log("Day headers:", dayHeaders);
  console.log("Date headers:", dateHeaders);

  // BƯỚC 3: Parse tbody - CHỈ lấy từng cell riêng biệt
  const tbody = mainTable.querySelector("tbody");
  const slotRows = [...tbody.querySelectorAll("tr")];

  console.log(`Parsing ${slotRows.length} slot rows`);

  slotRows.forEach((row, rowIdx) => {
    const cells = [...row.querySelectorAll("td")];

    if (cells.length < 2) {
      console.log(`Row ${rowIdx}: bỏ qua (chỉ có ${cells.length} cells)`);
      return;
    }

    // Cell đầu tiên là slot name
    const slotName = N(cells[0].textContent);

    if (!/^Slot\s*\d+$/i.test(slotName)) {
      console.log(`Row ${rowIdx}: bỏ qua (không phải slot: ${slotName})`);
      return;
    }

    console.log(`Parsing ${slotName}...`);

    // Parse từng cell tương ứng với từng ngày (MON-SUN)
    for (let colIdx = 1; colIdx < cells.length && colIdx <= 7; colIdx++) {
      const cell = cells[colIdx];

      // LẤY RIÊNG textContent và innerHTML của TỪNG CELL
      const cellText = N(cell.textContent);
      const cellHTML = cell.innerHTML;

      // Skip ô trống
      if (!cellText || cellText === "-") continue;

      // Extract course code (MAD101, PRO192...)
      const codeMatch = cellText.match(/\b([A-Z]{2,4}\d{3})\b/);
      if (!codeMatch) {
        console.log(`  Col ${colIdx}: bỏ qua (không có mã môn)`);
        continue;
      }

      const courseCode = codeMatch[1];

      // Extract room (P.112, NVH...)
      const roomMatch = cellText.match(/at\s+(P\.\d+|[A-Z]+\d+|NVH\d+)/i);
      const room = roomMatch ? roomMatch[1] : "";

      // Extract time (12:30-14:45)
      const timeMatch = cellText.match(/\((\d{2}:\d{2}-\d{2}:\d{2})\)/);
      const time = timeMatch ? timeMatch[1] : "";

      // Extract status từ HTML attributes
      let status = "not yet";
      const htmlLower = cellHTML.toLowerCase();

      if (
        htmlLower.includes("color=green") ||
        htmlLower.includes("color: green") ||
        /attended/i.test(cellText)
      ) {
        status = "attended";
      } else if (
        htmlLower.includes("color=red") ||
        htmlLower.includes("color: red") ||
        /absent|vắng/i.test(cellText)
      ) {
        status = "absent";
      } else if (/not yet/i.test(cellText)) {
        status = "not yet";
      }

      const entry = {
        day: dayHeaders[colIdx] || "",
        date: dateHeaders[colIdx] || "",
        slot: slotName,
        time: time,
        course: courseCode,
        room: room,
        status: status,
        key: `${
          dateHeaders[colIdx] || dayHeaders[colIdx]
        }|${slotName}|${courseCode}`,
      };

      result.entries.push(entry);
      console.log(`  ✓ ${entry.day} ${entry.date} - ${courseCode} - ${status}`);
    }
  });

  console.log(`=== Parse xong: ${result.entries.length} entries ===`);

  // BƯỚC 4: Lọc lịch hôm nay
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const todayDate = `${dd}/${mm}`;

  result.todayRows = result.entries
    .filter((e) => e.date === todayDate)
    .map((e) => ({
      time: e.time,
      course: e.course,
      room: e.room,
      note: e.status,
    }));

  console.log(`Hôm nay (${todayDate}): ${result.todayRows.length} tiết`);

  return result;
}

// ---------- Renderers ----------
function renderTranscript(rows, excluded) {
  const g = computeGPA(rows, excluded);
  setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
  setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
  setValue("#credits", g.credits || "--");

  const tbody = document.querySelector("#tblCourses tbody");
  tbody.innerHTML = "";
  const q = (document.querySelector("#searchCourse").value || "").toLowerCase();
  rows.forEach((r) => {
    if (
      q &&
      !(
        String(r.code).toLowerCase().includes(q) ||
        String(r.name).toLowerCase().includes(q)
      )
    )
      return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.code || ""}</td>
      <td>${r.name || ""}</td>
      <td class="r">${Number.isFinite(r.credit) ? r.credit : ""}</td>
      <td class="r">${Number.isFinite(r.grade) ? r.grade : ""}</td>
      <td>${r.status || ""}</td>
    `;
    tbody.appendChild(tr);
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
  const denom = present + absent; // chỉ tính khi tiết đã chốt hiện diện/vắng
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

function renderAttendance(entries) {
  console.log("=== renderAttendance ===");
  console.log("Entries:", entries);

  try {
    // Validate input
    if (!Array.isArray(entries)) {
      throw new Error("Entries không phải array");
    }

    // Clean và validate data
    const validEntries = entries.filter((e) => {
      if (!e || typeof e !== "object") return false;
      if (!e.course || !/^[A-Z]{2,4}\d{3}$/.test(e.course)) return false;
      return true;
    });

    console.log(`Valid entries: ${validEntries.length}/${entries.length}`);

    if (validEntries.length === 0) {
      throw new Error("Không có entry hợp lệ nào");
    }

    // Sort by date (newest first)
    const sorted = validEntries.sort((a, b) => {
      if (a.date && b.date) {
        const [dayA, monthA] = a.date.split("/").map(Number);
        const [dayB, monthB] = b.date.split("/").map(Number);

        if (monthA !== monthB) return monthB - monthA;
        if (dayA !== dayB) return dayB - dayA;
      }

      const slotA = parseInt((a.slot || "").replace(/\D/g, "") || "999");
      const slotB = parseInt((b.slot || "").replace(/\D/g, "") || "999");
      return slotA - slotB;
    });

    // Update filter dropdown with dates
    const filterSelect = document.getElementById("filterDay");
    if (filterSelect) {
      const existingOptions = new Set(
        [...filterSelect.options].map((o) => o.value)
      );

      const uniqueDates = [
        ...new Set(sorted.map((e) => e.date).filter(Boolean)),
      ];
      uniqueDates.forEach((date) => {
        if (!existingOptions.has(date)) {
          const option = document.createElement("option");
          option.value = date;
          option.textContent = date;
          filterSelect.appendChild(option);
        }
      });
    }

    // Apply day/date filter
    const filterValue = filterSelect?.value || "ALL";
    let filtered = sorted;

    if (filterValue !== "ALL") {
      if (/^\d{2}\/\d{2}$/.test(filterValue)) {
        filtered = sorted.filter((e) => e.date === filterValue);
      } else if (/^(MON|TUE|WED|THU|FRI|SAT|SUN)$/.test(filterValue)) {
        filtered = sorted.filter((e) => e.day === filterValue);
      }
    }

    // Calculate statistics
    let attended = 0,
      absent = 0,
      late = 0,
      notYet = 0;

    filtered.forEach((e) => {
      const s = (e.status || "").toLowerCase();
      if (s.includes("attended")) attended++;
      else if (s.includes("absent")) absent++;
      else if (s.includes("late")) late++;
      else if (s.includes("not yet")) notYet++;
    });

    const total = attended + absent;
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0;

    // Update stats display
    setValue("#attRate", attendanceRate + "%");
    setValue("#attPresent", attended);
    setValue("#attAbsentLate", `${absent}/${late}`);

    // Apply search filter
    const searchQuery = (
      document.querySelector("#searchAtt")?.value || ""
    ).toLowerCase();

    if (searchQuery) {
      filtered = filtered.filter(
        (e) =>
          e.course?.toLowerCase().includes(searchQuery) ||
          e.status?.toLowerCase().includes(searchQuery) ||
          e.room?.toLowerCase().includes(searchQuery)
      );
    }

    // Render table
    const tbody = document.querySelector("#tblAttendance tbody");
    if (!tbody) throw new Error("Không tìm thấy tbody");

    tbody.innerHTML = "";

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="4" style="text-align: center; color: var(--muted)">Không có dữ liệu</td>';
      tbody.appendChild(tr);
      return;
    }

    filtered.forEach((entry) => {
      const tr = document.createElement("tr");

      const dayDisplay = entry.date || entry.day || "";
      const slotDisplay = entry.slot || "";
      const courseDisplay = entry.course || "";
      const statusDisplay = entry.status || "";

      tr.innerHTML = `
        <td>${dayDisplay}</td>
        <td>${slotDisplay}</td>
        <td>${courseDisplay}</td>
        <td>${statusDisplay}</td>
      `;

      // Color coding
      if (statusDisplay.toLowerCase().includes("attended")) {
        tr.style.color = "#10b981";
      } else if (statusDisplay.toLowerCase().includes("absent")) {
        tr.style.color = "#ef4444";
      }

      tbody.appendChild(tr);
    });

    console.log("✓ Render attendance thành công");
  } catch (error) {
    console.error("❌ Lỗi render attendance:", error);

    // Hiển thị error message thay vì crash
    const tbody = document.querySelector("#tblAttendance tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #ef4444; padding: 20px;">
            <strong>Lỗi hiển thị dữ liệu</strong><br>
            <small>${error.message}</small><br>
            <small style="color: var(--muted)">Vui lòng thử "Làm mới" hoặc kiểm tra Console (F12)</small>
          </td>
        </tr>
      `;
    }

    // Reset stats
    setValue("#attRate", "--");
    setValue("#attPresent", "--");
    setValue("#attAbsentLate", "--");
  }
}

// Helper function
function setValue(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function _renderScheduleToday_DEPRECATED(rows) {
  const tbody = document.querySelector("#tblScheduleToday tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4">Hôm nay không có tiết nào (hoặc trang lịch khác định dạng).</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.time || ""}</td><td>${r.course || ""}</td><td>${
      r.room || ""
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
    rows = parseTranscriptDoc(doc);
    await cacheSet("cache_transcript", { rows });
    await STORAGE.set({ cache_transcript_flat: rows });
  }
  const excluded = await STORAGE.get(EXCLUDED_KEY, EXCLUDED_DEFAULT);
  renderTranscript(rows, excluded);
}

async function refreshAttendance() {
  const doc = await fetchHTML(DEFAULT_URLS.scheduleOfWeek);
  const parsed = parseScheduleOfWeek(doc);
  await cacheSet("cache_attendance", parsed);
  await STORAGE.set({
    cache_attendance_flat: parsed && parsed.entries ? parsed.entries : [],
  });
  renderAttendance(parsed.entries);
  renderScheduleWeek(parsed.entries);
}

async function loadAttendanceAndSchedule() {
  const cache = null; // bypass cache to avoid stale bad parse; will re-cache fresh
  if (cache) {
    renderAttendance(cache.entries);
    renderScheduleWeek(cache.entries);
  } else {
    await refreshAttendance();
  }
}

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
  const cfg = {
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
  alert("Đã lưu cài đặt ✅");
}

// ---------- Buttons & Filters ----------
document.getElementById("btnOpenFAP").onclick = () =>
  chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" });
document.getElementById("btnOpenTranscript").onclick = () =>
  chrome.tabs.create({ url: DEFAULT_URLS.transcript });

// --- Quick bookmarks ---
const btnLMS = document.getElementById("btnOpenLMS");
if (btnLMS)
  btnLMS.onclick = () =>
    chrome.tabs.create({ url: "https://lms-hcm.fpt.edu.vn/" });
const btnFAP2 = document.getElementById("btnOpenFAP2");
if (btnFAP2)
  btnFAP2.onclick = () =>
    chrome.tabs.create({ url: "https://fap.fpt.edu.vn/" });
const btnIT = document.getElementById("btnOpenIT");
if (btnIT)
  btnIT.onclick = () =>
    chrome.tabs.create({ url: "https://it-hcm.fpt.edu.vn/" });

document.getElementById("btnOpenAttendance").onclick = () =>
  chrome.tabs.create({ url: DEFAULT_URLS.scheduleOfWeek });
document.getElementById("btnOpenSchedule").onclick = () =>
  chrome.tabs.create({ url: DEFAULT_URLS.scheduleOfWeek });

document.getElementById("searchCourse").addEventListener("input", loadGPA);
document.getElementById("searchAtt").addEventListener("input", async () => {
  const c = await cacheGet("cache_attendance", 10 * 60 * 1000);
  renderAttendance(c?.entries || []);
});
document.getElementById("filterDay").addEventListener("change", async () => {
  const c = await cacheGet("cache_attendance", 10 * 60 * 1000);
  renderAttendance(c?.entries || []);
});

document.getElementById("btnRefreshAttendance").onclick = async function () {
  await handleRefreshWithLoading(this, refreshAttendance);
};
document.getElementById("btnRefreshSchedule").onclick = async function () {
  await handleRefreshWithLoading(this, refreshAttendance);
};

// Settings buttons
document.getElementById("btnSaveSettings").onclick = saveSettingsUI;
document.getElementById("btnTestNotify").onclick = () =>
  chrome.runtime.sendMessage({ type: "TEST_NOTIFY" });

// Tabs
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.onclick = () => {
    document
      .querySelectorAll(".tabs button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const id = btn.dataset.tab;
    document
      .querySelectorAll(".tab")
      .forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  };
});

(async function init() {
  await Promise.all([
    loadGPA(),
    loadAttendanceAndSchedule(),
    loadSettingsUI(),
    loadExams(),
  ]);

  try {
    await checkUpdate();
  } catch (e) {}
})();

// Refresh-all: clear caches and reload
document.getElementById("btnRefreshAll").onclick = async function () {
  await handleRefreshWithLoading(this, async () => {
    await STORAGE.remove("cache_transcript");
    await STORAGE.remove("cache_attendance");
    await STORAGE.remove("cache_exams");
    await Promise.all([loadGPA(), refreshAttendance(), loadExams()]);
  });
};

function renderScheduleWeek(entries) {
  const tbody = document.querySelector("#tblScheduleWeek tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!entries || entries.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6">Không có dữ liệu lịch học</td>';
    tbody.appendChild(tr);
    return;
  }

  // Sort by day of week, then slot
  const dayOrder = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };

  const sorted = [...entries].sort((a, b) => {
    const dayA = dayOrder[a.day] || 999;
    const dayB = dayOrder[b.day] || 999;
    if (dayA !== dayB) return dayA - dayB;

    const slotA = parseInt((a.slot || "").replace(/\D/g, "") || "999");
    const slotB = parseInt((b.slot || "").replace(/\D/g, "") || "999");
    return slotA - slotB;
  });

  sorted.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dayToVietnamese(entry.day) || ""}</td>
      <td>${entry.slot || ""}</td>
      <td>${entry.time || ""}</td>
      <td>${entry.course || ""}</td>
      <td>${entry.room || ""}</td>
      <td>${entry.status || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}
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
      doc.text(`FAP GPA Viewer – Dashboard | Xuất ngày: ${today}`, 14, 10);
      doc.text(
        `Trang ${i} / ${pageCount}`,
        doc.internal.pageSize.getWidth() - 40,
        doc.internal.pageSize.getHeight() - 10
      );
    }
  }
  const logo = await fetch(chrome.runtime.getURL("icon128.png"))
    .then((r) => r.blob())
    .then(
      (b) =>
        new Promise((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(b);
        })
    );
  doc.addImage(logo, "PNG", 15, 20, 30, 30);
  doc.setFontSize(18);
  doc.text("FAP GPA Viewer – Dashboard", 55, 30);
  doc.setFontSize(12);
  doc.text(
    "Một Chrome Extension giúp sinh viên FPT University theo dõi GPA, lịch học, điểm danh và nhắc nhở tự động.",
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

// Gắn vào nút Export PDF nếu có
const btnExportPDF = document.getElementById("btnExportPDF");
if (btnExportPDF) btnExportPDF.onclick = exportAllPDF;

//exam btn
document.getElementById("btnOpenExams").onclick = () =>
  chrome.tabs.create({ url: DEFAULT_URLS.examSchedule });

document.getElementById("btnRefreshExams").onclick = async function () {
  await handleRefreshWithLoading(this, async () => {
    await STORAGE.remove("cache_exams");
    await loadExams();
  });
};

function dayToVietnamese(day) {
  const map = {
    MON: "Thứ 2",
    TUE: "Thứ 3",
    WED: "Thứ 4",
    THU: "Thứ 5",
    FRI: "Thứ 6",
    SAT: "Thứ 7",
    SUN: "Chủ nhật",
  };
  return map[day] || day;
}
// === Export PDF via printable report page (no external libs needed) ===
(function () {
  const btn = document.getElementById("btnExportPDF");
  if (btn) {
    btn.onclick = () =>
      chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
  }
})();

// ---------- Parse Exam Schedule ----------
function parseExamScheduleDoc(doc) {
  const exams = [];
  const tables = [...doc.querySelectorAll("table")];
  let examTable = null;

  // 1. Tìm đúng bảng chứa lịch thi
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

  // 2. Lấy tất cả các hàng, tìm hàng tiêu đề và chỉ xử lý các hàng dữ liệu sau đó
  const allRows = [...examTable.querySelectorAll("tr")];
  let headerRowIndex = -1;

  // Tìm vị trí của hàng tiêu đề (hàng chứa "SubjectCode")
  for (let i = 0; i < allRows.length; i++) {
    const rowText = (allRows[i].textContent || "").toLowerCase();
    if (rowText.includes("subjectcode")) {
      headerRowIndex = i;
      break;
    }
  }

  // Nếu không tìm thấy header, không làm gì cả
  if (headerRowIndex === -1) {
    console.log("Không tìm thấy hàng tiêu đề trong bảng lịch thi.");
    return [];
  }

  const dataRows = allRows.slice(headerRowIndex + 1); // Chỉ lấy các hàng sau hàng tiêu đề

  // 3. Trích xuất dữ liệu từ các hàng đã lọc
  for (const row of dataRows) {
    const cells = [...row.querySelectorAll("td")];
    if (cells.length < 9) continue; // Bỏ qua nếu hàng không đủ 9 cột như trên web

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

    // Chỉ thêm vào nếu có mã môn học
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
      '<td colspan="6" style="text-align: center; color: var(--muted)">Không có lịch thi.</td>';
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
    exams = parseExamScheduleDoc(doc);
    await cacheSet("cache_exams", { exams });
  }
  renderExamSchedule(exams);
}

// === Loading States cho Refresh Buttons ===
const loadingStyles = `
/* Custom Scrollbar - Mỏng và đẹp hơn */
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
  btn.textContent = "Đang tải...";

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
  btnCopyGPA.onclick = async function () {
    const gpa10 = document.querySelector("#gpa10")?.textContent || "--";
    const gpa4 = document.querySelector("#gpa4")?.textContent || "--";
    const credits = document.querySelector("#credits")?.textContent || "--";

    if (gpa10 === "--" || gpa4 === "--") {
      alert("Chưa có dữ liệu GPA để copy!");
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
      alert("Không thể copy: " + err.message);
    }
  };
}

// Export function
window.handleRefreshWithLoading = handleRefreshWithLoading;
