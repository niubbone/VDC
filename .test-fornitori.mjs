/**
 * Banco di prova per la tendina dei fornitori delle segnalazioni: estrae da
 * segnalazioni.html le due funzioni pure e le interroga.
 *
 * L'elenco è CHIUSO: un nome nuovo si accetta solo scegliendo la voce
 * "Nuovo fornitore" che compare in fondo. Serve a non disperdere lo stesso
 * fornitore in tre grafie diverse.
 *
 * Uso:  node .test-fornitori.mjs
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
  pezzo('function normFornitoreNome(', '\n  }'),
  pezzo('function vociTendinaFornitori(', '\n  }')
].join('\n');
const f = new Function(codice + '\nreturn { normFornitoreNome, vociTendinaFornitori };')();

let passate = 0, fallite = 0;
function verifica(nome, atteso, ottenuto) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (ok) { passate++; console.log(`  OK   ${nome}`); }
  else { fallite++; console.log(`  KO   ${nome}\n       atteso:   ${JSON.stringify(atteso)}\n       ottenuto: ${JSON.stringify(ottenuto)}`); }
}

const elenco = ['Abbondanza', 'Cave de Pyrene', 'Elemento Indigeno', 'Gemma', 'Uvas Felices', 'World of Flavours'];
const nomi = voci => voci.map(v => v.nome);
const tipi = voci => voci.map(v => v.tipo);
const esistenti = voci => voci.filter(v => v.tipo === 'esistente').map(v => v.nome);

console.log('\n-- Forma confrontabile --');
verifica('maiuscole e spazi', 'gemma', f.normFornitoreNome('  GEMMA  '));
verifica('accenti', 'elemento indigeno', f.normFornitoreNome('Elemento Indígeno'));
verifica('punteggiatura', 'cave de pyrene', f.normFornitoreNome('Cave-de/Pyrene'));
verifica('coda societaria', 'gemma', f.normFornitoreNome('Gemma S.r.l.'));
verifica('vuoto', '', f.normFornitoreNome('   '));

console.log('\n-- Voci della tendina --');
verifica('senza testo: tutto l\'elenco, nessuna voce "nuovo"', [elenco, elenco.map(() => 'esistente')],
  [nomi(f.vociTendinaFornitori(elenco, '')), tipi(f.vociTendinaFornitori(elenco, ''))]);
verifica('filtra mentre si scrive', ['Gemma'], esistenti(f.vociTendinaFornitori(elenco, 'gem')));
verifica('filtra ignorando maiuscole e accenti', ['Elemento Indigeno'],
  esistenti(f.vociTendinaFornitori(elenco, 'INDÍGENO')));
verifica('cerca anche dentro il nome', ['Cave de Pyrene'], esistenti(f.vociTendinaFornitori(elenco, 'pyrene')));
verifica('più risultati restano nell\'ordine dell\'elenco', ['Abbondanza', 'Uvas Felices', 'Gemma'],
  esistenti(f.vociTendinaFornitori(['Abbondanza', 'Uvas Felices', 'Gemma'], 'a')));
verifica('niente corrispondenze: resta solo la voce nuovo', [], esistenti(f.vociTendinaFornitori(elenco, 'zibibbo')));

console.log('\n-- Fornitore nuovo --');
const nuove = f.vociTendinaFornitori(elenco, 'Phulia');
verifica('nome sconosciuto: una sola voce, di tipo nuovo', [['Phulia'], ['nuovo']], [nomi(nuove), tipi(nuove)]);
verifica('il nome nuovo conserva la grafia scritta', 'Phulia', nuove[0].nome);
verifica('spazi ai lati tolti', 'Nibiru', f.vociTendinaFornitori(elenco, '  Nibiru  ')[0].nome);
verifica('se coincide con uno esistente niente voce "nuovo"', ['esistente'],
  tipi(f.vociTendinaFornitori(elenco, 'gemma')));
verifica('coincide anche a meno della coda societaria', ['esistente'],
  tipi(f.vociTendinaFornitori(elenco, 'Gemma Srl')));
verifica('parziale: mostra il simile E la voce nuovo', ['esistente', 'nuovo'],
  tipi(f.vociTendinaFornitori(elenco, 'Gem')));
verifica('elenco vuoto: solo la voce nuovo', [['Phulia'], ['nuovo']],
  (v => [nomi(v), tipi(v)])(f.vociTendinaFornitori([], 'Phulia')));

console.log(`\n==============================================`);
console.log(`  ${passate} passate - ${fallite} fallite`);
console.log(`==============================================`);
process.exit(fallite ? 1 : 0);
