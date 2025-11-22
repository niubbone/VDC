/**
 * Configurazione API - DA MODIFICARE CON IL TUO URL
 */

// ⚠️ IMPORTANTE: Usa l'URL con /exec (non /dev)
// Ottieni questo URL da: Apps Script → Implementa → Nuova implementazione
const API_URL = 'https://script.google.com/macros/s/AKfycbyrK_dEZxKTPN1GpT3BIbREuFSay8eQaDmDzRTuXDd6/exec';

/**
 * Funzione helper per chiamare le API
 */
async function callAPI(action, data = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({
        action: action,
        ...data
      })
    });
    
    if (!response.ok) {
      throw new Error('Errore nella risposta del server');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Errore API:', error);
    throw error;
  }
}
