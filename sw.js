/* Kissan Fertilizer SW — robust PWA update (old + new Chrome) */
var SW_VERSION = '20260921n';
var CACHE_NAME = 'kissan-' + SW_VERSION;
var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './phases-bundle.js',
  './security-language.js',
  './ledger.js',
  './sw.js'
];

self.addEventListener('install', function (event) {
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
            c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
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
});

function isAppShell(url) {
  var p = url.pathname || '';
  return (
    url.mode === 'navigate' ||
    p === '/' ||
    p.slice(-1) === '/' ||
    p.slice(-5) === '.html' ||
    p.slice(-3) === '.js' ||
    p.indexOf('phases-bundle') !== -1 ||
    p.indexOf('security-language') !== -1 ||
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

  // Network-first for HTML/JS so updates always reach the shop
  if (req.mode === 'navigate' || isAppShell({ pathname: url.pathname, mode: req.mode })) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (c) {
              c.put(req, copy).catch(function () {});
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (r) {
            return r || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Cache-first for static assets (icons, css images)
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (c) {
              c.put(req, copy).catch(function () {});
            });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });
    })
  );
});
