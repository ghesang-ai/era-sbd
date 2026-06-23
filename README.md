# ERA-SBD — Samsung Super Brand Day Dashboard

**Erajaya Digital Region 5 · Kampanye 8–16 Juni 2026**

Dipantau oleh: Ghesang (Regional Marketing Ops R5)  
Dipresentasikan ke: Pak Ferly (VMD Manager) & Pak Andre (HOR R5)

---

## Struktur File

```
era-sbd/
├── index.html          # Shell + semua section markup
├── style.css           # Samsung Futuristic design system
├── app.js              # Orchestrator: fetch, render, chart, filter, modal
├── upload-handler.js   # SheetJS parser + POST ke Apps Script
├── Code.gs             # Google Apps Script: doGet + doPost
└── README.md
```

---

## Deploy — Google Apps Script (Backend)

### 1. Buat Spreadsheet Google baru

Buka [sheets.new](https://sheets.new), beri nama misalnya `ERA-SBD Backend`.

### 2. Buka Apps Script

Di spreadsheet: **Extensions → Apps Script**.

### 3. Paste Code.gs

Hapus isi default `Code.gs`, paste seluruh isi file `Code.gs` dari repo ini.

### 4. Deploy sebagai Web App

1. Klik **Deploy → New deployment**
2. Pilih type: **Web app**
3. Isi:
   - Description: `ERA-SBD v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy** → salin URL yang muncul (format: `https://script.google.com/macros/s/XXXX/exec`)

> ⚠️ Setiap kali kamu edit Code.gs, kamu harus **Deploy → New deployment** atau **Manage deployments → Edit** untuk versi baru aktif.

### 5. Paste URL ke app.js

Buka `app.js`, baris paling atas ganti:

```js
const CONFIG = {
  GAS_URL:  'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  TOKEN:    'sbd-r5-2026',
  USE_MOCK: false,   // ← ganti ke false setelah URL diisi
  ...
};
```

> Token `sbd-r5-2026` sudah hardcode di `Code.gs`. Kalau ingin ganti token, update di kedua file.

---

## Deploy — Netlify (Frontend)

### Cara 1: Drag & Drop (paling cepat)

1. Buka [netlify.com](https://app.netlify.com) → login
2. Klik **"Add new site" → Deploy manually**
3. Drag folder `era-sbd/` ke zona upload
4. Netlify akan memberi URL otomatis, bisa custom ke `era-sbd.netlify.app`

### Cara 2: Via GitHub

1. Push folder ini ke repo GitHub (private disarankan karena ada TOKEN)
2. Di Netlify: **"Add new site" → Import from Git**
3. Pilih repo → Build settings:
   - Build command: *(kosongkan)*
   - Publish directory: `.` (titik, atau folder root)
4. Deploy

---

## Workflow Harian

1. Buka dashboard di browser
2. Klik **"Upload Data"** (tombol kanan atas)
3. Drag & drop file `.xlsx` terbaru (sheet "Skema 3")
4. Dashboard otomatis parse → tampilkan preview ringkas
5. Klik **"Submit ke Server"**
6. Dashboard refresh otomatis dengan data terbaru

---

## Catatan Teknis

| Aspek | Detail |
|-------|--------|
| Parsing | Terjadi 100% di browser via SheetJS — tidak ada file yang dikirim ke server |
| Storage | JSON snapshot di Google Sheets (1 cell atau multi-row jika > 49k char) |
| Mode | TIMPA — setiap upload menggantikan snapshot sebelumnya |
| Mock mode | `USE_MOCK: true` di `app.js` untuk preview tanpa backend |
| Retry | Upload gagal → auto-retry 3x dengan backoff |
| Countdown | Countdown ke 16 Jun 2026 23:59 WIB |

---

## Troubleshooting

**Upload sukses tapi dashboard tidak update**  
→ Pastikan `USE_MOCK: false` dan GAS_URL sudah diisi.

**Error "Sheet Skema 3 tidak ditemukan"**  
→ Cek nama sheet di Excel — harus diawali `Skema 3` (bisa ada trailing space).

**POST ke Apps Script gagal / CORS error**  
→ Pastikan deploy as "Anyone" (bukan "Anyone with Google account").  
→ Re-deploy Apps Script (buat deployment baru, bukan edit yang sama).

**Apps Script: "You do not have permission"**  
→ Jalankan fungsi `doGet` atau `doPost` sekali dari editor Apps Script untuk trigger OAuth consent.
