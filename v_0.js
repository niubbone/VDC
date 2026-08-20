
    const API_URL = 'https://script.google.com/macros/s/AKfycbzcpybXvlL5Ge24NztvVL3Kz8Jhd3jRHWH0KZmZgKW9577DIqsvXUH7h2lN4ZkzldHisQ/exec';
    
    // Fetch con timeout + retry esponenziale: assorbe i glitch transitori di GAS
    // (cold-start, "Service invoked too many times") che altrimenti diventano errori visibili.
    async function fetchConRetry(url, options, tentativi = 3, timeoutMs = 20000) {
      for (let i = 0; i < tentativi; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          return res;
        } catch (error) {
          clearTimeout(timeoutId);
          if (i === tentativi - 1) throw error;
          await new Promise(r => setTimeout(r, 800 * Math.pow(2, i)));
        }
      }
    }

    async function callAPI(action, data = {}) {
      try {
        const response = await fetchConRetry(API_URL, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: action, ...data })
        });

        const text = await response.text();
        return JSON.parse(text);
      } catch (error) {
        console.error('Errore API:', error);
        throw error;
      }
    }
    
    const TAGLI = [
      {valore:0.10,label:'0,10€'},{valore:0.20,label:'0,20€'},{valore:0.50,label:'0,50€'},
      {valore:1,label:'1€'},{valore:2,label:'2€'},{valore:5,label:'5€'},
      {valore:10,label:'10€'},{valore:20,label:'20€'},{valore:50,label:'50€'},
      {valore:100,label:'100€'}
    ];
    
    const TAGLI_VISIBILI = TAGLI.filter(t => t.valore >= 0.50);
    
    let datiGiorno = null;
    let spese = [];
    let modalitaConsultazione = false;
    let dataSelezionata = null; // Data calcolata automaticamente
    let formDirty = false; // true se ci sono modifiche non salvate (blocca il reload automatico del SW)
    let _fallimentoPrecedente = null; // voce di coda se l'ultimo salvataggio di questo giorno e' fallito

    function segnaModificato() {
      formDirty = true;
      salvaDraftLocale();
    }

    function raccogliDatiForm() {
      const tagli = {};
      TAGLI.forEach(taglio => {
        const input = document.getElementById(`taglio_${taglio.label}`);
        if (input) tagli[taglio.label] = input.value;
      });
      return {
        tagli,
        chiusura: document.getElementById('chiusura').value,
        cash: document.getElementById('cash').value,
        pos: document.getElementById('pos').value,
        satispay: document.getElementById('satispay').value,
        reportProdotti: document.getElementById('reportProdotti').value,
        note: document.getElementById('note').value,
        spese
      };
    }

    function chiaveDraft() {
      return 'vdc_chiusura_draft_' + dataSelezionata;
    }

    function salvaDraftLocale() {
      if (!dataSelezionata) return;
      try {
        localStorage.setItem(chiaveDraft(), JSON.stringify(raccogliDatiForm()));
      } catch (e) { /* storage pieno o non disponibile: ignora */ }
    }

    function cancellaDraftLocale() {
      if (dataSelezionata) localStorage.removeItem(chiaveDraft());
      formDirty = false;
    }

    // ===== CODA TENTATIVI MAI ARRIVATI AL SERVER =====
    // Il registro lato server vede solo ciò che arriva: un salvataggio che non
    // parte (rete assente, timeout) non lascia traccia da nessuna parte. Qui lo
    // annotiamo sul dispositivo e lo recapitiamo al primo collegamento riuscito.
    // UNA VOCE PER GIORNO: i ritentativi incrementano il contatore, non
    // aggiungono voci, così un giorno storto resta una riga sola sul foglio.
    const CODA_KEY = 'vdc_tentativi_falliti';
    const CODA_MAX = 20;
    const APP_VERSION = '4.7';

    function leggiCodaTentativi() {
      try {
        const raw = localStorage.getItem(CODA_KEY);
        const coda = raw ? JSON.parse(raw) : [];
        return Array.isArray(coda) ? coda : [];
      } catch (e) { return []; }
    }

    function accodaTentativoFallito(motivo) {
      if (!dataSelezionata) return;
      try {
        const adesso = new Date().toLocaleString('it-IT');
        const coda = leggiCodaTentativi();
        const voce = coda.find(v => v.giorno === dataSelezionata);
        if (voce) {
          voce.tentativi = (voce.tentativi || 1) + 1;
          voce.ultimo = adesso;
          voce.motivo = motivo;
        } else {
          coda.push({ giorno: dataSelezionata, utente: 'Web', tentativi: 1,
                      primo: adesso, ultimo: adesso, motivo: motivo, versione: APP_VERSION });
        }
        // Tetto di sicurezza: se il dispositivo resta scollegato a lungo non
        // deve accumulare all'infinito, tengono le voci più recenti.
        localStorage.setItem(CODA_KEY, JSON.stringify(coda.slice(-CODA_MAX)));
      } catch (e) { /* storage pieno o non disponibile: ignora */ }
    }

    // Non blocca mai l'interfaccia e non aggiunge chiamate quando va tutto bene:
    // se la coda è vuota esce subito, senza toccare la rete.
    async function svuotaCodaTentativi() {
      const coda = leggiCodaTentativi();
      if (coda.length === 0 || navigator.onLine === false) return;
      try {
        const esito = await callAPI('logTentativiFalliti', { tentativi: coda });
        if (esito && esito.successo) localStorage.removeItem(CODA_KEY);
      } catch (e) {
        // Ancora irraggiungibile: la coda resta lì per il prossimo giro.
      }
    }

    function ripristinaDraftLocale() {
      if (!dataSelezionata) return false;
      const raw = localStorage.getItem(chiaveDraft());
      if (!raw) return false;
      try {
        const draft = JSON.parse(raw);
        TAGLI.forEach(taglio => {
          const input = document.getElementById(`taglio_${taglio.label}`);
          if (input && draft.tagli && draft.tagli[taglio.label] !== undefined) input.value = draft.tagli[taglio.label];
        });
        if (draft.chiusura !== undefined) document.getElementById('chiusura').value = draft.chiusura;
        if (draft.cash !== undefined) document.getElementById('cash').value = draft.cash;
        if (draft.pos !== undefined) document.getElementById('pos').value = draft.pos;
        if (draft.satispay !== undefined) document.getElementById('satispay').value = draft.satispay;
        if (draft.reportProdotti !== undefined) document.getElementById('reportProdotti').value = draft.reportProdotti;
        if (draft.note !== undefined) document.getElementById('note').value = draft.note;
        if (draft.spese && draft.spese.length > 0) { spese = draft.spese; aggiornaSpese(); }
        return true;
      } catch (e) {
        return false;
      }
    }
    
    // ⭐ LOGICA AUTOMATICA: Calcola la data di chiusura in base all'ora
    function getDataChiusura() {
      const ora = new Date();
      const oraCorrente = ora.getHours(); // ⭐ PRODUZIONE: usa orario reale
      
      const oggi = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate());
      const ieri = new Date(oggi);
      ieri.setDate(ieri.getDate() - 1);
      
      const formatData = (d) => {
        return {
          display: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
          value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        };
      };
      
      // ⚡ FASCIA NOTTURNA 00:01-04:00: Chiusura di IERI
      if (oraCorrente >= 0 && oraCorrente < 4) {
        return {
          data: formatData(ieri),
          mostraAlert: true,
          messaggio: `⏰ Sono le ${String(oraCorrente).padStart(2,'0')}:${String(ora.getMinutes()).padStart(2,'0')}\n\n📅 Stai registrando la chiusura di IERI (${formatData(ieri).display})\n\nLa giornata di chiusura termina alle 04:00 del giorno successivo.`
        };
      }
      
      // 📅 FASCIA NORMALE 04:01-23:59: Chiusura di OGGI  
      return {
        data: formatData(oggi),
        mostraAlert: false,
        messaggio: null
      };
    }
    
    document.addEventListener('DOMContentLoaded', caricaDatiOggi);
    
    async function caricaDatiOggi() {
      // ⭐ Calcola automaticamente la data di chiusura
      const config = getDataChiusura();
      const dataStr = config.data.value;
      dataSelezionata = dataStr;
      
      // Mostra alert se in fascia notturna (solo prima volta)
      if (config.mostraAlert && !sessionStorage.getItem('alert_notturno_shown')) {
        alert(config.messaggio);
        sessionStorage.setItem('alert_notturno_shown', 'true');
      }
      
      try {
        datiGiorno = await callAPI('getDatiGiorno', { data: dataStr, soloLettura: true });
        console.log('DEBUG - Risposta API:', datiGiorno);
        if (datiGiorno.errore) { alert('⚠️ ' + datiGiorno.errore); return; }

        // Va letto PRIMA di svuotare la coda: serve più avanti per capire se il
        // draft che stiamo per ripristinare viene da un salvataggio fallito.
        _fallimentoPrecedente = leggiCodaTentativi()
          .find(v => v.giorno === dataSelezionata) || null;

        // La rete funziona: se c'è un fallimento in sospeso da una sera storta,
        // recapitalo ora. In assenza di coda non fa nulla e non attende niente.
        svuotaCodaTentativi();

        // Mostra la data calcolata
        document.getElementById('dataChiusura').textContent = config.data.display;
        
        // Se fondoStart è 0 o mancante, cerca fondoEnd del giorno precedente
        if (!datiGiorno.fondoStart || datiGiorno.fondoStart === 0) {
          const dataObj = new Date(dataStr);
          const fondoEndPrecedente = await cercaFondoEndPrecedente(dataObj);
          if (fondoEndPrecedente > 0) {
            datiGiorno.fondoStart = fondoEndPrecedente;
            console.log(`✅ FondoStart impostato da precedente: ${fondoEndPrecedente.toFixed(2)} €`);
          }
        }
        
        if (datiGiorno.esisteChiusura) {
          modalitaConsultazione = true;
          document.getElementById('alertModifica').style.display = 'block';
          document.getElementById('alertModifica').innerHTML = `
            ⚠️ <strong>Chiusura già registrata</strong> - Modalità consultazione
            <button class="btn-modifica" onclick="abilitaModifica()">🔓 Modifica</button>
          `;
        }
        
        inizializzaForm();
      } catch (error) {
        alert('⚠️ Errore: ' + error.message);
      }
    }
    
    async function cercaFondoEndPrecedente(dataRiferimento) {
      for (let i = 1; i <= 60; i++) {
        const dataPrecedente = new Date(dataRiferimento);
        dataPrecedente.setDate(dataPrecedente.getDate() - i);
        const dataStr = `${dataPrecedente.getFullYear()}-${String(dataPrecedente.getMonth()+1).padStart(2,'0')}-${String(dataPrecedente.getDate()).padStart(2,'0')}`;
        
        try {
          const risultato = await callAPI('getDatiGiorno', { data: dataStr, soloLettura: true });
          if (!risultato.errore && risultato.fondoEnd && risultato.fondoEnd > 0) {
            return risultato.fondoEnd;
          }
        } catch (error) {
          continue;
        }
      }
      return 0;
    }
    
    function inizializzaForm() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('formChiusura').style.display = 'block';
      
      // ⭐ dataChiusura già impostata in caricaDatiOggi
      document.getElementById('giornoSettimana').textContent = datiGiorno.giornoSettimana;
      document.getElementById('fondoStart').textContent = datiGiorno.fondoStart.toFixed(2);
      
      const tagliContainer = document.getElementById('tagli');
      TAGLI_VISIBILI.forEach(taglio => {
        const div = document.createElement('div');
        div.className = 'taglio-item';
        div.innerHTML = `
          <span class="taglio-label">${taglio.label}</span>
          <input type="number" class="taglio-input" id="taglio_${taglio.label}"
                 value="${datiGiorno.tagli[taglio.label]||0}" min="0" step="1" oninput="ricalcolaTagli(); segnaModificato()" onfocus="this.select()">
          <span class="taglio-total" id="total_${taglio.label}">0,00 €</span>
        `;
        tagliContainer.appendChild(div);
      });
      
      if (datiGiorno.chiusura) document.getElementById('chiusura').value = datiGiorno.chiusura;
      if (datiGiorno.cash) document.getElementById('cash').value = datiGiorno.cash;
      if (datiGiorno.pos) document.getElementById('pos').value = datiGiorno.pos;
      if (datiGiorno.satispay) document.getElementById('satispay').value = datiGiorno.satispay;
      if (datiGiorno.reportProdotti) document.getElementById('reportProdotti').value = datiGiorno.reportProdotti;
      if (datiGiorno.note) document.getElementById('note').value = datiGiorno.note;
      
      spese = datiGiorno.spese && datiGiorno.spese.length > 0 ? datiGiorno.spese : [{ descrizione: '', importo: 0 }];
      aggiornaSpese();
      ricalcolaTagli(); // Calcola i totali dei tagli prima di ricalcola()
      ricalcola();

      if (modalitaConsultazione) {
        bloccaCampi();
      } else if (ripristinaDraftLocale()) {
        // C'erano modifiche non salvate (es. reload imprevisto): le ripristiniamo
        formDirty = true;
        ricalcolaTagli();
        ricalcola();
        const alertBox = document.getElementById('alertModifica');
        alertBox.style.display = 'block';
        if (_fallimentoPrecedente) {
          // Non è un semplice ripristino: l'ultima volta il salvataggio è
          // proprio fallito e la chiusura non è mai stata registrata. Va detto
          // con parole diverse, altrimenti sembra una cosa di routine.
          alertBox.style.background = '#ffdada';
          alertBox.style.border = '2px solid #b71c1c';
          alertBox.style.color = '#7a1414';
          alertBox.innerHTML = '⚠️ <strong>Questa chiusura NON è mai stata registrata.</strong><br>' +
            'L\'ultimo tentativo (' + _fallimentoPrecedente.ultimo + ') non è arrivato al server. ' +
            'I dati qui sotto sono quelli che avevi inserito: controllali e premi <strong>Salva</strong>.';
          bottoneSalvaAllarme();
        } else {
          alertBox.innerHTML = '📝 <strong>Ripristinate modifiche non salvate</strong> dell\'ultima sessione';
        }
      }
    }
    
    function bloccaCampi() {
      document.querySelectorAll('input[type="number"], textarea').forEach(el => {
        el.disabled = true;
        el.style.background = '#f5f5f5';
        el.style.cursor = 'not-allowed';
      });
      
      document.querySelectorAll('.taglio-input').forEach(el => {
        el.disabled = true;
        el.style.background = '#f5f5f5';
        el.style.cursor = 'not-allowed';
      });
      
      document.getElementById('btnSalva').style.display = 'none';
      
      document.querySelectorAll('.btn-add, .btn-remove').forEach(btn => {
        btn.style.display = 'none';
      });
    }
    
    function sbloccaCampi() {
      document.querySelectorAll('input[type="number"], textarea').forEach(el => {
        el.disabled = false;
        el.style.background = '';
        el.style.cursor = '';
      });
      
      document.querySelectorAll('.taglio-input').forEach(el => {
        el.disabled = false;
        el.style.background = 'white';
        el.style.cursor = '';
      });
      
      const btnSalva = document.getElementById('btnSalva');
      btnSalva.style.display = 'block';
      btnSalva.textContent = '💾 Salva Modifiche';
      
      document.querySelectorAll('.btn-add').forEach(btn => {
        btn.style.display = 'inline-block';
      });
      
      document.querySelectorAll('.btn-remove').forEach(btn => {
        btn.style.display = 'inline-block';
      });
    }
    
    function abilitaModifica() {
      if (!confirm('⚠️ Stai per modificare una chiusura già registrata.\n\nSei sicuro di voler procedere?')) {
        return;
      }
      
      modalitaConsultazione = false;
      sbloccaCampi();
      
      document.getElementById('alertModifica').innerHTML = `
        <div style="background:#d4edda; padding:12px; border-radius:8px; border:1px solid #28a745;">
          ✏️ <strong>Modalità modifica attiva</strong> - Puoi modificare i dati
        </div>
      `;
    }
    
    function ricalcolaTagli() {
      let totale = 0;
      TAGLI_VISIBILI.forEach(taglio => {
        const qta = parseFloat(document.getElementById(`taglio_${taglio.label}`).value) || 0;
        const valore = qta * taglio.valore;
        totale += valore;
        document.getElementById(`total_${taglio.label}`).textContent = valore.toFixed(2) + ' €';
      });
      document.getElementById('totaleContato').textContent = totale.toFixed(2);
      document.getElementById('fondoEndDisplay').textContent = totale.toFixed(2) + ' €';
      ricalcola();
    }
    
    function aggiungiSpesa() {
      spese.push({ descrizione: '', importo: 0 });
      aggiornaSpese();
      segnaModificato();
    }

    function rimuoviSpesa(index) {
      spese.splice(index, 1);
      aggiornaSpese();
      segnaModificato();
    }
    
    function aggiornaSpese() {
      const container = document.getElementById('speseContainer');
      container.innerHTML = '';
      spese.forEach((spesa, index) => {
        const div = document.createElement('div');
        div.className = 'spesa-row';
        div.innerHTML = `
          <input type="text" class="spesa-desc" placeholder="Descrizione" value="${spesa.descrizione}"
                 onchange="spese[${index}].descrizione = this.value; segnaModificato()">
          <input type="number" class="spesa-importo" placeholder="0.00" step="0.01" value="${spesa.importo}"
                 oninput="spese[${index}].importo = parseFloat(this.value)||0; ricalcola(); segnaModificato()" onfocus="this.select()">
          <button class="btn-remove" onclick="rimuoviSpesa(${index})">✕</button>
        `;
        container.appendChild(div);
      });
      ricalcola();
    }
    
    function ricalcola() {
      const fondoStart = parseFloat(document.getElementById('fondoStart').textContent) || 0;
      const fondoEnd = parseFloat(document.getElementById('totaleContato').textContent) || 0;
      const cash = parseFloat(document.getElementById('cash').value) || 0;
      const pos = parseFloat(document.getElementById('pos').value) || 0;
      const satispay = parseFloat(document.getElementById('satispay').value) || 0;
      const reportProdotti = parseFloat(document.getElementById('reportProdotti').value) || 0;
      const totaleSpese = spese.reduce((sum, s) => sum + (s.importo||0), 0);
      
      document.getElementById('totaleSpese').textContent = totaleSpese.toFixed(2);
      
      const diffFondo = fondoEnd - fondoStart;
      const totaleGiorno = cash + pos + satispay + totaleSpese;
      const totaleCassa = totaleGiorno + diffFondo;
      const discrepanza = totaleCassa - reportProdotti;
      
      document.getElementById('riepDiffFondo').textContent = diffFondo.toFixed(2) + ' €';
      document.getElementById('riepTotaleGiorno').textContent = totaleGiorno.toFixed(2) + ' €';
      document.getElementById('riepTotaleCassa').textContent = totaleCassa.toFixed(2) + ' €';
      
      const discEl = document.getElementById('discrepanza');
      // ⚡ Segno + per eccedenze
      const segno = discrepanza > 0 ? '+' : '';
      discEl.textContent = `Discrepanza: ${segno}${discrepanza.toFixed(2)} €`;
      discEl.className = 'discrepanza';
      // ⚡ Nuove soglie: Verde ≤5€, Giallo ≤15€, Rosso >15€
      if (Math.abs(discrepanza) <= 5) discEl.classList.add('ok');
      else if (Math.abs(discrepanza) <= 15) discEl.classList.add('warning');
      else discEl.classList.add('error');
    }
    
    async function mostraChiusuraPrecedente() {
      try {
        // Mostra loading sovrapposto (non nasconde form)
        document.getElementById('loading').style.display = 'flex';
        
        const oggi = new Date();
        let dati = null;
        let giornoTrovato = false;
        
        for (let i = 1; i <= 30; i++) {
          const dataPrecedente = new Date(oggi);
          dataPrecedente.setDate(dataPrecedente.getDate() - i);
          const dataStr = `${dataPrecedente.getFullYear()}-${String(dataPrecedente.getMonth()+1).padStart(2,'0')}-${String(dataPrecedente.getDate()).padStart(2,'0')}`;
          
          const risultato = await callAPI('getDatiGiorno', { data: dataStr, soloLettura: true });

          if (!risultato.errore && risultato.fondoEnd && risultato.fondoEnd > 0) {
            dati = risultato;
            giornoTrovato = true;
            break;
          }
        }
        
        if (!giornoTrovato || !dati) {
          // Nasconde loading
          document.getElementById('loading').style.display = 'none';
          alert('⚠️ Nessuna chiusura precedente trovata negli ultimi 30 giorni');
          return;
        }
        
        let tagliHtml = '<div class="section"><div class="section-title">💰 Tagli</div>';
        let haTagli = false;
        for (const [taglio, qta] of Object.entries(dati.tagli || {})) {
          if (qta > 0) {
            haTagli = true;
            tagliHtml += `<div class="dettaglio-row"><span>${taglio}:</span><span>${qta} pz</span></div>`;
          }
        }
        tagliHtml += haTagli ? '</div>' : '<div style="color:#666; font-style:italic;">Nessun taglio registrato</div></div>';
        
        let speseHtml = '<div class="section"><div class="section-title">💸 Spese</div>';
        let hasDettaglioSpese = false;
        if (dati.spese && dati.spese.length > 0) {
          dati.spese.forEach(spesa => {
            if (spesa.descrizione || spesa.importo) {
              hasDettaglioSpese = true;
              speseHtml += `<div class="dettaglio-row"><span>${spesa.descrizione || 'N/A'}:</span><span>${spesa.importo.toFixed(2)} €</span></div>`;
            }
          });
        }
        
        speseHtml += `<div class="dettaglio-row" style="font-weight:700; border-top:2px solid #333; margin-top:5px; padding-top:5px;">
          <span>💸 Tot Spese:</span><span>${dati.totaleSpese.toFixed(2)} €</span>
        </div>`;
        
        if (!hasDettaglioSpese) {
          speseHtml = '<div class="section"><div class="section-title">💸 Spese</div><div style="color:#666; font-style:italic;">Nessun dettaglio spese</div>' + speseHtml.split('</div>').slice(-2).join('</div>');
        }
        speseHtml += '</div>';
        
        const html = `
          <div class="info-box">
            <h2>${dati.giornoSettimana} ${dati.data}</h2>
          </div>
          <div class="section">
            <div class="section-title">📊 Riepilogo</div>
            <div class="dettaglio-row"><span>Fondo Start:</span><span>${dati.fondoStart.toFixed(2)} €</span></div>
            <div class="dettaglio-row"><span>Fondo End:</span><span>${dati.fondoEnd.toFixed(2)} €</span></div>
            <div class="dettaglio-row"><span>Chiusura:</span><span>${dati.chiusura.toFixed(2)} €</span></div>
            <div class="dettaglio-row"><span>Cash:</span><span>${dati.cash.toFixed(2)} €</span></div>
            <div class="dettaglio-row"><span>POS:</span><span>${dati.pos.toFixed(2)} €</span></div>
            <div class="dettaglio-row"><span>Satispay:</span><span>${dati.satispay.toFixed(2)} €</span></div>
            <div class="dettaglio-row"><span>Report Prodotti:</span><span>${dati.reportProdotti.toFixed(2)} €</span></div>
            <div class="dettaglio-row" style="font-weight:700; background:${Math.abs(dati.discrepanza) <= 5 ? '#90ee90' : (Math.abs(dati.discrepanza) <= 15 ? '#ffeb3b' : '#ff5252')};">
              <span>⚠️ Discrepanza:</span><span>${dati.discrepanza > 0 ? '+' : ''}${dati.discrepanza.toFixed(2)} €</span>
            </div>
          </div>
          ${tagliHtml}
          ${speseHtml}
          ${dati.note ? `<div class="section">
            <div class="section-title">📝 Note</div>
            <div style="padding:10px; background:white; border-radius:5px;">${dati.note}</div>
          </div>` : ''}
        `;
        
        document.getElementById('contenutoPrecedente').innerHTML = html;
        // Nasconde loading e mostra modale
        document.getElementById('loading').style.display = 'none';
        document.getElementById('modalPrecedente').classList.add('active');
      } catch (error) {
        // Nasconde loading in caso di errore
        document.getElementById('loading').style.display = 'none';
        alert('⚠️ Errore: ' + error.message);
      }
    }
    
    function chiudiModalPrecedente() {
      document.getElementById('modalPrecedente').classList.remove('active');
    }
    
    // Mostra/nasconde l'avviso persistente sotto il bottone Salva.
    function mostraBannerErrore(html, grave) {
      const b = document.getElementById('bannerErrore');
      if (!b) return;
      b.innerHTML = html;
      b.style.display = html ? 'block' : 'none';
      if (!html) return;
      if (grave) {
        b.style.background = '#ffdada';
        b.style.borderColor = '#b71c1c';
        b.style.color = '#7a1414';
      } else {
        b.style.background = '#fff3cd';
        b.style.borderColor = '#e0a800';
        b.style.color = '#856404';
      }
    }

    // Il banner sta in fondo alla pagina, sotto il bottone Salva: su telefono
    // si apre fuori dallo schermo e non lo vede nessuno. Va portato in vista.
    function portaInVistaBanner() {
      const b = document.getElementById('bannerErrore');
      if (!b || b.style.display === 'none') return;
      try { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (e) { b.scrollIntoView(); }
    }

    // ===== SEGNALAZIONE DI UN SALVATAGGIO FALLITO =====
    // Deve essere impossibile da ignorare: una chiusura persa senza che nessuno
    // se ne accorga e' il caso peggiore per questa app.
    function bottoneSalvaAllarme() {
      const b = document.getElementById('btnSalva');
      if (!b) return;
      b.disabled = false;
      b.textContent = '⚠️ NON SALVATA — Riprova';
      b.style.opacity = '';
      b.style.cursor = '';
      b.style.background = '#c62828';
      b.style.color = '#ffffff';
    }

    function segnalaFallimento(html, testoAlert, automatico) {
      mostraBannerErrore(html, true);
      bottoneSalvaAllarme();
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
      // L'alert e' l'unica cosa che su telefono non si puo' non vedere. Non lo
      // mostriamo se il tentativo e' partito da solo (ritentativo automatico):
      // resterebbe li' a bloccare lo schermo con nessuno davanti.
      if (!automatico) alert(testoAlert);
      portaInVistaBanner();
    }

    // Se il salvataggio fallisce mentre si è offline, riprova da solo appena
    // torna la rete (una volta sola). La bozza resta comunque sul dispositivo.
    let _riprovaAlRitornoRete = false;
    window.addEventListener('online', () => {
      if (_riprovaAlRitornoRete) {
        _riprovaAlRitornoRete = false;
        mostraBannerErrore('🔄 Rete tornata disponibile: nuovo tentativo di salvataggio in corso…', false);
        salvaChiusura({ automatico: true });
      }
    });

    async function salvaChiusura(opzioni) {
      // I ritentativi automatici non devono far comparire alert a schermo:
      // partono da soli, magari col telefono in tasca.
      const automatico = !!(opzioni && opzioni.automatico === true);

      if (modalitaConsultazione) {
        alert('❌ Non puoi salvare in modalità consultazione.\n\nUsa il bottone "Modifica" prima.');
        return;
      }

      // Pre-check: nessuna rete → non provare nemmeno, avvisa e conserva la bozza.
      if (navigator.onLine === false) {
        salvaDraftLocale();
        accodaTentativoFallito('dispositivo offline (non inviata)');
        _riprovaAlRitornoRete = true;
        segnalaFallimento(
          '📴 <b>Nessuna connessione: la chiusura NON è stata salvata.</b><br>' +
          'I dati sono conservati su questo dispositivo. Riprova appena torna la rete ' +
          '(ci proverà anche da sola). <b>Non chiudere l\'app senza aver visto il messaggio ' +
          'verde di conferma.</b>',
          '📴 CHIUSURA NON SALVATA\n\nNon c\'è connessione.\n\n' +
          'I dati NON sono andati persi: restano su questo dispositivo e li ritrovi ' +
          'riaprendo questa pagina.\n\nRiprova appena torna la rete.',
          automatico);
        return;
      }

      // Mostra loading sul bottone
      const btnSalva = document.getElementById('btnSalva');
      btnSalva.disabled = true;
      btnSalva.textContent = '⏳ Salvataggio in corso...';
      btnSalva.style.opacity = '0.7';
      btnSalva.style.cursor = 'not-allowed';
      btnSalva.style.background = '';
      btnSalva.style.color = '';
      mostraBannerErrore('');
      
      const tagli = {};
      TAGLI.forEach(taglio => {
        const input = document.getElementById(`taglio_${taglio.label}`);
        tagli[taglio.label] = input ? (parseInt(input.value) || 0) : 0;
      });
      
      const dati = {
        data: dataSelezionata, // ⭐ Data calcolata automaticamente
        fondoStart: datiGiorno.fondoStart || 0,
        tagli: tagli,
        chiusura: parseFloat(document.getElementById('chiusura').value) || 0,
        cash: parseFloat(document.getElementById('cash').value) || 0,
        pos: parseFloat(document.getElementById('pos').value) || 0,
        satispay: parseFloat(document.getElementById('satispay').value) || 0,
        reportProdotti: parseFloat(document.getElementById('reportProdotti').value) || 0,
        spese: spese.filter(s => s.descrizione || s.importo),
        note: document.getElementById('note').value,
        utente: 'Web'
      };
      
      try {
        const result = await callAPI('salvaChiusura', { dati: dati });
        if (result.successo) {
          _riprovaAlRitornoRete = false;
          mostraBannerErrore('');
          cancellaDraftLocale();
          // Momento migliore per recapitare i fallimenti in sospeso: la rete
          // ha appena funzionato. Se non c'è niente in coda non fa nulla.
          await svuotaCodaTentativi();
          alert('✅ Chiusura salvata con successo!');
          window.location.href = 'index.html';
        } else {
          // Il server ha risposto ma rifiuta il salvataggio: NON è un problema di
          // rete, non serve riprovare da soli. La bozza resta comunque salvata.
          _riprovaAlRitornoRete = false;
          salvaDraftLocale();
          const motivo = result.errore || 'Errore del server';
          segnalaFallimento(
            '⚠️ <b>Chiusura NON salvata.</b> ' + motivo +
            '<br>I dati restano su questo dispositivo. Controlla e riprova.',
            '⚠️ CHIUSURA NON SALVATA\n\n' + motivo +
            '\n\nI dati NON sono andati persi: restano su questo dispositivo.\n\n' +
            'Controlla e premi di nuovo Salva.',
            automatico);
        }
      } catch (error) {
        // Non siamo riusciti a parlare col server (rete assente, timeout, o
        // risposta non valida): il dato NON è salvato ma la bozza è conservata.
        _riprovaAlRitornoRete = true;
        salvaDraftLocale();
        accodaTentativoFallito(error && error.message ? error.message : String(error));
        segnalaFallimento(
          '❌ <b>Chiusura NON salvata: il server non ha risposto.</b> ' +
          'Probabile assenza di rete.<br>I dati sono conservati su questo dispositivo e ' +
          'il salvataggio verrà ritentato appena torni online. Puoi anche ripremere “Salva”. ' +
          '<b>Non chiudere l\'app senza aver visto il messaggio verde di conferma.</b>',
          '❌ CHIUSURA NON SALVATA\n\nIl server non ha risposto (probabile assenza di rete).\n\n' +
          'I dati NON sono andati persi: restano su questo dispositivo e li ritrovi ' +
          'riaprendo questa pagina.\n\nRiprova fra poco, oppure avvisa Giuseppe.',
          automatico);
      }
    }
  