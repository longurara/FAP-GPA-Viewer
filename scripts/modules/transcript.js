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

    /**
     * Compute GPA from course items
     * @param {Array} items - Course rows
     * @param {Array} excluded - Course codes to exclude
     * @returns {Object} - { gpa10, gpa4, credits }
     */
    computeGPA(items, excluded) {
        let sumC = 0, sumP = 0;
        for (const it of items) {
            const c = it.credit;
            const g = it.grade;
            const code = (it.code || "").toUpperCase();
            if (!Number.isFinite(c) || !Number.isFinite(g) || c <= 0 || g <= 0) continue;
            if (excluded.includes(code)) continue;
            sumC += c;
            sumP += c * g;
        }
        const g10 = sumC > 0 ? sumP / sumC : NaN;
        const g4 = Number.isFinite(g10) ? (g10 / 10) * 4 : NaN;
        return { gpa10: g10, gpa4: g4, credits: sumC };
    },

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

        const g = this.computeGPA(rows, excluded);
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
     * Load GPA data with stale-while-revalidate pattern
     */
    async loadGPA() {
        const CACHE_KEY = "cache_transcript";
        const cachedObj = await window.STORAGE?.get(CACHE_KEY, null);
        const cachedData = cachedObj ? cachedObj.data : null;
        const cachedTs = cachedObj ? cachedObj.ts : 0;
        const excludedCourses = await window.STORAGE?.get("excluded_courses", []) || [];

        // 1. Render immediately if we have ANY data (even stale)
        if (cachedData && Array.isArray(cachedData.rows)) {
            console.log("[SWR] Rendering cached GPA data");
            await this.renderTranscript(cachedData.rows, excludedCourses);
        }

        // 2. Check if we need to revalidate (is stale?)
        const DAY_MS = window.DAY_MS || 24 * 60 * 60 * 1000;
        const isStale = !cachedObj || Date.now() - cachedTs > DAY_MS;

        if (isStale) {
            console.log("[SWR] GPA data is stale or missing, fetching...");
            try {
                const doc = await window.fetchHTML(window.DEFAULT_URLS.transcript);

                if (doc) {
                    const rows = this.parseTranscriptDoc(doc);

                    // Update caches
                    await window.cacheSet(CACHE_KEY, { rows });
                    await window.STORAGE?.set({
                        cache_transcript_flat: rows,
                        cache_transcript_fallback_ts: null,
                        show_login_banner: false,
                        last_successful_fetch: Date.now(),
                    });

                    // Re-render with fresh data
                    console.log("[SWR] Fetched fresh GPA data, re-rendering");
                    await this.renderTranscript(rows, excludedCourses);
                } else {
                    // If fetch failed but no cached data, try flat fallback
                    if (!cachedData) {
                        const fallbackRows = await window.STORAGE?.get("cache_transcript_flat", []) || [];
                        await this.renderTranscript(fallbackRows, excludedCourses);
                    }
                }
            } catch (e) {
                console.error("[SWR] Error fetching GPA:", e);
            }
        }
    },
};

// Expose globally for backward compatibility
window.TranscriptService = TranscriptService;
window.parseTranscriptDoc = (doc) => TranscriptService.parseTranscriptDoc(doc);
window.computeGPA = (items, excluded) => TranscriptService.computeGPA(items, excluded);
window.renderTranscript = (rows, excluded) => TranscriptService.renderTranscript(rows, excluded);
window.loadGPA = () => TranscriptService.loadGPA();

// Constants
window.EXCLUDED_KEY = "__FAP_EXCLUDED_CODES__";
window.EXCLUDED_DEFAULT = TranscriptService.EXCLUDED_DEFAULT;
