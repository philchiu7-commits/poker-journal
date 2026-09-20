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

## Code layout

- `index.html` — one page, six `<section id="view-*">` blocks (opponents,
  opp-detail, hand-entry, table, hand-detail, data). Hash-routing. The Table
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
  **Tag ids are stable — never rename.** Adding a tag = safe; renaming an id
  breaks every opponent's saved reads.
- `sw.js` — install/activate/fetch. Uses `cache: "reload"` on install so
  phones fetch fresh assets on version bump. The activate sweep is filtered to
  `PREFIX` (`journal-`) — Cache Storage is keyed per **origin**, not per SW
  scope, and the sibling PWAs (shortdeck-journal, range-lab, squid-web) share
  `philchiu7-commits.github.io`, so an unfiltered sweep would delete their
  offline caches. Keep `CACHE` starting with `PREFIX`.
- `pinyin.js` — Chinese-name search helper for the opponents list.

## Data model

- `opponents`: `{id, name, group?, type?, physical?, aliases?: [name…],
  reads: {tagId: "yes"|"no"|"yes!"|"no!"|position|choiceOptionId},
  exploits: [{id, ts, text, src?}], exploitDismissed?: [key…],
  featured?: [{type,id}], notes: [...], ranges?: {spotId: {hands: [class…],
  seen: [class…]}}, order?, createdAt?, updatedAt, archived?}`. Reads: see
  `TENDENCY_TAGS` (kinds: yes/no, `position`, `choice`); ranges: `RANGE_SPOTS`
  / `RANGE_CLASSES` in `vocab.js`, hand classes are 13×13 grid labels (`AKs`).
- `hands`: `{id, ts, updatedAt, villains: [{opponentId, pos, cards, chips?}],
  villainIds, hero, heroPos, heroCards, actions: [{street, actor, act, size?}],
  board: [5], blinds: {sb, bb, std, ante}, effStack, note, mode?, srcNoteId?,
  imported?: {source, tableId, roundId, noK}, showdown}`. `normaliseHand`
  (app.js) tidies tokens/cards on every boot without touching `updatedAt`.
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
