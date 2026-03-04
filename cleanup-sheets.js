/**
 * Hapus tab lama yang tidak diperlukan dari Google Sheets
 * Tab yang dihapus: Sheet1, Health, Education
 * Tab yang dipertahankan: Anak, Stats
 *
 * Usage: node cleanup-sheets.js
 */

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TABS_TO_DELETE = ['Sheet1', 'Health', 'Education'];

async function main() {
    console.log('🧹 SIPENA SABAH - Cleanup Google Sheets');
    console.log('========================================\n');

    if (!SPREADSHEET_ID) {
        console.error('❌ SPREADSHEET_ID tidak ditemukan di .env');
        process.exit(1);
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Get list of existing sheets with their IDs
    console.log('📋 Mengambil daftar tab...');
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const allSheets = spreadsheet.data.sheets;

    allSheets.forEach(s => {
        console.log(`   - ${s.properties.title} (ID: ${s.properties.sheetId})`);
    });

    // Find sheets to delete
    const toDelete = allSheets.filter(s => TABS_TO_DELETE.includes(s.properties.title));
    const remaining = allSheets.filter(s => !TABS_TO_DELETE.includes(s.properties.title));

    if (toDelete.length === 0) {
        console.log('\n✅ Tidak ada tab yang perlu dihapus (sudah bersih).');
        return;
    }

    // Safety check: make sure we're not deleting all sheets
    if (remaining.length === 0) {
        console.error('❌ Tidak bisa menghapus semua tab! Setidaknya harus ada 1 tab tersisa.');
        process.exit(1);
    }

    console.log(`\n🗑️  Akan menghapus: ${toDelete.map(s => s.properties.title).join(', ')}`);
    console.log(`✅ Dipertahankan: ${remaining.map(s => s.properties.title).join(', ')}`);

    const requests = toDelete.map(s => ({
        deleteSheet: { sheetId: s.properties.sheetId }
    }));

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests },
    });

    console.log('\n🎉 Tab lama berhasil dihapus!');
    console.log('   Tab yang tersisa: Anak, Stats\n');
}

main().catch(err => {
    console.error('\n❌ Gagal:', err.message);
    process.exit(1);
});
