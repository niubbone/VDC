/**
 * Banco di prova per il filtro e il raggruppamento delle segnalazioni:
 * estrae da segnalazioni.html la funzione così com'è e la interroga.
 *
 * Uso:  node .test-segnalazioni-pagina.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(QUI, 'segnalazioni.html'), 'utf8');

const pezzo = (inizio, fine) => {
  const i = html.indexOf(inizio);
  if (i < 0) throw new Error('Non trovato nella pagina: ' + inizio);
  return html.slice(i, html.indexOf(fine, i) + fine.length);
};
const codice = [
  pezzo('const SENZA_FORNITORE', ';'),
  pezzo('const URGENTI', ';'),
  pezzo('function raggruppaSegnalazioni(', '\n  }')
].join('\n');
const raggruppa = new Function(codice + '\nreturn raggruppaSegnalazioni;')();

let passate = 0, fallite = 0;
function verifica(nome, atteso, ottenuto) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (ok) { passate++; console.log(`  OK   ${nome}`); }
  else { fallite++; console.log(`  KO   ${nome}\n       atteso:   ${JSON.stringify(atteso)}\n       ottenuto: ${JSON.stringify(ottenuto)}`); }
}

const s = (id, categoria, testo, fornitore, stato) => ({ id, categoria, testo, fornitore, stato, creato: '2026-09-20 10:00', chiuso: '' });
const lista = [
  s('1', 'vino', 'Sta finendo il Gemma bianco', 'Gemma', 'aperta'),
  s('2', 'calice', 'Manca un aromatico tra i calici', '', 'aperta'),
  s('3', 'assortimento', 'Mancano bianchi australiani', '', 'aperta'),
  s('4', 'vino', 'Finito il Tandem Rosé', 'Abbondanza', 'chiusa'),
  s('5', 'vino', 'Poco Malbec', 'abbondanza', 'aperta')
];
const soloAperte = { stato: 'aperte' };
const nomi = g => g.map(x => x.fornitore);
const ids = g => g.map(x => x.voci.map(v => v.id));

console.log('\n-- Raggruppamento --');
verifica('stessa data: comanda la più recente inserita (id)', ['abbondanza', 'Senza fornitore', 'Gemma'],
  nomi(raggruppa(lista, soloAperte)));
verifica('voci nei gruppi giusti (a pari data, id più alto prima)', [['5'], ['3', '2'], ['1']], ids(raggruppa(lista, soloAperte)));
const recenti = [
  Object.assign(s('7', 'altro', 'vecchia', 'Zeta', 'aperta'), { creato: '2026-09-01 10:00' }),
  Object.assign(s('8', 'altro', 'nuova senza fornitore', '', 'aperta'), { creato: '2026-10-25 15:00' }),
  Object.assign(s('9', 'altro', 'media', 'Alfa', 'aperta'), { creato: '2026-10-01 10:00' }),
  Object.assign(s('10', 'altro', 'urgente', 'Alfa', 'aperta'), { creato: '2026-08-01 10:00', urgente: true })
];
verifica('gruppi dalla segnalazione più recente, urgenti in cima', ['Urgenti', 'Senza fornitore', 'Alfa', 'Zeta'],
  nomi(raggruppa(recenti, soloAperte)));
verifica('la chiusa non compare fra le aperte', false,
  raggruppa(lista, soloAperte).some(g => g.voci.some(v => v.id === '4')));

console.log('\n-- Filtri --');
verifica('solo chiuse', [['4']], ids(raggruppa(lista, { stato: 'chiuse' })));
verifica('tutte: aperte e chiuse insieme', 5,
  raggruppa(lista, { stato: 'tutte' }).reduce((n, g) => n + g.voci.length, 0));
verifica('per categoria', [['5'], ['1']], ids(raggruppa(lista, { stato: 'aperte', categoria: 'vino' })));
verifica('per fornitore, distingue maiuscole come le scrive l\'utente', [['1']],
  ids(raggruppa(lista, { stato: 'aperte', fornitore: 'Gemma' })));
verifica('ricerca nel testo', [['2']], ids(raggruppa(lista, { stato: 'aperte', cerca: 'AROMATICO' })));
verifica('ricerca anche nel fornitore', [['5']], ids(raggruppa(lista, { stato: 'aperte', cerca: 'abbond' })));
verifica('ricerca senza esiti', [], raggruppa(lista, { stato: 'aperte', cerca: 'zibibbo' }));
verifica('elenco vuoto', [], raggruppa([], soloAperte));

console.log(`\n==============================================`);
console.log(`  ${passate} passate - ${fallite} fallite`);
console.log(`==============================================`);
process.exit(fallite ? 1 : 0);
