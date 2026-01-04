// ===============================
// Utils Module - DOM & String Helpers
// ===============================

const Utils = {
    /**
     * Query selector shorthand
     * @param {string} sel - CSS selector
     * @returns {Element|null}
     */
    $(sel) {
        return document.querySelector(sel);
    },

    /**
     * Set text content of element by selector
     * @param {string} selector - CSS selector
     * @param {string|number} value - Value to set
     */
    setValue(selector, value) {
        const el = document.querySelector(selector);
        if (el) el.textContent = value;
    },

    /**
     * Convert text to number, extracting first numeric value
     * @param {string} txt - Text containing number
     * @returns {number} - Parsed number or NaN
     */
    toNum(txt) {
        const m = (txt || "").match(/-?\d+(?:[.,]\d+)?/);
        return m ? parseFloat(m[0].replace(",", ".")) : NaN;
    },

    /**
     * Normalize string: trim, uppercase, collapse whitespace
     * @param {string} s - Input string
     * @returns {string} - Normalized string
     */
    NORM(s) {
        return (s || "").replace(/\s+/g, " ").trim().toUpperCase();
    },

    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} - Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Convert day code to Vietnamese
     * @param {string} day - Day code (MON, TUE, etc.)
     * @returns {string} - Vietnamese day name
     */
    dayToVietnamese(day) {
        const map = {
            MON: "Thứ 2",
            TUE: "Thứ 3",
            WED: "Thứ 4",
            THU: "Thứ 5",
            FRI: "Thứ 6",
            SAT: "Thứ 7",
            SUN: "Chủ nhật",
        };
        return map[day] || day;
    },
};

// Expose globally for backward compatibility
window.Utils = Utils;

// Also expose individual functions for existing code compatibility
window.$ = window.$ || Utils.$;
window.setValue = window.setValue || Utils.setValue;
window.toNum = window.toNum || Utils.toNum;
window.NORM = window.NORM || Utils.NORM;
window.debounce = window.debounce || Utils.debounce;
window.dayToVietnamese = window.dayToVietnamese || Utils.dayToVietnamese;
