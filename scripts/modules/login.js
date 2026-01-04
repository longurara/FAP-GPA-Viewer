// ===============================
// Login Module - Login Status & Banner
// ===============================

const LoginService = {
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
     * @returns {Promise<boolean>} - True if logged in
     */
    async checkLoginStatus() {
        // Show checking status
        this.updateLoginStatusDisplay(false, true);

        try {
            const testUrl = "https://fap.fpt.edu.vn/Student.aspx";
            const csResult = await window.fetchViaContentScript(testUrl);

            const doc = csResult?.text &&
                new DOMParser().parseFromString(csResult.text, "text/html");

            if (!doc || window.looksLikeLoginPage(doc)) {
                await window.STORAGE?.set({ show_login_banner: true });
                this.updateLoginStatusDisplay(false, false);
                return false;
            }

            await window.STORAGE?.set({
                show_login_banner: false,
                last_successful_fetch: Date.now(),
            });
            this.updateLoginStatusDisplay(true, false);
            return true;
        } catch (error) {
            // On error, assume we need to login
            await window.STORAGE?.set({ show_login_banner: true });
            this.updateLoginStatusDisplay(false, false);
            return false;
        }
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
        // Check multiple indicators to determine if login is needed
        const showBanner = await window.STORAGE?.get("show_login_banner", false);
        const lastFetchTime = await window.STORAGE?.get("last_successful_fetch", 0);
        const now = Date.now();

        // Show banner if:
        // 1. Flag is explicitly set to true, OR
        // 2. No successful fetch in the last 10 minutes (likely means login expired)
        const shouldShow =
            showBanner || (lastFetchTime > 0 && now - lastFetchTime > 10 * 60 * 1000);

        if (shouldShow) {
            this.showLoginBanner();
        } else {
            this.hideLoginBanner();
        }
    },

    /**
     * Handle login now button click
     */
    async handleLoginNow() {
        const loginUrl = "https://fap.fpt.edu.vn/";
        chrome.tabs.create({ url: loginUrl });
        this.hideLoginBanner();
        await window.STORAGE?.set({ show_login_banner: false });

        // Check login status after a delay to see if user logged in
        setTimeout(async () => {
            await this.checkLoginStatus();
            await this.checkAndShowLoginBanner();
        }, 3000);
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
window.checkAndShowLoginBanner = () => LoginService.checkAndShowLoginBanner();
window.showLoginBanner = () => LoginService.showLoginBanner();
window.hideLoginBanner = () => LoginService.hideLoginBanner();
window.handleLoginNow = () => LoginService.handleLoginNow();
window.handleDismissBanner = () => LoginService.handleDismissBanner();
window.updateLoginStatusDisplay = (a, b) => LoginService.updateLoginStatusDisplay(a, b);
window.showLoginNotification = () => LoginService.showLoginNotification();
