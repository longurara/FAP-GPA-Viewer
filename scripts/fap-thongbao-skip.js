/**
 * FAP Thongbao Skip
 * Automatically redirects from Thongbao.aspx to Student.aspx
 * Controlled by feature_toggles.thongbao_skip setting
 */
(function () {
    "use strict";
    if (!window.location.pathname.toLowerCase().includes("/thongbao.aspx")) return;

    chrome.storage.local.get("feature_toggles", function (data) {
        var features = data.feature_toggles || {};
        if (features.thongbao_skip !== true) return;
        window.location.replace("https://fap.fpt.edu.vn/Student.aspx");
    });
})();
