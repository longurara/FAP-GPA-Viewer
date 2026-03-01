/**
 * FAP Student Portal - Weekly Schedule Widget
 * Content script that injects a weekly schedule table into Student.aspx
 * Fetches schedule data from ScheduleOfWeek.aspx and displays it inline
 */

(function () {
    'use strict';

    // Only run on Student.aspx (main portal page)
    if (!window.location.href.includes('Student.aspx')) return;

    // Guard against duplicate injection
    if (window.__fapScheduleInjected) return;
    window.__fapScheduleInjected = true;

    // CSS gate: only inject CSS + run enhancements when styling is enabled
    chrome.storage.local.get("page_styles", function (data) {
        var styles = data.page_styles || {};
        if (styles.student === false) return;

        // Inject CSS programmatically (removed from manifest to allow toggle control)
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles/fap-schedule.css");
        document.head.appendChild(link);

        _run();
    });

    function _run() {

        const SCHEDULE_URL = 'https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx';
        const CACHE_KEY = 'fap_schedule_widget';
        const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

        // Day names mapped by column index (Mon=0 ... Sun=6)
        const DAY_NAMES_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

        // Security helpers
        function _esc(s) {
            if (s == null) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function _safeUrl(url) {
            if (!url) return '';
            try { const u = new URL(url, 'https://fap.fpt.edu.vn'); return u.protocol === 'https:' ? u.href : ''; }
            catch { return ''; }
        }

        // Loading guard to prevent concurrent fetches [M2]
        let isLoading = false;

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }

        function init() {
            console.log('[FAP-Schedule] Initializing Weekly Schedule Widget...');

            // Create and insert the schedule widget [C4: with fallback chain]
            const widget = createScheduleWidget();
            const inserted = insertWidget(widget);

            if (!inserted) {
                console.warn('[FAP-Schedule] Could not insert widget into page');
                return; // Don't load schedule if widget not visible
            }

            // Enhance existing page elements
            enhancePageElements();

            // Load schedule data (check cache first)
            loadSchedule(false);
        }

        /**
         * Insert widget into the DOM with multiple fallback insertion points [C4]
         * Returns true if successfully inserted
         */
        function insertWidget(widget) {
            // Priority 1: After chat widget container
            const chatContainer = document.getElementById('chat-widget-container');
            if (chatContainer) {
                chatContainer.insertAdjacentElement('afterend', widget);
                return true;
            }

            // Priority 2: After breadcrumb
            const breadcrumb = document.querySelector('.breadcrumb');
            if (breadcrumb) {
                breadcrumb.insertAdjacentElement('afterend', widget);
                return true;
            }

            // Priority 3: Beginning of main content area
            const mainContent = document.getElementById('ctl00_mainContent_divMain');
            if (mainContent) {
                mainContent.insertAdjacentElement('afterbegin', widget);
                return true;
            }

            // Priority 4: After the first .container > .row
            const firstRow = document.querySelector('.container > .row');
            if (firstRow) {
                firstRow.insertAdjacentElement('afterend', widget);
                return true;
            }

            return false;
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
                <div>
                    <span class="fap-schedule-title">📅 Lịch học tuần này</span>
                    <span class="fap-schedule-week-info" id="fapWeekInfo"></span>
                </div>
                <div class="fap-schedule-controls">
                    <a href="${SCHEDULE_URL}" target="_blank" class="btn btn-sm btn-default" title="Xem trang lịch học đầy đủ">
                        📋 Xem đầy đủ
                    </a>
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
            const refreshBtn = widget.querySelector('#fapRefreshSchedule');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => loadSchedule(true));
            }

            return widget;
        }

        /**
         * Enhance existing page elements with better UX
         */
        function enhancePageElements() {
            addNoticeToggle();
            addSectionIcons();
            document.documentElement.style.scrollBehavior = 'smooth';
        }

        /**
         * Add collapse/expand toggle for the notice table
         */
        function addNoticeToggle() {
            const mainDiv = document.getElementById('ctl00_mainContent_divMain');
            if (!mainDiv) return;

            const newsBox = mainDiv.querySelector('.box');
            if (!newsBox) return;

            const noticeTable = newsBox.querySelector('table');
            if (!noticeTable) return;

            const toggle = document.createElement('button');
            toggle.className = 'fap-notice-toggle';
            toggle.innerHTML = '📋 Thu gọn';
            toggle.type = 'button';

            let collapsed = false;
            noticeTable.classList.add('fap-notice-expanded');

            toggle.addEventListener('click', () => {
                collapsed = !collapsed;
                if (collapsed) {
                    noticeTable.classList.remove('fap-notice-expanded');
                    noticeTable.classList.add('fap-notice-collapsed');
                    toggle.innerHTML = '📋 Xem thêm';
                } else {
                    noticeTable.classList.remove('fap-notice-collapsed');
                    noticeTable.classList.add('fap-notice-expanded');
                    toggle.innerHTML = '📋 Thu gọn';
                }
            });

            noticeTable.parentElement.insertBefore(toggle, noticeTable);
        }

        /**
         * Add emoji icons to Academic Information section headers
         */
        function addSectionIcons() {
            const icons = {
                'Registration': '📝', 'Thủ tục': '📝',
                'Information': '🔍', 'Tra cứu': '🔍',
                'Feedback': '💬', 'Ý kiến': '💬',
                'Reports': '📊', 'Báo cáo': '📊',
                'Others': '📌', 'Khác': '📌',
                'Regulations': '📜', 'Quy định': '📜',
                'Coursera': '🎓', 'FPTU-Coursera': '🎓'
            };

            const h4s = document.querySelectorAll('#ctl00_mainContent_divMain .box h4');
            h4s.forEach(h4 => {
                const text = h4.textContent.trim();
                for (const [keyword, icon] of Object.entries(icons)) {
                    if (text.includes(keyword)) {
                        if (!h4.textContent.includes(icon)) {
                            h4.insertAdjacentHTML('afterbegin', icon + ' ');
                        }
                        break;
                    }
                }
            });
        }

        // ========== Caching Layer [M1] ==========

        /**
         * Get cached schedule data from chrome.storage.local
         * Returns null if cache is missing or expired
         */
        async function getCachedSchedule() {
            try {
                const result = await chrome.storage.local.get(CACHE_KEY);
                const cached = result[CACHE_KEY];
                if (!cached || !cached.timestamp || !cached.entries) return null;
                if (Date.now() - cached.timestamp > CACHE_TTL) return null;
                return cached;
            } catch (e) {
                console.warn('[FAP-Schedule] Cache read failed:', e);
                return null;
            }
        }

        /**
         * Save schedule data to chrome.storage.local
         */
        async function cacheSchedule(data) {
            try {
                await chrome.storage.local.set({
                    [CACHE_KEY]: {
                        ...data,
                        timestamp: Date.now()
                    }
                });
            } catch (e) {
                console.warn('[FAP-Schedule] Cache write failed:', e);
            }
        }

        // ========== UI Helpers ==========

        /**
         * Set the refresh button to loading/ready state [M2]
         */
        function setRefreshButtonLoading(loading) {
            const btn = document.getElementById('fapRefreshSchedule');
            if (!btn) return;
            btn.disabled = loading;
            btn.innerHTML = loading ? '⏳ Đang tải...' : '🔄 Làm mới';
        }

        /**
         * Update week info display
         */
        function updateWeekInfoUI(weekInfo) {
            const el = document.getElementById('fapWeekInfo');
            if (el && weekInfo) {
                el.textContent = `(${weekInfo})`;
            }
        }

        /**
         * Render error state with retry button [L2]
         */
        function renderError(container, errorCode) {
            let errorMessage = '❌ Không thể tải lịch học.';
            if (errorCode === 'NOT_LOGGED_IN') {
                errorMessage = '🔒 Bạn cần đăng nhập FAP để xem lịch học.';
            } else if (errorCode === 'SCHEDULE_TABLE_NOT_FOUND') {
                errorMessage = '📭 Không tìm thấy bảng lịch học.';
            }

            container.innerHTML = `
            <div class="fap-schedule-error">
                <span>${errorMessage}</span>
                <br><br>
                <button class="btn btn-sm btn-primary fap-retry-btn" title="Thử lại">
                    🔄 Thử lại
                </button>
                <a href="${SCHEDULE_URL}" target="_blank" class="btn btn-sm btn-default">
                    Mở trang lịch học
                </a>
            </div>
        `;

            const retryBtn = container.querySelector('.fap-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => loadSchedule(true));
            }
        }

        // ========== Schedule Loading & Parsing ==========

        /**
         * Load schedule by fetching ScheduleOfWeek.aspx
         * Uses chrome.storage.local cache to avoid redundant fetches [M1]
         * Guarded against concurrent calls [M2]
         */
        async function loadSchedule(forceRefresh = false) {
            if (isLoading) return; // [M2] debounce
            isLoading = true;

            const container = document.getElementById('fapScheduleContent');
            if (!container) { isLoading = false; return; }

            // Show loading state
            setRefreshButtonLoading(true);
            container.innerHTML = `
            <div class="fap-schedule-loading">
                <span>⏳ Đang tải lịch học...</span>
            </div>
        `;

            try {
                // Check cache first (unless force refresh) [M1]
                if (!forceRefresh) {
                    const cached = await getCachedSchedule();
                    if (cached) {
                        console.log('[FAP-Schedule] Using cached schedule data');
                        updateWeekInfoUI(cached.weekInfo);
                        renderScheduleTable(container, cached.entries);
                        return;
                    }
                }

                console.log('[FAP-Schedule] Fetching schedule from', SCHEDULE_URL);

                const response = await fetch(SCHEDULE_URL, {
                    credentials: 'include',
                    cache: forceRefresh ? 'no-cache' : 'default'
                });

                // [C3] Check login via redirect (matches background.js pattern)
                // BUG #6 FIX: Previously the inner try/catch only re-threw NOT_LOGGED_IN,
                // silently swallowing TypeError if response.url was malformed.
                // Now we do a direct check without a nested try/catch.
                if (response.redirected && response.url) {
                    try {
                        if (/\/Default\.aspx$/i.test(new URL(response.url).pathname)) {
                            throw new Error('NOT_LOGGED_IN');
                        }
                    } catch (e) {
                        // Re-throw all errors (NOT_LOGGED_IN + malformed URL TypeError)
                        throw e;
                    }
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const html = await response.text();

                // [C3] Secondary login check -- limited to first 2000 chars,
                // exclude false positives from "logout" and "lblLogIn"
                const head = html.toLowerCase().slice(0, 2000);
                if ((head.includes('đăng nhập') || (head.includes('login') && !head.includes('logout') && !head.includes('lbllogin')))) {
                    throw new Error('NOT_LOGGED_IN');
                }

                // Parse the schedule HTML
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const scheduleTable = findScheduleTable(doc);

                if (!scheduleTable) {
                    throw new Error('SCHEDULE_TABLE_NOT_FOUND');
                }

                // Extract week info
                const weekInfo = extractWeekInfo(doc);
                updateWeekInfoUI(weekInfo);

                // Parse schedule entries
                const entries = parseScheduleTable(scheduleTable, doc);
                console.log('[FAP-Schedule] Parsed entries:', entries.length);

                // Cache the parsed data [M1]
                await cacheSchedule({ entries, weekInfo });

                // Also populate cache_attendance for popup/dashboard consumption
                await syncToAttendanceCache(entries);

                // Render
                renderScheduleTable(container, entries);

            } catch (err) {
                console.error('[FAP-Schedule] Failed to load schedule:', err);
                renderError(container, err.message);
            } finally {
                isLoading = false;
                setRefreshButtonLoading(false);
            }
        }

        /**
         * Find the schedule table in the parsed HTML document [M3]
         * Prefers the innermost table that has its own <thead> with day names
         */
        function findScheduleTable(doc) {
            const tables = doc.querySelectorAll('table');
            let bestTable = null;

            for (const table of tables) {
                // Only consider tables with their own <thead>
                const thead = table.querySelector(':scope > thead');
                if (!thead) continue;

                const theadText = thead.textContent.toUpperCase();
                if (theadText.includes('MON') && theadText.includes('TUE') &&
                    theadText.includes('WED') && /SLOT/i.test(table.textContent)) {
                    // Prefer innermost matching table (last match wins over ancestors)
                    bestTable = table;
                }
            }

            // Fallback: any table with day names in text
            if (!bestTable) {
                for (const table of tables) {
                    const text = table.textContent.toUpperCase();
                    if (text.includes('MON') && text.includes('TUE') &&
                        text.includes('WED') && text.includes('SLOT')) {
                        bestTable = table;
                        break;
                    }
                }
            }

            return bestTable;
        }

        /**
         * Extract the current week info from the selected dropdown option
         */
        function extractWeekInfo(doc) {
            const weekDropdown = doc.getElementById('ctl00_mainContent_drpSelectWeek');
            if (!weekDropdown) return null;

            const selected = weekDropdown.querySelector('option[selected]');
            return selected ? selected.textContent.trim() : null;
        }

        /**
         * Parse the schedule table into an array of entry objects
         * Uses column index for sorting (eliminates year-boundary bugs) [C1][C2]
         * Extracts links from cells [M7]
         */
        function parseScheduleTable(scheduleTable, doc) {
            const entries = [];

            // --- Find header rows ---
            // background.js approach: scan first 8 rows for day names
            const allRows = [...scheduleTable.querySelectorAll('tr')];
            let headerRowIdx = -1;
            let dateRowIdx = -1;

            for (let i = 0; i < Math.min(8, allRows.length); i++) {
                const txt = allRows[i].textContent.toUpperCase();
                if (/MON/.test(txt) && /TUE/.test(txt) && /WED/.test(txt) &&
                    /THU/.test(txt) && /FRI/.test(txt)) {
                    headerRowIdx = i;
                    break;
                }
            }

            if (headerRowIdx === -1) {
                console.warn('[FAP-Schedule] Day-name header row not found');
                return entries;
            }

            // Date row is typically the next row
            dateRowIdx = headerRowIdx + 1;
            if (dateRowIdx >= allRows.length) {
                console.warn('[FAP-Schedule] Date header row not found');
                return entries;
            }

            // --- Build day column map (column index -> date, day name) ---
            const headerCells = [...allRows[headerRowIdx].querySelectorAll('td,th')];
            const dayCols = []; // { name: 'MON', idx: colIndex, date: 'DD/MM' }

            headerCells.forEach((c, i) => {
                const text = c.textContent.trim();
                const m = text.match(/(MON|TUE|WED|THU|FRI|SAT|SUN)/i);
                if (m) {
                    dayCols.push({ name: m[1].toUpperCase(), idx: i, date: null });
                }
            });

            // Fill in dates from the date row
            const dateCells = [...allRows[dateRowIdx].querySelectorAll('td,th')];
            dayCols.forEach(col => {
                // Date cells correspond to dayCols but offset by the Year/Week cell
                // Try matching by position in dateCells array
                const dateCell = dateCells[dayCols.indexOf(col)];
                if (dateCell) {
                    const dateMatch = dateCell.textContent.trim().match(/\d{2}\/\d{2}/);
                    if (dateMatch) col.date = dateMatch[0];
                }
            });

            // If dates weren't found positionally, try scanning all date cells
            if (dayCols.some(c => !c.date)) {
                const allDates = [];
                dateCells.forEach(c => {
                    const m = c.textContent.trim().match(/^(\d{2}\/\d{2})$/);
                    if (m) allDates.push(m[1]);
                });
                if (allDates.length >= dayCols.length) {
                    dayCols.forEach((col, i) => { col.date = allDates[i]; });
                }
            }

            console.log('[FAP-Schedule] Day columns:', dayCols.map(d => `${d.name}=${d.date}`).join(', '));

            // --- Parse slot rows ---
            const slotRows = allRows.filter(r => {
                const c0 = r.querySelector('td,th');
                return c0 && /^Slot\s*\d+/i.test((c0.textContent || '').trim());
            });

            slotRows.forEach(row => {
                const cells = [...row.querySelectorAll('td,th')];
                const slotText = (cells[0]?.textContent || '').trim();
                const slotMatch = slotText.match(/Slot\s*(\d+)/i);
                if (!slotMatch) return;

                const slot = parseInt(slotMatch[1]);

                dayCols.forEach((dayCol, dayIndex) => {
                    const cell = cells[dayCol.idx];
                    if (!cell) return;

                    const cellText = (cell.textContent || '').trim();
                    if (!cellText || cellText === '-') return;

                    // [M4] Course code regex: 2-4 letters (mixed case) + 2-3 digits + optional suffix
                    const courseMatch = cellText.match(/([A-Za-z]{2,4}\d{2,3}[a-z]?)/);
                    if (!courseMatch) return;

                    const course = courseMatch[1].toUpperCase();
                    const date = dayCol.date || dayCol.name;

                    // Attendance status (unified: 'not yet' with space, matching background.js/attendance.js)
                    let status = 'not yet';
                    if (/attended/i.test(cellText)) status = 'attended';
                    else if (/absent/i.test(cellText)) status = 'absent';

                    // [M5] Room regex: letters, digits, dots, hyphens, underscores, slashes
                    const roomMatch = cellText.match(/at\s+([A-Za-z0-9._\-\/]+)/);
                    const room = roomMatch ? roomMatch[1] : '';

                    // Time from cell text, fallback to slot time
                    const timeMatch = cellText.match(/\((\d{1,2}:\d{2}-\d{1,2}:\d{2})\)/);
                    const time = timeMatch ? timeMatch[1] : getSlotTime(slot);

                    // [M7] Extract links from cell DOM
                    const links = {};
                    const anchors = cell.querySelectorAll('a');
                    anchors.forEach(a => {
                        const href = a.getAttribute('href');
                        if (!href) return;
                        const linkText = (a.textContent || '').toLowerCase();
                        if (linkText.includes('material')) {
                            links.material = href;
                        } else if (linkText.includes('meet')) {
                            links.meet = href;
                        } else if (href.includes('ActivityDetail')) {
                            links.detail = href;
                        }
                    });

                    entries.push({
                        slot,
                        date,
                        dayIndex, // [C1] column position for sorting
                        dayName: DAY_NAMES_VI[dayIndex] || dayCol.name, // [C2] from column position
                        day: dayCol.name, // unified: MON/TUE/etc matching background.js/attendance.js
                        key: `${date}|Slot ${slot}|${course}`, // unified key for cross-module lookup
                        course,
                        room,
                        time,
                        status,
                        links
                    });
                });
            });

            // [C1] Sort by column index (Mon-Sun order), then slot
            entries.sort((a, b) => {
                if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
                return a.slot - b.slot;
            });

            return entries;
        }

        // ========== Helper Functions ==========

        /**
         * Sync parsed schedule entries to cache_attendance (unified schema)
         * so the popup/dashboard can consume the same data without refetching.
         * Normalizes slot from integer to "Slot N" string to match attendance.js format.
         */
        async function syncToAttendanceCache(entries) {
            try {
                const today = new Date();
                const todayStr = String(today.getDate()).padStart(2, '0') + '/' +
                    String(today.getMonth() + 1).padStart(2, '0');

                // Normalize entries to match attendance.js / background.js cache format
                const cacheEntries = entries.map(e => ({
                    key: e.key,
                    course: e.course,
                    day: e.day,
                    date: e.date,
                    slot: `Slot ${e.slot}`,
                    time: e.time,
                    room: e.room,
                    status: e.status,
                }));

                // Compute todayRows (same structure as attendance.js parseScheduleOfWeek)
                const todayRows = cacheEntries
                    .filter(e => e.date === todayStr)
                    .map(e => ({ time: e.time, course: e.course, room: e.room, note: e.status }));

                await chrome.storage.local.set({
                    cache_attendance: {
                        ts: Date.now(),
                        data: { entries: cacheEntries, todayRows },
                    },
                    cache_attendance_flat: cacheEntries,
                });
                console.log('[FAP-Schedule] Synced to cache_attendance:', cacheEntries.length, 'entries');
            } catch (e) {
                console.warn('[FAP-Schedule] Failed to sync to cache_attendance:', e);
            }
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
         * Render schedule table into the container
         * Includes attendance stats [M6] and links [M7]
         */
        function renderScheduleTable(container, entries) {
            if (!entries || entries.length === 0) {
                container.innerHTML = `
                <div class="fap-schedule-empty">
                    <span>📭 Không có lịch học tuần này</span>
                </div>
            `;
                return;
            }

            // [M6] Compute attendance stats
            let attended = 0, absent = 0, notYet = 0;
            entries.forEach(e => {
                if (e.status === 'attended') attended++;
                else if (e.status === 'absent') absent++;
                else notYet++;
            });
            const total = attended + absent;
            const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

            // Group by date (preserving insertion order from sorted entries)
            const byDate = new Map();
            entries.forEach(e => {
                const key = e.date;
                if (!byDate.has(key)) byDate.set(key, []);
                byDate.get(key).push(e);
            });

            // Get today's date in DD/MM format
            const today = new Date();
            const todayStr = String(today.getDate()).padStart(2, '0') + '/' +
                String(today.getMonth() + 1).padStart(2, '0');

            // [M6] Stats bar
            let html = `
            <div class="fap-schedule-stats">
                <span class="fap-stat"><span class="fap-stat-num attended">${attended}</span> Đã học</span>
                <span class="fap-stat"><span class="fap-stat-num notyet">${notYet}</span> Chưa học</span>
                <span class="fap-stat"><span class="fap-stat-num absent">${absent}</span> Vắng</span>
                <span class="fap-stat"><span class="fap-stat-num rate">${rate}%</span> Tỷ lệ ĐD</span>
            </div>
        `;

            html += '<table class="table table-bordered table-hover fap-schedule-table">';
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

            byDate.forEach((dayEntries, date) => {
                const isToday = date === todayStr;

                dayEntries.forEach((entry, idx) => {
                    const rowClass = isToday ? 'fap-today-row' : '';
                    const statusClass = getStatusClass(entry.status);
                    const statusText = getStatusText(entry.status);

                    html += `<tr class="${rowClass}">`;

                    // Only show date on first row of each day [M8: today border on date cell]
                    if (idx === 0) {
                        const todayClass = isToday ? ' fap-today-date' : '';
                        html += `<td rowspan="${dayEntries.length}" class="fap-date-cell${todayClass}">
                        <strong>${_esc(entry.dayName)}</strong><br>
                        <span>${_esc(date)}</span>
                        ${isToday ? '<span class="fap-badge-today">Hôm nay</span>' : ''}
                    </td>`;
                    }

                    // [M7] Course name with optional links (URLs validated)
                    const safeCourse = _esc(entry.course);
                    let courseHtml = `<strong>${safeCourse}</strong>`;
                    if (entry.links && entry.links.detail) {
                        const safeDetailUrl = _safeUrl(entry.links.detail);
                        if (safeDetailUrl) {
                            courseHtml = `<a href="${_esc(safeDetailUrl)}" target="_blank" class="fap-course-link"><strong>${safeCourse}</strong></a>`;
                        }
                    }

                    // Material/Meet link badges (URLs validated)
                    let linkBadges = '';
                    if (entry.links) {
                        if (entry.links.material) {
                            const safeMatUrl = _safeUrl(entry.links.material);
                            if (safeMatUrl) linkBadges += ` <a href="${_esc(safeMatUrl)}" target="_blank" class="label label-warning fap-link-badge">Material</a>`;
                        }
                        if (entry.links.meet) {
                            const safeMeetUrl = _safeUrl(entry.links.meet);
                            if (safeMeetUrl) linkBadges += ` <a href="${_esc(safeMeetUrl)}" target="_blank" class="label label-info fap-link-badge">Meet</a>`;
                        }
                    }

                    html += `
                    <td>Slot ${parseInt(entry.slot) || 0}</td>
                    <td>${courseHtml}${linkBadges}</td>
                    <td>${_esc(entry.room)}</td>
                    <td>${_esc(entry.time)}</td>
                    <td><span class="label ${_esc(statusClass)}">${_esc(statusText)}</span></td>
                </tr>`;
                });
            });

            html += '</tbody></table>';

            container.innerHTML = html;
        }

        /**
         * Get CSS class for status
         */
        function getStatusClass(status) {
            switch (status) {
                case 'attended': return 'label-success';
                case 'absent': return 'label-danger';
                case 'not yet': return 'label-info';
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
                case 'not yet': return 'Chưa học';
                default: return '-';
            }
        }

        console.log('[FAP-Schedule] Script loaded');

    } // end _run
})();
