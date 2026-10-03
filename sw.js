/* ============================================================
   sw.js — Service worker: precarga la app y la sirve desde
   caché para que funcione sin conexión. Las teselas del mapa y
   Leaflet se guardan al usarse (caché aparte, con límite).
   Sube el número de CACHE al cambiar cualquier archivo; tiene
   que coincidir con VERSION en js/utils.js.
   ============================================================ */
const CACHE = 'japon-travel-v1.0.1';
const RUNTIME = 'japon-travel-runtime';
const MAX_RUNTIME = 400;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/styles.css',
  './js/utils.js',
  './js/data.js',
  './js/store.js',
  './js/logic.js',
  './js/services.js',
  './js/ui.js',
  './js/views-common.js',
  './js/views-trip.js',
  './js/views-places.js',
  './js/views-money.js',
  './js/views-more.js',
  './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k !== CACHE && k !== RUNTIME; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Recursos de terceros que merece la pena tener offline una vez vistos. */
function isRuntimeCacheable(url) {
  return url.hostname === 'unpkg.com' || /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname);
}

async function trimRuntime() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_RUNTIME; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        }).catch(function () {
          if (request.mode === 'navigate') return caches.match('./index.html');
          throw new Error('Recurso no disponible sin conexión');
        });
      })
    );
    return;
  }

  // Mapa: primero caché (funciona offline en zonas ya vistas), si no, red.
  if (isRuntimeCacheable(url)) {
    event.respondWith(
      caches.open(RUNTIME).then(function (cache) {
        return cache.match(request).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (response) {
            if (response && (response.status === 200 || response.type === 'opaque')) {
              cache.put(request, response.clone());
              trimRuntime();
            }
            return response;
          });
        });
      })
    );
  }
  // Las APIs (Overpass, Google, Frankfurter, Nominatim) van siempre a la red:
  // la app ya guarda lo que necesita offline (p. ej. el último tipo de cambio).
});
