// app.js — SBD Dashboard JABO B

const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbx9iLDequi3rgTluh2Zxa4BKJllnIWgraaq1Vmn-Q0Mv2w6sWXONXbL-ZqGdSu4qSnV/exec',
  TOKEN: 'sbd-r5-2026',
  USE_MOCK: false,
  CAMPAIGN_END: new Date('2026-06-22T23:59:59+07:00'),
  VOUCHER_VALUE: { a37: 100000, a57: 200000, s26: 300000 },
};

/* ─── State ─── */
let _data        = null;
let _activeTab   = 'overview';
let _charts      = {};

/* ─── Helpers ─── */
const fmtN   = v => Math.round(+v||0).toLocaleString('id-ID');
const fmtPct = v => ((+v||0)*100).toFixed(1)+'%';
const clsPct = v => v>=1 ? 'pct-green' : v>=0.8 ? 'pct-amber' : 'pct-red';
const clsWoW = v => v>0 ? 'wow-pos' : v<0 ? 'wow-neg' : 'wow-zero';
const fmtWoW = v => (v>0?'+':'')+fmtN(v);
const fmtRp  = v => { const m=v/1000000; return m>=1 ? 'Rp '+m.toFixed(1)+'M' : 'Rp '+fmtN(v); };
const shortName = s => s.length>22 ? s.substring(0,22)+'…' : s;

function countUp(el, target, duration=900) {
  if (!el) return;
  const start=Date.now(), from=0;
  const step=()=>{
    const p=Math.min((Date.now()-start)/duration,1);
    const ease=1-Math.pow(1-p,3);
    el.textContent=Math.round(from+(target-from)*ease).toLocaleString('id-ID');
    if(p<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function destroyChart(key) {
  if (_charts[key]) { _charts[key].destroy(); delete _charts[key]; }
}

function destroyCharts(...keys) { keys.forEach(k=>destroyChart(k)); }

function chartOpts({ indexAxis, stacked, scales=true, legend=true }={}) {
  return {
    responsive:true, maintainAspectRatio:false,
    animation:{ duration:600 },
    plugins:{
      legend:{ display:legend, labels:{ color:'#475569', font:{family:'Plus Jakarta Sans',size:11,weight:'600'}, boxWidth:10 }},
      tooltip:{ backgroundColor:'#1A2040', borderColor:'#E2E8F0', borderWidth:1,
        titleColor:'#FFF', bodyColor:'#CBD5E1', padding:10, cornerRadius:8 },
    },
    ...(indexAxis ? {indexAxis} : {}),
    ...(scales ? { scales:{
      x:{ grid:{color:'rgba(0,0,0,0.04)'}, ticks:{color:'#94A3B8',font:{size:10}}, stacked:!!stacked },
      y:{ grid:{color:'rgba(0,0,0,0.04)'}, ticks:{color:'#94A3B8',font:{size:10}}, stacked:!!stacked },
    }} : {}),
  };
}

/* ─── Fetch ─── */
const LS_DATA_KEY = 'sbd-dashboard-data';

function saveLocalData(json) {
  try { localStorage.setItem(LS_DATA_KEY, JSON.stringify(json)); } catch(e) {}
}
function loadLocalData() {
  try { const s=localStorage.getItem(LS_DATA_KEY); return s?JSON.parse(s):null; } catch(e) { return null; }
}

async function fetchData() {
  if (CONFIG.USE_MOCK) return null;
  try {
    const res = await fetch(CONFIG.GAS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status==='empty') return loadLocalData();
    if (json.status!=='ok') throw new Error(json.message||'Fetch error');
    // Prefer server data if MTD > 0, else fallback to localStorage
    const serverData = json.data;
    const ks = serverData?.kpi_summary;
    const serverHasData = ks && ((ks.a37?.mtd||0)+(ks.a57?.mtd||0)+(ks.s26?.mtd||0)) > 0;
    if (serverHasData) return serverData;
    const local = loadLocalData();
    const lks = local?.kpi_summary;
    const localHasData = lks && ((lks.a37?.mtd||0)+(lks.a57?.mtd||0)+(lks.s26?.mtd||0)) > 0;
    return localHasData ? local : serverData;
  } catch(err) {
    const local = loadLocalData();
    if (local) return local;
    throw err;
  }
}

/* ─── Tab Navigation ─── */
function initMainTabs() {
  document.querySelectorAll('.main-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.main-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.toggle('hidden', s.id!==`tab-${tab}`));
  // Render on demand
  if (_data) {
    if (tab==='per-tipe')    renderPerTipe(_data);
    if (tab==='voucher')     renderVoucherTab(_data);
    if (tab==='per-lob')     renderPerLOB(_data);
    if (tab==='per-toko')    renderPerToko(_data);
    if (tab==='ranking-wow') renderRankingWoW(_data);
  }
}

/* ─── Meta ─── */
function renderMeta(meta) {
  if (!meta) return;
  const el = document.getElementById('last-updated');
  if (el) {
    const d = new Date(meta.uploadedAt);
    const wl = meta.weekLabels || {};
    el.textContent = `Updated: ${d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} · ${meta.filename||''}`;
  }
  const sub = document.getElementById('topbar-region');
  if (sub) sub.textContent = `SBD SAMSUNG · ${new Date(meta.uploadedAt).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}`;
}

/* ─── Overview (KPI) ─── */
function renderOverview(data) {
  const skel=document.getElementById('kpi-skeleton');
  const content=document.getElementById('kpi-content');
  const empty=document.getElementById('kpi-empty');
  if (skel) skel.classList.add('hidden');

  if (!data) {
    if (content) content.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  const ks = data.kpi_summary;

  function fillType(t, prefix) {
    countUp(document.getElementById(`kv-${prefix}-est`), t.est);
    const tgtEl=document.getElementById(`kv-${prefix}-tgt`); if(tgtEl) tgtEl.textContent=fmtN(t.target);
    const mtdEl=document.getElementById(`kv-${prefix}-mtd`); if(mtdEl) mtdEl.textContent=fmtN(t.mtd);
    const pctEl=document.getElementById(`kv-${prefix}-pct`);
    if(pctEl){ pctEl.textContent=fmtPct(t.estPct); pctEl.className='kpi-pct-val '+clsPct(t.estPct); }
    const barEl=document.getElementById(`bar-${prefix}`);
    if(barEl) setTimeout(()=>{barEl.style.width=Math.min(t.estPct*100,100)+'%';},100);
  }
  fillType(ks.a37,'a37'); fillType(ks.a57,'a57'); fillType(ks.s26,'s26');

  const vT=ks.a37.voucherTersedia+ks.a57.voucherTersedia+ks.s26.voucherTersedia;
  const vP=ks.a37.voucherPakai+ks.a57.voucherPakai+ks.s26.voucherPakai;
  const vS=vT-vP;
  countUp(document.getElementById('kv-v-tersedia'),vT);
  countUp(document.getElementById('kv-v-pakai'),vP);
  countUp(document.getElementById('kv-v-sisa'),vS);
  const barV=document.getElementById('bar-voucher');
  if(barV) setTimeout(()=>{barV.style.width=Math.min(vT>0?vP/vT*100:0,100)+'%';},100);
  const lblV=document.getElementById('lbl-voucher-util');
  if(lblV) lblV.textContent=fmtPct(vT>0?vP/vT:0)+' utilisasi voucher';

  // Voucher weekly breakdown
  const vwEl = document.getElementById('ov-voucher-weekly');
  if (vwEl) {
    const weeks = [
      { wk:'W24', pakai: (ks.a37.vW24Total||0)+(ks.a57.vW24Total||0)+(ks.s26.vW24Total||0), kuota: null },
      { wk:'W25', pakai: (ks.a37.vW25Total||0)+(ks.a57.vW25Total||0)+(ks.s26.vW25Total||0), kuota: (ks.a37.vKuotaW25||0)+(ks.a57.vKuotaW25||0)+(ks.s26.vKuotaW25||0) },
      { wk:'W26', pakai: (ks.a37.vW26Total||0)+(ks.a57.vW26Total||0)+(ks.s26.vW26Total||0), kuota: (ks.a37.vKuotaW26||0)+(ks.a57.vKuotaW26||0)+(ks.s26.vKuotaW26||0) },
      { wk:'W27', pakai: (ks.a37.vW27Total||0)+(ks.a57.vW27Total||0)+(ks.s26.vW27Total||0), kuota: (ks.a37.vKuotaW27||0)+(ks.a57.vKuotaW27||0)+(ks.s26.vKuotaW27||0) },
    ];
    vwEl.innerHTML = `<table class="ov-voucher-wk-table">
      <thead><tr><th>Minggu</th><th class="num-cell">Terpakai</th><th class="num-cell">Kuota</th><th class="num-cell">Sisa Kuota</th><th class="num-cell">Utilisasi</th></tr></thead>
      <tbody>${weeks.map(w=>{
        const sisa = w.kuota!=null ? w.kuota-w.pakai : null;
        const util = w.kuota>0 ? w.pakai/w.kuota : null;
        const sisCls = sisa!=null&&sisa<=0 ? 'pct-red' : '';
        return `<tr>
          <td><strong>${w.wk}</strong></td>
          <td class="num-cell">${fmtN(w.pakai)}</td>
          <td class="num-cell">${w.kuota!=null?fmtN(w.kuota):'—'}</td>
          <td class="num-cell ${sisCls}">${sisa!=null?fmtN(sisa):'—'}</td>
          <td class="num-cell">${util!=null?fmtPct(util):'—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  // Angka aktual di bawah progress chart
  const progNumEl = document.getElementById('ov-progress-nums');
  if (progNumEl) {
    progNumEl.innerHTML = `<table class="ov-nums-table">
      <thead><tr><th>Tipe</th><th class="num-cell">Target</th><th class="num-cell">Est.SellOut</th><th class="num-cell">MTD</th><th class="num-cell">Achievement</th></tr></thead>
      <tbody>
        ${['a37','a57','s26'].map(t=>{
          const k=ks[t]; const color=t==='a37'?'#1428A0':t==='a57'?'#F59E0B':'#8B5CF6';
          const name=t==='a37'?'Galaxy A37':t==='a57'?'Galaxy A57':'Galaxy S26';
          return `<tr>
            <td><span style="color:${color};font-weight:700">${name}</span></td>
            <td class="num-cell">${fmtN(k.target)}</td>
            <td class="num-cell">${fmtN(k.est)}</td>
            <td class="num-cell">${fmtN(k.mtd)}</td>
            <td class="num-cell ${clsPct(k.estPct)}">${fmtPct(k.estPct)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  // Angka aktual MTD per LOB (update tabel)
  const leaders = (data.by_leader||[]).filter(l=>l.name!=='Grand Total');
  const lobMtdEl = document.getElementById('ov-lob-actuals');
  if (lobMtdEl && leaders.length) {
    lobMtdEl.innerHTML = leaders.map(l=>{
      const mtd=(l.a37?.mtd||0)+(l.a57?.mtd||0)+(l.s26?.mtd||0);
      const tgt=(l.a37?.target||0)+(l.a57?.target||0)+(l.s26?.target||0);
      const pct=tgt>0?mtd/tgt:0;
      return `<div class="ov-lob-actual-row">
        <span class="ov-lob-name">${l.name}</span>
        <span class="ov-lob-mtd">${fmtN(mtd)} unit</span>
        <span class="ov-lob-pct ${clsPct(pct)}">${fmtPct(pct)}</span>
        <span class="ov-lob-breakdown">A37:${fmtN(l.a37?.mtd||0)} · A57:${fmtN(l.a57?.mtd||0)} · S26:${fmtN(l.s26?.mtd||0)}</span>
      </div>`;
    }).join('');
  }

  countUp(document.getElementById('kv-on-target'),ks.storesOnTarget);
  countUp(document.getElementById('kv-under-target'),ks.storesUnderTarget);
  const tot=document.getElementById('kv-total-stores');
  if(tot) tot.textContent=`${data.meta.totalStores} toko total`;

  // Overview charts
  const ovCharts = document.getElementById('overview-charts');
  if (ovCharts) ovCharts.classList.remove('hidden');
  destroyCharts('ov-progress-chart','ov-lob-chart');

  // Chart 1: MTD vs Target vs Est per produk
  const ctxP = document.getElementById('ov-progress-chart');
  if (ctxP) {
    _charts['ov-progress-chart'] = new Chart(ctxP, {
      type: 'bar',
      data: {
        labels: ['Galaxy A37','Galaxy A57','Galaxy S26'],
        datasets: [
          { label:'Target', data:[ks.a37.target,ks.a57.target,ks.s26.target], backgroundColor:'#E2E8F0', borderRadius:4 },
          { label:'Est. Sell-Out', data:[ks.a37.est,ks.a57.est,ks.s26.est], backgroundColor:['#1428A088','#F59E0B88','#8B5CF688'], borderRadius:4 },
          { label:'MTD Aktual', data:[ks.a37.mtd,ks.a57.mtd,ks.s26.mtd], backgroundColor:['#1428A0','#F59E0B','#8B5CF6'], borderRadius:4 },
        ]
      },
      options: chartOpts({ legend:true })
    });
  }

  // Chart 2: MTD per LOB (stacked A37+A57+S26)
  const ctxL = document.getElementById('ov-lob-chart');
  if (ctxL && leaders.length) {
    _charts['ov-lob-chart'] = new Chart(ctxL, {
      type: 'bar',
      data: {
        labels: leaders.map(l=>l.name),
        datasets: [
          { label:'A37', data:leaders.map(l=>l.a37?.mtd||0), backgroundColor:'#1428A0', borderRadius:3, stack:'s' },
          { label:'A57', data:leaders.map(l=>l.a57?.mtd||0), backgroundColor:'#F59E0B', borderRadius:3, stack:'s' },
          { label:'S26', data:leaders.map(l=>l.s26?.mtd||0), backgroundColor:'#8B5CF6', borderRadius:3, stack:'s' },
        ]
      },
      options: chartOpts({ stacked:true, legend:true })
    });
  }

  // Table: ringkasan per LOB
  const lobEl = document.getElementById('ov-lob-table');
  if (lobEl && leaders.length) {
    const totalMtd = leaders.reduce((s,l)=>s+(l.a37?.mtd||0)+(l.a57?.mtd||0)+(l.s26?.mtd||0),0)||1;
    lobEl.innerHTML = `<table class="toko-table">
      <thead><tr><th>LOB / Leader</th><th class="num-cell">A37</th><th class="num-cell">A57</th><th class="num-cell">S26</th><th class="num-cell">MTD Total</th><th class="num-cell">%Target</th><th class="num-cell">Toko</th></tr></thead>
      <tbody>
      ${leaders.map(l=>{
        const mtd=(l.a37?.mtd||0)+(l.a57?.mtd||0)+(l.s26?.mtd||0);
        const tgt=(l.a37?.target||0)+(l.a57?.target||0)+(l.s26?.target||0);
        const pct=tgt>0?mtd/tgt:0;
        const share=mtd/totalMtd;
        return `<tr>
          <td><strong>${l.name}</strong><div class="toko-sub-lbl">${fmtPct(share)} share</div></td>
          <td class="num-cell" style="color:#00C2FF">${fmtN(l.a37?.mtd||0)}</td>
          <td class="num-cell" style="color:#FEB019">${fmtN(l.a57?.mtd||0)}</td>
          <td class="num-cell" style="color:#9B59B6">${fmtN(l.s26?.mtd||0)}</td>
          <td class="num-cell"><strong>${fmtN(mtd)}</strong></td>
          <td class="num-cell ${clsPct(pct)}">${fmtPct(pct)}</td>
          <td class="num-cell">${l.storeCount||'–'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;
  }
}

/* ══════════════════════════════════════════
   PER TIPE TAB
══════════════════════════════════════════ */
function renderPerTipe(data) {
  const el = document.getElementById('pertipe-content');
  if (!el || !data) return;
  destroyCharts('pt-a37','pt-a57','pt-s26');

  const ks = data.kpi_summary;
  const wl = data.meta?.weekLabels || { w1:'W-1', w2:'W-curr', w3:'W-next' };
  const stores = data.stores || [];

  function typeColor(t) { return t==='a37'?'#1428A0':t==='a57'?'#F59E0B':'#8B5CF6'; }
  function typeName(t) { return t==='a37'?'GALAXY A37':t==='a57'?'GALAXY A57':'GALAXY S26'; }

  function buildCard(type) {
    const ks_t  = ks[type];
    const color  = typeColor(type);
    const pct    = ks_t.estPct;
    const pctCls = pct>=1?'pct-green':pct>=0.8?'pct-amber':'pct-red';
    const gap    = ks_t.target - ks_t.est;
    const w24T   = ks_t.w24Total||0;
    const w25T   = ks_t.w25Total||0;
    const w26T   = ks_t.w26Total||0;
    const w27T   = ks_t.w27Total||0;
    const vSisa  = ks_t.voucherTersedia - ks_t.voucherPakai;
    const wowDelta = w25T - w24T;

    return `
    <div class="pt-card pt-card-${type}" style="--pt-color:${color}">
      <div class="pt-card-header">
        <div class="pt-mtd-block">
          <div class="pt-mtd-val">${fmtN(ks_t.mtd)}</div>
          <div class="pt-mtd-lbl">MTD</div>
        </div>
        <div class="pt-header-mid">
          <div class="pt-product-name">${typeName(type)}</div>
          <div class="pt-progress-wrap">
            <div class="pt-progress-bar">
              <div class="pt-progress-fill" style="width:${Math.min(pct*100,100).toFixed(1)}%;background:${color}"></div>
            </div>
          </div>
          <div class="pt-est-info">Est ${fmtN(ks_t.est)} / Target ${fmtN(ks_t.target)} &nbsp;·&nbsp; <span class="pt-gap">Gap ${fmtN(Math.max(gap,0))} unit</span></div>
        </div>
        <div class="pt-pct-block">
          <div class="pt-pct-val ${pctCls}">${fmtPct(pct)}</div>
          <div class="pt-pct-lbl">est. achievement</div>
        </div>
      </div>
      <div class="pt-weekly-row">
        <div class="pt-week-box">
          <div class="pt-wk-lbl">W24</div>
          <div class="pt-wk-val">${fmtN(w24T)}</div>
          <div class="pt-wk-sub">unit</div>
        </div>
        <div class="pt-week-box pt-week-curr">
          <div class="pt-wk-lbl">W25</div>
          <div class="pt-wk-val" style="color:${color}">${fmtN(w25T)}</div>
          <div class="pt-wk-sub ${clsWoW(wowDelta)}">${fmtWoW(wowDelta)} vs W24</div>
        </div>
        <div class="pt-week-box">
          <div class="pt-wk-lbl">W26</div>
          <div class="pt-wk-val">${w26T>0?fmtN(w26T):'–'}</div>
          <div class="pt-wk-sub muted">running</div>
        </div>
        <div class="pt-week-box">
          <div class="pt-wk-lbl">W27</div>
          <div class="pt-wk-val muted">${w27T>0?fmtN(w27T):'–'}</div>
          <div class="pt-wk-sub muted">running</div>
        </div>
        <div class="pt-week-box pt-week-voucher">
          <div class="pt-wk-lbl">VOUCHER</div>
          <div class="pt-wk-val">${fmtN(ks_t.voucherPakai)}/${fmtN(ks_t.voucherTersedia)}</div>
          <div class="pt-wk-sub pct-red">Sisa ${fmtN(vSisa)} pcs</div>
        </div>
      </div>
      <div class="pt-chart-wrap">
        <div class="pt-chart-legend">
          <span class="pt-leg-item"><span class="pt-leg-dot" style="background:#CBD5E1"></span>W24</span>
          <span class="pt-leg-item"><span class="pt-leg-dot" style="background:${color}CC"></span>W25</span>
          <span class="pt-leg-item"><span class="pt-leg-dot" style="background:${color}66"></span>W26</span>
        </div>
        <div class="pt-chart-canvas-wrap">
          <canvas id="chart-pt-${type}"></canvas>
        </div>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div class="pt-cards">
      ${buildCard('a37')}
      ${buildCard('a57')}
      ${buildCard('s26')}
    </div>`;

  // Build charts after DOM inserted
  requestAnimationFrame(()=>{
    ['a37','a57','s26'].forEach(type=>{
      const color = typeColor(type);
      const topStores = stores
        .filter(s=>s[type].w25>0||s[type].w24>0||s[type].mtd>0)
        .sort((a,b)=>b[type].w25-a[type].w25)
        .slice(0,15);
      const ctx = document.getElementById(`chart-pt-${type}`);
      if (!ctx || !topStores.length) return;
      const labels = topStores.map(s=>shortName(s.siteDesc));
      destroyChart(`pt-${type}`);
      _charts[`pt-${type}`] = new Chart(ctx, {
        type:'bar',
        data:{
          labels,
          datasets:[
            { label:'W24', data:topStores.map(s=>s[type].w24||0), backgroundColor:'#CBD5E1', borderRadius:3 },
            { label:'W25', data:topStores.map(s=>s[type].w25||0), backgroundColor:color+'CC', borderRadius:3 },
            { label:'W26', data:topStores.map(s=>s[type].w26||0), backgroundColor:color+'66', borderRadius:3 },
          ],
        },
        options:{ ...chartOpts({indexAxis:'y',scales:true,legend:true}), aspectRatio:undefined },
      });
    });
  });
}

/* ══════════════════════════════════════════
   VOUCHER TAB
══════════════════════════════════════════ */
function renderVoucherTab(data) {
  const el = document.getElementById('voucher-tab-content');
  if (!el || !data) return;
  destroyCharts('vc-vis','vc-top');

  const ks = data.kpi_summary;
  const stores = data.stores || [];
  const VVAL  = CONFIG.VOUCHER_VALUE;

  function vCard(type, label) {
    const t = ks[type];
    const sisa  = t.voucherTersedia - t.voucherPakai;
    const util  = t.voucherTersedia>0 ? t.voucherPakai/t.voucherTersedia : 0;
    const nilaiSisa = sisa * VVAL[type];
    const uncaptured= t.voucherTersedia * VVAL[type];
    const color = type==='a37'?'#1428A0':type==='a57'?'#F59E0B':'#8B5CF6';
    return `
    <div class="vc-summary-card" style="--vc-color:${color}">
      <div class="vc-card-header">${label}</div>
      <div class="vc-stats-row">
        <div class="vc-stat"><div class="vc-stat-lbl">Tersedia</div><div class="vc-stat-val">${fmtN(t.voucherTersedia)}</div></div>
        <div class="vc-stat"><div class="vc-stat-lbl">Terpakai</div><div class="vc-stat-val" style="color:${color}">${fmtN(t.voucherPakai)}</div></div>
      </div>
      <div class="vc-stats-row">
        <div class="vc-stat"><div class="vc-stat-lbl">Sisa</div><div class="vc-stat-val pct-red">${fmtN(sisa)}</div></div>
        <div class="vc-stat"><div class="vc-stat-lbl">Nilai Sisa</div><div class="vc-stat-val pct-red">${fmtRp(nilaiSisa)}</div></div>
      </div>
      <div class="vc-util-bar-wrap">
        <div class="vc-util-bar"><div class="vc-util-fill" style="width:${Math.min(util*100,100).toFixed(1)}%;background:${color}"></div></div>
        <span class="vc-util-lbl">Utilisasi: <strong>${fmtPct(util)}</strong></span>
      </div>
      <div class="vc-uncaptured">Potensi uncaptured: ${fmtRp(uncaptured)}</div>
    </div>`;
  }

  // Top stores by sisa for each type
  function topSisaRows(type, limit=15) {
    const color = type==='a37'?'#1428A0':type==='a57'?'#F59E0B':'#8B5CF6';
    const sorted = stores
      .map(s=>({...s, sisaType: s[type].voucherSisa ?? (s[type].voucherTersedia - s[type].voucherPakai), paiType: s[type].voucherPakai||0}))
      .filter(s=>s.sisaType>0)
      .sort((a,b)=>b.sisaType-a.sisaType)
      .slice(0,limit);
    if (!sorted.length) return '<div class="empty-state"><p>Tidak ada data.</p></div>';
    const maxSisa = sorted[0].sisaType;
    return sorted.map((s,i)=>`
      <div class="vc-top-row">
        <span class="vc-rank">${i+1}</span>
        <div class="vc-top-mid">
          <span class="vc-store-name">${shortName(s.siteDesc)}</span>
          <div class="vc-top-bar-wrap">
            <div class="vc-top-bar" style="width:${Math.min(s.sisaType/maxSisa*100,100).toFixed(1)}%;background:${color}40"></div>
          </div>
        </div>
        <span class="vc-sisa-val pct-red">${s.sisaType} sisa</span>
        <span class="vc-lob-tag">${s.leader||''}</span>
      </div>`).join('');
  }

  el.innerHTML = `
    <div class="vc-summary-row">
      ${vCard('a37','Galaxy A37')}
      ${vCard('a57','Galaxy A57')}
      ${vCard('s26','Galaxy S26')}
    </div>

    <div class="section-card">
      <div class="section-card-title">UTILISASI VOUCHER — VISUALISASI</div>
      <div class="vc-vis-wrap">
        <canvas id="chart-vc-vis" style="max-height:180px"></canvas>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-hdr">
        <div class="section-card-title">Top Toko — Voucher Sisa Terbanyak</div>
        <div class="vc-type-filters" id="vc-type-filters">
          <button class="filter-chip active" data-vctype="total">Total</button>
          <button class="filter-chip a37-chip" data-vctype="a37">A37</button>
          <button class="filter-chip a57-chip" data-vctype="a57">A57</button>
          <button class="filter-chip s26-chip" data-vctype="s26">S26</button>
        </div>
      </div>
      <div id="vc-top-rows">${topSisaByTotal(stores,15)}</div>
    </div>`;

  // Visualisasi chart
  requestAnimationFrame(()=>{
    const ctx = document.getElementById('chart-vc-vis');
    if (ctx) {
      destroyChart('vc-vis');
      _charts['vc-vis'] = new Chart(ctx,{
        type:'bar',
        data:{
          labels:['A37 (100K)','A57 (200K)','S26 (300K)'],
          datasets:[
            { label:'Terpakai', data:[ks.a37.voucherPakai,ks.a57.voucherPakai,ks.s26.voucherPakai], backgroundColor:['#1428A099','#F59E0B99','#8B5CF699'], borderRadius:4 },
            { label:'Sisa', data:[ks.a37.voucherTersedia-ks.a37.voucherPakai, ks.a57.voucherTersedia-ks.a57.voucherPakai, ks.s26.voucherTersedia-ks.s26.voucherPakai], backgroundColor:['#1428A022','#F59E0B22','#8B5CF622'], borderRadius:4 },
          ],
        },
        options:{ ...chartOpts({scales:true,stacked:true,legend:true}), aspectRatio:undefined },
      });
    }
    // Type filter wiring
    document.querySelectorAll('#vc-type-filters .filter-chip').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('#vc-type-filters .filter-chip').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.vctype;
        const wrap = document.getElementById('vc-top-rows');
        if (wrap) wrap.innerHTML = type==='total' ? topSisaByTotal(stores,15) : topSisaRows(type,15);
      });
    });
  });
}

function topSisaByTotal(stores, limit) {
  const sorted = stores
    .map(s=>({...s, sisaTotal: s.vSisa||0}))
    .filter(s=>s.sisaTotal>0)
    .sort((a,b)=>b.sisaTotal-a.sisaTotal)
    .slice(0,limit);
  if (!sorted.length) return '<div class="empty-state"><p>Tidak ada data.</p></div>';
  const maxSisa = sorted[0].sisaTotal;
  return sorted.map((s,i)=>`
    <div class="vc-top-row">
      <span class="vc-rank">${i+1}</span>
      <div class="vc-top-mid">
        <span class="vc-store-name">${shortName(s.siteDesc)}</span>
        <div class="vc-top-bar-wrap">
          <div class="vc-top-bar" style="width:${Math.min(s.sisaTotal/maxSisa*100,100).toFixed(1)}%;background:#EF444440"></div>
        </div>
      </div>
      <span class="vc-sisa-val pct-red">${s.sisaTotal} sisa</span>
      <span class="vc-lob-tag">${s.leader||''}</span>
    </div>`).join('');
}

/* ══════════════════════════════════════════
   PER LOB TAB
══════════════════════════════════════════ */
function renderPerLOB(data) {
  const el = document.getElementById('perlob-content');
  if (!el || !data) return;
  destroyCharts('lob-mtd','lob-wow');

  const leaders = data.by_leader || [];
  const ks = data.kpi_summary;
  const wl = data.meta?.weekLabels || { w1:'W-1', w2:'W-curr' };

  function lobCard(ldr) {
    const total    = (ldr.a37.mtd||0)+(ldr.a57.mtd||0)+(ldr.s26.mtd||0);
    const totalTgt = (ldr.a37.target||0)+(ldr.a57.target||0)+(ldr.s26.target||0);
    const totalPct = totalTgt>0?total/totalTgt:0;
    const w24Total = (ldr.a37.w24||0)+(ldr.a57.w24||0)+(ldr.s26.w24||0);
    const w25Total = (ldr.a37.w25||0)+(ldr.a57.w25||0)+(ldr.s26.w25||0);
    const wowTotal = w25Total - w24Total;

    function subCard(type) {
      const t   = ldr[type];
      const col = type==='a37'?'#1428A0':type==='a57'?'#F59E0B':'#8B5CF6';
      const maxBar = Math.max(t.w24||0, t.w25||0, t.w26||0, 1);
      const wow24_25 = (t.w25||0)-(t.w24||0);
      const wow25_26 = (t.w26||0)-(t.w25||0);
      return `
      <div class="lob-sub-card" style="--lob-color:${col}">
        <div class="lob-sub-type">${type.toUpperCase()}</div>
        <div class="lob-sub-mtd">${fmtN(t.mtd)}</div>
        <div class="lob-sub-bars">
          <div class="lob-bar-row">
            <span class="lob-bar-lbl">W24</span>
            <div class="lob-bar-wrap"><div class="lob-bar-fill" style="width:${Math.min((t.w24||0)/maxBar*100,100).toFixed(1)}%;background:#CBD5E1"></div></div>
            <span class="lob-bar-val">${fmtN(t.w24||0)}</span>
          </div>
          <div class="lob-bar-row">
            <span class="lob-bar-lbl">W25</span>
            <div class="lob-bar-wrap"><div class="lob-bar-fill" style="width:${Math.min((t.w25||0)/maxBar*100,100).toFixed(1)}%;background:${col}CC"></div></div>
            <span class="lob-bar-val">${fmtN(t.w25||0)}</span>
          </div>
          <div class="lob-bar-row">
            <span class="lob-bar-lbl">W26</span>
            <div class="lob-bar-wrap"><div class="lob-bar-fill" style="width:${Math.min((t.w26||0)/maxBar*100,100).toFixed(1)}%;background:${col}66"></div></div>
            <span class="lob-bar-val">${fmtN(t.w26||0)}</span>
          </div>
        </div>
        <div class="lob-sub-voucher">
          <span class="lob-v-lbl">Voucher</span>
          <span>W24:${fmtN(t.vW24||0)} W25:${fmtN(t.vW25||0)} W26:${fmtN(t.vW26||0)}</span>
        </div>
        <div class="lob-sub-wow ${clsWoW(wow24_25)}">${fmtWoW(wow24_25)} W24→W25 &nbsp;|&nbsp; <span class="${clsWoW(wow25_26)}">${fmtWoW(wow25_26)} W25→W26</span></div>
      </div>`;
    }

    return `
    <div class="lob-card">
      <div class="lob-card-header">
        <div>
          <div class="lob-name">${ldr.name}</div>
          <div class="lob-store-count">${ldr.storeCount||'–'} toko</div>
        </div>
        <div class="lob-total-block">
          <div class="lob-total-val">${fmtN(total)}</div>
          <div class="lob-total-sub">MTD total · <span class="${clsPct(totalPct)}">${fmtPct(totalPct)}</span></div>
          <div class="lob-wow-badge ${clsWoW(wowTotal)}">${fmtWoW(wowTotal)} WoW (W24→W25)</div>
        </div>
      </div>
      <div class="lob-sub-grid">
        ${subCard('a37')}${subCard('a57')}${subCard('s26')}
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div class="section-card">
      <div class="section-card-title">PERBANDINGAN MTD PER LOB</div>
      <div style="height:220px"><canvas id="chart-lob-mtd"></canvas></div>
    </div>
    <div class="section-card">
      <div class="section-card-title">W24 VS W25 PER LOB</div>
      <div style="height:200px"><canvas id="chart-lob-wow"></canvas></div>
    </div>
    <div class="lob-cards">
      ${leaders.map(lobCard).join('')}
    </div>`;

  requestAnimationFrame(()=>{
    const lobNames = leaders.map(l=>l.name);
    // MTD chart
    const ctxM = document.getElementById('chart-lob-mtd');
    if (ctxM) {
      _charts['lob-mtd'] = new Chart(ctxM,{
        type:'bar',
        data:{
          labels:lobNames,
          datasets:[
            { label:'A37', data:leaders.map(l=>l.a37.mtd||0), backgroundColor:'#1428A088', borderRadius:4 },
            { label:'A57', data:leaders.map(l=>l.a57.mtd||0), backgroundColor:'#F59E0B88', borderRadius:4 },
            { label:'S26', data:leaders.map(l=>l.s26.mtd||0), backgroundColor:'#8B5CF688', borderRadius:4 },
          ],
        },
        options:chartOpts({scales:true,legend:true}),
      });
    }
    // WoW chart W24/W25/W26
    const ctxW = document.getElementById('chart-lob-wow');
    if (ctxW) {
      _charts['lob-wow'] = new Chart(ctxW,{
        type:'bar',
        data:{
          labels:lobNames,
          datasets:[
            { label:'W24', data:leaders.map(l=>(l.a37.w24||0)+(l.a57.w24||0)+(l.s26.w24||0)), backgroundColor:'#CBD5E188', borderRadius:4 },
            { label:'W25', data:leaders.map(l=>(l.a37.w25||0)+(l.a57.w25||0)+(l.s26.w25||0)), backgroundColor:'#1428A088', borderRadius:4 },
            { label:'W26', data:leaders.map(l=>(l.a37.w26||0)+(l.a57.w26||0)+(l.s26.w26||0)), backgroundColor:'#00B2E388', borderRadius:4 },
          ],
        },
        options:chartOpts({scales:true,legend:true}),
      });
    }
  });
}

/* ══════════════════════════════════════════
   PER TOKO TAB
══════════════════════════════════════════ */
let _tokoLeader  = 'all';
let _tokoSortCol = 'mtdTotal';
let _tokoSortDir = -1;

function renderPerToko(data) {
  const el = document.getElementById('pertoko-content');
  if (!el || !data) return;

  const stores  = data.stores||[];
  const leaders = [...new Set(stores.map(s=>s.leader))].sort();
  const wl      = data.meta?.weekLabels||{w1:'W-1',w2:'W-curr'};

  function buildTable() {
    let filtered = stores;
    if (_tokoLeader!=='all') filtered=filtered.filter(s=>s.leader===_tokoLeader);
    filtered = filtered.slice().sort((a,b)=>{
      const av = _tokoSortCol==='mtdTotal'?a.mtdTotal:_tokoSortCol==='a37'?a.a37.mtd:_tokoSortCol==='a57'?a.a57.mtd:a.s26.mtd;
      const bv = _tokoSortCol==='mtdTotal'?b.mtdTotal:_tokoSortCol==='a37'?b.a37.mtd:_tokoSortCol==='a57'?b.a57.mtd:b.s26.mtd;
      return _tokoSortDir*(bv-av);
    });

    const rows = filtered.map(s=>{
      const pct    = s.targetTotal > 0 ? s.mtdTotal / s.targetTotal : 0;
      const pctCls = pct>=1?'pct-green':pct>=0.8?'pct-amber':'pct-red';
      const vSisa  = s.vSisa || 0;
      const sisCls = vSisa <= 0 ? 'pct-red' : '';
      return `<tr data-code="${s.siteCode}">
        <td><span class="toko-code">${s.siteCode}</span></td>
        <td class="toko-name-cell">${s.siteDesc}</td>
        <td><span class="lob-badge">${s.leader}</span></td>
        <td class="num-cell"><strong>${fmtN(s.mtdTotal)}</strong></td>
        <td class="num-cell ${pctCls}">${(pct*100).toFixed(0)}%</td>
        <td class="num-cell">${fmtN(s.w24Total||0)}</td>
        <td class="num-cell">${fmtN(s.w25Total||0)}</td>
        <td class="num-cell">${fmtN(s.w26Total||0)}</td>
        <td class="num-cell">${fmtN(s.w27Total||0)}</td>
        <td class="num-cell tbl-sep">${fmtN(s.vW24Total||0)}</td>
        <td class="num-cell">${fmtN(s.vW25Total||0)}</td>
        <td class="num-cell">${fmtN(s.vW26Total||0)}</td>
        <td class="num-cell">${fmtN(s.vW27Total||0)}</td>
        <td class="num-cell tbl-sep ${sisCls}">${fmtN(vSisa)}</td>
        <td class="num-cell">${fmtN(s.a37.mtd)}</td>
        <td class="num-cell">${fmtN(s.a57.mtd)}</td>
        <td class="num-cell">${fmtN(s.s26.mtd)}</td>
      </tr>`;
    }).join('');

    return `<div class="toko-table-wrap"><table class="toko-table">
      <thead>
        <tr class="tbl-group-header">
          <th colspan="5"></th>
          <th colspan="4" class="tbl-group-label">Ach Sales per Week</th>
          <th colspan="4" class="tbl-group-label tbl-sep">Voucher Terpakai / Week</th>
          <th class="tbl-group-label tbl-sep">Sisa</th>
          <th colspan="3" class="tbl-group-label">MTD per Tipe</th>
        </tr>
        <tr>
          <th>Code</th><th>Toko</th><th>LOB</th>
          <th class="num-cell sortable ${_tokoSortCol==='mtdTotal'?'sort-active':''}" data-sort="mtdTotal">MTD</th>
          <th class="num-cell">%Target</th>
          <th class="num-cell">W24</th>
          <th class="num-cell">W25</th>
          <th class="num-cell">W26</th>
          <th class="num-cell">W27</th>
          <th class="num-cell tbl-sep">V.W24</th>
          <th class="num-cell">V.W25</th>
          <th class="num-cell">V.W26</th>
          <th class="num-cell">V.W27</th>
          <th class="num-cell tbl-sep">V.Sisa</th>
          <th class="num-cell sortable ${_tokoSortCol==='a37'?'sort-active':''}" data-sort="a37">A37</th>
          <th class="num-cell sortable ${_tokoSortCol==='a57'?'sort-active':''}" data-sort="a57">A57</th>
          <th class="num-cell sortable ${_tokoSortCol==='s26'?'sort-active':''}" data-sort="s26">S26</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  el.innerHTML = `
    <div class="toko-controls">
      <div class="toko-leader-filters" id="toko-leader-filters">
        <button class="filter-chip ${_tokoLeader==='all'?'active':''}" data-leader="all">ALL</button>
        ${leaders.map(l=>`<button class="filter-chip ${_tokoLeader===l?'active':''}" data-leader="${l}">${l}</button>`).join('')}
      </div>
      <div class="toko-sort-row">
        Sort:
        ${['mtdTotal','a37','a57','s26'].map(col=>`<button class="sort-chip ${_tokoSortCol===col?'active':''}" data-sort="${col}">${col==='mtdTotal'?'MTD Total':col.toUpperCase()}</button>`).join('')}
      </div>
    </div>
    <div id="toko-table-container">${buildTable()}</div>`;

  // Wiring
  el.querySelectorAll('#toko-leader-filters .filter-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{
      _tokoLeader=btn.dataset.leader;
      renderPerToko(data);
    });
  });
  el.querySelectorAll('.sort-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if (_tokoSortCol===btn.dataset.sort) _tokoSortDir*=-1;
      else { _tokoSortCol=btn.dataset.sort; _tokoSortDir=-1; }
      renderPerToko(data);
    });
  });
  // Sortable table headers
  el.querySelectorAll('th.sortable').forEach(th=>{
    th.addEventListener('click',()=>{
      if (_tokoSortCol===th.dataset.sort) _tokoSortDir*=-1;
      else { _tokoSortCol=th.dataset.sort; _tokoSortDir=-1; }
      document.getElementById('toko-table-container').innerHTML=buildTable();
      // re-wire headers
      el.querySelectorAll('th.sortable').forEach(t2=>t2.addEventListener('click',()=>{
        if (_tokoSortCol===t2.dataset.sort) _tokoSortDir*=-1;
        else { _tokoSortCol=t2.dataset.sort; _tokoSortDir=-1; }
        document.getElementById('toko-table-container').innerHTML=buildTable();
      }));
    });
  });
  // Store click modal
  el.querySelectorAll('.toko-table tbody tr').forEach(row=>{
    row.addEventListener('click',()=>{
      const store = (data.stores||[]).find(s=>s.siteCode===row.dataset.code);
      if (store) openStoreModal(store, data.meta?.weekLabels);
    });
  });
}

/* ══════════════════════════════════════════
   RANKING WOW TAB
══════════════════════════════════════════ */
let _wowBU   = 'all';
let _wowPair = 'w24w25';

function renderRankingWoW(data) {
  const el = document.getElementById('ranking-content');
  if (!el || !data) return;
  destroyCharts('wow-chart','wow-top12');

  const allStores = data.stores||[];
  const leaders   = data.by_leader||[];

  // BU list from stores
  const buList = [...new Set(allStores.map(s=>s.bu||'').filter(Boolean))].sort();

  // Filter by BU
  const stores = _wowBU==='all' ? allStores : allStores.filter(s=>s.bu===_wowBU);

  // WoW pair config
  const pairCfg = {
    w24w25: { prev:'w24Total', curr:'w25Total', label:'W24 → W25' },
    w25w26: { prev:'w25Total', curr:'w26Total', label:'W25 → W26' },
    w26w27: { prev:'w26Total', curr:'w27Total', label:'W26 → W27' },
    total:  { prev:'w24Total', curr:'w27Total', label:'Total W24→W27' },
  };
  const pair = pairCfg[_wowPair] || pairCfg.w24w25;

  const enriched = stores.map(s=>{
    const prev = s[pair.prev]||0;
    const curr = s[pair.curr]||0;
    return { ...s, wowPrev:prev, wowCurr:curr, wowAbs:curr-prev, wowPct:prev>0?(curr-prev)/prev:0 };
  });

  const active = enriched.filter(s=>s.wowPrev>0||s.wowCurr>0);
  const growers  = [...active].sort((a,b)=>b.wowAbs-a.wowAbs).slice(0,3);
  const declines = [...active].sort((a,b)=>a.wowAbs-b.wowAbs).slice(0,3);
  const growPct  = enriched.filter(s=>s.wowPrev>=2).sort((a,b)=>b.wowPct-a.wowPct).slice(0,3);
  const vcTopW   = [...enriched].sort((a,b)=>(b.vUsed||0)-(a.vUsed||0)).slice(0,3);

  function wowStoreCard(s, color) {
    const maxBar = Math.max(s.wowPrev, s.wowCurr, 1);
    const prevLbl = pair.label.split(' → ')[0]||'Prev';
    const currLbl = pair.label.split(' → ')[1]||'Curr';
    return `
    <div class="wow-store-item">
      <div class="wow-store-name">${shortName(s.siteDesc)}</div>
      <div class="wow-store-sub">${s.leader} · ${s.siteCode} · <span class="wow-bu-tag">${s.bu||''}</span></div>
      <div class="wow-store-detail">MTD:${fmtN(s.mtdTotal)} · Est:${fmtN((s.a37?.est||0)+(s.a57?.est||0)+(s.s26?.est||0))}</div>
      <div class="wow-bars">
        <div class="wow-bar-row"><span class="wow-bar-lbl">${prevLbl}</span><div class="wow-bar-outer"><div class="wow-bar-fill" style="width:${Math.min(s.wowPrev/maxBar*100,100).toFixed(1)}%;background:#94A3B8"></div></div><span class="wow-bar-end">${s.wowPrev}</span></div>
        <div class="wow-bar-row"><span class="wow-bar-lbl">${currLbl}</span><div class="wow-bar-outer"><div class="wow-bar-fill" style="width:${Math.min(s.wowCurr/maxBar*100,100).toFixed(1)}%;background:${color}"></div></div><span class="wow-bar-end">${s.wowCurr}</span></div>
      </div>
      <div class="wow-delta ${clsWoW(s.wowAbs)}">${fmtWoW(s.wowAbs)}</div>
    </div>`;
  }

  function lobWoWCard(ldr) {
    const storesOfLdr = enriched.filter(s=>s.leader===ldr.name);
    const top = [...storesOfLdr].sort((a,b)=>b.wowAbs-a.wowAbs)[0];
    const bot = [...storesOfLdr].sort((a,b)=>a.wowAbs-b.wowAbs)[0];
    return `
    <div class="lob-wow-card">
      <div class="lob-wow-title">${ldr.name} <span>(${ldr.storeCount||0} toko)</span></div>
      ${top ? `<div class="lob-wow-top"><span class="lob-wow-badge wow-pos">TOP GROWER</span><div>${shortName(top.siteDesc)}</div><div class="wow-delta wow-pos">${fmtWoW(top.wowAbs)}</div></div>` : ''}
      ${bot && bot.wowAbs<0 ? `<div class="lob-wow-bot"><span class="lob-wow-badge wow-neg">PERLU PERHATIAN</span><div>${shortName(bot.siteDesc)}</div><div class="wow-delta wow-neg">${fmtWoW(bot.wowAbs)}</div></div>` : ''}
    </div>`;
  }

  // Zero-sales list per type
  function zeroSalesSection() {
    const types = ['a37','a57','s26'];
    const names = { a37:'Galaxy A37', a57:'Galaxy A57', s26:'Galaxy S26' };
    const colors= { a37:'#1428A0', a57:'#F59E0B', s26:'#8B5CF6' };
    return types.map(type=>{
      const zeros = allStores.filter(s=>(s[type]?.mtd||0)===0);
      if (!zeros.length) return '';
      return `
      <div class="zero-sales-block">
        <div class="zero-sales-type" style="color:${colors[type]}">${names[type]} — ${zeros.length} toko belum ada penjualan</div>
        <div class="zero-sales-list">
          ${zeros.map(s=>`<span class="zero-sales-item">${s.siteCode} <span class="zero-sales-name">${shortName(s.siteDesc)}</span></span>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  const top12 = [...enriched].sort((a,b)=>b.wowCurr-a.wowCurr).slice(0,12);

  el.innerHTML = `
    <div class="wow-controls">
      <div class="wow-filter-row">
        <span class="wow-filter-label">BU / Organisasi:</span>
        <div class="wow-bu-filters" id="wow-bu-filters">
          <button class="filter-chip ${_wowBU==='all'?'active':''}" data-bu="all">Semua</button>
          ${buList.map(bu=>`<button class="filter-chip ${_wowBU===bu?'active':''}" data-bu="${bu}">${bu}</button>`).join('')}
        </div>
      </div>
      <div class="wow-filter-row">
        <span class="wow-filter-label">Perbandingan WoW:</span>
        <div class="wow-pair-filters" id="wow-pair-filters">
          ${Object.entries(pairCfg).map(([k,v])=>`<button class="filter-chip ${_wowPair===k?'active':''}" data-pair="${k}">${v.label}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="wow-top-grid">
      <div class="wow-panel wow-panel-green">
        <div class="wow-panel-title">■ TOP 3 GROWER — ${pair.label}</div>
        ${growers.length ? growers.map(s=>wowStoreCard(s,'#10B981')).join('') : '<div class="empty-state-sm">Tidak ada data</div>'}
      </div>
      <div class="wow-panel wow-panel-red">
        <div class="wow-panel-title">■ BOTTOM 3 DECLINE — ${pair.label}</div>
        ${declines.filter(s=>s.wowAbs<0).length ? declines.filter(s=>s.wowAbs<0).map(s=>wowStoreCard(s,'#EF4444')).join('') : '<div class="empty-state-sm">Semua toko positif 👍</div>'}
      </div>
      <div class="wow-panel wow-panel-amber">
        <div class="wow-panel-title">■ TOP 3 GROWTH %</div>
        ${growPct.map(s=>`
        <div class="wow-store-item">
          <div class="wow-store-name">${shortName(s.siteDesc)}</div>
          <div class="wow-store-sub">${s.leader} · ${s.bu||''}</div>
          <div class="wow-delta wow-pos">${s.wowPct>=0?'+':''}${(s.wowPct*100).toFixed(0)}%</div>
          <div class="wow-store-sub">${fmtWoW(s.wowAbs)} unit</div>
        </div>`).join('')}
      </div>
      <div class="wow-panel wow-panel-blue">
        <div class="wow-panel-title">■ TOP 3 VOUCHER USAGE</div>
        ${vcTopW.map((s,i)=>`
        <div class="wow-store-item">
          <span class="wow-rank">${i+1}</span>
          <div class="wow-store-name">${shortName(s.siteDesc)}</div>
          <div class="wow-store-sub">${s.siteCode} · ${s.bu||''}</div>
          <div class="wow-store-detail">V.W24:${fmtN(s.vW24Total||0)} W25:${fmtN(s.vW25Total||0)} W26:${fmtN(s.vW26Total||0)}</div>
          <div class="wow-delta wow-pos">${fmtN(s.vUsed||0)} pcs total</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-title">● Top &amp; Bottom per LOB</div>
      <div class="lob-wow-grid">${leaders.map(lobWoWCard).join('')}</div>
    </div>

    <div class="section-card">
      <div class="section-card-title">WOW MOVEMENT TOP 12 — ${pair.label}</div>
      <div style="height:260px"><canvas id="chart-wow-top12"></canvas></div>
    </div>

    <div class="section-card">
      <div class="section-card-title">● Toko Belum Ada Penjualan (MTD = 0)</div>
      <div class="zero-sales-wrap">${zeroSalesSection()||'<div class="empty-state-sm">Semua toko sudah ada penjualan 🎉</div>'}</div>
    </div>`;

  // Wire filters
  el.querySelectorAll('#wow-bu-filters .filter-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{ _wowBU=btn.dataset.bu; renderRankingWoW(data); });
  });
  el.querySelectorAll('#wow-pair-filters .filter-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{ _wowPair=btn.dataset.pair; renderRankingWoW(data); });
  });

  requestAnimationFrame(()=>{
    const ctx = document.getElementById('chart-wow-top12');
    if (!ctx || !top12.length) return;
    const prevLbl = pair.label.split(' → ')[0]||'Prev';
    const currLbl = pair.label.split(' → ')[1]||'Curr';
    destroyChart('wow-chart');
    _charts['wow-chart'] = new Chart(ctx,{
      type:'bar',
      data:{
        labels: top12.map(s=>shortName(s.siteDesc)),
        datasets:[
          { label:prevLbl, data:top12.map(s=>s.wowPrev), backgroundColor:'#94A3B8CC', borderRadius:3 },
          { label:currLbl, data:top12.map(s=>s.wowCurr), backgroundColor:'#1428A0CC', borderRadius:3 },
        ],
      },
      options:chartOpts({scales:true,legend:true}),
    });
  });
}

/* ══════════════════════════════════════════
   STORE DETAIL MODAL
══════════════════════════════════════════ */
function openStoreModal(store, weekLabels) {
  const modal   = document.getElementById('store-modal');
  const content = document.getElementById('store-modal-content');
  if (!modal||!content) return;
  const wl = weekLabels||{w1:'W-1',w2:'W-curr'};

  function typeBlock(label, t) {
    return `
    <div class="store-type-card">
      <div class="store-type-name">${label}</div>
      <div class="store-metric"><span>Baseline</span><span>${fmtN(t.baseline)}</span></div>
      <div class="store-metric"><span>Target</span><span>${fmtN(t.target)}</span></div>
      <div class="store-metric"><span>MtD</span><span>${fmtN(t.mtd)}</span></div>
      <div class="store-metric"><span>Est</span><span>${fmtN(t.est)}</span></div>
      <div class="store-metric"><span>Est%</span><span class="${clsPct(t.estPct)}">${fmtPct(t.estPct)}</span></div>
      <div class="store-metric"><span>V.Tersedia</span><span>${fmtN(t.voucherTersedia)}</span></div>
      <div class="store-metric"><span>V.Pakai</span><span>${fmtN(t.pakai)}</span></div>
      <div class="store-metric"><span>${wl.w1}</span><span>${fmtN(t.w25)}</span></div>
      <div class="store-metric"><span>${wl.w2}</span><span>${fmtN(t.w26)}</span></div>
    </div>`;
  }

  content.innerHTML = `
    <div class="store-modal-header">
      <div class="store-modal-title">${store.siteCode} — ${store.siteDesc}</div>
      <div class="store-modal-meta">${store.leader} · ${store.tsh} · ${store.bu} · ${store.territory}</div>
    </div>
    <div class="store-type-grid">
      ${typeBlock('Galaxy A37',store.a37)}
      ${typeBlock('Galaxy A57',store.a57)}
      ${typeBlock('Galaxy S26',store.s26)}
    </div>`;
  modal.classList.remove('hidden');
}

/* ═══ Render All ═══ */
function renderAll(data) {
  renderMeta(data?.meta);
  renderOverview(data);
  if (_activeTab==='per-tipe')    renderPerTipe(data);
  if (_activeTab==='voucher')     renderVoucherTab(data);
  if (_activeTab==='per-lob')     renderPerLOB(data);
  if (_activeTab==='per-toko')    renderPerToko(data);
  if (_activeTab==='ranking-wow') renderRankingWoW(data);
}

/* ═══ Upload Modal ═══ */
function initUploadModal() {
  const btn   = document.getElementById('btn-open-upload');
  const modal = document.getElementById('upload-modal');
  const close = document.getElementById('btn-close-upload');
  btn?.addEventListener('click', ()=>modal?.classList.remove('hidden'));
  close?.addEventListener('click', ()=>modal?.classList.add('hidden'));
  modal?.addEventListener('click', e=>{ if(e.target===modal) modal.classList.add('hidden'); });

  window.__onPreview = (json)=>{
    _data = json;
    saveLocalData(json);
    renderAll(_data);
    // Tampilkan hint submit — modal TIDAK auto-close
    document.getElementById('submit-hint')?.classList.remove('hidden');
  };

  initUploadZone(CONFIG.GAS_URL, CONFIG.TOKEN, (json)=>{
    // Dipanggil setelah submit ke server berhasil — baru tutup modal
    modal?.classList.add('hidden');
    document.getElementById('submit-hint')?.classList.add('hidden');
    _data = json;
    saveLocalData(json);
    renderAll(_data);
  });
}

/* ═══ Store Modal ═══ */
function initStoreModal() {
  const modal = document.getElementById('store-modal');
  const close = document.getElementById('btn-close-store');
  close?.addEventListener('click', ()=>modal?.classList.add('hidden'));
  modal?.addEventListener('click', e=>{ if(e.target===modal) modal.classList.add('hidden'); });
}

/* ═══ Countdown ═══ */
function startCountdown() {
  function update() {
    const diff = Math.max(CONFIG.CAMPAIGN_END-Date.now(),0);
    const d=Math.floor(diff/86400000);
    const h=Math.floor((diff%86400000)/3600000);
    const m=Math.floor((diff%3600000)/60000);
    const s=Math.floor((diff%60000)/1000);
    const pad=n=>String(n).padStart(2,'0');
    ['cd-d','cd-h','cd-m','cd-s'].forEach((id,i)=>{
      const el=document.getElementById(id);
      if(el) el.textContent=pad([d,h,m,s][i]);
    });
  }
  update(); setInterval(update,1000);
}

/* ═══ Admin Panel ═══ */
const ADMIN_DEFAULTS = {
  region:'SBD SAMSUNG · JABO B', brand:'SAMSUNG', title:'SUPER BRAND DAY',
  subtitle:'Monitoring Dashboard · Erafone & Samsung Store',
  periode:'8 – 22 Juni 2026', countdownLabel:'Kampanye berakhir dalam',
  endDate:'2026-06-22T23:59', heroColor:'#1428A0',
};

function loadAdminConfig() {
  try { const s=localStorage.getItem('sbd-admin-config'); return s?{...ADMIN_DEFAULTS,...JSON.parse(s)}:{...ADMIN_DEFAULTS}; }
  catch { return {...ADMIN_DEFAULTS}; }
}
function saveAdminConfig(cfg) { localStorage.setItem('sbd-admin-config',JSON.stringify(cfg)); }

function applyAdminConfig(cfg) {
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('topbar-region',cfg.region); set('hero-brand-name',cfg.brand);
  set('hero-title',cfg.title); set('hero-subtitle',cfg.subtitle);
  set('hero-periode',cfg.periode); set('hero-countdown-label',cfg.countdownLabel);
  const hero=document.getElementById('sec-hero');
  if (hero) {
    const localImg = localStorage.getItem('sbd-hero-image');
    const imgSrc = localImg || 'HEADER/Header.png';
    let heroImgEl = document.getElementById('hero-bg-image');
    if (!heroImgEl) {
      heroImgEl = document.createElement('img');
      heroImgEl.id = 'hero-bg-image';
      heroImgEl.style.cssText = 'width:100%;height:auto;display:block;border-radius:inherit;';
      hero.appendChild(heroImgEl);
    }
    heroImgEl.src = imgSrc;
  }
  CONFIG.CAMPAIGN_END=new Date(cfg.endDate);
}

function initAdminPanel() {
  const modal   =document.getElementById('admin-modal');
  const btnOpen =document.getElementById('btn-open-admin');
  const btnClose=document.getElementById('btn-close-admin');
  const btnSave =document.getElementById('btn-admin-save');
  const btnReset=document.getElementById('btn-admin-reset');
  if (!modal) return;

  function openAdmin(){
    const cfg=loadAdminConfig();
    document.getElementById('adm-region').value=cfg.region;
    document.getElementById('adm-brand').value=cfg.brand;
    document.getElementById('adm-title').value=cfg.title;
    document.getElementById('adm-subtitle').value=cfg.subtitle;
    document.getElementById('adm-periode').value=cfg.periode;
    document.getElementById('adm-countdown-label').value=cfg.countdownLabel;
    document.getElementById('adm-enddate').value=cfg.endDate;
    document.getElementById('adm-hero-color').value=cfg.heroColor;
    document.getElementById('adm-hero-color-txt').value=cfg.heroColor;
    const savedImg=localStorage.getItem('sbd-hero-image');
    showImagePreview(savedImg||null);
    modal.classList.remove('hidden');
  }

  const imgDropzone   =document.getElementById('adm-img-dropzone');
  const imgInput      =document.getElementById('adm-img-input');
  const imgPreviewWrap=document.getElementById('adm-img-preview-wrap');
  const imgPreviewEl  =document.getElementById('adm-img-preview');
  const imgPlaceholder=document.getElementById('adm-img-placeholder');
  const imgRemoveBtn  =document.getElementById('adm-img-remove');

  function showImagePreview(dataUrl){
    if(dataUrl){ imgPreviewEl.src=dataUrl; imgPreviewWrap?.classList.remove('hidden'); imgPlaceholder?.classList.add('hidden'); }
    else { imgPreviewWrap?.classList.add('hidden'); imgPlaceholder?.classList.remove('hidden'); }
  }
  function readImageFile(file){
    if(!file||!file.type.startsWith('image/')) return;
    const reader=new FileReader();
    reader.onload=e=>{ localStorage.setItem('sbd-hero-image',e.target.result); showImagePreview(e.target.result); };
    reader.readAsDataURL(file);
  }

  imgDropzone?.addEventListener('click',()=>imgInput?.click());
  imgInput?.addEventListener('change',()=>readImageFile(imgInput.files[0]));
  ['dragenter','dragover'].forEach(ev=>imgDropzone?.addEventListener(ev,e=>{e.preventDefault();imgDropzone.classList.add('drag-over');}));
  ['dragleave','drop'].forEach(ev=>imgDropzone?.addEventListener(ev,e=>{e.preventDefault();imgDropzone.classList.remove('drag-over');}));
  imgDropzone?.addEventListener('drop',e=>readImageFile(e.dataTransfer.files[0]));
  imgRemoveBtn?.addEventListener('click',e=>{e.stopPropagation();localStorage.removeItem('sbd-hero-image');if(imgInput)imgInput.value='';showImagePreview(null);});

  const colorPicker=document.getElementById('adm-hero-color');
  const colorTxt   =document.getElementById('adm-hero-color-txt');
  colorPicker?.addEventListener('input',()=>{if(colorTxt)colorTxt.value=colorPicker.value;});
  colorTxt?.addEventListener('input',()=>{ const v=colorTxt.value; if(/^#[0-9A-Fa-f]{6}$/.test(v)&&colorPicker) colorPicker.value=v; });

  btnOpen?.addEventListener('click',openAdmin);
  btnClose?.addEventListener('click',()=>modal.classList.add('hidden'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden');});

  btnSave?.addEventListener('click',()=>{
    const cfg={
      region:document.getElementById('adm-region').value||ADMIN_DEFAULTS.region,
      brand:document.getElementById('adm-brand').value||ADMIN_DEFAULTS.brand,
      title:document.getElementById('adm-title').value||ADMIN_DEFAULTS.title,
      subtitle:document.getElementById('adm-subtitle').value||ADMIN_DEFAULTS.subtitle,
      periode:document.getElementById('adm-periode').value||ADMIN_DEFAULTS.periode,
      countdownLabel:document.getElementById('adm-countdown-label').value||ADMIN_DEFAULTS.countdownLabel,
      endDate:document.getElementById('adm-enddate').value||ADMIN_DEFAULTS.endDate,
      heroColor:document.getElementById('adm-hero-color').value||ADMIN_DEFAULTS.heroColor,
    };
    saveAdminConfig(cfg); applyAdminConfig(cfg);
    modal.classList.add('hidden'); startCountdown();
  });
  btnReset?.addEventListener('click',()=>{
    if(!confirm('Reset semua pengaturan ke default?')) return;
    localStorage.removeItem('sbd-admin-config');
    applyAdminConfig({...ADMIN_DEFAULTS});
    modal.classList.add('hidden'); startCountdown();
  });
}

/* ═══ Boot ═══ */
async function init() {
  applyAdminConfig(loadAdminConfig());
  startCountdown();
  initMainTabs();
  initUploadModal();
  initStoreModal();
  initAdminPanel();
  try {
    const data = await fetchData();
    _data = data;
    renderAll(data);
  } catch(err) {
    console.error('Fetch gagal:', err);
    renderAll(null);
    const lu=document.getElementById('last-updated');
    if(lu) lu.textContent='Gagal memuat — '+err.message;
  }
}

document.addEventListener('DOMContentLoaded', init);
