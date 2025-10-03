
const STORAGE = {
  get: (k, d) => new Promise(r => chrome.storage.local.get({[k]: d}, v => r(v[k]))),
  set: (obj) => new Promise(r => chrome.storage.local.set(obj, r)),
  remove: (k) => new Promise(r => chrome.storage.local.remove(k, r)),
};

const SCHEDULE_OF_WEEK = 'https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx';

function nowHm(){const d=new Date(); return d.toTimeString().slice(0,5);} // "HH:MM"
function within(activeFrom, activeTo){
  const n = nowHm();
  return n >= activeFrom && n <= activeTo;
}

async function fetchHtml(url){
  const res = await fetch(url, {credentials:'include', redirect:'follow'});
  if (res.redirected && /\/Default\.aspx$/i.test(new URL(res.url).pathname)){
    const last = await STORAGE.get('last_login_prompt_ts', 0);
    const now = Date.now();
    if (now - last > 60*60*1000) { // not more than once per hour
      const loginUrl = 'https://fap.fpt.edu.vn/';
      chrome.tabs.create({url: loginUrl});
      await STORAGE.set({last_login_prompt_ts: now});
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Cần đăng nhập FAP',
        message: 'Bạn chưa đăng nhập. Đã mở trang đăng nhập FEID.',
        priority: 2
      });
    }
    throw new Error('LOGIN_REQUIRED');
  }
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
function extractFingerprint(html){
  const s = html.replace(/\s+/g,' ').slice(0, 20000);
  let h=0; for(let i=0;i<s.length;i++){h=(h*131 + s.charCodeAt(i))>>>0;}
  return String(h);
}

// Minimal parser to pull weekly entries with statuses
function parseScheduleOfWeek(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const NORM = s => (s||'').replace(/\s+/g,' ').trim().toUpperCase();
  const result = [];
  const tables = [...doc.querySelectorAll('table')];
  let grid = null;
  for(const t of tables){
    const txt = NORM(t.textContent);
    if(txt.includes('YEAR') && txt.includes('WEEK') && /MON|TUE|WED|THU|FRI|SAT|SUN/.test(txt)){ grid = t; break; }
  }
  if(!grid) return result;
  const rows = [...grid.querySelectorAll('tr')];
  // header day columns
  let headerRowIdx = -1;
  for(let i=0;i<Math.min(8, rows.length); i++){
    const txt = NORM(rows[i].textContent);
    if(/MON/.test(txt) && /TUE/.test(txt) && /WED/.test(txt) && /THU/.test(txt) && /FRI/.test(txt)){ headerRowIdx = i; break; }
  }
  if(headerRowIdx === -1) return result;
  const headerCells = [...rows[headerRowIdx].querySelectorAll('td,th')];
  const dayCols = [];
  headerCells.forEach((c,i)=>{
    const text = c.textContent.trim();
    const m = text.match(/(MON|TUE|WED|THU|FRI|SAT|SUN)/i);
    if(m){
      const date = (text.match(/\d{2}\/\d{2}/)||[])[0] || null;
      dayCols.push({name: m[1].toUpperCase(), idx: i, date});
    }
  });
  if(dayCols.length < 5) return result;
  function isSlotLabel(s){ return /^slot\s*\d+/i.test(s); }
  const slotRows = rows.filter(r=>{ const c0=r.querySelector('td,th'); return c0 && isSlotLabel((c0.textContent||'').trim()); });

  slotRows.forEach(r=>{
    const cells = [...r.querySelectorAll('td,th')];
    const slotName = (cells[0]?.textContent || '').trim(); // "Slot 1"
    dayCols.forEach(d=>{
      const cell = cells[d.idx]; if(!cell) return;
      const raw = (cell.textContent || '').trim();
      if(!raw || raw === '-') return;
      const codeMatch = raw.match(/\b[A-Z]{3}\d{3}\b/);
      const code = codeMatch ? codeMatch[0] : '';
      if(!code) return;
      let status = '';
      if(/attended/i.test(raw)) status = 'attended';
      else if(/not yet/i.test(raw)) status = 'not yet';
      else if(/absent|v\u1eafng/i.test(raw)) status = 'absent';
      result.push({ key: `${d.date||d.name}|${slotName}|${code}`, course: code, day: d.name, date: d.date, slot: slotName, status: status || raw });
    });
  });
  return result;
}

async function pollOnce(){
  const cfg = await STORAGE.get('cfg', {activeFrom:'07:00',activeTo:'17:40',delayMin:10,delayMax:30,pollEvery:15});
  if(!within(cfg.activeFrom, cfg.activeTo)) return;
  try{
    const html = await fetchHtml(SCHEDULE_OF_WEEK);
    const fp = extractFingerprint(html);
    const prevFp = await STORAGE.get('att_fp', null);

    // Compare entries to craft better notifications
    const newEntries = parseScheduleOfWeek(html);
    const oldEntries = await STORAGE.get('att_entries', []);
    const oldMap = new Map(oldEntries.map(e => [e.key, e.status]));

    const newlyAttended = [];
    for(const e of newEntries){
      const prevStatus = oldMap.get(e.key) || '';
      if(e.status === 'attended' && prevStatus !== 'attended'){
        newlyAttended.push(e.course);
      }
    }
    // persist latest snapshot
    await STORAGE.set({att_entries: newEntries, att_fp: fp});

    if(prevFp && prevFp !== fp && newlyAttended.length){
      const delay = Math.floor(cfg.delayMin + Math.random()*(cfg.delayMax - cfg.delayMin));
      const at = Date.now() + delay*60*1000;
      const alarmId = `att_notify_${at}`;
      chrome.alarms.create(alarmId, { when: at });
      const courses = Array.from(new Set(newlyAttended));
      const msg = (courses.length === 1)
        ? `Môn ${courses[0]} đã được điểm danh`
        : `Các môn ${courses.slice(0,3).join(', ')} đã được điểm danh`;
      const pending = await STORAGE.get('pending_msgs', {});
      pending[alarmId] = msg;
      await STORAGE.set({pending_msgs: pending, last_reason: `Attendance changed (detected ${courses.length})`});
      // also update popup cache silently
      await STORAGE.set({'cache_attendance': {ts: Date.now(), data: {entries:newEntries, todayRows: []}}});
    } else if(!prevFp){
      await STORAGE.set({att_fp: fp});
    }
  }catch(e){ /* ignore */ }
}

async function schedulePollAlarm(){
  const cfg = await STORAGE.get('cfg', {pollEvery:15});
  chrome.alarms.create('att_poll', { periodInMinutes: Math.max(5, cfg.pollEvery) });
}

chrome.runtime.onInstalled.addListener(async ()=>{ await schedulePollAlarm(); });
chrome.runtime.onStartup.addListener(async ()=>{ await schedulePollAlarm(); });

chrome.alarms.onAlarm.addListener(async (alarm)=>{
  if(alarm.name === 'att_poll'){
    await pollOnce();
  }else if(alarm.name.startsWith('att_notify_')){
    const pending = await STORAGE.get('pending_msgs', {});
    const msg = pending[alarm.name] || 'Một môn đã được điểm danh';
    delete pending[alarm.name];
    await STORAGE.set({pending_msgs: pending});
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'FAP Attendance',
      message: msg,
      priority: 2
    });
  }
});

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse)=>{
  if(msg.type === 'CFG_UPDATED'){
    await schedulePollAlarm();
    sendResponse({ok:true});
  }
  if(msg.type === 'TEST_NOTIFY'){
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'FAP Attendance',
      message: 'Môn DEMO101 đã được điểm danh',
      priority: 2
    });
    sendResponse({ok:true});
  }
});


// ===== GitHub Update Check =====
const GH_REPO = 'longurara/FAP-GPA-Viewer';
const GH_LATEST = `https://api.github.com/repos/${GH_REPO}/releases/latest`;
const RELEASE_LATEST_PAGE = 'https://github.com/longurara/FAP-GPA-Viewer/releases/latest';

async function checkUpdateAndNotify(){
  try{
    const res = await fetch(GH_LATEST, { headers: { 'Accept': 'application/vnd.github+json' }});
    if(!res.ok) return;
    const j = await res.json();
    const tag = (j.tag_name || j.name || '').replace(/^v/i,'');
    const curr = chrome.runtime.getManifest().version;
    const notified = await STORAGE.get('__last_notified_version__', '');
    function semverParts(v){
      const m = String(v||'').trim().match(/^(\d+)\.(\d+)\.(\d+)/);
      if(!m) return [0,0,0];
      return [parseInt(m[1]),parseInt(m[2]),parseInt(m[3])];
    }
    function cmp(a,b){
      const A=semverParts(a), B=semverParts(b);
      for(let i=0;i<3;i++){ if((A[i]||0)!==(B[i]||0)) return (A[i]||0)-(B[i]||0); }
      return 0;
    }
    if(cmp(tag, curr) > 0 && tag !== notified){
      chrome.notifications.create('update_avail', {
        type:'basic', iconUrl:'icon128.png',
        title:'FAP GPA Viewer – có bản mới',
        message:`Phiên bản ${tag} đã phát hành. Nhấn để mở trang cập nhật.`,
        priority:2
      });
      await STORAGE.set({'__last_notified_version__': tag});
    }
  }catch(e){/* silent */}
}

async function scheduleUpdateAlarm(){
  chrome.alarms.create('UPDATE_CHECK', { periodInMinutes: 60*6, when: Date.now()+ 30*1000 });
}

chrome.runtime.onStartup.addListener(()=>{ scheduleUpdateAlarm(); checkUpdateAndNotify(); });
chrome.runtime.onInstalled.addListener(()=>{ scheduleUpdateAlarm(); setTimeout(checkUpdateAndNotify, 5000); });

chrome.alarms.onAlarm.addListener(a=>{
  if(a.name==='UPDATE_CHECK'){ checkUpdateAndNotify(); }
});
