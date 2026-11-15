const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({ console });
const run = source => vm.runInContext(source, ctx);
const app = fs.readFileSync('app.js', 'utf8');
run(app.slice(app.indexOf('const RVAL ='), app.indexOf('const EVALUABLE_CARD =')));
run('const POST_AGG = ["bet", "raise", "3bet", "4bet", "5bet", "jam"];');
for (const file of ['vocab.js', 'stats.js', 'hfind.js']) run(fs.readFileSync(file, 'utf8'));

run(`
const hand = (id, street, action, size) => ({
  id, imported: {}, blinds: { sb: 1, bb: 2 },
  villains: [{ opponentId: 'p', pos: 'BB', cards: ['As', 'Ah'] }, { opponentId: 'q', pos: 'SB' }],
  board: ['9c', '5d', '2h'],
  actions: [
    { street: 'pre', actor: 'v1', act: 'raise', size: '$6' },
    ...(street === 'flop' ? [{ street: 'pre', actor: 'v0', act: 'call' }] : []),
    { street, actor: 'v0', act: action, size },
  ],
});
const postflop = [
  hand('below', 'flop', 'bet', '149%'),
  hand('lower-bound', 'flop', 'bet', '150%'),
  hand('middle', 'flop', 'bet', '200%'),
  hand('upper-bound', 'flop', 'bet', '250%'),
  hand('above', 'flop', 'bet', '251%'),
  hand('all-in', 'flop', 'jam', '$24'),
];
const preflop = [
  hand('150', 'pre', '3bet', '$24'),
  hand('250', 'pre', '3bet', '$36'),
  hand('over250', 'pre', '3bet', '$37'),
];
const raise = hand('raise-200', 'flop', 'raise', '200%');
raise.actions.splice(2, 0, {street: 'flop', actor: 'v1', act: 'bet', size: '$6'});
`);
const ids = expression => Array.from(run(expression));
assert.deepEqual(ids("sizingAuto('p', postflop).rows['flop-v']['100'].ids"), ['below']);
assert.deepEqual(ids("sizingAuto('p', postflop).rows['flop-v']['150'].ids"), ['lower-bound', 'middle', 'upper-bound']);
assert.deepEqual(ids("sizingAuto('p', postflop).rows['flop-v'].jam.ids"), ['above', 'all-in']);
assert.deepEqual(ids("postflop.filter(h => hqMatch(h, 'p', hqParse('B150 flop'))).map(h => h.id)"),
  ['lower-bound', 'middle', 'upper-bound']);
assert.deepEqual(ids("sizingAuto('p', preflop).rows['3bet-ip']['150'].ids"), ['150', '250']);
assert.deepEqual(ids("sizingAuto('p', preflop).rows['3bet-ip']['250+'].ids"), ['over250']);
assert.deepEqual(ids("sizingAuto('p', [raise]).rows['raise-v']['150'].ids"), ['raise-200']);
assert.deepEqual(ids("sizingAuto('p', [raise]).split['raise-v'].flop['150'].ids"), ['raise-200']);
assert.equal(run('SIZING_STEP_BY_ID["150"].label'), 'B150–B250');
console.log('PASS: Sizings and B150 search include 150% through 250%, with all-ins and larger sizes filed separately.');
