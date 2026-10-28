/**
 * Base contract for risk classifiers (Strategy pattern).
 *
 * A classifier declares which Terraform resource types it understands and
 * implements classify(drift). It returns either:
 *   { level, score, justification }   -> it has an opinion about this drift
 *   null                              -> it does not cover this field; defer to the fallback
 *
 * The registry validates every result (valid level, 0-100 integer score,
 * non-empty justification), so a plugin cannot return an unexplained verdict.
 */
class RiskClassifier {
  constructor({ name, resourceTypes = [], isFallback = false }) {
    if (new.target === RiskClassifier) throw new Error('RiskClassifier is abstract');
    this.name = name;
    this.resourceTypes = resourceTypes;
    this.isFallback = isFallback;
  }

  supports(resourceType) {
    return this.resourceTypes.includes(resourceType);
  }

  // eslint-disable-next-line no-unused-vars
  classify(drift) {
    throw new Error(`${this.name} must implement classify(drift)`);
  }
}

module.exports = RiskClassifier;
