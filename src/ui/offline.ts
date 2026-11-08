/**
 * Registers the service worker that vite.config.ts generates at build time
 * (precache of every emitted file, cache-first), so the site loads and renders
 * offline after the first visit. Call in production builds only: the dev
 * server has no sw.js.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const register = (): void => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.warn('Offline support is unavailable:', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
