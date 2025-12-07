// ═══════════════════════════════════════════════════════════════════
//  SERVICE WORKER - VECCHIA DOGANA - VERSIONE SEMPLIFICATA
//  Cambia SOLO questo numero ad ogni aggiornamento ↓
// ═══════════════════════════════════════════════════════════════════
const VERSION = '3.8.9';
// ═══════════════════════════════════════════════════════════════════

// NOTA: Non usiamo cache, quindi questi path sono solo di riferimento
// const ASSETS = [
//   './',
//   './index.html',
//   './chiusura.html',
//   './prenotazioni.html',
//   './dashboard.html',
//   './assets/images/caffe.png',
//   './assets/audio/pirate-theme.mp3',
//   './manifest.json'
// ];

// ═══════════════════════════════════════════════════════════════════
// INSTALL: Attiva immediatamente
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log(`🏴‍☠️ [SW v${VERSION}] Installato!`);
  self.skipWaiting();
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVATE: Elimina TUTTE le cache + prendi controllo
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log(`🔄 [SW v${VERSION}] Attivazione...`);
  
  event.waitUntil(
    Promise.all([
      // Elimina TUTTE le cache (vecchie e nuove)
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))),
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
// FETCH: SEMPRE dalla rete, ZERO cache
// ═══════════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
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

console.log(`🏴‍☠️ Service Worker v${VERSION} - Network First, Zero Cache`);
