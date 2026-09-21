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
