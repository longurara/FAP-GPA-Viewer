/**
 * FeID Login Page - Background Wallpaper Injector + Auto-Login
 * Sets wallpaper background on feid.fpt.edu.vn login page
 * Optionally auto-fills credentials and submits login form
 */
(function () {
  "use strict";

  // CSS gate: only inject CSS + run enhancements when styling is enabled
  chrome.storage.local.get("page_styles", function (data) {
    var styles = data.page_styles || {};
    if (styles.feid_login === false) return;

    // Inject CSS programmatically (removed from manifest to allow toggle control)
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("styles/feid-login.css");
    document.head.appendChild(link);

    _run();
  });

  // Always attempt auto-login regardless of CSS styling toggle
  _tryAutoLogin();

  function _run() {

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

  } // end _run

  /**
   * Auto-login: read credentials from storage, fill form, submit
   */
  function _tryAutoLogin() {
    // Prevent retry loops — only attempt once per page load
    if (sessionStorage.getItem("feid_auto_login_attempted")) {
      console.log("[FeID Auto-Login] Already attempted this session, skipping");
      return;
    }

    chrome.storage.local.get(
      ["auto_login_enabled", "auto_login_username", "auto_login_password"],
      function (data) {
        if (!data.auto_login_enabled) {
          console.log("[FeID Auto-Login] Disabled");
          return;
        }

        if (!data.auto_login_username || !data.auto_login_password) {
          console.log("[FeID Auto-Login] No credentials saved");
          return;
        }

        // Decode Base64 credentials
        let username, password;
        try {
          username = decodeURIComponent(escape(atob(data.auto_login_username)));
          password = decodeURIComponent(escape(atob(data.auto_login_password)));
        } catch (e) {
          console.error("[FeID Auto-Login] Failed to decode credentials:", e);
          return;
        }

        if (!username || !password) {
          console.log("[FeID Auto-Login] Empty credentials after decode");
          return;
        }

        // Mark as attempted BEFORE filling to prevent loops
        sessionStorage.setItem("feid_auto_login_attempted", "true");

        // Wait for DOM to be ready, then fill and submit
        _fillAndSubmit(username, password);
      }
    );
  }

  /**
   * Type text into a field character by character
   */
  function _typeSlowly(field, text, delayMs) {
    return new Promise((resolve) => {
      field.focus();
      field.value = "";
      let i = 0;
      const timer = setInterval(() => {
        field.value += text[i];
        field.dispatchEvent(new Event("input", { bubbles: true }));
        i++;
        if (i >= text.length) {
          clearInterval(timer);
          field.dispatchEvent(new Event("change", { bubbles: true }));
          resolve();
        }
      }, delayMs);
    });
  }

  /**
   * Fill username/password fields slowly and submit the form
   */
  async function _fillAndSubmit(username, password) {
    // FeID login form field selectors
    const usernameField = document.querySelector('input[name="Username"], input[id*="Username"], input[type="text"]');
    const passwordField = document.querySelector('input[name="Password"], input[id*="Password"], input[type="password"]');
    const loginButton = document.querySelector('input[value="login"], button[value="login"], input[type="submit"]');

    if (!usernameField || !passwordField) {
      console.warn("[FeID Auto-Login] Could not find login form fields");
      return;
    }

    console.log("[FeID Auto-Login] Filling credentials for:", username);

    const CHAR_DELAY = 50; // ms per character

    await _typeSlowly(usernameField, username, CHAR_DELAY);
    await _typeSlowly(passwordField, password, CHAR_DELAY);

    // Submit after a short delay
    if (loginButton) {
      setTimeout(() => {
        console.log("[FeID Auto-Login] Submitting form...");
        loginButton.click();
      }, 400);
    } else {
      const form = usernameField.closest("form");
      if (form) {
        setTimeout(() => {
          console.log("[FeID Auto-Login] Submitting form via form.submit()...");
          form.submit();
        }, 400);
      } else {
        console.warn("[FeID Auto-Login] Could not find submit button or form");
      }
    }
  }
})();
