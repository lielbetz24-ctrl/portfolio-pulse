const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// 1. Initial configuration
const DATABASE_URL = process.env.DATABASE_URL;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const SERVER_KEY = process.env.FIREBASE_SERVER_KEY || 'AAAAy3RvxG0:APA91bFXH2-f5h9_94J1-vE_6z5gYEgFPmG-TOs9am-2sY_YsGI29dj_qXMsuq4QYLuu3ODIgRFt_tTVTM9hUeiuYM'; // Fallback or mock key if needed

console.log('=== PortfolioPulse Push Notification Test Script ===');

async function getSubscriptions() {
    // If PostgreSQL URL is present, try to query Postgres
    if (DATABASE_URL) {
        console.log('[DB] Connecting to PostgreSQL database...');
        const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
        try {
            const res = await pool.query('SELECT * FROM subscriptions');
            console.log(`[DB] Found ${res.rows.length} subscriptions in PostgreSQL.`);
            await pool.end();
            return res.rows;
        } catch (e) {
            console.warn('[DB] Failed to query PostgreSQL subscriptions:', e.message);
            await pool.end();
        }
    }

    // Fallback to offline json database
    if (fs.existsSync(DB_FILE)) {
        console.log('[DB] Reading C:/Users/דודה שלך בגבס/portfolio-app/data/db.json database...');
        try {
            const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            const subs = db.subscriptions || [];
            console.log(`[DB] Found ${subs.length} subscriptions in db.json.`);
            return subs;
        } catch (e) {
            console.error('[DB] Failed to read db.json:', e.message);
        }
    }

    return [];
}

function sendFcmLegacyNotification(serverKey, token, title, body, icon, url) {
    const payload = {
        to: token,
        notification: {
            title: title,
            body: body,
            icon: icon || '/icon.png',
            click_action: '/'
        },
        data: {
            title: title,
            body: body,
            icon: icon || '/icon.png',
            url: url || '/'
        }
    };

    const payloadString = JSON.stringify(payload);
    console.log(`[FCM Legacy] Dispatching to token: ${token.substring(0, 15)}...`);
    console.log('[FCM Legacy] Payload data section:', payload.data);

    const options = {
        method: 'POST',
        hostname: 'fcm.googleapis.com',
        path: '/fcm/send',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${serverKey}`
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                console.log(`[FCM Legacy] Response status: ${res.statusCode}`);
                console.log(`[FCM Legacy] Response body: ${resBody}`);
                resolve({ success: res.statusCode >= 200 && res.statusCode < 300 });
            });
        });

        req.on('error', (err) => {
            console.error('[FCM Legacy] Error:', err.message);
            resolve({ success: false });
        });

        req.write(payloadString);
        req.end();
    });
}

async function main() {
    const customToken = process.argv[2];
    let subscriptions = [];

    if (customToken) {
        console.log(`[FCM] Using token provided in command line arguments.`);
        subscriptions = [{ fcm_token: customToken, endpoint: customToken }];
    } else {
        subscriptions = await getSubscriptions();
    }

    if (subscriptions.length === 0) {
        console.log('[FCM] No subscriptions found to send push notifications to.');
        console.log('Usage: node test_push.js [optional_specific_fcm_token]');
        return;
    }

    // Deduplicate subscriptions by token/endpoint
    const seen = new Set();
    const unique = [];
    for (const s of subscriptions) {
        const t = s.fcm_token || s.endpoint;
        if (t && !seen.has(t) && !t.startsWith('mock-')) {
            seen.add(t);
            unique.push(t);
        }
    }

    console.log(`[FCM] Prepared to dispatch to ${unique.length} unique tokens.`);

    const actualKey = process.env.FIREBASE_SERVER_KEY || SERVER_KEY;
    if (!actualKey) {
        console.error('[FCM] Error: FIREBASE_SERVER_KEY is not defined in environment variables.');
        return;
    }

    for (const token of unique) {
        await sendFcmLegacyNotification(
            actualKey,
            token,
            'בדיקת Deep Linking',
            'לחץ כאן כדי לבדוק את הקישור הממוקד',
            '/icon.png',
            '/tips/test_123'
        );
    }
}

main().catch(console.error);
