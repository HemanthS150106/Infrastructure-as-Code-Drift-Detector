const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Only LOW-risk drift may ever be auto-remediated (with human approval). */
const AUTO_REMEDIABLE = new Set(['LOW']);

module.exports = { LEVELS, AUTO_REMEDIABLE };
