// Service worker de EM Suite: primero la red (versión nueva), y la copia
// guardada solo si no hay conexión. Así no aparece una interfaz vieja al abrir.
const CACHE = 'em-suite-red-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(function (r) {
        if (r && r.ok && r.type === 'basic') {
          var copia = r.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
        }
        return r;
      })
      .catch(function () { return caches.match(e.request); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'EM_PRECACHE' && e.source) {
    e.source.postMessage({ type: 'EM_PRECACHE_OK' });
  }
});
