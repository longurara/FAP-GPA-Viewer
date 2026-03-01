// ===============================
// Today Schedule Module - Today Widget
// ===============================

// WARN-03 FIX: Add DEBUG flag (matches pattern in attendance.js) to suppress logs in production
const _TODAY_DEBUG = false;
const _todayLog = (...args) => { if (_TODAY_DEBUG) console.log('[TodaySchedule]', ...args); };

const TodayScheduleService = {
    /**
     * Find today's classes from schedule entries
     * @param {Array} entries - Schedule entries
     * @returns {Array} - Classes for today
     */
    findTodayClasses(entries) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");

        // BUG-09 FIX: Removed redundant non-zero-padded variants (2/3, 02/3, 2/03).
        // attendance.js always stores dates as zero-padded "DD/MM", so only this format matches.
        const formats = [
            `${dd}/${mm}`,
        ];

        _todayLog("Searching for today's classes with formats:", formats);

        for (const format of formats) {
            const matches = entries.filter((e) => e.date === format);
            if (matches.length > 0) {
                _todayLog(`Found ${matches.length} classes with format: ${format}`);
                return matches;
            }
        }

        _todayLog("No classes found for any date format");
        return [];
    },

    /**
     * Get time until class starts
     * @param {string} timeStr - Time string like "07:30 - 09:00"
     * @returns {{text: string, status: string}} - Countdown text and status
     */
    getTimeUntilClass(timeStr) {
        if (!timeStr || !timeStr.includes("-")) return { text: "?", status: "" };

        const parts = timeStr.split("-");
        const startTime = parts[0].trim();
        const endTime = parts[1].trim();
        const [startH, startM] = startTime.split(":").map(Number);
        const [endH, endM] = endTime.split(":").map(Number);

        const now = new Date();
        const classStart = new Date();
        classStart.setHours(startH, startM, 0, 0);
        const classEnd = new Date();
        classEnd.setHours(endH, endM, 0, 0);

        const diffStart = classStart - now;

        if (now >= classStart && now <= classEnd) {
            return { text: "Dang hoc", status: "now" };
        } else if (diffStart < 0) {
            return { text: "Da qua", status: "past" };
        } else if (diffStart < 60 * 60 * 1000) {
            const minutes = Math.floor(diffStart / 60000);
            return { text: `${minutes} phut nua`, status: "soon" };
        } else {
            const hours = Math.floor(diffStart / 3600000);
            return { text: `${hours}h nua`, status: "" };
        }
    },

    /**
     * Render today widget
     * @param {Array} entries - Schedule entries
     * @param {Element} container - Container element
     */
    renderTodayWidget(entries, container) {
        const todayClasses = this.findTodayClasses(entries);

        if (todayClasses.length === 0) {
            container.innerHTML = '<div class="no-class">Hôm nay không có lịch học!</div>';
            return;
        }

        const sortedClasses = [...todayClasses].sort((a, b) => {
            const slotA = parseInt((a.slot || "").replace(/\D/g, "") || "999");
            const slotB = parseInt((b.slot || "").replace(/\D/g, "") || "999");
            return slotA - slotB;
        });

        container.innerHTML = "";
        const esc = window.escapeHtml || ((s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
        sortedClasses.forEach((cls) => {
            const item = document.createElement("div");
            item.className = "class-item";
            const countdown = this.getTimeUntilClass(cls.time);
            const statusAttr = countdown.status ? ` data-status="${esc(countdown.status)}"` : "";
            item.innerHTML = `
        <div class="class-info">
          <div class="class-time">${esc(cls.time || cls.slot)}</div>
          <div class="class-course">${esc(cls.course)} - ${esc(cls.room || "N/A")}</div>
        </div>
        <div class="class-countdown"${statusAttr}>${esc(countdown.text)}</div>
      `;
            container.appendChild(item);
        });
    },

    /**
     * Load today's schedule with stale-while-revalidate
     */
    async loadTodaySchedule() {
        try {
            _todayLog("Loading today's schedule...");
            const container = document.getElementById("todayClasses");
            if (!container) return;

            const CACHE_KEY = "cache_attendance";
            const cachedObj = await window.STORAGE?.get(CACHE_KEY, null);
            const cachedData = cachedObj ? cachedObj.data : null;
            const cachedTs = cachedObj ? cachedObj.ts : 0;

            let hasRendered = false;

            // 1. Render immediately if data exists
            if (cachedData?.entries && cachedData.entries.length > 0) {
                _todayLog(`[SWR] Rendering cached today's schedule: ${cachedData.entries.length} entries`);
                this.renderTodayWidget(cachedData.entries, container);
                hasRendered = true;
            } else {
                // Fallback to flat cache
                const flatEntries = await window.STORAGE?.get("cache_attendance_flat", []) || [];
                if (flatEntries.length > 0) {
                    _todayLog(`[SWR] Rendering flat cached today's schedule`);
                    this.renderTodayWidget(flatEntries, container);
                    hasRendered = true;
                }
            }

            // 2. Refresh if stale (4 hours TTL)
            const isStale = !cachedObj || Date.now() - cachedTs > (window.TIME_CONSTANTS?.CACHE_TTL_TODAY || 4 * 60 * 60 * 1000);

            if (isStale && window.refreshAttendance) {
                _todayLog("[SWR] Today's schedule stale/missing, checking refresh...");

                const refreshPromise = window.refreshAttendance().then(async () => {
                    const newCache = await window.STORAGE?.get(CACHE_KEY, null);
                    const newEntries = newCache?.data?.entries || [];
                    this.renderTodayWidget(newEntries, container);
                }).catch(err => {
                    console.error("[TodaySchedule] Refresh failed:", err);
                    if (!hasRendered) {
                        container.innerHTML = '<div class="no-class">❌ Lỗi tải dữ liệu.</div>';
                    }
                });

                if (!hasRendered) {
                    container.innerHTML = '<div class="no-class">Đang tải dữ liệu mới...</div>';
                    await refreshPromise;
                }
            }
        } catch (error) {
            console.error("[TodaySchedule] Error loading today's schedule:", error);
        }
    },

    // startCountdownInterval removed — popup.js already creates its own setInterval for this.
};

// Expose globally for backward compatibility
window.TodayScheduleService = TodayScheduleService;
window.findTodayClasses = (entries) => TodayScheduleService.findTodayClasses(entries);
window.getTimeUntilClass = (timeStr) => TodayScheduleService.getTimeUntilClass(timeStr);
window.renderTodayWidget = (entries, container) => TodayScheduleService.renderTodayWidget(entries, container);
window.loadTodaySchedule = () => TodayScheduleService.loadTodaySchedule();
