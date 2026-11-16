const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = vm.createContext({console, structuredClone});
vm.runInContext(fs.readFileSync('db.js','utf8'),ctx);
const plain = x => JSON.parse(JSON.stringify(x));
const initial = {id:'h',imported:{tableId:'t',roundId:'r',squidCountsVerified:false,keep:'source'},
  villains:[{opponentId:'p',pos:'SB',squid:null,cards:['As','Ks'],note:'keep'}],
  villainIds:['p'],actions:[],squid:{have:null,left:null},note:'keep',updatedAt:1};
const earlier = structuredClone(initial);
earlier.villains[0].squid=0;
Object.assign(earlier.imported,{squidCountsVerified:true,squidStartEvidence:{frame:'old.jpg'}});
earlier.squid={have:0,left:1};
const desired = structuredClone(initial);
desired.villains[0].squidPresence=true;
desired.villains[0].squidPresenceEvidence=[{frame:'new.jpg'}];
ctx.initial=initial;ctx.earlier=earlier;ctx.desired=desired;
ctx.patch={id:'h',tableId:'t',roundId:'r',players:['p'],squidState:{
  before:vm.runInContext('[correctionSquidState(initial,["p"]),correctionSquidState(earlier,["p"])]',ctx),
  after:vm.runInContext('correctionSquidState(desired,["p"])',ctx),evidence:[{reason:'Reviewed withdrawal'}]}};
assert.equal(vm.runInContext('validSquidState(patch.squidState.after,1)',ctx),true);
for(const input of [initial,earlier]){
 ctx.input=input;
 const result=vm.runInContext('correctedHand(input,patch)',ctx);
 assert.equal(result.status,'corrected');
 const {updatedAt,...actual}=plain(result.hand), {updatedAt:ignored,...expected}=desired;
 assert.deepEqual(actual,expected);
 ctx.corrected=result.hand;
 assert.equal(vm.runInContext('correctedHand(corrected,patch).status',ctx),'already');
}
assert.equal(earlier.villains[0].squid,0); // Preserve undo baseline.
for(const field of ['count','evidence']){
 ctx.input=structuredClone(earlier);
 if(field==='count')ctx.input.villains[0].squid=4;
 else ctx.input.imported.squidStartEvidence={frame:'independent-review.jpg'};
 assert.equal(vm.runInContext('correctedHand(input,patch).status',ctx),'skipped');
}
ctx.bad=plain(ctx.patch.squidState.after);ctx.bad.players[0].squid=-1;
assert.equal(vm.runInContext('validSquidState(bad,1)',ctx),false);
ctx.bad=plain(ctx.patch.squidState.after);ctx.bad.players[0].cards=['2s','2h'];
assert.equal(vm.runInContext('validSquidState(bad,1)',ctx),false);
ctx.bad=plain(ctx.patch.squidState.after);ctx.bad.players[0].squid=0;
assert.equal(vm.runInContext('validSquidState(bad,1)',ctx),false);
console.log('PASS: reviewed squid withdrawals converge, preserve other fields, repeat safely, and reject changed counts/provenance or out-of-scope fields.');
