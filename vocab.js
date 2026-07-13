/* Shared vocabulary — stable ids; the future exploit engine aggregates these. */

const POSITIONS = ["U8", "U7", "U6", "HJ", "CO", "BN", "SB", "BB", "STD"];
const STREETS = ["pre", "flop", "turn", "river"];
const ACTS = ["fold", "check", "call", "bet", "raise", "3bet", "limp", "jam"];
const ACTS_POST = ["fold", "check", "call", "bet", "raise"];
const SIZED_ACTS = ["bet", "raise", "3bet", "4bet", "5bet"];
const SIZES_OPEN = ["30k", "40k", "50k", "60k", "Jam"];   // open raise: chip amounts
const SIZES_3BET = ["3x", "4x", "5x", "Jam"];              // 3bet: multipliers
const SIZES_4BET = ["2x", "2.5x", "3x", "Jam"];            // 4bet/5bet: multipliers
const SIZES_POST = ["33%", "50%", "66%", "75%", "pot", "over", "Jam"];

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
const TENDENCY_TAGS = [
  // preflop — opening
  { id: "open-too-wide",        cat: "preflop",  label: "Open too wide" },
  { id: "ep-range-limp",        cat: "preflop",  label: "EP range limp" },
  { id: "limps-monsters",       cat: "preflop",  label: "Limps monsters" },
  { id: "attacks-limps",        cat: "preflop",  label: "Attacks limps" },
  // preflop — limping / squid
  { id: "limp-caller",          cat: "preflop",  label: "Limp-caller" },
  { id: "limp-wide-squid",      cat: "preflop",  label: "nS wide limp" },
  { id: "limp-wide-multiplier", cat: "preflop",  label: "Goes for multipliers" },
  { id: "wide-cc",              cat: "preflop",  label: "Wide CC" },
  // preflop — 3bet / 4bet (3bet Linear/Polar is a grouped bubble row)
  { id: "3bet-linear",          cat: "preflop",  label: "3bet linear" },
  { id: "3bet-polar",           cat: "preflop",  label: "3bet polar" },
  { id: "3bets-light",          cat: "preflop",  label: "3bets light" },
  { id: "can-4bet-light",       cat: "preflop",  label: "Can 4bet light" },
  { id: "over-folds-3bet",      cat: "preflop",  label: "Over-folds to 3bet" },
  { id: "never-folds-pre",      cat: "preflop",  label: "Never folds pre" },
  // postflop — grouped bubbles
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
  { id: "merged",               cat: "postflop", label: "Merged" },
  { id: "polar",                cat: "postflop", label: "Polar" },
  { id: "bad-polar",            cat: "postflop", label: "Bad polar" },
  // postflop — bluffing
  { id: "bluff-raise-flop",     cat: "postflop", label: "Bluff raise flop" },
  { id: "bluff-xt",             cat: "postflop", label: "Bluff XT" },
  { id: "bluffs-rivers",        cat: "postflop", label: "Bluffs rivers" },
  // postflop — cbet / float
  { id: "over-cbet",            cat: "postflop", label: "Over cbet" },
  { id: "over-folds-cbet",      cat: "postflop", label: "Over-folds to cbet" },
  { id: "fit-or-fold",          cat: "postflop", label: "Fit-or-fold" },
  { id: "floats-wide",          cat: "postflop", label: "Floats wide" },
  // postflop — made-hand strength
  { id: "barrels-off",          cat: "postflop", label: "Barrels relentlessly" },
  { id: "gives-up-turn",        cat: "postflop", label: "Gives up on turn" },
  { id: "never-bluffs",         cat: "postflop", label: "Big bets = nuts" },
  // sizing
  { id: "preflop-sizing",       cat: "sizing",   label: "Preflop sizing" },
  { id: "3bet-sizing",          cat: "sizing",   label: "3bet sizing" },
  { id: "bsti",                 cat: "sizing",   label: "BSTI" },
  { id: "draw-size",            cat: "sizing",   label: "Draw size" },
  { id: "small-with-weak",      cat: "sizing",   label: "Small = weak" },
  { id: "overbets-nuts",        cat: "sizing",   label: "Sizes up with nuts" },
  { id: "min-raise-nuts",       cat: "sizing",   label: "Min-raise = nuts" },
  // live
  { id: "tilts",                cat: "live",     label: "Tilts after losses" },
  { id: "timing-tells",         cat: "live",     label: "Timing tells" },
  { id: "snap-call-weak",       cat: "live",     label: "Snap-call = weak" },
  { id: "talks-when-strong",    cat: "live",     label: "Chatty = strong" },
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
  // preflop
  "open-too-wide":   { yes: "3-bet him wider IP — his opens are weak and he over-folds or plays face-up." },
  "ep-range-limp":   { yes: "Iso-raise his EP limps big — he limps a whole range and folds the trash." },
  "attacks-limps":   { yes: "Don't limp behind him — he iso-raises limps. Limp-reraise your monsters, fold the rest." },
  "limps-monsters":  { yes: "When he limps then re-raises, fold marginal hands — the limp was a trap." },
  "limp-wide-squid": { yes: "He limps wide when there's no squid — iso-raise large to isolate and punish the weak limps." },
  "limp-wide-multiplier": { yes: "He chases the multiplier — iso big and value-bet, he over-commits with junk to hit it." },
  "can-4bet-light":  { yes: "His 4-bets aren't always strong — 5-bet jam your value and call wider IP." },
  "wide-cc":         { yes: "He cold-calls wide with a capped range — c-bet small and barrel turns." },
  "limp-caller":     { yes: "Iso big and value-bet relentlessly — he limp-calls then plays fit-or-fold." },
  "3bet-linear":     { yes: "His 3-bet range is linear/value-heavy — fold your bluffs and don't spew; only continue with real hands." },
  "3bet-polar":      { yes: "His 3-bets are polar (nuts or air) — 4-bet-bluff and flat wider; a big chunk is bluff." },
  "over-folds-3bet": { yes: "3-bet him light for the fold — he over-folds to 3-bets.", no: "Don't bluff-3bet — he doesn't fold. 3-bet for value only." },
  "never-folds-pre": { yes: "Never bluff-3bet him — only raise for value. He calls everything pre." },
  "3bets-light":     { yes: "Flat and 4-bet wider vs his 3-bets — they're light." },
  // postflop grouped
  "station-f":  { yes: "Value-bet flops thin, never bluff the flop — he calls too light." },
  "station-t":  { yes: "Keep value-betting turns, cut your bluffs — he calls turns down light." },
  "station-r":  { yes: "Thin value-bet rivers, never bluff-shove — he's a sticky river caller." },
  "ld-draws":   { yes: "His donk-leads are usually draws — raise or float and take it away by the river." },
  "ld-tp":      { yes: "His leads = top pair — call down or raise for value with better." },
  "ld-2p":      { yes: "His leads = two pair+ — respect it, don't stack off one pair." },
  "raise-nuts-f": { yes: "Flop raise = the nuts — fold your bluffs and bare one-pair." },
  "raise-nuts-t": { yes: "Turn raise = the nuts — over-fold, don't pay it off." },
  "raise-nuts-r": { yes: "River raise = the nuts — fold your bluff-catchers." },
  "bluff-till-f": { yes: "He gives up after the flop — float the flop, take it away on the turn." },
  "bluff-till-t": { yes: "He fires flop-turn then quits — call two streets, the river check is a give-up." },
  "bluff-till-r": { yes: "He barrels all three then gives up — bluff-catch rivers wider." },
  "merged":       { yes: "He bets a merged range (thin value + medium) — his big bets aren't only nuts; raise thinner and call wider." },
  "polar":        { yes: "He bets polar (nuts or bluff) — bluff-catch with medium hands; they beat his bluffs and only lose to the nuts." },
  "bad-polar":    { yes: "He polarizes badly — too many bluffs / too-thin value. Call down wide and pick off the over-bluffs." },
  // postflop singles
  "bluff-raise-flop": { yes: "His flop raises are often bluffs — call down or re-raise light." },
  "bluff-xt":         { yes: "Check-flop-then-bet-turn from him is usually a bluff — call or raise." },
  "over-cbet":        { yes: "He c-bets too much — float wide and check-raise; his c-bet range is weak." },
  "fit-or-fold":      { yes: "C-bet every flop — he folds unless he connects." },
  "over-folds-cbet":  { yes: "Fire c-bets relentlessly — he over-folds to c-bets." },
  "floats-wide":      { yes: "He floats flops light — barrel turns to punish the floats." },
  "bluffs-rivers":    { yes: "Bluff-catch rivers wider — he over-bluffs the river." },
  "never-bluffs":     { yes: "When he bets big, fold everything but the nuts — big bet = value." },
  "barrels-off":      { yes: "He barrels relentlessly — don't fold decent bluff-catchers, let him fire into you." },
  "gives-up-turn":    { yes: "He gives up turns — float the flop, stab the turn when he checks." },
  // sizing
  "preflop-sizing":  { yes: "His preflop sizing is a tell — bigger = stronger. Adjust your continue range." },
  "3bet-sizing":     { yes: "His 3-bet sizing is a tell — read strength off the size and adjust your call/4-bet range." },
  "draw-size":       { any: "His bet size reveals draws vs made hands — use it to decide turns and rivers." },
  "overbets-nuts":   { yes: "His overbets are the nuts — fold bluff-catchers to the big sizing." },
  "small-with-weak": { yes: "His small bets are weak — raise them; save calls for his big bets." },
  "min-raise-nuts":  { yes: "His min-raises are the nuts — fold everything marginal." },
  // live
  "tilts":            { yes: "When he's stuck and tilting, widen value bets — he plays too many hands and pays off." },
  "timing-tells":     { yes: "Watch his timing — snap vs tank is a strength tell. Size bluffs and value to it." },
  "snap-call-weak":   { yes: "When he snap-calls, he's weak — fire the next street." },
  "talks-when-strong":{ yes: "When he gets chatty, he's strong — fold your marginal hands." },
  "force-squid":      { yes: "He forces squid spots — expect wider gambling ranges; value-bet bigger, he pays off chasing." },
};
