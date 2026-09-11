const pwaScriptUrl = document.currentScript?.src || new URL('js/pwa.js', location.href).href;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const scriptUrl = new URL('../sw.js', pwaScriptUrl);
    const scope = new URL('./', scriptUrl).pathname;
    navigator.serviceWorker.register(scriptUrl, {scope}).catch(() => {
      // GIFTO remains fully usable online if a browser declines service workers.
    });
  });
}
