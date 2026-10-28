const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRemediable, proposeFor, RemediationBlockedError } = require('../src/remediation/remediation');
const { MockCloudProvider, setPath } = require('../src/mockcloud/provider');

test('only LOW drift passes the remediation gate', () => {
  assert.doesNotThrow(() => assertRemediable({ risk_level: 'LOW', change_type: 'MODIFIED' }));
  for (const level of ['MEDIUM', 'HIGH', 'CRITICAL']) {
    assert.throws(
      () => assertRemediable({ risk_level: level, change_type: 'MODIFIED', justification: 'x' }),
      RemediationBlockedError
    );
  }
});

test('no remediation is proposed for non-LOW findings', () => {
  for (const riskLevel of ['MEDIUM', 'HIGH', 'CRITICAL']) {
    assert.equal(proposeFor({ riskLevel, changeType: 'MODIFIED', field: 'x', resourceKey: 'r' }), null);
  }
});

test('LOW MODIFIED proposes SET_FIELD; LOW ADDED proposes DELETE_FIELD; REMOVED reads "absent"', () => {
  const set = proposeFor({ riskLevel: 'LOW', changeType: 'MODIFIED', field: 'tags.Env', resourceKey: 'r.a', declaredValue: 'prod', liveValue: 'production' });
  assert.equal(set.actionType, 'SET_FIELD');
  assert.equal(set.payload.value, 'prod');
  const del = proposeFor({ riskLevel: 'LOW', changeType: 'ADDED', field: 'tags.Temp', resourceKey: 'r.a', liveValue: 'x' });
  assert.equal(del.actionType, 'DELETE_FIELD');
  const rem = proposeFor({ riskLevel: 'LOW', changeType: 'REMOVED', field: 'tags.Owner', resourceKey: 'r.a', declaredValue: 'team', liveValue: null });
  assert.match(rem.description, /currently absent/);
});

test('mock provider applies and deletes dotted-path fields', async () => {
  const p = new MockCloudProvider();
  await p.applyFix('aws_s3_bucket.assets', 'tags.Env', 'prod');
  let res = (await p.listResources()).find((r) => r.name === 'assets');
  assert.equal(res.attributes.tags.Env, 'prod');
  await p.applyFix('aws_s3_bucket.assets', 'tags.Env', undefined);
  res = (await p.listResources()).find((r) => r.name === 'assets');
  assert.equal('Env' in res.attributes.tags, false);
  await assert.rejects(() => p.applyFix('aws_nope.x', 'a', 1), /not found/);
});

test('setPath creates intermediate objects', () => {
  const o = {};
  setPath(o, 'a.b.c', 1);
  assert.deepEqual(o, { a: { b: { c: 1 } } });
});
