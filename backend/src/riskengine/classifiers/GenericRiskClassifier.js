const RiskClassifier = require('../RiskClassifier');

/**
 * Fallback classifier. Fail-safe by design: only provably harmless metadata
 * changes are LOW. Anything it does not recognise is escalated (MEDIUM), never
 * auto-fixed.
 */
class GenericRiskClassifier extends RiskClassifier {
  constructor() {
    super({ name: 'GenericRiskClassifier', isFallback: true });
  }

  classify(drift) {
    if (drift.changeType === 'MISSING') {
      return { level: 'HIGH', score: 82, justification: 'A resource declared in Terraform no longer exists in the live environment (manual deletion or out-of-band teardown). Re-creating it automatically could duplicate resources or resurrect something that was deleted on purpose.' };
    }
    if (drift.changeType === 'UNMANAGED') {
      return { level: 'HIGH', score: 78, justification: 'A live resource is not tracked by Terraform (shadow infrastructure). It could be an unsanctioned workload or a forgotten test resource and needs an ownership review before any action.' };
    }
    if (drift.field.startsWith('tags.') || drift.field === 'tags' || drift.field === 'description') {
      return { level: 'LOW', score: 10, justification: `Metadata-only change to "${drift.field}" with no security or availability impact; safe to revert after approval.` };
    }
    return { level: 'MEDIUM', score: 30, justification: `Unclassified change to "${drift.field}". No classifier covers this field, so it is escalated for manual review rather than auto-fixed.` };
  }
}

module.exports = GenericRiskClassifier;
