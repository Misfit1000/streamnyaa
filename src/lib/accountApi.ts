const ACCOUNT_API_ORIGIN = 'https://www.streamnyaa.xyz';

function isDesktopRuntime() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__STREAMNYAA_DESKTOP__ || window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export function accountApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return isDesktopRuntime() ? `${ACCOUNT_API_ORIGIN}${normalizedPath}` : normalizedPath;
}

export function accountApiFetch(path: string, options?: RequestInit) {
  return fetch(accountApiUrl(path), options);
}
