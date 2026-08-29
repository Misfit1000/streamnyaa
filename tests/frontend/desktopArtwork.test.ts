import { describe, expect, it } from 'vitest';
import { desktopPosterCandidates, desktopSpotlightArtworkCandidates } from '../../src/lib/desktopArtwork';

describe('desktop artwork candidates', () => {
  it('keeps portrait sources ahead of fallback artwork and removes duplicates', () => {
    const candidates = desktopPosterCandidates({
      anilist_id: 154587,
      coverImage: { extraLarge: 'https://images.example/frieren-poster.webp' },
      images: { jpg: { large_image_url: 'https://images.example/frieren-poster.webp' } },
    });

    expect(candidates).toEqual([
      'https://images.example/frieren-poster.webp',
      'https://img.anili.st/media/154587',
    ]);
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
