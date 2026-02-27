/**
 * FAP News CSS Gate
 * Injects fap-news.css only when the user has styling enabled for News pages.
 * CSS is no longer in manifest.json to allow proper toggle control.
 */
(function () {
    "use strict";

    chrome.storage.local.get("page_styles", function (data) {
        var styles = data.page_styles || {};
        if (styles.news === false) return;

        // Inject CSS programmatically (removed from manifest to allow toggle control)
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles/fap-news.css");
        document.head.appendChild(link);
    });
})();
