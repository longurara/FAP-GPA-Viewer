/**
 * LMS Login Page - Auto-Login
 * Automatically fills credentials and submits login form on lms-hcm.fpt.edu.vn
 * Uses separate LMS credentials stored by the extension.
 *
 * Approach: Extract logintoken + hidden fields from page, then POST via hidden form.
 */
(function () {
    "use strict";

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _tryAutoLogin);
    } else {
        setTimeout(_tryAutoLogin, 300);
    }

    function _tryAutoLogin() {
        if (sessionStorage.getItem("lms_auto_login_attempted")) return;

        chrome.storage.local.get(
            ["auto_login_lms_enabled", "auto_login_lms_username", "auto_login_lms_password"],
            function (data) {
                if (!data.auto_login_lms_enabled) return;
                if (!data.auto_login_lms_username || !data.auto_login_lms_password) return;

                let username, password;
                try {
                    username = decodeURIComponent(escape(atob(data.auto_login_lms_username)));
                    password = decodeURIComponent(escape(atob(data.auto_login_lms_password)));
                } catch (e) { return; }
                if (!username || !password) return;

                sessionStorage.setItem("lms_auto_login_attempted", "true");
                _submitLogin(username, password);
            }
        );
    }

    /**
     * Submit login by creating a hidden form with all required fields
     * copied from the original Moodle form, then submitting it.
     */
    function _submitLogin(username, password) {
        const existingForm = document.getElementById("login");
        if (!existingForm) return;

        const form = document.createElement("form");
        form.method = "POST";
        form.action = existingForm.action || window.location.href;
        form.style.display = "none";

        // Copy all hidden inputs from original form (logintoken, anchor, etc.)
        existingForm.querySelectorAll('input[type="hidden"]').forEach(function (el) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = el.name;
            input.value = el.value;
            form.appendChild(input);
        });

        // Add credentials
        const uInput = document.createElement("input");
        uInput.type = "hidden";
        uInput.name = "username";
        uInput.value = username;
        form.appendChild(uInput);

        const pInput = document.createElement("input");
        pInput.type = "hidden";
        pInput.name = "password";
        pInput.value = password;
        form.appendChild(pInput);

        document.body.appendChild(form);
        form.submit();
    }
})();
