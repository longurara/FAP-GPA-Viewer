// ===============================
// Theme Module - Theme & Background Customization
// ===============================

const ThemeService = {
    // Theme color presets
    THEME_COLORS: {
        blue: "#60a5fa",
        green: "#10b981",
        purple: "#a78bfa",
        pink: "#f472b6",
        orange: "#fb923c",
        red: "#ef4444",
    },

    // Background presets
    PRESET_BACKGROUNDS: [
        { name: "Gradient Blue", url: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
        { name: "Gradient Purple", url: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
        { name: "Gradient Orange", url: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
        { name: "Gradient Green", url: "linear-gradient(135deg, #a8caba 0%, #5d4e75 100%)" },
        { name: "Gradient Pink", url: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)" },
        { name: "Gradient Dark", url: "linear-gradient(135deg, #2c3e50 0%, #34495e 100%)" },
    ],

    // State
    savedBg: "",
    savedOpacity: 20,

    // ========== Accent Color ==========

    /**
     * Initialize theme customization
     */
    async initThemeCustomization() {
        const savedColor = await window.STORAGE?.get("accent_color", this.THEME_COLORS.blue) || this.THEME_COLORS.blue;
        this.applyAccentColor(savedColor);

        const colorPicker = document.getElementById("customAccentColor");
        if (colorPicker) {
            colorPicker.value = savedColor;
        }

        this.updateActivePreset(savedColor);

        // Theme preset buttons
        document.querySelectorAll(".theme-preset").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const themeColor = this.THEME_COLORS[btn.dataset.theme];
                this.applyAccentColor(themeColor);
                await window.STORAGE?.set({ accent_color: themeColor });
                this.updateActivePreset(themeColor);
            });
        });

        // Custom color picker
        if (colorPicker) {
            colorPicker.addEventListener("change", async () => {
                const color = colorPicker.value;
                this.applyAccentColor(color);
                await window.STORAGE?.set({ accent_color: color });
                this.updateActivePreset(color);
                window.Toast?.success("Đã đổi màu");
            });
        }
    },

    /**
     * Apply accent color to CSS
     * @param {string} color - Hex color
     */
    applyAccentColor(color) {
        document.documentElement.style.setProperty("--accent", color);

        // Update chart if exists
        if (window.StatisticsService?.gpaChartInstance || window.gpaChartInstance) {
            window.loadStatistics?.();
        }
    },

    /**
     * Update active preset button
     * @param {string} color - Current color
     */
    updateActivePreset(color) {
        document.querySelectorAll(".theme-preset").forEach((btn) => {
            const themeColor = this.THEME_COLORS[btn.dataset.theme];
            btn.classList.toggle("active", themeColor === color);
        });
    },

    // ========== Dark Mode ==========

    /**
     * Initialize dark mode toggle
     */
    async initDarkMode() {
        const theme = await window.STORAGE?.get("theme", "dark") || "dark";
        document.documentElement.setAttribute("data-theme", theme);

        const toggle = document.getElementById("themeToggle");
        if (toggle) {
            toggle.addEventListener("click", async () => {
                const current = document.documentElement.getAttribute("data-theme");
                const newTheme = current === "dark" ? "light" : "dark";
                document.documentElement.setAttribute("data-theme", newTheme);
                await window.STORAGE?.set({ theme: newTheme });

                // Re-render chart with new theme colors
                if (window.StatisticsService?.gpaChartInstance || window.gpaChartInstance) {
                    await window.loadStatistics?.();
                }
            });
        }
    },

    // ========== Background System ==========

    /**
     * Initialize background system
     */
    async initBackgroundSystem() {
        this.savedBg = await window.STORAGE?.get("background_image", "") || "";
        this.savedOpacity = await window.STORAGE?.get("background_opacity", 20) || 20;

        if (this.savedBg) {
            this.applyBackground(this.savedBg, this.savedOpacity);
        }

        this.applyFrameOpacity(this.savedOpacity);
        this.updateBackgroundPreview(this.savedBg);

        const opacityEl = document.getElementById("bgOpacity");
        const opacityValueEl = document.getElementById("bgOpacityValue");
        if (opacityEl) opacityEl.value = this.savedOpacity;
        if (opacityValueEl) opacityValueEl.textContent = this.savedOpacity + "%";

        // File input
        const fileInput = document.getElementById("bgImageInput");
        const selectBtn = document.getElementById("btnSelectBg");
        const removeBtn = document.getElementById("btnRemoveBg");
        const presetBtn = document.getElementById("btnPresetBg");
        const opacitySlider = document.getElementById("bgOpacity");

        selectBtn?.addEventListener("click", () => fileInput?.click());

        fileInput?.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.addEventListener("load", async (e) => {
                    const dataUrl = e.target.result;
                    await window.STORAGE?.set({ background_image: dataUrl });
                    this.savedBg = dataUrl;
                    this.applyBackground(dataUrl, this.savedOpacity);
                    this.updateBackgroundPreview(dataUrl);
                    window.Toast?.success("Đã đặt ảnh nền");
                });
                reader.readAsDataURL(file);
            }
        });

        removeBtn?.addEventListener("click", async () => {
            await window.STORAGE?.set({ background_image: "" });
            this.savedBg = "";
            this.applyBackground("", this.savedOpacity);
            this.updateBackgroundPreview("");
            window.Toast?.success("Đã xóa ảnh nền");
        });

        presetBtn?.addEventListener("click", () => this.showPresetBackgrounds());

        opacitySlider?.addEventListener("input", async (e) => {
            const opacity = parseInt(e.target.value);
            if (opacityValueEl) opacityValueEl.textContent = opacity + "%";
            await window.STORAGE?.set({ background_opacity: opacity });
            this.savedOpacity = opacity;
            this.applyBackground(this.savedBg, opacity);
            this.applyFrameOpacity(opacity);
        });
    },

    /**
     * Apply background to body
     * @param {string} bgUrl - Background URL or gradient
     * @param {number} opacity - Opacity percentage
     */
    applyBackground(bgUrl, opacity) {
        const body = document.body;

        const legacyOverlay = document.getElementById("bgOverlay");
        if (legacyOverlay) legacyOverlay.remove();

        if (bgUrl) {
            if (bgUrl.startsWith("linear-gradient")) {
                body.style.background = bgUrl;
            } else {
                body.style.backgroundImage = `url(${bgUrl})`;
                body.style.backgroundSize = "cover";
                body.style.backgroundPosition = "center";
                body.style.backgroundRepeat = "no-repeat";
            }
            body.style.backgroundAttachment = "fixed";
        } else {
            body.style.background = "";
            body.style.backgroundImage = "";
        }

        this.updateOverlayOpacity(opacity);
    },

    /**
     * Update background preview element
     * @param {string} bgUrl - Background URL
     */
    updateBackgroundPreview(bgUrl) {
        const preview = document.getElementById("bgPreview");
        if (!preview) return;

        if (bgUrl) {
            if (bgUrl.startsWith("linear-gradient")) {
                preview.style.background = bgUrl;
            } else {
                preview.style.backgroundImage = `url(${bgUrl})`;
            }
            preview.style.display = "block";
        } else {
            preview.style.display = "none";
        }
    },

    /**
     * Show preset backgrounds modal
     */
    showPresetBackgrounds() {
        const modal = document.createElement("div");
        modal.className = "bg-preset-modal-overlay";
        modal.innerHTML = `
      <div class="bg-preset-modal-box">
        <div class="bg-preset-modal-header">
          <div class="bg-preset-modal-icon">🎨</div>
          <h2 class="bg-preset-modal-title">Chọn Background Preset</h2>
          <p class="bg-preset-modal-subtitle">Chọn một trong các preset có sẵn</p>
        </div>
        <div class="bg-preset-modal-content">
        <div class="preset-grid">
          ${this.PRESET_BACKGROUNDS.map((preset, i) => `
            <button class="preset-bg-btn" data-index="${i}" title="${preset.name}">
              <div class="preset-bg-preview" style="background: ${preset.url};"></div>
              <div class="preset-bg-name">${preset.name}</div>
            </button>
          `).join("")}
        </div>
      </div>
    `;

        document.body.appendChild(modal);
        const closeModal = () => modal.remove();

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        modal.querySelectorAll(".preset-bg-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const index = parseInt(btn.dataset.index);
                const preset = this.PRESET_BACKGROUNDS[index];
                await window.STORAGE?.set({ background_image: preset.url });
                const opacityEl = document.getElementById("bgOpacity");
                this.applyBackground(preset.url, parseInt(opacityEl?.value || 20));
                this.savedBg = preset.url;
                this.updateBackgroundPreview(preset.url);
                closeModal();
                window.Toast?.success(`Đã áp dụng ${preset.name}`);
            });
        });
    },

    /**
     * Update overlay opacity CSS variable
     * @param {number} opacityPercent - Opacity 0-100
     */
    updateOverlayOpacity(opacityPercent) {
        const overlayOpacity = Math.max(0, Math.min(1, (100 - (opacityPercent || 0)) / 100));
        document.documentElement.style.setProperty("--bg-overlay-opacity", overlayOpacity);
    },

    /**
     * Apply frame opacity
     * @param {number} opacityPercent - Opacity 0-100
     */
    applyFrameOpacity(opacityPercent) {
        const opacity = opacityPercent / 100;
        document.documentElement.style.setProperty("--frame-opacity", opacity);
        window.STORAGE?.set({ frame_opacity: opacityPercent });
    },

    /**
     * Initialize frame opacity
     */
    async initFrameOpacity() {
        const savedOpacity = await window.STORAGE?.get("frame_opacity", 100) || 100;
        this.applyFrameOpacity(savedOpacity);
    },

    /**
     * Initialize all theme features
     */
    async init() {
        await this.initDarkMode();
        await this.initThemeCustomization();
        await this.initBackgroundSystem();
        await this.initFrameOpacity();
    },
};

// Expose globally
window.ThemeService = ThemeService;
window.THEME_COLORS = ThemeService.THEME_COLORS;
window.PRESET_BACKGROUNDS = ThemeService.PRESET_BACKGROUNDS;
window.initThemeCustomization = () => ThemeService.initThemeCustomization();
window.applyAccentColor = (color) => ThemeService.applyAccentColor(color);
window.updateActivePreset = (color) => ThemeService.updateActivePreset(color);
window.initBackgroundSystem = () => ThemeService.initBackgroundSystem();
window.applyBackground = (bgUrl, opacity) => ThemeService.applyBackground(bgUrl, opacity);
window.updateBackgroundPreview = (bgUrl) => ThemeService.updateBackgroundPreview(bgUrl);
window.showPresetBackgrounds = () => ThemeService.showPresetBackgrounds();
window.updateOverlayOpacity = (opacity) => ThemeService.updateOverlayOpacity(opacity);
window.applyFrameOpacity = (opacity) => ThemeService.applyFrameOpacity(opacity);
window.initFrameOpacity = () => ThemeService.initFrameOpacity();
