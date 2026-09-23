/* Shared vocabulary — stable ids; the future exploit engine aggregates these. */

/* Seats in preflop acting order. "U<n>" numbers the under-the-gun seats down
   from the table size, so an 8-handed ring opens U8 U7 and a 9-handed one adds
   U9 ahead of them. STD is the UTG seat — the straddle sits there but acts
   last preflop and third postflop. */
const POSITIONS = ["U9", "U8", "U7", "U6", "HJ", "CO", "BN", "SB", "BB", "STD"];
/* The same seats in *postflop* order — the blinds first and the straddle third,
   which is the one seat the two orders disagree about. Checked against the flop
   action order on the 103 three-bet hands that have a flop: they agree on 102,
   and the one that disagrees is a hand whose flop check simply wasn't recorded,
   so the seat map is the better of the two. Most 3-bets never see a flop at
   all, which is why position is read off this rather than off the action. */
const POSITIONS_POST = ["SB", "BB", "STD", "U9", "U8", "U7", "U6", "HJ", "CO", "BN"];
const STREETS = ["pre", "flop", "turn", "river"];
const SIZED_ACTS = ["bet", "raise", "3bet", "4bet", "5bet"];
const SIZES_OPEN = ["30k", "40k", "50k", "60k", "Jam"];   // open raise: chip amounts
const SIZES_3BET = ["3x", "4x", "5x", "Jam"];              // 3bet: multipliers
const SIZES_4BET = ["2x", "2.5x", "3x", "Jam"];            // 4bet/5bet: multipliers
const SIZES_POST = ["33%", "50%", "66%", "75%", "pot", "Jam"];

/* Sizing tallies: which bet size a player picks, by street and by whether the
   hand turned out to be value or a bluff. Not a read — a read is one state and
   this is a frequency, so each observation is stored as its own timestamp.
   Deliberately its own ladder, not SIZES_POST: overbets are the whole point of
   watching this, and 75%/pot/Jam don't separate a 1.5x from a shove. */
const SIZING_STEPS = [
  { id: "33",  label: "B33"  },
  { id: "50",  label: "B50"  },
  { id: "66",  label: "B66"  },
  { id: "75",  label: "B75"  },
  { id: "100", label: "B100" },
  { id: "150", label: "B150" },
  /* Not a rung: the top of the ladder is a shove. He is either all in or he is
     bigger than any size worth naming, and both answer the same question. */
  { id: "jam", label: "Jam" },
];
/* Raises get their own rows rather than being folded in with the bets: a raise
   is a different decision from a bet, and the same rung means a different thing
   on it. The three streets are combined into one value row and one bluff row —
   a villain raises a fraction as often as he bets, and split three ways every
   cell reads 0 or 1; the per-street split is still kept and sits behind the
   row label. The ladder is shared on purpose — a raise is priced as the share
   of the pot he added *on top of the call* — what the B33/B50/B66 buttons
   themselves compute. A raise in x-of-the-bet has no fixed rung, so don't
   label these with one (Phil, v183).
   Row ids are stable: the bet rows keep theirs. */
const SIZING_ROWS = [
  { id: "flop-v",  street: "Flop",  kind: "V", mode: "bet" },
  { id: "turn-v",  street: "Turn",  kind: "V", mode: "bet" },
  { id: "river-v", street: "River", kind: "V", mode: "bet" },
  { id: "flop-b",  street: "Flop",  kind: "B", mode: "bet" },
  { id: "turn-b",  street: "Turn",  kind: "B", mode: "bet" },
  { id: "river-b", street: "River", kind: "B", mode: "bet" },
  { id: "raise-v", label: "Value",  kind: "V", mode: "raise" },
  { id: "raise-b", label: "Bluff",  kind: "B", mode: "raise" },
];
const SIZING_RAISE_STREETS = ["flop", "turn", "river"];
/* 3-bets get a block of their own: two rows, out of position and in, priced the
   same way a raise is. No Jam column — nothing on record is written as a
   preflop all-in, and every 3-bet over 150% of the pot would land in one, so a
   Jam column here would read as shoves that never happened. Over 150% goes to
   B150 instead (Phil). Cards aren't needed for the count, only for the chart
   behind it, so these rows see far more hands than the postflop grid. */
const SIZING_3BET_STEPS = SIZING_STEPS.filter((x) => x.id !== "jam");
const SIZING_3BET_ROWS = [
  { id: "3bet-oop", label: "3bet OOP" },
  { id: "3bet-ip",  label: "3bet IP"  },
];
const SIZING_STEP_BY_ID = Object.fromEntries(SIZING_STEPS.map((x) => [x.id, x]));
const SIZING_ROW_BY_ID = Object.fromEntries(SIZING_ROWS.map((r) => [r.id, r]));
const SIZING_3BET_ROW_BY_ID = Object.fromEntries(SIZING_3BET_ROWS.map((r) => [r.id, r]));

const RANKS = "AKQJT98765432";
const SUITS = [
  { id: "s", sym: "♠", cls: "cs" },   // spade  — white
  { id: "h", sym: "♥", cls: "ch" },   // heart  — red
  { id: "d", sym: "♦", cls: "cd" },   // diamond— blue
  { id: "c", sym: "♣", cls: "cc" },   // club   — green
];

/* Curated tendency reads — three-state (Yes=green / No=red / off) toggles in
   the opponent view; ids are stable, labels display-only. Some postflop reads
   are shown as grouped bubbles (Station/Lead/Raise nuts/Bluff till) — see
   READ_LAYOUT in app.js; their labels here are the names shown on chips. */
/* Yes/No axis pairs — one read holds both directions. Legacy separate tags
   (over-folds-cbet, fit-or-fold, gives-up-turn, never-bluffs, limps-monsters)
   auto-migrate onto these survivors in app.js. Limps monsters is now a grouped
   bubble row (wS / nS). */
/* Reads with `kind: "choice"` are one-of-N buttons (e.g. Tight / Normal /
   Wide), not yes/no cycles. They store the chosen option id in o.reads[id];
   tapping the active option clears the read. */
const TENDENCY_TAGS = [
  // preflop — opening
  { id: "open-too-wide",        cat: "preflop",  label: "Open too wide" },
  { id: "ep-range-limp",        cat: "preflop",  label: "EP range limp" },
  // limps-monster-ws/ns are retired — kept only so old values stay readable.
  { id: "limps-monster-ws",     cat: "preflop",  label: "Limps monster wS" },
  { id: "limps-monster-ns",     cat: "preflop",  label: "Limps monster nS" },
  { id: "attacks-limps",        cat: "preflop",  label: "Attacks limps" },
  { id: "attack-limped-blinds", cat: "preflop",  label: "Attack limped blinds" },
  { id: "ep-open-weak",         cat: "preflop",  label: "EP Open weak" },
  { id: "open-small-pp-ep",     cat: "preflop",  label: "Open smallPP EP" },
  { id: "limps-are-weak",       cat: "preflop",  label: "Limps are weak" },
  { id: "open-range-w1s",       cat: "preflop",  label: "Open range w1S" },
  // first-raise-ns/ws and lrr-latest-ns/ws are retired — the V/B rows replaced them.
  { id: "first-raise-ns",       cat: "preflop",  label: "1st R — nS",     kind: "position" },
  { id: "first-raise-ws",       cat: "preflop",  label: "1st R — wS",     kind: "position" },
  { id: "first-raise-v-ns",     cat: "preflop",  label: "1st R V — nS",   kind: "position" },
  { id: "first-raise-v-ws",     cat: "preflop",  label: "1st R V — wS",   kind: "position" },
  { id: "first-raise-b-ns",     cat: "preflop",  label: "1st R B — nS",   kind: "position" },
  { id: "first-raise-b-ws",     cat: "preflop",  label: "1st R B — wS",   kind: "position" },
  { id: "lrr-latest-ns",        cat: "preflop",  label: "LRR — nS", kind: "position" },
  { id: "lrr-latest-ws",        cat: "preflop",  label: "LRR — wS", kind: "position" },
  { id: "lrr-v-ns",             cat: "preflop",  label: "LRR V — nS",     kind: "position" },
  { id: "lrr-v-ws",             cat: "preflop",  label: "LRR V — wS",     kind: "position" },
  { id: "lrr-b-ns",             cat: "preflop",  label: "LRR B — nS",     kind: "position" },
  { id: "lrr-b-ws",             cat: "preflop",  label: "LRR B — wS",     kind: "position" },
  // preflop — limping / squid (limp-caller + lp-limp-weak are retired — see RETIRED_TAG_IDS)
  { id: "limp-caller",          cat: "preflop",  label: "Limp-caller" },
  { id: "lp-limp-weak",         cat: "preflop",  label: "Lp limp = weak" },
  { id: "preflop-style",        cat: "preflop",  label: "Preflop",        kind: "choice", options: [["gto", "GTO"], ["exp", "EXP"]] },
  { id: "limp-scale-ws",        cat: "preflop",  label: "Limp with wS",   kind: "choice", options: [["tight", "Tight"], ["normal", "Normal"], ["wide", "Wide"]] },
  { id: "limp-scale-ns",        cat: "preflop",  label: "Limp with nS",   kind: "choice", options: [["tight", "Tight"], ["normal", "Normal"], ["wide", "Wide"]] },
  { id: "limp-wide-multiplier", cat: "preflop",  label: "Goes for multipliers" },
  { id: "wide-cc",              cat: "preflop",  label: "Wide CC" },
  // preflop — 3bet / 4bet (linear/polar/bluff are retired — see RETIRED_TAG_IDS)
  { id: "3bet-linear",          cat: "preflop",  label: "3bet linear" },
  { id: "3bet-polar",           cat: "preflop",  label: "3bet polar" },
  { id: "3bet-bluff",           cat: "preflop",  label: "3bet bluff" },
  { id: "3bets-light",          cat: "preflop",  label: "3bets light" },
  { id: "3bet-tight",           cat: "preflop",  label: "3bet tight" },
  { id: "can-4bet-light",       cat: "preflop",  label: "Can 4bet light" },
  { id: "over-folds-3bet",      cat: "preflop",  label: "Over-folds to 3bet" },
  { id: "lrr-bluff",            cat: "preflop",  label: "Lrr bluff" },
  // postflop — grouped bubbles (Station/Lead/Raise-nuts/Bluff-till/Range/Bluff-raise/B3b/Bluff-XT)
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
  { id: "have-b3b-v-f",        cat: "postflop", label: "B3b V F" },
  { id: "have-b3b-b-f",        cat: "postflop", label: "B3b B F" },
  { id: "bluff-xt-f",           cat: "postflop", label: "Bluff XT F" },
  { id: "bluff-xt-t",           cat: "postflop", label: "Bluff XT T" },
  { id: "bluff-xt-r",           cat: "postflop", label: "Bluff XT R" },
  /* The other half of the same check-flop-bet-turn line: yes = he fires it
     thin for value too, so Bluff XT alone doesn't tell you to call. */
  { id: "thin-xt-t",            cat: "postflop", label: "Thin XT T" },
  { id: "merged",               cat: "postflop", label: "Merged" },
  { id: "polar",                cat: "postflop", label: "Polar" },
  { id: "bad-polar",            cat: "postflop", label: "Bad polar" },
  // postflop — bluffing
  { id: "bluffs-rivers",        cat: "postflop", label: "Bluffs rivers" },       // yes = over-bluffs river, no = big bets = nuts
  // postflop — cbet / float (merged: over-cbet no = overfolds; floats-wide no = fit-or-fold)
  { id: "pfr-oop-cbet",         cat: "postflop", label: "PFR OOP cbet" },
  { id: "over-cbet",            cat: "postflop", label: "Over cbet" },
  { id: "floats-wide",          cat: "postflop", label: "Flop overfloat" },
  { id: "cb-light-mwp",         cat: "postflop", label: "Cb Light MWP" },
  { id: "pfc-b-light-mwp",      cat: "postflop", label: "PFC B Light MWP" },
  // postflop — barrel / lead / limped-pot behaviour
  { id: "barrels-off",          cat: "postflop", label: "Barrels relentlessly" }, // yes = barrels, no = gives up on turn
  { id: "lead-limped",          cat: "postflop", label: "Lead limped" },
  { id: "sp-dis-board",         cat: "postflop", label: "SP dis board" },
  { id: "oop-protect",          cat: "postflop", label: "OOP protect" },
  { id: "protect-disadv-board", cat: "postflop", label: "Protect DisAdv. Board" },
  /* Bf = bet-fold. The other half of the protection bet on a board that
     favours the caller: he bets it, and a raise is the end of the hand. */
  { id: "f-bf-disadv-board",   cat: "postflop", label: "Bf" },
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
  { id: "inelastic-sizing",     cat: "sizing",   label: "Inelastic sizing" },
  // live
  { id: "tilts",                cat: "live",     label: "Tilts after losses" },

  /* Phil's postflop exploit tree, 2026-09-22 — one read per slot in the
     Postflop general / Flop / Turn / River outline. Placement is READ_LAYOUT.
     `stat` reads hold the number off his HUD, not a 0-100 feel. */
  // postflop general — multiway limped pot
  { id: "mwl-oop-probe",  cat: "postflop", label: "Probe OOP",       kind: "tally",  options: [["have", "Have"], ["rangex", "RangeX"], ["draw", "Draw"], ["merge", "Merge"], ["wktp", "WKTp"], ["topp", "TopP+"]] },
  { id: "mwl-xr",         cat: "postflop", label: "xR",              kind: "tally",  options: [["strong", "Strong"], ["bluff", "Bluff"]] },
  { id: "mwl-ip-stab",    cat: "postflop", label: "IP stab",         kind: "choice", options: [["merge", "Merge"], ["air", "Air"]] },
  // flop
  { id: "f-cbet-freq",    cat: "postflop", label: "Cbet freq",       kind: "stat", calc: "cbet" },
  { id: "f-fold-to-xr",   cat: "postflop", label: "Fold to xR",      kind: "stat", calc: "foldXr" },
  { id: "f-oop-x-range",  cat: "postflop", label: "Check OOP",       kind: "stat", calc: "checkOop" },
  { id: "f-xr-freq-pfr",  cat: "postflop", label: "xR freq",         kind: "stat", calc: "xrPfr" },
  { id: "fold-cbet-f",    cat: "postflop", label: "Fold flop cbet",  kind: "stat", calc: "foldCbF" },
  { id: "fold-cbet-t",    cat: "postflop", label: "Fold turn cbet",  kind: "stat", calc: "foldCbT" },
  { id: "fold-cbet-r",    cat: "postflop", label: "Fold river cbet", kind: "stat", calc: "foldCbR" },
  { id: "f-xr-freq-pfc",  cat: "postflop", label: "xR freq",         kind: "stat", calc: "xrPfc" },
  { id: "punchbag-f-pfc", cat: "postflop", label: "Punch bag" },
  /* Floating in and out of position are different plays, not one habit at two
     prices: OOP he has to lead or check-raise the turn to ever win it, IP the
     float is free when checked to. `floats-wide` stays the one-line summary. */
  { id: "f-float-oop",    cat: "postflop", label: "Float OOP" },
  { id: "f-float-ip",     cat: "postflop", label: "Float IP" },
  // turn
  { id: "t-barrel2-freq", cat: "postflop", label: "2nd barrel freq", kind: "stat", calc: "barrel" },
  { id: "t-fold-to-xr", cat: "postflop", label: "Fold to xR", kind: "stat", calc: "foldXrT" },
  { id: "t-bluff-hands",  cat: "postflop", label: "Bluffs",          kind: "tally",  options: [["air", "Air"], ["equity", "Equity"], ["sdv", "SDV"]] },
  { id: "t-call-range",   cat: "postflop", label: "T call range",    kind: "tally",  options: [["2ndp", "2ndP"], ["sd", "SD"], ["wfd", "wFD"], ["lt3rdp", "<3rdP"]] },
  { id: "punchbag-t-pfr", cat: "postflop", label: "Punch bag" },
  { id: "t-hero-fold",    cat: "postflop", label: "Can Hero Fold?" },
  /* He cbet the flop and checked the turn: yes = that check is the hand over,
     so stab it. No = he checks turns he intends to keep playing, and the stab
     runs into a check-raise. Narrower than the complement of 2nd barrel freq,
     which also holds the turns he folded or called a lead on. */
  { id: "t-cb-gu",        cat: "postflop", label: "Cb GU" },
  /* The turn brought a flush and he bet anyway: yes = that bet is a made hand
     charging the draw, not a barrel, so raising it as a bluff is burning money. */
  { id: "t-protect-flush", cat: "postflop", label: "Protect T Flush" },
  { id: "t-probe",        cat: "postflop", label: "Probe T",         kind: "stat", calc: "probeT" },
  { id: "t-bet-vol",      cat: "postflop", label: "Bet vol",         kind: "choice", options: [["high", "High"], ["low", "Low"]] },
  { id: "t-call-style",   cat: "postflop", label: "Turn call",       kind: "choice", options: [["absv", "AbsV"], ["wide", "Wide"]] },
  { id: "have-lead-t",    cat: "postflop", label: "Have Lead",       kind: "tally",  options: [["draw", "Draw"], ["flush", "Flush"], ["strong", "Strong"]] },
  // river
  { id: "r-bluff-lines",  cat: "postflop", label: "Bluff lines (can?)", kind: "tally", options: [["bbb", "BBB"], ["bxb", "BXB"], ["xbb", "XBB"], ["xxb", "XXB"]] },
  { id: "r-bluff-hands",  cat: "postflop", label: "Bluff hands",     kind: "tally",  options: [["fd", "FD"], ["oesd", "OESD"], ["air", "Air"], ["ahigh", "A-high"]] },
  { id: "r-barrel3-freq", cat: "postflop", label: "3rd barrel freq", kind: "stat", calc: "barrelR" },
  { id: "r-af",           cat: "postflop", label: "River AF",        kind: "stat", unit: "", calc: "riverAf" },
  { id: "r-bluff-bal",    cat: "postflop", label: "Bluff balance",   kind: "choice", options: [["overbluff", "Overbluff"], ["underbluff", "Underbluff"]] },
  /* The value-side counterpart to the bluff reads: does he ever bet a hand that
     only beats a bluff-catcher, or is a river bet always two pair plus? */
  { id: "r-thin",         cat: "postflop", label: "Have thin?" },
  { id: "r-traps",        cat: "postflop", label: "Have traps?" },
  /* The other thing a river check from the preflop raiser can mean: yes = he is
     willing to give up with no showdown value, so his river bets are that much
     more often real. */
  { id: "r-can-x-nsd",    cat: "postflop", label: "Can X nSD" },
  { id: "punchbag-r-pfr", cat: "postflop", label: "Punch bag" },
  { id: "r-fold-bal",     cat: "postflop", label: "Fold balance",    kind: "choice", options: [["overfold", "Overfold"], ["underfold", "Underfold"]] },
  { id: "r-to-sizing",    cat: "postflop", label: "To sizing",       kind: "choice", options: [["elastic", "Elastic"], ["inelastic", "Inelastic"]] },
  { id: "r-bet-vol",      cat: "postflop", label: "Bet vol",         kind: "choice", options: [["high", "High"], ["low", "Low"]] },
  { id: "r-can-raise",    cat: "postflop", label: "Can raise?",      kind: "tally",  options: [["bluff", "Bluff"], ["thin", "Thin"]] },
  { id: "r-call-range",   cat: "postflop", label: "Call range",      kind: "choice", options: [["wide", "Wide"], ["tight", "Tight"]] },
  { id: "r-call-hands",   cat: "postflop", label: "Bluff catch",     kind: "tally",  options: [["2ndp", "2ndP"], ["sd", "SD"], ["wfd", "wFD"], ["lt3rdp", "<3rdP"]] },
  { id: "have-lead-r",    cat: "postflop", label: "Have Lead",       kind: "tally",  options: [["draw", "Draw"], ["flush", "Flush"], ["strong", "Strong"]] },
  { id: "timing-tells",         cat: "live",     label: "Timing tells" },
  { id: "snap-call-weak",       cat: "live",     label: "Snap-call = weak" },
  { id: "talks-when-strong",    cat: "live",     label: "Chatty = strong" },
  { id: "bluffcatch-losing",    cat: "live",     label: "Bluffcatch more losing" },
  { id: "force-squid",          cat: "live",     label: "Force squid" },
];
/* Player archetype — Phil sets it manually and it themes the opponent's row
   on the list plus a pill in the detail header. Its id is `plain-reg` because
   `reg` has belonged to ABC reg since the first build and type ids are never
   renamed. Tight passive fish is a new id rather than the retired `tight-fish`,
   which one opponent still carries: reusing it would relabel him without Phil
   saying so.
   Colours: on the list a type shows as a 6px stripe and an 8–14% wash, so the
   only thing carrying it is hue — two types a shade apart are two types you
   cannot tell apart at arm's length, which is what happened to Station fish
   beside Loose fish (Phil, v203). So every type now owns a hue of its own and
   no two sit within about 50° of each other: cyan, green, pink, violet and
   lemon for the fish, then orange, blue, red and gray for the regs. The split
   is deliberate — the fish run bright and saturated, the reg block runs darker
   and cooler, so which family a row belongs to reads before the colour does.
   Lightness is not doing any work here on purpose: it is the first thing a
   6px stripe throws away. */
const PLAYER_TYPES = [
  { id: "whale",        label: "Whale",        icon: "🐋", color: "#35c2d8" },
  { id: "loose-fish",   label: "Loose fish",   icon: "🐟", color: "#4fbf5a" },
  { id: "station-fish", label: "Station fish", icon: "☎️", color: "#e06fa6" },
  { id: "aggro-fish",   label: "Aggro fish",   icon: "💥", color: "#8f5fe0" },
  { id: "tight-passive-fish", label: "Tight passive fish", icon: "🐡", color: "#d9d24d" },
  { id: "plain-reg",    label: "Reg",          icon: "👤", color: "#e08a3c" },
  { id: "reg",          label: "ABC reg",      icon: "🃏", color: "#4f7fdf" },
  { id: "good-reg",     label: "Good reg",     icon: "🦈", color: "#d64848" },
  { id: "tight-reg",    label: "Tight reg",    icon: "🔒", color: "#7a8496" },
];
/* No longer offered, but anyone still carrying one keeps their badge and can
   re-pick or Clear — dropping the entry would leave the id set and unclearable.
   Both wear the same muted taupe (v203): a retired badge is not one of the nine
   hues, so a row carrying one reads as "set to something that is no longer on
   the list" rather than borrowing the look of a type it is not — Fish was the
   same orange Reg wears now, and Tight fish the same yellow as Tight passive
   fish. */
const RETIRED_PLAYER_TYPES = [
  { id: "fish",       label: "Fish",       icon: "🐠", color: "#8b8378" },
  { id: "tight-fish", label: "Tight fish", icon: "🎣", color: "#8b8378" },
];
const PLAYER_TYPE_BY_ID = Object.fromEntries(
  PLAYER_TYPES.concat(RETIRED_PLAYER_TYPES).map((t) => [t.id, t]));
/* Retired reads: no longer offered, but an opponent who still holds one sees
   it under "Other" as "(retired)" so it can be cleared — never silently dropped. */
const RETIRED_TAG_IDS = new Set(["3bet-linear", "3bet-polar", "3bet-bluff", "limp-caller", "lp-limp-weak",
  "first-raise-ns", "first-raise-ws", "lrr-latest-ns", "lrr-latest-ws",
  "limps-monster-ws", "limps-monster-ns"]);
const TAG_BY_ID = Object.fromEntries(TENDENCY_TAGS.map((t) => [t.id, t]));

/* Auto-suggested exploits: map a set read to a concrete counter-strategy line.
   Keyed by tag id → { yes, no }. "yes" (green) = tendency confirmed present;
   "no" (red) = confirmed absent (only where the absence is itself exploitable).
   Position/choice reads key off "any" — any set value. Suggestions surface
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
  "open-small-pp-ep":{ yes: "Opens small pairs from EP — his EP opens include 22–99, so his range is wider/weaker than nut-heavy. 3-bet IP, set-mine small pairs against him deep." },
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
  "inelastic-sizing": { yes: "His fold frequency doesn't change with your sizing — size up big for value and down small for bluffs, both work.",
                        no:  "He is elastic — folds more to big bets. Use small sizings when you want a call, big sizings for folds." },
  "open-range-w1s":   { yes: "With 1 squid he opens wider than usual — 3-bet him lighter IP, defend blinds wider, expect junk in his range.",
                        no:  "With 1 squid he opens tighter than usual — respect his opens, fold marginal 3-bet-bluff spots." },
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
    pill: "Squeeze bait", tone: "purple",
    keys: ["open-too-wide:yes", "over-folds-3bet:yes"],
    text: "Squeeze target. 3-bet-bluff him wider IP and from the blinds, especially with blockers. He opens wide, folds when re-raised." },
  { id: "one-and-done-cbetter",
    label: "One-and-done cbetter",
    pill: "One-and-done", tone: "amber",
    keys: ["over-cbet:yes", "barrels-off:no"],
    text: "Fires reflex cbet then quits. Float ANY flop, stab turn when he checks with any equity, only fold to turn barrels." },
  { id: "wide-caller-sticky-flop",
    label: "Wide caller + sticky flop",
    pill: "Sticky caller", tone: "red",
    keys: ["wide-cc:yes", "station-f:yes"],
    text: "Cold-calls wide preflop then calls flop with any pair/draw. Cbet SMALL on dry boards, barrel scare turns, don't triple-barrel." },
  { id: "two-street-station",
    label: "Two-street calling station",
    pill: "Station F+T", tone: "red",
    keys: ["station-f:yes", "station-t:yes"],
    text: "Calls flop AND turn light. Value-bet flop and turn thin with pair+, NEVER double-barrel bluff. Size up river for value." },
  { id: "three-street-station",
    label: "Three-street calling station",
    pill: "3-street stn", tone: "red",
    keys: ["station-f:yes", "station-t:yes", "station-r:yes"],
    text: "Sticky all three streets. Never bluff. Value-bet every street with any made hand, size up all three, weak top pair is a shove line." },
  { id: "frequent-bluff-raiser",
    label: "Frequent bluff-raiser (flop + turn)",
    pill: "Bluff-raiser", tone: "teal",
    keys: ["bluff-raise-f:yes", "bluff-raise-t:yes"],
    text: "Raises as a bluff on flop AND turn. Don't fold to raises — call down thin, re-raise mediums for value. Only respect river raises." },
  { id: "sizing-is-a-tell",
    label: "Sizing tells (both directions)",
    pill: "Sizing tell", tone: "blue",
    keys: ["overbets-nuts:yes", "small-with-weak:yes"],
    text: "Both sizes are reliable. Overbets = value, small = weak. Fold bluff-catchers to big sizings, raise smalls as bluffs, call mediums light." },
];

/* Single-read pill fallback — priority list scanned in order when no compound
   rule fires. First matching {id, state} → its pill/tone appears on the felt.
   Kept SHORT (≤14 chars) so the pill fits under a 78px seat card. Only reads
   with a clear, exploitable direction are included; ambiguous ones get no
   pill rather than a misleading one. Tone maps to a colour class in style.css
   (red=sticky, amber=passive/weak, teal=aggro-bluff, purple=target,
   blue=informational, gray=nit/tight). */
const PILL_READS = [
  { id: "station-r",       state: "yes", pill: "R station",     tone: "red"    },
  { id: "station-t",       state: "yes", pill: "T station",     tone: "red"    },
  { id: "station-f",       state: "yes", pill: "F station",     tone: "red"    },
  { id: "wide-cc",         state: "yes", pill: "Wide caller",   tone: "red"    },
  { id: "limp-caller",     state: "yes", pill: "Limp-caller",   tone: "red"    },
  { id: "over-folds-3bet", state: "yes", pill: "Overfolds 3B",  tone: "purple" },
  { id: "open-too-wide",   state: "yes", pill: "Wide opener",   tone: "purple" },
  { id: "barrels-off",     state: "no",  pill: "Gives up turn", tone: "amber"  },
  { id: "floats-wide",     state: "no",  pill: "Fit-or-fold",   tone: "amber"  },
  { id: "over-cbet",       state: "yes", pill: "Auto-cbetter",  tone: "amber"  },
  { id: "bluff-raise-t",   state: "yes", pill: "Bluff-raiser",  tone: "teal"   },
  { id: "bluff-raise-f",   state: "yes", pill: "Bluff-raiser",  tone: "teal"   },
  { id: "bluff-raise-r",   state: "yes", pill: "River-raiser",  tone: "teal"   },
  { id: "3bets-light",     state: "yes", pill: "Light 3-bettor",tone: "teal"   },
  { id: "bluffs-rivers",   state: "yes", pill: "River bluffer", tone: "teal"   },
  { id: "barrels-off",     state: "yes", pill: "Barrels off",   tone: "teal"   },
  { id: "3bet-tight",      state: "yes", pill: "Nit 3-bet",     tone: "gray"   },
  { id: "open-too-wide",   state: "no",  pill: "Tight opener",  tone: "gray"   },
  { id: "overbets-nuts",   state: "yes", pill: "Big = value",   tone: "blue"   },
  { id: "small-with-weak", state: "yes", pill: "Small = weak",  tone: "blue"   },
  { id: "tilts",           state: "yes", pill: "Tilter",        tone: "purple" },
  { id: "force-squid",     state: "yes", pill: "Squid pusher",  tone: "purple" },
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

/* ---------- approximate ranges ----------
   Phil sketches an opponent's range per spot from hand-class shortcuts, then
   fixes individual hands on the 13×13 grid. A range is just a set of hand
   classes ("AKs", "77", "T9o"); class chips add/remove their hands in bulk.
   Stored as o.ranges[spotId] = { hands: [...], seen: [...] } — `seen` are hands
   Phil has actually watched the opponent show up with in that spot (marked by
   hand, never derived). */
const HAND_CLASSES = (() => {                       // 169 classes in grid order (AA … 32o)
  const out = [];
  for (let i = 0; i < RANKS.length; i++)
    for (let j = 0; j < RANKS.length; j++)
      out.push(i === j ? RANKS[i] + RANKS[i] : i < j ? RANKS[i] + RANKS[j] + "s" : RANKS[j] + RANKS[i] + "o");
  return out;
})();
const HAND_CLASS_ORDER = Object.fromEntries(HAND_CLASSES.map((c, i) => [c, i]));
const _hx = (hi, los, suf) => los.split("").map((l) => hi + l + suf);
const RANGE_CLASSES = [
  { id: "sc",   label: "SC",       hands: ["54s", "65s", "76s", "87s", "98s", "T9s", "JTs"] },
  { id: "s1g",  label: "S1G",      hands: ["64s", "75s", "86s", "97s", "T8s", "J9s"] },
  { id: "axs",  label: "AXs",      hands: _hx("A", "23456789", "s") },
  { id: "sbw",  label: "SBW",      hands: ["AKs", "AQs", "AJs", "ATs", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs"] },
  { id: "kxs",  label: "KXs",      hands: _hx("K", "23456789", "s") },
  { id: "qxs",  label: "QXs",      hands: _hx("Q", "23456789", "s") },
  { id: "jxs",  label: "JXs",      hands: _hx("J", "2345678", "s") },
  { id: "spp",  label: "Small PP", hands: ["22", "33", "44", "55", "66"] },
  { id: "mpp",  label: "Mid PP",   hands: ["77", "88", "99"] },
  { id: "bpp",  label: "Big PP",   hands: ["TT", "JJ", "QQ", "KK", "AA"] },
  { id: "obw",  label: "OBW",      hands: ["AKo", "AQo", "AJo", "ATo", "KQo", "KJo", "KTo", "QJo", "QTo", "JTo"] },
  { id: "axo",  label: "AXo",      hands: _hx("A", "23456789", "o") },
  { id: "kxo",  label: "KXo",      hands: _hx("K", "23456789", "o") },
  { id: "qxo",  label: "QXo",      hands: _hx("Q", "23456789", "o") },
  { id: "jxo",  label: "JXo",      hands: _hx("J", "2345678", "o") },
  { id: "osc",  label: "OSC",      hands: ["54o", "65o", "76o", "87o", "98o", "T9o", "JTo"] },
  { id: "os1g", label: "OS1G",     hands: ["64o", "75o", "86o", "97o", "T8o", "J9o"] },
];
const RANGE_CLASS_BY_ID = Object.fromEntries(RANGE_CLASSES.map((c) => [c.id, c]));
/* Spots: the overall range with / without squid, then the four first-raise /
   limp-reraise ranges split into value and bluff. */
/* Every situation, the overall range included, is painted per seat — a range
   belongs to a seat, and one grid covering the whole table is a range for
   nobody. A group id is just the seat token lowercased, so a spot reads
   `ns-first-raise-v-u8`. "Any" stays first so a quick seatless sketch is one
   tap away, and it holds the legacy `range-<squid>` spot so nothing painted
   before the split moved. Which seats get a chip is a runtime question —
   `rangePosGroups` (app.js) asks tonight's table. */
const RANGE_ANY = { id: "any", label: "Any", title: "any position", pos: null };
const rangePosGroup = (id) => {
  if (!id || id === "any") return RANGE_ANY;
  const seat = String(id).toUpperCase();
  return { id: seat.toLowerCase(), label: seat, title: seat, pos: [seat] };   // id is always the lowercase seat
};
const posGroupOf = (p) => POSITIONS.includes(p) ? p.toLowerCase() : null;
const RANGE_SQUIDS = [
  { id: "ns", label: "nS", title: "no squid" },
  { id: "ws", label: "wS", title: "with squid" },
];
/* Situations: the overall range, then the preflop actions themselves. `act` is
   the bucket `topPreGroup` (app.js) reads off a logged hand's action stream, so
   one vocabulary serves both halves of the panel — History filters the hands on
   record by it, Estimate paints the matching grid. Value/bluff is deliberately
   not split: it is a judgement the action stream can't make, and two grids per
   action is two grids that never get filled. */
/* Order is the order they sit in the chip row. The overall range goes last:
   it is the one that is always there and always the biggest, so it reads as
   the total at the end of the line rather than a heading in front of it. */
const RANGE_SITS = [
  { id: "raise", label: "Raise", title: "raise",         act: "raise" },
  { id: "limp",  label: "Limp",  title: "limp",          act: "limp" },
  { id: "3bet",  label: "3bet",  title: "3-bet",         act: "3bet" },
  { id: "4bet",  label: "4bet+", title: "4-bet or more", act: "4bet+" },
  { id: "call",  label: "Call",  title: "call",          act: "call" },
  { id: "lrr",   label: "LRR",   title: "limp-reraise",  act: "Lrr" },
  { id: "all",   label: "Range", title: "overall range", act: null },
];
const RANGE_SIT_BY_ID = Object.fromEntries(RANGE_SITS.map((t) => [t.id, t]));
const rangeSpotId = (sq, sit, pg = "any") =>
  (sit === "all" && pg === "any" ? "range-" + sq : `${sq}-${sit}-${pg}`);
/* Position reads are named "<situation>-<squid>", so a read id maps straight
   onto the grid that holds the hands seen in that situation. Tag ids are
   stable, so the reads that predate the dropped value/bluff split keep their
   ids and land on the plain action instead. */
const READ_SIT = {
  "first-raise": "raise", "first-raise-v": "raise", "first-raise-b": "raise",
  "lrr-latest": "lrr", "lrr-v": "lrr", "lrr-b": "lrr",
};
const readRangeSpot = (id) => {
  const m = /^(.*)-(ns|ws)$/.exec(id);
  if (!m) return null;
  const sit = READ_SIT[m[1]] || (RANGE_SIT_BY_ID[m[1]] ? m[1] : null);
  return sit ? { sq: m[2], sit } : null;
};
const rangeSpotTitle = (sq, sit, pg) =>
  (RANGE_SIT_BY_ID[sit]?.title || sit)
  + (!pg || pg === "any" ? "" : " from " + rangePosGroup(pg).title)
  + " · " + (RANGE_SQUIDS.find((s) => s.id === sq)?.title || sq);
const handClassCombos = (c) => c.length === 2 ? 6 : c[2] === "s" ? 4 : 12;   // of 1326

/* ---------- Model ranges ----------
   A measured frequency is a width, and a width is a shape: "PFR 22%" is a range
   you can draw. `modelRange(kind, pct)` walks that kind's ordering, adding
   classes until the combos reach that percent of 1326, so the grid it returns
   really is the size of the number above it.
   The orderings are NOT one strength ladder read at different depths. A cold
   call or a limp is what he did *instead* of raising, so the top of the
   strength ladder belongs at the bottom of those two — nobody's 8% cold-call
   range is AA/KK/QQ/AKs (Phil). There they come last, as the trap tail, and the
   hands that flat well lead: pairs for the set, suited connectors and suited
   broadways for the multiway pots a limped table actually plays.
   This is a model, not a read: it says what a range of his width looks like,
   never what he holds. */
const MR_RANKS = "23456789TJQKA";
const mrParts = (c) => {
  const a = MR_RANKS.indexOf(c[0]) + 2, b = MR_RANKS.indexOf(c[1]) + 2;
  return { hi: Math.max(a, b), lo: Math.min(a, b), pair: a === b, suited: c[2] === "s" };
};
/* Raw strength: the ladder a raising range is cut off. Pairs are scored on the
   same scale as everything else rather than jumped to the front — AKs over JJ
   is the whole difference between a 4-bet range and a list of pairs. */
function mrStrength(c) {
  const { hi, lo, pair, suited } = mrParts(c);
  if (pair) return hi * 6.8 + 30;
  const gap = hi - lo - 1;
  let v = hi * 3.4 + lo * 2.6 - Math.min(gap, 7) * 5.2 + (suited ? 12 : 0);
  if (gap === 0) v += 4;
  else if (gap === 1) v += 1.5;
  if (hi === 14) v += 8;
  return v;
}
/* How well it flats: set-mining and suited multiway playability, not high card.
   Small pairs and suited connectors lead; big cards are worth much less here
   because the big-card hands get raised rather than called. */
function mrSpec(c) {
  const { hi, lo, pair, suited } = mrParts(c);
  if (pair) return 92 + (hi <= 9 ? 22 : hi <= 11 ? 10 : 2) + hi * 0.4;
  const gap = hi - lo - 1;
  let v = 24 + lo * 3 + hi - Math.min(gap, 7) * 6.4 + (suited ? 30 : 0);
  if (gap === 0) v += 9;
  else if (gap === 1) v += 3;
  if (hi === 14 && suited) v += 7;
  return v;
}
/* The hands that get raised or 3-bet instead of flatted. Demoted, not deleted:
   a wide enough limp range still ends in them, which is exactly where a trap
   lives. */
const MR_PREMIUM = new Set(["AA", "KK", "QQ", "AKs", "AKo"]);
const mrOrder = (f) => HAND_CLASSES.slice().sort((a, b) => f(b) - f(a));
const mrFlat = (f) => (c) => f(c) - (MR_PREMIUM.has(c) ? 1000 : 0);
const MR_ORDERS = {
  play:   mrOrder((c) => mrStrength(c) + 0.45 * mrSpec(c)),      // VPIP: everything he plays
  raise:  mrOrder(mrStrength),
  "3bet": mrOrder((c) => mrStrength(c) + (mrParts(c).suited && mrParts(c).hi === 14 ? 14 : 0)),
  "4bet": mrOrder(mrStrength),
  call:   mrOrder(mrFlat((c) => mrSpec(c) + 0.3 * mrStrength(c))),
  limp:   mrOrder(mrFlat(mrSpec)),
  lrr:    mrOrder((c) => mrStrength(c) + (mrParts(c).suited && mrParts(c).hi - mrParts(c).lo <= 2 ? 8 : 0)),
};
function modelRange(kind, pct) {
  const ord = MR_ORDERS[kind] || MR_ORDERS.raise;
  const want = Math.max(0, Math.min(100, pct || 0)) * 13.26;     // combos, of 1326
  const hands = [];
  let n = 0;
  for (const c of ord) {
    if (n >= want) break;
    hands.push(c); n += handClassCombos(c);
  }
  // one class either side of the target: land on whichever is closer
  if (hands.length > 1 && n - want > handClassCombos(hands[hands.length - 1]) / 2) n -= handClassCombos(hands.pop());
  return { hands, combos: n, pct: n / 13.26 };
}
