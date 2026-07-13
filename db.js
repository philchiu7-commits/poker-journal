/* db.js — promise-wrapped IndexedDB + JSON export/import (the only backup path). */

const DB_NAME = "poker-journal";
const DB_VERSION = 1;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const opp = db.createObjectStore("opponents", { keyPath: "id" });
      opp.createIndex("name", "name");
      const hands = db.createObjectStore("hands", { keyPath: "id" });
      hands.createIndex("sessionId", "sessionId");
      hands.createIndex("ts", "ts");
      hands.createIndex("villainIds", "villainIds", { multiEntry: true });
      const ses = db.createObjectStore("sessions", { keyPath: "id" });
      ses.createIndex("startedAt", "startedAt");
      db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function _tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPut = (store, obj) => _tx(store, "readwrite", (s) => s.put(obj));
const dbGet = (store, id) => _tx(store, "readonly", (s) => s.get(id));
const dbAll = (store) => _tx(store, "readonly", (s) => s.getAll());
const dbDel = (store, id) => _tx(store, "readwrite", (s) => s.delete(id));
const dbByIndex = (store, index, value) =>
  _tx(store, "readonly", (s) => s.index(index).getAll(value));

const metaGet = async (key) => (await dbGet("meta", key))?.value ?? null;
const metaSet = (key, value) => dbPut("meta", { key, value });

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ---------- export / import ---------- */

async function exportData() {
  const [opponents, hands, sessions] = await Promise.all(
    ["opponents", "hands", "sessions"].map(dbAll));
  return { app: "poker-journal", version: 1, exportedAt: Date.now(), opponents, hands, sessions };
}

async function exportJSON() {
  const data = await exportData();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `poker-journal-${stamp}.json`;
  const file = new File([JSON.stringify(data)], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); }
    catch (e) { if (e.name === "AbortError") return false; throw e; }
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  await metaSet("lastExportAt", Date.now());
  return true;
}

const normName = (s) => (s || "").trim().toLowerCase();
const dedupeById = (arr) => { const seen = new Set(); return arr.filter((x) => x && x.id && !seen.has(x.id) && seen.add(x.id)); };
const recReads = (o) => o.reads && typeof o.reads === "object" ? o.reads
  : (Array.isArray(o.tags) ? Object.fromEntries(o.tags.map((id) => [id, "yes"])) : {});

/* Fold incoming opponent `from` into existing `into` (union; survivor keeps identity). */
function mergeOppRecords(into, from) {
  const ir = (into.reads = recReads(into)), fr = recReads(from);
  for (const [k, st] of Object.entries(fr)) if (!ir[k]) ir[k] = st;   // survivor wins conflicts
  into.notes = dedupeById([...(into.notes || []), ...(from.notes || [])]).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  into.exploits = dedupeById([...(into.exploits || []), ...(from.exploits || [])]).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  into.exploitDismissed = [...new Set([...(into.exploitDismissed || []), ...(from.exploitDismissed || [])])];
  if (!into.group && from.group) into.group = from.group;
  if (!into.physical && from.physical) into.physical = from.physical;
  into.updatedAt = Date.now();
}

/* Merge by id (newer wins); when an incoming opponent's id is new but its NAME
   uniquely matches an existing profile, fold it in and remap its hands' villain
   refs — so re-logging hands for an existing opponent never spawns a duplicate.
   Never wipes existing data. */
async function importJSON(data) {
  if (!data || data.app !== "poker-journal" || !Array.isArray(data.opponents))
    throw new Error("Not a poker-journal export file");
  const counts = { opponents: 0, merged: 0, hands: 0, sessions: 0 };

  const existing = await dbAll("opponents");
  const nameCount = {};
  for (const o of existing) nameCount[normName(o.name)] = (nameCount[normName(o.name)] || 0) + 1;
  const nameToId = {};                       // only names unique among existing profiles
  for (const o of existing) if (nameCount[normName(o.name)] === 1) nameToId[normName(o.name)] = o.id;
  const existingIds = new Set(existing.map((o) => o.id));
  const remap = {};                          // incoming id -> surviving id

  for (const rec of data.opponents) {
    if (!rec.id) continue;
    if (existingIds.has(rec.id)) {           // same id already present — plain newer-wins
      const cur = await dbGet("opponents", rec.id);
      if (!cur || (rec.updatedAt || 0) > (cur.updatedAt || 0)) { await dbPut("opponents", rec); counts.opponents++; }
      continue;
    }
    const matchId = nameToId[normName(rec.name)];
    if (matchId) {                           // new id but known name — fold into the existing profile
      const into = await dbGet("opponents", matchId);
      mergeOppRecords(into, rec);
      await dbPut("opponents", into);
      remap[rec.id] = matchId;
      counts.merged++;
    } else {                                 // genuinely new opponent
      await dbPut("opponents", rec);
      existingIds.add(rec.id);
      nameToId[normName(rec.name)] = rec.id; // later same-name incoming folds into this one too
      counts.opponents++;
    }
  }

  const hasRemap = Object.keys(remap).length > 0;
  for (const rec of data.hands || []) {
    if (!rec.id) continue;
    if (hasRemap) {
      for (const v of rec.villains || []) if (remap[v.opponentId]) v.opponentId = remap[v.opponentId];
      if (Array.isArray(rec.villainIds)) rec.villainIds = [...new Set(rec.villainIds.map((x) => remap[x] || x))];
    }
    const cur = await dbGet("hands", rec.id);
    if (!cur || (rec.updatedAt || rec.ts || 0) > (cur.updatedAt || cur.ts || 0)) { await dbPut("hands", rec); counts.hands++; }
  }
  for (const rec of data.sessions || []) {
    if (!rec.id) continue;
    const cur = await dbGet("sessions", rec.id);
    if (!cur || (rec.updatedAt || rec.ts || 0) > (cur.updatedAt || cur.ts || 0)) { await dbPut("sessions", rec); counts.sessions++; }
  }
  return counts;
}
