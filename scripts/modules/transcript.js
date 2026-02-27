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

    // renderTranscript is now handled by popup.js (optimized version with DocumentFragment
    // and event delegation). The TranscriptService only needs parseTranscriptDoc and loadGPA.

    /**
     * Load GPA data - renders from cache and optionally triggers background fetch
     * @param {boolean} forceFetch - Force background fetch regardless of cache age
     */
    async loadGPA(forceFetch = false) {
        try {
            const CACHE_KEY = "cache_transcript";
            const CACHE_MAX_AGE = window.TIME_CONSTANTS?.CACHE_TTL_TRANSCRIPT || 30 * 60 * 1000; // Standardized 30 min

            // Batch read cache + excluded courses in single IPC call
            const { cache_transcript: cachedObj, excluded_courses: excludedCourses } =
                await window.STORAGE?.getMultiple({ cache_transcript: null, excluded_courses: [] }) || {};
            const cachedData = cachedObj ? cachedObj.data : null;
            const cacheTimestamp = cachedObj?.ts || 0;

            // 1. Render immediately from cache (instant display)
            if (cachedData && Array.isArray(cachedData.rows) && cachedData.rows.length > 0) {
                console.log("[TranscriptService] Rendering from cache:", cachedData.rows.length, "courses");
                // Use the global renderTranscript (defined in popup.js), NOT this.renderTranscript
                if (typeof window.renderTranscript === "function") {
                    await window.renderTranscript(cachedData.rows, excludedCourses);
                } else {
                    console.warn("[TranscriptService] window.renderTranscript not available yet");
                }
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
// window.renderTranscript is now defined in popup.js (optimized version with DocumentFragment)
// window.loadGPA is defined in popup.js (SWR + background fetch version) — do not override here

// Constants
window.EXCLUDED_KEY = "__FAP_EXCLUDED_CODES__";
window.EXCLUDED_DEFAULT = TranscriptService.EXCLUDED_DEFAULT;
