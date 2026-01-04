// Calendar Export & Auto Import Service
class CalendarService {
  constructor() {
    this.prodId = "-//FAP Dashboard//FAP Schedule//VI";
    this.timezone = "Asia/Ho_Chi_Minh";
  }

  // ===== CORE HELPERS =====
  escapeICSText(text) {
    if (!text) return "";
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "");
  }

  toNumber(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  parseDayMonthYear(dateStr) {
    const today = new Date();
    const [dayStr, monthStr, yearStr] = (dateStr || "").split("/");
    return {
      day: this.toNumber(dayStr, today.getDate()),
      month: this.toNumber(monthStr, today.getMonth() + 1),
      year: this.toNumber(yearStr, today.getFullYear()),
    };
  }

  parseTimeParts(timeStr, fallback = { hours: 0, minutes: 0 }) {
    const [hoursStr, minutesStr] = (timeStr || "").split(":");
    return {
      hours: this.toNumber(hoursStr, fallback.hours ?? 0),
      minutes: this.toNumber(minutesStr, fallback.minutes ?? 0),
    };
  }

  ensureValidDate(date, context = {}) {
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date;
    }
    console.warn("Invalid date encountered, falling back to now", context);
    return new Date();
  }

  buildDateFromParts(dateParts, timeParts) {
    const { day, month, year } = dateParts;
    const { hours, minutes } = timeParts;
    return this.ensureValidDate(
      new Date(year, month - 1, day, hours, minutes, 0),
      { dateParts, timeParts }
    );
  }

  formatICSDateTime(date, context) {
    return this.ensureValidDate(date, context)
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0]
      .concat("Z");
  }

  createUID(prefix, index) {
    const randomPart =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now();
    return `${prefix}-${index}-${randomPart}@fpt.edu.vn`;
  }

  // ===== ICS BUILDERS =====
  createICSHeader(calendarName) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${this.prodId}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${calendarName}`,
      `X-WR-TIMEZONE:${this.timezone}`,
    ];
  }

  createAlarm(minutes) {
    const safeMinutes = Math.max(Math.abs(minutes || 0), 1);
    return [
      "BEGIN:VALARM",
      `TRIGGER:-PT${safeMinutes}M`,
      "ACTION:DISPLAY",
      `DESCRIPTION:Reminder ${safeMinutes} minutes before`,
      "END:VALARM",
    ];
  }

  buildEvent({ uid, start, end, summary, description, location, alarmMinutes }) {
    const eventLines = [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
    ];

    (alarmMinutes || []).forEach((minutes) => {
      eventLines.push(...this.createAlarm(minutes));
    });

    eventLines.push("END:VEVENT");
    return eventLines;
  }

  buildCalendar(calendarName, events) {
    return [
      ...this.createICSHeader(calendarName),
      ...events.flat(),
      "END:VCALENDAR",
    ].join("\r\n");
  }

  // ===== DATA PARSING =====
  normalizeTimeRange(timeStr) {
    const defaultRange = {
      startTime: { hours: 8, minutes: 0 },
      endTime: { hours: 10, minutes: 0 },
    };

    if (!timeStr) return defaultRange;

    if (timeStr.includes("-")) {
      const [rawStart, rawEnd] = timeStr.split("-");
      const startTime = this.parseTimeParts(
        rawStart?.trim(),
        defaultRange.startTime
      );
      const endTime = this.parseTimeParts(rawEnd?.trim(), {
        hours: startTime.hours + 2,
        minutes: startTime.minutes,
      });
      return { startTime, endTime };
    }

    const startTime = this.parseTimeParts(
      timeStr.trim(),
      defaultRange.startTime
    );
    const endDate = new Date();
    endDate.setHours(startTime.hours, startTime.minutes, 0, 0);
    endDate.setMinutes(endDate.getMinutes() + 120);

    return {
      startTime,
      endTime: { hours: endDate.getHours(), minutes: endDate.getMinutes() },
    };
  }

  parseScheduleDateRange(dateStr, timeRange) {
    const dateParts = this.parseDayMonthYear(dateStr);
    const [rawStart, rawEnd] = (timeRange || "").split("-");
    const startParts = this.parseTimeParts(rawStart?.trim(), {
      hours: 8,
      minutes: 0,
    });
    const endParts = this.parseTimeParts(rawEnd?.trim(), startParts);

    return {
      start: this.formatICSDateTime(
        this.buildDateFromParts(dateParts, startParts),
        { dateStr, timeRange, startParts }
      ),
      end: this.formatICSDateTime(
        this.buildDateFromParts(dateParts, endParts),
        { dateStr, timeRange, endParts }
      ),
    };
  }

  // ===== EVENT BUILDERS =====
  createScheduleEvent(classItem, index) {
    const { start, end } = this.parseScheduleDateRange(
      classItem.date,
      classItem.time
    );

    const summary = this.escapeICSText(
      `${classItem.course} - ${classItem.room || "N/A"}`
    );
    const description = this.escapeICSText(
      [
        `Course: ${classItem.course}`,
        `Room: ${classItem.room || "N/A"}`,
        `Status: ${classItem.status || "N/A"}`,
        "",
        "Generated by FAP Dashboard",
      ].join("\n")
    );
    const location = this.escapeICSText(classItem.room || "FPT University");

    return this.buildEvent({
      uid: this.createUID("fap-class", index),
      start,
      end,
      summary,
      description,
      location,
      alarmMinutes: [15, 5],
    });
  }

  createExamEvent(exam, index) {
    const dateParts = this.parseDayMonthYear(exam.date);
    const { startTime, endTime } = this.normalizeTimeRange(exam.time);

    const summary = this.escapeICSText(
      `Exam: ${exam.code} - ${exam.name || "N/A"}`
    );
    const description = this.escapeICSText(
      [
        `Course: ${exam.name} (${exam.code})`,
        `Form: ${exam.form || "N/A"}`,
        `Room: ${exam.room || "N/A"}`,
        `Type: ${exam.type || "N/A"}`,
        "",
        "Generated by FAP Dashboard",
      ].join("\n")
    );
    const location = this.escapeICSText(exam.room || "FPT University");

    return this.buildEvent({
      uid: this.createUID("fap-exam", index),
      start: this.formatICSDateTime(
        this.buildDateFromParts(dateParts, startTime),
        { exam }
      ),
      end: this.formatICSDateTime(
        this.buildDateFromParts(dateParts, endTime),
        { exam }
      ),
      summary,
      description,
      location,
      alarmMinutes: [60, 30, 15],
    });
  }

  generateScheduleICS(scheduleData) {
    const events = scheduleData
      .filter((item) => this.isValidScheduleItem(item))
      .map((classItem, index) => this.createScheduleEvent(classItem, index));

    return this.buildCalendar("FAP Lich hoc", events);
  }

  generateExamICS(examData) {
    const events = examData
      .filter((exam) => this.isValidExamItem(exam))
      .map((exam, index) => this.createExamEvent(exam, index));

    return this.buildCalendar("FAP Lich thi", events);
  }

  isValidScheduleItem(item) {
    return Boolean(item && item.time && item.time.includes("-") && item.course);
  }

  isValidExamItem(exam) {
    return Boolean(exam && exam.date && exam.time && exam.code);
  }

  // ===== EXPORT FUNCTIONS =====
  async exportICS({
    storageKey,
    filenamePrefix,
    validator,
    builder,
    emptyMessage,
    invalidMessage,
  }) {
    const rawData = await STORAGE.get(storageKey, []);

    if (!rawData || rawData.length === 0) {
      throw new Error(emptyMessage);
    }

    const validItems = rawData.filter((item) => validator(item));

    if (validItems.length === 0) {
      throw new Error(invalidMessage);
    }

    const icsContent = builder(validItems);
    const filename = `${filenamePrefix}-${
      new Date().toISOString().split("T")[0]
    }.ics`;

    this.downloadICS(icsContent, filename);
    return { success: true, count: validItems.length };
  }

  async exportScheduleICS() {
    try {
      return await this.exportICS({
        storageKey: "cache_attendance_flat",
        filenamePrefix: "FAP-Lich-Hoc",
        validator: (item) => this.isValidScheduleItem(item),
        builder: (data) => this.generateScheduleICS(data),
        emptyMessage: "Khong co du lieu lich hoc",
        invalidMessage: "Khong co lop hoc hop le",
      });
    } catch (error) {
      throw new Error(`Loi export lich hoc: ${error.message}`);
    }
  }

  async exportExamICS() {
    try {
      return await this.exportICS({
        storageKey: "cache_exams_flat",
        filenamePrefix: "FAP-Lich-Thi",
        validator: (exam) => this.isValidExamItem(exam),
        builder: (data) => this.generateExamICS(data),
        emptyMessage: "Khong co du lieu lich thi",
        invalidMessage: "Khong co ky thi hop le",
      });
    } catch (error) {
      throw new Error(`Loi export lich thi: ${error.message}`);
    }
  }

  downloadICS(content, filename) {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ===== MODAL FUNCTIONS =====
  showConfirmationModal(title, message, confirmText, cancelText) {
    return new Promise((resolve) => {
      const modal = document.getElementById("calendarModal");
      const modalTitle = document.getElementById("calendarModalTitle");
      const modalMessage = document.getElementById("calendarModalMessage");
      const modalActions = modal.querySelector(".modal-actions");

      modalTitle.textContent = title;
      modalMessage.innerHTML = message;

      modalActions.innerHTML = "";

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "primary";
      confirmBtn.textContent = confirmText;
      modalActions.appendChild(confirmBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = cancelText;
      modalActions.appendChild(cancelBtn);

      modal.style.display = "flex";

      const cleanup = () => {
        modal.style.display = "none";
        confirmBtn.removeEventListener("click", handleConfirm);
        cancelBtn.removeEventListener("click", handleCancel);
      };

      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      confirmBtn.addEventListener("click", handleConfirm);
      cancelBtn.addEventListener("click", handleCancel);
    });
  }
}

window.CalendarService = CalendarService;
