// upload-handler.js — SheetJS parser for 3-sheet Samsung SBD Excel format

/* ─── Column indices (0-based) — same for all 3 product sheets ─── */
const C = {
  SITE_CODE: 0, SITE_DESC: 1, LEADER: 2, TSH: 3, BU: 4, STATUS: 5, TERRITORY: 6,
  TARGET: 8, TARGET_WK: 9,
  EST: 10,      // MTD full = Estimasi Sell Out
  MTD: 15,
  W24: 16, W25: 17, W26: 18, W27: 19,
  PCT_MTD: 26,  // %MTD tracking indicator
  V_TERSEDIA: 29, V_SISA: 30,
  V_W24: 31, V_W25: 32, V_W26: 33, V_W27: 34,
};

const SHEETS = {
  a37: 'SBD - A37 (3)',
  a57: 'SBD - A57 (3)',
  s26: 'SBD - S26 (3)',
};

const n  = v => { if (v === undefined || v === null || v === '') return 0; return +v || 0; };
const tr = v => (typeof v === 'string') ? v.trim() : (v != null ? String(v) : '');

function sheetToRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" tidak ditemukan dalam file ini.`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
}

function parseProductSheet(wb, sheetName) {
  const rows = sheetToRows(wb, sheetName);
  // Row 0 = header, Row 1+ = data
  const stores = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const siteCode = tr(row[C.SITE_CODE]);
    if (!siteCode) continue;

    const target    = n(row[C.TARGET]);
    const est       = n(row[C.EST]);
    const mtd       = n(row[C.MTD]);
    const vTersedia = n(row[C.V_TERSEDIA]);
    const vSisa     = n(row[C.V_SISA]);

    stores[siteCode] = {
      siteCode,
      siteDesc:   tr(row[C.SITE_DESC]),
      leader:     tr(row[C.LEADER]),
      tsh:        tr(row[C.TSH]),
      bu:         tr(row[C.BU]),
      status:     tr(row[C.STATUS]),
      territory:  tr(row[C.TERRITORY]),
      target,
      targetWeek: n(row[C.TARGET_WK]),
      est,
      estPct:     target > 0 ? est / target : 0,
      mtd,
      w24:        n(row[C.W24]),
      w25:        n(row[C.W25]),
      w26:        n(row[C.W26]),
      w27:        n(row[C.W27]),
      pctMtd:     n(row[C.PCT_MTD]),
      voucherTersedia: vTersedia,
      voucherSisa:     vSisa,
      voucherPakai:    vTersedia - vSisa,
      vW24: n(row[C.V_W24]),
      vW25: n(row[C.V_W25]),
      vW26: n(row[C.V_W26]),
      vW27: n(row[C.V_W27]),
    };
  }
  return stores;
}

/* ─── Main parser ─── */
function parseExcel(arrayBuffer, filename) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // Parse each product sheet
  const byCode = {
    a37: parseProductSheet(wb, SHEETS.a37),
    a57: parseProductSheet(wb, SHEETS.a57),
    s26: parseProductSheet(wb, SHEETS.s26),
  };

  // Collect all site codes (union of 3 sheets)
  const allCodes = new Set([
    ...Object.keys(byCode.a37),
    ...Object.keys(byCode.a57),
    ...Object.keys(byCode.s26),
  ]);

  if (allCodes.size === 0) throw new Error('Tidak ada data toko ditemukan. Periksa format file.');

  // Build per-store array using A37 sheet for store metadata
  const stores = [];
  for (const code of allCodes) {
    const a37 = byCode.a37[code] || {};
    const a57 = byCode.a57[code] || {};
    const s26 = byCode.s26[code] || {};

    // Use whichever sheet has the site metadata
    const meta = byCode.a37[code] || byCode.a57[code] || byCode.s26[code];

    const vUsed     = (a37.voucherPakai || 0) + (a57.voucherPakai || 0) + (s26.voucherPakai || 0);
    const vTersedia = (a37.voucherTersedia || 0) + (a57.voucherTersedia || 0) + (s26.voucherTersedia || 0);

    // w0 = sales before W24 (for WoW trend)
    const a37w0 = Math.max((a37.mtd || 0) - (a37.w24 || 0) - (a37.w25 || 0) - (a37.w26 || 0), 0);
    const a57w0 = Math.max((a57.mtd || 0) - (a57.w24 || 0) - (a57.w25 || 0) - (a57.w26 || 0), 0);
    const s26w0 = Math.max((s26.mtd || 0) - (s26.w24 || 0) - (s26.w25 || 0) - (s26.w26 || 0), 0);

    stores.push({
      siteCode: code,
      siteDesc:  meta.siteDesc || '',
      leader:    meta.leader || '',
      tsh:       meta.tsh || '',
      bu:        meta.bu || '',
      status:    meta.status || '',
      territory: meta.territory || '',
      a37: { ...a37, w0: a37w0 },
      a57: { ...a57, w0: a57w0 },
      s26: { ...s26, w0: s26w0 },
      mtdTotal:    (a37.mtd || 0) + (a57.mtd || 0) + (s26.mtd || 0),
      targetTotal: (a37.target || 0) + (a57.target || 0) + (s26.target || 0),
      w25Total:    (a37.w25 || 0) + (a57.w25 || 0) + (s26.w25 || 0),
      w26Total:    (a37.w26 || 0) + (a57.w26 || 0) + (s26.w26 || 0),
      w0Total:     a37w0 + a57w0 + s26w0,
      vUsed,
      vTersedia,
      vSisa: vTersedia - vUsed,
    });
  }

  /* ─── Aggregate by leader (col2 = LOB/manager) ─── */
  const leaderMapClean = {};
  for (const s of stores) {
    const key = s.leader || '(Kosong)';
    if (!leaderMapClean[key]) {
      leaderMapClean[key] = { name: key, storeCount: 0, a37: zeroType(), a57: zeroType(), s26: zeroType() };
    }
    const ldr = leaderMapClean[key];
    ldr.storeCount++;
    accumType(ldr.a37, s.a37);
    accumType(ldr.a57, s.a57);
    accumType(ldr.s26, s.s26);
  }
  // Compute estPct for each leader type
  for (const ldr of Object.values(leaderMapClean)) {
    for (const t of ['a37','a57','s26']) {
      ldr[t].estPct   = ldr[t].target > 0 ? ldr[t].est / ldr[t].target : 0;
      ldr[t].voucher  = ldr[t].voucherPakai; // alias used by app.js sumLeaders
    }
  }

  const by_leader = Object.values(leaderMapClean);

  /* ─── Aggregate by TSH ─── */
  const tshMapClean = {};
  for (const s of stores) {
    const key = s.tsh || '(Kosong)';
    if (!tshMapClean[key]) {
      tshMapClean[key] = { name: key, isVacant: key.toUpperCase().includes('VACANT'), storeCount: 0, a37: zeroType(), a57: zeroType(), s26: zeroType() };
    }
    const t = tshMapClean[key];
    t.storeCount++;
    accumType(t.a37, s.a37);
    accumType(t.a57, s.a57);
    accumType(t.s26, s.s26);
  }
  for (const t of Object.values(tshMapClean)) {
    for (const type of ['a37','a57','s26']) {
      t[type].estPct  = t[type].target > 0 ? t[type].est / t[type].target : 0;
      t[type].voucher = t[type].voucherPakai;
    }
  }
  const by_tsh = Object.values(tshMapClean);

  /* ─── KPI summary from store-level aggregation ─── */
  function sumStoresType(type) {
    return stores.reduce((acc, s) => {
      const t = s[type] || {};
      acc.target          += t.target || 0;
      acc.mtd             += t.mtd || 0;
      acc.est             += t.est || 0;
      acc.voucherTersedia += t.voucherTersedia || 0;
      acc.voucherPakai    += t.voucherPakai || 0;
      acc.w24Total        += t.w24 || 0;
      acc.w25Total        += t.w25 || 0;
      acc.w26Total        += t.w26 || 0;
      acc.w0Total         += t.w0 || 0;
      return acc;
    }, { target:0, mtd:0, est:0, voucherTersedia:0, voucherPakai:0, w24Total:0, w25Total:0, w26Total:0, w0Total:0 });
  }

  const fa37 = sumStoresType('a37');
  const fa57 = sumStoresType('a57');
  const fs26 = sumStoresType('s26');

  fa37.estPct = fa37.target > 0 ? fa37.est / fa37.target : 0;
  fa57.estPct = fa57.target > 0 ? fa57.est / fa57.target : 0;
  fs26.estPct = fs26.target > 0 ? fs26.est / fs26.target : 0;

  const onTarget = stores.filter(s =>
    (s.a37.estPct || 0) >= 1 || (s.a57.estPct || 0) >= 1 || (s.s26.estPct || 0) >= 1
  ).length;

  /* ─── Voucher weekly rollup ─── */
  const voucher_weekly = { a37:{w24:0,w25:0,w26:0,w27:0}, a57:{w24:0,w25:0,w26:0,w27:0}, s26:{w24:0,w25:0,w26:0,w27:0} };
  for (const s of stores) {
    for (const type of ['a37','a57','s26']) {
      const t = s[type] || {};
      voucher_weekly[type].w24 += t.vW24 || 0;
      voucher_weekly[type].w25 += t.vW25 || 0;
      voucher_weekly[type].w26 += t.vW26 || 0;
      voucher_weekly[type].w27 += t.vW27 || 0;
    }
  }

  /* ─── Extract period from filename ─── */
  const dateMatch = filename.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Sep|Okt|Nov|Des)['\s]*(\d{4})/i);
  const periode   = dateMatch ? `SBD Samsung ${dateMatch[0]}` : 'SBD Samsung 2026';

  const json = {
    meta: {
      filename,
      uploadedAt:  new Date().toISOString(),
      periode,
      totalStores: stores.length,
      weekLabels:  { w1: 'W24', w2: 'W25', w3: 'W26' },
    },
    kpi_summary: {
      a37: fa37,
      a57: fa57,
      s26: fs26,
      storesOnTarget:    onTarget,
      storesUnderTarget: stores.length - onTarget,
    },
    by_leader,
    by_tsh,
    stores,
    voucher_weekly,
  };

  return json;
}

/* ─── Helpers for aggregation ─── */
function zeroType() {
  return { target:0, mtd:0, est:0, estPct:0, voucherTersedia:0, voucherPakai:0, voucher:0, w24:0, w25:0, w26:0, w27:0, w0:0 };
}

function accumType(acc, t) {
  if (!t) return;
  acc.target          += t.target || 0;
  acc.mtd             += t.mtd || 0;
  acc.est             += t.est || 0;
  acc.voucherTersedia += t.voucherTersedia || 0;
  acc.voucherPakai    += t.voucherPakai || 0;
  acc.w24             += t.w24 || 0;
  acc.w25             += t.w25 || 0;
  acc.w26             += t.w26 || 0;
  acc.w27             += t.w27 || 0;
  acc.w0              += t.w0 || 0;
}


/* ─── Preview ─── */
function showPreview(json) {
  const el = document.getElementById('upload-preview');
  if (!el) return;
  const s = json.kpi_summary;
  const fmt = v => (v * 100).toFixed(1) + '%';
  el.innerHTML = `
    <div class="preview-grid">
      <div class="preview-stat"><span class="label">Total Toko</span><span class="value">${json.meta.totalStores}</span></div>
      <div class="preview-stat"><span class="label">A37 Est%</span><span class="value ${pctClass(s.a37.estPct)}">${fmt(s.a37.estPct)}</span></div>
      <div class="preview-stat"><span class="label">A57 Est%</span><span class="value ${pctClass(s.a57.estPct)}">${fmt(s.a57.estPct)}</span></div>
      <div class="preview-stat"><span class="label">S26 Est%</span><span class="value ${pctClass(s.s26.estPct)}">${fmt(s.s26.estPct)}</span></div>
      <div class="preview-stat"><span class="label">On-Target</span><span class="value on-target">${s.storesOnTarget} toko</span></div>
      <div class="preview-stat"><span class="label">File</span><span class="value filename">${json.meta.filename}</span></div>
    </div>`;
  el.style.display = 'block';
}

function pctClass(v) {
  if (v >= 1) return 'status-green';
  if (v >= 0.8) return 'status-amber';
  return 'status-red';
}

/* ─── POST to Apps Script ─── */
async function postToServer(json, gasUrl, token) {
  const payload = JSON.stringify({ token, data: json });
  const res = await fetch(gasUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: payload, redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const result = await res.json();
  if (result.status !== 'ok') throw new Error(result.message || 'Upload gagal');
  return result;
}

/* ─── Upload flow ─── */
async function handleUpload(file, gasUrl, token, onSuccess) {
  const msg = document.getElementById('upload-msg');
  const btn = document.getElementById('btn-submit');
  function setMsg(text, cls) { msg.textContent = text; msg.className = 'upload-msg ' + (cls || ''); }

  setMsg('Membaca file…', 'parsing');
  if (btn) btn.disabled = true;
  window._pendingJson = null;

  try {
    const buf  = await file.arrayBuffer();
    const json = parseExcel(buf, file.name);
    window._pendingJson = json;
    showPreview(json);
    setMsg(`✓ Parsed ${json.meta.totalStores} toko. Dashboard diperbarui — klik "Submit ke Server" untuk simpan permanen.`, 'success');
    if (btn) btn.disabled = false;
    if (typeof window.__onPreview === 'function') window.__onPreview(json);
  } catch (err) {
    setMsg('✗ ' + err.message, 'error');
    console.error(err);
  }
}

async function submitToServer(gasUrl, token, onSuccess) {
  const json = window._pendingJson;
  const btn  = document.getElementById('btn-submit');
  const msg  = document.getElementById('upload-msg');
  if (!json) return;
  function setMsg(text, cls) { msg.textContent = text; msg.className = 'upload-msg ' + (cls || ''); }
  btn.disabled = true;
  setMsg('Mengirim ke server…', 'uploading');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await postToServer(json, gasUrl, token);
      setMsg(`✓ Tersimpan! Upload: ${new Date(result.uploadedAt).toLocaleString('id-ID')}`, 'done');
      window._pendingJson = null;
      if (typeof onSuccess === 'function') onSuccess(json);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) { setMsg(`Gagal, retry ${attempt}/3…`, 'error'); await new Promise(r => setTimeout(r, 1500 * attempt)); }
    }
  }
  setMsg('✗ Upload gagal: ' + lastErr.message, 'error');
  btn.disabled = false;
}

/* ─── Drag-and-drop wiring ─── */
function initUploadZone(gasUrl, token, onSuccess) {
  const zone  = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', e => { const file = e.dataTransfer.files[0]; if (file) handleUpload(file, gasUrl, token, onSuccess); });
  zone.addEventListener('click', () => input && input.click());
  if (input) input.addEventListener('change', () => { if (input.files[0]) handleUpload(input.files[0], gasUrl, token, onSuccess); });
  const btn = document.getElementById('btn-submit');
  if (btn) btn.addEventListener('click', () => submitToServer(gasUrl, token, onSuccess));
}
