/* ============================================================
   sw.js — Service worker: precarga la app y la sirve desde
   caché para que funcione sin conexión.
   Sube el número de CACHE al cambiar cualquier archivo; tiene
   que coincidir con VERSION en js/utils.js.
   ============================================================ */
const CACHE = 'japon-travel-v1.0.8';
// Todas las apps de alexlobar.github.io comparten el almacén de cachés: sólo se tocan las nuestras.
const PREFIX = 'japon-travel-';

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
      // 'reload' salta la caché HTTP del navegador (GitHub Pages da 10 min):
      // sin esto, una versión subida poco después de la anterior podía
      // guardar en la caché nueva archivos de la vieja.
      .then(function (cache) {
        return cache.addAll(ASSETS.map(function (url) {
          return new Request(url, { cache: 'reload' });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          // Borra versiones viejas de ESTA app (y la caché del mapa de hasta la v1.0.3),
          // nunca las de Hábitos u otras apps del mismo dominio.
          .filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Las APIs (Overpass, Google, Frankfurter, Nominatim) van siempre a la red:
  // la app ya guarda lo que necesita offline (p. ej. el último tipo de cambio).
  if (url.origin !== self.location.origin) return;

  // Al compartir desde Google Maps se abre index.html?title=…&text=…: es la misma página.
  const page = request.mode === 'navigate';
  event.respondWith(
    caches.match(request, { ignoreSearch: page }).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic' && !(page && url.search)) {
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
});
