const RiskClassifier = require('../RiskClassifier');

const PUBLIC_ACLS = new Set(['public-read', 'public-read-write', 'authenticated-read']);

class S3BucketRiskClassifier extends RiskClassifier {
  constructor() {
    super({ name: 'S3BucketRiskClassifier', resourceTypes: ['aws_s3_bucket'] });
  }

  classify(drift) {
    switch (drift.field) {
      case 'acl':
        if (PUBLIC_ACLS.has(drift.liveValue)) {
          return { level: 'CRITICAL', score: 96, justification: `Bucket ACL changed from "${drift.declaredValue}" to "${drift.liveValue}", making its contents readable outside the account. Possible data exposure.` };
        }
        return { level: 'MEDIUM', score: 35, justification: `Bucket ACL changed from "${drift.declaredValue}" to "${drift.liveValue}".` };

      case 'versioning':
        if (drift.declaredValue === true && drift.liveValue === false) {
          return { level: 'MEDIUM', score: 50, justification: 'Bucket versioning was disabled. This removes protection against accidental deletion, overwrites and ransomware recovery.' };
        }
        return { level: 'LOW', score: 15, justification: 'Bucket versioning was enabled outside Terraform (stricter than declared).' };

      case 'encryption':
        if (!drift.liveValue) {
          return { level: 'HIGH', score: 78, justification: 'Server-side encryption was removed from the bucket; data at rest is no longer encrypted.' };
        }
        return { level: 'MEDIUM', score: 40, justification: `Encryption algorithm changed from "${drift.declaredValue}" to "${drift.liveValue}".` };

      default:
        return null;
    }
  }
}

module.exports = S3BucketRiskClassifier;
