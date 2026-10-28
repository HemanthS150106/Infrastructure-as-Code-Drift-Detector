const fs = require('fs');
const path = require('path');
const { LEVELS } = require('./levels');

/**
 * Registry. Every file in ./classifiers is auto-discovered and instantiated, so
 * supporting a new resource type = adding ONE new file there. No core changes.
 */
const dir = path.join(__dirname, 'classifiers');
const all = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => new (require(path.join(dir, f)))());

const specific = all.filter((c) => !c.isFallback);
const fallback = all.find((c) => c.isFallback);
if (!fallback) throw new Error('A fallback (generic) classifier is required');

function validate(result, classifier) {
  const ok =
    result &&
    LEVELS.includes(result.level) &&
    Number.isInteger(result.score) && result.score >= 0 && result.score <= 100 &&
    typeof result.justification === 'string' && result.justification.trim().length > 0;
  if (!ok) {
    throw new Error(`${classifier.name} returned an invalid verdict (needs level, 0-100 score and a justification): ${JSON.stringify(result)}`);
  }
}

/**
 * @param drift {resourceType, field, changeType, declaredValue, liveValue}
 * @returns {level, score, classifier, justification}
 */
function classify(drift) {
  // MISSING / UNMANAGED are resource-level findings, not field-level: always generic.
  const candidates =
    drift.changeType === 'MISSING' || drift.changeType === 'UNMANAGED'
      ? []
      : specific.filter((c) => c.supports(drift.resourceType));

  for (const c of candidates) {
    const result = c.classify(drift);
    if (result) {
      validate(result, c);
      return { ...result, classifier: c.name };
    }
  }
  const result = fallback.classify(drift);
  validate(result, fallback);
  return { ...result, classifier: fallback.name };
}

module.exports = { classify, validate, classifiers: all.map((c) => c.name) };
