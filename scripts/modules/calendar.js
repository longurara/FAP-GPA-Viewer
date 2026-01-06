// ===== Calendar Module =====
// Calendar integration for exporting schedules and exams to ICS format

let calendarService = null;

function initCalendarService() {
    if (!calendarService && typeof CalendarService !== "undefined") {
        calendarService = new CalendarService();
    }
}

// Toast wrapper function
function showToast(message, type = "info") {
    if (typeof Toast !== "undefined") {
        switch (type) {
            case "success":
                Toast.success(message);
                break;
            case "error":
                Toast.error(message);
                break;
            case "info":
                Toast.info(message);
                break;
            default:
                Toast.info(message);
        }
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Export schedule to ICS
async function exportScheduleICS() {
    try {
        initCalendarService();

        const btn = document.getElementById("btnExportScheduleICS");
        if (btn) {
            btn.classList.add("loading");
            btn.disabled = true;
        }

        const result = await calendarService.exportScheduleICS();

        if (result.success) {
            showToast(`🎉 Export ${result.count} sự kiện lịch học thành file .ics!`, "success");
        }
    } catch (error) {
        console.error("Export schedule failed:", error);
        showToast(`Lỗi: ${error.message}`, "error");
    } finally {
        const btn = document.getElementById("btnExportScheduleICS");
        if (btn) {
            btn.classList.remove("loading");
            btn.disabled = false;
        }
    }
}

// Export exams to ICS
async function exportExamICS() {
    try {
        initCalendarService();

        const btn = document.getElementById("btnExportExamICS");
        if (btn) {
            btn.classList.add("loading");
            btn.disabled = true;
        }

        const result = await calendarService.exportExamICS();

        if (result.success) {
            showToast(`🎉 Export ${result.count} sự kiện lịch thi thành file .ics!`, "success");
        }
    } catch (error) {
        console.error("Export exam failed:", error);
        showToast(`Lỗi: ${error.message}`, "error");
    } finally {
        const btn = document.getElementById("btnExportExamICS");
        if (btn) {
            btn.classList.remove("loading");
            btn.disabled = false;
        }
    }
}

// Show calendar help modal
function showCalendarHelp() {
    const modal = document.getElementById("calendarHelpModal");
    if (modal) {
        modal.style.display = "flex";
    }
}

// Close calendar help modal
function closeCalendarHelp() {
    const modal = document.getElementById("calendarHelpModal");
    if (modal) {
        modal.style.display = "none";
    }
}

// Initialize calendar UI event listeners
function initCalendarUI() {
    // Export buttons
    document.getElementById("btnExportScheduleICS")?.addEventListener("click", exportScheduleICS);
    document.getElementById("btnExportExamICS")?.addEventListener("click", exportExamICS);

    // Help modal
    document.getElementById("modalHelpClose")?.addEventListener("click", closeCalendarHelp);

    // Close modal when clicking outside
    document.getElementById("calendarHelpModal")?.addEventListener("click", function (e) {
        if (e.target === this) {
            closeCalendarHelp();
        }
    });

    // Add help button to schedule and exam tabs
    const scheduleActions = document.querySelector("#tab-schedule .actions");
    const examActions = document.querySelector("#tab-exam .actions");

    if (scheduleActions && !scheduleActions.querySelector("#btnCalendarHelp")) {
        const helpBtn = document.createElement("button");
        helpBtn.id = "btnCalendarHelp";
        helpBtn.className = "secondary";
        helpBtn.textContent = "Hướng dẫn";
        helpBtn.addEventListener("click", showCalendarHelp);
        scheduleActions.appendChild(helpBtn);
    }

    if (examActions && !examActions.querySelector("#btnCalendarHelp2")) {
        const helpBtn = document.createElement("button");
        helpBtn.id = "btnCalendarHelp2";
        helpBtn.className = "secondary";
        helpBtn.textContent = "Hướng dẫn";
        helpBtn.addEventListener("click", showCalendarHelp);
        examActions.appendChild(helpBtn);
    }
}

// Export for global access
window.CalendarUIService = {
    init: initCalendarUI,
    initCalendarService,
    exportScheduleICS,
    exportExamICS,
    showCalendarHelp,
    closeCalendarHelp,
    showToast,
};

window.initCalendarUI = initCalendarUI;
window.exportScheduleICS = exportScheduleICS;
window.exportExamICS = exportExamICS;
window.showCalendarHelp = showCalendarHelp;
window.closeCalendarHelp = closeCalendarHelp;
