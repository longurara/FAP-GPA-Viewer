// ===============================
// Today Schedule Module - Today Widget
// ===============================

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

        // Try different date formats
        const formats = [
            `${dd}/${mm}`,
            `${today.getDate()}/${mm}`,
            `${dd}/${today.getMonth() + 1}`,
            `${today.getDate()}/${today.getMonth() + 1}`,
        ];

        console.log("🔍 Searching for today's classes with formats:", formats);

        for (const format of formats) {
            const matches = entries.filter((e) => e.date === format);
            if (matches.length > 0) {
                console.log(`✓ Found ${matches.length} classes with format: ${format}`);
                return matches;
            }
        }

        console.log("✗ No classes found for any date format");
        return [];
    },

    /**
     * Get time until class starts
     * @param {string} timeStr - Time string like "07:30 - 09:00"
     * @returns {string} - Human readable countdown
     */
    getTimeUntilClass(timeStr) {
        if (!timeStr || !timeStr.includes("-")) return "?";

        const startTime = timeStr.split("-")[0].trim();
        const [hour, minute] = startTime.split(":").map(Number);

        const now = new Date();
        const classTime = new Date();
        classTime.setHours(hour, minute, 0, 0);

        const diff = classTime - now;

        if (diff < 0) {
            return "⏰ đã qua";
        } else if (diff < 60 * 60 * 1000) {
            const minutes = Math.floor(diff / 60000);
            return `⏰ ${minutes} phút nữa`;
        } else {
            const hours = Math.floor(diff / 3600000);
            return `⏰ ${hours}h nữa`;
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

        const sortedClasses = todayClasses.sort((a, b) => {
            const slotA = parseInt((a.slot || "").replace(/\D/g, "") || "999");
            const slotB = parseInt((b.slot || "").replace(/\D/g, "") || "999");
            return slotA - slotB;
        });

        container.innerHTML = "";
        sortedClasses.forEach((cls) => {
            const item = document.createElement("div");
            item.className = "class-item";
            const countdown = this.getTimeUntilClass(cls.time);
            item.innerHTML = `
        <div class="class-info">
          <div class="class-time">${cls.time || cls.slot}</div>
          <div class="class-course">${cls.course} - ${cls.room || "N/A"}</div>
        </div>
        <div class="class-countdown">${countdown}</div>
      `;
            container.appendChild(item);
        });
    },

    /**
     * Load today's schedule with stale-while-revalidate
     */
    async loadTodaySchedule() {
        try {
            console.log("🔄 Loading today's schedule...");
            const container = document.getElementById("todayClasses");
            if (!container) return;

            const CACHE_KEY = "cache_attendance";
            const cachedObj = await window.STORAGE?.get(CACHE_KEY, null);
            const cachedData = cachedObj ? cachedObj.data : null;
            const cachedTs = cachedObj ? cachedObj.ts : 0;

            let hasRendered = false;

            // 1. Render immediately if data exists
            if (cachedData?.entries && cachedData.entries.length > 0) {
                console.log(`[SWR] Rendering cached today's schedule: ${cachedData.entries.length} entries`);
                this.renderTodayWidget(cachedData.entries, container);
                hasRendered = true;
            } else {
                // Fallback to flat cache
                const flatEntries = await window.STORAGE?.get("cache_attendance_flat", []) || [];
                if (flatEntries.length > 0) {
                    console.log(`[SWR] Rendering flat cached today's schedule`);
                    this.renderTodayWidget(flatEntries, container);
                    hasRendered = true;
                }
            }

            // 2. Refresh if stale (4 hours TTL)
            const isStale = !cachedObj || Date.now() - cachedTs > 4 * 60 * 60 * 1000;

            if (isStale && window.refreshAttendance) {
                console.log("[SWR] Today's schedule stale/missing, checking refresh...");

                const refreshPromise = window.refreshAttendance().then(async () => {
                    const newCache = await window.STORAGE?.get(CACHE_KEY, null);
                    const newEntries = newCache?.data?.entries || [];
                    this.renderTodayWidget(newEntries, container);
                }).catch(err => {
                    console.error("❌ Refresh failed:", err);
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
            console.error("❌ Error loading today's schedule:", error);
        }
    },

    /**
     * Start countdown update interval
     */
    startCountdownInterval() {
        setInterval(() => {
            const activeTab = document.querySelector(".tab.active");
            if (activeTab && activeTab.id === "tab-today") {
                this.loadTodaySchedule();
            }
        }, 60000); // Update every minute
    },
};

// Expose globally for backward compatibility
window.TodayScheduleService = TodayScheduleService;
window.findTodayClasses = (entries) => TodayScheduleService.findTodayClasses(entries);
window.getTimeUntilClass = (timeStr) => TodayScheduleService.getTimeUntilClass(timeStr);
window.renderTodayWidget = (entries, container) => TodayScheduleService.renderTodayWidget(entries, container);
window.loadTodaySchedule = () => TodayScheduleService.loadTodaySchedule();
