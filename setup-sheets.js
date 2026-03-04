/**
 * SIPENA SABAH - Google Sheets Setup Script
 * Generates 100 children (20 per district) with realistic data.
 * Usage: node setup-sheets.js
 */

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ---- Name pools ----
const NAMA_LELAKI = ['Ahmad', 'Muhammad', 'Abdullah', 'Faris', 'Danial', 'Aiman', 'Hafiz', 'Izzul', 'Ameerul', 'Faizal', 'Azri', 'Syafiq', 'Haziq', 'Adib', 'Hakim', 'Zarif', 'Amirul', 'Nazri', 'Zikry', 'Irfan'];
const NAMA_PEREMPUAN = ['Aisyah', 'Nur', 'Siti', 'Nurul', 'Norashikin', 'Rafiqah', 'Hafeeza', 'Faridah', 'Hafizah', 'Izzati', 'Nadia', 'Amira', 'Huda', 'Syafiqah', 'Liyana', 'Farhana', 'Aina', 'Balqis', 'Qistina', 'Najwa'];
const FAMILY = ['Rosli', 'Hassan', 'Ismail', 'Omar', 'Daud', 'Aziz', 'Karim', 'Yusof', 'Jaafar', 'Salleh', 'Hamid', 'Rahman', 'Nordin', 'Mahmud', 'Sulaiman', 'Ibrahim', 'Osman', 'Kassim', 'Wahab', 'Latif', 'Bakar', 'Ghani', 'Tahir', 'Jalil', 'Zainal'];

// ---- District definitions ----
// Each district has: lat/lng range, and "vulnerability level" (affects skor & boolean probabilities)
const DISTRICTS = [
    // Kota Kinabalu: urban, low vulnerability
    {
        name: 'Kota Kinabalu', latR: [5.950, 6.020], lngR: [116.055, 116.195],
        skorKes: [55, 95], skorPend: [55, 92],
        prob: { teregistrasi: 0.92, imunisasi: 0.85, gizi_baik: 0.80, stunting: 0.10, ikut_paud: 0.75, transisi_sd: 0.90, dropout: 0.08, pekerja_anak: 0.05, eksploitasi: 0.03 }
    },
    // Sandakan: semi-urban, moderate vulnerability
    {
        name: 'Sandakan', latR: [5.820, 5.875], lngR: [118.070, 118.150],
        skorKes: [40, 82], skorPend: [35, 78],
        prob: { teregistrasi: 0.78, imunisasi: 0.70, gizi_baik: 0.65, stunting: 0.22, ikut_paud: 0.55, transisi_sd: 0.80, dropout: 0.15, pekerja_anak: 0.12, eksploitasi: 0.06 }
    },
    // Tawau: semi-urban, moderate vulnerability
    {
        name: 'Tawau', latR: [4.200, 4.350], lngR: [117.850, 117.950],
        skorKes: [45, 88], skorPend: [40, 85],
        prob: { teregistrasi: 0.82, imunisasi: 0.75, gizi_baik: 0.70, stunting: 0.18, ikut_paud: 0.60, transisi_sd: 0.82, dropout: 0.12, pekerja_anak: 0.10, eksploitasi: 0.04 }
    },
    // Keningau: interior, higher vulnerability
    {
        name: 'Keningau', latR: [5.300, 5.440], lngR: [116.155, 116.295],
        skorKes: [30, 75], skorPend: [28, 70],
        prob: { teregistrasi: 0.65, imunisasi: 0.55, gizi_baik: 0.55, stunting: 0.30, ikut_paud: 0.40, transisi_sd: 0.70, dropout: 0.22, pekerja_anak: 0.18, eksploitasi: 0.08 }
    },
    // Semporna: coastal/remote, highest vulnerability
    {
        name: 'Semporna', latR: [4.460, 4.520], lngR: [118.580, 118.648],
        skorKes: [15, 58], skorPend: [12, 55],
        prob: { teregistrasi: 0.40, imunisasi: 0.35, gizi_baik: 0.40, stunting: 0.45, ikut_paud: 0.25, transisi_sd: 0.55, dropout: 0.35, pekerja_anak: 0.30, eksploitasi: 0.15 }
    },
];

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function prob(p) { return Math.random() < p ? 'TRUE' : 'FALSE'; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function toFixed4(n) { return n.toFixed(4); }

function generateName(idx) {
    const isFemale = idx % 2 === 1;
    if (isFemale) {
        return `${pick(NAMA_PEREMPUAN)} Binti ${pick(FAMILY)}`;
    } else {
        return `${pick(NAMA_LELAKI)} Bin ${pick(FAMILY)}`;
    }
}

function generateAnakData() {
    const rows = [
        ['id', 'nama', 'lat', 'lng', 'district',
            'skor_kesehatan', 'skor_pendidikan',
            'teregistrasi', 'imunisasi', 'gizi_baik', 'stunting',
            'ikut_paud', 'transisi_sd', 'dropout',
            'pekerja_anak', 'eksploitasi'],
    ];

    let seq = 1;
    DISTRICTS.forEach(dist => {
        for (let i = 0; i < 20; i++) {
            const id = `child_${String(seq).padStart(3, '0')}`;
            const nama = generateName(i);
            const lat = toFixed4(rand(dist.latR[0], dist.latR[1]));
            const lng = toFixed4(rand(dist.lngR[0], dist.lngR[1]));
            const sK = randInt(dist.skorKes[0], dist.skorKes[1]);
            const sP = randInt(dist.skorPend[0], dist.skorPend[1]);
            const p = dist.prob;
            rows.push([
                id, nama, lat, lng, dist.name,
                String(sK), String(sP),
                prob(p.teregistrasi), prob(p.imunisasi), prob(p.gizi_baik), prob(p.stunting),
                prob(p.ikut_paud), prob(p.transisi_sd), prob(p.dropout),
                prob(p.pekerja_anak), prob(p.eksploitasi),
            ]);
            seq++;
        }
    });
    return rows;
}

// Pilar 5 (hanya data organisasi / governance)
const STATS_DATA = [
    ['pilar', 'key', 'nilai', 'label', 'satuan', 'tipe', 'bahaya'],
    ['5', 'kasus_monitor', '28', 'Kasus dimonitor', 'kasus', 'angka', 'false'],
    ['5', 'tindak_lanjut', '75', 'Tindak lanjut selesai', '%', 'bar', 'false'],
    ['5', 'integrasi', '3', 'Integrasi data bilateral', 'sistem', 'angka', 'false'],
];

async function main() {
    console.log('🚀 SIPENA SABAH - Google Sheets Setup (100 anak)');
    console.log('==================================================\n');

    if (!SPREADSHEET_ID) { console.error('❌ SPREADSHEET_ID tidak ada'); process.exit(1); }

    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // Ensure Anak & Stats tabs exist
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existing = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('📋 Tab yang ada:', existing.join(', '));

    const toCreate = ['Anak', 'Stats'].filter(t => !existing.includes(t));
    if (toCreate.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) },
        });
        console.log('   ➕ Tab dibuat:', toCreate.join(', '));
    }

    const ANAK_DATA = generateAnakData();
    console.log(`\n📝 Menulis ${ANAK_DATA.length - 1} anak ke tab Anak...`);
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Anak!A1:P',
        valueInputOption: 'RAW',
        requestBody: { values: ANAK_DATA },
    });
    console.log(`   ✅ ${ANAK_DATA.length - 1} anak berhasil ditulis`);

    console.log('\n📝 Menulis data ke tab Stats (Pilar 5)...');
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Stats!A1:G',
        valueInputOption: 'RAW',
        requestBody: { values: STATS_DATA },
    });
    console.log(`   ✅ ${STATS_DATA.length - 1} indikator Pilar 5 berhasil ditulis`);

    console.log('\n🎉 Setup selesai! 100 anak tersebar di 5 distrik Sabah.\n');

    // Print summary
    const byDist = {};
    ANAK_DATA.slice(1).forEach(r => { byDist[r[4]] = (byDist[r[4]] || 0) + 1; });
    Object.entries(byDist).forEach(([d, n]) => console.log(`   ${d}: ${n} anak`));
}

main().catch(err => { console.error('\n❌ Gagal:', err.message); process.exit(1); });
