/* Shared vocabulary — stable ids; the future exploit engine aggregates these. */

const POSITIONS = ["U8", "U7", "U6", "HJ", "CO", "BN", "SB", "BB", "STD"];
const STREETS = ["pre", "flop", "turn", "river"];
const ACTS = ["fold", "check", "call", "bet", "raise", "3bet", "limp", "jam"];
const ACTS_POST = ["fold", "check", "call", "bet", "raise"];
const SIZED_ACTS = ["bet", "raise", "3bet", "4bet", "5bet"];
const SIZES_OPEN = ["30k", "40k", "50k", "60k", "Jam"];   // open raise: chip amounts
const SIZES_3BET = ["3x", "4x", "5x", "Jam"];              // 3bet: multipliers
const SIZES_4BET = ["2x", "2.5x", "3x", "Jam"];            // 4bet/5bet: multipliers
const SIZES_POST = ["33%", "50%", "66%", "75%", "pot", "Jam"];

const RANKS = "AKQJT98765432";
const SUITS = [
  { id: "s", sym: "♠", cls: "cs" },   // spade  — white
  { id: "h", sym: "♥", cls: "ch" },   // heart  — red
  { id: "d", sym: "♦", cls: "cd" },   // diamond— blue
  { id: "c", sym: "♣", cls: "cc" },   // club   — green
];

/* Curated tendency reads — three-state (Yes=green / No=red / off) toggles in
   the opponent view; ids are stable, labels display-only. draw-size is a
   special 3-colour read (green/yellow/red). Some postflop reads are shown as
   grouped bubbles (Station/Lead/Raise nuts/Bluff till) — see READ_GROUPS in
   app.js; their labels here are the full names used in row chips. */
/* Yes/No axis pairs — one read holds both directions. Legacy separate tags
   (over-folds-cbet, fit-or-fold, gives-up-turn, never-bluffs, limps-monsters)
   auto-migrate onto these survivors in app.js. Limps monsters is now a grouped
   bubble row (wS / nS). */
/* Reads with `kind: "scale"` are 0-100 sliders, not tri-state toggles.
   They store a number in o.reads[id]; renderer draws a range input. */
const TENDENCY_TAGS = [
  // preflop — opening
  { id: "open-too-wide",        cat: "preflop",  label: "Open too wide" },
  { id: "ep-range-limp",        cat: "preflop",  label: "EP range limp" },
  { id: "limps-monster-ws",     cat: "preflop",  label: "Limps monster wS" },
  { id: "limps-monster-ns",     cat: "preflop",  label: "Limps monster nS" },
  { id: "attacks-limps",        cat: "preflop",  label: "Attacks limps" },
  { id: "attack-limped-blinds", cat: "preflop",  label: "Attack limped blinds" },
  { id: "ep-open-weak",         cat: "preflop",  label: "EP Open weak" },
  { id: "limps-are-weak",       cat: "preflop",  label: "Limps are weak" },
  // preflop — limping / squid
  { id: "limp-caller",          cat: "preflop",  label: "Limp-caller" },
  { id: "lp-limp-weak",         cat: "preflop",  label: "Lp limp = weak" },
  { id: "limp-scale-ws",        cat: "preflop",  label: "Limp with wS",   kind: "scale" },
  { id: "limp-scale-ns",        cat: "preflop",  label: "Limp with nS",   kind: "scale" },
  { id: "limp-wide-multiplier", cat: "preflop",  label: "Goes for multipliers" },
  { id: "wide-cc",              cat: "preflop",  label: "Wide CC" },
  // preflop — 3bet / 4bet (3bet Linear/Polar is a grouped bubble row)
  { id: "3bet-linear",          cat: "preflop",  label: "3bet linear" },
  { id: "3bet-polar",           cat: "preflop",  label: "3bet polar" },
  { id: "3bet-bluff",           cat: "preflop",  label: "3bet bluff" },
  { id: "3bets-light",          cat: "preflop",  label: "3bets light" },
  { id: "3bet-tight",           cat: "preflop",  label: "3bet tight" },
  { id: "can-4bet-light",       cat: "preflop",  label: "Can 4bet light" },
  { id: "over-folds-3bet",      cat: "preflop",  label: "Over-folds to 3bet" },
  { id: "lrr-bluff",            cat: "preflop",  label: "Lrr bluff" },
  // postflop — grouped bubbles (Station/Lead/Raise-nuts/Bluff-till/Range/Bluff-raise/Bluff-XT)
  { id: "station-f",            cat: "postflop", label: "Station F" },
  { id: "station-t",            cat: "postflop", label: "Station T" },
  { id: "station-r",            cat: "postflop", label: "Station R" },
  { id: "ld-draws",             cat: "postflop", label: "Lead draws" },
  { id: "ld-tp",                cat: "postflop", label: "Lead TP" },
  { id: "ld-2p",                cat: "postflop", label: "Lead 2P+" },
  { id: "raise-nuts-f",         cat: "postflop", label: "Raise nuts F" },
  { id: "raise-nuts-t",         cat: "postflop", label: "Raise nuts T" },
  { id: "raise-nuts-r",         cat: "postflop", label: "Raise nuts R" },
  { id: "bluff-till-f",         cat: "postflop", label: "Bluff till F" },
  { id: "bluff-till-t",         cat: "postflop", label: "Bluff till T" },
  { id: "bluff-till-r",         cat: "postflop", label: "Bluff till R" },
  { id: "bluff-raise-f",        cat: "postflop", label: "Bluff raise F" },
  { id: "bluff-raise-t",        cat: "postflop", label: "Bluff raise T" },
  { id: "bluff-raise-r",        cat: "postflop", label: "Bluff raise R" },
  { id: "bluff-xt-f",           cat: "postflop", label: "Bluff XT F" },
  { id: "bluff-xt-t",           cat: "postflop", label: "Bluff XT T" },
  { id: "bluff-xt-r",           cat: "postflop", label: "Bluff XT R" },
  { id: "merged",               cat: "postflop", label: "Merged" },
  { id: "polar",                cat: "postflop", label: "Polar" },
  { id: "bad-polar",            cat: "postflop", label: "Bad polar" },
  // postflop — bluffing
  { id: "bluffs-rivers",        cat: "postflop", label: "Bluffs rivers" },       // yes = over-bluffs river, no = big bets = nuts
  // postflop — cbet / float (merged: over-cbet no = overfolds; floats-wide no = fit-or-fold)
  { id: "pfr-oop-cbet",         cat: "postflop", label: "PFR OOP cbet" },
  { id: "over-cbet",            cat: "postflop", label: "Over cbet" },
  { id: "floats-wide",          cat: "postflop", label: "Floats wide" },
  // postflop — barrel / lead / limped-pot behaviour
  { id: "barrels-off",          cat: "postflop", label: "Barrels relentlessly" }, // yes = barrels, no = gives up on turn
  { id: "lead-limped",          cat: "postflop", label: "Lead limped" },
  { id: "sp-dis-board",         cat: "postflop", label: "SP dis board" },
  { id: "oop-protect",          cat: "postflop", label: "OOP protect" },
  { id: "check-oop-limped",     cat: "postflop", label: "Check OOP limped" },
  { id: "bet-merged-mwp",       cat: "postflop", label: "Bet merged mwp" },
  { id: "protected-block",      cat: "postflop", label: "Protected block" }, // yes = medium/protection, no = polar (nuts or bluff)
  // sizing
  { id: "preflop-sizing",       cat: "sizing",   label: "Preflop sizing" },
  { id: "3bet-sizing",          cat: "sizing",   label: "3bet sizing" },
  { id: "bsti",                 cat: "sizing",   label: "BSTI" },
  { id: "size-up-draws",        cat: "sizing",   label: "Size up with draws" },
  { id: "small-with-weak",      cat: "sizing",   label: "Small = weak" },
  { id: "overbets-nuts",        cat: "sizing",   label: "Sizes up with nuts" },
  // live
  { id: "tilts",                cat: "live",     label: "Tilts after losses" },
  { id: "timing-tells",         cat: "live",     label: "Timing tells" },
  { id: "snap-call-weak",       cat: "live",     label: "Snap-call = weak" },
  { id: "talks-when-strong",    cat: "live",     label: "Chatty = strong" },
  { id: "bluffcatch-losing",    cat: "live",     label: "Bluffcatch more losing" },
  { id: "force-squid",          cat: "live",     label: "Force squid" },
];
const TAG_CATS = ["preflop", "postflop", "sizing", "live"];
const TAG_BY_ID = Object.fromEntries(TENDENCY_TAGS.map((t) => [t.id, t]));

/* Auto-suggested exploits: map a set read to a concrete counter-strategy line.
   Keyed by tag id → { yes, no }. "yes" (green) = tendency confirmed present;
   "no" (red) = confirmed absent (only where the absence is itself exploitable).
   draw-size (3-colour) keys off "any" — any non-off state. Suggestions surface
   in the opponent's Exploits panel; Phil accepts or dismisses each. */
const EXPLOIT_RULES = {
  // preflop — opening / limping
  "open-too-wide":   { yes: "3-bet him wider IP — his opens are weak and he over-folds or plays face-up.",
                        no:  "His opens are tight — fold marginals to his raises, only continue with hands that beat a tight range." },
  "ep-range-limp":   { yes: "Iso-raise his EP limps big — he limps a whole range and folds the trash." },
  "attacks-limps":   { yes: "Don't limp behind him — he iso-raises limps. Limp-reraise your monsters, fold the rest.",
                        no:  "He doesn't iso limps — limp behind wider for cheap flops, no fear of a raise." },
  "limps-monster-ws":{ yes: "With a squid, his limp = a monster — never iso, fold to his limp-reraise.",
                        no:  "With a squid he doesn't slowplay monsters — his limps are wide/weak, iso big and pressure." },
  "limps-monster-ns":{ yes: "No squid, his limp = a monster — never iso, fold to his limp-reraise.",
                        no:  "Without a squid he doesn't slowplay monsters — his limps are wide/weak, iso big and pressure." },
  "lp-limp-weak":    { yes: "In limped pots, his limp-calls are weak — barrel him off flops and turns.",
                        no:  "LP limp-calls aren't weak — don't over-barrel him, he has real hands to call down with." },
  "lrr-bluff":       { yes: "His limp-reraises include bluffs — flat/call wider and re-jam value; his LRR range is polar.",
                        no:  "LRR = the nuts — fold everything but AA/KK to a limp-reraise." },
  "limp-wide-multiplier": { yes: "He chases the multiplier — iso big and value-bet, he over-commits with junk to hit it." },
  "can-4bet-light":  { yes: "His 4-bets aren't always strong — 5-bet jam your value and call wider IP.",
                        no:  "His 4-bets are the nuts — fold everything but AA/KK, no 5-bet bluffs." },
  "wide-cc":         { yes: "He cold-calls wide with a capped range — c-bet small and barrel turns.",
                        no:  "His CC range is tight/capped-strong — don't auto-cbet, his flats have real equity." },
  "limp-caller":     { yes: "Iso big and value-bet relentlessly — he limp-calls then plays fit-or-fold." },
  // preflop — 3bet / 4bet
  "3bet-linear":     { yes: "His 3-bet range is linear/value-heavy — fold your bluffs and don't spew; only continue with real hands." },
  "3bet-polar":      { yes: "His 3-bets are polar (nuts or air) — 4-bet-bluff and flat wider; a big chunk is bluff.",
                        no:  "3-bets aren't polar — treat them as linear/value, don't 4-bet-bluff, fold your bluff-catchers." },
  "3bet-bluff":      { yes: "His 3-bet range is mostly bluffs — 4-bet-jam wider for value, don't over-fold to his 3-bets.",
                        no:  "His 3-bets are value only — no bluffs to catch, fold marginals and don't 4-bet light." },
  "limps-are-weak":  { yes: "His limp range is weak — iso-raise big and barrel; he limps then folds to pressure.",
                        no:  "Limps aren't weak — respect them, don't over-iso; some are trap hands." },
  "ep-open-weak":    { yes: "His EP opens are weak — 3-bet wider IP, flat and outplay OOP; his opening range is capped.",
                        no:  "EP opens are strong/tight — fold marginals from LP, don't 3-bet-bluff him from EP." },
  "attack-limped-blinds": { yes: "He attacks limped pots from the blinds — expect a raise/lead when he's in the SB/BB; don't limp behind lightly.",
                        no:  "He doesn't attack limped pots from the blinds — limp behind wider when he's SB/BB." },
  "pfr-oop-cbet":    { yes: "As the OOP PFR he c-bets too much — float wide and take it away on the turn.",
                        no:  "As the OOP PFR he under-cbets — his checks are capped; stab when he checks." },
  "over-folds-3bet": { yes: "3-bet him light for the fold — he over-folds to 3-bets.", no: "Don't bluff-3bet — he doesn't fold. 3-bet for value only." },
  "3bets-light":     { yes: "Flat and 4-bet wider vs his 3-bets — they're light.",
                        no:  "His 3-bets are tight — fold marginals to his 3-bet, don't 4-bet-bluff." },
  "3bet-tight":      { yes: "His 3-bets are tight/value — fold marginal opens IP, only continue with hands that beat his value range.",
                        no:  "His 3-bet range isn't tight — 3-bets are wider than value; flat and 4-bet-bluff more." },
  // postflop grouped
  "station-f":  { yes: "Value-bet flops thin, never bluff the flop — he calls too light.",
                    no:  "He folds flops too often — bluff c-bet more, especially on dry boards." },
  "station-t":  { yes: "Keep value-betting turns, cut your bluffs — he calls turns down light.",
                    no:  "He folds turns too often — double-barrel your bluffs, turn is his weak point." },
  "station-r":  { yes: "Thin value-bet rivers, never bluff-shove — he's a sticky river caller.",
                    no:  "He folds rivers too often — triple-barrel your bluffs, especially on scare cards." },
  "ld-draws":   { yes: "His donk-leads are usually draws — raise or float and take it away by the river.",
                    no:  "His leads aren't draws — respect the lead, it's a made hand." },
  "ld-tp":      { yes: "His leads = top pair — call down or raise for value with better." },
  "ld-2p":      { yes: "His leads = two pair+ — respect it, don't stack off one pair." },
  "raise-nuts-f": { yes: "Flop raise = the nuts — fold your bluffs and bare one-pair.",
                      no:  "Flop raises aren't always the nuts — call/3-bet wider, some are bluffs or draws." },
  "raise-nuts-t": { yes: "Turn raise = the nuts — over-fold, don't pay it off.",
                      no:  "Turn raises aren't always the nuts — call wider, some are bluffs." },
  "raise-nuts-r": { yes: "River raise = the nuts — fold your bluff-catchers.",
                      no:  "River raises aren't always the nuts — call down with your bluff-catchers, some are bluffs." },
  "bluff-till-f": { yes: "He gives up after the flop — float the flop, take it away on the turn.",
                      no:  "He doesn't give up on the flop — expect turn barrels, don't float his flop bets lightly." },
  "bluff-till-t": { yes: "He fires flop-turn then quits — call two streets, the river check is a give-up.",
                      no:  "He doesn't quit on the turn — expect river barrels too, plan to call all three or fold turn." },
  "bluff-till-r": { yes: "He barrels all three then gives up — bluff-catch rivers wider.",
                      no:  "He doesn't triple-barrel — his river bets are value only, fold marginals to river bets." },
  "merged":       { yes: "He bets a merged range (thin value + medium) — his big bets aren't only nuts; raise thinner and call wider." },
  "polar":        { yes: "He bets polar (nuts or bluff) — bluff-catch with medium hands; they beat his bluffs and only lose to the nuts." },
  "bad-polar":    { yes: "He polarizes badly — too many bluffs / too-thin value. Call down wide and pick off the over-bluffs.",
                     no:  "He polarizes well — his big bets are balanced. Don't hero-call, respect the polarity." },
  // postflop singles
  "bluff-raise-f":    { yes: "Flop raises are often bluffs — call down or re-raise light.",
                          no:  "Flop raises are value only — fold marginals, no need to hero-call." },
  "bluff-raise-t":    { yes: "Turn raises are often bluffs — call down or re-raise light.",
                          no:  "Turn raises are value only — fold marginals, no hero-calls." },
  "bluff-raise-r":    { yes: "River raises are often bluffs — call down light, don't fold to the raise.",
                          no:  "River raises are value only — fold your bluff-catchers." },
  "bluff-xt-f":       { yes: "Check-then-bet on the flop is usually a bluff — call or raise.",
                          no:  "Flop check-then-bet is value — fold marginals when he checks then bets." },
  "bluff-xt-t":       { yes: "Check-flop then bet turn is usually a bluff — call or raise.",
                          no:  "Check-flop then bet turn is value — fold marginals when he takes that line." },
  "bluff-xt-r":       { yes: "Check-turn then bet river is usually a bluff — call down or raise.",
                          no:  "Check-turn then bet river is value — fold bluff-catchers, that line is nutted." },
  "over-cbet":        { yes: "He c-bets too much — float wide and check-raise; his c-bet range is weak.",
                        no:  "Fire c-bets relentlessly — he over-folds to c-bets." },
  "floats-wide":      { yes: "He floats flops light — barrel turns to punish the floats.",
                        no:  "C-bet every flop — he's fit-or-fold, folds unless he connects." },
  "bluffs-rivers":    { yes: "Bluff-catch rivers wider — he over-bluffs the river.",
                        no:  "When he bets big, fold everything but the nuts — big bets = value." },
  "barrels-off":      { yes: "He barrels relentlessly — don't fold decent bluff-catchers, let him fire into you.",
                        no:  "He gives up turns — float the flop, stab the turn when he checks." },
  "lead-limped":      { yes: "He leads limped pots — his lead range is capped, raise as bluff and value." },
  "sp-dis-board":     { yes: "He slowplays on disconnected/dry boards — his checks aren't always weak; don't over-barrel dry runouts, and let him do the betting.",
                          no:  "He doesn't slowplay dry boards — a check on a dry board means air. Stab flop when he checks." },
  "oop-protect":      { yes: "He bets OOP to protect — those bets are medium, not nutted; raise or float and pressure later streets.",
                          no:  "OOP bets aren't protection — they skew stronger. Don't spew-raise, call down and fold to further aggression." },
  "check-oop-limped": { yes: "He always checks OOP in limped pots — never leads. Stab flop when he checks; his check-calls are capped.",
                          no:  "He does lead OOP in limped pots — his leads are made hands, respect them and don't over-raise." },
  "bet-merged-mwp":   { yes: "He bets a merged range in multiway pots — thin value not just nuts; call down wider and raise thinner.",
                          no:  "His MWP bets are polar/strong — don't call thin, fold or raise for value." },
  "protected-block":  { yes: "His block bets are protection — medium-strength, not weak. Raise him for value with better, don't spew-bluff-raise.",
                        no:  "He doesn't block-bet — his river bets are polar (nuts or bluff). Bluff-catch mediums." },
  "limp-scale-ws":    { any: "With squid, his limp width is a tell — tighter than usual = trap, wider than usual = weak. Size iso relative to expected width." },
  "limp-scale-ns":    { any: "Without squid, his limp width is a tell — tighter than usual = trap, wider than usual = weak. Size iso relative to expected width." },
  // sizing
  "preflop-sizing":  { yes: "His preflop sizing is a tell — bigger = stronger. Adjust your continue range." },
  "3bet-sizing":     { yes: "His 3-bet sizing is a tell — read strength off the size and adjust your call/4-bet range." },
  "bsti":            { yes: "He bet-sizes small to induce raises — just call his smalls, don't raise. His big bets are the real value." },
  "size-up-draws":   { any: "He sizes up with draws — big bets on wet boards skew to draws, not made hands." },
  "overbets-nuts":   { yes: "His overbets are the nuts — fold bluff-catchers to the big sizing.",
                        no:  "His overbets aren't always the nuts — bluff-catch them, they're polarized with bluffs mixed in." },
  "small-with-weak": { yes: "His small bets are weak — raise them; save calls for his big bets.",
                        no:  "His small bets aren't weak — could be a trap or block. Don't spew-raise smalls." },
  // live
  "tilts":            { yes: "When he's stuck and tilting, widen value bets — he plays too many hands and pays off." },
  "timing-tells":     { yes: "Watch his timing — snap vs tank is a strength tell. Size bluffs and value to it." },
  "snap-call-weak":   { yes: "When he snap-calls, he's weak — fire the next street.",
                          no:  "His snap-calls aren't weak — could be a lock/blocker. Don't auto-fire the next street." },
  "talks-when-strong":{ yes: "When he gets chatty, he's strong — fold your marginal hands.",
                          no:  "Chattiness isn't a strength tell on him — could be talking when weak or bluffing. Don't fold to talk alone." },
  "bluffcatch-losing":{ yes: "When he's losing, he bluff-catches more — thin-value him wider and cut your bluffs." },
  "force-squid":      { yes: "He forces squid spots — expect wider gambling ranges; value-bet bigger, he pays off chasing." },
};

/* Compound-read exploit rules — fire only when ALL `keys` (each in
   "tagId:state" form, state = "yes" or "no") match the opponent's current
   reads. Merged into suggestedExploits() output above the single-read
   suggestions, tagged 🎯 in the UI. Each `id` is stable — used as the
   dismiss key ("cmp:<id>"). Every archetype below has been Phil-approved on
   real poker theory; do NOT add new ones without his sign-off (see
   feedback_poker_basics — cross-axis label similarity ≠ correlation). */
const COMPOUND_EXPLOIT_RULES = [
  { id: "wide-open-squeeze-target",
    label: "Wide opener + folds to 3-bets",
    keys: ["open-too-wide:yes", "over-folds-3bet:yes"],
    text: "Squeeze target. 3-bet-bluff him wider IP and from the blinds, especially with blockers. He opens wide, folds when re-raised." },
  { id: "one-and-done-cbetter",
    label: "One-and-done cbetter",
    keys: ["over-cbet:yes", "barrels-off:no"],
    text: "Fires reflex cbet then quits. Float ANY flop, stab turn when he checks with any equity, only fold to turn barrels." },
  { id: "wide-caller-sticky-flop",
    label: "Wide caller + sticky flop",
    keys: ["wide-cc:yes", "station-f:yes"],
    text: "Cold-calls wide preflop then calls flop with any pair/draw. Cbet SMALL on dry boards, barrel scare turns, don't triple-barrel." },
  { id: "two-street-station",
    label: "Two-street calling station",
    keys: ["station-f:yes", "station-t:yes"],
    text: "Calls flop AND turn light. Value-bet flop and turn thin with pair+, NEVER double-barrel bluff. Size up river for value." },
  { id: "three-street-station",
    label: "Three-street calling station",
    keys: ["station-f:yes", "station-t:yes", "station-r:yes"],
    text: "Sticky all three streets. Never bluff. Value-bet every street with any made hand, size up all three, weak top pair is a shove line." },
  { id: "frequent-bluff-raiser",
    label: "Frequent bluff-raiser (flop + turn)",
    keys: ["bluff-raise-f:yes", "bluff-raise-t:yes"],
    text: "Raises as a bluff on flop AND turn. Don't fold to raises — call down thin, re-raise mediums for value. Only respect river raises." },
  { id: "sizing-is-a-tell",
    label: "Sizing tells (both directions)",
    keys: ["overbets-nuts:yes", "small-with-weak:yes"],
    text: "Both sizes are reliable. Overbets = value, small = weak. Fold bluff-catchers to big sizings, raise smalls as bluffs, call mediums light." },
];

/* Reusable exploit archetypes — a shared library added onto any opponent from
   the Exploits panel. `abbr` is the short code shown on the front-page card;
   `text` is the full description revealed on tap/hover. */
const EXPLOIT_TEMPLATES = [
  { abbr: "EQF",  name: "Equity Fish",
    text: "Equity Fish — barrels only their real equity (straight draws, flush draws). Lacks SDV bluffs and spew bluffs." },
  { abbr: "MUB",  name: "Monster Under the Bed",
    text: "Monster Under the Bed — scared of scare-card turns; over-folds fearing a monster. Don't bet thin against them; barrel scare cards." },
  { abbr: "DHF",  name: "Draw Hyper-Focus",
    text: "Draw Hyper-Focus — loves bluffing when draws complete and hates bluff-catching then. When draws miss, hates bluffing and turns into a station." },
  { abbr: "UBOC", name: "Underbluff + Overcooler",
    text: "Underbluff + Overcooler — in polarized get-in spots they pure-jam their nutted hands (invulnerable) and underbluff with draws (e.g. 8s on 864). Most players default to this." },
  { abbr: "FL",   name: "Frontloading",
    text: "Frontloading — commits range/info early. Put them in spots where they end up face-up, then exploit the known range." },
  { abbr: "FPS",  name: "Fancy Play Syndrome",
    text: "Fancy Play Syndrome — makes crazy plays way out of the ordinary; over-levels themselves." },
  { abbr: "BBS",  name: "Bad Beat Sizing",
    text: "Bad Beat Sizing — when the story says weak but they rivered a nutted hand, they size up. The sizing is inconsistent with the story — read the tell and fold." },
  { abbr: "TAL",  name: "Truth After Lie",
    text: "Truth After Lie — slow-plays, then suddenly sizes up for value. When a mostly toy-game (8s) range wants to block-bet but instead sizes up, it's the slow-played nutted (Ks) hand." },
];
