// ===============================
// Statistics Module - GPA Stats & Chart
// ===============================

const StatisticsService = {
    gpaChartInstance: null,

    /**
     * Load and display statistics
     */
    async loadStatistics() {
        try {
            const DAY_MS = window.DAY_MS || 24 * 60 * 60 * 1000;
            const cache = await window.cacheGet("cache_transcript", DAY_MS);
            if (!cache || !cache.rows) return;

            // Get excluded courses first
            const excludedCourses = await window.STORAGE?.get("excluded_courses", []) || [];

            // Filter: only courses with valid grades AND not excluded
            const rows = cache.rows.filter((r) => {
                const code = (r.code || "").toUpperCase();
                return Number.isFinite(r.grade) && r.grade > 0 && !excludedCourses.includes(code);
            });
            if (rows.length === 0) return;

            // Calculate statistics (already excludes courses above)
            const grades = rows.map((r) => r.grade);
            const avgGrade = grades.reduce((a, b) => a + b, 0) / grades.length;

            const best = rows.reduce((max, r) => (r.grade > max.grade ? r : max), rows[0]);
            const worst = rows.reduce((min, r) => (r.grade < min.grade ? r : min), rows[0]);

            const passed = rows.filter(
                (r) => r.status?.toLowerCase() !== "failed" && r.grade >= 5
            ).length;
            const passRate = ((passed / rows.length) * 100).toFixed(1);

            const setValue = window.setValue || ((s, v) => {
                const el = document.querySelector(s);
                if (el) el.textContent = v;
            });

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

            // excludedCourses already declared above
            const semesters = Array.from(semesterMap.keys()).sort();

            // Use centralized computeGPA from utils.js
            const gpaData = semesters.map((sem) => {
                const semRows = semesterMap.get(sem);
                const gpa = window.computeGPA(semRows, excludedCourses);
                return Number.isFinite(gpa.gpa10) ? gpa.gpa10 : 0;
            });

            this.renderGPAChart(semesters, gpaData);
        } catch (error) {
            console.error("[Statistics] Error loading statistics:", error);
        }
    },

    /**
     * Render GPA trend chart
     * @param {Array} labels - Semester labels
     * @param {Array} data - GPA values
     */
    renderGPAChart(labels, data) {
        const canvas = document.getElementById("gpaChart");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (this.gpaChartInstance) {
            this.gpaChartInstance.destroy();
        }

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const textColor = isDark ? "#9ca3af" : "#6b7280";
        const gridColor = isDark ? "rgba(55, 65, 81, 0.3)" : "rgba(229, 231, 235, 0.5)";

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

        this.gpaChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "GPA theo kỳ",
                    data: data,
                    borderColor: isDark ? "rgba(96, 165, 250, 0.9)" : "rgba(96, 165, 250, 1)",
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
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: "index" },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        align: "start",
                        labels: {
                            color: textColor,
                            font: { size: 13, weight: "600", family: "'Inter', 'SF Pro', -apple-system, sans-serif" },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: "circle",
                        },
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)",
                        titleColor: isDark ? "#e5e7eb" : "#0f172a",
                        bodyColor: isDark ? "#60a5fa" : "#3b82f6",
                        borderColor: isDark ? "rgba(96, 165, 250, 0.3)" : "rgba(96, 165, 250, 0.2)",
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        boxPadding: 6,
                        usePointStyle: true,
                        callbacks: { label: (context) => ` GPA: ${context.parsed.y.toFixed(2)}` },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 10,
                        ticks: { color: textColor, font: { size: 11, weight: "500" }, padding: 8, stepSize: 2 },
                        grid: { color: gridColor, lineWidth: 1, drawBorder: false, drawTicks: false },
                        border: { display: false },
                    },
                    x: {
                        ticks: { color: textColor, font: { size: 11, weight: "500" }, padding: 8, maxRotation: 0, minRotation: 0 },
                        grid: { color: gridColor, lineWidth: 1, drawBorder: false, drawTicks: false },
                        border: { display: false },
                    },
                },
            },
        });
    },

    /**
     * Initialize statistics module
     */
    init() {
        document.getElementById("btnRefreshStats")?.addEventListener("click", async function () {
            const isLoggedIn = await window.checkLoginStatus?.();
            if (!isLoggedIn) {
                await window.checkAndShowLoginBanner?.();
                window.showLoginNotification?.();
                return;
            }
            await window.handleRefreshWithLoading?.(this, async () => {
                await StatisticsService.loadStatistics();
                await window.STORAGE?.set({ last_successful_fetch: Date.now() });
            });
        });
    },
};

// Expose globally
window.StatisticsService = StatisticsService;
window.loadStatistics = () => StatisticsService.loadStatistics();
window.renderGPAChart = (labels, data) => StatisticsService.renderGPAChart(labels, data);
window.gpaChartInstance = null; // For backward compatibility
