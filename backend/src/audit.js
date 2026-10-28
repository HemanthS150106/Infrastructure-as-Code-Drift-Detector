const { pool } = require('./db/pool');

/** Append an audit event. Accepts an optional client so it can run inside a transaction. */
async function logEvent(eventType, { entityType = null, entityId = null, payload = {} } = {}, client = pool) {
  await client.query(
    `INSERT INTO audit_log (event_type, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [eventType, entityType, entityId, JSON.stringify(payload)]
  );
}

module.exports = { logEvent };
