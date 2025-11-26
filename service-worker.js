// VERSION AUTO-GENERATA: cambia questa data quando fai modifiche
const VERSION = '2025.11.26.1'; // Formato: YYYY.MM.DD.BUILD
const CACHE_NAME = `vecchia-dogana-v${VERSION}`;

const urlsToCache = [
  './',
  './index.html',
  './chiusura.html',
  './prenotazioni.html',
  './dashboard.html',
  './SfondoVD.png',
  './musica-sottofondo.mp3',
  './manifest.json',
  './icon-32x32.png',
  './icon-152x152.png'
];

// Installazione - caching dei file essenziali
self.addEventListener('install', event => {
  console.log(`[SW] Installazione versione ${VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`[SW] Cache aperta: ${CACHE_NAME}`);
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Attivazione - pulizia cache vecchie
self.addEventListener('activate', event => {
  console.log(`[SW] Attivazione versione ${VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW] Rimozione cache vecchia: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - strategia cache-first
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Messaggi - permette di ottenere la versione da JavaScript
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
});
