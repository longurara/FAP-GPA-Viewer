// ===============================
// Settings Module - Settings UI Management
// ===============================

const SettingsService = {
    // Default configuration
    DEFAULT_CFG: {
        viewMode: "popup", // "popup" or "fullpage"
    },

    // Page style toggle keys — order matches HTML toggle rows
    PAGE_STYLE_KEYS: [
        "login", "feid_login", "student", "schedule",
        "transcript", "exam", "fees", "news"
    ],

    // Feature toggle keys (separate from page styles, default OFF)
    FEATURE_KEYS: ["moveclass"],

    /**
     * Load settings into UI
     */
    async loadSettingsUI() {
        const cfg = await window.STORAGE?.get("cfg", this.DEFAULT_CFG) || this.DEFAULT_CFG;
        const get = (id) => document.getElementById(id);

        if (get("setViewMode")) get("setViewMode").value = cfg.viewMode || this.DEFAULT_CFG.viewMode;

        // Load page style toggles
        this.loadPageStyleToggles();

        // Load feature toggles
        this.loadFeatureToggles();

        // Load auto-login settings
        this.loadAutoLoginUI();
    },

    /**
     * Load page style toggle states from storage
     */
    async loadPageStyleToggles() {
        try {
            const data = await new Promise((resolve) => {
                chrome.storage.local.get("page_styles", (result) => resolve(result));
            });
            const styles = data.page_styles || {};

            this.PAGE_STYLE_KEYS.forEach((key) => {
                const cb = document.getElementById("toggle-style-" + key);
                if (cb) {
                    // undefined or true = enabled, only false = disabled
                    cb.checked = styles[key] !== false;
                }
            });
        } catch (e) {
            console.warn("[Settings] Failed to load page_styles:", e);
        }
    },

    /**
     * Save page style toggle states to storage
     */
    async savePageStyleToggles() {
        const styles = {};
        this.PAGE_STYLE_KEYS.forEach((key) => {
            const cb = document.getElementById("toggle-style-" + key);
            if (cb) {
                styles[key] = cb.checked;
            }
        });

        try {
            await new Promise((resolve) => {
                chrome.storage.local.set({ page_styles: styles }, resolve);
            });
        } catch (e) {
            console.warn("[Settings] Failed to save page_styles:", e);
        }
    },

    /**
     * Load feature toggle states from storage
     */
    async loadFeatureToggles() {
        try {
            const data = await new Promise((resolve) => {
                chrome.storage.local.get("feature_toggles", (result) => resolve(result));
            });
            const features = data.feature_toggles || {};

            this.FEATURE_KEYS.forEach((key) => {
                const cb = document.getElementById("toggle-feature-" + key);
                if (cb) {
                    // Features default to OFF — must be explicitly true
                    cb.checked = features[key] === true;
                }
            });
        } catch (e) {
            console.warn("[Settings] Failed to load feature_toggles:", e);
        }
    },

    /**
     * Save feature toggle states to storage
     */
    async saveFeatureToggles() {
        const features = {};
        this.FEATURE_KEYS.forEach((key) => {
            const cb = document.getElementById("toggle-feature-" + key);
            if (cb) {
                features[key] = cb.checked;
            }
        });

        try {
            await new Promise((resolve) => {
                chrome.storage.local.set({ feature_toggles: features }, resolve);
            });
        } catch (e) {
            console.warn("[Settings] Failed to save feature_toggles:", e);
        }
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

        // Save page style toggles
        await this.savePageStyleToggles();

        // Save feature toggles
        await this.saveFeatureToggles();

        // Ping background to update popup mode
        chrome.runtime.sendMessage({ type: "CFG_UPDATED" }, () => {
            if (chrome.runtime.lastError) {
                console.warn("[Settings] CFG_UPDATED message failed:", chrome.runtime.lastError.message);
            }
        });

        if (window.Toast) {
            window.Toast.success("Đã lưu cài đặt");
        }
    },

    // ========== Auto-Login Credential Management ==========

    /**
     * Encode credentials for storage (Base64 obfuscation)
     */
    _encodeCredential(str) {
        try { return btoa(unescape(encodeURIComponent(str))); }
        catch { return ""; }
    },

    /**
     * Decode credentials from storage
     */
    _decodeCredential(str) {
        try { return decodeURIComponent(escape(atob(str))); }
        catch { return ""; }
    },

    /**
     * Save auto-login credentials
     */
    async saveAutoLoginCredentials() {
        const username = document.getElementById("autoLoginUsername")?.value?.trim();
        const password = document.getElementById("autoLoginPassword")?.value;

        if (!username || !password) {
            this._showAutoLoginStatus("Vui lòng nhập đầy đủ username và mật khẩu", "error");
            return;
        }

        try {
            await new Promise((resolve) => {
                chrome.storage.local.set({
                    auto_login_enabled: document.getElementById("toggle-auto-login")?.checked ?? true,
                    auto_login_username: this._encodeCredential(username),
                    auto_login_password: this._encodeCredential(password),
                }, resolve);
            });
            this._showAutoLoginStatus("✓ Đã lưu thông tin đăng nhập", "saved");
            console.log("[Settings] Auto-login credentials saved for:", username);
        } catch (e) {
            console.error("[Settings] Failed to save auto-login:", e);
            this._showAutoLoginStatus("Lỗi khi lưu thông tin", "error");
        }
    },

    /**
     * Load auto-login UI state from storage
     */
    async loadAutoLoginUI() {
        try {
            const data = await new Promise((resolve) => {
                chrome.storage.local.get(
                    ["auto_login_enabled", "auto_login_on_startup", "auto_login_username", "auto_login_password"],
                    (result) => resolve(result)
                );
            });

            const toggle = document.getElementById("toggle-auto-login");
            const startupToggle = document.getElementById("toggle-auto-login-startup");
            const usernameInput = document.getElementById("autoLoginUsername");

            if (toggle) toggle.checked = data.auto_login_enabled === true;
            if (startupToggle) startupToggle.checked = data.auto_login_on_startup === true;

            // Show username if saved (but never show password)
            if (usernameInput && data.auto_login_username) {
                usernameInput.value = this._decodeCredential(data.auto_login_username);
            }

            // Show status if credentials exist
            if (data.auto_login_username && data.auto_login_password) {
                this._showAutoLoginStatus("✓ Đã lưu thông tin đăng nhập", "saved");
            }
        } catch (e) {
            console.warn("[Settings] Failed to load auto-login settings:", e);
        }
    },

    /**
     * Clear auto-login credentials
     */
    async clearAutoLoginCredentials() {
        try {
            await new Promise((resolve) => {
                chrome.storage.local.remove(
                    ["auto_login_enabled", "auto_login_on_startup", "auto_login_username", "auto_login_password"],
                    resolve
                );
            });

            const toggle = document.getElementById("toggle-auto-login");
            const startupToggle = document.getElementById("toggle-auto-login-startup");
            const usernameInput = document.getElementById("autoLoginUsername");
            const passwordInput = document.getElementById("autoLoginPassword");

            if (toggle) toggle.checked = false;
            if (startupToggle) startupToggle.checked = false;
            if (usernameInput) usernameInput.value = "";
            if (passwordInput) passwordInput.value = "";

            this._showAutoLoginStatus("Đã xoá thông tin đăng nhập", "cleared");
            console.log("[Settings] Auto-login credentials cleared");
        } catch (e) {
            console.error("[Settings] Failed to clear auto-login:", e);
        }
    },

    /**
     * Show auto-login status message
     */
    _showAutoLoginStatus(message, type) {
        const el = document.getElementById("autoLoginStatus");
        if (!el) return;
        el.textContent = message;
        el.className = "auto-login-status show status-" + type;

        // Auto-hide after 5s for non-saved statuses
        if (type !== "saved") {
            setTimeout(() => {
                el.classList.remove("show");
            }, 5000);
        }
    },

    /**
     * Initialize settings event listeners
     */
    init() {
        document.getElementById("btnSaveSettings")?.addEventListener("click", () => this.saveSettingsUI());
        document.getElementById("btnTestNotify")?.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "TEST_NOTIFY" }, (response) => {
                if (chrome.runtime.lastError) {
                    window.Toast?.error("Lỗi kết nối background service");
                    return;
                }
                if (response?.ok) {
                    window.Toast?.success("Hệ thống thông báo hoạt động bình thường!");
                } else {
                    window.Toast?.warning("Không nhận được phản hồi");
                }
            });
        });

        // Auto-save page style toggles on change (instant feedback)
        this.PAGE_STYLE_KEYS.forEach((key) => {
            document.getElementById("toggle-style-" + key)?.addEventListener("change", () => {
                this.savePageStyleToggles();
            });
        });

        // Auto-save feature toggles on change
        this.FEATURE_KEYS.forEach((key) => {
            document.getElementById("toggle-feature-" + key)?.addEventListener("change", () => {
                this.saveFeatureToggles();
            });
        });

        // Auto-login event listeners
        document.getElementById("btnSaveAutoLogin")?.addEventListener("click", () => this.saveAutoLoginCredentials());
        document.getElementById("btnClearAutoLogin")?.addEventListener("click", () => this.clearAutoLoginCredentials());

        // Auto-login toggle — save state immediately on change
        document.getElementById("toggle-auto-login")?.addEventListener("change", (e) => {
            chrome.storage.local.set({ auto_login_enabled: e.target.checked });
        });

        // Auto-login on startup toggle
        document.getElementById("toggle-auto-login-startup")?.addEventListener("change", (e) => {
            chrome.storage.local.set({ auto_login_on_startup: e.target.checked });
        });

        // Password visibility toggle
        document.getElementById("btnTogglePassword")?.addEventListener("click", () => {
            const input = document.getElementById("autoLoginPassword");
            const btn = document.getElementById("btnTogglePassword");
            if (input) {
                const isPassword = input.type === "password";
                input.type = isPassword ? "text" : "password";
                if (btn) btn.textContent = isPassword ? "🙈" : "👁️";
            }
        });
    },
};

// Expose globally for backward compatibility
window.SettingsService = SettingsService;
window.DEFAULT_CFG = SettingsService.DEFAULT_CFG;
window.loadSettingsUI = () => SettingsService.loadSettingsUI();
window.saveSettingsUI = () => SettingsService.saveSettingsUI();

