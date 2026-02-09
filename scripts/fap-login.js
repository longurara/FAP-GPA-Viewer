/**
 * FAP Login Page - Background Wallpaper + Custom Dropdown
 * Sets the wallpaper background and replaces native <select> with custom styled dropdown
 */
(function () {
    "use strict";

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

    // ===== 2. Custom Dropdown =====
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
    selected.innerHTML = `<span>${selectedOpt.text}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

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

            // Trigger ASP.NET postback if needed
            if (nativeSelect.getAttribute("onchange")) {
                eval(nativeSelect.getAttribute("onchange"));
            }
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

    // Close on outside click
    document.addEventListener("click", () => {
        wrapper.classList.remove("open");
    });

    wrapper.addEventListener("click", (e) => e.stopPropagation());

    // Insert after native select
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);
})();
