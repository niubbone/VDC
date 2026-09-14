/**
 * Banco di prova sui tempi di attesa delle chiamate API.
 *
 * Nasce da un guaio vero del 14/09/2026: chiediAlServer ritenta sulla risposta
 * non-JSON, fetchConRetry ritentava sul timeout, e i due livelli si
 * MOLTIPLICAVANO — 3 x 3 x 20s, tre minuti di clessidra sulla pagina delle
 * chiusure. Qui si verifica che non possa piu' succedere, su ogni pagina.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const PAGINE = ['index.html', 'chiusura.html', 'dashboard.html',
                'gestione-vini.html', 'prenotazioni.html', 'iscrizione.html'];

const elementoFinto = new Proxy({}, {
  get: (o, k) => {
    if (k === 'classList') return { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
    if (k === 'style') return {};
    if (k === 'querySelectorAll') return () => [];
    if (k === 'parentNode') return elementoFinto;
    if (typeof k === 'string' && ['appendChild','insertBefore','addEventListener','focus','remove'].includes(k)) return () => {};
    return o[k] !== undefined ? o[k] : '';
  },
  set: (o, k, v) => { o[k] = v; return true; }
});

function ambiente(fetchFinto) {
  const s = {
    console: { log(){}, warn(){}, error(){} },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){}, key: () => null, length: 0 },
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document: { addEventListener(){}, getElementById: () => elementoFinto,
                querySelector: () => elementoFinto, querySelectorAll: () => [],
                createElement: () => elementoFinto, body: elementoFinto },
    window: { innerWidth: 1400, matchMedia: () => ({ matches: false }), addEventListener(){},
              location: { href: '', search: '', pathname: '/' } },
    navigator: { onLine: true, serviceWorker: {
      register: () => Promise.resolve({ addEventListener(){}, installing: null, waiting: null }),
      addEventListener(){}, ready: Promise.resolve({ addEventListener(){} }),
      controller: null, getRegistrations: () => Promise.resolve([])
    } },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    URLSearchParams, URL, TextDecoder, Promise, Set, Map, Array, Object, String, Number,
    MessageChannel: class { constructor() { this.port1 = { onmessage: null }; this.port2 = {}; } },
    Date, JSON, Math, AbortController, alert(){}, confirm: () => true, prompt: () => null,
    fetch: fetchFinto
  };
  s.globalThis = s; s.self = s;
  vm.createContext(s);
  return s;
}

function codice(pagina) {
  const html = fs.readFileSync(path.join(QUI, pagina), 'utf8');
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n;\n');
}

let ok = 0, ko = 0;
const V = (nome, atteso, ottenuto) => {
  if (JSON.stringify(atteso) === JSON.stringify(ottenuto)) { ok++; console.log('  OK   ' + nome); }
  else { ko++; console.log(`  KO   ${nome}\n         atteso: ${JSON.stringify(atteso)}  ottenuto: ${JSON.stringify(ottenuto)}`); }
};

for (const pagina of PAGINE) {
  console.log(`\n── ${pagina} ──`);

  // 1) server LENTO: una sola richiesta deve partire, mai due
  let partite = 0;
  let s = ambiente((url, opt) => {
    if (url === 'http://finto') partite++;
    return new Promise((_, rifiuta) => {
      opt.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; rifiuta(e);
      });
    });
  });
  vm.runInContext(codice(pagina), s, { filename: pagina });

  const t0 = Date.now();
  let errore = null;
  try {
    await s.fetchConRetry('http://finto', { method: 'POST', body: '{}' }, 3, 250);
  } catch (e) { errore = e; }
  V('server lento: UNA sola richiesta, non tre', 1, partite);
  V('server lento: si arrende subito', true, Date.now() - t0 < 900);
  V('server lento: propaga AbortError', 'AbortError', errore && errore.name);

  // 2) risposta HTML invece di JSON: chiediAlServer deve ritentare da solo,
  //    ma senza che il livello sotto moltiplichi.
  if (codice(pagina).includes('async function chiediAlServer')) {
    partite = 0;
    s = ambiente(async (url, opt) => {
      if (opt && String(opt.body).includes('"action":"getEventi"')) partite++;
      return { ok: true, text: async () => '<!DOCTYPE html><html>errore di Google</html>' };
    });
    vm.runInContext(codice(pagina), s, { filename: pagina });
    const t1 = Date.now();
    let err = null;
    try { await s.chiediAlServer('getEventi', {}, 3); } catch (e) { err = e; }
    const durata = Date.now() - t1;
    V('risposta HTML: esattamente 3 richieste, non 9', 3, partite);
    V('risposta HTML: messaggio in italiano, non del parser', true,
      !!err && /server ha risposto in modo inatteso/i.test(err.message));
    V('risposta HTML: si arrende entro 5 secondi', true, durata < 5000);
    console.log(`         (ha impiegato ${(durata/1000).toFixed(1)}s)`);
  }
}

console.log(`\n${'='.repeat(50)}\n  ${ok} passate - ${ko} fallite\n${'='.repeat(50)}`);
process.exit(ko ? 1 : 0);
