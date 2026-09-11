/** Verifica la politica di retry: ritentare una richiesta LENTA duplica il lavoro. */
import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync(
  'C:/Users/guren/Dropbox/- PROGETTI/- LOCAL COPY/VDC/Frontend/prenotazioni.html', 'utf8');
const codice = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];

const elementoFinto = new Proxy({}, {
  get: (o, k) => {
    if (k === 'classList') return { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
    if (k === 'style') return {};
    if (k === 'querySelectorAll') return () => [];
    if (k === 'parentNode') return elementoFinto;
    if (typeof k === 'string' && ['appendChild','insertBefore','addEventListener'].includes(k)) return () => {};
    return o[k] !== undefined ? o[k] : '';
  },
  set: (o, k, v) => { o[k] = v; return true; }
});

let tentativi = 0;
let modalita = 'lento';

const sandbox = {
  console: { log(){}, warn(){}, error(){} },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){}, key: () => null, length: 0 },
  document: { addEventListener(){}, getElementById: () => elementoFinto,
              querySelector: () => elementoFinto, querySelectorAll: () => [],
              createElement: () => elementoFinto, body: elementoFinto },
  window: { innerWidth: 1400, matchMedia: () => ({ matches: false }), addEventListener(){} },
  navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve(), addEventListener(){} } },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval, Date, JSON, Math, AbortController,
  fetch: (url, opt) => {
    tentativi++;
    if (modalita === 'rete_caduta') return Promise.reject(new TypeError('Failed to fetch'));
    // "lento": non risponde mai; deve intervenire il timeout
    return new Promise((risolvi, rifiuta) => {
      opt.signal.addEventListener('abort', () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        rifiuta(e);
      });
    });
  }
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(codice, sandbox, { filename: 'prenotazioni.html' });

let ok = 0, ko = 0;
const V = (nome, atteso, ottenuto) => {
  if (JSON.stringify(atteso) === JSON.stringify(ottenuto)) { ok++; console.log('  OK   ' + nome); }
  else { ko++; console.log(`  KO   ${nome}\n         atteso: ${JSON.stringify(atteso)}  ottenuto: ${JSON.stringify(ottenuto)}`); }
};

console.log('\n-- risposta LENTA (il server sta ancora lavorando) --');
tentativi = 0; modalita = 'lento';
let errore = null;
const t0 = Date.now();
try {
  await sandbox.fetchConRetry('http://finto', { method: 'POST', body: '{}' }, 3, 300);
} catch (e) { errore = e; }
const durata = Date.now() - t0;
V('UN SOLO tentativo: non si duplica il lavoro sul server', 1, tentativi);
V('si arrende subito invece di aspettare 3 timeout', true, durata < 900);
V('e propaga un AbortError', 'AbortError', errore && errore.name);

console.log('\n-- rete davvero caduta --');
tentativi = 0; modalita = 'rete_caduta';
errore = null;
try {
  await sandbox.fetchConRetry('http://finto', { method: 'POST', body: '{}' }, 3, 300);
} catch (e) { errore = e; }
V('qui invece ritenta tutte e 3 le volte', 3, tentativi);
V('e alla fine propaga l errore di rete', 'TypeError', errore && errore.constructor.name);

console.log('\n-- il timeout predefinito e stato allungato --');
V('45 secondi, non 20', 45000, Number(/timeoutMs = (\d+)/.exec(
  /async function fetchConRetry\([^)]*\)/.exec(codice)[0] + 'timeoutMs = ' +
  /fetchConRetry\(url, options, tentativi = 3, timeoutMs = (\d+)\)/.exec(codice)[1])[1]));

console.log(`\n${'='.repeat(46)}\n  ${ok} passate - ${ko} fallite\n${'='.repeat(46)}`);
process.exit(ko ? 1 : 0);
