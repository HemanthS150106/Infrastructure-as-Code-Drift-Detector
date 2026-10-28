const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDrift, deepEqual } = require('../src/driftengine/diff');

const declared = (attrs) => [{ key: 'aws_s3_bucket.b', type: 'aws_s3_bucket', name: 'b', id: 'b', attributes: attrs }];
const live = (attrs) => [{ type: 'aws_s3_bucket', name: 'b', id: 'b', attributes: attrs }];

test('identical state produces no drift', () => {
  const a = { acl: 'private', tags: { Env: 'prod' } };
  assert.equal(computeDrift(declared(a), live(JSON.parse(JSON.stringify(a)))).length, 0);
});

test('nested tag changes are reported per key with dotted paths', () => {
  const f = computeDrift(declared({ tags: { Env: 'prod', Owner: 'x' } }), live({ tags: { Env: 'production' } }));
  const byField = Object.fromEntries(f.map((d) => [d.field, d.changeType]));
  assert.deepEqual(byField, { 'tags.Env': 'MODIFIED', 'tags.Owner': 'REMOVED' });
});

test('added field is detected', () => {
  const f = computeDrift(declared({ acl: 'private' }), live({ acl: 'private', extra: 1 }));
  assert.equal(f.length, 1);
  assert.equal(f[0].changeType, 'ADDED');
});

test('declared resource absent live is MISSING; live-only resource is UNMANAGED', () => {
  const f = computeDrift(declared({ acl: 'private' }), [
    { type: 'aws_instance', name: 'rogue', id: 'i-1', attributes: { instance_type: 'x' } },
  ]);
  assert.deepEqual(f.map((d) => d.changeType).sort(), ['MISSING', 'UNMANAGED']);
});

test('arrays are compared as a unit and order matters', () => {
  assert.equal(deepEqual([1, 2], [1, 2]), true);
  assert.equal(deepEqual([1, 2], [2, 1]), false);
  assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});
