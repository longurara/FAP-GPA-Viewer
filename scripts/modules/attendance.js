// Attendance parsing, rendering, and loading utilities
(function (global) {
  const log = (...args) => console.log("[Attendance]", ...args);

  // Use centralized isValidScheduleData from utils.js (exposed as window.isValidScheduleData)
  // const isValidScheduleData = window.isValidScheduleData; // available globally

  function parseScheduleOfWeek(doc) {
    const result = { entries: [], todayRows: [] };
    const N = (s) => (s || "").replace(/\s+/g, " ").trim();

    log("=== Bat dau parse ScheduleOfWeek ===");

    const tables = [...doc.querySelectorAll("table")];
    let mainTable = null;

    log(`Found ${tables.length} tables`);

    for (const table of tables) {
      const thead = table.querySelector("thead");
      const tbody = table.querySelector("tbody");

      if (!thead || !tbody) {
        log("Skip table: missing thead or tbody");
        continue;
      }

      const theadText = N(thead.textContent).toUpperCase();
      const hasWeekdays =
        /MON/.test(theadText) &&
        /TUE/.test(theadText) &&
        /WED/.test(theadText) &&
        /THU/.test(theadText) &&
        /FRI/.test(theadText);

      if (!hasWeekdays) {
        log("Skip table: missing weekdays");
        continue;
      }

      const bodyRows = [...tbody.querySelectorAll("tr")];
      if (bodyRows.length < 5) {
        log(`Skip table: only ${bodyRows.length} rows`);
        continue;
      }

      const firstCell = bodyRows[0]?.querySelector("td");
      if (!firstCell) {
        log("Skip table: first row missing cell");
        continue;
      }

      const firstCellText = N(firstCell.textContent);
      if (!/^Slot\s*\d+$/i.test(firstCellText)) {
        log(`Skip table: first cell not Slot (${firstCellText})`);
        continue;
      }

      const tableText = N(table.textContent);
      if (tableText.includes("ACTIVITIES FOR") || tableText.includes("CLUB ACTIVITIES")) {
        log("Skip table: activities table");
        continue;
      }

      log("✓ Found schedule table");
      mainTable = table;
      break;
    }

    if (!mainTable) {
      console.error("[Attendance] No valid schedule table found");
      return result;
    }

    const dateHeaders = [""];
    const dayHeaders = [""];

    const theadRows = [...mainTable.querySelectorAll("thead tr")];
    log(`Thead has ${theadRows.length} rows`);

    if (theadRows.length > 0) {
      const dayRow = theadRows[0];
      const dayCells = [...dayRow.querySelectorAll("th, td")];

      dayCells.forEach((cell) => {
        const text = N(cell.textContent).toUpperCase();
        const match = text.match(/(MON|TUE|WED|THU|FRI|SAT|SUN)/);
        if (match) dayHeaders.push(match[1]);
      });
    }

    if (theadRows.length > 1) {
      const dateRow = theadRows[1];
      const dateCells = [...dateRow.querySelectorAll("th, td")];

      dateCells.forEach((cell) => {
        const match = cell.textContent.match(/(\d{2}\/\d{2})/);
        if (match) dateHeaders.push(match[1]);
      });
    }

    log("Day headers:", dayHeaders);
    log("Date headers:", dateHeaders);

    const tbody = mainTable.querySelector("tbody");
    const slotRows = [...tbody.querySelectorAll("tr")];

    log(`Parsing ${slotRows.length} slot rows`);

    slotRows.forEach((row, rowIdx) => {
      const cells = [...row.querySelectorAll("td")];

      if (cells.length < 2) {
        log(`Row ${rowIdx}: skip (only ${cells.length} cells)`);
        return;
      }

      const slotName = N(cells[0].textContent);
      if (!/^Slot\s*\d+$/i.test(slotName)) {
        log(`Row ${rowIdx}: skip (not slot: ${slotName})`);
        return;
      }

      log(`Parsing ${slotName}...`);

      for (let colIdx = 1; colIdx < cells.length && colIdx <= 7; colIdx++) {
        const cell = cells[colIdx];
        const cellText = N(cell.textContent);
        const cellHTML = cell.innerHTML;

        if (!cellText || cellText === "-") continue;

        const codeMatch = cellText.match(/\b([A-Z]{2,4}\d{3})\b/);
        if (!codeMatch) {
          log(`  Col ${colIdx}: skip (no course code)`);
          continue;
        }

        const courseCode = codeMatch[1];
        const roomMatch = cellText.match(/at\s+(P\.\d+|[A-Z]+\d+|NVH\d+)/i);
        let room = roomMatch ? roomMatch[1] : "";

        if (!room) {
          if (/online/i.test(cellText) || /zoom|meet|teams|webex/i.test(cellText)) {
            room = "Online";
          } else if (cellText.includes("at") && !roomMatch) {
            room = "Online";
          }
        }

        const timeMatch = cellText.match(/\((\d{2}:\d{2}-\d{2}:\d{2})\)/);
        const time = timeMatch ? timeMatch[1] : "";

        let status = "not yet";
        const htmlLower = cellHTML.toLowerCase();
        if (htmlLower.includes("color=green") || htmlLower.includes("color: green") || /attended/i.test(cellText)) {
          status = "attended";
        } else if (htmlLower.includes("color=red") || htmlLower.includes("color: red") || /absent|vắng/i.test(cellText)) {
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
          key: `${dateHeaders[colIdx] || dayHeaders[colIdx]}|${slotName}|${courseCode}`,
        };

        result.entries.push(entry);
        log(`  ✓ ${entry.day} ${entry.date} - ${courseCode} - ${status}`);
      }
    });

    log(`=== Parse done: ${result.entries.length} entries ===`);

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

    log(`Today (${todayDate}): ${result.todayRows.length} slots`);

    return result;
  }

  async function renderAttendance(entries) {
    log("=== renderAttendance ===", entries);

    if (typeof updateQuickAttendanceStats === "function") {
      updateQuickAttendanceStats(entries);
    }

    try {
      if (!Array.isArray(entries)) {
        throw new Error("Entries khong phai array");
      }

      const validEntries = entries.filter((e) => {
        if (!e || typeof e !== "object") return false;
        if (!e.course || !/^[A-Z]{2,4}\d{3}$/.test(e.course)) return false;
        return true;
      });

      log(`Valid entries: ${validEntries.length}/${entries.length}`);

      if (validEntries.length === 0) {
        log("No valid entries found - likely empty schedule");
        // Try rendering empty state instead of throwing
        const tbody = document.querySelector("#tblAttendance tbody");
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 20px;">Không có dữ liệu điểm danh.</td></tr>`;
        }
        setValue?.("#attRate", "--");
        setValue?.("#attPresent", "--");
        setValue?.("#attAbsentLate", "--");
        return;
      }

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

      const filterSelect = document.getElementById("filterDay");
      if (filterSelect) {
        const existingOptions = new Set([...filterSelect.options].map((o) => o.value));
        const uniqueDates = [...new Set(sorted.map((e) => e.date).filter(Boolean))];
        uniqueDates.forEach((date) => {
          if (!existingOptions.has(date)) {
            const option = document.createElement("option");
            option.value = date;
            option.textContent = date;
            filterSelect.appendChild(option);
          }
        });
      }

      const filterValue = filterSelect?.value || "ALL";
      let filtered = sorted;
      if (filterValue !== "ALL") {
        if (/^\d{2}\/\d{2}$/.test(filterValue)) {
          filtered = sorted.filter((e) => e.date === filterValue);
        } else if (/^(MON|TUE|WED|THU|FRI|SAT|SUN)$/.test(filterValue)) {
          filtered = sorted.filter((e) => e.day === filterValue);
        }
      }

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

      setValue?.("#attRate", attendanceRate + "%");
      setValue?.("#attPresent", attended);
      setValue?.("#attAbsentLate", `${absent}/${late}`);

      const searchQuery = (document.querySelector("#searchAtt")?.value || "").toLowerCase();
      if (searchQuery) {
        filtered = filtered.filter(
          (e) =>
            e.course?.toLowerCase().includes(searchQuery) ||
            e.status?.toLowerCase().includes(searchQuery) ||
            e.room?.toLowerCase().includes(searchQuery)
        );
      }

      const tbody = document.querySelector("#tblAttendance tbody");
      if (!tbody) throw new Error("Khong tim thay tbody");

      tbody.innerHTML = "";

      if (filtered.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="4" style="text-align: center; color: var(--muted)">Khong co du lieu</td>';
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

        if (statusDisplay.toLowerCase().includes("attended")) {
          tr.style.color = "#10b981";
        } else if (statusDisplay.toLowerCase().includes("absent")) {
          tr.style.color = "#ef4444";
        }

        tbody.appendChild(tr);
      });

      log("Render attendance success");
    } catch (error) {
      console.error("[Attendance] Render error:", error);
      const tbody = document.querySelector("#tblAttendance tbody");
      if (tbody) {
        tbody.innerHTML = `
<tr>
  <td colspan="4" style="text-align: center; color: #ef4444; padding: 20px;">
    <strong>Lỗi hiển thị dữ liệu</strong><br>
    <small>${error.message}</small><br>
    <small style="color: var(--muted)">
      Vui lòng thử "Làm mới" hoặc tuần này không có dữ liệu điểm danh.
    </small>
  </td>
</tr>
        `;
      }

      setValue?.("#attRate", "--");
      setValue?.("#attPresent", "--");
      setValue?.("#attAbsentLate", "--");
    }
  }

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
      if (entry.room === "Online") tr.classList.add("online-class");

      tr.innerHTML = `
        <td>${typeof dayToVietnamese === "function" ? dayToVietnamese(entry.day) || "" : entry.day || ""}</td>
        <td>${entry.slot || ""}</td>
        <td>${entry.time || ""}</td>
        <td>${entry.course || ""}</td>
        <td class="${entry.room === "Online" ? "online-room" : ""}">${entry.room || ""}</td>
        <td>${entry.status || ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function refreshAttendance() {
    const doc = await fetchHTML(DEFAULT_URLS.scheduleOfWeek);
    if (doc === null) {
      const cachedEntries = await STORAGE.get("cache_attendance_flat", []);
      await STORAGE.set({ cache_attendance_fallback_ts: Date.now() });
      renderAttendance(cachedEntries);
      renderScheduleWeek(cachedEntries);
      updateQuickAttendanceStats?.(cachedEntries);
      return;
    }

    const parsed = parseScheduleOfWeek(doc);

    // Validate data before saving - don't overwrite cache with empty/invalid data
    if (!window.isValidScheduleData(parsed.entries)) {
      log("⚠️ Invalid schedule data, using cached data instead");
      const cachedEntries = await STORAGE.get("cache_attendance_flat", []);
      renderAttendance(cachedEntries);
      renderScheduleWeek(cachedEntries);
      updateQuickAttendanceStats?.(cachedEntries);
      return;
    }

    await cacheSet("cache_attendance", parsed);
    await STORAGE.set({
      cache_attendance_flat: parsed.entries,
      cache_attendance_fallback_ts: null,
    });
    await STORAGE.set({
      show_login_banner: false,
      last_successful_fetch: Date.now(),
    });
    renderAttendance(parsed.entries);
    renderScheduleWeek(parsed.entries);
    updateQuickAttendanceStats?.(parsed.entries);
  }

  async function loadAttendanceAndSchedule() {
    try {
      // Stale-While-Revalidate
      const CACHE_KEY = "cache_attendance";
      const cachedObj = await STORAGE.get(CACHE_KEY, null);
      const cachedData = cachedObj ? cachedObj.data : null;
      const cachedTs = cachedObj ? cachedObj.ts : 0;

      let hasRendered = false;

      // 1. Render immediate
      if (cachedData?.entries && cachedData.entries.length > 0) {
        log("[SWR] Rendering cached attendance");
        renderAttendance(cachedData.entries);
        renderScheduleWeek(cachedData.entries);
        updateQuickAttendanceStats?.(cachedData.entries);
        hasRendered = true;
      }

      // 2. Check stale
      // 4 hours TTL (approx 4-6 times/day as requested)
      const isStale = !cachedObj || Date.now() - cachedTs > 4 * 60 * 60 * 1000;

      if (isStale) {
        log("[SWR] Attendance stale/missing, refreshing...");
        const refreshPromise = refreshAttendance().catch((err) => {
          console.error("[SWR] Refresh failed:", err);
          if (!hasRendered) {
            setValue?.("#attRateQuick", "--");
          }
        });

        // If we haven't rendered anything, await the refresh so the user sees something (or empty state)
        // If we HAVE rendered, let it run in background
        if (!hasRendered) {
          await refreshPromise;
        }
      }
    } catch (error) {
      console.error("[Attendance] Error loading attendance:", error);
      setValue?.("#attRateQuick", "--");
    }
  }

  async function debugAttendanceData() {
    log("=== DEBUG ATTENDANCE DATA ===");
    try {
      const attCache = await cacheGet("cache_attendance", 10 * 60 * 1000);
      console.log("Cache data:", attCache);
      const storageData = await STORAGE.get("cache_attendance", null);
      console.log("Storage data:", storageData);
      const flatData = await STORAGE.get("cache_attendance_flat", []);
      console.log("Flat data:", flatData);
      if (!attCache?.entries || attCache.entries.length === 0) {
        console.log("No cache data, forcing refresh...");
        await refreshAttendance();
      }
    } catch (error) {
      console.error("[Attendance] Debug error:", error);
    }
  }

  global.Attendance = {
    parseScheduleOfWeek,
    renderAttendance,
    renderScheduleWeek,
    refreshAttendance,
    loadAttendanceAndSchedule,
    debugAttendanceData,
  };
})(window);

