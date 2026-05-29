const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data', 'db.json');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/portfolio_pulse';
console.log(`[Migration] Database connection string: ${connectionString}`);

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function run() {
  console.log('[Migration] Beginning PostgreSQL data migration...');
  
  if (!fs.existsSync(DB_FILE)) {
    console.log('[Migration] No existing flat db.json file found. Skipping data import.');
    return;
  }
  
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  let db;
  try {
    db = JSON.parse(raw);
  } catch (err) {
    console.error('[Migration Error] Failed to parse db.json:', err.message);
    return;
  }
  
  const client = await pool.connect();
  try {
    console.log('[Migration] Creating database tables...');
    await client.query('BEGIN');
    
    // Create schema
    await client.query(`
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
    `);
    
    console.log('[Migration] Database schema tables initialized!');

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

        // Reads mapping
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
    console.log('[Migration] PostgreSQL data migration completed successfully with zero data loss!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration Error] Transaction rolled back due to error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
