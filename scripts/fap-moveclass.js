/**
 * FAP Move Class Enhancement Script
 * Injected into https://fap.fpt.edu.vn/FrontOffice/MoveSubject.aspx
 * Replicates the "FPTU Move Out Class Tool" features using vanilla JS.
 *
 * Features:
 * 1. Timetable grid (7 days × 8 slots) showing available classes
 * 2. Quick class switching via POST
 * 3. Advanced filters (subject, lecturer, class ID, student count, day/slot)
 * 4. Student count fetching
 * 5. Student list viewing + .txt export
 * 6. Schedule viewer (iframe)
 */

(function () {
    "use strict";

    // ─── Constants ──────────────────────────────────────────
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const MOVE_SUBJECT_URL = "https://fap.fpt.edu.vn/FrontOffice/MoveSubject.aspx";
    const COURSES_URL = "https://fap.fpt.edu.vn/FrontOffice/Courses.aspx";
    const DEPT_COURSES_URL = "https://fap.fpt.edu.vn/Course/Courses.aspx";
    const GROUPS_URL = "https://fap.fpt.edu.vn/Course/Groups.aspx";
    const SCHEDULE_URL = "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx";
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

    // ─── State ──────────────────────────────────────────────
    let timetable = createEmptyTimetable();
    let studentCounts = {};
    let lecturerList = [];
    let moveList = [];
    let changeSubjectForm = {};
    let isLoading = { moving: false, fetching: false };
    let totalCourses = 0;
    let fetchedCourses = 0;

    let filter = {
        lecturer: "",
        classId: "",
        studentCount: 100,
        excludeSlots: [],
        excludeWeekdays: [],
    };

    // ─── Feature gate: check if feature is enabled in settings ─
    chrome.storage.local.get("feature_toggles", function (data) {
        var features = data.feature_toggles || {};
        if (features.moveclass !== true) return;

        // Inject CSS
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles/fap-moveclass.css");
        document.head.appendChild(link);

        // Inject modal/toast CSS (components.css) for Modal/Toast support
        const compLink = document.createElement("link");
        compLink.rel = "stylesheet";
        compLink.href = chrome.runtime.getURL("styles/components.css");
        document.head.appendChild(compLink);

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }
    });

    // ─── Init ───────────────────────────────────────────────
    async function init() {
        const headerEl = document.querySelector(
            "#aspnetForm > table > tbody > tr:nth-child(1) > td > div > h2"
        );
        if (!headerEl) return;

        const container = document.createElement("div");
        container.className = "mc-container";
        container.id = "mc-root";
        headerEl.appendChild(container);

        // Initialise Modal/Toast if available
        if (window.Modal && typeof window.Modal.init === "function") window.Modal.init();
        if (window.Toast && typeof window.Toast.init === "function") window.Toast.init();

        // Hide old FAP controls by default
        toggleOldFapUI(false);

        // Get URL params
        const urlParams = new URLSearchParams(window.location.search);
        const courseId = urlParams.get("id") || "";

        // Get subject label
        const subjectLabel =
            document.getElementById("ctl00_mainContent_lblSubject")?.textContent || "";

        // Load cached timetable
        const cachedRaw = localStorage.getItem(subjectLabel);
        const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
        if (cached && Date.now() < Number(localStorage.getItem("mc_expireAt"))) {
            timetable = deserializeTimetable(cached);
            lecturerList = extractLecturers(timetable);
        }

        // Build FormData template
        const formData = buildFormData(courseId);

        // Render initial UI
        renderAll(container, formData, courseId, subjectLabel);

        // Load the student list into accordion
        loadStudentList(courseId);

        // Load subjects list for the dropdown
        loadSubjectsList();

        // If no cache, fetch timetable
        if (!cached || Date.now() >= Number(localStorage.getItem("mc_expireAt"))) {
            await fetchAllClasses(formData, courseId, subjectLabel, container);
        }
    }

    // ─── Build ASP.NET FormData ──────────────────────────────
    function buildFormData(courseId, isGroup = false) {
        const fd = new FormData();
        fd.append("__EVENTTARGET", "ctl00$mainContent$dllCourse");
        fd.append("__EVENTARGUMENT", getVal("__EVENTARGUMENT"));
        fd.append("__LASTFOCUS", getVal("__LASTFOCUS"));
        fd.append("__EVENTVALIDATION", getVal("__EVENTVALIDATION"));
        fd.append("__VIEWSTATE", getVal("__VIEWSTATE"));
        fd.append("__VIEWSTATEGENERATOR", getVal("__VIEWSTATEGENERATOR"));
        fd.append("ctl00$mainContent$hdException", "");
        if (isGroup) {
            fd.append("ctl00$mainContent$ddlGroups", courseId);
        } else {
            fd.append("ctl00$mainContent$dllCourse", courseId);
        }
        return fd;
    }

    function getVal(id) {
        return document.getElementById(id)?.getAttribute("value") || "";
    }

    // ─── Fetch all available classes ────────────────────────
    async function fetchAllClasses(formData, currentId, subjectLabel, container) {
        const courseDropdown = document.querySelector("#ctl00_mainContent_dllCourse");
        if (!courseDropdown) return;

        const options = Array.from(courseDropdown.querySelectorAll("option"));
        const courseMap = new Map();
        courseMap.set(
            currentId,
            document.getElementById("ctl00_mainContent_lblOldGroup")?.innerText || ""
        );
        options.forEach((opt) => {
            if (opt.value) courseMap.set(opt.value, opt.textContent);
        });

        totalCourses = courseMap.size;
        fetchedCourses = 0;
        renderAll(container, formData, currentId, subjectLabel);

        // Fetch initial viewstate for a different course
        const firstOtherId = options.find((o) => o.value && o.value !== currentId)?.value;
        if (firstOtherId) {
            await fetchInitialViewState(firstOtherId, currentId);
        }

        for (const [id] of courseMap) {
            formData.set("ctl00$mainContent$dllCourse", id);
            try {
                const res = await fetch(window.location.href, {
                    method: "POST",
                    body: formData,
                });
                const html = await res.text();
                const doc = new DOMParser().parseFromString(html, "text/html");

                const slotText =
                    doc.querySelector("#ctl00_mainContent_lblNewSlot")?.textContent || "";
                const className =
                    doc.querySelector(
                        "#ctl00_mainContent_dllCourse > option:checked"
                    )?.textContent || "";

                if (slotText) {
                    parseSlotInfo(slotText, className);
                }
            } catch (e) {
                console.error("[MC] Error fetching class:", id, e);
            }
            fetchedCourses++;
            renderAll(container, formData, currentId, subjectLabel);
        }

        // Cache timetable
        localStorage.setItem(subjectLabel, JSON.stringify(serializeTimetable(timetable)));
        localStorage.setItem("mc_expireAt", String(Date.now() + CACHE_TTL_MS));

        // Extract lecturers from timetable
        lecturerList = extractLecturers(timetable);
        renderAll(container, formData, currentId, subjectLabel);
    }

    async function fetchInitialViewState(otherCourseId, currentId) {
        try {
            const res = await fetch(MOVE_SUBJECT_URL + "?id=" + otherCourseId);
            // We don't need to parse this, just prime the server session
            await res.text();
        } catch (e) {
            console.warn("[MC] fetchInitialViewState error:", e);
        }
    }

    // ─── Parse slot info ────────────────────────────────────
    function parseSlotInfo(slotText, className) {
        const parts = slotText.split(",");
        if (parts.length === 0) return;

        // Extract lecturer and room from first part
        const firstPart = parts[0];
        const lectureMatch = firstPart.indexOf("Lecture:");
        const roomMatch = firstPart.indexOf("RoomNo:");
        const lecturer = lectureMatch >= 0 ? firstPart.slice(lectureMatch + 9).trim() : "N/A";
        const room =
            roomMatch >= 0
                ? firstPart.slice(roomMatch + 8, lectureMatch >= 0 ? firstPart.indexOf(" - Lecture:") : undefined).trim()
                : "";

        const displayName = `${className} (${lecturer || "N/A"})\n${room}`;

        for (const part of parts) {
            const dayStr = part.trim().slice(0, 3);
            const slotStr = part.trim().length >= 12 ? part.trim().charAt(11) : "";

            if (DAYS.includes(dayStr) && SLOTS.includes(slotStr)) {
                const dayMap = timetable.get(dayStr);
                if (dayMap) {
                    const slotArr = dayMap.get(slotStr) || [];
                    if (!slotArr.includes(displayName)) {
                        slotArr.push(displayName);
                    }
                    dayMap.set(slotStr, slotArr);
                }
            }
        }
    }

    // ─── Timetable data helpers ─────────────────────────────
    function createEmptyTimetable() {
        const m = new Map();
        DAYS.forEach((d) => {
            const dayMap = new Map();
            SLOTS.forEach((s) => dayMap.set(s, []));
            m.set(d, dayMap);
        });
        return m;
    }

    function serializeTimetable(tt) {
        const obj = {};
        tt.forEach((dayMap, day) => {
            obj[day] = {};
            dayMap.forEach((arr, slot) => {
                obj[day][slot] = arr;
            });
        });
        return obj;
    }

    function deserializeTimetable(obj) {
        const m = new Map();
        for (const [day, slots] of Object.entries(obj)) {
            const dayMap = new Map();
            for (const [slot, arr] of Object.entries(slots)) {
                dayMap.set(slot, arr);
            }
            m.set(day, dayMap);
        }
        return m;
    }

    function extractLecturers(tt) {
        const set = new Set();
        SLOTS.forEach((slot) => {
            DAYS.forEach((day) => {
                const arr = tt.get(day)?.get(slot) || [];
                arr.forEach((entry) => {
                    const match = entry.match(/\(([^)]+)\)/);
                    if (match) set.add(match[1]);
                });
            });
        });
        return Array.from(set);
    }

    // ─── Color hash (same algorithm as original) ────────────
    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        let color = "#";
        for (let i = 0; i < 3; i++) {
            let value = (hash >> (i * 8)) & 255;
            value = Math.min(value + 120, 255);
            color += ("00" + value.toString(16)).slice(-2);
        }
        return color;
    }

    // ─── Get class key map ──────────────────────────────────
    function getClassKeyMap(isGroup = false) {
        const selector = isGroup
            ? "#ctl00_mainContent_ddlGroups"
            : "#ctl00_mainContent_dllCourse";
        const html = document.querySelector(selector)?.innerHTML || "";
        const doc = new DOMParser().parseFromString(
            `<select>${html}</select>`,
            "text/html"
        );
        const options = doc.querySelectorAll("option");
        const map = new Map();
        const currentGroup =
            document.getElementById("ctl00_mainContent_lblOldGroup")?.innerText || "";
        const urlParams = new URLSearchParams(window.location.search);
        map.set(currentGroup, urlParams.get("id") || "");
        options.forEach((opt) => {
            if (opt.value) map.set(opt.textContent, opt.value);
        });
        return map;
    }

    // ─── Move to a class ────────────────────────────────────
    async function moveToClass(className, formData) {
        const classKey = className.split(" (")[0];
        const keyMap = getClassKeyMap();
        const courseValue = keyMap.get(classKey);

        if (!courseValue) {
            showAlert("Không tìm thấy mã lớp để chuyển", "error");
            return;
        }

        const confirmed = await showConfirm(
            `Bạn có chắc muốn chuyển qua lớp ${className} không?`
        );
        if (!confirmed) return;

        isLoading.moving = true;
        rerenderUI();

        formData.set("ctl00$mainContent$dllCourse", courseValue);
        formData.set("ctl00$mainContent$btSave", "Save");

        try {
            const res = await fetch(window.location.href, {
                method: "POST",
                body: formData,
                priority: "high",
            });
            const html = await res.text();

            // Parse alert message from response
            const alertMatch = html.match(/alert\('([^']*)'\)/);
            let msg = alertMatch?.[1]?.replaceAll("</br>", "\n");

            if (msg) {
                showAlert(msg, msg.includes("đã được chấp nhận") ? "success" : "warning");

                if (msg.includes("đã được chấp nhận")) {
                    const subjectLabel =
                        document.getElementById("ctl00_mainContent_lblSubject")
                            ?.textContent || "";
                    localStorage.removeItem(subjectLabel);
                    const newId = getClassKeyMap().get(className.split(" ")[0]);
                    if (newId) {
                        window.location.href =
                            MOVE_SUBJECT_URL + "?id=" + newId;
                    }
                }
            } else {
                showAlert("Bạn đã ở trong lớp này rồi", "info");
            }
        } catch (e) {
            showAlert("Lỗi khi chuyển lớp: " + e.message, "error");
        }

        isLoading.moving = false;
        rerenderUI();
    }

    // ─── Load student list ──────────────────────────────────
    async function loadStudentList(courseId) {
        try {
            const res = await fetch(GROUPS_URL + "?group=" + courseId);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            const studentsDiv = doc.querySelector("#ctl00_mainContent_divStudents");
            const target = document.getElementById("mc-student-list");
            if (studentsDiv && target) {
                target.innerHTML = "";
                target.appendChild(document.importNode(studentsDiv, true));
            }
        } catch (e) {
            console.error("[MC] loadStudentList error:", e);
        }
    }

    // ─── Load subjects list ─────────────────────────────────
    async function loadSubjectsList() {
        try {
            const res = await fetch(COURSES_URL);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, "text/html");

            const rows = doc.querySelectorAll(
                "#ctl00_mainContent_gvCourses tbody tr:not(:first-child)"
            );
            moveList = Array.from(rows).map((row) => {
                const cells = row.querySelectorAll("td");
                return {
                    classId: cells[0]?.textContent?.trim() || "",
                    subject: cells[1]?.textContent?.trim() || "",
                    lecturer: cells[4]?.textContent?.trim() || "",
                    moveId: cells[6]?.querySelector("a")?.id || "",
                };
            });

            // Also grab form state for subject switching
            const vs = doc.querySelector("#__VIEWSTATE")?.getAttribute("value") || "";
            const vsg = doc.querySelector("#__VIEWSTATEGENERATOR")?.getAttribute("value") || "";
            const ev = doc.querySelector("#__EVENTVALIDATION")?.getAttribute("value") || "";
            const campus =
                doc.querySelector("#ctl00_mainContent_ddlCampuses option:first-child")
                    ?.getAttribute("value") || "";

            changeSubjectForm = {
                __VIEWSTATE: encodeURIComponent(vs),
                __VIEWSTATEGENERATOR: vsg,
                __EVENTVALIDATION: encodeURIComponent(ev),
                ctl00_mainContent_ddlCampuses: campus,
            };

            rerenderUI();
        } catch (e) {
            console.error("[MC] loadSubjectsList error:", e);
        }
    }

    // ─── Fetch student counts ───────────────────────────────
    async function fetchStudentCounts() {
        isLoading.fetching = true;
        rerenderUI();

        try {
            const res = await fetch(DEPT_COURSES_URL);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, "text/html");

            const subjectLabel =
                document.getElementById("ctl00_mainContent_lblSubject")?.textContent || "";
            const subjectCode = (subjectLabel.match(/^(.*?)(?=\s*-)/) || [])[1] || "";

            // Find campus
            const campusName = doc.querySelector("#ctl00_lblCampusName")?.textContent?.trim() || "";
            let campus = campusName.includes("Hòa Lạc") ? "hola" : "xavalo";

            // Fetch department mapping
            let deptData;
            try {
                const deptRes = await fetch(
                    "https://pear104.github.io/fptu-move-out-class-tool/dept.json",
                    { cache: "no-cache" }
                );
                deptData = await deptRes.json();
            } catch {
                showAlert("Không thể tải dữ liệu department", "error");
                isLoading.fetching = false;
                rerenderUI();
                return;
            }

            const deptKeys = Object.keys(deptData[campus] || {});
            const matchedKey = deptKeys.find((k) =>
                k.includes(subjectCode.toLowerCase())
            );
            if (!matchedKey) {
                showAlert("Không tìm thấy department cho môn này", "warning");
                isLoading.fetching = false;
                rerenderUI();
                return;
            }

            // Find the href base
            const firstLink = doc.querySelector(
                "#ctl00_mainContent_divDepartment table tr:nth-child(1) td a"
            );
            let hrefBase = firstLink?.getAttribute("href") || "";
            hrefBase = hrefBase.replace(/(.*?&[^&]+)=[^&]+$/, "$1");

            const deptUrl = DEPT_COURSES_URL + hrefBase + "=" + deptData[campus][matchedKey];
            const deptRes = await fetch(deptUrl);
            const deptHtml = await deptRes.text();
            const deptDoc = new DOMParser().parseFromString(deptHtml, "text/html");

            // Find subject row
            const allRows = deptDoc.querySelectorAll("#id tr");
            for (const row of allRows) {
                const firstCell = row.querySelector("td:nth-child(1)");
                if (!firstCell) continue;
                if (!firstCell.textContent.toLowerCase().includes(subjectCode.toLowerCase()))
                    continue;

                // Parse student counts from group links
                const links = row.querySelectorAll('td:nth-child(2) a[href^="Groups.aspx"], td:nth-child(3) a[href^="Groups.aspx"]');
                links.forEach((a) => {
                    const className = a.textContent.trim();
                    const nextText = a.nextSibling?.nodeValue || "";
                    const parts = nextText.split("|");
                    if (parts.length >= 2) {
                        const count = parts[1].trim().split("-")[0].split("(")[0].trim();
                        studentCounts[className] = count;
                    }
                });
                break;
            }

            isLoading.fetching = false;
            filter.studentCount =
                Math.max(...Object.values(studentCounts).map(Number).filter(isFinite)) || 100;
            showAlert("Đã lấy xong sĩ số!", "success");
            rerenderUI();
        } catch (e) {
            console.error("[MC] fetchStudentCounts error:", e);
            isLoading.fetching = false;
            showAlert("Lỗi khi lấy sĩ số: " + e.message, "error");
            rerenderUI();
        }
    }

    // ─── Send change subject request ────────────────────────
    async function sendChangeSubject(eventTarget, formState) {
        try {
            const res = await fetch(COURSES_URL, {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                },
                body: `__EVENTTARGET=${eventTarget}&__EVENTARGUMENT=&__LASTFOCUS=&__VIEWSTATE=${formState.__VIEWSTATE}&__VIEWSTATEGENERATOR=${formState.__VIEWSTATEGENERATOR}&__VIEWSTATEENCRYPTED=&__EVENTVALIDATION=${formState.__EVENTVALIDATION}&ctl00%24mainContent%24txtNewGroup=&ctl00%24mainContent%24ddlCampuses=${formState.ctl00_mainContent_ddlCampuses}&ctl00%24mainContent%24hdException=`,
                credentials: "include",
            });
            if (res.redirected) {
                window.location.href = res.url;
            }
        } catch (e) {
            console.error("[MC] sendChangeSubject error:", e);
        }
    }

    // ─── Download student list ──────────────────────────────
    function downloadStudentList() {
        const classIdEl = document.querySelector("#mc-subject-code");
        const groupEl = document.getElementById("ctl00_mainContent_lblOldGroup");
        const filename = `${classIdEl?.textContent || "class"}-${groupEl?.textContent || "group"}.txt`;

        const container = document.getElementById("mc-student-list");
        if (!container) return;

        const rows = container.querySelectorAll("tbody tr");
        const lines = Array.from(rows)
            .map((row) => {
                const cells = row.querySelectorAll("td");
                if (cells.length < 6) return null;
                return `${cells[2]?.textContent}, ${cells[3]?.textContent?.trim()} ${cells[4]?.textContent?.trim()} ${cells[5]?.textContent?.trim()}`;
            })
            .filter(Boolean)
            .join("\n");

        const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ─── UI Helpers ─────────────────────────────────────────
    function showAlert(msg, type = "info") {
        if (window.Modal) {
            if (type === "success") window.Modal.success(msg);
            else if (type === "error") window.Modal.error(msg);
            else if (type === "warning") window.Modal.warning(msg);
            else window.Modal.alert(msg);
        } else {
            alert(msg);
        }
    }

    async function showConfirm(msg) {
        if (window.Modal) {
            return window.Modal.confirm(msg);
        }
        return window.confirm(msg);
    }

    function toggleOldFapUI(show) {
        const moveDiv = document.getElementById("ctl00_mainContent_divMoveSubject");
        const infoDiv = document.getElementById("ctl00_mainContent_divNewGroupInfo");
        if (moveDiv) moveDiv.classList.toggle("hidden", !show);
        if (infoDiv) infoDiv.classList.toggle("hidden", !show);
    }

    // ─── UI Render reference ────────────────────────────────
    let _container, _formData, _courseId, _subjectLabel;

    function rerenderUI() {
        if (_container) renderAll(_container, _formData, _courseId, _subjectLabel);
    }

    // ─── Render Everything ──────────────────────────────────
    function renderAll(container, formData, courseId, subjectLabel) {
        _container = container;
        _formData = formData;
        _courseId = courseId;
        _subjectLabel = subjectLabel;

        const subjectCode = subjectLabel.split("-")[0]?.trim() || "";
        const currentGroup =
            document.getElementById("ctl00_mainContent_lblOldGroup")?.textContent || "";

        container.innerHTML = "";

        // ── Action Bar ──
        const actionBar = el("div", "mc-action-bar");

        if (!isLoading.fetching && !isLoading.moving) {
            actionBar.append(
                makeBtn("Làm mới", "mc-btn-green", () => {
                    localStorage.removeItem(subjectLabel);
                    window.location.reload();
                }),
                makeBtn("Lấy sĩ số", "mc-btn-green", fetchStudentCounts, "Có thể sẽ hơi lag"),
                el("span", "mc-subject-label", subjectCode, { id: "mc-subject-code" })
            );
        }

        if (isLoading.moving || isLoading.fetching) {
            const msg = isLoading.moving
                ? "Đang thực hiện chuyển đổi, vui lòng đợi..."
                : "Đang lấy sĩ số lớp...";
            const loadingDiv = el("div", "mc-loading-msg");
            loadingDiv.append(el("span", "", msg), el("span", "mc-spinner"));
            actionBar.append(loadingDiv);
        }
        container.appendChild(actionBar);

        // ── Filter Bar ──
        container.appendChild(renderFilterBar(subjectLabel));

        // ── Progress Bar ──
        if (fetchedCourses < totalCourses && totalCourses > 0) {
            const pw = el("div", "mc-progress-wrapper");
            pw.append(el("span", "mc-spinner"));
            const prog = document.createElement("progress");
            prog.value = fetchedCourses;
            prog.max = totalCourses;
            pw.appendChild(prog);
            container.appendChild(pw);
        }

        // ── Timetable ──
        container.appendChild(renderTimetable(formData));

        // ── Student List Accordion ──
        container.appendChild(renderStudentListAccordion(currentGroup));

        // ── Schedule Accordion ──
        container.appendChild(renderScheduleAccordion());

        // ── Toggle old FAP UI ──
        const toggleWrap = el("div", "mc-toggle-old");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "mc-show-old";
        cb.addEventListener("change", () => toggleOldFapUI(cb.checked));
        const lbl = document.createElement("label");
        lbl.htmlFor = "mc-show-old";
        lbl.textContent = "Hiện chức năng FAP cũ";
        toggleWrap.append(cb, lbl);
        container.appendChild(toggleWrap);
    }

    // ─── Render Filter Bar ──────────────────────────────────
    function renderFilterBar(subjectLabel) {
        const bar = el("div", "mc-filter-bar");

        // Subject dropdown
        const subjectSelect = document.createElement("select");
        subjectSelect.innerHTML = `<option value="" disabled selected>Tìm theo môn học</option>`;
        moveList.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.moveId ? m.moveId.replaceAll("_", "$") : "";
            opt.textContent = `${m.subject} (${m.classId} - ${m.lecturer.trim() || "N/A"})`;
            if (subjectLabel.includes(m.subject)) opt.selected = true;
            subjectSelect.appendChild(opt);
        });
        subjectSelect.addEventListener("change", async (e) => {
            if (e.target.value) {
                isLoading.moving = true;
                rerenderUI();
                await sendChangeSubject(e.target.value, changeSubjectForm);
            }
        });
        bar.appendChild(subjectSelect);

        // Lecturer dropdown
        const lecturerSelect = document.createElement("select");
        lecturerSelect.innerHTML = `<option value="" disabled>Tìm theo giảng viên</option><option value="">Tất cả</option>`;
        lecturerList.forEach((l) => {
            const opt = document.createElement("option");
            opt.value = l;
            opt.textContent = l;
            if (filter.lecturer === l) opt.selected = true;
            lecturerSelect.appendChild(opt);
        });
        lecturerSelect.addEventListener("change", (e) => {
            filter.lecturer = e.target.value;
            rerenderUI();
        });
        bar.appendChild(lecturerSelect);

        // Class ID search
        const classInput = document.createElement("input");
        classInput.type = "text";
        classInput.placeholder = "Tìm theo lớp";
        classInput.value = filter.classId;
        classInput.addEventListener("input", (e) => {
            filter.classId = e.target.value;
            rerenderUI();
        });
        bar.appendChild(classInput);

        // Student count slider
        if (Object.keys(studentCounts).length > 0) {
            const counts = Object.values(studentCounts).map(Number).filter(isFinite);
            const min = Math.min(...counts) || 0;
            const max = Math.max(...counts) || 100;

            const rangeWrap = el("div", "mc-filter-range");
            rangeWrap.appendChild(
                el("span", "", `Lọc sĩ số (≤ ${filter.studentCount})`)
            );
            const rangeInput = document.createElement("input");
            rangeInput.type = "range";
            rangeInput.min = min;
            rangeInput.max = max;
            rangeInput.value = filter.studentCount;
            rangeInput.addEventListener("input", (e) => {
                filter.studentCount = Number(e.target.value);
                rerenderUI();
            });
            rangeWrap.appendChild(rangeInput);
            bar.appendChild(rangeWrap);
        }

        // Reset button
        const resetBtn = document.createElement("button");
        resetBtn.className = "mc-filter-reset";
        resetBtn.textContent = "✕";
        resetBtn.title = "Xóa bộ lọc";
        resetBtn.addEventListener("click", () => {
            const counts = Object.values(studentCounts).map(Number).filter(isFinite);
            filter = {
                lecturer: "",
                classId: "",
                studentCount: counts.length > 0 ? Math.max(...counts) : 100,
                excludeSlots: [],
                excludeWeekdays: [],
            };
            rerenderUI();
        });
        bar.appendChild(resetBtn);

        return bar;
    }

    // ─── Render Timetable ───────────────────────────────────
    function renderTimetable(formData) {
        const table = document.createElement("table");
        table.className = "mc-timetable";

        // Header
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headerRow.appendChild(el("td", "", ""));

        DAYS.forEach((day) => {
            const td = document.createElement("td");
            const label = document.createElement("label");
            label.className = "mc-day-label";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !filter.excludeWeekdays.includes(day);
            cb.addEventListener("change", (e) => {
                if (e.target.checked) {
                    filter.excludeWeekdays = filter.excludeWeekdays.filter((d) => d !== day);
                } else {
                    filter.excludeWeekdays.push(day);
                }
                rerenderUI();
            });
            label.append(cb, document.createTextNode(day));
            td.appendChild(label);
            headerRow.appendChild(td);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement("tbody");
        SLOTS.forEach((slot) => {
            const tr = document.createElement("tr");

            // Slot header cell
            const slotTd = document.createElement("td");
            const slotLabel = document.createElement("label");
            slotLabel.className = "mc-slot-label";
            const slotCb = document.createElement("input");
            slotCb.type = "checkbox";
            slotCb.checked = !filter.excludeSlots.includes(slot);
            slotCb.addEventListener("change", (e) => {
                if (e.target.checked) {
                    filter.excludeSlots = filter.excludeSlots.filter((s) => s !== slot);
                } else {
                    filter.excludeSlots.push(slot);
                }
                rerenderUI();
            });
            slotLabel.append(slotCb, document.createTextNode("Slot " + slot));
            slotTd.appendChild(slotLabel);
            tr.appendChild(slotTd);

            // Day cells
            DAYS.forEach((day) => {
                const td = document.createElement("td");
                const entries = timetable.get(day)?.get(slot) || [];

                entries.forEach((entry) => {
                    const visible = isEntryVisible(entry, day, slot);
                    const cell = el(
                        "div",
                        "mc-class-cell" + (visible ? "" : " mc-class-hidden")
                    );
                    cell.style.backgroundColor = stringToColor(entry);
                    cell.title = getClassKeyMap(true).get(entry.split(" (")[0]) || "";

                    // Class name + lecturer
                    const lines = entry.split("\n");
                    lines.forEach((line, idx) => {
                        cell.appendChild(document.createTextNode(line));
                        if (idx < lines.length - 1) cell.appendChild(document.createElement("br"));
                    });

                    // Student count
                    const classCode = entry.split(" ")[0];
                    if (studentCounts[classCode]) {
                        const countSpan = el(
                            "span",
                            "mc-student-count",
                            `${studentCounts[classCode]} students`
                        );
                        cell.appendChild(countSpan);
                    }

                    cell.addEventListener("click", () => moveToClass(entry, formData));
                    td.appendChild(cell);
                });

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        return table;
    }

    function isEntryVisible(entry, day, slot) {
        if (filter.excludeWeekdays.includes(day)) return false;
        if (filter.excludeSlots.includes(slot)) return false;
        if (filter.lecturer && !entry.includes(filter.lecturer)) return false;
        if (filter.classId && !entry.toLowerCase().includes(filter.classId.toLowerCase()))
            return false;
        if (Object.keys(studentCounts).length > 0) {
            const classCode = entry.split(" ")[0];
            const count = Number(studentCounts[classCode]);
            if (isFinite(count) && count > filter.studentCount) return false;
        }
        return true;
    }

    // ─── Render Student List Accordion ──────────────────────
    function renderStudentListAccordion(currentGroup) {
        const details = document.createElement("details");
        details.className = "mc-accordion";

        const summary = document.createElement("summary");
        summary.innerHTML = `<span class="mc-chevron">▼</span> Danh sách lớp hiện tại (${esc(currentGroup)})`;

        const downloadBtn = makeBtn("Tải xuống .txt", "mc-btn-blue", downloadStudentList);
        downloadBtn.style.marginLeft = "auto";
        downloadBtn.style.fontSize = "12px";
        downloadBtn.style.padding = "4px 12px";
        summary.appendChild(downloadBtn);

        details.appendChild(summary);

        const body = el("div", "mc-accordion-body");
        const listContainer = el("div", "mc-student-list-container");
        listContainer.id = "mc-student-list";
        listContainer.textContent = "Đang tải...";
        body.appendChild(listContainer);
        details.appendChild(body);

        return details;
    }

    // ─── Render Schedule Accordion ──────────────────────────
    function renderScheduleAccordion() {
        const details = document.createElement("details");
        details.className = "mc-accordion";

        const summary = document.createElement("summary");
        summary.innerHTML = `<span class="mc-chevron">▼</span> Thời khóa biểu`;
        details.appendChild(summary);

        const body = el("div", "mc-accordion-body");
        const iframe = document.createElement("iframe");
        iframe.className = "mc-schedule-iframe";
        iframe.src = SCHEDULE_URL;
        iframe.addEventListener("load", () => {
            try {
                const iframeDoc = iframe.contentWindow?.document;
                if (iframeDoc) cleanupScheduleIframe(iframeDoc);
            } catch (e) {
                // cross-origin, ignore
            }
        });
        body.appendChild(iframe);
        details.appendChild(body);

        return details;
    }

    function cleanupScheduleIframe(doc) {
        doc.querySelectorAll(".label.label-primary").forEach((el) => (el.innerHTML = ""));
        doc.querySelector(".container .row:nth-child(1)")?.remove();
        doc.querySelector(".breadcrumb")?.remove();
        doc.querySelector("tbody tr:nth-child(2)")?.remove();
        doc.querySelectorAll("td > div > p").forEach((p) => p.remove());
        doc.querySelectorAll("h2").forEach((h) => h.remove());
        doc.querySelector("#ctl00_mainContent_divfoot")?.remove();
        doc.querySelector("#ctl00_divUser")?.remove();
        doc.querySelector("#cssTable")?.remove();
        doc.querySelector('[id^="ctl00_divSupport"]')?.remove();
        doc.querySelector('[id^="ctl00_mainContent_ghichu"]')?.remove();
        const container = doc.querySelector(".container");
        if (container) container.setAttribute("style", "padding:0;margin:0;width:100%;overflow-x:hidden;");
        const col = doc.querySelector(".container > .row > .col-md-12");
        if (col) col.setAttribute("style", "padding-right:0;");
    }

    // ─── DOM Helper Functions ───────────────────────────────
    function el(tag, className, text, attrs) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text) e.textContent = text;
        if (attrs) {
            Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
        }
        return e;
    }

    function makeBtn(text, extraClass, onClick, title) {
        const btn = el("span", "mc-btn " + extraClass, text);
        if (title) btn.title = title;
        btn.addEventListener("click", onClick);
        return btn;
    }

    function esc(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
})();
