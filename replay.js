/* ================= Visual replayer =================
   A hand as a table you step through: seats round the felt in seat order, the
   board dealt street by street, and the money walked so the pot is right.

   The money model is potWalk()'s in stats.js and has to stay in step with it —
   same unit tell (a fractional big blind means the blinds are written in
   thousands while the sizes are in chips), same ante-per-seat rule, and the
   same refusal to guess: the first amount it wasn't given stops the pot rather
   than inventing one, because a guessed number poisons every street after it.
   Everything the walk can't price still replays; only the pot goes quiet. */

/* Clockwise seat order round a real table: blinds, straddle, the UTG seats,
   then HJ/CO/BN, and the button is on the small blind's right. Same ring the
   postflop act order uses, which is what clockwise means. */
const RP_RING = ["SB", "BB", "STD", "U9", "U8", "U7", "U6", "HJ", "CO", "BN"];

/* Who is at the table, in seat order. A villain with no position on record
   can't be seated — there is no honest slot for him — so he is counted out
   loud under the felt rather than dropped in somewhere plausible. */
function rpSeats(h) {
  const out = [];
  let unseated = 0;
  (h.villains || []).forEach((v, i) => {
    if (!RP_RING.includes(v.pos)) { unseated++; return; }
    out.push({ actor: "v" + i, pos: v.pos, id: v.opponentId,
      name: oppById(v.opponentId)?.name || v.name || "V" + (i + 1),
      cards: (v.cards || []).filter(Boolean), chips: v.chips || null });
  });
  if (RP_RING.includes(h.heroPos))
    out.push({ actor: "hero", pos: h.heroPos, id: null, name: "Hero",
      cards: (h.heroCards || []).filter(Boolean), chips: null });
  out.sort((a, b) => RP_RING.indexOf(a.pos) - RP_RING.indexOf(b.pos));
  return { seats: out, unseated };
}

const RP_AGG = new Set(["bet", "raise", "3bet", "4bet", "5bet", "jam"]);
const RP_STREETS = ["pre", "flop", "turn", "river"];
const RP_BOARD_N = { pre: 0, flop: 3, turn: 4, river: 5 };

/* One frame per action, plus a frame for the posted blinds and one for the
   end. A frame is the whole table as it stood, so stepping is just an index. */
function rpBuild(h) {
  const { seats, unseated } = rpSeats(h);
  const raw = isRawSize(h);
  const b = h.blinds || {};
  const u = b.bb > 0 && b.bb < 1 ? 1000 : 1;          // see potWalk
  const SB = (b.sb || 0) * u, BB = (b.bb || 0) * u, STD = (b.std || 0) * u, ANTE = (b.ante || 0) * u;
  const actorAt = {};
  seats.forEach((s) => { actorAt[s.pos] = s.actor; });
  const board = (h.board || []).filter((c) => /^[2-9TJQKA][cdhs]$/.test(String(c)));

  let money = b.bb !== null && b.bb !== undefined;     // can the pot be walked at all
  const inv = {};                                     // what each actor has in, this street
  if (money) {
    if (SB) inv[actorAt.SB || "_SB"] = SB;
    if (BB) inv[actorAt.BB || "_BB"] = BB;
    if (STD && actorAt.STD) inv[actorAt.STD] = STD;
  }
  const straddle = STD && actorAt.STD ? STD : 0;
  /* Every seat dealt in posts the ante — measured against Phil's own sizing
     buttons, one ante for the table puts 10% of his bets on a rung and one per
     seat puts 96% (see potWalk). */
  const dealt = new Set(seats.map((s) => s.pos));
  let settled = ANTE * Math.max(1, dealt.size);
  let level = straddle || BB;
  const folded = new Set();
  const streetOf = () => Object.values(inv).reduce((s, v) => s + v, 0);

  const frames = [];
  const snap = (street, note, actor) => frames.push({
    street, note, actor, money,
    pot: settled + streetOf(),
    inv: { ...inv }, folded: new Set(folded),
    boardN: Math.min(RP_BOARD_N[street], board.length),
  });
  /* One unit on screen. The walk works in chips, so the stakes line is written
     in chips too — the blinds line elsewhere in the app quotes the k-units the
     DX imports store, and the two side by side under a pot would read as a
     1000x error. */
  const stakes = money
    ? "Blinds " + [SB, BB, STD].filter(Boolean).map((n) => rpAmt(n, raw)).join("/") +
      (ANTE ? ` (ante ${rpAmt(ANTE, raw)})` : "")
    : null;
  snap("pre", stakes, null);

  for (const st of RP_STREETS) {
    const A = (h.actions || []).filter((a) => a.street === st);
    if (!A.length) continue;
    if (st !== "pre") {
      settled += streetOf();
      for (const k of Object.keys(inv)) delete inv[k];
      level = 0;
      snap(st, null, null);                            // the cards land before anyone acts
    }
    for (const a of A) {
      if (a.act === "fold") folded.add(a.actor);
      else if (RP_AGG.has(a.act)) {
        const v = money ? (sizeAmount(a.size) ?? sizeMult(a.size, level)) : null;
        if (v === null) money = false;                 // stop the pot, keep replaying
        else { inv[a.actor] = v; level = Math.max(level, v); }
      } else if (a.act === "call" || a.act === "limp") {
        if (money) inv[a.actor] = level;
      }
      snap(st, rpActText(a, raw), a.actor);
    }
  }
  /* The runout is on record even when the betting stopped early, so the last
     frame shows the board that actually came and every card that was seen. */
  const last = frames[frames.length - 1];
  frames.push({ ...last, note: null, actor: null, end: true, boardN: board.length });
  return { seats, unseated, frames, board, raw, h };
}

/* Short form for the bubble by a seat — "3-bets to 6.8K", without the name. */
function rpActText(a, raw) {
  const { verb, sz, to } = actParts(a, raw);
  return verb + (sz ? (to ? " to " : " ") + sz : "");
}

/* Chips, rendered the way every bet beside it is rendered. Floats come out of
   the x1000 unit fix, so trim them rather than print 200.00000000000003. */
const rpAmt = (n, raw) => {
  const v = Math.round(n * 100) / 100;
  return sizeLabel("$" + (Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")), raw);
};

/* ---------- geometry ----------
   Seats sit on an ellipse, slot 0 at the bottom and slots running clockwise —
   the direction of play, so the eye follows the action round the felt the way
   it does at the table. */
function rpXY(slot, n) {
  const a = (slot / n) * 2 * Math.PI;
  return { x: 50 - 38 * Math.sin(a), y: 50 + 39 * Math.cos(a) };
}

let rpState = null;    // { handId, i, timer }

/* Whose seat sits at the bottom. The player you came in to read, so the hand
   is told from his side; the button when you got here some other way. */
function rpAnchor(seats, oppId) {
  let i = seats.findIndex((s) => s.id && s.id === oppId);
  if (i < 0) i = seats.findIndex((s) => s.pos === "BN");
  return Math.max(0, i);
}

function renderReplay(h) {
  const box = $("hv-table");
  if (!box) return;
  const same = rpState && rpState.handId === h.id;
  if (!same) rpStop();
  const r = rpBuild(h);
  rpState = { handId: h.id, i: same ? Math.min(rpState.i, r.frames.length - 1) : 0,
    timer: same ? rpState.timer : null, r };
  rpDraw();
}

function rpDraw() {
  const { r, i } = rpState;
  const f = r.frames[i];
  const n = r.seats.length;
  const anchor = rpAnchor(r.seats, curOppId);
  const seatHTML = r.seats.map((s, k) => {
    const { x, y } = rpXY((k - anchor + n * 2) % n, n);
    const out = f.folded.has(s.actor);
    const live = f.actor === s.actor;
    const inFront = f.money ? (f.inv[s.actor] || 0) : 0;
    const cards = s.cards.length ? s.cards.map((c) => tileHTML(c)).join("") : `<span class="rpback"></span><span class="rpback"></span>`;
    return `<div class="rpseat${out ? " out" : ""}${live ? " live" : ""}" style="left:${x}%;top:${y}%">
      ${live && f.note ? `<div class="rpbub">${esc(f.note)}</div>` : ""}
      <div class="rpcards">${cards}</div>
      <div class="rpname"><span class="rppos">${esc(s.pos)}</span>${esc(s.name)}</div>
      ${s.chips ? `<div class="rpstack">${rpAmt(Number(s.chips), r.raw)}</div>` : ""}
      ${inFront ? `<div class="rpchip">${rpAmt(inFront, r.raw)}</div>` : ""}
    </div>`;
  }).join("");
  const boardHTML = r.board.slice(0, f.boardN).map((c) => tileHTML(c)).join("") ||
    `<span class="rpnoboard">—</span>`;
  $("hv-table").innerHTML =
    `<div class="rpfelt">${seatHTML}
       <div class="rpmid">
         <div class="rpboard">${boardHTML}</div>
         <div class="rppot">${f.money ? "Pot " + rpAmt(f.pot, r.raw) : "Pot —"}</div>
       </div>
     </div>
     <div class="rpfoot">
       <span class="rpstreet">${f.end ? "End" : f.street === "pre" ? "Preflop" : f.street.toUpperCase()}</span>
       ${!f.actor && f.note ? `<span class="rpnote">${esc(f.note)}</span>` : ""}
       ${!f.money ? `<span class="rpwarn" title="A bet on this hand has no amount on record, so the pot stops here rather than guess">pot unknown</span>` : ""}
       ${r.unseated ? `<span class="rpwarn" title="No position on record, so there is no honest seat for them">${r.unseated} not seated</span>` : ""}
     </div>`;
  rpTransport();
}

function rpTransport() {
  const { r, i } = rpState;
  const last = r.frames.length - 1;
  const jumps = RP_STREETS.filter((st) => r.frames.some((f) => f.street === st && !f.end));
  $("hv-transport").innerHTML =
    `<div class="rpjumps">${jumps.map((st) =>
      `<button class="chip mini${r.frames[i].street === st ? " on" : ""}" data-rpjump="${st}">${st === "pre" ? "Pre" : st[0].toUpperCase() + st.slice(1)}</button>`).join("")}</div>
     <div class="rpsteps">
       <button class="rpbtn" data-rpgo="0" ${i === 0 ? "disabled" : ""} title="Start">⏮</button>
       <button class="rpbtn" data-rpstep="-1" ${i === 0 ? "disabled" : ""} title="Back">‹</button>
       <button class="rpbtn rpplay" data-rpplay title="${rpState.timer ? "Pause" : "Play"}">${rpState.timer ? "❚❚" : "▶"}</button>
       <button class="rpbtn" data-rpstep="1" ${i === last ? "disabled" : ""} title="Forward">›</button>
       <button class="rpbtn" data-rpgo="${last}" ${i === last ? "disabled" : ""} title="End">⏭</button>
     </div>`;
}

function rpGo(i) {
  if (!rpState) return;
  rpState.i = Math.max(0, Math.min(i, rpState.r.frames.length - 1));
  if (rpState.i === rpState.r.frames.length - 1) rpStop();
  rpDraw();
}
function rpStop() { if (rpState?.timer) { clearInterval(rpState.timer); rpState.timer = null; } }
function rpPlay() {
  if (!rpState) return;
  if (rpState.timer) { rpStop(); rpDraw(); return; }
  if (rpState.i >= rpState.r.frames.length - 1) rpState.i = 0;
  rpState.timer = setInterval(() => rpGo(rpState.i + 1), 1100);
  rpDraw();
}
function rpClick(e) {
  const j = e.target.closest("[data-rpjump]");
  if (j) { rpStop(); rpGo(rpState.r.frames.findIndex((f) => f.street === j.dataset.rpjump && !f.end)); return; }
  const g = e.target.closest("[data-rpgo]");
  if (g) { rpStop(); rpGo(Number(g.dataset.rpgo)); return; }
  const s = e.target.closest("[data-rpstep]");
  if (s) { rpStop(); rpGo(rpState.i + Number(s.dataset.rpstep)); return; }
  if (e.target.closest("[data-rpplay]")) rpPlay();
}
