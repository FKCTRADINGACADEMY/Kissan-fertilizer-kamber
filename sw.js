/* Kissan Fertilizer SW — auto cache version + network-first updates */
var SW_VERSION = '20260925m';
var CACHE_NAME = 'kissan-' + SW_VERSION;
var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './phases-bundle.js',
  './security-language.js',
  './ledger.js',
  './thermal-printer.js',
  './sw.js'
];

self.addEventListener('install', function (event) {
  // Activate new SW immediately so shops get updates without waiting
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () {
        return Promise.all(
          PRECACHE.map(function (u) {
            return cache.add(u).catch(function () {});
          })
        );
      });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k.indexOf('kissan-') === 0 && k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          })
      );
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      return self.clients.matchAll({ type: 'window' }).then(function (clients) {
        clients.forEach(function (c) {
          try {
            c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION, auto: true });
          } catch (e) {}
        });
      });
    })
  );
});

self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: SW_VERSION });
    }
  }
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
    );
  }
});

function isAppShell(pathname, mode) {
  var p = pathname || '';
  return (
    mode === 'navigate' ||
    p === '/' ||
    p.slice(-1) === '/' ||
    p.slice(-5) === '.html' ||
    p.slice(-3) === '.js' ||
    p.indexOf('phases-bundle') !== -1 ||
    p.indexOf('security-language') !== -1 ||
    p.indexOf('ledger') !== -1 ||
    p.indexOf('sw.js') !== -1
  );
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML/JS — new deploy always wins; cache is offline fallback
  if (req.mode === 'navigate' || isAppShell(url.pathname, req.mode)) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              try { cache.put(req, copy); } catch (e) {}
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Other assets: cache-first, then network
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            try { cache.put(req, copy); } catch (e) {}
          });
        }
        return res;
      });
    })
  );
});
