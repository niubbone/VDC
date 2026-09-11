/**
 * Banco di prova per la logica di cache/precarico di prenotazioni.html.
 * Si estrae il <script> della pagina e lo si esegue con DOM, localStorage e
 * fetch finti, poi si interrogano le funzioni come farebbe il browser.
 */
import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync(
  'C:/Users/guren/Dropbox/- PROGETTI/- LOCAL COPY/VDC/Frontend/prenotazioni.html', 'utf8');
const codice = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];

// ── ambiente finto ──────────────────────────────────────────────
const archivio = new Map();
const localStorage = {
  getItem: k => (archivio.has(k) ? archivio.get(k) : null),
  setItem: (k, v) => archivio.set(k, String(v)),
  removeItem: k => archivio.delete(k),
  key: i => [...archivio.keys()][i],
  get length() { return archivio.size; }
};

const elementoFinto = new Proxy({}, {
  get: (o, k) => {
    if (k === 'classList') return { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
    if (k === 'style') return {};
    if (k === 'querySelectorAll') return () => [];
    if (k === 'parentNode') return elementoFinto;
    if (typeof k === 'string' && ['appendChild','insertBefore','addEventListener','focus','click','setSelectionRange','scrollIntoView'].includes(k)) return () => {};
    return o[k] !== undefined ? o[k] : '';
  },
  set: (o, k, v) => { o[k] = v; return true; }
});

let chiamateFetch = [];
const sandbox = {
  console: { log(){}, warn(){}, error(){} },
  localStorage,
  document: {
    addEventListener(){}, getElementById: () => elementoFinto,
    querySelector: () => elementoFinto, querySelectorAll: () => [],
    createElement: () => elementoFinto, body: elementoFinto
  },
  window: { innerWidth: 1400, matchMedia: () => ({ matches: false }), addEventListener(){}, scrollTo(){} },
  navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve(), addEventListener(){} } },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval, Date, JSON, Math,
  AbortController,
  fetch: async (url, opt) => {
    const corpo = JSON.parse(opt.body);
    chiamateFetch.push(corpo);
    const risposta = corpo.action === 'getPrenotazioni'
      ? { prenotazioni: [{ id: 'P-' + corpo.anno + '-' + corpo.mese, data: '2026-01-01' }] }
      : { eventi: [{ id: 'EV1', nome: 'Degustazione', data: '2026-01-01' }] };
    return { ok: true, text: async () => JSON.stringify(risposta) };
  }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(codice, sandbox, { filename: 'prenotazioni.html' });

// ── prove ───────────────────────────────────────────────────────
let ok = 0, ko = 0;
const V = (nome, atteso, ottenuto) => {
  const buono = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (buono) { ok++; console.log('  OK   ' + nome); }
  else { ko++; console.log(`  KO   ${nome}\n         atteso:   ${JSON.stringify(atteso)}\n         ottenuto: ${JSON.stringify(ottenuto)}`); }
};
const R = e => vm.runInContext(e, sandbox);

console.log('\n-- chiave e confine dei mesi --');
V('chiave mese', '2026-09', R('chiaveMese(2026, 8)'));
V('chiave con zero', '2026-01', R('chiaveMese(2026, 0)'));
const oggi = new Date();
V('mese scorso e passato', true, R(`mesePassato(${oggi.getFullYear()}, ${oggi.getMonth() - 1})`));
V('mese corrente NON e passato', false, R(`mesePassato(${oggi.getFullYear()}, ${oggi.getMonth()})`));
V('anno scorso e passato', true, R(`mesePassato(${oggi.getFullYear() - 1}, 11)`));
V('anno prossimo non e passato', false, R(`mesePassato(${oggi.getFullYear() + 1}, 0)`));
V('validita lunga per i mesi chiusi', 12 * 60 * 60 * 1000, R(`validitaMese(2020, 0)`));
V('validita breve per il mese in corso', 5 * 60 * 1000, R(`validitaMese(${oggi.getFullYear()}, ${oggi.getMonth()})`));

console.log('\n-- memoria per mese --');
R('salvaMeseInMemoria(2026, 8, [{id:"A"}]); salvaMeseInMemoria(2026, 9, [{id:"B"}]);');
V('due mesi convivono in memoria', 2, R('memoriaMesi.size'));
V('settembre non e stato sovrascritto', 'A', R('mesiInMemoria(2026, 8).prenotazioni[0].id'));
V('ottobre c e', 'B', R('mesiInMemoria(2026, 9).prenotazioni[0].id'));
V('un mese mai visto e null', null, R('mesiInMemoria(2026, 11)'));
// Un mese chiuso salvato 6 ore fa deve risultare ancora fresco; il mese in
// corso no: e' tutto il senso della validita' differenziata.
R(`memoriaMesi.set(chiaveMese(2020, 0), { prenotazioni: [], timestamp: Date.now() - 6*60*60*1000 });`);
V('mese chiuso di 6 ore fa: ancora fresco', true, R('mesiInMemoria(2020, 0).fresco'));
R(`memoriaMesi.set(chiaveMese(${oggi.getFullYear()}, ${oggi.getMonth()}), { prenotazioni: [], timestamp: Date.now() - 6*60*1000 });`);
V('mese in corso di 6 minuti fa: scaduto', false, R(`mesiInMemoria(${oggi.getFullYear()}, ${oggi.getMonth()}).fresco`));

console.log('\n-- invalidazione dopo una scrittura --');
R('invalidaCacheMemoria();');
V('svuota TUTTI i mesi, non solo quello a schermo', 0, R('memoriaMesi.size'));
V('svuota anche gli eventi', null, R('memoriaEventi'));

console.log('\n-- cache localStorage --');
V('chiave stabile e ordinata', 'vdc_cache_getPrenotazioni_anno=2026&mese=9',
  R('getCacheKey("getPrenotazioni", { mese: 9, anno: 2026 })'));
R('setCache("vdc_prova", { valore: 42 });');
V('rilettura', 42, R('getCache("vdc_prova").valore'));
// La voce scaduta non va cancellata: serve al primo disegno e al ramo offline.
R('localStorage.setItem("vdc_vecchia", JSON.stringify({ data: { v: 1 }, timestamp: Date.now() - 60*60*1000 }));');
V('scaduta: getCache dice no', null, R('getCache("vdc_vecchia")'));
V('scaduta: MA resta nel localStorage', true, R('localStorage.getItem("vdc_vecchia") !== null'));
V('e leggiCacheGrezza la restituisce', 1, R('leggiCacheGrezza("vdc_vecchia").data.v'));
V('con la sua eta in ms', true, R('leggiCacheGrezza("vdc_vecchia").age > 59*60*1000'));
V('ttl eventi piu lungo', 30 * 60 * 1000, R('ttlPerAzione("getEventi")'));
V('ttl normale per le prenotazioni', 5 * 60 * 1000, R('ttlPerAzione("getPrenotazioni")'));
V('eventi di 10 minuti fa ancora validi', true, (() => {
  R('localStorage.setItem(getCacheKey("getEventi", {}), JSON.stringify({ data: { eventi: [] }, timestamp: Date.now() - 10*60*1000 }));');
  return R('getCache(getCacheKey("getEventi", {}), ttlPerAzione("getEventi")) !== null');
})());

console.log('\n-- precarico: quali mesi chiede --');
const mesiChiesti = async (anno, mese) => {
  chiamateFetch = [];
  R('invalidaCacheMemoria();');
  R('archivioSvuota = true;');
  for (const k of [...archivio.keys()]) if (k.startsWith('vdc_cache_')) archivio.delete(k);
  R(`annoCorrente = ${anno}; meseCorrente = ${mese};`);
  R('preparaMesiVicini();');
  await new Promise(r => setTimeout(r, 2600));
  return chiamateFetch.filter(c => c.action === 'getPrenotazioni')
    .map(c => c.anno + '-' + String(c.mese).padStart(2, '0')).sort();
};
V('da settembre chiede agosto e ottobre', ['2026-08', '2026-10'], await mesiChiesti(2026, 8));
V('da gennaio scavalca a dicembre dell anno prima', ['2025-12', '2026-02'], await mesiChiesti(2026, 0));
V('da dicembre scavalca a gennaio dell anno dopo', ['2026-11', '2027-01'], await mesiChiesti(2026, 11));

console.log('\n-- il precarico non ripete cio che ha gia --');
chiamateFetch = [];
R('invalidaCacheMemoria(); annoCorrente = 2026; meseCorrente = 5;');
R('salvaMeseInMemoria(2026, 4, [{id:"gia-qui"}]);');
R('preparaMesiVicini();');
await new Promise(r => setTimeout(r, 2600));
V('salta il mese gia in memoria e fresco', ['2026-07'],
  chiamateFetch.filter(c => c.action === 'getPrenotazioni')
    .map(c => c.anno + '-' + String(c.mese).padStart(2, '0')));

console.log(`\n${'='.repeat(46)}\n  ${ok} passate - ${ko} fallite\n${'='.repeat(46)}`);
process.exit(ko ? 1 : 0);
