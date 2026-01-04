// ===============================
// Exams Module - Exam Schedule Management
// ===============================

const ExamService = {
    /**
     * Parse exam schedule document from FAP
     * @param {Document} doc - Parsed HTML document
     * @returns {Array} - Array of exam objects
     */
    parseExamScheduleDoc(doc) {
        const exams = [];
        const tables = [...doc.querySelectorAll("table")];
        let examTable = null;

        // 1. Find table containing exam schedule
        for (const table of tables) {
            const tableText = (table.textContent || "").toLowerCase();
            if (tableText.includes("subjectcode") && tableText.includes("date of publication")) {
                examTable = table;
                break;
            }
        }

        if (!examTable) {
            console.log("Không tìm thấy bảng lịch thi.");
            return [];
        }

        // 2. Find header row and process data rows after it
        const allRows = [...examTable.querySelectorAll("tr")];
        let headerRowIndex = -1;

        for (let i = 0; i < allRows.length; i++) {
            const rowText = (allRows[i].textContent || "").toLowerCase();
            if (rowText.includes("subjectcode")) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.log("Không tìm thấy hàng tiêu đề trong bảng lịch thi.");
            return [];
        }

        const dataRows = allRows.slice(headerRowIndex + 1);

        // 3. Extract data from filtered rows
        for (const row of dataRows) {
            const cells = [...row.querySelectorAll("td")];
            if (cells.length < 9) continue;

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

            if (examData.code) {
                exams.push(examData);
            }
        }
        return exams;
    },

    /**
     * Parse date string to Date object (DD/MM/YYYY or DD-MM-YYYY)
     * @param {string} dateStr - Date string
     * @returns {Date|null}
     */
    parseExamDate(dateStr) {
        const parts = dateStr.split(/[\/\-]/);
        if (parts.length !== 3) return null;

        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);

        return new Date(year, month, day);
    },

    /**
     * Render exam schedule table
     * @param {Array} exams - Exam data
     */
    renderExamSchedule(exams) {
        const tbody = document.querySelector("#tblExams tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (!exams || exams.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = '<td colspan="6" style="text-align: center; color: var(--muted)">Không có lịch thi.</td>';
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
    },

    /**
     * Add countdown badges to exam dates
     */
    addExamCountdown() {
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
            const examDate = this.parseExamDate(dateStr);

            if (!examDate) return;

            const diff = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

            if (diff < 0) return; // Past exam

            let badge = "";
            if (diff === 0) {
                badge = '<span class="exam-days" style="background: #ef4444; color: white;">HÔM NAY!</span>';
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
    },

    /**
     * Filter exams by time and search query
     */
    filterExams() {
        const filterValue = document.getElementById("filterExamTime")?.value || "ALL";
        const searchValue = (document.getElementById("searchExam")?.value || "").toLowerCase();

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
            const dateStr = cells[2].textContent.trim().split(" ")[0];

            // Search filter
            let matchSearch = true;
            if (searchValue) {
                matchSearch = code.includes(searchValue) || name.includes(searchValue);
            }

            // Time filter
            let matchTime = true;
            if (filterValue !== "ALL") {
                const examDate = this.parseExamDate(dateStr);
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
    },

    /**
     * Load exams with stale-while-revalidate pattern
     */
    async loadExams() {
        const CACHE_KEY = "cache_exams";
        const cachedObj = await window.STORAGE?.get(CACHE_KEY, null);
        const cachedData = cachedObj ? cachedObj.data : null;
        const cachedTs = cachedObj ? cachedObj.ts : 0;

        // 1. Render immediately if we have ANY data (even stale)
        if (cachedData && Array.isArray(cachedData.exams)) {
            console.log("[SWR] Rendering cached Exams data");
            this.renderExamSchedule(cachedData.exams);
        }

        // 2. Check if we need to revalidate (is stale?)
        const DAY_MS = window.DAY_MS || 24 * 60 * 60 * 1000;
        const isStale = !cachedObj || Date.now() - cachedTs > DAY_MS;

        if (isStale) {
            console.log("[SWR] Exams data is stale or missing, fetching...");
            try {
                const doc = await window.fetchHTML(window.DEFAULT_URLS.examSchedule);

                if (doc) {
                    const exams = this.parseExamScheduleDoc(doc);

                    // Update caches
                    await window.cacheSet(CACHE_KEY, { exams });
                    await window.STORAGE?.set({
                        cache_exams_flat: exams,
                        cache_exams_fallback_ts: null,
                        show_login_banner: false,
                        last_successful_fetch: Date.now(),
                    });

                    // Re-render with fresh data
                    console.log("[SWR] Fetched fresh Exams data, re-rendering");
                    this.renderExamSchedule(exams);
                } else {
                    // Fetch failed/login required. Use fallback if no cached data
                    if (!cachedData) {
                        const fallbackExams = await window.STORAGE?.get("cache_exams_flat", []) || [];
                        this.renderExamSchedule(fallbackExams);
                    }
                }
            } catch (e) {
                console.error("[SWR] Error fetching Exams:", e);
            }
        }

        // Add countdown after rendering
        setTimeout(() => this.addExamCountdown(), 100);
    },

    /**
     * Initialize exam event listeners
     */
    init() {
        document.getElementById("filterExamTime")?.addEventListener("change", () => this.filterExams());

        const debounce = window.debounce || ((fn, wait) => {
            let t;
            return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
        });
        document.getElementById("searchExam")?.addEventListener("input", debounce(() => this.filterExams(), 300));
    },
};

// Expose globally for backward compatibility
window.ExamService = ExamService;
window.parseExamScheduleDoc = (doc) => ExamService.parseExamScheduleDoc(doc);
window.parseExamDate = (dateStr) => ExamService.parseExamDate(dateStr);
window.renderExamSchedule = (exams) => ExamService.renderExamSchedule(exams);
window.addExamCountdown = () => ExamService.addExamCountdown();
window.filterExams = () => ExamService.filterExams();
window.loadExams = () => ExamService.loadExams();
