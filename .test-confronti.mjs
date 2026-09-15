/**
 * Banco di prova per il confronto periodi del Quartier Generale: estrae da
 * dashboard.html le funzioni di calcolo così come sono e le esegue su dati
 * costruiti a mano.
 *
 * Uso:  node .test-confronti.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(QUI, 'dashboard.html'), 'utf8');

const pezzo = (inizio, fine) => {
  const i = html.indexOf(inizio);
  if (i < 0) throw new Error('Non trovato nella pagina: ' + inizio);
  return html.slice(i, html.indexOf(fine, i) + fine.length);
};
const codice = [
  pezzo('const MESI_BREVI', ';'),
  pezzo('const GIORNI_BREVI', ';'),
  pezzo('const ORDINE_GIORNI', ';'),
  ...['dataIsoConfronto', 'periodoConfronto', 'variazionePct', 'aggregaConfronto', 'tettoAsse']
    .map(n => pezzo(`function ${n}(`, '\n    }'))
].join('\n');
const f = new Function(codice + '\nreturn { periodoConfronto, aggregaConfronto, variazionePct, tettoAsse };')();

let passate = 0, fallite = 0;
function verifica(nome, atteso, ottenuto) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (ok) { passate++; console.log(`  OK   ${nome}`); }
  else { fallite++; console.log(`  KO   ${nome}\n       atteso:   ${JSON.stringify(atteso)}\n       ottenuto: ${JSON.stringify(ottenuto)}`); }
}
const estremi = p => [p.da, p.a, p.etichetta];

console.log('\n-- Periodi --');
const dic = f.periodoConfronto(2024, 12, 1);
verifica('dicembre-gennaio scavalca l\'anno', ['2024-12-01', '2025-01-31', 'dic 2024 – gen 2025'], estremi(dic));
verifica('mesi del periodo in ordine', [[2024, 12], [2025, 1]], dic.mesi.map(m => [m.anno, m.mese]));
verifica('giugno-agosto', ['2025-06-01', '2025-08-31', 'giu–ago 2025'], estremi(f.periodoConfronto(2025, 6, 8)));
verifica('mese singolo', ['2026-02-01', '2026-02-28', 'feb 2026'], estremi(f.periodoConfronto(2026, 2, 2)));
verifica('febbraio bisestile', '2024-02-29', f.periodoConfronto(2024, 2, 2).a);
verifica('dodici mesi da marzo', ['2025-03-01', '2026-02-28', 12],
  (p => [p.da, p.a, p.mesi.length])(f.periodoConfronto(2025, 3, 2)));

console.log('\n-- Somme, filtro giorni, percentuali --');
const g = (data, giornoSettimana, incasso) => ({ data, giornoSettimana, incasso });
const periodi = [2024, 2025, 2026].map(a => f.periodoConfronto(a, 6, 8));
const risposte = [
  { giorni: [g('2024-06-06', 4, 100), g('2024-06-07', 5, 200), g('2024-06-08', 6, 999), g('2024-07-04', 4, 300)], mesiMancanti: [] },
  { giorni: [g('2025-06-05', 4, 150), g('2025-06-06', 5, 250), g('2025-07-03', 4, 450), g('2025-08-01', 5, 150)], mesiMancanti: [] },
  { giorni: [], mesiMancanti: ['Giugno 2026'] }
];
// Oggi 15 luglio 2025: il 2025 è in corso, il 2026 non è ancora iniziato
const righe = f.aggregaConfronto(periodi, risposte, [4, 5], new Date(2025, 6, 15));
verifica('2024 giovedì+venerdì: il sabato resta fuori', [600, 3, 200], [righe[0].totale, righe[0].giorni, righe[0].media]);
verifica('2025 giovedì+venerdì', [1000, 4, 250], [righe[1].totale, righe[1].giorni, righe[1].media]);
verifica('per mese 2024 (giu, lug, ago)', [300, 300, 0], righe[0].perMese.map(m => m.totale));
verifica('per mese 2025', [400, 450, 150], righe[1].perMese.map(m => m.totale));
verifica('per giorno 2025: giovedì e venerdì', [[600, 2, 300], [400, 2, 200]],
  [4, 5].map(d => [righe[1].perGiorno[d].totale, righe[1].perGiorno[d].giorni, righe[1].perGiorno[d].media]));
verifica('il primo periodo non ha variazione', [null, null], [righe[0].deltaTotale, righe[0].deltaMedia]);
verifica('variazione totale 2025 su 2024', '66.7', righe[1].deltaTotale.toFixed(1));
verifica('variazione media 2025 su 2024', '25.0', righe[1].deltaMedia.toFixed(1));
verifica('in corso / non iniziato', [false, true, false], righe.map(x => x.inCorso));
verifica('periodo futuro: nessuna variazione, non -100%', [true, null], [righe[2].futuro, righe[2].deltaTotale]);
verifica('mesi mancanti portati avanti', ['Giugno 2026'], righe[2].mesiMancanti);

const soloVenerdi = f.aggregaConfronto(periodi.slice(0, 2), risposte, [5], new Date(2025, 11, 1));
verifica('solo venerdì', [200, 400], soloVenerdi.map(x => x.totale));
verifica('base a zero: variazione assente', null, f.variazionePct(0, 500));
verifica('calo', '-50.0', f.variazionePct(400, 200).toFixed(1));

console.log('\n-- Asse --');
verifica('tetto tondo', [0, 100, 1000, 2000, 2500, 5000, 10000],
  [0, 100, 870, 1234, 2100, 4999, 5001].map(f.tettoAsse));

console.log(`\n==============================================`);
console.log(`  ${passate} passate - ${fallite} fallite`);
console.log(`==============================================`);
process.exit(fallite ? 1 : 0);
