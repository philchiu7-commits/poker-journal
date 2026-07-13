# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Poker Journal** is a live opponent journal for cash-game poker, built as an
installable **PWA** (Progressive Web App) for iPhone. It has two jobs:

1. **Opponent profiles** — villains with tendency-tag "reads", freeform notes,
   groups, and physical descriptions for re-identifying people at the table.
2. **A tap-optimized hand logger** — designed to be usable *one-handed at the
   table in under 30 seconds per hand*. Every field is optional.

Everything runs **on-device** in IndexedDB. There is **no server, no backend,
no build step, and no dependencies**. It works fully offline once installed.
JSON export/import is the only backup and phone-migration path.

## Architecture at a glance

Plain static files — vanilla JS, no framework, no bundler, no npm. Scripts load
in order via `<script>` tags (`vocab.js` → `db.js` → `app.js`); globals are
shared across files (no modules/imports). To run it, just serve the folder over
HTTP.

| File | Role |
|------|------|
| `index.html` | All views as `<section>`s + bottom tab bar. Single page, hash routing. |
| `app.js` | Routing, view rendering, and the hand-entry state machine. The bulk of the logic (~830 lines). |
| `db.js` | Promise-wrapped IndexedDB wrapper + JSON export/import. |
| `vocab.js` | Shared vocabulary: positions, streets, actions, sizes, cards, tendency tags — all with **stable ids**. |
| `style.css` | Dark, mobile-first CSS. CSS variables at `:root`. No preprocessor. |
| `manifest.webmanifest` | PWA install metadata. |
| `sw.js` | Service worker — caches the app shell for offline use. |
| `generate_icons.py` | Regenerates `icon-*.png` / `apple-touch-icon.png` (pure stdlib PNG writer, a spade tile). |
| `.netlify/netlify.toml` | Deploy config (static publish, no build). |

### Data model (IndexedDB, DB name `poker-journal`, version 1)

Four object stores, all keyed by `id` (a UUID from `uid()`):

- **`opponents`** — `{ id, name, group, tags[], physical, notes[], createdAt, updatedAt, archived }`.
  `tags` are tendency-tag ids (see `vocab.js`); `notes` are `{ id, ts, text, handId }`.
- **`hands`** — `{ id, ts, updatedAt, heroPos, heroCards, villains[], villainIds[], board[5], actions[], effStack, blinds, squid, note }`.
  - `villains`: `[{ opponentId, pos, cards }]`; `villainIds` is the flat list of ids (indexed, `multiEntry`) for lookups.
  - `actions`: `[{ street, actor, act, size }]` where `actor` is `"hero"` or `"v0"`/`"v1"`/… and `act`/`size` come from `vocab.js`.
  - `board`: 5 slots `[flop, flop, flop, turn, river]`; a card is a string like `"Ah"`, `"Ts"` (rank + suit id).
- **`sessions`** — declared/indexed but not yet actively used by the UI.
- **`meta`** — key/value store. Holds `lastExportAt`, and `draftHand` (the in-progress hand, persisted on every edit so a reload never loses work).

### Key runtime patterns

- **Source of truth is IndexedDB**; `app.js` keeps in-memory caches `OPP` and
  `HANDS` refreshed via `refreshCache()`. Mutations write to the DB *and* patch
  the cache.
- **Hash routing** — `location.hash` drives which `<section>` shows. Views:
  `opponents`, `opp/<id>`, `hand`, `hands`, `handview/<id>`, `data`. See `route()`.
- **Hand-entry state machine** — a single `draft` object holds the in-progress
  hand. All edits go through `mutate(fn)`, which snapshots `draft` onto
  `undoStack` (JSON strings), runs `fn`, then persists + re-renders via
  `draftChanged()`. **Undo** pops the stack. Two entry modes: **Chips** (tap
  villain chips + position rows, actor auto-alternates hero↔villain) and
  **Table** (an oval with tappable seats; positions *are* the seats).
- **DOM helpers** — `$(id)` = `getElementById`; `esc()` escapes HTML (always
  escape user text when building `innerHTML`). Event handling is largely
  **delegated** (one listener per container, dispatch on `data-*` attributes).
- **`handText(h)`** produces the plain-text serialization of a hand — this is
  both the detail-view render *and* the intended LLM input format for a future
  exploit engine. Keep it clean and structured.

## Conventions to follow

- **No dependencies, no build, no framework.** Do not introduce npm, bundlers,
  TypeScript, or a JS framework. Match the existing terse vanilla-JS style.
- **Stable ids in `vocab.js`.** Tendency-tag ids, action tokens, and position
  codes are persisted in user data. You may add new ones and change display
  `label`s freely, but **never rename or repurpose an existing id** — it would
  silently corrupt existing records.
- **Every hand field is optional.** Don't add required fields or validation
  that blocks saving; the logger's whole point is speed. `draftHasContent()`
  is the only save gate.
- **Escape user input** with `esc()` in every template literal that interpolates
  names, notes, or groups.
- **Persist drafts.** Anything that mutates `draft` must go through `mutate()`
  or otherwise call `persistDraft()`/`metaSet("draftHand", …)` so a mid-hand
  reload survives.
- **Import never wipes.** `importJSON()` merges by id, newest-wins
  (`updatedAt`/`ts`). Preserve that contract — export is the only backup.
- **Backward-compatible data changes.** New fields should be optional and
  tolerate old records that lack them (see the `|| []`, `?? null`, `!= null`
  guards throughout).

## Deploying an update (important)

**Bump the `CACHE` constant in `sw.js`** (e.g. `journal-v5` → `journal-v6`) on
every deploy that changes the app shell. The service worker only picks up new
files when the cache name changes; installed phones will otherwise keep serving
the old cached version. If you add or remove a shell file, also update the
`ASSETS` list in `sw.js`.

## Running locally

No build. Serve the folder over HTTP:

```bash
cd poker-journal
python3 -m http.server 8002
# then open http://localhost:8002
```

Note: PWA **install** and **offline** require a secure context (HTTPS), so
those only work when deployed to a real HTTPS host (GitHub Pages / Netlify /
Vercel). Plain `http://localhost` is fine for testing the UI and IndexedDB.

To test data flows without a phone: use the browser's dev-tools
Application panel to inspect IndexedDB, and the **Data** tab's Export/Import.

Regenerate icons only if the icon design changes: `python3 generate_icons.py`.

## Git workflow

- No test suite, linter, or CI — verify changes by loading the app in a browser
  and exercising the affected flow.
- Commit messages in history are short and descriptive (e.g. "Add squid
  side-game counts + durable storage (fix data loss)"). Match that style.
- Do not create a pull request unless explicitly asked.
