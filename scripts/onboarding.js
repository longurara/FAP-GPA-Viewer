/**
 * Onboarding Guide - Shows a one-time welcome modal for v6.0.0+ users
 * Displayed on FAP login and FeID login pages.
 * Dismissed permanently when user checks "Không hiển thị lại" and closes.
 */
(function () {
    "use strict";

    const STORAGE_KEY = "onboarding_v6_dismissed";

    chrome.storage.local.get(STORAGE_KEY, function (data) {
        if (data[STORAGE_KEY]) return; // Already dismissed
        showOnboarding();
    });

    function showOnboarding() {
        const manifest = chrome.runtime.getManifest();
        const version = manifest.version;

        // ===== Overlay =====
        const overlay = document.createElement("div");
        overlay.id = "fap-onboarding-overlay";
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        `;

        // ===== Modal =====
        const modal = document.createElement("div");
        modal.style.cssText = `
            background: linear-gradient(145deg, #0f1a2e 0%, #162544 50%, #0d1f3c 100%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            max-width: 420px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            padding: 0;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
            transform: translateY(20px) scale(0.97);
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
            color: #e2e8f0;
        `;

        modal.innerHTML = `
            <div style="padding: 20px 22px 0;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 14px;">
                    <div style="
                        width: 40px; height: 40px;
                        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
                        border-radius: 12px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 10px;
                        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3);
                    ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                            <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/>
                        </svg>
                    </div>
                    <h2 style="
                        font-size: 18px;
                        font-weight: 700;
                        color: #ffffff;
                        margin: 0 0 4px;
                        letter-spacing: -0.3px;
                    ">Chào mừng đến FPT FAP Dashboard</h2>
                    <div style="
                        font-size: 12px;
                        color: #94a3b8;
                        font-weight: 500;
                    ">Phiên bản ${version} — Giao diện mới hoàn toàn</div>
                </div>

                <!-- What's new -->
                <div style="
                    background: rgba(59, 130, 246, 0.08);
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    border-radius: 10px;
                    padding: 12px 14px;
                    margin-bottom: 10px;
                ">
                    <div style="font-size: 13px; font-weight: 600; color: #60a5fa; margin-bottom: 6px;">
                        Có gì mới?
                    </div>
                    <ul style="
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        font-size: 12px;
                        line-height: 1.6;
                        color: #cbd5e1;
                    ">
                        <li style="padding: 2px 0;">
                            <span style="color: #60a5fa; margin-right: 6px; font-weight: 700;">&#10003;</span>
                            Giao diện trang đăng nhập, bảng điểm, lịch học, lịch thi được thiết kế lại hoàn toàn
                        </li>
                        <li style="padding: 2px 0;">
                            <span style="color: #60a5fa; margin-right: 6px; font-weight: 700;">&#10003;</span>
                            Hỗ trợ bật/tắt giao diện từng trang riêng biệt
                        </li>
                        <li style="padding: 2px 0;">
                            <span style="color: #60a5fa; margin-right: 6px; font-weight: 700;">&#10003;</span>
                            Giao diện tối giản, hiện đại với tông màu xanh
                        </li>
                    </ul>
                </div>

                <!-- How to toggle -->
                <div style="
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 10px;
                    padding: 12px 14px;
                    margin-bottom: 10px;
                ">
                    <div style="font-size: 13px; font-weight: 600; color: #f1f5f9; margin-bottom: 10px;">
                        Cách bật / tắt giao diện mới
                    </div>

                    <!-- Step 1 -->
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start;">
                        <div style="
                            min-width: 22px; height: 22px;
                            background: linear-gradient(135deg, #3b82f6, #6366f1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 11px;
                            font-weight: 700;
                            color: white;
                            flex-shrink: 0;
                            margin-top: 1px;
                        ">1</div>
                        <div>
                            <div style="font-size: 12px; font-weight: 600; color: #e2e8f0;">
                                Nhấn vào icon extension trên thanh công cụ
                            </div>
                            <div style="font-size: 11px; color: #94a3b8;">
                                Click vào icon FPT FAP Dashboard ở góc phải trình duyệt
                            </div>
                        </div>
                    </div>

                    <!-- Step 2 -->
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start;">
                        <div style="
                            min-width: 22px; height: 22px;
                            background: linear-gradient(135deg, #3b82f6, #6366f1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 11px;
                            font-weight: 700;
                            color: white;
                            flex-shrink: 0;
                            margin-top: 1px;
                        ">2</div>
                        <div>
                            <div style="font-size: 12px; font-weight: 600; color: #e2e8f0;">
                                Vào tab "Cài đặt"
                            </div>
                            <div style="font-size: 11px; color: #94a3b8;">
                                Tab cuối cùng trong thanh điều hướng của popup
                            </div>
                        </div>
                    </div>

                    <!-- Step 3 -->
                    <div style="display: flex; gap: 10px; align-items: flex-start;">
                        <div style="
                            min-width: 22px; height: 22px;
                            background: linear-gradient(135deg, #3b82f6, #6366f1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 11px;
                            font-weight: 700;
                            color: white;
                            flex-shrink: 0;
                            margin-top: 1px;
                        ">3</div>
                        <div>
                            <div style="font-size: 12px; font-weight: 600; color: #e2e8f0;">
                                Tìm mục "Tùy chỉnh giao diện trang"
                            </div>
                            <div style="font-size: 11px; color: #94a3b8;">
                                Bật/tắt từng trang (Đăng nhập, Bảng điểm, Lịch học, Lịch thi, Học phí, Tin tức...)
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="
                padding: 10px 22px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            ">
                <!-- Checkbox -->
                <label id="fap-onboarding-noshow" style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 12px;
                    color: #94a3b8;
                    user-select: none;
                    transition: color 0.2s;
                ">
                    <input type="checkbox" id="fap-onboarding-dismiss-cb" style="
                        width: 15px; height: 15px;
                        accent-color: #3b82f6;
                        cursor: pointer;
                        margin: 0;
                    " />
                    Không hiển thị lại
                </label>

                <!-- Close button -->
                <button id="fap-onboarding-close" style="
                    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 8px 24px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                    letter-spacing: 0.3px;
                ">Đã hiểu</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // ===== Animate in =====
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                overlay.style.opacity = "1";
                modal.style.transform = "translateY(0) scale(1)";
            });
        });

        // ===== Hover effect on button =====
        var closeBtn = document.getElementById("fap-onboarding-close");
        closeBtn.addEventListener("mouseenter", function () {
            this.style.transform = "translateY(-2px)";
            this.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.4)";
        });
        closeBtn.addEventListener("mouseleave", function () {
            this.style.transform = "translateY(0)";
            this.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
        });

        // ===== Hover effect on label =====
        var noShowLabel = document.getElementById("fap-onboarding-noshow");
        noShowLabel.addEventListener("mouseenter", function () {
            this.style.color = "#cbd5e1";
        });
        noShowLabel.addEventListener("mouseleave", function () {
            this.style.color = "#94a3b8";
        });

        // ===== Close handler =====
        closeBtn.addEventListener("click", function () {
            var cb = document.getElementById("fap-onboarding-dismiss-cb");
            if (cb && cb.checked) {
                var obj = {};
                obj[STORAGE_KEY] = true;
                chrome.storage.local.set(obj);
            }
            // Animate out
            overlay.style.opacity = "0";
            modal.style.transform = "translateY(20px) scale(0.97)";
            setTimeout(function () {
                overlay.remove();
            }, 300);
        });

        // ===== Close on overlay click (outside modal) =====
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) {
                closeBtn.click();
            }
        });

        // ===== Custom scrollbar for modal =====
        var style = document.createElement("style");
        style.textContent = `
            #fap-onboarding-overlay > div::-webkit-scrollbar {
                width: 6px;
            }
            #fap-onboarding-overlay > div::-webkit-scrollbar-track {
                background: transparent;
            }
            #fap-onboarding-overlay > div::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.1);
                border-radius: 3px;
            }
            #fap-onboarding-overlay > div::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.2);
            }
        `;
        document.head.appendChild(style);
    }
})();
