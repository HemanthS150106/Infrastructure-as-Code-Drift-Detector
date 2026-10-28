const { buildSeed } = require('./seedState');

/**
 * CloudStateProvider contract (the seam where a real AWS/GCP/Azure client plugs in):
 *
 *   listResources(): Promise<Array<{ type, name, id, attributes }>>
 *   applyFix(resourceKey, field, value): Promise<void>   // value === undefined => remove field
 *   reset(): Promise<void>                               // demo only
 *
 * Swapping in a real provider = implement these methods; the diff engine,
 * risk engine and API layer do not change.
 */
class MockCloudProvider {
  constructor() {
    this.state = buildSeed();
  }

  async listResources() {
    return JSON.parse(JSON.stringify(this.state));
  }

  async applyFix(resourceKey, field, value) {
    const res = this.state.find((r) => `${r.type}.${r.name}` === resourceKey);
    if (!res) throw new Error(`Resource ${resourceKey} not found in live environment`);
    setPath(res.attributes, field, value);
  }

  async reset() {
    this.state = buildSeed();
  }
}

/** Set (or delete, if value === undefined) a dotted path such as "tags.Env". */
function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

module.exports = { MockCloudProvider, setPath };
