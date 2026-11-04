/* Kissan Fertilizer — Service Worker
   Version index.html ke <meta name="kissan-version"> se aata hai (sw.js?v=...) — version badalte hi naya cache banta hai.
   • HTML / JS / JSON: pehle internet (hamesha taaza), internet na ho to cache (offline chalta rahe)
   • Firebase / Firestore / Auth: SW kabhi nahi chhoota (live data, koi purana jawab nahi)
   • Icons / logo / CDN libraries / fonts: cache se foran, peechhe se update */
const VER = (function () { try { return new URL(self.location.href).searchParams.get('v') || '20261104a'; } catch (e) { return '20261104a'; } })();
const CACHE = 'kissan-shell-' + VER;
const SHELL = [
  './', './index.html', './login.html', './manifest.json',
  './logo.png', './icon-192-1.png', './icon-512.png',
  './thermal-printer.js', './security-language.js', './phases-bundle.js', './ledger.js'
];
const LIVE_HOSTS = [
  'firestore.googleapis.com', 'firebaseinstallations.googleapis.com', 'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com', 'www.googleapis.com', 'firebase.googleapis.com', 'apis.google.com',
  'firebaseapp.com', 'firebasestorage.googleapis.com'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // ek file na mile to poora install fail na ho
      return Promise.all(SHELL.map(function (u) {
        return fetch(new Request(u, { cache: 'no-cache' })).then(function (r) { if (r && r.ok) return cache.put(u, r); }).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    const old = keys.filter(function (k) { return k !== CACHE; });
    await Promise.all(old.map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
    if (old.length) {   // pehli install par reload nahi — sirf update par
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(function (c) { try { c.postMessage({ type: 'SW_UPDATED', version: VER, auto: true }); } catch (e) {} });
    }
  })());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isLive(url) {
  return LIVE_HOSTS.some(function (h) { return url.hostname === h || url.hostname.endsWith('.' + h); });
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isLive(url)) return;                                   // live data — seedha network
  if (url.searchParams.has('vcheck')) return;                // version ping hamesha network se

  const sameOrigin = url.origin === self.location.origin;
  const path = url.pathname.toLowerCase();
  const isCode = sameOrigin && (req.mode === 'navigate' || path.endsWith('/') || /\.(html|js|json)$/.test(path));

  if (isCode) {
    // network-first: naya code hamesha pehle; offline par cache
    event.respondWith((async function () {
      const cache = await caches.open(CACHE);
      try {
        const net = await fetch(new Request(req.url, { cache: 'no-cache', credentials: req.credentials }));
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch (e) {
        const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) ||
                    (req.mode === 'navigate' ? (await cache.match('./index.html')) : null);
        if (hit) return hit;
        return new Response('Offline — internet aane par dobara try karein', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // baqi (images, icons, CDN libs, fonts): cache-first + background update
  event.respondWith((async function () {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, sameOrigin ? { ignoreSearch: true } : undefined);
    const upd = fetch(req).then(function (net) {
      if (net && (net.ok || net.type === 'opaque')) cache.put(req, net.clone());
      return net;
    }).catch(function () { return null; });
    if (hit) { event.waitUntil(upd); return hit; }
    const net = await upd;
    return net || new Response('', { status: 504 });
  })());
});
