const { AUTO_REMEDIABLE } = require('../riskengine/levels');

class RemediationBlockedError extends Error {
  constructor(drift) {
    super(
      `Remediation blocked: ${drift.risk_level} risk drift is never auto-remediated. ` +
      `Escalate for manual review. Reason: ${drift.justification}`
    );
    this.name = 'RemediationBlockedError';
    this.riskLevel = drift.risk_level;
  }
}

/**
 * Server-side safety gate. Enforced in the API, not just hidden in the UI:
 * MEDIUM/HIGH/CRITICAL drift cannot be remediated even by calling the endpoint directly.
 */
function assertRemediable(drift) {
  if (!AUTO_REMEDIABLE.has(drift.risk_level)) throw new RemediationBlockedError(drift);
  if (drift.change_type === 'MISSING' || drift.change_type === 'UNMANAGED') {
    throw new RemediationBlockedError(drift);
  }
}

/**
 * Build a proposed fix (revert-to-declared) for a finding, or null if none is allowed.
 * @param f classified finding {resourceKey, field, changeType, declaredValue, liveValue, riskLevel}
 */
function proposeFor(f) {
  if (!AUTO_REMEDIABLE.has(f.riskLevel)) return null;
  if (f.changeType === 'MISSING' || f.changeType === 'UNMANAGED') return null;

  if (f.changeType === 'ADDED') {
    return {
      actionType: 'DELETE_FIELD',
      description: `Remove undeclared "${f.field}" (${JSON.stringify(f.liveValue)}) from ${f.resourceKey}`,
      payload: { resourceKey: f.resourceKey, field: f.field, op: 'DELETE_FIELD' },
    };
  }
  return {
    actionType: 'SET_FIELD',
    description: `Set "${f.field}" on ${f.resourceKey} back to ${JSON.stringify(f.declaredValue)} (currently ${f.changeType === 'REMOVED' ? 'absent' : JSON.stringify(f.liveValue)})`,
    payload: { resourceKey: f.resourceKey, field: f.field, op: 'SET_FIELD', value: f.declaredValue },
  };
}

/** Execute an approved action against the cloud provider. */
async function applyAction(provider, payload) {
  const value = payload.op === 'DELETE_FIELD' ? undefined : payload.value;
  await provider.applyFix(payload.resourceKey, payload.field, value);
}

module.exports = { assertRemediable, proposeFor, applyAction, RemediationBlockedError };
