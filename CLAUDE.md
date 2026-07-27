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

- `index.html` — one page, five `<section id="view-*">` blocks (opponents,
  opp-detail, hand-entry, hands-feed, hand-detail, data). Hash-routing.
- `app.js` — all UI + business logic, ~2900 lines. Renderers are named
  `render*` and are cheap to re-run; state lives in module globals (`draft`,
  `sheetGroup`, etc.). Sheets are one shared `#sheet` element; dispatch by
  `sheetGroup` string (`"__act__"`, `"__seat__"`, …).
- `db.js` — IndexedDB wrapper + JSON export/import. Import merges by id;
  newer `updatedAt` wins. **v30+ also merges opponents by exact name match**
  so bulk imports don't dupe existing profiles.
- `vocab.js` — positions, tendency-tag ids, action tokens, sizes, card list.
  **Tag ids are stable — never rename.** Adding a tag = safe; renaming an id
  breaks every opponent's saved reads.
- `sw.js` — install/activate/fetch. Uses `cache: "reload"` on install so
  phones fetch fresh assets on version bump.
- `pinyin.js` — Chinese-name search helper for the opponents list.

## Data model

- `opponents`: `{id, name, group?, physical?, reads: {tagId: "yes"|"no"|…},
  exploits: [{id, ts, text, src?}], featured?: [{type,id}], notes: [...]}`.
- `hands`: `{id, ts, opponentId?, villains: [{opponentId, seat, pos}], hero:
  {seat, pos}, actions: [{street, actor, act, size?}], board: [...], holes:
  {...}, bb, effstack, mode: "chips"|"table", ...}`.
- The **structured `actions[]` token stream** is the format the v2 exploit
  engine will consume (VPIP-ish, fold-to-cbet, 3bet freq per villain) and
  what `handText()` serializes for LLM summaries. Don't collapse it into a
  string.

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
