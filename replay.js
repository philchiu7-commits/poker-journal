/* ================= Visual replayer =================
   A hand as a table you step through: seats round the felt in seat order, the
   board dealt street by street, and the money walked so the pot is right.

   The money model is potWalk()'s in stats.js and has to stay in step with it —
   same unit tell (chipUnit: a fractional big blind means the blinds are written
   in thousands while the sizes are in chips), same ante-per-seat rule, and the
   same refusal to guess: the first amount it wasn't given stops the pot rather
   than inventing one, because a guessed number poisons every street after it.
   Everything the walk can't price still replays; only the pot goes quiet.

   Table conventions, the ones every replayer worth reading follows: a bet sits
   in front of the player who made it for the whole street and is swept into the
   pot when the next card comes, so the pot pill counts finished streets only
   and the chips still in front are shown beside it rather than twice. */

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
const RP_STREET_LABEL = { pre: "Preflop", flop: "Flop", turn: "Turn", river: "River" };

/* One frame per action, plus a frame for the posted blinds and one for the
   end. A frame is the whole table as it stood, so stepping is just an index. */
function rpBuild(h) {
  const { seats, unseated } = rpSeats(h);
  const b = h.blinds || {};
  const u = chipUnit(h);
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

  const rungs = handRungs(h);
  const frames = [];
  /* potSettled is the money already swept in; potStreet is what is still out
     in front of the seats. Kept apart so the felt never shows the same chips
     twice, and so the sweep between streets is something you can see happen. */
  const snap = (street, note, actor, rung, a) => frames.push({
    street, note, actor, rung, a, money,
    potSettled: settled, potStreet: streetOf(),
    inv: { ...inv }, folded: new Set(folded),
    boardN: Math.min(RP_BOARD_N[street], board.length),
  });
  const stakes = money
    ? "Blinds " + [SB, BB, STD].filter(Boolean).map(chipStr).join("/") +
      (ANTE ? ` (ante ${chipStr(ANTE)})` : "")
    : null;
  snap("pre", stakes, null);

  for (const st of RP_STREETS) {
    const A = (h.actions || []).filter((a) => a.street === st);
    if (!A.length) continue;
    if (st !== "pre") {
      settled += streetOf();                           // the dealer sweeps the street in
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
      snap(st, rpActText(a), a.actor, rungs.get(a), a);
    }
  }
  /* The runout is on record even when the betting stopped early, so the last
     frame shows the board that actually came and every card that was seen. */
  const last = frames[frames.length - 1];
  frames.push({ ...last, note: null, actor: null, a: null, end: true,
    potSettled: last.potSettled + last.potStreet, potStreet: 0, inv: {},
    boardN: board.length });
  return { seats, unseated, frames, board, h };
}

/* Short form for the bubble by a seat — "3-bets to 6800", without the name. */
function rpActText(a) {
  const { verb, sz, to } = actParts(a);
  return verb + (sz ? (to ? " to " : " ") + sz : "");
}

/* ---------- geometry ----------
   Seats sit on an ellipse, slot 0 at the bottom and slots running clockwise —
   the direction of play, so the eye follows the action round the felt the way
   it does at the table. */
function rpXY(slot, n) {
  const a = (slot / n) * 2 * Math.PI;
  return { x: 50 - 38 * Math.sin(a), y: 50 + 39 * Math.cos(a) };
}

let rpState = null;    // { handId, i, timer, r }

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
    /* The chip sits outside .rpbody so folding dims the player, not his money:
       what he already put in is still on the felt until the street is swept. */
    /* The bet always sits between the player and the pot, so seats below the
       middle push their chips up rather than off the edge of the felt. */
    return `<div class="rpseat${out ? " out" : ""}${live ? " live" : ""}${y > 52 ? " low" : ""}" style="left:${x}%;top:${y}%">
      ${live && f.note ? `<div class="rpbub">${esc(f.note)}${rungHTML(f.rung)}</div>` : ""}
      <div class="rpbody">
        <div class="rpcards">${cards}</div>
        <div class="rpname"><span class="rppos">${esc(s.pos)}</span>${esc(s.name)}</div>
        ${s.chips ? `<div class="rpstack">${chipStr(s.chips)}</div>` : ""}
      </div>
      ${inFront ? `<div class="rpchip">${chipStr(inFront)}</div>` : ""}
    </div>`;
  }).join("");
  const boardHTML = r.board.slice(0, f.boardN).map((c) => tileHTML(c)).join("") ||
    `<span class="rpnoboard">—</span>`;
  $("hv-table").innerHTML =
    `<div class="rpfelt">${seatHTML}
       <div class="rpmid">
         <div class="rpboard">${boardHTML}</div>
         <div class="rppot">${f.money
           ? "Pot " + chipStr(f.potSettled) +
             (f.potStreet ? `<span class="rpout">+${chipStr(f.potStreet)}</span>` : "")
           : "Pot —"}</div>
       </div>
     </div>
     <div class="rpfoot">
       <span class="rpstreet">${f.end ? "End" : RP_STREET_LABEL[f.street]}</span>
       ${!f.actor && f.note ? `<span class="rpnote">${esc(f.note)}</span>` : ""}
       ${!f.money ? `<span class="rpwarn" title="A bet on this hand has no amount on record, so the pot stops here rather than guess">pot unknown</span>` : ""}
       ${r.unseated ? `<span class="rpwarn" title="No position on record, so there is no honest seat for them">${r.unseated} not seated</span>` : ""}
     </div>`;
  rpTransport();
  rpLog();
}

function rpTransport() {
  const { r, i } = rpState;
  const last = r.frames.length - 1;
  const jumps = RP_STREETS.filter((st) => r.frames.some((f) => f.street === st && !f.end));
  $("hv-transport").innerHTML =
    `<div class="rpjumps">${jumps.map((st) =>
      `<button class="chip mini${r.frames[i].street === st ? " on" : ""}" data-rpjump="${st}">${st === "pre" ? "Pre" : RP_STREET_LABEL[st]}</button>`).join("")}</div>
     <div class="rpsteps">
       <button class="rpbtn" data-rpgo="0" ${i === 0 ? "disabled" : ""} title="Start">⏮</button>
       <button class="rpbtn" data-rpstep="-1" ${i === 0 ? "disabled" : ""} title="Back">‹</button>
       <button class="rpbtn rpplay" data-rpplay title="${rpState.timer ? "Pause" : "Play"}">${rpState.timer ? "❚❚" : "▶"}</button>
       <button class="rpbtn" data-rpstep="1" ${i === last ? "disabled" : ""} title="Forward">›</button>
       <button class="rpbtn rpnext" data-hvstep="1" ${hvNextId(1) ? "" : "disabled"} title="Next hand">Next hand ›</button>
     </div>`;
}

/* ---------- the running action list ----------
   Everything that has happened so far, in order, with the B33/B50 button each
   bet and raise would have been. It is the half of a replayer you actually
   read: the felt tells you where the money is, the list tells you how it got
   there. Tapping a line steps the table to it. */
function rpLog() {
  const box = $("hv-log");
  if (!box) return;
  const { r, i } = rpState;
  const seatOf = {};
  r.seats.forEach((s) => { seatOf[s.actor] = s; });
  let st = null, rows = "";
  r.frames.forEach((f, k) => {
    if (!f.a) return;
    if (f.street !== st) {
      st = f.street;
      rows += `<div class="rplog-st"><span>${RP_STREET_LABEL[st]}</span>` +
        (f.money ? `<span class="rplog-pot">pot ${chipStr(f.potSettled)}</span>` : "") + `</div>`;
    }
    const s = seatOf[f.a.actor];
    const agg = RP_AGG.has(f.a.act);
    rows += `<button class="rplog-row${k === i ? " on" : ""}${agg ? " agg" : ""}" data-rpgo="${k}">` +
      `<span class="rplog-pos">${esc(s ? s.pos : "?")}</span>` +
      `<span class="rplog-nm">${esc(s ? s.name : f.a.actor)}</span>` +
      `<span class="rplog-act">${esc(f.note || "")}${rungHTML(f.rung)}</span></button>`;
  });
  box.innerHTML = rows || `<div class="rplog-empty">No actions on record.</div>`;
  const cur = box.querySelector(".rplog-row.on");
  if (cur) box.scrollTop = Math.max(0, cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2);
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
  const hs = e.target.closest("[data-hvstep]");
  if (hs) { if (!hs.disabled) hvStep(Number(hs.dataset.hvstep)); return; }
  const j = e.target.closest("[data-rpjump]");
  if (j) { rpStop(); rpGo(rpState.r.frames.findIndex((f) => f.street === j.dataset.rpjump && !f.end)); return; }
  const g = e.target.closest("[data-rpgo]");
  if (g) { rpStop(); rpGo(Number(g.dataset.rpgo)); return; }
  const s = e.target.closest("[data-rpstep]");
  if (s) { rpStop(); rpGo(rpState.i + Number(s.dataset.rpstep)); return; }
  if (e.target.closest("[data-rpplay]")) rpPlay();
}
