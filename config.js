// ═══════════════════════════════════════════════════════════════════
//  CONFIGURAZIONE DEL LOCALE
//  L'unico file che cambia da un'installazione all'altra: nome del
//  locale e indirizzi dei server. Le pagine non hanno indirizzi propri.
// ═══════════════════════════════════════════════════════════════════
const VDC_CONFIG = {
  locale: {
    nome: 'Vecchia Dogana',
    ragioneSociale: 'PEREIRA S.R.L.'
  },
  server: {
    // Apps Script
    vdc:          'https://script.google.com/macros/s/AKfycbzcpybXvlL5Ge24NztvVL3Kz8Jhd3jRHWH0KZmZgKW9577DIqsvXUH7h2lN4ZkzldHisQ/exec',  // chiusure, prenotazioni, rubrica
    vini:         'https://script.google.com/macros/s/AKfycbz_fpZSr1plB6vliWBzSh3rxjaaLz5ilFH_OHIIM2kjqHOaMDWk-za_yaR5gWxtb-1f/exec',  // WINE_COST
    cartaQR:      'https://script.google.com/macros/s/AKfycbwIhY-mG3pIMos7nFjF-B382QwK8ROqc8TBFC9PJtpVi4IfPw1ug-2ajhKSB_Vl5LNh/exec',  // carta vini pubblica
    // Hosting studio-smart.it
    pin:          'https://www.studio-smart.it/api/vdc-pin.php',
    segnalazioni: 'https://www.studio-smart.it/api/vdc-segnalazioni.php',
    degustazioni: 'https://www.studio-smart.it/api/vdc-degustazioni.php',
    ordini:       'https://www.studio-smart.it/api/vdc-ordini.php'
  }
};
