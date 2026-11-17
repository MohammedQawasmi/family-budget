// Service worker: lets the app open fast and install on phones.
// App files: network first (always get updates), cache as fallback.
// Fixed-version CDN libraries and fonts: cache first.
// Supabase API calls are NEVER cached (they hold private data).
const CACHE = "budget-v2";   // bump on every release so phones drop old files
const SHELL = ["./", "index.html", "css/styles.css", "config.js", "js/main.js", "js/api.js", "js/i18n.js", "js/ui.js",
  "js/views/add.js", "js/views/history.js", "js/views/budget.js", "js/views/dashboard.js", "js/views/settings.js",
  "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;                      // private data: no caching

  const isCdn = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname);
  if (isCdn) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // cache: "no-cache" = always ask the server for the newest version (GitHub Pages lets
  // browsers reuse files for 10 minutes otherwise, so a fix would not show up right away).
  e.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
});
