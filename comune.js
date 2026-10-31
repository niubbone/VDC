// ═══════════════════════════════════════════════════════════════════
//  CODICE COMUNE A TUTTE LE PAGINE
//  Prima era copiato in 8 pagine: una correzione fatta in una non
//  arrivava alle altre. Va caricato dopo config.js.
// ═══════════════════════════════════════════════════════════════════

// Valori predefiniti della rete. Una pagina li può cambiare per sé,
// es. le segnalazioni (hosting, ~0,1 s) usano un timeout di 20 s.
const RETE = { tentativi: 3, timeoutMs: 45000 };

// Gettone dei titolari (dal 31/10/2026). Lo rilascia vdc-pin.php quando il
// PIN è giusto, vale 12 ore e resta su questo dispositivo: il PIN si digita
// una volta per turno. Apps Script lo pretende sulle azioni con dati
// personali o economici (AZIONI_TITOLARI in API.js): il controllo vero è là,
// qui c'è solo la comodità di non chiederlo di nuovo.
const GETTONE_STORAGE = 'vdc_gettone';

/**
 * Il gettone se c'è e non è scaduto, altrimenti ''. Oltre le 13 ore di vita
 * residua non vale: scarta i gettoni da 7 giorni rilasciati il 31/10 prima
 * del passaggio a 12 ore (il tablet del locale ne aveva uno).
 */
function leggiGettone() {
  try {
    const g = localStorage.getItem(GETTONE_STORAGE) || '';
    const scadenza = Number(g.split('.')[0]) * 1000;
    return scadenza > Date.now() && scadenza < Date.now() + 13 * 3600 * 1000 ? g : '';
  } catch (e) { return ''; }
}
function salvaGettone(g) { try { localStorage.setItem(GETTONE_STORAGE, g); } catch (e) {} }
function dimenticaGettone() { try { localStorage.removeItem(GETTONE_STORAGE); } catch (e) {} }

// Fetch con timeout + ritentativi, ma ⚠️ MAI SUL TIMEOUT.
//
// Abortire il fetch non ferma l'esecuzione sul server: ritentare accoda
// una seconda richiesta identica mentre la prima sta ancora lavorando. Su
// una scrittura sarebbe peggio — una salvaChiusura o una salvaPrenotazione
// lenta ma riuscita, se ritentata, e' una chiusura o una prenotazione doppia.
//
// La lentezza e' della piattaforma, non nostra: misurato in produzione,
// su chiamate al solo `doGet` (che non apre nessun foglio) 22 stanno sotto
// i 2,6 secondi e due hanno impiegato 44 e 54 secondi.
//
// E c'e' un motivo aritmetico: sopra questa funzione c'e' chiediAlServer,
// che ritenta a sua volta sulla risposta non-JSON. Con i ritentativi anche
// qui i due livelli si MOLTIPLICANO: 3 x 3 x 20s sono tre minuti di
// clessidra invece di venti secondi. E' successo davvero, sulla pagina
// delle chiusure, il 14/09/2026.
//
// Quindi: si ritenta solo su un errore di rete vero (connessione caduta,
// DNS, server irraggiungibile), mai su una richiesta che sta lavorando.
async function fetchConRetry(url, options, tentativi = RETE.tentativi, timeoutMs = RETE.timeoutMs) {
  for (let i = 0; i < tentativi; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn(`Nessuna risposta entro ${timeoutMs / 1000}s: non ritento, la richiesta puo' essere ancora in corso sul server.`);
        throw error;
      }
      if (i === tentativi - 1) throw error;
      await new Promise(r => setTimeout(r, 800 * Math.pow(2, i)));
    }
  }
}

/**
 * Chiede qualcosa al server della pagina (la sua costante API_URL) e
 * pretende JSON.
 *
 * Apps Script, quando e' freddo o sotto sforzo, non risponde un errore:
 * risponde una PAGINA HTML al posto del JSON, con HTTP 200. Il fetch
 * quindi RIESCE, `fetchConRetry` non ha niente da ritentare — ritenta solo
 * sugli errori di rete — e a esplodere e' `JSON.parse`, con un
 * "Unexpected token '<'" che all'utente non dice niente.
 *
 * Succede soprattutto alla PRIMA chiamata dopo un rilascio o dopo una
 * pausa, ed e' transitoria: la seconda quasi sempre passa. Per questo qui
 * si ritenta da soli sulla risposta non-JSON, con una pausa crescente, e
 * solo se insiste si parla in italiano invece che in gergo di parser.
 */
async function chiediAlServer(azione, dati, tentativi = 3) {
  let ultimaRisposta = '';
  for (let i = 0; i < tentativi; i++) {
    const risposta = await fetchConRetry(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: azione, ...dati, gettone: leggiGettone() })
    });
    ultimaRisposta = await risposta.text();
    let r;
    try {
      r = JSON.parse(ultimaRisposta);
    } catch (e) {
      console.warn(`[${azione}] risposta non-JSON al tentativo ${i + 1}/${tentativi}:`,
        ultimaRisposta.slice(0, 150));
      if (i < tentativi - 1) {
        await new Promise(r => setTimeout(r, 1200 * (i + 1)));
      }
      continue;
    }
    // Gettone scaduto o assente: si torna al PIN, che ne rilascia uno nuovo
    if (r && r.codice === 'PIN') {
      dimenticaGettone();
      location.href = 'index.html?pin=1';
      throw new Error(r.errore);
    }
    return r;
  }
  throw new Error('Il server ha risposto in modo inatteso. Di solito basta riprovare fra qualche secondo.');
}

// Nome del locale nei testi fissi delle pagine: <span data-locale="nome">.
// Il testo scritto nell'HTML resta come riserva se questo file non arriva.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-locale]').forEach(el => {
    const valore = VDC_CONFIG.locale[el.dataset.locale];
    if (valore) el.textContent = valore;
  });
});
