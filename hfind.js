/* ================= Find: hands by typed words =================
   Phil types what he wants to look at — "3bet pot cbet flop b50", "check-raise
   turn", "folds to cbet on the button" — and the Hands list narrows to it,
   on top of whatever chips are lit. No model behind it: a fixed vocabulary,
   read here, always from this player's side of the hand. What it understood
   is spelled back and any word it didn't is named, never guessed at, so the
   list can't quietly mean something other than what was typed. */

const HQ_RANK = { a: 14, ace: 14, k: 13, king: 13, q: 12, queen: 12, j: 11, jack: 11, t: 10, ten: 10, 10: 10,
  9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
const HQ_RANK_NAME = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };
/* Multi-word phrases first, each collapsed to one token the reader below knows. */
const HQ_BT_KIND = "4[\\s-]?flush|four[\\s-]flush|3[\\s-]?flush|flush|4[\\s-]?str(?:aight)?|four[\\s-]straight|straight|over[\\s-]?cards?|board[\\s-]?pair(?:ing|s|ed)?|pair(?:ing|s|ed)?(?:\\s+(?:the\\s+)?board)?|blank|brick";
const hqBtKind = (k) => /^(?:4|four)[\s-]?flush/.test(k) ? "4flush" : /flush/.test(k) ? "flush"
  : /^(?:4|four)[\s-]?str/.test(k) ? "4str" : /straight/.test(k) ? "straight"
  : /over/.test(k) ? "over" : /pair/.test(k) ? "pair" : "blank";
/* The card a street added against the board before it. A flush or straight
   "completes" when a two-card hand could make one now and couldn't through
   this card before; 4Flush / 4Str is one card short of it on the board. */
function hqBoardCard(board, j) {
  const rk = (x) => HQ_RANK[String(x)[0].toLowerCase()] || 0;
  const before = board.slice(0, j), c = board[j];
  const r = rk(c), su = String(c).slice(-1).toLowerCase();
  const suit = before.filter((x) => String(x).slice(-1).toLowerCase() === su).length + 1;
  const lows = (rs) => new Set(rs.flatMap((x) => x === 14 ? [14, 1] : [x]));
  const most = (set, need) => { let n = 0; for (let lo = 1; lo <= 10; lo++) {
    if (need != null && !(need >= lo && need <= lo + 4) && !(need === 14 && lo === 1)) continue;
    let k = 0; for (let v = lo; v <= lo + 4; v++) if (set.has(v)) k++; n = Math.max(n, k); } return n; };
  const pr = before.map(rk), had = lows(pr), now = lows([...pr, r]);
  const out = { flush: suit === 3, "4flush": suit === 4,
    straight: !pr.includes(r) && most(now, r) >= 3, "4str": most(now, r) >= 4 && most(had) < 4,
    over: pr.every((x) => r > x), pair: pr.includes(r) };
  out.blank = !out.flush && !out["4flush"] && !out.straight && !out["4str"] && !out.over && !out.pair;
  return out;
}
/* Hand strength — what his shown cards made (Phil 2026-09-28: "have 2pair+").
   One token, "hs_" + class + _ge/_le/_eq, so "+" / "or better" rides along.
   Flush, straight and a bare "pair" collide with board words ("flush turn"),
   so they need "have / has / with / makes" ahead of them or a "+" after. */
const HQ_HS_OP = "(\\s*\\+|\\s+or\\s+(?:better|higher|more|above|stronger)|\\s*-(?=\\s)|\\s+or\\s+(?:worse|lower|less|below|weaker))?";
const hqHsOp = (o) => !o ? "eq" : /\+|better|higher|more|above|stronger/.test(o) ? "ge" : "le";
const HQ_HS_CUE = "(?:have|has|had|having|hold|holds|holding|held|with|make|makes|made|making)\\s+(?:an?\\s+)?";
const HQ_HS = [
  ["sf", "\\bstraight[\\s-]?flush(?:es)?"], ["boat", "\\bfull[\\s-]?house|\\bboats?|\\bfh"],
  ["quads", "\\bquads|\\bfour[\\s-]of[\\s-]a[\\s-]kind"], ["nfd", "\\bnut[\\s-]?flush[\\s-]?draws?|\\bnfd"],
  ["combo", "\\bcombo[\\s-]?draws?"], ["fd", "\\bflush[\\s-]?draws?|\\bfd"],
  ["oesd", "\\bopen[\\s-]?end(?:ed|er|ers)?(?:[\\s-]straight)?(?:[\\s-]draws?)?|\\boesd"],
  ["gut", "\\bgut[\\s-]?shots?|\\bgutters?"], ["sdraw", "\\bstraight[\\s-]?draws?"],
  ["2pair", "\\btwo[\\s-]?pairs?|\\b2[\\s-]?pairs?|\\b2p"], ["set", "\\bsets?"],
  ["trips", "\\btrips|\\bthree[\\s-]of[\\s-]a[\\s-]kind"], ["over", "\\bover[\\s-]?pairs?"],
  ["top", "\\btop[\\s-]?pairs?|\\btopp|\\btp"], ["second", "\\b(?:second|2nd|middle)[\\s-]?pairs?|\\b2ndp"],
  ["weak", "\\b(?:third|3rd|bottom|weak|low)[\\s-]?pairs?|\\bunder[\\s-]?pairs?|\\b3rdp"],
  ["nopair", "\\bno[\\s-]pair"], ["air", "\\bair"], ["draw", "\\bdraws?"],
].map(([k, re]) => [new RegExp(`(?:${HQ_HS_CUE})?(?:${re})\\b${HQ_HS_OP}`, "g"), (m, o) => ` hs_${k}_${hqHsOp(o)} `]).concat([
  [new RegExp(`${HQ_HS_CUE}(flush|straight|pair)\\b${HQ_HS_OP}`, "g"), (m, k, o) => ` hs_${k === "pair" ? "pair" : k}_${hqHsOp(o)} `],
  [/\b(flush|straight)\s*\+/g, (m, k) => ` hs_${k}_ge `],
]);
const HQ_PHRASES = [
  ...HQ_HS,
  [/\b([345])[\s-]?bet(?:s|ted|ting)?\s+pots?\b|\b([345])[\s-]?bps?\b/g, (m, a, b) => ` ${a || b}bp `],
  [/\bsingle[\s-]?raised(?:\s+pots?)?\b|\bsrps?\b/g, " srp "],
  [/\blimped\s+pots?\b|\blimp\s+pots?\b/g, " limpedpot "],
  [/\bheads[\s-]?up(?:\s+pots?)?\b|\bhups?\b/g, " hu "],                 // HUP = heads-up pot
  [/\bmulti[\s-]?way(?:\s+pots?)?\b|\bmwps?\b/g, " mw "],             // MWP = multiway pot
  [/\bwent\s+to\s+showdown\b|\bto\s+showdown\b|\bshow[\s-]?down\b/g, " sd "],
  [/\bcards?\s+(?:seen|shown)\b|\bshow(?:s|ed|n)\s+(?:his\s+)?(?:cards|hand)\b/g, " cards "],
  [/\bin\s+position\b/g, " ip "],
  [/\bout\s+of\s+position\b/g, " oop "],
  [/\bsmall\s+blind\b/g, " sb "],
  [/\bbig\s+blind\b/g, " bb "],
  [/\bcut[\s-]?off\b/g, " co "],
  [/\bunder\s+the\s+gun\b/g, " utg "],
  [/\ball[\s-]?in\b/g, " jam "],
  [/\bcontinuation[\s-]?bet(?:s|ting)?\b|\bc[\s-]bet(?:s|ting)?\b/g, " cbet "],
  [/\blimp[\s-]?re[\s-]?raise[sd]?\b|\blimp[\s-]?raise[sd]?\b/g, " lrr "],
  [/\bcold[\s-]?call(?:s|ed|ing)?\b/g, " flat "],
  [/\bopen[\s-]?raise[sd]?\b/g, " open "],
  [/\b(?:check(?:s|ed)?|x)[\s-]+(?:back|behind)\b/g, " xb "],
  [/\b(?:check(?:s|ed|ing)?|x)\s*[-\/]?\s*(raise|call|fold|r|c|f)(?:s|d|ed|ing)?\b/g, (m, b) => ` x${b[0]} `],
  [/\bbet(?:s|ting)?\s*[-\/]?\s*(call|fold)(?:s|ed|ing)?\b/g, (m, b) => ` b${b[0]} `],
  [/\bdouble[\s-]?barrel(?:s|ed|led|ing|ling)?\b/g, " barrel2 "],
  [/\btriple[\s-]?barrel(?:s|ed|led|ing|ling)?\b/g, " barrel3 "],
  [/\bhalf[\s-]?pot\b/g, " s50 "],
  [/\b(?:a\s+)?third[\s-]?pot\b|\b1\/3(?:\s*pot)?\b/g, " s33 "],
  [/\btwo[\s-]?thirds?(?:\s*pot)?\b|\b2\/3(?:\s*pot)?\b/g, " s66 "],
  [/\bthree[\s-]?quarters?(?:\s*pot)?\b|\b3\/4(?:\s*pot)?\b/g, " s75 "],
  [/\bpot[\s-]?sized?(?:\s+bet)?\b|\bfull[\s-]?pot\b/g, " s100 "],
  [/\bover[\s-]?bet(?:s|ting)?\b/g, " ob "],
  [/\bpre[\s-]?flop\s+(?:raiser|aggressor)\b|\bpfa\b/g, " pfr "],
  [/\bpre[\s-]?flop\s+caller\b/g, " pfc "],
  [/\bpre[\s-]?flop\b/g, " pre "],
  [/\bpost[\s-]flop\b/g, " postflop "],
  /* Board by its top flop card: "A-high", "Thigh", "T high or lower", "Q-high+".
     One token, "hi" + rank value + le/ge/eq, so the "or" can't split it. */
  /* Naming the turn or river reads the board as it stands then — "turn is
     9-high board or lower", "9-high turn", "T-high board on the river". */
  [/(?:\b(turn|river)\s+(?:board\s+is|board|is)\s+(?:an?\s+)?)?\b(ace|king|queen|jack|ten|10|[akqjt2-9])[\s-]?high(?:\s+(?:boards?|flops?))?(?:\s+(?:on\s+)?(?:the\s+)?(turn|river)(?:\s+boards?)?)?(\s*(?:(?:or|and)\s+(?:lower|below|less|under|smaller|worse)|-(?=\s)))?(\s*(?:(?:or|and)\s+(?:higher|above|more|over|bigger|better)|\+))?/g,
    (m, st, r, st2, lo, hi) => ` hi${HQ_RANK[r]}${lo ? "le" : hi ? "ge" : "eq"}${(st || st2 || "f")[0]} `],
  /* What the turn or river card did: "turn flush completing", "flush turn",
     "river pairs the board", "overcard turn", "4str turn", "blank river".
     One token, "bt" + t/r + kind, so the street word can't wander off. */
  [new RegExp(`\\b(turn|river)(?:\\s+card)?\\s+(?:that\\s+|which\\s+)?(?:(?:is|completes|completing|brings|makes|pairs|pairing)\\s+)?(?:(?:the|a|an)\\s+)?(${HQ_BT_KIND})(?:[\\s-]+(?:completing|completes|comes|card))?\\b`, "g"),
    (m, st, k) => ` bt${st[0]}${hqBtKind(k)} `],
  [new RegExp(`\\b(${HQ_BT_KIND})(?:[\\s-]+(?:completing|completes|comes|coming|card))?\\s+(?:on\\s+)?(?:the\\s+)?(turn|river)\\b`, "g"),
    (m, k, st) => ` bt${st[0]}${hqBtKind(k)} `],
  [/\b([345])[\s-]bet/g, "$1bet"],
];
/* Single words → what they are. Street and size words attach to the action
   next to them; everything else stands on its own. */
const HQ_WORDS = {
  bet: "a:bet", bets: "a:bet", betting: "a:bet", check: "a:check", checks: "a:check", checked: "a:check",
  checking: "a:check", call: "a:call", calls: "a:call", called: "a:call", calling: "a:call",
  raise: "a:raise", raises: "a:raise", raised: "a:raise", raising: "a:raise",
  fold: "a:fold", folds: "a:fold", folded: "a:fold", folding: "a:fold",
  limp: "a:limp", limps: "a:limp", limped: "a:limp", limping: "a:limp",
  jam: "a:jam", jams: "a:jam", jammed: "a:jam", jamming: "a:jam", shove: "a:jam", shoves: "a:jam",
  shoved: "a:jam", shoving: "a:jam", allin: "a:jam",
  cbet: "a:cbet", cbets: "a:cbet", donk: "a:donk", donks: "a:donk", donked: "a:donk", donking: "a:donk",
  lead: "a:donk", leads: "a:donk", led: "a:donk", leading: "a:donk",
  open: "a:open", opens: "a:open", opened: "a:open", opening: "a:open", rfi: "a:open",
  flat: "a:flat", flats: "a:flat", flatted: "a:flat", flatting: "a:flat",
  "3bet": "a:3bet", "3bets": "a:3bet", "3betting": "a:3bet", "4bet": "a:4bet", "4bets": "a:4bet",
  "5bet": "a:5bet", "5bets": "a:5bet", lrr: "a:lrr",
  xr: "a:xr", xc: "a:xc", xf: "a:xf", xb: "a:xb", bf: "a:bf", bc: "a:bc",
  barrel: "a:barrel2", barrels: "a:barrel2", barreled: "a:barrel2", barrelled: "a:barrel2",
  barrel2: "a:barrel2", barrel3: "a:barrel3",
  pre: "st:pre", pf: "st:pre", flop: "st:flop", flops: "st:flop", turn: "st:turn", turns: "st:turn",
  river: "st:river", rivers: "st:river", postflop: "st:post",
  s33: "sz:33", s50: "sz:50", s66: "sz:66", s75: "sz:75", s100: "sz:100", ob: "sz:ob",
  b33: "sz:33", b50: "sz:50", b66: "sz:66", b75: "sz:75", b100: "sz:100", b150: "sz:150",
  button: "f:pos:BTN", btn: "f:pos:BTN", bn: "f:pos:BTN", bu: "f:pos:BTN", dealer: "f:pos:BTN",
  co: "f:pos:CO", hj: "f:pos:HJ", hijack: "f:pos:HJ", sb: "f:pos:SB", bb: "f:pos:BB",
  straddle: "f:pos:STD", straddles: "f:pos:STD", straddled: "f:pos:STD", std: "f:pos:STD",
  ep: "f:pos:EP", utg: "f:pos:EP", early: "f:pos:EP", u6: "f:pos:EP", u7: "f:pos:EP", u8: "f:pos:EP", u9: "f:pos:EP",
  "3bp": "f:pot:3BP", "4bp": "f:pot:4BP+", "5bp": "f:pot:4BP+", srp: "f:pot:SRP", limpedpot: "f:pot:Limped",
  pfr: "f:pfr", pfc: "f:pfc",
  hu: "f:hu", mw: "f:mw", multiway: "f:mw", sd: "f:sd", cards: "f:cards", shown: "f:cards", showed: "f:cards",
  ip: "f:ip", oop: "f:oop",
  no: "neg", not: "neg", never: "neg", didnt: "neg", doesnt: "neg", dont: "neg", without: "neg",
  except: "neg", excluding: "neg", isnt: "neg", wasnt: "neg",
  or: "or",
  saw: "seen", sees: "seen", seen: "seen", see: "seen", reached: "seen", reaches: "seen", reach: "seen",
  to: "vs", vs: "vs", versus: "vs", against: "vs", facing: "vs", faces: "vs", faced: "vs",
};
/* Words that carry nothing to search on. Dropped quietly; anything outside
   both lists is named back to Phil as not understood. */
const HQ_STOP = new Set(("a an the and he him his hes she they villain player opp opponent hand hands " +
  "spot spots where when that who with on in at of from then after also was is does did do had has " +
  "have i me my show look find want all any some times time pot pots street streets game games it its " +
  "by for as but so this these those what which whether like just only").split(" "));

/* Default street per action: preflop words live preflop, postflop words
   anywhere after it; plain verbs anywhere. */
const HQ_PRE_ONLY = new Set(["open", "3bet", "4bet", "5bet", "limp", "lrr", "flat"]);
const HQ_POST_ONLY = new Set(["cbet", "donk", "xr", "xc", "xf", "xb", "bf", "bc"]);
const HQ_SIZED = new Set(["bet", "raise", "cbet", "donk", "jam", "3bet", "4bet", "5bet", "open", "xr", "agg"]);
const HQ_FACEABLE = new Set(["cbet", "bet", "raise", "3bet", "4bet", "5bet", "jam", "donk"]);
const HQ_FACERS = new Set(["fold", "call", "raise", "jam", "3bet", "4bet", "5bet"]);

function hqParse(text) {
  let s = " " + String(text || "").replace(/[’']/g, "").replace(/[,.;:!?()"]/g, " ") + " ";
  s = hqLines(s).toLowerCase();   // lines first: the case of XR vs xR matters
  for (const [re, to] of HQ_PHRASES) s = s.replace(re, to);
  const words = s.split(/\s+/).filter(Boolean);
  const clauses = [], unknown = [];
  let cur = null, pend = { st: null, sz: null, neg: false, or: false };
  const push = (c) => {
    c.neg = pend.neg; c.or = pend.or && clauses.length > 0;
    pend.neg = false; pend.or = false;
    clauses.push(c); return c;
  };
  for (let k = 0; k < words.length; k++) {
    const w = words[k], t = HQ_WORDS[w];
    if (/^ln[0-5]{1,2}(?:_[0-5]{1,2}){1,2}$/.test(w)) {
      cur = push({ kind: "line", line: w.slice(2).split("_").map((u) => [...u].map((d) => HQ_LINE_CODE[d]).join("")) }); continue; }
    { const b = /^bt([tr])(flush|4flush|straight|4str|over|pair|blank)$/.exec(w);
      if (b) { cur = push({ kind: "f", f: "bcard", st: b[1] === "t" ? "turn" : "river", val: b[2] }); continue; } }
    { const b = /^hs_([a-z0-9]+)_(ge|le|eq)$/.exec(w);
      // "bet flop with top pair": no street of its own, it borrows the street of the action it hangs off
      if (b) { const inh = !pend.st && cur && cur.kind !== "f" && cur.kind !== "line" && ["flop", "turn", "river"].includes(cur.st) ? cur.st : null;
        cur = push({ kind: "f", f: "hs", val: b[1], op: b[2], st: pend.st || inh, stInh: !!inh }); pend.st = null; continue; } }
    { const b = /^hi(\d+)(le|ge|eq)([ftr])$/.exec(w);
      if (b) { cur = push({ kind: "f", f: "high", val: +b[1], op: b[2], st: { f: "flop", t: "turn", r: "river" }[b[3]] }); continue; } }
    if (!t) { if (!HQ_STOP.has(w)) unknown.push(w); continue; }
    if (t === "neg") { pend.neg = true; continue; }
    if (t === "or") { pend.or = true; continue; }
    if (t === "vs") continue;
    if (t === "seen") { cur = push({ kind: "seen", st: null }); continue; }
    if (t.startsWith("st:")) {
      const st = t.slice(3);
      if (cur && (!cur.st || cur.stInh) && cur.kind !== "pos") { cur.st = st; cur.stInh = false; continue; }
      pend.st = st; continue;
    }
    if (t.startsWith("sz:")) {
      const sz = t.slice(3);
      if (cur && cur.kind && HQ_SIZED.has(cur.kind) && !cur.sz) { cur.sz = sz; continue; }
      pend.sz = sz; continue;
    }
    if (t.startsWith("f:")) {
      const [, kind, val] = t.split(":");
      cur = push({ kind: "f", f: kind, val }); continue;
    }
    /* An action. "folds to cbet", "calls a 3bet", "raises the donk": a verb
       that answers another action takes that one as what it faced. */
    const kind = t.slice(2);
    if (cur && cur.facingOpen && HQ_FACEABLE.has(kind)) { cur.facing = kind; cur.facingOpen = false; continue; }
    const c = push({ kind, st: pend.st, sz: HQ_SIZED.has(kind) ? pend.sz : null });
    pend.st = null; if (c.sz) pend.sz = null;
    if (HQ_FACERS.has(kind)) {
      let j = k + 1;
      while (j < words.length && (HQ_WORDS[words[j]] === "vs" || HQ_STOP.has(words[j]))) j++;
      const nxt = HQ_WORDS[words[j]];
      if (nxt && nxt.startsWith("a:") && HQ_FACEABLE.has(nxt.slice(2)) && j > k + 1) c.facingOpen = true;
      else if (nxt && nxt.startsWith("a:") && HQ_FACEABLE.has(nxt.slice(2)) && kind !== "raise" && kind !== "jam") c.facingOpen = true;
    }
    cur = c;
  }
  /* Leftovers. A street with nothing to attach to reads as "and on this street
     too" after an action ("cbet flop and turn"), else "he played this street".
     A size alone is any bet or raise of his at that size. */
  if (pend.st) {
    if (cur && cur.kind !== "f" && cur.kind !== "seen" && cur.st) push({ ...cur, st: pend.st, facingOpen: false });
    else push({ kind: "seen", st: pend.st });
  }
  if (pend.sz) push({ kind: "agg", st: null, sz: pend.sz });
  for (const c of clauses) {
    delete c.facingOpen;
    if (c.kind === "seen" && !c.st) c.st = "flop";
    if (HQ_PRE_ONLY.has(c.kind) && c.st && c.st !== "pre") c.bad = `${c.kind} is preflop only`;
    if (HQ_POST_ONLY.has(c.kind) && c.st === "pre") c.bad = `${c.kind} is postflop only`;
  }
  let ok = clauses.filter((c) => !c.bad);
  /* He has one seat and one pot type, so "U7 U6" or "limped srp" back to back
     can only mean either one; the same one twice is kept once. */
  const ONE = new Set(["pos", "pot", "squid"]);
  ok = ok.filter((c, j) => {
    const p = ok[j - 1];
    if (c.kind !== "f" || !ONE.has(c.f) || !p || p.kind !== "f" || p.f !== c.f || p.neg !== c.neg || c.neg) return true;
    if (p.val === c.val) return false;
    c.or = true; return true;
  });
  /* "a or b" joins neighbours into one either-way group; groups are AND-ed. */
  const groups = [];
  for (const c of ok) (c.or && groups.length ? groups[groups.length - 1] : (groups[groups.length] = [])).push(c);
  return { groups, unknown, bad: clauses.filter((c) => c.bad).map((c) => c.bad), text: String(text || "").trim() };
}

const HQ_NAME = {
  bet: "bets", check: "checks", call: "calls", raise: "raises", fold: "folds", limp: "limps", jam: "jams",
  cbet: "c-bets", donk: "donks / leads", open: "opens", flat: "cold-calls", "3bet": "3-bets", "4bet": "4-bets",
  "5bet": "5-bets", lrr: "limp-reraises", xr: "check-raises", xc: "check-calls", xf: "check-folds",
  xb: "checks back", bf: "bet-folds", bc: "bet-calls", barrel2: "double-barrels (flop + turn)",
  barrel3: "triple-barrels (flop + turn + river)", agg: "bets or raises", seen: "plays",
};
const HQ_LINE_ACT = { b: "bet", x: "check", c: "call", r: "raise", f: "fold" };
/* Lines: one letter per street from the flop — "bxb", "bb" (flop + turn,
   river anything), "-bb" (turn + river, flop anything), a dash anywhere is
   that street anything — "-x-" checked the turn, "b-b" bet flop and river.
   A lower-case letter then a capital is two moves on one street, so "BBxR"
   is bet, bet, check-raise the river and "-BxC" bet turn, check-call river.
   Swapped for a digit token before the phrase rules so "-xr" can't turn
   into a check-raise. "the bb" is still the big blind. XR in capitals is the
   line (check flop, raise turn); on its own any lower case — xR, xr — is the
   one-street check-raise, and the same for XC XF XB BF BC. */
const HQ_LINE_CODE = "-bxcrf";
function hqLines(s) {
  return s.replace(/(^|\s)(lines?\s+)?([-bxcrf]{2,6})(?=\s)/gi, (m, sp, pre, raw, at, all) => {
    const code = raw.toLowerCase();
    const units = raw.match(/-|[bxcrf][BXCRF]|[bxcrfBXCRF]/g);
    if (units.length > 3 || units.length < 2 || !/[bxcrf]/.test(code)) return m;
    if (!pre && raw !== raw.toUpperCase() && ["xr", "xc", "xf", "xb", "bf", "bc"].includes(code)) return m;
    if (!pre && code === "bb" && /\bthe\s+$/i.test(all.slice(0, at + sp.length))) return m;
    return sp + "ln" + units.map((u) => [...u.toLowerCase()].map((L) => HQ_LINE_CODE.indexOf(L)).join("")).join("_");
  });
}
const HQ_FACE_NAME = { cbet: "a c-bet", bet: "a bet", raise: "a raise", "3bet": "a 3-bet", "4bet": "a 4-bet",
  "5bet": "a 5-bet", jam: "a jam", donk: "a donk" };
const HQ_POS_NAME = { BTN: "on the button", CO: "in the CO", HJ: "in the HJ", EP: "in early position",
  SB: "in the SB", BB: "in the BB", STD: "on the straddle" };
/* Each piece as a short phrase with him as the subject, so the readout says
   back plainly what the list is now holding. */
function hqLabel(c) {
  let t;
  if (c.kind === "f") {
    t = c.f === "sd" || c.f === "cards" || c.f === "hs" ? "" : "is ";
    t += { pos: HQ_POS_NAME[c.val],
      pot: { "3BP": "in a 3-bet pot (he 3-bet or called it)", "4BP+": "in a 4-bet+ pot", SRP: "in a single-raised pot", Limped: "in a limped pot" }[c.val],
      pfr: "the preflop raiser", pfc: "a preflop caller",
      hu: "heads-up on the flop", mw: "multiway on the flop", sd: "gets to showdown", cards: "has his cards on record",
      ip: "in position on the flop", oop: "out of position on the flop",
      high: (c.op === "eq" ? `on a${c.val === 14 || c.val === 8 ? "n" : ""} ${HQ_RANK_NAME[c.val] || c.val}-high ${c.st === "flop" ? "flop" : "board"}`
        : `on a ${c.st === "flop" ? "flop" : "board"} ${HQ_RANK_NAME[c.val] || c.val}-high or ${c.op === "le" ? "lower" : "higher"}`)
        + (c.st === "flop" ? "" : ` by the ${c.st}`),
      hs: c.f === "hs" && hqHsLabel(c),
      bcard: { flush: `on a flush-completing ${c.st}`, "4flush": `on a ${c.st} that puts four to a flush on board`,
        straight: `on a straight-completing ${c.st}`, "4str": `on a ${c.st} that puts four to a straight on board`,
        over: `on an overcard ${c.st}`, pair: `on a board-pairing ${c.st}`,
        blank: `on a blank ${c.st} (no flush, straight, overcard or pair)` }[c.val] }[c.f];
    if (c.neg && c.f === "hs") return "doesn't show " + t.slice(6);
    if (c.neg && t.startsWith("is ")) return "isn't " + t.slice(3);
  } else if (c.kind === "line") {
    const any = ["flop", "turn", "river"].filter((st, j) => !c.line[j] || c.line[j] === "-");
    const two = { xr: "check-raise", xc: "check-call", xf: "check-fold", bc: "bet-call", bf: "bet-fold", br: "bet-reraise" };
    t = "goes " + c.line.map((L, j) => L === "-" ? "" : (two[L] || [...L].map((x) => HQ_LINE_ACT[x]).join(" then ")) + " " + ["flop", "turn", "river"][j]).filter(Boolean).join(", ")
      + (any.length ? ` (${any.join(", ")}: anything)` : "");
  } else {
    const verb = HQ_NAME[c.kind] || c.kind;
    t = verb + (c.facing ? (c.kind === "fold" ? " to " : " ") + HQ_FACE_NAME[c.facing] : "")
      + (c.st ? (c.kind === "seen" && c.st !== "post" ? " the " : " ") + (c.st === "pre" ? "preflop" : c.st === "post" ? "postflop" : c.st) : "")
      + (c.sz ? " at " + (c.sz === "ob" ? "an overbet" : "B" + c.sz) : "");
  }
  return (c.neg ? "never " : "") + t;
}

/* ---- matching ---- */
const hqCache = new WeakMap();
const HQ_LEVEL = { raise: 1, "3bet": 2, "4bet": 3, "5bet": 4 };
/* One pass over the hand, tagging every action with what it was: a lead or a
   raise by where it sits in the street (the tokens can't be trusted to say),
   the preflop level it took the pot to, c-bets and donks against the last
   street's aggressor, and its rung off the same pricing the Sizings grid uses. */
function hqInfo(h) {
  const acts = actsAsPlayed(h);   // an all-in call reads as a call
  let info = hqCache.get(h);
  if (info && info.acts === acts && info.n === (h.actions || []).length) return info;
  let rungs = null;
  try { rungs = typeof handRungs === "function" ? handRungs(h) : null; } catch (e) { rungs = null; }
  const tagged = [];
  let lv = 0, prevAgg = null, pfr = null;
  for (const st of ["pre", "flop", "turn", "river"]) {
    let open = false, lastAgg = null;
    const acted = new Set();
    for (const a of acts.filter((x) => x.street === st)) {
      const k = new Set([a.act]);
      if (st === "pre") {
        /* Levels exactly as potBucket ranks them, so "3bet" here and the 3BP
           chip never disagree about the same hand. */
        const was = lv;
        if (a.act === "jam") lv = Math.max(lv + 1, 1);
        else if (HQ_LEVEL[a.act]) lv = Math.max(lv, HQ_LEVEL[a.act]);
        if (a.act === "jam" || HQ_LEVEL[a.act]) {
          k.add("raise"); k.add("agg");
          if (!open) k.add("open");
          if (lv > was) { if (lv === 2) k.add("3bet"); else if (lv === 3) k.add("4bet"); else if (lv >= 4) k.add("5bet"); }
          open = true; lastAgg = a.actor;
        }
        if (a.act === "call" && was >= 1 && !tagged.some((x) => x.st === "pre" && x.a.actor === a.actor && x.k.has("agg"))) k.add("flat");
        k.lv = was;
      } else if (POST_AGG.includes(a.act)) {
        k.add("agg");
        if (!open) {
          k.add("bet");
          if (prevAgg && a.actor === prevAgg) k.add("cbet");
          else if (prevAgg && !acted.has(prevAgg)) k.add("donk");
        } else k.add("raise");
        open = true; lastAgg = a.actor;
      }
      const rg = rungs && rungs.get(a.src || a);
      tagged.push({ a, st, k, step: rg ? rg.step : null, ratio: rg ? rg.ratio : null });
      acted.add(a.actor);
    }
    if (st === "pre") pfr = lastAgg;
    prevAgg = lastAgg;
  }
  info = { tagged, pfr, acts, n: (h.actions || []).length };
  hqCache.set(h, info);
  return info;
}
/* Table sense, shared with the Role chips: the preflop raiser is whoever put
   in the last raise; a preflop caller called that raise and didn't fold. */
const isPFR = (h, me) => hqInfo(h).pfr === me;
function isPFC(h, me) {
  const { pfr, tagged } = hqInfo(h);
  if (!pfr || pfr === me) return false;
  const pre = tagged.filter((t) => t.st === "pre");
  let j = -1;
  pre.forEach((t, k) => { if (t.k.has("agg")) j = k; });
  const after = pre.slice(j + 1).filter((t) => t.a.actor === me);
  return after.some((t) => t.a.act === "call") && !after.some((t) => t.a.act === "fold");
}
const hqSize = (t, sz) => sz === "ob" ? t.ratio !== null && t.ratio > 1.001 : t.step === sz;
const hqFoldedPre = (h, me) => (h.actions || []).some((a) => a.actor === me && a.street === "pre" && a.act === "fold");
function hqClause(h, oppId, c) {
  const i = (h.villains || []).findIndex((v) => v.opponentId === oppId);
  if (i < 0) return false;
  const me = "v" + i;
  if (c.kind === "f") {
    const pos = h.villains[i].pos;
    switch (c.f) {
      case "pos": return posBucket(pos) === c.val;
      case "pot": return potBucket(h) === c.val && !hqFoldedPre(h, me) && (c.val !== "3BP" || in3betPot(h, oppId));
      case "hu": return fieldBucket(h) === "HU" && seenStreets(h, oppId).includes("Flop");
      case "mw": return fieldBucket(h) === "MW" && seenStreets(h, oppId).includes("Flop");
      /* Table sense, not HUD sense: the preflop raiser is whoever put in the
         last raise, so an opener who called a 3-bet is the caller in that pot.
         The caller called that last raise and stayed in. A limped pot has neither. */
      case "pfr": return isPFR(h, me);
      case "pfc": return isPFC(h, me);
      /* The board's top card as it stood on that street, and only when he saw it. */
      case "high": {
        const n = { flop: 3, turn: 4, river: 5 }[c.st], f = (h.board || []).slice(0, n).filter(Boolean);
        if (f.length < n || !seenStreets(h, oppId).includes(c.st[0].toUpperCase() + c.st.slice(1))) return false;
        const top = Math.max(...f.map((x) => HQ_RANK[String(x)[0].toLowerCase()] || 0));
        return c.op === "le" ? top <= c.val : c.op === "ge" ? top >= c.val : top === c.val;
      }
      /* What the turn / river card did, and only when he saw that street. */
      case "bcard": {
        const j = c.st === "turn" ? 3 : 4, b = h.board || [];
        if (b.slice(0, j + 1).filter(Boolean).length < j + 1) return false;
        if (!seenStreets(h, oppId).includes(c.st === "turn" ? "Turn" : "River")) return false;
        return hqBoardCard(b, j)[c.val];
      }
      case "hs": return hqHs(h, i, c);
      case "sd": return oppSD(h, oppId);
      case "cards": return cardsSeen(h, oppId);
      case "ip": case "oop": {
        const on = new Set((h.actions || []).filter((a) => a.street === "flop").map((a) => a.actor));
        if (!on.has(me)) return false;
        const at = (actor) => POSITIONS_POST.indexOf(actor === "hero" ? h.heroPos : h.villains[+actor.slice(1)]?.pos);
        const last = [...on].every((x) => x === me || at(x) < at(me));
        return c.f === "ip" ? last : !last;
      }
    }
    return false;
  }
  const { tagged } = hqInfo(h);
  const mine = (st) => tagged.filter((t) => t.a.actor === me && (!st || t.st === st));
  /* "postflop" is any street after the flop is dealt: flop, turn or river. */
  const streets = c.st === "post" ? ["flop", "turn", "river"] : c.st ? [c.st] : HQ_PRE_ONLY.has(c.kind) ? ["pre"]
    : HQ_POST_ONLY.has(c.kind) ? ["flop", "turn", "river"] : ["pre", "flop", "turn", "river"];
  const onStreet = (st) => {
    const all = tagged.filter((t) => t.st === st);
    const my = all.filter((t) => t.a.actor === me);
    if (!my.length) return false;
    const seq = (x, y) => my.some((t, j) => t.k.has(x) && my.slice(j + 1).some((u) => u.k.has(y)));
    switch (c.kind) {
      case "seen": return true;
      case "xr": return seq("check", "raise") && (!c.sz || my.some((t) => t.k.has("raise") && hqSize(t, c.sz)));
      case "xc": return seq("check", "call");
      case "xf": return seq("check", "fold");
      case "bf": return seq("bet", "fold");
      case "bc": return seq("bet", "call");
      case "xb": return all.every((t) => t.a.act === "check") && all[all.length - 1].a.actor === me;
      case "lrr": return seq("limp", "raise");
    }
    return my.some((t) => {
      if (!t.k.has(c.kind)) return false;
      if (c.sz && !hqSize(t, c.sz)) return false;
      if (!c.facing) return true;
      /* What he answered: that action by somebody else, earlier on this street,
         and — preflop — only when he already had chips in, so a cold fold to a
         3-bet two seats away isn't "folds to a 3-bet". */
      const j = all.indexOf(t);
      const before = all.slice(0, j);
      if (st === "pre" && !before.some((u) => u.a.actor === me && u.a.act !== "fold")
          && !["SB", "BB", "STD"].includes(h.villains[i].pos)) return false;
      const faced = [...before].reverse().find((u) => u.k.has("agg"));
      return !!faced && faced.a.actor !== me && faced.k.has(c.facing);
    });
  };
  if (c.kind === "barrel2" || c.kind === "barrel3") {
    const b = (st) => mine(st).some((t) => t.k.has("bet"));
    return b("flop") && b("turn") && (c.kind === "barrel2" || b("river"));
  }
  /* X only when every move he made there was a check; B/R/C/F when he made
     that move at any point on the street (bet then called a raise is B). */
  if (c.kind === "line") return c.line.every((L, j) => {
    if (L === "-") return true;
    const my = mine(["flop", "turn", "river"][j]);
    const is = (t, x) => x === "x" ? t.a.act === "check" : t.k.has(HQ_LINE_ACT[x]);
    // two moves: his first there was the one, and a later one the other (xR: checked, then raised)
    if (L.length === 2) return my.length > 1 && is(my[0], L[0]) && my.slice(1).some((t) => is(t, L[1]));
    return my.length > 0 && (L === "x" ? my.every((t) => t.a.act === "check") : my.some((t) => t.k.has(HQ_LINE_ACT[L])));
  });
  if (c.kind === "agg") return streets.some((st) => mine(st).some((t) => t.k.has("agg") && hqSize(t, c.sz)));
  return streets.some(onStreet);
}
/* Hand strength off his shown cards. Classes climb 0 no pair · 1 weak pair (third
   or worse, underpair) · 2 second · 3 top · 4 overpair · 5 two pair · 6 set/trips ·
   7 straight · 8 flush · 9 full house · 10 quads · 11 straight flush — his own
   cards have to make it (a pair on the board is no pair of his). Plain made hand:
   no 4-flush / 4-straight demotion here. With no street named it is the last
   street he was still in on; draws, any street before the river. No cards on
   record: the hand is left out either way, "not top pair" included. */
const HQ_HS_R = { nopair: 0, air: 0, weak: 1, pair: 1, second: 2, top: 3, over: 4, "2pair": 5, set: 6, trips: 6,
  straight: 7, flush: 8, boat: 9, quads: 10, sf: 11 };
const HQ_HS_NAME = { nopair: "no pair", air: "air (no pair, no draw)", weak: "a weak pair (third pair or worse)", pair: "a pair",
  second: "second pair", top: "top pair", over: "an overpair", "2pair": "two pair", set: "a set", trips: "trips",
  straight: "a straight", flush: "a flush", boat: "a full house", quads: "quads", sf: "a straight flush",
  fd: "a flush draw", nfd: "the nut flush draw", oesd: "an open-ender", gut: "a gutshot", sdraw: "a straight draw",
  combo: "a combo draw (flush draw + straight draw)", draw: "a draw (flush or straight)" };
const HQ_HS_DRAW = { fd: (d) => d.fd, nfd: (d) => d.nutFd, oesd: (d) => d.oesd, gut: (d) => d.gut,
  sdraw: (d) => d.oesd || d.gut, combo: (d) => d.fd && (d.oesd || d.gut), draw: (d) => d.fd || d.oesd || d.gut };
function hqHsLabel(c) {
  const draw = !!HQ_HS_DRAW[c.val];
  return "shows " + HQ_HS_NAME[c.val] + (!draw && c.op !== "eq" && HQ_HS_R[c.val] != null ? (c.op === "ge" ? " or better" : " or worse") : "")
    + (c.st && c.st !== "pre" && c.st !== "post" ? " on the " + c.st : draw ? " on the flop or turn" : " by the last street he played");
}
/* The street his betting stopped on: he jammed, or everyone left against him
   had and he called. Cards after it are a runout he could no longer act on, so
   "made two pair" can't count a river that fell after the money was in (Phil,
   2026-09-29). null = he was never all in. */
function hqAllInStreet(h, me) {
  const A = h.actions || [], ORD = ["pre", "flop", "turn", "river"], at = {};
  A.forEach((a) => { if (!(a.actor in at) && (a.act === "jam" || a.size === "Jam")) at[a.actor] = a.street; });
  if (at[me]) return at[me];
  const out = new Set(A.filter((a) => a.act === "fold").map((a) => a.actor));
  const rest = [...new Set(A.map((a) => a.actor))].filter((p) => p !== me && !out.has(p));
  if (!rest.length || !rest.every((p) => at[p])) return null;
  return rest.map((p) => at[p]).sort((x, y) => ORD.indexOf(y) - ORD.indexOf(x))[0];
}
function hqHs(h, i, c) {
  const E = typeof readEstimates === "function" ? readEstimates : null;
  const hole = ((h.villains[i] || {}).cards || []).filter(Boolean), board = (h.board || []).filter(Boolean);
  if (!E || hole.length !== 2 || ![...hole, ...board].every((x) => /^[2-9TJQKA][cdhs]$/.test(x))) return null;
  const ORD = ["pre", "flop", "turn", "river"], N = { flop: 3, turn: 4, river: 5 };
  const fold = (h.actions || []).find((a) => a.actor === "v" + i && a.act === "fold");
  const shut = fold ? null : hqAllInStreet(h, "v" + i);
  const reached = ["flop", "turn", "river"].filter((st) => board.length >= N[st] && (!fold || ORD.indexOf(fold.street) >= ORD.indexOf(st))
    && (!shut || ORD.indexOf(shut) >= ORD.indexOf(st)));
  if (!reached.length) return null;
  const draw = HQ_HS_DRAW[c.val];
  const sts = c.st === "flop" || c.st === "turn" || c.st === "river" ? (reached.includes(c.st) ? [c.st] : [])
    : draw || c.st === "post" ? reached.filter((st) => st !== "river") : [reached[reached.length - 1]];
  if (!sts.length) return null;
  return sts.some((st) => {
    const b = board.slice(0, N[st]);
    if (draw) return !!draw(E.draws(hole, b));
    const T = E.tier(hole, b, true);
    const R = T.t === 4 ? (T.name === "two pair" ? 5 : T.name === "set" || T.name === "trips" ? 6 : ({ 4: 7, 5: 8, 6: 9, 7: 10, 8: 11 })[T.cat] || 5)
      : T.name === "no pair" ? 0 : T.t + 1;
    const want = HQ_HS_R[c.val];
    if (c.op === "ge") return R >= want;
    if (c.op === "le") return c.val === "pair" ? R >= 1 && R <= 4 : R <= want;
    if (c.val === "air") return R === 0 && !HQ_HS_DRAW.draw(E.draws(hole, b));
    if (c.val === "pair") return R >= 1 && R <= 4;
    if (c.val === "set" || c.val === "trips") return T.name === c.val;
    return R === want;
  });
}
function hqMatch(h, oppId, q) {
  // null = can't tell (no cards on record): out whichever way the word is flipped
  return q.groups.every((g) => g.some((c) => { const r = hqClause(h, oppId, c); return r !== null && r !== c.neg; }));
}
/* What the box read, in words, under it. */
function hqReadHTML(q) {
  if (!q || !q.text) return "";
  const parts = q.groups.map((g) => g.map((c) => `<b>${esc(hqLabel(c))}</b>`).join(" <i>or</i> "));
  let out = parts.length ? `He ${parts.join(" <i>and</i> ")}` : `<span class="hq-warn">Nothing in that I can search for — see the word list.</span>`;
  if (q.bad.length) out += ` <span class="hq-warn">Left out: ${esc(q.bad.join("; "))}.</span>`;
  if (q.unknown.length) out += ` <span class="hq-warn">Didn't understand: ${q.unknown.map((w) => `“${esc(w)}”`).join(", ")} — left out.</span>`;
  return out;
}
