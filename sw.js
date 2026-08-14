// ==============================================
// KISSAN FERTILIZER - AUTO UPDATE SERVICE WORKER
// ==============================================
// Bump this version string every time you want to force
// a clean cache reset (optional - not required for updates
// to work, since we always fetch fresh HTML from network).
const CACHE_NAME = 'kissan-fertilizer-cache-v1';

// Activate the new service worker immediately, don't wait
// for old tabs to close.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Take control of all open pages immediately, and clean up
// any old caches from previous versions.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Strategy:
// - For the HTML page itself (navigation requests): ALWAYS
//   go to the network first, so every app open gets the latest
//   deployed version automatically. Falls back to cache only
//   if there is no internet connection.
// - For other assets (icons, css, js libs): try cache first,
//   then network, and cache the result for offline use.
self.addEventListener('fetch', (event) => {
    const req = event.request;

    const isHTMLNavigation =
        req.mode === 'navigate' ||
        (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

    if (isHTMLNavigation) {
        event.respondWith(
            fetch(req, { cache: 'no-store' })
                .then((res) => {
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    return res;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req)
                .then((res) => {
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    return res;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
