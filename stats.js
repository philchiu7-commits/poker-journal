/* HUD stats — aggregated from the imported action stream.
   Only hands with imported:{} are counted: the bookmarklet records every seat
   and every preflop action (100% coverage measured), so "hands dealt" is a real
   denominator. Hand-typed hands are the ones Phil thought worth writing down,
   which is exactly the selection bias that would make VPIP meaningless, and only
   65% of their seats carry a preflop action. Every stat ships with its sample
   size — a HUD that hides n is a HUD that lies. */
const HUD_AGG = new Set(["raise", "3bet", "4bet", "5bet", "jam", "limp-raise", "open"]);
const HUD_VOL = new Set([...HUD_AGG, "call", "limp", "bet"]);
const HUD_BET = new Set(["bet", "raise", "3bet", "4bet", "jam"]);

/* Below this many opportunities a percentage is noise, shown greyed. */
const HUD_MIN = 15;

function hudCount(oppId, hands) {
  const c = {
    seats: 0, vpip: 0, pfr: 0, n3b: 0, opp3b: 0, f3b: 0, oppF3b: 0,
    cbIp: 0, oppCbIp: 0, cbOop: 0, oppCbOop: 0, cbMw: 0, oppCbMw: 0,
    fcbIp: 0, oppFcbIp: 0, fcbOop: 0, oppFcbOop: 0, fcbMw: 0, oppFcbMw: 0, bar: 0, oppBar: 0, ftb: 0, oppFtb: 0,
    agg: 0, calls: 0, limps: 0, lrr: 0, limpFaced: 0, limpFold: 0, byPos: {}, ev: {},
  };
  const pos = (p) => (c.byPos[p] = c.byPos[p] || { seats: 0, limp: 0, lrr: 0, faced: 0, lfold: 0 });
  /* Every stat also keeps the hands it was counted off — one entry per hand it
     had a chance in, flagged with whether that chance was taken — so tapping a
     number can show you the hands behind it instead of asking you to trust it.
     Recorded beside the counter, never derived after the fact: the walk is the
     only place that knows why a hand counted. */
  const mark = (key, ok, id) => { (c.ev[key] = c.ev[key] || []).push({ id, ok: !!ok }); };

  for (const h of hands) {
    if (!h.imported) continue;
    const V = h.villains || [];
    const seat = {};                       // "v3" -> villain index, for our player only
    V.forEach((v, i) => { if (v.opponentId === oppId) seat["v" + i] = v; });
    if (!Object.keys(seat).length) continue;
    const A = h.actions || [];
    const pre = A.filter((a) => a.street === "pre");
    const me = Object.keys(seat)[0];
    const myPos = (seat[me].pos || "?");
    c.seats++; pos(myPos).seats++;

    // ---- preflop walk. Flags flip *after* an action so a player never counts
    // as having faced their own raise.
    let sawRaise = false, sawThree = false, opener = null, lastAgg = null;
    let limped = false, limpThenRaise = false, limpFaced = false, limpFold = false;
    /* Preflop counts are per HAND, not per action. A villain who limps and then
       calls a raise took two voluntary actions in one seat — incrementing on
       each pushed VPIP over 100% and made the drill-down disagree with the
       number above it, so the walk sets flags and the counters move once. */
    let vol = false, aggPre = false, opp3 = false, did3 = false, oppF3 = false, didF3 = false;
    for (const a of pre) {
      const mine = a.actor === me;
      if (mine) {
        if (HUD_VOL.has(a.act)) vol = true;
        if (HUD_AGG.has(a.act)) aggPre = true;
        if (a.act === "limp") limped = true;
        else if (limped && HUD_AGG.has(a.act)) limpThenRaise = true;
        /* Folding a limp only counts once someone actually raised it — a limp
           that walks to the flop was never a chance to fold, and folding those
           into the denominator would read as a player who defends far more
           than he does. */
        else if (limpFaced && a.act === "fold") limpFold = true;
        if (sawRaise && !sawThree) { opp3 = true; if (a.act === "3bet") did3 = true; }
        if (opener === me && sawThree) { oppF3 = true; if (a.act === "fold") didF3 = true; }
      }
      if (HUD_AGG.has(a.act)) {
        if (limped && !mine) limpFaced = true;
        lastAgg = a.actor;
        if (a.act === "3bet" || a.act === "4bet" || a.act === "5bet") sawThree = true;
        else if (!sawRaise) { sawRaise = true; opener = a.actor; }
      }
    }
    if (vol) c.vpip++;
    if (aggPre) c.pfr++;
    if (opp3) { c.opp3b++; if (did3) c.n3b++; }
    if (oppF3) { c.oppF3b++; if (didF3) c.f3b++; }
    mark("vpip", vol, h.id);
    mark("pfr", aggPre, h.id);
    if (opp3) mark("three", did3, h.id);
    if (oppF3) mark("f3b", didF3, h.id);
    mark("limp|" + myPos, limped, h.id);
    if (limped) mark("lrr|" + myPos, limpThenRaise, h.id);
    if (limpFaced) mark("lfold|" + myPos, limpFold, h.id);
    if (limped) {
      c.limps++; pos(myPos).limp++;
      if (limpThenRaise) { c.lrr++; pos(myPos).lrr++; }
      if (limpFaced) { c.limpFaced++; pos(myPos).faced++; if (limpFold) { c.limpFold++; pos(myPos).lfold++; } }
    }

    // ---- postflop
    const flop = A.filter((a) => a.street === "flop");
    const turn = A.filter((a) => a.street === "turn");
    if (!flop.length) continue;
    const sawFlop = flop.some((a) => a.actor === me);
    if (!sawFlop) continue;

    let hAgg = 0, hCall = 0;
    for (const a of A) {
      if (a.actor !== me || a.street === "pre") continue;
      if (HUD_BET.has(a.act)) { c.agg++; hAgg++; }
      else if (a.act === "call") { c.calls++; hCall++; }
    }
    if (hAgg || hCall) mark("af", hAgg > hCall, h.id);

    // Betting and folding into a cbet are three separate decisions each, so
    // both families are bucketed the same way. Out of position = first to act
    // once the cards are out, which the flop order already tells us — don't map
    // seats for it, the straddle acts third postflop and a seat map gets that
    // wrong.
    const order = [...new Set(flop.map((a) => a.actor))];
    const k = order.length > 2 ? "Mw" : order[0] === me ? "Oop" : "Ip";

    // cbet + second barrel, when our player is the preflop aggressor
    if (lastAgg === me) {
      c["oppCb" + k]++;
      const first = flop.find((a) => a.actor === me);
      const didCb = !!first && first.act === "bet";
      if (didCb) c["cb" + k]++;
      mark("cb" + k, didCb, h.id);
      if (didCb && turn.length) {
        const t = turn.find((a) => a.actor === me);
        if (t) { c.oppBar++; if (t.act === "bet") c.bar++; mark("bar", t.act === "bet", h.id); }
      }
      continue;                             // can't fold to your own cbet
    }

    // facing someone else's cbet
    const cbIdx = flop.findIndex((a) => a.actor === lastAgg && a.act === "bet");
    if (cbIdx < 0) continue;
    const resp = flop.slice(cbIdx + 1).find((a) => a.actor === me);
    if (!resp) continue;
    c["oppFcb" + k]++;
    mark("fcb" + k, resp.act === "fold", h.id);
    if (resp.act === "fold") { c["fcb" + k]++; continue; }
    if (resp.act !== "call") continue;
    // called the flop cbet — did they fold to the turn barrel?
    const tBet = turn.findIndex((a) => a.actor === lastAgg && a.act === "bet");
    if (tBet < 0) continue;
    const tResp = turn.slice(tBet + 1).find((a) => a.actor === me);
    if (!tResp) continue;
    c.oppFtb++;
    mark("ftb", tResp.act === "fold", h.id);
    if (tResp.act === "fold") c.ftb++;
  }
  return c;
}

/* One row per stat: value as a percentage of its own opportunity count. */
function hudStats(c) {
  const r = (key, label, n, d, tip) => ({ key, label, n, d, tip, pct: d ? (100 * n) / d : null, thin: d < HUD_MIN });
  return [
    r("vpip", "VPIP", c.vpip, c.seats, "Voluntarily put money in preflop — limps included"),
    r("pfr", "PFR", c.pfr, c.seats, "Raised preflop"),
    r("three", "3-bet", c.n3b, c.opp3b, "3-bet when facing an unraised open"),
    r("f3b", "Fold v 3B", c.f3b, c.oppF3b, "Opened, then folded to a 3-bet"),
    r("cbIp", "Cbet HU IP", c.cbIp, c.oppCbIp, "Bet the flop as preflop aggressor, heads-up in position"),
    r("cbOop", "Cbet HU OOP", c.cbOop, c.oppCbOop, "Bet the flop as preflop aggressor, heads-up out of position"),
    r("cbMw", "Cbet MWP", c.cbMw, c.oppCbMw, "Bet the flop as preflop aggressor, three or more players"),
    r("fcbIp", "Fold CB HU IP", c.fcbIp, c.oppFcbIp, "Folded facing a flop cbet, heads-up in position"),
    r("fcbOop", "Fold CB HU OOP", c.fcbOop, c.oppFcbOop, "Folded facing a flop cbet, heads-up out of position"),
    r("fcbMw", "Fold CB MWP", c.fcbMw, c.oppFcbMw, "Folded facing a flop cbet, three or more players"),
    r("bar", "Barrel T", c.bar, c.oppBar, "Bet the turn after cbetting the flop"),
    r("ftb", "Fold v T", c.ftb, c.oppFtb, "Called the flop cbet, then folded to the turn bet"),
  ];
}

/* Aggression factor is a ratio, not a percentage — postflop bets+raises per call. */
function hudAF(c) {
  if (!c.calls) return c.agg ? { v: null, inf: true, n: c.agg } : null;
  return { v: c.agg / c.calls, inf: false, n: c.agg + c.calls };
}

/* Row-level numbers get asked for once per opponent per render — 86 rows over
   300 hands is enough walking to feel on a phone. Memoise per opponent and
   throw the memo away whenever a hand is added, edited or deleted. */
let _hudStamp = null, _hudMemo = new Map(), _hudPool = [];
function hudFor(oppId, hands) {
  let s = hands.length;
  for (const h of hands) s += (h.updatedAt || h.ts || 0);
  if (s !== _hudStamp) { _hudStamp = s; _hudMemo.clear(); _hudPool = hands.filter((h) => h.imported); }
  if (!_hudMemo.has(oppId)) {
    _hudMemo.set(oppId, hudCount(oppId, _hudPool.filter((h) => (h.villainIds || []).includes(oppId))));
  }
  return _hudMemo.get(oppId);
}

/* The one-line form for list rows: the standard VPIP/PFR/3-bet triplet that
   every tracker prints, plus the hand count it came off. Null when there are
   no imported hands, so live-only profiles stay exactly as they were. */
function hudMini(c) {
  if (!c || !c.seats) return null;
  const p = (n, d) => (d ? Math.round((100 * n) / d) : null);
  return {
    seats: c.seats, opp3b: c.opp3b, thin: c.seats < HUD_MIN,
    vpip: p(c.vpip, c.seats), pfr: p(c.pfr, c.seats), three: p(c.n3b, c.opp3b),
  };
}

/* ================= Sizing, read off the hand histories =================
   Phil already tallies "which size did he pick, by street, value or bluff" by
   hand. The imported hands can answer the same question on their own: 439 of
   his 456 logged postflop bets carry an amount, and most of the villains whose
   bets matter have their cards recorded. So reconstruct the pot, turn the
   amount into a fraction of it, and let the evaluator say whether the hand was
   value or a bluff.

   Two things this is NOT, and the UI must say so:
   · It only sees hands where the villain's cards are known, and cards are
     mostly known because the hand got shown down. Bluffs that took it down
     without a showdown are invisible, so the BLUFF rows undercount badly.
     Phil's manual taps are the corrective, not a duplicate — he saw the hands
     this can't.
   · "Value or bluff" here is the hand's actual strength on the street he bet,
     not his intent. The line is Phil's: two pair or better, or top or second
     pair, is value — everything below that is a bluff, draws included. A flush
     draw betting with nothing made is betting to fold you out, so it belongs in
     the bluff column rather than in no column at all (Phil, v146). */

/* "$6,000" · "6.8k" · "50%" · "Jam" → a number, or null when it isn't one. */
function sizeAmount(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().replace(/[$,]/g, "");
  const m = /^([\d.]+)\s*([kK]?)$/.exec(t);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) ? (m[2] ? v * 1000 : v) : null;
}
const SZ_AGG = new Set(["bet", "raise", "3bet", "4bet", "5bet", "jam"]);
/* Past this multiple of the pot, a non-jam bet is a data error rather than a
   read. Real overbets run to about 2x; nothing Phil has logged sits between
   3x and the 8x where the corrupted ones start. */
const SZ_MAX_POT = 3;
const SZ_STREETS = ["pre", "flop", "turn", "river"];
const SZ_BOARD_N = { flop: 3, turn: 4, river: 5 };
/* Walk the money. Returns one entry per postflop bet/raise whose amount is
   known, with the pot as it stood *before* that bet went in — the denominator
   everyone actually quotes a size against. Bails out of a hand the moment an
   amount is missing rather than guessing, because one guessed number poisons
   every later street in that hand. */
function betsVsPot(h) {
  const b = h.blinds || {};
  if (b.bb === null || b.bb === undefined) return [];
  /* Blinds and bet sizes have to be in the same unit before any of this means
     anything, and Phil's two sources disagree: the DX imports write blinds in
     thousands (0.2 for a 200 big blind) while every action size is in chips.
     A chip denomination is a whole number, so a fractional big blind is the
     tell. 148 of 347 hands are in that shape, and every one was reading its
     pot ~1000x too small — which is how a 59%-pot turn bet came out B100
     (Phil, v147). */
  const u = b.bb > 0 && b.bb < 1 ? 1000 : 1;
  const SB = (b.sb || 0) * u, BB = b.bb * u, STD = (b.std || 0) * u, ANTE = (b.ante || 0) * u;
  /* Post the blinds to the seats that actually posted them. Keying them to a
     placeholder instead would double-count the moment a blind raises — his
     post is part of what he has in, not money sitting beside it. */
  const actorAt = {};
  (h.villains || []).forEach((v, i) => { if (v.pos) actorAt[v.pos] = "v" + i; });
  if (h.heroPos) actorAt[h.heroPos] = actorAt[h.heroPos] || "hero";
  const post = {};
  const put = (posName, amt) => {
    if (!amt) return 0;
    post[actorAt[posName] || "_" + posName] = amt;
    return amt;
  };
  put("SB", SB);
  put("BB", BB);
  const straddle = actorAt.STD && STD ? put("STD", STD) : 0;
  /* One ante for the table, not one each — these are big-blind-ante games.
     Dropping it shrank every preflop pot and pushed the sizes that followed a
     bucket too high; counting one per seat instead overshoots the other way
     and reads Phil's known 66% turn bet as a half-pot. */
  let pot = ANTE;
  const out = [];
  for (const st of SZ_STREETS) {
    const A = (h.actions || []).filter((a) => a.street === st);
    if (!A.length) continue;
    let level = st === "pre" ? (straddle || BB) : 0;
    const inv = st === "pre" ? { ...post } : {};      // what each actor has in *this* street
    const base = pot;
    const street = () => Object.values(inv).reduce((s, v) => s + v, 0);
    for (const a of A) {
      if (SZ_AGG.has(a.act)) {
        const v = sizeAmount(a.size);
        if (v === null) return out;                   // unknown amount — stop here
        if (st !== "pre") {
          const p = base + street(), bet = v - (inv[a.actor] || 0);
          /* An amount that can't be true is worse than a missing one, so it gets
             the same treatment. The DX screen-reader loses the decimal point now
             and then — 19.72K comes back as 1972K — and the tell is a bet many
             times the pot it was made into. A shove is exempt: a jam really can
             dwarf the pot when the stacks are deep. Six hands in the export trip
             this, and each one used to poison every street that followed it. */
          if (a.act !== "jam" && p > 0 && bet > p * SZ_MAX_POT) return out;
          out.push({ a, street: st, pot: p, bet });
        }
        inv[a.actor] = v;
        level = Math.max(level, v);
      } else if (a.act === "call" || a.act === "limp") inv[a.actor] = level;
    }
    pot = base + street();
  }
  return out;
}
/* Was the hand value or a bluff on the street he bet it? Strength only — a
   read on his cards, never on his thinking. Two pair or better is value, and so
   is top or second pair. Everything under that — third pair, bottom pair, a
   naked draw, air — is a bluff, so nothing goes uncounted any more. */
function madeClass(hole, board) {
  if (!hole || hole.length !== 2 || board.length < 3) return null;
  const all = hole.concat(board);
  if (best7(all)[0] >= 3) return "V";                   // trips or better
  const cnt = {};
  for (const c of all) cnt[RVAL[c[0]]] = (cnt[RVAL[c[0]]] || 0) + 1;
  /* Only pairs he made with his own cards count. The board's pair is everyone's
     and says nothing about what he holds, so a hand that is "two pair" solely
     because the board paired is graded on his own card. */
  const mine = hole.map((c) => RVAL[c[0]]).filter((v) => cnt[v] >= 2);
  if (!mine.length) return "B";                         // no pair of his own
  if (new Set(mine).size > 1) return "V";               // two pair using both cards
  const best = mine[0];
  const above = new Set(board.map((c) => RVAL[c[0]]).filter((v) => v > best)).size;
  return above <= 1 ? "V" : "B";                        // top or second pair is value
}
/* Phil's ladder is B33/B50/B66/B100/B150. Bucket to the nearest rung so a 62%
   bet reads as the 66% he was going for, not as its own category. */
const SZ_CUTS = [[0.42, "33"], [0.58, "50"], [0.83, "66"], [1.25, "100"], [Infinity, "150"]];
const sizeStepFor = (r) => (SZ_CUTS.find((c) => r < c[0]) || SZ_CUTS[4])[1];
/* → { rows: { "flop-v": { "50": {n, ids:[]} … } }, n, skipped:{…} } */
function sizingAuto(oppId, hands) {
  const rows = {}, skipped = { noCards: 0, unclear: 0, noAmount: 0 };
  let n = 0;
  for (const h of hands) {
    const V = h.villains || [];
    const board = (h.board || []).filter(Boolean);
    const got = betsVsPot(h);
    const agg = (h.actions || []).filter((a) => a.street !== "pre" && SZ_AGG.has(a.act));
    skipped.noAmount += Math.max(0, agg.length - got.length);
    for (const e of got) {
      const m = /^v(\d+)$/.exec(String(e.a.actor || ""));
      if (!m || e.pot <= 0 || e.bet <= 0) continue;
      const v = V[Number(m[1])];
      if (!v || v.opponentId !== oppId) continue;
      const hole = (v.cards || []).filter(Boolean);
      if (hole.length !== 2) { skipped.noCards++; continue; }
      const vis = board.slice(0, SZ_BOARD_N[e.street]);
      if (vis.length < SZ_BOARD_N[e.street]) { skipped.noCards++; continue; }
      const k = madeClass(hole, vis);
      if (!k) { skipped.unclear++; continue; }
      const rid = e.street + "-" + k.toLowerCase();
      const cell = (rows[rid] = rows[rid] || {});
      const step = sizeStepFor(e.bet / e.pot);
      (cell[step] = cell[step] || { n: 0, ids: [] });
      cell[step].n++;
      cell[step].ids.push(h.id);
      n++;
    }
  }
  return { rows, n, skipped };
}
