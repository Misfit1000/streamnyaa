import { ANILIST_URL } from '../config';
import type { Anime, ScheduleEntry } from '../types';

type Variables = Record<string, string | number | boolean | null | undefined>;

async function graphQL<T>(query: string, variables: Variables = {}): Promise<T> {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `AniList request failed (${response.status})`);
  }
  return payload.data as T;
}

const MEDIA_FIELDS = `
  id idMal title { romaji english native } description(asHtml: false)
  coverImage { extraLarge large color } bannerImage averageScore popularity
  type episodes chapters volumes duration format status season seasonYear genres isAdult source countryOfOrigin
  studios(isMain: true) { nodes { name } }
  trailer { id site }
  nextAiringEpisode { episode airingAt }
`;

function mapMedia(media: any): Anime {
  return {
    id: media.id,
    mediaType: media.type,
    malId: media.idMal,
    title: media.title?.english || media.title?.romaji || media.title?.native || 'Untitled anime',
    titles: media.title,
    description: String(media.description || '').replace(/<[^>]*>/g, '').trim(),
    cover: media.coverImage?.extraLarge || media.coverImage?.large,
    banner: media.bannerImage,
    color: media.coverImage?.color,
    score: media.averageScore ? media.averageScore / 10 : undefined,
    popularity: media.popularity,
    episodes: media.episodes,
    chapters: media.chapters,
    volumes: media.volumes,
    duration: media.duration,
    format: media.format,
    status: media.status,
    season: media.season,
    year: media.seasonYear,
    source: media.source,
    countryOfOrigin: media.countryOfOrigin,
    genres: media.genres || [],
    studios: media.studios?.nodes?.map((studio: any) => studio.name) || [],
    isAdult: Boolean(media.isAdult),
    trailerId: media.trailer?.site === 'youtube' ? media.trailer.id : undefined,
    nextAiringEpisode: media.nextAiringEpisode || null,
  };
}

export async function fetchHomeFeed(includeAdult = false) {
  const data = await graphQL<any>(`
    query Home($adult: Boolean) {
      trending: Page(page: 1, perPage: 16) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
      }
      popular: Page(page: 1, perPage: 16) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
      }
      airing: Page(page: 1, perPage: 16) {
        media(type: ANIME, status: RELEASING, sort: SCORE_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
      }
      upcoming: Page(page: 1, perPage: 16) {
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
      }
    }
  `, { adult: includeAdult });
  return {
    trending: data.trending.media.map(mapMedia),
    popular: data.popular.media.map(mapMedia),
    airing: data.airing.media.map(mapMedia),
    upcoming: data.upcoming.media.map(mapMedia),
  };
}

export type AnimeSearchFilters = {
  query?: string;
  page?: number;
  format?: string;
  status?: string;
  genre?: string;
  season?: string;
  year?: number;
  mediaType?: 'ANIME' | 'MANGA';
  sort?: 'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC' | 'START_DATE_DESC';
  includeAdult?: boolean;
};

export async function searchMedia(filters: AnimeSearchFilters) {
  const data = await graphQL<any>(`
    query Search($page: Int, $search: String, $type: MediaType, $format: MediaFormat, $status: MediaStatus, $genre: String, $season: MediaSeason, $year: Int, $sort: [MediaSort], $adult: Boolean) {
      Page(page: $page, perPage: 30) {
        pageInfo { currentPage hasNextPage lastPage }
        media(type: $type, search: $search, format: $format, status: $status, genre: $genre, season: $season, seasonYear: $year, sort: $sort, isAdult: $adult) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `, {
    page: filters.page || 1,
    type: filters.mediaType || 'ANIME',
    search: filters.query || undefined,
    format: filters.format || undefined,
    status: filters.status || undefined,
    genre: filters.genre || undefined,
    season: filters.season || undefined,
    year: filters.year || undefined,
    sort: filters.sort || 'TRENDING_DESC',
    adult: Boolean(filters.includeAdult),
  });
  return { items: data.Page.media.map(mapMedia), pageInfo: data.Page.pageInfo };
}

export async function searchAnime(filters: AnimeSearchFilters) {
  return searchMedia({ ...filters, mediaType: 'ANIME' });
}

export async function fetchAnimeDetails(id: number) {
  const data = await graphQL<any>(`
    query Details($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        relations { edges { relationType node { ${MEDIA_FIELDS} } } }
        recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ${MEDIA_FIELDS} } } }
      }
    }
  `, { id });
  const anime = mapMedia(data.Media);
  anime.relations = (data.Media.relations?.edges || []).map((edge: any) => ({
    ...mapMedia(edge.node),
    format: edge.relationType || edge.node.format,
  }));
  anime.recommendations = (data.Media.recommendations?.nodes || [])
    .map((node: any) => node.mediaRecommendation)
    .filter(Boolean)
    .map(mapMedia);
  return anime;
}

export async function fetchMangaDetails(id: number) {
  const data = await graphQL<any>(`
    query MangaDetails($id: Int!) {
      Media(id: $id, type: MANGA) {
        ${MEDIA_FIELDS}
        relations { edges { relationType node { ${MEDIA_FIELDS} } } }
        recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ${MEDIA_FIELDS} } } }
      }
    }
  `, { id });
  const manga = mapMedia(data.Media);
  manga.relations = (data.Media.relations?.edges || []).map((edge: any) => ({
    ...mapMedia(edge.node),
    format: edge.relationType || edge.node.format,
  }));
  manga.recommendations = (data.Media.recommendations?.nodes || [])
    .map((node: any) => node.mediaRecommendation)
    .filter(Boolean)
    .map(mapMedia);
  return manga;
}

export async function fetchSchedule(startSeconds: number, endSeconds: number) {
  const data = await graphQL<any>(`
    query Schedule($start: Int!, $end: Int!) {
      Page(page: 1, perPage: 50) {
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          episode airingAt media { ${MEDIA_FIELDS} }
        }
      }
    }
  `, { start: startSeconds, end: endSeconds });
  return data.Page.airingSchedules.map((entry: any): ScheduleEntry => ({
    episode: entry.episode,
    airingAt: entry.airingAt,
    anime: mapMedia(entry.media),
  }));
}

export async function fetchGenres() {
  const data = await graphQL<{ GenreCollection: string[] }>('query { GenreCollection }');
  return data.GenreCollection;
}

export async function searchCompare(query: string) {
  if (!query.trim()) return [];
  const result = await searchAnime({ query, sort: 'POPULARITY_DESC' });
  return result.items.slice(0, 8);
}
