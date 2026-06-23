// upload-handler.js — SheetJS parser + JSON builder + POST to Apps Script

/* ─── Column index map (0-based) ─── */
const COL = {
  SITE_CODE:0, SITE_DESC:1, LEADER:2, TSH:3, BU:4, STATUS:5, TERRITORY:6,
  A37:{ BASE:7, TGT:8, MTD:9, EST:10, EST_PCT:11, SYARAT:12, V_AVAIL:13, V_PAKAI:14, W25:15, W26:16, W27:17, TGT_WK:19 },
  A57:{ BASE:20, TGT:21, MTD:22, EST:23, EST_PCT:24, SYARAT:25, V_AVAIL:26, V_PAKAI:27, W25:28, W26:29, W27:30, TGT_WK:31 },
  S26:{ BASE:32, TGT:33, MTD:34, EST:35, EST_PCT:36, SYARAT:37, V_AVAIL:38, V_PAKAI:39, W25:40, W26:41, W27:42, TGT_WK:43 },
  KUOTA:44, TRUE_NOT:45,
  REC_NAME:48,
  REC_A37:{ TGT:49, MTD:50, EST:51, EST_PCT:52, V_AVAIL:53, VOUCHER:54 },
  REC_A57:{ TGT:55, MTD:56, EST:57, EST_PCT:58, V_AVAIL:59, VOUCHER:60 },
  REC_S26:{ TGT:61, MTD:62, EST:63, EST_PCT:64, V_AVAIL:65, VOUCHER:66 },
};

const HEADER_ROW = 4;
const DATA_START  = 5;

const n  = v => { if (v===undefined||v===null||v==='') return 0; if (typeof v==='string'&&v.trim().endsWith('%')) return parseFloat(v)/100; return +v||0; };
const tr = v => (typeof v==='string') ? v.trim() : (v??'');

function extractWeekLabel(val) {
  const m = String(val||'').match(/W(\d+)/i);
  return m ? 'W'+m[1] : '';
}

function findSkema3Sheet(wb) {
  const name = wb.SheetNames.find(s => s.trim().startsWith('Skema 3'));
  if (!name) throw new Error('Sheet "Skema 3" tidak ditemukan dalam file ini.');
  return wb.Sheets[name];
}

function sheetToRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:false });
}

function buildTypeObj(row, C) {
  return {
    baseline:        n(row[C.BASE]),
    target:          n(row[C.TGT]),
    mtd:             n(row[C.MTD]),
    est:             n(row[C.EST]),
    estPct:          n(row[C.EST_PCT]),
    syarat:          n(row[C.SYARAT]),
    voucherTersedia: n(row[C.V_AVAIL]),
    pakai:           n(row[C.V_PAKAI]),
    w25:             n(row[C.W25]),
    w26:             n(row[C.W26]),
    w27:             n(row[C.W27]),
    targetWeek:      n(row[C.TGT_WK]),
  };
}

function buildRecapTypeObj(row, C) {
  return {
    target:       n(row[C.TGT]),
    mtd:          n(row[C.MTD]),
    est:          n(row[C.EST]),
    estPct:       n(row[C.EST_PCT]),
    voucherTersedia: n(row[C.V_AVAIL]),
    voucher:      n(row[C.VOUCHER]),
  };
}

/* ─── Main parser ─── */
function parseExcel(arrayBuffer, filename) {
  const wb   = XLSX.read(arrayBuffer, { type:'array' });
  const ws   = findSkema3Sheet(wb);
  const rows = sheetToRows(ws);

  const headerRow = rows[HEADER_ROW] || [];

  /* Extract dynamic week labels from header */
  const weekLabels = {
    w1: extractWeekLabel(headerRow[COL.A37.W25]) || 'W-1',
    w2: extractWeekLabel(headerRow[COL.A37.W26]) || 'W-2',
    w3: extractWeekLabel(headerRow[COL.A37.W27]) || 'W-3',
  };

  /* Parse stores */
  const stores = [];
  for (let i = DATA_START; i < rows.length; i++) {
    const row      = rows[i];
    const siteCode = tr(row[COL.SITE_CODE]);
    if (!siteCode) break;

    const a37 = buildTypeObj(row, COL.A37);
    const a57 = buildTypeObj(row, COL.A57);
    const s26 = buildTypeObj(row, COL.S26);

    // Compute prior week (before w25) for each type
    a37.w0 = Math.max(a37.mtd - a37.w25 - a37.w26, 0);
    a57.w0 = Math.max(a57.mtd - a57.w25 - a57.w26, 0);
    s26.w0 = Math.max(s26.mtd - s26.w25 - s26.w26, 0);

    const vUsed     = a37.pakai + a57.pakai + s26.pakai;
    const vTersedia = a37.voucherTersedia + a57.voucherTersedia + s26.voucherTersedia;

    stores.push({
      siteCode,
      siteDesc:  tr(row[COL.SITE_DESC]),
      leader:    tr(row[COL.LEADER]),
      tsh:       tr(row[COL.TSH]),
      bu:        tr(row[COL.BU]),
      status:    tr(row[COL.STATUS]),
      territory: tr(row[COL.TERRITORY]),
      a37, a57, s26,
      kuotaAwal: n(row[COL.KUOTA]),
      trueNot:   tr(row[COL.TRUE_NOT]),
      // Computed totals
      mtdTotal:    a37.mtd + a57.mtd + s26.mtd,
      targetTotal: a37.target + a57.target + s26.target,
      w25Total:    a37.w25 + a57.w25 + s26.w25,
      w26Total:    a37.w26 + a57.w26 + s26.w26,
      w0Total:     a37.w0 + a57.w0 + s26.w0,
      vUsed,
      vTersedia,
      vSisa:       vTersedia - vUsed,
    });
  }

  if (stores.length === 0) throw new Error('Tidak ada data toko ditemukan. Periksa format file.');

  /* Parse recap block */
  const by_leader = [];
  const by_tsh    = [];
  let mode = null;

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i];
    const name = tr(row[COL.REC_NAME]);
    if (!name) continue;
    const nameUpper = name.toUpperCase();
    if (nameUpper === 'LOB')  { mode = 'leader'; continue; }
    if (nameUpper === 'TSH')  { mode = 'tsh';    continue; }
    if (nameUpper.includes('GRAND TOTAL') || nameUpper === 'TOTAL') continue;
    if (mode === 'leader') {
      by_leader.push({
        name,
        a37: buildRecapTypeObj(row, COL.REC_A37),
        a57: buildRecapTypeObj(row, COL.REC_A57),
        s26: buildRecapTypeObj(row, COL.REC_S26),
      });
    } else if (mode === 'tsh') {
      const isVacant = nameUpper.includes('VACANT');
      by_tsh.push({
        name, isVacant,
        a37: buildRecapTypeObj(row, COL.REC_A37),
        a57: buildRecapTypeObj(row, COL.REC_A57),
        s26: buildRecapTypeObj(row, COL.REC_S26),
      });
    }
  }

  /* Inject per-leader weekly breakdown from per-store data */
  const leaderMap = {};
  for (const s of stores) {
    if (!leaderMap[s.leader]) {
      leaderMap[s.leader] = { storeCount:0, a37:{w25:0,w26:0,w0:0}, a57:{w25:0,w26:0,w0:0}, s26:{w25:0,w26:0,w0:0} };
    }
    leaderMap[s.leader].storeCount++;
    for (const t of ['a37','a57','s26']) {
      leaderMap[s.leader][t].w25 += s[t].w25;
      leaderMap[s.leader][t].w26 += s[t].w26;
      leaderMap[s.leader][t].w0  += s[t].w0;
    }
  }
  for (const ldr of by_leader) {
    const wk = leaderMap[ldr.name] || { storeCount:0, a37:{w25:0,w26:0,w0:0}, a57:{w25:0,w26:0,w0:0}, s26:{w25:0,w26:0,w0:0} };
    ldr.storeCount = wk.storeCount;
    for (const t of ['a37','a57','s26']) {
      ldr[t].w25 = wk[t].w25;
      ldr[t].w26 = wk[t].w26;
      ldr[t].w0  = wk[t].w0;
    }
  }

  /* KPI summary from by_leader totals (more accurate than summing stores) */
  function sumLeaders(type) {
    return by_leader.reduce((acc, l) => {
      const t = l[type];
      acc.target          += t.target;
      acc.mtd             += t.mtd;
      acc.est             += t.est;
      acc.voucherTersedia += t.voucherTersedia;
      acc.voucherPakai    += t.voucher;
      acc.w25Total        += t.w25;
      acc.w26Total        += t.w26;
      acc.w0Total         += t.w0;
      return acc;
    }, { target:0, mtd:0, est:0, voucherTersedia:0, voucherPakai:0, w25Total:0, w26Total:0, w0Total:0 });
  }

  const a37s = sumLeaders('a37');
  const a57s = sumLeaders('a57');
  const s26s = sumLeaders('s26');

  // Fallback to store sum if leader sum gives 0 (no recap block)
  function sumStores(type) {
    return stores.reduce((acc, s) => {
      const t = s[type];
      acc.target += t.target; acc.mtd += t.mtd; acc.est += t.est;
      acc.voucherTersedia += t.voucherTersedia; acc.voucherPakai += t.pakai;
      acc.w25Total += t.w25; acc.w26Total += t.w26; acc.w0Total += t.w0;
      return acc;
    }, { target:0, mtd:0, est:0, voucherTersedia:0, voucherPakai:0, w25Total:0, w26Total:0, w0Total:0 });
  }

  const useLeaderSum = by_leader.length > 0 && a37s.mtd > 0;
  const fa37 = useLeaderSum ? a37s : sumStores('a37');
  const fa57 = useLeaderSum ? a57s : sumStores('a57');
  const fs26 = useLeaderSum ? s26s : sumStores('s26');

  function calcEstPct(s) { s.estPct = s.target > 0 ? s.est/s.target : 0; return s; }

  const onTarget = stores.filter(s =>
    s.a37.estPct >= 1 || s.a57.estPct >= 1 || s.s26.estPct >= 1
  ).length;

  /* Voucher weekly rollup */
  const voucher_weekly = {
    a37:{ w25:fa37.w25Total, w26:fa37.w26Total, w27:0 },
    a57:{ w25:fa57.w25Total, w26:fa57.w26Total, w27:0 },
    s26:{ w25:fs26.w25Total, w26:fs26.w26Total, w27:0 },
  };
  for (const s of stores) {
    voucher_weekly.a37.w27 += s.a37.w27;
    voucher_weekly.a57.w27 += s.a57.w27;
    voucher_weekly.s26.w27 += s.s26.w27;
  }

  const json = {
    meta: {
      filename, uploadedAt: new Date().toISOString(),
      periode: 'SBD Samsung 8–22 Juni 2026',
      totalStores: stores.length,
      weekLabels,
    },
    kpi_summary: {
      a37: calcEstPct(fa37),
      a57: calcEstPct(fa57),
      s26: calcEstPct(fs26),
      storesOnTarget: onTarget,
      storesUnderTarget: stores.length - onTarget,
    },
    by_leader,
    by_tsh,
    stores,
    voucher_weekly,
  };

  return json;
}

/* ─── Preview ─── */
function showPreview(json) {
  const el = document.getElementById('upload-preview');
  if (!el) return;
  const s = json.kpi_summary;
  const fmt = v => (v*100).toFixed(1)+'%';
  el.innerHTML = `
    <div class="preview-grid">
      <div class="preview-stat"><span class="label">Total Toko</span><span class="value">${json.meta.totalStores}</span></div>
      <div class="preview-stat"><span class="label">A37 Est%</span><span class="value ${pctClass(s.a37.estPct)}">${fmt(s.a37.estPct)}</span></div>
      <div class="preview-stat"><span class="label">A57 Est%</span><span class="value ${pctClass(s.a57.estPct)}">${fmt(s.a57.estPct)}</span></div>
      <div class="preview-stat"><span class="label">S26 Est%</span><span class="value ${pctClass(s.s26.estPct)}">${fmt(s.s26.estPct)}</span></div>
      <div class="preview-stat"><span class="label">On-Target</span><span class="value on-target">${s.storesOnTarget} toko</span></div>
      <div class="preview-stat"><span class="label">File</span><span class="value filename">${json.meta.filename}</span></div>
    </div>`;
  el.style.display='block';
}

function pctClass(v) {
  if (v>=1) return 'status-green'; if (v>=0.8) return 'status-amber'; return 'status-red';
}

/* ─── POST to Apps Script ─── */
async function postToServer(json, gasUrl, token) {
  const payload = JSON.stringify({ token, data: json });
  const res = await fetch(gasUrl, {
    method:'POST', headers:{'Content-Type':'text/plain'},
    body:payload, redirect:'follow',
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const result = await res.json();
  if (result.status !== 'ok') throw new Error(result.message || 'Upload gagal');
  return result;
}

/* ─── Upload flow ─── */
async function handleUpload(file, gasUrl, token, onSuccess) {
  const msg  = document.getElementById('upload-msg');
  const btn  = document.getElementById('btn-submit');
  function setMsg(text, cls) { msg.textContent=text; msg.className='upload-msg '+(cls||''); }

  setMsg('Membaca file…','parsing');
  if (btn) btn.disabled=true;
  window._pendingJson = null;

  try {
    const buf  = await file.arrayBuffer();
    const json = parseExcel(buf, file.name);
    window._pendingJson = json;
    showPreview(json);
    setMsg(`✓ Parsed ${json.meta.totalStores} toko. Dashboard diperbarui — klik "Submit ke Server" untuk simpan permanen.`,'success');
    if (btn) btn.disabled=false;
    if (typeof window.__onPreview==='function') window.__onPreview(json);
  } catch(err) {
    setMsg('✗ '+err.message,'error');
    console.error(err);
  }
}

async function submitToServer(gasUrl, token, onSuccess) {
  const json = window._pendingJson;
  const btn  = document.getElementById('btn-submit');
  const msg  = document.getElementById('upload-msg');
  if (!json) return;
  function setMsg(text, cls) { msg.textContent=text; msg.className='upload-msg '+(cls||''); }
  btn.disabled=true;
  setMsg('Mengirim ke server…','uploading');
  let lastErr;
  for (let attempt=1; attempt<=3; attempt++) {
    try {
      const result = await postToServer(json, gasUrl, token);
      setMsg(`✓ Tersimpan! Upload: ${new Date(result.uploadedAt).toLocaleString('id-ID')}`,'done');
      window._pendingJson=null;
      if (typeof onSuccess==='function') onSuccess(json);
      return;
    } catch(err) {
      lastErr=err;
      if (attempt<3) { setMsg(`Gagal, retry ${attempt}/3…`,'error'); await new Promise(r=>setTimeout(r,1500*attempt)); }
    }
  }
  setMsg('✗ Upload gagal: '+lastErr.message,'error');
  btn.disabled=false;
}

/* ─── Drag-and-drop wiring ─── */
function initUploadZone(gasUrl, token, onSuccess) {
  const zone  = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  if (!zone) return;
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('drag-over');}));
  ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag-over');}));
  zone.addEventListener('drop',e=>{const file=e.dataTransfer.files[0]; if(file)handleUpload(file,gasUrl,token,onSuccess);});
  zone.addEventListener('click',()=>input&&input.click());
  if (input) input.addEventListener('change',()=>{if(input.files[0])handleUpload(input.files[0],gasUrl,token,onSuccess);});
  const btn = document.getElementById('btn-submit');
  if (btn) btn.addEventListener('click',()=>submitToServer(gasUrl,token,onSuccess));
}
