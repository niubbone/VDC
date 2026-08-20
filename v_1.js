
  const RELOAD_KEY = 'sw_reloading';
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => {
        setInterval(() => reg.update(), 60000);
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            // ⭐ Non ricaricare se ci sono modifiche non salvate: il draft resta in
            // localStorage e verrà ripristinato al prossimo giro comunque, ma evitiamo
            // di interrompere l'utente mentre sta compilando la chiusura.
            if (newSW.state === 'activated' && !formDirty && !sessionStorage.getItem(RELOAD_KEY)) {
              sessionStorage.setItem(RELOAD_KEY, 'true');
              setTimeout(() => window.location.reload(), 500);
            }
          });
        });
      })
      .catch(err => console.log('❌ SW:', err));

    let reloadTriggered = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadTriggered && !formDirty && !sessionStorage.getItem(RELOAD_KEY)) {
        reloadTriggered = true;
        sessionStorage.setItem(RELOAD_KEY, 'true');
        setTimeout(() => window.location.reload(), 500);
      }
    });

    window.addEventListener('load', () => {
      setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 2000);
    });
  }
  