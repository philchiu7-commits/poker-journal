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
const RP_CARD = /^[2-9TJQKA][cdhs]$/;
const RP_HAND_NAMES = ["High card", "Pair", "Two pair", "Trips", "Straight", "Flush", "Full house", "Quads", "Straight flush"];
/* Best five of up to seven, with the five themselves — best7 in app.js keeps
   only the score, and the showdown line shows the cards that won. */
function rpBest5(cs) {
  let best = null;
  const n = cs.length;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
    for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
      const five = [cs[a], cs[b], cs[c], cs[d], cs[e]], score = score5(five);
      if (!best || cmpScore(score, best.score) > 0) best = { score, cards: five };
    }
  best.cards.sort((x, y) => RVAL[y[0]] - RVAL[x[0]]);
  return best;
}

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
  const how = {};                                     // and the action that put it there
  if (money) {
    if (SB) inv[actorAt.SB || "_SB"] = SB;
    if (BB) inv[actorAt.BB || "_BB"] = BB;
    if (STD && actorAt.STD) inv[actorAt.STD] = STD;
    for (const k of Object.keys(inv)) how[k] = "blind";
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
  /* What each seat has put in over the whole hand, streets already swept —
     the ante up front, then every street as the dealer takes it. A stack is
     what he sat down with minus this minus what is still in front of him. */
  const paid = {};
  if (money && ANTE) seats.forEach((s) => { paid[s.actor] = ANTE; });
  const sweep = () => {
    for (const k of Object.keys(inv)) { paid[k] = (paid[k] || 0) + inv[k]; delete inv[k]; delete how[k]; }
  };

  const rungs = handRungs(h);
  const frames = [];
  /* potSettled is the money already swept in; potStreet is what is still out
     in front of the seats. Kept apart so the felt never shows the same chips
     twice, and so the sweep between streets is something you can see happen. */
  const snap = (street, note, actor, rung, a) => frames.push({
    street, note, actor, rung, a, money,
    potSettled: settled, potStreet: streetOf(),
    inv: { ...inv }, how: { ...how }, paid: { ...paid }, folded: new Set(folded),
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
      sweep();
      level = 0;
      snap(st, null, null);                            // the cards land before anyone acts
    }
    for (const a of A) {
      if (a.act === "fold") folded.add(a.actor);
      else if (RP_AGG.has(a.act)) {
        const v = money ? (sizeAmount(a.size) ?? sizeMult(a.size, level)) : null;
        if (v === null) money = false;                 // stop the pot, keep replaying
        else { inv[a.actor] = v; how[a.actor] = rpKind(a.act); level = Math.max(level, v); }
      } else if (a.act === "call" || a.act === "limp") {
        if (money) { inv[a.actor] = level; how[a.actor] = "call"; }
      }
      snap(st, rpActText(a), a.actor, rungs.get(a), a);
    }
  }
  /* A hand that ends on a bet nobody answered. The import dropped the last
     fold (or the call that took it to showdown) on a few dozen hands, and the
     record itself says which it was: no showdown means they folded, a showdown
     means they called. Those frames are drawn, marked as read off the record
     rather than in it, so the hand is watched to its end. With no showdown
     flag at all nothing is inferred and the footer says so. */
  const lastA = (h.actions || []).slice(-1)[0];
  /* A seat with no action on record at all was never in the hand: a typed
     hand only writes down the seats that mattered, so the rest are not read as
     live to the river. Those with an action and no fold are the ones this
     infers for, and the ones the pot can go to. */
  const acted = new Set((h.actions || []).map((a) => a.actor));
  const stillIn = () => seats.filter((s) => acted.has(s.actor) && !folded.has(s.actor));
  let inferred = null;
  if (lastA && RP_AGG.has(lastA.act)) {
    const live = stillIn().filter((s) => s.actor !== lastA.actor);
    if (live.length && h.showdown === false) {
      inferred = "fold";
      for (const s of live) { folded.add(s.actor); snap(lastA.street, "folds", s.actor, null, { street: lastA.street, actor: s.actor, act: "fold", inferred: true }); }
    } else if (live.length && h.showdown === true) {
      inferred = "call";
      for (const s of live) { if (money) { inv[s.actor] = level; how[s.actor] = "call"; } snap(lastA.street, "calls", s.actor, null, { street: lastA.street, actor: s.actor, act: "call", inferred: true }); }
    } else if (live.length) inferred = "unknown";
  }
  /* The runout is on record even when the betting stopped early, so the last
     frame shows the board that actually came and every card that was seen. */
  const last = frames[frames.length - 1];
  /* Who the pot goes to, off what the walk knows: the folds it saw or read,
     and the cards on record if the betting closed with two or more still in.
     An unanswered bet with no showdown flag settles nothing. The uncalled part
     of the last bet goes back to its owner, so it is not part of what he won. */
  const live = stillIn();
  let result = null;
  if (live.length === 1 && folded.size) result = { winners: [live[0].actor], how: "folds" };
  else if (live.length > 1 && inferred !== "unknown" && board.length === 5
      && live.every((s) => s.cards.length === 2 && s.cards.every((c) => RP_CARD.test(c)))) {
    let best = null, winners = [];
    const hands = {};
    for (const s of live) {
      const b5 = rpBest5(board.concat(s.cards));
      hands[s.actor] = b5;
      const d = best ? cmpScore(b5.score, best) : 1;
      if (d > 0) { best = b5.score; winners = [s.actor]; } else if (d === 0) winners.push(s.actor);
    }
    result = { winners, how: "showdown", hands };
  }
  const outs = Object.values(inv).sort((x, y) => y - x);
  const uncalled = outs.length > 1 ? outs[0] - outs[1] : (outs[0] || 0);
  const won = money && result ? last.potSettled + last.potStreet - uncalled : null;
  sweep();
  frames.push({ ...last, note: null, actor: null, a: null, end: true,
    potSettled: last.potSettled + last.potStreet, potStreet: 0, inv: {}, paid: { ...paid },
    boardN: board.length });
  /* A seat's starting stack: the one on record for him, or the effective stack
     for Hero when the hand carries one. Nothing is assumed for anyone else —
     a stack the app made up would be wrong on exactly the hands it matters. */
  seats.forEach((s) => {
    if (s.chips) s.start = s.chips;
    else if (s.actor === "hero" && h.effStack > 0) s.start = h.effStack * u;
    else s.start = null;
  });
  return { seats, unseated, frames, board, h, inferred, result, won, stakes,
    blinds: { SB, BB, STD, ANTE, dealt: dealt.size }, stacks: seats.some((s) => s.start) };
}

/* The kind of action, for colour: a raise of any order is a raise, a jam is a
   jam, everything else is itself. The felt reads by colour before it reads by
   words — orange is a raise wherever it appears, green is a call. */
const rpKind = (act) => /^(raise|[345]bet)$/.test(act) ? "raise" : act;

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
    /* Live stack: what he started with less everything he has put in. Goes
       quiet once the pot can't be walked, or if the record and the walk
       disagree (a negative stack), rather than show a number that isn't. */
    const stack = s.start && f.money ? s.start - (f.paid[s.actor] || 0) - inFront : null;
    const kind = live && f.a ? rpKind(f.a.act) : "";
    /* The chip that just went in slides out from the seat, so the money moving
       is something seen and not worked out from a number changing. */
    const fresh = live && inFront && f.a && f.a.act !== "check" && f.a.act !== "fold";
    const cards = s.cards.length ? s.cards.map((c) => tileHTML(c)).join("") : `<span class="rpback"></span><span class="rpback"></span>`;
    /* The chip sits outside .rpbody so folding dims the player, not his money:
       what he already put in is still on the felt until the street is swept. */
    /* The bet always sits between the player and the pot, so seats below the
       middle push their chips up rather than off the edge of the felt. */
    return `<div class="rpseat${out ? " out" : ""}${live ? " live" : ""}${y > 52 ? " low" : ""}${kind ? " k-" + kind : ""}" style="left:${x}%;top:${y}%">
      ${live && f.note ? `<div class="rpbub${f.a?.inferred ? " inferred" : ""}" title="${f.a?.inferred ? "Not in the record — read off the uncalled bet and the showdown flag" : ""}">${esc(f.note)}${rungHTML(f.rung)}</div>` : ""}
      <div class="rpbody">
        <div class="rpcards">${cards}</div>
        <div class="rpname"><span class="rppos">${esc(s.pos)}</span>${esc(s.name)}</div>
        ${stack !== null && stack >= 0 ? `<div class="rpstack">${chipStr(stack)}</div>` : ""}
      </div>
      <div class="rpfront">
        ${s.pos === "BN" ? `<span class="rpdealer" title="Dealer">D</span>` : ""}
        ${inFront ? `<span class="rpchip c-${f.how[s.actor] || "blind"}${fresh ? " fresh" : ""}">${chipStr(inFront)}</span>` : ""}
      </div>
    </div>`;
  }).join("");
  const boardHTML = r.board.slice(0, f.boardN).map((c) => tileHTML(c)).join("") ||
    `<span class="rpnoboard">—</span>`;
  $("hv-table").innerHTML =
    `<div class="rpfelt">${seatHTML}
       <div class="rpmid">
         <div class="rpboard">${boardHTML}</div>
         <div class="rppot${i > 0 && !f.a && !f.end && f.street !== "pre" ? " swept" : ""}">${f.money
           ? "Pot " + chipStr(f.potSettled) +
             (f.potStreet ? `<span class="rpout">+${chipStr(f.potStreet)}</span>` : "")
           : "Pot —"}</div>
       </div>
     </div>
     <div class="rpfoot">
       <span class="rpstreet">${f.end ? "End" : RP_STREET_LABEL[f.street]}</span>
       ${!f.actor && f.note ? `<span class="rpnote">${esc(f.note)}</span>` : ""}
       ${!f.money ? `<span class="rpwarn" title="A bet on this hand has no amount on record, so the pot stops here rather than guess">pot unknown</span>` : ""}
       ${!r.stacks ? `<span class="rpwarn" title="No starting stacks on record for this hand, so none can be shown">no stacks</span>` : ""}
       ${r.inferred === "unknown" ? `<span class="rpwarn" title="The last bet has no answer on record and the hand does not say whether it reached showdown">ends on an unanswered bet</span>` : ""}
       ${r.inferred === "fold" || r.inferred === "call" ? `<span class="rpwarn" title="The record stops at the bet; the ${r.inferred} is read off its showdown flag">${r.inferred} not on record</span>` : ""}
       ${r.unseated ? `<span class="rpwarn" title="No position on record, so there is no honest seat for them">${r.unseated} not seated</span>` : ""}
     </div>`;
  rpTransport();
  rpLine();
  rpHistory();
}

function rpTransport() {
  const { r, i } = rpState;
  const last = r.frames.length - 1;
  const jumps = RP_STREETS.filter((st) => r.frames.some((f) => f.street === st && !f.end));
  $("hv-transport").innerHTML =
    `<div class="rpjumps">${jumps.map((st) =>
      `<button class="chip mini${r.frames[i].street === st ? " on" : ""}" data-rpjump="${st}">${st === "pre" ? "Pre" : RP_STREET_LABEL[st]}</button>`).join("")}</div>
     <div class="rpsteps">
       <button class="rpbtn rpnext" data-hvstep="-1" ${hvNextId(-1) ? "" : "disabled"} title="Previous hand">‹ Prev</button>
       <button class="rpbtn" data-rpgo="0" ${i === 0 ? "disabled" : ""} title="Start">⏮</button>
       <button class="rpbtn" data-rpstep="-1" ${i === 0 ? "disabled" : ""} title="Back">‹</button>
       <button class="rpbtn rpplay" data-rpplay title="${rpState.timer ? "Pause" : "Play"}">${rpState.timer ? "❚❚" : "▶"}</button>
       <button class="rpbtn" data-rpstep="1" ${i === last ? "disabled" : ""} title="Forward">›</button>
       <button class="rpbtn rpnext" data-hvstep="1" ${hvNextId(1) ? "" : "disabled"} title="Next hand">Next ›</button>
     </div>`;
}

/* ---------- the betting line in shorthand ----------
   The whole hand on one line, the way it is said at the table: "B100 C / B50 C
   / B50 C / B75 R50". Streets are cut by a slash; a bet or the raise that opens
   a street is B and its rung, a raise over a bet is R and its rung, a jam is J,
   and C X F L are call, check, fold, limp. Each token steps the table to it. */
function rpTok(a, rung, opened) {
  if (a.act === "fold") return "F";
  if (a.act === "check") return "X";
  if (a.act === "call") return "C";
  if (a.act === "limp") return "L";
  if (!RP_AGG.has(a.act)) return "";
  if (a.act === "jam" || (rung && rung.step === "jam")) return "J";
  const lbl = rung ? String((SIZING_STEP_BY_ID[rung.step] || {}).label || "").replace(/^B/, "") : "";
  return (opened ? "R" : "B") + lbl;
}
function rpLine() {
  const box = $("hv-line");
  if (!box) return;
  const { r, i } = rpState;
  const streets = [];
  let st = null, opened = false, cur = null;
  r.frames.forEach((f, k) => {
    if (!f.a) return;
    if (f.street !== st) { st = f.street; opened = false; cur = []; streets.push(cur); }
    const agg = RP_AGG.has(f.a.act);
    cur.push(`<button class="rptok${k === i ? " on" : ""}${agg ? " agg" : ""}" data-rpgo="${k}">${esc(rpTok(f.a, f.rung, opened))}</button>`);
    if (agg) opened = true;
  });
  box.innerHTML = streets.map((t) => `<span class="rpline-st">${t.join("")}</span>`).join(`<i class="rpline-cut">/</i>`);
  const on = box.querySelector(".rptok.on");
  if (on) box.scrollLeft = Math.max(0, on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2);
}

/* ---------- the running action list ----------
   Everything that has happened so far, in order, with the B33/B50 button each
   bet and raise would have been. It is the half of a replayer you actually
   read: the felt tells you where the money is, the list tells you how it got
   there. Tapping a line steps the table to it. */
/* The whole hand as a hand-history panel, the shape Phil reads his online
   hands in: one column per street headed by the pot that came into it, a card
   per action with the seat's position badge, the blinds up front and the
   showdown at the end. Tapping a card steps the table to it. */
const RP_POS_CLS = { BN: "d", SB: "b", BB: "b", STD: "s" };
function rpHistory() {
  const box = $("hv-log");
  if (!box) return;
  const { r, i } = rpState;
  const seatOf = {};
  r.seats.forEach((s) => { seatOf[s.actor] = s; });
  const posOf = (actor) => seatOf[actor] ? seatOf[actor].pos : String(actor).replace(/^_/, "");
  const who = (actor) => `<span class="rphh-who"><span class="rphh-pos p-${RP_POS_CLS[posOf(actor)] || "x"}">${esc(posOf(actor))}</span>` +
    `<span class="rphh-nm">${esc(seatOf[actor] ? seatOf[actor].name : "—")}</span></span>`;
  const card = (k, actor, act, cls) =>
    `<button class="rphh-card${k === i ? " on" : ""} ${cls}" data-rpgo="${k}">${who(actor)}<span class="rphh-act">${act}</span></button>`;
  const head = (k, label, pot) => `<button class="rphh-hd" data-rpgo="${k}"><span>${label}</span><b>${pot}</b></button>`;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const cols = [];

  const f0 = r.frames[0], b = r.blinds;
  if (f0.money && (b.ANTE || Object.keys(f0.inv).length)) {
    let cards = "";
    if (b.ANTE) cards += `<button class="rphh-card k-blind" data-rpgo="0"><span class="rphh-who"><span class="rphh-nm">All ante ×${b.dealt}</span></span>` +
      `<span class="rphh-act">Ante ${chipStr(b.ANTE * b.dealt)}</span></button>`;
    for (const k of Object.keys(f0.inv)) cards += card(0, k, `${esc(posOf(k))} ${chipStr(f0.inv[k])}`, "k-blind");
    cols.push(`<div class="rphh-col">${head(0, "Blinds" + (b.ANTE ? " (Ante)" : ""), "")}${cards}</div>`);
  }
  for (const st of RP_STREETS) {
    const first = r.frames.findIndex((f) => f.street === st && !f.end);
    if (first < 0) continue;
    const ff = r.frames[first];
    let cards = "";
    r.frames.forEach((f, k) => {
      if (f.street !== st || !f.a || f.end) return;
      const jam = f.a.act === "jam" || f.rung?.step === "jam";
      const txt = esc(cap(f.note || f.a.act)) + (jam ? `<i class="rphh-allin">All-in</i>` : rungHTML(f.rung));
      cards += card(k, f.a.actor, txt, `k-${rpKind(f.a.act)}${f.a.inferred ? " inferred" : ""}`);
    });
    cols.push(`<div class="rphh-col">${head(first, RP_STREET_LABEL[st], ff.money ? chipStr(ff.potSettled + ff.potStreet) : "")}${cards}</div>`);
  }
  const last = r.frames.length - 1, fe = r.frames[last], res = r.result;
  const acted = new Set((r.h.actions || []).map((a) => a.actor));
  const live = r.seats.filter((s) => acted.has(s.actor) && !fe.folded.has(s.actor));
  if (res || live.some((s) => s.cards.length)) {
    let cards = "";
    for (const s of live) {
      const won = !!res && res.winners.includes(s.actor);
      const eq = res?.how === "showdown" ? (won ? Math.round(100 / res.winners.length) : 0) + "%" : "";
      cards += `<button class="rphh-card k-sd${won ? " won" : ""}${i === last ? " on" : ""}" data-rpgo="${last}">${who(s.actor)}` +
        `<span class="rphh-act rphh-sd">${s.cards.length ? tilesHTML(s.cards) : "<em>not shown</em>"}${eq ? `<b>${eq}</b>` : ""}</span></button>`;
    }
    if (res) {
      const names = res.winners.map((a) => seatOf[a]?.name || a).join(" & ");
      const hand = res.hands?.[res.winners[0]];
      cards += `<div class="rphh-win"><div>${esc(names)} ${res.winners.length > 1 ? "chop" : "wins"}${r.won !== null ? " " + chipStr(r.won) : ""}` +
        `${res.how === "folds" ? " <small>all fold</small>" : ""}</div>` +
        (hand ? `<div class="rphh-five">${tilesHTML(hand.cards)}<small>${RP_HAND_NAMES[hand.score[0]]}</small></div>` : "") + `</div>`;
    }
    cols.push(`<div class="rphh-col">${head(last, res ? (res.how === "folds" ? "Result" : "Showdown") : "End", r.won !== null ? chipStr(r.won) : fe.money ? chipStr(fe.potSettled) : "")}${cards}</div>`);
  }
  /* The strip keeps its place while the current card is still in view and
     recentres only when the action has moved off the edge. */
  const prev = box.querySelector(".rphh-cols");
  const keep = prev ? prev.scrollLeft : 0;
  box.innerHTML = cols.length
    ? `<div class="rphh-title">Hand history${r.stakes ? " · " + esc(r.stakes.replace(/^Blinds /, "")) : ""} · ${r.seats.length} seated</div><div class="rphh-cols">${cols.join("")}</div>`
    : `<div class="rplog-empty">No actions on record.</div>`;
  const sc = box.querySelector(".rphh-cols"), col = box.querySelector(".rphh-card.on")?.closest(".rphh-col");
  if (sc && col) {
    const inView = col.offsetLeft >= keep && col.offsetLeft + col.offsetWidth <= keep + sc.clientWidth;
    sc.scrollLeft = inView ? keep : Math.max(0, col.offsetLeft - (sc.clientWidth - col.offsetWidth) / 2);
  }
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
