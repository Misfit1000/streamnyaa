import { describe, it, expect, vi } from 'vitest';
import { loadSeriesTimeline, type TimelineResult } from '../../src/lib/desktopSeriesTimeline';
const node = (id: number, children: any[] = []) => ({ anilist_id: id, mal_id: id + 1000, title: 'Season ' + id, children });
const options = (root: any) => ({ root, children: (item: any) => item.children || [], allowed: () => true, signal: new AbortController().signal, onPartial: vi.fn() });
describe('complete series timeline', () => {
  it('keeps partial entries and retries the exact failed batch', async () => {
    const sequel = node(2, [node(3)]);
    let fail = true;
    const fetchBatch = vi.fn(async (entries: any[]) => {
      if (entries[0].anilist_id === 3 && fail) throw { code: 'rate-limited', retryAfterMs: 60000 };
      return entries.map(e => e.anilist_id === 2 ? sequel : e);
    });
    const config = options(node(1, [node(2)]));
    const partial = await loadSeriesTimeline({ ...config, fetchBatch });
    expect(partial.items.map(e => e.anilist_id)).toEqual([2]);
    expect(partial.complete).toBe(false);
    expect(partial.retryAfterMs).toBe(60000);
    fail = false;
    const complete = await loadSeriesTimeline({ ...config, fetchBatch, previous: partial });
    expect(complete.items.map(e => e.anilist_id)).toEqual([2, 3]);
    expect(complete.complete).toBe(true);
    expect(fetchBatch.mock.calls.map(([entries]) => entries[0].anilist_id)).toEqual([2, 3, 3]);
  });
  it('continues long series across passes instead of truncating them', async () => {
    const entries = Array.from({ length: 101 }, (_, i) => node(i + 1));
    entries.forEach((entry, i) => entry.children = entries[i + 1] ? [entries[i + 1]] : []);
    let result: TimelineResult | undefined;
    const fetchBatch = vi.fn(async (batch: any[]) => batch);
    for (let pass = 0; pass < 20 && !result?.complete; pass++) result = await loadSeriesTimeline({ ...options(entries[0]), fetchBatch, previous: result });
    expect(result?.complete).toBe(true);
    expect(result?.items).toHaveLength(100);
    expect(new Set(fetchBatch.mock.calls.flatMap(([items]) => items.map(e => e.anilist_id))).size).toBe(100);
  });
  it('resolves MAL-only entries without treating MAL and AniList ids as interchangeable', async () => {
    const result = await loadSeriesTimeline({ ...options(node(1, [{ mal_id: 2222 }])), fetchBatch: async () => [node(1222)] });
    expect(result.complete).toBe(true);
    expect(result.items[0]).toMatchObject({ anilist_id: 1222, mal_id: 2222 });
  });
  it('does not repeat cyclic or cross-linked relations', async () => {
    const root = node(1), a = node(2), b = node(3);
    root.children = [a, b]; a.children = [root, b]; b.children = [a];
    const fetchBatch = vi.fn(async (entries: any[]) => entries);
    const result = await loadSeriesTimeline({ ...options(root), fetchBatch });
    expect(result.items).toHaveLength(2);
    expect(result.complete).toBe(true);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });
  it('retains verified entries on missing data and discovers new seasons after a completed refresh', async () => {
    const config = options(node(1, [node(2)]));
    const complete = await loadSeriesTimeline({ ...config, fetchBatch: async e => e });
    const missing = await loadSeriesTimeline({ ...config, previous: complete, fetchBatch: async () => [] });
    expect(missing.complete).toBe(false); expect(missing.items).toHaveLength(1);
    const refreshed = await loadSeriesTimeline({ ...config, previous: complete, fetchBatch: async e => e.map(item => item.anilist_id === 2 ? node(2, [node(3)]) : item) });
    expect(refreshed.items).toHaveLength(2);
  });
  it('rejects cancelled generations without publishing them', async () => {
    const controller = new AbortController(), onPartial = vi.fn();
    await expect(loadSeriesTimeline({ ...options(node(1, [node(2)])), signal: controller.signal, onPartial,
      fetchBatch: async entries => { controller.abort(); return entries; } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(onPartial).not.toHaveBeenCalled();
  });
});
