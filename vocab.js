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
  // preflop
  { id: "open-too-wide",        cat: "preflop",  label: "Open too wide" },
  { id: "ep-range-limp",        cat: "preflop",  label: "EP range limp" },
  { id: "attacks-limps",        cat: "preflop",  label: "Attacks limps" },
  { id: "limps-monsters",       cat: "preflop",  label: "Limps monsters" },
  { id: "limp-wide-squid",      cat: "preflop",  label: "Limp wide for squid" },
  { id: "limp-wide-multiplier", cat: "preflop",  label: "Limp wide for multiplier" },
  { id: "can-4bet-light",       cat: "preflop",  label: "Can 4bet light" },
  { id: "wide-cc",              cat: "preflop",  label: "Wide CC" },
  { id: "limp-caller",          cat: "preflop",  label: "Limp-caller" },
  { id: "over-folds-3bet",      cat: "preflop",  label: "Over-folds to 3bet" },
  { id: "never-folds-pre",      cat: "preflop",  label: "Never folds pre" },
  { id: "3bets-light",          cat: "preflop",  label: "3bets light" },
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
  // postflop — singles
  { id: "bluff-raise-flop",     cat: "postflop", label: "Bluff raise flop" },
  { id: "bluff-xt",             cat: "postflop", label: "Bluff XT" },
  { id: "over-cbet",            cat: "postflop", label: "Over cbet" },
  { id: "fit-or-fold",          cat: "postflop", label: "Fit-or-fold" },
  { id: "over-folds-cbet",      cat: "postflop", label: "Over-folds to cbet" },
  { id: "floats-wide",          cat: "postflop", label: "Floats wide" },
  { id: "bluffs-rivers",        cat: "postflop", label: "Bluffs rivers" },
  { id: "never-bluffs",         cat: "postflop", label: "Big bets = nuts" },
  { id: "barrels-off",          cat: "postflop", label: "Barrels relentlessly" },
  { id: "gives-up-turn",        cat: "postflop", label: "Gives up on turn" },
  // sizing
  { id: "bsti",                 cat: "sizing",   label: "BSTI" },
  { id: "preflop-sizing",       cat: "sizing",   label: "Preflop sizing" },
  { id: "draw-size",            cat: "sizing",   label: "Draw size" },
  { id: "overbets-nuts",        cat: "sizing",   label: "Sizes up with nuts" },
  { id: "small-with-weak",      cat: "sizing",   label: "Small = weak" },
  { id: "min-raise-nuts",       cat: "sizing",   label: "Min-raise = nuts" },
  // live
  { id: "tilts",                cat: "live",     label: "Tilts after losses" },
  { id: "timing-tells",         cat: "live",     label: "Timing tells" },
  { id: "snap-call-weak",       cat: "live",     label: "Snap-call = weak" },
  { id: "talks-when-strong",    cat: "live",     label: "Chatty = strong" },
];
const TAG_CATS = ["preflop", "postflop", "sizing", "live"];
const TAG_BY_ID = Object.fromEntries(TENDENCY_TAGS.map((t) => [t.id, t]));
