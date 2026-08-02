export class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

type RequestJsonOptions = RequestInit & {
  timeoutMs?: number;
};

export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const { timeoutMs = 15_000, signal: externalSignal, ...requestInit } = options;
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  try {
    const headers = new Headers(requestInit.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const response = await fetch(url, { ...requestInit, headers, signal: controller.signal });
    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!response.ok) {
      throw new HttpError(
        payload?.error_description || payload?.message || payload?.msg || payload?.error || `Request failed (${response.status})`,
        response.status,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (externalSignal?.aborted) throw error;
    if (controller.signal.aborted) throw new HttpError('The request timed out. Check your connection and try again.', 408);
    throw new HttpError(error instanceof Error ? error.message : 'The network request failed.');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export function shouldRetryRequest(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false;
  if (!(error instanceof HttpError)) return failureCount < 1;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}
