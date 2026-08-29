import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchNyaa } from '../../src/api/nyaa';

afterEach(() => {
  delete window.__TAURI__;
  delete window.__STREAMNYAA_DESKTOP__;
  vi.restoreAllMocks();
});

describe('desktop source request coordination', () => {
  it('returns immediately when a stale source request is aborted', async () => {
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

    await expect(request).resolves.toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
    resolveBridge?.({ data: [], fetched_at: Date.now() });
  });
});
