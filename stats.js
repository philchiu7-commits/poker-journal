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
    cb: 0, oppCb: 0, fcb: 0, oppFcb: 0, bar: 0, oppBar: 0, ftb: 0, oppFtb: 0,
    agg: 0, calls: 0, limps: 0, lrr: 0, byPos: {},
  };
  const pos = (p) => (c.byPos[p] = c.byPos[p] || { seats: 0, limp: 0, lrr: 0 });

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
    let limped = false, limpThenRaise = false;
    for (const a of pre) {
      const mine = a.actor === me;
      if (mine) {
        if (HUD_VOL.has(a.act)) c.vpip++;
        if (HUD_AGG.has(a.act)) c.pfr++;
        if (a.act === "limp") limped = true;
        else if (limped && HUD_AGG.has(a.act)) limpThenRaise = true;
        if (sawRaise && !sawThree) { c.opp3b++; if (a.act === "3bet") c.n3b++; }
        if (opener === me && sawThree) { c.oppF3b++; if (a.act === "fold") c.f3b++; }
      }
      if (HUD_AGG.has(a.act)) {
        lastAgg = a.actor;
        if (a.act === "3bet" || a.act === "4bet" || a.act === "5bet") sawThree = true;
        else if (!sawRaise) { sawRaise = true; opener = a.actor; }
      }
    }
    if (limped) { c.limps++; pos(myPos).limp++; if (limpThenRaise) { c.lrr++; pos(myPos).lrr++; } }

    // ---- postflop
    const flop = A.filter((a) => a.street === "flop");
    const turn = A.filter((a) => a.street === "turn");
    if (!flop.length) continue;
    const sawFlop = flop.some((a) => a.actor === me);
    if (!sawFlop) continue;

    for (const a of A) {
      if (a.actor !== me || a.street === "pre") continue;
      if (HUD_BET.has(a.act)) c.agg++;
      else if (a.act === "call") c.calls++;
    }

    // cbet + second barrel, when our player is the preflop aggressor
    if (lastAgg === me) {
      c.oppCb++;
      const first = flop.find((a) => a.actor === me);
      const didCb = !!first && first.act === "bet";
      if (didCb) c.cb++;
      if (didCb && turn.length) {
        const t = turn.find((a) => a.actor === me);
        if (t) { c.oppBar++; if (t.act === "bet") c.bar++; }
      }
      continue;                             // can't fold to your own cbet
    }

    // facing someone else's cbet
    const cbIdx = flop.findIndex((a) => a.actor === lastAgg && a.act === "bet");
    if (cbIdx < 0) continue;
    const resp = flop.slice(cbIdx + 1).find((a) => a.actor === me);
    if (!resp) continue;
    c.oppFcb++;
    if (resp.act === "fold") { c.fcb++; continue; }
    if (resp.act !== "call") continue;
    // called the flop cbet — did they fold to the turn barrel?
    const tBet = turn.findIndex((a) => a.actor === lastAgg && a.act === "bet");
    if (tBet < 0) continue;
    const tResp = turn.slice(tBet + 1).find((a) => a.actor === me);
    if (!tResp) continue;
    c.oppFtb++;
    if (tResp.act === "fold") c.ftb++;
  }
  return c;
}

/* One row per stat: value as a percentage of its own opportunity count. */
function hudStats(c) {
  const r = (label, n, d, tip) => ({ label, n, d, tip, pct: d ? (100 * n) / d : null, thin: d < HUD_MIN });
  return [
    r("VPIP", c.vpip, c.seats, "Voluntarily put money in preflop — limps included"),
    r("PFR", c.pfr, c.seats, "Raised preflop"),
    r("3-bet", c.n3b, c.opp3b, "3-bet when facing an unraised open"),
    r("Fold v 3B", c.f3b, c.oppF3b, "Opened, then folded to a 3-bet"),
    r("Cbet F", c.cb, c.oppCb, "Bet the flop as the preflop aggressor"),
    r("Fold v CB", c.fcb, c.oppFcb, "Folded facing a flop cbet"),
    r("Barrel T", c.bar, c.oppBar, "Bet the turn after cbetting the flop"),
    r("Fold v T", c.ftb, c.oppFtb, "Called the flop cbet, then folded to the turn bet"),
  ];
}

/* Aggression factor is a ratio, not a percentage — postflop bets+raises per call. */
function hudAF(c) {
  if (!c.calls) return c.agg ? { v: null, inf: true, n: c.agg } : null;
  return { v: c.agg / c.calls, inf: false, n: c.agg + c.calls };
}
