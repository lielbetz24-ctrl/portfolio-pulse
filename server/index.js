const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

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

function sendFcmNotification(token, title, body, icon) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    console.warn('[FCM] FIREBASE_SERVER_KEY is not defined. Skipping notification.');
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
        console.log(`[FCM Service] Request status: ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(resBody);
            if (parsed.results && parsed.results[0] && parsed.results[0].error) {
              const fcmError = parsed.results[0].error;
              console.warn(`[FCM Service] Delivery failed with error: ${fcmError}`);
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
      console.error('[FCM Service] Connection error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(payloadString);
    req.end();
  });
}

async function triggerFcmNotification(db, targetUserId, title, body) {
  db.subscriptions = db.subscriptions || [];
  let targets = [];
  
  if (targetUserId) {
    targets = db.subscriptions.filter(s => s.user_id === targetUserId);
  } else {
    targets = db.subscriptions.filter(s => s.user_id !== 'u_admin_avi');
  }

  console.log(`[FCM Trigger] Dispatching push to ${targets.length} tokens for target: ${targetUserId || 'all clients'}`);
  
  const icon = 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png';
  
  const promises = targets.map(subRecord => {
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
  db.tips.push(
    { id: 't1', advisor_id: adminId, recommender: 'avi', ticker: 'NVDA', content: 'מניית אנבידיה (NVDA) נסחרת במכפיל רווח גבוה. אם היא מעל 25% מהתיק — שקול מימוש רווחים חלקי.', date: new Date().toISOString().split('T')[0] },
    { id: 't2', advisor_id: adminId, recommender: 'avi', ticker: 'AAPL', content: 'אפל (AAPL) מציגה יציבות פיננסית חזקה. מניית עוגן מתאימה לתקופות אי-ודאות.', date: new Date().toISOString().split('T')[0] },
    { id: 't5', advisor_id: adminId, recommender: 'ai', ticker: null, content: 'שמירה על 10%-15% מזומן בתיק מאפשרת לנצל ירידות שערים ללא מכירה בהפסד.', date: new Date().toISOString().split('T')[0] },
    { id: 't6', advisor_id: adminId, recommender: 'ai', ticker: null, content: 'ביזור: הימנע מחשיפה מעל 20% למניה בודדת, ופזר בין סקטורים שונים.', date: new Date().toISOString().split('T')[0] }
  );
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
  const today = new Date().toISOString().split('T')[0];
  const aiTips = db.tips.filter(t => t.date === today && t.recommender === 'ai');
  
  if (aiTips.length >= 3) {
    return; // Already generated for today
  }
  
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
    const { name, email, password } = body;
    if (!name || !email || !password) return sendJson(res, 400, { error: 'נא למלא שם, אימייל וסיסמה' });
    if (password.length < 6) return sendJson(res, 400, { error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
    const db = readDb();
    const em = email.trim().toLowerCase();
    if (db.users.some(u => u.email === em)) return sendJson(res, 409, { error: 'כתובת האימייל כבר רשומה במערכת' });
    const userRole = resolveRoleByEmail(em);
    const id = uid('u');
    db.users.push({ id, name: name.trim(), email: em, password_hash: hashPassword(password), role: userRole, is_active: true, created_at: new Date().toISOString() });
    if (userRole === 'client') {
      db.portfolios.push({ id: uid('p'), user_id: id, name: 'תיק השקעות אישי', cash_balance: 0, created_at: new Date().toISOString() });
    }
    writeDb(db);
    const u = publicUser(db.users.find(x => x.id === id));
    return sendJson(res, 201, { user: u, token: signToken(u) });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const db = readDb();
    const row = db.users.find(u => u.email === (body.email || '').trim().toLowerCase() && u.is_active);
    if (!row || !verifyPassword(body.password || '', row.password_hash)) {
      return sendJson(res, 401, { error: 'אימייל או סיסמה שגויים' });
    }
    const u = publicUser(row);
    return sendJson(res, 200, { user: u, token: signToken(u) });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const db = readDb();
    const row = db.users.find(u => u.id === user.id);
    if (!row) return sendJson(res, 401, { error: 'משתמש לא נמצא' });
    return sendJson(res, 200, { user: publicUser(row) });
  }

  if (pathname === '/api/sync' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
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
    
    // Compile current cached prices from PRICE_CACHE
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

  if (pathname === '/api/transactions' && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const body = await readBody(req);
    const db = readDb();
    const portfolio = db.portfolios.find(p => p.id === body.portfolio_id);
    if (!portfolio) return sendJson(res, 404, { error: 'תיק לא נמצא' });
    if (user.role === 'client' && portfolio.user_id !== user.id) return sendJson(res, 403, { error: 'אין הרשאה לתיק זה' });
    
    const actionType = body.action_type;
    const price = parseFloat(body.price || 0);
    const qty = parseFloat(body.quantity || 0);
    
    // Strict Cash Validation & Deduction for BUY
    if (actionType === 'buy') {
      const totalCost = qty * price;
      if ((portfolio.cash_balance || 0) < totalCost) {
        return sendJson(res, 400, { error: 'אין מספיק יתרה: אין לך מספיק יתרת מזומן פנויה לביצוע עסקה זו' });
      }
      portfolio.cash_balance = (portfolio.cash_balance || 0) - totalCost;
    }
    
    // Strict Cash Validation & Deduction for WITHDRAW
    else if (actionType === 'withdraw') {
      if ((portfolio.cash_balance || 0) < price) {
        return sendJson(res, 400, { error: 'אין מספיק יתרה: אין לך מספיק יתרת מזומן פנויה לביצוע משיכה זו' });
      }
      portfolio.cash_balance = (portfolio.cash_balance || 0) - price;
    }
    
    // Add cash on DEPOSIT
    else if (actionType === 'deposit') {
      portfolio.cash_balance = (portfolio.cash_balance || 0) + price;
    }
    
    // Add cash on SELL
    else if (actionType === 'sell') {
      const totalGain = qty * price;
      portfolio.cash_balance = (portfolio.cash_balance || 0) + totalGain;
    }
    
    // For actionType === 'holding', it does not affect cash balance (tracking only).
    
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

  if (pathname === '/api/upload' && req.method === 'POST') {
    if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'גישה למנהלים בלבד' });
    const body = await readBody(req);
    if (!body.image) return sendJson(res, 400, { error: 'נא לספק תמונה' });
    
    try {
      const uploadsDir = path.join(PUBLIC, 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      
      const base64Data = body.image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
      const filePath = path.join(uploadsDir, filename);
      
      fs.writeFileSync(filePath, buffer);
      return sendJson(res, 200, { url: `/uploads/${filename}` });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (pathname === '/api/tips' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
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
    return sendJson(res, 200, { tips });
  }

  if (pathname === '/api/tips' && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const body = await readBody(req);
    if (!body.content?.trim()) return sendJson(res, 400, { error: 'נא להזין תוכן להמלצה' });
    
    const isClientMessage = body.recommender === 'client';
    if (user.role !== 'admin' && !isClientMessage) {
      return sendJson(res, 403, { error: 'גישה למנהלים בלבד' });
    }
    
    // Ensure client can only message/reply to themselves
    if (user.role === 'client' && body.target_user_id !== user.id) {
      return sendJson(res, 403, { error: 'אין הרשאה לשלוח הודעה למשתמש אחר' });
    }

    const db = readDb();
    const targetUserId = body.target_user_id || null;
    const tip = {
      id: uid('t'),
      advisor_id: user.role === 'admin' ? user.id : 'u_admin_avi',
      recommender: body.recommender || 'avi',
      ticker: body.ticker ? body.ticker.toUpperCase() : null,
      content: body.content.trim(),
      target_user_id: targetUserId,
      is_read: false,
      created_at: new Date().toISOString(),
      timestamp: Date.now(),
      image_url: body.image_url || null,
      date: new Date().toISOString().split('T')[0]
    };
    db.tips.push(tip);

    // Trigger push notification by category
    let notifTitle = '';
    let notifBody = '';
    let targetUser = targetUserId;

    if (body.recommender === 'client') {
      notifTitle = `התקבלה הודעה חדשה מ-${user.name}`;
      notifBody = body.content.trim();
      targetUser = 'u_admin_avi'; // Send notification to Avi
    } else if (targetUserId) {
      notifTitle = 'הודעה אישית מאבי';
      notifBody = 'התקבלה המלצה חדשה המותאמת אישית לתיק ההשקעות שלך. לחץ לצפייה.';
    } else {
      notifTitle = 'עדכון חדש בקהילה';
      notifBody = 'התקבלה המלצה חדשה בקהילת ההשקעות';
    }

    const newNotif = {
      id: uid('nt'),
      user_id: targetUser,
      title: notifTitle,
      body: notifBody,
      created_at: new Date().toISOString(),
      read_by: []
    };
    db.notifications = db.notifications || [];
    db.notifications.push(newNotif);

    writeDb(db);

    // Trigger Firebase Cloud Messaging Notification asynchronously
    triggerFcmNotification(db, targetUser, notifTitle, notifBody)
      .catch(err => console.error('[FCM Trigger] Async FCM notification error:', err));

    // Dynamic real-time WebSockets event triggering
    if (body.recommender === 'client') {
      // Broadcast reply to Admin Avi
      sendWebSocketMessage('u_admin_avi', {
        type: 'new_message_to_advisor',
        data: {
          ...tip,
          sender_name: user.name
        }
      });
    } else {
      // Advisor recommendation
      if (targetUserId) {
        // Direct personal tip to a single client
        sendWebSocketMessage(targetUserId, {
          type: 'new_message_to_client',
          data: tip
        });
      } else {
        // Public community tip to all connected users
        for (const uid of activeSockets.keys()) {
          sendWebSocketMessage(uid, {
            type: 'new_message_to_client',
            data: tip
          });
        }
      }
    }

    return sendJson(res, 201, { tip });
  }

  const tipDelete = pathname.match(/^\/api\/tips\/(.+)$/);
  if (tipDelete && req.method === 'DELETE') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'גישה למנהלים בלבד' });
    const db = readDb();
    db.tips = db.tips.filter(t => t.id !== tipDelete[1]);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  const chartMatch = pathname.match(/^\/api\/market\/chart\/(.+)$/);
  if (chartMatch && req.method === 'GET') {
    try {
      const data = await fetchYahooChart(decodeURIComponent(chartMatch[1]));
      if (!data) return sendJson(res, 404, { error: 'לא נמצאו נתונים' });
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  if (pathname === '/api/market/prices' && req.method === 'GET') {
    const tickers = (query.get('tickers') || '').split(',').map(t => t.trim()).filter(Boolean);
    const prices = {};
    await Promise.all(tickers.map(async (ticker) => {
      try {
        const data = await fetchYahooChart(ticker);
        if (data) prices[ticker.toUpperCase()] = data;
      } catch { /* skip */ }
    }));
    let usdToIls = 3.75;
    try {
      const fx = await fetchYahooChart('ILS=X');
      if (fx?.price) usdToIls = fx.price;
    } catch { /* keep default */ }
    return sendJson(res, 200, { prices, usdToIls });
  }

  if (pathname === '/api/market/search' && req.method === 'GET') {
    const q = query.get('q');
    if (!q || q.length < 2) return sendJson(res, 200, { quotes: [] });
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioPulse/1.0)' } });
      const data = await response.json();
      const quotes = (data.quotes || [])
        .filter(x => x.quoteType === 'EQUITY' || x.quoteType === 'ETF')
        .slice(0, 12)
        .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, quoteType: x.quoteType }));
      return sendJson(res, 200, { quotes });
    } catch (e) {
      return sendJson(res, 502, { error: e.message, quotes: [] });
    }
  }

  if (pathname === '/api/notifications/firebase-config' && req.method === 'GET') {
    return sendJson(res, 200, {
      apiKey: process.env.FIREBASE_API_KEY || 'mock-api-key',
      projectId: process.env.FIREBASE_PROJECT_ID || 'mock-project-id',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'mock-sender-id',
      appId: process.env.FIREBASE_APP_ID || 'mock-app-id'
    });
  }

  if (pathname === '/api/notifications/subscribe' && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
    const body = await readBody(req);
    const { fcm_token } = body;
    if (!fcm_token) return sendJson(res, 400, { error: 'fcm_token missing' });

    const db = readDb();
    db.subscriptions = db.subscriptions || [];
    
    const idx = db.subscriptions.findIndex(s => s.user_id === user.id && s.fcm_token === fcm_token);
    if (idx === -1) {
      db.subscriptions.push({
        id: uid('sub'),
        user_id: user.id,
        fcm_token: fcm_token,
        created_at: new Date().toISOString()
      });
      writeDb(db);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/notifications/poll' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'נדרשת התחברות' });
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

  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    console.log(`[Request] ${req.method} ${pathname}`);

    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname, url.searchParams);
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
    
    socket.on('data', (chunk) => {
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
                // Broadcast message read event to advisor Avi
                sendWebSocketMessage('u_admin_avi', {
                  type: 'messages_read',
                  userId: msg.userId
                });
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

const db = readDb();
startDailyAITipsCron();
server.listen(PORT, () => {
  console.log(`\n  PortfolioPulse AI running at http://localhost:${PORT}\n`);
  console.log(`  Admin: aviariel91@gmail.com / AVIm76543\n`);
});
