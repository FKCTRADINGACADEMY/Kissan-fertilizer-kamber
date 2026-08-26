// ==============================================
// Kissan Fertilizer - Service Worker
// App shell (HTML/CSS/JS/icons/CDN libraries) ko cache karta hai
// taake app fast/smooth load ho aur bina internet ke bhi khul sake.
// Firestore ka apna data (products, sales, customers, etc.) is cache
// mein NAHI aata - wo Firebase SDK khud persistentLocalCache se
// offline sambhalti hai (index.html mein pehle se configured hai).
// ==============================================

// IMPORTANT: har baar jab bhi app mein koi bhi badlaav (update) karein,
// is version number ko badal dein (e.g. v1 -> v2) taake purana cache
// hat jaye aur sabko naya version mile.
const CACHE_VERSION = 'kissan-fertilizer-v73-phase13';

const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './thermal-printer.js',
  './security-language.js',
  './phase2-orders.js',
  './phase3-inventory.js',
  './phase4-accounts.js',
  './phase5-reports.js',
  './phase6-enterprise.js',
  './phase7-advanced.js',
  './phase8-ledger.js',
  './phase9-year.js',
  './phase10-polish.js',
  './phase11-ops.js',
  './phase12-books.js',
  './phase13-cleanup.js',
  './logo.png',
  './icon-192-1.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {
        // ek file fail ho to poora install fail nahi hona chahiye
        console.warn('[SW] Cache skip:', url);
      })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isFirebaseRequest(url) {
  return /firestore\.googleapis\.com|firebaseio\.com|identitytoolkit|firebasestorage\.googleapis\.com|firebaseinstallations/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Firestore writes/auth calls ko hath mat lagao
  if (isFirebaseRequest(req.url)) return; // Firebase apna offline data khud sambhalta hai

  // Page navigation (index.html / login.html kholna): pehle internet try karo
  // taake hamesha latest version mile, offline ho to cache se khol do.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Baaki static files (CSS/JS/icons/fonts): cache-first = turant load,
  // background mein latest version bhi update hoti rehti hai.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});


self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
