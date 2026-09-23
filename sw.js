/* Service worker: cache the app shell so it runs offline once installed. */
const CACHE = "journal-v181";
const PREFIX = "journal-";   // other apps share this origin on GitHub Pages
const ASSETS = [
  ".", "index.html", "style.css", "app.js", "db.js", "vocab.js", "stats.js", "pinyin.js",
  "import.html", "convert.html",
  "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // cache:"reload" skips the HTTP cache so a version bump always ships fresh files
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  // only our own old caches: Cache Storage is per-origin, and sibling apps
  // (shortdeck-journal, range-lab, squid-web) share it on GitHub Pages
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
/* Cache-first, and nothing refreshes a file on its own.

   This used to be stale-while-revalidate: serve the cached copy, then put the
   network's copy back into the same cache. Each file then healed on its own
   schedule, which builds a version that never shipped — a new app.js next to
   the vocab.js from four builds ago. It boots, and the first render that
   touches something the old file doesn't define throws, so a panel comes up
   empty and its buttons do nothing. Every file in here was installed together
   by one worker, and only an install, which replaces the shell all at once,
   may change it. Staying current is the worker's job: app.js calls
   reg.update() on boot and on every return to the front.

   A miss that is also offline answers Response.error(); returning undefined
   from respondWith fails the request instead, which on a navigation is a blank
   app with no message. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") c.put(req, res.clone());
        return res;
      } catch {
        if (req.mode === "navigate") {
          const shell = (await c.match("index.html")) || (await c.match("."));
          if (shell) return shell;
        }
        return Response.error();
      }
    })
  );
});
