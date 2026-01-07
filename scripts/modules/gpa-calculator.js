// ===============================
// GPA Calculator Module
// ===============================

const GPACalculatorService = {
    /**
     * Initialize GPA Calculator with current values
     */
    async initGPACalculator() {
        try {
            const DAY_MS = window.DAY_MS || 24 * 60 * 60 * 1000;
            const cache = await window.cacheGet?.("cache_transcript", DAY_MS);
            if (!cache || !cache.rows) return;

            const excludedCourses = await window.STORAGE?.get("excluded_courses", []) || [];

            // Use centralized computeGPA from utils.js
            const gpa = window.computeGPA(cache.rows, excludedCourses);

            const setValue = window.setValue || ((s, v) => {
                const el = document.querySelector(s);
                if (el) el.textContent = v;
            });

            setValue("#calcCurrentGPA", Number.isFinite(gpa.gpa10) ? gpa.gpa10.toFixed(2) : "--");
            setValue("#calcCurrentCredits", gpa.credits || "--");
        } catch (error) {
            console.error("[GPACalculator] Error initializing:", error);
        }
    },

    /**
     * Calculate required GPA
     */
    calculate() {
        const currentGPA = parseFloat(document.getElementById("calcCurrentGPA")?.textContent || "0");
        const currentCredits = parseFloat(document.getElementById("calcCurrentCredits")?.textContent || "0");
        const targetGPA = parseFloat(document.getElementById("calcTargetGPA")?.value || "0");
        const newCredits = parseFloat(document.getElementById("calcNewCredits")?.value || "0");

        const resultEl = document.getElementById("calcResult");
        if (!resultEl) return;

        if (isNaN(currentGPA) || isNaN(currentCredits) || isNaN(targetGPA) || isNaN(newCredits)) {
            resultEl.textContent = "Nhập đầy đủ!";
            return;
        }

        if (targetGPA < 0 || targetGPA > 10) {
            resultEl.textContent = "GPA 0-10!";
            return;
        }

        // Formula: required_grade = (target_gpa * (current_credits + new_credits) - current_gpa * current_credits) / new_credits
        const requiredGrade = (targetGPA * (currentCredits + newCredits) - currentGPA * currentCredits) / newCredits;

        // Remove old color classes
        resultEl.classList.remove("calc-success", "calc-warning", "calc-error");

        if (requiredGrade > 10) {
            resultEl.textContent = "Không khả thi 😢";
            resultEl.classList.add("calc-error");
        } else {
            resultEl.textContent = requiredGrade.toFixed(2);

            if (requiredGrade < 0) {
                resultEl.classList.add("calc-success");
            } else if (requiredGrade >= 8) {
                resultEl.classList.add("calc-warning");
            } else {
                resultEl.classList.add("calc-success");
            }
        }
    },

    /**
     * Reset calculator
     */
    reset() {
        const targetGPAEl = document.getElementById("calcTargetGPA");
        const newCreditsEl = document.getElementById("calcNewCredits");
        const resultEl = document.getElementById("calcResult");

        if (targetGPAEl) targetGPAEl.value = "";
        if (newCreditsEl) newCreditsEl.value = "3";
        if (resultEl) {
            resultEl.textContent = "--";
            resultEl.classList.remove("calc-success", "calc-warning", "calc-error");
        }
    },

    /**
     * Initialize event listeners
     */
    init() {
        document.getElementById("btnCalculateGPA")?.addEventListener("click", () => this.calculate());
        document.getElementById("btnResetCalc")?.addEventListener("click", () => this.reset());
    },
};

// Expose globally
window.GPACalculatorService = GPACalculatorService;
window.initGPACalculator = () => {
    GPACalculatorService.initGPACalculator();
    GPACalculatorService.init();
};
