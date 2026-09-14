import { afterEach, describe, expect, it } from 'vitest';
import {
  DESKTOP_SCHEDULE_REMINDERS_KEY,
  DESKTOP_UPCOMING_WATCHES_KEY,
  readDesktopScheduleReminders,
  readDesktopUpcomingAnimeWatches,
  resolveDesktopUpcomingAnimeWatches,
  toggleDesktopUpcomingAnimeWatch,
} from '../../src/lib/desktopReminders';

describe('desktop upcoming anime reminders', () => {
  afterEach(() => window.localStorage.clear());

  it('resolves a watched upcoming anime into a zero-offset airing reminder', () => {
    window.localStorage.setItem(DESKTOP_UPCOMING_WATCHES_KEY, JSON.stringify([{
      id: 'upcoming:154587',
      animeId: '154587',
      anilistId: '154587',
      malId: '52991',
      title: 'Frieren',
      createdAt: 100,
    }]));

    expect(resolveDesktopUpcomingAnimeWatches([{
      anilist_id: 154587,
      mal_id: 52991,
      title: 'Frieren',
      airingEpisode: 1,
      airingAt: 1_800_000_000,
    }])).toBe(1);

    expect(readDesktopUpcomingAnimeWatches()[0].airingAt).toBe(1_800_000_000_000);
    expect(readDesktopScheduleReminders()[0]).toMatchObject({
      id: 'upcoming:154587:airing',
      reminderOffsetMinutes: 0,
      episode: 1,
    });
  });

  it('cancels the linked airing reminder when notification is turned off', async () => {
    window.localStorage.setItem(DESKTOP_UPCOMING_WATCHES_KEY, JSON.stringify([{
      id: 'upcoming:154587',
      animeId: '154587',
      title: 'Frieren',
      createdAt: 100,
      airingAt: 1_800_000_000_000,
      episode: 1,
    }]));
    window.localStorage.setItem(DESKTOP_SCHEDULE_REMINDERS_KEY, JSON.stringify([{
      id: 'upcoming:154587:airing',
      animeId: '154587',
      title: 'Frieren',
      episode: 1,
      airingAt: 1_800_000_000_000,
      reminderOffsetMinutes: 0,
      createdAt: 100,
      delivery: 'system',
    }]));

    const result = await toggleDesktopUpcomingAnimeWatch({ id: 154587, title: 'Frieren' });

    expect(result.removed).toBe(true);
    expect(readDesktopUpcomingAnimeWatches()).toEqual([]);
    expect(readDesktopScheduleReminders()).toEqual([]);
  });
});
