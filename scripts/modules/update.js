// ===== Update Modal Module =====
// iPadOS Style Update Modal System for checking and downloading updates from GitHub

const UpdateModal = {
    overlay: null,
    box: null,
    progressBar: null,
    progressFill: null,
    progressText: null,
    downloadBtn: null,
    cancelBtn: null,

    // Configuration for GitHub repository
    config: {
        repoOwner: "longurara",
        repoName: "FAP-GPA-Viewer",
        fallbackDownloadUrl: "https://github.com/longurara/FAP-GPA-Viewer/releases/latest",
        useRealDownload: true,
    },

    init() {
        const modalHTML = `
      <div class="update-modal-overlay" id="updateModalOverlay">
        <div class="update-modal-box">
          <div class="update-modal-header">
            <div class="update-modal-icon">
              <div style="font-size: 48px;">🚀</div>
            </div>
            <h2 class="update-modal-title">Cập nhật FAP-Dashboard</h2>
            <p class="update-modal-subtitle">Phiên bản mới đã có sẵn</p>
          </div>
          <div class="update-modal-content">
            <div class="update-app-info">
              <div class="update-app-name" id="updateAppName">FAP Dashboard v2.3.0</div>
              <div class="update-developer" id="updateDeveloper">Nhà phát triển: FAP Team</div>
            </div>
            <div class="update-description" id="updateDescription">
              Phiên bản mới với nhiều tính năng tuyệt vời và cải tiến hiệu suất đáng kể.
            </div>
            <ul class="update-features" id="updateFeatures">
              <li>Giao diện mới với thiết kế hiện đại</li>
              <li>Cải thiện hiệu suất và tốc độ tải</li>
              <li>Tối ưu hóa cho mobile và tablet</li>
              <li>Sửa lỗi và cải thiện ổn định</li>
            </ul>
            <div class="update-size" id="updateSize">
              <strong>Kích thước:</strong> 2.4 MB
            </div>
            <div class="update-progress" id="updateProgress">
              <div class="progress-fill" id="progressFill"></div>
              <div class="progress-text" id="progressText">Đang tải về...</div>
            </div>
          </div>
          <div class="update-actions">
            <button class="update-btn secondary" id="updateCancelBtn">Hủy</button>
            <button class="update-btn primary" id="updateDownloadBtn">Tải về</button>
          </div>
        </div>
      </div>
    `;

        document.body.insertAdjacentHTML("beforeend", modalHTML);

        this.overlay = document.getElementById("updateModalOverlay");
        this.progressBar = document.getElementById("updateProgress");
        this.progressFill = document.getElementById("progressFill");
        this.progressText = document.getElementById("progressText");
        this.downloadBtn = document.getElementById("updateDownloadBtn");
        this.cancelBtn = document.getElementById("updateCancelBtn");

        this.cancelBtn.addEventListener("click", () => this.close());
        this.downloadBtn.addEventListener("click", () => this.startDownload());

        this.overlay.addEventListener("click", (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.overlay?.classList.contains("active")) {
                this.close();
            }
        });
    },

    show() {
        if (!this.overlay) this.init();
        this.overlay.classList.add("active");
        this.resetProgress();
        this.updateModalContent();
        this.checkForUpdates();
    },

    async checkForUpdates() {
        try {
            const latestReleaseUrl = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/releases/latest`;
            console.log("🔍 Fetching release info from:", latestReleaseUrl);
            const response = await fetch(latestReleaseUrl);

            if (response.ok) {
                const releaseData = await response.json();
                console.log("📦 Release data:", releaseData);
                console.log("📦 Assets:", releaseData.assets);

                const latestVersion = releaseData.tag_name;
                const currentVersion = this.getCurrentVersion();

                console.log(`📦 Current version: ${currentVersion}`);
                console.log(`📦 Latest version available: ${latestVersion}`);

                if (this.isVersionNewer(latestVersion, currentVersion)) {
                    this.showUpdateAvailable(latestVersion, releaseData);
                } else {
                    this.showUpToDate(currentVersion);
                }
            } else {
                console.error("GitHub API error:", response.status, response.statusText);
            }
        } catch (error) {
            console.log("Could not fetch latest version info:", error.message);
            this.showUpdateAvailable("v4.2.0", null);
        }
    },

    getCurrentVersion() {
        try {
            const manifest = chrome.runtime.getManifest();
            return manifest.version || "v2.2.1";
        } catch (error) {
            return "v2.2.1";
        }
    },

    isVersionNewer(latestVersion, currentVersion) {
        const latest = latestVersion.replace("v", "").split(".").map(Number);
        const current = currentVersion.replace("v", "").split(".").map(Number);

        for (let i = 0; i < Math.max(latest.length, current.length); i++) {
            const latestNum = latest[i] || 0;
            const currentNum = current[i] || 0;

            if (latestNum > currentNum) return true;
            if (latestNum < currentNum) return false;
        }

        return false;
    },

    showUpdateAvailable(latestVersion, releaseData) {
        const titleEl = document.querySelector(".update-modal-title");
        if (titleEl && this.config.repoOwner === "longurara") {
            titleEl.textContent = `Cập nhật FAP-Dashboard ${latestVersion}`;
        }

        const appNameEl = document.getElementById("updateAppName");
        if (appNameEl && this.config.repoOwner === "longurara") {
            appNameEl.textContent = `FAP-Dashboard ${latestVersion}`;
        }

        if (releaseData) {
            this.updateModalWithRealData(releaseData);
        }

        const downloadBtn = document.getElementById("updateDownloadBtn");
        if (downloadBtn) {
            downloadBtn.style.display = "block";
            downloadBtn.textContent = "Tải về";
            downloadBtn.replaceWith(downloadBtn.cloneNode(true));
            const newDownloadBtn = document.getElementById("updateDownloadBtn");
            newDownloadBtn.addEventListener("click", () => this.startDownload());
        }
    },

    updateModalWithRealData(releaseData) {
        console.log("📦 Release data received:", releaseData);

        const descriptionEl = document.getElementById("updateDescription");
        if (descriptionEl) {
            descriptionEl.textContent = "";
        }

        const featuresEl = document.getElementById("updateFeatures");
        if (featuresEl) {
            featuresEl.style.display = "none";
        }

        const sizeEl = document.getElementById("updateSize");
        if (sizeEl) {
            sizeEl.style.display = "block";
            if (releaseData.assets && releaseData.assets.length > 0) {
                const asset = releaseData.assets[0];
                const sizeInMB = (asset.size / 1024 / 1024).toFixed(1);
                console.log(`📦 Real file size: ${asset.size} bytes = ${sizeInMB} MB`);
                sizeEl.innerHTML = `<strong>Kích thước:</strong> ${sizeInMB} MB`;
            } else {
                console.log("📦 No assets found in release data");
                this.fetchEstimatedSize().then((size) => {
                    sizeEl.innerHTML = `<strong>Kích thước:</strong> ${size}`;
                });
            }
        }
    },

    async fetchEstimatedSize() {
        try {
            const repoUrl = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}`;
            const response = await fetch(repoUrl);
            if (response.ok) {
                const repoData = await response.json();
                if (repoData.size) {
                    const sizeInMB = (repoData.size / 1024 / 1024).toFixed(1);
                    return `${sizeInMB} MB (ước tính)`;
                }
            }
        } catch (error) {
            console.log("Could not fetch repository size:", error);
        }
        return "~2.0 MB (ước tính)";
    },

    showUpToDate(currentVersion) {
        const titleEl = document.querySelector(".update-modal-title");
        if (titleEl) {
            titleEl.textContent = `FAP-Dashboard ${currentVersion}`;
        }

        const subtitleEl = document.querySelector(".update-modal-subtitle");
        if (subtitleEl) {
            subtitleEl.textContent = "Bạn đã ở phiên bản mới nhất!";
        }

        const appNameEl = document.getElementById("updateAppName");
        if (appNameEl) {
            appNameEl.textContent = `FAP-Dashboard ${currentVersion}`;
        }

        const descriptionEl = document.getElementById("updateDescription");
        if (descriptionEl) {
            descriptionEl.textContent =
                "Extension của bạn đã được cập nhật lên phiên bản mới nhất. Cảm ơn bạn đã sử dụng FAP Dashboard!";
        }

        const featuresEl = document.getElementById("updateFeatures");
        if (featuresEl) {
            featuresEl.style.display = "none";
        }

        const sizeEl = document.getElementById("updateSize");
        if (sizeEl) {
            sizeEl.style.display = "none";
        }

        const downloadBtn = document.getElementById("updateDownloadBtn");
        if (downloadBtn) {
            downloadBtn.textContent = "Đóng";
            downloadBtn.replaceWith(downloadBtn.cloneNode(true));
            const newDownloadBtn = document.getElementById("updateDownloadBtn");
            newDownloadBtn.addEventListener("click", () => this.close());
        }

        console.log("✅ User is up to date!");
    },

    updateModalContent() {
        const appNameEl = document.getElementById("updateAppName");
        const developerEl = document.getElementById("updateDeveloper");
        const descriptionEl = document.getElementById("updateDescription");
        const featuresEl = document.getElementById("updateFeatures");
        const sizeEl = document.getElementById("updateSize");

        if (appNameEl) appNameEl.textContent = "FAP-GPA-Viewer";
        if (developerEl) developerEl.textContent = "Nhà phát triển: longurara";
        if (descriptionEl) descriptionEl.textContent = "";
        if (featuresEl) featuresEl.style.display = "none";
        if (sizeEl) {
            sizeEl.style.display = "block";
            sizeEl.innerHTML = "<strong>Kích thước:</strong> ~2.4 MB";
        }
    },

    close() {
        this.overlay?.classList.remove("active");
    },

    resetProgress() {
        this.progressBar.classList.remove("active");
        this.progressFill.style.width = "0%";
        this.progressText.textContent = "Đang tải về...";
        if (this.downloadBtn) {
            this.downloadBtn.textContent = "Tải về";
            this.downloadBtn.disabled = false;
            this.downloadBtn.style.display = "block";
        }
    },

    async startDownload() {
        this.downloadBtn.disabled = true;
        this.downloadBtn.textContent = "Đang tải về...";
        this.progressBar.classList.add("active");

        try {
            if (this.config.useRealDownload) {
                await this.realDownload();
            } else {
                await this.fallbackDownload();
            }

            this.progressText.textContent = "Tải về hoàn thành!";
            this.progressFill.style.width = "100%";

            setTimeout(() => {
                this.close();
                this.showInstallationInstructions();
            }, 1000);
        } catch (error) {
            console.error("Download failed:", error);
            this.progressText.textContent = "Tải về thất bại!";
            this.downloadBtn.disabled = false;
            this.downloadBtn.textContent = "Mở GitHub";

            this.downloadBtn.replaceWith(this.downloadBtn.cloneNode(true));
            const newDownloadBtn = document.getElementById("updateDownloadBtn");
            newDownloadBtn.addEventListener("click", () => {
                window.open(this.config.fallbackDownloadUrl, "_blank");
                this.close();
            });

            if (typeof Toast !== "undefined") {
                Toast.error("Không thể tải về trực tiếp. Nhấn 'Mở GitHub' để tải về thủ công.");
            }
        }
    },

    showInstallationInstructions() {
        const instructionsHTML = `
    <div class="update-modal-overlay" id="installInstructionsOverlay">
      <div class="update-modal-box" style="max-width: 500px;">
        <div class="update-modal-header">
          <div class="update-modal-icon">
            <div style="font-size: 48px;">📦</div>
          </div>
          <h2 class="update-modal-title">Hướng dẫn cài đặt</h2>
          <p class="update-modal-subtitle">
            File đã được tải về. Làm theo các bước sau để cài đặt extension
          </p>
        </div>

        <div class="update-modal-content">
          <div class="install-steps">
            <div class="install-step">
              <div class="step-number">1</div>
              <div class="step-content">
                <h4>File đã tải về</h4>
                <p>File <strong>FAP-GPA-Viewer-*.zip</strong> đã được tải về thư mục Downloads</p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">2</div>
              <div class="step-content">
                <h4>Giải nén file</h4>
                <p>Giải nén file .zip vào một thư mục trên máy tính</p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">3</div>
              <div class="step-content">
                <h4>Mở Chrome Extensions</h4>
                <p>Vào <strong>chrome://extensions/</strong> hoặc <strong>edge://extensions/</strong></p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">4</div>
              <div class="step-content">
                <h4>Bật Developer Mode</h4>
                <p>Bật chế độ "Developer mode" ở góc trên bên phải</p>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">5</div>
              <div class="step-content">
                <h4>Load Extension</h4>
                <p>Nhấn "Load unpacked" và chọn thư mục đã giải nén</p>
              </div>
            </div>
          </div>

          <div class="update-actions">
            <button class="update-btn secondary" id="installCloseBtn">Đã hiểu</button>
            <button class="update-btn primary" id="installOpenExtensionsBtn">Mở Extensions</button>
          </div>
        </div>
      </div>
    </div>
  `;

        document.body.insertAdjacentHTML("beforeend", instructionsHTML);

        document.getElementById("installCloseBtn").addEventListener("click", () => {
            document.getElementById("installInstructionsOverlay").remove();
        });

        document.getElementById("installOpenExtensionsBtn").addEventListener("click", () => {
            if (navigator.userAgent.includes("Edg")) {
                window.open("edge://extensions/", "_blank");
            } else {
                window.open("chrome://extensions/", "_blank");
            }
            document.getElementById("installInstructionsOverlay").remove();
        });

        if (!document.getElementById("installStepsCSS")) {
            const style = document.createElement("style");
            style.id = "installStepsCSS";
            style.textContent = `
        .install-steps {
          margin: 20px 0;
        }
        .install-step {
          display: flex;
          align-items: flex-start;
          margin-bottom: 20px;
          padding: 15px;
          background: var(--card-bg);
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .step-number {
          width: 32px;
          height: 32px;
          background: var(--accent);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          margin-right: 15px;
          flex-shrink: 0;
        }
        .step-content h4 {
          margin: 0 0 8px 0;
          color: var(--text);
          font-size: 16px;
        }
        .step-content p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }
      `;
            document.head.appendChild(style);
        }
    },

    async fallbackDownload() {
        this.progressText.textContent = "Đang mở trang tải về...";
        this.progressFill.style.width = "30%";

        await new Promise((resolve) => setTimeout(resolve, 1000));

        this.progressText.textContent = "Đang chuyển hướng...";
        this.progressFill.style.width = "60%";

        await new Promise((resolve) => setTimeout(resolve, 1000));

        window.open(this.config.fallbackDownloadUrl, "_blank");

        this.progressFill.style.width = "100%";
        this.progressText.textContent = "Đã mở trang tải về!";
    },

    async realDownload() {
        const latestReleaseUrl = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/releases/latest`;

        try {
            this.progressText.textContent = "Đang kiểm tra phiên bản mới...";
            this.progressFill.style.width = "10%";

            console.log("📦 Fetching release info from:", latestReleaseUrl);

            const response = await fetch(latestReleaseUrl);
            if (!response.ok) {
                console.error("GitHub API error:", response.status, response.statusText);
                throw new Error(`GitHub API error: ${response.status} - ${response.statusText}`);
            }

            const releaseData = await response.json();
            console.log("📦 Release data:", releaseData);

            if (!releaseData.assets || releaseData.assets.length === 0) {
                console.log("📦 Release data:", releaseData);
                throw new Error(
                    "Không tìm thấy file tải về trong release này. Release có thể chưa có file đính kèm."
                );
            }

            const downloadUrl = releaseData.assets[0]?.browser_download_url;
            const fileName = releaseData.assets[0]?.name || "update.zip";
            const fileSize = releaseData.assets[0]?.size || 0;

            if (!downloadUrl) {
                throw new Error("Không tìm thấy URL tải về");
            }

            console.log("📦 Downloading from:", downloadUrl);
            console.log("📦 File name:", fileName);
            console.log("📦 File size:", fileSize, "bytes");

            this.progressText.textContent = "Đang tải về...";
            this.progressFill.style.width = "20%";

            const downloadResponse = await fetch(downloadUrl);
            if (!downloadResponse.ok) {
                throw new Error(`Download failed: ${downloadResponse.status} - ${downloadResponse.statusText}`);
            }

            const contentLength = downloadResponse.headers.get("content-length");
            const total = contentLength ? parseInt(contentLength, 10) : fileSize;
            let loaded = 0;

            console.log("📦 Total size to download:", total, "bytes");

            const reader = downloadResponse.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loaded += value.length;

                const progress = total > 0 ? Math.round((loaded / total) * 80) + 20 : 50;
                this.progressFill.style.width = progress + "%";

                const percent = total > 0 ? Math.round((loaded / total) * 100) : 50;
                const loadedMB = (loaded / 1024 / 1024).toFixed(1);
                const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : "?";

                this.progressText.textContent = `Đang tải về... ${percent}% (${loadedMB}/${totalMB} MB)`;

                await new Promise((resolve) => setTimeout(resolve, 30));
            }

            const blob = new Blob(chunks);
            console.log("✅ Download completed, blob size:", blob.size, "bytes");

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.progressFill.style.width = "100%";
            this.progressText.textContent = "Tải về hoàn tất!";

            console.log("📦 File saved successfully:", fileName);
        } catch (error) {
            console.error("Real download error:", error);
            throw error;
        }
    },
};

// Export for global access
window.UpdateModal = UpdateModal;
