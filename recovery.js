const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data', 'db.json');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/portfolio_pulse';
console.log(`[Recovery] Database connection string: ${connectionString}`);

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function runRecovery() {
  console.log('[Recovery] Starting safe holdings & shares recovery process...');

  if (!fs.existsSync(DB_FILE)) {
    console.error('[Recovery Error] Local flat db.json file not found at:', DB_FILE);
    process.exit(1);
  }

  let db;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(raw);
  } catch (err) {
    console.error('[Recovery Error] Failed to parse db.json:', err.message);
    process.exit(1);
  }

  const jsonTransactions = db.transactions || [];
  console.log(`[Recovery] Found ${jsonTransactions.length} transactions in the JSON file.`);

  const client = await pool.connect();
  try {
    // 1. Ensure all database tables exist
    await client.query('BEGIN');
    
    console.log('[Recovery] Verifying schema and checking existing transactions in database...');
    
    // Fetch all existing transaction IDs from PostgreSQL
    const existingTxRes = await client.query('SELECT id FROM transactions');
    const existingTxIds = new Set(existingTxRes.rows.map(r => r.id));
    console.log(`[Recovery] Found ${existingTxIds.size} transactions already in PostgreSQL.`);

    // Filter transactions that exist in JSON but are missing in DB
    const missingTx = jsonTransactions.filter(tx => !existingTxIds.has(tx.id));
    console.log(`[Recovery] Identified ${missingTx.length} transactions to recover.`);

    let insertedCount = 0;
    const recoveredHoldings = [];

    for (const tx of missingTx) {
      // Ensure user and portfolio exist in DB to prevent foreign key constraint violations
      const userRes = await client.query('SELECT id FROM users WHERE id = $1', [tx.created_by_user_id]);
      if (userRes.rows.length === 0) {
        // Try to recover the user from JSON
        const jsonUser = db.users.find(u => u.id === tx.created_by_user_id);
        if (jsonUser) {
          console.log(`[Recovery] Restoring missing user profile for ${jsonUser.email} (${jsonUser.id})...`);
          await client.query(`
            INSERT INTO users (id, name, email, password_hash, role, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
          `, [
            jsonUser.id, 
            jsonUser.name, 
            jsonUser.email.trim().toLowerCase(), 
            jsonUser.password_hash, 
            jsonUser.role, 
            jsonUser.is_active !== false, 
            jsonUser.created_at || new Date().toISOString()
          ]);
        }
      }

      const portRes = await client.query('SELECT id FROM portfolios WHERE id = $1', [tx.portfolio_id]);
      if (portRes.rows.length === 0) {
        // Try to recover the portfolio from JSON
        const jsonPort = db.portfolios.find(p => p.id === tx.portfolio_id);
        if (jsonPort) {
          console.log(`[Recovery] Restoring missing portfolio ${jsonPort.name} (${jsonPort.id})...`);
          await client.query(`
            INSERT INTO portfolios (id, user_id, name, cash_balance, created_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING
          `, [
            jsonPort.id,
            jsonPort.user_id,
            jsonPort.name || 'תיק השקעות אישי',
            parseFloat(jsonPort.cash_balance || 0),
            jsonPort.created_at || new Date().toISOString()
          ]);
        }
      }

      // Insert transaction
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

      insertedCount++;
      if (tx.ticker) {
        recoveredHoldings.push({
          ticker: tx.ticker,
          quantity: tx.quantity,
          price: tx.price,
          type: tx.action_type
        });
      }
    }

    await client.query('COMMIT');

    console.log('\n==================================================');
    console.log('🎉 RECOVERY SUMMARY LOG');
    console.log('==================================================');
    console.log(`Total transactions parsed in JSON file:   ${jsonTransactions.length}`);
    console.log(`Transactions already existing in DB:     ${existingTxIds.size}`);
    console.log(`Transactions successfully recovered:     ${insertedCount}`);
    console.log('--------------------------------------------------');
    if (recoveredHoldings.length > 0) {
      console.log('📋 Recovered Stock Positions details:');
      recoveredHoldings.forEach(h => {
        console.log(`  - [${h.type.toUpperCase()}] Ticker: ${h.ticker.padEnd(7)} | Quantity: ${h.quantity.toString().padEnd(10)} | Price: $${h.price}`);
      });
    } else {
      console.log('No new stock positions needed recovery.');
    }
    console.log('==================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Recovery Error] Transaction rolled back due to error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runRecovery();
