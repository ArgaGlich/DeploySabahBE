require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ==========================================
// 0. LOGGER SETUP (Winston)
// ==========================================
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
    ],
});

// Also log to console in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`)
        ),
    }));
}

// ==========================================
// 1. DATABASE CONNECTION (PostgreSQL)
// ==========================================
const dbConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'sipena_sabah',
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT) || 5432,
    };

const db = new Pool(dbConfig);

db.on('connect', () => logger.info('✅ Connected to PostgreSQL database'));
db.on('error', (err) => logger.error('❌ PostgreSQL Pool Error', { error: err.message }));

// ==========================================
// 2. EXPRESS APP SETUP
// ==========================================
const app = express();

// Dynamic CORS from .env
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',
            'https://deploy-sabah-fe.vercel.app',
            process.env.FRONTEND_URL
        ];
        // Allow requests with no origin (like mobile apps or curl requests)
        // or requests that match our allowed origins.
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Root Health Check Endpoint
app.get('/', (req, res) => {
    res.json({ status: 'online', message: 'SIPENA SABAH API is running' });
});

// ==========================================
// 3. GOOGLE SHEETS API INTEGRATION
// ==========================================
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

async function fetchSheetData(range) {
    try {
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: range,
        });
        logger.info(`✅ Fetched Google Sheets data for range: ${range}`);
        return response.data.values;
    } catch (error) {
        logger.error(`❌ Google Sheets fetch failed for range: ${range}`, {
            error: error.message,
            stack: error.stack,
        });
        throw new Error(`Failed to fetch Google Sheets data (range: ${range}). Check credentials and SPREADSHEET_ID.`);
    }
}

// ==========================================
// 4. SECURITY & RBAC MIDDLEWARE
// ==========================================

// JWT Authentication Middleware
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            logger.warn(`🔒 JWT verification failed: ${err.message}`, { ip: req.ip });
            return res.status(403).json({ status: 'error', message: 'Forbidden: Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

// RBAC: Admin Only Middleware
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        return next();
    }
    logger.warn(`🚫 Admin-only access attempt by user ${req.user?.id} (role: ${req.user?.role})`, { ip: req.ip });
    res.status(403).json({ status: 'error', message: 'Forbidden: Admin access only.' });
};

// Audit Log Middleware
const auditLogMiddleware = async (req, res, next) => {
    try {
        const { id, role } = req.user || { id: null, role: 'Anonymous' };
        await db.query(
            'INSERT INTO audit_logs (user_id, user_role, endpoint, method, ip_address) VALUES ($1, $2, $3, $4, $5)',
            [id, role, req.originalUrl, req.method, req.ip]
        );
    } catch (error) {
        logger.error('Audit Log failed (DB error):', { error: error.message });
    }
    next();
};

// Apply JWT + Audit Middleware to all /api routes
app.use('/api', authenticateJWT, auditLogMiddleware);

// ==========================================
// 5. CORE BUSINESS LOGIC (CVI Calculator)
// ==========================================

// District centers for zone map
const DISTRICT_CENTERS = {
    'Kota Kinabalu': { lat: 5.980, lng: 116.075 },
    'Sandakan': { lat: 5.840, lng: 118.118 },
    'Tawau': { lat: 4.250, lng: 117.890 },
    'Keningau': { lat: 5.340, lng: 116.160 },
    'Semporna': { lat: 4.480, lng: 118.610 },
};

// Helper: fetch and parse all children from single Anak tab
// Columns: id=0,nama=1,lat=2,lng=3,district=4,skor_kes=5,skor_pend=6,
//          teregistrasi=7,imunisasi=8,gizi_baik=9,stunting=10,
//          ikut_paud=11,transisi_sd=12,dropout=13,pekerja_anak=14,eksploitasi=15
async function fetchChildren() {
    let weightHealth = 0.5;
    let weightEducation = 0.5;

    try {
        const { rows } = await db.query(
            "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('WEIGHT_HEALTH', 'WEIGHT_EDUCATION')"
        );
        rows.forEach(row => {
            if (row.setting_key === 'WEIGHT_HEALTH') weightHealth = parseFloat(row.setting_value);
            if (row.setting_key === 'WEIGHT_EDUCATION') weightEducation = parseFloat(row.setting_value);
        });
    } catch (err) {
        logger.error('PostgreSQL weight query error:', { error: err.message });
        throw new Error('Failed to retrieve CVI weights from database.');
    }

    const rawRows = await fetchSheetData('Anak!A2:P');
    if (!rawRows || rawRows.length === 0) return [];

    return rawRows
        .filter(r => r[0])  // skip empty rows
        .map(r => {
            const skesehatan = parseFloat(r[5] || 0);
            const spendidikan = parseFloat(r[6] || 0);
            const cviScore = parseFloat(((skesehatan * weightHealth) + (spendidikan * weightEducation)).toFixed(2));
            const riskCategory = cviScore < 40 ? 'Red' : cviScore < 75 ? 'Yellow' : 'Green';

            return {
                id: r[0],
                name: r[1],
                latitude: parseFloat(r[2]),
                longitude: parseFloat(r[3]),
                district: r[4] || 'Unknown',
                skorKesehatan: skesehatan,
                skorPendidikan: spendidikan,
                cviScore,
                riskCategory,
                // Boolean indicators
                teregistrasi: (r[7] || '').toUpperCase() === 'TRUE',
                imunisasi: (r[8] || '').toUpperCase() === 'TRUE',
                gizi_baik: (r[9] || '').toUpperCase() === 'TRUE',
                stunting: (r[10] || '').toUpperCase() === 'TRUE',
                ikut_paud: (r[11] || '').toUpperCase() === 'TRUE',
                transisi_sd: (r[12] || '').toUpperCase() === 'TRUE',
                dropout: (r[13] || '').toUpperCase() === 'TRUE',
                pekerja_anak: (r[14] || '').toUpperCase() === 'TRUE',
                eksploitasi: (r[15] || '').toUpperCase() === 'TRUE',
            };
        });
}


// ==========================================
// 6. API ENDPOINTS
// ==========================================

// --- Stats / 5 Pillars Endpoint (computed from Anak tab + Stats tab for Pilar 5) ---
// GET /api/stats/pillars
app.get('/api/stats/pillars', async (req, res, next) => {
    try {
        const children = await fetchChildren();
        if (children.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan di tab Anak.' });
        }

        const total = children.length;
        const pct = (n) => parseFloat(((n / total) * 100).toFixed(1));
        const cnt = (key, val = true) => children.filter(c => c[key] === val).length;

        const pillars = {
            1: [
                { key: 'teregistrasi', value: pct(cnt('teregistrasi')), label: 'Teregistrasi', unit: '%', bar: true, danger: false },
                { key: 'stateless', value: pct(cnt('teregistrasi', false)), label: 'Status WNA/Stateless', unit: '%', bar: true, danger: true },
                { key: 'total_terdata', value: total, label: 'Total terdata', unit: 'anak', bar: false, danger: false },
            ],
            2: [
                { key: 'paud', value: pct(cnt('ikut_paud')), label: 'Partisipasi PAUD', unit: '%', bar: true, danger: false },
                { key: 'transisi_sd', value: pct(cnt('transisi_sd')), label: 'Transisi ke SD', unit: '%', bar: true, danger: false },
                { key: 'dropout', value: pct(cnt('dropout')), label: 'Drop-out', unit: '%', bar: true, danger: true },
            ],
            3: [
                { key: 'imunisasi', value: pct(cnt('imunisasi')), label: 'Imunisasi lengkap', unit: '%', bar: true, danger: false },
                { key: 'gizi_baik', value: pct(cnt('gizi_baik')), label: 'Gizi baik', unit: '%', bar: true, danger: false },
                { key: 'stunting', value: pct(cnt('stunting')), label: 'Stunting', unit: '%', bar: true, danger: true },
            ],
            4: [
                { key: 'pekerja_anak', value: pct(cnt('pekerja_anak')), label: 'Indikasi pekerja anak', unit: '%', bar: true, danger: true },
                { key: 'eksploitasi', value: cnt('eksploitasi'), label: 'Indikasi eksploitasi', unit: 'kasus', bar: false, danger: true },
            ],
            5: [
                { key: 'kasus_monitor', value: 0, label: 'Kasus dimonitor', unit: 'kasus', bar: false, danger: false },
                { key: 'tindak_lanjut', value: 0, label: 'Tindak lanjut selesai', unit: '%', bar: true, danger: false },
                { key: 'integrasi', value: 0, label: 'Integrasi data bilateral', unit: 'sistem', bar: false, danger: false },
            ],
        };

        // Merge Pilar 5 from Stats tab if available
        try {
            const statsRows = await fetchSheetData('Stats!A2:G');
            if (statsRows) {
                statsRows.filter(r => r[0] === '5').forEach(r => {
                    const found = pillars[5].find(i => i.key === r[1]);
                    if (found) found.value = parseFloat(r[2]) || 0;
                });
            }
        } catch (_) { /* Stats tab optional */ }

        logger.info(`📊 Pillar stats (per-child) served to ${req.user?.role} [${total} children]`);
        res.json({ status: 'success', pillars, meta: { total, computedFrom: 'child-data' } });

    } catch (error) {
        next(error);
    }
});

// GET /api/geojson/zones
app.get('/api/geojson/zones', async (req, res, next) => {
    try {
        const children = await fetchChildren();

        // Group by district
        const districtMap = {};
        children.forEach(child => {
            const d = child.district || 'Unknown';
            if (!districtMap[d]) districtMap[d] = [];
            districtMap[d].push(child);
        });

        const features = Object.entries(districtMap).map(([district, kids]) => {
            const red = kids.filter(k => k.riskCategory === 'Red').length;
            const yellow = kids.filter(k => k.riskCategory === 'Yellow').length;
            const green = kids.filter(k => k.riskCategory === 'Green').length;
            const avgCVI = parseFloat((kids.reduce((s, k) => s + k.cviScore, 0) / kids.length).toFixed(1));
            const dominantRisk = red > 0 ? 'Red' : yellow > 0 ? 'Yellow' : 'Green';
            const center = DISTRICT_CENTERS[district] || { lat: 5.5, lng: 117.0 };

            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
                properties: { district, total: kids.length, avgCVI, red, yellow, green, dominantRisk },
            };
        });

        res.json({ type: 'FeatureCollection', features });

    } catch (error) {
        next(error);
    }
});

app.get('/api/geojson/map', async (req, res, next) => {
    try {
        const isGuest = req.user?.role === 'Guest';
        const children = await fetchChildren();

        const features = children.map(child => {
            let displayName = child.name;
            if (isGuest) {
                const parts = (child.name || '').split(' ');
                displayName = parts.map(n => n.charAt(0) + '*'.repeat(Math.max(0, n.length - 1))).join(' ');
            }
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [child.longitude, child.latitude] },
                properties: {
                    id: child.id,
                    name: displayName,
                    district: child.district,
                    cviScore: child.cviScore,
                    riskCategory: child.riskCategory,
                },
            };
        });

        logger.info(`📡 GeoJSON map served to ${req.user?.role} [${features.length} features]`);
        res.json({ type: 'FeatureCollection', features });

    } catch (error) {
        next(error);
    }
});

// --- Legacy endpoint ---
app.get('/api/map-data', async (req, res, next) => {
    try {
        let children = await fetchChildren();
        if (req.user?.role === 'Guest') {
            children = children.map(c => ({ ...c, name: (c.name || '').split(' ').map(n => n[0] + '*'.repeat(Math.max(0, n.length - 1))).join(' ') }));
        }
        res.json({ status: 'success', data: children });
    } catch (error) { next(error); }
});

// --- Admin Only: Update CVI Weights ---
// PUT /api/settings
app.put('/api/settings', requireAdmin, async (req, res, next) => {
    const { weightHealth, weightEducation } = req.body;

    if (weightHealth === undefined || weightEducation === undefined) {
        return res.status(400).json({
            status: 'error',
            message: 'Both weightHealth and weightEducation are required.',
        });
    }

    const wH = parseFloat(weightHealth);
    const wE = parseFloat(weightEducation);

    if (isNaN(wH) || isNaN(wE) || wH < 0 || wE < 0 || Math.abs(wH + wE - 1) > 0.001) {
        return res.status(400).json({
            status: 'error',
            message: 'Weights must be numbers that sum to 1.0 (e.g., 0.6 + 0.4).',
        });
    }

    try {
        await db.query(
            "UPDATE system_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = 'WEIGHT_HEALTH'",
            [String(wH)]
        );
        await db.query(
            "UPDATE system_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = 'WEIGHT_EDUCATION'",
            [String(wE)]
        );

        logger.info(`⚙️ CVI Weights updated by Admin ${req.user?.id}: H=${wH}, E=${wE}`);
        res.json({ status: 'success', message: 'CVI weights updated successfully.', weightHealth: wH, weightEducation: wE });

    } catch (error) {
        next(error);
    }
});

// --- Keep old weights endpoint for backward compat ---
// PUT /api/weights (alias)
app.put('/api/weights', requireAdmin, async (req, res, next) => {
    req.url = '/api/settings';
    res.redirect(307, '/api/settings');
});

// ==========================================
// 7. AUTH ENDPOINT (Login / Token Issue)
// ==========================================
app.post('/auth/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username) {
            return res.status(400).json({ status: 'error', message: 'Username is required.' });
        }

        // TODO: Replace this with real DB user lookup and bcrypt password check
        // const user = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const payload = {
            id: Math.floor(Math.random() * 10000),
            username: username,
            role: username === 'admin' ? 'Admin' : 'Guest', // Placeholder logic
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '1d',
        });

        logger.info(`🔑 Token issued for user: ${username} (role: ${payload.role})`);
        res.json({ status: 'success', token, role: payload.role });

    } catch (error) {
        next(error);
    }
});

// ==========================================
// 8. GLOBAL ERROR HANDLER
// ==========================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    // Log with full stack in dev, minimal in prod
    logger.error(`❌ [${req.method}] ${req.originalUrl} → ${err.message}`, {
        statusCode,
        user: req.user?.id,
        stack: err.stack,
    });

    // Check for known types
    let userMessage = err.message || 'An unexpected error occurred.';
    if (err.message?.includes('Google Sheets')) {
        userMessage = 'Data sumber (Google Sheets) tidak dapat diakses. Silakan periksa konfigurasi kredensial.';
    } else if (err.message?.includes('database') || err.message?.includes('PostgreSQL') || err.code?.startsWith('2')) {
        userMessage = 'Terjadi kesalahan pada database. Silakan coba lagi.';
    }

    res.status(statusCode).json({
        status: 'error',
        message: userMessage,
        ...(isProduction ? {} : { detail: err.message, stack: err.stack }),
    });
});

// ==========================================
// 9. START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`🚀 SIPENA SABAH Backend running on http://localhost:${PORT}`);
    logger.info(`🌍 CORS allowed origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    logger.info(`🗂️  Environment: ${process.env.NODE_ENV || 'development'}`);
});