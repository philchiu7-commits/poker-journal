const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = vm.createContext({console});
const app = fs.readFileSync('app.js','utf8');
vm.runInContext(app.slice(app.indexOf('const RVAL ='),app.indexOf('const EVALUABLE_CARD =')),ctx);
for (const file of ['vocab.js','stats.js','hfind.js','estimates.js','readlab.js','db.js'])
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const slice = (start, end) => {
  const at = app.indexOf(start), to = app.indexOf(end, at);
  assert.ok(at >= 0 && to > at, start);
  vm.runInContext(app.slice(at, to), ctx);
};
slice('const READ_CYCLE = {', 'const CHOICE_READS = ');
slice('function oppReads', 'const readChip');
slice('const wb = ', 'const POS_MATRIX = ');
slice('const LIVE_LAYOUT = [', 'const STREET_CHECKS = ');
const run = (s) => vm.runInContext(s, ctx);
const a = (street,actor,act,size) => ({street,actor,act,size});
let serial=0;
function hand(high='9', size='25%', level=1) {
  const pre=[a('pre','v1','raise','$6'),a('pre','v0','call')];
  if (level>=2) pre.push(a('pre','v0','raise','$20'),a('pre','v1','call'));
  if (level>=3) pre.push(a('pre','v1','raise','$60'),a('pre','v0','call'));
  return {id:'size-'+ ++serial,updatedAt:serial,imported:{source:'test'},blinds:{sb:1,bb:2},
    board:[high+'c','5d','2h'],villainIds:['p','q'],villains:[{opponentId:'p',pos:'BB',cards:[],squid:0},{opponentId:'q',pos:'BN',cards:[]}],
    actions:[...pre,a('flop','v0','bet',size),a('flop','v1','fold')]};
}
function observation(h) {ctx.h=h;return vm.runInContext("flopBoardSizing(h,'v0')",ctx);}
for (const high of ['2','8','9','T','J','Q','K','A']) {
  const h=hand(high); if(high==='2')h.board=['2c','2d','2h'];
  assert.equal(observation(h)?.board??null,['Q','K','A'].includes(high)?'high':['T','J'].includes(high)?'mid':'low');
}
for (const size of [25,33,50,66,75,100]) assert.equal(observation(hand('J',size+'%')).size,size);
assert.equal(observation(hand('T','25%',2)).pot,'3bp');
assert.equal(observation(hand('T','25%',3)),null);
const limped=hand();limped.actions[0]=a('pre','v1','limp');assert.equal(observation(limped),null);
const raised=hand();raised.actions.splice(2,0,a('flop','v1','bet','25%'));raised.actions[3].act='raise';assert.equal(observation(raised),null);
const checked=hand();checked.actions[2]=a('flop','v0','check');assert.equal(observation(checked),null);
const missing=hand('9','');assert.equal(observation(missing),null);
assert.equal(observation(hand('9','150%')).size,null); // Overbets stay in denominator, never labelled B100.
const cash=hand('9','$3');assert.equal(observation(cash).size,25); // $12 pot, $3 bet.
const straddle=hand('9','25%');straddle.blinds.straddle=4;assert.equal(observation(straddle).pot,'srp');
const hands=[hand('J','25%'),hand('T','50%'),hand('J','150%'),hand('Q','25%'),hand('9','25%',2)];
const logged=hand('J','25%');delete logged.imported;hands.push(logged);
ctx.hands=hands;
const both=vm.runInContext(`({lab:ReadLab.evaluate('p',hands),online:readEstimates('p',hands)})`,ctx);
for(const r of both.lab.filter(r=>r.id.startsWith('f-board-sizing-'))){
  assert.equal(r.mode,'rate');assert.equal(r.k,both.online[r.id].k);assert.equal(r.n,both.online[r.id].n);
}
const r=both.lab.find(r=>r.id==='f-board-sizing-mid-srp-25');assert.equal(r.k,1);assert.equal(r.n,3);
assert.equal(vm.runInContext("ReadLab.evaluate('p',hands,{squid:'have'}).find(r=>r.id==='f-board-sizing-mid-srp-25').n",ctx),0);
ctx.hands=[hands[0],hands[0]];
assert.equal(vm.runInContext("ReadLab.evaluate('p',hands).find(r=>r.id==='f-board-sizing-mid-srp-25').n",ctx),1);
console.log('PASS: exact T/J mid boards, Q+ high boards, six sizes, SRP/3BP, exclusions, pot reconstruction, unknown cards, imported samples, squid filter, deduplication and Online/Read Lab agreement.');

const specById = Object.fromEntries(run('FLOP_BOARD_SIZING').map(r => [r.id, r]));
const boards = ['low', 'mid', 'high'], pots = ['srp', '3bp'], kinds = ['', 'v', 'b'], sizes = [25, 33, 50, 66, 75, 100];
const specId = (board, pot, kind, size) => `f-board-sizing-${board}-${pot}${kind ? '-' + kind : ''}-${size}`;
assert.equal(run('FLOP_BOARD_SIZING').length, boards.length * pots.length * kinds.length * sizes.length);
for (const board of boards) for (const pot of pots) for (const kind of kinds) for (const size of sizes) {
  const id = specId(board, pot, kind, size);
  const spec = specById[id];
  assert.ok(spec, id);
  assert.equal(spec.board, board);
  assert.equal(spec.pot, pot);
  assert.equal(spec.kind, kind || null);
  assert.equal(spec.size, size);
  assert.equal(spec.label, 'B' + size);
  assert.equal(run(`TAG_BY_ID[${JSON.stringify(id)}].id`), id);
  assert.equal(run(`RETIRED_TAG_IDS.has(${JSON.stringify(id)})`), false);
}
const legacy = specById['f-board-sizing-low-srp-50'];
assert.equal(legacy.group, 'Low Board Sizing SRP');
assert.equal(run("TAG_BY_ID['f-board-sizing-low-srp-50'].label"), 'Low Board Sizing SRP B50');
assert.equal(legacy.definition.includes('9-high or lower'), true);
assert.equal(legacy.definition.includes('hole cards optional'), true);
assert.equal(/\b(Value|Bluff)\b/.test(legacy.group + legacy.definition), false);
assert.equal(specById['f-board-sizing-mid-3bp-75'].group, 'Mid Board Sizing 3BP');
assert.equal(/\b(Value|Bluff)\b/.test(specById['f-board-sizing-mid-3bp-75'].group), false);
assert.equal(specById['f-board-sizing-high-srp-25'].group, 'High Board Sizing SRP');
assert.equal(specById['f-board-sizing-high-srp-25'].definition.includes('Q-high or higher'), true);
assert.equal(specById['f-board-sizing-high-srp-25'].definition.includes('hole cards optional'), true);
assert.equal(specById['f-board-sizing-low-srp-v-50'].group, 'Low Board Sizing SRP Value');
assert.equal(specById['f-board-sizing-high-3bp-b-100'].group, 'High Board Sizing 3BP Bluff');
assert.equal(specById['f-board-sizing-mid-srp-v-33'].definition.includes('second pair'), true);
assert.equal(specById['f-board-sizing-mid-srp-b-33'].definition.includes('bluff'), true);
assert.notEqual(specById['f-board-sizing-low-srp-50'].id, specById['f-board-sizing-low-srp-v-50'].id);

const idOf = (x) => Array.isArray(x) ? x[0] : x && typeof x === 'object' ? (x.subs ? idOf(x.subs[0]) : x.id) : x;
const idsOf = (x) => x && x.subs ? x.subs.map(idOf) : [idOf(x), ...((x && x.also) || []).map(idOf)];
const legacyIds = Object.values(specById).filter(spec => !spec.kind).map(spec => spec.id).sort();
const kindIds = Object.values(specById).filter(spec => spec.kind).map(spec => spec.id).sort();
for (const layout of ['READ_LAYOUT', 'LIVE_LAYOUT']) {
  const shown = [], hidden = [];
  for (const cat of run(layout)) for (const sub of cat.subs) for (const row of sub.rows || []) {
    const ids = (row.ids || []).flatMap(idsOf).filter(id => String(id).startsWith('f-board-sizing-'));
    (row.hidden ? hidden : shown).push(...ids);
    assert.equal(cat.catchAll || cat.cat || false, false, layout + ' ' + cat.title);
  }
  assert.deepEqual(shown.slice().sort(), kindIds, layout);
  assert.deepEqual(hidden.slice().sort(), legacyIds, layout);
  assert.equal(new Set(shown.concat(hidden)).size, shown.length + hidden.length, layout);
}
const rows = JSON.parse(JSON.stringify(run('FLOP_SIZING_SECTION.rows')));
const visible = rows.filter(row => !row.hidden);
assert.deepEqual(visible.filter(r => r.head).map(r => [r.head, r.label]), [
  ['Low Board', 'Value'],
  ['Mid Board', 'Value'],
  ['High Board', 'Value'],
]);
assert.deepEqual(visible.map(r => r.label), ['Value', 'Bluff', 'Value', 'Bluff', 'Value', 'Bluff']);
assert.ok(visible.every(r => !/\b[VB]\b/.test(r.label) && !/Board Sizing/.test(r.label || '')));
assert.ok(visible.filter(r => r.label === 'Bluff').every(r => !r.head));
assert.equal(rows.some(r => r.hidden && !r.label && !r.head), true);
for (const row of rows) assert.deepEqual(row.ids.map(item => item.label), ['SRP', '3BP']);
const named = new Set(rows.flatMap(row => row.ids.map(item => item.readLabGroup)));
for (const spec of Object.values(specById)) assert.ok(named.has(spec.group), spec.group);
assert.equal(named.size, new Set(Object.values(specById).map(spec => spec.group)).size);
const hiddenGroups = new Set(rows.filter(row => row.hidden).flatMap(row => row.ids.map(item => item.readLabGroup)));
for (const spec of Object.values(specById).filter(spec => !spec.kind)) assert.ok(hiddenGroups.has(spec.group), spec.group);
for (const spec of Object.values(specById).filter(spec => spec.kind)) assert.equal(hiddenGroups.has(spec.group), false, spec.group);
const rules = Object.fromEntries(run("ReadLab.evaluate('nobody',[])").map(r => [r.id, r]));
for (const spec of Object.values(specById)) {
  const rule = rules[spec.id];
  assert.equal(rule.section, 'Flop Sizing', spec.id);
  assert.equal(rule.mode, 'rate', spec.id);
  assert.equal(rule.label, `${spec.group} · ${spec.label}`, spec.id);
  if (spec.kind) assert.equal(rule.definition.includes('Includes imported hands with unknown hole cards.'), false, spec.id);
  else assert.equal(rule.definition.includes('Includes imported hands with unknown hole cards.'), true, spec.id);
}

function graded(high, size, level, cards) {
  const h = hand(high, size + '%', level);
  if (cards) h.villains[0].cards = cards;
  return h;
}
assert.equal(observation(graded('T', 25, 1, ['Td', '9c'])).kind, 'v');
assert.equal(observation(graded('T', 25, 1, ['5c', '6d'])).kind, 'v'); // second pair is value on the flop
assert.equal(observation(graded('T', 25, 1, ['2c', '3d'])).kind, 'b');
assert.equal(observation(graded('T', 25, 1, null)).kind, null);
assert.equal(observation(graded('Q', 50, 1, ['Qd', 'Jc'])).board, 'high');
const sample = [
  graded('T', 25, 1, ['Td', '9c']),
  graded('T', 50, 1, ['4c', '3d']),
  graded('T', 150, 1, ['Td', '9c']),
  graded('T', 25, 2, ['Td', '9c']),
  graded('J', 25, 1, ['4c', '3d']),
  graded('9', 33, 1, ['9d', '8c']),
  graded('9', 33, 1, null),
  graded('Q', 25, 1, ['Qd', 'Jc']),
  graded('Q', 75, 1, ['4c', '3d']),
  graded('K', 25, 2, ['Kd', 'Qc']),
  graded('A', 100, 1, ['Ad', 'Kc']),
];
ctx.sample = sample;
const counted = run(`({lab:ReadLab.evaluate('p',sample), online:readEstimates('p',sample)})`);
const count = (id) => {
  const lab = counted.lab.find(r => r.id === id);
  assert.equal(lab.k, counted.online[id].k, id);
  assert.equal(lab.n, counted.online[id].n, id);
  return lab;
};
assert.deepEqual([count('f-board-sizing-mid-srp-v-25').k, count('f-board-sizing-mid-srp-v-25').n], [1, 2]);
assert.deepEqual([count('f-board-sizing-mid-srp-b-25').k, count('f-board-sizing-mid-srp-b-25').n], [1, 2]);
assert.deepEqual([count('f-board-sizing-mid-3bp-v-25').k, count('f-board-sizing-mid-3bp-v-25').n], [1, 1]);
assert.deepEqual([count('f-board-sizing-mid-srp-v-50').k, count('f-board-sizing-mid-srp-v-50').n], [0, 2]);
assert.deepEqual([count('f-board-sizing-low-srp-v-25').k, count('f-board-sizing-low-srp-v-25').n], [0, 1]);
assert.deepEqual([count('f-board-sizing-high-srp-v-50').k, count('f-board-sizing-high-srp-v-50').n], [0, 2]);
assert.deepEqual([count('f-board-sizing-low-srp-33').k, count('f-board-sizing-low-srp-33').n], [2, 2]);
assert.deepEqual([count('f-board-sizing-low-srp-v-33').k, count('f-board-sizing-low-srp-v-33').n], [1, 1]);
assert.equal(count('f-board-sizing-low-srp-b-33').n, 0);
assert.deepEqual([count('f-board-sizing-high-srp-v-25').k, count('f-board-sizing-high-srp-v-25').n], [1, 2]);
assert.deepEqual([count('f-board-sizing-high-srp-b-75').k, count('f-board-sizing-high-srp-b-75').n], [1, 1]);
assert.deepEqual([count('f-board-sizing-high-3bp-v-25').k, count('f-board-sizing-high-3bp-v-25').n], [1, 1]);
assert.deepEqual([count('f-board-sizing-high-srp-b-25').k, count('f-board-sizing-high-srp-b-25').n], [0, 1]);
assert.equal(count('f-board-sizing-mid-srp-25').k, 2); // value and bluff still count on the old unclassified size
assert.equal(count('f-board-sizing-mid-srp-25').n, 4); // two 25s, one 50, one overbet

ctx.kept = { reads: { 'f-board-sizing-low-srp-50': 'yes!' } };
run(`
  function tap(o, id) {
    const reads = oppReads(o);
    const ns = nextReadState(id, reads[id]);
    if (ns) reads[id] = ns; else delete reads[id];
    for (const other of (READ_EXCLUSIVE[id] || [])) delete reads[other];
  }
  tap(kept, 'f-board-sizing-low-srp-v-50');
  tap(kept, 'f-board-sizing-low-srp-b-50');
  tap(kept, 'f-board-sizing-low-3bp-v-33');
  tap(kept, 'f-board-sizing-high-srp-b-100');
`);
const saved = JSON.parse(JSON.stringify(ctx.kept.reads));
ctx.reloaded = { reads: saved };
run('oppReads(reloaded)');
assert.deepEqual(ctx.reloaded.reads, {
  'f-board-sizing-low-srp-50': 'yes!',
  'f-board-sizing-low-srp-v-50': 'yes',
  'f-board-sizing-low-srp-b-50': 'yes',
  'f-board-sizing-low-3bp-v-33': 'yes',
  'f-board-sizing-high-srp-b-100': 'yes',
});
ctx.into = { id: 'p', name: 'Pat', reads: { 'f-board-sizing-mid-srp-66': 'no' } };
ctx.from = { id: 'p', name: 'Pat', reads: {
  'f-board-sizing-mid-srp-66': 'yes',
  'f-board-sizing-mid-srp-v-66': 'yes',
  'f-board-sizing-high-3bp-b-25': 'no!',
}};
run('mergeOppRecords(into, from)');
const into = ctx.into;
assert.equal(into.reads['f-board-sizing-mid-srp-66'], 'no');
assert.equal(into.reads['f-board-sizing-mid-srp-v-66'], 'yes');
assert.equal(into.reads['f-board-sizing-high-3bp-b-25'], 'no!');
assert.notEqual(into.reads['f-board-sizing-mid-srp-66'], into.reads['f-board-sizing-mid-srp-v-66']);
console.log('PASS: high boards, independent value and bluff sizes, SRP/3BP isolation, saved reads, and legacy sizes kept unclassified.');
