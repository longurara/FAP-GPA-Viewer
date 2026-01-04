// ===============================
// API Module - Network & FAP API Functions
// ===============================

const ApiService = {
    // Default URLs for FAP
    DEFAULT_URLS: {
        transcript: "https://fap.fpt.edu.vn/Grade/StudentTranscript.aspx",
        scheduleOfWeek: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx",
        examSchedule: "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx",
        student: "https://fap.fpt.edu.vn/Student.aspx",
        home: "https://fap.fpt.edu.vn/",
    },

    /**
     * Wait for tab to complete loading
     * @param {number} tabId - Chrome tab ID
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<boolean>} - True if completed, false if timeout
     */
    async waitForTabComplete(tabId, timeoutMs = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const tab = await chrome.tabs.get(tabId);
            if (tab.status === "complete") return true;
            await new Promise((r) => setTimeout(r, 150));
        }
        return false;
    },

    /**
     * Fetch URL via content script to stay in first-party context
     * @param {string} url - URL to fetch
     * @returns {Promise<Object|null>} - Response object or null
     */
    async fetchViaContentScript(url) {
        const parsedUrl = new URL(url);
        const targetOrigin = parsedUrl.origin;

        // Prefer an existing FAP tab to reuse logged-in session
        const tabs = await chrome.tabs.query({ url: `${targetOrigin}/*`, status: "complete" });
        let tabId;
        let createdTab = false;

        if (tabs && tabs.length > 0) {
            tabId = tabs[0].id;
        } else {
            const tab = await chrome.tabs.create({ url: targetOrigin, active: false });
            tabId = tab.id;
            createdTab = true;
            await this.waitForTabComplete(tabId);
        }

        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            args: [url],
            func: async (targetUrl) => {
                try {
                    const res = await fetch(targetUrl, { credentials: "include" });
                    const text = await res.text();
                    return { status: res.status, redirected: res.redirected, url: res.url, text };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        });

        if (createdTab) {
            await chrome.tabs.remove(tabId);
        }

        if (!result || !result.result) return null;
        return result.result;
    },

    /**
     * Check if document looks like a login page
     * @param {Document} doc - Parsed HTML document
     * @returns {boolean} - True if it's a login page
     */
    looksLikeLoginPage(doc) {
        if (!doc) return true;
        const title = (doc.querySelector("title")?.textContent || "").toLowerCase();
        if (title.includes("login") || title.includes("dang nh?p")) return true;
        const bodyText = (doc.body?.textContent || "").slice(0, 500).toLowerCase();
        if (bodyText.includes("login") || bodyText.includes("dang nh?p")) return true;
        return false;
    },

    /**
     * Fetch and parse HTML from URL
     * @param {string} url - URL to fetch
     * @returns {Promise<Document|null>} - Parsed document or null
     */
    async fetchHTML(url) {
        try {
            // Prefer content-script fetch first to stay in first-party context (avoid 403)
            const csResult = await this.fetchViaContentScript(url);
            if (csResult?.text) {
                const doc = new DOMParser().parseFromString(csResult.text, "text/html");
                if (!this.looksLikeLoginPage(doc)) {
                    return doc;
                }
            }

            // Fallback to direct fetch
            const res = await fetch(url, { credentials: "include", redirect: "follow" });
            if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)) {
                await window.STORAGE?.set({ show_login_banner: true });
                return null;
            }
            if (res.status === 401 || res.status === 403) {
                await window.STORAGE?.set({ show_login_banner: true });
                return null;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            if (this.looksLikeLoginPage(doc)) {
                await window.STORAGE?.set({ show_login_banner: true });
                return null;
            }
            return doc;
        } catch (error) {
            console.error("fetchHTML error:", error);
            await window.STORAGE?.set({ show_login_banner: true });
            return null;
        }
    },
};

// Expose globally for backward compatibility
window.ApiService = ApiService;
window.DEFAULT_URLS = ApiService.DEFAULT_URLS;
window.waitForTabComplete = (tabId, timeoutMs) => ApiService.waitForTabComplete(tabId, timeoutMs);
window.fetchViaContentScript = (url) => ApiService.fetchViaContentScript(url);
window.looksLikeLoginPage = (doc) => ApiService.looksLikeLoginPage(doc);
window.fetchHTML = (url) => ApiService.fetchHTML(url);
