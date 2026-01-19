// ===============================
// Login Module - Login Status & Banner
// ===============================

const LoginService = {
    // Cache duration: 30 minutes
    LOGIN_CHECK_CACHE_MS: 30 * 60 * 1000,

    /**
     * Update login status display (dot indicator)
     * @param {boolean} isLoggedIn - Whether user is logged in
     * @param {boolean} isChecking - Whether currently checking status
     */
    updateLoginStatusDisplay(isLoggedIn, isChecking = false) {
        const dot = document.getElementById("statusDot");
        const container = document.getElementById("loginStatusIndicator");
        if (!dot) return;

        // Remove old classes
        dot.classList.remove("logged-in", "logged-out", "checking");

        if (isChecking) {
            dot.classList.add("checking");
            if (container) container.title = "Đang kiểm tra đăng nhập...";
        } else if (isLoggedIn) {
            dot.classList.add("logged-in");
            if (container) container.title = "Đã đăng nhập FAP";
        } else {
            dot.classList.add("logged-out");
            if (container) container.title = "Chưa đăng nhập (Click để mở FAP, dữ liệu có thể cũ)";
        }
    },

    /**
     * Actively check if user is logged into FAP
     * Uses cached status if checked recently (within 30 min)
     * @param {boolean} forceCheck - Force network check, ignore cache
     * @returns {Promise<boolean>} - True if logged in
     */
    async checkLoginStatus(forceCheck = false) {
        // Check if we should use cached status (skip network check)
        if (!forceCheck) {
            const lastCheck = await window.STORAGE?.get("last_login_check_ts", 0);
            const cachedStatus = await window.STORAGE?.get("cached_login_status", null);
            const now = Date.now();

            // If checked recently (within 30 min) and have cached status, use it
            if (cachedStatus !== null && lastCheck > 0 && (now - lastCheck) < this.LOGIN_CHECK_CACHE_MS) {
                console.log("[Login] Using cached status:", cachedStatus, "age:", Math.round((now - lastCheck) / 1000), "s");
                this.updateLoginStatusDisplay(cachedStatus, false);
                return cachedStatus;
            }
        }

        // Show checking status
        this.updateLoginStatusDisplay(false, true);
        console.log("[Login] Performing network check for login status...");

        try {
            const testUrl = "https://fap.fpt.edu.vn/Student.aspx";
            const csResult = await window.fetchViaContentScript(testUrl);

            const doc = csResult?.text &&
                new DOMParser().parseFromString(csResult.text, "text/html");

            if (!doc || window.looksLikeLoginPage(doc)) {
                await window.STORAGE?.set({
                    show_login_banner: true,
                    last_login_check_ts: Date.now(),
                    cached_login_status: false
                });
                this.updateLoginStatusDisplay(false, false);
                return false;
            }

            await window.STORAGE?.set({
                show_login_banner: false,
                last_successful_fetch: Date.now(),
                last_login_check_ts: Date.now(),
                cached_login_status: true
            });
            this.updateLoginStatusDisplay(true, false);
            return true;
        } catch (error) {
            // On error, assume we need to login
            await window.STORAGE?.set({
                show_login_banner: true,
                last_login_check_ts: Date.now(),
                cached_login_status: false
            });
            this.updateLoginStatusDisplay(false, false);
            return false;
        }
    },

    /**
     * Force check login status (ignores cache)
     * Used when user explicitly requests refresh
     * @returns {Promise<boolean>} - True if logged in
     */
    async forceCheckLoginStatus() {
        return this.checkLoginStatus(true);
    },

    /**
     * Show login banner
     */
    showLoginBanner() {
        const banner = document.getElementById("loginBanner");
        if (banner) {
            banner.style.display = "block";
            banner.classList.add("slideDown");
        }
    },

    /**
     * Hide login banner
     */
    hideLoginBanner() {
        const banner = document.getElementById("loginBanner");
        if (banner) {
            banner.style.display = "none";
            banner.classList.remove("slideDown");
        }
    },

    /**
     * Check and show login banner if needed
     */
    async checkAndShowLoginBanner() {
        try {
            // Only show banner if explicitly flagged (from failed fetch)
            const showBanner = await window.STORAGE?.get("show_login_banner", false);

            if (showBanner) {
                this.showLoginBanner();
            } else {
                this.hideLoginBanner();
            }
        } catch (error) {
            console.error("[Login] Error checking login banner:", error);
        }
    },

    /**
     * Handle login now button click
     */
    async handleLoginNow() {
        try {
            const loginUrl = "https://fap.fpt.edu.vn/";
            chrome.tabs.create({ url: loginUrl });
            this.hideLoginBanner();
            await window.STORAGE?.set({ show_login_banner: false });

            // Check login status after a delay to see if user logged in
            setTimeout(async () => {
                await this.checkLoginStatus();
                await this.checkAndShowLoginBanner();
            }, 3000);
        } catch (error) {
            console.error("[Login] Error handling login:", error);
        }
    },

    /**
     * Handle dismiss banner button click
     */
    async handleDismissBanner() {
        this.hideLoginBanner();
        await window.STORAGE?.set({ show_login_banner: false });
    },

    /**
     * Show login notification (disabled)
     */
    showLoginNotification() {
        // notifications removed
    },

    /**
     * Initialize login banner event listeners
     */
    init() {
        const btnLoginNow = document.getElementById("btnLoginNow");
        const btnDismissBanner = document.getElementById("btnDismissBanner");

        if (btnLoginNow) {
            btnLoginNow.addEventListener("click", () => this.handleLoginNow());
        }
        if (btnDismissBanner) {
            btnDismissBanner.addEventListener("click", () => this.handleDismissBanner());
        }
    },
};

// Expose globally for backward compatibility
window.LoginService = LoginService;
window.checkLoginStatus = () => LoginService.checkLoginStatus();
window.forceCheckLoginStatus = () => LoginService.forceCheckLoginStatus();
window.checkAndShowLoginBanner = () => LoginService.checkAndShowLoginBanner();
window.showLoginBanner = () => LoginService.showLoginBanner();
window.hideLoginBanner = () => LoginService.hideLoginBanner();
window.handleLoginNow = () => LoginService.handleLoginNow();
window.handleDismissBanner = () => LoginService.handleDismissBanner();
window.updateLoginStatusDisplay = (a, b) => LoginService.updateLoginStatusDisplay(a, b);
window.showLoginNotification = () => LoginService.showLoginNotification();

