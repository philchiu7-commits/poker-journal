#!/bin/bash
# One-file installer for the Cathay award checker (macOS).
# Usage on the new laptop:  bash install-cx-award-checker.sh
set -euo pipefail

TARGET="$HOME/cx-award-checker"
LABEL="com.user.cxawardchecker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Installing to $TARGET ..."
mkdir -p "$TARGET"
cat > "$TARGET/checker.py" <<'__CX_INSTALL_EOF__'
#!/usr/bin/env python3
"""
Cathay Pacific award-seat checker — polls Cathay's public award-availability
calendar (the same feed the "redeem flights" date grid on cathaypacific.com
uses) and alerts you the moment Business-class Asia Miles award space opens
on your watched routes/dates.

Zero third-party dependencies — standard library only.

Usage:
    python3 checker.py               # run the polling loop forever
    python3 checker.py --once        # one poll then exit (good for cron)
    python3 checker.py --show        # print the current availability calendar
    python3 checker.py --get-chat-id # discover your Telegram chat id
    python3 checker.py --test        # send a test alert to configured channels
    python3 checker.py --config path/to/config.json
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

AFR_BASE = "https://api.cathaypacific.com/afr/search/availability"
TELEGRAM_API_BASE = "https://api.telegram.org"
BOOK_URL = (
    "https://www.cathaypacific.com/cx/en_HK/book-a-trip/"
    "redeem-flights/redeem-flight-awards.html"
)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# The calendar feed exposes three award buckets per day.
TIER_LABELS = {"std": "Standard", "pt1": "Choice", "pt2": "Tailored"}
CODE_LABELS = {"A": "available", "L": "limited", "H": "high"}


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
def load_config(path):
    if not os.path.exists(path):
        sys.exit(
            f"Config file not found: {path}\n"
            f"Copy config.example.json to config.json and fill in your details."
        )
    with open(path, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)

    # Environment variables override the file, so you can keep secrets out of it.
    cfg["telegram_bot_token"] = os.environ.get(
        "TELEGRAM_BOT_TOKEN", cfg.get("telegram_bot_token", "")
    )
    cfg["telegram_chat_id"] = os.environ.get(
        "TELEGRAM_CHAT_ID", cfg.get("telegram_chat_id", "")
    )

    cfg.setdefault("notifier", "desktop")  # "desktop" | "telegram" | "both"
    cfg.setdefault("notification_sound", "Ping")
    cfg.setdefault("cabin", "bus")  # fir | bus | pey | eco
    cfg.setdefault("carrier", "CX")
    cfg.setdefault("passengers", 1)
    cfg.setdefault("include_tiers", ["std", "pt1", "pt2"])
    cfg.setdefault("alert_on_loss", False)
    cfg.setdefault("poll_interval_seconds", 1800)
    cfg.setdefault("failure_alert_threshold", 6)
    cfg.setdefault("state_file", os.path.join(SCRIPT_DIR, "state.json"))
    cfg.setdefault("watches", [])

    if not cfg["watches"]:
        sys.exit("No watches configured — add at least one route/date range.")

    # Resolve a relative state path against the script dir, not the CWD.
    if not os.path.isabs(cfg["state_file"]):
        cfg["state_file"] = os.path.join(SCRIPT_DIR, cfg["state_file"])
    return cfg


def watch_key(cfg, w):
    return f"{w['origin']}-{w['destination']}-{cfg['cabin']}-{w['start']}-{w['end']}"


def route_label(w):
    return f"{w['origin']}→{w['destination']}"


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        return 0, str(exc)


def http_post_json(url, payload, timeout=30):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        return 0, str(exc)


# --------------------------------------------------------------------------- #
# Cathay availability feed
# --------------------------------------------------------------------------- #
def afr_url(cfg, origin, dest, start_yyyymmdd, end_yyyymmdd):
    return (
        f"{AFR_BASE}/en.{origin}.{dest}.{cfg['cabin']}.{cfg['carrier']}."
        f"{cfg['passengers']}.{start_yyyymmdd}.{end_yyyymmdd}.json"
    )


def fetch_calendar(cfg, origin, dest, start, end):
    """Fetch availability for one route/range.

    Returns (ok, tiers) where tiers maps tier -> {yyyymmdd: code}.
    ok is False only on transport/HTTP errors; an empty calendar (range not
    yet inside Cathay's ~180/360-day booking window) is ok=True with {}.
    """
    url = afr_url(cfg, origin, dest, start.strftime("%Y%m%d"), end.strftime("%Y%m%d"))
    status, body = http_get(url)
    if status != 200:
        log(f"Fetch failed ({status}) {origin}->{dest}: {body[:200]}")
        return False, {}
    try:
        avail = json.loads(body)["availabilities"]
    except (json.JSONDecodeError, KeyError, TypeError):
        log(f"Unexpected response for {origin}->{dest}: {body[:200]}")
        return False, {}

    tiers = {}
    for tier in cfg["include_tiers"]:
        tiers[tier] = {
            e["date"]: e.get("availability", "NA")
            for e in avail.get(tier, [])
            if "date" in e
        }
    return True, tiers


def fetch_watch(cfg, w):
    """Fetch one watch, clamping past dates and handling ranges that sit
    beyond the current booking window.

    Returns (ok, tiers, note) — note is a human hint like "window not open".
    """
    today = date.today()
    start = datetime.strptime(w["start"], "%Y-%m-%d").date()
    end = datetime.strptime(w["end"], "%Y-%m-%d").date()
    if end < today:
        return True, {}, "date range is in the past"
    start = max(start, today)

    ok, tiers = fetch_calendar(cfg, w["origin"], w["destination"], start, end)
    if not ok:
        return False, {}, ""

    if any(tiers.get(t) for t in tiers):
        return True, tiers, ""

    # Empty calendar: the range may still be past the booking window's edge.
    # Probe from today so we can tell "window not open yet" apart from a
    # feed quirk where the start date itself must be inside the window.
    ok, span = fetch_calendar(cfg, w["origin"], w["destination"], today, end)
    if not ok:
        return False, {}, ""
    in_range = {
        tier: {d: c for d, c in days.items() if start.strftime("%Y%m%d") <= d}
        for tier, days in span.items()
    }
    if any(in_range.values()):
        return True, in_range, ""
    all_days = [d for days in span.values() for d in days]
    edge = max(all_days) if all_days else None
    note = "not yet in booking window"
    if edge:
        note += f" (calendar currently ends {fmt_day(edge)})"
    return True, {t: {} for t in cfg["include_tiers"]}, note


# --------------------------------------------------------------------------- #
# State
# --------------------------------------------------------------------------- #
def load_state(path):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            log("State file unreadable — starting fresh.")
    return {}


def save_state(path, snapshot):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh)
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# Diffing
# --------------------------------------------------------------------------- #
def is_open(code):
    # Treat any unfamiliar code as bookable so we over-alert, never miss.
    return bool(code) and code != "NA"


def diff_watch(old_tiers, new_tiers):
    """Compare snapshots; returns (opened, lost) lists of (tier, date, code)."""
    opened, lost = [], []
    for tier, days in new_tiers.items():
        prev = old_tiers.get(tier, {})
        for d, code in days.items():
            if is_open(code) and not is_open(prev.get(d)):
                opened.append((tier, d, code))
        for d, code in prev.items():
            if is_open(code) and not is_open(days.get(d)) and d in days:
                lost.append((tier, d, code))
    return sorted(opened), sorted(lost)


# --------------------------------------------------------------------------- #
# Formatting + notifications
# --------------------------------------------------------------------------- #
def fmt_day(yyyymmdd):
    d = datetime.strptime(yyyymmdd, "%Y%m%d").date()
    return d.strftime("%a %b %-d, %Y")


def fmt_code(code):
    label = CODE_LABELS.get(code)
    return f"{code} = {label}" if label else code


def cabin_name(cfg):
    return {"fir": "First", "bus": "Business", "pey": "Premium Economy",
            "eco": "Economy"}.get(cfg["cabin"], cfg["cabin"])


def format_alert(cfg, w, opened, lost):
    lines = [f"✈️ Asia Miles {cabin_name(cfg)} — {route_label(w)}"]
    if opened:
        lines.append("Award space OPEN:")
        for tier, d, code in opened:
            lines.append(f"  • {fmt_day(d)} — {TIER_LABELS.get(tier, tier)} ({fmt_code(code)})")
    if lost:
        lines.append("No longer showing:")
        for tier, d, code in lost:
            lines.append(f"  • {fmt_day(d)} — {TIER_LABELS.get(tier, tier)}")
    lines.append("")
    lines.append(f"Book: {BOOK_URL}")
    return "\n".join(lines)


def send_telegram(cfg, text):
    token = cfg["telegram_bot_token"]
    if not token or not cfg["telegram_chat_id"]:
        log("Telegram not configured (telegram_bot_token / telegram_chat_id).")
        return False
    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": cfg["telegram_chat_id"],
        "text": text,
        "disable_web_page_preview": True,
    }
    status, body = http_post_json(url, payload)
    if status != 200:
        log(f"Telegram send failed ({status}): {body[:300]}")
        return False
    return True


def _applescript_escape(text):
    return text.replace("\\", "\\\\").replace('"', '\\"')


def send_desktop(cfg, title, subtitle, body):
    """Native macOS notification. Prefers terminal-notifier if installed,
    otherwise falls back to built-in osascript."""
    sound = cfg.get("notification_sound", "")

    if shutil.which("terminal-notifier"):
        args = [
            "terminal-notifier",
            "-title", title,
            "-subtitle", subtitle,
            "-message", body,
            "-group", "cx-award-checker",
        ]
        if sound:
            args += ["-sound", sound]
        try:
            subprocess.run(args, check=False, capture_output=True)
            return True
        except OSError as exc:
            log(f"terminal-notifier failed ({exc}); falling back to osascript.")

    script = (
        f'display notification "{_applescript_escape(body)}" '
        f'with title "{_applescript_escape(title)}" '
        f'subtitle "{_applescript_escape(subtitle)}"'
    )
    if sound:
        script += f' sound name "{_applescript_escape(sound)}"'
    try:
        result = subprocess.run(
            ["osascript", "-e", script], check=False, capture_output=True, text=True
        )
        if result.returncode != 0:
            log(f"osascript notification failed: {result.stderr.strip()}")
            return False
        return True
    except FileNotFoundError:
        log("osascript not found — desktop notifications require macOS.")
        return False


def notify(cfg, w, opened, lost):
    sent = False
    channel = cfg["notifier"]
    if channel in ("desktop", "both"):
        title = f"✈️ {route_label(w)} {cabin_name(cfg)} award"
        subtitle = f"{len(opened)} date(s) opened" if opened else "availability change"
        body = " · ".join(
            f"{fmt_day(d)} {TIER_LABELS.get(t, t)}({c})" for t, d, c in opened
        ) or "see log"
        sent = send_desktop(cfg, title, subtitle, body) or sent
    if channel in ("telegram", "both"):
        sent = send_telegram(cfg, format_alert(cfg, w, opened, lost)) or sent
    return sent


def notify_plain(cfg, title, text):
    sent = False
    channel = cfg["notifier"]
    if channel in ("desktop", "both"):
        sent = send_desktop(cfg, title, "", text) or sent
    if channel in ("telegram", "both"):
        sent = send_telegram(cfg, f"{title}\n{text}") or sent
    return sent


# --------------------------------------------------------------------------- #
# Poll loop
# --------------------------------------------------------------------------- #
def poll_once(cfg, state):
    """One pass over all watches. Mutates state; returns True if all fetches
    succeeded."""
    all_ok = True
    for w in cfg["watches"]:
        key = watch_key(cfg, w)
        ok, tiers, note = fetch_watch(cfg, w)
        if not ok:
            all_ok = False
            continue
        if note:
            log(f"{route_label(w)} {w['start']}..{w['end']}: {note}")
            continue

        old = state.get(key, {})
        opened, lost = diff_watch(old, tiers)
        open_now = sum(1 for days in tiers.values() for c in days.values() if is_open(c))
        log(
            f"{route_label(w)} {w['start']}..{w['end']}: "
            f"{open_now} open date(s), {len(opened)} new, {len(lost)} gone"
        )
        if opened or (lost and cfg["alert_on_loss"]):
            notify(cfg, w, opened, lost if cfg["alert_on_loss"] else [])
        state[key] = tiers
    return all_ok


def run(cfg, once=False):
    state = load_state(cfg["state_file"])
    failures = state.get("_consecutive_failures", 0)

    while True:
        ok = poll_once(cfg, state)
        if ok:
            if failures >= cfg["failure_alert_threshold"]:
                notify_plain(
                    cfg,
                    "✈️ CX award checker recovered",
                    "Cathay availability feed is responding again.",
                )
            failures = 0
        else:
            failures += 1
            if failures == cfg["failure_alert_threshold"]:
                notify_plain(
                    cfg,
                    "⚠️ CX award checker failing",
                    f"{failures} consecutive failed polls — the Cathay feed may "
                    "have changed or be blocking requests. Check checker.log.",
                )
        state["_consecutive_failures"] = failures
        save_state(cfg["state_file"], state)

        if once:
            return
        time.sleep(cfg["poll_interval_seconds"])


# --------------------------------------------------------------------------- #
# Extras
# --------------------------------------------------------------------------- #
def show_calendar(cfg):
    """Print the current availability grid for every watch."""
    for w in cfg["watches"]:
        header = f"{route_label(w)} {cabin_name(cfg)} · {w['start']} .. {w['end']}"
        print(header)
        print("-" * len(header))
        ok, tiers, note = fetch_watch(cfg, w)
        if not ok:
            print("  fetch failed (see log above)\n")
            continue
        if note:
            print(f"  {note}\n")
            continue
        dates = sorted({d for days in tiers.values() for d in days})
        any_open = False
        for d in dates:
            open_codes = {
                t: days[d] for t, days in tiers.items() if is_open(days.get(d))
            }
            if open_codes:
                any_open = True
                marks = ", ".join(
                    f"{TIER_LABELS.get(t, t)}={c}" for t, c in open_codes.items()
                )
                print(f"  {fmt_day(d)}: {marks}")
        if not any_open:
            print(f"  no award space on any of {len(dates)} date(s)")
        print()


def get_chat_id(cfg):
    token = cfg["telegram_bot_token"]
    if not token:
        sys.exit(
            "telegram_bot_token is not set.\n"
            "Create a bot with @BotFather on Telegram, paste its token into "
            "config.json, send your bot any message, then rerun --get-chat-id."
        )
    status, body = http_get(f"{TELEGRAM_API_BASE}/bot{token}/getUpdates")
    if status != 200:
        sys.exit(f"getUpdates failed ({status}): {body[:300]}")
    updates = json.loads(body).get("result", [])
    chats = {}
    for u in updates:
        chat = (u.get("message") or u.get("channel_post") or {}).get("chat")
        if chat:
            name = chat.get("username") or chat.get("title") or chat.get("first_name")
            chats[chat["id"]] = name
    if not chats:
        sys.exit(
            "No messages found — open Telegram, send your bot any message "
            "(e.g. /start), then rerun --get-chat-id."
        )
    print("Chats that have messaged your bot:")
    for cid, name in chats.items():
        print(f"  chat_id: {cid}  ({name})")
    print('\nPut the chat_id into config.json as "telegram_chat_id".')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default=os.path.join(SCRIPT_DIR, "config.json"))
    ap.add_argument("--once", action="store_true", help="poll once and exit")
    ap.add_argument("--show", action="store_true", help="print current calendar")
    ap.add_argument("--test", action="store_true", help="send a test alert")
    ap.add_argument("--get-chat-id", action="store_true")
    args = ap.parse_args()

    cfg = load_config(args.config)

    if args.get_chat_id:
        get_chat_id(cfg)
    elif args.test:
        w = cfg["watches"][0]
        sent = notify(cfg, w, [("std", date.today().strftime("%Y%m%d"), "A")], [])
        print("Test alert sent." if sent else "Test alert FAILED — check config.")
    elif args.show:
        show_calendar(cfg)
    else:
        run(cfg, once=args.once)


if __name__ == "__main__":
    main()
__CX_INSTALL_EOF__
cat > "$TARGET/config.json" <<'__CX_INSTALL_EOF__'
{
  "notifier": "both",
  "notification_sound": "Ping",
  "telegram_bot_token": "",
  "telegram_chat_id": "863653191",
  "cabin": "bus",
  "carrier": "CX",
  "passengers": 1,
  "include_tiers": ["std", "pt1", "pt2"],
  "alert_on_loss": false,
  "poll_interval_seconds": 1800,
  "failure_alert_threshold": 6,
  "state_file": "state.json",
  "watches": [
    {
      "label": "Outbound",
      "origin": "HKG",
      "destination": "YVR",
      "start": "2027-01-20",
      "end": "2027-02-06"
    }
  ]
}
__CX_INSTALL_EOF__
cat > "$TARGET/state.json" <<'__CX_INSTALL_EOF__'
{}
__CX_INSTALL_EOF__
cat > "$TARGET/README.md" <<'__CX_INSTALL_EOF__'
# Cathay Award Checker

Watches Cathay Pacific's award-availability calendar and alerts you the moment
**Business-class Asia Miles award space** opens on your watched routes/dates.

Currently configured to watch (1 passenger, Business):
- **HKG → YVR** — every date from **Jan 20 to Feb 6, 2027** inclusive

Alert channels (`"notifier"` in `config.json`): `"desktop"`, `"telegram"`, or
`"both"` (default — desktop works immediately, Telegram once you add a bot).

No third-party Python packages required — standard library only.

## How it works (and why not headless-browser scraping)

Cathay's "Redeem flights" date grid on cathaypacific.com is fed by a public
JSON calendar at `api.cathaypacific.com/afr/search/availability/…`. This tool
polls that feed directly — no login, no Akamai bot-wall to fight, and it shows
exactly what Asia Miles redemptions see. Each day is reported per award tier:

| Tier in feed | Asia Miles name | Meaning |
|---|---|---|
| `std` | Standard | The "good price" award chart level |
| `pt1` | Choice   | Higher miles, more seats |
| `pt2` | Tailored | Highest miles, close to unlimited |

Any day flipping from `NA` to anything else (`A` = available, `L` = limited)
triggers an alert. State is kept in `state.json` so you're only pinged on
*changes*, not on every poll.

**Booking-window note:** the calendar extends about 180 days ahead. Any
watched dates past the window's edge log "not yet in booking window" until
they roll into view — then they're picked up automatically, which is exactly
when you want the alert, since newly released dates are when Standard space
appears.

## Setup

### 1. Telegram bot (~2 minutes, optional but recommended)
1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the token.
2. Paste it into `config.json` as `telegram_bot_token`.
3. Open your new bot in Telegram and send it any message (e.g. `/start`).
4. Run `python3 checker.py --get-chat-id` and put the printed id into
   `telegram_chat_id`.
5. Test: `python3 checker.py --test` — you should get a sample alert.

Skip this and set `"notifier": "desktop"` if macOS banners are enough.

### 2. Run it

```bash
python3 checker.py --show    # print today's availability calendar and exit
python3 checker.py --once    # one poll (alerts on changes), then exit
python3 checker.py           # poll forever, every poll_interval_seconds
```

### 3. Run automatically (launchd)

```bash
cp com.user.cxawardchecker.plist.example ~/Library/LaunchAgents/com.user.cxawardchecker.plist
launchctl load ~/Library/LaunchAgents/com.user.cxawardchecker.plist
```

It polls every 30 minutes (`poll_interval_seconds`), survives reboots, and
logs to `checker.log`. To stop:

```bash
launchctl unload ~/Library/LaunchAgents/com.user.cxawardchecker.plist
```

## Tuning

- `watches` — add/edit routes and date ranges (any CX city pair works).
- `cabin` — `fir` / `bus` / `pey` / `eco`.
- `passengers` — seats required (availability differs by party size).
- `include_tiers` — drop `"pt1"`/`"pt2"` to only hear about Standard awards.
- `alert_on_loss` — set `true` to also be pinged when space disappears.
- `failure_alert_threshold` — consecutive failed polls before a "feed may
  have changed" warning (it also tells you when it recovers).

## Caveats

- The feed is per-day, not per-flight: an "open" day means at least one CX
  flight that day has award space in that cabin — the alert links to the
  redemption page to book. HKG–YVR has at most two dailies (CX838/CX856),
  so this is rarely ambiguous.
- This is an unofficial endpoint; if Cathay changes it, the checker will
  warn you after `failure_alert_threshold` consecutive failures.
__CX_INSTALL_EOF__

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>$TARGET/checker.py</string>
    </array>
    <key>WorkingDirectory</key><string>$TARGET</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>$TARGET/checker.log</string>
    <key>StandardErrorPath</key><string>$TARGET/checker.log</string>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Sending a test Telegram alert ..."
/usr/bin/python3 "$TARGET/checker.py" --test

echo ""
echo "Done. The checker is running and will survive reboots."
echo "  status : launchctl list | grep cxawardchecker"
echo "  log    : tail -f $TARGET/checker.log"
echo "  stop   : launchctl unload $PLIST"
