/* app.js — routing, views, and the hand-entry state machine. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- in-memory caches (source of truth is IndexedDB) ---------- */
let OPP = [], HANDS = [];
let curOppId = null, curHandId = null;

const oppById = (id) => OPP.find((o) => o.id === id);

async function refreshCache() {
  [OPP, HANDS] = await Promise.all(["opponents", "hands"].map(dbAll));
}

/* ---------- small utils ---------- */
function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 1800);
}
const suitOf = (c) => SUITS.find((s) => s.id === c[c.length - 1]);
const cardHTML = (c) => c ? `<span class="${suitOf(c).cls}">${c.slice(0, -1)}${suitOf(c).sym}</span>` : "";
const cardsStr = (cs) => (cs || []).filter(Boolean).join("");

/* ---------- bottom sheet ---------- */
function showSheet(html) {
  $("sheet").innerHTML = html;
  $("sheet").classList.remove("hidden");
  $("sheet-backdrop").classList.remove("hidden");
}
function hideSheet() {
  $("sheet").classList.add("hidden");
  $("sheet-backdrop").classList.add("hidden");
}

/* ---------- routing ---------- */
const VIEWS = ["opponents", "opp", "hand", "hands", "handview", "data"];
const TAB_FOR = { opponents: "opponents", opp: "opponents", hand: "hand", hands: "hands", handview: "hands", data: "data" };

function route() {
  const [view, arg] = (location.hash || "#opponents").slice(1).split("/");
  const v = VIEWS.includes(view) ? view : "opponents";
  VIEWS.forEach((x) => $("view-" + x).classList.toggle("hidden", x !== v));
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.classList.toggle("on", b.dataset.tab === TAB_FOR[v]));
  hideSheet();
  ({ opponents: renderOpponents, opp: () => renderOppDetail(arg), hand: renderHandEntry,
     hands: renderHandsFeed, handview: () => renderHandView(arg), data: renderData })[v]();
  window.scrollTo(0, 0);
}

/* ================= Opponents list ================= */

function oppStats() {
  const m = {};
  for (const h of HANDS) for (const vid of h.villainIds || []) {
    m[vid] = m[vid] || { count: 0, last: 0 };
    m[vid].count++; m[vid].last = Math.max(m[vid].last, h.ts);
  }
  return m;
}

function updateGroupsDatalist() {
  $("groups").innerHTML = [...new Set(OPP.map((o) => o.group).filter(Boolean))]
    .map((g) => `<option value="${esc(g)}">`).join("");
}

function oppRowHTML(o, st) {
  const tags = (o.tags || []).slice(0, 3)
    .map((t) => `<span class="chip mini on">${esc(TAG_BY_ID[t]?.label || t)}</span>`).join("");
  const sub = [st ? `${st.count} hand${st.count > 1 ? "s" : ""}` : "", o.physical]
    .filter(Boolean).join(" · ");
  return `<div class="lrow" data-opp="${o.id}">
    <div class="t">${esc(o.name)}<span class="when">${st ? fmtWhen(st.last) : ""}</span></div>
    ${sub ? `<div class="s">${esc(sub)}</div>` : ""}
    ${tags ? `<div class="chiprow" style="margin-top:6px">${tags}</div>` : ""}
  </div>`;
}

function renderOpponents() {
  const q = $("opp-search").value.trim().toLowerCase();
  const stats = oppStats();
  let list = OPP.filter((o) => !o.archived);
  if (q) list = list.filter((o) =>
    [o.name, o.physical, o.group].join(" ").toLowerCase().includes(q));
  list.sort((a, b) =>
    (stats[b.id]?.last || b.updatedAt || 0) - (stats[a.id]?.last || a.updatedAt || 0));
  // section by group (groups alphabetical, ungrouped last)
  const groups = [...new Set(list.map((o) => o.group || ""))]
    .sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  $("opp-list").innerHTML = list.length ? groups.map((g) => {
    const rows = list.filter((o) => (o.group || "") === g)
      .map((o) => oppRowHTML(o, stats[o.id])).join("");
    const head = groups.length > 1 || g
      ? `<div class="tagcat">${esc(g || "ungrouped")}</div>` : "";
    return head + rows;
  }).join("") : `<div class="empty">No opponents yet — tap ＋ to add your first villain.</div>`;
  updateGroupsDatalist();
}

async function createOpponent(name, group) {
  const o = { id: uid(), name, group: group || "", tags: [], physical: "", notes: [],
    createdAt: Date.now(), updatedAt: Date.now(), archived: false };
  OPP.push(o);
  await dbPut("opponents", o);
  return o;
}

/* ================= Opponent detail ================= */

function renderOppDetail(id) {
  const o = oppById(id);
  if (!o) { location.hash = "#opponents"; return; }
  curOppId = id;
  $("od-name").textContent = o.name;
  $("od-meta").textContent = [o.group, o.physical].filter(Boolean).join(" · ");
  $("od-editform").classList.add("hidden");
  $("od-e-name").value = o.name;
  $("od-e-group").value = o.group || "";
  $("od-e-physical").value = o.physical || "";

  $("od-tags").innerHTML = TAG_CATS.map((cat) =>
    `<div class="tagcat">${cat}</div><div class="chiprow">` +
    TENDENCY_TAGS.filter((t) => t.cat === cat).map((t) =>
      `<button class="chip mini${(o.tags || []).includes(t.id) ? " on" : ""}" data-tag="${t.id}">${t.label}</button>`
    ).join("") + `</div>`).join("");

  $("od-notes").innerHTML = (o.notes || []).map((n) =>
    `<div class="noteitem">${esc(n.text)}<div class="when">${fmtWhen(n.ts)}</div></div>`
  ).join("") || `<div class="empty">No notes yet.</div>`;

  const hands = HANDS.filter((h) => (h.villainIds || []).includes(id)).sort((a, b) => b.ts - a.ts);
  $("od-hands").innerHTML = hands.map(handRowHTML).join("") ||
    `<div class="empty">No hands logged.</div>`;
}

/* ================= Hand rendering (rows + full text) ================= */

function actorLabel(h, actor) {
  if (actor === "hero") return "Hero";
  const i = Number(actor.slice(1));
  return oppById(h.villains?.[i]?.opponentId)?.name || `V${i + 1}`;
}
function actionStr(h, a) {
  return `${actorLabel(h, a.actor)} ${a.act}${a.size ? " " + a.size : ""}`;
}
function handSummary(h) {
  if (h.note) return h.note;
  const acts = (h.actions || []).map((a) => actionStr(h, a)).join(", ");
  return acts || cardsStr(h.board) || "—";
}
function handRowHTML(h) {
  const names = (h.villains || []).map((v) => oppById(v.opponentId)?.name).filter(Boolean).join(", ");
  return `<div class="lrow" data-hand="${h.id}">
    <div class="t">${esc(names || "Hand")}<span class="when">${fmtWhen(h.ts)}</span></div>
    <div class="s">${esc(handSummary(h))}</div>
  </div>`;
}

function boardFor(h, street) {
  const b = h.board || [];
  if (street === "flop") return b.slice(0, 3).filter(Boolean).join("");
  if (street === "turn") return b[3] || "";
  if (street === "river") return b[4] || "";
  return "";
}

/* Plain-text hand render — also the future LLM serialization format. */
function handText(h) {
  const L = [];
  L.push(new Date(h.ts).toLocaleString());
  const seat = (pos) => (pos ? ` (${pos})` : "");
  const players = [
    `Hero${seat(h.heroPos)}${h.heroCards ? " " + cardsStr(h.heroCards) : ""}`,
    ...(h.villains || []).map((v, i) =>
      `${actorLabel(h, "v" + i)}${seat(v.pos)}${v.cards ? " " + cardsStr(v.cards) : ""}`),
  ];
  L.push(players.join("  vs  "));
  if (h.blinds) {
    const b = [];
    if (h.blinds.sb) b.push(h.blinds.sb);
    if (h.blinds.bb) b.push(h.blinds.bb);
    const line = b.join("/") + (h.blinds.std ? ` (${h.blinds.std} straddle)` : "");
    if (line) L.push(`Blinds: ${line}`);
  }
  if (h.effStack) L.push(`Eff. stack: $${h.effStack}`);
  for (const st of STREETS) {
    const acts = (h.actions || []).filter((a) => a.street === st);
    const board = boardFor(h, st);
    if (!acts.length && !board) continue;
    L.push(`${st.toUpperCase()}${board ? " [" + board + "]" : ""}:  ` +
      (acts.map((a) => actionStr(h, a)).join(", ") || "—"));
  }
  if (h.note) L.push(`Note: ${h.note}`);
  return L.join("\n");
}

/* ================= Hands feed + detail ================= */

function renderHandsFeed() {
  const hands = [...HANDS].sort((a, b) => b.ts - a.ts);
  $("hands-list").innerHTML = hands.map(handRowHTML).join("") ||
    `<div class="empty">No hands yet — log one from the Hand tab.</div>`;
}

function renderHandView(id) {
  const h = HANDS.find((x) => x.id === id);
  if (!h) { location.hash = "#hands"; return; }
  curHandId = id;
  $("hv-text").textContent = handText(h);
}

/* ================= Data / backup ================= */

function renderData() {
  metaGet("lastExportAt").then((ts) => {
    const days = ts ? Math.floor((Date.now() - ts) / 86400000) : null;
    $("data-backupnag").textContent = ts
      ? (days === 0 ? "Backed up today." : `Last backup ${days} day${days > 1 ? "s" : ""} ago.`)
      : "Never backed up — data lives only on this phone.";
  });
  $("data-stats").textContent = `${OPP.length} opponents · ${HANDS.length} hands`;
}

/* ================= Hand entry ================= */

function newDraft(keep) {
  return {
    id: null, ts: null,
    villains: keep ? keep.villains.map((v) => ({ opponentId: v.opponentId, pos: v.pos, cards: [null, null] })) : [],
    heroPos: keep ? keep.heroPos : null, heroCards: [null, null],
    board: [null, null, null, null, null],
    actions: [], street: "pre", actor: null, lastV: "v0",
    note: "", effStack: "",
    sb: keep ? keep.sb : "", bb: keep ? keep.bb : "", std: keep ? keep.std : "",
  };
}
let draft = newDraft();
let undoStack = [];

function mutate(fn) {
  undoStack.push(JSON.stringify(draft));
  if (undoStack.length > 80) undoStack.shift();
  fn();
  draftChanged();
}
function undo() {
  const s = undoStack.pop();
  if (s) { draft = JSON.parse(s); draftChanged(); }
}
function draftChanged() {
  metaSet("draftHand", JSON.parse(JSON.stringify(draft)));
  renderHandEntry();
}
function currentActor() {
  return draft.actor || (draft.villains.length ? "v0" : "hero");
}
function ensureVillainSlot() {
  if (!draft.villains.length)
    draft.villains.push({ opponentId: null, pos: null, cards: [null, null] });
}

function lineText(d) {
  const parts = [];
  d.villains.forEach((v, i) => {
    const nm = v.opponentId ? (oppById(v.opponentId)?.name || "?") : "V" + (i + 1);
    parts.push(nm + (v.pos ? " " + v.pos : ""));
  });
  if (d.heroPos || d.heroCards.some(Boolean))
    parts.push("Hero" + (d.heroPos ? " " + d.heroPos : "") +
      (d.heroCards.some(Boolean) ? " " + cardsStr(d.heroCards) : ""));
  if (d.effStack) parts.push("eff $" + d.effStack);
  for (const st of STREETS) {
    const acts = d.actions.filter((a) => a.street === st);
    const b = boardFor(d, st);
    if (!acts.length && !b) continue;
    if (st !== "pre") parts.push("｜" + st.toUpperCase() + (b ? " " + b : ""));
    acts.forEach((a) =>
      parts.push(actorLabel(d, a.actor) + " " + a.act + (a.size ? " " + a.size : "")));
  }
  return parts.join(" · ");
}

function renderHandEntry() {
  const d = draft;

  // hand line
  const lt = lineText(d);
  $("he-line").textContent = lt || "New hand — tap a villain";
  $("he-line").classList.toggle("muted", !lt);

  // villain chips (existing opponents only — add new ones in the Opponents tab)
  const stats = oppStats();
  const sorted = OPP.filter((o) => !o.archived).sort((a, b) =>
    (stats[b.id]?.last || b.updatedAt || 0) - (stats[a.id]?.last || a.updatedAt || 0));
  const selIds = d.villains.map((v) => v.opponentId);
  $("he-villains").innerHTML = sorted.map((o) =>
    `<button class="chip${selIds.includes(o.id) ? " on" : ""}" data-vopp="${o.id}">${esc(o.name)}</button>`
  ).join("") || `<div class="empty" style="padding:6px">Add opponents in the Opponents tab first.</div>`;

  // position rows
  $("he-heropos").innerHTML = POSITIONS.map((p) =>
    `<button class="chip mini${d.heroPos === p ? " on" : ""}" data-hpos="${p}">${p}</button>`).join("");
  const vpos = d.villains[0]?.pos || null;
  $("he-vpos").innerHTML = POSITIONS.map((p) =>
    `<button class="chip mini${vpos === p ? " on" : ""}" data-vpos="${p}">${p}</button>`).join("");

  // street segment
  $("he-street").innerHTML = STREETS.map((s) =>
    `<button class="${d.street === s ? "on" : ""}" data-street="${s}">${s.toUpperCase()}</button>`).join("");

  // actor segment: HERO + one per villain
  const cur = currentActor();
  const vBtns = d.villains.map((v, i) => {
    const nm = v.opponentId ? (oppById(v.opponentId)?.name || "?").slice(0, 9) : "V" + (i + 1);
    return `<button class="${cur === "v" + i ? "on" : ""}" data-actor="v${i}">${esc(nm)}</button>`;
  }).join("") || `<button class="${cur === "v0" ? "on" : ""}" data-actor="v0">VILLAIN</button>`;
  $("he-actor").innerHTML =
    `<button class="${cur === "hero" ? "on" : ""}" data-actor="hero">HERO</button>` + vBtns;

  // action buttons — street-aware: no Bet preflop (3bet instead), no Limp postflop
  const acts = d.street === "pre" ? ACTS_PRE : ACTS_POST;
  $("he-acts").innerHTML = acts.map((a) =>
    `<button data-act="${a}">${a === "3bet" ? "3bet" : a[0].toUpperCase() + a.slice(1)}</button>`).join("");

  // size strip (when last action is a sizeable bet/raise/3bet without a size yet)
  const last = d.actions[d.actions.length - 1];
  const needSize = last && SIZED_ACTS.includes(last.act) && !last.size;
  $("he-sizes").classList.toggle("hidden", !needSize);
  if (needSize) {
    const sizes = last.street === "pre" ? SIZES_PRE : SIZES_POST;
    $("he-sizes").innerHTML = sizes.map((s) =>
      `<button class="chip" data-size="${s}">${s}</button>`).join("") +
      `<input data-sizenum type="number" placeholder="$" inputmode="numeric">`;
  }

  // card slots
  const slotBtn = (zone, i, card, lbl) =>
    `<button class="cslot${card ? " filled" : ""}" data-slot="${zone}:${i}">` +
    (card ? cardHTML(card) : `<span class="lbl">${lbl}</span>`) + `</button>`;
  let ch = d.board.map((c, i) => slotBtn("board", i, c, ["F", "F", "F", "T", "R"][i])).join("");
  ch += `<span class="cdiv">hero</span>` + d.heroCards.map((c, i) => slotBtn("hero", i, c, "?")).join("");
  d.villains.forEach((v, i) => {
    const nm = v.opponentId ? (oppById(v.opponentId)?.name || "?").slice(0, 6) : "V" + (i + 1);
    ch += `<span class="cdiv">${esc(nm)}</span>` +
      (v.cards || [null, null]).map((c, j) => slotBtn("v" + i, j, c, "?")).join("");
  });
  $("he-cards").innerHTML = ch;

  // note + blinds + eff stack (don't clobber focused inputs)
  for (const [id, val] of [["he-note", d.note], ["he-sb", d.sb], ["he-bb", d.bb],
                           ["he-std", d.std], ["he-effstack", d.effStack]])
    if (document.activeElement !== $(id)) $(id).value = val;
}

/* --- hand-entry interactions (delegated, bound once) --- */

function bindHandEntry() {
  $("view-hand").addEventListener("click", (e) => {
    const b = e.target.closest("button, input");
    if (!b) return;

    if (b.dataset.vopp !== undefined) {          // toggle villain selection
      mutate(() => {
        const i = draft.villains.findIndex((v) => v.opponentId === b.dataset.vopp);
        if (i >= 0) draft.villains.splice(i, 1);
        else draft.villains.push({ opponentId: b.dataset.vopp, pos: null, cards: [null, null] });
      });
    } else if (b.dataset.hpos) {
      mutate(() => { draft.heroPos = draft.heroPos === b.dataset.hpos ? null : b.dataset.hpos; });
    } else if (b.dataset.vpos) {
      mutate(() => {
        ensureVillainSlot();
        draft.villains[0].pos = draft.villains[0].pos === b.dataset.vpos ? null : b.dataset.vpos;
      });
    } else if (b.dataset.street) {
      mutate(() => { draft.street = b.dataset.street; });
    } else if (b.dataset.actor) {
      mutate(() => {
        draft.actor = b.dataset.actor;
        if (b.dataset.actor.startsWith("v")) draft.lastV = b.dataset.actor;
      });
    } else if (b.dataset.act) {
      mutate(() => {
        const actor = currentActor();
        if (actor.startsWith("v")) { ensureVillainSlot(); draft.lastV = actor; }
        draft.actions.push({ street: draft.street, actor, act: b.dataset.act, size: null });
        draft.actor = actor === "hero" ? draft.lastV : "hero";   // auto-alternate
      });
    } else if (b.dataset.size) {
      mutate(() => {
        const last = draft.actions[draft.actions.length - 1];
        if (last) last.size = b.dataset.size;
      });
    } else if (b.dataset.slot) {
      openCardSheet(b.dataset.slot);
    }
  });

  $("view-hand").addEventListener("change", (e) => {
    if (e.target.dataset?.sizenum !== undefined) {
      const v = e.target.value.trim();
      if (v) mutate(() => {
        const last = draft.actions[draft.actions.length - 1];
        if (last) last.size = "$" + v;
      });
    }
  });

  $("he-undo").onclick = undo;
  const persistDraft = () => metaSet("draftHand", JSON.parse(JSON.stringify(draft)));
  $("he-note").oninput = () => { draft.note = $("he-note").value; persistDraft(); };
  $("he-effstack").oninput = () => { draft.effStack = $("he-effstack").value; persistDraft(); };
  $("he-sb").oninput = () => { draft.sb = $("he-sb").value; persistDraft(); };
  $("he-bb").oninput = () => { draft.bb = $("he-bb").value; persistDraft(); };
  $("he-std").oninput = () => { draft.std = $("he-std").value; persistDraft(); };
  $("he-save").onclick = () => saveHand(false);
  $("he-savenext").onclick = () => saveHand(true);
}

/* --- card picker sheet --- */

function usedCards() {
  return new Set([...draft.board, ...draft.heroCards,
    ...draft.villains.flatMap((v) => v.cards || [])].filter(Boolean));
}
function slotRef(key) {          // "board:2" -> {zone, i, arr}
  const [zone, iS] = key.split(":");
  const i = Number(iS);
  const arr = zone === "board" ? draft.board
    : zone === "hero" ? draft.heroCards
    : (draft.villains[Number(zone.slice(1))] || {}).cards;
  return { zone, i, arr };
}
let sheetSlot = null;

function openCardSheet(key) {
  sheetSlot = key;
  const { zone, i, arr } = slotRef(key);
  if (!arr) return;
  const used = usedCards();
  const cur = arr[i];
  const title = zone === "board" ? `Board · ${["flop", "flop", "flop", "turn", "river"][i]}`
    : zone === "hero" ? "Hero cards" : "Villain cards";
  let grid = "";
  for (const s of SUITS) {
    grid += RANKS.split("").map((r) => {
      const c = r + s.id;
      const dis = used.has(c) && c !== cur;
      return `<button class="${s.cls}${c === cur ? " picked" : ""}" data-card="${c}" ${dis ? "disabled" : ""}>${r}${s.sym}</button>`;
    }).join("");
  }
  showSheet(`<div class="sheethead"><span class="t">${title}</span>
    <button data-clearcard>Clear</button><button data-closesheet>Done</button></div>
    <div class="cardgrid">${grid}</div>`);
}

function sheetClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.closesheet !== undefined) { hideSheet(); return; }

  if (b.dataset.card && sheetSlot) {
    const key = sheetSlot;
    mutate(() => {
      const { zone, i, arr } = slotRef(key);
      arr[i] = b.dataset.card;
      if (zone === "board") advanceStreetFromBoard();
    });
    // auto-advance to next empty slot in the same zone
    const { zone, arr } = slotRef(key);
    const next = arr.findIndex((c) => !c);
    if (next >= 0) openCardSheet(`${zone}:${next}`);
    else hideSheet();
  } else if (b.dataset.clearcard !== undefined && sheetSlot) {
    const key = sheetSlot;
    mutate(() => { const { i, arr } = slotRef(key); arr[i] = null; });
    openCardSheet(key);
  }
}

function advanceStreetFromBoard() {
  const b = draft.board;
  let target = null;
  if (b[4]) target = "river";
  else if (b[3]) target = "turn";
  else if (b[0] && b[1] && b[2]) target = "flop";
  if (target && STREETS.indexOf(target) > STREETS.indexOf(draft.street))
    draft.street = target;
}

/* --- save --- */

function draftHasContent(d) {
  return d.villains.some((v) => v.opponentId) || d.actions.length || d.note.trim() ||
    d.board.some(Boolean) || d.heroCards.some(Boolean);
}

async function saveHand(nextHand) {
  const d = draft;
  if (!draftHasContent(d)) { toast("Nothing to save"); return; }
  const rec = {
    id: d.id || uid(), ts: d.ts || Date.now(), updatedAt: Date.now(),
    heroPos: d.heroPos,
    heroCards: d.heroCards.some(Boolean) ? d.heroCards : null,
    villains: d.villains.map((v) => ({ opponentId: v.opponentId, pos: v.pos || null,
      cards: (v.cards || []).some(Boolean) ? v.cards : null })),
    villainIds: d.villains.map((v) => v.opponentId).filter(Boolean),
    board: d.board, actions: d.actions,
    effStack: d.effStack ? Number(d.effStack) : null,
    blinds: (d.sb || d.bb || d.std)
      ? { sb: d.sb ? Number(d.sb) : null, bb: d.bb ? Number(d.bb) : null, std: d.std ? Number(d.std) : null }
      : null,
    note: d.note.trim(),
  };
  await dbPut("hands", rec);
  const i = HANDS.findIndex((h) => h.id === rec.id);
  if (i >= 0) HANDS[i] = rec; else HANDS.push(rec);

  undoStack = [];
  const primary = oppById(rec.villainIds[0]);
  draft = nextHand ? newDraft(d) : newDraft();
  await metaSet("draftHand", null);
  toast(primary ? `Saved vs ${primary.name}` : "Hand saved");
  renderHandEntry();
}

/* --- edit an existing hand: load into draft --- */

function loadHandIntoDraft(h) {
  const streets = (h.actions || []).map((a) => STREETS.indexOf(a.street));
  draft = {
    id: h.id, ts: h.ts,
    villains: (h.villains || []).map((v) => ({ opponentId: v.opponentId, pos: v.pos,
      cards: v.cards ? [...v.cards] : [null, null] })),
    heroPos: h.heroPos || null,
    heroCards: h.heroCards ? [...h.heroCards] : [null, null],
    board: [...(h.board || [])].concat([null, null, null, null, null]).slice(0, 5),
    actions: (h.actions || []).map((a) => ({ ...a })),
    street: STREETS[Math.max(0, ...streets)] || "pre",
    actor: null, lastV: "v0",
    note: h.note || "",
    effStack: h.effStack != null ? String(h.effStack) : "",
    sb: h.blinds?.sb != null ? String(h.blinds.sb) : "",
    bb: h.blinds?.bb != null ? String(h.blinds.bb) : "",
    std: h.blinds?.std != null ? String(h.blinds.std) : "",
  };
  undoStack = [];
}

/* ================= static bindings + boot ================= */

function bindStatic() {
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.onclick = () => { location.hash = "#" + b.dataset.tab; });
  document.querySelectorAll("[data-back]").forEach((b) =>
    b.onclick = () => history.back());

  // opponents list
  $("opp-search").oninput = renderOpponents;
  $("opp-add").onclick = () => { $("opp-new").classList.toggle("hidden"); $("opp-new-name").focus(); };
  $("opp-new-save").onclick = async () => {
    const name = $("opp-new-name").value.trim();
    if (!name) return;
    const o = await createOpponent(name, $("opp-new-group").value.trim());
    $("opp-new-name").value = ""; $("opp-new-group").value = "";
    $("opp-new").classList.add("hidden");
    location.hash = "#opp/" + o.id;
  };
  $("opp-list").onclick = (e) => {
    const r = e.target.closest("[data-opp]");
    if (r) location.hash = "#opp/" + r.dataset.opp;
  };

  // opponent detail
  $("od-edit").onclick = () => $("od-editform").classList.toggle("hidden");
  $("od-e-save").onclick = async () => {
    const o = oppById(curOppId);
    o.name = $("od-e-name").value.trim() || o.name;
    o.group = $("od-e-group").value.trim();
    o.physical = $("od-e-physical").value.trim();
    o.updatedAt = Date.now();
    await dbPut("opponents", o);
    renderOppDetail(curOppId);
  };
  $("od-e-del").onclick = async () => {
    const o = oppById(curOppId);
    if (!confirm(`Delete ${o.name}? Their hands stay but lose the name.`)) return;
    await dbDel("opponents", o.id);
    OPP = OPP.filter((x) => x.id !== o.id);
    location.hash = "#opponents";
  };
  $("od-tags").onclick = async (e) => {
    const b = e.target.closest("[data-tag]");
    if (!b) return;
    const o = oppById(curOppId);
    const t = b.dataset.tag;
    const i = (o.tags = o.tags || []).indexOf(t);
    i >= 0 ? o.tags.splice(i, 1) : o.tags.push(t);
    o.updatedAt = Date.now();
    await dbPut("opponents", o);
    b.classList.toggle("on");
  };
  $("od-note-add").onclick = async () => {
    const text = $("od-note").value.trim();
    if (!text) return;
    const o = oppById(curOppId);
    (o.notes = o.notes || []).unshift({ id: uid(), ts: Date.now(), text, handId: null });
    o.updatedAt = Date.now();
    await dbPut("opponents", o);
    $("od-note").value = "";
    renderOppDetail(curOppId);
  };
  $("od-hands").onclick = handListClick;
  $("hands-list").onclick = handListClick;

  // hand detail
  $("hv-edit").onclick = () => {
    const h = HANDS.find((x) => x.id === curHandId);
    if (h) { loadHandIntoDraft(h); location.hash = "#hand"; }
  };
  $("hv-delete").onclick = async () => {
    if (!confirm("Delete this hand?")) return;
    await dbDel("hands", curHandId);
    HANDS = HANDS.filter((h) => h.id !== curHandId);
    history.back();
  };

  // data / backup
  $("data-export").onclick = async () => {
    try {
      if (await exportJSON()) { toast("Exported"); renderData(); }
    } catch (e) { toast("Export failed: " + e.message); }
  };
  $("data-import").onclick = () => $("data-importfile").click();
  $("data-importfile").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const counts = await importJSON(JSON.parse(await f.text()));
      await refreshCache();
      toast(`Imported ${counts.opponents} opp · ${counts.hands} hands`);
      renderData();
    } catch (err) { toast("Import failed: " + err.message); }
    e.target.value = "";
  };

  // sheets
  $("sheet").addEventListener("click", sheetClick);
  $("sheet-backdrop").onclick = hideSheet;

  bindHandEntry();
}

function handListClick(e) {
  const r = e.target.closest("[data-hand]");
  if (r) location.hash = "#handview/" + r.dataset.hand;
}

async function boot() {
  await openDB();
  await refreshCache();
  const saved = await metaGet("draftHand");
  if (saved) draft = Object.assign(newDraft(), saved);
  bindStatic();
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
