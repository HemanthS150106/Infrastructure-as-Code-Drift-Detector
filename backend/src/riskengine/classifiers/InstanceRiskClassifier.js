const RiskClassifier = require('../RiskClassifier');

class InstanceRiskClassifier extends RiskClassifier {
  constructor() {
    super({ name: 'InstanceRiskClassifier', resourceTypes: ['aws_instance'] });
  }

  classify(drift) {
    if (drift.field === 'instance_type') {
      return {
        level: 'MEDIUM', score: 45,
        justification: `Instance type changed from ${drift.declaredValue} to ${drift.liveValue} outside Terraform. This may be an intentional emergency scale-up; reverting it automatically could cause an outage or capacity loss, so it needs human review.`,
      };
    }
    if (drift.field === 'associate_public_ip' && drift.liveValue === true) {
      return { level: 'HIGH', score: 80, justification: 'A public IP was associated with the instance, making it directly reachable from the internet.' };
    }
    return null;
  }
}

module.exports = InstanceRiskClassifier;
