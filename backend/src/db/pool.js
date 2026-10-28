const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://iac:iacpass@localhost:5432/iacdrift',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for Postgres to accept connections (needed under docker-compose), then apply schema. */
async function initDb(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`[db] waiting for database (${i}/${retries})...`);
      await sleep(1000);
    }
  }
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('[db] schema ready');
}

module.exports = { pool, initDb };
