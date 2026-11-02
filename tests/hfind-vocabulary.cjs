const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({ console });
vm.runInContext('const POST_AGG = ["bet","raise","3bet","4bet","5bet","jam"];', ctx);
for (const f of ['stats.js', 'hfind.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
vm.runInContext(`
const act = (street, actor, act) => ({street, actor, act});
const hand = (actions) => ({ villains: [{opponentId:'opp',pos:'BB'}], actions, board:[] });
const match = (h,q) => hqMatch(h,'opp',hqParse(q));
`, ctx);
const run = (s) => vm.runInContext(s, ctx);
for (const term of ['VPIP','voluntarily put money in','XT','checked to','Bluff XT','bluffs when checked to','GS','wFD']) {
  assert.equal(run(`hqParse(${JSON.stringify(term)}).unknown.length`), 0, term);
  assert.ok(run(`hqParse(${JSON.stringify(term)}).groups.length`), term);
}
for (const action of ['limp','call','raise','3bet','4bet','jam']) assert.equal(run(`match(hand([act('pre','v0','${action}')]),'vpip')`),true,action);
for (const action of ['check','fold']) assert.equal(run(`match(hand([act('pre','v0','${action}')]),'vpip')`),false,action);
assert.equal(run(`match(hand([act('pre','hero','raise'),act('pre','v0','fold')]),'vpip')`),false);
assert.equal(run(`match(hand([act('flop','v0','call')]),'vpip')`),false);
assert.equal(run(`match(hand([act('pre','v0','check')]),'no vpip')`),true);
assert.equal(run(`hqParse('vpip turn').bad.length`),1);
assert.equal(run(`hqParse('GS turn').groups[0][0].val`),'gut');
assert.equal(run(`hqParse('wFD flop').groups[0][0].val`),'fd');
for (const phrase of ['BXT','bet when checked to','stab']) assert.equal(run(`hqParse(${JSON.stringify(phrase)}).groups[0][0].kind`),'bxt');
run(`const checked = hand([act('pre','hero','raise'),act('pre','v0','call'),act('flop','hero','check'),act('flop','v0','check')]);`);
assert.equal(run(`match(checked,'XT flop')`),true);
assert.equal(run(`match(checked,'BXT flop')`),false);
assert.equal(run(`match(hand([act('pre','hero','raise'),act('flop','hero','bet'),act('flop','v0','call')]),'XT flop')`),false);
assert.equal(run(`match(hand([act('pre','hero','raise'),act('flop','v0','bet')]),'XT flop')`),false);
run(`const stab = hand([act('pre','hero','raise'),act('flop','hero','check'),act('flop','v0','bet')]);`);
assert.equal(run(`match(stab,'BXT flop')`),true);
assert.equal(run(`match(stab,'Bluff XT flop')`),false); // no cards: unknown, excluded
assert.equal(run(`match(stab,'no Bluff XT flop')`),false);
console.log('Passed: VPIP participation, negation, street limits, XT opportunities, BXT aliases, card requirements, GS and wFD.');
// Isolate the search's street/card handling from the hand-strength evaluator.
run(`const readEstimates = () => {}; madeClass = (hole, board) => board[0] === 'As' ? 'B' : 'V';
const shownStab = {...stab, villains:[{opponentId:'opp', cards:['7c','6d']}], board:['As','Kh','2d']};`);
assert.equal(run(`match(shownStab,'Bluff XT flop')`),true);
assert.equal(run(`match({...shownStab,board:['Qs','Kh','2d']},'Bluff XT flop')`),false);
assert.equal(run(`match(shownStab,'Bluff XT turn')`),false);
console.log('Passed: Bluff XT applies the strength classifier to the named betting street.');
