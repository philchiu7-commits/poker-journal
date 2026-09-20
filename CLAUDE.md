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

- `index.html` — one page, six `<section id="view-*">` blocks (opponents,
  opp-detail, hand-entry, table, hand-detail, data). Hash-routing. On the
  opponent detail, `#od-editform` (the ✎ name/group/looks-like form) sits
  directly under the header, **above** the Front-page card — two panels down it
  opened below the fold, nowhere near the tap that opened it (v138). The Table
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
  n beside each and dims anything under `HUD_MIN`.
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
  Estimate cell is the History fact showing through. **Both tabs fill in the
  selected action's own colour** (v137) — the hue its notch carries, via a
  `--fill` custom property on `.rggrid` — so the estimate and the record read
  in one colour language; the overall range has no single action and stays
  accent blue. Under one action History drops the notch (the fill already says
  it) and a painted Estimate cell inks its notch dark so "on record" survives
  the matching background. Situations are the preflop
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
