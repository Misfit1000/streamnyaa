import { watchDeskReleases } from '../../src/lib/desktopWatchDesk';
import { it, expect } from 'vitest';
import { recentHomeQuery, validRecentSchedules } from '../../src/api/desktopRecentSchedule';
it('keeps distinct episodes and rejects duplicates, future releases and missing identity', () => { const e = { media: { id: 1, title: { english: 'Example' } }, episode: 2, airingAt: 90 }; expect(validRecentSchedules([e, e, { ...e, episode: 3 }, { ...e, airingAt: 101 }, { ...e, episode: 0 }, { ...e, media: { id: 0 } }], 100)).toEqual([e, { ...e, episode: 3 }]); });
it('includes only tracked releases, prefers loaded schedules and excludes malformed or past dates', () => {
    const bookmarks = [{ mal_id: 1, title: 'Tracked', nextAiringEpisode: { episode: 2, airingAt: 200 } }];
    const catalog = [{ mal_id: 1, title: 'Tracked', nextAiringEpisode: { episode: 3, airingAt: 300 } }, { mal_id: 2, title: 'Untracked', nextAiringEpisode: { episode: 4, airingAt: 400 } }];
    expect(watchDeskReleases(bookmarks, [], catalog, 100000)).toMatchObject([{ id: '1', episode: 3, airingAt: 300 }]);
    expect(watchDeskReleases(bookmarks, [], catalog, 500000)).toEqual([]);
});

it('requests airingAt on the schedule and never on Media (native HTTP 400 regression)', () => {
 const query=recentHomeQuery(12,1700000000);
 expect(query).toContain('airingAt_lesser: 1700000000');
 const media=query.slice(query.indexOf('media {'));
 expect(media).not.toMatch(/\bairingAt\b/);
 expect(media).toContain('episodes');
 expect(query.slice(0,query.indexOf('media {'))).toMatch(/\bairingAt\s+episode/);
 expect(recentHomeQuery(100,1700000000)).toContain('perPage: 50');
});
