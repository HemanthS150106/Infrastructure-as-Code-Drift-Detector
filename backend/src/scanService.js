const { pool } = require('./db/pool');
const { logEvent } = require('./audit');
const { loadDeclaredState } = require('./driftengine/tfstate');
const { computeDrift } = require('./driftengine/diff');
const { classify } = require('./riskengine');
const { proposeFor } = require('./remediation/remediation');

/**
 * One full scan: load declared state -> read live state -> diff -> classify ->
 * persist findings + proposed remediations -> audit everything. Atomic (one transaction).
 */
async function runScan(provider) {
  const declared = loadDeclaredState();
  const live = await provider.listResources();
  const findings = computeDrift(declared, live).map((f) => {
    const risk = classify(f);
    return { ...f, riskLevel: risk.level, riskScore: risk.score, classifier: risk.classifier, justification: risk.justification };
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [scan] } = await client.query('INSERT INTO scan DEFAULT VALUES RETURNING id, started_at');
    await logEvent('SCAN_STARTED', { entityType: 'scan', entityId: String(scan.id) }, client);

    // Refresh the resource inventory (declared vs live snapshot per resource)
    const liveByKey = new Map(live.map((r) => [`${r.type}.${r.name}`, r]));
    const declaredByKey = new Map(declared.map((r) => [r.key, r]));
    const allKeys = new Set([...declaredByKey.keys(), ...liveByKey.keys()]);
    for (const key of allKeys) {
      const d = declaredByKey.get(key);
      const l = liveByKey.get(key);
      await client.query(
        `INSERT INTO managed_resource (resource_key, resource_type, resource_id, declared_state, live_state, last_scanned)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (resource_key) DO UPDATE
           SET resource_type = EXCLUDED.resource_type, resource_id = EXCLUDED.resource_id,
               declared_state = EXCLUDED.declared_state, live_state = EXCLUDED.live_state, last_scanned = now()`,
        [key, (d || l).type, (d && d.id) || (l && l.id) || null,
         d ? JSON.stringify(d.attributes) : null, l ? JSON.stringify(l.attributes) : null]
      );
    }

    const byLevel = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const f of findings) {
      byLevel[f.riskLevel] += 1;
      const { rows: [drift] } = await client.query(
        `INSERT INTO drift_record
           (scan_id, resource_key, resource_type, field, change_type, declared_value, live_value,
            risk_level, risk_score, classifier, justification)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [scan.id, f.resourceKey, f.resourceType, f.field, f.changeType,
         JSON.stringify(f.declaredValue), JSON.stringify(f.liveValue),
         f.riskLevel, f.riskScore, f.classifier, f.justification]
      );
      await logEvent('DRIFT_DETECTED', {
        entityType: 'drift', entityId: drift.id,
        payload: { resource: f.resourceKey, field: f.field, riskLevel: f.riskLevel, classifier: f.classifier },
      }, client);

      const proposal = proposeFor(f);
      if (proposal) {
        const { rows: [action] } = await client.query(
          `INSERT INTO remediation_action (drift_id, action_type, description, payload)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [drift.id, proposal.actionType, proposal.description, JSON.stringify(proposal.payload)]
        );
        await logEvent('REMEDIATION_PROPOSED', {
          entityType: 'remediation', entityId: action.id, payload: { drift: drift.id, description: proposal.description },
        }, client);
      }
    }

    await client.query(
      'UPDATE scan SET finished_at = now(), resources_checked = $2, drift_count = $3 WHERE id = $1',
      [scan.id, allKeys.size, findings.length]
    );
    await logEvent('SCAN_COMPLETED', {
      entityType: 'scan', entityId: String(scan.id),
      payload: { driftCount: findings.length, byLevel },
    }, client);
    await client.query('COMMIT');
    return { scanId: Number(scan.id), driftCount: findings.length, byLevel };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runScan };
