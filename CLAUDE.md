# Poker Journal — repo guide for Claude Code

Live poker opponent journal PWA. Vanilla HTML/JS/CSS, no build step, IndexedDB
for storage, service-worker cache for offline. Installed on Phil's iPhone via
Safari "Add to Home Screen".

## Deploying

Deploy = **bump `CACHE` in `sw.js`, commit, `git push origin main`**. GitHub
Pages (legacy build, `main` branch root) serves at
https://philchiu7-commits.github.io/poker-journal/ ~60–90s after push. All app
paths are relative so the `/poker-journal/` subpath just works. Verify with:

```bash
curl -s https://philchiu7-commits.github.io/poker-journal/sw.js | sed -n 2p
```

**Never skip the cache bump.** The SW is cache-first — installed phones will
keep serving the old assets otherwise. Current cache: see `sw.js` line 2.

**Since v147 the app updates itself.** `app.js` calls `reg.update()` on boot and
on every `visibilitychange` back to the front, and reloads once when a new
worker takes control — guarded by `hadController` so a first-ever load never
reloads, and deferred by `applySwUpdate()` while the hand-entry view is open so
a reload can never throw away a half-typed hand. Before this, a PWA sitting in
the iOS app switcher could go days without a navigation, which is how three
shipped features reached Phil's phone as "I still don't see it". The two-reload
dance below still applies to v147 itself and to any browser tab.

**A cache bump needs two reloads.** The first reload is still served by the old
worker while the new one installs, activates and claims the page; the second
reload gets the new assets. Only the second one proves a deploy landed — don't
read the first as a failed deploy and bump again.

## Local preview

Launch config `poker-journal` in `.claude/launch.json` runs
`python3 -m http.server 8002`. Prefer `preview_start` over `Bash` for the
server. To test a change against fresh assets in the preview:

```js
// in the preview's JS console, then reload
(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
})()
```

**Unregistering the worker is not enough.** `python3 -m http.server` sends no
cache headers, so the browser applies its own heuristic freshness and keeps
running a `vocab.js` from an edit ago — the preview then shows a build that no
longer exists on disk, and `?fresh=N` doesn't help because it only busts the
HTML. `.claude/devserver.py` is the same static server with
`Cache-Control: no-store`; run it by hand (`python3 .claude/devserver.py 8002`)
after `preview_stop`, because `preview_start` ignores `runtimeArgs` and runs
`-m http.server` regardless. Entries the browser stored earlier survive the
switch — overwrite them once with:

```js
for (const f of ["index.html","vocab.js","stats.js","pinyin.js","db.js","app.js","style.css","sw.js"])
  await fetch(f, {cache: "reload"});
```

## Code layout

- `index.html` — one page, seven `<section id="view-*">` blocks (opponents,
  opp-detail, hand-entry, table, hand-detail, ranges, data). Hash-routing.
  **The tab bar carries four tabs** — Opponents, Hand, Table, Data. The saved-range
  library lost its tab in v139 (ranges live on the opponent now) but kept its
  view, its `#ranges` route and every saved grid; it is still in `VIEWS` and
  `TAB_FOR`, just unreachable from the bar. On the
  opponent detail, `#od-editform` (the ✎ name/group/looks-like form) sits
  directly under the header, **above** the Front-page card — two panels down it
  opened below the fold, nowhere near the tap that opened it (v138). The ✎
  handler also scrolls the form into view, clear of the sticky header, by
  walking the `offsetParent` chain: showing content above the scroll position
  makes the browser shift `scrollY` to compensate, so a `getBoundingClientRect()`
  read across that adjustment scrolls the wrong way (v139). The Table
  tab shows tonight's seat-ring lineup (same `tableLineup` meta as hand
  entry's Lineup sheet) with each opponent's front-page card chips; its
  renderer is `renderTableTab` (`renderTable` is the hand-entry felt).
- `app.js` — all UI + business logic, ~4600 lines. Renderers are named
  `render*` and are cheap to re-run; state lives in module globals (`draft`,
  `sheetGroup`, etc.). Sheets are one shared `#sheet` element; dispatch by
  `sheetGroup` string (`"__act__"`, `"__seat__"`, …).
- `db.js` — IndexedDB wrapper + JSON export/import. Same-id opponents
  union-merge on import (reads/exploits/notes from both devices survive;
  newer record wins conflicts) via `mergeOppRecords`. **v30+ also merges
  opponents by exact name match** so bulk imports don't dupe existing
  profiles. Hands/sessions stay plain newer-wins by id.
- `stats.js` — the HUD engine. `hudCount(oppId, hands)` walks the action
  stream once per hand and returns raw numerator/denominator counters;
  `hudStats`/`hudAF` shape them for display. Flop cbet and fold-to-flop-cbet are each split three ways
  (heads-up IP, heads-up OOP, multiway); **position comes from the flop action
  order, not a seat map** — the straddle acts third postflop and any seat
  ordering gets that wrong. Every stat is a count over its own
  *opportunity* count, never a bare percentage — `renderOppHud` (app.js) prints
  n beside each and dims anything under `HUD_MIN`. Below the grid sits a
  **per-seat table** off `byPos`: Limp (of seats dealt), Limp-RR (of limps) and
  Limp-fold (of limps somebody actually raised — a limp that walks to the flop
  was never a chance to fold, and folding those into the denominator reads as a
  player who defends far more than he does). **The three rows deliberately do
  not share a denominator**, so each cell prints its own n underneath; don't
  read one row as the complement of another. Beside every counter `hudCount`
  also records `c.ev[key]` — one `{id, ok}` per hand the stat had a chance in —
  and `openHudDrill` (app.js) turns each HUD cell into a button that lists those
  hands split into counted / not-counted. Because of it **the preflop counters
  are per-hand, not per-action**: the walk sets flags (`vol`, `aggPre`, …) and
  the counter moves once, which is what stopped VPIP reading over 100% when a
  villain limped and then called a raise. Keep it that way — a per-action
  increment puts the drill-down at odds with the number above it.
  Hand-filter roles come from `villainRoles` (app.js), which returns a **list**:
  a limp-reraise answers to both `LRR` and `Limp`, the same way the range grid
  counts it. Everything else is exclusive.
  stats.js also carries the **sizing engine** — `sizeAmount` parses `"$6,000"` /
  `"6.8k"`, `betsVsPot` replays the money street by street and returns each
  postflop bet with the pot *before* it went in, `madeClass` calls the villain's
  hand value or bluff off his shown cards, `sizeStepFor` buckets the fraction
  onto Phil's B33/B50/B66/B100/B150 ladder, and `sizingAuto` tallies the grid.
  Two standing caveats, both stated in the UI copy: it only sees hands where the
  villain's cards are on record, and cards are mostly on record because the hand
  went to showdown — **so the Bluff rows are a floor, not a count**, and Phil's
  manual taps are the corrective rather than a duplicate. **The value/bluff line
  is Phil's, set in v146:** two pair or better, or top or second pair, is value;
  everything under that — third pair, bottom pair, a naked draw, air — is a
  bluff. Nothing goes uncounted, so `skipped.unclear` is now always 0. Only
  pairs he made with his *own* cards count, so a hand that is "two pair" solely
  because the board paired is graded on his own card.
  **`betsVsPot` normalises two things Phil's data gets wrong (v147).** His two
  sources disagree on units: the DX imports write blinds in thousands (`bb: 0.2`
  for a 200 big blind) while every action `size` is in chips, so 148 of 347
  hands were reading their pot ~1000x too small and filing a 59%-pot turn bet
  under B100. A chip denomination is a whole number, so `b.bb < 1` is the tell
  and the blinds are scaled by 1000. The `ante` is now counted too — **once for
  the table, not once per seat**: these are big-blind-ante games, and Phil's own
  known 66% turn bet comes out B50 under a per-seat reading and B66 under this
  one. Any new import source must land in chips or in sub-1 k-units, nothing in
  between.
- **Hands-panel filters belong to an opponent, not to a screen.** The route
  guard in `go()` only calls `resetHandFilters()` when a *different* opponent
  comes up (`handFiltersFor`), so opening a hand and coming back keeps them —
  filtering down to four hands is usually the prelude to reading them one by
  one (v144). The ranges tab resets to History there too — "default" means per
  player, not once per app launch. The **3BP chip is opponent-relative**: `in3betPot` requires he
  3-bet or called the 3-bet, so a hand he folded to a 3-bet in drops out. The
  other pot buckets stay table-shaped. The **Post row** (`postRoles`) reads
  position-in-street rather than the token: an aggressive action on a street
  that already has money in it is a raise (`R`), and one he'd checked earlier on
  that street is a check-raise (`xR`, which also answers to `R`). 49 raises / 23
  check-raises across the export as of v145. The **Role row** also carries `3b`
  and `c3b` (v147), and both sit *outside* the PFR/PFC/Limp exclusive chain on
  purpose — a 3-bet is also a raise and a called 3-bet is also a call, so they
  narrow what is already there rather than replacing it, the way `LRR` sits over
  `Limp`. `made3bet` / `called3bet` back both these chips and the 3BP pot chip,
  so the three can never drift apart.
- Suggested reads (`derivedReads`) carry the hand ids they were counted off, and
  `openReadProof` lists them in the same sheet the HUD drill uses. Looking
  commits nothing — **Add read still needs Phil's tap.** Since v147 it tracks
  the *denominator* as well: `sig(key, had, did)` records a hand only when
  `facedBet` says the villain actually had the chance, so a suggestion reads
  "6 of 14 chances · 43%" and the proof sheet shows two blocks — the hands he
  did it in, and the hands he had the same chance and did something else. The
  second block is what separates a read from a coincidence, so don't drop it.
- `vocab.js` — positions, tendency-tag ids, action tokens, sizes, card list.
  **`U<n>` numbers the UTG seats down from the table size** — an 8-handed ring
  is `SB BB STD U8 U7 HJ CO BN`, a 9-handed one adds U9. `ringFor` (app.js)
  derives it. This is Phil's own convention, confirmed against his table; don't
  "correct" it to count seats-behind. `STD` is the UTG seat: the straddle sits
  there but acts last preflop and third postflop.
  **Tag ids are stable — never rename.** Adding a tag = safe; renaming an id
  breaks every opponent's saved reads.
- `sw.js` — install/activate/fetch. Uses `cache: "reload"` on install so
  phones fetch fresh assets on version bump. The activate sweep is filtered to
  `PREFIX` (`journal-`) — Cache Storage is keyed per **origin**, not per SW
  scope, and the sibling PWAs (shortdeck-journal, range-lab, squid-web) share
  `philchiu7-commits.github.io`, so an unfiltered sweep would delete their
  offline caches. Keep `CACHE` starting with `PREFIX`.
- `pinyin.js` — Chinese-name search helper for the opponents list.
  **Not usable for duplicate detection** — the table is roster-sparse, so
  阿威少哥 and 大力哥 both collapse to "ge". `findDupes` (app.js) matches
  characters instead, and applies edit distance only from four characters up:
  Chinese handles share particles (哥 "bro", 小 "little"), so 财哥/兵哥 and
  小白/小虎 sit one edit apart and are different people. It never merges —
  it surfaces the pair and Phil picks which name survives.

## Data model

- `opponents`: `{id, name, group?, type?, physical?, aliases?: [name…],
  reads: {tagId: "yes"|"no"|"yes!"|"no!"|position|choiceOptionId},
  exploits: [{id, ts, text, src?}], exploitDismissed?: [key…],
  featured?: [{type,id}], notes: [...], ranges?: {spotId: {hands: [class…],
  seen: [class…]}}, order?, createdAt?, updatedAt, archived?}`. Reads: see
  `TENDENCY_TAGS` (kinds: yes/no, `position`, `choice`); ranges: `RANGE_SITS` /
  `RANGE_CLASSES` in `vocab.js`, hand classes are 13×13 grid labels (`AKs`).
  Spot id is `<squid>-<sit>-<seat>` with the seat lowercased (`ns-raise-u8`):
  **every situation, the overall range included, gets one grid per seat**,
  because a range belongs to a seat. Which seats get a chip is decided at render
  time by `rangePosGroups` (app.js) — the **whole eight-handed ring, always**,
  plus any seat this villain has been logged in and any seat already holding a
  grid — so the row is `Any U8 U7 HJ CO BN SB BB STD` and grows a U9 or U6 chip
  off the villain's own hands. It is deliberately *not* derived from tonight's
  lineup: a short table drops HJ and the UTG seats off the ring (v135 bug), and
  the lineup answers who is sitting down, not what you know. `any` is the seatless sketch and keeps the legacy
  `range-<squid>` id — the one exception to the scheme, so nothing painted
  before the split moved; the saved-ranges library reads that spot.
- The Ranges panel has **two tabs over one grid**. *History* is what the villain
  has actually turned up — `rangeRows` (app.js) reads it straight off `HANDS`,
  so it needs no storage and is **read-only** — marking hands watched but never
  logged (the old Seen mode) is gone as of v136, and stored `seen[]` arrays are
  left alone, just not surfaced. *Estimate* is the range he paints (`hands[]`),
  with the `RANGE_CLASSES` chips to fill it in blocks; the corner notch on an
  Estimate cell is the History fact showing through. **History paints each cell whole in that
  hand's own action colour** (Phil, v141) and carries no notch at all — a corner
  mark is a lot to read across 169 squares when the cell itself can carry it, and
  on the overall range the grid becomes a map of how he plays each hand instead
  of a wall of blue. A limp that came back over the top keeps its purple inside
  the yellow Limp grid. The per-cell colour is a `--fill` custom property on the
  cell, overriding the situation-wide `--fill` on `.rggrid` (v137). Estimate is a
  canvas, so there the fill is the sketch — accent blue, or the situation's own
  hue — and the record rides on top as a corner notch, inked dark when a matching
  fill would swallow it. Situations are the preflop
  actions themselves — `Range · Raise · Limp · 3bet · 4bet+ · Call · LRR` —
  and each carries the `act` bucket `topPreGroup` produces, so one vocabulary
  serves both tabs: History filters the hands on record by it, Estimate paints
  the matching grid. **Limp is the one non-exclusive situation** (Phil, v138):
  every other chip takes the hand's single strongest action, but Limp counts
  every hand he put a limp in — traps included — and LRR is the subset that came
  back over the top, so the pair reads "how often does he limp" then "and then
  what". A trap keeps its purple notch inside the yellow Limp grid. The footer
  on either chip carries the conditional rate from `limpLines` (app.js), which
  counts **every logged hand, not the grid's rows**: the grid only holds hands
  he turned up, and a limp that folds is almost never shown while a
  limp-reraise nearly always is, so a rate off those rows reads several times
  too high. **Value/bluff is deliberately not split** (Phil, v135): the
  action stream can't make that call, and two grids per action is two grids that
  never get filled. Tag ids stay stable, so `READ_SIT` (vocab.js) maps the
  older `first-raise-v|-b` and `lrr-v|-b` read ids onto the plain action.
- `hands`: `{id, ts, updatedAt, villains: [{opponentId, pos, cards, chips?}],
  villainIds, hero, heroPos, heroCards, actions: [{street, actor, act, size?}],
  board: [5], blinds: {sb, bb, std, ante}, effStack, note, mode?, srcNoteId?,
  imported?: {source, tableId, roundId, noK}, showdown}`. `normaliseHand`
  (app.js) tidies tokens/cards on every boot without touching `updatedAt`.
  On the opponent's Hands panel, hands where **that** villain's cards were never
  seen sit in their own "No cards seen" group below the reviewable ones. The
  group is **open by default** (`noCardsOpen`): four villain-rows in five have
  no cards, so collapsing it hid most of what Phil had imported.
- The **structured `actions[]` token stream** feeds `handText()` (LLM
  summaries), the shown-hands range grid, per-opponent *read suggestions*
  (`READ_SIGNALS`; Phil accepts or dismisses each) and — since v124 — the
  **HUD** (`stats.js`). Don't collapse the stream into a string.
- **The HUD counts imported hands only.** `imported` hands come from the
  bookmarklet, which records every seat and every preflop action (measured:
  100% of 1437 villain seats). Hand-typed hands are the ones Phil thought worth
  writing down and only 65% of their seats carry a preflop action, so folding
  them in would bias every frequency upward. `hudCount` skips them — don't
  "fix" that. Reads and exploits are still the primary engine; the HUD is a
  second opinion, not a replacement.

## Hand entry — recent shape (v54)

Main page: mode toggle, ctxbar (SB/BB/STD/Eff/squid), villains, positions,
board+cards, Save — **plus one gradient "＋ Add action" pill** that opens a
bottom sheet with the street/actor/action/size controls. Sheet stays open
across taps; street auto-close chains straight into the board-picker sheet.

The dispatch pattern: `handActionClick(b)` is called from both the main
`#view-hand` click handler and from `sheetClick` when `sheetGroup ===
"__act__"`. Add new action-pad behaviour in `handActionClick`, not in either
caller.

## Conventions I keep hitting

- Terse code, no explanatory comments beyond a short "why" when non-obvious.
- Don't create planning/analysis `.md` files unless asked.
- Verify UI changes in the browser preview before saying "done" — use the
  Browser tools, not "please check". Screenshot for visual proof.
- One commit per shipped change; commit message describes the user-visible
  behaviour, not the diff.

## Related context

- `~/.claude/projects/-Users-phil/memory/reference_poker_journal_shorthand.md`
  — Phil's dictation shorthand for building import JSON from paste-dumps.
- `~/.claude/projects/-Users-phil/memory/project_poker_journal.md` — broader
  project history and decisions.
