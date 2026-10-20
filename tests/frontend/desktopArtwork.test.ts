import { describe, expect, it } from 'vitest';
import { desktopLandscapeImageCandidates, desktopPosterCandidates, desktopSpotlightArtworkCandidates, desktopSeriesArtwork } from '../../src/lib/desktopArtwork';

describe('desktop artwork candidates', () => {
  it('keeps provider roles and accepts supplemental artwork only for the verified MAL entry',()=>{
    const anime={mal_id:60059,title:'The Elusive Samurai Season 2',poster:'https://images.test/anilist.jpg',bannerImage:'https://images.test/banner.jpg'};
    const extra={mal_id:60059,images:{jpg:{large_image_url:'https://images.test/mal-large.jpg'}}};
    const art=desktopSeriesArtwork(anime,extra);expect(art.candidates).toContainEqual({url:extra.images.jpg.large_image_url,role:'poster'});
    expect(art.candidates).toContainEqual({url:anime.bannerImage,role:'banner'});
    expect(desktopSeriesArtwork(anime,{...extra,mal_id:1}).candidates.some(row=>row.url===extra.images.jpg.large_image_url)).toBe(false);
  });
  it('keeps the series poster first and preserves its role when also supplied as a banner', () => {
    const art = desktopSeriesArtwork({mal_id:1,title:'Series',poster:'https://images.test/portrait.jpg',bannerImage:'https://images.test/portrait.jpg'});
    expect(art.candidates).toEqual([{url:'https://images.test/portrait.jpg',role:'poster'}]);
  });
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
