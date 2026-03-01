// ===============================
// Tabs Module - Liquid Glass Tab Navigation
// ===============================

const TabsService = {
    isDragging: false,
    dragStartX: 0,
    indicatorStartLeft: 0,
    _initialized: false,
    _cachedBtnPositions: null,
    // STAB #1/#7 FIX: AbortController to cleanup document/window listeners
    // Prevents mousemove, mouseup, resize from accumulating on re-init
    _listenersAbort: null,

    /**
     * Initialize Liquid Glass Tabs with draggable indicator
     */
    initLiquidGlassTabs(signal) {
        const indicator = document.querySelector(".tab-indicator");
        const tabsContainer = document.querySelector(".tabs");
        const buttons = document.querySelectorAll(".tabs button");

        if (!indicator || !tabsContainer || buttons.length === 0) {
            console.error("Tabs not initialized properly");
            return;
        }

        const self = this;

        // Function to move indicator to active tab
        function moveIndicator(button, instant = false) {
            const scrollLeft = tabsContainer.scrollLeft;
            const buttonRect = button.getBoundingClientRect();
            const tabsRect = tabsContainer.getBoundingClientRect();
            const left = buttonRect.left - tabsRect.left + scrollLeft;
            const width = buttonRect.width;

            if (instant) {
                indicator.style.transition = "none";
            }

            indicator.style.left = `${left}px`;
            indicator.style.width = `${width}px`;

            if (instant) {
                indicator.offsetHeight; // Force reflow (intentional, needed for animation reset)
                indicator.style.transition = "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
            }
        }

        // Function to set indicator position by pixel value
        function setIndicatorPosition(left, width) {
            indicator.style.left = `${left}px`;
            indicator.style.width = `${width}px`;
        }

        // Find closest tab using cached positions (or live positions if not cached)
        function findClosestTab(xPos) {
            const positions = self._cachedBtnPositions;
            if (positions) {
                let closestBtn = null, minDist = Infinity;
                for (const pos of positions) {
                    const dist = Math.abs(pos.center - xPos);
                    if (dist < minDist) { minDist = dist; closestBtn = pos.btn; }
                }
                return closestBtn;
            }
            // Fallback: live calculation
            let closestBtn = null;
            let minDistance = Infinity;
            buttons.forEach((btn) => {
                const rect = btn.getBoundingClientRect();
                const tabsRect = tabsContainer.getBoundingClientRect();
                const btnCenter = rect.left - tabsRect.left + rect.width / 2 + tabsContainer.scrollLeft;
                const distance = Math.abs(btnCenter - xPos);
                if (distance < minDistance) { minDistance = distance; closestBtn = btn; }
            });
            return closestBtn;
        }

        // Initialize indicator position on first active tab
        const activeButton = document.querySelector(".tabs button.active");
        if (activeButton) {
            moveIndicator(activeButton, true);
        }

        // Handle clicks on tabs container
        tabsContainer.addEventListener("click", (e) => {
            if (self.isDragging) return;
            if (e.target === indicator || indicator.contains(e.target)) return;

            // Create ripple effect
            const ripple = document.createElement("div");
            ripple.style.cssText = `
        position: absolute;
        width: 20px;
        height: 20px;
        background: rgba(96, 165, 250, 0.4);
        border-radius: 50%;
        pointer-events: none;
        animation: rippleEffect 0.6s ease-out;
        left: ${e.clientX - tabsContainer.getBoundingClientRect().left - 10}px;
        top: ${e.clientY - tabsContainer.getBoundingClientRect().top - 10}px;
        z-index: 5;
      `;
            tabsContainer.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);

            const tabsRect = tabsContainer.getBoundingClientRect();
            const clickX = e.clientX - tabsRect.left + tabsContainer.scrollLeft;
            self._cachedBtnPositions = null; // Clear cache for live calc
            const closestButton = findClosestTab(clickX);

            if (!closestButton) return;

            buttons.forEach((b) => b.classList.remove("active"));
            closestButton.classList.add("active");
            moveIndicator(closestButton);

            closestButton.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
            });

            const id = closestButton.dataset.tab;
            document.querySelectorAll(".tab").forEach((s) => s.classList.remove("active"));
            document.getElementById(id)?.classList.add("active");
        });

        // Draggable indicator — cache positions on drag start
        indicator.addEventListener("mousedown", (e) => {
            self.isDragging = true;
            self.dragStartX = e.clientX;
            self.indicatorStartLeft = parseFloat(indicator.style.left) || 0;

            // Cache button positions once at drag start (avoid per-frame getBoundingClientRect)
            const tabsRect = tabsContainer.getBoundingClientRect();
            self._cachedBtnPositions = [...buttons].map(btn => {
                const rect = btn.getBoundingClientRect();
                return {
                    btn,
                    center: rect.left - tabsRect.left + rect.width / 2 + tabsContainer.scrollLeft,
                };
            });

            indicator.style.transition = "none";
            indicator.style.cursor = "grabbing";
            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        // rAF-throttled mousemove (prevents layout thrashing at 60Hz)
        // STAB #1 FIX: Use signal from AbortController to allow cleanup
        let _rafId = null;
        document.addEventListener("mousemove", (e) => {
            if (!self.isDragging) return;
            if (_rafId) return; // Skip if rAF pending

            _rafId = requestAnimationFrame(() => {
                _rafId = null;
                const deltaX = e.clientX - self.dragStartX;
                const newLeft = self.indicatorStartLeft + deltaX;
                const maxLeft = tabsContainer.scrollWidth - parseFloat(indicator.style.width);
                const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));

                setIndicatorPosition(constrainedLeft, parseFloat(indicator.style.width));

                const centerX = constrainedLeft + parseFloat(indicator.style.width) / 2;
                const closestTab = findClosestTab(centerX);
                if (closestTab) {
                    buttons.forEach((b) => b.classList.remove("hover-preview"));
                    closestTab.classList.add("hover-preview");
                }
            });
        }, { signal });

        document.addEventListener("mouseup", () => {
            if (!self.isDragging) return;

            self.isDragging = false;
            self._cachedBtnPositions = null; // Clear cache
            indicator.style.cursor = "grab";
            document.body.style.userSelect = "";

            const currentLeft = parseFloat(indicator.style.left);
            const currentWidth = parseFloat(indicator.style.width);
            const centerX = currentLeft + currentWidth / 2;
            const closestTab = findClosestTab(centerX);

            if (closestTab) {
                buttons.forEach((b) => {
                    b.classList.remove("active");
                    b.classList.remove("hover-preview");
                });

                closestTab.classList.add("active");
                indicator.style.transition = "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
                moveIndicator(closestTab);

                const id = closestTab.dataset.tab;
                document.querySelectorAll(".tab").forEach((s) => s.classList.remove("active"));
                document.getElementById(id)?.classList.add("active");

                closestTab.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center",
                });
            }
        }, { signal });

        // Update on resize (debounced)
        // STAB #7 FIX: Also uses signal so resize listener is cleaned up
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const activeBtn = document.querySelector(".tabs button.active");
                if (activeBtn) {
                    moveIndicator(activeBtn, true);
                }
            }, 100);
        }, { signal });

        indicator.style.cursor = "grab";

        // Update on scroll
        tabsContainer.addEventListener("scroll", () => {
            if (self.isDragging) return;

            const activeBtn = document.querySelector(".tabs button.active");
            if (activeBtn) {
                indicator.style.transition = "none";
                moveIndicator(activeBtn);

                clearTimeout(tabsContainer._scrollTimer);
                tabsContainer._scrollTimer = setTimeout(() => {
                    indicator.style.transition = "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
                }, 150);
            }
        });

        indicator.style.cursor = "grab";
    },

    /**
     * Switch to a specific tab
     * @param {string} tabId - Tab ID to switch to
     */
    switchTab(tabId) {
        const buttons = document.querySelectorAll(".tabs button");
        const indicator = document.querySelector(".tab-indicator");
        const tabsContainer = document.querySelector(".tabs");

        buttons.forEach((btn) => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add("active");

                // Move indicator
                if (indicator && tabsContainer) {
                    const buttonRect = btn.getBoundingClientRect();
                    const tabsRect = tabsContainer.getBoundingClientRect();
                    const left = buttonRect.left - tabsRect.left + tabsContainer.scrollLeft;
                    indicator.style.left = `${left}px`;
                    indicator.style.width = `${buttonRect.width}px`;
                }
            } else {
                btn.classList.remove("active");
            }
        });

        // BUG-06 FIX: Use tabId directly (matching the convention in initLiquidGlassTabs
        // click handler which also uses dataset.tab/id directly without a "tab-" prefix).
        document.querySelectorAll(".tab").forEach((s) => s.classList.remove("active"));
        document.getElementById(tabId)?.classList.add("active");
    },

    /**
     * Initialize tabs module (guard against double init)
     */
    init() {
        // STAB #1/#7 FIX: Create AbortController and pass signal to document/window listeners
        // Abort the previous set of listeners if re-initializing (e.g. hot-reload)
        // NOTE: _initialized guard removed — it prevented the AbortController abort from
        // ever running, causing listeners to accumulate on re-init.
        if (this._listenersAbort) this._listenersAbort.abort();
        this._listenersAbort = new AbortController();
        this.initLiquidGlassTabs(this._listenersAbort.signal);
    },
};

// Expose globally
window.TabsService = TabsService;
window.initLiquidGlassTabs = () => TabsService.init();
window.switchTab = (tabId) => TabsService.switchTab(tabId);
