# Poker Journal — edit backlog

Repo: https://github.com/philchiu7-commits/poker-journal
Live site auto-deploys from `main` to GitHub Pages.

Do Group 1 first (esp. #11a — save fix — before Group 4 reads inherit the bug).
Commit per group.

---

## Group 1 — Bugs

- [ ] **#8 Bottom nav overlapping content.** Floating tab bar (Opponents / Hand / Hands / Data) cuts off last note. Add bottom padding to scrollable content = nav-bar height + iPhone safe-area inset.
- [ ] **#9 Typo:** "Limp width" → "Limp with" everywhere ("Limp width wS" → "Limp with wS", etc.).
- [ ] **#11a Reads not saving reliably.** Audit every read toggle/slider/counter. Persist on every change (not batched). Test: toggle, close Safari, reopen, confirm retained. App uses IndexedDB — confirm writes fire per change.
- [ ] **#18 "Worked" counter must be increment-only.** Remove any decrement behavior.

## Group 2 — Layout & UI

- [ ] **#1 + #6 Table seats = lineup size, always.** Bind seat count to lineup array length, not a fixed default. Permanent.
- [ ] **#2 Drag to reorder lineup.** Replace ↑↓ with touch drag (SortableJS).
- [ ] **#3 Hero at actual lineup position** (stop pinning to top).
- [ ] **#4 Cleaner hand input layout.** One row per villain, fixed-width name column left, two card slots right-aligned. No wrapping. Handle variable-width Chinese names.
- [ ] **#10 Board shorthand for suits.** Parse trailing letter on flop:
  - `JT9s` = two of three share a suit (which two + which suit random)
  - `JT9m` = monotone (random suit)
  - `JT9r` = rainbow
- [ ] **#14 Hide reads with value 0** (interacts with #13).
- [ ] **#19 Show exploits on front page.** Setting or per-opponent toggle.

## Group 3 — Notation & shorthand

- [ ] **#5 Squid indicator as `X/Y`.** X = # villains in lineup tagged "squid", Y = total villains. e.g. "🦑 0/7", "🦑 1/7".
- [ ] **#20 `V{n}L` = "vs {n} limpers"** in note-to-hand parser.

## Group 4 — New reads

Follow the existing read UI pattern + #11a save fix.

- [ ] **#11b "Limps are weak"**
- [ ] **#12 "PFR OOP cbet"** (preflop raiser out-of-position cbet)
- [ ] **#15 "EP Open weak"**
- [ ] **#16 "Attack limped blinds"**

## Group 5 — Read structure

- [ ] **#7 3bet row: add "Bluff".** linear / polar → linear / polar / bluff.
- [ ] **#17 Flop reads → "merged / polar"** (replaces existing).
- [ ] **#13 0–5 accuracy toggle per read.** Stepped button 0→1→2→3→4→5→0. Stored alongside read state. 0 = off for display (see #14).

## Repo housekeeping (carry over)

- [ ] Commit + push the v55 lineup work.
- [ ] Push the earlier CLAUDE.md commit (`876a652`).
- [ ] Decide on `.claude/launch.json` (commit or gitignore).
