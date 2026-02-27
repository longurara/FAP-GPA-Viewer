// ===============================
// Storage Module - Chrome Storage & Caching
// ===============================

// In-memory cache to avoid redundant IPC calls for frequently read keys
const _memCache = new Map();

const StorageService = {
    /**
     * Get value from chrome.storage.local (with in-memory cache)
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {Promise<*>}
     */
    async get(key, defaultValue) {
        if (_memCache.has(key)) return _memCache.get(key);
        return new Promise((resolve) => {
            chrome.storage.local.get({ [key]: defaultValue }, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Storage] get error:", chrome.runtime.lastError.message);
                    resolve(defaultValue);
                    return;
                }
                // Guard: If set() was called while this async read was in-flight,
                // the mem cache already has the newer value — don't overwrite it.
                if (!_memCache.has(key)) {
                    _memCache.set(key, result[key]);
                }
                resolve(_memCache.has(key) ? _memCache.get(key) : result[key]);
            });
        });
    },

    /**
     * Get multiple values in a single IPC call
     * @param {Object} keysWithDefaults - { key1: default1, key2: default2, ... }
     * @returns {Promise<Object>} - { key1: value1, key2: value2, ... }
     */
    async getMultiple(keysWithDefaults) {
        // Check if all keys are in mem cache
        const keys = Object.keys(keysWithDefaults);
        const allCached = keys.every((k) => _memCache.has(k));
        if (allCached) {
            const result = {};
            for (const k of keys) result[k] = _memCache.get(k);
            return result;
        }

        return new Promise((resolve) => {
            chrome.storage.local.get(keysWithDefaults, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Storage] getMultiple error:", chrome.runtime.lastError.message);
                    resolve(keysWithDefaults);
                    return;
                }
                // Update mem cache (only for keys not updated by set() during this read)
                for (const k of keys) {
                    if (!_memCache.has(k)) {
                        _memCache.set(k, result[k]);
                    } else {
                        // Use the fresher mem cache value in the result
                        result[k] = _memCache.get(k);
                    }
                }
                resolve(result);
            });
        });
    },

    /**
     * Set value(s) in chrome.storage.local
     * @param {Object} obj - Key-value pairs to store
     * @returns {Promise<void>}
     */
    async set(obj) {
        // Update mem cache immediately
        for (const key of Object.keys(obj)) {
            _memCache.set(key, obj[key]);
        }
        return new Promise((resolve) => {
            chrome.storage.local.set(obj, () => {
                if (chrome.runtime.lastError) {
                    console.warn("[Storage] set error:", chrome.runtime.lastError.message);
                }
                resolve();
            });
        });
    },

    /**
     * Remove key(s) from chrome.storage.local
     * @param {string|string[]} keys - Key(s) to remove
     * @returns {Promise<void>}
     */
    async remove(keys) {
        // Invalidate mem cache
        const keyArr = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArr) {
            _memCache.delete(k);
        }
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    console.warn("[Storage] remove error:", chrome.runtime.lastError.message);
                }
                resolve();
            });
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

// Invalidate in-memory cache when storage changes from another context
// (e.g. background.js writes transcript data → popup's _memCache for that key must be cleared)
try {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        for (const key of Object.keys(changes)) {
            if (_memCache.has(key)) {
                _memCache.set(key, changes[key].newValue);
            }
        }
    });
} catch (_) { /* storage.onChanged not available in all contexts */ }

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

// Time constants (standardized TTLs)
const TIME_CONSTANTS = {
    DAY_MS: 24 * 60 * 60 * 1000,
    HOUR_MS: 60 * 60 * 1000,
    MINUTE_MS: 60 * 1000,
    CACHE_TTL_TRANSCRIPT: 30 * 60 * 1000, // 30 minutes (standardized)
    CACHE_TTL_ATTENDANCE: 10 * 60 * 1000, // 10 minutes
    CACHE_TTL_TODAY: 4 * 60 * 60 * 1000,  // 4 hours
    CACHE_TTL_EXAMS: 24 * 60 * 60 * 1000, // 24 hours
    CACHE_TTL_LMS: 30 * 60 * 1000,        // 30 minutes
    CACHE_TTL_LOGIN: 2 * 60 * 1000,       // 2 minutes for login check
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
    getMultiple: (obj) => StorageService.getMultiple(obj),
};

// Expose cache functions globally
window.cacheGet = (key, maxAgeMs) => StorageService.cacheGet(key, maxAgeMs);
window.cacheSet = (key, data) => StorageService.cacheSet(key, data);

// Time constant
window.DAY_MS = TIME_CONSTANTS.DAY_MS;
