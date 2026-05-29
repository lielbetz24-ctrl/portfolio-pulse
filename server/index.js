const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const { Pool, types } = require('pg');

// Force DECIMAL/NUMERIC (OID 1700) to be parsed as native JavaScript floats rather than string objects
types.setTypeParser(1700, val => parseFloat(val));

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/portfolio_pulse';
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let isPgActive = false;

async function initDb() {
  try {
    console.log('[Database] Connecting to PostgreSQL...');
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('[Database] PostgreSQL connection successful! Running in PostgreSQL mode.');
    isPgActive = true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'client')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS portfolios (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        cash_balance DECIMAL(15, 4) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(50) PRIMARY KEY,
        portfolio_id VARCHAR(50) REFERENCES portfolios(id) ON DELETE CASCADE,
        ticker VARCHAR(20),
        action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('buy', 'sell', 'deposit', 'withdraw', 'holding')),
        quantity DECIMAL(15, 6) DEFAULT 0,
        price DECIMAL(15, 4) DEFAULT 0,
        transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
        created_by_user_id VARCHAR(50) REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tips (
        id VARCHAR(50) PRIMARY KEY,
        ticker VARCHAR(20),
        content TEXT NOT NULL,
        recommender VARCHAR(20) NOT NULL,
        target_user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        image_url VARCHAR(255),
        date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_reads (
        id SERIAL PRIMARY KEY,
        notification_id VARCHAR(50) REFERENCES notifications(id) ON DELETE CASCADE,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(notification_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        fcm_token TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stocks (
        ticker VARCHAR(20) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(15, 4) NOT NULL DEFAULT 0,
        change DECIMAL(15, 4) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        previous_close DECIMAL(15, 4) NOT NULL DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stocks_ticker_lower ON stocks (LOWER(ticker));
      CREATE INDEX IF NOT EXISTS idx_stocks_name_lower ON stocks (LOWER(name));

      CREATE TABLE IF NOT EXISTS positions (
        portfolio_id VARCHAR(50) REFERENCES portfolios(id) ON DELETE CASCADE,
        ticker VARCHAR(20) NOT NULL,
        quantity DECIMAL(15, 6) NOT NULL DEFAULT 0,
        avg_buy_price DECIMAL(15, 4) NOT NULL DEFAULT 0,
        current_price DECIMAL(15, 4) DEFAULT NULL,
        market_value DECIMAL(15, 4) DEFAULT NULL,
        pnl DECIMAL(15, 4) DEFAULT NULL,
        pnl_pct DECIMAL(15, 4) DEFAULT NULL,
        PRIMARY KEY (portfolio_id, ticker)
      );
    `);
    console.log('[Database] Database tables initialized successfully!');

    // Re-index stocks table on startup as requested
    try {
      await pool.query('REINDEX TABLE stocks');
      console.log('[Database] Table "stocks" re-indexed successfully.');
    } catch (reindexErr) {
      console.error('[Database Warning] Failed to re-index stocks table:', reindexErr.message);
    }
    
    // Auto-migrate local JSON database into PostgreSQL if present on boot
    await migrateJsonToPostgres(pool);
    
    // Seed admin if not present
    const res = await pool.query('SELECT * FROM users WHERE role = $1', ['admin']);
    if (res.rows.length === 0) {
      console.log('[Database] Seeding default admin user...');
      const adminId = 'u_admin_avi';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync('AVIm76543', salt, 64).toString('hex');
      const passwordHash = `${salt}:${hash}`;
      await pool.query(
        'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
        [adminId, 'אבי', 'aviariel91@gmail.com', passwordHash, 'admin']
      );
      console.log('[Database] Seeding completed.');
    }

    // Sync all existing portfolios to positions table on boot
    const startupClient = await pool.connect();
    try {
      const portRes = await startupClient.query('SELECT id FROM portfolios');
      console.log(`[Database] Syncing positions for ${portRes.rows.length} portfolios on startup...`);
      for (const port of portRes.rows) {
        await syncPortfolioPositions(port.id, startupClient);
      }
      console.log('[Database] Initial startup positions sync completed.');
    } catch (syncErr) {
      console.error('[Database Error] Failed startup positions sync:', syncErr.message);
    } finally {
      startupClient.release();
    }

    // Run stock price updater once on startup in background
    updateAllStockPricesJob().catch(err => {
      console.error('[Job Error] Failed to run initial stock price update:', err.message);
    });

  } catch (err) {
    console.warn('[Database Warning] PostgreSQL connection failed. Falling back to JSON database mode (data/db.json). Reason:', err.message);
    isPgActive = false;
  }
}

async function migrateJsonToPostgres(pool) {
  const jsonPath = path.join(__dirname, '..', 'data', 'db.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('[Migration] No local db.json file found to migrate.');
    return;
  }

  const client = await pool.connect();
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const db = JSON.parse(raw);
    console.log('[Migration] Found existing flat db.json. Migrating users and portfolios...');

    await client.query('BEGIN');

    // 1. Migrate Users
    if (db.users && db.users.length > 0) {
      console.log(`[Migration] Migrating ${db.users.length} users...`);
      for (const u of db.users) {
        await client.query(`
          INSERT INTO users (id, name, email, password_hash, role, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            is_active = EXCLUDED.is_active,
            created_at = EXCLUDED.created_at
        `, [
          u.id, 
          u.name, 
          (u.email || '').trim().toLowerCase(), 
          u.password_hash, 
          u.role, 
          u.is_active !== false, 
          u.created_at || new Date().toISOString()
        ]);
      }
    }

    // 2. Migrate Portfolios
    if (db.portfolios && db.portfolios.length > 0) {
      console.log(`[Migration] Migrating ${db.portfolios.length} portfolios...`);
      for (const p of db.portfolios) {
        await client.query(`
          INSERT INTO portfolios (id, user_id, name, cash_balance, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            name = EXCLUDED.name,
            cash_balance = EXCLUDED.cash_balance,
            created_at = EXCLUDED.created_at
        `, [
          p.id,
          p.user_id,
          p.name || 'תיק השקעות אישי',
          parseFloat(p.cash_balance || 0),
          p.created_at || new Date().toISOString()
        ]);
      }
    }

    // 3. Migrate Transactions
    if (db.transactions && db.transactions.length > 0) {
      console.log(`[Migration] Migrating ${db.transactions.length} transactions...`);
      for (const tx of db.transactions) {
        await client.query(`
          INSERT INTO transactions (id, portfolio_id, ticker, action_type, quantity, price, transaction_date, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `, [
          tx.id,
          tx.portfolio_id,
          tx.ticker || null,
          tx.action_type,
          parseFloat(tx.quantity || 0),
          parseFloat(tx.price || 0),
          tx.transaction_date || new Date().toISOString(),
          tx.created_by_user_id || null
        ]);
      }
    }

    // 4. Migrate Tips
    if (db.tips && db.tips.length > 0) {
      console.log(`[Migration] Migrating ${db.tips.length} tips...`);
      for (const t of db.tips) {
        await client.query(`
          INSERT INTO tips (id, ticker, content, recommender, target_user_id, image_url, date, is_read)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            ticker = EXCLUDED.ticker,
            content = EXCLUDED.content,
            recommender = EXCLUDED.recommender,
            target_user_id = EXCLUDED.target_user_id,
            image_url = EXCLUDED.image_url,
            date = EXCLUDED.date,
            is_read = EXCLUDED.is_read
        `, [
          t.id,
          t.ticker || null,
          t.content,
          t.recommender || 'avi',
          t.target_user_id || null,
          t.image_url || null,
          t.date || new Date().toISOString(),
          t.is_read === true
        ]);
      }
    }

    // 5. Migrate Notifications
    if (db.notifications && db.notifications.length > 0) {
      console.log(`[Migration] Migrating ${db.notifications.length} notifications...`);
      for (const n of db.notifications) {
        await client.query(`
          INSERT INTO notifications (id, user_id, title, body, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            created_at = EXCLUDED.created_at
        `, [
          n.id,
          n.user_id || null,
          n.title,
          n.body,
          n.date || new Date().toISOString()
        ]);

        if (n.read_by && n.read_by.length > 0) {
          for (const userId of n.read_by) {
            await client.query(`
              INSERT INTO notification_reads (notification_id, user_id)
              VALUES ($1, $2)
              ON CONFLICT (notification_id, user_id) DO NOTHING
            `, [n.id, userId]);
          }
        }
      }
    }

    // 6. Migrate Subscriptions
    if (db.subscriptions && db.subscriptions.length > 0) {
      console.log(`[Migration] Migrating ${db.subscriptions.length} subscriptions...`);
      for (const s of db.subscriptions) {
        await client.query(`
          INSERT INTO subscriptions (id, user_id, fcm_token, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            fcm_token = EXCLUDED.fcm_token,
            created_at = EXCLUDED.created_at
        `, [
          s.id,
          s.user_id,
          s.fcm_token,
          s.created_at || new Date().toISOString()
        ]);
      }
    }

    await client.query('COMMIT');
    console.log('[Migration] PostgreSQL data migration completed successfully on startup with zero data loss!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration Error] Fail to migrate inside startup initDb:', err.message);
  } finally {
    client.release();
  }
}

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'portfoliopulse-dev-secret-change-in-production';

const activeSockets = new Map(); // Maps userId -> Set of sockets

function decodeWSFrame(buffer) {
  if (buffer.length < 2) return null;
  const firstByte = buffer[0];
  const secondByte = buffer[1];
  
  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7F;
  
  let offset = 2;
  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    const high = buffer.readUInt32BE(2);
    const low = buffer.readUInt32BE(6);
    payloadLen = low;
    offset = 10;
  }
  
  if (masked) {
    if (buffer.length < offset + 4) return null;
    const maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
    
    if (buffer.length < offset + payloadLen) return null;
    const payload = buffer.slice(offset, offset + payloadLen);
    
    const decrypted = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      decrypted[i] = payload[i] ^ maskKey[i % 4];
    }
    return { fin, opcode, payload: decrypted, totalLength: offset + payloadLen };
  } else {
    if (buffer.length < offset + payloadLen) return null;
    const payload = buffer.slice(offset, offset + payloadLen);
    return { fin, opcode, payload, totalLength: offset + payloadLen };
  }
}

function encodeWSFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  
  if (len <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  
  return Buffer.concat([header, payload]);
}

function sendWebSocketMessage(userId, messageObj) {
  const userSockets = activeSockets.get(userId);
  if (userSockets) {
    const text = JSON.stringify(messageObj);
    const frame = encodeWSFrame(text);
    for (const socket of userSockets) {
      try {
        socket.write(frame);
      } catch (e) {
        console.error(`[WS Send Error] Failed to send to ${userId}:`, e.message);
      }
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function uid(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function syncPortfoliosCashBalances(db) {
  for (const p of db.portfolios) {
    let balance = 0;
    const pTx = db.transactions.filter(t => t.portfolio_id === p.id);
    for (const t of pTx) {
      if (t.action_type === 'deposit') {
        balance += parseFloat(t.price || 0);
      } else if (t.action_type === 'withdraw') {
        balance -= parseFloat(t.price || 0);
      } else if (t.action_type === 'buy') {
        balance -= parseFloat(t.quantity || 0) * parseFloat(t.price || 0);
      } else if (t.action_type === 'sell') {
        balance += parseFloat(t.quantity || 0) * parseFloat(t.price || 0);
      }
    }
    p.cash_balance = balance;
  }
}

function readDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const db = { users: [], portfolios: [], transactions: [], tips: [], notifications: [], subscriptions: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    seedDb(db);
    return db;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (db.users.length === 0) seedDb(db);
  
  if (!db.notifications) db.notifications = [];
  if (!db.subscriptions) db.subscriptions = [];
  
  // Ephemeral AI Tips: Clean up daily AI tips older than 24 hours
  if (db.tips) {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const initialCount = db.tips.length;
    db.tips = db.tips.filter(t => {
      if (t.recommender === 'ai') {
        const createdAtTime = t.created_at ? new Date(t.created_at).getTime() : new Date(t.date || Date.now()).getTime();
        return createdAtTime > oneDayAgo;
      }
      return true; // Keep advisor tips permanently
    });
    if (db.tips.length !== initialCount) {
      writeDb(db);
    }
  }

  // Recalculate and synchronize cash balances dynamically
  syncPortfoliosCashBalances(db);
  
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const https = require('https');

let oauthTokenCache = {
  token: null,
  expiry: 0
};

async function getGoogleAccessToken(serviceAccount) {
  if (oauthTokenCache.token && Date.now() < oauthTokenCache.expiry) {
    return oauthTokenCache.token;
  }

  const client_email = serviceAccount.client_email;
  const private_key = serviceAccount.private_key;
  
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const base64url = (str) => Buffer.from(str).toString('base64url');
  const tokenInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  
  const signature = crypto.sign('RSA-SHA256', Buffer.from(tokenInput), private_key);
  const jwt = `${tokenInput}.${signature.toString('base64url')}`;

  const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            oauthTokenCache = {
              token: data.access_token,
              expiry: Date.now() + (data.expires_in - 300) * 1000 // Expire 5 minutes early
            };
            resolve(data.access_token);
          } catch (e) {
            reject(new Error('Failed to parse OAuth response: ' + body));
          }
        } else {
          reject(new Error(`OAuth request failed with ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sendFcmV1Notification(serviceAccount, token, title, body, icon) {
  return getGoogleAccessToken(serviceAccount)
    .then(accessToken => {
      const projectId = serviceAccount.project_id;
      const targetToken = token;
      const payload = {
        message: {
          token: targetToken,
          // הבלוק הזה קריטי כדי לעקוף את מנגנון ניהול הסוללה (Doze Mode) ברמת ה-OS
          android: {
            priority: "high",
            ttl: "86400s" // שים לב לתוספת ה-'s' המייצגת שניות בתקן אנדרואיד
          },
          // הבלוק הזה אחראי על ציור ההתראה ברמת הדפדפן ללא צורך בהתערבות JavaScript
          webpush: {
            headers: {
              "Urgency": "high",
              "TTL": "86400"
            },
            notification: {
              title: title,
              body: body,
              icon: "/icons/icon-192x192.png", // ודא נתיב נכון
              badge: "/icons/icon-72x72.png",
              click_action: "https://portfolio-pulse-mux5.onrender.com/"
            }
          }
        }
      };

      const payloadString = JSON.stringify(payload);

      const options = {
        method: 'POST',
        hostname: 'fcm.googleapis.com',
        path: `/v1/projects/${projectId}/messages:send`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      };

      return new Promise((resolve) => {
        const req = https.request(options, (res) => {
          let resBody = '';
          res.on('data', chunk => resBody += chunk);
          res.on('end', () => {
            console.log(`[FCM v1 Service] Request status: ${res.statusCode}`);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, response: JSON.parse(resBody) });
            } else {
              try {
                const errJson = JSON.parse(resBody);
                const errorCode = errJson.error?.status;
                const isInvalid = ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode) || (errJson.error?.details && JSON.stringify(errJson.error.details).includes('invalid'));
                resolve({ success: false, error: errJson.error?.message || resBody, invalidToken: isInvalid, statusCode: res.statusCode });
              } catch {
                resolve({ success: false, error: resBody, statusCode: res.statusCode });
              }
            }
          });
        });

        req.on('error', (err) => {
          console.error('[FCM v1 Service] Connection error:', err.message);
          resolve({ success: false, error: err.message });
        });

        req.write(payloadString);
        req.end();
      });
    })
    .catch(err => {
      console.error('[FCM v1 Service] OAuth Token Error:', err.message);
      return { success: false, error: err.message };
    });
}

function sendFcmLegacyNotification(token, title, body, icon) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    console.warn('[FCM Legacy] FIREBASE_SERVER_KEY is not defined. Skipping notification.');
    return Promise.resolve({ success: false, error: 'FIREBASE_SERVER_KEY missing' });
  }

  const payload = {
    to: token,
    notification: {
      title: title,
      body: body,
      icon: icon || 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png',
      click_action: '/'
    },
    data: {
      title: title,
      body: body,
      icon: icon || 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png'
    }
  };

  const payloadString = JSON.stringify(payload);

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
        console.log(`[FCM Legacy Service] Request status: ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(resBody);
            if (parsed.results && parsed.results[0] && parsed.results[0].error) {
              const fcmError = parsed.results[0].error;
              console.warn(`[FCM Legacy Service] Delivery failed with error: ${fcmError}`);
              resolve({ success: false, error: fcmError, invalidToken: ['NotRegistered', 'InvalidRegistration'].includes(fcmError) });
            } else {
              resolve({ success: true, response: parsed });
            }
          } catch (e) {
            resolve({ success: true, rawResponse: resBody });
          }
        } else {
          resolve({ success: false, statusCode: res.statusCode, error: resBody });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[FCM Legacy Service] Connection error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(payloadString);
    req.end();
  });
}

function sendFcmNotification(token, title, body, icon) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (serviceAccount && serviceAccount.private_key && serviceAccount.client_email) {
        return sendFcmV1Notification(serviceAccount, token, title, body, icon);
      }
    } catch (e) {
      console.error('[FCM] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    }
  }

  return sendFcmLegacyNotification(token, title, body, icon);
}

async function triggerFcmNotification(db, targetUserId, title, body) {
  db.subscriptions = db.subscriptions || [];
  let targets = [];
  
  if (targetUserId) {
    targets = db.subscriptions.filter(s => s.user_id === targetUserId);
  } else {
    targets = db.subscriptions.filter(s => s.user_id !== 'u_admin_avi');
  }

  // Deduplicate target records by FCM token/endpoint to guarantee we never send twice to the same device
  const seenTokens = new Set();
  const uniqueTargets = [];
  for (const s of targets) {
    const t = s.fcm_token || s.endpoint;
    if (t && !seenTokens.has(t)) {
      seenTokens.add(t);
      uniqueTargets.push(s);
    }
  }

  console.log(`[FCM Trigger] Dispatching push to ${uniqueTargets.length} unique tokens for target: ${targetUserId || 'all clients'}`);
  
  const icon = 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png';
  
  const promises = uniqueTargets.map(subRecord => {
    const token = subRecord.fcm_token || subRecord.endpoint;
    if (!token || token.startsWith('mock-')) {
      return Promise.resolve({ success: true, mock: true });
    }

    return sendFcmNotification(token, title, body, icon)
      .then(res => {
        if (!res.success) {
          console.warn(`[FCM Trigger] Failed to deliver to ${subRecord.id}:`, res.error);
          if (res.invalidToken || res.statusCode === 404 || res.statusCode === 410) {
            console.log(`[FCM Trigger] Removing invalid/expired token: ${subRecord.id}`);
            db.subscriptions = db.subscriptions.filter(s => s.id !== subRecord.id);
            writeDb(db);
          }
        }
        return res;
      })
      .catch(err => {
        console.error(`[FCM Trigger] Error dispatching to ${subRecord.id}:`, err.message);
        return { success: false, error: err.message };
      });
  });

  await Promise.all(promises);
}

function seedDb(db) {
  const adminId = 'u_admin_avi';
  db.users.push({
    id: adminId,
    name: 'אבי',
    email: 'aviariel91@gmail.com',
    password_hash: hashPassword('AVIm76543'),
    role: 'admin',
    is_active: true,
    created_at: new Date().toISOString()
  });
  writeDb(db);
}

const ADMIN_EMAILS = ['aviariel91@gmail.com'];

function resolveRoleByEmail(email) {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase()) ? 'admin' : 'client';
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function signToken(user) {
  const payload = JSON.stringify({ id: user.id, email: user.email, role: user.role, name: user.name, exp: Date.now() + 7 * 86400000 });
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const dot = decoded.lastIndexOf('.');
    const payload = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

async function updateStockInDb(client, stockData) {
  if (!isPgActive) return;
  await client.query(`
    INSERT INTO stocks (ticker, name, price, change, currency, previous_close, last_updated)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (ticker) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      change = EXCLUDED.change,
      currency = EXCLUDED.currency,
      previous_close = EXCLUDED.previous_close,
      last_updated = NOW()
  `, [
    stockData.ticker.toUpperCase(),
    stockData.name || stockData.ticker,
    Number(stockData.price || 0),
    Number(stockData.change || 0),
    stockData.currency || 'USD',
    Number(stockData.previousClose || stockData.previous_close || 0)
  ]);
}

async function syncPortfolioPositions(portfolioId, client) {
  if (!isPgActive) return;
  
  const txRes = await client.query(`
    SELECT * FROM transactions 
    WHERE portfolio_id = $1 
    ORDER BY transaction_date ASC, created_at ASC
  `, [portfolioId]);
  
  const transactions = txRes.rows;
  const holdingsMap = {};
  
  for (const tx of transactions) {
    if (tx.action_type === 'deposit' || tx.action_type === 'withdraw') continue;
    const ticker = (tx.ticker || '').toUpperCase();
    if (!ticker) continue;
    
    if (!holdingsMap[ticker]) {
      holdingsMap[ticker] = {
        ticker,
        quantity: 0,
        total_buy_cost: 0,
        total_buy_qty: 0
      };
    }
    
    const h = holdingsMap[ticker];
    const qty = Number(tx.quantity || 0);
    const price = Number(tx.price || 0);
    
    if (tx.action_type === 'buy' || tx.action_type === 'holding') {
      h.quantity += qty;
      h.total_buy_cost += qty * price;
      h.total_buy_qty += qty;
    } else if (tx.action_type === 'sell') {
      h.quantity -= qty;
      if (h.quantity <= 0.000001) {
        delete holdingsMap[ticker];
      }
    }
  }
  
  const activeTickers = Object.keys(holdingsMap);
  
  if (activeTickers.length > 0) {
    await client.query(`
      DELETE FROM positions 
      WHERE portfolio_id = $1 AND NOT (ticker = ANY($2))
    `, [portfolioId, activeTickers]);
  } else {
    await client.query(`DELETE FROM positions WHERE portfolio_id = $1`, [portfolioId]);
  }
  
  for (const ticker of activeTickers) {
    const h = holdingsMap[ticker];
    const avg_buy_price = h.total_buy_qty > 0 ? h.total_buy_cost / h.total_buy_qty : 0;
    
    const stockRes = await client.query('SELECT * FROM stocks WHERE ticker = $1', [ticker]);
    let current_price = null;
    let market_value = null;
    let pnl = null;
    let pnl_pct = null;
    
    if (stockRes.rows.length > 0) {
      const stock = stockRes.rows[0];
      current_price = Number(stock.price);
      market_value = h.quantity * current_price;
      pnl = market_value - (h.quantity * avg_buy_price);
      pnl_pct = avg_buy_price > 0 ? (pnl / (h.quantity * avg_buy_price)) * 100 : 0;
    }
    
    await client.query(`
      INSERT INTO positions (portfolio_id, ticker, quantity, avg_buy_price, current_price, market_value, pnl, pnl_pct)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (portfolio_id, ticker) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        avg_buy_price = EXCLUDED.avg_buy_price,
        current_price = EXCLUDED.current_price,
        market_value = EXCLUDED.market_value,
        pnl = EXCLUDED.pnl,
        pnl_pct = EXCLUDED.pnl_pct
    `, [
      portfolioId,
      ticker,
      h.quantity,
      avg_buy_price,
      current_price,
      market_value,
      pnl,
      pnl_pct
    ]);
  }
}

async function updateAllStockPricesJob() {
  if (!isPgActive) return;
  
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT DISTINCT ticker FROM transactions WHERE ticker IS NOT NULL');
    const tickers = res.rows.map(r => r.ticker.toUpperCase());
    
    if (tickers.length === 0) return;
    
    console.log(`[Job] Updating database prices for ${tickers.length} tickers:`, tickers.join(', '));
    for (const t of tickers) {
      try {
        const data = await fetchYahooChart(t);
        if (data) {
          await updateStockInDb(client, data);
        }
      } catch (err) {
        console.error(`[Job Error] Failed to update stock ${t}:`, err.message);
      }
    }
    
    const portfoliosRes = await client.query('SELECT id FROM portfolios');
    for (const port of portfoliosRes.rows) {
      await syncPortfolioPositions(port.id, client);
    }
    console.log('[Job] Stock prices database update completed successfully.');
  } catch (err) {
    console.error('[Job Error] Failed to run updateAllStockPricesJob:', err.message);
  } finally {
    client.release();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) reject(new Error('Body too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function getAuth(req) {
  // 1. Try Authorization header
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    return verifyToken(h.slice(7));
  }
  
  // 2. Try URL query parameter 'token' (crucial for Service Worker background requests)
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token) {
      return verifyToken(token);
    }
  } catch (e) {
    // Ignore URL parse errors
  }
  
  return null;
}

const PRICE_CACHE = {};
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache TTL

async function fetchYahooChart(ticker) {
  const normTicker = ticker.toUpperCase();
  const cached = PRICE_CACHE[normTicker];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioPulse/1.0)' } });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
    const chartData = await response.json();
    if (!chartData?.chart?.result?.length) return null;
    const meta = chartData.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    let change = 0;
    if (price && prevClose) change = ((price - prevClose) / prevClose) * 100;
    
    const result = {
      ticker: normTicker,
      price,
      change,
      currency: meta.currency,
      name: meta.longName || meta.shortName || normTicker,
      previousClose: prevClose || meta.chartPreviousClose
    };

    PRICE_CACHE[normTicker] = {
      timestamp: Date.now(),
      data: result
    };

    if (isPgActive) {
      pool.connect().then(async (client) => {
        try {
          await updateStockInDb(client, result);
        } catch (dbErr) {
          console.error(`[Database Error] Failed to auto-upsert stock ${normTicker}:`, dbErr.message);
        } finally {
          client.release();
        }
      }).catch(connectErr => {
        console.error(`[Database Error] Failed to connect for auto-upsert of stock ${normTicker}:`, connectErr.message);
      });
    }

    return result;
  } catch (e) {
    // If live fetch fails but we have a stale cache, return it rather than throwing an error!
    if (cached) {
      console.log(`Fetch failed for ${ticker}, returning stale cached price:`, e.message);
      return cached.data;
    }
    throw e;
  }
}

async function generateDailyAITips(db) {
  return; // Disabled to prevent tips with target_user_id: null
  
  console.log(`[AI Tips Generator] Generating daily tips for ${today}...`);
  
  // Fetch market data to base the tips on real numbers
  let gspc = { price: 5300, change: 0.35 };
  let ixic = { price: 16800, change: 0.65 };
  let nvda = { price: 950, change: 1.25 };
  let pltr = { price: 21.5, change: -0.85 };
  
  try {
    const gspcData = await fetchYahooChart('^GSPC');
    if (gspcData) gspc = gspcData;
  } catch (e) { console.log('GSPC fetch failed:', e.message); }
  
  try {
    const ixicData = await fetchYahooChart('^IXIC');
    if (ixicData) ixic = ixicData;
  } catch (e) { console.log('IXIC fetch failed:', e.message); }
  
  try {
    const nvdaData = await fetchYahooChart('NVDA');
    if (nvdaData) nvda = nvdaData;
  } catch (e) { console.log('NVDA fetch failed:', e.message); }
  
  try {
    const pltrData = await fetchYahooChart('PLTR');
    if (pltrData) pltr = pltrData;
  } catch (e) { console.log('PLTR fetch failed:', e.message); }
  
  const tipsToCreate = [];
  
  // Tip 1: Macro Global Index Update
  const gspcTrend = gspc.change >= 0 ? 'חיובית ותומכת' : 'תנודתית ורגישה';
  const gspcAction = gspc.change >= 0 
    ? 'מומלץ לנצל את המומנטום להחזקת מניות ערך יציבות, אך להימנע מרדיפה אחר מניות בשיא כל הזמנים.' 
    : 'מומלץ להגדיל את רכיב המזומן ל-15% מהתיק כדי לנצל הזדמנויות קנייה בירידות שערים.';
  
  const tip1Content = `📊 <strong>מצב השוק הגלובלי:</strong> מדד ה-S&P 500 נסחר כעת בשער של $${gspc.price.toLocaleString()} (${gspc.change >= 0 ? '+' : ''}${gspc.change.toFixed(2)}%). המגמה הנוכחית היא ${gspcTrend}. ${gspcAction} מומלץ להתמקד בפיזור רחב בין סקטורים מבוססי רווחיות.`;
  
  tipsToCreate.push({
    id: `t_ai_macro_${today}_${Math.random().toString(36).substr(2, 5)}`,
    advisor_id: 'u_admin_avi',
    recommender: 'ai',
    ticker: null,
    content: tip1Content,
    date: today
  });

  // Tip 2: Trending Tech Stock Analysis (NVDA or PLTR depending on changes)
  const chooseNvda = Math.random() > 0.5;
  if (chooseNvda) {
    const nvdaTrend = nvda.change >= 0 ? 'מפגינה עוצמה מוגברת' : 'עוברת מימוש רווחים בריא';
    const nvdaAction = nvda.change >= 0 
      ? 'החזקה מומלצת כחלק מליבת ה-AI, אך יש להקפיד שלא תעלה על 20% מהתיק למניעת תנודתיות יתר.' 
      : 'שער הכניסה הנוכחי מציע הזדמנות נוחה למי שמעוניין להגדיל חשיפה לטווח ארוך.';
    
    const tip2Content = `🚀 <strong>אנליזה למניית NVDA:</strong> מניית אנבידיה נסחרת בשער של $${nvda.price.toFixed(2)} (${nvda.change >= 0 ? '+' : ''}${nvda.change.toFixed(2)}%) ו${nvdaTrend}. ${nvdaAction} החברה ממשיכה ליהנות מביקושים חסרי תקדים לשבבי Blackwell.`;
    
    tipsToCreate.push({
      id: `t_ai_stock_${today}_${Math.random().toString(36).substr(2, 5)}`,
      advisor_id: 'u_admin_avi',
      recommender: 'ai',
      ticker: 'NVDA',
      content: tip2Content,
      date: today
    });
  } else {
    const pltrTrend = pltr.change >= 0 ? 'במגמת עלייה ועניין גובר' : 'מתבססת מעל רמות תמיכה';
    const pltrAction = pltr.change >= 0 
      ? 'נצלו את המומנטום אך המתינו לתיקון טכני לפני הגדלה מסיבית של הפוזיציה.' 
      : 'רמות המחיר הנוכחיות מעניינות לבחינת כניסה מדורגת עבור משקיעי ערך מונחי AI.';
    
    const tip2Content = `🚀 <strong>אנליזה למניית PLTR:</strong> מניית פלנטיר נסחרת בשער של $${pltr.price.toFixed(2)} (${pltr.change >= 0 ? '+' : ''}${pltr.change.toFixed(2)}%) ו${pltrTrend}. החוזים הממשלתיים וההתרחבות במגזר העסקי עם פלטפורמת AIP מספקים תמיכה משמעותית. ${pltrAction}`;
    
    tipsToCreate.push({
      id: `t_ai_stock_${today}_${Math.random().toString(36).substr(2, 5)}`,
      advisor_id: 'u_admin_avi',
      recommender: 'ai',
      ticker: 'PLTR',
      content: tip2Content,
      date: today
    });
  }

  // Tip 3: Sector Alert or Warning
  const tip3Options = [
    `⚠️ <strong>אזהרת סקטור - נדל"ן מסחרי:</strong> הריביות הגבוהות בעולם ממשיכות להעיב על סקטור הנדל"ן המסחרי והמשרדים. מומלץ להימנע מחשיפת יתר לחברות ממונפות מאוד בתחום זה ולנתב הון פנוי לחברות בעלות תזרים מזומנים חופשי חזק.`,
    `⚡ <strong>סקטור האנרגיה והתשתיות:</strong> המעבר העולמי לבינה מלאכותית דורש משאבי חשמל עצומים. חברות המייצרות אנרגיה נקייה ותשתיות רשת חשמל נהנות מצמיחה שקטה ויציבה. מומלץ לשקול שילוב תעודות סל כמו XLU בתיק ההשקעות.`,
    `🔐 <strong>הזדמנות סקטור - סייבר אבטחת מידע:</strong> עם התגברות האיומים הדיגיטליים ויישומי ה-AI, תקציבי הסייבר של ארגונים גדולים הם חסיני מיתון. חברות מובילות כמו Palo Alto (PANW) או CrowdStrike מציגות יציבות פיננסית פרימיום.`
  ];
  const tip3Content = tip3Options[Math.floor(Math.random() * tip3Options.length)];
  
  tipsToCreate.push({
    id: `t_ai_sector_${today}_${Math.random().toString(36).substr(2, 5)}`,
    advisor_id: 'u_admin_avi',
    recommender: 'ai',
    ticker: null,
    content: tip3Content,
    date: today
  });

  // Add all to database with created_at timestamps
  const tipsWithCreatedAt = tipsToCreate.map(t => ({
    ...t,
    created_at: new Date().toISOString()
  }));
  db.tips.push(...tipsWithCreatedAt);
  
  // Trigger AI Daily Tip Push Notification (Disabled in v2.5.0)
  /*
  const newNotif = {
    id: uid('nt'),
    user_id: null,
    title: 'PortfolioPulse AI: ניתוח שוק חדש',
    body: 'הבוט שלנו סרק את השוק והעלה תובנות חדשות להיום. היכנסו לראות.',
    created_at: new Date().toISOString(),
    read_by: []
  };
  db.notifications = db.notifications || [];
  db.notifications.push(newNotif);
  */

  writeDb(db);
  console.log(`[AI Tips Generator] Successfully created 3 daily tips and broadcast notification for ${today}.`);

  // Broadcast the new daily tips to all connected WebSocket clients instantly
  if (typeof activeSockets !== 'undefined') {
    for (const userId of activeSockets.keys()) {
      sendWebSocketMessage(userId, {
        type: 'new_daily_ai_tips',
        data: tipsWithCreatedAt
      });
    }
  }
}

function serveStatic(req, res, filePath) {
  if (!filePath.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'Forbidden' });
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return sendJson(res, 404, { error: 'Not found' });
    
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    
    const noCacheExts = ['.html', '.js', '.css', '.json', '.apk'];
    const cacheControl = noCacheExts.includes(ext)
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=86400';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl
    });
    
    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      console.error('Stream error:', streamErr);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' });
      }
    });
    stream.pipe(res);
  });
}

async function handleApi(req, res, pathname, query) {
  const user = getAuth(req);

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readBody(req);
    const em = (body.email || '').trim().toLowerCase();
    const name = body.name || '';
    const password = body.password || '';
    
    if (!em || !name || !password) {
      return sendJson(res, 400, { error: 'נא למלא את כל שדות החובה' });
    }
    
    const userRole = resolveRoleByEmail(em);
    const id = uid('u_' + userRole);
    
    if (isPgActive) {
      try {
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [em]);
        if (userCheck.rows.length > 0) {
          return sendJson(res, 409, { error: 'כתובת האימייל כבר רשומה במערכת' });
        }
        
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
            [id, name.trim(), em, hashPassword(password), userRole]
          );
          const pId = uid('p');
          await client.query(
            'INSERT INTO portfolios (id, user_id, name, cash_balance) VALUES ($1, $2, $3, $4)',
            [pId, id, 'תיק השקעות אישי', 0]
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
        
        const u = { id, name: name.trim(), email: em, role: userRole };
        return sendJson(res, 201, { user: u, token: signToken(u) });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      // Fallback JSON db register
      const db = readDb();
      if (db.users.some(u => u.email === em)) {
        return sendJson(res, 409, { error: 'כתובת האימייל כבר רשומה במערכת' });
      }
      
      const newUser = {
        id,
        name: name.trim(),
        email: em,
        password_hash: hashPassword(password),
        role: userRole,
        is_active: true,
        created_at: new Date().toISOString()
      };
      db.users.push(newUser);
      
      const newPortfolio = {
        id: uid('p'),
        user_id: id,
        name: 'תיק השקעות אישי',
        cash_balance: 0,
        created_at: new Date().toISOString()
      };
      db.portfolios.push(newPortfolio);
      
      writeDb(db);
      
      const u = publicUser(newUser);
      return sendJson(res, 201, { user: u, token: signToken(u) });
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const em = (body.email || '').trim().toLowerCase();
    
    if (isPgActive) {
      try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [em]);
        const row = userRes.rows[0];
        if (!row || !verifyPassword(body.password || '', row.password_hash)) {
          return sendJson(res, 401, { error: 'אימייל או סיסמה שגויים' });
        }
        const u = publicUser(row);
        return sendJson(res, 200, { user: u, token: signToken(u) });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      const row = db.users.find(u => u.email === em && u.is_active);
      if (!row || !verifyPassword(body.password || '', row.password_hash)) {
        return sendJson(res, 401, { error: 'אימייל או סיסמה שגויים' });
      }
      const u = publicUser(row);
      return sendJson(res, 200, { user: u, token: signToken(u) });
    }
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    
    if (isPgActive) {
      try {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
        const row = userRes.rows[0];
        if (!row) return sendJson(res, 401, { error: 'משתמש לא נמצא' });
        return sendJson(res, 200, { user: publicUser(row) });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      const row = db.users.find(u => u.id === user.id);
      if (!row) return sendJson(res, 401, { error: 'משתמש לא נמצא' });
      return sendJson(res, 200, { user: publicUser(row) });
    }
  }

  if (pathname === '/api/sync' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    
    if (isPgActive) {
      try {
        let portfolios = [];
        let transactions = [];
        let tips = [];
        let clients = [];
        
        if (user.role === 'admin') {
          const clientsRes = await pool.query('SELECT id, name, email, role FROM users WHERE role = $1 AND is_active = true', ['client']);
          clients = clientsRes.rows;
          
          const portfoliosRes = await pool.query('SELECT * FROM portfolios');
          portfolios = portfoliosRes.rows;
          
          const transactionsRes = await pool.query('SELECT * FROM transactions');
          transactions = transactionsRes.rows;
          
          const tipsRes = await pool.query('SELECT * FROM tips');
          tips = tipsRes.rows;
        } else {
          const portfoliosRes = await pool.query('SELECT * FROM portfolios WHERE user_id = $1', [user.id]);
          portfolios = portfoliosRes.rows;
          
          if (portfolios.length === 0) {
            const pId = uid('p');
            const pName = 'תיק השקעות אישי';
            await pool.query(
              'INSERT INTO portfolios (id, user_id, name, cash_balance) VALUES ($1, $2, $3, $4)',
              [pId, user.id, pName, 0]
            );
            portfolios = [{ id: pId, user_id: user.id, name: pName, cash_balance: 0 }];
          }
          
          const pIds = portfolios.map(p => p.id);
          const transactionsRes = await pool.query(
            'SELECT * FROM transactions WHERE portfolio_id = ANY($1)',
            [pIds]
          );
          transactions = transactionsRes.rows;
          
          const tipsRes = await pool.query(
            'SELECT * FROM tips WHERE target_user_id IS NULL OR target_user_id = $1',
            [user.id]
          );
          tips = tipsRes.rows;
        }
        
        const tipsMapped = tips.map(t => ({
          id: t.id,
          ticker: t.ticker,
          content: t.content,
          recommender: t.recommender,
          target_user_id: t.target_user_id,
          is_read: t.is_read || false,
          image_url: t.image_url,
          date: t.date ? new Date(t.date).toISOString().split('T')[0] : null
        }));
        
        const prices = {};
        for (const ticker in PRICE_CACHE) {
          prices[ticker] = PRICE_CACHE[ticker].data;
        }
        return sendJson(res, 200, {
          portfolios,
          transactions,
          tips: tipsMapped,
          clients,
          prices
        });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      await generateDailyAITips(db);
      const tips = db.tips.map(t => ({
        id: t.id,
        advisor_id: t.advisor_id,
        recommender: t.recommender || (t.id === 't5' || t.id === 't6' ? 'ai' : 'avi'),
        ticker: t.ticker,
        content: t.content,
        target_user_id: t.target_user_id || null,
        is_read: t.is_read || false,
        created_at: t.created_at || null,
        timestamp: t.timestamp || null,
        image_url: t.image_url || null,
        date: t.date || t.created_at?.split('T')[0]
      }));
      
      const prices = {};
      for (const ticker in PRICE_CACHE) {
        prices[ticker] = PRICE_CACHE[ticker].data;
      }

      if (user.role === 'admin') {
        return sendJson(res, 200, {
          portfolios: db.portfolios,
          transactions: db.transactions,
          tips,
          clients: db.users.filter(u => u.role === 'client' && u.is_active).map(publicUser),
          prices
        });
      }
      let portfolios = db.portfolios.filter(p => p.user_id === user.id);
      if (portfolios.length === 0) {
        const p = { id: uid('p'), user_id: user.id, name: 'תיק השקעות אישי', cash_balance: 0, created_at: new Date().toISOString() };
        db.portfolios.push(p);
        writeDb(db);
        portfolios = [p];
      }
      const ids = portfolios.map(p => p.id);
      const transactions = db.transactions.filter(t => ids.includes(t.portfolio_id));
      return sendJson(res, 200, { portfolios, transactions, tips, clients: [], prices });
    }
  }

  if (pathname === '/api/positions' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    
    if (isPgActive) {
      const client = await pool.connect();
      try {
        let portRes = await client.query('SELECT * FROM portfolios WHERE user_id = $1', [user.id]);
        let portfolio = portRes.rows[0];
        if (!portfolio) {
          const pId = uid('p');
          await client.query('INSERT INTO portfolios (id, user_id, name, cash_balance) VALUES ($1, $2, $3, $4)', [pId, user.id, 'תיק השקעות אישי', 0]);
          portRes = await client.query('SELECT * FROM portfolios WHERE id = $1', [pId]);
          portfolio = portRes.rows[0];
        }

        await syncPortfolioPositions(portfolio.id, client);

        const posRes = await client.query(`
          SELECT p.*, s.name as stock_name, s.change as daily_change
          FROM positions p
          LEFT JOIN stocks s ON p.ticker = s.ticker
          WHERE p.portfolio_id = $1
        `, [portfolio.id]);

        const holdings = posRes.rows.map(r => ({
          ticker: r.ticker,
          name: r.stock_name || r.ticker,
          quantity: Number(r.quantity),
          avg_buy_price: Number(r.avg_buy_price),
          current_price: r.current_price !== null ? Number(r.current_price) : null,
          market_value: r.market_value !== null ? Number(r.market_value) : null,
          pnl: r.pnl !== null ? Number(r.pnl) : null,
          pnl_pct: r.pnl_pct !== null ? Number(r.pnl_pct) : null,
          daily_change: r.daily_change !== null ? Number(r.daily_change) : null
        }));

        const cash_balance = Number(portfolio.cash_balance);
        let total_stock_value = 0;
        let total_cost = 0;
        let total_pnl = 0;
        
        let daily_change_usd = 0;
        let total_prev_stock_value = 0;

        holdings.forEach(h => {
          if (h.market_value !== null) {
            total_stock_value += h.market_value;
            total_cost += h.quantity * h.avg_buy_price;
            total_pnl += h.pnl;
            
            if (h.daily_change !== null && h.current_price !== null) {
              const change = h.daily_change;
              const prevClose = h.current_price / (1 + change / 100);
              daily_change_usd += h.quantity * (h.current_price - prevClose);
              total_prev_stock_value += h.quantity * prevClose;
            }
          }
        });

        const total_equity = cash_balance + total_stock_value;
        const total_pnl_pct = total_cost > 0 ? (total_pnl / total_cost) * 100 : 0;
        const daily_change_pct = total_prev_stock_value > 0 ? (daily_change_usd / total_prev_stock_value) * 100 : 0;

        client.release();

        return sendJson(res, 200, {
          portfolio_id: portfolio.id,
          portfolio_name: portfolio.name,
          cash_balance,
          total_stock_value,
          total_equity,
          total_pnl,
          total_pnl_pct,
          daily_change_usd,
          daily_change_pct,
          holdings
        });
      } catch (err) {
        client.release();
        return sendJson(res, 500, { error: err.message });
      }
    } else {
      const db = readDb();
      let portfolio = db.portfolios.find(p => p.user_id === user.id);
      if (!portfolio) {
        portfolio = { id: uid('p'), user_id: user.id, name: 'תיק השקעות אישי', cash_balance: 0, created_at: new Date().toISOString() };
        db.portfolios.push(portfolio);
        writeDb(db);
      }

      const transactions = db.transactions.filter(t => t.portfolio_id === portfolio.id);
      const holdingsMap = {};
      
      for (const tx of transactions) {
        if (tx.action_type === 'deposit' || tx.action_type === 'withdraw') continue;
        const ticker = (tx.ticker || '').toUpperCase();
        if (!ticker) continue;
        
        if (!holdingsMap[ticker]) {
          holdingsMap[ticker] = { ticker, quantity: 0, total_buy_cost: 0, total_buy_qty: 0 };
        }
        const h = holdingsMap[ticker];
        const qty = Number(tx.quantity || 0);
        const price = Number(tx.price || 0);
        
        if (tx.action_type === 'buy' || tx.action_type === 'holding') {
          h.quantity += qty;
          h.total_buy_cost += qty * price;
          h.total_buy_qty += qty;
        } else if (tx.action_type === 'sell') {
          h.quantity -= qty;
          if (h.quantity <= 0.000001) delete holdingsMap[ticker];
        }
      }

      const holdings = [];
      const cash_balance = Number(portfolio.cash_balance);
      let total_stock_value = 0;
      let total_cost = 0;
      let total_pnl = 0;
      let daily_change_usd = 0;
      let total_prev_stock_value = 0;

      for (const ticker in holdingsMap) {
        const h = holdingsMap[ticker];
        const avg_buy_price = h.total_buy_qty > 0 ? h.total_buy_cost / h.total_buy_qty : 0;
        
        const cached = PRICE_CACHE[ticker];
        let name = ticker;
        let current_price = null;
        let market_value = null;
        let pnl = null;
        let pnl_pct = null;
        let daily_change = null;

        if (cached && cached.data) {
          const stock = cached.data;
          name = stock.name || ticker;
          current_price = Number(stock.price);
          market_value = h.quantity * current_price;
          pnl = market_value - (h.quantity * avg_buy_price);
          pnl_pct = avg_buy_price > 0 ? (pnl / (h.quantity * avg_buy_price)) * 100 : 0;
          daily_change = Number(stock.change || 0);

          total_stock_value += market_value;
          total_cost += h.quantity * avg_buy_price;
          total_pnl += pnl;

          const prevClose = current_price / (1 + daily_change / 100);
          daily_change_usd += h.quantity * (current_price - prevClose);
          total_prev_stock_value += h.quantity * prevClose;
        }

        holdings.push({
          ticker,
          name,
          quantity: h.quantity,
          avg_buy_price,
          current_price,
          market_value,
          pnl,
          pnl_pct,
          daily_change
        });
      }

      const total_equity = cash_balance + total_stock_value;
      const total_pnl_pct = total_cost > 0 ? (total_pnl / total_cost) * 100 : 0;
      const daily_change_pct = total_prev_stock_value > 0 ? (daily_change_usd / total_prev_stock_value) * 100 : 0;

      return sendJson(res, 200, {
        portfolio_id: portfolio.id,
        portfolio_name: portfolio.name,
        cash_balance,
        total_stock_value,
        total_equity,
        total_pnl,
        total_pnl_pct,
        daily_change_usd,
        daily_change_pct,
        holdings
      });
    }
  }

  if (pathname === '/api/transactions' && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const body = await readBody(req);
    
    if (isPgActive) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const portRes = await client.query('SELECT * FROM portfolios WHERE id = $1 FOR UPDATE', [body.portfolio_id]);
        const portfolio = portRes.rows[0];
        
        if (!portfolio) {
          client.release();
          return sendJson(res, 404, { error: 'תיק לא נמצא' });
        }
        if (user.role === 'client' && portfolio.user_id !== user.id) {
          await client.query('ROLLBACK');
          client.release();
          return sendJson(res, 403, { error: 'אין הרשאה לתיק זה' });
        }
        
        const actionType = body.action_type;
        const price = parseFloat(body.price || 0);
        const qty = parseFloat(body.quantity || 0);
        let cash = parseFloat(portfolio.cash_balance || 0);
        
        if (actionType === 'buy') {
          const cost = qty * price;
          if (cash < cost) {
            await client.query('ROLLBACK');
            client.release();
            return sendJson(res, 400, { error: 'אין מספיק יתרה: אין לך מספיק יתרת מזומן פנויה לביצוע עסקה זו' });
          }
          cash -= cost;
        } else if (actionType === 'withdraw') {
          if (cash < price) {
            await client.query('ROLLBACK');
            client.release();
            return sendJson(res, 400, { error: 'אין מספיק יתרה: אין לך מספיק יתרת מזומן פנויה לביצוע משיכה זו' });
          }
          cash -= price;
        } else if (actionType === 'deposit') {
          cash += price;
        } else if (actionType === 'sell') {
          cash += qty * price;
        }
        
        await client.query('UPDATE portfolios SET cash_balance = $1 WHERE id = $2', [cash, portfolio.id]);
        
        const tx = {
          id: uid('tx'),
          portfolio_id: body.portfolio_id,
          ticker: body.ticker || null,
          action_type: actionType,
          quantity: qty,
          price: price,
          transaction_date: body.transaction_date || new Date().toISOString(),
          created_by_user_id: user.id
        };
        
        await client.query(`
          INSERT INTO transactions (id, portfolio_id, ticker, action_type, quantity, price, transaction_date, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [tx.id, tx.portfolio_id, tx.ticker, tx.action_type, tx.quantity, tx.price, tx.transaction_date, tx.created_by_user_id]);
        
        await syncPortfolioPositions(tx.portfolio_id, client);
        
        await client.query('COMMIT');
        client.release();
        return sendJson(res, 201, { transaction: tx });
      } catch (e) {
        await client.query('ROLLBACK');
        client.release();
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      const portfolio = db.portfolios.find(p => p.id === body.portfolio_id);
      if (!portfolio) return sendJson(res, 404, { error: 'תיק לא נמצא' });
      if (user.role === 'client' && portfolio.user_id !== user.id) return sendJson(res, 403, { error: 'אין הרשאה לתיק זה' });
      
      const actionType = body.action_type;
      const price = parseFloat(body.price || 0);
      const qty = parseFloat(body.quantity || 0);
      
      if (actionType === 'buy') {
        const totalCost = qty * price;
        if ((portfolio.cash_balance || 0) < totalCost) {
          return sendJson(res, 400, { error: 'אין מספיק יתרה: אין לך מספיק יתרת מזומן פנויה לביצוע עסקה זו' });
        }
        portfolio.cash_balance = (portfolio.cash_balance || 0) - totalCost;
      } else if (actionType === 'withdraw') {
        if ((portfolio.cash_balance || 0) < price) {
          return sendJson(res, 400, { error: 'אין מספיק יתרה: אין לך מספיק יתרת מזומן פנויה לביצוע משיכה זו' });
        }
        portfolio.cash_balance = (portfolio.cash_balance || 0) - price;
      } else if (actionType === 'deposit') {
        portfolio.cash_balance = (portfolio.cash_balance || 0) + price;
      } else if (actionType === 'sell') {
        const totalGain = qty * price;
        portfolio.cash_balance = (portfolio.cash_balance || 0) + totalGain;
      }
      
      const tx = {
        id: uid('tx'),
        portfolio_id: body.portfolio_id,
        ticker: body.ticker || null,
        action_type: actionType,
        quantity: qty,
        price: price,
        transaction_date: body.transaction_date || new Date().toISOString(),
        created_by_user_id: user.id
      };
      
      db.transactions.push(tx);
      writeDb(db);
      return sendJson(res, 201, { transaction: tx });
    }
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'גישה למנהלים בלבד' });
    const body = await readBody(req);
    if (!body.image) return sendJson(res, 400, { error: 'נא לספק תמונה' });
    
    try {
      const uploadsDir = path.join(PUBLIC, 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      
      const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
      const filePath = path.join(uploadsDir, filename);
      
      fs.writeFileSync(filePath, buffer);
      return sendJson(res, 200, { url: `/uploads/${filename}` });
    } catch (e) {
      return sendJson(res, 500, { error: 'שגיאה בעיבוד התמונה' });
    }
  }

  if ((pathname === '/api/tips' || pathname === '/api/recommendations') && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    
    if (isPgActive) {
      try {
        let tips = [];
        if (user.role === 'admin') {
          const tipsRes = await pool.query('SELECT * FROM tips');
          tips = tipsRes.rows;
        } else {
          const tipsRes = await pool.query(
            'SELECT * FROM tips WHERE target_user_id IS NULL OR target_user_id = $1',
            [user.id]
          );
          tips = tipsRes.rows;
        }
        
        const tipsMapped = tips.map(t => ({
          id: t.id,
          ticker: t.ticker,
          content: t.content,
          recommender: t.recommender,
          target_user_id: t.target_user_id,
          is_read: t.is_read || false,
          image_url: t.image_url,
          date: t.date ? new Date(t.date).toISOString().split('T')[0] : null
        }));
        
        return sendJson(res, 200, { tips: tipsMapped });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      const tips = db.tips.map(t => ({ 
        id: t.id, 
        advisor_id: t.advisor_id, 
        recommender: t.recommender || (t.id === 't5' || t.id === 't6' ? 'ai' : 'avi'), 
        ticker: t.ticker, 
        content: t.content, 
        target_user_id: t.target_user_id || null,
        is_read: t.is_read || false,
        created_at: t.created_at || null,
        timestamp: t.timestamp || null,
        image_url: t.image_url || null,
        date: t.date || t.created_at?.split('T')[0] 
      }));
      return sendJson(res, 200, { tips });
    }
  }

  if ((pathname === '/api/tips' || pathname === '/api/recommendations') && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const body = await readBody(req);
    
    if (!body.content?.trim()) {
      return sendJson(res, 400, { error: 'נא להזין תוכן להמלצה' });
    }
    
    const isClientMessage = body.recommender === 'client';
    if (user.role !== 'admin' && !isClientMessage) {
      return sendJson(res, 403, { error: 'גישה למנהלים בלבד' });
    }
    if (user.role === 'client' && body.target_user_id !== user.id) {
      return sendJson(res, 403, { error: 'אין הרשאה לשלוח הודעה למשתמש אחר' });
    }
    
    const targetUserId = body.target_user_id || null;
    const dateStr = new Date().toISOString();
    
    let notifTitle = '';
    let notifBody = '';
    let targetUser = targetUserId;

    if (body.recommender === 'client') {
      notifTitle = `התקבלה הודעה חדשה מ-${user.name}`;
      notifBody = body.content.trim();
      targetUser = 'u_admin_avi';
    } else if (targetUserId) {
      notifTitle = 'הודעה אישית מאבי';
      notifBody = 'התקבלה המלצה חדשה המותאמת אישית לתיק ההשקעות שלך. לחץ לצפייה.';
    } else {
      notifTitle = 'עדכון חדש בקהילה';
      notifBody = 'התקבלה המלצה חדשה בקהילת ההשקעות';
    }
    
    if (isPgActive) {
      try {
        const tipId = uid('tip');
        await pool.query(`
          INSERT INTO tips (id, ticker, content, recommender, target_user_id, image_url, date, is_read)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          tipId,
          body.ticker ? body.ticker.toUpperCase() : null,
          body.content.trim(),
          body.recommender || 'avi',
          targetUserId,
          body.image_url || null,
          dateStr,
          false
        ]);
        
        const newTip = {
          id: tipId,
          ticker: body.ticker || null,
          content: body.content.trim(),
          recommender: body.recommender || 'avi',
          target_user_id: targetUserId,
          image_url: body.image_url || null,
          date: dateStr.split('T')[0]
        };
        
        // Auto Push Notifications logic
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            const notifId = uid('notif');
            await pool.query(`
              INSERT INTO notifications (id, user_id, title, body, created_at)
              VALUES ($1, $2, $3, $4, $5)
            `, [notifId, targetUser, notifTitle, notifBody, dateStr]);
            
            let targets = [];
            if (targetUser) {
              const subRes = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1', [targetUser]);
              targets = subRes.rows;
            } else {
              const subRes = await pool.query('SELECT * FROM subscriptions WHERE user_id != $1', ['u_admin_avi']);
              targets = subRes.rows;
            }
            
            for (const s of targets) {
              sendFcmNotification(s.fcm_token, notifTitle, notifBody, '/icons/icon-192x192.png')
                .then(res => {
                  if (res.invalidToken) {
                    pool.query('DELETE FROM subscriptions WHERE id = $1', [s.id]).catch(() => {});
                  }
                }).catch(() => {});
            }
          } catch (pushErr) {
            console.error('[Push Error] Failed to send automated tip push:', pushErr.message);
          }
        }
        
        return sendJson(res, 201, { tip: newTip });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      const tip = {
        id: uid('t'),
        advisor_id: user.role === 'admin' ? user.id : 'u_admin_avi',
        recommender: body.recommender || 'avi',
        ticker: body.ticker ? body.ticker.toUpperCase() : null,
        content: body.content.trim(),
        target_user_id: targetUserId,
        is_read: false,
        created_at: dateStr,
        timestamp: Date.now(),
        image_url: body.image_url || null,
        date: dateStr.split('T')[0]
      };
      db.tips.push(tip);
      writeDb(db);
      
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          const newNotif = {
            id: uid('nt'),
            user_id: targetUser,
            title: notifTitle,
            body: notifBody,
            created_at: dateStr,
            read_by: []
          };
          db.notifications = db.notifications || [];
          db.notifications.push(newNotif);
          writeDb(db);
          
          let targets = [];
          if (targetUser) {
            targets = db.subscriptions.filter(s => s.user_id === targetUser);
          } else {
            targets = db.subscriptions.filter(s => s.user_id !== 'u_admin_avi');
          }
          
          for (const s of targets) {
            sendFcmNotification(s.fcm_token, newNotif.title, newNotif.body, '/icons/icon-192x192.png')
              .then(res => {
                if (res.invalidToken) {
                  const innerDb = readDb();
                  innerDb.subscriptions = innerDb.subscriptions.filter(x => x.id !== s.id);
                  writeDb(innerDb);
                }
              }).catch(() => {});
          }
        } catch (pushErr) {
          console.error('[Push Error] Failed to send automated tip push:', pushErr.message);
        }
      }
      
      return sendJson(res, 201, { tip });
    }
  }

  if (pathname.startsWith('/api/tips/') && req.method === 'DELETE') {
    if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'גישה למנהלים בלבד' });
    const parts = pathname.split('/');
    const tipId = parts[parts.length - 1];
    
    if (isPgActive) {
      try {
        const delRes = await pool.query('DELETE FROM tips WHERE id = $1', [tipId]);
        if (delRes.rowCount === 0) return sendJson(res, 404, { error: 'ההמלצה לא נמצאה' });
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      const initialLen = db.tips.length;
      db.tips = db.tips.filter(t => t.id !== tipId);
      
      if (db.tips.length === initialLen) {
        return sendJson(res, 404, { error: 'ההמלצה לא נמצאה' });
      }
      
      writeDb(db);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/notifications/firebase-config' && req.method === 'GET') {
    return sendJson(res, 200, {
      apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCU1ANCETIoZxieZIoNMhnA-zl3jhyzv0U',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'portfoliopulse-22795.firebaseapp.com',
      projectId: process.env.FIREBASE_PROJECT_ID || 'portfoliopulse-22795',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'portfoliopulse-22795.firebasestorage.app',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '279949836627',
      appId: process.env.FIREBASE_APP_ID || '1:279949836627:web:ec383103a14201373721a6',
      vapidKey: process.env.FIREBASE_VAPID_KEY || 'BIXn8e91UdT-ayEW2x4qaLDQpLo5oWTkRjhCIPNpuYBPYMaSyN6tl42uSUtHJ0j3Eze2pFUQRigqbjLZMK3KKgE'
    });
  }

  if (pathname === '/api/notifications/my-token' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    
    if (isPgActive) {
      try {
        const subRes = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1', [user.id]);
        const sub = subRes.rows[0];
        return sendJson(res, 200, { fcm_token: sub ? sub.fcm_token : null });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      db.subscriptions = db.subscriptions || [];
      const sub = db.subscriptions.find(s => s.user_id === user.id);
      return sendJson(res, 200, { fcm_token: sub ? sub.fcm_token : null });
    }
  }

  if (
    ((pathname === '/api/notifications/subscribe' || pathname === '/api/save-fcm-token') && req.method === 'POST') ||
    (pathname === '/api/update-token' && req.method === 'PUT')
  ) {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const body = await readBody(req);
    const { fcm_token } = body;
    
    if (isPgActive) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM subscriptions WHERE user_id = $1', [user.id]);
        if (fcm_token) {
          const subId = uid('sub');
          await client.query(
            'INSERT INTO subscriptions (id, user_id, fcm_token) VALUES ($1, $2, $3)',
            [subId, user.id, fcm_token]
          );
        }
        await client.query('COMMIT');
        client.release();
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        await client.query('ROLLBACK');
        client.release();
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      db.subscriptions = db.subscriptions || [];
      db.subscriptions = db.subscriptions.filter(s => s.user_id !== user.id);
      
      if (fcm_token) {
        db.subscriptions.push({
          id: uid('sub'),
          user_id: user.id,
          fcm_token: fcm_token,
          created_at: new Date().toISOString()
        });
      }
      writeDb(db);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/notifications/poll' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    
    if (isPgActive) {
      try {
        const pendingRes = await pool.query(`
          SELECT n.* FROM notifications n
          WHERE (n.user_id IS NULL OR n.user_id = $1)
            AND NOT EXISTS (
              SELECT 1 FROM notification_reads nr
              WHERE nr.notification_id = n.id AND nr.user_id = $1
            )
        `, [user.id]);
        
        const pending = pendingRes.rows;
        for (const n of pending) {
          await pool.query(
            'INSERT INTO notification_reads (notification_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [n.id, user.id]
          );
        }
        
        return sendJson(res, 200, { 
          notifications: pending.map(n => ({ 
            id: n.id, 
            title: n.title, 
            body: n.body, 
            date: n.created_at ? new Date(n.created_at).toISOString().split('T')[0] : null
          })) 
        });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    } else {
      const db = readDb();
      db.notifications = db.notifications || [];
      
      const pending = db.notifications.filter(n => {
        const isTargeted = n.user_id === user.id || n.user_id === null;
        const isRead = n.read_by.includes(user.id);
        return isTargeted && !isRead;
      });
      
      for (const n of pending) {
        n.read_by.push(user.id);
      }
      
      if (pending.length > 0) {
        writeDb(db);
      }
      return sendJson(res, 200, { notifications: pending });
    }
  }

  if (pathname === '/api/market/prices' && req.method === 'GET') {
    const tickers = (query.get('tickers') || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const prices = {};
    await Promise.all(tickers.map(async (ticker) => {
      try {
        const data = await fetchYahooChart(ticker);
        if (data) prices[ticker] = data;
      } catch (e) {
        console.log(`[Market Prices API] Failed to fetch price for ${ticker}:`, e.message);
      }
    }));
    let usdToIls = 3.75;
    try {
      const fx = await fetchYahooChart('ILS=X');
      if (fx?.price) usdToIls = fx.price;
    } catch (e) {
      console.log('[Market Prices API] Failed to fetch USD/ILS exchange rate:', e.message);
    }
    return sendJson(res, 200, { prices, usdToIls });
  }

  if (pathname === '/api/market/search' && req.method === 'GET') {
    const q = (query.get('q') || '').trim().toLowerCase();
    try {
      const resData = await fetchYahooSearch(q);
      const quotes = (resData && resData.quotes || [])
        .slice(0, 12)
        .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, quoteType: x.quoteType }));
      return sendJson(res, 200, { quotes });
    } catch (e) {
      return sendJson(res, 502, { error: e.message, quotes: [] });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    console.log(`[Request] ${req.method} ${pathname}`);

    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname, url.searchParams);
    }

    if (pathname === '/firebase-messaging-sw.js') {
      const swPath = path.join(PUBLIC, 'firebase-messaging-sw.js');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(swPath).pipe(res);
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    const filePath = path.normalize(path.join(PUBLIC, pathname));
    if (!filePath.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'Forbidden' });
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveStatic(req, res, filePath);
    }
    return serveStatic(req, res, path.join(PUBLIC, 'index.html'));
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

function startDailyAITipsCron() {
  let lastGeneratedDate = '';
  
  setInterval(async () => {
    try {
      const now = new Date();
      const jerusalemStr = now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" });
      const jerusalemDate = new Date(jerusalemStr);
      
      const hours = jerusalemDate.getHours();
      const minutes = jerusalemDate.getMinutes();
      const dateKey = jerusalemDate.toISOString().split('T')[0];
      
      if (hours === 8 && minutes === 0 && lastGeneratedDate !== dateKey) {
        lastGeneratedDate = dateKey;
        console.log(`[Cron] Triggering daily AI tips generation for Jerusalem time: ${jerusalemStr}`);
        const db = readDb();
        await generateDailyAITips(db);
      }
    } catch (err) {
      console.error('[Cron Error] Failed to run daily AI tips checker:', err.message);
    }
  }, 30000); // check every 30 seconds
}

function startStockPricesCron() {
  setInterval(async () => {
    try {
      await updateAllStockPricesJob();
    } catch (err) {
      console.error('[Cron Error] Failed to trigger periodic stock update job:', err.message);
    }
  }, 2 * 60 * 1000); // Check and update every 2 minutes
}

server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    
    let userId = null;
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      userId = url.searchParams.get('userId');
    } catch (e) {
      console.error('[WS Upgrade] Failed to parse URL:', e.message);
    }
    
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    
    const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
    );
    
    if (!activeSockets.has(userId)) {
      activeSockets.set(userId, new Set());
    }
    activeSockets.get(userId).add(socket);
    console.log(`[WS] User ${userId} connected. Total active users: ${activeSockets.size}`);
    
    let buffer = Buffer.alloc(0);
    
    socket.on('data', async (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const frame = decodeWSFrame(buffer);
        if (!frame) break;
        
        buffer = buffer.slice(frame.totalLength);
        
        if (frame.opcode === 8) {
          socket.end();
          break;
        }
        
        if (frame.opcode === 1) {
          const msgText = frame.payload.toString('utf8');
          try {
            const msg = JSON.parse(msgText);
            if (msg.type === 'ping') {
              socket.write(encodeWSFrame(JSON.stringify({ type: 'pong' })));
            } else if (msg.type === 'mark_as_read') {
              if (isPgActive) {
                try {
                  const updateRes = await pool.query(
                    "UPDATE tips SET is_read = true WHERE target_user_id = $1 AND recommender = 'avi' AND is_read = false",
                    [msg.userId]
                  );
                  if (updateRes.rowCount > 0) {
                    sendWebSocketMessage('u_admin_avi', {
                      type: 'messages_read',
                      userId: msg.userId
                    });
                  }
                } catch (wsErr) {
                  console.error('[WS Error] Failed to update read messages in PostgreSQL:', wsErr.message);
                }
              } else {
                const db = readDb();
                let updated = false;
                db.tips = db.tips || [];
                db.tips.forEach(t => {
                  if (t.target_user_id === msg.userId && t.recommender === 'avi' && !t.is_read) {
                    t.is_read = true;
                    updated = true;
                  }
                });
                if (updated) {
                  writeDb(db);
                  sendWebSocketMessage('u_admin_avi', {
                    type: 'messages_read',
                    userId: msg.userId
                  });
                }
              }
            }
          } catch (e) {
            console.error('[WS Message] Error processing text frame:', e.message);
          }
        }
      }
    });
    
    socket.on('close', () => {
      const userSockets = activeSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket);
        if (userSockets.size === 0) {
          activeSockets.delete(userId);
        }
      }
      console.log(`[WS] User ${userId} disconnected. Total active users: ${activeSockets.size}`);
    });
    
    socket.on('error', (err) => {
      console.error(`[WS Socket Error] user: ${userId}, error:`, err.message);
      socket.destroy();
    });
  } else {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  }
});

startDailyAITipsCron();
startStockPricesCron();
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`\n  PortfolioPulse AI running at http://localhost:${PORT}\n`);
    console.log(`  Admin: aviariel91@gmail.com / AVIm76543\n`);
  });
}).catch(err => {
  console.error('[Database Error] Failed to initialize database on startup:', err);
  process.exit(1);
});
