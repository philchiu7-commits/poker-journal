/* Service worker: cache the app shell so it runs offline once installed. */
const CACHE = "journal-v139";
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
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
