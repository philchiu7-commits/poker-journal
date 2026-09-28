/* Read estimates — for each yes/no read on the tree, how the hands on record
   bear on it: k of n spots, and which hands. Display only: nothing here sets or
   changes a read, that stays Phil's tap. Needs RVAL/best7 (app.js),
   actsAsPlayed/betsVsPot (stats.js) and hqBoardCard (hfind.js) — all looked up
   when called, so load order doesn't matter.
   Frequency reads (rule F) count imported hands only, the HUD's rule: logged
   hands are the interesting ones and would skew a frequency. The other reads
   count any hand with that player's two cards on record. */
const readEstimates = (() => {
  const CARD = /^[2-9TJQKA][cdhs]$/;
  const AGG = new Set(["bet", "raise", "3bet", "4bet", "5bet", "jam", "limp-raise", "open"]);
  const STS = ["pre", "flop", "turn", "river"], BN = { flop: 3, turn: 4, river: 5 };
  const rk = (c) => RVAL[c[0]], su = (c) => c[1];
  
  function boardCat(b) {                               // what the board makes on its own
    if (b.length === 5) return best7(b);
    const n = Object.values(b.reduce((m, c) => (m[rk(c)] = (m[rk(c)] || 0) + 1, m), {})).sort((a, z) => z - a);
    return [n[0] === 4 ? 7 : n[0] === 3 ? 3 : n[0] === 2 && n[1] === 2 ? 2 : n[0] === 2 ? 1 : 0];
  }
  const four = (b) => {                                // 4-flush or 4-straight on the board itself
    const s = {}; for (const c of b) s[su(c)] = (s[su(c)] || 0) + 1;
    const fl = Object.values(s).some((n) => n >= 4);
    const r = new Set(b.flatMap((c) => rk(c) === 14 ? [14, 1] : [rk(c)]));
    let st = false; for (let lo = 1; lo <= 10; lo++) { let k = 0; for (let v = lo; v < lo + 5; v++) if (r.has(v)) k++; if (k >= 4) st = true; }
    return { fl, st };
  };
  /* Where their flush sits on a 4-flush board: 0 = nut, 1 = second nut, … (ranks of the suit
     above their best card that aren't on the board). null = no flush card of their own there. */
  function flushStep(hole, board) {
    for (const s of "cdhs") {
      const on = board.filter((c) => su(c) === s).map(rk);
      if (on.length < 4) continue;
      const mine = hole.filter((c) => su(c) === s).map(rk);
      if (!mine.length) return null;
      const top = Math.max(...mine); let n = 0;
      for (let v = top + 1; v <= 14; v++) if (!on.includes(v)) n++;
      return { n, top };
    }
    return null;
  }
  /* Phil's NLHE ladder (Hand-strength rules): 0 bluff · 1 second pair · 2 top pair · 3 overpair ·
     4 two pair+. Own-card pairs only. Phil 2026-09-28, for every value/bluff read: on a 4-straight
     board only a straight or better is value; on a 4-flush board only a flush of Q-high or better
     (third nut — the step counts past suit cards on the board). Anything under that drops to 0
     like a weak pair: not value, not air. */
  const HN = ["", "", "", "", "straight", "flush", "full house", "quads", "straight flush"], RN = "  23456789TJQKA";
  function tier(hole, board) {
    const all = hole.concat(board), s = best7(all), bc = boardCat(board), f = four(board);
    const out = { t: 0, name: "no pair", cat: s[0] };
    const drop = (name) => ({ ...out, name: name + " (4-" + (f.fl ? "flush" : "straight") + " board)", weakPair: true });
    if (s[0] >= 4 && (board.length === 5 ? cmp(s, bc) > 0 : s[0] > bc[0])) {
      if (f.fl && s[0] === 4) return drop("straight");
      if (f.fl && s[0] === 5) {
        const k = flushStep(hole, board), name = (k.n === 0 ? "nut" : RN[k.top] + "-high") + " flush";
        return k && k.n <= 2 ? { ...out, t: 4, name, flushStep: k.n } : drop(name);
      }
      return { ...out, t: 4, name: HN[s[0]] };
    }
    const cnt = {}; for (const c of all) cnt[rk(c)] = (cnt[rk(c)] || 0) + 1;
    const hr = hole.map(rk);
    const made = hr.some((v) => cnt[v] >= 3) ? (hr[0] === hr[1] ? "set" : "trips") : new Set(hr.filter((v) => cnt[v] >= 2)).size >= 2 ? "two pair" : null;
    if (made) return f.fl || f.st ? drop(made) : { ...out, t: 4, name: made };
    const mine = [...new Set(hr.filter((v) => cnt[v] >= 2))];
    if (!mine.length) return out;
    const above = new Set(board.map(rk).filter((v) => v > mine[0])).size, pp = hr[0] === hr[1];
    let t = above === 0 ? (pp ? 3 : 2) : above === 1 ? 1 : 0;
    let name = above === 0 ? (pp ? "overpair" : "top pair") : above === 1 ? "second pair" : (pp ? "underpair" : above === 2 ? "third pair" : "bottom/weak pair");
    if (t >= 1 && (f.fl || f.st)) { name += " (4-" + (f.fl ? "flush" : "straight") + " board)"; t = 0; }
    return { ...out, t, name, weakPair: t === 0 };
  }
  function cmp(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }
  function draws(hole, board) {                        // only while cards are to come
    if (board.length >= 5) return {};
    const all = hole.concat(board), out = {};
    for (const s of "cdhs") {
      const n = all.filter((c) => su(c) === s).length, mine = hole.filter((c) => su(c) === s);
      if (n === 4 && mine.length) {
        const top = board.some((c) => su(c) === s && rk(c) === 14) ? 13 : 14;
        out.fd = true; out.nutFd = mine.some((c) => rk(c) >= top);
      }
    }
    const R = (cs) => new Set(cs.flatMap((c) => rk(c) === 14 ? [14, 1] : [rk(c)]));
    const ra = R(all), rb = R(board);
    for (let lo = 2; lo + 3 <= 13; lo++) {             // 4 in a row, both ends open, his card in it
      let ok = true, b = 0; for (let v = lo; v < lo + 4; v++) { if (!ra.has(v)) ok = false; if (rb.has(v)) b++; }
      if (ok && b < 4) out.oesd = true;
    }
    if (!out.oesd) for (let lo = 1; lo <= 10; lo++) {
      let k = 0, b = 0; for (let v = lo; v < lo + 5; v++) { if (ra.has(v)) k++; if (rb.has(v)) b++; }
      if (k === 4 && b < 4) out.gut = true;
    }
    return out;
  }
  const pre2 = (h) => { const [a, b] = h.map(rk).sort((x, y) => y - x); const s = su(h[0]) === su(h[1]);
    const R = "  23456789TJQKA"; return a === b ? R[a] + R[b] : R[a] + R[b] + (s ? "s" : "o"); };
  // Phil's value lines (2026-09-28): 3-bet value = 88+, AQ+ any suit; 4-bet value = JJ+, AK.
  const val3 = (h) => { const [a, b] = h.map(rk).sort((x, y) => y - x); return (a === b && a >= 8) || (a === 14 && b >= 12); };
  const val4 = (h) => { const [a, b] = h.map(rk).sort((x, y) => y - x); return (a === b && a >= 11) || (a === 14 && b === 13); };
  
  /* One hand from one seat's point of view. */
  function facts(h, oppId) {
    const idx = (h.villains || []).findIndex((v) => v.opponentId === oppId);
    if (idx < 0) return null;
    const me = "v" + idx, A = actsAsPlayed(h);
    const hole = (h.villains[idx].cards || []).filter(Boolean);
    const board = (h.board || []).filter(Boolean);
    const cards = hole.length === 2 && hole.every((c) => CARD.test(c)) && board.every((c) => CARD.test(c)) ? hole : null;
    const actors = new Set(A.map((a) => a.actor));
    const folded = new Set(), F = { h, me, idx, cards, board, st: {} };
    let preAgg = null, preRaises = 0, prevAgg = null, init = null;   // init: who holds the betting lead, carried through checked streets
    for (const st of STS) {
      const acts = A.filter((a) => a.street === st);
      const alive = [...actors].filter((x) => !folded.has(x));
      const S = { acts, alive: alive.length, my: acts.filter((a) => a.actor === me).map((a) => a.act), faced: null, resp: null,
        firstBetBy: null, iBet: false, lead: false, xr: false, raised: false, prevAgg, init };
      let open = false, checked = false;
      const order = [];
      for (const a of acts) {
        if (!order.includes(a.actor)) order.push(a.actor);
        if (a.actor === me) {
          if (open && S.resp === null) { S.faced = true; S.resp = a.act === "fold" ? "fold" : AGG.has(a.act) ? "raise" : "call"; if (checked && AGG.has(a.act)) S.xr = true; }
          if (a.act === "check") checked = true;
          if (AGG.has(a.act)) { if (!open) { S.iBet = true; if (st !== "pre" && prevAgg && prevAgg !== me && !order.includes(prevAgg) && alive.includes(prevAgg)) S.lead = true; } else S.raised = true; }
        }
        if (AGG.has(a.act)) { if (!S.firstBetBy) S.firstBetBy = a.actor; open = true; S.lastAgg = a.actor; if (st === "pre") preRaises++; }
        if (a.act === "fold") folded.add(a.actor);
      }
      S.ip = order.length > 1 && order.indexOf(me) === order.length - 1;
      S.line = !S.my.length ? null : S.my.some((x) => AGG.has(x)) ? "B" : S.my.includes("fold") ? "F" : S.my.includes("call") ? "C" : "X";
      if (st !== "pre" && board.length >= BN[st] && acts.length) {
        S.board = board.slice(0, BN[st]);
        if (cards) { S.tier = tier(cards, S.board); S.draw = draws(cards, S.board); }
      }
      if (st === "pre") preAgg = S.lastAgg || null;
      prevAgg = st === "pre" ? preAgg : (S.lastAgg || null);
      init = S.lastAgg || init;
      S.checkedThrough = acts.length > 0 && acts.every((a) => a.act === "check");
      F.st[st] = S;
    }
    const P = F.st.pre;
    F.pfr = preAgg === me; F.preAgg = preAgg; F.limped = preRaises === 0;
    F.pfc = !F.pfr && P.my.some((x) => x === "call") && !P.my.includes("fold");
    F.pot = preRaises === 0 ? "limped" : preRaises === 1 ? "SRP" : "3BP+";
    F.threebet = P.my.includes("3bet"); F.fourbet = P.my.includes("4bet");
    F.openLimp = P.my[0] === "limp";
    F.limpFacedRaise = F.openLimp && P.my.length > 1;
    F.imported = !!h.imported;
    return F;
  }
  
  const TT = (t) => t && t.t;                                       // tier number
  // a hand with no pair of its own reads as a bluff, even when the board pairs or trips itself (Phil)
  const g = (S) => S && S.tier ? `${S.tier.name === "no pair" ? "bluff — no pair of their own" : S.tier.name}${S.draw && (S.draw.fd || S.draw.oesd || S.draw.gut) ? " + " + [S.draw.fd && (S.draw.nutFd ? "nut FD" : "FD"), S.draw.oesd && "OESD", S.draw.gut && "gutshot"].filter(Boolean).join("/") : ""}` : "";
  const air = (S) => S.tier.t === 0 && !S.tier.weakPair && !(S.draw && (S.draw.fd || S.draw.oesd || S.draw.gut));
  const eq = (S) => S.tier.t === 0 && S.draw && (S.draw.fd || S.draw.oesd || S.draw.gut);
  
  /* Rules. F: how often he takes a spot — Yes >70%, No <30%, over ≥7 chances (Phil's exploitable bar).
     CAN: does he ever show this hand type in the spot — Yes once seen ≥2 times and ≥30% of what he
     showed there; No only when 0 of ≥7 shown; anything else is "rare"/"too few".
     SHARE: a share of shown hands against explicit Yes/No lines, over ≥7 shown. */
  const RULE = {
    F: { yes: 65, no: 35, min: 7 },
    CAN: { k: 2, share: 30, noMin: 7 },
  };
  /* Each spec: which hands are chances (ch → {ok, why} | null). */
  const SPECS = [];
  const S = (o) => SPECS.push(o);
  const street = (F, s) => F.st[s];
  const lineOf = (F) => ["flop", "turn", "river"].map((s) => F.st[s].line || "-").join("");
  
  // ---------- preflop
  S({ id: "over-folds-3bet", grp: "Preflop", rule: "F", imp: true, def: "Opened, faced a 3-bet: folded.",
    ch: (F) => { const P = F.st.pre; if (!F.pfr && !(P.my[0] === "raise" || P.my[0] === "open")) return null;
      const i = P.acts.findIndex((a) => a.actor === F.me && (a.act === "raise" || a.act === "open"));
      if (i < 0 || !P.acts.slice(i + 1).some((a) => a.actor !== F.me && a.act === "3bet")) return null;
      const after = P.acts.slice(i + 1).find((a) => a.actor === F.me); if (!after) return null;
      return { ok: after.act === "fold", why: after.act === "fold" ? "folded to the 3-bet" : after.act + " vs 3-bet" }; } });
  S({ id: "limp-caller", grp: "Preflop", rule: "F", imp: true, def: "Open-limped, then faced a raise: called (not folded, not re-raised).",
    ch: (F) => F.limpFacedRaise ? { ok: F.st.pre.my[1] === "call", why: "limp → " + F.st.pre.my[1] } : null });
  S({ id: "3bets-light", grp: "Preflop", rule: "CAN", def: "3-bets shown with a hand outside 88+/AQo+ (AQ, AK any suit).",
    ch: (F) => F.threebet && F.cards ? { ok: !val3(F.cards), why: pre2(F.cards) + (val3(F.cards) ? " (value)" : " (light)") } : null });
  S({ id: "can-4bet-light", grp: "Preflop", rule: "CAN", def: "4-bets shown with a hand outside JJ+/AK.",
    ch: (F) => F.fourbet && F.cards ? { ok: !val4(F.cards), why: pre2(F.cards) + (val4(F.cards) ? " (value)" : " (light)") } : null });
  
  S({ id: "open-small-pp-ep", grp: "Preflop", rule: "CAN", def: "Shown with 22–66, nobody had raised yet when they first acted (limpers allowed; free BB check excluded): opened with a raise rather than limp or fold. Any position.",
    ch: (F) => { if (!F.cards) return null; const r = F.cards.map((c) => c[0]); if (r[0] !== r[1] || !"23456".includes(r[0])) return null;
      const P = F.st.pre, i = P.acts.findIndex((a) => a.actor === F.me); if (i < 0) return null;
      if (P.acts.slice(0, i).some((a) => /raise|bet|jam/.test(a.act))) return null;   // facing a raise isn't an open spot
      const first = P.acts[i].act; if (first === "check" || /^\d+bet$/.test(first)) return null;   // "3bet" first = a raise went unlogged
      return { ok: /raise|bet|jam/.test(first), why: pre2(F.cards) + " " + P.my.join("→") }; } });
  
  // ---------- postflop action frequencies (imported hands only)
  for (const [id, s, lab] of [["station-f", "flop", "Flop"], ["station-t", "turn", "Turn"], ["station-r", "river", "River"]])
    S({ id, grp: "Postflop — calling", rule: "F", imp: true, def: `Heads-up, faced a ${lab.toLowerCase()} bet: continued (call or raise) rather than fold.`,
      ch: (F) => { const T = street(F, s); return T.faced && T.alive === 2 ? { ok: T.resp !== "fold", why: T.resp + (T.tier ? " with " + g(T) : "") } : null; } });
  const myTurnFirst = (T, me) => {                     // he acted before anyone else bet this street
    const i = T.acts.findIndex((a) => a.actor === me), j = T.acts.findIndex((a) => a.actor !== me && ["bet", "raise", "jam"].includes(a.act));
    return i >= 0 && (j < 0 || i < j);
  };
  S({ id: "over-cbet", grp: "Postflop — betting", rule: "F", imp: true, def: "Preflop raiser, the flop checked to them (or they were first): bet.",
    ch: (F) => { const T = F.st.flop; if (!F.pfr || !myTurnFirst(T, F.me)) return null; return { ok: T.firstBetBy === F.me, why: T.firstBetBy === F.me ? "cbet" : "checked" }; } });
  S({ id: "pfr-oop-cbet", grp: "Postflop — betting", rule: "F", imp: true, def: "Preflop raiser, heads-up, out of position on the flop: bet.",
    ch: (F) => { const T = F.st.flop; if (!F.pfr || T.alive !== 2 || T.ip || !myTurnFirst(T, F.me)) return null; return { ok: T.firstBetBy === F.me, why: T.firstBetBy === F.me ? "cbet OOP" : "checked OOP" }; } });
  S({ id: "barrels-off", grp: "Postflop — betting", rule: "F", imp: true, def: "Cbet the flop, got called, the turn was theirs to bet: bet it again.",
    ch: (F) => { const f = F.st.flop, t = F.st.turn; if (!F.pfr || f.firstBetBy !== F.me || f.raised || !myTurnFirst(t, F.me)) return null;
      return { ok: t.firstBetBy === F.me, why: t.firstBetBy === F.me ? "barrelled" : "checked turn" }; } });
  S({ id: "t-cb-gu", grp: "Postflop — betting", rule: "F", imp: true, def: "Cbet the flop, checked the turn, then faced a turn bet: folded.",
    ch: (F) => { const f = F.st.flop, t = F.st.turn; if (!F.pfr || f.firstBetBy !== F.me || !t.my.length || t.my[0] !== "check" || !t.faced) return null;
      return { ok: t.resp === "fold", why: "x then " + t.resp + (t.tier ? " with " + g(t) : "") }; } });
  S({ id: "lead-limped", grp: "Postflop — betting", rule: "F", imp: true, def: "Limped pot, they are first to act on the flop: bet.",
    ch: (F) => { const f = F.st.flop; if (!F.limped || !f.acts.length || f.acts[0].actor !== F.me) return null;
      return { ok: f.iBet, why: f.iBet ? "led" : "checked" }; } });
  S({ id: "f-xr-pfc-gu-turn", grp: "Postflop — betting", rule: "F", imp: true, def: "Check-raised the flop as the preflop caller, got called: checked or folded the turn instead of betting it.",
    ch: (F) => { const f = F.st.flop, t = F.st.turn; if (!F.pfc || !f.xr || !t.my.length) return null;
      return { ok: !t.my.some((x) => ["bet", "raise", "jam"].includes(x)), why: "turn: " + t.my.join("/") + (t.tier ? " with " + g(t) : "") }; } });
  for (const [id, k, lab] of [["t-bcard-3flush", "flush", "a third card of a suit"], ["t-bcard-4flush", "4flush", "a fourth card of a suit"], ["t-bcard-4str", "4str", "a four-straight"], ["t-bcard-over", "over", "an overcard to the flop"], ["t-bcard-blank", "blank", "a blank"]])
    S({ id, grp: "Turn cards he barrels", rule: "F", imp: true, def: `As preflop raiser with a bluff hand shown (no pair better than third — air or a draw), the turn brought ${lab} and was theirs to bet (turn only, any flop): bet it.`,
      ch: (F) => { const t = F.st.turn; if (!F.pfr || !F.cards || !t.tier || t.tier.t !== 0 || !myTurnFirst(t, F.me) || F.board.length < 4) return null;
        if (!hqBoardCard(F.board, 3)[k]) return null;
        return { ok: t.firstBetBy === F.me, why: (t.firstBetBy === F.me ? "barrelled " : "checked ") + F.board[3] + " with " + g(t) }; } });
  
  // ---------- what he holds (shown hands, any source)
  const bets = (F, s) => { const T = F.st[s]; return F.cards && T.tier && (T.iBet || T.raised) ? T : null; };
  S({ id: "merged", grp: "What they bet", rule: "SHARE", yes: 30, no: 15, def: "Turn and river bets shown: share that were second or top pair (the middle). Merged ≥30%; below 15% they is polar.",
    ch: (F) => { for (const s of ["river", "turn"]) { const T = bets(F, s); if (T) return { ok: T.tier.t === 1 || T.tier.t === 2, why: s + " bet: " + g(T) }; } return null; } });
  S({ id: "polar", grp: "What they bet", rule: "SHARE", yes: 85, no: 70, def: "Turn and river bets shown: share that were bluffs or overpair-or-better (nothing in between). Polar ≥85%, merged below 70%.",
    ch: (F) => { for (const s of ["river", "turn"]) { const T = bets(F, s); if (T) return { ok: !(T.tier.t === 1 || T.tier.t === 2), why: s + " bet: " + g(T) }; } return null; } });
  S({ id: "bluffs-rivers", grp: "What they bet", rule: "SHARE", yes: 40, no: 15, def: "River bets shown: share that were bluffs (weaker than second pair). Yes ≥40%, No ≤15%.",
    ch: (F) => { const T = bets(F, "river"); return T ? { ok: T.tier.t === 0, why: g(T) } : null; } });
  S({ id: "r-thin", grp: "What they bet", rule: "CAN", def: "River bets shown with second or top pair (thin value).",
    ch: (F) => { const T = bets(F, "river"); return T ? { ok: T.tier.t === 1 || T.tier.t === 2, why: g(T) } : null; } });
  S({ id: "overbets-nuts", grp: "What they bet", rule: "SHARE", yes: 70, no: 30, def: "Postflop bets of pot or more shown: share that were two pair or better.",
    ch: (F) => { const hit = sized(F).filter((x) => x.r >= 0.95); if (!hit.length) return null; const x = hit[hit.length - 1];
      return { ok: x.T.tier.t === 4, why: `${x.s} ${Math.round(x.r * 100)}% pot: ${g(x.T)}` }; } });
  S({ id: "small-with-weak", grp: "What they bet", rule: "SHARE", yes: 70, no: 30, def: "Postflop bets of 40% pot or less shown: share that were second pair or worse.",
    ch: (F) => { const hit = sized(F).filter((x) => x.r <= 0.4 && !x.raise); if (!hit.length) return null; const x = hit[hit.length - 1];
      return { ok: x.T.tier.t <= 1, why: `${x.s} ${Math.round(x.r * 100)}% pot: ${g(x.T)}` }; } });
  S({ id: "bet-merged-mwp", grp: "What they bet", rule: "CAN", def: "Bets into 3+ players shown with second or top pair.",
    ch: (F) => { for (const s of ["flop", "turn", "river"]) { const T = bets(F, s); if (T && T.alive >= 3 && T.iBet) return { ok: T.tier.t === 1 || T.tier.t === 2, why: s + ", " + T.alive + "-way: " + g(T) }; } return null; } });
  /* A flush only counts toward traps as the nut flush on a four-flush board
     (Phil): any other flush there, or any flush on a three-flush board, is
     left out either way, bet or checked. */
  // Phil: a flush traps only as the nut flush on a 4-flush board (flushStep is set only there, so a 3-flush board's flush never counts).
  const trapFlushOk = (F, T) => T.tier.cat !== 5 || T.tier.flushStep === 0;
  S({ id: "r-traps", grp: "What they bet", rule: "CAN", def: "Rivers where they held two pair or better and the river was theirs to bet: checked instead (check-call or check-raise; a check-back in position isn't a trap). On a four-straight board only a straight or better counts; a flush counts only as the nut flush on a four-flush board, never on a three-flush board.",
    ch: (F) => { if (!F.cards) return null; for (const s of ["river"]) { const T = F.st[s]; if (T.tier && T.tier.t === 4 && trapFlushOk(F, T) && myTurnFirst(T, F.me) && !T.ip) return { ok: T.my[0] === "check", why: s + ": " + T.my.join("/") + " with " + g(T) }; } return null; } });
  S({ id: "r-xc-thin", grp: "What they bet", rule: "CAN", def: "As preflop raiser, checked the river and called a bet: shown with second or top pair (thin value).",
    ch: (F) => { const T = F.st.river; if (!F.pfr || !F.cards || !T.tier || T.my[0] !== "check" || !T.my.includes("call")) return null;
      return { ok: T.tier.t === 1 || T.tier.t === 2, why: "check-called river with " + g(T) }; } });
  S({ id: "r-can-x-nsd", grp: "What they bet", rule: "CAN", def: "As preflop raiser, checked the river holding no pair (gave up).",
    ch: (F) => { const T = F.st.river; if (!F.pfr || !F.cards || !T.tier || !T.my.length) return null;
      const x = T.my[0] === "check"; return { ok: x && T.tier.t === 0 && !T.tier.weakPair, why: (x ? "checked" : T.my[0]) + " river with " + g(T) }; } });
  
  // barrels content (PFR turn barrel after flop cbet)
  // turn only (Phil 2026-09-28): PFR bet the turn first, whatever they did on the flop
  const barrel = (F) => { const t = F.st.turn; return F.pfr && F.cards && t.firstBetBy === F.me && t.tier ? t : null; };
  // Turn → As PFR → Bluff: of their turn bluffs as PFR, the XB line — checked the flop, bet the turn (Phil 2026-09-28)
  S({ id: "t-bluff-xb", grp: "Turn barrels (as PFR)", rule: "CAN", def: "Turn bluffs shown as preflop raiser (bet first, no pair better than third): share on the XB line — only checked the flop, then bet the turn.",
    ch: (F) => { const t = F.st.turn; if (!F.pfr || !F.cards || !t.tier || t.firstBetBy !== F.me || t.tier.t !== 0) return null; const l = own(F.st.flop); return { ok: l === "X", why: "flop " + l + ": " + g(t) }; } });
  S({ id: "t-barrel-air", grp: "Turn barrels (as PFR)", rule: "CAN", def: "Turn bets as preflop raiser shown with nothing: no pair, no draw.", ch: (F) => { const T = barrel(F); return T ? { ok: air(T), why: g(T) } : null; } });
  S({ id: "t-barrel-equity", grp: "Turn barrels (as PFR)", rule: "CAN", def: "Turn bets as preflop raiser shown with a draw and no pair (FD, OESD or gutshot).", ch: (F) => { const T = barrel(F); return T ? { ok: !!eq(T), why: g(T) } : null; } });
  S({ id: "t-barrel-sdv", grp: "Turn barrels (as PFR)", rule: "CAN", def: "Turn bets as preflop raiser shown with a weak made hand: second pair or a pair under it.", ch: (F) => { const T = barrel(F); return T ? { ok: T.tier.t === 1 || !!T.tier.weakPair, why: g(T) } : null; } });
  // Turn → As PFR → When check → xR (Phil 2026-09-28): they checked the turn as raiser, then check-raised.
  for (const [id, what, ok] of [["t-xr-pfr-nut", "two pair or better", (T) => T.tier.t === 4], ["t-xr-pfr-bluff", "a bluff: no pair better than third (draws count)", (T) => T.tier.t === 0]])
    S({ id, grp: "Turn barrels (as PFR)", rule: "CAN", def: `As preflop raiser, checked the turn and check-raised — showed ${what}.`,
      ch: (F) => { const T = F.st.turn; return F.pfr && F.cards && T.tier && T.xr ? { ok: ok(T), why: g(T) } : null; } });
  S({ id: "t-barrel-mergy", grp: "Turn barrels (as PFR)", rule: "CAN", def: "Turn bets as preflop raiser shown with a middling made hand: second or top pair (a merged barrel, not polar).", ch: (F) => { const T = barrel(F); return T ? { ok: T.tier.t === 1 || T.tier.t === 2, why: g(T) } : null; } });
  S({ id: "t-barrel-tight", grp: "Turn barrels (as PFR)", rule: "SHARE", yes: 70, no: 40, def: "Turn barrels shown: share that were top pair or better.", ch: (F) => { const T = barrel(F); return T ? { ok: T.tier.t >= 2, why: g(T) } : null; } });
  S({ id: "t-barrel-one-done", grp: "Turn barrels (as PFR)", rule: "F", imp: true, def: "Cbet the flop as preflop raiser, then first to act on the turn (no one bet before them): checked it.",
    ch: (F) => { const f = F.st.flop, t = F.st.turn; if (!F.pfr || f.firstBetBy !== F.me || !t.my.length || !myTurnFirst(t, F.me)) return null;
      return { ok: t.my[0] === "check", why: "turn " + t.my.join("/") + (t.tier ? " with " + g(t) : "") }; } });
  /* Protect T Flush (Phil 2026-09-28): last aggressor on the flop, out of position on a turn
     that brings the third card of a suit, holding a made flush — checks it to protect the
     checking range. Share checked (vs bet out). */
  S({ id: "t-protect-flush", grp: "Turn barrels (as PFR)", rule: "SHARE", yes: 70, no: 30, def: "Flop aggressor, out of position when the turn brought a third card of a suit, holding a made flush: share checked it (protecting their checks) rather than bet.",
    ch: (F) => { const f = F.st.flop, t = F.st.turn; if (!F.cards || !t.tier || t.ip || F.board.length < 4 || !hqBoardCard(F.board, 3).flush) return null;
      const agg = f.acts.filter((a) => AGG.has(a.act)).pop();
      if (!agg || agg.actor !== F.me || !(t.tier.cat === 5 || t.tier.cat === 8) || !myTurnFirst(t, F.me)) return null;
      const my = t.acts.find((a) => a.actor === F.me).act; return { ok: my === "check", why: my + " with " + g(t) }; } });
  
  // river bluffs
  const rbluff = (F) => { const T = bets(F, "river"); return T && T.tier.t === 0 ? T : null; };
  const tdraw = (F) => F.st.turn.draw || {};
  for (const [id, lab, test] of [["r-bh-fd", "a missed flush draw", (F) => tdraw(F).fd], ["r-bh-oesd", "a missed open-ender", (F) => tdraw(F).oesd],
    ["r-bh-ahigh", "ace-high (no draw)", (F) => !tdraw(F).fd && !tdraw(F).oesd && F.cards.some((c) => c[0] === "A") && !F.st.river.tier.weakPair],
    ["r-bh-air", "nothing (no pair, no ace, no draw on the turn)", (F) => !tdraw(F).fd && !tdraw(F).oesd && !tdraw(F).gut && !F.cards.some((c) => c[0] === "A") && !F.st.river.tier.weakPair],
    // the board itself shows four to a flush / straight by the river — the bluff reps it (Phil 2026-09-28)
    ["r-bh-4flush", "a bluff on a four-flush river board", (F) => four(F.board).fl], ["r-bh-4str", "a bluff on a four-straight river board", (F) => four(F.board).st]])
    S({ id, grp: "River bluffs (as PFR)", rule: "CAN", def: `River bluffs shown as preflop raiser: holding ${lab}.`,
      ch: (F) => { const T = F.pfr && rbluff(F); return T ? { ok: !!test(F), why: g(T) + (tdraw(F).fd ? " (had FD on turn)" : tdraw(F).oesd ? " (had OESD on turn)" : "") } : null; } });
  /* The line is this player's own action on each street (Phil): B only when they
     made the first bet, so calling someone else's flop bet is C, not B, and a
     raise of someone else's bet is R. X is checks only. Lines no chip names
     (BCB, RBB, CCB…) still count as river bluffs shown, just not on any chip. */
  const own = (S) => S.iBet ? "B" : S.raised ? "R" : S.my.includes("call") ? "C" : S.my.includes("check") ? "X" : "-";
  for (const L of ["BBB", "BXB", "XBB", "XXB", "CXB"])
    S({ id: "r-bluff-lines-" + L.toLowerCase(), grp: "River bluffs (any role)", rule: "CAN", def: `River bluffs shown where their own flop-turn-river line was ${L} (B = they bet first, C = called, X = only checked, R = raised).`,
      ch: (F) => { const T = rbluff(F); if (!T) return null; const l = ["flop", "turn", "river"].map((s) => own(F.st[s])).join(""); return { ok: l === L, why: "line " + l + ": " + g(T) }; } });
  S({ id: "r-bluff-lines-mwp", grp: "River bluffs (any role)", rule: "CAN", def: "River bluffs shown: share that were bet into 3+ players (any line).",
    ch: (F) => { const T = rbluff(F); return T ? { ok: T.alive >= 3, why: T.alive + "-way: " + g(T) } : null; } });
  // a pair too weak to call with, bet or raised as a bluff instead of checked down
  S({ id: "r-hand-to-bluff-pfc", grp: "River bluffs (as PFC)", rule: "CAN", def: "River bets or raises as preflop caller shown: a weak pair (third pair or worse) turned into a bluff.",
    ch: (F) => { const T = F.pfc && rbluff(F); return T ? { ok: !!T.tier.weakPair && T.tier.name !== "no pair", why: g(T) } : null; } });
  S({ id: "r-can-raise-bluff", grp: "Raises", rule: "CAN", def: "River raises shown with a bluff (weaker than second pair).",
    ch: (F) => { const T = F.st.river; return F.cards && T.tier && T.raised ? { ok: T.tier.t === 0, why: g(T) } : null; } });
  S({ id: "r-can-raise-thin", grp: "Raises", rule: "CAN", def: "River raises shown with second or top pair.",
    ch: (F) => { const T = F.st.river; return F.cards && T.tier && T.raised ? { ok: T.tier.t === 1 || T.tier.t === 2, why: g(T) } : null; } });
  for (const [s, L] of [["flop", "F"], ["turn", "T"], ["river", "R"]]) {
    S({ id: "bluff-raise-" + L.toLowerCase(), grp: "Raises", rule: "CAN", def: `${s[0].toUpperCase() + s.slice(1)} raises shown with no pair better than third (draws count as bluffs).`,
      ch: (F) => { const T = F.st[s]; return F.cards && T.tier && T.raised ? { ok: T.tier.t === 0, why: g(T) } : null; } });
    S({ id: "raise-nuts-" + L.toLowerCase(), grp: "Raises", rule: "SHARE", yes: 70, no: 30, def: `${s[0].toUpperCase() + s.slice(1)} raises shown: share that were two pair or better.`,
      ch: (F) => { const T = F.st[s]; return F.cards && T.tier && T.raised ? { ok: T.tier.t === 4, why: g(T) } : null; } });
  }
  // Turn → Raise nuts: Even Boat / Even IP (Phil 2026-09-28): facing a turn bet with the hand, did they raise it.
  S({ id: "raise-nuts-t-even-boat", grp: "Raises", rule: "SHARE", yes: 65, no: 35, def: "Faced a turn bet holding a full house or better (their own, not the board's): share they raised.",
    ch: (F) => { const T = F.st.turn; return F.cards && T.tier && T.faced && T.tier.t === 4 && T.tier.cat >= 6 ? { ok: T.resp === "raise", why: T.resp + " with " + g(T) } : null; } });
  // XNut (Phil 2026-09-28): only as the flop's aggressor, checked to in position on the turn — did they check back the nuts?
  S({ id: "raise-nuts-t-xnut", grp: "Raises", rule: "SHARE", yes: 65, no: 35, def: "Last aggressor on the flop, checked to in position on the turn, holding two pair or better: share they checked back.",
    ch: (F) => { const f = F.st.flop, T = F.st.turn, agg = f.acts.filter((a) => AGG.has(a.act)).pop();
      return F.cards && T.tier && T.tier.t === 4 && trapFlushOk(F, T) && agg && agg.actor === F.me && T.ip && T.acts.length && checkedTo(F, T) && myTurnFirst(T, F.me) ? { ok: T.my[0] === "check", why: T.my.join("/") + " with " + g(T) } : null; } });
  S({ id: "raise-nuts-t-even-ip", grp: "Raises", rule: "SHARE", yes: 65, no: 35, def: "Faced a turn bet in position holding two pair or better: share they raised.",
    ch: (F) => { const T = F.st.turn; return F.cards && T.tier && T.faced && T.ip && T.tier.t === 4 ? { ok: T.resp === "raise", why: T.resp + " IP with " + g(T) } : null; } });
  S({ id: "have-b3b-v-f", grp: "Raises", rule: "CAN", def: "Bet the flop, got raised, re-raised — showed two pair or better.",
    ch: (F) => { const T = F.st.flop, i = T.my.indexOf("bet"); return F.cards && T.tier && i >= 0 && T.my.slice(i + 1).some((x) => ["raise", "jam", "3bet"].includes(x)) ? { ok: T.tier.t === 4, why: g(T) } : null; } });
  S({ id: "have-b3b-b-f", grp: "Raises", rule: "CAN", def: "Bet the flop, got raised, re-raised — showed a bluff or draw.",
    ch: (F) => { const T = F.st.flop, i = T.my.indexOf("bet"); return F.cards && T.tier && i >= 0 && T.my.slice(i + 1).some((x) => ["raise", "jam", "3bet"].includes(x)) ? { ok: T.tier.t === 0, why: g(T) } : null; } });
  S({ id: "f-b3b-nut", grp: "Raises", rule: "SHARE", yes: 70, no: 30, def: "Bet the flop, got raised, re-raised — share shown with two pair or better. Yes ≥70%, No ≤30%.",
    ch: (F) => { const T = F.st.flop, i = T.my.indexOf("bet"); return F.cards && T.tier && i >= 0 && T.my.slice(i + 1).some((x) => ["raise", "jam", "3bet"].includes(x)) ? { ok: T.tier.t === 4, why: g(T) } : null; } });
  
  // check-raises
  const xrc = (F) => { const T = F.st.flop; return F.pfc && F.cards && T.tier && T.xr ? T : null; };
  S({ id: "f-xr-pfc-equity", grp: "Check-raises", rule: "CAN", def: "Flop check-raises shown as preflop caller: with a draw and no pair.", ch: (F) => { const T = xrc(F); return T ? { ok: !!eq(T), why: g(T) } : null; } });
  S({ id: "f-xr-pfc-air", grp: "Check-raises", rule: "CAN", def: "Flop check-raises shown as preflop caller: with nothing (no pair, no draw).", ch: (F) => { const T = xrc(F); return T ? { ok: air(T), why: g(T) } : null; } });
  S({ id: "mwl-xr-strong", grp: "Check-raises", rule: "CAN", def: "Check-raises shown in limped pots with 3+ players: top pair or better.",
    ch: (F) => { if (!F.limped || !F.cards) return null; for (const s of ["flop", "turn", "river"]) { const T = F.st[s]; if (T.xr && T.tier && T.alive >= 3) return { ok: T.tier.t >= 2, why: s + ": " + g(T) }; } return null; } });
  S({ id: "mwl-xr-bluff", grp: "Check-raises", rule: "CAN", def: "Check-raises shown in limped pots with 3+ players: a bluff or draw.",
    ch: (F) => { if (!F.limped || !F.cards) return null; for (const s of ["flop", "turn", "river"]) { const T = F.st[s]; if (T.xr && T.tier && T.alive >= 3) return { ok: T.tier.t === 0, why: s + ": " + g(T) }; } return null; } });
  
  // leads
  const lead = (F, s) => { const T = F.st[s]; return F.cards && T.tier && T.lead ? T : null; };
  S({ id: "ld-draws", grp: "Leads", rule: "CAN", def: "Flop leads into the preflop raiser shown: a draw with no pair.", ch: (F) => { const T = lead(F, "flop"); return T ? { ok: !!eq(T), why: g(T) } : null; } });
  S({ id: "ld-tp", grp: "Leads", rule: "CAN", def: "Flop leads into the preflop raiser shown: top pair or overpair.", ch: (F) => { const T = lead(F, "flop"); return T ? { ok: T.tier.t === 2 || T.tier.t === 3, why: g(T) } : null; } });
  S({ id: "ld-2p", grp: "Leads", rule: "CAN", def: "Flop leads into the preflop raiser shown: two pair or better.", ch: (F) => { const T = lead(F, "flop"); return T ? { ok: T.tier.t === 4, why: g(T) } : null; } });
  for (const [s, L] of [["turn", "t"], ["river", "r"]]) {
    const tag = s === "turn" ? "Turn" : "River";
    S({ id: `have-lead-${L}-draw`, grp: "Leads", rule: "CAN", def: `${tag} leads into the last street's bettor shown: ${s === "turn" ? "a draw with no pair" : "a missed draw"}.`,
      ch: (F) => { const T = lead(F, s); if (!T) return null; const d = s === "turn" ? eq(T) : T.tier.t === 0 && (tdraw(F).fd || tdraw(F).oesd); return { ok: !!d, why: g(T) }; } });
    S({ id: `have-lead-${L}-flush`, grp: "Leads", rule: "CAN", def: `${tag} leads into the last street's bettor shown: a made flush.`,
      ch: (F) => { const T = lead(F, s); return T ? { ok: T.tier.cat === 5 || T.tier.cat === 8, why: g(T) } : null; } });
    S({ id: `have-lead-${L}-strong`, grp: "Leads", rule: "CAN", def: `${tag} leads into the last street's bettor shown: two pair or better.`,
      ch: (F) => { const T = lead(F, s); return T ? { ok: T.tier.t === 4, why: g(T) } : null; } });
  }
  S({ id: "have-lead-t-merge", grp: "Leads", rule: "CAN", def: "Turn leads into the last street's bettor shown: one pair — merged, not two pair+ and not a bluff.",
    ch: (F) => { const T = lead(F, "turn"); return T ? { ok: T.tier.t < 4 && T.tier.name !== "no pair", why: g(T) } : null; } });
  S({ id: "have-lead-r-bluff", grp: "Leads", rule: "CAN", def: "River leads into the last street's bettor shown: a bluff — no pair better than third (missed draws count).",
    ch: (F) => { const T = lead(F, "river"); return T ? { ok: T.tier.t === 0, why: g(T) } : null; } });
  // checked-to bets as the caller
  /* Same spot as Thin XT: any role, an opponent checked the street to them and
     they bet. A bluff is no pair of their own — air or a draw (Phil: Q6 betting
     a JJJ4 turn in a limped pot is a bluff; the old caller-only rule missed it). */
  const checkedTo = (F, T) => { const i = T.acts.findIndex((a) => a.actor === F.me); return i > 0 && T.acts.slice(0, i).some((a) => a.act === "check"); };
  /* Flop → As PFR → Low Board IP (Phil 2026-09-28). Low = the flop's top card is 9 or lower;
     the flop was checked to them in position, nobody bet ahead of them. */
  const lowIP = (F) => { const T = F.st.flop; return F.pfr && T.ip && F.board.length >= 3 && Math.max(...F.board.slice(0, 3).map(rk)) <= 9 && checkedTo(F, T) && myTurnFirst(T, F.me) ? T : null; };
  S({ id: "f-low-board-ip-passive", grp: "Postflop — betting", rule: "F", imp: true, def: "Preflop raiser in position on a 9-high-or-lower flop, checked to: checked back.",
    ch: (F) => { const T = lowIP(F); return T ? { ok: T.my[0] === "check", why: T.my[0] + " on " + F.board.slice(0, 3).join(" ") } : null; } });
  S({ id: "f-low-board-ip-canbluff", grp: "Bets when checked to", rule: "CAN", def: "Preflop raiser in position on a 9-high-or-lower flop, checked to, bet — showed a bluff: no pair of their own (air or a draw).",
    ch: (F) => { const T = lowIP(F); return T && F.cards && T.tier && T.firstBetBy === F.me ? { ok: T.tier.name === "no pair", why: g(T) } : null; } });
  S({ id: "f-low-board-ip-protect", grp: "Bets when checked to", rule: "CAN", def: "Preflop raiser in position on a 9-high-or-lower flop, checked to, bet — showed one pair (betting to protect it).",
    ch: (F) => { const T = lowIP(F); return T && F.cards && T.tier && T.firstBetBy === F.me ? { ok: T.tier.name !== "no pair" && T.tier.t < 4, why: g(T) } : null; } });
  /* Turn → OOP → Probe T: Merge / Polar (Phil 2026-09-28). The HUD's probe (stats.js): the raiser
     checked the flop through, they bet the turn acting before the raiser, no bet ahead of them.
     Merge = shown with one pair; Polar = two pair or better, or no pair of their own. */
  const probeT = (F) => {
    const f = F.st.flop, T = F.st.turn; if (!F.cards || !T.tier || F.pfr || !F.preAgg || f.firstBetBy != null) return null;
    const ri = T.acts.findIndex((a) => a.actor === F.preAgg), mi = T.acts.findIndex((a) => a.actor === F.me);
    return ri >= 0 && mi >= 0 && mi < ri && !T.acts.slice(0, mi).some((a) => AGG.has(a.act)) && AGG.has(T.acts[mi].act) ? T : null;
  };
  const polar = (T) => T.tier.t === 4 || T.tier.name === "no pair";
  S({ id: "t-probe-merge", grp: "Probes", rule: "SHARE", yes: 65, no: 35, def: "Turn probes shown (raiser checked the flop through): share that were one pair — merged.",
    ch: (F) => { const T = probeT(F); return T ? { ok: !polar(T), why: g(T) } : null; } });
  S({ id: "t-probe-polar", grp: "Probes", rule: "SHARE", yes: 65, no: 35, def: "Turn probes shown (raiser checked the flop through): share that were two pair or better, or no pair of their own — polar.",
    ch: (F) => { const T = probeT(F); return T ? { ok: polar(T), why: g(T) } : null; } });
  /* Flop → As PFC → Check Backs (Phil 2026-09-28): as preflop caller the flop was checked to them
     and they checked it back (no one bet the flop) — what they turned up with. */
  const pfcXB = (F) => { const T = F.st.flop; return F.pfc && F.cards && T.tier && T.firstBetBy == null && T.my[0] === "check" && checkedTo(F, T) ? T : null; };
  for (const [id, what, ok] of [
    ["f-xb-pfc-fd", "a flush draw", (T) => !!(T.draw && T.draw.fd)],
    ["f-xb-pfc-sd", "showdown value: second pair or a weaker pair", (T) => T.tier.t === 1 || !!T.tier.weakPair],
    ["f-xb-pfc-topp", "top pair or an overpair", (T) => T.tier.t === 2 || T.tier.t === 3],
    ["f-xb-pfc-2p", "two pair or better", (T) => T.tier.t === 4]])
    S({ id, grp: "Check backs (as PFC)", rule: "CAN", def: `As preflop caller, the flop was checked to them and they checked back — showed ${what}.`,
      ch: (F) => { const T = pfcXB(F); return T ? { ok: ok(T), why: g(T) } : null; } });
  /* Flop → As PFC → Adv. Board (Phil 2026-09-28): a flop that favours the caller — three
     different ranks, 9-high or lower, spanning 4 or less (7-6-5, 8-6-4). BXT = they bet into
     the raiser: acted before him on the flop with no bet ahead, and bet. Flop only. */
  const advBoard = (b) => { const r = b.slice(0, 3).map(rk); return b.length >= 3 && new Set(r).size === 3 && Math.max(...r) <= 9 && Math.max(...r) - Math.min(...r) <= 4; };
  const advSpot = (F) => { const T = F.st.flop; if (!F.pfc || !F.preAgg || !advBoard(F.board)) return null;
    const ri = T.acts.findIndex((a) => a.actor === F.preAgg), mi = T.acts.findIndex((a) => a.actor === F.me);
    return mi >= 0 && (ri < 0 || mi < ri) && !T.acts.slice(0, mi).some((a) => AGG.has(a.act)) ? { T, donk: AGG.has(T.acts[mi].act) } : null; };
  S({ id: "f-adv-board-bxt", grp: "Postflop — betting", rule: "F", imp: true, def: "As preflop caller on a low connected flop (9-high or lower, three ranks within 4), first to act ahead of the raiser: bet into him.",
    ch: (F) => { const x = advSpot(F); return x ? { ok: x.donk, why: x.T.acts.find((a) => a.actor === F.me).act + " on " + F.board.slice(0, 3).join(" ") } : null; } });
  S({ id: "f-adv-board-air", grp: "Postflop — betting", rule: "CAN", def: "As preflop caller, bet into the raiser on a low connected flop — showed air: no pair and no draw.",
    ch: (F) => { const x = advSpot(F); return x && x.donk && F.cards && x.T.tier ? { ok: air(x.T), why: g(x.T) } : null; } });
  for (const [s, L] of [["flop", "f"], ["turn", "t"], ["river", "r"]])
    S({ id: "bluff-xt-" + L, grp: "Bets when checked to", rule: "CAN", def: `An opponent checked the ${s} to them and they bet (any role) — showed a bluff: no pair of their own (air or a draw).`,
      ch: (F) => { const T = F.st[s]; if (!F.cards || !T.tier || T.firstBetBy !== F.me || !checkedTo(F, T)) return null;
        return { ok: T.tier.name === "no pair", why: g(T) }; } });
  // Thin XT F (Phil 2026-09-28): flop only — as preflop caller, checked to on the flop, they bet: thin value?
  for (const [id, pot] of [["f-thin-xt-srp", "SRP"], ["f-thin-xt-mwp", "MW"], ["f-thin-xt-3bp", "3BP+"]])
    S({ id, grp: "Bets when checked to", rule: "CAN", def: `As preflop caller, the flop was checked to them${pot === "MW" ? " three or more ways" : " heads-up in a " + pot} and they bet — showed second or top pair (thin value).`,
      ch: (F) => { const f = F.st.flop; if (!F.pfc || !F.cards || !f.tier || f.firstBetBy !== F.me || !checkedTo(F, f)) return null;
        if (pot === "MW" ? f.alive < 3 : (F.pot !== pot || f.alive !== 2)) return null; return { ok: f.tier.t === 1 || f.tier.t === 2, why: g(f) }; } });
  // Weaker than top pair = second/third/under/bottom pair, still counted on 4-flush/straight boards (demoted top pair/overpair excluded).
  const belowTop = (T) => /^(second pair|third pair|underpair|bottom\/weak pair)/.test(T.tier.name);
  S({ id: "thin-xt-t", grp: "Bets when checked to", rule: "CAN", def: "An opponent checked the turn to them and they bet (any role) — showed a pair weaker than top pair (thin value).",
    ch: (F) => { const T = F.st.turn; if (!F.cards || !T.tier || T.firstBetBy !== F.me) return null;
      const i = T.acts.findIndex((a) => a.actor === F.me); if (!T.acts.slice(0, i).some((a) => a.act === "check")) return null;
      return { ok: belowTop(T), why: g(T) }; } });
  // calls
  const callSt = (F, s) => { const T = F.st[s]; return F.cards && T.tier && T.faced && T.resp === "call" ? T : null; };
  for (const [id, ip, lab] of [["f-float-ip", true, "in position"], ["f-float-oop", false, "out of position"]])
    S({ id, grp: "Calls", rule: "CAN", def: `Called a flop cbet ${lab} as preflop caller — showed nothing (no pair, no FD/OESD).`,
      ch: (F) => { const T = callSt(F, "flop"); if (!T || !F.pfc || T.ip !== ip || T.alive !== 2) return null; return { ok: T.tier.t === 0 && !T.tier.weakPair && !(T.draw.fd || T.draw.oesd), why: g(T) }; } });
  S({ id: "floats-wide", grp: "Calls", rule: "SHARE", yes: 30, no: 10, def: "Flop cbet calls shown as preflop caller (heads-up): share with nothing — no pair, no FD/OESD. Yes ≥30%, No ≤10%.",
    ch: (F) => { const T = callSt(F, "flop"); if (!T || !F.pfc || T.alive !== 2) return null; return { ok: T.tier.t === 0 && !T.tier.weakPair && !(T.draw.fd || T.draw.oesd), why: g(T) }; } });
  S({ id: "t-call-range-2ndp", grp: "Calls", rule: "CAN", def: "Turn calls shown with second pair.", ch: (F) => { const T = callSt(F, "turn"); return T ? { ok: T.tier.t === 1, why: g(T) } : null; } });
  S({ id: "t-call-range-wfd", grp: "Calls", rule: "CAN", def: "Turn calls shown with a non-nut flush draw and no pair.", ch: (F) => { const T = callSt(F, "turn"); return T ? { ok: T.tier.t === 0 && !T.tier.weakPair && !!T.draw.fd && !T.draw.nutFd, why: g(T) } : null; } });
  S({ id: "t-call-range-lt3rdp", grp: "Calls", rule: "CAN", def: "Turn calls shown with worse than third pair and no FD/OESD.", ch: (F) => { const T = callSt(F, "turn"); return T ? { ok: T.tier.t === 0 && !/third/.test(T.tier.name) && !(T.draw.fd || T.draw.oesd), why: g(T) } : null; } });
  S({ id: "r-call-hands-light", grp: "Calls", rule: "CAN", def: "River calls shown with second pair or worse (bluff-catching light).", ch: (F) => { const T = callSt(F, "river"); return T ? { ok: T.tier.t <= 1, why: g(T) } : null; } });
  S({ id: "r-call-hands-tight", grp: "Calls", rule: "SHARE", yes: 70, no: 40, def: "River calls shown: share that were top pair or better.", ch: (F) => { const T = callSt(F, "river"); return T ? { ok: T.tier.t >= 2, why: g(T) } : null; } });
  
  function sized(F) {                                  // his priced postflop bets, with the tier on that street
    const out = [];
    for (const b of betsVsPot(F.h)) {
      if (b.a.actor !== F.me || b.street === "pre" || b.bad) continue;
      const r = b.ratio ?? (b.pot ? (b.raise ? b.over / b.potAfterCall : b.bet / b.pot) : null);
      const T = F.st[b.street]; if (r == null || !T.tier) continue;
      out.push({ s: b.street, r, T, raise: b.raise });
    }
    return out;
  }

  const cache = new Map();          // oppId → { sig, out }
  /* { id: { k, n, pct, rule, def, ev: [{ h, ok, why }] } } for one player,
     recomputed only when that player's hands change. */
  function readEstimates(oppId, hands) {
    const mine = hands.filter((h) => (h.villainIds || []).includes(oppId));
    const sig = mine.length + ":" + mine.reduce((m, h) => Math.max(m, h.updatedAt || h.ts || 0), 0);
    const hit = cache.get(oppId);
    if (hit && hit.sig === sig) return hit.out;
    const Fs = mine.map((h) => facts(h, oppId)).filter(Boolean);
    const out = {};
    for (const sp of SPECS) {
      const ev = [];
      for (const F of Fs) {
        if (sp.imp && !F.imported) continue;
        const r = sp.ch(F);
        if (r) ev.push({ h: F.h, ok: !!r.ok, why: r.why });
      }
      const k = ev.filter((e) => e.ok).length;
      out[sp.id] = { k, n: ev.length, pct: ev.length ? (100 * k) / ev.length : null, rule: sp.rule, def: sp.def, ev };
    }
    cache.set(oppId, { sig, out });
    return out;
  }
  return Object.assign(readEstimates, { SPECS, RULE, facts, tier, pre2 });   // the node report reuses the same engine
})();
if (typeof module !== "undefined") module.exports = { readEstimates };
