// Code.gs — ERA-SBD Apps Script Web App
// Deploy: Execute as Me | Who has access: Anyone
// Web App URL: copy dari Deploy > Manage Deployments

var TOKEN        = 'sbd-r5-2026';        // harus sama dengan CONFIG.TOKEN di app.js
var SHEET_MASTER = 'DATA_MASTER';
var SHEET_META   = 'META';
var MAX_CELL     = 49000;                 // chars per cell (Sheets limit ~50k)

/* ─── CORS helper ─── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(obj, code) {
  var body = JSON.stringify(obj);
  var resp = ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
  return resp;
}

/* ─── doGet — return latest snapshot ─── */
function doGet(e) {
  try {
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var master = ss.getSheetByName(SHEET_MASTER);

    if (!master || master.getLastRow() < 1) {
      return jsonResponse({ status: 'empty', data: null });
    }

    // Read all cells from col A, concatenate chunks
    var lastRow = master.getLastRow();
    var chunks  = master.getRange(1, 1, lastRow, 1).getValues().flat();
    var raw     = chunks.join('');

    if (!raw) return jsonResponse({ status: 'empty', data: null });

    var data = JSON.parse(raw);
    return jsonResponse({ status: 'ok', data: data });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

/* ─── doPost — receive JSON, validate token, store ─── */
function doPost(e) {
  try {
    var body    = JSON.parse(e.postData.contents);
    var token   = body.token;
    var payload = body.data;

    if (token !== TOKEN) {
      return jsonResponse({ status: 'error', message: 'Unauthorized' });
    }
    if (!payload || !payload.meta) {
      return jsonResponse({ status: 'error', message: 'Payload tidak valid' });
    }

    var ss     = SpreadsheetApp.getActiveSpreadsheet();

    // Ensure sheets exist
    var master = ss.getSheetByName(SHEET_MASTER) ||
                 ss.insertSheet(SHEET_MASTER);
    var meta   = ss.getSheetByName(SHEET_META)   ||
                 ss.insertSheet(SHEET_META);

    // Serialize and chunk if > MAX_CELL chars
    var json   = JSON.stringify(payload);
    var chunks = [];
    for (var i = 0; i < json.length; i += MAX_CELL) {
      chunks.push([json.slice(i, i + MAX_CELL)]);
    }

    // Clear and write DATA_MASTER
    master.clearContents();
    master.getRange(1, 1, chunks.length, 1).setValues(chunks);

    // Write META
    var now = new Date().toISOString();
    meta.clearContents();
    meta.getRange('A1').setValue('uploadedAt');
    meta.getRange('B1').setValue(now);
    meta.getRange('A2').setValue('filename');
    meta.getRange('B2').setValue(payload.meta.filename || '');
    meta.getRange('A3').setValue('periode');
    meta.getRange('B3').setValue(payload.meta.periode || '');
    meta.getRange('A4').setValue('totalStores');
    meta.getRange('B4').setValue(payload.meta.totalStores || 0);

    // Update uploadedAt inside the stored payload meta too
    payload.meta.uploadedAt = now;
    // Rewrite with updated uploadedAt
    var json2   = JSON.stringify(payload);
    var chunks2 = [];
    for (var j = 0; j < json2.length; j += MAX_CELL) {
      chunks2.push([json2.slice(j, j + MAX_CELL)]);
    }
    master.clearContents();
    master.getRange(1, 1, chunks2.length, 1).setValues(chunks2);

    return jsonResponse({ status: 'ok', uploadedAt: now });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

/* ─── doOptions — preflight CORS (not always needed for GAS but good practice) ─── */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}
