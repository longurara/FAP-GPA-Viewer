// ===============================
// Exams Module - Exam Schedule Management
// ===============================

// escapeHtml is accessed via safe local reference with fallback — resolves to window.escapeHtml set by utils.js.
// If utils.js hasn't loaded yet, a ReferenceError would crash the entire module.
const _examEsc = () => window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

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
     * Render exam schedule as cards
     * @param {Array} exams - Exam data
     */
    renderExamSchedule(exams) {
        const container = document.querySelector("#examCardsContainer");
        const tbody = document.querySelector("#tblExams tbody");

        // Use card container if available, fallback to table
        const target = container || tbody;
        if (!target) return;

        target.innerHTML = "";

        if (!exams || exams.length === 0) {
            target.innerHTML = '<div class="exam-empty"><span class="exam-empty-icon">📋</span><span>Không có lịch thi.</span></div>';
            return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        exams.forEach((exam) => {
            const examDate = this.parseExamDate(exam.date);
            const diff = examDate ? Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)) : null;

            // Determine urgency
            let urgencyClass = "";
            let badgeHtml = "";
            if (diff !== null && diff >= 0) {
                if (diff === 0) {
                    urgencyClass = "exam-card--today";
                    badgeHtml = '<span class="exam-badge exam-badge--today">HÔM NAY!</span>';
                } else if (diff <= 3) {
                    urgencyClass = "exam-card--urgent";
                    badgeHtml = `<span class="exam-badge exam-badge--urgent">${diff} ngày nữa</span>`;
                } else if (diff <= 7) {
                    urgencyClass = "exam-card--soon";
                    badgeHtml = `<span class="exam-badge exam-badge--soon">${diff} ngày nữa</span>`;
                } else {
                    badgeHtml = `<span class="exam-badge exam-badge--normal">${diff} ngày nữa</span>`;
                }
            } else if (diff !== null && diff < 0) {
                urgencyClass = "exam-card--past";
                badgeHtml = '<span class="exam-badge exam-badge--past">Đã qua</span>';
            }

            const card = document.createElement("div");
            card.className = `exam-card ${urgencyClass}`;

            // Store data for filtering
            card.dataset.code = (exam.code || "").toLowerCase();
            card.dataset.name = (exam.name || "").toLowerCase();
            card.dataset.date = exam.date || "";
            card.dataset.diff = diff !== null ? diff : "";

            const esc = _examEsc();
            card.innerHTML = `
                <div class="exam-card-header">
                    <div class="exam-card-subject">
                        <span class="exam-code-badge">${esc(exam.code)}</span>
                        <span class="exam-name">${esc(exam.name)}</span>
                    </div>
                    ${badgeHtml}
                </div>
                <div class="exam-card-meta">
                    <div class="exam-meta-item">
                        <span class="exam-meta-icon">📅</span>
                        <span>${esc(exam.date)}</span>
                    </div>
                    <div class="exam-meta-item">
                        <span class="exam-meta-icon">⏰</span>
                        <span>${esc(exam.time)}</span>
                    </div>
                    <div class="exam-meta-item">
                        <span class="exam-meta-icon">🏫</span>
                        <span>Phòng ${esc(exam.room)}</span>
                    </div>
                    <div class="exam-meta-item">
                        <span class="exam-meta-icon">📝</span>
                        <span>${esc(exam.form)}</span>
                    </div>
                </div>
            `;

            target.appendChild(card);
        });
    },

    /**
     * Filter exams by time and search query
     */
    filterExams() {
        const filterValue = document.getElementById("filterExamTime")?.value || "ALL";
        const searchValue = (document.getElementById("searchExam")?.value || "").toLowerCase();

        const container = document.querySelector("#examCardsContainer") || document.querySelector("#tblExams tbody");
        if (!container) return;

        const cards = container.querySelectorAll(".exam-card");

        cards.forEach((card) => {
            const code = card.dataset.code || "";
            const name = card.dataset.name || "";
            const diff = card.dataset.diff !== "" ? parseInt(card.dataset.diff) : null;

            // Search filter
            let matchSearch = true;
            if (searchValue) {
                matchSearch = code.includes(searchValue) || name.includes(searchValue);
            }

            // Time filter
            // BUG-03 FIX: If diff===null (date unparseable) and a time filter is active,
            // hide the card — we cannot determine its time position.
            let matchTime = true;
            if (filterValue !== "ALL") {
                if (diff === null) {
                    matchTime = false; // can't determine timing → hide when filtering
                } else {
                    switch (filterValue) {
                        case "THIS_WEEK":
                            matchTime = diff >= 0 && diff <= 7;
                            break;
                        case "THIS_MONTH":
                            matchTime = diff >= 0 && diff <= 30;
                            break;
                        case "UPCOMING":
                            matchTime = diff >= 0;
                            break;
                    }
                }
            }

            card.style.display = matchSearch && matchTime ? "" : "none";
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
        // addExamCountdown removed — countdown is computed inline in renderExamSchedule
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
window.loadExams = () => ExamService.loadExams();
