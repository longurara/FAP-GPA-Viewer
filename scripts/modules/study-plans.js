// Study Plans module extracted from popup.js
class StudyPlans {
  constructor() {
    this.plans = [];
    this.init();
  }

  async init() {
    try {
      await this.loadPlans();
      this.setupEventListeners();
      this.renderPlans();
    } catch (error) {
      console.error("[StudyPlans] Error initializing:", error);
    }
  }

  async loadPlans() {
    try {
      const savedPlans = await STORAGE.get("study_plans", []);
      this.plans = savedPlans;
    } catch (error) {
      console.error("[StudyPlans] Error loading plans:", error);
      this.plans = [];
    }
  }

  async savePlans() {
    try {
      await STORAGE.set({ study_plans: this.plans });
    } catch (error) {
      console.error("[StudyPlans] Error saving plans:", error);
    }
  }

  setupEventListeners() {
    const btnCreatePlan = document.getElementById("btnCreatePlan");
    if (btnCreatePlan) {
      btnCreatePlan.addEventListener("click", () => {
        this.showCreatePlanModal();
      });
    }

    const planFilter = document.getElementById("planFilter");
    if (planFilter) {
      planFilter.addEventListener("change", (e) => {
        this.filterPlans(e.target.value);
      });
    }
  }

  showCreatePlanModal() {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-box">
        <h3 class="modal-title">📑 Tạo kế hoạch học tập</h3>
        <div class="modal-content">
          <div class="form-group">
            <label>Tên kế hoạch:</label>
            <input type="text" id="planName" placeholder="VD: Ôn thi cuối kỳ" />
          </div>
          <div class="form-group">
            <label>Mô tả:</label>
            <textarea id="planDescription" placeholder="Mô tả chi tiết kế hoạch..."></textarea>
          </div>
          <div class="form-group">
            <label>Môn học:</label>
            <input type="text" id="planSubject" placeholder="VD: Toán cao cấp" />
          </div>
          <div class="form-group">
            <label>Thời gian (phút):</label>
            <input type="number" id="planDuration" value="120" min="30" max="480" />
          </div>
          <div class="form-group">
            <label>Mục tiêu:</label>
            <input type="text" id="planGoal" placeholder="VD: Hoàn thành chương 1-3" />
          </div>
        </div>
        <div class="modal-actions">
          <button class="secondary" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="create-plan">Tạo kế hoạch</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  createPlan() {
    const nameEl = document.getElementById("planName");
    const descriptionEl = document.getElementById("planDescription");
    const subjectEl = document.getElementById("planSubject");
    const durationEl = document.getElementById("planDuration");
    const goalEl = document.getElementById("planGoal");

    const name = nameEl ? nameEl.value.trim() : "";
    const description = descriptionEl ? descriptionEl.value.trim() : "";
    const subject = subjectEl ? subjectEl.value.trim() : "";
    const duration = durationEl ? parseInt(durationEl.value) : 0;
    const goal = goalEl ? goalEl.value.trim() : "";

    if (!name || !subject || duration <= 0) {
      Toast.error("Vui lòng nhập đầy đủ thông tin hợp lệ");
      return;
    }

    const newPlan = {
      id: crypto.randomUUID(),
      name,
      description,
      subject,
      duration,
      goal,
      status: "active",
      progress: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    this.plans.unshift(newPlan);
    this.savePlans();
    this.renderPlans();

    Toast.success("Đã tạo kế hoạch mới");
    document.querySelector(".modal-overlay")?.remove();
  }

  startPlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "active";
      this.savePlans();
      this.renderPlans();
      Toast.success(`Bắt đầu kế hoạch: ${plan.name}`);
    }
  }

  pausePlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "paused";
      this.savePlans();
      this.renderPlans();
      Toast.info(`Tạm dừng kế hoạch: ${plan.name}`);
    }
  }

  resumePlan(planId) {
    this.startPlan(planId);
  }

  completePlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "completed";
      plan.progress = 100;
      plan.completedAt = new Date().toISOString();
      this.savePlans();
      this.renderPlans();
      Toast.success(`Hoàn thành kế hoạch: ${plan.name}`);
    }
  }

  restartPlan(planId) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = "active";
      plan.progress = 0;
      plan.completedAt = null;
      this.savePlans();
      this.renderPlans();
      Toast.success(`Làm lại kế hoạch: ${plan.name}`);
    }
  }

  deletePlan(planId) {
    if (confirm("Bạn có chắc muốn xóa kế hoạch này?")) {
      this.plans = this.plans.filter((p) => p.id !== planId);
      this.savePlans();
      this.renderPlans();
      Toast.success("Kế hoạch đã được xóa!");
    }
  }

  filterPlans() {
    this.renderPlans();
  }

  updatePlanProgress(planId, progress) {
    const plan = this.plans.find((p) => p.id === planId);
    if (plan) {
      plan.progress = Math.min(progress, 100);
      this.savePlans();
      this.renderPlans();
    }
  }

  renderPlans() {
    const container = document.getElementById("studyPlans");
    if (!container) return;

    if (!this.plans.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Chưa có kế hoạch nào.</p>
          <button class="primary" data-action="show-create-plan-modal">Tạo kế hoạch đầu tiên</button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.plans
      .map(
        (plan) => `
      <div class="plan-card" data-plan-id="${plan.id}">
        <div class="plan-header">
          <h4>${plan.name}</h4>
          <span class="status ${plan.status}">${this.getStatusText(plan.status)}</span>
        </div>
        <div class="plan-details">
          <span>📚 ${plan.subject}</span>
          <span>⏱️ ${Math.round(plan.duration / 60)}h</span>
          <span>🎯 ${plan.goal}</span>
        </div>
        <div class="plan-progress">
          <div class="plan-progress-bar" style="width: ${plan.progress || 0}%"></div>
        </div>
        <div class="plan-actions">
          ${this.getPlanActions(plan)}
        </div>
      </div>
    `
      )
      .join("");
  }

  getStatusText(status) {
    const statusMap = {
      active: "Đang hoạt động",
      completed: "Hoàn thành",
      paused: "Tạm dừng",
    };
    return statusMap[status] || status;
  }

  getPlanActions(plan) {
    if (plan.status === "active") {
      return `
        <button class="plan-btn primary" data-action="start-plan" data-plan-id="${plan.id}">Bắt đầu</button>
        <button class="plan-btn" data-action="pause-plan" data-plan-id="${plan.id}">Tạm dừng</button>
        <button class="plan-btn success" data-action="complete-plan" data-plan-id="${plan.id}">Hoàn thành</button>
        <button class="plan-btn danger" data-action="delete-plan" data-plan-id="${plan.id}">Xóa</button>
      `;
    } else if (plan.status === "paused") {
      return `
        <button class="plan-btn primary" data-action="resume-plan" data-plan-id="${plan.id}">Tiếp tục</button>
        <button class="plan-btn success" data-action="complete-plan" data-plan-id="${plan.id}">Hoàn thành</button>
        <button class="plan-btn danger" data-action="delete-plan" data-plan-id="${plan.id}">Xóa</button>
      `;
    }
    return `
      <button class="plan-btn" data-action="restart-plan" data-plan-id="${plan.id}">Làm lại</button>
      <button class="plan-btn danger" data-action="delete-plan" data-plan-id="${plan.id}">Xóa</button>
    `;
  }
}

window.StudyPlans = StudyPlans;
