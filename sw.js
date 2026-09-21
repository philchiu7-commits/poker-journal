/* Service worker: cache the app shell so it runs offline once installed. */
const CACHE = "journal-v158";
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
/* Stale-while-revalidate for same-origin GETs: serve the cached copy instantly,
   then refresh it from the network in the background. Pure cache-first (what
   this was until v157) leaves a phone pinned on whatever version it installed
   until the worker itself updates — which is how Phil sat on v143 while three
   features shipped. Now the assets self-heal one reload later even if the
   worker never turns over. Only `caches.open(CACHE)`, not `caches.match`, so a
   sibling app's cache on this shared origin can never answer. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => { if (res && res.ok && res.type === "basic") c.put(req, res.clone()); return res; })
        .catch(() => cached);
      // Serving the cached copy settles respondWith immediately; keep the worker
      // alive with waitUntil so the background c.put actually persists (iOS can
      // otherwise kill it the moment respondWith resolves).
      if (cached) { e.waitUntil(net); return cached; }
      return net;
    })
  );
});
