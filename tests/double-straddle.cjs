const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const c = vm.createContext({console});
vm.runInContext(fs.readFileSync('stats.js','utf8'),c);
c.h = {
  villains: ['HJ','CO','BN','SB','BB','STD','U7'].map((pos,i)=>({pos,opponentId:'p'+i})),
  blinds:{sb:100,bb:200,std:1000}, board:[],
  actions:[['v0','fold'],['v1','fold'],['v2','fold'],['v3','limp','$900'],['v4','fold'],['v5','limp','$600'],['v6','raise','$11000'],['v3','fold'],['v5','fold']].map(([actor,act,size])=>({street:'pre',actor,act,size}))
};
const run = s=>vm.runInContext(s,c), plain = x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(run('straddlePosts(h)')),[{pos:'STD',amount:400},{pos:'U7',amount:1000}]);
const broken = structuredClone(c.h); broken.actions[5].size='$1000';c.single=broken;
assert.deepEqual(plain(run('straddlePosts(single)')),[{pos:'STD',amount:1000}]);
c.partial = structuredClone(c.h);c.partial.actions.shift();
assert.equal(run('straddlePosts(partial).length'),1); // first visible fold alone is insufficient
c.explicit=structuredClone(c.h);c.explicit.blinds.straddles=[{pos:'STD',amount:400},{pos:'U7',amount:1000}];c.explicit.actions=[];
assert.equal(run('straddlePosts(explicit).length'),2);
// Price the first flop bet after both blinds complete: 100+200+400+1000+900+600 = 3200.
c.priced=structuredClone(c.h);c.priced.actions=c.priced.actions.slice(0,6);c.priced.actions.push({street:'pre',actor:'v6',act:'check'},{street:'flop',actor:'v3',act:'bet',size:'$1600'});

assert.equal(run('potWalk(priced)[0].pot'),3200);
console.log('Passed: screenshot hand, explicit posts, missing-action and single-straddle guards, flop pot.');

vm.runInContext(`const chipUnit = () => 1; const chipStr = String; const oppById = () => null; const runTwiceBoard = () => null; const actParts = (a) => ({verb:a.act,to:true});`,c);
vm.runInContext(fs.readFileSync('replay.js','utf8'),c);
assert.equal(run('rpBuild(h).frames[0].potStreet'),1700);
assert.equal(run('rpBuild(h).frames[0].inv.v5'),400);
assert.equal(run('rpBuild(h).frames[0].inv.v6'),1000);
assert.equal(run('rpBuild(h).frames[6].potStreet'),3200);
console.log('Passed: replay posts both straddles and prices completions correctly.');
c.triple=structuredClone(c.h); c.triple.blinds.straddles=[{pos:'STD',amount:400},{pos:'U7',amount:1000},{pos:'HJ',amount:2000}];c.triple.blinds.std=2000;
assert.equal(run('rpBuild(triple).frames[0].potStreet'),3700);
assert.equal(run('rpBuild(triple).frames[0].inv.v0'),2000);
console.log('Passed: explicit triple straddle preserved in replay.');
