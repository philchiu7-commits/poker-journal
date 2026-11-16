const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({ console, structuredClone });
vm.runInContext(fs.readFileSync('db.js', 'utf8'), ctx);
const proof = { roundId: 'round', startCounts: { Saha: 0, Four: 1 }, sourceFrames: ['old.jpg'] };
const hand = { id: 'hand', imported: { tableId: 'table', roundId: 'round', squidCountsVerified: true,
  squidStartEvidence: proof, squidCapacityVerified: false }, updatedAt: 123, note: 'Keep my note',
  villains: [{ opponentId: 's', squid: 0 }, { opponentId: 'f', squid: 1 }],
  villainIds: ['s', 'f'], actions: [], squid: { have: 1, left: null } };
const patch = { id: 'hand', tableId: 'table', roundId: 'round', players: ['s', 'f'],
  squidRetraction: { counts: [0, 1], evidence: proof, reason: 'Live preflop badge contradicts stale zero.' },
  squidPresence: [{ present: true, evidence: [{ sourceFrame: 'new.jpg' }] },
    { present: true, evidence: [{ sourceFrame: 'old.jpg' }] }] };
const apply = (h, p=patch) => {
  ctx.hand = structuredClone(h); ctx.patch = structuredClone(p);
  return JSON.parse(JSON.stringify(vm.runInContext('correctedHand(hand, patch)', ctx)));
};
const result = apply(hand);
assert.equal(result.status, 'corrected');
assert.deepEqual(result.hand.villains.map(v=>[v.squid,v.squidPresence]), [[null,true],[null,true]]);
assert.equal(result.hand.imported.squidCountsVerified, false);
assert.equal(result.hand.imported.squidStartEvidence, undefined);
assert.deepEqual(result.hand.imported.squidRetractedEvidence, patch.squidRetraction);
assert.deepEqual(result.hand.squid, { have:null, left:null });
assert.equal(result.hand.note, hand.note);
assert.equal(hand.villains[0].squid, 0);
assert.equal(apply(result.hand).status, 'already');
for (const mutate of [h=>h.villains[0].squid=2, h=>h.imported.squidCountsVerified=false,
  h=>h.imported.squidStartEvidence={different:true}, h=>h.imported.roundId='elsewhere']) {
  const h=structuredClone(hand); mutate(h); assert.equal(apply(h).status,'skipped');
}
const original=structuredClone(hand);
original.villains.forEach(v=>v.squid=null);
delete original.imported.squidCountsVerified; delete original.imported.squidStartEvidence;
assert.equal(apply(original).status,'corrected');
assert.equal(apply(hand, {...patch,players:['wrong','f']}).status,'skipped');
console.log('PASS: disputed exact proof becomes presence, repeat is safe, changed counts/proof/identity are protected.');
