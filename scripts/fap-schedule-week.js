/**
 * FAP Schedule Page Enhancement - Content Script
 * Adds subtle styling improvements to ScheduleOfWeek.aspx
 */

(function () {
    'use strict';

    // Only run on ScheduleOfWeek.aspx
    if (!window.location.href.includes('ScheduleOfWeek.aspx')) return;

    // CSS gate: only inject CSS + run enhancements when styling is enabled
    chrome.storage.local.get("page_styles", function (data) {
        var styles = data.page_styles || {};
        if (styles.schedule === false) return;

        // Inject CSS programmatically (removed from manifest to allow toggle control)
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles/fap-schedule-week.css");
        document.head.appendChild(link);

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            setTimeout(init, 100);
        }
    });

    function init() {
        console.log('[FAP-ScheduleOfWeek] Initializing...');

        try {
            // Add custom class to body for styling
            document.body.classList.add('fap-enhanced');

            // Find and enhance the schedule table
            const table = findScheduleTable();
            if (table) {
                enhanceTable(table);
                addHeaderWidget(table);
            }

            console.log('[FAP-ScheduleOfWeek] Enhancement complete!');
        } catch (e) {
            console.error('[FAP-ScheduleOfWeek] Error:', e);
        }
    }

    /**
     * Find the main schedule table.
     * Prefers the innermost table with day names to avoid matching
     * outer ASP.NET layout tables whose textContent inherits inner text.
     */
    function findScheduleTable() {
        const tables = document.querySelectorAll('table');
        let bestTable = null;

        for (const table of tables) {
            const text = table.textContent.toUpperCase();
            // Look for schedule table with day names
            if (text.includes('MON') && text.includes('TUE') &&
                text.includes('WED') && text.includes('SLOT')) {
                // Keep iterating — last match is the innermost (most specific)
                bestTable = table;
            }
        }

        if (bestTable) {
            console.log('[FAP-ScheduleOfWeek] Found schedule table');
        } else {
            console.warn('[FAP-ScheduleOfWeek] Schedule table not found');
        }
        return bestTable;
    }

    /**
     * Enhance the table with classes and highlight today (single pass)
     * Only classifies course/status on "slot rows" (first cell = Slot N)
     * to prevent phantom matches from header/footer/summary rows.
     */
    function enhanceTable(table) {
        table.classList.add('fap-schedule-grid');

        // Wrap table
        const wrapper = document.createElement('div');
        wrapper.className = 'fap-schedule-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);

        // Compute today's date string once for highlighting
        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;

        // Enhance cells — single pass handles both classification and today highlight
        const rows = table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td, th');

            // Determine if this is a slot row (data row containing classes)
            const firstCellText = cells[0] ? cells[0].textContent.trim() : '';
            const isSlotRow = /^Slot\s*\d+/i.test(firstCellText);

            cells.forEach((cell, cellIndex) => {
                const text = cell.textContent.trim();

                // Today highlight (merged from separate highlightToday pass)
                if (text.includes(todayStr)) {
                    cell.classList.add('fap-today');
                }

                // Header cells with day names
                if (['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].some(day =>
                    text.toUpperCase().includes(day))) {
                    cell.classList.add('fap-day-header');
                }

                // Slot cells
                if (/^Slot\s*\d+/i.test(text)) {
                    cell.classList.add('fap-slot-cell');
                }

                // Course cells — ONLY in slot rows to prevent phantom matches
                // from header/footer/summary rows that happen to contain
                // course-code-like text + "attended" (root cause of "always 1" bug).
                // Broadened regex: 2-4 letters + 2-3 digits + optional suffix
                // (unified with fap-schedule.js, background.js, attendance.js)
                if (isSlotRow && cellIndex > 0 && /[A-Za-z]{2,4}\d{2,3}[a-z]?/.test(text)) {
                    cell.classList.add('fap-has-course');

                    // Status classes — check "not yet" BEFORE "attended"
                    // to prevent edge cases like "not yet attended" misclassifying
                    if (/not yet/i.test(text)) {
                        cell.classList.add('fap-status-notyet');
                    } else if (/attended/i.test(text)) {
                        cell.classList.add('fap-status-attended');
                    } else if (/absent/i.test(text)) {
                        cell.classList.add('fap-status-absent');
                    }

                    // Style links
                    const links = cell.querySelectorAll('a');
                    links.forEach(link => {
                        const linkText = link.textContent.toLowerCase();
                        if (linkText.includes('material')) {
                            link.classList.add('fap-link', 'fap-link-materials');
                        } else if (linkText.includes('meet')) {
                            link.classList.add('fap-link', 'fap-link-meet');
                        }
                    });
                }

                // Empty cells
                if (text === '-' || text === '') {
                    cell.classList.add('fap-empty-cell');
                }
            });
        });
    }

    /**
     * Add header widget
     */
    function addHeaderWidget(table) {
        // Count stats — scoped to wrapper, not entire document
        const scope = table.closest('.fap-schedule-wrapper') || table;
        const attended = scope.querySelectorAll('.fap-status-attended').length;
        const notYet = scope.querySelectorAll('.fap-status-notyet').length;
        const absent = scope.querySelectorAll('.fap-status-absent').length;
        const rate = (attended + absent) > 0
            ? Math.round((attended / (attended + absent)) * 100)
            : 0;

        const widget = document.createElement('div');
        widget.className = 'fap-header-widget';
        widget.innerHTML = `
            <div class="fap-header-row">
                <div class="fap-header-title">📅 Lịch học tuần</div>
                <div class="fap-header-stats">
                    <span class="fap-stat"><span class="fap-stat-num attended">${attended}</span> Đã học</span>
                    <span class="fap-stat"><span class="fap-stat-num notyet">${notYet}</span> Chưa học</span>
                    <span class="fap-stat"><span class="fap-stat-num absent">${absent}</span> Vắng</span>
                    <span class="fap-stat"><span class="fap-stat-num rate">${rate}%</span> Tỷ lệ ĐD</span>
                </div>
            </div>
        `;

        // Insert before wrapper
        const wrapper = document.querySelector('.fap-schedule-wrapper');
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.insertBefore(widget, wrapper);
            console.log('[FAP-ScheduleOfWeek] Header widget added');
        }
    }

    console.log('[FAP-ScheduleOfWeek] Script loaded');
})();
