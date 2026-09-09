declare global {
  interface Window {
    __ratioMapReady?: () => void;
    gm_authFailure?: () => void;
  }
}
let pending: Promise<void> | null = null;
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 15000);
    const cleanup = () => {
      clearTimeout(timer);
      delete window.__ratioMapReady;
    };
    const fail = () => {
      cleanup();
      script.remove();
      pending = null;
      reject(new Error('La carte n’a pas pu être chargée. La liste reste disponible.'));
    };
    window.__ratioMapReady = () => {
      cleanup();
      resolve();
    };
    window.gm_authFailure = () => {
      window.dispatchEvent(new Event('ratiomap:map-error'));
      fail();
    };
    const params = new URLSearchParams({
      key: apiKey,
      libraries: 'places,marker',
      language: 'fr',
      v: 'quarterly',
      loading: 'async',
      callback: '__ratioMapReady',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
