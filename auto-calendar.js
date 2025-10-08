// Calendar Export & Auto Import Service
class CalendarService {
  // ===== EXPORT FUNCTIONS =====

  // Escape text cho ICS format
  escapeICSText(text) {
    if (!text) return "";
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "");
  }

  // Tạo file ICS cho lịch học
  generateScheduleICS(scheduleData) {
    const icsContent = this.createICSHeader("FAP Lịch học");

    scheduleData.forEach((classItem, index) => {
      if (classItem.time && classItem.time.includes("-") && classItem.course) {
        const event = this.createScheduleEvent(classItem, index);
        icsContent.push(...event);
      }
    });

    icsContent.push("END:VCALENDAR");
    return icsContent.join("\r\n");
  }

  // Tạo file ICS cho lịch thi
  generateExamICS(examData) {
    const icsContent = this.createICSHeader("FAP Lịch thi");

    examData.forEach((exam, index) => {
      if (exam.date && exam.time && exam.code) {
        const event = this.createExamEvent(exam, index);
        icsContent.push(...event);
      }
    });

    icsContent.push("END:VCALENDAR");
    return icsContent.join("\r\n");
  }

  // Tạo header cho file ICS
  createICSHeader(calendarName) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FAP Dashboard//FAP Schedule//VI",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${calendarName}`,
      "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    ];
  }

  // Tạo event cho lịch học
  createScheduleEvent(classItem, index) {
    const [startTime, endTime] = classItem.time.split("-");
    const startDateTime = this.parseDateTime(classItem.date, startTime.trim());
    const endDateTime = this.parseDateTime(classItem.date, endTime.trim());

    const uid = `fap-class-${index}-${Date.now()}@fpt.edu.vn`;
    const summary = this.escapeICSText(
      `${classItem.course} - ${classItem.room || "N/A"}`
    );
    const description = this.escapeICSText(
      `Môn học: ${classItem.course}\nPhòng: ${
        classItem.room || "N/A"
      }\nTrạng thái: ${classItem.status}\n\nTạo bởi FAP Dashboard`
    );
    const location = this.escapeICSText(classItem.room || "FPT University");

    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${startDateTime}`,
      `DTEND:${endDateTime}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Nhắc nhở trước 15 phút",
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT5M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Nhắc nhở trước 5 phút",
      "END:VALARM",
      "END:VEVENT",
    ];
  }

  // Tạo event cho lịch thi
  createExamEvent(exam, index) {
    const startDateTime = this.parseExamDateTime(exam.date, exam.time, true);
    const endDateTime = this.parseExamDateTime(exam.date, exam.time, false);

    const uid = `fap-exam-${index}-${Date.now()}@fpt.edu.vn`;
    const summary = this.escapeICSText(`📝 THI: ${exam.code} - ${exam.name}`);
    const description = this.escapeICSText(
      `Môn thi: ${exam.name} (${exam.code})\nHình thức: ${exam.form}\nPhòng: ${exam.room}\nLoại: ${exam.type}\n\nTạo bởi FAP Dashboard`
    );
    const location = this.escapeICSText(exam.room || "FPT University");

    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${startDateTime}`,
      `DTEND:${endDateTime}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Nhắc nhở trước 1 giờ",
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Nhắc nhở trước 30 phút",
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Nhắc nhở trước 15 phút",
      "END:VALARM",
      "END:VEVENT",
    ];
  }

  // Parse thời gian cho lịch học
  parseDateTime(dateStr, timeStr) {
    try {
      if (!dateStr || !timeStr) {
        console.error("Missing date or time:", { dateStr, timeStr });
        return this.formatICSDateTime(new Date());
      }

      const dateParts = dateStr.split("/");
      const timeParts = timeStr.split(":");

      if (dateParts.length < 2 || timeParts.length < 2) {
        console.error("Invalid date or time format:", { dateStr, timeStr });
        return this.formatICSDateTime(new Date());
      }

      const day = parseInt(dateParts[0]) || 1;
      const month = parseInt(dateParts[1]) || 1;
      const currentYear = new Date().getFullYear();
      const hours = parseInt(timeParts[0]) || 0;
      const minutes = parseInt(timeParts[1]) || 0;

      const date = new Date(currentYear, month - 1, day, hours, minutes, 0);

      if (isNaN(date.getTime())) {
        console.error("Invalid date created:", {
          day,
          month,
          currentYear,
          hours,
          minutes,
        });
        return this.formatICSDateTime(new Date());
      }

      return this.formatICSDateTime(date);
    } catch (error) {
      console.error("Error parsing date time:", error, { dateStr, timeStr });
      return this.formatICSDateTime(new Date());
    }
  }

  // Parse thời gian cho lịch thi
  parseExamDateTime(dateStr, timeStr, isStart) {
    try {
      let day, month, year;

      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        day = parts[0];
        month = parts[1];
        year = parts[2] || new Date().getFullYear();
      } else {
        const today = new Date();
        day = today.getDate();
        month = today.getMonth() + 1;
        year = today.getFullYear();
      }

      let time;
      if (timeStr && timeStr.includes("-")) {
        const [startTime, endTime] = timeStr.split("-");
        time = isStart ? startTime.trim() : endTime.trim();
      } else if (timeStr) {
        time = timeStr.trim();
        if (!isStart) {
          const timeParts = time.split(":");
          if (timeParts.length >= 2) {
            const hours = parseInt(timeParts[0]) || 0;
            const minutes = parseInt(timeParts[1]) || 0;
            const endTime = new Date();
            endTime.setHours(hours + 2, minutes, 0, 0);
            time = `${endTime.getHours().toString().padStart(2, "0")}:${endTime
              .getMinutes()
              .toString()
              .padStart(2, "0")}`;
          }
        }
      } else {
        time = isStart ? "08:00" : "10:00";
      }

      const timeParts = time.split(":");
      const hours = parseInt(timeParts[0]) || 0;
      const minutes = parseInt(timeParts[1]) || 0;

      const validDay = parseInt(day) || 1;
      const validMonth = parseInt(month) || 1;
      const validYear = parseInt(year) || new Date().getFullYear();

      const date = new Date(
        validYear,
        validMonth - 1,
        validDay,
        hours,
        minutes,
        0
      );

      if (isNaN(date.getTime())) {
        console.error("Invalid date created:", {
          day,
          month,
          year,
          hours,
          minutes,
        });
        return this.formatICSDateTime(new Date());
      }

      return this.formatICSDateTime(date);
    } catch (error) {
      console.error("Error parsing exam date time:", error, {
        dateStr,
        timeStr,
        isStart,
      });
      return this.formatICSDateTime(new Date());
    }
  }

  // Format thời gian theo chuẩn ICS
  formatICSDateTime(date) {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }

  // Download file ICS
  downloadICS(content, filename) {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ===== EXPORT FUNCTIONS =====

  // Export lịch học
  async exportScheduleICS() {
    try {
      const scheduleData = await STORAGE.get("cache_attendance_flat", []);

      if (!scheduleData || scheduleData.length === 0) {
        throw new Error("Không có dữ liệu lịch học");
      }

      const validClasses = scheduleData.filter(
        (item) => item.time && item.time.includes("-") && item.course
      );

      if (validClasses.length === 0) {
        throw new Error("Không có lớp học hợp lệ");
      }

      const icsContent = this.generateScheduleICS(validClasses);
      const filename = `FAP-Lich-Hoc-${
        new Date().toISOString().split("T")[0]
      }.ics`;

      this.downloadICS(icsContent, filename);

      return { success: true, count: validClasses.length };
    } catch (error) {
      throw new Error(`Lỗi export lịch học: ${error.message}`);
    }
  }

  // Export lịch thi
  async exportExamICS() {
    try {
      const examData = await STORAGE.get("cache_exams_flat", []);

      if (!examData || examData.length === 0) {
        throw new Error("Không có dữ liệu lịch thi");
      }

      const validExams = examData.filter(
        (exam) => exam.date && exam.time && exam.code
      );

      if (validExams.length === 0) {
        throw new Error("Không có kỳ thi hợp lệ");
      }

      const icsContent = this.generateExamICS(validExams);
      const filename = `FAP-Lich-Thi-${
        new Date().toISOString().split("T")[0]
      }.ics`;

      this.downloadICS(icsContent, filename);

      return { success: true, count: validExams.length };
    } catch (error) {
      throw new Error(`Lỗi export lịch thi: ${error.message}`);
    }
  }

  // ===== MODAL FUNCTIONS =====

  // Hiển thị modal xác nhận
  showConfirmationModal(title, message, confirmText, cancelText) {
    return new Promise((resolve) => {
      const modal = document.getElementById("calendarModal");
      const modalTitle = document.getElementById("calendarModalTitle");
      const modalMessage = document.getElementById("calendarModalMessage");
      const modalActions = modal.querySelector(".modal-actions");

      modalTitle.textContent = title;
      modalMessage.innerHTML = message;

      // Clear existing buttons
      modalActions.innerHTML = "";

      // Create buttons
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

// Export for use
window.CalendarService = CalendarService;
