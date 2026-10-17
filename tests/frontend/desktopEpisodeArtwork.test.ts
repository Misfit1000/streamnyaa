import { afterEach, describe, expect, it } from 'vitest';
import { episodeNumberFromTitle, resolveEpisodeArtwork } from '../../src/lib/desktopEpisodeArtwork';
import { readEpisodePage, saveEpisodePage } from '../../src/lib/desktopEpisodeCache';
afterEach(() => localStorage.clear());
const cover = 'https://images.example/cover.jpg', still = 'https://images.example/ep1.jpg';
describe('episode artwork identity and persistence', () => {
  it('accepts explicit episode markers and rejects arbitrary title numbers', () => {
    expect(episodeNumberFromTitle('Episode 7 - 24 Hours')).toBe(7);
    expect(episodeNumberFromTitle('Ep. 12: New day')).toBe(12);
    for (const title of ['24 Hours', '100 Years Ago', 'Season 2', '2nd Cour', '1986']) expect(episodeNumberFromTitle(title)).toBeNull();
  });
  it('keeps a valid thumbnail when a duplicate has no usable image', () => {
    const result = resolveEpisodeArtwork({ banner_image: cover, streamingEpisodes: [{ title: 'Episode 1', thumbnail: still }, { title: 'Episode 1', thumbnail: '' }] });
    expect(result.forEpisode(1).candidates).toEqual([still, cover]);
    expect(result.forEpisode(2)).toMatchObject({ candidates: [cover], specific: false, label: 'Series artwork' });
  });
  it('matches a unique known episode title but never ambiguous titles or list indices', () => {
    const anime = { streamingEpisodes: [{ title: 'A new day', thumbnail: still }, { title: '100 Years Ago', thumbnail: still }] };
    expect(resolveEpisodeArtwork(anime, [{ mal_id: 3, title: 'A new day' }]).forEpisode(3).specific).toBe(true);
    expect(resolveEpisodeArtwork(anime, [{ mal_id: 3, title: 'A new day' }, { mal_id: 7, title: 'A new day' }]).forEpisode(3).specific).toBe(false);
    expect(resolveEpisodeArtwork(anime).forEpisode(100).specific).toBe(false);
    expect(resolveEpisodeArtwork({}).forEpisode(3).specific).toBe(false);
  });
  it('hides specific artwork and rejects credential-bearing or unsafe URLs', () => {
    const result = resolveEpisodeArtwork({ banner_image: cover, streamingEpisodes: [{ title: 'Episode 1', thumbnail: still }, { title: 'Episode 2', thumbnail: 'https://secret@images.example/a.jpg' }] });
    expect(result.forEpisode(1, true)).toMatchObject({ candidates: [cover], specific: false, label: 'Series artwork · spoilers hidden' });
    expect(result.forEpisode(2).candidates).toEqual([cover]);
  });
  it('preserves image provenance and original image time through a title-only refresh', () => {
    const at = Date.now() - 1000;
    saveEpisodePage('1', 1, { data: [{ mal_id: 1, title: 'First', thumbnail: still, artworkProvider: 'anilist' }], pagination: { last_visible_page: 1 } }, at);
    saveEpisodePage('1', 1, { data: [{ mal_id: 1, title: 'Revised' }], pagination: { last_visible_page: 1 } });
    expect(readEpisodePage('1', 1)?.data[0]).toMatchObject({ title: 'Revised', image: still, thumbnail: still, artworkProvider: 'anilist', imageFetchedAt: at });
    expect(readEpisodePage('2', 1)).toBeUndefined();
  });
});
