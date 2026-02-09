/**
 * FAP Exam Schedule Page - Enhancement Script
 * Injected into https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx
 * Adds countdown badges, urgency highlights, and exam type badges
 */

(function () {
    "use strict";

    /**
     * Parse date string in dd/MM/yyyy format
     * @param {string} dateStr - Date string
     * @returns {Date|null}
     */
    function parseDate(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.trim().split("/");
        if (parts.length !== 3) return null;
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const date = new Date(y, m, d);
        return isNaN(date.getTime()) ? null : date;
    }

    /**
     * Main enhancement function
     */
    function enhanceExamTable() {
        // Find the exam table — the main content table inside divContent
        const divContent = document.getElementById("ctl00_mainContent_divContent");
        if (!divContent) return;

        const table = divContent.querySelector("table");
        if (!table) return;

        const tbody = table.querySelector("tbody") || table;
        const rows = tbody.querySelectorAll("tr");
        if (rows.length === 0) return;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // Skip header row(s) — look for rows with td cells
        rows.forEach(function (row) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 5) return; // Not a data row

            // FAP exam table columns:
            // 0: No, 1: SubjectCode, 2: Subject Name, 3: Date, 4: Room No, 5: Time, 6: Exam Form, 7: Exam, 8: Date of publication

            // --- Date Countdown ---
            const dateCell = cells[3]; // Date column
            if (dateCell) {
                const dateStr = dateCell.textContent.trim();
                const examDate = parseDate(dateStr);

                if (examDate) {
                    const diff = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

                    let badgeClass = "";
                    let badgeText = "";
                    let rowClass = "";

                    if (diff === 0) {
                        badgeClass = "fap-exam-countdown--today";
                        badgeText = "HÔM NAY!";
                        rowClass = "fap-exam-row-today";
                    } else if (diff > 0 && diff <= 3) {
                        badgeClass = "fap-exam-countdown--urgent";
                        badgeText = diff + " ngày nữa";
                        rowClass = "fap-exam-row-urgent";
                    } else if (diff > 3 && diff <= 7) {
                        badgeClass = "fap-exam-countdown--soon";
                        badgeText = diff + " ngày nữa";
                        rowClass = "fap-exam-row-soon";
                    } else if (diff > 7) {
                        badgeClass = "fap-exam-countdown--normal";
                        badgeText = diff + " ngày nữa";
                    } else {
                        badgeClass = "fap-exam-countdown--past";
                        badgeText = "Đã qua";
                        rowClass = "fap-exam-row-past";
                    }

                    // Add countdown badge
                    if (badgeText) {
                        const badge = document.createElement("span");
                        badge.className = "fap-exam-countdown " + badgeClass;
                        badge.textContent = badgeText;
                        dateCell.appendChild(badge);
                    }

                    // Add row urgency class
                    if (rowClass) {
                        row.classList.add(rowClass);
                    }
                }
            }

            // --- Exam Type Badge ---
            const examTypeCell = cells[7]; // "Exam" column (PE, FE, PT, etc.)
            if (examTypeCell) {
                const examType = examTypeCell.textContent.trim().toUpperCase();
                if (examType) {
                    let typeClass = "fap-exam-type--default";
                    if (examType.includes("PE")) typeClass = "fap-exam-type--pe";
                    else if (examType.includes("FE")) typeClass = "fap-exam-type--fe";
                    else if (examType.includes("PT")) typeClass = "fap-exam-type--pt";

                    const typeBadge = document.createElement("span");
                    typeBadge.className = "fap-exam-type " + typeClass;
                    typeBadge.textContent = examType;
                    examTypeCell.textContent = "";
                    examTypeCell.appendChild(typeBadge);
                }
            }
        });

        console.log("[FAP Dashboard] Exam schedule enhanced ✓");
    }

    // Run on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", enhanceExamTable);
    } else {
        enhanceExamTable();
    }
})();
