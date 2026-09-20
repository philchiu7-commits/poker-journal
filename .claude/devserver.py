"""Preview server for the Browser-pane tools.

`python3 -m http.server` sends no cache headers, so the browser applies its own
heuristic freshness and keeps serving an app.js from an edit ago — the preview
then shows a build that no longer exists on disk. no-store makes every reload
honest. Dev only; GitHub Pages serves the real thing.
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoStore(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8002
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print(f"Serving {root} on http://127.0.0.1:{port}/ (no-store)", flush=True)
ThreadingHTTPServer(("127.0.0.1", port), functools.partial(NoStore, directory=root)).serve_forever()
