import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchNyaa } from '../../src/api/nyaa';

afterEach(() => {
  delete window.__TAURI__;
  delete window.__STREAMNYAA_DESKTOP__;
  vi.restoreAllMocks();
});

describe('desktop source request coordination', () => {
  it('rejects an aborted request instead of reporting a valid empty result', async () => {
    let resolveBridge: ((value: unknown) => void) | undefined;
    const invoke = vi.fn(() => new Promise((resolve) => {
      resolveBridge = resolve;
    }));
    window.__STREAMNYAA_DESKTOP__ = true;
    window.__TAURI__ = { core: { invoke } };
    const controller = new AbortController();

    const request = searchNyaa('StreamNyaa Abort Fixture 01', '1_2', '0', '1', {
      deep: false,
      pages: 1,
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ provider: 'nyaa', code: 'cancelled' });
    expect(invoke).toHaveBeenCalledTimes(1);
    resolveBridge?.({ data: [], fetched_at: Date.now() });
  });

  it('does not leave a failed native source request pending', async () => {
    window.__STREAMNYAA_DESKTOP__ = true;
    window.__TAURI__ = { core: { invoke: vi.fn(() => Promise.reject(new Error('native provider unavailable'))) } };

    const request = searchNyaa('StreamNyaa Rejection Fixture 02', '1_2', '0', '1', {
      deep: false,
      pages: 1,
      signal: new AbortController().signal,
    });

    await expect(request).rejects.toThrow(/native provider unavailable/i);
  });
});
