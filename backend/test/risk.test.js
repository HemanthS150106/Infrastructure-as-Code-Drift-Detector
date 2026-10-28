const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, validate, classifiers } = require('../src/riskengine');

const drift = (o) => ({ changeType: 'MODIFIED', declaredValue: null, liveValue: null, ...o });

test('all classifiers are auto-discovered', () => {
  assert.ok(classifiers.includes('SecurityGroupRiskClassifier'));
  assert.ok(classifiers.includes('GenericRiskClassifier'));
});

test('SSH open to the world is CRITICAL', () => {
  const r = classify(drift({
    resourceType: 'aws_security_group', field: 'ingress',
    declaredValue: [{ protocol: 'tcp', port: 443, cidr: '10.0.0.0/8' }],
    liveValue: [{ protocol: 'tcp', port: 443, cidr: '10.0.0.0/8' }, { protocol: 'tcp', port: 22, cidr: '0.0.0.0/0' }],
  }));
  assert.equal(r.level, 'CRITICAL');
  assert.match(r.justification, /SSH/);
});

test('non-sensitive port open to the world is HIGH; new internal rule is MEDIUM', () => {
  const base = [{ protocol: 'tcp', port: 443, cidr: '10.0.0.0/8' }];
  const world = classify(drift({ resourceType: 'aws_security_group', field: 'ingress', declaredValue: base, liveValue: [...base, { protocol: 'tcp', port: 8080, cidr: '0.0.0.0/0' }] }));
  const internal = classify(drift({ resourceType: 'aws_security_group', field: 'ingress', declaredValue: base, liveValue: [...base, { protocol: 'tcp', port: 8080, cidr: '10.0.0.0/8' }] }));
  assert.equal(world.level, 'HIGH');
  assert.equal(internal.level, 'MEDIUM');
});

test('IAM wildcard actions: service wildcard HIGH, full wildcard CRITICAL', () => {
  const mk = (live) => classify(drift({ resourceType: 'aws_iam_role', field: 'policy_actions', declaredValue: ['s3:GetObject'], liveValue: live }));
  assert.equal(mk(['s3:GetObject', 's3:*']).level, 'HIGH');
  assert.equal(mk(['s3:GetObject', '*']).level, 'CRITICAL');
});

test('public S3 ACL is CRITICAL; versioning disabled is MEDIUM', () => {
  assert.equal(classify(drift({ resourceType: 'aws_s3_bucket', field: 'acl', declaredValue: 'private', liveValue: 'public-read' })).level, 'CRITICAL');
  assert.equal(classify(drift({ resourceType: 'aws_s3_bucket', field: 'versioning', declaredValue: true, liveValue: false })).level, 'MEDIUM');
});

test('instance resize is MEDIUM (could be an intentional emergency scale-up)', () => {
  const r = classify(drift({ resourceType: 'aws_instance', field: 'instance_type', declaredValue: 't3.medium', liveValue: 't3.xlarge' }));
  assert.equal(r.level, 'MEDIUM');
});

test('tag changes are LOW', () => {
  const r = classify(drift({ resourceType: 'aws_s3_bucket', field: 'tags.Env', declaredValue: 'prod', liveValue: 'production' }));
  assert.equal(r.level, 'LOW');
});

test('FAIL-SAFE: an unrecognised field is escalated (MEDIUM), never LOW', () => {
  const r = classify(drift({ resourceType: 'aws_something_new', field: 'mystery_flag', declaredValue: 1, liveValue: 2 }));
  assert.equal(r.level, 'MEDIUM');
});

test('MISSING and UNMANAGED resources are HIGH', () => {
  assert.equal(classify(drift({ resourceType: 'aws_instance', field: '*', changeType: 'MISSING' })).level, 'HIGH');
  assert.equal(classify(drift({ resourceType: 'aws_instance', field: '*', changeType: 'UNMANAGED' })).level, 'HIGH');
});

test('a verdict without a justification is rejected by the registry contract', () => {
  const fake = { name: 'FakeClassifier' };
  assert.throws(() => validate({ level: 'LOW', score: 5, justification: '' }, fake), /invalid verdict/);
  assert.throws(() => validate({ level: 'NOPE', score: 5, justification: 'x' }, fake), /invalid verdict/);
  assert.doesNotThrow(() => validate({ level: 'LOW', score: 5, justification: 'ok' }, fake));
});
