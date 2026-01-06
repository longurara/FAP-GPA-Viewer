// ===============================
// Storage Module - Chrome Storage & Caching
// ===============================

const StorageService = {
    /**
     * Get value from chrome.storage.local
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {Promise<*>}
     */
    async get(key, defaultValue) {
        return new Promise((resolve) => {
            chrome.storage.local.get({ [key]: defaultValue }, (result) => {
                resolve(result[key]);
            });
        });
    },

    /**
     * Set value(s) in chrome.storage.local
     * @param {Object} obj - Key-value pairs to store
     * @returns {Promise<void>}
     */
    async set(obj) {
        return new Promise((resolve) => {
            chrome.storage.local.set(obj, resolve);
        });
    },

    /**
     * Remove key(s) from chrome.storage.local
     * @param {string|string[]} keys - Key(s) to remove
     * @returns {Promise<void>}
     */
    async remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, resolve);
        });
    },

    // ========== Cache Helpers ==========

    /**
     * Get cached data if not expired
     * @param {string} key - Cache key
     * @param {number} maxAgeMs - Maximum age in milliseconds
     * @returns {Promise<*|null>} - Cached data or null if expired/missing
     */
    async cacheGet(key, maxAgeMs) {
        const obj = await this.get(key, null);
        if (!obj) return null;
        const { ts, data } = obj;
        if (!ts || Date.now() - ts > maxAgeMs) return null;
        return data;
    },

    /**
     * Set cached data with timestamp
     * @param {string} key - Cache key
     * @param {*} data - Data to cache
     * @returns {Promise<void>}
     */
    async cacheSet(key, data) {
        await this.set({ [key]: { ts: Date.now(), data } });
    },
};

// Storage key constants
const STORAGE_KEYS = {
    TRANSCRIPT: "cache_transcript",
    TRANSCRIPT_FLAT: "cache_transcript_flat",
    ATTENDANCE: "cache_attendance",
    ATTENDANCE_FLAT: "cache_attendance_flat",
    EXAMS: "cache_exams",
    EXAMS_FLAT: "cache_exams_flat",
    CONFIG: "cfg",
    THEME: "theme",
    ACCENT_COLOR: "accent_color",
    BACKGROUND_IMAGE: "background_image",
    BACKGROUND_OPACITY: "background_opacity",
    FRAME_OPACITY: "frame_opacity",
    EXCLUDED_COURSES: "excluded_courses",
    COURSE_NOTES: "course_notes",
    HIDDEN_WIDGETS: "hidden_widgets",
    SHOW_LOGIN_BANNER: "show_login_banner",
    LAST_SUCCESSFUL_FETCH: "last_successful_fetch",
};

// Time constants
const TIME_CONSTANTS = {
    DAY_MS: 24 * 60 * 60 * 1000,
    HOUR_MS: 60 * 60 * 1000,
    MINUTE_MS: 60 * 1000,
    CACHE_TTL_ATTENDANCE: 10 * 60 * 1000, // 10 minutes
    CACHE_TTL_TODAY: 4 * 60 * 60 * 1000,  // 4 hours
};

// Expose globally for backward compatibility
window.StorageService = StorageService;
window.STORAGE_KEYS = STORAGE_KEYS;
window.TIME_CONSTANTS = TIME_CONSTANTS;

// Also add STORAGE as alias for backward compatibility with existing code
window.STORAGE = {
    get: (k, d) => StorageService.get(k, d),
    set: (obj) => StorageService.set(obj),
    remove: (k) => StorageService.remove(k),
};

// Expose cache functions globally
window.cacheGet = (key, maxAgeMs) => StorageService.cacheGet(key, maxAgeMs);
window.cacheSet = (key, data) => StorageService.cacheSet(key, data);

// Time constant
window.DAY_MS = TIME_CONSTANTS.DAY_MS;
