// ===============================
// Settings Module - Settings UI Management
// ===============================

const SettingsService = {
    // Default configuration
    DEFAULT_CFG: {
        activeFrom: "07:00",
        activeTo: "17:40",
        delayMin: 10,
        delayMax: 30,
        pollEvery: 15,
        viewMode: "popup", // "popup" or "fullpage"
    },

    /**
     * Load settings into UI
     */
    async loadSettingsUI() {
        const cfg = await window.STORAGE?.get("cfg", this.DEFAULT_CFG) || this.DEFAULT_CFG;
        const get = (id) => document.getElementById(id);

        if (get("setViewMode")) get("setViewMode").value = cfg.viewMode || this.DEFAULT_CFG.viewMode;
        if (get("setActiveFrom")) get("setActiveFrom").value = cfg.activeFrom || this.DEFAULT_CFG.activeFrom;
        if (get("setActiveTo")) get("setActiveTo").value = cfg.activeTo || this.DEFAULT_CFG.activeTo;
        if (get("setDelayMin")) get("setDelayMin").value = Number.isFinite(cfg.delayMin) ? cfg.delayMin : this.DEFAULT_CFG.delayMin;
        if (get("setDelayMax")) get("setDelayMax").value = Number.isFinite(cfg.delayMax) ? cfg.delayMax : this.DEFAULT_CFG.delayMax;
        if (get("setPollEvery")) get("setPollEvery").value = Number.isFinite(cfg.pollEvery) ? cfg.pollEvery : this.DEFAULT_CFG.pollEvery;
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
            activeFrom: get("setActiveFrom")?.value || this.DEFAULT_CFG.activeFrom,
            activeTo: get("setActiveTo")?.value || this.DEFAULT_CFG.activeTo,
            delayMin: Math.max(0, parseInt(get("setDelayMin")?.value || this.DEFAULT_CFG.delayMin, 10)),
            delayMax: Math.max(0, parseInt(get("setDelayMax")?.value || this.DEFAULT_CFG.delayMax, 10)),
            pollEvery: Math.max(5, parseInt(get("setPollEvery")?.value || this.DEFAULT_CFG.pollEvery, 10)),
        };

        if (cfg.delayMax < cfg.delayMin) {
            const t = cfg.delayMin;
            cfg.delayMin = cfg.delayMax;
            cfg.delayMax = t;
        }

        await window.STORAGE?.set({ cfg });

        // Ping background to reschedule
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
