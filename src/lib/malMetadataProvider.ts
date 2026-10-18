/** Public catalogue transport; MAL identities and account OAuth remain unchanged. */
export const MAL_METADATA_PROVIDER = 'tenrai' as const;
export const MAL_METADATA_BASE_URL = 'https://api.tenrai.org/v1';
export const MAL_METADATA_ADAPTER_VERSION = 1;

export function supportedMalMetadataPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\\\s#]/.test(value)
    || !value.startsWith('/') || value.includes('..') || value.includes('://')) return null;
  const url = new URL(value, MAL_METADATA_BASE_URL);
  if (url.origin !== 'https://api.tenrai.org' || /%2f|%5c|%2e/i.test(url.pathname)) return null;
  const supported = /^\/anime(?:\/[1-9]\d*(?:\/(?:full|characters|news|episodes(?:\/[1-9]\d*)?))?)?$/.test(url.pathname)
    || /^\/top\/anime$/.test(url.pathname)
    || /^\/seasons\/(?:now|upcoming|\d{4}\/(?:winter|spring|summer|fall))$/.test(url.pathname)
    || url.pathname === '/schedules';
  return supported ? `${url.pathname}${url.search}` : null;
}
