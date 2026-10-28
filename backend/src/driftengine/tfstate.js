const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'data', 'terraform.tfstate');

/**
 * Parse a Terraform state file (v4 format) into a flat list of declared resources:
 *   [{ key: 'aws_security_group.web', type, name, id, attributes }]
 * Only managed resources are considered (data sources are skipped).
 */
function loadDeclaredState(filePath = process.env.TF_STATE_PATH || DEFAULT_PATH) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (raw.version !== 4) {
    throw new Error(`Unsupported tfstate version ${raw.version}; expected 4`);
  }
  const out = [];
  for (const r of raw.resources || []) {
    if (r.mode !== 'managed') continue;
    for (const inst of r.instances || []) {
      const attrs = inst.attributes || {};
      out.push({
        key: `${r.type}.${r.name}`,
        type: r.type,
        name: r.name,
        id: attrs.id || null,
        attributes: attrs,
      });
    }
  }
  return out;
}

module.exports = { loadDeclaredState };
