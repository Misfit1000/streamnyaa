import type { Anime } from '../types';
import type { AudioPreference } from '../../../shared/preferences';
import { buildSourceQuery } from '../../../shared/sources';

function cleanTitle(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function sourceTitleCandidates(anime: Pick<Anime, 'title' | 'titles'>) {
  const values = [anime.titles?.romaji, anime.title, anime.titles?.english, anime.titles?.native]
    .map(cleanTitle)
    .filter((value) => value.length >= 2);
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.normalize('NFKC').toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sourceQueriesForAnime(anime: Pick<Anime, 'title' | 'titles'>, episode: number, audio: AudioPreference) {
  return sourceTitleCandidates(anime).flatMap((title) => {
    const preferred = buildSourceQuery(title, episode, audio);
    return audio === 'dual-preferred' ? [preferred, buildSourceQuery(title, episode, 'sub-preferred')] : [preferred];
  });
}
