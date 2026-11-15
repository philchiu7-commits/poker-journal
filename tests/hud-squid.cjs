const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console});vm.runInContext(fs.readFileSync('stats.js','utf8'),c);
const make=(id,squid,fold=false)=>({id,ts:1,updatedAt:1,imported:{},villainIds:['p','other'],villains:[{opponentId:'p',pos:'CO',squid},{opponentId:'other',pos:'BN',squid:squid===0?3:0}],squid:{have:99},blinds:{sb:1,bb:2},board:['As','Kd','2c','3h','4c'],actions:[['pre','v0','limp'],['pre','v1','raise','$10'],['pre','v0',fold?'fold':'call'],...(!fold?[['flop','v0','check'],['flop','v1','bet','$10'],['flop','v0','call'],['turn','v0','bet','$20'],['turn','v1','fold']]:[])].map(([street,actor,act,size])=>({street,actor,act,size}))});
c.hands=[make('no',0),make('yes',1,true),make('two',2),make('unknown',null),make('missing',undefined)];
const run=s=>vm.runInContext(s,c);
assert.equal(run("hudFor('p',hands,'all').seats"),5);
assert.equal(run("hudFor('p',hands,'all').squidUnknown"),2);
assert.equal(run("hudFor('p',hands,'have').seats"),2);
assert.equal(run("hudFor('p',hands,'none').seats"),1);
assert.equal(run("hudFor('p',hands,'have').limpCall"),1);
assert.equal(run("hudFor('p',hands,'none').limpCall"),1);
assert.equal(run("hudFor('p',hands,'all').seats"),5); // cache survives switching filters
for(const [mode,ids] of [['have',['yes','two']],['none',['no']]]) {
  const counts=run(`hudFor('p',hands,'${mode}')`);
  for(const ev of Object.values(counts.ev)) for(const item of ev) assert.ok(ids.includes(item.id),`${mode}: ${item.id}`);
  c.sub=c.hands.filter(h=>ids.includes(h.id));
  assert.deepEqual(JSON.parse(JSON.stringify(counts)),JSON.parse(JSON.stringify(run("hudCount('p',sub)"))));
}
assert.equal(run("hudFor('other',hands,'have').seats"),1); // opponent's squid, not the hand or someone else's
console.log('Passed: every HUD counter and evidence list uses the selected opponent’s squid count; zero, one, multiple and unknown counts; cache switching.');

const openHand = (id, squid, seat, pre, blinds = { sb: 1, bb: 2 }) => ({
  id, ts: 2, imported: {}, villainIds: ['p', 'other'],
  villains: [{ opponentId: 'p', pos: seat, squid }, { opponentId: 'other', pos: 'HJ' }],
  blinds, actions: pre.map(([actor, act, size]) => ({ street: 'pre', actor, act, size })),
});
c.openHands = [
  openHand('rfi', 0, 'CO', [['v0', 'raise', '$6']]),
  openHand('iso', 1, 'CO', [['v1', 'limp', '$2'], ['v0', 'raise', '$8']]),
  openHand('fold', 1, 'CO', [['v0', 'fold']]),
  openHand('limp-reraise', 0, 'CO', [['v0', 'limp'], ['v1', 'raise', '$6'], ['v0', '3bet', '$20']]),
  openHand('3bet', 1, 'CO', [['v1', 'raise', '$6'], ['v0', '3bet', '$20']]),
  openHand('blind-option', 0, 'BB', [['v1', 'limp'], ['v0', 'raise', '$8']]),
  openHand('short-jam', 1, 'CO', [['v1', 'jam', '$1'], ['v0', 'raise', '$8']]),
  openHand('straddled-bb', 0, 'BB', [['v1', 'limp'], ['v0', 'raise', '$20']], { sb: 1, bb: 2, straddles: [{ pos: 'STD', amount: 4 }, { pos: 'U7', amount: 8 }] }),
  openHand('top-straddle', 1, 'U7', [['v1', 'limp'], ['v0', 'check']], { sb: 1, bb: 2, straddles: [{ pos: 'STD', amount: 4 }, { pos: 'U7', amount: 8 }] }),
];
const openCounters = run("hudCount('p',openHands)");
assert.equal(openCounters.open, 4);
assert.equal(openCounters.openOpp, 6);
assert.deepEqual(Array.from(openCounters.ev.open, x => [x.id, x.ok]),
  [['rfi',true],['iso',true],['fold',false],['limp-reraise',false],['short-jam',true],['straddled-bb',true]]);
assert.equal(openCounters.ev['open|BB'].length, 1);
assert.equal(run("hudFor('p',openHands,'have').openOpp"), 3);
assert.equal(run("hudFor('p',openHands,'none').openOpp"), 3);
console.log('Passed: Open and isolation raises, first decision only, short all-in calls, and free options in straddled pots.');

function seatedHand(id, early, straddle, overrides = {}) {
  const positions = ['SB', 'BB', ...(straddle ? ['STD'] : []), ...early, 'HJ', 'CO', 'BN'];
  return {
    id, imported: {}, blinds: { sb: 1, bb: 2, std: straddle ? 4 : null },
    villains: positions.map((pos, i) => ({ pos, opponentId: pos === early[0] ? 'p' : 'other-' + i })),
    actions: [{ street: 'pre', actor: 'v' + positions.indexOf(early[0]), act: 'raise', size: '$12' }],
    ...overrides,
  };
}
c.tableSizes = [
  seatedHand('seven-with', ['U8'], true),
  seatedHand('eight-with', ['U7', 'U6'], true),
  seatedHand('seven-without', ['U7', 'U6'], false),
  seatedHand('eight-without', ['U8', 'U7', 'U6'], false),
  seatedHand('nine-with', ['U9', 'U8', 'U7'], true),
  seatedHand('nine-without', ['U9', 'U8', 'U7', 'U6'], false),
];
const unclear = seatedHand('missing-sb', ['U9', 'U8', 'U7'], true);
unclear.villains.shift();
c.tableSizes.push(unclear);
const seatStats = run("hudCount('p',tableSizes)");
assert.equal(seatStats.seats, 7);
assert.equal(seatStats.seatExcluded, 3);
assert.deepEqual(Object.keys(seatStats.byPos).sort(), ['U7', 'U8']);
assert.deepEqual(Array.from(seatStats.ev['pfr|U7'], e => e.id), ['seven-with', 'seven-without']);
assert.deepEqual(Array.from(seatStats.ev['pfr|U8'], e => e.id), ['eight-with', 'eight-without']);
assert.equal(run("hudSeatFor(tableSizes[3], 'U6')"), 'U6');
assert.equal(run("hudSeatFor(tableSizes[1], 'U6')"), 'U7');
assert.equal(run("hudSeatFor({...tableSizes[0], hero: true, heroPos: 'U9'}, 'U8')"), 'U7');
assert.equal(run("hudSeatFor({...tableSizes[1], hero: true, heroPos: 'U9'}, 'U7')"), null);
console.log('Passed: seven- and eight-handed position labels, hero seat included, and nine-handed or unclear positions excluded from the seat grid.');
