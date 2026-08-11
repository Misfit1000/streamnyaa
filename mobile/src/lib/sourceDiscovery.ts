import type { Anime } from '../types';
import type { AudioPreference } from '../../../shared/preferences';
import { buildSourceQuery } from '../../../shared/sources';

function cleanTitle(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const ROMAN_SEASONS: Record<string, number> = {
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
};

function searchableTitleAliases(value: string) {
  const aliases = [value];
  const colonBase = value.split(':')[0]?.trim();
  if (colonBase && colonBase !== value) aliases.push(colonBase);

  const numericSeason = value.match(/\b(?:season|s)[ ._-]*0?(\d{1,2})\b/i);
  if (numericSeason) {
    aliases.push(value.replace(numericSeason[0], `S${Number(numericSeason[1])}`));
    const franchise = (colonBase || value)
      .replace(/\b(?:season|s)[ ._-]*0?\d{1,2}\b/i, '')
      .trim();
    if (franchise) aliases.push(`${franchise} S${Number(numericSeason[1])}`);
  }

  const ordinalSeason = value.match(/\b(\d{1,2})(?:st|nd|rd|th)[ ._-]+season\b/i);
  if (ordinalSeason) {
    const season = Number(ordinalSeason[1]);
    aliases.push(value.replace(ordinalSeason[0], `S${season}`));
    const franchise = (colonBase || value).replace(ordinalSeason[0], '').trim();
    if (franchise) aliases.push(`${franchise} S${season}`);
  }

  const romanSeason = (colonBase || value).match(/\b(II|III|IV|V|VI)$/i);
  if (romanSeason) {
    const season = ROMAN_SEASONS[romanSeason[1]!.toUpperCase()];
    const franchise = (colonBase || value).slice(0, romanSeason.index).trim();
    if (season && franchise) aliases.push(`${franchise} S${season}`);
  }

  return aliases.map(cleanTitle).filter(Boolean);
}

export function sourceTitleCandidates(anime: Pick<Anime, 'title' | 'titles'>) {
  // The display title is normally English and most closely matches what the
  // user selected. Search it before provider-specific romaji/native aliases.
  const values = [anime.title, anime.titles?.english, anime.titles?.romaji, anime.titles?.native]
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
  const seen = new Set<string>();
  const titleAliases = sourceTitleCandidates(anime).flatMap(searchableTitleAliases);
  const audioPasses: AudioPreference[] = audio === 'dual-preferred'
    ? ['dual-preferred', 'sub-preferred']
    : [audio];

  // Keep the preferred and safe fallback searches adjacent for each title.
  // With the user-facing title first, the mobile fast path covers English
  // dual-audio and sub releases before moving to provider aliases.
  return titleAliases.flatMap((title) => audioPasses.flatMap((pass) => {
    const query = buildSourceQuery(title, episode, pass);
    return [query].filter(() => {
      const key = query.normalize('NFKC').toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }));
}
