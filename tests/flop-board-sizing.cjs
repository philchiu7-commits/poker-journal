const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = vm.createContext({console});
const app = fs.readFileSync('app.js','utf8');
vm.runInContext(app.slice(app.indexOf('const RVAL ='),app.indexOf('const EVALUABLE_CARD =')),ctx);
for (const file of ['vocab.js','stats.js','hfind.js','estimates.js','readlab.js'])
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
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
  assert.equal(observation(h)?.board??null,['Q','K','A'].includes(high)?null:['T','J'].includes(high)?'mid':'low');
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
console.log('PASS: exact T/J mid boards, six sizes, SRP/3BP, exclusions, pot reconstruction, unknown cards, imported samples, squid filter, deduplication and Online/Read Lab agreement.');
