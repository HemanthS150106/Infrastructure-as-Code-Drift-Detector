const express = require('express');
const { pool } = require('../db/pool');
const { logEvent } = require('../audit');
const provider = require('../mockcloud');
const { runScan } = require('../scanService');
const { assertRemediable, applyAction, RemediationBlockedError } = require('../remediation/remediation');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---- Scans ---------------------------------------------------------------
router.post('/scans', wrap(async (_req, res) => {
  res.status(201).json(await runScan(provider));
}));

router.get('/scans', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, started_at AS "startedAt", finished_at AS "finishedAt",
            resources_checked AS "resourcesChecked", drift_count AS "driftCount"
       FROM scan ORDER BY id DESC LIMIT 20`);
  res.json(rows);
}));

// ---- Drift (latest scan) ---------------------------------------------------
const DRIFT_SELECT = `
  SELECT d.id, d.scan_id AS "scanId", d.resource_key AS "resourceKey", d.resource_type AS "resourceType",
         d.field, d.change_type AS "changeType", d.declared_value AS "declaredValue", d.live_value AS "liveValue",
         d.risk_level AS "riskLevel", d.risk_score AS "riskScore", d.classifier, d.justification,
         d.status, d.detected_at AS "detectedAt",
         ra.id AS "remediationId", ra.description AS "remediationDescription", ra.status AS "remediationStatus"
    FROM drift_record d
    LEFT JOIN remediation_action ra ON ra.drift_id = d.id
   WHERE d.scan_id = (SELECT max(id) FROM scan)`;

router.get('/drift', wrap(async (req, res) => {
  const params = [];
  let sql = DRIFT_SELECT;
  if (req.query.risk) {
    params.push(String(req.query.risk).toUpperCase());
    sql += ` AND d.risk_level = $${params.length}`;
  }
  sql += ' ORDER BY d.risk_score DESC, d.resource_key, d.field';
  const { rows } = await pool.query(sql, params);
  res.json(rows.map((r) => ({
    ...r,
    // true only when a safe proposal exists and the drift is still open
    canRemediate: r.status === 'OPEN' && r.riskLevel === 'LOW' && r.remediationStatus === 'PROPOSED',
  })));
}));

router.get('/drift/summary', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT risk_level, count(*)::int AS n FROM drift_record
      WHERE scan_id = (SELECT max(id) FROM scan) AND status = 'OPEN' GROUP BY risk_level`);
  const byLevel = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  rows.forEach((r) => { byLevel[r.risk_level] = r.n; });
  res.json({ byLevel, totalOpen: Object.values(byLevel).reduce((a, b) => a + b, 0) });
}));

// ---- Remediation (risk-gated) -----------------------------------------------
router.post('/drift/:id/remediate', wrap(async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid drift id' });
  const approvedBy = (req.body && req.body.approvedBy) || 'anonymous';

  const { rows: [drift] } = await pool.query('SELECT * FROM drift_record WHERE id = $1', [id]);
  if (!drift) return res.status(404).json({ error: 'Drift record not found' });
  if (drift.status !== 'OPEN') return res.status(409).json({ error: `Drift is already ${drift.status}` });

  try {
    assertRemediable(drift);
  } catch (err) {
    if (err instanceof RemediationBlockedError) {
      await logEvent('REMEDIATION_BLOCKED', {
        entityType: 'drift', entityId: id,
        payload: { riskLevel: drift.risk_level, resource: drift.resource_key, field: drift.field, attemptedBy: approvedBy },
      });
      return res.status(403).json({ error: err.message, riskLevel: err.riskLevel });
    }
    throw err;
  }

  const { rows: [action] } = await pool.query(
    "SELECT * FROM remediation_action WHERE drift_id = $1 AND status = 'PROPOSED'", [id]);
  if (!action) return res.status(409).json({ error: 'No proposed remediation exists for this drift' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyAction(provider, action.payload);
    await client.query(
      "UPDATE remediation_action SET status='APPLIED', approved_by=$2, applied_at=now() WHERE id=$1",
      [action.id, approvedBy]);
    await client.query("UPDATE drift_record SET status='REMEDIATED' WHERE id=$1", [id]);
    await logEvent('REMEDIATION_APPLIED', {
      entityType: 'remediation', entityId: action.id,
      payload: { drift: id, description: action.description, approvedBy },
    }, client);
    await client.query('COMMIT');
    res.json({ status: 'REMEDIATED', description: action.description, approvedBy });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ---- Inventory & audit -------------------------------------------------------
router.get('/resources', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT resource_key AS "resourceKey", resource_type AS "resourceType", resource_id AS "resourceId",
            declared_state AS "declaredState", live_state AS "liveState", last_scanned AS "lastScanned"
       FROM managed_resource ORDER BY resource_key`);
  res.json(rows);
}));

router.get('/audit-log', wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const { rows } = await pool.query(
    `SELECT id, event_type AS "eventType", entity_type AS "entityType", entity_id AS "entityId",
            payload, created_at AS "createdAt"
       FROM audit_log ORDER BY id DESC LIMIT $1`, [limit]);
  res.json(rows);
}));

// ---- Demo helper: put the mock cloud back to its drifted seed state -----------------
router.post('/demo/reset', wrap(async (_req, res) => {
  await provider.reset();
  await logEvent('DEMO_RESET', { payload: { note: 'Mock cloud state reset to seed' } });
  res.json({ status: 'reset' });
}));

module.exports = router;
