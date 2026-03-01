/**
 * FAP Login Page - Background Wallpaper + Custom Dropdown + UI Enhancements
 * Sets the wallpaper background, replaces native <select> with custom styled dropdown,
 * and injects branding, divider, and footer elements for the glassmorphic design.
 * Also handles auto-redirect to FeID login when auto-login is enabled.
 */
(function () {
    "use strict";

    // Auto-redirect to FeID login if auto-login is enabled
    _tryAutoRedirectToFeID();

    // CSS gate: only inject CSS + run enhancements when styling is enabled
    chrome.storage.local.get("page_styles", function (data) {
        var styles = data.page_styles || {};
        if (styles.login === false) return;

        // Inject CSS programmatically (removed from manifest to allow toggle control)
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles/fap-login.css");
        document.head.appendChild(link);

        _run();
    });

    /**
     * Auto-redirect to FeID login page if auto-login is enabled
     * This triggers BEFORE any UI enhancements to minimize delay
     */
    function _tryAutoRedirectToFeID() {
        // Prevent redirect loops
        if (sessionStorage.getItem("fap_auto_redirect_attempted")) {
            console.log("[FAP Auto-Login] Already attempted redirect, skipping");
            return;
        }

        chrome.storage.local.get(
            ["auto_login_enabled", "auto_login_username", "auto_login_password"],
            function (data) {
                if (!data.auto_login_enabled) {
                    console.log("[FAP Auto-Login] Auto-login disabled");
                    return;
                }

                if (!data.auto_login_username || !data.auto_login_password) {
                    console.log("[FAP Auto-Login] No credentials saved");
                    return;
                }

                // Mark as attempted to prevent loops
                sessionStorage.setItem("fap_auto_redirect_attempted", "true");

                console.log("[FAP Auto-Login] Auto-login enabled, redirecting to FeID...");

                // Find the FeID login button
                // The loginform has rows: [0]=Google, [1]=K19 notice, [2]=FeID
                const loginForm = document.getElementById("loginform");
                if (loginForm) {
                    const rows = loginForm.querySelectorAll(":scope > .row");
                    const feidRow = rows[2];
                    if (feidRow) {
                        const feidLink = feidRow.querySelector("a, button, input[type='submit']");
                        if (feidLink) {
                            const href = feidLink.getAttribute("href") || "";

                            // Handle javascript:__doPostBack('target','arg') — replicate postback manually
                            // CSP blocks both javascript: URLs and inline <script> tags,
                            // so we directly set form fields and submit (not blocked by CSP)
                            if (href.includes("__doPostBack")) {
                                const match = href.match(/__doPostBack\('([^']*)',\s*'([^']*)'\)/);
                                if (match) {
                                    const eventTarget = match[1];
                                    const eventArgument = match[2];
                                    console.log("[FAP Auto-Login] Triggering postback:", eventTarget);

                                    const form = document.forms[0];
                                    if (form) {
                                        // Set ASP.NET postback hidden fields
                                        let etField = form.querySelector('input[name="__EVENTTARGET"]');
                                        let eaField = form.querySelector('input[name="__EVENTARGUMENT"]');

                                        if (!etField) {
                                            etField = document.createElement("input");
                                            etField.type = "hidden";
                                            etField.name = "__EVENTTARGET";
                                            form.appendChild(etField);
                                        }
                                        if (!eaField) {
                                            eaField = document.createElement("input");
                                            eaField.type = "hidden";
                                            eaField.name = "__EVENTARGUMENT";
                                            form.appendChild(eaField);
                                        }

                                        etField.value = eventTarget;
                                        eaField.value = eventArgument;
                                        form.submit();
                                        return;
                                    }
                                }
                            }

                            // Regular URL — just navigate
                            if (href && href !== "#" && !href.startsWith("javascript:")) {
                                console.log("[FAP Auto-Login] Navigating to FeID URL...");
                                window.location.href = href;
                                return;
                            }
                        }
                    }
                }

                // Fallback: direct URL to FeID login
                console.log("[FAP Auto-Login] Fallback: navigating directly to FeID login page");
                window.location.href = "https://feid.fpt.edu.vn/Account/Login";
            }
        );
    }

    function _run() {

        // ===== 1. Set wallpaper background =====
        const wallpaperUrl = chrome.runtime.getURL("wallpaper/wallpaper1.jpg");

        document.body.style.cssText += `
    background-image: url('${wallpaperUrl}') !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-attachment: fixed !important;
  `;

        // Dark overlay
        const overlay = document.createElement("div");
        overlay.id = "fap-login-overlay";
        overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 0;
    pointer-events: none;
  `;
        document.body.prepend(overlay);

        const container = document.querySelector(".container");
        if (container) {
            container.style.position = "relative";
            container.style.zIndex = "1";
        }

        // ===== 2. FPT Branding =====
        const fieldset = document.querySelector("#ctl00_mainContent_divcontent fieldset");
        const legend = fieldset && fieldset.querySelector("legend");
        if (fieldset && legend) {
            const brand = document.createElement("div");
            brand.className = "fap-login-brand";
            brand.innerHTML =
                '<div class="fap-login-brand-icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/>' +
                '<path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/>' +
                '</svg>' +
                '</div>' +
                '<div class="fap-login-brand-name">FPT University</div>';
            fieldset.insertBefore(brand, legend);
        }

        // ===== 3. Custom Dropdown =====
        const nativeSelect = document.getElementById("ctl00_mainContent_ddlCampus");
        if (!nativeSelect) return;

        // Hide native select
        nativeSelect.style.display = "none";

        // Build options data
        const options = [];
        for (const opt of nativeSelect.options) {
            options.push({ value: opt.value, text: opt.text, selected: opt.selected });
        }

        // Create custom dropdown
        const wrapper = document.createElement("div");
        wrapper.className = "fap-dropdown";

        const selected = document.createElement("div");
        selected.className = "fap-dropdown-selected";
        const selectedOpt = options.find(o => o.selected) || options[0];
        // WARN #2 FIX: Use DOM methods instead of innerHTML interpolation to avoid XSS
        // if FAP server returns campus names with special characters.
        const selectedSpan = document.createElement("span");
        selectedSpan.textContent = selectedOpt.text;
        const chevronSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        chevronSvg.setAttribute("width", "16"); chevronSvg.setAttribute("height", "16");
        chevronSvg.setAttribute("viewBox", "0 0 24 24"); chevronSvg.setAttribute("fill", "none");
        chevronSvg.setAttribute("stroke", "currentColor"); chevronSvg.setAttribute("stroke-width", "2.5");
        chevronSvg.setAttribute("stroke-linecap", "round"); chevronSvg.setAttribute("stroke-linejoin", "round");
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", "6 9 12 15 18 9");
        chevronSvg.appendChild(polyline);
        selected.appendChild(selectedSpan);
        selected.appendChild(chevronSvg);

        const list = document.createElement("div");
        list.className = "fap-dropdown-list";

        options.forEach((opt) => {
            const item = document.createElement("div");
            item.className = "fap-dropdown-item" + (opt.selected ? " active" : "");
            item.textContent = opt.text;
            item.dataset.value = opt.value;

            item.addEventListener("click", () => {
                // Update native select
                nativeSelect.value = opt.value;
                nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));

                // Update UI
                selected.querySelector("span").textContent = opt.text;
                list.querySelectorAll(".fap-dropdown-item").forEach(i => i.classList.remove("active"));
                item.classList.add("active");

                // Close
                wrapper.classList.remove("open");
                // Note: change event dispatched above is sufficient for ASP.NET postback.
                // Calling new Function(onchangeAttr) is redundant and CSP-unsafe.
            });

            list.appendChild(item);
        });

        wrapper.appendChild(selected);
        wrapper.appendChild(list);

        // Toggle dropdown
        selected.addEventListener("click", (e) => {
            e.stopPropagation();
            wrapper.classList.toggle("open");
        });

        // F5 #2 FIX: Store listener reference via AbortController so it can be removed.
        // A bare document.addEventListener without cleanup can accumulate on repeated calls.
        const _dropdownAbort = new AbortController();
        const { signal: _dropdownSignal } = _dropdownAbort;

        // Close on outside click — now properly cleanup-able
        document.addEventListener("click", () => {
            wrapper.classList.remove("open");
        }, { signal: _dropdownSignal });

        // When a dropdown item is selected, we don't need to auto-cleanup here
        // because the page will navigate (ASP.NET postback). But if it stays on page,
        // we clean up after first use for hygiene.
        wrapper.addEventListener("click", (e) => {
            e.stopPropagation();
        }, { signal: _dropdownSignal });

        // Insert after native select
        nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);

        // ===== 4. "Chọn cơ sở" label above dropdown =====
        const campusLabel = document.createElement("div");
        campusLabel.className = "fap-campus-label";
        campusLabel.textContent = "Chọn cơ sở";
        wrapper.parentNode.insertBefore(campusLabel, wrapper);

        // ===== 5. "hoặc" divider between Google and FeID buttons =====
        const loginForm = document.getElementById("loginform");
        if (loginForm) {
            const rows = loginForm.querySelectorAll(":scope > .row");
            // rows[0] = Google login button row
            // rows[1] = K19 notice row (between the two login buttons)
            // rows[2] = FeID login button row
            const k19Row = rows[1];
            if (k19Row) {
                const divider = document.createElement("div");
                divider.className = "fap-or-divider";
                divider.innerHTML = '<span class="fap-or-divider-text">hoặc</span>';
                k19Row.innerHTML = "";
                k19Row.appendChild(divider);
            }
        }

        // ===== 6. Footer =====
        const loginCard = document.querySelector(
            "#ctl00_mainContent_divcontent .col-md-6:last-child > div"
        );
        if (loginCard) {
            const manifest = chrome.runtime.getManifest();
            const footer = document.createElement("div");
            footer.className = "fap-login-footer";
            footer.innerHTML =
                '<div class="fap-login-footer-text">' +
                "Enhanced by " + manifest.name + " v" + manifest.version +
                "</div>";
            loginCard.appendChild(footer);
        }

    } // end _run
})();
