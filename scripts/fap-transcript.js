/**
 * FAP Transcript GPA Calculator
 * Content script that injects a GPA calculator widget into StudentTranscript.aspx
 */

(function () {
    'use strict';

    // Check if we're on the right page
    if (!window.location.href.includes('StudentTranscript.aspx')) return;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('[FAP-GPA] Initializing GPA Calculator...');

        const table = document.querySelector('#ctl00_mainContent_divGrade > table');
        if (!table) {
            console.warn('[FAP-GPA] Transcript table not found');
            return;
        }

        const courses = parseTranscriptTable(table);
        console.log('[FAP-GPA] Parsed', courses.length, 'courses');

        // Insert GPA widget
        const widget = createGPAWidget(courses);
        const h2 = document.querySelector('h2');
        if (h2 && h2.textContent.includes('Grade report')) {
            h2.insertAdjacentElement('afterend', widget);
        }

        // Add sorting to table headers
        addTableSorting(table, courses);

        // Store courses globally for filtering
        window._fapCourses = courses;
        window._fapTable = table;
    }

    /**
     * Parse the transcript table into structured data
     */
    function parseTranscriptTable(table) {
        const courses = [];
        const rows = table.querySelectorAll('tbody > tr');

        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 10) return; // Skip summary rows

            const no = cells[0]?.textContent?.trim();
            const term = cells[1]?.textContent?.trim();
            const semester = cells[2]?.textContent?.trim();
            const code = cells[3]?.textContent?.trim();
            const prerequisite = cells[4]?.textContent?.trim();
            const replaced = cells[5]?.textContent?.trim();
            const name = cells[6]?.textContent?.trim();
            const credit = parseFloat(cells[7]?.textContent?.trim()) || 0;
            const gradeText = cells[8]?.textContent?.trim();
            const grade = parseFloat(gradeText) || 0;
            const status = cells[9]?.textContent?.trim();

            // Check if this course doesn't count toward GPA (has red asterisk)
            const lastCell = cells[10];
            const excludeFromGPA = lastCell?.querySelector('span[style*="color:red"]') !== null;

            if (no && code) {
                courses.push({
                    index,
                    no: parseInt(no) || index + 1,
                    term,
                    semester,
                    code,
                    prerequisite,
                    replaced,
                    name,
                    credit,
                    grade,
                    gradeText,
                    status,
                    excludeFromGPA,
                    row
                });
            }
        });

        return courses;
    }

    /**
     * Calculate GPA statistics
     */
    function calculateGPA(courses, includeExcluded = false) {
        const validCourses = courses.filter(c => {
            if (!includeExcluded && c.excludeFromGPA) return false;
            // Exclude term 0 and -1 (pre-university courses)
            // Exception: TMI101 (Traditional musical instrument) counts toward GPA
            const termNum = parseInt(c.term) || 0;
            if (termNum <= 0 && c.code !== 'TMI101') return false;
            if (c.status === 'Studying' || c.status === 'Not started') return false;
            if (c.credit === 0) return false;
            if (isNaN(c.grade) || c.grade === 0) return false;
            return true;
        });

        const totalCredits = validCourses.reduce((sum, c) => sum + c.credit, 0);
        const weightedSum = validCourses.reduce((sum, c) => sum + (c.grade * c.credit), 0);
        const gpa10 = totalCredits > 0 ? weightedSum / totalCredits : 0;
        const gpa4 = gpa10ToGpa4(gpa10);

        const passed = validCourses.filter(c => c.status === 'Passed').length;
        const failed = validCourses.filter(c => c.status === 'Failed' || c.status === 'Not Passed').length;
        const studying = courses.filter(c => c.status === 'Studying').length;
        const notStarted = courses.filter(c => c.status === 'Not started').length;

        return {
            gpa10: gpa10.toFixed(2),
            gpa4: gpa4.toFixed(2),
            totalCredits,
            passed,
            failed,
            studying,
            notStarted,
            totalCourses: validCourses.length
        };
    }

    /**
     * Convert GPA scale 10 to scale 4
     */
    function gpa10ToGpa4(gpa10) {
        if (gpa10 >= 9.0) return 4.0;
        if (gpa10 >= 8.5) return 3.7;
        if (gpa10 >= 8.0) return 3.5;
        if (gpa10 >= 7.0) return 3.0;
        if (gpa10 >= 6.5) return 2.5;
        if (gpa10 >= 5.5) return 2.0;
        if (gpa10 >= 5.0) return 1.5;
        if (gpa10 >= 4.0) return 1.0;
        return 0;
    }

    /**
     * Create the GPA widget HTML
     */
    function createGPAWidget(courses) {
        const stats = calculateGPA(courses);

        const widget = document.createElement('div');
        widget.id = 'fap-gpa-widget';
        widget.className = 'fap-gpa-widget';
        widget.innerHTML = `
            <div class="fap-gpa-header">
                <span class="fap-gpa-title">📊 FAP GPA Calculator</span>
                <div class="fap-gpa-controls">
                    <label class="fap-gpa-toggle">
                        <input type="checkbox" id="fapHideExcluded" checked>
                        <span>Ẩn môn không tính GPA (*)</span>
                    </label>
                </div>
            </div>
            <div class="fap-gpa-cards">
                <div class="fap-gpa-card fap-gpa-primary">
                    <div class="fap-gpa-card-label">GPA (10)</div>
                    <div class="fap-gpa-card-value" id="fapGpa10">${stats.gpa10}</div>
                </div>
                <div class="fap-gpa-card fap-gpa-primary">
                    <div class="fap-gpa-card-label">GPA (4)</div>
                    <div class="fap-gpa-card-value" id="fapGpa4">${stats.gpa4}</div>
                </div>
                <div class="fap-gpa-card">
                    <div class="fap-gpa-card-label">Tổng tín chỉ</div>
                    <div class="fap-gpa-card-value" id="fapCredits">${stats.totalCredits}</div>
                </div>
                <div class="fap-gpa-card fap-gpa-success">
                    <div class="fap-gpa-card-label">Đã qua</div>
                    <div class="fap-gpa-card-value" id="fapPassed">${stats.passed}</div>
                </div>
                <div class="fap-gpa-card fap-gpa-info">
                    <div class="fap-gpa-card-label">Đang học</div>
                    <div class="fap-gpa-card-value" id="fapStudying">${stats.studying}</div>
                </div>
                <div class="fap-gpa-card fap-gpa-warning">
                    <div class="fap-gpa-card-label">Chưa học</div>
                    <div class="fap-gpa-card-value" id="fapNotStarted">${stats.notStarted}</div>
                </div>
            </div>
            <div class="fap-gpa-footer">
                <small>💡 Click vào tiêu đề cột để sắp xếp | Powered by FAP Dashboard Extension</small>
            </div>
        `;

        // Add event listener for filter toggle
        setTimeout(() => {
            const checkbox = document.getElementById('fapHideExcluded');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    toggleExcludedCourses(e.target.checked);
                });
            }
        }, 100);

        return widget;
    }

    /**
     * Toggle visibility of excluded courses
     */
    function toggleExcludedCourses(hide) {
        const courses = window._fapCourses;
        if (!courses) return;

        courses.forEach(course => {
            if (course.excludeFromGPA && course.row) {
                course.row.style.display = hide ? 'none' : '';
            }
        });

        // Recalculate GPA
        const visibleCourses = hide ?
            courses.filter(c => !c.excludeFromGPA) :
            courses;

        updateGPADisplay(visibleCourses);
    }

    /**
     * Update GPA display
     */
    function updateGPADisplay(courses) {
        const stats = calculateGPA(courses, true);

        const gpa10El = document.getElementById('fapGpa10');
        const gpa4El = document.getElementById('fapGpa4');
        const creditsEl = document.getElementById('fapCredits');
        const passedEl = document.getElementById('fapPassed');
        const studyingEl = document.getElementById('fapStudying');
        const notStartedEl = document.getElementById('fapNotStarted');

        if (gpa10El) gpa10El.textContent = stats.gpa10;
        if (gpa4El) gpa4El.textContent = stats.gpa4;
        if (creditsEl) creditsEl.textContent = stats.totalCredits;
        if (passedEl) passedEl.textContent = stats.passed;
        if (studyingEl) studyingEl.textContent = stats.studying;
        if (notStartedEl) notStartedEl.textContent = stats.notStarted;
    }

    /**
     * Add sorting capability to table headers
     */
    function addTableSorting(table, courses) {
        const headers = table.querySelectorAll('thead th');
        let currentSort = { column: null, ascending: true };

        const columnMap = {
            0: 'no',
            1: 'term',
            2: 'semester',
            3: 'code',
            4: 'prerequisite',
            5: 'replaced',
            6: 'name',
            7: 'credit',
            8: 'grade',
            9: 'status'
        };

        headers.forEach((header, index) => {
            if (index >= 10) return; // Skip last column

            header.classList.add('fap-sortable');
            header.style.cursor = 'pointer';
            header.title = 'Click để sắp xếp';

            header.addEventListener('click', () => {
                const column = columnMap[index];
                if (!column) return;

                // Toggle sort direction
                if (currentSort.column === column) {
                    currentSort.ascending = !currentSort.ascending;
                } else {
                    currentSort.column = column;
                    currentSort.ascending = true;
                }

                // Update header indicators
                headers.forEach(h => {
                    h.classList.remove('fap-sort-asc', 'fap-sort-desc');
                });
                header.classList.add(currentSort.ascending ? 'fap-sort-asc' : 'fap-sort-desc');

                // Sort courses
                sortCourses(courses, column, currentSort.ascending);
            });
        });
    }

    /**
     * Sort courses and reorder table rows
     */
    function sortCourses(courses, column, ascending) {
        const tbody = window._fapTable?.querySelector('tbody');
        if (!tbody) return;

        // Sort the courses array
        courses.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            // Handle numeric comparison
            if (column === 'no' || column === 'term' || column === 'credit' || column === 'grade') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
            return 0;
        });

        // Reorder DOM rows
        courses.forEach(course => {
            if (course.row) {
                tbody.appendChild(course.row);
            }
        });

        // Keep the footnote row at the bottom
        const footnoteRow = tbody.querySelector('tr td[colspan]')?.parentElement;
        if (footnoteRow) {
            tbody.appendChild(footnoteRow);
        }
    }

    console.log('[FAP-GPA] Script loaded');
})();
