/* ═══════════════════════════════════════════════════════════════
   EM SUITE PRO — service worker
   Ing. Edisson Macías Quevedo

   Guarda la app en la tablet para que abra y funcione sin datos.
   También guarda las librerías externas (PDF, 3D, íconos, fuentes)
   la primera vez que se usan: si no se hiciera, en obra sin señal
   la app abriría pero no podrías generar el informe ni ver el 3D.

   Lo que NUNCA se cachea: Firebase, Telegram y el robot de Google.
   Esos son datos vivos y deben fallar limpio para que la app los
   ponga en cola y los reintente cuando vuelva la señal.
   ═══════════════════════════════════════════════════════════════ */

const CACHE = 'em-suite-v8';

// La app
const PROPIOS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// Librerías externas que la app necesita para trabajar sin señal
const EXTERNOS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
];

// Dominios de datos en vivo: siempre a la red
const EN_VIVO = ['api.telegram.org', 'firestore.googleapis.com', 'script.google.com',
                 'script.googleusercontent.com', 'firebaseio.com'];

function esEnVivo(url) {
  return EN_VIVO.some(function (d) { return url.hostname.indexOf(d) >= 0; });
}

// Guarda una librería externa. Se pide con CORS a propósito: una
// respuesta "no-cors" llega opaca y el navegador no la deja guardar,
// que es justo lo que hacía que el PDF y el 3D no sirvieran sin señal.
function guardarExterno(cache, u) {
  return fetch(u, { mode: 'cors', credentials: 'omit' })
    .then(function (r) { if (r && r.ok) return cache.put(u, r.clone()); })
    .catch(function () { });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Lo propio tiene que estar sí o sí
      return c.addAll(PROPIOS).then(function () {
        // Lo externo es "mejor si está": si alguno falla, la instalación sigue
        return Promise.all(EXTERNOS.map(function (u) { return guardarExterno(c, u); }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Datos vivos: nunca desde caché
  if (esEnVivo(url)) return;

  const propio = (url.origin === self.location.origin);

  if (propio) {
    // La app: primero la red, para recibir actualizaciones al recargar;
    // si no hay señal, se sirve la copia guardada.
    e.respondWith(
      fetch(req).then(function (r) {
        const copia = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); }).catch(function () { });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Librerías, fuentes e íconos: primero la copia guardada (son fijas y pesadas).
  // Si no está, se entrega desde la red y en paralelo se guarda una copia
  // pedida con CORS, que es la única que el navegador permite almacenar.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) {
        caches.open(CACHE).then(function (c) { guardarExterno(c, req.url); }).catch(function () { });
        return r;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true });
      });
    })
  );
});

// La app puede pedir que se guarden las librerías de una vez
self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'EM_PRECACHE') return;
  caches.open(CACHE).then(function (c) {
    Promise.all(EXTERNOS.map(function (u) { return guardarExterno(c, u); }))
      .then(function () { return c.keys(); })
      .then(function (ks) {
        if (e.source) e.source.postMessage({ type: 'EM_PRECACHE_OK', guardados: ks.length });
      });
  });
});
