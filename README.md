# Poker Journal — iPhone app (PWA)

Live opponent journal for cash games. Profiles with tendency tags and notes,
plus a tap-optimized hand logger built to be usable **one-handed at the table
in under 30 seconds per hand**. Everything runs on-device (IndexedDB) — no
server, works offline once installed.

## Put it on your iPhone

Safari needs HTTPS to install a PWA, so host the static files somewhere with a
secure URL (all free, takes a couple of minutes):

1. **Deploy the folder** to any static host:
   - **GitHub Pages** — push this folder to a repo, enable Pages.
   - or **Netlify / Vercel** — drag-and-drop the folder, get an HTTPS URL.
2. On your iPhone, open that URL in **Safari**.
3. Tap **Share → Add to Home Screen**. It installs with its icon and opens
   fullscreen like a native app; after the first load it works offline.

Local testing on your Mac (online only — no offline, since plain HTTP on the LAN
isn't a secure context):

```bash
cd poker-journal
python3 -m http.server 8002
# Mac:    http://localhost:8002
# iPhone: http://<your-mac-LAN-ip>:8002   (same Wi-Fi)
```

## Using it

- **Session tab** — start a session (room / stakes / table size); hands logged
  while it's active attach to it automatically.
- **Opponents tab** — add villains (nicknames are fine), toggle tendency-tag
  chips, add timestamped notes (use the keyboard mic to dictate), see every
  hand you've logged against them.
- **Hand tab** — tap a villain chip, then tap out the action (actor
  auto-alternates hero ↔ villain), tap board/hole cards on the 52-card grid,
  add a one-line note, Save. Every field is optional — "villain checked back
  top pair" + one tag is a perfectly good hand record. **Undo** pops the last
  input. **Save & next** keeps the villain/positions for the next hand.
- **Backup** — Session tab → Export JSON (AirDrop/Files via the share sheet).
  Data lives only on the phone, so export regularly. Import merges by id and
  never wipes — it's also the phone-migration path.

## Files

| file | role |
|------|------|
| `index.html` / `app.js` / `style.css` | the mobile UI (single page, hash routing) |
| `db.js` | IndexedDB wrapper + JSON export/import |
| `vocab.js` | positions, tendency tags, actions, sizes, cards — stable ids |
| `manifest.webmanifest` / `sw.js` | PWA install + offline cache |
| `icon-*.png`, `apple-touch-icon.png` | app icons (regenerate with `generate_icons.py`) |

## Notes

- Deploying an update: bump `CACHE` in `sw.js` (e.g. `journal-v2`) so installed
  phones pick up the new version on next launch.
- Data model is structured (action tokens + tag ids), so a v2 exploit engine
  can compute VPIP-ish stats / fold-to-cbet / 3bet frequency per opponent, and
  the plain-text hand render (`handText`) is the intended LLM input format.
