const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({ console, structuredClone, straddlePosts: () => [] });
vm.runInContext(fs.readFileSync('db.js', 'utf8'), ctx);
const app = fs.readFileSync('app.js', 'utf8');
vm.runInContext(app.slice(app.indexOf('const CARD_RX ='), app.indexOf('async function normaliseHandTokens()')), ctx);
const action = (street, actor, act, extra = {}) => ({ street, actor, act, size: null, ...extra });
const hand = { id: 'hand', imported: { tableId: 'table', roundId: 'round' }, updatedAt: 123,
  villains: [{ opponentId: 'p', pos: 'BN' }, { opponentId: 'q', pos: 'BB' }], villainIds: ['p', 'q'],
  actions: [action('pre', 'v0', 'call'), action('turn', 'v0', 'check'), action('turn', 'v1', 'fold'),
    action('flop', 'v0', 'bet', { sourceTimestamp: 100 }), action('flop', 'v1', 'call')] };
const expected = [hand.actions[0], hand.actions[3], hand.actions[4], hand.actions[1], hand.actions[2]];
ctx.hand = structuredClone(hand);
assert.equal(vm.runInContext('normaliseHand(hand)', ctx), true);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.hand.actions)), expected);
assert.equal(ctx.hand.updatedAt, 123);
assert.equal(vm.runInContext('normaliseHand(hand)', ctx), false);
for (const invalid of [null, [{ street: 'unknown' }], [null]]) {
  ctx.hand = { actions: invalid };
  assert.equal(vm.runInContext('normaliseActionOrder(hand)', ctx), false);
  assert.equal(ctx.hand.actions, invalid);
}
ctx.hand = hand;
ctx.patch = { id: 'hand', tableId: 'table', roundId: 'round', players: ['p', 'q'], betting: {
  streets: ['pre', 'flop', 'turn', 'river'],
  before: { seats: [['p', 'BN'], ['q', 'BB']], actions: hand.actions },
  after: { seats: [['p', 'BN'], ['q', 'BB']], actions: expected }, evidence: {} } };
const result = vm.runInContext('correctedHand(hand, patch)', ctx);
assert.equal(result.status, 'corrected');
assert.deepEqual(JSON.parse(JSON.stringify(result.hand.actions)), expected);
assert.equal(hand.actions[1].street, 'turn'); // Input and undo baseline stay untouched.
ctx.hand = result.hand;
assert.equal(vm.runInContext('correctedHand(hand, patch).status', ctx), 'already');
ctx.hand = hand;
ctx.patch.players = ['wrong', 'q'];
assert.equal(vm.runInContext('correctedHand(hand, patch).status', ctx), 'skipped');
assert.equal(hand.actions[1].street, 'turn');
console.log('PASS: stable street order, preserved action evidence, idempotent normalization, guarded corrections.');
