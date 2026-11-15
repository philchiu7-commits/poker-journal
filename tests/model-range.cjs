const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({});
const run = code => vm.runInContext(code, context);
run(fs.readFileSync('vocab.js', 'utf8'));

const kinds = Array.from(run('Object.keys(MR_ORDERS)'));
for (const kind of kinds) {
  context.kind = kind;
  context.favorite = run('MR_ORDERS[kind][0]');
  context.unexpected = run('MR_ORDERS[kind].at(-1)');
  const baseline = run('modelRange(kind, 27.6)');
  const observed = run('modelRange(kind, 27.6, {[unexpected]: {did: 40}, [favorite]: {miss: 40}})');
  assert.ok(baseline.hands.includes(context.favorite));
  assert.ok(!baseline.hands.includes(context.unexpected));
  assert.ok(observed.hands.includes(context.unexpected), kind);
  assert.ok(!observed.hands.includes(context.favorite), kind);
  assert.ok(Math.abs(observed.combos - 27.6 * 13.26) <= 6, kind);
  assert.equal(observed.informed, true);
  assert.equal(baseline.informed, false);
  assert.ok(run('modelRange(kind, 50, {[favorite]: {did: 5, miss: 5}}).informed'));
}

const prior = run('modelRange("limp", 27.6)');
const similar = run('modelRange("limp", 27.6, {J4o: {did: 5, miss: 0}, T5o: {did: 5, miss: 0}})');
assert.ok(!prior.hands.includes('T7o'));
assert.ok(similar.hands.includes('T7o'));
assert.equal(run('modelRange("limp", 0, {AA: {did: 40}}).combos'), 0);
assert.equal(run('modelRange("limp", 100, {AA: {miss: 40}}).combos'), 1326);
console.log('Passed: both outcomes adjust every model, similar hands share limited evidence, and range width stays tied to the action frequency.');
