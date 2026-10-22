declare const __STREAMNYAA_WEB_BUILD__: string;
export function recoverChunkError(reload = () => window.location.reload()) {
  if (navigator.onLine === false) return false;
  const editing = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')).some(input =>
    input.type !== 'hidden' && input.type !== 'checkbox' && input.value !== input.defaultValue);
  if (editing || document.querySelector('[data-pending-edit="true"]')) return false;
  try {
    const key = `streamnyaa.chunk-recovery:${typeof __STREAMNYAA_WEB_BUILD__ === 'undefined' ? 'test' : __STREAMNYAA_WEB_BUILD__}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, 'attempted');
    reload(); return true;
  } catch { return false; }
}
export function installWebStartupRecovery() {
  const failed = (event: Event) => { if (recoverChunkError()) event.preventDefault(); };
  window.addEventListener('vite:preloadError', failed);
  return () => window.removeEventListener('vite:preloadError', failed);
}
