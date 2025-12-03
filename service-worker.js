// ═══════════════════════════════════════════════════════════════════
//  SERVICE WORKER - VECCHIA DOGANA
//  Cambia SOLO questo numero ad ogni aggiornamento frontend ↓
// ═══════════════════════════════════════════════════════════════════
const VERSION = '3.5.8';
// ═══════════════════════════════════════════════════════════════════

const CACHE_NAME = `vecchia-dogana-v${VERSION}`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './chiusura.html',
  './prenotazioni.html',
  './versamenti.html',
  './eventi.html',
  './caffe.png',
  './manifest.json'
];

// ═══════════════════════════════════════════════════════════════════
// INSTALL: Attivazione immediata del nuovo Service Worker
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log(`🏴‍☠️ [SW v${VERSION}] Installazione in corso...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`📦 [SW v${VERSION}] Pre-caching assets...`);
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log(`✅ [SW v${VERSION}] Installato! Attivazione immediata...`);
        return self.skipWaiting(); // ← Attiva subito senza aspettare
      })
  );
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVATE: Pulizia cache vecchie + controllo immediato
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log(`🔄 [SW v${VERSION}] Attivazione in corso...`);
  
  event.waitUntil(
    Promise.all([
      // 1. Elimina tutte le cache vecchie
      caches.keys().then(cacheNames => {
        const oldCaches = cacheNames.filter(name => name !== CACHE_NAME);
        if (oldCaches.length > 0) {
          console.log(`🗑️ [SW v${VERSION}] Rimozione cache vecchie:`, oldCaches);
        }
        return Promise.all(
          oldCaches.map(name => caches.delete(name))
        );
      }),
      
      // 2. Prendi controllo di tutte le pagine aperte
      clients.claim()
    ]).then(() => {
      console.log(`✅ [SW v${VERSION}] Attivo e in controllo!`);
      
      // 3. Notifica tutte le pagine del nuovo aggiornamento
      return clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: VERSION
          });
        });
      });
    })
  );
});

// ═══════════════════════════════════════════════════════════════════
// FETCH: Strategia Cache-First con Network Fallback
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  // Ignora richieste non-GET (POST, PUT, etc)
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignora richieste API (vanno sempre al server)
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Trovato in cache
          return cachedResponse;
        }
        
        // Non in cache, fetch dalla rete
        return fetch(event.request).then(networkResponse => {
          // Salva in cache per la prossima volta
          if (networkResponse.status === 200) {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          }
          return networkResponse;
        });
      })
      .catch(error => {
        console.error(`❌ [SW v${VERSION}] Fetch fallito:`, error);
        // Qui potresti servire una pagina offline custom
        return new Response('Offline - Impossibile caricare la risorsa', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// ═══════════════════════════════════════════════════════════════════
// MESSAGE: Gestione messaggi dalle pagine
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log(`🏴‍☠️ Service Worker v${VERSION} caricato`);
