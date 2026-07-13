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
   special 3-colour read (green/yellow/red). */
const TENDENCY_TAGS = [
  // preflop
  { id: "open-too-wide",        cat: "preflop",  label: "Open too wide" },
  { id: "ep-range-limp",        cat: "preflop",  label: "EP range limp" },
  { id: "attacks-limps",        cat: "preflop",  label: "Attacks limps" },
  { id: "limps-monsters",       cat: "preflop",  label: "Limps monsters" },
  { id: "limp-wide-squid",      cat: "preflop",  label: "Limp wide for squid" },
  { id: "limp-wide-multiplier", cat: "preflop",  label: "Limp wide for multiplier" },
  { id: "can-4bet-light",       cat: "preflop",  label: "Can 4bet light" },
  // postflop
  { id: "station-f",            cat: "postflop", label: "Station F" },
  { id: "station-t",            cat: "postflop", label: "Station T" },
  { id: "station-r",            cat: "postflop", label: "Station R" },
  { id: "ld-draws",             cat: "postflop", label: "Ld draws" },
  { id: "ld-tp",                cat: "postflop", label: "Ld TP" },
  { id: "ld-2p",                cat: "postflop", label: "Ld 2p+" },
  { id: "raise-nuts-f",         cat: "postflop", label: "Raise nuts F" },
  { id: "raise-nuts-t",         cat: "postflop", label: "Raise nuts T" },
  { id: "raise-nuts-r",         cat: "postflop", label: "Raise nuts R" },
  { id: "bluff-till-f",         cat: "postflop", label: "Bluff till F" },
  { id: "bluff-till-t",         cat: "postflop", label: "Bluff till T" },
  { id: "bluff-till-r",         cat: "postflop", label: "Bluff till R" },
  { id: "bluff-raise-flop",     cat: "postflop", label: "Bluff raise flop" },
  { id: "bluff-xt",             cat: "postflop", label: "Bluff XT" },
  { id: "over-cbet",            cat: "postflop", label: "Over cbet" },
  // sizing
  { id: "bsti",                 cat: "sizing",   label: "BSTI" },
  { id: "preflop-sizing",       cat: "sizing",   label: "Preflop sizing" },
  { id: "draw-size",            cat: "sizing",   label: "Draw size" },
  // live
  { id: "tilts",                cat: "live",     label: "Tilts after losses" },
  { id: "drinks",               cat: "live",     label: "Drinking" },
  { id: "timing-tells",         cat: "live",     label: "Timing tells" },
  { id: "snap-call-weak",       cat: "live",     label: "Snap-call = weak" },
  { id: "talks-when-strong",    cat: "live",     label: "Chatty = strong" },
  { id: "shortstacker",         cat: "live",     label: "Short-stacker" },
  { id: "deep-gambler",         cat: "live",     label: "Deep + gambling" },
];
const TAG_CATS = ["preflop", "postflop", "sizing", "live"];
const TAG_BY_ID = Object.fromEntries(TENDENCY_TAGS.map((t) => [t.id, t]));
