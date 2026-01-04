// Advanced Search module extracted from popup.js
class AdvancedSearch {
  constructor() {
    this.searchTimeout = null;
    this.searchData = [];
    this.init();
  }

  async init() {
    await this.loadSearchData();
    this.setupEventListeners();

    // Refresh search data periodically
    setInterval(() => {
      this.loadSearchData();
    }, 30000);
  }

  async refreshSearchData() {
    await this.loadSearchData();
  }

  async loadSearchData() {
    console.log("Loading search data...");

    try {
      const [gpaCache, attendanceCache, examCache, notesData] = await Promise.all([
        STORAGE.get("cache_transcript", null),
        STORAGE.get("cache_attendance", null),
        STORAGE.get("cache_exams", null),
        STORAGE.get("course_notes", {}),
      ]);

      this.searchData = [];

      if (gpaCache?.rows || gpaCache?.data?.rows) {
        const rows = gpaCache.rows || gpaCache.data.rows;
        rows.forEach((row) => {
          if (row.code && row.name) {
            this.searchData.push({
              type: "gpa",
              icon: "📊",
              title: `${row.code} - ${row.name}`,
              content: `GPA: ${row.grade || "N/A"}, Credits: ${row.credit || 0}, Term: ${row.term || "N/A"}`,
              action: () => this.switchToTab("tab-gpa"),
            });
          }
        });
      }

      if (attendanceCache?.entries || attendanceCache?.data?.entries) {
        const entries = attendanceCache.entries || attendanceCache.data.entries;
        entries.forEach((entry) => {
          if (entry.course) {
            this.searchData.push({
              type: "attendance",
              icon: "📝",
              title: entry.course,
              content: `Status: ${entry.status || "N/A"}, Day: ${entry.day || "N/A"}, Slot: ${entry.slot || "N/A"}`,
              action: () => this.switchToTab("tab-att"),
            });
          }
        });
      }

      if (examCache?.entries || examCache?.data?.entries) {
        const entries = examCache.entries || examCache.data.entries;
        entries.forEach((exam) => {
          if (exam.subject) {
            this.searchData.push({
              type: "exam",
              icon: "🧭",
              title: exam.subject,
              content: `Date: ${exam.date || "N/A"}, Time: ${exam.time || "N/A"}, Room: ${exam.room || "N/A"}`,
              action: () => this.switchToTab("tab-exam"),
            });
          }
        });
      }

      Object.entries(notesData || {}).forEach(([course, note]) => {
        if (note && note.trim()) {
          this.searchData.push({
            type: "notes",
            icon: "🗒️",
            title: course,
            content: note.substring(0, 100) + (note.length > 100 ? "..." : ""),
            action: () => this.switchToTab("tab-gpa"),
          });
        }
      });

      this.searchData.push(
        {
          type: "gpa",
          icon: "📊",
          title: "GPA Calculator",
          content: "Tính toán GPA và điểm trung bình",
          action: () => this.switchToTab("tab-calc"),
        },
        {
          type: "attendance",
          icon: "📝",
          title: "Attendance Tracker",
          content: "Theo dõi điểm danh và chuyên cần",
          action: () => this.switchToTab("tab-att"),
        }
      );

      console.log(`Loaded ${this.searchData.length} search items`);
    } catch (error) {
      console.error("Error loading search data:", error);
      this.searchData = [];
    }
  }

  setupEventListeners() {
    const searchInput = document.getElementById("globalSearch");
    const searchResults = document.getElementById("searchResults");

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(this.searchTimeout);
        const query = searchInput.value || "";
        this.searchTimeout = setTimeout(() => this.performSearch(query), 200);
      });

      searchInput.addEventListener("focus", () => {
        if (searchResults) {
          searchResults.classList.add("show");
        }
      });

      searchInput.addEventListener("blur", () => {
        setTimeout(() => searchResults?.classList.remove("show"), 150);
      });
    }

    document.addEventListener("click", (e) => {
      const resultItem = e.target.closest('[data-action="select-result"]');
      if (resultItem) {
        const type = resultItem.getAttribute("data-result-type");
        if (type) {
          this.selectResult(type);
        }
      }
    });
  }

  showLoadingState() {
    const searchResults = document.getElementById("searchResults");
    searchResults.innerHTML = `
      <div class="search-loading">
        <div class="loading-spinner"></div>
        <span>Đang tìm kiếm...</span>
      </div>
    `;
    searchResults.classList.add("show");
  }

  performSearch(query) {
    if (!query.trim()) {
      this.displayResults([], query);
      return;
    }

    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    const results = this.searchData
      .map((item) => {
        const title = item.title.toLowerCase();
        const content = item.content.toLowerCase();
        let score = 0;

        if (title.includes(query.toLowerCase())) score += 100;
        if (content.includes(query.toLowerCase())) score += 50;

        searchTerms.forEach((term) => {
          if (title.includes(term)) score += 20;
          if (content.includes(term)) score += 10;
        });

        if (title.startsWith(query.toLowerCase())) score += 30;

        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    this.displayResults(results, query);
  }

  displayResults(results, query) {
    const searchResults = document.getElementById("searchResults");

    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          Không tìm thấy kết quả cho "${query}"
        </div>
      `;
    } else {
      searchResults.innerHTML = results
        .map(
          (result) => `
        <div class="search-result-item" data-action="select-result" data-result-type="${result.type}">
          <div class="search-result-header">
            <span class="search-result-icon">${result.icon}</span>
            <span class="search-result-title">${this.highlightText(result.title, query)}</span>
            <span class="search-result-type">${this.getTypeLabel(result.type)}</span>
          </div>
          <div class="search-result-content">
            ${this.highlightText(result.content, query)}
          </div>
        </div>
      `
        )
        .join("");
    }

    searchResults.classList.add("show");
  }

  highlightText(text, query) {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, '<span class="search-result-highlight">$1</span>');
  }

  getTypeLabel(type) {
    const labels = {
      gpa: "GPA",
      attendance: "Điểm danh",
      schedule: "Lịch học",
      exam: "Lịch thi",
      timer: "Timer",
      notes: "Ghi chú",
    };
    return labels[type] || type;
  }

  selectResult(type) {
    this.switchToTab(this.getTabForType(type));
  }

  getTabForType(type) {
    const tabMap = {
      gpa: "tab-gpa",
      attendance: "tab-att",
      schedule: "tab-schedule",
      exam: "tab-exam",
      notes: "tab-gpa",
    };
    return tabMap[type] || "tab-today";
  }

  switchToTab(tabId) {
    const tabButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (tabButton) tabButton.click();
  }
}

window.AdvancedSearch = AdvancedSearch;
