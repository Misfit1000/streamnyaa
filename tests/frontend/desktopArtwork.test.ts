import { describe, expect, it } from 'vitest';
import { desktopLandscapeImageCandidates, desktopPosterCandidates, desktopSpotlightArtworkCandidates } from '../../src/lib/desktopArtwork';

describe('desktop artwork candidates', () => {
  it('tries high-resolution artwork before known thumbnail variants', () => {
    expect(desktopLandscapeImageCandidates([
      'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      'https://image.tmdb.org/t/p/w300/test.jpg',
    ])).toEqual([
      'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg',
      'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      'https://image.tmdb.org/t/p/w1280/test.jpg',
      'https://image.tmdb.org/t/p/w300/test.jpg',
    ]);
  });

  it('rejects background prose and unsafe artwork URLs', () => {
    expect(desktopLandscapeImageCandidates([
      'An anime based on a manga.', 'file:///private/image.png',
      'https://name:password@example.com/image.png',
      'https://images.example/wide.jpg', 'https://images.example/wide.jpg',
    ])).toEqual(['https://images.example/wide.jpg']);
  });
  it('keeps portrait sources ahead of fallback artwork and removes duplicates', () => {
    const candidates = desktopPosterCandidates({
      anilist_id: 154587,
      coverImage: { extraLarge: 'https://images.example/frieren-poster.webp' },
      images: { jpg: { large_image_url: 'https://images.example/frieren-poster.webp' } },
    });

    expect(candidates).toEqual([
      'https://images.example/frieren-poster.webp',
    ]);
  });

  it('does not use AniList social-card endpoints as portrait covers', () => {
    expect(desktopPosterCandidates({ anilist_id: 154587 })).toEqual([]);
  });

  it('does not treat a generic or MAL id as an AniList image id', () => {
    expect(desktopPosterCandidates({ id: 28977, mal_id: 28977 })).toEqual([]);
  });

  it('never stretches banner artwork into a poster card', () => {
    const anime = {
      anilist_id: 20996,
      banner_image: 'https://images.example/banner/gintama.webp',
      images: { webp: { image_url: 'https://images.example/gintama-poster.webp' } },
    };

    expect(desktopPosterCandidates(anime)).not.toContain(anime.banner_image);
    expect(desktopSpotlightArtworkCandidates(anime)[0]).toBe(anime.banner_image);
  });
});
