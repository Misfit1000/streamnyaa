import type { Anime, RootStackParamList } from '../types';

export function animeRouteParams(anime: Anime): RootStackParamList['Anime'] {
  return {
    animeId: anime.anilistId || anime.id,
    anilistId: anime.anilistId,
    malId: anime.malId,
    kitsuId: anime.kitsuId,
    title: anime.title,
  };
}

export function mangaRouteParams(manga: Anime): RootStackParamList['Manga'] {
  return {
    mangaId: manga.anilistId || manga.id,
    anilistId: manga.anilistId,
    malId: manga.malId,
    kitsuId: manga.kitsuId,
    title: manga.title,
  };
}

export function watchRouteParams(anime: Anime, episode = 1): RootStackParamList['Watch'] {
  return { anime, episode, autoPlay: true };
}
