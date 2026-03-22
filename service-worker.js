// ═══════════════════════════════════════════════════════════════════
//  SERVICE WORKER - VECCHIA DOGANA - VERSIONE OTTIMIZZATA
//  Cambia SOLO questo numero ad ogni aggiornamento ↓
// ═══════════════════════════════════════════════════════════════════
const VERSION = '4.2.0';
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// INSTALL: Attiva immediatamente
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log(`🏴‍☠️ [SW v${VERSION}] Installato!`);
  self.skipWaiting();
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVATE: Mantieni cache assets, elimina solo cache HTML vecchie
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log(`🔄 [SW v${VERSION}] Attivazione...`);
  
  event.waitUntil(
    Promise.all([
      // Elimina cache HTML vecchie, mantieni assets
      caches.keys().then(names => {
        return Promise.all(
          names.map(name => {
            // Mantieni cache assets, elimina solo se versione diversa
            if (name.startsWith('assets-') && name !== `assets-${VERSION}`) {
              return caches.delete(name);
            }
            // Elimina altre cache vecchie
            if (!name.startsWith('assets-')) {
              return caches.delete(name);
            }
          })
        );
      }),
      // Prendi controllo immediato
      clients.claim()
    ]).then(() => {
      console.log(`✅ [SW v${VERSION}] Attivo!`);
      // Notifica tutte le pagine
      clients.matchAll().then(clientsList => {
        clientsList.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: VERSION });
        });
      });
    })
  );
});

// ═══════════════════════════════════════════════════════════════════
// FETCH: HTML dalla rete, immagini/assets dalla cache
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // ⭐ Immagini, audio, fonts → cache-first (veloce!)
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|mp3|woff2|woff|ttf|ico)$/i)) {
    event.respondWith(
      caches.open(`assets-${VERSION}`).then(cache => {
        return cache.match(event.request).then(cached => {
          if (cached) {
            console.log(`📦 [Cache] ${url.pathname}`);
            return cached;
          }
          // Non in cache, scarica e salva
          console.log(`🌐 [Rete] ${url.pathname}`);
          return fetch(event.request).then(response => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            return new Response('Offline', { status: 503 });
          });
        });
      })
    );
    return;
  }
  
  // ⭐ HTML e tutto il resto → sempre rete (zero cache)
  event.respondWith(
    fetch(event.request).catch(() => 
      new Response('Offline', { status: 503 })
    )
  );
});

// ═══════════════════════════════════════════════════════════════════
// MESSAGE: Rispondi con versione
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log(`🏴‍☠️ Service Worker v${VERSION} - HTML: Network First | Assets: Cache First`);
