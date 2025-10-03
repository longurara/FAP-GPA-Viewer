(function(){
  // --- Storage wrapper riêng cho report.html ---
  const STORAGE = {
    get: (key, def) => new Promise(res => chrome.storage.local.get({[key]: def}, out => res(out[key]))),
    set: (obj) => new Promise(res => chrome.storage.local.set(obj, res))
  };

  const $ = (sel)=>document.querySelector(sel);
  const tbody = (id)=>document.querySelector(id+' tbody');

  function setText(id, txt){ const el = $(id); if(el) el.textContent = txt; }
  function addRows(tbodyEl, rows){
    rows.forEach(arr=>{
      const tr = document.createElement('tr');
      tr.innerHTML = arr.map(x=> `<td>${(x ?? '').toString().replace(/&/g,"&amp;").replace(/</g,"&lt;")}</td>`).join('');
      tbodyEl.appendChild(tr);
    });
  }

  function renderTranscript(rows){
    const tb = tbody('#tblTranscript'); if(!tb) return;
    tb.innerHTML = '';
    (rows||[]).forEach(r=> addRows(tb, [[r.code||'', r.name||'', Number.isFinite(r.credit)?r.credit:'', Number.isFinite(r.grade)?r.grade:'', r.status||'']]));
  }
  function renderAttendance(entries){
    const tb = tbody('#tblAttendance'); if(!tb) return;
    tb.innerHTML = '';
    (entries||[]).forEach(e=> addRows(tb, [[e.date||'', e.day||'', e.slot||'', e.course||'', e.status||'']]));
  }
  function renderSchedule(entries){
    const tb = tbody('#tblSchedule'); if(!tb) return;
    tb.innerHTML = '';
    (entries||[]).forEach(e=> addRows(tb, [[e.day||'', e.date||'', e.slot||'', e.time||'', e.course||'', e.room||'', (e.status||'').toUpperCase().includes('NOT YET')?'Chưa diễn ra':'']]));
  }
  function renderSettings(cfg){
    const tb = tbody('#tblSettings'); if(!tb) return;
    tb.innerHTML = '';
    Object.entries(cfg||{}).forEach(([k,v])=> addRows(tb, [[k, String(v)]]));
  }

  async function fallbackLoad(){
    try{
      const tf = await STORAGE.get('cache_transcript_flat', null);
      const af = await STORAGE.get('cache_attendance_flat', null);
      const t  = await STORAGE.get('cache_transcript', null);
      const a  = await STORAGE.get('cache_attendance', null);
      const cfg= await STORAGE.get('cfg', {});

      const transcript = tf || (t && (t.rows || t.data?.rows)) || [];
      const entries    = af || (a && (a.entries || a.data?.entries)) || [];

      renderTranscript(transcript);
      renderAttendance(entries);
      renderSchedule(entries);
      renderSettings(cfg||{});
      setTimeout(()=> { window.print(); }, 600);
    }catch(e){
      console.error('fallbackLoad error:', e);
    }
  }

  async function init(){
    // Header info
    try{
      const manifest = chrome.runtime.getManifest();
      $('#logo').src = chrome.runtime.getURL('icon128.png');
      setText('#extName', manifest.name || 'FAP GPA Viewer – Dashboard');
      setText('#extVer', 'v' + (manifest.version || ''));
      setText('#today', new Date().toLocaleString('vi-VN'));
    }catch(e){}

    // Hỏi background lấy data
    try{
      chrome.runtime.sendMessage({ action: "getAllData" }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn("Message error:", chrome.runtime.lastError);
          fallbackLoad();
          return;
        }
        if (resp && resp.ok) {
          renderTranscript(resp.transcript || []);
          renderAttendance(resp.attendance || []);
          renderSchedule(resp.schedule || []);
          renderSettings(resp.settings || {});
          setTimeout(()=> { window.print(); }, 600);
        } else {
          fallbackLoad();
        }
      });
    }catch(e){
      console.warn('sendMessage exception:', e);
      fallbackLoad();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();