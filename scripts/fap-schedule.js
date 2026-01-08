/**
 * FAP Student Portal - Weekly Schedule Widget
 * Content script that injects a weekly schedule table into Student.aspx
 */

(function () {
    'use strict';

    // Only run on Student.aspx (main portal page)
    if (!window.location.href.includes('Student.aspx')) return;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('[FAP-Schedule] Initializing Weekly Schedule Widget...');

        // Find the chat widget container to insert after
        const chatContainer = document.getElementById('chat-widget-container');
        if (!chatContainer) {
            console.warn('[FAP-Schedule] Chat container not found, trying fallback...');
        }

        // Create and insert the schedule widget
        const widget = createScheduleWidget();

        if (chatContainer) {
            chatContainer.insertAdjacentElement('afterend', widget);
        } else {
            // Fallback: insert after breadcrumb
            const breadcrumb = document.querySelector('.breadcrumb');
            if (breadcrumb) {
                breadcrumb.insertAdjacentElement('afterend', widget);
            }
        }

        // Load schedule data
        loadSchedule();
    }

    /**
     * Create the schedule widget container
     */
    function createScheduleWidget() {
        const widget = document.createElement('div');
        widget.id = 'fap-schedule-widget';
        widget.className = 'fap-schedule-widget';
        widget.innerHTML = `
            <div class="fap-schedule-header">
                <span class="fap-schedule-title">📅 Lịch học tuần này</span>
                <div class="fap-schedule-controls">
                    <button id="fapRefreshSchedule" class="btn btn-sm btn-primary" title="Làm mới lịch học">
                        🔄 Làm mới
                    </button>
                </div>
            </div>
            <div class="fap-schedule-content" id="fapScheduleContent">
                <div class="fap-schedule-loading">
                    <span>⏳ Đang tải lịch học...</span>
                </div>
            </div>
            <div class="fap-app-footer">
                <div class="fap-app-footer-title">📱 Tải ứng dụng FAP Mobile (myFAP)</div>
                <div class="fap-app-footer-buttons">
                    <a href="https://apps.apple.com/app/id1527723314" target="_blank">
                        <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="App Store">
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=com.fuct" target="_blank">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play">
                    </a>
                </div>
                <div class="fap-app-footer-note">
                    💡 Powered by FAP Dashboard Extension
                </div>
            </div>
        `;

        // Add event listeners
        setTimeout(() => {
            const refreshBtn = document.getElementById('fapRefreshSchedule');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => loadSchedule(true));
            }
        }, 100);

        return widget;
    }

    /**
     * Load schedule from ScheduleOfWeek.aspx
     */
    async function loadSchedule(forceRefresh = false) {
        const contentEl = document.getElementById('fapScheduleContent');
        if (!contentEl) return;

        // Show loading state
        contentEl.innerHTML = `
            <div class="fap-schedule-loading">
                <span>⏳ Đang tải lịch học...</span>
            </div>
        `;

        try {
            // Fetch schedule page
            const response = await fetch('https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to fetch schedule');
            }

            const html = await response.text();
            const entries = parseScheduleHtml(html);

            if (entries.length === 0) {
                contentEl.innerHTML = `
                    <div class="fap-schedule-empty">
                        <span>📭 Không có lịch học tuần này</span>
                    </div>
                `;
                return;
            }

            // Render schedule table
            renderScheduleTable(contentEl, entries);

        } catch (error) {
            console.error('[FAP-Schedule] Error loading schedule:', error);
            contentEl.innerHTML = `
                <div class="fap-schedule-error">
                    <span>❌ Không thể tải lịch học. Vui lòng thử lại.</span>
                </div>
            `;
        }
    }

    /**
     * Parse schedule HTML from ScheduleOfWeek.aspx
     */
    function parseScheduleHtml(html) {
        const entries = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Find the schedule table
        const tables = doc.querySelectorAll('table');
        let scheduleTable = null;

        for (const table of tables) {
            const thead = table.querySelector('thead');
            const tbody = table.querySelector('tbody');
            if (!thead || !tbody) continue;

            const firstCell = table.querySelector('tbody td');
            if (firstCell && firstCell.textContent.includes('Slot')) {
                scheduleTable = table;
                break;
            }
        }

        if (!scheduleTable) {
            console.warn('[FAP-Schedule] Schedule table not found');
            return entries;
        }

        // Parse header to get dates
        const theadRows = scheduleTable.querySelectorAll('thead tr');
        if (theadRows.length < 2) return entries;

        const dayHeaders = [];
        const dateHeaders = [];

        // First row: day names (skip first empty cell)
        const dayThs = theadRows[0].querySelectorAll('th');
        console.log('[FAP-Schedule] Day headers count:', dayThs.length);
        dayThs.forEach((th, i) => {
            const text = th.textContent.trim();
            if (text && !text.includes('Slot')) {
                dayHeaders.push(text);
            }
        });
        console.log('[FAP-Schedule] Day headers:', dayHeaders);

        // Second row: dates (skip first empty cell)
        const dateThs = theadRows[1].querySelectorAll('th');
        console.log('[FAP-Schedule] Date headers count:', dateThs.length);
        dateThs.forEach((th, i) => {
            const text = th.textContent.trim();
            // Only add if it looks like a date (DD/MM format)
            if (text && text.match(/\d{2}\/\d{2}/)) {
                dateHeaders.push(text);
            }
        });
        console.log('[FAP-Schedule] Date headers:', dateHeaders);

        // Parse body rows
        const slotRows = scheduleTable.querySelectorAll('tbody tr');
        slotRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;

            const slotCell = cells[0];
            const slotText = slotCell.textContent.trim();
            const slotMatch = slotText.match(/Slot\s*(\d+)/i);
            if (!slotMatch) return;

            const slot = parseInt(slotMatch[1]);

            // Process each day column (cells[1] corresponds to dateHeaders[0], etc.)
            for (let i = 1; i < cells.length && (i - 1) < dateHeaders.length; i++) {
                const cell = cells[i];
                const cellText = cell.textContent.trim();

                // Skip empty cells
                if (cellText === '-' || cellText === '') continue;

                // Parse course info
                const courseMatch = cellText.match(/^([A-Z]{2,4}\d{3}[a-z]?)/);
                if (!courseMatch) continue;

                const course = courseMatch[1];
                const dateIndex = i - 1;
                const date = dateHeaders[dateIndex];

                console.log(`[FAP-Schedule] Found: Slot ${slot}, Cell ${i}, Date ${date}, Course ${course}`);

                // Check attendance status
                let status = 'unknown';
                if (cellText.includes('attended')) status = 'attended';
                else if (cellText.includes('absent')) status = 'absent';
                else if (cellText.includes('Not yet')) status = 'not_yet';

                // Parse room
                const roomMatch = cellText.match(/at\s+([A-Z0-9.]+)/);
                const room = roomMatch ? roomMatch[1] : '';

                // Parse time
                const timeMatch = cellText.match(/\((\d{1,2}:\d{2}-\d{1,2}:\d{2})\)/);
                const time = timeMatch ? timeMatch[1] : getSlotTime(slot);

                entries.push({
                    slot,
                    date,
                    course,
                    room,
                    time,
                    status
                });
            }
        });

        // Sort by date and slot
        entries.sort((a, b) => {
            const dateA = parseDate(a.date);
            const dateB = parseDate(b.date);
            if (dateA !== dateB) return dateA - dateB;
            return a.slot - b.slot;
        });

        return entries;
    }

    /**
     * Get time for slot number
     */
    function getSlotTime(slot) {
        const times = {
            1: '07:30-09:50',
            2: '10:00-12:20',
            3: '12:30-14:45',
            4: '15:00-17:15',
            5: '17:30-19:45',
            6: '19:45-21:45'
        };
        return times[slot] || '';
    }

    /**
     * Parse date string DD/MM to comparable number
     */
    function parseDate(dateStr) {
        const parts = dateStr.split('/');
        if (parts.length !== 2) return 0;
        return parseInt(parts[1]) * 100 + parseInt(parts[0]);
    }

    /**
     * Get day name from DD/MM date string
     */
    function getDayName(dateStr) {
        const parts = dateStr.split('/');
        if (parts.length !== 2) return '';

        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = new Date().getFullYear();

        const date = new Date(year, month - 1, day);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayNamesVi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        return dayNamesVi[date.getDay()];
    }

    /**
     * Render schedule table
     */
    function renderScheduleTable(container, entries) {
        // Group by date
        const byDate = {};
        entries.forEach(e => {
            if (!byDate[e.date]) byDate[e.date] = [];
            byDate[e.date].push(e);
        });

        let html = '<table class="table table-bordered table-hover fap-schedule-table">';
        html += `
            <thead>
                <tr>
                    <th>Ngày</th>
                    <th>Slot</th>
                    <th>Môn</th>
                    <th>Phòng</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                </tr>
            </thead>
            <tbody>
        `;

        // Get today's date in DD/MM format
        const today = new Date();
        const todayStr = String(today.getDate()).padStart(2, '0') + '/' +
            String(today.getMonth() + 1).padStart(2, '0');

        Object.keys(byDate).sort((a, b) => parseDate(a) - parseDate(b)).forEach(date => {
            const dayEntries = byDate[date];
            const isToday = date === todayStr;

            dayEntries.forEach((entry, idx) => {
                const rowClass = isToday ? 'fap-today-row' : '';
                const statusClass = getStatusClass(entry.status);
                const statusText = getStatusText(entry.status);

                html += `<tr class="${rowClass}">`;

                // Only show date on first row of each day
                if (idx === 0) {
                    const dayName = getDayName(date);
                    html += `<td rowspan="${dayEntries.length}" class="fap-date-cell">
                        <strong>${dayName}</strong><br>
                        <span>${date}</span>
                        ${isToday ? '<span class="badge badge-primary">Hôm nay</span>' : ''}
                    </td>`;
                }

                html += `
                    <td>Slot ${entry.slot}</td>
                    <td><strong>${entry.course}</strong></td>
                    <td>${entry.room}</td>
                    <td>${entry.time}</td>
                    <td><span class="label ${statusClass}">${statusText}</span></td>
                </tr>`;
            });
        });

        html += '</tbody></table>';

        if (Object.keys(byDate).length === 0) {
            html = `
                <div class="fap-schedule-empty">
                    <span>📭 Không có lịch học tuần này</span>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /**
     * Get CSS class for status
     */
    function getStatusClass(status) {
        switch (status) {
            case 'attended': return 'label-success';
            case 'absent': return 'label-danger';
            case 'not_yet': return 'label-info';
            default: return 'label-default';
        }
    }

    /**
     * Get display text for status
     */
    function getStatusText(status) {
        switch (status) {
            case 'attended': return 'Đã điểm danh';
            case 'absent': return 'Vắng';
            case 'not_yet': return 'Chưa học';
            default: return '-';
        }
    }

    console.log('[FAP-Schedule] Script loaded');
})();
