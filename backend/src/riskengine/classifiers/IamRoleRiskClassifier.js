const RiskClassifier = require('../RiskClassifier');

class IamRoleRiskClassifier extends RiskClassifier {
  constructor() {
    super({ name: 'IamRoleRiskClassifier', resourceTypes: ['aws_iam_role'] });
  }

  classify(drift) {
    if (drift.field === 'policy_actions') {
      const declared = new Set(drift.declaredValue || []);
      const live = new Set(drift.liveValue || []);
      const added = [...live].filter((a) => !declared.has(a));
      const removed = [...declared].filter((a) => !live.has(a));

      if (added.some((a) => a === '*' || a === '*:*')) {
        return { level: 'CRITICAL', score: 98, justification: `Full administrative wildcard ("*") was added to the role's permissions. This grants every action on every resource and is not declared in Terraform.` };
      }
      const wildcard = added.find((a) => a.endsWith(':*'));
      if (wildcard) {
        return { level: 'HIGH', score: 88, justification: `Wildcard permission "${wildcard}" was added to the role. It grants every action on that service and is a classic privilege-escalation path; it is not declared in Terraform.` };
      }
      if (added.length) {
        return { level: 'MEDIUM', score: 55, justification: `Additional permission(s) ${added.join(', ')} exist on the role but not in Terraform.` };
      }
      if (removed.length) {
        return { level: 'MEDIUM', score: 35, justification: `Permission(s) ${removed.join(', ')} were removed outside Terraform. Workloads that rely on them may now fail.` };
      }
    }
    if (drift.field === 'trusted_principals') {
      return { level: 'HIGH', score: 85, justification: 'The role trust policy changed. This alters WHO can assume the role and must be reviewed by a human.' };
    }
    return null;
  }
}

module.exports = IamRoleRiskClassifier;
