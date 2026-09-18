/* Kissan Fertilizer service worker — versioned cache, auto activate */
const SW_VERSION = '20260918q';
const CACHE_NAME = 'kissan-' + SW_VERSION;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML + JS + CSS + SW: network-first so updates install everywhere smoothly
  const path = url.pathname || '';
  const isDoc = req.mode === 'navigate' || path.endsWith('.html') || path.endsWith('/') || path.endsWith('sw.js');
  const isAppAsset = path.endsWith('.js') || path.endsWith('.css') || path.endsWith('manifest.json');

  if (isDoc || isAppAsset) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(req).then((r) => r || (isDoc ? caches.match('./index.html') : undefined))
      )
    );
    return;
  }

  // Other assets: cache-first, then network
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
