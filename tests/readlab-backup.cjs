const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const meta=new Map();
const c=vm.createContext({console,Date,Math,meta,setTimeout,clearTimeout,structuredClone});
vm.runInContext(fs.readFileSync('db.js','utf8').replace(/const (dbGet|dbAll|dbPut|metaGet|metaSet) =/g,'let $1 =')+`\ndbGet=async()=>null;dbAll=async()=>[];dbPut=async()=>{};metaGet=async k=>meta.get(k)??null;metaSet=async(k,v)=>meta.set(k,structuredClone(v));`,c);
(async()=>{
 meta.set('readLabRulesV1',{test:{min:3,updatedAt:1}});
 c.data={app:'poker-journal',opponents:[],hands:[],sessions:[],meta:{readLabRulesV1:{test:{min:4,updatedAt:2}},readLabFeedbackV1:[{player:'p',rule:'test',note:'Expected draw',ts:1}]}};
 const receipt=await vm.runInContext('importJSON(data)',c);
 assert.equal(meta.get('readLabRulesV1').test.min,4);
 const backup=await vm.runInContext('exportData()',c);
 assert.equal(backup.meta.readLabRulesV1.test.min,4);assert.equal(backup.meta.readLabFeedbackV1.length,1);
 c.logid=receipt.logId;await vm.runInContext('undoImport(logid)',c);
 assert.equal(meta.get('readLabRulesV1').test.min,3);assert.equal(meta.get('readLabFeedbackV1'),null);
 console.log('PASS: Read Lab rules/feedback backup, newer-rule import, and import undo.');
})().catch(e=>{console.error(e);process.exit(1)});

// Merging a stale backup preserves newer per-read edits and explicit clears.
const merged = vm.runInContext(`(() => {
  const into = {
    reads: { 'tell-acting': 'yes' },
    readLabManual: { 'tell-acting': { value: null, ts: 10 } },
    readLabSamples: { 'all:river-over': { value: 5, ts: 10 } },
  };
  mergeOppRecords(into, {
    reads: { 'tell-acting': 'no' },
    readLabManual: {
      'tell-acting': { value: 'yes', ts: 9 },
      'talks-when-strong': { value: 'no', ts: 4 },
    },
    readLabSamples: { 'all:river-over': { value: 3, ts: 11 } },
  });
  return into;
})()`, c);
assert.equal(merged.reads['tell-acting'], 'yes');
assert.equal(merged.readLabManual['tell-acting'].value, null);
assert.equal(merged.readLabManual['talks-when-strong'].value, 'no');
assert.equal(merged.readLabSamples['all:river-over'].value, 3);
