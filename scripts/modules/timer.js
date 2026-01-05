(function () {
  // ===== STUDY TIMER SYSTEM =====
  class StudyTimer {
    constructor() {
      this.timeLeft = 25 * 60; // 25 minutes in seconds
      this.isRunning = false;
      this.currentMode = "pomodoro";
      this.interval = null;
      this.pomodorosToday = 0;
      this.studyTimeToday = 0;
      this.studyStreak = 0;
      this.settings = {
        pomodoro: 25,
        shortBreak: 5,
        longBreak: 15,
        autoStartBreak: false,
      };

      this.init();
    }

    async init() {
      const savedData = await STORAGE.get("timer_data", {});
      this.pomodorosToday = savedData.pomodorosToday || 0;
      this.studyTimeToday = savedData.studyTimeToday || 0;
      this.studyStreak = savedData.studyStreak || 0;
      this.settings = { ...this.settings, ...savedData.settings };

      console.log("Timer settings loaded:", this.settings);

      this.loadSettings();
      this.updateStats();
      this.setupEventListeners();
      this.updateDisplay();

      await this.syncWithBackgroundTimer();
    }

    async syncWithBackgroundTimer() {
      try {
        const response = await chrome.runtime.sendMessage({
          action: "pomodoro_get_status",
        });

        if (response && response.activeTimer) {
          const activeTimer = response.activeTimer;
          const now = Date.now();
          const elapsed = Math.floor((now - activeTimer.startTime) / 1000);
          const remaining = activeTimer.duration - elapsed;

          if (remaining > 0) {
            this.currentMode = activeTimer.mode;
            this.timeLeft = remaining;
            this.isRunning = activeTimer.isRunning;

            this.updateModeButtons();
            this.updateDisplay();

            const modeNames = {
              pomodoro: "Pomodoro",
              short: "Ngh? ng?n",
              long: "Ngh? d?i",
              custom: "T?y ch?nh",
            };
            const modeDisplay = document.getElementById("timerMode");
            if (modeDisplay) {
              modeDisplay.textContent = modeNames[activeTimer.mode];
            }

            if (this.isRunning) {
              if (this.interval) {
                clearInterval(this.interval);
              }

              this.interval = setInterval(() => {
                this.timeLeft--;
                this.updateDisplay();
                if (this.timeLeft <= 0) {
                  this.complete();
                }
              }, 1000);

              document.getElementById("timerStart").style.display = "none";
              document.getElementById("timerPause").style.display = "inline-block";
              document.getElementById("timerDisplay").classList.add("running");
            } else {
              document.getElementById("timerStart").style.display = "inline-block";
              document.getElementById("timerPause").style.display = "none";
              document.getElementById("timerDisplay").classList.remove("running");
            }

            console.log(
              `Synced with background timer: ${remaining} seconds remaining, mode: ${activeTimer.mode}, isRunning: ${activeTimer.isRunning}`
            );
            console.log(
              `Current mode set to: ${this.currentMode}, timeLeft: ${this.timeLeft}`
            );
          }
        }
      } catch (error) {
        console.error("Failed to sync with background timer:", error);
      }
    }

    setupEventListeners() {
      document
        .getElementById("timerStart")
        .addEventListener("click", () => this.start());
      document
        .getElementById("timerPause")
        .addEventListener("click", () => this.pause());
      document
        .getElementById("timerReset")
        .addEventListener("click", () => this.reset());

      document.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.mode;
          const time = parseInt(btn.dataset.time);
          this.setMode(mode, time);
        });
      });

      document.getElementById("pomodoroTime")?.addEventListener("change", (e) => {
        this.settings.pomodoro = parseInt(e.target.value);
        this.saveSettings();
      });

      document
        .getElementById("shortBreakTime")
        .addEventListener("change", (e) => {
          this.settings.shortBreak = parseInt(e.target.value);
          this.saveSettings();
        });

      document
        .getElementById("longBreakTime")
        ?.addEventListener("change", (e) => {
          this.settings.longBreak = parseInt(e.target.value);
          this.saveSettings();
        });

      document
        .getElementById("autoStartBreak")
        .addEventListener("change", (e) => {
          this.settings.autoStartBreak = e.target.checked;
          this.saveSettings();
        });
    }

    loadSettings() {
      document.getElementById("pomodoroTime").value = this.settings.pomodoro;
      document.getElementById("shortBreakTime").value = this.settings.shortBreak;
      document.getElementById("longBreakTime").value = this.settings.longBreak;
      document.getElementById("autoStartBreak").checked =
        this.settings.autoStartBreak;
    }

    async updateLastBreakTime() {
      await STORAGE.mergeUpdate("timer_data", { lastBreakTime: Date.now() });
    }

    recordStudySession() {
      const session = {
        startTime: Date.now() - this.getModeTime() * 60 * 1000,
        endTime: Date.now(),
        duration: this.getModeTime(),
        mode: this.currentMode,
        completed: true,
      };

      // Use atomicUpdate to prevent race condition with saveSettings
      STORAGE.atomicUpdate("timer_data", {}, (timerData) => {
        const history = timerData.studyHistory || [];
        history.push(session);
        return {
          ...timerData,
          studyHistory: history.slice(-50),
        };
      });
    }

    async saveSettings() {
      // Use mergeUpdate to preserve studyHistory and other fields
      await STORAGE.mergeUpdate("timer_data", {
        pomodorosToday: this.pomodorosToday,
        studyTimeToday: this.studyTimeToday,
        studyStreak: this.studyStreak,
        settings: this.settings,
      });
    }

    setMode(mode, time) {
      this.currentMode = mode;
      this.timeLeft = time * 60;
      this.updateDisplay();
      this.updateModeButtons();

      const modeNames = {
        pomodoro: "Pomodoro",
        short: "Ngh? ng?n",
        long: "Ngh? d?i",
        custom: "T?y ch?nh",
      };
      document.getElementById("timerMode").textContent = modeNames[mode];

      if (mode === "short" || mode === "long") {
        this.updateLastBreakTime();
      }
    }

    updateModeButtons() {
      document.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === this.currentMode);
      });
    }

    async start() {
      if (this.isRunning) return;

      this.isRunning = true;

      try {
        const mode = this.currentMode;
        const duration = this.getModeTime();
        console.log(`Starting timer: mode=${mode}, duration=${duration} minutes`);

        await chrome.runtime.sendMessage({
          action: "pomodoro_start",
          mode: mode,
          duration: duration,
        });
      } catch (error) {
        console.error("Failed to start background timer:", error);
        this.isRunning = false;
        return;
      }

      if (this.interval) {
        clearInterval(this.interval);
      }

      this.interval = setInterval(() => {
        this.timeLeft--;
        this.updateDisplay();

        if (this.timeLeft <= 0) {
          this.complete();
        }
      }, 1000);

      document.getElementById("timerStart").style.display = "none";
      document.getElementById("timerPause").style.display = "inline-block";
      document.getElementById("timerDisplay").classList.add("running");

      if (this.timeLeft <= 60) {
        document.getElementById("timerDisplay").classList.add("warning");
      }

      this.saveSettings();
    }

    async pause() {
      if (!this.isRunning) return;

      this.isRunning = false;
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }

      try {
        await chrome.runtime.sendMessage({
          action: "pomodoro_pause",
        });
      } catch (error) {
        console.error("Failed to pause background timer:", error);
      }

      document.getElementById("timerStart").style.display = "inline-block";
      document.getElementById("timerPause").style.display = "none";
      document.getElementById("timerDisplay").classList.remove("running");

      this.saveSettings();
    }

    async reset() {
      try {
        await this.pause();

        try {
          await chrome.runtime.sendMessage({
            action: "pomodoro_reset",
          });
        } catch (error) {
          console.error("Failed to reset background timer:", error);
        }

        this.timeLeft = this.getModeTime() * 60;
        this.updateDisplay();
        document.getElementById("timerDisplay").classList.remove("warning");

        const resetIcon = document.querySelector("#timerReset .timer-icon");
        if (resetIcon) {
          resetIcon.classList.add("rotate");
          setTimeout(() => {
            resetIcon.classList.remove("rotate");
          }, 500);
        }

        this.saveSettings();
      } catch (error) {
        console.error("Error in reset function:", error);
      }
    }

    cleanup() {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      this.isRunning = false;
    }

    complete() {
      try {
        this.isRunning = false;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }

        document.getElementById("timerStart").style.display = "inline-block";
        document.getElementById("timerPause").style.display = "none";
        document.getElementById("timerDisplay").classList.remove("running");
        document.getElementById("timerDisplay").classList.remove("warning");

        this.recordStudySession();

        if (this.currentMode === "pomodoro") {
          this.pomodorosToday++;
          this.studyTimeToday += this.getModeTime();
        } else if (this.currentMode === "short" || this.currentMode === "long") {
          this.updateLastBreakTime();
        }

        this.updateStats();
        this.saveSettings();

        const modeNames = {
          pomodoro: "Pomodoro",
          short: "Ngh? ng?n",
          long: "Ngh? d…i",
          custom: "T—y ch?nh",
        };

        Toast.success(
          `${modeNames[this.currentMode]} ho?n th?nh!`,
          this.currentMode === "pomodoro"
            ? `?? ho?n th?nh ${this.pomodorosToday} pomodoros h?m nay`
            : "H?y ngh? ngoi m?t ch?t!"
        );

        if (this.settings.autoStartBreak && this.currentMode === "pomodoro") {
          setTimeout(() => {
            this.setMode("short", this.settings.shortBreak);
            this.start();
          }, 2000);
        } else {
          setTimeout(() => {
            this.setMode("pomodoro", this.settings.pomodoro);
          }, 2000);
        }
      } catch (error) {
        console.error("Error in complete function:", error);
      }
    }

    getModeTime() {
      const time = (() => {
        switch (this.currentMode) {
          case "pomodoro":
            return this.settings.pomodoro;
          case "short":
            return this.settings.shortBreak;
          case "long":
            return this.settings.longBreak;
          case "custom":
            return 30;
          default:
            return 25;
        }
      })();

      console.log(
        `getModeTime(): mode=${this.currentMode}, time=${time} minutes`
      );
      return time;
    }

    updateDisplay() {
      const minutes = Math.floor(this.timeLeft / 60);
      const seconds = this.timeLeft % 60;
      const display = `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
      document.getElementById("timerDisplay").textContent = display;
    }

    updateStats() {
      document.getElementById("pomodorosToday").textContent = this.pomodorosToday;

      const hours = Math.floor(this.studyTimeToday / 60);
      const minutes = this.studyTimeToday % 60;
      document.getElementById(
        "studyTimeToday"
      ).textContent = `${hours}h ${minutes}m`;

      document.getElementById(
        "studyStreak"
      ).textContent = `${this.studyStreak} ng?y`;
    }
  }

  window.StudyTimer = StudyTimer;
  window.initStudyTimer = function () {
    const timerSection = document.getElementById("tab-timer");
    if (!timerSection) return null;
    const inst = new StudyTimer();
    return inst;
  };
  window.cleanupStudyTimer = function (inst) {
    if (inst && typeof inst.cleanup === "function") {
      inst.cleanup();
    }
  };
})();
