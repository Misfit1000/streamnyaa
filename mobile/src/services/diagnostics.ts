import { ANILIST_URL, API_ORIGIN } from '../config';
import { requestJson } from '../lib/network';

export type ConnectionDiagnostic = {
  id: 'metadata' | 'sources' | 'account';
  label: string;
  ok: boolean;
  latencyMs: number;
  message: string;
};

async function measure(id: ConnectionDiagnostic['id'], label: string, request: () => Promise<unknown>): Promise<ConnectionDiagnostic> {
  const startedAt = Date.now();
  try {
    await request();
    const latencyMs = Date.now() - startedAt;
    return { id, label, ok: true, latencyMs, message: `${latencyMs} ms` };
  } catch (error) {
    return {
      id,
      label,
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export async function runConnectionDiagnostics() {
  return Promise.all([
    measure('metadata', 'Anime metadata', () => requestJson(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query { GenreCollection }' }),
      timeoutMs: 7_000,
    })),
    measure('sources', 'Streaming sources', () => requestJson(`${API_ORIGIN}/api/nyaa?q=${encodeURIComponent('One Piece 01')}&c=1_2&f=0&p=1&deep=0&pages=1&wide=0`, { timeoutMs: 10_000 })),
    measure('account', 'Account service', () => requestJson(`${API_ORIGIN}/api/auth/config`, { timeoutMs: 7_000 })),
  ]);
}
