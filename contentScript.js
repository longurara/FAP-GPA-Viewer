(function () {
  const STORAGE_KEY = "__FAP_EXCLUDED_CODES__";
  const DEFAULT_EXCLUDED = [
    "TRS501",
    "ENT503",
    "VOV114",
    "VOV124",
    "VOV134",
    "OTP101",
  ];
  const NORM = (s) => (s || "").replace(/\s+/g, " ").trim().toUpperCase();
  function toNum(txt) {
    const m = (txt || "").match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(",", ".")) : NaN;
  }
  function loadExcluded() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return JSON.parse(s);
    } catch {}
    return [...DEFAULT_EXCLUDED];
  }

  function findScoreTable() {
    const tables = [...document.querySelectorAll("table")];
    for (const t of tables) {
      const trs = [...t.querySelectorAll("tr")];
      for (const tr of trs) {
        const labels = [...tr.children].map((td) => NORM(td.textContent));
        if (labels.includes("CREDIT") && labels.includes("GRADE")) {
          const header = [...tr.children].map((x) => NORM(x.textContent));
          const idx = {
            term: header.findIndex((v) => v === "TERM"),
            semester: header.findIndex((v) => v === "SEMESTER"),
            code: header.findIndex((v) => v.includes("SUBJECT CODE")),
            name: header.findIndex(
              (v) => v.includes("SUBJECT NAME") || v.includes("SUBJECT")
            ),
            credit: header.indexOf("CREDIT"),
            grade: header.indexOf("GRADE"),
            status: header.findIndex((v) => v === "STATUS"),
          };
          const all = [...t.querySelectorAll("tr")];
          const start = all.indexOf(tr) + 1;
          return { table: t, rows: all.slice(start), idx };
        }
      }
    }
    return null;
  }

  function extractTranscript() {
    const meta = findScoreTable();
    if (!meta) return null;
    const { rows, idx } = meta;
    const data = [];
    for (const r of rows) {
      const tds = [...r.querySelectorAll("td")];
      if (!tds.length) continue;
      const row = {
        term: idx.term >= 0 ? tds[idx.term]?.textContent.trim() : "",
        semester:
          idx.semester >= 0 ? tds[idx.semester]?.textContent.trim() : "",
        code: idx.code >= 0 ? tds[idx.code]?.textContent.trim() : "",
        name: idx.name >= 0 ? tds[idx.name]?.textContent.trim() : "",
        credit: idx.credit >= 0 ? toNum(tds[idx.credit]?.textContent) : NaN,
        grade: idx.grade >= 0 ? toNum(tds[idx.grade]?.textContent) : NaN,
        status: idx.status >= 0 ? tds[idx.status]?.textContent.trim() : "",
      };
      if (!row.code && !row.name && !Number.isFinite(row.credit)) continue;
      data.push(row);
    }
    return data;
  }

  function computeGPA(items, excluded) {
    let sumC = 0,
      sumP = 0;
    for (const it of items) {
      const code = (it.code || "").toUpperCase(),
        c = it.credit,
        g = it.grade;
      if (!Number.isFinite(c) || !Number.isFinite(g) || c <= 0 || g <= 0)
        continue;
      if (excluded.includes(code)) continue;
      sumC += c;
      sumP += c * g;
    }
    const gpa10 = sumC > 0 ? sumP / sumC : NaN;
    const gpa4 = Number.isFinite(gpa10) ? (gpa10 / 10) * 4 : NaN;
    return { gpa10, gpa4, credits: sumC };
  }

  function encodeData(obj) {
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)));
  }

  function openViewer() {
    const rows = extractTranscript();
    if (!rows || !rows.length) {
      alert("Không lấy được bảng điểm.");
      return;
    }
    const meta = { time: Date.now(), url: location.href };
    const payload = { meta, rows };
    const data = encodeData(payload);
    window.open(chrome.runtime.getURL(`viewer.html#data=${data}`), "_blank");
  }

  // === Overlay GPA (dùng excluded list từ localStorage) ===
  function showOverlayGPA() {
    const rows = extractTranscript();
    if (!rows) {
      alert("Chưa tìm thấy bảng điểm.");
      return;
    }
    const g = computeGPA(rows, loadExcluded());
    document.getElementById("__FAP_GPA_OVERLAY__")?.remove();
    const box = document.createElement("div");
    box.id = "__FAP_GPA_OVERLAY__";
    box.style.cssText = `
      position:fixed; top:20px; right:20px; z-index:2147483647;
      background:rgba(0,0,0,.85); color:#fff; padding:10px 14px;
      border-radius:10px; font-size:14px; font-weight:700;
      box-shadow:0 6px 16px rgba(0,0,0,.25);
    `;
    box.textContent = Number.isFinite(g.gpa10)
      ? `📊 GPA(10): ${g.gpa10.toFixed(2)} • GPA(4): ${g.gpa4.toFixed(
          2
        )} • TC: ${g.credits}`
      : "📊 GPA: Không tính được";
    document.body.appendChild(box);
  }

  function copyGPA() {
    const rows = extractTranscript();
    if (!rows) return;
    const g = computeGPA(rows, loadExcluded());
    if (!Number.isFinite(g.gpa10)) return alert("Không tính được GPA.");
    const text = `GPA(10): ${g.gpa10.toFixed(2)} | GPA(4): ${g.gpa4.toFixed(
      2
    )} | TC: ${g.credits}`;
    navigator.clipboard.writeText(text);
    alert("Đã copy: " + text);
  }

  // Hook Export button
  function isExportButton(el) {
    const txt = (el.innerText || el.value || "").trim().toUpperCase();
    const id = (el.id || "").toUpperCase();
    const onclick = (el.getAttribute("onclick") || "").toUpperCase();
    return (
      (txt.includes("EXPORT") && txt.includes("EXCEL")) ||
      (id.includes("EXPORT") && id.includes("EXCEL")) ||
      (onclick.includes("EXPORT") && onclick.includes("EXCEL"))
    );
  }
  document.addEventListener(
    "click",
    (ev) => {
      const path = ev.composedPath ? ev.composedPath() : [];
      const target = path.find((n) => n instanceof HTMLElement) || ev.target;
      let el = target;
      for (let i = 0; i < 3 && el; i++) {
        if (
          el instanceof HTMLButtonElement ||
          el instanceof HTMLAnchorElement ||
          el instanceof HTMLInputElement
        ) {
          if (isExportButton(el)) {
            ev.preventDefault();
            ev.stopPropagation();
            openViewer();
            return;
          }
        }
        el = el.parentElement;
      }
    },
    true
  );

  // Gear + menu
  function injectGear() {
    if (document.getElementById("__FAP_GEAR__")) return;
    const gear = document.createElement("button");
    gear.id = "__FAP_GEAR__";
    gear.type = "button";
    gear.textContent = "⚙️";
    gear.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:2147483647;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;font-size:24px;color:#fff;background:linear-gradient(135deg,#4f46e5,#06b6d4);box-shadow:0 10px 18px rgba(0,0,0,.24);`;
    document.body.appendChild(gear);

    const menu = document.createElement("div");
    menu.style.cssText = `position:fixed;bottom:80px;right:20px;z-index:2147483647;background:#fff;color:#111827;border-radius:10px;width:240px;padding:6px;display:none;box-shadow:0 10px 24px rgba(0,0,0,.18);font-size:14px;border:1px solid #e5e7eb;`;
    document.body.appendChild(menu);

    function addItem(text, cb) {
      const it = document.createElement("div");
      it.textContent = text;
      it.style.cssText = `padding:10px 12px;cursor:pointer;border-radius:8px;`;
      it.onmouseenter = () => (it.style.background = "#f3f4f6");
      it.onmouseleave = () => (it.style.background = "transparent");
      it.onclick = () => {
        cb();
        menu.style.display = "none";
      };
      menu.appendChild(it);
    }
    addItem("Mở GPA chi tiết", openViewer);
    addItem("Hiện GPA overlay", showOverlayGPA);
    addItem("Copy GPA", copyGPA);

    gear.onclick = () => {
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    };
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", injectGear);
  else injectGear();
})();
