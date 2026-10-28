const express = require('express');
const cors = require('cors');
const { initDb, pool } = require('./db/pool');
const routes = require('./api/routes');
const provider = require('./mockcloud');
const { runScan } = require('./scanService');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Consistent error shape
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function main() {
  await initDb();
  // Run one scan on first boot so the dashboard is populated immediately.
  if (process.env.AUTO_SCAN !== 'false') {
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM scan');
    if (n === 0) {
      const r = await runScan(provider);
      console.log(`[boot] initial scan #${r.scanId}: ${r.driftCount} drift findings`, r.byLevel);
    }
  }
  app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = app;
