// ===== Keyboard Shortcuts Module =====
// Handle keyboard shortcuts for the extension popup

function initKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        // Ctrl / Cmd + R: Refresh all
        if ((e.ctrlKey || e.metaKey) && e.key === "r") {
            e.preventDefault();
            document.getElementById("btnQuickRefresh")?.click();
            return;
        }

        // Ctrl / Cmd + K: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            const searchInputs = [
                document.getElementById("searchCourse"),
                document.getElementById("searchAtt"),
                document.getElementById("searchExam"),
            ];

            const activeTab = document.querySelector(".tab.active");
            const activeSearch = searchInputs.find(
                (input) => input && activeTab?.contains(input)
            );

            if (activeSearch) {
                activeSearch.focus();
                activeSearch.select();
            }
            return;
        }

        // Numbers 1-9: Switch tabs
        if (
            !e.ctrlKey &&
            !e.metaKey &&
            !e.shiftKey &&
            !e.altKey &&
            e.key >= "1" &&
            e.key <= "9"
        ) {
            // Don't trigger if user is typing in input or textarea
            if (
                document.activeElement?.tagName === "INPUT" ||
                document.activeElement?.tagName === "TEXTAREA"
            ) {
                return;
            }

            e.preventDefault();
            const tabs = document.querySelectorAll(".tabs button");
            const tabIndex = parseInt(e.key) - 1;
            if (tabs[tabIndex]) {
                tabs[tabIndex].click();
            }
        }
    });
}

// Export for global access
window.ShortcutsService = {
    init: initKeyboardShortcuts,
};

window.initKeyboardShortcuts = initKeyboardShortcuts;

// Auto-initialize on load
document.addEventListener("DOMContentLoaded", initKeyboardShortcuts);
