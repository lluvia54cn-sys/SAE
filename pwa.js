(() => {
  'use strict';

  if (window.location.protocol === 'file:' || !('serviceWorker' in navigator)) return;

  const notice = document.querySelector('#update-notice');
  const updateButton = document.querySelector('#update-app');
  let waitingWorker = null;
  let updateRequested = false;
  let registration = null;

  function offerUpdate(worker) {
    waitingWorker = worker;
    notice.classList.remove('is-hidden');
  }

  function watchInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  }

  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./service-worker.js', {
        scope: './',
        updateViaCache: 'none'
      });

      if (registration.waiting) offerUpdate(registration.waiting);
      watchInstallingWorker(registration.installing);

      registration.addEventListener('updatefound', () => {
        watchInstallingWorker(registration.installing);
      });

      registration.update().catch(() => {});
    } catch (error) {
      console.warn('SAE no pudo activar las funciones PWA.', error);
    }
  });

  updateButton.addEventListener('click', () => {
    if (!waitingWorker) return;
    updateRequested = true;
    updateButton.disabled = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration?.update().catch(() => {});
  });
})();
