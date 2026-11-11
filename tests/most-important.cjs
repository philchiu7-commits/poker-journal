const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync('vocab.js', 'utf8'), ctx);
const app = fs.readFileSync('app.js', 'utf8');
const slice = (startTok, endTok) => {
  const start = app.indexOf(startTok);
  const end = app.indexOf(endTok, start);
  assert.ok(start >= 0 && end > start, startTok);
  vm.runInContext(app.slice(start, end), ctx);
};
slice('const READ_CYCLE = {', 'const CHOICE_READS = ');
slice('const wb = ', 'const POS_MATRIX = ');
slice('const LIVE_LAYOUT = [', 'const STREET_CHECKS = ');
const run = (s) => vm.runInContext(s, ctx);

const ids = [
  'nuts-flop', 'nuts-turn',
  'bet-vol-high', 'bet-vol-low',
  'donks-yes', 'donks-no',
  'frontload-yes', 'frontload-no',
];
for (const id of ids) {
  assert.equal(run(`TAG_BY_ID[${JSON.stringify(id)}].id`), id, id);
  assert.ok(run(`TAG_BY_ID[${JSON.stringify(id)}].label`), id);
  assert.equal(run(`RETIRED_TAG_IDS.has(${JSON.stringify(id)})`), false, id);
}

assert.equal(run('READ_LAYOUT[0].title'), 'Most Important');
assert.equal(run('LIVE_LAYOUT[0].title'), 'Most Important');
assert.notEqual(run('READ_LAYOUT[0].title'), run('READ_LAYOUT[1].title'));
assert.notEqual(run('LIVE_LAYOUT[0].title'), run('LIVE_LAYOUT[1].title'));

const plain = (x) => JSON.parse(JSON.stringify(x));
const rows = (layout) => plain(run(`${layout}[0].subs[0].rows[0].ids`));
for (const layout of ['READ_LAYOUT', 'LIVE_LAYOUT']) {
  const items = rows(layout);
  assert.deepEqual(items.map((x) => x.label), ['Nuts', 'Bet Volume', 'Donks', 'Frontload'], layout);
  assert.deepEqual(items.map((x) => x.chip), ['Flop', 'High', 'Yes', 'Yes'], layout);
  assert.equal(items[0].chip, 'Flop');
  assert.deepEqual(items[0].also, [['nuts-turn', 'Turn']]);
  assert.equal(items[1].chip, 'High');
  assert.deepEqual(items[1].also, [['bet-vol-low', 'Low']]);
  assert.equal(items[2].chip, 'Yes');
  assert.deepEqual(items[2].also, [['donks-no', 'No']]);
  assert.equal(items[3].chip, 'Yes');
  assert.deepEqual(items[3].also, [['frontload-no', 'No']]);
  assert.ok(items.every((x) => x.chips && !('n' in x) && !String(x.label).match(/^[1-4]/)), layout);
}

// Exclusive Yes|No: next state stays on its own colour, and the pair is named.
assert.deepEqual(plain(run('READ_CYCLE["donks-yes"]')), ['yes', 'yes!']);
assert.deepEqual(plain(run('READ_CYCLE["donks-no"]')), ['no', 'no!']);
assert.deepEqual(plain(run('READ_CYCLE["frontload-yes"]')), ['yes', 'yes!']);
assert.deepEqual(plain(run('READ_CYCLE["frontload-no"]')), ['no', 'no!']);
assert.deepEqual(plain(run('READ_EXCLUSIVE["donks-yes"]')), ['donks-no']);
assert.deepEqual(plain(run('READ_EXCLUSIVE["donks-no"]')), ['donks-yes']);
assert.deepEqual(plain(run('READ_EXCLUSIVE["frontload-yes"]')), ['frontload-no']);
assert.deepEqual(plain(run('READ_EXCLUSIVE["frontload-no"]')), ['frontload-yes']);
assert.equal(run('READ_EXCLUSIVE["bet-vol-high"]'), undefined);
assert.equal(run('READ_EXCLUSIVE["nuts-flop"]'), undefined);

// Street ids were not reused or aliased.
assert.ok(run('TAG_BY_ID["f-bet-vol-high"] && TAG_BY_ID["t-bet-vol-high"] && TAG_BY_ID["r-bet-vol-high"]'));
assert.ok(run('TAG_BY_ID["raise-nuts-f"] && TAG_BY_ID["raise-nuts-t"]'));
assert.notEqual(run('TAG_BY_ID["bet-vol-high"].id'), run('TAG_BY_ID["f-bet-vol-high"].id'));

console.log('Passed: Most Important is first on Live and Online, eight new overall tag ids, Yes|No exclusive pairs, no street-id reuse.');
