/**
 * FAP Schedule Page Enhancement - Content Script
 * Adds subtle styling improvements to ScheduleOfWeek.aspx
 */

(function () {
    'use strict';

    // Only run on ScheduleOfWeek.aspx
    if (!window.location.href.includes('ScheduleOfWeek.aspx')) return;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100); // Small delay to ensure page is fully loaded
    }

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
     * Find the main schedule table
     */
    function findScheduleTable() {
        const tables = document.querySelectorAll('table');

        for (const table of tables) {
            const text = table.textContent.toUpperCase();
            // Look for schedule table with day names
            if (text.includes('MON') && text.includes('TUE') &&
                text.includes('WED') && text.includes('SLOT')) {
                console.log('[FAP-ScheduleOfWeek] Found schedule table');
                return table;
            }
        }

        console.warn('[FAP-ScheduleOfWeek] Schedule table not found');
        return null;
    }

    /**
     * Enhance the table with classes
     */
    function enhanceTable(table) {
        table.classList.add('fap-schedule-grid');

        // Wrap table
        const wrapper = document.createElement('div');
        wrapper.className = 'fap-schedule-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);

        // Enhance cells
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td, th');

            cells.forEach((cell, cellIndex) => {
                const text = cell.textContent.trim();

                // Header cells with day names
                if (['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].some(day =>
                    text.toUpperCase().includes(day))) {
                    cell.classList.add('fap-day-header');
                }

                // Slot cells
                if (/^Slot\s*\d+/i.test(text)) {
                    cell.classList.add('fap-slot-cell');
                }

                // Course cells (has course code pattern)
                if (/[A-Z]{2,4}\d{3}/.test(text)) {
                    cell.classList.add('fap-has-course');

                    // Status classes
                    if (/attended/i.test(text)) {
                        cell.classList.add('fap-status-attended');
                    } else if (/not yet/i.test(text)) {
                        cell.classList.add('fap-status-notyet');
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

        // Highlight today
        highlightToday(table);
    }

    /**
     * Highlight today's column
     */
    function highlightToday(table) {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const todayStr = `${day}/${month}`;

        const cells = table.querySelectorAll('th, td');
        cells.forEach(cell => {
            if (cell.textContent.includes(todayStr)) {
                cell.classList.add('fap-today');
            }
        });
    }

    /**
     * Add header widget
     */
    function addHeaderWidget(table) {
        // Count stats
        const attended = document.querySelectorAll('.fap-status-attended').length;
        const notYet = document.querySelectorAll('.fap-status-notyet').length;
        const absent = document.querySelectorAll('.fap-status-absent').length;
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
