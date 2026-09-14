import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchNyaa } from '../../src/api/nyaa';
import { desktopDataError } from '../../src/lib/desktopData';
import {
  episodeRangeContains,
  isEpisodeInteractiveTarget,
  isIntentionalHorizontalDrag,
} from '../../src/lib/desktopEpisodeInteraction';

describe('desktop primary-path reliability', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T00:00:00Z'));
    window.__STREAMNYAA_DESKTOP__ = true;
  });

  afterEach(() => {
    delete window.__TAURI__;
    delete window.__STREAMNYAA_DESKTOP__;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects an invalid provider response instead of reporting a valid empty result', async () => {
    window.__TAURI__ = { core: { invoke: vi.fn().mockResolvedValue({ data: { invalid: true }, fetched_at: Date.now() }) } };
    await expect(searchNyaa('Invalid Provider Fixture 03', '1_2', '0', '1', { deep: false }))
      .rejects.toMatchObject({ provider: 'nyaa', code: 'invalid' });
  });

  it('keeps verified source data available through a temporary provider failure', async () => {
    const source = {
      title: '[Group] Reliability Fixture - 01 [1080p]',
      link: 'https://nyaa.si/view/1',
      infoHash: '0123456789abcdef0123456789abcdef01234567',
      size: '800 MiB',
      seeders: '12',
      leechers: '1',
      category: 'Anime - English-translated',
      categoryId: '1_2',
      pubDate: '2026-08-21T00:00:00Z',
    };
    const invoke = vi.fn().mockResolvedValueOnce({ data: [source], fetched_at: Date.now(), cache_status: 'network' });
    window.__TAURI__ = { core: { invoke } };

    await expect(searchNyaa('Reliability Fixture 01', '1_2', '0', '1', { deep: false })).resolves.toHaveLength(1);
    vi.advanceTimersByTime(21 * 60 * 1000);
    invoke.mockRejectedValueOnce(new Error('temporary connection reset'));
    await expect(searchNyaa('Reliability Fixture 01', '1_2', '0', '1', { deep: false })).resolves.toHaveLength(1);
  });

  it('classifies offline and timeout failures without losing their retryability', () => {
    expect(desktopDataError('jikan', new Error('request timed out'))).toMatchObject({ code: 'timeout', retryable: true });
  });
});

describe('desktop episode interaction', () => {
  it('recognizes requested episodes inside batch ranges', () => {
    expect(episodeRangeContains('[Group] Example 01-12 1080p Batch', 2)).toBe(true);
    expect(episodeRangeContains('[Group] Example 01-12 1080p Batch', 13)).toBe(false);
  });

  it('does not turn small or vertical movement into a rail drag', () => {
    expect(isIntentionalHorizontalDrag(8, 1, 12)).toBe(false);
    expect(isIntentionalHorizontalDrag(15, 14, 12)).toBe(false);
    expect(isIntentionalHorizontalDrag(18, 2, 12)).toBe(true);
  });

  it('keeps interactive episode controls outside the rail drag gesture', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    expect(isEpisodeInteractiveTarget(icon)).toBe(true);
    expect(isEpisodeInteractiveTarget(document.createElement('div'))).toBe(false);
  });
});
