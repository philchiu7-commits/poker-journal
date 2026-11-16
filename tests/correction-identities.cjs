const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({ console, structuredClone });
vm.runInContext(fs.readFileSync('db.js', 'utf8'), ctx);
const source = [{ id: 'old', name: 'Four' }, { id: 'other', name: 'Tom' }];
const patch = { players: ['old', 'other'], betting: {
  before: { seats: [['old', 'U8'], ['other', 'BN']] },
  after: { seats: [['old', 'U8'], ['other', 'BN']] },
}};
const apply = existing => {
  Object.assign(ctx, { corrections: [patch], source, existing });
  return JSON.parse(JSON.stringify(vm.runInContext('remapCorrectionPlayers(corrections, source, existing)', ctx)))[0];
};
const mapped = apply([{ id: 'new', name: 'Four' }, { id: 'other', name: 'Tom' }]);
assert.deepEqual(mapped.players, ['new', 'other']);
assert.deepEqual(mapped.betting.before.seats, [['new', 'U8'], ['other', 'BN']]);
assert.deepEqual(mapped.betting.after.seats, mapped.betting.before.seats);
assert.equal(patch.players[0], 'old');
assert.equal(apply([{ id: 'new', name: 'New name', aliases: ['Four'] }]).players[0], 'new');
assert.equal(apply([{ id: 'a', name: 'Four' }, { id: 'b', name: 'Four' }]).players[0], 'old');
assert.equal(apply([{ id: 'a', name: 'A', aliases: ['Four'] }, { id: 'b', name: 'B', aliases: ['Four'] }]).players[0], 'old');
assert.equal(apply([{ id: 'old', name: 'Renamed' }, { id: 'new', name: 'Four' }]).players[0], 'old');
assert.deepEqual(apply([{ id: 'combined', name: 'Four', aliases: ['Tom'] }]), patch);
console.log('PASS: correction identities follow unique merged names/aliases, preserve IDs, reject ambiguous/collapsed rosters, and do not mutate source.');
