/**
 * FeID Login Page - Background Wallpaper Injector
 * Sets wallpaper background on feid.fpt.edu.vn login page
 */
(function () {
    "use strict";

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
    overlay.id = "feid-login-overlay";
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

    // Elevate page content above overlay
    const navPage = document.querySelector(".nav-page");
    if (navPage) navPage.style.cssText += "position:relative;z-index:1;";

    const bodyContainer = document.querySelector(".body-container");
    if (bodyContainer) bodyContainer.style.cssText += "position:relative;z-index:1;";
})();
