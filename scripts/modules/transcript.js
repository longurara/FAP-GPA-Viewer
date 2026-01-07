// ===============================
// Transcript Module - GPA Calculation & Display
// ===============================

const TranscriptService = {
    // Default excluded courses for GPA calculation
    EXCLUDED_DEFAULT: ["TRS501", "ENT503", "VOV114", "VOV124", "VOV134", "OTP101"],

    /**
     * Parse transcript document from FAP
     * @param {Document} doc - Parsed HTML document
     * @returns {Array} - Array of course rows
     */
    parseTranscriptDoc(doc) {
        const NORM = window.NORM || ((s) => (s || "").replace(/\s+/g, " ").trim().toUpperCase());
        const toNum = window.toNum || ((txt) => {
            const m = (txt || "").match(/-?\d+(?:[.,]\d+)?/);
            return m ? parseFloat(m[0].replace(",", ".")) : NaN;
        });

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
                    return rows;
                }
            }
        }
        return [];
    },

    // computeGPA is now centralized in utils.js (window.computeGPA)

    /**
     * Render transcript table with course rows
     * @param {Array} rows - Course data
     * @param {Array} excluded - Excluded course codes
     */
    async renderTranscript(rows, excluded) {
        const setValue = window.setValue || ((s, v) => {
            const el = document.querySelector(s);
            if (el) el.textContent = v;
        });

        const g = window.computeGPA(rows, excluded);
        setValue("#gpa10", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");
        setValue("#gpa4", Number.isFinite(g.gpa4) ? g.gpa4.toFixed(2) : "--");
        setValue("#credits", g.credits || "--");

        // Sync to Today tab
        setValue("#gpa10Quick", Number.isFinite(g.gpa10) ? g.gpa10.toFixed(2) : "--");

        const tbody = document.querySelector("#tblCourses tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        const q = (document.querySelector("#searchCourse")?.value || "").toLowerCase();

        // Load notes and excluded from storage
        const allNotes = await window.STORAGE?.get("course_notes", {}) || {};
        const excludedCourses = await window.STORAGE?.get("excluded_courses", []) || [];

        // Update excluded count display
        const excludedCount = excludedCourses.length;
        setValue("#excludedCount", excludedCount);

        if (excludedCount > 0) {
            const excludedNames = excludedCourses.slice(0, 2).join(", ");
            const moreText = excludedCount > 2 ? ` và ${excludedCount - 2} môn khác` : "";
            setValue("#excludedDetail", `${excludedNames}${moreText}`);
        } else {
            setValue("#excludedDetail", "Không có môn nào");
        }

        rows.forEach((r) => {
            if (q && !(String(r.code).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q))) {
                return;
            }

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
          <button class="note-toggle-btn ${hasNote ? "has-note" : ""}" data-code="${courseCode}" title="Ghi chú">
            📝
          </button>
        </td>
      `;

            // Note row (hidden by default)
            const noteRow = document.createElement("tr");
            noteRow.className = "note-row";
            noteRow.style.display = "none";
            noteRow.innerHTML = `
        <td colspan="7" class="note-cell">
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
                const code = e.target.dataset.code;
                const checked = e.target.checked;

                const currentExcluded = await window.STORAGE?.get("excluded_courses", []) || [];

                if (checked) {
                    if (!currentExcluded.includes(code)) {
                        currentExcluded.push(code);
                    }
                } else {
                    const index = currentExcluded.indexOf(code);
                    if (index > -1) {
                        currentExcluded.splice(index, 1);
                    }
                }

                await window.STORAGE?.set({ excluded_courses: currentExcluded });
                tr.className = checked ? "course-row excluded" : "course-row";

                // Recalculate and update GPA
                await this.renderTranscript(rows, currentExcluded);

                // Show toast
                if (window.Toast) {
                    window.Toast.success(
                        checked ? `Đã loại trừ ${code} khỏi GPA` : `Đã thêm ${code} vào GPA`
                    );
                }
            });

            // Auto-save note on input
            const textarea = noteRow.querySelector("textarea");
            let saveTimeout;
            textarea.addEventListener("input", async () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(async () => {
                    const currentNotes = await window.STORAGE?.get("course_notes", {}) || {};
                    currentNotes[courseCode] = textarea.value;
                    await window.STORAGE?.set({ course_notes: currentNotes });

                    // Update button icon
                    const hasContent = textarea.value.trim();
                    toggleBtn.classList.toggle("has-note", hasContent);

                    if (window.Toast) {
                        window.Toast.success("Đã lưu ghi chú");
                    }
                }, 1000);
            });
        });
    },

    /**
     * Load GPA data - renders from cache and optionally triggers background fetch
     * @param {boolean} forceFetch - Force background fetch regardless of cache age
     */
    async loadGPA(forceFetch = false) {
        try {
            const CACHE_KEY = "cache_transcript";
            const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

            const cachedObj = await window.STORAGE?.get(CACHE_KEY, null);
            const cachedData = cachedObj ? cachedObj.data : null;
            const cacheTimestamp = cachedObj?.ts || 0;
            const excludedCourses = await window.STORAGE?.get("excluded_courses", []) || [];

            // 1. Render immediately from cache (instant display)
            if (cachedData && Array.isArray(cachedData.rows) && cachedData.rows.length > 0) {
                console.log("[TranscriptService] Rendering from cache:", cachedData.rows.length, "courses");
                await this.renderTranscript(cachedData.rows, excludedCourses);
            } else {
                // No cache - show loading indicators
                const setValue = window.setValue || ((s, v) => {
                    const el = document.querySelector(s);
                    if (el) el.textContent = v;
                });
                setValue("#gpa10", "⏳");
                setValue("#gpa4", "⏳");
                setValue("#credits", "⏳");
                setValue("#gpa10Quick", "⏳");
            }

            // 2. Check if we need to fetch fresh data
            const cacheAge = Date.now() - cacheTimestamp;
            const isCacheStale = cacheAge > CACHE_MAX_AGE;
            const hasNoData = !cachedData || !cachedData.rows || cachedData.rows.length === 0;

            if (forceFetch || isCacheStale || hasNoData) {
                // Request background.js to fetch fresh data (non-blocking)
                // Background will save to storage, and onChanged listener will update UI
                try {
                    chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', force: forceFetch });
                    console.log("[TranscriptService] Requested background fetch (stale:", isCacheStale, ", force:", forceFetch, ", age:", Math.round(cacheAge / 1000), "s)");
                } catch (e) {
                    console.error("[TranscriptService] Failed to request background fetch:", e);
                }
            } else {
                console.log("[TranscriptService] Cache is fresh, skipping fetch (age:", Math.round(cacheAge / 1000), "s)");
            }
        } catch (error) {
            console.error("[TranscriptService] Error loading GPA:", error);
        }
    },
};

// Expose globally for backward compatibility
window.TranscriptService = TranscriptService;
window.parseTranscriptDoc = (doc) => TranscriptService.parseTranscriptDoc(doc);
// window.computeGPA is now centralized in utils.js (no need to override)
window.renderTranscript = (rows, excluded) => TranscriptService.renderTranscript(rows, excluded);
window.loadGPA = () => TranscriptService.loadGPA();

// Constants
window.EXCLUDED_KEY = "__FAP_EXCLUDED_CODES__";
window.EXCLUDED_DEFAULT = TranscriptService.EXCLUDED_DEFAULT;
