const CACHE_NAME = 'vecchia-dogana-v1.6';
const urlsToCache = [
  './',
  './index.html',
  './chiusura.html',
  './dashboard.html',
  './pirata_appeso.gif',
  './manifest.json'
];

// Installazione - caching dei file essenziali
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aperta');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Attivazione - pulizia cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Rimozione cache vecchia:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - strategia Network First (per dati sempre aggiornati dall'API)
self.addEventListener('fetch', event => {
  // Per le chiamate API, sempre network first
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({ errore: 'Connessione non disponibile' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Per le risorse statiche, cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          // Controlla se è una risposta valida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // Clona la risposta
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
  );
});
