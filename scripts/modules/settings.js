// ===============================
// Settings Module - Settings UI Management
// ===============================

const SettingsService = {
    // Default configuration
    DEFAULT_CFG: {
        viewMode: "popup", // "popup" or "fullpage"
    },

    /**
     * Load settings into UI
     */
    async loadSettingsUI() {
        const cfg = await window.STORAGE?.get("cfg", this.DEFAULT_CFG) || this.DEFAULT_CFG;
        const get = (id) => document.getElementById(id);

        if (get("setViewMode")) get("setViewMode").value = cfg.viewMode || this.DEFAULT_CFG.viewMode;
    },

    /**
     * Save settings from UI
     */
    async saveSettingsUI() {
        const get = (id) => document.getElementById(id);
        const currentCfg = await window.STORAGE?.get("cfg", this.DEFAULT_CFG) || this.DEFAULT_CFG;

        const cfg = {
            ...currentCfg,
            viewMode: get("setViewMode")?.value || this.DEFAULT_CFG.viewMode,
        };

        await window.STORAGE?.set({ cfg });

        // Ping background to update popup mode
        chrome.runtime.sendMessage({ type: "CFG_UPDATED" });

        if (window.Toast) {
            window.Toast.success("Đã lưu cài đặt");
        }
    },


    /**
     * Initialize settings event listeners
     */
    init() {
        document.getElementById("btnSaveSettings")?.addEventListener("click", () => this.saveSettingsUI());
        document.getElementById("btnTestNotify")?.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "TEST_NOTIFY" });
        });
    },
};

// Expose globally for backward compatibility
window.SettingsService = SettingsService;
window.DEFAULT_CFG = SettingsService.DEFAULT_CFG;
window.loadSettingsUI = () => SettingsService.loadSettingsUI();
window.saveSettingsUI = () => SettingsService.saveSettingsUI();
