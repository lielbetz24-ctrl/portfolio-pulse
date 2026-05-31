const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data', 'db.json');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/portfolio_pulse';
console.log(`[Inventory Sync] Connecting to: ${connectionString}`);

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[Inventory Sync Pool Error] Momentary connection loss or PostgreSQL error:', err.message);
});

// Default stock database from SEMANTIC_STOCK_DATABASE in app.js
const DEFAULT_CATALOG = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.' },
  { ticker: 'TSLA', name: 'Tesla Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corp.' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.' },
  { ticker: 'META', name: 'Meta Platforms Inc.' },
  { ticker: 'NFLX', name: 'Netflix Inc.' },
  { ticker: 'AMD', name: 'Advanced Micro Devices Inc.' },
  { ticker: 'INTC', name: 'Intel Corp.' },
  { ticker: 'TSM', name: 'Taiwan Semiconductor Manufacturing' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.' },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.' },
  { ticker: 'V', name: 'Visa Inc.' },
  { ticker: 'DIS', name: 'The Walt Disney Co.' },
  { ticker: 'SBUX', name: 'Starbucks Corp.' },
  { ticker: 'KO', name: 'The Coca-Cola Co.' },
  { ticker: 'NKE', name: 'Nike Inc.' },
  { ticker: 'XOM', name: 'Exxon Mobil Corp.' },
  { ticker: 'LLY', name: 'Eli Lilly & Co.' }
];

async function fetchYahooMetadata(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioPulse/1.0)' } });
    if (!response.ok) return null;
    const chartData = await response.json();
    if (!chartData?.chart?.result?.length) return null;
    const meta = chartData.chart.result[0].meta;
    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || 0;
    let change = 0;
    if (price && prevClose) change = ((price - prevClose) / prevClose) * 100;
    
    return {
      ticker: ticker.toUpperCase(),
      name: meta.longName || meta.shortName || ticker.toUpperCase(),
      price,
      change,
      currency: meta.currency || 'USD',
      previousClose: prevClose
    };
  } catch (e) {
    return null;
  }
}

async function runSync() {
  console.log('[Inventory Sync] Starting Full Inventory Sync...');

  if (!process.env.DATABASE_URL) {
    console.error('[Inventory Sync Error] DATABASE_URL environment variable is missing. Aborting sync to prevent local localhost connection attempts.');
    process.exit(1);
  }
  
  let client;
  const retries = 5;
  const delayMs = 5000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Inventory Sync] Connecting to PostgreSQL (Attempt ${attempt}/${retries})...`);
      client = await pool.connect();
      break;
    } catch (err) {
      console.error(`[Inventory Sync Warning] Connection attempt ${attempt} failed:`, err.message);
      if (attempt < retries) {
        console.log(`[Inventory Sync] Waiting ${delayMs / 1000} seconds before retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error('[Inventory Sync Error] All connection attempts failed. Exiting.');
        process.exit(1);
      }
    }
  }

  try {
    // 1. Get initial count in DB
    const beforeCountRes = await client.query('SELECT COUNT(*) FROM stocks');
    const beforeCount = parseInt(beforeCountRes.rows[0].count);
    
    // 2. Extract tickers from JSON db.json
    const tickersToSync = new Map(); // ticker -> name
    
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const db = JSON.parse(raw);
        
        // Extract from transactions
        if (db.transactions) {
          db.transactions.forEach(tx => {
            if (tx.ticker) {
              const ticker = tx.ticker.toUpperCase();
              tickersToSync.set(ticker, ticker);
            }
          });
        }
        
        // Extract from tips
        if (db.tips) {
          db.tips.forEach(tip => {
            if (tip.ticker) {
              const ticker = tip.ticker.toUpperCase();
              tickersToSync.set(ticker, ticker);
            }
          });
        }
        
        console.log(`[Inventory Sync] Found ${tickersToSync.size} unique tickers in transactions/tips inside db.json.`);
      } catch (err) {
        console.error('[Inventory Sync Warning] Failed to parse db.json:', err.message);
      }
    } else {
      console.log('[Inventory Sync] db.json not found, utilizing catalog defaults only.');
    }
    
    // Merge default catalog into tickers list
    DEFAULT_CATALOG.forEach(item => {
      const ticker = item.ticker.toUpperCase();
      if (!tickersToSync.has(ticker)) {
        tickersToSync.set(ticker, item.name);
      }
    });

    // Merge rich catalog from all_stocks.json if present
    const richCatalogPath = path.join(ROOT, 'data', 'all_stocks.json');
    if (fs.existsSync(richCatalogPath)) {
      try {
        const richRaw = fs.readFileSync(richCatalogPath, 'utf8');
        const richCatalog = JSON.parse(richRaw);
        console.log(`[Inventory Sync] Found rich catalog with ${richCatalog.length} stocks in all_stocks.json.`);
        richCatalog.forEach(item => {
          const ticker = item.ticker.toUpperCase();
          if (!tickersToSync.has(ticker)) {
            tickersToSync.set(ticker, item.name);
          }
        });
      } catch (richErr) {
        console.error('[Inventory Sync Warning] Failed to parse all_stocks.json:', richErr.message);
      }
    }
    
    console.log(`[Inventory Sync] Combined list has ${tickersToSync.size} unique stock tickers.`);
    
    // 3. For each ticker, check if exists in DB. If not, fetch details and insert!
    let addedCount = 0;
    const addedStocksList = [];
    
    for (const [ticker, defaultName] of tickersToSync.entries()) {
      // Check if ticker already exists in DB
      const existRes = await client.query('SELECT ticker FROM stocks WHERE ticker = $1', [ticker]);
      if (existRes.rows.length === 0) {
        console.log(`[Inventory Sync] Fetching live metadata for missing stock: ${ticker}...`);
        const liveData = await fetchYahooMetadata(ticker);
        
        const name = liveData ? liveData.name : defaultName;
        const price = liveData ? liveData.price : 0;
        const change = liveData ? liveData.change : 0;
        const currency = liveData ? liveData.currency : 'USD';
        const prevClose = liveData ? liveData.previousClose : 0;
        
        await client.query(`
          INSERT INTO stocks (ticker, name, price, change, currency, previous_close)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (ticker) DO NOTHING
        `, [ticker, name, price, change, currency, prevClose]);
        
        addedCount++;
        addedStocksList.push(`${ticker} (${name})`);
      }
    }
    
    // 4. Get final count
    const afterCountRes = await client.query('SELECT COUNT(*) FROM stocks');
    const afterCount = parseInt(afterCountRes.rows[0].count);
    
    console.log('\n==================================================');
    console.log('🎉 FULL INVENTORY SYNC SUMMARY REPORT');
    console.log('==================================================');
    console.log(`Stocks in database BEFORE sync:    ${beforeCount}`);
    console.log(`Stocks in database AFTER sync:     ${afterCount}`);
    console.log(`New stock symbols added:           ${addedCount}`);
    console.log('--------------------------------------------------');
    if (addedCount > 0) {
      console.log('📋 Added stocks:');
      addedStocksList.forEach(item => console.log(`  - ${item}`));
    } else {
      console.log('All stock symbols were already populated in PostgreSQL.');
    }
    console.log('==================================================\n');
    
  } catch (err) {
    console.error('[Inventory Sync Error] Failed to run sync script:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runSync();
