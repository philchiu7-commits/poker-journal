const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console});vm.runInContext(fs.readFileSync('stats.js','utf8'),c);
c.hands=[
 ['call',['limp','raise','call']],
 ['fold',['limp','raise','fold']],
 ['reraise',['limp','raise','3bet','4bet','call']],
 ['walk',['limp','check']],
 ['later-fold',['limp','raise','call','3bet','fold']],
].map(([id,seq])=>({id,imported:{},villains:[{opponentId:'p',pos:'CO'},{opponentId:'q',pos:'BN'}],blinds:{sb:1,bb:2},actions:seq.map((act,i)=>({street:'pre',actor:i%2?'v1':'v0',act,size:act==='raise'?'$10':act==='3bet'?'$30':act==='4bet'?'$80':null}))}));
const result=vm.runInContext("hudCount('p',hands)",c);
assert.equal(result.byPos.CO.faced,4);assert.equal(result.byPos.CO.lcall,2);assert.equal(result.limpCall,2);
assert.deepEqual(JSON.parse(JSON.stringify(result.ev['lcall|CO'])),[{id:'call',ok:true},{id:'fold',ok:false},{id:'reraise',ok:false},{id:'later-fold',ok:true}]);
console.log('Passed: limp-call count, raised-limp denominator, drill-down, limp-reraise exclusion and later fold.');
