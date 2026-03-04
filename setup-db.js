require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Target the Railway database URL directly
const dbUrl = process.env.DATABASE_URL || 'YOUR_RAILWAY_DATABASE_URL_HERE';

if (!dbUrl || dbUrl === 'YOUR_RAILWAY_DATABASE_URL_HERE') {
    console.error('❌ ERROR: Please set DATABASE_URL in your .env file or script first.');
    process.exit(1);
}

console.log('🔗 Connecting to database: ' + dbUrl.split('@')[1]); // Log domain safely

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false } // Required for some cloud databases
});

async function runSetup() {
    try {
        const sqlPath = path.join(__dirname, 'system_settings.sql');
        console.log(`📜 Reading SQL file from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('⚡ Executing SQL script...');
        await pool.query(sql);
        console.log('✅ ALL TABLES CREATED SUCCESSFULLY IN RAILWAY!');

        // Create default Admin account if it doesn't exist
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash('Admin123', 10);

        console.log('👤 Checking default admin user...');
        await pool.query(
            `INSERT INTO users (username, password_hash, role) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (username) DO NOTHING`,
            ['admin', hash, 'Admin']
        );
        console.log('✅ Default Admin account ready (admin / Admin123)');

    } catch (err) {
        console.error('❌ Setup failed:', err);
    } finally {
        await pool.end();
        console.log('👋 Connection closed.');
    }
}

runSetup();
