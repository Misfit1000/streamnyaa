/**
 * Reuse decoded JSON, not a storage snapshot. Always read the current raw value
 * so direct writes, backup imports, clears and other windows are observed on
 * the next call without wrapping the browser's Storage methods.
 *
 * Returned values are private working data. Clone the selected public result
 * before handing it to a caller, and never mutate this cached value on writes.
 */
export function createDesktopStoredJsonReader(key: string, maxLength?: number) {
  let previousStorage: Storage | undefined;
  let previousRaw: string | null | undefined;
  let previousValue: unknown;
  let previousError: unknown;

  return (): unknown => {
    const storage = window.localStorage;
    const raw = storage.getItem(key);
    if (maxLength != null && raw && raw.length > maxLength) {
      throw new RangeError('Desktop cache exceeds its existing storage limit.');
    }
    if (storage === previousStorage && raw === previousRaw) {
      if (previousError) throw previousError;
      return previousValue;
    }
    previousStorage = storage;
    previousRaw = raw;
    previousValue = undefined;
    previousError = undefined;
    try {
      previousValue = raw ? JSON.parse(raw) : null;
      return previousValue;
    } catch (error) {
      // An unchanged corrupt payload need not be reparsed, but repairing or
      // replacing it is still detected by the synchronous raw-value check.
      previousError = error;
      throw error;
    }
  };
}

/** Preserve the previous read API's object isolation without cloning the cache. */
export function cloneDesktopStoredJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  if (Array.isArray(value)) return value.map(cloneDesktopStoredJson) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDesktopStoredJson(item)])) as T;
  }
  return value;
}
