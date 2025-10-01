
(function(){
  const STORAGE_KEY="__FAP_EXCLUDED_CODES__";
  const DEFAULT_EXCLUDED=["TRS501","ENT503","VOV114","VOV124","VOV134","OTP101"];

  function decode(){const m=location.hash.match(/#data=([^&]+)/);if(!m)return null;try{return JSON.parse(decodeURIComponent(escape(atob(m[1]))));}catch{return null;}}
  function setTheme(dark){document.documentElement.classList.toggle("dark", !!dark);}
  function loadExcluded(){try{const s=localStorage.getItem(STORAGE_KEY); if(s) return JSON.parse(s);}catch{} return [...DEFAULT_EXCLUDED];}
  function saveExcluded(list){localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(list))));}

  function computeGPA(rows, excluded){
    let sumC=0,sumP=0;
    for(const r of rows){
      const c=r.credit, g=r.grade, code=(r.code||"").toUpperCase();
      if(!Number.isFinite(c)||!Number.isFinite(g)||c<=0||g<=0) continue;
      if(excluded.includes(code)) continue;
      sumC+=c; sumP+=c*g;
    }
    const gpa10=sumC>0?(sumP/sumC):NaN;
    const gpa4=Number.isFinite(gpa10)?(gpa10/10)*4:NaN;
    return {gpa10,gpa4,credits:sumC};
  }

  function render(payload){
    if(!payload){document.body.innerHTML="<div class='container'><h2>Không có dữ liệu.</h2></div>";return;}
    const rows=payload.rows||[];
    let excluded=loadExcluded();

    const g10El=document.getElementById("gpa10");
    const g4El =document.getElementById("gpa4");
    const crEl =document.getElementById("credits");
    const tbody=document.getElementById("tbody");
    const chart=document.getElementById("chart");

    function refreshSummary(){
      const g=computeGPA(rows, excluded);
      g10El.textContent = isFinite(g.gpa10)?g.gpa10.toFixed(2):"--";
      g4El.textContent  = isFinite(g.gpa4)?g.gpa4.toFixed(2):"--";
      crEl.textContent  = g.credits ?? "--";
      drawChart();
    }

    function drawTable(filter=""){
      tbody.innerHTML="";
      const q=filter.toLowerCase();
      rows.forEach(r=>{
        if(q && !(String(r.code).toLowerCase().includes(q)||String(r.name).toLowerCase().includes(q))) return;
        const strike = excluded.includes((r.code||"").toUpperCase());
        const tr=document.createElement("tr");
        tr.innerHTML=`
          <td class="${strike?'strike':''}">${r.code||""}</td>
          <td class="${strike?'strike':''}">${r.name||""}</td>
          <td class="right">${Number.isFinite(r.credit)?r.credit:""}</td>
          <td class="right">${Number.isFinite(r.grade)?r.grade:""}</td>
          <td>${r.status||""}</td>`;
        tbody.appendChild(tr);
      });
    }

    function drawChart(){
      const agg={};
      rows.forEach(r=>{
        const code=(r.code||"").toUpperCase();
        if(excluded.includes(code)) return;
        if(!Number.isFinite(r.credit)||!Number.isFinite(r.grade)||r.credit<=0) return;
        const k=r.semester||"Unknown";
        if(!agg[k]) agg[k]={c:0,p:0};
        agg[k].c+=r.credit; agg[k].p+=r.credit*r.grade;
      });
      const pts=Object.entries(agg).map(([k,v])=>({x:k, y: v.p/v.c}));
      pts.sort((a,b)=> String(a.x).localeCompare(String(b.x)));

      const W=800,H=300,pad=40;
      chart.innerHTML="";
      const axis=document.createElementNS("http://www.w3.org/2000/svg","path");
      axis.setAttribute("class","axis");
      axis.setAttribute("d",`M ${pad} ${H-pad} H ${W-pad} M ${pad} ${H-pad} V ${pad}`);
      chart.appendChild(axis);
      for(let i=0;i<=10;i+=2){
        const y=H-pad - (i/10)*(H-2*pad);
        const line=document.createElementNS("http://www.w3.org/2000/svg","line");
        line.setAttribute("class","grid"); line.setAttribute("x1",pad); line.setAttribute("x2",W-pad);
        line.setAttribute("y1",y); line.setAttribute("y2",y); chart.appendChild(line);
        const label=document.createElementNS("http://www.w3.org/2000/svg","text");
        label.setAttribute("x",8); label.setAttribute("y",y+4); label.setAttribute("fill","currentColor");
        label.setAttribute("font-size","12"); label.textContent=i; chart.appendChild(label);
      }
      if(pts.length){
        const xs=pts.map((_,i)=> pad + i*( (W-2*pad)/Math.max(1,pts.length-1) ));
        const ys=pts.map(p=> H-pad - (p.y/10)*(H-2*pad));
        const d=xs.map((x,i)=> (i?"L":"M")+`${x} ${ys[i]}`).join(" ");
        const path=document.createElementNS("http://www.w3.org/2000/svg","path");
        path.setAttribute("class","line"); path.setAttribute("d",d); chart.appendChild(path);
        pts.forEach((p,i)=>{
          const cx=xs[i], cy=ys[i];
          const dot=document.createElementNS("http://www.w3.org/2000/svg","circle");
          dot.setAttribute("class","dot"); dot.setAttribute("cx",cx); dot.setAttribute("cy",cy); dot.setAttribute("r",3.5);
          chart.appendChild(dot);
          const tx=document.createElementNS("http://www.w3.org/2000/svg","text");
          tx.setAttribute("x",cx-20); tx.setAttribute("y",H-10); tx.setAttribute("fill","currentColor"); tx.setAttribute("font-size","11");
          tx.textContent=p.x; chart.appendChild(tx);
        });
      }
    }

    // initial
    drawTable(); refreshSummary();

    // handlers
    document.getElementById("search").addEventListener("input",e=>drawTable(e.target.value));
    document.getElementById("btnCopy").onclick=()=>{
      const g=computeGPA(rows, excluded);
      if(!isFinite(g.gpa10)) return alert("Chưa có GPA.");
      const text=`GPA(10): ${g.gpa10.toFixed(2)} | GPA(4): ${g.gpa4.toFixed(2)} | TC: ${g.credits}`;
      navigator.clipboard.writeText(text); alert("Đã copy GPA");
    };
    document.getElementById("btnCSV").onclick=()=>{
      const header="Code,Name,Credit,Grade,Status\\n";
      const lines=rows.map(r=>[r.code,r.name,r.credit,r.grade,r.status].map(x=>`"${x??""}"`).join(",")).join("\\n");
      const blob=new Blob([header+lines],{type:"text/csv"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="transcript.csv"; a.click();
    };
    document.getElementById("btnExportReal").onclick=()=>{ if(payload.meta?.url) window.open(payload.meta.url,"_blank"); };
    document.getElementById("toggleTheme").onchange=e=>setTheme(e.target.checked);

    // exclude modal
    const modal=document.getElementById("modal");
    const modalBody=document.getElementById("modalBody");
    function openModal(){
      modalBody.innerHTML="";
      const allCodes=[...new Set(rows.map(r=>(r.code||"").toUpperCase()).filter(Boolean))].sort();
      allCodes.forEach(code=>{
        const name=rows.find(r=>(r.code||"").toUpperCase()===code)?.name||"";
        const row=document.createElement("div");
        row.className="row";
        const id="chk_"+code.replace(/\\W+/g,"_");
        row.innerHTML=`<input type="checkbox" id="${id}" ${excluded.includes(code)?"checked":""}>
                       <strong style="min-width:90px;display:inline-block">${code}</strong>
                       <span>${name}</span>`;
        modalBody.appendChild(row);
      });
      modal.classList.remove("hidden");
    }
    function closeModal(){ modal.classList.add("hidden"); }
    document.getElementById("btnExclude").onclick=openModal;
    document.getElementById("btnClose").onclick=closeModal;
    document.getElementById("btnCancel").onclick=closeModal;
    document.getElementById("btnReset").onclick=()=>{ excluded=[...DEFAULT_EXCLUDED]; saveExcluded(excluded); closeModal(); drawTable(); refreshSummary(); };
    document.getElementById("btnSave").onclick=()=>{
      const checks=[...modalBody.querySelectorAll("input[type=checkbox]")];
      excluded=checks.filter(c=>c.checked).map(c=>c.id.replace(/^chk_/,"").replace(/_/g," "));
      saveExcluded(excluded);
      closeModal(); drawTable(); refreshSummary();
    };
  }
  render(decode());
})();
