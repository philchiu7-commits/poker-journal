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
    seats: 0, vpip: 0, pfr: 0, n3b: 0, opp3b: 0, n4b: 0, opp4b: 0, f3b: 0, oppF3b: 0,
    cbIp: 0, oppCbIp: 0, cbOop: 0, oppCbOop: 0, cbMw: 0, oppCbMw: 0,
    fcbIp: 0, oppFcbIp: 0, fcbOop: 0, oppFcbOop: 0, fcbMw: 0, oppFcbMw: 0, bar: 0, oppBar: 0, ftb: 0, oppFtb: 0,
    frb: 0, oppFrb: 0, fxr: 0, oppFxr: 0, xr: 0, oppXr: 0, rAgg: 0, rCall: 0,
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
    let sawRaise = false, sawThree = false, sawFour = false, opener = null, lastAgg = null;
    let limped = false, limpThenRaise = false, limpFaced = false, limpFold = false;
    /* Preflop counts are per HAND, not per action. A villain who limps and then
       calls a raise took two voluntary actions in one seat — incrementing on
       each pushed VPIP over 100% and made the drill-down disagree with the
       number above it, so the walk sets flags and the counters move once. */
    let vol = false, aggPre = false, opp3 = false, did3 = false, oppF3 = false, didF3 = false;
    let opp4 = false, did4 = false;
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
        /* Everyone who gets a turn against a live 3-bet, not just the man who
           opened it — a cold 4-bet is still a 4-bet, and 20 of the 52 on record
           are cold. Opener-only would leave most of his opponents under the
           sample this app trusts. */
        if (sawThree && !sawFour) { opp4 = true; if (a.act === "4bet") did4 = true; }
        if (opener === me && sawThree) { oppF3 = true; if (a.act === "fold") didF3 = true; }
      }
      if (HUD_AGG.has(a.act)) {
        if (limped && !mine) limpFaced = true;
        lastAgg = a.actor;
        if (a.act === "4bet" || a.act === "5bet") sawThree = sawFour = true;
        else if (a.act === "3bet") sawThree = true;
        else if (!sawRaise) { sawRaise = true; opener = a.actor; }
      }
    }
    if (vol) c.vpip++;
    if (aggPre) c.pfr++;
    if (opp3) { c.opp3b++; if (did3) c.n3b++; }
    if (opp4) { c.opp4b++; if (did4) c.n4b++; }
    if (oppF3) { c.oppF3b++; if (didF3) c.f3b++; }
    mark("vpip", vol, h.id);
    mark("pfr", aggPre, h.id);
    if (opp3) mark("three", did3, h.id);
    if (opp4) mark("four", did4, h.id);
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
      if (HUD_BET.has(a.act)) { c.agg++; hAgg++; if (a.street === "river") c.rAgg++; }
      else if (a.act === "call") { c.calls++; hCall++; if (a.street === "river") c.rCall++; }
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
      const fi = flop.findIndex((a) => a.actor === me);
      const first = fi < 0 ? null : flop[fi];
      const didCb = !!first && first.act === "bet";
      if (didCb) c["cb" + k]++;
      mark("cb" + k, didCb, h.id);
      /* Both halves of "what happens after his first flop decision": raised off
         his cbet, or bet into after he checked. The chance only counts once he
         actually got a turn to answer it, so a raise he never acted on (all-in
         behind, hand over) stays out of the denominator. */
      const after = (idx, act) => {
        const j = flop.findIndex((a, i) => i > idx && a.actor !== me && a.act === act);
        return j < 0 ? null : flop.slice(j + 1).find((a) => a.actor === me) || null;
      };
      if (didCb) {
        const back = after(fi, "raise");
        if (back) { c.oppFxr++; if (back.act === "fold") c.fxr++; mark("fxr", back.act === "fold", h.id); }
      } else if (first && first.act === "check") {
        const back = after(fi, "bet");
        if (back) { c.oppXr++; if (back.act === "raise") c.xr++; mark("xr", back.act === "raise", h.id); }
      }
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
    if (tResp.act === "fold") { c.ftb++; continue; }
    if (tResp.act !== "call") continue;
    // called the turn barrel too — did they fold to the river bet?
    const river = A.filter((a) => a.street === "river");
    const rBet = river.findIndex((a) => a.actor === lastAgg && a.act === "bet");
    if (rBet < 0) continue;
    const rResp = river.slice(rBet + 1).find((a) => a.actor === me);
    if (!rResp) continue;
    c.oppFrb++;
    mark("frb", rResp.act === "fold", h.id);
    if (rResp.act === "fold") c.frb++;
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
    r("four", "4-bet", c.n4b, c.opp4b, "4-bet when facing a 3-bet — cold 4-bets counted too"),
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

/* The stat reads Phil used to fill in by hand, answered off the same walk.
   Each one carries the opportunity count it came off — a stat read that hides
   its n is the same lie a HUD that hides n tells. Null means the hands on
   record never put him in that spot, and the read falls back to a box he can
   type in: most of his opponents are live and have no imported hands at all. */
function hudDerived(c) {
  const p = (n, d) => (d ? { pct: (100 * n) / d, n: d, thin: d < HUD_MIN } : null);
  const cb = c.cbIp + c.cbOop + c.cbMw, oppCb = c.oppCbIp + c.oppCbOop + c.oppCbMw;
  const fcb = c.fcbIp + c.fcbOop + c.fcbMw, oppFcb = c.oppFcbIp + c.oppFcbOop + c.oppFcbMw;
  const rn = c.rAgg + c.rCall;
  return {
    cbet: p(cb, oppCb),
    foldXr: p(c.fxr, c.oppFxr),
    // he was the preflop raiser, heads-up out of position, and checked instead
    checkOop: p(c.oppCbOop - c.cbOop, c.oppCbOop),
    xrPfr: p(c.xr, c.oppXr),
    barrel: p(c.bar, c.oppBar),
    foldCbF: p(fcb, oppFcb),
    foldCbT: p(c.ftb, c.oppFtb),
    foldCbR: p(c.frb, c.oppFrb),
    // a factor, not a percentage; with no river calls on record the ratio has
    // no denominator, and an infinite AF is not a reading
    riverAf: c.rCall ? { v: c.rAgg / c.rCall, n: rn, thin: rn < HUD_MIN } : null,
  };
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
/* "60%" → 0.6. Phil's shorthand often records a bet as the share of the pot it
   was, which is already the number this grid wants: it needs no pot
   reconstruction at all, so it survives a hand with no blinds and no chip
   amounts on record. Past the impossible-bet line below it is a typo, not a
   size. */
function sizePct(s) {
  if (s === null || s === undefined) return null;
  const m = /^([\d.]+)\s*%$/.exec(String(s).trim());
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) && v > 0 && v <= SZ_MAX_POT * 100 ? v / 100 : null;
}
const SZ_MULT = /^([\d.]+)\s*[xX]$/;
/* "4x" — a size quoted as a multiple of the bet in front of him. One rule covers
   both places Phil writes it: an open is 3x the blind, a 3bet is 4x the open,
   a turn raise is 2x the lead. The other reading (multiples of the big blind
   throughout) rules itself out in both hands that use the notation — 4x a $4
   blind is less than the $60 raise it came over, which is not a raise. Nothing
   to multiply means no answer, so a size like this opening a street is refused
   rather than assumed. */
function sizeMult(s, level) {
  if (!level || s === null || s === undefined) return null;
  const m = SZ_MULT.exec(String(s).trim());
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) && v > 1 ? v * level : null;
}
const SZ_AGG = new Set(["bet", "raise", "3bet", "4bet", "5bet", "jam"]);
/* Which tokens are a raise when the money can't be walked — a size written down
   as "60%" carries no pot to compare against, so the token is all there is. A
   jam is not on the list: whether it was a bet or a raise depends on what it
   faced, which is exactly what this path doesn't know. */
const SZ_RAISE_TOK = new Set(["raise", "3bet", "4bet", "5bet"]);
/* Past this multiple of the pot, a non-jam bet is a data error rather than a
   read. Real overbets run to about 2x; nothing Phil has logged sits between
   3x and the 8x where the corrupted ones start. */
const SZ_MAX_POT = 3;
/* Preflop the same check has to be far looser, and it still has to exist. An
   open into a three-chip pot is 17x it and a jam into a limped pot is 93x, so
   3x would throw away half the hands — but one hand in the export has a 3bet
   of 51,197.86k, a misread stack rather than a bet, which inflated the pot on
   every street after it and made a real 13.57k turn bet read as 0%. Nothing
   Phil has logged sits between 17x and that, and jams are exempt here too. */
const SZ_MAX_POT_PRE = 50;
const SZ_STREETS = ["pre", "flop", "turn", "river"];
const SZ_CARD = /^[2-9TJQKA][cdhs]$/;
const SZ_BOARD_N = { flop: 3, turn: 4, river: 5 };
/* Walk the money. Returns one entry per postflop bet/raise whose amount is
   known, with the pot as it stood *before* that bet went in — the denominator
   everyone actually quotes a size against. Bails out of a hand the moment an
   amount is missing rather than guessing, because one guessed number poisons
   every later street in that hand. */
function potWalk(h) {
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
  /* Every seat dealt in posts the ante. The v147 note here claimed the
     opposite and it was wrong: measured against Phil's own B33/B50/B66/B75/
     B100 buttons, one ante for the table puts 10% of his bets on a rung and
     one ante per seat puts 96% — because the buttons size off the real pot,
     so a pot rebuilt ~6% light shows a B50 as a 53%. Same answer on his
     hand-typed hands (9% → 93%), so it is not a DX quirk. */
  const seats = new Set((h.villains || []).map((v) => v.pos).filter(Boolean));
  if (h.heroPos) seats.add(h.heroPos);
  let pot = ANTE * Math.max(1, seats.size);
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
        const v = sizeAmount(a.size) ?? sizeMult(a.size, level);
        if (v === null) return out;                   // unknown amount — stop here
        const had = inv[a.actor] || 0;
        const p = base + street(), bet = v - had;
        const toCall = Math.max(0, level - had);      // >0 means he is raising, not betting
        /* An amount that can't be true is worse than a missing one, so it gets
           the same treatment. The DX screen-reader loses the decimal point now
           and then — 19.72K comes back as 1972K — and the tell is a bet many
           times the pot it was made into. A shove is exempt: a jam really can
           dwarf the pot when the stacks are deep. Six hands in the export trip
           this, and each one used to poison every street that followed it. */
        if (a.act !== "jam" && p > 0 && bet > p * (st === "pre" ? SZ_MAX_POT_PRE : SZ_MAX_POT)) {
          out.push({ a, street: st, pot: p, bet, bad: true });
          return out;
        }
        /* A raise is what he puts in on top of the call, over the pot with
           that call in it — which is what the buttons themselves compute:
           89% of his raises land on a rung this way against 27% for the size
           he raises *to*. Both agree at B100, the pot-sized raise, which is
           why the two readings were so hard to tell apart by eye. */
        /* Preflop entries come out too now: a 3-bet is priced exactly the way
           a postflop raise is, and only `sizingAuto` reads this. */
        out.push({ a, street: st, pot: p, bet, raise: toCall > 0,
          over: v - level, potAfterCall: p + toCall });
        inv[a.actor] = v;
        level = Math.max(level, v);
      } else if (a.act === "call" || a.act === "limp") inv[a.actor] = level;
    }
    pot = base + street();
  }
  return out;
}
/* Every postflop bet of his this hand can price, from both sources: the chip
   walk above, plus the ones already written down as a share of the pot. The
   second pass runs whatever the first one did — a hand with no blinds, or one
   the walk bailed out of, can still have a "bets 60%" on a later street, and
   that number was never in doubt. */
function betsVsPot(h) {
  const out = potWalk(h);
  for (const a of h.actions || []) {
    if (!a || !SZ_BOARD_N[a.street] || !SZ_AGG.has(a.act)) continue;
    const r = sizePct(a.size);
    if (r !== null) out.push({ a, street: a.street, pot: null, bet: null, ratio: r, raise: SZ_RAISE_TOK.has(a.act) });
  }
  return out;
}
/* Was the hand value or a bluff on the street he bet it? Strength only — a
   read on his cards, never on his thinking. Two pair or better is value, and so
   is top or second pair. Everything under that — third pair, bottom pair, a
   naked draw, air — is a bluff, so nothing goes uncounted any more.
   Second pair comes back as its own grade, "V2": it is value everywhere except
   the turn, where what he did on the flop decides it. */
function madeClass(hole, board) {
  if (!hole || hole.length !== 2 || board.length < 3) return null;
  /* An unreadable card has to stop the grade, not slide through it. Phil's
     shorthand writes a pocket pair as "Qs" — queens — and an early import read
     that as the queen of spades plus a card called "Sh", which the evaluator
     was happy to score as a pair. A hand nobody can read is not a bluff. */
  if (!hole.concat(board).every((c) => SZ_CARD.test(String(c)))) return null;
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
  return above === 0 ? "V" : above === 1 ? "V2" : "B";  // top pair, second pair, or under it
}
/* Phil's ladder is B33/B50/B66/B75/B100/B150. Bucket to the nearest rung so a
   62% bet reads as the 66% he was going for, not as its own category. Cuts are
   the midpoints between neighbouring rungs. */
const SZ_CUTS = [[0.42, "33"], [0.58, "50"], [0.71, "66"], [0.88, "75"], [1.25, "100"], [Infinity, "150"]];
/* Over the top rung there is no honest fraction left — a bet that big is a
   shove in everything but name — so it lands in Jam rather than piling onto
   B150. An actual jam takes that column whatever it cost: a min-jam is a B33
   by the arithmetic, but that he had nothing behind is the fact worth
   counting, and it changes what every later street can hold. */
const SZ_JAM_OVER = 1.5;
const sizeStepFor = (r, act) =>
  act === "jam" || r > SZ_JAM_OVER ? "jam"
    : (SZ_CUTS.find((c) => r < c[0]) || SZ_CUTS[SZ_CUTS.length - 1])[1];
/* → { rows: { "flop-v": { "50": {n, ids:[]} … } }, split, n, skipped:{…}, why:{…} }
   Walks *his* postflop bets rather than the entries the money-walk managed to
   produce, so every bet that doesn't reach the grid can say which thing was
   missing and name the hand. "Some of my hands aren't in here" should be a
   question the panel answers, not one Phil has to bring to me. */
function sizingAuto(oppId, hands) {
  const K = ["noCards", "badCards", "noAmount", "noPot", "badAmount", "badRaise", "turnFlopCheck"];
  const rows = {}, split = {}, skipped = {}, why = {};
  const bump = (cell, step, id, cards) => {
    const c = (cell[step] = cell[step] || { n: 0, ids: [], cards: [] });
    c.n++;
    if (!c.ids.includes(id)) c.ids.push(id);
    if (cards) c.cards.push(cards);
  };
  for (const k of K) { skipped[k] = 0; why[k] = []; }
  let n = 0, n3 = 0;
  for (const h of hands) {
    const V = h.villains || [];
    const board = (h.board || []).filter(Boolean);
    /* Keyed by the action object itself, so an entry is matched to the bet it
       came from and not to another bet of the same size on the same street. */
    const priced = new Map(betsVsPot(h).map((e) => [e.a, e]));
    const miss = (k) => { skipped[k]++; if (!why[k].includes(h.id)) why[k].push(h.id); };
    /* His preflop 3-bet, if he made one. Position is whether he ends up acting
       after the opener postflop, off POSITIONS_POST — see the note there for
       why the seat map beats the flop action order in this one spot. Cards ride
       along for the chart behind the cell but aren't required to count it: the
       row answers which size he picks, not what he held. */
    const pre = (h.actions || []).filter((a) => a.street === "pre");
    const ti = pre.findIndex((a) => a.act === "3bet");
    const t3 = ti >= 0 ? pre[ti] : null;
    const tm = t3 && /^v(\d+)$/.exec(String(t3.actor || ""));
    const tv = tm && V[Number(tm[1])];
    if (tv && tv.opponentId === oppId) {
      const op = pre.slice(0, ti).reverse().find((x) => x.act === "raise");
      // "hero" is the actor token everywhere else in the app; "h" matched nothing,
      // so every 3-bet made over *my* open was dropped from this grid (v188)
      const seat = (id) => (id === "hero" ? h.heroPos
        : ((V[Number((/^v(\d+)$/.exec(String(id)) || [])[1])] || {}).pos));
      const mine = seat(t3.actor), theirs = op && seat(op.actor);
      const e = priced.get(t3);
      if (e && !e.bad && e.over > 0 && e.potAfterCall > 0 && mine && theirs) {
        const ip = POSITIONS_POST.indexOf(mine) > POSITIONS_POST.indexOf(theirs);
        const rid = ip ? "3bet-ip" : "3bet-oop";
        let step = sizeStepFor(e.over / e.potAfterCall, t3.act);
        if (step === "jam") step = "150";       // no preflop Jam column — see vocab.js
        const hole = (tv.cards || []).filter(Boolean);
        bump(rows[rid] = rows[rid] || {}, step, h.id, hole.length === 2 ? hole : null);
        n3++;
      }
    }
    for (const a of h.actions || []) {
      const need = SZ_BOARD_N[a && a.street];
      if (!need || !SZ_AGG.has(a.act)) continue;                // preflop, or not a bet
      const m = /^v(\d+)$/.exec(String(a.actor || ""));
      const v = m && V[Number(m[1])];
      if (!v || v.opponentId !== oppId) continue;               // not him
      const hole = (v.cards || []).filter(Boolean);
      const vis = board.slice(0, need);
      if (hole.length !== 2 || vis.length < need) { miss("noCards"); continue; }
      let k = madeClass(hole, vis);
      if (!k) { miss("badCards"); continue; }
      const e = priced.get(a);
      if (!e || e.bad) {
        /* Three different silences, and they want three different answers:
           nothing written down, something written down that can't be true, and
           an amount that is fine but sits in a hand whose pot can't be rebuilt
           (no blinds on record, or an earlier amount missing). */
        if (e && e.bad) miss("badAmount");
        else if (sizeAmount(a.size) === null && sizePct(a.size) === null
          && !SZ_MULT.test(String(a.size || ""))) miss("noAmount");
        else miss("noPot");
        continue;
      }
      /* A raise on record for no more than the bet it faced is a mislabelled
         call, not a sizing: it raised nothing and there is no honest rung for
         it. Say so rather than bucket it at the bottom. */
      const isR = !!e.raise;
      const ratio = e.ratio !== null && e.ratio !== undefined
        ? e.ratio
        : isR
          ? (e.potAfterCall > 0 && e.over > 0 ? e.over / e.potAfterCall : null)
          : (e.pot > 0 && e.bet > 0 ? e.bet / e.pot : null);
      // A jam needs no rung, so it is counted even when the fraction can't be.
      if (ratio === null && a.act !== "jam") { miss(isR && e.pot > 0 ? "badRaise" : "noPot"); continue; }
      /* Second pair on the turn is a bluff — barrelled, raised, or led after
         calling the flop, they all say the same thing about the hand. The one
         exception is a flop nobody bet: there is nothing in front of him to
         read the turn bet against, so it is neither value nor bluff and stays
         out of the grid rather than sitting in a column that misreads him
         (Phil, v179). */
      if (k === "V2" && a.street === "turn") {
        const flopBet = (h.actions || []).some((x) => x.street === "flop" && SZ_AGG.has(x.act));
        if (!flopBet) { miss("turnFlopCheck"); continue; }
        k = "B";
      }
      if (k === "V2") k = "V";
      /* Raises land in one row per kind, the streets together. They are rare
         enough that three rows of them read as noise, so the street is kept
         alongside in `split` and shown on demand instead. */
      const rid = isR ? "raise-" + k.toLowerCase() : a.street + "-" + k.toLowerCase();
      const step = sizeStepFor(ratio, a.act);
      bump(rows[rid] = rows[rid] || {}, step, h.id);
      if (isR) {
        const sp = (split[rid] = split[rid] || {});
        bump(sp[a.street] = sp[a.street] || {}, step, h.id);
      }
      n++;
    }
  }
  return { rows, split, n, n3, skipped, why };
}
