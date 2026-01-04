// Modal and Toast utilities extracted from popup.js
const Modal = {
  overlay: null,
  box: null,
  icon: null,
  title: null,
  message: null,
  confirmBtn: null,
  cancelBtn: null,

  init() {
    this.overlay = document.getElementById("modalOverlay");

    // Fix: If overlay exists but is outdated (missing subtitle), remove it to force recreation
    if (this.overlay && !this.overlay.querySelector(".modal-subtitle")) {
      this.overlay.remove();
      this.overlay = null;
    }

    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.id = "modalOverlay";
      this.overlay.className = "modal-overlay";
      this.overlay.className = "modal-overlay";
      this.overlay.innerHTML = `
        <div class="modal-box">
          <div class="modal-icon"></div>
          <h3 class="modal-title"></h3>
          <p class="modal-subtitle"></p>
          <p class="modal-message"></p>
          <div class="modal-actions">
            <button id="modalCancel" class="secondary">Hủy</button>
            <button id="modalConfirm" class="primary">OK</button>
          </div>
        </div>`;
      document.body.appendChild(this.overlay);
    }

    this.box = this.overlay.querySelector(".modal-box");
    this.icon = this.overlay.querySelector(".modal-icon");
    this.title = this.overlay.querySelector(".modal-title");
    this.subtitle = this.overlay.querySelector(".modal-subtitle");
    this.message = this.overlay.querySelector(".modal-message");
    this.confirmBtn = this.overlay.querySelector("#modalConfirm");
    this.cancelBtn = this.overlay.querySelector("#modalCancel");

    // Close when clicking outside
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlay?.classList.contains("active")) {
        this.close();
      }
    });
  },

  show({
    icon = "ℹ️",
    title = "Thông báo",
    subtitle = "",
    message = "",
    confirmText = "OK",
    cancelText = "Hủy",
    showCancel = false,
    onConfirm = null,
    onCancel = null,
  }) {
    // Debugging: Log who is calling the modal
    if (!message || String(message).trim() === "") {
      console.group("Modal.show called with empty message");
      console.warn("Title:", title);
      console.warn("Message (raw):", message);
      console.trace("Stack trace:");
      console.groupEnd();
    }

    return new Promise((resolve) => {
      // SAFEGUARD: Don't show modal if message is empty (or whitespace) and title is default
      // This fixes the issue where an empty "Thông báo" modal appears on startup
      if ((!message || String(message).trim() === "") && title === "Thông báo") {
        console.warn("Blocked empty modal with default title");
        resolve(true);
        return;
      }

      if (!this.overlay) this.init();

      this.icon.textContent = icon;
      this.title.textContent = title;

      // Handle subtitle
      if (this.subtitle) {
        if (subtitle) {
          this.subtitle.textContent = subtitle;
          this.subtitle.style.display = "block";
        } else {
          this.subtitle.style.display = "none";
        }
      }

      this.message.innerHTML = message || ""; // Allow HTML for bold text
      this.confirmBtn.textContent = confirmText;
      this.cancelBtn.textContent = cancelText;
      this.cancelBtn.style.display = showCancel ? "block" : "none";

      // Remove old listeners
      const newConfirmBtn = this.confirmBtn.cloneNode(true);
      const newCancelBtn = this.cancelBtn.cloneNode(true);
      this.confirmBtn.parentNode.replaceChild(newConfirmBtn, this.confirmBtn);
      this.cancelBtn.parentNode.replaceChild(newCancelBtn, this.cancelBtn);
      this.confirmBtn = newConfirmBtn;
      this.cancelBtn = newCancelBtn;

      this.confirmBtn.addEventListener("click", () => {
        this.close();
        if (onConfirm) onConfirm();
        resolve(true);
      });

      this.cancelBtn.addEventListener("click", () => {
        this.close();
        if (onCancel) onCancel();
        resolve(false);
      });

      this.overlay.classList.add("active");
      this.box.classList.remove("success");
    });
  },

  alert(message, options = {}) {
    return this.show({
      icon: options.icon || "ℹ️",
      title: options.title || "Thông báo",
      subtitle: options.subtitle || "",
      message,
      confirmText: "OK",
      showCancel: false,
    });
  },

  confirm(message, options = {}) {
    return this.show({
      icon: options.icon || "❓",
      title: options.title || "Xác nhận",
      subtitle: options.subtitle || "",
      message,
      confirmText: options.confirmText || "Xác nhận",
      cancelText: options.cancelText || "Hủy",
      showCancel: true,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
    });
  },

  success(message, title = "Thành công") {
    const result = this.alert(message, { icon: "✔", title });
    if (this.box) this.box.classList.add("success");
    return result;
  },

  error(message, title = "Lỗi") {
    return this.alert(message, { icon: "✖", title });
  },

  warning(message, title = "Cảnh báo") {
    return this.alert(message, { icon: "⚠", title });
  },

  close() {
    this.overlay?.classList.remove("active");
    if (this.box) this.box.classList.remove("success");
  },
};

const Toast = {
  container: null,

  init() {
    this.container = document.getElementById("toastContainer");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toastContainer";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  },

  show({ icon = "ℹ️", title = "", message = "", type = "info", duration = 3000 }) {
    if (!this.container) this.init();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ""}
        <div class="toast-message">${message}</div>
      </div>
    `;

    this.container.appendChild(toast);

    toast.addEventListener("click", () => this.remove(toast));

    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }
  },

  remove(toast) {
    toast.classList.add("removing");
    setTimeout(() => toast.remove(), 200);
  },

  success(message, title = "Thành công") {
    this.show({ icon: "✔", title, message, type: "success" });
  },

  error(message, title = "Lỗi") {
    this.show({ icon: "✖", title, message, type: "error" });
  },

  info(message, title = "") {
    this.show({ icon: "ℹ️", title, message, type: "info" });
  },

  warning(message, title = "Cảnh báo") {
    this.show({ icon: "⚠", title, message, type: "warning" });
  },
};

// Make available globally
window.Modal = Modal;
window.Toast = Toast;
