// ===== Export Module =====
// Export functionality for PDF and CSV

const STORAGE = window.STORAGE;

// Export all data to PDF
async function exportAllPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString("vi-VN");

    function addHeaderFooter() {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`FAP GPA Viewer Dashboard | Xuất ngày: ${today}`, 14, 10);
            doc.text(
                `Trang ${i} / ${pageCount}`,
                doc.internal.pageSize.getWidth() - 40,
                doc.internal.pageSize.getHeight() - 10
            );
        }
    }

    // Add logo
    const logo = await fetch(chrome.runtime.getURL("assets/icons/icon128.png"))
        .then((r) => r.blob())
        .then(
            (b) =>
                new Promise((res) => {
                    const reader = new FileReader();
                    reader.addEventListener("load", () => res(reader.result));
                    reader.readAsDataURL(b);
                })
        );

    doc.addImage(logo, "PNG", 15, 20, 30, 30);
    doc.setFontSize(18);
    doc.text("FAP GPA Viewer Dashboard", 55, 30);
    doc.setFontSize(12);
    doc.text(
        "Một Chrome Extension giúp sinh viên FPT University theo dõi GPA, lịch học, điểm danh và nhắc nhở tự động.",
        15,
        60
    );
    doc.addPage();

    // Transcript section
    const transcript = await STORAGE.get("cache_transcript", null);
    if (transcript?.rows?.length) {
        doc.setFontSize(16);
        doc.text("Transcript", 14, 20);
        doc.autoTable({
            startY: 25,
            head: [["Code", "Name", "Credit", "Grade", "Status"]],
            body: transcript.rows.map((r) => [
                r.code,
                r.name,
                r.credit,
                r.grade,
                r.status,
            ]),
        });
        doc.addPage();
    }

    // Attendance section
    const att = await STORAGE.get("cache_attendance", null);
    if (att?.entries?.length) {
        doc.setFontSize(16);
        doc.text("Attendance", 14, 20);
        doc.autoTable({
            startY: 25,
            head: [["Date", "Day", "Slot", "Course", "Status"]],
            body: att.entries.map((e) => [e.date, e.day, e.slot, e.course, e.status]),
        });
        doc.addPage();

        doc.setFontSize(16);
        doc.text("Schedule (Week)", 14, 20);
        doc.autoTable({
            startY: 25,
            head: [["Day", "Date", "Slot", "Time", "Course", "Room", "Status"]],
            body: att.entries.map((e) => [
                e.day,
                e.date,
                e.slot,
                e.time || "",
                e.course,
                e.room || "",
                e.status || "",
            ]),
        });
        doc.addPage();
    }

    // Settings section
    const cfg = await STORAGE.get("cfg", {});
    doc.setFontSize(16);
    doc.text("Settings", 14, 20);
    doc.autoTable({
        startY: 25,
        head: [["Key", "Value"]],
        body: Object.entries(cfg).map(([k, v]) => [k, String(v)]),
    });

    addHeaderFooter();
    doc.save("fap_dashboard_all.pdf");
}

// Export all data to CSV
function exportToCSV() {
    Promise.all([
        STORAGE.get("cache_transcript", null),
        STORAGE.get("cache_attendance", null),
        STORAGE.get("cache_exams", null),
    ]).then(([transcript, attendance, exams]) => {
        let csv = "";

        // Transcript
        csv += "TRANSCRIPT\n";
        csv += "Code,Name,Credit,Grade,Status\n";
        const tRows = transcript?.rows || transcript?.data?.rows || [];
        tRows.forEach((r) => {
            csv += `${r.code || ""},${r.name || ""},${r.credit || ""},${r.grade || ""},${r.status || ""}\n`;
        });

        // Attendance
        csv += "\n\nATTENDANCE\n";
        csv += "Date,Day,Slot,Course,Status\n";
        const aEntries = attendance?.entries || attendance?.data?.entries || [];
        aEntries.forEach((e) => {
            csv += `${e.date || ""},${e.day || ""},${e.slot || ""},${e.course || ""},${e.status || ""}\n`;
        });

        // Exams
        csv += "\n\nEXAMS\n";
        csv += "Code,Name,Date,Time,Room,Form\n";
        const eRows = exams?.exams || exams?.data?.exams || [];
        eRows.forEach((e) => {
            csv += `${e.code || ""},${e.name || ""},${e.date || ""},${e.time || ""},${e.room || ""},${e.form || ""}\n`;
        });

        // Download
        const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `fap_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });
}

// Initialize export buttons
function initExportButtons() {
    const btnExportPDF = document.getElementById("btnExportPDF");
    if (btnExportPDF) {
        btnExportPDF.addEventListener("click", exportAllPDF);
    }

    const btnExportCSV = document.getElementById("btnExportCSV");
    if (btnExportCSV) {
        btnExportCSV.addEventListener("click", exportToCSV);
    }
}

// Export for global access
window.ExportService = {
    init: initExportButtons,
    exportAllPDF,
    exportToCSV,
};

window.exportAllPDF = exportAllPDF;
window.exportToCSV = exportToCSV;
