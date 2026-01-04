(function () {
  async function renderTranscript(rows, excluded) {
    const g = computeGPA(rows, excluded);
    setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
    setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
    setValue("#credits", g.credits || "--");

    const tbody = document.querySelector("#tblCourses tbody");
    tbody.innerHTML = "";
    const q = (document.querySelector("#searchCourse").value || "").toLowerCase();

    const allNotes = await STORAGE.get("course_notes", {});
    const excludedCourses = await STORAGE.get("excluded_courses", []);

    const excludedCount = excludedCourses.length;
    setValue("#excludedCount", excludedCount);

    if (excludedCount > 0) {
      const excludedNames = excludedCourses.slice(0, 2).join(", ");
      const moreText = excludedCount > 2 ? ` v… ${excludedCount - 2} m“n kh c` : "";
      setValue("#excludedDetail", `${excludedNames}${moreText}`);
    } else {
      setValue("#excludedDetail", "Kh“ng c¢ m“n n…o");
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
                title="Lo?i tr? kh?i GPA">
        </td>
        <td class="course-code">${r.code || ""}</td>
        <td class="course-name">${r.name || ""}</td>
        <td class="r">${Number.isFinite(r.credit) ? r.credit : ""}</td>
        <td class="r">${Number.isFinite(r.grade) ? r.grade : ""}</td>
        <td>${r.status || ""}</td>
        <td style="text-align: center">
          <button class="note-toggle-btn ${hasNote ? "has-note" : ""}" data-code="${courseCode}" title="Ghi ch£">
            ${hasNote ? "??" : "??"}
          </button>
        </td>
    `;

      const noteRow = document.createElement("tr");
      noteRow.className = "note-row";
      noteRow.style.display = "none";
      noteRow.innerHTML = `
      <td colspan="6" class="note-cell">
        <textarea 
          class="course-note-input" 
          data-code="${courseCode}"
          placeholder="Ghi ch£ cho m“n ${courseCode}... (T? d?ng luu)"
          rows="3"
        >${allNotes[courseCode] || ""}</textarea>
      </td>
    `;

      tbody.appendChild(tr);
      tbody.appendChild(noteRow);

      const toggleBtn = tr.querySelector(".note-toggle-btn");
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = noteRow.style.display !== "none";
        noteRow.style.display = isVisible ? "none" : "table-row";
        if (!isVisible) {
          noteRow.querySelector("textarea").focus();
        }
      });

      const excludeCheckbox = tr.querySelector(".exclude-checkbox");
      excludeCheckbox.addEventListener("change", async (e) => {
        const courseCode = e.target.dataset.code;
        const isExcluded = e.target.checked;

        const excludedCourses = await STORAGE.get("excluded_courses", []);

        if (isExcluded) {
          if (!excludedCourses.includes(courseCode)) {
            excludedCourses.push(courseCode);
          }
        } else {
          const index = excludedCourses.indexOf(courseCode);
          if (index > -1) {
            excludedCourses.splice(index, 1);
          }
        }

        await STORAGE.set({ excluded_courses: excludedCourses });

        tr.className = isExcluded ? "course-row excluded" : "course-row";

        await renderTranscript(rows, excludedCourses);

        Toast.success(
          isExcluded
            ? `Da lo?i tr? ${courseCode} kh?i GPA`
            : `Da thˆm ${courseCode} v…o GPA`
        );
      });

      const textarea = noteRow.querySelector("textarea");
      let saveTimeout;
      textarea.addEventListener("input", async () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          const currentNotes = await STORAGE.get("course_notes", {});
          currentNotes[courseCode] = textarea.value;
          await STORAGE.set({ course_notes: currentNotes });

          const hasContent = textarea.value.trim();
          toggleBtn.textContent = hasContent ? "??" : "??";
          toggleBtn.classList.toggle("has-note", hasContent);

          Toast.success("?? luu note", "");
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
      if (/ATTENDED|CO M?T/.test(s)) present++;
      else if (/LATE|MU?N/.test(s)) late++;
      else if (/ABSENT|V?NG/.test(s)) absent++;
      else if (/NOT YET/.test(s)) neutral++;
    }
    const denom = present + absent;
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

  window.Renderers = {
    renderTranscript,
    summarizeAttendance,
    updateQuickAttendanceStats,
    updateAttendanceQuickStats,
  };
})();
