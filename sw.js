// Service worker: makes MZN GAMING installable and playable offline.
// Same-origin files are network-first (so updates land instantly when online,
// cache is the offline fallback). CDN libraries are cache-first (versioned URLs).
const CACHE = 'mzn-gaming-v1';
const SHELL = [
  './', 'index.html', 'css/style.css',
  'js/main.js', 'js/cars.js', 'js/hand.js', 'js/net.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== location.origin) {
    // CDN (three.js, MediaPipe, PeerJS): cache-first, fall back to network.
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  // Same-origin: network-first, cache fallback (offline).
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, res.clone());
      return res;
    } catch (err) {
      return (await caches.match(req)) || (await caches.match('./'));
    }
  })());
});
