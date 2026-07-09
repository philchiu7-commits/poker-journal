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

/* Merge by id — imported record wins only if newer. Never wipes existing data. */
async function importJSON(data) {
  if (!data || data.app !== "poker-journal" || !Array.isArray(data.opponents))
    throw new Error("Not a poker-journal export file");
  const counts = { opponents: 0, hands: 0, sessions: 0 };
  for (const store of ["opponents", "hands", "sessions"]) {
    for (const rec of data[store] || []) {
      if (!rec.id) continue;
      const cur = await dbGet(store, rec.id);
      const newer = !cur || (rec.updatedAt || rec.ts || 0) > (cur.updatedAt || cur.ts || 0);
      if (newer) { await dbPut(store, rec); counts[store]++; }
    }
  }
  return counts;
}
