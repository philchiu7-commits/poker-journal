/* Shared vocabulary — stable ids; the future exploit engine aggregates these. */

const POSITIONS = ["U7", "U6", "HJ", "CO", "BN", "SB", "BB", "STD"];
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

/* Curated tendency tags. ids never change; labels are display-only. */
const TENDENCY_TAGS = [
  { id: "limp-caller",       cat: "preflop",  label: "Limp-caller" },
  { id: "open-limps-strong", cat: "preflop",  label: "Limps monsters" },
  { id: "over-folds-3bet",   cat: "preflop",  label: "Over-folds to 3bet" },
  { id: "never-folds-pre",   cat: "preflop",  label: "Never folds pre" },
  { id: "3bets-light",       cat: "preflop",  label: "3bets light" },
  { id: "opens-huge",        cat: "preflop",  label: "Opens huge" },
  { id: "station",           cat: "postflop", label: "Station" },
  { id: "fit-or-fold",       cat: "postflop", label: "Fit-or-fold" },
  { id: "over-folds-cbet",   cat: "postflop", label: "Over-folds to cbet" },
  { id: "floats-wide",       cat: "postflop", label: "Floats wide" },
  { id: "bluffs-rivers",     cat: "postflop", label: "Bluffs rivers" },
  { id: "never-bluffs",      cat: "postflop", label: "Big bets = nuts" },
  { id: "barrels-off",       cat: "postflop", label: "Barrels relentlessly" },
  { id: "gives-up-turn",     cat: "postflop", label: "Gives up on turn" },
  { id: "overbets-nuts",     cat: "sizing",   label: "Sizes up with nuts" },
  { id: "small-with-weak",   cat: "sizing",   label: "Small = weak" },
  { id: "min-raise-nuts",    cat: "sizing",   label: "Min-raise = nuts" },
  { id: "tilts",             cat: "live",     label: "Tilts after losses" },
  { id: "drinks",            cat: "live",     label: "Drinking" },
  { id: "timing-tells",      cat: "live",     label: "Timing tells" },
  { id: "snap-call-weak",    cat: "live",     label: "Snap-call = weak" },
  { id: "talks-when-strong", cat: "live",     label: "Chatty = strong" },
  { id: "shortstacker",      cat: "live",     label: "Short-stacker" },
  { id: "deep-gambler",      cat: "live",     label: "Deep + gambling" },
];
const TAG_CATS = ["preflop", "postflop", "sizing", "live"];
const TAG_BY_ID = Object.fromEntries(TENDENCY_TAGS.map((t) => [t.id, t]));
