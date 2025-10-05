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
      btn.addEventListener("click", () =>
        chrome.tabs.create({ url: latest.url || RELEASE_PAGE })
      );
      btn.classList.add("primary");
    }
  } else {
    if (btn) {
      btn.textContent = "Check update";
      btn.addEventListener("click", async () => {
        try {
          await checkUpdate(true);
          Modal.success("Bạn đang ở phiên bản mới nhất.", "Cập nhật");
        } catch (e) {
          Modal.error("Không kiểm tra được cập nhật: " + e.message);
        }
      });
    }
  }
}

async function fetchHTML(url) {
  const res = await fetch(url, { credentials: "include", redirect: "follow" });
  if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
    const loginUrl = "https://fap.fpt.edu.vn/";
    Modal.warning(
      'Bạn chưa đăng nhập FAP.\n\nMình sẽ mở trang FAP. Hãy đăng nhập, rồi quay lại popup và bấm "Làm mới".',
      "Cần đăng nhập"
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
        <button class="note-toggle-btn ${
          hasNote ? "has-note" : ""
        }" data-code="${courseCode}" title="Notes">
          ${hasNote ? "📝" : "📄"}
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
        toggleBtn.textContent = hasContent ? "📝" : "📄";
        toggleBtn.classList.toggle("has-note", hasContent);

        Toast.success("Đã lưu note", "");
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

// Debug function to check all attendance data
async function debugAttendanceData() {
  console.log("=== DEBUG ATTENDANCE DATA ===");

  try {
    // Check cache
    const attCache = await cacheGet("cache_attendance", 10 * 60 * 1000);
    console.log("Cache data:", attCache);

    // Check storage
    const storageData = await STORAGE.get("cache_attendance", null);
    console.log("Storage data:", storageData);

    // Check flat data
    const flatData = await STORAGE.get("cache_attendance_flat", []);
    console.log("Flat data:", flatData);

    // Force refresh if no data
    if (!attCache?.entries || attCache.entries.length === 0) {
      console.log("No cache data, forcing refresh...");
      await refreshAttendance();
    }
  } catch (error) {
    console.error("Debug error:", error);
  }
}

function renderAttendance(entries) {
  console.log("=== renderAttendance ===");
  console.log("Entries:", entries);

  // Update quick stats when attendance data is available
  updateQuickAttendanceStats(entries);

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
  const excludedCourses = await STORAGE.get("excluded_courses", []);
  renderTranscript(rows, excludedCourses);
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

  // Update quick stats immediately after loading attendance data
  updateQuickAttendanceStats(parsed.entries);
}

async function loadAttendanceAndSchedule() {
  try {
    // Try to load from cache first
    const cache = await cacheGet("cache_attendance", 10 * 60 * 1000);
    if (cache?.entries && cache.entries.length > 0) {
      renderAttendance(cache.entries);
      renderScheduleWeek(cache.entries);
      updateQuickAttendanceStats(cache.entries);
    } else {
      // If no cache or empty cache, refresh from server
      await refreshAttendance();
    }
  } catch (error) {
    console.error("Error loading attendance:", error);
    // Fallback: try to refresh
    try {
      await refreshAttendance();
    } catch (refreshError) {
      console.error("Error refreshing attendance:", refreshError);
      // Set fallback values
      setValue("#attRateQuick", "--");
    }
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
  Toast.success("Đã lưu cài đặt");
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
    await handleRefreshWithLoading(this, refreshAttendance);
  });
document
  .getElementById("btnRefreshSchedule")
  ?.addEventListener("click", async function () {
    await handleRefreshWithLoading(this, refreshAttendance);
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

// Reinitialize tabs after Smart Study tab is added
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
  ]);

  try {
    await checkUpdate();
  } catch (e) {}
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

    await handleRefreshWithLoading(this, async () => {
      await STORAGE.remove("cache_transcript");
      await STORAGE.remove("cache_attendance");
      await STORAGE.remove("cache_exams");
      await Promise.all([loadGPA(), refreshAttendance(), loadExams()]);
    });
  });

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
          reader.addEventListener("load", () => res(reader.result));
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
    await handleRefreshWithLoading(this, async () => {
      await STORAGE.remove("cache_exams");
      await loadExams();
    });
  });

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
    btn.addEventListener("click", () =>
      chrome.tabs.create({ url: chrome.runtime.getURL("report.html") })
    );
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
      "Reset danh sách môn loại trừ?\n\nTất cả môn sẽ được tính vào GPA trừ khi bạn chọn loại trừ lại.",
      "Reset loại trừ môn"
    );

    if (confirmed) {
      // Clear all excluded courses
      await STORAGE.set({ excluded_courses: [] });

      // Reload transcript to update UI
      await loadGPA();

      Toast.success("Đã reset danh sách môn loại trừ!");
    }
  });
}

// === Set Default Excluded Courses Button ===
const btnSetDefaultExcluded = document.getElementById("btnSetDefaultExcluded");
if (btnSetDefaultExcluded) {
  btnSetDefaultExcluded.addEventListener("click", async function () {
    const confirmed = await Modal.confirm(
      "Set mặc định loại trừ?\n\nSẽ loại trừ TRS501, ENT503, VOV114 khỏi GPA (theo chuẩn FPT).",
      "Set mặc định loại trừ"
    );

    if (confirmed) {
      // Set default excluded courses
      await STORAGE.set({ excluded_courses: EXCLUDED_DEFAULT });

      // Reload transcript to update UI
      await loadGPA();

      Toast.success("Đã set mặc định loại trừ môn!");
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
  const cache = await cacheGet("cache_attendance", 10 * 60 * 1000);
  const entries = cache?.entries || [];

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const todayDate = `${dd}/${mm}`;

  const todayClasses = entries
    .filter((e) => e.date === todayDate)
    .sort((a, b) => {
      const slotA = parseInt((a.slot || "").replace(/\D/g, "") || "999");
      const slotB = parseInt((b.slot || "").replace(/\D/g, "") || "999");
      return slotA - slotB;
    });

  const container = document.getElementById("todayClasses");
  if (!container) return;

  if (todayClasses.length === 0) {
    container.innerHTML =
      '<div class="no-class">🎉 Hôm nay không có lịch học!</div>';
    return;
  }

  container.innerHTML = "";
  todayClasses.forEach((cls) => {
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
}

function getTimeUntilClass(timeStr) {
  if (!timeStr || !timeStr.includes("-")) return "⏰";

  const startTime = timeStr.split("-")[0].trim();
  const [hour, minute] = startTime.split(":").map(Number);

  const now = new Date();
  const classTime = new Date();
  classTime.setHours(hour, minute, 0, 0);

  const diff = classTime - now;

  if (diff < 0) {
    return "✅ Đã qua";
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
    } else if (requiredGrade < 0) {
      resultEl.textContent = "Đạt rồi! 🎉";
      resultEl.classList.add("calc-success");
    } else {
      resultEl.textContent = requiredGrade.toFixed(2);
      if (requiredGrade >= 8) {
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
    await handleRefreshWithLoading(this, loadStatistics);
  });

// ===== ATTENDANCE STREAK TRACKER =====
async function calculateStreak() {
  const cache = await cacheGet("cache_attendance", 10 * 60 * 1000);
  const entries = cache?.entries || [];

  if (entries.length === 0) {
    setValue("#streakCount", "0");
    return;
  }

  // Sort by date descending
  const sorted = entries
    .filter((e) => e.date && e.status)
    .sort((a, b) => {
      const [dayA, monthA] = (a.date || "01/01").split("/").map(Number);
      const [dayB, monthB] = (b.date || "01/01").split("/").map(Number);
      if (monthA !== monthB) return monthB - monthA;
      return dayB - dayA;
    });

  let streak = 0;
  const datesSeen = new Set();

  for (const entry of sorted) {
    if (entry.status?.toLowerCase().includes("attended")) {
      if (!datesSeen.has(entry.date)) {
        datesSeen.add(entry.date);
        streak++;
      }
    } else if (entry.status?.toLowerCase().includes("absent")) {
      break; // Streak broken
    }
  }

  setValue("#streakCount", streak.toString());
  await STORAGE.set({ attendance_streak: streak });
}

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
        '<span class="exam-days" style="background: #ef4444; color: white;">HÔM NAY!</span>';
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
    await handleRefreshWithLoading(this, async () => {
      await STORAGE.remove("cache_transcript");
      await STORAGE.remove("cache_attendance");
      await STORAGE.remove("cache_exams");
      await STORAGE.remove("weather_data");
      await Promise.all([
        loadGPA(),
        refreshAttendance(),
        loadExams(),
        loadTodaySchedule(),
        loadWeather(),
        initGPACalculator(),
        calculateStreak(),
      ]);

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
      csv += `${r.code || ""},${r.name || ""},${r.credit || ""},${
        r.grade || ""
      },${r.status || ""}\n`;
    });

    csv += "\n\nATTENDANCE\n";
    csv += "Date,Day,Slot,Course,Status\n";
    const aEntries = attendance?.entries || attendance?.data?.entries || [];
    aEntries.forEach((e) => {
      csv += `${e.date || ""},${e.day || ""},${e.slot || ""},${
        e.course || ""
      },${e.status || ""}\n`;
    });

    csv += "\n\nEXAMS\n";
    csv += "Code,Name,Date,Time,Room,Form\n";
    const eRows = exams?.exams || exams?.data?.exams || [];
    eRows.forEach((e) => {
      csv += `${e.code || ""},${e.name || ""},${e.date || ""},${e.time || ""},${
        e.room || ""
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
const Modal = {
  overlay: null,
  box: null,
  icon: null,
  title: null,
  message: null,
  confirmBtn: null,
  cancelBtn: null,

  init() {
    this.overlay = document.getElementById("modalOverlay");
    this.icon = document.getElementById("modalIcon");
    this.title = document.getElementById("modalTitle");
    this.message = document.getElementById("modalMessage");
    this.confirmBtn = document.getElementById("modalConfirm");
    this.cancelBtn = document.getElementById("modalCancel");

    // Click overlay to close
    this.overlay?.addEventListener("click", (e) => {
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

  show({
    icon = "ℹ️",
    title = "Thông báo",
    message = "",
    onConfirm = null,
    onCancel = null,
    confirmText = "OK",
    cancelText = "Hủy",
    showCancel = false,
  }) {
    return new Promise((resolve) => {
      if (!this.overlay) this.init();

      this.icon.textContent = icon;
      this.title.textContent = title;
      this.message.textContent = message;
      this.confirmBtn.textContent = confirmText;
      this.cancelBtn.textContent = cancelText;
      this.cancelBtn.style.display = showCancel ? "block" : "none";

      // Remove old listeners
      const newConfirmBtn = this.confirmBtn.cloneNode(true);
      const newCancelBtn = this.cancelBtn.cloneNode(true);
      this.confirmBtn.parentNode.replaceChild(newConfirmBtn, this.confirmBtn);
      this.cancelBtn.parentNode.replaceChild(newCancelBtn, this.cancelBtn);
      this.confirmBtn = newConfirmBtn;
      this.cancelBtn = newCancelBtn;

      // Add new listeners
      this.confirmBtn.addEventListener("click", () => {
        this.close();
        if (onConfirm) onConfirm();
        resolve(true);
      });

      this.cancelBtn.addEventListener("click", () => {
        this.close();
        if (onCancel) onCancel();
        resolve(false);
      });

      this.overlay.classList.add("active");
    });
  },

  close() {
    this.overlay?.classList.remove("active");
  },

  alert(message, options = {}) {
    return this.show({
      icon: options.icon || "ℹ️",
      title: options.title || "Thông báo",
      message,
      confirmText: "OK",
      showCancel: false,
    });
  },

  confirm(message, options = {}) {
    return this.show({
      icon: options.icon || "❓",
      title: options.title || "Xác nhận",
      message,
      confirmText: options.confirmText || "Xác nhận",
      cancelText: options.cancelText || "Hủy",
      showCancel: true,
    });
  },

  success(message, title = "Thành công") {
    return this.alert(message, { icon: "✅", title });
  },

  error(message, title = "Lỗi") {
    return this.alert(message, { icon: "❌", title });
  },

  warning(message, title = "Cảnh báo") {
    return this.alert(message, { icon: "⚠️", title });
  },
};

const Toast = {
  container: null,

  init() {
    this.container = document.getElementById("toastContainer");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toastContainer";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  },

  show({
    icon = "ℹ️",
    title = "",
    message = "",
    type = "info",
    duration = 3000,
  }) {
    if (!this.container) this.init();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ""}
        <div class="toast-message">${message}</div>
      </div>
    `;

    this.container.appendChild(toast);

    // Remove on click
    toast.addEventListener("click", () => {
      this.remove(toast);
    });

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.remove(toast);
      }, duration);
    }
  },

  remove(toast) {
    toast.classList.add("removing");
    setTimeout(() => {
      toast.remove();
    }, 200);
  },

  success(message, title = "Thành công") {
    this.show({ icon: "✅", title, message, type: "success" });
  },

  error(message, title = "Lỗi") {
    this.show({ icon: "❌", title, message, type: "error" });
  },

  info(message, title = "") {
    this.show({ icon: "ℹ️", title, message, type: "info" });
  },

  warning(message, title = "Cảnh báo") {
    this.show({ icon: "⚠️", title, message, type: "warning" });
  },
};

// Initialize modal system
Modal.init();
Toast.init();

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
      colorPicker.value = themeColor;
      Toast.success("Đã đổi theme");
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
  const savedBg = await STORAGE.get("background_image", "");
  const savedOpacity = await STORAGE.get("background_opacity", 20);

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
        applyBackground(dataUrl, savedOpacity);
        updateBackgroundPreview(dataUrl);
        Toast.success("Đã đặt ảnh nền");
      });
      reader.readAsDataURL(file);
    }
  });

  removeBtn.addEventListener("click", async () => {
    await STORAGE.set({ background_image: "" });
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
    applyBackground(savedBg, opacity);
    applyFrameOpacity(opacity);
  });
}

function applyBackground(bgUrl, opacity) {
  const body = document.body;
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

  // Apply opacity overlay
  let overlay = document.getElementById("bgOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "bgOverlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg);
      opacity: ${(100 - opacity) / 100};
      pointer-events: none;
      z-index: -1;
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.style.opacity = (100 - opacity) / 100;
  }
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
  const modal = Modal.show({
    icon: "🎨",
    title: "Chọn Background Preset",
    message: "Chọn một trong các preset có sẵn:",
    showCancel: true,
    customContent: `
      <div class="preset-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0;">
        ${PRESET_BACKGROUNDS.map(
          (preset, i) => `
          <button class="preset-bg-btn" data-index="${i}" style="
            height: 60px;
            border-radius: 8px;
            border: 2px solid var(--border);
            background: ${preset.url};
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          ">
            ${preset.name}
          </button>
        `
        ).join("")}
      </div>
    `,
  });

  // Add event listeners to preset buttons
  setTimeout(() => {
    document.querySelectorAll(".preset-bg-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const index = parseInt(btn.dataset.index);
        const preset = PRESET_BACKGROUNDS[index];
        await STORAGE.set({ background_image: preset.url });
        applyBackground(
          preset.url,
          parseInt(document.getElementById("bgOpacity").value)
        );
        updateBackgroundPreview(preset.url);
        Modal.close();
        Toast.success(`Đã áp dụng ${preset.name}`);
      });
    });
  }, 100);
}

// Initialize background system
initBackgroundSystem();

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

// ===== STUDY TIMER SYSTEM =====
class StudyTimer {
  constructor() {
    this.timeLeft = 25 * 60; // 25 minutes in seconds
    this.isRunning = false;
    this.currentMode = "pomodoro";
    this.interval = null;
    this.pomodorosToday = 0;
    this.studyTimeToday = 0;
    this.studyStreak = 0;
    this.settings = {
      pomodoro: 25,
      shortBreak: 5,
      longBreak: 15,
      autoStartBreak: false,
      soundNotification: true,
    };

    this.init();
  }

  async init() {
    // Load saved data
    const savedData = await STORAGE.get("timer_data", {});
    this.pomodorosToday = savedData.pomodorosToday || 0;
    this.studyTimeToday = savedData.studyTimeToday || 0;
    this.studyStreak = savedData.studyStreak || 0;
    this.settings = { ...this.settings, ...savedData.settings };

    console.log("Timer settings loaded:", this.settings);

    // Load settings
    this.loadSettings();
    this.updateStats();
    this.setupEventListeners();
    this.updateDisplay();

    // Sync with background timer
    await this.syncWithBackgroundTimer();
  }

  async syncWithBackgroundTimer() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "pomodoro_get_status",
      });

      if (response && response.activeTimer) {
        const activeTimer = response.activeTimer;
        const now = Date.now();
        const elapsed = Math.floor((now - activeTimer.startTime) / 1000);
        const remaining = activeTimer.duration - elapsed;

        if (remaining > 0) {
          // Resume timer in popup - update mode and UI first
          this.currentMode = activeTimer.mode;
          this.timeLeft = remaining;
          this.isRunning = activeTimer.isRunning;

          // Update UI elements
          this.updateModeButtons();
          this.updateDisplay();

          // Update mode display
          const modeNames = {
            pomodoro: "Pomodoro",
            short: "Nghỉ ngắn",
            long: "Nghỉ dài",
            custom: "Tùy chỉnh",
          };
          const modeDisplay = document.getElementById("timerMode");
          if (modeDisplay) {
            modeDisplay.textContent = modeNames[activeTimer.mode];
          }

          if (this.isRunning) {
            // Clear any existing interval first
            if (this.interval) {
              clearInterval(this.interval);
            }

            this.interval = setInterval(() => {
              this.timeLeft--;
              this.updateDisplay();
              if (this.timeLeft <= 0) {
                this.complete();
              }
            }, 1000);

            // Update UI
            document.getElementById("timerStart").style.display = "none";
            document.getElementById("timerPause").style.display =
              "inline-block";
            document.getElementById("timerDisplay").classList.add("running");
          } else {
            // Timer is paused, update UI accordingly
            document.getElementById("timerStart").style.display =
              "inline-block";
            document.getElementById("timerPause").style.display = "none";
            document.getElementById("timerDisplay").classList.remove("running");
          }

          console.log(
            `Synced with background timer: ${remaining} seconds remaining, mode: ${activeTimer.mode}, isRunning: ${activeTimer.isRunning}`
          );
          console.log(
            `Current mode set to: ${this.currentMode}, timeLeft: ${this.timeLeft}`
          );
        }
      }
    } catch (error) {
      console.error("Failed to sync with background timer:", error);
    }
  }

  setupEventListeners() {
    // Timer controls
    document
      .getElementById("timerStart")
      .addEventListener("click", () => this.start());
    document
      .getElementById("timerPause")
      .addEventListener("click", () => this.pause());
    document
      .getElementById("timerReset")
      .addEventListener("click", () => this.reset());

    // Mode buttons
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        const time = parseInt(btn.dataset.time);
        this.setMode(mode, time);
      });
    });

    // Settings
    document.getElementById("pomodoroTime")?.addEventListener("change", (e) => {
      this.settings.pomodoro = parseInt(e.target.value);
      this.saveSettings();
    });

    document
      .getElementById("shortBreakTime")
      .addEventListener("change", (e) => {
        this.settings.shortBreak = parseInt(e.target.value);
        this.saveSettings();
      });

    document
      .getElementById("longBreakTime")
      ?.addEventListener("change", (e) => {
        this.settings.longBreak = parseInt(e.target.value);
        this.saveSettings();
      });

    document
      .getElementById("autoStartBreak")
      .addEventListener("change", (e) => {
        this.settings.autoStartBreak = e.target.checked;
        this.saveSettings();
      });

    document
      .getElementById("soundNotification")
      .addEventListener("change", (e) => {
        this.settings.soundNotification = e.target.checked;
        this.saveSettings();
      });
  }

  loadSettings() {
    document.getElementById("pomodoroTime").value = this.settings.pomodoro;
    document.getElementById("shortBreakTime").value = this.settings.shortBreak;
    document.getElementById("longBreakTime").value = this.settings.longBreak;
    document.getElementById("autoStartBreak").checked =
      this.settings.autoStartBreak;
    document.getElementById("soundNotification").checked =
      this.settings.soundNotification;
  }

  async updateLastBreakTime() {
    const timerData = await STORAGE.get("timer_data", {});
    timerData.lastBreakTime = Date.now();
    await STORAGE.set({ timer_data: timerData });
  }

  recordStudySession() {
    // Record this study session for break reminder calculations
    const session = {
      startTime: Date.now() - this.getModeTime() * 60 * 1000, // Calculate start time
      endTime: Date.now(),
      duration: this.getModeTime(), // in minutes
      mode: this.currentMode,
      completed: true,
    };

    // Load existing study history from storage
    STORAGE.get("timer_data", {}).then((timerData) => {
      if (!timerData.studyHistory) {
        timerData.studyHistory = [];
      }

      // Add new session
      timerData.studyHistory.push(session);

      // Keep only last 50 sessions to prevent storage bloat
      if (timerData.studyHistory.length > 50) {
        timerData.studyHistory = timerData.studyHistory.slice(-50);
      }

      // Save updated history
      STORAGE.set({ timer_data: timerData });
    });
  }

  async saveSettings() {
    await STORAGE.set({
      timer_data: {
        pomodorosToday: this.pomodorosToday,
        studyTimeToday: this.studyTimeToday,
        studyStreak: this.studyStreak,
        settings: this.settings,
      },
    });
  }

  setMode(mode, time) {
    this.currentMode = mode;
    this.timeLeft = time * 60;
    this.updateDisplay();
    this.updateModeButtons();

    // Update mode display
    const modeNames = {
      pomodoro: "Pomodoro",
      short: "Nghỉ ngắn",
      long: "Nghỉ dài",
      custom: "Tùy chỉnh",
    };
    document.getElementById("timerMode").textContent = modeNames[mode];

    // Update lastBreakTime when starting a break
    if (mode === "short" || mode === "long") {
      this.updateLastBreakTime();
    }
  }

  updateModeButtons() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === this.currentMode);
    });
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start background timer
    try {
      const mode = this.currentMode;
      const duration = this.getModeTime();
      console.log(`Starting timer: mode=${mode}, duration=${duration} minutes`);

      await chrome.runtime.sendMessage({
        action: "pomodoro_start",
        mode: mode,
        duration: duration,
      });
    } catch (error) {
      console.error("Failed to start background timer:", error);
      this.isRunning = false;
      return;
    }

    // Clear any existing interval first
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(() => {
      this.timeLeft--;
      this.updateDisplay();

      if (this.timeLeft <= 0) {
        this.complete();
      }
    }, 1000);

    // Update UI
    document.getElementById("timerStart").style.display = "none";
    document.getElementById("timerPause").style.display = "inline-block";
    document.getElementById("timerDisplay").classList.add("running");

    // Add warning animation when 1 minute left
    if (this.timeLeft <= 60) {
      document.getElementById("timerDisplay").classList.add("warning");
    }

    // Save current state
    this.saveSettings();
  }

  async pause() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Pause background timer
    try {
      await chrome.runtime.sendMessage({
        action: "pomodoro_pause",
      });
    } catch (error) {
      console.error("Failed to pause background timer:", error);
    }

    // Update UI
    document.getElementById("timerStart").style.display = "inline-block";
    document.getElementById("timerPause").style.display = "none";
    document.getElementById("timerDisplay").classList.remove("running");

    // Save current state
    this.saveSettings();
  }

  async reset() {
    try {
      await this.pause();

      // Reset background timer
      try {
        await chrome.runtime.sendMessage({
          action: "pomodoro_reset",
        });
      } catch (error) {
        console.error("Failed to reset background timer:", error);
      }

      this.timeLeft = this.getModeTime() * 60;
      this.updateDisplay();
      document.getElementById("timerDisplay").classList.remove("warning");

      // Add rotate animation to reset icon
      const resetIcon = document.querySelector("#timerReset .timer-icon");
      if (resetIcon) {
        resetIcon.classList.add("rotate");
        setTimeout(() => {
          resetIcon.classList.remove("rotate");
        }, 500);
      }

      // Save state after reset
      this.saveSettings();
    } catch (error) {
      console.error("Error in reset function:", error);
    }
  }

  // Cleanup function to be called when popup closes
  cleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  complete() {
    try {
      // Stop the timer properly
      this.isRunning = false;
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }

      // Update UI
      document.getElementById("timerStart").style.display = "inline-block";
      document.getElementById("timerPause").style.display = "none";
      document.getElementById("timerDisplay").classList.remove("running");
      document.getElementById("timerDisplay").classList.remove("warning");

      // Play sound if enabled
      if (this.settings.soundNotification) {
        this.playNotificationSound();
      }

      // Record study session
      this.recordStudySession();

      // Update stats
      if (this.currentMode === "pomodoro") {
        this.pomodorosToday++;
        this.studyTimeToday += this.getModeTime();
      } else if (this.currentMode === "short" || this.currentMode === "long") {
        // Update lastBreakTime when break completes
        this.updateLastBreakTime();
      }

      this.updateStats();
      this.saveSettings();

      // Show notification
      const modeNames = {
        pomodoro: "Pomodoro",
        short: "Nghỉ ngắn",
        long: "Nghỉ dài",
        custom: "Tùy chỉnh",
      };

      Toast.success(
        `${modeNames[this.currentMode]} hoàn thành!`,
        this.currentMode === "pomodoro"
          ? `Đã hoàn thành ${this.pomodorosToday} pomodoros hôm nay`
          : "Hãy nghỉ ngơi một chút!"
      );

      // Auto-start break if enabled
      if (this.settings.autoStartBreak && this.currentMode === "pomodoro") {
        setTimeout(() => {
          this.setMode("short", this.settings.shortBreak);
          this.start();
        }, 2000);
      } else {
        // Reset to pomodoro
        setTimeout(() => {
          this.setMode("pomodoro", this.settings.pomodoro);
        }, 2000);
      }
    } catch (error) {
      console.error("Error in complete function:", error);
    }
  }

  getModeTime() {
    const time = (() => {
      switch (this.currentMode) {
        case "pomodoro":
          return this.settings.pomodoro;
        case "short":
          return this.settings.shortBreak;
        case "long":
          return this.settings.longBreak;
        case "custom":
          return 30; // Default custom time
        default:
          return 25;
      }
    })();

    console.log(
      `getModeTime(): mode=${this.currentMode}, time=${time} minutes`
    );
    return time;
  }

  updateDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const display = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
    document.getElementById("timerDisplay").textContent = display;
  }

  updateStats() {
    document.getElementById("pomodorosToday").textContent = this.pomodorosToday;

    const hours = Math.floor(this.studyTimeToday / 60);
    const minutes = this.studyTimeToday % 60;
    document.getElementById(
      "studyTimeToday"
    ).textContent = `${hours}h ${minutes}m`;

    document.getElementById(
      "studyStreak"
    ).textContent = `${this.studyStreak} ngày`;
  }

  playNotificationSound() {
    // Create a simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.5
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log("Audio not supported");
    }
  }
}

// Initialize Study Timer
let studyTimer;
document.addEventListener("DOMContentLoaded", () => {
  studyTimer = new StudyTimer();
});

// Cleanup timer when popup closes
window.addEventListener("beforeunload", () => {
  if (studyTimer) {
    studyTimer.cleanup();
  }
});

// ===== ACHIEVEMENT SYSTEM =====
class AchievementSystem {
  constructor() {
    console.log("AchievementSystem constructor started");
    // Initialize properties first
    this.unlockedAchievements = new Set();
    this.totalXP = 0;
    this.level = 1;
    this.badges = new Set();

    this.achievements = [
      // === STUDY ACHIEVEMENTS ===
      {
        id: "first_pomodoro",
        title: "Bắt đầu hành trình",
        description: "Hoàn thành Pomodoro đầu tiên",
        icon: "🍅",
        category: "study",
        rarity: "common",
        condition: (data) => data.pomodorosToday >= 1,
        progress: (data) => Math.min(data.pomodorosToday, 1),
        maxProgress: 1,
        reward: { xp: 10, badge: "starter" },
      },
      {
        id: "pomodoro_5",
        title: "Năng suất cao",
        description: "Hoàn thành 5 Pomodoros trong một ngày",
        icon: "⚡",
        category: "study",
        rarity: "uncommon",
        condition: (data) => data.pomodorosToday >= 5,
        progress: (data) => Math.min(data.pomodorosToday, 5),
        maxProgress: 5,
        reward: { xp: 50, badge: "productive" },
      },
      {
        id: "pomodoro_master",
        title: "Bậc thầy Pomodoro",
        description: "Hoàn thành 10 Pomodoros trong một ngày",
        icon: "🔥",
        category: "study",
        rarity: "rare",
        condition: (data) => data.pomodorosToday >= 10,
        progress: (data) => Math.min(data.pomodorosToday, 10),
        maxProgress: 10,
        reward: { xp: 100, badge: "pomodoro_master" },
      },
      {
        id: "pomodoro_legend",
        title: "Huyền thoại Pomodoro",
        description: "Hoàn thành 20 Pomodoros trong một ngày",
        icon: "👑",
        category: "study",
        rarity: "epic",
        condition: (data) => data.pomodorosToday >= 20,
        progress: (data) => Math.min(data.pomodorosToday, 20),
        maxProgress: 20,
        reward: { xp: 300, badge: "pomodoro_legend" },
      },
      {
        id: "study_streak_3",
        title: "Thói quen tốt",
        description: "Học liên tiếp 3 ngày",
        icon: "🔥",
        category: "study",
        rarity: "common",
        condition: (data) => data.studyStreak >= 3,
        progress: (data) => Math.min(data.studyStreak, 3),
        maxProgress: 3,
        reward: { xp: 25, badge: "habit_former" },
      },
      {
        id: "study_streak_7",
        title: "Tuần học tập",
        description: "Học liên tiếp 7 ngày",
        icon: "📚",
        category: "study",
        rarity: "uncommon",
        condition: (data) => data.studyStreak >= 7,
        progress: (data) => Math.min(data.studyStreak, 7),
        maxProgress: 7,
        reward: { xp: 50, badge: "week_warrior" },
      },
      {
        id: "study_streak_30",
        title: "Tháng học tập",
        description: "Học liên tiếp 30 ngày",
        icon: "🏆",
        category: "study",
        rarity: "epic",
        condition: (data) => data.studyStreak >= 30,
        progress: (data) => Math.min(data.studyStreak, 30),
        maxProgress: 30,
        reward: { xp: 300, badge: "month_master" },
      },
      {
        id: "study_streak_100",
        title: "Bậc thầy học tập",
        description: "Học liên tiếp 100 ngày",
        icon: "🎯",
        category: "study",
        rarity: "legendary",
        condition: (data) => data.studyStreak >= 100,
        progress: (data) => Math.min(data.studyStreak, 100),
        maxProgress: 100,
        reward: { xp: 1000, badge: "legend" },
      },
      {
        id: "early_bird",
        title: "Chim sớm",
        description: "Học trước 6h sáng",
        icon: "🌅",
        category: "study",
        rarity: "uncommon",
        condition: (data) => data.earlyStudy,
        progress: (data) => (data.earlyStudy ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 25, badge: "early_bird" },
      },
      {
        id: "night_owl",
        title: "Cú đêm",
        description: "Học sau 11h tối",
        icon: "🦉",
        category: "study",
        rarity: "uncommon",
        condition: (data) => data.nightStudy,
        progress: (data) => (data.nightStudy ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 25, badge: "night_owl" },
      },
      {
        id: "weekend_warrior",
        title: "Chiến binh cuối tuần",
        description: "Học vào cuối tuần",
        icon: "⚔️",
        category: "study",
        rarity: "common",
        condition: (data) => data.weekendStudy,
        progress: (data) => (data.weekendStudy ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 15, badge: "weekend_warrior" },
      },

      // === ACADEMIC ACHIEVEMENTS ===
      {
        id: "gpa_2_5",
        title: "Điểm khá",
        description: "Đạt GPA 2.5 trở lên",
        icon: "📈",
        category: "academic",
        rarity: "common",
        condition: (data) => data.gpa >= 2.5,
        progress: (data) => Math.min(data.gpa, 2.5),
        maxProgress: 2.5,
        reward: { xp: 30, badge: "good_student" },
      },
      {
        id: "gpa_3_0",
        title: "Học sinh giỏi",
        description: "Đạt GPA 3.0 trở lên",
        icon: "🎓",
        category: "academic",
        rarity: "uncommon",
        condition: (data) => data.gpa >= 3.0,
        progress: (data) => Math.min(data.gpa, 3.0),
        maxProgress: 3.0,
        reward: { xp: 50, badge: "excellent_student" },
      },
      {
        id: "gpa_3_5",
        title: "Học sinh xuất sắc",
        description: "Đạt GPA 3.5 trở lên",
        icon: "⭐",
        category: "academic",
        rarity: "rare",
        condition: (data) => data.gpa >= 3.5,
        progress: (data) => Math.min(data.gpa, 3.5),
        maxProgress: 3.5,
        reward: { xp: 100, badge: "outstanding_student" },
      },
      {
        id: "gpa_4_0",
        title: "Thủ khoa",
        description: "Đạt GPA 4.0",
        icon: "💎",
        category: "academic",
        rarity: "epic",
        condition: (data) => data.gpa >= 4.0,
        progress: (data) => Math.min(data.gpa, 4.0),
        maxProgress: 4.0,
        reward: { xp: 500, badge: "perfect_student" },
      },
      {
        id: "perfect_attendance",
        title: "Điểm danh hoàn hảo",
        description: "Điểm danh 100% trong một môn",
        icon: "✅",
        category: "academic",
        rarity: "uncommon",
        condition: (data) => data.perfectAttendance,
        progress: (data) => (data.perfectAttendance ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 75, badge: "perfect_attendance" },
      },
      {
        id: "grade_improvement",
        title: "Tiến bộ vượt bậc",
        description: "Cải thiện GPA từ kỳ trước",
        icon: "📊",
        category: "academic",
        rarity: "uncommon",
        condition: (data) => data.gpaImprovement,
        progress: (data) => (data.gpaImprovement ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 100, badge: "improver" },
      },

      // === PRODUCTIVITY ACHIEVEMENTS ===
      {
        id: "focus_master",
        title: "Bậc thầy tập trung",
        description: "Học liên tục 2 giờ không nghỉ",
        icon: "🎯",
        category: "productivity",
        rarity: "rare",
        condition: (data) => data.longestSession >= 120,
        progress: (data) => Math.min(data.longestSession, 120),
        maxProgress: 120,
        reward: { xp: 150, badge: "focus_master" },
      },
      {
        id: "speed_learner",
        title: "Học nhanh",
        description: "Hoàn thành 5 Pomodoros trong 1 giờ",
        icon: "⚡",
        category: "productivity",
        rarity: "rare",
        condition: (data) => data.fastPomodoros >= 5,
        progress: (data) => Math.min(data.fastPomodoros, 5),
        maxProgress: 5,
        reward: { xp: 125, badge: "speed_learner" },
      },
      {
        id: "consistency_king",
        title: "Vua kiên trì",
        description: "Học đều đặn 5 ngày liên tiếp",
        icon: "👑",
        category: "productivity",
        rarity: "uncommon",
        condition: (data) => data.consistentDays >= 5,
        progress: (data) => Math.min(data.consistentDays, 5),
        maxProgress: 5,
        reward: { xp: 75, badge: "consistency_king" },
      },
      {
        id: "multitasker",
        title: "Đa nhiệm",
        description: "Học nhiều môn trong một ngày",
        icon: "🔄",
        category: "productivity",
        rarity: "common",
        condition: (data) => data.multiSubjectDay,
        progress: (data) => (data.multiSubjectDay ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 30, badge: "multitasker" },
      },

      // === SPECIAL ACHIEVEMENTS ===
      {
        id: "note_taker",
        title: "Ghi chú chuyên nghiệp",
        description: "Viết ghi chú cho 5 môn học",
        icon: "📝",
        category: "special",
        rarity: "common",
        condition: (data) => data.notesCount >= 5,
        progress: (data) => Math.min(data.notesCount, 5),
        maxProgress: 5,
        reward: { xp: 25, badge: "note_taker" },
      },
      {
        id: "note_master",
        title: "Bậc thầy ghi chú",
        description: "Viết ghi chú cho 10 môn học",
        icon: "📚",
        category: "special",
        rarity: "rare",
        condition: (data) => data.notesCount >= 10,
        progress: (data) => Math.min(data.notesCount, 10),
        maxProgress: 10,
        reward: { xp: 100, badge: "note_master" },
      },
      {
        id: "note_legend",
        title: "Huyền thoại ghi chú",
        description: "Viết ghi chú cho 20 môn học",
        icon: "📋",
        category: "special",
        rarity: "epic",
        condition: (data) => data.notesCount >= 20,
        progress: (data) => Math.min(data.notesCount, 20),
        maxProgress: 20,
        reward: { xp: 300, badge: "note_legend" },
      },
      {
        id: "explorer",
        title: "Nhà thám hiểm",
        description: "Khám phá tất cả các tab",
        icon: "🗺️",
        category: "special",
        rarity: "uncommon",
        condition: (data) => data.tabsExplored >= 8,
        progress: (data) => Math.min(data.tabsExplored, 8),
        maxProgress: 8,
        reward: { xp: 100, badge: "explorer" },
      },
      {
        id: "customizer",
        title: "Nhà thiết kế",
        description: "Tùy chỉnh giao diện",
        icon: "🎨",
        category: "special",
        rarity: "common",
        condition: (data) => data.customizations >= 3,
        progress: (data) => Math.min(data.customizations, 3),
        maxProgress: 3,
        reward: { xp: 50, badge: "customizer" },
      },
      {
        id: "music_lover",
        title: "Người yêu nhạc",
        description: "Sử dụng Focus Music",
        icon: "🎵",
        category: "special",
        rarity: "common",
        condition: (data) => data.musicUsed,
        progress: (data) => (data.musicUsed ? 1 : 0),
        maxProgress: 1,
        reward: { xp: 25, badge: "music_lover" },
      },
      {
        id: "planner",
        title: "Nhà lập kế hoạch",
        description: "Tạo kế hoạch học tập",
        icon: "📋",
        category: "special",
        rarity: "uncommon",
        condition: (data) => data.plansCreated >= 1,
        progress: (data) => Math.min(data.plansCreated, 1),
        maxProgress: 1,
        reward: { xp: 75, badge: "planner" },
      },
      {
        id: "achievement_hunter",
        title: "Thợ săn thành tích",
        description: "Mở khóa 15 thành tích",
        icon: "🏆",
        category: "special",
        rarity: "epic",
        condition: (data) => data.achievementsUnlocked >= 15,
        progress: (data) => Math.min(data.achievementsUnlocked, 15),
        maxProgress: 15,
        reward: { xp: 500, badge: "achievement_hunter" },
      },
      {
        id: "completionist",
        title: "Người hoàn thiện",
        description: "Mở khóa tất cả thành tích",
        icon: "💯",
        category: "special",
        rarity: "legendary",
        condition: (data) =>
          data.achievementsUnlocked >= this.getTotalAchievements(),
        progress: (data) =>
          Math.min(data.achievementsUnlocked, this.getTotalAchievements()),
        maxProgress: () => this.getTotalAchievements(),
        reward: { xp: 1000, badge: "completionist" },
      },
    ];
    console.log(
      "AchievementSystem constructor completed, achievements count:",
      this.achievements.length
    );
  }

  getTotalAchievements() {
    return this.achievements.length;
  }

  async init() {
    console.log("AchievementSystem init started");
    try {
      // Clear any existing achievement notifications first
      this.clearAllAchievementNotifications();

      await this.loadAchievements();
      console.log("loadAchievements completed");
      await this.checkAchievements();
      console.log("checkAchievements completed");
      this.renderAchievements();
      console.log("renderAchievements completed");
      this.renderStats();
      console.log("renderStats completed");
    } catch (error) {
      console.error("Error in AchievementSystem init:", error);
    }
  }

  async loadAchievements() {
    try {
      const data = await STORAGE.get([
        "unlocked_achievements",
        "achievement_xp",
        "achievement_level",
        "achievement_badges",
      ]);
      console.log("loadAchievements data:", data);

      // Handle case where data might be undefined or null
      if (!data) {
        console.log("No achievement data found, using defaults");
        return;
      }

      this.unlockedAchievements = new Set(data.unlocked_achievements || []);
      this.totalXP = data.achievement_xp || 0;
      this.level = data.achievement_level || 1;
      this.badges = new Set(data.achievement_badges || []);

      console.log("Achievements loaded:", {
        unlocked: this.unlockedAchievements.size,
        xp: this.totalXP,
        level: this.level,
        badges: this.badges.size,
      });
    } catch (error) {
      console.error("Error loading achievements:", error);
      // Use defaults if loading fails
    }
  }

  async saveAchievements() {
    await STORAGE.set({
      unlocked_achievements: Array.from(this.unlockedAchievements),
      achievement_xp: this.totalXP,
      achievement_level: this.level,
      achievement_badges: Array.from(this.badges),
    });
  }

  async checkAchievements(forceCheck = false) {
    // Only check achievements if forced or if we haven't checked recently
    const lastCheck = await STORAGE.get("last_achievement_check", 0);
    const now = Date.now();
    const timeSinceLastCheck = now - lastCheck;

    // Don't check more than once per hour unless forced
    if (!forceCheck && timeSinceLastCheck < 60 * 60 * 1000) {
      console.log("Skipping achievement check - checked recently");
      return;
    }

    console.log("Checking achievements...");
    await STORAGE.set({ last_achievement_check: now });

    const currentData = await this.getCurrentData();
    let newAchievements = 0;
    const newlyUnlocked = [];

    for (const achievement of this.achievements) {
      if (!this.unlockedAchievements.has(achievement.id)) {
        if (achievement.condition(currentData)) {
          this.unlockedAchievements.add(achievement.id);
          this.totalXP += achievement.reward.xp;
          this.badges.add(achievement.reward.badge);
          newAchievements++;
          newlyUnlocked.push(achievement);
        }
      }
    }

    // Update level based on XP
    this.updateLevel();

    if (newAchievements > 0) {
      await this.saveAchievements();

      // Show notifications for newly unlocked achievements
      newlyUnlocked.forEach((achievement) => {
        this.showAchievementNotification(achievement);
      });

      Toast.success(`🎉 Mở khóa ${newAchievements} thành tích mới!`);
    }
  }

  updateLevel() {
    const newLevel = Math.floor(this.totalXP / 100) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      Toast.success(`🎊 Lên cấp ${this.level}!`);
    }
  }

  showAchievementNotification(achievement) {
    // Remove any existing achievement notifications
    document
      .querySelectorAll(".achievement-notification")
      .forEach((n) => n.remove());

    const notification = document.createElement("div");
    notification.className = "achievement-notification";
    notification.innerHTML = `
      <div class="achievement-notification-content">
        <div class="achievement-notification-icon">${achievement.icon}</div>
        <div class="achievement-notification-text">
          <div class="achievement-notification-title">${achievement.title}</div>
          <div class="achievement-notification-desc">${achievement.description}</div>
          <div class="achievement-notification-reward">+${achievement.reward.xp} XP</div>
        </div>
        <button class="achievement-close" id="achievement-close-${achievement.id}">×</button>
      </div>
    `;

    document.body.appendChild(notification);

    // Add event listener for close button
    const closeBtn = notification.querySelector(
      `#achievement-close-${achievement.id}`
    );
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
      });
    }

    // Animate in
    setTimeout(() => notification.classList.add("show"), 100);

    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }

  // Clear all achievement notifications
  clearAllAchievementNotifications() {
    document
      .querySelectorAll(".achievement-notification")
      .forEach((n) => n.remove());
  }

  async getCurrentData() {
    try {
      const data = await STORAGE.get([
        "timer_data",
        "gpa_data",
        "attendance_data",
        "course_notes",
        "study_history",
        "tab_visits",
        "customizations",
        "music_used",
        "study_plans",
      ]);

      // Handle case where data might be undefined or null
      if (!data) {
        console.log("No current data found, using defaults");
        return this.getDefaultData();
      }

      const timerData = data.timer_data || {};
      const gpaData = data.gpa_data || {};
      const attendanceData = data.attendance_data || {};
      const notes = data.course_notes || {};
      const studyHistory = data.study_history || [];
      const tabVisits = data.tab_visits || {};
      const customizations = data.customizations || 0;
      const musicUsed = data.music_used || false;
      const plans = data.study_plans || [];

      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay();

      return {
        pomodorosToday: timerData.pomodorosToday || 0,
        studyStreak: timerData.studyStreak || 0,
        gpa: gpaData.gpa || 0,
        notesCount: Object.keys(notes).length,
        earlyStudy: currentHour < 6,
        nightStudy: currentHour > 23,
        weekendStudy: currentDay === 0 || currentDay === 6,
        perfectAttendance: this.checkPerfectAttendance(attendanceData),
        gpaImprovement: this.checkGPAImprovement(gpaData),
        longestSession: this.getLongestSession(studyHistory),
        fastPomodoros: this.getFastPomodoros(studyHistory),
        consistentDays: this.getConsistentDays(studyHistory),
        multiSubjectDay: this.checkMultiSubjectDay(studyHistory),
        tabsExplored: Object.keys(tabVisits).length,
        customizations: customizations,
        musicUsed: musicUsed,
        plansCreated: plans.length,
        achievementsUnlocked: this.unlockedAchievements.size,
      };
    } catch (error) {
      console.error("Error getting current data:", error);
      return this.getDefaultData();
    }
  }

  getDefaultData() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    return {
      pomodorosToday: 0,
      studyStreak: 0,
      gpa: 0,
      notesCount: 0,
      earlyStudy: currentHour < 6,
      nightStudy: currentHour > 23,
      weekendStudy: currentDay === 0 || currentDay === 6,
      perfectAttendance: false,
      gpaImprovement: false,
      longestSession: 0,
      fastPomodoros: 0,
      consistentDays: 0,
      multiSubjectDay: false,
      tabsExplored: 0,
      customizations: 0,
      musicUsed: false,
      plansCreated: 0,
      achievementsUnlocked: this.unlockedAchievements.size,
    };
  }

  checkPerfectAttendance(attendanceData) {
    for (const subject in attendanceData) {
      const attendance = attendanceData[subject];
      if (attendance.attended === attendance.total && attendance.total > 0) {
        return true;
      }
    }
    return false;
  }

  checkGPAImprovement(gpaData) {
    // Simplified check - in real implementation, you'd compare with previous semester
    return gpaData.gpa > 3.0;
  }

  getLongestSession(studyHistory) {
    let longest = 0;
    for (const session of studyHistory) {
      if (session.duration > longest) {
        longest = session.duration;
      }
    }
    return longest;
  }

  getFastPomodoros(studyHistory) {
    const today = new Date().toDateString();
    let fastCount = 0;
    for (const session of studyHistory) {
      if (session.date === today && session.duration < 60) {
        fastCount++;
      }
    }
    return fastCount;
  }

  getConsistentDays(studyHistory) {
    const dates = new Set();
    for (const session of studyHistory) {
      dates.add(session.date);
    }
    return dates.size;
  }

  checkMultiSubjectDay(studyHistory) {
    const today = new Date().toDateString();
    const subjects = new Set();
    for (const session of studyHistory) {
      if (session.date === today) {
        subjects.add(session.subject);
      }
    }
    return subjects.size > 1;
  }

  renderAchievements() {
    const grid = document.getElementById("achievementsGrid");
    console.log("renderAchievements called, grid element:", grid);
    if (!grid) {
      console.error("achievementsGrid element not found!");
      return;
    }

    // Group achievements by category
    const categories = {
      study: { title: "📚 Học tập", achievements: [] },
      academic: { title: "🎓 Học thuật", achievements: [] },
      productivity: { title: "⚡ Năng suất", achievements: [] },
      special: { title: "⭐ Đặc biệt", achievements: [] },
    };

    for (const achievement of this.achievements) {
      categories[achievement.category].achievements.push(achievement);
    }

    let html = "";
    for (const [categoryId, category] of Object.entries(categories)) {
      html += `
        <div class="achievement-category">
          <h4 class="category-title">${category.title}</h4>
          <div class="category-achievements">
            ${category.achievements
              .map((achievement) => this.createAchievementCard(achievement))
              .join("")}
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
  }

  createAchievementCard(achievement) {
    const isUnlocked = this.unlockedAchievements.has(achievement.id);
    const currentData = this.getCurrentDataSync();
    const progress = achievement.progress(currentData);
    const maxProgress =
      typeof achievement.maxProgress === "function"
        ? achievement.maxProgress()
        : achievement.maxProgress;
    const progressPercent = (progress / maxProgress) * 100;

    const rarityClass = `rarity-${achievement.rarity}`;
    const statusClass = isUnlocked ? "unlocked" : "locked";

    return `
      <div class="achievement-card ${statusClass} ${rarityClass}" data-achievement="${
      achievement.id
    }">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-content">
          <div class="achievement-title">${achievement.title}</div>
          <div class="achievement-description">${achievement.description}</div>
          <div class="achievement-progress">
            <div class="achievement-progress-bar">
              <div class="achievement-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="achievement-progress-text">${progress}/${maxProgress}</div>
          </div>
          <div class="achievement-reward">
            <span class="reward-xp">+${achievement.reward.xp} XP</span>
            <span class="reward-badge">${achievement.reward.badge}</span>
          </div>
        </div>
        ${isUnlocked ? '<div class="achievement-badge">✓</div>' : ""}
      </div>
    `;
  }

  getCurrentDataSync() {
    // Synchronous version for immediate rendering
    return {
      pomodorosToday: studyTimer?.pomodorosToday || 0,
      studyStreak: studyTimer?.studyStreak || 0,
      gpa: 0, // Will be updated when data loads
      notesCount: 0,
      earlyStudy: false,
      nightStudy: false,
      weekendStudy: false,
      perfectAttendance: false,
      gpaImprovement: false,
      longestSession: 0,
      fastPomodoros: 0,
      consistentDays: 0,
      multiSubjectDay: false,
      tabsExplored: 0,
      customizations: 0,
      musicUsed: false,
      plansCreated: 0,
      achievementsUnlocked: this.unlockedAchievements.size,
    };
  }

  renderStats() {
    const statsContainer = document.getElementById("achievementStats");
    console.log("renderStats called, statsContainer element:", statsContainer);
    if (!statsContainer) {
      console.error("achievementStats element not found!");
      return;
    }

    const unlockedCount = this.unlockedAchievements.size;
    const totalCount = this.achievements.length;
    const completionRate = (unlockedCount / totalCount) * 100;

    statsContainer.innerHTML = `
      <div class="achievement-stats-grid">
        <div class="stat-item">
          <div class="stat-value">${this.level}</div>
          <div class="stat-label">Cấp độ</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.totalXP}</div>
          <div class="stat-label">Tổng XP</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${unlockedCount}/${totalCount}</div>
          <div class="stat-label">Thành tích</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${Math.round(completionRate)}%</div>
          <div class="stat-label">Hoàn thành</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.badges.size}</div>
          <div class="stat-label">Huy hiệu</div>
        </div>
      </div>
      <div class="level-progress">
        <div class="level-progress-bar">
          <div class="level-progress-fill" style="width: ${
            this.totalXP % 100
          }%"></div>
        </div>
        <div class="level-progress-text">${this.totalXP % 100}/100 XP đến cấp ${
      this.level + 1
    }</div>
      </div>
    `;
  }

  async refresh() {
    await this.checkAchievements();
    this.renderAchievements();
    this.renderStats();
  }
}

let achievementSystem;
document.addEventListener("DOMContentLoaded", () => {
  try {
    achievementSystem = new AchievementSystem();
    console.log("AchievementSystem initialized successfully");
    // Call init after a short delay to ensure DOM is ready
    setTimeout(() => {
      achievementSystem.init();
    }, 100);

    // Setup all event listeners to replace inline handlers
    setupEventListeners();
  } catch (error) {
    console.error("Error initializing AchievementSystem:", error);
  }
});

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

  // Analytics toggle buttons
  document
    .querySelectorAll('[data-analytics-action="toggle"]')
    .forEach((btn) => {
      const sectionId = btn.getAttribute("data-analytics-id");
      btn.addEventListener("click", () => toggleAnalytics(sectionId));
    });

  // Progress toggle buttons
  document
    .querySelectorAll('[data-progress-action="toggle"]')
    .forEach((btn) => {
      const sectionId = btn.getAttribute("data-progress-id");
      btn.addEventListener("click", () => toggleProgress(sectionId));
    });

  // Generic data-action event delegation
  document.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    if (!action) return;

    switch (action) {
      case "close-modal":
        e.target.closest(".modal-overlay, .tab-editor-modal")?.remove();
        break;

      case "save-tab-layout":
        if (window.advancedCustomization) {
          advancedCustomization.saveTabLayout();
        }
        break;

      case "toggle-tab":
        const tabId = e.target.getAttribute("data-tab-id");
        if (window.advancedCustomization && tabId) {
          advancedCustomization.toggleTabVisibility(tabId);
        }
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

  // Fallback for tab layout buttons (in case AdvancedCustomization setup fails)
  setTimeout(() => {
    const btnEditTabs = document.getElementById("btnEditTabs");
    if (btnEditTabs && !btnEditTabs.hasAttribute("data-listener-added")) {
      btnEditTabs.addEventListener("click", () => {
        if (window.advancedCustomization) {
          advancedCustomization.openTabEditor();
        } else {
          console.log("AdvancedCustomization not ready yet, retrying...");
          // Retry after a short delay
          setTimeout(() => {
            if (window.advancedCustomization) {
              advancedCustomization.openTabEditor();
            }
          }, 100);
        }
      });
      btnEditTabs.setAttribute("data-listener-added", "true");
      console.log("Fallback: Tab Edit button event listener added");
    }

    const btnResetTabs = document.getElementById("btnResetTabs");
    if (btnResetTabs && !btnResetTabs.hasAttribute("data-listener-added")) {
      btnResetTabs.addEventListener("click", () => {
        if (window.advancedCustomization) {
          advancedCustomization.resetTabs();
        } else {
          console.log("AdvancedCustomization not ready yet, retrying...");
          // Retry after a short delay
          setTimeout(() => {
            if (window.advancedCustomization) {
              advancedCustomization.resetTabs();
            }
          }, 100);
        }
      });
      btnResetTabs.setAttribute("data-listener-added", "true");
      console.log("Fallback: Tab Reset button event listener added");
    }
  }, 500);
}

// ===== ADVANCED CUSTOMIZATION SYSTEM =====
class AdvancedCustomization {
  constructor() {
    this.customStyleSheet = null;
    this.init();
  }

  async init() {
    this.createStyleSheet();
    await this.loadSettings();
    this.setupEventListeners();
  }

  createStyleSheet() {
    this.customStyleSheet = document.createElement("style");
    this.customStyleSheet.id = "customStyleSheet";
    document.head.appendChild(this.customStyleSheet);
  }

  async loadSettings() {
    const customCSS = await STORAGE.get("custom_css", "");
    const layoutMode = await STORAGE.get("layout_mode", "default");

    document.getElementById("customCSS").value = customCSS;
    document.getElementById("layoutMode").value = layoutMode;

    this.applyLayoutMode(layoutMode);
    if (customCSS) {
      this.applyCustomCSS(customCSS);
    }
  }

  setupEventListeners() {
    // Wait for DOM to be ready
    setTimeout(() => {
      // CSS Editor
      const btnApplyCSS = document.getElementById("btnApplyCSS");
      if (btnApplyCSS) {
        btnApplyCSS.addEventListener("click", () => {
          this.applyCustomCSS();
        });
      }

      const btnResetCSS = document.getElementById("btnResetCSS");
      if (btnResetCSS) {
        btnResetCSS.addEventListener("click", () => {
          this.resetCustomCSS();
        });
      }

      const btnPreviewCSS = document.getElementById("btnPreviewCSS");
      if (btnPreviewCSS) {
        btnPreviewCSS.addEventListener("click", () => {
          this.previewCustomCSS();
        });
      }

      // Layout Mode
      const layoutMode = document.getElementById("layoutMode");
      if (layoutMode) {
        layoutMode.addEventListener("change", (e) => {
          this.applyLayoutMode(e.target.value);
          STORAGE.set({ layout_mode: e.target.value });
        });
      }

      // Widget System
      const btnToggleWidgets = document.getElementById("btnToggleWidgets");
      if (btnToggleWidgets) {
        btnToggleWidgets.addEventListener("click", () => {
          this.toggleWidgets();
        });
      }

      const btnResetLayout = document.getElementById("btnResetLayout");
      if (btnResetLayout) {
        btnResetLayout.addEventListener("click", () => {
          this.resetLayout();
        });
      }

      // Layout Editor - Tab Layout
      const btnEditTabs = document.getElementById("btnEditTabs");
      if (btnEditTabs) {
        btnEditTabs.addEventListener("click", () => {
          this.openTabEditor();
        });
        console.log("Tab Edit button event listener added");
      } else {
        console.error("btnEditTabs element not found");
      }

      const btnResetTabs = document.getElementById("btnResetTabs");
      if (btnResetTabs) {
        btnResetTabs.addEventListener("click", () => {
          this.resetTabs();
        });
        console.log("Tab Reset button event listener added");
      } else {
        console.error("btnResetTabs element not found");
      }
    }, 100);
  }

  applyCustomCSS(css = null) {
    const cssContent = css || document.getElementById("customCSS").value;

    try {
      this.customStyleSheet.textContent = cssContent;
      STORAGE.set({ custom_css: cssContent });
      Toast.success("CSS đã được áp dụng!");
    } catch (error) {
      Toast.error("CSS không hợp lệ!", error.message);
    }
  }

  resetCustomCSS() {
    document.getElementById("customCSS").value = "";
    this.customStyleSheet.textContent = "";
    STORAGE.set({ custom_css: "" });
    Toast.success("CSS đã được reset!");
  }

  previewCustomCSS() {
    const css = document.getElementById("customCSS").value;
    if (!css.trim()) {
      Toast.warning("Vui lòng nhập CSS để preview!");
      return;
    }

    // Create temporary preview
    const tempStyle = document.createElement("style");
    tempStyle.textContent = css;
    document.head.appendChild(tempStyle);

    // Remove after 3 seconds
    setTimeout(() => {
      document.head.removeChild(tempStyle);
      Toast.info("Preview đã kết thúc!");
    }, 3000);

    Toast.success("Preview CSS trong 3 giây!");
  }

  applyLayoutMode(mode) {
    document.body.setAttribute("data-layout", mode);
  }

  toggleWidgets() {
    const widgets = document.querySelectorAll(".widget");
    const isVisible = widgets[0]?.style.display !== "none";

    widgets.forEach((widget) => {
      widget.style.display = isVisible ? "none" : "block";
    });

    Toast.success(`Widgets ${isVisible ? "ẩn" : "hiện"}!`);
  }

  resetLayout() {
    // Reset layout mode
    document.body.removeAttribute("data-layout");
    document.getElementById("layoutMode").value = "default";

    // Reset CSS
    this.resetCustomCSS();

    // Show all widgets
    document.querySelectorAll(".widget").forEach((widget) => {
      widget.style.display = "block";
    });

    // Clear widget state from storage
    STORAGE.set({
      hidden_widgets: [],
      widget_order: [],
    });

    Toast.success("Layout đã được reset về mặc định!");
  }

  openTabEditor() {
    const modal = document.createElement("div");
    modal.className = "tab-editor-modal";
    modal.innerHTML = `
      <div class="tab-editor-content">
        <div class="tab-editor-header">
          <h3 class="tab-editor-title">✏️ Chỉnh sửa Tab Layout</h3>
          <button class="tab-editor-close" data-action="close-modal">×</button>
        </div>
        <div class="tab-list" id="tabList">
          <!-- Tabs will be populated here -->
        </div>
        <div class="tab-editor-actions">
          <button class="secondary" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-tab-layout">Lưu</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.populateTabList();
    this.setupTabEditorDragAndDrop();
  }

  populateTabList() {
    const tabList = document.getElementById("tabList");
    const tabs = document.querySelectorAll(".tabs button");
    const hiddenTabs = this.getHiddenTabs();

    tabList.innerHTML = "";

    tabs.forEach((tab) => {
      const tabId = tab.dataset.tab;
      const isHidden = hiddenTabs.includes(tabId);
      const icon = this.getTabIcon(tabId);
      const label = tab.textContent;

      const tabItem = document.createElement("div");
      tabItem.className = "tab-item";
      tabItem.dataset.tab = tabId;
      tabItem.innerHTML = `
        <div class="tab-drag-handle">⋮⋮</div>
        <div class="tab-icon">${icon}</div>
        <div class="tab-label">${label}</div>
        <div class="tab-toggle ${
          isHidden ? "" : "active"
        }" data-action="toggle-tab" data-tab-id="${tabId}"></div>
      `;

      tabList.appendChild(tabItem);
    });
  }

  getTabIcon(tabId) {
    const icons = {
      "tab-today": "📅",
      "tab-gpa": "📊",
      "tab-calc": "🧮",
      "tab-stats": "📈",
      "tab-timer": "⏱️",
      "tab-att": "📚",
      "tab-schedule": "📋",
      "tab-exam": "📝",
      "tab-bookmark": "🔖",
      "tab-settings": "⚙️",
    };
    return icons[tabId] || "📄";
  }

  getHiddenTabs() {
    return JSON.parse(localStorage.getItem("hidden_tabs") || "[]");
  }

  toggleTabVisibility(tabId) {
    const toggle = document.querySelector(`[data-tab="${tabId}"] .tab-toggle`);
    const hiddenTabs = this.getHiddenTabs();

    if (toggle.classList.contains("active")) {
      toggle.classList.remove("active");
      hiddenTabs.push(tabId);
    } else {
      toggle.classList.add("active");
      const index = hiddenTabs.indexOf(tabId);
      if (index > -1) {
        hiddenTabs.splice(index, 1);
      }
    }

    localStorage.setItem("hidden_tabs", JSON.stringify(hiddenTabs));
  }

  setupTabEditorDragAndDrop() {
    const tabList = document.getElementById("tabList");
    if (!tabList) {
      console.error("tabList element not found");
      return;
    }

    tabList.addEventListener("dragstart", (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains("tab-item")
      ) {
        e.target.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      }
    });

    tabList.addEventListener("dragend", (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains("tab-item")
      ) {
        e.target.classList.remove("dragging");
      }
    });

    tabList.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    tabList.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedTab = document.querySelector(".dragging");
      if (draggedTab && e.target) {
        try {
          tabList.insertBefore(draggedTab, e.target);
        } catch (error) {
          console.error("Error in drop event:", error);
        }
      }
    });
  }

  async saveTabLayout() {
    const tabItems = document.querySelectorAll("#tabList .tab-item");
    const tabOrder = Array.from(tabItems).map((item) => item.dataset.tab);
    const hiddenTabs = this.getHiddenTabs();

    // Save tab order
    await STORAGE.set({ tab_order: tabOrder });

    // Apply changes
    this.applyTabLayout(tabOrder, hiddenTabs);

    // Close modal
    document.querySelector(".tab-editor-modal")?.remove();

    Toast.success("Tab layout đã được lưu!");
  }

  applyTabLayout(tabOrder, hiddenTabs) {
    const tabsContainer = document.querySelector(".tabs");
    const tabs = Array.from(tabsContainer.querySelectorAll("button"));

    // Reorder tabs
    tabOrder.forEach((tabId) => {
      const tab = tabs.find((t) => t.dataset.tab === tabId);
      if (tab) {
        tabsContainer.appendChild(tab);
      }
    });

    // Hide tabs
    hiddenTabs.forEach((tabId) => {
      const tab = document.querySelector(`[data-tab="${tabId}"]`);
      if (tab) {
        tab.style.display = "none";
      }
    });
  }

  async resetTabs() {
    await STORAGE.set({ tab_order: [] });
    localStorage.removeItem("hidden_tabs");

    // Show all tabs
    document.querySelectorAll(".tabs button").forEach((tab) => {
      tab.style.display = "block";
    });

    Toast.success("Tab layout đã được reset!");
  }
}

// Initialize Advanced Customization
let advancedCustomization;
document.addEventListener("DOMContentLoaded", () => {
  advancedCustomization = new AdvancedCustomization();
});

// ===== WIDGET SYSTEM =====
class WidgetSystem {
  constructor() {
    this.widgets = new Map();
    this.init();
  }

  async init() {
    this.setupWidgets();
    this.setupDragAndDrop();
    await this.loadWidgetStates();
    await this.updateQuickStats();

    // Check if widgets are visible after loading
    setTimeout(() => {
      this.checkWidgetVisibility();
    }, 500);

    // Auto-fix widget state
    setTimeout(() => {
      this.autoFixWidgetState();
    }, 1000);
  }

  checkWidgetVisibility() {
    const allWidgets = document.querySelectorAll(".widget");
    const visibleWidgets = Array.from(allWidgets).filter(
      (w) => w.style.display !== "none" && w.offsetParent !== null
    );

    console.log("=== checkWidgetVisibility ===");
    console.log("Total widgets:", allWidgets.length);
    console.log("Visible widgets:", visibleWidgets.length);

    if (visibleWidgets.length === 0 && allWidgets.length > 0) {
      console.log("No widgets visible! Forcing show all widgets...");
      this.showAllWidgets();
    }
  }

  // Auto-fix widget state when extension loads
  async autoFixWidgetState() {
    console.log("=== autoFixWidgetState ===");

    // Check if we have any hidden widgets in storage
    const hiddenWidgets = await STORAGE.get("hidden_widgets", []);
    const widgetOrder = await STORAGE.get("widget_order", []);

    console.log("Hidden widgets in storage:", hiddenWidgets);
    console.log("Widget order in storage:", widgetOrder);

    // If we have hidden widgets but no widgets are actually hidden, clear the storage
    if (hiddenWidgets.length > 0) {
      const actuallyHidden = hiddenWidgets.filter((widgetId) => {
        const widget = document.querySelector(`[data-widget="${widgetId}"]`);
        return widget && widget.style.display === "none";
      });

      console.log("Actually hidden widgets:", actuallyHidden);

      if (actuallyHidden.length === 0) {
        console.log("No widgets are actually hidden, clearing storage...");
        await STORAGE.set({ hidden_widgets: [] });
      }
    }
  }

  setupWidgets() {
    // Make widgets draggable
    document.querySelectorAll(".widget").forEach((widget) => {
      widget.draggable = true;
      this.widgets.set(widget.dataset.widget, widget);
    });
  }

  setupDragAndDrop() {
    const container = document.getElementById("widgetsContainer");

    container.addEventListener("dragstart", (e) => {
      const widget = e.target.closest(".widget");
      if (widget) {
        widget.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", widget.dataset.widget || "");
      }
    });

    container.addEventListener("dragend", (e) => {
      const widget = e.target.closest(".widget");
      if (widget) {
        widget.classList.remove("dragging");
      }
    });

    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      // Add visual feedback
      const widget = e.target.closest(".widget");
      if (widget && !widget.classList.contains("dragging")) {
        widget.classList.add("drag-over");
      }
    });

    container.addEventListener("dragleave", (e) => {
      const widget = e.target.closest(".widget");
      if (widget) {
        widget.classList.remove("drag-over");
      }
    });

    container.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedWidget = document.querySelector(".dragging");
      if (draggedWidget) {
        // Remove all drag-over classes
        container.querySelectorAll(".drag-over").forEach((el) => {
          el.classList.remove("drag-over");
        });

        // Find the correct drop target
        let dropTarget = e.target.closest(".widget");

        // If no valid widget target, append to end
        if (!dropTarget || dropTarget === draggedWidget) {
          container.appendChild(draggedWidget);
        } else {
          // Insert before the target widget
          try {
            container.insertBefore(draggedWidget, dropTarget);
          } catch (error) {
            console.warn("Failed to insert widget, appending to end:", error);
            container.appendChild(draggedWidget);
          }
        }

        draggedWidget.classList.remove("dragging");
        this.saveWidgetOrder();
      }
    });
  }

  async loadWidgetStates() {
    // Wait a bit to ensure all widgets are rendered
    await new Promise((resolve) => setTimeout(resolve, 100));

    const hiddenWidgets = await STORAGE.get("hidden_widgets", []);
    const widgetOrder = await STORAGE.get("widget_order", []);

    console.log("=== loadWidgetStates ===");
    console.log("Hidden widgets:", hiddenWidgets);
    console.log("Widget order:", widgetOrder);

    const allWidgets = document.querySelectorAll(".widget");
    console.log("Found widgets:", allWidgets.length);
    allWidgets.forEach((w) => console.log("Widget:", w.dataset.widget));

    // First, show all widgets by default
    allWidgets.forEach((widget) => {
      widget.style.display = "block";
    });

    // Then hide the ones that should be hidden
    hiddenWidgets.forEach((widgetId) => {
      const widget = document.querySelector(`[data-widget="${widgetId}"]`);
      if (widget) {
        console.log("Hiding widget:", widgetId);
        widget.style.display = "none";
      } else {
        console.log("Widget not found:", widgetId);
      }
    });

    // Reorder widgets
    if (widgetOrder.length > 0) {
      const container = document.getElementById("widgetsContainer");
      if (container) {
        widgetOrder.forEach((widgetId) => {
          const widget = document.querySelector(`[data-widget="${widgetId}"]`);
          if (widget) {
            console.log("Reordering widget:", widgetId);
            container.appendChild(widget);
          }
        });
      }
    }
  }

  async saveWidgetOrder() {
    const widgets = Array.from(document.querySelectorAll(".widget")).map(
      (w) => w.dataset.widget
    );
    await STORAGE.set({ widget_order: widgets });
  }

  // Force show all widgets (for debugging/reset)
  showAllWidgets() {
    console.log("=== showAllWidgets ===");
    const allWidgets = document.querySelectorAll(".widget");
    console.log("Found widgets:", allWidgets.length);

    allWidgets.forEach((widget) => {
      widget.style.display = "block";
      console.log("Showing widget:", widget.dataset.widget);
    });

    // Clear hidden widgets from storage
    STORAGE.set({ hidden_widgets: [] });
    console.log("Cleared hidden widgets from storage");
  }

  async updateQuickStats() {
    // Update GPA
    const gpaElement = document.getElementById("quickGPA");
    if (gpaElement) {
      const gpa = document.getElementById("gpa10")?.textContent || "--";
      gpaElement.textContent = gpa;
    }

    // Update Attendance - force refresh
    await updateAttendanceQuickStats();

    // Debug attendance data
    await debugAttendanceData();

    // Refresh search data after loading all data
    await refreshSearchData();

    // Update Pomodoros
    const pomodorosElement = document.getElementById("quickPomodoros");
    if (pomodorosElement && studyTimer) {
      pomodorosElement.textContent = studyTimer.pomodorosToday || 0;
    }
  }
}

// Widget control functions
function toggleWidget(widgetId) {
  const widget = document.querySelector(`[data-widget="${widgetId}"]`);
  if (widget) {
    const content = widget.querySelector(".widget-content");
    const isHidden = content.style.display === "none";
    content.style.display = isHidden ? "block" : "none";

    // Save state
    saveWidgetState(widgetId, !isHidden);
  }
}

function removeWidget(widgetId) {
  const widget = document.querySelector(`[data-widget="${widgetId}"]`);
  if (widget) {
    widget.style.display = "none";
    saveWidgetState(widgetId, false);
  }
}

async function saveWidgetState(widgetId, isVisible) {
  const hiddenWidgets = await STORAGE.get("hidden_widgets", []);

  if (isVisible) {
    const index = hiddenWidgets.indexOf(widgetId);
    if (index > -1) {
      hiddenWidgets.splice(index, 1);
    }
  } else {
    if (!hiddenWidgets.includes(widgetId)) {
      hiddenWidgets.push(widgetId);
    }
  }

  await STORAGE.set({ hidden_widgets: hiddenWidgets });
}

function switchTab(tabId) {
  console.log(`Switching to tab: ${tabId}`);
  const tabButton = document.querySelector(`[data-tab="${tabId}"]`);
  console.log(`Found tab button:`, tabButton);
  if (tabButton) {
    // Remove active class from all tabs
    document.querySelectorAll(".tabs button").forEach((btn) => {
      btn.classList.remove("active");
    });

    // Add active class to clicked tab
    tabButton.classList.add("active");

    // Hide all tab content
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.remove("active");
    });

    // Show target tab content
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
      targetTab.classList.add("active");
      console.log(`Activated tab content: ${tabId}`);
    } else {
      console.error(`Tab content not found: ${tabId}`);
    }

    // Update tab indicator position
    const indicator = document.querySelector(".tab-indicator");
    if (indicator) {
      const buttonRect = tabButton.getBoundingClientRect();
      const containerRect = document
        .querySelector(".tabs")
        .getBoundingClientRect();
      const left =
        buttonRect.left -
        containerRect.left +
        document.querySelector(".tabs").scrollLeft;
      indicator.style.left = `${left}px`;
      indicator.style.width = `${buttonRect.width}px`;
    }

    console.log(`Successfully switched to tab: ${tabId}`);
  } else {
    console.error(`Tab button not found for: ${tabId}`);
  }
}

// Initialize Widget System
let widgetSystem;
document.addEventListener("DOMContentLoaded", () => {
  widgetSystem = new WidgetSystem();
});

// ===== ANALYTICS DASHBOARD =====
class AnalyticsDashboard {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadAnalytics();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Refresh analytics when stats are updated
    document
      .getElementById("btnRefreshStats")
      ?.addEventListener("click", () => {
        this.loadAnalytics();
      });
  }

  async loadAnalytics() {
    await this.updateStudyPatterns();
    await this.updateProductivityInsights();
    await this.updateWeeklyReport();
    await this.updateGoals();
  }

  async updateStudyPatterns() {
    const timerData = await STORAGE.get("timer_data", {});
    const studyHistory = await STORAGE.get("study_history", []);

    // Peak study time
    const peakTime = this.calculatePeakStudyTime(studyHistory);
    document.getElementById("peakStudyTime").textContent = peakTime;

    // Average session
    const avgSession = this.calculateAverageSession(timerData);
    document.getElementById("avgSession").textContent = avgSession;

    // Most productive day
    const productiveDay = this.calculateMostProductiveDay(studyHistory);
    document.getElementById("productiveDay").textContent = productiveDay;
  }

  calculatePeakStudyTime(studyHistory) {
    if (!studyHistory.length) return "--";

    const hourCounts = {};
    studyHistory.forEach((session) => {
      const hour = new Date(session.startTime).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHour = Object.keys(hourCounts).reduce((a, b) =>
      hourCounts[a] > hourCounts[b] ? a : b
    );

    return `${peakHour}:00`;
  }

  calculateAverageSession(timerData) {
    const totalTime = timerData.totalStudyTime || 0;
    const sessions = timerData.totalSessions || 1;
    const avgMinutes = Math.round(totalTime / sessions);

    if (avgMinutes < 60) {
      return `${avgMinutes}m`;
    } else {
      const hours = Math.floor(avgMinutes / 60);
      const minutes = avgMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  }

  calculateMostProductiveDay(studyHistory) {
    if (!studyHistory.length) return "--";

    const dayCounts = {};
    studyHistory.forEach((session) => {
      const day = new Date(session.startTime).toLocaleDateString("vi-VN", {
        weekday: "long",
      });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    return Object.keys(dayCounts).reduce((a, b) =>
      dayCounts[a] > dayCounts[b] ? a : b
    );
  }

  async updateProductivityInsights() {
    const timerData = await STORAGE.get("timer_data", {});
    const gpaData = await STORAGE.get("gpa_data", {});

    // Focus score (based on pomodoro completion rate)
    const focusScore = this.calculateFocusScore(timerData);
    this.updateInsightBar("focusScore", focusScore);
    document.getElementById("focusScoreText").textContent = `${focusScore}%`;

    // Consistency (based on daily study streak)
    const consistency = this.calculateConsistency(timerData);
    this.updateInsightBar("consistencyScore", consistency);
    document.getElementById(
      "consistencyScoreText"
    ).textContent = `${consistency}%`;

    // Goal progress (based on GPA improvement)
    const goalProgress = this.calculateGoalProgress(gpaData);
    this.updateInsightBar("goalProgress", goalProgress);
    document.getElementById(
      "goalProgressText"
    ).textContent = `${goalProgress}%`;
  }

  calculateFocusScore(timerData) {
    const completed = timerData.completedPomodoros || 0;
    const started = timerData.startedPomodoros || 1;
    return Math.min(Math.round((completed / started) * 100), 100);
  }

  calculateConsistency(timerData) {
    const streak = timerData.studyStreak || 0;
    return Math.min(streak * 10, 100);
  }

  calculateGoalProgress(gpaData) {
    const currentGPA = gpaData.gpa || 0;
    const targetGPA = 3.5;
    return Math.min(Math.round((currentGPA / targetGPA) * 100), 100);
  }

  updateInsightBar(elementId, percentage) {
    const bar = document.getElementById(elementId);
    if (bar) {
      bar.style.width = `${percentage}%`;
    }
  }

  async updateWeeklyReport() {
    const timerData = await STORAGE.get("timer_data", {});
    const attendanceData = await STORAGE.get("attendance_data", {});
    const achievements = await STORAGE.get("unlocked_achievements", []);

    // Weekly study time
    const weeklyTime = this.calculateWeeklyStudyTime(timerData);
    document.getElementById("weeklyStudyTime").textContent = weeklyTime;

    // Weekly pomodoros
    const weeklyPomodoros = timerData.pomodorosThisWeek || 0;
    document.getElementById("weeklyPomodoros").textContent = weeklyPomodoros;

    // Weekly achievements
    const weeklyAchievements = this.calculateWeeklyAchievements(achievements);
    document.getElementById("weeklyAchievements").textContent =
      weeklyAchievements;

    // Weekly attendance
    const attendance = attendanceData.rate || 0;
    document.getElementById("weeklyAttendance").textContent = `${attendance}%`;
  }

  calculateWeeklyStudyTime(timerData) {
    const weeklyMinutes = timerData.weeklyStudyTime || 0;
    if (weeklyMinutes < 60) {
      return `${weeklyMinutes}m`;
    } else {
      const hours = Math.floor(weeklyMinutes / 60);
      const minutes = weeklyMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  }

  calculateWeeklyAchievements(achievements) {
    // Count achievements unlocked in the last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return achievements.filter(
      (achievement) =>
        achievement.unlockedAt && achievement.unlockedAt > weekAgo
    ).length;
  }

  async updateGoals() {
    const timerData = await STORAGE.get("timer_data", {});
    const gpaData = await STORAGE.get("gpa_data", {});

    // Daily study goal (2 hours)
    const dailyGoal = 120; // minutes
    const dailyProgress = Math.min(timerData.studyTimeToday || 0, dailyGoal);
    const dailyPercent = Math.round((dailyProgress / dailyGoal) * 100);

    document.getElementById("dailyGoalProgress").textContent = `${
      Math.round((dailyProgress / 60) * 10) / 10
    }h/2h`;
    this.updateGoalBar("dailyGoalFill", dailyPercent);

    // Weekly pomodoro goal (20 pomodoros)
    const weeklyGoal = 20;
    const weeklyProgress = Math.min(
      timerData.pomodorosThisWeek || 0,
      weeklyGoal
    );
    const weeklyPercent = Math.round((weeklyProgress / weeklyGoal) * 100);

    document.getElementById(
      "weeklyGoalProgress"
    ).textContent = `${weeklyProgress}/20`;
    this.updateGoalBar("weeklyGoalFill", weeklyPercent);

    // GPA goal (3.5)
    const gpaGoal = 3.5;
    const currentGPA = gpaData.gpa || 0;
    const gpaPercent = Math.round((currentGPA / gpaGoal) * 100);

    document.getElementById(
      "gpaGoalProgress"
    ).textContent = `${currentGPA.toFixed(2)}/3.5`;
    this.updateGoalBar("gpaGoalFill", gpaPercent);
  }

  updateGoalBar(elementId, percentage) {
    const bar = document.getElementById(elementId);
    if (bar) {
      bar.style.width = `${Math.min(percentage, 100)}%`;
    }
  }
}

// Analytics toggle function
function toggleAnalytics(sectionId) {
  const content = document.getElementById(sectionId);
  const button = content.previousElementSibling.querySelector(".analytics-btn");

  if (content.style.display === "none") {
    content.style.display = "flex";
    button.textContent = "−";
  } else {
    content.style.display = "none";
    button.textContent = "+";
  }
}

// Initialize Analytics Dashboard
let analyticsDashboard;
document.addEventListener("DOMContentLoaded", () => {
  analyticsDashboard = new AnalyticsDashboard();
});

// ===== SMART NOTIFICATIONS =====
class SmartNotifications {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.startSmartReminders();
  }

  async loadSettings() {
    const settings = await STORAGE.get("notification_settings", {
      notifyBeforeClass: 15,
      smartReminders: true,
      breakReminders: true,
      goalAlerts: true,
      achievementNotifs: true,
      dailySummary: false,
      notificationSound: "default",
    });

    // Load settings into UI
    document.getElementById("notifyBeforeClass").value =
      settings.notifyBeforeClass;
    document.getElementById("smartReminders").checked = settings.smartReminders;
    document.getElementById("breakReminders").checked = settings.breakReminders;
    document.getElementById("goalAlerts").checked = settings.goalAlerts;
    document.getElementById("achievementNotifs").checked =
      settings.achievementNotifs;
    document.getElementById("dailySummary").checked = settings.dailySummary;
    document.getElementById("notificationSound").value =
      settings.notificationSound;
  }

  setupEventListeners() {
    // Save settings when changed
    const inputs = [
      "notifyBeforeClass",
      "smartReminders",
      "breakReminders",
      "goalAlerts",
      "achievementNotifs",
      "dailySummary",
      "notificationSound",
    ];

    inputs.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("change", () => this.saveSettings());
      }
    });

    // Test buttons
    document.getElementById("btnTestNotify")?.addEventListener("click", () => {
      this.testNotification();
    });

    document
      .getElementById("btnTestSmartNotify")
      ?.addEventListener("click", () => {
        this.testSmartNotification();
      });
  }

  async saveSettings() {
    const settings = {
      notifyBeforeClass: parseInt(
        document.getElementById("notifyBeforeClass").value
      ),
      smartReminders: document.getElementById("smartReminders").checked,
      breakReminders: document.getElementById("breakReminders").checked,
      goalAlerts: document.getElementById("goalAlerts").checked,
      achievementNotifs: document.getElementById("achievementNotifs").checked,
      dailySummary: document.getElementById("dailySummary").checked,
      notificationSound: document.getElementById("notificationSound").value,
    };

    await STORAGE.set({ notification_settings: settings });
    Toast.success("Notification settings saved!");
  }

  async startSmartReminders() {
    const settings = await STORAGE.get("notification_settings", {});

    if (settings.smartReminders) {
      // Check for class reminders
      this.checkClassReminders();

      // Check for study break reminders
      if (settings.breakReminders) {
        this.checkBreakReminders();
      }

      // Check for goal progress
      if (settings.goalAlerts) {
        this.checkGoalProgress();
      }

      // Schedule daily summary
      if (settings.dailySummary) {
        this.scheduleDailySummary();
      }
    }
  }

  async checkClassReminders() {
    const schedule = await STORAGE.get("schedule_data", []);
    const settings = await STORAGE.get("notification_settings", {});
    const notifyBefore = settings.notifyBeforeClass || 15;

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    schedule.forEach((classItem) => {
      if (classItem.date === today) {
        const classTime = new Date(`${today}T${classItem.time}`);
        const timeDiff = classTime.getTime() - now.getTime();
        const minutesDiff = timeDiff / (1000 * 60);

        if (minutesDiff > 0 && minutesDiff <= notifyBefore) {
          this.showClassReminder(classItem, minutesDiff);
        }
      }
    });
  }

  showClassReminder(classItem, minutesLeft) {
    const message = `Lớp ${classItem.subject} sắp bắt đầu trong ${Math.round(
      minutesLeft
    )} phút!`;
    this.showNotification("📚 Lớp học sắp bắt đầu", message);
  }

  async checkBreakReminders() {
    const timerData = await STORAGE.get("timer_data", {});
    const lastBreak = timerData.lastBreakTime || 0;
    const now = Date.now();
    const timeSinceBreak = (now - lastBreak) / (1000 * 60); // minutes

    // Calculate actual study time since last break
    const studyTimeSinceBreak = this.calculateStudyTimeSinceBreak(
      timerData,
      lastBreak
    );

    console.log("=== Break Reminder Check ===");
    console.log("Last break:", new Date(lastBreak).toLocaleString());
    console.log("Time since break:", Math.round(timeSinceBreak), "minutes");
    console.log(
      "Study time since break:",
      Math.round(studyTimeSinceBreak),
      "minutes"
    );
    console.log("Pomodoros today:", timerData.pomodorosToday || 0);

    // Only remind if:
    // 1. User has been studying (has pomodoros today)
    // 2. More than 2 hours of actual study time since last break
    // 3. At least 30 minutes have passed since last break
    if (
      timerData.pomodorosToday > 0 &&
      studyTimeSinceBreak > 120 &&
      timeSinceBreak > 30
    ) {
      const hours = Math.floor(studyTimeSinceBreak / 60);
      const minutes = Math.round(studyTimeSinceBreak % 60);

      this.showNotification(
        "☕ Nghỉ ngơi",
        `Bạn đã học được ${hours}h ${minutes}m rồi! Hãy nghỉ ngơi một chút nhé.`
      );

      // Update last break time to prevent spam
      timerData.lastBreakTime = now;
      await STORAGE.set({ timer_data: timerData });
    }
  }

  calculateStudyTimeSinceBreak(timerData, lastBreakTime) {
    if (!lastBreakTime) {
      // If no previous break, use total study time today
      return timerData.studyTimeToday || 0;
    }

    // Get study history to calculate time since last break
    const studyHistory = timerData.studyHistory || [];
    const lastBreakDate = new Date(lastBreakTime);

    // Calculate study time since last break
    let studyTimeSinceBreak = 0;

    studyHistory.forEach((session) => {
      const sessionDate = new Date(session.startTime);
      if (sessionDate > lastBreakDate && session.mode === "pomodoro") {
        studyTimeSinceBreak += session.duration || 25; // Default 25 minutes per pomodoro
      }
    });

    // If no history, estimate based on pomodoros completed since last break
    if (studyTimeSinceBreak === 0) {
      const pomodorosSinceBreak = Math.floor(
        (Date.now() - lastBreakTime) / (25 * 60 * 1000)
      );
      studyTimeSinceBreak = pomodorosSinceBreak * 25; // 25 minutes per pomodoro
    }

    return studyTimeSinceBreak;
  }

  async checkGoalProgress() {
    const timerData = await STORAGE.get("timer_data", {});
    const gpaData = await STORAGE.get("gpa_data", {});

    // Daily study goal progress
    const dailyGoal = 120; // 2 hours in minutes
    const studyTime = timerData.studyTimeToday || 0;
    const progress = (studyTime / dailyGoal) * 100;

    if (progress >= 50 && progress < 100) {
      this.showNotification(
        "🎯 Mục tiêu hàng ngày",
        `Bạn đã hoàn thành ${Math.round(progress)}% mục tiêu học tập hôm nay!`
      );
    } else if (progress >= 100) {
      this.showNotification(
        "🎉 Hoàn thành mục tiêu!",
        "Chúc mừng! Bạn đã hoàn thành mục tiêu học tập hôm nay!"
      );
    }

    // GPA improvement
    const currentGPA = gpaData.gpa || 0;
    const targetGPA = 3.5;
    if (currentGPA >= targetGPA) {
      this.showNotification(
        "⭐ GPA Goal Achieved!",
        `Chúc mừng! Bạn đã đạt được mục tiêu GPA ${targetGPA}!`
      );
    }
  }

  scheduleDailySummary() {
    // Schedule daily summary at 9 PM
    const now = new Date();
    const summaryTime = new Date();
    summaryTime.setHours(21, 0, 0, 0); // 9 PM

    if (summaryTime <= now) {
      summaryTime.setDate(summaryTime.getDate() + 1);
    }

    const timeUntilSummary = summaryTime.getTime() - now.getTime();

    setTimeout(() => {
      this.showDailySummary();
      this.scheduleDailySummary(); // Schedule next day
    }, timeUntilSummary);
  }

  async showDailySummary() {
    const timerData = await STORAGE.get("timer_data", {});
    const achievements = await STORAGE.get("unlocked_achievements", []);

    const studyTime = timerData.studyTimeToday || 0;
    const pomodoros = timerData.pomodorosToday || 0;
    const newAchievements = achievements.filter(
      (a) =>
        a.unlockedAt &&
        new Date(a.unlockedAt).toDateString() === new Date().toDateString()
    ).length;

    const message = `Hôm nay bạn đã học ${
      Math.round((studyTime / 60) * 10) / 10
    }h, hoàn thành ${pomodoros} pomodoros`;
    if (newAchievements > 0) {
      message += ` và mở khóa ${newAchievements} thành tích mới!`;
    }

    this.showNotification("📊 Tóm tắt hàng ngày", message);
  }

  showNotification(title, message) {
    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(title, {
        body: message,
        icon: "icon128.png",
        badge: "icon128.png",
      });

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      // Play sound if enabled
      this.playNotificationSound();
    } else {
      // Fallback to toast
      Toast.info(title, message);
    }
  }

  playNotificationSound() {
    const settings = STORAGE.get("notification_settings", {});
    const sound = settings.notificationSound || "default";

    if (sound === "none") return;

    // Create audio context for notification sounds
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Different sounds for different types
    switch (sound) {
      case "gentle":
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(
          600,
          audioContext.currentTime + 0.1
        );
        break;
      case "energetic":
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(
          1200,
          audioContext.currentTime + 0.1
        );
        oscillator.frequency.setValueAtTime(
          1000,
          audioContext.currentTime + 0.2
        );
        break;
      default:
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
    }

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }

  testNotification() {
    this.showNotification("🔔 Test Notification", "Đây là thông báo test!");
  }

  testSmartNotification() {
    this.showNotification(
      "🧠 Smart Notification",
      "Thông báo thông minh đang hoạt động!"
    );
  }
}

// Initialize Smart Notifications
let smartNotifications;
document.addEventListener("DOMContentLoaded", () => {
  smartNotifications = new SmartNotifications();
});

// ===== PROGRESS TRACKING =====
class ProgressTracking {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadProgressData();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Refresh progress when stats are updated
    document
      .getElementById("btnRefreshStats")
      ?.addEventListener("click", () => {
        this.loadProgressData();
      });
  }

  async loadProgressData() {
    await this.updateStudyGoals();
    await this.updateStudyStreak();
    await this.updateSubjectProgress();
    await this.updateAchievementProgress();
  }

  async updateStudyGoals() {
    const timerData = await STORAGE.get("timer_data", {});
    const gpaData = await STORAGE.get("gpa_data", {});

    // Daily Study Time Goal (2 hours)
    const dailyGoal = 120; // minutes
    const studyTime = timerData.studyTimeToday || 0;
    const dailyProgress = Math.min((studyTime / dailyGoal) * 100, 100);

    document.getElementById(
      "dailyStudyProgress"
    ).style.width = `${dailyProgress}%`;
    document.getElementById("dailyStudyPercent").textContent = `${Math.round(
      dailyProgress
    )}%`;
    document.querySelector(
      "#study-goals .goal-item:first-child .goal-target"
    ).textContent = `${Math.round((studyTime / 60) * 10) / 10}h / 2h`;

    // Weekly Pomodoros Goal (20)
    const weeklyGoal = 20;
    const pomodoros = timerData.pomodorosThisWeek || 0;
    const weeklyProgress = Math.min((pomodoros / weeklyGoal) * 100, 100);

    document.getElementById(
      "weeklyPomoProgress"
    ).style.width = `${weeklyProgress}%`;
    document.getElementById("weeklyPomoPercent").textContent = `${Math.round(
      weeklyProgress
    )}%`;
    document.querySelector(
      "#study-goals .goal-item:nth-child(2) .goal-target"
    ).textContent = `${pomodoros} / 20`;

    // GPA Goal (3.5)
    const gpaGoal = 3.5;
    const currentGPA = gpaData.gpa || 0;
    const gpaProgress = Math.min((currentGPA / gpaGoal) * 100, 100);

    document.getElementById("gpaProgress").style.width = `${gpaProgress}%`;
    document.getElementById("gpaPercent").textContent = `${Math.round(
      gpaProgress
    )}%`;
    document.querySelector(
      "#study-goals .goal-item:last-child .goal-target"
    ).textContent = `${currentGPA.toFixed(2)} / 3.5`;
  }

  async updateStudyStreak() {
    const timerData = await STORAGE.get("timer_data", {});
    const streak = timerData.studyStreak || 0;

    document.getElementById("currentStreak").textContent = streak;
    this.renderStreakCalendar(streak);
  }

  renderStreakCalendar(streak) {
    const calendar = document.getElementById("streakCalendar");
    calendar.innerHTML = "";

    const today = new Date();
    const days = [];

    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(date);
    }

    days.forEach((date, index) => {
      const dayElement = document.createElement("div");
      dayElement.className = "streak-day";

      // Mark active days (simplified - in real app, check actual study data)
      if (index >= 30 - streak) {
        dayElement.classList.add("active");
      }

      // Mark today
      if (date.toDateString() === today.toDateString()) {
        dayElement.classList.add("today");
      }

      calendar.appendChild(dayElement);
    });
  }

  async updateSubjectProgress() {
    const gpaData = await STORAGE.get("gpa_data", {});
    const subjects = gpaData.subjects || [];

    const subjectList = document.getElementById("subjectList");
    subjectList.innerHTML = "";

    if (subjects.length === 0) {
      subjectList.innerHTML =
        '<div class="no-data">Chưa có dữ liệu môn học</div>';
      return;
    }

    subjects.forEach((subject) => {
      const subjectElement = document.createElement("div");
      subjectElement.className = "subject-item";

      const progress = this.calculateSubjectProgress(subject);

      subjectElement.innerHTML = `
        <span class="subject-name">${subject.name}</span>
        <span class="subject-progress">${progress}%</span>
      `;

      subjectList.appendChild(subjectElement);
    });
  }

  calculateSubjectProgress(subject) {
    // Simplified progress calculation based on grades
    if (!subject.grades || subject.grades.length === 0) return 0;

    const totalGrades = subject.grades.length;
    const completedGrades = subject.grades.filter(
      (grade) => grade !== null && grade !== ""
    ).length;

    return Math.round((completedGrades / totalGrades) * 100);
  }

  async updateAchievementProgress() {
    const achievements = await STORAGE.get("unlocked_achievements", []);
    const totalAchievements = 8; // Total number of achievements

    const unlocked = achievements.length;
    const inProgress = totalAchievements - unlocked;
    const completionRate = Math.round((unlocked / totalAchievements) * 100);

    document.getElementById("unlockedCount").textContent = unlocked;
    document.getElementById("inProgressCount").textContent = inProgress;
    document.getElementById(
      "completionRate"
    ).textContent = `${completionRate}%`;
    document.getElementById(
      "achievementFill"
    ).style.width = `${completionRate}%`;
  }
}

// Progress toggle function
function toggleProgress(sectionId) {
  const content = document.getElementById(sectionId);
  const button = content.previousElementSibling.querySelector(".progress-btn");

  if (content.style.display === "none") {
    content.style.display = "flex";
    button.textContent = "−";
  } else {
    content.style.display = "none";
    button.textContent = "+";
  }
}

// Initialize Progress Tracking
let progressTracking;
document.addEventListener("DOMContentLoaded", () => {
  progressTracking = new ProgressTracking();
});

// ===== ADVANCED SEARCH =====
class AdvancedSearch {
  constructor() {
    this.searchTimeout = null;
    this.searchData = [];
    this.init();
  }

  async init() {
    await this.loadSearchData();
    this.setupEventListeners();

    // Refresh search data periodically
    setInterval(() => {
      this.loadSearchData();
    }, 30000); // Refresh every 30 seconds
  }

  // Public method to refresh search data
  async refreshSearchData() {
    await this.loadSearchData();
  }

  async loadSearchData() {
    console.log("Loading search data...");

    try {
      // Load all searchable data from multiple sources
      const [gpaCache, attendanceCache, examCache, timerData, notesData] =
        await Promise.all([
          STORAGE.get("cache_transcript", null),
          STORAGE.get("cache_attendance", null),
          STORAGE.get("cache_exams", null),
          STORAGE.get("timer_data", {}),
          STORAGE.get("course_notes", {}),
        ]);

      this.searchData = [];

      // GPA Data from transcript cache
      if (gpaCache?.rows || gpaCache?.data?.rows) {
        const rows = gpaCache.rows || gpaCache.data.rows;
        rows.forEach((row) => {
          if (row.code && row.name) {
            this.searchData.push({
              type: "gpa",
              icon: "📊",
              title: `${row.code} - ${row.name}`,
              content: `GPA: ${row.grade || "N/A"}, Credits: ${
                row.credit || 0
              }, Term: ${row.term || "N/A"}`,
              action: () => this.switchToTab("tab-gpa"),
            });
          }
        });
      }

      // Attendance Data
      if (attendanceCache?.entries || attendanceCache?.data?.entries) {
        const entries = attendanceCache.entries || attendanceCache.data.entries;
        entries.forEach((entry) => {
          if (entry.course) {
            this.searchData.push({
              type: "attendance",
              icon: "📚",
              title: entry.course,
              content: `Status: ${entry.status || "N/A"}, Day: ${
                entry.day || "N/A"
              }, Slot: ${entry.slot || "N/A"}`,
              action: () => this.switchToTab("tab-att"),
            });
          }
        });
      }

      // Exam Data
      if (examCache?.entries || examCache?.data?.entries) {
        const entries = examCache.entries || examCache.data.entries;
        entries.forEach((exam) => {
          if (exam.subject) {
            this.searchData.push({
              type: "exam",
              icon: "📝",
              title: exam.subject,
              content: `Date: ${exam.date || "N/A"}, Time: ${
                exam.time || "N/A"
              }, Room: ${exam.room || "N/A"}`,
              action: () => this.switchToTab("tab-exam"),
            });
          }
        });
      }

      // Timer Data
      if (timerData.pomodorosToday > 0) {
        this.searchData.push({
          type: "timer",
          icon: "⏱️",
          title: "Study Timer",
          content: `Pomodoros today: ${
            timerData.pomodorosToday
          }, Study time: ${Math.round(
            (timerData.studyTimeToday || 0) / 60
          )} minutes`,
          action: () => this.switchToTab("tab-timer"),
        });
      }

      // Notes Data
      Object.entries(notesData).forEach(([course, note]) => {
        if (note && note.trim()) {
          this.searchData.push({
            type: "notes",
            icon: "📝",
            title: course,
            content: note.substring(0, 100) + (note.length > 100 ? "..." : ""),
            action: () => this.switchToTab("tab-gpa"),
          });
        }
      });

      // Add some common search terms
      this.searchData.push(
        {
          type: "gpa",
          icon: "📊",
          title: "GPA Calculator",
          content: "Tính toán GPA và điểm trung bình",
          action: () => this.switchToTab("tab-calc"),
        },
        {
          type: "attendance",
          icon: "📚",
          title: "Attendance Tracker",
          content: "Theo dõi điểm danh và chuyên cần",
          action: () => this.switchToTab("tab-att"),
        },
        {
          type: "timer",
          icon: "⏱️",
          title: "Pomodoro Timer",
          content: "Bộ đếm thời gian học tập Pomodoro",
          action: () => this.switchToTab("tab-timer"),
        }
      );

      console.log(`Loaded ${this.searchData.length} search items`);
    } catch (error) {
      console.error("Error loading search data:", error);
      this.searchData = [];
    }
  }

  setupEventListeners() {
    const searchInput = document.getElementById("globalSearch");
    const searchResults = document.getElementById("searchResults");

    // Search input events
    searchInput.addEventListener("input", (e) => {
      this.handleSearch(e.target.value);
    });

    searchInput.addEventListener("focus", () => {
      if (searchInput.value.trim()) {
        searchResults.classList.add("show");
      }
    });

    // Hide results when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-container")) {
        searchResults.classList.remove("show");
      }
    });

    // Keyboard navigation
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchResults.classList.remove("show");
        searchInput.blur();
      }
    });
  }

  handleSearch(query) {
    clearTimeout(this.searchTimeout);

    if (!query.trim()) {
      document.getElementById("searchResults").classList.remove("show");
      return;
    }

    // Show loading state
    this.showLoadingState();

    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }

  showLoadingState() {
    const searchResults = document.getElementById("searchResults");
    searchResults.innerHTML = `
      <div class="search-loading">
        <div class="loading-spinner"></div>
        <span>Đang tìm kiếm...</span>
      </div>
    `;
    searchResults.classList.add("show");
  }

  performSearch(query) {
    if (!query.trim()) {
      this.displayResults([], query);
      return;
    }

    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    const results = this.searchData
      .map((item) => {
        const title = item.title.toLowerCase();
        const content = item.content.toLowerCase();
        let score = 0;

        // Exact match gets highest score
        if (title.includes(query.toLowerCase())) {
          score += 100;
        }
        if (content.includes(query.toLowerCase())) {
          score += 50;
        }

        // Partial matches
        searchTerms.forEach((term) => {
          if (title.includes(term)) {
            score += 20;
          }
          if (content.includes(term)) {
            score += 10;
          }
        });

        // Bonus for starting with query
        if (title.startsWith(query.toLowerCase())) {
          score += 30;
        }

        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Limit to 10 results

    this.displayResults(results, query);
  }

  displayResults(results, query) {
    const searchResults = document.getElementById("searchResults");

    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          Không tìm thấy kết quả cho "${query}"
        </div>
      `;
    } else {
      searchResults.innerHTML = results
        .map(
          (result) => `
        <div class="search-result-item" data-action="select-result" data-result-type="${
          result.type
        }">
          <div class="search-result-header">
            <span class="search-result-icon">${result.icon}</span>
            <span class="search-result-title">${this.highlightText(
              result.title,
              query
            )}</span>
            <span class="search-result-type">${this.getTypeLabel(
              result.type
            )}</span>
          </div>
          <div class="search-result-content">
            ${this.highlightText(result.content, query)}
          </div>
        </div>
      `
        )
        .join("");
    }

    searchResults.classList.add("show");
  }

  highlightText(text, query) {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(
      regex,
      '<span class="search-result-highlight">$1</span>'
    );
  }

  getTypeLabel(type) {
    const labels = {
      gpa: "GPA",
      attendance: "Điểm danh",
      schedule: "Lịch học",
      exam: "Lịch thi",
      timer: "Timer",
      notes: "Ghi chú",
    };
    return labels[type] || type;
  }

  selectResult(type) {
    const searchInput = document.getElementById("globalSearch");
    const searchResults = document.getElementById("searchResults");

    // Clear search
    searchInput.value = "";
    searchResults.classList.remove("show");

    // Switch to appropriate tab
    this.switchToTab(this.getTabForType(type));
  }

  getTabForType(type) {
    const tabMap = {
      gpa: "tab-gpa",
      attendance: "tab-att",
      schedule: "tab-schedule",
      exam: "tab-exam",
      timer: "tab-timer",
      notes: "tab-gpa",
    };
    return tabMap[type] || "tab-today";
  }

  switchToTab(tabId) {
    const tabButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (tabButton) {
      tabButton.click();
    }
  }
}

// Initialize Advanced Search
let advancedSearch;
document.addEventListener("DOMContentLoaded", () => {
  advancedSearch = new AdvancedSearch();
});

// Function to refresh search data when new data is loaded
async function refreshSearchData() {
  if (advancedSearch) {
    await advancedSearch.refreshSearchData();
  }
}

// ===== STUDY PLANS =====
class StudyPlans {
  constructor() {
    this.plans = [];
    this.init();
  }

  async init() {
    await this.loadPlans();
    this.setupEventListeners();
    this.renderPlans();
  }

  setupEventListeners() {
    const btnCreatePlan = document.getElementById("btnCreatePlan");
    if (btnCreatePlan) {
      btnCreatePlan.addEventListener("click", () => {
        this.showCreatePlanModal();
      });
    }

    const planFilter = document.getElementById("planFilter");
    if (planFilter) {
      planFilter.addEventListener("change", (e) => {
        this.filterPlans(e.target.value);
      });
    }
  }

  async loadPlans() {
    const savedPlans = await STORAGE.get("study_plans", []);
    this.plans = savedPlans;
  }

  async savePlans() {
    await STORAGE.set({ study_plans: this.plans });
  }

  showCreatePlanModal() {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-box">
        <h3 class="modal-title">📋 Tạo kế hoạch học tập</h3>
        <div class="modal-content">
          <div class="form-group">
            <label>Tên kế hoạch:</label>
            <input type="text" id="planName" placeholder="Ví dụ: Ôn thi cuối kỳ" />
          </div>
          <div class="form-group">
            <label>Mô tả:</label>
            <textarea id="planDescription" placeholder="Mô tả chi tiết kế hoạch..."></textarea>
          </div>
          <div class="form-group">
            <label>Môn học:</label>
            <input type="text" id="planSubject" placeholder="Ví dụ: Toán cao cấp" />
          </div>
          <div class="form-group">
            <label>Thời gian (phút):</label>
            <input type="number" id="planDuration" value="120" min="30" max="480" />
          </div>
          <div class="form-group">
            <label>Mục tiêu:</label>
            <input type="text" id="planGoal" placeholder="Ví dụ: Hoàn thành chương 1-3" />
          </div>
        </div>
        <div class="modal-actions">
          <button class="secondary" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="create-plan">Tạo kế hoạch</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  createPlan() {
    const nameEl = document.getElementById("planName");
    const descriptionEl = document.getElementById("planDescription");
    const subjectEl = document.getElementById("planSubject");
    const durationEl = document.getElementById("planDuration");
    const goalEl = document.getElementById("planGoal");

    const name = nameEl ? nameEl.value.trim() : "";
    const description = descriptionEl ? descriptionEl.value.trim() : "";
    const subject = subjectEl ? subjectEl.value.trim() : "";
    const duration = durationEl ? parseInt(durationEl.value) : 0;
    const goal = goalEl ? goalEl.value.trim() : "";

    if (!name) {
      Toast.error("Vui lòng nhập tên kế hoạch!");
      return;
    }

    const plan = {
      id: Date.now().toString(),
      name,
      description,
      subject,
      duration,
      goal,
      status: "active",
      progress: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    this.plans.unshift(plan);
    this.savePlans();
    this.renderPlans();

    document.querySelector(".modal-overlay").remove();
    Toast.success("Kế hoạch đã được tạo!");
  }

  renderPlans() {
    const plansList = document.getElementById("plansList");
    if (!plansList) return; // Exit if element doesn't exist

    const planFilterElement = document.getElementById("planFilter");
    const filter = planFilterElement ? planFilterElement.value : "all";

    let filteredPlans = this.plans;
    if (filter !== "all") {
      filteredPlans = this.plans.filter((plan) => plan.status === filter);
    }

    if (filteredPlans.length === 0) {
      plansList.innerHTML = `
        <div class="no-plans">
          <p>Chưa có kế hoạch nào</p>
          <button class="primary" data-action="show-create-plan-modal">Tạo kế hoạch đầu tiên</button>
        </div>
      `;
      return;
    }

    plansList.innerHTML = filteredPlans
      .map((plan) => this.createPlanHTML(plan))
      .join("");
  }

  createPlanHTML(plan) {
    const progressPercent = Math.round(plan.progress);
    const statusClass = plan.status;
    const statusText = this.getStatusText(plan.status);

    return `
      <div class="plan-item ${statusClass}" data-plan-id="${plan.id}">
        <div class="plan-header">
          <div class="plan-title">${plan.name}</div>
          <div class="plan-status ${statusClass}">${statusText}</div>
        </div>
        <div class="plan-content">
          <div class="plan-description">${plan.description}</div>
          <div class="plan-progress">
            <div class="plan-progress-bar">
              <div class="plan-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="plan-progress-text">${progressPercent}%</div>
          </div>
          <div class="plan-details">
            <span>📚 ${plan.subject}</span>
            <span>⏱️ ${Math.round(plan.duration / 60)}h</span>
            <span>🎯 ${plan.goal}</span>
          </div>
        </div>
        <div class="plan-actions">
          ${this.getPlanActions(plan)}
        </div>
      </div>
    `;
  }

  getStatusText(status) {
    const statusMap = {
      active: "Đang hoạt động",
      completed: "Hoàn thành",
      paused: "Tạm dừng",
    };
    return statusMap[status] || status;
  }

  getPlanActions(plan) {
    if (plan.status === "active") {
      return `
        <button class="plan-btn primary" data-action="start-plan" data-plan-id="${plan.id}">▶️ Bắt đầu</button>
        <button class="plan-btn" data-action="pause-plan" data-plan-id="${plan.id}">⏸️ Tạm dừng</button>
        <button class="plan-btn success" data-action="complete-plan" data-plan-id="${plan.id}">✅ Hoàn thành</button>
        <button class="plan-btn danger" data-action="delete-plan" data-plan-id="${plan.id}">🗑️ Xóa</button>
      `;
    } else if (plan.status === "paused") {
      return `
        <button class="plan-btn primary" data-action="resume-plan" data-plan-id="${plan.id}">▶️ Tiếp tục</button>
        <button class="plan-btn success" data-action="complete-plan" data-plan-id="${plan.id}">✅ Hoàn thành</button>
        <button class="plan-btn danger" data-action="delete-plan" data-plan-id="${plan.id}">🗑️ Xóa</button>
      `;
    } else {
      return `
        <button class="plan-btn" data-action="restart-plan" data-plan-id="${plan.id}">🔄 Làm lại</button>
        <button class="plan-btn danger" data-action="delete-plan" data-plan-id="${plan.id}">🗑️ Xóa</button>
      `;
    }
  }

  async startPlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "active";
      await this.savePlans();
      this.renderPlans();
      Toast.success(`Bắt đầu kế hoạch: ${plan.name}`);
    }
  }

  async pausePlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "paused";
      await this.savePlans();
      this.renderPlans();
      Toast.info(`Tạm dừng kế hoạch: ${plan.name}`);
    }
  }

  async resumePlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "active";
      await this.savePlans();
      this.renderPlans();
      Toast.success(`Tiếp tục kế hoạch: ${plan.name}`);
    }
  }

  async completePlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "completed";
      plan.progress = 100;
      plan.completedAt = new Date().toISOString();
      await this.savePlans();
      this.renderPlans();
      Toast.success(`🎉 Hoàn thành kế hoạch: ${plan.name}`);
    }
  }

  async restartPlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "active";
      plan.progress = 0;
      plan.completedAt = null;
      await this.savePlans();
      this.renderPlans();
      Toast.success(`Làm lại kế hoạch: ${plan.name}`);
    }
  }

  async deletePlan(planId) {
    if (confirm("Bạn có chắc muốn xóa kế hoạch này?")) {
      this.plans = this.plans.filter((p) => p.id !== planId);
      await this.savePlans();
      this.renderPlans();
      Toast.success("Kế hoạch đã được xóa!");
    }
  }

  filterPlans(filter) {
    this.renderPlans();
  }

  updatePlanProgress(planId, progress) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.progress = Math.min(progress, 100);
      this.savePlans();
      this.renderPlans();
    }
  }
}

// Initialize Study Plans
let studyPlans;
document.addEventListener("DOMContentLoaded", () => {
  studyPlans = new StudyPlans();
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd + R: Refresh all
  if ((e.ctrlKey || e.metaKey) && e.key === "r") {
    e.preventDefault();
    document.getElementById("btnQuickRefresh")?.click();
    return;
  }

  // Ctrl/Cmd + K: Focus search (first available search input)
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

  // Numbers 1-9: Switch tabs (if not typing in input)
  if (
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.altKey &&
    e.key >= "1" &&
    e.key <= "9"
  ) {
    // Don't trigger if user is typing in input/textarea
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

// ===== WEATHER SYSTEM =====
async function loadWeather() {
  try {
    const weatherData = await cacheGet("weather_data", 10 * 60 * 1000); // Cache 10 minutes
    if (weatherData) {
      updateWeatherDisplay(weatherData);
      return;
    }

    // Fetch from API if no cache
    const response = await fetch(
      "https://api.openweathermap.org/data/2.5/weather?q=Ho%20Chi%20Minh&appid=demo&units=metric"
    );

    if (!response.ok) {
      // Fallback to mock data for demo
      const mockData = {
        main: { temp: 28 },
        weather: [{ description: "Nắng nhẹ" }],
        name: "Hồ Chí Minh",
      };
      updateWeatherDisplay(mockData);
      await STORAGE.set({
        weather_data: {
          ts: Date.now(),
          data: mockData,
        },
      });
      return;
    }

    const data = await response.json();
    updateWeatherDisplay(data);

    // Cache the data
    await STORAGE.set({
      weather_data: {
        ts: Date.now(),
        data: data,
      },
    });
  } catch (error) {
    console.error("Weather fetch error:", error);
    // Show fallback data
    updateWeatherDisplay({
      main: { temp: "--" },
      weather: [{ description: "Không có dữ liệu" }],
      name: "Hồ Chí Minh",
    });
  }
}

function updateWeatherDisplay(data) {
  const tempEl = document.querySelector(".weather-temp");
  const descEl = document.querySelector(".weather-desc");
  const locationEl = document.querySelector(".weather-location");

  if (tempEl) {
    tempEl.textContent = `${Math.round(data.main.temp)}°C`;
  }
  if (descEl) {
    descEl.textContent = data.weather[0].description;
  }
  if (locationEl) {
    locationEl.textContent = data.name;
  }
}

// ===== INITIALIZE ALL NEW FEATURES =====
(async function initializeNewFeatures() {
  await loadTodaySchedule();
  await loadWeather();
  await initGPACalculator();
  await loadStatistics();
  await calculateStreak();

  // Update quick stats on Today tab
  const cache = await cacheGet("cache_transcript", DAY_MS);
  if (cache?.rows) {
    const excludedCourses = await STORAGE.get("excluded_courses", []);
    const gpa = computeGPA(cache.rows, excludedCourses);
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
})();

// ===== SMART STUDY MODE FUNCTIONALITY =====
class SmartStudyManager {
  constructor() {
    this.isActive = false;
    this.currentSession = null;
    this.analytics = null;
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadSessionData();
    await this.loadAnalytics();
    this.setupEventListeners();
    this.updateUI();
    this.startSessionTimer();
  }

  async loadSettings() {
    this.settings = await STORAGE.get("smartStudySettings", {
      enabled: true, // Master switch
      autoDetect: true,
      blockDistractions: true,
      showNotifications: true,
      minSessionTime: 5,
      breakReminderInterval: 25,
    });
  }

  async loadSessionData() {
    const sessionData = await STORAGE.get("currentStudySession", null);
    const isActive = await STORAGE.get("smartStudyActive", false);

    this.currentSession = sessionData;
    this.isActive = isActive;
  }

  async loadAnalytics() {
    this.analytics = await STORAGE.get("studyAnalytics", {
      totalSessions: 0,
      totalTime: 0,
      totalFocusTime: 0,
      averageSessionLength: 0,
      distractionRate: 0,
    });
  }

  setupEventListeners() {
    // Master toggle for Smart Study Mode
    document
      .getElementById("smartStudyEnabled")
      ?.addEventListener("change", async (e) => {
        const isEnabled = e.target.checked;
        this.settings.enabled = isEnabled;

        try {
          if (isEnabled) {
            await chrome.runtime.sendMessage({ action: "enableSmartStudy" });
            Toast.success("Smart Study Mode enabled!");
          } else {
            await chrome.runtime.sendMessage({ action: "disableSmartStudy" });
            Toast.success("Smart Study Mode disabled!");
          }
          await this.saveSettings();
          this.updateUI();
        } catch (error) {
          console.error("Error toggling Smart Study Mode:", error);
          Toast.error("Failed to toggle Smart Study Mode");
          // Revert checkbox state
          e.target.checked = !isEnabled;
        }
      });

    // Settings checkboxes
    document
      .getElementById("autoDetectStudy")
      ?.addEventListener("change", (e) => {
        this.settings.autoDetect = e.target.checked;
        this.saveSettings();
      });

    document
      .getElementById("blockDistractions")
      ?.addEventListener("change", (e) => {
        this.settings.blockDistractions = e.target.checked;
        this.saveSettings();
      });

    document
      .getElementById("showNotifications")
      ?.addEventListener("change", (e) => {
        this.settings.showNotifications = e.target.checked;
        this.saveSettings();
      });

    // Action buttons
    document.getElementById("btnStartStudy")?.addEventListener("click", () => {
      this.startStudySession();
    });

    document.getElementById("btnEndStudy")?.addEventListener("click", () => {
      this.endStudySession();
    });

    document
      .getElementById("btnViewAnalytics")
      ?.addEventListener("click", () => {
        this.showDetailedAnalytics();
      });
  }

  async saveSettings() {
    await STORAGE.set({ smartStudySettings: this.settings });

    // Send settings to background
    chrome.runtime.sendMessage({
      action: "updateSmartStudySettings",
      settings: this.settings,
    });
  }

  async startStudySession() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "startSmartStudy",
      });

      if (response && response.success) {
        this.isActive = true;
        this.updateUI();
        this.showToast("Study session started!", "success");
      }
    } catch (error) {
      console.error("Error starting study session:", error);
      this.showToast("Failed to start study session", "error");
    }
  }

  async endStudySession() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "endSmartStudy",
      });

      console.log("End study response:", response);

      if (response && response.success) {
        this.isActive = false;
        this.currentSession = null;

        // Clear session data from storage
        await STORAGE.set({
          currentStudySession: null,
          smartStudyActive: false,
        });

        await this.loadAnalytics();
        this.updateUI();
        this.showToast("Study session ended!", "success");
      } else {
        console.error("Failed to end study session:", response);
        this.showToast("Failed to end study session", "error");
      }
    } catch (error) {
      console.error("Error ending study session:", error);
      this.showToast("Failed to end study session", "error");
    }
  }

  updateUI() {
    // Update master toggle
    const smartStudyEnabled = document.getElementById("smartStudyEnabled");
    if (smartStudyEnabled) {
      smartStudyEnabled.checked = this.settings.enabled;
    }

    // Update status indicator
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.querySelector(".status-text");
    const startBtn = document.getElementById("btnStartStudy");
    const endBtn = document.getElementById("btnEndStudy");

    // Disable/enable controls based on master toggle
    const controls = document.querySelectorAll(
      ".study-controls input, .study-controls button"
    );
    controls.forEach((control) => {
      if (control.id !== "smartStudyEnabled") {
        control.disabled = !this.settings.enabled;
        control.style.opacity = this.settings.enabled ? "1" : "0.5";
      }
    });

    if (this.isActive && this.settings.enabled) {
      statusDot?.classList.remove("inactive");
      statusDot?.classList.add("active");
      statusText.textContent = "Active";
      startBtn.style.display = "none";
      endBtn.style.display = "block";
    } else {
      statusDot?.classList.remove("active");
      statusDot?.classList.add("inactive");
      statusText.textContent = this.settings.enabled ? "Inactive" : "Disabled";
      startBtn.style.display = "block";
      endBtn.style.display = "none";
    }

    // Update settings checkboxes
    const autoDetect = document.getElementById("autoDetectStudy");
    const blockDistractions = document.getElementById("blockDistractions");
    const showNotifications = document.getElementById("showNotifications");

    if (autoDetect) autoDetect.checked = this.settings.autoDetect;
    if (blockDistractions)
      blockDistractions.checked = this.settings.blockDistractions;
    if (showNotifications)
      showNotifications.checked = this.settings.showNotifications;

    // Update analytics
    this.updateAnalyticsUI();
  }

  updateAnalyticsUI() {
    if (!this.analytics) return;

    const totalSessions = document.getElementById("totalSessions");
    const totalTime = document.getElementById("totalTime");
    const focusRate = document.getElementById("focusRate");
    const avgSession = document.getElementById("avgSession");

    if (totalSessions) totalSessions.textContent = this.analytics.totalSessions;
    if (totalTime)
      totalTime.textContent = this.formatTime(this.analytics.totalTime);
    if (focusRate) focusRate.textContent = this.calculateFocusRate() + "%";
    if (avgSession)
      avgSession.textContent = this.formatTime(
        this.analytics.averageSessionLength
      );
  }

  calculateFocusRate() {
    if (!this.analytics || this.analytics.totalTime === 0) return 0;
    return Math.round(
      (this.analytics.totalFocusTime / this.analytics.totalTime) * 100
    );
  }

  formatTime(milliseconds) {
    if (!milliseconds) return "0min";
    const minutes = Math.round(milliseconds / 60000);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
  }

  startSessionTimer() {
    setInterval(async () => {
      if (this.isActive) {
        await this.loadSessionData();
        this.updateSessionInfo();
      }
    }, 1000);
  }

  updateSessionInfo() {
    if (!this.currentSession) return;

    const now = Date.now();
    const sessionDuration = now - this.currentSession.startTime;
    const focusTime =
      sessionDuration - this.currentSession.distractions * 60000;

    const sessionTime = document.getElementById("sessionTime");
    const focusTimeEl = document.getElementById("focusTime");
    const distractionCount = document.getElementById("distractionCount");

    if (sessionTime) sessionTime.textContent = this.formatTime(sessionDuration);
    if (focusTimeEl) focusTimeEl.textContent = this.formatTime(focusTime);
    if (distractionCount)
      distractionCount.textContent = this.currentSession.distractions;
  }

  showDetailedAnalytics() {
    // Create modal with detailed analytics
    const modal = document.createElement("div");
    modal.className = "modal-overlay active";
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-icon">📊</div>
        <h3 class="modal-title">Study Analytics</h3>
        <div class="analytics-detail">
          <div class="analytics-row">
            <span>Total Study Sessions:</span>
            <span>${this.analytics.totalSessions}</span>
          </div>
          <div class="analytics-row">
            <span>Total Study Time:</span>
            <span>${this.formatTime(this.analytics.totalTime)}</span>
          </div>
          <div class="analytics-row">
            <span>Total Focus Time:</span>
            <span>${this.formatTime(this.analytics.totalFocusTime)}</span>
          </div>
          <div class="analytics-row">
            <span>Average Session Length:</span>
            <span>${this.formatTime(this.analytics.averageSessionLength)}</span>
          </div>
          <div class="analytics-row">
            <span>Focus Rate:</span>
            <span>${this.calculateFocusRate()}%</span>
          </div>
          <div class="analytics-row">
            <span>Distraction Rate:</span>
            <span>${
              Math.round(this.analytics.distractionRate * 100) / 100
            } per hour</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="primary" id="modal-close-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listener for close button
    const closeBtn = modal.querySelector("#modal-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.remove();
      });
    }
  }

  showToast(message, type = "info") {
    // Create toast notification
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${
        type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️"
      }</div>
      <div class="toast-content">
        <div class="toast-title">Smart Study Mode</div>
        <div class="toast-message">${message}</div>
      </div>
    `;

    const container =
      document.getElementById("toastContainer") || document.body;
    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.classList.add("removing");
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }
}

// Initialize Smart Study Manager
let smartStudyManager;
document.addEventListener("DOMContentLoaded", () => {
  smartStudyManager = new SmartStudyManager();
});
