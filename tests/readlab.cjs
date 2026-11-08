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
assert.equal(find(results(floats.slice(0,2)),'float-OOP').state,'Not established');
assert.equal(find(results([h('ak',['As','7d'],['9c','5d','2h',null,null],floatActions)]),'float-OOP').k,0);
const trusted={reads:{'f-float-oop':'no'},name:'Trusted'};const before=JSON.stringify(floats);results(floats);assert.equal(JSON.stringify(floats),before);assert.equal(trusted.reads['f-float-oop'],'no');
// No sampling-state cache: newly imported hand immediately changes the verdict.
const live=floats.slice(0,2);assert.equal(find(results(live),'float-OOP').state,'Not established');live.push(floats[2]);assert.equal(find(results(live),'float-OOP').state,'Yes');
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
assert.equal(find(results([floats[0],floats[0],floats[0]]),'float-OOP').state,'Not established');
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
