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
    FEATURE_KEYS: ["moveclass", "thongbao_skip"],

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

        // Load auto-login settings (FeID + LMS)
        this.loadAutoLoginUI();
    },

    /**
     * Load page style toggle states from storage
     */
    async loadPageStyleToggles() {
        try {
            // NEW #5 FIX: Use window.STORAGE wrapper instead of raw chrome.storage.local
            // to benefit from in-memory cache and consistent error handling.
            const styles = await window.STORAGE?.get("page_styles", {}) || {};

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

        // NEW #5 FIX: Use window.STORAGE wrapper
        await window.STORAGE?.set({ page_styles: styles });
    },

    /**
     * Load feature toggle states from storage
     */
    async loadFeatureToggles() {
        try {
            // NEW #5 FIX: Use window.STORAGE wrapper
            const features = await window.STORAGE?.get("feature_toggles", {}) || {};

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

        // NEW #5 FIX: Use window.STORAGE wrapper
        await window.STORAGE?.set({ feature_toggles: features });
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

    // ========== Credential Encryption (AES-GCM) ==========

    /**
     * Encrypt credentials for storage (AES-GCM via CredentialCrypto)
     */
    async _encodeCredential(str) {
        if (window.CredentialCrypto) return await window.CredentialCrypto.encrypt(str);
        // Fallback if crypto module not loaded
        try { return btoa(unescape(encodeURIComponent(str))); }
        catch { return ""; }
    },

    /**
     * Decrypt credentials from storage (auto-migrates from Base64)
     */
    async _decodeCredential(str) {
        if (window.CredentialCrypto) return await window.CredentialCrypto.decrypt(str);
        // Fallback
        try { return decodeURIComponent(escape(atob(str))); }
        catch { return ""; }
    },

    // ========== FeID Auto-Login ==========

    /**
     * Save FeID auto-login credentials
     */
    async saveAutoLoginCredentials() {
        const username = document.getElementById("autoLoginUsername")?.value?.trim();
        const password = document.getElementById("autoLoginPassword")?.value;

        if (!username || !password) {
            this._showAutoLoginStatus("Vui lòng nhập đầy đủ username và mật khẩu", "error");
            return;
        }

        try {
            const [encUser, encPass] = await Promise.all([
                this._encodeCredential(username),
                this._encodeCredential(password),
            ]);
            await new Promise((resolve) => {
                chrome.storage.local.set({
                    auto_login_enabled: document.getElementById("toggle-auto-login")?.checked ?? true,
                    auto_login_username: encUser,
                    auto_login_password: encPass,
                }, resolve);
            });
            this._showAutoLoginStatus("✓ Đã lưu thông tin đăng nhập FeID", "saved");
            console.log("[Settings] FeID auto-login credentials saved for:", username);
        } catch (e) {
            console.error("[Settings] Failed to save FeID auto-login:", e);
            this._showAutoLoginStatus("Lỗi khi lưu thông tin", "error");
        }
    },

    /**
     * Load FeID + LMS auto-login UI state from storage
     */
    async loadAutoLoginUI() {
        // Load FeID
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

            if (usernameInput && data.auto_login_username) {
                usernameInput.value = await this._decodeCredential(data.auto_login_username);
            }

            if (data.auto_login_username && data.auto_login_password) {
                this._showAutoLoginStatus("✓ Đã lưu thông tin đăng nhập FeID", "saved");
            }
        } catch (e) {
            console.warn("[Settings] Failed to load FeID auto-login settings:", e);
        }

        // Load LMS
        this.loadAutoLoginLmsUI();
    },

    /**
     * Clear FeID auto-login credentials
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

            this._showAutoLoginStatus("Đã xoá thông tin đăng nhập FeID", "cleared");
            console.log("[Settings] FeID auto-login credentials cleared");
        } catch (e) {
            console.error("[Settings] Failed to clear FeID auto-login:", e);
        }
    },

    /**
     * Show FeID auto-login status message
     */
    _showAutoLoginStatus(message, type) {
        const el = document.getElementById("autoLoginStatus");
        if (!el) return;
        el.textContent = message;
        el.className = "auto-login-status show status-" + type;
        if (type !== "saved") {
            setTimeout(() => { el.classList.remove("show"); }, 5000);
        }
    },

    // ========== LMS Auto-Login ==========

    /**
     * Save LMS auto-login credentials
     */
    async saveAutoLoginLmsCredentials() {
        const username = document.getElementById("autoLoginLmsUsername")?.value?.trim();
        const password = document.getElementById("autoLoginLmsPassword")?.value;

        if (!username || !password) {
            this._showAutoLoginLmsStatus("Vui lòng nhập đầy đủ username và mật khẩu", "error");
            return;
        }

        try {
            const [encUser, encPass] = await Promise.all([
                this._encodeCredential(username),
                this._encodeCredential(password),
            ]);
            await new Promise((resolve) => {
                chrome.storage.local.set({
                    auto_login_lms_enabled: document.getElementById("toggle-auto-login-lms")?.checked ?? true,
                    auto_login_lms_username: encUser,
                    auto_login_lms_password: encPass,
                }, resolve);
            });
            this._showAutoLoginLmsStatus("✓ Đã lưu thông tin đăng nhập LMS", "saved");
            console.log("[Settings] LMS auto-login credentials saved for:", username);
        } catch (e) {
            console.error("[Settings] Failed to save LMS auto-login:", e);
            this._showAutoLoginLmsStatus("Lỗi khi lưu thông tin", "error");
        }
    },

    /**
     * Load LMS auto-login UI state from storage
     */
    async loadAutoLoginLmsUI() {
        try {
            const data = await new Promise((resolve) => {
                chrome.storage.local.get(
                    ["auto_login_lms_enabled", "auto_login_lms_startup", "auto_login_lms_username", "auto_login_lms_password"],
                    (result) => resolve(result)
                );
            });

            const toggle = document.getElementById("toggle-auto-login-lms");
            const startupToggle = document.getElementById("toggle-auto-login-lms-startup");
            const usernameInput = document.getElementById("autoLoginLmsUsername");

            if (toggle) toggle.checked = data.auto_login_lms_enabled === true;
            if (startupToggle) startupToggle.checked = data.auto_login_lms_startup === true;

            if (usernameInput && data.auto_login_lms_username) {
                usernameInput.value = await this._decodeCredential(data.auto_login_lms_username);
            }

            if (data.auto_login_lms_username && data.auto_login_lms_password) {
                this._showAutoLoginLmsStatus("✓ Đã lưu thông tin đăng nhập LMS", "saved");
            }
        } catch (e) {
            console.warn("[Settings] Failed to load LMS auto-login settings:", e);
        }
    },

    /**
     * Clear LMS auto-login credentials
     */
    async clearAutoLoginLmsCredentials() {
        try {
            await new Promise((resolve) => {
                chrome.storage.local.remove(
                    ["auto_login_lms_enabled", "auto_login_lms_startup", "auto_login_lms_username", "auto_login_lms_password"],
                    resolve
                );
            });

            const toggle = document.getElementById("toggle-auto-login-lms");
            const startupToggle = document.getElementById("toggle-auto-login-lms-startup");
            const usernameInput = document.getElementById("autoLoginLmsUsername");
            const passwordInput = document.getElementById("autoLoginLmsPassword");

            if (toggle) toggle.checked = false;
            if (startupToggle) startupToggle.checked = false;
            if (usernameInput) usernameInput.value = "";
            if (passwordInput) passwordInput.value = "";

            this._showAutoLoginLmsStatus("Đã xoá thông tin đăng nhập LMS", "cleared");
            console.log("[Settings] LMS auto-login credentials cleared");
        } catch (e) {
            console.error("[Settings] Failed to clear LMS auto-login:", e);
        }
    },

    /**
     * Show LMS auto-login status message
     */
    _showAutoLoginLmsStatus(message, type) {
        const el = document.getElementById("autoLoginLmsStatus");
        if (!el) return;
        el.textContent = message;
        el.className = "auto-login-status show status-" + type;
        if (type !== "saved") {
            setTimeout(() => { el.classList.remove("show"); }, 5000);
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

        // ===== FeID auto-login event listeners =====
        document.getElementById("btnSaveAutoLogin")?.addEventListener("click", () => this.saveAutoLoginCredentials());
        document.getElementById("btnClearAutoLogin")?.addEventListener("click", () => this.clearAutoLoginCredentials());

        document.getElementById("toggle-auto-login")?.addEventListener("change", (e) => {
            chrome.storage.local.set({ auto_login_enabled: e.target.checked });
        });
        document.getElementById("toggle-auto-login-startup")?.addEventListener("change", (e) => {
            chrome.storage.local.set({ auto_login_on_startup: e.target.checked });
        });
        document.getElementById("btnTogglePassword")?.addEventListener("click", () => {
            const input = document.getElementById("autoLoginPassword");
            const btn = document.getElementById("btnTogglePassword");
            if (input) {
                const isPassword = input.type === "password";
                input.type = isPassword ? "text" : "password";
                if (btn) btn.textContent = isPassword ? "🙈" : "👁️";
            }
        });

        // ===== LMS auto-login event listeners =====
        document.getElementById("btnSaveAutoLoginLms")?.addEventListener("click", () => this.saveAutoLoginLmsCredentials());
        document.getElementById("btnClearAutoLoginLms")?.addEventListener("click", () => this.clearAutoLoginLmsCredentials());

        document.getElementById("toggle-auto-login-lms")?.addEventListener("change", (e) => {
            chrome.storage.local.set({ auto_login_lms_enabled: e.target.checked });
        });
        document.getElementById("toggle-auto-login-lms-startup")?.addEventListener("change", (e) => {
            chrome.storage.local.set({ auto_login_lms_startup: e.target.checked });
        });
        document.getElementById("btnToggleLmsPassword")?.addEventListener("click", () => {
            const input = document.getElementById("autoLoginLmsPassword");
            const btn = document.getElementById("btnToggleLmsPassword");
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
