/**
 * Field-level diff between declared (Terraform) and live (cloud) resource state.
 *
 * Why field-level and not whole-object hashing?
 *  - the risk engine needs to know WHICH field changed, not just THAT something changed
 *  - findings are human-readable ("ingress changed", "tags.Env changed")
 *
 * Nested plain objects (e.g. tags) are flattened to dotted paths (tags.Env).
 * Arrays are compared as a unit; classifiers inspect the set difference themselves.
 */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Deterministic deep equality (key order insensitive for objects). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

function diffAttributes(declared, live, prefix = '') {
  const drifts = [];
  const keys = new Set([...Object.keys(declared || {}), ...Object.keys(live || {})]);
  for (const key of keys) {
    const field = prefix ? `${prefix}.${key}` : key;
    const d = declared ? declared[key] : undefined;
    const l = live ? live[key] : undefined;

    if (isPlainObject(d) && isPlainObject(l)) {
      drifts.push(...diffAttributes(d, l, field));
    } else if (d === undefined && l !== undefined) {
      drifts.push({ field, changeType: 'ADDED', declaredValue: null, liveValue: l });
    } else if (d !== undefined && l === undefined) {
      drifts.push({ field, changeType: 'REMOVED', declaredValue: d, liveValue: null });
    } else if (!deepEqual(d, l)) {
      drifts.push({ field, changeType: 'MODIFIED', declaredValue: d, liveValue: l });
    }
  }
  return drifts;
}

/**
 * @param declared [{key,type,name,id,attributes}]  from Terraform state
 * @param live     [{type,name,id,attributes}]       from the cloud provider
 * @returns unclassified findings: [{resourceKey, resourceType, field, changeType, declaredValue, liveValue}]
 */
function computeDrift(declared, live) {
  const liveByKey = new Map(live.map((r) => [`${r.type}.${r.name}`, r]));
  const declaredKeys = new Set(declared.map((r) => r.key));
  const findings = [];

  for (const d of declared) {
    const l = liveByKey.get(d.key);
    if (!l) {
      findings.push({
        resourceKey: d.key, resourceType: d.type, field: '*', changeType: 'MISSING',
        declaredValue: d.attributes, liveValue: null,
      });
      continue;
    }
    for (const f of diffAttributes(d.attributes, l.attributes)) {
      findings.push({ resourceKey: d.key, resourceType: d.type, ...f });
    }
  }

  for (const l of live) {
    const key = `${l.type}.${l.name}`;
    if (!declaredKeys.has(key)) {
      findings.push({
        resourceKey: key, resourceType: l.type, field: '*', changeType: 'UNMANAGED',
        declaredValue: null, liveValue: l.attributes,
      });
    }
  }
  return findings;
}

module.exports = { computeDrift, diffAttributes, deepEqual };
