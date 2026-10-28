const RiskClassifier = require('../RiskClassifier');

const WORLD = new Set(['0.0.0.0/0', '::/0']);
const SENSITIVE_PORTS = {
  22: 'SSH', 23: 'Telnet', 445: 'SMB', 1433: 'MSSQL', 3306: 'MySQL',
  3389: 'RDP', 5432: 'PostgreSQL', 6379: 'Redis', 9200: 'Elasticsearch', 27017: 'MongoDB',
};

const ruleKey = (r) => `${r.protocol}:${r.port}:${r.cidr}`;
const describe = (r) => `${r.protocol}/${r.port === -1 ? 'all' : r.port} from ${r.cidr}`;

class SecurityGroupRiskClassifier extends RiskClassifier {
  constructor() {
    super({ name: 'SecurityGroupRiskClassifier', resourceTypes: ['aws_security_group'] });
  }

  classify(drift) {
    if (drift.field !== 'ingress') return null; // tags/description handled by the generic classifier

    const declared = new Map((drift.declaredValue || []).map((r) => [ruleKey(r), r]));
    const live = new Map((drift.liveValue || []).map((r) => [ruleKey(r), r]));
    const added = [...live].filter(([k]) => !declared.has(k)).map(([, r]) => r);
    const removed = [...declared].filter(([k]) => !live.has(k)).map(([, r]) => r);

    const findings = [];
    for (const r of added) {
      const exposesAll = r.port === -1 || r.port === 0;
      const svc = SENSITIVE_PORTS[r.port];
      if (WORLD.has(r.cidr) && (svc || exposesAll)) {
        findings.push({
          level: 'CRITICAL', score: 95,
          justification: `New ingress rule ${describe(r)} exposes ${exposesAll ? 'every port' : `${svc} (port ${r.port})`} to the public internet. This is a direct attack-surface expansion and is not declared in Terraform.`,
        });
      } else if (WORLD.has(r.cidr)) {
        findings.push({
          level: 'HIGH', score: 75,
          justification: `New ingress rule ${describe(r)} opens port ${r.port} to the public internet; not declared in Terraform.`,
        });
      } else {
        findings.push({
          level: 'MEDIUM', score: 45,
          justification: `New ingress rule ${describe(r)} exists in the live environment but not in Terraform.`,
        });
      }
    }
    if (!added.length && removed.length) {
      findings.push({
        level: 'MEDIUM', score: 40,
        justification: `Declared ingress rule(s) ${removed.map(describe).join(', ')} are missing live. Access may have been revoked intentionally, or connectivity may now be broken.`,
      });
    }
    if (!findings.length) return null;

    findings.sort((a, b) => b.score - a.score);
    const worst = findings[0];
    const extra = findings.length - 1;
    return { ...worst, justification: worst.justification + (extra ? ` (+${extra} other ingress change${extra > 1 ? 's' : ''})` : '') };
  }
}

module.exports = SecurityGroupRiskClassifier;
