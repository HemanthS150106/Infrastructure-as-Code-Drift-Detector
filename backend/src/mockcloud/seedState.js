/**
 * Seed "live" cloud state for the mock provider.
 * It mirrors data/terraform.tfstate, then introduces deliberate drift covering
 * the full spectrum of severities so the demo is interesting immediately.
 */
function buildSeed() {
  return [
    // CRITICAL: SSH opened to the whole internet (manual console change)
    {
      type: 'aws_security_group', name: 'web', id: 'sg-0a1b2c3d4e5f60001',
      attributes: {
        id: 'sg-0a1b2c3d4e5f60001', name: 'web-sg', description: 'Web tier security group',
        ingress: [
          { protocol: 'tcp', port: 443, cidr: '10.0.0.0/8' },
          { protocol: 'tcp', port: 22, cidr: '0.0.0.0/0' },
        ],
        tags: { Name: 'web-sg', Env: 'prod' },
      },
    },
    // NO DRIFT
    {
      type: 'aws_security_group', name: 'db', id: 'sg-0a1b2c3d4e5f60002',
      attributes: {
        id: 'sg-0a1b2c3d4e5f60002', name: 'db-sg', description: 'Database tier security group',
        ingress: [{ protocol: 'tcp', port: 5432, cidr: '10.0.1.0/24' }],
        tags: { Name: 'db-sg', Env: 'prod' },
      },
    },
    // HIGH: wildcard S3 permission added to an IAM role
    {
      type: 'aws_iam_role', name: 'app_role', id: 'app-role',
      attributes: {
        id: 'app-role', name: 'app-role', trusted_principals: ['ec2.amazonaws.com'],
        policy_actions: ['s3:GetObject', 's3:ListBucket', 's3:*'],
        tags: { Name: 'app-role', Env: 'prod' },
      },
    },
    // CRITICAL: log bucket made public
    {
      type: 'aws_s3_bucket', name: 'logs', id: 'acme-prod-logs',
      attributes: {
        id: 'acme-prod-logs', bucket: 'acme-prod-logs',
        acl: 'public-read', versioning: true, encryption: 'AES256',
        tags: { Name: 'acme-prod-logs', Env: 'prod' },
      },
    },
    // LOW: tag value edited + a tag removed (metadata only)
    {
      type: 'aws_s3_bucket', name: 'assets', id: 'acme-prod-assets',
      attributes: {
        id: 'acme-prod-assets', bucket: 'acme-prod-assets',
        acl: 'private', versioning: true, encryption: 'AES256',
        tags: { Name: 'acme-prod-assets', Env: 'production' },
      },
    },
    // MEDIUM: instance resized by hand (possible emergency scale-up)
    {
      type: 'aws_instance', name: 'api', id: 'i-0abc111111111111a',
      attributes: {
        id: 'i-0abc111111111111a', instance_type: 't3.xlarge', associate_public_ip: false,
        tags: { Name: 'api-server', Env: 'prod' },
      },
    },
    // NO DRIFT
    {
      type: 'aws_instance', name: 'worker', id: 'i-0abc222222222222b',
      attributes: {
        id: 'i-0abc222222222222b', instance_type: 't3.small', associate_public_ip: false,
        tags: { Name: 'worker', Env: 'prod' },
      },
    },
    // aws_instance.batch is intentionally ABSENT -> MISSING (deleted outside Terraform)

    // UNMANAGED: an instance that exists in the cloud but not in Terraform
    {
      type: 'aws_instance', name: 'unknown-i-0fff999999999999f', id: 'i-0fff999999999999f',
      attributes: {
        id: 'i-0fff999999999999f', instance_type: 'c5.4xlarge', associate_public_ip: true,
        tags: { Name: 'untracked-compute' },
      },
    },
  ];
}

module.exports = { buildSeed };
