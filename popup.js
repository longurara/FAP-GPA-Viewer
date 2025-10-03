// ====== FAP Dashboard (popup) with caching + ScheduleOfWeek attendance ======
const STORAGE = {
  get: (k, d) => new Promise(r => chrome.storage.local.get({[k]: d}, v => r(v[k]))),
  set: (obj) => new Promise(r => chrome.storage.local.set(obj, r)),
  remove: (k) => new Promise(r => chrome.storage.local.remove(k, r)),
};

const DEFAULT_URLS = {
  transcript: 'https://fap.fpt.edu.vn/Grade/StudentTranscript.aspx',
  scheduleOfWeek: 'https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx'
};

function $(sel){return document.querySelector(sel)}
function setValue(id, v){const el=$(id); if(el) el.textContent = v;}
function toNum(txt){const m=(txt||"").match(/-?\d+(?:[.,]\d+)?/);return m?parseFloat(m[0].replace(',', '.')):NaN;}
function NORM(s){return (s||"").replace(/\s+/g, " ").trim().toUpperCase()}

// ===== Update checker (GitHub Releases) =====
const REPO = 'longurara/FAP-GPA-Viewer';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_PAGE = 'https://github.com/longurara/FAP-GPA-Viewer/releases/latest';

function semverParts(v){
  const m = String(v||'').trim().replace(/^v/i,'').match(/^(\d+)\.(\d+)\.(\d+)(.*)?$/);
  if(!m) return [0,0,0,''];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4]||''];
}
function semverCmp(a,b){
  const A=semverParts(a), B=semverParts(b);
  for(let i=0;i<3;i++){ if((A[i]||0)!==(B[i]||0)) return (A[i]||0)-(B[i]||0); }
  return 0;
}

async function checkUpdate(force=false){
  const CACHE_KEY = '__gh_latest_release__';
  const now = Date.now();
  const cached = await STORAGE.get(CACHE_KEY, null);
  let latest = null;
  if(!force && cached && (now - cached.ts) < 6*60*60*1000){
    latest = cached.data;
  } else {
    const res = await fetch(LATEST_API, { headers: { 'Accept': 'application/vnd.github+json' }});
    if(!res.ok) throw new Error('GitHub API error ' + res.status);
    const j = await res.json();
    latest = {
      tag: j.tag_name || j.name || '',
      url: j.html_url || RELEASE_PAGE,
      published_at: j.published_at || ''
    };
    await STORAGE.set({[CACHE_KEY]: {ts: now, data: latest}});
  }

  const curr = chrome.runtime.getManifest().version;
  const latestClean = (latest.tag||'').replace(/^v/i,'');
  const cmp = semverCmp(latestClean, curr);

  const badge = document.getElementById('verBadge');
  const btn = document.getElementById('btnCheckUpdate');

  if(badge){ badge.textContent = `v${curr}`; }

  if(cmp > 0){
    if(badge){
      badge.innerHTML = `v${curr} → <strong>v${latestClean}</strong>`;
      badge.style.color = 'var(--accent)';
    }
    if(btn){
      btn.textContent = 'Cập nhật';
      btn.onclick = ()=> chrome.tabs.create({ url: latest.url || RELEASE_PAGE });
      btn.classList.add('primary');
    }
  } else {
    if(btn){
      btn.textContent = 'Check update';
      btn.onclick = async ()=>{
        try { await checkUpdate(true); alert('Bạn đang ở phiên bản mới nhất.'); }
        catch(e){ alert('Không kiểm tra được cập nhật: ' + e.message); }
      };
    }
  }
}




async function fetchHTML(url){
  const res = await fetch(url, {credentials:'include', redirect:'follow'});
  if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)){
    const loginUrl = 'https://fap.fpt.edu.vn/';
    alert('Bạn chưa đăng nhập FAP. Mình sẽ mở trang FAP. Hãy đăng nhập, rồi quay lại popup và bấm "Làm mới".');
    chrome.tabs.create({url: loginUrl});
    throw new Error('LOGIN_REQUIRED');
  }
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return dom;
}

// ---------- Simple cache (ms TTL) ----------
async function cacheGet(key, maxAgeMs){
  const obj = await STORAGE.get(key, null);
  if(!obj) return null;
  const {ts, data} = obj;
  if(!ts || Date.now() - ts > maxAgeMs) return null;
  return data;
}
async function cacheSet(key, data){
  await STORAGE.set({[key]: {ts: Date.now(), data}});
}

// ---------- Transcript parsing ----------
function parseTranscriptDoc(doc){
  const tables = [...doc.querySelectorAll('table')];
  for(const t of tables){
    const trs = [...t.querySelectorAll('tr')];
    for(const tr of trs){
      const labels = [...tr.children].map(td => NORM(td.textContent));
      if(labels.includes('CREDIT') && labels.includes('GRADE')){
        const header = [...tr.children].map(x => NORM(x.textContent));
        const idx = {
          term: header.findIndex(v => v === 'TERM'),
          semester: header.findIndex(v => v === 'SEMESTER'),
          code: header.findIndex(v => v.includes('SUBJECT CODE')),
          name: header.findIndex(v => v.includes('SUBJECT NAME') || v.includes('SUBJECT')),
          credit: header.indexOf('CREDIT'),
          grade: header.indexOf('GRADE'),
          status: header.findIndex(v => v === 'STATUS'),
        };
        const all = [...t.querySelectorAll('tr')];
        const start = all.indexOf(tr) + 1;
        const rows = [];
        for(const r of all.slice(start)){
          const tds = [...r.querySelectorAll('td')];
          if(!tds.length) continue;
          const row = {
            term: idx.term>=0 ? tds[idx.term]?.textContent.trim() : "",
            semester: idx.semester>=0 ? tds[idx.semester]?.textContent.trim() : "",
            code: idx.code>=0 ? tds[idx.code]?.textContent.trim() : "",
            name: idx.name>=0 ? tds[idx.name]?.textContent.trim() : "",
            credit: idx.credit>=0 ? toNum(tds[idx.credit]?.textContent) : NaN,
            grade: idx.grade>=0 ? toNum(tds[idx.grade]?.textContent) : NaN,
            status: idx.status>=0 ? tds[idx.status]?.textContent.trim() : "",
          };
          if(!row.code && !row.name && !Number.isFinite(row.credit)) continue;
          rows.push(row);
        }
        return rows;
      }
    }
  }
  return [];
}

function computeGPA(items, excluded){
  let sumC=0, sumP=0;
  for(const it of items){
    const c=it.credit, g=it.grade, code=(it.code||'').toUpperCase();
    if(!Number.isFinite(c)||!Number.isFinite(g)||c<=0||g<=0) continue;
    if(excluded.includes(code)) continue;
    sumC += c; sumP += c*g;
  }
  const g10 = sumC>0 ? (sumP/sumC) : NaN;
  const g4  = Number.isFinite(g10) ? (g10/10)*4 : NaN;
  return {gpa10:g10, gpa4:g4, credits:sumC};
}

// ---------- Parse ScheduleOfWeek for attendance + today's schedule ----------
function parseScheduleOfWeek(doc){
  const result = { entries: [], todayRows: [] };
  const N = s => (s||'').replace(/\s+/g,' ').trim();
  const U = s => N(s).toUpperCase();

  // 1) Pick the grid table
  const tables = [...doc.querySelectorAll('table')];
  let grid = null;
  for(const t of tables){
    const txt = U(t.textContent);
    const hasWeek = /(MON|TUE|WED|THU|FRI|SAT|SUN)/.test(txt);
    const hasDate = /\b\d{2}\/\d{2}(?:\/\d{4})?\b/.test(txt);
    const hasSlots = [...t.querySelectorAll('tr')].some(r => /^SLOT\s*\d+$/i.test(U(r.children?.[0]?.textContent||'')));
    if(hasWeek && hasDate && hasSlots){ grid = t; break; }
  }
  if(!grid) return result;

  const rows = [...grid.querySelectorAll('tr')];
  if(!rows.length) return result;

  // 2) Header row (contains MON.. and dates)
  let headerRowIdx = rows.findIndex(r=>{
    const txt = U(r.textContent);
    return /(MON|TUE|WED|THU|FRI|SAT|SUN)/.test(txt) && /\b\d{2}\/\d{2}/.test(txt);
  });
  if(headerRowIdx === -1) return result;
  const headerCells = [...rows[headerRowIdx].querySelectorAll('td,th')];

  // 3) Build day columns from header cells (skip first cell which is blank/"YEAR/WEEK")
  const dayCols = [];
  for(let i=0;i<headerCells.length;i++){
    const t = headerCells[i];
    const up = U(t.textContent);
    const date = (up.match(/\b\d{2}\/\d{2}(?:\/\d{4})?\b/)||[])[0] || null;
    const wd = (up.match(/MON|TUE|WED|THU|FRI|SAT|SUN/)||[])[0] || null;
    // day columns must have either wd or date, and are never the very first "YEAR/WEEK" cell
    if(i>0 && (date || wd)){ dayCols.push({ idx:i, day: wd || '', date }); }
  }
  if(dayCols.length < 5) return result;

  // 4) Slot rows = rows with first cell "Slot X"
  const slotRows = rows.filter(r => /^SLOT\s*\d+$/i.test(U(r.children?.[0]?.textContent||'')));

  // Utilities
  const isEmptyCell = (raw) => {
    if(!raw) return true;
    const t = U(raw);
    return t === '-' || t === '—' || t === '–' || /^-+$/.test(t);
  };
  const pickTime = (raw) => (raw.match(/\b\d{2}:\d{2}-\d{2}:\d{2}\b/)||[])[0] || '';
  const pickRoom = (raw) => (raw.match(/\b[A-Z]\.\d+\b/)||[])[0] || (raw.match(/\bP\.\d+\b/)||[])[0] || '';
  const pickCode = (raw) => (raw.match(/\b[A-Z]{2,4}\d{3}\b/)||[])[0] || '';

  // 5) Extract
  for(const r of slotRows){
    const cells = [...r.querySelectorAll('td,th')];
    const slotName = N(cells[0]?.textContent||''); // "Slot 3"
    for(const d of dayCols){
      const cell = cells[d.idx]; if(!cell) continue;
      const raw = N(cell.textContent);
      if(isEmptyCell(raw)) continue;
      const code = pickCode(raw);
      const time = pickTime(raw);
      if(!code) continue; // must have a subject code to count
      const room = pickRoom(raw);
      let status = '';
      if(/ATTENDED/i.test(raw)) status='attended';
      else if(/ABSENT/i.test(raw)) status='absent';
      else if(/NOT YET/i.test(raw)) status='not yet';
      result.entries.push({
        day: d.day || (d.date ? d.date : ''),
        date: d.date || '',
        slot: slotName,
        time, course: code, room, status
      });
    }
  }

  // 6) Today rows (optional)
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const todayDM = `${dd}/${mm}`;
  const todayCols = dayCols.filter(dc => (dc.date || '').includes(todayDM));
  if(todayCols.length){
    const idx = todayCols[0].idx;
    for(const r of slotRows){
      const cell = r.children[idx];
      const raw = N(cell?.textContent||'');
      if(isEmptyCell(raw)) continue;
      const code = pickCode(raw);
      const time = pickTime(raw);
      if(!code && !time) continue;
      result.todayRows.push({ time, course: code, room: pickRoom(raw), note: (raw.match(/ONLINE|OFFLINE|LAB|EXAM/i)||[''])[0] });
    }
  }

  return result;
}

// ---------- Renderers ----------
function renderTranscript(rows, excluded){
  const g=computeGPA(rows, excluded);
  setValue('#gpa10', Number.isFinite(g.gpa10)?g.gpa10.toFixed(2):'--');
  setValue('#gpa4',  Number.isFinite(g.gpa4)?g.gpa4.toFixed(2):'--');
  setValue('#credits', g.credits || '--');

  const tbody = document.querySelector('#tblCourses tbody'); tbody.innerHTML='';
  const q = (document.querySelector('#searchCourse').value||'').toLowerCase();
  rows.forEach(r=>{
    if(q && !(String(r.code).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q))) return;
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${r.code||''}</td>
      <td>${r.name||''}</td>
      <td class="r">${Number.isFinite(r.credit)?r.credit:''}</td>
      <td class="r">${Number.isFinite(r.grade)?r.grade:''}</td>
      <td>${r.status||''}</td>
    `;
    tbody.appendChild(tr);
  });
}


function summarizeAttendance(entries){
  let present=0, absent=0, late=0, neutral=0;
  for(const e of entries){ if(!e) continue;
    const s=NORM(e.status||'');
    if(/ATTENDED|CÓ MẶT/.test(s)) present++;
    else if(/LATE|MUỘN/.test(s)) late++;         // muộn: không tính vắng, cũng không tính vào mẫu
    else if(/ABSENT|VẮNG/.test(s)) absent++;     // vắng thực sự
    else if(/NOT YET/.test(s)) neutral++;        // chưa diễn ra -> bỏ qua
  }
  const denom = present + absent;                // chỉ tính khi tiết đã chốt hiện diện/vắng
  const rate = denom ? Math.round((present/denom)*100) : 0;
  return {present, absent, late, rate, total: present+absent+late, neutral};
}

function renderAttendance(entries){
  const raw = (entries||[]).filter(e=>{
    if(!e) return false;
    const codeOk = !!(e.course && /\b[A-Z]{3}\d{3}\b/.test(e.course));
    const badStatus = /^\s*slot\s*\d+/i.test(e.status||'');
    return codeOk && !badStatus;
  });

  // populate day options (append unique dd/mm once)
  const sel = document.getElementById('filterDay');
  if(sel){
    const existing = new Set(Array.from(sel.options).map(o=>o.value));
    const ddmm = Array.from(new Set(raw.map(e=> (e.date||'').match(/^\d{2}\/\d{2}$/)?.[0]).filter(Boolean)));
    ddmm.forEach(d=>{ if(!existing.has(d)){ const o=document.createElement('option'); o.value=d; o.textContent=d; sel.appendChild(o);} });
  }

  // day filter
  const dayKey = (sel && sel.value) ? sel.value : 'ALL';
  const filtered = raw.filter(e=>{
    if(dayKey==='ALL') return true;
    if(/^\d{2}\/\d{2}$/.test(dayKey)) return (e.date===dayKey);
    return (e.day===dayKey);
  });

  // metrics based on filtered set
  const sum=summarizeAttendance(filtered);
  setValue('#attRate', sum.rate+'%');
  setValue('#attPresent', sum.present);
  setValue('#attAbsentLate', `${sum.absent}/${sum.late}`);

  // render table
  const tbody=document.querySelector('#tblAttendance tbody'); tbody.innerHTML='';
  const q = (document.querySelector('#searchAtt').value||'').toLowerCase();
  filtered.forEach(e=>{
    if(q && !(e.course?.toLowerCase().includes(q) || e.status?.toLowerCase().includes(q))) return;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${e.day||''}</td><td>${e.slot||''}</td><td>${e.course||''}</td><td>${e.status||''}</td>`;
    tbody.appendChild(tr);
  });
}
function _renderScheduleToday_DEPRECATED(rows){
  const tbody=document.querySelector('#tblScheduleToday tbody'); tbody.innerHTML='';
  if(!rows.length){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td colspan="4">Hôm nay không có tiết nào (hoặc trang lịch khác định dạng).</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.time||''}</td><td>${r.course||''}</td><td>${r.room||''}</td><td>${r.note||''}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------- Loaders with caching ----------
const EXCLUDED_KEY = "__FAP_EXCLUDED_CODES__";
const EXCLUDED_DEFAULT = ["TRS501","ENT503","VOV114","VOV124","VOV134","OTP101"];

const DAY_MS = 24*60*60*1000;

async function loadGPA(){
  // 24h cache: if cached data exists, use it; otherwise fetch and cache
  const cache = await cacheGet('cache_transcript', DAY_MS);
  let rows;
  if(cache && Array.isArray(cache.rows)) {
    rows = cache.rows;
  } else {
    const doc = await fetchHTML(DEFAULT_URLS.transcript);
    rows = parseTranscriptDoc(doc);
    await cacheSet('cache_transcript', {rows});
  }
  const excluded = (await STORAGE.get(EXCLUDED_KEY, EXCLUDED_DEFAULT));
  renderTranscript(rows, excluded);
}

async function refreshAttendance(){
  const doc = await fetchHTML(DEFAULT_URLS.scheduleOfWeek);
  const parsed = parseScheduleOfWeek(doc);
  await cacheSet('cache_attendance', parsed);
  renderAttendance(parsed.entries);
  renderScheduleWeek(parsed.entries);
}

async function loadAttendanceAndSchedule(){
  const cache = null; // bypass cache to avoid stale bad parse; will re-cache fresh
  if(cache){
    renderAttendance(cache.entries);
    renderScheduleWeek(cache.entries);
  }else{
    await refreshAttendance();
  }
}

// ---------- Settings (UI <-> storage) ----------
const DEFAULT_CFG = {activeFrom:'07:00', activeTo:'17:40', delayMin:10, delayMax:30, pollEvery:15};

async function loadSettingsUI(){
  const cfg = await STORAGE.get('cfg', DEFAULT_CFG);
  const get = id => document.getElementById(id);
  get('setActiveFrom').value = cfg.activeFrom || DEFAULT_CFG.activeFrom;
  get('setActiveTo').value   = cfg.activeTo   || DEFAULT_CFG.activeTo;
  get('setDelayMin').value   = Number.isFinite(cfg.delayMin)?cfg.delayMin:DEFAULT_CFG.delayMin;
  get('setDelayMax').value   = Number.isFinite(cfg.delayMax)?cfg.delayMax:DEFAULT_CFG.delayMax;
  get('setPollEvery').value  = Number.isFinite(cfg.pollEvery)?cfg.pollEvery:DEFAULT_CFG.pollEvery;
}

async function saveSettingsUI(){
  const get = id => document.getElementById(id);
  const cfg = {
    activeFrom: get('setActiveFrom').value || DEFAULT_CFG.activeFrom,
    activeTo:   get('setActiveTo').value   || DEFAULT_CFG.activeTo,
    delayMin:   Math.max(0, parseInt(get('setDelayMin').value || DEFAULT_CFG.delayMin, 10)),
    delayMax:   Math.max(0, parseInt(get('setDelayMax').value || DEFAULT_CFG.delayMax, 10)),
    pollEvery:  Math.max(5, parseInt(get('setPollEvery').value || DEFAULT_CFG.pollEvery, 10)),
  };
  if(cfg.delayMax < cfg.delayMin){ const t = cfg.delayMin; cfg.delayMin = cfg.delayMax; cfg.delayMax = t; }
  await STORAGE.set({cfg});
  // ping background to reschedule
  chrome.runtime.sendMessage({type:'CFG_UPDATED'});
  alert('Đã lưu cài đặt ✅');
}

// ---------- Buttons & Filters ----------
document.getElementById('btnOpenFAP').onclick=()=>chrome.tabs.create({url:'https://fap.fpt.edu.vn/'});
document.getElementById('btnOpenTranscript').onclick=()=>chrome.tabs.create({url:DEFAULT_URLS.transcript});

// --- Quick bookmarks ---
const btnLMS = document.getElementById('btnOpenLMS');
if (btnLMS) btnLMS.onclick = () => chrome.tabs.create({ url: 'https://lms-hcm.fpt.edu.vn/' });
const btnFAP2 = document.getElementById('btnOpenFAP2');
if (btnFAP2) btnFAP2.onclick = () => chrome.tabs.create({ url: 'https://fap.fpt.edu.vn/' });
const btnIT = document.getElementById('btnOpenIT');
if (btnIT) btnIT.onclick = () => chrome.tabs.create({ url: 'https://it-hcm.fpt.edu.vn/' });

document.getElementById('btnOpenAttendance').onclick=()=>chrome.tabs.create({url:DEFAULT_URLS.scheduleOfWeek});
document.getElementById('btnOpenSchedule').onclick=()=>chrome.tabs.create({url:DEFAULT_URLS.scheduleOfWeek});


document.getElementById('searchCourse').addEventListener('input', loadGPA);
document.getElementById('searchAtt').addEventListener('input', async ()=>{
  const c = await cacheGet('cache_attendance', 10*60*1000);
  renderAttendance((c?.entries)||[]);
});
document.getElementById('filterDay').addEventListener('change', async ()=>{
  const c = await cacheGet('cache_attendance', 10*60*1000);
  renderAttendance((c?.entries)||[]);
});

document.getElementById('btnRefreshAttendance').onclick = async ()=>{
  await refreshAttendance();
};
document.getElementById('btnRefreshSchedule').onclick = async ()=>{
  await refreshAttendance();
};

// Settings buttons
document.getElementById('btnSaveSettings').onclick = saveSettingsUI;
document.getElementById('btnTestNotify').onclick = ()=> chrome.runtime.sendMessage({type:'TEST_NOTIFY'});

// Tabs
document.querySelectorAll('.tabs button').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(s=>s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  };
});

(async function init(){
  await Promise.all([loadGPA(), loadAttendanceAndSchedule(), loadSettingsUI()]);

  try{ await checkUpdate(); }catch(e){}
})();


// Refresh-all: clear caches and reload
document.getElementById('btnRefreshAll').onclick = async ()=>{
  await STORAGE.remove('cache_transcript');
  await STORAGE.remove('cache_attendance');
  await Promise.all([loadGPA(), refreshAttendance(), loadSettingsUI()]);
};


function renderScheduleWeek(entries){
  const tbody = document.querySelector('#tblScheduleWeek tbody'); 
  if(!tbody) return;
  tbody.innerHTML='';
  if(!entries || !entries.length){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td colspan="6">Không có dữ liệu lịch (hoặc trang lịch khác định dạng).</td>`;
    tbody.appendChild(tr);
    return;
  }
  const dayOrder = ['MON','TUE','WED','THU','FRI','SAT','SUN','T2','T3','T4','T5','T6','T7','CN'];
  const parseSlot = s => { const m=String(s||'').match(/\d+/); return m?parseInt(m[0],10):999; };
  const parseTime = t => { const m=String(t||'').match(/^(\d{2}):(\d{2})/); return m?parseInt(m[1])*60+parseInt(m[2]):9999; };
  // FILTER_SLOT_GARBAGE
  const clean = (entries||[]).filter(e=> e && !/^\s*slot\s*\d+/i.test(String(e.course||'')) && !/^\s*slot\s*\d+/i.test(String(e.status||'')) );
  const arr = clean.slice().sort((a,b)=>{
    const da = dayOrder.indexOf(String(a.day||'').toUpperCase());
    const db = dayOrder.indexOf(String(b.day||'').toUpperCase());
    if(da!==db) return da-db;
    const sa=parseSlot(a.slot), sb=parseSlot(b.slot);
    if(sa!==sb) return sa-sb;
    return parseTime(a.time)-parseTime(b.time);
  });
  arr.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.day||''}</td><td>${r.slot||''}</td><td>${r.time||''}</td><td>${r.course||''}</td><td>${r.room||''}</td><td>${r.status||r.note||''}</td>`;
    tbody.appendChild(tr);
  });
}
