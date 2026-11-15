const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({console});
const app=fs.readFileSync('app.js','utf8');
vm.runInContext(app.slice(app.indexOf('const RVAL ='),app.indexOf('const EVALUABLE_CARD =')),ctx);
for(const p of ['vocab.js','stats.js','hfind.js','estimates.js','readlab.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),plain=x=>JSON.parse(JSON.stringify(x));
const act=(street,actor,act,size)=>({street,actor,act,size});
const h=(id,cards=['Qs','7d'],board=['9c','5d','2h','3s','Jc'],actions=[])=>({id,ts:1,updatedAt:1,imported:{source:'test'},villainIds:['p','q'],villains:[{opponentId:'p',pos:'BB',cards,squid:0},{opponentId:'q',pos:'BN',cards:null,squid:1}],blinds:{sb:1,bb:2},board,actions});
function results(hands,options={}){ctx.hands=hands;ctx.opts=options;return run("ReadLab.evaluate('p',hands,opts)");}
const find=(rs,id)=>rs.find(r=>r.id===id);
// Stable classifier priorities and exact texture exclusions.
function holding(cards,board,st='turn'){ctx.hh=h('holding',cards,board);return run(`ReadLab.holding(ReadLab.facts(hh,'p'),'${st}')`);}
assert.equal(holding(['As','9s'],['9c','5s','2s','3h']).kind,'strong'); // TP+FD = strong
assert.equal(holding(['5s','4s'],['9c','5h','2s','Js']).kind,'draw');
assert.equal(holding(['5c','4d'],['9c','5h','2s','Js']).kind,'pair');
assert.equal(holding(['Ah','Ad'],['2s','4s','8s','Js']).kind,'bluff'); // not strong on 4-flush
assert.equal(holding(['2h','2d'],['2s','4s','8s','Js']).ignored,true); // sets ignored entirely
assert.equal(holding(['Qh','Qd'],['2s','3c','4d','5h']).strong,false);
assert.equal(holding(['6h','6d'],['2s','3c','4d','5h']).strong,true); // owns straight
assert.equal(holding(['Jc','8c'],['Ac','Tc','2h','7d']).wfd,true);
assert.equal(holding(['Qc','8c'],['Ac','Tc','2h','7d']).wfd,false);
assert.equal(holding(['4h','4d'],['Kc','Js','9d','7h','2c'],'river').riverBluff,true);
assert.equal(holding(['9h','9s'],['Kc','Js','8d','7h','2c'],'river').riverBluff,false);
const pre=[act('pre','q','raise','$6')]; // use actor IDs below
const riverActions=[act('pre','v1','raise','$6'),act('pre','v0','call'),act('flop','v0','check'),act('flop','v1','check'),act('turn','v0','check'),act('turn','v1','check'),act('river','v0','check'),act('river','v1','check')];
// Calling with air, Q-high max; no counting unknown cards or A/K-high.
const floatActions=[act('pre','v1','raise','$6'),act('pre','v0','call'),act('flop','v0','check'),act('flop','v1','bet','$10'),act('flop','v0','call')];
const floats=[1,2,3].map(n=>h('float'+n,['Qs','7d'],['9c','5d','2h',null,null],floatActions));
let rs=results(floats);assert.equal(find(rs,'float-OOP').state,'Yes');assert.equal(find(rs,'float-OOP').k,3);
assert.equal(find(results(floats.slice(0,1)),'float-OOP').state,'Yes');
assert.equal(find(results([h('ak',['As','7d'],['9c','5d','2h',null,null],floatActions)]),'float-OOP').k,0);
const trusted={reads:{'f-float-oop':'no'},name:'Trusted'};const before=JSON.stringify(floats);results(floats);assert.equal(JSON.stringify(floats),before);assert.equal(trusted.reads['f-float-oop'],'no');
// No sampling-state cache: newly imported hand immediately changes the verdict.
const live=[];assert.equal(find(results(live),'float-OOP').state,'Not established');live.push(floats[0]);assert.equal(find(results(live),'float-OOP').state,'Yes');
assert.equal(find(results(floats,{squid:'have'}),'float-OOP').n,0);
assert.equal(find(results(floats,{overrides:{'float-OOP':{min:4}}}),'float-OOP').state,'Not established');
assert.ok(rs.filter(r=>r.mode==='manual').every(r=>r.state==='Manual'&&r.n===0));
// LRR excludes AJ/AT and 66–88 from its denominator.
const lrrHand=(cards)=>{const hh=h('lrr',cards,[],lrrActions);hh.villains[0].pos='CO';return hh;};
const lrrActions=[act('pre','v0','limp'),act('pre','v1','raise','$10'),act('pre','v0','3bet','$30')];
assert.equal(find(results([lrrHand(['As','Jd'])]),'lrr-LrrV-none').n,0);
assert.equal(find(results([lrrHand(['9s','9d'])]),'lrr-LrrV-none').k,1);
// BSTI follows source action identity through normalized copies.
const bstiActions=[act('pre','v1','raise','$6'),act('pre','v0','call'),act('flop','v0','check'),act('flop','v1','check'),act('turn','v0','check'),act('turn','v1','check'),act('river','v0','check'),act('river','v1','bet','$3'),act('river','v0','raise','$20')];
assert.equal(find(results([h('bsti',['8s','6d'],['Kc','Js','9d','4h','2c'],bstiActions)]),'bsti').k,1);
// Missing or duplicate cards are not negative evidence.
assert.equal(find(results([h('unknown',null,['9c','5d','2h',null,null],floatActions)]),'float-OOP').n,0);
assert.equal(holding(['As','As'],['9c','5d','2h','3s']),null);
console.log('PASS: classifiers, texture exceptions, source identity, manual isolation, distinct counts, imported-hand refresh, filters and trial overrides.');
if(process.argv.includes('--dataset')){
 const data=JSON.parse(fs.readFileSync('/Users/phil/poker-extraction/exports/poker_journal_import_ALL_straddles_corrected.json'));
 const ids=[...new Set(data.hands.flatMap(h=>h.villainIds||[]))];let errors=0,total=0;
 for(const id of ids){ctx.pid=id;ctx.pool=data.hands;const rr=run('ReadLab.evaluate(pid,pool)');errors+=rr.reduce((n,r)=>n+(r.ignored||0),0);total+=rr.reduce((n,r)=>n+r.n,0);}
 console.log({players:ids.length,hands:data.hands.length,ruleCases:total,malformedCases:errors});assert.equal(errors,0);
}
// The same imported ID must never satisfy a distinct-hand requirement twice.
const repeated = find(results([floats[0],floats[0],floats[0]]),'float-OOP');
assert.equal(repeated.k, 1);
assert.equal(repeated.n, 1);
assert.equal(find(results([floats[0],floats[0]], {overrides:{'float-OOP':{min:2}}}),'float-OOP').state,'Not established');
const protectActions=[act('pre','v0','raise','$6'),act('pre','v1','call'),act('flop','v0','check'),act('flop','v1','check'),act('turn','v0','check'),act('turn','v1','check')];
assert.equal(find(results([h('protect',['Ah','Kh'],['2h','7h','9c','Jh',null],protectActions)]),'protect-flush').state,'Yes');
// Exact frequency boundaries retain the agreed inclusive/strict distinction.
function chanceHands(n,k,street='river') {
 return Array.from({length:n},(_,i)=>h('rate'+i,['Qs','7d'],['9c','5d','2h','3s','Jc'],[act('pre','v0','raise','$6'),act('pre','v1','call'),act('flop','v0','check'),act('flop','v1','check'),act('turn','v0','check'),act('turn','v1','check'),act(street,'v0',i<k?'bet':'check',i<k?'$10':undefined),act(street,'v1',i<k?'fold':'check')]));
}
assert.equal(find(results(chanceHands(100,37)),'river-over').state,'No');
assert.equal(find(results(chanceHands(100,38)),'river-over').state,'Yes');
assert.equal(find(results(chanceHands(100,31)),'river-under').state,'No');
assert.equal(find(results(chanceHands(100,30)),'river-under').state,'Yes');
assert.equal(find(results(chanceHands(100,34)),'force-nonsd').state,'No');
assert.equal(find(results(chanceHands(100,35)),'force-nonsd').state,'Yes');
console.log('PASS: distinct IDs, one-example flush protection, exact frequency boundaries.');
const logged=floats.map((h,i)=>({...h,id:'logged'+i,imported:undefined}));
assert.equal(find(results(logged),'float-OOP').state,'Yes');
assert.equal(find(results(logged),'cbet-HU-OOP').n,0);
console.log('PASS: logged evidence supports capability without biasing frequency reads.');
const runout=h('runout',['Ah','Kh'],['2h','7h','9c','Jh',null],[act('pre','v0','jam','$100'),act('pre','v1','call'),act('flop','v0','check'),act('flop','v1','check'),act('turn','v0','check'),act('turn','v1','check')]);
assert.equal(find(results([runout]),'protect-flush').n,0);
console.log('PASS: all-in runouts cannot create betting/checking opportunities.');
// Fold-to-xR ignores an ordinary raise by someone who never checked.
const directRaise=h('direct',['As','Kd'],['9c','5d','2h',null,null],[act('pre','v0','raise','$6'),act('pre','v1','call'),act('flop','v0','bet','$10'),act('flop','v1','raise','$30'),act('flop','v0','fold')]);
assert.equal(find(results([directRaise]),'flop-fxr').n,0);
// XXB was explicitly agreed for any preflop role, not just the raiser.
const xxbCaller=h('xxb',['Qs','7d'],['9c','5d','2h','3s','Jc'],riverActions.slice(0,-2).concat([act('river','v0','bet','$10'),act('river','v1','fold')]));
assert.equal(find(results([xxbCaller]),'line-XXB').k,1);
console.log('PASS: direct raises are not xRs; XXB includes preflop callers.');
function limped4(id,bet=false){
 const positions=['SB','BB','CO','BN'];
 const hh=h(id,['Qs','7d'],['9c','5d','2h',null,null],[]);
 hh.villains=positions.map((pos,i)=>({opponentId:i===0?'p':'q'+i,pos,cards:i===0?['Qs','7d']:null,squid:0}));hh.villainIds=hh.villains.map(v=>v.opponentId);
 hh.actions=positions.map((pos,i)=>act('pre','v'+i,pos==='BB'?'check':'limp')).concat(positions.map((pos,i)=>act('flop','v'+i,i===0&&bet?'bet':bet&&i>0?'fold':'check',i===0&&bet?'$8':undefined)));
 return hh;
}
ctx.groupHand=limped4('group');
assert.equal(run("ReadLab.position(ReadLab.facts(groupHand,'q1'),'flop',false,true)"),'OOP');
assert.equal(run("ReadLab.position(ReadLab.facts(groupHand,'q1'),'flop',true,true)"),'IP');
assert.equal(find(results(Array.from({length:100},(_,i)=>limped4('range'+i,i>=95))),'range-x').state,'Yes');
assert.equal(find(results(Array.from({length:100},(_,i)=>limped4('range'+i,i>=94))),'range-x').state,'No');
console.log('PASS: original vs stricter OOP groups, exact 95% Range X boundary.');

// Sample sufficiency and the verdict answer different questions.
const foldedAir = floatActions.slice(0, -1).concat(act('flop', 'v0', 'fold'));
const knownNonFloats = Array.from({ length: 15 }, (_, i) =>
  h('folded-air-' + i, ['Qs', '7d'], ['9c', '5d', '2h', null, null], foldedAir));
const smallSample = find(results(knownNonFloats.slice(0, 14)), 'float-OOP');
assert.equal(smallSample.state, 'Not established');
assert.equal(smallSample.established, false);
assert.equal(smallSample.verdict, 'No');
assert.equal(smallSample.canAcceptSample, true);
const largeSample = find(results(knownNonFloats), 'float-OOP');
assert.equal(largeSample.state, 'No');
assert.equal(largeSample.established, true);
const samples = { 'all:float-OOP': { value: 5, ts: 1 } };
assert.equal(find(results(knownNonFloats.slice(0, 5), { samples }), 'float-OOP').state, 'No');
assert.equal(find(results(knownNonFloats.slice(0, 4), { samples }), 'float-OOP').state, 'Not established');
assert.equal(find(results(knownNonFloats.slice(0, 5), { samples, squid: 'none' }), 'float-OOP').state, 'Not established');
assert.equal(find(results(floats.concat(knownNonFloats), { samples }), 'float-OOP').state, 'Yes');
assert.equal(find(results(chanceHands(14, 1)), 'river-over').established, false);
assert.equal(find(results(chanceHands(15, 1)), 'river-over').state, 'No');
assert.equal(find(results([]), 'river-over').canAcceptSample, false);
console.log('PASS: 15-hand threshold, established No, and live per-filter sample acceptance.');

// A holding rate counts decisions with that holding, whether the action was taken or declined.
function limpHolding(id, cards, bet) {
  const hand = limped4(id, bet);
  hand.villains[0].cards = cards;
  return hand;
}
const probeSample = [
  limpHolding('merge-bet', ['5c', 'Jd'], true),
  limpHolding('merge-check', ['5c', 'Jd'], false),
  limpHolding('strong-bet', ['9d', 'As'], true),
  limpHolding('unknown-bet', null, true),
];
const mergeProbe = find(results(probeSample), 'limp-oop-Merge');
assert.deepEqual(Array.from(mergeProbe.ev, e => [e.id, e.ok]), [['merge-bet', true], ['merge-check', false]]);
assert.equal(mergeProbe.pct, 50);
const strongProbe = find(results(probeSample), 'limp-oop-TopP+');
assert.equal(strongProbe.n, 1);
assert.equal(strongProbe.pct, 100);

function limpXR(id, cards, response) {
  const hand = limpHolding(id, cards, false);
  hand.actions = hand.actions.slice(0, 4).concat(
    act('flop', 'v0', 'check'), act('flop', 'v1', 'bet', '$8'),
    act('flop', 'v2', 'fold'), act('flop', 'v3', 'fold'),
    act('flop', 'v0', response, response === 'raise' ? '$24' : null));
  return hand;
}
const xrSample = [
  limpXR('air-raise', ['Qs', '7d'], 'raise'),
  limpXR('air-fold', ['Qs', '7d'], 'fold'),
  limpXR('pair-call', ['5c', 'Jd'], 'call'),
];
for (const category of ['Air', 'Bluff']) {
  const x = find(results(xrSample), 'limp-xr-' + category);
  assert.equal(x.state, 'Not established');
  assert.equal(x.min, 3);
  assert.deepEqual(Array.from(x.ev, e => [e.id, e.ok]), [['air-raise', true], ['air-fold', false]]);
}
const pairXR = find(results(xrSample), 'limp-xr-BottomP / 2ndP');
assert.equal(pairXR.n, 1);
assert.equal(pairXR.state, 'Not established');
const noXR = Array.from({ length: 15 }, (_, i) => limpXR('only-fold-' + i, ['Qs', '7d'], 'fold'));
assert.equal(find(results(noXR), 'limp-xr-Air').state, 'Not established');
const repeatedXR = [0, 1, 2].map(i => limpXR('raise-air-' + i, ['Qs', '7d'], 'raise'));
assert.equal(find(results(repeatedXR.slice(0, 2).concat(noXR)), 'limp-xr-Air').state, 'Not established');
const establishedXR = find(results(repeatedXR.concat(noXR)), 'limp-xr-Air');
assert.equal(establishedXR.state, 'Yes');
assert.equal(establishedXR.k, 3);
assert.equal(establishedXR.n, 18);
assert.equal(find(results([repeatedXR[0], repeatedXR[0], repeatedXR[0]]), 'limp-xr-Air').state, 'Not established');
assert.equal(find(results(noXR, { samples: { 'all:limp-xr-Air': { value: 1 } } }), 'limp-xr-Air').canAcceptSample, false);
const jammed = limpXR('facing-jam', ['Qs', '7d'], 'fold');
jammed.actions[5] = act('flop', 'v1', 'jam', '$20');
assert.equal(find(results([jammed]), 'limp-xr-Air').n, 0);
assert.equal(find(results([h('ak-not-eligible', ['As','7d'], ['9c','5d','2h',null,null], floatActions)]), 'float-OOP').n, 0);

const turnActions = response => [
  act('pre', 'v1', 'raise', '$6'), act('pre', 'v0', 'call'),
  act('flop', 'v0', 'check'), act('flop', 'v1', 'check'),
  act('turn', 'v0', 'check'), act('turn', 'v1', 'bet', '$9'), act('turn', 'v0', response),
];
const turnCalls = results([
  h('pair-call-turn', ['5c', 'Jd'], ['9c','5d','2h','3s',null], turnActions('call')),
  h('pair-fold-turn', ['5c', 'Jd'], ['9c','5d','2h','3s',null], turnActions('fold')),
  h('strong-call-turn', ['9d', 'As'], ['9c','5d','2h','3s',null], turnActions('call')),
]);
assert.deepEqual(Array.from(find(turnCalls, 'turn-call-2ndP').ev, e => [e.id, e.ok]),
  [['pair-call-turn', true], ['pair-fold-turn', false]]);
console.log('PASS: conditional probe, xR and turn-call denominators, three-example xR, and no raise chance against a lone all-in.');

const leadDecision = action => [
  act('pre', 'v1', 'raise', '$6'), act('pre', 'v0', 'call'),
  act('flop', 'v0', action, action === 'bet' ? '$8' : null), act('flop', 'v1', action === 'bet' ? 'fold' : 'check'),
];
const leadSample = [
  h('lead-pair', ['5c', 'Jd'], ['9c','5d','2h',null,null], leadDecision('bet')),
  h('check-pair', ['5c', 'Jd'], ['9c','5d','2h',null,null], leadDecision('check')),
  h('lead-strong', ['9d', 'As'], ['9c','5d','2h',null,null], leadDecision('bet')),
];
const leadMerge = find(results(leadSample), 'lead-Merge-flop');
assert.equal(leadMerge.state, 'Yes');
assert.equal(leadMerge.pct, 50);
assert.equal(leadMerge.k, 1);
assert.equal(leadMerge.n, 2);
assert.equal(find(results(leadSample.slice(1,2)), 'lead-Merge-flop').state, 'Not established');
assert.ok(run('ReadLab.rules.filter(r => r.mode === "cap").every(r => r.min === (r.positiveOnly ? 3 : 1))'));
assert.equal(find(results(leadSample, {overrides:{'lead-Merge-flop':{min:2}}}), 'lead-Merge-flop').state, 'Not established');
console.log('PASS: Lead and other capability reads establish Yes from one hand while retaining their rates and editable minimums.');

function lowFlop(id, cards, action, board = ['9c', '5d', '2h', null, null]) {
  return h(id, cards, board, [
    act('pre', 'v0', 'raise', '$6'), act('pre', 'v1', 'call'),
    act('flop', 'v0', action, action === 'bet' ? '$8' : null),
    act('flop', 'v1', action === 'bet' ? 'fold' : 'check'),
  ]);
}
const lowCases = [
  lowFlop('air-bet', ['Qc', '7s'], 'bet'),
  lowFlop('pair-check', ['5c', 'Jd'], 'check'),
  lowFlop('draw-bet', ['Ac', '4c'], 'bet', ['9c', '5c', '2h', null, null]),
  lowFlop('weak-top-check', ['9d', '3s'], 'check'),
  lowFlop('overpair-bet', ['Tc', 'Td'], 'bet'),
  lowFlop('unknown-check', null, 'check'),
  lowFlop('high-board-check', ['Jd', '3c'], 'check', ['Jc', '5d', '2h', null, null]),
];
const lowReads = results(lowCases);
assert.deepEqual(Array.from(find(lowReads, 'low-wide').ev, e => [e.id, e.ok]),
  [['air-bet', true], ['pair-check', false], ['draw-bet', true]]);
const lowProtect = find(lowReads, 'low-protect');
assert.deepEqual(Array.from(lowProtect.ev, e => [e.id, e.ok]), [['weak-top-check', true], ['overpair-bet', false]]);
assert.equal(lowProtect.state, 'Yes');
assert.equal(lowProtect.pct, 50);
const oopProtect = find(lowReads, 'oop-protect');
assert.deepEqual(Array.from(oopProtect.ev, e => [e.id, e.ok]), [
  ['pair-check', true], ['weak-top-check', true], ['overpair-bet', false], ['high-board-check', true],
]);
const lowRate = bets => results(Array.from({ length: 16 }, (_, i) =>
  lowFlop('low-rate-' + i, ['Qc', '7s'], i < bets ? 'bet' : 'check')));
assert.equal(find(lowRate(8), 'low-wide').state, 'No');
assert.equal(find(lowRate(9), 'low-wide').state, 'Yes');
console.log('PASS: low-board betting with below-top-pair holdings, checks with all top pairs or better, and strict 50% Too wide cutoff.');

const ipPair = lowFlop('ip-pair-check', ['5c', 'Jd'], 'check');
ipPair.villains[0].pos = 'BN';
ipPair.villains[1].pos = 'BB';
ipPair.actions = ipPair.actions.slice(0, 2).concat(act('flop', 'v1', 'check'), act('flop', 'v0', 'check'));
const thirdPair = lowFlop('third-pair-check', ['2c', 'Jd'], 'check');
const caller = h('caller-second-pair', ['5c', 'Jd'], ['9c', '5d', '2h', null, null], [
  act('pre', 'v1', 'raise', '$6'), act('pre', 'v0', 'call'),
  act('flop', 'v0', 'check'), act('flop', 'v1', 'check'),
]);
const oopPairOnly = find(results([
  lowFlop('second-pair-check', ['5c', 'Jd'], 'check'),
  lowFlop('second-pair-bet', ['5c', 'Jd'], 'bet'),
  thirdPair, ipPair, caller,
]), 'oop-protect');
assert.deepEqual(Array.from(oopPairOnly.ev, e => [e.id, e.ok]),
  [['second-pair-check', true], ['second-pair-bet', false]]);
assert.equal(oopPairOnly.pct, 50);
assert.equal(oopPairOnly.state, 'Yes');
console.log('PASS: OOP Protective samples second pair or better as the preflop raiser, with checks and bets both counted.');
