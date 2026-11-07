const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console});vm.runInContext(fs.readFileSync('stats.js','utf8'),c);
const make=(id,squid,fold=false)=>({id,ts:1,updatedAt:1,imported:{},villainIds:['p','other'],villains:[{opponentId:'p',pos:'CO',squid},{opponentId:'other',pos:'BN',squid:squid===0?3:0}],squid:{have:99},blinds:{sb:1,bb:2},board:['As','Kd','2c','3h','4c'],actions:[['pre','v0','limp'],['pre','v1','raise','$10'],['pre','v0',fold?'fold':'call'],...(!fold?[['flop','v0','check'],['flop','v1','bet','$10'],['flop','v0','call'],['turn','v0','bet','$20'],['turn','v1','fold']]:[])].map(([street,actor,act,size])=>({street,actor,act,size}))});
c.hands=[make('no',0),make('yes',1,true),make('two',2),make('unknown',null),make('missing',undefined)];
const run=s=>vm.runInContext(s,c);
assert.equal(run("hudFor('p',hands,'all').seats"),5);
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
