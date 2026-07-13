/* app.js — routing, views, and the hand-entry state machine. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- in-memory caches (source of truth is IndexedDB) ---------- */
let OPP = [], HANDS = [];
let curOppId = null, curHandId = null;
let editNoteId = null;
let storageDurable = false;
let blindsDefault = { sb: "2", bb: "4", std: "" };   // 2/4 default; sticky once you change it

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
/* Card as a little tile (hand view + rows). `prev` = earlier-street board card, dimmed. */
const tileHTML = (c, prev) => c
  ? `<span class="ctile${prev ? " prev" : ""} ${suitOf(c).cls}">${c.slice(0, -1)}<i>${suitOf(c).sym}</i></span>` : "";
const tilesHTML = (cs) => (cs || []).filter(Boolean).map((c) => tileHTML(c)).join("");

/* ---------- action phrasing (hand-history style: "opens to 40K") ---------- */
const sizeLabel = (s) => !s ? "" :
  /^\$\d/.test(s) ? s.slice(1) + "K" :
  /^\d+(\.\d+)?k$/i.test(s) ? s.toUpperCase() : s;
function actVerb(a) {
  switch (a.act) {
    case "fold":  return "folds";
    case "check": return "checks";
    case "call":  return "calls";
    case "limp":  return "limps";
    case "jam":   return "jams";
    case "bet":   return "bets";
    case "raise": return a.street === "pre" ? "opens" : "raises";
    case "3bet":  return "3-bets";
    case "4bet":  return "4-bets";
    case "5bet":  return "5-bets";
    default:      return a.act;
  }
}
/* Verb + size split for rendering; "bet/raise sized Jam" reads as "jams".
   "to" only fits absolute sizes ("opens to 40K", "3-bets to 4x") — not
   pot-relative ones ("raises pot", "bets 50%"). */
function actParts(a) {
  let verb = actVerb(a), sz = a.size ? sizeLabel(a.size) : null;
  if (sz === "Jam") { verb = "jams"; sz = null; }
  return { verb, sz, to: !!sz && verb !== "bets" && !/%|pot|over/i.test(sz) };
}
function actPhrase(a) {
  const { verb, sz, to } = actParts(a);
  return verb + (sz ? (to ? " to " : " ") + sz : "");
}

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
  if (curOppId !== id) editNoteId = null;
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
    n.id === editNoteId
      ? `<div class="noteitem" data-note="${n.id}">
          <textarea class="noteedit" rows="2">${esc(n.text)}</textarea>
          <div class="noterowbtns">
            <button class="chip mini" data-notecancel>Cancel</button>
            <button class="chip mini on" data-notesave>Save</button>
          </div></div>`
      : `<div class="noteitem" data-note="${n.id}">
          <div class="notetext">${esc(n.text)}</div>
          <div class="noterowbtns">
            <span class="when">${fmtWhen(n.ts)}</span>
            <button class="chip mini" data-noteedit>Edit</button>
            <button class="chip mini" data-notedel>Delete</button>
          </div></div>`
  ).join("") || `<div class="empty">No notes yet.</div>`;

  const hands = HANDS.filter((h) => (h.villainIds || []).includes(id)).sort((a, b) => b.ts - a.ts);
  $("od-hands").innerHTML = hands.map((h) => handRowHTML(h, id)).join("") ||
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
  const bits = [];
  for (const st of STREETS) {
    const acts = (h.actions || []).filter((a) => a.street === st);
    if (!acts.length) continue;
    const s = acts.map((a) => `${actorLabel(h, a.actor)} ${actPhrase(a)}`).join(", ");
    bits.push(st === "pre" ? s : st.toUpperCase() + ": " + s);
  }
  return bits.join("  ·  ") || cardsStr(h.board) || "—";
}
/* A villain's defining action in a hand: their most aggressive one, later
   streets breaking ties — "raises pot (flop)" beats a preflop "calls". */
const ACT_RANK = { jam: 6, "5bet": 5, "4bet": 5, "3bet": 4, raise: 3, bet: 2, call: 1, limp: 1, check: 0, fold: 0 };
function definingAct(h, actor) {
  let best = null;
  for (const a of (h.actions || []).filter((x) => x.actor === actor)) {
    const r = (ACT_RANK[a.act] ?? 0) + (a.size === "Jam" ? 4 : 0);
    if (!best || r >= best.r) best = { a, r };
  }
  return best?.a || null;
}
/* Compact action code for list rows: "R40K", "3B4x", "B50%", "Jam (turn)". */
const ACT_ABBR = { fold: "F", check: "X", call: "C", limp: "L", bet: "B", raise: "R", "3bet": "3B", "4bet": "4B", "5bet": "5B", jam: "Jam" };
function abbrevAct(a) {
  const street = a.street !== "pre" ? ` (${a.street})` : "";
  if (a.act === "jam" || a.size === "Jam") return "Jam" + street;
  const sz = a.size ? sizeLabel(a.size) : "";
  const code = ACT_ABBR[a.act] || a.act;
  return code + (sz ? (/^\d/.test(sz) ? "" : " ") + sz : "") + street;
}
/* Row in a hands list. With `oppId`, lead with THAT villain's position,
   hole cards, and defining action instead of just names. */
function handRowHTML(h, oppId) {
  const res = heroResult(h);
  const dot = res ? `<span class="dot ${res}"></span>` : "";
  const squid = h.squid?.have != null ? `<span class="hr-squid">${h.squid.have}🦑</span>` : "";
  const boardH = (h.board || []).some(Boolean) ? tilesHTML(h.board) + " " : "";
  const sub = `<div class="s">${boardH}${esc(handSummary(h))}</div>`;
  if (oppId) {
    const i = (h.villains || []).findIndex((v) => v.opponentId === oppId);
    if (i >= 0) {
      const v = h.villains[i];
      const def = definingAct(h, "v" + i);
      const bits = [
        v.pos ? `<span class="hv-pos">${esc(v.pos)}</span>` : "",
        v.cards && v.cards.some(Boolean) ? tilesHTML(v.cards) : "",
        def ? `<span class="hr-act">${esc(abbrevAct(def))}</span>` : "",
      ].filter(Boolean).join("");
      if (bits) return `<div class="lrow" data-hand="${h.id}">
        <div class="t hr-t">${dot}${bits}${squid}</div>${sub}
      </div>`;
    }
  }
  const names = (h.villains || []).map((v) => oppById(v.opponentId)?.name).filter(Boolean).join(", ");
  return `<div class="lrow" data-hand="${h.id}">
    <div class="t">${dot}${esc(names || "Hand")}${squid}</div>${sub}
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
const kAmt = (n) => n + "K";
function handText(h) {
  const L = [];
  const seat = (pos) => (pos ? ` (${pos})` : "");
  const players = [
    ...(h.hero === false ? [] : [`Hero${seat(h.heroPos)}${h.heroCards ? " " + cardsStr(h.heroCards) : ""}`]),
    ...(h.villains || []).map((v, i) =>
      `${actorLabel(h, "v" + i)}${seat(v.pos)}${v.cards ? " " + cardsStr(v.cards) : ""}`),
  ];
  L.push(players.join("  vs  "));

  const ctx = [];
  if (h.blinds) {
    const b = [];
    if (h.blinds.sb) b.push(kAmt(h.blinds.sb));
    if (h.blinds.bb) b.push(kAmt(h.blinds.bb));
    let bl = b.join("/");
    if (h.blinds.std) bl += ` (${kAmt(h.blinds.std)} straddle)`;
    if (bl) ctx.push(bl);
  }
  if (h.effStack) ctx.push(`${kAmt(h.effStack)} eff`);
  if (h.squid) {
    const s = [];
    if (h.squid.have != null) s.push(`${h.squid.have} have`);
    if (h.squid.left != null) s.push(`${h.squid.left} left`);
    if (s.length) ctx.push(`squid ${s.join(", ")}`);
  }
  if (ctx.length) L.push(ctx.join("   ·   "));

  const streetLines = [];
  for (const st of STREETS) {
    const acts = (h.actions || []).filter((a) => a.street === st);
    const board = boardFor(h, st);
    if (!acts.length && !board) continue;
    streetLines.push(`${st.toUpperCase().padEnd(5)}${board ? "[" + board + "] " : ""} ` +
      (acts.map((a) => actionStr(h, a)).join(",  ") || "—"));
  }
  if (streetLines.length) L.push("", ...streetLines);
  if (h.note) L.push("", h.note);
  return L.join("\n");
}

/* Rich hand-view render — classic hand-history layout: a matchup header,
   then one block per street (board so far, new cards bright), then one
   line per action: position · name · (hole cards on first preflop line)
   · "opens to 40K". */
function handHTML(h) {
  const posOf = (actor) => actor === "hero" ? h.heroPos : h.villains?.[Number(actor.slice(1))]?.pos;
  const cardsOf = (actor) => actor === "hero" ? h.heroCards : h.villains?.[Number(actor.slice(1))]?.cards;
  const posB = (actor) => posOf(actor) ? `<span class="hv-pos">${esc(posOf(actor))}</span>` : "";
  const hole = (cs) => cs && cs.some(Boolean) ? `<span class="hv-hole">${tilesHTML(cs)}</span>` : "";

  const seatH = (actor) =>
    `<div class="hv-seat">${posB(actor)}<b>${esc(actorLabel(h, actor))}</b>${hole(cardsOf(actor))}</div>`;
  const seats = [];
  if (h.hero !== false) seats.push(seatH("hero"));
  (h.villains || []).forEach((_, i) => seats.push(seatH("v" + i)));
  let html = `<div class="hv-seats">${seats.join("")}</div>`;

  const ctx = [];
  if (h.blinds) {
    const b = [];
    if (h.blinds.sb) b.push(kAmt(h.blinds.sb));
    if (h.blinds.bb) b.push(kAmt(h.blinds.bb));
    let bl = b.join("/");
    if (h.blinds.std) bl += ` (${kAmt(h.blinds.std)} straddle)`;
    if (bl) ctx.push(bl);
  }
  if (h.effStack) ctx.push(`${kAmt(h.effStack)} eff`);
  if (h.squid) {
    const s = [];
    if (h.squid.have != null) s.push(`${h.squid.have}🦑`);
    if (h.squid.left != null) s.push(`${h.squid.left} left`);
    if (s.length) ctx.push(s.join(" · "));
  }
  if (ctx.length) html += `<div class="hv-ctx">${esc(ctx.join("  ·  "))}</div>`;
  const win = handWinner(h);
  if (win) {
    const names = win.winners.map((p) => actorLabel(h, p)).join(" & ");
    const txt = win.winners.length > 1
      ? `Chop — ${names}`
      : `${names} wins` + (win.how === "showdown" ? " at showdown" : " — everyone folded");
    const cls = h.hero !== false
      ? (win.winners.includes("hero") ? (win.winners.length > 1 ? "chop" : "won") : "lost") : "";
    html += `<div class="hv-result ${cls}">${esc(txt)}</div>`;
  } else if (h.result) {                        // legacy manually-tagged hands
    html += `<div class="hv-result ${h.result}">${esc("Hero " + h.result)}</div>`;
  }

  const pe = estimatePot(h, h.actions);
  const b = h.board || [];
  const upTo = { flop: 3, turn: 4, river: 5 };   // board shown cumulatively per street
  const newAt = { pre: 0, flop: 0, turn: 3, river: 4 };
  const shownCards = new Set();                   // hole cards once per actor, on first pre line
  const blocks = [];
  for (const st of STREETS) {
    const acts = (h.actions || []).map((a, i) => ({ a, i })).filter((x) => x.a.street === st);
    const hasNew = st !== "pre" && b.slice(newAt[st], upTo[st]).some(Boolean);
    if (!acts.length && !hasNew) continue;
    const boardH = st === "pre" ? "" :
      b.slice(0, upTo[st]).filter(Boolean).map((c, i) => tileHTML(c, i < newAt[st])).join("");
    const lines = acts.map(({ a, i }) => {
      const cs = st === "pre" && !shownCards.has(a.actor) ? cardsOf(a.actor) : null;
      if (st === "pre") shownCards.add(a.actor);
      const { verb, sz, to } = actParts(a);
      // relative sizes (%, pot, x) also show the resolved chip amount
      const amt = sz && /%|pot|over|x$/i.test(a.size || "") && pe.perAct[i]
        ? ` <span class="hv-amt">${potStr(pe.perAct[i])}</span>` : "";
      return `<div class="hv-line">${posB(a.actor)}<b>${esc(actorLabel(h, a.actor))}</b>${hole(cs)}` +
        `<span class="hv-verb">${esc(verb)}${to ? " to" : ""}</span>` +
        (sz ? `<b class="hv-size">${esc(sz)}</b>` : "") + amt + `</div>`;
    }).join("");
    const potH = st !== "pre" && pe.atStart[st] > 0
      ? `<span class="hv-pot">${potStr(pe.atStart[st])}</span>` : "";
    blocks.push(`<div class="hv-block">
      <div class="hv-sthead"><span class="hv-st">${st === "pre" ? "PREFLOP" : st.toUpperCase()}</span>` +
      (boardH ? `<span class="hv-board">${boardH}</span>` : "") + potH + `</div>${lines}</div>`);
  }
  if (blocks.length) html += `<div class="hv-streets">${blocks.join("")}</div>`;
  if (h.note) html += `<div class="hv-note">${esc(h.note)}</div>`;
  return html;
}

/* ================= Hands feed + detail ================= */

function renderHandsFeed() {
  const hands = [...HANDS].sort((a, b) => b.ts - a.ts);
  $("hands-list").innerHTML = hands.map((h) => handRowHTML(h)).join("") ||
    `<div class="empty">No hands yet — log one from the Hand tab.</div>`;
}

function renderHandView(id) {
  const h = HANDS.find((x) => x.id === id);
  if (!h) { location.hash = "#hands"; return; }
  curHandId = id;
  $("hv-text").innerHTML = handHTML(h);
}

/* ================= Data / backup ================= */

function renderData() {
  metaGet("lastExportAt").then((ts) => {
    const days = ts ? Math.floor((Date.now() - ts) / 86400000) : null;
    $("data-backupnag").textContent = ts
      ? (days === 0 ? "Backed up today." : `Last backup ${days} day${days > 1 ? "s" : ""} ago.`)
      : "Never backed up — data lives only on this phone.";
  });
  const store = $("data-storage");
  if (storageDurable) {
    store.textContent = "✓ Storage is protected — your data won't be auto-cleared.";
    store.className = "muted sub2 ok";
  } else {
    store.textContent = "⚠ Storage not protected. Install to Home Screen (Share → Add to Home Screen) and reopen so iOS keeps your data.";
    store.className = "sub2 warn";
  }
  $("data-stats").textContent = `${OPP.length} opponents · ${HANDS.length} hands`;
}

/* ================= Hand entry ================= */

function newDraft(keep) {
  return {
    id: null, ts: null,
    villains: keep ? keep.villains.map((v) => ({ opponentId: v.opponentId, pos: v.pos, cards: [null, null] })) : [],
    heroPos: keep ? keep.heroPos : null, heroCards: [null, null],
    heroIn: keep ? keep.heroIn : true,
    board: [null, null, null, null, null],
    actions: [], street: "pre", actor: null, lastV: "v0",
    note: "", effStack: "",
    sb: keep ? keep.sb : blindsDefault.sb, bb: keep ? keep.bb : blindsDefault.bb, std: keep ? keep.std : blindsDefault.std,
    squidHave: keep ? keep.squidHave : "", squidLeft: keep ? keep.squidLeft : "",
    mode: keep ? keep.mode : "chips", focusPos: null,
  };
}

/* ---- seat model (table mode) — positions ARE the seats ---- */
function seatOccupant(pos) {
  if (draft.heroPos === pos) return { type: "hero" };
  const idx = draft.villains.findIndex((v) => v.pos === pos);
  if (idx >= 0) return { type: "villain", idx };
  return { type: "empty" };
}
function actorForPos(pos) {
  const o = seatOccupant(pos);
  return o.type === "hero" ? "hero" : o.type === "villain" ? "v" + o.idx : null;
}
/* Screen slots around the oval, slot 0 = bottom-centre (hero's seat). */
const SEAT_SLOTS = [
  [50, 94], [19, 84], [13, 49], [25, 14], [50, 7], [75, 14], [87, 49], [81, 84],
];
/* Rotate POSITIONS so hero's seat is at the bottom; else default order. */
function seatOrder() {
  const hi = draft.heroPos ? POSITIONS.indexOf(draft.heroPos) : 0;
  return SEAT_SLOTS.map((slot, i) => ({ slot, pos: POSITIONS[(hi + i) % POSITIONS.length] }));
}

function renderTable() {
  const d = draft;
  // center board mirror
  const board = d.board.map((c) => c ? cardHTML(c) : "").filter(Boolean).join(" ");
  let felt = `<div class="feltoval"></div>
    <div class="feltcenter">${board ? `<div class="feltboard">${board}</div>` : ""}</div>`;

  felt += seatOrder().map(({ slot, pos }) => {
    const occ = seatOccupant(pos);
    const focused = d.focusPos === pos;
    let inner, cls = "tseat";
    if (occ.type === "hero") {
      cls += " hero";
      const cards = d.heroCards.some(Boolean)
        ? `<div class="theroc">${d.heroCards.map((c) => c ? cardHTML(c) : "").join("")}</div>` : "";
      inner = `${cards}<div class="tpill"><span class="tpos">${pos}</span><span class="tnm">You</span></div>`;
    } else if (occ.type === "villain") {
      cls += " vill";
      const v = d.villains[occ.idx];
      const o = oppById(v.opponentId);
      const tag = o?.tags?.[0] ? `<span class="ttag">${esc(TAG_BY_ID[o.tags[0]]?.label || o.tags[0])}</span>` : "";
      inner = `<div class="tpill"><span class="tpos">${pos}</span><span class="tnm">${esc(o?.name || "?")}</span></div>${tag}`;
    } else {
      cls += " empty";
      inner = `<div class="tpill add"><span class="tpos">${pos}</span><span class="tnm">＋</span></div>`;
    }
    if (focused) cls += " focus";
    return `<button class="${cls}" data-seat="${pos}" style="left:${slot[0]}%;top:${slot[1]}%">${inner}</button>`;
  }).join("");
  $("he-felt").innerHTML = felt;

  // assignment strip for the focused seat
  const el = $("he-seatassign");
  if (!d.focusPos) {
    el.innerHTML = `<div class="assignhint">Tap a seat to place yourself or a villain.</div>`;
    return;
  }
  const occ = seatOccupant(d.focusPos);
  const stats = oppStats();
  const opps = OPP.filter((o) => !o.archived).sort((a, b) =>
    (stats[b.id]?.last || b.updatedAt || 0) - (stats[a.id]?.last || a.updatedAt || 0));
  const seatedIds = d.villains.filter((v) => v.pos && v.pos !== d.focusPos).map((v) => v.opponentId);
  el.innerHTML =
    `<div class="assignhead"><span class="tpos">${d.focusPos}</span>` +
    (occ.type === "empty" ? `<span class="muted">— place a player</span>`
      : `<span>${occ.type === "hero" ? "You" : esc(oppById(d.villains[occ.idx].opponentId)?.name || "?")}</span>
         <button class="chip mini" data-seatclear>Clear</button>`) +
    `</div>
    <div class="chiprow scroll">
      <button class="chip${occ.type === "hero" ? " on" : ""}" data-assign-hero>You</button>` +
    opps.map((o) => `<button class="chip${occ.type === "villain" && d.villains[occ.idx].opponentId === o.id ? " on" : ""}`
      + `${seatedIds.includes(o.id) ? " seated" : ""}" data-assign-opp="${o.id}">${esc(o.name)}</button>`).join("") +
    `</div>`;
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
/* Is Hero part of this hand? Table mode: only if seated. Chips mode: the "You" toggle. */
function heroPresent(d) {
  return d.mode === "table" ? d.heroPos != null : d.heroIn;
}
function currentActor() {
  if (draft.mode === "table")
    return draft.focusPos ? actorForPos(draft.focusPos) : null;
  let a = draft.actor;
  if (!draft.heroIn && a === "hero") a = null;
  return a || (draft.villains.length ? "v0" : (draft.heroIn ? "hero" : null));
}
/* Chips-mode auto-alternate: hero↔villain, or cycle villains when hero is out. */
function nextActorChips(actor) {
  if (draft.heroIn) return actor === "hero" ? draft.lastV : "hero";
  const n = draft.villains.length;
  if (n <= 1) return actor;
  return "v" + ((Number(actor.slice(1)) + 1) % n);
}
function ensureVillainSlot() {
  if (!draft.villains.length)
    draft.villains.push({ opponentId: null, pos: null, cards: [null, null] });
}
/* Everyone in the hand needs a seat before board cards go in. */
function positionsMissing() {
  const need = [];
  if (heroPresent(draft) && !draft.heroPos) need.push("You");
  draft.villains.forEach((v, i) => {
    if (!v.pos) need.push(oppById(v.opponentId)?.name || "V" + (i + 1));
  });
  return need;
}

function lineText(d) {
  const parts = [];
  d.villains.forEach((v, i) => {
    const nm = v.opponentId ? (oppById(v.opponentId)?.name || "?") : "V" + (i + 1);
    parts.push(nm + (v.pos ? " " + v.pos : ""));
  });
  if (heroPresent(d) && (d.heroPos || d.heroCards.some(Boolean)))
    parts.push("Hero" + (d.heroPos ? " " + d.heroPos : "") +
      (d.heroCards.some(Boolean) ? " " + cardsStr(d.heroCards) : ""));
  if (d.effStack) parts.push("eff " + d.effStack + "K");
  if (d.squidHave || d.squidLeft)
    parts.push("squid " + (d.squidHave || "?") + "/" + (d.squidLeft || "?"));
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

/* ---- turn order + street completion (positions drive who's next) ---- */
/* Acting order: preflop = UTG→…→blinds→straddle (POSITIONS as listed);
   postflop = blinds first, button last. */
const ORDER_POST = ["SB", "BB", "STD", "U8", "U7", "HJ", "CO", "BN"];
const actOrderFor = (street) => street === "pre" ? POSITIONS : ORDER_POST;
const AGG_ACTS = ["bet", "raise", "3bet", "4bet", "5bet", "jam"];

function draftActorPos(actor) {
  return actor === "hero" ? draft.heroPos : draft.villains[Number(actor.slice(1))]?.pos;
}
function draftParticipants() {
  const p = draft.villains.map((_, i) => "v" + i);
  if (heroPresent(draft)) p.unshift("hero");
  return p;
}
function liveActors() {                       // folds are terminal
  const folded = new Set(draft.actions.filter((a) => a.act === "fold").map((a) => a.actor));
  return draftParticipants().filter((p) => !folded.has(p));
}
/* Next to act after `actor`, walking seat order among live positioned players. */
function nextActorByPos(actor) {
  const myPos = draftActorPos(actor);
  if (!myPos) return null;
  const order = actOrderFor(draft.street);
  const live = liveActors().map((p) => ({ p, pos: draftActorPos(p) })).filter((x) => x.pos);
  const i = order.indexOf(myPos);
  for (let k = 1; k <= order.length; k++) {
    const hit = live.find((x) => x.pos === order[(i + k) % order.length] && x.p !== actor);
    if (hit) return hit.p;
  }
  return null;
}
/* First to act on a street, or null when positions are unknown. */
function firstToAct(street) {
  const order = actOrderFor(street);
  const live = liveActors().map((p) => ({ p, pos: draftActorPos(p) })).filter((x) => x.pos);
  live.sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos));
  return live[0]?.p || null;
}
/* Betting on `street` is closed: everyone live has responded to the last
   aggression (or everyone has checked/limped through). */
function streetClosed(street) {
  const acts = draft.actions.filter((a) => a.street === street);
  if (!acts.length) return false;
  const live = liveActors();
  if (live.length < 2) return false;          // hand is over, nothing to advance
  let lastAgg = -1;
  acts.forEach((a, i) => { if (AGG_ACTS.includes(a.act)) lastAgg = i; });
  if (lastAgg >= 0) {
    const aggr = acts[lastAgg].actor;
    const after = new Set(acts.slice(lastAgg + 1).map((a) => a.actor));
    return live.every((p) => p === aggr || after.has(p));
  }
  const acted = new Set(acts.map((a) => a.actor));
  return live.every((p) => acted.has(p));
}

/* How many raises have gone in preflop (open=1, 3bet=2, 4bet=3 …). */
function preRaiseLevel() {
  return draft.actions.filter((a) => a.street === "pre" &&
    ["raise", "3bet", "4bet", "5bet"].includes(a.act)).length;
}
/* Facing an all-in on this street? (act "jam" or any aggression sized "Jam") */
function facingJam(street) {
  const agg = draft.actions.filter((a) => a.street === street && AGG_ACTS.includes(a.act));
  const last = agg[agg.length - 1];
  return !!last && (last.act === "jam" || last.size === "Jam");
}
/* Preflop buttons depend on what's already happened. */
function preflopActs() {
  if (facingJam("pre")) return ["fold", "call"];   // can't raise an all-in
  const lvl = preRaiseLevel();
  if (lvl === 0) {
    // the BB (or the straddler, when there's a straddle) has the option: check, not limp
    const optionSeat = draft.std ? "STD" : "BB";
    const cur = currentActor();
    if (cur && draftActorPos(cur) === optionSeat) return ["fold", "check", "raise"];
    return ["fold", "limp", "raise"];
  }
  return [
    null,
    ["fold", "call", "3bet"],    // facing a raise
    ["fold", "call", "4bet"],    // facing a 3bet
    ["fold", "call", "5bet"],    // facing a 4bet
  ][lvl] || ["fold", "call", "jam"];   // facing a 4bet+ / all-in
}
/* Postflop buttons depend on the betting on the CURRENT street. */
function postflopActs() {
  const st = draft.street;
  if (facingJam(st)) return ["fold", "call"];      // can't raise an all-in
  const bets = draft.actions.filter((a) => a.street === st &&
    ["bet", "raise", "jam"].includes(a.act)).length;
  return [
    ["check", "bet"],            // checked to you / first in
    ["fold", "call", "raise"],   // facing a bet
    ["fold", "call", "raise"],   // facing a raise (re-raise)
  ][bets] || ["fold", "call", "jam"];   // facing a re-raise+ / all-in
}
function actLabel(a) {
  if (["3bet", "4bet", "5bet"].includes(a)) return a;
  return a[0].toUpperCase() + a.slice(1);
}
/* ---------- hand evaluator + auto result ----------
   Result is never entered by hand: if everyone folds to one player they
   win; if 2+ reach the end with a full board and known hole cards, the
   evaluator settles it (ties = chop). Anything else stays unknown. */
const RVAL = Object.fromEntries("23456789TJQKA".split("").map((r, i) => [r, i + 2]));
function score5(cs) {                       // 5 cards → comparable score array
  const vs = cs.map((c) => RVAL[c[0]]).sort((a, b) => b - a);
  const flush = cs.every((c) => c[1] === cs[0][1]);
  const counts = {};
  vs.forEach((v) => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts).map(([v, n]) => [n, Number(v)])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let straight = 0;
  if (groups.length === 5) {
    if (vs[0] - vs[4] === 4) straight = vs[0];
    else if (vs[0] === 14 && vs[1] === 5 && vs[4] === 2) straight = 5;   // wheel
  }
  const rest = groups.map((g) => g[1]);
  if (flush && straight) return [8, straight];
  if (groups[0][0] === 4) return [7, ...rest];
  if (groups[0][0] === 3 && groups[1]?.[0] === 2) return [6, ...rest];
  if (flush) return [5, ...vs];
  if (straight) return [4, straight];
  if (groups[0][0] === 3) return [3, ...rest];
  if (groups[0][0] === 2 && groups[1]?.[0] === 2) return [2, ...rest];
  if (groups[0][0] === 2) return [1, ...rest];
  return [0, ...vs];
}
function cmpScore(x, y) {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
function best7(cs) {                        // best 5 of up to 7
  let best = null;
  const n = cs.length;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++)
    for (let c = b + 1; c < n - 2; c++) for (let d = c + 1; d < n - 1; d++)
      for (let e = d + 1; e < n; e++) {
        const s = score5([cs[a], cs[b], cs[c], cs[d], cs[e]]);
        if (!best || cmpScore(s, best) > 0) best = s;
      }
  return best;
}
/* Who won this hand, if it's determinable. → { winners:[actors], how } | null */
function handWinner(h) {
  const parts = (h.villains || []).map((_, i) => "v" + i);
  if (h.hero !== false) parts.unshift("hero");
  const folded = new Set((h.actions || []).filter((a) => a.act === "fold").map((a) => a.actor));
  const live = parts.filter((p) => !folded.has(p));
  if (live.length === 1 && folded.size) return { winners: live, how: "folds" };
  if (live.length < 2) return null;
  const board = (h.board || []).filter(Boolean);
  const cardsOf = (p) => p === "hero" ? h.heroCards : h.villains?.[Number(p.slice(1))]?.cards;
  if (board.length !== 5 || !live.every((p) => (cardsOf(p) || []).filter(Boolean).length === 2)) return null;
  let best = null, winners = [];
  for (const p of live) {
    const s = best7(board.concat(cardsOf(p)));
    const d = best ? cmpScore(s, best) : 1;
    if (d > 0) { best = s; winners = [p]; }
    else if (d === 0) winners.push(p);
  }
  return { winners, how: "showdown" };
}
/* Hero-relative outcome for dots/records: "won" | "lost" | "chop" | null. */
function heroResult(h) {
  const win = handWinner(h);
  if (!win) return h.result || null;        // legacy hands with manually set result
  if (h.hero === false) return null;
  if (!win.winners.includes("hero")) return "lost";
  return win.winners.length > 1 ? "chop" : "won";
}

/* ---------- rough pot tracking (in K) ----------
   Sizes are shorthand ("4x", "50%", "Jam"), so this is a deliberate
   approximation: multipliers apply to the last bet, percentages to the
   current pot, jams to the effective stack, unsized aggression to
   typical defaults. Good enough for "how big was that turn jam". */
function estimatePot(src, actions) {
  const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
  const sb = num(src.sb ?? src.blinds?.sb), bb = num(src.bb ?? src.blinds?.bb), std = num(src.std ?? src.blinds?.std);
  const eff = num(src.effStack);
  const unit = std || bb;                        // price of entry preflop
  let pot = sb + bb + std;
  const atStart = { pre: pot };                  // pot as each street begins
  const perAct = [];                             // resolved "to" amount per action
  let street = "pre", contrib = {}, curBet = unit;
  const potNow = () => pot + Object.values(contrib).reduce((a, x) => a + x, 0);
  for (const a of actions || []) {
    if (a.street !== street) { pot = potNow(); contrib = {}; street = a.street; curBet = 0; atStart[street] = pot; }
    if (a.act === "fold" || a.act === "check") { perAct.push(0); continue; }
    if (a.act === "limp") { contrib[a.actor] = unit; curBet = Math.max(curBet, unit); perAct.push(unit); continue; }
    if (a.act === "call") { if (curBet) contrib[a.actor] = curBet; perAct.push(curBet); continue; }
    let lvl = 0;                                 // aggression → a new "to" level this street
    const s = a.size;
    if (s && /^\d+(\.\d+)?k$/i.test(s)) lvl = parseFloat(s);
    else if (s && /^\$/.test(s)) lvl = parseFloat(s.slice(1));
    else if (s && /^\d+(\.\d+)?x$/i.test(s)) lvl = parseFloat(s) * (curBet || unit);
    else if (s && /%$/.test(s)) lvl = (parseFloat(s) / 100) * potNow() + curBet;
    else if (s === "pot") lvl = potNow() + curBet;
    else if (s === "over") lvl = 1.3 * potNow() + curBet;
    else if (s === "Jam" || a.act === "jam") lvl = eff || (curBet ? 2.5 * curBet : potNow());
    else lvl = curBet ? 2.5 * curBet : 0.66 * potNow();
    if (!isFinite(lvl) || lvl <= 0) { perAct.push(0); continue; }
    if (eff) lvl = Math.min(lvl, eff);
    contrib[a.actor] = Math.max(contrib[a.actor] || 0, lvl);
    curBet = Math.max(curBet, lvl);
    perAct.push(lvl);
  }
  return { atStart, now: potNow(), curBet, perAct };
}
const potStr = (n) => !n ? "" : "≈" + (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + "K";

/* Size options depend on the action: open raise = chip amounts, 3bet+ = multipliers. */
function sizesFor(a) {
  if (a.street !== "pre") return SIZES_POST;
  if (a.act === "3bet") return SIZES_3BET;
  if (a.act === "4bet" || a.act === "5bet") return SIZES_4BET;
  return SIZES_OPEN;
}

function renderHandEntry() {
  const d = draft;
  const table = d.mode === "table";

  // hand line
  const lt = lineText(d);
  $("he-line").textContent = lt || (table ? "New hand — tap a seat" : "New hand — tap a villain");
  $("he-line").classList.toggle("muted", !lt);

  // mode toggle + show/hide the two entry styles
  $("he-mode").innerHTML =
    `<button class="${!table ? "on" : ""}" data-mode="chips">Chips</button>` +
    `<button class="${table ? "on" : ""}" data-mode="table">Table</button>`;
  $("he-chipsonly").classList.toggle("hidden", table);
  $("he-table").classList.toggle("hidden", !table);
  $("he-actor").classList.toggle("hidden", table);   // seat replaces the actor toggle
  if (table) renderTable();

  // villain chips (existing opponents only — add new ones in the Opponents tab)
  const stats = oppStats();
  const sorted = OPP.filter((o) => !o.archived).sort((a, b) =>
    (stats[b.id]?.last || b.updatedAt || 0) - (stats[a.id]?.last || a.updatedAt || 0));
  const selIds = d.villains.map((v) => v.opponentId);
  const heroChip = `<button class="chip heroic${d.heroIn ? " on" : ""}" data-heroin>You</button>`;
  $("he-villains").innerHTML = heroChip + sorted.map((o) =>
    `<button class="chip${selIds.includes(o.id) ? " on" : ""}" data-vopp="${o.id}">${esc(o.name)}</button>`
  ).join("");

  // position rows (hide Hero's row when Hero isn't in the hand)
  $("he-heropos").closest(".posrow").classList.toggle("hidden", !d.heroIn);
  $("he-heropos").innerHTML = POSITIONS.map((p) =>
    `<button class="chip mini${d.heroPos === p ? " on" : ""}" data-hpos="${p}">${p}</button>`).join("");
  // one position row per selected villain, labelled by name
  $("he-vposrows").innerHTML = d.villains.map((v, i) => {
    const nm = v.opponentId ? (oppById(v.opponentId)?.name || "?") : "V" + (i + 1);
    const chips = POSITIONS.map((p) =>
      `<button class="chip mini${v.pos === p ? " on" : ""}" data-vposi="${i}" data-vpos="${p}">${p}</button>`).join("");
    return `<div class="posrow"><span class="poslabel">${esc(nm.slice(0, 9))}</span><div class="chiprow tight">${chips}</div></div>`;
  }).join("");

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
    (d.heroIn ? `<button class="${cur === "hero" ? "on" : ""}" data-actor="hero">HERO</button>` : "") + vBtns;

  // running pot estimate (rough — see estimatePot)
  const pe = estimatePot(d, d.actions);
  const showPot = d.actions.length > 0 && pe.now > 0;
  $("he-pot").classList.toggle("hidden", !showPot);
  if (showPot) $("he-pot").textContent = "Pot " + potStr(pe.now);

  // action buttons — situational: options depend on the betting so far this street
  const acts = d.street === "pre" ? preflopActs() : postflopActs();
  $("he-acts").innerHTML = acts.map((a) =>
    `<button data-act="${a}">${actLabel(a)}</button>`).join("");


  // size strip (when last action is a sizeable bet/raise/3bet without a size yet)
  const last = d.actions[d.actions.length - 1];
  const needSize = last && SIZED_ACTS.includes(last.act) && !last.size;
  $("he-sizes").classList.toggle("hidden", !needSize);
  if (needSize) {
    // resolve relative sizes to chips: pot/bet-so-far BEFORE this pending action
    const prev = d.actions.slice(0, -1);
    const base = estimatePot(d, prev);
    const facing = prev.length && prev[prev.length - 1].street === last.street ? base.curBet : 0;
    const chipAmt = (s) => {
      if (/%$/.test(s)) return (parseFloat(s) / 100) * base.now + facing;
      if (s === "pot") return base.now + facing;
      if (s === "over") return 1.3 * base.now + facing;
      if (/^\d+(\.\d+)?x$/i.test(s)) return facing ? parseFloat(s) * facing : 0;
      return 0;
    };
    $("he-sizes").innerHTML =
      `<span class="sizehint">${actLabel(last.act)} size</span>` +
      sizesFor(last).map((s) => {
        const amt = base.now > 0 ? chipAmt(s) : 0;
        return `<button class="chip" data-size="${s}">${s}${amt ? `<i>${potStr(amt)}</i>` : ""}</button>`;
      }).join("") +
      `<input data-sizenum type="number" placeholder="custom" inputmode="numeric">`;
  }

  // card slots
  const slotBtn = (zone, i, card, lbl) =>
    `<button class="cslot${card ? " filled" : ""}" data-slot="${zone}:${i}">` +
    (card ? cardHTML(card) : `<span class="lbl">${lbl}</span>`) + `</button>`;
  let ch = `<div class="crow">` +
    d.board.map((c, i) => slotBtn("board", i, c, ["F", "F", "F", "T", "R"][i])).join("") +
    `</div><div class="crow">`;
  if (d.heroIn)
    ch += `<span class="cdiv">hero</span>` + d.heroCards.map((c, i) => slotBtn("hero", i, c, "?")).join("");
  d.villains.forEach((v, i) => {
    const nm = v.opponentId ? (oppById(v.opponentId)?.name || "?").slice(0, 6) : "V" + (i + 1);
    ch += `<span class="cdiv">${esc(nm)}</span>` +
      (v.cards || [null, null]).map((c, j) => slotBtn("v" + i, j, c, "?")).join("");
  });
  ch += `</div>`;
  $("he-cards").innerHTML = ch;

  // squid counters: scrollable 0-11 (have) and 0-12 (left) chip rows
  const squidChips = (key, max, cur) => Array.from({ length: max + 1 }, (_, n) =>
    `<button class="chip mini${String(cur) === String(n) ? " on" : ""}" data-${key}="${n}">${n}</button>`).join("");
  $("he-squidhave").innerHTML = squidChips("squidhave", 11, d.squidHave);
  $("he-squidleft").innerHTML = squidChips("squidleft", 12, d.squidLeft);

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

    if (b.dataset.mode) {
      mutate(() => { draft.mode = b.dataset.mode; });
    } else if (b.dataset.seat) {                 // table: focus a seat
      mutate(() => { draft.focusPos = draft.focusPos === b.dataset.seat ? null : b.dataset.seat; });
    } else if (b.dataset.assignHero !== undefined) {
      mutate(() => {
        const pos = draft.focusPos;
        draft.villains.forEach((v) => { if (v.pos === pos) v.pos = null; }); // bump villain off
        draft.heroPos = pos;
      });
    } else if (b.dataset.assignOpp !== undefined) {
      mutate(() => {
        const pos = draft.focusPos, id = b.dataset.assignOpp;
        if (draft.heroPos === pos) draft.heroPos = null;
        draft.villains.forEach((v) => { if (v.pos === pos) v.pos = null; }); // clear the seat
        let v = draft.villains.find((x) => x.opponentId === id);
        if (v) v.pos = pos;                                                  // move existing
        else draft.villains.push({ opponentId: id, pos, cards: [null, null] });
      });
    } else if (b.dataset.seatclear !== undefined) {
      mutate(() => {
        const pos = draft.focusPos;
        if (draft.heroPos === pos) draft.heroPos = null;
        draft.villains.forEach((v) => { if (v.pos === pos) v.pos = null; });
      });
    } else if (b.dataset.heroin !== undefined) { // toggle Hero in/out of the hand
      mutate(() => {
        draft.heroIn = !draft.heroIn;
        if (!draft.heroIn) {                      // pull Hero out cleanly
          draft.heroPos = null;
          draft.heroCards = [null, null];
          draft.actions = draft.actions.filter((a) => a.actor !== "hero");
          if (draft.actor === "hero") draft.actor = draft.villains.length ? "v0" : null;
        }
      });
    } else if (b.dataset.vopp !== undefined) {   // toggle villain selection
      mutate(() => {
        const i = draft.villains.findIndex((v) => v.opponentId === b.dataset.vopp);
        if (i >= 0) draft.villains.splice(i, 1);
        else draft.villains.push({ opponentId: b.dataset.vopp, pos: null, cards: [null, null] });
      });
    } else if (b.dataset.hpos) {
      mutate(() => {
        const p = b.dataset.hpos;
        if (draft.heroPos === p) { draft.heroPos = null; return; }
        draft.villains.forEach((x) => { if (x.pos === p) x.pos = null; });   // seat is unique
        draft.heroPos = p;
        if (!draft.actions.length) draft.actor = firstToAct(draft.street) || draft.actor;
      });
    } else if (b.dataset.vpos) {
      const i = Number(b.dataset.vposi);
      mutate(() => {
        const v = draft.villains[i];
        if (!v) return;
        const p = b.dataset.vpos;
        if (v.pos === p) { v.pos = null; return; }
        draft.villains.forEach((x, j) => { if (j !== i && x.pos === p) x.pos = null; });
        if (draft.heroPos === p) draft.heroPos = null;                       // seat is unique
        v.pos = p;
        if (!draft.actions.length) draft.actor = firstToAct(draft.street) || draft.actor;
      });
    } else if (b.dataset.street) {
      mutate(() => {
        draft.street = b.dataset.street;
        const f = firstToAct(draft.street);
        if (f) draft.actor = f;
      });
    } else if (b.dataset.actor) {
      mutate(() => {
        draft.actor = b.dataset.actor;
        if (b.dataset.actor.startsWith("v")) draft.lastV = b.dataset.actor;
      });
    } else if (b.dataset.act) {
      const actor = currentActor();
      if (!actor) { toast("Tap a seated player first"); return; }
      let openBoard = null;
      mutate(() => {
        if (draft.mode !== "table" && actor.startsWith("v")) { ensureVillainSlot(); draft.lastV = actor; }
        draft.actions.push({ street: draft.street, actor, act: b.dataset.act, size: null });
        if (streetClosed(draft.street) && draft.street !== "river") {
          // betting done → next street, first-to-act up, and prompt for the board
          const next = STREETS[STREETS.indexOf(draft.street) + 1];
          draft.street = next;
          draft.actor = firstToAct(next) || draft.actor;
          openBoard = next;
        } else if (draft.mode !== "table") {
          draft.actor = nextActorByPos(actor) || nextActorChips(actor);
        }
      });
      if (openBoard && groupSlots(openBoard).some((s) => !s.arr[s.i])) {
        const miss = positionsMissing();
        if (miss.length) toast("Set positions first: " + miss.join(", "));
        else openGroupSheet(openBoard);          // straight into entering the flop/turn/river
      }
    } else if (b.dataset.size) {
      mutate(() => {
        const last = draft.actions[draft.actions.length - 1];
        if (last) last.size = b.dataset.size;
      });
    } else if (b.dataset.squidhave !== undefined) {
      mutate(() => { draft.squidHave = String(draft.squidHave) === b.dataset.squidhave ? "" : b.dataset.squidhave; });
    } else if (b.dataset.squidleft !== undefined) {
      mutate(() => { draft.squidLeft = String(draft.squidLeft) === b.dataset.squidleft ? "" : b.dataset.squidleft; });
    } else if (b.dataset.slot) {
      const g = groupForSlot(b.dataset.slot);
      if (["flop", "turn", "river"].includes(g)) {
        const miss = positionsMissing();
        if (miss.length) { toast("Set positions first: " + miss.join(", ")); return; }
      }
      openGroupSheet(g);
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
  $("he-sb").oninput = () => setBlind("sb", $("he-sb").value);
  $("he-bb").oninput = () => setBlind("bb", $("he-bb").value);
  $("he-std").oninput = () => setBlind("std", $("he-std").value);
  $("he-save").onclick = () => saveHand(false);
  $("he-savenext").onclick = () => saveHand(true);
}

/* --- card picker sheet --- */

function usedCards() {
  return new Set([...draft.board, ...draft.heroCards,
    ...draft.villains.flatMap((v) => v.cards || [])].filter(Boolean));
}

/* A card "group" is a set of slots entered together: the flop (3),
   the turn (1), the river (1), or a person's two hole cards. */
function groupForSlot(key) {
  const [zone, iS] = key.split(":");
  if (zone === "board") { const i = Number(iS); return i <= 2 ? "flop" : i === 3 ? "turn" : "river"; }
  return zone;                                   // "hero" | "v0" | "v1" ...
}
function groupSlots(g) {                          // -> [{ arr, i }] in fill order
  if (g === "flop")  return [0, 1, 2].map((i) => ({ arr: draft.board, i }));
  if (g === "turn")  return [{ arr: draft.board, i: 3 }];
  if (g === "river") return [{ arr: draft.board, i: 4 }];
  if (g === "hero")  return [0, 1].map((i) => ({ arr: draft.heroCards, i }));
  const vi = Number(g.slice(1));
  const arr = (draft.villains[vi] || {}).cards;
  return arr ? [0, 1].map((i) => ({ arr, i })) : [];
}
function groupTitle(g) {
  if (g === "flop") return "Flop"; if (g === "turn") return "Turn"; if (g === "river") return "River";
  if (g === "hero") return "Hero cards";
  const nm = oppById(draft.villains[Number(g.slice(1))]?.opponentId)?.name;
  return (nm || "Villain") + " cards";
}
let sheetGroup = null, sheetActive = 0;

function openGroupSheet(g, active) {
  const slots = groupSlots(g);
  if (!slots.length) return;
  sheetGroup = g;
  if (active == null) {                          // default to first empty slot
    const fe = slots.findIndex((s) => !s.arr[s.i]);
    active = fe >= 0 ? fe : 0;
  }
  sheetActive = active;
  const used = usedCards();
  const cur = slots[sheetActive].arr[slots[sheetActive].i];
  const preview = slots.length > 1 ? `<div class="gcslots">` + slots.map((s, idx) => {
    const c = s.arr[s.i];
    return `<button class="gcslot${c ? " filled" : ""}${idx === sheetActive ? " active" : ""}" data-gslot="${idx}">`
      + (c ? cardHTML(c) : `<span class="lbl">?</span>`) + `</button>`;
  }).join("") + `</div>` : "";
  let grid = "";
  for (const s of SUITS) {
    grid += RANKS.split("").map((r) => {
      const c = r + s.id;
      const dis = used.has(c) && c !== cur;
      return `<button class="${s.cls}${c === cur ? " picked" : ""}" data-card="${c}" ${dis ? "disabled" : ""}>${r}${s.sym}</button>`;
    }).join("");
  }
  showSheet(`<div class="sheethead"><span class="t">${groupTitle(g)}</span>
    <button data-clearcard>Clear</button><button data-closesheet>Done</button></div>
    ${preview}<div class="cardgrid">${grid}</div>`);
}

function sheetClick(e) {
  const b = e.target.closest("button");
  if (!b || sheetGroup == null) return;
  if (b.dataset.closesheet !== undefined) { hideSheet(); return; }

  if (b.dataset.gslot !== undefined) {           // pick which slot in the group to fill
    openGroupSheet(sheetGroup, Number(b.dataset.gslot));
  } else if (b.dataset.card) {
    const emptyBefore = groupSlots(sheetGroup).filter((s) => !s.arr[s.i]).length;
    mutate(() => {
      const s = groupSlots(sheetGroup)[sheetActive];
      s.arr[s.i] = b.dataset.card;
      if (sheetGroup === "flop" || sheetGroup === "turn" || sheetGroup === "river")
        advanceStreetFromBoard();
    });
    const slots = groupSlots(sheetGroup);
    const nextEmpty = slots.findIndex((s) => !s.arr[s.i]);
    if (nextEmpty >= 0) openGroupSheet(sheetGroup, nextEmpty);      // keep going within the group
    else if (emptyBefore === 0) openGroupSheet(sheetGroup, sheetActive); // replaced in a full group — stay
    else hideSheet();                                              // just completed the group
  } else if (b.dataset.clearcard !== undefined) {
    mutate(() => { const s = groupSlots(sheetGroup)[sheetActive]; s.arr[s.i] = null; });
    openGroupSheet(sheetGroup, sheetActive);
  }
}

function advanceStreetFromBoard() {
  const b = draft.board;
  let target = null;
  if (b[4]) target = "river";
  else if (b[3]) target = "turn";
  else if (b[0] && b[1] && b[2]) target = "flop";
  if (target && STREETS.indexOf(target) > STREETS.indexOf(draft.street)) {
    draft.street = target;
    const f = firstToAct(target);
    if (f) draft.actor = f;
  }
}

/* --- save --- */

function draftHasContent(d) {
  return d.villains.some((v) => v.opponentId) || d.actions.length || d.note.trim() ||
    d.board.some(Boolean) || d.heroCards.some(Boolean);
}

async function saveHand(nextHand) {
  const d = draft;
  if (!draftHasContent(d)) { toast("Nothing to save"); return; }
  const hIn = heroPresent(d);
  const rec = {
    id: d.id || uid(), ts: d.ts || Date.now(), updatedAt: Date.now(),
    hero: hIn,
    heroPos: hIn ? d.heroPos : null,
    heroCards: hIn && d.heroCards.some(Boolean) ? d.heroCards : null,
    villains: d.villains.map((v) => ({ opponentId: v.opponentId, pos: v.pos || null,
      cards: (v.cards || []).some(Boolean) ? v.cards : null })),
    villainIds: d.villains.map((v) => v.opponentId).filter(Boolean),
    board: d.board, actions: d.actions,
    effStack: d.effStack ? Number(d.effStack) : null,
    blinds: (d.sb || d.bb || d.std)
      ? { sb: d.sb ? Number(d.sb) : null, bb: d.bb ? Number(d.bb) : null, std: d.std ? Number(d.std) : null }
      : null,
    squid: (d.squidHave || d.squidLeft)
      ? { have: d.squidHave ? Number(d.squidHave) : null, left: d.squidLeft ? Number(d.squidLeft) : null }
      : null,
    note: d.note.trim(),
  };
  const win = handWinner(rec);                 // result is inferred, never entered
  rec.showdown = !!win && win.how === "showdown";
  rec.result = hIn ? heroResult(rec) : null;
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
    heroIn: h.hero !== undefined ? h.hero : true,
    mode: "chips", focusPos: null,
    board: [...(h.board || [])].concat([null, null, null, null, null]).slice(0, 5),
    actions: (h.actions || []).map((a) => ({ ...a })),
    street: STREETS[Math.max(0, ...streets)] || "pre",
    actor: null, lastV: "v0",
    note: h.note || "",
    effStack: h.effStack != null ? String(h.effStack) : "",
    sb: h.blinds?.sb != null ? String(h.blinds.sb) : "",
    bb: h.blinds?.bb != null ? String(h.blinds.bb) : "",
    std: h.blinds?.std != null ? String(h.blinds.std) : "",
    squidHave: h.squid?.have != null ? String(h.squid.have) : "",
    squidLeft: h.squid?.left != null ? String(h.squid.left) : "",
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
  $("od-notes").onclick = async (e) => {
    const item = e.target.closest("[data-note]");
    if (!item) return;
    const id = item.dataset.note;
    const o = oppById(curOppId);
    if (e.target.closest("[data-notedel]")) {
      if (!confirm("Delete this note?")) return;
      o.notes = (o.notes || []).filter((n) => n.id !== id);
      o.updatedAt = Date.now();
      await dbPut("opponents", o);
      renderOppDetail(curOppId);
    } else if (e.target.closest("[data-noteedit]")) {
      editNoteId = id; renderOppDetail(curOppId);
    } else if (e.target.closest("[data-notecancel]")) {
      editNoteId = null; renderOppDetail(curOppId);
    } else if (e.target.closest("[data-notesave]")) {
      const txt = item.querySelector("textarea").value.trim();
      const n = (o.notes || []).find((x) => x.id === id);
      if (n && txt) { n.text = txt; n.ts = Date.now(); o.updatedAt = Date.now(); await dbPut("opponents", o); }
      editNoteId = null; renderOppDetail(curOppId);
    }
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

async function loadBlindsDefault() {
  const b = await metaGet("defaultBlinds");
  if (b) blindsDefault = { sb: b.sb || "", bb: b.bb || "", std: b.std || "" };
}
/* Blinds are sticky: whatever you type becomes the default for future hands. */
function setBlind(key, val) {
  draft[key] = val;
  blindsDefault[key] = val;
  metaSet("draftHand", JSON.parse(JSON.stringify(draft)));
  metaSet("defaultBlinds", { ...blindsDefault });
}

async function requestDurableStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      storageDurable = await navigator.storage.persisted();
      if (!storageDurable) storageDurable = await navigator.storage.persist();
    }
  } catch (e) { /* storage API unavailable — nothing we can do */ }
}

async function boot() {
  await openDB();
  await requestDurableStorage();
  await refreshCache();
  await loadBlindsDefault();
  const saved = await metaGet("draftHand");
  draft = saved ? Object.assign(newDraft(), saved) : newDraft();
  bindStatic();
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
