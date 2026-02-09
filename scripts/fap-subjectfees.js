/**
 * FAP Subject Fees Page - Enhancement Script
 * Injected into https://fap.fpt.edu.vn/FrontOffice/SubjectFees.aspx
 * Adds search filtering, row count, and scroll-to-top for the large fees table
 */

(function () {
    "use strict";

    /**
     * Main enhancement function
     */
    function enhanceSubjectFees() {
        const table = document.getElementById("ctl00_mainContent_gvSubjects");
        if (!table) return;

        const tbody = table.querySelector("tbody") || table;
        const allRows = Array.from(tbody.querySelectorAll("tr"));
        if (allRows.length < 2) return;

        // Separate header from data rows
        const headerRow = allRows[0];
        const dataRows = allRows.slice(1);

        // --- Insert toolbar above the table ---
        const toolbar = document.createElement("div");
        toolbar.className = "fap-fees-toolbar";

        // Search input
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "fap-fees-search";
        searchInput.placeholder = "Search by Subject Code or Name...";
        toolbar.appendChild(searchInput);

        // Row count badge
        const countBadge = document.createElement("span");
        countBadge.className = "fap-fees-count";
        countBadge.textContent = dataRows.length + " subjects";
        toolbar.appendChild(countBadge);

        // Insert toolbar before the table
        table.parentNode.insertBefore(toolbar, table);

        // --- Search filter logic (debounced) ---
        let debounceTimer = null;

        searchInput.addEventListener("input", function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                filterRows(searchInput.value);
            }, 200);
        });

        function filterRows(query) {
            const q = query.trim().toLowerCase();
            let visibleCount = 0;

            dataRows.forEach(function (row) {
                const cells = row.querySelectorAll("td");
                if (cells.length < 2) return;

                const code = (cells[0].textContent || "").toLowerCase();
                const name = (cells[1].textContent || "").toLowerCase();

                if (!q || code.includes(q) || name.includes(q)) {
                    row.classList.remove("fap-fees-hidden");
                    visibleCount++;
                } else {
                    row.classList.add("fap-fees-hidden");
                }
            });

            // Update count badge
            if (q) {
                countBadge.textContent = visibleCount + " / " + dataRows.length + " subjects";
            } else {
                countBadge.textContent = dataRows.length + " subjects";
            }

            // Show/hide no-results message
            let noResultsEl = table.parentNode.querySelector(".fap-fees-no-results");
            if (visibleCount === 0 && q) {
                if (!noResultsEl) {
                    noResultsEl = document.createElement("div");
                    noResultsEl.className = "fap-fees-no-results";
                    table.parentNode.insertBefore(noResultsEl, table.nextSibling);
                }
                noResultsEl.textContent = 'No subjects found for "' + q + '"';
                noResultsEl.style.display = "";
            } else if (noResultsEl) {
                noResultsEl.style.display = "none";
            }
        }

        // --- Format fee values with currency suffix ---
        dataRows.forEach(function (row) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 4) return;

            // Fee column (index 3) — add ₫ suffix if it has a number
            formatFeeCell(cells[3]);
            // Fee International column (index 4) — add ₫ suffix if it has a number
            if (cells.length > 4) {
                formatFeeCell(cells[4]);
            }
        });

        function formatFeeCell(cell) {
            const text = cell.textContent.trim();
            if (!text || text === "\u00a0" || text === "&nbsp;") return;
            // If already formatted or doesn't look like a number, skip
            if (text.includes("₫")) return;
            // Check if it's a number (with possible commas)
            const cleaned = text.replace(/[,.\s]/g, "");
            if (/^\d+$/.test(cleaned)) {
                cell.textContent = text + " ₫";
            }
        }

        // --- Scroll-to-top button ---
        const scrollBtn = document.createElement("button");
        scrollBtn.className = "fap-fees-scroll-top";
        scrollBtn.textContent = "↑";
        scrollBtn.title = "Scroll to top";
        document.body.appendChild(scrollBtn);

        scrollBtn.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });

        window.addEventListener("scroll", function () {
            if (window.scrollY > 400) {
                scrollBtn.classList.add("visible");
            } else {
                scrollBtn.classList.remove("visible");
            }
        }, { passive: true });

        console.log("[FAP Dashboard] Subject Fees enhanced ✓ (" + dataRows.length + " subjects)");
    }

    // Run on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", enhanceSubjectFees);
    } else {
        enhanceSubjectFees();
    }
})();
